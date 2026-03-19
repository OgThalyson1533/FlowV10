// ============================================================
//  ProjectFlow V10 — diagrama.js
//  Editor de Diagramas com Fabric.js 5.x
//
//  Dependências (adicionar ao <head> do index.html):
//    <script src="https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js"></script>
//
//  Uso:
//    DiagramaEngine.init('meu-container-id', projectId, taskId);
//    DiagramaEngine.salvar();
//    DiagramaEngine.carregar(projectId, taskId);
// ============================================================
'use strict';

window.DiagramaEngine = (function () {

  // ── Constantes ──────────────────────────────────────────────
  const FABRIC_CDN  = 'https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js';
  const BUCKET      = 'anexos_tarefas';   // bucket de storage (thumbnails opcionais)
  const SAVE_DELAY  = 1500;              // ms de debounce para autosave
  const MAX_HISTORY = 80;

  // Paleta de tipos de nó
  const PALETTE = {
    rect:     { label: 'Processo',   fill: '#DBEAFE', stroke: '#2563EB', text: '#1e3a8a' },
    diamond:  { label: 'Decisão',    fill: '#FEF3C7', stroke: '#D97706', text: '#78350f' },
    ellipse:  { label: 'Ator',       fill: '#FCE7F3', stroke: '#DB2777', text: '#831843' },
    database: { label: 'Banco',      fill: '#D1FAE5', stroke: '#059669', text: '#064e3b' },
    cloud:    { label: 'Serviço',    fill: '#F0F9FF', stroke: '#0EA5E9', text: '#0c4a6e' },
    note:     { label: 'Nota',       fill: '#FFFBEB', stroke: '#D97706', text: '#78350f' },
    startEnd: { label: 'Início/Fim', fill: '#D1FAE5', stroke: '#059669', text: '#064e3b' },
  };

  // ── Estado interno ───────────────────────────────────────────
  let _canvas    = null;
  let _pid       = null;
  let _taskId    = null;
  let _diagramId = null;   // UUID do registro em project_diagrams
  let _tool      = 'select';
  let _history   = [];
  let _histIdx   = -1;
  let _dirty     = false;
  let _saveTimer = null;
  let _drawMode  = { active: false, startX: 0, startY: 0, shape: null };
  let _arrowMode = { active: false, line: null, startObj: null };

  // ── Carregamento dinâmico do Fabric.js ──────────────────────
  async function _loadFabric() {
    if (typeof fabric !== 'undefined') return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = FABRIC_CDN;
      s.onload  = resolve;
      s.onerror = () => reject(new Error('Fabric.js falhou ao carregar do CDN'));
      document.head.appendChild(s);
    });
  }

  // ── CSS injetado programaticamente ──────────────────────────
  function _injectCSS() {
    if (document.getElementById('dgv10-css')) return;
    const style = document.createElement('style');
    style.id = 'dgv10-css';
    style.textContent = `
      #dgv10-root {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--bg-1, #f8f8f6);
        font-family: inherit;
        position: relative;
        overflow: hidden;
      }
      /* ── Toolbar ── */
      #dgv10-toolbar {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 12px;
        background: var(--bg-2, #fff);
        border-bottom: 1px solid var(--bd, #e5e5e0);
        flex-shrink: 0;
        flex-wrap: wrap;
        user-select: none;
      }
      .dgv10-sep {
        width: 1px;
        height: 22px;
        background: var(--bd, #e5e5e0);
        margin: 0 4px;
        flex-shrink: 0;
      }
      .dgv10-btn {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 5px 10px;
        border: 1px solid transparent;
        border-radius: 6px;
        background: transparent;
        color: var(--tx-1, #1a1a18);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.12s, border-color 0.12s;
        white-space: nowrap;
      }
      .dgv10-btn:hover { background: var(--bg-3, #f0f0ec); border-color: var(--bd, #e5e5e0); }
      .dgv10-btn.active {
        background: var(--blue, #3b6cdb)18;
        border-color: var(--blue, #3b6cdb);
        color: var(--blue, #3b6cdb);
      }
      .dgv10-btn svg { width: 15px; height: 15px; flex-shrink: 0; }
      .dgv10-btn-danger:hover { background: #fee2e2; border-color: #dc2626; color: #dc2626; }
      .dgv10-btn-save {
        background: var(--green, #1a9e5f);
        color: #fff;
        border-color: var(--green, #1a9e5f);
        margin-left: auto;
      }
      .dgv10-btn-save:hover { background: #15865a; }
      .dgv10-btn-save:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      /* ── Paleta lateral ── */
      #dgv10-palette {
        position: absolute;
        left: 12px;
        top: 60px;
        bottom: 12px;
        width: 110px;
        background: var(--bg-2, #fff);
        border: 1px solid var(--bd, #e5e5e0);
        border-radius: 10px;
        padding: 8px 6px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        overflow-y: auto;
        z-index: 10;
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      }
      .dgv10-pal-title {
        font-size: 10px;
        font-weight: 600;
        color: var(--tx-3, #9a9a94);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        padding: 2px 4px 6px;
        border-bottom: 1px solid var(--bd, #e5e5e0);
        margin-bottom: 2px;
      }
      .dgv10-pal-item {
        padding: 6px 4px;
        border: 1px solid var(--bd, #e5e5e0);
        border-radius: 6px;
        cursor: grab;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        font-size: 10px;
        font-weight: 500;
        color: var(--tx-2, #5c5c58);
        background: var(--bg-1, #f8f8f6);
        transition: box-shadow 0.1s;
        user-select: none;
      }
      .dgv10-pal-item:hover {
        box-shadow: 0 2px 6px rgba(0,0,0,0.12);
        border-color: var(--blue, #3b6cdb);
        color: var(--blue, #3b6cdb);
      }
      .dgv10-pal-item:active { cursor: grabbing; }
      .dgv10-pal-preview {
        width: 50px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      /* ── Canvas wrapper ── */
      #dgv10-canvas-wrap {
        flex: 1;
        position: relative;
        overflow: hidden;
        margin-left: 130px;   /* espaço para paleta */
        background:
          radial-gradient(circle, var(--bd, #e5e5e0) 1px, transparent 1px);
        background-size: 24px 24px;
        background-color: var(--bg-1, #f8f8f6);
      }
      #dgv10-canvas-wrap canvas { display: block; }
      /* ── Status bar ── */
      #dgv10-statusbar {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 3px 16px;
        background: var(--bg-2, #fff);
        border-top: 1px solid var(--bd, #e5e5e0);
        font-size: 11px;
        color: var(--tx-3, #9a9a94);
        flex-shrink: 0;
      }
      #dgv10-statusbar .status-save {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .dgv10-dot-saved  { width: 7px; height: 7px; border-radius: 50%; background: #1a9e5f; }
      .dgv10-dot-dirty  { width: 7px; height: 7px; border-radius: 50%; background: #f59e0b; }
      .dgv10-dot-saving { width: 7px; height: 7px; border-radius: 50%; background: #3b6cdb; animation: pulse 1s infinite; }
      @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      /* ── Color picker popup ── */
      #dgv10-colorpicker {
        position: absolute;
        background: var(--bg-2, #fff);
        border: 1px solid var(--bd, #e5e5e0);
        border-radius: 8px;
        padding: 10px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        z-index: 100;
        display: none;
        gap: 8px;
        flex-direction: column;
      }
      #dgv10-colorpicker.visible { display: flex; }
      .dgv10-color-row { display: flex; gap: 6px; align-items: center; }
      .dgv10-color-row label { font-size: 11px; width: 50px; color: var(--tx-2,#5c5c58); }
      .dgv10-color-row input[type=color] { width: 32px; height: 24px; border: none; cursor: pointer; padding: 0; }
    `;
    document.head.appendChild(style);
  }

  // ── HTML do editor ───────────────────────────────────────────
  function _buildHTML() {
    const palItems = Object.entries(PALETTE).map(([key, cfg]) => `
      <div class="dgv10-pal-item" draggable="true" data-type="${key}" title="${cfg.label}">
        <div class="dgv10-pal-preview">
          ${_previewSVG(key, cfg)}
        </div>
        <span>${cfg.label}</span>
      </div>
    `).join('');

    return `
      <div id="dgv10-toolbar">
        <!-- Seleção e navegação -->
        <button class="dgv10-btn active" data-tool="select" title="Selecionar (V)">
          ${_ico('cursor')} Selecionar
        </button>
        <button class="dgv10-btn" data-tool="pan" title="Mover canvas (H)">
          ${_ico('hand')} Mover
        </button>
        <div class="dgv10-sep"></div>

        <!-- Formas -->
        <button class="dgv10-btn" data-tool="rect" title="Retângulo (R)">
          ${_ico('rect')} Retângulo
        </button>
        <button class="dgv10-btn" data-tool="ellipse" title="Elipse (E)">
          ${_ico('ellipse')} Elipse
        </button>
        <button class="dgv10-btn" data-tool="diamond" title="Losango (D)">
          ${_ico('diamond')} Losango
        </button>
        <button class="dgv10-btn" data-tool="text" title="Texto (T)">
          ${_ico('text')} Texto
        </button>
        <button class="dgv10-btn" data-tool="arrow" title="Seta/Conexão (A)">
          ${_ico('arrow')} Seta
        </button>
        <div class="dgv10-sep"></div>

        <!-- Ações de objeto -->
        <button class="dgv10-btn" id="dgv10-btn-color" title="Cor do objeto selecionado">
          ${_ico('palette')} Cor
        </button>
        <button class="dgv10-btn" id="dgv10-btn-del" title="Deletar selecionado (Del)">
          ${_ico('trash')} Deletar
        </button>
        <button class="dgv10-btn" id="dgv10-btn-dup" title="Duplicar (Ctrl+D)">
          ${_ico('copy')} Duplicar
        </button>
        <div class="dgv10-sep"></div>

        <!-- Desfazer / Refazer -->
        <button class="dgv10-btn" id="dgv10-btn-undo" title="Desfazer (Ctrl+Z)">
          ${_ico('undo')} Desfazer
        </button>
        <button class="dgv10-btn" id="dgv10-btn-redo" title="Refazer (Ctrl+Y)">
          ${_ico('redo')} Refazer
        </button>
        <div class="dgv10-sep"></div>

        <!-- Zoom -->
        <button class="dgv10-btn" id="dgv10-btn-zout" title="Diminuir zoom (-)">
          ${_ico('minus')}
        </button>
        <span id="dgv10-zoom-label" style="font-size:12px;min-width:38px;text-align:center;">100%</span>
        <button class="dgv10-btn" id="dgv10-btn-zin" title="Aumentar zoom (+)">
          ${_ico('plus')}
        </button>
        <button class="dgv10-btn" id="dgv10-btn-fit" title="Ajustar à tela (0)">Fit</button>
        <div class="dgv10-sep"></div>

        <!-- Limpar -->
        <button class="dgv10-btn dgv10-btn-danger" id="dgv10-btn-clear" title="Limpar tudo">
          ${_ico('clear')} Limpar tudo
        </button>

        <!-- Salvar -->
        <button class="dgv10-btn dgv10-btn-save" id="dgv10-btn-save" title="Salvar no Supabase (Ctrl+S)">
          ${_ico('save')} Salvar
        </button>
      </div>

      <!-- Paleta lateral (drag & drop) -->
      <div id="dgv10-palette">
        <div class="dgv10-pal-title">Formas</div>
        ${palItems}
      </div>

      <!-- Color picker popup -->
      <div id="dgv10-colorpicker">
        <div class="dgv10-color-row">
          <label>Fundo</label>
          <input type="color" id="dgv10-cp-fill" value="#DBEAFE">
        </div>
        <div class="dgv10-color-row">
          <label>Borda</label>
          <input type="color" id="dgv10-cp-stroke" value="#2563EB">
        </div>
        <div class="dgv10-color-row">
          <label>Texto</label>
          <input type="color" id="dgv10-cp-text" value="#1e3a8a">
        </div>
        <button class="dgv10-btn dgv10-btn-save" id="dgv10-cp-apply" style="margin-top:4px">Aplicar</button>
      </div>

      <!-- Canvas -->
      <div id="dgv10-canvas-wrap">
        <canvas id="dgv10-canvas"></canvas>
      </div>

      <!-- Status bar -->
      <div id="dgv10-statusbar">
        <span id="dgv10-status-tool">Ferramenta: Selecionar</span>
        <span id="dgv10-status-obj">Nenhum objeto selecionado</span>
        <div class="status-save">
          <span class="dgv10-dot-saved" id="dgv10-save-dot"></span>
          <span id="dgv10-save-label">Salvo</span>
        </div>
      </div>
    `;
  }

  // ── SVG de preview da paleta ─────────────────────────────────
  function _previewSVG(type, cfg) {
    const f = cfg.fill, s = cfg.stroke;
    const shapes = {
      rect:     `<svg width="50" height="28" viewBox="0 0 50 28"><rect x="2" y="2" width="46" height="24" rx="3" fill="${f}" stroke="${s}" stroke-width="2"/></svg>`,
      diamond:  `<svg width="50" height="28" viewBox="0 0 50 28"><polygon points="25,2 48,14 25,26 2,14" fill="${f}" stroke="${s}" stroke-width="2"/></svg>`,
      ellipse:  `<svg width="50" height="28" viewBox="0 0 50 28"><ellipse cx="25" cy="14" rx="23" ry="12" fill="${f}" stroke="${s}" stroke-width="2"/></svg>`,
      database: `<svg width="50" height="28" viewBox="0 0 50 28"><ellipse cx="25" cy="8" rx="20" ry="6" fill="${f}" stroke="${s}" stroke-width="2"/><rect x="5" y="8" width="40" height="14" fill="${f}" stroke="${s}" stroke-width="2"/><ellipse cx="25" cy="22" rx="20" ry="6" fill="${f}" stroke="${s}" stroke-width="2"/></svg>`,
      cloud:    `<svg width="50" height="28" viewBox="0 0 50 28"><path d="M10 22 Q6 22 6 18 Q6 14 10 14 Q10 8 16 8 Q20 4 26 6 Q30 2 36 6 Q42 6 42 12 Q46 12 46 18 Q46 22 42 22Z" fill="${f}" stroke="${s}" stroke-width="2"/></svg>`,
      note:     `<svg width="50" height="28" viewBox="0 0 50 28"><rect x="2" y="2" width="40" height="24" rx="2" fill="${f}" stroke="${s}" stroke-width="2"/><polygon points="42,2 48,8 42,8" fill="${s}"/></svg>`,
      startEnd: `<svg width="50" height="28" viewBox="0 0 50 28"><rect x="2" y="6" width="46" height="16" rx="8" fill="${f}" stroke="${s}" stroke-width="2"/></svg>`,
    };
    return shapes[type] || shapes.rect;
  }

  // ── Ícones SVG da toolbar ────────────────────────────────────
  function _ico(name) {
    const icons = {
      cursor:  `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2l10 6-5 1-2 5z"/></svg>`,
      hand:    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v7M6 4v5M4 5v4M10 4v5M12 6c0-1-1-1.5-1.5-1l-.5-.5V4c0-.6-.4-1-1-1s-1 .4-1 1V2c0-.6-.4-1-1-1s-1 .4-1 1v1c-.6 0-1 .4-1 1v4l-1-1c-.4-.4-1-.4-1.4 0s-.4 1 0 1.4l3 3V13c0 1.1.9 2 2 2h1c1.7 0 3-1.3 3-3V7c0-1-.9-1-1-1z"/></svg>`,
      rect:    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="10" rx="1.5"/></svg>`,
      ellipse: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><ellipse cx="8" cy="8" rx="6" ry="4.5"/></svg>`,
      diamond: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="8,1 15,8 8,15 1,8"/></svg>`,
      text:    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4h10M8 4v9M6 13h4"/></svg>`,
      arrow:   `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 13L13 3M13 3H8M13 3V8"/></svg>`,
      palette: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><circle cx="5.5" cy="5.5" r="1" fill="currentColor"/><circle cx="10.5" cy="5.5" r="1" fill="currentColor"/><circle cx="8" cy="11" r="1" fill="currentColor"/></svg>`,
      trash:   `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 4h12M6 4V3h4v1M5 4v8h6V4"/></svg>`,
      copy:    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="8" height="9" rx="1"/><path d="M3 11V3h8"/></svg>`,
      undo:    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 8a5 5 0 1 0 1-3L2 3v4h4"/></svg>`,
      redo:    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M13 8a5 5 0 1 1-1-3l2-2v4h-4"/></svg>`,
      minus:   `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 8h10"/></svg>`,
      plus:    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>`,
      clear:   `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg>`,
      save:    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 14h10a1 1 0 0 0 1-1V5l-3-3H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1z"/><path d="M10 2v4H5V2M8 8v5"/></svg>`,
    };
    return icons[name] || '';
  }

  // ── Inicialização do canvas Fabric.js ────────────────────────
  function _initCanvas() {
    const wrap = document.getElementById('dgv10-canvas-wrap');
    if (!wrap) return;

    const w = wrap.clientWidth  || 900;
    const h = wrap.clientHeight || 600;

    _canvas = new fabric.Canvas('dgv10-canvas', {
      width:               w,
      height:              h,
      selection:           true,
      preserveObjectStacking: true,
      renderOnAddRemove:   true,
      backgroundColor:     'transparent',
    });

    // Redimensiona com o container
    const ro = new ResizeObserver(() => {
      if (!_canvas) return;
      const nw = wrap.clientWidth  || 900;
      const nh = wrap.clientHeight || 600;
      _canvas.setWidth(nw);
      _canvas.setHeight(nh);
      _canvas.renderAll();
    });
    ro.observe(wrap);

    // Eventos do canvas
    _canvas.on('object:modified',    _onCanvasModified);
    _canvas.on('object:added',       _onCanvasModified);
    _canvas.on('object:removed',     _onCanvasModified);
    _canvas.on('selection:created',  _onSelectionChanged);
    _canvas.on('selection:updated',  _onSelectionChanged);
    _canvas.on('selection:cleared',  _onSelectionCleared);
    _canvas.on('mouse:down',         _onMouseDown);
    _canvas.on('mouse:move',         _onMouseMove);
    _canvas.on('mouse:up',           _onMouseUp);
    _canvas.on('mouse:wheel',        _onMouseWheel);

    // Guarda estado inicial
    _pushHistory();
  }

  // ── Handlers de canvas ───────────────────────────────────────
  function _onCanvasModified(e) {
    // Não registra no histórico quando é triggered por loadFromJSON
    if (_canvas._pf_loading) return;
    _pushHistory();
    _markDirty();
  }

  function _onSelectionChanged(e) {
    const objs = _canvas.getActiveObjects();
    const label = objs.length === 1
      ? (objs[0].pf_label || objs[0].type)
      : objs.length > 1 ? `${objs.length} objetos` : '';
    const el = document.getElementById('dgv10-status-obj');
    if (el) el.textContent = label ? `Selecionado: ${label}` : 'Nenhum selecionado';
  }

  function _onSelectionCleared() {
    const el = document.getElementById('dgv10-status-obj');
    if (el) el.textContent = 'Nenhum objeto selecionado';
  }

  // ── Mouse: desenho e pan ─────────────────────────────────────
  function _onMouseDown(opt) {
    const e  = opt.e;
    const pt = _canvas.getPointer(e);

    if (_tool === 'pan') {
      _canvas.isDragging = true;
      _canvas.lastPosX   = e.clientX;
      _canvas.lastPosY   = e.clientY;
      _canvas.selection  = false;
      return;
    }

    if (_tool === 'arrow') {
      _startArrow(pt, opt.target);
      return;
    }

    if (['rect','ellipse','diamond','database','cloud','note','startEnd'].includes(_tool)) {
      _drawMode.active  = true;
      _drawMode.startX  = pt.x;
      _drawMode.startY  = pt.y;
      _drawMode.shape   = null;
      _canvas.selection = false;
      return;
    }

    if (_tool === 'text') {
      _addText(pt);
      return;
    }
  }

  function _onMouseMove(opt) {
    const e  = opt.e;
    const pt = _canvas.getPointer(e);

    // Pan do canvas
    if (_tool === 'pan' && _canvas.isDragging) {
      const dx = e.clientX - _canvas.lastPosX;
      const dy = e.clientY - _canvas.lastPosY;
      const vpt = _canvas.viewportTransform;
      vpt[4] += dx;
      vpt[5] += dy;
      _canvas.requestRenderAll();
      _canvas.lastPosX = e.clientX;
      _canvas.lastPosY = e.clientY;
      return;
    }

    // Seta em progresso
    if (_tool === 'arrow' && _arrowMode.active && _arrowMode.line) {
      _arrowMode.line.set({ x2: pt.x, y2: pt.y });
      _canvas.requestRenderAll();
      return;
    }

    // Desenho de forma em progresso
    if (_drawMode.active) {
      _drawShapePreview(pt);
      return;
    }
  }

  function _onMouseUp(opt) {
    const e  = opt.e;
    const pt = _canvas.getPointer(e);

    // Fim do pan
    if (_tool === 'pan') {
      _canvas.isDragging = false;
      _canvas.selection  = true;
      return;
    }

    // Fim da seta
    if (_tool === 'arrow' && _arrowMode.active) {
      _finishArrow(pt, opt.target);
      return;
    }

    // Fim do desenho de forma
    if (_drawMode.active) {
      _finishShape(pt);
      return;
    }
  }

  function _onMouseWheel(opt) {
    const delta = opt.e.deltaY;
    let zoom = _canvas.getZoom();
    zoom *= 0.999 ** delta;
    zoom  = Math.max(0.1, Math.min(8, zoom));

    _canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
    opt.e.preventDefault();
    opt.e.stopPropagation();
    _updateZoomLabel(zoom);
  }

  // ── Criação de formas ─────────────────────────────────────────
  function _drawShapePreview(pt) {
    const sx = _drawMode.startX, sy = _drawMode.startY;
    const w  = pt.x - sx, h = pt.y - sy;
    if (Math.abs(w) < 5 && Math.abs(h) < 5) return;

    // Remove preview anterior
    if (_drawMode.shape) {
      _canvas.remove(_drawMode.shape);
    }

    const cfg = PALETTE[_tool] || PALETTE.rect;
    const obj = _createFabricShape(_tool, sx, sy, w, h, cfg);
    if (!obj) return;

    obj.set({ opacity: 0.6, selectable: false, evented: false });
    _canvas.add(obj);
    _canvas.requestRenderAll();
    _drawMode.shape = obj;
  }

  function _finishShape(pt) {
    _drawMode.active = false;

    // Remove preview
    if (_drawMode.shape) {
      _canvas.remove(_drawMode.shape);
      _drawMode.shape = null;
    }

    const sx = _drawMode.startX, sy = _drawMode.startY;
    let   w  = pt.x - sx, h = pt.y - sy;

    // Clique simples sem arrastar → cria objeto com tamanho padrão
    if (Math.abs(w) < 10 && Math.abs(h) < 10) {
      w = 160; h = 80;
    }

    const cfg = PALETTE[_tool] || PALETTE.rect;
    const obj = _createFabricShape(_tool, sx, sy, w, h, cfg);
    if (!obj) return;

    obj.set({ opacity: 1, selectable: true, evented: true });
    _canvas._pf_loading = false;
    _canvas.add(obj);
    _canvas.setActiveObject(obj);
    _canvas.requestRenderAll();
    _canvas.selection = true;
    _setTool('select');
  }

  // Cria o objeto Fabric conforme o tipo
  function _createFabricShape(type, sx, sy, w, h, cfg) {
    const ax = w < 0 ? sx + w : sx;
    const ay = h < 0 ? sy + h : sy;
    const aw = Math.abs(w);
    const ah = Math.abs(h);

    const base = {
      left:          ax,
      top:           ay,
      fill:          cfg.fill,
      stroke:        cfg.stroke,
      strokeWidth:   2,
      cornerColor:   cfg.stroke,
      cornerStyle:   'circle',
      transparentCorners: false,
      pf_type:       type,
      pf_label:      cfg.label,
    };

    switch (type) {
      case 'rect':
      case 'cloud':
      case 'note': {
        const rx = type === 'rect' ? 6 : type === 'note' ? 2 : 12;
        return new fabric.Rect({ ...base, width: aw, height: ah, rx, ry: rx });
      }
      case 'ellipse':
      case 'startEnd':
        return new fabric.Ellipse({ ...base, rx: aw / 2, ry: ah / 2,
          originX: 'left', originY: 'top',
          width: aw, height: ah });
      case 'diamond': {
        const pts = [
          { x: aw / 2, y: 0      },
          { x: aw,     y: ah / 2 },
          { x: aw / 2, y: ah     },
          { x: 0,      y: ah / 2 },
        ];
        return new fabric.Polygon(pts, { ...base });
      }
      case 'database': {
        // Retângulo com elipse no topo (simulado com grupo)
        const body  = new fabric.Rect({ left: 0, top: 12, width: aw, height: ah - 12, fill: cfg.fill, stroke: cfg.stroke, strokeWidth: 2 });
        const topEl = new fabric.Ellipse({ left: 0, top: 0, rx: aw / 2, ry: 12, fill: cfg.fill, stroke: cfg.stroke, strokeWidth: 2, originX: 'left' });
        const botEl = new fabric.Ellipse({ left: 0, top: ah - 12, rx: aw / 2, ry: 12, fill: cfg.fill, stroke: cfg.stroke, strokeWidth: 2, originX: 'left' });
        const grp   = new fabric.Group([body, topEl, botEl], { left: ax, top: ay, pf_type: 'database', pf_label: 'Banco' });
        return grp;
      }
      default:
        return new fabric.Rect({ ...base, width: aw, height: ah, rx: 6, ry: 6 });
    }
  }

  // ── Texto ─────────────────────────────────────────────────────
  function _addText(pt) {
    const txt = new fabric.IText('Texto', {
      left:      pt.x,
      top:       pt.y,
      fontSize:  14,
      fontFamily:'Inter, system-ui, sans-serif',
      fill:      '#1a1a18',
      editable:  true,
      pf_type:   'text',
      pf_label:  'Texto',
    });
    _canvas.add(txt);
    _canvas.setActiveObject(txt);
    txt.enterEditing();
    txt.selectAll();
    _canvas.requestRenderAll();
    _setTool('select');
  }

  // ── Setas / Conectores ───────────────────────────────────────
  function _startArrow(pt, target) {
    _arrowMode.active   = true;
    _arrowMode.startObj = target || null;

    const line = new fabric.Line(
      [pt.x, pt.y, pt.x, pt.y],
      {
        stroke:            '#6B7280',
        strokeWidth:       2,
        selectable:        false,
        evented:           false,
        hasBorders:        false,
        hasControls:       false,
        originX:           'center',
        originY:           'center',
        pf_type:           'arrow',
        pf_label:          'Seta',
      }
    );
    _canvas.add(line);
    _arrowMode.line = line;
  }

  function _finishArrow(pt, target) {
    if (!_arrowMode.active || !_arrowMode.line) {
      _arrowMode = { active: false, line: null, startObj: null };
      return;
    }

    const line = _arrowMode.line;

    // Seta muito pequena → remove
    const dx = line.x2 - line.x1;
    const dy = line.y2 - line.y1;
    if (Math.sqrt(dx*dx + dy*dy) < 10) {
      _canvas.remove(line);
      _arrowMode = { active: false, line: null, startObj: null };
      return;
    }

    // Cria a cabeça da seta usando triângulo
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const arrowHead = new fabric.Triangle({
      left:        line.x2,
      top:         line.y2,
      width:       12,
      height:      12,
      fill:        '#6B7280',
      angle:       angle + 90,
      originX:     'center',
      originY:     'center',
      selectable:  false,
      evented:     false,
      pf_type:     'arrowhead',
    });

    // Finaliza a linha como selecionável
    line.set({ selectable: true, evented: true });

    // Agrupa linha + cabeça
    const group = new fabric.Group([line, arrowHead], {
      selectable: true,
      evented:    true,
      pf_type:    'arrow',
      pf_label:   'Seta',
    });
    _canvas.remove(line);
    _canvas.add(group);
    _canvas.requestRenderAll();

    _arrowMode = { active: false, line: null, startObj: null };
    _setTool('select');
  }

  // ── Ferramenta ativa ─────────────────────────────────────────
  function _setTool(tool) {
    _tool = tool;

    // Atualiza estilos da toolbar
    document.querySelectorAll('.dgv10-btn[data-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });

    // Cursors e modo de seleção
    const isPan  = tool === 'pan';
    const isDraw = ['rect','ellipse','diamond','database','cloud','note','startEnd','arrow','text'].includes(tool);

    _canvas.selection        = !isDraw && !isPan;
    _canvas.defaultCursor    = isPan ? 'grab' : isDraw ? 'crosshair' : 'default';
    _canvas.hoverCursor      = isPan ? 'grab' : isDraw ? 'crosshair' : 'move';

    // Atualiza status
    const labels = {
      select:'Selecionar', pan:'Mover Canvas', rect:'Retângulo', ellipse:'Elipse',
      diamond:'Losango', text:'Texto', arrow:'Seta', database:'Banco de Dados',
      cloud:'Serviço', note:'Nota', startEnd:'Início/Fim',
    };
    const el = document.getElementById('dgv10-status-tool');
    if (el) el.textContent = `Ferramenta: ${labels[tool] || tool}`;
  }

  // ── Drag & Drop da paleta ────────────────────────────────────
  function _bindDragPalette() {
    const palEl = document.getElementById('dgv10-palette');
    if (!palEl) return;

    let _dragType = null;

    palEl.querySelectorAll('.dgv10-pal-item').forEach(item => {
      item.addEventListener('dragstart', e => {
        _dragType = item.dataset.type;
        e.dataTransfer.effectAllowed = 'copy';
      });
    });

    const wrap = document.getElementById('dgv10-canvas-wrap');
    if (!wrap) return;

    wrap.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    wrap.addEventListener('drop', e => {
      e.preventDefault();
      if (!_dragType) return;

      const rect = wrap.getBoundingClientRect();
      const vpt  = _canvas.viewportTransform;
      const x    = (e.clientX - rect.left - vpt[4]) / vpt[0];
      const y    = (e.clientY - rect.top  - vpt[5]) / vpt[3];

      const cfg = PALETTE[_dragType] || PALETTE.rect;
      const obj = _createFabricShape(_dragType, x - 80, y - 40, 160, 80, cfg);
      if (!obj) return;

      // Adiciona label de texto ao nó (exceto grupo)
      if (obj.type !== 'group' && _dragType !== 'arrow') {
        const lbl = new fabric.Text(cfg.label, {
          fontSize:    12,
          fontFamily:  'Inter, system-ui, sans-serif',
          fill:        cfg.text,
          originX:     'center',
          originY:     'center',
          left:        80,
          top:         40,
          selectable:  false,
          evented:     false,
        });
        const grp = new fabric.Group([obj, lbl], {
          left:     x - 80,
          top:      y - 40,
          pf_type:  _dragType,
          pf_label: cfg.label,
        });
        // Ajusta posição porque o Group reposiciona
        grp.set({ left: x - 80, top: y - 40 });
        _canvas.add(grp);
        _canvas.setActiveObject(grp);
      } else {
        _canvas.add(obj);
        _canvas.setActiveObject(obj);
      }

      _canvas.requestRenderAll();
      _dragType = null;
    });
  }

  // ── Toolbar: eventos ─────────────────────────────────────────
  function _bindToolbar() {
    // Ferramentas
    document.querySelectorAll('.dgv10-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => _setTool(btn.dataset.tool));
    });

    // Deletar
    document.getElementById('dgv10-btn-del')?.addEventListener('click', _deleteSelected);

    // Duplicar
    document.getElementById('dgv10-btn-dup')?.addEventListener('click', _duplicateSelected);

    // Undo / Redo
    document.getElementById('dgv10-btn-undo')?.addEventListener('click', _undo);
    document.getElementById('dgv10-btn-redo')?.addEventListener('click', _redo);

    // Zoom
    document.getElementById('dgv10-btn-zin')?.addEventListener('click', () => _zoom(1.2));
    document.getElementById('dgv10-btn-zout')?.addEventListener('click', () => _zoom(0.8));
    document.getElementById('dgv10-btn-fit')?.addEventListener('click', _fitView);

    // Limpar
    document.getElementById('dgv10-btn-clear')?.addEventListener('click', () => {
      if (!confirm('Limpar todo o diagrama? Esta ação não pode ser desfeita.')) return;
      _canvas.clear();
      _pushHistory();
      _markDirty();
    });

    // Salvar
    document.getElementById('dgv10-btn-save')?.addEventListener('click', () => salvar());

    // Color picker
    document.getElementById('dgv10-btn-color')?.addEventListener('click', _toggleColorPicker);
    document.getElementById('dgv10-cp-apply')?.addEventListener('click', _applyColor);

    // Fecha color picker ao clicar fora
    document.addEventListener('click', e => {
      const cp  = document.getElementById('dgv10-colorpicker');
      const btn = document.getElementById('dgv10-btn-color');
      if (cp && !cp.contains(e.target) && e.target !== btn) {
        cp.classList.remove('visible');
      }
    });
  }

  function _toggleColorPicker(e) {
    e.stopPropagation();
    const cp  = document.getElementById('dgv10-colorpicker');
    const btn = document.getElementById('dgv10-btn-color');
    if (!cp) return;

    const rect = btn.getBoundingClientRect();
    const root = document.getElementById('dgv10-root');
    const rr   = root.getBoundingClientRect();

    cp.style.left = (rect.left - rr.left) + 'px';
    cp.style.top  = (rect.bottom - rr.top + 6) + 'px';
    cp.classList.toggle('visible');

    // Preenche com cores do objeto ativo
    const obj = _canvas.getActiveObject();
    if (obj) {
      document.getElementById('dgv10-cp-fill').value   = obj.fill   || '#DBEAFE';
      document.getElementById('dgv10-cp-stroke').value = obj.stroke || '#2563EB';
    }
  }

  function _applyColor() {
    const fill   = document.getElementById('dgv10-cp-fill').value;
    const stroke = document.getElementById('dgv10-cp-stroke').value;
    const textC  = document.getElementById('dgv10-cp-text').value;
    const objs   = _canvas.getActiveObjects();

    objs.forEach(obj => {
      obj.set({ fill, stroke });
      // Se for grupo, aplica nos filhos também
      if (obj.type === 'group') {
        obj.getObjects().forEach(child => {
          if (child.type !== 'text' && child.type !== 'i-text') {
            child.set({ fill, stroke });
          } else {
            child.set({ fill: textC });
          }
        });
      }
    });

    _canvas.requestRenderAll();
    _markDirty();
    document.getElementById('dgv10-colorpicker')?.classList.remove('visible');
  }

  // ── Ações de objeto ──────────────────────────────────────────
  function _deleteSelected() {
    const objs = _canvas.getActiveObjects();
    if (!objs.length) return;
    objs.forEach(o => _canvas.remove(o));
    _canvas.discardActiveObject();
    _canvas.requestRenderAll();
  }

  function _duplicateSelected() {
    const obj = _canvas.getActiveObject();
    if (!obj) return;
    obj.clone(cloned => {
      cloned.set({ left: obj.left + 20, top: obj.top + 20 });
      _canvas.add(cloned);
      _canvas.setActiveObject(cloned);
      _canvas.requestRenderAll();
    });
  }

  // ── Histórico (undo/redo) ────────────────────────────────────
  function _pushHistory() {
    // Remove redo futuro
    if (_histIdx < _history.length - 1) {
      _history = _history.slice(0, _histIdx + 1);
    }
    const snap = JSON.stringify(_canvas.toJSON(['pf_type','pf_label']));
    _history.push(snap);
    if (_history.length > MAX_HISTORY) _history.shift();
    _histIdx = _history.length - 1;
  }

  function _undo() {
    if (_histIdx <= 0) { showToast('Nada para desfazer', true); return; }
    _histIdx--;
    _restoreHistory(_history[_histIdx]);
  }

  function _redo() {
    if (_histIdx >= _history.length - 1) { showToast('Nada para refazer', true); return; }
    _histIdx++;
    _restoreHistory(_history[_histIdx]);
  }

  function _restoreHistory(snap) {
    _canvas._pf_loading = true;
    _canvas.loadFromJSON(snap, () => {
      _canvas._pf_loading = false;
      _canvas.requestRenderAll();
      _markDirty();
    });
  }

  // ── Zoom ─────────────────────────────────────────────────────
  function _zoom(factor) {
    const z = Math.max(0.1, Math.min(8, _canvas.getZoom() * factor));
    _canvas.zoomToPoint({ x: _canvas.width / 2, y: _canvas.height / 2 }, z);
    _updateZoomLabel(z);
  }

  function _fitView() {
    const objs = _canvas.getObjects();
    if (!objs.length) { _canvas.setViewportTransform([1,0,0,1,0,0]); _updateZoomLabel(1); return; }
    _canvas.fitToViewport ? _canvas.fitToViewport() : (() => {
      const bbox = objs.reduce((b, o) => {
        const r = o.getBoundingRect(true);
        return {
          l: Math.min(b.l, r.left),  t: Math.min(b.t, r.top),
          r: Math.max(b.r, r.left + r.width), b: Math.max(b.b, r.top + r.height),
        };
      }, { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity });
      const pad  = 40;
      const bw   = bbox.r - bbox.l + pad * 2;
      const bh   = bbox.b - bbox.t + pad * 2;
      const zoom = Math.min(_canvas.width / bw, _canvas.height / bh, 3);
      _canvas.setViewportTransform([zoom, 0, 0, zoom,
        (_canvas.width  - bw * zoom) / 2 - bbox.l * zoom + pad * zoom,
        (_canvas.height - bh * zoom) / 2 - bbox.t * zoom + pad * zoom,
      ]);
      _updateZoomLabel(zoom);
    })();
  }

  function _updateZoomLabel(z) {
    const el = document.getElementById('dgv10-zoom-label');
    if (el) el.textContent = Math.round(z * 100) + '%';
  }

  // ── Teclado ──────────────────────────────────────────────────
  function _bindKeyboard() {
    document.addEventListener('keydown', e => {
      if (!_canvas) return;
      // Ignora quando foca em input/textarea
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;

      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'z': e.preventDefault(); _undo(); break;
          case 'y': e.preventDefault(); _redo(); break;
          case 'd': e.preventDefault(); _duplicateSelected(); break;
          case 's': e.preventDefault(); salvar(); break;
          case 'a': e.preventDefault();
            _canvas.discardActiveObject();
            _canvas.setActiveObject(new fabric.ActiveSelection(_canvas.getObjects(), { canvas: _canvas }));
            _canvas.requestRenderAll();
            break;
        }
        return;
      }

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          if (_canvas.getActiveObjects().length) { e.preventDefault(); _deleteSelected(); }
          break;
        case 'v': _setTool('select');  break;
        case 'h': _setTool('pan');     break;
        case 'r': _setTool('rect');    break;
        case 'e': _setTool('ellipse'); break;
        case 'd': _setTool('diamond'); break;
        case 't': _setTool('text');    break;
        case 'a': _setTool('arrow');   break;
        case '0': _fitView();          break;
        case '+': case '=': _zoom(1.2); break;
        case '-': _zoom(0.8); break;
        case 'Escape':
          _setTool('select');
          _arrowMode = { active: false, line: null, startObj: null };
          _drawMode.active = false;
          if (_drawMode.shape) { _canvas.remove(_drawMode.shape); _drawMode.shape = null; }
          break;
      }
    });
  }

  // ── Dirty / Save status ──────────────────────────────────────
  function _markDirty() {
    _dirty = true;
    _setSaveStatus('dirty');
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      if (_dirty) salvar(true); // autosave silencioso
    }, SAVE_DELAY);
  }

  function _setSaveStatus(state) {
    const dot   = document.getElementById('dgv10-save-dot');
    const label = document.getElementById('dgv10-save-label');
    if (!dot || !label) return;
    dot.className   = `dgv10-dot-${state}`;
    label.textContent = { saved: 'Salvo', dirty: 'Não salvo', saving: 'Salvando…' }[state] || state;
  }

  // ══════════════════════════════════════════════════════════════
  //  PERSISTÊNCIA SUPABASE
  // ══════════════════════════════════════════════════════════════

  /**
   * Salva o diagrama no Supabase.
   * Extrai canvas.toJSON(), faz upsert na tabela project_diagrams.
   * @param {boolean} silent — se true, não exibe toast de sucesso
   */
  async function salvar(silent = false) {
    if (!_pid) {
      showToast('Selecione um projeto antes de salvar', true);
      return;
    }
    if (!_canvas) {
      showToast('Canvas não inicializado', true);
      return;
    }

    const btnSave = document.getElementById('dgv10-btn-save');
    if (btnSave) btnSave.disabled = true;
    _setSaveStatus('saving');

    try {
      // Extrai estado completo do Fabric.js
      // Inclui propriedades customizadas pf_type e pf_label
      const fabricJson = _canvas.toJSON(['pf_type', 'pf_label']);

      // Captura viewport atual
      const vpt = _canvas.viewportTransform;
      const canvasConfig = {
        zoom:  _canvas.getZoom(),
        pan_x: vpt ? vpt[4] : 0,
        pan_y: vpt ? vpt[5] : 0,
        width: _canvas.width,
        height: _canvas.height,
      };

      const supabase = window._supabase || window.supabase;
      if (!supabase) throw new Error('Cliente Supabase não encontrado. Verifique window._supabase ou window.supabase.');

      // Monta payload para upsert
      const payload = {
        project_id:    _pid,
        task_id:       _taskId || null,
        name:          'Diagrama Principal',
        is_current:    true,
        diagram_type:  'free_draw',
        fabric_json:   fabricJson,
        canvas_config: canvasConfig,
        updated_at:    new Date().toISOString(),
      };

      let result;

      if (_diagramId) {
        // Atualiza registro existente
        const { data, error } = await supabase
          .from('project_diagrams')
          .update(payload)
          .eq('id', _diagramId)
          .select('id')
          .single();

        if (error) throw error;
        result = data;
      } else {
        // Insere novo (ou usa upsert por project_id + task_id + is_current)
        const { data, error } = await supabase
          .from('project_diagrams')
          .upsert(payload, {
            onConflict:   'project_id,is_current',
            ignoreDuplicates: false,
          })
          .select('id')
          .single();

        if (error) throw error;
        result = data;
        _diagramId = result?.id || null;
      }

      _dirty = false;
      _setSaveStatus('saved');
      if (!silent) showToast('Diagrama salvo com êxito ✓');

    } catch (err) {
      console.error('[DiagramaEngine] Erro ao salvar:', err);
      _setSaveStatus('dirty');
      showToast(`Erro ao salvar diagrama: ${err.message || err}`, true);
    } finally {
      if (btnSave) btnSave.disabled = false;
    }
  }

  /**
   * Carrega o diagrama do Supabase e renderiza no canvas.
   * Busca o registro mais recente de project_diagrams para o projeto/tarefa.
   * @param {string} projectId
   * @param {string|null} taskId
   */
  async function carregar(projectId, taskId = null) {
    if (!_canvas) return;

    const supabase = window._supabase || window.supabase;
    if (!supabase) {
      console.warn('[DiagramaEngine] Supabase não disponível para carregar diagrama');
      return;
    }

    try {
      let query = supabase
        .from('project_diagrams')
        .select('id, fabric_json, canvas_config')
        .eq('project_id', projectId)
        .eq('is_current', true)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (taskId) {
        query = query.eq('task_id', taskId);
      } else {
        query = query.is('task_id', null);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;
      if (!data || !data.fabric_json || Object.keys(data.fabric_json).length === 0) {
        // Nenhum diagrama salvo ainda — canvas começa vazio
        return;
      }

      _diagramId = data.id;

      // Restaura viewport (zoom + pan)
      const cc = data.canvas_config;
      if (cc && cc.zoom) {
        _canvas.setViewportTransform([
          cc.zoom, 0, 0, cc.zoom,
          cc.pan_x || 0,
          cc.pan_y || 0,
        ]);
        _updateZoomLabel(cc.zoom);
      }

      // Carrega objetos do Fabric.js
      _canvas._pf_loading = true;
      await new Promise((resolve, reject) => {
        _canvas.loadFromJSON(data.fabric_json, () => {
          _canvas._pf_loading = false;
          _canvas.requestRenderAll();
          resolve();
        });
      });

      // Reinicia histórico com estado carregado
      _history  = [JSON.stringify(data.fabric_json)];
      _histIdx  = 0;
      _dirty    = false;
      _setSaveStatus('saved');

    } catch (err) {
      console.error('[DiagramaEngine] Erro ao carregar:', err);
      showToast(`Erro ao carregar diagrama: ${err.message || err}`, true);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  API PÚBLICA: init
  // ══════════════════════════════════════════════════════════════

  /**
   * Inicializa o editor de diagramas dentro de um container existente.
   * @param {string} containerId — id do elemento HTML que vai receber o editor
   * @param {string} projectId  — UUID do projeto
   * @param {string|null} taskId — UUID da tarefa (opcional)
   */
  async function init(containerId, projectId, taskId = null) {
    _pid    = projectId;
    _taskId = taskId || null;

    if (!_pid) {
      showToast('Selecione um Projeto antes de abrir o Editor de Diagramas', true);
      return;
    }

    const outer = document.getElementById(containerId);
    if (!outer) {
      console.error(`[DiagramaEngine] Container #${containerId} não encontrado`);
      return;
    }

    // Limpa instância anterior
    if (_canvas) {
      try { _canvas.dispose(); } catch (e) {}
      _canvas = null;
    }
    _history   = [];
    _histIdx   = -1;
    _dirty     = false;
    _diagramId = null;
    clearTimeout(_saveTimer);

    // Carrega Fabric.js
    try {
      await _loadFabric();
    } catch (err) {
      showToast('Falha ao carregar Fabric.js: ' + err.message, true);
      return;
    }

    // Monta DOM
    _injectCSS();
    let root = document.getElementById('dgv10-root');
    if (root) root.remove();
    root = document.createElement('div');
    root.id = 'dgv10-root';
    root.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;height:100%;';
    outer.appendChild(root);
    root.innerHTML = _buildHTML();

    // Inicializa canvas após DOM montado
    _initCanvas();
    _bindToolbar();
    _bindKeyboard();
    _bindDragPalette();
    _setTool('select');

    // Carrega diagrama salvo
    await carregar(_pid, _taskId);

    showToast('Editor de Diagramas pronto — Fabric.js ativo');
  }

  // ── Expõe API pública ────────────────────────────────────────
  return {
    init,
    salvar,
    carregar,
    getCanvas: () => _canvas,
  };

})();


// ============================================================
//  MÓDULO: uploadAnexo
//  Upload de arquivos para Supabase Storage + registro em BD
//
//  Uso:
//    const result = await uploadAnexo(file, taskId);
//    // result: { id, file_name, public_url, storage_path }
// ============================================================
window.uploadAnexo = async function uploadAnexo(file, taskId) {
  const supabase = window._supabase || window.supabase;
  if (!supabase) throw new Error('Supabase não inicializado');
  if (!file)     throw new Error('Arquivo não fornecido');
  if (!taskId)   throw new Error('taskId é obrigatório');

  const BUCKET = 'anexos_tarefas';
  const MAX_MB = 50;

  // Valida tamanho
  if (file.size > MAX_MB * 1024 * 1024) {
    throw new Error(`Arquivo muito grande (max ${MAX_MB} MB)`);
  }

  // Caminho no bucket: {task_id}/{uuid}/{filename_sanitizado}
  const uuid     = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._\-]/g, '_');
  const path     = `${taskId}/${uuid}/${safeName}`;

  // ── 1. Upload para o Storage ──────────────────────────────
  const { data: uploadData, error: uploadError } = await supabase
    .storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert:       false,
      contentType:  file.type || 'application/octet-stream',
    });

  if (uploadError) {
    throw new Error(`Upload falhou: ${uploadError.message}`);
  }

  // ── 2. Gera URL pública (ou signed URL se bucket for privado) ─
  // O bucket anexos_tarefas é PRIVADO — usamos signed URL de 1 ano
  // Troque por getPublicUrl() se tornar o bucket público
  const { data: urlData, error: urlError } = await supabase
    .storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 ano

  if (urlError) {
    throw new Error(`Erro ao gerar URL: ${urlError.message}`);
  }

  const publicUrl = urlData.signedUrl;

  // ── 3. Salva registro na tabela task_attachments ──────────
  const { data: attData, error: attError } = await supabase
    .from('task_attachments')
    .insert({
      task_id:      taskId,
      file_name:    file.name,
      file_size:    file.size,
      mime_type:    file.type || 'application/octet-stream',
      storage_path: path,
      public_url:   publicUrl,
      uploaded_by:  (await supabase.auth.getUser())?.data?.user?.id || null,
    })
    .select('id, file_name, public_url, storage_path, file_size, mime_type, created_at')
    .single();

  if (attError) {
    // Tenta remover o arquivo do storage se o registro falhou
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw new Error(`Erro ao registrar anexo no banco: ${attError.message}`);
  }

  return attData;
};

/**
 * Remove um anexo do Storage e do banco de dados.
 * @param {string} attachmentId — UUID do registro em task_attachments
 * @param {string} storagePath  — caminho no bucket (armazenado em storage_path)
 */
window.removerAnexo = async function removerAnexo(attachmentId, storagePath) {
  const supabase = window._supabase || window.supabase;
  if (!supabase) throw new Error('Supabase não inicializado');

  const BUCKET = 'anexos_tarefas';

  // Remove do Storage
  const { error: storageError } = await supabase
    .storage
    .from(BUCKET)
    .remove([storagePath]);

  if (storageError) {
    console.warn('[removerAnexo] Aviso ao remover do Storage:', storageError.message);
    // Continua para remover do banco mesmo se o Storage falhar
  }

  // Remove do banco
  const { error: dbError } = await supabase
    .from('task_attachments')
    .delete()
    .eq('id', attachmentId);

  if (dbError) {
    throw new Error(`Erro ao remover registro: ${dbError.message}`);
  }
};

/**
 * Lista os anexos de uma tarefa.
 * @param {string} taskId
 * @returns {Array} lista de anexos
 */
window.listarAnexos = async function listarAnexos(taskId) {
  const supabase = window._supabase || window.supabase;
  if (!supabase) throw new Error('Supabase não inicializado');

  const { data, error } = await supabase
    .from('task_attachments')
    .select('id, file_name, file_size, mime_type, storage_path, public_url, uploaded_by, created_at')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Erro ao listar anexos: ${error.message}`);
  return data || [];
};


// ============================================================
//  MÓDULO: WikiAI
//  Integração com Anthropic API (via Edge Function proxy)
//  para geração de conteúdo na Wiki/Documentação
//
//  CONFIGURAÇÃO:
//    window.PF_CONFIG = {
//      supabaseUrl: 'https://SEU_PROJETO.supabase.co',
//      supabaseKey: 'SUA_ANON_KEY',
//    };
//    (A API Key da Anthropic fica SOMENTE no Supabase Edge Function,
//     nunca exposta no front-end)
// ============================================================
window.WikiAI = (function () {

  // URL da Edge Function (proxy Anthropic — resolve CORS e guarda a API key)
  // Troque pelo URL real da sua Edge Function
  const PROXY_URL   = () => `${(window.PF_CONFIG?.supabaseUrl || '')}` +
                             `/functions/v1/claude-proxy`;
  const AI_MODEL    = 'claude-sonnet-4-20250514';
  const AI_TOKENS   = 2000;
  const TIMEOUT_MS  = 45000;  // 45 segundos

  /**
   * Envia prompt para a API de IA e renderiza a resposta em um elemento DOM.
   *
   * @param {object}  opts
   * @param {string}  opts.prompt         — prompt do usuário
   * @param {string}  opts.system         — system prompt (contexto do projeto)
   * @param {string}  opts.targetId       — id do elemento HTML que recebe a resposta
   * @param {string}  opts.loadingId      — id do spinner/loading (opcional)
   * @param {Function} opts.onSuccess     — callback(text) chamado ao terminar
   * @param {Function} opts.onError       — callback(error) chamado em caso de falha
   */
  async function gerar(opts = {}) {
    const {
      prompt, system,
      targetId, loadingId,
      onSuccess, onError,
    } = opts;

    if (!prompt?.trim()) {
      showToast('Digite um prompt antes de gerar', true);
      return;
    }

    const targetEl  = document.getElementById(targetId);
    const loadingEl = loadingId ? document.getElementById(loadingId) : null;

    // Mostra loading
    if (loadingEl) loadingEl.style.display = 'flex';
    if (targetEl)  targetEl.style.opacity  = '0.5';

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      // Obtém token de autenticação do Supabase para o proxy
      const supabase = window._supabase || window.supabase;
      const session  = supabase
        ? (await supabase.auth.getSession())?.data?.session
        : null;
      const authHeader = session?.access_token
        ? { 'Authorization': `Bearer ${session.access_token}` }
        : {};

      const response = await fetch(PROXY_URL(), {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey':        window.PF_CONFIG?.supabaseKey || '',
          ...authHeader,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model:      AI_MODEL,
          max_tokens: AI_TOKENS,
          system:     system || 'Você é um assistente especializado em documentação de projetos de software. Responda em português do Brasil, de forma clara e objetiva.',
          messages: [
            { role: 'user', content: prompt.trim() }
          ],
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody?.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();

      // Extrai texto da resposta
      const text = data?.content?.[0]?.text
        || data?.content?.map?.(b => b.text || '').join('')
        || '';

      if (!text) throw new Error('Resposta vazia da IA');

      // Renderiza no DOM (converte markdown básico para HTML)
      if (targetEl) {
        targetEl.innerHTML = _markdownToHtml(text);
        targetEl.style.opacity = '1';
      }

      if (typeof onSuccess === 'function') onSuccess(text);
      showToast('Conteúdo gerado com êxito ✓');
      return text;

    } catch (err) {
      clearTimeout(timeoutId);
      console.error('[WikiAI] Erro:', err);

      const msg = err.name === 'AbortError'
        ? 'Timeout: a IA demorou muito para responder'
        : `Erro ao gerar conteúdo: ${err.message}`;

      if (targetEl) targetEl.style.opacity = '1';
      if (typeof onError === 'function') onError(err);
      showToast(msg, true);
      throw err;

    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  /**
   * Converte markdown básico para HTML seguro.
   * Cobre: títulos, negrito, itálico, listas, blocos de código, parágrafos.
   */
  function _markdownToHtml(md) {
    const e = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    let html = e(md);

    // Blocos de código (preservados antes de outras transformações)
    const codeBlocks = [];
    html = html.replace(/```[\s\S]*?```/g, match => {
      const inner = match.slice(3, -3).replace(/^[a-z]*\n/, '');
      codeBlocks.push(`<pre><code>${inner}</code></pre>`);
      return `%%CODE_BLOCK_${codeBlocks.length - 1}%%`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);

    // Títulos
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm,   '<h1>$1</h1>');

    // Negrito e itálico
    html = html.replace(/\*\*(.+?)\*\*/g,  '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g,       '<em>$1</em>');
    html = html.replace(/__(.+?)__/g,       '<strong>$1</strong>');
    html = html.replace(/_(.+?)_/g,         '<em>$1</em>');

    // Listas não-ordenadas
    html = html.replace(/^[\*\-] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);

    // Listas ordenadas
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Parágrafos
    html = html.split(/\n{2,}/).map(p => {
      if (/^<(h[1-6]|ul|ol|pre|li)/.test(p.trim())) return p;
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    // Restaura blocos de código
    codeBlocks.forEach((block, i) => {
      html = html.replace(`%%CODE_BLOCK_${i}%%`, block);
    });

    return html;
  }

  return { gerar };

})();
