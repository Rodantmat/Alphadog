#!/usr/bin/env python3
"""CERTIFICATION - the owner's PrizePicks strategies, replayed through the SAME builders the live pick runs (portfolio_b.unit_slip on portfolio_b.prepare legs,
live_slip_engine.fallback_slips for the thin-night fallbacks), every slate of 2024-25, 2025-26 and 2026-27 (friend_engine.pp_days: graded history legs + this
season on the live board path), graded on the box-score hit flags with the PrizePicks payout law (research_portfolio_caps.grade). READ-ONLY, flat 1u a slip.
Units: pp_portfolio order B3 B4 B5 B7 B9 U4 J1 J2 J3 F5. Fallbacks: pp_fallback (U3 Power, trigger <= 1), pp_fallback2 (U3 Flex, trigger 2-3), pp_fallback4 (U6 Flex).
Also: whole-set curve, correlation of daily results, and per-unit 'leave one out' deltas. Env FR_APP must be PP."""
import collections
import json
import os
import sys

import psycopg

os.environ["FR_APP"] = "PP"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import friend_engine as FE            # noqa: E402
import live_slip_engine as L          # noqa: E402
import portfolio_b as PB              # noqa: E402
import research_cert_common as CC     # noqa: E402

conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
FE.PC.SE.flex_alt_tiers(); FE.PC.SE.payout_v3_rules()
ORDER = ["B3", "B4", "B5", "B7", "B9", "U4", "J1", "J2", "J3", "F5"]
FALL = {"FB_U3power": dict(size=3, floor=0.55, slips=2, trigger=1, structure="power", extra=0),
        "FB_U3flex": dict(size=3, floor=0.55, slips=2, trigger=3, trigger_min=2, structure="flex", extra=0),
        "FB_U6flex": dict(size=6, floor=0.55, slips=1, trigger=99, structure="flex", extra=0)}


def grade(slip, st):
    return float(FE.PC.grade(slip, st)) - 1.0


rec = collections.defaultdict(list)     # name -> [(season, day, profit, void)]
daily_set = collections.defaultdict(float)
nb = {}
NID = CC.name_ids(conn, FE.norm)
for season, d, prep in FE.pp_days(conn):
    for l in prep:                       # history legs carry no player_id: U4's AEDGE needs it (the first run had none -> U4 ranked by final_hp only)
        if not l.get("player_id"):
            l["player_id"] = NID.get(FE.norm(l["player"]))
    try:
        PB.attach_aedge(prep, L.pb_last10(conn, d, {l["player_id"] for l in prep}))
    except Exception as e:
        print("aedge", d, e, flush=True)
    built = 0
    for uid in ORDER:
        try:
            s = PB.unit_slip(prep, uid)
        except Exception as e:
            print("unit", uid, d, e, flush=True)
            s = None
        if not s:
            continue
        st = PB.UNITS[uid][3]
        live = sum(1 for l in s if l.get("hit") is not None)
        p = grade(s, st)
        rec[uid].append((season, d, p, live < 2)); daily_set[(season, d)] += p; built += 1
    nb[(season, d)] = built
    built_all = sum(1 for u in PB.UNITS if PB.unit_slip(prep, u) is not None)
    for name, fb in FALL.items():
        b, sl = L.fallback_slips(prep, dict(fb), force=True)
        trig = fb["trigger"]; tmin = fb.get("trigger_min", 0)
        for s in sl:
            live = sum(1 for l in s if l.get("hit") is not None)
            p = grade(s, fb["structure"])
            rec[name + "_any"].append((season, d, p, live < 2))
            if tmin <= built_all <= trig:
                rec[name + "_trig"].append((season, d, p, live < 2))
print(f"slates replayed: {len(nb)}", flush=True)
print("\n=== owner PP units (live builders) ===", flush=True)
for u in ORDER:
    sz, st = PB.UNITS[u][2], PB.UNITS[u][3]
    CC.report(f"PP {u} {sz}-{st}", rec[u])
print("\n=== owner PP thin-night fallbacks: 'trig' = only on the nights the live trigger fires; 'any' = every slate (stand-alone) ===", flush=True)
for name in FALL:
    CC.report(f"PP {name} trig", rec[name + "_trig"])
    CC.report(f"PP {name} any ", rec[name + "_any"])
print("\n=== whole PP unit set (the ten units, one slip each, no gate/quote skips) ===", flush=True)
allr = [(s, d, p, False) for (s, d), p in sorted(daily_set.items(), key=lambda x: x[0][1])]
# per season sets use the per-slip count for ROI
by_season = collections.defaultdict(list)
for u in ORDER:
    for (s, d, p, v) in rec[u]:
        by_season[s].append((d, p, v))
for s in sorted(by_season):
    print(CC.line(f"PP SET {s}", CC.stat(by_season[s])), flush=True)
print(CC.line("PP SET ALL", CC.stat([x for s in by_season for x in by_season[s]])), flush=True)
print("\n=== leave-one-out (set ROI / net / dd without the unit; ALL seasons) ===", flush=True)
base = CC.stat([x for s in by_season for x in by_season[s]])
for u in ORDER:
    items = [(d, p, v) for v_u in ORDER if v_u != u for (s, d, p, v) in rec[v_u]]
    st_ = CC.stat(items)
    print(f"without {u}: ROI {100 * st_['roi']:+.1f}% net {st_['net']:+.1f} dd {st_['dd']:.1f} drought {st_['dry']} (set: ROI {100 * base['roi']:+.1f}% net {base['net']:+.1f} dd {base['dd']:.1f})", flush=True)
