// ============================================================
//  ProjectFlow — js/core.js
//  Estado da aplicação, dados mock, utilidades
// ============================================================

'use strict';

// ─── ESTADO GLOBAL ──────────────────────────────────────────
window.PF = {
  supabase:    null,
  user:        null,
  demoMode:    false,
  currentProject: 'website',
  currentWorkspace: null,   // v4: workspace ativo
  currentBoard: null,       // v4: board dinâmico ativo
  drag:        { card: null },
  activeCardId: null,
  toastTimer:  null,
};

// ─── ENUMS BPMN ─────────────────────────────────────────────
const BPMN_STEPS = [
  'esbocar', 'viabilizar', 'atribuir', 'executar',
  'avaliar', 'corrigir', 'validar_cliente', 'concluido'
];
const BPMN_LABEL = {
  esbocar:         'Esboçar',
  viabilizar:      'Viabilizar',
  atribuir:        'Atribuir',
  executar:        'Executar',
  avaliar:         'Avaliar',
  corrigir:        'Corrigir',
  validar_cliente: 'Validar Cliente',
  concluido:       'Encerrado',
};
const BPMN_TO_COL = {
  esbocar:         'todo',
  viabilizar:      'todo',
  atribuir:        'plan',
  executar:        'exec',
  avaliar:         'rev',
  corrigir:        'rev',
  validar_cliente: 'rev',
  concluido:       'done',
};
const COLUMNS = ['todo','plan','exec','rev','done'];
const COL_NAME = { todo:'Planejado', plan:'Prioridade', exec:'Em Execução', rev:'Em Revisão', done:'Concluído' };
const COL_DOT  = { todo:'var(--c-todo-dot)', plan:'var(--c-plan-dot)', exec:'var(--c-exec-dot)', rev:'var(--c-rev-dot)', done:'var(--c-done-dot)' };
const COL_CSS  = { todo:'col-todo', plan:'col-plan', exec:'col-exec', rev:'col-rev', done:'col-done' };
const COL_ACCENT = { todo:'var(--c-todo-dot)', plan:'var(--c-plan-dot)', exec:'var(--c-exec-dot)', rev:'var(--c-rev-dot)', done:'var(--c-done-dot)' };

window.BPMN_STEPS  = BPMN_STEPS;
window.BPMN_LABEL  = BPMN_LABEL;
window.BPMN_TO_COL = BPMN_TO_COL;
window.COLUMNS     = COLUMNS;
window.COL_NAME    = COL_NAME;
window.COL_DOT     = COL_DOT;
window.COL_CSS     = COL_CSS;
window.COL_ACCENT  = COL_ACCENT;

// ─── DADOS MOCK ─────────────────────────────────────────────
window.mockProjects = [
  { id:'website', name:'Website Rebrand', color:'#d97757', wip_limit:10 },
  { id:'product', name:'Product A',       color:'#7c5cbf', wip_limit:5  },
  { id:'content', name:'Conteúdo Q1',     color:'#4a7cf6', wip_limit:5  },
];

window.mockSwimlanes = [
  { id:'website', project:'website', name:'Website', color:'#d97757', wip_limit:10 },
  { id:'product', project:'website', name:'Product', color:'#7c5cbf', wip_limit:5  },
  { id:'content', project:'website', name:'Content', color:'#4a7cf6', wip_limit:5  },
];

window.mockTeam = [
  { id:'jl', initials:'JL', name:'João Lima',     role:'Product Manager',   color:'#d97757' },
  { id:'ls', initials:'LS', name:'Lúcia Santos',  role:'UI/UX Designer',    color:'#7c5cbf' },
  { id:'es', initials:'ES', name:'Eduardo Silva', role:'Frontend Dev',      color:'#1a9e5f' },
  { id:'bl', initials:'BL', name:'Bruno Leal',    role:'Backend Dev',       color:'#4a7cf6' },
  { id:'al', initials:'AL', name:'Ana Lopes',     role:'QA Engineer',       color:'#c48a0a' },
];

window.mockCards = [
  { id:'w1', sl:'website', col:'todo', bpmn:'viabilizar', title:'Sites changes according to brand identity',  date:"Jan 14 '25", hours:'40h', budget:'$1.000', tags:['c'], assignee:'jl', desc:'Atualização visual completa de todos os componentes para refletir a nova identidade da marca. Inclui cores, tipografia e sistema de ícones.', description:'Atualização visual completa de todos os componentes para refletir a nova identidade da marca. Inclui cores, tipografia e sistema de ícones.', doc_decision:'Aprovado pela diretoria em reunião de alinhamento. Escopo definido para Q1.', doc_artifact:'Guia de identidade visual v2.0, paleta de cores, tipografia definida', doc_risk:'Risco de atraso caso fornecedor de imagens não entregue no prazo', doc_notes:'Cliente aprovou mockups iniciais. Aguardando assets finais.' },
  { id:'w2', sl:'website', col:'plan', bpmn:'atribuir',   title:'Homepage header image implementation',        date:"Jan 10 '25", hours:'30h', budget:'$1.500', tags:['a'], assignee:'ls', desc:'Implementação das novas imagens de cabeçalho conforme briefing criativo aprovado pelo cliente.', cover:{ emoji:'🎨', title:'Expand your brand' } },
  { id:'w3', sl:'website', col:'exec', bpmn:'executar',   title:'Home page redesign',                          date:'Dec 27',      hours:'30h', budget:'$5.000', tags:['b'], assignee:'es', desc:'Redesign completo da homepage com foco em conversão. Análise de heatmaps, novos layouts hero e reformulação de CTAs.', description:'Redesign completo da homepage com foco em conversão. Análise de heatmaps, novos layouts hero e reformulação de CTAs.', subtasks:{ total:2, done:1, items:['Header component','Hero animations'] }, doc_decision:'Usar framework React com Next.js para SSR e melhor SEO', doc_artifact:'Componentes React: Hero, NavBar, CTA Section, Footer redesenhado', doc_risk:'Performance em dispositivos mobile pode ser afetada pelos assets de alta resolução', doc_notes:'Sprint 3 - Em andamento. Header concluído, animações hero em 60%.', acceptance_criteria:'Lighthouse score ≥ 90 em todas as categorias. Aprovação do cliente no staging.' },
  { id:'w4', sl:'website', col:'rev',  bpmn:'avaliar',    title:'Development phase review',                    date:'Dec 30',      tags:['b'], assignee:'al', desc:'Revisão geral do desenvolvimento realizado. Avaliação de qualidade de código e performance.', cover:{ emoji:'💻', title:'Business Strategy' } },
  { id:'w5', sl:'website', col:'done', bpmn:'concluido',  title:'UI & UX System Design',                       date:'Dec 18',      tags:['b'], assignee:'ls', desc:'Design system completo com componentes, tokens de cor e tipografia.' },
  { id:'p1', sl:'product', col:'todo', bpmn:'esbocar',    title:'Product B improvement review',                 budget:'$5.000',   tags:['b'], assignee:'jl', desc:'Análise das melhorias necessárias no Product B baseado no feedback dos últimos 3 meses.', description:'Análise das melhorias necessárias no Product B baseado no feedback dos últimos 3 meses.', doc_decision:'Priorizar melhorias de performance e UX antes de novas features', doc_artifact:'Relatório de análise com 47 itens categorizados por impacto e esforço', doc_risk:'Backlog técnico alto pode impactar timeline' },
  { id:'p2', sl:'product', col:'todo', bpmn:'viabilizar', title:'Tech debt cleanup',                            hours:'40h', budget:'$2.500', tags:['meet','a'], assignee:'bl', desc:'Resolução de dívida técnica acumulada: refatoração de módulos legados e atualização de dependências.' },
  { id:'p3', sl:'product', col:'plan', bpmn:'atribuir',   title:'Product A performance improvements',           date:"Jan 21 '25", hours:'8h',  budget:'$2.000', tags:['a'], assignee:'al', desc:'Otimizações de performance: checkout, loading time, bug fixes críticos.', description:'Otimizações de performance: checkout, loading time, bug fixes críticos.', subtasks:{ total:3, done:0, items:['Check-out process','Loading time','Bug fixes'] }, doc_decision:'Migrar bundler para Vite, lazy loading em todas as imagens', doc_artifact:'Bundle size reduzido de 2.4MB para 890KB, LCP de 4.2s para 1.8s', doc_risk:'Migração do bundler pode quebrar configs de CI/CD', acceptance_criteria:'LCP < 2.5s, FCP < 1.8s, CLS < 0.1 conforme Web Vitals' },
  { id:'p4', sl:'product', col:'exec', bpmn:'executar',   title:'Performance metrics for last month campaigns', date:"Jan 9 '25",  hours:'8h',  budget:'$1.000', tags:['a','c'], assignee:'bl', desc:'Acompanhamento de métricas de performance das campanhas do último mês.', subtasks:{ total:2, done:0 } },
  { id:'p5', sl:'product', col:'rev',  bpmn:'avaliar',    title:'Product B analytics review',                   tags:['b'], assignee:'es', desc:'Análise detalhada de métricas de produto B: conversão, retenção e NPS.', chart:true },
  { id:'p6', sl:'product', col:'done', bpmn:'concluido',  title:'Product A analytics baseline',                  tags:['a'], assignee:'ls', desc:'Estabelecimento do baseline de métricas para Product A.', chart:true },
  { id:'c1', sl:'content', col:'todo', bpmn:'esbocar',    title:'KPI reviews sprint',                            date:'Amanhã',     tags:[], assignee:'jl', desc:'Revisão dos KPIs de conteúdo do sprint atual.' },
  { id:'c2', sl:'content', col:'exec', bpmn:'executar',   title:'Content plan for the next quarter',             date:"Jan 20 '25", hours:'40h', budget:'$500', tags:['b'], assignee:'bl', desc:'Planeamento editorial completo para Q2: calendário, temas estratégicos, alinhamento com campanhas.' },
  { id:'c3', sl:'content', col:'rev',  bpmn:'avaliar',    title:'Keyword research strategy',                     tags:[], assignee:'al', desc:'Pesquisa e mapeamento de keywords estratégicas para os próximos 90 dias.' },
  { id:'c4', sl:'content', col:'done', bpmn:'concluido',  title:'Content gap identification',                    tags:[], assignee:'es', desc:'Análise completa de gaps de conteúdo versus concorrentes.' },
];

// ─── UTILIDADES ─────────────────────────────────────────────

/** Mostra toast */
function showToast(msg, isErr = false) {
  const el = document.getElementById('toast');
  if (!el) return;
  clearTimeout(PF.toastTimer);
  el.textContent = msg;
  el.className = 'toast show' + (isErr ? ' err' : '');
  PF.toastTimer = setTimeout(() => { el.className = 'toast'; }, 2800);
}

/** Abre overlay/modal */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

/** Fecha overlay/modal */
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

/** Fecha ao clicar fora */
function handleOverlayClick(e) {
  if (e.target === e.currentTarget) closeModal(e.currentTarget.id);
}

/** Obtém time member por id */
function getTeamMember(id) {
  return window.mockTeam.find(m => m.id === id) || { id, initials:'?', name:'Desconhecido', role:'—', color:'#9a9a94' };
}

/** Gera ID único */
function uid() {
  return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

/** Valida tarefa */
function validateCard(data) {
  const errors = [];
  if (!data.title || data.title.trim().length < 3) errors.push('Título deve ter pelo menos 3 caracteres.');
  if (data.budget !== '' && data.budget !== null && data.budget !== undefined) {
    if (isNaN(Number(data.budget)) || Number(data.budget) < 0) errors.push('Orçamento deve ser um número positivo.');
  }
  if (data.estimated_hours !== '' && data.estimated_hours !== null) {
    const h = Number(data.estimated_hours);
    if (isNaN(h) || h <= 0 || h > 9999) errors.push('Horas estimadas devem estar entre 1 e 9999.');
  }
  if (data.due_date && data.start_date && data.due_date < data.start_date) {
    errors.push('Data de entrega deve ser posterior ao início.');
  }
  return errors;
}

// Expor globalmente
window.showToast     = showToast;
window.openModal     = openModal;
window.closeModal    = closeModal;
window.handleOverlayClick = handleOverlayClick;
window.getTeamMember = getTeamMember;
window.uid           = uid;
window.validateCard  = validateCard;
