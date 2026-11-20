#!/usr/bin/env python3
"""
PASS 10 - THE OWNER'S ELECTED SET, RUN TOGETHER, WITH A CAP ON HOW OFTEN ONE PLAYER MAY BE USED. READ-ONLY. (NBA_HONEST_REBUILD.md 8aa)
Owner 2026-11-19 22:54 / 22:57 PT: Underdog U1-U5, PrizePicks P1-P9, Sleeper S1 S4 S5 S6, Fliff F1 F4 F5, Betr B1 B5 - "What if I use them all and we apply
some kind of correlation on the slips, so legs are not over used? What changes?"
The slips of an app are built in the listed order. CAP = a player may sit in at most N slips of that app on a slate; a strategy whose next leg is used up
takes ITS next leg in its own order (or makes no slip if it runs out). N = none, 3, 2, 1. Also a cap across ALL apps (N slips a player a slate over the five).
Per app and together: dollars at $10 a slip by season, ROI, slips a slate, drawdown, worst 7 slates in a row, losing months, and how concentrated the day is
(the most slips any one player sits in).
Env: DATABASE_URL.
"""
import json
import math
import os
import sys
from collections import Counter

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
COMBO = ("pra", "pts_reb", "pts_ast", "reb_ast", "stocks", "fantasy_score", "double_double")
SEAS = ["2024-25", "2025-26", "2026-27"]; STAKE = 10.0
HALF = os.environ.get("P10_HALF") == "1"      # PrizePicks: half-point lines only (pass 14)
PP_FLEX = {(3, 0): 6.0, (4, 0): 6.0, (4, 1): 1.5, (5, 0): 10.0, (5, 1): 2.0, (5, 2): 0.4, (6, 0): 25.0, (6, 1): 2.0, (6, 2): 0.4}
SINGLE = {"points": "pts", "rebounds": "reb", "assists": "ast", "threes_made": "fg3m", "steals": "stl", "blocks": "blk", "turnovers": "tov"}
MKS = {"player_points": "points", "player_rebounds": "rebounds", "player_assists": "assists", "player_threes": "threes_made", "player_steals": "steals", "player_blocks": "blocks", "player_turnovers": "turnovers"}
SLP = None; BR = None


def pay(app, k, st, hits, ms):
    h = sum(hits)
    if app == "underdog":
        return 3.5 if h == 2 else 0.0
    if app == "prizepicks":
        return PP_FLEX.get((k, k - h), 0.0)
    if app == "fliff":
        return math.prod(ms) if h == k else 0.0
    if app == "sleeper":
        bonus, fev, frat = SLP
        if st == "P":
            return math.prod(ms) * bonus.get(k, 1.0) if h == k else 0.0
        import sleeper_live_slip_engine as SL
        return float(SL.flex_tiers(list(ms), fev, frat).get(h, 0.0)) if h >= k - 2 else 0.0
    return float(BR["perfect_all_less"].get(str(k), 0.0)) if h == k else 0.0        # betr Perfect, all Less


def pick(rows, k, used, cap, gused, gcap, diff_prop=False, skip=()):
    """rows: list of dicts in the strategy's order -> first k: one a player and a game (a prop if diff_prop), player under the app cap and the all-app cap"""
    out = []; games = set(); players = set(skip); props = set()
    for r in rows:
        pl = r["player_id"]
        if pl in players or r["game_id"] in games or (diff_prop and r["prop"] in props):
            continue
        if (cap and used[pl] >= cap) or (gcap and gused[pl] >= gcap):
            continue
        out.append(r); players.add(pl); games.add(r["game_id"]); props.add(r["prop"])
        if len(out) == k:
            return out
    return None


def summ(t, slates):
    """t: frame gd, s, u, n"""
    if not len(t):
        return "no slips"
    t = t.groupby(["gd", "s"], as_index=False).agg(u=("u", "sum"), n=("n", "sum")).sort_values("gd")
    per = " | ".join(f"{s} ${STAKE * x['u'].sum():+,.0f} ({100 * x['u'].sum() / x['n'].sum():+.0f}%, {x['n'].sum() / max(1, slates.get(s, len(x))):.1f} a slate)" for s, x in ((s, t[t["s"] == s]) for s in SEAS) if len(x))
    cum = np.concatenate([[0], np.cumsum(t["u"].values)]); dd = float((np.maximum.accumulate(cum) - cum).max())
    w7 = float(t["u"].rolling(7).sum().min()) if len(t) >= 7 else float(t["u"].sum()); mo = t.assign(ym=t["gd"].str[:7]).groupby("ym")["u"].sum()
    return (f"{per} || total ${STAKE * t['u'].sum():+,.0f}, ROI {100 * t['u'].sum() / t['n'].sum():+.1f}% on {int(t['n'].sum())} slips, drawdown ${STAKE * dd:,.0f}, worst 7 slates ${STAKE * w7:+,.0f}, "
            f"losing months {(mo < 0).sum()} of {len(mo)}")


def main():
    global SLP, BR
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    import sleeper_live_slip_engine as SL
    SLP = SL.pricing(conn)
    BR = conn.execute("SELECT rule_json FROM nba_config.pp_slip_rules WHERE rule_key='betr_payout_v1'").fetchone()[0]; BR = BR if isinstance(BR, dict) else json.loads(BR)
    d = pd.read_sql("""SELECT v.app, v.season, v.game_date::text gd, v.player_id, v.prop, v.line::float8 line, v.kind, v.multiplier::float8 mm, v.hit::int hit, v.p_blend::float8 blend,
                              v.p_honest_baseline::float8 ph FROM nba_score.v_legs_honest v WHERE v.prop <> ALL(%s) AND v.is_under""", conn, params=(list(COMBO),))
    gl = pd.read_sql("""SELECT nba_player_id::text player_id, game_date::text gd, game_id::text game_id, (matchup LIKE '%%vs.%%') home, min::float8 mn, pts::float8 pts, reb::float8 reb, ast::float8 ast,
                               fg3m::float8 fg3m, stl::float8 stl, blk::float8 blk, tov::float8 tov FROM nba_stats.player_game_log WHERE game_date >= '2024-10-01' AND min > 0""", conn).drop_duplicates(["player_id", "gd"])
    rt = pd.read_sql("SELECT game_date::text gd, player_id::text player_id, max(role_tier) role FROM nba_score.baseline_history_h GROUP BY 1, 2", conn)
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    bb = pd.read_sql("""SELECT DISTINCT game_date::text gd, nba_ref.norm_name(player) nm, market_key mk, line::float8 line FROM nba_market.board_snapshots
                        WHERE bookmaker = 'betr_us_dfs' AND snapshot_label = 'window' AND game_date < current_date AND market_key = ANY(%s) AND lower(left(side, 1)) NOT IN ('o', 'm', 'h')""",
                     conn, params=(list(MKS),))
    conn.close()
    d = d.merge(gl[["player_id", "gd", "game_id", "home"]], on=["player_id", "gd"], how="left").merge(rt, on=["gd", "player_id"], how="left")
    d["game_id"] = d["game_id"].fillna("g" + d["player_id"]); d["starter"] = d["role"].astype(str).str.lower().str.contains("star|start|core|primary")
    bb["player_id"] = bb["nm"].map(ids); bb["prop"] = bb["mk"].map(MKS); bb = bb[bb["player_id"].notna()].drop_duplicates(["gd", "player_id", "prop"]).merge(gl, on=["player_id", "gd"], how="inner")
    stat = np.full(len(bb), np.nan)
    for p_, c_ in SINGLE.items():
        k_ = (bb["prop"] == p_).values; stat[k_] = bb.loc[k_, c_].values
    bb["stat"] = stat; bb = bb[bb["stat"] != bb["line"]].copy(); bb["hit"] = (bb["stat"] < bb["line"]).astype(int); bb["mm"] = 1.0
    bb["season"] = np.where(bb["gd"] < "2026-08-01", "2025-26", "2026-27")

    reg = d[(d["kind"] == "regular") & d["app"].isin(["underdog", "prizepicks"]) & d["blend"].notna()]
    if HALF:
        n0 = len(reg); reg = reg[(reg["app"] != "prizepicks") | (reg["line"] % 1 != 0)]
        print(f"P10|PrizePicks half-point lines only: {n0 - len(reg):,} whole-number legs left out of the pool", flush=True)
    L = {}                                                   # (app, gd) -> list of leg dicts by the blend
    for (a, gd), g in reg.sort_values("blend", ascending=False).groupby(["app", "gd"], sort=False):
        L[(a, gd)] = g.to_dict("records")
    LP = {(a, gd): g.to_dict("records") for (a, gd), g in reg[reg["ph"].notna()].sort_values("ph", ascending=False).groupby(["app", "gd"], sort=False)}
    T = {}                                                   # target boards: (app, gd, player, prop) -> list of legs
    for a, x in (("sleeper", d[d["app"] == "sleeper"]), ("fliff", d[d["app"] == "fliff"]), ("betr", bb)):
        x = x.merge(gl[["player_id", "gd", "game_id"]], on=["player_id", "gd"], how="left", suffixes=("", "_g")) if "game_id" not in x.columns else x
        for key, g in x.groupby(["gd", "player_id", "prop"], sort=False):
            T[(a,) + key] = g.to_dict("records")
    slates = sorted({gd for (a, gd) in L}); season_of = {gd: L[(a, gd)][0]["season"] for (a, gd) in L}
    nsl = Counter(season_of[gd] for gd in slates)

    def first(rows, k):
        """up to k legs in order, one a player and a game (a short list on a small slate)"""
        out = []; games = set(); players = set()
        for r in rows:
            if r["player_id"] in players or r["game_id"] in games:
                continue
            out.append(r); players.add(r["player_id"]); games.add(r["game_id"])
            if len(out) == k:
                break
        return out

    def onto(app, gd, src):
        """the source legs (in order) as the target app's own legs: nearest line"""
        out = []
        for r in src:
            g = T.get((app, gd, r["player_id"], r["prop"]))
            if g:
                t = min(g, key=lambda x: abs(x["line"] - r["line"])); out.append(dict(t, player_id=r["player_id"], prop=r["prop"], game_id=r["game_id"], season=season_of[gd]))
        return out

    def run(cap, gcap):
        rows = []; conc = []; conc_all = []
        for gd in slates:
            s = season_of[gd]; gused = Counter(); U = L.get(("underdog", gd), []); P = L.get(("prizepicks", gd), [])
            ukey = {(r["player_id"], r["prop"]): r for r in U}
            tight = sorted(first(U, 2) + first(P, 5), key=lambda r: -r["blend"]); seen = {r["player_id"] for r in tight}
            wide = tight + [r for r in sorted(first(U, 10) + first(P, 10), key=lambda r: -r["blend"]) if r["player_id"] not in seen]
            p5 = {r["player_id"] for r in (pick(P, 6, Counter(), None, Counter(), None) or [])}
            plan = {"underdog": [("U1", 2, "P", U, {}), ("U2", 2, "P", LP.get(("underdog", gd), []), {}),
                                 ("U3", 2, "P", [ukey[(r["player_id"], r["prop"])] for r in P if (r["player_id"], r["prop"]) in ukey], {}),
                                 ("U4", 2, "P", [r for r in U if r["prop"] == "rebounds"], {}), ("U5", 2, "P", [r for r in U if r["home"] is True or r["home"] == 1], {})],
                    "prizepicks": [("P1", 5, "F", P, dict(diff_prop=True)), ("P2", 5, "F", [r for r in P if r["line"] < 10], {}), ("P3", 5, "F", P, {}),
                                   ("P4", 5, "F", [r for r in P if r["home"] is True or r["home"] == 1], {}), ("P5", 6, "F", P, {}), ("P6", 6, "F", P, dict(diff_prop=True)),
                                   ("P7", 6, "F", [r for r in P if not r["starter"]], {}), ("P8", 6, "F", P, dict(skip=p5)), ("P9", 4, "F", P, {})] + ([("P10", 3, "F", P, {})] if HALF else []),
                    "sleeper": [("S1", 2, "P", onto("sleeper", gd, first(U, 10)), {}), ("S4", 4, "F", onto("sleeper", gd, wide), {}), ("S5", 4, "P", onto("sleeper", gd, wide), {}),
                                ("S6", 5, "F", onto("sleeper", gd, wide), {})] if s == "2026-27" else [],
                    "fliff": [("F1", 2, "P", onto("fliff", gd, first(U, 10)), {}), ("F4", 4, "P", onto("fliff", gd, wide), {}), ("F5", 5, "P", onto("fliff", gd, wide), {})] if s == "2026-27" else [],
                    "betr": [("B1", 3, "P", onto("betr", gd, wide), {}), ("B5", 3, "P", onto("betr", gd, first(P, 10)), {})]}
            for app, strategies in plan.items():
                used = Counter()
                for code, k, st, cand, kw in strategies:
                    if not cap and not gcap and code in ("S1", "F1"):
                        cand = cand[:2]                      # as elected: the top 2 only (no next leg without a cap)
                    if not cap and not gcap and code in ("S4", "S5", "S6", "F4", "F5", "B1"):
                        cand = [r for r in cand if r["player_id"] in seen]
                    if not cap and not gcap and code == "B5":
                        cand = cand[:5]
                    legs = pick(cand, k, used, cap, gused, gcap, **kw)
                    if legs is None:
                        continue
                    for r in legs:
                        used[r["player_id"]] += 1; gused[r["player_id"]] += 1
                    rows.append((gd, s, app, code, pay(app, k, st, [int(r["hit"]) for r in legs], [float(r.get("mm") or 1.0) for r in legs]) - 1, 1))
                if used:
                    conc.append((app, s, max(used.values()), len(used)))
            if gused:
                conc_all.append((s, max(gused.values()), len(gused), sum(gused.values())))
        return pd.DataFrame(rows, columns=["gd", "s", "app", "code", "u", "n"]), pd.DataFrame(conc, columns=["app", "s", "mx", "players"]), pd.DataFrame(conc_all, columns=["s", "mx", "players", "legs"])

    for label, cap, gcap in ((("NO CAP (as elected)", None, None),) if HALF else (("NO CAP (as elected)", None, None), ("a player in at most 3 slips an app", 3, None), ("at most 2 slips an app", 2, None), ("at most 1 slip an app", 1, None),
                             ("at most 2 an app AND 6 over all apps", 2, 6), ("at most 2 an app AND 4 over all apps", 2, 4), ("at most 1 an app AND 3 over all apps", 1, 3))):
        R, C, CA = run(cap, gcap)
        print(f"\nP10|================ {label} ================", flush=True)
        for app in ("underdog", "prizepicks", "sleeper", "fliff", "betr"):
            x = R[R["app"] == app]; c = C[C["app"] == app]
            sl = dict(nsl) if app in ("underdog", "prizepicks") else {s: R[(R["app"] == app) & (R["s"] == s)]["gd"].nunique() for s in SEAS}
            print(f"P10|  {app:10s}: {summ(x, sl)}; the most slips one player sits in: average {c['mx'].mean():.1f}, worst {c['mx'].max() if len(c) else 0}; different players a slate {c['players'].mean():.1f}", flush=True)
            for code, y in x.groupby("code"):
                per = " / ".join(f"{100 * z['u'].mean():+.0f}% (${STAKE * z['u'].sum():+,.0f}, {len(z)})" if len(z) else "-" for z in (y[y["s"] == s] for s in SEAS))
                print(f"P10|      {code}: {per} | total ${STAKE * y['u'].sum():+,.0f}, {100 * y['u'].mean():+.1f}%", flush=True)
        up = R[R["app"].isin(["underdog", "prizepicks"])]
        print(f"P10|  UNDERDOG + PRIZEPICKS: {summ(up, dict(nsl))}", flush=True)
        ts = R[R["s"] == "2026-27"]
        print(f"P10|  ALL APPS, THIS SEASON: {summ(ts, dict(nsl))}", flush=True)
        print(f"P10|  ALL APPS, EVERY SEASON (apps enter when their boards exist): {summ(R, dict(nsl))}", flush=True)
        ca = CA[CA["s"] == "2026-27"]
        print(f"P10|  this season over all apps: one player sits in at most {ca['mx'].mean():.1f} slips on an average slate (worst {ca['mx'].max()}); {ca['players'].mean():.0f} different players carry {ca['legs'].mean():.0f} legs a slate", flush=True)
    print("P10|DONE", flush=True)


if __name__ == "__main__":
    main()
