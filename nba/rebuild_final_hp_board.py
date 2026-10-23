#!/usr/bin/env python3
"""
FAST HISTORY REBUILD OF final_hp WITH THE BOARD-CENTRED CALIBRATION (2026-10-22 23:00 PT). Same numbers as build_final_hp.py with the
board-centred chain on, computed from the rows final_hp already holds instead of re-reading baseline_history.

Why: the full build re-reads baseline_history through the board-key filter per prop (IO-bound: two props in ~35 minutes tonight with
the database saturated) although, for the 12 calibrated props, every input the new chain needs is already stored:
  * the day's ladder = the board rungs' Over baseline_hp (p_more at that line) in final_hp + final_hp_derived (beyond-certified-depth
    and wn-neighbour rungs) - exactly the rungs build_final_hp reads from baseline_history (board-scoped);
  * confidence (the v3 thermometer does not read final_hp), so score / edge follow from final_hp_board_cal + score_and_edge().
What changes per row: final_hp, cal_shift, score, edge, cal_chain ('board' when the chain applied, else the stored as-of value kept).
PARITY: FB_COMPARE=1 recomputes and diffs against rows the full build already wrote with cal_chain 'board' (2025-26 assists /
rebounds tonight) - the rebuild must reproduce them within rounding (baseline_hp is stored to 5 decimals).
Env: DATABASE_URL, FB_SEASONS (2024-25,2025-26), FB_PROPS (default the 12), FB_WRITE (1 writes), FB_COMPARE (1 = diff only),
     FB_CAL_TABLE (the tunable table; default nba_score.final_hp_board_cal).
"""
import os
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, "nba")
import final_hp_board_cal as BC          # noqa: E402
from build_final_hp import score_and_edge, logit   # noqa: E402

SEASONS = [s for s in (os.environ.get("FB_SEASONS") or "2024-25,2025-26").split(",") if s]
PROPS = [p for p in (os.environ.get("FB_PROPS") or ",".join(BC.PROPS)).split(",") if p]
WRITE = os.environ.get("FB_WRITE") == "1"
COMPARE = os.environ.get("FB_COMPARE") == "1"

READ = """
SELECT 'f', game_date, player_id::text, line::float8, side, baseline_hp::float8, final_hp::float8, confidence::float8, NULL::text, cal_chain
FROM nba_score.final_hp WHERE season = %(s)s AND prop = %(p)s
UNION ALL
SELECT 'd', game_date, player_id::text, line::float8, side, baseline_hp::float8, final_hp::float8, confidence::float8, derivation, NULL
FROM nba_score.final_hp_derived WHERE season = %(s)s AND prop = %(p)s AND derivation IN ('beyond_certified_depth', 'wn_neighbor')"""


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    sets = BC.TunableSets(conn, os.environ.get("FB_CAL_TABLE") or "nba_score.final_hp_board_cal")
    if not sets.dates:
        sys.exit("REFUSED: nba_score.final_hp_board_cal holds no tunable set")
    print(f"tunable sets {len(sets.dates)} ({sets.dates[0]} .. {sets.dates[-1]}); seasons {SEASONS}; props {PROPS}; "
          f"write {WRITE}; compare {COMPARE}", flush=True)
    for season in SEASONS:
        rng = conn.execute("SELECT min(game_date), max(game_date) FROM nba_score.final_hp WHERE season = %s", (season,)).fetchone()
        have = conn.execute("SELECT to_regclass('nba_score.board_std_line')").fetchone()[0] and \
            conn.execute("SELECT count(*) FROM nba_score.board_std_line WHERE game_date BETWEEN %s AND %s", rng).fetchone()[0]
        cover = conn.execute("SELECT min(game_date), max(game_date) FROM nba_score.board_std_line").fetchone() if have else (None, None)
        if not have or cover[0] > rng[0] or cover[1] < rng[1]:
            print(f"{season}: materializing standard lines {rng[0]} .. {rng[1]}: {BC.materialize_std_lines(conn, *rng):,}", flush=True)
        STD = BC.std_lines(conn, seasons_dates=rng)
        print(f"{season}: {len(STD):,} standard lines", flush=True)
        for prop in PROPS:
            rows = conn.execute(READ, {"s": season, "p": prop}).fetchall()
            if not rows:
                continue
            rungs = defaultdict(list)
            for src, gd, pid, ln, sd, bh, fh, cf, der, ch in rows:
                if sd == "Over" and bh is not None:
                    rungs[(gd, pid)].append((ln, bh))
            lad, out = {}, []
            n_bc = 0
            diffs = []
            for src, gd, pid, ln, sd, bh, fh, cf, der, ch in rows:
                asof_d, prm = sets.at(gd)
                std = STD.get((gd, pid, prop))
                p, chain = fh, "asof"
                if prm is not None and std is not None and rungs.get((gd, pid)) and bh is not None:
                    if (gd, pid) not in lad:
                        lad[(gd, pid)] = BC.Ladder(rungs[(gd, pid)], prm["slope_c"].get(prop))
                    q, _lt, _w = BC.apply(prm, prop, sd, lad[(gd, pid)], ln, std[0])
                    if q is not None:
                        p, chain = q, "board"; n_bc += 1
                if COMPARE and src == "f" and ch == "board":
                    diffs.append(abs(p - fh))
                out.append((src, gd, pid, ln, sd, der, p, chain, bh, cf))
            if COMPARE:
                d = np.array(diffs) if diffs else np.array([0.0])
                print(f"  {season} {prop}: rows {len(rows):,}, board-centred {n_bc:,}; parity vs the full build on {len(diffs):,} rows: "
                      f"max |diff| {d.max():.6f}, mean {d.mean():.7f}, > 0.001: {int((d > 0.001).sum())}", flush=True)
                continue
            P = np.array([o[6] for o in out]); C = np.array([o[9] if o[9] is not None else 0.85 for o in out])
            BH = np.array([o[8] if o[8] is not None else 0.5 for o in out])
            score, edge = score_and_edge(P, C)
            cs = logit(P) - logit(BH)
            print(f"  {season} {prop}: rows {len(rows):,}, board-centred {n_bc:,} ({n_bc / len(rows):.1%})", flush=True)
            if not WRITE:
                continue
            with conn.transaction():
                conn.execute("SELECT pg_advisory_xact_lock(hashtext('nba_score.final_hp'))")
                conn.execute("""CREATE TEMP TABLE _fb (src text, game_date date, player_id text, line numeric, side text, derivation text,
                                final_hp numeric, cal_shift numeric, score numeric, edge numeric, cal_chain text) ON COMMIT DROP""")
                with conn.cursor().copy("COPY _fb FROM STDIN") as cp:
                    for o, sc, ed, c in zip(out, score, edge, cs):
                        cp.write_row((o[0], o[1], o[2], o[3], o[4], o[5], round(float(o[6]), 5), round(float(c), 5),
                                      round(float(sc), 2), round(float(ed), 2), o[7]))
                n1 = conn.execute("""UPDATE nba_score.final_hp f SET final_hp = t.final_hp, cal_shift = t.cal_shift, score = t.score,
                                     edge = t.edge, cal_chain = t.cal_chain
                                     FROM _fb t WHERE t.src = 'f' AND f.season = %s AND f.prop = %s AND f.game_date = t.game_date
                                       AND f.player_id = t.player_id AND f.line = t.line AND f.side = t.side""", (season, prop)).rowcount
                n2 = conn.execute("""UPDATE nba_score.final_hp_derived f SET final_hp = t.final_hp, cal_shift = t.cal_shift,
                                     score = t.score, edge = t.edge
                                     FROM _fb t WHERE t.src = 'd' AND f.season = %s AND f.prop = %s AND f.game_date = t.game_date
                                       AND f.player_id = t.player_id AND f.line = t.line AND f.side = t.side
                                       AND f.derivation = t.derivation""", (season, prop)).rowcount
            conn.commit()
            print(f"    written: final_hp {n1:,}, final_hp_derived {n2:,}", flush=True)


if __name__ == "__main__":
    main()
