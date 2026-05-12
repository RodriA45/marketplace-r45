/* ═══════════════════════════════════════
   MARKETPLACE R45 — Calculadora de Costos
   Impuestos Argentina vigentes 2025
   ═══════════════════════════════════════ */

const Calc = (() => {

  // ── TASAS VIGENTES ──────────────────────────────────────────────
  const TASAS = {
    iva:              0.21,   // IVA 21%
    percepcion_iva:   0.21,   // Percepción IVA AFIP (Res. 3819/17)
    percepcion_gan:   0.30,   // Percepción Ganancias (Res. 4815/20) — recuperable
    imp_pais:         0.17,   // Impuesto PAIS (reducido 2024, desde 18 hs 13/09/24 a 17.5)
    comision_ml:      0.13,   // Comisión MercadoLibre estándar
    comision_ml_full: 0.065,  // ML Full (con depósito)
    envio_ext_pct:    0.12,   // Envío internacional estimado % del precio base
    envio_local_flat: 2500,   // Envío local estimado ARS
    iibb_caba:        0.03,   // Ingresos brutos CABA (referencia)
  };

  // ── CALCULAR COSTO COMPRA ────────────────────────────────────────
  function costoCompra(precioUSD, vendorType = 'exterior', tipoTC = 'blue', envio = true) {
    const tc      = Dolar.get(tipoTC);
    const baseARS = precioUSD * tc;
    const rows    = [];
    let   total   = baseARS;

    rows.push({ lbl: `Precio base (USD ${precioUSD.toFixed(2)})`, val: baseARS, color: 'text' });
    rows.push({ lbl: 'Tipo de cambio', val: null, extra: `$${fmtN(tc)}/USD · ${tipoTC.toUpperCase()}`, color: 'blue' });

    if (vendorType === 'exterior') {
      const imp_pais   = baseARS * TASAS.imp_pais;
      const subtotalIP = baseARS + imp_pais;
      const iva        = subtotalIP * TASAS.iva;
      const perc_iva   = subtotalIP * TASAS.percepcion_iva;
      const perc_gan   = subtotalIP * TASAS.percepcion_gan;
      const envioARS   = envio ? Math.round(baseARS * TASAS.envio_ext_pct) : 0;

      rows.push({ lbl: `Impuesto PAIS ${(TASAS.imp_pais*100).toFixed(0)}%`,    val: imp_pais,  color: 'red' });
      rows.push({ lbl: 'IVA 21%',                                               val: iva,       color: 'red' });
      rows.push({ lbl: 'Percepción IVA AFIP 21%',                               val: perc_iva,  color: 'red' });
      rows.push({ lbl: 'Percepción Ganancias 30%', note: '✶ recuperable AFIP',  val: perc_gan,  color: 'yellow' });
      if (envio) rows.push({ lbl: 'Envío internacional est.',                    val: envioARS,  color: 'muted' });

      total = subtotalIP + iva + perc_iva + perc_gan + envioARS;

    } else {
      // Vendedor local (MercadoLibre, tienda argentina)
      const envioARS = envio ? TASAS.envio_local_flat : 0;
      rows.push({ lbl: 'IVA incluido en precio', val: baseARS * TASAS.iva * 0.5, color: 'yellow', note: '~incluido' });
      if (envio) rows.push({ lbl: 'Envío local est.', val: envioARS, color: 'muted' });
      total = baseARS + envioARS;
    }

    rows.push({ lbl: 'COSTO TOTAL REAL', val: total, color: 'red', isTotal: true });
    return { total, rows, tc, baseARS };
  }

  // ── CALCULAR GANANCIA ────────────────────────────────────────────
  function ganancia(costoTotal, precioVenta, usarML = true, mlFull = false) {
    const comML     = usarML ? precioVenta * (mlFull ? TASAS.comision_ml_full : TASAS.comision_ml) : 0;
    const iibb      = precioVenta * TASAS.iibb_caba;
    const ganBruta  = precioVenta - costoTotal;
    const ganNeta   = ganBruta - comML - iibb;
    const margenBruto = ((ganBruta / costoTotal) * 100).toFixed(1);
    const margenNeto  = ((ganNeta  / costoTotal) * 100).toFixed(1);
    return { ganBruta, ganNeta, comML, iibb, margenBruto, margenNeto };
  }

  // ── CALCULAR COMPLETO ────────────────────────────────────────────
  function calcular(opts = {}) {
    const {
      precioUSD   = 0,
      precioARS   = 0,      // si se ingresa en ARS directamente
      vendorType  = 'exterior',
      tipoTC      = 'blue',
      precioVenta = 0,
      envio       = true,
      usarML      = true,
      mlFull      = false,
    } = opts;

    const usd = precioUSD > 0 ? precioUSD : precioARS / Dolar.get(tipoTC);
    const compra = costoCompra(usd, vendorType, tipoTC, envio);
    const gan    = ganancia(compra.total, precioVenta, usarML, mlFull);
    return { ...compra, ...gan, usd };
  }

  // ── FORMATTERS ───────────────────────────────────────────────────
  function fmtN(n) { return Math.round(n).toLocaleString('es-AR'); }
  function fmtARS(n) { return '$' + fmtN(n); }
  function claseMargen(pct) {
    const v = parseFloat(pct);
    if (v >= 40) return 'hot';
    if (v >= 15) return 'warm';
    return 'cold';
  }

  // ── HISTORIAL DE PRECIOS (simulado + localStorage) ───────────────
  function getHistorial(productId) {
    try {
      const raw = localStorage.getItem('r45_hist_' + productId);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return generarHistorial();
  }

  function guardarPrecio(productId, precio) {
    try {
      const hist = getHistorial(productId);
      hist.push({ fecha: new Date().toISOString().slice(0,10), precio: Math.round(precio) });
      if (hist.length > 30) hist.shift();
      localStorage.setItem('r45_hist_' + productId, JSON.stringify(hist));
    } catch (_) {}
  }

  function generarHistorial() {
    const hoy = new Date();
    const data = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(hoy); d.setDate(d.getDate() - i);
      const base = 1200 + Math.random() * 200;
      data.push({
        fecha: d.toISOString().slice(0,10),
        precio: Math.round(base + (Math.random() - 0.45) * 80)
      });
    }
    return data;
  }

  return { costoCompra, ganancia, calcular, fmtARS, fmtN, claseMargen, getHistorial, guardarPrecio, TASAS };
})();

window.Calc = Calc;
