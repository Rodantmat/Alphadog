#!/usr/bin/env python3
"""
SPREAD RULE ON THE LIVE SLEEPER / FLIFF CODES (owner 2026-11-23 22:49 PT "Go" on: PrizePicks spread rule now, Sleeper / Fliff tested on their live codes first).
READ-ONLY. Same boards, sources and pricing as research_pass29.py (Sleeper / Fliff 2026-27 REAL prices, 2024-25 / 2025-26 DERIVED), the live codes as they are
built today (S4-S13, F4-F12), one slip a slate per code. Rule: a slip is not played when its legs' games average an absolute pre-game spread above T
(T 7, 7.5, 8, 8.5, 9). Per code and all codes together, per season: ROI, slips, units; luck test = random skips of as many as-built slips (2000 draws).
Spreads as research_spread_refine.market() (closing lines to 2026-06, snapshots from 2026-10).
Env: DATABASE_URL, P29_APPS (sleeper,fliff).
"""
import json
import os
import sys
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_pass10 as P10                                     # noqa: E402
from research_pass29 import take, MKS, SEAS                       # noqa: E402
from research_spread_refine import market                         # noqa: E402

LIVE = {"sleeper": {"S4": ("tight", "all", 1, 0, "F", 4), "S5": ("tight", "all", 1, 0, "P", 4), "S6": ("tight", "all", 1, 0, "F", 5),
                    "S7": ("pp", "all", 1, 0, "P", 5), "S8": ("pp", "all", 1, 0, "P", 4), "S9": ("tight", "noast", 1, 0, "P", 2),
                    "S10": ("pp", "noast", 1, 1, "P", 3), "S11": ("pp", "reb", 1, 0, "P", 2), "S12": ("pp", "all", 1, 1, "P", 5), "S13": ("ppavg", "all", 1, 0, "F", 6)},
        "fliff": {"F4": ("tight", "all", 1, 0, "P", 4), "F5": ("tight", "all", 1, 0, "P", 5), "F6": ("pp", "all", 1, 0, "P", 4), "F7": ("pp", "all", 1, 0, "P", 5),
                  "F8": ("tight", "noast", 1, 0, "P", 2), "F9": ("pp", "noast", 1, 1, "P", 3), "F10": ("pp", "reb", 1, 0, "P", 2), "F11": ("pp", "all", 1, 1, "P", 5),
                  "F12": ("pp", "m18", 1, 0, "P", 6)}}
POOL = {"all": lambda r: True, "noast": lambda r: r["prop"] != "assists", "reb": lambda r: r["prop"] == "rebounds", "m18": lambda r: r["mm"] >= 1.8}
CUTS = (7, 7.5, 8, 8.5, 9)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    import sleeper_live_slip_engine as SL
    P10.SLP = SL.pricing(conn)
    BR = conn.execute("SELECT rule_json FROM nba_config.pp_slip_rules WHERE rule_key='betr_payout_v1'").fetchone()[0]; P10.BR = BR if isinstance(BR, dict) else json.loads(BR)
    mk = market(conn)
    asp = {k: abs(v) for k, v in mk["tsp"].dropna().items()}
    d = pd.read_sql("""SELECT v.app, v.season, v.game_date::text gd, v.player_id, v.prop, v.line::float8 line, v.kind, v.multiplier::float8 mm, (v.price_source = 'real')::int real, v.hit::int hit,
                              v.p_blend::float8 blend, v.p_honest_baseline::float8 ph FROM nba_score.v_legs_honest v WHERE v.prop = ANY(%s) AND v.is_under AND v.game_date >= '2024-10-01'""",
                    conn, params=(list(MKS.values()),))
    gl = pd.read_sql("""SELECT nba_player_id::text player_id, game_date::text gd, game_id::text game_id FROM nba_stats.player_game_log WHERE game_date >= '2024-10-01' AND min > 0""",
                     conn).drop_duplicates(["player_id", "gd"])
    conn.close()
    d["player_id"] = d["player_id"].astype(str)
    d = d.merge(gl, on=["player_id", "gd"], how="left"); d["game_id"] = d["game_id"].fillna("g" + d["player_id"])
    reg = d[(d["kind"] == "regular") & d["app"].isin(["underdog", "prizepicks"]) & d["blend"].notna()]; reg = reg[(reg["app"] != "prizepicks") | (reg["line"] % 1 != 0)]
    L = {key: g.to_dict("records") for key, g in reg.sort_values("blend", ascending=False).groupby(["app", "gd"], sort=False)}
    apps = [a for a in (os.environ.get("P29_APPS") or "sleeper,fliff").split(",") if a]
    own = d[d["app"].isin(apps)]
    T = {key: g.to_dict("records") for key, g in own.groupby(["app", "gd", "player_id", "prop"], sort=False)}
    days_of = {a: sorted(own[own["app"] == a]["gd"].unique()) for a in apps}

    def firstk(rows, k):
        o = []; gs = set(); ps = set()
        for r in rows:
            if r["player_id"] in ps or r["game_id"] in gs:
                continue
            o.append(r); ps.add(r["player_id"]); gs.add(r["game_id"])
            if len(o) == k:
                break
        return o

    def onto(app, gd, src):
        out = []
        for r in src:
            g = T.get((app, gd, r["player_id"], r["prop"]))
            if g:
                t = min(g, key=lambda x: abs(x["line"] - r["line"])); out.append(dict(t, player_id=r["player_id"], prop=r["prop"], game_id=r["game_id"], gd=gd))
        return out

    for app in apps:
        res = defaultdict(lambda: defaultdict(list))          # (code or ALL, cut) -> season -> [u]
        flags = defaultdict(lambda: defaultdict(list))        # code -> season -> [(u, avg spread)]
        for gd in days_of[app]:
            U = L.get(("underdog", gd), []); P = L.get(("prizepicks", gd), [])
            src = {"tight": onto(app, gd, sorted(firstk(U, 2) + firstk(P, 5), key=lambda r: -r["blend"])), "pp": onto(app, gd, P),
                   "ppavg": onto(app, gd, sorted(P, key=lambda r: -((r["blend"] + r["ph"]) / 2 if r["ph"] == r["ph"] else -9)))}
            for code, (sn, pn, gcap, diff, st, k) in LIVE[app].items():
                cand = [r for r in src[sn] if POOL[pn](r)]
                s_ = take(cand, k, gcap, diff, 1)
                if not s_:
                    continue
                u = P10.pay(app, k, st, [x["hit"] for x in s_], [x["mm"] for x in s_]) - 1
                v = [asp.get((gd, x["player_id"])) for x in s_]; v = [x for x in v if x is not None and x == x]
                flags[code][s_[0]["season"]].append((u, np.mean(v) if v else np.nan))
        rng = np.random.default_rng(5)
        print(f"SF|================ {app.upper()} (2024-25 / 2025-26 derived prices, 2026-27 real) ================", flush=True)
        for label, codes in [(c, [c]) for c in LIVE[app]] + [("ALL CODES", list(LIVE[app]))]:
            base = {s: np.array([u for c in codes for u, a in flags[c][s]]) for s in SEAS}
            line = [f"{label:9s} as built " + " | ".join(f"{s}: {100 * base[s].mean():+.0f}% ({len(base[s])}, {base[s].sum():+.1f} u)" if len(base[s]) else f"{s}: -" for s in SEAS)]
            for cut in CUTS:
                parts = []; beats = 0; ps = []
                for s in SEAS:
                    allr = [(u, a) for c in codes for u, a in flags[c][s]]
                    if not allr:
                        parts.append("-"); continue
                    kept = np.array([u for u, a in allr if not (a == a and a > cut)])
                    b0 = base[s]
                    if not len(kept):
                        parts.append("0 slips"); continue
                    beats += int(kept.mean() > b0.mean())
                    dr = np.array([b0[rng.choice(len(b0), len(kept), replace=False)].mean() for _ in range(2000)])
                    ps.append(f"{float((dr >= kept.mean()).mean()):.2f}")
                    parts.append(f"{100 * kept.mean():+.0f}% ({len(kept)}, {kept.sum():+.1f} u)")
                line.append(f"{'':9s} skip > {cut:<4g}  " + " | ".join(parts) + f"  -> beats {beats}/3, luck p " + " / ".join(ps))
            for l_ in line:
                print("SF|  " + l_, flush=True)
    print("SF|DONE", flush=True)


if __name__ == "__main__":
    main()
