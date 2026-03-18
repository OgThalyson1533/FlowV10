// ProjectFlow v5.1 — main.js — COMPLETO E FUNCIONAL (demo + full)
'use strict';

// ════════════════════════════════════════════════════════════
//  ATTACHMENT MANAGER
// ════════════════════════════════════════════════════════════
const AttachmentManager = {
  _store: {},
  ALLOWED: /\.(sql|pbix|xlsm|xlsx|xls|xml|txt|pdf|doc|docx|csv|json|zip|pptx|md|py|js|ts|sh|yaml|yml)$/i,
  ICONS: {SQL:'🗃',PBIX:'📊',XLSM:'📊',XLSX:'📊',XLS:'📊',XML:'📄',TXT:'📝',PDF:'📕',DOC:'📘',DOCX:'📘',CSV:'📋',JSON:'⚙',ZIP:'📦',PPTX:'📑',MD:'📝',PY:'🐍',JS:'📜',TS:'📜',SH:'🖥',YAML:'⚙',YML:'⚙','?':'📎'},
  getExt(f){ return (f.split('.').pop()||'').toUpperCase(); },
  getIcon(f){ return this.ICONS[this.getExt(f)] || this.ICONS['?']; },
  getForCard(id){ return this._store[id] || []; },
  fmtSize(b){ if(b<1024)return b+' B'; if(b<1048576)return(b/1024).toFixed(1)+' KB'; return(b/1048576).toFixed(1)+' MB'; },

  async upload(cardId, files) {
    if (!cardId) return;
    if (!this._store[cardId]) this._store[cardId] = [];
    const res = [];
    for (const f of files) {
      if (!this.ALLOWED.test(f.name)) { showToast('Tipo não permitido: ' + f.name, true); continue; }
      if (f.size > 25*1024*1024) { showToast('Arquivo muito grande (máx 25MB): ' + f.name, true); continue; }
      const att = {
        id: 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2,5),
        cardId, name: f.name, size: f.size,
        type: this.getExt(f.name), mimeType: f.type,
        uploadedAt: new Date().toISOString(), data: null
      };
      if (/\.(sql|xml|txt|csv|json|md|py|js|ts|sh|yaml|yml)$/i.test(f.name)) {
        att.data = await this._text(f);
      }
      this._store[cardId].push(att);
      if (window.PF?.supabase && !window.PF?.demoMode) {
        const b64 = await this._b64(f);
        await PF.supabase.from('task_attachments').insert({
          task_id: cardId, file_name: att.name, file_size: att.size,
          mime_type: att.mimeType, file_data: b64, uploaded_by: PF.user?.id || null
        }).catch(() => {});
      }
      res.push(att);
    }
    if (res.length) showToast(res.length + ' arquivo(s) anexado(s)!');
    return res;
  },

  async delete(cardId, attId) {
    this._store[cardId] = (this._store[cardId] || []).filter(a => a.id !== attId);
    showToast('Anexo removido');
  },

  preview(att) {
    if (!att.data) { showToast('Preview disponível para arquivos de texto', true); return; }
    const w = window.open('', '_blank');
    w.document.write('<!DOCTYPE html><html><head><title>' + att.name + '</title>'
      + '<style>body{font-family:monospace;padding:20px;background:#1a1a18;color:#d4d4d4;'
      + 'white-space:pre-wrap;font-size:13px;line-height:1.6;tab-size:2}</style></head><body>'
      + att.data.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      + '</body></html>');
  },

  download(att) {
    if (!att.data) { showToast('Download apenas para arquivos de texto', true); return; }
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([att.data], {type:'text/plain'})),
      download: att.name
    });
    a.click();
  },

  renderList(cardId) {
    const atts = this.getForCard(cardId);
    if (!atts.length) return '<div class="att-empty">Nenhum anexo. Arraste arquivos ou clique em Selecionar.</div>';
    return atts.map(a => {
      const previewBtn = a.data
        ? '<button class="att-btn" onclick="AttachmentManager.preview(AttachmentManager.getForCard(\'' + cardId + '\').find(x=>x.id===\'' + a.id + '\'))" title="Visualizar">👁</button>'
        : '';
      const dlBtn = a.data
        ? '<button class="att-btn" onclick="AttachmentManager.download(AttachmentManager.getForCard(\'' + cardId + '\').find(x=>x.id===\'' + a.id + '\'))" title="Download">⬇</button>'
        : '';
      return '<div class="att-row">'
        + '<span class="att-icon">' + this.getIcon(a.name) + '</span>'
        + '<div class="att-info"><div class="att-name">' + _safeEsc(a.name) + '</div>'
        + '<div class="att-meta">' + a.type + ' · ' + this.fmtSize(a.size) + ' · ' + new Date(a.uploadedAt).toLocaleString('pt-BR') + '</div></div>'
        + '<div class="att-acts">' + previewBtn + dlBtn
        + '<button class="att-btn att-btn--del" onclick="AttachmentManager.delete(\'' + cardId + '\',\'' + a.id + '\').then(()=>refreshCardAttachments(\'' + cardId + '\'))" title="Remover">✕</button>'
        + '</div></div>';
    }).join('');
  },

  _text(f) { return new Promise(r => { const rd = new FileReader(); rd.onload = e => r(e.target.result); rd.readAsText(f); }); },
  _b64(f)  { return new Promise(r => { const rd = new FileReader(); rd.onload = e => r(e.target.result.split(',')[1]); rd.readAsDataURL(f); }); }
};
window.AttachmentManager = AttachmentManager;

// Safe escape helper (used by multiple modules)
function _safeEsc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
window._safeEsc = _safeEsc;

function refreshCardAttachments(cid) {
  const el = document.getElementById('ce-attachments-list');
  if (el) el.innerHTML = AttachmentManager.renderList(cid || PF.activeCardId);
}
function handleAttachmentDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('att-hover');
  AttachmentManager.upload(PF.activeCardId, Array.from(e.dataTransfer.files)).then(() => refreshCardAttachments());
}
function handleAttachmentInput(inp) {
  AttachmentManager.upload(PF.activeCardId, Array.from(inp.files)).then(() => refreshCardAttachments());
  inp.value = '';
}
window.refreshCardAttachments = refreshCardAttachments;
window.handleAttachmentDrop = handleAttachmentDrop;
window.handleAttachmentInput = handleAttachmentInput;


// ════════════════════════════════════════════════════════════
//  DOCUMENTATION DATABASE
// ════════════════════════════════════════════════════════════
const DocDatabase = {
  _recs: [],

  rebuild() {
    this._recs = [];
    const projs = window.mockProjects || [];
    const allCards = (PFBoard && PFBoard.cards && PFBoard.cards.length)
      ? PFBoard.cards
      : (window.mockCards || []);

    projs.forEach(proj => {
      const pCards = allCards.filter(c => !c.sl || c.sl === proj.id || c.project_id === proj.id);
      pCards.forEach(card => {
        const bpmn = card.bpmn || card.bpmn_status || 'esbocar';
        const team = window.mockTeam || [];
        const assignee = team.find(m => m.id === (card.assignee || card.assigned_to));
        const atts = AttachmentManager.getForCard(card.id);
        const bpmnLabels = window.BPMN_LABEL || {
          esbocar:'Esboçar', viabilizar:'Viabilizar', atribuir:'Atribuir',
          executar:'Executar', avaliar:'Avaliar', corrigir:'Corrigir',
          validar_cliente:'Validar Cliente', concluido:'Concluído'
        };
        const priLabels = {low:'Baixa', medium:'Média', high:'Alta', critical:'Crítica'};

        const fields = [
          {s:'Identificação', f:'Título',        v: card.title},
          {s:'Identificação', f:'Status BPMN',   v: bpmnLabels[bpmn] || bpmn},
          {s:'Identificação', f:'Prioridade',     v: priLabels[card.priority||'medium']},
          {s:'Execução',      f:'Responsável',    v: assignee ? assignee.name : null},
          {s:'Execução',      f:'Data de entrega',v: card.due_date || card.date || null},
          {s:'Execução',      f:'Horas estimadas',v: card.estimated_hours ? card.estimated_hours + 'h' : null},
          {s:'Execução',      f:'Orçamento',      v: card.budget ? 'R$ ' + Number(card.budget).toLocaleString('pt-BR') : (card.budget_str || null)},
          {s:'Descrição',     f:'Descrição',      v: card.description || card.desc || null},
          {s:'Descrição',     f:'Critérios de aceite', v: card.acceptance_criteria || null},
          {s:'Documentação',  f:'Decisão tomada', v: card.doc_decision || null},
          {s:'Documentação',  f:'Artefato gerado',v: card.doc_artifact || null},
          {s:'Documentação',  f:'Riscos',         v: card.doc_risk || null},
          {s:'Documentação',  f:'Notas',          v: card.doc_notes || null},
          {s:'Anexos',        f:'Arquivos',       v: atts.length ? atts.map(a => a.name).join(', ') : null},
        ].filter(x => x.v && x.v.trim && x.v.trim() !== '' || (x.v && typeof x.v === 'string'));

        if (!fields.length) return; // skip cards with no data at all

        fields.filter(x => x.v).forEach(fld => {
          this._recs.push({
            id: card.id + '_' + fld.f.replace(/\s/g,'_'),
            projectId: proj.id, projectName: proj.name, color: proj.color,
            cardId: card.id, cardTitle: card.title,
            bpmn, priority: card.priority || 'medium',
            section: fld.s, field: fld.f, value: String(fld.v),
            updatedAt: card.updated_at || new Date().toISOString()
          });
        });
      });
    });
    return this._recs;
  },

  filter({projectId, section, bpmn, search} = {}) {
    return this._recs.filter(r => {
      if (projectId && projectId !== 'all' && r.projectId !== projectId) return false;
      if (section && section !== 'all' && r.section !== section) return false;
      if (bpmn && bpmn !== 'all' && r.bpmn !== bpmn) return false;
      if (search) {
        const sl = search.toLowerCase();
        if (!r.cardTitle.toLowerCase().includes(sl) &&
            !r.value.toLowerCase().includes(sl) &&
            !r.field.toLowerCase().includes(sl)) return false;
      }
      return true;
    });
  },

  getProjects() {
    const seen = new Set();
    return this._recs.filter(r => {
      if (seen.has(r.projectId)) return false;
      seen.add(r.projectId); return true;
    }).map(r => ({id: r.projectId, name: r.projectName, color: r.color}));
  },

  render(filters) {
    this.rebuild();
    const recs = this.filter(filters);
    const el = document.getElementById('doc-db-content');
    if (!el) return;

    if (!recs.length) {
      el.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--tx-3)">'
        + '<svg viewBox="0 0 48 48" width="44" fill="none" stroke="currentColor" stroke-width="1.5" style="display:block;margin:0 auto 16px;opacity:.3"><rect x="8" y="4" width="32" height="40" rx="3"/><path d="M16 16h16M16 24h16M16 32h10"/></svg>'
        + '<p style="font-size:15px;font-weight:700;color:var(--tx-2);margin-bottom:8px">Nenhum registro encontrado</p>'
        + '<p style="font-size:13px;line-height:1.6">Preencha os campos de <strong>Documentação</strong> nas tarefas<br>'
        + 'ou ajuste os filtros acima.</p></div>';
      const cnt = document.getElementById('doc-record-count');
      if (cnt) cnt.textContent = '0 registros';
      return;
    }

    // Group by card
    const grouped = {};
    recs.forEach(r => {
      const k = r.projectId + '_' + r.cardId;
      if (!grouped[k]) grouped[k] = {
        projectId: r.projectId, projectName: r.projectName, color: r.color,
        cardId: r.cardId, cardTitle: r.cardTitle, bpmn: r.bpmn, priority: r.priority,
        fields: []
      };
      grouped[k].fields.push({s: r.section, f: r.field, v: r.value});
    });

    // Group by project
    const byProject = {};
    Object.values(grouped).forEach(g => {
      if (!byProject[g.projectId]) byProject[g.projectId] = {
        id: g.projectId, name: g.projectName, color: g.color, cards: []
      };
      byProject[g.projectId].cards.push(g);
    });

    const bpmnColors = {
      esbocar:'var(--tx-3)', viabilizar:'var(--tx-3)', atribuir:'var(--purple)',
      executar:'var(--yellow)', avaliar:'var(--blue)', corrigir:'var(--red)',
      validar_cliente:'var(--blue)', concluido:'var(--green)'
    };
    const bpmnLabels = window.BPMN_LABEL || {
      esbocar:'Esboçar', viabilizar:'Viabilizar', atribuir:'Atribuir',
      executar:'Executar', avaliar:'Avaliar', corrigir:'Corrigir',
      validar_cliente:'Validar Cliente', concluido:'Concluído'
    };
    const SECS = ['Identificação','Execução','Descrição','Documentação','Anexos'];

    let html = '';
    Object.values(byProject).forEach(proj => {
      const projColor = proj.color || 'var(--ac)';
      html += '<div class="doc-proj-section">';
      html += '<div class="doc-proj-header" style="border-left:4px solid ' + projColor + '">';
      html += '<div style="flex:1"><div class="doc-proj-name">' + _safeEsc(proj.name) + '</div>';
      html += '<div class="doc-proj-meta">' + proj.cards.length + ' tarefa(s) com documentação</div></div>';
      html += '<button class="doc-pdf-btn" onclick="DocDatabase.exportPDF({projectId:\'' + proj.id + '\'})">'
        + '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="13" height="13"><path d="M2 10V4a1 1 0 011-1h5l3 3v7H3a1 1 0 01-1-1z"/><path d="M7 3v4h3"/></svg>'
        + ' Exportar PDF</button>';
      html += '</div>'; // end proj-header

      proj.cards.forEach(g => {
        const bcolor = bpmnColors[g.bpmn] || 'var(--tx-3)';
        const blabel = bpmnLabels[g.bpmn] || g.bpmn;
        const priLabel = {low:'↓ Baixa', medium:'⬝ Média', high:'↑ Alta', critical:'🔴 Crítica'}[g.priority||'medium'];

        html += '<div class="doc-card">';
        html += '<div class="doc-card-hdr" style="border-left:3px solid ' + projColor + '">';
        html += '<div style="flex:1;min-width:0">';
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">';
        html += '<span class="doc-bpmn-badge" style="color:' + bcolor + '">' + blabel + '</span>';
        html += '<span class="doc-pri-badge">' + priLabel + '</span>';
        html += '</div>';
        html += '<div class="doc-card-title">' + _safeEsc(g.cardTitle) + '</div>';
        html += '</div>';
        html += '<button class="doc-edit-btn" onclick="openCardEdit(\'' + g.cardId + '\')">✏️ Editar</button>';
        html += '</div>'; // end card-hdr

        html += '<div class="doc-card-body">';
        SECS.forEach(sec => {
          const fs = g.fields.filter(x => x.s === sec);
          if (!fs.length) return;
          html += '<div class="doc-sec">';
          html += '<div class="doc-sec-title">' + sec + '</div>';
          fs.forEach(x => {
            html += '<div class="doc-frow"><span class="doc-fname">' + _safeEsc(x.f) + '</span><span class="doc-fval">' + _safeEsc(x.v) + '</span></div>';
          });
          html += '</div>';
        });
        html += '</div>'; // end card-body
        html += '</div>'; // end doc-card
      });

      html += '</div>'; // end proj-section
    });

    el.innerHTML = html;

    // Update counter
    const cnt = document.getElementById('doc-record-count');
    if (cnt) {
      const cardCount = new Set(recs.map(r => r.cardId)).size;
      cnt.textContent = recs.length + ' registros · ' + cardCount + ' tarefas · ' + Object.keys(byProject).length + ' projeto(s)';
    }
  },

  // ── PDF EXPORT ─────────────────────────────────────────────
  exportPDF(filters) {
    this.rebuild();
    const recs = this.filter(filters);
    const pid = filters && filters.projectId && filters.projectId !== 'all' ? filters.projectId : null;
    const proj = pid ? (window.mockProjects || []).find(p => p.id === pid) : null;

    const allCards = (PFBoard && PFBoard.cards && PFBoard.cards.length)
      ? PFBoard.cards : (window.mockCards || []);
    const filtCards = proj
      ? allCards.filter(c => c.sl === proj.id || c.project_id === proj.id)
      : allCards;

    const done = filtCards.filter(c => c.bpmn === 'concluido' || c.bpmn_status === 'concluido').length;
    const pct  = filtCards.length ? Math.round(done / filtCards.length * 100) : 0;

    // Group by card
    const grouped = {};
    recs.forEach(r => {
      const k = r.projectId + '_' + r.cardId;
      if (!grouped[k]) grouped[k] = {
        projectId: r.projectId, projectName: r.projectName, color: r.color,
        cardTitle: r.cardTitle, bpmn: r.bpmn, priority: r.priority, fields: []
      };
      grouped[k].fields.push({s: r.section, f: r.field, v: r.value});
    });

    const title  = proj ? 'Documentação Executiva — ' + proj.name : 'Documentação Executiva — Todos os Projetos';
    const color  = proj ? (proj.color || '#2563EB') : '#2563EB';
    const now    = new Date().toLocaleString('pt-BR');
    const SECS   = ['Identificação','Execução','Descrição','Documentação','Anexos'];
    const bpmnLabels = window.BPMN_LABEL || {esbocar:'Esboçar',viabilizar:'Viabilizar',atribuir:'Atribuir',executar:'Executar',avaliar:'Avaliar',corrigir:'Corrigir',validar_cliente:'Validar Cliente',concluido:'Concluído'};

    // Try to embed diagram SVG
    let diagramHTML = '';
    try {
      const dgSvg = document.getElementById('pfdg-svg');
      if (dgSvg && window.DiagramEngine) {
        const data = DiagramEngine.getData();
        if (data && data.nodes && data.nodes.length > 0) {
          const clone = dgSvg.cloneNode(true);
          clone.querySelectorAll('.pfdg-rh,.pfdg-anc,.pfdg-cl,.pfdg-sb,.pfdg-ancs').forEach(e => e.remove());
          diagramHTML = '<div class="section"><h2>Diagrama de Arquitetura</h2>'
            + '<div style="border:1px solid #e2e2de;border-radius:8px;overflow:hidden;background:#f8f8f7;padding:12px">'
            + clone.outerHTML + '</div></div>';
        }
      }
    } catch(e) {}

    let cardsHTML = '';
    Object.values(grouped).forEach(g => {
      const bCls = g.bpmn === 'concluido' ? 'badge-done'
        : ['avaliar','corrigir','validar_cliente'].includes(g.bpmn) ? 'badge-rev'
        : g.bpmn === 'executar' ? 'badge-exec' : 'badge-plan';

      cardsHTML += '<div class="card"><div class="card-hdr">';
      cardsHTML += '<div><div class="card-title">' + _safeEsc(g.cardTitle) + '</div>';
      cardsHTML += '<div class="card-meta"><span class="badge ' + bCls + '">' + (bpmnLabels[g.bpmn]||g.bpmn) + '</span> &nbsp; ' + _safeEsc(g.projectName) + '</div></div>';
      cardsHTML += '</div><div class="card-body">';
      SECS.forEach(sec => {
        const fs = g.fields.filter(x => x.s === sec);
        if (!fs.length) return;
        cardsHTML += '<div class="sec-title">' + sec + '</div>';
        fs.forEach(x => {
          cardsHTML += '<div class="field-row"><span class="field-n">' + _safeEsc(x.f) + '</span><span class="field-v">' + _safeEsc(x.v) + '</span></div>';
        });
      });
      cardsHTML += '</div></div>';
    });

    const html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>' + title + '</title>'
      + '<style>'
      + '*{box-sizing:border-box;margin:0;padding:0}'
      + 'body{font-family:"Segoe UI",system-ui,sans-serif;color:#1a1a18;background:#fff;font-size:13px;line-height:1.5}'
      + '.page{max-width:960px;margin:0 auto;padding:48px 40px}'
      + '.cover{border-bottom:4px solid ' + color + ';padding-bottom:24px;margin-bottom:32px}'
      + '.cover-badge{display:inline-block;padding:3px 10px;background:' + color + '22;color:' + color + ';border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px}'
      + 'h1{font-size:28px;font-weight:900;color:' + color + ';margin-bottom:8px;letter-spacing:-.5px}'
      + '.cover-meta{font-size:12px;color:#666;display:flex;gap:16px;flex-wrap:wrap}'
      + '.stats-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:24px 0}'
      + '.stat{background:#f8f8f7;border:1px solid #e2e2de;border-radius:8px;padding:14px;text-align:center}'
      + '.stat-n{font-size:26px;font-weight:800;color:' + color + '}'
      + '.stat-l{font-size:11px;color:#666;margin-top:3px;text-transform:uppercase;letter-spacing:.3px}'
      + '.stat-n.green{color:#1a9e5f}.stat-n.yellow{color:#c48a0a}.stat-n.blue{color:#4a7cf6}.stat-n.red{color:#dc3545}'
      + '.progress-section{margin:0 0 28px}'
      + '.progress-lbl{display:flex;justify-content:space-between;font-size:13px;font-weight:600;margin-bottom:6px}'
      + '.progress-track{height:12px;background:#f0f0ee;border-radius:999px;overflow:hidden}'
      + '.progress-fill{height:100%;background:' + color + ';border-radius:999px}'
      + '.section{margin-bottom:32px}'
      + 'h2{font-size:16px;font-weight:800;color:#1a1a18;border-bottom:2px solid ' + color + ';padding-bottom:6px;margin-bottom:16px}'
      + '.card{border:1px solid #e2e2de;border-radius:8px;margin-bottom:14px;overflow:hidden;break-inside:avoid}'
      + '.card-hdr{padding:12px 16px;background:#f8f8f7;border-bottom:1px solid #e2e2de;border-left:4px solid ' + color + '}'
      + '.card-title{font-size:14px;font-weight:700;color:#1a1a18}'
      + '.card-meta{font-size:11px;color:#888;margin-top:3px}'
      + '.badge{display:inline-block;padding:1px 7px;border-radius:999px;font-size:10px;font-weight:700}'
      + '.badge-done{background:#d1fae5;color:#059669}.badge-exec{background:#fef3c7;color:#d97706}'
      + '.badge-rev{background:#dbeafe;color:#2563eb}.badge-plan{background:#f3f4f6;color:#6b7280}'
      + '.card-body{padding:12px 16px}'
      + '.sec-title{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#888;margin:10px 0 5px;padding-bottom:3px;border-bottom:1px solid #f0f0ee}'
      + '.field-row{display:flex;gap:12px;padding:4px 0;border-bottom:1px solid #fafaf8}'
      + '.field-row:last-child{border:none}'
      + '.field-n{min-width:160px;font-size:12px;color:#888;flex-shrink:0}'
      + '.field-v{flex:1;font-size:12px;color:#1a1a18}'
      + '.footer{margin-top:40px;padding-top:16px;border-top:1px solid #e2e2de;display:flex;justify-content:space-between;font-size:11px;color:#888}'
      + '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.card{break-inside:avoid}}'
      + '</style></head><body><div class="page">'
      + '<div class="cover"><div class="cover-badge">Documento Executivo de Homologação</div>'
      + '<h1>' + title + '</h1>'
      + '<div class="cover-meta"><span>📅 ' + now + '</span>'
      + (proj ? '<span>🏷 ' + _safeEsc(proj.name) + '</span>' : '')
      + (proj && proj.client_name ? '<span>🤝 ' + _safeEsc(proj.client_name) + '</span>' : '')
      + '<span>📊 ' + Object.keys(grouped).length + ' tarefas</span></div></div>'

      + '<div class="stats-grid">'
      + '<div class="stat"><div class="stat-n">' + filtCards.length + '</div><div class="stat-l">Total</div></div>'
      + '<div class="stat"><div class="stat-n green">' + done + '</div><div class="stat-l">Concluídas</div></div>'
      + '<div class="stat"><div class="stat-n yellow">' + filtCards.filter(c => (c.bpmn||c.bpmn_status) === 'executar').length + '</div><div class="stat-l">Em Execução</div></div>'
      + '<div class="stat"><div class="stat-n blue">' + filtCards.filter(c => ['avaliar','corrigir','validar_cliente'].includes(c.bpmn||c.bpmn_status)).length + '</div><div class="stat-l">Em Revisão</div></div>'
      + '<div class="stat"><div class="stat-n">' + pct + '%</div><div class="stat-l">Progresso</div></div>'
      + '</div>'

      + '<div class="progress-section"><div class="progress-lbl"><span>Progresso Geral</span><span style="font-weight:900;color:' + color + '">' + pct + '%</span></div>'
      + '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div></div>'

      + (proj && proj.objective ? '<div class="section"><h2>Objetivo do Projeto</h2><p style="font-size:13px;line-height:1.6;background:#f8f8f7;padding:14px;border-radius:8px;border-left:4px solid ' + color + '">' + _safeEsc(proj.objective) + '</p></div>' : '')

      + diagramHTML

      + '<div class="section"><h2>Trajetória Completa — Todas as Tarefas</h2>' + cardsHTML + '</div>'

      + '<div class="footer"><span>ProjectFlow v5.1 — ' + now + '</span><span>Documento Confidencial</span></div>'
      + '</div></body></html>';

    const w = window.open('', '_blank');
    if (!w) { showToast('Permita pop-ups para exportar o PDF', true); return; }
    w.document.write(html);
    w.document.close();
    w.onload = () => { w.focus(); setTimeout(() => w.print(), 400); };
  }
};
window.DocDatabase = DocDatabase;


// ── DOC VIEW PUBLIC FUNCTIONS ────────────────────────────────
function renderDocDatabase() {
  DocDatabase.rebuild();
  const fe = document.getElementById('doc-filter-project');
  if (fe) {
    // Reset and repopulate
    while (fe.options.length > 1) fe.remove(1);
    DocDatabase.getProjects().forEach(p => {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = p.name; fe.appendChild(o);
    });
  }
  applyDocFilters();
}

function applyDocFilters() {
  const f = {
    projectId: document.getElementById('doc-filter-project')?.value || 'all',
    section:   document.getElementById('doc-filter-section')?.value  || 'all',
    bpmn:      document.getElementById('doc-filter-bpmn')?.value     || 'all',
    search:    document.getElementById('doc-filter-search')?.value   || ''
  };
  DocDatabase.render(f);
}

function exportDocPDF() {
  const f = {
    projectId: document.getElementById('doc-filter-project')?.value || 'all',
    section:   document.getElementById('doc-filter-section')?.value  || 'all',
    bpmn:      document.getElementById('doc-filter-bpmn')?.value     || 'all',
    search:    document.getElementById('doc-filter-search')?.value   || ''
  };
  DocDatabase.exportPDF(f);
}

window.renderDocDatabase = renderDocDatabase;
window.applyDocFilters   = applyDocFilters;
window.exportDocPDF      = exportDocPDF;


// ════════════════════════════════════════════════════════════
//  DIAGRAM VIEW MANAGER
// ════════════════════════════════════════════════════════════
const DiagramViewManager = {
  _pid: null,
  _ready: false,

  init(pid) {
    // In demo mode, use current project or first available
    if (!pid) pid = PF.currentProject || (window.mockProjects?.[0]?.id);
    if (!pid) { showToast('Selecione um projeto primeiro', true); return; }

    const exists = (window.mockProjects || []).some(p => p.id === pid);
    if (!exists) { showToast('Diagrama vinculado apenas a projetos existentes', true); return; }

    this._pid = pid;

    // Remove empty state safely
    const es = document.getElementById('dg-empty-state');
    if (es) es.style.display = 'none';

    const container = document.getElementById('dg-container');
    if (!container) return;

    // Always re-init to ensure fresh SVG bindings for the current project
    DiagramEngine.init('dg-container', pid, data => {
      try { localStorage.setItem('pf_dg_' + pid, JSON.stringify(data)); } catch(e) {}
    });
    this._ready = true;

    const _isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const self = this;

    // Load from Supabase if connected, otherwise fall back to localStorage
    if (window.PF?.supabase && !window.PF?.demoMode && _isUUID.test(pid)) {
      PF.supabase.from('project_diagrams')
        .select('content_json')
        .eq('project_id', pid)
        .eq('is_current', true)
        .limit(1)
        .then(({ data }) => {
          const sbContent = data?.[0]?.content_json;
          if (sbContent && Array.isArray(sbContent.nodes) && sbContent.nodes.length > 0) {
            DiagramEngine.load(pid, sbContent);
            setTimeout(() => DiagramEngine.fitView(), 120);
          } else {
            // Fall back to localStorage / auto-generate
            DiagramEngine.load(pid);
            const saved = localStorage.getItem('pf_dg_' + pid);
            let hasNodes = false;
            try { hasNodes = JSON.parse(saved)?.nodes?.length > 0; } catch(e) {}
            if (!hasNodes) setTimeout(() => self.generate(pid), 160);
          }
          self._updateBadge(pid);
        })
        .catch(() => {
          // On error, use localStorage
          DiagramEngine.load(pid);
          self._updateBadge(pid);
          const saved = localStorage.getItem('pf_dg_' + pid);
          let hasNodes = false;
          try { hasNodes = JSON.parse(saved)?.nodes?.length > 0; } catch(e) {}
          if (!hasNodes) setTimeout(() => self.generate(pid), 160);
        });
    } else {
      // Demo mode or no Supabase: use localStorage only
      DiagramEngine.load(pid);
      this._updateBadge(pid);
      const saved = localStorage.getItem('pf_dg_' + pid);
      let hasNodes = false;
      try { hasNodes = JSON.parse(saved)?.nodes?.length > 0; } catch(e) {}
      if (!hasNodes) setTimeout(() => this.generate(pid), 150);
    }
  },

  generate(pid) {
    pid = pid || this._pid || PF.currentProject || (window.mockProjects?.[0]?.id);
    if (!pid) return;

    // Get cards from PFBoard (already filtered by project) OR from mockCards
    const boardCards = PFBoard && PFBoard.cards && PFBoard.cards.length ? PFBoard.cards : null;
    const allCards = boardCards || (window.mockCards || []);
    const cards = boardCards
      ? allCards  // already filtered for the project
      : allCards.filter(c => !c.sl || c.sl === pid || c.project_id === pid);

    if (!cards.length) { showToast('Nenhuma tarefa encontrada para este projeto', true); return; }

    const doGenerate = () => {
      DiagramEngine.generateFromProject(pid, cards);
      // Two-pass fitView: immediate + after layout settles
      DiagramEngine.fitView();
      setTimeout(() => DiagramEngine.fitView(), 120);
      this._updateBadge(pid);
      showToast('Diagrama gerado com ' + cards.length + ' tarefas!', 'ok');
    };

    // Ensure engine is initialized and DOM ready
    if (!this._ready || !document.getElementById('dg-engine-root')) {
      this.init(pid);
      setTimeout(doGenerate, 220);
    } else {
      doGenerate();
    }
  },

  _updateBadge(pid) {
    const badge = document.getElementById('diagram-project-badge');
    if (!badge) return;
    const proj = (window.mockProjects || []).find(p => p.id === pid);
    const allCards = (PFBoard && PFBoard.cards && PFBoard.cards.length)
      ? PFBoard.cards : (window.mockCards || []);
    const n = allCards.filter(c => !c.sl || c.sl === pid || c.project_id === pid).length;
    badge.textContent = proj
      ? 'Projeto: ' + proj.name + ' · ' + n + ' tarefas mapeadas'
      : 'Selecione um projeto';
  }
};
window.DiagramViewManager = DiagramViewManager;

// Auto-update diagram when board changes
window.PFDiagramAutoUpdate = function() {
  const dv = document.getElementById('view-diagram');
  if (dv && dv.classList.contains('active') && DiagramViewManager._pid) {
    DiagramViewManager.generate(DiagramViewManager._pid);
  }
};


// ════════════════════════════════════════════════════════════
//  PROJECT CRUD (with PFModal)
// ════════════════════════════════════════════════════════════
function openProjectEdit(id) {
  const proj = (window.mockProjects || []).find(p => p.id === id);
  if (!proj) return;
  document.getElementById('ep-id').value = id;
  document.getElementById('ep-name').value = proj.name || '';
  document.getElementById('ep-desc').value = proj.description || '';
  document.getElementById('ep-color').value = proj.color || '#d97757';
  document.getElementById('ep-status').value = proj.status || 'active';
  document.getElementById('ep-client').value = proj.client_name || '';
  document.getElementById('ep-objective').value = proj.objective || '';
  openModal('edit-project-overlay');
}

async function saveProjectEdit() {
  const id = document.getElementById('ep-id').value;
  const name = document.getElementById('ep-name').value.trim();
  if (!name || name.length < 2) { showToast('Nome deve ter ≥2 caracteres', true); return; }
  const upd = {
    name,
    description: document.getElementById('ep-desc').value.trim() || null,
    color: document.getElementById('ep-color').value,
    status: document.getElementById('ep-status').value,
    client_name: document.getElementById('ep-client').value.trim() || null,
    objective: document.getElementById('ep-objective').value.trim() || null
  };
  const proj = (window.mockProjects || []).find(p => p.id === id);
  if (proj) Object.assign(proj, upd);
  if (PF.supabase && !PF.demoMode) {
    const {error} = await PF.supabase.from('projects').update(upd).eq('id', id);
    if (error) { showToast('Erro: ' + error.message, true); return; }
  }
  // Update sidebar
  document.querySelectorAll('.sb-item').forEach(el => {
    const oc = el.getAttribute('onclick') || '';
    if (oc.includes("'" + id + "'")) {
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
  showToast('Projeto atualizado!');
}

async function deleteProject(id) {
  const proj = (window.mockProjects || []).find(p => p.id === id);
  const ok = await PFModal.deleteProject(proj ? proj.name : id);
  if (!ok) return;
  window.mockProjects = (window.mockProjects || []).filter(p => p.id !== id);
  window.mockCards    = (window.mockCards    || []).filter(c => c.sl !== id && c.project_id !== id);
  if (PF.supabase && !PF.demoMode) await PF.supabase.from('projects').delete().eq('id', id);
  document.querySelectorAll('.sb-item').forEach(el => {
    if ((el.getAttribute('onclick') || '').includes("'" + id + "'")) el.remove();
  });
  if (PF.currentProject === id) {
    PFBoard.cards = []; PFBoard.columns = [];
    renderBoard();
    const t = document.getElementById('board-title');
    if (t) t.textContent = '—';
  }
  showToast('Projeto excluído');
}

window.openProjectEdit = openProjectEdit;
window.saveProjectEdit = saveProjectEdit;
window.deleteProject   = deleteProject;


// ════════════════════════════════════════════════════════════
//  CSS INJECTION (attachments + doc database styles)
// ════════════════════════════════════════════════════════════
(function injectStyles() {
  if (document.getElementById('pf-v51-css')) return;
  const s = document.createElement('style');
  s.id = 'pf-v51-css';
  s.textContent = `
    /* ── ATTACHMENTS ── */
    .att-drop-zone{border:2px dashed var(--bd);border-radius:var(--r-l);padding:24px;text-align:center;transition:border-color var(--t),background var(--t);background:var(--bg-2);cursor:pointer;}
    .att-hover{border-color:var(--ac)!important;background:var(--ac-bg)!important;}
    .att-drop-inner{display:flex;flex-direction:column;align-items:center;gap:4px;}
    .att-empty{font-size:12px;color:var(--tx-3);padding:12px 0;text-align:center;}
    .att-row{display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg-2);border:1px solid var(--bd);border-radius:var(--r-s);margin-bottom:6px;transition:background var(--t);}
    .att-row:hover{background:var(--bg-3);}
    .att-icon{font-size:20px;flex-shrink:0;}
    .att-info{flex:1;min-width:0;}
    .att-name{font-size:13px;font-weight:500;color:var(--tx-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .att-meta{font-size:11px;color:var(--tx-3);margin-top:1px;}
    .att-acts{display:flex;gap:3px;flex-shrink:0;}
    .att-btn{background:none;border:none;cursor:pointer;padding:4px 6px;border-radius:var(--r-s);font-size:13px;color:var(--tx-3);transition:all var(--t);}
    .att-btn:hover{background:var(--bg-3);color:var(--tx-1);}
    .att-btn--del:hover{background:var(--red-bg);color:var(--red);}

    /* ── DOC DATABASE ── */
    .doc-proj-section{margin-bottom:28px;}
    .doc-proj-header{display:flex;align-items:center;gap:14px;padding:14px 18px;background:var(--bg-2);border:1px solid var(--bd);border-radius:var(--r-m);margin-bottom:10px;transition:background var(--t);}
    .doc-proj-name{font-size:16px;font-weight:800;color:var(--tx-1);}
    .doc-proj-meta{font-size:12px;color:var(--tx-3);margin-top:2px;}
    .doc-pdf-btn{display:flex;align-items:center;gap:5px;padding:7px 14px;background:var(--ac);color:#fff;border:none;border-radius:var(--r-s);cursor:pointer;font-size:12px;font-weight:600;font-family:var(--font);transition:opacity .15s;flex-shrink:0;white-space:nowrap;}
    .doc-pdf-btn:hover{opacity:.82;}

    .doc-card{background:var(--bg-1);border:1px solid var(--bd);border-radius:var(--r-m);margin-bottom:10px;overflow:hidden;transition:box-shadow var(--t);}
    .doc-card:hover{box-shadow:var(--sh-2);}
    .doc-card-hdr{display:flex;align-items:flex-start;gap:12px;padding:12px 16px;background:var(--bg-2);border-bottom:1px solid var(--bd);}
    .doc-card-title{font-size:14px;font-weight:700;color:var(--tx-1);}
    .doc-card-body{padding:12px 16px;}
    .doc-bpmn-badge{font-size:11px;font-weight:600;}
    .doc-pri-badge{font-size:11px;color:var(--tx-3);}
    .doc-edit-btn{background:none;border:1px solid var(--bd);cursor:pointer;padding:4px 10px;border-radius:var(--r-s);font-size:11px;color:var(--tx-2);transition:all var(--t);font-family:var(--font);flex-shrink:0;white-space:nowrap;}
    .doc-edit-btn:hover{background:var(--bg-3);color:var(--tx-1);}

    .doc-sec{margin-bottom:10px;}
    .doc-sec-title{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--tx-3);margin-bottom:5px;border-bottom:1px solid var(--bg-3);padding-bottom:3px;}
    .doc-frow{display:flex;gap:12px;padding:4px 0;border-bottom:1px solid var(--bg-2);}
    .doc-frow:last-child{border:none;}
    .doc-fname{min-width:150px;font-size:12px;color:var(--tx-3);flex-shrink:0;}
    .doc-fval{flex:1;font-size:12px;color:var(--tx-1);line-height:1.5;word-break:break-word;}
  `;
  document.head.appendChild(s);
})();
