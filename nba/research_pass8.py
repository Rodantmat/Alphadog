#!/usr/bin/env python3
"""
PASS 8 - EVERY STRUCTURE, AND THE QUALIFIED LEGS PLAYED ON THE OTHER APPS. READ-ONLY. (NBA_HONEST_REBUILD.md 8y)
Owner 2026-11-19 22:16 PT: "What about other structures? 3 pick flex, 6pick flex? For the other apps what if we use only ud and pp qualified legs?
Do their pricing brings positive ROI?"
  A. STRUCTURES   Underdog and PrizePicks, the top k regular single-stat Unders by the blend (one a player and a game), EVERY structure 2-6 picks, Standard / Power
                  and Flex: ROI by season, units, drawdown, drought.
  B. QUALIFIED LEGS ON OTHER APPS   qualified = the legs the candidate would play: Underdog's top 2 and PrizePicks' top 5 of the slate (tight), or top 5 / top 8
                  (wide). For each, the SAME player + prop Under on the target app's board that slate (its own line, its own price, graded on its own line):
                  per-leg return at the target's price, and slips there in the source's order (one a game).
                  targets: sleeper, fliff (real multipliers this season; derived before - shown apart), betr (table price, all-Less discount), and each of
                  underdog / prizepicks fed by the other's list.
Env: DATABASE_URL.
"""
import json
import math
import os
import sys

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
COMBO = ("pra", "pts_reb", "pts_ast", "reb_ast", "stocks", "fantasy_score", "double_double")
SEAS = ["2024-25", "2025-26", "2026-27"]
PP_PWR = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}
PP_FLEX = {(3, 0): 3.0, (3, 1): 1.0, (4, 0): 6.0, (4, 1): 1.5, (5, 0): 10.0, (5, 1): 2.0, (5, 2): 0.4, (6, 0): 25.0, (6, 1): 2.0, (6, 2): 0.4}
UD_STD = {2: 3.5, 3: 6.5, 4: 12.0, 5: 20.0, 6: 35.0}
UD_FLEX = {(3, 0): 3.25, (3, 1): 1.09, (4, 0): 7.2, (4, 1): 1.4, (5, 0): 10.0, (5, 1): 2.5, (6, 0): 25.0, (6, 1): 2.6, (6, 2): 0.25}
SINGLE = {"points": "pts", "rebounds": "reb", "assists": "ast", "threes_made": "fg3m", "steals": "stl", "blocks": "blk", "turnovers": "tov"}
MKS = {"player_points": "points", "player_rebounds": "rebounds", "player_assists": "assists", "player_threes": "threes_made", "player_steals": "steals", "player_blocks": "blocks", "player_turnovers": "turnovers"}
SLP = None; BR = None


def summ(rows):
    """rows: (gd, season, units)"""
    if not rows:
        return "no slips"
    t = pd.DataFrame(rows, columns=["gd", "s", "u"]).sort_values("gd")
    per = " | ".join(f"{s} {x['u'].sum():+.1f} u ({len(x)}, {100 * x['u'].mean():+.0f}%)" if len(x) else f"{s} -" for s, x in ((s, t[t["s"] == s]) for s in SEAS))
    cum = np.concatenate([[0], np.cumsum(t["u"].values)]); dd = float((np.maximum.accumulate(cum) - cum).max()); dr = c = 0
    for u in t["u"].values:
        c = 0 if u > 0 else c + 1; dr = max(dr, c)
    return f"{per} || pooled {t['u'].sum():+.1f} u, {100 * t['u'].mean():+.1f}% on {len(t)}, drawdown {dd:.1f}, drought {dr}"


def pay(app, st, hits, ms):
    """payout of one slip (stake 1). hits 0/1, ms the target app's leg multipliers (prizepicks / underdog regular = 1)."""
    n = len(hits); h = sum(hits)
    if app == "prizepicks":
        return (PP_PWR[n] if h == n else 0.0) if st == "P" else PP_FLEX.get((n, n - h), 0.0)
    if app == "underdog":
        return (UD_STD[n] if h == n else 0.0) if st == "P" else UD_FLEX.get((n, n - h), 0.0)
    if app == "fliff":
        return math.prod(ms) if h == n else 0.0
    if app == "sleeper":
        bonus, fev, frat = SLP
        if st == "P":
            return math.prod(ms) * bonus.get(n, 1.0) if h == n else 0.0
        import sleeper_live_slip_engine as SL
        return float(SL.flex_tiers(list(ms), fev, frat).get(h, 0.0)) if h >= n - 2 else 0.0
    if app == "betr":                                        # all Less: the discounted tables
        if st == "P":
            return float(BR["perfect_all_less"].get(str(n), 0.0)) if h == n else 0.0
        tb = BR["dynamic_all_less"].get(str(n)); return float(tb.get(str(h), 0.0)) if tb else 1.0
    raise ValueError(app)


STRUCTS = {"prizepicks": [(k, s) for k in range(2, 7) for s in ("P", "F") if not (k == 2 and s == "F")], "underdog": [(k, s) for k in range(2, 7) for s in ("P", "F") if not (k == 2 and s == "F")],
           "sleeper": [(k, s) for k in range(2, 7) for s in ("P", "F") if not (k == 2 and s == "F")], "fliff": [(k, "P") for k in range(2, 7)],
           "betr": [(k, "P") for k in range(2, 6)] + [(k, "F") for k in range(3, 7)]}
NAME = {"prizepicks": {"P": "Power", "F": "Flex"}, "underdog": {"P": "Standard", "F": "Flex"}, "sleeper": {"P": "Max", "F": "Flex"}, "fliff": {"P": "product"}, "betr": {"P": "Perfect", "F": "Dynamic"}}


def top(g, n):
    out = []; games = set(); players = set()
    for i, (pl, game) in enumerate(zip(g["player_id"].values, g["game_id"].values)):
        if game in games or pl in players:
            continue
        out.append(i); games.add(game); players.add(pl)
        if len(out) == n:
            break
    return g.iloc[out]


def main():
    global SLP, BR
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    import sleeper_live_slip_engine as SL
    SLP = SL.pricing(conn)
    BR = conn.execute("SELECT rule_json FROM nba_config.pp_slip_rules WHERE rule_key='betr_payout_v1'").fetchone()[0]; BR = BR if isinstance(BR, dict) else json.loads(BR)
    d = pd.read_sql("""SELECT v.app, v.season, v.game_date::text gd, v.player_id, v.prop, v.is_under, v.line::float8 line, v.kind, v.price_source src, v.multiplier::float8 mm, v.hit::int hit,
                              v.p_blend::float8 blend
                       FROM nba_score.v_legs_honest v WHERE v.prop <> ALL(%s) AND v.is_under""", conn, params=(list(COMBO),))
    gl = pd.read_sql("""SELECT nba_player_id::text player_id, game_date::text gd, game_id::text game_id, min::float8 mn, pts::float8 pts, reb::float8 reb, ast::float8 ast, fg3m::float8 fg3m,
                               stl::float8 stl, blk::float8 blk, tov::float8 tov FROM nba_stats.player_game_log WHERE game_date >= '2024-10-01' AND min > 0""", conn).drop_duplicates(["player_id", "gd"])
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    bb = pd.read_sql("""SELECT DISTINCT game_date::text gd, nba_ref.norm_name(player) nm, market_key mk, line::float8 line FROM nba_market.board_snapshots
                        WHERE bookmaker = 'betr_us_dfs' AND snapshot_label = 'window' AND game_date < current_date AND market_key = ANY(%s) AND lower(left(side, 1)) NOT IN ('o', 'm', 'h')""",
                     conn, params=(list(MKS),))
    conn.close()
    d = d.merge(gl[["player_id", "gd", "game_id"]], on=["player_id", "gd"], how="left"); d["game_id"] = d["game_id"].fillna("g" + d["player_id"])
    # Betr Unders graded on Betr's own line (a push is dropped - Betr removes the leg)
    bb["player_id"] = bb["nm"].map(ids); bb["prop"] = bb["mk"].map(MKS); bb = bb[bb["player_id"].notna()].drop_duplicates(["gd", "player_id", "prop"]).merge(gl, on=["player_id", "gd"], how="inner")
    stat = np.full(len(bb), np.nan)
    for p_, c_ in SINGLE.items():
        k_ = (bb["prop"] == p_).values; stat[k_] = bb.loc[k_, c_].values
    bb["stat"] = stat; bb = bb[bb["stat"] != bb["line"]].copy(); bb["hit"] = (bb["stat"] < bb["line"]).astype(int)
    bb["mm"] = 1.0; bb["season"] = np.where(bb["gd"] < "2026-08-01", "2025-26", "2026-27"); bb["src"] = "table"; bb["app"] = "betr"; bb["kind"] = "regular"
    reg = d[(d["kind"] == "regular") & d["app"].isin(["underdog", "prizepicks"]) & d["blend"].notna()].sort_values("blend", ascending=False)
    lists = {a: {gd: top(g, 10) for gd, g in reg[reg["app"] == a].groupby("gd", sort=True)} for a in ("underdog", "prizepicks")}

    print("P8|================ A. EVERY STRUCTURE - top k regular single-stat Unders by the blend, 1 slip a slate ================", flush=True)
    for a in ("underdog", "prizepicks"):
        for k, st in STRUCTS[a]:
            rows = [(gd, t["season"].iloc[0], pay(a, st, list(t["hit"].values[:k]), [1.0] * k) - 1) for gd, t in lists[a].items() if len(t) >= k]
            print(f"P8|  {a:10s} {k}-pick {NAME[a][st]:8s}: {summ(rows)}", flush=True)

    print("\nP8|================ B. THE QUALIFIED LEGS PLAYED ON THE OTHER APPS (same player + prop Under, the target's own line and price) ================", flush=True)
    tg = {a: d[d["app"] == a] for a in ("sleeper", "fliff", "underdog", "prizepicks")}; tg["betr"] = bb
    for a in ("underdog", "prizepicks"):
        tg[a] = tg[a][tg[a]["kind"] == "regular"]
    QUAL = {"tight: Underdog top 2 + PrizePicks top 5": (2, 5), "wide: Underdog top 5 + PrizePicks top 8": (5, 8), "Underdog top 2 only": (2, 0), "Underdog top 5 only": (5, 0),
            "PrizePicks top 5 only": (0, 5), "PrizePicks top 8 only": (0, 8)}
    for target in ("sleeper", "fliff", "betr", "underdog", "prizepicks"):
        T = tg[target]; idx = {}
        for (gd, pl, pr), g in T.groupby(["gd", "player_id", "prop"], sort=False):
            idx[(gd, pl, pr)] = g
        for qn, (nu, npp) in QUAL.items():
            if (target == "underdog" and nu) or (target == "prizepicks" and npp):
                continue
            legs = []                                        # matched legs in the source's order
            slates = sorted(set(lists["underdog"]) | set(lists["prizepicks"]))
            per_slate = {}
            for gd in slates:
                src = []
                if nu and gd in lists["underdog"]:
                    src.append(lists["underdog"][gd].iloc[:nu])
                if npp and gd in lists["prizepicks"]:
                    src.append(lists["prizepicks"][gd].iloc[:npp])
                if not src:
                    continue
                s = pd.concat(src).sort_values("blend", ascending=False).drop_duplicates(["player_id"])
                out = []; games = set()
                for pl, pr, ln, game in zip(s["player_id"].values, s["prop"].values, s["line"].values, s["game_id"].values):
                    g = idx.get((gd, pl, pr))
                    if g is None or game in games:
                        continue
                    r = g.iloc[(g["line"] - ln).abs().values.argmin()]          # the target's line nearest to the source's
                    out.append((int(r["hit"]), float(r["mm"]), float(r["line"]) - ln, r["src"], r["season"])); games.add(game)
                if out:
                    per_slate[gd] = out; legs += [(gd,) + o for o in out]
            if not legs:
                print(f"P8|  {target} <- {qn}: no matched legs", flush=True); continue
            L = pd.DataFrame(legs, columns=["gd", "hit", "mm", "dl", "src", "s"])
            print(f"\nP8|  {target.upper()} <- {qn}: matched legs {len(L):,} on {L['gd'].nunique()} slates ({len(L) / L['gd'].nunique():.1f} a slate); same line {100 * (L['dl'].abs() < 1e-9).mean():.0f}%, "
                  f"target line higher (easier Under) {100 * (L['dl'] > 1e-9).mean():.0f}%, lower {100 * (L['dl'] < -1e-9).mean():.0f}%", flush=True)
            for (s_, src_), x in L.groupby(["s", "src"]):
                if target in ("underdog", "prizepicks", "betr"):
                    print(f"P8|     {s_} [{src_}]: legs {len(x):,}, hit {x['hit'].mean():.3f}", flush=True)
                else:
                    r = x["hit"] * x["mm"] - 1; se = r.std() / max(1, len(x)) ** 0.5
                    print(f"P8|     {s_} [{src_} price]: legs {len(x):,}, hit {x['hit'].mean():.3f}, average multiplier {x['mm'].mean():.3f}, break-even {(1 / x['mm']).mean():.3f}, "
                          f"return a leg {100 * r.mean():+.1f}% [{100 * (r.mean() - 1.64 * se):+.1f} .. {100 * (r.mean() + 1.64 * se):+.1f}]", flush=True)
            real_only = target in ("sleeper", "fliff")
            for k, st in STRUCTS[target]:
                rows = []
                for gd, out in per_slate.items():
                    if real_only and out[0][4] != "2026-27":
                        continue
                    if len(out) >= k:
                        rows.append((gd, out[0][4], pay(target, st, [o[0] for o in out[:k]], [o[1] for o in out[:k]]) - 1))
                print(f"P8|     {k}-pick {NAME[target][st]:8s}{' (this season, real prices)' if real_only else ''}: {summ(rows)}", flush=True)
    print("P8|DONE", flush=True)


if __name__ == "__main__":
    main()
