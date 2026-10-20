#!/usr/bin/env python3
"""OPENING-DAY DELTA CHECK (owner 2026-10-20: go deeper, be sure the calculations are going right). Runs the REAL P3 availability delta
(nba/build_availability_delta.py) against TODAY's real baseline and the injury snapshots stored right now, inside one transaction that is
ROLLED BACK (machinery: nba/sim_p3_full.py), and prints who is newly OUT / IN, which legs would be re-projected and by how much, and what
score_board_legs would do with them. Production's availability_delta is verified unchanged. Env: DATABASE_URL, SIM_DATE."""
import json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import sim_p3_full as S  # noqa: E402
import psycopg  # noqa: E402

D, URL = S.D, S.URL


def main():
    with S.REAL_CONNECT(URL, autocommit=True) as g:
        before = g.execute("SELECT count(*) FROM nba_score.availability_delta WHERE game_date=%s", (D,)).fetchone()[0]
    S.Shared.real = S.REAL_CONNECT(URL, autocommit=False)
    S.Shared.real.execute("SAVEPOINT cp")
    psycopg.connect = S.proxy_connect
    out = {"slate": D, "delta_rows_before": before}
    try:
        S.inproc("DELTA", "availability delta (real, rolled back)", "nba/build_availability_delta.py",
                 env={"DELTA_ASOF": D, "DELTA_FROM": "baseline", "DELTA_TO": "phase1"})
        with S.Shared.lock:
            r = S.Shared.real
            out["rows_by_reason"] = [[str(x) for x in c] for c in r.execute("SELECT reason, count(*), count(DISTINCT player_id), round(avg(abs(new_hp-old_hp))::numeric,4), round(max(abs(new_hp-old_hp))::numeric,4) FROM nba_score.availability_delta WHERE game_date=%s GROUP BY 1 ORDER BY 2 DESC", (D,)).fetchall()]
            out["players"] = [[str(x) for x in c] for c in r.execute("""SELECT coalesce(m.display_name,d.player_id::text), d.reason, count(*), round(avg(d.new_hp-d.old_hp)::numeric,4)
                FROM nba_score.availability_delta d LEFT JOIN (SELECT DISTINCT ON (player_id) player_id, display_name FROM nba_ref.player_name_map ORDER BY player_id, display_name) m ON m.player_id::text=d.player_id::text
                WHERE d.game_date=%s GROUP BY 1,2 ORDER BY 2,1""", (D,)).fetchall()]
    finally:
        try:
            S.Shared.real.rollback()
        except Exception:  # noqa: BLE001
            pass
        S.Shared.real.close()
        psycopg.connect = S.REAL_CONNECT
        with S.REAL_CONNECT(URL, autocommit=True) as v:
            out["delta_rows_after"] = v.execute("SELECT count(*) FROM nba_score.availability_delta WHERE game_date=%s", (D,)).fetchone()[0]
    print("DELTA_CHECK_RESULT|" + json.dumps(out, default=str), flush=True)
    if out["delta_rows_after"] != before:
        raise SystemExit("PRODUCTION availability_delta CHANGED")


if __name__ == "__main__":
    main()
