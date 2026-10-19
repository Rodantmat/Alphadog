#!/usr/bin/env python3
"""
PROBE - HOW BETR PRICES A SLIP (2026-10-18, owner: "For betr build slips, you have the key, find out how it works, you have the
access, the system is there, explore and figure it out").  Nothing is submitted: no entry, no deposit, no wager mutation is sent.

Chain = the Betr cloud harvest's (SeleniumBase UC + Xvfb + the sticky residential proxy + the seeded session from the credential
store; betr_harvest_cloud.py helpers). The session is NOT renewed here (the harvest owns the refresh-token rotation).
Stage 1 (BETR_PROBE_STAGE=bundle): every JS bundle the web app loads is read IN THE PAGE and searched for GraphQL documents;
  prints every operation (query / mutation / subscription) whose name or body mentions lineup / pick / entry / payout /
  multiplier / slip / wager / quote / price / boost, with its variables and the first 600 characters of its document, plus the
  REST paths under api.betr.app the bundles reference.
Stage 2 (BETR_PROBE_STAGE=wire): on the NBA board, taps two projections (MORE) so the app builds a slip itself, and prints every
  graphql request (operation, variables) and response body (first 1,500 characters) seen on the wire while the slip is open -
  the app's own pricing call, if it prices server-side.
Env: DATABASE_URL, PROXY_URL, BETR_SESSION_ID, BETR_PROBE_STAGE (bundle | wire), BETR_LEAGUE (NBA).
"""
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import betr_harvest_cloud as H  # noqa: E402
from seleniumbase import SB  # noqa: E402

STAGE = (os.environ.get("BETR_PROBE_STAGE") or "bundle").strip().lower()
KEY = re.compile(r"lineup|pick|entry|entries|payout|multiplier|slip|wager|quote|price|boost|odds|parlay|power|flex", re.I)

BUNDLE_JS = r"""
const done = arguments[arguments.length - 1];
(async () => {
  const urls = new Set();
  for (const e of performance.getEntriesByType('resource')) if (/\.js(\?|$)/.test(e.name)) urls.add(e.name);
  for (const s of document.scripts) if (s.src) urls.add(s.src);
  const ops = {}, rest = new Set(), sizes = {};
  for (const u of urls) {
    let t = '';
    try { t = await (await fetch(u, { credentials: 'omit' })).text(); } catch (e) { sizes[u] = 'ERR ' + e; continue; }
    sizes[u] = t.length;
    const re = /(query|mutation|subscription)\s+([A-Za-z0-9_]+)\s*(\([^)]{0,600}\))?\s*\{/g;
    let m;
    while ((m = re.exec(t))) {
      const name = m[2];
      const doc = t.slice(m.index, m.index + 900).replace(/\\n/g, ' ').replace(/\s+/g, ' ');
      if (!ops[name]) ops[name] = { kind: m[1], vars: m[3] || '', doc };
    }
    const rr = /["'`](\/api\/v[0-9]+\/[A-Za-z0-9_\-\/{}$.]+)["'`]/g;
    while ((m = rr.exec(t))) rest.add(m[1]);
    const hosts = /https:\/\/[a-z0-9.\-]*betr\.app[A-Za-z0-9_\-\/.]*/g;
    while ((m = hosts.exec(t))) rest.add(m[0]);
  }
  done({ sizes, ops, rest: [...rest] });
})().catch(e => done({ error: String(e) }));
"""


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
        time.sleep(3)
    st, src = H.load_session_state()
    print(f"session state: {len(st)} bytes from the {src} (not renewed by this probe)", flush=True)
    if st:
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
    H.open_alive(sb, H.URL, "root")
    time.sleep(4)
    H.enable_network(sb)
    H.clear_geo(sb)
    H.where(sb, "booted")


def stage_bundle(sb):
    sb.driver.set_script_timeout(240)
    res = sb.driver.execute_async_script(BUNDLE_JS)
    if res.get("error"):
        print("bundle scan error:", res["error"], flush=True)
        return
    print(f"BUNDLES {len(res['sizes'])}: " + ", ".join(f"{u.rsplit('/', 1)[-1][:50]}={n}" for u, n in res["sizes"].items()), flush=True)
    ops = res["ops"]
    print(f"GRAPHQL OPERATIONS IN THE BUNDLES: {len(ops)}", flush=True)
    print("ALL: " + ", ".join(sorted(f"{v['kind'][0]}:{k}" for k, v in ops.items())), flush=True)
    for name, v in sorted(ops.items()):
        if KEY.search(name) or KEY.search(v["doc"]):
            print(f"\nOP {v['kind']} {name} {v['vars'][:300]}\n   {v['doc'][:600]}", flush=True)
    print("\nREST / HOSTS referenced:", flush=True)
    for r in sorted(res["rest"]):
        print("  ", r, flush=True)


def stage_wire(sb):
    print(f"  league chip click: {H.click_league(sb)}", flush=True)
    time.sleep(6)
    H.where(sb, "board")
    # tap two different players' MORE buttons (the app's own slip builder)
    taps = sb.execute_script("""
      const b = [...document.querySelectorAll('[role=button],button,div')].filter(e => /^(MORE|More|Higher|OVER)$/.test((e.innerText||'').trim()));
      const out = [];
      for (const e of b.slice(0, 40)) { if (out.length >= 2) break; const r = e.getBoundingClientRect(); if (r.width > 0 && r.height > 0) { out.push([r.x + r.width / 2, r.y + r.height / 2]); } }
      return out;""")
    print("MORE buttons found:", taps, flush=True)
    for x, y in taps or []:
        try:
            sb.driver.execute_cdp_cmd("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
            sb.driver.execute_cdp_cmd("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})
        except Exception as exc:  # noqa: BLE001
            print("tap failed", str(exc)[:80], flush=True)
        time.sleep(3)
    H.where(sb, "after taps")
    t_end = time.time() + 45
    ids = {}
    while time.time() < t_end:
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
                if "betr.app" in req.get("url", "") and req.get("method") == "POST":
                    body = req.get("postData") or ""
                    try:
                        pj = json.loads(body)
                        print(f"REQ {req['url']} op={pj.get('operationName')} vars={json.dumps(pj.get('variables'))[:600]}", flush=True)
                    except Exception:  # noqa: BLE001
                        print(f"REQ {req['url']} body={body[:300]}", flush=True)
            elif m.get("method") == "Network.responseReceived":
                u = m["params"]["response"].get("url", "")
                if "betr.app" in u and ("graphql" in u or "/api/" in u):
                    ids[m["params"]["requestId"]] = u
        for rid, u in list(ids.items()):
            try:
                b = sb.driver.execute_cdp_cmd("Network.getResponseBody", {"requestId": rid})
                txt = b.get("body") or ""
                if KEY.search(txt[:5000]):
                    print(f"RESP {u} {txt[:1500]}", flush=True)
                ids.pop(rid)
            except Exception:  # noqa: BLE001
                pass
        time.sleep(2)
    H.where(sb, "end")


def main():
    lp, proxy_arg = H.start_local_proxy()
    kw = dict(uc=True, xvfb=True, locale="en-US", incognito=True, log_cdp_events=True)
    if proxy_arg:
        kw["proxy"] = proxy_arg
    with SB(**kw) as sb:
        boot(sb)
        if STAGE == "wire":
            stage_wire(sb)
        else:
            stage_bundle(sb)
    if lp:
        lp.terminate()


if __name__ == "__main__":
    main()
