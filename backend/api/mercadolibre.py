"""
═══════════════════════════════════════════════════════════
MARKETPLACE R45 — MercadoLibre OAuth Client
Manejo automático de tokens con client_credentials.

Uso:
    from mercadolibre import ml_client
    results = await ml_client.search("auriculares", limit=5)
═══════════════════════════════════════════════════════════
"""

import os
import httpx
from datetime import datetime, timedelta
from typing import Optional


class MercadoLibreClient:
    """Cliente de MercadoLibre con OAuth 2.0 (client_credentials)."""

    BASE_URL = "https://api.mercadolibre.com"
    TOKEN_URL = "https://api.mercadolibre.com/oauth/token"
    SITE = "MLA"  # Argentina

    # Mapeo de categorías internas → IDs de ML
    CATEGORIES = {
        "Electrónica":  "MLA1000",
        "Moda":         "MLA1430",
        "Hogar":        "MLA1574",
        "Deportes":     "MLA1276",
        "Belleza":      "MLA1246",
        "Juguetes":     "MLA5726",
        "Mascotas":     "MLA1700",
    }

    def __init__(self):
        self._access_token: Optional[str] = None
        self._token_expires_at: Optional[datetime] = None

    @property
    def client_id(self) -> str:
        """Lee el client_id del entorno (lazy, para que load_dotenv ya haya corrido)."""
        return os.getenv("ML_CLIENT_ID", "")

    @property
    def client_secret(self) -> str:
        """Lee el client_secret del entorno (lazy)."""
        return os.getenv("ML_CLIENT_SECRET", "")

    def is_configured(self) -> bool:
        """Verifica si las credenciales están configuradas."""
        return bool(self.client_id and self.client_secret)

    async def _get_token(self) -> Optional[str]:
        """
        Obtiene o renueva el access_token via client_credentials.
        El token se cachea en memoria hasta que expira.
        """
        # Si el token aún es válido, reutilizar
        if self._access_token and self._token_expires_at:
            if datetime.utcnow() < self._token_expires_at:
                return self._access_token

        if not self.is_configured():
            print("[ML OAuth] [WARN] ML_CLIENT_ID o ML_CLIENT_SECRET no configurados")
            return None

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(self.TOKEN_URL, data={
                    "grant_type":    "client_credentials",
                    "client_id":     self.client_id,
                    "client_secret": self.client_secret,
                })

                if resp.status_code == 200:
                    data = resp.json()
                    self._access_token = data["access_token"]
                    # ML devuelve expires_in en segundos (típicamente 21600 = 6h)
                    # Renovamos 5 min antes para evitar cortes
                    expires_in = data.get("expires_in", 21600)
                    self._token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in - 300)
                    print(f"[ML OAuth] [OK] Token obtenido, expira en {expires_in // 3600}h")
                    return self._access_token
                else:
                    print(f"[ML OAuth] [ERROR] Error obteniendo token: {resp.status_code} — {resp.text}")
                    return None

        except Exception as e:
            print(f"[ML OAuth] [ERROR] Excepción obteniendo token: {e}")
            return None

    def _auth_headers(self, token: str) -> dict:
        """Headers de autenticación para requests a ML."""
        return {"Authorization": f"Bearer {token}"}

    # ── BÚSQUEDA DE PRODUCTOS ────────────────────────────────────────

    async def search(self, query: str, limit: int = 5, category: Optional[str] = None, dolar_blue: float = 1400) -> list:
        """
        Busca productos en MercadoLibre Argentina.
        Ordena por cantidad de ventas (más vendidos primero).
        """
        token = await self._get_token()
        if not token:
            return []

        try:
            params = {
                "q":     query,
                "sort":  "sold_quantity_desc",
                "limit": min(limit, 50),
            }

            # Si se especifica categoría, agregar filtro
            if category and category in self.CATEGORIES:
                params["category"] = self.CATEGORIES[category]

            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{self.BASE_URL}/sites/{self.SITE}/search",
                    params=params,
                    headers=self._auth_headers(token),
                )

                if resp.status_code == 200:
                    data = resp.json()
                    results = data.get("results", [])
                    return [self._format_item(item, dolar_blue) for item in results]

                elif resp.status_code == 401:
                    # Token expirado — forzar renovación y reintentar
                    print("[ML OAuth] Token expirado, renovando...")
                    self._access_token = None
                    self._token_expires_at = None
                    token = await self._get_token()
                    if token:
                        resp2 = await client.get(
                            f"{self.BASE_URL}/sites/{self.SITE}/search",
                            params=params,
                            headers=self._auth_headers(token),
                        )
                        if resp2.status_code == 200:
                            return [self._format_item(item, dolar_blue) for item in resp2.json().get("results", [])]

                print(f"[ML Search] Error: {resp.status_code}")
                return []

        except Exception as e:
            print(f"[ML Search] Excepción: {e}")
            return []

    # ── DETALLE DE ITEM ──────────────────────────────────────────────

    async def get_item(self, item_id: str) -> Optional[dict]:
        """Obtiene el detalle completo de un item por su ID."""
        token = await self._get_token()
        if not token:
            return None

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{self.BASE_URL}/items/{item_id}",
                    headers=self._auth_headers(token),
                )
                if resp.status_code == 200:
                    return resp.json()
        except Exception as e:
            print(f"[ML Item] Excepción: {e}")

        return None

    # ── TENDENCIAS ───────────────────────────────────────────────────

    async def get_trends(self, category: Optional[str] = None) -> list:
        """Keywords trending de ML (no productos, solo términos de búsqueda)."""
        token = await self._get_token()
        if not token:
            return []
        cat_id = self.CATEGORIES.get(category, "MLA1000")
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{self.BASE_URL}/trends/{self.SITE}/{cat_id}",
                    headers=self._auth_headers(token),
                )
                if resp.status_code == 200:
                    return resp.json()
        except Exception as e:
            print(f"[ML Trends] Excepción: {e}")
        return []

    async def trending_products(self, category: Optional[str] = None, limit: int = 8, dolar_blue: float = 1400) -> list:
        """
        Flujo completo: obtiene keywords trending de ML y busca los productos
        más vendidos para esas keywords. Devuelve productos reales con fotos,
        precios y links directos.
        """
        token = await self._get_token()
        if not token:
            return []

        # Paso 1: obtener términos trending de la categoría
        trends = await self.get_trends(category)
        if not trends:
            # Fallback: buscar directamente por categoría
            return await self.search(
                query=category or "productos mas vendidos",
                limit=limit,
                category=category,
                dolar_blue=dolar_blue
            )

        # Paso 2: tomar los top keywords y buscar productos reales
        keywords = [t["keyword"] for t in trends[:4]]  # top 4 trending
        print(f"[ML Trending] Keywords: {keywords}", flush=True)

        all_items = []
        per_kw = max(2, limit // len(keywords))

        async with httpx.AsyncClient(timeout=15) as client:
            for kw in keywords:
                try:
                    params = {
                        "q": kw,
                        "sort": "sold_quantity_desc",
                        "limit": per_kw,
                    }
                    if category and category in self.CATEGORIES:
                        params["category"] = self.CATEGORIES[category]

                    resp = await client.get(
                        f"{self.BASE_URL}/sites/{self.SITE}/search",
                        params=params,
                        headers=self._auth_headers(token),
                    )
                    if resp.status_code == 200:
                        items = resp.json().get("results", [])
                        all_items.extend(items)
                    elif resp.status_code == 401:
                        self._access_token = None
                except Exception as e:
                    print(f"[ML Trending] Error en '{kw}': {e}")

        # Deduplicar por ID y ordenar por vendidos
        seen = set()
        unique = []
        for item in all_items:
            if item["id"] not in seen:
                seen.add(item["id"])
                unique.append(item)

        unique.sort(key=lambda x: x.get("sold_quantity", 0) or 0, reverse=True)
        return [self._format_item(item, dolar_blue) for item in unique[:limit]]

    # ── FORMATO ──────────────────────────────────────────────────────

    @staticmethod
    def _format_item(item: dict, dolar_blue: float = 1400) -> dict:
        """
        Convierte un resultado crudo de ML al formato completo del frontend R45.

        Lógica de margen REAL para productos locales de ML:
        - Estos productos ya están en Argentina, sin impuestos de importación.
        - El modelo de negocio es: comprás al precio ML, revendés en ML con markup.
        - Costo real = precio_ML * (1 + comision_ML 13% + envio_local 5%)
        - Precio sugerido de reventa = precio_ML * 1.30 (margen bruto 30%)
        - Margen neto = (precio_reventa - costo_real) / costo_real * 100
        """
        price_ars = item.get("price", 0) or 0
        # Precio USD referencial (para comparar con importación)
        price_usd = round(price_ars / dolar_blue, 2) if dolar_blue else 0
        sold = item.get("sold_quantity", 0) or 0

        # ── Cálculo de margen REAL ──────────────────────────────────────
        # Costo real al revendedor: precio compra + comisión ML + envío local
        ML_COMISION  = 0.13   # comisión ML estándar
        ENVIO_LOCAL  = 0.05   # envío dentro de Argentina estimado
        costo_real   = round(price_ars * (1 + ML_COMISION + ENVIO_LOCAL), 2)

        # Precio sugerido de reventa: markup del 30% sobre precio ML actual
        # (conservador — en la práctica los revendedores hacen 20-50%)
        precio_reventa = round(price_ars * 1.30, 2)
        ganancia_ars   = round(precio_reventa - costo_real, 2)
        margin_pct     = round((ganancia_ars / costo_real) * 100, 2) if costo_real > 0 else 0

        # Trend basado en ventas reales
        if sold > 5000:   trend = "🔥 HOT"
        elif sold > 1000: trend = "📈 SUBIENDO"
        elif sold > 100:  trend = "⭐ NUEVO"
        else:             trend = "💎 PREMIUM"

        # Categoría ML → nombre interno
        cat_id = item.get("category_id", "")
        CAT_MAP = {
            "MLA1000": "Electrónica", "MLA1051": "Electrónica",
            "MLA1430": "Moda",        "MLA1132": "Moda",
            "MLA1574": "Hogar",       "MLA1500": "Hogar",
            "MLA1276": "Deportes",
            "MLA1246": "Belleza",
            "MLA5726": "Juguetes",
            "MLA1700": "Mascotas",
        }
        category = CAT_MAP.get(cat_id[:7] if cat_id else "", "General")

        # Thumbnail: ML sirve -I (pequeño), pedimos -O (mediano, ~400px)
        thumbnail = (item.get("thumbnail") or "").replace("-I.jpg", "-O.jpg")

        ml_url    = item.get("permalink", "")
        free_ship = item.get("shipping", {}).get("free_shipping", False)
        condition = item.get("condition", "new")

        desc_parts = []
        if free_ship:        desc_parts.append("✅ Envío gratis")
        if condition == "used": desc_parts.append("📦 Usado")
        desc_parts.append(f"{sold:,} vendidos en ML".replace(",", "."))
        desc_parts.append(f"Margen reventa estimado: {margin_pct:.1f}%")

        return {
            "id":              item.get("id", ""),
            "name":            item.get("title", ""),
            "category":        category,
            "emoji":           "🛍️",
            "image_url":       thumbnail,
            "price_usd":       price_usd,
            # price_sell_ars = precio sugerido de reventa (lo que el usuario cobraría)
            "price_sell_ars":  precio_reventa,
            # ml_price_ars = precio real actual en ML (lo que paga para comprar)
            "ml_price_ars":    price_ars,
            "costo_real":      costo_real,
            "ganancia_ars":    ganancia_ars,
            "margin_pct":      margin_pct,
            "sales_month":     sold,
            "rating":          round(item.get("reviews", {}).get("rating_average", 4.2), 1) if item.get("reviews") else 4.2,
            "trend":           trend,
            "desc":            " · ".join(desc_parts),
            "seller":          "MercadoLibre",
            "seller_url":      ml_url,
            "vendor_type":     "local",
            "buy_options": {
                "local":    {"name": "Ver precio en ML",      "url": ml_url},
                "exterior": {"name": "Buscar en AliExpress",
                              "url": f"https://es.aliexpress.com/w/wholesale-{item.get('title','').replace(' ', '-')}.html"},
            },
        }


# ── Instancia global (singleton) ─────────────────────────────────────
ml_client = MercadoLibreClient()
