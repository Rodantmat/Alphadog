#!/usr/bin/env python3
"""
PASS 4 - "AS PLACED": THE CANDIDATE ON THE UNFILTERED BOARD, WITH PUSHES. READ-ONLY. (NBA_HONEST_REBUILD.md 8w)
Owner 2026-11-19 20:48 PT: "the numbers ... have been properly backtested and proved with real legs, real boards, real generated slips with graded legs? They
need to." The leg tables of this rebuild keep only legs with a win / loss result: a leg that ended EXACTLY on its line (a push) is not in them, so a slip
built from them never contains a push. In the app it can. This script rebuilds the candidate from the raw pick-time board of regular lines - every leg a
player could have tapped - grades each leg win / loss / push from the box score, and pays each slip by the app's own rule:
  underdog    a push drops the leg: 2-pick -> refund ; 3-pick Flex -> 2-pick Standard 3.5x ; 3-pick Standard -> 2-pick Standard
  prizepicks  a push drops the leg: 4-pick Flex -> 3-pick Flex (3x / 1x) ; 3-pick Power -> 2-pick Power 3x ; 2-pick -> refund ; 5-pick Flex -> 4-pick Flex
Ranking here is the certified honest baseline (it exists for pushed legs too; the blend is stored only for graded legs). Each structure is reported twice,
same ranker: (a) pushes excluded before ranking = how the battery counted, (b) pushes left in and paid by the rule = as placed. The difference is the cost of
pushes; it is then applied to the blend's numbers. Also: how many board legs belong to players who did not play (void in the app; the history has no
number for them, so they cannot be ranked - reported as a share).
Env: DATABASE_URL.
"""
import os

import numpy as np
import pandas as pd
import psycopg

import research_legs_h_build as LH

SINGLE = {"points": "pts", "rebounds": "reb", "assists": "ast", "threes_made": "fg3m", "steals": "stl", "blocks": "blk", "turnovers": "tov"}
MKS = {"player_points": "points", "player_rebounds": "rebounds", "player_assists": "assists", "player_threes": "threes_made", "player_steals": "steals", "player_blocks": "blocks", "player_turnovers": "turnovers"}
UD = {"2-pick Standard": (2, {(2, 2): 3.5}), "3-pick Flex": (3, {(3, 3): 3.25, (3, 2): 1.09, (2, 2): 3.5}), "3-pick Standard": (3, {(3, 3): 6.5, (2, 2): 3.5})}
PP = {"2-pick Power": (2, {(2, 2): 3.0}), "3-pick Power": (3, {(3, 3): 6.0, (2, 2): 3.0}), "4-pick Flex": (4, {(4, 4): 6.0, (4, 3): 1.5, (3, 3): 3.0, (3, 2): 1.0, (2, 2): 3.0}),
      "5-pick Flex": (5, {(5, 5): 10.0, (5, 4): 2.0, (5, 3): 0.4, (4, 4): 6.0, (4, 3): 1.5, (3, 3): 3.0, (3, 2): 1.0})}


def pay(res, table):
    live = [r for r in res if r != 2]                       # 2 = push
    n = len(live)
    if n < 2:
        return 1.0
    return table.get((n, int(sum(live))), 0.0)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    gl = pd.read_sql("""SELECT nba_player_id::text player_id, game_date::text gd, game_id::text game_id, min::float8 mn, pts::float8 pts, reb::float8 reb, ast::float8 ast, fg3m::float8 fg3m,
                               stl::float8 stl, blk::float8 blk, tov::float8 tov FROM nba_stats.player_game_log WHERE game_date >= '2024-10-01'""", conn).drop_duplicates(["player_id", "gd"])
    pp = pd.read_sql("""SELECT DISTINCT game_date::text gd, nm, base_market mk, line::float8 line FROM nba_market.pp_leg_price
                        WHERE snapshot_label = 'window' AND kind = 'standard' AND game_date < current_date AND base_market = ANY(%s)""", conn, params=(list(MKS),))
    ud = pd.read_sql("""SELECT DISTINCT game_date::text gd, nba_ref.norm_name(player) nm, market_key mk, line::float8 line FROM nba_market.board_snapshots
                        WHERE bookmaker = 'underdog' AND snapshot_label = 'window' AND game_date < current_date AND market_key = ANY(%s)
                          AND coalesce(multiplier, round(((CASE WHEN price < 0 THEN 1 + 100.0 / (-price) ELSE 1 + price / 100.0 END) / sqrt(3))::numeric, 2)) = 1.0""",
                     conn, params=(list(MKS),))
    late = pd.DataFrame(conn.execute(LH.LATE_SQL, {"d0": "2024-10-01"}).fetchall(), columns=["app", "gd", "player_id"]); late["gd"] = late["gd"].astype(str)
    H = {}
    for s in ("2024-25", "2025-26", "2026-27"):
        H.update(LH.ladders(conn, s))
    conn.close()
    for app, b, plan, be in (("underdog", ud, UD, 0.5345), ("prizepicks", pp, PP, 0.542)):
        b = b.copy(); b["player_id"] = b["nm"].map(ids); b["prop"] = b["mk"].map(MKS); n0 = len(b); b = b[b["player_id"].notna()]
        b = b.drop_duplicates(["gd", "player_id", "prop"])    # one regular line a player / prop
        lt = late[late["app"] == app][["gd", "player_id"]].drop_duplicates().assign(late=1)
        b = b.merge(lt, on=["gd", "player_id"], how="left"); b = b[b["late"].isna()].drop(columns=["late"])
        b = b.merge(gl, on=["player_id", "gd"], how="left")
        played = b["mn"].fillna(0) > 0
        stat = np.full(len(b), np.nan)
        for p_, c_ in SINGLE.items():
            k_ = (b["prop"] == p_).values; stat[k_] = b.loc[k_, c_].values
        b["res"] = np.where(~played, 3, np.where(stat == b["line"].values, 2, (stat < b["line"].values).astype(int)))      # Under: 1 win, 0 loss, 2 push, 3 did not play
        b["ph"] = LH.attach(b["gd"].values, b["player_id"].values, b["prop"].values, b["line"].values, np.zeros(len(b), bool), H)
        # a whole-number line L: the Under wins when the stat is below L, i.e. when it is not over L - 0.5 (the ladder holds half lines)
        wl = b["ph"].isna().values & (b["line"].values % 1 == 0)
        b.loc[wl, "ph"] = LH.attach(b["gd"].values[wl], b["player_id"].values[wl], b["prop"].values[wl], b["line"].values[wl] - 0.5, np.zeros(int(wl.sum()), bool), H)
        b["season"] = np.where(b["gd"] < "2025-08-01", "2024-25", np.where(b["gd"] < "2026-08-01", "2025-26", "2026-27"))
        whole = (b["line"] % 1 == 0)
        print(f"\nAP|================ {app.upper()}: regular single-stat Under legs on the raw pick-time board {len(b):,} (rows {n0:,}) on {b['gd'].nunique()} slates ================", flush=True)
        for s, g in b.groupby("season"):
            print(f"AP|  {s}: legs {len(g):,} | player did not play {100 * (g['res'] == 3).mean():.1f}% | of those who played: push {100 * (g[g['res'] != 3]['res'] == 2).mean():.2f}%, "
                  f"win {100 * (g[g['res'] != 3]['res'] == 1).mean():.1f}% | whole-number lines {100 * (g['line'] % 1 == 0).mean():.0f}% (push on those {100 * (g[(g['line'] % 1 == 0) & (g['res'] != 3)]['res'] == 2).mean():.1f}%) | "
                  f"with an honest number {100 * g[g['res'] != 3]['ph'].notna().mean():.0f}% of played", flush=True)
        r = b[(b["res"] != 3) & b["ph"].notna()].sort_values("ph", ascending=False)
        top = r.groupby("gd").head(4)
        print(f"AP|  top 4 a slate by the honest baseline (pushes left in): legs {len(top):,}, push {100 * (top['res'] == 2).mean():.2f}%, whole-number lines {100 * (top['line'] % 1 == 0).mean():.0f}%, "
              f"hit of the decided {top[top['res'] != 2]['res'].mean():.3f}", flush=True)
        for nm, (k, table) in plan.items():
            out = {}
            for mode in ("pushes excluded (as the battery counted)", "AS PLACED (pushes in, paid by the app's rule)"):
                rows = []
                for gd, g in r.groupby("gd", sort=True):
                    if mode.startswith("pushes excluded"):
                        g = g[g["res"] != 2]
                    pick = []; games = set()
                    for res, game in zip(g["res"].values, g["game_id"].values):
                        if game in games:
                            continue
                        pick.append(int(res)); games.add(game)
                        if len(pick) == k:
                            break
                    if len(pick) == k:
                        rows.append((gd, g["season"].iloc[0], pay(pick, table) - 1, sum(1 for x in pick if x == 2)))
                t = pd.DataFrame(rows, columns=["gd", "season", "u", "push"]); out[mode] = t
                per = " | ".join(f"{s} {x['u'].sum():+.1f} u ({len(x)} slips, ROI {100 * x['u'].mean():+.1f}%)" for s, x in t.groupby("season"))
                print(f"AP|  {nm:16s} {mode:46s}: {per} | pooled {t['u'].sum():+.1f} u, ROI {100 * t['u'].mean():+.1f}%, slips with a push {100 * (t['push'] > 0).mean():.1f}%", flush=True)
            a, c = out["pushes excluded (as the battery counted)"], out["AS PLACED (pushes in, paid by the app's rule)"]
            print(f"AP|    cost of pushes on {nm}: pooled ROI {100 * a['u'].mean():+.1f}% -> {100 * c['u'].mean():+.1f}% ({100 * (c['u'].mean() - a['u'].mean()):+.1f} points)", flush=True)
    # ---- PART 2: the BLEND as placed (it now exists for pushed legs: nba_score._lr_legs_push scored by the leg model, prediction only) -------------------
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    q = """SELECT l.app, l.season, l.game_date::text gd, l.player_id, l.prop, l.line::float8 line, {res} res, p.p_blend::float8 blend
           FROM nba_score.{tab} l JOIN nba_score._lr_legs_hp p ON p.app = l.app AND p.game_date = l.game_date AND p.player_id = l.player_id AND p.prop = l.prop AND p.side = l.side
                AND p.line = l.line AND p.kind = l.kind AND p.tier IS NOT DISTINCT FROM l.tier
           WHERE l.app IN ('underdog', 'prizepicks') AND l.kind IN ('standard', 'R') AND lower(left(l.side, 1)) = 'u' AND l.prop = ANY(%s) {extra}"""
    g1 = pd.read_sql(q.format(res="l.hit::int", tab="_lr_legs_h", extra="AND l.hit IS NOT NULL AND (l.app <> 'underdog' OR l.m BETWEEN 1.86 AND 1.88)"), conn, params=(list(SINGLE),))
    g2 = pd.read_sql(q.format(res="2", tab="_lr_legs_push", extra=""), conn, params=(list(SINGLE),))
    fh = pd.read_sql("""SELECT game_date::text gd, player_id::text player_id, prop, line::float8 line, final_hp::float8 fhp, score::float8 score FROM nba_score.final_hp
                        WHERE game_date >= '2026-10-20' AND game_date < current_date AND lower(left(side, 1)) = 'u' AND prop = ANY(%s) AND final_hp IS NOT NULL""", conn, params=(list(SINGLE),))
    conn.close()
    allb = pd.concat([g1, g2], ignore_index=True).drop_duplicates(["app", "gd", "player_id", "prop", "line"]).merge(gl[["player_id", "gd", "game_id"]], on=["player_id", "gd"], how="left")
    allb["game_id"] = allb["game_id"].fillna("g" + allb["player_id"])
    print(f"\nAP|================ PART 2 - THE BLEND AS PLACED: graded regular single-stat Unders {len(g1):,} + pushed {len(g2):,} (with a blend number) ================", flush=True)
    for app, plan in (("underdog", UD), ("prizepicks", PP)):
        r = allb[allb["app"] == app].sort_values("blend", ascending=False).drop_duplicates(["gd", "player_id"])
        for nm, (k, table) in plan.items():
            res_ = {}
            for mode in ("pushes excluded", "AS PLACED"):
                rows = []
                for gd, g in r.groupby("gd", sort=True):
                    if mode == "pushes excluded":
                        g = g[g["res"] != 2]
                    pick = []; games = set()
                    for rr_, game in zip(g["res"].values, g["game_id"].values):
                        if game in games:
                            continue
                        pick.append(int(rr_)); games.add(game)
                        if len(pick) == k:
                            break
                    if len(pick) == k:
                        rows.append((gd, g["season"].iloc[0], pay(pick, table) - 1, sum(1 for x in pick if x == 2)))
                res_[mode] = pd.DataFrame(rows, columns=["gd", "season", "u", "push"])
            a_, c_ = res_["pushes excluded"], res_["AS PLACED"]
            per = " | ".join(f"{s} {x['u'].sum():+.1f} u ({len(x)}, {100 * x['u'].mean():+.1f}%)" for s, x in c_.groupby("season"))
            cum = np.concatenate([[0], np.cumsum(c_.sort_values("gd")["u"].values)]); dd = float((np.maximum.accumulate(cum) - cum).max())
            print(f"AP|  {app:10s} {nm:16s} AS PLACED: {per} | pooled {c_['u'].sum():+.1f} u, ROI {100 * c_['u'].mean():+.1f}%, drawdown {dd:.1f}, slips with a push {100 * (c_['push'] > 0).mean():.1f}% "
                  f"|| pushes excluded: pooled {a_['u'].sum():+.1f} u, ROI {100 * a_['u'].mean():+.1f}%", flush=True)
    # ---- PART 3: THIS SEASON with the number production stored BEFORE the games (final_hp), on the raw board - players who then did not play included ----
    print("\nAP|================ PART 3 - THIS SEASON, production's pick-time final_hp on the raw board: pushes AND did-not-play legs paid by the app's rule ================", flush=True)
    for app, bsrc, plan in (("underdog", ud, UD), ("prizepicks", pp, PP)):
        b = bsrc.copy(); b["player_id"] = b["nm"].map(ids); b["prop"] = b["mk"].map(MKS); b = b[b["player_id"].notna() & (b["gd"] >= "2026-10-20")].drop_duplicates(["gd", "player_id", "prop"])
        lt = late[late["app"] == app][["gd", "player_id"]].drop_duplicates().assign(late=1)
        b = b.merge(lt, on=["gd", "player_id"], how="left"); b = b[b["late"].isna()].drop(columns=["late"])
        b = b.merge(gl, on=["player_id", "gd"], how="left").merge(fh, on=["gd", "player_id", "prop", "line"], how="inner")
        played = b["mn"].fillna(0) > 0; stat = np.full(len(b), np.nan)
        for p_, c_ in SINGLE.items():
            k_ = (b["prop"] == p_).values; stat[k_] = b.loc[k_, c_].values
        b["res"] = np.where(~played, 2, np.where(stat == b["line"].values, 2, (stat < b["line"].values).astype(int))); b["dnp"] = (~played).astype(int)
        b["game_id"] = b["game_id"].fillna("g" + b["player_id"])
        print(f"AP|  {app}: board legs with a stored final_hp {len(b):,} on {b['gd'].nunique()} slates; did not play {100 * b['dnp'].mean():.1f}%", flush=True)
        for key in ("fhp", "score"):
            r = b[b[key].notna()].sort_values(key, ascending=False).drop_duplicates(["gd", "player_id"])
            t4 = r.groupby("gd").head(4)
            print(f"AP|    top 4 by {('final_hp' if key == 'fhp' else 'score')}: legs {len(t4)}, did not play {100 * t4['dnp'].mean():.1f}%, pushed or void {100 * (t4['res'] == 2).mean():.1f}%, hit of the decided {t4[t4['res'] != 2]['res'].mean():.3f}", flush=True)
            for nm, (k, table) in plan.items():
                rows = []
                for gd, g in r.groupby("gd", sort=True):
                    pick = []; games = set()
                    for rr_, game in zip(g["res"].values, g["game_id"].values):
                        if game in games:
                            continue
                        pick.append(int(rr_)); games.add(game)
                        if len(pick) == k:
                            break
                    if len(pick) == k:
                        rows.append((pay(pick, table) - 1, sum(1 for x in pick if x == 2)))
                t = pd.DataFrame(rows, columns=["u", "v"])
                if len(t):
                    print(f"AP|      {nm:16s}: {len(t)} slips, {t['u'].sum():+.1f} u, ROI {100 * t['u'].mean():+.1f}%, slips with a void / push {100 * (t['v'] > 0).mean():.0f}%", flush=True)
    print("AP|DONE", flush=True)


if __name__ == "__main__":
    main()
