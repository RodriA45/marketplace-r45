/* ═══════════════════════════════════════
   MARKETPLACE R45 — Sistema de Alertas
   Guarda alertas en localStorage
   Avisa visualmente cuando margen supera umbral
   ═══════════════════════════════════════ */

const Alertas = (() => {

  const KEY = 'r45_alertas';

  function getAll() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; }
  }

  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (_) {}
  }

  function agregar({ email, producto, categoria, margenMin, tipoTC }) {
    const list = getAll();
    const nueva = {
      id:        Date.now(),
      email,
      producto:  producto || 'Cualquier producto',
      categoria: categoria || 'Todas',
      margenMin: parseFloat(margenMin) || 50,
      tipoTC:    tipoTC || 'blue',
      activa:    true,
      creada:    new Date().toISOString(),
      disparada: false,
      ultimaVez: null,
    };
    list.push(nueva);
    save(list);
    return nueva;
  }

  function eliminar(id) {
    save(getAll().filter(a => a.id !== id));
  }

  function toggleActiva(id) {
    const list = getAll();
    const a = list.find(x => x.id === id);
    if (a) a.activa = !a.activa;
    save(list);
  }

  // Chequea productos contra alertas activas
  function chequear(products) {
    const list    = getAll();
    const activas = list.filter(a => a.activa);
    const disparadas = [];

    activas.forEach(alerta => {
      products.forEach(p => {
        const costo  = Calc.costoCompra(p.price_usd || 20, p.vendor_type || 'exterior', alerta.tipoTC).total;
        const margen = ((p.price_sell_ars - costo) / costo) * 100;

        const matchCat = alerta.categoria === 'Todas' || alerta.categoria === p.category;
        const matchProd = !alerta.producto || alerta.producto === 'Cualquier producto' ||
                          p.name.toLowerCase().includes(alerta.producto.toLowerCase());

        if (matchCat && matchProd && margen >= alerta.margenMin) {
          disparadas.push({ alerta, producto: p, margen: margen.toFixed(1) });
          // marcar
          const found = list.find(x => x.id === alerta.id);
          if (found) { found.disparada = true; found.ultimaVez = new Date().toISOString(); }
        }
      });
    });

    save(list);
    return disparadas;
  }

  // Simula envío de email (en producción conectar a EmailJS / Resend / SendGrid)
  function simularEmail(alerta, producto, margen) {
    const msg = `📧 ALERTA ENVIADA (simulado) a ${alerta.email}
━━━━━━━━━━━━━━━━━━━━━━━━━━
Producto: ${producto.name}
Categoría: ${producto.category}
Margen actual: +${margen}%
Umbral configurado: +${alerta.margenMin}%
Tipo de cambio: ${alerta.tipoTC.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━
En producción: instalar EmailJS o Resend para envío real.`;
    console.info(msg);
    return msg;
  }

  function contarActivas() {
    return getAll().filter(a => a.activa).length;
  }

  return { getAll, agregar, eliminar, toggleActiva, chequear, simularEmail, contarActivas };
})();

window.Alertas = Alertas;
