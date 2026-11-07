#!/usr/bin/env python3
"""TODAY'S PRIZEPICKS PORTFOLIO, unit by unit (owner 2026-11-07: only 2 slips with 10 units is suspicious). Rebuilds the live pool exactly as pick() does
(load_board_legs -> pools['__calib__'] -> PB.prepare with the trailing window) and shows for every unit its candidates and why it built / did not build. READ-ONLY."""
import os, sys, datetime as dt
from zoneinfo import ZoneInfo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import psycopg
import live_slip_engine as L
PB = L.PB
conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
day = dt.date.fromisoformat(os.environ.get("DAY") or dt.datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat())
legs = L.load_board_legs(conn, day)
calib = [dict(l, p=float(l['score']), cell=f"{l['prop']}_{l['tier']}") for l in legs if l['rank_key'] == 'final_hp' and not l.get('whole_number') and l.get('score') is not None]
prep = PB.prepare(calib, L.pb_rates(conn, day))
print(f"{day}: board legs {len(legs)}, calibrated pool {len(calib)}, prepared {len(prep)}; games {len({l['event_id'] for l in prep})}, players {len({l['player'] for l in prep})}")
from collections import Counter
print("tiers", dict(Counter(l['tier'] for l in prep)), "groups", dict(Counter(l['_grp'] for l in prep)))
for uid, spec in PB.UNITS.items():
    c, gc, pc = PB.candidates(prep, uid)
    s = PB.unit_slip(prep, uid)
    size = spec[2]
    print(f"\n{uid:4s} {spec[0]:3s} size {size} {spec[3]:5s} candidates {len(c):4d} game cap {gc} -> {'BUILT' if s else 'no slip'}")
    show = s if s else c[:8]
    for l in show[:8]:
        print(f"     {l['player']:24s} {l['prop']:10s} {l['side']:5s} {float(l['line']):5.1f} tier {l['tier']} p {float(l['p']):.3f} trail {l.get('_trail', 0):.3f} {l.get('_lp','')}")
    if not s and c:
        picks, players, games = [], set(), Counter()
        for l in c:
            if l['player'] in players or games[l['event_id']] >= gc: continue
            picks.append(l); players.add(l['player']); games[l['event_id']] += 1
        print(f"     greedy fill reaches {len(picks)} of {size} legs; teams {len({l['team_id'] for l in picks})}")
