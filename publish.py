#!/usr/bin/env python3
"""Publish Language Reactor to Firefox Add-ons (AMO) via API v5."""
import hmac, hashlib, base64, json, time, urllib.request, urllib.error
from urllib.parse import urlencode
from io import BytesIO
import mimetypes

def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

def make_jwt(issuer, secret, expiry=300):
    now = int(time.time())
    h = b64url(b'{"alg":"HS256","typ":"JWT"}')
    p = b64url(json.dumps({"iss":issuer,"iat":now,"exp":now+expiry,"jti":f"{now}","aud":AMO_API}, separators=',:').encode())
    s = b64url(hmac.new(secret.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest())
    return f"{h}.{p}.{s}"

def api(method, url, data=None, headers_extra=None, timeout=30):
    body = data if isinstance(data, (bytes, bytearray)) else json.dumps(data).encode() if data else None
    hdrs = {"Authorization": f"JWT {token}", "Accept": "application/json"}
    if isinstance(data, (bytes, bytearray)):
        hdrs["Content-Type"] = "application/zip"
    elif headers_extra is None:
        hdrs["Content-Type"] = "application/json"
    if headers_extra:
        hdrs.update(headers_extra)
    req = urllib.request.Request(url, data=body, method=method, headers=hdrs)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read()), r.status
    except urllib.error.HTTPError as e:
        return json.loads(e.read()), e.code

# ── Config ────────────────────────────────────────────────────────────────────
JWT_ISSUER = "user:19882704:178"
JWT_SECRET = "39769b5435aa0e8fd21940133cfcf6058188c47c5f940307c69153c216258f76"
AMO_API    = "https://addons.mozilla.org/api/v5"
token      = make_jwt(JWT_ISSUER, JWT_SECRET)

print("JWT OK:", token[:40], "...")
print()

# Step 1 ── Create addon (metadata only, no version yet) ─────────────────────
meta = {
    "name":          {"en-US": "Language Reactor"},
    "slug":          "language-reactor-al-michiboo",
    "summary":       {"en-US": "Learn languages from streaming videos — dual subtitles, word lookup, vocabulary builder."},
    "description":   {"en-US": "Dual subtitle panel for YouTube and Netflix. Click any word for instant translation. Save words with context and export to CSV. Customizable font size, color, and position."},
    "license":       {"slug": "mpl-2.0"},
    "categories":    {"firefox": ["language-learning"]},
    "tags":          ["languages", "subtitles", "vocabulary", "translation", "youtube", "netflix", "learning"],
    "is_experimental":  False,
    "requires_payment": False,
    "supported_api":  ["firefox"],
}

resp, status = api("POST", f"{AMO_API}/addons/addon/", meta)
print(f"[1] Create addon → {status}")
if status in (200, 201):
    addon_id = resp["id"]
    slug = resp.get("slug")
    print(f"  ✅ Created! id={addon_id}  slug={slug}")
else:
    print("  Error:", json.dumps(resp, indent=2)[:500])
    addon_id = None

if not addon_id:
    print("FATAL: Could not create addon."); exit(1)

# Step 2 ── Upload zip → get upload UUID ─────────────────────────────────────
print("\n[2] Uploading extension zip...")
with open("language-reactor.zip", "rb") as f:
    zip_data = f.read()
print(f"  Zip size: {len(zip_data)/1024:.1f} KB")

# POST the raw zip as multipart/form-data
boundary = "XXBOUNDARYXX"
body_parts = [
    b"--XXBOUNDARYXX\r\nContent-Disposition: form-data; name=\"upload\"; filename=\"language-reactor.zip\"\r\nContent-Type: application/zip\r\n\r\n",
    zip_data,
    b"\r\n--XXBOUNDARYXX--\r\n"
]
body = b"".join(body_parts)

upload_req = urllib.request.Request(
    f"{AMO_API}/addons/addon/{addon_id}/versions/",
    data=body,
    method="POST",
    headers={
        "Authorization":       f"JWT {token}",
        "Content-Type":       f"multipart/form-data; boundary=XXBOUNDARYXX",
        "Accept":             "application/json",
        "X-Upload-Complete":  "true",
    }
)
try:
    with urllib.request.urlopen(upload_req, timeout=60) as r:
        upload_resp = json.loads(r.read())
        version_id  = upload_resp.get("id")
        upload_uuid = upload_resp.get("upload", upload_resp.get("uuid"))
        print(f"  ✅ Upload accepted! version_id={version_id}")
        print("  Response:", json.dumps(upload_resp)[:300])
except urllib.error.HTTPError as e:
    body_err = json.loads(e.read())
    print(f"  ❌ Upload failed ({e.code}):", json.dumps(body_err)[:400])
    version_id = None

if not version_id:
    print("FATAL: Upload step failed."); exit(1)

# Step 3 ── Confirm / submit for review ──────────────────────────────────────
print("\n[3] Submitting for review...")
confirm_req = urllib.request.Request(
    f"{AMO_API}/addons/addon/{addon_id}/versions/{version_id}/confirm/",
    data=b"{}",
    method="POST",
    headers={"Authorization": f"JWT {token}", "Content-Type": "application/json", "Accept": "application/json"}
)
try:
    with urllib.request.urlopen(confirm_req, timeout=30) as r:
        conf = json.loads(r.read())
        print(f"  ✅ Submitted for review! status={conf.get('status')}")
except urllib.error.HTTPError as e:
    body_err = json.loads(e.read())
    print(f"  ⚠️  Confirm → {e.code}:", json.dumps(body_err)[:300])

print(f"\n🎉 Done! Your extension is at: https://addons.mozilla.org/addon/{slug}")
