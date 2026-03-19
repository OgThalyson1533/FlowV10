// ============================================================
//  ProjectFlow V10 — js/app.js
//  SUBSTITUI: pf-producao.js + pf-v9-core.js + main.js
//  Inclui TODAS as features da V9: checklist, zip export,
//  recorrências, filtros kanban, member manager, wiki v9,
//  diagrama fix (tela preta), CORS help, proxy IA.
//  Zero conflitos de função.
// ============================================================
'use strict';

// ════════════════════════════════════════════════════════════
//  1. TOAST — pilha visual
// ════════════════════════════════════════════════════════════
(function installToast(){
  if(document.getElementById('pf-toast-stack'))return;
  const css=`
    #pf-toast-stack{position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column-reverse;gap:8px;pointer-events:none}
    .pft{display:flex;align-items:center;gap:10px;padding:11px 15px;min-width:220px;max-width:360px;
      background:var(--bg-1);border:1.5px solid var(--bd);border-radius:12px;
      box-shadow:0 8px 28px rgba(0,0,0,.15);font-size:13px;font-weight:600;color:var(--tx-1);
      pointer-events:auto;cursor:pointer;animation:pftIn .25s cubic-bezier(.34,1.56,.64,1)}
    .pft.out{animation:pftOut .2s ease-in forwards}
    .pft.ok,.pft.success{border-color:var(--green);background:var(--green-bg);color:var(--green)}
    .pft.err,.pft.error{border-color:var(--red);background:var(--red-bg);color:var(--red)}
    .pft.warn{border-color:#c48a0a;background:#fffbeb;color:#92400e}
    .pft-icon{font-size:15px;flex-shrink:0}.pft-msg{flex:1;line-height:1.4}
    .pft-x{opacity:.35;font-size:12px;flex-shrink:0}.pft-x:hover{opacity:1}
    @keyframes pftIn{from{opacity:0;transform:translateX(40px) scale(.92)}to{opacity:1;transform:none}}
    @keyframes pftOut{to{opacity:0;transform:translateX(40px) scale(.86)}}`;
  const sty=document.createElement('style');sty.textContent=css;document.head.appendChild(sty);
  const stack=document.createElement('div');stack.id='pf-toast-stack';document.body.appendChild(stack);
  const ICONS={ok:'✅',success:'✅',err:'❌',error:'❌',warn:'⚠️'};
  function rem(item){if(!item||item.classList.contains('out'))return;item.classList.add('out');setTimeout(()=>item.remove(),220);}
  window.showToast=function(msg,type){
    if(type===true)type='error';if(!type||type===false)type='ok';
    const item=document.createElement('div');item.className='pft '+type;
    item.innerHTML='<span class="pft-icon">'+(ICONS[type]||'✅')+'</span><span class="pft-msg">'+String(msg).replace(/</g,'&lt;')+'</span><span class="pft-x">✕</span>';
    item.querySelector('.pft-x').onclick=e=>{e.stopPropagation();rem(item);};item.onclick=()=>rem(item);
    stack.appendChild(item);
    const all=stack.querySelectorAll('.pft:not(.out)');if(all.length>5)rem(all[0]);
    setTimeout(()=>rem(item),(type==='error'||type==='err')?5000:3200);
  };
})();

// ════════════════════════════════════════════════════════════
//  2. VIEWS
// ════════════════════════════════════════════════════════════
window.switchView=function(name,btn){
  document.querySelectorAll('div[id^="view-"]').forEach(v=>{v.classList.remove('active');v.style.display='none';});
  document.querySelectorAll('.tb-tab').forEach(t=>t.classList.remove('active'));
  const el=document.getElementById('view-'+name);
  if(el){el.classList.add('active');el.style.display='flex';}
  if(btn)btn.classList.add('active');
};

// ════════════════════════════════════════════════════════════
//  3. WORKSPACE
// ════════════════════════════════════════════════════════════
async function _ensureWorkspace(){
  if(!PF.supabase||PF.demoMode)return null;
  if(PF.currentWorkspace?.id)return PF.currentWorkspace.id;
  try{
    const{data:rows}=await PF.supabase.from('workspace_members')
      .select('workspace_id,workspaces(id,name)').eq('user_id',PF.user.id).limit(1);
    if(rows?.[0]?.workspace_id){
      PF.currentWorkspace={id:rows[0].workspace_id,name:rows[0].workspaces?.name};
      _setWsName(PF.currentWorkspace.name);return PF.currentWorkspace.id;
    }
    const{data:owned}=await PF.supabase.from('workspaces').select('id,name').eq('owner_id',PF.user.id).limit(1);
    if(owned?.[0]?.id){
      await PF.supabase.from('workspace_members').insert({workspace_id:owned[0].id,user_id:PF.user.id,role:'owner'});
      PF.currentWorkspace={id:owned[0].id,name:owned[0].name};_setWsName(owned[0].name);return PF.currentWorkspace.id;
    }
    const nm=(PF.user?.user_metadata?.full_name||PF.user?.email?.split('@')[0]||'Meu')+"'s Workspace";
    const{data:ws}=await PF.supabase.from('workspaces').insert({name:nm,owner_id:PF.user.id}).select('id,name');
    if(ws?.[0]?.id){
      await PF.supabase.from('workspace_members').insert({workspace_id:ws[0].id,user_id:PF.user.id,role:'owner'});
      PF.currentWorkspace={id:ws[0].id,name:ws[0].name};_setWsName(ws[0].name);return PF.currentWorkspace.id;
    }
  }catch(e){console.warn('[PF] workspace:',e.message);}
  return null;
}
function _setWsName(name){if(!name)return;const el=document.getElementById('ws-name-display')||document.querySelector('.sb-ws-name');if(el)el.textContent=name;}
window._ensureWorkspace=_ensureWorkspace;

// ════════════════════════════════════════════════════════════
//  4. SIDEBAR
// ════════════════════════════════════════════════════════════
function _addToSidebar(proj){
  const list=document.getElementById('sb-projects-list');if(!list)return;
  if(list.querySelector(`[data-pid="${proj.id}"]`))return;
  list.querySelectorAll('[data-placeholder]').forEach(e=>e.remove());
  const div=document.createElement('div');div.className='sb-item';div.dataset.pid=proj.id;
  div.setAttribute('onclick',`selectProject(this,'${_safeEsc(proj.id)}')`);
  div.innerHTML=`
    <div class="sb-project-dot" style="background:${proj.color||'var(--ac)'}"></div>
    <span class="sb-item-label">${_safeEsc(proj.name)}</span>
    <span class="sb-badge" id="badge-${proj.id}">0</span>
    <div class="sb-proj-actions">
      <button class="sb-proj-btn" onclick="event.stopPropagation();openProjectEdit('${_safeEsc(proj.id)}')" title="Editar">✏️</button>
      <button class="sb-proj-btn sb-proj-btn--del" onclick="event.stopPropagation();deleteProject('${_safeEsc(proj.id)}')" title="Excluir">🗑</button>
    </div>`;
  list.appendChild(div);
}
function _emptySidebar(){
  const list=document.getElementById('sb-projects-list');if(!list)return;
  if(!list.querySelector('.sb-item'))
    list.innerHTML='<div data-placeholder style="padding:14px 16px;font-size:12px;color:var(--tx-3);line-height:1.7">Nenhum projeto ainda.<br>Clique em <strong>Novo Projeto</strong>.</div>';
}
window._addProjectToSidebar=_addToSidebar;

// ════════════════════════════════════════════════════════════
//  5. SELECT PROJECT
// ════════════════════════════════════════════════════════════
window.selectProject=async function(el,id){
  document.querySelectorAll('.sb-item').forEach(i=>i.classList.remove('active'));
  if(el)el.classList.add('active');
  PF.currentProject=id;PFBoard.projectId=id;
  const proj=(window.mockProjects||[]).find(p=>p.id===id);
  const t=document.getElementById('board-title');if(t)t.textContent=proj?.name||id;
  const s=document.getElementById('board-sub');if(s)s.textContent='Kanban · '+(proj?.client_name||'');
  await loadProjectBoard(id);
  switchView('kanban',document.getElementById('nav-kanban'));
  _updateConnBadge();
};

// ════════════════════════════════════════════════════════════
//  6. AFTER LOGIN — carrega projetos + board
// ════════════════════════════════════════════════════════════
window._afterLogin=async function(name){
  _updateConnBadge();
  if(typeof renderTeam==='function')renderTeam();

  if(PF.supabase&&!PF.demoMode){
    window.mockCards=[];window.mockProjects=[];
    try{
      await _ensureWorkspace();
      const{data:projects}=await PF.supabase.from('projects')
        .select('id,name,color,status,client_name,objective,wip_limit,budget')
        .in('status',['active','paused']).order('created_at',{ascending:true});
      if(projects?.length){
        window.mockProjects=projects;
        projects.forEach(p=>_addToSidebar(p));
        const{data:mbs}=await PF.supabase.from('project_members')
          .select('user_id,profiles(id,full_name,avatar_color)').eq('project_id',projects[0].id);
        if(mbs?.length){
          window.mockTeam=mbs.filter(m=>m.profiles).map(m=>({
            id:m.user_id,name:m.profiles.full_name||'Usuário',
            initials:(m.profiles.full_name||'U').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(),
            color:m.profiles.avatar_color||'#e07050',role:'Membro',
          }));
        }
        await loadProjectBoard(projects[0].id);
        PF.currentProject=projects[0].id;
        document.querySelector(`[data-pid="${projects[0].id}"]`)?.classList.add('active');
        const t=document.getElementById('board-title');if(t)t.textContent=projects[0].name;
      }else{_loadDemoMode();}
    }catch(e){console.warn('[PF] afterLogin:',e);_loadDemoMode();}
  }else{_loadDemoMode();}
  if(typeof renderDocDatabase==='function')renderDocDatabase();
};

function _loadDemoMode(){
  const demos=window.mockProjects.length?window.mockProjects:[
    {id:'website',name:'Website Rebrand',color:'#d97757'},
    {id:'product',name:'Product A',color:'#7c5cbf'},
    {id:'content',name:'Conteúdo Q1',color:'#4a7cf6'},
  ];
  window.mockProjects=demos;demos.forEach(p=>_addToSidebar(p));
  loadProjectBoard('website');
  const t=document.getElementById('board-title');if(t)t.textContent='Website Rebrand';
}

function _updateConnBadge(){
  const badge=document.getElementById('sb-conn-badge');const text=document.getElementById('sb-conn-text');
  if(!badge||!text)return;
  if(PF.demoMode){badge.className='sb-conn-badge demo';text.textContent='Demo Mode';}
  else if(PF.supabase){badge.className='sb-conn-badge live';text.textContent='Supabase conectado';}
}
window._updateConnBadge=_updateConnBadge;

// ════════════════════════════════════════════════════════════
//  7. PROJECT CRUD
// ════════════════════════════════════════════════════════════
window.createProject=async function(){
  const name=document.getElementById('np-name')?.value.trim();
  if(!name||name.length<2){showToast('Nome deve ter ≥2 caracteres',true);return;}
  const color=document.getElementById('np-color')?.value||'#4a7cf6';
  const client=document.getElementById('np-client')?.value.trim()||null;
  const objective=document.getElementById('np-objective')?.value.trim()||null;
  const tempId=uid();
  const proj={id:tempId,name,color,client_name:client,objective,status:'active',wip_limit:15};
  if(PF.supabase&&!PF.demoMode){
    const wsId=await _ensureWorkspace();
    const{data,error}=await PF.supabase.from('projects')
      .insert({name,color,client_name:client,objective,owner_id:PF.user?.id,workspace_id:wsId,status:'active'})
      .select('id,name,color,status,client_name,objective,wip_limit').single();
    if(error){showToast('Erro: '+error.message,true);return;}
    proj.id=data.id;Object.assign(proj,data);
  }
  (window.mockProjects=window.mockProjects||[]).push(proj);
  _addToSidebar(proj);closeModal('new-project-overlay');
  showToast('Projeto "'+name+'" criado!','ok');
  selectProject(document.querySelector(`[data-pid="${proj.id}"]`),proj.id);
  ['np-name','np-client','np-objective'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
};

window.openProjectEdit=function(id){
  const proj=(window.mockProjects||[]).find(p=>p.id===id);if(!proj)return;
  document.getElementById('ep-id').value=id;
  document.getElementById('ep-name').value=proj.name||'';
  document.getElementById('ep-desc').value=proj.description||'';
  document.getElementById('ep-color').value=proj.color||'#d97757';
  document.getElementById('ep-status').value=proj.status||'active';
  document.getElementById('ep-client').value=proj.client_name||'';
  document.getElementById('ep-objective').value=proj.objective||'';
  openModal('edit-project-overlay');
};

window.saveProjectEdit=async function(){
  const id=document.getElementById('ep-id')?.value;
  const name=document.getElementById('ep-name')?.value.trim();
  if(!name||name.length<2){showToast('Nome deve ter ≥2 caracteres',true);return;}
  const upd={name,description:document.getElementById('ep-desc')?.value.trim()||null,
    color:document.getElementById('ep-color')?.value,status:document.getElementById('ep-status')?.value,
    client_name:document.getElementById('ep-client')?.value.trim()||null,
    objective:document.getElementById('ep-objective')?.value.trim()||null};
  const proj=(window.mockProjects||[]).find(p=>p.id===id);if(proj)Object.assign(proj,upd);
  if(PF.supabase&&!PF.demoMode){
    const{error}=await PF.supabase.from('projects').update(upd).eq('id',id);
    if(error){showToast('Erro: '+error.message,true);return;}
  }
  const item=document.querySelector(`[data-pid="${id}"]`);
  if(item){const dot=item.querySelector('.sb-project-dot');if(dot)dot.style.background=upd.color;const lbl=item.querySelector('.sb-item-label');if(lbl)lbl.textContent=upd.name;}
  if(PF.currentProject===id){const t=document.getElementById('board-title');if(t)t.textContent=upd.name;}
  closeModal('edit-project-overlay');showToast('Projeto atualizado!','ok');
};

window.deleteProject=async function(id){
  const proj=(window.mockProjects||[]).find(p=>p.id===id);
  const ok=await PFModal.confirm({title:'Excluir Projeto',message:`Excluir "${proj?.name||id}" e todas as suas tarefas?`,confirmText:'Excluir',danger:true});
  if(!ok)return;
  window.mockProjects=(window.mockProjects||[]).filter(p=>p.id!==id);
  window.mockCards=(window.mockCards||[]).filter(c=>c.sl!==id&&c.project_id!==id);
  if(PF.supabase&&!PF.demoMode)await PF.supabase.from('projects').delete().eq('id',id);
  document.querySelector(`[data-pid="${id}"]`)?.remove();_emptySidebar();
  if(PF.currentProject===id){PFBoard.cards=[];PFBoard.columns=[];renderBoard();}
  showToast('Projeto excluído');
};

window.createWorkspace=async function(){
  const name=document.getElementById('ws-name-input')?.value.trim();
  if(!name){showToast('Informe o nome',true);return;}
  if(PF.supabase&&!PF.demoMode){
    const{data,error}=await PF.supabase.from('workspaces').insert({name,owner_id:PF.user?.id}).select().single();
    if(error){showToast('Erro: '+error.message,true);return;}
    await PF.supabase.from('workspace_members').insert({workspace_id:data.id,user_id:PF.user.id,role:'owner'});
    PF.currentWorkspace={id:data.id,name:data.name};
  }
  _setWsName(name);closeModal('workspace-modal');showToast('Workspace "'+name+'" criado!');
  document.getElementById('ws-name-input').value='';
};

// ════════════════════════════════════════════════════════════
//  8. ATTACHMENTS
// ════════════════════════════════════════════════════════════
window.AttachmentManager={
  _store:{},
  ICONS:{SQL:'🗃',PBIX:'📊',XLSM:'📊',XLSX:'📊',XLS:'📊',XML:'📄',TXT:'📝',PDF:'📕',DOC:'📘',DOCX:'📘',CSV:'📋',JSON:'⚙',ZIP:'📦',PPTX:'📑',MD:'📝',PY:'🐍',JS:'📜',TS:'📜',SH:'🖥','?':'📎'},
  getExt:f=>(f.split('.').pop()||'').toUpperCase(),
  getIcon(f){return this.ICONS[this.getExt(f)]||this.ICONS['?'];},
  getForCard:id=>window.AttachmentManager._store[id]||[],
  fmtSize:b=>b<1024?b+' B':b<1048576?(b/1024).toFixed(1)+' KB':(b/1048576).toFixed(1)+' MB',
  async upload(cardId,files){
    if(!cardId)return[];if(!this._store[cardId])this._store[cardId]=[];const res=[];
    for(const f of files){
      if(f.size>50*1024*1024){showToast('Arquivo muito grande (máx 50 MB): '+f.name,true);continue;}
      const att={id:'att_'+Date.now()+'_'+Math.random().toString(36).slice(2,5),cardId,name:f.name,size:f.size,type:this.getExt(f.name),mimeType:f.type,uploadedAt:new Date().toISOString(),data:null,publicUrl:null};
      if(window.uploadAnexo&&PF.supabase&&!PF.demoMode){
        try{const r=await window.uploadAnexo(f,cardId);att.id=r.id;att.publicUrl=r.public_url;this._store[cardId].push(att);res.push(att);continue;}
        catch(e){console.warn('[Att]',e.message);}
      }
      if(/\.(sql|xml|txt|csv|json|md|py|js|ts|sh|yaml|yml)$/i.test(f.name))
        att.data=await new Promise(r=>{const rd=new FileReader();rd.onload=e=>r(e.target.result);rd.readAsText(f);});
      this._store[cardId].push(att);res.push(att);
    }
    if(res.length)showToast(res.length+' arquivo(s) anexado(s)!','ok');return res;
  },
  async delete(cardId,attId){
    const att=(this._store[cardId]||[]).find(a=>a.id===attId);
    if(att?.publicUrl&&window.removerAnexo&&PF.supabase&&!PF.demoMode)await window.removerAnexo(att.id,'').catch(()=>{});
    this._store[cardId]=(this._store[cardId]||[]).filter(a=>a.id!==attId);showToast('Anexo removido');
  },
  renderList(cardId){
    const atts=this.getForCard(cardId);
    if(!atts.length)return'<div style="font-size:12px;color:var(--tx-3);padding:12px 0;text-align:center">Nenhum anexo. Arraste arquivos ou clique em Selecionar.</div>';
    return atts.map(a=>{
      const isImg=a.mimeType?.startsWith('image/');
      const preview=isImg&&a.publicUrl?`<img src="${a.publicUrl}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;flex-shrink:0" alt="">`:`<span style="font-size:20px">${this.getIcon(a.name)}</span>`;
      return`<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg-2);border:1px solid var(--bd);border-radius:8px;margin-bottom:6px">
        ${preview}<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_safeEsc(a.name)}</div><div style="font-size:11px;color:var(--tx-3)">${a.type} · ${this.fmtSize(a.size)}</div></div>
        ${a.publicUrl?`<a href="${a.publicUrl}" target="_blank" style="font-size:11px;color:var(--blue)">↗</a>`:''}
        <button onclick="AttachmentManager.delete('${cardId}','${a.id}').then(()=>refreshCardAttachments())" style="background:none;border:none;cursor:pointer;color:var(--tx-3);font-size:14px;padding:4px" title="Remover">🗑</button>
      </div>`;
    }).join('');
  },
};
window.refreshCardAttachments=function(cid){const el=document.getElementById('ce-attachments-list');if(el)el.innerHTML=AttachmentManager.renderList(cid||PF.activeCardId||'');};
window.handleAttachmentDrop=function(e){e.preventDefault();e.currentTarget.classList.remove('att-hover');AttachmentManager.upload(PF.activeCardId,Array.from(e.dataTransfer.files)).then(()=>refreshCardAttachments());};
window.handleAttachmentInput=function(inp){AttachmentManager.upload(PF.activeCardId,Array.from(inp.files)).then(()=>refreshCardAttachments());inp.value='';};

// ════════════════════════════════════════════════════════════
//  9. CHECKLIST (v9 feature)
// ════════════════════════════════════════════════════════════
window.PFChecklist=(function(){
  const _store={};const _k=id=>'pf_chk_v9_'+id;
  function load(id){if(_store[id])return _store[id];try{_store[id]=JSON.parse(localStorage.getItem(_k(id))||'[]');}catch{_store[id]=[];}return _store[id];}
  function _pers(id){try{localStorage.setItem(_k(id),JSON.stringify(_store[id]));}catch(e){}
    if(window.PF?.supabase&&!window.PF?.demoMode)PF.supabase.from('tasks').update({checklist:_store[id]}).eq('id',id).catch(()=>{});}
  function add(id,txt){if(!txt?.trim())return;load(id).push({id:'ci_'+Date.now()+'_'+Math.random().toString(36).slice(2,4),text:txt.trim(),done:false});_pers(id);render(id);}
  function toggle(id,iid){const item=load(id).find(x=>x.id===iid);if(item)item.done=!item.done;_pers(id);render(id);}
  function del(id,iid){_store[id]=load(id).filter(x=>x.id!==iid);_pers(id);render(id);}
  function render(cardId){
    const el=document.getElementById('pf-chk-'+cardId);if(!el)return;
    const items=load(cardId);const done=items.filter(x=>x.done).length;const pct=items.length?Math.round(done/items.length*100):0;
    const es=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
    el.innerHTML=`<div style="display:flex;justify-content:space-between;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--tx-3);letter-spacing:.4px;margin-bottom:8px">
        <span>✅ Checklist (${done}/${items.length})</span><span style="color:var(--ac)">${pct}%</span></div>
      ${items.length?`<div style="height:3px;background:var(--bg-3);border-radius:2px;margin-bottom:10px"><div style="height:100%;width:${pct}%;background:var(--green);border-radius:2px;transition:width .3s"></div></div>`:''}
      ${items.map(it=>`<div style="display:flex;align-items:center;gap:8px;padding:5px 2px">
        <input type="checkbox" ${it.done?'checked':''} onchange="PFChecklist.toggle('${es(cardId)}','${es(it.id)}')" style="cursor:pointer;accent-color:var(--green);width:15px;height:15px;flex-shrink:0">
        <span style="flex:1;font-size:13px;${it.done?'text-decoration:line-through;opacity:.5':''}">${es(it.text)}</span>
        <button onclick="PFChecklist.del('${es(cardId)}','${es(it.id)}')" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:12px;padding:2px 5px;opacity:.4" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.4">✕</button>
      </div>`).join('')}
      <div style="display:flex;gap:6px;margin-top:10px">
        <input type="text" id="chk-inp-${es(cardId)}" placeholder="Adicionar item..." style="flex:1;padding:6px 10px;background:var(--bg-1);border:1.5px solid var(--bd);border-radius:var(--r-s);font-size:12px;color:var(--tx-1);font-family:var(--font);outline:none"
          onfocus="this.style.borderColor='var(--ac)'" onblur="this.style.borderColor='var(--bd)'"
          onkeydown="if(event.key==='Enter'&&this.value.trim()){PFChecklist.add('${es(cardId)}',this.value);this.value='';event.preventDefault()}">
        <button class="btn-primary" style="font-size:12px;padding:6px 10px"
          onclick="const i=document.getElementById('chk-inp-${es(cardId)}');if(i&&i.value.trim()){PFChecklist.add('${es(cardId)}',i.value);i.value=''}">+</button>
      </div>`;
  }
  return{add,toggle,del,render,load};
})();

// ════════════════════════════════════════════════════════════
//  10. CAMPOS EXTRAS NO CARD EDIT (v9: solicitante, área, etc.)
// ════════════════════════════════════════════════════════════
(function(){
  function addNewCardFields(){
    const overlay=document.getElementById('new-card-overlay');
    if(!overlay||document.getElementById('v9-new-extras'))return;
    const body=overlay.querySelector('.modal-body');if(!body)return;
    const div=document.createElement('div');div.id='v9-new-extras';
    div.innerHTML=`<div style="margin:10px 0;padding:10px 12px;background:var(--bg-2);border-radius:var(--r-m);border:1px solid var(--bd)">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--tx-3);letter-spacing:.4px;margin-bottom:8px">📋 Dados da Solicitação</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        <div><label class="field-label" style="font-size:11px">Data solicitação</label><input class="field-input" id="new-req-date" type="date" style="font-size:12px"></div>
        <div><label class="field-label" style="font-size:11px">Solicitante</label><input class="field-input" id="new-requester" placeholder="Nome" style="font-size:12px"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        <div><label class="field-label" style="font-size:11px">Área</label>
          <select class="field-input" id="new-area" style="font-size:12px"><option value="">Selecione...</option>${['TI','Marketing','Comercial','Operações','RH','Financeiro','Produto','Design'].map(a=>`<option>${a}</option>`).join('')}</select></div>
        <div><label class="field-label" style="font-size:11px">Cliente</label><input class="field-input" id="new-client-name" placeholder="Cliente" style="font-size:12px"></div>
      </div>
      <div><label class="field-label" style="font-size:11px">Pessoas-chave</label><input class="field-input" id="new-key-people" placeholder="Stakeholders..." style="font-size:12px"></div>
    </div>`;
    const footer=body.querySelector('.modal-footer');if(footer)body.insertBefore(div,footer);else body.appendChild(div);
  }

  function refreshEditFields(cardId){
    const slot=document.getElementById('ce-details-v9-slot');if(slot)slot.innerHTML='';
    document.getElementById('v9-zip-btn')?.remove();
    if(!slot)return;
    const all=PFBoard.cards.length?PFBoard.cards:(window.mockCards||[]);
    const c=all.find(x=>x.id===cardId);if(!c)return;
    const _s=s=>String(s||'').replace(/"/g,'&quot;');

    const solDiv=document.createElement('div');solDiv.id='v9-edit-extras-'+cardId;
    solDiv.innerHTML=`<div style="margin:0 0 10px;padding:10px 12px;background:var(--bg-2);border-radius:var(--r-m);border:1px solid var(--bd)">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--tx-3);letter-spacing:.4px;margin-bottom:8px">📋 Dados da Solicitação</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        <div><label class="field-label" style="font-size:11px">Data solicitação</label><input class="field-input" id="ce-req-date" type="date" value="${_s(c.request_date)}" style="font-size:12px"></div>
        <div><label class="field-label" style="font-size:11px">Solicitante</label><input class="field-input" id="ce-requester" value="${_s(c.requester)}" placeholder="Nome" style="font-size:12px"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        <div><label class="field-label" style="font-size:11px">Área</label>
          <select class="field-input" id="ce-area" style="font-size:12px"><option value="">Selecione...</option>${['TI','Marketing','Comercial','Operações','RH','Financeiro','Produto','Design'].map(a=>`<option${c.area===a?' selected':''}>${a}</option>`).join('')}</select></div>
        <div><label class="field-label" style="font-size:11px">Cliente</label><input class="field-input" id="ce-client-name" value="${_s(c.client_name)}" placeholder="Cliente" style="font-size:12px"></div>
      </div>
      <div><label class="field-label" style="font-size:11px">Pessoas-chave</label><input class="field-input" id="ce-key-people" value="${_s(c.key_people)}" placeholder="Stakeholders..." style="font-size:12px"></div>
    </div>`;
    slot.appendChild(solDiv);

    const chkDiv=document.createElement('div');chkDiv.id='pf-chk-'+cardId;
    chkDiv.style.cssText='margin:0 0 10px;padding:10px 12px;background:var(--bg-2);border-radius:var(--r-m);border:1px solid var(--bd)';
    slot.appendChild(chkDiv);PFChecklist.render(cardId);

    const bpmn=c.bpmn||c.bpmn_status||'esbocar';
    if(bpmn==='concluido'){
      const footer=document.querySelector('#card-edit-overlay .modal-footer');
      if(footer&&!document.getElementById('v9-zip-btn')){
        const zipBtn=document.createElement('button');zipBtn.id='v9-zip-btn';zipBtn.className='btn-secondary';
        zipBtn.style.cssText='font-size:12px;margin-right:8px';zipBtn.innerHTML='📦 Exportar .ZIP';
        zipBtn.onclick=()=>exportTaskZip(cardId);footer.insertBefore(zipBtn,footer.firstChild);
      }
    }
  }

  const _origOpen=window.openCardEdit;
  window.openCardEdit=function(cardId){_origOpen&&_origOpen(cardId);setTimeout(()=>refreshEditFields(cardId),220);};

  const _origSave=window.saveCardEdit;
  window.saveCardEdit=async function(){
    const cardId=PF.activeCardId;
    if(cardId){const all=PFBoard.cards.length?PFBoard.cards:(window.mockCards||[]);const c=all.find(x=>x.id===cardId);
      if(c){const gv=id=>document.getElementById(id)?.value?.trim()||null;
        c.request_date=gv('ce-req-date');c.requester=gv('ce-requester');c.area=gv('ce-area');c.client_name=gv('ce-client-name');c.key_people=gv('ce-key-people');}}
    return _origSave&&_origSave();
  };

  const _origCreateCard=window.createCard;
  window.createCard=async function(){
    await _origCreateCard?.();
    const cards=PFBoard.cards.length?PFBoard.cards:(window.mockCards||[]);
    const c=cards[cards.length-1];
    if(c){const gv=id=>document.getElementById(id)?.value?.trim()||null;
      c.request_date=gv('new-req-date');c.requester=gv('new-requester');c.area=gv('new-area');c.client_name=gv('new-client-name');c.key_people=gv('new-key-people');}
  };

  document.addEventListener('DOMContentLoaded',()=>setTimeout(addNewCardFields,1200));
})();

// ════════════════════════════════════════════════════════════
//  11. ZIP EXPORT (v9 feature)
// ════════════════════════════════════════════════════════════
window.exportTaskZip=async function(cardId){
  const all=PFBoard.cards.length?PFBoard.cards:(window.mockCards||[]);
  const c=all.find(x=>x.id===cardId);if(!c){showToast('Tarefa não encontrada',true);return;}
  const proj=(window.mockProjects||[]).find(p=>p.id===(c.project_id||c.sl));
  const atts=window.AttachmentManager?AttachmentManager.getForCard(cardId):[];
  const chk=window.PFChecklist?PFChecklist.load(cardId):[];
  const kb=window.KBStore?KBStore.getBlocks(c.project_id||c.sl||'demo'):[];
  showToast('Preparando ZIP…');
  const _s=s=>String(s||'').replace(/</g,'&lt;');
  const docHtml=`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${_s(c.title)}</title>
    <style>body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;color:#1a1a18;line-height:1.7}
    h1{font-size:22px;font-weight:800}h2{font-size:14px;font-weight:700;color:#555;margin:18px 0 6px;border-bottom:1px solid #eee;padding-bottom:4px}
    table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:7px 10px;border:1px solid #eee}th{background:#f5f5f0;font-weight:700}
    .badge{display:inline-block;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:600;background:#d1fae5;color:#065f46}</style>
    </head><body><span class="badge">✅ Concluído</span><h1>${_s(c.title)}</h1>
    <p style="color:#888;font-size:12px">Projeto: <strong>${_s(proj?.name||'—')}</strong> · ${new Date().toLocaleString('pt-BR')}</p>
    ${c.requester||c.area?`<p>Solicitante: <strong>${_s(c.requester||'—')}</strong> · Área: <strong>${_s(c.area||'—')}</strong></p>`:''}
    ${c.client_name?`<p>Cliente: <strong>${_s(c.client_name)}</strong></p>`:''}
    <h2>Descrição</h2><p>${_s(c.description||c.desc||'—')}</p>
    <h2>Decisão Tomada</h2><p>${_s(c.doc_decision||'—')}</p>
    <h2>Artefatos</h2><p>${_s(c.doc_artifact||'—')}</p>
    <h2>Riscos</h2><p>${_s(c.doc_risk||'—')}</p>
    <h2>Notas</h2><p>${_s(c.doc_notes||'—')}</p>
    ${chk.length?`<h2>Checklist</h2><table><tr><th>Item</th><th>Status</th></tr>${chk.map(i=>`<tr><td>${_s(i.text)}</td><td>${i.done?'✅':'⬜'}</td></tr>`).join('')}</table>`:''}
    ${atts.length?`<h2>Anexos</h2><table><tr><th>Arquivo</th><th>Tipo</th></tr>${atts.map(a=>`<tr><td>${_s(a.name)}</td><td>${a.type}</td></tr>`).join('')}</table>`:''}
    </body></html>`;
  const manifest=JSON.stringify({tarefa:c.title,id:c.id,projeto:proj?.name||null,exportado_em:new Date().toISOString(),checklist:{total:chk.length,feitos:chk.filter(i=>i.done).length,items:chk},anexos:atts.map(a=>({nome:a.name,tipo:a.type}))},null,2);
  if(typeof JSZip==='undefined'){await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s);}).catch(()=>{});}
  if(typeof JSZip==='undefined'){const blob=new Blob([docHtml],{type:'text/html'});Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'documentacao.html'}).click();showToast('HTML exportado (JSZip indisponível)');return;}
  const zip=new JSZip();
  zip.file('manifest.json',manifest);zip.file('documentacao.html',docHtml);
  if(kb.length)zip.file('wiki.json',JSON.stringify(kb,null,2));
  atts.forEach(a=>{if(a.data)zip.file('anexos/'+a.name,a.data);});
  const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
  const name=((proj?.name||'projeto')+'_'+c.title.slice(0,20)).replace(/[^a-zA-Z0-9_\-]/g,'_')+'.zip';
  Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:name}).click();
  showToast('📦 ZIP exportado!');
};

// ════════════════════════════════════════════════════════════
//  12. RECORRÊNCIAS (v9 feature)
// ════════════════════════════════════════════════════════════
window.RecurrenceEngine=(function(){
  const KEY='pf_recur_v9';
  function load(){try{return JSON.parse(localStorage.getItem(KEY)||'[]');}catch{return[];}}
  function save(d){try{localStorage.setItem(KEY,JSON.stringify(d));}catch(e){}}
  function add(cfg){const items=load();items.push({id:'rec_'+Date.now(),...cfg,last_run:null});save(items);showToast('Recorrência salva!');}
  function remove(id){save(load().filter(x=>x.id!==id));showToast('Recorrência removida');}
  function run(){
    const items=load();if(!items.length)return;
    const now=new Date();
    const today=now.toISOString().split('T')[0];  // YYYY-MM-DD
    const dmap=['sun','mon','tue','wed','thu','fri','sat'];
    const todayKey=dmap[now.getDay()]; // ex: 'mon'
    let count=0;

    items.forEach(rec=>{
      // ── Verificar se deve rodar HOJE ─────────────────────
      let shouldRun=false;
      if(rec.schedule==='daily'){
        // Diário: last_run guarda a data — não roda 2x no mesmo dia
        shouldRun=(rec.last_run!==today);
      } else if(rec.schedule?.startsWith('weekly:')){
        // Semanal: verificar se hoje é um dos dias configurados
        const days=rec.schedule.replace('weekly:','').split(','); // ['mon','thu']
        if(days.includes(todayKey)){
          // last_runs é um objeto {mon:'2025-01-01', thu:'2025-01-02'}
          const lastRuns=rec.last_runs||{};
          shouldRun=(lastRuns[todayKey]!==today);
        }
      }
      if(!shouldRun)return;

      // ── Deduplicação: verificar se já existe tarefa recorrente igual hoje ─
      const allCards=PFBoard.cards.length?PFBoard.cards:(window.mockCards||[]);
      const dupTitle=rec.title+' — '+now.toLocaleDateString('pt-BR');
      const alreadyExists=allCards.some(c=>c.is_recurring&&c.title===dupTitle);
      if(alreadyExists)return;

      // ── Criar tarefa ──────────────────────────────────────
      const nc={
        id:'rc_'+Date.now()+'_'+Math.random().toString(36).slice(2,4),
        title:dupTitle,priority:rec.priority||'medium',
        bpmn:'esbocar',bpmn_status:'esbocar',
        column_id:'col-todo',col:'todo',
        project_id:PF.currentProject||PFBoard.projectId,
        is_recurring:true,position:0,
        created_at:now.toISOString(),
      };
      PFBoard.cards.length?PFBoard.cards.unshift(nc):(window.mockCards=window.mockCards||[],window.mockCards.unshift(nc));

      // ── Atualizar last_run por dia-da-semana ──────────────
      if(rec.schedule==='daily'){
        rec.last_run=today;
      } else {
        rec.last_runs=rec.last_runs||{};
        rec.last_runs[todayKey]=today;
      }
      count++;
    });

    save(items);
    if(count>0){renderBoard?.();showToast('🔄 '+count+' tarefa(s) recorrente(s) criada(s)!');}
  }
  function openManager(){
    const items=load();const w=document.createElement('div');w.className='overlay';w.style.cssText='display:flex!important;z-index:1100';
    w.innerHTML=`<div class="modal" onclick="event.stopPropagation()" style="max-width:460px">
      <div class="modal-hdr"><div class="modal-title">🔄 Tarefas Recorrentes</div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()"><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M2 2l10 10M12 2L2 12"/></svg></button></div>
      <div class="modal-body" style="padding:18px">
        <div style="padding:12px;background:var(--bg-2);border-radius:var(--r-m);border:1px solid var(--bd);margin-bottom:14px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--tx-3);margin-bottom:10px">+ Nova recorrência</div>
          <div class="field-row" style="margin-bottom:8px"><label class="field-label">Título</label><input class="field-input" id="rec-title" placeholder="Ex: Reunião semanal"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
            <div><label class="field-label">Frequência</label><select class="field-input" id="rec-sched"><option value="daily">Todo dia</option><option value="weekly:mon">Toda segunda</option><option value="weekly:tue">Toda terça</option><option value="weekly:wed">Toda quarta</option><option value="weekly:thu">Toda quinta</option><option value="weekly:fri">Toda sexta</option><option value="weekly:mon,thu">Seg e Qui</option><option value="weekly:tue,fri">Ter e Sex</option></select></div>
            <div><label class="field-label">Prioridade</label><select class="field-input" id="rec-pri"><option value="low">↓ Baixa</option><option value="medium" selected>⬝ Média</option><option value="high">↑ Alta</option></select></div>
          </div>
          <button class="btn-primary" style="width:100%" onclick="const t=document.getElementById('rec-title').value.trim();if(!t){showToast('Informe o título',true);return;}RecurrenceEngine.add({title:t,schedule:document.getElementById('rec-sched').value,priority:document.getElementById('rec-pri').value});this.closest('.overlay').remove();RecurrenceEngine.openManager();">✅ Salvar</button>
        </div>
        ${items.map(r=>`<div style="display:flex;align-items:center;gap:8px;padding:9px 10px;background:var(--bg-2);border-radius:var(--r-m);border:1px solid var(--bd);margin-bottom:6px"><div style="flex:1"><div style="font-size:13px;font-weight:600">${String(r.title).replace(/</g,'&lt;')}</div><div style="font-size:11px;color:var(--tx-3)">${r.schedule} · ${r.priority}</div></div><button onclick="RecurrenceEngine.remove('${r.id}');this.closest('.overlay').remove();RecurrenceEngine.openManager()" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:14px">🗑</button></div>`).join('')||'<p style="font-size:13px;color:var(--tx-3)">Nenhuma recorrência.</p>'}
      </div></div>`;
    document.body.appendChild(w);
  }
  document.addEventListener('DOMContentLoaded',()=>setTimeout(run,2500));
  return{add,run,remove,openManager};
})();
window.openRecurringManager=()=>RecurrenceEngine.openManager();

// ════════════════════════════════════════════════════════════
//  13. FILTROS KANBAN (v9 feature)
// ════════════════════════════════════════════════════════════
(function(){
  let built=false;
  function build(){
    if(built)return;
    const board=document.getElementById('kanban-board');if(!board)return;
    if(document.getElementById('kb-filter-wrap'))return;
    built=true;
    if(!document.getElementById('kb-filter-css')){
      const s=document.createElement('style');s.id='kb-filter-css';
      s.textContent=`#kb-filter-wrap{display:flex;align-items:center;gap:8px;padding:6px 20px;background:var(--bg-1);border-bottom:1px solid var(--bd);flex-shrink:0;position:relative;z-index:50}
        #kb-filter-dropdown{display:none;position:absolute;top:100%;left:20px;background:var(--bg-1);border:1.5px solid var(--bd);border-radius:var(--r-l);padding:12px 14px;box-shadow:0 8px 24px rgba(0,0,0,.18);z-index:200;min-width:460px;flex-wrap:wrap;gap:8px;align-items:flex-end}
        #kb-filter-dropdown.open{display:flex}
        .kb-filter-btn{display:flex;align-items:center;gap:5px;padding:5px 12px;border-radius:var(--r-f);font-size:12px;font-weight:600;background:var(--bg-2);border:1.5px solid var(--bd);color:var(--tx-2);cursor:pointer;transition:all .15s}
        .kb-filter-btn:hover{background:var(--bg-3);color:var(--tx-1)}.kb-filter-btn.active{background:var(--ac-bg);border-color:var(--ac);color:var(--ac)}`;
      document.head.appendChild(s);
    }
    const wrap=document.createElement('div');wrap.id='kb-filter-wrap';
    wrap.innerHTML=`<button class="kb-filter-btn" id="kb-filter-toggle" onclick="toggleKanbanFilters()" title="Filtros">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M1 3h11M3 6.5h7M5 10h3"/></svg>
        Filtros<span id="kb-filter-count" style="display:none;background:var(--ac);color:#fff;border-radius:20px;font-size:10px;padding:1px 6px;margin-left:2px">0</span></button>
      <button class="kb-filter-btn" onclick="openRecurringManager()">🔄 Recorrentes</button>
      <button class="kb-filter-btn" onclick="openMemberManager()">👤 Equipe</button>
      <div id="kb-filter-dropdown">
        <div style="width:100%;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--tx-3);margin-bottom:4px">Filtrar tarefas</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end">
          <div><label style="display:block;font-size:10px;font-weight:700;color:var(--tx-3);margin-bottom:3px">Área</label>
            <select id="kbf-area" class="field-input" style="font-size:12px;padding:4px 8px" onchange="applyKanbanFilters()"><option value="">Todas</option>${['TI','Marketing','Comercial','Operações','RH','Financeiro','Produto','Design'].map(a=>`<option>${a}</option>`).join('')}</select></div>
          <div><label style="display:block;font-size:10px;font-weight:700;color:var(--tx-3);margin-bottom:3px">Responsável</label>
            <select id="kbf-assign" class="field-input" style="font-size:12px;padding:4px 8px" onchange="applyKanbanFilters()"><option value="">Todos</option></select></div>
          <div><label style="display:block;font-size:10px;font-weight:700;color:var(--tx-3);margin-bottom:3px">Criticidade</label>
            <select id="kbf-pri" class="field-input" style="font-size:12px;padding:4px 8px" onchange="applyKanbanFilters()"><option value="">Todas</option><option value="critical">🔴 Crítica</option><option value="high">↑ Alta</option><option value="medium">⬝ Média</option><option value="low">↓ Baixa</option></select></div>
          <button class="kb-filter-btn" onclick="clearKanbanFilters()" style="padding:5px 10px">✕ Limpar</button>
        </div></div>`;
    const toolbar=document.getElementById('view-kanban')?.querySelector('.kanban-toolbar');
    if(toolbar&&toolbar.nextSibling)toolbar.parentNode.insertBefore(wrap,toolbar.nextSibling);
    else board.parentElement.insertBefore(wrap,board);
    _popAssign();
    document.addEventListener('click',e=>{const wr=document.getElementById('kb-filter-wrap');if(wr&&!wr.contains(e.target)){document.getElementById('kb-filter-dropdown')?.classList.remove('open');document.getElementById('kb-filter-toggle')?.classList.remove('active');}});
  }
  function _popAssign(){const sel=document.getElementById('kbf-assign');if(!sel)return;const cur=[...sel.options].map(o=>o.value).filter(Boolean);(window.mockTeam||[]).forEach(m=>{if(!cur.includes(m.id)){const o=new Option(m.name,m.id);sel.add(o);}});}
  window.toggleKanbanFilters=function(){const dd=document.getElementById('kb-filter-dropdown');const btn=document.getElementById('kb-filter-toggle');if(dd){dd.classList.toggle('open');btn?.classList.toggle('active');}};
  window.applyKanbanFilters=function(){
    const area=document.getElementById('kbf-area')?.value||'',asgn=document.getElementById('kbf-assign')?.value||'',pri=document.getElementById('kbf-pri')?.value||'';
    const all=PFBoard.cards.length?PFBoard.cards:(window.mockCards||[]);
    document.querySelectorAll('.kcard').forEach(card=>{const c=all.find(x=>x.id===card.dataset.cardId);let show=true;
      if(c){if(area&&(c.area||'')!==area)show=false;if(asgn&&(c.assignee||c.assigned_to||'')!==asgn)show=false;if(pri&&(c.priority||'medium')!==pri)show=false;}
      card.style.display=show?'':'none';});
    _updateFilterCount();
  };
  window.clearKanbanFilters=function(){['kbf-area','kbf-assign','kbf-pri'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});document.querySelectorAll('.kcard').forEach(c=>c.style.display='');_updateFilterCount();};
  function _updateFilterCount(){const area=document.getElementById('kbf-area')?.value||'';const asgn=document.getElementById('kbf-assign')?.value||'';const pri=document.getElementById('kbf-pri')?.value||'';const count=[area,asgn,pri].filter(Boolean).length;const cnt=document.getElementById('kb-filter-count');const btn=document.getElementById('kb-filter-toggle');if(cnt){cnt.style.display=count?'':'none';cnt.textContent=count;}if(btn)btn.classList.toggle('active',count>0);}
  const _sw=window.switchView;
  window.switchView=function(name,btn){_sw&&_sw(name,btn);if(name==='kanban')setTimeout(build,400);};
  document.addEventListener('DOMContentLoaded',()=>setTimeout(build,1800));
})();

// ════════════════════════════════════════════════════════════
//  14. MEMBER MANAGER (v9 feature)
// ════════════════════════════════════════════════════════════
window.openMemberManager=function(){
  const team=window.mockTeam||[];const w=document.createElement('div');w.className='overlay';w.style.cssText='display:flex!important;z-index:1100';
  w.innerHTML=`<div class="modal" onclick="event.stopPropagation()" style="max-width:460px">
    <div class="modal-hdr"><div class="modal-title">👤 Gerenciar Equipe</div>
      <button class="modal-close" onclick="this.closest('.overlay').remove()"><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M2 2l10 10M12 2L2 12"/></svg></button></div>
    <div class="modal-body" style="padding:18px">
      <div style="padding:12px;background:var(--bg-2);border-radius:var(--r-m);border:1px solid var(--bd);margin-bottom:14px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--tx-3);margin-bottom:10px">+ Novo Membro</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <div><label class="field-label">Nome *</label><input class="field-input" id="mem-name" placeholder="Nome completo"></div>
          <div><label class="field-label">Email</label><input class="field-input" id="mem-email" type="email"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr auto;gap:8px;margin-bottom:10px">
          <div><label class="field-label">Função</label><input class="field-input" id="mem-role" placeholder="Ex: Designer"></div>
          <div><label class="field-label">Cor</label><input type="color" class="field-input" id="mem-color" value="#6c5ce7" style="height:38px;padding:3px;width:50px"></div>
        </div>
        <button class="btn-primary" style="width:100%" onclick="addTeamMember();this.closest('.overlay').remove();openMemberManager()">Adicionar</button>
      </div>
      ${team.map(m=>`<div style="display:flex;align-items:center;gap:10px;padding:9px 10px;background:var(--bg-2);border-radius:var(--r-m);border:1px solid var(--bd);margin-bottom:6px">
        <div style="width:32px;height:32px;border-radius:50%;background:${m.color||'var(--ac)'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0">${m.initials||'?'}</div>
        <div style="flex:1"><div style="font-size:13px;font-weight:600">${m.name}</div><div style="font-size:11px;color:var(--tx-3)">${m.email||m.role||'—'}</div></div>
      </div>`).join('')||'<p style="font-size:13px;color:var(--tx-3)">Nenhum membro cadastrado.</p>'}
    </div></div>`;
  document.body.appendChild(w);
};
window.addTeamMember=function(){
  const name=document.getElementById('mem-name')?.value.trim();if(!name){showToast('Nome obrigatório',true);return;}
  const initials=name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
  const m={id:'mem_'+Date.now(),name,email:document.getElementById('mem-email')?.value.trim()||'',role:document.getElementById('mem-role')?.value.trim()||'',color:document.getElementById('mem-color')?.value||'#6c5ce7',initials};
  window.mockTeam=window.mockTeam||[];window.mockTeam.push(m);showToast(`Membro "${name}" adicionado!`);
};

// ════════════════════════════════════════════════════════════
//  15. DIAGRAMA — FIX: usa DiagramEngineV9, evita tela preta,
//      salva com SELECT+UPDATE/INSERT (não upsert com constraint)
// ════════════════════════════════════════════════════════════
window.initDiagramView=async function(){
  const pid=PF.currentProject||(window.mockProjects?.[0]?.id)||null;
  if(!pid){showToast('Selecione um projeto no Kanban antes de abrir os Diagramas',true);return;}
  const badge=document.getElementById('diagram-project-badge');
  const proj=(window.mockProjects||[]).find(p=>p.id===pid);
  if(badge)badge.textContent=proj?proj.name+' — Editor Fabric.js':'Editor de Diagramas';
  // Destrói canvas anterior para evitar tela preta
  const old=document.getElementById('dgv9-root');
  if(old){
    try{if(window.DiagramEngineV9?.canvas){window.DiagramEngineV9.canvas.dispose?.();}}catch(e){}
    old.remove();
  }
  const es=document.getElementById('dg-empty-state');if(es)es.style.display='none';
  if(window.DiagramEngineV9)await DiagramEngineV9.init('dg-container',pid);
};
window.regenDiagram=async function(){
  const pid=PF.currentProject||(window.mockProjects?.[0]?.id)||null;
  if(!pid){showToast('Selecione um projeto primeiro',true);return;}
  await window.initDiagramView();
  const cards=PFBoard.cards.length?PFBoard.cards:(window.mockCards||[]).filter(c=>(c.project_id||c.sl)===pid);
  if(window.DiagramEngineV9)DiagramEngineV9.generateFromProject(pid,cards);
};

// ════════════════════════════════════════════════════════════
//  16. WIKI V9 — save to Supabase + toast correto
// ════════════════════════════════════════════════════════════
window.initWikiView=function(){
  const pid=PF.currentProject||(window.mockProjects?.[0]?.id);
  const proj=(window.mockProjects||[]).find(p=>p.id===pid)||{name:pid};
  const sub=document.getElementById('wiki-project-sub');if(sub)sub.textContent='Wiki · '+proj.name;
  if(window.KnowledgeBase)KnowledgeBase.render('kb-container',pid);
};
document.addEventListener('DOMContentLoaded',function(){
  if(!window.KnowledgeBase)return;
  const _origR=KnowledgeBase.render?.bind(KnowledgeBase);
  if(!_origR)return;
  KnowledgeBase.render=function(cid,pid){
    if(!pid){const el=document.getElementById(cid);if(el)el.innerHTML='<div style="padding:40px;text-align:center;color:var(--tx-3)"><div style="font-size:32px;margin-bottom:12px">🔗</div><p style="font-size:15px;font-weight:700;color:var(--tx-2);margin-bottom:8px">Selecione um Projeto</p></div>';return;}
    _origR(cid,pid);
    const cont=document.getElementById(cid);if(!cont||cont.querySelector('.kb-trace-bar'))return;
    const proj=(window.mockProjects||[]).find(p=>p.id===pid);
    const bar=document.createElement('div');bar.className='kb-trace-bar';
    bar.style.cssText='padding:6px 16px;background:var(--ac-bg);border-bottom:1px solid var(--bd);font-size:12px;color:var(--ac);display:flex;align-items:center;justify-content:space-between;flex-shrink:0';
    bar.innerHTML=`<span>🔗 Wiki: <strong>${proj?.name||pid}</strong></span><button class="btn-secondary" style="font-size:11px;padding:3px 10px" onclick="KBV9.saveToSupabase('${pid}')">💾 Salvar no Supabase</button>`;
    cont.insertBefore(bar,cont.firstChild);
  };
});
window.KBV9={
  async saveToSupabase(pid){
    const blocks=window.KBStore?KBStore.getBlocks(pid):[];
    if(!PF.supabase||PF.demoMode){showToast('Modo demo — salvo localmente');return;}
    try{
      await PF.supabase.from('knowledge_blocks').delete().eq('project_id',pid);
      const rows=blocks.map((b,i)=>({project_id:pid,type:b.type,position:i,content:b.content||null,icon:b.icon||null,is_open:b.open!==false,table_data:{headers:b.headers||[],rows:b.rows||[]},task_id:b.task_id||null}));
      if(rows.length)await PF.supabase.from('knowledge_blocks').insert(rows);
      showToast('Wiki salva no Supabase!');
    }catch(e){showToast('Erro ao salvar: '+e.message,true);}
  },
};

// ════════════════════════════════════════════════════════════
//  17. DOC IA e outras views
// ════════════════════════════════════════════════════════════
window.initAIDocView=function(){
  const pid=PF.currentProject||(window.mockProjects?.[0]?.id);
  if(window.AIDocPanel)AIDocPanel.render('ai-doc-container',pid);
};
window.initDocView=function(){if(typeof renderDocDatabase==='function')renderDocDatabase();};

// ════════════════════════════════════════════════════════════
//  18. TEAM VIEW
// ════════════════════════════════════════════════════════════
window.renderTeam=function(){
  const grid=document.getElementById('team-grid');if(!grid)return;
  const team=window.mockTeam||[];
  const cards=PFBoard.cards.length?PFBoard.cards:(window.mockCards||[]);
  grid.innerHTML=team.map(m=>{const n=cards.filter(c=>(c.assignee||c.assigned_to)===m.id).length;
    return`<div class="team-card"><div class="team-avatar" style="background:${m.color}">${m.initials}</div><div class="team-name">${_safeEsc(m.name)}</div><div class="team-role">${_safeEsc(m.role)}</div><div class="team-tasks">${n} tarefa${n!==1?'s':''}</div></div>`;
  }).join('')||'<p style="font-size:13px;color:var(--tx-3);grid-column:1/-1">Nenhum membro na equipe.</p>';
};

// ════════════════════════════════════════════════════════════
//  19. DOC DATABASE
// ════════════════════════════════════════════════════════════
window.DocDatabase={
  _recs:[],
  rebuild(){
    this._recs=[];const projs=window.mockProjects||[];
    const allCards=PFBoard.cards.length?PFBoard.cards:(window.mockCards||[]);
    const team=window.mockTeam||[];
    projs.forEach(proj=>{
      const pCards=allCards.filter(c=>c.sl===proj.id||c.project_id===proj.id);
      pCards.forEach(card=>{
        const bpmn=card.bpmn||card.bpmn_status||'esbocar';
        const assignee=team.find(m=>m.id===(card.assignee||card.assigned_to));
        const priL={low:'Baixa',medium:'Média',high:'Alta',critical:'Crítica'};
        const fields=[
          {s:'Identificação',f:'Título',v:card.title},{s:'Identificação',f:'Status BPMN',v:(BPMN_LABEL||{})[bpmn]||bpmn},
          {s:'Identificação',f:'Prioridade',v:priL[card.priority||'medium']},
          {s:'Execução',f:'Responsável',v:assignee?.name||null},{s:'Execução',f:'Data de entrega',v:card.due_date||card.date||null},
          {s:'Execução',f:'Horas estimadas',v:card.estimated_hours?card.estimated_hours+'h':null},
          {s:'Execução',f:'Orçamento',v:card.budget?'R$ '+Number(card.budget).toLocaleString('pt-BR'):null},
          {s:'Descrição',f:'Descrição',v:card.description||card.desc||null},{s:'Descrição',f:'Critérios',v:card.acceptance_criteria||null},
          {s:'Documentação',f:'Decisão tomada',v:card.doc_decision||null},{s:'Documentação',f:'Artefato gerado',v:card.doc_artifact||null},
          {s:'Documentação',f:'Riscos',v:card.doc_risk||null},{s:'Documentação',f:'Notas',v:card.doc_notes||null},
        ].filter(x=>x.v&&String(x.v).trim());
        if(!fields.length)return;
        fields.forEach(fld=>this._recs.push({id:card.id+'_'+fld.f.replace(/\s/g,'_'),projectId:proj.id,projectName:proj.name,color:proj.color,cardId:card.id,cardTitle:card.title,bpmn,priority:card.priority||'medium',section:fld.s,field:fld.f,value:String(fld.v)}));
      });
    });return this._recs;
  },
  filter({projectId,section,bpmn,search}={}){
    return this._recs.filter(r=>{
      if(projectId&&projectId!=='all'&&r.projectId!==projectId)return false;
      if(section&&section!=='all'&&r.section!==section)return false;
      if(bpmn&&bpmn!=='all'&&r.bpmn!==bpmn)return false;
      if(search){const sl=search.toLowerCase();if(!r.cardTitle.toLowerCase().includes(sl)&&!r.value.toLowerCase().includes(sl))return false;}
      return true;
    });
  },
  getProjects(){const seen=new Set();return this._recs.filter(r=>{if(seen.has(r.projectId))return false;seen.add(r.projectId);return true;}).map(r=>({id:r.projectId,name:r.projectName,color:r.color}));},
  render(filters){
    this.rebuild();const recs=this.filter(filters);const el=document.getElementById('doc-db-content');if(!el)return;
    const cnt=document.getElementById('doc-record-count');
    if(!recs.length){el.innerHTML='<div style="text-align:center;padding:60px;color:var(--tx-3)"><div style="font-size:32px;margin-bottom:12px;opacity:.3">📋</div><p style="font-size:14px;font-weight:700;color:var(--tx-2);margin-bottom:8px">Nenhum registro</p><p style="font-size:13px;line-height:1.7">Preencha os campos de Documentação nas tarefas.</p></div>';if(cnt)cnt.textContent='0 registros';return;}
    const grouped={};recs.forEach(r=>{const k=r.projectId+'_'+r.cardId;if(!grouped[k])grouped[k]={projectId:r.projectId,projectName:r.projectName,color:r.color,cardId:r.cardId,cardTitle:r.cardTitle,bpmn:r.bpmn,priority:r.priority,fields:[]};grouped[k].fields.push({s:r.section,f:r.field,v:r.value});});
    const byProj={};Object.values(grouped).forEach(g=>{if(!byProj[g.projectId])byProj[g.projectId]={id:g.projectId,name:g.projectName,color:g.color,cards:[]};byProj[g.projectId].cards.push(g);});
    const SECS=['Identificação','Execução','Descrição','Documentação'];
    const bColors={esbocar:'var(--tx-3)',viabilizar:'var(--tx-3)',atribuir:'var(--purple)',executar:'var(--yellow)',avaliar:'var(--blue)',corrigir:'var(--red)',validar_cliente:'var(--blue)',concluido:'var(--green)'};
    let html='';
    Object.values(byProj).forEach(proj=>{
      html+=`<div class="doc-proj-section"><div class="doc-proj-header" style="border-left:4px solid ${proj.color}"><div style="flex:1"><div class="doc-proj-name">${_safeEsc(proj.name)}</div><div class="doc-proj-meta">${proj.cards.length} tarefa(s) com documentação</div></div></div>`;
      proj.cards.forEach(g=>{
        const bc=bColors[g.bpmn]||'var(--tx-3)';
        html+=`<div class="doc-card"><div class="doc-card-hdr" style="border-left:3px solid ${proj.color}"><div style="flex:1"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><span style="font-size:11px;font-weight:700;color:${bc}">${(BPMN_LABEL||{})[g.bpmn]||g.bpmn}</span></div><div class="doc-card-title">${_safeEsc(g.cardTitle)}</div></div><button class="doc-edit-btn" onclick="openCardEdit('${g.cardId}')">✏️ Editar</button></div><div class="doc-card-body">`;
        SECS.forEach(sec=>{const fs=g.fields.filter(x=>x.s===sec);if(!fs.length)return;html+=`<div class="doc-sec"><div class="doc-sec-title">${sec}</div>`;fs.forEach(x=>{html+=`<div class="doc-frow"><span class="doc-fname">${_safeEsc(x.f)}</span><span class="doc-fval">${_safeEsc(x.v)}</span></div>`;});html+='</div>';});
        html+='</div></div>';
      });html+='</div>';
    });
    el.innerHTML=html;if(cnt){const cc=new Set(recs.map(r=>r.cardId)).size;cnt.textContent=recs.length+' registros · '+cc+' tarefas';}
  },
};
window.renderDocDatabase=function(){
  DocDatabase.rebuild();const fe=document.getElementById('doc-filter-project');
  if(fe){while(fe.options.length>1)fe.remove(1);DocDatabase.getProjects().forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;fe.appendChild(o);});}
  applyDocFilters();
};
window.applyDocFilters=function(){DocDatabase.render({projectId:document.getElementById('doc-filter-project')?.value||'all',section:document.getElementById('doc-filter-section')?.value||'all',bpmn:document.getElementById('doc-filter-bpmn')?.value||'all',search:document.getElementById('doc-filter-search')?.value||''});};
window.exportDocPDF=function(){DocDatabase.render({});showToast('Use Ctrl+P para imprimir como PDF');};

// ════════════════════════════════════════════════════════════
//  20. PROXY IA (OpenAI/Anthropic via Edge Function)
// ════════════════════════════════════════════════════════════
(function installProxy(){
  function _proxyUrl(){const base=PF.supabase?.supabaseUrl||localStorage.getItem('pf_sb_url')||'';return base?base.replace(/\/$/,'')+'/functions/v1/claude-proxy':null;}
  function _key(){return PF.supabase?.supabaseKey||localStorage.getItem('pf_sb_key')||'';}
  window._callClaudeViaProxy=async function(sys,msg,maxTok){
    const url=_proxyUrl();if(!url)throw new Error('PROXY_NOT_CONFIGURED');
    // Verifica se há AI key configurada localmente (campo cfg-ai-key)
    const localAiKey=localStorage.getItem('pf_ai_key')||'';
    const session=PF.supabase?(await PF.supabase.auth.getSession())?.data?.session:null;
    const headers={'Content-Type':'application/json','apikey':_key()};
    if(session?.access_token)headers['Authorization']='Bearer '+session.access_token;
    if(localAiKey)headers['x-ai-key']=localAiKey; // enviada para o proxy identificar usuário
    const res=await fetch(url,{method:'POST',headers,body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:maxTok||2000,system:sys,messages:[{role:'user',content:msg}]})});
    if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e?.error?.message||'HTTP '+res.status);}
    const data=await res.json();
    return data?.choices?.[0]?.message?.content||(data?.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('')||'';
  };
  const _orig=window._callClaude;
  window._callClaude=async function(sys,msg){
    try{return await window._callClaudeViaProxy(sys,msg,2000);}catch(e){
      if(e.message!=='PROXY_NOT_CONFIGURED')console.warn('[AI Proxy]',e.message);
      if(typeof _orig==='function')return _orig(sys,msg);return'{}';
    }
  };
})();

// ════════════════════════════════════════════════════════════
//  21. CSS utilitários
// ════════════════════════════════════════════════════════════
(function(){
  if(document.getElementById('pf-app-css'))return;
  const s=document.createElement('style');s.id='pf-app-css';
  s.textContent=`
.att-drop-zone{border:2px dashed var(--bd);border-radius:var(--r-l);padding:24px;text-align:center;transition:border-color var(--t),background var(--t);background:var(--bg-2);cursor:pointer;}
.att-hover{border-color:var(--ac)!important;background:var(--ac-bg)!important;}
.att-drop-inner{display:flex;flex-direction:column;align-items:center;gap:4px;}
.doc-proj-section{margin-bottom:28px;}.doc-proj-header{display:flex;align-items:center;gap:14px;padding:14px 18px;background:var(--bg-2);border:1px solid var(--bd);border-radius:var(--r-m);margin-bottom:10px;}
.doc-proj-name{font-size:16px;font-weight:800;color:var(--tx-1);}.doc-proj-meta{font-size:12px;color:var(--tx-3);margin-top:2px;}
.doc-card{background:var(--bg-1);border:1px solid var(--bd);border-radius:var(--r-m);margin-bottom:10px;overflow:hidden;}
.doc-card-hdr{display:flex;align-items:flex-start;gap:12px;padding:12px 16px;background:var(--bg-2);border-bottom:1px solid var(--bd);}
.doc-card-title{font-size:14px;font-weight:700;color:var(--tx-1);}.doc-card-body{padding:12px 16px;}
.doc-edit-btn{background:none;border:1px solid var(--bd);cursor:pointer;padding:4px 10px;border-radius:var(--r-s);font-size:11px;color:var(--tx-2);transition:all var(--t);font-family:var(--font);flex-shrink:0;}
.doc-edit-btn:hover{background:var(--bg-3);}
.doc-sec{margin-bottom:10px;}.doc-sec-title{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--tx-3);margin-bottom:5px;border-bottom:1px solid var(--bg-3);padding-bottom:3px;}
.doc-frow{display:flex;gap:12px;padding:4px 0;border-bottom:1px solid var(--bg-2);}.doc-frow:last-child{border:none;}
.doc-fname{min-width:150px;font-size:12px;color:var(--tx-3);flex-shrink:0;}.doc-fval{flex:1;font-size:12px;color:var(--tx-1);line-height:1.5;word-break:break-word;}
.team-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;padding:20px;}
.team-card{background:var(--bg-1);border:1px solid var(--bd);border-radius:var(--r-xl);padding:20px;text-align:center;transition:box-shadow var(--t);}
.team-card:hover{box-shadow:var(--sh-2);}
.team-avatar{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff;margin:0 auto 10px;}
.team-name{font-size:14px;font-weight:700;color:var(--tx-1);}.team-role{font-size:12px;color:var(--tx-3);margin:2px 0 8px;}.team-tasks{font-size:11px;font-weight:700;color:var(--ac);}
.pf-bpmn-flow{display:flex;align-items:center;flex-wrap:wrap;gap:4px;}
.pf-bpmn-step{display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;padding:8px 6px;border-radius:var(--r-s);border:1px solid transparent;transition:all var(--t);min-width:64px;}
.pf-bpmn-step:hover{background:var(--bg-2);}.pf-bpmn-step.active{border-color:var(--ac);background:var(--ac-bg);}
.pf-bpmn-step.done .pf-bpmn-dot{background:var(--green)!important;}.pf-bpmn-step.next .pf-bpmn-dot{background:var(--yellow)!important;}
.pf-bpmn-dot{width:12px;height:12px;border-radius:50%;background:var(--bg-4);border:2px solid var(--bd);transition:background var(--t);}
.pf-bpmn-step.active .pf-bpmn-dot{background:var(--ac)!important;border-color:var(--ac)!important;}
.pf-bpmn-lbl{font-size:10px;font-weight:600;color:var(--tx-3);text-align:center;line-height:1.2;}
.pf-bpmn-step.active .pf-bpmn-lbl{color:var(--ac);}
.pf-bpmn-line{width:16px;height:2px;background:var(--bd);flex-shrink:0;margin-top:-14px;}
.pf-hist-item{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--bg-2);}.pf-hist-item:last-child{border:none;}
.pf-hist-icon{font-size:16px;flex-shrink:0;}.pf-hist-body{flex:1;min-width:0;}
.pf-hist-text{font-size:12.5px;color:var(--tx-1);line-height:1.4;}.pf-hist-time{font-size:11px;color:var(--tx-3);margin-top:2px;}
.pf-hist-old{color:var(--red);}.pf-hist-new{color:var(--green);}
.pf-hist-loading,.pf-hist-empty{font-size:12px;color:var(--tx-3);padding:8px 0;}
  `;
  document.head.appendChild(s);
})();

// ════════════════════════════════════════════════════════════
//  22. DOMContentLoaded bootstrap
// ════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded',function(){
  _updateConnBadge();_emptySidebar();
  if(window.PFModal?.mount)PFModal.mount();
  // Alias _supabase para diagrama.js e outros que usam window._supabase
  Object.defineProperty(window,'_supabase',{get:()=>PF.supabase,configurable:true});
});
