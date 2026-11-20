#!/usr/bin/env python3
"""
PASS 16 - THE WHOLE GRID AGAIN ON THE LIVE RULES: what else stands on PrizePicks, Underdog and Betr? READ-ONLY. (NBA_HONEST_REBUILD.md 8af; owner 2026-11-20 00:25 PT:
"Nothing stands for pp or other app? Continue with any open angle, strategies, techniques, factors/layers")
Regular single-stat Unders, one leg a player and a game, PrizePicks on half-point lines only.
  rankers  the blend | the model alone | their average
  pools    every leg | one prop (points, rebounds, assists, threes, defensive) | home | away | starters | bench | lines under 10 | 10+ | every leg a different prop
           | second team (none of the top-k players) | pairs of those (prop x home / away / starters / bench / line size)
  slips    Underdog Standard 2-6 and Flex 3-6; PrizePicks Power 2-6 and Flex 3-6; Betr Perfect 2-5 and Dynamic 3-6 on the PrizePicks / Underdog order (both Betr seasons)
A cell is listed when it has slips in all the seasons the app has and is POSITIVE IN EVERY ONE. The count of cells tried is printed: with thousands of cells some
"every season" survivors are chance - the listed ones are leads ranked by their weakest season.
Env: DATABASE_URL.
"""
import json
import os

import numpy as np
import pandas as pd
import psycopg

COMBO = ("pra", "pts_reb", "pts_ast", "reb_ast", "stocks", "fantasy_score", "double_double")
SEAS = ["2024-25", "2025-26", "2026-27"]
SINGLE = {"points": "pts", "rebounds": "reb", "assists": "ast", "threes_made": "fg3m", "steals": "stl", "blocks": "blk", "turnovers": "tov"}
MKS = {"player_points": "points", "player_rebounds": "rebounds", "player_assists": "assists", "player_threes": "threes_made", "player_steals": "steals", "player_blocks": "blocks", "player_turnovers": "turnovers"}
UD = {("P", 2): {2: 3.5}, ("P", 3): {3: 6.5}, ("P", 4): {4: 12.0}, ("P", 5): {5: 20.0}, ("P", 6): {6: 35.0}, ("F", 3): {3: 3.25, 2: 1.09}, ("F", 4): {4: 7.2, 3: 1.4}, ("F", 5): {5: 10.0, 4: 2.5},
      ("F", 6): {6: 25.0, 5: 2.6, 4: 0.25}}
PP = {("P", 2): {2: 3.0}, ("P", 3): {3: 6.0}, ("P", 4): {4: 10.0}, ("P", 5): {5: 20.0}, ("P", 6): {6: 37.5}, ("F", 3): {3: 3.0, 2: 1.0}, ("F", 4): {4: 6.0, 3: 1.5}, ("F", 5): {5: 10.0, 4: 2.0, 3: 0.4},
      ("F", 6): {6: 25.0, 5: 2.0, 4: 0.4}}


def take_idx(pl, gm, pr, k, diff_prop=False, skip=None):
    out = []; games = set(); players = set(skip or ()); props = set()
    for i in range(len(pl)):
        if gm[i] in games or pl[i] in players or (diff_prop and pr[i] in props):
            continue
        out.append(i); games.add(gm[i]); players.add(pl[i]); props.add(pr[i])
        if len(out) == k:
            return out
    return None


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    d = pd.read_sql("""SELECT v.app, v.season, v.game_date::text gd, v.player_id, v.prop, v.line::float8 line, v.hit::int hit, v.p_blend::float8 blend, v.p_honest_baseline::float8 ph,
                              g.game_id::text game_id, (g.matchup LIKE '%%vs.%%') home, r.role
                       FROM nba_score.v_legs_honest v LEFT JOIN nba_stats.player_game_log g ON g.nba_player_id::text = v.player_id AND g.game_date = v.game_date
                       LEFT JOIN (SELECT game_date, player_id, max(role_tier) role FROM nba_score.baseline_history_h GROUP BY 1, 2) r ON r.game_date = v.game_date AND r.player_id = v.player_id
                       WHERE v.app IN ('underdog', 'prizepicks') AND v.kind = 'regular' AND v.is_under AND v.p_blend IS NOT NULL AND v.p_honest_baseline IS NOT NULL AND v.prop <> ALL(%s)""",
                    conn, params=(list(COMBO),))
    BR = conn.execute("SELECT rule_json FROM nba_config.pp_slip_rules WHERE rule_key='betr_payout_v1'").fetchone()[0]; BR = BR if isinstance(BR, dict) else json.loads(BR)
    gl = pd.read_sql("""SELECT nba_player_id::text player_id, game_date::text gd, pts::float8 pts, reb::float8 reb, ast::float8 ast, fg3m::float8 fg3m, stl::float8 stl, blk::float8 blk, tov::float8 tov
                        FROM nba_stats.player_game_log WHERE game_date >= '2025-10-01' AND min > 0""", conn).drop_duplicates(["player_id", "gd"])
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    bb = pd.read_sql("""SELECT DISTINCT game_date::text gd, nba_ref.norm_name(player) nm, market_key mk, line::float8 line FROM nba_market.board_snapshots
                        WHERE bookmaker IN ('betr_us_dfs', 'betr') AND snapshot_label = 'window' AND game_date < current_date AND market_key = ANY(%s) AND lower(left(side, 1)) NOT IN ('o', 'm', 'h')""",
                     conn, params=(list(MKS),))
    conn.close()
    d["game_id"] = d["game_id"].fillna("g" + d["player_id"]); d = d[(d["app"] != "prizepicks") | (d["line"] % 1 != 0)].copy()
    d["avg"] = (d["blend"] + d["ph"]) / 2; d["starter"] = d["role"].astype(str).str.contains("START"); d["home"] = d["home"].fillna(False).astype(bool)
    bb["player_id"] = bb["nm"].map(ids); bb["prop"] = bb["mk"].map(MKS); bb = bb[bb["player_id"].notna()].drop_duplicates(["gd", "player_id", "prop"]).merge(gl, on=["player_id", "gd"], how="inner")
    stat = np.full(len(bb), np.nan)
    for p_, c_ in SINGLE.items():
        k_ = (bb["prop"] == p_).values; stat[k_] = bb.loc[k_, c_].values
    bb["stat"] = stat; bb = bb[bb["stat"] != bb["line"]]; betr = {(g, p, r): int(s < ln) for g, p, r, s, ln in zip(bb["gd"], bb["player_id"], bb["prop"], bb["stat"], bb["line"])}
    print(f"P16|Betr Unders graded on Betr's own line: {len(betr):,} on {bb['gd'].nunique()} slates ({bb[bb['gd'] < '2026-08-01']['gd'].nunique()} in 2025-26, {bb[bb['gd'] > '2026-08-01']['gd'].nunique()} in 2026-27)", flush=True)
    DEF = ("steals", "blocks", "turnovers")
    base = {"every leg": lambda g: np.ones(len(g), bool), "points": lambda g: (g["prop"] == "points").values, "rebounds": lambda g: (g["prop"] == "rebounds").values,
            "assists": lambda g: (g["prop"] == "assists").values, "threes": lambda g: (g["prop"] == "threes_made").values, "defensive props": lambda g: g["prop"].isin(DEF).values,
            "points + rebounds": lambda g: g["prop"].isin(["points", "rebounds"]).values, "no assists": lambda g: (g["prop"] != "assists").values}
    layer = {"": lambda g: np.ones(len(g), bool), "home": lambda g: g["home"].values, "away": lambda g: ~g["home"].values, "starters": lambda g: g["starter"].values, "bench": lambda g: ~g["starter"].values,
             "lines under 10": lambda g: (g["line"] < 10).values, "lines 10+": lambda g: (g["line"] >= 10).values}
    for app, TAB in (("underdog", UD), ("prizepicks", PP)):
        a = d[d["app"] == app]; out = []; tried = 0
        days = [(gd, g) for gd, g in a.groupby("gd", sort=True)]
        for rk in ("blend", "ph", "avg"):
            srt = [(gd, g.sort_values(rk, ascending=False)) for gd, g in days]
            for bn, bf in base.items():
                for ln, lf in layer.items():
                    for mode in ("", "different props", "second team"):
                        if mode == "different props" and bn not in ("every leg", "points + rebounds", "no assists"):
                            continue
                        acc = {key: [] for key in TAB}
                        for gd, g in srt:
                            m = bf(g) & lf(g)
                            if m.sum() < 2:
                                continue
                            gg = g[m]; pl = gg["player_id"].values; gm = gg["game_id"].values; pr = gg["prop"].values; hit = gg["hit"].values; s = g["season"].iloc[0]
                            for (st, k), table in TAB.items():
                                skip = None
                                if mode == "second team":
                                    t0 = take_idx(pl, gm, pr, k)
                                    if t0 is None:
                                        continue
                                    skip = {pl[i] for i in t0}
                                ix = take_idx(pl, gm, pr, k, diff_prop=(mode == "different props"), skip=skip)
                                if ix is not None:
                                    acc[(st, k)].append((s, table.get(int(hit[ix].sum()), 0.0) - 1, gd, tuple((pl[i], pr[i]) for i in ix)))
                        for (st, k), rows in acc.items():
                            tried += 1
                            t = pd.DataFrame(rows, columns=["s", "u", "gd", "legs"])
                            if len(t) < 120:
                                continue
                            per = [t[t["s"] == s]["u"] for s in SEAS]
                            if all(len(p) >= 12 and p.sum() > 0 for p in per):
                                cum = np.concatenate([[0], np.cumsum(t.sort_values("gd")["u"].values)])
                                out.append((min(p.mean() for p in per), f"{k}-pick {'Flex' if st == 'F' else ('Standard' if app == 'underdog' else 'Power')} | {rk} | {bn}{' + ' + ln if ln else ''}{' | ' + mode if mode else ''}",
                                            "/".join(f"{100 * p.mean():+.0f}" for p in per), t["u"].sum(), len(t), float((np.maximum.accumulate(cum) - cum).max()), t))
        out.sort(key=lambda x: -x[0])
        print(f"\nP16|================ {app.upper()}: {tried:,} cells tried, {len(out)} positive in every season (listed by their weakest season) ================", flush=True)
        seen = []
        for mn, nm, per, u, n, dd, t in out[:40]:
            print(f"P16|  {nm:78s}: {per} | {u:+.1f} u on {n} slips ({100 * u / n:+.1f}%), drawdown {dd:.1f}", flush=True)
        # Betr on this app's order: Perfect 2-5, Dynamic 3-6 (all Less)
        for rk in ("blend", "ph"):
            for bn in ("every leg", "rebounds", "points + rebounds"):
                cells = []
                for stn, ks in (("perfect", (2, 3, 4, 5)), ("dynamic", (3, 4, 5, 6))):
                    for k in ks:
                        rows = []
                        for gd, g in days:
                            if gd < "2025-10-01":
                                continue
                            g = g[base[bn](g)].sort_values(rk, ascending=False)
                            g = g[np.array([(gd, p, r) in betr for p, r in zip(g["player_id"], g["prop"])], dtype=bool)]
                            ix = take_idx(g["player_id"].values, g["game_id"].values, g["prop"].values, k)
                            if ix is None:
                                continue
                            h = sum(betr[(gd, g["player_id"].values[i], g["prop"].values[i])] for i in ix)
                            pay = (float(BR["perfect_all_less"].get(str(k), 0.0)) if h == k else 0.0) if stn == "perfect" else float((BR["dynamic_all_less"].get(str(k)) or {}).get(str(h), 0.0))
                            rows.append((g["season"].iloc[0], pay - 1))
                        t = pd.DataFrame(rows, columns=["s", "u"])
                        if len(t):
                            cells.append(f"{k}{'P' if stn == 'perfect' else 'D'} " + "/".join(f"{100 * x['u'].mean():+.0f}" if len(x) else "-" for x in (t[t['s'] == s] for s in SEAS[1:])) + f" ({t['u'].sum():+.0f} u, {len(t)})")
                print(f"P16|  BETR on {app}'s order, {rk}, {bn} (2025-26 / 2026-27): " + " | ".join(cells), flush=True)
    print("P16|DONE", flush=True)


if __name__ == "__main__":
    main()
