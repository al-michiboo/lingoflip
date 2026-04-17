#!/usr/bin/env python3
"""Step-by-step AMO publish: 1.Create addon  2.Upload zip  3.Confirm"""
import hmac, hashlib, base64, json, time, urllib.request
from io import BytesIO

def b64url(d):
    return base64.urlsafe_b64encode(d).rstrip(b'=').decode()

def mkjwt(iss, sec, exp=300):
    now = int(time.time())
    h = b64url(b'{"alg":"HS256","typ":"JWT"}')
    p = b64url(json.dumps({"iss":iss,"iat":now,"exp":now+exp,"jti":f"{now}","aud":A}, separators=',:').encode())
    s = b64url(hmac.new(sec.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest())
    return f"{h}.{p}.{s}"

def get(url, **kw):
    h = {"Authorization":f"JWT {tok}","Accept":"application/json"}
    h.update(kw.get("headers",{}))
    r = urllib.request.Request(url, data=kw.get("body"), method="GET", headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as u: return json.loads(u.read()), u.status
    except urllib.request.HTTPError as e:
        return json.loads(e.read()), e.code

def post(url, data=None, headers=None, timeout=30):
    h = {"Authorization":f"JWT {tok}","Accept":"application/json","Content-Type":"application/json"}
    if headers: h.update(headers)
    body = json.dumps(data).encode() if isinstance(data, dict) else (data or b"")
    r = urllib.request.Request(url, data=body, method="POST", headers=h)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as u: return json.loads(u.read()), u.status
    except urllib.request.HTTPError as e:
        return json.loads(e.read()), e.code

def post_file(url, zip_bytes, boundary="BOUNDARY123"):
    parts = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"upload\"; filename=\"language-reactor.zip\"\r\nContent-Type: application/zip\r\n\r\n".encode(),
        zip_bytes,
        f"\r\n--{boundary}--\r\n".encode()
    ]
    body = b"".join(parts)
    h = {"Authorization":f"JWT {tok}","Accept":"application/json",
         "Content-Type":f"multipart/form-data; boundary={boundary}","X-Upload-Complete":"true"}
    r = urllib.request.Request(url, data=body, method="POST", headers=h)
    try:
        with urllib.request.urlopen(r, timeout=60) as u: return json.loads(u.read()), u.status
    except urllib.request.HTTPError as e:
        return json.loads(e.read()), e.code

# ── Auth ─────────────────────────────────────────────────────────────────────
JWT_ISS = "user:19882704:178"
JWT_SEC = "39769b5435aa0e8fd21940133cfcf6058188c47c5f940307c69153c216258f76"
A = "https://addons.mozilla.org/api/v5"
tok = mkjwt(JWT_ISS, JWT_SEC)
print("Auth: OK", tok[:40], "...")
print()

# ── Get valid categories ─────────────────────────────────────────────────────
cat_data, cs = get(f"{A}/categories/?type=firefox")
valid_cats = [c["name"] for c in (cat_data.get("results",[]) if isinstance(cat_data,dict) else [])]
print("Valid categories:", valid_cats[:8])
cat = valid_cats[0] if valid_cats else "language-support"
print()

# ── Step 1: Create addon (minimal, no version) ───────────────────────────────
meta = {
    "name":           {"en-US": "Language Reactor"},
    "slug":           "language-reactor-al-michiboo",
    "summary":        {"en-US": "Learn languages from streaming videos — dual subtitles, word lookup, vocabulary builder."},
    "description":    {"en-US": "Dual subtitle panel for YouTube and Netflix. Click any word for instant translation. Save words with context and export to CSV. Customizable."},
    "license":        {"slug": "mpl-2.0"},
    "categories":     {"firefox": [cat]},
    "is_experimental": False,
    "requires_payment": False,
    "supported_api":  ["firefox"],
}
resp, s = post(f"{A}/addons/addon/", meta)
print(f"[1] Create addon → {s}")
if s in (200,201):
    addon_id = resp["id"]; slug = resp.get("slug","?")
    print(f"    ✅ id={addon_id} slug={slug}")
else:
    print("    Error:", json.dumps(resp)[:500])
    exit(1)

# ── Step 2: Upload zip ──────────────────────────────────────────────────────
print("\n[2] Uploading zip...")
with open("language-reactor.zip","rb") as f: zb = f.read()
resp, s = post_file(f"{A}/addons/addon/{addon_id}/versions/", zb)
print(f"    Upload → {s}")
if s in (200,201):
    ver_id = resp.get("id"); upload_uuid = resp.get("upload",{}).get("uuid") if isinstance(resp.get("upload"),dict) else resp.get("upload")
    print(f"    ✅ version_id={ver_id} upload_uuid={upload_uuid}")
else:
    print("    Error:", json.dumps(resp)[:400])
    exit(1)

# ── Step 3: Confirm / submit for review ──────────────────────────────────────
print("\n[3] Confirming submission...")
resp, s = post(f"{A}/addons/addon/{addon_id}/versions/{ver_id}/confirm/", {})
print(f"    Confirm → {s}: {json.dumps(resp)[:200]}")
print()
print("="*60)
print(f"🎉 PUBLISHED! → https://addons.mozilla.org/addon/{slug}")
print("="*60)
