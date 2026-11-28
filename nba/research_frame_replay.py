#!/usr/bin/env python3
"""
THE FINAL SET ON THE SHARED FRAME, EVERY PAST SLATE (owner 2026-11-27: "once qualified we cannot have different numbers").
Runs the live engine's own functions (final_live.build_frame / materialize / merge_set) on each slate of nba_score.frame_legs with the walk-forward predictions of
nba_score.frame_legs_p (fitted on the months before, exactly as production fits them), the honest baseline (baseline_history_v2) and the honest day scores
(board_scored_v2), and grades every slip the way the app does, VOID LEGS INCLUDED: a leg whose player did not play, or whose stat landed on the line, leaves the slip
(the slip pays as a pick smaller: Flex k-1, a Flex under 3 picks becomes a 2-pick Power, under 2 picks the stake is refunded).
Writes nba_score.frame_slips (app, set, game_date, code, merged, j, st, k, profit, nvoid, players) - one row per slip - and prints FR| summaries. Writes nothing else.
Env: DATABASE_URL, FL_APP, FL_SET_NAME (a candidate set under final_candidates/), FR_FROM, FR_TO, FR_TAG (label stored with the rows, default the set name or 'final').
"""
import json
import os
import sys
import time
from collections import defaultdict

os.environ["LM_SRC"] = "frame"
import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import final_live as FL                                         # noqa: E402

APP = FL.APP
TAG = os.environ.get("FR_TAG") or os.environ.get("FL_SET_NAME") or "final"
D0 = os.environ.get("FR_FROM") or "2024-10-01"
D1 = os.environ.get("FR_TO") or str(__import__("datetime").date.today() - __import__("datetime").timedelta(days=1))
T0 = time.time()


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def grade_void(rows, st, k, slp):
    """profit of one slip, voids shrinking it (None = a leg without a result yet)"""
    w = [r.get("w") for r in rows]
    if any(x is None for x in w):
        return None, 0
    live = [r for r in rows if r["w"] == r["w"]]
    nv = len(rows) - len(live)
    if nv == 0:
        return FL.grade(rows, st, k, slp), 0
    k2 = len(live)
    if k2 < 2:
        return 0.0, nv
    st2 = "power" if (st == "flex" and k2 < 3) else st
    return FL.grade(live, st2, k2, slp), nv


def main():
    import research_leg_model_h as LM
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    LM.LIVE = None
    df, X = LM.load(conn)
    df = df.reset_index(drop=True); X = X.reset_index(drop=True)
    pp = pd.read_sql("""SELECT game_date::text gd, player_id, prop, side, line::float8 line, kind, p_blend::float8 p_blend, p_gbm::float8 p_gbm, p_gbm_s::float8 p_gbm_s
                        FROM nba_score.frame_legs_p WHERE app = %s""", conn, params=(APP,))
    k_ = ["gd", "player_id", "prop", "side", "line", "kind"]
    df["_row"] = np.arange(len(df))
    mg = df[k_ + ["_row"]].merge(pp.drop_duplicates(k_), on=k_, how="left").sort_values("_row")
    P = {"blend": mg["p_blend"].values, "gbm": mg["p_gbm"].values, "gbm_s": mg["p_gbm_s"].values}
    log(f"{APP}: {len(df):,} frame legs, predictions on {int(np.isfinite(P['gbm']).sum()):,}")
    bsall = pd.read_sql("""SELECT game_date::text gd, player_id, player, prop, line::float8 line, lower(side) side, final_hp::float8 fhp, score::float8 score, confidence::float8 conf
                           FROM nba_score.board_scored_v2 WHERE app = %s""", conn, params=(APP,))
    bsd = {g: x.drop(columns=["gd"]) for g, x in bsall.groupby("gd")}
    slp = None
    if APP == "sleeper":
        import sleeper_live_slip_engine as SL
        slp = SL.pricing(conn)
    dates = [g for g in sorted(set(df["gd"])) if D0 <= g <= D1 and np.isfinite(P["gbm"][df["gd"].values == g]).any()]
    log(f"{APP}: {len(dates)} slates with predictions {dates[0] if dates else ''} .. {dates[-1] if dates else ''}, set {TAG} ({len(FL.SET)} strategies)")
    rows = []
    for i, gd in enumerate(dates):
        d = FL.build_frame(conn, df, X, P, gd=gd, bs=bsd.get(gd))
        d["w"] = np.where(d["hit_raw"].notna(), d["hit_raw"], np.nan)
        # a leg with no known result at all is an ungraded leg; a voided one carries w = NaN and is flagged by the frame (res)
        per, merged = FL.day_slips(d)
        keep = {(m["code"], m["j"]) for m in merged}
        for sg in FL.SET:
            for j, s in enumerate(per.get(sg["code"], [])):
                rr = [dict(r, w=(None if r.get("hit_raw") is None else r["w"])) for r in s]
                prof, nv = grade_void(rr, sg["st"], sg["k"], slp)
                rows.append((APP, TAG, gd, sg["code"], (sg["code"], j) in keep, j, sg["st"], sg["k"], prof, nv, ".".join(str(r["player_id"]) for r in s)))
        if i % 25 == 24:
            log(f"{gd}: {len(rows):,} slips so far")
    conn.close()
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.frame_slips (app text, tag text, game_date date, code text, merged bool, j int, st text, k int, profit float8, nvoid int,
                    players text)""")
    conn.execute("DELETE FROM nba_score.frame_slips WHERE app = %s AND tag = %s AND game_date BETWEEN %s AND %s", (APP, TAG, D0, D1))
    with conn.cursor() as cur:
        with cur.copy("COPY nba_score.frame_slips (app, tag, game_date, code, merged, j, st, k, profit, nvoid, players) FROM STDIN") as cp:
            for r in rows:
                cp.write_row(r)
    conn.execute("CREATE INDEX IF NOT EXISTS frame_slips_i ON nba_score.frame_slips (app, tag, game_date)")
    conn.commit()
    for lab, q in (("merged", "merged"), ("standalone", "true")):
        for r in conn.execute(f"""SELECT CASE WHEN game_date < '2025-07-01' THEN '24-25' WHEN game_date < '2026-07-01' THEN '25-26' ELSE '26-27' END s, count(*), count(DISTINCT game_date),
                                  round(sum(profit)::numeric, 1), round(100 * avg(profit)::numeric, 1), sum((nvoid > 0)::int), sum((profit IS NULL)::int)
                                  FROM nba_score.frame_slips WHERE app = %s AND tag = %s AND {q} GROUP BY 1 ORDER BY 1""", (APP, TAG)).fetchall():
            log(f"FR|{APP} {TAG} {lab} {r[0]}: slips {r[1]:,} on {r[2]} days, units {r[3]}, ROI {r[4]}%, slips with a void leg {r[5]}, ungraded {r[6]}")
    conn.close()
    print("FR|DONE", flush=True)


if __name__ == "__main__":
    main()
