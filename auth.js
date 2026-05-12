/* ═══════════════════════════════════════════════════════════
   auth.js — Autenticación y wishlist persistente
   Usa Supabase Auth REST directamente (sin SDK extra)
   ═══════════════════════════════════════════════════════════ */

const SUPABASE_URL = 'https://toswedvpacywgopxpuiy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvc3dlZHZwYWN5d2dvcHhwdWl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQxNDc5OTEsImV4cCI6MjA1OTcyMzk5MX0.8ISjLulnMHvtdpMiJh0LXJT_V1ZyKT2HH-mPjrHUUSE';

// ── Estado de sesión ──────────────────────────────────────────────────
let currentUser   = null;   // { id, email, ... }
let accessToken   = null;   // JWT para llamadas autenticadas
let _authTab      = 'login';

// Recuperar sesión guardada en localStorage
function _loadSession() {
  try {
    const raw = localStorage.getItem('r45_session');
    if (!raw) return;
    const s = JSON.parse(raw);
    // Verificar que no expiró
    if (s.expires_at && Date.now() / 1000 < s.expires_at) {
      accessToken = s.access_token;
      currentUser = s.user;
      _updateAuthUI();
    } else {
      localStorage.removeItem('r45_session');
    }
  } catch (_) {}
}

function _saveSession(data) {
  try {
    localStorage.setItem('r45_session', JSON.stringify({
      access_token: data.access_token,
      expires_at:   data.expires_at,
      user:         data.user,
    }));
  } catch (_) {}
}

function _clearSession() {
  accessToken = null;
  currentUser = null;
  localStorage.removeItem('r45_session');
}

// ── UI de autenticación ───────────────────────────────────────────────
function openAuthModal() {
  if (currentUser) {
    // Si ya está logueado, mostrar opciones de cuenta
    _showAccountMenu();
    return;
  }
  document.getElementById('authModal').classList.add('open');
  document.getElementById('authEmail').focus();
}

function closeAuthModal() {
  document.getElementById('authModal').classList.remove('open');
  document.getElementById('authError').style.display = 'none';
}

function switchAuthTab(tab) {
  _authTab = tab;
  document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('tabRegister').classList.toggle('active', tab === 'register');
  document.getElementById('authSubmitBtn').textContent = tab === 'login' ? 'Iniciar sesión' : 'Crear cuenta';
  document.getElementById('authError').style.display = 'none';
}

function _showAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.style.display = 'block';
}

function _updateAuthUI() {
  const btn = document.getElementById('authBtn');
  if (!btn) return;
  if (currentUser) {
    const name = currentUser.email.split('@')[0];
    btn.textContent = `👤 ${name}`;
    btn.style.background = 'var(--green)';
    btn.style.color = '#000';
    btn.title = currentUser.email;
  } else {
    btn.textContent = '👤 Ingresar';
    btn.style.background = 'var(--card)';
    btn.style.color = 'var(--fg)';
    btn.title = '';
  }
}

function _showAccountMenu() {
  const email = currentUser?.email || '';
  const name  = email.split('@')[0];
  if (confirm(`Sesión activa: ${email}\n\n¿Querés cerrar sesión?`)) {
    _logout();
  }
}

// ── Supabase Auth REST ───────────────────────────────────────────────
async function submitAuth() {
  const email    = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const btn      = document.getElementById('authSubmitBtn');

  if (!email || !password) { _showAuthError('Completá email y contraseña'); return; }
  if (password.length < 6) { _showAuthError('La contraseña debe tener al menos 6 caracteres'); return; }

  btn.textContent = 'Cargando...';
  btn.disabled    = true;

  try {
    const endpoint = _authTab === 'login'
      ? `${SUPABASE_URL}/auth/v1/token?grant_type=password`
      : `${SUPABASE_URL}/auth/v1/signup`;

    const resp = await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body:    JSON.stringify({ email, password }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      const msg = data.error_description || data.msg || data.error || 'Error desconocido';
      _showAuthError(msg === 'Invalid login credentials'
        ? 'Email o contraseña incorrectos'
        : msg === 'User already registered'
        ? 'Este email ya tiene cuenta — iniciá sesión'
        : msg);
      return;
    }

    if (_authTab === 'register' && !data.access_token) {
      // Supabase puede requerir confirmación de email
      closeAuthModal();
      showToast('✅ Cuenta creada — revisá tu email para confirmar', 'green');
      return;
    }

    accessToken = data.access_token;
    currentUser = data.user;
    _saveSession(data);
    _updateAuthUI();
    closeAuthModal();

    const name = currentUser.email.split('@')[0];
    showToast(`✅ Bienvenido, ${name}!`, 'green');

    // Sincronizar wishlist local al servidor
    await _syncWishlistToServer();

  } catch (e) {
    _showAuthError('Error de conexión. Intentá de nuevo.');
    console.error('[Auth]', e);
  } finally {
    btn.textContent = _authTab === 'login' ? 'Iniciar sesión' : 'Crear cuenta';
    btn.disabled    = false;
  }
}

async function _logout() {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'apikey': SUPABASE_ANON_KEY },
    });
  } catch (_) {}
  _clearSession();
  wishlist = [];
  document.getElementById('wl-count').textContent = '0';
  _updateAuthUI();
  showToast('Sesión cerrada');
}

// ── Wishlist persistente ──────────────────────────────────────────────
async function saveProduct(id) {
  const p = allProducts.find(x => String(x.id) === String(id));
  if (!p) return;

  // Si el usuario está logueado → guardar en servidor
  if (currentUser && accessToken) {
    try {
      const resp = await fetch(`${API_URL}/saved`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(p),
      });
      if (resp.ok) {
        showToast('📌 Guardado en tu cuenta: ' + p.name, 'green');
        // Actualizar wishlist local también
        if (!wishlist.find(x => String(x.id) === String(id))) {
          wishlist.push(p);
          document.getElementById('wl-count').textContent = wishlist.length;
        }
        return;
      }
    } catch (e) {
      console.warn('[Save]', e);
    }
  }

  // Sin sesión → guardar en memoria + avisar que se perderá
  if (wishlist.find(x => String(x.id) === String(id))) {
    showToast('Ya está guardado', 'yellow');
    return;
  }
  wishlist.push(p);
  document.getElementById('wl-count').textContent = wishlist.length;
  showToast('📌 Guardado (iniciá sesión para no perderlo)', 'yellow');
}

async function showWishlist() {
  // Si está logueado → cargar desde servidor
  if (currentUser && accessToken) {
    try {
      const resp = await fetch(`${API_URL}/saved`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        wishlist = data.products.map(p => ({
          id:            p.ml_item_id,
          name:          p.name,
          price_sell_ars: p.price_ars,
          category:      p.category,
          seller_url:    p.ml_url,
          image_url:     p.image_url,
          margin_pct:    p.margin_pct,
          vendor_type:   'local',
        }));
        document.getElementById('wl-count').textContent = wishlist.length;
      }
    } catch (e) { console.warn('[Wishlist]', e); }
  }

  if (!wishlist.length) {
    showToast('No tenés productos guardados aún');
    return;
  }

  const lines = wishlist.map(p =>
    `• ${p.name}\n  Margen: ${p.margin_pct ? p.margin_pct.toFixed(1) + '%' : '—'} · ${p.seller_url ? p.seller_url.slice(0,50) : 'ML'}`
  ).join('\n\n');
  alert(`📌 Productos guardados (${wishlist.length}):\n\n${lines}`);
}

// Sincronizar wishlist local al loguearse
async function _syncWishlistToServer() {
  if (!wishlist.length || !accessToken) return;
  for (const p of wishlist) {
    try {
      await fetch(`${API_URL}/saved`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body:    JSON.stringify(p),
      });
    } catch (_) {}
  }
}

// Cargar alertas del usuario autenticado
async function loadUserAlerts() {
  if (!accessToken) return;
  try {
    const resp = await fetch(`${API_URL}/alerts`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (resp.ok) {
      const data = await resp.json();
      document.getElementById('wl-count').textContent = data.total;
      return data.alerts;
    }
  } catch (e) { console.warn('[Alerts]', e); }
  return [];
}

// Enter en los inputs del modal
document.addEventListener('DOMContentLoaded', () => {
  _loadSession();

  ['authEmail', 'authPassword'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') submitAuth(); });
  });

  document.getElementById('authModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('authModal')) closeAuthModal();
  });
});
