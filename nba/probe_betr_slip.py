#!/usr/bin/env python3
"""
PROBE - HOW BETR PRICES A SLIP (2026-10-18, owner: "For betr build slips, you have the key, find out how it works, you have the
access, the system is there, explore and figure it out").  Nothing is submitted: no entry, no deposit, no wager mutation is sent.

Boot = EXACTLY the cloud harvest's sequence (betr_harvest_cloud.py: first load, captcha pass, seed the session from the
credential store with the same renewal rule - renewal persists rotated tokens, so the harvest keeps working -, clear the geo
prompt, root reload, clear it again, press the league chip with a real mouse). Run 39191779086 (own boot order, no renewal)
stayed on /AllowLocation?errorMode=locationAccess; if that happens again the probe grants geolocation (San Diego) and retries.
Then, one run:
 1. BUNDLES through CDP (Page.getResourceTree + Page.getResourceContent - an in-page fetch() of the app bundle failed with
    "Failed to fetch" on 39191779086): every GraphQL operation in the app's JS whose name or document mentions lineup / pick /
    entry / payout / multiplier / slip / wager / quote / price / boost, plus api hosts / REST paths.
 2. WIRE: taps BETR_TAPS (default 3) different players' MORE buttons on the board so the app builds a slip itself; prints every
    graphql / api request (operation, variables) and every response mentioning pricing, for 60 s, and the slip panel's visible
    text (the multiplier the app shows).
Env: DATABASE_URL, PROXY_URL, BETR_SESSION_ID, BETR_LEAGUE (NBA), BETR_TAPS.
"""
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import betr_harvest_cloud as H  # noqa: E402
from seleniumbase import SB  # noqa: E402

KEY = re.compile(r"lineup|pick|entry|entries|payout|multiplier|slip|wager|quote|price|boost|odds|parlay|power|flex|insur", re.I)
OP_RE = re.compile(r"(query|mutation|subscription)\s+([A-Za-z0-9_]+)\s*(\([^)]{0,600}\))?\s*\{")
TAPS = int(os.environ.get("BETR_TAPS", "3"))


def boot(sb):
    if not H.open_alive(sb, H.URL, "first load"):
        print("NO PAGE: the proxy never carried picks.betr.app", flush=True)
        sys.exit(4)
    H.enable_network(sb)
    for _ in range(3):
        try:
            sb.uc_gui_click_captcha()
        except Exception:  # noqa: BLE001
            pass
        time.sleep(4)
    st, src = H.load_session_state()
    print(f"session state: {len(st)} bytes from the {src}", flush=True)
    if st:
        st, status = H.renew_session_state(st)
        print(status, flush=True)
        s = json.loads(st)
        for k, v in (s.get("localStorage") or {}).items():
            try:
                sb.execute_script("localStorage.setItem(arguments[0], arguments[1]);", k, v)
            except Exception:  # noqa: BLE001
                pass
        for c in s.get("cookies") or []:
            ck = {kk: c[kk] for kk in ("name", "value", "domain", "path", "secure", "expiry") if kk in c and c[kk] is not None}
            try:
                sb.driver.add_cookie(ck)
            except Exception:  # noqa: BLE001
                pass
        H.open_alive(sb, H.URL, "after seeding")
        time.sleep(4)
    H.where(sb, "after seeding")
    H.clear_geo(sb)
    H.open_alive(sb, H.URL, "root")
    time.sleep(2)
    H.enable_network(sb)
    H.clear_geo(sb)
    H.where(sb, "after root (attached)")
    if "AllowLocation" in (sb.get_current_url() or ""):
        print("  still on the geo prompt - granting geolocation (San Diego) and retrying", flush=True)
        try:
            sb.driver.execute_cdp_cmd("Browser.grantPermissions", {"origin": "https://picks.betr.app", "permissions": ["geolocation"]})
            sb.driver.execute_cdp_cmd("Emulation.setGeolocationOverride", {"latitude": 32.7157, "longitude": -117.1611, "accuracy": 50})
        except Exception as exc:  # noqa: BLE001
            print("  geolocation grant failed", str(exc)[:100], flush=True)
        H.open_alive(sb, H.URL, "root after geo grant")
        time.sleep(3)
        H.enable_network(sb)
        H.clear_geo(sb)
        H.where(sb, "after geo grant")
    print(f"  league chip click: {H.click_league(sb)}", flush=True)
    time.sleep(6)
    H.where(sb, "board")


def bundles(sb):
    try:
        tree = sb.driver.execute_cdp_cmd("Page.getResourceTree", {})
    except Exception as exc:  # noqa: BLE001
        print("resource tree failed", str(exc)[:120], flush=True)
        return
    frame = tree["frameTree"]["frame"]["id"]
    res = [r["url"] for r in tree["frameTree"].get("resources", []) if r.get("type") == "Script"]
    print(f"BUNDLES {len(res)}: " + ", ".join(u.rsplit('/', 1)[-1][:50] for u in res), flush=True)
    ops, hosts = {}, set()
    for u in res:
        try:
            c = sb.driver.execute_cdp_cmd("Page.getResourceContent", {"frameId": frame, "url": u})
        except Exception as exc:  # noqa: BLE001
            print(f"  {u[:80]} unreadable: {str(exc)[:80]}", flush=True)
            continue
        t = c.get("content") or ""
        if c.get("base64Encoded"):
            import base64
            t = base64.b64decode(t).decode("utf-8", "replace")
        print(f"  {u.rsplit('/', 1)[-1][:50]} = {len(t)} chars", flush=True)
        for m in OP_RE.finditer(t):
            name = m.group(2)
            if name not in ops:
                ops[name] = (m.group(1), m.group(3) or "", re.sub(r"\s+", " ", t[m.start():m.start() + 1200].replace("\\n", " ")))
        for m in re.finditer(r"https://[a-z0-9.\-]*betr\.app[A-Za-z0-9_\-/.]*", t):
            hosts.add(m.group(0))
        for m in re.finditer(r"[\"'`](/api/v[0-9]+/[A-Za-z0-9_\-/{}$.]+)[\"'`]", t):
            hosts.add(m.group(1))
        # client-side pricing hints: code around payout / multiplier words
        n = 0
        for m in re.finditer(r"payoutMultiplier|payout_multiplier|multiplierTable|payoutTable|calculatePayout|getMultiplier|winMultiplier|maxPayout|potentialPayout|toWin", t):
            if n >= 25:
                break
            ctx = re.sub(r"\s+", " ", t[max(0, m.start() - 200):m.start() + 300])
            print(f"  CODE {m.group(0)} :: {ctx}", flush=True)
            n += 1
    print(f"GRAPHQL OPERATIONS IN THE BUNDLES: {len(ops)}", flush=True)
    print("ALL: " + ", ".join(sorted(f"{v[0][0]}:{k}" for k, v in ops.items())), flush=True)
    for name, (kind, vs, doc) in sorted(ops.items()):
        if KEY.search(name) or KEY.search(doc[:600]):
            print(f"\nOP {kind} {name} {vs[:300]}\n   {doc[:900]}", flush=True)
    print("\nHOSTS / REST:", flush=True)
    for h in sorted(hosts):
        print("  ", h, flush=True)


def drain(sb, ids, seen):
    try:
        logs = sb.driver.get_log("performance")
    except Exception:  # noqa: BLE001
        logs = []
    for e in logs:
        try:
            m = json.loads(e["message"])["message"]
        except Exception:  # noqa: BLE001
            continue
        if m.get("method") == "Network.requestWillBeSent":
            req = m["params"]["request"]
            u = req.get("url", "")
            if "betr.app" in u and req.get("method") in ("POST", "PUT", "GET") and ("graphql" in u or "/api/" in u):
                body = req.get("postData") or ""
                try:
                    pj = json.loads(body)
                    k = f"REQ {req['method']} {u} op={pj.get('operationName')} vars={json.dumps(pj.get('variables'))[:900]}"
                except Exception:  # noqa: BLE001
                    k = f"REQ {req['method']} {u} body={body[:300]}"
                if k not in seen:
                    seen.add(k)
                    print(k, flush=True)
        elif m.get("method") == "Network.responseReceived":
            u = m["params"]["response"].get("url", "")
            if "betr.app" in u and ("graphql" in u or "/api/" in u):
                ids[m["params"]["requestId"]] = [u, 0]
    for rid, (u, tries) in list(ids.items()):
        try:
            b = sb.driver.execute_cdp_cmd("Network.getResponseBody", {"requestId": rid})
            txt = b.get("body") or ""
            if KEY.search(txt[:20000]):
                print(f"RESP {u} {len(txt)}b {txt[:2500]}", flush=True)
            ids.pop(rid)
        except Exception:  # noqa: BLE001
            ids[rid][1] += 1
            if ids[rid][1] > 3:
                ids.pop(rid)


def wire(sb):
    ids, seen = {}, set()
    drain(sb, ids, seen)
    print("\n==== WIRE: tapping MORE on different players ====", flush=True)
    taps = sb.execute_script("""
      const out = [], used = new Set();
      const els = [...document.querySelectorAll('div,span,button,p')].filter(e => e.children.length === 0 && /^(MORE|More|Higher|HIGHER|OVER|Over)$/.test((e.innerText||e.textContent||'').trim()));
      for (const e of els) {
        if (out.length >= arguments[0]) break;
        const r = e.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0 || r.y < 0 || r.y > window.innerHeight) continue;
        const card = e.closest('[data-testid]') || e.parentElement.parentElement.parentElement;
        const key = (card && card.innerText || '').slice(0, 40);
        if (used.has(key)) continue; used.add(key);
        out.push([r.x + r.width / 2, r.y + r.height / 2, key.replace(/\\s+/g, ' ')]);
      }
      return [out, els.length];""", TAPS)
    print("MORE buttons:", taps[1], "chosen:", taps[0], flush=True)
    for x, y, label in taps[0] or []:
        for ev in ({"type": "mouseMoved", "x": x, "y": y},
                   {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1},
                   {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1}):
            try:
                sb.driver.execute_cdp_cmd("Input.dispatchMouseEvent", ev)
            except Exception as exc:  # noqa: BLE001
                print("tap failed", str(exc)[:80], flush=True)
            time.sleep(0.12)
        print(f"  tapped {label!r}", flush=True)
        time.sleep(3)
        drain(sb, ids, seen)
    H.where(sb, "after taps")
    t_end = time.time() + 60
    while time.time() < t_end:
        drain(sb, ids, seen)
        time.sleep(2)
    try:
        txt = sb.execute_script("return document.body.innerText") or ""
        lines = [l for l in txt.splitlines() if re.search(r"\d(\.\d+)?\s*[xX]\b|[xX]\s*\d|pay|win|entry|pick|flex|power|insur", l, re.I)]
        print("VISIBLE SLIP / PAYOUT TEXT:", flush=True)
        for l in lines[:80]:
            print("   ", l[:200], flush=True)
    except Exception as exc:  # noqa: BLE001
        print("visible text failed", str(exc)[:80], flush=True)
    # open the slip / entry panel if the app shows one (a 'picks' / 'lineup' / 'review' button), then read again
    opened = sb.execute_script("""
      const els = [...document.querySelectorAll('div,span,button,p,a')].filter(e => e.children.length === 0 && /^(View Picks|Review|Lineup|My Lineup|Continue|Next|Picks|Entry|Build Lineup|Review Lineup)$/i.test((e.innerText||e.textContent||'').trim()));
      for (const e of els) { const r = e.getBoundingClientRect(); if (r.width > 0 && r.height > 0) return [r.x + r.width/2, r.y + r.height/2, (e.innerText||'').trim()]; }
      return null;""")
    print("slip panel button:", opened, flush=True)
    if opened:
        x, y = opened[0], opened[1]
        for ev in ({"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1},
                   {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1}):
            sb.driver.execute_cdp_cmd("Input.dispatchMouseEvent", ev)
        time.sleep(5)
        t_end = time.time() + 30
        while time.time() < t_end:
            drain(sb, ids, seen)
            time.sleep(2)
        H.where(sb, "slip panel")
        txt = sb.execute_script("return document.body.innerText") or ""
        print("SLIP PANEL TEXT:", flush=True)
        for l in [l for l in txt.splitlines() if l.strip()][:120]:
            print("   ", l[:200], flush=True)


def main():
    lp, proxy_arg = H.start_local_proxy()
    kw = dict(uc=True, xvfb=True, locale="en-US", incognito=True, log_cdp_events=True)
    if proxy_arg:
        kw["proxy"] = proxy_arg
    with SB(**kw) as sb:
        boot(sb)
        bundles(sb)
        wire(sb)
    if lp:
        lp.terminate()


if __name__ == "__main__":
    main()
