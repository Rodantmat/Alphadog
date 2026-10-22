#!/usr/bin/env python3
"""
RESEARCH - which Underdog setup does the OWNER's account get? (2026-10-21 20:05 PT)

Why: on the board our scraper reads (product_experience_id b34dfd93..., state_config_id 725014ef...), 5 of the 6 legs of the owner's
6-pick Flex (saved slip 175: Johnson / Antetokounmpo / Reaves / Sabonis / Davis Unders) were priced ONLY as prediction-market contracts
(no fantasy price), and signed-in estimates of prediction-only picks are refused "can't be combined" 48 of 50 times - yet the owner placed
that slip as a Flex in his app. The owner also reports a prediction leg blocks Flex. So his app is likely served a different product
experience / state rule set than the ids our scraper sends.

What this does (signed in as the owner, read-only, human-paced - at most 4 calls, 8-20 s apart, one proxy route):
  1. GET /v1/user              -> prints only the NAMES of the fields, plus the values of fields about product experience / state /
                                  jurisdiction / region (ids, never e-mail, name, phone, address or birth date).
  2. if the account carries a product_experience_id / state_config_id different from ours: GET one core board page with the account's
     ids and one with ours, and count, per side, fantasy-priced vs prediction-only options on each - same games, same moment.
Nothing is created or submitted. Nothing secret is printed.
"""
import json
import os
import random
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

API = "https://api.underdogfantasy.com"
OUR_PX = "b34dfd93-d0e8-4da3-8bf4-45c15c548dec"
OUR_ST = "725014ef-3570-4e93-871d-d69674ab3521"
SAFE = re.compile(r"experience|state|jurisdiction|region|config|product|location|geo|country|tier|segment|cohort|flag", re.I)
NEVER = re.compile(r"mail|name|phone|address|birth|dob|ssn|token|password|secret|card|bank|zip|postal", re.I)


def pause(a=8.0, b=20.0):
    time.sleep(random.uniform(a, b))


def walk(obj, path=""):
    """yield (path, value) for leaf fields whose key looks like product/state context and never personal data"""
    if isinstance(obj, dict):
        for k, v in obj.items():
            p = f"{path}.{k}" if path else k
            if NEVER.search(k):
                continue
            if isinstance(v, (dict, list)):
                yield from walk(v, p)
            elif SAFE.search(p):          # full path: user.product_experience.id is the account's experience id (run 39714234186 skipped it)
                yield p, v
    elif isinstance(obj, list):
        for i, v in enumerate(obj[:20]):
            yield from walk(v, f"{path}[{i}]")


def count_kinds(j):
    lines = j.get("over_under_lines") or []
    if isinstance(lines, dict):
        lines = list(lines.values())
    c = {"fantasy": 0, "prediction_only": 0, "other": 0, "lines": len(lines)}
    for ln in lines:
        for o in ln.get("options") or []:
            od = o.get("odds") or {}
            if od.get("fantasy"):
                c["fantasy"] += 1
            elif od.get("prediction"):
                c["prediction_only"] += 1
            else:
                c["other"] += 1
    return c


def main():
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "curl_cffi"], check=True)
    import psycopg
    from curl_cffi import requests as cr
    from underdog_auth import access_token
    url = os.environ["DATABASE_URL"]
    with psycopg.connect(url) as conn:
        proxy = ((conn.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = 'proxy_url'").fetchone() or [""])[0] or "").strip()
        dev = (conn.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = 'underdog_device_id'").fetchone() or [""])[0]
        uid = (conn.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = 'underdog_user_id'").fetchone() or [""])[0]
    sess = cr.Session(impersonate="chrome")
    with psycopg.connect(url) as conn:
        tok, exp, how = access_token(conn, sess, proxy)
    if not tok:
        print(f"AUTH_FAIL|{how}")
        sys.exit(1)
    print(f"AUTH|signed in ({how})", flush=True)
    H = {"accept": "application/json", "origin": "https://app.underdogsports.com", "referer": "https://app.underdogsports.com/",
         "client-type": "web", "client-version": os.environ.get("UNDERDOG_CLIENT_VERSION", "20260907143253"), "client-device-id": dev,
         "user-latitude": "32.65148161377867", "user-longitude": "-116.8550890281236", "authorization": "Bearer " + tok}
    if uid:
        H["UD-User-ID"] = uid
    px = {"https": proxy, "http": proxy} if proxy else None

    def get(u):
        r = sess.get(u, headers=H, timeout=30, proxies=px)
        ok = r.status_code == 200 and r.text.strip().startswith("{")
        if not ok:
            print(f"HTTP {r.status_code} on {u.split('?')[0].replace(API, '')}: {r.text[:200]!r}", flush=True)
        return r.json() if ok else None

    pause(20, 45)
    common = f"product=fantasy&product_experience_id={OUR_PX}&state_config_id={OUR_ST}"
    j = get(f"{API}/v1/user?{common}")
    if not j:
        return
    u = j.get("user") or j
    print("USER fields:", sorted(u.keys()) if isinstance(u, dict) else type(u).__name__, flush=True)
    found = {}
    for p, v in walk(j):
        print(f"  {p} = {v!r}", flush=True)
        found[p] = v
    ids = {str(v) for v in found.values() if isinstance(v, str) and re.fullmatch(r"[0-9a-f-]{36}", v)}
    px_user = next((str(v) for p, v in found.items() if "product_experience" in p.lower() and isinstance(v, str)), None)
    st_user = next((str(v) for p, v in found.items() if "state_config" in p.lower() and isinstance(v, str)), None)
    print(f"account product_experience_id: {px_user or 'not in /v1/user'} (ours {OUR_PX[:8]}) | state_config_id: {st_user or 'not in /v1/user'} (ours {OUR_ST[:8]}) | uuid-like ids seen {len(ids)}", flush=True)

    sets = [("ours", OUR_PX, OUR_ST)]
    if (px_user and px_user != OUR_PX) or (st_user and st_user != OUR_ST):
        sets.append(("account", px_user or OUR_PX, st_user or OUR_ST))
    for lab, pxid, st in sets:
        pause()
        q = f"product=fantasy&product_experience_id={pxid}&state_config_id={st}"
        jj = get(f"{API}/v1/lobbies/content/match_grouped_lines?include_live=false&market_categories%5B%5D=core&match_limit=200&{q}&show_more_picks_cta=true&sport_id=NBA&two_box_enabled_surface=true")
        if jj:
            print(f"BOARD[{lab}] signed in: {count_kinds(jj)}", flush=True)
    # the same page as our scraper sees it (no sign-in), so a signed-in difference is visible on its own
    pause()
    Hn = {k: v for k, v in H.items() if k not in ("authorization", "UD-User-ID")}
    r = sess.get(f"{API}/v1/lobbies/content/match_grouped_lines?include_live=false&market_categories%5B%5D=core&match_limit=200&{common}&show_more_picks_cta=true&sport_id=NBA&two_box_enabled_surface=true",
                 headers=Hn, timeout=30, proxies=px)
    if r.status_code == 200 and r.text.strip().startswith("{"):
        print(f"BOARD[ours, not signed in]: {count_kinds(r.json())}", flush=True)
    else:
        print(f"BOARD[ours, not signed in]: HTTP {r.status_code}", flush=True)


if __name__ == "__main__":
    main()
