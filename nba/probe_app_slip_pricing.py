#!/usr/bin/env python3
"""
PROBE - HOW EACH PICK'EM APP PRICES A SLIP, FROM ITS OWN WEB APP (2026-10-18, owner: "Same goes for all apps, you don't need me
to them").  Read-only: opens each app's public web page in a real Chrome (the residential proxy), reads every JS bundle IN THE
PAGE and prints (a) every API path / host the bundles call and (b) the code around every mention of payout / multiplier / entry
slip / pick'em pricing, so the slip-pricing call (or the client-side formula) can be read, then exercised.
Nothing is logged in, no entry is built or submitted.
Apps (PROBE_APPS, comma list): underdog, sleeper, fliff, prizepicks.
Env: PROXY_URL, PROBE_APPS.
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import betr_harvest_cloud as H  # noqa: E402  (proxy helper only)
from seleniumbase import SB  # noqa: E402

APPS = {"underdog": "https://app.underdogfantasy.com/pick-em/higher-lower/all/nba",
        "sleeper": "https://sleeper.com/picks",
        "fliff": "https://sports.getfliff.com/",
        "prizepicks": "https://app.prizepicks.com/"}
SCAN_JS = r"""
const done = arguments[arguments.length - 1];
(async () => {
  const urls = new Set();
  for (const e of performance.getEntriesByType('resource')) if (/\.js(\?|$)/.test(e.name)) urls.add(e.name);
  for (const s of document.scripts) if (s.src) urls.add(s.src);
  const paths = new Set(), hits = [], sizes = {};
  const kw = /(payout_?(outcomes|multiplier|schedule|structure|table)s?|entry_?slips?|pickem_?(entry|payout|price)|calculate_?payout|payoutMultiplier|insured|flex_?payout|power_?play|max_?payout|boost)/gi;
  for (const u of urls) {
    let t = '';
    try { t = await (await fetch(u, { credentials: 'omit' })).text(); } catch (e) { sizes[u] = 'ERR'; continue; }
    sizes[u] = t.length;
    let m;
    const pr = /["'`]((?:https:\/\/[a-z0-9.\-]+)?\/(?:api\/)?v[0-9]+\/[A-Za-z0-9_\-\/{}$.:]+)["'`]/g;
    while ((m = pr.exec(t))) paths.add(m[1]);
    const hr = /https:\/\/[a-z0-9.\-]*(api|graphql|gateway)[a-z0-9.\-]*\.[a-z]+[A-Za-z0-9_\-\/.]*/g;
    while ((m = hr.exec(t))) paths.add(m[0]);
    let n = 0;
    while ((m = kw.exec(t)) && n < 60) { hits.push(u.split('/').pop().slice(0, 40) + ' :: ' + t.slice(Math.max(0, m.index - 160), m.index + 220).replace(/\s+/g, ' ')); n++; }
  }
  done({ sizes, paths: [...paths], hits });
})().catch(e => done({ error: String(e) }));
"""


def main():
    want = [a.strip() for a in (os.environ.get("PROBE_APPS") or "underdog,sleeper,fliff").split(",") if a.strip()]
    lp, proxy_arg = H.start_local_proxy()
    kw = dict(uc=True, xvfb=True, locale="en-US", incognito=True)
    if proxy_arg:
        kw["proxy"] = proxy_arg
    with SB(**kw) as sb:
        sb.driver.set_script_timeout(300)
        for app in want:
            url = APPS[app]
            print(f"\n######## {app}: {url}", flush=True)
            try:
                sb.uc_open_with_reconnect(url, 6)
                time.sleep(6)
                print(f"  at {sb.get_current_url()} title {sb.get_title()!r}", flush=True)
                res = sb.driver.execute_async_script(SCAN_JS)
            except Exception as exc:  # noqa: BLE001
                print(f"  FAILED {type(exc).__name__}: {str(exc)[:200]}", flush=True)
                continue
            if res.get("error"):
                print("  scan error", res["error"], flush=True)
                continue
            print(f"  bundles {len(res['sizes'])}: " + ", ".join(f"{u.rsplit('/', 1)[-1][:40]}={n}" for u, n in list(res["sizes"].items())[:40]), flush=True)
            print(f"  API PATHS ({len(res['paths'])}):", flush=True)
            for p in sorted(res["paths"]):
                print("    ", p, flush=True)
            print(f"  PRICING MENTIONS ({len(res['hits'])}):", flush=True)
            for h in res["hits"][:120]:
                print("    ", h, flush=True)
    if lp:
        lp.terminate()


if __name__ == "__main__":
    main()
