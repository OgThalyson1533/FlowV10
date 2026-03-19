// ProjectFlow v6 — pf-modal.js — Sistema de Modais Profissional
// Zero prompt/confirm/alert do navegador. Funciona em demo e produção.
'use strict';

window.PFModal = {
  _stack: [],
  _mounted: false,
  _selectedColor: '#4A7CF6',

  // ── MOUNT ─────────────────────────────────────────────────
  mount() {
    // Always inject styles, regardless of whether root exists
    this._injectStyles();
    this._mounted = true;
    // Ensure root exists
    if (!document.getElementById('pf-modal-root')) {
      const root = document.createElement('div');
      root.id = 'pf-modal-root';
      document.body.appendChild(root);
    }
  },

  // ── CONFIRM ───────────────────────────────────────────────
  confirm({ title = 'Confirmar', message = '', confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false } = {}) {
    return new Promise(resolve => {
      const html = `
        <div class="pfm-hdr">
          <span class="pfm-icon">${danger ? '⚠️' : 'ℹ️'}</span>
          <h3 class="pfm-title">${this._e(title)}</h3>
        </div>
        <p class="pfm-msg">${this._e(message)}</p>
        <div class="pfm-foot">
          <button class="pfm-btn pfm-ghost" data-pfm-action="cancel">${this._e(cancelText)}</button>
          <button class="pfm-btn ${danger ? 'pfm-danger' : 'pfm-primary'}" data-pfm-action="ok">${this._e(confirmText)}</button>
        </div>`;
      this._show(html, (ok) => resolve(ok === true));
    });
  },

  // ── PROMPT ────────────────────────────────────────────────
  prompt({ title = '', label = '', placeholder = '', value = '', type = 'text', multiline = false } = {}) {
    return new Promise(resolve => {
      const inputId = 'pfm_prompt_' + Date.now();
      const input = multiline
        ? `<textarea class="pfm-input" id="${inputId}" placeholder="${this._e(placeholder)}" rows="3">${this._e(value)}</textarea>`
        : `<input class="pfm-input" id="${inputId}" type="${type}" placeholder="${this._e(placeholder)}" value="${this._e(value)}">`;
      const html = `
        <div class="pfm-hdr"><h3 class="pfm-title">${this._e(title || label)}</h3></div>
        <div class="pfm-body">
          ${label && title ? `<label class="pfm-lbl">${this._e(label)}</label>` : ''}
          ${input}
        </div>
        <div class="pfm-foot">
          <button class="pfm-btn pfm-ghost" data-pfm-action="cancel">Cancelar</button>
          <button class="pfm-btn pfm-primary" data-pfm-action="ok">OK</button>
        </div>`;
      this._show(html, (ok, dialog) => {
        if (ok) {
          const el = dialog.querySelector('#' + inputId);
          resolve(el ? el.value : null);
        } else {
          resolve(null);
        }
      }, { focusId: inputId });
    });
  },

  // ── COLUMN OPTIONS ────────────────────────────────────────
  colOptions(colName) {
    return new Promise(resolve => {
      const html = `
        <div class="pfm-hdr">
          <span class="pfm-icon">🗂️</span>
          <h3 class="pfm-title">Coluna: <em>${this._e(colName)}</em></h3>
        </div>
        <div class="pfm-opts">
          <button class="pfm-opt" data-pfm-val="rename"><span class="pfm-opt-icon">✏️</span><span>Renomear coluna</span></button>
          <button class="pfm-opt" data-pfm-val="wip"><span class="pfm-opt-icon">🎯</span><span>Alterar limite WIP</span></button>
          <button class="pfm-opt pfm-opt--danger" data-pfm-val="delete"><span class="pfm-opt-icon">🗑️</span><span>Remover coluna</span></button>
        </div>
        <div class="pfm-foot">
          <button class="pfm-btn pfm-ghost" data-pfm-action="cancel">Cancelar</button>
        </div>`;
      this._show(html, (ok, dialog, val) => resolve(val || null));
    });
  },

  // ── ADD COLUMN ────────────────────────────────────────────
  addColumn() {
    return new Promise(resolve => {
      const colors = ['#9A9A94','#6C5CE7','#C48A0A','#3B6CDB','#1A9E5F','#E07050','#D63031','#0097A7','#2D3436'];
      this._selectedColor = colors[0];
      const nameId = 'pfm_colname_' + Date.now();
      const wipId  = 'pfm_colwip_'  + Date.now();
      const html = `
        <div class="pfm-hdr">
          <span class="pfm-icon">＋</span>
          <h3 class="pfm-title">Nova Coluna</h3>
        </div>
        <div class="pfm-body">
          <label class="pfm-lbl">Nome da coluna *</label>
          <input class="pfm-input" id="${nameId}" type="text" placeholder="Ex: Homologação" maxlength="40" autocomplete="off">
          <label class="pfm-lbl" style="margin-top:14px">Limite WIP <span style="font-weight:400;color:var(--tx-3)">(opcional)</span></label>
          <input class="pfm-input" id="${wipId}" type="number" min="1" max="99" placeholder="Ilimitado">
          <label class="pfm-lbl" style="margin-top:14px">Cor da coluna</label>
          <div class="pfm-colors" id="pfm-colors-${nameId}">
            ${colors.map((c, i) => `<button type="button" class="pfm-cswatch${i===0?' pfm-cswatch--on':''}" data-c="${c}" style="background:${c}" onclick="PFModal._pickColor('${c}','pfm-colors-${nameId}')"></button>`).join('')}
            <input type="color" class="pfm-ccustom" value="${colors[0]}" oninput="PFModal._pickColor(this.value,'pfm-colors-${nameId}')">
          </div>
        </div>
        <div class="pfm-foot">
          <button class="pfm-btn pfm-ghost" data-pfm-action="cancel">Cancelar</button>
          <button class="pfm-btn pfm-primary" data-pfm-action="ok">Criar Coluna</button>
        </div>`;
      this._show(html, (ok, dialog) => {
        if (!ok) { resolve(null); return; }
        const name = dialog.querySelector('#' + nameId)?.value?.trim();
        const wip  = dialog.querySelector('#' + wipId)?.value;
        if (!name) { resolve(null); return; }
        resolve({ name, wip: wip ? (parseInt(wip) || null) : null, color: this._selectedColor });
      }, { focusId: nameId });
    });
  },

  _pickColor(c, gridId) {
    this._selectedColor = c;
    const grid = document.getElementById(gridId);
    if (grid) {
      grid.querySelectorAll('.pfm-cswatch').forEach(el => el.classList.toggle('pfm-cswatch--on', el.dataset.c === c));
    }
  },

  // ── DELETE HELPERS ────────────────────────────────────────
  deleteCard(cardTitle) {
    return this.confirm({
      title: 'Excluir tarefa',
      message: `Excluir "${cardTitle}"? Esta ação não pode ser desfeita.`,
      confirmText: 'Excluir', danger: true
    });
  },
  deleteProject(projectName) {
    return this.confirm({
      title: 'Excluir projeto',
      message: `Excluir "${projectName}" e todas as suas tarefas? Ação irreversível.`,
      confirmText: 'Excluir projeto', danger: true
    });
  },

  // ── CORE ENGINE ───────────────────────────────────────────
  _show(html, callback, opts = {}) {
    if (!this._mounted) this.mount();

    const root = document.getElementById('pf-modal-root');
    if (!root) { console.error('PFModal: root not found'); return; }

    const id = 'pfm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
    const backdrop = document.createElement('div');
    backdrop.className = 'pfm-backdrop';
    backdrop.id = id;
    backdrop.innerHTML = `<div class="pfm-dialog" role="dialog" aria-modal="true">${html}</div>`;
    root.appendChild(backdrop);

    const dialog = backdrop.querySelector('.pfm-dialog');

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => backdrop.classList.add('pfm-vis'));
    });

    const closeWith = (val, extra) => {
      const idx = this._stack.findIndex(s => s.id === id);
      if (idx === -1) return;
      const { keyHandler } = this._stack.splice(idx, 1)[0];
      document.removeEventListener('keydown', keyHandler);
      backdrop.classList.remove('pfm-vis');
      // Call callback BEFORE removing from DOM (elements still accessible)
      if (callback) callback(val, dialog, extra);
      setTimeout(() => backdrop.remove(), 240);
    };

    // Bind action buttons (ok/cancel)
    backdrop.querySelectorAll('[data-pfm-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        closeWith(btn.dataset.pfmAction === 'ok');
      });
    });

    // Bind option buttons (colOptions)
    backdrop.querySelectorAll('[data-pfm-val]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        closeWith(true, btn.dataset.pfmVal);
      });
    });

    // Backdrop click = cancel
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) closeWith(false);
    });

    // Keyboard
    const keyHandler = e => {
      if (e.key === 'Escape') { e.preventDefault(); closeWith(false); }
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        closeWith(true);
      }
    };
    document.addEventListener('keydown', keyHandler);
    this._stack.push({ id, keyHandler });

    // Focus
    if (opts.focusId) {
      setTimeout(() => {
        const el = document.getElementById(opts.focusId);
        if (el) { el.focus(); if (el.select) el.select(); }
      }, 80);
    }

    return id;
  },

  _e(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); },

  // ── STYLES ───────────────────────────────────────────────
  _injectStyles() {
    const existingId = 'pfm-styles-v6';
    const existing = document.getElementById(existingId);
    if (existing) existing.remove(); // Always refresh styles

    const s = document.createElement('style');
    s.id = existingId;
    s.textContent = `
#pf-modal-root{position:fixed;inset:0;z-index:9000;pointer-events:none;}
.pfm-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.46);display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;pointer-events:all;transition:opacity 220ms ease;backdrop-filter:blur(3px);}
.pfm-vis{opacity:1;}
.pfm-dialog{background:var(--bg-1);border:1px solid var(--bd);border-radius:var(--r-2xl, 24px);box-shadow:0 24px 80px rgba(0,0,0,.28),0 8px 24px rgba(0,0,0,.16);width:min(440px,100%);max-height:90vh;overflow:auto;padding:24px;transform:translateY(10px) scale(.96);transition:transform 240ms cubic-bezier(.34,1.3,.64,1);will-change:transform;}
.pfm-vis .pfm-dialog{transform:translateY(0) scale(1);}
.pfm-hdr{display:flex;align-items:center;gap:10px;margin-bottom:16px;}
.pfm-icon{font-size:22px;flex-shrink:0;}
.pfm-title{font-size:17px;font-weight:800;color:var(--tx-1);margin:0;letter-spacing:-.4px;line-height:1.25;}
.pfm-title em{font-style:normal;color:var(--ac);}
.pfm-msg{font-size:14px;color:var(--tx-2);line-height:1.65;margin-bottom:20px;}
.pfm-body{margin-bottom:20px;}
.pfm-lbl{display:block;font-size:12px;font-weight:600;color:var(--tx-2);margin-bottom:6px;text-transform:uppercase;letter-spacing:.4px;}
.pfm-input{width:100%;padding:10px 13px;background:var(--bg-2);border:1.5px solid var(--bd);border-radius:var(--r-m, 10px);font-size:14px;color:var(--tx-1);font-family:var(--font,system-ui);transition:border-color .15s,background .15s;outline:none;display:block;}
.pfm-input:focus{border-color:var(--ac);background:var(--bg-1);box-shadow:0 0 0 3px var(--ac-glow,rgba(224,112,80,.22));}
.pfm-foot{display:flex;justify-content:flex-end;gap:8px;padding-top:18px;border-top:1px solid var(--bd);}
.pfm-btn{padding:9px 20px;border-radius:var(--r-m, 10px);font-size:14px;font-weight:600;cursor:pointer;border:1.5px solid transparent;transition:all .15s;font-family:var(--font,system-ui);letter-spacing:-.1px;}
.pfm-primary{background:var(--ac);color:#fff;border-color:var(--ac);}
.pfm-primary:hover{opacity:.85;}
.pfm-ghost{background:none;color:var(--tx-2);border-color:var(--bd);}
.pfm-ghost:hover{background:var(--bg-2);color:var(--tx-1);border-color:var(--bd-2);}
.pfm-danger{background:var(--red);color:#fff;border-color:var(--red);}
.pfm-danger:hover{opacity:.85;}
.pfm-opts{display:flex;flex-direction:column;gap:6px;margin-bottom:18px;}
.pfm-opt{display:flex;align-items:center;gap:12px;padding:13px 16px;border-radius:var(--r-m, 10px);background:var(--bg-2);border:1px solid var(--bd);cursor:pointer;font-size:14px;color:var(--tx-1);text-align:left;transition:all .15s;font-family:var(--font,system-ui);}
.pfm-opt:hover{background:var(--bg-3);border-color:var(--bd-2);transform:translateX(2px);}
.pfm-opt--danger:hover{background:var(--red-bg,rgba(214,48,49,.09));border-color:var(--red);color:var(--red);}
.pfm-opt-icon{font-size:17px;flex-shrink:0;}
.pfm-colors{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;align-items:center;}
.pfm-cswatch{width:30px;height:30px;border-radius:50%;cursor:pointer;border:2.5px solid transparent;transition:transform .15s,border-color .15s;flex-shrink:0;}
.pfm-cswatch:hover{transform:scale(1.18);}
.pfm-cswatch--on{border-color:var(--tx-1)!important;transform:scale(1.15);}
.pfm-ccustom{width:30px;height:30px;padding:0;border-radius:50%;border:2px solid var(--bd);cursor:pointer;flex-shrink:0;}
`;
    document.head.appendChild(s);
  }
};
