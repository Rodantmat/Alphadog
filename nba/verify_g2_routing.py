#!/usr/bin/env python3
"""
G2 ROUTING VERIFICATION (strategy doc §31s G2; one-off test harness, writes only its own _g2v_* scratch tables).
Proves on a real slate that build_final_hp.py's certified-depth routing changes NOTHING within depth and moves ONLY the deeper rungs:
  capture <label>    copy that slate's final_hp rows and its 'beyond_certified_depth' derived rows (props in G2_PROPS) to scratch
  setdepth <prop> <n> set nba_config.classification_config['selection_certified_depth'].depth[prop] = n (prints old value)
  compare            A = unrouted run, B = routed run (test depth), C = unrouted again:
                       B.final_hp == A rows with |offset| <= test depth   (every value column)
                       B.derived  == A rows with |offset|  > test depth   (every value column)
                       C.final_hp == A and C.derived empty                 (restore is exact)
  cleanup            drop the scratch tables
Env: DATABASE_URL, G2_DATE, G2_PROPS (comma list), G2_TEST_PROP, G2_TEST_DEPTH
"""
import os
import sys

import psycopg

COLS = ("season, game_date, game_id, player_id, prop, line, side, ladder_offset, anchor, baseline_hp, final_hp, cal_shift, "
        "score, edge, confidence, conf_tier, c_exist, c_quality, c_market, prop_tier, band, phase, n_uncertain")
KEY = "game_date, player_id, prop, line, side"


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    mode = sys.argv[1]
    d = os.environ.get("G2_DATE")
    props = [p.strip() for p in os.environ.get("G2_PROPS", "").split(",") if p.strip()]
    if mode == "capture":
        lab = sys.argv[2]
        for suf, src, extra in (("main", "nba_score.final_hp", ""),
                                ("der", "nba_score.final_hp_derived", "AND derivation = 'beyond_certified_depth'")):
            conn.execute(f"DROP TABLE IF EXISTS nba_score._g2v_{lab}_{suf}")
            conn.execute(f"CREATE TABLE nba_score._g2v_{lab}_{suf} AS SELECT {COLS} FROM {src} "
                         f"WHERE game_date = %s AND prop = ANY(%s) {extra}", (d, props))
            n = conn.execute(f"SELECT count(*) FROM nba_score._g2v_{lab}_{suf}").fetchone()[0]
            print(f"captured {lab}_{suf}: {n:,} rows", flush=True)
    elif mode == "setdepth":
        prop, n = sys.argv[2], int(sys.argv[3])
        old = conn.execute("SELECT config_json->'depth'->>%s FROM nba_config.classification_config "
                           "WHERE config_key='selection_certified_depth'", (prop,)).fetchone()[0]
        conn.execute("UPDATE nba_config.classification_config SET config_json = jsonb_set(config_json, ARRAY['depth', %s], to_jsonb(%s::int)) "
                     "WHERE config_key='selection_certified_depth'", (prop, n))
        new = conn.execute("SELECT config_json->'depth'->>%s FROM nba_config.classification_config "
                           "WHERE config_key='selection_certified_depth'", (prop,)).fetchone()[0]
        print(f"depth[{prop}]: {old} -> {new}", flush=True)
    elif mode == "compare":
        tp, td = os.environ["G2_TEST_PROP"], int(os.environ["G2_TEST_DEPTH"])
        fails = 0

        def symdiff(a_sql, b_sql, label):
            nonlocal fails
            q = f"SELECT (SELECT count(*) FROM (({a_sql}) EXCEPT ALL ({b_sql})) x), (SELECT count(*) FROM (({b_sql}) EXCEPT ALL ({a_sql})) y), " \
                f"(SELECT count(*) FROM ({a_sql}) z)"
            ab, ba, n = conn.execute(q).fetchone()
            ok = ab == 0 and ba == 0
            fails += 0 if ok else 1
            print(f"{'PASS' if ok else 'FAIL'}  {label}: rows {n:,} | only-left {ab} | only-right {ba}", flush=True)

        a_in = f"SELECT {COLS} FROM nba_score._g2v_a_main WHERE NOT (prop = '{tp}' AND abs(ladder_offset) > {td})"
        a_out = f"SELECT {COLS} FROM nba_score._g2v_a_main WHERE prop = '{tp}' AND abs(ladder_offset) > {td}"
        symdiff(a_in, f"SELECT {COLS} FROM nba_score._g2v_b_main", "routed run: final_hp == unrouted rows within depth (all props)")
        symdiff(a_out, f"SELECT {COLS} FROM nba_score._g2v_b_der", f"routed run: derived == unrouted rows beyond depth {td} ({tp})")
        symdiff(f"SELECT {COLS} FROM nba_score._g2v_a_main", f"SELECT {COLS} FROM nba_score._g2v_c_main", "restored run: final_hp == unrouted")
        # DIAGNOSTIC: which columns differ between the two unrouted runs A and C (same code, same config)?
        _vc = [c.strip() for c in COLS.split(",") if c.strip() not in [k.strip() for k in KEY.split(",")]]
        _sel = ", ".join(f"count(*) FILTER (WHERE a.{c} IS DISTINCT FROM c.{c}) AS {c}" for c in _vc)
        _row = conn.execute(f"SELECT count(*), {_sel} FROM nba_score._g2v_a_main a JOIN nba_score._g2v_c_main c "
                            f"USING ({KEY})").fetchone()
        print(f"DIAG  A vs C joined on key: {_row[0]:,} legs; differing columns: "
              f"{ {c: v for c, v in zip(_vc, _row[1:]) if v} }", flush=True)
        _cuts = conn.execute("SELECT conf_tier, min(confidence), max(confidence), count(*) FROM nba_score._g2v_a_main "
                             "GROUP BY 1 ORDER BY 2").fetchall()
        _cutc = conn.execute("SELECT conf_tier, min(confidence), max(confidence), count(*) FROM nba_score._g2v_c_main "
                             "GROUP BY 1 ORDER BY 2").fetchall()
        print(f"DIAG  tiers A {_cuts}\nDIAG  tiers C {_cutc}", flush=True)
        # informational: does a fresh rebuild reproduce the stored slate? (inputs such as as-of calibration may have moved since)
        ab, ba = conn.execute(f"SELECT (SELECT count(*) FROM (SELECT {COLS} FROM nba_score._g2v_before_main EXCEPT ALL "
                              f"SELECT {COLS} FROM nba_score._g2v_a_main) x), (SELECT count(*) FROM (SELECT {COLS} FROM "
                              f"nba_score._g2v_a_main EXCEPT ALL SELECT {COLS} FROM nba_score._g2v_before_main) y)").fetchone()
        print(f"INFO  fresh rebuild vs stored slate: only-stored {ab} | only-rebuilt {ba}", flush=True)
        n_out = conn.execute(f"SELECT count(*) FROM ({a_out}) x").fetchone()[0]
        n_ac = conn.execute("SELECT count(*) FROM nba_score._g2v_a_der").fetchone()[0]
        n_cc = conn.execute("SELECT count(*) FROM nba_score._g2v_c_der").fetchone()[0]
        for ok, msg in ((n_out > 0, f"test exercised routing: {n_out:,} rows beyond depth {td}"),
                        (n_ac == 0 and n_cc == 0, f"unrouted runs left no routed rows (A {n_ac}, C {n_cc})")):
            fails += 0 if ok else 1
            print(f"{'PASS' if ok else 'FAIL'}  {msg}", flush=True)
        dup = conn.execute(f"SELECT count(*) FROM (SELECT {KEY} FROM nba_score._g2v_b_main INTERSECT "
                           f"SELECT {KEY} FROM nba_score._g2v_b_der) x").fetchone()[0]
        fails += 0 if dup == 0 else 1
        print(f"{'PASS' if dup == 0 else 'FAIL'}  no leg in both tables in the routed run ({dup})", flush=True)
        print("G2 ROUTING VERIFIED" if fails == 0 else f"G2 ROUTING: {fails} FAILURE(S)", flush=True)
        if fails:
            sys.exit(1)
    elif mode == "cleanup":
        for lab in ("before", "a", "b", "c"):
            for suf in ("main", "der"):
                conn.execute(f"DROP TABLE IF EXISTS nba_score._g2v_{lab}_{suf}")
        print("scratch tables dropped", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
