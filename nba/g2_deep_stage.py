#!/usr/bin/env python3
"""
G2 GATE 2 - DEEP COMBO RUNGS, staging + pricing (strategy doc §31s G2). Never writes a production table.
  stage    the combos history JSON just built at the per-prop depth -> rows with 10 < |offset| (PRA / pts_reb / pts_ast) whose
           (date, player, prop, line) is on a real board (nba_market.board_rung_keys, FULL) -> nba_score._g2_deep_baseline
           (baseline_history's columns; this season's slice replaced)
  copy     writes nba/_g2_final_hp.py = a RESEARCH COPY of nba/build_final_hp.py whose only changes are table names (each
           substitution asserted): reads nba_score._g2_deep_baseline instead of baseline_history; writes nba_score._g2_deep_fhp /
           nba_score._g2_deep_der instead of final_hp / final_hp_derived. Same calibration, confidence, score - the production
           price of these rungs. (All staged rungs lie beyond the certified depth, so the copy routes them to _g2_deep_der.)
Env: DATABASE_URL, BT_TEST (season), G2_MODE (stage | copy).
"""
import json
import os
from pathlib import Path

import psycopg

DEPTH = {"pra": 24, "pts_reb": 21, "pts_ast": 21}
COLS = ["season", "game_date", "player_id", "game_id", "prop", "period", "line", "anchor", "ladder_offset", "p_more", "p_less",
        "p_raw", "role_tier", "var_band", "used_emp", "ladder_steps", "recipe"]


def stage():
    s = os.environ["BT_TEST"]
    rows = json.load(open(f"nba/data/nba_baseline_history_{s.replace('-', '_')}_combos.json"))["rows"]
    deep = [r for r in rows if r["prop"] in DEPTH and 10 < abs(int(r["offset"])) <= DEPTH[r["prop"]]]
    print(f"{s}: history rows {len(rows):,} | deep rows {len(deep):,}", flush=True)
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    with conn.cursor() as cur:
        cur.execute("CREATE TABLE IF NOT EXISTS nba_score._g2_deep_baseline (LIKE nba_score.baseline_history INCLUDING DEFAULTS)")
        cur.execute("CREATE TEMP TABLE _all (LIKE nba_score.baseline_history INCLUDING DEFAULTS) ON COMMIT DROP")
        with cur.copy(f"COPY _all ({', '.join(COLS)}) FROM STDIN") as cp:
            for r in deep:
                cp.write_row((s, r["game_date"], str(r["player_id"]), str(r["game_id"]), r["prop"], r.get("period") or "FULL",
                              float(r["line"]), float(r["anchor"]), int(r["offset"]), r["p_more"], r["p_less"], r.get("p_raw"),
                              r.get("role_tier"), r.get("var_band"), bool(r.get("used_emp")), None, "combos_ladder_v1 per-prop depth (G2 gate)"))
        cur.execute("DELETE FROM nba_score._g2_deep_baseline WHERE season = %s", (s,))
        cur.execute("""INSERT INTO nba_score._g2_deep_baseline SELECT a.* FROM _all a
                       WHERE EXISTS (SELECT 1 FROM nba_market.board_rung_keys k WHERE k.game_date = a.game_date AND k.player_id = a.player_id
                                       AND k.prop = a.prop AND coalesce(k.period,'FULL') = 'FULL' AND k.line = a.line)""")
        n = cur.rowcount
        cur.execute("CREATE INDEX IF NOT EXISTS _g2_deep_baseline_k ON nba_score._g2_deep_baseline (season, prop, game_date, player_id, line)")
    conn.commit()
    print(f"{s}: staged {n:,} deep rungs that a real board carried", flush=True)


SUBS = [("FROM nba_score.baseline_history h", "FROM nba_score._g2_deep_baseline h", 1),
        ("DELETE FROM nba_score.final_hp_derived WHERE", "DELETE FROM nba_score._g2_deep_der WHERE", 3),
        ("INSERT INTO nba_score.final_hp_derived\n", "INSERT INTO nba_score._g2_deep_der\n", 1),
        ("DELETE FROM nba_score.final_hp WHERE", "DELETE FROM nba_score._g2_deep_fhp WHERE", 3),
        ("INSERT INTO nba_score.final_hp\n", "INSERT INTO nba_score._g2_deep_fhp\n", 1)]


def copy():
    src = Path("nba/build_final_hp.py").read_text()
    for old, new, n in SUBS:
        assert src.count(old) == n, f"expected {n} x {old!r}, found {src.count(old)}"
        src = src.replace(old, new)
    for bad in ("DELETE FROM nba_score.final_hp", "INSERT INTO nba_score.final_hp", "UPDATE nba_score.final_hp", "TRUNCATE"):
        assert bad not in src, f"research copy still writes production: {bad}"
    Path("nba/_g2_final_hp.py").write_text(src)
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    with conn.cursor() as cur:
        cur.execute("CREATE TABLE IF NOT EXISTS nba_score._g2_deep_fhp (LIKE nba_score.final_hp INCLUDING DEFAULTS)")
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS _g2_deep_fhp_u ON nba_score._g2_deep_fhp (game_date, player_id, prop, line, side)")
        cur.execute("CREATE TABLE IF NOT EXISTS nba_score._g2_deep_der (LIKE nba_score.final_hp_derived INCLUDING DEFAULTS)")
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS _g2_deep_der_u ON nba_score._g2_deep_der (game_date, player_id, prop, side, line, derivation)")
    conn.commit()
    print("research copy written: nba/_g2_final_hp.py (5 table-name substitutions asserted; no production write left)", flush=True)


if __name__ == "__main__":
    {"stage": stage, "copy": copy}[os.environ["G2_MODE"]]()
