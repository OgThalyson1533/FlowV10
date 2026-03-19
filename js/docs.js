// ============================================================
//  ProjectFlow — js/docs.js  v3.0
//  Motor Conversacional de Documentação
//  • Wizard guiado por perguntas (projeto + fases)
//  • Persistência localStorage
//  • Diagrama de cadeia interativo SVG
//  • Próximos passos automáticos
//  • Export PDF completo
// ============================================================
'use strict';

// ════════════════════════════════════════════════════════════
//  STORE — persistência localStorage
// ════════════════════════════════════════════════════════════
const DocsStore = {
  _key: 'pf_docs_v3',
  load()  { try { return JSON.parse(localStorage.getItem(this._key) || '{}'); } catch { return {}; } },
  save(d) { localStorage.setItem(this._key, JSON.stringify(d)); },
  getProject(id)        { return this.load()[id] || null; },
  saveProject(id, proj) { const s = this.load(); s[id] = proj; this.save(s); },
  deleteProject(id)     { const s = this.load(); delete s[id]; this.save(s); },
  getAllProjects()       { return this.load(); },
};

// ════════════════════════════════════════════════════════════
//  WIZARD ENGINE
// ════════════════════════════════════════════════════════════
const WizardEngine = {
  projectQuestions: [
    { id:'name',        label:'Nome do projeto',            placeholder:'Ex: Website Rebrand 2025',        required:true  },
    { id:'description', label:'Descrição do projeto',       placeholder:'O que este projeto entrega?',     required:true,  multiline:true },
    { id:'objective',   label:'Objetivo principal',         placeholder:'Ex: Aumentar conversão em 30%',   required:false },
    { id:'client',      label:'Cliente / Stakeholder',      placeholder:'Ex: Customer A',                  required:false },
    { id:'owner',       label:'Responsável pelo projeto',   placeholder:'Ex: João Lima',                   required:true  },
    { id:'budget',      label:'Orçamento estimado',         placeholder:'Ex: R$ 15.000',                   required:false },
    { id:'start_date',  label:'Data de início',             placeholder:'Ex: Jan 2025',                    required:false },
    { id:'end_date',    label:'Previsão de entrega',        placeholder:'Ex: Mar 2025',                    required:false },
    { id:'stack',       label:'Tecnologias / Ferramentas',  placeholder:'Ex: React, SQL Server, Figma',    required:false },
    { id:'color',       label:'Cor do projeto',             placeholder:'#d97757',                         required:false, isColor:true  },
  ],
  phaseQuestions: [
    { id:'name',        label:'Nome da fase',               placeholder:'Ex: Pesquisa de usuários',        required:true  },
    { id:'description', label:'O que aconteceu nesta fase?',placeholder:'Descreva o que foi feito...',     required:true,  multiline:true },
    { id:'responsible', label:'Responsável',                placeholder:'Ex: Ana Lopes',                   required:false },
    { id:'start_date',  label:'Data de início',             placeholder:'Ex: Jan 10, 2025',                required:false },
    { id:'end_date',    label:'Data de conclusão',          placeholder:'Vazio se ainda em andamento',     required:false },
    { id:'status',      label:'Status atual',               placeholder:'',                                required:true,  isSelect:true,
      options:[
        { value:'done',    label:'✓  Concluído'          },
        { value:'wip',     label:'◐  Em Andamento'       },
        { value:'blocked', label:'○  Pendente / Bloqueado'},
      ]
    },
    { id:'artifacts',   label:'Artefatos produzidos',       placeholder:'Ex: Wireframes, Relatório\n(um por linha ou vírgula)',  required:false, multiline:true },
    { id:'decisions',   label:'Decisões tomadas',           placeholder:'Ex: Adotamos React\n(uma por linha)',                   required:false, multiline:true },
    { id:'risks',       label:'Riscos identificados',       placeholder:'Ex: Prazo apertado\n(um por linha)',                    required:false, multiline:true },
    { id:'next_action', label:'Próxima ação desta fase',    placeholder:'Ex: Aguardando aprovação do cliente',                   required:false },
    { id:'tools',       label:'Ferramentas usadas',         placeholder:'Ex: Figma, SQL Server, Power BI',                       required:false },
    { id:'notes',       label:'Observações adicionais',     placeholder:'Qualquer informação relevante...',                      required:false, multiline:true },
  ],

  getNextSteps(project) {
    const steps  = [];
    const phases = project.phases || [];
    if (!phases.length) {
      steps.push({ icon:'➕', text:'Adicione a primeira fase para começar a documentar a cadeia.', action:'add_phase' });
      return steps;
    }
    const done    = phases.filter(p => p.status === 'done').length;
    const wip     = phases.filter(p => p.status === 'wip');
    const blocked = phases.filter(p => p.status === 'blocked');
    const pct     = Math.round((done / phases.length) * 100);

    wip.forEach(p => steps.push({ icon:'🔄', text:`"${p.name}" está em andamento — atualize o progresso ou marque como concluído.`, action:'edit_phase', phaseId:p.id }));
    if (blocked.length && done > 0) steps.push({ icon:'⏭', text:`Considere iniciar: "${blocked[0].name}".`, action:'edit_phase', phaseId:blocked[0].id });
    if (!project.objective) steps.push({ icon:'🎯', text:'Defina o objetivo principal do projeto.', action:'edit_project' });
    if (phases.some(p => !p.artifacts || !p.artifacts.length)) steps.push({ icon:'📎', text:'Registre artefatos nas fases sem entregas documentadas.', action:null });
    if (pct === 100) steps.push({ icon:'🏁', text:'Todas as fases concluídas! Gere o PDF final.', action:'export_pdf' });
    else if (pct >= 75) steps.push({ icon:'🚀', text:`Projeto ${pct}% completo — na reta final!`, action:null });
    if (phases.length < 3) steps.push({ icon:'➕', text:'Adicione mais etapas para documentar toda a cadeia.', action:'add_phase' });
    if (!steps.length) steps.push({ icon:'✅', text:'Projeto bem documentado! Continue atualizando conforme avança.', action:null });
    return steps;
  },

  validate(answers, questions) {
    const errors = {};
    questions.forEach(q => {
      if (q.required && (!answers[q.id] || answers[q.id].toString().trim() === '')) errors[q.id] = 'Campo obrigatório';
    });
    return errors;
  },

  parseList(str) {
    if (!str || !str.trim()) return [];
    return str.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
  },
};

// ════════════════════════════════════════════════════════════
//  ESTADO DA UI
// ════════════════════════════════════════════════════════════
window.DocsUI = {
  mode:'list', activeProjectId:null, activeView:'chain',
  wizardStep:0, wizardAnswers:{}, editingPhaseId:null, editingProject:false, errors:{},
};

// ════════════════════════════════════════════════════════════
//  RENDER PRINCIPAL
// ════════════════════════════════════════════════════════════
function renderDocsView() {
  const c = document.getElementById('view-docs');
  if (!c) return;
  if (DocsUI.mode === 'list')           c.innerHTML = renderProjectList();
  else if (DocsUI.mode === 'project')   c.innerHTML = renderProjectDetail();
  else if (DocsUI.mode === 'wizard_project') c.innerHTML = renderWizardProject();
  else if (DocsUI.mode === 'wizard_phase')   c.innerHTML = renderWizardPhase();
  if (DocsUI.mode === 'project' && DocsUI.activeView === 'chain') setTimeout(drawChainConnectors, 120);
}

// ════════════════════════════════════════════════════════════
//  TELA 1 — LISTA DE PROJETOS
// ════════════════════════════════════════════════════════════
function renderProjectList() {
  const projects = Object.entries(DocsStore.getAllProjects());
  const board    = (window.mockProjects || []).filter(mp => !DocsStore.getProject(mp.id));
  return `<div class="dl-root">
    <div class="dl-header">
      <div>
        <div class="dl-title">📋 Documentação de Projetos</div>
        <div class="dl-sub">Registre, acompanhe e exporte a cadeia completa de cada projeto</div>
      </div>
      <button class="dl-btn-new" onclick="startNewProjectWizard()">
        <svg viewBox="0 0 14 14" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" width="13" height="13"><path d="M7 1v12M1 7h12"/></svg>
        Novo Projeto
      </button>
    </div>
    ${!projects.length && !board.length ? `<div class="dl-empty">
      <div style="font-size:40px;margin-bottom:14px">📄</div>
      <div class="dl-empty-title">Nenhum projeto documentado</div>
      <div class="dl-empty-sub">Clique em "Novo Projeto" para começar a registrar a cadeia completa de um projeto.</div>
      <button class="dl-btn-new" style="margin-top:20px" onclick="startNewProjectWizard()">Criar primeira documentação</button>
    </div>` : ''}
    ${projects.length ? `<div class="dl-section-label">Documentados</div>
    <div class="dl-grid">${projects.map(([id,p]) => renderProjectCard(id,p)).join('')}</div>` : ''}
    ${board.length ? `<div class="dl-section-label" style="margin-top:${projects.length?'28px':'0'}">Projetos do Board (sem documentação)</div>
    <div class="dl-grid">${board.map(mp => renderBoardCard(mp)).join('')}</div>` : ''}
  </div>`;
}

function renderProjectCard(id, proj) {
  const phases = proj.phases || [];
  const done   = phases.filter(p => p.status === 'done').length;
  const pct    = phases.length ? Math.round((done/phases.length)*100) : 0;
  const c      = proj.color || '#d97757';
  return `<div class="dl-card" onclick="openProjectDoc('${id}')">
    <div class="dl-card-dot" style="background:${c}"></div>
    <div class="dl-card-body">
      <div class="dl-card-name">${proj.name}</div>
      <div class="dl-card-desc">${proj.description || 'Sem descrição'}</div>
      <div class="dl-card-meta">${proj.owner?`<span>👤 ${proj.owner}</span>`:''} ${proj.client?`<span>🏢 ${proj.client}</span>`:''} ${proj.end_date?`<span>📅 ${proj.end_date}</span>`:''}</div>
    </div>
    <div class="dl-card-right">
      <div class="dl-card-pct" style="color:${c}">${pct}%</div>
      <div class="dl-card-phases">${phases.length} fase(s)</div>
      <div class="dl-card-bar"><div class="dl-card-bar-fill" style="width:${pct}%;background:${c}"></div></div>
    </div>
  </div>`;
}

function renderBoardCard(mp) {
  return `<div class="dl-card dl-card-ghost" onclick="startDocFromBoard('${mp.id}')">
    <div class="dl-card-dot" style="background:${mp.color}"></div>
    <div class="dl-card-body">
      <div class="dl-card-name">${mp.name}</div>
      <div class="dl-card-desc" style="color:var(--tx-3);font-style:italic">Clique para iniciar a documentação deste projeto</div>
    </div>
    <div class="dl-card-right"><span class="dl-badge-ghost">+ Documentar</span></div>
  </div>`;
}

// ════════════════════════════════════════════════════════════
//  WIZARD — PROJETO
// ════════════════════════════════════════════════════════════
function renderWizardProject() {
  const qs = WizardEngine.projectQuestions;
  const s = DocsUI.wizardStep, q = qs[s], total = qs.length, a = DocsUI.wizardAnswers;
  return `<div class="wz-root"><div class="wz-card">
    <div class="wz-progress-track"><div class="wz-progress-fill" style="width:${Math.round(((s+1)/total)*100)}%"></div></div>
    <div class="wz-header">
      <button class="wz-back-btn" onclick="${s===0 ? (DocsUI.editingProject ? 'cancelWizard()' : "DocsUI.mode='list';renderDocsView()") : 'wizardBack()'}">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="16" height="16"><path d="M9 2L3 7l6 5"/></svg>
      </button>
      <div class="wz-step-label">Projeto · ${s+1} de ${total}</div>
      <div style="width:32px"></div>
    </div>
    <div class="wz-body">
      <div class="wz-question">${q.label}${q.required ? ' <span class="wz-req">*</span>' : ''}</div>
      ${wizardFieldHTML(q, a)}
      ${DocsUI.errors[q.id] ? `<div class="wz-error">${DocsUI.errors[q.id]}</div>` : ''}
      ${!q.required ? `<div class="wz-optional">Opcional — pressione Enter para pular</div>` : ''}
    </div>
    <div class="wz-footer">
      ${s < total-1 ?
        `<button class="wz-btn-primary" onclick="wizardNext()">Continuar →</button>` :
        `<button class="wz-btn-primary" onclick="wizardSaveProject()">${DocsUI.editingProject ? 'Salvar alterações' : 'Criar projeto ✓'}</button>`
      }
    </div>
    ${s > 0 ? renderWizardPreview(qs, a, s) : ''}
  </div></div>`;
}

// ════════════════════════════════════════════════════════════
//  WIZARD — FASE
// ════════════════════════════════════════════════════════════
function renderWizardPhase() {
  const qs = WizardEngine.phaseQuestions;
  const s = DocsUI.wizardStep, q = qs[s], total = qs.length, a = DocsUI.wizardAnswers;
  const proj = DocsStore.getProject(DocsUI.activeProjectId);
  const c    = proj?.color || 'var(--ac)';
  return `<div class="wz-root"><div class="wz-card">
    <div class="wz-progress-track"><div class="wz-progress-fill" style="width:${Math.round(((s+1)/total)*100)}%;background:${c}"></div></div>
    <div class="wz-header">
      <button class="wz-back-btn" onclick="${s===0 ? 'cancelWizard()' : 'wizardBack()'}">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="16" height="16"><path d="M9 2L3 7l6 5"/></svg>
      </button>
      <div class="wz-step-label">${DocsUI.editingPhaseId ? 'Editar fase' : 'Nova fase'} · ${s+1} de ${total}</div>
      <div style="width:32px"></div>
    </div>
    <div class="wz-body">
      <div class="wz-project-ctx">
        <div class="wz-ctx-dot" style="background:${c}"></div>
        ${proj?.name || 'Projeto'}
      </div>
      <div class="wz-question">${q.label}${q.required ? ' <span class="wz-req">*</span>' : ''}</div>
      ${wizardFieldHTML(q, a, c)}
      ${DocsUI.errors[q.id] ? `<div class="wz-error">${DocsUI.errors[q.id]}</div>` : ''}
      ${!q.required ? `<div class="wz-optional">Opcional — pressione Enter para pular</div>` : ''}
    </div>
    <div class="wz-footer">
      ${s < total-1 ?
        `<button class="wz-btn-primary" onclick="wizardNext()" style="background:${c}">Continuar →</button>` :
        `<button class="wz-btn-primary" onclick="wizardSavePhase()" style="background:${c}">${DocsUI.editingPhaseId ? 'Salvar fase ✓' : 'Adicionar fase ✓'}</button>`
      }
    </div>
    ${s > 0 ? renderWizardPreview(qs, a, s) : ''}
  </div></div>`;
}

function wizardFieldHTML(q, a, accentColor) {
  if (q.isSelect) return `<div class="wz-select-group">
    ${q.options.map(opt => `<label class="wz-select-option ${a[q.id]===opt.value?'selected':''}">
      <input type="radio" name="wz-field" value="${opt.value}"
        onchange="wizardSetAnswer('${q.id}', this.value)"
        ${a[q.id]===opt.value?'checked':''}>
      ${opt.label}
    </label>`).join('')}
  </div>`;
  if (q.isColor) return `<div class="wz-color-row">
    <input class="wz-input" id="wz-field" type="text" value="${a[q.id]||''}" placeholder="${q.placeholder}"
      oninput="wizardSetAnswer('${q.id}', this.value)">
    <input type="color" class="wz-color-picker" value="${a[q.id]||'#d97757'}"
      onchange="document.getElementById('wz-field').value=this.value; wizardSetAnswer('${q.id}', this.value)">
  </div>
  <div class="wz-color-presets">
    ${['#d97757','#7c5cbf','#4a7cf6','#1a9e5f','#c48a0a','#dc3545','#06b6d4','#f59e0b'].map(c =>
      `<button class="wz-color-swatch ${(a[q.id]||'#d97757')===c?'active':''}" style="background:${c}"
        onclick="wizardSetAnswer('${q.id}','${c}');document.getElementById('wz-field').value='${c}';renderDocsView()"></button>`
    ).join('')}
  </div>`;
  if (q.multiline) return `<textarea class="wz-textarea" id="wz-field" placeholder="${q.placeholder}"
    oninput="wizardSetAnswer('${q.id}', this.value)">${a[q.id]||''}</textarea>`;
  return `<input class="wz-input" id="wz-field" type="text" value="${a[q.id]||''}" placeholder="${q.placeholder}"
    oninput="wizardSetAnswer('${q.id}', this.value)"
    onkeydown="if(event.key==='Enter')wizardNext()">`;
}

function renderWizardPreview(qs, a, step) {
  const items = qs.slice(0,step).filter(qq => a[qq.id]);
  if (!items.length) return '';
  return `<div class="wz-preview">${items.map(qq => `
    <div class="wz-preview-item">
      <span class="wz-preview-key">${qq.label}</span>
      <span class="wz-preview-val">${a[qq.id]}</span>
    </div>`).join('')}
  </div>`;
}

// ════════════════════════════════════════════════════════════
//  TELA DETALHE DO PROJETO
// ════════════════════════════════════════════════════════════
function renderProjectDetail() {
  const proj = DocsStore.getProject(DocsUI.activeProjectId);
  if (!proj) { DocsUI.mode='list'; renderDocsView(); return ''; }
  const phases = proj.phases || [];
  const done   = phases.filter(p => p.status==='done').length;
  const pct    = phases.length ? Math.round((done/phases.length)*100) : 0;
  const steps  = WizardEngine.getNextSteps(proj);
  const c      = proj.color || '#d97757';
  const tabs   = [
    { id:'chain',  label:'Diagrama',          icon:'<path d="M1 8h3M10 8h3M4 8a4 4 0 008 0 4 4 0 00-8 0z"/>' },
    { id:'phases', label:'Fases',             icon:'<rect x="1" y="3" width="14" height="10" rx="2"/><path d="M1 7h14M5 11h6"/>' },
    { id:'steps',  label:`Próximos (${steps.length})`, icon:'<path d="M3 7l3 3 5-5"/><circle cx="8" cy="8" r="6"/>' },
    { id:'data',   label:'Dados',             icon:'<ellipse cx="8" cy="4" rx="6" ry="2"/><path d="M2 4v4c0 1.1 2.7 2 6 2s6-.9 6-2V4"/><path d="M2 8v4c0 1.1 2.7 2 6 2s6-.9 6-2V8"/>' },
  ];
  return `<div class="pd-root">
    <div class="pd-topbar">
      <button class="pd-back" onclick="DocsUI.mode='list';renderDocsView()">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="12" height="12"><path d="M9 2L3 7l6 5"/></svg>
        Projetos
      </button>
      <div class="pd-title-row">
        <div class="pd-dot" style="background:${c}"></div>
        <div class="pd-name">${proj.name}</div>
        <div class="pd-pct" style="color:${c}">${pct}%</div>
      </div>
      <div class="pd-actions">
        <button class="pd-btn" onclick="editProject()">✏ Editar</button>
        <button class="pd-btn" style="background:${c};border-color:${c};color:white" onclick="exportDocsPDF()">📄 PDF</button>
      </div>
    </div>
    <div class="pd-kpis">
      ${[{v:`${done}/${phases.length}`,l:'Fases'},{v:proj.owner||'—',l:'Responsável'},{v:proj.client||'—',l:'Cliente'},{v:proj.budget||'—',l:'Orçamento'},{v:proj.start_date||'—',l:'Início'},{v:proj.end_date||'—',l:'Entrega'}]
        .map(k => `<div class="pd-kpi"><div class="pd-kpi-val">${k.v}</div><div class="pd-kpi-label">${k.l}</div></div>`).join('')}
    </div>
    <div class="pd-prog-wrap">
      <div class="pd-prog-track"><div class="pd-prog-fill" style="width:${pct}%;background:${c}"></div></div>
      <span class="pd-prog-pct" style="color:${c}">${pct}%</span>
    </div>
    <div class="pd-tabs">
      ${tabs.map(t => `<button class="pd-tab ${DocsUI.activeView===t.id?'active':''}"
        onclick="DocsUI.activeView='${t.id}';renderDocsView()"
        style="${DocsUI.activeView===t.id ? `border-bottom-color:${c};color:${c}` : ''}">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="13" height="13">${t.icon}</svg>
        ${t.label}
      </button>`).join('')}
    </div>
    <div class="pd-content" id="pd-content">
      ${DocsUI.activeView==='chain'  ? renderChainView(proj,c)       : ''}
      ${DocsUI.activeView==='phases' ? renderPhasesView(proj,c)      : ''}
      ${DocsUI.activeView==='steps'  ? renderNextStepsView(steps,c)  : ''}
      ${DocsUI.activeView==='data'   ? renderDataView(proj)          : ''}
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════════
//  DIAGRAMA DE CADEIA
// ════════════════════════════════════════════════════════════
function renderChainView(proj, color) {
  const phases = proj.phases || [];
  const sc = {done:'#1a9e5f',wip:'#d97757',blocked:'#9a9a94'};
  const sl = {done:'Concluído',wip:'Em Andamento',blocked:'Pendente'};
  const si = {done:'✓',wip:'◐',blocked:'○'};
  if (!phases.length) return `<div class="chain-empty">
    <div style="font-size:36px;margin-bottom:12px">🔗</div>
    <div style="font-size:14px;font-weight:600;color:var(--tx-2);margin-bottom:8px">Nenhuma fase cadastrada</div>
    <div style="font-size:12px;color:var(--tx-3);margin-bottom:16px">Adicione etapas para visualizar o diagrama de cadeia</div>
    <button class="pd-add-phase" style="background:${color}" onclick="startPhaseWizard()">+ Adicionar primeira fase</button>
  </div>`;
  return `<div class="chain-view">
    ${proj.description ? `<div class="chain-desc-row">
      <div class="chain-desc-text">${proj.description}</div>
      ${proj.stack ? `<div class="chain-stack-row">${WizardEngine.parseList(proj.stack).map(s=>`<span class="chain-chip">${s}</span>`).join('')}</div>` : ''}
    </div>` : ''}
    <div class="chain-scroll-area" id="chain-diagram">
      <svg class="chain-svg-overlay" id="chain-svg"></svg>
      ${phases.map((ph,i) => `
        <div class="chain-node chain-node--${ph.status}" id="cnode-${ph.id}" onclick="editPhase('${ph.id}')">
          <div class="cn-header">
            <div class="cn-badge" style="background:${sc[ph.status]}20;color:${sc[ph.status]};border-color:${sc[ph.status]}40">${si[ph.status]} ${sl[ph.status]}</div>
            <div class="cn-index">${i+1}</div>
          </div>
          <div class="cn-name">${ph.name}</div>
          ${ph.responsible ? `<div class="cn-resp">👤 ${ph.responsible}</div>` : ''}
          ${ph.end_date||ph.start_date ? `<div class="cn-date">📅 ${ph.start_date||''}${ph.end_date?' → '+ph.end_date:''}</div>` : ''}
          ${ph.artifacts&&ph.artifacts.length ? `<div class="cn-artifacts">
            ${ph.artifacts.slice(0,2).map(a=>`<span class="cn-chip">${a}</span>`).join('')}
            ${ph.artifacts.length>2?`<span class="cn-chip">+${ph.artifacts.length-2}</span>`:''}
          </div>` : ''}
          ${ph.next_action ? `<div class="cn-next">→ ${ph.next_action}</div>` : ''}
          <div class="cn-edit-hint">clique para editar</div>
        </div>`).join('')}
      <div class="chain-add-node" onclick="startPhaseWizard()">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" width="18" height="18"><path d="M8 2v12M2 8h12"/></svg>
        <span>Nova fase</span>
      </div>
    </div>
  </div>`;
}

function drawChainConnectors() {
  const svg  = document.getElementById('chain-svg');
  const area = document.getElementById('chain-diagram');
  if (!svg || !area) return;
  const proj = DocsStore.getProject(DocsUI.activeProjectId);
  if (!proj || !proj.phases || proj.phases.length < 2) return;
  const aR = area.getBoundingClientRect();
  const sW = area.scrollWidth, sH = area.scrollHeight;
  svg.style.width  = sW + 'px';
  svg.style.height = sH + 'px';
  svg.setAttribute('viewBox', `0 0 ${sW} ${sH}`);
  const sc = {done:'#1a9e5f',wip:'#d97757',blocked:'#9a9a94'};
  let m = `<defs>${proj.phases.map(ph => `<marker id="arr-${ph.id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
    <path d="M1.5 2.5L8.5 5L1.5 7.5" fill="none" stroke="${sc[ph.status]||'#9a9a94'}" stroke-width="1.6" stroke-linecap="round"/>
  </marker>`).join('')}</defs>`;
  for (let i = 0; i < proj.phases.length-1; i++) {
    const f = document.getElementById('cnode-'+proj.phases[i].id);
    const t = document.getElementById('cnode-'+proj.phases[i+1].id);
    if (!f||!t) continue;
    const fR = f.getBoundingClientRect(), tR = t.getBoundingClientRect();
    const x1 = fR.right-aR.left+area.scrollLeft, y1 = fR.top+fR.height/2-aR.top+area.scrollTop;
    const x2 = tR.left-aR.left+area.scrollLeft,  y2 = tR.top+tR.height/2-aR.top+area.scrollTop;
    const mx = (x1+x2)/2, col = sc[proj.phases[i].status]||'#9a9a94';
    m += `<path d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}" fill="none" stroke="${col}" stroke-width="1.8" stroke-dasharray="5 3" opacity="0.7" marker-end="url(#arr-${proj.phases[i].id})"/>`;
  }
  svg.innerHTML = m;
}

// ════════════════════════════════════════════════════════════
//  VIEW — FASES EXPANDIDAS
// ════════════════════════════════════════════════════════════
function renderPhasesView(proj, color) {
  const phases = proj.phases || [];
  const sc = {done:'#1a9e5f',wip:'#d97757',blocked:'#9a9a94'};
  const sl = {done:'Concluído',wip:'Em Andamento',blocked:'Pendente'};
  return `<div class="phases-view">
    <div class="phases-hdr-row">
      <div class="phases-count">${phases.length} fase(s)</div>
      <button class="pd-add-phase" style="background:${color}" onclick="startPhaseWizard()">+ Adicionar fase</button>
    </div>
    ${!phases.length ? `<div class="chain-empty">
      <div style="font-size:32px;margin-bottom:12px">📋</div>
      <div style="font-size:14px;font-weight:600;color:var(--tx-2)">Sem fases cadastradas</div>
      <button class="pd-add-phase" style="background:${color};margin-top:16px" onclick="startPhaseWizard()">+ Primeira fase</button>
    </div>` : ''}
    <div class="phases-list">
      ${phases.map((ph,i) => `<div class="phase-row phase-row--${ph.status}">
        <div class="phase-row-num" style="background:${sc[ph.status]}15;color:${sc[ph.status]};border-color:${sc[ph.status]}30">${i+1}</div>
        <div class="phase-row-body">
          <div class="phase-row-top">
            <div class="phase-row-name">${ph.name}</div>
            <div class="phase-row-badge" style="background:${sc[ph.status]}15;color:${sc[ph.status]}">${sl[ph.status]}</div>
          </div>
          ${ph.description ? `<div class="phase-row-desc">${ph.description}</div>` : ''}
          <div class="phase-row-meta">
            ${ph.responsible?`<span>👤 ${ph.responsible}</span>`:''}
            ${ph.start_date?`<span>📅 ${ph.start_date}${ph.end_date?' → '+ph.end_date:''}</span>`:''}
            ${ph.tools?`<span>🛠 ${ph.tools}</span>`:''}
          </div>
          ${ph.artifacts&&ph.artifacts.length ? `<div class="phase-row-section">
            <div class="phase-row-slabel">Artefatos</div>
            <div class="phase-row-chips">${ph.artifacts.map(a=>`<span class="phase-chip">${a}</span>`).join('')}</div>
          </div>` : ''}
          ${ph.decisions&&ph.decisions.length ? `<div class="phase-row-section">
            <div class="phase-row-slabel">Decisões</div>
            ${ph.decisions.map(d=>`<div class="phase-row-decision">${d}</div>`).join('')}
          </div>` : ''}
          ${ph.risks&&ph.risks.length ? `<div class="phase-row-section">
            <div class="phase-row-slabel">Riscos</div>
            ${ph.risks.map(r=>`<div class="phase-row-risk">⚠ ${r}</div>`).join('')}
          </div>` : ''}
          ${ph.next_action ? `<div class="phase-row-next">→ Próxima ação: ${ph.next_action}</div>` : ''}
          ${ph.notes ? `<div class="phase-row-notes">${ph.notes}</div>` : ''}
        </div>
        <div class="phase-row-actions">
          <button class="phase-row-btn" onclick="editPhase('${ph.id}')">Editar</button>
          <button class="phase-row-btn phase-row-btn--del" onclick="deletePhase('${ph.id}')">×</button>
        </div>
      </div>`).join('')}
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════════
//  VIEW — PRÓXIMOS PASSOS
// ════════════════════════════════════════════════════════════
function renderNextStepsView(steps, color) {
  return `<div class="steps-view">
    <div class="steps-header">
      <div class="steps-title">O que fazer agora</div>
      <div class="steps-sub">Recomendações baseadas no estado atual do projeto</div>
    </div>
    <div class="steps-list">
      ${steps.map((s,i) => `<div class="step-item" style="animation-delay:${i*60}ms">
        <div class="step-icon">${s.icon}</div>
        <div class="step-text">${s.text}</div>
        ${s.action==='add_phase'    ? `<button class="step-btn" style="background:${color}" onclick="startPhaseWizard()">+ Adicionar</button>` : ''}
        ${s.action==='edit_phase'   ? `<button class="step-btn" style="background:${color}" onclick="editPhase('${s.phaseId}')">Atualizar</button>` : ''}
        ${s.action==='edit_project' ? `<button class="step-btn" style="background:${color}" onclick="editProject()">Editar</button>` : ''}
        ${s.action==='export_pdf'   ? `<button class="step-btn" style="background:${color}" onclick="exportDocsPDF()">📄 PDF</button>` : ''}
      </div>`).join('')}
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════════
//  VIEW — DADOS CONSOLIDADOS
// ════════════════════════════════════════════════════════════
function renderDataView(proj) {
  const phases = proj.phases || [];
  const allArt  = phases.flatMap(p => p.artifacts||[]);
  const allDec  = phases.flatMap(p => p.decisions||[]);
  const allRisk = phases.flatMap(p => p.risks||[]);
  const sc = {done:'#1a9e5f',wip:'#d97757',blocked:'#9a9a94'};
  const sl = {done:'Concluído',wip:'Em Andamento',blocked:'Pendente'};
  return `<div class="data-view">
    <div class="dv-block">
      <div class="dv-block-title">📊 Resumo Geral</div>
      <div class="dv-table">
        ${[
          ['Projeto', proj.name], ['Objetivo', proj.objective||'—'],
          ['Responsável', proj.owner||'—'], ['Cliente', proj.client||'—'],
          ['Orçamento', proj.budget||'—'], ['Período', `${proj.start_date||'—'} → ${proj.end_date||'—'}`],
          ['Stack', WizardEngine.parseList(proj.stack||'').join(', ')||'—'],
          ['Total fases', phases.length], ['Concluídas', phases.filter(p=>p.status==='done').length],
          ['Em andamento', phases.filter(p=>p.status==='wip').length],
          ['Artefatos', allArt.length], ['Decisões', allDec.length], ['Riscos', allRisk.length],
        ].map(([k,v]) => `<div class="dv-row"><span class="dv-key">${k}</span><span>${v}</span></div>`).join('')}
      </div>
    </div>
    ${allArt.length ? `<div class="dv-block">
      <div class="dv-block-title">📎 Artefatos (${allArt.length})</div>
      <div class="dv-chips">${allArt.map(a=>`<span class="dv-chip">${a}</span>`).join('')}</div>
    </div>` : ''}
    ${allDec.length ? `<div class="dv-block">
      <div class="dv-block-title">💡 Decisões (${allDec.length})</div>
      ${allDec.map(d=>`<div class="dv-decision">${d}</div>`).join('')}
    </div>` : ''}
    <div class="dv-block">
      <div class="dv-block-title">🗂 Matriz de Fases</div>
      <table class="dv-matrix">
        <thead><tr><th>#</th><th>Fase</th><th>Status</th><th>Responsável</th><th>Artefatos</th></tr></thead>
        <tbody>${phases.map((p,i) => `<tr>
          <td>${i+1}</td><td>${p.name}</td>
          <td><span style="color:${sc[p.status]};font-weight:600">${sl[p.status]}</span></td>
          <td>${p.responsible||'—'}</td><td>${(p.artifacts||[]).length}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="dv-actions">
      <button class="dv-btn" onclick="exportDocsJSON()">⬇ JSON</button>
      <button class="dv-btn dv-btn--danger" onclick="deleteProjectDoc()">🗑 Remover</button>
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════════
//  CONTROLES DO WIZARD
// ════════════════════════════════════════════════════════════
function wizardSetAnswer(id, value) {
  DocsUI.wizardAnswers[id] = value;
  if (DocsUI.errors[id]) { delete DocsUI.errors[id]; document.querySelector('.wz-error')?.remove(); }
}

function wizardNext() {
  const qs = DocsUI.mode === 'wizard_project' ? WizardEngine.projectQuestions : WizardEngine.phaseQuestions;
  const q  = qs[DocsUI.wizardStep];
  if (q.required && (!DocsUI.wizardAnswers[q.id]||DocsUI.wizardAnswers[q.id].toString().trim()==='')) {
    DocsUI.errors = {[q.id]: 'Este campo é obrigatório'};
    renderDocsView(); return;
  }
  DocsUI.errors = {};
  if (DocsUI.wizardStep < qs.length-1) {
    DocsUI.wizardStep++;
    renderDocsView();
    setTimeout(() => document.getElementById('wz-field')?.focus(), 80);
  }
}

function wizardBack() {
  DocsUI.errors = {};
  if (DocsUI.wizardStep > 0) { DocsUI.wizardStep--; renderDocsView(); setTimeout(() => document.getElementById('wz-field')?.focus(), 80); }
}

function wizardSaveProject() {
  const a = DocsUI.wizardAnswers;
  const errors = WizardEngine.validate(a, WizardEngine.projectQuestions);
  if (Object.keys(errors).length) { DocsUI.errors = errors; renderDocsView(); return; }
  const id       = DocsUI.activeProjectId || a.name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')+'-'+Date.now();
  const existing = DocsStore.getProject(id) || {};
  const proj     = { ...existing,
    name:a.name.trim(), description:a.description?.trim()||'', objective:a.objective?.trim()||'',
    client:a.client?.trim()||'', owner:a.owner?.trim()||'', budget:a.budget?.trim()||'',
    start_date:a.start_date?.trim()||'', end_date:a.end_date?.trim()||'',
    stack:a.stack?.trim()||'', color:a.color?.trim()||'#d97757',
    phases:existing.phases||[], created_at:existing.created_at||new Date().toISOString(),
    updated_at:new Date().toISOString(),
  };
  DocsStore.saveProject(id, proj);
  const wasEditing = DocsUI.editingProject;
  DocsUI.activeProjectId=id; DocsUI.mode='project';
  DocsUI.activeView=proj.phases.length?'chain':'steps';
  DocsUI.wizardAnswers={}; DocsUI.editingProject=false;
  renderDocsView();
  showToast(wasEditing ? 'Projeto atualizado ✓' : 'Projeto criado! Adicione as fases. ✓');
}

function wizardSavePhase() {
  const a = DocsUI.wizardAnswers;
  const errors = WizardEngine.validate(a, WizardEngine.phaseQuestions);
  if (Object.keys(errors).length) { DocsUI.errors = errors; renderDocsView(); return; }
  const proj = DocsStore.getProject(DocsUI.activeProjectId);
  if (!proj) return;
  const phase = {
    id: DocsUI.editingPhaseId || 'ph-'+Date.now(),
    name:a.name?.trim()||'Fase', description:a.description?.trim()||'',
    responsible:a.responsible?.trim()||'', start_date:a.start_date?.trim()||'',
    end_date:a.end_date?.trim()||'', status:a.status||'wip',
    artifacts: WizardEngine.parseList(a.artifacts||''),
    decisions: WizardEngine.parseList(a.decisions||''),
    risks:     WizardEngine.parseList(a.risks||''),
    next_action:a.next_action?.trim()||'', tools:a.tools?.trim()||'',
    notes:a.notes?.trim()||'', updated_at:new Date().toISOString(),
  };
  if (DocsUI.editingPhaseId) {
    const idx = proj.phases.findIndex(p => p.id === DocsUI.editingPhaseId);
    if (idx !== -1) proj.phases[idx] = phase;
  } else {
    proj.phases.push(phase);
  }
  proj.updated_at = new Date().toISOString();
  DocsStore.saveProject(DocsUI.activeProjectId, proj);
  const wasEditing = DocsUI.editingPhaseId;
  DocsUI.mode='project'; DocsUI.activeView='chain';
  DocsUI.wizardAnswers={}; DocsUI.editingPhaseId=null;
  renderDocsView();
  showToast(wasEditing ? 'Fase atualizada ✓' : 'Fase adicionada à cadeia ✓');
}

// ════════════════════════════════════════════════════════════
//  AÇÕES
// ════════════════════════════════════════════════════════════
function startNewProjectWizard() {
  DocsUI.mode='wizard_project'; DocsUI.wizardStep=0; DocsUI.wizardAnswers={};
  DocsUI.errors={}; DocsUI.editingProject=false; DocsUI.activeProjectId=null;
  renderDocsView(); setTimeout(() => document.getElementById('wz-field')?.focus(), 100);
}

function startDocFromBoard(boardId) {
  const mp = (window.mockProjects||[]).find(p => p.id===boardId);
  DocsUI.mode='wizard_project'; DocsUI.wizardStep=0;
  DocsUI.wizardAnswers = mp ? {name:mp.name, color:mp.color} : {};
  DocsUI.errors={}; DocsUI.editingProject=false; DocsUI.activeProjectId=boardId;
  renderDocsView(); setTimeout(() => document.getElementById('wz-field')?.focus(), 100);
}

function openProjectDoc(id) {
  DocsUI.activeProjectId=id; DocsUI.mode='project'; DocsUI.activeView='chain'; renderDocsView();
}

function editProject() {
  const proj = DocsStore.getProject(DocsUI.activeProjectId);
  if (!proj) return;
  DocsUI.mode='wizard_project'; DocsUI.wizardStep=0; DocsUI.editingProject=true;
  DocsUI.wizardAnswers={ name:proj.name, description:proj.description, objective:proj.objective,
    client:proj.client, owner:proj.owner, budget:proj.budget,
    start_date:proj.start_date, end_date:proj.end_date, stack:proj.stack, color:proj.color };
  DocsUI.errors={}; renderDocsView();
}

function cancelWizard() {
  DocsUI.errors={}; DocsUI.wizardAnswers={}; DocsUI.wizardStep=0;
  DocsUI.mode = DocsUI.activeProjectId ? 'project' : 'list';
  renderDocsView();
}

function startPhaseWizard() {
  DocsUI.mode='wizard_phase'; DocsUI.wizardStep=0; DocsUI.wizardAnswers={};
  DocsUI.errors={}; DocsUI.editingPhaseId=null;
  renderDocsView(); setTimeout(() => document.getElementById('wz-field')?.focus(), 100);
}

function editPhase(phId) {
  const proj  = DocsStore.getProject(DocsUI.activeProjectId);
  const phase = proj?.phases?.find(p => p.id===phId);
  if (!phase) return;
  DocsUI.mode='wizard_phase'; DocsUI.wizardStep=0; DocsUI.editingPhaseId=phId;
  DocsUI.wizardAnswers = { name:phase.name, description:phase.description, responsible:phase.responsible,
    start_date:phase.start_date, end_date:phase.end_date, status:phase.status,
    artifacts:(phase.artifacts||[]).join('\n'), decisions:(phase.decisions||[]).join('\n'),
    risks:(phase.risks||[]).join('\n'), next_action:phase.next_action, tools:phase.tools, notes:phase.notes };
  DocsUI.errors={}; renderDocsView();
}

function deletePhase(phId) {
  if (!confirm('Remover esta fase da documentação?')) return;
  const proj = DocsStore.getProject(DocsUI.activeProjectId);
  if (!proj) return;
  proj.phases = proj.phases.filter(p => p.id !== phId);
  DocsStore.saveProject(DocsUI.activeProjectId, proj);
  renderDocsView(); showToast('Fase removida');
}

function deleteProjectDoc() {
  if (!confirm('Remover toda a documentação? Esta ação não pode ser desfeita.')) return;
  DocsStore.deleteProject(DocsUI.activeProjectId);
  DocsUI.mode='list'; DocsUI.activeProjectId=null;
  renderDocsView(); showToast('Documentação removida');
}

// ════════════════════════════════════════════════════════════
//  EXPORT PDF COMPLETO
// ════════════════════════════════════════════════════════════
function exportDocsPDF() {
  const proj = DocsStore.getProject(DocsUI.activeProjectId);
  if (!proj) return;
  const phases = proj.phases||[], done=phases.filter(p=>p.status==='done').length;
  const pct    = phases.length ? Math.round((done/phases.length)*100) : 0;
  const color  = proj.color||'#d97757';
  const sc     = {done:'#1a9e5f',wip:'#d97757',blocked:'#9a9a94'};
  const sl     = {done:'Concluído',wip:'Em Andamento',blocked:'Pendente'};
  const today  = new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
  const allArt = phases.flatMap(p=>p.artifacts||[]);
  const allDec = phases.flatMap(p=>p.decisions||[]);
  const allRisk= phases.flatMap(p=>p.risks||[]);
  const nodeW  = Math.min(160, Math.max(100, Math.floor(760/(phases.length||1))-16));

  // Diagrama de cadeia para impressão
  const chainDiagram = `<div style="display:flex;align-items:flex-start;gap:0;flex-wrap:wrap;padding:10px 0 24px">
    ${phases.map((ph,i) => `
      <div style="display:flex;align-items:center;gap:0">
        <div style="width:${nodeW}px;border:2px solid ${sc[ph.status]};border-radius:10px;padding:10px 8px;background:${sc[ph.status]}10;position:relative;text-align:center">
          <div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);white-space:nowrap;background:white;padding:0 6px;font-size:9px;font-weight:700;color:${sc[ph.status]};border:1.5px solid ${sc[ph.status]};border-radius:10px">${sl[ph.status]}</div>
          <div style="font-size:11px;font-weight:700;margin-top:6px;margin-bottom:3px">${i+1}. ${ph.name}</div>
          ${ph.responsible?`<div style="font-size:9px;color:#666">👤 ${ph.responsible}</div>`:''}
          ${ph.end_date?`<div style="font-size:9px;color:#888">${ph.end_date}</div>`:''}
          ${(ph.artifacts||[]).slice(0,1).map(a=>`<div style="font-size:8px;background:#f0f0ee;border-radius:3px;padding:1px 4px;margin-top:3px;display:inline-block">${a}</div>`).join('')}
        </div>
        ${i<phases.length-1?`<div style="font-size:20px;color:${sc[ph.status]};padding:0 4px;margin-top:10px">→</div>`:''}
      </div>`).join('')}
  </div>`;

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>${proj.name} — Documentação</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;color:#1a1a18;background:#fff;font-size:13px;line-height:1.6}
  .page{max-width:860px;margin:0 auto;padding:40px 36px}
  h1{font-size:26px;font-weight:800;letter-spacing:-.5px;margin-bottom:6px}
  h2{font-size:15px;font-weight:700;margin:28px 0 12px;padding-bottom:8px;border-bottom:2px solid ${color}}
  .kpi-row{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0}
  .kpi{background:#f8f8f7;border-radius:8px;padding:12px 14px}
  .kpi-v{font-size:17px;font-weight:800;color:${color}}
  .kpi-l{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-top:2px}
  .prog-track{height:8px;background:#eee;border-radius:10px;overflow:hidden;margin:8px 0 4px}
  .prog-fill{height:100%;background:${color};border-radius:10px}
  .phase-card{border:1px solid #e5e5e3;border-left:4px solid;border-radius:8px;padding:14px 16px;margin-bottom:12px;page-break-inside:avoid}
  .phase-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px}
  .phase-name{font-size:14px;font-weight:700}
  .phase-meta{display:flex;gap:14px;font-size:11px;color:#888;margin:5px 0 8px;flex-wrap:wrap}
  .phase-desc{font-size:12px;color:#444;line-height:1.6;margin-bottom:8px}
  .chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:4px}
  .chip{background:#f3f3f1;border:1px solid #e5e5e3;border-radius:4px;padding:2px 8px;font-size:11px;color:#555}
  .decision{border-left:3px solid #4a7cf6;padding:5px 10px;background:#f0f4ff;margin-bottom:4px;font-size:12px;border-radius:0 4px 4px 0}
  .risk{background:#fffbeb;border:1px solid #fde68a;border-radius:4px;padding:5px 10px;font-size:12px;margin-bottom:4px;color:#92400e}
  .next-act{background:${color}10;border-left:3px solid ${color};padding:5px 10px;font-size:12px;margin-top:6px;border-radius:0 4px 4px 0}
  .slabel{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#888;margin:8px 0 4px}
  .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:4px}
  th{background:#f3f3f1;padding:7px 10px;text-align:left;font-weight:600;border-bottom:2px solid #e5e5e3;font-size:11px;text-transform:uppercase;letter-spacing:.4px}
  td{padding:6px 10px;border-bottom:1px solid #f0f0ee;vertical-align:top}
  .footer{margin-top:40px;padding-top:12px;border-top:1px solid #e5e5e3;font-size:11px;color:#aaa;display:flex;justify-content:space-between}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body><div class="page">

  <div style="border-bottom:4px solid ${color};padding-bottom:20px;margin-bottom:22px">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${color};margin-bottom:8px">Documentação de Projeto</div>
    <h1>${proj.name}</h1>
    ${proj.description?`<div style="font-size:13px;color:#555;margin-top:6px;line-height:1.5">${proj.description}</div>`:''}
    ${proj.objective?`<div style="font-size:12px;color:#777;margin-top:4px">🎯 ${proj.objective}</div>`:''}
    <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:#666;margin:10px 0 12px">
      ${proj.owner?`<span>👤 ${proj.owner}</span>`:''}
      ${proj.client?`<span>🏢 ${proj.client}</span>`:''}
      ${proj.budget?`<span>💰 ${proj.budget}</span>`:''}
      ${proj.start_date?`<span>📅 ${proj.start_date}</span>`:''}
      ${proj.end_date?`<span>🏁 ${proj.end_date}</span>`:''}
    </div>
    <span class="badge" style="background:${pct===100?'#dcfce7':'#fff7ed'};color:${pct===100?'#16a34a':'#c2410c'}">
      ${pct===100?'✓ Concluído':`◐ Em Andamento — ${pct}%`}
    </span>
  </div>

  <div class="kpi-row">
    <div class="kpi"><div class="kpi-v">${pct}%</div><div class="kpi-l">Progresso</div></div>
    <div class="kpi"><div class="kpi-v">${done}/${phases.length}</div><div class="kpi-l">Fases concluídas</div></div>
    <div class="kpi"><div class="kpi-v">${allArt.length}</div><div class="kpi-l">Artefatos</div></div>
    <div class="kpi"><div class="kpi-v">${allDec.length}</div><div class="kpi-l">Decisões</div></div>
    <div class="kpi"><div class="kpi-v">${allRisk.length}</div><div class="kpi-l">Riscos mapeados</div></div>
    <div class="kpi"><div class="kpi-v">${WizardEngine.parseList(proj.stack||'').length}</div><div class="kpi-l">Tecnologias</div></div>
  </div>
  <div class="prog-track"><div class="prog-fill" style="width:${pct}%"></div></div>
  <div style="font-size:11px;color:#888;margin-bottom:20px">${pct}% da cadeia documentada</div>

  <h2>Arquitetura Funcional de Transação de Dados</h2>
  ${chainDiagram}

  ${proj.stack?`<h2>Stack Tecnológica</h2><div class="chips" style="margin-bottom:4px">${WizardEngine.parseList(proj.stack).map(s=>`<span class="chip">${s}</span>`).join('')}</div>`:''}

  <h2>Documentação Detalhada por Fase</h2>
  ${phases.map((ph,i) => `
  <div class="phase-card" style="border-left-color:${sc[ph.status]}">
    <div class="phase-head">
      <div>
        <div class="phase-name">${i+1}. ${ph.name}</div>
        <div class="phase-meta">
          ${ph.responsible?`<span>👤 ${ph.responsible}</span>`:''}
          ${ph.start_date?`<span>📅 ${ph.start_date}${ph.end_date?' → '+ph.end_date:''}</span>`:''}
          ${ph.tools?`<span>🛠 ${ph.tools}</span>`:''}
        </div>
      </div>
      <span class="badge" style="background:${sc[ph.status]}15;color:${sc[ph.status]}">${sl[ph.status]}</span>
    </div>
    ${ph.description?`<div class="phase-desc">${ph.description}</div>`:''}
    ${ph.artifacts&&ph.artifacts.length?`<div class="slabel">Artefatos</div><div class="chips">${ph.artifacts.map(a=>`<span class="chip">${a}</span>`).join('')}</div>`:''}
    ${ph.decisions&&ph.decisions.length?`<div class="slabel" style="margin-top:8px">Decisões</div>${ph.decisions.map(d=>`<div class="decision">${d}</div>`).join('')}`:''}
    ${ph.risks&&ph.risks.length?`<div class="slabel" style="margin-top:8px">Riscos</div>${ph.risks.map(r=>`<div class="risk">⚠ ${r}</div>`).join('')}`:''}
    ${ph.next_action?`<div class="next-act">→ Próxima ação: ${ph.next_action}</div>`:''}
    ${ph.notes?`<div style="margin-top:8px;font-size:12px;color:#666;font-style:italic">${ph.notes}</div>`:''}
  </div>`).join('')}

  ${allDec.length?`<h2>Consolidado de Decisões</h2>${allDec.map(d=>`<div class="decision">${d}</div>`).join('')}`:''}
  ${allArt.length?`<h2>Todos os Artefatos</h2><div class="chips">${allArt.map(a=>`<span class="chip">${a}</span>`).join('')}</div>`:''}

  <h2>Matriz de Fases</h2>
  <table><thead><tr><th>#</th><th>Fase</th><th>Status</th><th>Responsável</th><th>Data</th><th>Artefatos</th></tr></thead>
  <tbody>${phases.map((p,i) => `<tr>
    <td>${i+1}</td><td><strong>${p.name}</strong></td>
    <td style="color:${sc[p.status]};font-weight:600">${sl[p.status]}</td>
    <td>${p.responsible||'—'}</td>
    <td>${p.end_date||p.start_date||'—'}</td>
    <td>${(p.artifacts||[]).join(', ')||'—'}</td>
  </tr>`).join('')}</tbody></table>

  <div class="footer">
    <span>ProjectFlow CRM v2 · Documentação gerada automaticamente</span>
    <span>Gerado em ${today}</span>
  </div>
</div></body></html>`;

  const blob = new Blob([html], {type:'text/html;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (win) setTimeout(() => win.print(), 900);
  showToast('PDF pronto! Use Ctrl+P para salvar 📄');
}

// ════════════════════════════════════════════════════════════
//  EXPORT JSON
// ════════════════════════════════════════════════════════════
function exportDocsJSON() {
  const proj = DocsStore.getProject(DocsUI.activeProjectId);
  if (!proj) return;
  const blob = new Blob([JSON.stringify({exported_at:new Date().toISOString(),project:proj},null,2)], {type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download=(proj.name||'projeto').toLowerCase().replace(/\s+/g,'-')+'-docs.json';
  a.click(); URL.revokeObjectURL(url);
  showToast('JSON exportado ✓');
}
