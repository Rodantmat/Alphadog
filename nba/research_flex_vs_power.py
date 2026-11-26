#!/usr/bin/env python3
"""
FLEX vs POWER FOR EVERY LIVE STRATEGY (owner 2026-11-25 20:04 PT: "If we change all the strategies to flex, show me the comparison flex vs power"). READ-ONLY.
The SAME slips, paid two ways with each app's own tables:
  PrizePicks  Power 3/6/10/20/37.5x  vs  Flex (3: 3/1, 4: 6/1.5, 5: 10/2/0.4, 6: 25/2/0.4)            - 2-pick has no Flex
  Underdog    Standard (Max) 3.5/6.5/12/20/35x x per-pick factors  vs  Flex (3: 3.25/1.09, 4: 7.2/1.4, 5: 10/2.5, 6: 25/2.6/0.25) - 2-pick no Flex
  Sleeper     Max (product of multipliers x bonus)  vs  Flex (Sleeper's own tier formula)              - 2-pick no Flex
  Betr        Perfect all-Less (2.75/5.5/9/18/31.5)  vs  Dynamic all-Less (2: 1.75/0.5, 3: 2.75/1, 4: 5.5/1.25, 5: 9/1.75/0.25, 6: 18/1.25/1)
  Fliff       Max only (Fliff Pick'Em has no Flex) - shown for completeness
FP_MODE=replay   2026-27, every slate, the live engine as it runs today (honest_live_slip_engine.build: all rules), real boards and multipliers.
FP_MODE=universe 2024-25 / 2025-26 / 2026-27 for UA_APP=prizepicks or underdog: the live codes of research_set_check on the certified universe (PrizePicks with the
                 spread-8 skip). Underdog Flex before 2026-07 is not priced (its old tables) - 2026-27 only.
FP_MODE=sf       Sleeper live codes S4-S13, 2024-25 / 2025-26 derived prices + 2026-27 real (research_spread_sf builder), spread-8 skip.
Env: DATABASE_URL, FP_MODE, UA_APP, HR_FROM, HR_TO.
"""
import datetime as dt
import json
import math
import os
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
MODE = (os.environ.get("FP_MODE") or "replay").lower()
PP_P = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}
PP_F = {(3, 0): 3.0, (3, 1): 1.0, (4, 0): 6.0, (4, 1): 1.5, (5, 0): 10.0, (5, 1): 2.0, (5, 2): 0.4, (6, 0): 25.0, (6, 1): 2.0, (6, 2): 0.4}
UD_P = {2: 3.5, 3: 6.5, 4: 12.0, 5: 20.0, 6: 35.0}
UD_F = {(3, 0): 3.25, (3, 1): 1.09, (4, 0): 7.2, (4, 1): 1.4, (5, 0): 10.0, (5, 1): 2.5, (6, 0): 25.0, (6, 1): 2.6, (6, 2): 0.25}


def summary(tag, res):
    """res: key -> season -> list of (power units, flex units or None)"""
    print(f"FP|================ {tag} ================", flush=True)
    tot = defaultdict(lambda: [[], []])
    for key in sorted(res):
        parts = []
        for s in sorted(res[key]):
            a = res[key][s]
            pw = np.array([x for x, _ in a]); fx = [y for _, y in a]
            fxa = np.array([y for y in fx if y is not None])
            tot[s][0] += list(pw); tot[s][1] += [y if y is not None else x for x, y in a]
            if len(fxa) == len(pw):
                parts.append(f"{s}: {len(pw)} slips | Power {100 * pw.mean():+.0f}% ({pw.sum():+.1f} u, hit-all {100 * (pw > 0).mean():.0f}%) | Flex {100 * fxa.mean():+.0f}% "
                             f"({fxa.sum():+.1f} u, paid {100 * (fxa > 0).mean():.0f}%)")
            else:
                parts.append(f"{s}: {len(pw)} slips | Power {100 * pw.mean():+.0f}% ({pw.sum():+.1f} u) | Flex n/a (no Flex at this size / app)")
        print(f"FP|  {key}", flush=True)
        for p in parts:
            print(f"FP|      {p}", flush=True)
    for s in sorted(tot):
        pw = np.array(tot[s][0]); fx = np.array(tot[s][1])
        print(f"FP|  ALL {s}: {len(pw)} slips | as Power {100 * pw.mean():+.1f}% ({pw.sum():+.1f} u) | all switched to Flex where it exists {100 * fx.mean():+.1f}% ({fx.sum():+.1f} u)", flush=True)


def replay():
    import honest_live_slip_engine as HL
    import audit_honest_live_replay as RP
    import sleeper_live_slip_engine as SL
    import betr_live_slip_engine as BE
    if os.environ.get("FP_STANDALONE") == "1":     # every code on its own: no overlap / player caps, every fallback built every slate (spread / rest skips kept)
        HL.COMPOSE = {}; HL.TARGET = {a: 99 for a in HL.TARGET}
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    pr = SL.pricing(conn); rj = BE.rules(conn)
    BR = conn.execute("SELECT rule_json FROM nba_config.pp_slip_rules WHERE rule_key='betr_payout_v1'").fetchone()[0]
    BR = BR if isinstance(BR, dict) else json.loads(BR)
    d0 = dt.date.fromisoformat(os.environ.get("HR_FROM") or "2026-10-20"); d1 = dt.date.fromisoformat(os.environ.get("HR_TO") or str(dt.date.today() - dt.timedelta(days=1)))
    days = [r[0] for r in conn.execute("SELECT DISTINCT game_date FROM nba_calendar.slate_games WHERE game_date BETWEEN %s AND %s ORDER BY 1", (d0, d1)).fetchall()]
    box = defaultdict(dict)
    for row in conn.execute("SELECT nba_player_id::text, game_date, " + ", ".join(RP.COLS) + " FROM nba_stats.player_game_log WHERE game_date BETWEEN %s AND %s AND min > 0", (d0, d1)).fetchall():
        box[row[1]][row[0]] = [float(x or 0) for x in row[2:]]
    res = defaultdict(lambda: defaultdict(list))
    for day in days:
        try:
            plan, notes = HL.build(conn, day, HL.ALL_APPS)
        except Exception as e:  # noqa: BLE001
            conn.rollback(); print(f"FP|{day}: build failed {type(e).__name__}", flush=True); continue
        for app, slips in plan.items():
            for code, k, st, s, cand in slips:
                hits, ms = [], []
                for r in s:
                    v = box[day].get(r["pid"]); x = None if v is None else RP.stat(v, r["prop"])
                    if x is None or x == r["line"]:
                        continue
                    hits.append(int(x < r["line"])); ms.append(float(r["leg"].get("m") or 1.0))
                n = len(hits); h = sum(hits)
                if n < 2:
                    continue
                if app == "prizepicks":
                    pw = PP_P[n] if h == n else 0.0; fx = PP_F.get((n, n - h), 0.0) if n >= 3 else None
                elif app == "underdog":
                    pw = UD_P[n] if h == n else 0.0; fx = UD_F.get((n, n - h), 0.0) if n >= 3 else None
                elif app == "sleeper":
                    pw = math.prod(ms) * pr[0].get(n, 1.0) if h == n else 0.0
                    fx = float(SL.flex_tiers(ms, pr[1], pr[2]).get(h, 0.0)) if n >= 3 else None
                elif app == "betr":
                    pw = float(BR["perfect_all_less"].get(str(n), 0.0)) if h == n else 0.0
                    fx = float((BR["dynamic_all_less"].get(str(n)) or {}).get(str(h), 0.0)) if n >= 2 else None
                else:
                    pw = math.prod(ms) if h == n else 0.0; fx = None
                res[f"{app:10s} {code:4s} {k}-pick (live: {st})"]["2026-27"].append((pw - 1, None if fx is None else fx - 1))
        print(f"FP|{day} built", flush=True)
    summary("2026-27 REPLAY - the live engine, real boards, every app" + (" - STANDALONE (no overlap, fallbacks every slate)" if os.environ.get("FP_STANDALONE") == "1" else ""), res)


def universe():
    import research_universe as U
    import research_set_check as SC
    from research_spread_refine import market
    import pandas as pd
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    d = U.load(conn); L = U.layers(d)
    mk = market(conn)
    mm = mk.reindex(pd.MultiIndex.from_arrays([d["gd"].values, d["player_id"].values])); asp = np.abs(mm["tsp"].values)
    sets = SC.SETS[U.APP] if isinstance(SC.SETS, dict) else SC.SETS
    reg = d["easy"].values == 0; und = d["under"].values
    pid = d["player_id"].values; gid = d["gid"].values; w = d["w"].values; lf = d["logf"].values
    res = defaultdict(lambda: defaultdict(list))
    by_gd = d.groupby("gd").indices
    for code, rkr, filt, gcap, st, k, role in sets:
        m = reg & und & np.isfinite(d[rkr].values.astype(float))
        for f in filt:
            m &= L[f]
        for gd in sorted(by_gd):
            ix = by_gd[gd]; j = ix[m[ix]]
            j = j[np.argsort(-d[rkr].values[j].astype(float), kind="mergesort")]
            sel = []; up = set(); ug = defaultdict(int)
            for i in j:
                if pid[i] in up or ug[gid[i]] >= gcap:
                    continue
                sel.append(i); up.add(pid[i]); ug[gid[i]] += 1
                if len(sel) == k:
                    break
            if len(sel) < k:
                continue
            s = np.array(sel)
            if U.APP == "prizepicks" and np.isfinite(asp[s]).any() and np.nanmean(asp[s]) > 8:
                continue
            old = gd < "2026-07-01"
            ww = int(w[s].sum())
            pw, fx = U.payouts(k, np.array([ww]), np.array([0]), np.array([0.0]), np.array([float(lf[s].sum())]), np.array([float(lf[s][w[s] == 1].sum())]), np.array([old]), {})
            p, f = pw[0], fx[0]
            if not np.isfinite(p):
                continue
            res[f"{U.APP:10s} {code:5s} {k}-pick (live: {st}, {role})"][d["season"].values[ix[0]]].append((p - 1, (f - 1) if np.isfinite(f) else None))
    summary(f"{U.APP.upper()} 3 SEASONS - the live codes on the certified universe", res)


def sf():
    import research_pass10 as P10
    import research_spread_sf as SF
    from research_pass29 import take, MKS
    from research_spread_refine import market
    import pandas as pd
    import sleeper_live_slip_engine as SL
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    P10.SLP = SL.pricing(conn)
    mk = market(conn); asp = {kk: abs(v) for kk, v in mk["tsp"].dropna().items()}
    d = pd.read_sql("""SELECT v.app, v.season, v.game_date::text gd, v.player_id, v.prop, v.line::float8 line, v.kind, v.multiplier::float8 mm, v.hit::int hit,
                              v.p_blend::float8 blend, v.p_honest_baseline::float8 ph FROM nba_score.v_legs_honest v WHERE v.prop = ANY(%s) AND v.is_under AND v.game_date >= '2024-10-01'""",
                    conn, params=(list(MKS.values()),))
    gl = pd.read_sql("SELECT nba_player_id::text player_id, game_date::text gd, game_id::text game_id FROM nba_stats.player_game_log WHERE game_date >= '2024-10-01' AND min > 0", conn).drop_duplicates(["player_id", "gd"])
    d["player_id"] = d["player_id"].astype(str); d = d.merge(gl, on=["player_id", "gd"], how="left"); d["game_id"] = d["game_id"].fillna("g" + d["player_id"])
    reg = d[(d["kind"] == "regular") & d["app"].isin(["underdog", "prizepicks"]) & d["blend"].notna()]; reg = reg[(reg["app"] != "prizepicks") | (reg["line"] % 1 != 0)]
    Lr = {key: g.to_dict("records") for key, g in reg.sort_values("blend", ascending=False).groupby(["app", "gd"], sort=False)}
    own = d[d["app"] == "sleeper"]
    T = {key: g.to_dict("records") for key, g in own.groupby(["app", "gd", "player_id", "prop"], sort=False)}

    def firstk(rows, k):
        o = []; gs = set(); ps = set()
        for r in rows:
            if r["player_id"] in ps or r["game_id"] in gs:
                continue
            o.append(r); ps.add(r["player_id"]); gs.add(r["game_id"])
            if len(o) == k:
                break
        return o

    def onto(gd, src):
        out = []
        for r in src:
            g = T.get(("sleeper", gd, r["player_id"], r["prop"]))
            if g:
                t = min(g, key=lambda x: abs(x["line"] - r["line"])); out.append(dict(t, player_id=r["player_id"], prop=r["prop"], game_id=r["game_id"], gd=gd))
        return out
    res = defaultdict(lambda: defaultdict(list))
    for gd in sorted(own["gd"].unique()):
        U_ = Lr.get(("underdog", gd), []); P_ = Lr.get(("prizepicks", gd), [])
        src = {"tight": onto(gd, sorted(firstk(U_, 2) + firstk(P_, 5), key=lambda r: -r["blend"])), "pp": onto(gd, P_),
               "ppavg": onto(gd, sorted(P_, key=lambda r: -((r["blend"] + r["ph"]) / 2 if r["ph"] == r["ph"] else -9)))}
        for code, (sn, pn, gcap, diff, st, k) in SF.LIVE["sleeper"].items():
            s_ = take([r for r in src[sn] if SF.POOL[pn](r)], k, gcap, diff, 1)
            if not s_:
                continue
            v = [asp.get((gd, x["player_id"])) for x in s_]; v = [x for x in v if x is not None and x == x]
            if v and np.mean(v) > 8:
                continue
            hits = [x["hit"] for x in s_]; ms = [x["mm"] for x in s_]
            pw = P10.pay("sleeper", k, "P", hits, ms) - 1
            fx = (P10.pay("sleeper", k, "F", hits, ms) - 1) if k >= 3 else None
            res[f"sleeper    {code:4s} {k}-pick (live: {'Flex' if st == 'F' else 'Max'})"][s_[0]["season"]].append((pw, fx))
    summary("SLEEPER 3 SEASONS (2024-25 / 2025-26 derived prices, 2026-27 real)", res)


if __name__ == "__main__":
    {"replay": replay, "universe": universe, "sf": sf}[MODE]()
    print("FP|DONE", flush=True)
