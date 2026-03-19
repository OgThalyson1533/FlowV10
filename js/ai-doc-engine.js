// ============================================================
//  ProjectFlow V7 — js/ai-doc-engine.js
//  SPRINT 1: AI Doc Engine
//  Motor de geração automática de documentação via Claude API
//  Prompt chaining em 4 chains sequenciais
// ============================================================
'use strict';

// Helper local (main.js exporta window._safeEsc, mas garantimos fallback)
function _esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ════════════════════════════════════════════════════════════
//  CONFIG
// ════════════════════════════════════════════════════════════
const AI_MODEL   = 'claude-sonnet-4-20250514';
const AI_TOKENS  = 1800;
const AI_API_URL = 'https://api.anthropic.com/v1/messages';

// ════════════════════════════════════════════════════════════
//  SNAPSHOT STORE — persistência localStorage
// ════════════════════════════════════════════════════════════
const AIDocStore = {
  _key: 'pf_ai_snapshots_v1',

  load()       { try { return JSON.parse(localStorage.getItem(this._key) || '{}'); } catch { return {}; } },
  save(d)      { try { localStorage.setItem(this._key, JSON.stringify(d)); } catch(e) { console.warn('AIDocStore quota:', e); } },

  getAll(pid)  { return this.load()[pid] || []; },

  add(pid, snap) {
    const d = this.load();
    if (!d[pid]) d[pid] = [];
    d[pid].unshift(snap);           // mais recente primeiro
    if (d[pid].length > 10) d[pid] = d[pid].slice(0, 10); // max 10 versões
    this.save(d);
    return snap;
  },

  latest(pid)  { return (this.load()[pid] || [])[0] || null; },
  clear(pid)   { const d = this.load(); delete d[pid]; this.save(d); },
};
window.AIDocStore = AIDocStore;

// ════════════════════════════════════════════════════════════
//  CONTEXT ASSEMBLER
//  Agrupa todos os dados do projeto em payload estruturado
// ════════════════════════════════════════════════════════════
function _assembleContext(projectId) {
  const proj  = (window.mockProjects || []).find(p => p.id === projectId) || { id: projectId, name: projectId };
  const cards = (window.mockCards   || []).filter(c => c.sl === projectId || c.project_id === projectId);
  const team  = window.mockTeam || [];

  // Agrupa tarefas por coluna/BPMN
  const byCol = {};
  (window.PFBoard?.columns?.length ? window.PFBoard.columns : [
    { id:'col-todo', name:'Planejado' }, { id:'col-plan', name:'Prioridade' },
    { id:'col-exec', name:'Em Execução' }, { id:'col-rev', name:'Em Revisão' },
    { id:'col-done', name:'Concluído' },
  ]).forEach(col => {
    byCol[col.name] = cards.filter(c => {
      const lm = { 'col-todo':'todo','col-plan':'plan','col-exec':'exec','col-rev':'rev','col-done':'done' };
      return c.col === lm[col.id] || c.column_id === col.id;
    }).map(c => ({
      titulo:    c.title,
      bpmn:      c.bpmn || c.bpmn_status || 'esbocar',
      prioridade: c.priority || 'medium',
      responsavel: team.find(m => m.id === (c.assignee || c.assigned_to))?.name || '—',
      horas:     c.hours || '—',
      orcamento: c.budget || '—',
      prazo:     c.due_date || c.date || '—',
      decisao:   c.doc_decision || '',
      artefato:  c.doc_artifact || '',
      risco:     c.doc_risk     || '',
      notas:     c.doc_notes    || '',
      criterios: c.acceptance_criteria || '',
      subtarefas: c.subtasks ? `${c.subtasks.done}/${c.subtasks.total} concluídas` : '',
    }));
  });

  const done  = cards.filter(c => c.col === 'done' || c.bpmn === 'concluido').length;
  const pct   = cards.length ? Math.round((done / cards.length) * 100) : 0;

  return {
    projeto: {
      id:          proj.id,
      nome:        proj.name,
      descricao:   proj.description || '',
      objetivo:    proj.objective   || '',
      cliente:     proj.client_name || '',
      cor:         proj.color       || '#6c5ce7',
      status:      proj.status      || 'active',
    },
    metricas: {
      total_tarefas: cards.length,
      concluidas:    done,
      percentual:    pct,
      orcamento_total: cards.reduce((s, c) => s + parseFloat((c.budget || '0').replace(/[^0-9.]/g, '') || 0), 0),
      horas_total:     cards.reduce((s, c) => s + parseFloat((c.hours  || '0').replace(/[^0-9.]/g, '') || 0), 0),
    },
    tarefas_por_coluna: byCol,
    equipe: team.map(m => ({ nome: m.name, papel: m.role })),
  };
}

// ════════════════════════════════════════════════════════════
//  CLAUDE API CALL (single chain)
// ════════════════════════════════════════════════════════════
async function _callClaude(systemPrompt, userMessage) {
  // 1. Tenta via proxy Supabase Edge Function (resolve CORS)
  if (window._callClaudeViaProxy) {
    try {
      return await window._callClaudeViaProxy(systemPrompt, userMessage, AI_TOKENS);
    } catch (proxyErr) {
      if (proxyErr.message !== 'PROXY_NOT_CONFIGURED') {
        // Proxy configurado mas falhou → loga e cai no demo
        console.warn('[AIDocEngine] Proxy erro:', proxyErr.message);
      }
      // Se PROXY_NOT_CONFIGURED → silenciosamente cai no demo
    }
  }

  // 2. Tenta API direta (funciona em localhost ou ambientes sem CORS)
  try {
    const res = await fetch(AI_API_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:      AI_MODEL,
        max_tokens: AI_TOKENS,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userMessage }],
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const text = (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
      if (text.trim()) return text.trim();
    }
  } catch {
    // CORS ou rede — cai no demo
  }

  // 3. Fallback demo — gera JSON estruturado a partir do contexto real
  if (window._showProxySetupHint) window._showProxySetupHint();
  return _demoChainResponse(systemPrompt, userMessage);
}

// Gera resposta demo estruturada a partir do contexto real do projeto
function _demoChainResponse(systemPrompt, userMessage) {
  // Detecta qual chain está sendo executada pelo conteúdo do system prompt
  if (systemPrompt.includes('resumo_executivo') && systemPrompt.includes('riscos')) {
    // Chain A
    let ctx = {};
    try { ctx = JSON.parse(userMessage.match(/Contexto do projeto:\n(.+?)(?:\n\nRetorne)/s)?.[1] || '{}'); } catch {}
    const pct  = ctx.metricas?.percentual || 0;
    const saude = pct >= 75 ? 'otimo' : pct >= 50 ? 'bom' : pct >= 25 ? 'atencao' : 'critico';
    const total = ctx.metricas?.total_tarefas || 0;
    const nome  = ctx.projeto?.nome || 'Projeto';
    return JSON.stringify({
      resumo_executivo: `O projeto ${nome} possui ${total} tarefa(s) com ${pct}% de conclusão. A equipe está ativa e o progresso é ${saude === 'otimo' ? 'excelente' : saude === 'bom' ? 'satisfatório' : 'abaixo do esperado'}.`,
      escopo_confirmado: [`Gestão de tarefas via Kanban`, `Documentação de decisões e artefatos`, `Acompanhamento de prazos e orçamento`],
      riscos: [
        { titulo: 'Tarefas sem prazo definido', nivel: 'medio', mitigacao: 'Definir datas de entrega para todas as tarefas abertas' },
        { titulo: 'Dependências não mapeadas', nivel: 'baixo', mitigacao: 'Usar o Diagrama para mapear relações entre tarefas' },
        pct < 50 ? { titulo: 'Progresso abaixo do esperado', nivel: 'alto', mitigacao: 'Revisar prioridades e redistribuir carga de trabalho' } : null,
      ].filter(Boolean),
      dependencias_criticas: ['Aprovação do cliente nas entregas', 'Disponibilidade da equipe técnica'],
      saude_geral: saude,
      justificativa_saude: `${pct}% das tarefas concluídas de um total de ${total}. ${pct >= 75 ? 'Projeto na reta final.' : pct >= 50 ? 'Metade do trabalho realizado.' : 'Atenção necessária ao ritmo de entrega.'}`,
    });
  }

  if (systemPrompt.includes('arquitetura_sugerida') && systemPrompt.includes('stack_identificada')) {
    // Chain B
    let ctx = {};
    try { ctx = JSON.parse(userMessage.match(/Contexto do projeto:\n(.+?)(?:\n\nChain A)/s)?.[1] || '{}'); } catch {}
    const stack = ctx.projeto?.stack || [];
    return JSON.stringify({
      arquitetura_sugerida: 'Arquitetura baseada em componentes com separação clara entre frontend, backend e banco de dados. Recomenda-se uso de APIs RESTful com autenticação JWT e banco de dados relacional com Row Level Security.',
      stack_identificada: stack.length ? stack : ['Supabase (PostgreSQL)', 'JavaScript', 'HTML/CSS'],
      componentes_principais: [
        { nome: 'Frontend', responsabilidade: 'Interface do usuário com Kanban e formulários' },
        { nome: 'API Layer', responsabilidade: 'Endpoints RESTful via Supabase Functions' },
        { nome: 'Banco de Dados', responsabilidade: 'PostgreSQL com RLS por workspace' },
      ],
      integracoes: ['Supabase Auth', 'Storage para anexos', 'Realtime para colaboração'],
      qualidade_codigo: { nivel: 'media', observacoes: 'Boas práticas de separação de responsabilidades. Recomenda-se adicionar testes automatizados.' },
      recomendacoes_tecnicas: ['Implementar testes unitários para lógica crítica', 'Adicionar monitoramento de erros em produção', 'Documentar endpoints da API'],
    });
  }

  if (systemPrompt.includes('objetivos_negocio') && systemPrompt.includes('kpis_sugeridos')) {
    // Chain C
    let ctx = {};
    try { ctx = JSON.parse(userMessage.match(/Contexto do projeto:\n(.+?)(?:\n\nChain A)/s)?.[1] || '{}'); } catch {}
    const nome    = ctx.projeto?.nome || 'Projeto';
    const cliente = ctx.projeto?.cliente || 'Cliente';
    const pct     = ctx.metricas?.percentual || 0;
    return JSON.stringify({
      objetivos_negocio: [`Entregar ${nome} com qualidade e dentro do prazo`, 'Satisfazer os requisitos do cliente', 'Documentar todo o processo para manutenção futura'],
      kpis_sugeridos: [
        { metrica: 'Taxa de conclusão de tarefas', meta: '100%', atual: pct+'%' },
        { metrica: 'Tarefas no prazo', meta: '≥ 90%', atual: 'Verificar prazos' },
        { metrica: 'Satisfação do cliente', meta: '≥ 4.5/5', atual: 'A medir' },
      ],
      stakeholders: [
        { nome: cliente, papel: 'Cliente / Patrocinador', interesse: 'Entrega no prazo e dentro do orçamento' },
        { nome: 'Equipe técnica', papel: 'Executores', interesse: 'Clareza de requisitos e ferramentas adequadas' },
      ],
      valor_entregue: `O projeto ${nome} agrega valor ao ${cliente} através de soluções técnicas de qualidade, documentação completa e processo transparente de gestão.`,
      gaps_documentacao: ['Critérios de aceite em algumas tarefas', 'Registro de decisões arquiteturais', 'Plano de contingência para riscos identificados'],
      proximos_marcos: [
        { titulo: 'Revisão de escopo', prazo_estimado: 'Esta semana', criterio: 'Todas as tarefas com prazo definido' },
        { titulo: 'Entrega parcial', prazo_estimado: 'Próximo sprint', criterio: 'Tarefas em Revisão aprovadas pelo cliente' },
      ],
    });
  }

  if (systemPrompt.includes('acoes_imediatas') && systemPrompt.includes('bloqueios_identificados')) {
    // Chain D
    let ctx = {};
    try { ctx = JSON.parse(userMessage.match(/Contexto:\n(.+?)(?:\nChain A)/s)?.[1] || '{}'); } catch {}
    const nome = ctx.projeto?.nome || 'Projeto';
    const pct  = ctx.metricas?.percentual || 0;
    return JSON.stringify({
      acoes_imediatas: [
        { acao: 'Revisar tarefas sem responsável definido', responsavel: 'Gerente de projeto', prazo: 'Hoje', prioridade: 'urgente' },
        { acao: 'Atualizar status das tarefas em execução', responsavel: 'Time técnico', prazo: 'Amanhã', prioridade: 'alta' },
        { acao: 'Documentar decisões das últimas tarefas concluídas', responsavel: 'Tech lead', prazo: 'Esta semana', prioridade: 'media' },
      ],
      bloqueios_identificados: pct < 30 ? [
        { descricao: 'Baixo progresso geral', impacto: 'Risco de atraso na entrega', resolucao_sugerida: 'Realizar reunião de alinhamento e revisar prioridades' },
      ] : [],
      melhorias_processo: ['Realizar daily standup de 15 minutos', 'Usar critérios de aceite em todas as tarefas', 'Fazer retrospectiva ao fim de cada sprint'],
      plano_comunicacao: { frequencia: 'Semanal', formato: 'Relatório de status + reunião de alinhamento', participantes: 'Time completo + cliente' },
      resumo_executivo_final: `O projeto ${nome} encontra-se com ${pct}% de progresso. ${pct >= 75 ? 'As entregas estão no caminho certo e a conclusão está próxima.' : pct >= 50 ? 'O projeto está no ponto médio e necessita manter o ritmo atual.' : 'É necessária atenção especial ao ritmo de entrega para evitar atrasos.'} Recomenda-se foco nas ações imediatas listadas e comunicação proativa com os stakeholders.`,
    });
  }

  // Fallback genérico
  return JSON.stringify({ error: 'Chain não identificada', raw: systemPrompt.slice(0,100) });
}

// ════════════════════════════════════════════════════════════
//  PROMPT CHAINS
// ════════════════════════════════════════════════════════════

// Chain A — Análise de escopo e riscos
async function _chainA(ctx) {
  const sys = `Você é um arquiteto de software e analista de projetos sênior.
Analise o contexto de projeto fornecido e retorne APENAS JSON válido, sem markdown, sem explicações.
Schema esperado:
{
  "resumo_executivo": "string (2-3 frases)",
  "escopo_confirmado": ["string"],
  "riscos": [{"titulo":"string","nivel":"alto|medio|baixo","mitigacao":"string"}],
  "dependencias_criticas": ["string"],
  "saude_geral": "otimo|bom|atencao|critico",
  "justificativa_saude": "string"
}`;

  const msg = `Contexto do projeto:\n${JSON.stringify(ctx, null, 2)}\n\nRetorne APENAS o JSON conforme o schema.`;
  const raw = await _callClaude(sys, msg);
  return JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
}

// Chain B — Documentação técnica
async function _chainB(ctx, chainAResult) {
  const sys = `Você é um tech lead especialista em documentação técnica.
Retorne APENAS JSON válido:
{
  "arquitetura_sugerida": "string (descrição em 2-4 frases)",
  "stack_identificada": ["string"],
  "componentes_principais": [{"nome":"string","responsabilidade":"string"}],
  "integrações": ["string"],
  "qualidade_codigo": {"nivel":"alta|media|baixa","observacoes":"string"},
  "recomendacoes_tecnicas": ["string"]
}`;

  const msg = `Contexto do projeto:\n${JSON.stringify(ctx, null, 2)}\n\nAnálise de escopo (Chain A):\n${JSON.stringify(chainAResult, null, 2)}\n\nRetorne APENAS o JSON.`;
  const raw = await _callClaude(sys, msg);
  return JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
}

// Chain C — Documentação de negócio
async function _chainC(ctx, chainAResult) {
  const sys = `Você é um analista de negócios especialista em produtos SaaS e gestão de projetos.
Retorne APENAS JSON válido:
{
  "objetivos_negocio": ["string"],
  "kpis_sugeridos": [{"metrica":"string","meta":"string","atual":"string"}],
  "stakeholders": [{"nome":"string","papel":"string","interesse":"string"}],
  "valor_entregue": "string (2-3 frases)",
  "gaps_documentacao": ["string"],
  "proximos_marcos": [{"titulo":"string","prazo_estimado":"string","criterio":"string"}]
}`;

  const msg = `Contexto do projeto:\n${JSON.stringify(ctx, null, 2)}\n\nAnálise de escopo (Chain A):\n${JSON.stringify(chainAResult, null, 2)}\n\nRetorne APENAS o JSON.`;
  const raw = await _callClaude(sys, msg);
  return JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
}

// Chain D — Plano de ação e próximos passos
async function _chainD(ctx, chainAResult, chainBResult, chainCResult) {
  const sys = `Você é um gerente de projetos sênior com foco em entrega e execução.
Retorne APENAS JSON válido:
{
  "acoes_imediatas": [{"acao":"string","responsavel":"string","prazo":"string","prioridade":"urgente|alta|media"}],
  "bloqueios_identificados": [{"descricao":"string","impacto":"string","resolucao_sugerida":"string"}],
  "melhorias_processo": ["string"],
  "plano_comunicacao": {"frequencia":"string","formato":"string","participantes":"string"},
  "resumo_executivo_final": "string (parágrafo completo para C-level)"
}`;

  const msg = `Contexto:\n${JSON.stringify(ctx, null, 2)}
Chain A (Escopo/Riscos):\n${JSON.stringify(chainAResult, null, 2)}
Chain B (Técnica):\n${JSON.stringify(chainBResult, null, 2)}
Chain C (Negócio):\n${JSON.stringify(chainCResult, null, 2)}

Retorne APENAS o JSON.`;
  const raw = await _callClaude(sys, msg);
  return JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
}

// ════════════════════════════════════════════════════════════
//  MAIN ENGINE — orquestra os 4 chains
// ════════════════════════════════════════════════════════════
const AIDocEngine = {

  _running: false,

  async generate(projectId, onProgress) {
    if (this._running) { showToast('Geração em andamento...', true); return null; }
    this._running = true;

    const prog = onProgress || (() => {});

    try {
      prog(5, 'Coletando dados do projeto...');
      const ctx = _assembleContext(projectId);

      prog(15, 'Chain A — Analisando escopo e riscos...');
      const chainA = await _chainA(ctx);

      prog(35, 'Chain B — Gerando documentação técnica...');
      const chainB = await _chainB(ctx, chainA);

      prog(60, 'Chain C — Documentando perspectiva de negócio...');
      const chainC = await _chainC(ctx, chainA);

      prog(80, 'Chain D — Criando plano de ação...');
      const chainD = await _chainD(ctx, chainA, chainB, chainC);

      prog(95, 'Salvando snapshot...');

      const snapshot = {
        id:          'snap_' + Date.now(),
        project_id:  projectId,
        created_at:  new Date().toISOString(),
        version:     (AIDocStore.getAll(projectId).length + 1),
        context:     ctx,
        chain_a:     chainA,
        chain_b:     chainB,
        chain_c:     chainC,
        chain_d:     chainD,
      };

      AIDocStore.add(projectId, snapshot);
      prog(100, 'Documentação gerada com sucesso!');
      return snapshot;

    } catch(e) {
      console.error('AIDocEngine error:', e);
      throw e;
    } finally {
      this._running = false;
    }
  },
};
window.AIDocEngine = AIDocEngine;

// ════════════════════════════════════════════════════════════
//  AI DOC PANEL — renderiza o painel de documentação IA
// ════════════════════════════════════════════════════════════
const AIDocPanel = {

  _pid: null,

  render(containerId, projectId) {
    this._pid = projectId;
    const el = document.getElementById(containerId);
    if (!el) return;

    const snap    = AIDocStore.latest(projectId);
    const snapAll = AIDocStore.getAll(projectId);
    const proj    = (window.mockProjects || []).find(p => p.id === projectId) || { name: projectId };

    el.innerHTML = `
<div class="ai-doc-panel">
  <!-- Header -->
  <div class="ai-doc-header">
    <div class="ai-doc-header-left">
      <div class="ai-doc-icon">✦</div>
      <div>
        <div class="ai-doc-title">Documentação IA — ${_esc(proj.name)}</div>
        <div class="ai-doc-sub">${snap ? `v${snap.version} · ${new Date(snap.created_at).toLocaleString('pt-BR')}` : 'Nenhum snapshot gerado'}</div>
      </div>
    </div>
    <div class="ai-doc-header-actions">
      ${snapAll.length > 1 ? `<select class="ai-doc-version-sel" onchange="AIDocPanel.loadVersion('${projectId}', this.value)">
        ${snapAll.map((s,i) => `<option value="${i}" ${i===0?'selected':''}>v${s.version} — ${new Date(s.created_at).toLocaleDateString('pt-BR')}</option>`).join('')}
      </select>` : ''}
      <button class="btn-ai-gen" onclick="AIDocPanel.startGeneration('${projectId}')" id="ai-gen-btn">
        <span class="ai-gen-icon">✦</span> Gerar com IA
      </button>
      ${snap ? `<button class="btn-secondary ai-export-btn" onclick="AIDocPanel.exportHTML('${projectId}')">↓ Exportar</button>` : ''}
    </div>
  </div>

  <!-- Progress bar (hidden by default) -->
  <div class="ai-progress-wrap" id="ai-progress-wrap" style="display:none">
    <div class="ai-progress-bar"><div class="ai-progress-fill" id="ai-progress-fill" style="width:0%"></div></div>
    <div class="ai-progress-label" id="ai-progress-label">Iniciando...</div>
  </div>

  <!-- Content -->
  <div class="ai-doc-content" id="ai-doc-content">
    ${snap ? this._renderSnapshot(snap) : this._renderEmpty(projectId)}
  </div>
</div>`;
  },

  _renderEmpty(pid) {
    const ctx  = _assembleContext(pid);
    const cards = ctx.metricas.total_tarefas;
    return `
<div class="ai-doc-empty">
  <div class="ai-doc-empty-icon">✦</div>
  <div class="ai-doc-empty-title">Documentação IA não gerada</div>
  <div class="ai-doc-empty-sub">
    ${cards} tarefa${cards !== 1 ? 's' : ''} encontrada${cards !== 1 ? 's' : ''} neste projeto.<br>
    A IA irá analisar escopo, riscos, arquitetura e criar um plano de ação.
  </div>
  <button class="btn-ai-gen btn-ai-gen--lg" onclick="AIDocPanel.startGeneration('${pid}')">
    <span class="ai-gen-icon">✦</span> Gerar Documentação com IA
  </button>
</div>`;
  },

  _renderSnapshot(snap) {
    const { chain_a: a, chain_b: b, chain_c: c, chain_d: d, context: ctx } = snap;

    const healthColor = { otimo:'var(--green)', bom:'var(--blue)', atencao:'var(--yellow)', critico:'var(--red)' };
    const healthLabel = { otimo:'Ótimo ✓', bom:'Bom ◉', atencao:'Atenção ⚠', critico:'Crítico ✕' };
    const prioColor   = { urgente:'var(--red)', alta:'var(--orange)', media:'var(--yellow)', baixo:'var(--tx-3)' };
    const riskColor   = { alto:'var(--red)', medio:'var(--yellow)', baixo:'var(--green)' };

    return `
<div class="ai-snapshot">

  <!-- Saúde do projeto -->
  <div class="ai-health-bar" style="--health-color:${healthColor[a.saude_geral]||'var(--blue)'}">
    <span class="ai-health-label">Saúde do Projeto</span>
    <span class="ai-health-badge">${healthLabel[a.saude_geral]||a.saude_geral}</span>
    <span class="ai-health-just">${_esc(a.justificativa_saude||'')}</span>
  </div>

  <!-- Resumo executivo -->
  <div class="ai-section">
    <div class="ai-section-title">Resumo Executivo</div>
    <div class="ai-section-body ai-resume">${_esc(d.resumo_executivo_final || a.resumo_executivo || '')}</div>
  </div>

  <!-- Métricas -->
  <div class="ai-metrics-row">
    <div class="ai-metric"><div class="ai-metric-val">${ctx.metricas.total_tarefas}</div><div class="ai-metric-lbl">Tarefas</div></div>
    <div class="ai-metric"><div class="ai-metric-val" style="color:var(--green)">${ctx.metricas.concluidas}</div><div class="ai-metric-lbl">Concluídas</div></div>
    <div class="ai-metric"><div class="ai-metric-val">${ctx.metricas.percentual}%</div><div class="ai-metric-lbl">Progresso</div></div>
    <div class="ai-metric"><div class="ai-metric-val" style="color:var(--blue)">${ctx.metricas.horas_total > 0 ? ctx.metricas.horas_total + 'h' : '—'}</div><div class="ai-metric-lbl">Horas Est.</div></div>
  </div>

  <div class="ai-cols-2">

    <!-- Coluna esquerda -->
    <div>

      <!-- Riscos -->
      ${(a.riscos||[]).length ? `
      <div class="ai-section">
        <div class="ai-section-title">Riscos Identificados</div>
        <div class="ai-risk-list">
          ${(a.riscos).map(r => `
          <div class="ai-risk-item">
            <span class="ai-risk-badge" style="background:${riskColor[r.nivel]||'var(--tx-3)'}20;color:${riskColor[r.nivel]||'var(--tx-3)'}">${r.nivel?.toUpperCase()}</span>
            <div>
              <div class="ai-risk-title">${_esc(r.titulo)}</div>
              ${r.mitigacao ? `<div class="ai-risk-mit">→ ${_esc(r.mitigacao)}</div>` : ''}
            </div>
          </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- Ações imediatas -->
      ${(d.acoes_imediatas||[]).length ? `
      <div class="ai-section">
        <div class="ai-section-title">Ações Imediatas</div>
        <div class="ai-action-list">
          ${(d.acoes_imediatas).map((ac, i) => `
          <div class="ai-action-item">
            <span class="ai-action-num">${i+1}</span>
            <div>
              <div class="ai-action-title">${_esc(ac.acao)}</div>
              <div class="ai-action-meta">
                <span style="color:${prioColor[ac.prioridade]||'var(--tx-3)'}">${ac.prioridade?.toUpperCase()}</span>
                ${ac.responsavel ? ` · ${_esc(ac.responsavel)}` : ''}
                ${ac.prazo ? ` · ${_esc(ac.prazo)}` : ''}
              </div>
            </div>
          </div>`).join('')}
        </div>
      </div>` : ''}

    </div>

    <!-- Coluna direita -->
    <div>

      <!-- Documentação Técnica -->
      ${b.arquitetura_sugerida ? `
      <div class="ai-section">
        <div class="ai-section-title">Arquitetura & Tecnologia</div>
        <div class="ai-section-body" style="margin-bottom:10px">${_esc(b.arquitetura_sugerida)}</div>
        ${(b.stack_identificada||[]).length ? `
        <div class="ai-tags">
          ${b.stack_identificada.map(s => `<span class="ai-tag">${_esc(s)}</span>`).join('')}
        </div>` : ''}
        ${(b.recomendacoes_tecnicas||[]).length ? `
        <ul class="ai-list">
          ${b.recomendacoes_tecnicas.map(r => `<li>${_esc(r)}</li>`).join('')}
        </ul>` : ''}
      </div>` : ''}

      <!-- KPIs -->
      ${(c.kpis_sugeridos||[]).length ? `
      <div class="ai-section">
        <div class="ai-section-title">KPIs Sugeridos</div>
        <div class="ai-kpi-list">
          ${(c.kpis_sugeridos).map(k => `
          <div class="ai-kpi-item">
            <div class="ai-kpi-name">${_esc(k.metrica)}</div>
            <div class="ai-kpi-vals">
              ${k.atual !== '' ? `<span class="ai-kpi-current">${_esc(k.atual)}</span>` : ''}
              <span class="ai-kpi-target">→ ${_esc(k.meta)}</span>
            </div>
          </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- Próximos marcos -->
      ${(d.proximos_marcos||c.proximos_marcos||[]).length ? `
      <div class="ai-section">
        <div class="ai-section-title">Próximos Marcos</div>
        <div class="ai-milestones">
          ${(d.proximos_marcos||c.proximos_marcos).map(m => `
          <div class="ai-milestone">
            <div class="ai-milestone-dot"></div>
            <div>
              <div class="ai-milestone-title">${_esc(m.titulo)}</div>
              <div class="ai-milestone-meta">${_esc(m.prazo_estimado||'')} ${m.criterio ? '· '+_esc(m.criterio) : ''}</div>
            </div>
          </div>`).join('')}
        </div>
      </div>` : ''}

    </div>
  </div>

  <!-- Bloqueios -->
  ${(d.bloqueios_identificados||[]).length ? `
  <div class="ai-section">
    <div class="ai-section-title">Bloqueios</div>
    <div class="ai-blockers">
      ${(d.bloqueios_identificados).map(bl => `
      <div class="ai-blocker">
        <div class="ai-blocker-desc">${_esc(bl.descricao)}</div>
        <div class="ai-blocker-meta">Impacto: ${_esc(bl.impacto)} · ${_esc(bl.resolucao_sugerida)}</div>
      </div>`).join('')}
    </div>
  </div>` : ''}

  <!-- Gaps de documentação -->
  ${(c.gaps_documentacao||[]).length ? `
  <div class="ai-section">
    <div class="ai-section-title">Gaps de Documentação</div>
    <ul class="ai-list ai-list--warn">
      ${c.gaps_documentacao.map(g => `<li>${_esc(g)}</li>`).join('')}
    </ul>
  </div>` : ''}

</div>`;
  },

  async startGeneration(projectId) {
    const btn  = document.getElementById('ai-gen-btn');
    const wrap = document.getElementById('ai-progress-wrap');
    const fill = document.getElementById('ai-progress-fill');
    const lbl  = document.getElementById('ai-progress-label');
    const content = document.getElementById('ai-doc-content');

    if (btn)  { btn.disabled = true; btn.innerHTML = '<span class="ai-gen-icon ai-spin">✦</span> Gerando...'; }
    if (wrap) wrap.style.display = 'block';
    if (content) content.style.opacity = '0.4';

    try {
      const snap = await AIDocEngine.generate(projectId, (pct, msg) => {
        if (fill) fill.style.width = pct + '%';
        if (lbl)  lbl.textContent = msg;
      });

      showToast('✦ Documentação gerada com sucesso!');
      // Re-renderiza o painel completo
      const container = document.getElementById('ai-doc-container');
      if (container) this.render('ai-doc-container', projectId);
      else if (content) { content.innerHTML = this._renderSnapshot(snap); content.style.opacity = '1'; }

    } catch(e) {
      showToast('Erro ao gerar documentação: ' + e.message, true);
      if (content) content.style.opacity = '1';
    } finally {
      if (btn)  { btn.disabled = false; btn.innerHTML = '<span class="ai-gen-icon">✦</span> Gerar com IA'; }
      if (wrap) wrap.style.display = 'none';
    }
  },

  loadVersion(projectId, idx) {
    const snaps = AIDocStore.getAll(projectId);
    const snap  = snaps[parseInt(idx)];
    if (!snap) return;
    const content = document.getElementById('ai-doc-content');
    if (content) content.innerHTML = this._renderSnapshot(snap);
  },

  exportHTML(projectId) {
    const snap = AIDocStore.latest(projectId);
    if (!snap) { showToast('Nenhum snapshot para exportar', true); return; }
    const proj = (window.mockProjects || []).find(p => p.id === projectId) || { name: projectId };

    const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<title>Documentação IA — ${proj.name}</title>
<style>
body{font-family:system-ui,sans-serif;padding:32px;max-width:900px;margin:0 auto;color:#141413;line-height:1.6}
h1{font-size:24px;margin-bottom:4px}
.sub{color:#8a8a84;font-size:13px;margin-bottom:28px}
h2{font-size:16px;font-weight:700;margin:24px 0 10px;padding-bottom:6px;border-bottom:1px solid #e2e2de}
.tag{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;background:#f0f0ee;margin:2px}
.metric{display:inline-block;padding:12px 20px;border:1px solid #e2e2de;border-radius:8px;margin:0 8px 8px 0;text-align:center}
.metric-val{font-size:22px;font-weight:700}
.metric-lbl{font-size:12px;color:#8a8a84}
.risk{padding:8px 12px;border-radius:6px;margin-bottom:8px;border:1px solid #e2e2de}
.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;margin-right:8px}
footer{margin-top:40px;border-top:1px solid #e2e2de;padding-top:16px;font-size:12px;color:#8a8a84}
</style></head><body>
<h1>Documentação IA — ${proj.name}</h1>
<div class="sub">Gerado em ${new Date(snap.created_at).toLocaleString('pt-BR')} · v${snap.version} · ProjectFlow V7</div>

<h2>Resumo Executivo</h2>
<p>${snap.chain_d?.resumo_executivo_final || snap.chain_a?.resumo_executivo || ''}</p>

<h2>Métricas</h2>
<div class="metric"><div class="metric-val">${snap.context.metricas.total_tarefas}</div><div class="metric-lbl">Tarefas</div></div>
<div class="metric"><div class="metric-val">${snap.context.metricas.concluidas}</div><div class="metric-lbl">Concluídas</div></div>
<div class="metric"><div class="metric-val">${snap.context.metricas.percentual}%</div><div class="metric-lbl">Progresso</div></div>

<h2>Riscos</h2>
${(snap.chain_a.riscos||[]).map(r=>`<div class="risk"><span class="badge" style="background:#f0f0ee">${r.nivel?.toUpperCase()}</span><strong>${r.titulo}</strong>${r.mitigacao?` — ${r.mitigacao}`:''}</div>`).join('')}

<h2>Arquitetura & Stack</h2>
<p>${snap.chain_b?.arquitetura_sugerida||''}</p>
${(snap.chain_b?.stack_identificada||[]).map(s=>`<span class="tag">${s}</span>`).join('')}

<h2>Ações Imediatas</h2>
<ol>${(snap.chain_d?.acoes_imediatas||[]).map(a=>`<li><strong>${a.acao}</strong> — ${a.responsavel||''} · ${a.prazo||''}</li>`).join('')}</ol>

<h2>KPIs Sugeridos</h2>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px">
<tr style="background:#f0f0ee"><th>Métrica</th><th>Atual</th><th>Meta</th></tr>
${(snap.chain_c?.kpis_sugeridos||[]).map(k=>`<tr><td>${k.metrica}</td><td>${k.atual||'—'}</td><td>${k.meta}</td></tr>`).join('')}
</table>

<footer>ProjectFlow V7 · Documentação gerada por IA (Claude) · ${new Date().toLocaleDateString('pt-BR')}</footer>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    if (win) setTimeout(() => win.print(), 800);
    showToast('HTML exportado — use Ctrl+P para PDF');
  },
};
window.AIDocPanel = AIDocPanel;
