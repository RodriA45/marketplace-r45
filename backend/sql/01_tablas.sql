-- ═══════════════════════════════════════════════════════════
-- MARKETPLACE R45 — Supabase
-- Ir a: supabase.com → tu proyecto → SQL Editor → pegar y Run
-- ═══════════════════════════════════════════════════════════

-- ── PRODUCTOS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  category       TEXT NOT NULL,
  emoji          TEXT DEFAULT '📦',
  price_usd      NUMERIC(10,2) NOT NULL,
  price_sell_ars NUMERIC(12,2) NOT NULL,
  vendor_type    TEXT DEFAULT 'exterior',   -- 'exterior' | 'local'
  seller         TEXT,
  seller_url     TEXT,
  ml_item_id     TEXT,                      -- ID de MercadoLibre si aplica
  sales_month    INTEGER DEFAULT 0,
  rating         NUMERIC(3,1) DEFAULT 4.5,
  trend          TEXT DEFAULT '🔥 HOT',
  description    TEXT,
  tags           TEXT[],
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_active   ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_updated  ON products(updated_at DESC);

-- ── HISTORIAL DE PRECIOS ─────────────────────────────────────
-- Una fila por producto por día = gráfico real de 30/90 días
CREATE TABLE IF NOT EXISTS price_history (
  id             BIGSERIAL PRIMARY KEY,
  product_id     UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_usd      NUMERIC(10,2) NOT NULL,
  price_sell_ars NUMERIC(12,2) NOT NULL,
  dolar_blue     NUMERIC(8,2),
  dolar_oficial  NUMERIC(8,2),
  margin_pct     NUMERIC(5,2),
  recorded_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id);
CREATE INDEX IF NOT EXISTS idx_price_history_date    ON price_history(recorded_at DESC);

-- Vista: último precio de cada producto
CREATE OR REPLACE VIEW v_latest_prices AS
SELECT DISTINCT ON (product_id)
  product_id, price_usd, price_sell_ars,
  dolar_blue, margin_pct, recorded_at
FROM price_history
ORDER BY product_id, recorded_at DESC;

-- ── ALERTAS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL,
  min_margin      NUMERIC(5,2) DEFAULT 50,
  categories      TEXT[],                   -- vacío = todas
  is_active       BOOLEAN DEFAULT TRUE,
  triggered_count INTEGER DEFAULT 0,
  last_triggered  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_email  ON alerts(email);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(is_active);

-- ── LOG ALERTAS ENVIADAS ─────────────────────────────────────
-- Evita mandar la misma alerta dos veces el mismo día
CREATE TABLE IF NOT EXISTS alert_logs (
  id         BIGSERIAL PRIMARY KEY,
  alert_id   UUID REFERENCES alerts(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  margin_pct NUMERIC(5,2),
  email_sent BOOLEAN DEFAULT FALSE,
  sent_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_logs_date ON alert_logs(sent_at DESC);

-- ── HISTORIAL DEL DÓLAR ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS dolar_history (
  id          BIGSERIAL PRIMARY KEY,
  blue        NUMERIC(8,2),
  oficial     NUMERIC(8,2),
  mep         NUMERIC(8,2),
  ccl         NUMERIC(8,2),
  spread_pct  NUMERIC(5,2),
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dolar_date ON dolar_history(recorded_at DESC);

CREATE OR REPLACE VIEW v_dolar_latest AS
SELECT blue, oficial, mep, ccl, spread_pct, recorded_at
FROM dolar_history ORDER BY recorded_at DESC LIMIT 1;

-- ── TRIGGER: updated_at automático ──────────────────────────
CREATE OR REPLACE FUNCTION fn_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION fn_updated_at();

-- ── RLS: seguridad por roles ─────────────────────────────────
ALTER TABLE products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE dolar_history ENABLE ROW LEVEL SECURITY;

-- Frontend puede leer todo
CREATE POLICY "read_products"      ON products      FOR SELECT USING (true);
CREATE POLICY "read_price_history" ON price_history FOR SELECT USING (true);
CREATE POLICY "read_dolar"         ON dolar_history FOR SELECT USING (true);
CREATE POLICY "read_alerts"        ON alerts        FOR SELECT USING (true);

-- Solo el scraper/API (service_role) puede escribir
CREATE POLICY "write_products"      ON products      FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "update_products"     ON products      FOR UPDATE USING     (auth.role() = 'service_role');
CREATE POLICY "write_price_history" ON price_history FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "write_dolar"         ON dolar_history FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "write_alert_logs"    ON alert_logs    FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Cualquiera puede crear una alerta (formulario público)
CREATE POLICY "create_alerts" ON alerts FOR INSERT WITH CHECK (true);


-- ══════════════════════════════════════════════════════════════
-- USUARIOS: vincular alertas a usuarios autenticados
-- Supabase Auth maneja el login — acá solo extendemos el perfil
-- ══════════════════════════════════════════════════════════════

-- Perfil público del usuario (se crea automáticamente al registrarse)
CREATE TABLE IF NOT EXISTS user_profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT,
  display_name TEXT,
  plan         TEXT DEFAULT 'free',   -- 'free' | 'pro'
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own"   ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON user_profiles FOR UPDATE USING (auth.uid() = id);

-- Función: crear perfil automáticamente cuando alguien se registra
CREATE OR REPLACE FUNCTION fn_create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_create_user_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION fn_create_user_profile();

-- Agregar user_id a alertas (nullable para no romper las existentes)
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id);

-- RLS en alertas: cada usuario solo ve las suyas
DROP POLICY IF EXISTS "read_alerts"  ON alerts;
DROP POLICY IF EXISTS "create_alerts" ON alerts;
CREATE POLICY "alerts_read_own"   ON alerts FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "alerts_create_own" ON alerts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "alerts_delete_own" ON alerts FOR UPDATE USING (auth.uid() = user_id);

-- Guardados del usuario (wishlist persistente)
CREATE TABLE IF NOT EXISTS saved_products (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ml_item_id    TEXT NOT NULL,          -- ID del producto en ML
  name          TEXT,
  price_ars     NUMERIC(12,2),
  category      TEXT,
  ml_url        TEXT,
  image_url     TEXT,
  margin_pct    NUMERIC(5,2),
  saved_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, ml_item_id)
);

ALTER TABLE saved_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved_read_own"   ON saved_products FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "saved_insert_own" ON saved_products FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "saved_delete_own" ON saved_products FOR DELETE USING (auth.uid() = user_id);
