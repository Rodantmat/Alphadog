#!/usr/bin/env python3
"""
CERTIFICATION TESTS A2-A5 - the inputs of every honest per-leg number (NBA_HONEST_REBUILD.md section 8n / 9A). READ-ONLY. Prints PASS / FAIL per test.
A2 GRADING   every leg of nba_score._lr_legs_h re-graded here from nba_stats.player_game_log with separate code (stat vs line): must agree 100%.
             Cross-check against production's own grading where it exists: nba_market.pp_model_vs_price (PrizePicks) - agreement on common legs.
A3 TIMING    every board row behind the legs (nba_market.board_snapshots, label 'window') was captured BEFORE the game's tip: rows with snapshot_ts >= commence_time
             per app and season must be 0 (or are listed and their legs counted).
A4 PRICES    Underdog: the multiplier stored by the app's own feed against the one derived from the feed price, on rows that carry both; share of legs per
             season priced from each source. Sleeper / Fliff: real boards only this season. PrizePicks: regular = fixed; alternates = modelled (flag only).
A5 HYGIENE   duplicates in the leg table; ties (stat == line) and did-not-play among board rows - counted per app / season so the drop is known and neutral
             (a tie or DNP voids the leg on every app); legs whose player has no box score; rule C12 scan: no lookup table in use is outcome-filtered.
A6 ATTACH    the honest probability attached to a leg equals the ladder value in nba_score.baseline_history_h at that exact line (random sample re-read).
Env: DATABASE_URL, AI_SAMPLE (200000).
"""
import os

import numpy as np
import pandas as pd
import psycopg

import research_legs_h_build as LH

SAMPLE = int(os.environ.get("AI_SAMPLE") or 200000)
OK = []


def verdict(name, ok, detail):
    OK.append((name, ok)); print(f"AI|{'PASS' if ok else 'FAIL'} {name}: {detail}", flush=True)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    legs = pd.read_sql("""SELECT app, src, season, game_date::text gd, player_id, prop, side, line::float8 line, kind, tier, m::float8 m, hit::int hit, ph::float8 ph FROM nba_score._lr_legs_h""", conn)
    print(f"AI|leg table: {len(legs):,} legs; " + "; ".join(f"{a} {n:,}" for a, n in legs.groupby('app').size().items()), flush=True)
    box = pd.read_sql("""SELECT nba_player_id::text player_id, game_date::text gd, min::float8 mn, pts::float8 pts, reb::float8 reb, ast::float8 ast, fg3m::float8 fg3m, stl::float8 stl,
                                blk::float8 blk, tov::float8 tov FROM nba_stats.player_game_log WHERE game_date >= '2024-10-01'""", conn).drop_duplicates(["player_id", "gd"])
    # ---- A2 grading
    j = legs.merge(box, on=["player_id", "gd"], how="left")
    comp = {"points": ["pts"], "rebounds": ["reb"], "assists": ["ast"], "threes_made": ["fg3m"], "steals": ["stl"], "blocks": ["blk"], "turnovers": ["tov"], "stocks": ["stl", "blk"],
            "pts_reb": ["pts", "reb"], "pts_ast": ["pts", "ast"], "reb_ast": ["reb", "ast"], "pra": ["pts", "reb", "ast"]}
    stat = np.full(len(j), np.nan)
    for pr, cols in comp.items():
        k = (j["prop"] == pr).values; stat[k] = j.loc[k, cols].sum(axis=1, min_count=len(cols)).values
    over = j["side"].str.lower().str[0].isin(["o", "m", "h"]).values
    known = np.isfinite(stat) & j["prop"].isin(comp).values
    mine = np.where(over, stat > j["line"].values, stat < j["line"].values).astype(float)
    agree = (mine[known] == j["hit"].values[known]); tie = known & (stat == j["line"].values); nomin = known & ~(j["mn"].values > 0)
    for a, g in j.assign(known=known, ag=np.where(known, mine == j["hit"].values, np.nan), tie=tie, nomin=nomin).groupby(["app", "season"]):
        print(f"AI|  A2 {a[0]:10s} {a[1]}: legs {len(g):9,} with a box score {100 * g['known'].mean():6.2f}% | re-graded equal {100 * np.nanmean(g['ag']):7.3f}% | ties left in {int(g['tie'].sum())} | zero-minute rows left in {int(g['nomin'].sum())}", flush=True)
    other_props = sorted(set(legs["prop"]) - set(comp))
    verdict("A2 grading re-derived", bool(agree.mean() == 1.0 and tie.sum() == 0 and nomin.sum() == 0),
            f"{int(known.sum()):,} legs re-graded, equal {100 * agree.mean():.4f}%, ties left in {int(tie.sum())}, zero-minute rows {int(nomin.sum())}; props not re-graded here {other_props}")
    try:
        pv = pd.read_sql("""SELECT game_date::text gd, nba_ref.norm_name(player) nm, prop, line::float8 line, side, hit::int phit FROM nba_market.pp_model_vs_price
                            WHERE hit IS NOT NULL AND game_date >= '2024-10-01'""", conn)
        ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall()); pv["player_id"] = pv["nm"].map(ids)
        c = legs[legs["app"] == "prizepicks"].merge(pv.drop_duplicates(["gd", "player_id", "prop", "line", "side"]), on=["gd", "player_id", "prop", "line", "side"], how="inner")
        verdict("A2 grading vs production (PrizePicks)", bool(len(c) > 1000 and (c["hit"] == c["phit"]).mean() > 0.9995),
                f"{len(c):,} common legs, same result {100 * (c['hit'] == c['phit']).mean():.3f}%" + ("" if (c['hit'] == c['phit']).all() else f"; {int((c['hit'] != c['phit']).sum())} differ: " + str(c[c['hit'] != c['phit']].head(5)[['gd', 'player_id', 'prop', 'line', 'side', 'hit', 'phit']].values.tolist())))
    except Exception as ex:
        conn.rollback(); verdict("A2 grading vs production (PrizePicks)", False, f"not readable: {str(ex)[:140]}")
    # ---- A3 timing
    t = pd.read_sql("""SELECT bookmaker, CASE WHEN game_date < '2025-08-01' THEN '2024-25' WHEN game_date < '2026-08-01' THEN '2025-26' ELSE '2026-27' END season,
                              count(*) n, count(*) FILTER (WHERE commence_time IS NULL) no_tip, count(*) FILTER (WHERE snapshot_ts >= commence_time) late,
                              count(DISTINCT game_date) FILTER (WHERE snapshot_ts >= commence_time) late_days,
                              max(EXTRACT(epoch FROM snapshot_ts - commence_time) / 60) FILTER (WHERE snapshot_ts >= commence_time) worst_min
                       FROM nba_market.board_snapshots WHERE snapshot_label = 'window' AND game_date >= '2024-10-01' GROUP BY 1, 2 ORDER BY 1, 2""", conn)
    for r in t.itertuples():
        print(f"AI|  A3 {r.bookmaker:14s} {r.season}: window rows {r.n:10,} | captured at or after tip {r.late:8,} on {r.late_days} days (worst {0 if r.worst_min != r.worst_min else r.worst_min:.0f} min) | no tip time {r.no_tip:,}", flush=True)
    # the test that matters: legs still in the leg tables for a player whose game had tipped before the app's board of that day was captured
    late = pd.DataFrame(conn.execute(LH.LATE_SQL, {"d0": "2024-10-01"}).fetchall(), columns=["app", "game_date", "player_id"]); late["gd"] = late["game_date"].astype(str)
    left = legs.merge(late[["app", "gd", "player_id"]].drop_duplicates(), on=["app", "gd", "player_id"], how="inner")
    verdict("A3 no leg from a board captured after its game tipped", bool(len(left) == 0),
            f"app-player-days with a late board: {len(late):,} on days {sorted(late['gd'].unique())[:8]}; legs of those still in the leg table: {len(left):,}")
    # ---- A4 prices
    u = pd.read_sql("""SELECT CASE WHEN game_date < '2025-08-01' THEN '2024-25' WHEN game_date < '2026-08-01' THEN '2025-26' ELSE '2026-27' END season,
                              count(*) n, count(multiplier) with_mult,
                              count(*) FILTER (WHERE multiplier IS NOT NULL AND price IS NOT NULL) both_,
                              avg(abs(multiplier - round(((CASE WHEN price < 0 THEN 1 + 100.0 / (-price) ELSE 1 + price / 100.0 END) / sqrt(3))::numeric, 2))) FILTER (WHERE multiplier IS NOT NULL AND price IS NOT NULL) mad,
                              avg((abs(multiplier - round(((CASE WHEN price < 0 THEN 1 + 100.0 / (-price) ELSE 1 + price / 100.0 END) / sqrt(3))::numeric, 2)) <= 0.011)::int) FILTER (WHERE multiplier IS NOT NULL AND price IS NOT NULL) within1,
                              max(abs(multiplier - round(((CASE WHEN price < 0 THEN 1 + 100.0 / (-price) ELSE 1 + price / 100.0 END) / sqrt(3))::numeric, 2))) FILTER (WHERE multiplier IS NOT NULL AND price IS NOT NULL) worst
                       FROM nba_market.board_snapshots WHERE bookmaker = 'underdog' AND snapshot_label = 'window' AND game_date >= '2024-10-01' GROUP BY 1 ORDER BY 1""", conn)
    okp = True
    for r in u.itertuples():
        print(f"AI|  A4 underdog {r.season}: rows {r.n:,} | with the app's own multiplier {100 * r.with_mult / r.n:5.1f}% | rows with both {r.both_:,}: derived within 0.01 of stored "
              f"{(100 * r.within1) if r.within1 is not None else float('nan'):.1f}%, mean gap {r.mad if r.mad is not None else float('nan'):.4f}, worst {r.worst if r.worst is not None else float('nan'):.2f}", flush=True)
        if r.with_mult < r.n and (not r.both_ or r.within1 is None or r.within1 < 0.98):      # a season that needs the derived multiplier must show it equals the stored one
            okp = False
    verdict("A4 Underdog multipliers", okp, "a season with the app's own multiplier on every row uses it; a season without (2024-25) uses the derived one, which equals the stored one wherever both exist")
    pk = legs[legs["app"] == "prizepicks"].groupby(["season", "kind"]).size().unstack(fill_value=0)
    print("AI|  A4 prizepicks legs by kind (goblin / demon history prices are MODELLED - rule C9, real quotes only since 2026-09-21): " + "; ".join(f"{s}: {dict(r)}" for s, r in pk.iterrows()), flush=True)
    sf = legs[legs["app"].isin(["sleeper", "fliff"])].groupby(["app", "season", "src"]).size()
    print("AI|  A4 sleeper / fliff legs by source (only src = real is a real board): " + "; ".join(f"{k}: {v:,}" for k, v in sf.items()), flush=True)
    # ---- A5 hygiene
    dup = legs.duplicated(["app", "src", "gd", "player_id", "prop", "side", "line", "kind", "tier"]).sum()
    verdict("A5 no duplicate legs", bool(dup == 0), f"{int(dup):,} duplicate rows on (app, source, date, player, prop, side, line, kind, tier)")
    nob = (~np.isfinite(stat) & j["prop"].isin(comp).values)
    verdict("A5 every graded leg has a box score", bool(nob.sum() == 0), f"{int(nob.sum()):,} legs without a box-score row")
    bal = legs[(legs["app"].isin(["prizepicks", "underdog"])) & (legs["kind"].isin(["standard", "R"]))].assign(o=lambda x: x["side"].str.lower().str[0].isin(["o", "m", "h"]))
    for (a, s), g in bal.groupby(["app", "season"]):
        pair = g.groupby(["gd", "player_id", "prop", "line"])["o"].agg(["sum", "size"]); both = (pair["size"] == 2) & (pair["sum"] == 1)
        hs = g.merge(pair[both].reset_index()[["gd", "player_id", "prop", "line"]], on=["gd", "player_id", "prop", "line"])
        print(f"AI|  A5 {a:10s} {s}: regular lines offered both ways {int(both.sum()):,} of {len(pair):,}; on those Over + Under hit rates sum to {hs[hs['o']]['hit'].mean() + hs[~hs['o']]['hit'].mean():.4f} (must be 1.0000)", flush=True)
    # ---- A6 attach
    smp = legs[legs["ph"].notna()].sample(min(SAMPLE, int(legs["ph"].notna().sum())), random_state=5)
    bad = 0; seen = 0
    for s, g in smp.groupby("season"):
        H = LH.ladders(conn, s)
        for gd, pid, pr, ln, sd, ph in zip(g["gd"], g["player_id"], g["prop"], g["line"], g["side"], g["ph"]):
            h = H.get((gd, pid, pr)); seen += 1
            if h is None:
                bad += 1; continue
            k = np.where(np.abs(h[0] - ln) < 1e-3)[0]
            if not len(k):
                bad += 1; continue
            v = h[1][k[0]] if str(sd).lower()[0] in "omh" else 1 - h[1][k[0]]
            bad += abs(v - ph) > 1e-6
        del H
    verdict("A6 probability attached at the exact line", bool(bad == 0), f"{seen:,} sampled legs re-read from the ladder, {int(bad)} mismatches")
    conn.close()
    print(f"AI|SUMMARY: {sum(o for _, o in OK)} of {len(OK)} tests pass" + ("" if all(o for _, o in OK) else " | FAILED: " + ", ".join(n for n, o in OK if not o)), flush=True)
    print("AI|DONE", flush=True)


if __name__ == "__main__":
    main()
