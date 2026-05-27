const SYSTEM_VERSION = "alphadog-v2-orchestrator-v0.2.106-hitter-metrics-running-partial-rescue";
const WORKER_NAME = "alphadog-v2-orchestrator";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type,x-ingest-token,x-admin-token,authorization",
      "access-control-allow-methods": "GET,POST,OPTIONS"
    }
  });
}

function nowIso() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

async function all(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  const res = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
  return res.results || [];
}

async function first(db, sql, ...binds) {
  const rows = await all(db, sql, ...binds);
  return rows[0] || null;
}

async function run(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  return binds.length ? await stmt.bind(...binds).run() : await stmt.run();
}

function base(env, extra = {}) {
  return {
    ok: true,
    data_ok: true,
    version: SYSTEM_VERSION,
    worker_name: WORKER_NAME,
    job_key: "orchestrator",
    status: "ORCHESTRATOR_BACKEND_READY",
    timestamp_utc: nowIso(),
    mode: "backend_cron_continuation",
    notes: [
      "Buttons enqueue/wake backend work only.",
      "Browser does not run long loops.",
      "Scheduled cron calls the same bounded tick path.",
      "v0.2.60 processes safe system-health, exact market-source-health, exact prizepicks-github-board, exact parlay-sleeper-board source-probe, exact board-full-run backend chain, exact base-hitter-game-logs self-continuing base_backfill with stale running recovery, exact base-hitter-splits base promotion and delta no-op/restore gate with backend hot continuation, exact base-hitter-metrics v0.5.1 calendar-tally affected recalc with running partial rescue and snapshot promote/retained-stage delta repair dispatch, exact base-pitcher-metrics v0.4.1 snapshot delta-repair/snapshot-promote/snapshot-prep/full-stage dispatch, exact base-pitcher-game-logs base/delta continuation with stale running recovery, exact base-team-game-logs, exact base-starter-history, exact base-bullpen-history v0.4.0 source probe/base stage/promote-clean/delta-update, exact active static workers, exact static-certifier read-only validation, exact static-full-run backend chain, and exact incremental-morning-full-run backend chain only.",
      "No generic worker dispatch, no scoring, no ranking, no final board writes, no old production writes."
    ],
    bindings: {
      CONTROL_DB: !!env.CONTROL_DB,
      CONFIG_DB: !!env.CONFIG_DB,
      STATIC_CERTIFIER_WORKER: !!env.STATIC_CERTIFIER_WORKER,
      PRIZEPICKS_GITHUB_BOARD_WORKER: !!env.PRIZEPICKS_GITHUB_BOARD_WORKER,
      PARLAY_SLEEPER_BOARD_WORKER: !!env.PARLAY_SLEEPER_BOARD_WORKER,
      BASE_HITTER_GAME_LOGS_WORKER: !!env.BASE_HITTER_GAME_LOGS_WORKER,
      BASE_HITTER_SPLITS_WORKER: !!env.BASE_HITTER_SPLITS_WORKER,
      BASE_HITTER_METRICS_WORKER: !!env.BASE_HITTER_METRICS_WORKER,
      BASE_PITCHER_METRICS_WORKER: !!env.BASE_PITCHER_METRICS_WORKER,
      BASE_PITCHER_GAME_LOGS_WORKER: !!env.BASE_PITCHER_GAME_LOGS_WORKER,
      BASE_TEAM_GAME_LOGS_WORKER: !!env.BASE_TEAM_GAME_LOGS_WORKER,
      BASE_STARTER_HISTORY_WORKER: !!env.BASE_STARTER_HISTORY_WORKER,
      BASE_BULLPEN_HISTORY_WORKER: !!env.BASE_BULLPEN_HISTORY_WORKER,
      BASE_PITCHER_SPLITS_WORKER: !!env.BASE_PITCHER_SPLITS_WORKER,
      DAILY_GAMES_STATUS_WORKER: !!env.DAILY_GAMES_STATUS_WORKER,
      DELTA_CERTIFIER_WORKER: !!env.DELTA_CERTIFIER_WORKER
    },
    ...extra
  };
}

async function ensureRows(env) {
  await run(env.CONTROL_DB, "INSERT OR IGNORE INTO control_locks (lock_key, lock_flag, updated_at) VALUES ('GLOBAL_ORCHESTRATOR', 0, CURRENT_TIMESTAMP)");
  await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_system_state (state_key, lock_flag, status, updated_at) VALUES ('GLOBAL', COALESCE((SELECT lock_flag FROM control_system_state WHERE state_key='GLOBAL'),0), COALESCE((SELECT status FROM control_system_state WHERE state_key='GLOBAL'),'IDLE'), CURRENT_TIMESTAMP)");
}

async function ensureSchema(env) {
  // Minimal compatibility shim for scheduled paths: core CONTROL_DB rows only.
  // Do not create or mutate broad schema here.
  await ensureRows(env);
}

async function statusPayload(env) {
  await ensureRows(env);
  const queueCounts = await all(env.CONTROL_DB, "SELECT status, COUNT(*) AS c FROM control_job_queue GROUP BY status ORDER BY status");
  const locks = await all(env.CONTROL_DB, "SELECT lock_key, lock_flag, owner_request_id, owner_worker_name, acquired_at, expires_at, updated_at FROM control_locks ORDER BY lock_key LIMIT 20");
  const state = await all(env.CONTROL_DB, "SELECT state_key, lock_flag, running_job_key, running_request_id, status, updated_at FROM control_system_state ORDER BY state_key LIMIT 20");
  const recent = await all(env.CONTROL_DB, "SELECT request_id, job_key, worker_name, status, tick_count, run_after, created_at, started_at, finished_at, updated_at, error_code FROM control_job_queue ORDER BY datetime(updated_at) DESC LIMIT 15");
  return base(env, {
    job: "orchestrator_status",
    queue_counts: queueCounts,
    locks,
    state,
    recent_queue: recent
  });
}

async function logsPayload(env) {
  const queue = await all(env.CONTROL_DB, "SELECT request_id, job_key, worker_name, status, tick_count, run_after, created_at, started_at, finished_at, updated_at, substr(output_json,1,900) AS output_preview, error_code FROM control_job_queue ORDER BY datetime(updated_at) DESC LIMIT 20");
  const runs = await all(env.CONTROL_DB, "SELECT run_id, request_id, job_key, worker_name, status, data_ok, certification_status, started_at, finished_at, elapsed_ms, error_code FROM control_job_runs ORDER BY datetime(started_at) DESC LIMIT 20");
  const logs = await all(env.CONTROL_DB, "SELECT log_id, request_id, run_id, worker_name, job_key, level, event_key, message, created_at FROM control_worker_run_log ORDER BY log_id DESC LIMIT 30");
  return base(env, { job: "orchestrator_logs", queue, runs, logs });
}

async function acquireLock(env, owner) {
  await ensureRows(env);
  const lock = await first(env.CONTROL_DB, "SELECT lock_key, lock_flag, owner_request_id, owner_worker_name, acquired_at, expires_at, updated_at, CASE WHEN expires_at IS NOT NULL AND datetime(expires_at) > datetime('now') THEN 1 ELSE 0 END AS not_expired FROM control_locks WHERE lock_key='GLOBAL_ORCHESTRATOR'");
  if (lock && Number(lock.lock_flag) === 1 && Number(lock.not_expired) === 1) {
    return { ok: false, reason: "lock_busy", lock };
  }

  await run(env.CONTROL_DB,
    "UPDATE control_locks SET lock_flag=1, owner_request_id=?, owner_worker_name=?, acquired_at=CURRENT_TIMESTAMP, expires_at=datetime('now','+5 minutes'), updated_at=CURRENT_TIMESTAMP WHERE lock_key='GLOBAL_ORCHESTRATOR'",
    owner, WORKER_NAME
  );

  await run(env.CONTROL_DB,
    "UPDATE control_system_state SET lock_flag=1, running_job_key='orchestrator', running_request_id=?, status='RUNNING', state_json=?, updated_at=CURRENT_TIMESTAMP WHERE state_key='GLOBAL'",
    owner, JSON.stringify({ owner, version: SYSTEM_VERSION, backend_only: true })
  );

  return { ok: true, owner };
}

async function releaseLock(env, owner, finalStatus = "IDLE") {
  await run(env.CONTROL_DB,
    "UPDATE control_locks SET lock_flag=0, owner_request_id=NULL, owner_worker_name=NULL, expires_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE lock_key='GLOBAL_ORCHESTRATOR' AND (owner_request_id=? OR owner_request_id IS NULL)",
    owner
  );
  await run(env.CONTROL_DB,
    "UPDATE control_system_state SET lock_flag=0, running_job_key=NULL, running_request_id=NULL, status=?, updated_at=CURRENT_TIMESTAMP WHERE state_key='GLOBAL'",
    finalStatus
  );
}

async function enqueueTest(env, source = "orchestrator_api") {
  const existing = await first(env.CONTROL_DB,
    "SELECT request_id, job_key, worker_name, status, created_at, updated_at FROM control_job_queue WHERE job_key IN ('system-health','orchestrator-test-system-health') AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
  );

  if (existing) {
    return base(env, {
      job: "orchestrator_enqueue_test",
      status: "already_queued",
      request_id: existing.request_id,
      existing
    });
  }

  const requestId = rid("orch_real");
  const chainId = rid("chain");
  const input = {
    source,
    mode: "safe_real_orchestrator_backend_test",
    created_at: nowIso(),
    no_mining: true,
    no_scoring: true
  };

  await run(env.CONTROL_DB,
    "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'system-health', 'alphadog-v2-system-health', '00 System', 'system', 'Real Orchestrator Safe System Health Test', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
    requestId, chainId, JSON.stringify(input)
  );

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, 'orchestrator_enqueue_test', 'INFO', 'queued_real_orchestrator_safe_test', 'Queued safe test job for real orchestrator backend continuation', ?, CURRENT_TIMESTAMP)",
    requestId, WORKER_NAME, JSON.stringify({ request_id: requestId, chain_id: chainId, source })
  );

  return base(env, {
    job: "orchestrator_enqueue_test",
    status: "queued",
    request_id: requestId,
    chain_id: chainId,
    note: "Queued safe system-health test. Cron/real orchestrator tick will process it."
  });
}

function isSafeTestJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return (
    (job === "system-health" || job === "orchestrator-test-system-health") &&
    worker === "alphadog-v2-system-health"
  );
}

function isMarketSourceHealthJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "market-source-health" && worker === "alphadog-v2-market-source-health";
}

function isPrizePicksGithubBoardJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "prizepicks-github-board" && worker === "alphadog-v2-prizepicks-github-board";
}

function isParlaySleeperBoardJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "parlay-sleeper-board" && worker === "alphadog-v2-parlay-sleeper-board";
}

function isBaseHitterGameLogsJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "base-hitter-game-logs" && worker === "alphadog-v2-base-hitter-game-logs";
}

function isBaseHitterSplitsJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "base-hitter-splits" && worker === "alphadog-v2-base-hitter-splits";
}

function isBaseHitterMetricsJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "base-hitter-metrics" && worker === "alphadog-v2-base-hitter-metrics";
}

function isBasePitcherMetricsJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "base-pitcher-metrics" && worker === "alphadog-v2-base-pitcher-metrics";
}

function isBasePitcherGameLogsJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "base-pitcher-game-logs" && worker === "alphadog-v2-base-pitcher-game-logs";
}

function isBaseTeamGameLogsJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "base-team-game-logs" && worker === "alphadog-v2-base-team-game-logs";
}

function isBaseStarterHistoryJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "base-starter-history" && worker === "alphadog-v2-base-starter-history";
}

function isBaseBullpenHistoryJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "base-bullpen-history" && worker === "alphadog-v2-base-bullpen-history";
}

function isBasePitcherSplitsJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "base-pitcher-splits" && worker === "alphadog-v2-base-pitcher-splits";
}

function isDailyGamesStatusJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "daily-games-status" && worker === "alphadog-v2-daily-games-status";
}

function isStaticTeamsJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "static-teams" && worker === "alphadog-v2-static-teams";
}

function isStaticStadiumsJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "static-stadiums" && worker === "alphadog-v2-static-stadiums";
}

function isStaticParkFactorsJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "static-park-factors" && worker === "alphadog-v2-static-park-factors";
}

function isStaticPlayersJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "static-players" && worker === "alphadog-v2-static-players";
}

function isStaticPropTaxonomyJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "static-prop-taxonomy" && worker === "alphadog-v2-static-prop-taxonomy";
}

function isStaticCertifierJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "static-certifier" && worker === "alphadog-v2-static-certifier";
}

function isDeltaCertifierJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "delta-certifier" && worker === "alphadog-v2-delta-certifier";
}

function isStaticFullRunJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "static-full-run" && worker === "alphadog-v2-orchestrator";
}

function isIncrementalMorningFullRunJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "incremental-morning-full-run" && worker === "alphadog-v2-orchestrator";
}

function isBoardFullRunJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "board-full-run" && worker === "alphadog-v2-orchestrator";
}

const BOARD_FULL_RUN_LOCK_KEY = "BOARD_FULL_RUN";
const BOARD_FULL_RUN_STALE_MINUTES = 20;

const BOARD_FULL_RUN_STAGES = [
  { stage_key: "board_prizepicks_refresh", job_key: "prizepicks-github-board", worker_name: "alphadog-v2-prizepicks-github-board", display_name: "PrizePicks Board Refresh", visible_button: "BOARD > PrizePicks", mode: "board_full_run_prizepicks_refresh", worker_group: "Board", phase_key: "board", priority: 4 },
  { stage_key: "board_sleeper_refresh", job_key: "parlay-sleeper-board", worker_name: "alphadog-v2-parlay-sleeper-board", display_name: "Sleeper Board Refresh", visible_button: "BOARD > Sleeper", mode: "board_full_run_sleeper_refresh", worker_group: "Board", phase_key: "board", priority: 4 }
];

function boardFullRunChildInput(parentRow, stage, stepIndex, retryCount = 0) {
  return {
    source: "board_full_run_parent",
    mode: stage.mode,
    visible_button: stage.visible_button,
    chain_id: parentRow.chain_id,
    parent_chain_id: parentRow.chain_id,
    parent_request_id: parentRow.request_id,
    stage_key: stage.stage_key,
    stage_index: stepIndex,
    stage_count: BOARD_FULL_RUN_STAGES.length,
    retry_count: retryCount,
    approved_chain_order: BOARD_FULL_RUN_STAGES.map(s => s.job_key),
    stop_on_first_failed_stage: true,
    backend_chain_only: true,
    no_browser_loop: true,
    backend_scheduled_continuation: true,
    no_generic_dispatch: true,
    no_delta_full_run: true,
    no_incremental_morning_full_run: true,
    no_static_work: true,
    no_base_delta_workers: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_old_production_touch: true,
    prizepicks_consumer_only: stage.job_key === "prizepicks-github-board",
    sleeper_board_inventory_only: stage.job_key === "parlay-sleeper-board",
    no_prizepicks_mutation: stage.job_key !== "prizepicks-github-board",
    no_sleeper_mutation: stage.job_key !== "parlay-sleeper-board",
    created_at: nowIso()
  };
}

async function ensureBoardFullRunLock(env, parentRow) {
  await run(env.CONTROL_DB, "INSERT OR IGNORE INTO control_locks (lock_key, lock_flag, updated_at) VALUES (?, 0, CURRENT_TIMESTAMP)", BOARD_FULL_RUN_LOCK_KEY);
  const lock = await first(env.CONTROL_DB,
    "SELECT lock_key, lock_flag, owner_request_id, owner_worker_name, acquired_at, expires_at, updated_at, CASE WHEN expires_at IS NOT NULL AND datetime(expires_at) > datetime('now') THEN 1 ELSE 0 END AS not_expired FROM control_locks WHERE lock_key=?",
    BOARD_FULL_RUN_LOCK_KEY
  );
  const activeOther = await first(env.CONTROL_DB,
    "SELECT request_id, chain_id, status, updated_at FROM control_job_queue WHERE job_key='board-full-run' AND request_id<>? AND status IN ('pending','running','partial_continue') AND finished_at IS NULL ORDER BY datetime(created_at) DESC LIMIT 1",
    parentRow.request_id
  );
  if (lock && Number(lock.lock_flag) === 1 && lock.owner_request_id && lock.owner_request_id !== parentRow.request_id && Number(lock.not_expired) === 1) {
    return { ok: false, reason: "board_full_run_lock_busy", lock, active_other_parent: activeOther || null };
  }
  if (lock && Number(lock.lock_flag) === 1 && lock.owner_request_id && lock.owner_request_id !== parentRow.request_id && activeOther) {
    return { ok: false, reason: "board_full_run_active_parent_exists", lock, active_other_parent: activeOther };
  }
  await run(env.CONTROL_DB,
    "UPDATE control_locks SET lock_flag=1, owner_request_id=?, owner_worker_name=?, acquired_at=COALESCE(acquired_at,CURRENT_TIMESTAMP), expires_at=datetime('now','+20 minutes'), updated_at=CURRENT_TIMESTAMP WHERE lock_key=?",
    parentRow.request_id, WORKER_NAME, BOARD_FULL_RUN_LOCK_KEY
  );
  return { ok: true, recovered_stale_lock: !!(lock && Number(lock.lock_flag) === 1 && lock.owner_request_id !== parentRow.request_id) };
}

async function releaseBoardFullRunLock(env, parentRow) {
  await run(env.CONTROL_DB,
    "UPDATE control_locks SET lock_flag=0, owner_request_id=NULL, owner_worker_name=NULL, expires_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE lock_key=? AND (owner_request_id=? OR owner_request_id IS NULL)",
    BOARD_FULL_RUN_LOCK_KEY, parentRow.request_id
  );
}

async function enqueueBoardFullRunChild(env, parentRow, stage, stepIndex, retryCount = 0) {
  const childRequestId = rid(stage.stage_key.replace(/-/g, "_"));
  const input = boardFullRunChildInput(parentRow, stage, stepIndex, retryCount);
  await run(env.CONTROL_DB,
    "INSERT INTO control_job_queue (request_id, chain_id, parent_request_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
    childRequestId, parentRow.chain_id, parentRow.request_id, stage.job_key, stage.worker_name, stage.worker_group, stage.phase_key, stage.display_name, stage.priority, JSON.stringify(input)
  );
  return { child_request_id: childRequestId, input };
}

function boardFullRunStageKeyFromChild(child) {
  const input = parseJsonSafeText(child && child.input_json || "{}", {});
  return String(input.stage_key || "");
}

function childPassedBoardFullRun(stage, child) {
  if (!child) return { pass: false, wait: false, reason: "child_missing" };
  const status = String(child.status || "");
  if (["pending", "running", "partial_continue"].includes(status) && !child.finished_at) return { pass: false, wait: true, reason: "child_active", child_status: status };
  if (status !== "completed") return { pass: false, transient: status === "failed" || status === "blocked", reason: "child_not_completed", child_status: status, child_error_code: child.error_code || null };
  const output = parseJsonSafeText(child.output_json || "{}", {});
  const cert = String(output.certification || "");
  if (!output || output.ok !== true) return { pass: false, reason: "child_output_ok_not_true", output_ok: output && output.ok };
  if (output.data_ok !== true) return { pass: false, reason: "child_data_ok_not_true", data_ok: output && output.data_ok };
  if (stage.job_key === "prizepicks-github-board") {
    if (cert !== "promoted_current_board") return { pass: false, reason: "prizepicks_not_promoted_current_board", certification: cert };
    if (Number(output.rows_promoted || 0) <= 0) return { pass: false, reason: "prizepicks_rows_promoted_zero", rows_promoted: output.rows_promoted || 0 };
    if (Number(output.future_pickable_rows || 0) <= 0) return { pass: false, reason: "prizepicks_future_pickable_zero", future_pickable_rows: output.future_pickable_rows || 0 };
    if (output.no_scoring === false || output.no_ranking === false || output.no_final_board_write === false) return { pass: false, reason: "prizepicks_unsafe_downstream_flag_false" };
  }
  if (stage.job_key === "parlay-sleeper-board") {
    if (cert !== "PARLAY_SLEEPER_BOARD_INVENTORY_PROMOTED_NO_SCORING") return { pass: false, reason: "sleeper_not_promoted_inventory_only", certification: cert };
    const currentRows = Number(output.current_rows_written || output.promoted_rows_written || (output.stage_only_result && output.stage_only_result.current_rows_written) || 0);
    const activeRows = Number(output.active_batch_rows_written || (output.stage_only_result && output.stage_only_result.active_batch_rows_written) || (output.stage_only_result && output.stage_only_result.promotion && output.stage_only_result.promotion.active_batch_rows) || 0);
    if (currentRows <= 0) return { pass: false, reason: "sleeper_current_rows_zero", current_rows_written: currentRows };
    if (activeRows !== 1) return { pass: false, reason: "sleeper_active_batch_not_one", active_batch_rows_written: activeRows };
    if (output.no_scoring !== true || output.no_ranking !== true || output.no_final_board !== true) return { pass: false, reason: "sleeper_inventory_safety_flags_missing" };
  }
  return { pass: true, certification: cert, data_ok: output.data_ok, rows_read: output.rows_read || 0, rows_written: output.rows_written || 0, rows_promoted: output.rows_promoted || output.promoted_rows_written || 0, external_calls: output.external_calls_performed || output.external_calls || 0, output };
}

async function processBoardFullRunJob(env, row, runId, trigger) {
  const started = Date.now();
  const parentInput = parseJsonSafeText(row.input_json || "{}", {});
  const lock = await ensureBoardFullRunLock(env, row);
  if (!lock.ok) {
    const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "board_full_run", status: "PARTIAL_CONTINUE_BOARD_FULL_RUN_LOCK_BUSY", certification: "BOARD_FULL_RUN_LOCK_BUSY_WAIT", lock, continuation_required: true, orchestrator_should_self_continue: true };
    await run(env.CONTROL_DB, "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'BOARD_FULL_RUN_LOCK_BUSY_WAIT', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
    await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=datetime('now','+10 seconds'), updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
    return output;
  }

  const stageReports = [];
  for (let i = 0; i < BOARD_FULL_RUN_STAGES.length; i++) {
    const stage = BOARD_FULL_RUN_STAGES[i];
    const attempts = await all(env.CONTROL_DB,
      "SELECT request_id, status, error_code, error_message, output_json, input_json, created_at, started_at, finished_at, updated_at FROM control_job_queue WHERE parent_request_id=? AND chain_id=? AND job_key=? ORDER BY datetime(created_at) ASC",
      row.request_id, row.chain_id, stage.job_key
    );
    const stageAttempts = attempts.filter(c => boardFullRunStageKeyFromChild(c) === stage.stage_key || attempts.length === 1);
    const child = stageAttempts.length ? stageAttempts[stageAttempts.length - 1] : null;

    if (!child) {
      const enqueued = await enqueueBoardFullRunChild(env, row, stage, i, 0);
      const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "board_full_run", status: "PARTIAL_CONTINUE_BOARD_FULL_RUN_CHILD_ENQUEUED", certification: "BOARD_FULL_RUN_CHILD_ENQUEUED", certification_grade: "PARTIAL", current_stage_key: stage.stage_key, current_stage_index: i, enqueued_child_request_id: enqueued.child_request_id, completed_stage_count: stageReports.length, total_stage_count: BOARD_FULL_RUN_STAGES.length, stages: [...stageReports, { stage_key: stage.stage_key, job_key: stage.job_key, child_request_id: enqueued.child_request_id, child_status: "pending", pass: null }], continuation_required: true, orchestrator_should_self_continue: true, lock_held: true, board_full_run_only: true, no_delta_full_run: true, no_scoring: true, no_ranking: true, no_final_board: true };
      await run(env.CONTROL_DB, "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'BOARD_FULL_RUN_CHILD_ENQUEUED', ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, i, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
      await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
      await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'board_full_run_child_enqueued', 'Board Full Run enqueued next child stage', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ parent_request_id: row.request_id, child_request_id: enqueued.child_request_id, stage_key: stage.stage_key, stage_index: i, mode: stage.mode }));
      return output;
    }

    const validation = childPassedBoardFullRun(stage, child);
    const childOutput = parseJsonSafeText(child.output_json || "{}", {});
    const report = { stage_key: stage.stage_key, job_key: stage.job_key, mode: stage.mode, child_request_id: child.request_id, child_status: child.status, child_certification: childOutput.certification || null, child_data_ok: childOutput.data_ok === true, pass: validation.pass, wait: !!validation.wait, reason: validation.reason || null, rows_read: childOutput.rows_read || 0, rows_written: childOutput.rows_written || 0, rows_promoted: childOutput.rows_promoted || childOutput.promoted_rows_written || 0, external_calls: childOutput.external_calls_performed || childOutput.external_calls || 0, attempts: stageAttempts.length };

    if (validation.wait) {
      const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "board_full_run", status: "PARTIAL_CONTINUE_BOARD_FULL_RUN_WAITING_ON_CHILD", certification: "BOARD_FULL_RUN_WAITING_ON_CHILD", certification_grade: "PARTIAL", current_stage_key: stage.stage_key, waiting_on_child_request_id: child.request_id, waiting_on_child_status: child.status, completed_stage_count: stageReports.length, total_stage_count: BOARD_FULL_RUN_STAGES.length, stages: [...stageReports, report], continuation_required: true, orchestrator_should_self_continue: true, lock_held: true };
      await run(env.CONTROL_DB, "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'BOARD_FULL_RUN_WAITING_ON_CHILD', ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, i + 1, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
      await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=datetime('now','+6 seconds'), updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
      return output;
    }

    if (!validation.pass) {
      const finalStatus = "FAILED_BOARD_FULL_RUN_CHILD_FAILED";
      const output = { ok: false, data_ok: false, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "board_full_run", status: finalStatus, certification: finalStatus, certification_grade: "FAILED", failed_stage_key: stage.stage_key, failed_request_id: child.request_id, failed_reason: validation.reason, child_error_code: child.error_code || null, child_error_message: child.error_message || null, last_output_preview: JSON.stringify(childOutput).slice(0, 1200), stages: [...stageReports, report], board_full_run_certified: false, no_delta_full_run: true, no_scoring: true, no_ranking: true, no_final_board: true };
      await releaseBoardFullRunLock(env, row);
      await run(env.CONTROL_DB, "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'failed', 0, ?, ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, finalStatus, i + 1, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output), finalStatus.toLowerCase(), String(validation.reason || "board full run child failed").slice(0, 900));
      await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='failed', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?", JSON.stringify(output), finalStatus.toLowerCase(), String(validation.reason || "board full run child failed").slice(0, 900), row.request_id);
      await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'ERROR', 'board_full_run_stopped', 'Board Full Run stopped on failed child stage', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify(output));
      return output;
    }

    stageReports.push(report);
  }

  const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "board_full_run", status: "COMPLETED_BOARD_FULL_RUN", certification: "BOARD_FULL_RUN_CERTIFIED_PRIZEPICKS_AND_SLEEPER_PASS", certification_grade: "FULL_RUN_PASS", board_full_run_certified: true, completed_stage_count: stageReports.length, total_stage_count: BOARD_FULL_RUN_STAGES.length, stages: stageReports, approved_chain_order: BOARD_FULL_RUN_STAGES.map(s => s.job_key), board_full_run_only: true, no_delta_full_run: true, no_incremental_morning_full_run: true, no_static_work: true, no_base_delta_workers: true, no_scoring: true, no_ranking: true, no_final_board: true, no_old_production_touch: true };
  await releaseBoardFullRunLock(env, row);
  await run(env.CONTROL_DB, "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'completed', 1, 'BOARD_FULL_RUN_CERTIFIED', ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, stageReports.length, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
  await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='completed', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
  await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'board_full_run_completed', 'Board Full Run certified PrizePicks then Sleeper board refresh stages', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify(output));
  return output;
}

const INCREMENTAL_MORNING_FULL_RUN_LOCK_KEY = "INCREMENTAL_MORNING_FULL_RUN";
const INCREMENTAL_MORNING_FULL_RUN_STALE_MINUTES = 60;
const INCREMENTAL_MORNING_FULL_RUN_MAX_RETRIES_PER_STAGE = 2;

const INCREMENTAL_MORNING_FULL_RUN_SCHEDULE_WINDOW_MINUTES = 15;
const BOARD_FULL_RUN_SCHEDULE_WINDOW_MINUTES = 5;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function randomToken(len = 6) {
  return Math.random().toString(36).slice(2, 2 + len);
}

function pacificNowParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  let hour = Number(parts.hour || 0);
  // Some runtimes can render midnight as 24:xx for hourCycle h24.
  if (hour === 24) hour = 0;
  const minute = Number(parts.minute || 0);
  const second = Number(parts.second || 0);
  const year = String(parts.year || "");
  const month = String(parts.month || "");
  const day = String(parts.day || "");
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    ymd_dash: `${year}-${month}-${day}`,
    ymd_key: `${year}_${month}_${day}`,
    local_time: `${pad2(hour)}:${pad2(minute)}:${pad2(second)}`
  };
}

function isApprovedIncrementalMorningFullRunScheduleWindow(pt) {
  return Number(pt.hour) === 1 && Number(pt.minute) >= 0 && Number(pt.minute) < INCREMENTAL_MORNING_FULL_RUN_SCHEDULE_WINDOW_MINUTES;
}

async function enqueueScheduledIncrementalMorningFullRunIfDue(env, cronExpression = "unknown") {
  await ensureSchema(env);
  const pt = pacificNowParts(new Date());
  const scheduledDedupeKey = `incremental_morning_full_run_${pt.ymd_key}`;
  const inWindow = isApprovedIncrementalMorningFullRunScheduleWindow(pt);

  const basePayload = {
    ok: true,
    data_ok: true,
    version: SYSTEM_VERSION,
    worker_name: WORKER_NAME,
    job_key: "incremental-morning-full-run",
    mode: "scheduled_incremental_morning_full_run_enqueue_guard",
    cron_expression: cronExpression,
    pacific_date: pt.ymd_dash,
    pacific_time: pt.local_time,
    scheduled_dedupe_key: scheduledDedupeKey,
    approved_window: "01:00-01:14 America/Los_Angeles",
    in_window: inWindow,
    no_board_refresh_included: true,
    board_refresh_deferred: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_old_production_touch: true
  };

  if (!inWindow) {
    return { ...basePayload, status: "SCHEDULED_INCREMENTAL_MORNING_FULL_RUN_NOT_DUE" };
  }

  const existingRows = await all(env.CONTROL_DB,
    `SELECT request_id, chain_id, status, created_at, started_at, finished_at, updated_at, error_code, error_message, substr(input_json,1,1200) AS input_preview
     FROM control_job_queue
     WHERE job_key='incremental-morning-full-run'
       AND worker_name='alphadog-v2-orchestrator'
       AND (request_id LIKE ? OR input_json LIKE ?)
     ORDER BY datetime(created_at) DESC
     LIMIT 10`,
    `${scheduledDedupeKey}_%`, `%"scheduled_dedupe_key":"${scheduledDedupeKey}"%`
  );

  const active = existingRows.find(r => ["pending", "running", "partial_continue"].includes(String(r.status || "")) && !r.finished_at);
  if (active) {
    const payload = { ...basePayload, status: "SCHEDULED_INCREMENTAL_MORNING_FULL_RUN_NOOP_ACTIVE_EXISTS", existing_request_id: active.request_id, existing_chain_id: active.chain_id, existing_status: active.status };
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'INFO', 'scheduled_incremental_morning_full_run_noop_active_exists', 'Scheduled Incremental Morning Full Run did not enqueue because same Pacific-date parent is active', ?, CURRENT_TIMESTAMP)",
      active.request_id, WORKER_NAME, "incremental-morning-full-run", JSON.stringify(payload)
    );
    return payload;
  }

  const completed = existingRows.find(r => String(r.status || "") === "completed");
  if (completed) {
    const payload = { ...basePayload, status: "SCHEDULED_INCREMENTAL_MORNING_FULL_RUN_NOOP_ALREADY_COMPLETED", existing_request_id: completed.request_id, existing_chain_id: completed.chain_id, existing_status: completed.status };
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'INFO', 'scheduled_incremental_morning_full_run_noop_already_completed', 'Scheduled Incremental Morning Full Run did not enqueue because same Pacific-date parent already completed', ?, CURRENT_TIMESTAMP)",
      completed.request_id, WORKER_NAME, "incremental-morning-full-run", JSON.stringify(payload)
    );
    return payload;
  }

  const failed = existingRows.find(r => ["failed", "blocked", "error"].includes(String(r.status || "")) || r.error_code);
  if (failed) {
    const payload = { ...basePayload, ok: false, data_ok: false, status: "BLOCKED_SCHEDULED_INCREMENTAL_MORNING_FULL_RUN_SAME_DATE_FAILED_REQUIRES_REVIEW", existing_request_id: failed.request_id, existing_chain_id: failed.chain_id, existing_status: failed.status, existing_error_code: failed.error_code || null, existing_error_message: failed.error_message || null };
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'ERROR', 'scheduled_incremental_morning_full_run_blocked_failed_same_date', 'Scheduled Incremental Morning Full Run blocked because same Pacific-date parent failed/blocked and requires review', ?, CURRENT_TIMESTAMP)",
      failed.request_id, WORKER_NAME, "incremental-morning-full-run", JSON.stringify(payload)
    );
    return payload;
  }

  const requestId = `${scheduledDedupeKey}_${Date.now().toString(36)}_${randomToken(6)}`;
  const chainId = `chain_${scheduledDedupeKey}_${Date.now().toString(36)}`;
  const childModes = {};
  for (const stage of INCREMENTAL_MORNING_FULL_RUN_STAGES) childModes[stage.job_key] = stage.mode;
  const input = {
    source: "orchestrator_scheduled",
    visible_button: "SCHEDULED > Incremental Morning Full Run",
    mode: "incremental_morning_full_run",
    scheduled: true,
    scheduled_or_manual: "scheduled",
    scheduled_dedupe_key: scheduledDedupeKey,
    scheduled_pacific_date: pt.ymd_dash,
    scheduled_pacific_time: pt.local_time,
    cron_expression: cronExpression,
    created_at: nowIso(),
    approved_chain_order: INCREMENTAL_MORNING_FULL_RUN_STAGES.map(s => s.job_key),
    child_modes: childModes,
    stop_on_first_failed_stage: true,
    max_retries_per_child: INCREMENTAL_MORNING_FULL_RUN_MAX_RETRIES_PER_STAGE,
    stale_threshold_minutes: INCREMENTAL_MORNING_FULL_RUN_STALE_MINUTES,
    backend_chain_only: true,
    no_browser_loop: true,
    backend_scheduled_continuation: true,
    no_board_refresh_included: true,
    board_refresh_deferred: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_old_production_touch: true
  };

  await run(env.CONTROL_DB,
    "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'incremental-morning-full-run', 'alphadog-v2-orchestrator', 'Delta', 'incremental_base', 'Scheduled Incremental Morning Full Run Backend Chain', 'pending', 8, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
    requestId, chainId, JSON.stringify(input)
  );

  const payload = { ...basePayload, status: "SCHEDULED_INCREMENTAL_MORNING_FULL_RUN_QUEUED", request_id: requestId, chain_id: chainId, queued_job_key: "incremental-morning-full-run", queued_worker_name: WORKER_NAME, approved_chain_order: input.approved_chain_order, backend_chain_only: true };
  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'INFO', 'scheduled_incremental_morning_full_run_queued', 'Scheduled Incremental Morning Full Run parent backend chain job queued', ?, CURRENT_TIMESTAMP)",
    requestId, WORKER_NAME, "incremental-morning-full-run", JSON.stringify(payload)
  );
  return payload;
}


function parseScheduledLocalTimeHHMM(localTime) {
  const m = /^([0-2]\d):([0-5]\d)$/.exec(String(localTime || "").trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23) return null;
  return { hour, minute, hhmm: `${pad2(hour)}:${pad2(minute)}`, key: `${pad2(hour)}${pad2(minute)}` };
}

function minutesSinceMidnight(hour, minute) {
  return Number(hour) * 60 + Number(minute);
}

function isPacificScheduleWindowDue(pt, parsedLocalTime, windowMinutes = BOARD_FULL_RUN_SCHEDULE_WINDOW_MINUTES) {
  if (!parsedLocalTime) return false;
  const nowMin = minutesSinceMidnight(pt.hour, pt.minute);
  const targetMin = minutesSinceMidnight(parsedLocalTime.hour, parsedLocalTime.minute);
  const diff = nowMin - targetMin;
  return diff >= 0 && diff < Number(windowMinutes || 5);
}

async function ensureConfigScheduledJobsTable(env) {
  await run(env.CONFIG_DB,
    "CREATE TABLE IF NOT EXISTS config_scheduled_jobs (schedule_id TEXT PRIMARY KEY, job_key TEXT NOT NULL, job_name TEXT, enabled INTEGER NOT NULL DEFAULT 1, timezone TEXT NOT NULL, local_time TEXT NOT NULL, schedule_type TEXT NOT NULL, dedupe_scope TEXT NOT NULL, input_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, notes TEXT)"
  );
}

async function enqueueScheduledBoardFullRunIfDue(env, cronExpression = "unknown") {
  await ensureSchema(env);
  await ensureConfigScheduledJobsTable(env);

  const pt = pacificNowParts(new Date());
  const scheduleRows = await all(env.CONFIG_DB,
    `SELECT schedule_id, job_key, job_name, enabled, timezone, local_time, schedule_type, dedupe_scope, input_json, notes
     FROM config_scheduled_jobs
     WHERE enabled=1
       AND job_key='board-full-run'
       AND schedule_type='daily'
       AND timezone='America/Los_Angeles'
     ORDER BY local_time`
  );

  const results = [];
  for (const schedule of scheduleRows) {
    const parsedTime = parseScheduledLocalTimeHHMM(schedule.local_time);
    const basePayload = {
      ok: true,
      data_ok: true,
      version: SYSTEM_VERSION,
      worker_name: WORKER_NAME,
      job_key: "board-full-run",
      mode: "scheduled_board_full_run_enqueue_guard",
      schedule_id: schedule.schedule_id,
      cron_expression: cronExpression,
      pacific_date: pt.ymd_dash,
      pacific_time: pt.local_time,
      configured_local_time: schedule.local_time,
      timezone: schedule.timezone,
      schedule_type: schedule.schedule_type,
      dedupe_scope: schedule.dedupe_scope,
      approved_window_minutes: BOARD_FULL_RUN_SCHEDULE_WINDOW_MINUTES,
      board_full_run_only: true,
      no_incremental_morning_full_run: true,
      no_static_work: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_old_production_touch: true
    };

    if (!parsedTime) {
      const payload = { ...basePayload, ok: false, data_ok: false, status: "BLOCKED_SCHEDULED_BOARD_FULL_RUN_BAD_LOCAL_TIME", reason: "local_time must be HH:MM" };
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'board-full-run', 'ERROR', 'scheduled_board_full_run_bad_local_time', 'Scheduled Board Full Run row has invalid local_time', ?, CURRENT_TIMESTAMP)",
        WORKER_NAME, JSON.stringify(payload)
      );
      results.push(payload);
      continue;
    }

    const scheduledKey = `board_full_run_${pt.ymd_key}_${parsedTime.key}_PT`;
    const inWindow = isPacificScheduleWindowDue(pt, parsedTime, BOARD_FULL_RUN_SCHEDULE_WINDOW_MINUTES);
    if (!inWindow) {
      results.push({ ...basePayload, status: "SCHEDULED_BOARD_FULL_RUN_NOT_DUE", scheduled_key: scheduledKey });
      continue;
    }

    const existingRows = await all(env.CONTROL_DB,
      `SELECT request_id, chain_id, status, created_at, started_at, finished_at, updated_at, error_code, error_message
       FROM control_job_queue
       WHERE job_key='board-full-run'
         AND worker_name='alphadog-v2-orchestrator'
         AND json_extract(input_json,'$.scheduled_key')=?
       ORDER BY datetime(created_at) DESC
       LIMIT 10`,
      scheduledKey
    );

    const active = existingRows.find(r => ["pending", "running", "partial_continue"].includes(String(r.status || "")) && !r.finished_at);
    if (active) {
      const payload = { ...basePayload, status: "SCHEDULED_BOARD_FULL_RUN_NOOP_ACTIVE_EXISTS", scheduled_key: scheduledKey, existing_request_id: active.request_id, existing_chain_id: active.chain_id, existing_status: active.status };
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, 'board-full-run', 'INFO', 'scheduled_board_full_run_noop_active_exists', 'Scheduled Board Full Run did not enqueue because same scheduled key is active', ?, CURRENT_TIMESTAMP)",
        active.request_id, WORKER_NAME, JSON.stringify(payload)
      );
      results.push(payload);
      continue;
    }

    const completed = existingRows.find(r => String(r.status || "") === "completed");
    if (completed) {
      const payload = { ...basePayload, status: "SCHEDULED_BOARD_FULL_RUN_NOOP_ALREADY_COMPLETED", scheduled_key: scheduledKey, existing_request_id: completed.request_id, existing_chain_id: completed.chain_id, existing_status: completed.status };
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, 'board-full-run', 'INFO', 'scheduled_board_full_run_noop_already_completed', 'Scheduled Board Full Run did not enqueue because same scheduled key already completed', ?, CURRENT_TIMESTAMP)",
        completed.request_id, WORKER_NAME, JSON.stringify(payload)
      );
      results.push(payload);
      continue;
    }

    const failed = existingRows.find(r => ["failed", "blocked", "error"].includes(String(r.status || "")) || r.error_code);
    if (failed) {
      const payload = { ...basePayload, ok: false, data_ok: false, status: "BLOCKED_SCHEDULED_BOARD_FULL_RUN_SAME_KEY_FAILED_REQUIRES_REVIEW", scheduled_key: scheduledKey, existing_request_id: failed.request_id, existing_chain_id: failed.chain_id, existing_status: failed.status, existing_error_code: failed.error_code || null, existing_error_message: failed.error_message || null };
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, 'board-full-run', 'ERROR', 'scheduled_board_full_run_blocked_failed_same_key', 'Scheduled Board Full Run blocked because same scheduled key failed/blocked and requires review', ?, CURRENT_TIMESTAMP)",
        failed.request_id, WORKER_NAME, JSON.stringify(payload)
      );
      results.push(payload);
      continue;
    }

    const configInput = parseJsonSafeText(schedule.input_json || "{}", {});
    const requestId = `${scheduledKey}_${Date.now().toString(36)}_${randomToken(6)}`;
    const chainId = `chain_${scheduledKey}_${Date.now().toString(36)}`;
    const childModes = {};
    for (const stage of BOARD_FULL_RUN_STAGES) childModes[stage.job_key] = stage.mode;

    const input = {
      ...configInput,
      source: "config_scheduled_jobs",
      visible_button: "SCHEDULED > Board Full Run",
      mode: "board_full_run",
      scheduled: true,
      scheduled_or_manual: "scheduled",
      schedule_id: schedule.schedule_id,
      scheduled_key: scheduledKey,
      scheduled_pacific_date: pt.ymd_dash,
      pacific_date: pt.ymd_dash,
      scheduled_pacific_time: pt.local_time,
      local_time: parsedTime.hhmm,
      timezone: "America/Los_Angeles",
      cron_expression: cronExpression,
      created_at: nowIso(),
      approved_chain_order: BOARD_FULL_RUN_STAGES.map(s => s.job_key),
      child_modes: childModes,
      stop_on_first_failed_stage: true,
      backend_chain_only: true,
      no_browser_loop: true,
      backend_scheduled_continuation: true,
      no_generic_dispatch: true,
      no_delta_full_run: true,
      no_incremental_morning_full_run: true,
      no_static_work: true,
      no_base_delta_workers: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_old_production_touch: true
    };

    await run(env.CONTROL_DB,
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'board-full-run', 'alphadog-v2-orchestrator', 'Board', 'board', 'Scheduled Board Full Run Backend Chain', 'pending', 9, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
      requestId, chainId, JSON.stringify(input)
    );

    const payload = { ...basePayload, status: "SCHEDULED_BOARD_FULL_RUN_QUEUED", scheduled_key: scheduledKey, request_id: requestId, chain_id: chainId, queued_job_key: "board-full-run", queued_worker_name: WORKER_NAME, approved_chain_order: input.approved_chain_order, backend_chain_only: true };
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, 'board-full-run', 'INFO', 'scheduled_board_full_run_queued', 'Scheduled Board Full Run parent backend chain job queued from CONFIG_DB schedule', ?, CURRENT_TIMESTAMP)",
      requestId, WORKER_NAME, JSON.stringify(payload)
    );
    results.push(payload);
  }

  return {
    ok: true,
    data_ok: true,
    version: SYSTEM_VERSION,
    worker_name: WORKER_NAME,
    job_key: "board-full-run",
    mode: "scheduled_board_full_run_config_scan",
    cron_expression: cronExpression,
    pacific_date: pt.ymd_dash,
    pacific_time: pt.local_time,
    schedules_read: scheduleRows.length,
    queued_count: results.filter(r => r.status === "SCHEDULED_BOARD_FULL_RUN_QUEUED").length,
    blocked_count: results.filter(r => r.ok === false || String(r.status || "").startsWith("BLOCKED_")).length,
    results
  };
}

const INCREMENTAL_MORNING_FULL_RUN_STAGES = [
  { stage_key: "hitter_game_logs_delta", job_key: "base-hitter-game-logs", worker_name: "alphadog-v2-base-hitter-game-logs", display_name: "Hitter Game Logs Delta", visible_button: "DELTA > Hitter Game Logs", mode: "delta_update", worker_group: "Delta", phase_key: "incremental_base", priority: 4 },
  { stage_key: "pitcher_game_logs_delta", job_key: "base-pitcher-game-logs", worker_name: "alphadog-v2-base-pitcher-game-logs", display_name: "Pitcher Game Logs Delta", visible_button: "DELTA > Pitcher Game Logs", mode: "delta_update", worker_group: "Delta", phase_key: "incremental_base", priority: 4 },
  { stage_key: "team_game_logs_delta", job_key: "base-team-game-logs", worker_name: "alphadog-v2-base-team-game-logs", display_name: "Team Game Logs Delta", visible_button: "DELTA > Team Game Logs", mode: "delta_update", worker_group: "Delta", phase_key: "incremental_base", priority: 4 },
  { stage_key: "starter_history_delta", job_key: "base-starter-history", worker_name: "alphadog-v2-base-starter-history", display_name: "Starter History Delta", visible_button: "BASE > Starter History", mode: "delta_scoped_source_repair", worker_group: "Delta", phase_key: "incremental_base", priority: 4 },
  { stage_key: "bullpen_history_delta", job_key: "base-bullpen-history", worker_name: "alphadog-v2-base-bullpen-history", display_name: "Bullpen History Delta", visible_button: "BASE > Bullpen History", mode: "delta_update", worker_group: "Delta", phase_key: "incremental_base", priority: 4 },
  { stage_key: "hitter_splits_delta", job_key: "base-hitter-splits", worker_name: "alphadog-v2-base-hitter-splits", display_name: "Hitter Splits Delta", visible_button: "DELTA > Hitter Splits", mode: "delta_update", worker_group: "Delta", phase_key: "incremental_base", priority: 4 },
  { stage_key: "pitcher_splits_delta", job_key: "base-pitcher-splits", worker_name: "alphadog-v2-base-pitcher-splits", display_name: "Pitcher Splits Delta", visible_button: "DELTA > Pitcher Splits", mode: "delta_update", worker_group: "Delta", phase_key: "incremental_base", priority: 4 },
  { stage_key: "hitter_metrics_affected_delta", job_key: "base-hitter-metrics", worker_name: "alphadog-v2-base-hitter-metrics", display_name: "Hitter Metrics Affected Delta", visible_button: "DELTA > Hitter Metrics", mode: "delta_recalculate_affected_players", worker_group: "Delta", phase_key: "incremental_base", priority: 4 },
  { stage_key: "pitcher_metrics_affected_delta", job_key: "base-pitcher-metrics", worker_name: "alphadog-v2-base-pitcher-metrics", display_name: "Pitcher Metrics Affected Delta", visible_button: "DELTA > Pitcher Metrics", mode: "delta_recalculate_affected_players", worker_group: "Delta", phase_key: "incremental_base", priority: 4 }
];

const STATIC_FULL_RUN_STAGES = [
  { job_key: "static-teams", worker_name: "alphadog-v2-static-teams", display_name: "Static Teams", visible_button: "STATIC > Teams" },
  { job_key: "static-stadiums", worker_name: "alphadog-v2-static-stadiums", display_name: "Static Stadiums", visible_button: "STATIC > Stadiums" },
  { job_key: "static-park-factors", worker_name: "alphadog-v2-static-park-factors", display_name: "Static Park Factors", visible_button: "STATIC > Park Factors" },
  { job_key: "static-players", worker_name: "alphadog-v2-static-players", display_name: "Static Players", visible_button: "STATIC > Players" },
  { job_key: "static-prop-taxonomy", worker_name: "alphadog-v2-static-prop-taxonomy", display_name: "Static Prop Taxonomy", visible_button: "STATIC > Prop Taxonomy" },
  { job_key: "static-certifier", worker_name: "alphadog-v2-static-certifier", display_name: "Static Certifier", visible_button: "STATIC > Certifier" }
];

function parseJsonSafeText(text, fallback = {}) {
  try { return text ? JSON.parse(text) : fallback; } catch (_) { return fallback; }
}

function childPassedStaticFullRun(stage, child) {
  if (!child || String(child.status || "") !== "completed") {
    return { pass: false, reason: "child_not_completed", child_status: child ? child.status : null };
  }
  const output = parseJsonSafeText(child.output_json || "{}", {});
  const cert = String(output.certification || "");
  if (!output || output.ok !== true) return { pass: false, reason: "child_output_ok_not_true", output_ok: output && output.ok };
  if (output.data_ok !== true) return { pass: false, reason: "child_data_ok_not_true", data_ok: output && output.data_ok };
  if (!cert || cert === "DUMMY_ONLY_NOT_REAL_DATA" || cert.toLowerCase().includes("dummy")) return { pass: false, reason: "missing_or_dummy_certification", certification: cert };
  if (stage.job_key === "static-certifier") {
    if (output.full_static_certified !== true) return { pass: false, reason: "final_certifier_not_full_static_certified", full_static_certified: output.full_static_certified };
    if (Number(output.rows_written || 0) !== 0) return { pass: false, reason: "static_certifier_wrote_rows", rows_written: output.rows_written };
    if (Number(output.external_calls_performed || 0) !== 0) return { pass: false, reason: "static_certifier_external_calls", external_calls_performed: output.external_calls_performed };
  }
  const unsafeFalseKeys = ["no_old_production_touch", "no_scoring", "no_ranking", "no_prizepicks_board_mutation"];
  for (const k of unsafeFalseKeys) {
    if (Object.prototype.hasOwnProperty.call(output, k) && output[k] === false) return { pass: false, reason: `unsafe_output_${k}_false` };
  }
  return { pass: true, certification: cert, data_ok: output.data_ok, rows_read: output.rows_read || 0, rows_written: output.rows_written || 0, output };
}

function staticFullRunChildInput(parentRow, stage, stepIndex) {
  return {
    source: "static_full_run_parent",
    visible_button: stage.visible_button,
    mode: `static_full_run_stage_${stepIndex + 1}_${stage.job_key}`,
    parent_request_id: parentRow.request_id,
    parent_chain_id: parentRow.chain_id,
    stage_index: stepIndex,
    approved_static_full_run_order: STATIC_FULL_RUN_STAGES.map(s => s.job_key),
    deferred_workers_skipped: ["static-rosters", "static-player-aliases"],
    backend_scheduled_continuation: true,
    no_browser_auto_pump: true,
    no_control_room_to_orchestrator_fetch: true,
    no_generic_dispatch: true,
    no_prizepicks_board_mutation: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_sleeper_work: true,
    no_old_production_touch: true,
    created_at: nowIso()
  };
}

function incrementalFullRunStageKeyFromChild(child) {
  const input = parseJsonSafeText(child && child.input_json || "{}", {});
  return String(input.full_run_stage_key || input.stage_key || "");
}

function isIncrementalFullRunTransientFailure(child, output) {
  const text = JSON.stringify({ status: child && child.status, error_code: child && child.error_code, error_message: child && child.error_message, output }).toLowerCase();
  return /429|500|503|timeout|timed out|temporar|retry_later|rate limit|cloudflare|fetch|network|econn|worker_dispatch_exception|service_binding_fetch_failed|lock_busy/.test(text);
}

function childPassedIncrementalMorningFullRun(stage, child) {
  if (!child) return { pass: false, reason: "child_missing" };
  const childStatus = String(child.status || "");
  const output = parseJsonSafeText(child.output_json || "{}", {});
  if (childStatus === "pending" || childStatus === "running" || childStatus === "partial_continue") {
    if (Number(child.is_stale || 0) === 1) {
      return { pass: false, wait: false, reason: "child_stale_unfinished", child_status: childStatus, updated_at: child.updated_at };
    }
    return { pass: false, wait: true, reason: "child_not_finished", child_status: childStatus, updated_at: child.updated_at };
  }
  if (childStatus !== "completed") return { pass: false, reason: "child_not_completed", child_status: childStatus, transient: isIncrementalFullRunTransientFailure(child, output) };
  if (!output || output.ok !== true) return { pass: false, reason: "child_output_ok_not_true", output_ok: output && output.ok, transient: isIncrementalFullRunTransientFailure(child, output) };
  if (output.data_ok !== true) return { pass: false, reason: "child_data_ok_not_true", data_ok: output && output.data_ok, transient: isIncrementalFullRunTransientFailure(child, output) };
  const cert = String(output.certification || output.certification_status || "");
  const status = String(output.status || "");
  const hay = `${cert} ${status}`.toLowerCase();
  if (!cert || hay.includes("dummy") || hay.includes("unsupported")) return { pass: false, reason: "missing_dummy_or_unsupported_certification", certification: cert, status };
  if (stage.mode === "delta_update" && hay.includes("base_backfill")) return { pass: false, reason: "base_backfill_certification_returned_during_delta_stage", certification: cert, status };
  if (stage.mode === "delta_recalculate_affected_players" && String(output.mode || "") !== "delta_recalculate_affected_players") return { pass: false, reason: "metrics_stage_wrong_mode", output_mode: output.mode };
  if (Number(output.duplicate_count || output.duplicate_live_keys || 0) > 0) return { pass: false, reason: "duplicate_count_positive", duplicate_count: output.duplicate_count || output.duplicate_live_keys };
  const unsafeTrueKeys = ["source_table_mutation_performed", "scoring_performed", "ranking_performed", "final_board_write_performed", "final_board_write", "scoring_write_performed"];
  for (const k of unsafeTrueKeys) {
    if (Object.prototype.hasOwnProperty.call(output, k) && output[k] === true) return { pass: false, reason: `unsafe_output_${k}_true` };
  }
  return { pass: true, certification: cert, status, data_ok: output.data_ok, rows_read: output.rows_read || 0, rows_written: output.rows_written || 0, rows_promoted: output.rows_promoted || 0, external_calls: output.external_calls_performed || output.external_calls || 0, output };
}

function incrementalMorningFullRunChildInput(parentRow, stage, stepIndex, retryCount = 0) {
  return {
    source: "incremental_morning_full_run_parent",
    mode: stage.mode,
    parent_full_run: true,
    full_run_stage_key: stage.stage_key,
    visible_button: stage.visible_button,
    chain_id: parentRow.chain_id,
    parent_chain_id: parentRow.chain_id,
    parent_request_id: parentRow.request_id,
    stage_index: stepIndex,
    stage_count: INCREMENTAL_MORNING_FULL_RUN_STAGES.length,
    retry_count: retryCount,
    scheduled_or_manual: "manual_or_scheduled_backend",
    no_browser_loop: true,
    backend_scheduled_continuation: true,
    no_generic_dispatch: true,
    no_full_rebuild: true,
    no_source_table_mutation_for_metrics: stage.mode === "delta_recalculate_affected_players",
    no_external_mlb_calls_for_metrics: stage.mode === "delta_recalculate_affected_players",
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_old_production_touch: true,
    created_at: nowIso()
  };
}

async function ensureIncrementalMorningFullRunLock(env, parentRow) {
  await run(env.CONTROL_DB, "INSERT OR IGNORE INTO control_locks (lock_key, lock_flag, updated_at) VALUES (?, 0, CURRENT_TIMESTAMP)", INCREMENTAL_MORNING_FULL_RUN_LOCK_KEY);
  const lock = await first(env.CONTROL_DB,
    "SELECT lock_key, lock_flag, owner_request_id, owner_worker_name, acquired_at, expires_at, updated_at, CASE WHEN expires_at IS NOT NULL AND datetime(expires_at) > datetime('now') THEN 1 ELSE 0 END AS not_expired FROM control_locks WHERE lock_key=?",
    INCREMENTAL_MORNING_FULL_RUN_LOCK_KEY
  );
  const activeOther = await first(env.CONTROL_DB,
    "SELECT request_id, chain_id, status, updated_at FROM control_job_queue WHERE job_key='incremental-morning-full-run' AND request_id<>? AND status IN ('pending','running','partial_continue') AND finished_at IS NULL ORDER BY datetime(created_at) DESC LIMIT 1",
    parentRow.request_id
  );
  if (lock && Number(lock.lock_flag) === 1 && lock.owner_request_id && lock.owner_request_id !== parentRow.request_id && Number(lock.not_expired) === 1) {
    return { ok: false, reason: "incremental_morning_full_run_lock_busy", lock, active_other_parent: activeOther || null };
  }
  if (lock && Number(lock.lock_flag) === 1 && lock.owner_request_id && lock.owner_request_id !== parentRow.request_id && activeOther) {
    return { ok: false, reason: "incremental_morning_full_run_active_parent_exists", lock, active_other_parent: activeOther };
  }
  await run(env.CONTROL_DB,
    "UPDATE control_locks SET lock_flag=1, owner_request_id=?, owner_worker_name=?, acquired_at=COALESCE(acquired_at,CURRENT_TIMESTAMP), expires_at=datetime('now','+60 minutes'), updated_at=CURRENT_TIMESTAMP WHERE lock_key=?",
    parentRow.request_id, WORKER_NAME, INCREMENTAL_MORNING_FULL_RUN_LOCK_KEY
  );
  return { ok: true, recovered_stale_lock: !!(lock && Number(lock.lock_flag) === 1 && lock.owner_request_id !== parentRow.request_id) };
}

async function releaseIncrementalMorningFullRunLock(env, parentRow) {
  await run(env.CONTROL_DB,
    "UPDATE control_locks SET lock_flag=0, owner_request_id=NULL, owner_worker_name=NULL, expires_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE lock_key=? AND (owner_request_id=? OR owner_request_id IS NULL)",
    INCREMENTAL_MORNING_FULL_RUN_LOCK_KEY, parentRow.request_id
  );
}

async function enqueueIncrementalMorningFullRunChild(env, parentRow, stage, stepIndex, retryCount = 0) {
  const childRequestId = rid(stage.stage_key.replace(/-/g, "_"));
  const input = incrementalMorningFullRunChildInput(parentRow, stage, stepIndex, retryCount);
  await run(env.CONTROL_DB,
    "INSERT INTO control_job_queue (request_id, chain_id, parent_request_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
    childRequestId, parentRow.chain_id, parentRow.request_id, stage.job_key, stage.worker_name, stage.worker_group, stage.phase_key, stage.display_name, stage.priority, JSON.stringify(input)
  );
  return { child_request_id: childRequestId, input };
}

async function processIncrementalMorningFullRunJob(env, row, runId, trigger) {
  const started = Date.now();
  const parentInput = parseJsonSafeText(row.input_json || "{}", {});
  const lock = await ensureIncrementalMorningFullRunLock(env, row);
  if (!lock.ok) {
    const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, status: "blocked_incremental_morning_full_run_lock_busy", certification: "INCREMENTAL_MORNING_FULL_RUN_LOCK_BUSY", lock_reason: lock.reason, lock, continuation_required: true, orchestrator_should_self_continue: false };
    await run(env.CONTROL_DB,
      "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'INCREMENTAL_MORNING_FULL_RUN_LOCK_BUSY', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output)
    );
    await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=datetime('now','+5 minutes'), updated_at=CURRENT_TIMESTAMP, output_json=? WHERE request_id=?", JSON.stringify(output), row.request_id);
    return output;
  }

  const childRows = await all(env.CONTROL_DB,
    "SELECT request_id, parent_request_id, chain_id, job_key, worker_name, status, input_json, output_json, error_code, error_message, created_at, started_at, finished_at, updated_at, CASE WHEN status IN ('pending','running','partial_continue') AND finished_at IS NULL AND datetime(updated_at) <= datetime(CURRENT_TIMESTAMP, '-60 minutes') THEN 1 ELSE 0 END AS is_stale FROM control_job_queue WHERE parent_request_id=? ORDER BY datetime(created_at) ASC",
    row.request_id
  );
  const stageReports = [];

  for (let i = 0; i < INCREMENTAL_MORNING_FULL_RUN_STAGES.length; i++) {
    const stage = INCREMENTAL_MORNING_FULL_RUN_STAGES[i];
    const attempts = childRows.filter(c => incrementalFullRunStageKeyFromChild(c) === stage.stage_key || (!incrementalFullRunStageKeyFromChild(c) && c.job_key === stage.job_key));
    const child = attempts.length ? attempts[attempts.length - 1] : null;
    if (!child) {
      const enqueued = await enqueueIncrementalMorningFullRunChild(env, row, stage, i, 0);
      const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "incremental_morning_full_run", status: "PARTIAL_CONTINUE_INCREMENTAL_MORNING_FULL_RUN_CHILD_ENQUEUED", certification: "INCREMENTAL_MORNING_FULL_RUN_CHILD_ENQUEUED", certification_grade: "PARTIAL", current_stage_key: stage.stage_key, current_stage_index: i, enqueued_child_request_id: enqueued.child_request_id, completed_stage_count: stageReports.length, total_stage_count: INCREMENTAL_MORNING_FULL_RUN_STAGES.length, stages: [...stageReports, { stage_key: stage.stage_key, job_key: stage.job_key, child_request_id: enqueued.child_request_id, child_status: "pending", pass: null }], continuation_required: true, orchestrator_should_self_continue: true, lock_held: true, no_browser_loop: true, no_scoring: true, no_ranking: true, no_final_board: true };
      await run(env.CONTROL_DB,
        "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'INCREMENTAL_MORNING_FULL_RUN_CHILD_ENQUEUED', ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)",
        runId, row.request_id, row.chain_id, row.job_key, row.worker_name, i + 1, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output)
      );
      await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
      await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'incremental_morning_full_run_child_enqueued', 'Incremental Morning Full Run enqueued next child stage', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ parent_request_id: row.request_id, child_request_id: enqueued.child_request_id, stage_key: stage.stage_key, stage_index: i, mode: stage.mode }));
      return output;
    }

    const validation = childPassedIncrementalMorningFullRun(stage, child);
    const childOutput = parseJsonSafeText(child.output_json || "{}", {});
    const report = { stage_key: stage.stage_key, job_key: stage.job_key, mode: stage.mode, child_request_id: child.request_id, child_status: child.status, child_certification: childOutput.certification || null, child_data_ok: childOutput.data_ok === true, pass: validation.pass, wait: !!validation.wait, reason: validation.reason || null, rows_read: childOutput.rows_read || 0, rows_written: childOutput.rows_written || 0, rows_promoted: childOutput.rows_promoted || 0, external_calls: childOutput.external_calls_performed || childOutput.external_calls || 0, attempts: attempts.length };

    if (validation.wait) {
      const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "incremental_morning_full_run", status: "PARTIAL_CONTINUE_INCREMENTAL_MORNING_FULL_RUN_WAITING_ON_CHILD", certification: "INCREMENTAL_MORNING_FULL_RUN_WAITING_ON_CHILD", certification_grade: "PARTIAL", current_stage_key: stage.stage_key, waiting_on_child_request_id: child.request_id, waiting_on_child_status: child.status, completed_stage_count: stageReports.length, total_stage_count: INCREMENTAL_MORNING_FULL_RUN_STAGES.length, stages: [...stageReports, report], continuation_required: true, orchestrator_should_self_continue: true, lock_held: true };
      await run(env.CONTROL_DB, "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'INCREMENTAL_MORNING_FULL_RUN_WAITING_ON_CHILD', ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, i + 1, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
      await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=datetime('now','+8 seconds'), updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
      await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'incremental_morning_full_run_parent_deferred_while_child_active', 'Parent deferred briefly so the active child hot-continuation row can own the next backend tick', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ parent_request_id: row.request_id, child_request_id: child.request_id, child_status: child.status, stage_key: stage.stage_key, parent_run_after_delay_seconds: 8, full_run_hot_continuation_v0_2_95: true }));
      return output;
    }

    if (!validation.pass) {
      if (validation.transient && attempts.length <= INCREMENTAL_MORNING_FULL_RUN_MAX_RETRIES_PER_STAGE) {
        const enqueued = await enqueueIncrementalMorningFullRunChild(env, row, stage, i, attempts.length);
        const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "incremental_morning_full_run", status: "PARTIAL_CONTINUE_INCREMENTAL_MORNING_FULL_RUN_TRANSIENT_RETRY_ENQUEUED", certification: "INCREMENTAL_MORNING_FULL_RUN_TRANSIENT_RETRY_ENQUEUED", certification_grade: "PARTIAL", current_stage_key: stage.stage_key, failed_child_request_id: child.request_id, retry_child_request_id: enqueued.child_request_id, retry_count: attempts.length, failed_reason: validation.reason, stages: [...stageReports, { ...report, retry_child_request_id: enqueued.child_request_id }], continuation_required: true, orchestrator_should_self_continue: true, lock_held: true };
        await run(env.CONTROL_DB, "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'INCREMENTAL_MORNING_FULL_RUN_TRANSIENT_RETRY_ENQUEUED', ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, i + 1, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
        await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
        return output;
      }
      const finalStatus = validation.reason === "child_stale_unfinished" ? "BLOCKED_INCREMENTAL_MORNING_FULL_RUN_CHILD_BLOCKED" : "FAILED_INCREMENTAL_MORNING_FULL_RUN_CHILD_FAILED";
      const output = { ok: false, data_ok: false, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "incremental_morning_full_run", status: finalStatus, certification: finalStatus, certification_grade: finalStatus.startsWith("BLOCKED") ? "BLOCKED" : "FAILED", failed_stage_key: stage.stage_key, failed_request_id: child.request_id, failed_reason: validation.reason, child_error_code: child.error_code || null, child_error_message: child.error_message || null, last_output_preview: JSON.stringify(childOutput).slice(0, 1200), stages: [...stageReports, report], retry_exhausted: !!validation.transient, full_run_certified: false };
      await releaseIncrementalMorningFullRunLock(env, row);
      await run(env.CONTROL_DB, "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, finalStatus.startsWith("BLOCKED") ? "blocked" : "failed", finalStatus, i + 1, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output), finalStatus.toLowerCase(), String(validation.reason || "incremental full run child failed").slice(0, 900));
      await run(env.CONTROL_DB, "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?", finalStatus.startsWith("BLOCKED") ? "blocked" : "failed", JSON.stringify(output), finalStatus.toLowerCase(), String(validation.reason || "incremental full run child failed").slice(0, 900), row.request_id);
      await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'ERROR', 'incremental_morning_full_run_stopped', 'Incremental Morning Full Run stopped on failed/blocked child stage', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify(output));
      return output;
    }

    stageReports.push(report);
  }

  const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "incremental_morning_full_run", status: "COMPLETED_INCREMENTAL_MORNING_FULL_RUN", certification: "INCREMENTAL_MORNING_FULL_RUN_CERTIFIED_ALL_INCREMENTAL_BASE_DELTAS_PASS", certification_grade: "FULL_RUN_PASS", full_run_certified: true, completed_stage_count: stageReports.length, total_stage_count: INCREMENTAL_MORNING_FULL_RUN_STAGES.length, stages: stageReports, no_board_refresh_included: true, board_refresh_deferred: true, no_scoring: true, no_ranking: true, no_final_board: true, no_old_production_touch: true };
  await releaseIncrementalMorningFullRunLock(env, row);
  await run(env.CONTROL_DB, "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'completed', 1, 'INCREMENTAL_MORNING_FULL_RUN_CERTIFIED', ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, stageReports.length, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
  await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='completed', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
  await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'incremental_morning_full_run_completed', 'Incremental Morning Full Run certified all incremental base/delta stages', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify(output));
  return output;
}


async function processDeltaCertifierJob(env, row, runId, trigger) {
  if (!env.DELTA_CERTIFIER_WORKER || typeof env.DELTA_CERTIFIER_WORKER.fetch !== "function") {
    const output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "blocked_missing_service_binding", certification: "DELTA_CERTIFIER_SERVICE_BINDING_MISSING", trigger, note: "Exact dispatch requires DELTA_CERTIFIER_WORKER service binding." };
    await run(env.CONTROL_DB, "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_delta_certifier_service_binding', 'DELTA_CERTIFIER_WORKER service binding is missing')", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output));
    await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_delta_certifier_service_binding', error_message='DELTA_CERTIFIER_WORKER service binding is missing' WHERE request_id=?", JSON.stringify(output), row.request_id);
    return output;
  }

  const inputJson = parseJsonSafeText(row.input_json || "{}", {});
  const input = { request_id: row.request_id, chain_id: row.chain_id, job_key: row.job_key, worker_name: row.worker_name, run_id: runId, trigger, mode: inputJson.mode || "game_calendar_coverage_audit", input_json: inputJson };
  const started = Date.now();
  let output;
  let httpStatus = null;
  try {
    const resp = await env.DELTA_CERTIFIER_WORKER.fetch("https://internal.alphadog-v2-delta-certifier/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    httpStatus = resp.status;
    const text = await resp.text();
    try { output = JSON.parse(text); }
    catch (_) { output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "worker_non_json_response", http_status: httpStatus, response_preview: String(text || "").slice(0, 900) }; }
  } catch (err) {
    output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "worker_dispatch_exception", error: String(err && err.message ? err.message : err) };
  }

  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && output.rows_read ? output.rows_read : 0);
  const rowsWritten = Number(output && output.rows_written ? output.rows_written : 0);
  const externalCalls = Number(output && output.external_calls_performed ? output.external_calls_performed : 0);
  const certification = String((output && output.certification) || (ok ? "delta_certifier_completed" : "delta_certifier_failed")).slice(0, 120);
  const queueStatus = ok ? "completed" : "failed";
  const runStatus = ok ? "completed" : "failed";
  const errorCode = ok ? null : "delta_certifier_worker_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status)) || "delta certifier worker failed").slice(0, 900);
  const cappedOutput = { ...output, orchestrator_dispatch: { version: SYSTEM_VERSION, processed_by: WORKER_NAME, exact_worker_only: true, trigger, http_status: httpStatus, elapsed_ms: Date.now() - started, game_calendar_worker_modes: true, game_calendar_full_seed_supported: true, game_calendar_coverage_audit_supported: true, game_calendar_differential_check_update_supported: true, no_source_history_mutation: true, no_repair_jobs_created: true, no_scoring: true, no_ranking: true, no_final_board_write: true, no_old_production_touch: true } };

  await run(env.CONTROL_DB, "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage);
  await run(env.CONTROL_DB, "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?", queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id);
  return cappedOutput;
}

async function processStaticCertifierJob(env, row, runId, trigger) {
  if (!env.STATIC_CERTIFIER_WORKER || typeof env.STATIC_CERTIFIER_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "STATIC_CERTIFIER_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch is enabled only through STATIC_CERTIFIER_WORKER service binding. Deploy orchestrator with the services wrangler config."
    };
    await run(env.CONTROL_DB,
      "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_static_certifier_service_binding', 'STATIC_CERTIFIER_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_static_certifier_service_binding', error_message='STATIC_CERTIFIER_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );
    return output;
  }

  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: "orchestrator_exact_static_certifier_read_only_dispatch",
    input_json: parseJsonSafeText(row.input_json || "{}", {})
  };
  const started = Date.now();
  let output;
  let httpStatus = null;
  try {
    const resp = await env.STATIC_CERTIFIER_WORKER.fetch("https://internal.alphadog-v2-static-certifier/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    httpStatus = resp.status;
    const text = await resp.text();
    try { output = JSON.parse(text); }
    catch (_) {
      output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "worker_non_json_response", http_status: httpStatus, response_preview: String(text || "").slice(0, 900) };
    }
  } catch (err) {
    output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "worker_dispatch_exception", error: String(err && err.message ? err.message : err) };
  }
  const partialContinue = false;
  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && output.rows_read ? output.rows_read : 0);
  const rowsWritten = Number(output && output.rows_written ? output.rows_written : 0);
  const externalCalls = Number(output && output.external_calls_performed ? output.external_calls_performed : 0);
  const certification = String((output && output.certification) || (ok ? "static_certifier_completed" : "static_certifier_failed")).slice(0, 120);
  const queueStatus = ok ? "completed" : "failed";
  const runStatus = ok ? "completed" : "failed";
  const errorCode = ok ? null : "static_certifier_worker_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status)) || "static certifier worker failed").slice(0, 900);
  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      static_certifier_read_only: true,
      no_reruns: true,
      no_source_fetches: true,
      no_promotion: true,
      no_cleanup: true,
      no_prizepicks_board_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true,
      no_old_production_touch: true
    }
  };
  await run(env.CONTROL_DB,
    "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );
  if (partialContinue) {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
      JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }
  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'static_certifier_dispatch_completed', 'Orchestrator completed exact static-certifier read-only dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, status: queueStatus, certification, data_ok: dataOk, rows_read: rowsRead, rows_written: rowsWritten })
  );
  return cappedOutput;
}

async function processStaticFullRunJob(env, row, runId, trigger) {
  const started = Date.now();
  const parentInput = parseJsonSafeText(row.input_json || "{}", {});
  const approvedStages = STATIC_FULL_RUN_STAGES;
  const childRows = await all(env.CONTROL_DB,
    "SELECT request_id, parent_request_id, chain_id, job_key, worker_name, status, output_json, error_code, error_message, created_at, updated_at FROM control_job_queue WHERE parent_request_id=? ORDER BY datetime(created_at) ASC",
    row.request_id
  );
  const childByJob = new Map(childRows.map(c => [String(c.job_key), c]));
  const stageReports = [];

  for (let i = 0; i < approvedStages.length; i++) {
    const stage = approvedStages[i];
    const child = childByJob.get(stage.job_key);
    if (!child) {
      const childRequestId = rid(String(stage.job_key).replace(/-/g, "_"));
      const input = staticFullRunChildInput(row, stage, i);
      await run(env.CONTROL_DB,
        "INSERT INTO control_job_queue (request_id, chain_id, parent_request_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'Static', 'static', ?, 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        childRequestId, row.chain_id, row.request_id, stage.job_key, stage.worker_name, stage.display_name, JSON.stringify(input)
      );
      const output = {
        ok: true,
        data_ok: true,
        version: SYSTEM_VERSION,
        worker_name: WORKER_NAME,
        job_key: row.job_key,
        request_id: row.request_id,
        chain_id: row.chain_id,
        status: "partial_continue",
        current_stage: stage.job_key,
        enqueued_child_request_id: childRequestId,
        full_run_certified: false,
        stages: [...stageReports, { job_key: stage.job_key, child_request_id: childRequestId, child_status: "pending", data_ok: null, certification: null, pass: null }],
        deferred_workers_skipped: ["static-rosters", "static-player-aliases"],
        note: "Static Full Run parent enqueued next active static stage. Backend wake/cron continues; browser may close."
      };
      await run(env.CONTROL_DB,
        "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'static_full_run_child_enqueued', ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)",
        runId, row.request_id, row.chain_id, row.job_key, row.worker_name, stageReports.length + 1, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output)
      );
      await run(env.CONTROL_DB,
        "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
        JSON.stringify(output), row.request_id
      );
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'static-full-run', 'INFO', 'static_full_run_stage_enqueued', 'Static Full Run parent enqueued next active static stage', ?, CURRENT_TIMESTAMP)",
        row.request_id, runId, WORKER_NAME, JSON.stringify({ parent_request_id: row.request_id, child_request_id: childRequestId, stage: stage.job_key, stage_index: i, deferred_workers_skipped: ["static-rosters", "static-player-aliases"] })
      );
      return output;
    }

    if (String(child.status || "") === "pending" || String(child.status || "") === "running") {
      const output = {
        ok: true,
        data_ok: true,
        version: SYSTEM_VERSION,
        worker_name: WORKER_NAME,
        job_key: row.job_key,
        request_id: row.request_id,
        chain_id: row.chain_id,
        status: "partial_continue",
        current_stage: stage.job_key,
        waiting_on_child_request_id: child.request_id,
        waiting_on_child_status: child.status,
        full_run_certified: false,
        stages: [...stageReports, { job_key: stage.job_key, child_request_id: child.request_id, child_status: child.status, data_ok: null, certification: null, pass: null }],
        note: "Static Full Run parent is waiting on current child stage. Backend wake/cron continues; browser may close."
      };
      await run(env.CONTROL_DB,
        "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'static_full_run_waiting_on_child', ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)",
        runId, row.request_id, row.chain_id, row.job_key, row.worker_name, stageReports.length + 1, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output)
      );
      await run(env.CONTROL_DB,
        "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
        JSON.stringify(output), row.request_id
      );
      return output;
    }

    const validation = childPassedStaticFullRun(stage, child);
    const childOutput = parseJsonSafeText(child.output_json || "{}", {});
    const report = {
      job_key: stage.job_key,
      child_request_id: child.request_id,
      child_status: child.status,
      child_certification: childOutput.certification || null,
      child_data_ok: childOutput.data_ok === true,
      pass: validation.pass,
      reason: validation.reason || null,
      rows_read: childOutput.rows_read || 0,
      rows_written: childOutput.rows_written || 0
    };
    stageReports.push(report);

    if (!validation.pass) {
      const output = {
        ok: false,
        data_ok: false,
        version: SYSTEM_VERSION,
        worker_name: WORKER_NAME,
        job_key: row.job_key,
        request_id: row.request_id,
        chain_id: row.chain_id,
        status: "failed_static_full_run_stage",
        failed_stage: stage.job_key,
        failed_child_request_id: child.request_id,
        failed_reason: validation.reason,
        stages: stageReports,
        final_certifier_result: stage.job_key === "static-certifier" ? childOutput : null,
        full_run_certified: false,
        deferred_workers_skipped: ["static-rosters", "static-player-aliases"]
      };
      await run(env.CONTROL_DB,
        "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'failed', 0, 'STATIC_FULL_RUN_FAILED', ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, 'static_full_run_stage_failed', ?)",
        runId, row.request_id, row.chain_id, row.job_key, row.worker_name, stageReports.length, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output), String(validation.reason || "static full run stage failed").slice(0, 900)
      );
      await run(env.CONTROL_DB,
        "UPDATE control_job_queue SET status='failed', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='static_full_run_stage_failed', error_message=? WHERE request_id=?",
        JSON.stringify(output), String(validation.reason || "static full run stage failed").slice(0, 900), row.request_id
      );
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'static-full-run', 'ERROR', 'static_full_run_failed', 'Static Full Run stopped after failed child stage validation', ?, CURRENT_TIMESTAMP)",
        row.request_id, runId, WORKER_NAME, JSON.stringify(output)
      );
      return output;
    }
  }

  const finalCertifierRow = childByJob.get("static-certifier");
  const finalCertifierOutput = parseJsonSafeText(finalCertifierRow && finalCertifierRow.output_json || "{}", {});
  const output = {
    ok: true,
    data_ok: true,
    version: SYSTEM_VERSION,
    worker_name: WORKER_NAME,
    job_key: row.job_key,
    request_id: row.request_id,
    chain_id: row.chain_id,
    status: "completed_static_full_run_certified",
    certification: "STATIC_FULL_RUN_CERTIFIED_ALL_ACTIVE_STATIC_WORKERS_RERAN_AND_FINAL_CERTIFIER_PASSED",
    full_run_certified: true,
    stages: stageReports,
    final_certifier_result: {
      child_request_id: finalCertifierRow ? finalCertifierRow.request_id : null,
      certification: finalCertifierOutput.certification || null,
      data_ok: finalCertifierOutput.data_ok === true,
      full_static_certified: finalCertifierOutput.full_static_certified === true
    },
    deferred_workers_skipped: ["static-rosters", "static-player-aliases"],
    no_browser_pump: true,
    no_control_room_server_side_fetch_to_orchestrator: true,
    no_generic_dispatch: true,
    no_prizepicks_board_mutation: true,
    no_scoring: true,
    no_final_board_writes: true,
    elapsed_ms: Date.now() - started
  };
  await run(env.CONTROL_DB,
    "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'completed', 1, 'STATIC_FULL_RUN_CERTIFIED', ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, stageReports.length, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output)
  );
  await run(env.CONTROL_DB,
    "UPDATE control_job_queue SET status='completed', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
    JSON.stringify(output), row.request_id
  );
  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'static-full-run', 'INFO', 'static_full_run_certified', 'Static Full Run completed all active static stages and final certifier passed', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, JSON.stringify({ request_id: row.request_id, chain_id: row.chain_id, full_run_certified: true, stages: stageReports })
  );
  return output;
}


async function processStaticPropTaxonomyJob(env, row, runId, trigger) {
  if (!env.STATIC_PROP_TAXONOMY_WORKER || typeof env.STATIC_PROP_TAXONOMY_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "STATIC_PROP_TAXONOMY_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch is enabled only through STATIC_PROP_TAXONOMY_WORKER service binding. Deploy orchestrator with the services wrangler config."
    };

    await run(env.CONTROL_DB,
      "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_static_prop_taxonomy_service_binding', 'STATIC_PROP_TAXONOMY_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );

    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_static_prop_taxonomy_service_binding', error_message='STATIC_PROP_TAXONOMY_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );

    return output;
  }

  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: "orchestrator_exact_static_prop_taxonomy_dispatch",
    input_json: (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })()
  };

  const started = Date.now();
  let output;
  let httpStatus = null;

  try {
    const resp = await env.STATIC_PROP_TAXONOMY_WORKER.fetch("https://internal.alphadog-v2-static-prop-taxonomy/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    httpStatus = resp.status;
    const text = await resp.text();
    try { output = JSON.parse(text); }
    catch (_) {
      output = {
        ok: false,
        data_ok: false,
        version: SYSTEM_VERSION,
        processed_by: WORKER_NAME,
        worker_name: row.worker_name,
        job_key: row.job_key,
        status: "worker_non_json_response",
        http_status: httpStatus,
        response_preview: String(text || "").slice(0, 900)
      };
    }
  } catch (err) {
    output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "worker_dispatch_exception",
      error: String(err && err.message ? err.message : err)
    };
  }

  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && output.rows_read ? output.rows_read : 0);
  const rowsWritten = Number(output && output.rows_written ? output.rows_written : 0);
  const externalCalls = Number(output && output.external_calls_performed ? output.external_calls_performed : 0);
  const certification = String((output && output.certification) || (ok ? "static_prop_taxonomy_completed" : "static_prop_taxonomy_failed")).slice(0, 120);
  const queueStatus = ok ? "completed" : "failed";
  const runStatus = ok ? "completed" : "failed";
  const errorCode = ok ? null : "static_prop_taxonomy_worker_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status)) || "static prop taxonomy worker failed").slice(0, 900);

  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      no_prizepicks_board_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true,
      no_sleeper_work: true,
      no_old_production_touch: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  if (partialContinue) {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
      JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'static_prop_taxonomy_dispatch_completed', 'Orchestrator completed exact static-prop-taxonomy taxonomy/alias certifier dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, status: queueStatus, certification, rows_read: rowsRead, rows_written: rowsWritten, partial_continue: partialContinue })
  );

  return cappedOutput;
}

async function processMarketSourceHealthJob(env, row, runId, trigger) {
  if (!env.MARKET_SOURCE_HEALTH_WORKER || typeof env.MARKET_SOURCE_HEALTH_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "MARKET_SOURCE_HEALTH_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch is enabled only through MARKET_SOURCE_HEALTH_WORKER service binding. Deploy orchestrator with the services wrangler config."
    };

    await run(env.CONTROL_DB,
      "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_market_source_health_service_binding', 'MARKET_SOURCE_HEALTH_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );

    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_market_source_health_service_binding', error_message='MARKET_SOURCE_HEALTH_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );

    return output;
  }

  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: "orchestrator_exact_market_source_health_dispatch",
    input_json: (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })()
  };

  const started = Date.now();
  let output;
  let httpStatus = null;

  try {
    const resp = await env.MARKET_SOURCE_HEALTH_WORKER.fetch("https://internal.alphadog-v2-market-source-health/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    httpStatus = resp.status;
    const text = await resp.text();
    try {
      output = JSON.parse(text);
    } catch (_) {
      output = {
        ok: false,
        data_ok: false,
        version: SYSTEM_VERSION,
        processed_by: WORKER_NAME,
        worker_name: row.worker_name,
        job_key: row.job_key,
        status: "worker_non_json_response",
        http_status: httpStatus,
        response_preview: String(text || "").slice(0, 900)
      };
    }
  } catch (err) {
    output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "worker_dispatch_exception",
      error: String(err && err.message ? err.message : err)
    };
  }

  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && output.rows_read ? output.rows_read : 0);
  const rowsWritten = Number(output && output.rows_written ? output.rows_written : 0);
  const externalCalls = Number(output && output.external_calls_performed ? output.external_calls_performed : 0);
  const certification = String((output && output.certification) || (ok ? "market_source_health_completed" : "market_source_health_failed")).slice(0, 120);
  const queueStatus = ok ? "completed" : "failed";
  const runStatus = ok ? "completed" : "failed";
  const errorCode = ok ? null : "market_source_health_worker_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status)) || "market source health worker failed").slice(0, 900);

  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started
    }
  };

  await run(env.CONTROL_DB,
    "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  if (partialContinue) {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
      JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'market_source_health_dispatch_completed', 'Orchestrator completed exact market-source-health dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, status: queueStatus, certification, rows_read: rowsRead, rows_written: rowsWritten, partial_continue: partialContinue })
  );

  return cappedOutput;
}

async function processPrizePicksGithubBoardJob(env, row, runId, trigger) {
  if (!env.PRIZEPICKS_GITHUB_BOARD_WORKER || typeof env.PRIZEPICKS_GITHUB_BOARD_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "PRIZEPICKS_GITHUB_BOARD_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch is enabled only through PRIZEPICKS_GITHUB_BOARD_WORKER service binding. Deploy orchestrator with the services wrangler config."
    };

    await run(env.CONTROL_DB,
      "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_prizepicks_github_board_service_binding', 'PRIZEPICKS_GITHUB_BOARD_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );

    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_prizepicks_github_board_service_binding', error_message='PRIZEPICKS_GITHUB_BOARD_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );

    return output;
  }

  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: "orchestrator_exact_prizepicks_github_board_dispatch",
    input_json: (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })()
  };

  const started = Date.now();
  let output;
  let httpStatus = null;

  try {
    const resp = await env.PRIZEPICKS_GITHUB_BOARD_WORKER.fetch("https://internal.alphadog-v2-prizepicks-github-board/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    httpStatus = resp.status;
    const text = await resp.text();
    try {
      output = JSON.parse(text);
    } catch (_) {
      output = {
        ok: false,
        data_ok: false,
        version: SYSTEM_VERSION,
        processed_by: WORKER_NAME,
        worker_name: row.worker_name,
        job_key: row.job_key,
        status: "worker_non_json_response",
        http_status: httpStatus,
        response_preview: String(text || "").slice(0, 900)
      };
    }
  } catch (err) {
    output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "worker_dispatch_exception",
      error: String(err && err.message ? err.message : err)
    };
  }

  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && output.rows_read ? output.rows_read : 0);
  const rowsWritten = Number(output && output.rows_written ? output.rows_written : 0);
  const externalCalls = Number(output && output.external_calls_performed ? output.external_calls_performed : 0);
  const certification = String((output && output.certification) || (ok ? "prizepicks_github_board_completed" : "prizepicks_github_board_failed")).slice(0, 120);
  const partialContinue = false;
  const queueStatus = ok ? "completed" : "failed";
  const runStatus = ok ? "completed" : "failed";
  const errorCode = ok ? null : "prizepicks_github_board_worker_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status)) || "PrizePicks GitHub board worker failed").slice(0, 900);

  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      no_generic_dispatch: true,
      prizepicks_dispatch_queue_close_fix_v0_2_97: true,
      no_scoring: true,
      no_final_board_write: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  if (partialContinue) {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
      JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'prizepicks_github_board_dispatch_completed', 'Orchestrator completed exact prizepicks-github-board dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, status: queueStatus, certification, rows_read: rowsRead, rows_written: rowsWritten, partial_continue: partialContinue })
  );

  return cappedOutput;
}



async function processParlaySleeperBoardJob(env, row, runId, trigger) {
  if (!env.PARLAY_SLEEPER_BOARD_WORKER || typeof env.PARLAY_SLEEPER_BOARD_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "PARLAY_SLEEPER_BOARD_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch is enabled only through PARLAY_SLEEPER_BOARD_WORKER service binding. Deploy orchestrator with the services wrangler config."
    };

    await run(env.CONTROL_DB,
      "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_parlay_sleeper_board_service_binding', 'PARLAY_SLEEPER_BOARD_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );

    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_parlay_sleeper_board_service_binding', error_message='PARLAY_SLEEPER_BOARD_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );

    return output;
  }

  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: "orchestrator_exact_parlay_sleeper_board_source_probe_dispatch",
    input_json: (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })()
  };

  const started = Date.now();
  let output;
  let httpStatus = null;

  try {
    const resp = await env.PARLAY_SLEEPER_BOARD_WORKER.fetch("https://internal.alphadog-v2-parlay-sleeper-board/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    httpStatus = resp.status;
    const text = await resp.text();
    try {
      output = JSON.parse(text);
    } catch (_) {
      output = {
        ok: false,
        data_ok: false,
        version: SYSTEM_VERSION,
        processed_by: WORKER_NAME,
        worker_name: row.worker_name,
        job_key: row.job_key,
        status: "worker_non_json_response",
        http_status: httpStatus,
        response_preview: String(text || "").slice(0, 900)
      };
    }
  } catch (err) {
    output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "worker_dispatch_exception",
      error: String(err && err.message ? err.message : err)
    };
  }

  const partialContinue = false;
  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && output.rows_read ? output.rows_read : 0);
  const rowsWritten = Number(output && output.rows_written ? output.rows_written : 0);
  const externalCalls = Number(output && output.external_calls_performed ? output.external_calls_performed : 0);
  const certification = String((output && output.certification) || (ok ? "parlay_sleeper_board_probe_completed" : "parlay_sleeper_board_probe_failed")).slice(0, 120);
  const queueStatus = ok ? "completed" : "failed";
  const runStatus = ok ? "completed" : "failed";
  const errorCode = ok ? null : "parlay_sleeper_board_worker_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status)) || "Parlay Sleeper board worker failed").slice(0, 900);

  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      source_probe_only: true,
      no_generic_dispatch: true,
      no_prizepicks_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true,
      no_promotion: false,
      board_inventory_only: true,
      sleeper_finalization_fix_v0_2_98: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  if (partialContinue) {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
      JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'parlay_sleeper_board_dispatch_completed', 'Orchestrator completed exact parlay-sleeper-board dispatch and finalized queue state', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, status: queueStatus, certification, rows_read: rowsRead, rows_written: rowsWritten, external_calls: externalCalls, partial_continue: partialContinue, sleeper_finalization_fix_v0_2_98: true })
  );

  return cappedOutput;
}


async function processBaseHitterGameLogsJob(env, row, runId, trigger) {
  if (!env.BASE_HITTER_GAME_LOGS_WORKER || typeof env.BASE_HITTER_GAME_LOGS_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "BASE_HITTER_GAME_LOGS_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch is enabled only through BASE_HITTER_GAME_LOGS_WORKER service binding. Deploy orchestrator with the services wrangler config."
    };

    await run(env.CONTROL_DB,
      "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_base_hitter_game_logs_service_binding', 'BASE_HITTER_GAME_LOGS_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );

    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_base_hitter_game_logs_service_binding', error_message='BASE_HITTER_GAME_LOGS_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );

    return output;
  }

  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const rawRequestedMode = String((rowInput && rowInput.mode) || "base_backfill");
  const normalizedWorkerMode = rawRequestedMode === "delta_retained_stage_restore_before_queue" ? "delta_update" : rawRequestedMode;
  const normalizedRowInput = {
    ...rowInput,
    mode: normalizedWorkerMode,
    original_mode: rawRequestedMode,
    normalized_worker_mode: normalizedWorkerMode,
    hitter_delta_mode_normalization_v0_2_77: rawRequestedMode === "delta_retained_stage_restore_before_queue"
  };
  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: normalizedWorkerMode,
    input_json: normalizedRowInput
  };

  const started = Date.now();
  let output;
  let httpStatus = null;

  try {
    const resp = await env.BASE_HITTER_GAME_LOGS_WORKER.fetch("https://internal.alphadog-v2-base-hitter-game-logs/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    httpStatus = resp.status;
    const text = await resp.text();
    try {
      output = JSON.parse(text);
    } catch (_) {
      output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "worker_non_json_response", http_status: httpStatus, response_preview: String(text || "").slice(0, 900) };
    }
  } catch (err) {
    output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "worker_dispatch_exception", error: String(err && err.message ? err.message : err) };
  }

  const rawStatus = String((output && output.status) || "").toLowerCase();
  const partialContinue = !!(output && output.ok && (
    rawStatus === "partial_continue" ||
    rawStatus === "partial_continue_base_hitter_game_logs" ||
    rawStatus === "partial_continue_delta_hitter_game_logs" ||
    rawStatus === "source_shape_probe_partial_continue" ||
    rawStatus === "partial_continue_base_team_game_logs" ||
    output.continuation_required === true ||
    output.orchestrator_should_self_continue === true
  ));
  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && output.rows_read ? output.rows_read : 0);
  const rowsWritten = Number(output && output.rows_written ? output.rows_written : 0);
  const externalCalls = Number(output && output.external_calls_performed ? output.external_calls_performed : 0);
  const certification = String((output && output.certification) || (ok ? "base_hitter_game_logs_backfill_completed" : "base_hitter_game_logs_backfill_failed")).slice(0, 120);
  const queueStatus = partialContinue ? "pending" : (ok ? "completed" : "failed");
  const runStatus = partialContinue ? "partial_continue" : (ok ? "completed" : "failed");
  const errorCode = ok || partialContinue ? null : "base_hitter_game_logs_worker_failed";
  const errorMessage = ok || partialContinue ? null : String((output && (output.error || output.status)) || "Base Hitter Game Logs worker failed").slice(0, 900);

  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      base_backfill_self_continuation_v0_2_0: true,
      lock_busy_backoff_v0_2_3: true,
      direct_waituntil_continuation_v0_2_4: true,
      hot_continuation_loop_v0_2_5: true, watchdog_hot_loop_v0_2_6: true,
      backend_self_continuation_ready: true,
      manual_wake_testing_only: true,
      no_browser_pump: true,
      no_generic_dispatch: true,
      no_prizepicks_mutation: true,
      no_sleeper_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true,
      no_live_promotion_before_certification: true,
      delta_partial_continue_queue_fix_v0_2_23: true,
      hitter_delta_mode_normalization_v0_2_77: true,
      raw_requested_mode: rawRequestedMode,
      normalized_worker_mode: normalizedWorkerMode,
      legacy_preflight_mode_normalized: rawRequestedMode === "delta_retained_stage_restore_before_queue"
    }
  };

  await run(env.CONTROL_DB,
    "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  if (partialContinue) {
    const isLockBusyRetry = certification === "BASE_HITTER_GAME_LOGS_BATCH_LOCK_BUSY_RETRY";
    const retryAfterSeconds = Math.max(10, Math.min(90, Number(output && output.lock && output.lock.retry_after_seconds ? output.lock.retry_after_seconds : 20)));
    if (isLockBusyRetry) {
      await run(env.CONTROL_DB,
        "UPDATE control_job_queue SET status='pending', run_after=datetime('now', ?), updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
        `+${retryAfterSeconds} seconds`, JSON.stringify(cappedOutput), row.request_id
      );
    } else {
      await run(env.CONTROL_DB,
        "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
        JSON.stringify(cappedOutput), row.request_id
      );
    }
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'base_hitter_game_logs_dispatch_completed', 'Orchestrator completed exact base-hitter-game-logs normalized base/delta dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok || partialContinue ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, status: queueStatus, run_status: runStatus, certification, rows_read: rowsRead, rows_written: rowsWritten, external_calls: externalCalls, raw_requested_mode: rawRequestedMode, normalized_worker_mode: normalizedWorkerMode, hitter_delta_mode_normalization_v0_2_77: rawRequestedMode === 'delta_retained_stage_restore_before_queue' })
  );

  return cappedOutput;
}


async function processBaseHitterSplitsJob(env, row, runId, trigger) {
  if (!env.BASE_HITTER_SPLITS_WORKER || typeof env.BASE_HITTER_SPLITS_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "BASE_HITTER_SPLITS_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch is enabled only through BASE_HITTER_SPLITS_WORKER service binding. Deploy orchestrator with the services wrangler config."
    };

    await run(env.CONTROL_DB,
      "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_base_hitter_splits_service_binding', 'BASE_HITTER_SPLITS_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );

    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_base_hitter_splits_service_binding', error_message='BASE_HITTER_SPLITS_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );

    return output;
  }

  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: rowInput.mode === "delta_update" ? "orchestrator_exact_delta_hitter_splits_noop_restore_gate_dispatch" : "orchestrator_exact_base_hitter_splits_promotion_dispatch",
    input_json: rowInput
  };

  const started = Date.now();
  let output;
  let httpStatus = null;

  try {
    const resp = await env.BASE_HITTER_SPLITS_WORKER.fetch("https://internal.alphadog-v2-base-hitter-splits/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    httpStatus = resp.status;
    const text = await resp.text();
    try {
      output = JSON.parse(text);
    } catch (_) {
      output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "worker_non_json_response", http_status: httpStatus, response_preview: String(text || "").slice(0, 900) };
    }
  } catch (err) {
    output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "worker_dispatch_exception", error: String(err && err.message ? err.message : err) };
  }

  const rawStatus = String((output && output.status) || "").toLowerCase();
  const partialContinue = !!(output && output.ok && (
    rawStatus === "partial_continue" ||
    rawStatus === "partial_continue_base_hitter_splits" ||
    output.continuation_required === true ||
    output.orchestrator_should_self_continue === true
  ));
  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && output.rows_read ? output.rows_read : 0);
  const rowsWritten = Number(output && output.rows_written ? output.rows_written : 0);
  const externalCalls = Number(output && output.external_calls_performed ? output.external_calls_performed : 0);
  const isDeltaHitterSplits = rowInput.mode === "delta_update";
  const certification = String((output && output.certification) || (ok ? (isDeltaHitterSplits ? "delta_hitter_splits_completed" : "base_hitter_splits_promotion_completed") : (isDeltaHitterSplits ? "delta_hitter_splits_failed" : "base_hitter_splits_promotion_failed"))).slice(0, 120);
  const queueStatus = partialContinue ? "pending" : (ok ? "completed" : "failed");
  const runStatus = partialContinue ? "partial_continue" : (ok ? "completed" : "failed");
  const errorCode = ok || partialContinue ? null : "base_hitter_splits_worker_failed";
  const errorMessage = ok || partialContinue ? null : String((output && (output.error || output.status)) || "Base Hitter Splits worker failed").slice(0, 900);

  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      base_hitter_splits_v0_4_3_pitcher_parity_delta_dispatch: true,
      delta_hitter_splits_noop_restore_scoped_repair_daily_affected_refresh_gate: isDeltaHitterSplits,
      certified_stage_promotion_v0_3_0: !isDeltaHitterSplits,
      locked_endpoint_sitcodes_vl_vr: true,
      no_browser_pump: true,
      no_generic_dispatch: true,
      live_hitter_splits_promotion_from_certified_stage_only: !isDeltaHitterSplits,
      no_new_mlb_calls_expected: isDeltaHitterSplits ? false : true,
      no_full_universe_remine: true,
      daily_affected_player_refresh_allowed: isDeltaHitterSplits,
      no_delta_update: !isDeltaHitterSplits,
      no_hitter_game_log_mutation: true,
      no_pitcher_mutation: true,
      no_prizepicks_mutation: true,
      no_sleeper_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  if (partialContinue) {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
      JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'base_hitter_splits_dispatch_completed', 'Orchestrator completed exact base-hitter-splits dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok || partialContinue ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, status: queueStatus, run_status: runStatus, certification, rows_read: rowsRead, rows_written: rowsWritten, external_calls: externalCalls, partial_continue: partialContinue, delta_hitter_splits_noop_restore_scoped_repair_daily_affected_refresh_gate: isDeltaHitterSplits, certified_stage_promotion: !isDeltaHitterSplits, no_new_mlb_calls_expected: !isDeltaHitterSplits, daily_affected_player_refresh_allowed: isDeltaHitterSplits })
  );

  return cappedOutput;
}



async function processBaseHitterMetricsJob(env, row, runId, trigger) {
  if (!env.BASE_HITTER_METRICS_WORKER || typeof env.BASE_HITTER_METRICS_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "BASE_HITTER_METRICS_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch is enabled only through BASE_HITTER_METRICS_WORKER service binding. Deploy orchestrator with the services wrangler config."
    };
    await run(env.CONTROL_DB,
      "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_base_hitter_metrics_service_binding', 'BASE_HITTER_METRICS_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_base_hitter_metrics_service_binding', error_message='BASE_HITTER_METRICS_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );
    return output;
  }

  const started = Date.now();
  let input = {};
  try { input = row.input_json ? JSON.parse(row.input_json) : {}; } catch { input = {}; }
  const payload = {
    ...input,
    request_id: row.request_id,
    chain_id: row.chain_id,
    run_id: runId,
    job_key: row.job_key,
    mode: String(input.mode || "").trim() || "schema_formula_input_audit",
    raw_requested_mode: input.mode || null,
    normalized_worker_mode: String(input.mode || "").trim() || "schema_formula_input_audit",
    trigger,
    orchestrator_version: SYSTEM_VERSION,
    no_live_metric_promotion: String(input.mode || "") === "delta_recalculate_affected_players" ? false : true,
    no_source_table_mutation: true,
    no_external_mlb_calls: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    performance_tune: true,
    snapshot_prep: String(input.mode || "") === "snapshot_prep_stage_only",
    snapshot_delta_gate: String(input.mode || "") === "snapshot_delta_gate"
  };

  let output;
  try {
    const resp = await env.BASE_HITTER_METRICS_WORKER.fetch("https://internal.alphadog-v2-base-hitter-metrics/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const txt = await resp.text();
    try { output = JSON.parse(txt); } catch { output = { ok: false, data_ok: false, status: "invalid_json_from_base_hitter_metrics", raw: txt.slice(0, 1500) }; }
  } catch (err) {
    output = { ok: false, data_ok: false, status: "service_binding_fetch_failed", error: String(err && err.message ? err.message : err) };
  }

  const elapsed = Date.now() - started;
  const rawStatus = String((output && output.status) || "").toLowerCase();
  const partialContinue = !!(output && output.ok && (
    rawStatus === "partial_continue" ||
    rawStatus === "partial_continue_base_hitter_metrics" ||
    output.continuation_required === true ||
    output.orchestrator_should_self_continue === true
  ));
  const ok = !!(output && output.ok);
  const dataOk = output && output.data_ok === true ? 1 : 0;
  const queueStatus = partialContinue ? "pending" : (ok ? "completed" : "failed");
  const runStatus = partialContinue ? "partial_continue" : (ok ? "completed" : "failed");
  const certification = String((output && output.certification) || (ok ? "BASE_HITTER_METRICS_SNAPSHOT_PREP_OR_BASE_STAGE_COMPLETED" : "BASE_HITTER_METRICS_AUDIT_FAILED"));
  const rowsRead = Number((output && output.rows_read) || 0);
  const rowsWritten = Number((output && output.rows_written) || 0);
  const externalCalls = Number((output && output.external_calls_performed) || 0);
  const cappedOutput = { ...output, processed_by_orchestrator: SYSTEM_VERSION, trigger, raw_requested_mode: payload.raw_requested_mode, normalized_worker_mode: payload.normalized_worker_mode };
  const errorCode = ok ? null : "base_hitter_metrics_dispatch_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status)) || "Base Hitter Metrics snapshot-prep stage-only dispatch failed").slice(0, 500);

  await run(env.CONTROL_DB,
    "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk, certification, rowsRead, rowsWritten, externalCalls, elapsed, JSON.stringify(payload), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  if (partialContinue) {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
      JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'base_hitter_metrics_dispatch_completed', 'Orchestrator completed exact base-hitter-metrics v0.5.0 affected-player delta or snapshot/base dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok || partialContinue ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, status: queueStatus, run_status: runStatus, certification, rows_read: rowsRead, rows_written: rowsWritten, external_calls: externalCalls, partial_continue: partialContinue, no_promotion: String((output && output.mode) || "") !== "delta_recalculate_affected_players", affected_player_delta: String((output && output.mode) || "") === "delta_recalculate_affected_players", no_external_mlb_calls: true, no_scoring: true, base_rebuild_stage_only: String((output && output.mode) || "") === "base_rebuild_stage_only", snapshot_prep_stage_only: String((output && output.mode) || "") === "snapshot_prep_stage_only", performance_tune: true,
    snapshot_prep: String(input.mode || "") === "snapshot_prep_stage_only",
    snapshot_delta_gate: String(input.mode || "") === "snapshot_delta_gate" })
  );
  return cappedOutput;
}


async function processBasePitcherMetricsJob(env, row, runId, trigger) {
  if (!env.BASE_PITCHER_METRICS_WORKER || typeof env.BASE_PITCHER_METRICS_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "BASE_PITCHER_METRICS_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch is enabled only through BASE_PITCHER_METRICS_WORKER service binding. Deploy orchestrator with the services wrangler config."
    };
    await run(env.CONTROL_DB,
      "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_base_pitcher_metrics_service_binding', 'BASE_PITCHER_METRICS_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_base_pitcher_metrics_service_binding', error_message='BASE_PITCHER_METRICS_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );
    return output;
  }

  const started = Date.now();
  let input = {};
  try { input = row.input_json ? JSON.parse(row.input_json) : {}; } catch { input = {}; }
  const payload = {
    ...input,
    request_id: row.request_id,
    chain_id: row.chain_id,
    run_id: runId,
    job_key: row.job_key,
    mode: String(input.mode || "").trim() || "base_rebuild_stage_only",
    raw_requested_mode: input.mode || null,
    normalized_worker_mode: String(input.mode || "").trim() || "base_rebuild_stage_only",
    trigger,
    orchestrator_version: SYSTEM_VERSION,
    no_live_metric_promotion: String(input.mode || "") === "delta_recalculate_affected_players" ? false : true,
    no_source_table_mutation: true,
    no_external_mlb_calls: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    promotion_locked: true
  };

  let output;
  try {
    const resp = await env.BASE_PITCHER_METRICS_WORKER.fetch("https://internal.alphadog-v2-base-pitcher-metrics/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const txt = await resp.text();
    try { output = JSON.parse(txt); } catch { output = { ok: false, data_ok: false, status: "invalid_json_from_base_pitcher_metrics", raw: txt.slice(0, 1500) }; }
  } catch (err) {
    output = { ok: false, data_ok: false, status: "service_binding_fetch_failed", error: String(err && err.message ? err.message : err) };
  }

  const elapsed = Date.now() - started;
  const rawStatus = String((output && output.status) || "").toLowerCase();
  const partialContinue = !!(output && output.ok && (
    rawStatus === "partial_continue" ||
    rawStatus === "partial_continue_base_pitcher_metrics" ||
    output.continuation_required === true ||
    output.orchestrator_should_self_continue === true
  ));
  const ok = !!(output && output.ok);
  const dataOk = output && output.data_ok === true ? 1 : 0;
  const queueStatus = partialContinue ? "pending" : (ok ? "completed" : "failed");
  const runStatus = partialContinue ? "partial_continue" : (ok ? "completed" : "failed");
  const certification = String((output && output.certification) || (ok ? "BASE_PITCHER_METRICS_V0_4_1_DISPATCH_COMPLETED" : "BASE_PITCHER_METRICS_V0_4_1_DISPATCH_FAILED"));
  const rowsRead = Number((output && output.rows_read) || 0);
  const rowsWritten = Number((output && output.rows_written) || 0);
  const externalCalls = Number((output && output.external_calls_performed) || 0);
  const cappedOutput = { ...output, processed_by_orchestrator: SYSTEM_VERSION, trigger, raw_requested_mode: payload.raw_requested_mode, normalized_worker_mode: payload.normalized_worker_mode };
  const errorCode = ok ? null : "base_pitcher_metrics_dispatch_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status)) || "Base Pitcher Metrics v0.4.0 snapshot-promote/snapshot-prep/full-stage dispatch failed").slice(0, 500);

  await run(env.CONTROL_DB,
    "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk, certification, rowsRead, rowsWritten, externalCalls, elapsed, JSON.stringify(payload), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  if (partialContinue) {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
      JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'base_pitcher_metrics_dispatch_completed', 'Orchestrator completed exact base-pitcher-metrics v0.5.2 affected-player delta or snapshot/full-stage dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, status: queueStatus, run_status: runStatus, certification, rows_read: rowsRead, rows_written: rowsWritten, external_calls: externalCalls, no_promotion: String((output && output.mode) || "") !== "delta_recalculate_affected_players", affected_player_delta: String((output && output.mode) || "") === "delta_recalculate_affected_players", no_external_mlb_calls: true, no_scoring: true, base_rebuild_stage_only: String((output && output.mode) || "") === "base_rebuild_stage_only", snapshot_prep_stage_only: String((output && output.mode) || "") === "snapshot_prep_stage_only", partial_continue: partialContinue })
  );
  return cappedOutput;
}

async function processBasePitcherSplitsJob(env, row, runId, trigger) {
  if (!env.BASE_PITCHER_SPLITS_WORKER || typeof env.BASE_PITCHER_SPLITS_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "BASE_PITCHER_SPLITS_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch is enabled only through BASE_PITCHER_SPLITS_WORKER service binding. Deploy orchestrator with the services wrangler config."
    };
    await run(env.CONTROL_DB,
      "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_base_pitcher_splits_service_binding', 'BASE_PITCHER_SPLITS_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_base_pitcher_splits_service_binding', error_message='BASE_PITCHER_SPLITS_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );
    return output;
  }

  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: rowInput.mode || "orchestrator_exact_base_pitcher_splits_promote_certified_stage",
    input_json: rowInput
  };
  const started = Date.now();
  let output;
  let httpStatus = null;
  try {
    const resp = await env.BASE_PITCHER_SPLITS_WORKER.fetch("https://internal.alphadog-v2-base-pitcher-splits/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    httpStatus = resp.status;
    const text = await resp.text();
    try { output = JSON.parse(text); }
    catch (_) { output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "worker_non_json_response", http_status: httpStatus, response_preview: String(text || "").slice(0, 900) }; }
  } catch (err) {
    output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "worker_dispatch_exception", error: String(err && err.message ? err.message : err) };
  }
  const rawStatus = String((output && output.status) || "").toLowerCase();
  const partialContinue = !!(output && output.ok && (rawStatus === "partial_continue" || rawStatus === "partial_continue_base_pitcher_splits" || output.continuation_required === true || output.orchestrator_should_self_continue === true));
  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && output.rows_read ? output.rows_read : 0);
  const rowsWritten = Number(output && output.rows_written ? output.rows_written : 0);
  const externalCalls = Number(output && output.external_calls_performed ? output.external_calls_performed : 0);
  const certification = String((output && output.certification) || (ok ? "base_pitcher_splits_stage_only_completed" : "base_pitcher_splits_stage_only_failed")).slice(0, 120);
  const queueStatus = partialContinue ? "pending" : (ok ? "completed" : "failed");
  const runStatus = partialContinue ? "partial_continue" : (ok ? "completed" : "failed");
  const errorCode = ok || partialContinue ? null : "base_pitcher_splits_worker_failed";
  const errorMessage = ok || partialContinue ? null : String((output && (output.error || output.status)) || "Base Pitcher Splits worker failed").slice(0, 900);
  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      base_pitcher_splits_exact_dispatch: true,
      base_pitcher_splits_v0_5_10_stale_duplicate_rescue_dispatch: rowInput.mode === "delta_update_noop_restore_scoped_repair_gate",
      base_pitcher_splits_v0_5_1_delta_noop_restore_scoped_repair_gate_dispatch: rowInput.mode === "delta_update_noop_restore_scoped_repair_gate",
      base_pitcher_splits_v0_4_0_delta_noop_restore_gate_dispatch: rowInput.mode === "delta_update_noop_restore_gate",
      base_pitcher_splits_v0_3_0_promote_certified_stage_dispatch: !(rowInput.mode || "").includes("delta"),
      service_binding: "BASE_PITCHER_SPLITS_WORKER",
      no_browser_pump: true,
      no_generic_dispatch: true,
      daily_affected_pitcher_refresh_allowed: rowInput.mode === "delta_update_noop_restore_scoped_repair_gate",
      no_full_pitcher_universe_refresh: rowInput.mode === "delta_update_noop_restore_scoped_repair_gate",
      live_pitcher_splits_promotion_from_certified_stage_only: true,
      delta_noop_restore_scoped_repair_gate_allowed_when_requested: true,
      retained_restore_and_scoped_repair_allowed_when_requested: true,
      no_hitter_splits_mutation: true,
      no_hitter_game_log_mutation: true,
      no_pitcher_game_log_mutation: true,
      no_prizepicks_mutation: true,
      no_sleeper_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true
    }
  };
  await run(env.CONTROL_DB,
    "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );
  if (partialContinue) {
    await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(cappedOutput), row.request_id);
  } else {
    await run(env.CONTROL_DB, "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?", queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id);
  }
  const pitcherSplitsDispatchMessage = rowInput.mode === "delta_update_noop_restore_scoped_repair_gate"
    ? "Orchestrator completed exact base-pitcher-splits delta no-op/restore/scoped-repair gate dispatch"
    : (rowInput.mode === "delta_update_noop_restore_gate"
      ? "Orchestrator completed exact base-pitcher-splits delta/no-op restore gate dispatch"
      : "Orchestrator completed exact base-pitcher-splits promotion dispatch");
  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'base_pitcher_splits_dispatch_completed', ?, ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok || partialContinue ? "INFO" : "ERROR", pitcherSplitsDispatchMessage, JSON.stringify({ request_id: row.request_id, status: queueStatus, run_status: runStatus, certification, rows_read: rowsRead, rows_written: rowsWritten, external_calls: externalCalls, partial_continue: partialContinue, promote_certified_stage_only: !(rowInput.mode || "").includes("delta"), delta_noop_restore_scoped_repair_gate: rowInput.mode === "delta_update_noop_restore_scoped_repair_gate", delta_noop_restore_gate: rowInput.mode === "delta_update_noop_restore_gate", rows_promoted: output && output.rows_promoted ? output.rows_promoted : 0 })
  );
  return cappedOutput;
}

async function processBasePitcherGameLogsJob(env, row, runId, trigger) {
  if (!env.BASE_PITCHER_GAME_LOGS_WORKER || typeof env.BASE_PITCHER_GAME_LOGS_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "BASE_PITCHER_GAME_LOGS_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch is enabled only through BASE_PITCHER_GAME_LOGS_WORKER service binding. Deploy orchestrator with the services wrangler config."
    };

    await run(env.CONTROL_DB,
      "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_base_pitcher_game_logs_service_binding', 'BASE_PITCHER_GAME_LOGS_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );

    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_base_pitcher_game_logs_service_binding', error_message='BASE_PITCHER_GAME_LOGS_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );

    return output;
  }

  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const rawRequestedMode = String((rowInput && rowInput.mode) || "base_promotion_microphase");
  const normalizedWorkerMode = rawRequestedMode === "delta_retained_stage_restore_before_queue" ? "delta_update" : rawRequestedMode;
  const normalizedRowInput = {
    ...rowInput,
    mode: normalizedWorkerMode,
    original_mode: rawRequestedMode,
    normalized_worker_mode: normalizedWorkerMode,
    pitcher_delta_mode_normalization_v0_2_78: rawRequestedMode === "delta_retained_stage_restore_before_queue"
  };
  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: normalizedWorkerMode,
    input_json: normalizedRowInput
  };

  const started = Date.now();
  let output;
  let httpStatus = null;

  try {
    const resp = await env.BASE_PITCHER_GAME_LOGS_WORKER.fetch("https://internal.alphadog-v2-base-pitcher-game-logs/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    httpStatus = resp.status;
    const text = await resp.text();
    try {
      output = JSON.parse(text);
    } catch (_) {
      output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "worker_non_json_response", http_status: httpStatus, response_preview: String(text || "").slice(0, 900) };
    }
  } catch (err) {
    output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "worker_dispatch_exception", error: String(err && err.message ? err.message : err) };
  }

  const rawStatus = String((output && output.status) || "").toLowerCase();
  const partialContinue = !!(output && output.ok && (
    rawStatus === "partial_continue" ||
    rawStatus === "partial_continue_base_pitcher_game_logs" ||
    rawStatus === "partial_continue_base_pitcher_game_logs_stage_only" ||
    rawStatus === "partial_continue_base_pitcher_game_logs_job" ||
    rawStatus === "partial_continue_base_pitcher_game_logs_stage_only_job" ||
    output.continuation_required === true ||
    output.orchestrator_should_self_continue === true
  ));
  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && output.rows_read ? output.rows_read : 0);
  const rowsWritten = Number(output && output.rows_written ? output.rows_written : 0);
  const externalCalls = Number(output && output.external_calls_performed ? output.external_calls_performed : 0);
  const certification = String((output && output.certification) || (ok ? "base_pitcher_game_logs_promotion_microphase_completed" : "base_pitcher_game_logs_promotion_microphase_failed")).slice(0, 120);
  const queueStatus = partialContinue ? "pending" : (ok ? "completed" : "failed");
  const runStatus = partialContinue ? "partial_continue" : (ok ? "completed" : "failed");
  const errorCode = ok || partialContinue ? null : "base_pitcher_game_logs_worker_failed";
  const errorMessage = ok || partialContinue ? null : String((output && (output.error || output.status)) || "Base Pitcher Game Logs promotion microphase worker failed").slice(0, 900);

  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      base_pitcher_game_logs_scoped_delta_v0_4_1: true,
      base_or_delta_continuation: true,
      retained_stage_restore_before_queue_control_room: true,
      scoped_delta_targets_only: true,
      no_normal_full_universe_sweep: true,
      no_generic_dispatch: true,
      live_promotion_from_certified_stage_or_delta_retained_stage: true,
      mlb_calls_allowed_only_for_delta_update: true,
      delta_update_supported: true,
      no_hitter_mutation: true,
      no_prizepicks_mutation: true,
      no_sleeper_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true,
      manual_wake_testing_only: true,
      no_browser_pump: true,
      pitcher_delta_mode_normalization_v0_2_78: true,
      raw_requested_mode: rawRequestedMode,
      normalized_worker_mode: normalizedWorkerMode,
      legacy_preflight_mode_normalized: rawRequestedMode === "delta_retained_stage_restore_before_queue"
    }
  };

  await run(env.CONTROL_DB,
    "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  if (partialContinue) {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
      JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'base_pitcher_game_logs_dispatch_completed', 'Orchestrator completed exact base-pitcher-game-logs base/delta continuation dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, status: queueStatus, run_status: runStatus, certification, rows_read: rowsRead, rows_written: rowsWritten, external_calls: externalCalls, base_or_delta_continuation: true,
      retained_stage_restore_before_queue_control_room: true,
      scoped_delta_targets_only: true,
      no_normal_full_universe_sweep: true, partial_continue: partialContinue, raw_requested_mode: rawRequestedMode, normalized_worker_mode: normalizedWorkerMode, pitcher_delta_mode_normalization_v0_2_78: rawRequestedMode === 'delta_retained_stage_restore_before_queue' })
  );

  return cappedOutput;
}


async function processBaseTeamGameLogsJob(env, row, runId, trigger) {
  if (!env.BASE_TEAM_GAME_LOGS_WORKER || typeof env.BASE_TEAM_GAME_LOGS_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "BASE_TEAM_GAME_LOGS_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch is enabled only through BASE_TEAM_GAME_LOGS_WORKER service binding. Deploy orchestrator with the services wrangler config."
    };

    await run(env.CONTROL_DB,
      "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_base_team_game_logs_service_binding', 'BASE_TEAM_GAME_LOGS_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );

    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_base_team_game_logs_service_binding', error_message='BASE_TEAM_GAME_LOGS_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );

    return output;
  }

  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const rawRequestedMode = String(rowInput.mode || "base_backfill");
  const normalizedWorkerMode = rawRequestedMode === "delta_retained_stage_restore_before_queue" ? "delta_update" : rawRequestedMode;
  const normalizedInputJson = {
    ...rowInput,
    mode: normalizedWorkerMode,
    raw_requested_mode: rawRequestedMode,
    normalized_worker_mode: normalizedWorkerMode,
    requested_preflight_behavior: rowInput.requested_preflight_behavior || (rawRequestedMode === "delta_retained_stage_restore_before_queue" ? "delta_retained_stage_restore_before_queue" : rowInput.requested_preflight_behavior),
    team_delta_mode_normalization_v0_2_80: rawRequestedMode === "delta_retained_stage_restore_before_queue"
  };
  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: "orchestrator_exact_base_team_game_logs_dispatch",
    input_json: normalizedInputJson
  };

  const started = Date.now();
  let output;
  let httpStatus = null;

  try {
    const resp = await env.BASE_TEAM_GAME_LOGS_WORKER.fetch("https://internal.alphadog-v2-base-team-game-logs/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    httpStatus = resp.status;
    const text = await resp.text();
    try {
      output = JSON.parse(text);
    } catch (_) {
      output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "worker_non_json_response", http_status: httpStatus, response_preview: String(text || "").slice(0, 900) };
    }
  } catch (err) {
    output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "worker_dispatch_exception", error: String(err && err.message ? err.message : err) };
  }

  const rawStatus = String((output && output.status) || "").toLowerCase();
  const partialContinue = !!(output && output.ok && (
    rawStatus === "partial_continue" ||
    rawStatus === "partial_continue_base_team_game_logs" ||
    rawStatus === "source_shape_probe_partial_continue" ||
    rawStatus === "partial_continue_base_team_game_logs" ||
    output.continuation_required === true ||
    output.orchestrator_should_self_continue === true
  ));
  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && output.rows_read ? output.rows_read : 0);
  const rowsWritten = Number(output && output.rows_written ? output.rows_written : 0);
  const externalCalls = Number(output && output.external_calls_performed ? output.external_calls_performed : 0);
  const certification = String((output && output.certification) || (ok ? "team_game_logs_source_shape_probe_completed" : "team_game_logs_source_shape_probe_failed")).slice(0, 120);
  const queueStatus = partialContinue ? "pending" : (ok ? "completed" : "failed");
  const runStatus = partialContinue ? "partial_continue" : (ok ? "completed" : "failed");
  const errorCode = ok || partialContinue ? null : "base_team_game_logs_worker_failed";
  const errorMessage = ok || partialContinue ? null : String((output && (output.error || output.status)) || "Base Team Game Logs probe worker failed").slice(0, 900);

  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      base_team_game_logs_base_backfill_or_delta_v0_3_1: true,
      hot_continuation_ready: true,
      backend_self_continuation_ready: true,
      manual_wake_testing_only: true,
      no_browser_pump: true,
      no_generic_dispatch: true,
      base_backfill_allowed: normalizedWorkerMode === "base_backfill",
      delta_update_allowed: normalizedWorkerMode === "delta_update",
      no_delta_update_execution: normalizedWorkerMode !== "delta_update",
      raw_requested_mode: rawRequestedMode,
      normalized_worker_mode: normalizedWorkerMode,
      requested_preflight_behavior: normalizedInputJson.requested_preflight_behavior || null,
      team_delta_mode_normalization_v0_2_80: rawRequestedMode === "delta_retained_stage_restore_before_queue",
      legacy_preflight_mode_normalized: rawRequestedMode === "delta_retained_stage_restore_before_queue",
      no_hitter_mutation: true,
      no_pitcher_mutation: true,
      no_splits_mutation: true,
      no_prizepicks_mutation: true,
      no_sleeper_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  if (partialContinue) {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
      JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'base_team_game_logs_dispatch_completed', 'Orchestrator completed exact base-team-game-logs v0.3.1 dynamic base/delta dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok || partialContinue ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, status: queueStatus, run_status: runStatus, certification, rows_read: rowsRead, rows_written: rowsWritten, rows_promoted: output && output.rows_promoted ? output.rows_promoted : 0, external_calls: externalCalls, raw_requested_mode: rawRequestedMode, normalized_worker_mode: normalizedWorkerMode, requested_preflight_behavior: normalizedInputJson.requested_preflight_behavior || null, team_delta_mode_normalization_v0_2_80: rawRequestedMode === "delta_retained_stage_restore_before_queue", mode: normalizedWorkerMode, base_backfill: normalizedWorkerMode === "base_backfill", delta_update: normalizedWorkerMode === "delta_update", partial_continue: partialContinue })
  );

  return cappedOutput;
}



async function processBaseBullpenHistoryJob(env, row, runId, trigger) {
  if (!env.BASE_BULLPEN_HISTORY_WORKER || typeof env.BASE_BULLPEN_HISTORY_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      request_id: row.request_id,
      run_id: runId,
      status: "blocked_missing_base_bullpen_history_service_binding",
      certification: "BASE_BULLPEN_HISTORY_SERVICE_BINDING_MISSING",
      note: "Exact dispatch is enabled only through BASE_BULLPEN_HISTORY_WORKER service binding. Deploy orchestrator with the services wrangler config.",
      trigger
    };
    await run(env.CONTROL_DB,
      "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_base_bullpen_history_service_binding', 'BASE_BULLPEN_HISTORY_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, row.input_json || "{}", JSON.stringify(output)
    );
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_base_bullpen_history_service_binding', error_message='BASE_BULLPEN_HISTORY_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );
    return output;
  }

  const started = Date.now();
  let input = {};
  try { input = row.input_json ? JSON.parse(row.input_json) : {}; } catch { input = {}; }
  const bullpenMode = String(input.mode || "source_lock_probe");
  const bullpenPromotionMode = bullpenMode === "base_promote_clean" || bullpenMode === "base_backfill_promote_clean";
  const bullpenDeltaMode = bullpenMode === "delta_update";
  const payload = {
    ...input,
    request_id: row.request_id,
    chain_id: row.chain_id,
    run_id: runId,
    job_key: row.job_key,
    worker_name: row.worker_name,
    mode: bullpenMode,
    orchestrator_trigger: trigger,
    no_live_promotion: !(bullpenPromotionMode || bullpenDeltaMode),
    no_full_base_backfill: bullpenMode === "source_lock_probe",
    no_mining: bullpenPromotionMode ? true : !!input.no_mining,
    no_new_batch: bullpenPromotionMode ? true : !!input.no_new_batch,
    no_source_calls: bullpenPromotionMode ? true : !!input.no_source_calls,
    no_delta_update_execution: !bullpenDeltaMode,
    no_daily_bullpen_availability: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_board_mutation: true
  };

  await run(env.CONTROL_DB,
    "UPDATE control_job_queue SET status='running', started_at=COALESCE(started_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP, tick_count=COALESCE(tick_count,0)+1 WHERE request_id=?",
    row.request_id
  );

  let output, errorCode = null, errorMessage = null;
  try {
    const resp = await env.BASE_BULLPEN_HISTORY_WORKER.fetch("https://internal.alphadog-v2-base-bullpen-history/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const text = await resp.text();
    try { output = JSON.parse(text); } catch { output = { ok: false, data_ok: false, raw_text: text, http_status: resp.status }; }
    if (!resp.ok) {
      errorCode = "base_bullpen_history_http_" + resp.status;
      errorMessage = String((output && (output.error || output.status || output.blocked_reason)) || text || "Base Bullpen History worker HTTP failure").slice(0, 500);
    }
  } catch (err) {
    errorCode = "base_bullpen_history_dispatch_exception";
    errorMessage = String(err && err.message ? err.message : err).slice(0, 500);
    output = { ok: false, data_ok: false, version: SYSTEM_VERSION, worker_name: row.worker_name, job_key: row.job_key, status: "dispatch_exception", error: errorMessage };
  }

  const ok = !!(output && output.ok && !errorCode);
  const dataOk = !!(output && output.data_ok && !errorCode);
  const rawStatus = String((output && output.status) || "").toLowerCase();
  const partialContinue = !!(ok && (rawStatus === "partial_continue" || rawStatus === "source_shape_probe_partial_continue" || output.continuation_required === true || output.orchestrator_should_self_continue === true));
  const certification = String((output && (output.certification || output.certification_status)) || (ok ? "BASE_BULLPEN_HISTORY_WORKER_COMPLETED" : "BASE_BULLPEN_HISTORY_WORKER_FAILED"));
  const rowsRead = Number((output && output.rows_read) || 0);
  const rowsWritten = Number((output && output.rows_written) || output && output.writes_performed || 0);
  const externalCalls = Number((output && output.external_calls_performed) || output && output.external_calls || 0);
  const runStatus = ok ? "completed" : "failed";
  const queueStatus = partialContinue ? "pending" : (ok ? "completed" : "failed");
  const cappedOutput = {
    ...output,
    processed_by_orchestrator_version: SYSTEM_VERSION,
    exact_dispatch: "BASE_BULLPEN_HISTORY_WORKER",
    v0_4_0_delta_update_capable: true,
    source_probe_only: bullpenMode === "source_lock_probe",
    base_backfill_stage_only: bullpenMode === "base_backfill_stage_only" || bullpenMode === "base_backfill",
    base_promote_clean: bullpenPromotionMode,
    no_live_promotion: !(bullpenPromotionMode || bullpenDeltaMode),
    no_full_base_backfill: bullpenMode === "source_lock_probe",
    no_mining: bullpenPromotionMode ? true : !!input.no_mining,
    no_new_batch: bullpenPromotionMode ? true : !!input.no_new_batch,
    no_source_calls: bullpenPromotionMode ? true : !!input.no_source_calls,
    no_delta_update_execution: !bullpenDeltaMode,
    no_daily_bullpen_availability: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board_write: true
  };

  await run(env.CONTROL_DB,
    "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(payload), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  if (partialContinue) {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
      JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'base_bullpen_history_dispatch_completed', 'Orchestrator completed exact base-bullpen-history v0.3.0 source-probe/base-stage/promote-clean dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok || partialContinue ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, status: queueStatus, run_status: runStatus, certification, rows_read: rowsRead, rows_written: rowsWritten, external_calls: externalCalls, mode: bullpenMode, source_probe_only: bullpenMode === "source_lock_probe", base_backfill_stage_only: bullpenMode === "base_backfill_stage_only" || bullpenMode === "base_backfill", base_promote_clean: bullpenPromotionMode, delta_update: bullpenDeltaMode, no_live_promotion: !(bullpenPromotionMode || bullpenDeltaMode), no_mining: bullpenPromotionMode ? true : !!input.no_mining, no_new_batch: bullpenPromotionMode ? true : !!input.no_new_batch, no_source_calls: bullpenPromotionMode ? true : !!input.no_source_calls, no_full_base_backfill: bullpenMode === "source_lock_probe", no_delta_update_execution: !bullpenDeltaMode, no_daily_bullpen_availability: true, partial_continue: partialContinue })
  );

  return cappedOutput;
}

async function processBaseStarterHistoryJob(env, row, runId, trigger) {
  if (!env.BASE_STARTER_HISTORY_WORKER || typeof env.BASE_STARTER_HISTORY_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "BASE_STARTER_HISTORY_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch is enabled only through BASE_STARTER_HISTORY_WORKER service binding. Deploy orchestrator with the services wrangler config."
    };

    await run(env.CONTROL_DB,
      "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_base_starter_history_service_binding', 'BASE_STARTER_HISTORY_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );

    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_base_starter_history_service_binding', error_message='BASE_STARTER_HISTORY_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );

    return output;
  }

  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const rawRequestedMode = rowInput.mode || "base_backfill_stage_only";
  const starterDailyIncrementalLaunch = rowInput.daily_incremental_launch === true || (rowInput.visible_button === "BASE > Starter History" && rowInput.requested_preflight_behavior === "delta_scoped_source_repair");
  const legacyPreflightModeNormalized = !!(starterDailyIncrementalLaunch && rawRequestedMode !== "delta_update");
  const starterMode = legacyPreflightModeNormalized ? "delta_update" : rawRequestedMode;
  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: "orchestrator_exact_base_starter_history_dispatch",
    input_json: {
      ...rowInput,
      mode: starterMode,
      raw_requested_mode: rawRequestedMode,
      normalized_worker_mode: starterMode,
      legacy_preflight_mode_normalized: legacyPreflightModeNormalized
    }
  };

  const started = Date.now();
  let output;
  let httpStatus = null;
  try {
    const resp = await env.BASE_STARTER_HISTORY_WORKER.fetch("https://internal.alphadog-v2-base-starter-history/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    httpStatus = resp.status;
    const text = await resp.text();
    try { output = JSON.parse(text); }
    catch (_) { output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "worker_non_json_response", http_status: httpStatus, response_preview: String(text || "").slice(0, 900) }; }
  } catch (err) {
    output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "worker_dispatch_exception", error: String(err && err.message ? err.message : err) };
  }

  const rawStatus = String((output && output.status) || "").toLowerCase();
  const partialContinue = !!(output && output.ok && (rawStatus === "partial_continue" || rawStatus === "source_shape_probe_partial_continue" || rawStatus === "partial_continue_base_starter_history_stage_only" || rawStatus === "partial_continue_base_starter_history_finalization_only" || rawStatus === "partial_continue_base_starter_history_delta_update" || output.continuation_required === true || output.orchestrator_should_self_continue === true));
  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && output.rows_read ? output.rows_read : 0);
  const rowsWritten = Number(output && output.rows_written ? output.rows_written : 0);
  const externalCalls = Number(output && output.external_calls_performed ? output.external_calls_performed : 0);
  const certification = String((output && output.certification) || (ok ? "starter_history_stage_only_completed" : "starter_history_stage_only_failed")).slice(0, 120);
  const queueStatus = partialContinue ? "pending" : (ok ? "completed" : "failed");
  const runStatus = partialContinue ? "partial_continue" : (ok ? "completed" : "failed");
  const errorCode = ok || partialContinue ? null : "base_starter_history_worker_failed";
  const errorMessage = ok || partialContinue ? null : String((output && (output.error || output.status)) || "Base Starter History worker failed").slice(0, 900);

  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      base_starter_history_v0_4_4_scoped_repair_order_fix: starterMode === "delta_scoped_source_repair",
      base_starter_history_v0_4_2_retained_stage_restore_before_queue: starterMode === "delta_retained_stage_restore_before_queue",
      base_starter_history_v0_4_1_delta_noop_current_state: starterMode === "delta_noop_current_state",
      base_starter_history_v0_4_0_delta_update_retained_stage: starterMode === "delta_update",
      raw_requested_mode: rawRequestedMode,
      normalized_worker_mode: starterMode,
      requested_preflight_behavior: rowInput.requested_preflight_behavior || null,
      starter_delta_mode_normalization_v0_2_81: legacyPreflightModeNormalized,
      legacy_preflight_mode_normalized: legacyPreflightModeNormalized,
      base_starter_history_v0_3_0_base_promotion_stage_clean: starterMode === "base_promotion_stage_clean" || starterMode === "base_promotion",
      base_starter_history_v0_2_1_hot_continuation_stage_only: starterMode === "base_backfill_stage_only" || starterMode === "base_backfill",
      hot_continuation_ready: true,
      backend_self_continuation_ready: true,
      manual_wake_testing_only: true,
      no_browser_pump: true,
      no_generic_dispatch: true,
      source_probe_only: starterMode === "source_lock_probe",
      stage_only_base_backfill_allowed: starterMode === "base_backfill_stage_only" || starterMode === "base_backfill",
      base_promotion_stage_clean_allowed: starterMode === "base_promotion_stage_clean" || starterMode === "base_promotion",
      delta_scoped_source_repair_allowed: starterMode === "delta_scoped_source_repair",
      delta_retained_stage_restore_before_queue_allowed: starterMode === "delta_retained_stage_restore_before_queue",
      delta_noop_current_state_allowed: starterMode === "delta_noop_current_state",
      delta_update_retained_stage_allowed: starterMode === "delta_update",
      delta_update_allowed: starterMode === "delta_update",
      no_live_promotion: !(starterMode === "base_promotion_stage_clean" || starterMode === "base_promotion" || starterMode === "delta_update" || starterMode === "delta_scoped_source_repair"),
      no_delta_update_execution: starterMode !== "delta_update",
      no_hitter_mutation: true,
      no_pitcher_mutation: true,
      no_splits_mutation: true,
      no_team_game_log_mutation: true,
      no_prizepicks_mutation: true,
      no_sleeper_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  if (partialContinue) {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
      JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'base_starter_history_dispatch_completed', 'Orchestrator completed exact base-starter-history exact dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok || partialContinue ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, status: queueStatus, run_status: runStatus, certification, rows_read: rowsRead, rows_written: rowsWritten, external_calls: externalCalls, raw_requested_mode: rawRequestedMode, normalized_worker_mode: starterMode, requested_preflight_behavior: rowInput.requested_preflight_behavior || null, legacy_preflight_mode_normalized: legacyPreflightModeNormalized, mode: starterMode, source_probe_only: starterMode === "source_lock_probe", stage_only_base_backfill: starterMode === "base_backfill_stage_only" || starterMode === "base_backfill", delta_update: starterMode === "delta_update", delta_update_allowed: starterMode === "delta_update", no_delta_update_execution: starterMode !== "delta_update", no_live_promotion: !(starterMode === "base_promotion_stage_clean" || starterMode === "base_promotion" || starterMode === "delta_update" || starterMode === "delta_scoped_source_repair"), partial_continue: partialContinue })
  );

  return cappedOutput;
}

async function processStaticTeamsJob(env, row, runId, trigger) {
  if (!env.STATIC_TEAMS_WORKER || typeof env.STATIC_TEAMS_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "STATIC_TEAMS_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch is enabled only through STATIC_TEAMS_WORKER service binding. Deploy orchestrator with the services wrangler config."
    };

    await run(env.CONTROL_DB,
      "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_static_teams_service_binding', 'STATIC_TEAMS_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );

    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_static_teams_service_binding', error_message='STATIC_TEAMS_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );

    return output;
  }

  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: "orchestrator_exact_static_teams_dispatch",
    input_json: (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })()
  };

  const started = Date.now();
  let output;
  let httpStatus = null;

  try {
    const resp = await env.STATIC_TEAMS_WORKER.fetch("https://internal.alphadog-v2-static-teams/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    httpStatus = resp.status;
    const text = await resp.text();
    try {
      output = JSON.parse(text);
    } catch (_) {
      output = {
        ok: false,
        data_ok: false,
        version: SYSTEM_VERSION,
        processed_by: WORKER_NAME,
        worker_name: row.worker_name,
        job_key: row.job_key,
        status: "worker_non_json_response",
        http_status: httpStatus,
        response_preview: String(text || "").slice(0, 900)
      };
    }
  } catch (err) {
    output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "worker_dispatch_exception",
      error: String(err && err.message ? err.message : err)
    };
  }

  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && output.rows_read ? output.rows_read : 0);
  const rowsWritten = Number(output && output.rows_written ? output.rows_written : 0);
  const externalCalls = Number(output && output.external_calls_performed ? output.external_calls_performed : 0);
  const certification = String((output && output.certification) || (ok ? "static_teams_completed" : "static_teams_failed")).slice(0, 120);
  const queueStatus = ok ? "completed" : "failed";
  const runStatus = ok ? "completed" : "failed";
  const errorCode = ok ? null : "static_teams_worker_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status)) || "static teams worker failed").slice(0, 900);

  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      no_prizepicks_board_mutation: true,
      no_opponent_backfill: true,
      no_scoring: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  if (partialContinue) {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
      JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'static_teams_dispatch_completed', 'Orchestrator completed exact static-teams dictionary seed dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, status: queueStatus, certification, rows_read: rowsRead, rows_written: rowsWritten, partial_continue: partialContinue })
  );

  return cappedOutput;
}


async function processStaticStadiumsJob(env, row, runId, trigger) {
  if (!env.STATIC_STADIUMS_WORKER || typeof env.STATIC_STADIUMS_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "STATIC_STADIUMS_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch is enabled only through STATIC_STADIUMS_WORKER service binding. Deploy orchestrator with the services wrangler config."
    };

    await run(env.CONTROL_DB,
      "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_static_stadiums_service_binding', 'STATIC_STADIUMS_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );

    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_static_stadiums_service_binding', error_message='STATIC_STADIUMS_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );

    return output;
  }

  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: "orchestrator_exact_static_stadiums_dispatch",
    input_json: (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })()
  };

  const started = Date.now();
  let output;
  let httpStatus = null;

  try {
    const resp = await env.STATIC_STADIUMS_WORKER.fetch("https://internal.alphadog-v2-static-stadiums/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    httpStatus = resp.status;
    const text = await resp.text();
    try {
      output = JSON.parse(text);
    } catch (_) {
      output = {
        ok: false,
        data_ok: false,
        version: SYSTEM_VERSION,
        processed_by: WORKER_NAME,
        worker_name: row.worker_name,
        job_key: row.job_key,
        status: "worker_non_json_response",
        http_status: httpStatus,
        response_preview: String(text || "").slice(0, 900)
      };
    }
  } catch (err) {
    output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "worker_dispatch_exception",
      error: String(err && err.message ? err.message : err)
    };
  }

  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && output.rows_read ? output.rows_read : 0);
  const rowsWritten = Number(output && output.rows_written ? output.rows_written : 0);
  const externalCalls = Number(output && output.external_calls_performed ? output.external_calls_performed : 0);
  const certification = String((output && output.certification) || (ok ? "static_stadiums_completed" : "static_stadiums_failed")).slice(0, 120);
  const queueStatus = ok ? "completed" : "failed";
  const runStatus = ok ? "completed" : "failed";
  const errorCode = ok ? null : "static_stadiums_worker_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status)) || "static stadiums worker failed").slice(0, 900);

  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      no_team_db_writes: true,
      no_prizepicks_board_mutation: true,
      no_opponent_backfill: true,
      no_scoring: true,
      no_final_board_write: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  if (partialContinue) {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
      JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'static_stadiums_dispatch_completed', 'Orchestrator completed exact static-stadiums dictionary seed dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, status: queueStatus, certification, rows_read: rowsRead, rows_written: rowsWritten, partial_continue: partialContinue })
  );

  return cappedOutput;
}

async function processStaticParkFactorsJob(env, row, runId, trigger) {
  if (!env.STATIC_PARK_FACTORS_WORKER || typeof env.STATIC_PARK_FACTORS_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "STATIC_PARK_FACTORS_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch is enabled only through STATIC_PARK_FACTORS_WORKER service binding. Deploy orchestrator with the services wrangler config."
    };

    await run(env.CONTROL_DB,
      "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_static_park_factors_service_binding', 'STATIC_PARK_FACTORS_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );

    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_static_park_factors_service_binding', error_message='STATIC_PARK_FACTORS_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );

    return output;
  }

  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: "orchestrator_exact_static_park_factors_dispatch",
    input_json: (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })()
  };

  const started = Date.now();
  let output;
  let httpStatus = null;

  try {
    const resp = await env.STATIC_PARK_FACTORS_WORKER.fetch("https://internal.alphadog-v2-static-park-factors/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    httpStatus = resp.status;
    const text = await resp.text();
    try {
      output = JSON.parse(text);
    } catch (_) {
      output = {
        ok: false,
        data_ok: false,
        version: SYSTEM_VERSION,
        processed_by: WORKER_NAME,
        worker_name: row.worker_name,
        job_key: row.job_key,
        status: "worker_non_json_response",
        http_status: httpStatus,
        response_preview: String(text || "").slice(0, 900)
      };
    }
  } catch (err) {
    output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "worker_dispatch_exception",
      error: String(err && err.message ? err.message : err)
    };
  }

  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && output.rows_read ? output.rows_read : 0);
  const rowsWritten = Number(output && output.rows_written ? output.rows_written : 0);
  const externalCalls = Number(output && output.external_calls_performed ? output.external_calls_performed : 0);
  const certification = String((output && output.certification) || (ok ? "static_park_factors_completed" : "static_park_factors_failed")).slice(0, 120);
  const queueStatus = ok ? "completed" : "failed";
  const runStatus = ok ? "completed" : "failed";
  const errorCode = ok ? null : "static_park_factors_worker_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status)) || "static park factors worker failed").slice(0, 900);

  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      writes_only_ref_park_factors: true,
      no_team_db_writes: true,
      no_prizepicks_board_mutation: true,
      no_opponent_backfill: true,
      no_scoring: true,
      no_final_board_write: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  if (partialContinue) {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
      JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'static_park_factors_dispatch_completed', 'Orchestrator completed exact static-park-factors source refresh dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, status: queueStatus, certification, rows_read: rowsRead, rows_written: rowsWritten, partial_continue: partialContinue })
  );

  return cappedOutput;
}

async function processStaticPlayersJob(env, row, runId, trigger) {
  if (!env.STATIC_PLAYERS_WORKER || typeof env.STATIC_PLAYERS_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "STATIC_PLAYERS_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch is enabled only through STATIC_PLAYERS_WORKER service binding. Deploy orchestrator with the services wrangler config."
    };

    await run(env.CONTROL_DB,
      "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_static_players_service_binding', 'STATIC_PLAYERS_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );

    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_static_players_service_binding', error_message='STATIC_PLAYERS_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );

    return output;
  }

  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: "orchestrator_exact_static_players_dispatch",
    input_json: (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })()
  };

  const started = Date.now();
  let output;
  let httpStatus = null;

  try {
    const resp = await env.STATIC_PLAYERS_WORKER.fetch("https://internal.alphadog-v2-static-players/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    httpStatus = resp.status;
    const text = await resp.text();
    try {
      output = JSON.parse(text);
    } catch (_) {
      output = {
        ok: false,
        data_ok: false,
        version: SYSTEM_VERSION,
        processed_by: WORKER_NAME,
        worker_name: row.worker_name,
        job_key: row.job_key,
        status: "worker_non_json_response",
        http_status: httpStatus,
        response_preview: String(text || "").slice(0, 900)
      };
    }
  } catch (err) {
    output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "worker_dispatch_exception",
      error: String(err && err.message ? err.message : err)
    };
  }

  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const partialContinue = ok && output && output.status === "partial_continue" && output.continuation_input_json;
  const rowsRead = Number(output && output.rows_read ? output.rows_read : 0);
  const rowsWritten = Number(output && output.rows_written ? output.rows_written : 0);
  const externalCalls = Number(output && output.external_calls_performed ? output.external_calls_performed : 0);
  const certification = String((output && output.certification) || (ok ? "static_players_completed" : "static_players_failed")).slice(0, 120);
  const queueStatus = partialContinue ? "pending" : (ok ? "completed" : "failed");
  const runStatus = partialContinue ? "partial_continue" : (ok ? "completed" : "failed");
  const errorCode = ok ? null : "static_players_worker_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status)) || "static players worker failed").slice(0, 900);

  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      partial_continue: partialContinue,
      writes_only_ref_players_aliases_rosters: true,
      no_team_db_writes: true,
      no_prizepicks_board_mutation: true,
      no_opponent_backfill: true,
      no_scoring: true,
      no_final_board_write: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  if (partialContinue) {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
      JSON.stringify(output.continuation_input_json), JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'static_players_dispatch_completed', 'Orchestrator completed exact static-players 40-man identity seed dispatch step', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, status: queueStatus, run_status: runStatus, certification, rows_read: rowsRead, rows_written: rowsWritten, teams_processed_total: output && output.teams_processed_total, teams_remaining: output && output.teams_remaining })
  );

  return cappedOutput;
}


async function processDailyGamesStatusJob(env, row, runId, trigger) {
  if (!env.DAILY_GAMES_STATUS_WORKER || typeof env.DAILY_GAMES_STATUS_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "DAILY_GAME_STATUS_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch is enabled only through DAILY_GAMES_STATUS_WORKER service binding. Do not generic-dispatch this worker."
    };
    await run(env.CONTROL_DB,
      "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_daily_games_status_service_binding', 'DAILY_GAMES_STATUS_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_daily_games_status_service_binding', error_message='DAILY_GAMES_STATUS_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );
    return output;
  }

  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: "orchestrator_exact_daily_game_status_dispatch",
    input_json: rowInput,
    exact_worker_only: true,
    board_focused_only: true,
    no_board_mutation: true,
    no_player_resolver: true,
    no_lineups: true,
    no_starters: true,
    no_weather: true,
    no_bullpen: true,
    no_market_odds: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true
  };

  const started = Date.now();
  let output;
  let httpStatus = null;
  try {
    const resp = await env.DAILY_GAMES_STATUS_WORKER.fetch("https://internal.alphadog-v2-daily-games-status/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    httpStatus = resp.status;
    const text = await resp.text();
    try { output = JSON.parse(text); }
    catch (_) {
      output = {
        ok: false,
        data_ok: false,
        version: SYSTEM_VERSION,
        processed_by: WORKER_NAME,
        worker_name: row.worker_name,
        job_key: row.job_key,
        status: "worker_non_json_response",
        http_status: httpStatus,
        response_preview: String(text || "").slice(0, 900)
      };
    }
  } catch (err) {
    output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "worker_dispatch_exception", error: String(err && err.message ? err.message : err) };
  }

  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && (output.rows_read || output.board_rows_read) ? (output.rows_read || output.board_rows_read) : 0);
  const rowsWritten = Number(output && (output.rows_written || output.current_rows_promoted) ? (output.rows_written || output.current_rows_promoted) : 0);
  const externalCalls = Number(output && output.external_calls_performed ? output.external_calls_performed : 0);
  const certification = String((output && output.certification) || (ok ? "daily_game_status_completed" : "daily_game_status_failed")).slice(0, 120);
  const queueStatus = ok ? "completed" : "failed";
  const runStatus = ok ? "completed" : "failed";
  const errorCode = ok ? null : "daily_games_status_worker_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status)) || "Daily Game Status worker failed").slice(0, 900);
  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      no_board_mutation: true,
      no_player_resolver: true,
      no_lineups: true,
      no_starters: true,
      no_weather: true,
      no_bullpen: true,
      no_market_odds: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true,
      no_old_production_touch: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  await run(env.CONTROL_DB,
    "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
    queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
  );

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'daily_game_status_dispatch_completed', 'Orchestrator completed exact Daily Game Status dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, certification, rows_read: rowsRead, rows_written: rowsWritten, dispatch: cappedOutput.orchestrator_dispatch })
  );

  return cappedOutput;
}

async function processSafeTestJob(env, row, runId, trigger) {
  const output = {
    ok: true,
    data_ok: true,
    version: SYSTEM_VERSION,
    processed_by: WORKER_NAME,
    worker_name: row.worker_name,
    job_key: row.job_key,
    mode: "real_orchestrator_backend_safe_test_only",
    trigger,
    completed_at: nowIso(),
    note: "No external API call, no mining, no scoring. This confirms real orchestrator queue/lock/run/log continuation."
  };

  await run(env.CONTROL_DB,
    "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'completed', 1, 'real_orchestrator_safe_test_complete', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
  );

  await run(env.CONTROL_DB,
    "UPDATE control_job_queue SET status='completed', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
    JSON.stringify(output), row.request_id
  );

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'real_orchestrator_safe_test_completed', 'Real orchestrator completed one backend-safe system-health test job', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify(output)
  );

  return output;
}


async function recoverStaleStaticPlayersJobs(env, trigger) {
  const staleRows = await all(env.CONTROL_DB,
    "SELECT request_id, chain_id, job_key, worker_name, status, tick_count, started_at, updated_at FROM control_job_queue WHERE job_key='static-players' AND worker_name='alphadog-v2-static-players' AND status='running' AND datetime(updated_at) <= datetime('now','-2 minutes') ORDER BY datetime(updated_at) ASC LIMIT 10"
  );

  let recovered = 0;
  for (const row of staleRows) {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, error_code=NULL, error_message=NULL WHERE request_id=? AND job_key='static-players' AND worker_name='alphadog-v2-static-players' AND status='running'",
      row.request_id
    );
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, 'static-players', 'WARN', 'static_players_stale_running_auto_recovered', 'Auto-clock recovered stale running static-players queue row back to pending', ?, CURRENT_TIMESTAMP)",
      row.request_id, WORKER_NAME, JSON.stringify({ trigger, recovered_from_status: row.status, started_at: row.started_at, updated_at: row.updated_at, tick_count: row.tick_count, version: SYSTEM_VERSION })
    );
    recovered += 1;
  }

  return { recovered, rows: staleRows };
}

async function recoverStaleBaseHitterGameLogsJobs(env, trigger) {
  // Base Hitter Game Logs chunks can survive a terminated service-binding call because
  // the queue row is set to running before the worker request returns. A stale running row
  // must be returned to pending so the next backend pump/cron tick can resume from the
  // STATS_HITTER_DB cursor. This does not create a new batch and does not promote data.
  const staleRows = await all(env.CONTROL_DB,
    "SELECT request_id, chain_id, job_key, worker_name, status, tick_count, started_at, updated_at, substr(output_json,1,900) AS output_preview FROM control_job_queue WHERE job_key='base-hitter-game-logs' AND worker_name='alphadog-v2-base-hitter-game-logs' AND status='running' AND finished_at IS NULL AND datetime(updated_at) <= datetime('now','-2 minutes') ORDER BY datetime(updated_at) ASC LIMIT 3"
  );

  let recovered = 0;
  for (const row of staleRows) {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, error_code=NULL, error_message=NULL WHERE request_id=? AND job_key='base-hitter-game-logs' AND worker_name='alphadog-v2-base-hitter-game-logs' AND status='running' AND finished_at IS NULL",
      row.request_id
    );
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, 'base-hitter-game-logs', 'WARN', 'base_hitter_game_logs_stale_running_auto_recovered', 'Recovered stale running base-hitter-game-logs queue row back to pending for cursor-safe continuation', ?, CURRENT_TIMESTAMP)",
      row.request_id, WORKER_NAME, JSON.stringify({ trigger, recovered_from_status: row.status, started_at: row.started_at, updated_at: row.updated_at, tick_count: row.tick_count, stale_threshold_minutes: 2, no_new_batch: true, resume_from_worker_cursor: true, output_preview: row.output_preview || null, version: SYSTEM_VERSION })
    );
    recovered += 1;
  }

  return { recovered, rows: staleRows };
}


async function recoverStaleBasePitcherGameLogsJobs(env, trigger) {
  // Base Pitcher Game Logs delta chunks can complete partial DB work and then lose the
  // service-binding response before CONTROL_DB is flipped back to pending. This mirrors
  // the locked Hitter Game Logs stale-running recovery: return the same queue row to
  // pending so the worker resumes from its retained delta batch/cursor. No new batch,
  // no base rerun, no manual SQL promotion, no full pitcher-universe sweep.
  const staleRows = await all(env.CONTROL_DB,
    "SELECT request_id, chain_id, job_key, worker_name, status, tick_count, started_at, updated_at, substr(output_json,1,900) AS output_preview FROM control_job_queue WHERE job_key='base-pitcher-game-logs' AND worker_name='alphadog-v2-base-pitcher-game-logs' AND status='running' AND finished_at IS NULL AND datetime(updated_at) <= datetime('now','-2 minutes') ORDER BY datetime(updated_at) ASC LIMIT 3"
  );

  let recovered = 0;
  for (const row of staleRows) {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, error_code=NULL, error_message=NULL WHERE request_id=? AND job_key='base-pitcher-game-logs' AND worker_name='alphadog-v2-base-pitcher-game-logs' AND status='running' AND finished_at IS NULL",
      row.request_id
    );
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, 'base-pitcher-game-logs', 'WARN', 'base_pitcher_game_logs_stale_running_auto_recovered', 'Recovered stale running base-pitcher-game-logs queue row back to pending for scoped delta continuation', ?, CURRENT_TIMESTAMP)",
      row.request_id, WORKER_NAME, JSON.stringify({ trigger, recovered_from_status: row.status, started_at: row.started_at, updated_at: row.updated_at, tick_count: row.tick_count, stale_threshold_minutes: 2, no_new_batch: true, resume_from_worker_cursor: true, scoped_delta_targets_only: true, no_normal_full_universe_sweep: true, output_preview: row.output_preview || null, version: SYSTEM_VERSION })
    );
    recovered += 1;
  }

  return { recovered, rows: staleRows };
}

async function recoverStaleBaseStarterHistoryJobs(env, trigger) {
  // Base Starter History stage-only chunks make many MLB boxscore calls. A service-binding
  // chunk can finish writing TEAM_DB stage rows but fail to flip the CONTROL_DB queue row
  // back from running to pending before the request window ends. Recovery must mirror the
  // successful game-log workers: return the same queue row to pending, then the worker
  // resumes from starter_history_outcomes/stage without creating a new batch or promoting live.
  const staleRows = await all(env.CONTROL_DB,
    "SELECT request_id, chain_id, job_key, worker_name, status, tick_count, started_at, updated_at, substr(output_json,1,900) AS output_preview FROM control_job_queue WHERE job_key='base-starter-history' AND worker_name='alphadog-v2-base-starter-history' AND status='running' AND finished_at IS NULL AND datetime(updated_at) <= datetime('now','-2 minutes') ORDER BY datetime(updated_at) ASC LIMIT 3"
  );

  let recovered = 0;
  for (const row of staleRows) {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, error_code=NULL, error_message=NULL WHERE request_id=? AND job_key='base-starter-history' AND worker_name='alphadog-v2-base-starter-history' AND status='running' AND finished_at IS NULL",
      row.request_id
    );
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, 'base-starter-history', 'WARN', 'base_starter_history_stale_running_auto_recovered', 'Recovered stale running base-starter-history queue row back to pending for cursor-safe stage-only continuation', ?, CURRENT_TIMESTAMP)",
      row.request_id, WORKER_NAME, JSON.stringify({ trigger, recovered_from_status: row.status, started_at: row.started_at, updated_at: row.updated_at, tick_count: row.tick_count, stale_threshold_minutes: 2, no_new_batch: true, resume_from_stage_outcomes: true, no_live_promotion: true, output_preview: row.output_preview || null, version: SYSTEM_VERSION })
    );
    recovered += 1;
  }

  return { recovered, rows: staleRows };
}


async function recoverStaleBaseBullpenHistoryJobs(env, trigger) {
  const staleRows = await all(env.CONTROL_DB,
    "SELECT request_id, chain_id, job_key, worker_name, status, tick_count, started_at, updated_at, substr(output_json,1,900) AS output_preview FROM control_job_queue WHERE job_key='base-bullpen-history' AND worker_name='alphadog-v2-base-bullpen-history' AND status='running' AND finished_at IS NULL AND datetime(updated_at) <= datetime('now','-2 minutes') ORDER BY datetime(updated_at) ASC LIMIT 3"
  );
  let recovered = 0;
  for (const row of staleRows) {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, error_code=NULL, error_message=NULL WHERE request_id=? AND job_key='base-bullpen-history' AND worker_name='alphadog-v2-base-bullpen-history' AND status='running' AND finished_at IS NULL",
      row.request_id
    );
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, 'base-bullpen-history', 'WARN', 'base_bullpen_history_stale_running_auto_recovered', 'Recovered stale running base-bullpen-history probe queue row back to pending for safe backend continuation', ?, CURRENT_TIMESTAMP)",
      row.request_id, WORKER_NAME, JSON.stringify({ trigger, recovered_from_status: row.status, started_at: row.started_at, updated_at: row.updated_at, tick_count: row.tick_count, stale_threshold_minutes: 2, no_new_batch_required_for_probe: true, no_live_promotion: true, output_preview: row.output_preview || null, version: SYSTEM_VERSION })
    );
    recovered += 1;
  }
  return { recovered, rows: staleRows };
}

async function enqueueStaticPlayersWeeklyIfDue(env, cronExpression) {
  const active = await first(env.CONTROL_DB,
    "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key='static-players' AND worker_name='alphadog-v2-static-players' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
  );

  if (active) {
    return { enqueued: false, reason: "active_static_players_job_exists", active_request_id: active.request_id, active_status: active.status };
  }

  const recentComplete = await first(env.CONTROL_DB,
    "SELECT request_id, finished_at FROM control_job_queue WHERE job_key='static-players' AND worker_name='alphadog-v2-static-players' AND status='completed' AND datetime(finished_at) >= datetime('now','-6 days') ORDER BY datetime(finished_at) DESC LIMIT 1"
  );

  if (recentComplete) {
    return { enqueued: false, reason: "recent_static_players_completion_exists", recent_request_id: recentComplete.request_id, recent_finished_at: recentComplete.finished_at };
  }

  const isWeeklyStaticCron = String(cronExpression || "") === "0 3 * * 1";
  const hasNeverCompleted = !(await first(env.CONTROL_DB,
    "SELECT request_id FROM control_job_queue WHERE job_key='static-players' AND worker_name='alphadog-v2-static-players' AND status='completed' LIMIT 1"
  ));

  if (!isWeeklyStaticCron && !hasNeverCompleted) {
    return { enqueued: false, reason: "not_static_players_weekly_cron", cron: cronExpression || null };
  }

  const requestId = rid("static_players_auto");
  const chainId = rid("chain");
  const input = {
    source: "orchestrator_auto_clock",
    visible_button: "AUTO > Static Players Weekly",
    mode: "static_players_40man_identity_seed",
    created_at: nowIso(),
    source_name: "MLB StatsAPI 40-man roster endpoint",
    source_mode: "ref_teams_driven_mlb_statsapi_40man_roster",
    endpoint_pattern: "/teams/{mlb_team_id}/roster/40Man",
    allowed_writes: ["REF_DB.ref_players", "REF_DB.ref_player_aliases", "REF_DB.ref_rosters"],
    no_26man_only_scope: true,
    no_every_minor_leaguer_scope: true,
    no_person_detail_hydration_in_v0_1_0: true,
    no_prizepicks_board_mutation: true,
    no_prizepicks_alias_guessing: true,
    no_sleeper_alias_guessing: true,
    no_opponent_backfill: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board_write: true,
    auto_scheduled: true,
    cron_expression: cronExpression || null,
    max_teams_per_run: 3
  };

  await run(env.CONTROL_DB,
    "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'static-players', 'alphadog-v2-static-players', 'Static', 'static', 'Static MLB Player 40-Man Identity Seed', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
    requestId, chainId, JSON.stringify(input)
  );

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, 'static-players', 'INFO', 'static_players_auto_clock_enqueued', 'Auto-clock queued Static Players MLB StatsAPI 40-man identity seed job', ?, CURRENT_TIMESTAMP)",
    requestId, WORKER_NAME, JSON.stringify({ request_id: requestId, chain_id: chainId, cron: cronExpression || null, version: SYSTEM_VERSION })
  );

  return { enqueued: true, request_id: requestId, chain_id: chainId };
}

async function processOneUnlocked(env, trigger) {
  let row = await first(env.CONTROL_DB,
    "SELECT request_id, chain_id, job_key, worker_name, status, tick_count, input_json FROM control_job_queue WHERE status='pending' AND datetime(COALESCE(run_after, CURRENT_TIMESTAMP)) <= datetime(CURRENT_TIMESTAMP) ORDER BY priority ASC, datetime(created_at) ASC LIMIT 1"
  );

  // v0.2.88: Hitter Splits daily affected refresh uses the same safe running-row
  // continuation rescue as Pitcher Splits. If a backend hot loop is interrupted
  // after the queue row is marked running, the unfinished row must be treated as due.
  // Do NOT use output_json LIKE here; large JSON can trigger D1 pattern-complexity errors.
  if (!row) {
    row = await first(env.CONTROL_DB,
      `SELECT request_id, chain_id, job_key, worker_name, status, tick_count, input_json
       FROM control_job_queue
       WHERE job_key='base-hitter-splits'
         AND worker_name='alphadog-v2-base-hitter-splits'
         AND status='running'
         AND finished_at IS NULL
         AND datetime(updated_at) <= datetime(CURRENT_TIMESTAMP, '-20 seconds')
       ORDER BY datetime(updated_at) ASC
       LIMIT 1`
    );
    if (row) {
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'INFO', 'base_hitter_splits_running_partial_rescued_as_due', 'Recovered running Hitter Splits partial-continue row as due work for backend continuation', ?, CURRENT_TIMESTAMP)",
        row.request_id, WORKER_NAME, row.job_key, JSON.stringify({ request_id: row.request_id, previous_status: row.status, trigger, hitter_splits_running_rescue_parity_v0_2_88: true })
      );
    }
  }

  // v0.2.106: Hitter Metrics affected-player recalc can safely require many
  // backend ticks. Match Hitter Splits / Pitcher Splits continuation semantics:
  // a stale RUNNING row without finished_at is unfinished due work, not a stuck
  // terminal state. This lets the auto-pump resume from hitter_metric_cursor
  // and continue the same batch/snapshot batch without starting over.
  // Do NOT use output_json LIKE here; large JSON can trigger D1 pattern-complexity errors.
  if (!row) {
    row = await first(env.CONTROL_DB,
      `SELECT request_id, chain_id, job_key, worker_name, status, tick_count, input_json
       FROM control_job_queue
       WHERE job_key='base-hitter-metrics'
         AND worker_name='alphadog-v2-base-hitter-metrics'
         AND status='running'
         AND finished_at IS NULL
         AND datetime(updated_at) <= datetime(CURRENT_TIMESTAMP, '-20 seconds')
       ORDER BY datetime(updated_at) ASC
       LIMIT 1`
    );
    if (row) {
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'INFO', 'base_hitter_metrics_running_partial_rescued_as_due', 'Recovered running Hitter Metrics partial-continue row as due work for backend continuation', ?, CURRENT_TIMESTAMP)",
        row.request_id, WORKER_NAME, row.job_key, JSON.stringify({ request_id: row.request_id, previous_status: row.status, trigger, hitter_metrics_running_rescue_parity_v0_2_106: true, resumes_from_hitter_metric_cursor: true, no_new_batch: true })
      );
    }
  }

  // v0.2.84: Pitcher Splits daily affected refresh can safely require several
  // backend ticks. If a prior hot continuation is interrupted after marking the
  // queue row running, the row must remain continuation-eligible; otherwise the
  // pump reports no_due_jobs while the request is still unfinished. This rescue
  // is scoped only to base-pitcher-splits running rows with no finished_at.
  // Do NOT use output_json LIKE here; large JSON can trigger D1 pattern-complexity errors.
  if (!row) {
    row = await first(env.CONTROL_DB,
      `SELECT request_id, chain_id, job_key, worker_name, status, tick_count, input_json
       FROM control_job_queue
       WHERE job_key='base-pitcher-splits'
         AND worker_name='alphadog-v2-base-pitcher-splits'
         AND status='running'
         AND finished_at IS NULL
         AND datetime(updated_at) <= datetime(CURRENT_TIMESTAMP, '-20 seconds')
       ORDER BY datetime(updated_at) ASC
       LIMIT 1`
    );
    if (row) {
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'INFO', 'base_pitcher_splits_running_partial_rescued_as_due', 'Recovered running Pitcher Splits partial-continue row as due work for backend continuation', ?, CURRENT_TIMESTAMP)",
        row.request_id, WORKER_NAME, row.job_key, JSON.stringify({ request_id: row.request_id, previous_status: row.status, trigger, pitcher_splits_running_rescue_sql_fix_v0_2_84: true })
      );
    }
  }

  // v0.2.99: Board Full Run child rows are hot-continuation eligible.
  // Recover only same-chain child rows owned by an active Board Full Run parent.
  if (!row) {
    row = await first(env.CONTROL_DB,
      `SELECT c.request_id, c.chain_id, c.job_key, c.worker_name, c.status, c.tick_count, c.input_json
       FROM control_job_queue c
       JOIN control_job_queue p ON p.request_id = c.parent_request_id
       WHERE p.job_key='board-full-run'
         AND p.worker_name='alphadog-v2-orchestrator'
         AND p.status IN ('pending','running','partial_continue')
         AND p.finished_at IS NULL
         AND c.parent_request_id IS NOT NULL
         AND c.status='running'
         AND c.finished_at IS NULL
         AND datetime(c.updated_at) <= datetime(CURRENT_TIMESTAMP, '-5 seconds')
       ORDER BY datetime(c.updated_at) ASC
       LIMIT 1`
    );
    if (row) {
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'INFO', 'board_full_run_child_running_rescued_as_due', 'Recovered active Board Full Run child running row as due work for same-chain hot continuation', ?, CURRENT_TIMESTAMP)",
        row.request_id, WORKER_NAME, row.job_key, JSON.stringify({ request_id: row.request_id, previous_status: row.status, trigger, board_full_run_child_hot_rescue_v0_2_99: true })
      );
    }
  }

  if (!row) {
    row = await first(env.CONTROL_DB,
      `SELECT request_id, chain_id, job_key, worker_name, status, tick_count, input_json
       FROM control_job_queue
       WHERE job_key='board-full-run'
         AND worker_name='alphadog-v2-orchestrator'
         AND status='running'
         AND finished_at IS NULL
         AND datetime(updated_at) <= datetime(CURRENT_TIMESTAMP, '-20 seconds')
       ORDER BY datetime(updated_at) ASC
       LIMIT 1`
    );
    if (row) {
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'INFO', 'board_full_run_running_parent_rescued_as_due', 'Recovered running Board Full Run parent row as due work for backend continuation', ?, CURRENT_TIMESTAMP)",
        row.request_id, WORKER_NAME, row.job_key, JSON.stringify({ request_id: row.request_id, previous_status: row.status, trigger, board_full_run_parent_rescue_v0_2_99: true })
      );
    }
  }

  // v0.2.95: Full Run child rows must be hot-continuation eligible without
  // waiting for the 5-minute cron. If a child was left RUNNING after a bounded
  // child tick, recover only same-chain child rows owned by the active Full Run
  // parent, and only after a small freshness guard. This avoids duplicate active
  // dispatch while preventing the parent from spinning on WAITING_ON_CHILD.
  if (!row) {
    row = await first(env.CONTROL_DB,
      `SELECT c.request_id, c.chain_id, c.job_key, c.worker_name, c.status, c.tick_count, c.input_json
       FROM control_job_queue c
       JOIN control_job_queue p ON p.request_id = c.parent_request_id
       WHERE p.job_key='incremental-morning-full-run'
         AND p.worker_name='alphadog-v2-orchestrator'
         AND p.status IN ('pending','running','partial_continue')
         AND p.finished_at IS NULL
         AND c.parent_request_id IS NOT NULL
         AND c.status='running'
         AND c.finished_at IS NULL
         AND datetime(c.updated_at) <= datetime(CURRENT_TIMESTAMP, '-5 seconds')
       ORDER BY datetime(c.updated_at) ASC
       LIMIT 1`
    );
    if (row) {
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'INFO', 'incremental_morning_full_run_child_running_rescued_as_due', 'Recovered active Full Run child running row as due work for same-chain hot continuation', ?, CURRENT_TIMESTAMP)",
        row.request_id, WORKER_NAME, row.job_key, JSON.stringify({ request_id: row.request_id, previous_status: row.status, trigger, incremental_morning_full_run_child_hot_rescue_v0_2_95: true })
      );
    }
  }

  if (!row) {
    row = await first(env.CONTROL_DB,
      `SELECT request_id, chain_id, job_key, worker_name, status, tick_count, input_json
       FROM control_job_queue
       WHERE job_key='incremental-morning-full-run'
         AND worker_name='alphadog-v2-orchestrator'
         AND status='running'
         AND finished_at IS NULL
         AND datetime(updated_at) <= datetime(CURRENT_TIMESTAMP, '-20 seconds')
       ORDER BY datetime(updated_at) ASC
       LIMIT 1`
    );
    if (row) {
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'INFO', 'incremental_morning_full_run_running_parent_rescued_as_due', 'Recovered running Incremental Morning Full Run parent row as due work for backend continuation', ?, CURRENT_TIMESTAMP)",
        row.request_id, WORKER_NAME, row.job_key, JSON.stringify({ request_id: row.request_id, previous_status: row.status, trigger, incremental_morning_full_run_rescue_v0_2_94: true })
      );
    }
  }

  if (!row) {
    return { status: "no_due_jobs" };
  }

  const runId = rid("run");

  await run(env.CONTROL_DB,
    "UPDATE control_job_queue SET status='running', started_at=COALESCE(started_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP, tick_count=COALESCE(tick_count,0)+1 WHERE request_id=?",
    row.request_id
  );

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'real_orchestrator_tick_started', 'Real orchestrator backend tick started one job', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ trigger, row })
  );

  if (isMarketSourceHealthJob(row)) {
    const output = await processMarketSourceHealthJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_market_source_health_job" : "failed_one_market_source_health_job",
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }

  if (isPrizePicksGithubBoardJob(row)) {
    const output = await processPrizePicksGithubBoardJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_prizepicks_github_board_job" : "failed_one_prizepicks_github_board_job",
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }

  if (isParlaySleeperBoardJob(row)) {
    const output = await processParlaySleeperBoardJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_parlay_sleeper_board_job" : "failed_one_parlay_sleeper_board_job",
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }


  if (isDailyGamesStatusJob(row)) {
    const output = await processDailyGamesStatusJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_daily_game_status_job" : "failed_one_daily_game_status_job",
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }

  if (isBaseHitterGameLogsJob(row)) {
    const output = await processBaseHitterGameLogsJob(env, row, runId, trigger);
    const rawStatus = String((output && output.status) || "").toLowerCase();
    const partial = !!(output && output.ok && (
      rawStatus === "partial_continue" ||
      rawStatus === "partial_continue_base_hitter_game_logs" ||
      rawStatus === "partial_continue_delta_hitter_game_logs" ||
      rawStatus === "source_shape_probe_partial_continue" ||
    rawStatus === "partial_continue_base_team_game_logs" ||
      output.continuation_required === true ||
      output.orchestrator_should_self_continue === true
    ));
    return {
      status: partial ? "partial_continue_base_hitter_game_logs_job" : (output && output.ok ? "completed_one_base_hitter_game_logs_job" : "failed_one_base_hitter_game_logs_job"),
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }


  if (isBaseHitterSplitsJob(row)) {
    const output = await processBaseHitterSplitsJob(env, row, runId, trigger);
    return {
      status: output && output.ok && output.orchestrator_should_self_continue ? "partial_continue_base_hitter_splits_job" : (output && output.ok ? "completed_one_base_hitter_splits_job" : "failed_one_base_hitter_splits_job"),
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }

  if (isBaseHitterMetricsJob(row)) {
    const output = await processBaseHitterMetricsJob(env, row, runId, trigger);
    const rawStatus = String((output && output.status) || "").toLowerCase();
    const partial = !!(output && output.ok && (
      rawStatus === "partial_continue" ||
      rawStatus === "partial_continue_base_hitter_metrics" ||
      output.continuation_required === true ||
      output.orchestrator_should_self_continue === true
    ));
    return {
      status: partial ? "partial_continue_base_hitter_metrics_job" : (output && output.ok ? "completed_one_base_hitter_metrics_job" : "failed_one_base_hitter_metrics_job"),
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }


  if (isBasePitcherMetricsJob(row)) {
    const output = await processBasePitcherMetricsJob(env, row, runId, trigger);
    return {
      status: output && output.ok && output.orchestrator_should_self_continue ? "partial_continue_base_pitcher_metrics_job" : (output && output.ok ? "completed_one_base_pitcher_metrics_job" : "failed_one_base_pitcher_metrics_job"),
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }

  if (isBasePitcherGameLogsJob(row)) {
    const output = await processBasePitcherGameLogsJob(env, row, runId, trigger);
    const rawStatus = String((output && output.status) || "").toLowerCase();
    const partial = !!(output && output.ok && (
      rawStatus === "partial_continue" ||
      rawStatus === "partial_continue_base_pitcher_game_logs" ||
      rawStatus === "partial_continue_base_pitcher_game_logs_stage_only" ||
      output.continuation_required === true ||
      output.orchestrator_should_self_continue === true
    ));
    return {
      status: partial ? "partial_continue_base_pitcher_game_logs_job" : (output && output.ok ? "completed_one_base_pitcher_game_logs_job" : "failed_one_base_pitcher_game_logs_job"),
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }


  if (isBaseTeamGameLogsJob(row)) {
    const output = await processBaseTeamGameLogsJob(env, row, runId, trigger);
    const rawStatus = String((output && output.status) || "").toLowerCase();
    const partial = !!(output && output.ok && (
      rawStatus === "partial_continue" ||
      rawStatus === "partial_continue_base_team_game_logs" ||
      rawStatus === "source_shape_probe_partial_continue" ||
    rawStatus === "partial_continue_base_team_game_logs" ||
      output.continuation_required === true ||
      output.orchestrator_should_self_continue === true
    ));
    return {
      status: partial ? "partial_continue_base_team_game_logs_job" : (output && output.ok ? "completed_one_base_team_game_logs_job" : "failed_one_base_team_game_logs_job"),
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }


  if (isBaseStarterHistoryJob(row)) {
    const output = await processBaseStarterHistoryJob(env, row, runId, trigger);
    const rawStatus = String((output && output.status) || "").toLowerCase();
    const partial = !!(output && output.ok && (
      rawStatus === "partial_continue" ||
      rawStatus === "source_shape_probe_partial_continue" ||
      output.continuation_required === true ||
      output.orchestrator_should_self_continue === true
    ));
    return {
      status: partial ? "partial_continue_base_starter_history_job" : (output && output.ok ? "completed_one_base_starter_history_job" : "failed_one_base_starter_history_job"),
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }


  if (isBaseBullpenHistoryJob(row)) {
    const output = await processBaseBullpenHistoryJob(env, row, runId, trigger);
    const rawStatus = String((output && output.status) || "").toLowerCase();
    const partial = !!(output && output.ok && (
      rawStatus === "partial_continue" ||
      rawStatus === "source_shape_probe_partial_continue" ||
      output.continuation_required === true ||
      output.orchestrator_should_self_continue === true
    ));
    return {
      status: partial ? "partial_continue_base_bullpen_history_job" : (output && output.ok ? "completed_one_base_bullpen_history_job" : "failed_one_base_bullpen_history_job"),
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }

  if (isBasePitcherSplitsJob(row)) {
    const output = await processBasePitcherSplitsJob(env, row, runId, trigger);
    const rawStatus = String((output && output.status) || "").toLowerCase();
    const partial = !!(output && output.ok && (
      rawStatus === "partial_continue" ||
      rawStatus === "partial_continue_base_pitcher_splits" ||
      output.continuation_required === true ||
      output.orchestrator_should_self_continue === true
    ));
    return {
      status: partial ? "partial_continue_base_pitcher_splits_job" : (output && output.ok ? "completed_one_base_pitcher_splits_job" : "failed_one_base_pitcher_splits_job"),
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }

  if (isStaticTeamsJob(row)) {
    const output = await processStaticTeamsJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_static_teams_job" : "failed_one_static_teams_job",
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }

  if (isStaticStadiumsJob(row)) {
    const output = await processStaticStadiumsJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_static_stadiums_job" : "failed_one_static_stadiums_job",
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }

  if (isStaticParkFactorsJob(row)) {
    const output = await processStaticParkFactorsJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_static_park_factors_job" : "failed_one_static_park_factors_job",
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }

  if (isStaticPlayersJob(row)) {
    const output = await processStaticPlayersJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_static_players_job" : "failed_one_static_players_job",
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }


  if (isStaticPropTaxonomyJob(row)) {
    const output = await processStaticPropTaxonomyJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_static_prop_taxonomy_job" : "failed_one_static_prop_taxonomy_job",
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }

  if (isDeltaCertifierJob(row)) {
    const output = await processDeltaCertifierJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_delta_certifier_job" : "failed_one_delta_certifier_job",
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }


  if (isStaticCertifierJob(row)) {
    const output = await processStaticCertifierJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_static_certifier_job" : "failed_one_static_certifier_job",
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }

  if (isBoardFullRunJob(row)) {
    const output = await processBoardFullRunJob(env, row, runId, trigger);
    const rawStatus = String((output && output.status) || "").toLowerCase();
    const status = rawStatus.includes("partial_continue") || output && output.orchestrator_should_self_continue
      ? "partial_continue_board_full_run_job"
      : (output && output.ok ? "completed_one_board_full_run_job" : "failed_one_board_full_run_job");
    return { status, request_id: row.request_id, run_id: runId, output };
  }

  if (isIncrementalMorningFullRunJob(row)) {
    const output = await processIncrementalMorningFullRunJob(env, row, runId, trigger);
    const rawStatus = String((output && output.status) || "").toLowerCase();
    const status = rawStatus.includes("partial_continue") || output && output.orchestrator_should_self_continue
      ? "partial_continue_incremental_morning_full_run_job"
      : (output && output.ok ? "completed_one_incremental_morning_full_run_job" : "failed_one_incremental_morning_full_run_job");
    return { status, request_id: row.request_id, run_id: runId, output };
  }

  if (isStaticFullRunJob(row)) {
    const output = await processStaticFullRunJob(env, row, runId, trigger);
    const status = output && output.status === "partial_continue" ? "partial_continue_static_full_run_job" : (output && output.ok ? "completed_one_static_full_run_job" : "failed_one_static_full_run_job");
    return {
      status,
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }

  if (!isSafeTestJob(row)) {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      status: "unsupported_in_v0_2_16_safe_shell",
      job_key: row.job_key,
      worker_name: row.worker_name,
      note: "v0.2.32 only processes safe system-health, exact market-source-health, exact prizepicks-github-board, exact parlay-sleeper-board source-probe, exact board-full-run backend chain, exact base-hitter-game-logs self-continuing base_backfill, exact base-hitter-splits base promotion and delta no-op/restore gate with backend hot continuation, exact base-hitter-metrics v0.5.1 calendar-tally affected recalc with running partial rescue and snapshot promote/retained-stage delta repair dispatch, exact base-pitcher-metrics v0.4.1 snapshot delta-repair/snapshot-promote/snapshot-prep/full-stage dispatch, exact base-pitcher-game-logs base/delta continuation with bounded tick recovery, exact active static workers, exact static-certifier, and exact static-full-run jobs. Generic dispatch remains blocked. Base Hitter and Base Hitter Splits promotion/delta hot continuation use backend waitUntil, not browser pump; cron is rescue only. Base Pitcher supports locked base promotion and delta_update retained-stage continuation; base promotion makes no MLB calls, delta uses MLB StatsAPI only after base integrity gate."
    };

    await run(env.CONTROL_DB,
      "INSERT INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'blocked_safe_shell', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'unsupported_job_in_v0_2_31', 'Only safe system-health, exact market-source-health, exact prizepicks-github-board, exact parlay-sleeper-board source-probe, exact board-full-run backend chain, exact base-hitter-game-logs self-continuing base_backfill, exact base-hitter-splits base promotion and delta no-op/restore gate with backend hot continuation, exact base-hitter-metrics v0.5.1 calendar-tally affected recalc with running partial rescue and snapshot promote/retained-stage delta repair dispatch, exact base-pitcher-metrics v0.4.1 snapshot delta-repair/snapshot-promote/snapshot-prep/full-stage dispatch, exact base-pitcher-game-logs base/delta continuation with bounded tick recovery, exact active static workers, exact static-certifier, and exact static-full-run jobs are enabled in orchestrator v0.2.32')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );

    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='unsupported_job_in_v0_2_31', error_message='Only safe system-health, exact market-source-health, exact prizepicks-github-board, exact parlay-sleeper-board source-probe, exact board-full-run backend chain, exact base-hitter-game-logs self-continuing base_backfill, exact base-hitter-splits base promotion and delta no-op/restore gate with backend hot continuation, exact base-hitter-metrics v0.5.1 calendar-tally affected recalc with running partial rescue and snapshot promote/retained-stage delta repair dispatch, exact base-pitcher-metrics v0.4.1 snapshot delta-repair/snapshot-promote/snapshot-prep/full-stage dispatch, exact base-pitcher-game-logs base/delta continuation with bounded tick recovery, exact active static workers, exact static-certifier, and exact static-full-run jobs are enabled in orchestrator v0.2.32' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );

    return { status: "blocked_unsupported_job", request_id: row.request_id, run_id: runId, output };
  }

  const output = await processSafeTestJob(env, row, runId, trigger);
  return {
    status: "completed_one_safe_test_job",
    request_id: row.request_id,
    run_id: runId,
    output
  };
}

async function tick(env, trigger = "manual", maxJobs = 3) {
  const owner = rid("owner");
  const lock = await acquireLock(env, owner);

  if (!lock.ok) {
    return base(env, {
      job: "orchestrator_tick",
      status: "lock_busy",
      trigger,
      lock
    });
  }

  const processed = [];
  try {
    const staleRecovery = await recoverStaleStaticPlayersJobs(env, trigger);
    if (staleRecovery.recovered > 0) {
      processed.push({ status: "stale_static_players_recovered", recovered_count: staleRecovery.recovered });
    }

    const baseHitterStaleRecovery = await recoverStaleBaseHitterGameLogsJobs(env, trigger);
    if (baseHitterStaleRecovery.recovered > 0) {
      processed.push({ status: "stale_base_hitter_game_logs_recovered", recovered_count: baseHitterStaleRecovery.recovered });
    }

    const basePitcherStaleRecovery = await recoverStaleBasePitcherGameLogsJobs(env, trigger);
    if (basePitcherStaleRecovery.recovered > 0) {
      processed.push({ status: "stale_base_pitcher_game_logs_recovered", recovered_count: basePitcherStaleRecovery.recovered });
    }

    const baseStarterStaleRecovery = await recoverStaleBaseStarterHistoryJobs(env, trigger);
    if (baseStarterStaleRecovery.recovered > 0) {
      processed.push({ status: "stale_base_starter_history_recovered", recovered_count: baseStarterStaleRecovery.recovered });
    }

    const baseBullpenStaleRecovery = await recoverStaleBaseBullpenHistoryJobs(env, trigger);
    if (baseBullpenStaleRecovery.recovered > 0) {
      processed.push({ status: "stale_base_bullpen_history_recovered", recovered_count: baseBullpenStaleRecovery.recovered });
    }

    const limit = Math.max(1, Math.min(Number(maxJobs || 3), 10));

    for (let i = 0; i < limit; i++) {
      const result = await processOneUnlocked(env, trigger);
      processed.push(result);
      if (result.status === "no_due_jobs") break;
      if (result.status === "blocked_unsupported_job" || result.status === "failed_one_market_source_health_job" || result.status === "failed_one_prizepicks_github_board_job" || result.status === "failed_one_parlay_sleeper_board_job" || result.status === "failed_one_base_hitter_game_logs_job" || result.status === "failed_one_base_hitter_splits_job" || result.status === "failed_one_base_hitter_metrics_job" || result.status === "failed_one_base_pitcher_game_logs_job" || result.status === "failed_one_base_team_game_logs_job" || result.status === "failed_one_base_pitcher_splits_job" || result.status === "failed_one_base_starter_history_job" || result.status === "failed_one_base_bullpen_history_job" || result.status === "failed_one_static_teams_job" || result.status === "failed_one_static_stadiums_job" || result.status === "failed_one_static_park_factors_job" || result.status === "failed_one_static_players_job" || result.status === "failed_one_static_prop_taxonomy_job" || result.status === "failed_one_static_certifier_job" || result.status === "failed_one_delta_certifier_job" || result.status === "failed_one_static_full_run_job" || result.status === "failed_one_incremental_morning_full_run_job" || result.status === "failed_one_board_full_run_job") break;
    }

    await releaseLock(env, owner, "IDLE");

    const completed = processed.filter(x => x.status === "completed_one_safe_test_job" || x.status === "completed_one_market_source_health_job" || x.status === "completed_one_prizepicks_github_board_job" || x.status === "completed_one_parlay_sleeper_board_job" || x.status === "completed_one_base_hitter_game_logs_job" || x.status === "completed_one_base_hitter_splits_job" || x.status === "completed_one_base_hitter_metrics_job" || x.status === "completed_one_base_pitcher_game_logs_job" || x.status === "completed_one_base_team_game_logs_job" || x.status === "completed_one_base_pitcher_splits_job" || x.status === "completed_one_base_starter_history_job" || x.status === "completed_one_base_bullpen_history_job" || x.status === "completed_one_static_teams_job" || x.status === "completed_one_static_stadiums_job" || x.status === "completed_one_static_park_factors_job" || x.status === "completed_one_static_players_job" || x.status === "completed_one_static_prop_taxonomy_job" || x.status === "completed_one_static_certifier_job" || x.status === "completed_one_static_full_run_job" || x.status === "completed_one_incremental_morning_full_run_job" || x.status === "completed_one_board_full_run_job").length;
    const partialContinue = processed.filter(x => x.status === "partial_continue_static_full_run_job" || x.status === "partial_continue_incremental_morning_full_run_job" || x.status === "partial_continue_base_hitter_game_logs_job" || x.status === "partial_continue_base_hitter_splits_job" || x.status === "partial_continue_base_hitter_metrics_job" || x.status === "partial_continue_base_pitcher_game_logs_job" || x.status === "partial_continue_base_team_game_logs_job" || x.status === "partial_continue_base_pitcher_splits_job" || x.status === "partial_continue_base_starter_history_job" || x.status === "partial_continue_base_bullpen_history_job" || x.status === "partial_continue_board_full_run_job").length;
    const blocked = processed.filter(x => x.status === "blocked_unsupported_job" || x.status === "failed_one_market_source_health_job" || x.status === "failed_one_prizepicks_github_board_job" || x.status === "failed_one_parlay_sleeper_board_job" || x.status === "failed_one_base_hitter_game_logs_job" || x.status === "failed_one_base_hitter_splits_job" || x.status === "failed_one_base_hitter_metrics_job" || x.status === "failed_one_base_pitcher_game_logs_job" || x.status === "failed_one_base_team_game_logs_job" || x.status === "failed_one_base_pitcher_splits_job" || x.status === "failed_one_base_starter_history_job" || x.status === "failed_one_base_bullpen_history_job" || x.status === "failed_one_static_teams_job" || x.status === "failed_one_static_stadiums_job" || x.status === "failed_one_static_park_factors_job" || x.status === "failed_one_static_players_job" || x.status === "failed_one_static_prop_taxonomy_job" || x.status === "failed_one_static_certifier_job" || x.status === "failed_one_delta_certifier_job" || x.status === "failed_one_static_full_run_job" || x.status === "failed_one_incremental_morning_full_run_job" || x.status === "failed_one_board_full_run_job").length;
    const noDue = processed.some(x => x.status === "no_due_jobs");

    return base(env, {
      job: "orchestrator_tick",
      status: blocked ? "blocked" : (partialContinue ? "partial_continue" : (completed ? "completed" : (noDue ? "no_due_jobs" : "idle"))),
      trigger,
      max_jobs: limit,
      completed_count: completed,
      partial_continue_count: partialContinue,
      blocked_count: blocked,
      processed
    });
  } catch (err) {
    await releaseLock(env, owner, "ERROR");
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'orchestrator', 'ERROR', 'orchestrator_exception', 'Real orchestrator tick failed', ?, CURRENT_TIMESTAMP)",
      WORKER_NAME, JSON.stringify({ trigger, error: String(err && err.message ? err.message : err) })
    );

    return base(env, {
      job: "orchestrator_tick",
      status: "error",
      trigger,
      error: String(err && err.message ? err.message : err)
    });
  }
}


async function countDueBaseHitterGameLogs(env) {
  const row = await first(env.CONTROL_DB,
    "SELECT COUNT(*) AS c FROM control_job_queue WHERE job_key='base-hitter-game-logs' AND worker_name='alphadog-v2-base-hitter-game-logs' AND status IN ('pending','running','partial_continue') AND finished_at IS NULL"
  );
  return Number(row && row.c ? row.c : 0);
}

async function countDueBaseHitterSplits(env) {
  // Base Hitter Splits is intentionally chunked. Any pending/running row without
  // finished_at is continuation-eligible so the backend waitUntil pump drains the
  // cursor like hitter/pitcher game logs. Manual Wake is only the starter/rescue.
  const row = await first(env.CONTROL_DB,
    "SELECT COUNT(*) AS c FROM control_job_queue WHERE job_key='base-hitter-splits' AND worker_name='alphadog-v2-base-hitter-splits' AND status IN ('pending','running','partial_continue') AND finished_at IS NULL"
  );
  return Number(row && row.c ? row.c : 0);
}

async function countDueBaseHitterMetrics(env) {
  const row = await first(env.CONTROL_DB,
    "SELECT COUNT(*) AS c FROM control_job_queue WHERE job_key='base-hitter-metrics' AND worker_name='alphadog-v2-base-hitter-metrics' AND status IN ('pending','running','partial_continue') AND finished_at IS NULL"
  );
  return Number(row && row.c ? row.c : 0);
}

async function countDueBasePitcherMetrics(env) {
  const row = await first(env.CONTROL_DB,
    "SELECT COUNT(*) AS c FROM control_job_queue WHERE job_key='base-pitcher-metrics' AND worker_name='alphadog-v2-base-pitcher-metrics' AND status IN ('pending','running','partial_continue') AND finished_at IS NULL"
  );
  return Number(row && row.c ? row.c : 0);
}

async function countDueBasePitcherGameLogs(env) {
  const row = await first(env.CONTROL_DB,
    "SELECT COUNT(*) AS c FROM control_job_queue WHERE job_key='base-pitcher-game-logs' AND worker_name='alphadog-v2-base-pitcher-game-logs' AND status IN ('pending','running','partial_continue') AND finished_at IS NULL"
  );
  return Number(row && row.c ? row.c : 0);
}


async function countDueBaseTeamGameLogs(env) {
  const row = await first(env.CONTROL_DB,
    "SELECT COUNT(*) AS c FROM control_job_queue WHERE job_key='base-team-game-logs' AND worker_name='alphadog-v2-base-team-game-logs' AND status IN ('pending','running','partial_continue') AND finished_at IS NULL"
  );
  return Number(row && row.c ? row.c : 0);
}

async function countDueBasePitcherSplits(env) {
  const row = await first(env.CONTROL_DB,
    "SELECT COUNT(*) AS c FROM control_job_queue WHERE job_key='base-pitcher-splits' AND worker_name='alphadog-v2-base-pitcher-splits' AND status IN ('pending','running','partial_continue') AND finished_at IS NULL"
  );
  return Number(row && row.c ? row.c : 0);
}

async function countDueBaseStarterHistory(env) {
  const row = await first(env.CONTROL_DB,
    "SELECT COUNT(*) AS c FROM control_job_queue WHERE job_key='base-starter-history' AND worker_name='alphadog-v2-base-starter-history' AND status IN ('pending','running','partial_continue') AND finished_at IS NULL"
  );
  return Number(row && row.c ? row.c : 0);
}


async function countDueBaseBullpenHistory(env) {
  const row = await first(env.CONTROL_DB,
    "SELECT COUNT(*) AS c FROM control_job_queue WHERE job_key='base-bullpen-history' AND worker_name='alphadog-v2-base-bullpen-history' AND status IN ('pending','running','partial_continue') AND finished_at IS NULL"
  );
  return Number(row && row.c ? row.c : 0);
}

async function countDueBoardFullRun(env) {
  const row = await first(env.CONTROL_DB,
    "SELECT COUNT(*) AS c FROM control_job_queue WHERE job_key='board-full-run' AND worker_name='alphadog-v2-orchestrator' AND status IN ('pending','running','partial_continue') AND finished_at IS NULL"
  );
  return Number(row && row.c ? row.c : 0);
}

async function countDueIncrementalMorningFullRun(env) {
  const row = await first(env.CONTROL_DB,
    "SELECT COUNT(*) AS c FROM control_job_queue WHERE job_key='incremental-morning-full-run' AND worker_name='alphadog-v2-orchestrator' AND status IN ('pending','running','partial_continue') AND finished_at IS NULL"
  );
  return Number(row && row.c ? row.c : 0);
}

async function countDueStaticPlayers(env) {
  // Static Players is intentionally chunked. For this specific job, any pending/running
  // row without a finished_at must be treated as continuation-eligible, even if run_after
  // landed on the same second as the current pump completion. This prevents a 24/30 stop
  // when the bounded pump exits just before SQLite datetime('now') crosses run_after.
  const row = await first(env.CONTROL_DB,
    "SELECT COUNT(*) AS c FROM control_job_queue WHERE job_key='static-players' AND worker_name='alphadog-v2-static-players' AND status IN ('pending','running','partial_continue') AND finished_at IS NULL"
  );
  return Number(row && row.c ? row.c : 0);
}

async function pump(env, trigger = "auto_pump", maxCycles = 10, maxJobsPerCycle = 1, maxMs = 65000, ctx = null, requestUrl = null, pumpDepth = 0, maxPumpChains = 12) {
  const started = Date.now();
  const cycles = [];
  const hardCycles = Math.max(1, Math.min(Number(maxCycles || 10), 18));
  // v0.2.22: one job per cycle is intentional. It prevents overlapping same-row dispatches
  // while still allowing immediate backend continuation between micro-ticks.
  const jobsPerCycle = Math.max(1, Math.min(Number(maxJobsPerCycle || 1), 1));
  // Wall-clock budget, not CPU budget. Each service-binding tick remains bounded by the worker.
  // This lets the backend drain several micro-ticks in one orchestrator ownership window instead
  // of waiting for the 5-minute cron cadence.
  const deadlineMs = Math.max(15000, Math.min(Number(maxMs || 65000), 75000));
  const depth = Math.max(0, Math.min(Number(pumpDepth || 0), 20));
  const maxChains = Math.max(0, Math.min(Number(maxPumpChains || 12), 30));

  for (let i = 0; i < hardCycles; i++) {
    if (Date.now() - started >= deadlineMs) {
      cycles.push({ status: "pump_deadline_reached", elapsed_ms: Date.now() - started });
      break;
    }

    const result = await tick(env, `${trigger}:pump_cycle_${i + 1}`, jobsPerCycle);
    cycles.push(result);

    const status = String(result && result.status ? result.status : "");
    const processed = Array.isArray(result && result.processed) ? result.processed : [];
    const noDue = status === "no_due_jobs" || processed.some(x => x && x.status === "no_due_jobs");
    const blocked = status === "blocked" || status === "error" || processed.some(x => x && String(x.status || "").startsWith("failed_"));
    const lockBusy = status === "lock_busy";

    if (noDue || blocked || lockBusy) break;
  }

  const dueIncrementalMorningFullRun = await countDueIncrementalMorningFullRun(env);
  const dueBoardFullRun = await countDueBoardFullRun(env);
  const dueStaticPlayers = await countDueStaticPlayers(env);
  const dueBaseHitterGameLogs = await countDueBaseHitterGameLogs(env);
  const dueBaseHitterSplits = await countDueBaseHitterSplits(env);
  const dueBaseHitterMetrics = await countDueBaseHitterMetrics(env);
  const dueBasePitcherMetrics = await countDueBasePitcherMetrics(env);
  const dueBasePitcherGameLogs = await countDueBasePitcherGameLogs(env);
  const dueBaseTeamGameLogs = await countDueBaseTeamGameLogs(env);
  const dueBasePitcherSplits = await countDueBasePitcherSplits(env);
  const dueBaseStarterHistory = await countDueBaseStarterHistory(env);
  const dueBaseBullpenHistory = await countDueBaseBullpenHistory(env);

  // v0.2.85: Never self-schedule an immediate waitUntil continuation after a
  // lock_busy/error/blocked cycle. The previous v0.2.83/v0.2.84 path could see
  // an unfinished Pitcher Splits running row, count it as due, then recursively
  // schedule more backend pumps even though GLOBAL_ORCHESTRATOR was still held.
  // That created noisy hot-loop storms and left the real continuation waiting
  // for lock expiry. Cron/manual wake can safely retry after the lock expires;
  // normal partial_continue cycles still self-continue.
  const terminalStatuses = cycles.map(c => String((c && c.status) || ""));
  const sawLockBusy = terminalStatuses.includes("lock_busy");
  const sawHardStop = terminalStatuses.some(s => s === "blocked" || s === "error");
  const continuationAllowedByLastCycle = !sawLockBusy && !sawHardStop;
  const shouldSelfContinue = continuationAllowedByLastCycle && (dueIncrementalMorningFullRun > 0 || dueBoardFullRun > 0 || dueStaticPlayers > 0 || dueBaseHitterGameLogs > 0 || dueBaseHitterSplits > 0 || dueBaseHitterMetrics > 0 || dueBasePitcherMetrics > 0 || dueBasePitcherGameLogs > 0 || dueBaseTeamGameLogs > 0 || dueBasePitcherSplits > 0 || dueBaseStarterHistory > 0 || dueBaseBullpenHistory > 0) && depth < maxChains && !!ctx;
  const lastCycle = cycles.length ? cycles[cycles.length - 1] : null;
  const lastStatus = String((lastCycle && lastCycle.status) || "");
  const hotContinuationDelayMs = shouldSelfContinue && lastStatus === "no_due_jobs" ? 6500 : 0;

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'orchestrator', 'INFO', 'orchestrator_auto_pump_completed', 'Orchestrator auto-pump completed bounded continuation loop', ?, CURRENT_TIMESTAMP)",
    WORKER_NAME, JSON.stringify({
      trigger,
      max_cycles: hardCycles,
      max_jobs_per_cycle: jobsPerCycle,
      elapsed_ms: Date.now() - started,
      cycle_count: cycles.length,
      due_incremental_morning_full_run_after_pump: dueIncrementalMorningFullRun,
      due_board_full_run_after_pump: dueBoardFullRun,
      due_static_players_after_pump: dueStaticPlayers,
      due_base_hitter_game_logs_after_pump: dueBaseHitterGameLogs,
      due_base_hitter_splits_after_pump: dueBaseHitterSplits,
      due_base_hitter_metrics_after_pump: dueBaseHitterMetrics,
      due_base_pitcher_metrics_after_pump: dueBasePitcherMetrics,
      due_base_pitcher_game_logs_after_pump: dueBasePitcherGameLogs,
      due_base_team_game_logs_after_pump: dueBaseTeamGameLogs,
      due_base_pitcher_splits_after_pump: dueBasePitcherSplits,
      due_base_starter_history_after_pump: dueBaseStarterHistory,
      due_base_bullpen_history_after_pump: dueBaseBullpenHistory,
      pump_depth: depth,
      max_pump_chains: maxChains,
      self_continue_scheduled: !!shouldSelfContinue,
      self_continue_delay_ms: hotContinuationDelayMs,
      full_run_hot_continuation_v0_2_95: true,
      self_continue_suppressed_due_to_lock_busy: !!sawLockBusy,
      self_continue_suppressed_due_to_hard_stop: !!sawHardStop,
      continuation_allowed_by_last_cycle: !!continuationAllowedByLastCycle,
      hot_continuation_loop_v0_2_5: true, watchdog_hot_loop_v0_2_6: true,
      cron_is_rescue_only_for_base_hitter: true, cron_is_rescue_only_for_base_hitter_splits: true, base_hitter_splits_hot_continuation_v0_2_32: true, base_pitcher_splits_hot_continuation_v0_2_35: true,
      version: SYSTEM_VERSION
    })
  );

  if (shouldSelfContinue) {
    const nextSource = `${trigger}:direct_waituntil_hot_continue_${depth + 1}`;
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'orchestrator', 'INFO', 'orchestrator_direct_waituntil_self_continue_scheduled', 'Scheduled direct backend waitUntil continuation for due work; v0.2.22 watchdog-compatible hot loop', ?, CURRENT_TIMESTAMP)",
      WORKER_NAME, JSON.stringify({
        trigger,
        next_source: nextSource,
        due_incremental_morning_full_run_after_pump: dueIncrementalMorningFullRun,
      due_board_full_run_after_pump: dueBoardFullRun,
        due_static_players_after_pump: dueStaticPlayers,
        due_base_hitter_game_logs_after_pump: dueBaseHitterGameLogs,
        due_base_hitter_splits_after_pump: dueBaseHitterSplits,
        due_base_hitter_metrics_after_pump: dueBaseHitterMetrics,
        due_base_pitcher_metrics_after_pump: dueBasePitcherMetrics,
        due_base_pitcher_game_logs_after_pump: dueBasePitcherGameLogs,
      due_base_team_game_logs_after_pump: dueBaseTeamGameLogs,
      due_base_pitcher_splits_after_pump: dueBasePitcherSplits,
      due_base_starter_history_after_pump: dueBaseStarterHistory,
      due_base_bullpen_history_after_pump: dueBaseBullpenHistory,
        pump_depth: depth,
        next_pump_depth: depth + 1,
        max_pump_chains: maxChains,
        max_cycles: hardCycles,
        max_jobs_per_cycle: jobsPerCycle,
        max_ms: deadlineMs,
        self_continue_delay_ms: hotContinuationDelayMs,
        full_run_hot_continuation_v0_2_95: true,
        continuation_allowed_by_last_cycle: !!continuationAllowedByLastCycle,
        self_continue_suppressed_due_to_lock_busy: !!sawLockBusy,
        self_continue_suppressed_due_to_hard_stop: !!sawHardStop,
        version: SYSTEM_VERSION,
        hot_continuation_loop_v0_2_5: true, watchdog_hot_loop_v0_2_6: true,
        no_browser_pump: true,
        cron_rescue_only: true,
        base_hitter_splits_hot_continuation_v0_2_32: true
      })
    );
    ctx.waitUntil((async () => {
      try {
        if (hotContinuationDelayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, hotContinuationDelayMs));
        }
        await pump(env, nextSource, hardCycles, jobsPerCycle, deadlineMs, ctx, requestUrl, depth + 1, maxChains);
      } catch (err) {
        await run(env.CONTROL_DB,
          "INSERT INTO control_worker_run_log (worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'orchestrator', 'ERROR', 'orchestrator_auto_pump_self_continue_failed', 'Direct waitUntil self-continuing pump failed', ?, CURRENT_TIMESTAMP)",
          WORKER_NAME, JSON.stringify({ error: String(err && err.message ? err.message : err), version: SYSTEM_VERSION, direct_waituntil_continuation_v0_2_4: true, hot_continuation_loop_v0_2_5: true, watchdog_hot_loop_v0_2_6: true })
        );
      }
    })());
  }

  const last = cycles.length ? cycles[cycles.length - 1] : null;
  return base(env, {
    job: "orchestrator_auto_pump",
    status: last && last.status ? last.status : "pump_no_cycles",
    trigger,
    max_cycles: hardCycles,
    max_jobs_per_cycle: jobsPerCycle,
    elapsed_ms: Date.now() - started,
    hot_continuation_loop_v0_2_5: true, watchdog_hot_loop_v0_2_6: true,
    cycle_count: cycles.length,
    due_incremental_morning_full_run_after_pump: dueIncrementalMorningFullRun,
      due_board_full_run_after_pump: dueBoardFullRun,
    due_static_players_after_pump: dueStaticPlayers,
    due_base_hitter_game_logs_after_pump: dueBaseHitterGameLogs,
    due_base_hitter_splits_after_pump: dueBaseHitterSplits,
    due_base_hitter_metrics_after_pump: dueBaseHitterMetrics,
    due_base_pitcher_metrics_after_pump: dueBasePitcherMetrics,
    due_base_pitcher_game_logs_after_pump: dueBasePitcherGameLogs,
    due_base_team_game_logs_after_pump: dueBaseTeamGameLogs,
    due_base_pitcher_splits_after_pump: dueBasePitcherSplits,
    due_base_starter_history_after_pump: dueBaseStarterHistory,
    due_base_bullpen_history_after_pump: dueBaseBullpenHistory,
    self_continue_scheduled: !!shouldSelfContinue,
    self_continue_delay_ms: hotContinuationDelayMs,
    full_run_hot_continuation_v0_2_95: true,
    pump_depth: depth,
    max_pump_chains: maxChains,
    cycles
  });
}

async function parseJson(request) {
  try { return await request.json(); } catch (_) { return {}; }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return jsonResponse({ ok: true });

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return jsonResponse(base(env, { route: url.pathname }));
    }

    if (request.method === "GET" && url.pathname === "/status") {
      return jsonResponse(await statusPayload(env));
    }

    if (request.method === "GET" && url.pathname === "/logs") {
      return jsonResponse(await logsPayload(env));
    }

    if (request.method === "POST" && url.pathname === "/enqueue-test") {
      return jsonResponse(await enqueueTest(env, "orchestrator_http"));
    }

    if (request.method === "POST" && (url.pathname === "/pump" || url.pathname === "/auto-pump" || url.pathname === "/tasks/pump")) {
      const body = await parseJson(request);
      const maxCycles = body.max_cycles || body.maxCycles || 12;
      const maxJobsPerCycle = body.max_jobs_per_cycle || body.maxJobsPerCycle || 1;
      const maxMs = body.max_ms || body.maxMs || 90000;
      const source = body.source || "http_auto_pump";
      const pumpDepth = body.pump_depth || body.pumpDepth || 0;
      const maxPumpChains = body.max_pump_chains || body.maxPumpChains || 6;
      return jsonResponse(await pump(env, source, maxCycles, maxJobsPerCycle, maxMs, ctx, request.url, pumpDepth, maxPumpChains));
    }

    if (request.method === "POST" && (url.pathname === "/tick" || url.pathname === "/run" || url.pathname === "/tasks/tick")) {
      const body = await parseJson(request);
      const maxJobs = body.max_jobs || body.maxJobs || 3;
      // v0.2.51: Control Room Wake may request a backend budget loop. This is not a browser loop;
      // it runs the same orchestrator-owned pump/waitUntil continuation used by the locked base workers.
      if (body.auto_pump || body.pump || body.backend_budget_loop_requested) {
        return jsonResponse(await pump(env, "http_manual_wake_auto_pump", body.max_cycles || 18, body.max_jobs_per_cycle || maxJobs || 1, body.max_ms || 70000, ctx, request.url, body.pump_depth || 0, body.max_pump_chains || 30));
      }
      return jsonResponse(await tick(env, "http_manual_wake", maxJobs));
    }

    return jsonResponse({ ok: false, data_ok: false, version: SYSTEM_VERSION, error: "not_found", path: url.pathname }, 404);
  },

  async scheduled(event, env, ctx) {
    const cronExpression = event && event.cron ? String(event.cron) : "unknown";
    ctx.waitUntil((async () => {
      await enqueueStaticPlayersWeeklyIfDue(env, cronExpression);
      await enqueueScheduledIncrementalMorningFullRunIfDue(env, cronExpression);
      await enqueueScheduledBoardFullRunIfDue(env, cronExpression);
      await pump(env, `cron:${cronExpression}`, 10, 1, 65000, ctx, "https://alphadog-v2-orchestrator.rodolfoaamattos.workers.dev/scheduled", 0, 12);
    })());
  }
};
