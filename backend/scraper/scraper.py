"""
═══════════════════════════════════════════════════════════
MARKETPLACE R45 — Scraper
Corre cada hora via cron y:
  1. Busca los más vendidos en MercadoLibre por categoría
  2. Guarda/actualiza productos en Supabase
  3. Registra el precio del día en price_history
  4. Guarda la cotización del dólar
  5. Evalúa alertas y manda emails si hay margen alto

Instalación:
  pip install supabase httpx resend python-dotenv

Deploy gratuito: Railway.app → New Project → Deploy from GitHub
═══════════════════════════════════════════════════════════
"""

import os
import httpx
import asyncio
import logging
from datetime import datetime, date
from dotenv import load_dotenv
from supabase import create_client, Client
import resend

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("r45-scraper")

# ── CONFIGURACIÓN ────────────────────────────────────────────
SUPABASE_URL  = os.getenv("SUPABASE_URL")
SUPABASE_KEY  = os.getenv("SUPABASE_SERVICE_KEY")   # service_role key (no la anon)
RESEND_API_KEY = os.getenv("RESEND_API_KEY")        # resend.com — gratis 3000/mes
FROM_EMAIL    = os.getenv("FROM_EMAIL", "alertas@marketplace-r45.com")

# Impuestos Argentina (actualizá si cambian)
TAX = {
    "imp_pais":   0.30,
    "iva":        0.21,
    "perc_iva":   0.21,
    "perc_gan":   0.30,
    "envio_ext":  0.12,
    "envio_local": 0.05,
    "comision_ml": 0.13,
}

# Categorías ML → ID oficial MercadoLibre Argentina
ML_CATEGORIES = {
    "Electrónica": "MLA1000",
    "Moda":        "MLA1430",
    "Hogar":       "MLA1574",
    "Deportes":    "MLA1276",
    "Belleza":     "MLA1246",
    "Juguetes":    "MLA5726",
    "Mascotas":    "MLA1700",
}

EMOJIS = {
    "Electrónica": "📱", "Moda": "👗", "Hogar": "🏠",
    "Deportes": "⚽", "Belleza": "💄", "Juguetes": "🎮", "Mascotas": "🐾",
}

# ── CLIENTE SUPABASE ─────────────────────────────────────────
def get_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)

# ── CALCULAR COSTO REAL ──────────────────────────────────────
def calcular_costo(price_usd: float, vendor_type: str, dolar_blue: float) -> float:
    base = price_usd * dolar_blue
    if vendor_type == "exterior":
        imp_pais = base * TAX["imp_pais"]
        sub      = base + imp_pais
        iva      = sub * TAX["iva"]
        perc_iva = sub * TAX["perc_iva"]
        perc_gan = sub * TAX["perc_gan"]
        envio    = base * TAX["envio_ext"]
        return sub + iva + perc_iva + perc_gan + envio
    return base + base * TAX["envio_local"]

def calcular_margen(price_sell: float, costo: float) -> float:
    if costo <= 0:
        return 0
    return round((price_sell - costo) / costo * 100, 2)

# ── OBTENER DÓLAR ────────────────────────────────────────────
async def fetch_dolar(client: httpx.AsyncClient) -> dict:
    try:
        r = await client.get("https://dolarapi.com/v1/dolares", timeout=10)
        if r.status_code == 200:
            data = {d["casa"]: d["venta"] for d in r.json()}
            return {
                "blue":    data.get("blue",    1320),
                "oficial": data.get("oficial", 1080),
                "mep":     data.get("bolsa",   1250),
                "ccl":     data.get("contadoconliqui", 1280),
            }
    except Exception as e:
        log.warning(f"dolarapi falló: {e}")

    # Fallback Bluelytics
    try:
        r = await client.get("https://api.bluelytics.com.ar/v2/latest", timeout=10)
        if r.status_code == 200:
            d = r.json()
            blue    = d.get("blue", {}).get("value_sell", 1320)
            oficial = d.get("oficial", {}).get("value_sell", 1080)
            return {"blue": blue, "oficial": oficial, "mep": blue * 0.95, "ccl": blue * 0.97}
    except Exception as e:
        log.warning(f"bluelytics falló: {e}")

    return {"blue": 1320, "oficial": 1080, "mep": 1254, "ccl": 1281}

# ── BUSCAR PRODUCTOS EN MERCADOLIBRE ─────────────────────────
async def fetch_ml_category(client: httpx.AsyncClient, category: str, category_id: str, limit: int = 5) -> list:
    # Añadimos power_seller=yes para buscar automáticamente los mejores vendedores con buenas reputaciones
    url = f"https://api.mercadolibre.com/sites/MLA/search?category={category_id}&sort=sold_quantity_desc&power_seller=yes&limit={limit}"
    try:
        r = await client.get(url, timeout=15)
        if r.status_code != 200:
            log.warning(f"ML {category}: status {r.status_code}")
            return []

        items = r.json().get("results", [])
        products = []
        for item in items:
            price_ars = item.get("price", 0)
            # Convertir precio ARS a USD aproximado (para consistencia)
            price_usd = round(price_ars / 1320, 2)  # se actualiza con dólar real después

            products.append({
                "name":        item.get("title", "")[:120],
                "category":    category,
                "emoji":       EMOJIS.get(category, "📦"),
                "price_usd":   price_usd,
                "price_sell_ars": round(price_ars * 1.45, 0),  # precio reventa sugerido +45%
                "vendor_type": "local",
                "seller":      "MercadoLibre",
                "seller_url":  item.get("permalink", "https://mercadolibre.com.ar"),
                "ml_item_id":  item.get("id", ""),
                "sales_month": item.get("sold_quantity", 0),
                "rating":      round(item.get("reviews", {}).get("rating_average", 4.3), 1),
                "trend":       "🔥 HOT" if item.get("sold_quantity", 0) > 1000 else "📈 SUBIENDO",
                "description": f"Más vendido en {category} en MercadoLibre Argentina.",
                "tags":        [category.lower(), "mercadolibre", "local"],
                "is_active":   True,
            })
        return products

    except Exception as e:
        log.error(f"ML {category} error: {e}")
        return []

# ── GUARDAR/ACTUALIZAR PRODUCTOS EN SUPABASE ─────────────────
def upsert_product(sb: Client, product: dict) -> str | None:
    """Inserta o actualiza por ml_item_id. Devuelve el UUID del producto."""
    try:
        # Buscar si ya existe por ml_item_id
        existing = None
        if product.get("ml_item_id"):
            res = sb.table("products").select("id").eq("ml_item_id", product["ml_item_id"]).execute()
            if res.data:
                existing = res.data[0]["id"]

        if existing:
            sb.table("products").update({
                "price_usd":      product["price_usd"],
                "price_sell_ars": product["price_sell_ars"],
                "sales_month":    product["sales_month"],
                "trend":          product["trend"],
            }).eq("id", existing).execute()
            return existing
        else:
            res = sb.table("products").insert(product).execute()
            return res.data[0]["id"] if res.data else None

    except Exception as e:
        log.error(f"Upsert product error: {e}")
        return None

# ── GUARDAR PRECIO DEL DÍA ───────────────────────────────────
def save_price_history(sb: Client, product_id: str, product: dict, dolar: dict, margin: float):
    try:
        # Una sola entrada por producto por día
        today = date.today().isoformat()
        existing = sb.table("price_history")\
            .select("id")\
            .eq("product_id", product_id)\
            .gte("recorded_at", today)\
            .execute()

        if existing.data:
            # Actualizar precio del día
            sb.table("price_history").update({
                "price_usd":      product["price_usd"],
                "price_sell_ars": product["price_sell_ars"],
                "dolar_blue":     dolar["blue"],
                "dolar_oficial":  dolar["oficial"],
                "margin_pct":     margin,
            }).eq("id", existing.data[0]["id"]).execute()
        else:
            sb.table("price_history").insert({
                "product_id":     product_id,
                "price_usd":      product["price_usd"],
                "price_sell_ars": product["price_sell_ars"],
                "dolar_blue":     dolar["blue"],
                "dolar_oficial":  dolar["oficial"],
                "margin_pct":     margin,
            }).execute()

    except Exception as e:
        log.error(f"save_price_history error: {e}")

# ── GUARDAR DÓLAR DEL DÍA ────────────────────────────────────
def save_dolar(sb: Client, dolar: dict):
    try:
        spread = round((dolar["blue"] - dolar["oficial"]) / dolar["oficial"] * 100, 2)
        sb.table("dolar_history").insert({
            "blue":       dolar["blue"],
            "oficial":    dolar["oficial"],
            "mep":        dolar["mep"],
            "ccl":        dolar["ccl"],
            "spread_pct": spread,
        }).execute()
        log.info(f"Dólar guardado: blue={dolar['blue']} oficial={dolar['oficial']}")
    except Exception as e:
        log.error(f"save_dolar error: {e}")

# ── SISTEMA DE ALERTAS ───────────────────────────────────────
def check_and_send_alerts(sb: Client, products_with_margins: list):
    try:
        alerts_res = sb.table("alerts").select("*").eq("is_active", True).execute()
        alerts = alerts_res.data or []
        if not alerts:
            return

        for alert in alerts:
            min_margin  = float(alert.get("min_margin", 50))
            cats_filter = alert.get("categories") or []
            email       = alert.get("email", "")

            for prod_id, product, margin in products_with_margins:
                if margin < min_margin:
                    continue
                if cats_filter and product["category"] not in cats_filter:
                    continue

                # Verificar si ya se envió esta alerta hoy para este producto
                today = date.today().isoformat()
                already_sent = sb.table("alert_logs")\
                    .select("id")\
                    .eq("alert_id", alert["id"])\
                    .eq("product_id", prod_id)\
                    .gte("sent_at", today)\
                    .execute()

                if already_sent.data:
                    continue

                # Enviar email
                sent = send_alert_email(email, product, margin)

                # Registrar en log
                sb.table("alert_logs").insert({
                    "alert_id":   alert["id"],
                    "product_id": prod_id,
                    "margin_pct": margin,
                    "email_sent": sent,
                }).execute()

                # Actualizar contador de la alerta
                sb.table("alerts").update({
                    "triggered_count": alert.get("triggered_count", 0) + 1,
                    "last_triggered":  datetime.utcnow().isoformat(),
                }).eq("id", alert["id"]).execute()

                log.info(f"Alerta enviada a {email}: {product['name']} margen={margin}%")

    except Exception as e:
        log.error(f"check_alerts error: {e}")

# ── ENVIAR EMAIL CON RESEND ──────────────────────────────────
def send_alert_email(to_email: str, product: dict, margin: float) -> bool:
    if not RESEND_API_KEY:
        log.warning("RESEND_API_KEY no configurada — email no enviado")
        return False
    try:
        resend.api_key = RESEND_API_KEY
        sell_price = f"${int(product['price_sell_ars']):,}".replace(",", ".")
        buy_usd    = f"USD {product['price_usd']}"

        html = f"""
        <div style="font-family:sans-serif;max-width:520px;margin:auto;background:#0a0a0f;color:#eeeef8;padding:32px;border-radius:16px">
          <div style="font-size:11px;color:#ff5c2b;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px">
            Marketplace R45 — Alerta de margen
          </div>
          <h2 style="margin:0 0 4px;font-size:22px">{product['emoji']} {product['name']}</h2>
          <div style="color:#6060a0;font-size:13px;margin-bottom:24px">{product['category']} · vía {product['seller']}</div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px">
            <div style="background:#17172a;border-radius:10px;padding:14px;text-align:center">
              <div style="font-size:10px;color:#6060a0;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">Comprás a</div>
              <div style="font-size:18px;font-weight:700">{buy_usd}</div>
            </div>
            <div style="background:#17172a;border-radius:10px;padding:14px;text-align:center">
              <div style="font-size:10px;color:#6060a0;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">Revendés a</div>
              <div style="font-size:18px;font-weight:700;color:#0fd68c">{sell_price}</div>
            </div>
            <div style="background:#17172a;border-radius:10px;padding:14px;text-align:center">
              <div style="font-size:10px;color:#6060a0;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">Margen neto</div>
              <div style="font-size:18px;font-weight:700;color:#f5b622">+{margin}%</div>
            </div>
          </div>

          <a href="{product['seller_url']}" style="display:block;background:#ff5c2b;color:#fff;text-align:center;padding:14px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">
            Ver producto en {product['seller']} →
          </a>

          <div style="margin-top:16px;font-size:11px;color:#6060a0;text-align:center">
            Marketplace R45 · Desactivar alertas respondiendo este email
          </div>
        </div>
        """

        resend.Emails.send({
            "from":    FROM_EMAIL,
            "to":      [to_email],
            "subject": f"🔔 R45 — {product['name']} tiene +{margin}% de margen",
            "html":    html,
        })
        return True

    except Exception as e:
        log.error(f"send_email error: {e}")
        return False

# ── MAIN ─────────────────────────────────────────────────────
async def main():
    log.info("═══ Scraper R45 iniciando ═══")
    sb = get_supabase()

    async with httpx.AsyncClient() as client:
        # 1. Obtener dólar
        log.info("Obteniendo cotizaciones del dólar...")
        dolar = await fetch_dolar(client)
        log.info(f"Blue: {dolar['blue']} | Oficial: {dolar['oficial']}")
        save_dolar(sb, dolar)

        # 2. Buscar productos por categoría en ML
        all_tasks = [
            fetch_ml_category(client, cat, cat_id, limit=3)
            for cat, cat_id in ML_CATEGORIES.items()
        ]
        results = await asyncio.gather(*all_tasks)
        all_products = [p for cat_products in results for p in cat_products]
        log.info(f"Productos obtenidos de ML: {len(all_products)}")

        # 3. Guardar en Supabase + calcular márgenes
        products_with_margins = []
        for product in all_products:
            # Recalcular price_usd con dólar real
            product["price_usd"] = round(product["price_sell_ars"] / 1.45 / dolar["blue"], 2)

            costo  = calcular_costo(product["price_usd"], product["vendor_type"], dolar["blue"])
            margin = calcular_margen(product["price_sell_ars"], costo)

            prod_id = upsert_product(sb, product)
            if prod_id:
                save_price_history(sb, prod_id, product, dolar, margin)
                products_with_margins.append((prod_id, product, margin))
                log.info(f"  ✓ {product['name'][:40]} — margen {margin}%")

        # 4. Evaluar y enviar alertas
        log.info("Verificando alertas...")
        check_and_send_alerts(sb, products_with_margins)

        log.info(f"═══ Scraper finalizado. {len(products_with_margins)} productos procesados ═══")

if __name__ == "__main__":
    asyncio.run(main())
