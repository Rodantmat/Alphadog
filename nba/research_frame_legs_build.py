#!/usr/bin/env python3
"""
THE SHARED FRAME, LEGS (owner 2026-11-27: research and production must be ONE computation). Builds nba_score.frame_legs: for every slate of one app, every leg
the live engine's own day_legs() sees on that day's board (final_live.day_legs, the same code production runs), with the baseline probability read from the
parallel store baseline_history_v2 (the production day builder replayed with the honest recipe) and the leg's RESULT as the app grades it:
  hit 1 / 0 = won / lost;  hit NULL + res 'push' = the stat landed on the line;  hit NULL + res 'dnp' = the player did not play.  Void legs are KEPT (the old
  research tables dropped them, which production cannot do: 12-27% of the merged slips hold one).
Writes ONLY nba_score.frame_legs (scratch). Env: DATABASE_URL, FL_APP (prizepicks | underdog | sleeper | fliff), FL_FROM, FL_TO (default whole history), FL_PH (default v2).
"""
import datetime as dt
import os
import sys
import time

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import final_live as FL                                         # noqa: E402  (reads FL_APP)
import research_app_final_strategies as AF                      # noqa: E402

APP = FL.APP
PH = os.environ.get("FL_PH") or "v2"
D0 = os.environ.get("FL_FROM") or "2024-10-01"
D1 = os.environ.get("FL_TO") or str(dt.date.today() - dt.timedelta(days=1))
T0 = time.time()
COLS = ["app", "season", "game_date", "player_id", "prop", "side", "line", "kind", "tier", "m", "ph", "p_stored", "event_id", "hit", "res"]


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def slate_dates(conn):
    if APP == "prizepicks":
        q = "SELECT DISTINCT game_date::text FROM nba_market.pp_leg_price WHERE snapshot_label = 'window' AND game_date BETWEEN %s AND %s"
        ds = [r[0] for r in conn.execute(q, (D0, D1)).fetchall()]
    elif APP == "underdog":
        ds = [str(d) for d in AF.slate_days(conn) if D0 <= str(d) <= D1]
    else:
        q = "SELECT DISTINCT game_date::text FROM nba_market.board_snapshots WHERE bookmaker = %s AND snapshot_label = 'window' AND game_date BETWEEN %s AND %s"
        ds = [r[0] for r in conn.execute(q, (APP, D0, D1)).fetchall()]
    return sorted(ds)


def grade_day(df, st):
    """hit / res of each leg from the box score, the way the apps grade: no minutes -> dnp; stat on the line -> push"""
    hit = np.full(len(df), np.nan); res = np.empty(len(df), dtype=object)
    for i, (pid, pr, sd, ln) in enumerate(zip(df["player_id"].astype(str), df["prop"], df["side"], df["line"])):
        s = st.get(pid)
        if not s or not s["min"]:
            res[i] = "dnp"; continue
        v = AF.STAT[pr](s)
        if v == float(ln):
            res[i] = "push"; continue
        over = str(sd).lower()[0] in ("o", "m", "h")
        hit[i] = float((v > ln) if over else (v < ln)); res[i] = "won" if hit[i] == 1 else "lost"
    df["hit"] = hit; df["res"] = res
    return df


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.frame_legs (app text, season text, game_date date, player_id text, prop text, side text, line float8, kind text,
                    tier text, m float8, ph float8, p_stored float8, event_id text, hit int, res text)""")
    conn.execute("CREATE INDEX IF NOT EXISTS frame_legs_i ON nba_score.frame_legs (app, game_date)"); conn.commit()
    days = slate_dates(conn); log(f"{APP}: {len(days)} slates {D0} .. {D1}, baseline source {PH}")
    n_all = 0
    for i, gd in enumerate(days):
        try:
            df = FL.day_legs(conn, gd, PH)
        except Exception as ex:
            conn.rollback(); log(f"{APP} {gd}: FAILED {str(ex)[:160]}"); continue
        if df is None or not len(df):
            continue
        st = AF.box(conn, gd)
        df = grade_day(df.copy(), st)
        df["game_date"] = gd; df["event_id"] = df["event_id"].astype(str) if "event_id" in df.columns else None
        df = df[COLS]
        with conn.cursor() as cur:
            cur.execute("DELETE FROM nba_score.frame_legs WHERE app = %s AND game_date = %s", (APP, gd))
            with cur.copy("COPY nba_score.frame_legs (" + ", ".join(COLS) + ") FROM STDIN") as cp:
                for r in df.itertuples(index=False):
                    v = [None if (isinstance(x, float) and x != x) else x for x in r]
                    v[COLS.index("hit")] = None if v[COLS.index("hit")] is None else int(v[COLS.index("hit")])
                    cp.write_row(v)
        conn.commit(); n_all += len(df)
        if i % 10 == 9 or i == len(days) - 1:
            log(f"{APP} {gd}: {len(df)} legs (ph present {df['ph'].notna().mean():.0%}, void {int(df['hit'].isna().sum())}); total {n_all:,}")
        if i % 40 == 39:
            conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    for r in conn.execute("""SELECT season, count(*), count(DISTINCT game_date), round(100.0 * avg((hit IS NULL)::int), 1), round(100.0 * avg((ph IS NULL)::int), 1)
                             FROM nba_score.frame_legs WHERE app = %s GROUP BY 1 ORDER BY 1""", (APP,)).fetchall():
        log(f"FRAME|{APP} {r[0]}: {r[1]:,} legs on {r[2]} slates; void {r[3]}%; no baseline {r[4]}%")
    conn.close()


if __name__ == "__main__":
    main()
