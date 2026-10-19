#!/usr/bin/env python3
"""PROBE (2026-10-19, follow-up to probe_parlay_discovery run 39326363943): ParlayAPI's Odds-API-compatible endpoints carry 14 books
on NBA game lines (fanduel, pinnacle, fliff, bet365, betmgm, betrivers, bovada, caesars, draftkings, fanatics, hardrock, novig, parx,
prophetx) - do they carry PLAYER PROPS per book the way the Odds API did (the history's source)? Read-only: the event-level odds for
BOS@DET (10-20) one market at a time with a long timeout, plus the sport-level player_points answer. Prints per book: market keys,
outcome counts, two-sided lines, a sample outcome. Never prints the key or a query string."""
import json
import os
from collections import Counter, defaultdict

import psycopg
import requests

BASE = "https://parlay-api.com/v1"
with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
    KEY = conn.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key='parlay_api_key'").fetchone()[0].strip()
H = {"X-API-Key": KEY, "accept": "application/json", "User-Agent": "alphadog"}
S = requests.Session()


def get(path, params, label, timeout=300):
    try:
        r = S.get(f"{BASE}{path}", params=params, headers=H, timeout=timeout)
    except Exception as exc:  # noqa: BLE001
        print(f"[{label}] EXC {type(exc).__name__}", flush=True); return None
    hd = {k.lower(): v for k, v in r.headers.items() if k.lower() in ("x-requests-remaining", "x-requests-last", "x-result-truncated")}
    print(f"[{label}] http {r.status_code} {hd} {'' if r.status_code == 200 else (r.text or '')[:300].replace(KEY, '***')}", flush=True)
    try:
        return r.json()
    except Exception:  # noqa: BLE001
        return None


def show_event(doc):
    if not isinstance(doc, dict):
        print("   not an event object:", str(doc)[:300], flush=True); return
    for b in doc.get("bookmakers") or []:
        for m in b.get("markets") or []:
            outs = m.get("outcomes") or []
            by = defaultdict(set)
            for o in outs:
                by[(o.get("description"), o.get("point"))].add(o.get("name"))
            two = sum(1 for v in by.values() if {"Over", "Under"} <= v)
            print(f"   {b.get('key'):14s} {m.get('key'):34s} outcomes {len(outs):4d} lines {len(by):4d} two-sided {two:4d} sample {json.dumps(outs[0]) if outs else None}", flush=True)


EV = os.environ.get("PE_EVENT", "955b8cbd7bcf461dbd4f8104c9d7310a")   # BOS @ DET 2026-10-20 (ParlayAPI events list, run 39326363943)
for m in ("player_points", "player_points_alternate", "player_rebounds", "player_assists", "player_threes", "player_points_rebounds_assists"):
    show_event(get(f"/sports/basketball_nba/events/{EV}/odds", {"regions": "us,us2", "markets": m, "oddsFormat": "american"}, f"event {m}"))
sp = get("/sports/basketball_nba/odds", {"regions": "us", "markets": "player_points", "oddsFormat": "american"}, "sport-level player_points")
if isinstance(sp, list):
    print(f"   sport-level: {len(sp)} events; books {Counter(b.get('key') for e in sp for b in (e.get('bookmakers') or []))}", flush=True)
    for e in sp[:3]:
        print("   ", e.get("home_team"), e.get("commence_time"), [(b.get('key'), [m.get('key') for m in b.get('markets') or []]) for b in e.get('bookmakers') or []][:6], flush=True)
else:
    print("   sport-level answer:", str(sp)[:400], flush=True)
