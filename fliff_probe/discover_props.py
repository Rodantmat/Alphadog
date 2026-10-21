#!/usr/bin/env python3
"""FLIFF PROBE - PROPS DISCOVERY (sample-first, read-only; 2026-10-20 late).

Before the pairing engine is written, answer from real data:
  A) Fliff (one NBA event + one NHL event if any): how player-prop ladders are encoded (groups / proposals / group_tag /
     selection names / lines / eu_coeff), how the MONEYLINE (pick'em 'H2H Combo') proposals look, every market name.
  B) ParlayAPI /sports/{sport}/props narrowed to one book (pinnacle, fanduel, draftkings): row fields, market keys, how
     alternates and one-sided rows look, credits per call.
Writes fliff_probe/out/discovery_props.json. Never prints a key.
"""
import json
import os
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from fliff_client import FliffClient, conflicts_of, lists_under  # noqa: E402

OUT = HERE / "out"
OUT.mkdir(parents=True, exist_ok=True)
REP = {"generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}


def fliff_part():
    fc = FliffClient(proxy=os.environ.get("PROXY_URL", "").strip() or None)
    fc.ping()
    pre, _ = conflicts_of(fc.sync(3054))
    now_ms = time.time() * 1000
    picks = {}
    for c in sorted(pre, key=lambda c: c.get("event_start_timestamp_utc") or 0):
        ch = c.get("channel_id")
        if ch in (461, 481, 467, 451) and ch not in picks and (c.get("event_start_timestamp_utc") or 0) > now_ms:
            picks[ch] = c
    out = {}
    for ch, c in picks.items():
        fk = c["conflict_fkey"]
        j = fc.sync(3062, channel=ch, conflict=fk)
        mks = [m for lst in lists_under(j.get("x_slots") or {}, "market_updates") for m in lst if isinstance(m, dict) and m.get("conflict_fkey") == fk]
        names = Counter(m.get("visual_name") for m in mks)
        ex = {}
        for m in mks:
            vn = m.get("visual_name")
            if vn in ex:
                continue
            gs = m.get("groups") or []
            ex[vn] = {"market_keys": sorted(k for k in m.keys() if k != "groups"), "n_groups": len(gs),
                      "groups_sample": [{"group_keys": sorted(k for k in g.keys() if k != "proposals"), "group_tag": g.get("group_tag"),
                                         "player_fkey": g.get("player_fkey"),
                                         "proposals": [{k: p.get(k) for k in ("t_141_selection_name", "t_142_selection_param_1", "coeff", "eu_coeff",
                                                                              "status", "player_fkey", "proposal_fkey", "t_121_event_info", "t_131_market_name")} for p in (g.get("proposals") or [])[:4]]}
                                        for g in gs[:4]],
                      "proposal_keys": sorted({k for g in gs[:3] for p in (g.get("proposals") or [])[:2] for k in p.keys()})}
        # ladder check for Points: lines per player
        lad = defaultdict(set)
        for m in mks:
            if str(m.get("visual_name")) in ("Points", "Shots On Goal", "Passing Yards"):
                for g in m.get("groups") or []:
                    for p in g.get("proposals") or []:
                        lad[str(g.get("group_tag")).split("#")[0]].add(str(g.get("group_tag")).split("#")[-1])
        out[str(ch)] = {"event": f"{c.get('away_team_name')} @ {c.get('home_team_name')}", "market_names": names.most_common(),
                        "examples": {k: ex[k] for k in list(ex)[:60]},
                        "ladder_lines_per_player_sample": {k: sorted(v)[:20] for k, v in list(lad.items())[:6]}}
        time.sleep(0.4)
    REP["fliff"] = out


def parlay_part():
    import psycopg
    import requests
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        key = conn.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key='parlay_api_key'").fetchone()[0].strip()
    S = requests.Session()
    H = {"X-API-Key": key, "accept": "application/json", "User-Agent": "alphadog-fliff-probe"}
    res = {}
    for sport in ("basketball_nba", "icehockey_nhl"):
        for book in ("pinnacle", "fanduel", "draftkings"):
            try:
                r = S.get(f"https://parlay-api.com/v1/sports/{sport}/props", params={"bookmakers": book, "limit": 10000}, headers=H, timeout=180)
            except Exception as exc:  # noqa: BLE001
                res[f"{sport}/{book}"] = {"error": type(exc).__name__}
                continue
            hd = {k.lower(): v for k, v in r.headers.items()}
            try:
                items = r.json()
            except Exception:  # noqa: BLE001
                items = None
            items = items if isinstance(items, list) else (items or {}).get("data") if isinstance(items, dict) else []
            items = items or []
            mk = Counter(x.get("market_key") for x in items)
            two = sum(1 for x in items if x.get("under_price") not in (None, "") and x.get("over_price") not in (None, ""))
            one_over = sum(1 for x in items if x.get("under_price") in (None, "") and x.get("over_price") not in (None, ""))
            res[f"{sport}/{book}"] = {"http": r.status_code, "rows": len(items), "two_sided": two, "over_only": one_over,
                                      "credits_last": hd.get("x-requests-last"), "remaining": hd.get("x-requests-remaining"),
                                      "truncated": hd.get("x-result-truncated"), "has_more": hd.get("x-result-has-more"),
                                      "market_keys": mk.most_common(40), "row_keys": sorted({k for x in items[:20] for k in x.keys()}),
                                      "samples": items[:3] + [x for x in items if "alt" in str(x.get("market_key"))][:3],
                                      "players_sample": sorted({str(x.get("player")) for x in items})[:15],
                                      "events": sorted({f"{x.get('away_team')} @ {x.get('home_team')} {x.get('commence_time')}" for x in items})[:20]}
            print(f"{sport}/{book}: http {r.status_code} rows {len(items)} two-sided {two} over-only {one_over} credits {hd.get('x-requests-last')} "
                  f"remaining {hd.get('x-requests-remaining')} truncated {hd.get('x-result-truncated')} keys {mk.most_common(12)}", flush=True)
            time.sleep(0.5)
    REP["parlay_props"] = res


if __name__ == "__main__":
    for step in (fliff_part, parlay_part):
        try:
            step()
        except Exception as exc:  # noqa: BLE001
            REP[f"{step.__name__}_error"] = f"{type(exc).__name__}: {str(exc)[:300]}"
            print(f"{step.__name__} FAILED: {exc}", flush=True)
    (OUT / "discovery_props.json").write_text(json.dumps(REP, indent=1, default=str))
    print("wrote discovery_props.json", flush=True)
