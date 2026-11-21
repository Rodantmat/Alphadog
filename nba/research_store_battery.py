#!/usr/bin/env python3
"""
STRATEGY BATTERY FROM ZERO ON THE ONE-FORMULA STORE - REAL PRICES ONLY. READ-ONLY. (owner 2026-11-21: per-leg ROI with real prices only; strategies
positive in all three seasons, smaller bad days; every structure 2, 3, 4, 5, 6 picks, Power and Flex)
Legs: PrizePicks REGULAR lines (decision snapshot 'window', market without '_alternate') - the only legs whose payout is known exactly: Power 3 / 6 / 10 /
20 / 37.5 and the Flex tables. Goblins / demons are left out (their price is not mapped yet). Model numbers from nba_score.board_scored_v2 (final_hp,
confidence, score of the replayed store - one formula on every date). Graded on the box score: a push or a player who did not play voids the leg and the
slip pays one size down (a 2-pick with a void refunds).
Strategy = rank key (final_hp | score) x side (any | Over | Under) x props (all | singles = no combo stats) x minimum final_hp x slip size k (2-6) x Power /
Flex x slips a day S x exposure (disjoint: each leg in one slip | ladder: slip i takes ranks i..i+k-1 so a leg sits in up to k slips). One leg per player per
slip, one leg per player across the day's pool (his best).
Prints per season (2024-25 / 2025-26 / 2026-27): slips, units, ROI, days up, worst day, max drawdown, longest losing-day run - every strategy positive in
all three seasons, the top 40 by the WORST season's ROI, and the full table of the base strategies.
Env: DATABASE_URL, SB_TOP (40).
"""
import itertools
import os

import numpy as np
import pandas as pd
import psycopg

POWER = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}
FLEX = {3: {3: 3.0, 2: 1.0}, 4: {4: 6.0, 3: 1.5}, 5: {5: 10.0, 4: 2.0, 3: 0.4}, 6: {6: 25.0, 5: 2.0, 4: 0.4}}
CASE = ("CASE replace(b.market_key,'player_','') WHEN 'threes' THEN 'threes_made' WHEN 'points_rebounds_assists' THEN 'pra' WHEN 'points_rebounds' THEN 'pts_reb' "
        "WHEN 'points_assists' THEN 'pts_ast' WHEN 'rebounds_assists' THEN 'reb_ast' WHEN 'blocks_steals' THEN 'stocks' ELSE replace(b.market_key,'player_','') END")
STATV = ("CASE s.prop WHEN 'points' THEN g.pts WHEN 'rebounds' THEN g.reb WHEN 'assists' THEN g.ast WHEN 'threes_made' THEN g.fg3m WHEN 'steals' THEN g.stl "
         "WHEN 'blocks' THEN g.blk WHEN 'turnovers' THEN g.tov WHEN 'pra' THEN g.pts+g.reb+g.ast WHEN 'pts_reb' THEN g.pts+g.reb WHEN 'pts_ast' THEN g.pts+g.ast "
         "WHEN 'reb_ast' THEN g.reb+g.ast WHEN 'stocks' THEN g.stl+g.blk END")
SINGLES = {"points", "rebounds", "assists", "threes_made", "steals", "blocks", "turnovers"}


def pay(k, mode, won, n_void):
    n = k - n_void
    if n <= 1:
        return 1.0                       # refund
    if mode == "power":
        return POWER[n] if won == n else 0.0
    if n < 3:                            # a flex that fell to 2 picks pays as a 2-pick power
        return POWER[2] if won == 2 else 0.0
    return FLEX[n].get(won, 0.0)


def load(conn):
    q = f"""WITH reg AS (SELECT DISTINCT b.game_date, m.player_id::text pid, {CASE} prop, b.line::float8 line, b.side
                         FROM nba_market.board_snapshots b JOIN nba_ref.player_name_map m ON m.norm_name = nba_ref.norm_name(b.player)
                         WHERE b.bookmaker = 'prizepicks' AND b.snapshot_label = 'window' AND b.market_key NOT LIKE '%%alternate' AND b.side IN ('Over','Under')
                           AND b.line % 1 = 0.5),
                 s AS (SELECT s.season, s.game_date, s.player_id::text pid, s.game_id, s.prop, s.line::float8 line, s.side, s.final_hp::float8 hp,
                              s.score::float8 score, s.confidence::float8 conf
                       FROM nba_score.board_scored_v2 s JOIN reg r ON r.game_date = s.game_date AND r.pid = s.player_id::text AND r.prop = s.prop
                            AND r.line = s.line::float8 AND r.side = s.side
                       WHERE s.app = 'prizepicks' AND s.game_date <= '2026-11-20')
            SELECT s.*, ({STATV})::float8 v, coalesce(g.min, 0)::float8 mins
            FROM s LEFT JOIN nba_stats.player_game_log g ON g.nba_player_id::text = s.pid AND g.game_date = s.game_date"""
    d = pd.read_sql(q.replace("%%", "%"), conn)
    d = d.drop_duplicates(["game_date", "pid", "prop", "line", "side"])
    played = (d["mins"] > 0) & d["v"].notna()
    d["res"] = np.where(~played | (d["v"] == d["line"]), -1, np.where((d["v"] > d["line"]) == (d["side"] == "Over"), 1, 0))   # -1 void
    return d


def run(day_legs, key, k, mode, S, ladder):
    """day_legs: list per day of arrays (res) sorted by key desc, one leg per player. Returns per-day units (stake 1 per slip) and slips."""
    out = []
    for res in day_legs:
        n = len(res)
        if ladder:
            m = min(S, n - k + 1)
            idx = [range(i, i + k) for i in range(max(m, 0))]
        else:
            m = min(S, n // k)
            idx = [range(i * k, i * k + k) for i in range(m)]
        u = 0.0
        for ix in idx:
            r = res[list(ix)]
            u += pay(k, mode, int((r == 1).sum()), int((r == -1).sum())) - 1.0
        out.append((u, len(idx)))
    return out


def stats(per_day):
    u = np.array([x[0] for x in per_day]); s = np.array([x[1] for x in per_day])
    act = s > 0
    if s.sum() == 0:
        return None
    eq = np.cumsum(u); dd = float(np.max(np.maximum.accumulate(np.concatenate([[0], eq]))[1:] - eq)) if len(eq) else 0.0
    run_, best = 0, 0
    for x in u[act]:
        run_ = run_ + 1 if x < 0 else 0; best = max(best, run_)
    return {"slips": int(s.sum()), "units": float(u.sum()), "roi": float(u.sum() / s.sum()), "up": float((u[act] > 0).mean()), "worst": float(u.min()),
            "dd": dd, "lrun": best, "days": int(act.sum())}


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    d = load(conn); conn.close()
    print(f"SB|PrizePicks regular legs on the store: {len(d):,} | graded {int((d['res'] >= 0).sum()):,} | voids {int((d['res'] < 0).sum()):,} | "
          + ", ".join(f"{s} {len(g):,} legs / {g['game_date'].nunique()} days" for s, g in d.groupby("season")), flush=True)
    g = d[d["res"] >= 0]
    for s, x in g.groupby("season"):
        q = pd.qcut(x["hp"].rank(method="first"), 10, labels=False)
        print(f"SB|{s} single leg by final_hp tenth (hit vs break-even 2-pick 57.7%): " + " | ".join(f"{100*y['hp'].mean():.0f}->{100*y['res'].mean():.1f}" for _, y in x.groupby(q)), flush=True)
    seasons = sorted(d["season"].unique())
    grid = list(itertools.product(("hp", "score"), ("any", "Over", "Under"), ("all", "singles"), (0.0, 0.55, 0.60, 0.65, 0.70),
                                  (2, 3, 4, 5, 6), ("power", "flex"), (1, 2, 3, 5, 8), (False, True)))
    grid = [x for x in grid if not (x[5] == "flex" and x[4] == 2)]
    pools = {}
    for key, side, props, mn in {(a, b, c, e) for a, b, c, e, *_ in grid}:
        x = d
        if side != "any":
            x = x[x["side"] == side]
        if props == "singles":
            x = x[x["prop"].isin(SINGLES)]
        x = x[x["hp"] >= mn].sort_values(["game_date", key], ascending=[True, False]).drop_duplicates(["game_date", "pid"])
        pools[(key, side, props, mn)] = {s: [y["res"].values for _, y in x[x["season"] == s].groupby("game_date")] for s in seasons}
    rows = []
    for key, side, props, mn, k, mode, S, lad in grid:
        if lad and S == 1:
            continue
        r = {"key": key, "side": side, "props": props, "min": mn, "k": k, "mode": mode, "S": S, "ladder": lad}
        ok = True
        for s in seasons:
            st = stats(run(pools[(key, side, props, mn)][s], key, k, mode, S, lad))
            if st is None or st["slips"] < 30:
                ok = False; break
            for a, b in st.items():
                r[f"{s}:{a}"] = b
        if ok:
            r["worst_roi"] = min(r[f"{s}:roi"] for s in seasons)
            rows.append(r)
    t = pd.DataFrame(rows)
    top = int(os.environ.get("SB_TOP", "40"))
    pos = t[t["worst_roi"] > 0]
    print(f"SB|strategies tested: {len(t):,} | positive in all three seasons: {len(pos):,}", flush=True)

    def line(r):
        return (f"SB|  {r['key']:5s} {r['side']:5s} {r['props']:7s} hp>={r['min']:.2f} {r['k']}-pick {r['mode']:5s} S{r['S']} {'ladder' if r['ladder'] else 'disjoint'} | "
                + " | ".join(f"{s}: {r[f'{s}:slips']} slips ROI {100*r[f'{s}:roi']:+.1f}% units {r[f'{s}:units']:+.0f} up {100*r[f'{s}:up']:.0f}% worst {r[f'{s}:worst']:+.1f} dd {r[f'{s}:dd']:.0f} run {r[f'{s}:lrun']}"
                             for s in seasons))
    print("SB|================ TOP BY THE WORST SEASON'S ROI ================", flush=True)
    for _, r in t.sort_values("worst_roi", ascending=False).head(top).iterrows():
        print(line(r), flush=True)
    print("SB|================ BASE: rank final_hp, any side, all props, no minimum, disjoint, 1 and 3 slips a day ================", flush=True)
    b = t[(t["key"] == "hp") & (t["side"] == "any") & (t["props"] == "all") & (t["min"] == 0) & (~t["ladder"]) & (t["S"].isin([1, 3]))]
    for _, r in b.sort_values(["S", "k", "mode"]).iterrows():
        print(line(r), flush=True)
    print("SB|DONE", flush=True)


if __name__ == "__main__":
    main()
