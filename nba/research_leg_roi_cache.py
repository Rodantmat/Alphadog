#!/usr/bin/env python3
"""
CACHE OF GRADED APP LEGS FOR THE PER-LEG ROI WORK (owner 2026-11-19 09:04 PT: keep testing until it works; the thin apps use this season plus history derived
from earlier seasons). Writes ONE scratch table, nba_score._lr_app_legs (same family as _mf_study_fs), nothing else; loading an app's legs takes 10-15 minutes
through the engines, a few seconds from this table.
  underdog : the app's own archived boards, three seasons (tier R / F1-3 / B1-3, final_hp, baseline_hp, score)
  sleeper / fliff : src 'real' = the app's own boards this season; src 'derived' = earlier seasons priced from sportsbook lines through the app's price model
                    (research_roi_slip_sweep_apps.build_sleeper_fliff)
  pp26 : PrizePicks this season, regular lines only (board snapshot x final_hp); m holds the price factor 1.0
Env: DATABASE_URL, LR_APP (underdog | sleeper | fliff | pp26).
"""
import os
import sys
import time

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
APP = (os.environ.get("LR_APP") or "underdog").lower()
os.environ["APP"] = "UD"; os.environ["SW_APP"] = APP if APP in ("sleeper", "fliff") else "sleeper"
import research_app_final_strategies as AF                  # noqa: E402
import research_roi_slip_sweep_apps as M                    # noqa: E402

T0 = time.time()


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    rows = []

    def add(src, d, legs):
        for l in legs:
            h = l.get("hit")
            if h is None or h != h or l.get("p") is None or not l.get("m"):
                continue
            rows.append((APP, src, AF.season_of(d), d, str(l.get("player_id") or l.get("player") or ""), l["prop"], str(l["side"]), float(l.get("line") or 0),
                         str(l.get("tier") or ""), str(l.get("kind") or ""), float(l["m"]), float(l["p"]),
                         None if l.get("base") is None else float(l["base"]), None if l.get("score") is None else float(l["score"]), int(h)))
    if APP == "pp26":                                        # PrizePicks this season, REGULAR lines only (a line offered both More and Less; price factor 1)
        q = conn.execute("""
          WITH b AS (SELECT DISTINCT ON (game_date, nba_ref.norm_name(player), market_key, side, line) game_date, nba_ref.norm_name(player) pn, market_key, side, line
                     FROM nba_market.board_snapshots WHERE bookmaker='prizepicks' AND snapshot_label='window' AND game_date >= '2026-10-20'
                       AND market_key = ANY(%s) ORDER BY game_date, nba_ref.norm_name(player), market_key, side, line, snapshot_ts DESC),
               two AS (SELECT game_date, pn, market_key, line FROM b GROUP BY 1, 2, 3, 4 HAVING count(DISTINCT side) = 2)
          SELECT b.game_date, nm.player_id::text, b.market_key, b.side, b.line::float, f.final_hp::float, f.baseline_hp::float, f.score::float
          FROM b JOIN two USING (game_date, pn, market_key, line) JOIN nba_ref.player_name_map nm ON nm.norm_name = b.pn
          JOIN nba_score.final_hp f ON f.game_date = b.game_date AND f.player_id = nm.player_id AND f.side = b.side AND f.line = b.line
            AND f.prop = (CASE b.market_key """ + " ".join(f"WHEN '{k}' THEN '{v}'" for k, v in AF.MK.items()) + """ END)
          WHERE f.final_hp IS NOT NULL AND b.game_date < current_date""", (list(AF.MK),)).fetchall()
        boxes = {}
        for d, pid, mk, side, line, fh, bh, sc in q:
            if d not in boxes:
                boxes[d] = AF.box(conn, d)
            l = {"player_id": pid, "prop": AF.MK[mk], "side": side, "line": line, "tier": "R", "kind": "standard", "m": 1.0, "p": fh, "base": bh, "score": sc}
            l["hit"] = AF.outcome(boxes[d], l)
            add("real", d, [l])
    elif APP == "underdog":
        for i, d in enumerate(AF.slate_days(conn)):
            st = AF.box(conn, d)
            if st:
                add("real", d, AF.load_ud(conn, d, st)[0])
            if i % 40 == 39:
                conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    else:
        out = M.build_sleeper_fliff(conn)
        for season, days in out.items():
            for d, legs in days:
                add("real" if season == M.REAL else "derived", d, legs)
    try:
        conn.close()
    except Exception:
        pass
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    with conn.cursor() as cur:
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_score._lr_app_legs (app text, src text, season text, game_date date, player text, prop text, side text,
                       line float8, tier text, kind text, m float8, p float8, base float8, score float8, hit int)""")
        cur.execute("DELETE FROM nba_score._lr_app_legs WHERE app = %s", (APP,))
        with cur.copy("COPY nba_score._lr_app_legs FROM STDIN") as cp:
            for r in rows:
                cp.write_row(r)
        cur.execute("CREATE INDEX IF NOT EXISTS _lr_app_legs_i ON nba_score._lr_app_legs (app, game_date)")
    conn.commit()
    n = conn.execute("SELECT src, season, count(*), count(DISTINCT game_date) FROM nba_score._lr_app_legs WHERE app = %s GROUP BY 1, 2 ORDER BY 1, 2", (APP,)).fetchall()
    conn.close()
    print(f"LC|{APP}: wrote {len(rows):,} legs in {time.time() - T0:.0f}s: " + "; ".join(f"{s} {se} {c:,} legs / {dd} slates" for s, se, c, dd in n), flush=True)


if __name__ == "__main__":
    main()
