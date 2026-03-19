// ============================================================
//  ProjectFlow V10 — diagram-engine-v9.js
//  Canvas de Diagramas — Fabric.js 5.x
//  ✅ Dark/Light mode via CSS variables
//  ✅ Canvas infinito: pan + zoom preciso
//  ✅ Proporções corretas em todos os shapes
//  ✅ Persistência: localStorage + Supabase (SELECT→UPDATE/INSERT)
//  ✅ Undo/Redo 80 estados
//  ✅ Autosave 2s debounce
//  ✅ Drag & drop da paleta
//  ✅ Painel de propriedades
//  ✅ Teclado completo
// ============================================================
'use strict';

window.DiagramEngineV9 = (function () {

  // ── Estado ────────────────────────────────────────────────
  let _canvas    = null;
  let _pid       = null;
  let _taskId    = null;
  let _tool      = 'select';
  let _hist      = [];
  let _histIdx   = -1;
  let _dirty     = false;
  let _saveTimer = null;
  let _kbBound        = false;
  let _themeObserver  = null;
  const MAXHIST       = 80;

  function _getCanvasBg() {
    // Read computed CSS variable — respects light/dark mode
    const theme = document.documentElement.getAttribute('data-theme');
    return theme === 'dark' ? '#161615' : '#f7f7f6';
  }

  // Draw/arrow/pan state
  let _ds = { on:false, sx:0, sy:0, pre:null };
  let _as = { on:false, ln:null };
  let _ps = { on:false, lx:0, ly:0 };
  let _fd = { on:false, pts:[], pre:null };

  // Current stroke/fill for new shapes
  let _ink = { fill:'#fff9db', stroke:'#e9c46a', sw:2, fs:15 };

  // ── Shape definitions ─────────────────────────────────────
  const SHAPES = {
    rect:    { label:'Caixa',      emoji:'⬜', fill:'#fff9db', stroke:'#e9c46a', text:'#5c4a00', rx:8  },
    ellipse: { label:'Elipse',     emoji:'⭕', fill:'#dbeafe', stroke:'#3b82f6', text:'#1e3a8a'        },
    diamond: { label:'Decisão',    emoji:'💠', fill:'#fce7f3', stroke:'#ec4899', text:'#831843'        },
    process: { label:'Processo',   emoji:'🔲', fill:'#d1fae5', stroke:'#10b981', text:'#064e3b', rx:16 },
    db:      { label:'Banco',      emoji:'🗃', fill:'#ede9fe', stroke:'#7c3aed', text:'#3b0764'        },
    cloud:   { label:'Serviço',    emoji:'☁', fill:'#f0f9ff', stroke:'#0ea5e9', text:'#0c4a6e', rx:30 },
    actor:   { label:'Ator',       emoji:'👤', fill:'#fef3c7', stroke:'#f59e0b', text:'#78350f'        },
    note:    { label:'Nota',       emoji:'📝', fill:'#fffbeb', stroke:'#f59e0b', text:'#78350f', rx:4  },
    term:    { label:'Início/Fim', emoji:'🔴', fill:'#fee2e2', stroke:'#ef4444', text:'#7f1d1d', rx:99 },
  };

  const QCOLORS = [
    '#fff9db','#dbeafe','#d1fae5','#fce7f3','#ede9fe',
    '#fef3c7','#fee2e2','#f0f9ff','#f0fdf4','#fff7ed',
    '#1e3a8a','#064e3b','#7f1d1d','#78350f','#374151','#1a1a18',
  ];

  // ── CSS ───────────────────────────────────────────────────
  function _injectCSS() {
    if (document.getElementById('pf-dg10-css')) return;
    const s = document.createElement('style');
    s.id = 'pf-dg10-css';
    // Use CSS variables from tokens.css so dark mode works automatically
    s.textContent = `
#dgv9-root{display:flex;flex-direction:column;height:100%;position:relative;overflow:hidden;background:var(--bg-0);font-family:var(--font,system-ui)}

/* toolbar */
#dg-tb{display:flex;align-items:center;gap:3px;padding:6px 12px;background:var(--bg-1);border-bottom:1px solid var(--bd);flex-shrink:0;flex-wrap:wrap;box-shadow:var(--sh-1);z-index:10}
.dg-sep{width:1px;height:20px;background:var(--bd);margin:0 3px;flex-shrink:0}
.dg-btn{display:flex;align-items:center;justify-content:center;gap:4px;padding:5px 9px;border:1.5px solid transparent;border-radius:var(--r-s);background:transparent;color:var(--tx-2);font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;transition:all var(--t);font-family:var(--font);user-select:none}
.dg-btn:hover{background:var(--bg-2);border-color:var(--bd);color:var(--tx-1)}
.dg-btn.act{background:var(--ac-bg);border-color:var(--ac);color:var(--ac)}
.dg-btn-save{background:var(--ac)!important;color:#fff!important;border-color:var(--ac)!important}
.dg-btn-save:hover{background:var(--ac-h,#c85a38)!important}
.dg-btn-save:disabled{opacity:.6;cursor:not-allowed}
.dg-zoom{font-size:11px;font-family:var(--mono);min-width:42px;text-align:center;color:var(--tx-3)}

/* trace bar */
#dg-trace{padding:5px 14px;background:var(--ac-bg);border-bottom:1px solid var(--ac-border);font-size:11px;color:var(--ac);display:flex;align-items:center;gap:10px;flex-shrink:0}
.dg-task-sel{font-size:11px;padding:3px 8px;border:1px solid var(--ac-border);border-radius:var(--r-s);background:var(--bg-1);color:var(--tx-2);outline:none;font-family:var(--font)}

/* canvas wrap — dot grid adapts to theme */
#dg-wrap{flex:1;position:relative;overflow:hidden;
  background-color:var(--bg-0);
  background-image:radial-gradient(circle,var(--bd-2,#c4bfb4) 1.2px,transparent 1.2px);
  background-size:24px 24px}
#dg-wrap canvas{display:block}

/* palette */
#dg-pal{position:absolute;left:10px;top:8px;bottom:36px;width:66px;z-index:20;background:var(--bg-1);border:1.5px solid var(--bd);border-radius:var(--r-l);padding:7px 4px;display:flex;flex-direction:column;gap:2px;overflow-y:auto;box-shadow:var(--sh-2)}
.dg-pi{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 2px;border-radius:var(--r-m);cursor:grab;border:1.5px solid transparent;transition:all var(--t);user-select:none}
.dg-pi:hover{background:var(--bg-2);border-color:var(--bd)}
.dg-pi.act{background:var(--ac-bg);border-color:var(--ac)}
.dg-pi-em{font-size:17px;line-height:1}
.dg-pi-lb{font-size:8px;font-weight:700;color:var(--tx-3);text-align:center;line-height:1.2}

/* context toolbar */
#dg-ctx{position:absolute;display:none;z-index:100;background:var(--bg-1);border:1.5px solid var(--bd);border-radius:var(--r-m);padding:5px 8px;gap:4px;align-items:center;box-shadow:var(--sh-3);flex-wrap:wrap}
#dg-ctx.vis{display:flex}
.dg-sw{width:17px;height:17px;border-radius:50%;border:2px solid transparent;cursor:pointer;flex-shrink:0;transition:transform .1s}
.dg-sw:hover{transform:scale(1.3);border-color:var(--tx-1)}
.dg-csep{width:1px;height:17px;background:var(--bd);margin:0 2px}
.dg-cb{padding:3px 7px;border-radius:var(--r-s);font-size:11px;font-weight:700;border:1.5px solid transparent;cursor:pointer;background:transparent;color:var(--tx-2);transition:all var(--t);font-family:var(--font)}
.dg-cb:hover{background:var(--bg-2);border-color:var(--bd)}
.dg-cb.red:hover{background:var(--red-bg);color:var(--red);border-color:var(--red)}

/* props panel */
#dg-props{position:absolute;right:10px;top:8px;width:194px;z-index:20;background:var(--bg-1);border:1.5px solid var(--bd);border-radius:var(--r-l);padding:13px;box-shadow:var(--sh-2);display:none;max-height:calc(100% - 56px);overflow-y:auto}
#dg-props.vis{display:block}
.dp-h{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--tx-3);margin-bottom:11px}
.dp-r{margin-bottom:9px}
.dp-l{display:block;font-size:10px;font-weight:700;color:var(--tx-3);margin-bottom:3px}
.dp-i{width:100%;padding:5px 8px;background:var(--bg-2);border:1.5px solid var(--bd);border-radius:var(--r-s);font-size:12px;color:var(--tx-1);font-family:var(--font);outline:none;box-sizing:border-box;transition:border-color var(--t)}
.dp-i:focus{border-color:var(--ac)}
.dp-chips{display:grid;grid-template-columns:repeat(8,1fr);gap:3px;margin-top:5px}
.dp-chip{width:17px;height:17px;border-radius:3px;cursor:pointer;border:2px solid transparent;transition:transform .1s}
.dp-chip:hover{transform:scale(1.25);border-color:var(--tx-1)}

/* status bar */
#dg-sb{display:flex;align-items:center;gap:7px;padding:3px 13px;background:var(--bg-1);border-top:1px solid var(--bd);font-size:11px;color:var(--tx-3);flex-shrink:0;font-family:var(--mono)}
.dg-stool{font-family:var(--font);font-weight:700;color:var(--tx-2);font-size:11px}
.dg-dot{width:6px;height:6px;border-radius:50%}
.dg-dot.saved{background:var(--green)}.dg-dot.dirty{background:var(--yellow)}.dg-dot.saving{background:var(--blue);animation:dg-p 1s infinite}
@keyframes dg-p{0%,100%{opacity:1}50%{opacity:.3}}
    `;
    document.head.appendChild(s);
  }

  // ── HTML ──────────────────────────────────────────────────
  function _buildHTML(pid) {
    const proj = (window.mockProjects||[]).find(p=>p.id===pid);
    const cards = (PFBoard?.cards?.length ? PFBoard.cards : (window.mockCards||[])).filter(c=>(c.project_id||c.sl)===pid);
    const taskOpts = cards.map(c=>`<option value="${c.id}">${(c.title||'').slice(0,36).replace(/</g,'&lt;')}</option>`).join('');
    const pals = Object.entries(SHAPES).map(([k,v])=>`<div class="dg-pi" draggable="true" data-type="${k}" title="${v.label}"><span class="dg-pi-em">${v.emoji}</span><span class="dg-pi-lb">${v.label}</span></div>`).join('');
    const swatches = QCOLORS.slice(0,8).map(c=>`<div class="dg-sw" style="background:${c}" data-fill="${c}"></div>`).join('');
    return `
<div id="dgv9-root">
<div id="dg-tb">
  <button class="dg-btn act" data-tool="select" title="Selecionar (V)"><svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M1 1l9 5.5-4 1.5-1.5 4z"/></svg>Sel.</button>
  <button class="dg-btn" data-tool="pan" title="Pan (H / Espaço)"><svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="6.5" cy="6.5" r="2"/><path d="M6.5 1v2M6.5 10v2M1 6.5h2M10 6.5h2"/></svg>Pan</button>
  <div class="dg-sep"></div>
  <button class="dg-btn" data-tool="rect"    title="Retângulo (R)"><svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="1" y="2" width="11" height="9" rx="2"/></svg></button>
  <button class="dg-btn" data-tool="ellipse" title="Elipse (E)"><svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="6.5" cy="6.5" rx="5.5" ry="4"/></svg></button>
  <button class="dg-btn" data-tool="diamond" title="Losango (D)"><svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polygon points="6.5,1 12,6.5 6.5,12 1,6.5"/></svg></button>
  <button class="dg-btn" data-tool="text"    title="Texto (T)"><svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 3h9M6.5 3v7M4.5 10h4"/></svg>T</button>
  <button class="dg-btn" data-tool="arrow"   title="Seta (A)"><svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="2" y1="11" x2="11" y2="2"/><path d="M11 2H7M11 2v4"/></svg></button>
  <button class="dg-btn" data-tool="line"    title="Linha (L)"><svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="2" y1="11" x2="11" y2="2"/></svg></button>
  <button class="dg-btn" data-tool="freedraw" title="Lápis (P)"><svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 11l2-2 5-5 2 2-5 5z"/></svg></button>
  <div class="dg-sep"></div>
  <button class="dg-btn" id="dg-undo" title="Desfazer Ctrl+Z"><svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 6a4 4 0 1 0 1-2.5L1 2v3.5h3.5"/></svg></button>
  <button class="dg-btn" id="dg-redo" title="Refazer Ctrl+Y"><svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M11 6a4 4 0 1 1-1-2.5L12 2v3.5H8.5"/></svg></button>
  <div class="dg-sep"></div>
  <button class="dg-btn" id="dg-del"    title="Apagar Del"><svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 4h9M5 4V3h3v1M4 4l.5 7h4L9 4"/></svg></button>
  <button class="dg-btn" id="dg-dup"    title="Duplicar Ctrl+D"><svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="4" y="4" width="7" height="7" rx="1.5"/><path d="M2 9V3a1 1 0 011-1h6"/></svg></button>
  <button class="dg-btn" id="dg-fit"    title="Fit 0"><svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M1 4V1h3M9 1h3v3M12 9v3H9M4 12H1V9"/></svg></button>
  <button class="dg-btn" id="dg-zout"   title="Zoom −">−</button>
  <span class="dg-zoom" id="dg-zl">100%</span>
  <button class="dg-btn" id="dg-zin"    title="Zoom +">+</button>
  <div class="dg-sep"></div>
  <button class="dg-btn" id="dg-layout" title="Auto-layout">⚡ Layout</button>
  <button class="dg-btn" id="dg-clear"  title="Limpar tudo">🧹</button>
  <div class="dg-sep"></div>
  <button class="dg-btn" id="dg-png"    title="PNG">↓ PNG</button>
  <button class="dg-btn" id="dg-svg"    title="SVG">↓ SVG</button>
  <div style="flex:1"></div>
  <div style="display:flex;align-items:center;gap:5px;font-size:11px;font-family:var(--mono);color:var(--tx-3)">
    <span class="dg-dot saved" id="dg-sd"></span>
    <span id="dg-sl">Salvo</span>
  </div>
  <div class="dg-sep"></div>
  <button class="dg-btn dg-btn-save" id="dg-save" title="Salvar Ctrl+S">
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round"><path d="M2 12h9a1 1 0 001-1V4l-3-3H3a1 1 0 00-1 1v9a1 1 0 001 1z"/><path d="M8 1v3H4V1M6.5 7v4"/></svg>
    Salvar
  </button>
</div>

<div id="dg-trace">
  <span>🔗 <strong id="dg-pname">${(proj?.name||pid||'—').replace(/</g,'&lt;')}</strong></span>
  <select class="dg-task-sel" id="dg-tasksel" onchange="DiagramEngineV9.setLinkedTask(this.value)">
    <option value="">— Vincular a tarefa —</option>${taskOpts}
  </select>
  <div style="flex:1"></div>
  <button class="dg-btn" style="padding:3px 9px;font-size:11px" onclick="DiagramEngineV9.generateFromProject()">⚡ Gerar do Projeto</button>
</div>

<div id="dg-pal">${pals}</div>

<div id="dg-ctx">
  <span style="font-size:9px;font-weight:800;color:var(--tx-3)">COR</span>
  ${swatches}
  <div class="dg-csep"></div>
  <input type="color" id="dg-cc" style="width:20px;height:20px;border:none;cursor:pointer;padding:0;border-radius:3px;background:transparent">
  <div class="dg-csep"></div>
  <button class="dg-cb" id="dg-cb-b" title="Negrito"><b>B</b></button>
  <button class="dg-cb" id="dg-cb-i" title="Itálico"><i>I</i></button>
  <div class="dg-csep"></div>
  <button class="dg-cb" id="dg-cb-up"   title="Frente">↑</button>
  <button class="dg-cb" id="dg-cb-dn"   title="Atrás">↓</button>
  <div class="dg-csep"></div>
  <button class="dg-cb red" id="dg-cb-del">🗑</button>
</div>

<div id="dg-props">
  <div class="dp-h">✏️ Propriedades</div>
  <div id="dg-pb"><p style="font-size:11px;color:var(--tx-3)">Selecione um elemento</p></div>
</div>

<div id="dg-wrap"><canvas id="dgv9-canvas"></canvas></div>

<div id="dg-sb">
  <span class="dg-stool" id="dg-st">🖱 Selecionar</span>
  <span>·</span><span id="dg-ss">0 objetos</span>
  <div style="flex:1"></div>
  <span style="opacity:.5;font-size:10px">V H R E D T A L P · Del · Ctrl+Z/S/D/A</span>
</div>
</div>`;
  }

  // ── Canvas init ───────────────────────────────────────────
  function _initCanvas() {
    const wrap = document.getElementById('dg-wrap'); if (!wrap) return;
    // Force layout before reading clientWidth/Height to avoid 0x0 canvas
    wrap.style.minHeight = '200px';
    _canvas = new fabric.Canvas('dgv9-canvas', {
      width: wrap.clientWidth || 900,
      height: wrap.clientHeight || 560,
      selection: true, preserveObjectStacking: true,
      renderOnAddRemove: true,
      backgroundColor: _getCanvasBg(),
    });
    // Sync canvas background when theme toggles
    _themeObserver = new MutationObserver(() => {
      if (_canvas) {
        _canvas.setBackgroundColor(_getCanvasBg(), () => _canvas.requestRenderAll());
      }
    });
    _themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const _ro = new ResizeObserver((entries) => {
      if (!_canvas) return;
      const entry = entries[0];
      const w = entry.contentRect.width  || wrap.clientWidth  || 900;
      const h = entry.contentRect.height || wrap.clientHeight || 560;
      if (w > 50 && h > 50) {
        _canvas.setWidth(w);
        _canvas.setHeight(h);
        _canvas.setBackgroundColor(_getCanvasBg(), () => _canvas.requestRenderAll());
      }
    });
    _ro.observe(wrap);
    // Immediate sizing fix after first paint
    requestAnimationFrame(() => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (w > 50 && h > 50 && _canvas) {
        _canvas.setWidth(w); _canvas.setHeight(h);
        _canvas.requestRenderAll();
      }
    });

    _canvas.on('object:modified', _onMod);
    _canvas.on('object:added',    _onMod);
    _canvas.on('object:removed',  _onMod);
    _canvas.on('selection:created', _onSel);
    _canvas.on('selection:updated', _onSel);
    _canvas.on('selection:cleared', _onDesel);
    _canvas.on('mouse:wheel',    _onWheel);
    _canvas.on('mouse:down',     _onMD);
    _canvas.on('mouse:move',     _onMM);
    _canvas.on('mouse:up',       _onMU);
    _canvas.on('mouse:dblclick', _onDbl);
  }

  // ── Mouse ─────────────────────────────────────────────────
  function _onMD(opt) {
    const e=opt.e, pt=_canvas.getPointer(e);
    if (_tool==='pan'){_ps={on:true,lx:e.clientX,ly:e.clientY};_canvas.selection=false;return;}
    if (Object.keys(SHAPES).includes(_tool)){_ds={on:true,sx:pt.x,sy:pt.y,pre:null};_canvas.selection=false;return;}
    if (_tool==='arrow'||_tool==='line'){
      const ln=new fabric.Line([pt.x,pt.y,pt.x,pt.y],{stroke:_ink.stroke,strokeWidth:_ink.sw,selectable:false,evented:false,_pf_type:_tool});
      _canvas.add(ln);_as={on:true,ln};_canvas.selection=false;return;
    }
    if (_tool==='freedraw'){_fd={on:true,pts:[{x:pt.x,y:pt.y}],pre:null};_canvas.selection=false;return;}
    if (_tool==='text'){_addText(pt.x,pt.y);setTool('select');}
  }

  function _onMM(opt) {
    const e=opt.e, pt=_canvas.getPointer(e);
    if (_tool==='pan'&&_ps.on){const vpt=_canvas.viewportTransform;vpt[4]+=e.clientX-_ps.lx;vpt[5]+=e.clientY-_ps.ly;_canvas.requestRenderAll();_ps.lx=e.clientX;_ps.ly=e.clientY;return;}
    if (_ds.on){
      if(_ds.pre)_canvas.remove(_ds.pre);
      const w=pt.x-_ds.sx,h=pt.y-_ds.sy;if(Math.abs(w)<4&&Math.abs(h)<4)return;
      const p=_mkShape(_tool,_ds.sx,_ds.sy,w,h,true);
      if(p){p.set({opacity:.5,selectable:false,evented:false});_canvas.add(p);_canvas.requestRenderAll();_ds.pre=p;}
      return;
    }
    if (_as.on&&_as.ln){_as.ln.set({x2:pt.x,y2:pt.y});_canvas.requestRenderAll();return;}
    if (_fd.on){
      _fd.pts.push({x:pt.x,y:pt.y});
      if(_fd.pre)_canvas.remove(_fd.pre);
      const pts=_fd.pts;if(pts.length<2)return;
      _fd.pre=new fabric.Path('M '+pts.map(p=>`${p.x} ${p.y}`).join(' L '),{stroke:_ink.stroke,strokeWidth:_ink.sw+.5,fill:'transparent',selectable:false,evented:false,strokeLineCap:'round',strokeLineJoin:'round'});
      _canvas.add(_fd.pre);_canvas.requestRenderAll();
    }
  }

  function _onMU(opt) {
    const e=opt.e, pt=_canvas.getPointer(e);
    if (_tool==='pan'){_ps.on=false;_canvas.selection=true;return;}
    if (_ds.on){
      if(_ds.pre)_canvas.remove(_ds.pre);_ds.on=false;
      const w=pt.x-_ds.sx,h=pt.y-_ds.sy;
      const fw=Math.abs(w)<8?160:w, fh=Math.abs(h)<8?80:h;
      const obj=_mkShape(_tool,_ds.sx,_ds.sy,fw,fh,false);
      if(obj){obj._pf_type=_tool;obj._pf_node=true;obj._pf_label=(SHAPES[_tool]||{label:'?'}).label;obj.id='n'+Date.now();_canvas.add(obj);_canvas.setActiveObject(obj);_canvas.requestRenderAll();_push();_markDirty();}
      _canvas.selection=true;setTool('select');return;
    }
    if (_as.on&&_as.ln){
      const ln=_as.ln;_as={on:false,ln:null};
      const dx=ln.x2-ln.x1,dy=ln.y2-ln.y1;
      if(Math.sqrt(dx*dx+dy*dy)<10){_canvas.remove(ln);_canvas.selection=true;return;}
      ln.set({selectable:true,evented:true});
      if(_tool==='arrow'){
        const ang=Math.atan2(dy,dx)*180/Math.PI;
        const hd=new fabric.Triangle({left:ln.x2,top:ln.y2,originX:'center',originY:'center',width:13,height:13,fill:_ink.stroke,angle:ang+90,selectable:false,evented:false});
        const grp=new fabric.Group([ln,hd],{selectable:true,_pf_type:'arrow'});
        _canvas.remove(ln);_canvas.add(grp);_canvas.setActiveObject(grp);
      }else{_canvas.setActiveObject(ln);}
      _canvas.selection=true;_canvas.requestRenderAll();_push();_markDirty();setTool('select');return;
    }
    if (_fd.on){
      _fd.on=false;if(_fd.pre)_canvas.remove(_fd.pre);
      const pts=_fd.pts;
      if(pts.length>4){
        let d=`M ${pts[0].x} ${pts[0].y}`;
        for(let i=1;i<pts.length-1;i++){const mx=(pts[i].x+pts[i+1].x)/2,my=(pts[i].y+pts[i+1].y)/2;d+=` Q ${pts[i].x} ${pts[i].y} ${mx} ${my}`;}
        d+=` L ${pts[pts.length-1].x} ${pts[pts.length-1].y}`;
        const sp=new fabric.Path(d,{stroke:_ink.stroke,strokeWidth:_ink.sw+.5,fill:'transparent',strokeLineCap:'round',strokeLineJoin:'round',selectable:true,_pf_type:'freedraw'});
        sp.id='fd'+Date.now();_canvas.add(sp);_canvas.setActiveObject(sp);
      }
      _fd={on:false,pts:[],pre:null};_canvas.selection=true;_canvas.requestRenderAll();_push();_markDirty();
    }
  }

  function _onDbl(opt){
    const obj=opt.target;if(!obj)return;
    if(obj._pf_node||obj.type==='group')_promptRename(obj);
    else if(obj.type==='i-text')obj.enterEditing?.();
  }

  // ── Shape factory — proportions fixed ─────────────────────
  function _mkShape(type,sx,sy,w,h,isPreview){
    // Normalise origin so shapes always draw top-left
    const ax=w<0?sx+w:sx, ay=h<0?sy+h:sy;
    const aw=Math.max(Math.abs(w),8), ah=Math.max(Math.abs(h),8);
    const cfg=SHAPES[type]||SHAPES.rect;
    const fill=cfg.fill, stroke=cfg.stroke, textC=cfg.text;
    const shadow=isPreview?null:new fabric.Shadow({color:'rgba(0,0,0,0.1)',blur:8,offsetX:2,offsetY:3});
    // ── Chave do fix: filhos do Group usam coordenadas LOCAIS (0,0 = top-left do grupo)
    // O próprio Group recebe left:ax, top:ay para posicionar no canvas.
    // Se passarmos left:ax,top:ay nos filhos E no Group, o Fabric duplica o offset.
    const localBase={left:0,top:0,fill,stroke,strokeWidth:2};

    let shape;
    if(type==='ellipse'||type==='actor'||type==='term'){
      // Ellipse em coordenadas locais: left:0, top:0, rx/ry = metade da dimensão
      shape=new fabric.Ellipse({...localBase,rx:aw/2,ry:ah/2,originX:'left',originY:'top',width:aw,height:ah});
    }else if(type==='diamond'){
      // Polygon: pontos relativos (0,0) = canto superior-esquerdo do bounding box
      shape=new fabric.Polygon([{x:aw/2,y:0},{x:aw,y:ah/2},{x:aw/2,y:ah},{x:0,y:ah/2}],{...localBase});
    }else if(type==='db'){
      // Cylinder: três partes em coordenadas locais
      const ry=Math.max(12,Math.round(ah*0.18));
      const body=new fabric.Rect({left:0,top:ry,         width:aw,height:ah-ry,fill,stroke,strokeWidth:2});
      const te  =new fabric.Ellipse({left:0,top:0,        rx:aw/2,ry,fill,stroke,strokeWidth:2,originX:'left',originY:'top',width:aw,height:ry*2});
      const be  =new fabric.Ellipse({left:0,top:ah-ry,    rx:aw/2,ry,fill,stroke,strokeWidth:2,originX:'left',originY:'top',width:aw,height:ry*2});
      const grp =new fabric.Group([body,te,be],{
        left:ax,top:ay,fill:'transparent',shadow,
        _pf_type:'db',_pf_node:true,_pf_label:'Banco',
      });
      return grp;
    }else{
      const rx=cfg.rx||8;
      shape=new fabric.Rect({...localBase,width:aw,height:ah,rx,ry:rx});
    }

    if(!isPreview&&shape){
      // fontSize proporcional ao tamanho da forma
      const fontSize=Math.max(10,Math.min(18,Math.round(Math.min(aw,ah)*0.22)));
      // Label em coordenadas locais: centro geométrico da caixa
      const label=new fabric.IText(cfg.label,{
        left:aw/2, top:ah/2,
        originX:'center', originY:'center',
        fontSize, fontFamily:'system-ui,sans-serif', fontWeight:'700',
        fill:textC, editable:true, textAlign:'center',
        width:aw-20, splitByGrapheme:false,
      });
      // Group posicionado em (ax,ay) no canvas — filhos já em coordenadas locais
      const grp=new fabric.Group([shape,label],{
        left:ax, top:ay,
        fill:'transparent',
        subTargetCheck:false,
        shadow,
        _pf_type:type, _pf_label:cfg.label, _pf_node:true,
      });
      return grp;
    }
    return shape;
  }

  // ── Text tool ─────────────────────────────────────────────
  function _addText(x,y){
    if(!_canvas)return;
    const t=new fabric.IText('Texto',{left:x||200,top:y||200,fontSize:_ink.fs,fontFamily:'system-ui,sans-serif',fontWeight:'700',fill:_ink.stroke,editable:true,_pf_type:'text'});
    t.id='t'+Date.now();_canvas.add(t);_canvas.setActiveObject(t);t.enterEditing();t.selectAll();_canvas.requestRenderAll();_push();
  }

  async function _promptRename(obj){
    const cur=obj._pf_label||'';
    const lbl=await PFModal.prompt({title:'Editar texto',label:'Conteúdo',value:cur});
    if(lbl===null)return;
    obj._pf_label=lbl;
    const ti=obj.getObjects?.('i-text')?.[0];
    if(ti){ti.set('text',lbl);_canvas.requestRenderAll();}
    else if(obj.type==='i-text'){obj.set('text',lbl);_canvas.requestRenderAll();}
    _push();_markDirty();
  }

  // ── Tool ──────────────────────────────────────────────────
  const TOOL_N={select:'🖱 Selecionar',pan:'✋ Pan',rect:'⬜ Rect',ellipse:'⭕ Elipse',diamond:'💠 Losango',process:'🔲 Processo',db:'🗃 Banco',cloud:'☁ Serviço',actor:'👤 Ator',note:'📝 Nota',term:'🔴 Início/Fim',text:'T Texto',arrow:'➡ Seta',line:'╱ Linha',freedraw:'✏ Lápis'};

  function setTool(t){
    _tool=t;
    const isPan=t==='pan', isDraw=!['select','pan'].includes(t);
    _canvas.selection=!isDraw;
    _canvas.defaultCursor=isPan?'grab':isDraw?'crosshair':'default';
    _canvas.hoverCursor  =isPan?'grab':isDraw?'crosshair':'move';
    document.querySelectorAll('.dg-btn[data-tool]').forEach(b=>b.classList.remove('act'));
    document.querySelector(`.dg-btn[data-tool="${t}"]`)?.classList.add('act');
    document.querySelectorAll('.dg-pi').forEach(p=>p.classList.remove('act'));
    document.querySelector(`.dg-pi[data-type="${t}"]`)?.classList.add('act');
    const el=document.getElementById('dg-st');if(el)el.textContent=TOOL_N[t]||t;
  }

  // ── Selection events ──────────────────────────────────────
  function _onSel(e){const obj=e.selected?.[0]||_canvas.getActiveObject();if(!obj)return;_showCtx(obj);_showProps(obj);_updateStat();}
  function _onDesel(){document.getElementById('dg-ctx')?.classList.remove('vis');document.getElementById('dg-props')?.classList.remove('vis');_updateStat();}
  function _onMod(){if(!_canvas||_canvas._pf_loading)return;}
  function _onWheel(opt){
    opt.e.preventDefault();
    let z=_canvas.getZoom()*(opt.e.deltaY>0?0.92:1.09);
    z=Math.max(0.05,Math.min(10,z));
    _canvas.zoomToPoint({x:opt.e.offsetX,y:opt.e.offsetY},z);
    _zlbl(z);
  }

  // ── Context toolbar ───────────────────────────────────────
  function _showCtx(obj){
    const ctx=document.getElementById('dg-ctx');if(!ctx)return;
    const br=obj.getBoundingRect(true,true);
    const wrap=document.getElementById('dg-wrap');if(!wrap)return;
    const wr=wrap.getBoundingClientRect(),rr=document.getElementById('dgv9-root').getBoundingClientRect();
    const vpt=_canvas.viewportTransform;
    ctx.style.left=Math.max(0,(wr.left-rr.left)+(br.left+vpt[4]))+'px';
    ctx.style.top =Math.max(0,(wr.top-rr.top) +(br.top +vpt[5])-52)+'px';
    ctx.classList.add('vis');
  }

  // ── Properties panel ──────────────────────────────────────
  function _showProps(obj){
    const panel=document.getElementById('dg-props'),body=document.getElementById('dg-pb');
    if(!panel||!body)return;panel.classList.add('vis');
    const isLine=obj._pf_type==='line'||obj._pf_type==='arrow'||obj._pf_type==='freedraw';
    const fill=_gp(obj,'fill')||'#fff9db',stroke=_gp(obj,'stroke')||'#5c5c58';
    const strokeW=_gp(obj,'strokeWidth')||2;
    const label=obj._pf_label||(obj.type==='i-text'?obj.text:'')||'';
    const txtObj=_gtxt(obj);const fontSize=txtObj?.fontSize||obj.fontSize||15;
    const opacity=Math.round((obj.opacity??1)*100);
    body.innerHTML=`
      <div class="dp-r"><label class="dp-l">Texto</label><input class="dp-i" id="dp-lbl" value="${String(label).replace(/"/g,'&quot;')}"></div>
      ${!isLine?`<div class="dp-r"><label class="dp-l">Cor de fundo</label>
        <div style="display:flex;gap:5px;margin-bottom:4px"><input type="color" class="dp-i" id="dp-fill" value="${_hex(fill)}" style="width:36px;height:26px;padding:2px"><input class="dp-i" id="dp-fillt" value="${_hex(fill)}" style="flex:1"></div>
        <div class="dp-chips">${QCOLORS.map(c=>`<div class="dp-chip" style="background:${c}" data-qf="${c}"></div>`).join('')}</div></div>`:''}
      <div class="dp-r"><label class="dp-l">${isLine?'Cor da linha':'Borda'}</label><input type="color" class="dp-i" id="dp-str" value="${_hex(stroke)}" style="width:36px;height:26px;padding:2px"></div>
      <div class="dp-r"><label class="dp-l">Espessura</label><input type="range" min="0" max="12" step=".5" value="${strokeW}" id="dp-sw" style="width:100%"><span id="dp-swl" style="font-size:10px;color:var(--tx-3)">${strokeW}px</span></div>
      <div class="dp-r"><label class="dp-l">Tamanho texto</label><input type="range" min="8" max="60" value="${fontSize}" id="dp-fs" style="width:100%"><span id="dp-fsl" style="font-size:10px;color:var(--tx-3)">${fontSize}px</span></div>
      <div class="dp-r"><label class="dp-l">Opacidade</label><input type="range" min="10" max="100" value="${opacity}" id="dp-op" style="width:100%"><span id="dp-opl" style="font-size:10px;color:var(--tx-3)">${opacity}%</span></div>
      <button style="width:100%;padding:7px;margin-top:4px;background:var(--red-bg);color:var(--red);border:1px solid var(--red-bg);border-radius:var(--r-s);font-size:12px;cursor:pointer;font-family:var(--font);font-weight:700" onclick="DiagramEngineV9.deleteSelected()">🗑 Apagar</button>`;

    const bindI=(id,fn)=>{const el=document.getElementById(id);if(el)el.addEventListener('input',fn);};
    const act=()=>_canvas.getActiveObject();
    bindI('dp-lbl',e=>{const o=act();if(!o)return;o._pf_label=e.target.value;const t=_gtxt(o);if(t){t.set('text',e.target.value);_canvas.requestRenderAll();}else if(o.type==='i-text'){o.set('text',e.target.value);_canvas.requestRenderAll();}_markDirty();});
    bindI('dp-fill',e=>{const o=act();if(!o)return;_sp(o,'fill',e.target.value);_canvas.requestRenderAll();const t=document.getElementById('dp-fillt');if(t)t.value=e.target.value;_ink.fill=e.target.value;_markDirty();});
    bindI('dp-fillt',e=>{const v=e.target.value;if(!/^#[0-9a-fA-F]{6}$/.test(v))return;const o=act();if(!o)return;_sp(o,'fill',v);_canvas.requestRenderAll();const t=document.getElementById('dp-fill');if(t)t.value=v;_ink.fill=v;_markDirty();});
    bindI('dp-str',e=>{const o=act();if(!o)return;_sp(o,'stroke',e.target.value);_canvas.requestRenderAll();_ink.stroke=e.target.value;_markDirty();});
    bindI('dp-sw',e=>{const o=act();if(!o)return;const v=parseFloat(e.target.value);_sp(o,'strokeWidth',v);_canvas.requestRenderAll();const l=document.getElementById('dp-swl');if(l)l.textContent=v+'px';_markDirty();});
    bindI('dp-fs',e=>{const o=act();if(!o)return;const v=parseInt(e.target.value);const t=_gtxt(o);if(t){t.set('fontSize',v);_canvas.requestRenderAll();}else if(o.type==='i-text'){o.set('fontSize',v);_canvas.requestRenderAll();}const l=document.getElementById('dp-fsl');if(l)l.textContent=v+'px';_ink.fs=v;_markDirty();});
    bindI('dp-op',e=>{const o=act();if(!o)return;o.set('opacity',parseInt(e.target.value)/100);_canvas.requestRenderAll();const l=document.getElementById('dp-opl');if(l)l.textContent=e.target.value+'%';_markDirty();});
    body.querySelectorAll('[data-qf]').forEach(chip=>chip.addEventListener('click',()=>{const o=act();if(!o)return;_sp(o,'fill',chip.dataset.qf);_canvas.requestRenderAll();const fi=document.getElementById('dp-fill');if(fi)fi.value=_hex(chip.dataset.qf);const ft=document.getElementById('dp-fillt');if(ft)ft.value=_hex(chip.dataset.qf);_ink.fill=chip.dataset.qf;_markDirty();}));
  }

  function _gtxt(o){return o.getObjects?.('i-text')?.[0]||o.getObjects?.('text')?.[0]||null;}
  function _gp(o,p){if(o[p]!==undefined&&o[p]!==null&&typeof o[p]!=='object')return o[p];const items=o.getObjects?.()??[];for(const c of items){if(c[p]&&c.type!=='i-text'&&c.type!=='text')return c[p];}return null;}
  function _sp(o,p,v){const items=(o.getObjects?.()??[]).filter(c=>c.type!=='i-text'&&c.type!=='text');if(items.length)items.forEach(c=>c.set(p,v));else o.set(p,v);}
  function _hex(c){if(!c||typeof c!=='string')return'#5c5c58';if(c.startsWith('#')&&c.length>=7)return c.slice(0,7);if(c.startsWith('rgb')){const m=c.match(/\d+/g);if(m&&m.length>=3)return'#'+m.slice(0,3).map(n=>parseInt(n).toString(16).padStart(2,'0')).join('');}return'#5c5c58';}

  // ── Toolbar bindings ──────────────────────────────────────
  function _bindTB(){
    document.querySelectorAll('.dg-btn[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
    const on=(id,fn)=>document.getElementById(id)?.addEventListener('click',fn);
    on('dg-undo',undo);on('dg-redo',redo);on('dg-del',deleteSelected);on('dg-dup',duplicateSelected);
    on('dg-fit',fitView);on('dg-zin',()=>_zoom(1.2));on('dg-zout',()=>_zoom(0.8));
    on('dg-layout',autoLayout);on('dg-clear',clearAll);on('dg-png',exportPNG);on('dg-svg',exportSVG);
    on('dg-save',()=>save());
    // context bar
    document.querySelectorAll('.dg-sw').forEach(sw=>sw.addEventListener('click',()=>{const o=_canvas.getActiveObject();if(!o)return;_sp(o,'fill',sw.dataset.fill);_canvas.requestRenderAll();_ink.fill=sw.dataset.fill;_markDirty();}));
    document.getElementById('dg-cc')?.addEventListener('input',e=>{const o=_canvas.getActiveObject();if(!o)return;_sp(o,'fill',e.target.value);_canvas.requestRenderAll();_ink.fill=e.target.value;_markDirty();});
    on('dg-cb-b',()=>{const o=_canvas.getActiveObject();if(!o)return;const t=_gtxt(o)||(o.type==='i-text'?o:null);if(!t)return;t.set('fontWeight',t.fontWeight==='bold'?'normal':'bold');_canvas.requestRenderAll();_markDirty();});
    on('dg-cb-i',()=>{const o=_canvas.getActiveObject();if(!o)return;const t=_gtxt(o)||(o.type==='i-text'?o:null);if(!t)return;t.set('fontStyle',t.fontStyle==='italic'?'normal':'italic');_canvas.requestRenderAll();_markDirty();});
    on('dg-cb-up',()=>{const o=_canvas.getActiveObject();if(o){_canvas.bringToFront(o);_canvas.requestRenderAll();}});
    on('dg-cb-dn',()=>{const o=_canvas.getActiveObject();if(o){_canvas.sendToBack(o);_canvas.requestRenderAll();}});
    on('dg-cb-del',deleteSelected);
  }

  // ── Palette drag & click ──────────────────────────────────
  function _bindPal(){
    const pal=document.getElementById('dg-pal');if(!pal)return;
    let _dt=null;
    pal.querySelectorAll('.dg-pi').forEach(item=>{
      item.addEventListener('dragstart',e=>{_dt=item.dataset.type;e.dataTransfer.effectAllowed='copy';});
      item.addEventListener('click',()=>{pal.querySelectorAll('.dg-pi').forEach(p=>p.classList.remove('act'));item.classList.add('act');setTool(item.dataset.type);});
    });
    const wrap=document.getElementById('dg-wrap');if(!wrap)return;
    wrap.addEventListener('dragover',e=>e.preventDefault());
    wrap.addEventListener('drop',e=>{
      e.preventDefault();if(!_dt)return;
      const r=wrap.getBoundingClientRect();
      const vpt=_canvas.viewportTransform||[1,0,0,1,0,0];
      const z=_canvas.getZoom()||1;
      // Correct coordinate: canvas-space = (screen - canvasOrigin - panOffset) / zoom
      const cx=(e.clientX-r.left-vpt[4])/z;
      const cy=(e.clientY-r.top -vpt[5])/z;
      addNode(_dt,cx-85,cy-40);_dt=null; // centre node on cursor
    });
  }

  // ── Keyboard ──────────────────────────────────────────────
  function _bindKB(){
    if(_kbBound)return;_kbBound=true;
    document.addEventListener('keydown',e=>{
      if(!_canvas)return;
      if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
      if(_canvas._activeObject?.isEditing)return;
      if(e.code==='Space'){e.preventDefault();setTool('pan');return;}
      if(!e.ctrlKey&&!e.metaKey){
        switch(e.key){
          case'v':case'V':setTool('select');break;case'h':case'H':setTool('pan');break;
          case'r':case'R':setTool('rect');break;case'e':case'E':setTool('ellipse');break;
          case'd':case'D':setTool('diamond');break;case't':case'T':setTool('text');break;
          case'a':case'A':setTool('arrow');break;case'l':case'L':setTool('line');break;
          case'p':case'P':setTool('freedraw');break;
          case'0':fitView();break;case'+':case'=':_zoom(1.2);break;case'-':_zoom(0.8);break;
          case'Escape':setTool('select');_canvas.discardActiveObject();_canvas.requestRenderAll();break;
          case'Delete':case'Backspace':if(_canvas.getActiveObjects().length){e.preventDefault();deleteSelected();}break;
        }
      }else{
        switch(e.key){
          case'z':e.preventDefault();undo();break;case'y':e.preventDefault();redo();break;
          case's':e.preventDefault();save();break;case'd':e.preventDefault();duplicateSelected();break;
          case'a':e.preventDefault();
            const obs=_realObjs();if(obs.length){_canvas.setActiveObject(new fabric.ActiveSelection(obs,{canvas:_canvas}));_canvas.requestRenderAll();}break;
        }
      }
    });
    document.addEventListener('keyup',e=>{if(e.code==='Space'&&_tool==='pan')setTool('select');});
  }

  // ── Zoom ──────────────────────────────────────────────────
  function _zoom(f){const z=Math.max(0.05,Math.min(10,_canvas.getZoom()*f));_canvas.zoomToPoint({x:_canvas.width/2,y:_canvas.height/2},z);_zlbl(z);}
  function _zlbl(z){const el=document.getElementById('dg-zl');if(el)el.textContent=Math.round((z||_canvas?.getZoom()||1)*100)+'%';}

  function fitView(){
    if(!_canvas)return;
    const objs=_realObjs();
    if(!objs.length){_canvas.setViewportTransform([1,0,0,1,0,0]);_zlbl(1);return;}
    let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
    objs.forEach(o=>{const b=o.getBoundingRect(true,true);x1=Math.min(x1,b.left);y1=Math.min(y1,b.top);x2=Math.max(x2,b.left+b.width);y2=Math.max(y2,b.top+b.height);});
    const pad=64,bw=x2-x1+pad*2,bh=y2-y1+pad*2;
    const z=Math.min(10,Math.max(0.05,Math.min(_canvas.width/bw,_canvas.height/bh)*0.92));
    _canvas.setViewportTransform([z,0,0,z,(_canvas.width-bw*z)/2-x1*z+pad*z,(_canvas.height-bh*z)/2-y1*z+pad*z]);
    _zlbl(z);
  }

  // ── Operations ────────────────────────────────────────────
  function addNode(type,x,y){
    if(!_canvas)return;
    const cfg=SHAPES[type]||SHAPES.rect;
    const snap=v=>Math.round(v/16)*16;
    const obj=_mkShape(type,snap(x??(_canvas.width/2-80)),snap(y??(_canvas.height/2-40)),170,80,false);
    if(!obj)return;
    obj._pf_type=type;obj._pf_node=true;obj._pf_label=cfg.label;obj.id='n'+Date.now();
    _canvas.add(obj);_canvas.setActiveObject(obj);_canvas.requestRenderAll();_push();_markDirty();
  }

  function deleteSelected(){
    const objs=_canvas?.getActiveObjects();if(!objs?.length)return;
    objs.forEach(o=>_canvas.remove(o));_canvas.discardActiveObject();_canvas.requestRenderAll();
    _push();_markDirty();
    document.getElementById('dg-ctx')?.classList.remove('vis');
    document.getElementById('dg-props')?.classList.remove('vis');
  }

  function duplicateSelected(){
    const obj=_canvas.getActiveObject();if(!obj)return;
    obj.clone(c=>{Object.assign(c,{left:obj.left+24,top:obj.top+24,_pf_type:obj._pf_type,_pf_node:obj._pf_node,_pf_label:obj._pf_label});c.id='n'+Date.now();_canvas.add(c);_canvas.setActiveObject(c);_canvas.requestRenderAll();_push();_markDirty();});
  }

  function selectAll(){const obs=_realObjs();if(!obs.length)return;_canvas.setActiveObject(new fabric.ActiveSelection(obs,{canvas:_canvas}));_canvas.requestRenderAll();}

  function clearAll(){
    if(!confirm('Limpar todo o diagrama?'))return;
    _realObjs().forEach(o=>_canvas.remove(o));_canvas.requestRenderAll();_push();_markDirty();showToast('Diagrama limpo');
  }

  function autoLayout(){
    const nodes=_realObjs().filter(o=>o._pf_node);
    if(!nodes.length){showToast('Sem elementos para organizar',true);return;}
    const COLS=Math.ceil(Math.sqrt(nodes.length)),W=200,H=110,PAD=44;
    nodes.forEach((n,i)=>{n.set({left:PAD+(i%COLS)*(W+PAD),top:PAD+Math.floor(i/COLS)*(H+PAD)});n.setCoords();});
    _canvas.requestRenderAll();_push();_markDirty();fitView();showToast('Layout aplicado');
  }

  function _realObjs(){return(_canvas?.getObjects()||[]).filter(o=>!o.excludeFromExport&&o.id!=='__grid__');}
  function _updateStat(){const tot=_realObjs().length,sel=_canvas?.getActiveObjects()?.length||0;const el=document.getElementById('dg-ss');if(el)el.textContent=sel?`${sel} selecionado${sel!==1?'s':''}`:`${tot} objeto${tot!==1?'s':''}`;}

  // ── History ───────────────────────────────────────────────
  function _push(){
    if(!_canvas||_canvas._pf_loading)return;
    const snap=JSON.stringify(_canvas.toJSON(['id','_pf_type','_pf_label','_pf_node']));
    _hist=_hist.slice(0,_histIdx+1);_hist.push(snap);if(_hist.length>MAXHIST)_hist.shift();_histIdx=_hist.length-1;
  }
  function undo(){if(_histIdx<=0){showToast('Nada para desfazer');return;}_histIdx--;_restoreSnap(_hist[_histIdx]);}
  function redo(){if(_histIdx>=_hist.length-1){showToast('Nada para refazer');return;}_histIdx++;_restoreSnap(_hist[_histIdx]);}
  function _restoreSnap(snap){_canvas._pf_loading=true;_canvas.loadFromJSON(snap,()=>{_canvas._pf_loading=false;_canvas.requestRenderAll();_updateStat();});}

  // ── Save/Load ─────────────────────────────────────────────
  function _markDirty(){_dirty=true;_sv('dirty');clearTimeout(_saveTimer);_saveTimer=setTimeout(()=>{if(_dirty)save(true);},2200);}
  function _sv(s){const d=document.getElementById('dg-sd'),l=document.getElementById('dg-sl');if(d)d.className='dg-dot '+s;if(l)l.textContent={saved:'Salvo',dirty:'Não salvo',saving:'Salvando…'}[s]||s;}

  async function save(silent=false){
    if(!_pid){showToast('Selecione um projeto',true);return;}
    if(!_canvas)return;
    const btn=document.getElementById('dg-save');if(btn)btn.disabled=true;
    _sv('saving');
    try{
      const data={canvas:_canvas.toJSON(['id','_pf_type','_pf_label','_pf_node']),zoom:_canvas.getZoom(),vt:_canvas.viewportTransform,pid:_pid,taskId:_taskId,savedAt:new Date().toISOString()};
      try{localStorage.setItem('pf_dg_v10_'+_pid,JSON.stringify(data));}catch(e){}
      if(window.PF?.supabase&&!window.PF?.demoMode){
        const{data:ex}=await PF.supabase.from('project_diagrams').select('id').eq('project_id',_pid).eq('is_current',true).limit(1);
        const payload={content_json:data,updated_at:new Date().toISOString()};
        if(ex?.length){const{error}=await PF.supabase.from('project_diagrams').update(payload).eq('id',ex[0].id);if(error)throw error;}
        else{const{error}=await PF.supabase.from('project_diagrams').insert({project_id:_pid,task_id:_taskId||null,name:'Diagrama Principal',is_current:true,content_json:data,generated_from:'manual',created_by:PF.user?.id||null});if(error)throw error;}
      }
      _dirty=false;_sv('saved');if(!silent)showToast('Diagrama salvo ✓','ok');
    }catch(err){
      _sv('dirty');
      if(err?.message?.includes('Failed to fetch')||err?.message?.includes('ERR_NAME')){_dirty=false;_sv('saved');if(!silent)showToast('Salvo localmente (Supabase offline)');}
      else if(!silent)showToast('Erro ao salvar: '+(err?.message||err),true);
    }finally{if(btn)btn.disabled=false;}
  }

  async function _loadFromStorage(){
    let data=null;
    if(window.PF?.supabase&&!window.PF?.demoMode&&_pid){
      try{const{data:rows}=await PF.supabase.from('project_diagrams').select('content_json').eq('project_id',_pid).eq('is_current',true).limit(1);if(rows?.[0]?.content_json)data=rows[0].content_json;}catch(e){console.warn('[Dg] Supabase offline');}
    }
    if(!data){try{data=JSON.parse(localStorage.getItem('pf_dg_v10_'+_pid)||'null')||JSON.parse(localStorage.getItem('pf_dg_v9_'+_pid)||'null');}catch(e){}}
    if(!data?.canvas)return;
    _canvas._pf_loading=true;
    _canvas.loadFromJSON(data.canvas,()=>{
      _canvas._pf_loading=false;
      if(data.zoom)_canvas.setZoom(data.zoom);
      if(data.vt)_canvas.viewportTransform=[...data.vt];
      _canvas.requestRenderAll();_updateStat();
      _hist=[JSON.stringify(data.canvas)];_histIdx=0;_dirty=false;_sv('saved');
    });
  }

  function exportPNG(){if(!_canvas)return;const url=_canvas.toDataURL({format:'png',quality:1,multiplier:2});Object.assign(document.createElement('a'),{href:url,download:`diagrama-${_pid||'pf'}.png`}).click();showToast('PNG exportado!');}
  function exportSVG(){if(!_canvas)return;const svg=_canvas.toSVG();const blob=new Blob([svg],{type:'image/svg+xml'});Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:`diagrama-${_pid||'pf'}.svg`}).click();showToast('SVG exportado!');}

  function generateFromProject(pid){
    const tp=pid||_pid||PF.currentProject;if(!tp)return;
    const BPMN_SHAPE={esbocar:'note',viabilizar:'note',atribuir:'process',executar:'rect',avaliar:'diamond',corrigir:'diamond',validar_cliente:'actor',concluido:'term'};
    const ORDER=['esbocar','viabilizar','atribuir','executar','avaliar','corrigir','validar_cliente','concluido'];
    const cards=(PFBoard?.cards?.length?PFBoard.cards:(window.mockCards||[])).filter(c=>(c.project_id||c.sl)===tp);
    if(!cards.length){showToast('Sem tarefas para este projeto',true);return;}
    _realObjs().forEach(o=>_canvas.remove(o));
    const byB={};cards.forEach(c=>{const b=c.bpmn||c.bpmn_status||'esbocar';(byB[b]=byB[b]||[]).push(c);});
    let xi=80;
    ORDER.forEach(b=>{const g=byB[b];if(!g?.length)return;let yi=80;
      g.forEach(c=>{const type=BPMN_SHAPE[b]||'rect';const cfg=SHAPES[type];const title=(c.title||'').slice(0,22)+((c.title||'').length>22?'…':'');
        const obj=_mkShape(type,xi,yi,170,75,false);if(!obj)return;
        const ti=_gtxt(obj);if(ti)ti.set('text',title);
        obj._pf_node=true;obj._pf_type=type;obj._pf_label=c.title;obj.id='gen_'+c.id;
        _canvas.add(obj);yi+=105;});xi+=215;});
    _canvas.requestRenderAll();setTimeout(fitView,100);_push();_markDirty();
    showToast('Diagrama gerado com '+cards.length+' tarefas!');
  }

  function _populateTaskSel(){
    const sel=document.getElementById('dg-tasksel');if(!sel)return;
    const cards=(PFBoard?.cards?.length?PFBoard.cards:(window.mockCards||[])).filter(c=>(c.project_id||c.sl)===_pid);
    sel.innerHTML='<option value="">— Vincular a tarefa —</option>'+cards.map(c=>`<option value="${c.id}" ${c.id===_taskId?'selected':''}>${(c.title||'').replace(/</g,'&lt;')}</option>`).join('');
  }

  function setLinkedTask(taskId){_taskId=taskId||null;showToast(taskId?'Diagrama vinculado à tarefa':'Vínculo removido');}

  // ── Public init ───────────────────────────────────────────
  async function init(containerId,projectId){
    _pid=projectId;_taskId=null;
    if(!_pid){showToast('Selecione um Projeto primeiro',true);return;}
    const outer=document.getElementById(containerId);
    if(!outer){console.error('[Dg] Container não encontrado:',containerId);return;}
    if(_canvas){try{_canvas.dispose();}catch(e){}_canvas=null;}
    if(_themeObserver){_themeObserver.disconnect();_themeObserver=null;}
    clearTimeout(_saveTimer);_hist=[];_histIdx=-1;_dirty=false;
    document.getElementById('dgv9-root')?.remove();
    document.getElementById('dg-empty-state') && (document.getElementById('dg-empty-state').style.display='none');
    _injectCSS();
    // Lazy-load Fabric.js (não está no index.html global — carregado sob demanda)
    if(typeof fabric==='undefined'){
      try{
        await new Promise((res,rej)=>{
          const s=document.createElement('script');
          s.src='https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js';
          s.onload=res;s.onerror=()=>rej(new Error('Fabric.js falhou ao carregar'));
          document.head.appendChild(s);
        });
      }catch(e){showToast('Erro ao carregar engine de diagramas: '+e.message,true);return;}
    }
    const root=document.createElement('div');root.style.cssText='flex:1;display:flex;flex-direction:column;overflow:hidden;height:100%;';
    root.innerHTML=_buildHTML(_pid);outer.appendChild(root);
    _initCanvas();_bindTB();_bindPal();_bindKB();setTool('select');
    await _loadFromStorage();_push();
    const badge=document.getElementById('diagram-project-badge');
    const proj=(window.mockProjects||[]).find(p=>p.id===_pid);
    if(badge)badge.textContent=proj?proj.name+' — Editor Fabric.js':'Editor de Diagramas';
    showToast('Editor de Diagramas pronto');
  }

  return{
    init,save,addNode,setTool,setLinkedTask,
    undo,redo,deleteSelected,duplicateSelected,selectAll,clearAll,autoLayout,
    fitView,zoomIn:()=>_zoom(1.2),zoomOut:()=>_zoom(0.8),exportPNG,exportSVG,generateFromProject,
    get canvas(){return _canvas;},get pid(){return _pid;},
    startLineTool:()=>setTool('line'),startArrowTool:()=>setTool('arrow'),addText:()=>setTool('text'),
  };
})();

window.DiagramViewManager={
  _pid:null,
  async init(pid){this._pid=pid||PF.currentProject;if(!this._pid){showToast('Selecione um projeto',true);return;}await DiagramEngineV9.init('dg-container',this._pid);},
  async generate(pid){this._pid=pid||PF.currentProject;if(!this._pid)return;await DiagramEngineV9.init('dg-container',this._pid);DiagramEngineV9.generateFromProject(this._pid);},
};
