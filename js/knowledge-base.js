// ============================================================
//  ProjectFlow V7 — js/knowledge-base.js
//  SPRINT 2: Knowledge Base
//  Editor de blocos flexível inspirado no Notion
//  Tipos: paragraph, heading1/2/3, callout, toggle,
//         table, embed_task, database_view, divider
// ============================================================
'use strict';

// ════════════════════════════════════════════════════════════
//  BLOCK STORE — persistência localStorage por projeto
// ════════════════════════════════════════════════════════════
const KBStore = {
  _key: 'pf_kb_v1',

  load()        { try { return JSON.parse(localStorage.getItem(this._key) || '{}'); } catch { return {}; } },
  save(d)       { try { localStorage.setItem(this._key, JSON.stringify(d)); } catch(e) { console.warn('KBStore quota:', e); } },

  getBlocks(pid)   { return this.load()[pid] || []; },

  setBlocks(pid, blocks) {
    const d = this.load();
    d[pid] = blocks;
    this.save(d);
  },

  upsertBlock(pid, block) {
    const blocks = this.getBlocks(pid);
    const idx    = blocks.findIndex(b => b.id === block.id);
    if (idx >= 0) blocks[idx] = block;
    else blocks.push(block);
    this.setBlocks(pid, blocks);
  },

  deleteBlock(pid, blockId) {
    const blocks = this.getBlocks(pid).filter(b => b.id !== blockId);
    this.setBlocks(pid, blocks);
  },

  moveBlock(pid, blockId, direction) {
    const blocks = this.getBlocks(pid);
    const idx    = blocks.findIndex(b => b.id === blockId);
    if (idx < 0) return;
    const swp = direction === 'up' ? idx - 1 : idx + 1;
    if (swp < 0 || swp >= blocks.length) return;
    [blocks[idx], blocks[swp]] = [blocks[swp], blocks[idx]];
    this.setBlocks(pid, blocks);
  },
};
window.KBStore = KBStore;

// ════════════════════════════════════════════════════════════
//  BLOCK TYPES CONFIG
// ════════════════════════════════════════════════════════════
const KB_TYPES = {
  heading1:      { icon: 'H1', label: 'Título 1',        hasContent: true  },
  heading2:      { icon: 'H2', label: 'Título 2',        hasContent: true  },
  heading3:      { icon: 'H3', label: 'Título 3',        hasContent: true  },
  paragraph:     { icon: '¶',  label: 'Parágrafo',       hasContent: true  },
  callout:       { icon: '💡', label: 'Destaque',        hasContent: true  },
  toggle:        { icon: '▶',  label: 'Toggle',          hasContent: true  },
  divider:       { icon: '—',  label: 'Divisória',       hasContent: false },
  embed_task:    { icon: '📋', label: 'Tarefa embutida', hasContent: false },
  database_view: { icon: '⊞',  label: 'Tabela de tasks', hasContent: false },
  table:         { icon: '▦',  label: 'Tabela manual',   hasContent: false },
};

function _newBlock(type, extra = {}) {
  return {
    id:         'blk_' + Date.now() + '_' + Math.random().toString(36).slice(2,5),
    type,
    content:    '',
    icon:       '',
    color:      '',
    open:       true,   // para toggle
    children:   [],     // para toggle
    task_id:    '',     // para embed_task
    rows:       [['', ''], ['', '']],
    headers:    ['Coluna 1', 'Coluna 2'],
    created_at: new Date().toISOString(),
    ...extra,
  };
}

// ════════════════════════════════════════════════════════════
//  KNOWLEDGE BASE EDITOR
// ════════════════════════════════════════════════════════════
const KnowledgeBase = {

  _pid:        null,
  _editingId:  null,

  render(containerId, projectId) {
    this._pid = projectId;
    const el = document.getElementById(containerId);
    if (!el) return;

    const proj   = (window.mockProjects || []).find(p => p.id === projectId) || { name: projectId };
    const blocks = KBStore.getBlocks(projectId);

    el.innerHTML = `
<div class="kb-editor">
  <div class="kb-header">
    <div class="kb-header-left">
      <div class="kb-page-icon">${proj.color ? '📁' : '📝'}</div>
      <div>
        <input class="kb-page-title" id="kb-page-title" value="${_safeEsc(proj.name || 'Wiki do Projeto')}" placeholder="Título da wiki..." oninput="KnowledgeBase._updatePageTitle('${projectId}', this.value)" />
        <div class="kb-page-sub">Knowledge Base · ${blocks.length} bloco${blocks.length !== 1 ? 's' : ''}</div>
      </div>
    </div>
    <div class="kb-header-actions">
      <button class="btn-secondary" onclick="KnowledgeBase._importFromAI('${projectId}')">✦ Importar da IA</button>
    </div>
  </div>

  <div class="kb-blocks" id="kb-blocks-${projectId}">
    ${blocks.length ? blocks.map(b => this._renderBlock(b, projectId)).join('') : ''}
    <div class="kb-empty-hint" id="kb-empty-hint-${projectId}" style="${blocks.length ? 'display:none' : ''}">
      <div class="kb-empty-icon">📝</div>
      <div class="kb-empty-title">Wiki vazia</div>
      <div class="kb-empty-sub">Clique em "+ Adicionar bloco" para começar</div>
    </div>
  </div>

  <!-- Add block bar -->
  <div class="kb-add-bar">
    <div class="kb-add-label">+ Adicionar bloco</div>
    <div class="kb-type-picker" id="kb-type-picker-${projectId}">
      ${Object.entries(KB_TYPES).map(([type, cfg]) => `
      <button class="kb-type-btn" onclick="KnowledgeBase.addBlock('${projectId}','${type}')" title="${cfg.label}">
        <span class="kb-type-icon">${cfg.icon}</span>
        <span class="kb-type-label">${cfg.label}</span>
      </button>`).join('')}
    </div>
  </div>
</div>`;
  },

  _renderBlock(block, pid) {
    const controls = `
<div class="kb-block-controls">
  <button class="kb-ctrl-btn" onclick="KBStore.moveBlock('${pid}','${block.id}','up');KnowledgeBase.refresh('${pid}')" title="Mover cima">↑</button>
  <button class="kb-ctrl-btn" onclick="KBStore.moveBlock('${pid}','${block.id}','down');KnowledgeBase.refresh('${pid}')" title="Mover baixo">↓</button>
  <button class="kb-ctrl-btn kb-ctrl-del" onclick="KnowledgeBase.deleteBlock('${pid}','${block.id}')" title="Excluir">✕</button>
</div>`;

    switch (block.type) {

      case 'heading1':
        return `<div class="kb-block kb-block--h1" data-id="${block.id}">
          ${controls}
          <div class="kb-h1" contenteditable="true" data-pid="${pid}" data-bid="${block.id}" onblur="KnowledgeBase._saveContent(this)">${_safeEsc(block.content)}</div>
        </div>`;

      case 'heading2':
        return `<div class="kb-block kb-block--h2" data-id="${block.id}">
          ${controls}
          <div class="kb-h2" contenteditable="true" data-pid="${pid}" data-bid="${block.id}" onblur="KnowledgeBase._saveContent(this)">${_safeEsc(block.content)}</div>
        </div>`;

      case 'heading3':
        return `<div class="kb-block kb-block--h3" data-id="${block.id}">
          ${controls}
          <div class="kb-h3" contenteditable="true" data-pid="${pid}" data-bid="${block.id}" onblur="KnowledgeBase._saveContent(this)">${_safeEsc(block.content)}</div>
        </div>`;

      case 'paragraph':
        return `<div class="kb-block kb-block--para" data-id="${block.id}">
          ${controls}
          <div class="kb-para" contenteditable="true" data-pid="${pid}" data-bid="${block.id}" onblur="KnowledgeBase._saveContent(this)">${_safeEsc(block.content) || '<span class="kb-placeholder">Comece a escrever...</span>'}</div>
        </div>`;

      case 'callout':
        return `<div class="kb-block kb-block--callout" data-id="${block.id}" style="${block.color ? '--callout-color:'+block.color : ''}">
          ${controls}
          <div class="kb-callout-icon" contenteditable="true" data-pid="${pid}" data-bid="${block.id}" data-field="icon" onblur="KnowledgeBase._saveField(this)">${block.icon || '💡'}</div>
          <div class="kb-callout-body" contenteditable="true" data-pid="${pid}" data-bid="${block.id}" onblur="KnowledgeBase._saveContent(this)">${_safeEsc(block.content) || '<span class="kb-placeholder">Conteúdo do destaque...</span>'}</div>
        </div>`;

      case 'toggle':
        return `<div class="kb-block kb-block--toggle" data-id="${block.id}">
          ${controls}
          <div class="kb-toggle-header" onclick="KnowledgeBase.toggleBlock('${pid}','${block.id}')">
            <span class="kb-toggle-arrow ${block.open ? 'open' : ''}">▶</span>
            <div class="kb-toggle-title" contenteditable="true" data-pid="${pid}" data-bid="${block.id}" onblur="KnowledgeBase._saveContent(this)" onclick="event.stopPropagation()">${_safeEsc(block.content) || '<span class="kb-placeholder">Título do toggle...</span>'}</div>
          </div>
          ${block.open ? `<div class="kb-toggle-body">
            <div class="kb-toggle-inner" contenteditable="true" data-pid="${pid}" data-bid="${block.id}" data-field="children_text" onblur="KnowledgeBase._saveField(this)">${_safeEsc((block.children || []).join('\n')) || '<span class="kb-placeholder">Conteúdo oculto...</span>'}</div>
          </div>` : ''}
        </div>`;

      case 'divider':
        return `<div class="kb-block kb-block--divider" data-id="${block.id}">
          ${controls}
          <hr class="kb-divider">
        </div>`;

      case 'embed_task':
        const task = (window.mockCards || []).find(c => c.id === block.task_id);
        const team = window.mockTeam || [];
        const assignee = task ? team.find(m => m.id === (task.assignee || task.assigned_to)) : null;
        return `<div class="kb-block kb-block--task" data-id="${block.id}">
          ${controls}
          ${task ? `
          <div class="kb-embed-task" onclick="openCardEdit('${task.id}')">
            <div class="kb-et-bpmn" data-bpmn="${task.bpmn||'esbocar'}">${task.bpmn||'esbocar'}</div>
            <div class="kb-et-title">${_safeEsc(task.title)}</div>
            ${assignee ? `<div class="kb-et-assign"><div class="avatar" style="background:${assignee.color};width:18px;height:18px;font-size:9px">${assignee.initials}</div>${assignee.name}</div>` : ''}
            ${task.date ? `<div class="kb-et-date">📅 ${task.date}</div>` : ''}
          </div>` : `
          <div class="kb-embed-task-picker">
            <div class="kb-etp-label">Selecione uma tarefa para embutir:</div>
            <select class="field-input kb-etp-sel" onchange="KnowledgeBase._linkTask('${pid}','${block.id}',this.value)">
              <option value="">— Escolher tarefa —</option>
              ${(window.mockCards||[]).filter(c=>c.sl===pid||c.project_id===pid).map(c=>`<option value="${c.id}">${_safeEsc(c.title)}</option>`).join('')}
            </select>
          </div>`}
        </div>`;

      case 'database_view':
        const dbCards = (window.mockCards || []).filter(c => c.sl === pid || c.project_id === pid);
        const cols    = window.COLUMNS || ['todo','plan','exec','rev','done'];
        const colName = window.COL_NAME || { todo:'Planejado', plan:'Prioridade', exec:'Em Execução', rev:'Em Revisão', done:'Concluído' };
        return `<div class="kb-block kb-block--db" data-id="${block.id}">
          ${controls}
          <div class="kb-db-header">⊞ Database — ${dbCards.length} tarefas</div>
          <div class="kb-db-table-wrap">
          <table class="kb-db-table">
            <thead><tr>
              <th>Tarefa</th><th>Status</th><th>Prioridade</th><th>Responsável</th><th>Prazo</th>
            </tr></thead>
            <tbody>
              ${dbCards.map(c => {
                const tm = (window.mockTeam||[]).find(m=>m.id===(c.assignee||c.assigned_to));
                const pri = { low:'↓ Baixa', medium:'⬝ Média', high:'↑ Alta', critical:'🔴 Crítica' };
                return `<tr class="kb-db-row" onclick="openCardEdit('${c.id}')">
                  <td class="kb-db-title">${_safeEsc(c.title)}</td>
                  <td><span class="kb-db-col" data-col="${c.col||'todo'}">${colName[c.col||'todo']}</span></td>
                  <td>${pri[c.priority||'medium']||'—'}</td>
                  <td>${tm ? `<div style="display:flex;align-items:center;gap:5px"><div class="avatar" style="background:${tm.color};width:18px;height:18px;font-size:9px">${tm.initials}</div>${tm.name}</div>` : '—'}</td>
                  <td>${c.due_date||c.date||'—'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          </div>
        </div>`;

      case 'table':
        return `<div class="kb-block kb-block--table" data-id="${block.id}">
          ${controls}
          <div class="kb-table-wrap">
          <table class="kb-manual-table">
            <thead><tr>
              ${(block.headers||['Coluna 1','Coluna 2']).map((h,i)=>`
              <th contenteditable="true" data-pid="${pid}" data-bid="${block.id}" data-field="header" data-idx="${i}" onblur="KnowledgeBase._saveTableHeader(this)">${_safeEsc(h)}</th>`).join('')}
              <th class="kb-table-add-col" onclick="KnowledgeBase.addTableCol('${pid}','${block.id}')">+</th>
            </tr></thead>
            <tbody>
              ${(block.rows||[]).map((row,ri)=>`
              <tr>
                ${row.map((cell,ci)=>`
                <td contenteditable="true" data-pid="${pid}" data-bid="${block.id}" data-row="${ri}" data-col="${ci}" onblur="KnowledgeBase._saveTableCell(this)">${_safeEsc(cell)}</td>`).join('')}
                <td class="kb-table-del-row" onclick="KnowledgeBase.deleteTableRow('${pid}','${block.id}',${ri})">✕</td>
              </tr>`).join('')}
            </tbody>
          </table>
          </div>
          <button class="kb-table-add-row" onclick="KnowledgeBase.addTableRow('${pid}','${block.id}')">+ Linha</button>
        </div>`;

      default:
        return `<div class="kb-block" data-id="${block.id}"><em style="color:var(--tx-3)">Bloco desconhecido: ${block.type}</em></div>`;
    }
  },

  // ─── Mutations ────────────────────────────────────────────

  addBlock(pid, type) {
    const block = _newBlock(type);
    const blocks = KBStore.getBlocks(pid);
    blocks.push(block);
    KBStore.setBlocks(pid, blocks);
    this.refresh(pid);
    showToast('Bloco "' + KB_TYPES[type].label + '" adicionado');
    // Focus the new block
    setTimeout(() => {
      const el = document.querySelector(`[data-id="${block.id}"] [contenteditable]`);
      if (el) { el.focus(); el.textContent = ''; }
    }, 80);
  },

  deleteBlock(pid, blockId) {
    KBStore.deleteBlock(pid, blockId);
    this.refresh(pid);
  },

  toggleBlock(pid, blockId) {
    const blocks = KBStore.getBlocks(pid);
    const b = blocks.find(bl => bl.id === blockId);
    if (b) { b.open = !b.open; KBStore.setBlocks(pid, blocks); this.refresh(pid); }
  },

  _saveContent(el) {
    const pid = el.dataset.pid;
    const bid = el.dataset.bid;
    const txt = el.innerText.replace(/<[^>]+>/g, '').trim();
    const blocks = KBStore.getBlocks(pid);
    const b = blocks.find(bl => bl.id === bid);
    if (b) { b.content = txt; KBStore.setBlocks(pid, blocks); }
  },

  _saveField(el) {
    const pid   = el.dataset.pid;
    const bid   = el.dataset.bid;
    const field = el.dataset.field;
    const val   = el.innerText.trim();
    const blocks = KBStore.getBlocks(pid);
    const b = blocks.find(bl => bl.id === bid);
    if (!b) return;
    if (field === 'icon') b.icon = val;
    if (field === 'children_text') b.children = val.split('\n').filter(Boolean);
    KBStore.setBlocks(pid, blocks);
  },

  _saveTableHeader(el) {
    const pid = el.dataset.pid;
    const bid = el.dataset.bid;
    const idx = parseInt(el.dataset.idx);
    const blocks = KBStore.getBlocks(pid);
    const b = blocks.find(bl => bl.id === bid);
    if (b) { if (!b.headers) b.headers = []; b.headers[idx] = el.innerText.trim(); KBStore.setBlocks(pid, blocks); }
  },

  _saveTableCell(el) {
    const pid = el.dataset.pid;
    const bid = el.dataset.bid;
    const ri  = parseInt(el.dataset.row);
    const ci  = parseInt(el.dataset.col);
    const blocks = KBStore.getBlocks(pid);
    const b = blocks.find(bl => bl.id === bid);
    if (b) { if (!b.rows[ri]) b.rows[ri] = []; b.rows[ri][ci] = el.innerText.trim(); KBStore.setBlocks(pid, blocks); }
  },

  addTableRow(pid, bid) {
    const blocks = KBStore.getBlocks(pid);
    const b = blocks.find(bl => bl.id === bid);
    if (b) { const cols = (b.headers||[]).length || 2; b.rows.push(Array(cols).fill('')); KBStore.setBlocks(pid, blocks); this.refresh(pid); }
  },

  deleteTableRow(pid, bid, ri) {
    const blocks = KBStore.getBlocks(pid);
    const b = blocks.find(bl => bl.id === bid);
    if (b) { b.rows.splice(ri, 1); KBStore.setBlocks(pid, blocks); this.refresh(pid); }
  },

  addTableCol(pid, bid) {
    const blocks = KBStore.getBlocks(pid);
    const b = blocks.find(bl => bl.id === bid);
    if (b) {
      b.headers = [...(b.headers||[]), 'Nova Coluna'];
      b.rows = (b.rows||[]).map(r => [...r, '']);
      KBStore.setBlocks(pid, blocks);
      this.refresh(pid);
    }
  },

  _linkTask(pid, bid, taskId) {
    const blocks = KBStore.getBlocks(pid);
    const b = blocks.find(bl => bl.id === bid);
    if (b) { b.task_id = taskId; KBStore.setBlocks(pid, blocks); this.refresh(pid); }
  },

  _updatePageTitle(pid) {
    // handled by existing project edit
  },

  // Importar da IA: pega snapshot mais recente e gera blocos
  _importFromAI(pid) {
    const snap = AIDocStore ? AIDocStore.latest(pid) : null;
    if (!snap) { showToast('Gere primeiro a documentação com IA', true); return; }

    const existing = KBStore.getBlocks(pid);
    const newBlocks = [];

    // Título
    newBlocks.push(_newBlock('heading1', { content: 'Documentação IA — ' + (snap.context?.projeto?.nome || pid) }));
    // Resumo
    if (snap.chain_d?.resumo_executivo_final) {
      newBlocks.push(_newBlock('heading2', { content: 'Resumo Executivo' }));
      newBlocks.push(_newBlock('paragraph', { content: snap.chain_d.resumo_executivo_final }));
    }
    // Riscos
    if ((snap.chain_a?.riscos||[]).length) {
      newBlocks.push(_newBlock('divider'));
      newBlocks.push(_newBlock('heading2', { content: 'Riscos Identificados' }));
      snap.chain_a.riscos.forEach(r => {
        newBlocks.push(_newBlock('callout', { icon: r.nivel === 'alto' ? '🔴' : r.nivel === 'medio' ? '⚠️' : '🟢', content: r.titulo + (r.mitigacao ? '\nMitigação: ' + r.mitigacao : '') }));
      });
    }
    // Arquitetura
    if (snap.chain_b?.arquitetura_sugerida) {
      newBlocks.push(_newBlock('divider'));
      newBlocks.push(_newBlock('heading2', { content: 'Arquitetura & Tecnologia' }));
      newBlocks.push(_newBlock('paragraph', { content: snap.chain_b.arquitetura_sugerida }));
    }
    // Ações
    if ((snap.chain_d?.acoes_imediatas||[]).length) {
      newBlocks.push(_newBlock('divider'));
      newBlocks.push(_newBlock('heading2', { content: 'Ações Imediatas' }));
      snap.chain_d.acoes_imediatas.forEach(a => {
        newBlocks.push(_newBlock('callout', { icon: '▶', content: a.acao + ' — ' + (a.responsavel||'') + (a.prazo ? ' · ' + a.prazo : '') }));
      });
    }
    // Database view
    newBlocks.push(_newBlock('divider'));
    newBlocks.push(_newBlock('heading2', { content: 'Tarefas do Projeto' }));
    newBlocks.push(_newBlock('database_view'));

    KBStore.setBlocks(pid, [...existing, ...newBlocks]);
    this.refresh(pid);
    showToast('✦ ' + newBlocks.length + ' blocos importados da documentação IA!');
  },

  refresh(pid) {
    const el = document.getElementById('kb-container');
    if (el) this.render('kb-container', pid);
    else {
      // Atualiza apenas os blocos se o container estiver em outro elemento
      const blocksEl = document.getElementById('kb-blocks-' + pid);
      if (blocksEl) {
        const blocks = KBStore.getBlocks(pid);
        blocksEl.innerHTML = blocks.map(b => this._renderBlock(b, pid)).join('');
        const hint = document.getElementById('kb-empty-hint-' + pid);
        if (hint) hint.style.display = blocks.length ? 'none' : '';
      }
    }
  },
};
window.KnowledgeBase = KnowledgeBase;
