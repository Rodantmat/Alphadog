-- Optional cleanup for the old known broken run only, before retest.
-- db: CONTROL_DB
UPDATE control_job_queue
SET
  status='completed',
  finished_at=COALESCE(finished_at, CURRENT_TIMESTAMP),
  updated_at=CURRENT_TIMESTAMP,
  error_code=NULL,
  error_message=NULL
WHERE request_id='sleeper_probe_mplu3hkc_d9a613'
  AND job_key='parlay-sleeper-board'
  AND status='running'
  AND EXISTS (
    SELECT 1 FROM control_job_runs r
    WHERE r.request_id='sleeper_probe_mplu3hkc_d9a613'
      AND r.job_key='parlay-sleeper-board'
      AND r.status='completed'
      AND r.data_ok=1
  );

-- Run buttons after deploy:
-- 1) BOARD > Sleeper
-- 2) ORCHESTRATOR > Wake
-- 3) ORCHESTRATOR > Logs
-- 4) V2 SAFE ACTIONS > Queue

-- db: CONTROL_DB
SELECT
  q.request_id,
  q.job_key,
  q.worker_name,
  q.status AS queue_status,
  q.error_code,
  q.error_message,
  q.started_at,
  q.finished_at,
  r.status AS run_status,
  r.data_ok,
  r.certification_status,
  r.rows_read,
  r.rows_written,
  r.external_calls
FROM control_job_queue q
LEFT JOIN control_job_runs r ON r.request_id = q.request_id
WHERE q.job_key='parlay-sleeper-board'
ORDER BY datetime(q.created_at) DESC, datetime(r.started_at) DESC
LIMIT 5;

-- db: MARKET_DB
SELECT 'sleeper_board_stage' AS table_name, COUNT(*) AS rows FROM sleeper_board_stage
UNION ALL
SELECT 'sleeper_board_batches', COUNT(*) FROM sleeper_board_batches
UNION ALL
SELECT 'sleeper_board_current', COUNT(*) FROM sleeper_board_current
UNION ALL
SELECT 'sleeper_board_active_batches', COUNT(*) FROM sleeper_board_active_batches;

-- db: MARKET_DB
SELECT
  COUNT(*) AS total_rows,
  COUNT(DISTINCT source_line_id) AS distinct_source_line_ids,
  COUNT(*) - COUNT(DISTINCT source_line_id) AS duplicate_source_line_ids,
  SUM(CASE WHEN is_pickable = 1 THEN 1 ELSE 0 END) AS pickable_rows,
  SUM(CASE WHEN is_pickable = 1 AND datetime(start_time) <= datetime('now') THEN 1 ELSE 0 END) AS expired_marked_pickable,
  SUM(CASE WHEN is_pickable = 1 AND (start_time IS NULL OR start_time = '') THEN 1 ELSE 0 END) AS missing_time_marked_pickable
FROM sleeper_board_current;

-- db: MARKET_DB
SELECT
  canonical_prop_key,
  source_stat_name,
  COUNT(*) AS rows,
  SUM(CASE WHEN is_pickable = 1 THEN 1 ELSE 0 END) AS pickable_rows
FROM sleeper_board_current
GROUP BY canonical_prop_key, source_stat_name
ORDER BY rows DESC, canonical_prop_key, source_stat_name;
