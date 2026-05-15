/* ═══════════════════════════════════════════════
   app.js — Lógica principal
   Marketplace R45
   ═══════════════════════════════════════════════ */

// ── CONFIG API BACKEND ───────────────────────────────────────────────
// FIX Bug 3: En local el frontend y backend corren juntos (mismo origen).
// En producción (Railway) el backend también sirve el frontend → mismo origen.
// Si tu frontend está en Netlify/Vercel separado del backend, reemplazá
// window.location.origin por tu URL de Railway, ej:
// const API_URL = 'https://r45-api.up.railway.app';
const API_URL = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
  ? window.location.origin   // local: frontend y backend en el mismo puerto
  : window.location.origin;  // produccion: backend sirve el frontend (Railway)

// ── ESTADO GLOBAL ────────────────────────────────────────────────────
let allProducts  = [];
let wishlist     = [];
let currentProduct = null;
let activeFilter = 'all';
let activeTipo   = 'blue';
let dolares      = { blue: 0, oficial: 0, mep: 0, ccl: 0, tarjeta: 0 };
let startTime    = Date.now();
let activeStores = ['MercadoLibre'];
let customPrompt = '';

// Constantes de impuestos Argentina
const TAX = {
  iva:         0.21,
  percIva:     0.21,
  percGan:     0.30,
  impPais:     0.00, // Derogado en dic 2024
  comisionML:  0.13,
  envioExt:    0.12,
  envioLocal:  0.05,
};

// ── TIMER ────────────────────────────────────────────────────────────
setInterval(() => {
  const el = document.getElementById('updated');
  if (el) el.textContent = Math.floor((Date.now() - startTime) / 1000);
}, 1000);

// ══════════════════════════════════════════════════════
// DÓLAR EN TIEMPO REAL
// ══════════════════════════════════════════════════════
async function fetchDolar() {
  try {
    // API pública argentina (sin key requerida)
    const [r1, r2] = await Promise.all([
      fetch('https://dolarapi.com/v1/dolares').catch(() => null),
      fetch('https://api.bluelytics.com.ar/v2/latest').catch(() => null),
    ]);

    if (r1 && r1.ok) {
      const arr = await r1.json();
      arr.forEach(d => {
        if (d.casa === 'blue')              dolares.blue    = d.venta;
        if (d.casa === 'oficial')           dolares.oficial = d.venta;
        if (d.casa === 'bolsa')             dolares.mep     = d.venta;
        if (d.casa === 'contadoconliqui')   dolares.ccl     = d.venta;
        if (d.casa === 'tarjeta')           dolares.tarjeta = d.venta;
      });
    }

    // Fallback con Bluelytics si falta algún valor
    if ((!dolares.blue || !dolares.oficial) && r2 && r2.ok) {
      const d2 = await r2.json();
      if (!dolares.blue    && d2.blue)    dolares.blue    = d2.blue.value_sell;
      if (!dolares.oficial && d2.oficial) dolares.oficial = d2.oficial.value_sell;
    }

    // Fallback a valores aproximados
    if (!dolares.blue)    dolares.blue    = 1320;
    if (!dolares.oficial) dolares.oficial = 1080;
    if (!dolares.mep)     dolares.mep     = Math.round(dolares.blue * 0.95);
    if (!dolares.ccl)     dolares.ccl     = Math.round(dolares.blue * 0.97);
    if (!dolares.tarjeta) dolares.tarjeta = Math.round(dolares.oficial * 1.573);

    renderDolarBar();
    const el = document.getElementById('s-dolar');
    if (el) el.textContent = '$' + Math.round(dolares.blue).toLocaleString('es-AR');
    startTime = Date.now();

  } catch (e) {
    console.error('[Dolar] Error:', e);
    dolares = { blue: 1320, oficial: 1080, mep: 1254, ccl: 1281 };
    renderDolarBar();
  }
}

function renderDolarBar() {
  const items = [
    { name: '💵 Blue',         val: dolares.blue,    color: 'var(--blue)' },
    { name: '🏦 Oficial',      val: dolares.oficial, color: 'var(--green)' },
    { name: '📊 MEP/Bolsa',    val: dolares.mep,     color: 'var(--yellow)' },
    { name: '🌐 CCL',          val: dolares.ccl,     color: 'var(--accent)' },
    { name: '💳 Tarjeta',      val: dolares.tarjeta, color: 'var(--accent2)' },
  ];
  const spread = ((dolares.blue - dolares.oficial) / dolares.oficial * 100).toFixed(1);

  document.getElementById('dolarBar').innerHTML =
    items.map((it, i) => `
      ${i > 0 ? '<div class="dolar-sep"></div>' : ''}
      <div class="dolar-item">
        <span class="dolar-name">${it.name}</span>
        <span class="dolar-val" style="color:${it.color}">$${Math.round(it.val).toLocaleString('es-AR')}</span>
      </div>
    `).join('') +
    `<div class="dolar-sep"></div>
     <div class="dolar-item">
       <span class="dolar-name">📈 Brecha</span>
       <span class="dolar-val" style="color:var(--red)">${spread}%</span>
     </div>
     <div class="dolar-sep"></div>
     <div class="dolar-item" style="gap:4px">
       <span class="tag-live">LIVE</span>
       <span class="tag-source">dolarapi.com</span>
     </div>`;
}

// ══════════════════════════════════════════════════════
// CALCULADORA DE COSTOS
// ══════════════════════════════════════════════════════
function calcularCosto(priceUSD, vendorType) {
  const tc      = dolares[activeTipo] || dolares.blue || 1320;
  const baseARS = priceUSD * tc;
  const desglose = [];
  let total      = baseARS;

  desglose.push({ lbl: `Precio base (USD ${priceUSD.toFixed(2)})`, val: baseARS, color: 'var(--text)' });
  desglose.push({ lbl: 'Tipo de cambio', val: null, extra: '$' + Math.round(tc).toLocaleString('es-AR') + '/USD' });

  if (vendorType === 'exterior') {
    const impPais  = baseARS * TAX.impPais;
    const sub1     = baseARS + impPais;
    const iva      = sub1 * TAX.iva;
    const percIva  = sub1 * TAX.percIva;
    const percGan  = sub1 * TAX.percGan;
    const envio    = Math.round(baseARS * TAX.envioExt);

    desglose.push({ lbl: 'Impuesto PAIS (Derogado)',   val: impPais,  color: 'var(--muted)' });
    desglose.push({ lbl: 'IVA 21%',                    val: iva,      color: 'var(--red)' });
    desglose.push({ lbl: 'Percepción IVA AFIP 21%',    val: percIva,  color: 'var(--red)' });
    desglose.push({ lbl: 'Percepción Ganancias 30%',   val: percGan,  color: 'var(--yellow)', note: '*recuperable' });
    desglose.push({ lbl: 'Envío internacional est.',   val: envio,    color: 'var(--muted)' });

    total = sub1 + iva + percIva + percGan + envio;
  } else {
    const envio = Math.round(baseARS * TAX.envioLocal);
    const iva   = baseARS * TAX.iva;
    desglose.push({ lbl: 'Envío local estimado',     val: envio, color: 'var(--muted)' });
    desglose.push({ lbl: 'IVA incluido ~21%',        val: iva,   color: 'var(--yellow)' });
    total = baseARS + envio;
  }

  desglose.push({ lbl: 'COSTO TOTAL REAL', val: total, color: 'var(--red)', isTotal: true });
  return { total, desglose, tc };
}


// ══════════════════════════════════════════════════════
// SELECTOR DE TIENDAS Y PROMPT CUSTOM
// ══════════════════════════════════════════════════════
function toggleStore(store) {
  // Una sola tienda activa a la vez — hace más sentido con la nueva lógica
  activeStores = [store];
  document.querySelectorAll('.store-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.store === store);
  });
  _ai_cache_clear();
  if (store === 'MercadoLibre') {
    showToast('🛒 MercadoLibre — productos reales más vendidos');
  } else {
    showToast(`🌍 ${store} — consultando IA...`);
  }
  loadProducts(true);
}

function _ai_cache_clear() {
  // FIX Bug 2: resetear allProducts para que loadProducts() no use datos en cache
  // y vaya directo al backend de IA a buscar productos frescos.
  allProducts = [];
}

function applyCustomPrompt() {
  const inp = document.getElementById('customPromptInput');
  customPrompt = inp ? inp.value.trim() : '';
  if (!customPrompt) { showToast('Escribí algo para la IA primero', 'red'); return; }
  showToast('🤖 Consultando IA con tu prompt...');
  _ai_cache_clear();
  loadProducts();
}

function clearCustomPrompt() {
  customPrompt = '';
  const inp = document.getElementById('customPromptInput');
  if (inp) inp.value = '';
  showToast('Prompt limpiado');
  _ai_cache_clear();
  loadProducts();
}

// ══════════════════════════════════════════════════════
// CARGA DE PRODUCTOS (IA)
// ══════════════════════════════════════════════════════
async function loadProducts(forceAI = false) {

  // ── Lógica de routing ────────────────────────────────────────────────
  // MODO ML:  tienda activa = MercadoLibre, sin prompt custom → /products (datos reales)
  // MODO IA:  tienda externa (AliExpress/Temu/etc.) O prompt custom → /ai-products (Gemini)
  const activeStore   = activeStores[0] || 'MercadoLibre';
  const isMLStore     = activeStore === 'MercadoLibre';
  const needsAI       = forceAI && !isMLStore || !!customPrompt || (!isMLStore);

  // MODO 1: MercadoLibre → productos reales más vendidos ahora
  if (!needsAI || (isMLStore && !customPrompt)) {
    const grid = document.getElementById('grid');
    if (grid) grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:4rem;color:var(--muted)">
        <div style="font-size:2rem;margin-bottom:1rem;animation:spin 1s linear infinite;display:inline-block">🛒</div>
        <div style="font-size:1.1rem;font-weight:600;color:var(--fg)">Cargando productos reales...</div>
        <div style="margin-top:.5rem;font-size:.85rem">MercadoLibre Argentina · más vendidos ahora</div>
      </div>`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const catParam = activeFilter !== 'all' ? `?category=${encodeURIComponent(activeFilter)}` : '';
      const resp = await fetch(`${API_URL}/products${catParam}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (resp.ok) {
        const data = await resp.json();
        if (data.products && data.products.length > 0) {
          allProducts = data.products.map(p => {
            const imgQ = encodeURIComponent((p.image_query || p.name).split(' ').slice(0,5).join(' '));
            return {
              id: p.id, name: p.name, category: p.category,
              emoji: p.emoji || '🛍️',
              image_url: p.image_url || `${API_URL}/image?q=${imgQ}&w=320&h=200`,
              price_usd: p.price_usd,
              price_sell_ars: p.price_sell_ars,
              ml_price_ars: p.ml_price_ars,
              costo_real: p.costo_real,
              ganancia_ars: p.ganancia_ars,
              vendor_type: p.vendor_type || 'local',
              seller: p.seller || 'MercadoLibre', seller_url: p.seller_url,
              buy_options: p.buy_options, sales_month: p.sales_month,
              rating: p.rating, trend: p.trend, desc: p.desc || p.description,
              _costo_real: p.costo_real, _margin_pct: p.margin_pct, _ganancia: p.ganancia_ars,
            };
          });
          if (data.dolar) { dolares = { ...dolares, ...data.dolar }; renderDolarBar(); }
          allProducts.forEach(p => PriceHistory.save(p.id, p.price_sell_ars));
          renderGrid(allProducts); updateStats(allProducts);
          Alerts.check(allProducts, dolares, activeTipo);
          const st = document.getElementById('mlStatus');
          const src = data.source === 'mercadolibre' ? '🛒 MercadoLibre en vivo' : '📦 Base de datos';
          if (st) st.innerHTML = `<span class="ml-dot"></span> ${src} · ${allProducts.length} productos`;
          startTime = Date.now();
          return;
        }
      }
    } catch (e) {
      console.warn('[ML] Error cargando productos reales:', e.message);
      const g = document.getElementById('grid');
      if (g) g.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--muted)">
          <div style="font-size:2rem;margin-bottom:1rem">🛒</div>
          <div style="font-size:1rem;margin-bottom:.5rem;color:var(--fg)">No se pudieron cargar productos de MercadoLibre</div>
          <div style="font-size:.8rem;opacity:.7;margin-bottom:1.5rem">${e.message}</div>
          <button onclick="refreshAll()" style="padding:.5rem 1.2rem;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer">🔄 Reintentar</button>
        </div>`;
      return;
    }
  }

  // MODO 2: IA (Gemini) — para tiendas externas o prompts custom
  const grid = document.getElementById('grid');
  const storeName = activeStore !== 'MercadoLibre' ? activeStore : '';
  const loadingMsg = customPrompt
    ? `🤖 Consultando IA: "<em>${customPrompt}</em>"`
    : storeName
      ? `🌍 Buscando productos de <strong>${storeName}</strong> con IA...`
      : activeFilter !== 'all'
        ? `🔍 Buscando productos de <strong>${activeFilter}</strong> con IA...`
        : 'Consultando IA para Argentina...';

  if (grid) grid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:4rem;color:var(--muted)">
      <div style="font-size:2rem;margin-bottom:1rem;animation:spin 1s linear infinite;display:inline-block">⚙️</div>
      <div style="font-size:1.1rem;font-weight:600;color:var(--fg)">Consultando IA...</div>
      <div style="margin-top:.5rem;font-size:.85rem">${loadingMsg}</div>
    </div>`;

  try {
    const backendUrl = API_URL || 'http://localhost:8000';
    const controller2 = new AbortController();
    const timeout2 = setTimeout(() => controller2.abort(), 30000); // 30 seg para Gemini
    const activeStore2 = activeStores[0] || 'AliExpress';
    const storesParam  = activeStore2 !== 'MercadoLibre' ? activeStore2 : 'AliExpress';
    const catParam2    = activeFilter !== 'all' ? activeFilter : '';
    const promptParam  = customPrompt ? '&custom_prompt=' + encodeURIComponent(customPrompt) : '';
    const url = `${backendUrl}/ai-products?category=${encodeURIComponent(catParam2)}&stores=${encodeURIComponent(storesParam)}${promptParam}`;
    const resp = await fetch(url, { signal: controller2.signal });
    clearTimeout(timeout2);
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 200)}`);
    }
    const data = await resp.json();

    if (!data.products || data.products.length === 0) {
      throw new Error('La IA no devolvió productos');
    }

    allProducts = data.products.map(p => {
      const imgQ = encodeURIComponent((p.image_query || p.name).split(' ').slice(0,5).join(' '));
      return {
        id: p.id, name: p.name, category: p.category,
        emoji: p.emoji || '📦', image_query: p.image_query || null,
        // image_url: usar el proxy del backend que redirige a Bing CDN
        image_url: `${API_URL}/image?q=${imgQ}&w=320&h=200`,
        price_usd: p.price_usd,
        price_sell_ars: p.price_sell_ars, vendor_type: p.vendor_type || 'exterior',
        seller: p.seller, seller_url: p.seller_url, buy_options: p.buy_options,
        sales_month: p.sales_month, rating: p.rating,
        trend: p.trend, desc: p.desc,
        _costo_real: p.costo_real, _margin_pct: p.margin_pct, _ganancia: p.ganancia_ars,
      };
    });

    if (data.dolar) {
      dolares = { ...dolares, ...data.dolar };
      renderDolarBar();
    }

    allProducts.forEach(p => PriceHistory.save(p.id, p.price_sell_ars));
    renderGrid(allProducts); updateStats(allProducts);
    Alerts.check(allProducts, dolares, activeTipo);

    const label = customPrompt ? `Prompt: "${customPrompt}"` : activeFilter !== 'all' ? activeFilter : 'General';
    const st = document.getElementById('mlStatus');
    if (st) st.innerHTML = `<span class="ml-dot" style="background:var(--blue)"></span> IA · ${label} · ${allProducts.length} productos`;
    startTime = Date.now();

  } catch (e) {
    console.error('[Products] Error IA:', e);
    if (grid) grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--muted)">
        <div style="font-size:2rem;margin-bottom:1rem">⚠️</div>
        <div style="font-size:1rem;color:var(--red);margin-bottom:.5rem">Error al consultar la IA</div>
        <div style="font-size:.8rem;opacity:.7;max-width:400px;margin:0 auto;font-family:monospace">${e.message}</div>
        <button onclick="refreshAll()" style="margin-top:1.5rem;padding:.5rem 1.2rem;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer">🔄 Reintentar</button>
      </div>`;
    // Solo usar fallback si no hay ningún producto cargado todavía
    // y solo en modo general (sin prompt/filtro activo)
    // Sin fallback de datos falsos — si falla, el usuario ve el error y puede reintentar.
  }
}
// useFallback() eliminado — no se muestran datos falsos al usuario.

// ══════════════════════════════════════════════════════
// RENDER GRID
// ══════════════════════════════════════════════════════
function renderGrid(products) {
  const grid = document.getElementById('grid');
  if (!products.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--muted)">Sin productos en esta categoría</div>';
    return;
  }

  grid.innerHTML = products.map((p, idx) => {
    const { total }   = calcularCosto(p.price_usd || 20, p.vendor_type || 'exterior');
    const ganancia    = p.price_sell_ars - total;
    const margen      = ((ganancia / total) * 100).toFixed(1);
    const m           = parseFloat(margen);
    const cls         = m >= 40 ? 'hot' : m >= 15 ? 'warm' : 'cold';
    const barW        = Math.min(Math.abs(m) * 1.0, 100);
    const trendClass  = p.trend?.includes('NUEVO') ? 'new-badge' : p.trend?.includes('PREMIUM') ? 'prem-badge' : '';
    const animDelay   = `animation-delay:${idx * 0.05}s`;

    // Gradientes por categoría como fallback
    const catGradients = {
      'Electrónica': 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      'Moda':        'linear-gradient(135deg, #2d1b4e 0%, #4a1942 50%, #893168 100%)',
      'Hogar':       'linear-gradient(135deg, #1b2e1a 0%, #1e4620 50%, #2d6a30 100%)',
      'Deportes':    'linear-gradient(135deg, #2e1a1a 0%, #4a2020 50%, #8b3030 100%)',
      'Belleza':     'linear-gradient(135deg, #2e1a2a 0%, #4a2045 50%, #8b3070 100%)',
      'Juguetes':    'linear-gradient(135deg, #1a2a2e 0%, #204a50 50%, #308b80 100%)',
      'Mascotas':    'linear-gradient(135deg, #2e2a1a 0%, #4a4020 50%, #8b7030 100%)',
    };
    const catGrad = catGradients[p.category] || 'linear-gradient(135deg, #1a1a2e 0%, #252540 100%)';

    // Usar imagen real si el backend la encontró, sino gradient+emoji
    const hasImage = p.image_url && p.image_url.length > 10;
    const cardImgContent = hasImage
      ? `<img src="${p.image_url}" 
             onerror="this.parentElement.style.background='${catGrad}'; this.outerHTML='<span style=\\'font-size:2.8rem\\'>${p.emoji || '📦'}</span>'"
             loading="lazy" alt="${p.name}" 
             style="width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0">`
      : `<span style="font-size:2.8rem; filter:drop-shadow(0 4px 8px rgba(0,0,0,0.3))">${p.emoji || '📦'}</span>
         <span style="font-size:0.65rem; color:rgba(255,255,255,0.5); font-weight:600; text-align:center; padding:0 1rem; line-height:1.3; max-width:90%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${p.name}</span>`;

    return `
      <div class="card" onclick="openModal('${p.id}')" style="${animDelay}">
        <div class="card-img" style="background:${catGrad};${hasImage ? '' : ' display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0.3rem;'}">
          ${cardImgContent}
          <div class="trend-badge ${trendClass}">${p.trend || '🔥 HOT'}</div>
          ${p.vendor_type === 'local' ? '<div class="ml-badge">ML</div>' : ''}
        </div>
        <div class="card-body">
          <div class="card-cat">${p.category}</div>
          <div class="card-name">${p.name}</div>
          <div class="card-seller">vía ${p.seller || 'AliExpress'} · USD ${p.price_usd}</div>

          ${p.vendor_type === 'local' ? `
          <div class="costo-box">
            <div class="costo-row">
              <span class="costo-lbl">Precio actual ML</span>
              <span class="costo-val">${fmtARS(p.ml_price_ars || p.price_sell_ars / 1.30)}</span>
            </div>
            <div class="costo-row">
              <span class="costo-lbl">Comisión ML 13% + envío</span>
              <span class="costo-val" style="color:var(--red)">+${fmtARS((p.costo_real || total) - (p.ml_price_ars || p.price_sell_ars / 1.30))}</span>
            </div>
            <hr class="costo-sep">
            <div class="costo-row">
              <span class="costo-total-lbl">Tu costo total</span>
              <span class="costo-total-val">${fmtARS(p.costo_real || total)}</span>
            </div>
          </div>
          <div class="prices">
            <div class="price-box">
              <div class="price-lbl">Revendés a</div>
              <div class="price-val" style="color:var(--green)">${fmtARS(p.price_sell_ars)}</div>
            </div>
            <div class="price-box">
              <div class="price-lbl">Ganás</div>
              <div class="price-val" style="color:${m >= 0 ? 'var(--yellow)' : 'var(--red)'}">${fmtARS(p.ganancia_ars || ganancia)}</div>
            </div>
          </div>` : `
          <div class="costo-box">
            <div class="costo-row">
              <span class="costo-lbl">Base ARS</span>
              <span class="costo-val">${fmtARS((p.price_usd || 20) * (dolares[activeTipo] || dolares.blue || 1320))}</span>
            </div>
            <div class="costo-row">
              <span class="costo-lbl">Imp. + envío</span>
              <span class="costo-val" style="color:var(--red)">+${fmtARS(total - (p.price_usd || 20) * (dolares[activeTipo] || dolares.blue || 1320))}</span>
            </div>
            <hr class="costo-sep">
            <div class="costo-row">
              <span class="costo-total-lbl">Costo real</span>
              <span class="costo-total-val">${fmtARS(total)}</span>
            </div>
          </div>
          <div class="prices">
            <div class="price-box">
              <div class="price-lbl">Revendés a</div>
              <div class="price-val" style="color:var(--green)">${fmtARS(p.price_sell_ars)}</div>
            </div>
            <div class="price-box">
              <div class="price-lbl">Ganás</div>
              <div class="price-val" style="color:${m >= 0 ? 'var(--yellow)' : 'var(--red)'}">${fmtARS(ganancia)}</div>
            </div>
          </div>`}

          <div class="margin-row">
            <span class="margin-label">Margen neto real</span>
            <span class="margin-pct ${cls}">${m >= 0 ? '+' : ''}${margen}%</span>
          </div>
          <div class="margin-bar">
            <div class="margin-fill fill-${cls}" style="width:${barW}%"></div>
          </div>

          <div class="sales-row">
            <div class="sales-info"><strong>${(p.sales_month || 0).toLocaleString('es-AR')}</strong> ventas/mes</div>
            <div class="rating">★ ${p.rating}</div>
          </div>

          <div class="card-actions">
            <button class="btn-primary" onclick="event.stopPropagation(); window.open('${p.buy_options?.exterior?.url || p.seller_url}','_blank')">🛒 Ver en ${p.buy_options ? (p.buy_options.exterior?.name || p.seller || 'Proveedor') : (p.seller || 'Proveedor')} →</button>
            <button class="btn-icon"    onclick="event.stopPropagation(); saveProduct('${p.id}')" title="Guardar">📌</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ══════════════════════════════════════════════════════
// STATS BAR
// ══════════════════════════════════════════════════════
function updateStats(products) {
  if (!products || !products.length) {
    document.getElementById('s-total').textContent = '0';
    document.getElementById('s-avg').textContent   = '—';
    document.getElementById('s-best').textContent  = '—';
    return;
  }
  const margins = products.map(p => {
    const { total } = calcularCosto(p.price_usd || 20, p.vendor_type || 'exterior');
    return (p.price_sell_ars - total) / total * 100;
  }).filter(m => !isNaN(m));

  const avg  = (margins.reduce((a, b) => a + b, 0) / margins.length).toFixed(0);
  const best = Math.max(...margins).toFixed(0);

  document.getElementById('s-total').textContent = products.length;
  document.getElementById('s-avg').textContent   = (avg > 0 ? '+' : '') + avg + '%';
  document.getElementById('s-best').textContent  = (best > 0 ? '+' : '') + best + '%';
}

// ══════════════════════════════════════════════════════
// MODAL PRODUCTO
// ══════════════════════════════════════════════════════
function openModal(id) {
  const p = allProducts.find(x => String(x.id) === String(id));
  if (!p) return;
  currentProduct = p;

  const mImg = document.getElementById('m-img');
  {
    const catGradients = {
      'Electrónica': 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      'Moda':        'linear-gradient(135deg, #2d1b4e 0%, #4a1942 50%, #893168 100%)',
      'Hogar':       'linear-gradient(135deg, #1b2e1a 0%, #1e4620 50%, #2d6a30 100%)',
      'Deportes':    'linear-gradient(135deg, #2e1a1a 0%, #4a2020 50%, #8b3030 100%)',
      'Belleza':     'linear-gradient(135deg, #2e1a2a 0%, #4a2045 50%, #8b3070 100%)',
      'Juguetes':    'linear-gradient(135deg, #1a2a2e 0%, #204a50 50%, #308b80 100%)',
      'Mascotas':    'linear-gradient(135deg, #2e2a1a 0%, #4a4020 50%, #8b7030 100%)',
    };
    const catGrad = catGradients[p.category] || 'linear-gradient(135deg, #1a1a2e 0%, #252540 100%)';
    mImg.style.background = catGrad;
    {
      const mImgQ = encodeURIComponent((p.image_query || p.name).split(' ').slice(0,5).join(' '));
      const mSrc  = `${API_URL}/image?q=${mImgQ}&w=400&h=220`;
      const mSeed = Math.abs(String(p.id).split('').reduce((a,c) => a + c.charCodeAt(0), 0)) % 9999 + 1;
      mImg.innerHTML = `<img src="${mSrc}"
        onerror="this.src='https://picsum.photos/seed/${mSeed}/400/220'; this.onerror=null;"
        alt="${p.name}"
        style="width:100%;height:100%;object-fit:cover;border-radius:12px 12px 0 0">`;
    }
  }
  document.getElementById('m-cat').textContent    = p.category;
  document.getElementById('m-name').textContent   = p.name;
  document.getElementById('m-seller').textContent = 'vía ' + (p.seller || 'AliExpress') + ' · USD ' + p.price_usd;
  document.getElementById('m-rating').textContent = '★ ' + p.rating + ' · ' + (p.sales_month || 0).toLocaleString('es-AR') + ' ventas/mes';
  document.getElementById('m-desc').textContent   = p.desc || '';
  
  const buyContainer = document.getElementById('m-buy-container');
  if (p.buy_options) {
    buyContainer.innerHTML = `
      <button class="btn-full btn-buy" onclick="window.open('${p.buy_options.local.url}', '_blank')" style="margin-bottom:0.2rem">🛒 ${p.buy_options.local.name}</button>
      <button class="btn-full btn-buy" onclick="window.open('${p.buy_options.exterior.url}', '_blank')" style="background:var(--blue)">🌍 ${p.buy_options.exterior.name}</button>
    `;
  } else if (p.seller_url) {
    buyContainer.innerHTML = `<button class="btn-full btn-buy" id="m-buy-btn">🛒 Ir a ${p.seller || 'Proveedor'} →</button>`;
    document.getElementById('m-buy-btn').onclick = () => window.open(p.seller_url, '_blank');
  } else {
    buyContainer.innerHTML = `<button class="btn-full btn-buy" id="m-buy-btn">🛒 Buscar en AliExpress</button>`;
    document.getElementById('m-buy-btn').onclick = () => window.open('https://www.aliexpress.com/wholesale?SearchText=' + encodeURIComponent(p.name), '_blank');
  }

  // Resetear tabs
  activateTab('calc');
  renderCalcTab(p);

  // Tipo de cambio
  document.querySelectorAll('.tipo-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tipo === activeTipo);
    b.onclick = () => {
      activeTipo = b.dataset.tipo;
      document.querySelectorAll('.tipo-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      renderCalcTab(p);
      renderGrid(activeFilter === 'all' ? allProducts : allProducts.filter(x => x.category === activeFilter));
    };
  });

  document.getElementById('modal').classList.add('open');
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
}

function activateTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tabId));
}

// Tabs click
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const tabId = tab.dataset.tab;
    activateTab(tabId);
    if (tabId === 'hist' && currentProduct) renderPriceChart(currentProduct);
    if (tabId === 'ml'   && currentProduct) loadMLResults(currentProduct.name);
  });
});

// ── Renderizar tab calculadora ───────────────────────────────────────
function renderCalcTab(p) {
  const { total, desglose, tc } = calcularCosto(p.price_usd || 20, p.vendor_type || 'exterior');
  const priceSell     = p.price_sell_ars || 0;
  const ganancia      = priceSell - total;
  const margen        = total > 0 ? (ganancia / total * 100).toFixed(1) : "0.0";
  const comML         = priceSell * TAX.comisionML;
  const gananciaML    = ganancia - comML;
  const margenML      = total > 0 ? (gananciaML / total * 100).toFixed(1) : "0.0";

  // Prices summary
  document.getElementById('m-prices').innerHTML = `
    <div class="calc-box">
      <div class="calc-lbl">Precio USD</div>
      <div class="calc-val">USD ${p.price_usd}</div>
    </div>
    <div class="calc-box">
      <div class="calc-lbl">TC ${activeTipo.toUpperCase()}</div>
      <div class="calc-val" style="color:var(--blue)">$${Math.round(tc).toLocaleString('es-AR')}</div>
    </div>
    <div class="calc-box">
      <div class="calc-lbl">Costo total</div>
      <div class="calc-val" style="color:var(--red)">${fmtARS(total)}</div>
    </div>
    <div class="calc-box">
      <div class="calc-lbl">Precio reventa</div>
      <div class="calc-val" style="color:var(--green)">${fmtARS(priceSell)}</div>
    </div>
  `;

  // Desglose
  document.getElementById('m-desglose').innerHTML = `
    <div class="desglose-title">📋 Desglose completo de costos</div>
    ${desglose.map(d => {
      if (d.isTotal) return `<div class="desglose-row total"><span class="desglose-lbl">${d.lbl}</span><span class="desglose-val" style="color:var(--red)">${fmtARS(d.val)}</span></div>`;
      if (d.val === null) return `<div class="desglose-row"><span class="desglose-lbl">${d.lbl}</span><span class="desglose-val" style="color:var(--blue)">${d.extra}</span></div>`;
      return `<div class="desglose-row">
        <span class="desglose-lbl">${d.lbl}${d.note ? ' <span class="note-tag">' + d.note + '</span>' : ''}</span>
        <span class="desglose-val" style="color:${d.color || 'var(--text)'}">${fmtARS(d.val)}</span>
      </div>`;
    }).join('')}
    <div class="desglose-row">
      <span class="desglose-lbl">Comisión ML 13% (si vendés en ML)</span>
      <span class="desglose-val" style="color:var(--red)">${fmtARS(comML)}</span>
    </div>
  `;

  // Ganancia box
  const gc  = parseFloat(margen)   >= 0 ? 'var(--green)' : 'var(--red)';
  const gc2 = parseFloat(margenML) >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('m-ganancia').innerHTML = `
    <div>
      <div class="gan-lbl">Ganancia bruta</div>
      <div class="gan-val" style="color:${gc}">${fmtARS(ganancia)}</div>
    </div>
    <div>
      <div class="gan-lbl">Margen bruto</div>
      <div class="gan-val" style="color:${gc}">${margen}%</div>
    </div>
    <div>
      <div class="gan-lbl">Margen post ML</div>
      <div class="gan-val" style="color:${gc2}">${margenML}%</div>
    </div>
  `;
}

// ══════════════════════════════════════════════════════
// WISHLIST — lógica en auth.js (persistente con Supabase)
// ══════════════════════════════════════════════════════
function addWishlist() {
  if (currentProduct) saveProduct(currentProduct.id);
}

// ══════════════════════════════════════════════════════
// FILTROS
// ══════════════════════════════════════════════════════
document.getElementById('filters').addEventListener('click', e => {
  if (!e.target.classList.contains('filter-btn')) return;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
  activeFilter = e.target.dataset.cat;
  // Si hay texto en el input del prompt, tomarlo también (aunque el usuario no haya presionado →)
  const inp = document.getElementById('customPromptInput');
  if (inp && inp.value.trim()) customPrompt = inp.value.trim();
  loadProducts();
});

// Cerrar modal al hacer clic fuera
document.getElementById('modal').addEventListener('click', e => {
  if (e.target === document.getElementById('modal')) closeModal();
});
document.getElementById('alertModal').addEventListener('click', e => {
  if (e.target === document.getElementById('alertModal')) closeAlertModal();
});

// ══════════════════════════════════════════════════════
// REFRESH
// ══════════════════════════════════════════════════════
async function refreshAll() {
  document.getElementById('grid').innerHTML = '<div class="loading-state"><div class="spinner"></div><div class="loading-text">Actualizando productos...</div></div>';
  await fetchDolar();
  await loadProducts();
  showToast('✅ Actualizado correctamente', 'green');
}

// ══════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent  = msg;
  t.className    = 'toast show' + (type ? ' ' + type : '');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ══════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════
function fmtARS(n) {
  return '$' + Math.round(n).toLocaleString('es-AR');
}

// ══════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════
async function init() {
  await fetchDolar();
  await loadProducts();
  // Actualizar dólar cada 5 minutos
  setInterval(fetchDolar, 5 * 60 * 1000);

  const promptInput = document.getElementById('customPromptInput');
  if (promptInput) {
    promptInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') applyCustomPrompt();
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
