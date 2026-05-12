import urllib.request
import json
import sys

url = "http://127.0.0.1:8000/ai-products?custom_prompt=juguetes&stores=AliExpress,Temu"
print(f"Testing: {url}")
try:
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=60) as response:
        raw = response.read()
        data = json.loads(raw)
        products = data.get("products", [])
        print(f"Status: {response.status}")
        print(f"Products count: {len(products)}")
        if products:
            for i, p in enumerate(products[:3]):
                print(f"\n--- Product {i+1} ---")
                print(f"  Name: {p.get('name')}")
                print(f"  Seller: {p.get('seller')}")
                print(f"  URL: {p.get('seller_url', 'N/A')[:80]}")
                print(f"  Price USD: {p.get('price_usd')}")
                print(f"  Price ARS: {p.get('price_sell_ars')}")
        else:
            print("NO PRODUCTS RETURNED!")
            print(f"Full response keys: {list(data.keys())}")
            print(f"Raw (first 500): {raw[:500]}")
except urllib.error.HTTPError as e:
    body = e.read().decode('utf-8', errors='replace')
    print(f"HTTP Error {e.code}: {body[:500]}")
except Exception as e:
    print(f"Error: {type(e).__name__}: {e}")
