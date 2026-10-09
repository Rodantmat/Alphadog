#!/usr/bin/env python3
"""
PROBE (nba-probe.yml): can the Betr cloud session renew ITSELF? (owner 2026-10-09: the app needs a key update every ~30 days;
make the system auto-update it). Prints the ANATOMY of the seeded session (cookie names / expiries, localStorage key names, the
shape of each value, and the exp / iat / aud of any JWT inside it) and tests a Keycloak refresh with the offline refresh token.
NEVER prints a token, a cookie value or a secret - only names, lengths, hashes' first 6 chars and decoded claim timestamps.
Env (from the probe workflow): BETR_SESSION_STATE, BETR_REFRESH_TOKEN, BETR_CLIENT_ID, BETR_ACCESS_TOKEN.
"""
import base64
import hashlib
import json
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone

KC = "https://account.betr.app/realms/betr/protocol/openid-connect/token"
JWT_RE = re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")


def h6(s):
    return hashlib.sha256((s or "").encode()).hexdigest()[:6]


def claims(tok):
    try:
        p = tok.split(".")[1]
        p += "=" * (-len(p) % 4)
        c = json.loads(base64.urlsafe_b64decode(p))
        f = lambda t: datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%d %H:%MZ") if t else None
        return {"typ": c.get("typ"), "aud": c.get("aud"), "azp": c.get("azp"), "iat": f(c.get("iat")), "exp": f(c.get("exp")),
                "sid6": h6(str(c.get("sid"))), "scope": (c.get("scope") or "")[:60]}
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)[:60]}


def main():
    st = os.environ.get("BETR_SESSION_STATE", "").strip()
    print(f"BETR_SESSION_STATE: {len(st)} bytes", flush=True)
    if st:
        s = json.loads(st)
        print(f"  url: {s.get('url')}", flush=True)
        for c in s.get("cookies") or []:
            exp = c.get("expiry")
            print(f"  cookie {c.get('name')!r:<40} domain={c.get('domain')} len={len(str(c.get('value') or ''))} "
                  f"expiry={datetime.fromtimestamp(exp, timezone.utc).strftime('%Y-%m-%d') if exp else None} jwt={bool(JWT_RE.search(str(c.get('value') or '')))}", flush=True)
        for k, v in (s.get("localStorage") or {}).items():
            v = str(v or "")
            shape = "json" if v[:1] in "{[" else "text"
            keys = None
            if shape == "json":
                try:
                    j = json.loads(v); keys = list(j.keys())[:12] if isinstance(j, dict) else f"list[{len(j)}]"
                except Exception:  # noqa: BLE001
                    shape = "json?"
            toks = JWT_RE.findall(v)
            print(f"  localStorage {k!r:<50} {shape} len={len(v)} keys={keys} jwts={len(toks)}", flush=True)
            for t in toks[:3]:
                print(f"      jwt {h6(t)}: {claims(t)}", flush=True)
    at = os.environ.get("BETR_ACCESS_TOKEN", "").strip()
    if at:
        print(f"BETR_ACCESS_TOKEN secret {h6(at)}: {claims(at)}", flush=True)
    rt = os.environ.get("BETR_REFRESH_TOKEN", "").strip(); cid = os.environ.get("BETR_CLIENT_ID", "").strip()
    print(f"BETR_REFRESH_TOKEN: {len(rt)} bytes ({h6(rt)}), client_id set: {bool(cid)}", flush=True)
    if rt and cid:
        print(f"  refresh token claims: {claims(rt)}", flush=True)
        body = urllib.parse.urlencode({"grant_type": "refresh_token", "client_id": cid, "refresh_token": rt}).encode()
        req = urllib.request.Request(KC, data=body, headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": "okhttp/4.9.2", "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                j = json.loads(r.read().decode()); code = r.status
        except urllib.error.HTTPError as e:
            code = e.code; j = {"error_body": e.read().decode("utf-8", "replace")[:200]}
        print(f"  Keycloak refresh: http {code}; keys {sorted(j.keys())}", flush=True)
        if "access_token" in j:
            print(f"    new access token {h6(j['access_token'])}: {claims(j['access_token'])}; expires_in {j.get('expires_in')} s", flush=True)
            print(f"    refresh_expires_in {j.get('refresh_expires_in')}; refresh token rotated: {h6(j.get('refresh_token','')) != h6(rt)}", flush=True)
        else:
            print(f"    body: {str(j)[:200]}", flush=True)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
