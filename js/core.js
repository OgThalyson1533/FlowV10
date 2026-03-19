// ============================================================
//  ProjectFlow V10 — js/core.js
//  ARQUIVO LIMPO: estado global, dados mock, utilidades.
//  NENHUMA função é declarada duas vezes.
// ============================================================
'use strict';

// ── Estado global único ──────────────────────────────────────
window.PF = {
  supabase:         null,
  user:             null,
  demoMode:         false,
  currentProject:   'website',
  currentWorkspace: null,
  activeCardId:     null,
  _pendingCol:      null,
  toastTimer:       null,
};

// ── Enums BPMN ───────────────────────────────────────────────
window.BPMN_STEPS = ['esbocar','viabilizar','atribuir','executar','avaliar','corrigir','validar_cliente','concluido'];
window.BPMN_LABEL = {
  esbocar:'Esboçar', viabilizar:'Viabilizar', atribuir:'Atribuir',
  executar:'Executar', avaliar:'Avaliar', corrigir:'Corrigir',
  validar_cliente:'Validar Cliente', concluido:'Concluído',
};
window.BPMN_TO_COL = {
  esbocar:'todo', viabilizar:'todo', atribuir:'plan',
  executar:'exec', avaliar:'rev', corrigir:'rev',
  validar_cliente:'rev', concluido:'done',
};
window.COLUMNS  = ['todo','plan','exec','rev','done'];
window.COL_NAME = { todo:'Planejado', plan:'Prioridade', exec:'Em Execução', rev:'Em Revisão', done:'Concluído' };

// ── Dados mock (modo demonstração) ───────────────────────────
window.mockProjects = [
  { id:'website', name:'Website Rebrand',  color:'#d97757', wip_limit:10, status:'active', objective:'Modernizar presença digital' },
  { id:'product', name:'Product A',        color:'#7c5cbf', wip_limit:5,  status:'active' },
  { id:'content', name:'Conteúdo Q1',      color:'#4a7cf6', wip_limit:5,  status:'active' },
];

window.mockTeam = [
  { id:'jl', initials:'JL', name:'João Lima',     role:'Product Manager', color:'#d97757' },
  { id:'ls', initials:'LS', name:'Lúcia Santos',  role:'UI/UX Designer',  color:'#7c5cbf' },
  { id:'es', initials:'ES', name:'Eduardo Silva', role:'Frontend Dev',    color:'#1a9e5f' },
  { id:'bl', initials:'BL', name:'Bruno Leal',    role:'Backend Dev',     color:'#4a7cf6' },
  { id:'al', initials:'AL', name:'Ana Lopes',     role:'QA Engineer',     color:'#c48a0a' },
];

window.mockCards = [
  { id:'w1', sl:'website', project_id:'website', col:'todo', bpmn:'viabilizar', bpmn_status:'viabilizar',
    title:'Sites changes according to brand identity', date:"Jan 14 '25", estimated_hours:40, budget:1000,
    tags:['c'], assignee:'jl', assigned_to:'jl', priority:'high',
    description:'Atualização visual completa de todos os componentes.',
    doc_decision:'Aprovado pela diretoria em reunião de alinhamento.',
    doc_artifact:'Guia de identidade visual v2.0',
    doc_risk:'Risco de atraso caso fornecedor não entregue', doc_notes:'Aguardando assets finais.' },
  { id:'w2', sl:'website', project_id:'website', col:'plan', bpmn:'atribuir', bpmn_status:'atribuir',
    title:'Homepage header image implementation', date:"Jan 10 '25", estimated_hours:30, budget:1500,
    tags:['a'], assignee:'ls', assigned_to:'ls', priority:'medium',
    description:'Implementação das novas imagens de cabeçalho.' },
  { id:'w3', sl:'website', project_id:'website', col:'exec', bpmn:'executar', bpmn_status:'executar',
    title:'Home page redesign', date:'Dec 27', estimated_hours:30, budget:5000,
    tags:['b'], assignee:'es', assigned_to:'es', priority:'high',
    description:'Redesign completo da homepage com foco em conversão.',
    subtasks:{ total:2, done:1, items:['Header component','Hero animations'] },
    doc_decision:'Usar React com Next.js para SSR', doc_artifact:'Componentes: Hero, NavBar, CTA',
    acceptance_criteria:'Lighthouse score ≥ 90.' },
  { id:'w4', sl:'website', project_id:'website', col:'rev', bpmn:'avaliar', bpmn_status:'avaliar',
    title:'Development phase review', date:'Dec 30', tags:['b'], assignee:'al', assigned_to:'al', priority:'medium',
    description:'Revisão geral do desenvolvimento realizado.' },
  { id:'w5', sl:'website', project_id:'website', col:'done', bpmn:'concluido', bpmn_status:'concluido',
    title:'UI & UX System Design', date:'Dec 18', tags:['b'], assignee:'ls', assigned_to:'ls', priority:'medium',
    description:'Design system completo com componentes e tokens.' },
  { id:'p1', sl:'product', project_id:'product', col:'todo', bpmn:'esbocar', bpmn_status:'esbocar',
    title:'Product B improvement review', budget:5000, tags:['b'], assignee:'jl', assigned_to:'jl', priority:'medium',
    description:'Análise de melhorias no Product B.' },
  { id:'p2', sl:'product', project_id:'product', col:'todo', bpmn:'viabilizar', bpmn_status:'viabilizar',
    title:'Tech debt cleanup', estimated_hours:40, budget:2500, tags:['a'], assignee:'bl', assigned_to:'bl', priority:'high',
    description:'Resolução de dívida técnica acumulada.' },
  { id:'p3', sl:'product', project_id:'product', col:'plan', bpmn:'atribuir', bpmn_status:'atribuir',
    title:'Product A performance improvements', date:"Jan 21 '25", estimated_hours:8, budget:2000,
    tags:['a'], assignee:'al', assigned_to:'al', priority:'critical',
    description:'Otimizações de performance: checkout, loading time.',
    subtasks:{ total:3, done:0, items:['Check-out process','Loading time','Bug fixes'] },
    acceptance_criteria:'LCP < 2.5s, FCP < 1.8s' },
  { id:'p4', sl:'product', project_id:'product', col:'exec', bpmn:'executar', bpmn_status:'executar',
    title:'Performance metrics for last month campaigns', date:"Jan 9 '25", estimated_hours:8, budget:1000,
    tags:['a','c'], assignee:'bl', assigned_to:'bl', priority:'medium', description:'Métricas de performance das campanhas.' },
  { id:'c1', sl:'content', project_id:'content', col:'todo', bpmn:'esbocar', bpmn_status:'esbocar',
    title:'KPI reviews sprint', tags:[], assignee:'jl', assigned_to:'jl', priority:'low',
    description:'Revisão dos KPIs de conteúdo do sprint atual.' },
  { id:'c2', sl:'content', project_id:'content', col:'exec', bpmn:'executar', bpmn_status:'executar',
    title:'Content plan for the next quarter', date:"Jan 20 '25", estimated_hours:40, budget:500,
    tags:['b'], assignee:'bl', assigned_to:'bl', priority:'high',
    description:'Planeamento editorial completo para Q2.' },
  { id:'c3', sl:'content', project_id:'content', col:'rev', bpmn:'avaliar', bpmn_status:'avaliar',
    title:'Keyword research strategy', tags:[], assignee:'al', assigned_to:'al', priority:'medium',
    description:'Pesquisa de keywords estratégicas.' },
  { id:'c4', sl:'content', project_id:'content', col:'done', bpmn:'concluido', bpmn_status:'concluido',
    title:'Content gap identification', tags:[], assignee:'es', assigned_to:'es', priority:'medium',
    description:'Análise completa de gaps de conteúdo.' },
];

// ── Utilitários globais ──────────────────────────────────────

// showToast é instalado por app.js com suporte a pilha visual
// Este stub só existe para evitar erros se algo chamar antes do app.js carregar
window.showToast = window.showToast || function(msg) { console.log('[Toast]', msg); };

window.openModal = function(id) {
  document.getElementById(id)?.classList.add('open');
};

window.closeModal = function(id) {
  document.getElementById(id)?.classList.remove('open');
};

window.handleOverlayClick = function(e) {
  if (e.target === e.currentTarget) closeModal(e.currentTarget.id);
};

window._safeEsc = function(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
};

window.uid = function() {
  return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
};

window.getTeamMember = function(id) {
  return (window.mockTeam || []).find(m => m.id === id) ||
    { id, initials:'?', name:'Desconhecido', role:'—', color:'#9a9a94' };
};
