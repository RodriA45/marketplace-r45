import urllib.request
import json

url = "http://127.0.0.1:8000/ai-products?custom_prompt=auriculares%20gamer%20baratos&stores=AliExpress"
try:
    print(f"Testing URL: {url}")
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as response:
        raw = response.read().decode('utf-8')
        print(f"Raw response: {raw[:500]}")
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code} - {e.read().decode('utf-8')}")
except Exception as e:
    print(f"Error: {e}")
