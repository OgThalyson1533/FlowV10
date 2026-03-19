// ============================================================
//  ProjectFlow v4 — js/v4-modules.js
//  Módulos novos: Workspaces, DiagramaEngine, Legados,
//  BoardDinâmico, DocumentosExecutivos
//  Depende de: core.js, board.js, supabase SDK
// ============================================================

'use strict';

// ════════════════════════════════════════════════════════════
//  WORKSPACE MANAGER
//  Gerencia multi-tenancy: criação, seleção e membros
// ════════════════════════════════════════════════════════════

const WorkspaceManager = {
  _current: null,

  /** Retorna workspace ativo */
  get current() { return this._current; },

  /** Carrega workspaces do usuário logado */
  async loadAll() {
    if (PF.demoMode) return this._demoWorkspaces();

    const { data, error } = await PF.supabase
      .from('workspace_members')
      .select('workspace_id, role, workspaces(*)')
      .eq('user_id', PF.user.id);

    if (error) { showToast('Erro ao carregar workspaces', true); return []; }
    return data.map(r => ({ ...r.workspaces, myRole: r.role }));
  },

  /** Cria workspace e adiciona usuário como owner */
  async create(name) {
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const { data: ws, error: e1 } = await PF.supabase
      .from('workspaces').insert({ name, slug }).select().single();
    if (e1) throw e1;

    const { error: e2 } = await PF.supabase
      .from('workspace_members')
      .insert({ workspace_id: ws.id, user_id: PF.user.id, role: 'owner' });
    if (e2) throw e2;

    showToast(`Workspace "${name}" criado!`);
    return ws;
  },

  /** Define workspace ativo e notifica componentes */
  activate(ws) {
    this._current = ws;
    PF.currentWorkspace = ws;
    document.querySelectorAll('[data-workspace-name]')
      .forEach(el => { el.textContent = ws.name; });
    window.dispatchEvent(new CustomEvent('workspace:changed', { detail: ws }));
  },

  _demoWorkspaces() {
    return [{ id: 'demo-ws', name: 'Demo Workspace', slug: 'demo', plan: 'pro', myRole: 'owner' }];
  },
};

window.WorkspaceManager = WorkspaceManager;

// ════════════════════════════════════════════════════════════
//  DYNAMIC BOARD MANAGER
//  Kanban com colunas editáveis, WIP dinâmico, drag-drop v4
// ════════════════════════════════════════════════════════════

const DynamicBoard = {
  _boards: {},     // boardId → { id, name, columns: [...] }
  _columns: {},    // columnId → column object
  _cards: {},      // cardId → task

  /** Carrega board completo de um projeto */
  async loadProject(projectId) {
    if (PF.demoMode) return this._demoBoard(projectId);

    const { data: boards, error: be } = await PF.supabase
      .from('kanban_boards')
      .select('*, kanban_columns(*)')
      .eq('project_id', projectId)
      .order('created_at');

    if (be) { showToast('Erro ao carregar board', true); return null; }

    // Normaliza
    boards.forEach(b => {
      b.kanban_columns.sort((a, c) => a.position - c.position);
      this._boards[b.id] = b;
      b.kanban_columns.forEach(col => { this._columns[col.id] = col; });
    });

    // Carrega tarefas
    const { data: tasks } = await PF.supabase
      .from('tasks')
      .select('*')
      .eq('project_id', projectId)
      .not('board_id', 'is', null);

    (tasks || []).forEach(t => { this._cards[t.id] = t; });

    return boards[0] || null;
  },

  /** Adiciona coluna ao board */
  async addColumn(boardId, { name, color = '#6B7280', wip_limit = null }) {
    const existing = Object.values(this._columns).filter(c => c.board_id === boardId);
    const position = existing.length + 1;

    const { data, error } = await PF.supabase
      .from('kanban_columns')
      .insert({ board_id: boardId, name, color, wip_limit, position })
      .select().single();

    if (error) throw error;
    this._columns[data.id] = data;
    this._boards[boardId].kanban_columns.push(data);
    showToast(`Coluna "${name}" adicionada`);
    return data;
  },

  /** Reordena colunas via drag */
  async reorderColumns(boardId, newOrder) {
    const updates = newOrder.map((colId, i) =>
      PF.supabase.from('kanban_columns')
        .update({ position: i + 1 })
        .eq('id', colId)
    );
    await Promise.all(updates);
    newOrder.forEach((colId, i) => {
      if (this._columns[colId]) this._columns[colId].position = i + 1;
    });
  },

  /** Move card entre colunas (optimistic) */
  async moveCard(cardId, targetColumnId) {
    const card = this._cards[cardId];
    if (!card) return;

    const col = this._columns[targetColumnId];
    if (!col) return;

    // Verifica WIP
    if (col.wip_limit) {
      const current = Object.values(this._cards)
        .filter(c => c.column_id === targetColumnId && c.id !== cardId).length;
      if (current >= col.wip_limit) {
        showToast(`WIP limit (${col.wip_limit}) atingido para "${col.name}"`, true);
        return;
      }
    }

    // Mapeia coluna → bpmn_status
    const bpmn = col.bpmn_mapping?.[0] || card.bpmn_status;
    const prevColumnId = card.column_id;
    const prevBpmn = card.bpmn_status;

    await SyncManager.execute(
      cardId,
      () => { card.column_id = targetColumnId; card.bpmn_status = bpmn; },
      async () => PF.supabase.from('tasks')
        .update({ column_id: targetColumnId, bpmn_status: bpmn })
        .eq('id', cardId),
      () => { card.column_id = prevColumnId; card.bpmn_status = prevBpmn; },
      'Card movido'
    );
  },

  /** Renderiza board completo no container */
  renderBoard(containerId, boardId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const board = this._boards[boardId];
    if (!board) { container.innerHTML = '<p class="empty-state">Board não encontrado</p>'; return; }

    const cards = Object.values(this._cards);

    container.innerHTML = `
      <div class="board-v4" id="board-${boardId}">
        <div class="board-header">
          <h2 class="board-title">${board.name}</h2>
          <button class="btn-add-col" onclick="DynamicBoard._promptAddColumn('${boardId}')">
            + Coluna
          </button>
        </div>
        <div class="board-columns" data-board="${boardId}">
          ${board.kanban_columns.map(col => this._renderColumn(col, cards)).join('')}
        </div>
      </div>
    `;

    this._attachDragHandlers(container, boardId);
  },

  _renderColumn(col, cards) {
    const colCards = cards.filter(c => c.column_id === col.id);
    const wipClass = col.wip_limit && colCards.length >= col.wip_limit ? 'wip-over' : '';

    return `
      <div class="board-col ${wipClass}" data-col-id="${col.id}" data-locked="${col.is_locked}">
        <div class="col-header" style="border-top: 3px solid ${col.color}">
          <span class="col-name">${col.name}</span>
          ${col.wip_limit ? `<span class="col-wip">${colCards.length}/${col.wip_limit}</span>` : `<span class="col-count">${colCards.length}</span>`}
          ${!col.is_locked ? `<button class="col-menu-btn" onclick="DynamicBoard._colMenu(event,'${col.id}')">⋯</button>` : '🔒'}
        </div>
        <div class="col-cards" data-col="${col.id}">
          ${colCards.sort((a, b) => a.position - b.position).map(c => this._renderCard(c)).join('')}
        </div>
        ${!col.is_locked ? `<button class="btn-add-card" onclick="DynamicBoard._promptAddCard('${col.id}')">+ Tarefa</button>` : ''}
      </div>
    `;
  },

  _renderCard(card) {
    const priorityIcon = { low:'↓', medium:'→', high:'↑', critical:'🔴' };
    return `
      <div class="board-card" draggable="true" data-card-id="${card.id}"
           onclick="DynamicBoard._openCard('${card.id}')">
        ${card.doc_notes ? `<div class="card-label" style="background:var(--c-exec-dot)"></div>` : ''}
        <p class="card-title">${card.title}</p>
        <div class="card-meta">
          <span class="card-priority">${priorityIcon[card.priority] || '→'}</span>
          ${card.due_date ? `<span class="card-due">${card.due_date}</span>` : ''}
          ${card.is_recurring ? `<span class="card-recurring" title="Recorrente">↻</span>` : ''}
          ${card.tags?.length ? `<span class="card-tags">${card.tags.slice(0,2).join(' ')}</span>` : ''}
        </div>
      </div>
    `;
  },

  _attachDragHandlers(container) {
    let dragCardId = null;

    container.querySelectorAll('.board-card').forEach(el => {
      el.addEventListener('dragstart', e => {
        dragCardId = el.dataset.cardId;
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
    });

    container.querySelectorAll('.col-cards').forEach(zone => {
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        if (dragCardId) {
          this.moveCard(dragCardId, zone.dataset.col);
          dragCardId = null;
        }
      });
    });
  },

  async _promptAddColumn(boardId) {
    const name = prompt('Nome da nova coluna:');
    if (name?.trim()) {
      await this.addColumn(boardId, { name: name.trim() });
      // Re-renderiza
      const board = this._boards[boardId];
      if (board) this.renderBoard(`board-container-${board.project_id}`, boardId);
    }
  },

  async _promptAddCard(columnId) {
    const title = prompt('Título da tarefa:');
    if (!title?.trim() || title.trim().length < 3) return;

    const col = this._columns[columnId];
    const board = Object.values(this._boards).find(b =>
      b.kanban_columns.some(c => c.id === columnId));
    if (!board) return;

    const bpmn = col.bpmn_mapping?.[0] || 'esbocar';
    const { data, error } = await PF.supabase
      .from('tasks')
      .insert({
        title: title.trim(),
        project_id: board.project_id,
        board_id: board.id,
        column_id: columnId,
        bpmn_status: bpmn,
      })
      .select().single();

    if (error) { showToast('Erro ao criar tarefa', true); return; }
    this._cards[data.id] = data;
    this.renderBoard(`board-container-${board.project_id}`, board.id);
    showToast('Tarefa criada!');
  },

  _openCard(cardId) {
    window.dispatchEvent(new CustomEvent('card:open', { detail: this._cards[cardId] }));
  },

  _colMenu(e, colId) {
    e.stopPropagation();
    const col = this._columns[colId];
    if (!col) return;
    // Menu contextual simples — expanda conforme necessário
    const opts = ['Renomear', 'Alterar WIP', 'Remover Coluna'];
    const chosen = prompt(`Coluna: ${col.name}\n\n${opts.map((o,i)=>`${i+1}. ${o}`).join('\n')}\n\nDigite o número:`);
    if (chosen === '3') {
      if (confirm(`Remover coluna "${col.name}"? As tarefas serão desvinculadas.`)) {
        PF.supabase.from('kanban_columns').delete().eq('id', colId).then(() => {
          delete this._columns[colId];
          showToast(`Coluna "${col.name}" removida`);
        });
      }
    }
  },

  _demoBoard(projectId) {
    const boardId = `demo-board-${projectId}`;
    const cols = [
      { id:`${boardId}-c1`, board_id:boardId, name:'Planejado',   position:1, wip_limit:4,    color:'#9A9A94', is_done_col:false, is_locked:false, bpmn_mapping:['esbocar','viabilizar'] },
      { id:`${boardId}-c2`, board_id:boardId, name:'Prioridade',  position:2, wip_limit:2,    color:'#7C5CBF', is_done_col:false, is_locked:false, bpmn_mapping:['atribuir'] },
      { id:`${boardId}-c3`, board_id:boardId, name:'Em Execução', position:3, wip_limit:3,    color:'#C48A0A', is_done_col:false, is_locked:false, bpmn_mapping:['executar'] },
      { id:`${boardId}-c4`, board_id:boardId, name:'Em Revisão',  position:4, wip_limit:3,    color:'#4A7CF6', is_done_col:false, is_locked:false, bpmn_mapping:['avaliar','corrigir','validar_cliente'] },
      { id:`${boardId}-c5`, board_id:boardId, name:'Concluído',   position:5, wip_limit:null, color:'#1A9E5F', is_done_col:true,  is_locked:false, bpmn_mapping:['concluido'] },
      { id:`${boardId}-c6`, board_id:boardId, name:'Recorrentes', position:6, wip_limit:null, color:'#D97757', is_done_col:false, is_locked:true,  bpmn_mapping:[] },
    ];
    cols.forEach(c => { this._columns[c.id] = c; });
    this._boards[boardId] = { id:boardId, project_id:projectId, name:'Board Principal', kanban_columns:cols };
    return this._boards[boardId];
  },
};

window.DynamicBoard = DynamicBoard;

// ════════════════════════════════════════════════════════════
//  DIAGRAM ENGINE
//  Motor SVG: renderizador, editor drag, auto-layout, save/load
// ════════════════════════════════════════════════════════════

const DiagramEngine = {
  _diagrams: {},   // diagramId → { ...diagram, nodes: [], edges: [] }
  _selected: null, // nodeId selecionado
  _canvas: null,
  _svgEl: null,

  // Mapeamento checklist → node_type
  CHECKLIST_MAP: {
    'sources.csv': 'source',  'sources.api': 'source',
    'sources.db':  'source',  'staging.sql': 'staging',
    'staging.cloud':'staging','warehouse.fact':'warehouse',
    'warehouse.dim':'warehouse','transforms.views':'transform',
    'transforms.etl':'transform','output.powerbi':'service',
    'output.web':'output','output.api':'output',
  },

  // Auto-layout: X por camada
  LAYER_X: { source:40, staging:280, warehouse:520, transform:520, output:760, service:1000 },

  // Cores por tipo
  NODE_COLORS: {
    source:    { bg:'#DBEAFE', border:'#2563EB' },
    staging:   { bg:'#FEF3C7', border:'#D97706' },
    warehouse: { bg:'#D1FAE5', border:'#059669' },
    transform: { bg:'#EDE9FE', border:'#7C3AED' },
    output:    { bg:'#FCE7F3', border:'#DB2777' },
    api:       { bg:'#E0F2FE', border:'#0284C7' },
    database:  { bg:'#F0FDF4', border:'#16A34A' },
    service:   { bg:'#FFF7ED', border:'#EA580C' },
    actor:     { bg:'#F5F3FF', border:'#6D28D9' },
    decision:  { bg:'#FFFBEB', border:'#B45309' },
    custom:    { bg:'#F9FAFB', border:'#6B7280' },
  },

  /** Carrega diagrama do Supabase */
  async load(projectId) {
    if (PF.demoMode) return this._demoDiagram(projectId);

    const { data: diagrams } = await PF.supabase
      .from('project_diagrams')
      .select('*, diagram_nodes(*), diagram_edges(*)')
      .eq('project_id', projectId)
      .eq('is_current', true)
      .limit(1);

    if (!diagrams?.length) return null;
    const d = diagrams[0];
    this._diagrams[d.id] = d;
    return d;
  },

  /** Salva diagrama (cria nova versão imutável) */
  async save(diagramId) {
    const d = this._diagrams[diagramId];
    if (!d) return;

    // Marca versão anterior como não-current
    await PF.supabase.from('project_diagrams')
      .update({ is_current: false })
      .eq('project_id', d.project_id)
      .eq('is_current', true);

    // Cria nova versão
    const { data: newD } = await PF.supabase
      .from('project_diagrams')
      .insert({
        project_id: d.project_id,
        name: d.name,
        version: (d.version || 1) + 1,
        diagram_type: d.diagram_type,
        canvas_config: d.canvas_config,
      })
      .select().single();

    // Salva nodes
    if (d.diagram_nodes?.length) {
      await PF.supabase.from('diagram_nodes').insert(
        d.diagram_nodes.map(n => ({ ...n, id: undefined, diagram_id: newD.id }))
      );
    }

    showToast(`Diagrama salvo — versão ${newD.version}`);
    this._diagrams[newD.id] = { ...newD, diagram_nodes: d.diagram_nodes, diagram_edges: d.diagram_edges };
    return newD;
  },

  /** Gera diagrama automaticamente a partir de checklist */
  generateFromChecklist(projectId, checklist) {
    const nodes = [];
    const layerCounters = {};

    Object.entries(checklist).forEach(([key, value]) => {
      if (!value) return;
      const nodeType = this.CHECKLIST_MAP[key] || 'custom';
      const lx = this.LAYER_X[nodeType] ?? 40;
      layerCounters[nodeType] = (layerCounters[nodeType] || 0);
      const colors = this.NODE_COLORS[nodeType];

      nodes.push({
        node_key: key,
        node_type: nodeType,
        label: key.split('.').pop().replace(/_/g,' '),
        pos_x: lx,
        pos_y: layerCounters[nodeType] * 130 + 40,
        bg_color: colors.bg,
        border_color: colors.border,
        text_color: '#1B2A4A',
        width: 160, height: 80,
        fields: [],
      });
      layerCounters[nodeType]++;
    });

    return { projectId, nodes, edges: [] };
  },

  /** Renderiza o diagrama como SVG interativo num container */
  render(containerId, diagramId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const d = this._diagrams[diagramId];
    if (!d) { container.innerHTML = '<p class="empty-state">Diagrama não encontrado</p>'; return; }

    const nodes = d.diagram_nodes || [];
    const edges = d.diagram_edges || [];

    const svgW = 1200, svgH = 700;

    const svgContent = `
      <svg id="diagram-svg-${diagramId}" viewBox="0 0 ${svgW} ${svgH}"
           xmlns="http://www.w3.org/2000/svg" class="diagram-svg"
           style="width:100%;height:100%;cursor:default">

        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#6B7280"/>
          </marker>
          <filter id="shadow">
            <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.12"/>
          </filter>
        </defs>

        <!-- Edges -->
        <g class="diagram-edges">
          ${edges.map(e => this._renderEdge(e, nodes)).join('')}
        </g>

        <!-- Nodes -->
        <g class="diagram-nodes">
          ${nodes.map(n => this._renderNode(n)).join('')}
        </g>

        <!-- Empty state -->
        ${!nodes.length ? `
          <text x="${svgW/2}" y="${svgH/2}" text-anchor="middle" fill="#9CA3AF" font-size="14">
            Nenhum nó no diagrama. Use "Gerar" ou arraste para adicionar.
          </text>
        ` : ''}
      </svg>
    `;

    container.innerHTML = `
      <div class="diagram-toolbar">
        <button onclick="DiagramEngine._addNode('${diagramId}')">+ Nó</button>
        <button onclick="DiagramEngine.save('${diagramId}')">💾 Salvar</button>
        <span class="diagram-version">v${d.version}</span>
      </div>
      <div class="diagram-canvas" id="diagram-canvas-${diagramId}">
        ${svgContent}
      </div>
    `;

    this._attachSVGInteraction(diagramId);
  },

  _renderNode(node) {
    const colors = this.NODE_COLORS[node.node_type] || this.NODE_COLORS.custom;
    const bg = node.bg_color || colors.bg;
    const border = node.border_color || colors.border;
    const x = node.pos_x, y = node.pos_y, w = node.width || 160, h = node.height || 80;

    // Formas especiais por tipo
    let shape = '';
    if (node.node_type === 'decision') {
      const mx = x + w/2, my = y + h/2;
      shape = `<polygon points="${mx},${y} ${x+w},${my} ${mx},${y+h} ${x},${my}"
               fill="${bg}" stroke="${border}" stroke-width="2"/>`;
    } else {
      const rx = node.node_type === 'output' ? 12 : 4;
      shape = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"
               fill="${bg}" stroke="${border}" stroke-width="2" filter="url(#shadow)"/>`;
    }

    return `
      <g class="diagram-node" data-node-id="${node.id}"
         transform="translate(0,0)" style="cursor:grab">
        ${shape}
        <text x="${x + w/2}" y="${y + h/2 - 4}" text-anchor="middle"
              font-size="12" font-weight="600" fill="${node.text_color || '#1B2A4A'}"
              font-family="system-ui,sans-serif">
          ${node.label}
        </text>
        <text x="${x + w/2}" y="${y + h/2 + 12}" text-anchor="middle"
              font-size="10" fill="#6B7280" font-family="system-ui,sans-serif">
          ${node.node_type}
        </text>
      </g>
    `;
  },

  _renderEdge(edge, nodes) {
    const src = nodes.find(n => n.id === edge.source_node_id);
    const tgt = nodes.find(n => n.id === edge.target_node_id);
    if (!src || !tgt) return '';

    const x1 = src.pos_x + (src.width || 160), y1 = src.pos_y + (src.height || 80) / 2;
    const x2 = tgt.pos_x,                      y2 = tgt.pos_y + (tgt.height || 80) / 2;
    const cx = (x1 + x2) / 2;

    const dash = edge.edge_type === 'dashed' ? 'stroke-dasharray="6,3"' : '';
    return `
      <g class="diagram-edge">
        <path d="M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}"
              fill="none" stroke="${edge.color || '#6B7280'}"
              stroke-width="1.5" ${dash}
              marker-end="url(#arrow)"/>
        ${edge.label ? `
          <text x="${cx}" y="${(y1+y2)/2 - 6}" text-anchor="middle"
                font-size="10" fill="#6B7280">${edge.label}</text>
        ` : ''}
      </g>
    `;
  },

  _attachSVGInteraction(diagramId) {
    const svgEl = document.getElementById(`diagram-svg-${diagramId}`);
    if (!svgEl) return;

    let dragging = null, ox = 0, oy = 0;

    svgEl.querySelectorAll('.diagram-node').forEach(g => {
      g.addEventListener('mousedown', e => {
        dragging = g;
        const bbox = svgEl.getBoundingClientRect();
        const scale = svgEl.viewBox.baseVal.width / bbox.width;
        ox = e.clientX * scale - parseFloat(g.dataset.px || 0);
        oy = e.clientY * scale - parseFloat(g.dataset.py || 0);
        e.preventDefault();
      });
    });

    svgEl.addEventListener('mousemove', e => {
      if (!dragging) return;
      const bbox = svgEl.getBoundingClientRect();
      const scale = svgEl.viewBox.baseVal.width / bbox.width;
      const nx = e.clientX * scale - ox;
      const ny = e.clientY * scale - oy;
      dragging.setAttribute('transform', `translate(${nx}, ${ny})`);
      dragging.dataset.px = nx;
      dragging.dataset.py = ny;
    });

    svgEl.addEventListener('mouseup', () => { dragging = null; });
  },

  _addNode(diagramId) {
    const d = this._diagrams[diagramId];
    if (!d) return;
    const label = prompt('Label do nó:');
    if (!label) return;
    const types = Object.keys(this.NODE_COLORS);
    const typeStr = prompt(`Tipo (${types.join(', ')}):`, 'custom');
    const nodeType = types.includes(typeStr) ? typeStr : 'custom';
    const colors = this.NODE_COLORS[nodeType];

    const newNode = {
      id: 'local_' + Date.now(),
      diagram_id: diagramId,
      node_key: label.toLowerCase().replace(/\s+/g,'_'),
      node_type: nodeType,
      label,
      pos_x: 100, pos_y: 100,
      width: 160, height: 80,
      bg_color: colors.bg, border_color: colors.border, text_color: '#1B2A4A',
      fields: [],
    };

    d.diagram_nodes = d.diagram_nodes || [];
    d.diagram_nodes.push(newNode);
    this.render(`diagram-canvas-${diagramId}`, diagramId);
  },

  _demoDiagram(projectId) {
    const id = `demo-diag-${projectId}`;
    this._diagrams[id] = {
      id, project_id: projectId, name: 'Arquitetura Funcional', version: 1,
      is_current: true, diagram_type: 'data_flow',
      canvas_config: { zoom: 1, pan_x: 0, pan_y: 0 },
      diagram_nodes: [
        { id:'n1', diagram_id:id, node_key:'csv_input',  node_type:'source',    label:'CSV Import', pos_x:40,  pos_y:80,  width:160, height:80, bg_color:'#DBEAFE', border_color:'#2563EB', text_color:'#1B2A4A', fields:[] },
        { id:'n2', diagram_id:id, node_key:'api_input',  node_type:'source',    label:'REST API',   pos_x:40,  pos_y:240, width:160, height:80, bg_color:'#DBEAFE', border_color:'#2563EB', text_color:'#1B2A4A', fields:[] },
        { id:'n3', diagram_id:id, node_key:'staging',    node_type:'staging',   label:'Staging DB', pos_x:280, pos_y:160, width:160, height:80, bg_color:'#FEF3C7', border_color:'#D97706', text_color:'#1B2A4A', fields:[] },
        { id:'n4', diagram_id:id, node_key:'warehouse',  node_type:'warehouse', label:'Data WH',    pos_x:520, pos_y:160, width:160, height:80, bg_color:'#D1FAE5', border_color:'#059669', text_color:'#1B2A4A', fields:[] },
        { id:'n5', diagram_id:id, node_key:'dashboard',  node_type:'output',    label:'Dashboard',  pos_x:760, pos_y:160, width:160, height:80, bg_color:'#FCE7F3', border_color:'#DB2777', text_color:'#1B2A4A', fields:[] },
      ],
      diagram_edges: [
        { id:'e1', diagram_id:id, source_node_id:'n1', target_node_id:'n3', edge_type:'arrow', color:'#6B7280' },
        { id:'e2', diagram_id:id, source_node_id:'n2', target_node_id:'n3', edge_type:'arrow', color:'#6B7280' },
        { id:'e3', diagram_id:id, source_node_id:'n3', target_node_id:'n4', edge_type:'arrow', color:'#6B7280' },
        { id:'e4', diagram_id:id, source_node_id:'n4', target_node_id:'n5', edge_type:'arrow', color:'#6B7280' },
      ],
    };
    return this._diagrams[id];
  },
};

window.DiagramEngine = DiagramEngine;

// ════════════════════════════════════════════════════════════
//  LEGACY IMPORT WIZARD
//  6 etapas para ingestão de projetos retroativos
// ════════════════════════════════════════════════════════════

const LegacyWizard = {
  _state: {},
  _step: 0,

  /** Inicia wizard de importação */
  start(workspaceId) {
    this._state = { workspace_id: workspaceId, deliveries: [], stack: [], checklist: {} };
    this._step = 1;
    this._render();
    openModal('legacy-wizard-modal');
  },

  /** Avança etapa */
  next() {
    const valid = this._validate();
    if (!valid) return;
    this._step++;
    if (this._step > 6) { this._finish(); return; }
    this._render();
  },

  back() {
    if (this._step > 1) { this._step--; this._render(); }
  },

  _validate() {
    const s = this._state;
    if (this._step === 1 && !s.name?.trim()) {
      showToast('Informe o nome do projeto', true); return false;
    }
    return true;
  },

  _render() {
    const body = document.getElementById('legacy-wizard-body');
    if (!body) return;

    const steps = ['Identificação', 'Entregas', 'Tech Stack', 'Fontes de Dados', 'Equipe', 'Status Final'];
    body.innerHTML = `
      <div class="wizard-progress">
        ${steps.map((s, i) => `
          <div class="wizard-step-dot ${i + 1 <= this._step ? 'active' : ''}"
               title="${s}">${i + 1}</div>
        `).join('<div class="wizard-step-line"></div>')}
      </div>
      <h3 class="wizard-step-title">Etapa ${this._step}: ${steps[this._step - 1]}</h3>
      ${this._renderStep()}
      <div class="wizard-actions">
        ${this._step > 1 ? `<button class="btn-secondary" onclick="LegacyWizard.back()">← Voltar</button>` : ''}
        <button class="btn-primary" onclick="LegacyWizard.next()">
          ${this._step < 6 ? 'Avançar →' : 'Importar Projeto'}
        </button>
      </div>
    `;
  },

  _renderStep() {
    const s = this._state;
    switch (this._step) {
      case 1: return `
        <div class="wizard-fields">
          <label>Nome do Projeto *
            <input type="text" id="lw-name" value="${s.name || ''}" placeholder="Ex: Migração DB 2023"
                   oninput="LegacyWizard._state.name = this.value">
          </label>
          <label>Período
            <div class="date-row">
              <input type="date" id="lw-start" value="${s.start_date || ''}"
                     onchange="LegacyWizard._state.start_date = this.value">
              <span>até</span>
              <input type="date" id="lw-end" value="${s.end_date || ''}"
                     onchange="LegacyWizard._state.end_date = this.value">
            </div>
          </label>
          <label>Responsável
            <input type="text" id="lw-req" value="${s.requester || ''}"
                   placeholder="Nome ou e-mail" oninput="LegacyWizard._state.requester = this.value">
          </label>
          <label>Cliente
            <input type="text" id="lw-client" value="${s.client_name || ''}"
                   placeholder="Nome do cliente" oninput="LegacyWizard._state.client_name = this.value">
          </label>
          <label>Objetivo Central
            <textarea id="lw-obj" rows="3" placeholder="Descreva o objetivo principal..."
                      oninput="LegacyWizard._state.objective = this.value">${s.objective || ''}</textarea>
          </label>
        </div>`;

      case 2: return `
        <p class="wizard-hint">Liste as entregas/funcionalidades do projeto (uma por linha):</p>
        <textarea id="lw-deliveries" rows="8" style="width:100%"
                  placeholder="• Login e autenticação&#10;• Dashboard de relatórios&#10;• API de integração"
                  oninput="LegacyWizard._state.deliveries = this.value.split('\\n').filter(l => l.trim())"
        >${(s.deliveries || []).join('\n')}</textarea>`;

      case 3: return `
        <p class="wizard-hint">Stack técnica utilizada (linguagens, frameworks, serviços):</p>
        <div class="stack-chips" id="lw-stack-chips">
          ${(s.stack || []).map(t => `<span class="chip">${t} <button onclick="LegacyWizard._removeStack('${t}')">×</button></span>`).join('')}
        </div>
        <div class="stack-add">
          <input type="text" id="lw-stack-input" placeholder="Ex: React, Node.js, PostgreSQL"
                 onkeydown="if(event.key==='Enter'||event.key===',')LegacyWizard._addStack()">
          <button onclick="LegacyWizard._addStack()">Adicionar</button>
        </div>`;

      case 4: return `
        <p class="wizard-hint">Fontes, transformações e destinos de dados do projeto:</p>
        <div class="checklist-grid">
          ${[
            ['sources.csv','CSV / Excel'], ['sources.api','API / REST'],
            ['sources.db','Banco Externo'],['staging.sql','Staging SQL'],
            ['staging.cloud','Cloud Storage'],['warehouse.fact','Tabelas Fato'],
            ['warehouse.dim','Tabelas Dimensão'],['transforms.views','SQL Views'],
            ['transforms.etl','ETL / Procedures'],['output.powerbi','Power BI'],
            ['output.web','Web App'],['output.api','API de Saída'],
          ].map(([k, label]) => `
            <label class="checklist-item">
              <input type="checkbox" ${s.checklist?.[k] ? 'checked' : ''}
                     onchange="LegacyWizard._state.checklist['${k}'] = this.checked">
              ${label}
            </label>
          `).join('')}
        </div>`;

      case 5: return `
        <div class="wizard-fields">
          <label>Stakeholders (separados por vírgula)
            <input type="text" id="lw-stakeholders" value="${(s.stakeholders || []).join(', ')}"
                   placeholder="PM, Tech Lead, DBA..."
                   oninput="LegacyWizard._state.stakeholders = this.value.split(',').map(s=>s.trim()).filter(Boolean)">
          </label>
          <label>Lógica de Negócio (resumo)
            <textarea id="lw-biz" rows="4" placeholder="Descreva regras e restrições de negócio..."
                      oninput="LegacyWizard._state.business_logic = this.value">${s.business_logic || ''}</textarea>
          </label>
        </div>`;

      case 6: return `
        <p class="wizard-hint">Para cada entrega, defina o status atual:</p>
        <div class="status-map">
          ${(s.deliveries || []).map((d, i) => `
            <div class="status-row">
              <span class="delivery-label">${d}</span>
              <select onchange="LegacyWizard._setDeliveryStatus(${i}, this.value)">
                <option value="esbocar">Apenas planejado</option>
                <option value="executar">Em desenvolvimento</option>
                <option value="avaliar">Em revisão / teste</option>
                <option value="validar_cliente">Aguardando aprovação</option>
                <option value="concluido" selected>Entregue e funcionando</option>
                <option value="corrigir">Com problemas / bugs</option>
              </select>
            </div>
          `).join('')}
        </div>`;
    }
    return '';
  },

  _addStack() {
    const input = document.getElementById('lw-stack-input');
    const val = input?.value.trim().replace(/,$/, '');
    if (!val) return;
    if (!this._state.stack) this._state.stack = [];
    val.split(',').map(v => v.trim()).filter(Boolean).forEach(v => {
      if (!this._state.stack.includes(v)) this._state.stack.push(v);
    });
    input.value = '';
    this._render();
  },

  _removeStack(tag) {
    this._state.stack = (this._state.stack || []).filter(t => t !== tag);
    this._render();
  },

  _setDeliveryStatus(idx, status) {
    if (!this._state.deliveryStatuses) this._state.deliveryStatuses = [];
    this._state.deliveryStatuses[idx] = status;
  },

  async _finish() {
    const s = this._state;
    showToast('Importando projeto legado...');

    try {
      // 1. Cria projeto com is_legacy = TRUE
      const { data: project, error: pe } = await PF.supabase
        .from('projects')
        .insert({
          workspace_id: s.workspace_id,
          name: s.name,
          objective: s.objective,
          requester: s.requester,
          stakeholders: s.stakeholders || [],
          tech_stack: s.stack || [],
          business_logic: s.business_logic,
          client_name: s.client_name,
          start_date: s.start_date,
          end_date: s.end_date,
          is_legacy: true,
          legacy_imported_at: new Date().toISOString(),
          status: 'active',
        })
        .select().single();

      if (pe) throw pe;

      // 2. Cria tasks para cada entrega (trigger criou board + columns)
      const statusToBpmn = {
        esbocar: 'esbocar', executar: 'executar', avaliar: 'avaliar',
        validar_cliente: 'validar_cliente', concluido: 'concluido', corrigir: 'corrigir',
      };

      if (s.deliveries?.length) {
        // Busca board criado pelo trigger
        const { data: board } = await PF.supabase
          .from('kanban_boards').select('id').eq('project_id', project.id).single();

        const tasks = s.deliveries.map((title, i) => ({
          project_id: project.id,
          board_id: board?.id,
          title: title.replace(/^[•\-]\s*/, '').trim(),
          bpmn_status: statusToBpmn[s.deliveryStatuses?.[i]] || 'concluido',
          priority: 'medium',
        }));

        await PF.supabase.from('tasks').insert(tasks);
      }

      // 3. Gera diagrama automático
      if (Object.values(s.checklist || {}).some(Boolean)) {
        const graphData = DiagramEngine.generateFromChecklist(project.id, s.checklist);
        const { data: diag } = await PF.supabase
          .from('project_diagrams')
          .insert({ project_id: project.id, name: 'Arquitetura', generated_from: 'legacy_import' })
          .select().single();

        if (diag && graphData.nodes.length) {
          await PF.supabase.from('diagram_nodes').insert(
            graphData.nodes.map(n => ({ ...n, diagram_id: diag.id }))
          );
        }
      }

      closeModal('legacy-wizard-modal');
      showToast(`Projeto "${s.name}" importado com sucesso!`);
      window.dispatchEvent(new CustomEvent('project:created', { detail: project }));

    } catch (err) {
      showToast('Erro ao importar: ' + err.message, true);
    }
  },
};

window.LegacyWizard = LegacyWizard;

// ════════════════════════════════════════════════════════════
//  EXECUTIVE DOCUMENT GENERATOR
//  Snapshots versionados, exportação HTML → PDF
// ════════════════════════════════════════════════════════════

const ExecDocGenerator = {
  /** Gera snapshot executivo de um projeto */
  async generate(projectId) {
    const { data: project } = await PF.supabase
      .from('projects').select('*').eq('id', projectId).single();
    if (!project) { showToast('Projeto não encontrado', true); return; }

    const { data: tasks } = await PF.supabase
      .from('tasks').select('*').eq('project_id', projectId);

    const total = tasks?.length || 0;
    const done = tasks?.filter(t => t.bpmn_status === 'concluido').length || 0;
    const progress = total ? Math.round((done / total) * 100) : 0;

    const html = this._buildHTML(project, tasks || [], progress);

    const { data: doc, error } = await PF.supabase
      .from('exec_documents')
      .insert({
        project_id: projectId,
        title: `Relatório Executivo — ${project.name}`,
        content_html: html,
        snapshot: { project, total, done, progress, generated_at: new Date().toISOString() },
      })
      .select().single();

    if (error) { showToast('Erro ao gerar documento', true); return; }

    showToast('Documento executivo gerado!');
    return { doc, html };
  },

  _buildHTML(project, tasks, progress) {
    const now = new Date().toLocaleDateString('pt-BR');
    const done = tasks.filter(t => t.bpmn_status === 'concluido').length;

    return `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8">
<title>Relatório Executivo — ${project.name}</title>
<style>
  body { font-family: system-ui, sans-serif; color: #1a1a1a; max-width: 900px; margin: 0 auto; padding: 40px; }
  .header { border-bottom: 3px solid ${project.color || '#2563EB'}; padding-bottom: 20px; margin-bottom: 32px; }
  h1 { color: ${project.color || '#2563EB'}; margin: 0 0 8px; }
  .meta { color: #666; font-size: 14px; }
  .progress-bar { background: #f3f4f6; border-radius: 8px; height: 12px; margin: 16px 0; }
  .progress-fill { background: ${project.color || '#2563EB'}; height: 100%; border-radius: 8px;
                   width: ${progress}%; transition: width .3s; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 24px 0; }
  .stat { background: #f9fafb; border-radius: 8px; padding: 16px; text-align: center; }
  .stat-n { font-size: 28px; font-weight: 700; color: ${project.color || '#2563EB'}; }
  .stat-l { font-size: 12px; color: #666; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th { background: #f3f4f6; padding: 8px 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #666; }
  td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; }
  .badge-done { background: #d1fae5; color: #059669; }
  .badge-exec { background: #fef3c7; color: #d97706; }
  .badge-rev  { background: #dbeafe; color: #2563eb; }
  .badge-plan { background: #f3f4f6; color: #6b7280; }
</style>
</head><body>
  <div class="header">
    <h1>${project.name}</h1>
    <p class="meta">Relatório gerado em ${now} &nbsp;|&nbsp; Status: ${project.status}</p>
    ${project.client_name ? `<p class="meta">Cliente: <strong>${project.client_name}</strong></p>` : ''}
    ${project.is_legacy ? `<p class="meta">⚠️ Projeto Legado — importado retroativamente</p>` : ''}
  </div>

  <h2>Progresso Geral</h2>
  <div class="progress-bar"><div class="progress-fill"></div></div>
  <p><strong>${progress}% concluído</strong> (${done} de ${tasks.length} tarefas)</p>

  <div class="stats">
    <div class="stat"><div class="stat-n">${tasks.length}</div><div class="stat-l">Total Tarefas</div></div>
    <div class="stat"><div class="stat-n">${done}</div><div class="stat-l">Concluídas</div></div>
    <div class="stat"><div class="stat-n">${tasks.filter(t=>['avaliar','corrigir','validar_cliente'].includes(t.bpmn_status)).length}</div><div class="stat-l">Em Revisão</div></div>
    <div class="stat"><div class="stat-n">${tasks.filter(t=>t.bpmn_status==='executar').length}</div><div class="stat-l">Em Execução</div></div>
  </div>

  <h2>Tarefas</h2>
  <table>
    <thead><tr><th>Título</th><th>Status</th><th>Prioridade</th><th>Entrega</th></tr></thead>
    <tbody>
      ${tasks.map(t => {
        const badgeCls = t.bpmn_status === 'concluido' ? 'badge-done'
          : ['avaliar','corrigir','validar_cliente'].includes(t.bpmn_status) ? 'badge-rev'
          : t.bpmn_status === 'executar' ? 'badge-exec' : 'badge-plan';
        return `<tr>
          <td>${t.title}</td>
          <td><span class="badge ${badgeCls}">${t.bpmn_status}</span></td>
          <td>${t.priority || 'medium'}</td>
          <td>${t.due_date || '—'}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>

  ${project.objective ? `<h2>Objetivo</h2><p>${project.objective}</p>` : ''}
  ${project.business_logic ? `<h2>Lógica de Negócio</h2><p>${project.business_logic}</p>` : ''}
  ${(project.tech_stack || []).length ? `<h2>Stack Técnica</h2><p>${project.tech_stack.join(' · ')}</p>` : ''}
</body></html>`;
  },

  /** Abre prévia do documento em nova aba */
  preview(html) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    window.open(URL.createObjectURL(blob), '_blank');
  },
};

window.ExecDocGenerator = ExecDocGenerator;

// ════════════════════════════════════════════════════════════
//  INICIALIZAÇÃO v4
//  Extende o PF global com novos módulos
// ════════════════════════════════════════════════════════════

window.addEventListener('supabase:ready', () => {
  console.log('[ProjectFlow v4] Módulos carregados: WorkspaceManager, DynamicBoard, DiagramEngine, LegacyWizard, ExecDocGenerator');
});

// Compatibilidade com modo demo
if (window.PF?.demoMode) {
  console.log('[ProjectFlow v4] Modo demo ativo — dados simulados');
}
