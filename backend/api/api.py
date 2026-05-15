"""
═══════════════════════════════════════════════════════════
MARKETPLACE R45 — API (FastAPI)
El frontend llama a esta API en vez de generar datos con IA.

Endpoints:
  GET  /products          → productos trending del día
  GET  /products/{id}     → detalle de un producto
  GET  /history/{id}      → historial de precios (30/90 días)
  GET  /dolar             → cotizaciones actuales
  POST /alerts            → crear nueva alerta
  GET  /stats             → stats generales

Instalación:
  pip install fastapi uvicorn supabase httpx python-dotenv

Correr local:
  uvicorn api:app --reload --port 8000

Deploy gratuito: railway.app → New → Deploy from GitHub
  Variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_KEY
═══════════════════════════════════════════════════════════
"""

import os
import httpx
from datetime import datetime, timezone
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr
from supabase import create_client, Client
# IA: Claude (Anthropic) via REST — sin SDK, sin dependencias extra
import json
import urllib.parse
import sys as _sys, os as _os
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from mercadolibre import ml_client
from pathlib import Path

# Imágenes: el frontend las carga via /image?q=... (redirect a Bing CDN)
import hashlib as _hashlib

# Directorio raíz del frontend (tres niveles arriba de api/api.py)
_FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent

# Cargar .env desde backend/ (un nivel arriba de api/)
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)

# Claude se configura por llamada con ANTHROPIC_API_KEY del .env

app = FastAPI(
    title="Marketplace R45 API",
    description="API de arbitraje inteligente con datos reales de MercadoLibre",
    version="1.0.0",
)

# CORS — permite que tu frontend en Netlify llame a la API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # en producción: ["https://tu-sitio.netlify.app"]
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

# Middleware extra para aceptar requests desde file:// (desarrollo local)
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest

class FileOriginMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        response = await call_next(request)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return response

app.add_middleware(FileOriginMiddleware)

# ── SUPABASE ─────────────────────────────────────────────────
def get_sb() -> Client:
    return create_client(
        os.getenv("SUPABASE_URL"),
        os.getenv("SUPABASE_SERVICE_KEY"),
    )

# ── IMPUESTOS ─────────────────────────────────────────────────
TAX = {
    "imp_pais":    0.00,  # Derogado en dic 2024
    "iva":         0.21,
    "perc_iva":    0.21,
    "perc_gan":    0.30,
    "envio_ext":   0.12,
    "envio_local": 0.05,
    "comision_ml": 0.13,
}

def calcular_costo(price_usd: float, vendor_type: str, dolar_blue: float) -> float:
    base = price_usd * dolar_blue
    if vendor_type == "exterior":
        imp   = base * TAX["imp_pais"]
        sub   = base + imp
        total = sub + sub * TAX["iva"] + sub * TAX["perc_iva"] + sub * TAX["perc_gan"] + base * TAX["envio_ext"]
        return round(total, 2)
    return round(base + base * TAX["envio_local"], 2)

def calcular_margen(price_sell: float, costo: float) -> float:
    return round((price_sell - costo) / costo * 100, 2) if costo > 0 else 0

# ── MODELOS ──────────────────────────────────────────────────
class AlertCreate(BaseModel):
    email:      str
    min_margin: float = 50.0
    categories: list[str] = []

# ── CACHÉ EN MEMORIA PARA EL DÓLAR ──────────────────────────
_dolar_cache = {"data": None, "updated_at": None}

# ── CACHÉ EN MEMORIA PARA AI-PRODUCTS (10 minutos) ───────────
_ai_cache: dict = {}  # clave: category|"all" → {"data": ..., "updated_at": ...}

async def get_dolar_cached() -> dict:
    now = datetime.now(timezone.utc)
    # Usar caché si tiene menos de 5 minutos
    if _dolar_cache["data"] and _dolar_cache["updated_at"]:
        diff = (now - _dolar_cache["updated_at"]).seconds
        if diff < 300:
            return _dolar_cache["data"]

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get("https://dolarapi.com/v1/dolares")
            if r.status_code == 200:
                raw = {d["casa"]: d["venta"] for d in r.json()}
                oficial = raw.get("oficial", 1080)
                data = {
                    "blue":    raw.get("blue",            1320),
                    "oficial": oficial,
                    "mep":     raw.get("bolsa",           1250),
                    "ccl":     raw.get("contadoconliqui", 1280),
                    "tarjeta": raw.get("tarjeta", round(oficial * 1.60, 2)),  # Usa API o estima 60% recargo
                }
                _dolar_cache["data"]       = data
                _dolar_cache["updated_at"] = now
                return data
    except Exception:
        pass

    return {"blue": 1490, "oficial": 1165, "mep": 1420, "ccl": 1450, "tarjeta": round(1165 * 1.60, 2)}

# ══════════════════════════════════════════════════════════════
# ENDPOINTS
# ══════════════════════════════════════════════════════════════

@app.get("/status")
def status():
    return {"status": "ok", "app": "Marketplace R45 API", "version": "1.0.0"}

@app.get("/", response_class=FileResponse)
def root():
    return FileResponse(_FRONTEND_DIR / "index.html")


@app.get("/dolar")
async def get_dolar():
    """Cotizaciones del dólar en tiempo real"""
    data = await get_dolar_cached()
    spread = round((data["blue"] - data["oficial"]) / data["oficial"] * 100, 2)
    return {**data, "spread_pct": spread, "updated_at": datetime.now(timezone.utc).isoformat(), "tarjeta": data.get("tarjeta", round(data["oficial"] * 1.573, 2))}


@app.get("/products")
async def get_products(
    category: Optional[str] = None,
    limit:    int = Query(default=16, le=50),
    min_margin: Optional[float] = None,
):
    """
    Productos REALES más vendidos de MercadoLibre Argentina en este momento.
    Usa trending keywords de ML + búsqueda ordenada por ventas.
    Fallback a Supabase si ML no está disponible.
    """
    dolar = await get_dolar_cached()

    # ── Fuente 1: MercadoLibre trending (real, en tiempo real) ──
    if ml_client.is_configured():
        try:
            products = await ml_client.trending_products(
                category=category,
                limit=limit,
                dolar_blue=dolar["blue"],
            )
            if products:
                # El margen ya viene calculado correctamente desde _format_item de ML
                # (precio compra ML + comision 13% + envio 5% vs precio reventa +30%)
                for p in products:
                    p["dolar_blue"] = dolar["blue"]
                print(f"[ML] {len(products)} productos trending con margen real", flush=True)
                return {"products": products, "total": len(products), "dolar": dolar, "source": "mercadolibre"}
        except Exception as e:
            print(f"[ML Products] Error: {e}", flush=True)

    # ── Fuente 2: Supabase (fallback) ──
    try:
        sb    = get_sb()
        query = sb.table("products").select("*").eq("is_active", True)
        if category:
            query = query.eq("category", category)
        query = query.order("sales_month", desc=True).limit(limit)
        res = query.execute()
        products = res.data or []
        enriched = []
        for p in products:
            costo  = calcular_costo(p["price_usd"], p.get("vendor_type", "exterior"), dolar["blue"])
            margin = calcular_margen(p["price_sell_ars"], costo)
            if min_margin and margin < min_margin:
                continue
            enriched.append({**p, "costo_real": costo,
                "ganancia_ars": round(p["price_sell_ars"] - costo, 2),
                "margin_pct": margin, "dolar_blue": dolar["blue"]})
        enriched.sort(key=lambda x: x["margin_pct"], reverse=True)
        return {"products": enriched, "total": len(enriched), "dolar": dolar, "source": "supabase"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Sin fuentes disponibles: {e}")


@app.get("/products/{product_id}")
async def get_product(product_id: str):
    """Detalle completo de un producto"""
    sb    = get_sb()
    dolar = await get_dolar_cached()

    try:
        res = sb.table("products").select("*").eq("id", product_id).execute()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error de base de datos: {e}")

    if not res.data:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    p      = res.data[0]
    costo  = calcular_costo(p["price_usd"], p.get("vendor_type", "exterior"), dolar["blue"])
    margin = calcular_margen(p["price_sell_ars"], costo)

    return {
        **p,
        "costo_real":   costo,
        "ganancia_ars": round(p["price_sell_ars"] - costo, 2),
        "margin_pct":   margin,
        "dolar_blue":   dolar["blue"],
        "desglose": {
            "base_ars":   round(p["price_usd"] * dolar["blue"], 2),
            "imp_pais":   round(p["price_usd"] * dolar["blue"] * TAX["imp_pais"], 2),
            "iva":        round(p["price_usd"] * dolar["blue"] * (1 + TAX["imp_pais"]) * TAX["iva"], 2),
            "perc_iva":   round(p["price_usd"] * dolar["blue"] * (1 + TAX["imp_pais"]) * TAX["perc_iva"], 2),
            "perc_gan":   round(p["price_usd"] * dolar["blue"] * (1 + TAX["imp_pais"]) * TAX["perc_gan"], 2),
            "envio":      round(p["price_usd"] * dolar["blue"] * TAX["envio_ext"], 2),
            "comision_ml":round(p["price_sell_ars"] * TAX["comision_ml"], 2),
        },
    }


@app.get("/history/{product_id}")
async def get_history(
    product_id: str,
    days: int = Query(default=30, le=90),
):
    """
    Historial de precios reales de los últimos N días.
    El frontend usa esto en el gráfico en vez de datos simulados.
    """
    sb  = get_sb()
    try:
        res = sb.table("price_history")\
            .select("price_usd, price_sell_ars, dolar_blue, margin_pct, recorded_at")\
            .eq("product_id", product_id)\
            .order("recorded_at", desc=False)\
            .limit(days)\
            .execute()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error de base de datos: {e}")

    history = res.data or []

    if not history:
        raise HTTPException(status_code=404, detail="Sin historial para este producto")

    prices     = [h["price_sell_ars"] for h in history]
    margins    = [h["margin_pct"] for h in history if h["margin_pct"]]
    labels     = [h["recorded_at"][:10] for h in history]
    dolar_hist = [h["dolar_blue"] for h in history if h["dolar_blue"]]

    return {
        "product_id":    product_id,
        "days":          len(history),
        "labels":        labels,
        "prices":        prices,
        "margins":       margins,
        "dolar_history": dolar_hist,
        "stats": {
            "min_price":  min(prices),
            "max_price":  max(prices),
            "avg_price":  round(sum(prices) / len(prices), 2),
            "avg_margin": round(sum(margins) / len(margins), 2) if margins else 0,
            "change_pct": round((prices[-1] - prices[0]) / prices[0] * 100, 2) if len(prices) > 1 else 0,
        },
    }


from fastapi import Header

def get_user_from_token(authorization: str) -> dict:
    """
    Valida el JWT de Supabase Auth y retorna el payload del usuario.
    El frontend envía: Authorization: Bearer <supabase_access_token>
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token de autenticación requerido")
    token = authorization.split(" ", 1)[1]
    # Verificar con Supabase (endpoint estándar de Auth)
    import urllib.request, json as _json, ssl as _ssl
    supabase_url = os.getenv("SUPABASE_URL", "")
    req = urllib.request.Request(
        f"{supabase_url}/auth/v1/user",
        headers={"Authorization": f"Bearer {token}",
                 "apikey": os.getenv("SUPABASE_SERVICE_KEY", "")},
    )
    try:
        ctx = _ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=5, context=ctx) as r:
            return _json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Error de autenticación: {e}")


@app.post("/alerts")
async def create_alert(alert: AlertCreate, authorization: str = Header(None)):
    """Crear una alerta de margen. Requiere usuario autenticado."""
    user = get_user_from_token(authorization)
    user_id = user.get("id")
    email   = user.get("email", alert.email)

    sb  = get_sb()
    res = sb.table("alerts").insert({
        "email":      email,
        "user_id":    user_id,
        "min_margin": alert.min_margin,
        "categories": alert.categories or [],
        "is_active":  True,
    }).execute()

    if not res.data:
        raise HTTPException(status_code=500, detail="Error guardando alerta")

    return {"ok": True, "alert_id": res.data[0]["id"], "message": f"Alerta creada para {email}"}


@app.get("/alerts")
async def get_alerts(authorization: str = Header(None)):
    """Obtener alertas del usuario autenticado."""
    user    = get_user_from_token(authorization)
    user_id = user.get("id")
    sb      = get_sb()
    res     = sb.table("alerts").select("*").eq("user_id", user_id).eq("is_active", True).execute()
    return {"alerts": res.data or [], "total": len(res.data or [])}


@app.delete("/alerts/{alert_id}")
async def delete_alert(alert_id: str, authorization: str = Header(None)):
    """Desactivar una alerta. Solo puede hacerlo el dueño."""
    user    = get_user_from_token(authorization)
    user_id = user.get("id")
    sb      = get_sb()
    sb.table("alerts").update({"is_active": False})        .eq("id", alert_id).eq("user_id", user_id).execute()
    return {"ok": True}


@app.post("/saved")
async def save_product(product: dict, authorization: str = Header(None)):
    """Guardar un producto en la wishlist persistente del usuario."""
    user    = get_user_from_token(authorization)
    user_id = user.get("id")
    sb      = get_sb()
    res = sb.table("saved_products").upsert({
        "user_id":    user_id,
        "ml_item_id": str(product.get("id", "")),
        "name":       product.get("name", ""),
        "price_ars":  product.get("ml_price_ars") or product.get("price_sell_ars"),
        "category":   product.get("category", ""),
        "ml_url":     product.get("seller_url", ""),
        "image_url":  product.get("image_url", ""),
        "margin_pct": product.get("margin_pct"),
    }, on_conflict="user_id,ml_item_id").execute()
    return {"ok": True}


@app.get("/saved")
async def get_saved(authorization: str = Header(None)):
    """Obtener productos guardados del usuario."""
    user    = get_user_from_token(authorization)
    user_id = user.get("id")
    sb      = get_sb()
    res     = sb.table("saved_products").select("*").eq("user_id", user_id).order("saved_at", desc=True).execute()
    return {"products": res.data or [], "total": len(res.data or [])}


@app.delete("/saved/{ml_item_id}")
async def delete_saved(ml_item_id: str, authorization: str = Header(None)):
    """Eliminar un producto guardado."""
    user    = get_user_from_token(authorization)
    user_id = user.get("id")
    sb      = get_sb()
    sb.table("saved_products").delete().eq("user_id", user_id).eq("ml_item_id", ml_item_id).execute()
    return {"ok": True}


@app.get("/stats")
async def get_stats():
    """Stats generales del marketplace"""
    sb    = get_sb()
    dolar = await get_dolar_cached()

    products_res = sb.table("products").select("id, category, price_usd, price_sell_ars, vendor_type, sales_month")\
        .eq("is_active", True).execute()
    products = products_res.data or []

    margins = []
    for p in products:
        costo = calcular_costo(p["price_usd"], p.get("vendor_type", "exterior"), dolar["blue"])
        margins.append(calcular_margen(p["price_sell_ars"], costo))

    alerts_res = sb.table("alerts").select("id").eq("is_active", True).execute()

    cats = {}
    for p in products:
        cats[p["category"]] = cats.get(p["category"], 0) + 1

    return {
        "total_products":  len(products),
        "active_alerts":   len(alerts_res.data or []),
        "avg_margin":      round(sum(margins) / len(margins), 2) if margins else 0,
        "best_margin":     round(max(margins), 2) if margins else 0,
        "categories":      cats,
        "dolar":           dolar,
        "updated_at":      datetime.now(timezone.utc).isoformat(),
    }


@app.get("/ml-search")
async def ml_search(
    q:        str = Query(..., description="Término de búsqueda"),
    limit:    int = Query(default=5, le=20),
    category: Optional[str] = None,
):
    """
    Proxy autenticado para búsquedas en MercadoLibre.
    El frontend llama a este endpoint en vez de ir directo a api.mercadolibre.com.
    Usa OAuth client_credentials con auto-renovación de token.
    """
    results = []
    if ml_client.is_configured():
        results = await ml_client.search(query=q, limit=limit, category=category)
        
    if not results:
        # Fallback a Supabase si ML falla (por ej. error 403)
        try:
            sb = get_sb()
            res = sb.table("products").select("*").ilike("name", f"%{q}%").limit(limit).execute()
            if res.data:
                for p in res.data:
                    results.append({
                        "id": p.get("ml_item_id") or p["id"],
                        "title": p["name"],
                        "price": p["price_sell_ars"],
                        "thumbnail": p.get("image_url", ""),
                        "permalink": p.get("seller_url", ""),
                        "sold_quantity": p.get("sales_month", 0),
                        "shipping": {"free_shipping": True},
                    })
        except Exception as e:
            print(f"[Fallback ml-search] Error: {e}", flush=True)

    if not results and not ml_client.is_configured():
        raise HTTPException(
            status_code=503,
            detail="MercadoLibre no configurado. Agregá ML_CLIENT_ID y ML_CLIENT_SECRET al .env"
        )

    return {
        "results": results,
        "total":   len(results),
        "query":   q,
    }


@app.get("/app", response_class=FileResponse)
def serve_frontend():
    """Sirve el index.html del frontend"""
    return FileResponse(_FRONTEND_DIR / "index.html")

@app.get("/ai-products")
async def get_ai_products(
    category: Optional[str] = None,
    custom_prompt: Optional[str] = None,
    stores: Optional[str] = None,
):
    """
    Genera productos con IA (Gemini) para:
    - Tiendas externas (AliExpress, Temu, Shein, Amazon, Alibaba)
    - Prompts custom del usuario ("productos para madres", etc.)
    - Cuando ML no tiene datos de esa categoría

    Para MercadoLibre sin prompt → usar /products que tiene datos reales.
    """
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
    if not GEMINI_API_KEY and not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=500, detail="Configurá GEMINI_API_KEY o ANTHROPIC_API_KEY en .env")

    # ── Parsear tiendas seleccionadas ──
    stores = [s.strip() for s in stores.split(",")] if stores else ["AliExpress", "Temu"]

    # ── Caché de 10 minutos (se invalida si hay prompt custom o tiendas distintas) ──
    # FIX Bug 5: incluir el texto real del prompt en la key
    cache_key = f"{category or 'all'}_{'_'.join(stores)}_{custom_prompt or ''}"
    if not custom_prompt:  # con prompt custom nunca cachear
        cached = _ai_cache.get(cache_key)
        if cached and (datetime.now(timezone.utc) - cached["updated_at"]).seconds < 600:
            return cached["data"]

    try:
        # FIX Bug 4: soporte para SDK nuevo (google-genai) y viejo (google-generativeai)
        # Construir el prompt según si hay custom_prompt, categoría, o es general
        if custom_prompt:
            # El usuario pidió algo específico — eso manda sobre todo
            cat_context = f" Priorizá la categoría {category}." if category else ""
            stores_prompt = f"Usá las tiendas: {', '.join(stores)}." if stores else ""
            task = (
                f"INSTRUCCIÓN DEL USUARIO (es obligatoria, respetarla al pie de la letra): {custom_prompt}."
                f"{cat_context} {stores_prompt}"
                f" Generá exactamente 8 productos físicos REALES que cumplan ese pedido."
            )
        elif category:
            stores_prompt = f"para las tiendas: {', '.join(stores)}" if stores else "para AliExpress principalmente"
            task = f"Generá 8 productos físicos REALES y rentables de la categoría {category} {stores_prompt}. TODOS los productos deben ser de esa categoría."
        else:
            stores_prompt = f"para las tiendas: {', '.join(stores)}" if stores else "para AliExpress principalmente"
            task = f"Generá 8 productos físicos REALES y rentables de categorías variadas (Electrónica, Moda, Hogar, Deportes, Belleza, Juguetes, Mascotas) {stores_prompt}."

        prompt = f"""
        Sos un experto en arbitraje e-commerce para Argentina.
        {task}

        Reglas adicionales:
        - Nombres específicos y reales (ej: "Auriculares Sony WF-1000XM5" no "auriculares genéricos")
        - Los precios deben ser realistas para el mercado argentino 2025
        - Cada producto en la tienda más conveniente para importar

        Para seller_url podés dejar un string vacío, el backend genera la URL de búsqueda exacta.
        Para image_query usá el nombre exacto del producto en inglés (ej: "Sony WF-1000XM5 earbuds black").

        Devolvé SOLO JSON puro, sin markdown, sin texto extra:
        [
          {{
            "id": 101,
            "name": "Nombre específico y real del producto",
            "category": "Electrónica|Moda|Hogar|Deportes|Belleza|Juguetes|Mascotas",
            "emoji": "📦",
            "price_usd": 15.50,
            "price_sell_ars": 45000,
            "sales_month": 1200,
            "rating": 4.5,
            "trend": "🔥 HOT|📈 SUBIENDO|⭐ NUEVO|💎 PREMIUM",
            "desc": "Por qué es rentable en Argentina ahora",
            "seller": "AliExpress|Temu|Amazon|Shein|Alibaba",
            "seller_url": "",
            "image_query": "nombre producto en inglés para imagen"
          }}
        ]
        """
        # Intentar Gemini primero (gratis), fallback a Claude
        text = None
        if GEMINI_API_KEY:
            try:
                gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
                async with httpx.AsyncClient(timeout=60) as http:
                    g_resp = await http.post(gemini_url, json={
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 4096}
                    })
                if g_resp.status_code == 200:
                    text = g_resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
                    print(f"[Gemini] OK — {len(text)} chars", flush=True)
                else:
                    print(f"[Gemini] Error {g_resp.status_code}: {g_resp.text[:200]}", flush=True)
            except Exception as eg:
                print(f"[Gemini] Excepción: {eg}", flush=True)

        if not text and ANTHROPIC_API_KEY:
            async with httpx.AsyncClient(timeout=60) as http:
                c_resp = await http.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={"x-api-key": ANTHROPIC_API_KEY,
                             "anthropic-version": "2023-06-01",
                             "content-type": "application/json"},
                    json={"model": "claude-haiku-4-5-20251001", "max_tokens": 4096,
                          "messages": [{"role": "user", "content": prompt}]},
                )
            if c_resp.status_code != 200:
                raise ValueError(f"Claude error {c_resp.status_code}: {c_resp.text[:300]}")
            text = c_resp.json()["content"][0]["text"].strip()
            print(f"[Claude fallback] OK — {len(text)} chars", flush=True)

        if not text:
            raise ValueError("Ninguna IA disponible respondió. Revisá las API keys.")
        if text.startswith("```json"):
            text = text[7:-3].strip()
        elif text.startswith("```"):
            text = text[3:-3].strip()
        
        try:
            products = json.loads(text)
        except json.JSONDecodeError:
            # Intentar limpiar texto extra que Gemini a veces agrega
            import re
            match = re.search(r'\[.*\]', text, re.DOTALL)
            if match:
                products = json.loads(match.group())
            else:
                raise ValueError(f"Gemini no devolvió JSON válido: {text[:200]}")
        dolar = await get_dolar_cached()
        
        # Enriquecer con links reales y cálculos
        enriched = []
        for i, p in enumerate(products):
            # Asegurar IDs únicos si se mezcla con la BD real
            p["id"] = f"ai-{i}-{int(datetime.now(timezone.utc).timestamp())}"
            
            query_ml  = urllib.parse.quote(p["name"])
            query_ali = urllib.parse.quote(p["name"])

            p["vendor_type"] = "exterior"

            # Tags de afiliados desde .env
            tag_ali = os.getenv("ALIEXPRESS_TAG", "")
            tag_amz = os.getenv("AMAZON_TAG", "")
            
            # Generar SIEMPRE la búsqueda exacta para evitar errores 404 (enlaces falsos de IA)
            gemini_seller = p.get("seller", "AliExpress")
            seller_lower = gemini_seller.lower()
            
            if "amazon" in seller_lower:
                gemini_seller_url = f"https://www.amazon.com/s?k={query_ali}"
                if tag_amz: gemini_seller_url += f"&tag={tag_amz}"
            elif "temu" in seller_lower:
                gemini_seller_url = f"https://www.temu.com/search_result.html?search_key={query_ali}"
            elif "shein" in seller_lower:
                gemini_seller_url = f"https://us.shein.com/pdsearch/{query_ali}/"
            elif "alibaba" in seller_lower:
                gemini_seller_url = f"https://www.alibaba.com/trade/search?SearchText={query_ali}"
            else: # Default AliExpress
                gemini_seller_url = f"https://es.aliexpress.com/w/wholesale-{query_ali}.html?SortType=total_tranpro_desc"
                if tag_ali: gemini_seller_url += f"&aff_trace_key={tag_ali}"

            p["seller"]     = gemini_seller
            p["seller_url"] = gemini_seller_url

            # buy_options: link directo al producto exterior + búsqueda en ML local
            p["buy_options"] = {
                "local": {
                    "name": "Buscar en MercadoLibre",
                    "url": f"https://listado.mercadolibre.com.ar/{query_ml}#power_seller=yes"
                },
                "exterior": {
                    "name": f"Ver en {gemini_seller}",
                    "url": gemini_seller_url
                }
            }
            
            costo = calcular_costo(p["price_usd"], p.get("vendor_type", "exterior"), dolar["blue"])
            p["costo_real"] = costo
            p["ganancia_ars"] = round(p["price_sell_ars"] - costo, 2)
            p["margin_pct"] = calcular_margen(p["price_sell_ars"], costo)

            # image_query viene de Claude — el frontend la usa via /image?q=...
            p["image_query"] = p.get("image_query") or p.get("name", "")
            
            enriched.append(p)
            
        result = {"products": enriched, "dolar": dolar}
        # Guardar en caché
        _ai_cache[cache_key] = {"data": result, "updated_at": datetime.now(timezone.utc)}
        return result
        
    except Exception as e:
        import traceback
        err_detail = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        print(f"[Gemini ERROR] {err_detail}".encode('ascii', 'replace').decode('ascii'), flush=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/image")
async def image_proxy(q: str = Query(...), w: int = 320, h: int = 200):
    """
    Proxy de imágenes de productos via Bing CDN.
    Sin CORS, sin API key. El frontend llama a /image?q=nombre+producto
    """
    from fastapi.responses import RedirectResponse
    search_q = urllib.parse.quote(q + " product")
    # Bing image thumbnail CDN — sin key, sin CORS, tamaño controlable
    bing_url = f"https://tse1.mm.bing.net/th?q={search_q}&w={w}&h={h}&c=7&rs=1&p=0&pid=1.7&mkt=es-AR"
    # Seed determinístico de fallback por si Bing falla
    seed = int(_hashlib.md5(q.encode()).hexdigest()[:8], 16) % 1000
    try:
        return RedirectResponse(url=bing_url, status_code=302)
    except Exception:
        return RedirectResponse(url=f"https://picsum.photos/seed/{seed}/{w}/{h}", status_code=302)


# ── MONTAR ASSETS ESTÁTICOS ──────────────────────────────────
# Sirve styles.css, app.js, favicon.svg, etc. desde la raíz del proyecto.
# IMPORTANTE: va al final para que los endpoints de la API tengan prioridad.
# html=True hace que rutas desconocidas devuelvan index.html (útil para SPA).
try:
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIR), html=True), name="frontend")
except Exception:
    pass  # Si no existe la carpeta, no pasa nada
