#!/usr/bin/env python3
"""
DARKO Daily Plus-Minus (DPM) - a free, publicly accessible third-party player-impact metric
(darko.app, Kostya Medvedovsky). Independently confirmed 2026-09-01/02: rated by NBA analytics
experts as the best PREDICTIVE catch-all metric (beats even paid EPM/LEBRON on RMSE), and
crucially uses the exact same NBA person IDs already in our system (nba_id: 203999 = Jokic's
real stats.nba.com PERSON_ID) - a clean join, no name-matching.

EXTRACTION (2026-10-07, full-system certification pass A). darko.app redesigned its front end in early
October 2026 ("Modern / Shiny" views, "What's new 8"); the leaderboard is no longer embedded in the HTML as a
`players:[...]` literal, which is why P1 2026-10-05 wrote ZERO players and the DARKO load was refused. The site
is still SvelteKit, so its route data is served by SvelteKit's own data endpoint:

    GET https://www.darko.app/__data.json
    -> {"type":"data","nodes":[null,{"type":"data","data":[ ...devalue-flattened... ]}]}

The `data` array is devalue "flattened" form (github.com/Rich-Harris/devalue): every value sits at an index;
an object is {key: index}, an array is [index, ...], strings/booleans sit at their own index, a non-negative
number inside an object/array is an INDEX, negative numbers are specials (-1 undefined, -2 hole, -3 NaN,
-4 +Inf, -5 -Inf, -6 -0). The leaderboard is `players` = {keys: [column names], values: [one column array per
key]} - COLUMNAR, ~530 rows. `_unflatten` below decodes exactly that. The old HTML hydration parse is kept as a
FALLBACK only (it will match again if the site ever re-embeds the array).

Guards (unchanged in spirit): fewer than 400 players is a failure (expected ~530); on ANY failure the previous
good file is left untouched (the 2026-10-05 run overwrote it with an empty array - the loader's refusal was the
only thing that kept the 09-24 ratings in Postgres), the meta records the error, and the exit code is 1.

Writes nba/data/nba_darko_current.json + _meta.json.
"""
import json
import os
import re
import sys
import time
from pathlib import Path

from curl_cffi import requests

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "text/html,application/json,*/*;q=0.8",
}

BASE_URL = "https://www.darko.app/"
DATA_URL = "https://www.darko.app/__data.json"
OUTPUT_PATH = Path("nba/data/nba_darko_current.json")
OUTPUT_META_PATH = Path("nba/data/nba_darko_current_meta.json")
OUTPUT_DEBUG_PATH = Path("nba/data/nba_darko_debug_html_snippet.txt")
MIN_PLAYERS = 400
FIELDS = ("dpm", "o_dpm", "d_dpm", "box_dpm", "on_off_dpm")


# ---------------------------------------------------------------- devalue (SvelteKit) decoding
_SPECIAL = {-1: None, -2: None, -3: float("nan"), -4: float("inf"), -5: float("-inf"), -6: -0.0}


def _unflatten(flat, idx, memo):
    """Decode value `idx` of a devalue-flattened array. Non-negative numbers reached THROUGH a container are indexes."""
    if idx < 0:
        return _SPECIAL.get(idx)
    if idx in memo:
        return memo[idx]
    v = flat[idx]
    if isinstance(v, list):
        if v and isinstance(v[0], str) and v[0] in ("Date", "Set", "Map", "RegExp", "Object", "BigInt", "null"):
            # typed wrappers: ["Date", "..."], ["Set", i, j], ["Map", k, v, ...], ["Object", idx] ...
            kind = v[0]
            if kind == "Date":
                out = v[1]
            elif kind == "Set":
                out = [_unflatten(flat, i, memo) for i in v[1:]]
            elif kind == "Map":
                out = {_unflatten(flat, v[i], memo): _unflatten(flat, v[i + 1], memo) for i in range(1, len(v) - 1, 2)}
            elif kind == "Object":
                out = _unflatten(flat, v[1], memo)
            else:
                out = v[1] if len(v) > 1 else None
        else:
            out = [_unflatten(flat, i, memo) for i in v]
    elif isinstance(v, dict):
        out = {k: _unflatten(flat, i, memo) for k, i in v.items()}
    else:
        out = v          # str / number / bool / None sit at their own index
    memo[idx] = out
    return out


def decode_sveltekit_data(doc):
    """Return the merged route data (dict) of a SvelteKit __data.json document."""
    merged = {}
    for node in doc.get("nodes") or []:
        if not node or node.get("type") != "data" or not isinstance(node.get("data"), list) or not node["data"]:
            continue
        flat = node["data"]
        root = _unflatten(flat, 0, {})
        if isinstance(root, dict):
            merged.update(root)
    return merged


def players_from_data(doc):
    data = decode_sveltekit_data(doc)
    pl = data.get("players")
    if pl is None:
        raise RuntimeError("players_missing_in___data.json")
    if isinstance(pl, dict) and "keys" in pl and "values" in pl:
        keys, cols = pl["keys"], pl["values"]
        if len(keys) != len(cols):
            raise RuntimeError(f"columnar_shape_mismatch keys {len(keys)} values {len(cols)}")
        n = len(cols[0]) if cols else 0
        rows = [{k: cols[j][i] for j, k in enumerate(keys)} for i in range(n)]
    elif isinstance(pl, list):
        rows = pl
    else:
        raise RuntimeError(f"players_unexpected_type {type(pl).__name__}")
    meta = {k: data.get(k) for k in ("asOf", "ratingsThrough", "selectedSeason") if k in data}
    return rows, meta


# ---------------------------------------------------------------- legacy HTML hydration (fallback)
def extract_players_html(html):
    m = re.search(r'players:\[(.*?)\],seasons:', html, re.S)
    if not m:
        raise RuntimeError("players_array_not_found_in_page - real page structure may have changed")
    arr_text = "[" + m.group(1) + "]"
    json_text = re.sub(r'(?<=[{,\[])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:', r'"\1":', arr_text)
    json_text = re.sub(r':(-?)\.(\d)', r':\g<1>0.\2', json_text)
    return json.loads(json_text)


def _num(x):
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    return None if f != f else f     # NaN -> None


def normalise(raw_players):
    players = []
    for p in raw_players:
        pid = p.get("nba_id")
        if not pid:
            continue
        rec = {"player_id": int(pid), "team_id": int(p["tm_id"]) if p.get("tm_id") else None, "position": p.get("position"),
               "rank": p.get("_rank")}
        for f in FIELDS:
            rec[f] = _num(p.get(f))
        players.append(rec)
    return players


def fetch_text(url, proxies, accept):
    """darko.app through the system retry policy (nba/net_retry.py, 2026-10-09; it was ONE attempt): proxy then direct,
    3 attempts, full-jitter backoff, 429/5xx/connection errors retried, a final 4xx raised at once."""
    from net_retry import RetryError, request
    h = dict(HEADERS); h["Accept"] = accept
    try:
        resp = request("GET", url, session=requests, proxies=proxies, routes=("proxy", "direct"), tries=3, base=3, cap=20,
                       timeout=30, label="darko", headers=h, impersonate="chrome124")
    except RetryError as exc:
        raise RuntimeError(str(exc)) from None
    resp.raise_for_status()
    return resp.text


def main():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None

    players, errors, method, source_meta = [], [], None, {}
    # 1) SvelteKit data endpoint (primary)
    try:
        doc = json.loads(fetch_text(DATA_URL, proxies, "application/json"))
        raw, source_meta = players_from_data(doc)
        players = normalise(raw)
        method = "sveltekit___data.json (devalue, columnar)"
    except Exception as exc:  # noqa: BLE001
        errors.append(f"__data.json: {exc}")
    # 2) legacy HTML hydration literal (fallback)
    if len(players) < MIN_PLAYERS:
        html = None
        try:
            html = fetch_text(BASE_URL, proxies, "text/html,*/*;q=0.8")
            players = normalise(extract_players_html(html))
            method = "embedded_sveltekit_hydration_json (legacy fallback)"
        except Exception as exc:  # noqa: BLE001
            errors.append(f"html: {exc}")
            if html:
                OUTPUT_DEBUG_PATH.write_text(html[:20000], encoding="utf-8")

    error = None
    if len(players) < MIN_PLAYERS:
        error = f"suspiciously_low_count: only {len(players)} players parsed, expected ~530; " + " | ".join(errors)
    # a bad dpm column (all None) is as useless as no rows
    elif sum(1 for p in players if p["dpm"] is not None) < MIN_PLAYERS:
        error = f"dpm_missing: only {sum(1 for p in players if p['dpm'] is not None)} of {len(players)} players carry a dpm value"

    meta = {"fetched_at": fetched_at, "source_url": DATA_URL if method and "__data" in method else BASE_URL, "method_used": method,
            "player_count": len(players), "error": error, **{f"source_{k}": v for k, v in source_meta.items()}}
    if error:
        # leave the previous good file untouched - an empty leaderboard must never replace a real one
        OUTPUT_META_PATH.write_text(json.dumps(meta, indent=2), encoding="utf-8")
        print(f"DARKO scrape FAILED: {error} (previous nba_darko_current.json left untouched)", file=sys.stderr)
        sys.exit(1)
    OUTPUT_PATH.write_text(json.dumps({"players": players}, indent=2), encoding="utf-8")
    OUTPUT_META_PATH.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"DARKO scrape OK: {len(players)} players via {method}; source meta {source_meta}")


if __name__ == "__main__":
    main()
