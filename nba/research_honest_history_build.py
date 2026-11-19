#!/usr/bin/env python3
"""
HONEST BASELINE HISTORY INTO A PARALLEL TABLE (owner 2026-11-19 11:05 PT: option 1 - rebuild into separate tables, leave production alone).
Runs the SAME day-by-day history builder as production (nba/baseline/build_baseline_history.py over nba/backtest/classification_ladder_v12.py) with ONE change:
the player's monthly rate tier is taken day by day (what production can see on that date) instead of from his last game of the calendar month
(root cause proven 2026-11-19, research_tier_prior_leak.py). Nothing in production is read-modified: output goes ONLY to nba_score.baseline_history_h, one row
per player-game-prop with the whole ladder in arrays (offsets, lines, p_more, p_raw), about 20x smaller than the row-per-rung production table.
Env: DATABASE_URL, BT_TEST (season), HH_PAIRS (prop pairs, ':' between pairs, ',' inside; default the four board pairs), BT_LADDER_STEPS (10).
"""
import json
import os
import subprocess
import sys
import time
from collections import defaultdict
from pathlib import Path

import psycopg

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
import research_tier_prior_leak as TL                       # noqa: E402  (OLD / NEW: the one-block fix)

TEST = os.environ.get("BT_TEST") or "2025-26"
TRAIN = os.environ.get("BT_TRAIN") or {"2024-25": "2023-24", "2025-26": "2023-24,2024-25"}.get(TEST, "2023-24,2024-25,2025-26")
PAIRS = (os.environ.get("HH_PAIRS") or "points,rebounds:assists,steals:blocks,turnovers:threes_made,fg3a").split(":")
T0 = time.time()


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def main():
    src = (HERE / "backtest" / "classification_ladder_v12.py").read_text()
    assert TL.OLD in src, "tier block not found - the harness changed"
    hfile = HERE / "backtest" / "_cl_honest.py"; hfile.write_text(src.replace(TL.OLD, TL.NEW))
    bsrc = (HERE / "baseline" / "build_baseline_history.py").read_text()
    anchor = 'SRC = Path("nba/backtest/classification_ladder_v12.py").read_text()'
    assert anchor in bsrc, "history builder changed"
    bfile = HERE / "baseline" / "_bh_honest.py"; bfile.write_text(bsrc.replace(anchor, 'SRC = Path("nba/backtest/_cl_honest.py").read_text()'))
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.baseline_history_h (season text, game_date date, player_id text, game_id text, prop text, anchor float8,
                    role_tier text, var_band text, proj_min float4, rate36 float4, offs int2[], lines float4[], p_more float4[], p_raw float4[],
                    built_at timestamptz DEFAULT now())""")
    conn.execute("CREATE INDEX IF NOT EXISTS baseline_history_h_i ON nba_score.baseline_history_h (game_date, player_id, prop)")
    conn.commit(); conn.close()
    for pair in PAIRS:
        env = dict(os.environ, BT_TEST=TEST, BT_TRAIN=TRAIN, BT_PROPS=pair, BT_LADDER_STEPS=os.environ.get("BT_LADDER_STEPS") or "10", BT_INJURY="1", BT_TAG="hh")
        r = subprocess.run([sys.executable, str(bfile)], cwd=str(ROOT), env=env, capture_output=True, text=True)
        tail = " / ".join(r.stdout.strip().splitlines()[-1:])[:200]
        if r.returncode != 0:
            print(r.stderr[-3000:], flush=True); raise SystemExit(f"builder failed for {pair}")
        f = ROOT / "nba" / "data" / f"nba_baseline_history_{TEST.replace('-', '_')}_{pair.replace(',', '-')}.json"
        doc = json.load(open(f)); rows = doc["rows"]; f.unlink()
        g = defaultdict(list)
        for x in rows:
            g[(x["game_date"], x["player_id"], x["game_id"], x["prop"])].append(x)
        out = []
        for (gd, pid, gid, prop), xs in g.items():
            xs.sort(key=lambda x: x["line"]); x0 = xs[0]
            out.append((TEST, gd, pid, gid, prop, x0["anchor"], x0["role_tier"], x0["var_band"], x0.get("proj_min"), x0.get("rate36"),
                        [int(x["offset"]) for x in xs], [float(x["line"]) for x in xs], [float(x["p_more"]) for x in xs], [float(x["p_raw"]) for x in xs]))
        conn = psycopg.connect(os.environ["DATABASE_URL"])
        with conn.cursor() as cur:
            cur.execute("DELETE FROM nba_score.baseline_history_h WHERE season = %s AND prop = ANY(%s)", (TEST, pair.split(",")))
            with cur.copy("""COPY nba_score.baseline_history_h (season, game_date, player_id, game_id, prop, anchor, role_tier, var_band, proj_min, rate36,
                             offs, lines, p_more, p_raw) FROM STDIN""") as cp:
                for row in out:
                    cp.write_row(row)
        conn.commit(); conn.close()
        log(f"{TEST} {pair}: {len(rows):,} rungs -> {len(out):,} player-game-prop rows loaded | builder: {tail}")
    for p in (hfile, bfile):
        try:
            p.unlink()
        except OSError:
            pass
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    for s, pr, n, d0, d1 in conn.execute("""SELECT season, prop, count(*), min(game_date), max(game_date) FROM nba_score.baseline_history_h WHERE season = %s
                                           GROUP BY 1, 2 ORDER BY 2""", (TEST,)).fetchall():
        print(f"HH|{s} {pr}: {n:,} rows {d0} .. {d1}", flush=True)
    sz = conn.execute("SELECT pg_size_pretty(pg_total_relation_size('nba_score.baseline_history_h'))").fetchone()[0]; conn.close()
    print(f"HH|table size {sz}; DONE", flush=True)


if __name__ == "__main__":
    main()
