#!/usr/bin/env python3
import json
import shutil
import subprocess
from pathlib import Path

MANIFEST = json.loads(Path("schema_manifest.json").read_text(encoding="utf-8"))

EXPECTED = {
  "alphadog-v2-control-db": ["control_system_state","control_worker_registry","control_job_queue","control_job_runs","control_certification_status","control_phase_state","control_locks"],
  "alphadog-v2-config-db": ["config_system_settings","config_worker_definitions","config_worker_schedules","config_prop_taxonomy","config_market_sources","config_certification_rules"],
  "alphadog-v2-ref-db": ["ref_teams","ref_players","ref_player_aliases","ref_rosters","ref_stadiums","ref_prop_aliases"],
  "alphadog-v2-stats-hitter-db": ["hitter_game_logs","hitter_splits","hitter_metrics"],
  "alphadog-v2-stats-pitcher-db": ["pitcher_game_logs","pitcher_splits","pitcher_metrics"],
  "alphadog-v2-team-db": ["team_game_logs","team_metrics","bullpen_history","starter_history"],
  "alphadog-v2-daily-db": ["daily_slate_games","daily_probable_pitchers","daily_lineups","daily_weather","daily_roof_status","daily_player_availability","daily_usage_pulse"],
  "alphadog-v2-market-db": ["market_raw_snapshots","market_current_lines","market_line_snapshots","market_source_health","market_line_shape_classification"],
  "alphadog-v2-context-db": ["context_packets","context_factor_scores","context_certification"],
  "alphadog-v2-score-db": ["score_packets","prop_scores","candidate_board","release_board","score_audit"],
  "alphadog-v2-archive-db": ["archive_slate_snapshots","archive_run_summaries","archive_market_snapshots","archive_score_snapshots"]
}

COUNT_CHECKS = {
  "alphadog-v2-control-db": [
    ["control_worker_registry", 116],
    ["control_phase_state", 12],
    ["control_system_state", 1]
  ],
  "alphadog-v2-config-db": [
    ["config_worker_definitions", 116],
    ["config_prop_taxonomy", 19],
    ["config_market_sources", 7],
    ["config_certification_rules", 6]
  ]
}

def find_npx():
    exe = shutil.which("npx") or shutil.which("npx.cmd") or shutil.which("npx.exe")
    if exe:
        return exe
    print("ERROR: npx not found.")
    raise SystemExit(1)

def exec_sql(npx, db_name, sql):
    cmd = [npx, "wrangler", "d1", "execute", db_name, "--remote", "--json", "--command", sql]
    p = subprocess.run(cmd, capture_output=True, text=True, shell=False)
    return p.returncode, p.stdout, p.stderr, cmd

def parse_json_rows(stdout):
    try:
        data = json.loads(stdout)
        # Wrangler JSON is usually a list with results.
        if isinstance(data, list) and data:
            result = data[0].get("results") or data[0].get("result") or []
            return result
        if isinstance(data, dict):
            return data.get("results") or data.get("result") or []
    except Exception:
        return []
    return []

def main():
    npx = find_npx()
    results = []
    failures = []

    for db_name, tables in EXPECTED.items():
        quoted = ",".join("'" + t + "'" for t in tables)
        sql = f"SELECT name FROM sqlite_master WHERE type='table' AND name IN ({quoted}) ORDER BY name"
        code, out, err, cmd = exec_sql(npx, db_name, sql)
        rows = parse_json_rows(out)
        found = sorted([r.get("name") for r in rows if isinstance(r, dict) and r.get("name")])
        missing = sorted(set(tables) - set(found))
        ok = code == 0 and not missing
        print(f"{'PASS' if ok else 'FAIL'} {db_name}: {len(found)}/{len(tables)} expected tables")
        if missing:
            print("  Missing:", ", ".join(missing))
        results.append({"db": db_name, "type": "table_check", "ok": ok, "found": found, "missing": missing, "stderr": err})
        if not ok:
            failures.append(results[-1])

    for db_name, checks in COUNT_CHECKS.items():
        for table, minimum in checks:
            sql = f"SELECT COUNT(*) AS c FROM {table}"
            code, out, err, cmd = exec_sql(npx, db_name, sql)
            rows = parse_json_rows(out)
            count = rows[0].get("c") if rows and isinstance(rows[0], dict) else None
            ok = code == 0 and isinstance(count, int) and count >= minimum
            print(f"{'PASS' if ok else 'FAIL'} {db_name}.{table}: count={count}, expected>={minimum}")
            item = {"db": db_name, "type": "count_check", "table": table, "count": count, "minimum": minimum, "ok": ok, "stderr": err}
            results.append(item)
            if not ok:
                failures.append(item)

    Path("schema_verify_results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print("\nWrote schema_verify_results.json")
    print(f"Schema verify {'passed' if not failures else 'failed'}: {len(results)-len(failures)} / {len(results)} checks passed")

    if failures:
        raise SystemExit(1)

if __name__ == "__main__":
    main()
