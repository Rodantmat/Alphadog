#!/usr/bin/env python3
"""READ-ONLY: build the friend slips for FR_DAY with FR_APP and print every decorated leg (name, team, matchup, tip, deep-link ids)."""
import os, sys, json, datetime as dt
os.environ.setdefault("FR_MODE", "diag")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import friend_engine as F  # noqa: E402
import psycopg  # noqa: E402

conn = psycopg.connect(os.environ["DATABASE_URL"])
d = dt.date.fromisoformat(os.environ["FR_DAY"])
if F.FAPP == "PP":
    F.PC.SE.flex_alt_tiers(); F.PC.SE.payout_v3_rules()
    legs = F.pp_live_prep(conn, d)
elif F.FAPP == "UD":
    legs, _ = F.AF.load_ud(conn, d, {})
else:
    legs = F.AA.live_legs(conn, d, {})
ctx = F.decor_ctx(conn, d)
H = F.proxies(legs) | F.owner_keys(conn, d)
n_link = n_leg = 0
for code, size, st, gc, s, cand in F.plan(legs, H):
    print("==", code, size, st, "slip" if s else "none")
    for l in (s or []):
        x = F.deco(conn, ctx, l, d)
        n_leg += 1
        n_link += bool(x["link"])
        print(json.dumps({k: x[k] for k in ("player_name", "canonical_prop_key", "selected_side", "line_value", "team_abbr", "matchup", "official_game_time_utc", "link")}))
print("legs", n_leg, "with link", n_link)
