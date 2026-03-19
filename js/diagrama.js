// ============================================================
//  ProjectFlow V10 — js/diagrama.js
//  Módulos: uploadAnexo (Supabase Storage) + WikiAI
//  O engine de diagramas está em diagram-engine-v9.js
// ============================================================
'use strict';

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
