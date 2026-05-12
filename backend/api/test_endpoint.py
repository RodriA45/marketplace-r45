import urllib.request
import json

url = "http://127.0.0.1:8000/ai-products?custom_prompt=auriculares%20gamer%20baratos&stores=AliExpress"
try:
    print(f"Testing URL: {url}")
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode('utf-8'))
        print(f"Status: {response.status}")
        print(f"Found {len(data.get('results', []))} products.")
        if data.get('results'):
            first = data['results'][0]
            print(f"First product:")
            print(f"- Name: {first.get('name')}")
            print(f"- Price USD: {first.get('price_usd')}")
            print(f"- Seller: {first.get('seller')}")
            print(f"- Seller URL: {first.get('seller_url')}")
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code} - {e.read().decode('utf-8')}")
except Exception as e:
    print(f"Error: {e}")
