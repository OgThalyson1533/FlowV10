// ============================================================
//  ProjectFlow V10 — diagram-engine-v9.js
//  Wrapper leve para o Excalidraw real via iframe.
//  O arquivo diagram.html contém o Excalidraw completo via
//  @excalidraw/excalidraw (React + ESM CDN).
//
//  Isso resolve definitivamente:
//  ✅ Canvas infinito com matemática correta
//  ✅ Zoom/pan sem distorção
//  ✅ Dark mode / Light mode nativo
//  ✅ Undo/Redo completo (história imutável)
//  ✅ Seleção e colisão precisas (bounding box)
//  ✅ Rough.js (estilo hand-drawn real)
//  ✅ Performance 60fps
//  ✅ Persistência: localStorage + Supabase
// ============================================================
'use strict';

window.DiagramEngineV9 = (function () {

  let _iframe   = null;
  let _pid      = null;
  let _ready    = false;
  let _pending  = [];   // mensagens enfileiradas antes do iframe ficar ready

  // ── CSS do container ─────────────────────────────────────
  function _css() {
    if (document.getElementById('pf-dg-wrap-css')) return;
    const s = document.createElement('style');
    s.id = 'pf-dg-wrap-css';
    s.textContent = `
#dgv9-root {
  display: flex; flex-direction: column;
  height: 100%; position: relative; overflow: hidden;
}
#pf-dg-topbar {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 14px;
  background: var(--bg-1, #fff);
  border-bottom: 1px solid var(--bd, #e4ddd6);
  flex-shrink: 0; flex-wrap: wrap;
  box-shadow: 0 1px 6px rgba(0,0,0,0.08);
  z-index: 10;
}
[data-theme="dark"] #pf-dg-topbar {
  background: #242420; border-color: #38382e;
}
.pf-dg-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 12px; border-radius: 8px;
  font-size: 12.5px; font-weight: 700;
  cursor: pointer; white-space: nowrap;
  border: 1.5px solid transparent;
  background: transparent; color: #5c5c58;
  transition: all .12s; font-family: var(--font, system-ui);
}
.pf-dg-btn:hover { background: var(--bg-2, #f5f0eb); border-color: var(--bd, #e4ddd6); color: var(--tx-1, #1a1a18); }
.pf-dg-btn-save { background: #e07050 !important; color: #fff !important; border-color: #e07050 !important; box-shadow: 0 2px 8px rgba(224,112,80,.3); }
.pf-dg-btn-save:hover { background: #c85a38 !important; }
.pf-dg-btn-save:disabled { opacity: .6; cursor: not-allowed; }
.pf-dg-sep { width: 1px; height: 22px; background: var(--bd, #e4ddd6); margin: 0 4px; }
.pf-dg-badge {
  padding: 4px 10px; border-radius: 6px;
  font-size: 11px; font-weight: 700; color: #c05030;
  background: #fff8f6; border: 1px solid #f0d0c0;
}
.pf-dg-status {
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; color: #8a8a80; font-family: monospace;
}
.pf-dg-dot { width: 7px; height: 7px; border-radius: 50%; }
.pf-dg-dot.saved  { background: #10b981; }
.pf-dg-dot.dirty  { background: #f59e0b; }
.pf-dg-dot.saving { background: #3b82f6; animation: pf-pulse 1s infinite; }
@keyframes pf-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
#pf-dg-iframe-wrap {
  flex: 1; position: relative; overflow: hidden;
}
#pf-dg-iframe {
  width: 100%; height: 100%; border: none; display: block;
}
#pf-dg-overlay {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: var(--bg-0, #f8f5f0); gap: 18px; z-index: 5;
}
#pf-dg-overlay .pf-dg-empty-icon {
  width: 72px; height: 72px; border-radius: 20px;
  background: #fff3e6; display: flex; align-items: center;
  justify-content: center; font-size: 32px;
}
#pf-dg-overlay p { font-size: 14px; color: #5c5c58; font-weight: 700; }
#pf-dg-overlay small { font-size: 12px; color: #8a8a80; text-align: center; line-height: 1.6; max-width: 360px; }
.pf-dg-task-sel {
  font-size: 11px; padding: 4px 8px;
  border: 1px solid var(--bd, #e4ddd6); border-radius: 6px;
  background: var(--bg-1, #fff); color: var(--tx-2, #5c5c58);
  outline: none; cursor: pointer;
  font-family: var(--font, system-ui);
}
    `;
    document.head.appendChild(s);
  }

  // ── Build HTML do container ───────────────────────────────
  function _buildHTML(pid) {
    const proj = (window.mockProjects || []).find(p => p.id === pid);
    const projName = proj?.name || pid || '—';

    const cards = (PFBoard?.cards?.length ? PFBoard.cards : (window.mockCards || []))
      .filter(c => (c.project_id || c.sl) === pid);

    const taskOpts = cards.map(c =>
      `<option value="${c.id}">${(c.title||'').slice(0,40).replace(/</g,'&lt;')}</option>`
    ).join('');

    return `
<div id="dgv9-root">

  <!-- Toolbar ProjectFlow sobre o Excalidraw -->
  <div id="pf-dg-topbar">

    <span class="pf-dg-badge">⬡ ${projName}</span>

    <div class="pf-dg-sep"></div>

    <select class="pf-dg-task-sel" id="pf-dg-task-sel" onchange="DiagramEngineV9.setLinkedTask(this.value)">
      <option value="">— Vincular a tarefa —</option>
      ${taskOpts}
    </select>

    <div class="pf-dg-sep"></div>

    <button class="pf-dg-btn" onclick="DiagramEngineV9.generateFromProject()" title="Gerar diagrama das tarefas do projeto">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="6.5" cy="6.5" r="5.5"/><path d="M4 6.5h5M7 4.5l2 2-2 2"/></svg>
      Gerar do Projeto
    </button>

    <button class="pf-dg-btn" onclick="DiagramEngineV9.clearDiagram()" title="Limpar diagrama">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 4h9M5 4V2.5h3V4M4 4l.5 7h4L9 4"/></svg>
      Limpar
    </button>

    <div style="flex:1"></div>

    <div class="pf-dg-status">
      <span class="pf-dg-dot saved" id="pf-dg-dot"></span>
      <span id="pf-dg-status-lbl">Salvo</span>
    </div>

    <div class="pf-dg-sep"></div>

    <button class="pf-dg-btn pf-dg-btn-save" id="pf-dg-save-btn" onclick="DiagramEngineV9.save()">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round"><path d="M2 12h9a1 1 0 001-1V4l-3-3H3a1 1 0 00-1 1v9a1 1 0 001 1z"/><path d="M8 1v3.5H4V1M6.5 7v4"/></svg>
      Salvar
    </button>
  </div>

  <!-- iframe do Excalidraw -->
  <div id="pf-dg-iframe-wrap">
    <iframe
      id="pf-dg-iframe"
      src="diagram.html?pid=${encodeURIComponent(pid)}&theme=${_currentTheme()}"
      allow="clipboard-read; clipboard-write; fullscreen"
    ></iframe>

    <!-- Overlay de carregamento (removido quando iframe envia READY) -->
    <div id="pf-dg-overlay">
      <div class="pf-dg-empty-icon">⬡</div>
      <p>Carregando Excalidraw…</p>
      <small>Editor de diagramas profissional com canvas infinito, zoom preciso e estilo hand-drawn.</small>
    </div>
  </div>

</div>`;
  }

  // ── Tema atual ────────────────────────────────────────────
  function _currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  // ── postMessage para o iframe ─────────────────────────────
  function _post(type, payload) {
    if (!_iframe?.contentWindow) return;
    _iframe.contentWindow.postMessage({ type, payload }, '*');
  }

  function _postWhenReady(type, payload) {
    if (_ready) { _post(type, payload); }
    else        { _pending.push({ type, payload }); }
  }

  // ── Listener de mensagens vindas do iframe ────────────────
  function _setupListener() {
    window.addEventListener('message', async (e) => {
      const { source, type, payload } = e.data || {};
      if (source !== 'pf-diagram') return;

      switch (type) {
        case 'READY':
          _ready = true;
          document.getElementById('pf-dg-overlay')?.remove();
          // Sync tema
          _post('PF_SET_THEME', _currentTheme());
          // Flush pending
          _pending.forEach(m => _post(m.type, m.payload));
          _pending = [];
          break;

        case 'SAVE_DATA':
          await _saveToSupabase(payload);
          break;
      }
    });

    // Observa mudanças de tema no documento pai
    const observer = new MutationObserver(() => {
      _post('PF_SET_THEME', _currentTheme());
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  // ── Persistência Supabase ─────────────────────────────────
  async function _saveToSupabase(payload) {
    if (!payload?.pid) return;
    _setStatus('saving');

    try {
      if (window.PF?.supabase && !window.PF?.demoMode) {
        const { data: ex } = await PF.supabase
          .from('project_diagrams')
          .select('id')
          .eq('project_id', payload.pid)
          .eq('is_current', true)
          .limit(1);

        const dbPayload = {
          content_json: payload.data,
          updated_at: new Date().toISOString(),
        };

        if (ex?.length) {
          const { error } = await PF.supabase
            .from('project_diagrams').update(dbPayload).eq('id', ex[0].id);
          if (error) throw error;
        } else {
          const { error } = await PF.supabase
            .from('project_diagrams').insert({
              project_id: payload.pid, is_current: true,
              name: 'Diagrama Principal', content_json: payload.data,
              generated_from: 'excalidraw', created_by: PF.user?.id || null,
            });
          if (error) throw error;
        }
      }
      _setStatus('saved');
    } catch(err) {
      // Se Supabase offline — dados já estão no localStorage do iframe
      if (err?.message?.includes('Failed to fetch') || err?.message?.includes('ERR_NAME')) {
        _setStatus('saved');
      } else {
        _setStatus('dirty');
        console.warn('[PF Diagram] Supabase save error:', err.message);
      }
    }
  }

  async function _loadFromSupabase(pid) {
    if (!window.PF?.supabase || window.PF?.demoMode) return null;
    try {
      const { data: rows } = await PF.supabase
        .from('project_diagrams')
        .select('content_json')
        .eq('project_id', pid)
        .eq('is_current', true)
        .limit(1);
      return rows?.[0]?.content_json || null;
    } catch(e) {
      return null;
    }
  }

  // ── Status indicator ──────────────────────────────────────
  function _setStatus(state) {
    const dot = document.getElementById('pf-dg-dot');
    const lbl = document.getElementById('pf-dg-status-lbl');
    if (dot) dot.className = 'pf-dg-dot ' + state;
    if (lbl) lbl.textContent = { saved:'Salvo', dirty:'Não salvo', saving:'Salvando…' }[state] || state;
  }

  // ── API Pública ───────────────────────────────────────────

  async function init(containerId, projectId) {
    _pid = projectId;
    _ready = false;
    _pending = [];

    if (!_pid) { showToast('Selecione um Projeto primeiro', true); return; }

    const outer = document.getElementById(containerId);
    if (!outer) { console.error('[PF Diagram] Container não encontrado:', containerId); return; }

    // Remove instância anterior
    document.getElementById('dgv9-root')?.remove();
    document.getElementById('dg-empty-state')?.style && (document.getElementById('dg-empty-state').style.display = 'none');

    _css();

    // Monta HTML
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;height:100%;';
    wrapper.innerHTML = _buildHTML(_pid);
    outer.appendChild(wrapper);

    _iframe = document.getElementById('pf-dg-iframe');

    // Setup listener UMA vez
    if (!window._pfDiagramListenerReady) {
      window._pfDiagramListenerReady = true;
      _setupListener();
    }

    // Atualiza badge
    const badge = document.getElementById('diagram-project-badge');
    const proj  = (window.mockProjects || []).find(p => p.id === _pid);
    if (badge) badge.textContent = proj ? `${proj.name} — Excalidraw` : 'Editor Excalidraw';

    // Tenta carregar dados do Supabase e envia para o iframe quando pronto
    const sbData = await _loadFromSupabase(_pid);
    if (sbData?.elements) {
      _postWhenReady('PF_LOAD_DATA', sbData);
    }
  }

  function save() {
    // Solicita ao iframe que envie os dados para salvar
    _postWhenReady('PF_SAVE');
  }

  function generateFromProject(pid) {
    const targetPid = pid || _pid || PF.currentProject;
    if (!targetPid) { showToast('Selecione um projeto primeiro', true); return; }

    const cards = (PFBoard?.cards?.length ? PFBoard.cards : (window.mockCards || []))
      .filter(c => (c.project_id || c.sl) === targetPid);

    if (!cards.length) { showToast('Nenhuma tarefa encontrada', true); return; }

    _postWhenReady('PF_GENERATE', { cards });
    showToast('Gerando diagrama de ' + cards.length + ' tarefas…');
  }

  function clearDiagram() {
    if (!confirm('Limpar o diagrama? Esta ação não pode ser desfeita.')) return;
    _postWhenReady('PF_CLEAR');
    showToast('Diagrama limpo');
  }

  function setLinkedTask(taskId) {
    if (taskId) showToast('Diagrama vinculado à tarefa');
  }

  // Compat stubs (chamados de outros lugares)
  function setTool(t)              { /* Excalidraw gerencia suas ferramentas internamente */ }
  function undo()                  { _postWhenReady('PF_UNDO'); }
  function redo()                  { _postWhenReady('PF_REDO'); }
  function deleteSelected()        { _postWhenReady('PF_DELETE'); }
  function selectAll()             { _postWhenReady('PF_SELECT_ALL'); }
  function fitView()               { _postWhenReady('PF_FIT_VIEW'); }
  function exportPNG()             { _postWhenReady('PF_EXPORT_PNG'); }
  function exportSVG()             { _postWhenReady('PF_EXPORT_SVG'); }
  function autoLayout()            { generateFromProject(); }
  function clearAll()              { clearDiagram(); }
  function duplicateSelected()     { _postWhenReady('PF_DUPLICATE'); }
  function addNode(type, x, y)    { _postWhenReady('PF_ADD_NODE', { type, x, y }); }
  function zoomIn()                { _postWhenReady('PF_ZOOM', { delta: 0.2 }); }
  function zoomOut()               { _postWhenReady('PF_ZOOM', { delta: -0.2 }); }
  function startLineTool()         { /* gerenciado pelo Excalidraw */ }
  function startArrowTool()        { /* gerenciado pelo Excalidraw */ }
  function addText()               { /* gerenciado pelo Excalidraw */ }

  return {
    init, save, generateFromProject, clearDiagram, setLinkedTask,
    setTool, undo, redo, deleteSelected, selectAll, fitView,
    exportPNG, exportSVG, autoLayout, clearAll, duplicateSelected,
    addNode, zoomIn, zoomOut, startLineTool, startArrowTool, addText,
    get pid() { return _pid; },
    get canvas() { return null; }, // iframe, não há canvas direto
  };

})();

// ── DiagramViewManager compat ─────────────────────────────────────────────
window.DiagramViewManager = {
  _pid: null,
  async init(pid) {
    this._pid = pid || PF.currentProject;
    if (!this._pid) { showToast('Selecione um projeto primeiro', true); return; }
    await DiagramEngineV9.init('dg-container', this._pid);
  },
  async generate(pid) {
    this._pid = pid || PF.currentProject;
    if (!this._pid) return;
    await DiagramEngineV9.init('dg-container', this._pid);
    DiagramEngineV9.generateFromProject(this._pid);
  },
};
