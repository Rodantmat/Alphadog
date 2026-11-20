#!/usr/bin/env python3
"""
PASS 18 - TRAILING FORM, SECOND / THIRD SLIPS, A TRAILING GATE. READ-ONLY. (NBA_HONEST_REBUILD.md 8ai; owner 2026-11-20 09:23 PT: "continue with research, different methods,
aspects, techniques, ranks, trailings, to see which other positive strategy you can find or improve the strategies we have")
Same legs as the live set: regular single-stat Unders, one leg a player and a game, PrizePicks half-point lines only. Everything a leg uses is known before its game.
  A. TRAILING FORM of the player AT THE LEG'S OWN LINE, from his earlier games only: share of his last 5 / 10 / 20 games that finished under it; a shrunk last-20 share;
     last 3 all under; last game over; minutes trend (last 3 vs last 10); rest days (back-to-back or not). Used as RANKERS and as LAYERS on the live rankers.
  B. SECOND and THIRD slip of a ranking (players of the earlier slips skipped) for the blend, the model, their average, the geometric mean, the small gbm.
  C. TRAILING GATE on a strategy's own results: play today's slip only when its last 5 / 10 / 20 slips are up (or down).
A cell is listed when positive in every season; the number of cells tried is printed (with thousands of cells some survivors are chance - leads ranked by their weakest season).
Env: DATABASE_URL.
"""
import os
import sys

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_pass16 as R

SEAS = R.SEAS
MK = {"player_points": "points", "player_rebounds": "rebounds", "player_assists": "assists", "player_threes": "threes_made", "player_steals": "steals", "player_blocks": "blocks", "player_turnovers": "turnovers"}
COL = R.SINGLE


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    d = pd.read_sql("""SELECT v.app, v.season, v.game_date::text gd, v.player_id, v.prop, v.line::float8 line, v.hit::int hit, v.p_blend::float8 blend, v.p_honest_baseline::float8 ph,
                              v.p_small_gbm::float8 gbm_s, g.game_id::text game_id
                       FROM nba_score.v_legs_honest v LEFT JOIN nba_stats.player_game_log g ON g.nba_player_id::text = v.player_id AND g.game_date = v.game_date
                       WHERE v.app IN ('underdog', 'prizepicks') AND v.kind = 'regular' AND v.is_under AND v.p_blend IS NOT NULL AND v.p_honest_baseline IS NOT NULL AND v.prop = ANY(%s)""",
                    conn, params=(list(COL),))
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    mc = pd.read_sql("""SELECT game_date::text gd, nba_ref.norm_name(player) nm, market_key, line::float8 line, p_over_mean::float8 po FROM nba_market.market_consensus
                        WHERE snapshot_label = 'window' AND market_key = ANY(%s) AND p_over_mean IS NOT NULL""", conn, params=(list(MK),))
    gl = pd.read_sql("""SELECT nba_player_id::text player_id, game_date::text gd, min::float8 mins, pts::float8 pts, reb::float8 reb, ast::float8 ast, fg3m::float8 fg3m, stl::float8 stl, blk::float8 blk,
                               tov::float8 tov FROM nba_stats.player_game_log WHERE game_date >= '2023-10-01' AND min > 0""", conn).drop_duplicates(["player_id", "gd"]).sort_values(["player_id", "gd"])
    conn.close()
    mc["player_id"] = mc["nm"].map(ids); mc["prop"] = mc["market_key"].map(MK); mc = mc[mc["player_id"].notna()].drop_duplicates(["gd", "player_id", "prop", "line"])
    d = d.merge(mc[["gd", "player_id", "prop", "line", "po"]], on=["gd", "player_id", "prop", "line"], how="left"); d["pb"] = 1 - d["po"]
    d["game_id"] = d["game_id"].fillna("g" + d["player_id"]); d = d[(d["app"] != "prizepicks") | (d["line"] % 1 != 0)].reset_index(drop=True)
    d["avg"] = (d["blend"] + d["ph"]) / 2; d["geo"] = np.sqrt(d["ph"] * d["pb"])
    # ---- trailing form at the leg's own line, earlier games only
    logs = {p: (g["gd"].values, g["mins"].values, {c: g[c].values for c in COL.values()}, pd.to_datetime(g["gd"]).values) for p, g in gl.groupby("player_id", sort=False)}
    n = len(d); u5 = np.full(n, np.nan); u10 = np.full(n, np.nan); u20 = np.full(n, np.nan); sh = np.full(n, np.nan); s3 = np.zeros(n, bool); lo = np.zeros(n, bool)
    mt = np.full(n, np.nan); rest = np.full(n, np.nan); npr = np.zeros(n)
    for i, (p, gd, pr, ln) in enumerate(zip(d["player_id"].values, d["gd"].values, d["prop"].values, d["line"].values)):
        L = logs.get(p)
        if L is None:
            continue
        j = np.searchsorted(L[0], gd)                       # games strictly before the leg's date
        if j == 0:
            continue
        v = L[2][COL[pr]][max(0, j - 20):j]; und = (v < ln).astype(float); npr[i] = j
        if len(v) >= 5:
            u5[i] = und[-5:].mean()
        if len(v) >= 10:
            u10[i] = und[-10:].mean()
        if len(v) >= 15:
            u20[i] = und.mean()
        sh[i] = (und.sum() + 0.55 * 8) / (len(und) + 8)
        s3[i] = len(v) >= 3 and und[-3:].all(); lo[i] = und[-1] == 0
        m = L[1][max(0, j - 10):j]
        if len(m) >= 6:
            mt[i] = m[-3:].mean() / max(1.0, m.mean())
        rest[i] = (np.datetime64(gd) - L[3][j - 1]) / np.timedelta64(1, "D")
    d["u5"] = u5; d["u10"] = u10; d["u20"] = u20; d["sh"] = sh; d["s3"] = s3; d["lo"] = lo; d["mt"] = mt; d["rest"] = rest; d["npr"] = npr
    d["ph_u10"] = (d["ph"] + d["u10"]) / 2; d["bl_sh"] = (d["blend"] + d["sh"]) / 2; d["ph_sh"] = (d["ph"] + d["sh"]) / 2; d["ph2_sh"] = (2 * d["ph"] + d["sh"]) / 3
    print(f"P18|legs {n:,}; with 10 earlier games {int(d['u10'].notna().sum()):,}; hit rate by last-10 share under the line: "
          + " | ".join(f"{a:.1f}-{b:.1f}: {100 * d[(d['u10'] >= a) & (d['u10'] < b)]['hit'].mean():.1f}% ({int(((d['u10'] >= a) & (d['u10'] < b)).sum()):,})" for a, b in ((0, .3), (.3, .5), (.5, .6), (.6, .7), (.7, .8), (.8, 1.01))), flush=True)
    print("P18|hit rate: last 3 all under " + f"{100 * d[d['s3']]['hit'].mean():.1f}% | last game over {100 * d[d['lo']]['hit'].mean():.1f}% | back-to-back {100 * d[d['rest'] == 1]['hit'].mean():.1f}% | "
          f"rest 2+ {100 * d[d['rest'] >= 2]['hit'].mean():.1f}% | minutes falling {100 * d[d['mt'] < .95]['hit'].mean():.1f}% | minutes rising {100 * d[d['mt'] > 1.05]['hit'].mean():.1f}% | all {100 * d['hit'].mean():.1f}%", flush=True)
    rankers = {"blend": "blend", "model": "ph", "average": "avg", "geo mean": "geo", "small gbm": "gbm_s", "last-10 share": "u10", "last-20 share": "u20", "shrunk last-20": "sh",
               "model + last-10": "ph_u10", "blend + shrunk": "bl_sh", "model + shrunk": "ph_sh", "model x2 + shrunk": "ph2_sh"}
    pools = {"every single stat": lambda g: np.ones(len(g), bool), "no assists": lambda g: (g["prop"] != "assists").values, "rebounds": lambda g: (g["prop"] == "rebounds").values,
             "lines under 10": lambda g: (g["line"] < 10).values, "points": lambda g: (g["prop"] == "points").values}
    layers = {"": lambda g: np.ones(len(g), bool), "last-10 share 60%+": lambda g: (g["u10"] >= .6).values, "last-10 share 70%+": lambda g: (g["u10"] >= .7).values,
              "last-10 share 50% or less": lambda g: (g["u10"] <= .5).values, "last-5 share 60%+": lambda g: (g["u5"] >= .6).values, "last-5 all under": lambda g: (g["u5"] == 1).values,
              "last-20 share 60%+": lambda g: (g["u20"] >= .6).values, "last 3 all under": lambda g: g["s3"].values, "last game over": lambda g: g["lo"].values,
              "minutes falling": lambda g: (g["mt"] < .95).values, "minutes rising": lambda g: (g["mt"] > 1.05).values, "minutes steady": lambda g: ((g["mt"] >= .95) & (g["mt"] <= 1.05)).values,
              "back-to-back": lambda g: (g["rest"] == 1).values, "rest 2+ days": lambda g: (g["rest"] >= 2).values, "20+ earlier games": lambda g: (g["npr"] >= 20).values}
    for app, TAB in (("underdog", R.UD), ("prizepicks", R.PP)):
        a = d[d["app"] == app]; out = []; tried = 0; keep = {}
        days = [(gd, g) for gd, g in a.groupby("gd", sort=True)]
        for rn, col in rankers.items():
            srt = [(gd, g[g[col].notna()].sort_values(col, ascending=False)) for gd, g in days]
            for pn, pf in pools.items():
                for ln, lf in layers.items():
                    for nth in ((1, 2, 3) if (ln == "" and rn in ("blend", "model", "average", "geo mean", "small gbm")) else (1,)):
                        acc = {key: [] for key in TAB}
                        for gd, g in srt:
                            m = pf(g) & lf(g)
                            if m.sum() < 2:
                                continue
                            gg = g[m]; pl = gg["player_id"].values; gm = gg["game_id"].values; pr = gg["prop"].values; hit = gg["hit"].values; s = gg["season"].iloc[0]
                            for (st, k), table in TAB.items():
                                skip = set(); ix = None
                                for _ in range(nth):
                                    ix = R.take_idx(pl, gm, pr, k, skip=skip)
                                    if ix is None:
                                        break
                                    skip |= {pl[i] for i in ix}
                                if ix is not None:
                                    acc[(st, k)].append((s, table.get(int(hit[ix].sum()), 0.0) - 1, gd))
                        for (st, k), rows in acc.items():
                            tried += 1
                            t = pd.DataFrame(rows, columns=["s", "u", "gd"])
                            nm = f"{k}-pick {'Flex' if st == 'F' else ('Standard' if app == 'underdog' else 'Power')} | {rn} | {pn}{' + ' + ln if ln else ''}{' | slip #' + str(nth) if nth > 1 else ''}"
                            if ln == "" and pn == "every single stat" and rn in ("blend", "model") and (st, k) == (("P", 2) if app == "underdog" else ("F", 5)):
                                keep[(rn, nth)] = t
                            if len(t) < 90:
                                continue
                            per = [t[t["s"] == s]["u"] for s in SEAS]
                            if all(len(p) >= 10 and p.sum() > 0 for p in per):
                                cum = np.concatenate([[0], np.cumsum(t.sort_values("gd")["u"].values)])
                                out.append((min(p.mean() for p in per), nm, "/".join(f"{100 * p.mean():+.0f}" for p in per), t["u"].sum(), len(t), float((np.maximum.accumulate(cum) - cum).max())))
        out.sort(key=lambda x: -x[0])
        print(f"\nP18|================ {app.upper()}: {tried:,} cells tried, {len(out)} positive in every season ================", flush=True)
        for (rn, nth), t in sorted(keep.items()):
            per = [t[t["s"] == s]["u"] for s in SEAS]
            print(f"P18|  main slip ({'2-pick Standard' if app == 'underdog' else '5-pick Flex'}) | {rn} | slip #{nth}: " + "/".join(f"{100 * p.mean():+.0f}" if len(p) else "-" for p in per) + f" | {t['u'].sum():+.1f} u on {len(t)}", flush=True)
        print("P18|  -- second / third slips positive in every season:", flush=True)
        for mn, nm, per, u, n_, dd in [o for o in out if "slip #" in o[1]][:20]:
            print(f"P18|  {nm:86s}: {per} | {u:+.1f} u on {n_} slips ({100 * u / n_:+.1f}%), drawdown {dd:.1f}", flush=True)
        print("P18|  -- trailing-form rankers and layers positive in every season:", flush=True)
        TR = ("last-", "shrunk", "last 3", "last game", "minutes", "back-to-back", "rest 2+", "20+ earlier")
        for mn, nm, per, u, n_, dd in [o for o in out if "slip #" not in o[1] and any(x in o[1] for x in TR)][:40]:
            print(f"P18|  {nm:86s}: {per} | {u:+.1f} u on {n_} slips ({100 * u / n_:+.1f}%), drawdown {dd:.1f}", flush=True)
        # C. trailing gate on the main slip's own results
        for rn in ("blend", "model"):
            t = keep.get((rn, 1))
            if t is None:
                continue
            t = t.sort_values("gd").reset_index(drop=True); u = t["u"].values
            for N in (5, 10, 20):
                tr = np.array([u[max(0, i - N):i].sum() if i >= N else np.nan for i in range(len(u))])
                for lab, mk in (("up", tr > 0), ("down", tr <= 0)):
                    x = t[mk]
                    print(f"P18|  gate | {rn} main slip | play only when its last {N} slips are {lab}: " + "/".join(f"{100 * x[x['s'] == s]['u'].mean():+.0f}" if (x['s'] == s).any() else "-" for s in SEAS)
                          + f" | {x['u'].sum():+.1f} u on {len(x)} (all: {t['u'].sum():+.1f} u on {len(t)})", flush=True)
    print("P18|DONE", flush=True)


if __name__ == "__main__":
    main()
