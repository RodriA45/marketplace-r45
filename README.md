# Marketplace R45 🚀

Sistema de arbitraje e-commerce para Argentina — muestra los productos más vendidos en MercadoLibre en tiempo real, calcula márgenes reales de reventa y genera oportunidades de importación con IA.

## ¿Qué hace?

Conecta con la API oficial de MercadoLibre para traer los productos trending del momento, ordenados por cantidad de ventas reales. Para cada producto calcula cuánto te cuesta comprarlo, cuánto podés revenderlo y cuál es tu margen neto después de comisiones.

Para tiendas de importación (AliExpress, Temu, Shein, etc.) usa IA (Gemini con fallback a Claude) que genera productos rentables específicos de esa tienda. Lo mismo para prompts custom del usuario ("productos para madres", "tecnología bajo $20").

**Funcionalidades:**
- Productos reales de MercadoLibre ordenados por ventas — actualizados en cada carga
- Cálculo de margen real: precio ML + comisión 13% + envío 5% vs precio de reventa sugerido
- Para importación: desglose completo de imp. PAIS 30%, IVA 21%, percepciones AFIP
- Cotizaciones en tiempo real — Blue, Oficial, MEP, CCL, Tarjeta
- IA por tienda — AliExpress, Temu, Amazon, Shein, Alibaba con prompts personalizados
- Sistema de usuarios — registro/login, wishlist persistente, alertas por email ligadas a tu cuenta
- Alertas de margen — te avisa por email cuando aparece un producto con el margen que definís

## Tecnologías

- **Frontend**: Vanilla JS + HTML5 + CSS3 (sin frameworks)
- **Backend**: Python 3.10+, FastAPI, Uvicorn
- **Productos reales**: MercadoLibre API OAuth 2.0
- **IA**: Gemini 2.5 Flash (primario) + Claude Haiku (fallback automático)
- **Auth y base de datos**: Supabase (PostgreSQL + Auth)
- **Cotizaciones**: dolarapi.com + Bluelytics (fallback)
- **Email**: Resend
- **Imágenes**: Bing CDN via proxy del backend

## Estructura

```
r45/
├── index.html              # UI principal
├── app.js                  # Lógica principal del frontend
├── auth.js                 # Login, registro y wishlist persistente
├── alerts.js               # Sistema de alertas
├── ml-api.js               # Cliente MercadoLibre frontend
├── chart-history.js        # Gráficos Chart.js
├── styles.css              # Estilos
├── start.bat               # Inicio rápido Windows
├── start.sh                # Inicio rápido Mac/Linux
└── backend/
    ├── api/
    │   ├── api.py           # Todos los endpoints FastAPI
    │   └── mercadolibre.py  # OAuth 2.0 ML + trending_products()
    ├── scraper/scraper.py   # Cron job de alertas por email
    ├── sql/01_tablas.sql    # Schema completo de Supabase
    ├── tests/test_api.py    # Tests con pytest
    ├── requirements.txt
    └── .env.example
```

## Instalación

### Variables de entorno

Copiá `backend/.env.example` a `backend/.env` y completá:

```env
# MercadoLibre — obligatorio para productos reales
ML_CLIENT_ID=tu_app_id
ML_CLIENT_SECRET=tu_secret

# IA — para tiendas externas y prompts custom
GEMINI_API_KEY=AIzaSy...          # primario, gratis en aistudio.google.com
ANTHROPIC_API_KEY=sk-ant-...      # fallback automático si Gemini falla

# Supabase — para usuarios, alertas y wishlist
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbG...

# Emails
RESEND_API_KEY=re_xxxxx
FROM_EMAIL=onboarding@resend.dev
```

> La key de Gemini debe tener las restricciones de host desactivadas en Google AI Studio para funcionar desde Railway.

### Inicio rápido

**Windows:** doble clic en `start.bat`

**Mac/Linux:**
```bash
chmod +x start.sh && ./start.sh
```

### Inicio manual

```bash
cd backend/api
python -m uvicorn api:app --reload --port 8000
```

Abrí `http://localhost:8000`.

> ⚠️ No abrir `index.html` directo — siempre usar `http://localhost:8000`.

### Base de datos

La primera vez, ejecutá en Supabase → SQL Editor:
```
backend/sql/01_tablas.sql
```

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/products?category=Electrónica` | Productos trending de MercadoLibre |
| `GET` | `/ai-products?stores=AliExpress&custom_prompt=...` | Productos generados por IA |
| `GET` | `/image?q=nombre+producto` | Proxy de imágenes (Bing CDN) |
| `POST` | `/alerts` | Crear alerta (requiere auth) |
| `GET` | `/alerts` | Ver alertas del usuario (requiere auth) |
| `POST` | `/saved` | Guardar producto (requiere auth) |
| `GET` | `/saved` | Ver productos guardados (requiere auth) |
| `GET` | `/dolar` | Cotizaciones en tiempo real |
| `GET` | `/docs` | Documentación interactiva Swagger |

## Cómo se calcula el margen

**Productos de MercadoLibre (locales):**
```
Costo real = precio ML × (1 + 13% comisión + 5% envío)
Reventa sugerida = precio ML × 1.30
Margen = (reventa - costo) / costo × 100
```

**Productos de importación (AliExpress, etc.):**
```
Base ARS = precio USD × dólar blue
+ Imp. PAIS 30%
+ IVA 21% + Percepción IVA AFIP 21%
+ Percepción Ganancias 30%
+ Envío internacional 12%
= Costo total real
```

## Deploy en Railway

1. Subí el repo a GitHub (sin el `.env`)
2. Railway → New Project → Deploy from GitHub
3. Agregá las variables de entorno en Railway
4. Railway detecta el `Procfile` en `backend/api/` automáticamente

---
