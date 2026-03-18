// ============================================================
//  ProjectFlow V9 — pf-v9-core.js  (FIXED BUILD)
// ============================================================
'use strict';

// SEÇÃO 1 — TOAST V9
(function () {
  if (document.getElementById('pf-toast-stack')) return;
  const CSS = `
    #pf-toast-stack{position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column-reverse;gap:8px;pointer-events:none}
    .pft{display:flex;align-items:center;gap:10px;padding:11px 15px;min-width:220px;max-width:360px;
      background:var(--bg-1,#fff);border:1.5px solid var(--bd,#e4e4e0);border-radius:12px;
      box-shadow:0 8px 28px rgba(0,0,0,.15);font-size:13px;font-weight:600;color:var(--tx-1,#1a1a18);
      pointer-events:auto;cursor:pointer;animation:pftIn .25s cubic-bezier(.34,1.56,.64,1)}
    .pft.out{animation:pftOut .2s ease-in forwards}
    .pft.ok,.pft.success{border-color:var(--green,#1a9e5f);background:var(--green-bg,#ecfdf5);color:var(--green,#1a9e5f)}
    .pft.err,.pft.error{border-color:var(--red,#dc2626);background:var(--red-bg,#fef2f2);color:var(--red,#dc2626)}
    .pft.warn{border-color:#c48a0a;background:#fffbeb;color:#92400e}
    .pft-icon{font-size:15px;flex-shrink:0}.pft-msg{flex:1;line-height:1.4}
    .pft-x{opacity:.35;font-size:12px;flex-shrink:0;transition:opacity .12s}.pft-x:hover{opacity:1}
    @keyframes pftIn{from{opacity:0;transform:translateX(40px) scale(.92)}to{opacity:1;transform:none}}
    @keyframes pftOut{to{opacity:0;transform:translateX(40px) scale(.86)}}`;
  const sty=document.createElement('style');sty.textContent=CSS;document.head.appendChild(sty);
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

// SEÇÃO 2 — DASHBOARD V9
window.renderDashboard=function(){
  const el=document.getElementById('dashboard-content');if(!el)return;
  const allCards=PFBoard.cards.length?PFBoard.cards:(window.mockCards||[]);
  const allProjects=window.mockProjects||[];const team=window.mockTeam||[];
  const cols=PFBoard.columns.length?PFBoard.columns:(typeof initDefaultColumns==='function'?initDefaultColumns():[]);
  const _e=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const g=id=>document.getElementById(id)?.value||'';
  const fP=g('dash-f-proj'),fS=g('dash-f-status'),fPr=g('dash-f-pri'),fA=g('dash-f-assign'),fC=g('dash-f-client'),fD1=g('dash-f-d1'),fD2=g('dash-f-d2');
  let cards=[...allCards];
  if(fP&&fP!=='all')cards=cards.filter(c=>(c.project_id||c.sl)===fP);
  if(fPr&&fPr!=='all')cards=cards.filter(c=>(c.priority||'medium')===fPr);
  if(fA&&fA!=='all')cards=cards.filter(c=>(c.assignee||c.assigned_to||'')===fA);
  if(fC&&fC!=='all')cards=cards.filter(c=>{const p=allProjects.find(p=>p.id===(c.project_id||c.sl));return(p?.client_name||p?.client||'')===fC;});
  if(fS==='active')cards=cards.filter(c=>['executar','avaliar','corrigir','validar_cliente'].includes(c.bpmn||c.bpmn_status));
  else if(fS&&fS!=='all')cards=cards.filter(c=>(c.bpmn||c.bpmn_status)===fS);
  if(fD1)cards=cards.filter(c=>(c.due_date||c.date||'')>=fD1);
  if(fD2)cards=cards.filter(c=>(c.due_date||c.date||'')<=fD2);
  const total=cards.length,done=cards.filter(c=>(c.bpmn||c.bpmn_status)==='concluido').length;
  const inExec=cards.filter(c=>(c.bpmn||c.bpmn_status)==='executar').length;
  const inRev=cards.filter(c=>['avaliar','corrigir','validar_cliente'].includes(c.bpmn||c.bpmn_status)).length;
  const overdue=cards.filter(c=>{const d=c.due_date||c.date;return d&&(c.bpmn||c.bpmn_status)!=='concluido'&&new Date(d)<new Date();}).length;
  const pct=total?Math.round(done/total*100):0;
  const byPri={critical:0,high:0,medium:0,low:0};cards.forEach(c=>{byPri[c.priority||'medium']=(byPri[c.priority||'medium']||0)+1;});
  const clients=[...new Set(allProjects.map(p=>p.client_name||p.client||'').filter(Boolean))];
  const mkSel=(id,lbl,def,opts,cur)=>`<div><label style="display:block;font-size:10px;font-weight:700;color:var(--tx-3);margin-bottom:3px">${lbl}</label>
    <select id="${id}" class="field-input" style="font-size:12px;padding:5px 8px" onchange="renderDashboard()">
      ${opts.map(o=>`<option value="${o.v}"${(cur===o.v||(!cur&&o.v===def))?'selected':''}>${o.l}</option>`).join('')}</select></div>`;
  el.innerHTML=`<div style="max-width:1280px" id="dash-print-zone">
    <div style="background:var(--bg-1);border:1px solid var(--bd);border-radius:var(--r-xl);padding:14px 18px;margin-bottom:18px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--tx-3);margin-bottom:10px">🔍 Filtros</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end">
        ${mkSel('dash-f-proj','Projeto','all',[{v:'all',l:'Todos'},...allProjects.map(p=>({v:p.id,l:p.name}))],fP)}
        ${mkSel('dash-f-status','Status','all',[{v:'all',l:'Todos'},{v:'active',l:'⚡ Ativas'},{v:'executar',l:'Executar'},{v:'avaliar',l:'Avaliar'},{v:'concluido',l:'Concluído'}],fS)}
        ${mkSel('dash-f-pri','Prioridade','all',[{v:'all',l:'Todas'},{v:'critical',l:'🔴 Crítica'},{v:'high',l:'↑ Alta'},{v:'medium',l:'⬝ Média'},{v:'low',l:'↓ Baixa'}],fPr)}
        ${mkSel('dash-f-assign','Responsável','all',[{v:'all',l:'Todos'},...team.map(m=>({v:m.id,l:m.name}))],fA)}
        ${mkSel('dash-f-client','Cliente','all',[{v:'all',l:'Todos'},...clients.map(c=>({v:c,l:c}))],fC)}
        <div><label style="display:block;font-size:10px;font-weight:700;color:var(--tx-3);margin-bottom:3px">De</label><input type="date" id="dash-f-d1" class="field-input" value="${fD1}" style="font-size:12px;padding:5px 8px" onchange="renderDashboard()"></div>
        <div><label style="display:block;font-size:10px;font-weight:700;color:var(--tx-3);margin-bottom:3px">Até</label><input type="date" id="dash-f-d2" class="field-input" value="${fD2}" style="font-size:12px;padding:5px 8px" onchange="renderDashboard()"></div>
        <button class="btn-secondary" onclick="clearDashFilters()" style="font-size:12px;padding:5px 10px">↺ Limpar</button>
        <button class="btn-primary" onclick="exportDashPDF()" style="font-size:12px;padding:5px 10px">📄 PDF</button>
      </div></div>
    <div class="dash-stats" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr));margin-bottom:16px">
      ${[['📋','Total',total,'var(--tx-1)'],['✅','Concluídas',done,'var(--green)'],['⚡','Execução',inExec,'var(--yellow)'],['🔍','Revisão',inRev,'var(--blue)'],['⚠️','Atrasadas',overdue,'var(--red)']].map(([i,l,v,c])=>
      `<div class="dash-stat"><div class="dash-stat-icon">${i}</div><div class="dash-stat-n" style="color:${c}">${v}</div><div class="dash-stat-l">${l}</div></div>`).join('')}
    </div>
    <div class="dash-progress-card" style="margin-bottom:16px">
      <div class="dash-progress-hdr"><span class="dash-progress-title">Progresso Global</span><span class="dash-progress-pct" style="color:var(--ac)">${pct}%</span></div>
      <div class="dash-progress-track"><div class="dash-progress-fill" style="width:${pct}%;background:linear-gradient(90deg,var(--ac),var(--purple))"></div></div>
      <div style="font-size:12px;color:var(--tx-3);margin-top:6px">${done} de ${total} concluídas</div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px">
      <div class="dash-card"><div class="dash-card-title">Por Prioridade</div>
        ${[['critical','● Crítica','var(--red)'],['high','↑ Alta','var(--yellow)'],['medium','⬝ Média','var(--tx-2)'],['low','↓ Baixa','var(--tx-3)']].map(([p,l,c])=>byPri[p]?
        `<div class="dash-row"><span style="color:${c};font-weight:600;font-size:13px;min-width:80px">${l}</span>
        <div class="dash-bar"><div style="height:100%;background:${c};border-radius:3px;width:${total?Math.round(byPri[p]/total*100):0}%"></div></div>
        <span class="dash-cnt">${byPri[p]}</span></div>`:'').join('')||'<p style="font-size:12px;color:var(--tx-3)">Sem dados</p>'}</div>
      <div class="dash-card"><div class="dash-card-title">Por Coluna</div>
        ${cols.map(col=>{const _u=/^[0-9a-f]{8}-[0-9a-f]{4}/i;
          const cnt=cards.filter(c=>c.column_id&&_u.test(c.column_id)?c.column_id===col.id:col.bpmn_mapping?.includes(c.bpmn||c.bpmn_status||'esbocar')).length;
          return cnt?`<div class="dash-row"><span class="dash-col-dot" style="background:${col.color}"></span><span style="font-size:13px;color:var(--tx-1)">${_e(col.name)}</span><div style="flex:1"></div><span class="dash-cnt">${cnt}</span></div>`:''}).join('')}
      </div></div>
    <div class="dash-card">
      <div class="dash-card-title" style="margin-bottom:10px">Todas as Tarefas (${cards.length})</div>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:var(--bg-2)">
          ${['Tarefa','Projeto','Status','Prioridade','Responsável','Cliente','Entrega'].map(h=>`<th style="padding:8px 10px;text-align:left;font-weight:700;border-bottom:2px solid var(--bd)">${h}</th>`).join('')}
        </tr></thead><tbody>
          ${cards.map(c=>{
            const bpmn=c.bpmn||c.bpmn_status||'esbocar';
            const proj=allProjects.find(p=>p.id===(c.project_id||c.sl));
            const mem=team.find(m=>m.id===(c.assignee||c.assigned_to));
            const bL={esbocar:'Esboçar',viabilizar:'Viabilizar',atribuir:'Atribuir',executar:'Executar',avaliar:'Avaliar',corrigir:'Corrigir',validar_cliente:'Val.Cliente',concluido:'Concluído'};
            const due=c.due_date||c.date||'';const over=due&&bpmn!=='concluido'&&new Date(due)<new Date();
            return `<tr onclick="openCardEdit('${_e(c.id)}')" style="cursor:pointer" onmouseover="this.style.background='var(--bg-2)'" onmouseout="this.style.background=''">
              <td style="padding:8px 10px;font-weight:600;color:var(--tx-1);border-bottom:1px solid var(--bd)">${_e(c.title)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--bd)">${proj?`<span style="padding:2px 8px;border-radius:20px;background:${proj.color||'#888'}22;color:${proj.color||'var(--tx-2)'};font-size:11px;font-weight:600">${_e(proj.name)}</span>`:'—'}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--bd)">${bL[bpmn]||bpmn}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--bd);color:${{'low':'var(--tx-3)','medium':'var(--tx-2)','high':'var(--yellow)','critical':'var(--red)'}[c.priority||'medium']}">${{low:'↓',medium:'⬝',high:'↑',critical:'●'}[c.priority||'medium']} ${c.priority||'medium'}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--bd)">${mem?`<div style="display:flex;align-items:center;gap:5px"><div style="width:20px;height:20px;border-radius:50%;background:${mem.color||'var(--ac)'};display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:#fff">${_e(mem.initials||'?')}</div>${_e(mem.name)}</div>`:'—'}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--bd)">${_e(proj?.client_name||proj?.client||'—')}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--bd);color:${over?'var(--red)':'var(--tx-3)'};font-weight:${over?700:400}">${due||'—'}${over?' ⚠️':''}</td>
            </tr>`;}).join('')||`<tr><td colspan="7" style="padding:20px;text-align:center;color:var(--tx-3)">Nenhuma tarefa encontrada</td></tr>`}
        </tbody></table></div></div></div>`;
};

window.clearDashFilters=function(){
  ['dash-f-proj','dash-f-status','dash-f-pri','dash-f-assign','dash-f-client'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='all';});
  ['dash-f-d1','dash-f-d2'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  renderDashboard();
};

window.exportDashPDF=function(){
  const z=document.getElementById('dash-print-zone');if(!z)return;
  const w=window.open('','_blank');
  w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Dashboard</title><style>body{font-family:system-ui,sans-serif;padding:20px;color:#1a1a18}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#f5f5f0;padding:8px;text-align:left;border-bottom:2px solid #e4e4e0;font-weight:700}td{padding:7px 8px;border-bottom:1px solid #e4e4e0}select,input,button{display:none!important}@page{margin:12mm}</style></head><body><h1 style="font-size:20px;font-weight:800;margin-bottom:4px">📊 Dashboard — ProjectFlow V9</h1><p style="color:#888;font-size:12px;margin-bottom:14px">'+new Date().toLocaleString('pt-BR')+'</p>'+z.innerHTML+'<script>setTimeout(()=>{window.print();setTimeout(()=>window.close(),600)},400)<\/script></body></html>');
  w.document.close();
};

// SEÇÃO 3 — KANBAN V9 FILTROS
(function(){
  let built=false;
  function build(){
    if(built)return;
    const board=document.getElementById('kanban-board');if(!board)return;
    if(document.getElementById('kb-filter-wrap'))return;
    built=true;

    // Injetar CSS do dropdown de filtro
    if(!document.getElementById('kb-filter-css')){
      const s=document.createElement('style');s.id='kb-filter-css';
      s.textContent=`
        #kb-filter-wrap{display:flex;align-items:center;gap:8px;padding:6px 20px;background:var(--bg-1);border-bottom:1px solid var(--bd);flex-shrink:0;position:relative;z-index:50}
        #kb-filter-dropdown{display:none;position:absolute;top:100%;left:20px;background:var(--bg-1);border:1.5px solid var(--bd);border-radius:var(--r-l);padding:12px 14px;box-shadow:0 8px 24px rgba(0,0,0,.18);z-index:200;min-width:460px;flex-wrap:wrap;gap:8px;align-items:flex-end}
        #kb-filter-dropdown.open{display:flex}
        .kb-filter-btn{display:flex;align-items:center;gap:5px;padding:5px 12px;border-radius:var(--r-f);font-size:12px;font-weight:600;background:var(--bg-2);border:1.5px solid var(--bd);color:var(--tx-2);cursor:pointer;transition:all .15s}
        .kb-filter-btn:hover{background:var(--bg-3);border-color:var(--bd-2);color:var(--tx-1)}
        .kb-filter-btn.active{background:var(--ac-bg);border-color:var(--ac);color:var(--ac)}
      `;
      document.head.appendChild(s);
    }

    const wrap=document.createElement('div');wrap.id='kb-filter-wrap';
    wrap.innerHTML=`
      <button class="kb-filter-btn" id="kb-filter-toggle" onclick="toggleKanbanFilters()" title="Filtros">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M1 3h11M3 6.5h7M5 10h3"/></svg>
        Filtros
        <span id="kb-filter-count" style="display:none;background:var(--ac);color:#fff;border-radius:20px;font-size:10px;padding:1px 6px;margin-left:2px">0</span>
      </button>
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
        </div>
      </div>`;
    // Insere após a .kanban-toolbar (não antes do board, para não sobrepor col-headers)
    const toolbar=document.getElementById('view-kanban')?.querySelector('.kanban-toolbar');
    if(toolbar&&toolbar.nextSibling){toolbar.parentNode.insertBefore(wrap,toolbar.nextSibling);}
    else{board.parentElement.insertBefore(wrap,board);}
    _popA();

    // Fecha dropdown ao clicar fora
    document.addEventListener('click',e=>{
      const wrap=document.getElementById('kb-filter-wrap');
      if(wrap&&!wrap.contains(e.target)){document.getElementById('kb-filter-dropdown')?.classList.remove('open');document.getElementById('kb-filter-toggle')?.classList.remove('active');}
    });
  }
  function _popA(){const sel=document.getElementById('kbf-assign');if(!sel)return;const cur=[...sel.options].map(o=>o.value).filter(Boolean);(window.mockTeam||[]).forEach(m=>{if(!cur.includes(m.id)){const o=new Option(m.name,m.id);sel.add(o);}});}
  window.toggleKanbanFilters=function(){
    const dd=document.getElementById('kb-filter-dropdown');
    const btn=document.getElementById('kb-filter-toggle');
    if(dd){dd.classList.toggle('open');btn?.classList.toggle('active');}
  };

  window.applyKanbanFilters=function(){
    const area=document.getElementById('kbf-area')?.value||'',asgn=document.getElementById('kbf-assign')?.value||'',pri=document.getElementById('kbf-pri')?.value||'';
    const all=PFBoard.cards.length?PFBoard.cards:(window.mockCards||[]);
    document.querySelectorAll('.kcard').forEach(card=>{const c=all.find(x=>x.id===card.dataset.cardId);let show=true;
      if(c){if(area&&(c.area||'')!==area)show=false;if(asgn&&(c.assignee||c.assigned_to||'')!==asgn)show=false;if(pri&&(c.priority||'medium')!==pri)show=false;}
      card.style.display=show?'':'none';});
    _updateFilterCount();
  };
  window.clearKanbanFilters=function(){
    ['kbf-area','kbf-assign','kbf-pri'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    document.querySelectorAll('.kcard').forEach(c=>c.style.display='');
    _updateFilterCount();
  };

  function _updateFilterCount(){
    const area=document.getElementById('kbf-area')?.value||'';
    const asgn=document.getElementById('kbf-assign')?.value||'';
    const pri=document.getElementById('kbf-pri')?.value||'';
    const count=[area,asgn,pri].filter(Boolean).length;
    const cnt=document.getElementById('kb-filter-count');
    const btn=document.getElementById('kb-filter-toggle');
    if(cnt){cnt.style.display=count?'':'none';cnt.textContent=count;}
    if(btn){btn.classList.toggle('active',count>0);}
  }
  const _sw=window.switchView;
  window.switchView=function(name,btn){_sw&&_sw(name,btn);if(name==='kanban')setTimeout(build,400);if(name==='dashboard')setTimeout(renderDashboard,100);};
  document.addEventListener('DOMContentLoaded',()=>setTimeout(build,1800));
})();

// SEÇÃO 3.2 — Campos extras (FIX: sem duplicação)
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
    const footer=body.querySelector('.modal-footer');
    if(footer)body.insertBefore(div,footer);else body.appendChild(div);
  }

  // Insere campos extras DENTRO do slot #ce-details-v9-slot (dentro de #ce-panel-details)
  // Desta forma NUNCA aparecem em outras abas (Fluxo BPMN, Documentação, Anexos, Histórico)
  function refreshEditFields(cardId){
    // Limpa slot antes de recriar (evita duplicação)
    const slot=document.getElementById('ce-details-v9-slot');
    if(slot) slot.innerHTML='';
    document.getElementById('v9-zip-btn')?.remove();

    if(!slot){console.warn('V9: #ce-details-v9-slot não encontrado');return;}
    const all=PFBoard.cards.length?PFBoard.cards:(window.mockCards||[]);
    const c=all.find(x=>x.id===cardId);if(!c)return;
    const _s=s=>String(s||'').replace(/"/g,'&quot;');

    // Bloco Dados da Solicitação — dentro do slot no painel Detalhes
    const solDiv=document.createElement('div');
    solDiv.id='v9-edit-extras-'+cardId;
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

    // Checklist — também dentro do slot (painel Detalhes)
    const chkDiv=document.createElement('div');
    chkDiv.id='pf-chk-'+cardId;
    chkDiv.style.cssText='margin:0 0 10px;padding:10px 12px;background:var(--bg-2);border-radius:var(--r-m);border:1px solid var(--bd)';
    slot.appendChild(chkDiv);
    PFChecklist.render(cardId);

    // Botão ZIP no footer do modal — apenas para concluídas
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

  document.addEventListener('DOMContentLoaded',()=>setTimeout(addNewCardFields,1200));
})();

// SEÇÃO 3.3 — Checklist interativo (FIX: sem duplicação via render idempotente)
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

// SEÇÃO 3.4 — ZIP export (FIX: completo)
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
    .badge{display:inline-block;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:600;background:#d1fae5;color:#065f46}p{margin:5px 0;font-size:14px;color:#4a4a46}</style>
    </head><body>
    <span class="badge">✅ Concluído</span><h1>${_s(c.title)}</h1>
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
  const manifest=JSON.stringify({tarefa:c.title,id:c.id,projeto:proj?.name||null,solicitante:c.requester||null,area:c.area||null,cliente:c.client_name||null,exportado_em:new Date().toISOString(),checklist:{total:chk.length,feitos:chk.filter(i=>i.done).length,items:chk},anexos:atts.map(a=>({nome:a.name,tipo:a.type}))},null,2);
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

// SEÇÃO 3.5 — Recorrências
window.RecurrenceEngine=(function(){
  const KEY='pf_recur_v9';
  function load(){try{return JSON.parse(localStorage.getItem(KEY)||'[]');}catch{return[];}}
  function save(d){try{localStorage.setItem(KEY,JSON.stringify(d));}catch(e){}}
  function add(cfg){const items=load();items.push({id:'rec_'+Date.now(),...cfg,last_run:null});save(items);showToast('Recorrência salva!');}
  function remove(id){save(load().filter(x=>x.id!==id));showToast('Recorrência removida');}
  function run(){
    const items=load();if(!items.length)return;
    const now=new Date();const today=now.toISOString().split('T')[0];
    const dmap=['sun','mon','tue','wed','thu','fri','sat'];const td=dmap[now.getDay()];
    let count=0;
    items.forEach(rec=>{if(rec.last_run===today)return;
      const go=rec.schedule==='daily'||(rec.schedule?.startsWith('weekly:')&&rec.schedule.replace('weekly:','').split(',').includes(td));
      if(!go)return;
      const nc={id:'rc_'+Date.now()+'_'+Math.random().toString(36).slice(2,4),title:rec.title+' — '+now.toLocaleDateString('pt-BR'),priority:rec.priority||'medium',bpmn:'esbocar',bpmn_status:'esbocar',column_id:'col-todo',col:'todo',project_id:PF.currentProject||PFBoard.projectId,is_recurring:true,position:0};
      PFBoard.cards.length?PFBoard.cards.unshift(nc):(window.mockCards=window.mockCards||[],window.mockCards.unshift(nc));
      rec.last_run=today;count++;});
    save(items);if(count>0){renderBoard?.();showToast(`🔄 ${count} tarefa(s) recorrente(s) criada(s)!`);}
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

// SEÇÃO 3.6 — Equipe
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

// SEÇÃO 4 — WIKI V9 (FIX toast + save supabase + visualizar)
(function(){
  if(!window.KnowledgeBase)return;
  const _origR=KnowledgeBase.render.bind(KnowledgeBase);
  KnowledgeBase.render=function(cid,pid){
    if(!pid){const el=document.getElementById(cid);if(el)el.innerHTML=`<div style="padding:40px;text-align:center;color:var(--tx-3)"><div style="font-size:32px;margin-bottom:12px">🔗</div><p style="font-size:15px;font-weight:700;color:var(--tx-2);margin-bottom:8px">Selecione um Projeto</p><p style="font-size:13px">Abra o Kanban e selecione um projeto para carregar a Wiki.</p></div>`;return;}
    _origR(cid,pid);
    const cont=document.getElementById(cid);if(!cont||cont.querySelector('.kb-trace-bar'))return;
    const proj=(window.mockProjects||[]).find(p=>p.id===pid);
    const bar=document.createElement('div');bar.className='kb-trace-bar';
    bar.style.cssText='padding:6px 16px;background:var(--ac-bg);border-bottom:1px solid var(--bd);font-size:12px;color:var(--ac);display:flex;align-items:center;justify-content:space-between;flex-shrink:0';
    bar.innerHTML=`<span>🔗 Wiki: <strong>${proj?.name||pid}</strong></span><button class="btn-secondary" style="font-size:11px;padding:3px 10px" onclick="KBV9.saveToSupabase('${pid}')">💾 Salvar no Supabase</button>`;
    cont.insertBefore(bar,cont.firstChild);
  };
  // FIX: toast APENAS em ações explícitas do usuário
  const _origSet=KBStore.setBlocks.bind(KBStore);
  KBStore.setBlocks=function(pid,blocks){_origSet(pid,blocks);if(KBStore._userAction)showToast('Alteração salva com êxito');};
  ['addBlock','deleteBlock','moveBlock','_saveContent','_saveField','_saveTableHeader','_saveTableCell'].forEach(fn=>{
    const orig=KnowledgeBase[fn]?.bind(KnowledgeBase);if(!orig)return;
    KnowledgeBase[fn]=function(...args){KBStore._userAction=true;try{return orig(...args);}finally{KBStore._userAction=false;}};
  });
  window.KBV9={
    async saveToSupabase(pid){
      const blocks=KBStore.getBlocks(pid);
      if(!window.PF?.supabase||window.PF?.demoMode){showToast('Modo demo — salvo localmente');return;}
      try{
        await PF.supabase.from('knowledge_blocks').delete().eq('project_id',pid);
        const rows=blocks.map((b,i)=>({project_id:pid,type:b.type,position:i,content:b.content||null,icon:b.icon||null,is_open:b.open!==false,table_data:{headers:b.headers||[],rows:b.rows||[]},task_id:b.task_id||null}));
        if(rows.length)await PF.supabase.from('knowledge_blocks').insert(rows);
        showToast('Wiki salva no Supabase!');
      }catch(e){showToast('Erro ao salvar: '+e.message,true);}
    },
    async loadFromSupabase(pid){
      if(!window.PF?.supabase||window.PF?.demoMode)return;
      const{data}=await PF.supabase.from('knowledge_blocks').select('*').eq('project_id',pid).order('position');
      if(!data?.length)return;
      KBStore.setBlocks(pid,data.map(r=>({id:'blk_'+r.id,type:r.type,content:r.content||'',icon:r.icon||'',open:r.is_open!==false,headers:r.table_data?.headers||[],rows:r.table_data?.rows||[],task_id:r.task_id||''})));
    }
  };
})();

// SEÇÃO 5 — DOC IA CORS FIX
(function(){
  const _orig=window._callClaude;
  window._callClaude=async function(sys,msg){
    try{return await(_orig?_orig(sys,msg):Promise.reject(new Error('no_api')));}
    catch(e){
      if(e.message?.includes('fetch')||e.message?.includes('CORS')||e.message?.includes('PROXY_NOT_CONFIGURED')){_showCORSHelp();}
      throw e;
    }
  };
  function _showCORSHelp(){
    if(document.getElementById('cors-help-modal'))return;
    const w=document.createElement('div');w.id='cors-help-modal';w.className='overlay';w.style.cssText='display:flex!important;z-index:1200';
    w.innerHTML=`<div class="modal" onclick="event.stopPropagation()" style="max-width:520px">
      <div class="modal-hdr"><div class="modal-title">⚙️ Configurar Edge Function — IA</div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()"><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M2 2l10 10M12 2L2 12"/></svg></button></div>
      <div class="modal-body" style="padding:20px">
        <p style="font-size:14px;color:var(--tx-2);margin-bottom:16px">A Doc IA requer deploy da Edge Function <code>claude-proxy</code> no Supabase como proxy CORS.</p>
        <div style="background:var(--bg-2);border-radius:var(--r-m);padding:12px;margin-bottom:12px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--tx-3);margin-bottom:8px">1 — Deploy da função (terminal)</div>
          <code style="font-size:12px;background:var(--bg-1);padding:6px 10px;border-radius:6px;display:block;color:#c2410c;white-space:pre-wrap">supabase functions deploy claude-proxy --no-verify-jwt</code>
        </div>
        <div style="background:var(--bg-2);border-radius:var(--r-m);padding:12px;margin-bottom:12px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--tx-3);margin-bottom:8px">2 — Adicionar chave no Dashboard</div>
          <p style="font-size:13px;color:var(--tx-2);margin-bottom:6px">Supabase → Edge Functions → claude-proxy → Secrets:</p>
          <code style="font-size:12px;background:var(--bg-1);padding:6px 10px;border-radius:6px;display:block;color:#c2410c">ANTHROPIC_API_KEY = sk-ant-...</code>
        </div>
        <div style="background:#fffbeb;border-radius:var(--r-m);padding:12px;border-left:3px solid #c48a0a">
          <p style="font-size:13px;color:#92400e;margin:0"><strong>⚠️ O flag <code style="background:#fef3c7">--no-verify-jwt</code> é obrigatório.</strong> Sem ele, o preflight CORS retorna 401 e a função falha.</p>
        </div>
        <div style="margin-top:16px;text-align:right"><button class="btn-primary" onclick="this.closest('.overlay').remove()">Entendido</button></div>
      </div></div>`;
    document.body.appendChild(w);
  }
})();

// SEÇÃO 6 — DIAGRAMA (FIX tela preta: destrói canvas anterior)
(function(){
  window.initDiagramView=async function(){
    const pid=PF.currentProject||(window.mockProjects?.[0]?.id)||null;
    if(!pid){showToast('Selecione um projeto no Kanban antes de abrir os Diagramas',true);return;}
    // Destrói instância anterior para evitar tela preta
    const old=document.getElementById('dgv9-root');
    if(old){
      try{const fc=old.querySelector('canvas');if(fc&&window.fabric){const c=fabric.Canvas.instances?.find(i=>i.lowerCanvasEl===fc);c?.dispose();}}catch(e){}
      old.remove();
    }
    let cont=document.getElementById('dg-container');
    if(!cont){const view=document.getElementById('view-diagrama')||document.getElementById('view-diagram');
      if(view){cont=document.createElement('div');cont.id='dg-container';cont.style.cssText='flex:1;display:flex;overflow:hidden;height:100%';view.appendChild(cont);}}
    if(!cont){showToast('Container do diagrama não encontrado',true);return;}
    if(window.DiagramEngineV9)await DiagramEngineV9.init('dg-container',pid);
  };
  window.regenDiagram=async function(){
    const pid=PF.currentProject||(window.mockProjects?.[0]?.id)||null;
    if(!pid){showToast('Selecione um projeto primeiro',true);return;}
    await window.initDiagramView();
    const cards=PFBoard.cards.length?PFBoard.cards:(window.mockCards||[]).filter(c=>(c.project_id||c.sl)===pid);
    if(window.DiagramEngineV9)DiagramEngineV9.generateFromProject(pid,cards);
  };
  const _sw=window.switchView;
  window.switchView=function(name,btn){_sw&&_sw(name,btn);if(name==='diagrama'||name==='diagram')setTimeout(window.initDiagramView,300);};
})();

// SEÇÃO 7 — SyncManager toast
(function(){
  const _orig=window.SyncManager?.execute;if(!_orig)return;
  window.SyncManager.execute=async function(id,opt,persist,rollback,msg){return _orig.call(this,id,opt,persist,rollback,msg||'Alteração salva com êxito');};
})();

console.log('[ProjectFlow V9 FIXED] pf-v9-core.js ✅');
