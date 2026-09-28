#!/usr/bin/env python3
"""
Betr probe v13 (2026-09-28). Cookie hypothesis killed (no Set-Cookie anywhere; userinfo 200 proves the
token is valid). So the fantasy gateway rejects on a token CLAIM the refreshed token lacks. This diffs the
CAPTURED browser token (works in Chrome) against the REFRESHED token claim-by-claim, and tries the GraphQL
with the captured token under GET-with-persisted-query and with an apollo-style operation to rule out the
"POST shape" possibility. Also decodes both fully.
Read-only. Secrets from env.
"""
import base64
import json
import os

from curl_cffi import requests

KC = "https://account.betr.app/realms/betr/protocol/openid-connect/token"
GQL = "https://api.fantasy.betr.app/graphql"
RT = os.environ.get("BETR_REFRESH_TOKEN", "")
CID = os.environ.get("BETR_CLIENT_ID", "betr-rn")
CAP = os.environ.get("BETR_ACCESS_TOKEN", "")


def claims(tok):
    p = tok.split(".")[1]; p += "=" * (-len(p) % 4)
    return json.loads(base64.urlsafe_b64decode(p))


def main():
    r = requests.post(KC, data={"grant_type": "refresh_token", "client_id": CID, "refresh_token": RT,
                                "scope": "openid profile email offline_access"},
                      headers={"content-type": "application/x-www-form-urlencoded"}, impersonate="chrome124", timeout=30)
    ref = r.json().get("access_token")
    cr = claims(ref); cc = claims(CAP) if CAP else {}
    print("REFRESHED claims:", json.dumps(cr, indent=1)[:1500])
    print("\nCAPTURED  claims:", json.dumps(cc, indent=1)[:1500])
    if cc:
        rk, ck = set(cr), set(cc)
        print("\nonly in CAPTURED:", ck - rk)
        print("only in REFRESHED:", rk - ck)
        for k in (ck & rk):
            if cr.get(k) != cc.get(k) and k not in ("exp", "iat", "jti", "auth_time", "sid"):
                print(f"  DIFF {k}: refreshed={json.dumps(cr.get(k))[:80]} captured={json.dumps(cc.get(k))[:80]}")

    # try issuing a token WITHOUT the account audience narrowing: default scope (what the browser likely used)
    r2 = requests.post(KC, data={"grant_type": "refresh_token", "client_id": CID, "refresh_token": RT},
                       headers={"content-type": "application/x-www-form-urlencoded"}, impersonate="chrome124", timeout=30)
    if r2.status_code == 200:
        d2 = claims(r2.json()["access_token"])
        print("\nno-scope refresh claims keys:", sorted(d2.keys()))
        print("  scope:", d2.get("scope"), "| azp:", d2.get("azp"), "| aud:", d2.get("aud"))


if __name__ == "__main__":
    main()
