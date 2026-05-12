import httpx, re, urllib.parse

query = "Xiaomi Smart Band 8"
search_url = f"https://www.bing.com/images/search?q={urllib.parse.quote(query + ' product')}&first=1"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html",
}
resp = httpx.get(search_url, headers=headers, timeout=10, follow_redirects=True)

# murl contains the ORIGINAL (full-size) image URLs from search results
# They are encoded as murl&quot;:&quot;URL&quot;
matches = re.findall(r'murl&quot;:&quot;(https?://[^&]+?)&quot;', resp.text)
print(f"Found {len(matches)} full-size image URLs")
for i, m in enumerate(matches[:5]):
    print(f"  [{i}] {m[:120]}")

# Also get high-res Bing thumbnails (these are reliable proxied images)
# Pattern: /th/id/OIP.HASH?w=WIDTH&h=HEIGHT
th_matches = re.findall(r'(https?://tse\d+\.mm\.bing\.net/th/id/[^"&]+)', resp.text)
unique_th = list(dict.fromkeys(th_matches))  # dedupe
print(f"\nFound {len(unique_th)} unique Bing thumbnails")
for i, m in enumerate(unique_th[:5]):
    # Add size parameters for better quality
    clean = m.split('?')[0] + '?w=300&h=200&c=7'
    print(f"  [{i}] {clean[:120]}")
