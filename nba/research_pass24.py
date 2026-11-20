#!/usr/bin/env python3
"""
PASS 24 - SLEEPER, FLIFF, BETR ON THEIR OWN BOARDS: SOURCES, POOLS, THE GAME RULE. READ-ONLY. (NBA_HONEST_REBUILD.md 8ak)
SMALL SAMPLE: Sleeper and Fliff have real boards for the 2026-27 slates only (about 29); Betr for 2025-26 and 2026-27. Everything here is a lead at best.
  source of the order   tight (Underdog top 2 + PrizePicks top 5, as live) | wide (top 10 + top 10) | Underdog's order | PrizePicks' order | the app's OWN board by the blend | by the model
  pool                  every single stat | no assists | rebounds
  game rule             one a game | two a game
  slips                 Sleeper Max 2-6, Flex 3-6; Fliff Max 2-6; Betr Perfect 2-5
Yardstick: 300 random slips a day from the same app's Under board (what the pricing gives a blind player).
Env: DATABASE_URL.
"""
import json
import os
import sys

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_pass10 as P10

MKS = P10.MKS


def take(rows, k, gcap):
    out = []; games = {}; players = set()
    for r in rows:
        if r["player_id"] in players or games.get(r["game_id"], 0) >= gcap:
            continue
        out.append(r); players.add(r["player_id"]); games[r["game_id"]] = games.get(r["game_id"], 0) + 1
        if len(out) == k:
            return out
    return None


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    import sleeper_live_slip_engine as SL
    P10.SLP = SL.pricing(conn)
    BR = conn.execute("SELECT rule_json FROM nba_config.pp_slip_rules WHERE rule_key='betr_payout_v1'").fetchone()[0]; P10.BR = BR if isinstance(BR, dict) else json.loads(BR)
    d = pd.read_sql("""SELECT v.app, v.season, v.game_date::text gd, v.player_id, v.prop, v.line::float8 line, v.kind, v.multiplier::float8 mm, v.hit::int hit, v.p_blend::float8 blend,
                              v.p_honest_baseline::float8 ph FROM nba_score.v_legs_honest v WHERE v.prop = ANY(%s) AND v.is_under AND v.game_date >= '2025-10-01'""", conn, params=(list(MKS.values()),))
    gl = pd.read_sql("""SELECT nba_player_id::text player_id, game_date::text gd, game_id::text game_id, pts::float8 pts, reb::float8 reb, ast::float8 ast, fg3m::float8 fg3m, stl::float8 stl,
                               blk::float8 blk, tov::float8 tov FROM nba_stats.player_game_log WHERE game_date >= '2025-10-01' AND min > 0""", conn).drop_duplicates(["player_id", "gd"])
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    bb = pd.read_sql("""SELECT DISTINCT game_date::text gd, nba_ref.norm_name(player) nm, market_key mk, line::float8 line FROM nba_market.board_snapshots
                        WHERE bookmaker IN ('betr_us_dfs', 'betr') AND snapshot_label = 'window' AND game_date < current_date AND market_key = ANY(%s) AND lower(left(side, 1)) NOT IN ('o', 'm', 'h')""",
                     conn, params=(list(MKS),))
    conn.close()
    d = d.merge(gl[["player_id", "gd", "game_id"]], on=["player_id", "gd"], how="left"); d["game_id"] = d["game_id"].fillna("g" + d["player_id"])
    bb["player_id"] = bb["nm"].map(ids); bb["prop"] = bb["mk"].map(MKS); bb = bb[bb["player_id"].notna()].drop_duplicates(["gd", "player_id", "prop"]).merge(gl, on=["player_id", "gd"], how="inner")
    stat = np.full(len(bb), np.nan)
    for p_, c_ in P10.SINGLE.items():
        k_ = (bb["prop"] == p_).values; stat[k_] = bb.loc[k_, c_].values
    bb["stat"] = stat; bb = bb[bb["stat"] != bb["line"]].copy(); bb["hit"] = (bb["stat"] < bb["line"]).astype(int); bb["mm"] = 1.0; bb["app"] = "betr"
    bb["season"] = np.where(bb["gd"] < "2026-08-01", "2025-26", "2026-27")
    reg = d[(d["kind"] == "regular") & d["app"].isin(["underdog", "prizepicks"]) & d["blend"].notna()]; reg = reg[(reg["app"] != "prizepicks") | (reg["line"] % 1 != 0)]
    L = {key: g.to_dict("records") for key, g in reg.sort_values("blend", ascending=False).groupby(["app", "gd"], sort=False)}
    ph_of = {(g, p, r): v for g, p, r, v in zip(reg["gd"], reg["player_id"], reg["prop"], reg["ph"])}; bl_of = {(g, p, r): v for g, p, r, v in zip(reg["gd"], reg["player_id"], reg["prop"], reg["blend"])}
    tgt = pd.concat([d[d["app"].isin(["sleeper", "fliff"])], bb[["app", "season", "gd", "player_id", "prop", "line", "mm", "hit", "game_id"]]], ignore_index=True)
    T = {key: g.to_dict("records") for key, g in tgt.groupby(["app", "gd", "player_id", "prop"], sort=False)}
    BOARD = {key: g for key, g in tgt.groupby(["app", "gd"], sort=False)}
    print("P24|boards: " + " | ".join(f"{a}: {tgt[tgt['app'] == a]['gd'].nunique()} slates, {int((tgt['app'] == a).sum()):,} Under legs, mean multiplier {tgt[tgt['app'] == a]['mm'].mean():.2f}, "
                                         f"hit {100 * tgt[tgt['app'] == a]['hit'].mean():.1f}%" for a in ("sleeper", "fliff", "betr")), flush=True)

    def _first(rows, k):
        out = []; games = set(); players = set()
        for r in rows:
            if r["player_id"] in players or r["game_id"] in games:
                continue
            out.append(r); players.add(r["player_id"]); games.add(r["game_id"])
            if len(out) == k:
                break
        return out

    def onto(app, gd, src):
        out = []
        for r in src:
            g = T.get((app, gd, r["player_id"], r["prop"]))
            if g:
                t = min(g, key=lambda x: abs(x["line"] - r["line"])); out.append(dict(t, player_id=r["player_id"], prop=r["prop"], game_id=r["game_id"]))
        return out

    STRUCT = {"sleeper": [("P", k) for k in (2, 3, 4, 5, 6)] + [("F", k) for k in (3, 4, 5, 6)], "fliff": [("P", k) for k in (2, 3, 4, 5, 6)], "betr": [("P", k) for k in (2, 3, 4, 5)]}
    rng = np.random.default_rng(24)
    for app in ("sleeper", "fliff", "betr"):
        days = sorted({gd for (a, gd) in BOARD if a == app})
        print(f"\nP24|================ {app.upper()}: {len(days)} slates ================", flush=True)
        # yardstick
        ys = []
        for (st, k) in STRUCT[app]:
            us = []
            for gd in days:
                b = BOARD[(app, gd)].drop_duplicates(["player_id", "prop"]).to_dict("records")
                for _ in range(300):
                    idx = rng.permutation(len(b)); s = take([b[i] for i in idx], k, 1)
                    if s:
                        us.append(P10.pay(app, k, st, [x["hit"] for x in s], [x["mm"] for x in s]) - 1)
            ys.append(f"{k}{'F' if st == 'F' else 'M'} {100 * np.mean(us):+.0f}%" if us else f"{k} -")
        print(f"P24|  blind player (random slips from the app's own Unders): " + " ".join(ys), flush=True)
        res = []
        for gcap in (1, 2):
            for pn, pf in (("every single stat", lambda r: True), ("no assists", lambda r: r["prop"] != "assists"), ("rebounds", lambda r: r["prop"] == "rebounds")):
                for sn in ("tight (live)", "wide", "Underdog order", "PrizePicks order", "own board by blend", "own board by model"):
                    acc = {key: [] for key in STRUCT[app]}
                    for gd in days:
                        U = L.get(("underdog", gd), []); P = L.get(("prizepicks", gd), [])
                        if sn == "tight (live)":
                            src = sorted(_first(U, 2) + _first(P, 5), key=lambda r: -r["blend"])
                        elif sn == "wide":
                            src = sorted(_first(U, 10) + _first(P, 10), key=lambda r: -r["blend"])
                        elif sn == "Underdog order":
                            src = U
                        elif sn == "PrizePicks order":
                            src = P
                        else:
                            m = bl_of if sn.endswith("blend") else ph_of
                            b = [dict(r, sc=m.get((gd, r["player_id"], r["prop"]))) for r in BOARD[(app, gd)].drop_duplicates(["player_id", "prop"]).to_dict("records")]
                            src = None; cand = sorted([r for r in b if r["sc"] is not None and r["sc"] == r["sc"]], key=lambda r: -r["sc"])
                        cand = onto(app, gd, src) if src is not None else cand
                        cand = [r for r in cand if pf(r)]
                        for (st, k) in STRUCT[app]:
                            s = take(cand, k, gcap)
                            if s:
                                acc[(st, k)].append((gd, P10.pay(app, k, st, [x["hit"] for x in s], [x["mm"] for x in s]) - 1, np.mean([x["hit"] for x in s])))
                    for (st, k), rows in acc.items():
                        if len(rows) < 12:
                            continue
                        u = np.array([r[1] for r in rows]); h = np.mean([r[2] for r in rows]); half = len(u) // 2
                        res.append((u.mean(), f"{k}-pick {'Flex' if st == 'F' else ('Max' if app != 'betr' else 'Perfect')} | {sn} | {pn} | {gcap} a game", u.sum(), len(u), h, (u > -1).mean(), u[:half].sum(), u[half:].sum(),
                                    u.sum() - np.sort(u)[-2:].sum()))
        res.sort(key=lambda x: -x[0])
        print(f"P24|  cells with 12+ slips: {len(res)}; positive {sum(r[0] > 0 for r in res)}; positive in both halves of the sample {sum(r[6] > 0 and r[7] > 0 for r in res)}", flush=True)
        for r in res[:28]:
            print(f"P24|  {r[1]:72s}: {100 * r[0]:+5.0f}% ({r[2]:+6.1f} u, {r[3]} slips) | legs hit {100 * r[4]:.0f}% | paid {100 * r[5]:.0f}% | halves {r[6]:+.1f} / {r[7]:+.1f} | without the 2 best {r[8]:+.1f}", flush=True)
        print("P24|  -- the live ones and their two-a-game twins:", flush=True)
        for r in res:
            if "tight (live) | every single stat" in r[1]:
                print(f"P24|  {r[1]:72s}: {100 * r[0]:+5.0f}% ({r[2]:+6.1f} u, {r[3]} slips) | legs hit {100 * r[4]:.0f}% | halves {r[6]:+.1f} / {r[7]:+.1f} | without the 2 best {r[8]:+.1f}", flush=True)
    print("P24|DONE", flush=True)


if __name__ == "__main__":
    main()
