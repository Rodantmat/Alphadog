#!/usr/bin/env python3
"""
VERIFY THE DAILY LOADS BY CONTENT - every P2A destination table must hold the CURRENT season's rows up to the latest game.

WHY (2026-10-30, Fix 2). verify_static_loads.py only checks that max(updated_at) moved, and only for workers whose HTTP reply was
not acknowledged. P2A posted `{}` to nba-static-measure-types, which then loaded its DEFAULT inputs (the three finished backfill
seasons, nba_backfill_*): every upsert moved updated_at, the reply was ok:true, and the four measure-type tables stayed at
the end of 2025-26 (max game_id 0022501230) while nba_stats.player_game_log was at 0022600143. A timestamp is not a row.

WHAT. The reference is the table the daily delta loads first (nba_stats.player_game_log / nba_team.team_game_log) for the CURRENT
regular-season prefix (game_id 'xxxxx' = '002' + season digits, taken from the data itself). Each destination must contain
every reference key (player_id, game_id) / (team_id, game_id) - proven exact on 2023-24, 2024-25, 2025-26 (usage = scoring =
player_game_log rows, four_factors = team scoring = team_game_log rows) - and per-game tables must cover every reference game.
Tolerances are DATABASE tunables (nba_config.system_settings, keys below); an absent key means 0 (strict).

REPAIR. A measure-types shortfall is repaired ONCE, the documented way (COMPASS section 5): POST /run with
{"file_prefix": "nba/data/nba_delta_"}, then re-checked (VERIFY_NO_REPAIR=1 only reports). Any remaining shortfall fails the step.

Env: DATABASE_URL, WORKER_HOST (default rodolfoaamattos.workers.dev), VERIFY_NO_REPAIR=1.
"""
import json
import os
import subprocess
import sys

DELTA_PREFIX = "nba/data/nba_delta_"
REPAIR_TIMEOUT_S = 600

# (destination, reference, key columns, tolerance setting key, repair worker or None)
ROW_CHECKS = [
    ("nba_stats.player_game_log_usage",   "nba_stats.player_game_log", ("player_id", "game_id"), "daily_load_tol_player_rows", "nba-static-measure-types"),
    ("nba_stats.player_game_log_scoring", "nba_stats.player_game_log", ("player_id", "game_id"), "daily_load_tol_player_rows", "nba-static-measure-types"),
    ("nba_team.team_game_log_four_factors", "nba_team.team_game_log",  ("team_id", "game_id"),   "daily_load_tol_team_rows",   "nba-static-measure-types"),
    ("nba_team.team_game_log_scoring",    "nba_team.team_game_log",    ("team_id", "game_id"),   "daily_load_tol_team_rows",   "nba-static-measure-types"),
]
# per-game tables: every reference game must have at least one row
GAME_CHECKS = [
    ("nba_stats.player_game_log_advanced",   "nba_stats.player_game_log", "daily_load_tol_games", None),
    ("nba_team.team_game_log_advanced",      "nba_team.team_game_log",    "daily_load_tol_games", None),
    ("nba_stats.player_game_starter_status", "nba_stats.player_game_log", "daily_load_tol_games", None),
    ("nba_stats.game_officials",             "nba_stats.player_game_log", "daily_load_tol_games", None),
]


def current_prefix(conn):
    """'00226' for 2026-27: the newest regular-season game in the reference table (data, not the calendar)."""
    return conn.execute("SELECT left(max(game_id), 5) FROM nba_stats.player_game_log WHERE game_id LIKE '002%'").fetchone()[0]


def tolerance(conn, key):
    r = conn.execute("SELECT setting_value FROM nba_config.system_settings WHERE setting_key = %s", (key,)).fetchone()
    try:
        return int(float(r[0])) if r else 0
    except (TypeError, ValueError):
        return 0


def measure_rows(conn, dest, ref, keys, pre):
    k1, k2 = keys
    join = f"d.{k1} = r.{k1} AND d.{k2} = r.{k2}"
    ref_n = conn.execute(f"SELECT count(*) FROM {ref} r WHERE r.game_id LIKE %s", (pre + "%",)).fetchone()[0]
    missing = conn.execute(f"SELECT count(*) FROM {ref} r WHERE r.game_id LIKE %s AND NOT EXISTS (SELECT 1 FROM {dest} d WHERE {join})", (pre + "%",)).fetchone()[0]
    dmax = conn.execute(f"SELECT max(game_id) FROM {dest} WHERE game_id LIKE %s", (pre + "%",)).fetchone()[0]
    rmax = conn.execute(f"SELECT max(game_id) FROM {ref} WHERE game_id LIKE %s", (pre + "%",)).fetchone()[0]
    return {"ref_rows": ref_n, "missing": missing, "dest_max": dmax, "ref_max": rmax}


def measure_games(conn, dest, ref, pre):
    ref_g = conn.execute(f"SELECT count(DISTINCT game_id) FROM {ref} WHERE game_id LIKE %s", (pre + "%",)).fetchone()[0]
    missing = conn.execute(f"SELECT count(DISTINCT r.game_id) FROM {ref} r WHERE r.game_id LIKE %s AND NOT EXISTS (SELECT 1 FROM {dest} d WHERE d.game_id = r.game_id)", (pre + "%",)).fetchone()[0]
    dmax = conn.execute(f"SELECT max(game_id) FROM {dest} WHERE game_id LIKE %s", (pre + "%",)).fetchone()[0]
    rmax = conn.execute(f"SELECT max(game_id) FROM {ref} WHERE game_id LIKE %s", (pre + "%",)).fetchone()[0]
    return {"ref_rows": ref_g, "missing": missing, "dest_max": dmax, "ref_max": rmax}


def evaluate(results, tols):
    """results: {dest: {ref_rows, missing, dest_max, ref_max, tol_key}} -> list of failure strings (pure; unit-testable)."""
    bad = []
    for dest, r in results.items():
        tol = tols.get(r["tol_key"], 0)
        if r["missing"] > tol:
            bad.append(f"{dest}: {r['missing']} of {r['ref_rows']} reference keys missing (tolerance {tol}); newest game_id {r['dest_max']} vs {r['ref_max']} in the reference")
    return bad


def run_all(conn, pre):
    out = {}
    for dest, ref, keys, tk, _ in ROW_CHECKS:
        out[dest] = {**measure_rows(conn, dest, ref, keys, pre), "tol_key": tk}
    for dest, ref, tk, _ in GAME_CHECKS:
        out[dest] = {**measure_games(conn, dest, ref, pre), "tol_key": tk}
    return out


def repair_measure_types():
    host = os.environ.get("WORKER_HOST") or "rodolfoaamattos.workers.dev"
    url = f"https://alphadog-v2-nba-static-measure-types.{host}/run"
    out = "/tmp/repair-measure-types.json"
    try:
        r = subprocess.run(["curl", "-sS", "--max-time", str(REPAIR_TIMEOUT_S), "-o", out, "-w", "%{http_code}", "-X", "POST", url,
                            "-H", "content-type: application/json", "-d", json.dumps({"file_prefix": DELTA_PREFIX})],
                           capture_output=True, text=True, timeout=REPAIR_TIMEOUT_S + 30)
        try:
            j = json.load(open(out))
            return f"HTTP {(r.stdout or '').strip()} ok={j.get('ok')} rows_written={j.get('rows_written')} errors={j.get('errors')}"
        except Exception:  # noqa: BLE001
            return f"HTTP {(r.stdout or '').strip()} (no JSON reply) - judged by data below"
    except Exception as exc:  # noqa: BLE001
        return f"re-invocation did not return ({str(exc)[:120]}) - judged by data below"


def main():
    import psycopg
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.autocommit = True
    pre = current_prefix(conn)
    tols = {k: tolerance(conn, k) for k in {c[3] for c in ROW_CHECKS} | {c[2] for c in GAME_CHECKS}}
    print(f"daily-load content check: current regular-season prefix {pre}; tolerances {tols}")
    res = run_all(conn, pre)
    for dest, r in res.items():
        print(f"  {dest}: reference {r['ref_rows']}, missing {r['missing']}, newest {r['dest_max']} (reference {r['ref_max']})")
    bad = evaluate(res, tols)
    if bad and os.environ.get("VERIFY_NO_REPAIR") != "1" and any(d in {c[0] for c in ROW_CHECKS} for d in [b.split(":")[0] for b in bad]):
        print("measure-type shortfall - re-invoking nba-static-measure-types with file_prefix", DELTA_PREFIX, flush=True)
        print("  " + repair_measure_types())
        res = run_all(conn, pre)
        for dest, r in res.items():
            print(f"  after repair {dest}: missing {r['missing']}, newest {r['dest_max']}")
        bad = evaluate(res, tols)
    conn.close()
    if bad:
        for b in bad:
            print(f"::error::{b}")
        sys.exit(1)
    print("daily-load content check: every destination table holds the current season through the latest game.")


if __name__ == "__main__":
    main()
