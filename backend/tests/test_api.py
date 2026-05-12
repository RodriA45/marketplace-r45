import pytest
from fastapi.testclient import TestClient
from api.api import app

client = TestClient(app)


def test_root_serves_frontend():
    """GET / debe devolver el index.html del frontend (no JSON)."""
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")


def test_status_endpoint():
    """GET /status devuelve el JSON de health check."""
    response = client.get("/status")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["app"] == "Marketplace R45 API"
    assert "version" in data


def test_get_dolar():
    """GET /dolar devuelve cotizaciones válidas."""
    response = client.get("/dolar")
    assert response.status_code == 200
    data = response.json()
    assert "blue" in data
    assert "oficial" in data
    assert "mep" in data
    assert "ccl" in data
    assert "tarjeta" in data
    assert "spread_pct" in data
    assert "updated_at" in data
    assert data["blue"] > 0
    assert data["oficial"] > 0
    assert data["tarjeta"] > data["oficial"], "Tarjeta debe ser mayor que oficial (incluye impuestos)"


def test_dolar_tarjeta_calculo():
    """El dólar tarjeta debe ser oficial * 1.30 * 1.21."""
    response = client.get("/dolar")
    data = response.json()
    esperado = round(data["oficial"] * 1.30 * 1.21, 2)
    assert abs(data["tarjeta"] - esperado) <= 1


def test_ml_search_sin_credenciales():
    """GET /ml-search sin credenciales ML debe devolver 503."""
    import os
    orig_id = os.environ.pop("ML_CLIENT_ID", None)
    orig_secret = os.environ.pop("ML_CLIENT_SECRET", None)
    from api.mercadolibre import ml_client
    ml_client._access_token = None

    response = client.get("/ml-search?q=auriculares")
    assert response.status_code == 503

    if orig_id:
        os.environ["ML_CLIENT_ID"] = orig_id
    if orig_secret:
        os.environ["ML_CLIENT_SECRET"] = orig_secret


def test_ai_products_sin_gemini_key():
    """GET /ai-products sin GEMINI_API_KEY debe devolver 500."""
    import os
    orig = os.environ.pop("GEMINI_API_KEY", None)

    response = client.get("/ai-products")
    assert response.status_code == 500
    assert "Gemini" in response.json()["detail"]

    if orig:
        os.environ["GEMINI_API_KEY"] = orig


def test_product_not_found():
    """GET /products/id-inexistente — sin Supabase devuelve 404 o 500."""
    response = client.get("/products/id-que-no-existe-12345")
    assert response.status_code in (404, 500, 503)


def test_history_not_found():
    """GET /history/id-inexistente — sin Supabase devuelve 404 o 500."""
    response = client.get("/history/id-que-no-existe-12345")
    assert response.status_code in (404, 500, 503)
