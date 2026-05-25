-- Parent queue latest
-- db: CONTROL_DB
SELECT
  request_id,
  chain_id,
  parent_request_id,
  job_key,
  worker_name,
  status,
  tick_count,
  created_at,
  started_at,
  finished_at,
  updated_at,
  error_code,
  error_message,
  substr(input_json,1,1000) AS input_preview,
  substr(output_json,1,2000) AS output_preview
FROM control_job_queue
WHERE job_key='incremental-morning-full-run'
ORDER BY datetime(created_at) DESC
LIMIT 5;

-- Child rows for latest parent
-- db: CONTROL_DB
SELECT
  request_id,
  chain_id,
  parent_request_id,
  job_key,
  worker_name,
  status,
  tick_count,
  created_at,
  started_at,
  finished_at,
  updated_at,
  error_code,
  error_message,
  substr(input_json,1,900) AS input_preview,
  substr(output_json,1,1200) AS output_preview
FROM control_job_queue
WHERE parent_request_id = (
  SELECT request_id
  FROM control_job_queue
  WHERE job_key='incremental-morning-full-run'
  ORDER BY datetime(created_at) DESC
  LIMIT 1
)
ORDER BY datetime(created_at) ASC;

-- Runs for latest chain
-- db: CONTROL_DB
SELECT
  request_id,
  run_id,
  job_key,
  worker_name,
  status,
  data_ok,
  certification_status,
  rows_read,
  rows_written,
  external_calls,
  error_code,
  error_message,
  started_at,
  finished_at,
  substr(output_json,1,1200) AS output_preview
FROM control_job_runs
WHERE request_id IN (
  SELECT request_id
  FROM control_job_queue
  WHERE chain_id = (
    SELECT chain_id
    FROM control_job_queue
    WHERE job_key='incremental-morning-full-run'
    ORDER BY datetime(created_at) DESC
    LIMIT 1
  )
)
ORDER BY datetime(started_at) ASC;

-- Full Run lock
-- db: CONTROL_DB
SELECT
  lock_key,
  lock_flag,
  owner_request_id,
  owner_worker_name,
  acquired_at,
  expires_at,
  updated_at
FROM control_locks
WHERE lock_key='INCREMENTAL_MORNING_FULL_RUN';

-- Logs
-- db: CONTROL_DB
SELECT
  created_at,
  request_id,
  run_id,
  worker_name,
  job_key,
  level,
  event_key,
  message,
  substr(data_json,1,1200) AS data_preview
FROM control_worker_run_log
WHERE job_key IN (
  'incremental-morning-full-run',
  'base-hitter-game-logs',
  'base-pitcher-game-logs',
  'base-team-game-logs',
  'base-starter-history',
  'base-bullpen-history',
  'base-hitter-splits',
  'base-pitcher-splits',
  'base-hitter-metrics',
  'base-pitcher-metrics',
  'orchestrator_enqueue_incremental_morning_full_run'
)
ORDER BY datetime(created_at) DESC
LIMIT 100;
