/* ═══════════════════════════════════════════════
   ml-api.js — Integración MercadoLibre
   Marketplace R45
   ═══════════════════════════════════════════════

   Las búsquedas se hacen a través del backend FastAPI
   que maneja la autenticación OAuth con MercadoLibre.
   
   Endpoint del backend: GET /ml-search?q=...&limit=5

   ═══════════════════════════════════════════════ */

const ML_API = {
  // ── Buscar productos via backend (OAuth autenticado) ──────────────
  async searchTrending(query, limit = 5) {
    // Intentar via backend autenticado
    const backendUrl = (typeof API_URL !== 'undefined' && API_URL) ? API_URL : 'http://localhost:8000';
    try {
      const cleanQuery = query.replace(/[^\w\s]/gi, '').trim();
      const url = `${backendUrl}/ml-search?q=${encodeURIComponent(cleanQuery)}&limit=${limit}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!r.ok) throw new Error('Backend ML error: ' + r.status);
      const data = await r.json();
      return data.results || [];
    } catch (e) {
      console.warn('[ML] Búsqueda via backend falló:', e.message);
      return [];
    }
  },

  // ── Categorías MLA ───────────────────────────────────────────────
  categories: {
    'Electrónica':  'MLA1000',
    'Moda':         'MLA1430',
    'Hogar':        'MLA1574',
    'Deportes':     'MLA1276',
    'Belleza':      'MLA1246',
    'Juguetes':     'MLA5726',
    'Mascotas':     'MLA1700',
  },

  // ── Formatear resultado ML para mostrar ─────────────────────────
  formatItem(item) {
    // Si ya viene formateado desde el backend, devolverlo directo
    return {
      id:        item.id,
      name:      item.name || item.title,
      price:     item.price,
      currency:  item.currency || item.currency_id || 'ARS',
      sold:      item.sold || item.sold_quantity || 0,
      seller:    item.seller || 'Vendedor ML',
      url:       item.url || item.permalink || '',
      thumbnail: item.thumbnail || '',
      condition: item.condition || '',
      shipping:  item.shipping || '📦 Con costo',
      location:  item.location || '',
    };
  },

  // ── Buscar por nombre de producto (para el modal) ───────────────
  async searchForProduct(productName, category) {
    const results = await this.searchTrending(productName, 4);
    // Los resultados ya vienen formateados del backend
    return results.map(item => this.formatItem(item));
  },
};

// ── Función global para buscar en ML y renderizar en modal ──────────
async function loadMLResults(productName) {
  const container = document.getElementById('mlResults');
  if (!container) return;
  container.innerHTML = `<div class="loading-inline"><div class="spinner-sm"></div> Buscando en MercadoLibre...</div>`;

  // Intentar búsqueda autenticada via backend
  let results = [];
  let backendOk = false;
  try {
    results = await ML_API.searchForProduct(productName);
    backendOk = true;
  } catch(e) {
    backendOk = false;
  }

  if (results.length > 0) {
    // ✅ Resultados reales del backend OAuth
    container.innerHTML = results.map(item => `
      <div class="ml-item">
        <div class="ml-item-img">${item.thumbnail
          ? `<img src="${escHtml(item.thumbnail)}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:6px">`
          : '🛍️'}</div>
        <div class="ml-item-info">
          <div class="ml-item-name" title="${escHtml(item.name)}">${escHtml(item.name)}</div>
          <div class="ml-item-price">${fmtARS(item.price)}</div>
          <div class="ml-item-sold">${item.shipping} · ${item.sold > 0 ? item.sold.toLocaleString('es-AR') + ' vendidos' : 'Nuevo'}</div>
        </div>
        <a class="ml-item-link" href="${escHtml(item.url)}" target="_blank" rel="noopener">Ver →</a>
      </div>
    `).join('');

    const st = document.getElementById('mlStatus');
    if (st) st.innerHTML = `<span class="ml-dot"></span> Conectado · ${results.length} resultados`;

  } else {
    // Sin resultados o backend ML no configurado → mostrar iframe de búsqueda ML
    const mlSearchUrl = `https://listado.mercadolibre.com.ar/${encodeURIComponent(productName)}`;
    container.innerHTML = `
      <div style="padding:0.75rem 1rem;background:rgba(255,230,0,0.08);border-radius:10px;border:1px solid rgba(255,230,0,0.2);margin-bottom:0.75rem">
        <div style="font-size:0.78rem;color:var(--muted);margin-bottom:0.4rem">
          ${backendOk
            ? '⚠️ ML API no configurada (agregá ML_CLIENT_ID y ML_CLIENT_SECRET al .env)'
            : '⚠️ No se pudo conectar con el backend'}
        </div>
        <div style="font-size:0.82rem;color:var(--fg);font-weight:600">Podés buscar directamente en MercadoLibre:</div>
      </div>
      <a href="${mlSearchUrl}" target="_blank" rel="noopener"
         style="display:flex;align-items:center;gap:0.75rem;padding:0.9rem 1rem;background:var(--surface2);border-radius:10px;text-decoration:none;border:1px solid rgba(255,255,255,0.07);transition:background 0.2s"
         onmouseover="this.style.background='rgba(255,230,0,0.1)'" onmouseout="this.style.background='var(--surface2)'">
        <span style="font-size:1.5rem">🛒</span>
        <div>
          <div style="color:var(--fg);font-weight:600;font-size:0.88rem">Buscar "${escHtml(productName)}" en MercadoLibre</div>
          <div style="color:var(--blue);font-size:0.75rem;margin-top:2px">mercadolibre.com.ar →</div>
        </div>
      </a>
    `;
  }
}

// Helpers
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// fmtARS se define en app.js pero la declaramos acá también por si se usa sola
function fmtARS_ml(n) {
  return '$' + Math.round(n).toLocaleString('es-AR');
}

