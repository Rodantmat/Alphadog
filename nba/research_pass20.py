#!/usr/bin/env python3
"""
PASS 20 - NEW FACTORS: GAME ENVIRONMENT, OPPONENT, VOLATILITY. READ-ONLY. (NBA_HONEST_REBUILD.md 8ai; owner 2026-11-20 10:37 PT: "New points of views, new techniques,
new factors, new trailings, new ranks, everything")
Same legs as the live set (regular single-stat Unders, PrizePicks half-point lines). Everything is known before the game:
  game environment  MORNING sportsbook game lines: game total, the team's spread (favourite / underdog / close game), the team's implied points
  opponent          what the opponent ALLOWED in this stat over its last 15 games against the league (soft / tough), the opponent's and the team's pace (last 15)
  volatility        the player's last-20 spread of this stat against its mean (steady / volatile); z = (line - last-20 mean) / spread, also as a RANKER
  line against form line / last-20 mean (line set high or low against what he has been doing)
Each factor is cut in thirds (low / middle / high) and judged the pass-19 way: hit rate of the legs the slip uses, every structure, against NO layer. Leg-level hit rates first.
Line format: structure pooled-return%(seasons positive of 3).
Env: DATABASE_URL.
"""
import os
import sys

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_pass16 as R
import research_pass18 as P18
import research_pass19 as P19

COL = R.SINGLE


def main():
    d = P18.load(); d["avg"] = (d["blend"] + d["ph"]) / 2
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    pg = pd.read_sql("""SELECT nba_player_id::text player_id, game_date::text gd, game_id::text game_id, split_part(matchup, ' ', 1) tri, split_part(matchup, ' ', 3) opp, min::float8 mins,
                               pts::float8 pts, reb::float8 reb, ast::float8 ast, fg3m::float8 fg3m, stl::float8 stl, blk::float8 blk, tov::float8 tov
                        FROM nba_stats.player_game_log WHERE game_date >= '2023-10-01' AND min > 0""", conn).drop_duplicates(["player_id", "gd"]).sort_values(["player_id", "gd"])
    tg = pd.read_sql("""SELECT t.game_id::text game_id, t.game_date::text gd, t.season, split_part(t.matchup, ' ', 1) tri, t.pts::float8 pts, t.reb::float8 reb, t.ast::float8 ast, t.fg3m::float8 fg3m,
                               t.stl::float8 stl, t.blk::float8 blk, t.tov::float8 tov, a.pace::float8 pace
                        FROM nba_team.team_game_log t LEFT JOIN nba_team.team_game_log_advanced a ON a.team_id = t.team_id AND a.game_id = t.game_id""", conn).drop_duplicates(["game_id", "tri"])
    teams = dict(conn.execute("SELECT full_name, abbreviation FROM nba_ref.teams").fetchall())
    gl = pd.read_sql("""SELECT game_date::text gd, home_team, away_team, bookmaker, market, outcome, point::float8 point FROM nba_market.game_lines_snapshots
                        WHERE snapshot_label = 'morning' AND point IS NOT NULL AND (market ILIKE '%%total%%' OR market ILIKE '%%spread%%')""", conn)
    conn.close()
    # ---- opponent allowed, pace: last 15 games before the date
    o = tg.merge(tg, on="game_id", suffixes=("", "_o")); o = o[o["tri"] != o["tri_o"]].sort_values(["tri", "gd"])
    for c in COL.values():
        o[f"al_{c}"] = o.groupby("tri")[f"{c}_o"].transform(lambda s: s.shift(1).rolling(15, min_periods=8).mean())
        o[f"al_{c}"] = o[f"al_{c}"] / o.groupby("season")[f"{c}_o"].transform("mean") - 1
    o["pace15"] = o.groupby("tri")["pace"].transform(lambda s: s.shift(1).rolling(15, min_periods=8).mean())
    T = o.set_index(["gd", "tri"])
    # ---- morning game lines
    gl["home"] = gl["home_team"].map(teams); gl["away"] = gl["away_team"].map(teams); gl = gl[gl["home"].notna() & gl["away"].notna()]
    tot = gl[gl["market"].str.contains("total", case=False) & gl["outcome"].str.lower().str.startswith("o")].groupby(["gd", "home", "away"])["point"].median().rename("tot")
    sp = gl[gl["market"].str.contains("spread", case=False) & (gl["outcome"] == gl["home_team"])].groupby(["gd", "home", "away"])["point"].median().rename("hs")
    G = pd.concat([tot, sp], axis=1).reset_index()
    env = {}
    for gd, h, a, t, s in zip(G["gd"], G["home"], G["away"], G["tot"], G["hs"]):
        env[(gd, h)] = (t, s); env[(gd, a)] = (t, -s if s == s else np.nan)
    # ---- per leg
    info = {(p, g): (t, op) for p, g, t, op in zip(pg["player_id"], pg["gd"], pg["tri"], pg["opp"])}
    logs = {p: (g["gd"].values, {c: g[c].values for c in COL.values()}) for p, g in pg.groupby("player_id", sort=False)}
    n = len(d); F = {k: np.full(n, np.nan) for k in ("tot", "spr", "itt", "opp_allow", "opp_pace", "team_pace", "cv", "z", "ratio")}
    for i, (p, gd, pr, ln) in enumerate(zip(d["player_id"].values, d["gd"].values, d["prop"].values, d["line"].values)):
        io = info.get((p, gd))
        if io is not None:
            e = env.get((gd, io[0]))
            if e is not None:
                F["tot"][i] = e[0]; F["spr"][i] = e[1]; F["itt"][i] = e[0] / 2 - e[1] / 2
            for key, tri, col in (("opp_allow", io[1], f"al_{COL[pr]}"), ("opp_pace", io[1], "pace15"), ("team_pace", io[0], "pace15")):
                try:
                    F[key][i] = T.at[(gd, tri), col]
                except KeyError:
                    pass
        L = logs.get(p)
        if L is not None:
            j = np.searchsorted(L[0], gd); v = L[1][COL[pr]][max(0, j - 20):j]
            if len(v) >= 10:
                m = v.mean(); sd = v.std()
                if m > 0:
                    F["cv"][i] = sd / m; F["ratio"][i] = ln / m
                if sd > 0:
                    F["z"][i] = (ln - m) / sd
    for k, v in F.items():
        d[k] = v
    NAME = {"tot": "game total", "spr": "team spread (low = favourite)", "itt": "team implied points", "opp_allow": "opponent allows this stat", "opp_pace": "opponent pace", "team_pace": "team pace",
            "cv": "player volatility in this stat", "z": "line above his last-20 mean (in spreads)", "ratio": "line / last-20 mean"}
    L = {"none": None}
    print(f"P20|legs {n:,}; with morning game lines {int(d['tot'].notna().sum()):,}; with opponent form {int(d['opp_allow'].notna().sum()):,}; with last-20 form {int(d['z'].notna().sum()):,}", flush=True)
    for k, nm in NAME.items():
        q1, q2 = d[k].quantile([1 / 3, 2 / 3]).values
        for lab, m in (("low", d[k] <= q1), ("middle", (d[k] > q1) & (d[k] <= q2)), ("high", d[k] > q2)):
            d[f"{k}_{lab}"] = m.fillna(False).values; L[f"{nm}: {lab}"] = f"{k}_{lab}"
        print(f"P20|leg hit rate | {nm:42s} (cuts {q1:.2f} / {q2:.2f}): " + " | ".join(
            f"{app[:2].upper()} low {100 * a[a[k] <= q1]['hit'].mean():.1f} mid {100 * a[(a[k] > q1) & (a[k] <= q2)]['hit'].mean():.1f} high {100 * a[a[k] > q2]['hit'].mean():.1f}"
            f" ; top-10-a-day by the blend: low {100 * b[b[k] <= q1]['hit'].mean():.1f} mid {100 * b[(b[k] > q1) & (b[k] <= q2)]['hit'].mean():.1f} high {100 * b[b[k] > q2]['hit'].mean():.1f}"
            for app, a, b in ((ap, d[d["app"] == ap], d[d["app"] == ap].sort_values("blend", ascending=False).groupby("gd").head(10)) for ap in ("underdog", "prizepicks"))), flush=True)
    for lab, m in (("favourite by 6+", d["spr"] <= -6), ("underdog by 6+", d["spr"] >= 6), ("close game (under 4)", d["spr"].abs() < 4)):
        d[f"S_{lab}"] = m.fillna(False).values; L[lab] = f"S_{lab}"
    d["zrank"] = d["z"]; d["avg_z"] = d.groupby(["app", "gd"])["avg"].rank(pct=True) + d.groupby(["app", "gd"])["z"].rank(pct=True)
    pools = {"every single stat": lambda g: np.ones(len(g), bool), "no assists": lambda g: (g["prop"] != "assists").values, "lines under 10": lambda g: (g["line"] < 10).values}
    for app, TAB in (("underdog", R.UD), ("prizepicks", R.PP)):
        a = d[d["app"] == app]
        print(f"\nP20|================ {app.upper()} ================", flush=True)
        for rn, col in (("blend", "blend"), ("average", "avg"), ("z ranker (line furthest above his form)", "zrank"), ("average + z (rank sum)", "avg_z")):
            for pn, pf in pools.items():
                x = a[pf(a) & a[col].notna().values]
                days = [(gd, g.sort_values(col, ascending=False)) for gd, g in x.groupby("gd", sort=True)]
                print(f"P20|-- {rn} | {pn}", flush=True)
                for ln, mc in (L.items() if col in ("blend", "avg") else [("none", None)]):
                    if pn == "lines under 10" and mc is not None:
                        continue
                    res, hr = P19.run(days, mc, TAB)
                    print(f"P20|   {ln:50s}: {P19.line(res, app)} | legs of the 6-pick hit {100 * hr:.1f}%", flush=True)
    print("P20|DONE", flush=True)


if __name__ == "__main__":
    main()
