"""Test de API interna de MercadoLibre."""
import httpx
import json

# La web de ML usa esta API interna para buscar
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Referer": "https://listado.mercadolibre.com.ar/",
}

# Intentar con distintos endpoints
endpoints = [
    # API interna frontend ML
    "https://frontend-api.mercadolibre.com/search?site=MLA&query=auriculares&limit=5",
    # API con User-Agent de browser
    "https://api.mercadolibre.com/sites/MLA/search?q=auriculares&limit=5",
]

for url in endpoints:
    try:
        r = httpx.get(url, headers=headers, follow_redirects=True, timeout=10)
        print(f"\n{url[:60]}...")
        print(f"  Status: {r.status_code}")
        if r.status_code == 200:
            data = r.json() if "json" in r.headers.get("content-type", "") else {}
            if "results" in data:
                for item in data["results"][:3]:
                    print(f"  - {item.get('title', 'N/A')}: ${item.get('price', 'N/A')}")
            else:
                print(f"  Body: {r.text[:200]}")
        else:
            print(f"  Body: {r.text[:200]}")
    except Exception as e:
        print(f"  Error: {e}")
