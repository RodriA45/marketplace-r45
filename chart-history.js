/* ═══════════════════════════════════════════════
   chart-history.js — Historial de precios
   Marketplace R45
   ═══════════════════════════════════════════════ */

// ── Intentar historial real desde la API, sino simular ───────────────
async function loadRealHistory(productId) {
  if (typeof API_URL === 'undefined' || !API_URL) return null;
  try {
    const resp = await fetch(`${API_URL}/history/${productId}?days=30`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.labels && data.labels.length >= 3) return data;
  } catch (e) { console.warn('[History] API no disponible:', e.message); }
  return null;
}


let priceChartInstance = null;

// ── Generar historial simulado realista ──────────────────────────────
function generatePriceHistory(currentPrice, days = 30) {
  const prices = [];
  const labels = [];
  let price = currentPrice * (0.75 + Math.random() * 0.15); // precio inicial 75-90% del actual

  const today = new Date();

  for (let i = days; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    labels.push(date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }));

    // Movimiento realista: tendencia leve + ruido
    const trend    = (currentPrice - price) / days * 0.6; // tendencia hacia precio actual
    const noise    = price * (Math.random() * 0.04 - 0.02); // ±2% ruido diario
    const spike    = Math.random() > 0.92 ? price * (Math.random() * 0.06) : 0; // spikes ocasionales
    price = Math.max(price + trend + noise + spike, currentPrice * 0.5);

    prices.push(Math.round(price));
  }

  // Asegurarse de que el último precio sea el actual
  prices[prices.length - 1] = currentPrice;

  return { prices, labels };
}

// ── Renderizar el gráfico de historial ───────────────────────────────
async function renderPriceChart(product) {
  // Intentar datos reales de la API primero
  const realData = await loadRealHistory(product.id);
  if (realData && realData.labels.length >= 3) {
    _renderChart(product, realData.labels, realData.prices, realData.stats);
    return;
  }
  // Fallback: simular historial
  const { prices, labels } = generatePriceHistory(product.price_sell_ars, 30);
  _renderChart(product, labels, prices, null);
}

function _renderChart(product, labels, prices, apiStats) {
  const canvas = document.getElementById('priceChart');
  if (!canvas) return;

  // Destruir instancia anterior si existe
  if (priceChartInstance) {
    priceChartInstance.destroy();
    priceChartInstance = null;
  }

  const min    = Math.min(...prices);
  const max    = Math.max(...prices);
  const avg    = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  const change = ((prices[prices.length - 1] - prices[0]) / prices[0] * 100).toFixed(1);
  const isUp   = parseFloat(change) >= 0;

  // Stats debajo del gráfico
  const statsEl = document.getElementById('histStats');
  if (statsEl) {
    statsEl.innerHTML = `
      <div class="hist-stat-box">
        <div class="hist-stat-lbl">Mínimo 30d</div>
        <div class="hist-stat-val" style="color:var(--green)">${fmtARS(min)}</div>
      </div>
      <div class="hist-stat-box">
        <div class="hist-stat-lbl">Promedio</div>
        <div class="hist-stat-val">${fmtARS(avg)}</div>
      </div>
      <div class="hist-stat-box">
        <div class="hist-stat-lbl">Variación</div>
        <div class="hist-stat-val" style="color:${isUp ? 'var(--green)' : 'var(--red)'}">
          ${isUp ? '↑' : '↓'} ${Math.abs(change)}%
        </div>
      </div>
    `;
  }

  // Colores del gráfico
  const accent = isUp ? '#0fd68c' : '#f04545';
  const accentFade = isUp ? 'rgba(15,214,140,0.12)' : 'rgba(240,69,69,0.12)';

  const chartConfig = {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Precio de reventa (ARS)',
        data: prices,
        borderColor: accent,
        borderWidth: 2,
        fill: true,
        backgroundColor: (ctx) => {
          const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
          g.addColorStop(0, isUp ? 'rgba(15,214,140,0.25)' : 'rgba(240,69,69,0.25)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          return g;
        },
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: accent,
        tension: 0.4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#17172a',
          borderColor: '#252540',
          borderWidth: 1,
          titleColor: '#9090b8',
          bodyColor: '#eeeef8',
          bodyFont: { family: "'Syne', sans-serif", weight: '700', size: 13 },
          callbacks: {
            label: ctx => ' ' + fmtARS(ctx.parsed.y),
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#6060a0',
            font: { family: "'DM Sans', sans-serif", size: 10 },
            maxTicksLimit: 8,
            maxRotation: 0,
          },
          border: { color: 'rgba(255,255,255,0.06)' },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#6060a0',
            font: { family: "'DM Sans', sans-serif", size: 10 },
            callback: v => '$' + (v / 1000).toFixed(0) + 'k',
          },
          border: { color: 'rgba(255,255,255,0.06)' },
        },
      },
    },
  };
  priceChartInstance = new Chart(canvas, chartConfig);
}

// ── Guardar precio en localStorage (para historial acumulativo real) ─
const PriceHistory = {
  STORAGE_KEY: 'r45_price_history',

  save(productId, price) {
    try {
      const history = this.load();
      if (!history[productId]) history[productId] = [];
      const today = new Date().toISOString().split('T')[0];
      // Guardar máximo un precio por día
      const lastEntry = history[productId][history[productId].length - 1];
      if (lastEntry && lastEntry.date === today) {
        lastEntry.price = price; // actualizar precio del día
      } else {
        history[productId].push({ date: today, price });
      }
      // Mantener solo los últimos 90 días
      if (history[productId].length > 90) {
        history[productId] = history[productId].slice(-90);
      }
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(history));
    } catch (e) {
      console.warn('[PriceHistory] No se pudo guardar:', e.message);
    }
  },

  load() {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}');
    } catch { return {}; }
  },

  getForProduct(productId) {
    return this.load()[productId] || [];
  },

  // Verificar si hay datos reales (más de 3 días de historial)
  hasRealData(productId) {
    return this.getForProduct(productId).length >= 3;
  },
};
