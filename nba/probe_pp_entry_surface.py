#!/usr/bin/env python3
"""
PROBE 2 — the PrizePicks ENTRY / QUOTE surface, hunting the goblin/demon per-leg multiplier.

WHAT PROBE 1 SETTLED. The board payload does NOT carry it. A grep of the live 17.6 MB
prizepicks_mlb_current.json (691,431 lines) for multiplier|payout|factor|coefficient returned ZERO
matches, and a full demon projection carries only:
    "adjusted_odds": true      <- a BOOLEAN flag, not an amount
    "odds_type": "demon"       <- the LABEL
    "line_score": 18.5
So the label ships with the board and the PRICE comes from somewhere else. That matches the app's
behaviour the owner described: one leg shows no multiplier, the second reveals it - the client asks a
DIFFERENT endpoint to price the entry.

WHAT THIS PROBES - the surfaces that would hold it, read-only, nothing placed:
  * payout / multiplier tables by entry size and odds_type
  * the "quote"/"calculate"/"preview" style endpoints an entry builder calls
  * config/bootstrap documents (apps often ship the whole payout matrix in one config blob)
  * GraphQL, in case the pricing surface is not REST like the board is
  * the projection-level detail endpoint (/projections/<id>) - the board list may be trimmed while the
    single-item view is complete

NBA IS OUT OF SEASON (opens October), so this runs MLB (2) and WNBA (3), per the owner.
Reports only. Writes nothing. Places nothing.
"""
import json
import os
from curl_cffi import requests

BASE = "https://api.prizepicks.com"
# EXACTLY the transport the working MLB producer (main.py) uses: curl_cffi with chrome124 TLS
# impersonation THROUGH the PROXY_URL proxy. Plain urllib from a GitHub runner gets a DataDome captcha
# (geo.captcha-delivery.com) on every path - that is a bot wall, not a missing endpoint, so probe 2's
# 403s told us nothing about whether these endpoints exist.
PROXY = (os.getenv("PROXY_URL") or "").strip()
PROXIES = {"http": PROXY, "https": PROXY} if PROXY else None
UA = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://app.prizepicks.com",
    "Referer": "https://app.prizepicks.com/",
}
HINT = ("multip", "payout", "factor", "coeff", "boost", "premium", "scal", "combo")


def get(url, timeout=25):
    try:
        r = requests.get(url, headers=UA, proxies=PROXIES, timeout=timeout, impersonate="chrome124")
        try:
            return r.status_code, r.json()
        except Exception:  # noqa: BLE001
            return r.status_code, (r.text or "")[:1200]
    except Exception as exc:  # noqa: BLE001
        return None, str(exc)[:160]


def flag(doc):
    """does this document mention anything price-shaped?"""
    s = json.dumps(doc)[:200000] if not isinstance(doc, str) else doc[:200000]
    return [h for h in HINT if h in s.lower()]


def main():
    print("=" * 78)
    print("PRIZEPICKS ENTRY / QUOTE SURFACE PROBE")
    print("board payload already ruled out: 0 hits for multiplier|payout|factor|coefficient")
    print("=" * 78, flush=True)

    # 1) documents that would carry a payout MATRIX
    print("\n-- PAYOUT / CONFIG DOCUMENTS --", flush=True)
    for path in ("/payout_tables", "/payouts", "/payout_multipliers", "/multipliers",
                 "/entry_types", "/entry_options", "/bootstrap", "/config", "/app_config",
                 "/settings", "/game_modes", "/pick_types", "/promos", "/flash_sales",
                 "/odds_types", "/projection_types", "/durations", "/leagues"):
        st, doc = get(BASE + path)
        hits = flag(doc) if st == 200 else []
        mark = f"  <== {hits}" if hits else ""
        prev = json.dumps(doc)[:180] if isinstance(doc, (dict, list)) else str(doc)[:140]
        print(f"  {str(st):<5} {path:<24} {prev}{mark}", flush=True)

    # 2) the single-projection view - the list may be trimmed
    print("\n-- SINGLE PROJECTION DETAIL (a demon from the live board) --", flush=True)
    st, doc = get(f"{BASE}/projections?league_id=2&per_page=60&single_stat=true")
    pid = None
    if st == 200 and isinstance(doc, dict):
        for row in doc.get("data") or []:
            if (row.get("attributes") or {}).get("odds_type") in ("demon", "goblin"):
                pid = row.get("id")
                print(f"  found {row['attributes']['odds_type']} id={pid} "
                      f"line={row['attributes'].get('line_score')}", flush=True)
                break
    else:
        print(f"  board list unavailable here ({st}) - trying a known id from the repo snapshot", flush=True)
        pid = "15038316"
    if pid:
        for path in (f"/projections/{pid}", f"/projections/{pid}?include=projection_type,stat_type",
                     f"/projections/{pid}/payout", f"/projections/{pid}/odds"):
            st, doc = get(BASE + path)
            hits = flag(doc) if st == 200 else []
            print(f"  {str(st):<5} {path:<52} {'HITS ' + str(hits) if hits else ''}", flush=True)
            if st == 200 and hits and isinstance(doc, dict):
                print(f"        {json.dumps(doc)[:700]}", flush=True)

    # 3) entry-builder style endpoints (GET only - nothing is placed)
    print("\n-- ENTRY / QUOTE ENDPOINTS (GET only, nothing placed) --", flush=True)
    for path in ("/entries/quote", "/entries/preview", "/entries/calculate", "/entries/new",
                 "/slips/quote", "/wagers/quote", "/lineups/quote", "/entry_previews",
                 "/v1/payout_tables", "/v2/payout_tables", "/api/payout_tables"):
        st, doc = get(BASE + path)
        print(f"  {str(st):<5} {path:<24} {str(doc)[:120]}", flush=True)

    # 4) GraphQL, in case pricing is not REST
    print("\n-- GRAPHQL --", flush=True)
    for path in ("/graphql", "/api/graphql", "/v1/graphql"):
        st, doc = get(BASE + path)
        print(f"  {str(st):<5} {path:<18} {str(doc)[:140]}", flush=True)

    # 5) the partner/affiliate host sometimes serves a public payout table
    print("\n-- ALTERNATE HOSTS --", flush=True)
    for url in ("https://app.prizepicks.com/api/payout_tables",
                "https://api.prizepicks.com/projection_filters",
                "https://api.prizepicks.com/stat_types",
                "https://partner-api.prizepicks.com/payouts"):
        st, doc = get(url)
        hits = flag(doc) if st == 200 else []
        print(f"  {str(st):<5} {url:<52} {'HITS ' + str(hits) if hits else str(doc)[:90]}", flush=True)


if __name__ == "__main__":
    main()
