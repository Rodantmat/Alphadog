#!/usr/bin/env python3
"""
PASS 15 - SECOND IMPROVEMENT BATCH. READ-ONLY. (NBA_HONEST_REBUILD.md 8ae; owner 2026-11-20 00:13 PT "Continue")
  A. MORNING FILTERS (this season; the apps' morning boards are stored): the live slips without Unders whose line dropped since the morning / that were not
     on the morning board.
  B. UNDERDOG 3-PICKS for bonus money (bonuses need 3-pick entries): Standard and Flex, by the blend, by the model, different props, top 2 + best rebounds.
  C. STAKE BY STRATEGY, decided on EARLIER seasons only: double stake on the strategies whose earlier-season ROI is above the app's median, against flat.
  D. A SECOND SLIP FROM THE NEXT GAME WINDOW: the slate split into early and late games (by the player's game start order), the top legs of each half.
PrizePicks: half-point lines only (the live rule).
Env: DATABASE_URL.
"""
import os

import numpy as np
import pandas as pd
import psycopg

COMBO = ("pra", "pts_reb", "pts_ast", "reb_ast", "stocks", "fantasy_score", "double_double")
MK = {"player_points": "points", "player_rebounds": "rebounds", "player_assists": "assists", "player_threes": "threes_made", "player_steals": "steals", "player_blocks": "blocks", "player_turnovers": "turnovers"}
SEAS = ["2024-25", "2025-26", "2026-27"]
PAY = {("underdog", 2, "P"): {2: 3.5}, ("underdog", 3, "P"): {3: 6.5}, ("underdog", 3, "F"): {3: 3.25, 2: 1.09}, ("prizepicks", 3, "P"): {3: 6.0}, ("prizepicks", 4, "F"): {4: 6.0, 3: 1.5},
       ("prizepicks", 5, "F"): {5: 10.0, 4: 2.0, 3: 0.4}, ("prizepicks", 6, "F"): {6: 25.0, 5: 2.0, 4: 0.4}}


def per(rows):
    t = pd.DataFrame(rows, columns=["s", "u"])
    if not len(t):
        return "no slips"
    return " / ".join(f"{100 * x['u'].mean():+.0f}% ({x['u'].sum():+.1f} u, {len(x)})" if len(x) else "-" for x in (t[t["s"] == s] for s in SEAS)) + f" | total {t['u'].sum():+.1f} u, {100 * t['u'].mean():+.1f}%"


def take(g, k, diff_prop=False, skip=()):
    out = []; games = set(); players = set(skip); props = set()
    for i, (pl, game, pr) in enumerate(zip(g["player_id"].values, g["game_id"].values, g["prop"].values)):
        if game in games or pl in players or (diff_prop and pr in props):
            continue
        out.append(i); games.add(game); players.add(pl); props.add(pr)
        if len(out) == k:
            return g.iloc[out]
    return None


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    d = pd.read_sql("""SELECT v.app, v.season, v.game_date::text gd, v.player_id, v.prop, v.line::float8 line, v.hit::int hit, v.p_blend::float8 blend, v.p_honest_baseline::float8 ph,
                              g.game_id::text game_id, (g.matchup LIKE '%%vs.%%') home, r.role
                       FROM nba_score.v_legs_honest v LEFT JOIN nba_stats.player_game_log g ON g.nba_player_id::text = v.player_id AND g.game_date = v.game_date
                       LEFT JOIN (SELECT game_date, player_id, max(role_tier) role FROM nba_score.baseline_history_h GROUP BY 1, 2) r ON r.game_date = v.game_date AND r.player_id = v.player_id
                       WHERE v.app IN ('underdog', 'prizepicks') AND v.kind = 'regular' AND v.is_under AND v.p_blend IS NOT NULL AND v.prop <> ALL(%s)""", conn, params=(list(COMBO),))
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    mv = pd.read_sql("""SELECT 'underdog' app, game_date::text gd, nba_ref.norm_name(player) nm, market_key, max(line)::float8 line FROM nba_market.board_snapshots
                        WHERE bookmaker = 'underdog' AND game_date >= '2026-10-20' AND game_date < current_date AND snapshot_label = 'morning' AND market_key = ANY(%s)
                          AND lower(left(side, 1)) = 'u' AND coalesce(multiplier, 1) = 1 GROUP BY 2, 3, 4
                        UNION ALL SELECT 'prizepicks', game_date::text, nm, base_market, max(line)::float8 FROM nba_market.pp_leg_price
                        WHERE game_date >= '2026-10-20' AND game_date < current_date AND snapshot_label = 'morning' AND base_market = ANY(%s) AND kind = 'standard' GROUP BY 2, 3, 4""",
                     conn, params=(list(MK), list(MK)))
    tips = pd.read_sql("SELECT game_id::text game_id, min(game_datetime_utc) tip FROM nba_calendar.slate_games GROUP BY 1", conn) if True else None
    conn.close()
    d["game_id"] = d["game_id"].fillna("g" + d["player_id"]); d = d[(d["app"] != "prizepicks") | (d["line"] % 1 != 0)]
    mv["player_id"] = mv["nm"].map(ids); mv["prop"] = mv["market_key"].map(MK)
    am = mv[mv["player_id"].notna()].drop_duplicates(["app", "gd", "player_id", "prop"]).set_index(["app", "gd", "player_id", "prop"])["line"]
    ml = am.reindex(pd.MultiIndex.from_frame(d[["app", "gd", "player_id", "prop"]])).values
    d["mv"] = np.where(np.isnan(ml), "new", np.where(d["line"].values > ml + 1e-9, "up", np.where(d["line"].values < ml - 1e-9, "down", "same")))
    d["starter"] = d["role"].astype(str).str.contains("START"); d = d.sort_values("blend", ascending=False)
    L = {(a, gd): g for (a, gd), g in d.groupby(["app", "gd"], sort=False)}

    def run(app, k, st, sel, **kw):
        rows = []
        for (a, gd), g in L.items():
            if a != app:
                continue
            gg = sel(g)
            t = take(gg, k, **kw) if gg is not None and len(gg) else None
            if t is not None:
                rows.append((g["season"].iloc[0], PAY[(app, k, st)].get(int(t["hit"].sum()), 0.0) - 1, gd))
        return rows

    print("P15|================ A. MORNING FILTERS (this season only) ================", flush=True)
    for app, k, st in (("underdog", 2, "P"), ("prizepicks", 3, "P"), ("prizepicks", 5, "F"), ("prizepicks", 6, "F")):
        for nm, f in (("as live", lambda g: g), ("without lines that dropped since the morning", lambda g: g[g["mv"] != "down"]), ("only legs that were on the morning board", lambda g: g[g["mv"] != "new"]),
                      ("on the morning board and not dropped", lambda g: g[g["mv"].isin(["same", "up"])]), ("unchanged since the morning only", lambda g: g[g["mv"] == "same"])):
            r = [(s, u) for s, u, gd in run(app, k, st, f) if s == "2026-27"]
            print(f"P15|  {app} {k}-pick {'Flex' if st == 'F' else 'Std/Power'} {nm:46s}: {len(r)} slips, {np.sum([u for _, u in r]):+.1f} u, {100 * np.mean([u for _, u in r]) if r else 0:+.0f}%", flush=True)

    print("\nP15|================ B. UNDERDOG 3-PICKS (for bonus entries); ROI 2024-25 / 2025-26 / 2026-27 ================", flush=True)
    for st in ("P", "F"):
        for nm, f, kw in (("top 3 by the blend", lambda g: g, {}), ("top 3 by the model", lambda g: g.sort_values("ph", ascending=False), {}), ("top 3, different props", lambda g: g, dict(diff_prop=True)),
                          ("top 3 by the model, different props", lambda g: g.sort_values("ph", ascending=False), dict(diff_prop=True)), ("top 3 home players", lambda g: g[g["home"] == True], {}),  # noqa: E712
                          ("top 3 rebounds", lambda g: g[g["prop"] == "rebounds"], {}), ("top 3 lines under 10", lambda g: g[g["line"] < 10], {}),
                          ("top 2 + the best rebounds leg", lambda g: pd.concat([g.iloc[:0], take(g, 2) if take(g, 2) is not None else g.iloc[:0], g[g["prop"] == "rebounds"]]), {})):
            r = run("underdog", 3, st, f, **kw)
            t = pd.DataFrame(r, columns=["s", "u", "gd"]).sort_values("gd"); cum = np.concatenate([[0], np.cumsum(t["u"].values)]) if len(t) else np.array([0.0])
            print(f"P15|  3-pick {'Standard' if st == 'P' else 'Flex    '} {nm:38s}: {per([(s, u) for s, u, _ in r])}, drawdown {(np.maximum.accumulate(cum) - cum).max():.1f}", flush=True)

    print("\nP15|================ C. STAKE BY STRATEGY, weights from EARLIER seasons only (2x where the earlier ROI is above the app's median) ================", flush=True)
    codes = {"underdog": {"U1": (2, "P", lambda g: g, {}), "U2": (2, "P", lambda g: g.sort_values("ph", ascending=False), {}), "U4": (2, "P", lambda g: g[g["prop"] == "rebounds"], {}),
                          "U5": (2, "P", lambda g: g[g["home"] == True], {})},  # noqa: E712
             "prizepicks": {"P1": (5, "F", lambda g: g, dict(diff_prop=True)), "P2": (5, "F", lambda g: g[g["line"] < 10], {}), "P3": (5, "F", lambda g: g, {}), "P4": (5, "F", lambda g: g[g["home"] == True], {}),  # noqa: E712
                            "P5": (6, "F", lambda g: g, {}), "P6": (6, "F", lambda g: g, dict(diff_prop=True)), "P7": (6, "F", lambda g: g[~g["starter"]], {}), "P9": (4, "F", lambda g: g, {}),
                            "P10": (3, "P", lambda g: g, {})}}
    for app, cs in codes.items():
        res = {c: pd.DataFrame(run(app, k, st, f, **kw), columns=["s", "u", "gd"]) for c, (k, st, f, kw) in cs.items()}
        for i, s in enumerate(SEAS[1:], start=1):
            prior = {c: t[t["s"].isin(SEAS[:i])]["u"].mean() for c, t in res.items()}; med = np.median(list(prior.values()))
            flat = sum(t[t["s"] == s]["u"].sum() for t in res.values()); nflat = sum((t["s"] == s).sum() for t in res.values())
            w = {c: (2.0 if prior[c] > med else 1.0) for c in res}
            wu = sum(w[c] * t[t["s"] == s]["u"].sum() for c, t in res.items()); wn = sum(w[c] * (t["s"] == s).sum() for c, t in res.items())
            drop = {c: (1.0 if prior[c] > med else 0.0) for c in res}
            du = sum(drop[c] * t[t["s"] == s]["u"].sum() for c, t in res.items()); dn = sum(drop[c] * (t["s"] == s).sum() for c, t in res.items())
            print(f"P15|  {app} {s}: flat {flat:+.1f} u on {nflat} stakes ({100 * flat / max(1, nflat):+.1f}%) | 2x on " + ",".join(c for c in res if w[c] > 1) + f": {wu:+.1f} u on {wn:.0f} stakes ({100 * wu / max(1, wn):+.1f}%)"
                  f" | only those: {du:+.1f} u on {dn:.0f} ({100 * du / max(1, dn):+.1f}%)", flush=True)
    print("P15|DONE", flush=True)


if __name__ == "__main__":
    main()
