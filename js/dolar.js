/* ═══════════════════════════════════════
   MARKETPLACE R45 — Módulo Dólar
   Cotizaciones en tiempo real (dolarapi.com + bluelytics)
   ═══════════════════════════════════════ */

const Dolar = (() => {

  const state = {
    blue: 0, oficial: 0, mep: 0, ccl: 0,
    cripto: 0, tarjeta: 0,
    lastUpdate: null,
    source: 'cargando...'
  };

  const FALLBACK = { blue: 1320, oficial: 1080, mep: 1260, ccl: 1285, cripto: 1310, tarjeta: 1404 };

  async function fetch_() {
    try {
      const r = await fetch('https://dolarapi.com/v1/dolares', { cache: 'no-store' });
      if (!r.ok) throw new Error('dolarapi fallo');
      const arr = await r.json();
      arr.forEach(d => {
        if (d.casa === 'blue')            state.blue    = d.venta;
        if (d.casa === 'oficial')         state.oficial = d.venta;
        if (d.casa === 'bolsa')           state.mep     = d.venta;
        if (d.casa === 'contadoconliqui') state.ccl     = d.venta;
        if (d.casa === 'cripto')          state.cripto  = d.venta;
        if (d.casa === 'tarjeta')         state.tarjeta = d.venta;
      });
      state.source = 'dolarapi.com';
    } catch (_) {
      try {
        const r2 = await fetch('https://api.bluelytics.com.ar/v2/latest');
        const d2 = await r2.json();
        state.blue    = d2.blue?.value_sell    || FALLBACK.blue;
        state.oficial = d2.oficial?.value_sell || FALLBACK.oficial;
        state.source  = 'bluelytics.com.ar';
      } catch (_2) {
        Object.assign(state, FALLBACK);
        state.source = 'valores estimados';
      }
    }

    // Derivados si faltan
    if (!state.mep)     state.mep     = Math.round(state.blue * 0.955);
    if (!state.ccl)     state.ccl     = Math.round(state.blue * 0.975);
    if (!state.cripto)  state.cripto  = Math.round(state.blue * 0.995);
    if (!state.tarjeta) state.tarjeta = Math.round(state.oficial * 1.30);

    state.lastUpdate = new Date();
    return state;
  }

  function get(tipo = 'blue') {
    return state[tipo] || state.blue || FALLBACK.blue;
  }

  function brecha() {
    if (!state.blue || !state.oficial) return 0;
    return (((state.blue - state.oficial) / state.oficial) * 100).toFixed(1);
  }

  function formatTime() {
    if (!state.lastUpdate) return '—';
    return state.lastUpdate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }

  return { fetch: fetch_, get, brecha, formatTime, state };
})();

window.Dolar = Dolar;
