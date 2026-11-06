#!/usr/bin/env python3
"""READ-ONLY diagnostic: why does the friend engine build no slip for FR_APP today? Prints candidate counts per rule, with and without the leg-difference cap."""
import os, sys, datetime as dt
os.environ.setdefault("FR_MODE", "diag")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import friend_engine as F  # noqa: E402
import psycopg  # noqa: E402

conn = psycopg.connect(os.environ["DATABASE_URL"])
d = dt.date.fromisoformat(os.environ.get("FR_DAY") or dt.datetime.now(F.PT).date().isoformat())
if F.FAPP == "PP":
    F.PC.SE.flex_alt_tiers(); F.PC.SE.payout_v3_rules()
    legs = F.pp_live_prep(conn, d)
elif F.FAPP == "UD":
    legs, _ = F.AF.load_ud(conn, d, {})
else:
    legs = F.AA.live_legs(conn, d, {})
print("legs", len(legs))
from collections import Counter
if legs:
    print("tiers", Counter(l["tier"] for l in legs).most_common(8))
    print("sides", Counter(l["side"] for l in legs))
    print("p>=.62", sum(1 for l in legs if l["p"] >= 0.62), "p>=.55", sum(1 for l in legs if l["p"] >= 0.55))
    print("sample keys", sorted(legs[0].keys())[:40])
Hp = F.proxies(legs)
Ho = F.owner_keys(conn, d)
print("proxy keys", len(Hp), "owner keys", len(Ho))
for H, nm in ((set(), "no cap"), (Hp, "proxies"), (Hp | Ho, "proxies+owner")):
    for code, size, st, gc, s, cand in F.plan(legs, H):
        print(nm, code, "cand", len(cand), "slip", bool(s), [(l["player"], l["prop"], l["side"], l["line"]) for l in (s or [])])
