#!/usr/bin/env python3
"""
PROBE 3 — scan the PrizePicks WEB CLIENT for the pricing surface.

WHY THE CLIENT, NOT THE API. Two things are now established:
  1. /projections carries the LABEL only - odds_type "demon"/"goblin", adjusted_odds as a BOOLEAN.
     A grep of the live 17.6 MB board for multiplier|payout|factor|coefficient returned ZERO hits in
     691,431 lines.
  2. Eight independent commercial PrizePicks scrapers all advertise "odds types (standard, demon,
     goblin)" and NONE exposes a payout field - while the SAME vendors advertise "payout multipliers"
     for Underdog, Sleeper and DraftKings Pick6. Competing vendors with every incentive to extract more
     have not found one.
So the factor is not on the public board. But the APP RENDERS IT, and a client cannot invent a number
it was not given - so the client either calls another endpoint or computes it from a table it ships.
Either way the answer is in its JavaScript.

This is exactly how the Underdog ladder was solved (COMPASS fact 49: scan_webpack_chunks found
/alternate_projections by grepping their bundles). Bundles are served from a CDN, which is NOT
DataDome-protected - that is why the API probes 403'd but this can work.

WHAT IT DOES:
  1. fetches the app HTML through the proxy and lists every <script src>
  2. pulls each bundle and greps for payout/multiplier vocabulary AND for API path literals
  3. reports any endpoint string the client can call, so we can see what it asks when a 2nd leg lands
Reports only. Writes nothing.
"""
import os
import re

from curl_cffi import requests

PROXY = (os.getenv("PROXY_URL") or "").strip()
PROXIES = {"http": PROXY, "https": PROXY} if PROXY else None
UA = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
# vocabulary that would appear near a payout computation
MONEY = re.compile(r"(payout|multiplier|multiplic|payoutMultiplier|odds_type|oddsType|demon|goblin|"
                   r"entryFee|toWin|flexPlay|powerPlay|payout_table|payoutTable)", re.I)
# any API path literal the client can call
PATHS = re.compile(r"[\"'`](/(?:api/)?[a-z0-9_\-/{}$:.]{3,60})[\"'`]", re.I)


def get(url, timeout=45):
    try:
        r = requests.get(url, headers=UA, proxies=PROXIES, timeout=timeout, impersonate="chrome124")
        return r.status_code, r.text or ""
    except Exception as exc:  # noqa: BLE001
        return None, str(exc)[:160]


def main():
    print(f"proxy configured: {bool(PROXIES)}", flush=True)
    for page in ("https://app.prizepicks.com/", "https://app.prizepicks.com/board",
                 "https://www.prizepicks.com/"):
        st, html = get(page)
        print(f"\n=== {page}  ->  {st}  ({len(html):,} bytes)", flush=True)
        if st != 200 or len(html) < 500:
            print(f"    {html[:200]}", flush=True)
            continue
        srcs = re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', html)
        srcs = [s if s.startswith("http") else
                ("https://app.prizepicks.com" + s if s.startswith("/") else None) for s in srcs]
        srcs = [s for s in srcs if s]
        print(f"    {len(srcs)} script bundles", flush=True)
        # the page itself may inline config
        if MONEY.search(html):
            hits = set(m.group(0).lower() for m in MONEY.finditer(html))
            print(f"    INLINE HTML mentions: {sorted(hits)[:12]}", flush=True)

        for i, s in enumerate(srcs[:14]):
            sst, js = get(s, timeout=60)
            if sst != 200 or not js:
                print(f"    [{i}] {sst} {s[:88]}", flush=True)
                continue
            money = sorted(set(m.group(0).lower() for m in MONEY.finditer(js)))
            paths = sorted(set(m.group(1) for m in PATHS.finditer(js)))
            interesting = [p for p in paths if any(k in p.lower() for k in
                           ("entr", "payout", "multip", "projection", "lineup", "slip", "wager",
                            "board", "pick", "quote", "price"))]
            print(f"    [{i}] {len(js):>9,}b  {s.split('/')[-1][:44]}", flush=True)
            if money:
                print(f"         MONEY VOCAB: {money[:14]}", flush=True)
            if interesting:
                print(f"         API PATHS:   {interesting[:22]}", flush=True)
            # show the surroundings of the strongest signal
            for kw in ("payoutMultiplier", "payout_multiplier", "multiplier", "payout"):
                m = re.search(re.escape(kw), js, re.I)
                if m:
                    a, b = max(0, m.start() - 260), min(len(js), m.end() + 260)
                    print(f"         CONTEXT [{kw}]: ...{js[a:b]}...", flush=True)
                    break
        if srcs:
            break   # first page that yielded bundles is enough


if __name__ == "__main__":
    main()
