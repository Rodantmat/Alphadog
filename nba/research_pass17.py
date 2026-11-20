#!/usr/bin/env python3
"""
PASS 17 - OTHER WAYS TO RANK. READ-ONLY. (NBA_HONEST_REBUILD.md 8ag; owner 2026-11-20 00:37 PT "Keep running different strategies, ranks and everything possible")
Until now three rankers: the blend, the model alone, their average. Here, on the same legs (regular Unders, PrizePicks half-point lines), one leg a player and a game:
  book          the sportsbooks' chance alone                         small gbm     the small tree model of phase B
  agree         the LOWER of model and sportsbook (both must like it)  model - book  where the model is most above the sportsbooks (disagreement)
  book - model  where the sportsbooks are most above the model         rank sum      the sum of the leg's ranks under model and sportsbook
  model x2      average of model (weight 2) and sportsbook             geo           geometric mean of model and sportsbook
pools: every single stat | no assists | rebounds | lines under 10 | combo props (pra, pts+reb, pts+ast, reb+ast) | every prop
Rankers that need the sportsbook number use only legs that have one at the exact line.
A cell is listed when positive in every season; cells tried are counted.
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
MK = {"player_points": "points", "player_rebounds": "rebounds", "player_assists": "assists", "player_threes": "threes_made", "player_steals": "steals", "player_blocks": "blocks",
      "player_turnovers": "turnovers", "player_points_rebounds_assists": "pra", "player_points_rebounds": "pts_reb", "player_points_assists": "pts_ast", "player_rebounds_assists": "reb_ast"}
CMB = ("pra", "pts_reb", "pts_ast", "reb_ast")


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    d = pd.read_sql("""SELECT v.app, v.season, v.game_date::text gd, v.player_id, v.prop, v.line::float8 line, v.hit::int hit, v.p_blend::float8 blend, v.p_honest_baseline::float8 ph,
                              v.p_small_gbm::float8 gbm_s, g.game_id::text game_id
                       FROM nba_score.v_legs_honest v LEFT JOIN nba_stats.player_game_log g ON g.nba_player_id::text = v.player_id AND g.game_date = v.game_date
                       WHERE v.app IN ('underdog', 'prizepicks') AND v.kind = 'regular' AND v.is_under AND v.p_blend IS NOT NULL AND v.p_honest_baseline IS NOT NULL AND v.prop = ANY(%s)""",
                    conn, params=(list(MK.values()),))
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    mc = pd.read_sql("""SELECT game_date::text gd, nba_ref.norm_name(player) nm, market_key, line::float8 line, p_over_mean::float8 po FROM nba_market.market_consensus
                        WHERE snapshot_label = 'window' AND market_key = ANY(%s) AND p_over_mean IS NOT NULL""", conn, params=(list(MK),))
    conn.close()
    mc["player_id"] = mc["nm"].map(ids); mc["prop"] = mc["market_key"].map(MK); mc = mc[mc["player_id"].notna()].drop_duplicates(["gd", "player_id", "prop", "line"])
    d = d.merge(mc[["gd", "player_id", "prop", "line", "po"]], on=["gd", "player_id", "prop", "line"], how="left"); d["pb"] = 1 - d["po"]
    d["game_id"] = d["game_id"].fillna("g" + d["player_id"]); d = d[(d["app"] != "prizepicks") | (d["line"] % 1 != 0)].copy()
    d["agree"] = np.minimum(d["ph"], d["pb"]); d["m_b"] = d["ph"] - d["pb"]; d["b_m"] = d["pb"] - d["ph"]; d["mx2"] = (2 * d["ph"] + d["pb"]) / 3; d["geo"] = np.sqrt(d["ph"] * d["pb"])
    d["rs"] = -(d.groupby(["app", "gd"])["ph"].rank(ascending=False) + d.groupby(["app", "gd"])["pb"].rank(ascending=False))
    rankers = {"book": "pb", "small gbm": "gbm_s", "agree (lower of model and book)": "agree", "model - book": "m_b", "book - model": "b_m", "rank sum": "rs", "model x2 + book": "mx2", "geo mean": "geo",
               "blend (reference)": "blend", "model (reference)": "ph"}
    pools = {"every single stat": lambda g: ~g["prop"].isin(CMB), "no assists": lambda g: ~g["prop"].isin(CMB + ("assists",)), "rebounds": lambda g: g["prop"] == "rebounds",
             "lines under 10": lambda g: (~g["prop"].isin(CMB)) & (g["line"] < 10), "combo props": lambda g: g["prop"].isin(CMB), "every prop": lambda g: g["prop"] == g["prop"]}
    for app, TAB in (("underdog", R.UD), ("prizepicks", R.PP)):
        a = d[d["app"] == app]; out = []; tried = 0; ref = {}
        for rn, col in rankers.items():
            x = a[a[col].notna()].sort_values(col, ascending=False)
            for pn, pf in pools.items():
                xx = x[pf(x).values]; acc = {key: [] for key in TAB}
                for gd, g in xx.groupby("gd", sort=True):
                    pl = g["player_id"].values; gm = g["game_id"].values; pr = g["prop"].values; hit = g["hit"].values; s = g["season"].iloc[0]
                    for (st, k), table in TAB.items():
                        ix = R.take_idx(pl, gm, pr, k)
                        if ix is not None:
                            acc[(st, k)].append((s, table.get(int(hit[ix].sum()), 0.0) - 1, gd))
                for (st, k), rows in acc.items():
                    tried += 1
                    t = pd.DataFrame(rows, columns=["s", "u", "gd"])
                    if len(t) < 100:
                        continue
                    per = [t[t["s"] == s]["u"] for s in SEAS]
                    nm = f"{k}-pick {'Flex' if st == 'F' else ('Standard' if app == 'underdog' else 'Power')} | {rn} | {pn}"
                    if all(len(p) >= 10 and p.sum() > 0 for p in per):
                        cum = np.concatenate([[0], np.cumsum(t.sort_values("gd")["u"].values)])
                        out.append((min(p.mean() for p in per), nm, "/".join(f"{100 * p.mean():+.0f}" for p in per), t["u"].sum(), len(t), float((np.maximum.accumulate(cum) - cum).max())))
                    if pn == "every single stat" and (st, k) in ((("P", 2), ("F", 5))[app == "prizepicks"],):
                        ref[rn] = "/".join(f"{100 * p.mean():+.0f}" if len(p) else "-" for p in per) + f" ({t['u'].sum():+.0f} u, {len(t)})"
        out.sort(key=lambda x: -x[0])
        print(f"\nP17|================ {app.upper()}: {tried:,} cells tried, {len(out)} positive in every season ================", flush=True)
        print("P17|  every ranker on the app's main slip (" + ("2-pick Standard" if app == "underdog" else "5-pick Flex") + ", every single stat): " + " | ".join(f"{k}: {v}" for k, v in ref.items()), flush=True)
        for mn, nm, per, u, n, dd in out[:32]:
            if "(reference)" in nm:
                continue
            print(f"P17|  {nm:74s}: {per} | {u:+.1f} u on {n} slips ({100 * u / n:+.1f}%), drawdown {dd:.1f}", flush=True)
    print("P17|DONE", flush=True)


if __name__ == "__main__":
    main()
