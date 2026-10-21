#!/usr/bin/env python3
"""
AUDIT - the confidence refit's per-prop query, OLD (market aggregates as CTEs, recomputed per prop) vs NEW (materialised
once into tmp_rm / tmp_bt) - identical rows, and how long each takes (2026-10-21). READ-ONLY: temp tables only.
Why: 10-21 P2B stopped at the refit (~30 min per prop; first refit with the live season 2026-27 in the fit).
Per prop in AC_PROPS: both queries on the same tmp_graded, rows compared exactly (sorted; floats to 1e-9), timings printed.
The old query gets a statement_timeout (AC_OLD_TIMEOUT_MIN, default 20) so one slow prop cannot hang the audit; a timed-out
prop is reported and NOT counted as parity. Then the NEW query alone over every prop, timed (the real refit's cost).
Env: DATABASE_URL, AC_PROPS (default dreb,fga,assists,steals), AC_OLD_TIMEOUT_MIN.
"""
import os
import sys
import time

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_confidence_v3 as C  # noqa: E402

OLD_SQL = """
            WITH rm AS (
                SELECT game_date, lower(regexp_replace(player,'[^A-Za-z]','','g')) AS nm, line,
                       max(books) AS books, avg(p_over_book) AS p_over_book
                FROM nba_market.rung_market GROUP BY 1,2,3
            ),
            bt AS (
                SELECT game_date, lower(regexp_replace(player,'[^A-Za-z]','','g')) AS nm, line, side,
                       min(kind) AS kind, min(tier) AS tier
                FROM nba_market.board_tiers_v2 WHERE snapshot_label='window' AND bookmaker='prizepicks' GROUP BY 1,2,3,4
            )
            SELECT f.season, f.game_date, f.prop, f.side, f.phase, f.final_hp, f.anchor,
                   f.n_uncertain, f.ladder_offset, f.player_id,
                   b.proj_min, b.rate36, b.used_emp, b.role_tier,
                   rm.books, rm.p_over_book, bt.kind, bt.tier, g.won
            FROM tmp_graded g
            JOIN nba_score.final_hp f
              ON f.game_date=g.game_date AND f.player_id=g.player_id AND f.prop=g.prop
             AND f.line=g.line AND f.side=g.side
            LEFT JOIN nba_score.baseline_history b
              ON b.game_date=g.game_date AND b.player_id=g.player_id AND b.prop=g.prop AND b.line=g.line
            LEFT JOIN rm ON rm.game_date=g.game_date AND rm.nm=g.nm AND rm.line=g.line
            LEFT JOIN bt ON bt.game_date=g.game_date AND bt.nm=g.nm AND bt.line=g.line AND bt.side=g.side
            WHERE f.season = ANY(%s) AND f.prop = %s AND g.prop = %s
              AND NOT (coalesce(f.game_id, '') LIKE '004%%' OR coalesce(f.game_id, '') LIKE '005%%')
            """

GRADED_SQL = """
            CREATE TEMP TABLE tmp_graded AS
            SELECT o.game_date, o.line, o.side, m.player_id,
                   replace(replace(o.market_key,'player_',''),'_alternate','') AS prop,
                   lower(regexp_replace(o.player,'[^A-Za-z]','','g')) AS nm,
                   CASE WHEN o.side='Over' THEN (o.leg_result='over_win')::int
                        ELSE (o.leg_result='under_win')::int END AS won
            FROM nba_market.board_outcomes o
            JOIN nba_ref.player_name_map m
              ON m.norm_name = nba_ref.norm_name(o.player)
            WHERE o.leg_result IN ('over_win','under_win')"""


def norm(df):
    d = df.copy()
    for c in d.columns:
        if d[c].dtype == object:
            d[c] = d[c].astype(str)
    d = d.sort_values(list(d.columns)).reset_index(drop=True)
    return d


def same(a, b):
    if a.shape != b.shape:
        return False, f"shape {a.shape} vs {b.shape}"
    a, b = norm(a), norm(b)
    for c in a.columns:
        x, y = a[c], b[c]
        if pd.api.types.is_numeric_dtype(x) and pd.api.types.is_numeric_dtype(y):
            xa, ya = x.astype(float).to_numpy(), y.astype(float).to_numpy()
            ok = np.allclose(xa, ya, rtol=0, atol=1e-9, equal_nan=True)
        else:
            ok = (x.astype(str).to_numpy() == y.astype(str).to_numpy()).all()
        if not ok:
            return False, f"column {c} differs"
    return True, "identical"


def main():
    sys.path.insert(0, "nba")
    from nba_season import stats_seasons
    seasons = stats_seasons(3)
    props = [p.strip() for p in os.environ.get("AC_PROPS", "dreb,fga,assists,steals").split(",") if p.strip()]
    tmo = int(os.environ.get("AC_OLD_TIMEOUT_MIN", "20"))
    print(f"seasons {seasons} | props {props} | old-query timeout {tmo} min", flush=True)
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute("SET statement_timeout = 0")
        t0 = time.time()
        with conn.cursor() as cur:
            cur.execute("DROP TABLE IF EXISTS tmp_graded")
            cur.execute(GRADED_SQL)
            cur.execute("CREATE INDEX ON tmp_graded (game_date, player_id, prop, line, side)")
            cur.execute("ANALYZE tmp_graded")
        conn.commit()
        print(f"tmp_graded {conn.execute('SELECT count(*) FROM tmp_graded').fetchone()[0]:,} ({time.time() - t0:.0f}s)", flush=True)
        C.materialise_market(conn)
        ok_all, compared = True, 0
        for p in props:
            t1 = time.time()
            new = pd.read_sql(C.PROP_SQL, conn, params=(seasons, p, p))
            tn = time.time() - t1
            conn.execute(f"SET statement_timeout = '{tmo}min'")
            t1 = time.time()
            try:
                old = pd.read_sql(OLD_SQL, conn, params=(seasons, p, p))
                to = time.time() - t1
                res, why = same(old, new)
                compared += 1
                ok_all = ok_all and res
                print(f"  {p:<16} rows {len(new):>9,} | new {tn:7.1f}s | old {to:7.1f}s | {why}", flush=True)
            except Exception as e:  # noqa: BLE001
                conn.rollback()
                print(f"  {p:<16} rows {len(new):>9,} | new {tn:7.1f}s | old TIMED OUT / failed after {time.time() - t1:.0f}s ({type(e).__name__}) - not counted", flush=True)
            conn.execute("SET statement_timeout = 0")
        all_props = [r[0] for r in conn.execute("SELECT DISTINCT prop FROM nba_score.final_hp WHERE season = ANY(%s) ORDER BY 1", (seasons,)).fetchall()]
        t1 = time.time()
        tot = 0
        for p in all_props:
            tot += len(pd.read_sql(C.PROP_SQL, conn, params=(seasons, p, p)))
        print(f"NEW query over all {len(all_props)} props: {tot:,} rows in {time.time() - t1:.0f}s", flush=True)
    ok = ok_all and compared >= 2
    print(f"compared {compared} props old vs new")
    print("AUDIT_PASS" if ok else "AUDIT_FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
