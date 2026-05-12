/* ═══════════════════════════════════════════════
   alerts.js — Sistema de alertas de margen
   Marketplace R45
   ═══════════════════════════════════════════════

   Almacena alertas en localStorage del navegador.
   Para enviar emails reales, integrá EmailJS:
   https://www.emailjs.com/ (plan gratuito disponible)

   ═══════════════════════════════════════════════ */

const Alerts = {

  STORAGE_KEY: 'r45_alerts',
  CHECK_INTERVAL: 60000, // revisar cada 60 segundos

  // ── Cargar alertas guardadas ─────────────────────────────────────
  load() {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
    } catch { return []; }
  },

  // ── Guardar alertas ──────────────────────────────────────────────
  save(alerts) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(alerts));
    this.updateUI();
  },

  // ── Agregar nueva alerta ─────────────────────────────────────────
  add({ email, minMargin, categories }) {
    const alerts = this.load();
    const newAlert = {
      id:         Date.now(),
      email:      email.trim(),
      minMargin:  parseFloat(minMargin),
      categories: categories,
      createdAt:  new Date().toISOString(),
      triggered:  0,
    };
    alerts.push(newAlert);
    this.save(alerts);
    return newAlert;
  },

  // ── Eliminar alerta ──────────────────────────────────────────────
  remove(id) {
    const alerts = this.load().filter(a => a.id !== id);
    this.save(alerts);
  },

  // ── Verificar si hay productos que activen alertas ───────────────
  check(products, dolares, activeTipo) {
    const alerts = this.load();
    if (!alerts.length || !products.length) return;

    alerts.forEach(alert => {
      products.forEach(product => {
        if (alert.categories.length && !alert.categories.includes(product.category)) return;

        const tc = dolares[activeTipo] || dolares.blue || 1320;
        const costo = calcCostoTotal(product.price_usd || 20, product.vendor_type || 'exterior', tc);
        const margen = ((product.price_sell_ars - costo) / costo * 100);

        if (margen >= alert.minMargin) {
          this.triggerAlert(alert, product, margen, costo);
        }
      });
    });
  },

  // ── Activar alerta ───────────────────────────────────────────────
  triggerAlert(alert, product, margen, costo) {
    // Evitar spam: guardar qué alertas ya disparamos en esta sesión
    const sessionKey = `r45_triggered_${alert.id}_${product.id}`;
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, '1');

    // Incrementar contador
    const alerts = this.load();
    const idx = alerts.findIndex(a => a.id === alert.id);
    if (idx >= 0) { alerts[idx].triggered++; this.save(alerts); }

    // Mostrar notificación en pantalla
    showAlertNotification(product, margen, alert.email);

    // === EMAILJS (descomentar para habilitar emails reales) ===
    // this.sendEmail(alert.email, product, margen);
  },

  // ── Enviar email vía EmailJS (requiere cuenta en emailjs.com) ────
  // async sendEmail(toEmail, product, margen) {
  //   try {
  //     // 1. Creá cuenta en emailjs.com
  //     // 2. Creá un servicio de email (Gmail, Outlook, etc.)
  //     // 3. Creá un template con estas variables:
  //     //    {{product_name}}, {{margin}}, {{sell_price}}, {{buy_cost}}, {{seller_url}}
  //     // 4. Reemplazá los IDs abajo
  //
  //     await emailjs.send(
  //       'TU_SERVICE_ID',      // ej: 'service_abc123'
  //       'TU_TEMPLATE_ID',     // ej: 'template_xyz789'
  //       {
  //         to_email:     toEmail,
  //         product_name: product.name,
  //         margin:       margen.toFixed(1) + '%',
  //         sell_price:   fmtARS(product.price_sell_ars),
  //         buy_cost:     fmtARS(buyTotal),
  //         seller_url:   product.seller_url,
  //         category:     product.category,
  //       },
  //       'TU_PUBLIC_KEY'       // ej: 'user_abc123xyz'
  //     );
  //     console.log('[Alerts] Email enviado a:', toEmail);
  //   } catch (e) {
  //     console.error('[Alerts] Error enviando email:', e);
  //   }
  // },

  // ── Actualizar UI del contador de alertas ────────────────────────
  updateUI() {
    const alerts = this.load();
    const el = document.getElementById('s-alerts');
    if (el) el.textContent = alerts.length;
    renderSavedAlerts();
  },

  // ── Iniciar loop de verificación ─────────────────────────────────
  startChecking() {
    setInterval(() => {
      if (typeof allProducts !== 'undefined' && typeof dolares !== 'undefined') {
        this.check(allProducts, dolares, activeTipo || 'blue');
      }
    }, this.CHECK_INTERVAL);
  },
};

// ── UI: Renderizar alertas guardadas en el modal ─────────────────────
function renderSavedAlerts() {
  const container = document.getElementById('savedAlerts');
  if (!container) return;
  const alerts = Alerts.load();
  if (!alerts.length) {
    container.innerHTML = '<div style="font-size:0.72rem;color:var(--muted);text-align:center;padding:0.5rem">No tenés alertas configuradas aún</div>';
    return;
  }
  container.innerHTML = alerts.map(a => `
    <div class="alert-item">
      <div class="alert-item-info">
        <strong>${a.email || 'Sin email'}</strong> · +${a.minMargin}% margen
        <br>${a.categories.length ? a.categories.join(', ') : 'Todas las categorías'}
        · Disparada ${a.triggered}x
      </div>
      <button class="alert-delete" onclick="Alerts.remove(${a.id})">✕</button>
    </div>
  `).join('');
}

// ── Mostrar notificación de alerta en pantalla ───────────────────────
function showAlertNotification(product, margen, email) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = `🔔 Alerta! ${product.name} tiene +${margen.toFixed(0)}% margen`;
  toast.className = 'toast green show';
  setTimeout(() => toast.classList.remove('show'), 5000);

  // También intentar notificación del navegador
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Marketplace R45 — Oportunidad detectada', {
      body: `${product.name}\nMargen: +${margen.toFixed(0)}%\nNotificado a: ${email}`,
      icon: '📊',
    });
  }
}

// ── Abrir modal de alertas ───────────────────────────────────────────
function openAlertModal() {
  // Pedir permiso para notificaciones del navegador
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Renderizar checkboxes de categorías
  const cats = ['Electrónica', 'Moda', 'Hogar', 'Deportes', 'Belleza', 'Juguetes', 'Mascotas'];
  const catsContainer = document.getElementById('catsCheck');
  if (catsContainer) {
    catsContainer.innerHTML = cats.map(c => `
      <label>
        <input type="checkbox" value="${c}" checked>
        ${c}
      </label>
    `).join('');
  }

  renderSavedAlerts();
  document.getElementById('alertModal').classList.add('open');
}

// ── Cerrar modal de alertas ──────────────────────────────────────────
function closeAlertModal() {
  document.getElementById('alertModal').classList.remove('open');
}

// ── Guardar nueva alerta desde el formulario ─────────────────────────
function saveAlert() {
  const email = document.getElementById('alertEmail')?.value?.trim();
  const minMargin = document.getElementById('alertMargin')?.value || 50;
  const cats = [...document.querySelectorAll('#catsCheck input:checked')].map(i => i.value);

  if (!email || !email.includes('@')) {
    showToast('⚠️ Ingresá un email válido', 'red');
    return;
  }

  // Si hay API backend, guardar en Supabase; si no, guardar local
  if (typeof API_URL !== 'undefined' && API_URL) {
    fetch(`${API_URL}/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, min_margin: parseFloat(minMargin), categories: cats }),
    })
    .then(r => r.json())
    .then(() => showToast('✅ Alerta guardada en la nube para ' + email, 'green'))
    .catch(() => {
      Alerts.add({ email, minMargin, categories: cats });
      showToast('✅ Alerta guardada localmente para ' + email, 'green');
    });
  } else {
    Alerts.add({ email, minMargin, categories: cats });
    showToast('✅ Alerta guardada para ' + email, 'green');
  }
  document.getElementById('alertEmail').value = '';
}

// ── Crear alerta desde el producto abierto en modal ─────────────────
function createAlertFromProduct() {
  closeModal();
  openAlertModal();
  // Pre-seleccionar la categoría del producto actual
  if (typeof currentProduct !== 'undefined' && currentProduct) {
    setTimeout(() => {
      const checkboxes = document.querySelectorAll('#catsCheck input');
      checkboxes.forEach(cb => {
        cb.checked = cb.value === currentProduct.category;
      });
    }, 100);
  }
}

// ── Helper: calcular costo total (usada por Alerts.check) ───────────
function calcCostoTotal(priceUSD, vendorType, tc) {
  const base = priceUSD * tc;
  if (vendorType === 'exterior') {
    const impPais  = base * 0.30;
    const sub1     = base + impPais;
    const iva      = sub1 * 0.21;
    const percIva  = sub1 * 0.21;
    const percGan  = sub1 * 0.30;
    const envio    = base * 0.12;
    return sub1 + iva + percIva + percGan + envio;
  }
  return base + base * 0.05;
}

// Iniciar sistema de alertas cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  Alerts.startChecking();
  Alerts.updateUI();
});
