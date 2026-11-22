#!/usr/bin/env python3
"""
SLIPS ON THE CERTIFIED LEG CARD - EVERY STRUCTURE, PLUS TEAMMATE OVER/UNDER PAIRS (owner 2026-11-22: report 2-6 picks, Power and Flex; find positive).
READ-ONLY. Legs: nba_score.leg_card_v2, real prices only (regular PrizePicks lines; Underdog legs at modifier 1.0 so the flex tables apply exactly),
ranked by hit_cal (walk-forward calibrated - nothing the ranking uses has seen the result).
Per app, per slate: candidate legs with hit_cal >= HMIN, one leg per player, at most 2 per game.
  TOP      the k best legs by hit_cal, slips disjoint down the list (SLIPS per slate)
  PAIRS    teammates, one Over + one Under (same stat first): the 2.6% joint lift (11:00 PT finding); slips are whole pairs (k = 2, 4, 6)
Structures: PrizePicks Power 2-6 / Flex 3-6; Underdog Standard 2-6 / Flex 3-6. Per season: slips, ROI, units, max drawdown, longest losing run.
Env: DATABASE_URL, SC_HMIN (0.55), SC_SLIPS (1).
"""
import os

import numpy as np
import pandas as pd
import psycopg

PP_P = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}
PP_F = {(3, 0): 3.0, (3, 1): 1.0, (4, 0): 6.0, (4, 1): 1.5, (5, 0): 10.0, (5, 1): 2.0, (5, 2): 0.4, (6, 0): 25.0, (6, 1): 2.0, (6, 2): 0.4}
UD_P = {2: 3.5, 3: 6.5, 4: 12.0, 5: 20.0, 6: 35.0}
UD_F = {(3, 0): 3.25, (3, 1): 1.09, (4, 0): 7.2, (4, 1): 1.4, (5, 0): 10.0, (5, 1): 2.5, (6, 0): 25.0, (6, 1): 2.6, (6, 2): 0.25}


def pay(app, struct, k, wins):
    miss = k - wins
    if struct == "power":
        return (PP_P if app == "prizepicks" else UD_P)[k] if miss == 0 else 0.0
    return (PP_F if app == "prizepicks" else UD_F).get((k, miss), 0.0)


def stats(r):
    if not len(r):
        return None
    u = np.array(r) - 1
    cum = np.cumsum(u); dd = float(np.max(np.maximum.accumulate(np.concatenate([[0], cum]))[1:] - cum)) if len(cum) else 0
    run = best = 0
    for x in u:
        run = run + 1 if x < 0 else 0; best = max(best, run)
    return len(u), 100 * u.mean(), u.sum(), dd, best


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    hmin = float(os.environ.get("SC_HMIN") or 0.55); ns = int(os.environ.get("SC_SLIPS") or 1)
    d = pd.read_sql("""SELECT c.season, c.game_date, c.app, c.player_id, c.prop, c.side, c.hit_cal::float8 h, (c.result = 'won')::int w, g.game_id, g.team_id
                       FROM nba_score.leg_card_v2 c JOIN nba_stats.player_game_log g ON g.nba_player_id::text = c.player_id AND g.game_date = c.game_date
                       WHERE c.result IN ('won','lost') AND c.hit_cal IS NOT NULL
                         AND ((c.app = 'prizepicks' AND c.kind = 'standard') OR (c.app = 'underdog' AND c.leg_mult = 1))""", conn)
    print(f"SC|legs {len(d):,} (hit_cal >= {hmin}: {(d.h >= hmin).sum():,}) | slips per slate {ns}", flush=True)
    res = {}
    for (app, gd), x in d.groupby(["app", "game_date"]):
        s = x.season.iloc[0]
        c = x[x.h >= hmin].sort_values("h", ascending=False).drop_duplicates("player_id")
        # TOP
        for k in (2, 3, 4, 5, 6):
            pool = []; used_g = {}
            for r in c.itertuples():
                if used_g.get(r.game_id, 0) >= 2:
                    continue
                pool.append(r); used_g[r.game_id] = used_g.get(r.game_id, 0) + 1
            for i in range(ns):
                sl = pool[i * k:(i + 1) * k]
                if len(sl) < k:
                    break
                wins = sum(r.w for r in sl)
                for st in ("power", "flex"):
                    if st == "flex" and k == 2:
                        continue
                    res.setdefault(("TOP", app, st, k, s), []).append(pay(app, st, k, wins))
        # PAIRS: teammates, Over + Under, same stat preferred, ranked by the pair's joint hit
        o = c[c.side == "Over"]; u = c[c.side == "Under"]
        m = o.merge(u, on=["team_id", "game_id"], suffixes=("_o", "_u"))
        m = m[m.player_id_o != m.player_id_u]
        if len(m):
            m["same"] = (m.prop_o == m.prop_u).astype(int); m["jp"] = m.h_o * m.h_u
            m = m.sort_values(["same", "jp"], ascending=False)
            pairs = []; usedp = set()
            for r in m.itertuples():
                if r.player_id_o in usedp or r.player_id_u in usedp:
                    continue
                pairs.append(r); usedp |= {r.player_id_o, r.player_id_u}
            for k in (2, 4, 6):
                q = k // 2
                for i in range(ns):
                    sl = pairs[i * q:(i + 1) * q]
                    if len(sl) < q:
                        break
                    wins = sum(r.w_o + r.w_u for r in sl)
                    for st in ("power", "flex"):
                        if st == "flex" and k == 2:
                            continue
                        res.setdefault(("PAIRS", app, st, k, s), []).append(pay(app, st, k, wins))
    print("SC|strategy | app | structure | picks | season: slips, ROI, units, max drawdown (u), longest losing run", flush=True)
    for key in sorted(res):
        st = stats(res[key])
        if st:
            print(f"SC|  {key[0]:5s} {key[1]:10s} {key[2]:5s} {key[3]} {key[4]}: {st[0]:4d} slips | ROI {st[1]:+6.1f}% | {st[2]:+7.1f} u | dd {st[3]:5.1f} | run {st[4]}", flush=True)
    print("SC|DONE", flush=True)


if __name__ == "__main__":
    main()
