// ============================================================
//  ProjectFlow — js/auth.js
//  Autenticação (Supabase + Demo), Tema Light/Dark
// ============================================================

'use strict';

// ─── SUPABASE INIT ───────────────────────────────────────────
function initSupabase() {
  const url = localStorage.getItem('pf_sb_url');
  const key = localStorage.getItem('pf_sb_key');
  if (url && key && window.supabase) {
    try {
      PF.supabase = window.supabase.createClient(url, key);
      return true;
    } catch (e) {
      console.warn('Supabase init failed:', e);
    }
  }
  return false;
}

// ─── CONFIG PANEL ───────────────────────────────────────────
function openConfigPanel() {
  document.getElementById('cfg-url').value = localStorage.getItem('pf_sb_url') || '';
  document.getElementById('cfg-key').value = localStorage.getItem('pf_sb_key') || '';
  document.getElementById('cfg-overlay').classList.add('open');
}

function closeConfigPanel() {
  document.getElementById('cfg-overlay').classList.remove('open');
}

function saveConfig() {
  const url = document.getElementById('cfg-url').value.trim();
  const key = document.getElementById('cfg-key').value.trim();
  if (!url || !key) { showToast('Preencha URL e Key', true); return; }
  localStorage.setItem('pf_sb_url', url);
  localStorage.setItem('pf_sb_key', key);
  const ok = initSupabase();
  closeConfigPanel();
  showToast(ok ? '✓ Supabase configurado!' : '⚠ Erro ao conectar');
}

// ─── AUTH TABS ───────────────────────────────────────────────
let authMode = 'login';

function switchAuthTab(mode) {
  authMode = mode;
  const loginTab    = document.getElementById('tab-login');
  const registerTab = document.getElementById('tab-register');
  const nameGroup   = document.getElementById('name-group');
  const submitBtn   = document.getElementById('submit-btn');

  loginTab.classList.toggle('active', mode === 'login');
  registerTab.classList.toggle('active', mode === 'register');
  nameGroup.style.display = mode === 'register' ? 'block' : 'none';
  submitBtn.textContent = mode === 'register' ? 'Criar conta' : 'Entrar';
  hideLoginError();
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  document.getElementById('login-error-msg').textContent = msg;
  el.classList.add('show');
}

function hideLoginError() {
  document.getElementById('login-error').classList.remove('show');
}

// ─── SUBMIT AUTH ─────────────────────────────────────────────
async function handleAuthSubmit() {
  hideLoginError();
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;

  if (!email || !password) {
    showLoginError('Preencha email e senha.');
    return;
  }
  if (password.length < 6) {
    showLoginError('Senha deve ter pelo menos 6 caracteres.');
    return;
  }

  if (!PF.supabase && !initSupabase()) {
    showLoginError('Configure o Supabase primeiro ou use o modo Demonstração.');
    return;
  }

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = 'Aguarde…';

  try {
    let result;

    if (authMode === 'login') {
      result = await PF.supabase.auth.signInWithPassword({ email, password });
    } else {
      const fullName = (document.getElementById('auth-name').value || '').trim();
      result = await PF.supabase.auth.signUp({
        email, password,
        options: { data: { full_name: fullName || email.split('@')[0] } },
      });
    }

    if (result.error) throw result.error;

    const user = result.data?.user || result.data?.session?.user;
    if (!user) throw new Error('Usuário não retornado. Verifique o email de confirmação.');

    PF.user = user;
    PF.demoMode = false;
    enterApp(user.user_metadata?.full_name || email.split('@')[0]);

  } catch (err) {
    showLoginError(err.message || 'Erro de autenticação.');
  } finally {
    btn.disabled = false;
    btn.textContent = authMode === 'register' ? 'Criar conta' : 'Entrar';
  }
}

// ─── DEMO LOGIN ──────────────────────────────────────────────
function demoLogin() {
  PF.user     = { id: 'demo', email: 'demo@projectflow.app' };
  PF.demoMode = true;
  enterApp('Demo User');
}

// ─── LOGOUT ──────────────────────────────────────────────────
function logout() {
  if (PF.supabase) PF.supabase.auth.signOut();
  PF.user = null;
  PF.demoMode = false;
  const appEl    = document.getElementById('app-shell');
  const loginEl  = document.getElementById('login-screen');
  appEl.classList.remove('ready');
  loginEl.classList.remove('hiding');
  showToast('Sessão encerrada');
}

// ─── ENTER APP ───────────────────────────────────────────────
function enterApp(name) {
  const loginEl = document.getElementById('login-screen');
  loginEl.classList.add('hiding');

  // Atualiza UI do topbar
  const initials = name.split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const avatarEl = document.getElementById('topbar-avatar');
  const nameEl   = document.getElementById('topbar-name');
  if (avatarEl) avatarEl.textContent = initials;
  if (nameEl)   nameEl.textContent   = name.split(' ')[0];

  setTimeout(() => {
    const appEl = document.getElementById('app-shell');
    appEl.classList.add('ready');

    // Hook extensível — v7-fixes.js sobrescreve window._afterLogin
    // para carregar projetos reais do Supabase
    if (typeof window._afterLogin === 'function') {
      window._afterLogin(name);
    } else {
      // Fallback: comportamento original
      if (typeof renderBoard === 'function') renderBoard();
      if (typeof renderSQL   === 'function') renderSQL();
    }
  }, 280);
}

// ─── TEMA LIGHT / DARK ───────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('pf_theme') || 'light';
  applyTheme(saved, false);
}

function applyTheme(theme, animate = true) {
  document.documentElement.setAttribute('data-theme', theme);

  const chk   = document.getElementById('theme-chk');
  const thumb = document.getElementById('theme-thumb');

  if (chk)   chk.checked = theme === 'dark';
  if (thumb) thumb.textContent = theme === 'dark' ? '🌙' : '☀️';

  localStorage.setItem('pf_theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ─── ESC fecha modals ────────────────────────────────────────
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('.overlay.open, .cfg-overlay.open').forEach(el => {
      el.classList.remove('open');
    });
  }
});

// ─── INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  initTheme();
  initSupabase();

  // Verificar sessão existente no Supabase
  if (PF.supabase) {
    PF.supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        PF.user = data.session.user;
        enterApp(data.session.user.user_metadata?.full_name || data.session.user.email.split('@')[0]);
      }
    });
  }
});

// Expor globais
window.openConfigPanel  = openConfigPanel;
window.closeConfigPanel = closeConfigPanel;
window.saveConfig       = saveConfig;
window.switchAuthTab    = switchAuthTab;
window.handleAuthSubmit = handleAuthSubmit;
window.demoLogin        = demoLogin;
window.logout           = logout;
window.toggleTheme      = toggleTheme;
