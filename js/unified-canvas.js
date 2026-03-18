// ============================================================
//  ProjectFlow V7 — js/unified-canvas.js  (rewrite)
//  Sprint 3: Unified Canvas — sem renomear IDs existentes
//  A troca de modo agora usa display:flex/none via data-attr
//  AI Strip: chat lateral com contexto do projeto
//  SemanticMemory: busca por keywords entre projetos
// ============================================================
'use strict';

// ════════════════════════════════════════════════════════════
//  SEMANTIC MEMORY — mock de pgvector via localStorage
// ════════════════════════════════════════════════════════════
const SemanticMemory = {
  _key: 'pf_semantic_v1',

  load()  { try { return JSON.parse(localStorage.getItem(this._key) || '{}'); } catch { return {}; } },
  save(d) { try { localStorage.setItem(this._key, JSON.stringify(d)); } catch { } },

  index(projectId, snapshot) {
    if (!snapshot) return;
    const d = this.load();
    if (!d.entries) d.entries = [];
    const proj = (window.mockProjects||[]).find(p=>p.id===projectId)||{name:projectId};
    const keywords = [
      ...(snapshot.chain_b?.stack_identificada||[]),
      ...(snapshot.chain_a?.riscos||[]).map(r=>r.titulo),
      ...(snapshot.chain_d?.acoes_imediatas||[]).map(a=>a.acao),
    ].map(k=>k.toLowerCase()).filter(Boolean);
    d.entries.push({
      id: 'mem_'+Date.now(),
      project_id: projectId,
      project_name: proj.name,
      indexed_at: new Date().toISOString(),
      keywords,
      summary: snapshot.chain_d?.resumo_executivo_final || snapshot.chain_a?.resumo_executivo || '',
      risks: (snapshot.chain_a?.riscos||[]).map(r=>r.titulo),
      stack: snapshot.chain_b?.stack_identificada||[],
    });
    if (d.entries.length > 50) d.entries = d.entries.slice(-50);
    this.save(d);
  },

  search(query, excludeProjectId, limit=3) {
    const entries = (this.load().entries||[]).filter(e=>e.project_id!==excludeProjectId);
    if (!entries.length) return [];
    const qwords = query.toLowerCase().split(/\s+/);
    return entries
      .map(e=>({...e, score: qwords.filter(w=>e.keywords.some(k=>k.includes(w))).length}))
      .filter(e=>e.score>0)
      .sort((a,b)=>b.score-a.score)
      .slice(0,limit);
  },
};
window.SemanticMemory = SemanticMemory;

// ════════════════════════════════════════════════════════════
//  CANVAS MODE — troca de modo sem renomear nenhum ID
//  Usa os IDs existentes: view-kanban, view-diagram, etc.
//  Adiciona novos painéis: view-wiki-canvas, view-timeline
// ════════════════════════════════════════════════════════════
const CanvasMode = {
  _current: 'kanban',
  // mapeamento modo -> ID do painel existente ou novo
  _panels: {
    kanban:   'view-kanban',
    diagram:  'view-diagram',
    wiki:     'view-wiki',
    timeline: 'view-timeline-canvas',
  },

  get() { return this._current; },

  set(mode, projectId) {
    if (!this._panels[mode]) return;
    this._current = mode;

    // Atualiza botões do switcher no kanban toolbar
    document.querySelectorAll('.canvas-mode-btn').forEach(b=>{
      b.classList.toggle('active', b.dataset.mode === mode);
    });

    const pid = projectId || PF.currentProject || 'website';

    // Usa o switchView existente para kanban/diagram
    // Para wiki/timeline usa painéis separados
    if (mode === 'kanban') {
      window.switchView('kanban', document.getElementById('nav-kanban'));
    } else if (mode === 'diagram') {
      window.switchView('diagram', document.getElementById('nav-diagram'));
      if (window.DiagramViewManager) DiagramViewManager.init(pid);
    } else if (mode === 'wiki') {
      window.switchView('wiki', document.getElementById('nav-wiki'));
      if (window.KnowledgeBase) KnowledgeBase.render('kb-container', pid);
    } else if (mode === 'timeline') {
      // Ativa o painel timeline dedicado usando switchView se disponível
      if (typeof window.switchView === 'function') {
        window.switchView('timeline-canvas', null);
      } else {
        document.querySelectorAll('div[id^="view-"]').forEach(v => {
          v.classList.remove('active');
          v.style.display = 'none';
        });
        document.querySelectorAll('.tb-tab').forEach(t => t.classList.remove('active'));
        const tl = document.getElementById('view-timeline-canvas');
        if (tl) { tl.classList.add('active'); tl.style.display = 'flex'; }
      }
      TimelineView.render('timeline-container', pid);
    }

    if (window.AIStrip) AIStrip.updateContext(mode, pid);
  },
};
window.CanvasMode = CanvasMode;

// ════════════════════════════════════════════════════════════
//  TIMELINE VIEW — visão agrupada por status
// ════════════════════════════════════════════════════════════
const TimelineView = {
  render(containerId, projectId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const cards = (window.mockCards||[]).filter(c=>c.sl===projectId||c.project_id===projectId);
    const team  = window.mockTeam||[];

    if (!cards.length) {
      el.innerHTML = '<div class="tl-empty">Nenhuma tarefa encontrada neste projeto.</div>';
      return;
    }

    const groups = [
      {id:'todo', name:'Planejado',   color:'var(--col-todo)', bpmnList:['esbocar','viabilizar']},
      {id:'plan', name:'Prioridade',  color:'var(--col-plan)', bpmnList:['atribuir']},
      {id:'exec', name:'Em Execução', color:'var(--col-exec)', bpmnList:['executar']},
      {id:'rev',  name:'Em Revisão',  color:'var(--col-rev)',  bpmnList:['avaliar','corrigir','validar_cliente']},
      {id:'done', name:'Concluído',   color:'var(--col-done)', bpmnList:['concluido']},
    ].map(g=>({
      ...g,
      cards: cards.filter(c=>c.col===g.id||g.bpmnList.includes(c.bpmn||c.bpmn_status||'esbocar')),
    })).filter(g=>g.cards.length);

    const pri = {critical:'🔴',high:'↑',medium:'⬝',low:'↓'};

    el.innerHTML = `<div class="tl-wrap">
      <div class="tl-header">
        <div class="tl-header-title">Timeline — ${(window.mockProjects||[]).find(p=>p.id===projectId)?.name||projectId}</div>
        <div class="tl-header-sub">${cards.length} tarefas</div>
      </div>
      ${groups.map(g=>`
      <div class="tl-group">
        <div class="tl-group-label" style="border-left:3px solid ${g.color};padding-left:10px">
          <span style="color:${g.color}">●</span> ${g.name} <span class="tl-cnt">${g.cards.length}</span>
        </div>
        <div class="tl-cards">
          ${g.cards.map(c=>{
            const tm = team.find(m=>m.id===(c.assignee||c.assigned_to));
            const pct = c.subtasks?.total>0 ? Math.round(c.subtasks.done/c.subtasks.total*100) : (c.col==='done'?100:0);
            return `<div class="tl-card" onclick="openCardEdit('${c.id}')">
              <div class="tl-card-main">
                <span class="tl-card-pri">${pri[c.priority||'medium']||'⬝'}</span>
                <span class="tl-card-title">${_safeEsc(c.title)}</span>
              </div>
              <div class="tl-card-meta">
                ${tm?`<div class="avatar" style="background:${tm.color};width:16px;height:16px;font-size:8px;flex-shrink:0">${tm.initials}</div>`:''}
                ${c.due_date||c.date?`<span class="tl-date">📅 ${c.due_date||c.date}</span>`:''}
                ${c.hours?`<span class="tl-hours">⏱ ${c.hours}</span>`:''}
              </div>
              ${pct>0?`<div class="tl-progress"><div class="tl-progress-fill" style="width:${pct}%;background:${g.color}"></div></div>`:''}
            </div>`;
          }).join('')}
        </div>
      </div>`).join('')}
    </div>`;
  },
};
window.TimelineView = TimelineView;

// ════════════════════════════════════════════════════════════
//  AI STRIP — chat lateral persistente
//  Usa a Anthropic API com o padrão do sistema (sem api-key no browser)
//  Em modo demo, usa respostas inteligentes baseadas no contexto
// ════════════════════════════════════════════════════════════
const AIStrip = {
  _visible: false,
  _pid:     null,
  _mode:    'kanban',
  _conv:    [],

  toggle() {
    this._visible = !this._visible;
    const strip = document.getElementById('ai-strip');
    const btn   = document.getElementById('ai-strip-toggle');
    if (strip) strip.classList.toggle('open', this._visible);
    if (btn)   btn.classList.toggle('active', this._visible);
  },

  open() {
    this._visible = true;
    const strip = document.getElementById('ai-strip');
    const btn   = document.getElementById('ai-strip-toggle');
    if (strip) strip.classList.add('open');
    if (btn)   btn.classList.add('active');
  },

  updateContext(mode, pid) {
    this._mode = mode;
    this._pid  = pid;
    const ctx  = document.getElementById('ai-strip-context');
    if (!ctx) return;
    const labels = {kanban:'Kanban',wiki:'Knowledge Base',diagram:'Diagrama',timeline:'Timeline','ai-doc':'Doc IA'};
    const proj   = (window.mockProjects||[]).find(p=>p.id===pid)||{name:pid||'—'};
    ctx.textContent = (labels[mode]||mode) + ' · ' + proj.name;

    const sug = document.getElementById('ai-strip-suggestions');
    if (!sug) return;
    const suggestions = {
      kanban:   ['Analise o progresso geral','Quais tarefas estão em risco?','Resuma o status do projeto'],
      wiki:     ['Escreva uma intro do projeto','Liste os entregáveis principais','Documente as decisões técnicas'],
      diagram:  ['Explique a arquitetura atual','Sugira melhorias no fluxo','Quais componentes faltam?'],
      timeline: ['Qual o caminho crítico?','Identifique gargalos','Projete a data de entrega'],
      'ai-doc': ['Quais são os maiores riscos?','Resuma as ações imediatas','Explique a arquitetura sugerida'],
    };
    sug.innerHTML = (suggestions[mode]||suggestions.kanban).map(s=>`
      <button class="ai-suggestion-chip" onclick="AIStrip.sendMessage('${s.replace(/'/g,"\\'")}')">
        ${_safeEsc(s)}
      </button>`).join('');
  },

  async sendMessage(msg) {
    const pid   = this._pid || PF.currentProject || 'website';
    const input = document.getElementById('ai-strip-input');
    const text  = msg || input?.value?.trim();
    if (!text) return;
    if (input) input.value = '';

    this.open();
    this._addMessage('user', text);
    const loadingId = 'loading_' + Date.now();
    this._addMessage('assistant', '…', false, loadingId);

    try {
      const proj   = (window.mockProjects||[]).find(p=>p.id===pid)||{name:pid};
      const cards  = (window.mockCards||[]).filter(c=>c.sl===pid||c.project_id===pid);
      const done   = cards.filter(c=>c.col==='done'||c.bpmn==='concluido').length;
      const pct    = cards.length ? Math.round(done/cards.length*100) : 0;
      const snap   = window.AIDocStore ? AIDocStore.latest(pid) : null;
      const memory = SemanticMemory.search(text, pid);

      const sys = `Você é o assistente IA integrado ao ProjectFlow V7, sistema de gestão de projetos.
Projeto atual: "${proj.name}" | Modo: ${this._mode}
Dados do projeto:
- Total de tarefas: ${cards.length}
- Concluídas: ${done} (${pct}%)
- Pendentes: ${cards.filter(c=>c.col!=='done'&&c.bpmn!=='concluido').length}
- Equipe: ${(window.mockTeam||[]).map(m=>m.name+' ('+m.role+')').join(', ')}
${snap ? `\nÚltima doc IA: saúde=${snap.chain_a?.saude_geral}, riscos=${(snap.chain_a?.riscos||[]).map(r=>r.titulo).join(', ')}` : ''}
${memory.length ? `\nProjetos similares no workspace: ${memory.map(m=>m.project_name+': '+m.summary.slice(0,80)).join(' | ')}` : ''}

Responda em português, de forma direta e útil. Use markdown simples (**, *, listas com -).`;

      const history = this._conv.slice(-8).map(m=>({role:m.role, content:m.text}));

      const res = await (async () => {
        // Usa proxy Supabase se disponível (resolve CORS)
        if (window._callClaudeViaProxy) {
          try {
            const reply = await window._callClaudeViaProxy(sys, text, 700);
            return { ok: true, text: reply };
          } catch (e) {
            if (e.message !== 'PROXY_NOT_CONFIGURED') {
              return { ok: false, error: e.message };
            }
          }
        }
        // Tenta API direta (funciona em localhost)
        try {
          const r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 700,
              system: sys,
              messages: [...history, {role:'user', content:text}],
            }),
          });
          if (r.ok) {
            const d = await r.json();
            const t = (d.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('').trim();
            if (t) return { ok: true, text: t };
          }
        } catch { /* CORS → fallback */ }
        return { ok: false, error: 'CORS_FALLBACK' };
      })();

      const reply = res.ok ? res.text : this._demoReply(text, pid);
      this._replaceMessage(loadingId, reply || 'Não consegui processar. Tente novamente.');
      this._conv.push({role:'user',text}, {role:'assistant',text:reply});

    } catch(e) {
      // Fallback inteligente quando não há API key (modo demo)
      const fallback = this._demoReply(text, pid);
      this._replaceMessage(loadingId, fallback);
      this._conv.push({role:'user',text}, {role:'assistant',text:fallback});
    }
  },

  // Respostas contextuais para modo demo (sem API key)
  _demoReply(text, pid) {
    const cards = (window.mockCards||[]).filter(c=>c.sl===pid||c.project_id===pid);
    const done  = cards.filter(c=>c.col==='done'||c.bpmn==='concluido').length;
    const pct   = cards.length ? Math.round(done/cards.length*100) : 0;
    const proj  = (window.mockProjects||[]).find(p=>p.id===pid)||{name:pid};
    const tl    = text.toLowerCase();

    if (tl.includes('progress') || tl.includes('progresso') || tl.includes('status')) {
      return `**Progresso atual — ${proj.name}**\n\n- Total de tarefas: **${cards.length}**\n- Concluídas: **${done}** (${pct}%)\n- Em andamento: ${cards.filter(c=>c.col==='exec').length}\n- Pendentes: ${cards.filter(c=>c.col==='todo'||c.col==='plan').length}\n\n${pct >= 75 ? '✅ Projeto na reta final!' : pct >= 50 ? '📈 Bom progresso, metade concluída.' : '⚠️ Ainda há bastante trabalho pela frente.'}`;
    }
    if (tl.includes('risco') || tl.includes('risk') || tl.includes('bloqueio')) {
      const overdue = cards.filter(c=>c.due_date && new Date(c.due_date)<new Date() && c.col!=='done');
      return `**Riscos identificados — ${proj.name}**\n\n${overdue.length ? `- 🔴 **${overdue.length} tarefa(s) com prazo vencido**: ${overdue.map(c=>c.title).join(', ')}` : '- ✅ Nenhuma tarefa com prazo vencido'}\n- WIP check: ${cards.filter(c=>c.col==='exec').length} tarefas em execução simultânea\n\n💡 *Para análise completa de riscos, gere a documentação IA na aba "Doc IA".*`;
    }
    if (tl.includes('equipe') || tl.includes('team') || tl.includes('responsável')) {
      const team = window.mockTeam||[];
      const assign = team.map(m=>({...m, tasks: cards.filter(c=>(c.assignee||c.assigned_to)===m.id).length}));
      return `**Distribuição da equipe — ${proj.name}**\n\n${assign.map(m=>`- **${m.name}** (${m.role}): ${m.tasks} tarefa${m.tasks!==1?'s':''}`).join('\n')}\n\n${assign.some(m=>m.tasks>3)?'⚠️ Alguns membros com muitas tarefas — considere redistribuir.':'✅ Distribuição equilibrada.'}`;
    }
    return `**${proj.name}** · ${cards.length} tarefas · ${pct}% concluído\n\n*Assistente IA em modo demonstração. Para respostas completas com Claude, configure a API key no painel Supabase.*\n\nPosso responder sobre: progresso, riscos, equipe, prazos e status geral do projeto.`;
  },

  _addMessage(role, text, isLoading=false, id='') {
    const list = document.getElementById('ai-strip-messages');
    if (!list) return;
    const div = document.createElement('div');
    div.className = 'ai-msg ai-msg--' + role + (isLoading?' ai-msg--loading':'');
    if (id) div.dataset.msgId = id;
    div.innerHTML = this._md(text);
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
  },

  _replaceMessage(id, text) {
    const el = document.querySelector(`[data-msg-id="${id}"]`);
    if (el) {
      el.classList.remove('ai-msg--loading');
      el.innerHTML = this._md(text);
      const list = document.getElementById('ai-strip-messages');
      if (list) list.scrollTop = list.scrollHeight;
    }
  },

  _md(t) {
    return String(t||'')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,'<em>$1</em>')
      .replace(/`(.+?)`/g,'<code style="background:var(--bg-3);padding:1px 4px;border-radius:3px">$1</code>')
      .replace(/^- (.+)$/gm,'<span style="display:block;padding-left:12px">• $1</span>')
      .replace(/\n/g,'<br>');
  },

  clearConversation() {
    this._conv = [];
    const list = document.getElementById('ai-strip-messages');
    if (list) list.innerHTML = `<div class="ai-strip-welcome">
      <div class="ai-strip-welcome-icon">✦</div>
      <div class="ai-strip-welcome-text">Olá! Sou o assistente IA do ProjectFlow V7.<br>Pergunte sobre progresso, riscos, equipe ou prazos.</div>
    </div>`;
  },
};
window.AIStrip = AIStrip;

// ════════════════════════════════════════════════════════════
//  UNIFIED CANVAS — monta mode bar, painel timeline e AI strip
//  NÃO renomeia nenhum ID existente
// ════════════════════════════════════════════════════════════
const UnifiedCanvas = {
  _mounted: false,

  mount() {
    if (this._mounted) return;
    this._mounted = true;
    this._injectModeBar();
    this._injectTimelinePanel();
    this._injectAIStrip();
  },

  _injectModeBar() {
    if (document.getElementById('canvas-mode-switcher')) return;
    const toolbar = document.querySelector('#view-kanban .kanban-toolbar');
    if (!toolbar) return;

    const bar = document.createElement('div');
    bar.id = 'canvas-mode-switcher';
    bar.className = 'canvas-mode-switcher';
    bar.innerHTML = `
      <span class="cms-label">Modo:</span>
      <button class="canvas-mode-btn active" data-mode="kanban" onclick="CanvasMode.set('kanban')">
        <svg viewBox="0 0 14 14" fill="currentColor" width="12" height="12"><rect x="1" y="1" width="3" height="12" rx="1"/><rect x="5.5" y="1" width="3" height="9" rx="1"/><rect x="10" y="1" width="3" height="6" rx="1"/></svg>Kanban
      </button>
      <button class="canvas-mode-btn" data-mode="wiki" onclick="CanvasMode.set('wiki',PF.currentProject)">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="12" height="12"><rect x="1" y="1" width="12" height="12" rx="2"/><path d="M3 4h8M3 7h8M3 10h5"/></svg>Wiki
      </button>
      <button class="canvas-mode-btn" data-mode="diagram" onclick="CanvasMode.set('diagram',PF.currentProject)">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="12" height="12"><rect x="1" y="1" width="4" height="3" rx="1"/><rect x="9" y="1" width="4" height="3" rx="1"/><rect x="4.5" y="9" width="5" height="4" rx="1"/><path d="M3 4v2.5H7v2.5M11 4v2.5H7"/></svg>Diagrama
      </button>
      <button class="canvas-mode-btn" data-mode="timeline" onclick="CanvasMode.set('timeline',PF.currentProject)">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="12" height="12"><path d="M1 4h12M1 8h8M1 12h5"/><circle cx="5" cy="4" r="1" fill="currentColor"/><circle cx="3" cy="8" r="1" fill="currentColor"/></svg>Timeline
      </button>`;

    const space = toolbar.querySelector('.toolbar-space');
    if (space) toolbar.insertBefore(bar, space);
    else toolbar.appendChild(bar);

    // Botão AI Strip na topbar direita
    if (!document.getElementById('ai-strip-toggle')) {
      const tbRight = document.querySelector('.tb-right');
      if (tbRight) {
        const btn = document.createElement('button');
        btn.id = 'ai-strip-toggle';
        btn.className = 'btn-ai-strip-toggle';
        btn.title = 'Assistente IA';
        btn.innerHTML = '✦ IA';
        btn.onclick = () => AIStrip.toggle();
        tbRight.insertBefore(btn, tbRight.firstChild);
      }
    }
  },

  _injectTimelinePanel() {
    if (document.getElementById('view-timeline-canvas')) return;
    const contentArea = document.querySelector('.content-area');
    if (!contentArea) return;

    const tl = document.createElement('div');
    tl.id = 'view-timeline-canvas';
    tl.className = 'view';
    tl.style.flexDirection = 'column';
    tl.innerHTML = `
      <div class="kanban-toolbar">
        <div class="kanban-title-block">
          <div class="kanban-board-title">Timeline</div>
          <div class="kanban-board-sub">Visão agrupada por status e responsável</div>
        </div>
        <div class="toolbar-space"></div>
        <button class="btn-secondary" onclick="CanvasMode.set('kanban')">← Voltar ao Kanban</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:20px;background:var(--bg-0)" id="timeline-container"></div>`;
    contentArea.appendChild(tl);
  },

  _injectAIStrip() {
    if (document.getElementById('ai-strip')) return;
    const shell = document.getElementById('app-shell');
    if (!shell) return;

    const strip = document.createElement('div');
    strip.id = 'ai-strip';
    strip.className = 'ai-strip';
    strip.innerHTML = `
      <div class="ai-strip-header">
        <div class="ai-strip-header-left">
          <div class="ai-strip-logo">✦</div>
          <div>
            <div class="ai-strip-title">Assistente IA</div>
            <div class="ai-strip-context" id="ai-strip-context">Kanban</div>
          </div>
        </div>
        <button class="ai-strip-close" onclick="AIStrip.toggle()">✕</button>
      </div>
      <div class="ai-strip-messages" id="ai-strip-messages">
        <div class="ai-strip-welcome">
          <div class="ai-strip-welcome-icon">✦</div>
          <div class="ai-strip-welcome-text">Olá! Sou o assistente IA do ProjectFlow V7.<br>Pergunte sobre progresso, riscos, equipe ou prazos.</div>
        </div>
      </div>
      <div class="ai-strip-suggestions" id="ai-strip-suggestions"></div>
      <div class="ai-strip-input-row">
        <input type="text" id="ai-strip-input" class="ai-strip-input"
          placeholder="Pergunte sobre o projeto..."
          onkeydown="if(event.key==='Enter'){event.preventDefault();AIStrip.sendMessage()}">
        <button class="ai-strip-send" onclick="AIStrip.sendMessage()" title="Enviar">
          <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 7h12M8 3l5 4-5 4"/></svg>
        </button>
      </div>
      <div style="text-align:center;padding:4px 0 8px">
        <button class="ai-strip-clear" onclick="AIStrip.clearConversation()">Limpar conversa</button>
      </div>`;
    shell.appendChild(strip);
  },
};
window.UnifiedCanvas = UnifiedCanvas;
