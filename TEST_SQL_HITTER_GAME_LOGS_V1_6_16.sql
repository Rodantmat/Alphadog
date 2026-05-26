-- Hitter Game Logs v1.6.16 validation

-- db: CONTROL_DB
SELECT
  request_id,
  worker_name,
  status,
  error_code,
  error_message,
  substr(output_json,1,5000) AS output_preview
FROM control_job_queue
WHERE worker_name = 'alphadog-v2-base-hitter-game-logs'
ORDER BY datetime(created_at) DESC
LIMIT 5;

-- db: STATS_HITTER_DB
SELECT
  batch_id,
  mode,
  status,
  rows_staged,
  rows_promoted,
  certification_status,
  certification_grade,
  delta_start_date,
  started_at,
  finished_at,
  updated_at
FROM hitter_game_log_batches
WHERE mode='delta_update'
ORDER BY datetime(updated_at) DESC
LIMIT 5;

-- db: STATS_HITTER_DB
SELECT
  batch_id,
  COUNT(*) AS live_rows,
  COUNT(DISTINCT game_pk) AS games,
  MIN(game_date) AS first_game_date,
  MAX(game_date) AS last_game_date,
  SUM(CASE WHEN game_pk IS NULL OR player_id IS NULL OR game_date IS NULL THEN 1 ELSE 0 END) AS missing_required
FROM hitter_game_logs
WHERE batch_id = (
  SELECT batch_id
  FROM hitter_game_log_batches
  WHERE mode='delta_update'
  ORDER BY datetime(updated_at) DESC
  LIMIT 1
)
GROUP BY batch_id;

-- db: STATS_HITTER_DB
SELECT
  game_pk,
  COUNT(*) AS duplicate_rows
FROM (
  SELECT player_id, game_pk, group_type, COUNT(*) AS c
  FROM hitter_game_logs
  GROUP BY player_id, game_pk, group_type
  HAVING COUNT(*) > 1
)
GROUP BY game_pk
ORDER BY duplicate_rows DESC, game_pk
LIMIT 50;

-- db: TEAM_DB
SELECT
  game_pk,
  official_date,
  layer_key,
  coverage_status,
  coverage_grade,
  blocking_for_full_run,
  live_rows,
  stage_rows,
  outcome_rows,
  missing_reason,
  last_batch_id,
  last_checked_at
FROM mlb_game_data_coverage
WHERE layer_key = 'hitter_game_logs'
  AND coverage_status = 'missing'
  AND blocking_for_full_run = 1
ORDER BY official_date, game_pk
LIMIT 100;

-- db: TEAM_DB
SELECT
  layer_key,
  coverage_status,
  coverage_grade,
  COUNT(*) AS rows,
  COUNT(DISTINCT game_pk) AS games,
  MIN(official_date) AS first_date,
  MAX(official_date) AS last_date,
  MIN(live_rows) AS min_live_rows,
  MAX(live_rows) AS max_live_rows
FROM mlb_game_data_coverage
WHERE layer_key = 'hitter_game_logs'
GROUP BY layer_key, coverage_status, coverage_grade
ORDER BY coverage_status, coverage_grade;
