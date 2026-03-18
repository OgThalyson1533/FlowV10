// ============================================================
//  ProjectFlow — pf-producao.js
//  Arquivo único que substitui: v7-fixes.js, v7-supabase-fix.js, v8-core-fix.js
//  Carregado por último no index.html
// ============================================================
'use strict';

// ── Utilidades ───────────────────────────────────────────────
const _pf = {
  uuid: id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||''),
  esc:  s  => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'),
};
window._se = _pf.esc;  // alias usado por v7-fixes legacy

// ════════════════════════════════════════════════════════════
//  1. TOAST
// ════════════════════════════════════════════════════════════
window.showToast = function(msg, type) {
  const el = document.getElementById('toast'); if (!el) return;
  clearTimeout(PF.toastTimer);
  el.textContent = msg;
  const err = type===true||type==='error', ok = type==='ok'||type===false;
  el.className = 'toast show' + (err?' err':ok?' ok':'');
  PF.toastTimer = setTimeout(() => el.className='toast', 3200);
};

// ════════════════════════════════════════════════════════════
//  2. VIEWS (switchView)
// ════════════════════════════════════════════════════════════
window.switchView = function(name, btn) {
  document.querySelectorAll('div[id^="view-"]').forEach(v => {
    v.classList.remove('active'); v.style.display='none';
  });
  document.querySelectorAll('.tb-tab').forEach(t => t.classList.remove('active'));
  const el = document.getElementById('view-'+name);
  if (el) { el.classList.add('active'); el.style.display='flex'; }
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.canvas-mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode===name);
  });
};

// ════════════════════════════════════════════════════════════
//  3. WORKSPACE — busca sem .single()
// ════════════════════════════════════════════════════════════
async function _pfWorkspace() {
  if (!PF.supabase || PF.demoMode) return null;
  if (PF.currentWorkspace?.id) return PF.currentWorkspace.id;
  try {
    // Tenta como membro
    const { data: rows } = await PF.supabase
      .from('workspace_members').select('workspace_id,workspaces(id,name)')
      .eq('user_id', PF.user.id).limit(1);
    if (rows?.[0]?.workspace_id) {
      PF.currentWorkspace = { id: rows[0].workspace_id, name: rows[0].workspaces?.name };
      _pfWsName(PF.currentWorkspace.name);
      return PF.currentWorkspace.id;
    }
    // Tenta como owner
    const { data: owned } = await PF.supabase
      .from('workspaces').select('id,name').eq('owner_id', PF.user.id).limit(1);
    if (owned?.[0]?.id) {
      await PF.supabase.from('workspace_members')
        .insert({ workspace_id: owned[0].id, user_id: PF.user.id, role:'owner' });
      PF.currentWorkspace = { id: owned[0].id, name: owned[0].name };
      _pfWsName(owned[0].name);
      return owned[0].id;
    }
    // Cria workspace
    const nm = (PF.user?.user_metadata?.full_name || PF.user?.email?.split('@')[0] || 'Meu') + "'s Workspace";
    const { data: ws } = await PF.supabase
      .from('workspaces').insert({ name: nm, owner_id: PF.user.id }).select('id,name');
    if (ws?.[0]?.id) {
      await PF.supabase.from('workspace_members')
        .insert({ workspace_id: ws[0].id, user_id: PF.user.id, role:'owner' });
      PF.currentWorkspace = { id: ws[0].id, name: ws[0].name };
      _pfWsName(ws[0].name);
      return ws[0].id;
    }
  } catch(e) { console.warn('[PF] workspace:', e.message); }
  return null;
}
function _pfWsName(name) {
  if (!name) return;
  const el = document.getElementById('ws-name-display') || document.querySelector('.sb-ws-name');
  if (el) el.textContent = name;
}
window._ensureWorkspace = _pfWorkspace;

// ════════════════════════════════════════════════════════════
//  4. SIDEBAR
// ════════════════════════════════════════════════════════════
function _pfSidebar(proj) {
  const list = document.getElementById('sb-projects-list'); if (!list) return;
  list.querySelectorAll('[data-placeholder]').forEach(e => e.remove());
  if (list.querySelector(`[data-pid="${proj.id}"]`)) return;
  const div = document.createElement('div');
  div.className = 'sb-item'; div.dataset.pid = proj.id;
  div.setAttribute('onclick', `selectProject(this,'${_pf.esc(proj.id)}')`);
  div.innerHTML = `
    <div class="sb-project-dot" style="background:${proj.color||'var(--ac)'}"></div>
    <span class="sb-item-label">${_pf.esc(proj.name)}</span>
    <span class="sb-badge" id="badge-${proj.id}">0</span>
    <div class="sb-proj-actions">
      <button class="sb-proj-btn" onclick="event.stopPropagation();openProjectEdit('${_pf.esc(proj.id)}')" title="Editar">✏️</button>
      <button class="sb-proj-btn sb-proj-btn--del" onclick="event.stopPropagation();deleteProject('${_pf.esc(proj.id)}')" title="Excluir">🗑</button>
    </div>`;
  list.appendChild(div);
}
window._addProjectToSidebar = _pfSidebar;

function _pfEmptySidebar() {
  const list = document.getElementById('sb-projects-list'); if (!list) return;
  if (!list.querySelector('.sb-item'))
    list.innerHTML = '<div data-placeholder style="padding:14px 16px;font-size:12px;color:var(--tx-3);line-height:1.7">Nenhum projeto ainda.<br>Clique em <strong>Novo Projeto</strong>.</div>';
}

// ════════════════════════════════════════════════════════════
//  5. selectProject
// ════════════════════════════════════════════════════════════
async function _pfSelect(el, id) {
  document.querySelectorAll('#sb-projects-list .sb-item').forEach(i => i.classList.remove('active'));
  (el || document.querySelector(`[data-pid="${id}"]`))?.classList.add('active');
  PF.currentProject = id; PFBoard.projectId = id;
  const proj = (window.mockProjects||[]).find(p => p.id===id);
  const te = document.getElementById('board-title'); if (te && proj) te.textContent = proj.name;
  if (typeof loadProjectBoard === 'function') await loadProjectBoard(id);
  if (window.AIStrip) AIStrip.updateContext('kanban', id);
  switchView('kanban', document.getElementById('nav-kanban'));
}
window.selectProject = (el, id) => _pfSelect(el, id);

// ════════════════════════════════════════════════════════════
//  6. _afterLogin — carrega workspace + projetos + board
// ════════════════════════════════════════════════════════════
window._afterLogin = async function(name) {
  if (typeof _updateConnBadge==='function') _updateConnBadge();
  if (window.UnifiedCanvas) UnifiedCanvas.mount();
  if (typeof window.renderTeam==='function') window.renderTeam();

  if (!PF.demoMode && PF.supabase) {
    const list = document.getElementById('sb-projects-list');
    if (list) list.innerHTML = '';
    window.mockCards=[]; window.mockProjects=[];
    PFBoard.cards=[]; PFBoard.columns=[]; PFBoard.boardId=null; PFBoard.projectId=null;
    try {
      await _pfWorkspace();
      const { data: projects, error } = await PF.supabase
        .from('projects')
        .select('id,name,color,status,client_name,objective,workspace_id')
        .order('created_at', { ascending: true });
      if (error) throw error;
      if (!projects?.length) { _pfEmptySidebar(); renderBoard?.(); return; }
      window.mockProjects = projects.map(p=>({...p}));
      projects.forEach(p => _pfSidebar(p));
      const first = projects[0];
      PF.currentProject = first.id; PFBoard.projectId = first.id;
      document.querySelector(`[data-pid="${first.id}"]`)?.classList.add('active');
      const te = document.getElementById('board-title'); if (te) te.textContent = first.name;
      await loadProjectBoard(first.id);
    } catch(e) {
      console.warn('[PF] _afterLogin:', e.message);
      _pfEmptySidebar(); renderBoard?.();
    }
  } else {
    // Demo
    const list = document.getElementById('sb-projects-list'); if (list) list.innerHTML='';
    const demos = [
      {id:'website',name:'Website Rebrand',color:'#e07050'},
      {id:'product',name:'Product A',color:'#6c5ce7'},
      {id:'content',name:'Conteúdo Q1',color:'#3b6cdb'},
    ];
    window.mockProjects = demos; demos.forEach(p => _pfSidebar(p));
    PF.currentProject = 'website'; PFBoard.projectId = 'website';
    document.querySelector('[data-pid="website"]')?.classList.add('active');
    if (typeof loadProjectBoard==='function') await loadProjectBoard('website');
  }
  if (window.AIStrip) AIStrip.updateContext('kanban', PF.currentProject||'');
  if (typeof _renderLegacyList==='function') _renderLegacyList();
};

// ════════════════════════════════════════════════════════════
//  7. createProject
// ════════════════════════════════════════════════════════════
let _busyProj = false;
window.createProject = async function() {
  if (_busyProj) return; _busyProj = true;
  const name      = document.getElementById('np-name')?.value.trim();
  const color     = document.getElementById('np-color')?.value || '#3b6cdb';
  const client    = document.getElementById('np-client')?.value?.trim() || null;
  const objective = document.getElementById('np-objective')?.value?.trim() || null;
  if (!name || name.length < 2) {
    showToast('Nome deve ter ≥ 2 caracteres', true); _busyProj=false; return;
  }
  closeModal('new-project-overlay');
  ['np-name','np-client','np-objective'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  const nc=document.getElementById('np-color');if(nc)nc.value='#3b6cdb';

  if (!PF.supabase || PF.demoMode) {
    const id='proj_'+Date.now();
    const proj={id,name,color,status:'active',client_name:client,objective};
    (window.mockProjects=window.mockProjects||[]).push(proj);
    _pfSidebar(proj); await _pfSelect(null,id);
    showToast('Projeto "'+name+'" criado!','ok'); _busyProj=false; return;
  }

  showToast('Criando projeto...','ok');
  try {
    const wsId = await _pfWorkspace();
    const { data, error } = await PF.supabase.from('projects')
      .insert({ name, color, status:'active', client_name:client, objective,
                owner_id: PF.user.id, workspace_id: wsId||null })
      .select('id,name,color,status,client_name,objective,workspace_id');

    if (error) throw error;
    if (!data?.[0]?.id) throw new Error('Banco não retornou o projeto criado.');

    const proj = {...data[0]};
    (window.mockProjects=window.mockProjects||[]).push(proj);
    _pfSidebar(proj); await _pfSelect(null, proj.id);
    showToast('Projeto "'+name+'" criado!','ok');
  } catch(e) {
    showToast('Erro ao criar projeto: '+e.message, true);
    console.error('[PF] createProject:', e);
  }
  _busyProj = false;
};

// ════════════════════════════════════════════════════════════
//  8. createCard
// ════════════════════════════════════════════════════════════
let _busyCard = false;
window.createCard = async function() {
  if (_busyCard) return; _busyCard = true;
  const title    = document.getElementById('new-title')?.value.trim();
  const colId    = document.getElementById('new-col-sel')?.value || 'col-todo';
  const hours    = document.getElementById('new-hours')?.value.trim();
  const budget   = document.getElementById('new-budget')?.value.trim();
  const date     = document.getElementById('new-date')?.value;
  const priority = document.getElementById('new-priority')?.value || 'medium';
  const desc     = document.getElementById('new-desc')?.value.trim();

  if (!title || title.length < 3) {
    showToast('Título deve ter ≥ 3 caracteres', true); _busyCard=false; return;
  }
  const cols   = PFBoard.columns.length ? PFBoard.columns : (initDefaultColumns?.() || []);
  const selCol = cols.find(c=>c.id===colId) || cols[0] || {};
  const bpmn   = Array.isArray(selCol.bpmn_mapping) ? (selCol.bpmn_mapping[0]||'esbocar') : 'esbocar';
  const projId = PFBoard.projectId || PF.currentProject;

  if (!PF.supabase || PF.demoMode) {
    PFBoard.cards.push({ id:'card_'+Date.now(), col:colId, column_id:colId, bpmn, bpmn_status:bpmn,
      title, description:desc||null, priority, estimated_hours:hours?+hours:null,
      budget:budget?+budget:null, due_date:date||null, date:date||null,
      tags:[], position:999, project_id:projId||'demo' });
    renderBoard(); closeModal('new-card-overlay'); resetNewCardForm?.();
    showToast('Tarefa criada!','ok'); PF._pendingCol=null; _busyCard=false; return;
  }

  if (!projId || !_pf.uuid(projId)) {
    showToast('Selecione um projeto antes de criar tarefas.', true); _busyCard=false; return;
  }

  // Garante boardId
  let boardId = PFBoard.boardId;
  if (!_pf.uuid(boardId)) {
    const { data: bds } = await PF.supabase.from('kanban_boards')
      .select('id').eq('project_id',projId).order('created_at').limit(1);
    boardId = bds?.[0]?.id || null; if (boardId) PFBoard.boardId = boardId;
  }

  // Resolve column_id (UUID real)
  let realColId = _pf.uuid(colId) ? colId : null;
  if (!realColId && PFBoard.columns.length) {
    const MAP={'col-todo':['esbocar','viabilizar'],'col-plan':['atribuir'],
      'col-exec':['executar'],'col-rev':['avaliar','corrigir','validar_cliente'],'col-done':['concluido']};
    const tgts = MAP[colId]||['esbocar'];
    const found = PFBoard.columns.find(c=>_pf.uuid(c.id)&&Array.isArray(c.bpmn_mapping)&&c.bpmn_mapping.some(b=>tgts.includes(b)));
    realColId = found?.id || (PFBoard.columns.find(c=>_pf.uuid(c.id))?.id||null);
  }

  const tempId = 'tmp_'+Date.now();
  PFBoard.cards.push({ id:tempId, _temp:true, col:colId, column_id:realColId||colId,
    bpmn, bpmn_status:bpmn, title, description:desc||null, priority,
    estimated_hours:hours?+hours:null, budget:budget?+budget:null,
    due_date:date||null, date:date||null, tags:[], position:999,
    project_id:projId, board_id:boardId||null });
  renderBoard(); closeModal('new-card-overlay'); resetNewCardForm?.(); PF._pendingCol=null;

  try {
    const { data, error } = await PF.supabase.from('tasks')
      .insert({ title, description:desc||null, project_id:projId, board_id:boardId||null,
        column_id:realColId||null, bpmn_status:bpmn, priority,
        estimated_hours:hours?+hours:null, budget:budget?+budget:null,
        due_date:date||null, created_by:PF.user?.id||null })
      .select('id,bpmn_status,kanban_col,column_id');

    const idx = PFBoard.cards.findIndex(c=>c.id===tempId);
    if (error) {
      if (idx!==-1) PFBoard.cards.splice(idx,1);
      renderBoard(); showToast('Erro: '+error.message, true);
      console.error('[PF] createCard:', error);
    } else if (data?.[0]?.id) {
      if (idx!==-1) PFBoard.cards[idx] = { ...PFBoard.cards[idx],
        id:data[0].id, _temp:false, bpmn:data[0].bpmn_status,
        bpmn_status:data[0].bpmn_status, column_id:data[0].column_id||realColId||colId };
      renderBoard(); showToast('Tarefa criada!','ok');
      const badge=document.getElementById('badge-'+projId);
      if(badge)badge.textContent=PFBoard.cards.filter(c=>!c._temp).length;
    }
  } catch(e) {
    const idx=PFBoard.cards.findIndex(c=>c.id===tempId);
    if(idx!==-1)PFBoard.cards.splice(idx,1);
    renderBoard(); showToast('Erro de rede: '+e.message,true);
  }
  _busyCard = false;
};

// ════════════════════════════════════════════════════════════
//  9. deleteProject
// ════════════════════════════════════════════════════════════
window.deleteProject = async function(id) {
  const proj = (window.mockProjects||[]).find(p=>p.id===id);
  if (typeof PFModal!=='undefined') { const ok=await PFModal.deleteProject(proj?.name||id); if(!ok)return; }
  window.mockProjects = (window.mockProjects||[]).filter(p=>p.id!==id);
  if (PF.supabase&&!PF.demoMode&&_pf.uuid(id))
    await PF.supabase.from('projects').delete().eq('id',id);
  document.querySelector(`[data-pid="${id}"]`)?.remove();
  if (PF.currentProject===id) {
    const next = window.mockProjects?.[0];
    if (next) await _pfSelect(null, next.id);
    else { PF.currentProject=null;PFBoard.projectId=null;PFBoard.boardId=null;
      PFBoard.cards=[];PFBoard.columns=[];
      const t=document.getElementById('board-title');if(t)t.textContent='—';
      _pfEmptySidebar(); renderBoard?.(); }
  }
  showToast('Projeto excluído');
};

// ════════════════════════════════════════════════════════════
//  10. loadProjectBoard patch — normaliza bpmn_mapping + mockTeam
// ════════════════════════════════════════════════════════════
(function(){
  const _orig=window.loadProjectBoard; if(typeof _orig!=='function')return;
  window.loadProjectBoard = async function(projectId) {
    PFBoard.projectId = projectId;
    const res = await _orig.call(this, projectId);
    // Normaliza bpmn_mapping TEXT[] → JS Array
    (PFBoard.columns||[]).forEach(col => {
      if (Array.isArray(col.bpmn_mapping)) return;
      const s = String(col.bpmn_mapping||'');
      col.bpmn_mapping = s ? s.replace(/^\{|\}$/g,'').split(',').map(x=>x.trim().replace(/^"|"$/g,'')).filter(Boolean) : [];
    });
    // Carrega membros como mockTeam
    if (PF.supabase && !PF.demoMode && _pf.uuid(projectId)) {
      try {
        const { data: mbs } = await PF.supabase.from('project_members')
          .select('user_id,role,profiles(id,full_name,initials,avatar_color)')
          .eq('project_id', projectId);
        if (mbs?.length) {
          window.mockTeam = mbs.filter(m=>m.profiles).map(m=>({
            id:m.profiles.id,
            initials:m.profiles.initials||(m.profiles.full_name||'?').slice(0,2).toUpperCase(),
            name:m.profiles.full_name||'Usuário', color:m.profiles.avatar_color||'#e07050', role:m.role
          }));
          renderBoard?.();
        }
      } catch(_) {}
    }
    const badge=document.getElementById('badge-'+projectId);
    if(badge)badge.textContent=PFBoard.cards?.length||0;
    return res;
  };
})();

// ════════════════════════════════════════════════════════════
//  11. openNewCard — mostra projeto ativo
// ════════════════════════════════════════════════════════════
(function(){
  const _orig=window.openNewCard; if(typeof _orig!=='function')return;
  window.openNewCard = function() {
    _orig.apply(this, arguments);
    const ind=document.getElementById('new-card-project-indicator'); if(!ind)return;
    const pid=PFBoard.projectId||PF.currentProject;
    const proj=(window.mockProjects||[]).find(p=>p.id===pid);
    if (proj) {
      const c=proj.color||'#3b6cdb';
      ind.style.cssText=`display:block;margin-bottom:12px;padding:8px 12px;background:${c}18;border-radius:6px;font-size:12px;font-weight:600;color:${c};border:1px solid ${c}30`;
      ind.innerHTML=`<span style="opacity:.7">📁 Projeto:</span> <strong>${_pf.esc(proj.name)}</strong>`;
    } else {
      ind.style.cssText='display:block;margin-bottom:12px;padding:8px 12px;background:#ff000012;border-radius:6px;font-size:12px;font-weight:600;color:#cc3333;border:1px solid #ff000025';
      ind.innerHTML='⚠ Nenhum projeto selecionado — clique em um projeto na barra lateral.';
    }
  };
})();

// ════════════════════════════════════════════════════════════
//  12. moveCardToCol — resolve colId fake para UUID
// ════════════════════════════════════════════════════════════
(function(){
  const _orig=window.moveCardToCol; if(typeof _orig!=='function')return;
  window.moveCardToCol = async function(cardId, colId) {
    if (!_pf.uuid(colId) && PFBoard.columns?.length) {
      const MAP={'col-todo':['esbocar','viabilizar'],'col-plan':['atribuir'],
        'col-exec':['executar'],'col-rev':['avaliar','corrigir','validar_cliente'],'col-done':['concluido']};
      const tgts=MAP[colId]||[];
      const real=PFBoard.columns.find(c=>_pf.uuid(c.id)&&Array.isArray(c.bpmn_mapping)&&c.bpmn_mapping.some(b=>tgts.includes(b)));
      if (real) colId=real.id;
    }
    return _orig.call(this, cardId, colId);
  };
})();

// ════════════════════════════════════════════════════════════
//  13. Badge ao renderizar board
// ════════════════════════════════════════════════════════════
(function(){
  const _orig=window.renderBoard; if(typeof _orig!=='function')return;
  window.renderBoard = function() {
    _orig.apply(this, arguments);
    const pid=PFBoard.projectId;
    if (pid) { const b=document.getElementById('badge-'+pid); if(b)b.textContent=PFBoard.cards.filter(c=>!c._temp).length; }
  };
})();

// ════════════════════════════════════════════════════════════
//  14. Dashboard — normaliza budget string
// ════════════════════════════════════════════════════════════
(function(){
  const _orig=window.renderDashboard; if(typeof _orig!=='function')return;
  window.renderDashboard = function() {
    (PFBoard.cards||window.mockCards||[]).forEach(c => {
      c._budgetNum = typeof c.budget==='number' ? c.budget :
        parseFloat(String(c.budget||'').replace(/[^0-9.,]/g,'').replace(',','.')) || 0;
    });
    return _orig.apply(this, arguments);
  };
})();

// ════════════════════════════════════════════════════════════
//  15. Diagrama
// ════════════════════════════════════════════════════════════
window.initDiagramView = function() {
  const pid=PF.currentProject||'website';
  const tryInit=(n)=>{
    if (!window.DiagramEngine||typeof DiagramEngine.init!=='function') {
      if (n>0) setTimeout(()=>tryInit(n-1),100);
      else showToast('Motor de diagramas não carregado',true);
      return;
    }
    if (window.DiagramViewManager) DiagramViewManager.init(pid);
  };
  requestAnimationFrame(()=>tryInit(10));
};
window.regenDiagram = function() {
  if (window.DiagramViewManager) DiagramViewManager.generate(PF.currentProject||'website');
};

// ════════════════════════════════════════════════════════════
//  16. Wiki / Knowledge Base
// ════════════════════════════════════════════════════════════
window.initWikiView = function() {
  const pid=PF.currentProject||'website';
  const proj=(window.mockProjects||[]).find(p=>p.id===pid)||{name:pid};
  const sub=document.getElementById('wiki-project-sub');
  if (sub) sub.textContent='Wiki · '+proj.name;
  if (window.KnowledgeBase) requestAnimationFrame(()=>KnowledgeBase.render('kb-container',pid));
};

// ════════════════════════════════════════════════════════════
//  17. Doc IA
// ════════════════════════════════════════════════════════════
window.initAIDocView = function() {
  const pid=PF.currentProject||'website';
  if (window.AIDocPanel) { requestAnimationFrame(()=>AIDocPanel.render('ai-doc-container',pid)); return; }
  const el=document.getElementById('ai-doc-container');
  if (el) el.innerHTML=`<div style="text-align:center;padding:60px;color:var(--tx-3)">
    <div style="font-size:32px;margin-bottom:16px">✦</div>
    <p style="font-size:15px;font-weight:700;color:var(--tx-2);margin-bottom:8px">Motor de IA</p>
    <p style="font-size:13px">Configure a Edge Function claude-proxy no Supabase para usar a IA.</p></div>`;
};

// ════════════════════════════════════════════════════════════
//  18. Documentação
// ════════════════════════════════════════════════════════════
window.initDocView = function() {
  if (typeof window.renderDocDatabase==='function') window.renderDocDatabase();
};

// ════════════════════════════════════════════════════════════
//  19. Equipe
// ════════════════════════════════════════════════════════════
window.renderTeam = function() {
  const g=document.getElementById('team-grid'); if(!g)return;
  const team=window.mockTeam||[];
  if (!team.length) { g.innerHTML='<p style="font-size:13px;color:var(--tx-3);padding:20px">Nenhum membro encontrado.</p>'; return; }
  const cards=PFBoard.cards.length?PFBoard.cards:(window.mockCards||[]);
  g.innerHTML=team.map(m=>`
    <div class="team-card">
      <div class="avatar" style="background:${m.color};width:44px;height:44px;font-size:15px;flex-shrink:0">${_pf.esc(m.initials)}</div>
      <div class="team-info">
        <div class="team-name">${_pf.esc(m.name)}</div>
        <div class="team-role">${_pf.esc(m.role)}</div>
      </div>
      <div style="margin-left:auto;font-size:11px;color:var(--tx-3)">
        ${cards.filter(c=>(c.assignee||c.assigned_to)===m.id&&c.col!=='done').length} ativas
      </div>
    </div>`).join('');
};

// ════════════════════════════════════════════════════════════
//  20. Legados
// ════════════════════════════════════════════════════════════
window._renderLegacyList = function() {
  const el=document.getElementById('legacy-items'); if(!el)return;
  const legacies=(window.mockProjects||[]).filter(p=>p.is_legacy);
  if (!legacies.length) { el.innerHTML='<p style="font-size:13px;color:var(--tx-3)">Nenhum projeto legado importado.</p>'; return; }
  el.innerHTML=legacies.map(p=>`
    <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--bg-1);border:1px solid var(--bd);border-radius:var(--r-m);margin-bottom:10px;cursor:pointer" onclick="selectProject(this,'${p.id}')">
      <div style="width:10px;height:10px;border-radius:50%;background:${p.color};flex-shrink:0"></div>
      <div style="flex:1">
        <div style="font-size:14px;font-weight:600;color:var(--tx-1)">${_pf.esc(p.name)}</div>
        ${p.objective?`<div style="font-size:12px;color:var(--tx-3);margin-top:2px">${_pf.esc(p.objective)}</div>`:''}
      </div>
      <span style="font-size:11px;padding:2px 8px;border-radius:12px;background:var(--yellow-bg);color:var(--yellow);font-weight:600">Legado</span>
    </div>`).join('');
};

// ════════════════════════════════════════════════════════════
//  21. Claude Proxy (CORS fix)
// ════════════════════════════════════════════════════════════
(function(){
  function _proxyUrl() {
    if (!PF.supabase||PF.demoMode) return null;
    const base=PF.supabase.supabaseUrl||localStorage.getItem('pf_sb_url')||'';
    return base ? base.replace(/\/$/,'')+'/functions/v1/claude-proxy' : null;
  }
  function _key() { return PF.supabase?.supabaseKey||localStorage.getItem('pf_sb_key')||''; }

  window._callClaudeViaProxy = async function(sys,msg,maxTok) {
    const url=_proxyUrl(); if(!url) throw new Error('PROXY_NOT_CONFIGURED');
    const res=await fetch(url,{method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+_key(),'apikey':_key()},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:maxTok||1500,system:sys,messages:[{role:'user',content:msg}]})});
    if (!res.ok) throw new Error('Edge Function erro HTTP '+res.status);
    const data=await res.json();
    return (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('').trim();
  };

  const _origCC=window._callClaude;
  window._callClaude = async function(sys,msg) {
    if (window._callClaudeViaProxy) {
      try { return await window._callClaudeViaProxy(sys,msg,1500); }
      catch(e) {
        if (e.message.includes('PROXY_NOT_CONFIGURED')||e.message.includes('Edge Function')) {
          showToast('IA: configure a Edge Function claude-proxy no Supabase',true);
        }
        throw e;
      }
    }
    if (typeof _origCC==='function') return _origCC.apply(this,arguments);
    throw new Error('Claude não configurado');
  };
})();

// ════════════════════════════════════════════════════════════
//  22. Session restore
// ════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
  // Boot: garante display correto nas views
  document.querySelectorAll('div[id^="view-"]').forEach(v => {
    v.style.display = v.classList.contains('active') ? 'flex' : 'none';
  });
  if (typeof _renderLegacyList==='function') _renderLegacyList();
  if (window.PFModal?.mount) PFModal.mount();

  if (!PF.supabase) return;
  PF.supabase.auth.onAuthStateChange((event, session) => {
    if (event==='SIGNED_IN' && session?.user) {
      const appEl=document.getElementById('app-shell');
      if (appEl?.classList.contains('ready')) return;
      PF.user=session.user; PF.demoMode=false;
      const nm=session.user.user_metadata?.full_name||session.user.email.split('@')[0];
      if (typeof enterApp==='function') enterApp(nm);
    }
    if (event==='SIGNED_OUT') {
      PFBoard.cards=[]; PFBoard.columns=[]; PFBoard.boardId=null; PFBoard.projectId=null;
      window.mockProjects=[]; window.mockCards=[];
    }
  });

  // Sidebar observer — remove placeholder quando projetos aparecem
  const list=document.getElementById('sb-projects-list'); if(!list) return;
  new MutationObserver(()=>{
    if (list.querySelector('.sb-item')) list.querySelectorAll('[data-placeholder]').forEach(e=>e.remove());
  }).observe(list,{childList:true});
});

// ════════════════════════════════════════════════════════════
//  23. Drag & Drop — null-safe
// ════════════════════════════════════════════════════════════
(function(){
  document.addEventListener('DOMContentLoaded',()=>{
    const _orig=window.onDragEnd; if(typeof _orig!=='function')return;
    window.onDragEnd = function(e) {
      try { if(e?.currentTarget) _orig.call(this,e); }
      catch(_) {}
      document.querySelectorAll('.kcard--drag').forEach(c=>c.classList.remove('kcard--drag'));
      document.querySelectorAll('.kc-drop').forEach(z=>z.classList.remove('kc-drop'));
    };
  });
})();

console.log('[ProjectFlow] pf-producao.js carregado ✓');

// ════════════════════════════════════════════════════════════
//  24. saveCardEdit — patch: resolve column_id fake → UUID real
//  Garante que IDs como 'col-todo' sejam convertidos para UUIDs
//  antes de enviar ao Supabase, evitando erro de constraint FK.
// ════════════════════════════════════════════════════════════
(function(){
  const _orig = window.saveCardEdit;
  if (typeof _orig !== 'function') return;
  window.saveCardEdit = async function() {
    const colEl = document.getElementById('ce-column');
    if (colEl && colEl.value && !_pf.uuid(colEl.value) && PFBoard.columns?.length) {
      const COL_MAP = {
        'col-todo':  ['esbocar','viabilizar'],
        'col-plan':  ['atribuir'],
        'col-exec':  ['executar'],
        'col-rev':   ['avaliar','corrigir','validar_cliente'],
        'col-done':  ['concluido']
      };
      const targets = COL_MAP[colEl.value] || [];
      const real = PFBoard.columns.find(c =>
        _pf.uuid(c.id) &&
        Array.isArray(c.bpmn_mapping) &&
        c.bpmn_mapping.some(b => targets.includes(b))
      );
      if (real) colEl.value = real.id;
      else {
        const fallback = PFBoard.columns.find(c => _pf.uuid(c.id));
        if (fallback) colEl.value = fallback.id;
      }
    }
    return _orig.apply(this, arguments);
  };
})();

// ════════════════════════════════════════════════════════════
//  25. moveCardToCol — toast "Alteração salva com êxito" ao mover
// ════════════════════════════════════════════════════════════
(function(){
  const _orig = window.moveCardToCol;
  if (typeof _orig !== 'function') return;
  window.moveCardToCol = async function(cardId, colId) {
    const result = await _orig.call(this, cardId, colId);
    // Toast já emitido pelo SyncManager se msg !== ''
    return result;
  };
})();

// ════════════════════════════════════════════════════════════
//  26. openProjectEdit — garantir que usa dataset.pid
//      (sobrescreve versão inline do index.html)
// ════════════════════════════════════════════════════════════
window.openProjectEdit = function(id) {
  const proj = (window.mockProjects || []).find(p => p.id === id);
  if (!proj) return;
  document.getElementById('ep-id').value        = id;
  document.getElementById('ep-name').value      = proj.name        || '';
  document.getElementById('ep-desc').value      = proj.description || '';
  document.getElementById('ep-color').value     = proj.color       || '#3b6cdb';
  document.getElementById('ep-status').value    = proj.status      || 'active';
  document.getElementById('ep-client').value    = proj.client_name || '';
  document.getElementById('ep-objective').value = proj.objective   || '';
  openModal('edit-project-overlay');
};

// ════════════════════════════════════════════════════════════
//  27. saveProjectEdit — usa dataset.pid + toast correto
// ════════════════════════════════════════════════════════════
window.saveProjectEdit = async function() {
  const id = document.getElementById('ep-id').value;
  const name = document.getElementById('ep-name')?.value.trim();
  if (!name || name.length < 2) { showToast('Nome deve ter ≥2 caracteres', true); return; }
  const upd = {
    name,
    description: document.getElementById('ep-desc')?.value.trim()       || null,
    color:       document.getElementById('ep-color')?.value              || '#3b6cdb',
    status:      document.getElementById('ep-status')?.value             || 'active',
    client_name: document.getElementById('ep-client')?.value.trim()      || null,
    objective:   document.getElementById('ep-objective')?.value.trim()   || null,
  };
  const proj = (window.mockProjects || []).find(p => p.id === id);
  if (proj) Object.assign(proj, upd);
  if (PF.supabase && !PF.demoMode && _pf.uuid(id)) {
    const { error } = await PF.supabase.from('projects').update(upd).eq('id', id);
    if (error) { showToast('Erro: ' + error.message, true); return; }
  }
  // Atualiza sidebar usando dataset.pid (mais confiável que checar onclick)
  document.querySelectorAll('#sb-projects-list .sb-item').forEach(el => {
    if (el.dataset.pid === id) {
      const dot = el.querySelector('.sb-project-dot');
      const lbl = el.querySelector('.sb-item-label');
      if (dot) dot.style.background = upd.color;
      if (lbl) lbl.textContent = upd.name;
    }
  });
  if (PF.currentProject === id) {
    const t = document.getElementById('board-title');
    if (t) t.textContent = upd.name;
  }
  closeModal('edit-project-overlay');
  showToast('Alteração salva com êxito', 'ok');
};

// ════════════════════════════════════════════════════════════
//  28. initDiagramView — versão robusta com retry + Supabase
//      (sobrescreve versão inline simples do index.html)
// ════════════════════════════════════════════════════════════
window.initDiagramView = function() {
  const pid = PF.currentProject || (window.mockProjects?.[0]?.id) || 'website';
  const tryInit = (n) => {
    if (!window.DiagramEngine || typeof DiagramEngine.init !== 'function') {
      if (n > 0) setTimeout(() => tryInit(n - 1), 120);
      else showToast('Motor de diagramas não carregado', true);
      return;
    }
    if (!window.DiagramViewManager) { showToast('DiagramViewManager ausente', true); return; }
    DiagramViewManager.init(pid);
  };
  requestAnimationFrame(() => tryInit(12));
};

console.log('[ProjectFlow] pf-producao.js — patches 24-28 aplicados ✓');
