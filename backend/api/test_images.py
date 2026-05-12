import urllib.request, json
url = "http://127.0.0.1:8000/ai-products?custom_prompt=auriculares+bluetooth&stores=AliExpress"
print(f"Testing: {url}")
try:
    with urllib.request.urlopen(url, timeout=90) as resp:
        data = json.loads(resp.read())
        products = data.get("products", [])
        print(f"Products: {len(products)}")
        for i, p in enumerate(products[:3]):
            img = p.get("image_url", "NONE")
            print(f"\n[{i}] {p.get('name', '?')}")
            print(f"    image_url: {img[:80] if img else 'EMPTY'}")
except Exception as e:
    print(f"Error: {e}")
