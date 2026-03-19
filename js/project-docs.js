// ============================================================
//  ProjectFlow — js/project-docs.js
//  Documentação integrada ao projeto do Kanban
//  Sem aba separada — vive dentro de view-project
// ============================================================
'use strict';

// ════════════════════════════════════════════════════════════
//  STORE — persiste docs por projeto no localStorage
// ════════════════════════════════════════════════════════════
const ProjDocs = {
  _key: 'pf_pdocs_v1',
  _data: null,

  _load() {
    if (!this._data) {
      try { this._data = JSON.parse(localStorage.getItem(this._key) || '{}'); }
      catch { this._data = {}; }
    }
    return this._data;
  },

  _save() { localStorage.setItem(this._key, JSON.stringify(this._data)); },

  get(projectId) {
    const d = this._load();
    return d[projectId] || null;
  },

  set(projectId, doc) {
    this._load();
    this._data[projectId] = doc;
    this._save();
  },

  // Cria doc base a partir dos dados do projeto + cards do kanban
  init(projectId) {
    const existing = this.get(projectId);
    if (existing) return existing;

    const proj  = (window.mockProjects || []).find(p => p.id === projectId) || {};
    const cards = (window.mockCards || []).filter(c => c.sl === projectId);

    // Agrupa cards por BPMN step para montar cadeia inicial
    const steps = {};
    (window.BPMN_STEPS || []).forEach(s => { steps[s] = []; });
    cards.forEach(c => { if (steps[c.bpmn]) steps[c.bpmn].push(c); });

    const doc = {
      project_id:  projectId,
      name:        proj.name || projectId,
      color:       proj.color || '#d97757',
      description: '',
      objective:   '',
      client:      '',
      owner:       '',
      budget:      '',
      start_date:  '',
      end_date:    '',
      stack:       '',
      notes:       '',
      created_at:  new Date().toISOString(),
      updated_at:  new Date().toISOString(),
      // Anotações por card (key = card.id)
      card_notes:  {},
    };
    this.set(projectId, doc);
    return doc;
  },

  // Salva anotação de um card específico
  saveCardNote(projectId, cardId, note) {
    const doc = this.get(projectId) || this.init(projectId);
    if (!doc.card_notes) doc.card_notes = {};
    doc.card_notes[cardId] = { ...doc.card_notes[cardId], ...note, updated_at: new Date().toISOString() };
    doc.updated_at = new Date().toISOString();
    this.set(projectId, doc);
  },

  getCardNote(projectId, cardId) {
    const doc = this.get(projectId);
    return doc?.card_notes?.[cardId] || {};
  },
};

// ════════════════════════════════════════════════════════════
//  ESTADO DA VIEW
// ════════════════════════════════════════════════════════════
window.PDState = {
  activeTab:      'overview',  // 'overview' | 'chain' | 'cards' | 'export'
  editingProject: false,
  editingCardId:  null,
  chainFilter:    'all',       // 'all' | 'todo' | 'plan' | 'exec' | 'rev' | 'done'
};

// ════════════════════════════════════════════════════════════
//  RENDER PRINCIPAL
// ════════════════════════════════════════════════════════════
function renderProjectDoc(projectId) {
  const container = document.getElementById('view-project');
  if (!container) return;

  const proj  = (window.mockProjects || []).find(p => p.id === projectId);
  if (!proj) { container.innerHTML = '<div style="padding:32px;color:var(--tx-3)">Projeto não encontrado</div>'; return; }

  const doc    = ProjDocs.init(projectId);
  const cards  = (window.mockCards || []).filter(c => c.sl === projectId);
  const color  = proj.color || '#d97757';

  // Métricas derivadas dos cards reais do Kanban
  const total    = cards.length;
  const done     = cards.filter(c => c.bpmn === 'concluido').length;
  const inExec   = cards.filter(c => c.col === 'exec').length;
  const inRev    = cards.filter(c => c.col === 'rev').length;
  const pct      = total ? Math.round((done / total) * 100) : 0;
  const budgets  = cards.map(c => c.budget ? parseFloat(c.budget.replace(/[^0-9.]/g,'')) || 0 : 0);
  const totalBudget = budgets.reduce((a,b) => a+b, 0);

  // Próxima ação sugerida
  const nextCard = cards.find(c => c.col === 'rev') || cards.find(c => c.col === 'exec') || cards.find(c => c.col === 'plan');

  const tabs = [
    { id:'overview', label:'Visão Geral',   icon:'<circle cx="8" cy="8" r="6"/><path d="M8 5v4l2.5 1.5"/>' },
    { id:'chain',    label:'Cadeia',        icon:'<path d="M1 8h3M10 8h3"/><circle cx="6.5" cy="8" r="2.5"/><circle cx="11" cy="8" r="0"/>' },
    { id:'cards',    label:`Tarefas (${total})`, icon:'<rect x="1" y="2" width="14" height="12" rx="2"/><path d="M5 6h6M5 9h4"/>' },
    { id:'export',   label:'Exportar',      icon:'<rect x="1" y="1" width="14" height="14" rx="2"/><path d="M8 5v6M5 9l3 3 3-3"/>' },
  ];

  container.innerHTML = `
  <div class="pv-root">
    <!-- TOPBAR DO PROJETO -->
    <div class="pv-topbar">
      <div class="pv-title-row">
        <div class="pv-dot" style="background:${color}"></div>
        <div>
          <div class="pv-name">${proj.name}</div>
          ${doc.description ? `<div class="pv-desc-short">${doc.description.slice(0,80)}${doc.description.length>80?'…':''}</div>` : ''}
        </div>
        <div class="pv-progress-pill" style="background:${color}15;color:${color};border-color:${color}30">
          ${pct}% concluído
        </div>
      </div>
      <div class="pv-kpis">
        <div class="pv-kpi"><div class="pv-kpi-val" style="color:${color}">${total}</div><div class="pv-kpi-lbl">Tarefas</div></div>
        <div class="pv-kpi"><div class="pv-kpi-val" style="color:#1a9e5f">${done}</div><div class="pv-kpi-lbl">Concluídas</div></div>
        <div class="pv-kpi"><div class="pv-kpi-val" style="color:#d97757">${inExec}</div><div class="pv-kpi-lbl">Em execução</div></div>
        <div class="pv-kpi"><div class="pv-kpi-val" style="color:#4a7cf6">${inRev}</div><div class="pv-kpi-lbl">Em revisão</div></div>
        ${totalBudget > 0 ? `<div class="pv-kpi"><div class="pv-kpi-val">$${totalBudget.toLocaleString('pt-BR')}</div><div class="pv-kpi-lbl">Budget total</div></div>` : ''}
        ${doc.owner ? `<div class="pv-kpi"><div class="pv-kpi-val" style="font-size:12px">${doc.owner}</div><div class="pv-kpi-lbl">Responsável</div></div>` : ''}
      </div>
      <!-- BARRA DE PROGRESSO -->
      <div class="pv-prog-wrap">
        <div class="pv-prog-track">
          <div class="pv-prog-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <button class="pv-edit-btn" onclick="openProjectInfoModal('${projectId}')">
          <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="12" height="12"><path d="M9.5 2.5l2 2L4 12l-3 .5.5-3z"/></svg>
          ${doc.description ? 'Editar info' : '+ Adicionar info'}
        </button>
      </div>
    </div>

    <!-- TABS -->
    <div class="pv-tabs">
      ${tabs.map(t => `
        <button class="pv-tab ${PDState.activeTab === t.id ? 'active' : ''}"
          onclick="PDState.activeTab='${t.id}';renderProjectDoc('${projectId}')"
          style="${PDState.activeTab === t.id ? `border-bottom-color:${color};color:${color}` : ''}">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="13" height="13">${t.icon}</svg>
          ${t.label}
        </button>`).join('')}
    </div>

    <!-- CONTEÚDO DA TAB -->
    <div class="pv-content" id="pv-content">
      ${PDState.activeTab === 'overview' ? renderOverview(projectId, proj, doc, cards, color) : ''}
      ${PDState.activeTab === 'chain'    ? renderChain(projectId, proj, doc, cards, color)    : ''}
      ${PDState.activeTab === 'cards'    ? renderCards(projectId, cards, color)               : ''}
      ${PDState.activeTab === 'export'   ? renderExport(projectId, proj, doc, cards, color)   : ''}
    </div>
  </div>

  <!-- MODAL DE INFO DO PROJETO -->
  <div class="pv-modal-overlay" id="pv-info-modal" onclick="if(event.target===this)closePVModal('pv-info-modal')">
    <div class="pv-modal" id="pv-info-modal-body"></div>
  </div>

  <!-- MODAL DE ANOTAÇÃO DO CARD -->
  <div class="pv-modal-overlay" id="pv-card-modal" onclick="if(event.target===this)closePVModal('pv-card-modal')">
    <div class="pv-modal" id="pv-card-modal-body"></div>
  </div>
  `;

  // Desenhar conectores SVG após render
  if (PDState.activeTab === 'chain') setTimeout(() => drawPVChain(projectId), 120);
}

// ════════════════════════════════════════════════════════════
//  TAB — VISÃO GERAL
// ════════════════════════════════════════════════════════════
function renderOverview(projectId, proj, doc, cards, color) {
  const bpmnStatus = {};
  (window.BPMN_STEPS || []).forEach(s => bpmnStatus[s] = cards.filter(c => c.bpmn === s).length);

  // Próximo passo inteligente
  const suggestions = [];
  const revisar  = cards.filter(c => c.col === 'rev');
  const executar = cards.filter(c => c.col === 'exec');
  const planej   = cards.filter(c => c.col === 'plan');
  if (revisar.length)  suggestions.push({ icon:'🔍', text:`${revisar.length} tarefa(s) aguardando revisão`, cardId: revisar[0]?.id });
  if (executar.length) suggestions.push({ icon:'⚙', text:`${executar.length} tarefa(s) em execução`, cardId: executar[0]?.id });
  if (planej.length)   suggestions.push({ icon:'📌', text:`${planej.length} tarefa(s) priorizadas para iniciar`, cardId: planej[0]?.id });
  if (!doc.description) suggestions.push({ icon:'📝', text:'Adicione uma descrição ao projeto', action:'edit' });
  if (!doc.owner)       suggestions.push({ icon:'👤', text:'Defina o responsável pelo projeto', action:'edit' });

  const team = window.mockTeam || [];
  const assignees = [...new Set(cards.map(c => c.assignee).filter(Boolean))];
  const activeMembers = assignees.map(id => team.find(m => m.id === id)).filter(Boolean);

  // BPMN flow visual com contagem real
  const bpmnFlow = (window.BPMN_STEPS || []).map((s, i) => {
    const count = bpmnStatus[s] || 0;
    const hasActive = count > 0;
    const sc = { esbocar:'#9a9a94', viabilizar:'#9a9a94', atribuir:'#7c5cbf', executar:'#c48a0a', avaliar:'#4a7cf6', corrigir:'#dc3545', validar_cliente:'#4a7cf6', concluido:'#1a9e5f' };
    const label = (window.BPMN_LABEL || {})[s] || s;
    return `
      ${i > 0 ? '<div class="bpmn-conn"></div>' : ''}
      <div class="bpmn-step ${hasActive ? 'bpmn-step--active' : ''}" style="${hasActive ? `border-color:${sc[s]}40;background:${sc[s]}08` : ''}">
        <div class="bpmn-step-dot" style="background:${hasActive ? sc[s] : 'var(--bg-3)'}"></div>
        <div class="bpmn-step-name">${label}</div>
        ${hasActive ? `<div class="bpmn-step-count" style="background:${sc[s]}20;color:${sc[s]}">${count}</div>` : ''}
      </div>`;
  }).join('');

  return `
  <div class="ov-root">
    <!-- BPMN PIPELINE -->
    <div class="ov-section-title">Pipeline BPMN — Distribuição atual</div>
    <div class="ov-bpmn-scroll">
      <div class="ov-bpmn-flow">${bpmnFlow}</div>
    </div>

    <!-- INFO DO PROJETO -->
    <div class="ov-info-grid">
      <div class="ov-info-card">
        <div class="ov-info-label">Sobre o projeto</div>
        ${doc.description ? `<div class="ov-info-value">${doc.description}</div>` : `<div class="ov-info-empty" onclick="openProjectInfoModal('${projectId}')">+ Adicionar descrição</div>`}
      </div>
      <div class="ov-info-card">
        <div class="ov-info-label">Objetivo</div>
        ${doc.objective ? `<div class="ov-info-value">${doc.objective}</div>` : `<div class="ov-info-empty" onclick="openProjectInfoModal('${projectId}')">+ Adicionar objetivo</div>`}
      </div>
      ${doc.client || doc.owner || doc.budget ? `
      <div class="ov-info-card">
        <div class="ov-info-label">Metadados</div>
        <div class="ov-meta-rows">
          ${doc.client    ? `<div class="ov-meta-row"><span class="ov-meta-key">Cliente</span>${doc.client}</div>` : ''}
          ${doc.owner     ? `<div class="ov-meta-row"><span class="ov-meta-key">Responsável</span>${doc.owner}</div>` : ''}
          ${doc.budget    ? `<div class="ov-meta-row"><span class="ov-meta-key">Orçamento</span>${doc.budget}</div>` : ''}
          ${doc.start_date? `<div class="ov-meta-row"><span class="ov-meta-key">Início</span>${doc.start_date}</div>` : ''}
          ${doc.end_date  ? `<div class="ov-meta-row"><span class="ov-meta-key">Entrega</span>${doc.end_date}</div>` : ''}
          ${doc.stack     ? `<div class="ov-meta-row"><span class="ov-meta-key">Stack</span>${doc.stack}</div>` : ''}
        </div>
      </div>` : ''}
    </div>

    <!-- PRÓXIMOS PASSOS -->
    ${suggestions.length ? `
    <div class="ov-section-title">Próximos passos sugeridos</div>
    <div class="ov-suggestions">
      ${suggestions.slice(0,4).map(s => `
        <div class="ov-suggestion" onclick="${s.action === 'edit' ? `openProjectInfoModal('${projectId}')` : s.cardId ? `openCardFromDoc('${s.cardId}')` : ''}">
          <span class="ov-sug-icon">${s.icon}</span>
          <span class="ov-sug-text">${s.text}</span>
          <span class="ov-sug-arrow">→</span>
        </div>`).join('')}
    </div>` : ''}

    <!-- EQUIPE ATIVA -->
    ${activeMembers.length ? `
    <div class="ov-section-title">Equipe ativa no projeto</div>
    <div class="ov-team-row">
      ${activeMembers.map(m => {
        const memberCards = cards.filter(c => c.assignee === m.id);
        const donePct = memberCards.length ? Math.round(memberCards.filter(c=>c.bpmn==='concluido').length/memberCards.length*100) : 0;
        return `<div class="ov-team-card">
          <div class="avatar" style="background:${m.color};width:36px;height:36px;font-size:13px">${m.initials}</div>
          <div class="ov-team-name">${m.name}</div>
          <div class="ov-team-meta">${memberCards.length} tarefas · ${donePct}% done</div>
        </div>`;
      }).join('')}
    </div>` : ''}

    ${doc.notes ? `
    <div class="ov-section-title">Notas do projeto</div>
    <div class="ov-notes-block">${doc.notes}</div>` : ''}
  </div>`;
}

// ════════════════════════════════════════════════════════════
//  TAB — CADEIA (diagrama SVG conectando cards do Kanban)
// ════════════════════════════════════════════════════════════
function renderChain(projectId, proj, doc, cards, color) {
  const colFilter = PDState.chainFilter;
  const visibleCols = colFilter === 'all'
    ? (window.COLUMNS || ['todo','plan','exec','rev','done'])
    : [colFilter];

  const colName  = window.COL_NAME  || { todo:'Planejado', plan:'Prioridade', exec:'Em Execução', rev:'Em Revisão', done:'Concluído' };
  const colColor = { todo:'#9a9a94', plan:'#7c5cbf', exec:'#c48a0a', rev:'#4a7cf6', done:'#1a9e5f' };
  const bpmnLabel= window.BPMN_LABEL || {};

  const filterBtns = ['all','todo','plan','exec','rev','done'].map(f => `
    <button class="chain-filter-btn ${colFilter===f?'active':''}"
      onclick="PDState.chainFilter='${f}';renderProjectDoc('${projectId}')"
      style="${colFilter===f && f!=='all' ? `background:${colColor[f]}15;color:${colColor[f]};border-color:${colColor[f]}40` : ''}">
      ${f==='all' ? 'Todas' : colName[f]}
      <span class="chain-filter-count">${f==='all' ? cards.length : cards.filter(c=>c.col===f).length}</span>
    </button>`).join('');

  const colsHTML = visibleCols.map(col => {
    const colCards = cards.filter(c => c.col === col);
    if (!colCards.length && colFilter !== 'all') return '';
    return `
    <div class="chain-col">
      <div class="chain-col-hdr" style="color:${colColor[col]}">
        <div class="chain-col-dot" style="background:${colColor[col]}"></div>
        ${colName[col]}
        <span class="chain-col-cnt" style="background:${colColor[col]}15;color:${colColor[col]}">${colCards.length}</span>
      </div>
      <div class="chain-col-cards">
        ${colCards.map(c => {
          const note = ProjDocs.getCardNote(projectId, c.id);
          const member = (window.mockTeam||[]).find(m => m.id === c.assignee);
          const hasNote = note.decision || note.artifact || note.risk || note.notes;
          return `
          <div class="chain-card chain-card--${col} ${hasNote?'chain-card--noted':''}" id="cc-${c.id}"
            onclick="openCardNoteModal('${projectId}', '${c.id}')">
            <div class="chain-card-top">
              <div class="chain-card-bpmn" style="color:${colColor[col]}">${bpmnLabel[c.bpmn]||c.bpmn}</div>
              ${hasNote ? `<div class="chain-card-noted-dot" title="Anotações registradas"></div>` : ''}
            </div>
            <div class="chain-card-title">${c.title}</div>
            ${c.budget || c.hours ? `<div class="chain-card-meta">${c.budget||''} ${c.hours||''}</div>` : ''}
            ${member ? `<div class="chain-card-member">
              <div class="avatar" style="background:${member.color};width:18px;height:18px;font-size:8px">${member.initials}</div>
              ${member.name.split(' ')[0]}
            </div>` : ''}
            ${note.decision ? `<div class="chain-card-annotation chain-ca--decision">💡 ${note.decision.slice(0,60)}${note.decision.length>60?'…':''}</div>` : ''}
            ${note.artifact ? `<div class="chain-card-annotation chain-ca--artifact">📎 ${note.artifact.slice(0,60)}${note.artifact.length>60?'…':''}</div>` : ''}
            ${note.risk     ? `<div class="chain-card-annotation chain-ca--risk">⚠ ${note.risk.slice(0,60)}${note.risk.length>60?'…':''}</div>` : ''}
            <div class="chain-card-hint">clique para anotar</div>
          </div>`;
        }).join('')}
        ${colCards.length === 0 ? `<div class="chain-col-empty">Sem tarefas</div>` : ''}
      </div>
    </div>`;
  }).join('');

  return `
  <div class="chain-root">
    <div class="chain-toolbar">
      <div class="chain-filter-group">${filterBtns}</div>
      <div class="chain-legend">
        <span class="chain-legend-item"><span class="chain-legend-dot" style="background:#4a7cf6"></span>Decisão</span>
        <span class="chain-legend-item"><span class="chain-legend-dot" style="background:#1a9e5f"></span>Artefato</span>
        <span class="chain-legend-item"><span class="chain-legend-dot" style="background:#c48a0a"></span>Risco</span>
      </div>
    </div>
    <div class="chain-board" id="pv-chain-board">
      <svg class="chain-board-svg" id="pv-chain-svg"></svg>
      ${colsHTML}
    </div>
    <div class="chain-help">
      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="12" height="12"><circle cx="7" cy="7" r="6"/><path d="M7 5v3M7 10v.5"/></svg>
      Clique em qualquer tarefa para registrar decisões, artefatos produzidos, riscos e observações
    </div>
  </div>`;
}

function drawPVChain(projectId) {
  // Conectores SVG entre colunas (de done para próxima não-vazia)
  const svg   = document.getElementById('pv-chain-svg');
  const board = document.getElementById('pv-chain-board');
  if (!svg || !board) return;
  // Limpa e ajusta tamanho
  svg.style.width  = board.scrollWidth + 'px';
  svg.style.height = board.scrollHeight + 'px';
  svg.setAttribute('viewBox', `0 0 ${board.scrollWidth} ${board.scrollHeight}`);

  const cols   = (window.COLUMNS || ['todo','plan','exec','rev','done']);
  const aRect  = board.getBoundingClientRect();
  const colColor = { todo:'#9a9a94', plan:'#7c5cbf', exec:'#c48a0a', rev:'#4a7cf6', done:'#1a9e5f' };

  let markup = '<defs>' + cols.map(c => `
    <marker id="pvarr-${c}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
      <path d="M1.5 2.5L8.5 5L1.5 7.5" fill="none" stroke="${colColor[c]}" stroke-width="1.5" stroke-linecap="round"/>
    </marker>`).join('') + '</defs>';

  // Conectar header de colunas adjacentes
  for (let i = 0; i < cols.length - 1; i++) {
    const fromHdr = document.querySelector(`.chain-col:nth-child(${i+2}) .chain-col-hdr`);
    const toHdr   = document.querySelector(`.chain-col:nth-child(${i+3}) .chain-col-hdr`);
    if (!fromHdr || !toHdr) continue;
    const fR = fromHdr.getBoundingClientRect();
    const tR = toHdr.getBoundingClientRect();
    const x1 = fR.right  - aRect.left + board.scrollLeft;
    const y1 = fR.top    + fR.height/2 - aRect.top  + board.scrollTop;
    const x2 = tR.left   - aRect.left + board.scrollLeft - 4;
    const y2 = tR.top    + tR.height/2 - aRect.top  + board.scrollTop;
    const mx = (x1+x2)/2;
    markup += `<path d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}"
      fill="none" stroke="${colColor[cols[i]]}" stroke-width="1.5"
      stroke-dasharray="4 3" opacity="0.5"
      marker-end="url(#pvarr-${cols[i]})"/>`;
  }
  svg.innerHTML = markup;
}

// ════════════════════════════════════════════════════════════
//  TAB — TAREFAS DOCUMENTADAS
// ════════════════════════════════════════════════════════════
function renderCards(projectId, cards, color) {
  const colColor = { todo:'#9a9a94', plan:'#7c5cbf', exec:'#c48a0a', rev:'#4a7cf6', done:'#1a9e5f' };
  const colName  = window.COL_NAME || {};
  const bpmnLabel= window.BPMN_LABEL || {};

  // Agrupa por coluna
  const groups = (window.COLUMNS||[]).map(col => ({
    col, name: colName[col], color: colColor[col],
    cards: cards.filter(c => c.col === col)
  })).filter(g => g.cards.length > 0);

  return `
  <div class="cards-doc-root">
    ${groups.map(g => `
      <div class="cards-doc-group">
        <div class="cards-doc-group-hdr" style="color:${g.color}">
          <div class="cards-doc-dot" style="background:${g.color}"></div>
          ${g.name}
          <span class="cards-doc-cnt" style="background:${g.color}15;color:${g.color}">${g.cards.length}</span>
        </div>
        <div class="cards-doc-list">
          ${g.cards.map(c => {
            const note   = ProjDocs.getCardNote(projectId, c.id);
            const member = (window.mockTeam||[]).find(m => m.id === c.assignee);
            const hasNote= note.decision || note.artifact || note.risk || note.notes || note.next_action;
            return `
            <div class="cards-doc-item ${hasNote?'cards-doc-item--noted':''}">
              <div class="cards-doc-item-top">
                <div class="cards-doc-bpmn-badge" style="background:${g.color}12;color:${g.color}">${bpmnLabel[c.bpmn]||c.bpmn}</div>
                <div class="cards-doc-item-title">${c.title}</div>
                <button class="cards-doc-note-btn ${hasNote?'cards-doc-note-btn--has':''}"
                  onclick="openCardNoteModal('${projectId}','${c.id}')"
                  style="${hasNote ? `background:${g.color}15;color:${g.color};border-color:${g.color}30` : ''}">
                  ${hasNote ? '✏ Editar anotação' : '+ Anotar'}
                </button>
              </div>
              ${c.desc ? `<div class="cards-doc-desc">${c.desc}</div>` : ''}
              <div class="cards-doc-meta">
                ${member ? `<span>👤 ${member.name}</span>` : ''}
                ${c.date ? `<span>📅 ${c.date}</span>` : ''}
                ${c.budget ? `<span>💰 ${c.budget}</span>` : ''}
                ${c.hours ? `<span>⏱ ${c.hours}</span>` : ''}
              </div>
              ${hasNote ? `
              <div class="cards-doc-annotations">
                ${note.decision    ? `<div class="cda cda--decision"><span>💡 Decisão:</span> ${note.decision}</div>` : ''}
                ${note.artifact    ? `<div class="cda cda--artifact"><span>📎 Artefato:</span> ${note.artifact}</div>` : ''}
                ${note.risk        ? `<div class="cda cda--risk"><span>⚠ Risco:</span> ${note.risk}</div>` : ''}
                ${note.next_action ? `<div class="cda cda--next"><span>→ Próxima ação:</span> ${note.next_action}</div>` : ''}
                ${note.notes       ? `<div class="cda cda--notes"><span>📝 Notas:</span> ${note.notes}</div>` : ''}
              </div>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>`).join('')}
  </div>`;
}

// ════════════════════════════════════════════════════════════
//  TAB — EXPORTAR
// ════════════════════════════════════════════════════════════
function renderExport(projectId, proj, doc, cards, color) {
  const done  = cards.filter(c => c.bpmn === 'concluido').length;
  const pct   = cards.length ? Math.round((done/cards.length)*100) : 0;
  const noted = cards.filter(c => {
    const n = ProjDocs.getCardNote(projectId, c.id);
    return n.decision || n.artifact || n.risk || n.notes;
  }).length;

  return `
  <div class="export-root">
    <div class="export-preview">
      <div class="export-preview-title">📄 Documentação Completa — ${proj.name}</div>
      <div class="export-stats">
        <div class="export-stat"><div class="es-val" style="color:${color}">${pct}%</div><div class="es-lbl">Progresso</div></div>
        <div class="export-stat"><div class="es-val">${cards.length}</div><div class="es-lbl">Tarefas</div></div>
        <div class="export-stat"><div class="es-val" style="color:#1a9e5f">${done}</div><div class="es-lbl">Concluídas</div></div>
        <div class="export-stat"><div class="es-val" style="color:#4a7cf6">${noted}</div><div class="es-lbl">Com anotações</div></div>
      </div>
      ${doc.description ? `<div class="export-desc">${doc.description}</div>` : '<div class="export-desc" style="color:var(--tx-3);font-style:italic">Adicione informações do projeto na aba Visão Geral para enriquecer o PDF.</div>'}
    </div>
    <div class="export-actions">
      <button class="export-btn export-btn--pdf" onclick="exportProjectPDF('${projectId}')" style="background:${color};border-color:${color}">
        <svg viewBox="0 0 16 16" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" width="16" height="16"><rect x="1" y="1" width="14" height="14" rx="2"/><path d="M4 5h8M4 8h8M4 11h5"/><path d="M10 10v5M8 13l2 2 2-2"/></svg>
        Exportar PDF completo
      </button>
      <button class="export-btn" onclick="exportProjectJSON('${projectId}')">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="16" height="16"><path d="M2 4h12M2 8h8M2 12h6"/></svg>
        Exportar JSON
      </button>
    </div>
    <div class="export-checklist">
      <div class="export-check-title">Checklist antes de exportar</div>
      ${[
        { ok: !!doc.description, label: 'Descrição do projeto preenchida' },
        { ok: !!doc.objective,   label: 'Objetivo definido' },
        { ok: !!doc.owner,       label: 'Responsável identificado' },
        { ok: noted > 0,         label: `Pelo menos uma tarefa com anotações (${noted}/${cards.length})` },
        { ok: done > 0,          label: `Pelo menos uma tarefa concluída (${done}/${cards.length})` },
      ].map(item => `
        <div class="export-check-item">
          <div class="export-check-dot ${item.ok ? 'export-check-dot--ok' : ''}">
            ${item.ok ? '✓' : '○'}
          </div>
          <span style="color:${item.ok ? 'var(--tx-1)' : 'var(--tx-3)'}">${item.label}</span>
        </div>`).join('')}
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════════
//  MODAL — INFO DO PROJETO
// ════════════════════════════════════════════════════════════
function openProjectInfoModal(projectId) {
  const doc   = ProjDocs.get(projectId) || ProjDocs.init(projectId);
  const proj  = (window.mockProjects||[]).find(p => p.id === projectId) || {};
  const color = proj.color || '#d97757';

  const fields = [
    { id:'description', label:'Descrição do projeto',      type:'textarea', val: doc.description },
    { id:'objective',   label:'Objetivo principal',        type:'text',     val: doc.objective   },
    { id:'client',      label:'Cliente / Stakeholder',     type:'text',     val: doc.client      },
    { id:'owner',       label:'Responsável (PM)',          type:'text',     val: doc.owner       },
    { id:'budget',      label:'Orçamento total',           type:'text',     val: doc.budget      },
    { id:'start_date',  label:'Data de início',            type:'text',     val: doc.start_date  },
    { id:'end_date',    label:'Previsão de entrega',       type:'text',     val: doc.end_date    },
    { id:'stack',       label:'Stack / Ferramentas',       type:'text',     val: doc.stack       },
    { id:'notes',       label:'Notas gerais do projeto',   type:'textarea', val: doc.notes       },
  ];

  document.getElementById('pv-info-modal-body').innerHTML = `
    <div class="pvm-hdr">
      <div class="pvm-title">
        <div class="pvm-dot" style="background:${color}"></div>
        Info do Projeto
      </div>
      <button class="pvm-close" onclick="closePVModal('pv-info-modal')">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" width="14" height="14"><path d="M2 2l10 10M12 2L2 12"/></svg>
      </button>
    </div>
    <div class="pvm-body">
      ${fields.map(f => `
        <div class="pvm-field">
          <label class="pvm-label">${f.label}</label>
          ${f.type === 'textarea'
            ? `<textarea class="pvm-input pvm-textarea" id="pvf-${f.id}" placeholder="${f.label}...">${f.val||''}</textarea>`
            : `<input class="pvm-input" id="pvf-${f.id}" type="text" value="${f.val||''}" placeholder="${f.label}...">`
          }
        </div>`).join('')}
    </div>
    <div class="pvm-footer">
      <button class="pvm-btn-cancel" onclick="closePVModal('pv-info-modal')">Cancelar</button>
      <button class="pvm-btn-save" style="background:${color}" onclick="saveProjectInfo('${projectId}')">Salvar ✓</button>
    </div>`;

  document.getElementById('pv-info-modal').classList.add('open');
}

function saveProjectInfo(projectId) {
  const doc = ProjDocs.get(projectId) || ProjDocs.init(projectId);
  ['description','objective','client','owner','budget','start_date','end_date','stack','notes'].forEach(f => {
    const el = document.getElementById('pvf-' + f);
    if (el) doc[f] = el.value.trim();
  });
  doc.updated_at = new Date().toISOString();
  ProjDocs.set(projectId, doc);
  closePVModal('pv-info-modal');
  renderProjectDoc(projectId);
  window.showToast && showToast('Informações salvas ✓');
}

// ════════════════════════════════════════════════════════════
//  MODAL — ANOTAÇÃO DE CARD
// ════════════════════════════════════════════════════════════
function openCardNoteModal(projectId, cardId) {
  const card  = (window.mockCards||[]).find(c => c.id === cardId);
  if (!card) return;
  const note  = ProjDocs.getCardNote(projectId, cardId);
  const proj  = (window.mockProjects||[]).find(p => p.id === projectId) || {};
  const color = proj.color || '#d97757';
  const bLabel= (window.BPMN_LABEL||{})[card.bpmn] || card.bpmn;
  const colColor = { todo:'#9a9a94', plan:'#7c5cbf', exec:'#c48a0a', rev:'#4a7cf6', done:'#1a9e5f' };

  document.getElementById('pv-card-modal-body').innerHTML = `
    <div class="pvm-hdr">
      <div style="flex:1;min-width:0">
        <div class="pvm-card-bpmn" style="color:${colColor[card.col]||color}">● ${bLabel.toUpperCase()}</div>
        <div class="pvm-title" style="font-size:15px;margin-top:4px">${card.title}</div>
      </div>
      <button class="pvm-close" onclick="closePVModal('pv-card-modal')">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" width="14" height="14"><path d="M2 2l10 10M12 2L2 12"/></svg>
      </button>
    </div>
    <div class="pvm-body">
      ${card.desc ? `<div class="pvm-card-desc">${card.desc}</div>` : ''}
      <div class="pvm-field">
        <label class="pvm-label">
          <span style="color:#4a7cf6">💡</span> Decisão tomada
        </label>
        <textarea class="pvm-input pvm-textarea" id="pvn-decision" placeholder="Ex: Decidimos usar React em vez de Vue por compatibilidade com o time...">${note.decision||''}</textarea>
      </div>
      <div class="pvm-field">
        <label class="pvm-label">
          <span style="color:#1a9e5f">📎</span> Artefato produzido
        </label>
        <input class="pvm-input" id="pvn-artifact" type="text" value="${note.artifact||''}" placeholder="Ex: Wireframes v2, PRD aprovado, SQL de migração...">
      </div>
      <div class="pvm-field">
        <label class="pvm-label">
          <span style="color:#c48a0a">⚠</span> Risco identificado
        </label>
        <input class="pvm-input" id="pvn-risk" type="text" value="${note.risk||''}" placeholder="Ex: Prazo apertado, dependência externa...">
      </div>
      <div class="pvm-field">
        <label class="pvm-label">
          <span style="color:${color}">→</span> Próxima ação
        </label>
        <input class="pvm-input" id="pvn-next" type="text" value="${note.next_action||''}" placeholder="Ex: Aguardando aprovação do cliente...">
      </div>
      <div class="pvm-field">
        <label class="pvm-label">📝 Notas livres</label>
        <textarea class="pvm-input pvm-textarea" id="pvn-notes" placeholder="Qualquer observação relevante...">${note.notes||''}</textarea>
      </div>
    </div>
    <div class="pvm-footer">
      ${note.decision || note.artifact || note.risk ? `
      <button class="pvm-btn-danger" onclick="clearCardNote('${projectId}','${cardId}')">Limpar</button>` : '<div></div>'}
      <div style="display:flex;gap:8px">
        <button class="pvm-btn-cancel" onclick="closePVModal('pv-card-modal')">Cancelar</button>
        <button class="pvm-btn-save" style="background:${color}" onclick="saveCardNote('${projectId}','${cardId}')">Salvar ✓</button>
      </div>
    </div>`;

  document.getElementById('pv-card-modal').classList.add('open');
  setTimeout(() => document.getElementById('pvn-decision')?.focus(), 100);
}

function saveCardNote(projectId, cardId) {
  const note = {
    decision:    document.getElementById('pvn-decision')?.value.trim() || '',
    artifact:    document.getElementById('pvn-artifact')?.value.trim() || '',
    risk:        document.getElementById('pvn-risk')?.value.trim()     || '',
    next_action: document.getElementById('pvn-next')?.value.trim()     || '',
    notes:       document.getElementById('pvn-notes')?.value.trim()    || '',
  };
  ProjDocs.saveCardNote(projectId, cardId, note);
  closePVModal('pv-card-modal');
  renderProjectDoc(projectId);
  window.showToast && showToast('Anotação salva ✓');
}

function clearCardNote(projectId, cardId) {
  ProjDocs.saveCardNote(projectId, cardId, { decision:'', artifact:'', risk:'', next_action:'', notes:'' });
  closePVModal('pv-card-modal');
  renderProjectDoc(projectId);
  window.showToast && showToast('Anotação removida');
}

function closePVModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

function openCardFromDoc(cardId) {
  if (window.openCardModal) openCardModal(cardId);
}

// ════════════════════════════════════════════════════════════
//  EXPORT PDF
// ════════════════════════════════════════════════════════════
function exportProjectPDF(projectId) {
  const proj   = (window.mockProjects||[]).find(p => p.id === projectId) || {};
  const doc    = ProjDocs.get(projectId) || {};
  const cards  = (window.mockCards||[]).filter(c => c.sl === projectId);
  const color  = proj.color || '#d97757';
  const done   = cards.filter(c => c.bpmn === 'concluido').length;
  const pct    = cards.length ? Math.round((done/cards.length)*100) : 0;
  const today  = new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
  const bLabel = window.BPMN_LABEL || {};
  const colName= window.COL_NAME   || {};
  const colColor = { todo:'#9a9a94', plan:'#7c5cbf', exec:'#c48a0a', rev:'#4a7cf6', done:'#1a9e5f' };

  // Agrupa cards com anotações
  const annotated = cards.filter(c => {
    const n = ProjDocs.getCardNote(projectId, c.id);
    return n.decision || n.artifact || n.risk || n.notes || n.next_action;
  });

  // Diagrama de pipeline para PDF (blocos horizontais)
  const pipeline = (window.COLUMNS||[]).map(col => {
    const cnt = cards.filter(c => c.col === col).length;
    return `<div style="flex:1;text-align:center;padding:10px 8px;background:${colColor[col]}10;border:1.5px solid ${colColor[col]}30;border-radius:8px;margin:0 4px">
      <div style="font-size:14px;font-weight:800;color:${colColor[col]}">${cnt}</div>
      <div style="font-size:10px;color:#666;margin-top:2px">${colName[col]||col}</div>
    </div>`;
  }).join('');

  // Cards por coluna
  const cardsByCol = (window.COLUMNS||[]).map(col => {
    const colCards = cards.filter(c => c.col === col);
    if (!colCards.length) return '';
    return `<div style="margin-bottom:20px">
      <div style="font-size:13px;font-weight:700;color:${colColor[col]};border-bottom:2px solid ${colColor[col]};padding-bottom:6px;margin-bottom:10px">${colName[col]||col} (${colCards.length})</div>
      ${colCards.map(c => {
        const n = ProjDocs.getCardNote(projectId, c.id);
        const member = (window.mockTeam||[]).find(m => m.id === c.assignee);
        return `<div style="border:1px solid #e5e5e3;border-left:3px solid ${colColor[col]};border-radius:6px;padding:10px 12px;margin-bottom:8px;page-break-inside:avoid">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
            <div style="font-size:13px;font-weight:700">${c.title}</div>
            <span style="font-size:10px;background:${colColor[col]}15;color:${colColor[col]};padding:2px 8px;border-radius:10px;white-space:nowrap;margin-left:8px">${bLabel[c.bpmn]||c.bpmn}</span>
          </div>
          ${c.desc ? `<div style="font-size:11px;color:#555;margin-bottom:6px">${c.desc}</div>` : ''}
          <div style="display:flex;gap:12px;font-size:10px;color:#888;margin-bottom:${n.decision||n.artifact||n.risk?'8px':'0'}">
            ${member?`<span>👤 ${member.name}</span>`:''}
            ${c.date?`<span>📅 ${c.date}</span>`:''}
            ${c.budget?`<span>💰 ${c.budget}</span>`:''}
            ${c.hours?`<span>⏱ ${c.hours}</span>`:''}
          </div>
          ${n.decision    ? `<div style="border-left:3px solid #4a7cf6;padding:4px 8px;background:#f0f4ff;font-size:11px;border-radius:0 4px 4px 0;margin-bottom:4px"><strong>💡 Decisão:</strong> ${n.decision}</div>` : ''}
          ${n.artifact    ? `<div style="border-left:3px solid #1a9e5f;padding:4px 8px;background:#f0fff8;font-size:11px;border-radius:0 4px 4px 0;margin-bottom:4px"><strong>📎 Artefato:</strong> ${n.artifact}</div>` : ''}
          ${n.risk        ? `<div style="border-left:3px solid #c48a0a;padding:4px 8px;background:#fffbeb;font-size:11px;border-radius:0 4px 4px 0;margin-bottom:4px"><strong>⚠ Risco:</strong> ${n.risk}</div>` : ''}
          ${n.next_action ? `<div style="font-size:11px;color:${color};margin-top:4px">→ Próxima ação: ${n.next_action}</div>` : ''}
          ${n.notes       ? `<div style="font-size:11px;color:#666;font-style:italic;margin-top:4px">${n.notes}</div>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>${proj.name} — Documentação do Projeto</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;color:#1a1a18;background:#fff;font-size:13px;line-height:1.6}
  .page{max-width:900px;margin:0 auto;padding:40px 36px}
  h2{font-size:14px;font-weight:700;margin:28px 0 12px;padding-bottom:7px;border-bottom:2px solid ${color}}
  .footer{margin-top:40px;padding-top:12px;border-top:1px solid #e5e5e3;font-size:11px;color:#aaa;display:flex;justify-content:space-between}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head>
<body><div class="page">

  <div style="border-bottom:4px solid ${color};padding-bottom:20px;margin-bottom:24px">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${color};margin-bottom:8px">Documentação de Projeto — ProjectFlow</div>
    <div style="font-size:28px;font-weight:800;letter-spacing:-.5px;margin-bottom:6px">${proj.name}</div>
    ${doc.description ? `<div style="font-size:14px;color:#555;margin-bottom:6px;line-height:1.5">${doc.description}</div>` : ''}
    ${doc.objective   ? `<div style="font-size:12px;color:#777">🎯 ${doc.objective}</div>` : ''}
    <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:#666;margin:10px 0 12px">
      ${doc.owner     ? `<span>👤 ${doc.owner}</span>`      : ''}
      ${doc.client    ? `<span>🏢 ${doc.client}</span>`     : ''}
      ${doc.budget    ? `<span>💰 ${doc.budget}</span>`     : ''}
      ${doc.start_date? `<span>📅 ${doc.start_date}</span>` : ''}
      ${doc.end_date  ? `<span>🏁 ${doc.end_date}</span>`   : ''}
      ${doc.stack     ? `<span>🛠 ${doc.stack}</span>`      : ''}
    </div>
    <span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${pct===100?'#dcfce7':'#fff7ed'};color:${pct===100?'#16a34a':'#c2410c'}">
      ${pct===100 ? '✓ Concluído' : `◐ Em Andamento — ${pct}%`}
    </span>
  </div>

  <h2>Pipeline Kanban — Estado Atual</h2>
  <div style="display:flex;gap:0;margin-bottom:4px">${pipeline}</div>
  <div style="height:8px;background:#eee;border-radius:10px;overflow:hidden;margin:12px 0 4px">
    <div style="height:100%;width:${pct}%;background:${color};border-radius:10px"></div>
  </div>
  <div style="font-size:11px;color:#888;margin-bottom:20px">${pct}% das tarefas concluídas (${done}/${cards.length})</div>

  <h2>Tarefas por Estágio</h2>
  ${cardsByCol}

  ${annotated.length ? `<h2>Consolidado de Decisões e Artefatos</h2>
  ${annotated.map(c => {
    const n = ProjDocs.getCardNote(projectId, c.id);
    return `<div style="margin-bottom:8px;padding:10px 12px;border:1px solid #e5e5e3;border-radius:6px">
      <div style="font-size:12px;font-weight:700;margin-bottom:6px">${c.title}</div>
      ${n.decision ? `<div style="margin-bottom:4px;font-size:11px"><strong style="color:#4a7cf6">Decisão:</strong> ${n.decision}</div>` : ''}
      ${n.artifact ? `<div style="margin-bottom:4px;font-size:11px"><strong style="color:#1a9e5f">Artefato:</strong> ${n.artifact}</div>` : ''}
      ${n.risk     ? `<div style="margin-bottom:4px;font-size:11px"><strong style="color:#c48a0a">Risco:</strong> ${n.risk}</div>` : ''}
    </div>`;
  }).join('')}` : ''}

  ${doc.notes ? `<h2>Notas do Projeto</h2><div style="font-size:12px;color:#444;line-height:1.7;padding:12px;background:#f8f8f7;border-radius:6px">${doc.notes}</div>` : ''}

  <div class="footer">
    <span>ProjectFlow CRM v2 · Documentação gerada automaticamente</span>
    <span>Gerado em ${today}</span>
  </div>
</div></body></html>`;

  const blob = new Blob([html], {type:'text/html;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (win) setTimeout(() => win.print(), 800);
  window.showToast && showToast('PDF pronto! Use Ctrl+P para salvar 📄');
}

function exportProjectJSON(projectId) {
  const proj  = (window.mockProjects||[]).find(p => p.id === projectId) || {};
  const doc   = ProjDocs.get(projectId) || {};
  const cards = (window.mockCards||[]).filter(c => c.sl === projectId);
  const data  = {
    exported_at: new Date().toISOString(),
    project: { ...proj, ...doc },
    cards: cards.map(c => ({ ...c, _doc: ProjDocs.getCardNote(projectId, c.id) })),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download=`${projectId}-docs.json`; a.click();
  URL.revokeObjectURL(url);
  window.showToast && showToast('JSON exportado ✓');
}

// Expor globalmente
window.renderProjectDoc     = renderProjectDoc;
window.openProjectInfoModal = openProjectInfoModal;
window.saveProjectInfo      = saveProjectInfo;
window.openCardNoteModal    = openCardNoteModal;
window.saveCardNote         = saveCardNote;
window.clearCardNote        = clearCardNote;
window.closePVModal         = closePVModal;
window.exportProjectPDF     = exportProjectPDF;
window.exportProjectJSON    = exportProjectJSON;
window.openCardFromDoc      = openCardFromDoc;
window.ProjDocs             = ProjDocs;
