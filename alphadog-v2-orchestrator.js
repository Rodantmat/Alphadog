const SYSTEM_VERSION = "alphadog-v2-orchestrator-v0.2.238-player-baseline-stale-running-auto-resume";
const WORKER_NAME = "alphadog-v2-orchestrator";
// v0.2.165: non-scoring dispatch paths must never reference an undefined scoring-only flag.
const isSimulationJob = false; // GLOBAL_NON_SCORING_SIMULATION_JOB_FLAG_V0_2_165

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


function limitTextForD1(value, maxLen = 1500) {
  const text = String(value == null ? "" : value);
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + `...[truncated ${text.length - maxLen} chars]`;
}

function compactValueForD1(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === "string") return limitTextForD1(value, depth <= 1 ? 2400 : 1200);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const kept = value.slice(0, 3).map(v => compactValueForD1(v, depth + 1));
    if (value.length > kept.length) kept.push({ __truncated_array_items: value.length - kept.length });
    return kept;
  }
  if (typeof value === "object") {
    if (depth >= 5) return { __truncated_object: true };
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (["raw_json", "raw", "html", "body", "response_body", "source_json", "payload", "full_response"].includes(k)) {
        out[k + "_preview"] = limitTextForD1(typeof v === "string" ? v : JSON.stringify(v || null), 900);
        out[k + "_truncated"] = true;
        continue;
      }
      out[k] = compactValueForD1(v, depth + 1);
    }
    return out;
  }
  return limitTextForD1(value, 900);
}

function safeStringifyD1(value, maxBytes = 60000) {
  let compact = compactValueForD1(value);
  let json = JSON.stringify(compact);
  if (json.length <= maxBytes) return json;
  const fallback = {
    ok: !!(value && value.ok),
    data_ok: !!(value && value.data_ok),
    version: value && value.version || null,
    worker_name: value && value.worker_name || null,
    job_key: value && value.job_key || null,
    request_id: value && value.request_id || null,
    chain_id: value && value.chain_id || null,
    status: value && value.status || "output_compacted_for_d1",
    certification: value && value.certification || null,
    certification_grade: value && value.certification_grade || null,
    certification_reason: limitTextForD1(value && value.certification_reason || "", 1500),
    error: limitTextForD1(value && value.error || "", 1500),
    rows_read: Number(value && value.rows_read || 0),
    rows_staged: Number(value && value.rows_staged || 0),
    rows_promoted: Number(value && (value.rows_promoted || value.promoted_rows_written) || 0),
    rows_written: Number(value && value.rows_written || 0),
    future_pickable_rows: Number(value && value.future_pickable_rows || 0),
    expired_or_started_rows: Number(value && value.expired_or_started_rows || 0),
    mlb_rows: Number(value && value.mlb_rows || 0),
    valid_rows: Number(value && value.valid_rows || 0),
    invalid_rows: Number(value && value.invalid_rows || 0),
    external_calls: Number(value && (value.external_calls_performed || value.external_calls) || 0),
    source_refresh_dispatch: compactValueForD1(value && value.source_refresh_dispatch || null),
    source_refresh_wait: compactValueForD1(value && value.source_refresh_wait || null),
    orchestrator_dispatch: compactValueForD1(value && value.orchestrator_dispatch || null),
    d1_output_compacted: true,
    original_json_chars_after_first_compact: json.length,
    no_scoring: value && value.no_scoring !== false,
    no_ranking: value && value.no_ranking !== false,
    no_final_board_write: value && value.no_final_board_write !== false
  };
  return JSON.stringify(fallback);
}

function compactPrizePicksOutputForD1(output) {
  const compact = compactValueForD1(output || {});
  const firstJson = JSON.stringify(compact);
  if (firstJson.length <= 60000) return compact;
  return JSON.parse(safeStringifyD1(output || {}, 60000));
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

const EXACT_WORKER_SERVICE_TIMEOUT_MS = 75000;
const DAILY_CONTEXT_EXACT_WORKER_TIMEOUT_MS = 45000;

function timeoutSignal(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  if (typeof AbortController === "undefined") return undefined;
  const controller = new AbortController();
  setTimeout(() => { try { controller.abort("timeout"); } catch (_) {} }, ms);
  return controller.signal;
}

async function promiseWithTimeout(promise, timeoutMs, label = "operation_timeout") {
  const ms = Math.max(1000, Number(timeoutMs || EXACT_WORKER_SERVICE_TIMEOUT_MS));
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_after_${ms}ms`)), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function serviceBindingFetch(binding, url, init = {}, label = "worker", timeoutMs = EXACT_WORKER_SERVICE_TIMEOUT_MS) {
  const ms = Math.max(1000, Number(timeoutMs || EXACT_WORKER_SERVICE_TIMEOUT_MS));
  try {
    const resp = await promiseWithTimeout(binding.fetch(url, { ...init, signal: timeoutSignal(ms) }), ms + 500, `${label}_service_binding_timeout`);
    return {
      ok: resp.ok,
      status: resp.status,
      headers: resp.headers,
      text: () => promiseWithTimeout(resp.text(), Math.min(20000, ms), `${label}_service_binding_body_timeout`)
    };
  } catch (err) {
    const raw = String(err && (err.name || err.message) ? (err.name || err.message) : err);
    if (raw.toLowerCase().includes("abort") || raw.toLowerCase().includes("timeout")) {
      throw new Error(`${label}_service_binding_timeout_after_${ms}ms`);
    }
    throw err;
  }
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
      "v0.2.60 processes safe system-health, exact market-source-health, exact prizepicks-github-board, exact parlay-sleeper-board source-probe, exact board-full-run backend chain, exact base-hitter-game-logs self-continuing base_backfill with stale running recovery, exact base-hitter-splits base promotion and delta no-op/restore gate with backend hot continuation, exact base-hitter-metrics v0.4.1 snapshot promote/retained-stage delta repair dispatch, exact base-pitcher-metrics v0.4.1 snapshot delta-repair/snapshot-promote/snapshot-prep/full-stage dispatch, exact base-pitcher-game-logs base/delta continuation with stale running recovery, exact base-team-game-logs, exact base-starter-history, exact base-bullpen-history v0.4.0 source probe/base stage/promote-clean/delta-update, exact active static workers, exact static-certifier read-only validation, exact static-full-run backend chain, exact delta-certifier calendar/tally dispatch, and exact incremental-morning-full-run backend chain with pre/post calendar-tally gates only.",
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
      DAILY_SCHEDULE_WORKER: !!env.DAILY_SCHEDULE_WORKER,
      DAILY_PROBABLE_PITCHERS_WORKER: !!env.DAILY_PROBABLE_PITCHERS_WORKER,
      DAILY_LINEUPS_WORKER: !!env.DAILY_LINEUPS_WORKER,
      DAILY_PLAYER_AVAILABILITY_WORKER: !!env.DAILY_PLAYER_AVAILABILITY_WORKER,
      DAILY_WEATHER_WORKER: !!env.DAILY_WEATHER_WORKER,
      DAILY_BULLPEN_AVAILABILITY_WORKER: !!env.DAILY_BULLPEN_AVAILABILITY_WORKER,
      DELTA_CERTIFIER_WORKER: !!env.DELTA_CERTIFIER_WORKER,
      MARKET_SOURCE_HEALTH_WORKER: !!env.MARKET_SOURCE_HEALTH_WORKER,
      MARKET_NORMALIZER_WORKER: !!env.MARKET_NORMALIZER_WORKER,
      MARKET_LINE_SHAPE_CLASSIFIER_WORKER: !!env.MARKET_LINE_SHAPE_CLASSIFIER_WORKER,
      ODDSAPI_REFERENCE_WORKER: !!env.ODDSAPI_REFERENCE_WORKER,
      PHASE2B_RECENT_FORM_WORKER: !!env.PHASE2B_RECENT_FORM_WORKER,
      PHASE2B_PITCHER_ROLE_WORKER: !!env.PHASE2B_PITCHER_ROLE_WORKER,
      SCORE_AUDIT_WORKER: !!env.SCORE_AUDIT_WORKER
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

function isMarketContextSourceProbeJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "market-normalizer" && worker === "alphadog-v2-market-normalizer";
}


function isMarketHitterPropContextJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "market-line-shape-classifier" && worker === "alphadog-v2-market-line-shape-classifier";
}


function isOddsApiHitterPropContextJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "oddsapi-reference" && worker === "alphadog-v2-oddsapi-reference";
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

function isDailyTeamScheduleSpotJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "daily-team-schedule-spot" && worker === "alphadog-v2-daily-schedule";
}

function isDailyProbablePitchersJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "daily-probable-pitchers" && worker === "alphadog-v2-daily-probable-pitchers";
}

function isDailyLineupsJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "daily-lineups" && worker === "alphadog-v2-daily-lineups";
}

function isDailyPlayerAvailabilityJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "daily-player-availability" && worker === "alphadog-v2-daily-player-availability";
}

function isDailyWeatherJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "daily-weather" && worker === "alphadog-v2-daily-weather";
}

function isDailyBullpenAvailabilityJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "daily-bullpen-availability" && worker === "alphadog-v2-daily-bullpen-availability";
}

function isDailyUmpireContextJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "daily-umpire-context" && worker === "alphadog-v2-daily-usage-pulse";
}

function isDailyContextCertifierJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "daily-certifier" && worker === "alphadog-v2-daily-certifier";
}

function isDailyContextFullRunJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "daily-context-full-run" && worker === "alphadog-v2-orchestrator";
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

function isMarketScoringFullRunJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "market-scoring-full-run" && worker === "alphadog-v2-orchestrator";
}

function isDailyFullRunJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "daily-full-run" && worker === "alphadog-v2-orchestrator";
}

function isScorePrepJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "score-prep" && worker === "alphadog-v2-score-prep";
}

function isPropFactorMinerJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "prop-factor-miner" && worker === "alphadog-v2-phase2b-recent-form";
}

function isPropMatrixBuilderJob(row) {
  const job = String(row.job_key || "");
  const worker = String(row.worker_name || "");
  return job === "prop-matrix-builder" && worker === "alphadog-v2-phase2b-certifier";
}

function isScoringEngineJob(row) {
  const job = String(row && row.job_key || "");
  const worker = String(row && row.worker_name || "");
  return (job === "scoring-engine" || job === "scoring-engine-simulation" || job === "hit-probability") && worker === "alphadog-v2-score-audit";
}

function isScoreFinalBoardJob(row) {
  const job = String(row && row.job_key || "");
  const worker = String(row && row.worker_name || "");
  return job === "score-final-board" && worker === "alphadog-v2-score-final-board";
}

function isPlayerBaselineSanityJob(row) {
  const job = String(row && row.job_key || "");
  const worker = String(row && row.worker_name || "");
  return (job === "player-baseline-sanity" || job === "player-baseline-hp") && worker === "alphadog-v2-phase2b-pitcher-role";
}

const BOARD_FULL_RUN_LOCK_KEY = "BOARD_FULL_RUN";
const BOARD_FULL_RUN_STALE_MINUTES = 20;

const BOARD_FULL_RUN_STAGES = [
  { stage_key: "board_prizepicks_refresh", job_key: "prizepicks-github-board", worker_name: "alphadog-v2-prizepicks-github-board", display_name: "PrizePicks Board Refresh", visible_button: "BOARD > PrizePicks", mode: "board_full_run_prizepicks_refresh", worker_group: "Board", phase_key: "board", priority: 4 },
  { stage_key: "board_sleeper_refresh", job_key: "parlay-sleeper-board", worker_name: "alphadog-v2-parlay-sleeper-board", display_name: "Sleeper Board Refresh", visible_button: "BOARD > Sleeper", mode: "board_full_run_sleeper_refresh", worker_group: "Board", phase_key: "board", priority: 4 },
  { stage_key: "score_prep_enrichment", job_key: "score-prep", worker_name: "alphadog-v2-score-prep", display_name: "Score Prep Board Enrichment", visible_button: "SCORE PREP > Board Enrichment", mode: "board_full_run_score_prep_enrichment", worker_group: "Score", phase_key: "score_prep", priority: 5 }
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
    score_prep_required: stage.job_key === "score-prep",
    score_prep_after_board_refresh: stage.job_key === "score-prep",
    writes_score_prepared_board_only: stage.job_key === "score-prep",
    no_prizepicks_mutation: stage.job_key !== "prizepicks-github-board",
    no_sleeper_mutation: stage.job_key !== "parlay-sleeper-board",
    no_market_board_mutation: stage.job_key === "score-prep",
    no_raw_board_delete: stage.job_key === "score-prep",
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

function childPassedBoardFullRun(stage, child, priorStageReports = []) {
  if (!child) return { pass: false, wait: false, reason: "child_missing" };
  const status = String(child.status || "");
  if (["pending", "running", "partial_continue"].includes(status) && !child.finished_at) return { pass: false, wait: true, reason: "child_active", child_status: status };
  const output = parseJsonSafeText(child.output_json || "{}", {});
  const cert = String(output.certification || "");

  // PrizePicks is a required Board Full Run source. If the GitHub JSON is stale/no-future,
  // the PrizePicks worker may clear stale current rows and dispatch the GitHub scraper, but
  // the parent chain must stop and require a later fresh consumer run. Do not continue
  // to Score Prep with only Sleeper inventory.
  if (stage.job_key === "prizepicks-github-board") {
    if (["pending", "running", "partial_continue"].includes(status) && !child.finished_at) {
      return { pass: false, wait: true, reason: "child_active", child_status: status };
    }
    if (status !== "completed") {
      return { pass: false, wait: false, transient: false, reason: String(child.error_message || child.error_code || "prizepicks_required_stage_not_completed").slice(0, 900), certification: cert || String(child.error_code || "prizepicks_required_stage_failed"), child_status: status, child_error_code: child.error_code || null, child_error_message: child.error_message || null, output };
    }
    if (!output || output.ok !== true || output.data_ok !== true) {
      return { pass: false, wait: false, transient: false, reason: "prizepicks_required_stage_output_not_ok", certification: cert || "prizepicks_required_stage_output_not_ok", output_ok: output && output.ok, data_ok: output && output.data_ok, output };
    }
    if (cert === "PRIZEPICKS_SOURCE_STALE_NO_FUTURE_PICKABLE_ROWS") {
      const dispatch = output.source_refresh_dispatch || null;
      const activeBoardCleared = !!(output.promotion && output.promotion.active_board_cleared === true);
      const rowsRead = Number(output.rows_read || 0);
      const futureRows = Number(output.future_pickable_rows || 0);
      const expiredRows = Number(output.expired_or_started_rows || 0);
      const sourceRefreshOk = !dispatch || dispatch.ok === true;

      // v0.2.212: A fetched PrizePicks source with zero future MLB rows is a legitimate
      // late-slate/no-future-board state, not a Board Full infrastructure failure, provided
      // the worker proved the source was fetched/parsed, stale current rows were cleared, and
      // no stale PrizePicks rows can flow into Score Prep. Continue to Sleeper + Score Prep;
      // Score Prep/final parity must then prove zero PrizePicks current rows and a fresh prep batch.
      if (output.ok === true && output.data_ok === true && activeBoardCleared && rowsRead > 0 && futureRows === 0 && expiredRows > 0 && sourceRefreshOk) {
        return {
          pass: true,
          wait: false,
          transient: false,
          certification: cert,
          reason: "prizepicks_no_future_rows_nonfatal_current_cleared_continue_sleeper_score_prep",
          prizepicks_stale_cleared: true,
          prizepicks_nonfatal_warning: true,
          prizepicks_stage_nonfatal: true,
          source_refresh_dispatch: dispatch,
          source_refresh_dispatch_ok: dispatch && dispatch.ok === true,
          source_refresh_dispatch_error: dispatch && dispatch.error ? dispatch.error : null,
          data_ok: output.data_ok,
          rows_read: rowsRead,
          rows_written: output.rows_written || 0,
          rows_promoted: 0,
          future_pickable_rows: futureRows,
          expired_or_started_rows: expiredRows,
          external_calls: output.external_calls_performed || output.external_calls || 0,
          output
        };
      }

      return {
        pass: false,
        wait: false,
        transient: false,
        certification: cert,
        reason: dispatch && dispatch.ok === true ? "prizepicks_source_stale_refresh_dispatched_required_fresh_consumer_rerun" : "prizepicks_source_stale_no_future_pickable_rows_required_stage",
        prizepicks_stale_cleared: activeBoardCleared,
        source_refresh_dispatch: dispatch,
        source_refresh_dispatch_ok: dispatch && dispatch.ok === true,
        source_refresh_dispatch_error: dispatch && dispatch.error ? dispatch.error : null,
        data_ok: output.data_ok,
        rows_read: output.rows_read || 0,
        rows_written: output.rows_written || 0,
        rows_promoted: output.rows_promoted || output.promoted_rows_written || 0,
        future_pickable_rows: output.future_pickable_rows || 0,
        expired_or_started_rows: output.expired_or_started_rows || 0,
        external_calls: output.external_calls_performed || output.external_calls || 0,
        output
      };
    }
    if (cert !== "promoted_current_board") {
      return { pass: false, wait: false, transient: false, certification: cert, reason: "prizepicks_unexpected_certification_required_stage", rows_read: output.rows_read || 0, rows_written: output.rows_written || 0, rows_promoted: output.rows_promoted || output.promoted_rows_written || 0, future_pickable_rows: output.future_pickable_rows || 0, expired_or_started_rows: output.expired_or_started_rows || 0, external_calls: output.external_calls_performed || output.external_calls || 0, output };
    }
    if (Number(output.rows_promoted || 0) <= 0) {
      return { pass: false, wait: false, transient: false, certification: cert, reason: "prizepicks_rows_promoted_zero_required_stage", rows_promoted: output.rows_promoted || 0, output };
    }
    if (Number(output.future_pickable_rows || 0) <= 0) {
      return { pass: false, wait: false, transient: false, certification: cert, reason: "prizepicks_future_pickable_zero_required_stage", future_pickable_rows: output.future_pickable_rows || 0, output };
    }
    if (output.no_scoring === false || output.no_ranking === false || output.no_final_board_write === false) return { pass: false, reason: "prizepicks_unsafe_downstream_flag_false" };
  }

  if (status !== "completed") return { pass: false, transient: status === "failed" || status === "blocked", reason: "child_not_completed", child_status: status, child_error_code: child.error_code || null };
  if (!output || output.ok !== true) return { pass: false, reason: "child_output_ok_not_true", output_ok: output && output.ok };
  if (output.data_ok !== true) return { pass: false, reason: "child_data_ok_not_true", data_ok: output && output.data_ok };
  if (stage.job_key === "parlay-sleeper-board") {
    if (cert !== "PARLAY_SLEEPER_BOARD_INVENTORY_PROMOTED_NO_SCORING") return { pass: false, reason: "sleeper_not_promoted_inventory_only", certification: cert };
    const currentRows = Number(output.current_rows_written || output.promoted_rows_written || (output.stage_only_result && output.stage_only_result.current_rows_written) || 0);
    const activeRows = Number(output.active_batch_rows_written || (output.stage_only_result && output.stage_only_result.active_batch_rows_written) || (output.stage_only_result && output.stage_only_result.promotion && output.stage_only_result.promotion.active_batch_rows) || 0);
    if (currentRows <= 0) return { pass: false, reason: "sleeper_current_rows_zero", current_rows_written: currentRows };
    if (activeRows !== 1) return { pass: false, reason: "sleeper_active_batch_not_one", active_batch_rows_written: activeRows };
    if (output.no_scoring !== true || output.no_ranking !== true || output.no_final_board !== true) return { pass: false, reason: "sleeper_inventory_safety_flags_missing" };
  }
  if (stage.job_key === "score-prep") {
    if (cert !== "SCORE_BOARD_PREP_ENRICHMENT_COMPLETED_PRESERVED_RAW_BOARDS") return { pass: false, reason: "score_prep_not_certified", certification: cert };
    if (output.final_db_truth !== true) return { pass: false, reason: "score_prep_final_db_truth_missing", final_db_truth: output.final_db_truth };
    if (Number(output.prepared_rows || 0) <= 0) return { pass: false, reason: "score_prep_prepared_rows_zero", prepared_rows: output.prepared_rows || 0 };
    if (Number(output.inserted_current_rows || output.prepared_rows || 0) !== Number(output.prepared_rows || 0)) return { pass: false, reason: "score_prep_inserted_current_rows_mismatch", prepared_rows: output.prepared_rows || 0, inserted_current_rows: output.inserted_current_rows || 0 };
    const prizepicksNoFutureNonfatal = priorStageReports.some(r => r && r.stage_key === "board_prizepicks_refresh" && r.prizepicks_stage_nonfatal === true && r.prizepicks_stale_cleared === true);
    if (Number(output.prizepicks_rows || 0) <= 0 && !prizepicksNoFutureNonfatal) return { pass: false, reason: "score_prep_prizepicks_rows_zero", prizepicks_rows: output.prizepicks_rows || 0 };
    if (Number(output.prizepicks_rows || 0) > 0 && prizepicksNoFutureNonfatal) return { pass: false, reason: "score_prep_prizepicks_rows_present_after_no_future_clear", prizepicks_rows: output.prizepicks_rows || 0 };
    if (Number(output.sleeper_rows || 0) <= 0) return { pass: false, reason: "score_prep_sleeper_rows_zero", sleeper_rows: output.sleeper_rows || 0 };
    if (Number(output.pickable_safe_rows || 0) <= 0) return { pass: false, reason: "score_prep_pickable_safe_rows_zero", pickable_safe_rows: output.pickable_safe_rows || 0 };
    if (output.no_market_board_mutation !== true || output.no_raw_board_delete !== true || output.no_scoring !== true || output.no_ranking !== true || output.no_final_board !== true) return { pass: false, reason: "score_prep_safety_flags_missing" };
  }
  return { pass: true, certification: cert, data_ok: output.data_ok, rows_read: output.rows_read || 0, rows_written: output.rows_written || 0, rows_promoted: output.rows_promoted || output.promoted_rows_written || 0, external_calls: output.external_calls_performed || output.external_calls || 0, output };
}


async function validateBoardFullRunFinalGuard(env, stageReports) {
  const requiredStageKeys = ["board_prizepicks_refresh", "board_sleeper_refresh", "score_prep_enrichment"];
  const missingStageKeys = requiredStageKeys.filter(stageKey => !stageReports.some(r => r.stage_key === stageKey && r.pass === true));
  const scorePrepReport = stageReports.find(r => r.stage_key === "score_prep_enrichment" && r.job_key === "score-prep");

  if (missingStageKeys.length > 0) {
    return {
      ok: false,
      reason: "board_full_run_missing_required_stage",
      missing_stage_keys: missingStageKeys,
      completed_stage_count: stageReports.length,
      required_stage_keys: requiredStageKeys
    };
  }

  if (!scorePrepReport || scorePrepReport.pass !== true || scorePrepReport.child_status !== "completed" || scorePrepReport.final_db_truth !== true) {
    return {
      ok: false,
      reason: "board_full_run_score_prep_not_verified",
      score_prep_report: scorePrepReport || null
    };
  }

  const marketPrizePicks = await first(env.MARKET_DB, "SELECT COUNT(*) AS rows FROM prizepicks_board_current");
  const marketSleeper = await first(env.MARKET_DB, "SELECT COUNT(*) AS rows FROM sleeper_board_current");
  const scorePrizePicks = await first(env.SCORE_DB, "SELECT COUNT(*) AS rows FROM score_board_prepared_current WHERE source_key = 'prizepicks'");
  const scoreSleeper = await first(env.SCORE_DB, "SELECT COUNT(*) AS rows FROM score_board_prepared_current WHERE source_key = 'sleeper'");
  const scoreTotal = await first(env.SCORE_DB, "SELECT COUNT(*) AS rows FROM score_board_prepared_current");
  const prepBatchCount = await first(env.SCORE_DB, "SELECT COUNT(DISTINCT prep_batch_id) AS rows FROM score_board_prepared_current");

  const scorePrepPrizePicksRows = Number(scorePrepReport.prizepicks_rows || 0);
  const scorePrepSleeperRows = Number(scorePrepReport.sleeper_rows || 0);
  const scorePrepPreparedRows = Number(scorePrepReport.prepared_rows || 0);
  const scorePrepAllSourceRowsBeforeWindow = Number(scorePrepReport.all_source_rows_seen_before_window_filter || 0);

  const marketPrizePicksRows = Number(marketPrizePicks && marketPrizePicks.rows || 0);
  const marketSleeperRows = Number(marketSleeper && marketSleeper.rows || 0);
  const scorePrizePicksRows = Number(scorePrizePicks && scorePrizePicks.rows || 0);
  const scoreSleeperRows = Number(scoreSleeper && scoreSleeper.rows || 0);
  const scoreTotalRows = Number(scoreTotal && scoreTotal.rows || 0);
  const marketTotalRows = marketPrizePicksRows + marketSleeperRows;

  const parity = {
    market_prizepicks_rows_raw_current: marketPrizePicksRows,
    score_prizepicks_rows_current_window: scorePrizePicksRows,
    score_prep_prizepicks_rows_current_window: scorePrepPrizePicksRows,
    market_sleeper_rows_raw_current: marketSleeperRows,
    score_sleeper_rows_current_window: scoreSleeperRows,
    score_prep_sleeper_rows_current_window: scorePrepSleeperRows,
    market_total_rows_raw_current: marketTotalRows,
    score_total_rows_current_window: scoreTotalRows,
    score_prep_prepared_rows_current_window: scorePrepPreparedRows,
    score_prep_all_source_rows_before_window_filter: scorePrepAllSourceRowsBeforeWindow,
    board_rows_excluded_by_score_prep_window: scorePrepAllSourceRowsBeforeWindow > 0 ? scorePrepAllSourceRowsBeforeWindow - scorePrepPreparedRows : marketTotalRows - scoreTotalRows,
    score_distinct_prep_batches: Number(prepBatchCount && prepBatchCount.rows || 0),
    current_window_dates: scorePrepReport.current_window_dates || null,
    guard_policy: "compare_score_current_to_score_prep_current_window_and_market_raw_to_score_prep_raw_seen"
  };

  const mismatches = [];
  if (parity.score_prizepicks_rows_current_window !== parity.score_prep_prizepicks_rows_current_window) mismatches.push("score_prizepicks_rows_do_not_match_score_prep_current_window");
  if (parity.score_sleeper_rows_current_window !== parity.score_prep_sleeper_rows_current_window) mismatches.push("score_sleeper_rows_do_not_match_score_prep_current_window");
  if (parity.score_total_rows_current_window !== parity.score_prep_prepared_rows_current_window) mismatches.push("score_total_rows_do_not_match_score_prep_prepared_rows");
  if (parity.score_distinct_prep_batches !== 1) mismatches.push("score_prepared_current_multiple_or_missing_batches");
  if (scorePrepAllSourceRowsBeforeWindow > 0 && marketTotalRows !== scorePrepAllSourceRowsBeforeWindow) mismatches.push("market_raw_total_does_not_match_score_prep_raw_seen_before_window_filter");
  if (scorePrepAllSourceRowsBeforeWindow <= 0 && marketTotalRows !== scoreTotalRows) mismatches.push("legacy_market_score_row_mismatch_without_window_report");
  if (marketPrizePicksRows < scorePrizePicksRows) mismatches.push("market_prizepicks_raw_less_than_score_prizepicks_current_window");
  if (marketSleeperRows < scoreSleeperRows) mismatches.push("market_sleeper_raw_less_than_score_sleeper_current_window");
  if (parity.board_rows_excluded_by_score_prep_window < 0) mismatches.push("negative_window_exclusion_count");

  if (mismatches.length > 0) {
    return {
      ok: false,
      reason: "board_full_run_final_market_score_window_parity_failed",
      mismatches,
      parity,
      score_prep_report: scorePrepReport
    };
  }

  return {
    ok: true,
    reason: "board_full_run_final_guard_passed_current_window_parity",
    required_stage_keys: requiredStageKeys,
    parity,
    score_prep_report: scorePrepReport
  };
}

async function processBoardFullRunJob(env, row, runId, trigger) {
  const started = Date.now();
  const parentInput = parseJsonSafeText(row.input_json || "{}", {});
  const lock = await ensureBoardFullRunLock(env, row);
  if (!lock.ok) {
    const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "board_full_run", status: "PARTIAL_CONTINUE_BOARD_FULL_RUN_LOCK_BUSY", certification: "BOARD_FULL_RUN_LOCK_BUSY_WAIT", lock, continuation_required: true, orchestrator_should_self_continue: true };
    await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'BOARD_FULL_RUN_LOCK_BUSY_WAIT', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
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
      await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'BOARD_FULL_RUN_CHILD_ENQUEUED', ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, i, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
      await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
      await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'board_full_run_child_enqueued', 'Board Full Run enqueued next child stage', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ parent_request_id: row.request_id, child_request_id: enqueued.child_request_id, stage_key: stage.stage_key, stage_index: i, mode: stage.mode }));
      return output;
    }

    const validation = childPassedBoardFullRun(stage, child, stageReports);
    const childOutput = parseJsonSafeText(child.output_json || "{}", {});
    const report = { stage_key: stage.stage_key, job_key: stage.job_key, mode: stage.mode, child_request_id: child.request_id, child_status: child.status, child_certification: childOutput.certification || null, child_data_ok: childOutput.data_ok === true, pass: validation.pass, wait: !!validation.wait, reason: validation.reason || null, prizepicks_stale_cleared: validation.prizepicks_stale_cleared === true, prizepicks_nonfatal_warning: validation.prizepicks_nonfatal_warning === true, prizepicks_stage_nonfatal: validation.prizepicks_stage_nonfatal === true, source_refresh_dispatch_ok: validation.source_refresh_dispatch_ok === true, source_refresh_dispatch_error: validation.source_refresh_dispatch_error || null, rows_read: childOutput.rows_read || 0, rows_written: childOutput.rows_written || 0, rows_promoted: childOutput.rows_promoted || childOutput.promoted_rows_written || 0, future_pickable_rows: childOutput.future_pickable_rows || 0, expired_or_started_rows: childOutput.expired_or_started_rows || 0, prepared_rows: childOutput.prepared_rows || 0, prizepicks_rows: childOutput.prizepicks_rows || 0, sleeper_rows: childOutput.sleeper_rows || 0, all_source_rows_seen_before_window_filter: childOutput.all_source_rows_seen_before_window_filter || 0, current_window_dates: childOutput.current_window_dates || null, pickable_safe_rows: childOutput.pickable_safe_rows || 0, blocked_rows: childOutput.blocked_rows || 0, matchup_unresolved_rows: childOutput.matchup_unresolved_rows || 0, unresolved_player_rows: childOutput.unresolved_player_rows || 0, final_db_truth: childOutput.final_db_truth === true, external_calls: childOutput.external_calls_performed || childOutput.external_calls || 0, attempts: stageAttempts.length };

    if (validation.wait) {
      const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "board_full_run", status: "PARTIAL_CONTINUE_BOARD_FULL_RUN_WAITING_ON_CHILD", certification: "BOARD_FULL_RUN_WAITING_ON_CHILD", certification_grade: "PARTIAL", current_stage_key: stage.stage_key, waiting_on_child_request_id: child.request_id, waiting_on_child_status: child.status, completed_stage_count: stageReports.length, total_stage_count: BOARD_FULL_RUN_STAGES.length, stages: [...stageReports, report], continuation_required: true, orchestrator_should_self_continue: true, lock_held: true };
      await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'BOARD_FULL_RUN_WAITING_ON_CHILD', ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, i + 1, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
      await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=datetime('now','+6 seconds'), updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
      return output;
    }

    if (!validation.pass) {
      const finalStatus = "FAILED_BOARD_FULL_RUN_CHILD_FAILED";
      const output = { ok: false, data_ok: false, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "board_full_run", status: finalStatus, certification: finalStatus, certification_grade: "FAILED", failed_stage_key: stage.stage_key, failed_request_id: child.request_id, failed_reason: validation.reason, child_error_code: child.error_code || null, child_error_message: child.error_message || null, last_output_preview: JSON.stringify(childOutput).slice(0, 1200), stages: [...stageReports, report], board_full_run_certified: false, no_delta_full_run: true, no_scoring: true, no_ranking: true, no_final_board: true };
      await releaseBoardFullRunLock(env, row);
      await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'failed', 0, ?, ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, finalStatus, i + 1, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output), finalStatus.toLowerCase(), String(validation.reason || "board full run child failed").slice(0, 900));
      await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='failed', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?", JSON.stringify(output), finalStatus.toLowerCase(), String(validation.reason || "board full run child failed").slice(0, 900), row.request_id);
      await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'ERROR', 'board_full_run_stopped', 'Board Full Run stopped on failed child stage', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify(output));
      return output;
    }

    stageReports.push(report);
  }

  const finalGuard = await validateBoardFullRunFinalGuard(env, stageReports);
  if (!finalGuard.ok) {
    const finalStatus = "FAILED_BOARD_FULL_RUN_FINAL_SCORE_PREP_GUARD";
    const output = { ok: false, data_ok: false, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "board_full_run", status: finalStatus, certification: finalStatus, certification_grade: "FAILED", failed_reason: finalGuard.reason, final_guard: finalGuard, stages: stageReports, board_full_run_certified: false, board_prep_required: true, board_prep_completed: false, completed_stage_count: stageReports.length, total_stage_count: BOARD_FULL_RUN_STAGES.length, approved_chain_order: BOARD_FULL_RUN_STAGES.map(s => s.job_key), no_delta_full_run: true, no_scoring: true, no_ranking: true, no_final_board: true };
    await releaseBoardFullRunLock(env, row);
    await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'failed', 0, ?, ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, finalStatus, stageReports.length, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output), finalStatus.toLowerCase(), String(finalGuard.reason || "board full run final score prep guard failed").slice(0, 900));
    await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='failed', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?", JSON.stringify(output), finalStatus.toLowerCase(), String(finalGuard.reason || "board full run final score prep guard failed").slice(0, 900), row.request_id);
    await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'ERROR', 'board_full_run_final_guard_failed', 'Board Full Run failed final Score Prep required-stage/parity guard', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify(output));
    return output;
  }

  const prizepicksNoFutureNonfatal = stageReports.some(r => r && r.stage_key === "board_prizepicks_refresh" && r.prizepicks_stage_nonfatal === true && r.prizepicks_stale_cleared === true);
  const finalCertification = prizepicksNoFutureNonfatal ? "BOARD_FULL_RUN_CERTIFIED_SLEEPER_AND_SCORE_PREP_PASS_PRIZEPICKS_NO_FUTURE_ROWS" : "BOARD_FULL_RUN_CERTIFIED_PRIZEPICKS_SLEEPER_AND_SCORE_PREP_PASS";
  const finalGrade = prizepicksNoFutureNonfatal ? "FULL_RUN_PASS_WITH_PRIZEPICKS_NO_FUTURE_ROWS" : "FULL_RUN_PASS";
  const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "board_full_run", status: "COMPLETED_BOARD_FULL_RUN", certification: finalCertification, certification_grade: finalGrade, board_full_run_certified: true, board_prep_required: true, board_prep_completed: true, final_guard: finalGuard, market_score_parity: finalGuard.parity, prizepicks_required_stage_policy: true, prizepicks_no_future_rows_nonfatal: prizepicksNoFutureNonfatal, completed_stage_count: stageReports.length, total_stage_count: BOARD_FULL_RUN_STAGES.length, stages: stageReports, approved_chain_order: BOARD_FULL_RUN_STAGES.map(s => s.job_key), board_full_run_only: true, no_delta_full_run: true, no_incremental_morning_full_run: true, no_static_work: true, no_base_delta_workers: true, no_scoring: true, no_ranking: true, no_final_board: true, no_old_production_touch: true };
  await releaseBoardFullRunLock(env, row);
  await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'completed', 1, ?, ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, finalCertification, stageReports.length, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
  await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='completed', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
  await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'board_full_run_completed', 'Board Full Run certified required PrizePicks, Sleeper, and Score Prep stages', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify(output));
  return output;
}


const MARKET_SCORING_FULL_RUN_LOCK_KEY = "MARKET_SCORING_FULL_RUN";
const MARKET_SCORING_FULL_RUN_CHILD_RUN_AFTER_SECONDS = 0;
const MARKET_SCORING_FULL_RUN_PARENT_RECHECK_SECONDS = 6;
const MARKET_SCORING_FULL_RUN_PROP_FACTOR_PARENT_YIELD_SECONDS = 45;
const MARKET_SCORING_FULL_RUN_HEAVY_STAGE_PARENT_YIELD_SECONDS = 20;
const HEAVY_MARKET_SERVICE_BINDING_COOLDOWN_SECONDS = 2;
const PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS = HEAVY_MARKET_SERVICE_BINDING_COOLDOWN_SECONDS;

function isMarketScoringFullRunPropFactorStage(stage) {
  const key = String(stage && stage.stage_key ? stage.stage_key : "");
  return key === "prop_factor_hitters" || key === "prop_factor_pitchers";
}

function isMarketScoringFullRunHeavyStage(stage) {
  const key = String(stage && stage.stage_key ? stage.stage_key : "");
  return isMarketScoringFullRunPropFactorStage(stage) || key === "prop_matrix_build" || key === "scoring_engine" || key === "hit_probability" || key === "score_final_board";
}

function marketScoringFullRunParentRecheckSeconds(stage) {
  if (isMarketScoringFullRunPropFactorStage(stage)) return MARKET_SCORING_FULL_RUN_PROP_FACTOR_PARENT_YIELD_SECONDS;
  if (isMarketScoringFullRunHeavyStage(stage)) return MARKET_SCORING_FULL_RUN_HEAVY_STAGE_PARENT_YIELD_SECONDS;
  return MARKET_SCORING_FULL_RUN_PARENT_RECHECK_SECONDS;
}

function marketHeavyCooldownCertification(jobKey) {
  return String(jobKey || "market_child").toUpperCase().replace(/[^A-Z0-9]+/g, "_") + "_SERVICE_BINDING_COOLDOWN_YIELD";
}

async function maybeYieldHeavyMarketChildCooldown(env, row, runId, input, rowInput, options = {}) {
  const jobKey = String(row && row.job_key ? row.job_key : "");
  const heavyJobs = new Set(["prop-matrix-builder", "scoring-engine", "hit-probability", "score-final-board"]);
  if (!heavyJobs.has(jobKey)) return null;
  const chainId = String(row && row.chain_id ? row.chain_id : "");
  const parentRequestId = String((rowInput && (rowInput.parent_request_id || rowInput.parentRequestId)) || "");
  const fromMarketFull = chainId.includes("market_scoring_full_run") || parentRequestId.includes("market_scoring_full_run");
  if (!fromMarketFull) return null;

  const recent = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recent && recent.partial_continue_runs || 0);
  const secondsSinceLastPartial = recent && recent.seconds_since_last_partial !== null && recent.seconds_since_last_partial !== undefined ? Number(recent.seconds_since_last_partial) : 999999;
  if (!(partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < HEAVY_MARKET_SERVICE_BINDING_COOLDOWN_SECONDS)) return null;

  const previous = await first(env.CONTROL_DB, `SELECT rows_read, rows_written, certification_status, output_json
    FROM control_job_runs
    WHERE request_id=? AND job_key=? AND status='partial_continue' AND finished_at IS NOT NULL
    ORDER BY datetime(finished_at) DESC
    LIMIT 1`, row.request_id, row.job_key);
  let previousOutput = {};
  try { previousOutput = JSON.parse(previous && previous.output_json || "{}"); } catch (_) { previousOutput = {}; }
  const batchId = previousOutput.batch_id || previousOutput.matrix_batch_id || previousOutput.final_board_batch_id || previousOutput.hp_board_batch_id || previousOutput.source_engine_batch_id || (rowInput && rowInput.resume_batch_id) || null;
  const cert = marketHeavyCooldownCertification(jobKey);
  const rowsRead = Number(previousOutput.rows_read || previousOutput.prepared_rows_read || previousOutput.matrix_rows_read || previousOutput.source_rows_read || (previous && previous.rows_read) || 0);
  const rowsWritten = Number(previousOutput.rows_written || previousOutput.matrix_rows_written || previousOutput.score_rows_written || previousOutput.probability_rows_written || previousOutput.board_rows_written || previousOutput.final_rows_written || (previous && previous.rows_written) || 0);
  const output = {
    ok: true,
    data_ok: true,
    version: SYSTEM_VERSION,
    processed_by: WORKER_NAME,
    worker_name: options.logical_worker_name || previousOutput.worker_name || row.worker_name,
    deployed_worker_slot: options.deployed_worker_slot || previousOutput.deployed_worker_slot || null,
    job_key: row.job_key,
    request_id: row.request_id,
    chain_id: row.chain_id,
    run_id: runId,
    mode: options.mode || previousOutput.mode || (input && input.mode) || null,
    status: "PARTIAL_CONTINUE_HEAVY_MARKET_SERVICE_BINDING_COOLDOWN_YIELD",
    certification: cert,
    certification_grade: "PARTIAL_CONTINUE",
    batch_id: batchId,
    rows_read: rowsRead,
    rows_written: rowsWritten,
    partial_continue_runs_seen: partialRunCount,
    seconds_since_last_partial: secondsSinceLastPartial,
    heavy_service_binding_cooldown_seconds: HEAVY_MARKET_SERVICE_BINDING_COOLDOWN_SECONDS,
    service_binding_limit_policy: "one_heavy_market_scoring_stage_dispatch_per_fresh_orchestrator_continuation",
    official_service_binding_invocation_limit: 32,
    official_service_binding_90pct_budget: 28,
    alphadog_observed_heavy_dispatch_limit_override: true,
    continuation_required: true,
    orchestrator_should_self_continue: true,
    previous_certification: previous && previous.certification_status || null,
    previous_status: previousOutput.status || null,
    previous_remaining_rows: previousOutput.remaining_rows || null,
    no_external_api_calls: true,
    no_source_board_mutation: true,
    no_final_board_write: jobKey !== "score-final-board"
  };
  const nextInput = {
    ...(rowInput || {}),
    resume_batch_id: batchId || (rowInput && rowInput.resume_batch_id) || null,
    continuation_from_request_id: row.request_id,
    heavy_service_binding_cooldown_yield: true,
    heavy_service_binding_cooldown_seconds: HEAVY_MARKET_SERVICE_BINDING_COOLDOWN_SECONDS
  };
  if (jobKey === "prop-matrix-builder") { nextInput.matrix_batch_id = batchId || nextInput.matrix_batch_id || null; nextInput.matrix_resume = true; }
  if (jobKey === "scoring-engine") { nextInput.scoring_engine_resume = true; }
  if (jobKey === "hit-probability") { nextInput.hit_probability_resume = true; nextInput.hp_resume = true; }
  if (jobKey === "score-final-board") { nextInput.final_board_resume = true; }

  await run(env.CONTROL_DB,
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, cert, rowsRead, rowsWritten, JSON.stringify(input || {}), JSON.stringify(output));
  await run(env.CONTROL_DB,
    "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
    HEAVY_MARKET_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'heavy_market_service_binding_cooldown_yield', 'Yielded heavy Market/Scoring child instead of starting another immediate service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id: row.request_id, job_key: row.job_key, batch_id: batchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds: HEAVY_MARKET_SERVICE_BINDING_COOLDOWN_SECONDS, version: SYSTEM_VERSION }).slice(0, 9000));
  return output;
}

function isActiveControlQueueStatus(status) {
  return ["pending", "running", "partial_continue"].includes(String(status || ""));
}

const MARKET_SCORING_FULL_RUN_STAGES = [
  { stage_key: "market_context_teams", job_key: "market-normalizer", worker_name: "alphadog-v2-market-normalizer", display_name: "Market Context Teams Game Odds", visible_button: "MARKET > Teams", mode: "market_teams_game_odds", worker_group: "09 Market", phase_key: "market_context", priority: 5 },
  { stage_key: "market_context_hitters", job_key: "market-line-shape-classifier", worker_name: "alphadog-v2-market-line-shape-classifier", display_name: "Market Context Hitter Props", visible_button: "MARKET > Hitters", mode: "market_hitter_prop_line_context", worker_group: "09 Market", phase_key: "market_context", priority: 5 },
  { stage_key: "market_context_pitchers", job_key: "market-line-shape-classifier", worker_name: "alphadog-v2-market-line-shape-classifier", display_name: "Market Context Pitcher Props", visible_button: "MARKET > Pitchers", mode: "market_pitcher_prop_line_context", worker_group: "09 Market", phase_key: "market_context", priority: 5 },
  { stage_key: "prop_factor_hitters", job_key: "prop-factor-miner", worker_name: "alphadog-v2-phase2b-recent-form", display_name: "Prop Factor Miner Hitters", visible_button: "FACTORS > Hitters", mode: "hitter_prop_factor_mining", worker_group: "10 Factors", phase_key: "factors", priority: 6, factor_family: "hitter" },
  { stage_key: "prop_factor_pitchers", job_key: "prop-factor-miner", worker_name: "alphadog-v2-phase2b-recent-form", display_name: "Prop Factor Miner Pitchers", visible_button: "FACTORS > Pitchers", mode: "pitcher_prop_factor_mining", worker_group: "10 Factors", phase_key: "factors", priority: 6, factor_family: "pitcher" },
  { stage_key: "prop_matrix_build", job_key: "prop-matrix-builder", worker_name: "alphadog-v2-phase2b-certifier", display_name: "Prop Matrix Build", visible_button: "MATRIX > Build", mode: "prop_matrix_build", worker_group: "10 Matrix", phase_key: "matrix", priority: 6 },
  { stage_key: "scoring_engine", job_key: "scoring-engine", worker_name: "alphadog-v2-score-audit", display_name: "No-Cut Leg Trust Ledger", visible_button: "SCORING > Engine", mode: "scoring_engine_current_no_cut_all_legs_probability_ledger", worker_group: "11 Scoring", phase_key: "scoring", priority: 6 },
  { stage_key: "hit_probability", job_key: "hit-probability", worker_name: "alphadog-v2-score-audit", display_name: "All-Legs Probability Ledger + HP Board", visible_button: "SCORING > Hit Prob", mode: "hit_probability_current_estimate_no_cut_all_rows", worker_group: "11 Scoring", phase_key: "scoring", priority: 7 },
  { stage_key: "score_final_board", job_key: "score-final-board", worker_name: "alphadog-v2-score-final-board", display_name: "Score Final Board", visible_button: "SCORING > Final Board", mode: "score_final_board_generate_current_from_hp_current", worker_group: "11 Scoring", phase_key: "scoring", priority: 8 }
];

function marketScoringFullRunChildInput(parentRow, stage, stepIndex, retryCount = 0) {
  const base = {
    source: "market_scoring_full_run_parent",
    visible_button: stage.visible_button,
    mode: stage.mode,
    chain_id: parentRow.chain_id,
    parent_chain_id: parentRow.chain_id,
    parent_request_id: parentRow.request_id,
    stage_key: stage.stage_key,
    stage_index: stepIndex,
    stage_count: MARKET_SCORING_FULL_RUN_STAGES.length,
    retry_count: retryCount,
    approved_chain_order: MARKET_SCORING_FULL_RUN_STAGES.map(s => s.job_key),
    stop_on_first_failed_stage: true,
    backend_chain_only: true,
    no_browser_loop: true,
    backend_scheduled_continuation: true,
    no_generic_dispatch: true,
    no_source_board_mutation: true,
    no_prepared_board_mutation: true,
    no_old_production_touch: true,
    today_tomorrow_retention_only: true,
    created_at: nowIso()
  };
  if (stage.job_key === "market-normalizer") {
    return { ...base, exact_worker_only: true, teams_game_odds_real_worker_shape: true, evidence_tables_only: true, odds_api_game_odds_lane: true, odds_api_sport_key: "baseball_mlb", odds_api_markets: ["h2h", "spreads", "totals"], odds_api_event_level_game_team_markets: ["team_totals", "alternate_spreads", "alternate_totals"], no_player_props_in_this_worker: true, parlay_player_prop_coverage_test_only: false, no_market_current_lines_writes: true, no_score_db_mutation: true, no_scoring: true, no_ranking: true, no_final_board: true, no_matrix_builder: true };
  }
  if (stage.job_key === "market-line-shape-classifier") {
    const pitcher = stage.mode === "market_pitcher_prop_line_context";
    return { ...base, exact_worker_only: true, selected_worker_slot: "alphadog-v2-market-line-shape-classifier", parlay_api_first_test: true, hitter_player_props_only: !pitcher, pitcher_player_props_only: pitcher, same_worker_as_hitters_separate_mode: pitcher, evidence_tables_only: true, no_teams_game_odds: true, no_hitter_props_in_this_run: pitcher, no_pitcher_props: !pitcher, no_internal_hitter_factors: !pitcher, no_internal_pitcher_factors: pitcher, no_market_current_lines_writes: true, no_score_db_mutation: true, no_scoring: true, no_ranking: true, no_final_board: true, no_matrix_builder: true };
  }
  if (stage.job_key === "prop-factor-miner") {
    return { ...base, factor_mode: stage.mode, factor_family: stage.factor_family, logical_worker_name: "alphadog-v2-prop-factor-miner", deployed_worker_slot: "alphadog-v2-phase2b-recent-form", exact_worker_only: true, internal_only: true, no_external_api_calls: true, no_mlb_api_calls: true, no_odds_api_calls: true, no_parlay_api_calls: true, no_gemini_calls: true, reads_score_prepared_board: true, reads_internal_context_tables: true, writes_score_factor_packets_only: true, retention_policy: "today_tomorrow_only", no_score_probability: true, no_edge: true, no_scoring: true, no_ranking: true, no_matrix_builder: true, no_final_board: true };
  }
  if (stage.job_key === "prop-matrix-builder") {
    return { ...base, logical_worker_name: "alphadog-v2-prop-matrix-builder", deployed_worker_slot: "alphadog-v2-phase2b-certifier", exact_worker_only: true, internal_only: true, no_external_api_calls: true, no_mlb_api_calls: true, no_odds_api_calls: true, no_parlay_api_calls: true, no_gemini_calls: true, reads_score_prepared_board: true, reads_prop_factor_packets: true, reads_market_context_evidence: true, reads_daily_context_readiness: true, writes_score_matrix_only: true, one_row_per_safe_prepared_row: true, preserve_blocked_and_deferred_rows: true, retention_policy: "today_tomorrow_only", no_score_probability: true, no_confidence_score: true, no_edge: true, no_value_rating: true, no_qualified_flag: true, no_rank: true, no_pick_recommendation: true, no_scoring: true, no_ranking: true, no_final_board: true };
  }
  if (stage.job_key === "scoring-engine") {
    return { ...base, logical_worker_name: "alphadog-v2-scoring-engine", deployed_worker_slot: "alphadog-v2-score-audit", exact_worker_only: true, framework_only: false, production_scoring_current: true, primary_profile: "NO_CUT_ALL_LEGS_PROBABILITY_LEDGER_V1", worker_owned_schema_creation: true, writes_score_db_scoring_engine_only: true, no_simulation_shadow_mutation: true, no_archive_mutation: false, thresholds_locked: false, scoring_enabled: true, trust_ledger_enabled: true, no_cut_all_legs_probability_ledger: true, preserve_all_matrix_rows_for_hp: true, score_every_matrix_row_before_filtering: true, no_pre_hp_leg_cut: true, model_pending_no_cut_rows_allowed: true, true_probability_enabled: false, no_true_hit_probability_claims: true, regular_lines_two_sided: true, goblin_demon_more_only: true, goblin_demon_under_blocker: "GOBLIN_DEMON_UNDER_NOT_SELECTABLE", no_candidate_board_write: true, no_old_prop_scores_write: true, no_ranking: true, no_final_board: true, hp_first_trust_score_profile: true };
  }
  if (stage.job_key === "hit-probability") {
    return { ...base, logical_worker_name: "alphadog-v2-hit-probability", deployed_worker_slot: "alphadog-v2-score-audit", exact_worker_only: true, worker_owned_schema_creation: true, estimated_hit_probability_phase: true, estimated_not_true_probability: true, hit_probability_only: true, hp_board_required: true, hp_board_same_worker: true, hp_board_display_calibration_required: false, writes_hit_probability_tables_only: true, writes_hp_board_tables_only: true, reads_score_final_board_current_first: false, reads_scoring_engine_current_direct: true, fallback_reads_scoring_engine_current: true, source_engine_batch_required_from_same_chain: true, read_all_scoring_rows_no_pre_filter: true, probability_row_for_every_scoring_row: true, no_cut_all_legs_probability_ledger: true, model_pending_no_cut_rows_allowed: true, unsupported_props_become_model_pending_no_cut: true, true_probability_enabled: false, no_true_hit_probability_claims: true, framework_only: true, no_score_mutation: true, no_scoring_engine_current_mutation: true, no_final_board_mutation: true, no_prepared_board_mutation: true, no_source_board_mutation: true, no_candidate_board_write: true, no_ranking: true, no_pick_recommendation: true, no_live_playable_mutation: true, no_review_playable_mutation: true, d1_limit_safe_chunking_required: true, service_binding_timeout_reconcile_from_tables: true, hp_first_board_before_final_board: true };
  }
  if (stage.job_key === "score-final-board") {
    return { ...base, exact_worker_only: true, deployed_worker_slot: "alphadog-v2-score-final-board", service_binding_name: "SCORE_FINAL_BOARD_WORKER", profile_key: "STRICT_C_HP_FIRST_TRUST_V4_1", source_engine_batch_policy: "market_full_requires_explicit_same_chain_completed_scoring_batch", source_hp_board_policy: "market_full_requires_explicit_same_chain_completed_hp_board_batch", writes_score_final_board_current: true, writes_score_final_board_history: true, no_external_calls: true, no_source_board_mutation: true, no_simulation_shadow_mutation: true, requires_real_engine_scoring_batch: true, requires_hp_board_current_source: true, hp_first_final_board_source_active: true, must_run_after_hit_probability: true };
  }
  return base;
}

async function ensureMarketScoringFullRunLock(env, parentRow) {
  await run(env.CONTROL_DB, "INSERT OR IGNORE INTO control_locks (lock_key, lock_flag, updated_at) VALUES (?, 0, CURRENT_TIMESTAMP)", MARKET_SCORING_FULL_RUN_LOCK_KEY);
  const lock = await first(env.CONTROL_DB,
    "SELECT lock_key, lock_flag, owner_request_id, owner_worker_name, acquired_at, expires_at, updated_at, CASE WHEN expires_at IS NOT NULL AND datetime(expires_at) > datetime('now') THEN 1 ELSE 0 END AS not_expired FROM control_locks WHERE lock_key=?",
    MARKET_SCORING_FULL_RUN_LOCK_KEY
  );
  const activeOther = await first(env.CONTROL_DB,
    "SELECT request_id, chain_id, status, updated_at FROM control_job_queue WHERE job_key='market-scoring-full-run' AND request_id<>? AND status IN ('pending','running','partial_continue') AND finished_at IS NULL ORDER BY datetime(created_at) DESC LIMIT 1",
    parentRow.request_id
  );
  if (lock && Number(lock.lock_flag) === 1 && lock.owner_request_id && lock.owner_request_id !== parentRow.request_id && Number(lock.not_expired) === 1) {
    return { ok: false, reason: "market_scoring_full_run_lock_busy", lock, active_other_parent: activeOther || null };
  }
  if (lock && Number(lock.lock_flag) === 1 && lock.owner_request_id && lock.owner_request_id !== parentRow.request_id && activeOther) {
    return { ok: false, reason: "market_scoring_full_run_active_parent_exists", lock, active_other_parent: activeOther };
  }
  await run(env.CONTROL_DB,
    "UPDATE control_locks SET lock_flag=1, owner_request_id=?, owner_worker_name=?, acquired_at=CURRENT_TIMESTAMP, expires_at=datetime('now','+45 minutes'), updated_at=CURRENT_TIMESTAMP WHERE lock_key=?",
    parentRow.request_id, WORKER_NAME, MARKET_SCORING_FULL_RUN_LOCK_KEY
  );
  return { ok: true };
}

async function releaseMarketScoringFullRunLock(env, parentRow) {
  await run(env.CONTROL_DB,
    "UPDATE control_locks SET lock_flag=0, owner_request_id=NULL, owner_worker_name=NULL, expires_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE lock_key=? AND (owner_request_id=? OR owner_request_id IS NULL)",
    MARKET_SCORING_FULL_RUN_LOCK_KEY, parentRow.request_id
  );
}

async function enqueueMarketScoringFullRunChild(env, parentRow, stage, stepIndex, retryCount = 0, extraInput = {}) {
  const childRequestId = rid(stage.stage_key.replace(/-/g, "_"));
  const input = { ...marketScoringFullRunChildInput(parentRow, stage, stepIndex, retryCount), ...(extraInput || {}) };
  await run(env.CONTROL_DB,
    "INSERT INTO control_job_queue (request_id, chain_id, parent_request_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0, ?, datetime('now', '+' || ? || ' seconds'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
    childRequestId, parentRow.chain_id, parentRow.request_id, stage.job_key, stage.worker_name, stage.worker_group, stage.phase_key, stage.display_name, stage.priority, JSON.stringify(input), MARKET_SCORING_FULL_RUN_CHILD_RUN_AFTER_SECONDS
  );
  return { child_request_id: childRequestId, input };
}

function marketScoringFullRunStageKeyFromChild(child) {
  const input = parseJsonSafeText(child && child.input_json || "{}", {});
  return String(input.stage_key || "");
}


async function synthesizeMarketPlayerPropTerminalProofFromEvidence(env, stageKey, requestId) {
  if (!env.MARKET_DB) return null;
  const wantedMode = stageKey === "market_context_pitchers" ? "market_pitcher_prop_line_context" : "market_hitter_prop_line_context";
  if (stageKey !== "market_context_hitters" && stageKey !== "market_context_pitchers") return null;

  const batch = await first(env.MARKET_DB,
    `SELECT batch_id, request_id, run_id, worker_name, worker_version, mode, status, slate_window_key, window_start_date, window_end_date,
            prepared_rows_read, prepared_games_checked, prepared_players_checked, prepared_prop_keys_checked,
            parlay_inventory_rows_seen, parlay_props_mapped_to_prepared, warning_count, blocker_count,
            certification_status, certification_grade, output_json, updated_at, created_at
       FROM market_context_probe_batches
       WHERE request_id=?
         AND mode=?
       ORDER BY datetime(COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)) DESC, batch_id DESC
       LIMIT 1`,
    requestId, wantedMode
  );
  if (!batch || !batch.batch_id) return null;

  const summary = await first(env.MARKET_DB,
    `SELECT COUNT(*) AS evidence_rows,
            COUNT(DISTINCT source_key) AS source_count,
            COUNT(DISTINCT prepared_row_id) AS prepared_rows,
            COUNT(DISTINCT game_pk) AS games,
            COUNT(DISTINCT resolved_mlb_player_id) AS players,
            COUNT(DISTINCT canonical_prop_key) AS prop_keys,
            MIN(created_at) AS first_row_at,
            MAX(created_at) AS last_row_at,
            CASE WHEN MAX(created_at) IS NOT NULL AND datetime(MAX(created_at)) <= datetime(CURRENT_TIMESTAMP, '-45 seconds') THEN 1 ELSE 0 END AS evidence_quiet
       FROM market_context_probe_player_props
       WHERE batch_id=?`,
    batch.batch_id
  );

  const evidenceRows = Number(summary && summary.evidence_rows || 0);
  const preparedRows = Number(summary && summary.prepared_rows || 0);
  const evidenceQuiet = Number(summary && summary.evidence_quiet || 0) === 1;
  if (evidenceRows <= 0 || preparedRows <= 0 || !evidenceQuiet) return null;

  const issueSummary = await first(env.MARKET_DB,
    `SELECT COUNT(*) AS issue_rows,
            SUM(CASE WHEN UPPER(COALESCE(severity,'')) IN ('ERROR','BLOCKER','FAILED') THEN 1 ELSE 0 END) AS hard_issue_rows
       FROM market_context_probe_issues
       WHERE batch_id=?`,
    batch.batch_id
  );
  const issueRows = Number(issueSummary && issueSummary.issue_rows || 0);
  const hardIssueRows = Number(issueSummary && issueSummary.hard_issue_rows || 0);
  const ok = hardIssueRows === 0;
  const cert = ok ? "MARKET_PLAYER_PROP_CONTEXT_EVIDENCE_WRITTEN" : "MARKET_PLAYER_PROP_CONTEXT_EVIDENCE_WRITTEN_WITH_HARD_ISSUES";
  const grade = ok ? (issueRows > 0 ? "PASS_WITH_WARNINGS" : "PASS_WITH_WARNINGS") : "FAILED";
  const propFamily = stageKey === "market_context_pitchers" ? "pitcher" : "hitter";
  const status = ok ? "completed_player_prop_context_evidence_written" : "failed_player_prop_context_hard_issues";

  const output = {
    ok,
    data_ok: ok,
    version: SYSTEM_VERSION,
    worker_name: batch.worker_name || "alphadog-v2-market-line-shape-classifier",
    job_key: "market-line-shape-classifier",
    request_id: requestId,
    run_id: batch.run_id || null,
    batch_id: batch.batch_id,
    mode: wantedMode,
    prop_family: propFamily,
    status,
    certification: cert,
    certification_status: cert,
    certification_grade: grade,
    rows_read: Number(batch.prepared_rows_read || 0),
    rows_written: evidenceRows,
    external_calls_performed: 0,
    prepared_rows_read: Number(batch.prepared_rows_read || 0),
    prepared_games_checked: Number(batch.prepared_games_checked || 0),
    prepared_players_checked: Number(batch.prepared_players_checked || 0),
    prepared_prop_keys_checked: Number(batch.prepared_prop_keys_checked || 0),
    parlay_inventory_rows_seen: Number(batch.parlay_inventory_rows_seen || 0),
    parlay_props_mapped_to_prepared: preparedRows,
    persisted_player_prop_rows: evidenceRows,
    source_count: Number(summary && summary.source_count || 0),
    games: Number(summary && summary.games || 0),
    players: Number(summary && summary.players || 0),
    prop_keys: Number(summary && summary.prop_keys || 0),
    warning_count: issueRows,
    blocker_count: hardIssueRows,
    terminalized_from_quiet_evidence_rows: true,
    evidence_first_row_at: summary && summary.first_row_at || null,
    evidence_last_row_at: summary && summary.last_row_at || null,
    no_market_current_lines_writes: true,
    no_prepared_board_mutation: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true
  };

  await run(env.MARKET_DB,
    `UPDATE market_context_probe_batches
        SET status=?,
            parlay_props_mapped_to_prepared=?,
            parlay_coverage_grade=?,
            warning_count=?,
            blocker_count=?,
            certification_status=?,
            certification_grade=?,
            output_json=?,
            updated_at=CURRENT_TIMESTAMP
      WHERE batch_id=?`,
    status, preparedRows, grade, issueRows, hardIssueRows, cert, grade, JSON.stringify(output), batch.batch_id
  );

  return {
    batch_id: batch.batch_id,
    request_id: requestId,
    run_id: batch.run_id || null,
    worker_name: batch.worker_name || "alphadog-v2-market-line-shape-classifier",
    worker_version: batch.worker_version || null,
    mode: wantedMode,
    status,
    prepared_rows_read: Number(batch.prepared_rows_read || 0),
    rows_written: evidenceRows,
    certification_status: cert,
    certification_grade: grade,
    output_json: JSON.stringify(output),
    updated_at: null,
    created_at: null
  };
}


async function synthesizeScoringEngineCurrentTerminalProofFromEvidence(env, requestId, child) {
  if (!env.SCORE_DB) return null;
  const childStartedAt = child && (child.started_at || child.created_at) ? String(child.started_at || child.created_at) : null;
  const batch = await first(env.SCORE_DB,
    `SELECT batch_id, profile_key, profile_version, worker_version, job_key, status, certification, certification_grade,
            matrix_rows_read, score_rows_written, archive_rows_written, started_at, finished_at, output_json
       FROM scoring_engine_batches
       WHERE job_key='scoring-engine'
         AND (status LIKE 'running%' OR certification='SCORING_ENGINE_CURRENT_STARTED' OR certification IS NULL OR finished_at IS NULL)
         AND (? IS NULL OR datetime(started_at) >= datetime(?, '-5 minutes'))
         AND (? IS NULL OR output_json LIKE '%' || ? || '%' OR batch_id IN (
           SELECT batch_id FROM scoring_engine_current WHERE batch_id=scoring_engine_batches.batch_id LIMIT 1
         ))
       ORDER BY datetime(started_at) DESC, batch_id DESC
       LIMIT 1`,
    childStartedAt, childStartedAt, requestId, requestId
  );
  if (!batch || !batch.batch_id) return null;

  const counts = await first(env.SCORE_DB,
    `SELECT COUNT(*) AS current_rows,
            SUM(CASE WHEN score_0_100 IS NULL THEN 1 ELSE 0 END) AS missing_score_rows,
            SUM(CASE WHEN selected_side IS NULL OR selected_side = '' THEN 1 ELSE 0 END) AS missing_selected_side_rows,
            SUM(CASE WHEN matrix_id IS NULL OR matrix_id = '' THEN 1 ELSE 0 END) AS missing_matrix_id_rows,
            MIN(created_at) AS first_row_at,
            MAX(created_at) AS last_row_at,
            CASE WHEN MAX(created_at) IS NOT NULL AND datetime(MAX(created_at)) <= datetime(CURRENT_TIMESTAMP, '-20 seconds') THEN 1 ELSE 0 END AS evidence_quiet
       FROM scoring_engine_current
      WHERE batch_id=?`,
    batch.batch_id
  );
  const currentRows = Number(counts && counts.current_rows || 0);
  const matrixRows = Number(batch.matrix_rows_read || 0);
  const missingScoreRows = Number(counts && counts.missing_score_rows || 0);
  const missingSelectedSideRows = Number(counts && counts.missing_selected_side_rows || 0);
  const missingMatrixIdRows = Number(counts && counts.missing_matrix_id_rows || 0);
  const evidenceQuiet = Number(counts && counts.evidence_quiet || 0) === 1;
  if (currentRows <= 0 || matrixRows <= 0 || currentRows < matrixRows || !evidenceQuiet) return null;

  const issueRow = await first(env.SCORE_DB,
    `SELECT COUNT(*) AS hard_issues
       FROM scoring_engine_issues
      WHERE batch_id=?
        AND UPPER(COALESCE(severity,'')) IN ('BLOCKER','ERROR','FAILED')
        AND COALESCE(issue_count,0) > 0`,
    batch.batch_id
  );
  const hardIssues = Number(issueRow && issueRow.hard_issues || 0);
  const invariantHard = missingScoreRows > 0 || missingSelectedSideRows > 0 || missingMatrixIdRows > 0;
  const ok = hardIssues === 0 && !invariantHard;
  const cert = ok ? 'SCORING_ENGINE_CURRENT_CERTIFIED_SCORED_ROWS' : 'SCORING_ENGINE_CURRENT_RECONCILED_WITH_BLOCKERS';
  const grade = ok ? 'PASS_WITH_REVIEW_WARNINGS' : 'BLOCKED';
  const status = ok ? 'completed_scoring_current_reconciled_after_timeout' : 'completed_scoring_current_reconciled_with_blockers';
  const archiveRows = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM scoring_engine_current WHERE batch_id=? AND archive_eligible=1`, batch.batch_id);
  const output = {
    ok,
    data_ok: ok,
    version: SYSTEM_VERSION,
    worker_name: 'alphadog-v2-score-audit',
    logical_worker_name: 'alphadog-v2-scoring-engine',
    job_key: 'scoring-engine',
    request_id: requestId,
    chain_id: child && child.chain_id || null,
    batch_id: batch.batch_id,
    source_matrix_batch_id: null,
    status,
    certification: cert,
    certification_status: cert,
    certification_grade: grade,
    production_scoring_current: true,
    profile_key: batch.profile_key || null,
    profile_version: batch.profile_version || null,
    matrix_rows_read: matrixRows,
    score_rows_written: currentRows,
    rows_read: matrixRows,
    rows_written: currentRows,
    archive_rows_written: Number(archiveRows && archiveRows.rows || 0),
    hard_issue_count: hardIssues,
    missing_score_rows: missingScoreRows,
    missing_selected_side_rows: missingSelectedSideRows,
    missing_matrix_id_rows: missingMatrixIdRows,
    reconciled_after_service_binding_timeout: true,
    terminalized_from_scoring_engine_current_rows: true,
    evidence_first_row_at: counts && counts.first_row_at || null,
    evidence_last_row_at: counts && counts.last_row_at || null,
    no_true_hit_probability_claims: true,
    no_ranking: true,
    no_final_board: true
  };
  await run(env.SCORE_DB,
    `UPDATE scoring_engine_batches
        SET status=?, certification=?, certification_grade=?, score_rows_written=?, archive_rows_written=?, finished_at=CURRENT_TIMESTAMP, output_json=?
      WHERE batch_id=?`,
    status, cert, grade, currentRows, Number(archiveRows && archiveRows.rows || 0), JSON.stringify(output), batch.batch_id
  );
  return {
    batch_id: batch.batch_id,
    request_id: requestId,
    run_id: null,
    worker_name: 'alphadog-v2-scoring-engine',
    worker_version: batch.worker_version || null,
    mode: 'scoring_engine_current_no_cut_all_legs_probability_ledger',
    status,
    prepared_rows_read: matrixRows,
    rows_written: currentRows,
    certification_status: cert,
    certification_grade: grade,
    output_json: JSON.stringify(output),
    updated_at: null,
    created_at: batch.started_at || null
  };
}


async function synthesizeHitProbabilityTerminalProofFromEvidence(env, requestId, child) {
  if (!env.SCORE_DB) return null;
  const hpBatch = await first(env.SCORE_DB,
    `SELECT batch_id, request_id, run_id, worker_version, profile_version, mode, status, source_table, source_final_board_batch_id, source_engine_batch_id, source_rows_read, supported_rows, probability_rows_written, issue_rows_written, certification_status, certification_grade, output_json, created_at, updated_at
       FROM hit_probability_batches
      WHERE request_id=?
      ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
      LIMIT 1`,
    requestId
  );
  if (!hpBatch || !hpBatch.batch_id) return null;

  const hpCounts = await first(env.SCORE_DB,
    `SELECT COUNT(*) AS rows,
            COUNT(DISTINCT probability_row_id) AS distinct_probability_rows,
            COUNT(DISTINCT final_board_row_id) AS distinct_final_board_rows,
            COUNT(DISTINCT prepared_row_id) AS distinct_prepared_rows,
            SUM(CASE WHEN final_board_row_id IS NULL THEN 1 ELSE 0 END) AS null_final_rows,
            SUM(CASE WHEN prepared_row_id IS NULL THEN 1 ELSE 0 END) AS null_prepared_rows,
            SUM(CASE WHEN blocker_count > 0 THEN 1 ELSE 0 END) AS blocker_rows,
            MIN(created_at) AS first_row_at,
            MAX(created_at) AS last_row_at,
            CASE WHEN MAX(created_at) IS NOT NULL AND datetime(MAX(created_at)) <= datetime(CURRENT_TIMESTAMP, '-10 seconds') THEN 1 ELSE 0 END AS evidence_quiet
       FROM hit_probability_current
      WHERE batch_id=?`,
    hpBatch.batch_id
  );
  const hpRows = Number(hpCounts && hpCounts.rows || 0);
  if (hpRows <= 0) return null;

  const boardBatch = await first(env.SCORE_DB,
    `SELECT hp_board_batch_id, worker_version, profile_key, profile_version, mode, status, source_hp_batch_id, source_final_board_batch_id, source_engine_batch_id, source_rows_read, board_rows_written, history_rows_written, issue_rows_written, primary_rows, review_rows, fade_rows, certification_status, certification_grade, output_json, created_at, updated_at
       FROM hp_board_batches
      WHERE source_hp_batch_id=?
      ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
      LIMIT 1`,
    hpBatch.batch_id
  );
  const boardCounts = boardBatch && boardBatch.hp_board_batch_id ? await first(env.SCORE_DB,
    `SELECT COUNT(*) AS rows,
            COUNT(DISTINCT hp_board_row_id) AS distinct_rows,
            COUNT(DISTINCT hp_rank) AS distinct_ranks,
            MIN(hp_rank) AS min_rank,
            MAX(hp_rank) AS max_rank,
            SUM(CASE WHEN calibration_json IS NULL THEN 1 ELSE 0 END) AS missing_calibration_rows,
            SUM(CASE WHEN blocker_count > 0 THEN 1 ELSE 0 END) AS blocker_rows
       FROM hp_board_current
      WHERE hp_board_batch_id=?`,
    boardBatch.hp_board_batch_id
  ) : null;

  const boardRows = Number(boardCounts && boardCounts.rows || 0);
  const missingCalibration = Number(boardCounts && boardCounts.missing_calibration_rows || 0);
  const hpBlockers = Number(hpCounts && hpCounts.blocker_rows || 0);
  const boardBlockers = Number(boardCounts && boardCounts.blocker_rows || 0);
  const ranksOk = boardRows > 0 && Number(boardCounts && boardCounts.distinct_ranks || 0) === boardRows && Number(boardCounts && boardCounts.min_rank || 0) === 1 && Number(boardCounts && boardCounts.max_rank || 0) === boardRows;
  const linksOk = Number(hpCounts && hpCounts.null_final_rows || 0) === 0 && Number(hpCounts && hpCounts.null_prepared_rows || 0) === 0;
  const parityOk = boardRows === hpRows && Number(boardCounts && boardCounts.distinct_rows || 0) === boardRows;
  const quiet = Number(hpCounts && hpCounts.evidence_quiet || 0) === 1;
  if (!boardBatch || boardRows <= 0 || !quiet) return null;

  const ok = parityOk && linksOk && ranksOk && missingCalibration === 0 && hpBlockers === 0 && boardBlockers === 0;
  const cert = ok ? "HP_BOARD_DISPLAY_CALIBRATION_CERTIFIED_INTERNAL_RECENT_FORM" : "HP_BOARD_RECONCILED_WITH_BLOCKERS";
  const grade = ok ? "PASS_WITH_TRUE_CALIBRATION_BLOCKED" : "BLOCKED";
  const status = ok ? "completed_hp_board_current_display_calibrated_reconciled_after_timeout" : "completed_hp_board_reconciled_with_blockers";
  const output = {
    ok,
    data_ok: ok,
    version: SYSTEM_VERSION,
    worker_name: "alphadog-v2-score-audit",
    logical_worker_name: "alphadog-v2-hit-probability",
    job_key: "hit-probability",
    request_id: requestId,
    chain_id: child && child.chain_id || null,
    mode: "hit_probability_current_estimate_no_cut_all_rows",
    status,
    certification: cert,
    certification_status: cert,
    certification_grade: grade,
    batch_id: hpBatch.batch_id,
    hp_board_batch_id: boardBatch.hp_board_batch_id,
    source_final_board_batch_id: hpBatch.source_final_board_batch_id || boardBatch.source_final_board_batch_id || null,
    source_engine_batch_id: hpBatch.source_engine_batch_id || boardBatch.source_engine_batch_id || null,
    rows_read: Number(hpBatch.source_rows_read || hpRows),
    rows_written: hpRows,
    source_rows_read: Number(hpBatch.source_rows_read || hpRows),
    probability_rows_written: hpRows,
    hp_board_current_written: boardRows,
    board_rows_written: boardRows,
    issue_rows_written: Number(boardBatch.issue_rows_written || hpBatch.issue_rows_written || 0),
    primary_rows: Number(boardBatch.primary_rows || 0),
    review_rows: Number(boardBatch.review_rows || 0),
    fade_rows: Number(boardBatch.fade_rows || 0),
    terminalized_from_hit_probability_hp_board_rows: true,
    reconciled_after_service_binding_timeout: true,
    evidence_first_row_at: hpCounts && hpCounts.first_row_at || null,
    evidence_last_row_at: hpCounts && hpCounts.last_row_at || null,
    raw_hp_preserved: true,
    hp_board_display_calibration_required: true,
    hp_board_display_calibration_written: missingCalibration === 0,
    calibration_type: "internal_recent_form_display_only",
    no_true_hit_probability_claims: true,
    no_true_probability_claims: true,
    no_score_mutation: true,
    no_final_board_mutation: true,
    no_prepared_board_mutation: true,
    no_source_board_mutation: true,
    no_ranking: false,
    hp_board_ranking: true,
    rank_integrity_ok: ranksOk,
    row_parity_ok: parityOk,
    link_integrity_ok: linksOk,
    blocker_rows: hpBlockers + boardBlockers
  };

  await run(env.SCORE_DB,
    `UPDATE hit_probability_batches
        SET status=?, certification_status=?, certification_grade=?, probability_rows_written=?, output_json=?, updated_at=CURRENT_TIMESTAMP
      WHERE batch_id=?`,
    status, cert, grade, hpRows, JSON.stringify(output), hpBatch.batch_id
  );
  await run(env.SCORE_DB,
    `UPDATE hp_board_batches
        SET status=?, certification_status=?, certification_grade=?, board_rows_written=?, history_rows_written=?, output_json=?, updated_at=CURRENT_TIMESTAMP
      WHERE hp_board_batch_id=?`,
    status, cert, grade, boardRows, boardRows, JSON.stringify(output), boardBatch.hp_board_batch_id
  );

  return {
    batch_id: boardBatch.hp_board_batch_id,
    request_id: requestId,
    run_id: hpBatch.run_id || null,
    worker_name: "alphadog-v2-score-audit",
    worker_version: boardBatch.worker_version || hpBatch.worker_version || null,
    mode: "hit_probability_current_estimate_no_cut_all_rows",
    status,
    prepared_rows_read: Number(hpBatch.source_rows_read || hpRows),
    rows_written: boardRows,
    certification_status: cert,
    certification_grade: grade,
    output_json: JSON.stringify(output),
    updated_at: boardBatch.updated_at || null,
    created_at: boardBatch.created_at || hpBatch.created_at || null
  };
}


async function rescueHitProbabilityCurrentReadyForHpBoardChild(env, trigger) {
  if (!env.CONTROL_DB || !env.SCORE_DB) return null;
  const children = await all(env.CONTROL_DB,
    `SELECT c.request_id, c.chain_id, c.parent_request_id, c.job_key, c.worker_name, c.status, c.tick_count, c.input_json, c.output_json, c.created_at, c.started_at, c.finished_at, c.updated_at,
            p.request_id AS parent_request_id_resolved, p.chain_id AS parent_chain_id, p.job_key AS parent_job_key, p.worker_name AS parent_worker_name
       FROM control_job_queue c
       JOIN control_job_queue p ON p.request_id = c.parent_request_id AND p.chain_id = c.chain_id
       WHERE p.job_key='market-scoring-full-run'
         AND p.worker_name='alphadog-v2-orchestrator'
         AND p.status IN ('pending','running','partial_continue')
         AND p.finished_at IS NULL
         AND c.parent_request_id IS NOT NULL
         AND c.job_key='hit-probability'
         AND c.status='running'
         AND c.finished_at IS NULL
         AND datetime(c.updated_at) <= datetime(CURRENT_TIMESTAMP, '-20 seconds')
       ORDER BY datetime(c.updated_at) ASC
       LIMIT 3`
  );
  for (const child of children || []) {
    const hpBatch = await first(env.SCORE_DB,
      `SELECT batch_id, request_id, status, source_rows_read, supported_rows, probability_rows_written, certification_status, certification_grade, output_json, updated_at, created_at
         FROM hit_probability_batches
        WHERE request_id=?
          AND status IN ('hit_probability_current_complete_hp_board_pending','completed_recent_form_hit_rate_written')
          AND certification_status IS NOT NULL
        ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
        LIMIT 1`,
      child.request_id
    );
    if (!hpBatch || !hpBatch.batch_id) continue;
    const hpRows = await first(env.SCORE_DB,
      `SELECT COUNT(*) AS rows FROM hit_probability_current WHERE batch_id=?`,
      hpBatch.batch_id
    ) || {};
    if (Number(hpRows.rows || 0) <= 0) continue;
    const boardBatch = await first(env.SCORE_DB,
      `SELECT hp_board_batch_id, status, certification_status, updated_at
         FROM hp_board_batches
        WHERE source_hp_batch_id=?
          AND status NOT LIKE 'running%'
          AND certification_status IS NOT NULL
        ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
        LIMIT 1`,
      hpBatch.batch_id
    );
    if (boardBatch && boardBatch.hp_board_batch_id) {
      const stage = MARKET_SCORING_FULL_RUN_STAGES.find(s => s.stage_key === 'hit_probability');
      const reconciled = await reconcileMarketScoringFullRunChildFromProof(env, stage, child, `${trigger}:hp_board_terminal_evidence_hot_rescue`);
      if (reconciled && reconciled.reconciled === true) {
        const parent = await first(env.CONTROL_DB,
          `SELECT request_id, chain_id, job_key, worker_name, status, tick_count, input_json
             FROM control_job_queue
            WHERE request_id=?
              AND job_key='market-scoring-full-run'
              AND worker_name='alphadog-v2-orchestrator'
              AND status IN ('pending','running','partial_continue')
              AND finished_at IS NULL
            LIMIT 1`,
          child.parent_request_id
        );
        if (parent) {
          await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE request_id=?", parent.request_id);
          return parent;
        }
      }
      continue;
    }
    const requeueOutput = {
      ok: true,
      data_ok: true,
      version: SYSTEM_VERSION,
      worker_name: child.worker_name,
      job_key: child.job_key,
      request_id: child.request_id,
      chain_id: child.chain_id,
      status: 'PARTIAL_CONTINUE_HIT_PROBABILITY_HP_CURRENT_READY_REQUEUED_FOR_HP_BOARD',
      certification: 'HIT_PROBABILITY_HP_CURRENT_READY_REQUEUED_FOR_HP_BOARD',
      certification_status: 'HIT_PROBABILITY_HP_CURRENT_READY_REQUEUED_FOR_HP_BOARD',
      certification_grade: 'PARTIAL',
      batch_id: hpBatch.batch_id,
      probability_rows_written: Number(hpRows.rows || 0),
      rows_written: Number(hpRows.rows || 0),
      hp_board_missing: true,
      requeued_same_child_for_hp_board_terminalizer: true,
      no_new_child_created: true,
      trigger
    };
    await run(env.CONTROL_DB,
      `UPDATE control_job_queue
          SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL
        WHERE request_id=? AND status='running' AND finished_at IS NULL`,
      JSON.stringify(requeueOutput), child.request_id
    );
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'WARN', 'hit_probability_hp_current_ready_requeued_for_hp_board', 'Recovered running Hit Probability child after HP current rows were written but HP board had not terminalized; same child returned to pending for v0.4.18 fast HP board terminalizer', ?, CURRENT_TIMESTAMP)",
      child.request_id, WORKER_NAME, child.job_key, JSON.stringify({ child_request_id: child.request_id, parent_request_id: child.parent_request_id, hp_batch_id: hpBatch.batch_id, hp_rows: Number(hpRows.rows || 0), trigger, hit_probability_hp_board_running_rescue_v0_2_211: true, no_new_child_created: true, version: SYSTEM_VERSION })
    );
    return { request_id: child.request_id, chain_id: child.chain_id, job_key: child.job_key, worker_name: child.worker_name, status: 'pending', tick_count: child.tick_count, input_json: child.input_json };
  }
  return null;
}

async function rescueMarketScoringFullRunTerminalEvidenceChild(env, trigger) {
  if (!env.CONTROL_DB || !env.MARKET_DB) return null;
  const children = await all(env.CONTROL_DB,
    `SELECT c.request_id, c.chain_id, c.parent_request_id, c.job_key, c.worker_name, c.status, c.tick_count, c.input_json, c.output_json, c.created_at, c.started_at, c.finished_at, c.updated_at,
            p.request_id AS parent_request_id_resolved, p.chain_id AS parent_chain_id, p.job_key AS parent_job_key, p.worker_name AS parent_worker_name
       FROM control_job_queue c
       JOIN control_job_queue p ON p.request_id = c.parent_request_id AND p.chain_id = c.chain_id
       WHERE p.job_key='market-scoring-full-run'
         AND p.worker_name='alphadog-v2-orchestrator'
         AND p.status IN ('pending','running','partial_continue')
         AND p.finished_at IS NULL
         AND c.parent_request_id IS NOT NULL
         AND c.status='running'
         AND c.finished_at IS NULL
         AND c.job_key='market-line-shape-classifier'
         AND datetime(c.updated_at) <= datetime(CURRENT_TIMESTAMP, '-20 seconds')
       ORDER BY datetime(c.updated_at) ASC
       LIMIT 4`
  );
  for (const child of children || []) {
    const stageKey = marketScoringFullRunStageKeyFromChild(child);
    if (stageKey !== "market_context_hitters" && stageKey !== "market_context_pitchers") continue;
    const stage = MARKET_SCORING_FULL_RUN_STAGES.find(s => s.stage_key === stageKey);
    if (!stage) continue;
    const reconciled = await reconcileMarketScoringFullRunChildFromProof(env, stage, child, `${trigger}:terminal_evidence_hot_rescue`);
    if (!reconciled || reconciled.reconciled !== true) continue;
    const parent = await first(env.CONTROL_DB,
      `SELECT request_id, chain_id, job_key, worker_name, status, tick_count, input_json
         FROM control_job_queue
        WHERE request_id=?
          AND job_key='market-scoring-full-run'
          AND worker_name='alphadog-v2-orchestrator'
          AND status IN ('pending','running','partial_continue')
          AND finished_at IS NULL
        LIMIT 1`,
      child.parent_request_id
    );
    if (parent) {
      await run(env.CONTROL_DB,
        "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE request_id=?",
        parent.request_id
      );
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'WARN', 'market_scoring_full_run_terminal_evidence_child_hot_finalized', 'Finalized Market Full player-prop child from quiet evidence rows and returned parent as due work', ?, CURRENT_TIMESTAMP)",
        child.request_id, WORKER_NAME, child.job_key, JSON.stringify({ child_request_id: child.request_id, parent_request_id: parent.request_id, stage_key: stageKey, trigger, reconciled: true, version: SYSTEM_VERSION })
      );
      return parent;
    }
  }
  return null;
}



function parseControlTimestampMs(value) {
  if (!value) return 0;
  const text = String(value);
  const normalized = text.includes("T") ? text : text.replace(" ", "T") + "Z";
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : 0;
}


async function rescheduleStaleScoringEngineChildForResume(env, stageKey, child, latestRun, trigger = "scoring_engine_stale_resume_guard") {
  if (!env || !env.CONTROL_DB || !env.SCORE_DB || !child || !child.request_id) return { rescheduled:false, reason:"missing_env_or_child" };
  if (stageKey !== "scoring_engine") return { rescheduled:false, reason:"not_scoring_engine_stage" };
  if (String(child.status || "") !== "running" || child.finished_at) return { rescheduled:false, reason:"child_not_running" };
  const updatedMs = parseControlTimestampMs(child.updated_at || child.started_at || child.created_at);
  const quietMs = updatedMs ? Date.now() - updatedMs : 0;
  if (quietMs > 0 && quietMs < 45000) return { rescheduled:false, reason:"child_not_quiet_enough", quiet_ms:quietMs, fast_stale_resume_threshold_ms:45000 };
  const batch = await first(env.SCORE_DB, `SELECT batch_id, profile_key, profile_version, worker_version, job_key, status, certification, certification_grade, matrix_rows_read, score_rows_written, archive_rows_written, output_json, started_at, finished_at
       FROM scoring_engine_batches
       WHERE output_json LIKE '%' || ? || '%'
         AND status IN ('partial_continue_scoring_current','running_finalizing_scoring_current','running')
       ORDER BY datetime(started_at) DESC
       LIMIT 1`, child.request_id);
  if (!batch || !batch.batch_id) return { rescheduled:false, reason:"no_running_or_partial_scoring_batch", quiet_ms:quietMs };
  const rowsWritten = Number(batch.score_rows_written || 0);
  const rowsRead = Number(batch.matrix_rows_read || 0);
  const out = parseJsonSafeText(batch.output_json || "{}", {});
  const resumeOutput = {
    ok:true,
    data_ok:true,
    version:SYSTEM_VERSION,
    worker_name:child.worker_name,
    job_key:child.job_key,
    request_id:child.request_id,
    chain_id:child.chain_id || null,
    status:"PENDING_SCORING_ENGINE_STALE_CHILD_RESUME",
    certification:"SCORING_ENGINE_STALE_CHILD_RESUME_ENQUEUED",
    certification_grade:"PARTIAL",
    stage_key:stageKey,
    batch_id:batch.batch_id,
    matrix_rows_read:rowsRead,
    score_rows_written:rowsWritten,
    remaining_rows:out.remaining_rows || (rowsRead ? Math.max(0, rowsRead - rowsWritten) : null),
    quiet_ms:quietMs,
    fast_stale_resume_threshold_ms:45000,
    resume_reason:"running_scoring_child_quiet_45s_with_partial_batch_evidence_no_false_terminal",
    trigger,
    latest_run:latestRun || null
  };
  const nextInput = parseJsonSafeText(child.input_json || "{}", {});
  nextInput.scoring_engine_resume = true;
  nextInput.resume_batch_id = batch.batch_id;
  nextInput.scoring_engine_batch_id = batch.batch_id;
  nextInput.continuation_from_request_id = child.request_id;
  nextInput.scoring_engine_stale_resume = true;
  await run(env.CONTROL_DB,
    "UPDATE control_job_queue SET status='pending', finished_at=NULL, run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status='running'",
    JSON.stringify(nextInput), JSON.stringify(resumeOutput), child.request_id
  );
  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'WARN', 'scoring_engine_stale_child_rescheduled_for_resume', 'Rescheduled stale running Scoring Engine child to pending so worker can resume from existing scoring batch evidence', ?, CURRENT_TIMESTAMP)",
    child.request_id, latestRun && latestRun.run_id ? latestRun.run_id : null, WORKER_NAME, child.job_key, JSON.stringify(resumeOutput)
  );
  return { rescheduled:true, output:resumeOutput };
}

async function rescheduleStalePropFactorChildForResume(env, stageKey, child, latestRun, trigger = "prop_factor_stale_resume_guard") {
  if (!env || !env.CONTROL_DB || !env.SCORE_DB || !child || !child.request_id) return { rescheduled:false, reason:"missing_env_or_child" };
  if (!(stageKey === "prop_factor_hitters" || stageKey === "prop_factor_pitchers")) return { rescheduled:false, reason:"not_prop_factor_stage" };
  if (String(child.status || "") !== "running" || child.finished_at) return { rescheduled:false, reason:"child_not_running" };
  const updatedMs = parseControlTimestampMs(child.updated_at || child.started_at || child.created_at);
  const quietMs = updatedMs ? Date.now() - updatedMs : 0;
  if (quietMs > 0 && quietMs < 45000) return { rescheduled:false, reason:"child_not_quiet_enough", quiet_ms:quietMs, fast_stale_resume_threshold_ms:45000 };
  const family = stageKey === "prop_factor_pitchers" ? "pitcher" : "hitter";
  const batch = await first(env.SCORE_DB, `SELECT batch_id, request_id, run_id, status, factor_family, prepared_rows_read, eligible_rows, packets_written, certification_status, certification_grade, output_json, updated_at, created_at
       FROM prop_factor_batches
       WHERE request_id=? AND factor_family=? AND status='running'
       ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
       LIMIT 1`, child.request_id, family);
  if (!batch || !batch.batch_id) return { rescheduled:false, reason:"no_running_prop_factor_batch" };
  const packetTable = family === "pitcher" ? "prop_factor_pitcher_packets" : "prop_factor_hitter_packets";
  const packetSummary = await first(env.SCORE_DB, `SELECT COUNT(*) AS packets, COUNT(DISTINCT prepared_row_id) AS prepared_rows, MAX(updated_at) AS last_packet_update_at, MAX(created_at) AS last_packet_at FROM ${packetTable} WHERE batch_id=?`, batch.batch_id);
  const packets = Number(packetSummary && packetSummary.packets || 0);
  if (packets <= 0) return { rescheduled:false, reason:"no_packet_evidence_to_resume", batch_id:batch.batch_id, quiet_ms:quietMs };
  const out = parseJsonSafeText(batch.output_json || "{}", {});
  const expected = Number(out.expected_factor_rows || out.remaining_rows && (packets + Number(out.remaining_rows || 0)) || batch.prepared_rows_read || 0) || 0;
  const resumeOutput = {
    ok:true,
    data_ok:true,
    version:SYSTEM_VERSION,
    worker_name:child.worker_name,
    job_key:child.job_key,
    request_id:child.request_id,
    chain_id:child.chain_id || null,
    status:"PENDING_PROP_FACTOR_STALE_CHILD_RESUME",
    certification:"PROP_FACTOR_STALE_CHILD_RESUME_ENQUEUED",
    certification_grade:"PARTIAL",
    stage_key:stageKey,
    factor_family:family,
    batch_id:batch.batch_id,
    packets_written:packets,
    expected_factor_rows:expected || null,
    remaining_rows:expected ? Math.max(0, expected - packets) : null,
    quiet_ms:quietMs,
    last_packet_at:packetSummary && (packetSummary.last_packet_update_at || packetSummary.last_packet_at) || null,
    resume_reason:"running_child_quiet_45s_with_partial_packet_evidence_no_false_terminal",
    fast_stale_resume_threshold_ms:45000,
    trigger,
    latest_run:latestRun || null
  };
  await run(env.CONTROL_DB,
    "UPDATE control_job_queue SET status='pending', finished_at=NULL, run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status='running'",
    JSON.stringify(resumeOutput), child.request_id
  );
  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'WARN', 'prop_factor_stale_child_rescheduled_for_resume', 'Rescheduled stale running Prop Factor child to pending so worker can resume missing rows from existing packet/coverage evidence', ?, CURRENT_TIMESTAMP)",
    child.request_id, latestRun && latestRun.run_id ? latestRun.run_id : null, WORKER_NAME, child.job_key, JSON.stringify(resumeOutput)
  );
  return { rescheduled:true, output:resumeOutput };
}

async function reconcileMarketScoringFullRunChildFromProof(env, stage, child, trigger = "market_scoring_full_run_reconcile") {
  if (!child || String(child.status || "") !== "running" || child.finished_at) return { reconciled: false, reason: "child_not_running" };
  const stageKey = String(stage && stage.stage_key || marketScoringFullRunStageKeyFromChild(child) || "");
  const requestId = String(child.request_id || "");
  const runRows = await all(env.CONTROL_DB,
    "SELECT run_id, status, certification_status, started_at, finished_at FROM control_job_runs WHERE request_id=? ORDER BY datetime(started_at) DESC LIMIT 5",
    requestId
  );
  const latestRun = runRows && runRows.length ? runRows[0] : null;

  let proof = null;
  let proofSource = null;
  if (stageKey === "market_context_teams" && env.MARKET_DB) {
    proof = await first(env.MARKET_DB,
      `SELECT batch_id, request_id, run_id, worker_name, worker_version, mode, status, prepared_rows_read, odds_api_game_odds_rows, certification_status, certification_grade, output_json, updated_at, created_at
       FROM market_context_probe_batches
       WHERE request_id=?
         AND mode='market_teams_game_odds'
         AND certification_status IS NOT NULL
         AND status NOT LIKE 'running%'
       ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
       LIMIT 1`,
      requestId
    );
    proofSource = "MARKET_DB.market_context_probe_batches";
  } else if ((stageKey === "market_context_hitters" || stageKey === "market_context_pitchers") && env.MARKET_DB) {
    const wantedMode = stageKey === "market_context_pitchers" ? "market_pitcher_prop_line_context" : "market_hitter_prop_line_context";
    proof = await first(env.MARKET_DB,
      `SELECT batch_id, request_id, run_id, worker_name, worker_version, mode, status, prepared_rows_read, certification_status, certification_grade, output_json, updated_at, created_at
       FROM market_context_probe_batches
       WHERE request_id=?
         AND mode=?
         AND certification_status IS NOT NULL
         AND status NOT LIKE 'running%'
       ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
       LIMIT 1`,
      requestId, wantedMode
    );
    proofSource = "MARKET_DB.market_context_probe_batches";
    if (!proof) {
      proof = await synthesizeMarketPlayerPropTerminalProofFromEvidence(env, stageKey, requestId);
      if (proof) proofSource = "MARKET_DB.market_context_probe_player_props_quiet_evidence";
    }
  } else if ((stageKey === "prop_factor_hitters" || stageKey === "prop_factor_pitchers") && env.SCORE_DB) {
    proof = await first(env.SCORE_DB,
      `SELECT batch_id, request_id, run_id, worker_name, worker_version, mode, status, prepared_rows_read, packets_written, certification_status, certification_grade, output_json, updated_at, created_at
       FROM prop_factor_batches
       WHERE request_id=?
         AND certification_status IS NOT NULL
         AND status NOT LIKE 'running%'
       ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
       LIMIT 1`,
      requestId
    );
    proofSource = "SCORE_DB.prop_factor_batches";
  } else if (stageKey === "prop_matrix_build" && env.SCORE_DB) {
    proof = await first(env.SCORE_DB,
      `SELECT batch_id, request_id, run_id, worker_name, worker_version, mode, status, prepared_rows_read, matrix_rows_written, certification_status, certification_grade, output_json, updated_at, created_at
       FROM prop_matrix_batches
       WHERE request_id=?
         AND certification_status IS NOT NULL
         AND status NOT LIKE 'running%'
       ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
       LIMIT 1`,
      requestId
    );
    proofSource = "SCORE_DB.prop_matrix_batches";
  } else if (stageKey === "scoring_engine" && env.SCORE_DB) {
    proof = await first(env.SCORE_DB,
      `SELECT batch_id, NULL AS request_id, NULL AS run_id, 'alphadog-v2-scoring-engine' AS worker_name, worker_version, 'scoring_engine_current_no_cut_all_legs_probability_ledger' AS mode, status, matrix_rows_read AS prepared_rows_read, score_rows_written AS rows_written, certification AS certification_status, certification_grade, output_json, finished_at AS updated_at, started_at AS created_at
       FROM scoring_engine_batches
       WHERE status='completed_scoring_current_rows_written'
         AND certification='SCORING_ENGINE_CURRENT_CERTIFIED_SCORED_ROWS'
         AND certification_grade LIKE 'PASS%'
         AND output_json LIKE '%' || ? || '%'
       ORDER BY datetime(finished_at) DESC, datetime(started_at) DESC
       LIMIT 1`,
      requestId
    );
    proofSource = "SCORE_DB.scoring_engine_batches";
    if (!proof) {
      proof = await synthesizeScoringEngineCurrentTerminalProofFromEvidence(env, requestId, child);
      if (proof) proofSource = "SCORE_DB.scoring_engine_current_quiet_evidence";
    }
  } else if (stageKey === "scoring_engine_simulation" && env.SCORE_DB) {
    proof = await first(env.SCORE_DB,
      `SELECT simulation_batch_id AS batch_id, NULL AS request_id, NULL AS run_id, 'alphadog-v2-scoring-engine' AS worker_name, worker_version, 'scoring_engine_simulation_shadow_strict_b' AS mode, status, matrix_rows_read AS prepared_rows_read, simulation_rows_written AS rows_written, certification AS certification_status, certification_grade, output_json, finished_at AS updated_at, started_at AS created_at
       FROM scoring_engine_simulation_batches
       WHERE certification IS NOT NULL
         AND status NOT LIKE 'running%'
         AND output_json LIKE '%' || ? || '%'
       ORDER BY datetime(finished_at) DESC, datetime(started_at) DESC
       LIMIT 1`,
      requestId
    );
    proofSource = "SCORE_DB.scoring_engine_simulation_batches";
  } else if (stageKey === "score_final_board" && env.SCORE_DB) {
    proof = await first(env.SCORE_DB,
      `SELECT final_board_batch_id AS batch_id, NULL AS request_id, NULL AS run_id, 'alphadog-v2-score-final-board' AS worker_name, worker_version, 'score_final_board_generate_current' AS mode, status, matrix_rows_read AS prepared_rows_read, final_rows_written AS rows_written, certification AS certification_status, certification_grade, output_json, finished_at AS updated_at, started_at AS created_at
       FROM score_final_board_batches
       WHERE certification IS NOT NULL
         AND status NOT LIKE 'running%'
         AND output_json LIKE '%' || ? || '%'
       ORDER BY datetime(finished_at) DESC, datetime(started_at) DESC
       LIMIT 1`,
      requestId
    );
    proofSource = "SCORE_DB.score_final_board_batches";
  } else if (stageKey === "hit_probability" && env.SCORE_DB) {
    proof = await first(env.SCORE_DB,
      `SELECT hp.hp_board_batch_id AS batch_id, hp.request_id, hp.run_id, hp.worker_version, hp.mode, hp.status, hp.source_rows_read AS prepared_rows_read, hp.board_rows_written AS rows_written, hp.certification_status, hp.certification_grade, hp.output_json, hp.updated_at, hp.created_at
       FROM hp_board_batches hp
       WHERE hp.request_id=?
         AND hp.certification_status IS NOT NULL
         AND hp.status NOT LIKE 'running%'
       ORDER BY datetime(hp.updated_at) DESC, datetime(hp.created_at) DESC
       LIMIT 1`,
      requestId
    );
    proofSource = "SCORE_DB.hp_board_batches";
    if (!proof) {
      proof = await synthesizeHitProbabilityTerminalProofFromEvidence(env, requestId, child);
      if (proof) proofSource = "SCORE_DB.hit_probability_hp_board_quiet_evidence";
    }
  }

  if (!proof) {
    const scoringResume = await rescheduleStaleScoringEngineChildForResume(env, stageKey, child, latestRun, trigger);
    if (scoringResume && scoringResume.rescheduled === true) return { reconciled:false, rescheduled:true, reason:"scoring_engine_child_rescheduled_for_resume", output:scoringResume.output, latest_run:latestRun || null };
    const resume = await rescheduleStalePropFactorChildForResume(env, stageKey, child, latestRun, trigger);
    if (resume && resume.rescheduled === true) return { reconciled:false, rescheduled:true, reason:"prop_factor_child_rescheduled_for_resume", output:resume.output, latest_run:latestRun || null };
    return { reconciled: false, reason: "no_terminal_child_proof_found", latest_run: latestRun || null };
  }
  const outputFromProof = parseJsonSafeText(proof.output_json || "{}", {});
  const cert = String(proof.certification_status || proof.certification || outputFromProof.certification || outputFromProof.certification_status || "MARKET_SCORING_CHILD_RECONCILED_FROM_PROOF").slice(0, 120);
  const grade = String(proof.certification_grade || outputFromProof.certification_grade || "PASS");
  const gradeUpper = String(grade || "").toUpperCase();
  const certUpper = String(cert || "").toUpperCase();
  const proofStatusLower = String(proof.status || outputFromProof.status || "").toLowerCase();
  const proofPacketsWritten = Number(proof.packets_written || outputFromProof.packets_written || 0);
  const proofEligibleRows = Number(proof.eligible_rows || outputFromProof.eligible_rows || proof.prepared_rows_read || outputFromProof.prepared_rows_read || 0);
  const propFactorBlockedRowsTerminalPass = (stageKey === "prop_factor_hitters" || stageKey === "prop_factor_pitchers")
    && gradeUpper === "PASS_WITH_BLOCKED_ROWS"
    && certUpper.includes("PROP_FACTOR_PACKETS_CERTIFIED")
    && proofStatusLower.includes("completed")
    && proofPacketsWritten > 0
    && proofEligibleRows > 0
    && !certUpper.includes("FAILED");
  const proofBodyExplicitFailure = outputFromProof.ok === false || outputFromProof.data_ok === false;
  const ok = propFactorBlockedRowsTerminalPass
    || (
      !proofBodyExplicitFailure
      && !gradeUpper.includes("BLOCKED")
      && !gradeUpper.includes("FAILED")
      && !certUpper.includes("FAILED")
      && !proofStatusLower.includes("failed")
      && !proofStatusLower.includes("error")
    );
  const rowsRead = Number(proof.prepared_rows_read || proof.matrix_rows_read || outputFromProof.rows_read || outputFromProof.prepared_rows_read || 0);
  const rowsWritten = Number(proof.rows_written || proof.packets_written || proof.matrix_rows_written || outputFromProof.rows_written || outputFromProof.packets_written || outputFromProof.matrix_rows_written || outputFromProof.simulation_rows_written || outputFromProof.final_rows_written || 0);
  const externalCalls = Number(outputFromProof.external_calls_performed || outputFromProof.external_calls || 0);
  const reconciledOutput = {
    ...outputFromProof,
    ok,
    data_ok: ok,
    version: SYSTEM_VERSION,
    worker_name: child.worker_name,
    job_key: child.job_key,
    request_id: requestId,
    chain_id: child.chain_id,
    status: proof.status || outputFromProof.status || "completed_reconciled_from_child_proof",
    certification: cert,
    certification_status: cert,
    certification_grade: grade,
    rows_read: rowsRead,
    rows_written: rowsWritten,
    external_calls_performed: externalCalls,
    batch_id: proof.batch_id || outputFromProof.batch_id || null,
    reconciled_from_child_proof: true,
    proof_source: proofSource,
    latest_dispatch_run: latestRun || null,
    trigger
  };
  const queueStatus = ok ? "completed" : "failed";
  await run(env.CONTROL_DB,
    "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=? AND status IN ('running','pending','partial_continue')",
    queueStatus, JSON.stringify(reconciledOutput), ok ? null : "market_scoring_child_reconciled_failed_proof", ok ? null : String(cert).slice(0, 900), requestId
  );
  const targetRunId = latestRun && latestRun.run_id ? latestRun.run_id : rid("run_reconciled");
  await run(env.CONTROL_DB,
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT started_at FROM control_job_runs WHERE run_id=?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, 0, ?, ?, ?, ?)",
    targetRunId, requestId, child.chain_id, child.job_key, child.worker_name, queueStatus, ok ? 1 : 0, cert, rowsRead, rowsWritten, externalCalls, targetRunId, child.input_json || "{}", JSON.stringify(reconciledOutput), ok ? null : "market_scoring_child_reconciled_failed_proof", ok ? null : String(cert).slice(0, 900)
  );
  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'market_scoring_full_run_child_reconciled_from_proof', 'Reconciled running Market Scoring Full Run child from terminal worker proof table instead of redispatching', ?, CURRENT_TIMESTAMP)",
    requestId, targetRunId, WORKER_NAME, child.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ stage_key: stageKey, proof_source: proofSource, certification: cert, certification_grade: grade, batch_id: proof.batch_id || null, no_duplicate_dispatch: true, version: SYSTEM_VERSION })
  );
  return { reconciled: true, ok, output: reconciledOutput };
}

function isMarketScoringFullRunPartialChildOutput(output) {
  if (!output) return false;
  const status = String(output.status || "").toLowerCase();
  const cert = String(output.certification || output.certification_status || "").toUpperCase();
  const grade = String(output.certification_grade || "").toUpperCase();
  return output.continuation_required === true
    || output.orchestrator_should_self_continue === true
    || Number(output.remaining_rows || 0) > 0
    || status.includes("partial_continue")
    || cert.includes("PARTIAL_CONTINUE")
    || grade === "PARTIAL";
}

function childPassedMarketScoringFullRun(stage, child) {
  if (!child) return { pass: false, wait: false, reason: "child_missing" };
  const status = String(child.status || "");
  if (["pending", "running", "partial_continue"].includes(status) && !child.finished_at) return { pass: false, wait: true, reason: "child_active", child_status: status };
  const output = parseJsonSafeText(child.output_json || "{}", {});
  const cert = String(output.certification || output.certification_status || "");
  if (status === "completed" && isMarketScoringFullRunPartialChildOutput(output)) {
    return {
      pass: false,
      wait: true,
      reason: "child_partial_continue_not_terminal",
      child_status: status,
      certification: cert,
      certification_grade: output.certification_grade || null,
      rows_read: output.rows_read || output.prepared_rows_read || output.matrix_rows_read || 0,
      rows_written: output.rows_written || output.packets_written || output.matrix_rows_written || output.simulation_rows_written || output.current_rows_written || output.final_rows_written || 0,
      batch_id: output.batch_id || output.simulation_batch_id || output.final_board_batch_id || null,
      output
    };
  }
  if (status !== "completed") return { pass: false, wait: false, reason: "child_not_completed", child_status: status, child_error_code: child.error_code || null, child_error_message: child.error_message || null, certification: cert, output };
  if (!output || output.ok !== true || output.data_ok !== true) return { pass: false, wait: false, reason: "child_output_not_data_ok", child_status: status, output_ok: output && output.ok, data_ok: output && output.data_ok, certification: cert, output };
  return {
    pass: true,
    wait: false,
    certification: cert,
    certification_grade: output.certification_grade || null,
    status: output.status || status,
    rows_read: output.rows_read || output.prepared_rows_read || output.matrix_rows_read || 0,
    rows_written: output.rows_written || output.packets_written || output.matrix_rows_written || output.simulation_rows_written || output.current_rows_written || output.final_rows_written || 0,
    external_calls: output.external_calls_performed || output.external_calls || 0,
    batch_id: output.batch_id || output.simulation_batch_id || output.final_board_batch_id || null,
    output
  };
}

async function processMarketScoringFullRunJob(env, row, runId, trigger) {
  const started = Date.now();
  const parentInput = parseJsonSafeText(row.input_json || "{}", {});
  const lock = await ensureMarketScoringFullRunLock(env, row);
  if (!lock.ok) {
    const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "market_scoring_full_run", status: "PARTIAL_CONTINUE_MARKET_SCORING_FULL_RUN_LOCK_BUSY", certification: "MARKET_SCORING_FULL_RUN_LOCK_BUSY_WAIT", lock, continuation_required: true, orchestrator_should_self_continue: true };
    await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'MARKET_SCORING_FULL_RUN_LOCK_BUSY_WAIT', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
    await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=datetime('now','+10 seconds'), updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
    return output;
  }

  const childRows = await all(env.CONTROL_DB,
    "SELECT request_id, chain_id, parent_request_id, job_key, worker_name, worker_group, phase_key, display_name, status, error_code, error_message, output_json, input_json, created_at, started_at, finished_at, updated_at FROM control_job_queue WHERE parent_request_id=? AND chain_id=? ORDER BY datetime(created_at) ASC",
    row.request_id, row.chain_id
  );
  const stageReports = [];

  for (let i = 0; i < MARKET_SCORING_FULL_RUN_STAGES.length; i++) {
    const stage = MARKET_SCORING_FULL_RUN_STAGES[i];
    const stageChildren = childRows.filter(c => {
      const childStageKey = marketScoringFullRunStageKeyFromChild(c);
      return childStageKey ? childStageKey === stage.stage_key : (c.job_key === stage.job_key && c.worker_name === stage.worker_name);
    });
    const child = stageChildren[stageChildren.length - 1] || null;
    if (!child) {
      const extraChildInput = {};
      if (stage.stage_key === "hit_probability") {
        const scoringReport = stageReports.find(r => r.stage_key === "scoring_engine" && r.batch_id);
        if (scoringReport && scoringReport.batch_id) {
          extraChildInput.source_engine_batch_id = scoringReport.batch_id;
          extraChildInput.scoring_engine_batch_id = scoringReport.batch_id;
          extraChildInput.source_engine_batch_required_from_same_chain = true;
        }
        extraChildInput.skip_hp_board = false;
        extraChildInput.hp_board_required = true;
        extraChildInput.hp_board_display_calibration_required = false;
        extraChildInput.service_binding_timeout_reconcile_from_tables = true;
        extraChildInput.hp_first_board_before_final_board = true;
        extraChildInput.no_final_board_source_dependency = true;
        extraChildInput.no_cut_all_legs_probability_ledger = true;
        extraChildInput.read_all_scoring_rows_no_pre_filter = true;
        extraChildInput.probability_row_for_every_scoring_row = true;
        extraChildInput.model_pending_no_cut_rows_allowed = true;
      }
      if (stage.stage_key === "score_final_board") {
        const scoringReport = stageReports.find(r => r.stage_key === "scoring_engine" && r.batch_id);
        const hpReport = stageReports.find(r => r.stage_key === "hit_probability" && r.batch_id);
        if (scoringReport && scoringReport.batch_id) {
          extraChildInput.source_engine_batch_id = scoringReport.batch_id;
          extraChildInput.scoring_engine_batch_id = scoringReport.batch_id;
          extraChildInput.source_engine_batch_required_from_same_chain = true;
        }
        if (hpReport && hpReport.batch_id) {
          extraChildInput.source_hp_board_batch_id = hpReport.batch_id;
          extraChildInput.hp_board_batch_id = hpReport.batch_id;
          extraChildInput.source_hp_board_batch_required_from_same_chain = true;
        }
        extraChildInput.hp_first_final_board_source_active = true;
        extraChildInput.requires_hp_board_current_source = true;
        extraChildInput.must_run_after_hit_probability = true;
        extraChildInput.filter_after_probability_ledger_only = true;
        extraChildInput.no_pre_hp_leg_cut = true;
      }
      const enqueued = await enqueueMarketScoringFullRunChild(env, row, stage, i, 0, extraChildInput);
      const parentRecheckSeconds = marketScoringFullRunParentRecheckSeconds(stage);
      const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "market_scoring_full_run", status: "PARTIAL_CONTINUE_MARKET_SCORING_FULL_RUN_CHILD_ENQUEUED", certification: "MARKET_SCORING_FULL_RUN_CHILD_ENQUEUED", certification_grade: "PARTIAL", current_stage_key: stage.stage_key, current_stage_index: i, child_request_id: enqueued.child_request_id, completed_stage_count: stageReports.length, total_stage_count: MARKET_SCORING_FULL_RUN_STAGES.length, continuation_required: true, orchestrator_should_self_continue: true, hard_child_request_boundary: true, child_run_after_delay_seconds: MARKET_SCORING_FULL_RUN_CHILD_RUN_AFTER_SECONDS, parent_recheck_delay_seconds: parentRecheckSeconds, parent_yielding_to_prop_factor_child: isMarketScoringFullRunPropFactorStage(stage), lock_held: true, approved_chain_order: MARKET_SCORING_FULL_RUN_STAGES.map(s => s.job_key), stages: stageReports };
      await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'MARKET_SCORING_FULL_RUN_CHILD_ENQUEUED', ?, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, i, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
      await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=datetime('now', ?), updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", `+${parentRecheckSeconds} seconds`, JSON.stringify(output), row.request_id);
      return output;
    }
    if (String(child.status || "") === "running" && !child.finished_at) {
      await reconcileMarketScoringFullRunChildFromProof(env, stage, child, trigger);
      const refreshedChild = await first(env.CONTROL_DB,
        "SELECT request_id, chain_id, parent_request_id, job_key, worker_name, worker_group, phase_key, display_name, status, error_code, error_message, output_json, input_json, created_at, started_at, finished_at, updated_at FROM control_job_queue WHERE request_id=? LIMIT 1",
        child.request_id
      );
      if (refreshedChild) Object.assign(child, refreshedChild);
    }
    const validation = childPassedMarketScoringFullRun(stage, child);
    const report = { stage_key: stage.stage_key, job_key: stage.job_key, worker_name: stage.worker_name, request_id: child.request_id, child_status: child.status, pass: validation.pass, wait: validation.wait, reason: validation.reason || null, certification: validation.certification || null, certification_grade: validation.certification_grade || null, rows_read: validation.rows_read || 0, rows_written: validation.rows_written || 0, external_calls: validation.external_calls || 0, batch_id: validation.batch_id || null };
    if (validation.wait) {
      if (validation.reason === "child_partial_continue_not_terminal" && String(child.status || "") === "completed") {
        await run(env.CONTROL_DB,
          "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, finished_at=NULL, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
          JSON.stringify({ ...(validation.output || {}), recovered_to_pending_for_partial_continue: true, recovery_version: SYSTEM_VERSION }), child.request_id
        );
        child.status = "pending";
        child.finished_at = null;
      }
      const parentRecheckSeconds = marketScoringFullRunParentRecheckSeconds(stage);
      const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "market_scoring_full_run", status: "PARTIAL_CONTINUE_MARKET_SCORING_FULL_RUN_WAITING_ON_CHILD", certification: "MARKET_SCORING_FULL_RUN_WAITING_ON_CHILD", certification_grade: "PARTIAL", current_stage_key: stage.stage_key, current_stage_index: i, waiting_on_child_request_id: child.request_id, waiting_on_child_status: child.status, waiting_reason: validation.reason || null, completed_stage_count: stageReports.length, total_stage_count: MARKET_SCORING_FULL_RUN_STAGES.length, stages: [...stageReports, report], continuation_required: true, orchestrator_should_self_continue: true, parent_recheck_delay_seconds: parentRecheckSeconds, parent_yielding_to_prop_factor_child: isMarketScoringFullRunPropFactorStage(stage), lock_held: true };
      await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'MARKET_SCORING_FULL_RUN_WAITING_ON_CHILD', ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, i + 1, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
      await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=datetime('now', ?), updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", `+${parentRecheckSeconds} seconds`, JSON.stringify(output), row.request_id);
      return output;
    }
    if (!validation.pass) {
      const finalStatus = "FAILED_MARKET_SCORING_FULL_RUN_CHILD_FAILED";
      const output = { ok: false, data_ok: false, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "market_scoring_full_run", status: finalStatus, certification: finalStatus, certification_grade: "FAILED", failed_stage_key: stage.stage_key, failed_request_id: child.request_id, failed_reason: validation.reason, child_error_code: child.error_code || null, child_error_message: child.error_message || null, stages: [...stageReports, report], approved_chain_order: MARKET_SCORING_FULL_RUN_STAGES.map(s => s.job_key) };
      await releaseMarketScoringFullRunLock(env, row);
      await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'failed', 0, ?, ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, finalStatus, i + 1, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output), finalStatus.toLowerCase(), String(validation.reason || "market scoring full run child failed").slice(0, 900));
      await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='failed', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?", JSON.stringify(output), finalStatus.toLowerCase(), String(validation.reason || "market scoring full run child failed").slice(0, 900), row.request_id);
      return output;
    }
    stageReports.push(report);
  }

  const rowsRead = stageReports.reduce((sum, r) => sum + Number(r.rows_read || 0), 0);
  const rowsWritten = stageReports.reduce((sum, r) => sum + Number(r.rows_written || 0), 0);
  const externalCalls = stageReports.reduce((sum, r) => sum + Number(r.external_calls || 0), 0);
  const finalCertification = "MARKET_SCORING_FULL_RUN_CERTIFIED_CHAIN_COMPLETED";
  const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "market_scoring_full_run", status: "COMPLETED_MARKET_SCORING_FULL_RUN", certification: finalCertification, certification_grade: "FULL_RUN_PASS_WITH_REVIEW_WARNINGS_ALLOWED", market_scoring_full_run_certified: true, completed_stage_count: stageReports.length, total_stage_count: MARKET_SCORING_FULL_RUN_STAGES.length, rows_read: rowsRead, rows_written: rowsWritten, external_calls: externalCalls, stages: stageReports, approved_chain_order: MARKET_SCORING_FULL_RUN_STAGES.map(s => s.job_key), full_run_order: MARKET_SCORING_FULL_RUN_STAGES.map(s => s.stage_key), no_source_board_mutation: true, no_prepared_board_mutation: true, no_old_production_touch: true, hit_probability_included: true, hp_board_included: true, hp_board_display_calibration_included: false, hp_before_final_board: true, final_board_after_hp: true, hp_first_final_board_source_active: true, no_true_hit_probability_claims: true };
  await releaseMarketScoringFullRunLock(env, row);
  await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'completed', 1, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, finalCertification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
  await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='completed', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
  await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'market_scoring_full_run_completed', 'Market/Factors/Matrix/Scoring/Hit Probability/Final Board full run chain completed', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify(output));
  return output;
}


const DAILY_FULL_RUN_LOCK_KEY = "DAILY_FULL_RUN";
const DAILY_FULL_RUN_STAGES = [
  { stage_key: "daily_context_full_run", job_key: "daily-context-full-run", worker_name: "alphadog-v2-orchestrator", display_name: "Daily Context Full Run", visible_button: "DAILY JOBS > Full Run", mode: "daily_full_run_daily_context", worker_group: "Daily", phase_key: "daily", priority: 3 },
  { stage_key: "board_full_run", job_key: "board-full-run", worker_name: "alphadog-v2-orchestrator", display_name: "Board Full Run", visible_button: "BOARD > Full Run", mode: "daily_full_run_board", worker_group: "Board", phase_key: "board", priority: 3 },
  { stage_key: "market_scoring_full_run", job_key: "market-scoring-full-run", worker_name: "alphadog-v2-orchestrator", display_name: "Market + Scoring Full Run", visible_button: "SCORING > Market Full", mode: "daily_full_run_market_scoring", worker_group: "12 Full Runs", phase_key: "daily_master", priority: 3 }
];

function dailyFullRunStageKeyFromChild(child) {
  const input = parseJsonSafeText((child && child.input_json) || "{}", {});
  return String(input.stage_key || "");
}

function dailyFullRunChildInput(parentRow, stage, stepIndex, retryCount = 0) {
  return {
    source: "daily_full_run_parent",
    visible_button: stage.visible_button,
    mode: stage.mode,
    chain_id: parentRow.chain_id,
    parent_chain_id: parentRow.chain_id,
    parent_request_id: parentRow.request_id,
    stage_key: stage.stage_key,
    stage_index: stepIndex,
    stage_count: DAILY_FULL_RUN_STAGES.length,
    retry_count: retryCount,
    approved_chain_order: DAILY_FULL_RUN_STAGES.map(s => s.job_key),
    stop_on_first_failed_stage: true,
    backend_chain_only: true,
    no_browser_loop: true,
    backend_scheduled_continuation: true,
    no_generic_dispatch: true,
    full_daily_master_run: true,
    includes_daily_context_full_run: stage.stage_key === "daily_context_full_run",
    includes_board_full_run: stage.stage_key === "board_full_run",
    includes_market_scoring_full_run: stage.stage_key === "market_scoring_full_run",
    prepared_for_split_slate: true,
    prepared_for_half_slate: true,
    prepared_for_single_game_slate: true,
    today_tomorrow_retention_only: true,
    no_static_work: true,
    no_base_delta_workers: true,
    no_incremental_morning_full_run: true,
    old_production_mutation_forbidden: true,
    no_old_production_touch: true,
    created_at: nowIso()
  };
}

async function ensureDailyFullRunLock(env, parentRow) {
  await run(env.CONTROL_DB, "INSERT OR IGNORE INTO control_locks (lock_key, lock_flag, updated_at) VALUES (?, 0, CURRENT_TIMESTAMP)", DAILY_FULL_RUN_LOCK_KEY);
  const lock = await first(env.CONTROL_DB,
    "SELECT lock_key, lock_flag, owner_request_id, owner_worker_name, acquired_at, expires_at, updated_at, CASE WHEN expires_at IS NOT NULL AND datetime(expires_at) > datetime('now') THEN 1 ELSE 0 END AS not_expired FROM control_locks WHERE lock_key=?",
    DAILY_FULL_RUN_LOCK_KEY
  );
  const activeOther = await first(env.CONTROL_DB,
    "SELECT request_id, chain_id, status, updated_at FROM control_job_queue WHERE job_key='daily-full-run' AND request_id<>? AND status IN ('pending','running','partial_continue') AND finished_at IS NULL ORDER BY datetime(created_at) DESC LIMIT 1",
    parentRow.request_id
  );
  if (lock && Number(lock.lock_flag) === 1 && lock.owner_request_id && lock.owner_request_id !== parentRow.request_id && Number(lock.not_expired) === 1) {
    return { ok: false, reason: "daily_full_run_lock_busy", lock, active_other_parent: activeOther || null };
  }
  if (lock && Number(lock.lock_flag) === 1 && lock.owner_request_id && lock.owner_request_id !== parentRow.request_id && activeOther) {
    return { ok: false, reason: "daily_full_run_active_parent_exists", lock, active_other_parent: activeOther };
  }
  await run(env.CONTROL_DB,
    "UPDATE control_locks SET lock_flag=1, owner_request_id=?, owner_worker_name=?, acquired_at=COALESCE(acquired_at,CURRENT_TIMESTAMP), expires_at=datetime('now','+45 minutes'), updated_at=CURRENT_TIMESTAMP WHERE lock_key=?",
    parentRow.request_id, WORKER_NAME, DAILY_FULL_RUN_LOCK_KEY
  );
  return { ok: true, recovered_stale_lock: !!(lock && Number(lock.lock_flag) === 1 && lock.owner_request_id !== parentRow.request_id) };
}

async function releaseDailyFullRunLock(env, parentRow) {
  await run(env.CONTROL_DB,
    "UPDATE control_locks SET lock_flag=0, owner_request_id=NULL, owner_worker_name=NULL, expires_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE lock_key=? AND (owner_request_id=? OR owner_request_id IS NULL)",
    DAILY_FULL_RUN_LOCK_KEY, parentRow.request_id
  );
}

async function enqueueDailyFullRunChild(env, parentRow, stage, stepIndex, retryCount = 0) {
  const childRequestId = rid(stage.stage_key.replace(/-/g, "_"));
  const input = dailyFullRunChildInput(parentRow, stage, stepIndex, retryCount);
  await run(env.CONTROL_DB,
    "INSERT INTO control_job_queue (request_id, chain_id, parent_request_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
    childRequestId, parentRow.chain_id, parentRow.request_id, stage.job_key, stage.worker_name, stage.worker_group, stage.phase_key, stage.display_name, stage.priority, JSON.stringify(input)
  );
  return { child_request_id: childRequestId, input };
}

function dailyFullRunChildPassed(stage, child) {
  if (!child) return { pass: false, wait: false, reason: "child_missing" };
  const childStatus = String(child.status || "");
  if (["pending", "running", "partial_continue"].includes(childStatus) && !child.finished_at) {
    return { pass: false, wait: true, reason: "child_active", child_status: childStatus };
  }
  const output = parseJsonSafeText(child.output_json || "{}", {});
  if (childStatus !== "completed") return { pass: false, reason: "child_not_completed", child_status: childStatus, child_error_code: child.error_code || null, child_error_message: child.error_message || null };
  if (!output || output.ok !== true) return { pass: false, reason: "child_output_ok_not_true", output_ok: output && output.ok };
  if (output.data_ok !== true) return { pass: false, reason: "child_data_ok_not_true", data_ok: output && output.data_ok };
  if (stage.stage_key === "daily_context_full_run") {
    if (output.daily_context_full_run_certified !== true) return { pass: false, reason: "daily_context_full_run_not_certified", certification: output.certification || output.certification_status || null };
    if (Number(output.completed_stage_count || 0) !== Number(output.total_stage_count || DAILY_CONTEXT_FULL_RUN_STAGES.length)) return { pass: false, reason: "daily_context_full_run_stage_count_mismatch", completed_stage_count: output.completed_stage_count || 0, total_stage_count: output.total_stage_count || null };
  }
  if (stage.stage_key === "board_full_run") {
    if (output.board_full_run_certified !== true) return { pass: false, reason: "board_full_run_not_certified", certification: output.certification || output.certification_status || null };
    if (output.board_prep_completed !== true) return { pass: false, reason: "board_full_run_score_prep_not_completed", board_prep_completed: output.board_prep_completed };
  }
  if (stage.stage_key === "market_scoring_full_run") {
    if (output.market_scoring_full_run_certified !== true) return { pass: false, reason: "market_scoring_full_run_not_certified", certification: output.certification || output.certification_status || null };
    if (output.hit_probability_included !== true || output.hp_board_included !== true) return { pass: false, reason: "market_scoring_full_run_hit_probability_missing", hit_probability_included: output.hit_probability_included, hp_board_included: output.hp_board_included };
  }
  return { pass: true, certification: output.certification || output.certification_status || null, certification_grade: output.certification_grade || null, output };
}

async function processDailyFullRunJob(env, row, runId, trigger) {
  const started = Date.now();
  const parentInput = parseJsonSafeText(row.input_json || "{}", {});
  const lock = await ensureDailyFullRunLock(env, row);
  if (!lock.ok) {
    const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "daily_full_run", status: "PARTIAL_CONTINUE_DAILY_FULL_RUN_LOCK_BUSY", certification: "DAILY_FULL_RUN_LOCK_BUSY_WAIT", lock, continuation_required: true, orchestrator_should_self_continue: true };
    await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'DAILY_FULL_RUN_LOCK_BUSY_WAIT', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
    await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=datetime('now','+10 seconds'), updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
    return output;
  }

  const childRows = await all(env.CONTROL_DB,
    "SELECT request_id, chain_id, parent_request_id, job_key, worker_name, worker_group, phase_key, display_name, status, error_code, error_message, output_json, input_json, created_at, started_at, finished_at, updated_at FROM control_job_queue WHERE parent_request_id=? AND chain_id=? ORDER BY datetime(created_at) ASC",
    row.request_id, row.chain_id
  );
  const stageReports = [];

  for (let i = 0; i < DAILY_FULL_RUN_STAGES.length; i++) {
    const stage = DAILY_FULL_RUN_STAGES[i];
    const stageChildren = childRows.filter(c => {
      const childStageKey = dailyFullRunStageKeyFromChild(c);
      return childStageKey ? childStageKey === stage.stage_key : (c.job_key === stage.job_key && c.worker_name === stage.worker_name);
    });
    const child = stageChildren[stageChildren.length - 1] || null;

    if (!child) {
      const enqueued = await enqueueDailyFullRunChild(env, row, stage, i, 0);
      const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "daily_full_run", status: "PARTIAL_CONTINUE_DAILY_FULL_RUN_CHILD_ENQUEUED", certification: "DAILY_FULL_RUN_CHILD_ENQUEUED", certification_grade: "PARTIAL", current_stage_key: stage.stage_key, current_stage_index: i, child_request_id: enqueued.child_request_id, completed_stage_count: stageReports.length, total_stage_count: DAILY_FULL_RUN_STAGES.length, continuation_required: true, orchestrator_should_self_continue: true, hard_child_request_boundary: true, child_run_after_delay_seconds: 0, parent_recheck_delay_seconds: 0, lock_held: true, approved_chain_order: DAILY_FULL_RUN_STAGES.map(s => s.job_key), stages: stageReports, full_daily_master_run: true };
      await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'DAILY_FULL_RUN_CHILD_ENQUEUED', ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, i + 1, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
      await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
      await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'daily_full_run_child_enqueued', 'Daily Full Run enqueued next parent full-run stage', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ parent_request_id: row.request_id, child_request_id: enqueued.child_request_id, stage_key: stage.stage_key, stage_index: i, mode: stage.mode, approved_chain_order: DAILY_FULL_RUN_STAGES.map(s => s.job_key) }));
      return output;
    }

    const validation = dailyFullRunChildPassed(stage, child);
    const childOutput = parseJsonSafeText(child.output_json || "{}", {});
    const report = { stage_key: stage.stage_key, job_key: stage.job_key, mode: stage.mode, child_request_id: child.request_id, child_status: child.status, child_certification: childOutput.certification || childOutput.certification_status || null, child_certification_grade: childOutput.certification_grade || null, child_data_ok: childOutput.data_ok === true, pass: validation.pass, wait: !!validation.wait, reason: validation.reason || null, completed_stage_count: childOutput.completed_stage_count || null, total_stage_count: childOutput.total_stage_count || null, rows_read: childOutput.rows_read || childOutput.prepared_rows_read || 0, rows_written: childOutput.rows_written || childOutput.current_rows_written || childOutput.prepared_rows || 0, external_calls: childOutput.external_calls || 0, child_summary_flags: { daily_context_full_run_certified: childOutput.daily_context_full_run_certified === true, board_full_run_certified: childOutput.board_full_run_certified === true, board_prep_completed: childOutput.board_prep_completed === true, market_scoring_full_run_certified: childOutput.market_scoring_full_run_certified === true, hit_probability_included: childOutput.hit_probability_included === true, hp_board_included: childOutput.hp_board_included === true } };

    if (validation.wait) {
      const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "daily_full_run", status: "PARTIAL_CONTINUE_DAILY_FULL_RUN_WAITING_ON_CHILD", certification: "DAILY_FULL_RUN_WAITING_ON_CHILD", certification_grade: "PARTIAL", current_stage_key: stage.stage_key, current_stage_index: i, waiting_on_child_request_id: child.request_id, waiting_on_child_status: child.status, completed_stage_count: stageReports.length, total_stage_count: DAILY_FULL_RUN_STAGES.length, stages: [...stageReports, report], continuation_required: true, orchestrator_should_self_continue: true, lock_held: true };
      await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'DAILY_FULL_RUN_WAITING_ON_CHILD', ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, i + 1, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
      await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=datetime('now','+6 seconds'), updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
      return output;
    }

    if (!validation.pass) {
      const finalStatus = "FAILED_DAILY_FULL_RUN_CHILD_FAILED";
      const output = { ok: false, data_ok: false, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "daily_full_run", status: finalStatus, certification: finalStatus, certification_grade: "FAILED", failed_stage_key: stage.stage_key, failed_request_id: child.request_id, failed_reason: validation.reason, child_error_code: child.error_code || null, child_error_message: child.error_message || null, stages: [...stageReports, report], completed_stage_count: stageReports.length, total_stage_count: DAILY_FULL_RUN_STAGES.length, approved_chain_order: DAILY_FULL_RUN_STAGES.map(s => s.job_key), full_daily_master_run_certified: false };
      await releaseDailyFullRunLock(env, row);
      await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'failed', 0, ?, ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, finalStatus, i + 1, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output), finalStatus.toLowerCase(), String(validation.reason || "daily full run child failed").slice(0, 900));
      await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='failed', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?", JSON.stringify(output), finalStatus.toLowerCase(), String(validation.reason || "daily full run child failed").slice(0, 900), row.request_id);
      return output;
    }

    stageReports.push(report);
  }

  const rowsRead = stageReports.reduce((sum, r) => sum + Number(r.rows_read || 0), 0);
  const rowsWritten = stageReports.reduce((sum, r) => sum + Number(r.rows_written || 0), 0);
  const externalCalls = stageReports.reduce((sum, r) => sum + Number(r.external_calls || 0), 0);
  const warningStages = stageReports.filter(r => String(r.child_certification_grade || "").toUpperCase().includes("WARNING") || String(r.child_certification_grade || "").toUpperCase().includes("HARD_BLOCKER")).length;
  const finalCertification = warningStages > 0 ? "DAILY_FULL_RUN_CERTIFIED_WITH_WARNINGS" : "DAILY_FULL_RUN_CERTIFIED";
  const finalGrade = warningStages > 0 ? "FULL_RUN_PASS_WITH_WARNINGS" : "FULL_RUN_PASS";
  const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "daily_full_run", status: "COMPLETED_DAILY_FULL_RUN", certification: finalCertification, certification_grade: finalGrade, full_daily_master_run_certified: true, completed_stage_count: stageReports.length, total_stage_count: DAILY_FULL_RUN_STAGES.length, rows_read: rowsRead, rows_written: rowsWritten, external_calls: externalCalls, warning_stage_count: warningStages, stages: stageReports, approved_chain_order: DAILY_FULL_RUN_STAGES.map(s => s.job_key), full_run_order: DAILY_FULL_RUN_STAGES.map(s => s.stage_key), includes_daily_context_full_run: true, includes_board_full_run: true, includes_market_scoring_full_run: true, includes_pricepicks_refresh: true, includes_sleeper_refresh: true, includes_score_prep: true, includes_market_context: true, includes_factors_matrix_scoring_final_board: true, includes_hit_probability: true, prepared_for_split_slate: true, prepared_for_half_slate: true, prepared_for_single_game_slate: true, no_static_work: true, no_base_delta_workers: true, no_incremental_morning_full_run: true, no_old_production_touch: true };
  await releaseDailyFullRunLock(env, row);
  await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'completed', 1, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, finalCertification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
  await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='completed', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
  await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'daily_full_run_completed', 'Daily Full Run certified Daily Context Full Run, Board Full Run, and Market/Scoring Full Run in order', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify(output));
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
  // Legacy helper retained for compatibility only. The active daily Full Run schedule is now
  // CONFIG_DB.config_scheduled_jobs driven, not hardcoded to 1:00 AM Pacific.
  return Number(pt.hour) === 5 && Number(pt.minute) >= 0 && Number(pt.minute) < INCREMENTAL_MORNING_FULL_RUN_SCHEDULE_WINDOW_MINUTES;
}

async function enqueueScheduledIncrementalMorningFullRunIfDue(env, cronExpression = "unknown") {
  await ensureSchema(env);
  await ensureConfigScheduledJobsTable(env);

  const pt = pacificNowParts(new Date());
  const scheduleRows = await all(env.CONFIG_DB,
    `SELECT schedule_id, job_key, job_name, enabled, timezone, local_time, schedule_type, dedupe_scope, input_json, notes
     FROM config_scheduled_jobs
     WHERE enabled=1
       AND job_key='incremental-morning-full-run'
       AND schedule_type='daily'
       AND timezone='America/Los_Angeles'
     ORDER BY local_time, schedule_id`
  );

  const results = [];
  for (const schedule of scheduleRows) {
    const parsedTime = parseScheduledLocalTimeHHMM(schedule.local_time);
    const basePayload = {
      ok: true,
      data_ok: true,
      version: SYSTEM_VERSION,
      worker_name: WORKER_NAME,
      job_key: "incremental-morning-full-run",
      mode: "scheduled_incremental_morning_full_run_config_scan",
      cron_expression: cronExpression,
      schedule_id: schedule.schedule_id,
      schedule_local_time: schedule.local_time,
      schedule_type: schedule.schedule_type,
      schedule_timezone: schedule.timezone,
      pacific_date: pt.ymd_dash,
      pacific_time: pt.local_time,
      approved_window_minutes: INCREMENTAL_MORNING_FULL_RUN_SCHEDULE_WINDOW_MINUTES,
      no_board_refresh_included: true,
      board_refresh_deferred: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_old_production_touch: true
    };

    if (!parsedTime) {
      const payload = { ...basePayload, ok: false, data_ok: false, status: "BLOCKED_SCHEDULED_INCREMENTAL_MORNING_FULL_RUN_BAD_LOCAL_TIME", reason: "local_time must be HH:MM" };
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'incremental-morning-full-run', 'ERROR', 'scheduled_incremental_morning_full_run_bad_local_time', 'Scheduled Incremental Morning Full Run row has invalid local_time', ?, CURRENT_TIMESTAMP)",
        WORKER_NAME, JSON.stringify(payload)
      );
      results.push(payload);
      continue;
    }

    const scheduledKey = `incremental_morning_full_run_${pt.ymd_key}_${parsedTime.key}_PT`;
    const inWindow = isPacificScheduleWindowDue(pt, parsedTime, INCREMENTAL_MORNING_FULL_RUN_SCHEDULE_WINDOW_MINUTES);
    if (!inWindow) {
      results.push({ ...basePayload, status: "SCHEDULED_INCREMENTAL_MORNING_FULL_RUN_NOT_DUE", scheduled_key: scheduledKey });
      continue;
    }

    const existingRows = await all(env.CONTROL_DB,
      `SELECT request_id, chain_id, status, created_at, started_at, finished_at, updated_at, error_code, error_message
       FROM control_job_queue
       WHERE job_key='incremental-morning-full-run'
         AND worker_name='alphadog-v2-orchestrator'
         AND json_extract(input_json,'$.scheduled_key')=?
       ORDER BY datetime(created_at) DESC
       LIMIT 10`,
      scheduledKey
    );

    const active = existingRows.find(r => ["pending", "running", "partial_continue"].includes(String(r.status || "")) && !r.finished_at);
    if (active) {
      const payload = { ...basePayload, status: "SCHEDULED_INCREMENTAL_MORNING_FULL_RUN_NOOP_ACTIVE_EXISTS", scheduled_key: scheduledKey, existing_request_id: active.request_id, existing_chain_id: active.chain_id, existing_status: active.status };
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, 'incremental-morning-full-run', 'INFO', 'scheduled_incremental_morning_full_run_noop_active_exists', 'Scheduled Incremental Morning Full Run did not enqueue because same scheduled key is active', ?, CURRENT_TIMESTAMP)",
        active.request_id, WORKER_NAME, JSON.stringify(payload)
      );
      results.push(payload);
      continue;
    }

    const completed = existingRows.find(r => String(r.status || "") === "completed");
    if (completed) {
      const payload = { ...basePayload, status: "SCHEDULED_INCREMENTAL_MORNING_FULL_RUN_NOOP_ALREADY_COMPLETED", scheduled_key: scheduledKey, existing_request_id: completed.request_id, existing_chain_id: completed.chain_id, existing_status: completed.status };
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, 'incremental-morning-full-run', 'INFO', 'scheduled_incremental_morning_full_run_noop_already_completed', 'Scheduled Incremental Morning Full Run did not enqueue because same scheduled key already completed', ?, CURRENT_TIMESTAMP)",
        completed.request_id, WORKER_NAME, JSON.stringify(payload)
      );
      results.push(payload);
      continue;
    }

    const failed = existingRows.find(r => ["failed", "blocked", "error"].includes(String(r.status || "")) || r.error_code);
    if (failed) {
      const payload = { ...basePayload, ok: false, data_ok: false, status: "BLOCKED_SCHEDULED_INCREMENTAL_MORNING_FULL_RUN_SAME_KEY_FAILED_REQUIRES_REVIEW", scheduled_key: scheduledKey, existing_request_id: failed.request_id, existing_chain_id: failed.chain_id, existing_status: failed.status, existing_error_code: failed.error_code || null, existing_error_message: failed.error_message || null };
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, 'incremental-morning-full-run', 'ERROR', 'scheduled_incremental_morning_full_run_blocked_failed_same_key', 'Scheduled Incremental Morning Full Run blocked because same scheduled key failed/blocked and requires review', ?, CURRENT_TIMESTAMP)",
        failed.request_id, WORKER_NAME, JSON.stringify(payload)
      );
      results.push(payload);
      continue;
    }

    const configInput = parseJsonSafeText(schedule.input_json || "{}", {});
    const requestId = scheduledKey;
    const chainId = `chain_${scheduledKey}`;
    const childModes = {};
    for (const stage of INCREMENTAL_MORNING_FULL_RUN_STAGES) childModes[stage.job_key] = stage.mode;

    const input = {
      ...configInput,
      source: "config_scheduled_jobs",
      visible_button: "SCHEDULED > Incremental Morning Full Run",
      mode: "incremental_morning_full_run",
      scheduled: true,
      scheduled_or_manual: "scheduled",
      schedule_id: schedule.schedule_id,
      scheduled_key: scheduledKey,
      scheduled_dedupe_key: scheduledKey,
      scheduled_pacific_date: pt.ymd_dash,
      pacific_date: pt.ymd_dash,
      scheduled_pacific_time: pt.local_time,
      local_time: parsedTime.hhmm,
      timezone: "America/Los_Angeles",
      cron_expression: cronExpression,
      created_at: nowIso(),
      calendar_tally_precheck_first: true,
      calendar_tally_final_check_last: true,
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

    const insertScheduled = await run(env.CONTROL_DB,
      "INSERT OR IGNORE INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'incremental-morning-full-run', 'alphadog-v2-orchestrator', 'Delta', 'incremental_base', 'Scheduled Incremental Morning Full Run Backend Chain', 'pending', 8, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
      requestId, chainId, JSON.stringify(input)
    );
    const insertedScheduledRows = Number(insertScheduled && insertScheduled.meta && insertScheduled.meta.changes || 0);
    if (insertedScheduledRows === 0) {
      const existingDeterministic = await first(env.CONTROL_DB, "SELECT request_id, chain_id, status, created_at, started_at, finished_at, updated_at FROM control_job_queue WHERE request_id=? LIMIT 1", requestId);
      const payload = { ...basePayload, status: "SCHEDULED_INCREMENTAL_MORNING_FULL_RUN_NOOP_DETERMINISTIC_KEY_EXISTS", scheduled_key: scheduledKey, request_id: requestId, existing_request_id: existingDeterministic && existingDeterministic.request_id, existing_chain_id: existingDeterministic && existingDeterministic.chain_id, existing_status: existingDeterministic && existingDeterministic.status, deterministic_request_id_guard_v0_2_151: true };
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, 'incremental-morning-full-run', 'INFO', 'scheduled_incremental_morning_full_run_noop_deterministic_key_exists', 'Scheduled Incremental Morning Full Run did not enqueue because deterministic request id already exists', ?, CURRENT_TIMESTAMP)",
        requestId, WORKER_NAME, JSON.stringify(payload)
      );
      results.push(payload);
      continue;
    }

    const payload = { ...basePayload, status: "SCHEDULED_INCREMENTAL_MORNING_FULL_RUN_QUEUED", scheduled_key: scheduledKey, request_id: requestId, chain_id: chainId, queued_job_key: "incremental-morning-full-run", queued_worker_name: WORKER_NAME, approved_chain_order: input.approved_chain_order, backend_chain_only: true };
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, 'incremental-morning-full-run', 'INFO', 'scheduled_incremental_morning_full_run_queued', 'Scheduled Incremental Morning Full Run parent backend chain job queued from CONFIG_DB schedule', ?, CURRENT_TIMESTAMP)",
      requestId, WORKER_NAME, JSON.stringify(payload)
    );
    results.push(payload);
  }

  return {
    ok: true,
    data_ok: true,
    version: SYSTEM_VERSION,
    worker_name: WORKER_NAME,
    job_key: "incremental-morning-full-run",
    mode: "scheduled_incremental_morning_full_run_config_scan",
    cron_expression: cronExpression,
    pacific_date: pt.ymd_dash,
    pacific_time: pt.local_time,
    schedules_read: scheduleRows.length,
    queued_count: results.filter(r => r.status === "SCHEDULED_INCREMENTAL_MORNING_FULL_RUN_QUEUED").length,
    blocked_count: results.filter(r => r.ok === false || String(r.status || "").startsWith("BLOCKED_")).length,
    results
  };
}


async function enqueueScheduledDailyFullRunIfDue(env, cronExpression = "unknown") {
  await ensureSchema(env);
  await ensureConfigScheduledJobsTable(env);

  const pt = pacificNowParts(new Date());
  const scheduleRows = await all(env.CONFIG_DB,
    `SELECT schedule_id, job_key, job_name, enabled, timezone, local_time, schedule_type, dedupe_scope, input_json, notes
     FROM config_scheduled_jobs
     WHERE enabled=1
       AND job_key='daily-full-run'
       AND schedule_type='daily'
       AND timezone='America/Los_Angeles'
     ORDER BY local_time, schedule_id`
  );

  const results = [];
  for (const schedule of scheduleRows) {
    const parsedTime = parseScheduledLocalTimeHHMM(schedule.local_time);
    const basePayload = {
      ok: true,
      data_ok: true,
      version: SYSTEM_VERSION,
      worker_name: WORKER_NAME,
      job_key: "daily-full-run",
      mode: "scheduled_daily_full_run_config_scan",
      cron_expression: cronExpression,
      schedule_id: schedule.schedule_id,
      schedule_local_time: schedule.local_time,
      schedule_type: schedule.schedule_type,
      schedule_timezone: schedule.timezone,
      pacific_date: pt.ymd_dash,
      pacific_time: pt.local_time,
      approved_window_minutes: INCREMENTAL_MORNING_FULL_RUN_SCHEDULE_WINDOW_MINUTES,
      includes_daily_context_full_run: true,
      includes_board_full_run: true,
      includes_market_scoring_full_run: true,
      no_incremental_morning_full_run: true,
      no_static_work: true,
      no_base_delta_workers: true,
      no_old_production_touch: true
    };

    if (!parsedTime) {
      const payload = { ...basePayload, ok: false, data_ok: false, status: "BLOCKED_SCHEDULED_DAILY_FULL_RUN_BAD_LOCAL_TIME", reason: "local_time must be HH:MM" };
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'daily-full-run', 'ERROR', 'scheduled_daily_full_run_bad_local_time', 'Scheduled Daily Full Run row has invalid local_time', ?, CURRENT_TIMESTAMP)",
        WORKER_NAME, JSON.stringify(payload)
      );
      results.push(payload);
      continue;
    }

    const scheduledKey = `daily_full_run_${pt.ymd_key}_${parsedTime.key}_PT`;
    const inWindow = isPacificScheduleWindowDue(pt, parsedTime, INCREMENTAL_MORNING_FULL_RUN_SCHEDULE_WINDOW_MINUTES);
    if (!inWindow) {
      results.push({ ...basePayload, status: "SCHEDULED_DAILY_FULL_RUN_NOT_DUE", scheduled_key: scheduledKey });
      continue;
    }

    const existingRows = await all(env.CONTROL_DB,
      `SELECT request_id, chain_id, status, created_at, started_at, finished_at, updated_at, error_code, error_message
       FROM control_job_queue
       WHERE job_key='daily-full-run'
         AND worker_name='alphadog-v2-orchestrator'
         AND json_extract(input_json,'$.scheduled_key')=?
       ORDER BY datetime(created_at) DESC
       LIMIT 10`,
      scheduledKey
    );

    const active = existingRows.find(r => ["pending", "running", "partial_continue"].includes(String(r.status || "")) && !r.finished_at);
    if (active) {
      const payload = { ...basePayload, status: "SCHEDULED_DAILY_FULL_RUN_NOOP_ACTIVE_EXISTS", scheduled_key: scheduledKey, existing_request_id: active.request_id, existing_chain_id: active.chain_id, existing_status: active.status };
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, 'daily-full-run', 'INFO', 'scheduled_daily_full_run_noop_active_exists', 'Scheduled Daily Full Run did not enqueue because same scheduled key is active', ?, CURRENT_TIMESTAMP)",
        active.request_id, WORKER_NAME, JSON.stringify(payload)
      );
      results.push(payload);
      continue;
    }

    const completed = existingRows.find(r => String(r.status || "") === "completed");
    if (completed) {
      const payload = { ...basePayload, status: "SCHEDULED_DAILY_FULL_RUN_NOOP_ALREADY_COMPLETED", scheduled_key: scheduledKey, existing_request_id: completed.request_id, existing_chain_id: completed.chain_id, existing_status: completed.status };
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, 'daily-full-run', 'INFO', 'scheduled_daily_full_run_noop_already_completed', 'Scheduled Daily Full Run did not enqueue because same scheduled key already completed', ?, CURRENT_TIMESTAMP)",
        completed.request_id, WORKER_NAME, JSON.stringify(payload)
      );
      results.push(payload);
      continue;
    }

    const failed = existingRows.find(r => ["failed", "blocked", "error"].includes(String(r.status || "")) || r.error_code);
    if (failed) {
      const payload = { ...basePayload, ok: false, data_ok: false, status: "BLOCKED_SCHEDULED_DAILY_FULL_RUN_SAME_KEY_FAILED_REQUIRES_REVIEW", scheduled_key: scheduledKey, existing_request_id: failed.request_id, existing_chain_id: failed.chain_id, existing_status: failed.status, existing_error_code: failed.error_code || null, existing_error_message: failed.error_message || null };
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, 'daily-full-run', 'ERROR', 'scheduled_daily_full_run_blocked_failed_same_key', 'Scheduled Daily Full Run blocked because same scheduled key failed/blocked and requires review', ?, CURRENT_TIMESTAMP)",
        failed.request_id, WORKER_NAME, JSON.stringify(payload)
      );
      results.push(payload);
      continue;
    }

    const configInput = parseJsonSafeText(schedule.input_json || "{}", {});
    const requestId = scheduledKey;
    const chainId = `chain_${scheduledKey}`;
    const childModes = {};
    for (const stage of DAILY_FULL_RUN_STAGES) childModes[stage.job_key] = stage.mode;

    const input = {
      ...configInput,
      source: "config_scheduled_jobs",
      visible_button: "SCHEDULED > Daily Full Run",
      mode: "daily_full_run",
      scheduled: true,
      scheduled_or_manual: "scheduled",
      schedule_id: schedule.schedule_id,
      scheduled_key: scheduledKey,
      scheduled_dedupe_key: scheduledKey,
      scheduled_pacific_date: pt.ymd_dash,
      pacific_date: pt.ymd_dash,
      scheduled_pacific_time: pt.local_time,
      local_time: parsedTime.hhmm,
      timezone: "America/Los_Angeles",
      cron_expression: cronExpression,
      created_at: nowIso(),
      approved_chain_order: DAILY_FULL_RUN_STAGES.map(s => s.job_key),
      child_modes: childModes,
      stop_on_first_failed_stage: true,
      backend_chain_only: true,
      no_browser_loop: true,
      backend_scheduled_continuation: true,
      no_generic_dispatch: true,
      includes_daily_context_full_run: true,
      includes_board_full_run: true,
      includes_market_scoring_full_run: true,
      includes_pricepicks_refresh: true,
      includes_sleeper_refresh: true,
      includes_score_prep: true,
      includes_market_context: true,
      includes_factors_matrix_scoring_final_board: true,
      includes_hit_probability: true,
      prepared_for_split_slate: true,
      prepared_for_half_slate: true,
      prepared_for_single_game_slate: true,
      no_incremental_morning_full_run: true,
      no_static_work: true,
      no_base_delta_workers: true,
      no_old_production_touch: true
    };

    const insertScheduled = await run(env.CONTROL_DB,
      "INSERT OR IGNORE INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'daily-full-run', 'alphadog-v2-orchestrator', '12 Full Runs', 'daily_master', 'Scheduled Daily Full Run Backend Chain', 'pending', 10, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
      requestId, chainId, JSON.stringify(input)
    );
    const insertedScheduledRows = Number(insertScheduled && insertScheduled.meta && insertScheduled.meta.changes || 0);
    if (insertedScheduledRows === 0) {
      const existingDeterministic = await first(env.CONTROL_DB, "SELECT request_id, chain_id, status, created_at, started_at, finished_at, updated_at FROM control_job_queue WHERE request_id=? LIMIT 1", requestId);
      const payload = { ...basePayload, status: "SCHEDULED_DAILY_FULL_RUN_NOOP_DETERMINISTIC_KEY_EXISTS", scheduled_key: scheduledKey, request_id: requestId, existing_request_id: existingDeterministic && existingDeterministic.request_id, existing_chain_id: existingDeterministic && existingDeterministic.chain_id, existing_status: existingDeterministic && existingDeterministic.status, deterministic_request_id_guard: true };
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, 'daily-full-run', 'INFO', 'scheduled_daily_full_run_noop_deterministic_key_exists', 'Scheduled Daily Full Run did not enqueue because deterministic request id already exists', ?, CURRENT_TIMESTAMP)",
        requestId, WORKER_NAME, JSON.stringify(payload)
      );
      results.push(payload);
      continue;
    }

    const payload = { ...basePayload, status: "SCHEDULED_DAILY_FULL_RUN_QUEUED", scheduled_key: scheduledKey, request_id: requestId, chain_id: chainId, queued_job_key: "daily-full-run", queued_worker_name: WORKER_NAME, approved_chain_order: input.approved_chain_order, backend_chain_only: true };
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, 'daily-full-run', 'INFO', 'scheduled_daily_full_run_queued', 'Scheduled Daily Full Run parent backend chain job queued from CONFIG_DB schedule', ?, CURRENT_TIMESTAMP)",
      requestId, WORKER_NAME, JSON.stringify(payload)
    );
    results.push(payload);
  }

  return {
    ok: true,
    data_ok: true,
    version: SYSTEM_VERSION,
    worker_name: WORKER_NAME,
    job_key: "daily-full-run",
    mode: "scheduled_daily_full_run_config_scan",
    cron_expression: cronExpression,
    pacific_date: pt.ymd_dash,
    pacific_time: pt.local_time,
    schedules_read: scheduleRows.length,
    queued_count: results.filter(r => r.status === "SCHEDULED_DAILY_FULL_RUN_QUEUED").length,
    blocked_count: results.filter(r => r.ok === false || String(r.status || "").startsWith("BLOCKED_")).length,
    results
  };
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
  { stage_key: "calendar_tally_precheck", job_key: "delta-certifier", worker_name: "alphadog-v2-delta-certifier", display_name: "Calendar/Tally Precheck", visible_button: "DELTA > Calendar", mode: "game_calendar_differential_check_update", worker_group: "Delta", phase_key: "incremental_base", priority: 4, calendar_tally_stage: "precheck", allow_blocking_gaps: true },
  { stage_key: "hitter_game_logs_delta", job_key: "base-hitter-game-logs", worker_name: "alphadog-v2-base-hitter-game-logs", display_name: "Hitter Game Logs Delta", visible_button: "DELTA > Hitter Game Logs", mode: "delta_update", layer_key: "hitter_game_logs", worker_group: "Delta", phase_key: "incremental_base", priority: 4 },
  { stage_key: "pitcher_game_logs_delta", job_key: "base-pitcher-game-logs", worker_name: "alphadog-v2-base-pitcher-game-logs", display_name: "Pitcher Game Logs Delta", visible_button: "DELTA > Pitcher Game Logs", mode: "delta_update", layer_key: "pitcher_game_logs", worker_group: "Delta", phase_key: "incremental_base", priority: 4 },
  { stage_key: "team_game_logs_delta", job_key: "base-team-game-logs", worker_name: "alphadog-v2-base-team-game-logs", display_name: "Team Game Logs Delta", visible_button: "DELTA > Team Game Logs", mode: "delta_update", layer_key: "team_game_logs", worker_group: "Delta", phase_key: "incremental_base", priority: 4 },
  { stage_key: "starter_history_delta", job_key: "base-starter-history", worker_name: "alphadog-v2-base-starter-history", display_name: "Starter History Delta", visible_button: "BASE > Starter History", mode: "delta_coverage_gap_scoped_repair", layer_key: "starter_history", worker_group: "Delta", phase_key: "incremental_base", priority: 4 },
  { stage_key: "bullpen_history_delta", job_key: "base-bullpen-history", worker_name: "alphadog-v2-base-bullpen-history", display_name: "Bullpen History Delta", visible_button: "BASE > Bullpen History", mode: "delta_update", layer_key: "bullpen_history", worker_group: "Delta", phase_key: "incremental_base", priority: 4 },
  { stage_key: "hitter_splits_delta", job_key: "base-hitter-splits", worker_name: "alphadog-v2-base-hitter-splits", display_name: "Hitter Splits Delta", visible_button: "DELTA > Hitter Splits", mode: "delta_update", layer_key: "hitter_splits", worker_group: "Delta", phase_key: "incremental_base", priority: 4 },
  { stage_key: "pitcher_splits_delta", job_key: "base-pitcher-splits", worker_name: "alphadog-v2-base-pitcher-splits", display_name: "Pitcher Splits Delta", visible_button: "DELTA > Pitcher Splits", mode: "delta_update", layer_key: "pitcher_splits", worker_group: "Delta", phase_key: "incremental_base", priority: 4 },
  { stage_key: "hitter_metrics_affected_delta", job_key: "base-hitter-metrics", worker_name: "alphadog-v2-base-hitter-metrics", display_name: "Hitter Metrics Affected Delta", visible_button: "DELTA > Hitter Metrics", mode: "delta_recalculate_affected_players", layer_key: "hitter_metrics", worker_group: "Delta", phase_key: "incremental_base", priority: 4 },
  { stage_key: "pitcher_metrics_affected_delta", job_key: "base-pitcher-metrics", worker_name: "alphadog-v2-base-pitcher-metrics", display_name: "Pitcher Metrics Affected Delta", visible_button: "DELTA > Pitcher Metrics", mode: "delta_recalculate_affected_players", layer_key: "pitcher_metrics", worker_group: "Delta", phase_key: "incremental_base", priority: 4 },
  { stage_key: "calendar_tally_final_check", job_key: "delta-certifier", worker_name: "alphadog-v2-delta-certifier", display_name: "Calendar/Tally Final Check", visible_button: "DELTA > Calendar", mode: "game_calendar_differential_check_update", worker_group: "Delta", phase_key: "incremental_base", priority: 4, calendar_tally_stage: "final_check", require_zero_blocking_gaps: true }
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


function isPartialContinueOutput(output) {
  const rawStatus = String((output && output.status) || "").toLowerCase();
  const certification = String((output && output.certification) || "").toLowerCase();
  return !!(output && output.ok === true && (
    rawStatus === "partial_continue" ||
    rawStatus.startsWith("partial_continue_") ||
    certification.includes("partial_continue") ||
    output.continuation_required === true ||
    output.orchestrator_should_self_continue === true
  ));
}

function isCompletedOutput(output) {
  const rawStatus = String((output && output.status) || "").toLowerCase();
  return !!(output && output.ok === true && !isPartialContinueOutput(output) && (
    output.data_ok === true ||
    rawStatus.startsWith("completed") ||
    rawStatus.includes("certified")
  ));
}


function isIncrementalFullRunChildOutputTerminal(output) {
  if (!output || output.ok !== true) return false;
  const rawStatus = String(output.status || "").toLowerCase();
  const cert = String(output.certification || output.certification_status || "").toLowerCase();
  if (isPartialContinueOutput(output)) return false;
  return !!(
    output.data_ok === true ||
    rawStatus.startsWith("completed") ||
    rawStatus.includes("completed") ||
    rawStatus.includes("certified") ||
    rawStatus.startsWith("noop_") ||
    cert.includes("certified") ||
    cert.includes("noop_pass") ||
    cert.includes("repeat_full_refresh_blocked") ||
    cert.includes("retained_noop")
  );
}

function isIncrementalFullRunChildOutputPartial(output) {
  if (!output || output.ok !== true) return false;
  return isPartialContinueOutput(output);
}

async function getLatestChildWorkerRunOutput(env, requestId) {
  // v0.2.168: control_job_runs does NOT have updated_at in the deployed schema.
  // Never reference unverified run-table columns from universal child lifecycle code.
  const row = await first(env.CONTROL_DB,
    `SELECT run_id, status, data_ok, certification_status, output_json, started_at, finished_at
     FROM control_job_runs
     WHERE request_id=?
       AND output_json IS NOT NULL
       AND certification_status <> 'ORCHESTRATOR_DISPATCH_STARTED'
     ORDER BY datetime(COALESCE(finished_at, started_at)) DESC, rowid DESC
     LIMIT 1`,
    requestId
  );
  if (!row) return null;
  return { ...row, output: parseJsonSafeText(row.output_json || "{}", {}) };
}

async function closeDispatchStartedRunsForChild(env, requestId, certificationStatus, outputJson, trigger) {
  // v0.2.168: once the worker produced trusted output in queue output_json
  // or in a later control_job_runs row, close every dispatch-start placeholder
  // for that request immediately. Leaving these rows running created false
  // stuck evidence and repeated stale recovery loops.
  await run(env.CONTROL_DB,
    `UPDATE control_job_runs
     SET status=?,
         data_ok=1,
         certification_status=?,
         finished_at=COALESCE(finished_at, CURRENT_TIMESTAMP),
         elapsed_ms=CASE WHEN started_at IS NOT NULL THEN CAST((julianday(CURRENT_TIMESTAMP)-julianday(started_at))*86400000 AS INTEGER) ELSE elapsed_ms END,
         output_json=COALESCE(output_json, ?),
         error_code=NULL,
         error_message=NULL
     WHERE request_id=?
       AND status='running'
       AND certification_status='ORCHESTRATOR_DISPATCH_STARTED'`,
    certificationStatus === 'completed' ? 'completed' : 'partial_continue',
    certificationStatus === 'completed' ? 'DISPATCH_RUN_RECONCILED_CHILD_COMPLETED' : 'DISPATCH_RUN_RECONCILED_CHILD_PARTIAL_CONTINUE',
    outputJson || '{}',
    requestId
  );
}

async function reconcileIncrementalFullRunChildLifecycle(env, child, trigger) {
  if (!child || !child.request_id) return { changed: false, child };
  const childStatus = String(child.status || "");
  const staleEnough = Number(child.is_stale || 0) === 1 || (child.updated_at && true);
  let output = parseJsonSafeText(child.output_json || "{}", {});
  let source = child.output_json ? "queue_output_json" : null;
  const latestRun = await getLatestChildWorkerRunOutput(env, child.request_id);
  if ((!output || Object.keys(output).length === 0 || output.ok !== true) && latestRun && latestRun.output) {
    output = latestRun.output;
    source = "latest_control_job_runs_output_json";
  }
  if (!output || output.ok !== true) return { changed: false, child };

  const outputJson = JSON.stringify(output);
  if (childStatus === "running" || childStatus === "pending" || childStatus === "partial_continue") {
    if (isIncrementalFullRunChildOutputTerminal(output)) {
      await closeDispatchStartedRunsForChild(env, child.request_id, 'completed', outputJson, trigger);
      await run(env.CONTROL_DB,
        `UPDATE control_job_queue
         SET status='completed', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP,
             output_json=?, error_code=NULL, error_message=NULL
         WHERE request_id=? AND status IN ('pending','running','partial_continue')`,
        outputJson, child.request_id
      );
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'WARN', 'incremental_full_run_child_terminal_output_reconciled', 'Reconciled active Incremental Full Run child to completed from trusted worker output', ?, CURRENT_TIMESTAMP)",
        child.request_id, WORKER_NAME, child.job_key, JSON.stringify({ trigger, request_id: child.request_id, job_key: child.job_key, previous_status: child.status, source, output_status: output.status || null, certification: output.certification || output.certification_status || null, version: SYSTEM_VERSION, universal_all_base_factor_stages: true, schema_safe_no_control_job_runs_updated_at: true })
      );
      return { changed: true, child: { ...child, status: 'completed', finished_at: nowIso(), updated_at: nowIso(), output_json: outputJson, error_code: null, error_message: null } };
    }
    if (isIncrementalFullRunChildOutputPartial(output)) {
      await closeDispatchStartedRunsForChild(env, child.request_id, 'partial_continue', outputJson, trigger);
      await run(env.CONTROL_DB,
        `UPDATE control_job_queue
         SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP,
             output_json=?, error_code=NULL, error_message=NULL
         WHERE request_id=? AND status IN ('running','partial_continue') AND finished_at IS NULL`,
        outputJson, child.request_id
      );
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'WARN', 'incremental_full_run_child_partial_output_requeued', 'Reconciled active Incremental Full Run child partial output back to pending for continuation', ?, CURRENT_TIMESTAMP)",
        child.request_id, WORKER_NAME, child.job_key, JSON.stringify({ trigger, request_id: child.request_id, job_key: child.job_key, previous_status: child.status, source, output_status: output.status || null, certification: output.certification || output.certification_status || null, version: SYSTEM_VERSION, universal_all_base_factor_stages: true, schema_safe_no_control_job_runs_updated_at: true })
      );
      return { changed: true, child: { ...child, status: 'pending', updated_at: nowIso(), output_json: outputJson, error_code: null, error_message: null } };
    }
  }
  return { changed: false, child };
}

async function reconcileRunningDeltaFullRunChildrenFromOutput(env, trigger) {
  // v0.2.167: universal lifecycle reconcile for every Incremental Morning Full Run child.
  // It handles queue output_json and latest finished control_job_runs output, not only one worker family.
  const rows = await all(env.CONTROL_DB,
    `SELECT c.request_id, c.parent_request_id, c.chain_id, c.job_key, c.worker_name, c.status, c.tick_count, c.output_json, c.updated_at,
            CASE WHEN c.status IN ('pending','running','partial_continue') AND c.finished_at IS NULL AND datetime(c.updated_at) <= datetime(CURRENT_TIMESTAMP, '-20 seconds') THEN 1 ELSE 0 END AS is_stale
     FROM control_job_queue c
     JOIN control_job_queue p ON p.request_id = c.parent_request_id AND p.chain_id = c.chain_id
     WHERE p.job_key='incremental-morning-full-run'
       AND p.worker_name='alphadog-v2-orchestrator'
       AND p.status IN ('pending','running','partial_continue')
       AND p.finished_at IS NULL
       AND c.parent_request_id IS NOT NULL
       AND c.status IN ('pending','running','partial_continue')
       AND c.finished_at IS NULL
     ORDER BY datetime(c.updated_at) ASC
     LIMIT 50`
  );
  let reconciled_pending = 0;
  let reconciled_completed = 0;
  let ignored = 0;
  for (const row of rows) {
    const result = await reconcileIncrementalFullRunChildLifecycle(env, row, trigger);
    if (result.changed && result.child && result.child.status === 'completed') reconciled_completed += 1;
    else if (result.changed) reconciled_pending += 1;
    else ignored += 1;
  }
  return { reconciled_pending, reconciled_completed, ignored, scanned: rows.length };
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
      return { pass: false, wait: false, transient: true, reason: "child_stale_unfinished", child_status: childStatus, updated_at: child.updated_at };
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
  if (stage.job_key === "delta-certifier") {
    if (String(output.mode || "") !== "game_calendar_differential_check_update") return { pass: false, reason: "calendar_tally_wrong_mode", output_mode: output.mode };
    if (Number(output.coverage_rows_written || 0) <= 0) return { pass: false, reason: "calendar_tally_no_coverage_rows_written", coverage_rows_written: output.coverage_rows_written };
    const blockingGapCount = Number(output.blocking_gap_count || 0);
    const missingGameLayerCount = Number(output.missing_game_layer_count || 0);
    if (stage.require_zero_blocking_gaps && (blockingGapCount > 0 || missingGameLayerCount > 0 || hay.includes("with_blockers"))) {
      return { pass: false, reason: "final_calendar_tally_has_blocking_gaps", blocking_gap_count: blockingGapCount, missing_game_layer_count: missingGameLayerCount, certification: cert, status };
    }
    return { pass: true, certification: cert, status, data_ok: output.data_ok, rows_read: output.source_game_count || 0, rows_written: output.coverage_rows_written || 0, blocking_gap_count: blockingGapCount, missing_game_layer_count: missingGameLayerCount, output };
  }
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
    full_run_gap_contract: true,
    gap_contract_version: "v0.2.151",
    gap_source: "TEAM_DB.mlb_game_coverage_gaps",
    coverage_source: "TEAM_DB.mlb_game_data_coverage",
    layer_key: stage.layer_key || null,
    parent_full_run: true,
    full_run_stage_key: stage.stage_key,
    calendar_tally_stage: stage.calendar_tally_stage || null,
    require_zero_blocking_gaps: stage.require_zero_blocking_gaps === true,
    allow_blocking_gaps: stage.allow_blocking_gaps === true,
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
    calendar_tally_precheck_first: INCREMENTAL_MORNING_FULL_RUN_STAGES[0] && INCREMENTAL_MORNING_FULL_RUN_STAGES[0].stage_key === "calendar_tally_precheck",
    calendar_tally_final_check_last: INCREMENTAL_MORNING_FULL_RUN_STAGES[INCREMENTAL_MORNING_FULL_RUN_STAGES.length - 1] && INCREMENTAL_MORNING_FULL_RUN_STAGES[INCREMENTAL_MORNING_FULL_RUN_STAGES.length - 1].stage_key === "calendar_tally_final_check",
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

async function getIncrementalFullRunLayerBlockingGapCount(env, layerKey) {
  if (!env.TEAM_DB || !layerKey) return { ok: false, layer_key: layerKey || null, reason: "missing_team_db_or_layer_key", blocking_gap_count: null, noop_safe: false };
  const currentOfficialDate = pacificNowParts(new Date()).ymd_dash;
  try {
    const row = await first(env.TEAM_DB,
      `SELECT
         SUM(CASE WHEN COALESCE(blocking_for_full_run,0)=1 THEN 1 ELSE 0 END) AS blocking_gap_count,
         SUM(CASE WHEN official_date < ? AND coverage_status <> 'complete' THEN 1 ELSE 0 END) AS past_incomplete_gap_count,
         SUM(CASE WHEN official_date < ? AND coverage_status = 'scheduled_not_ready' THEN 1 ELSE 0 END) AS past_scheduled_not_ready_count,
         COUNT(*) AS coverage_rows
       FROM mlb_game_data_coverage
       WHERE layer_key=?`,
      currentOfficialDate, currentOfficialDate, layerKey
    );
    const blockingGapCount = Number(row?.blocking_gap_count || 0);
    const pastIncompleteGapCount = Number(row?.past_incomplete_gap_count || 0);
    const pastScheduledNotReadyCount = Number(row?.past_scheduled_not_ready_count || 0);
    const coverageRows = Number(row?.coverage_rows || 0);
    const noopSafe = coverageRows > 0 && blockingGapCount === 0 && pastIncompleteGapCount === 0 && pastScheduledNotReadyCount === 0;
    return {
      ok: true,
      layer_key: layerKey,
      blocking_gap_count: blockingGapCount,
      past_incomplete_gap_count: pastIncompleteGapCount,
      past_scheduled_not_ready_count: pastScheduledNotReadyCount,
      coverage_rows: coverageRows,
      current_official_date_pt: currentOfficialDate,
      noop_safe: noopSafe,
      past_date_gap_contract_guard_v0_2_164: true
    };
  } catch (err) {
    return { ok: false, layer_key: layerKey, reason: String(err && err.message ? err.message : err).slice(0, 900), blocking_gap_count: null, noop_safe: false };
  }
}

async function completeIncrementalFullRunNoGapLayerChild(env, parentRow, stage, stepIndex, runId, trigger, gapProof) {
  const childRequestId = rid(stage.stage_key.replace(/-/g, "_"));
  const input = incrementalMorningFullRunChildInput(parentRow, stage, stepIndex, 0);
  const output = {
    ok: true,
    data_ok: true,
    version: SYSTEM_VERSION,
    worker_name: stage.worker_name,
    job_key: stage.job_key,
    request_id: childRequestId,
    chain_id: parentRow.chain_id,
    parent_request_id: parentRow.request_id,
    mode: stage.mode,
    status: "DELTA_FULL_RUN_LAYER_NO_BLOCKING_GAPS_NOOP",
    certification: "DELTA_FULL_RUN_LAYER_NO_BLOCKING_GAPS_NOOP",
    certification_grade: "NOOP_PASS",
    full_run_gap_contract: true,
    full_run_stage_key: stage.stage_key,
    layer_key: stage.layer_key || null,
    calendar_tally_owned_gap_decision: true,
    no_blocking_gaps_for_layer: true,
    blocking_gap_count: 0,
    rows_read: 0,
    rows_written: 0,
    rows_promoted: 0,
    external_calls_performed: 0,
    continuation_required: false,
    orchestrator_should_self_continue: false,
    no_worker_service_call_needed: true,
    no_board_refresh: true,
    no_market_context: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    gap_proof: gapProof,
    trigger,
    timestamp_utc: nowIso()
  };

  await run(env.CONTROL_DB,
    "INSERT INTO control_job_queue (request_id, chain_id, parent_request_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, output_json, run_after, created_at, started_at, finished_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
    childRequestId, parentRow.chain_id, parentRow.request_id, stage.job_key, stage.worker_name, stage.worker_group, stage.phase_key, stage.display_name, stage.priority, JSON.stringify(input), JSON.stringify(output)
  );
  await run(env.CONTROL_DB,
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'completed', 1, 'DELTA_FULL_RUN_LAYER_NO_BLOCKING_GAPS_NOOP', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
    `${runId}_${stage.stage_key}_noop`, childRequestId, parentRow.chain_id, stage.job_key, stage.worker_name, JSON.stringify(input), JSON.stringify(output)
  );
  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'incremental_morning_full_run_layer_no_gap_noop_completed', 'Delta Full Run completed layer stage as no-op because Calendar/Tally has zero blocking gaps for that layer', ?, CURRENT_TIMESTAMP)",
    childRequestId, runId, WORKER_NAME, stage.job_key, JSON.stringify({ parent_request_id: parentRow.request_id, child_request_id: childRequestId, stage_key: stage.stage_key, layer_key: stage.layer_key || null, gap_proof: gapProof, no_worker_service_call_needed: true, version: SYSTEM_VERSION })
  );
  return { child_request_id: childRequestId, input, output, completed_noop: true };
}


async function reconcileIncrementalCalendarTallyChildFromBatches(env, parentRow, stage, child) {
  if (!child || stage.job_key !== "delta-certifier") return child;
  const childStatus = String(child.status || "");
  if (!["pending", "running", "partial_continue"].includes(childStatus)) return child;
  if (child.finished_at) return child;

  const batch = await first(env.TEAM_DB,
    `SELECT batch_id, request_id, worker_name, worker_version, mode, status, certification_status, certification_grade,
            missing_game_layer_count, blocking_gap_count, coverage_window_start, coverage_window_end,
            created_at, updated_at, output_json
     FROM mlb_game_coverage_batches
     WHERE request_id=?
       AND mode='game_calendar_differential_check_update'
     ORDER BY datetime(created_at) DESC
     LIMIT 1`,
    child.request_id
  );

  if (!batch) return child;
  const batchStatus = String(batch.status || "");
  const batchGrade = String(batch.certification_grade || "");
  const batchCert = String(batch.certification_status || "");
  const completed = batchStatus.includes("COMPLETED") || batchCert.includes("UPDATED") || batchGrade.startsWith("DIFF_PASS");
  if (!completed) return child;

  const parsedOutput = parseJsonSafeText(batch.output_json || "{}", {});
  const output = {
    ...parsedOutput,
    ok: parsedOutput.ok !== false,
    data_ok: parsedOutput.data_ok !== false,
    version: parsedOutput.version || batch.worker_version || "alphadog-v2-delta-certifier",
    worker_name: parsedOutput.worker_name || batch.worker_name || child.worker_name,
    job_key: parsedOutput.job_key || child.job_key,
    request_id: parsedOutput.request_id || child.request_id,
    chain_id: parsedOutput.chain_id || child.chain_id,
    batch_id: parsedOutput.batch_id || batch.batch_id,
    mode: parsedOutput.mode || batch.mode || "game_calendar_differential_check_update",
    status: parsedOutput.status || batch.status,
    certification: parsedOutput.certification || batch.certification_status,
    certification_status: parsedOutput.certification_status || batch.certification_status,
    certification_grade: parsedOutput.certification_grade || batch.certification_grade,
    missing_game_layer_count: Number(parsedOutput.missing_game_layer_count ?? batch.missing_game_layer_count ?? 0),
    blocking_gap_count: Number(parsedOutput.blocking_gap_count ?? batch.blocking_gap_count ?? 0),
    coverage_rows_written: Number(parsedOutput.coverage_rows_written ?? parsedOutput.rows_written ?? 1),
    rows_written: Number(parsedOutput.rows_written ?? parsedOutput.coverage_rows_written ?? 1),
    source_game_count: Number(parsedOutput.source_game_count ?? parsedOutput.rows_read ?? 0),
    orchestrator_auto_finalize: {
      version: SYSTEM_VERSION,
      reason: "calendar_tally_batch_completed_but_queue_child_left_running",
      parent_request_id: parentRow.request_id,
      parent_chain_id: parentRow.chain_id,
      stage_key: stage.stage_key,
      previous_child_status: childStatus,
      trusted_batch_id: batch.batch_id,
      trusted_batch_status: batch.status,
      trusted_certification_grade: batch.certification_grade,
      no_manual_reconcile_button_required: true,
      no_board_refresh: true,
      no_market_context: true,
      no_scoring: true,
      no_final_board: true
    }
  };

  const existingRun = await first(env.CONTROL_DB,
    "SELECT run_id FROM control_job_runs WHERE request_id=? ORDER BY datetime(started_at) DESC LIMIT 1",
    child.request_id
  );
  const reconcileRunId = existingRun && existingRun.run_id ? existingRun.run_id : rid("run");

  if (existingRun) {
    await run(env.CONTROL_DB,
      "UPDATE control_job_runs SET status='completed', data_ok=1, certification_status=?, rows_read=?, rows_written=?, external_calls=0, finished_at=CURRENT_TIMESTAMP, elapsed_ms=CASE WHEN started_at IS NOT NULL THEN CAST((julianday(CURRENT_TIMESTAMP)-julianday(started_at))*86400000 AS INTEGER) ELSE 0 END, output_json=?, error_code=NULL, error_message=NULL WHERE run_id=?",
      String(output.certification || output.certification_status || "GAME_CALENDAR_DIFFERENTIAL_CHECK_UPDATED_NO_BLOCKERS").slice(0, 120),
      Number(output.source_game_count || output.rows_read || 0),
      Number(output.coverage_rows_written || output.rows_written || 1),
      JSON.stringify(output),
      reconcileRunId
    );
  } else {
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'completed', 1, ?, ?, ?, 0, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, 0, ?, ?, NULL, NULL)",
      reconcileRunId,
      child.request_id,
      child.chain_id,
      child.job_key,
      child.worker_name,
      String(output.certification || output.certification_status || "GAME_CALENDAR_DIFFERENTIAL_CHECK_UPDATED_NO_BLOCKERS").slice(0, 120),
      Number(output.source_game_count || output.rows_read || 0),
      Number(output.coverage_rows_written || output.rows_written || 1),
      child.started_at || batch.created_at || null,
      child.input_json || "{}",
      JSON.stringify(output)
    );
  }

  await run(env.CONTROL_DB,
    "UPDATE control_job_queue SET status='completed', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue') AND finished_at IS NULL",
    JSON.stringify(output), child.request_id
  );

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'WARN', 'incremental_calendar_tally_child_auto_finalized_from_batch', 'Delta Full Run auto-finalized Calendar/Tally child from trusted mlb_game_coverage_batches proof', ?, CURRENT_TIMESTAMP)",
    child.request_id,
    reconcileRunId,
    WORKER_NAME,
    child.job_key,
    JSON.stringify({ parent_request_id: parentRow.request_id, chain_id: child.chain_id, stage_key: stage.stage_key, previous_child_status: childStatus, batch_id: batch.batch_id, certification_grade: output.certification_grade, version: SYSTEM_VERSION, no_manual_reconcile: true })
  );

  return {
    ...child,
    status: "completed",
    finished_at: nowIso(),
    updated_at: nowIso(),
    output_json: JSON.stringify(output),
    error_code: null,
    error_message: null,
    auto_finalized_from_calendar_tally_batch: true
  };
}

async function processIncrementalMorningFullRunJob(env, row, runId, trigger) {
  const started = Date.now();
  const parentInput = parseJsonSafeText(row.input_json || "{}", {});
  const lock = await ensureIncrementalMorningFullRunLock(env, row);
  if (!lock.ok) {
    const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, status: "blocked_incremental_morning_full_run_lock_busy", certification: "INCREMENTAL_MORNING_FULL_RUN_LOCK_BUSY", lock_reason: lock.reason, lock, continuation_required: true, orchestrator_should_self_continue: false };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'INCREMENTAL_MORNING_FULL_RUN_LOCK_BUSY', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output)
    );
    await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=datetime('now','+5 minutes'), updated_at=CURRENT_TIMESTAMP, output_json=? WHERE request_id=?", JSON.stringify(output), row.request_id);
    return output;
  }

  const childRows = await all(env.CONTROL_DB,
    "SELECT request_id, parent_request_id, chain_id, job_key, worker_name, status, input_json, output_json, error_code, error_message, created_at, started_at, finished_at, updated_at, CASE WHEN status IN ('pending','running','partial_continue') AND finished_at IS NULL AND datetime(updated_at) <= datetime(CURRENT_TIMESTAMP, '-75 seconds') THEN 1 ELSE 0 END AS is_stale FROM control_job_queue WHERE parent_request_id=? ORDER BY datetime(created_at) ASC",
    row.request_id
  );
  const stageReports = [];

  for (let i = 0; i < INCREMENTAL_MORNING_FULL_RUN_STAGES.length; i++) {
    const stage = INCREMENTAL_MORNING_FULL_RUN_STAGES[i];
    const attempts = childRows.filter(c => incrementalFullRunStageKeyFromChild(c) === stage.stage_key || (!incrementalFullRunStageKeyFromChild(c) && c.job_key === stage.job_key));
    let child = attempts.length ? attempts[attempts.length - 1] : null;
    if (child) {
      child = await reconcileIncrementalCalendarTallyChildFromBatches(env, row, stage, child);
      const lifecycleReconcile = await reconcileIncrementalFullRunChildLifecycle(env, child, trigger);
      child = lifecycleReconcile.child || child;
    }
    if (!child) {
      let enqueued = null;
      let childStatusForReport = "pending";
      let childPassForReport = null;
      let childNoopProof = null;
      if (stage.layer_key) {
        const gapProof = await getIncrementalFullRunLayerBlockingGapCount(env, stage.layer_key);
        if (gapProof.ok && gapProof.noop_safe === true) {
          enqueued = await completeIncrementalFullRunNoGapLayerChild(env, row, stage, i, runId, trigger, gapProof);
          childStatusForReport = "completed";
          childPassForReport = true;
          childNoopProof = gapProof;
        }
      }
      if (!enqueued) enqueued = await enqueueIncrementalMorningFullRunChild(env, row, stage, i, 0);
      const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "incremental_morning_full_run", status: childStatusForReport === "completed" ? "PARTIAL_CONTINUE_INCREMENTAL_MORNING_FULL_RUN_LAYER_NOOP_COMPLETED" : "PARTIAL_CONTINUE_INCREMENTAL_MORNING_FULL_RUN_CHILD_ENQUEUED", certification: childStatusForReport === "completed" ? "INCREMENTAL_MORNING_FULL_RUN_LAYER_NOOP_COMPLETED" : "INCREMENTAL_MORNING_FULL_RUN_CHILD_ENQUEUED", certification_grade: "PARTIAL", current_stage_key: stage.stage_key, current_stage_index: i, enqueued_child_request_id: enqueued.child_request_id, completed_stage_count: stageReports.length + (childStatusForReport === "completed" ? 1 : 0), total_stage_count: INCREMENTAL_MORNING_FULL_RUN_STAGES.length, stages: [...stageReports, { stage_key: stage.stage_key, job_key: stage.job_key, child_request_id: enqueued.child_request_id, child_status: childStatusForReport, pass: childPassForReport, no_gap_noop: childStatusForReport === "completed", gap_proof: childNoopProof }], continuation_required: true, orchestrator_should_self_continue: true, lock_held: true, no_browser_loop: true, no_scoring: true, no_ranking: true, no_final_board: true };
      await run(env.CONTROL_DB,
        "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, ?, ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)",
        runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.certification, i + 1, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output)
      );
      await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
      await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'incremental_morning_full_run_child_enqueued', 'Incremental Morning Full Run enqueued or no-op completed next child stage', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ parent_request_id: row.request_id, child_request_id: enqueued.child_request_id, stage_key: stage.stage_key, stage_index: i, mode: stage.mode, no_gap_noop_completed: childStatusForReport === "completed", gap_proof: childNoopProof }));
      return output;
    }

    const validation = childPassedIncrementalMorningFullRun(stage, child);
    const childOutput = parseJsonSafeText(child.output_json || "{}", {});
    const report = { stage_key: stage.stage_key, job_key: stage.job_key, mode: stage.mode, child_request_id: child.request_id, child_status: child.status, child_certification: childOutput.certification || null, child_data_ok: childOutput.data_ok === true, pass: validation.pass, wait: !!validation.wait, reason: validation.reason || null, rows_read: childOutput.rows_read || 0, rows_written: childOutput.rows_written || 0, rows_promoted: childOutput.rows_promoted || 0, external_calls: childOutput.external_calls_performed || childOutput.external_calls || 0, attempts: attempts.length };

    if (validation.wait) {
      const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "incremental_morning_full_run", status: "PARTIAL_CONTINUE_INCREMENTAL_MORNING_FULL_RUN_WAITING_ON_CHILD", certification: "INCREMENTAL_MORNING_FULL_RUN_WAITING_ON_CHILD", certification_grade: "PARTIAL", current_stage_key: stage.stage_key, waiting_on_child_request_id: child.request_id, waiting_on_child_status: child.status, completed_stage_count: stageReports.length, total_stage_count: INCREMENTAL_MORNING_FULL_RUN_STAGES.length, stages: [...stageReports, report], continuation_required: true, orchestrator_should_self_continue: true, lock_held: true };
      await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'INCREMENTAL_MORNING_FULL_RUN_WAITING_ON_CHILD', ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, i + 1, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
      await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=datetime('now','+8 seconds'), updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
      await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'incremental_morning_full_run_parent_deferred_while_child_active', 'Parent deferred briefly so the active child hot-continuation row can own the next backend tick', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ parent_request_id: row.request_id, child_request_id: child.request_id, child_status: child.status, stage_key: stage.stage_key, parent_run_after_delay_seconds: 8, full_run_hot_continuation_v0_2_95: true }));
      return output;
    }

    if (!validation.pass) {
      if (validation.transient && attempts.length <= INCREMENTAL_MORNING_FULL_RUN_MAX_RETRIES_PER_STAGE) {
        if (validation.reason === "child_stale_unfinished") {
          const replacedOutput = {
            ok: false,
            data_ok: false,
            version: SYSTEM_VERSION,
            worker_name: child.worker_name,
            job_key: child.job_key,
            request_id: child.request_id,
            chain_id: child.chain_id,
            status: "INCREMENTAL_FULL_RUN_STALE_CHILD_REPLACED_BY_RETRY",
            certification: "INCREMENTAL_FULL_RUN_STALE_CHILD_REPLACED_BY_RETRY",
            certification_grade: "RETRY_REPLACED",
            parent_request_id: row.request_id,
            stage_key: stage.stage_key,
            previous_status: child.status,
            previous_updated_at: child.updated_at,
            retry_attempt_index: attempts.length,
            no_board_refresh: true,
            no_market_context: true,
            no_scoring: true,
            no_final_board: true
          };
          await run(env.CONTROL_DB,
            "UPDATE control_job_queue SET status='failed', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='incremental_full_run_stale_child_replaced_by_retry', error_message='Delta Full Run stale child was closed and replaced by a same-stage retry.' WHERE request_id=? AND status IN ('pending','running','partial_continue') AND finished_at IS NULL",
            JSON.stringify(replacedOutput), child.request_id
          );
          await run(env.CONTROL_DB,
            "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'WARN', 'incremental_morning_full_run_stale_child_closed_for_retry', 'Closed stale Delta Full Run child before enqueueing same-stage retry', ?, CURRENT_TIMESTAMP)",
            child.request_id, runId, WORKER_NAME, child.job_key, JSON.stringify({ parent_request_id: row.request_id, stage_key: stage.stage_key, previous_status: child.status, previous_updated_at: child.updated_at, retry_attempt_index: attempts.length, stale_threshold_minutes: 2, version: SYSTEM_VERSION })
          );
        }
        const enqueued = await enqueueIncrementalMorningFullRunChild(env, row, stage, i, attempts.length);
        const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "incremental_morning_full_run", status: "PARTIAL_CONTINUE_INCREMENTAL_MORNING_FULL_RUN_TRANSIENT_RETRY_ENQUEUED", certification: "INCREMENTAL_MORNING_FULL_RUN_TRANSIENT_RETRY_ENQUEUED", certification_grade: "PARTIAL", current_stage_key: stage.stage_key, failed_child_request_id: child.request_id, retry_child_request_id: enqueued.child_request_id, retry_count: attempts.length, failed_reason: validation.reason, stages: [...stageReports, { ...report, retry_child_request_id: enqueued.child_request_id }], continuation_required: true, orchestrator_should_self_continue: true, lock_held: true };
        await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'INCREMENTAL_MORNING_FULL_RUN_TRANSIENT_RETRY_ENQUEUED', ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, i + 1, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
        await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
        return output;
      }
      const finalStatus = validation.reason === "child_stale_unfinished" ? "BLOCKED_INCREMENTAL_MORNING_FULL_RUN_CHILD_BLOCKED" : "FAILED_INCREMENTAL_MORNING_FULL_RUN_CHILD_FAILED";
      const output = { ok: false, data_ok: false, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "incremental_morning_full_run", status: finalStatus, certification: finalStatus, certification_grade: finalStatus.startsWith("BLOCKED") ? "BLOCKED" : "FAILED", failed_stage_key: stage.stage_key, failed_request_id: child.request_id, failed_reason: validation.reason, child_error_code: child.error_code || null, child_error_message: child.error_message || null, last_output_preview: JSON.stringify(childOutput).slice(0, 1200), stages: [...stageReports, report], retry_exhausted: !!validation.transient, full_run_certified: false };
      await releaseIncrementalMorningFullRunLock(env, row);
      await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, finalStatus.startsWith("BLOCKED") ? "blocked" : "failed", finalStatus, i + 1, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output), finalStatus.toLowerCase(), String(validation.reason || "incremental full run child failed").slice(0, 900));
      await run(env.CONTROL_DB, "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?", finalStatus.startsWith("BLOCKED") ? "blocked" : "failed", JSON.stringify(output), finalStatus.toLowerCase(), String(validation.reason || "incremental full run child failed").slice(0, 900), row.request_id);
      await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'ERROR', 'incremental_morning_full_run_stopped', 'Incremental Morning Full Run stopped on failed/blocked child stage', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify(output));
      return output;
    }

    stageReports.push(report);
  }

  const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "incremental_morning_full_run", status: "COMPLETED_INCREMENTAL_MORNING_FULL_RUN", certification: "INCREMENTAL_MORNING_FULL_RUN_CERTIFIED_CALENDAR_TALLY_AND_ALL_BASE_DELTAS_PASS", certification_grade: "FULL_RUN_PASS", full_run_certified: true, calendar_tally_precheck_first: true, calendar_tally_final_check_last: true, final_calendar_tally_blocking_gap_count: 0, completed_stage_count: stageReports.length, total_stage_count: INCREMENTAL_MORNING_FULL_RUN_STAGES.length, stages: stageReports, approved_chain_order: INCREMENTAL_MORNING_FULL_RUN_STAGES.map(s => s.job_key), approved_stage_order: INCREMENTAL_MORNING_FULL_RUN_STAGES.map(s => s.stage_key), no_board_refresh_included: true, board_refresh_deferred: true, no_scoring: true, no_ranking: true, no_final_board: true, no_old_production_touch: true };
  await releaseIncrementalMorningFullRunLock(env, row);
  await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'completed', 1, 'INCREMENTAL_MORNING_FULL_RUN_CERTIFIED_CALENDAR_TALLY', ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, stageReports.length, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
  await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='completed', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
  await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'incremental_morning_full_run_completed', 'Incremental Morning Full Run certified all incremental base/delta stages', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify(output));
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
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_static_prop_taxonomy_service_binding', 'STATIC_PROP_TAXONOMY_WORKER service binding is missing')",
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

  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

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
      writes_shadow_table_only: isSimulationJob,
      no_sleeper_work: true,
      no_old_production_touch: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
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


async function processMarketContextSourceProbeJob(env, row, runId, trigger) {
  if (!env.MARKET_NORMALIZER_WORKER || typeof env.MARKET_NORMALIZER_WORKER.fetch !== "function") {
    const output = { ok:false, data_ok:false, version:SYSTEM_VERSION, processed_by:WORKER_NAME, worker_name:row.worker_name, job_key:row.job_key, status:"blocked_missing_service_binding", certification:"MARKET_TEAMS_GAME_ODDS_SERVICE_BINDING_MISSING", trigger, note:"Exact dispatch requires MARKET_NORMALIZER_WORKER service binding. Do not generic-dispatch this worker." };
    await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_market_normalizer_service_binding', 'MARKET_NORMALIZER_WORKER service binding is missing')", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output));
    await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_market_normalizer_service_binding', error_message='MARKET_NORMALIZER_WORKER service binding is missing' WHERE request_id=?", JSON.stringify(output), row.request_id);
    return output;
  }
  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const requestedMode = String(rowInput.mode || "market_hitter_prop_line_context");
  const isPitcherMode = requestedMode === "market_pitcher_prop_line_context" || requestedMode === "pitcher_props" || requestedMode === "market_pitcher_props";
  const propFamily = isPitcherMode ? "pitcher" : "hitter";
  const selectedMode = isPitcherMode ? "market_pitcher_prop_line_context" : "market_hitter_prop_line_context";
  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    run_id: runId,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: "market_teams_game_odds",
    input_json: rowInput,
    exact_worker_only: true,
    teams_game_odds_real_worker_shape: true,
    today_tomorrow_retention_only: true,
    evidence_tables_only: true,
    odds_api_game_odds_lane: true,
    odds_api_sport_key: "baseball_mlb",
    odds_api_markets: ["h2h", "spreads", "totals"],
    odds_api_event_level_game_team_markets: ["team_totals", "alternate_spreads", "alternate_totals"],
    no_player_props_in_this_worker: true,
    parlay_player_prop_coverage_test_only: false,
    no_market_current_lines_writes: true,
    no_score_db_mutation: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_matrix_builder: true,
    no_old_production_touch: true
  };
  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

  const started = Date.now();
  let output;
  let httpStatus = null;
  try {
    const resp = await serviceBindingFetch(env.MARKET_NORMALIZER_WORKER, "https://internal.alphadog-v2-market-normalizer/run", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(input) }, "market_normalizer");
    httpStatus = resp.status;
    const text = await resp.text();
    try { output = JSON.parse(text); } catch (_) { output = { ok:false, data_ok:false, version:SYSTEM_VERSION, processed_by:WORKER_NAME, worker_name:row.worker_name, job_key:row.job_key, status:"worker_non_json_response", http_status:httpStatus, response_preview:String(text || "").slice(0,900) }; }
  } catch (err) { output = { ok:false, data_ok:false, version:SYSTEM_VERSION, processed_by:WORKER_NAME, worker_name:row.worker_name, job_key:row.job_key, status:"worker_dispatch_exception", error:String(err && err.message ? err.message : err) }; }
  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && (output.rows_read || output.prepared_rows_read) ? (output.rows_read || output.prepared_rows_read) : 0);
  const rowsWritten = Number(output && output.rows_written ? output.rows_written : 0);
  const externalCalls = Number(output && (output.external_calls_performed || output.external_calls) ? (output.external_calls_performed || output.external_calls) : 0);
  const certification = String((output && (output.certification || output.certification_status)) || (ok ? "market_teams_game_odds_completed" : "market_teams_game_odds_failed")).slice(0,120);
  const queueStatus = ok ? "completed" : "failed";
  const runStatus = ok ? "completed" : "failed";
  const errorCode = ok ? null : "market_teams_game_odds_worker_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status || output.certification)) || "External Teams/Game Odds worker failed").slice(0,900);
  const cappedOutput = { ...output, orchestrator_dispatch:{ version:SYSTEM_VERSION, processed_by:WORKER_NAME, exact_worker_only:true, trigger, http_status:httpStatus, elapsed_ms:Date.now()-started, teams_game_odds_real_worker_shape:true, today_tomorrow_retention_only:true, no_market_current_lines_writes:true, no_score_db_mutation:true, no_scoring:true, no_ranking:true, no_final_board_write:true, no_matrix_builder:true, no_old_production_touch:true } };
  await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now()-started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage);
  await run(env.CONTROL_DB, "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?", queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id);
  await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'market_teams_game_odds_dispatch_completed', 'Orchestrator completed exact External Teams/Game Odds dispatch', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, certification, rows_read: rowsRead, rows_written: rowsWritten, external_calls: externalCalls, dispatch: cappedOutput.orchestrator_dispatch }));
  return cappedOutput;
}

async function processMarketHitterPropContextJob(env, row, runId, trigger) {
  if (!env.MARKET_LINE_SHAPE_CLASSIFIER_WORKER || typeof env.MARKET_LINE_SHAPE_CLASSIFIER_WORKER.fetch !== "function") {
    const output = { ok:false, data_ok:false, version:SYSTEM_VERSION, processed_by:WORKER_NAME, worker_name:row.worker_name, job_key:row.job_key, status:"blocked_missing_service_binding", certification:"MARKET_HITTER_PROP_CONTEXT_SERVICE_BINDING_MISSING", trigger, note:"Exact dispatch requires MARKET_LINE_SHAPE_CLASSIFIER_WORKER service binding. Do not generic-dispatch this worker." };
    await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_market_line_shape_classifier_service_binding', 'MARKET_LINE_SHAPE_CLASSIFIER_WORKER service binding is missing')", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output));
    await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_market_line_shape_classifier_service_binding', error_message='MARKET_LINE_SHAPE_CLASSIFIER_WORKER service binding is missing' WHERE request_id=?", JSON.stringify(output), row.request_id);
    return output;
  }
  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const requestedMode = String(rowInput.mode || "market_hitter_prop_line_context");
  const isPitcherMode = requestedMode === "market_pitcher_prop_line_context" || requestedMode === "pitcher_props" || requestedMode === "market_pitcher_props";
  const propFamily = isPitcherMode ? "pitcher" : "hitter";
  const selectedMode = isPitcherMode ? "market_pitcher_prop_line_context" : "market_hitter_prop_line_context";
  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    parent_chain_id: rowInput.parent_chain_id || rowInput.parentChainId || row.chain_id || null,
    parent_request_id: rowInput.parent_request_id || rowInput.parentRequestId || row.parent_request_id || null,
    run_id: runId,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    source: rowInput.source || "orchestrator_exact_market_line_shape_dispatch",
    visible_button: rowInput.visible_button || (isPitcherMode ? "MARKET > Pitchers" : "MARKET > Hitters"),
    stage_key: rowInput.stage_key || (isPitcherMode ? "market_context_pitchers" : "market_context_hitters"),
    stage_index: rowInput.stage_index ?? null,
    stage_count: rowInput.stage_count ?? null,
    retry_count: rowInput.retry_count ?? 0,
    approved_chain_order: rowInput.approved_chain_order || null,
    stop_on_first_failed_stage: rowInput.stop_on_first_failed_stage === true,
    backend_chain_only: rowInput.backend_chain_only === true,
    no_browser_loop: rowInput.no_browser_loop === true,
    backend_scheduled_continuation: rowInput.backend_scheduled_continuation === true,
    no_generic_dispatch: rowInput.no_generic_dispatch === true,
    mode: selectedMode,
    input_json: rowInput,
    exact_worker_only: true,
    selected_worker_slot: "alphadog-v2-market-line-shape-classifier",
    parlay_api_first_test: true,
    player_props_mode_specific_only: true,
    prop_family: propFamily,
    no_teams_game_odds: true,
    opposite_prop_family_not_in_this_run: true,
    no_internal_player_factors: true,
    today_tomorrow_retention_only: true,
    evidence_tables_only: true,
    no_market_current_lines_writes: true,
    no_prepared_board_mutation: true,
    no_source_board_mutation: rowInput.no_source_board_mutation === true,
    no_score_db_mutation: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_matrix_builder: true,
    no_old_production_touch: true,
    force_parlay_live_fetch: rowInput.force_parlay_live_fetch === true,
    allow_parlay_live_fetch: rowInput.allow_parlay_live_fetch === true,
    parlay_live_fetch: rowInput.parlay_live_fetch === true || String(rowInput.parlay_live_fetch || "").toLowerCase() === "true",
    full_market_prop_evidence_scan: rowInput.full_market_prop_evidence_scan === true
  };
  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

  const started = Date.now();
  let output;
  let httpStatus = null;
  try {
    const resp = await serviceBindingFetch(env.MARKET_LINE_SHAPE_CLASSIFIER_WORKER, "https://internal.alphadog-v2-market-line-shape-classifier/run", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(input) }, "market_line_shape_classifier");
    httpStatus = resp.status;
    const text = await resp.text();
    try { output = JSON.parse(text); } catch (_) { output = { ok:false, data_ok:false, version:SYSTEM_VERSION, processed_by:WORKER_NAME, worker_name:row.worker_name, job_key:row.job_key, status:"worker_non_json_response", http_status:httpStatus, response_preview:String(text || "").slice(0,900) }; }
  } catch (err) {
    output = { ok:false, data_ok:false, version:SYSTEM_VERSION, processed_by:WORKER_NAME, worker_name:row.worker_name, job_key:row.job_key, status:"worker_dispatch_exception", error:String(err && err.message ? err.message : err) };
  }
  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && (output.rows_read || output.prepared_rows_read) ? (output.rows_read || output.prepared_rows_read) : 0);
  const rowsWritten = Number(output && output.rows_written ? output.rows_written : 0);
  const externalCalls = Number(output && (output.external_calls_performed || output.external_calls) ? (output.external_calls_performed || output.external_calls) : 0);
  const certification = String((output && (output.certification || output.certification_status)) || (ok ? `market_${propFamily}_prop_context_completed` : `market_${propFamily}_prop_context_failed`)).slice(0,120);
  const queueStatus = ok ? "completed" : "failed";
  const runStatus = ok ? "completed" : "failed";
  const errorCode = ok ? null : `market_${propFamily}_prop_context_worker_failed`;
  const errorMessage = ok ? null : String((output && (output.error || output.status || output.certification)) || `Market ${propFamily} Prop Context worker failed`).slice(0,900);
  const cappedOutput = { ...output, orchestrator_dispatch:{ version:SYSTEM_VERSION, processed_by:WORKER_NAME, exact_worker_only:true, trigger, http_status:httpStatus, elapsed_ms:Date.now()-started, selected_worker_slot:"alphadog-v2-market-line-shape-classifier", market_prop_backend_flags_forwarded:true, player_props_mode_specific_only:true, prop_family:propFamily, no_teams_game_odds:true, opposite_prop_family_not_in_this_run:true, today_tomorrow_retention_only:true, no_market_current_lines_writes:true, no_prepared_board_mutation:true, no_score_db_mutation:true, no_scoring:true, no_ranking:true, no_final_board_write:true, no_matrix_builder:true, no_old_production_touch:true } };
  await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now()-started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage);
  await run(env.CONTROL_DB, "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?", queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id);
  await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'market_player_prop_context_dispatch_completed', 'Orchestrator completed exact Market Player Prop Context dispatch', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, certification, rows_read: rowsRead, rows_written: rowsWritten, external_calls: externalCalls, dispatch: cappedOutput.orchestrator_dispatch }));
  return cappedOutput;
}


async function processOddsApiHitterPropContextJob(env, row, runId, trigger) {
  if (!env.ODDSAPI_REFERENCE_WORKER || typeof env.ODDSAPI_REFERENCE_WORKER.fetch !== "function") {
    const output = { ok:false, data_ok:false, version:SYSTEM_VERSION, processed_by:WORKER_NAME, worker_name:row.worker_name, job_key:row.job_key, status:"blocked_missing_service_binding", certification:"ODDSAPI_HITTER_PROP_CONTEXT_SERVICE_BINDING_MISSING", trigger, note:"Exact dispatch requires ODDSAPI_REFERENCE_WORKER service binding. Do not generic-dispatch this worker." };
    await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_oddsapi_reference_service_binding', 'ODDSAPI_REFERENCE_WORKER service binding is missing')", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output));
    await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_oddsapi_reference_service_binding', error_message='ODDSAPI_REFERENCE_WORKER service binding is missing' WHERE request_id=?", JSON.stringify(output), row.request_id);
    return output;
  }
  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const requestedMode = String(rowInput.mode || "market_hitter_prop_line_context");
  const isPitcherMode = requestedMode === "market_pitcher_prop_line_context" || requestedMode === "pitcher_props" || requestedMode === "market_pitcher_props";
  const propFamily = isPitcherMode ? "pitcher" : "hitter";
  const selectedMode = isPitcherMode ? "market_pitcher_prop_line_context" : "market_hitter_prop_line_context";
  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    run_id: runId,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: "market_hitter_prop_line_context_oddsapi",
    input_json: rowInput,
    exact_worker_only: true,
    selected_worker_slot: "alphadog-v2-oddsapi-reference",
    odds_api_player_props_event_level: true,
    hitter_player_props_only: true,
    no_parlay_api_calls: true,
    no_teams_game_odds: true,
    no_pitcher_props: true,
    today_tomorrow_retention_only: true,
    evidence_tables_only: true,
    no_market_current_lines_writes: true,
    no_prepared_board_mutation: true,
    no_score_db_mutation: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_matrix_builder: true,
    no_old_production_touch: true
  };
  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

  const started = Date.now();
  let output;
  let httpStatus = null;
  try {
    const resp = await env.ODDSAPI_REFERENCE_WORKER.fetch("https://internal.alphadog-v2-oddsapi-reference/run", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(input) });
    httpStatus = resp.status;
    const text = await resp.text();
    try { output = JSON.parse(text); } catch (_) { output = { ok:false, data_ok:false, version:SYSTEM_VERSION, processed_by:WORKER_NAME, worker_name:row.worker_name, job_key:row.job_key, status:"worker_non_json_response", http_status:httpStatus, response_preview:String(text || "").slice(0,900) }; }
  } catch (err) {
    output = { ok:false, data_ok:false, version:SYSTEM_VERSION, processed_by:WORKER_NAME, worker_name:row.worker_name, job_key:row.job_key, status:"worker_dispatch_exception", error:String(err && err.message ? err.message : err) };
  }
  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && (output.rows_read || output.prepared_rows_read) ? (output.rows_read || output.prepared_rows_read) : 0);
  const rowsWritten = Number(output && output.rows_written ? output.rows_written : 0);
  const externalCalls = Number(output && (output.external_calls_performed || output.external_calls) ? (output.external_calls_performed || output.external_calls) : 0);
  const certification = String((output && (output.certification || output.certification_status)) || (ok ? "oddsapi_hitter_prop_context_completed" : "oddsapi_hitter_prop_context_failed")).slice(0,120);
  const queueStatus = ok ? "completed" : "failed";
  const runStatus = ok ? "completed" : "failed";
  const errorCode = ok ? null : "oddsapi_hitter_prop_context_worker_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status || output.certification)) || "OddsAPI Hitter Prop Context worker failed").slice(0,900);
  const cappedOutput = { ...output, orchestrator_dispatch:{ version:SYSTEM_VERSION, processed_by:WORKER_NAME, exact_worker_only:true, trigger, http_status:httpStatus, elapsed_ms:Date.now()-started, selected_worker_slot:"alphadog-v2-oddsapi-reference", odds_api_player_props_event_level:true, hitter_player_props_only:true, no_parlay_api_calls:true, no_teams_game_odds:true, no_pitcher_props:true, today_tomorrow_retention_only:true, no_market_current_lines_writes:true, no_prepared_board_mutation:true, no_score_db_mutation:true, no_scoring:true, no_ranking:true, no_final_board_write:true, no_matrix_builder:true, no_old_production_touch:true } };
  await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now()-started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage);
  await run(env.CONTROL_DB, "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?", queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id);
  await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'oddsapi_hitter_prop_context_dispatch_completed', 'Orchestrator completed exact OddsAPI Hitter Prop Context dispatch', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, certification, rows_read: rowsRead, rows_written: rowsWritten, external_calls: externalCalls, dispatch: cappedOutput.orchestrator_dispatch }));
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
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_market_source_health_service_binding', 'MARKET_SOURCE_HEALTH_WORKER service binding is missing')",
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

  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

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
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
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
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_prizepicks_github_board_service_binding', 'PRIZEPICKS_GITHUB_BOARD_WORKER service binding is missing')",
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

  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

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

  const cappedOutput = compactPrizePicksOutputForD1({
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      output_size_guard: "prizepicks_dispatch_output_compacted_before_d1_write",
      no_generic_dispatch: true,
      prizepicks_dispatch_queue_close_fix_v0_2_97: true,
      no_scoring: true,
      no_final_board_write: true
    }
  });
  const cappedOutputJson = safeStringifyD1(cappedOutput, 60000);

  await run(env.CONTROL_DB,
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), cappedOutputJson, errorCode, errorMessage
  );

  if (partialContinue) {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
      cappedOutputJson, row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, cappedOutputJson, errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'prizepicks_github_board_dispatch_completed', 'Orchestrator completed exact prizepicks-github-board dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, status: queueStatus, certification, rows_read: rowsRead, rows_written: rowsWritten, external_calls: externalCalls, output_json_chars: cappedOutputJson.length, output_size_guard: true, partial_continue: partialContinue })
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
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_parlay_sleeper_board_service_binding', 'PARLAY_SLEEPER_BOARD_WORKER service binding is missing')",
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

  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

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
      writes_shadow_table_only: isSimulationJob,
      no_promotion: false,
      board_inventory_only: true,
      sleeper_finalization_fix_v0_2_98: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
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
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_base_hitter_game_logs_service_binding', 'BASE_HITTER_GAME_LOGS_WORKER service binding is missing')",
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

  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

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
      writes_shadow_table_only: isSimulationJob,
      no_live_promotion_before_certification: true,
      delta_partial_continue_queue_fix_v0_2_23: true,
      hitter_delta_mode_normalization_v0_2_77: true,
      raw_requested_mode: rawRequestedMode,
      normalized_worker_mode: normalizedWorkerMode,
      legacy_preflight_mode_normalized: rawRequestedMode === "delta_retained_stage_restore_before_queue"
    }
  };

  await run(env.CONTROL_DB,
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
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
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_base_hitter_splits_service_binding', 'BASE_HITTER_SPLITS_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );

    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_base_hitter_splits_service_binding', error_message='BASE_HITTER_SPLITS_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );

    return output;
  }

  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const requestedMode = String(rowInput.mode || "market_hitter_prop_line_context");
  const isPitcherMode = requestedMode === "market_pitcher_prop_line_context" || requestedMode === "pitcher_props" || requestedMode === "market_pitcher_props";
  const propFamily = isPitcherMode ? "pitcher" : "hitter";
  const selectedMode = isPitcherMode ? "market_pitcher_prop_line_context" : "market_hitter_prop_line_context";
  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: rowInput.mode === "delta_update" ? "orchestrator_exact_delta_hitter_splits_noop_restore_gate_dispatch" : "orchestrator_exact_base_hitter_splits_promotion_dispatch",
    input_json: rowInput
  };

  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

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
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
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
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_base_hitter_metrics_service_binding', 'BASE_HITTER_METRICS_WORKER service binding is missing')",
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
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
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
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_base_pitcher_metrics_service_binding', 'BASE_PITCHER_METRICS_WORKER service binding is missing')",
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
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
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
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_base_pitcher_splits_service_binding', 'BASE_PITCHER_SPLITS_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_base_pitcher_splits_service_binding', error_message='BASE_PITCHER_SPLITS_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );
    return output;
  }

  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const requestedMode = String(rowInput.mode || "market_hitter_prop_line_context");
  const isPitcherMode = requestedMode === "market_pitcher_prop_line_context" || requestedMode === "pitcher_props" || requestedMode === "market_pitcher_props";
  const propFamily = isPitcherMode ? "pitcher" : "hitter";
  const selectedMode = isPitcherMode ? "market_pitcher_prop_line_context" : "market_hitter_prop_line_context";
  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: rowInput.mode || "orchestrator_exact_base_pitcher_splits_promote_certified_stage",
    input_json: rowInput
  };
  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

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
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
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
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_base_pitcher_game_logs_service_binding', 'BASE_PITCHER_GAME_LOGS_WORKER service binding is missing')",
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

  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

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
  const partialContinue = isPartialContinueOutput(output);
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
      writes_shadow_table_only: isSimulationJob,
      manual_wake_testing_only: true,
      no_browser_pump: true,
      pitcher_delta_mode_normalization_v0_2_78: true,
      raw_requested_mode: rawRequestedMode,
      normalized_worker_mode: normalizedWorkerMode,
      legacy_preflight_mode_normalized: rawRequestedMode === "delta_retained_stage_restore_before_queue"
    }
  };

  await run(env.CONTROL_DB,
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
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
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_base_team_game_logs_service_binding', 'BASE_TEAM_GAME_LOGS_WORKER service binding is missing')",
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

  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

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
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
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
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_base_bullpen_history_service_binding', 'BASE_BULLPEN_HISTORY_WORKER service binding is missing')",
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
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
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
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_base_starter_history_service_binding', 'BASE_STARTER_HISTORY_WORKER service binding is missing')",
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

  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

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
      base_starter_history_v0_4_9_coverage_gap_scoped_repair: starterMode === "delta_coverage_gap_scoped_repair",
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
      delta_coverage_gap_scoped_repair_allowed: starterMode === "delta_coverage_gap_scoped_repair",
      delta_scoped_source_repair_allowed: starterMode === "delta_scoped_source_repair",
      delta_retained_stage_restore_before_queue_allowed: starterMode === "delta_retained_stage_restore_before_queue",
      delta_noop_current_state_allowed: starterMode === "delta_noop_current_state",
      delta_update_retained_stage_allowed: starterMode === "delta_update",
      delta_update_allowed: starterMode === "delta_update",
      no_live_promotion: !(starterMode === "base_promotion_stage_clean" || starterMode === "base_promotion" || starterMode === "delta_update" || starterMode === "delta_scoped_source_repair" || starterMode === "delta_coverage_gap_scoped_repair"),
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
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
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
    row.request_id, runId, WORKER_NAME, row.job_key, ok || partialContinue ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, status: queueStatus, run_status: runStatus, certification, rows_read: rowsRead, rows_written: rowsWritten, external_calls: externalCalls, raw_requested_mode: rawRequestedMode, normalized_worker_mode: starterMode, requested_preflight_behavior: rowInput.requested_preflight_behavior || null, legacy_preflight_mode_normalized: legacyPreflightModeNormalized, mode: starterMode, source_probe_only: starterMode === "source_lock_probe", stage_only_base_backfill: starterMode === "base_backfill_stage_only" || starterMode === "base_backfill", delta_update: starterMode === "delta_update", delta_update_allowed: starterMode === "delta_update", no_delta_update_execution: starterMode !== "delta_update", no_live_promotion: !(starterMode === "base_promotion_stage_clean" || starterMode === "base_promotion" || starterMode === "delta_update" || starterMode === "delta_scoped_source_repair" || starterMode === "delta_coverage_gap_scoped_repair"), partial_continue: partialContinue })
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
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_static_teams_service_binding', 'STATIC_TEAMS_WORKER service binding is missing')",
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

  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

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
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
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
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_static_stadiums_service_binding', 'STATIC_STADIUMS_WORKER service binding is missing')",
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

  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

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
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
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
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_static_park_factors_service_binding', 'STATIC_PARK_FACTORS_WORKER service binding is missing')",
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

  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

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
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
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
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_static_players_service_binding', 'STATIC_PLAYERS_WORKER service binding is missing')",
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

  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

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
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
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



async function processDailyProbablePitchersJob(env, row, runId, trigger) {
  if (!env.DAILY_PROBABLE_PITCHERS_WORKER || typeof env.DAILY_PROBABLE_PITCHERS_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "DAILY_STARTERS_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch is enabled only through DAILY_PROBABLE_PITCHERS_WORKER service binding. Do not generic-dispatch this worker."
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_daily_probable_pitchers_service_binding', 'DAILY_PROBABLE_PITCHERS_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_daily_probable_pitchers_service_binding', error_message='DAILY_PROBABLE_PITCHERS_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );
    return output;
  }

  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const requestedMode = String(rowInput.mode || "market_hitter_prop_line_context");
  const isPitcherMode = requestedMode === "market_pitcher_prop_line_context" || requestedMode === "pitcher_props" || requestedMode === "market_pitcher_props";
  const propFamily = isPitcherMode ? "pitcher" : "hitter";
  const selectedMode = isPitcherMode ? "market_pitcher_prop_line_context" : "market_hitter_prop_line_context";
  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: "orchestrator_exact_daily_starters_dispatch",
    input_json: rowInput,
    exact_worker_only: true,
    prepared_board_relevance_only: true,
    anchors_to_mlb_game_calendar_game_pk: true,
    writes_daily_starters_context_only: true,
    no_calendar_rebuild: true,
    no_board_mutation: true,
    no_lineups: true,
    no_weather: true,
    no_bullpen: true,
    no_market_odds: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true
  };

  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

  const started = Date.now();
  let output;
  let httpStatus = null;
  try {
    const resp = await serviceBindingFetch(env.DAILY_PROBABLE_PITCHERS_WORKER, "https://internal.alphadog-v2-daily-probable-pitchers/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }, "daily_starters", DAILY_CONTEXT_EXACT_WORKER_TIMEOUT_MS);
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
  const rowsRead = Number(output && (output.prepared_rows_read || output.teams_checked) ? (output.prepared_rows_read || output.teams_checked) : 0);
  const rowsWritten = Number(output && output.rows_written ? output.rows_written : 0);
  const externalCalls = Number(output && output.external_calls_performed ? output.external_calls_performed : 0);
  const certification = String((output && output.certification) || (ok ? "daily_starters_completed" : "daily_starters_failed")).slice(0, 120);
  const queueStatus = ok ? "completed" : "failed";
  const runStatus = ok ? "completed" : "failed";
  const errorCode = ok ? null : "daily_starters_worker_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status)) || "Daily Starters worker failed").slice(0, 900);
  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      no_calendar_rebuild: true,
      no_board_mutation: true,
      no_lineups: true,
      no_weather: true,
      no_bullpen: true,
      no_market_odds: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true,
      writes_shadow_table_only: false,
      no_old_production_touch: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  const partial = false;
  if (partial) {
    const nextInput = {
      ...rowInput,
      matrix_batch_id: output && (output.matrix_batch_id || output.batch_id) ? (output.matrix_batch_id || output.batch_id) : rowInput.matrix_batch_id || null,
      resume_batch_id: output && (output.matrix_batch_id || output.batch_id) ? (output.matrix_batch_id || output.batch_id) : rowInput.resume_batch_id || null,
      matrix_resume: true,
      continuation_from_request_id: row.request_id
    };
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      JSON.stringify(nextInput), JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'daily_starters_dispatch_completed', 'Orchestrator completed exact Daily Starters dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, certification, rows_read: rowsRead, rows_written: rowsWritten, dispatch: cappedOutput.orchestrator_dispatch })
  );

  return cappedOutput;
}


async function processDailyPlayerAvailabilityJob(env, row, runId, trigger) {
  if (!env.DAILY_PLAYER_AVAILABILITY_WORKER || typeof env.DAILY_PLAYER_AVAILABILITY_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "DAILY_PLAYER_AVAILABILITY_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch is enabled only through DAILY_PLAYER_AVAILABILITY_WORKER service binding. Do not generic-dispatch this worker."
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_daily_player_availability_service_binding', 'DAILY_PLAYER_AVAILABILITY_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_daily_player_availability_service_binding', error_message='DAILY_PLAYER_AVAILABILITY_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );
    return output;
  }

  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const requestedMode = String(rowInput.mode || "market_hitter_prop_line_context");
  const isPitcherMode = requestedMode === "market_pitcher_prop_line_context" || requestedMode === "pitcher_props" || requestedMode === "market_pitcher_props";
  const propFamily = isPitcherMode ? "pitcher" : "hitter";
  const selectedMode = isPitcherMode ? "market_pitcher_prop_line_context" : "market_hitter_prop_line_context";
  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: "daily_player_availability_refresh_window",
    input_json: rowInput,
    exact_worker_only: true,
    prepared_board_relevance_only: true,
    anchors_to_mlb_game_calendar_game_pk: true,
    writes_daily_player_availability_sidecar_only: true,
    sidecar_tables_only: true,
    legacy_daily_player_availability_stub_untouched: true,
    no_calendar_rebuild: true,
    no_daily_game_status_duplication: true,
    no_daily_starters_duplication: true,
    no_daily_lineups: true,
    no_board_mutation: true,
    no_weather: true,
    no_bullpen: true,
    no_market_odds: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_old_production_touch: true
  };

  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

  const started = Date.now();
  let output;
  let httpStatus = null;
  try {
    const resp = await serviceBindingFetch(env.DAILY_PLAYER_AVAILABILITY_WORKER, "https://internal.alphadog-v2-daily-player-availability/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }, "daily_player_availability", DAILY_CONTEXT_EXACT_WORKER_TIMEOUT_MS);
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
  const rowsRead = Number(output && (output.prepared_rows_read || output.prepared_players_checked) ? (output.prepared_rows_read || output.prepared_players_checked) : 0);
  const rowsWritten = Number(output && output.rows_written ? output.rows_written : 0);
  const externalCalls = Number(output && (output.external_calls_performed || output.external_calls) ? (output.external_calls_performed || output.external_calls) : 0);
  const certification = String((output && output.certification) || (ok ? "daily_player_availability_completed" : "daily_player_availability_failed")).slice(0, 120);
  const queueStatus = ok ? "completed" : "failed";
  const runStatus = ok ? "completed" : "failed";
  const errorCode = ok ? null : "daily_player_availability_worker_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status || output.certification)) || "Daily Player Availability worker failed").slice(0, 900);
  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      sidecar_tables_only: true,
      no_calendar_rebuild: true,
      no_daily_game_status_duplication: true,
      no_daily_starters_duplication: true,
      no_daily_lineups: true,
      no_board_mutation: true,
      no_weather: true,
      no_bullpen: true,
      no_market_odds: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true,
      writes_shadow_table_only: false,
      no_old_production_touch: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  const partial = false;
  if (partial) {
    const nextInput = {
      ...rowInput,
      matrix_batch_id: output && (output.matrix_batch_id || output.batch_id) ? (output.matrix_batch_id || output.batch_id) : rowInput.matrix_batch_id || null,
      resume_batch_id: output && (output.matrix_batch_id || output.batch_id) ? (output.matrix_batch_id || output.batch_id) : rowInput.resume_batch_id || null,
      matrix_resume: true,
      continuation_from_request_id: row.request_id
    };
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      JSON.stringify(nextInput), JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'daily_player_availability_dispatch_completed', 'Orchestrator completed exact Daily Player Availability dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, certification, rows_read: rowsRead, rows_written: rowsWritten, dispatch: cappedOutput.orchestrator_dispatch })
  );

  return cappedOutput;
}

async function processDailyWeatherJob(env, row, runId, trigger) {
  if (!env.DAILY_WEATHER_WORKER || typeof env.DAILY_WEATHER_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "DAILY_WEATHER_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch is enabled only through DAILY_WEATHER_WORKER service binding. Do not generic-dispatch this worker."
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_daily_weather_service_binding', 'DAILY_WEATHER_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_daily_weather_service_binding', error_message='DAILY_WEATHER_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );
    return output;
  }

  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const requestedMode = String(rowInput.mode || "market_hitter_prop_line_context");
  const isPitcherMode = requestedMode === "market_pitcher_prop_line_context" || requestedMode === "pitcher_props" || requestedMode === "market_pitcher_props";
  const propFamily = isPitcherMode ? "pitcher" : "hitter";
  const selectedMode = isPitcherMode ? "market_pitcher_prop_line_context" : "market_hitter_prop_line_context";
  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: "daily_weather_refresh_window",
    input_json: rowInput,
    exact_worker_only: true,
    prepared_board_relevance_only: true,
    anchors_to_mlb_game_calendar_game_pk: true,
    writes_daily_weather_roof_context_only: true,
    unified_weather_roof_context: true,
    volatile_current_retention_today_tomorrow_only: true,
    static_reference_data_read_only: true,
    legacy_daily_weather_stub_untouched: true,
    legacy_daily_roof_status_stub_untouched: true,
    no_calendar_rebuild: true,
    no_daily_game_status_duplication: true,
    no_daily_starters_duplication: true,
    no_daily_lineups: true,
    no_daily_player_availability_duplication: true,
    no_board_mutation: true,
    no_bullpen: true,
    no_market_odds: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_old_production_touch: true
  };

  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

  const started = Date.now();
  let output;
  let httpStatus = null;
  try {
    const resp = await serviceBindingFetch(env.DAILY_WEATHER_WORKER, "https://internal.alphadog-v2-daily-weather/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }, "daily_weather", DAILY_CONTEXT_EXACT_WORKER_TIMEOUT_MS);
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
  const rowsRead = Number(output && (output.prepared_rows_read || output.prepared_games_checked) ? (output.prepared_rows_read || output.prepared_games_checked) : 0);
  const rowsWritten = Number(output && output.weather_rows_written ? output.weather_rows_written : (output && output.rows_written ? output.rows_written : 0));
  const externalCalls = Number(output && (output.external_calls || output.external_calls_performed) ? (output.external_calls || output.external_calls_performed) : 0);
  const certification = String((output && output.certification) || (ok ? "daily_weather_completed" : "daily_weather_failed")).slice(0, 120);
  const queueStatus = ok ? "completed" : "failed";
  const runStatus = ok ? "completed" : "failed";
  const errorCode = ok ? null : "daily_weather_worker_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status || output.certification)) || "Daily Weather worker failed").slice(0, 900);
  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      unified_weather_roof_context: true,
      volatile_current_retention_today_tomorrow_only: true,
      static_reference_data_read_only: true,
      no_calendar_rebuild: true,
      no_daily_game_status_duplication: true,
      no_daily_starters_duplication: true,
      no_daily_lineups: true,
      no_daily_player_availability_duplication: true,
      no_board_mutation: true,
      no_bullpen: true,
      no_market_odds: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true,
      writes_shadow_table_only: false,
      no_old_production_touch: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  const partial = false;
  if (partial) {
    const nextInput = {
      ...rowInput,
      matrix_batch_id: output && (output.matrix_batch_id || output.batch_id) ? (output.matrix_batch_id || output.batch_id) : rowInput.matrix_batch_id || null,
      resume_batch_id: output && (output.matrix_batch_id || output.batch_id) ? (output.matrix_batch_id || output.batch_id) : rowInput.resume_batch_id || null,
      matrix_resume: true,
      continuation_from_request_id: row.request_id
    };
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      JSON.stringify(nextInput), JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'daily_weather_dispatch_completed', 'Orchestrator completed exact Daily Weather/Roof dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, certification, rows_read: rowsRead, rows_written: rowsWritten, external_calls: externalCalls, dispatch: cappedOutput.orchestrator_dispatch })
  );

  return cappedOutput;
}


async function recoverDailyTeamScheduleSpotSidecarForDispatch(env, row, timeoutError) {
  const batch = await first(env.DAILY_DB, "SELECT * FROM daily_team_schedule_spot_batches WHERE request_id=? ORDER BY datetime(created_at) DESC LIMIT 1", row.request_id);
  if (!batch || !batch.batch_id) return null;
  const c = await first(env.DAILY_DB, "SELECT COUNT(*) AS n FROM daily_team_schedule_spot_current WHERE batch_id=?", batch.batch_id);
  const s = await first(env.DAILY_DB, "SELECT COUNT(*) AS n FROM daily_team_schedule_spot_snapshots WHERE batch_id=?", batch.batch_id);
  const i = await first(env.DAILY_DB, "SELECT COUNT(*) AS n FROM daily_team_schedule_spot_issues WHERE batch_id=?", batch.batch_id);
  const currentRows = Number(c && c.n || 0);
  const snapshotRows = Number(s && s.n || 0);
  const issueRows = Number(i && i.n || 0);
  const expected = Number(batch.teams_checked || batch.team_rows_written || currentRows || 0);
  if (!(currentRows > 0 && snapshotRows > 0 && currentRows === snapshotRows && (expected <= 0 || currentRows >= expected))) return null;
  const output = {
    ok: true,
    data_ok: true,
    version: SYSTEM_VERSION,
    worker_name: row.worker_name,
    job_key: row.job_key,
    request_id: row.request_id,
    chain_id: row.chain_id,
    batch_id: batch.batch_id,
    status: "completed_recovered_from_team_schedule_sidecar_after_dispatch_timeout",
    certification: issueRows > 0 ? "DAILY_TEAM_SCHEDULE_SPOT_CERTIFIED_WITH_WARNINGS" : "DAILY_TEAM_SCHEDULE_SPOT_CERTIFIED_READY",
    certification_grade: issueRows > 0 ? "PASS_WITH_WARNINGS" : "PASS",
    certification_reason: "Recovered complete Daily Team Schedule Spot sidecar rows after service-binding terminal handoff stalled; batch/current/snapshot rows were DB-verified.",
    window_start: batch.window_start || null,
    window_end: batch.window_end || null,
    calendar_games_checked: Number(batch.calendar_games_checked || 0),
    prepared_games_checked: Number(batch.prepared_games_checked || 0),
    prepared_rows_read: Number(batch.prepared_rows_read || 0),
    teams_checked: Math.max(expected, currentRows),
    team_rows_written: currentRows,
    rows_written: currentRows,
    snapshot_rows_written: snapshotRows,
    issues_written: issueRows,
    warning_count: issueRows,
    external_calls: Number(batch.external_calls || 0),
    recovered_from_sidecar_terminalization: true,
    dispatch_timeout_reconciled_from_sidecar: true,
    timeout_error: String(timeoutError || "daily_team_schedule_spot_service_binding_timeout").slice(0, 900),
    no_score_db_mutation: true,
    no_board_mutation: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true
  };
  await run(env.DAILY_DB, "UPDATE daily_team_schedule_spot_batches SET status='completed', teams_checked=?, team_rows_written=?, snapshot_rows_written=?, warning_count=?, certification_status=?, certification_grade=?, certification_reason=?, output_json=?, completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", Math.max(expected, currentRows), currentRows, snapshotRows, issueRows, output.certification, output.certification_grade, output.certification_reason, JSON.stringify(output), batch.batch_id);
  return output;
}

async function processDailyTeamScheduleSpotJob(env, row, runId, trigger) {
  if (!env.DAILY_SCHEDULE_WORKER || typeof env.DAILY_SCHEDULE_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "DAILY_TEAM_SCHEDULE_SPOT_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch is enabled only through DAILY_SCHEDULE_WORKER service binding. Do not generic-dispatch this worker."
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_daily_team_schedule_spot_service_binding', 'DAILY_SCHEDULE_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_daily_team_schedule_spot_service_binding', error_message='DAILY_SCHEDULE_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );
    return output;
  }

  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const requestedMode = String(rowInput.mode || "market_hitter_prop_line_context");
  const isPitcherMode = requestedMode === "market_pitcher_prop_line_context" || requestedMode === "pitcher_props" || requestedMode === "market_pitcher_props";
  const propFamily = isPitcherMode ? "pitcher" : "hitter";
  const selectedMode = isPitcherMode ? "market_pitcher_prop_line_context" : "market_hitter_prop_line_context";
  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: "daily_team_schedule_spot_refresh_window",
    input_json: rowInput,
    exact_worker_only: true,
    prepared_board_relevance_only: true,
    anchors_to_mlb_game_calendar_game_pk: true,
    writes_daily_team_schedule_spot_context_only: true,
    volatile_current_snapshot_issue_retention_today_tomorrow_only: true,
    batches_retained_for_audit: true,
    no_external_sources: true,
    no_calendar_rebuild: true,
    no_daily_game_status_duplication: true,
    no_daily_starters_duplication: true,
    no_daily_lineups_duplication: true,
    no_daily_player_availability_duplication: true,
    no_daily_weather_duplication: true,
    no_daily_bullpen_duplication: true,
    no_board_mutation: true,
    no_market_odds: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_old_production_touch: true
  };

  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

  const started = Date.now();
  let output;
  let httpStatus = null;
  try {
    // v0.2.202: Team Schedule Spot has proven it can write complete sidecar rows but stall before terminal response.
    // Bound the service-binding wait and reconcile from DB-verified sidecar rows instead of holding GLOBAL_ORCHESTRATOR.
    const resp = await serviceBindingFetch(env.DAILY_SCHEDULE_WORKER, "https://internal.alphadog-v2-daily-schedule/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }, "daily_team_schedule_spot", DAILY_CONTEXT_EXACT_WORKER_TIMEOUT_MS);
    httpStatus = resp.status;
    const text = await resp.text();
    try { output = JSON.parse(text); }
    catch (_) {
      output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "worker_non_json_response", http_status: httpStatus, response_preview: String(text || "").slice(0, 900) };
    }
  } catch (err) {
    const timeoutText = String(err && err.message ? err.message : err);
    try { output = await recoverDailyTeamScheduleSpotSidecarForDispatch(env, row, timeoutText); } catch (_) { output = null; }
    if (!output) {
      output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "worker_dispatch_exception", error: timeoutText, dispatch_timeout_reconcile_attempted: true };
    }
  }

  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && (output.prepared_rows_read || output.teams_checked) ? (output.prepared_rows_read || output.teams_checked) : 0);
  const rowsWritten = Number(output && (output.team_rows_written || output.rows_written) ? (output.team_rows_written || output.rows_written) : 0);
  const externalCalls = Number(output && (output.external_calls || output.external_calls_performed) ? (output.external_calls || output.external_calls_performed) : 0);
  const certification = String((output && output.certification) || (ok ? "daily_team_schedule_spot_completed" : "daily_team_schedule_spot_failed")).slice(0, 120);
  const queueStatus = ok ? "completed" : "failed";
  const runStatus = ok ? "completed" : "failed";
  const errorCode = ok ? null : "daily_team_schedule_spot_worker_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status || output.certification)) || "Daily Team Schedule Spot worker failed").slice(0, 900);
  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      volatile_current_snapshot_issue_retention_today_tomorrow_only: true,
      no_external_sources: true,
      no_calendar_rebuild: true,
      no_daily_game_status_duplication: true,
      no_daily_starters_duplication: true,
      no_daily_lineups_duplication: true,
      no_daily_player_availability_duplication: true,
      no_daily_weather_duplication: true,
      no_daily_bullpen_duplication: true,
      no_board_mutation: true,
      no_market_odds: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true,
      writes_shadow_table_only: false,
      no_old_production_touch: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  const partial = false;
  if (partial) {
    const nextInput = {
      ...rowInput,
      matrix_batch_id: output && (output.matrix_batch_id || output.batch_id) ? (output.matrix_batch_id || output.batch_id) : rowInput.matrix_batch_id || null,
      resume_batch_id: output && (output.matrix_batch_id || output.batch_id) ? (output.matrix_batch_id || output.batch_id) : rowInput.resume_batch_id || null,
      matrix_resume: true,
      continuation_from_request_id: row.request_id
    };
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      JSON.stringify(nextInput), JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'daily_team_schedule_spot_dispatch_completed', 'Orchestrator completed exact Daily Team Schedule Spot dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, certification, rows_read: rowsRead, rows_written: rowsWritten, external_calls: externalCalls, dispatch: cappedOutput.orchestrator_dispatch })
  );

  return cappedOutput;
}

async function processDailyBullpenAvailabilityJob(env, row, runId, trigger) {
  if (!env.DAILY_BULLPEN_AVAILABILITY_WORKER || typeof env.DAILY_BULLPEN_AVAILABILITY_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "DAILY_BULLPEN_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch is enabled only through DAILY_BULLPEN_AVAILABILITY_WORKER service binding. Do not generic-dispatch this worker."
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_daily_bullpen_availability_service_binding', 'DAILY_BULLPEN_AVAILABILITY_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_daily_bullpen_availability_service_binding', error_message='DAILY_BULLPEN_AVAILABILITY_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );
    return output;
  }

  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const requestedMode = String(rowInput.mode || "market_hitter_prop_line_context");
  const isPitcherMode = requestedMode === "market_pitcher_prop_line_context" || requestedMode === "pitcher_props" || requestedMode === "market_pitcher_props";
  const propFamily = isPitcherMode ? "pitcher" : "hitter";
  const selectedMode = isPitcherMode ? "market_pitcher_prop_line_context" : "market_hitter_prop_line_context";
  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: "daily_bullpen_availability_refresh_window",
    input_json: rowInput,
    exact_worker_only: true,
    internal_source_only_v0_1: true,
    primary_source_table: "TEAM_DB.bullpen_history",
    prepared_board_relevance_only: true,
    anchors_to_mlb_game_calendar_game_pk: true,
    writes_daily_bullpen_context_only: true,
    volatile_current_retention_today_tomorrow_only: true,
    no_external_sources: true,
    no_calendar_rebuild: true,
    no_daily_game_status_duplication: true,
    no_daily_starters_duplication: true,
    no_daily_lineups_duplication: true,
    no_daily_player_availability_dependency: true,
    no_board_mutation: true,
    no_weather: true,
    no_market_odds: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_old_production_touch: true
  };

  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

  const started = Date.now();
  let output;
  let httpStatus = null;
  try {
    const resp = await serviceBindingFetch(env.DAILY_BULLPEN_AVAILABILITY_WORKER, "https://internal.alphadog-v2-daily-bullpen-availability/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }, "daily_bullpen", DAILY_CONTEXT_EXACT_WORKER_TIMEOUT_MS);
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
  const rowsRead = Number(output && (output.prepared_rows_read || output.teams_checked) ? (output.prepared_rows_read || output.teams_checked) : 0);
  const rowsWritten = Number(output && (output.team_rows_written || output.rows_written) ? (output.team_rows_written || output.rows_written) : 0);
  const externalCalls = Number(output && (output.external_calls || output.external_calls_performed) ? (output.external_calls || output.external_calls_performed) : 0);
  const certification = String((output && output.certification) || (ok ? "daily_bullpen_completed" : "daily_bullpen_failed")).slice(0, 120);
  const queueStatus = ok ? "completed" : "failed";
  const runStatus = ok ? "completed" : "failed";
  const errorCode = ok ? null : "daily_bullpen_worker_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status || output.certification)) || "Daily Bullpen Availability worker failed").slice(0, 900);
  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      internal_source_only_v0_1: true,
      primary_source_table: "TEAM_DB.bullpen_history",
      volatile_current_retention_today_tomorrow_only: true,
      no_external_sources: true,
      no_calendar_rebuild: true,
      no_daily_game_status_duplication: true,
      no_daily_starters_duplication: true,
      no_daily_lineups_duplication: true,
      no_daily_player_availability_dependency: true,
      no_board_mutation: true,
      no_weather: true,
      no_market_odds: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true,
      writes_shadow_table_only: false,
      no_old_production_touch: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  const partial = false;
  if (partial) {
    const nextInput = {
      ...rowInput,
      matrix_batch_id: output && (output.matrix_batch_id || output.batch_id) ? (output.matrix_batch_id || output.batch_id) : rowInput.matrix_batch_id || null,
      resume_batch_id: output && (output.matrix_batch_id || output.batch_id) ? (output.matrix_batch_id || output.batch_id) : rowInput.resume_batch_id || null,
      matrix_resume: true,
      continuation_from_request_id: row.request_id
    };
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      JSON.stringify(nextInput), JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'daily_bullpen_dispatch_completed', 'Orchestrator completed exact Daily Bullpen Availability dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, certification, rows_read: rowsRead, rows_written: rowsWritten, external_calls: externalCalls, dispatch: cappedOutput.orchestrator_dispatch })
  );

  return cappedOutput;
}

async function processDailyUmpireContextJob(env, row, runId, trigger) {
  if (!env.DAILY_USAGE_PULSE_WORKER || typeof env.DAILY_USAGE_PULSE_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "DAILY_UMPIRE_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch uses the existing DAILY_USAGE_PULSE_WORKER dummy slot to avoid worker_manifest/global deploy changes. Do not generic-dispatch this worker."
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_daily_umpire_context_existing_usage_pulse_service_binding', 'DAILY_USAGE_PULSE_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_daily_umpire_context_existing_usage_pulse_service_binding', error_message='DAILY_USAGE_PULSE_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );
    return output;
  }

  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const requestedMode = String(rowInput.mode || "market_hitter_prop_line_context");
  const isPitcherMode = requestedMode === "market_pitcher_prop_line_context" || requestedMode === "pitcher_props" || requestedMode === "market_pitcher_props";
  const propFamily = isPitcherMode ? "pitcher" : "hitter";
  const selectedMode = isPitcherMode ? "market_pitcher_prop_line_context" : "market_hitter_prop_line_context";
  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: "daily_umpire_context_refresh_window",
    input_json: rowInput,
    exact_worker_only: true,
    prepared_board_relevance_only: true,
    anchors_to_mlb_game_calendar_game_pk: true,
    writes_daily_umpire_context_only: true,
    game_level_one_row_per_game_pk: true,
    volatile_current_snapshot_issue_retention_today_tomorrow_only: true,
    batches_retained_for_audit: true,
    missing_assignment_warning_only_v0_1: true,
    official_mlb_source_probe_only: true,
    no_secondary_scrapers: true,
    no_paid_sources: true,
    no_umpire_tendencies_without_verified_history: true,
    no_calendar_rebuild: true,
    no_daily_game_status_duplication: true,
    no_daily_starters_duplication: true,
    no_daily_lineups_duplication: true,
    no_daily_player_availability_duplication: true,
    no_daily_weather_duplication: true,
    no_daily_bullpen_duplication: true,
    no_daily_team_schedule_spot_duplication: true,
    no_board_mutation: true,
    no_market_odds: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_old_production_touch: true
  };

  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

  const started = Date.now();
  let output;
  let httpStatus = null;
  try {
    const resp = await serviceBindingFetch(env.DAILY_USAGE_PULSE_WORKER, "https://internal.alphadog-v2-daily-usage-pulse/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }, "daily_umpire_context", DAILY_CONTEXT_EXACT_WORKER_TIMEOUT_MS);
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
  const rowsRead = Number(output && (output.prepared_rows_read || output.games_checked) ? (output.prepared_rows_read || output.games_checked) : 0);
  const rowsWritten = Number(output && (output.game_rows_written || output.rows_written) ? (output.game_rows_written || output.rows_written) : 0);
  const externalCalls = Number(output && (output.external_calls || output.external_calls_performed) ? (output.external_calls || output.external_calls_performed) : 0);
  const certification = String((output && output.certification) || (ok ? "daily_umpire_completed" : "daily_umpire_failed")).slice(0, 120);
  const queueStatus = ok ? "completed" : "failed";
  const runStatus = ok ? "completed" : "failed";
  const errorCode = ok ? null : "daily_umpire_context_worker_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status || output.certification)) || "Daily Umpire Context worker failed").slice(0, 900);
  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      official_mlb_source_probe_only: true,
      missing_assignment_warning_only_v0_1: true,
      game_level_one_row_per_game_pk: true,
      volatile_current_snapshot_issue_retention_today_tomorrow_only: true,
      no_secondary_scrapers: true,
      no_paid_sources: true,
      no_umpire_tendencies_without_verified_history: true,
      no_calendar_rebuild: true,
      no_daily_game_status_duplication: true,
      no_daily_starters_duplication: true,
      no_daily_lineups_duplication: true,
      no_daily_player_availability_duplication: true,
      no_daily_weather_duplication: true,
      no_daily_bullpen_duplication: true,
      no_daily_team_schedule_spot_duplication: true,
      no_board_mutation: true,
      no_market_odds: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true,
      writes_shadow_table_only: false,
      no_old_production_touch: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  const partial = false;
  if (partial) {
    const nextInput = {
      ...rowInput,
      matrix_batch_id: output && (output.matrix_batch_id || output.batch_id) ? (output.matrix_batch_id || output.batch_id) : rowInput.matrix_batch_id || null,
      resume_batch_id: output && (output.matrix_batch_id || output.batch_id) ? (output.matrix_batch_id || output.batch_id) : rowInput.resume_batch_id || null,
      matrix_resume: true,
      continuation_from_request_id: row.request_id
    };
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      JSON.stringify(nextInput), JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'daily_umpire_context_dispatch_completed', 'Orchestrator completed exact Daily Umpire Context dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, certification, rows_read: rowsRead, rows_written: rowsWritten, external_calls: externalCalls, dispatch: cappedOutput.orchestrator_dispatch })
  );

  return cappedOutput;
}


async function processDailyContextCertifierJob(env, row, runId, trigger) {
  if (!env.DAILY_CERTIFIER_WORKER || typeof env.DAILY_CERTIFIER_WORKER.fetch !== "function") {
    const output = { ok:false, data_ok:false, version:SYSTEM_VERSION, processed_by:WORKER_NAME, worker_name:row.worker_name, job_key:row.job_key, status:"blocked_missing_service_binding", certification:"DAILY_CONTEXT_CERTIFIER_SERVICE_BINDING_MISSING", trigger, note:"Exact dispatch requires DAILY_CERTIFIER_WORKER service binding. Do not generic-dispatch this worker." };
    await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_daily_context_certifier_service_binding', 'DAILY_CERTIFIER_WORKER service binding is missing')", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output));
    await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_daily_context_certifier_service_binding', error_message='DAILY_CERTIFIER_WORKER service binding is missing' WHERE request_id=?", JSON.stringify(output), row.request_id);
    return output;
  }
  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const input = { request_id: row.request_id, run_id: runId, chain_id: row.chain_id, job_key: row.job_key, worker_name: row.worker_name, trigger, mode:"daily_context_readiness_refresh_window", input_json: rowInput, exact_worker_only:true, readiness_enrichment_only:true, not_strict_all_context_enforcement:true, prepared_board_relevance_only:true, reads_locked_daily_context_sidecars_only:true, volatile_current_issue_retention_today_tomorrow_only:true, batches_retained_for_audit:true, no_external_calls:true, no_sidecar_repair:true, no_calendar_rebuild:true, no_daily_game_status_duplication:true, no_board_mutation:true, no_market_odds:true, no_score_db_mutation:true, no_scoring:true, no_ranking:true, no_final_board:true, no_old_production_touch:true };
  const started = Date.now();
  const dispatchTimeoutMs = DAILY_CONTEXT_EXACT_WORKER_TIMEOUT_MS;
  let output;
  let httpStatus = null;
  let timedOut = false;

  // v0.2.223: before re-dispatching a timed-out certifier child, first check
  // whether the previous invocation already wrote a complete readiness ledger.
  // This prevents duplicate certifier mining and converts terminal-handoff gaps
  // into a verified completion only when readiness_current rows prove it.
  const certifierStage = dailyContextStageForChildRow(row) || { job_key: "daily-certifier", worker_name: row.worker_name, stage_key: "daily_context_certifier" };
  if (env.DAILY_DB) {
    try {
      const preRecovered = await buildDailyContextCertifierSidecarRecoveryOutput(env, row.request_id, certifierStage, { fromTimeout:false });
      if (preRecovered && preRecovered.ok === true) {
        output = {
          ...preRecovered,
          status: "COMPLETED_DAILY_CONTEXT_CERTIFIER_RECOVERED_BEFORE_REDISPATCH",
          recovered_before_redispatch: true,
          no_duplicate_certifier_dispatch_after_timeout: true
        };
        httpStatus = 200;
      }
    } catch (_) {
      output = null;
    }
  }

  try {
    if (!output) {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      timedOut = true;
      try { controller.abort("daily_context_certifier_dispatch_timeout"); } catch (_) {}
    }, dispatchTimeoutMs);
    try {
      const resp = await env.DAILY_CERTIFIER_WORKER.fetch("https://internal.alphadog-v2-daily-certifier/run", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(input), signal:controller.signal });
      httpStatus = resp.status;
      const text = await resp.text();
      try { output = JSON.parse(text); } catch (_) { output = { ok:false, data_ok:false, version:SYSTEM_VERSION, processed_by:WORKER_NAME, worker_name:row.worker_name, job_key:row.job_key, status:"worker_non_json_response", http_status:httpStatus, response_preview:String(text || "").slice(0,900) }; }
    } finally {
      clearTimeout(timer);
    }
    }
  } catch (err) {
    const errText = String(err && err.message ? err.message : err || "");
    const recovered = await buildDailyContextCertifierSidecarRecoveryOutput(env, row.request_id, certifierStage, { fromTimeout: timedOut });
    const batch = recovered && recovered.batch_id
      ? { batch_id: recovered.batch_id, status: "completed", certification_status: recovered.certification_status || recovered.certification || null, certification_grade: recovered.certification_grade || null, prepared_rows_read: recovered.prepared_rows_read || 0, current_rows_written: recovered.current_rows_written || recovered.rows_written || 0, issue_rows_written: recovered.issue_rows_written || 0, output_json: JSON.stringify(recovered), completed_at: null, updated_at: null }
      : await first(env.DAILY_DB, "SELECT batch_id, status, certification_status, certification_grade, prepared_rows_read, current_rows_written, issue_rows_written, output_json, completed_at, updated_at FROM daily_context_readiness_batches WHERE request_id=? ORDER BY datetime(created_at) DESC LIMIT 1", row.request_id);
    if (recovered && recovered.ok === true) {
      output = { ...recovered, ok:true, data_ok:true, dispatch_error_before_recovery:errText, status:"COMPLETED_DAILY_CONTEXT_CERTIFIER_RESCUED_AFTER_SERVICE_BINDING_TIMEOUT", certification: recovered.certification || recovered.certification_status || "DAILY_CONTEXT_READINESS_CERTIFIED_ENRICHMENT_LEDGER_WRITTEN" };
      httpStatus = 200;
    } else if (timedOut && batch && String(batch.status || "") === "running") {
      output = {
        ok:true,
        data_ok:true,
        version:SYSTEM_VERSION,
        processed_by:WORKER_NAME,
        worker_name:row.worker_name,
        job_key:row.job_key,
        request_id:row.request_id,
        run_id:runId,
        status:"PARTIAL_CONTINUE_DAILY_CONTEXT_CERTIFIER_TIMEOUT_WAITING_ON_SIDECAR",
        certification:"DAILY_CONTEXT_CERTIFIER_WAITING_ON_SIDECAR_TERMINALIZATION",
        certification_grade:"PARTIAL",
        continuation_required:true,
        orchestrator_should_self_continue:true,
        child_run_after_delay_seconds:10,
        error:errText,
        dispatch_timeout_ms:dispatchTimeoutMs,
        readiness_batch_found:true,
        readiness_batch_id:batch.batch_id,
        readiness_batch_status:batch.status,
        recovery_policy:"do_not_fail_certifier_timeout_until_readiness_sidecar_rows_are_rechecked",
        no_false_failure_after_timeout:true
      };
    } else {
      output = {
        ok:false,
        data_ok:false,
        version:SYSTEM_VERSION,
        processed_by:WORKER_NAME,
        worker_name:row.worker_name,
        job_key:row.job_key,
        request_id:row.request_id,
        run_id:runId,
        status: timedOut ? "daily_context_certifier_dispatch_timeout" : "worker_dispatch_exception",
        certification: timedOut ? "FAILED_DAILY_CONTEXT_CERTIFIER_DISPATCH_TIMEOUT" : "FAILED_DAILY_CONTEXT_CERTIFIER_DISPATCH_EXCEPTION",
        certification_grade:"FAILED",
        error: errText,
        dispatch_timeout_ms: dispatchTimeoutMs,
        readiness_batch_found: !!batch,
        readiness_batch_status: batch ? batch.status : null,
        no_soft_sidecar_recovery_without_completed_readiness_batch: true
      };
    }
  }
  const ok = !!(output && output.ok);
  const partialContinue = !!(output && output.continuation_required === true);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && output.prepared_rows_read ? output.prepared_rows_read : 0);
  const rowsWritten = Number(output && (output.current_rows_written || output.rows_written) ? (output.current_rows_written || output.rows_written) : 0);
  const externalCalls = Number(output && (output.external_calls || output.external_calls_performed) ? (output.external_calls || output.external_calls_performed) : 0);
  const certification = String((output && output.certification) || (ok ? "daily_context_certifier_completed" : "daily_context_certifier_failed")).slice(0,120);
  const queueStatus = partialContinue ? "pending" : (ok ? "completed" : "failed");
  const runStatus = partialContinue ? "partial_continue" : (ok ? "completed" : "failed");
  const errorCode = (ok || partialContinue) ? null : (timedOut ? "daily_context_certifier_dispatch_timeout" : "daily_context_certifier_worker_failed");
  const errorMessage = (ok || partialContinue) ? null : String((output && (output.error || output.status || output.certification)) || "Daily Context Certifier worker failed").slice(0,900);
  const cappedOutput = { ...output, orchestrator_dispatch:{ version:SYSTEM_VERSION, processed_by:WORKER_NAME, exact_worker_only:true, trigger, http_status:httpStatus, elapsed_ms:Date.now()-started, dispatch_timeout_ms:dispatchTimeoutMs, timed_out:timedOut, readiness_enrichment_only:true, not_strict_all_context_enforcement:true, volatile_current_issue_retention_today_tomorrow_only:true, no_external_calls:true, no_sidecar_repair:true, no_score_db_mutation:true, no_board_mutation:true, no_scoring:true, no_ranking:true, no_final_board_write:true, no_old_production_touch:true } };
  await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now()-started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage);
  if (partialContinue) {
    await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=datetime('now','+10 seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(cappedOutput), row.request_id);
  } else {
    await run(env.CONTROL_DB, "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?", queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id);
  }
  await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'daily_context_certifier_dispatch_completed', 'Orchestrator completed exact Daily Context Readiness dispatch', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, partialContinue ? "WARN" : (ok ? "INFO" : "ERROR"), JSON.stringify({ request_id: row.request_id, certification, rows_read: rowsRead, rows_written: rowsWritten, external_calls: externalCalls, partial_continue: partialContinue, dispatch: cappedOutput.orchestrator_dispatch }));
  return cappedOutput;
}


const DAILY_CONTEXT_FULL_RUN_LOCK_KEY = "DAILY_CONTEXT_FULL_RUN";
const DAILY_CONTEXT_FULL_RUN_STALE_MINUTES = 20;
// v0.2.206: Match the proven Market/Scoring cascade timing.
// Child rows must be due immediately so the same backend pump can drain the
// next child in the same hot loop. A +1s child run_after forces a no_due_jobs
// break and relies on delayed waitUntil/cron to resume, which is not reliable
// enough for the Daily Context full-run lock lifecycle.
const DAILY_CONTEXT_FULL_RUN_CHILD_RUN_AFTER_SECONDS = 0;
const DAILY_CONTEXT_FULL_RUN_PARENT_RECHECK_SECONDS = 0;
const DAILY_CONTEXT_FULL_RUN_STALE_CHILD_SECONDS = 120;
const DAILY_CONTEXT_FULL_RUN_STALE_CHILD_RETRY_MAX = 1;

const DAILY_CONTEXT_FULL_RUN_STAGES = [
  { stage_key: "daily_starters", job_key: "daily-probable-pitchers", worker_name: "alphadog-v2-daily-probable-pitchers", display_name: "Daily Starters", visible_button: "DAILY JOBS > Starters", mode: "daily_context_full_run_starters", worker_group: "Daily", phase_key: "daily", priority: 5 },
  { stage_key: "daily_lineups", job_key: "daily-lineups", worker_name: "alphadog-v2-daily-lineups", display_name: "Daily Lineups", visible_button: "DAILY JOBS > Lineups", mode: "daily_context_full_run_lineups", worker_group: "Daily", phase_key: "daily", priority: 5 },
  { stage_key: "daily_player_availability", job_key: "daily-player-availability", worker_name: "alphadog-v2-daily-player-availability", display_name: "Daily Player Availability", visible_button: "DAILY JOBS > Availability", mode: "daily_context_full_run_player_availability", worker_group: "Daily", phase_key: "daily", priority: 5 },
  { stage_key: "daily_weather_roof", job_key: "daily-weather", worker_name: "alphadog-v2-daily-weather", display_name: "Daily Weather / Roof", visible_button: "DAILY JOBS > Weather / Roof", mode: "daily_context_full_run_weather_roof", worker_group: "Daily", phase_key: "daily", priority: 5 },
  { stage_key: "daily_bullpen_availability", job_key: "daily-bullpen-availability", worker_name: "alphadog-v2-daily-bullpen-availability", display_name: "Daily Bullpen Availability", visible_button: "DAILY JOBS > Bullpen", mode: "daily_context_full_run_bullpen", worker_group: "Daily", phase_key: "daily", priority: 5 },
  { stage_key: "daily_team_schedule_spot", job_key: "daily-team-schedule-spot", worker_name: "alphadog-v2-daily-schedule", display_name: "Daily Team Schedule Spot", visible_button: "DAILY JOBS > Team Spot", mode: "daily_context_full_run_team_schedule_spot", worker_group: "Daily", phase_key: "daily", priority: 5 },
  { stage_key: "daily_umpire_context", job_key: "daily-umpire-context", worker_name: "alphadog-v2-daily-usage-pulse", display_name: "Daily Umpire Context", visible_button: "DAILY JOBS > Umpire", mode: "daily_context_full_run_umpire", worker_group: "Daily", phase_key: "daily", priority: 5 },
  { stage_key: "daily_context_certifier", job_key: "daily-certifier", worker_name: "alphadog-v2-daily-certifier", display_name: "Daily Context Readiness Certifier", visible_button: "DAILY JOBS > Context Cert", mode: "daily_context_full_run_certifier", worker_group: "Daily", phase_key: "daily", priority: 5 }
];

function dailyContextFullRunChildInput(parentRow, stage, stepIndex, retryCount = 0) {
  return {
    source: "daily_context_full_run_parent",
    parent_request_id: parentRow.request_id,
    chain_id: parentRow.chain_id,
    stage_key: stage.stage_key,
    stage_index: stepIndex,
    retry_count: retryCount,
    visible_button: stage.visible_button,
    mode: stage.mode,
    daily_context_full_run_child: true,
    exact_worker_only: true,
    prepared_board_relevance_only: true,
    today_tomorrow_retention_only: true,
    volatile_current_issue_retention_today_tomorrow_only: true,
    batches_retained_for_audit: true,
    reads_locked_daily_context_sidecars_only: stage.job_key === "daily-certifier",
    refreshes_one_daily_sidecar_only: stage.job_key !== "daily-certifier",
    no_calendar_rebuild: true,
    no_daily_game_status_duplication: true,
    no_board_mutation: true,
    no_market_odds: true,
    no_score_db_mutation: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_old_production_touch: true,
    created_at: nowIso()
  };
}

async function ensureDailyContextFullRunLock(env, parentRow) {
  await run(env.CONTROL_DB, "INSERT OR IGNORE INTO control_locks (lock_key, lock_flag, updated_at) VALUES (?, 0, CURRENT_TIMESTAMP)", DAILY_CONTEXT_FULL_RUN_LOCK_KEY);
  const lock = await first(env.CONTROL_DB,
    "SELECT lock_key, lock_flag, owner_request_id, owner_worker_name, acquired_at, expires_at, updated_at, CASE WHEN expires_at IS NOT NULL AND datetime(expires_at) > datetime('now') THEN 1 ELSE 0 END AS not_expired FROM control_locks WHERE lock_key=?",
    DAILY_CONTEXT_FULL_RUN_LOCK_KEY
  );
  const activeOther = await first(env.CONTROL_DB,
    "SELECT request_id, chain_id, status, updated_at FROM control_job_queue WHERE job_key='daily-context-full-run' AND request_id<>? AND status IN ('pending','running','partial_continue') AND finished_at IS NULL ORDER BY datetime(created_at) DESC LIMIT 1",
    parentRow.request_id
  );
  if (lock && Number(lock.lock_flag) === 1 && lock.owner_request_id && lock.owner_request_id !== parentRow.request_id && Number(lock.not_expired) === 1) {
    return { ok: false, reason: "daily_context_full_run_lock_busy", lock, active_other_parent: activeOther || null };
  }
  if (lock && Number(lock.lock_flag) === 1 && lock.owner_request_id && lock.owner_request_id !== parentRow.request_id && activeOther) {
    return { ok: false, reason: "daily_context_full_run_active_parent_exists", lock, active_other_parent: activeOther };
  }
  await run(env.CONTROL_DB,
    "UPDATE control_locks SET lock_flag=1, owner_request_id=?, owner_worker_name=?, acquired_at=COALESCE(acquired_at,CURRENT_TIMESTAMP), expires_at=datetime('now','+20 minutes'), updated_at=CURRENT_TIMESTAMP WHERE lock_key=?",
    parentRow.request_id, WORKER_NAME, DAILY_CONTEXT_FULL_RUN_LOCK_KEY
  );
  return { ok: true, recovered_stale_lock: !!(lock && Number(lock.lock_flag) === 1 && lock.owner_request_id !== parentRow.request_id) };
}

async function releaseDailyContextFullRunLock(env, parentRow) {
  await run(env.CONTROL_DB,
    "UPDATE control_locks SET lock_flag=0, owner_request_id=NULL, owner_worker_name=NULL, acquired_at=NULL, expires_at=NULL, lock_json=NULL, updated_at=CURRENT_TIMESTAMP WHERE lock_key=? AND (owner_request_id=? OR owner_request_id IS NULL)",
    DAILY_CONTEXT_FULL_RUN_LOCK_KEY, parentRow.request_id
  );
}

async function cleanupDailyContextOrphanChildSidecars(env, stage, child, cleanupCode) {
  const requestId = child && child.request_id ? child.request_id : null;
  if (!requestId || !stage) return { cleaned: false, reason: "missing_child_or_stage" };
  const note = String(cleanupCode || "daily_context_orphan_child_cleanup").slice(0, 120);
  const result = {
    cleaned: true,
    stage_key: stage.stage_key,
    request_id: requestId,
    sidecar_scope: "none",
    destructive_sidecar_delete: false,
    cleanup_policy: "mark_running_batch_failed_only_preserve_sidecar_rows_for_audit_and_manual_repair",
    root_cause_guard: "do_not_delete_daily_context_sidecars_from_parent_stale_guard"
  };

  if (stage.job_key === "daily-player-availability") {
    result.sidecar_scope = "daily_player_availability_v1";
    await run(env.DAILY_DB, "UPDATE daily_player_availability_batches_v1 SET status='failed', certification_status=?, certification_grade='FAILED_ORPHAN_BATCH', certification_reason='Daily Context Full Run guard failed stale Availability child; sidecar rows were preserved non-destructively for audit/recovery.', completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='running'", note, requestId);
    return result;
  }

  if (stage.job_key === "daily-weather") {
    result.sidecar_scope = "daily_game_weather";
    await run(env.DAILY_DB, "UPDATE daily_game_weather_batches SET status='failed', certification_status=?, certification_grade='FAILED_ORPHAN_BATCH', certification_reason='Daily Context Full Run guard failed stale Weather child; sidecar rows were preserved non-destructively for audit/recovery.', completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='running'", note, requestId);
    return result;
  }

  if (stage.job_key === "daily-bullpen-availability") {
    result.sidecar_scope = "daily_bullpen_availability";
    await run(env.DAILY_DB, "UPDATE daily_bullpen_availability_batches SET status='failed', certification_status=?, certification_grade='FAILED_ORPHAN_BATCH', certification_reason='Daily Context Full Run guard failed stale Bullpen child; sidecar rows were preserved non-destructively for audit/recovery.', completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='running'", note, requestId);
    return result;
  }

  if (stage.job_key === "daily-team-schedule-spot") {
    result.sidecar_scope = "daily_team_schedule_spot";
    await run(env.DAILY_DB, "UPDATE daily_team_schedule_spot_batches SET status='failed', certification_status=?, certification_grade='FAILED_ORPHAN_BATCH', certification_reason='Daily Context Full Run guard failed stale Team Spot child; sidecar rows were preserved non-destructively for audit/recovery.', completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='running'", note, requestId);
    return result;
  }

  if (stage.job_key === "daily-umpire-context") {
    result.sidecar_scope = "daily_umpire_context";
    await run(env.DAILY_DB, "UPDATE daily_umpire_context_batches SET status='failed', certification_status=?, certification_grade='FAILED_ORPHAN_BATCH', certification_reason='Daily Context Full Run guard failed stale Umpire child; sidecar rows were preserved non-destructively for audit/recovery.', completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='running'", note, requestId);
    return result;
  }

  if (stage.job_key === "daily-certifier") {
    result.sidecar_scope = "daily_context_readiness";
    await run(env.DAILY_DB, "UPDATE daily_context_readiness_batches SET status='failed', certification_status=?, certification_grade='FAILED_ORPHAN_BATCH', certification_reason='Daily Context Full Run guard failed stale Context Certifier child; readiness rows were preserved non-destructively for audit/recovery.', completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='running'", note, requestId);
    return result;
  }

  return result;
}


async function buildDailyContextCertifierSidecarRecoveryOutput(env, requestId, stage, options = {}) {
  if (!env || !env.DAILY_DB || !requestId) return null;
  const batch = await first(env.DAILY_DB,
    "SELECT * FROM daily_context_readiness_batches WHERE request_id=? ORDER BY datetime(created_at) DESC LIMIT 1",
    requestId
  );
  if (!batch || !batch.batch_id) return null;

  const status = String(batch.status || "");
  if (status === "completed" && batch.output_json) {
    const parsed = parseJsonSafeText(batch.output_json, {});
    if (parsed && parsed.ok === true) return { ...parsed, recovered_from_completed_readiness_batch: true, recovered_batch_id: batch.batch_id };
  }

  const current = await first(env.DAILY_DB,
    `SELECT
       COUNT(*) AS rows,
       COUNT(DISTINCT official_date) AS dates,
       COUNT(DISTINCT game_pk) AS games,
       COUNT(DISTINCT prepared_row_id) AS prepared_rows,
       COUNT(DISTINCT player_id) AS players,
       SUM(CASE WHEN context_status='ready_full_context' THEN 1 ELSE 0 END) AS ready_full_context_rows,
       SUM(CASE WHEN context_status='ready_with_warnings' THEN 1 ELSE 0 END) AS ready_with_warnings_rows,
       SUM(CASE WHEN context_status='ready_partial_enrichment' THEN 1 ELSE 0 END) AS ready_partial_enrichment_rows,
       SUM(CASE WHEN context_status='waiting_late_context' THEN 1 ELSE 0 END) AS waiting_late_context_rows,
       SUM(CASE WHEN context_status='blocked' THEN 1 ELSE 0 END) AS blocked_rows,
       SUM(CASE WHEN context_status='not_applicable' THEN 1 ELSE 0 END) AS not_applicable_rows,
       SUM(COALESCE(hard_blocker_count,0)) AS hard_blockers,
       SUM(COALESCE(warning_count,0)) AS warnings,
       SUM(COALESCE(enrichment_gap_count,0)) AS enrichment_gaps,
       SUM(CASE WHEN readiness_key IS NULL OR readiness_key='' THEN 1 ELSE 0 END) AS missing_keys
     FROM daily_context_readiness_current
     WHERE batch_id=?`,
    batch.batch_id
  );
  const currentRows = Number(current && current.rows || 0);
  const currentGames = Number(current && current.games || 0);
  const preparedRows = Number(current && current.prepared_rows || 0);
  const missingKeys = Number(current && current.missing_keys || 0);
  if (currentRows <= 0 || currentGames <= 0 || preparedRows <= 0 || missingKeys !== 0) return null;

  const dup = await first(env.DAILY_DB,
    `SELECT COUNT(*) AS n
     FROM (
       SELECT readiness_key, COUNT(*) AS c
       FROM daily_context_readiness_current
       WHERE batch_id=?
       GROUP BY readiness_key
       HAVING COUNT(*) > 1
     )`,
    batch.batch_id
  );
  const duplicateReadinessKeys = Number(dup && dup.n || 0);
  if (duplicateReadinessKeys !== 0) return null;

  const issueAgg = await first(env.DAILY_DB,
    "SELECT COUNT(*) AS rows FROM daily_context_readiness_issues WHERE batch_id=?",
    batch.batch_id
  );
  const issueRows = Number(issueAgg && issueAgg.rows || 0);
  const hardBlockers = Number(current && current.hard_blockers || 0);
  const warnings = Number(current && current.warnings || 0);
  const enrichmentGaps = Number(current && current.enrichment_gaps || 0);
  const blockedRows = Number(current && current.blocked_rows || 0);
  const notApplicableRows = Number(current && current.not_applicable_rows || 0);
  const readyWithWarningsRows = Number(current && current.ready_with_warnings_rows || 0);
  const readyPartialRows = Number(current && current.ready_partial_enrichment_rows || 0);
  const readyFullRows = Number(current && current.ready_full_context_rows || 0);
  const waitingRows = Number(current && current.waiting_late_context_rows || 0);
  const currentDates = Number(current && current.dates || 0);

  let grade = "PASS_WITH_WARNINGS";
  if (hardBlockers > 0 || blockedRows > 0) grade = "PASS_WITH_HARD_BLOCKERS";
  else if (notApplicableRows === currentRows) grade = "PASS_WITH_NOT_APPLICABLE";
  else if (warnings <= 0 && enrichmentGaps <= 0 && readyFullRows === currentRows) grade = "PASS";

  const certification = "DAILY_CONTEXT_READINESS_CERTIFIED_ENRICHMENT_LEDGER_WRITTEN";
  const output = {
    ok: true,
    data_ok: true,
    version: String(batch.worker_version || SYSTEM_VERSION),
    worker_name: String(stage && stage.worker_name || "alphadog-v2-daily-certifier"),
    job_key: String(stage && stage.job_key || "daily-certifier"),
    request_id: requestId,
    run_id: batch.run_id || null,
    batch_id: batch.batch_id,
    mode: "daily_context_readiness_refresh_window",
    status: "completed",
    certification,
    certification_status: certification,
    certification_grade: grade,
    certification_reason: "Recovered and terminalized DB-verified Daily Context Readiness ledger rows after service-binding/terminal handoff timeout; no sidecar rows were deleted.",
    window_start: batch.window_start || null,
    window_end: batch.window_end || null,
    prepared_rows_read: preparedRows,
    rows_read: preparedRows,
    prepared_games_checked: currentGames,
    current_rows_written: currentRows,
    rows_written: currentRows,
    issue_rows_written: issueRows,
    issues_written: issueRows,
    hard_blocker_count: hardBlockers,
    warning_count: warnings,
    enrichment_gap_count: enrichmentGaps,
    ready_full_context_count: readyFullRows,
    ready_with_warnings_count: readyWithWarningsRows,
    ready_partial_enrichment_count: readyPartialRows,
    waiting_late_context_count: waitingRows,
    blocked_count: blockedRows,
    not_applicable_count: notApplicableRows,
    retention_violations: Number(batch.retention_violations || 0),
    schema_failures: Number(batch.schema_failures || 0),
    current_dates_verified: currentDates,
    current_games_verified: currentGames,
    current_players_verified: Number(current && current.players || 0),
    current_rows_verified: currentRows,
    duplicate_readiness_keys: duplicateReadinessKeys,
    sidecar_recovery: true,
    recovered_from_service_binding_timeout: options && options.fromTimeout === true,
    recovered_from_readiness_sidecar_batch: true,
    recovered_from_sidecar_terminalization: true,
    recovery_policy: "verified_daily_context_readiness_current_rows_unique_readiness_key_then_terminalize_batch",
    external_calls: 0,
    external_calls_performed: 0,
    no_external_calls: true,
    no_sidecar_repair: true,
    no_calendar_rebuild: true,
    no_daily_game_status_duplication: true,
    no_board_mutation: true,
    no_market_odds: true,
    no_score_db_mutation: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_old_production_touch: true
  };

  await run(env.DAILY_DB,
    `UPDATE daily_context_readiness_batches
     SET status='completed',
         prepared_rows_read=?,
         prepared_games_checked=?,
         current_rows_written=?,
         issue_rows_written=?,
         hard_blocker_count=?,
         warning_count=?,
         enrichment_gap_count=?,
         ready_full_context_count=?,
         ready_with_warnings_count=?,
         ready_partial_enrichment_count=?,
         waiting_late_context_count=?,
         blocked_count=?,
         not_applicable_count=?,
         retention_violations=COALESCE(retention_violations,0),
         schema_failures=COALESCE(schema_failures,0),
         certification_status=?,
         certification_grade=?,
         certification_reason=?,
         output_json=?,
         completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP),
         updated_at=CURRENT_TIMESTAMP
     WHERE batch_id=?`,
    preparedRows, currentGames, currentRows, issueRows, hardBlockers, warnings, enrichmentGaps, readyFullRows, readyWithWarningsRows, readyPartialRows, waitingRows, blockedRows, notApplicableRows, certification, grade, output.certification_reason, JSON.stringify(output), batch.batch_id
  );

  return output;
}

async function buildDailyLineupsSidecarRecoveryOutput(env, requestId, stage) {
  if (!env || !env.DAILY_DB || !requestId) return null;
  let batch = null;
  try {
    batch = await first(env.DAILY_DB,
      "SELECT * FROM daily_lineups_batches WHERE json_extract(output_json, '$.request_id')=? ORDER BY datetime(created_at) DESC LIMIT 1",
      requestId
    );
  } catch (err) {
    try {
      const likeNeedle = `%${String(requestId).replace(/[%_]/g, "")}%`;
      batch = await first(env.DAILY_DB,
        "SELECT * FROM daily_lineups_batches WHERE output_json LIKE ? ORDER BY datetime(created_at) DESC LIMIT 1",
        likeNeedle
      );
    } catch (_) {
      batch = null;
    }
  }
  if (!batch || !batch.batch_id) return null;

  const certification = String(batch.certification_status || "");
  const grade = String(batch.certification_grade || "");
  const rowsWritten = Number(batch.rows_written || 0);
  const writesPerformed = Number(batch.writes_performed || 0);
  const productionWrites = Number(batch.production_lineup_writes_enabled || 0);
  if (!certification.startsWith("PASS_") || rowsWritten <= 0 || writesPerformed <= 0 || productionWrites !== 1) return null;

  const current = await first(env.DAILY_DB, "SELECT COUNT(*) AS rows, COUNT(DISTINCT game_pk) AS games, COUNT(DISTINCT team_id) AS teams, COUNT(DISTINCT player_id) AS players FROM daily_lineups_current WHERE batch_id=?", batch.batch_id);
  const dup = await first(env.DAILY_DB, "SELECT COUNT(*) AS n FROM (SELECT official_date, game_pk, team_side, team_id, lineup_slot, COUNT(*) AS c FROM daily_lineups_current WHERE batch_id=? GROUP BY official_date, game_pk, team_side, team_id, lineup_slot HAVING COUNT(*) > 1)", batch.batch_id);
  const currentRows = Number(current && current.rows || 0);
  const currentGames = Number(current && current.games || 0);
  const currentTeams = Number(current && current.teams || 0);
  const duplicateIdentityRows = Number(dup && dup.n || 0);
  if (currentRows <= 0 || currentGames <= 0 || duplicateIdentityRows !== 0) return null;

  const parsedOutput = parseJsonSafeText(batch.output_json || "{}", {});
  return {
    ok: true,
    data_ok: true,
    version: String(batch.worker_version || SYSTEM_VERSION),
    worker_name: String(stage && stage.worker_name || "alphadog-v2-daily-lineups"),
    job_key: String(stage && stage.job_key || "daily-lineups"),
    mode: "source_probe",
    status: "COMPLETED_SOURCE_PROBE_RECOVERED_FROM_SIDECAR",
    certification,
    certification_status: certification,
    certification_grade: grade || "PASS",
    request_id: requestId,
    batch_id: batch.batch_id,
    sidecar_recovery: true,
    recovered_from_service_binding_timeout: true,
    recovered_from_lineups_sidecar_batch: true,
    recovery_policy: "verified_daily_lineups_batch_and_current_rows_no_duplicate_identity",
    write_gate_status: batch.write_gate_status || null,
    source_probe_lane: batch.source_probe_lane || null,
    games_checked: Number(batch.games_checked || currentGames),
    lineup_write_ready_games: Number(batch.lineup_write_ready_games || currentGames),
    prepared_rows_read: Number(parsedOutput.prepared_rows_read || 0),
    rows_read: Number(parsedOutput.prepared_rows_read || 0),
    rows_written: rowsWritten,
    writes_performed: writesPerformed,
    current_rows_verified: currentRows,
    current_games_verified: currentGames,
    current_teams_verified: currentTeams,
    current_players_verified: Number(current && current.players || 0),
    duplicate_identity_rows: duplicateIdentityRows,
    external_calls: Number(parsedOutput.external_calls || parsedOutput.external_calls_performed || 0),
    no_calendar_rebuild: true,
    no_daily_game_status_duplication: true,
    no_board_mutation: true,
    no_market_odds: true,
    no_score_db_mutation: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_old_production_touch: true
  };
}

async function recoverDailyContextStaleChildFromSidecar(env, parentRow, stage, child, report, runId) {
  if (!stage || !child || !child.request_id) return null;
  const requestId = child.request_id;
  let batch = null, output = null, rowsRead = 0, rowsWritten = 0, externalCalls = 0;

  try {
    if (stage.job_key === "daily-lineups") {
      output = await buildDailyLineupsSidecarRecoveryOutput(env, requestId, stage);
      if (output && output.batch_id) {
        batch = { batch_id: output.batch_id, prepared_rows_read: output.prepared_rows_read || 0, external_calls: output.external_calls || 0 };
      }
    } else if (stage.job_key === "daily-player-availability") {
      batch = await first(env.DAILY_DB, "SELECT * FROM daily_player_availability_batches_v1 WHERE request_id=? ORDER BY datetime(created_at) DESC LIMIT 1", requestId);
      if (batch && String(batch.status || "") === "completed" && batch.output_json) output = parseJsonSafeText(batch.output_json, {});
      if (batch && !output) {
        const c = await first(env.DAILY_DB, "SELECT COUNT(*) AS n FROM daily_player_availability_current_v1 WHERE batch_id=?", batch.batch_id);
        const s = await first(env.DAILY_DB, "SELECT COUNT(*) AS n FROM daily_player_availability_snapshots_v1 WHERE batch_id=?", batch.batch_id);
        const i = await first(env.DAILY_DB, "SELECT COUNT(*) AS n FROM daily_player_availability_issues_v1 WHERE batch_id=?", batch.batch_id);
        const currentRows = Number(c && c.n || 0), snapshotRows = Number(s && s.n || 0), issueRows = Number(i && i.n || 0);
        const expected = Number(batch.prepared_players_checked || batch.rows_written || 0);
        if (currentRows > 0 && snapshotRows > 0 && currentRows === snapshotRows && (expected <= 0 || currentRows >= expected)) {
          output = { ok:true, data_ok:true, version:SYSTEM_VERSION, worker_name:stage.worker_name, job_key:stage.job_key, request_id:requestId, batch_id:batch.batch_id, status:"completed", certification:issueRows>0?"DAILY_PLAYER_AVAILABILITY_CERTIFIED_WITH_PLAYER_BLOCKERS":"DAILY_PLAYER_AVAILABILITY_CERTIFIED_READY", certification_grade:issueRows>0?"PASS_WITH_WARNINGS":"PASS", certification_reason:"Recovered complete Daily Player Availability v1 sidecar rows after child terminal handoff stalled.", prepared_games_checked:Number(batch.prepared_games_checked||0), prepared_rows_read:Number(batch.prepared_rows_read||0), prepared_players_checked:Number(batch.prepared_players_checked||currentRows), teams_checked:Number(batch.teams_checked||0), rows_written:currentRows, snapshot_rows_written:snapshotRows, issues_written:issueRows, external_calls:Number(batch.external_calls||0), recovered_from_sidecar_terminalization:true, no_score_db_mutation:true, no_board_mutation:true, no_scoring:true, no_ranking:true, no_final_board:true };
          await run(env.DAILY_DB, "UPDATE daily_player_availability_batches_v1 SET status='completed', rows_written=?, snapshot_rows_written=?, warning_count=?, certification_status=?, certification_grade=?, certification_reason=?, output_json=?, completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", currentRows, snapshotRows, issueRows, output.certification, output.certification_grade, output.certification_reason, JSON.stringify(output), batch.batch_id);
        }
      }
    } else if (stage.job_key === "daily-weather") {
      batch = await first(env.DAILY_DB, "SELECT * FROM daily_game_weather_batches WHERE request_id=? ORDER BY datetime(created_at) DESC LIMIT 1", requestId);
      if (batch && String(batch.status || "") === "completed" && batch.output_json) output = parseJsonSafeText(batch.output_json, {});
      if (batch && !output) {
        const c = await first(env.DAILY_DB, "SELECT COUNT(*) AS n FROM daily_game_weather_current WHERE batch_id=?", batch.batch_id);
        const s = await first(env.DAILY_DB, "SELECT COUNT(*) AS n FROM daily_game_weather_snapshots WHERE batch_id=?", batch.batch_id);
        const i = await first(env.DAILY_DB, "SELECT COUNT(*) AS n FROM daily_game_weather_issues WHERE batch_id=?", batch.batch_id);
        const currentRows = Number(c && c.n || 0), snapshotRows = Number(s && s.n || 0), issueRows = Number(i && i.n || 0);
        const expected = Number(batch.prepared_games_checked || batch.calendar_games_checked || 0);
        if (currentRows > 0 && snapshotRows > 0 && currentRows === snapshotRows && (expected <= 0 || currentRows >= expected)) {
          output = { ok:true, data_ok:true, version:SYSTEM_VERSION, worker_name:stage.worker_name, job_key:stage.job_key, request_id:requestId, batch_id:batch.batch_id, status:"completed", certification:issueRows>0?"DAILY_WEATHER_CERTIFIED_WITH_WARNINGS":"DAILY_WEATHER_CERTIFIED_READY", certification_grade:issueRows>0?"PASS_WITH_WARNINGS":"PASS", certification_reason:"Recovered complete Daily Weather/Roof sidecar rows after child terminal handoff stalled.", window_start:batch.window_start, window_end:batch.window_end, calendar_games_checked:Number(batch.calendar_games_checked||0), prepared_games_checked:Number(batch.prepared_games_checked||currentRows), prepared_rows_read:Number(batch.prepared_rows_read||0), weather_rows_written:currentRows, rows_written:currentRows, snapshot_rows_written:snapshotRows, issues_written:issueRows, external_calls:Number(batch.external_calls||0), recovered_from_sidecar_terminalization:true, no_score_db_mutation:true, no_board_mutation:true, no_scoring:true, no_ranking:true, no_final_board:true };
          await run(env.DAILY_DB, "UPDATE daily_game_weather_batches SET status='completed', weather_rows_written=?, snapshot_rows_written=?, warning_count=?, certification_status=?, certification_grade=?, certification_reason=?, output_json=?, completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", currentRows, snapshotRows, issueRows, output.certification, output.certification_grade, output.certification_reason, JSON.stringify(output), batch.batch_id);
        }
      }
    } else if (stage.job_key === "daily-bullpen-availability") {
      batch = await first(env.DAILY_DB, "SELECT * FROM daily_bullpen_availability_batches WHERE request_id=? ORDER BY datetime(created_at) DESC LIMIT 1", requestId);
      if (batch && String(batch.status || "") === "completed" && batch.output_json) output = parseJsonSafeText(batch.output_json, {});
      if (batch && !output) {
        const c = await first(env.DAILY_DB, "SELECT COUNT(*) AS n FROM daily_bullpen_availability_current WHERE batch_id=?", batch.batch_id);
        const p = await first(env.DAILY_DB, "SELECT COUNT(*) AS n FROM daily_bullpen_pitcher_availability_current WHERE batch_id=?", batch.batch_id);
        const s = await first(env.DAILY_DB, "SELECT COUNT(*) AS n FROM daily_bullpen_availability_snapshots WHERE batch_id=?", batch.batch_id);
        const i = await first(env.DAILY_DB, "SELECT COUNT(*) AS n FROM daily_bullpen_availability_issues WHERE batch_id=?", batch.batch_id);
        const expected = Number(batch.teams_checked || 0), currentRows = Number(c && c.n || 0), snapshotRows = Number(s && s.n || 0), issueRows = Number(i && i.n || 0), pitcherRows = Number(p && p.n || 0);
        if (expected > 0 && currentRows >= expected && snapshotRows >= expected && currentRows === snapshotRows) {
          output = { ok:true, data_ok:true, version:SYSTEM_VERSION, worker_name:stage.worker_name, job_key:stage.job_key, request_id:requestId, batch_id:batch.batch_id, status:"completed", certification:issueRows>0?"DAILY_BULLPEN_CERTIFIED_WITH_WARNINGS":"DAILY_BULLPEN_CERTIFIED_READY", certification_grade:issueRows>0?"PASS_WITH_WARNINGS":"PASS", certification_reason:"Recovered DB-verified complete Daily Bullpen sidecar rows after child terminal handoff stalled.", window_start:batch.window_start, window_end:batch.window_end, calendar_games_checked:Number(batch.calendar_games_checked||0), prepared_games_checked:Number(batch.prepared_games_checked||0), prepared_rows_read:Number(batch.prepared_rows_read||0), teams_checked:expected, team_rows_written:currentRows, rows_written:currentRows, pitcher_rows_written:pitcherRows, snapshot_rows_written:snapshotRows, issues_written:issueRows, external_calls:Number(batch.external_calls||0), recovered_from_sidecar_terminalization:true, no_score_db_mutation:true, no_board_mutation:true, no_scoring:true, no_ranking:true, no_final_board:true };
          await run(env.DAILY_DB, "UPDATE daily_bullpen_availability_batches SET status='completed', team_rows_written=?, pitcher_rows_written=?, snapshot_rows_written=?, warning_count=?, certification_status=?, certification_grade=?, certification_reason=?, output_json=?, completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", currentRows, pitcherRows, snapshotRows, issueRows, output.certification, output.certification_grade, output.certification_reason, JSON.stringify(output), batch.batch_id);
        }
      }
    } else if (stage.job_key === "daily-team-schedule-spot") {
      batch = await first(env.DAILY_DB, "SELECT * FROM daily_team_schedule_spot_batches WHERE request_id=? ORDER BY datetime(created_at) DESC LIMIT 1", requestId);
      if (batch && String(batch.status || "") === "completed" && batch.output_json) output = parseJsonSafeText(batch.output_json, {});
      if (batch && !output) {
        const c = await first(env.DAILY_DB, "SELECT COUNT(*) AS n FROM daily_team_schedule_spot_current WHERE batch_id=?", batch.batch_id);
        const s = await first(env.DAILY_DB, "SELECT COUNT(*) AS n FROM daily_team_schedule_spot_snapshots WHERE batch_id=?", batch.batch_id);
        const i = await first(env.DAILY_DB, "SELECT COUNT(*) AS n FROM daily_team_schedule_spot_issues WHERE batch_id=?", batch.batch_id);
        const currentRows = Number(c && c.n || 0), snapshotRows = Number(s && s.n || 0), issueRows = Number(i && i.n || 0);
        const expected = Number(batch.teams_checked || batch.team_rows_written || 0);
        if (currentRows > 0 && snapshotRows > 0 && currentRows === snapshotRows && (expected <= 0 || currentRows >= expected)) {
          output = { ok:true, data_ok:true, version:SYSTEM_VERSION, worker_name:stage.worker_name, job_key:stage.job_key, request_id:requestId, batch_id:batch.batch_id, status:"completed", certification:issueRows>0?"DAILY_TEAM_SCHEDULE_SPOT_CERTIFIED_WITH_WARNINGS":"DAILY_TEAM_SCHEDULE_SPOT_CERTIFIED_READY", certification_grade:issueRows>0?"PASS_WITH_WARNINGS":"PASS", certification_reason:"Recovered complete Daily Team Schedule Spot sidecar rows after child terminal handoff stalled.", window_start:batch.window_start, window_end:batch.window_end, calendar_games_checked:Number(batch.calendar_games_checked||0), prepared_games_checked:Number(batch.prepared_games_checked||0), prepared_rows_read:Number(batch.prepared_rows_read||0), teams_checked:Number(batch.teams_checked||currentRows), team_rows_written:currentRows, rows_written:currentRows, snapshot_rows_written:snapshotRows, issues_written:issueRows, external_calls:Number(batch.external_calls||0), recovered_from_sidecar_terminalization:true, no_score_db_mutation:true, no_board_mutation:true, no_scoring:true, no_ranking:true, no_final_board:true };
          await run(env.DAILY_DB, "UPDATE daily_team_schedule_spot_batches SET status='completed', team_rows_written=?, snapshot_rows_written=?, warning_count=?, certification_status=?, certification_grade=?, certification_reason=?, output_json=?, completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", currentRows, snapshotRows, issueRows, output.certification, output.certification_grade, output.certification_reason, JSON.stringify(output), batch.batch_id);
        }
      }
    } else if (stage.job_key === "daily-umpire-context") {
      batch = await first(env.DAILY_DB, "SELECT * FROM daily_umpire_context_batches WHERE request_id=? ORDER BY datetime(created_at) DESC LIMIT 1", requestId);
      if (batch && String(batch.status || "") === "completed" && batch.output_json) output = parseJsonSafeText(batch.output_json, {});
      if (batch && !output) {
        const c = await first(env.DAILY_DB, "SELECT COUNT(*) AS n FROM daily_umpire_context_current WHERE batch_id=?", batch.batch_id);
        const s = await first(env.DAILY_DB, "SELECT COUNT(*) AS n FROM daily_umpire_context_snapshots WHERE batch_id=?", batch.batch_id);
        const i = await first(env.DAILY_DB, "SELECT COUNT(*) AS n FROM daily_umpire_context_issues WHERE batch_id=?", batch.batch_id);
        const currentRows = Number(c && c.n || 0), snapshotRows = Number(s && s.n || 0), issueRows = Number(i && i.n || 0);
        if (currentRows > 0 && snapshotRows > 0) {
          output = { ok:true, data_ok:true, version:SYSTEM_VERSION, worker_name:stage.worker_name, job_key:stage.job_key, request_id:requestId, batch_id:batch.batch_id, status:"completed", certification:issueRows>0?"DAILY_UMPIRE_CONTEXT_CERTIFIED_WITH_WARNINGS":"DAILY_UMPIRE_CONTEXT_CERTIFIED_READY", certification_grade:issueRows>0?"PASS_WITH_WARNINGS":"PASS", certification_reason:"Recovered complete Daily Umpire sidecar rows after child terminal handoff stalled.", window_start:batch.window_start, window_end:batch.window_end, calendar_games_checked:Number(batch.calendar_games_checked||0), prepared_games_checked:Number(batch.prepared_games_checked||0), prepared_rows_read:Number(batch.prepared_rows_read||0), games_checked:Number(batch.games_checked||currentRows), game_rows_written:currentRows, rows_written:currentRows, snapshot_rows_written:snapshotRows, issues_written:issueRows, warning_count:issueRows, external_calls:Number(batch.external_calls||0), recovered_from_sidecar_terminalization:true, no_score_db_mutation:true, no_board_mutation:true, no_scoring:true, no_ranking:true, no_final_board:true };
          await run(env.DAILY_DB, "UPDATE daily_umpire_context_batches SET status='completed', games_checked=?, game_rows_written=?, snapshot_rows_written=?, warning_count=?, certification_status=?, certification_grade=?, certification_reason=?, output_json=?, completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", Number(batch.games_checked||currentRows), currentRows, snapshotRows, issueRows, output.certification, output.certification_grade, output.certification_reason, JSON.stringify(output), batch.batch_id);
        }
      }
    } else if (stage.job_key === "daily-certifier") {
      output = await buildDailyContextCertifierSidecarRecoveryOutput(env, requestId, stage, { fromTimeout:false });
      if (output && output.batch_id) {
        batch = { batch_id: output.batch_id, prepared_rows_read: output.prepared_rows_read || 0, external_calls: 0 };
      }
    }
  } catch (err) {
    await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'WARN', 'daily_context_full_run_sidecar_recovery_probe_failed', 'Daily Context sidecar recovery probe failed; stale guard will continue without destructive deletes', ?, CURRENT_TIMESTAMP)", parentRow.request_id, runId, WORKER_NAME, parentRow.job_key, JSON.stringify({ child_request_id: requestId, stage_key: stage.stage_key, error: String(err && err.message ? err.message : err).slice(0,900) }));
    return null;
  }

  if (!output || output.ok !== true || !batch) return null;
  rowsRead = Number(output.prepared_rows_read || batch.prepared_rows_read || 0);
  rowsWritten = Number(output.rows_written || output.team_rows_written || output.weather_rows_written || output.game_rows_written || output.current_rows_written || output.rows_promoted || 0);
  externalCalls = Number(output.external_calls || output.external_calls_performed || batch.external_calls || 0);
  const certification = String(output.certification || output.certification_status || "DAILY_CONTEXT_CHILD_RECOVERED_FROM_SIDECAR").slice(0, 120);
  const capped = { ...output, recovered_by_parent_stale_guard: true, recovery_stage_key: stage.stage_key, root_cause_guard: "terminalized_child_from_verified_sidecar_rows_not_symptom_cleanup" };
  await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='completed', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','queued','partial_continue') AND finished_at IS NULL", JSON.stringify(capped), requestId);
  await run(env.CONTROL_DB, "UPDATE control_job_runs SET status='completed', data_ok=1, certification_status=?, rows_read=?, rows_written=?, external_calls=?, finished_at=CURRENT_TIMESTAMP, elapsed_ms=CASE WHEN started_at IS NOT NULL THEN CAST((julianday(CURRENT_TIMESTAMP)-julianday(started_at))*86400000 AS INTEGER) ELSE 0 END, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status='running' AND finished_at IS NULL", certification, rowsRead, rowsWritten, externalCalls, JSON.stringify(capped), requestId);
  await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'WARN', 'daily_context_full_run_child_recovered_from_sidecar', 'Recovered stale Daily Context child from complete sidecar rows instead of cleaning live rows', ?, CURRENT_TIMESTAMP)", parentRow.request_id, runId, WORKER_NAME, parentRow.job_key, JSON.stringify({ child_request_id: requestId, stage_key: stage.stage_key, certification, rows_read: rowsRead, rows_written: rowsWritten }));
  return { report: { ...report, child_status:"completed", child_certification:certification, child_certification_grade:capped.certification_grade || null, child_data_ok:true, pass:true, wait:false, reason:"recovered_from_complete_sidecar_rows", rows_read:rowsRead, rows_written:rowsWritten, external_calls:externalCalls } };
}

function dailyContextStageForChildRow(row) {
  if (!row) return null;
  const input = parseJsonSafeText(row.input_json || "{}", {});
  const stageKey = String(input.stage_key || "");
  if (stageKey) {
    const stage = DAILY_CONTEXT_FULL_RUN_STAGES.find(s => s.stage_key === stageKey);
    if (stage) return stage;
  }
  return DAILY_CONTEXT_FULL_RUN_STAGES.find(s => s.job_key === row.job_key && s.worker_name === row.worker_name) || null;
}

function dailyContextStageSupportsSidecarRescue(stage) {
  const key = String(stage && stage.job_key || "");
  return key === "daily-lineups" || key === "daily-player-availability" || key === "daily-weather" || key === "daily-bullpen-availability" || key === "daily-team-schedule-spot" || key === "daily-umpire-context" || key === "daily-certifier";
}

function dailyContextFullRunStageStaleSeconds(stage) {
  const key = String(stage && stage.job_key || "");
  // v0.2.214: Daily Context children are service-binding backed and some stages
  // legitimately need more than the old generic 120s guard. Keep fast stages
  // bounded, but give external-call-heavy sidecars a fair terminal window before
  // rescue/retry. This does not pass incomplete rows; it only delays stale rescue.
  if (key === "daily-team-schedule-spot") return 900;
  if (key === "daily-weather") return 360;
  if (key === "daily-bullpen-availability") return 420;
  if (key === "daily-umpire-context") return 360;
  if (key === "daily-player-availability") return 180;
  return DAILY_CONTEXT_FULL_RUN_STALE_CHILD_SECONDS;
}

function dailyContextStaleChildRetryAllowed(stage, child) {
  if (!stage || !child) return false;
  if (stage.job_key === "daily-certifier") return false;
  const retryCount = dailyContextFullRunChildInputRetryCount(child);
  return retryCount < DAILY_CONTEXT_FULL_RUN_STALE_CHILD_RETRY_MAX;
}

async function requeueDailyContextStaleChild(env, parentRow, stage, child, stageReports, report, parentInput, runId, started, reason) {
  const retryCount = dailyContextFullRunChildInputRetryCount(child) + 1;
  const cleanup = await cleanupDailyContextOrphanChildSidecars(env, stage, child, "DAILY_CONTEXT_FULL_RUN_STALE_CHILD_REPLACED_BY_RETRY");
  const replacedOutput = {
    ok: false,
    data_ok: false,
    version: SYSTEM_VERSION,
    worker_name: WORKER_NAME,
    job_key: child.job_key,
    request_id: child.request_id,
    chain_id: child.chain_id,
    status: "DAILY_CONTEXT_STALE_CHILD_REPLACED_BY_RETRY",
    certification: "DAILY_CONTEXT_STALE_CHILD_REPLACED_BY_RETRY",
    certification_grade: "REPLACED_BY_RETRY",
    stage_key: stage.stage_key,
    retry_count: retryCount,
    stale_child_guard_seconds: dailyContextFullRunStageStaleSeconds(stage),
    previous_child_status: child.status,
    previous_child_started_at: child.started_at || null,
    previous_child_updated_at: child.updated_at || null,
    cleanup,
    reason: String(reason || "stale_child_no_terminal_control_job_runs_row").slice(0, 900),
    no_board_mutation: true,
    no_score_db_mutation: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true
  };
  await run(env.CONTROL_DB,
    "UPDATE control_job_queue SET status='failed', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='daily_context_stale_child_replaced_by_retry', error_message='Daily Context stale child was closed and replaced by one same-stage retry.' WHERE request_id=? AND status IN ('pending','running','queued','partial_continue') AND finished_at IS NULL",
    JSON.stringify(replacedOutput), child.request_id
  );
  await run(env.CONTROL_DB,
    "UPDATE control_job_runs SET status='failed', data_ok=0, certification_status='DAILY_CONTEXT_STALE_CHILD_REPLACED_BY_RETRY', finished_at=CURRENT_TIMESTAMP, elapsed_ms=CASE WHEN started_at IS NOT NULL THEN CAST((julianday(CURRENT_TIMESTAMP)-julianday(started_at))*86400000 AS INTEGER) ELSE 0 END, output_json=?, error_code='daily_context_stale_child_replaced_by_retry', error_message='Daily Context stale child was closed and replaced by one same-stage retry.' WHERE request_id=? AND status='running' AND finished_at IS NULL",
    JSON.stringify(replacedOutput), child.request_id
  );

  const retryStageIndex = DAILY_CONTEXT_FULL_RUN_STAGES.findIndex(s => s.stage_key === stage.stage_key);
  const enqueued = await enqueueDailyContextFullRunChild(env, parentRow, stage, retryStageIndex >= 0 ? retryStageIndex : 0, retryCount);
  const output = {
    ok: true,
    data_ok: true,
    version: SYSTEM_VERSION,
    worker_name: WORKER_NAME,
    job_key: parentRow.job_key,
    request_id: parentRow.request_id,
    chain_id: parentRow.chain_id,
    mode: "daily_context_full_run",
    status: "PARTIAL_CONTINUE_DAILY_CONTEXT_FULL_RUN_STALE_CHILD_RETRY_ENQUEUED",
    certification: "DAILY_CONTEXT_FULL_RUN_STALE_CHILD_RETRY_ENQUEUED",
    certification_grade: "PARTIAL",
    current_stage_key: stage.stage_key,
    failed_child_request_id: child.request_id,
    retry_child_request_id: enqueued.child_request_id,
    retry_count: retryCount,
    stale_child_guard_seconds: dailyContextFullRunStageStaleSeconds(stage),
    cleanup,
    completed_stage_count: stageReports.length,
    total_stage_count: DAILY_CONTEXT_FULL_RUN_STAGES.length,
    stages: [...stageReports, { ...report, pass:false, wait:false, reason:"stale_child_replaced_by_retry", retry_child_request_id:enqueued.child_request_id, retry_count:retryCount }],
    continuation_required: true,
    orchestrator_should_self_continue: true,
    lock_held: true,
    no_board_mutation: true,
    no_score_db_mutation: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true
  };
  await run(env.CONTROL_DB,
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'DAILY_CONTEXT_FULL_RUN_STALE_CHILD_RETRY_ENQUEUED', ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)",
    runId, parentRow.request_id, parentRow.chain_id, parentRow.job_key, parentRow.worker_name, stageReports.length + 1, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output)
  );
  await run(env.CONTROL_DB,
    "UPDATE control_job_queue SET status='pending', run_after=datetime('now','+3 seconds'), updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
    JSON.stringify(output), parentRow.request_id
  );
  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'WARN', 'daily_context_full_run_stale_child_retry_enqueued', 'Daily Context Full Run closed one stale child and enqueued one same-stage retry after sidecar recovery failed', ?, CURRENT_TIMESTAMP)",
    parentRow.request_id, runId, WORKER_NAME, parentRow.job_key, JSON.stringify({ stage_key:stage.stage_key, failed_child_request_id:child.request_id, retry_child_request_id:enqueued.child_request_id, retry_count:retryCount, cleanup, version:SYSTEM_VERSION })
  );
  return output;
}

async function recoverDailyContextRunningChildrenFromCompleteSidecarsPreLock(env, trigger) {
  if (!env || !env.CONTROL_DB || !env.DAILY_DB) return { recovered: 0, checked: 0, reason: "missing_db_binding" };
  const rows = await all(env.CONTROL_DB,
    `SELECT
       c.request_id, c.chain_id, c.parent_request_id, c.job_key, c.worker_name, c.status, c.tick_count, c.input_json, c.started_at, c.updated_at, c.finished_at,
       p.request_id AS parent_request_id_real, p.job_key AS parent_job_key, p.worker_name AS parent_worker_name, p.input_json AS parent_input_json
     FROM control_job_queue c
     JOIN control_job_queue p ON p.request_id=c.parent_request_id AND p.chain_id=c.chain_id
     WHERE p.job_key='daily-context-full-run'
       AND p.worker_name='alphadog-v2-orchestrator'
       AND p.status IN ('pending','running','partial_continue')
       AND p.finished_at IS NULL
       AND c.status='running'
       AND c.finished_at IS NULL
       AND datetime(COALESCE(c.updated_at, c.started_at, c.created_at)) <= datetime(CURRENT_TIMESTAMP, '-15 seconds')
     ORDER BY datetime(COALESCE(c.updated_at, c.started_at, c.created_at)) ASC
     LIMIT 5`
  );
  let recovered = 0;
  const recoveredChildren = [];
  for (const child of rows) {
    const stage = dailyContextStageForChildRow(child);
    if (!dailyContextStageSupportsSidecarRescue(stage)) continue;
    const parentRow = {
      request_id: child.parent_request_id_real || child.parent_request_id,
      chain_id: child.chain_id,
      job_key: "daily-context-full-run",
      worker_name: "alphadog-v2-orchestrator",
      input_json: child.parent_input_json || "{}"
    };
    const report = { stage_key: stage.stage_key, job_key: stage.job_key, mode: stage.mode, child_request_id: child.request_id, child_status: child.status, pass: false, wait: true, reason: "prelock_running_child_sidecar_probe" };
    const runId = rid("prelock_daily_context_sidecar_recovery");
    const rec = await recoverDailyContextStaleChildFromSidecar(env, parentRow, stage, child, report, runId);
    if (rec && rec.report) {
      recovered += 1;
      recoveredChildren.push({ request_id: child.request_id, parent_request_id: parentRow.request_id, stage_key: stage.stage_key, job_key: stage.job_key, reason: rec.report.reason || "recovered_from_complete_sidecar_rows" });
      await run(env.CONTROL_DB,
        "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue') AND finished_at IS NULL",
        parentRow.request_id
      );
    }
  }
  if (recovered > 0) {
    await run(env.CONTROL_DB,
      "UPDATE control_locks SET lock_flag=0, owner_request_id=NULL, owner_worker_name=NULL, expires_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE lock_key='GLOBAL_ORCHESTRATOR' AND owner_worker_name=?",
      WORKER_NAME
    );
    await run(env.CONTROL_DB,
      "UPDATE control_system_state SET lock_flag=0, running_job_key=NULL, running_request_id=NULL, running_chain_id=NULL, status='IDLE', updated_at=CURRENT_TIMESTAMP WHERE state_key='GLOBAL'"
    );
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'orchestrator', 'WARN', 'daily_context_prelock_sidecar_recovery_released_lock', 'Pre-lock watchdog recovered complete Daily Context child sidecar rows and released stale GLOBAL_ORCHESTRATOR lock', ?, CURRENT_TIMESTAMP)",
      WORKER_NAME, JSON.stringify({ trigger, recovered, recovered_children: recoveredChildren, version: SYSTEM_VERSION, recovery_policy: "complete_sidecar_rows_only_no_false_pass" })
    );
  }
  return { recovered, checked: rows.length, recovered_children: recoveredChildren };
}

async function failDailyContextStaleChild(env, parentRow, stage, child, stageReports, report, parentInput, runId, started, reason) {
  const finalStatus = "FAILED_DAILY_CONTEXT_FULL_RUN_STALE_CHILD_NO_TERMINAL_RUN";
  const errorCode = "failed_daily_context_full_run_stale_child_no_terminal_run";
  const message = String(reason || "Daily Context Full Run child was running too long without a terminal control_job_runs row.").slice(0, 900);
  const cleanup = await cleanupDailyContextOrphanChildSidecars(env, stage, child, "DAILY_CONTEXT_FULL_RUN_STALE_CHILD_CLEANED");
  const childCleanupRunId = rid("run");
  const output = {
    ok: false,
    data_ok: false,
    version: SYSTEM_VERSION,
    worker_name: WORKER_NAME,
    job_key: parentRow.job_key,
    request_id: parentRow.request_id,
    chain_id: parentRow.chain_id,
    mode: "daily_context_full_run",
    status: finalStatus,
    certification: finalStatus,
    certification_grade: "FAILED",
    failed_stage_key: stage.stage_key,
    failed_request_id: child.request_id,
    failed_reason: "stale_child_no_terminal_control_job_runs_row",
    child_status: child.status,
    child_started_at: child.started_at || null,
    child_updated_at: child.updated_at || null,
    stale_child_guard_seconds: dailyContextFullRunStageStaleSeconds(stage),
    generic_stale_child_guard_seconds: DAILY_CONTEXT_FULL_RUN_STALE_CHILD_SECONDS,
    cleanup,
    stages: [...stageReports, { ...report, pass: false, wait: false, reason: "stale_child_no_terminal_control_job_runs_row" }],
    daily_context_full_run_certified: false,
    no_board_mutation: true,
    no_score_db_mutation: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true
  };

  await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='failed', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=? AND status IN ('pending','running','queued','partial_continue')", JSON.stringify(output), errorCode, message, child.request_id);
  await run(env.CONTROL_DB, "UPDATE control_job_runs SET status='failed', data_ok=0, certification_status=?, finished_at=CURRENT_TIMESTAMP, elapsed_ms=CASE WHEN started_at IS NOT NULL THEN CAST((julianday(CURRENT_TIMESTAMP)-julianday(started_at))*86400000 AS INTEGER) ELSE 0 END, output_json=?, error_code=?, error_message=? WHERE request_id=? AND status='running' AND finished_at IS NULL", finalStatus, JSON.stringify(output), errorCode, message, child.request_id);
  await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'failed', 0, ?, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, ?, ?)", childCleanupRunId, child.request_id, child.chain_id, child.job_key, child.worker_name, finalStatus, child.input_json || "{}", JSON.stringify(output), errorCode, message);
  await releaseDailyContextFullRunLock(env, parentRow);
  await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'failed', 0, ?, ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)", runId, parentRow.request_id, parentRow.chain_id, parentRow.job_key, parentRow.worker_name, finalStatus, stageReports.length + 1, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output), errorCode, message);
  await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='failed', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?", JSON.stringify(output), errorCode, message, parentRow.request_id);
  await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'ERROR', 'daily_context_full_run_stale_child_cleaned', 'Daily Context Full Run failed stale child and cleaned scoped orphan sidecars', ?, CURRENT_TIMESTAMP)", parentRow.request_id, runId, WORKER_NAME, parentRow.job_key, JSON.stringify(output));
  return output;
}

async function enqueueDailyContextFullRunChild(env, parentRow, stage, stepIndex, retryCount = 0) {
  // v0.2.146: Daily Context Full Run must be stage-key deterministic.
  // If the parent is re-entered by a hot pump, manual wake, or cron rescue after
  // the child was already inserted, reuse the existing child instead of creating
  // a duplicate row for the same stage.
  const existing = await first(env.CONTROL_DB,
    `SELECT request_id, input_json
     FROM control_job_queue
     WHERE parent_request_id=?
       AND chain_id=?
       AND json_extract(input_json, '$.stage_key')=?
     ORDER BY datetime(created_at) ASC
     LIMIT 1`,
    parentRow.request_id, parentRow.chain_id, stage.stage_key
  );
  if (existing && Number(retryCount || 0) <= 0) {
    return { child_request_id: existing.request_id, input: parseJsonSafeText(existing.input_json || "{}", {}) };
  }

  const childRequestId = rid(stage.stage_key.replace(/-/g, "_"));
  const input = dailyContextFullRunChildInput(parentRow, stage, stepIndex, retryCount);
  await run(env.CONTROL_DB,
    "INSERT INTO control_job_queue (request_id, chain_id, parent_request_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0, ?, datetime('now','+1 seconds'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
    childRequestId, parentRow.chain_id, parentRow.request_id, stage.job_key, stage.worker_name, stage.worker_group, stage.phase_key, stage.display_name, stage.priority, JSON.stringify(input)
  );
  return { child_request_id: childRequestId, input };
}

function dailyContextFullRunChildHasFatalCertification(stage, output) {
  const cert = String(output.certification || output.certification_status || "");
  const status = String(output.status || "");
  const grade = String(output.certification_grade || output.grade || "");
  const hay = `${cert} ${status} ${grade}`.toLowerCase();
  if (!cert || hay.includes("dummy") || hay.includes("unsupported") || hay.includes("missing_service_binding")) return true;
  if (hay.includes("exception") || hay.includes("worker_failed") || hay.includes("failed_source") || hay.includes("failed_source_or_coverage")) return true;
  if (hay.includes("_failed") || hay.startsWith("failed") || hay.includes(" fail")) return true;
  return false;
}

function dailyContextFullRunChildNonfatalCompleted(stage, output) {
  if (!stage || !output || output.ok !== true) return false;
  if (stage.job_key === "daily-certifier") return false;
  if (dailyContextFullRunChildHasFatalCertification(stage, output)) return false;

  const cert = String(output.certification || output.certification_status || "");
  const status = String(output.status || "");
  const grade = String(output.certification_grade || output.grade || "");
  const hay = `${cert} ${status} ${grade}`.toLowerCase();

  const hasCompletionSignal =
    hay.includes("certified") ||
    hay.includes("completed") ||
    hay.includes("pass") ||
    hay.includes("warn") ||
    hay.includes("blocker") ||
    hay.includes("gated") ||
    hay.includes("waiting_for_posted_lineup");

  const hasWorkEvidence =
    Number(output.prepared_rows_read || 0) > 0 ||
    Number(output.rows_read || 0) > 0 ||
    Number(output.rows_written || 0) > 0 ||
    Number(output.current_rows_written || 0) > 0 ||
    Number(output.snapshot_rows_written || 0) > 0 ||
    Number(output.weather_rows_written || 0) > 0 ||
    Number(output.team_rows_written || 0) > 0 ||
    Number(output.game_rows_written || 0) > 0;

  return hasCompletionSignal && hasWorkEvidence;
}

function dailyContextFullRunChildSoftFailureAllowed(stage, child, output) {
  if (!stage || !output) return false;
  if (stage.job_key === "daily-certifier") return false;
  const hay = String(`${output.certification || ""} ${output.certification_status || ""} ${output.status || ""} ${output.certification_grade || ""} ${child && child.error_code || ""}`).toLowerCase();
  if (hay.includes("missing_service_binding") || hay.includes("unsupported") || hay.includes("dummy") || hay.includes("dispatch_exception") || hay.includes("worker_non_json_response")) return false;
  const hasSidecarEvidence =
    Number(output.prepared_rows_read || 0) > 0 ||
    Number(output.rows_written || 0) > 0 ||
    Number(output.current_rows_written || 0) > 0 ||
    Number(output.snapshot_rows_written || 0) > 0 ||
    Number(output.weather_rows_written || 0) > 0 ||
    Number(output.team_rows_written || 0) > 0 ||
    Number(output.game_rows_written || 0) > 0 ||
    Number(output.issues_written || 0) > 0;
  return hasSidecarEvidence && (hay.includes("failed_blockers_or_coverage") || hay.includes("blocker") || hay.includes("warning") || hay.includes("failed"));
}


function dailyContextFullRunChildInputRetryCount(child) {
  try {
    const input = JSON.parse((child && child.input_json) || "{}");
    return Number(input.retry_count || 0);
  } catch (_) {
    return 0;
  }
}

function dailyContextFullRunChildTransientRetryAllowed(stage, child, validation, output) {
  if (!stage || !child || !validation || validation.pass || validation.wait) return false;
  if (stage.job_key === "daily-certifier") return false;
  const retryCount = dailyContextFullRunChildInputRetryCount(child);
  if (retryCount >= 1) return false;
  const hay = String(`${validation.reason || ""} ${child.status || ""} ${child.error_code || ""} ${child.error_message || ""} ${output && output.status || ""} ${output && output.error || ""} ${output && output.certification || ""}`).toLowerCase();
  return hay.includes("service_binding_timeout") || hay.includes("worker_dispatch_exception") || hay.includes("timeout_after_") || hay.includes("aborterror") || hay.includes("network") || hay.includes("temporar");
}

function dailyContextFullRunChildPassed(stage, child) {
  if (!child) return { pass: false, wait: false, reason: "child_missing" };
  const childStatus = String(child.status || "");
  if (["pending", "running", "partial_continue"].includes(childStatus) && !child.finished_at) {
    return { pass: false, wait: true, reason: "child_active", child_status: childStatus };
  }
  const output = parseJsonSafeText(child.output_json || "{}", {});
  if (childStatus !== "completed") {
    if (dailyContextFullRunChildSoftFailureAllowed(stage, child, output)) {
      return { pass: true, nonfatal: true, reason: "daily_context_stage_failed_but_sidecar_rows_written_continue_with_warning", child_status: childStatus, data_ok: output && output.data_ok, certification: output && (output.certification || output.certification_status) || null, status: output && output.status || null, output };
    }
    return { pass: false, reason: "child_not_completed", child_status: childStatus, child_error_code: child.error_code || null, child_error_message: child.error_message || null };
  }
  if (!output || output.ok !== true) {
    if (dailyContextFullRunChildSoftFailureAllowed(stage, child, output)) {
      return { pass: true, nonfatal: true, reason: "daily_context_stage_output_not_ok_but_sidecar_rows_written_continue_with_warning", output_ok: output && output.ok, certification: output && (output.certification || output.certification_status) || null, status: output && output.status || null, output };
    }
    return { pass: false, reason: "child_output_ok_not_true", output_ok: output && output.ok };
  }
  const cert = String(output.certification || output.certification_status || "");
  const status = String(output.status || "");
  if (dailyContextFullRunChildHasFatalCertification(stage, output)) {
    if (dailyContextFullRunChildSoftFailureAllowed(stage, child, output)) {
      return { pass: true, nonfatal: true, reason: "daily_context_stage_fatal_cert_reclassified_nonfatal_sidecar_warning", certification: cert, status, output };
    }
    return { pass: false, reason: "missing_dummy_unsupported_or_failed_certification", certification: cert, status };
  }
  if (output.data_ok !== true) {
    if (dailyContextFullRunChildNonfatalCompleted(stage, output) || dailyContextFullRunChildSoftFailureAllowed(stage, child, output)) {
      return { pass: true, nonfatal: true, reason: "daily_context_enrichment_nonfatal_child_data_ok_false", data_ok: output.data_ok, certification: cert, status, output };
    }
    return { pass: false, reason: "child_data_ok_not_true", data_ok: output && output.data_ok };
  }
  if (stage.job_key === "daily-certifier") {
    if (String(output.certification || "") !== "DAILY_CONTEXT_READINESS_CERTIFIED_ENRICHMENT_LEDGER_WRITTEN") {
      return { pass: false, reason: "daily_context_certifier_wrong_certification", certification: output.certification || null };
    }
    if (Number(output.current_rows_written || 0) <= 0) {
      return { pass: false, reason: "daily_context_certifier_no_current_rows_written", current_rows_written: output.current_rows_written || 0 };
    }
  }
  return { pass: true, certification: cert, status, output };
}

async function processDailyContextFullRunJob(env, row, runId, trigger) {
  const started = Date.now();
  const parentInput = parseJsonSafeText(row.input_json || "{}", {});
  const lock = await ensureDailyContextFullRunLock(env, row);
  if (!lock.ok) {
    const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "daily_context_full_run", status: "PARTIAL_CONTINUE_DAILY_CONTEXT_FULL_RUN_LOCK_BUSY", certification: "DAILY_CONTEXT_FULL_RUN_LOCK_BUSY_WAIT", lock, continuation_required: true, orchestrator_should_self_continue: true };
    await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'DAILY_CONTEXT_FULL_RUN_LOCK_BUSY_WAIT', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
    await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=datetime('now','+10 seconds'), updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
    return output;
  }

  const childRows = await all(env.CONTROL_DB,
    "SELECT request_id, chain_id, parent_request_id, job_key, worker_name, worker_group, phase_key, display_name, status, error_code, error_message, output_json, input_json, created_at, started_at, finished_at, updated_at FROM control_job_queue WHERE parent_request_id=? AND chain_id=? ORDER BY datetime(created_at) ASC",
    row.request_id, row.chain_id
  );
  const stageReports = [];

  for (let i = 0; i < DAILY_CONTEXT_FULL_RUN_STAGES.length; i++) {
    const stage = DAILY_CONTEXT_FULL_RUN_STAGES[i];
    const stageChildren = childRows.filter(c => {
      const childInput = parseJsonSafeText(c.input_json || "{}", {});
      const childStageKey = String(childInput.stage_key || "");
      return childStageKey
        ? childStageKey === stage.stage_key
        : (c.job_key === stage.job_key && c.worker_name === stage.worker_name);
    });
    const child = stageChildren[stageChildren.length - 1] || null;

    if (!child) {
      const enqueued = await enqueueDailyContextFullRunChild(env, row, stage, i, 0);
      const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "daily_context_full_run", status: "PARTIAL_CONTINUE_DAILY_CONTEXT_FULL_RUN_CHILD_ENQUEUED", certification: "DAILY_CONTEXT_FULL_RUN_CHILD_ENQUEUED", certification_grade: "PARTIAL", current_stage_key: stage.stage_key, current_stage_index: i, child_request_id: enqueued.child_request_id, completed_stage_count: stageReports.length, total_stage_count: DAILY_CONTEXT_FULL_RUN_STAGES.length, continuation_required: true, orchestrator_should_self_continue: true, hard_child_request_boundary: true, child_run_after_delay_seconds: DAILY_CONTEXT_FULL_RUN_CHILD_RUN_AFTER_SECONDS, parent_recheck_delay_seconds: DAILY_CONTEXT_FULL_RUN_PARENT_RECHECK_SECONDS, lock_held: true, approved_chain_order: DAILY_CONTEXT_FULL_RUN_STAGES.map(s => s.job_key), stages: stageReports };
      await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'DAILY_CONTEXT_FULL_RUN_CHILD_ENQUEUED', ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, i + 1, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
      await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=datetime('now','+3 seconds'), updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
      await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'daily_context_full_run_child_enqueued', 'Daily Context Full Run enqueued next child stage', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ parent_request_id: row.request_id, child_request_id: enqueued.child_request_id, stage_key: stage.stage_key, stage_index: i, mode: stage.mode }));
      return output;
    }

    const validation = dailyContextFullRunChildPassed(stage, child);
    const childOutput = parseJsonSafeText(child.output_json || "{}", {});
    const report = { stage_key: stage.stage_key, job_key: stage.job_key, mode: stage.mode, child_request_id: child.request_id, child_status: child.status, child_certification: childOutput.certification || childOutput.certification_status || null, child_certification_grade: childOutput.certification_grade || null, child_data_ok: childOutput.data_ok === true, child_nonfatal_warning: validation.nonfatal === true, pass: validation.pass, wait: !!validation.wait, reason: validation.reason || null, rows_read: childOutput.prepared_rows_read || childOutput.rows_read || childOutput.rows_read_total || 0, rows_written: childOutput.current_rows_written || childOutput.rows_written || childOutput.rows_promoted || childOutput.weather_rows_written || childOutput.team_rows_written || childOutput.game_rows_written || 0, external_calls: childOutput.external_calls_performed || childOutput.external_calls || 0 };

    if (validation.wait) {
      const immediateRecovered = await recoverDailyContextStaleChildFromSidecar(env, row, stage, child, report, runId);
      if (immediateRecovered && immediateRecovered.report) {
        stageReports.push(immediateRecovered.report);
        continue;
      }
      const stageStaleSeconds = dailyContextFullRunStageStaleSeconds(stage);
      const staleChild = await first(env.CONTROL_DB,
        "SELECT request_id FROM control_job_queue WHERE request_id=? AND status IN ('running','pending','queued','partial_continue') AND finished_at IS NULL AND datetime(COALESCE(updated_at, started_at, created_at)) <= datetime(CURRENT_TIMESTAMP, '-' || ? || ' seconds') LIMIT 1",
        child.request_id, stageStaleSeconds
      );
      if (staleChild) {
        const recovered = await recoverDailyContextStaleChildFromSidecar(env, row, stage, child, report, runId);
        if (recovered && recovered.report) {
          stageReports.push(recovered.report);
          continue;
        }
        if (dailyContextStaleChildRetryAllowed(stage, child)) {
          return await requeueDailyContextStaleChild(env, row, stage, child, stageReports, report, parentInput, runId, started, "Daily Context Full Run child became stale before terminal completion; complete sidecar recovery was not available, so one same-stage retry was enqueued instead of failing the full run.");
        }
        return await failDailyContextStaleChild(env, row, stage, child, stageReports, report, parentInput, runId, started, "Daily Context Full Run child became stale and could not be verified from complete sidecar rows after retry budget was exhausted; refusing to false-pass an incomplete mining stage.");
      }
      const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "daily_context_full_run", status: "PARTIAL_CONTINUE_DAILY_CONTEXT_FULL_RUN_WAITING_ON_CHILD", certification: "DAILY_CONTEXT_FULL_RUN_WAITING_ON_CHILD", certification_grade: "PARTIAL", current_stage_key: stage.stage_key, waiting_on_child_request_id: child.request_id, waiting_on_child_status: child.status, stage_stale_guard_seconds: stageStaleSeconds, generic_stale_guard_seconds: DAILY_CONTEXT_FULL_RUN_STALE_CHILD_SECONDS, completed_stage_count: stageReports.length, total_stage_count: DAILY_CONTEXT_FULL_RUN_STAGES.length, stages: [...stageReports, report], continuation_required: true, orchestrator_should_self_continue: true, lock_held: true };
      await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'DAILY_CONTEXT_FULL_RUN_WAITING_ON_CHILD', ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, i + 1, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
      await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=datetime('now','+3 seconds'), updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
      return output;
    }

    if (!validation.pass) {
      const failedChildRecovered = await recoverDailyContextStaleChildFromSidecar(env, row, stage, child, report, runId);
      if (failedChildRecovered && failedChildRecovered.report) {
        stageReports.push(failedChildRecovered.report);
        continue;
      }
      if (dailyContextFullRunChildTransientRetryAllowed(stage, child, validation, childOutput)) {
        const retryCount = dailyContextFullRunChildInputRetryCount(child) + 1;
        await run(env.CONTROL_DB,
          "UPDATE control_job_queue SET status='failed', finished_at=COALESCE(finished_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP, error_code=COALESCE(error_code,'daily_context_child_transient_retry_replaced'), error_message=COALESCE(error_message,'Daily Context child transient dispatch failure was replaced by one same-stage retry.') WHERE request_id=? AND finished_at IS NULL",
          child.request_id
        );
        const enqueued = await enqueueDailyContextFullRunChild(env, row, stage, i, retryCount);
        const output = { ok:true, data_ok:true, version:SYSTEM_VERSION, worker_name:WORKER_NAME, job_key:row.job_key, request_id:row.request_id, chain_id:row.chain_id, mode:"daily_context_full_run", status:"PARTIAL_CONTINUE_DAILY_CONTEXT_FULL_RUN_TRANSIENT_RETRY_ENQUEUED", certification:"DAILY_CONTEXT_FULL_RUN_TRANSIENT_RETRY_ENQUEUED", certification_grade:"PARTIAL", current_stage_key:stage.stage_key, failed_child_request_id:child.request_id, retry_child_request_id:enqueued.child_request_id, retry_count:retryCount, failed_reason:validation.reason, completed_stage_count:stageReports.length, total_stage_count:DAILY_CONTEXT_FULL_RUN_STAGES.length, stages:[...stageReports, { ...report, pass:false, wait:false, retry_child_request_id:enqueued.child_request_id, reason:"transient_child_dispatch_failure_retry_enqueued" }], continuation_required:true, orchestrator_should_self_continue:true, lock_held:true, no_board_mutation:true, no_score_db_mutation:true, no_scoring:true, no_ranking:true, no_final_board:true };
        await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'DAILY_CONTEXT_FULL_RUN_TRANSIENT_RETRY_ENQUEUED', ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, i + 1, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
        await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='pending', run_after=datetime('now','+3 seconds'), updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
        await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'WARN', 'daily_context_full_run_transient_child_retry_enqueued', 'Daily Context Full Run replaced one transient child dispatch failure with a same-stage retry', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ stage_key:stage.stage_key, failed_child_request_id:child.request_id, retry_child_request_id:enqueued.child_request_id, retry_count:retryCount, failed_reason:validation.reason, child_error_code:child.error_code || null, child_error_message:child.error_message || null }));
        return output;
      }
      const finalStatus = "FAILED_DAILY_CONTEXT_FULL_RUN_CHILD_FAILED";
      const output = { ok: false, data_ok: false, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "daily_context_full_run", status: finalStatus, certification: finalStatus, certification_grade: "FAILED", failed_stage_key: stage.stage_key, failed_request_id: child.request_id, failed_reason: validation.reason, child_error_code: child.error_code || null, child_error_message: child.error_message || null, last_output_preview: JSON.stringify(childOutput).slice(0, 1200), stages: [...stageReports, report], daily_context_full_run_certified: false, no_board_mutation: true, no_score_db_mutation: true, no_scoring: true, no_ranking: true, no_final_board: true };
      await releaseDailyContextFullRunLock(env, row);
      await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'failed', 0, ?, ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, finalStatus, i + 1, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output), finalStatus.toLowerCase(), String(validation.reason || "daily context full run child failed").slice(0, 900));
      await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='failed', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?", JSON.stringify(output), finalStatus.toLowerCase(), String(validation.reason || "daily context full run child failed").slice(0, 900), row.request_id);
      await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'ERROR', 'daily_context_full_run_stopped', 'Daily Context Full Run stopped on failed child stage', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify(output));
      return output;
    }

    stageReports.push(report);
  }

  const warningStageCount = stageReports.filter(r => {
    const grade = String(r.child_certification_grade || "").toUpperCase();
    const cert = String(r.child_certification || "").toUpperCase();
    return r.child_nonfatal_warning === true || r.child_data_ok !== true || grade.includes("WARN") || grade.includes("BLOCKER") || cert.includes("WARNING") || cert.includes("HARD_BLOCKER");
  }).length;
  const nonfatalStageCount = warningStageCount;
  const finalCertification = warningStageCount > 0 ? "DAILY_CONTEXT_FULL_RUN_CERTIFIED_WITH_CONTEXT_WARNINGS" : "DAILY_CONTEXT_FULL_RUN_CERTIFIED_ALL_CONTEXT_STAGES_PASS";
  const finalGrade = warningStageCount > 0 ? "FULL_RUN_PASS_WITH_WARNINGS" : "FULL_RUN_PASS";
  const output = { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: WORKER_NAME, job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, mode: "daily_context_full_run", status: "COMPLETED_DAILY_CONTEXT_FULL_RUN", certification: finalCertification, certification_grade: finalGrade, daily_context_full_run_certified: true, daily_context_nonfatal_enrichment_warning_count: nonfatalStageCount, daily_context_warning_stage_count: warningStageCount, completed_stage_count: stageReports.length, total_stage_count: DAILY_CONTEXT_FULL_RUN_STAGES.length, stages: stageReports, approved_chain_order: DAILY_CONTEXT_FULL_RUN_STAGES.map(s => s.job_key), includes_daily_starters: true, includes_daily_lineups: true, includes_daily_player_availability: true, includes_daily_weather_roof: true, includes_daily_bullpen_availability: true, includes_daily_team_schedule_spot: true, includes_daily_umpire_context: true, includes_daily_context_certifier: true, no_daily_game_status_duplication: true, no_board_full_run: true, no_incremental_morning_full_run: true, no_static_work: true, no_board_mutation: true, no_score_db_mutation: true, no_scoring: true, no_ranking: true, no_final_board: true, no_old_production_touch: true };
  await releaseDailyContextFullRunLock(env, row);
  await run(env.CONTROL_DB, "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'completed', 1, ?, ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)", runId, row.request_id, row.chain_id, row.job_key, row.worker_name, finalCertification, stageReports.length, Date.now() - started, JSON.stringify(parentInput), JSON.stringify(output));
  await run(env.CONTROL_DB, "UPDATE control_job_queue SET status='completed', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?", JSON.stringify(output), row.request_id);
  await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'daily_context_full_run_completed', 'Daily Context Full Run certified all daily sidecar stages plus context certifier', ?, CURRENT_TIMESTAMP)", row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify(output));
  return output;
}

async function processDailyLineupsJob(env, row, runId, trigger) {
  if (!env.DAILY_LINEUPS_WORKER || typeof env.DAILY_LINEUPS_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "DAILY_LINEUPS_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch is enabled only through DAILY_LINEUPS_WORKER service binding. Do not generic-dispatch this worker."
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_daily_lineups_service_binding', 'DAILY_LINEUPS_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_daily_lineups_service_binding', error_message='DAILY_LINEUPS_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );
    return output;
  }

  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const requestedMode = String(rowInput.mode || "market_hitter_prop_line_context");
  const isPitcherMode = requestedMode === "market_pitcher_prop_line_context" || requestedMode === "pitcher_props" || requestedMode === "market_pitcher_props";
  const propFamily = isPitcherMode ? "pitcher" : "hitter";
  const selectedMode = isPitcherMode ? "market_pitcher_prop_line_context" : "market_hitter_prop_line_context";
  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: "source_probe",
    input_json: rowInput,
    exact_worker_only: true,
    source_probe_only: true,
    prepared_board_relevance_only: true,
    anchors_to_mlb_game_calendar_game_pk: true,
    primary_endpoint: "/api/v1/game/{gamePk}/boxscore",
    fallback_endpoint: "/api/v1.1/game/{gamePk}/feed/live",
    no_calendar_rebuild: true,
    no_daily_game_status_duplication: true,
    no_daily_starters_duplication: true,
    no_production_lineup_writes: true,
    no_board_mutation: true,
    no_weather: true,
    no_bullpen: true,
    no_market_odds: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_old_production_touch: true,
    probe_feed_live: rowInput.probe_feed_live === true
  };

  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

  const started = Date.now();
  let output;
  let httpStatus = null;
  try {
    const resp = await serviceBindingFetch(env.DAILY_LINEUPS_WORKER, "https://internal.alphadog-v2-daily-lineups/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }, "daily_lineups", DAILY_CONTEXT_EXACT_WORKER_TIMEOUT_MS);
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

  if (!(output && output.ok === true) && env.DAILY_DB) {
    const timeoutText = String((output && (output.error || output.status || output.certification || output.error_message)) || "");
    if (isServiceBindingTimeoutLike(timeoutText)) {
      const rescued = await buildDailyLineupsSidecarRecoveryOutput(env, row.request_id, dailyContextStageForChildRow(row) || { job_key: "daily-lineups", worker_name: row.worker_name, stage_key: "daily_lineups" });
      if (rescued && rescued.ok === true) {
        output = {
          ...rescued,
          status: "COMPLETED_SOURCE_PROBE_RESCUED_AFTER_SERVICE_BINDING_TIMEOUT",
          original_dispatch_error: timeoutText.slice(0, 300),
          no_false_failure_after_verified_sidecar: true
        };
        httpStatus = 200;
      }
    }
  }

  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && (output.rows_read || output.prepared_rows_read) ? (output.rows_read || output.prepared_rows_read) : 0);
  const rowsWritten = Number(output && output.rows_written ? output.rows_written : 0);
  const externalCalls = Number(output && output.external_calls_performed ? output.external_calls_performed : 0);
  const certification = String((output && output.certification) || (ok ? "daily_lineups_source_probe_completed" : "daily_lineups_source_probe_failed")).slice(0, 120);
  const queueStatus = ok ? "completed" : "failed";
  const runStatus = ok ? "completed" : "failed";
  const errorCode = ok ? null : "daily_lineups_source_probe_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status || output.certification)) || "Daily Lineups source probe failed").slice(0, 900);
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
      no_calendar_rebuild: true,
      no_daily_game_status_duplication: true,
      no_daily_starters_duplication: true,
      no_production_lineup_writes: true,
      no_board_mutation: true,
      no_weather: true,
      no_bullpen: true,
      no_market_odds: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true,
      writes_shadow_table_only: false,
      no_old_production_touch: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  const partial = false;
  if (partial) {
    const nextInput = {
      ...rowInput,
      matrix_batch_id: output && (output.matrix_batch_id || output.batch_id) ? (output.matrix_batch_id || output.batch_id) : rowInput.matrix_batch_id || null,
      resume_batch_id: output && (output.matrix_batch_id || output.batch_id) ? (output.matrix_batch_id || output.batch_id) : rowInput.resume_batch_id || null,
      matrix_resume: true,
      continuation_from_request_id: row.request_id
    };
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      JSON.stringify(nextInput), JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'daily_lineups_source_probe_dispatch_completed', 'Orchestrator completed exact Daily Lineups source-probe dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, certification, rows_read: rowsRead, rows_written: rowsWritten, external_calls: externalCalls, dispatch: cappedOutput.orchestrator_dispatch })
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
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_daily_games_status_service_binding', 'DAILY_GAMES_STATUS_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_daily_games_status_service_binding', error_message='DAILY_GAMES_STATUS_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );
    return output;
  }

  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const requestedMode = String(rowInput.mode || "market_hitter_prop_line_context");
  const isPitcherMode = requestedMode === "market_pitcher_prop_line_context" || requestedMode === "pitcher_props" || requestedMode === "market_pitcher_props";
  const propFamily = isPitcherMode ? "pitcher" : "hitter";
  const selectedMode = isPitcherMode ? "market_pitcher_prop_line_context" : "market_hitter_prop_line_context";
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

  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

  const started = Date.now();
  let output;
  let httpStatus = null;
  try {
    const resp = await serviceBindingFetch(env.DAILY_GAMES_STATUS_WORKER, "https://internal.alphadog-v2-daily-games-status/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }, "daily_games_status", DAILY_CONTEXT_EXACT_WORKER_TIMEOUT_MS);
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
      writes_shadow_table_only: false,
      no_old_production_touch: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  const partial = false;
  if (partial) {
    const nextInput = {
      ...rowInput,
      matrix_batch_id: output && (output.matrix_batch_id || output.batch_id) ? (output.matrix_batch_id || output.batch_id) : rowInput.matrix_batch_id || null,
      resume_batch_id: output && (output.matrix_batch_id || output.batch_id) ? (output.matrix_batch_id || output.batch_id) : rowInput.resume_batch_id || null,
      matrix_resume: true,
      continuation_from_request_id: row.request_id
    };
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      JSON.stringify(nextInput), JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'daily_game_status_dispatch_completed', 'Orchestrator completed exact Daily Game Status dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, certification, rows_read: rowsRead, rows_written: rowsWritten, dispatch: cappedOutput.orchestrator_dispatch })
  );

  return cappedOutput;
}



async function countExpectedPropFactorCoverageRows(env, dates, family) {
  if (!env || !env.SCORE_DB || !Array.isArray(dates) || dates.length < 2) return 0;
  const hitterKeys = ["hits","total_bases","runs","rbis","singles","doubles","home_runs","walks","hitter_strikeouts","hits_runs_rbis","stolen_bases","fantasy","fantasy_score"];
  const pitcherKeys = ["pitcher_strikeouts","pitcher_outs","pitching_outs","earned_runs","earned_runs_allowed","hits_allowed","walks_allowed","rfi_nrfi","pitcher_strikeouts_combo"];
  const keys = family === "pitcher" ? pitcherKeys : hitterKeys;
  const placeholders = keys.map(() => "?").join(",");
  const row = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows
    FROM score_board_prepared_current
    WHERE official_date IN (?, ?)
      AND pickable_safe=1
      AND matchup_status='calendar_matched'
      AND player_match_status='matched'
      AND official_game_pk IS NOT NULL
      AND official_game_time_utc IS NOT NULL
      AND canonical_prop_key IN (${placeholders})`, dates[0], dates[1], ...keys);
  return Number(row && row.rows || 0);
}
async function countPropFactorCoverageRows(env, batchId, family) {
  if (!env || !env.SCORE_DB || !batchId) return 0;
  const row = await first(env.SCORE_DB, `SELECT COUNT(DISTINCT prepared_row_id) AS rows
    FROM prop_factor_coverage_current
    WHERE latest_batch_id=? AND factor_family=?`, batchId, family);
  return Number(row && row.rows || 0);
}

async function rescuePropFactorMinerTerminalEvidence(env, row, runId, input, selectedMode, trigger, timeoutError) {
  if (!env || !env.SCORE_DB) return null;
  const family = selectedMode === "pitcher_prop_factor_mining" ? "pitcher" : "hitter";
  const packetTable = family === "pitcher" ? "prop_factor_pitcher_packets" : "prop_factor_hitter_packets";
  const batchRow = await first(env.SCORE_DB, `SELECT batch_id, request_id, run_id, worker_version, mode, factor_family, status, window_start, window_end, prepared_rows_read
    FROM prop_factor_batches
    WHERE request_id=? AND factor_family=? AND status='running'
    ORDER BY datetime(updated_at) DESC
    LIMIT 1`, row.request_id, family);
  if (!batchRow || !batchRow.batch_id) return null;

  const packetSummary = await first(env.SCORE_DB, `SELECT
      COUNT(*) AS packets,
      COUNT(DISTINCT prepared_row_id) AS prepared_rows,
      COUNT(DISTINCT game_pk) AS games,
      COUNT(DISTINCT mlb_player_id) AS players,
      COUNT(DISTINCT canonical_prop_key) AS prop_keys,
      SUM(CASE WHEN warning_count > 0 THEN 1 ELSE 0 END) AS warning_rows,
      SUM(CASE WHEN blocker_count > 0 OR factor_status='blocked' THEN 1 ELSE 0 END) AS blocked_rows,
      SUM(CASE WHEN missing_factor_count > 0 THEN 1 ELSE 0 END) AS missing_factor_rows,
      MIN(created_at) AS first_packet_at,
      MAX(created_at) AS last_packet_at
    FROM ${packetTable}
    WHERE batch_id=?`, batchRow.batch_id);
  const packets = Number(packetSummary && packetSummary.packets || 0);
  if (!packets) return null;

  const dates = [batchRow.window_start, batchRow.window_end].filter(Boolean);
  const expectedCoverageRows = dates.length >= 2 ? await countExpectedPropFactorCoverageRows(env, dates, family) : 0;
  const actualCoverageRows = await countPropFactorCoverageRows(env, batchRow.batch_id, family);
  if (expectedCoverageRows > 0 && actualCoverageRows < expectedCoverageRows) {
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"partial_continue_prop_factor_timeout_coverage_incomplete",
      certification:"PROP_FACTOR_PACKETS_PARTIAL_CONTINUE_COVERAGE_INCOMPLETE",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:batchRow.batch_id,
      prepared_rows_read:Number(batchRow.prepared_rows_read || expectedCoverageRows || 0),
      expected_factor_rows:expectedCoverageRows,
      coverage_prepared_rows:actualCoverageRows,
      coverage_missing_rows:Math.max(0, expectedCoverageRows - actualCoverageRows),
      eligible_rows:Number(packetSummary.prepared_rows || 0),
      packets_written:packets,
      rows_read:Number(batchRow.prepared_rows_read || expectedCoverageRows || 0),
      rows_written:packets,
      blocked_rows:Number(packetSummary.blocked_rows || 0),
      warning_rows:Number(packetSummary.warning_rows || 0),
      missing_factor_rows:Number(packetSummary.missing_factor_rows || 0),
      games:Number(packetSummary.games || 0),
      players:Number(packetSummary.players || 0),
      prop_keys:Number(packetSummary.prop_keys || 0),
      timeout_error:String(timeoutError || "prop_factor_miner_service_binding_timeout_after_75000ms"),
      terminal_rescue:false,
      timeout_rescue_requeued_due_incomplete_coverage:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:batchRow.batch_id,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    await run(env.SCORE_DB, `UPDATE prop_factor_batches
      SET status='partial_continue_factor_packets_chunk_written', prepared_rows_read=CASE WHEN COALESCE(prepared_rows_read,0)=0 THEN ? ELSE prepared_rows_read END,
          eligible_rows=?, packets_written=?, blocked_rows=?, warning_rows=?, missing_factor_rows=?,
          certification_status=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP
      WHERE batch_id=?`, output.prepared_rows_read, output.eligible_rows, output.packets_written, output.blocked_rows, output.warning_rows, output.missing_factor_rows, output.certification, output.certification_grade, JSON.stringify(output), batchRow.batch_id);
    if (env.CONTROL_DB) {
      await run(env.CONTROL_DB, `INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at)
        VALUES (?, ?, ?, ?, 'WARN', 'prop_factor_timeout_coverage_incomplete_requeued', 'Prop Factor timeout evidence was incomplete; requeued instead of terminal PASS', ?, CURRENT_TIMESTAMP)`,
        row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:batchRow.batch_id, family, expectedCoverageRows, actualCoverageRows, packets }).slice(0, 9000));
    }
    return output;
  }

  const issueSummary = await first(env.SCORE_DB, `SELECT COUNT(*) AS issue_rows FROM prop_factor_issues WHERE batch_id=?`, batchRow.batch_id);
  const issueRows = Number(issueSummary && issueSummary.issue_rows || 0);
  // v0.2.186: keep timeout rescue O(1). The worker now writes coverage incrementally;
  // if a timeout happens after packets exist, parent continuation must not spend the
  // last milliseconds rebuilding coverage and timing out inside the rescue path.
  const status = Number(packetSummary.blocked_rows || 0) > 0 || Number(packetSummary.warning_rows || 0) > 0 || Number(packetSummary.missing_factor_rows || 0) > 0 ? "completed_with_warnings" : "completed";
  const certification = status === "completed" ? "PROP_FACTOR_PACKETS_CERTIFIED" : "PROP_FACTOR_PACKETS_CERTIFIED_WITH_WARNINGS";
  const grade = Number(packetSummary.blocked_rows || 0) > 0 ? "PASS_WITH_BLOCKED_ROWS" : (status === "completed" ? "PASS" : "PASS_WITH_WARNINGS");
  const output = {
    ok:true,
    data_ok:true,
    version:SYSTEM_VERSION,
    processed_by:WORKER_NAME,
    worker_name:"alphadog-v2-prop-factor-miner",
    deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
    job_key:row.job_key,
    request_id:row.request_id,
    chain_id:row.chain_id,
    run_id:runId,
    mode:selectedMode,
    factor_family:family,
    status:"completed_prop_factor_packets_reconciled_after_timeout",
    certification,
    certification_grade:grade,
    batch_id:batchRow.batch_id,
    prepared_rows_read:Number(batchRow.prepared_rows_read || packetSummary.prepared_rows || 0),
    eligible_rows:Number(packetSummary.prepared_rows || 0),
    packets_written:packets,
    rows_read:Number(batchRow.prepared_rows_read || packetSummary.prepared_rows || 0),
    rows_written:packets,
    blocked_rows:Number(packetSummary.blocked_rows || 0),
    warning_rows:Number(packetSummary.warning_rows || 0),
    issue_rows:issueRows,
    missing_factor_rows:Number(packetSummary.missing_factor_rows || 0),
    games:Number(packetSummary.games || 0),
    players:Number(packetSummary.players || 0),
    prop_keys:Number(packetSummary.prop_keys || 0),
    first_packet_at:packetSummary.first_packet_at || null,
    last_packet_at:packetSummary.last_packet_at || null,
    timeout_error:String(timeoutError || "prop_factor_miner_service_binding_timeout_after_75000ms"),
    terminal_rescue:true,
    coverage_current_rescue_rebuild_skipped_fast_path:true,
    coverage_current_written_incrementally_by_worker:true,
    no_external_api_calls:true,
    no_scoring:true,
    no_ranking:true,
    no_matrix_builder:true,
    no_final_board:true
  };

  await run(env.SCORE_DB, `UPDATE prop_factor_batches
    SET status=?, prepared_rows_read=CASE WHEN COALESCE(prepared_rows_read,0)=0 THEN ? ELSE prepared_rows_read END,
        eligible_rows=?, packets_written=?, blocked_rows=?, warning_rows=?, issue_rows=?, missing_factor_rows=?,
        certification_status=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP
    WHERE batch_id=?`, status, output.prepared_rows_read, output.eligible_rows, output.packets_written, output.blocked_rows, output.warning_rows, output.issue_rows, output.missing_factor_rows, certification, grade, JSON.stringify(output), batchRow.batch_id);

  if (env.CONTROL_DB) {
    await run(env.CONTROL_DB, `INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at)
      VALUES (?, ?, ?, ?, 'WARN', 'prop_factor_miner_timeout_rescued_from_packet_evidence', 'Rescued Prop Factor Miner timeout by terminal-finalizing packet evidence fast path', ?, CURRENT_TIMESTAMP)`,
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:batchRow.batch_id, packets, certification, grade, timeout_error:String(timeoutError || '') }).slice(0, 9000));
  }
  return output;
}


async function processPlayerBaselineSanityJob(env, row, runId, trigger) {
  const input = parseJsonSafeText(row.input_json || "{}", {});
  input.request_id = row.request_id;
  input.chain_id = row.chain_id;
  input.run_id = runId;
  input.job_key = row.job_key;
  input.worker_name = row.worker_name;
  input.mode = input.mode || (row.job_key === "player-baseline-hp" ? "history_only_baseline_hp_enrichment" : "history_only_layer_1_sanity_baseline");
  input.trigger = trigger;
  input.logical_worker_name = "alphadog-v2-player-baseline-sanity";
  input.deployed_worker_slot = "alphadog-v2-phase2b-pitcher-role";
  input.history_only = true;
  input.no_daily_live_context = true;
  input.no_market_context = true;
  input.no_external_api_calls = true;
  input.no_scoring = true;
  input.no_final_board = true;
  input.no_prepared_board_mutation = true;

  if (!env.PHASE2B_PITCHER_ROLE_WORKER || typeof env.PHASE2B_PITCHER_ROLE_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      logical_worker_name: "alphadog-v2-player-baseline-sanity",
      deployed_worker_slot: "alphadog-v2-phase2b-pitcher-role",
      job_key: row.job_key,
      request_id: row.request_id,
      run_id: runId,
      status: "PLAYER_BASELINE_SANITY_MISSING_SERVICE_BINDING",
      error: "PHASE2B_PITCHER_ROLE_WORKER service binding is missing",
      required_binding: "PHASE2B_PITCHER_ROLE_WORKER"
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'PLAYER_BASELINE_SANITY_MISSING_SERVICE_BINDING', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_player_baseline_sanity_service_binding', 'PHASE2B_PITCHER_ROLE_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_player_baseline_sanity_service_binding', error_message='PHASE2B_PITCHER_ROLE_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id);
    return output;
  }

  const started = Date.now();
  let output;
  let httpStatus = null;
  try {
    const resp = await serviceBindingFetch(env.PHASE2B_PITCHER_ROLE_WORKER, "https://internal.alphadog-v2-phase2b-pitcher-role/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }, "player_baseline_sanity", 75000);
    httpStatus = resp.status;
    const text = await resp.text();
    try { output = JSON.parse(text); }
    catch (_) {
      output = { ok:false, data_ok:false, version:SYSTEM_VERSION, processed_by:WORKER_NAME, worker_name:row.worker_name, job_key:row.job_key, status:"worker_non_json_response", http_status:httpStatus, response_preview:String(text || "").slice(0,900) };
    }
  } catch (err) {
    output = { ok:false, data_ok:false, version:SYSTEM_VERSION, processed_by:WORKER_NAME, worker_name:row.worker_name, job_key:row.job_key, status:"worker_dispatch_exception", error:String(err && err.message ? err.message : err) };
  }

  const continuationRequired = !!(output && output.continuation_required);
  const continuationInput = (output && output.next_input && typeof output.next_input === "object") ? output.next_input : null;
  if (continuationRequired && continuationInput) {
    const rowsReadPartial = Number((output && (output.hitter_log_rows_read || 0)) || 0) + Number((output && (output.pitcher_log_rows_read || 0)) || 0);
    const rowsWrittenPartial = Number(output && (output.rows_written || output.rows_staged || output.rows_promoted || 0));
    const certPartial = String((output && output.certification) || "PLAYER_BASELINE_SANITY_PARTIAL_CONTINUE").slice(0, 120);
    const runAfterSeconds = Math.max(0, Math.min(30, Number(output.run_after_delay_seconds ?? 0)));
    const cappedPartialOutput = {
      ...output,
      orchestrator_dispatch: {
        version: SYSTEM_VERSION,
        processed_by: WORKER_NAME,
        exact_worker_only: true,
        trigger,
        http_status: httpStatus,
        elapsed_ms: Date.now() - started,
        partial_continue: true,
        orchestrator_should_self_continue: true,
        run_after_seconds: runAfterSeconds,
        logical_worker_name: "alphadog-v2-player-baseline-sanity",
        deployed_worker_slot: "alphadog-v2-phase2b-pitcher-role",
        history_only: true,
        no_daily_live_context: true,
        no_market_context: true,
        no_external_api_calls: true,
        no_scoring: true,
        no_final_board_write: true,
        no_prepared_board_mutation: true
      }
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, certPartial, rowsReadPartial, rowsWrittenPartial, Date.now() - started, JSON.stringify(input), safeStringifyD1(cappedPartialOutput));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=?",
      runAfterSeconds, safeStringifyD1(continuationInput), safeStringifyD1(cappedPartialOutput), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'player_baseline_sanity_partial_continue', 'Orchestrator scheduled Player Baseline Sanity partial continuation', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, run_id:runId, certification:certPartial, next_mode:continuationInput.next_mode || continuationInput.mode || null, batch_id:continuationInput.batch_id || null, run_after_seconds:runAfterSeconds, version:SYSTEM_VERSION }).slice(0, 9000));
    return cappedPartialOutput;
  }

  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number((output && (output.hitter_log_rows_read || 0)) || 0) + Number((output && (output.pitcher_log_rows_read || 0)) || 0);
  const rowsWritten = Number(output && (output.rows_written || output.rows_promoted || 0));
  const certification = String((output && output.certification) || (ok ? "PLAYER_BASELINE_SANITY_COMPLETED" : "PLAYER_BASELINE_SANITY_FAILED")).slice(0, 120);
  const queueStatus = ok ? "completed" : "failed";
  const errorCode = ok ? null : "player_baseline_sanity_worker_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status)) || "Player Baseline Sanity worker failed").slice(0, 900);
  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      logical_worker_name: "alphadog-v2-player-baseline-sanity",
      deployed_worker_slot: "alphadog-v2-phase2b-pitcher-role",
      history_only: true,
      no_daily_live_context: true,
      no_market_context: true,
      no_external_api_calls: true,
      no_scoring: true,
      no_final_board_write: true,
      no_prepared_board_mutation: true
    }
  };
  await run(env.CONTROL_DB,
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, queueStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, Date.now() - started, JSON.stringify(input), safeStringifyD1(cappedOutput), errorCode, errorMessage);
  await run(env.CONTROL_DB,
    "UPDATE control_job_queue SET status=?, started_at=COALESCE(started_at, CURRENT_TIMESTAMP), finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
    queueStatus, safeStringifyD1(cappedOutput), errorCode, errorMessage, row.request_id);
  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'player_baseline_sanity_dispatch_completed', 'Orchestrator completed Layer 1 history-only Player Baseline Sanity dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id:row.request_id, run_id:runId, ok, data_ok:dataOk, rows_read:rowsRead, rows_written:rowsWritten, certification, version:SYSTEM_VERSION }).slice(0, 9000));
  return cappedOutput;
}

async function processPropFactorMinerJob(env, row, runId, trigger) {
  if (!env.PHASE2B_RECENT_FORM_WORKER || typeof env.PHASE2B_RECENT_FORM_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      logical_worker_name: "alphadog-v2-prop-factor-miner",
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "PROP_FACTOR_MINER_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch requires PHASE2B_RECENT_FORM_WORKER service binding. This existing dummy slot is used to avoid worker_manifest/global deploy changes."
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_prop_factor_miner_service_binding', 'PHASE2B_RECENT_FORM_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_prop_factor_miner_service_binding', error_message='PHASE2B_RECENT_FORM_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );
    return output;
  }

  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const requestedMode = String(rowInput.mode || rowInput.factor_mode || "hitter_prop_factor_mining");
  const isPitcherMode = requestedMode === "pitcher_prop_factor_mining" || requestedMode === "pitcher" || requestedMode === "pitchers";
  const selectedMode = isPitcherMode ? "pitcher_prop_factor_mining" : "hitter_prop_factor_mining";
  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    run_id: runId,
    job_key: row.job_key,
    worker_name: row.worker_name,
    logical_worker_name: "alphadog-v2-prop-factor-miner",
    deployed_worker_slot: "alphadog-v2-phase2b-recent-form",
    trigger,
    mode: selectedMode,
    factor_mode: selectedMode,
    input_json: rowInput,
    exact_worker_only: true,
    internal_only: true,
    no_external_api_calls: true,
    no_mlb_api_calls: true,
    no_odds_api_calls: true,
    no_parlay_api_calls: true,
    no_gemini_calls: true,
    reads_prepared_board_only: true,
    writes_score_db_factor_packets_only: true,
    retention_policy: "today_tomorrow_only",
    no_score_probability: true,
    no_edge: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_matrix_builder: true,
    no_old_production_touch: true
  };

  const parentRequestId = String(rowInput.parent_request_id || rowInput.parentRequestId || "");
  if (parentRequestId) {
    const parentRow = await first(env.CONTROL_DB,
      "SELECT request_id, status, finished_at, error_code, error_message FROM control_job_queue WHERE request_id=? LIMIT 1",
      parentRequestId
    );
    if (!parentRow || !isActiveControlQueueStatus(parentRow.status) || parentRow.finished_at) {
      const orphanOutput = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, logical_worker_name: "alphadog-v2-prop-factor-miner", job_key: row.job_key, request_id: row.request_id, chain_id: row.chain_id, parent_request_id: parentRequestId, mode: selectedMode, status: "cancelled_prop_factor_child_parent_not_active", certification: "PROP_FACTOR_CHILD_CANCELLED_PARENT_NOT_ACTIVE", certification_grade: "CANCELLED_ORPHAN", parent_status: parentRow ? parentRow.status : "missing", parent_finished_at: parentRow ? parentRow.finished_at : null, no_packet_write_attempted: true, no_scoring: true, no_matrix_builder: true, no_final_board: true };
      await run(env.CONTROL_DB,
        "UPDATE control_job_queue SET status='cancelled', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='prop_factor_parent_not_active', error_message='Prop Factor child cancelled because parent Market Full row is terminal or missing' WHERE request_id=? AND status IN ('pending','running','partial_continue') AND finished_at IS NULL",
        JSON.stringify(orphanOutput), row.request_id
      );
      await run(env.SCORE_DB,
        "UPDATE prop_factor_batches SET status='cancelled_orphan_parent_not_active', certification_status='PROP_FACTOR_BATCH_CANCELLED_ORPHAN_PARENT_NOT_ACTIVE', certification_grade='CANCELLED_ORPHAN', updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND factor_family=? AND status IN ('running','partial_continue','partial_continue_factor_packets_chunk_written')",
        row.request_id, isPitcherMode ? "pitcher" : "hitter"
      );
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'WARN', 'prop_factor_child_cancelled_parent_not_active', 'Prop Factor child dispatch skipped because parent Market Full row is terminal or missing', ?, CURRENT_TIMESTAMP)",
        row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify(orphanOutput)
      );
      return orphanOutput;
    }
  }

  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

  const started = Date.now();
  let output;
  let httpStatus = null;
  try {
    const resp = await serviceBindingFetch(env.PHASE2B_RECENT_FORM_WORKER, "https://internal.alphadog-v2-phase2b-recent-form/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }, "prop_factor_miner");
    httpStatus = resp.status;
    const text = await resp.text();
    try { output = JSON.parse(text); }
    catch (_) {
      output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "worker_non_json_response", http_status: httpStatus, response_preview: String(text || "").slice(0, 900) };
    }
  } catch (err) {
    const timeoutError = String(err && err.message ? err.message : err);
    output = await rescuePropFactorMinerTerminalEvidence(env, row, runId, input, selectedMode, trigger, timeoutError);
    if (!output) output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "worker_dispatch_exception", error: timeoutError };
  }

  if (output && output.ok === false && String(output.error || "").includes("prop_factor_miner_service_binding_timeout")) {
    const rescued = await rescuePropFactorMinerTerminalEvidence(env, row, runId, input, selectedMode, trigger, output.error);
    if (rescued) output = rescued;
  }

  const partial = isPartialContinueOutput(output) || !!(output && output.orchestrator_should_self_continue);
  const ok = !!(output && output.ok);
  const dataOk = partial || !!(output && output.data_ok);
  const rowsRead = Number(output && output.prepared_rows_read ? output.prepared_rows_read : 0);
  const rowsWritten = Number(output && output.packets_written ? output.packets_written : 0);
  const externalCalls = Number(output && (output.external_calls || output.external_calls_performed) ? (output.external_calls || output.external_calls_performed) : 0);
  const certification = String((output && output.certification) || (partial ? "PROP_FACTOR_MINER_PARTIAL_CONTINUE" : (ok ? "prop_factor_miner_completed" : "prop_factor_miner_failed"))).slice(0, 120);
  const queueStatus = partial ? "pending" : (ok ? "completed" : "failed");
  const runStatus = partial ? "partial_continue" : (ok ? "completed" : "failed");
  const errorCode = (ok || partial) ? null : "prop_factor_miner_worker_failed";
  const errorMessage = (ok || partial) ? null : String((output && (output.error || output.status)) || "Prop Factor Miner worker failed").slice(0, 900);
  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      logical_worker_name: "alphadog-v2-prop-factor-miner",
      deployed_worker_slot: "alphadog-v2-phase2b-recent-form",
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      retention_policy: "today_tomorrow_only",
      internal_only: true,
      no_external_api_calls: true,
      no_mlb_api_calls: true,
      no_scoring: true,
      no_ranking: true,
      no_matrix_builder: true,
      no_final_board_write: true,
      writes_shadow_table_only: false,
      no_old_production_touch: true
    }
  };

  const currentQueueRow = await first(env.CONTROL_DB,
    "SELECT request_id, status, finished_at, parent_request_id, error_code, error_message FROM control_job_queue WHERE request_id=? LIMIT 1",
    row.request_id
  );
  const currentQueueStatus = String(currentQueueRow && currentQueueRow.status ? currentQueueRow.status : "");
  const currentQueueCompletedPartial = currentQueueStatus === "completed" && partial;
  const currentQueueActiveOrCorrectable = !!currentQueueRow && (isActiveControlQueueStatus(currentQueueStatus) || currentQueueCompletedPartial) && (!currentQueueRow.finished_at || currentQueueCompletedPartial);
  if (!currentQueueActiveOrCorrectable) {
    const guardedOutput = {
      ...cappedOutput,
      queue_update_skipped_terminal_row: true,
      current_queue_status: currentQueueRow ? currentQueueRow.status : "missing",
      current_queue_finished_at: currentQueueRow ? currentQueueRow.finished_at : null,
      returning_output_partial_continue: partial,
      certification: "PROP_FACTOR_DISPATCH_RESULT_IGNORED_TERMINAL_QUEUE_ROW",
      certification_grade: "IGNORED_TERMINAL_QUEUE_ROW"
    };
    if (["failed", "cancelled"].includes(currentQueueStatus) && output && (output.batch_id || output.factor_batch_id)) {
      await run(env.SCORE_DB,
        "UPDATE prop_factor_batches SET status='cancelled_orphan_after_terminal_queue_guard', certification_status='PROP_FACTOR_BATCH_CANCELLED_AFTER_TERMINAL_QUEUE_GUARD', certification_grade='CANCELLED_ORPHAN', updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND request_id=? AND status IN ('running','partial_continue','partial_continue_factor_packets_chunk_written')",
        output.batch_id || output.factor_batch_id, row.request_id
      );
    }
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'WARN', 'prop_factor_miner_dispatch_result_ignored_terminal_queue_row', 'Ignored Prop Factor worker output because queue row became terminal during service-binding dispatch', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify(guardedOutput)
    );
    return guardedOutput;
  }

  await run(env.CONTROL_DB,
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  if (partial) {
    const nextInput = {
      ...rowInput,
      factor_batch_id: output && (output.factor_batch_id || output.batch_id) ? (output.factor_batch_id || output.batch_id) : rowInput.factor_batch_id || null,
      resume_batch_id: output && (output.factor_batch_id || output.batch_id) ? (output.factor_batch_id || output.batch_id) : rowInput.resume_batch_id || null,
      factor_resume: true,
      continuation_from_request_id: row.request_id
    };
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      JSON.stringify(nextInput), JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'prop_factor_miner_dispatch_completed', 'Orchestrator completed exact Prop Factor Miner dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, certification, rows_read: rowsRead, packets_written: rowsWritten, factor_family: output && output.factor_family, dispatch: cappedOutput.orchestrator_dispatch })
  );

  return cappedOutput;
}

async function processPropMatrixBuilderJob(env, row, runId, trigger) {
  if (!env.PHASE2B_CERTIFIER_WORKER || typeof env.PHASE2B_CERTIFIER_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      logical_worker_name: "alphadog-v2-prop-matrix-builder",
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "PROP_MATRIX_BUILDER_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch requires PHASE2B_CERTIFIER_WORKER service binding. The existing Phase2B Certifier dummy slot is used as the Prop Matrix Builder to avoid new worker manifest/global deploy changes."
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_prop_matrix_builder_service_binding', 'PHASE2B_CERTIFIER_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_prop_matrix_builder_service_binding', error_message='PHASE2B_CERTIFIER_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );
    return output;
  }

  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    run_id: runId,
    job_key: row.job_key,
    worker_name: row.worker_name,
    logical_worker_name: "alphadog-v2-prop-matrix-builder",
    deployed_worker_slot: "alphadog-v2-phase2b-certifier",
    trigger,
    mode: "prop_matrix_build",
    input_json: rowInput,
    exact_worker_only: true,
    internal_only: true,
    no_external_api_calls: true,
    no_mlb_api_calls: true,
    no_odds_api_calls: true,
    no_parlay_api_calls: true,
    no_gemini_calls: true,
    reads_prepared_board: true,
    reads_prop_factor_packets: true,
    reads_market_context_evidence: true,
    reads_daily_context_readiness: true,
    writes_score_db_matrix_only: true,
    one_row_per_safe_prepared_row: true,
    preserve_blocked_and_deferred_rows: true,
    retention_policy: "today_tomorrow_only",
    no_score_probability: true,
    no_confidence_score: true,
    no_edge: true,
    no_value_rating: true,
    no_qualified_flag: true,
    no_rank: true,
    no_pick_recommendation: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_old_production_touch: true
  };

  const cooldownYield = await maybeYieldHeavyMarketChildCooldown(env, row, runId, input, rowInput, {
    logical_worker_name: "alphadog-v2-prop-matrix-builder",
    deployed_worker_slot: "alphadog-v2-phase2b-certifier",
    mode: "prop_matrix_build"
  });
  if (cooldownYield) return cooldownYield;

  const started = Date.now();
  let output;
  let httpStatus = null;
  try {
    const resp = await serviceBindingFetch(env.PHASE2B_CERTIFIER_WORKER, "https://internal.alphadog-v2-phase2b-certifier/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }, "prop_matrix_builder");
    httpStatus = resp.status;
    const text = await resp.text();
    try { output = JSON.parse(text); }
    catch (_) {
      output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "worker_non_json_response", http_status: httpStatus, response_preview: String(text || "").slice(0, 900) };
    }
  } catch (err) {
    output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "worker_dispatch_exception", error: String(err && err.message ? err.message : err) };
  }

  const partial = isPartialContinueOutput(output);
  const ok = !!(output && output.ok);
  const dataOk = partial || !!(output && output.data_ok);
  const rowsRead = Number(output && output.prepared_rows_read ? output.prepared_rows_read : 0);
  const rowsWritten = Number(output && output.matrix_rows_written ? output.matrix_rows_written : 0);
  const externalCalls = Number(output && (output.external_calls || output.external_calls_performed) ? (output.external_calls || output.external_calls_performed) : 0);
  const certification = String((output && output.certification) || (partial ? "PROP_MATRIX_BUILDER_PARTIAL_CONTINUE" : (ok ? "prop_matrix_builder_completed" : "prop_matrix_builder_failed"))).slice(0, 120);
  const queueStatus = partial ? "pending" : (ok ? "completed" : "failed");
  const runStatus = partial ? "partial_continue" : (ok ? "completed" : "failed");
  const errorCode = (ok || partial) ? null : "prop_matrix_builder_worker_failed";
  const errorMessage = (ok || partial) ? null : String((output && (output.error || output.status)) || "Prop Matrix Builder worker failed").slice(0, 900);
  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      logical_worker_name: "alphadog-v2-prop-matrix-builder",
      deployed_worker_slot: "alphadog-v2-phase2b-certifier",
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      retention_policy: "today_tomorrow_only",
      internal_only: true,
      no_external_api_calls: true,
      no_mlb_api_calls: true,
      one_row_per_safe_prepared_row: true,
      no_score_probability: true,
      no_confidence_score: true,
      no_edge: true,
      no_value_rating: true,
      no_qualified_flag: true,
      no_rank: true,
      no_pick_recommendation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true,
      writes_shadow_table_only: false,
      no_old_production_touch: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  if (partial) {
    const nextInput = {
      ...rowInput,
      matrix_batch_id: output && (output.matrix_batch_id || output.batch_id) ? (output.matrix_batch_id || output.batch_id) : rowInput.matrix_batch_id || null,
      resume_batch_id: output && (output.matrix_batch_id || output.batch_id) ? (output.matrix_batch_id || output.batch_id) : rowInput.resume_batch_id || null,
      matrix_resume: true,
      continuation_from_request_id: row.request_id
    };
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      JSON.stringify(nextInput), JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'prop_matrix_builder_dispatch_completed', ?, ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, partial ? "INFO" : (ok ? "INFO" : "ERROR"), partial ? "Orchestrator partial-continued exact Prop Matrix Builder dispatch" : "Orchestrator completed exact Prop Matrix Builder dispatch", JSON.stringify({ request_id: row.request_id, certification, partial_continue: partial, rows_read: rowsRead, matrix_rows_written: rowsWritten, dispatch: cappedOutput.orchestrator_dispatch })
  );

  return cappedOutput;
}


async function processScoringEngineJob(env, row, runId, trigger) {
  const isSimulationJob = row && row.job_key === "scoring-engine-simulation";
  const isHitProbabilityJob = row && row.job_key === "hit-probability";
  if (!env.SCORE_AUDIT_WORKER || typeof env.SCORE_AUDIT_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      logical_worker_name: isHitProbabilityJob ? "alphadog-v2-hit-probability" : (isSimulationJob ? "alphadog-v2-scoring-engine-simulation" : "alphadog-v2-scoring-engine"),
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "SCORING_ENGINE_SERVICE_BINDING_MISSING",
      certification_grade: "BLOCKED",
      trigger,
      note: "Exact dispatch requires SCORE_AUDIT_WORKER service binding. Existing score-audit slot is used for Scoring Engine current scoring/simulation/hit-probability; no worker_manifest/global deploy change required."
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_scoring_engine_service_binding', 'SCORE_AUDIT_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_scoring_engine_service_binding', error_message='SCORE_AUDIT_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );
    return output;
  }

  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    run_id: runId,
    job_key: row.job_key,
    worker_name: row.worker_name,
    logical_worker_name: isHitProbabilityJob ? "alphadog-v2-hit-probability" : (isSimulationJob ? "alphadog-v2-scoring-engine-simulation" : "alphadog-v2-scoring-engine"),
    deployed_worker_slot: "alphadog-v2-score-audit",
    trigger,
    mode: isHitProbabilityJob ? "hit_probability_current_estimate" : (isSimulationJob ? "scoring_engine_simulation_shadow_strict_b" : "scoring_engine_current_strict_c_realistic_v3_2"),
    input_json: rowInput,
    exact_worker_only: true,
    framework_only: false,
    production_scoring_current: (!isSimulationJob && !isHitProbabilityJob),
    simulation_only: isSimulationJob,
      hit_probability_only: isHitProbabilityJob,
    hit_probability_only: isHitProbabilityJob,
    primary_simulation_profile: isHitProbabilityJob ? "HP_EMPIRICAL_V0_1_1_SAME_SCORE_AUDIT_SLOT" : (isSimulationJob ? "STRICT_B" : "STRICT_C_REALISTIC_V3_2"),
    comparison_profile: isSimulationJob ? "HYBRID_CONTROL" : null,
    writes_shadow_table_only: isSimulationJob,
    thresholds_locked: false,
    scoring_enabled: (!isSimulationJob && !isHitProbabilityJob),
    archive_score_threshold_locked: 70,
    final_qualification_threshold_locked: false,
    no_true_hit_probability_claims: true,
    side_aware_required: true,
    source_line_type_aware_required: true,
    variation_aware_required: true,
    one_score_row_per_matrix_row: true,
    no_variation_collapse: true,
    regular_lines_two_sided: true,
    goblin_demon_more_only: true,
    goblin_demon_under_blocker: "GOBLIN_DEMON_UNDER_NOT_SELECTABLE",
    dedupe_deferred_to_ranking_final_board: true,
    writes_score_db_scoring_engine_only: (!isSimulationJob && !isHitProbabilityJob),
    writes_score_db_simulation_shadow_only: isSimulationJob,
    writes_score_db_hit_probability_only: isHitProbabilityJob,
    writes_hp_board_tables_only: isHitProbabilityJob,
    hp_board_required: isHitProbabilityJob,
    hp_board_same_worker: isHitProbabilityJob,
    hp_board_display_calibration_required: isHitProbabilityJob,
    service_binding_timeout_reconcile_from_tables: isHitProbabilityJob,
    writes_archive_db_snapshot_table_schema_only: (!isSimulationJob && !isHitProbabilityJob),
    no_candidate_board_write: true,
    no_old_prop_scores_write: true,
    no_ranking: true,
    no_final_board: true,
    no_old_production_touch: true
  };

  const cooldownYield = await maybeYieldHeavyMarketChildCooldown(env, row, runId, input, rowInput, {
    logical_worker_name: isHitProbabilityJob ? "alphadog-v2-hit-probability" : (isSimulationJob ? "alphadog-v2-scoring-engine-simulation" : "alphadog-v2-scoring-engine"),
    deployed_worker_slot: "alphadog-v2-score-audit",
    mode: input.mode
  });
  if (cooldownYield) return cooldownYield;

  const started = Date.now();
  let output;
  let httpStatus = null;
  try {
    const resp = await serviceBindingFetch(env.SCORE_AUDIT_WORKER, "https://internal.alphadog-v2-score-audit/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }, "scoring_engine");
    httpStatus = resp.status;
    const text = await resp.text();
    try { output = JSON.parse(text); }
    catch (_) {
      output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "worker_non_json_response", http_status: httpStatus, response_preview: String(text || "").slice(0, 900) };
    }
  } catch (err) {
    output = { ok: false, data_ok: false, version: SYSTEM_VERSION, processed_by: WORKER_NAME, worker_name: row.worker_name, job_key: row.job_key, status: "worker_dispatch_exception", error: String(err && err.message ? err.message : err) };
  }

  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && (output.matrix_rows_read || output.source_rows_read || output.rows_read) ? (output.matrix_rows_read || output.source_rows_read || output.rows_read) : 0);
  const rowsWritten = Number(output && (output.score_rows_written || output.simulation_rows_written || output.probability_rows_written || output.rows_written) ? (output.score_rows_written || output.simulation_rows_written || output.probability_rows_written || output.rows_written) : 0);
  const archiveRowsWritten = Number(output && output.archive_rows_written ? output.archive_rows_written : 0);
  const certification = String((output && output.certification) || (ok ? "scoring_engine_framework_completed" : "scoring_engine_framework_failed")).slice(0, 120);
  const partial = !!(ok && output && (
    output.continuation_required === true ||
    output.orchestrator_should_self_continue === true ||
    String(output.status || "").toLowerCase().startsWith("partial_continue") ||
    String(output.certification || output.certification_status || "").toUpperCase().includes("PARTIAL_CONTINUE") ||
    String(output.certification_grade || "").toUpperCase() === "PARTIAL"
  ));
  const queueStatus = partial ? "pending" : (ok ? "completed" : "failed");
  const runStatus = partial ? "partial_continue" : (ok ? "completed" : "failed");
  const errorCode = ok ? null : "scoring_engine_worker_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status)) || "Scoring Engine worker failed").slice(0, 900);
  const cappedOutput = {
    ...output,
    deployed_slot_version: isHitProbabilityJob ? "alphadog-v2-scoring-engine-v0.4.16-hp-board-display-calibration-same-worker" : "alphadog-v2-scoring-engine-v0.4.9-current-chunk-continuation-lock",
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      logical_worker_name: isHitProbabilityJob ? "alphadog-v2-hit-probability" : (isSimulationJob ? "alphadog-v2-scoring-engine-simulation" : "alphadog-v2-scoring-engine"),
      deployed_worker_slot: "alphadog-v2-score-audit",
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      framework_only: false,
      production_scoring_current: (!isSimulationJob && !isHitProbabilityJob),
      simulation_only: isSimulationJob,
      thresholds_locked: false,
      scoring_enabled: (!isSimulationJob && !isHitProbabilityJob),
      archive_score_threshold_locked: 70,
      no_true_hit_probability_claims: true,
      estimated_hit_probability_phase: isHitProbabilityJob,
      hp_board_required: isHitProbabilityJob,
      hp_board_display_calibration_required: isHitProbabilityJob,
      side_aware_required: true,
      source_line_type_aware_required: true,
      variation_aware_required: true,
      no_variation_collapse: true,
      no_candidate_board_write: true,
      no_ranking: true,
      no_final_board_write: true,
      writes_shadow_table_only: isSimulationJob,
      writes_hit_probability_tables_only: isHitProbabilityJob,
      no_old_production_touch: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  if (partial) {
    const nextInput = {
      ...rowInput,
      resume_batch_id: output && output.batch_id ? output.batch_id : rowInput.resume_batch_id || null,
      scoring_engine_resume: true,
      continuation_from_request_id: row.request_id,
      continuation_certification: certification
    };
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      JSON.stringify(nextInput), JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'scoring_engine_dispatch_completed', ?, ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, partial ? "INFO" : (ok ? "INFO" : "ERROR"), partial ? "Orchestrator partial-continued exact score-audit-slot dispatch" : "Orchestrator completed exact score-audit-slot dispatch", JSON.stringify({ request_id: row.request_id, certification, partial_continue: partial, matrix_rows_read: rowsRead, score_rows_written: rowsWritten, archive_rows_written: archiveRowsWritten, dispatch: cappedOutput.orchestrator_dispatch })
  );

  return cappedOutput;
}


async function processScoreFinalBoardJob(env, row, runId, trigger) {
  if (!env.SCORE_FINAL_BOARD_WORKER || typeof env.SCORE_FINAL_BOARD_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "SCORE_FINAL_BOARD_SERVICE_BINDING_MISSING",
      certification_grade: "BLOCKED",
      trigger,
      note: "Exact dispatch requires SCORE_FINAL_BOARD_WORKER service binding."
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_score_final_board_service_binding', 'SCORE_FINAL_BOARD_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_score_final_board_service_binding', error_message='SCORE_FINAL_BOARD_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );
    return output;
  }

  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    run_id: runId,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: "score_final_board_generate_current",
    input_json: rowInput,
    source_simulation_batch_id: rowInput.source_simulation_batch_id || rowInput.simulation_batch_id || null,
    profile_key: "STRICT_C_REALISTIC_V3_2",
    exact_worker_only: true,
    writes_score_final_board_current: true,
    no_external_calls: true,
    no_source_board_mutation: true,
    no_simulation_shadow_mutation: true
  };

  const cooldownYield = await maybeYieldHeavyMarketChildCooldown(env, row, runId, input, rowInput, {
    logical_worker_name: "alphadog-v2-score-final-board",
    deployed_worker_slot: "alphadog-v2-score-final-board",
    mode: "score_final_board_generate_current"
  });
  if (cooldownYield) return cooldownYield;

  const started = Date.now();
  let output;
  let httpStatus = null;
  try {
    const resp = await serviceBindingFetch(env.SCORE_FINAL_BOARD_WORKER, "https://internal.alphadog-v2-score-final-board/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }, "score_final_board");
    httpStatus = resp.status;
    const text = await resp.text();
    try { output = JSON.parse(text); }
    catch (_) { output = { ok:false, data_ok:false, version:SYSTEM_VERSION, processed_by:WORKER_NAME, worker_name:row.worker_name, job_key:row.job_key, status:"worker_non_json_response", http_status:httpStatus, response_preview:String(text || "").slice(0,900) }; }
  } catch (err) {
    output = { ok:false, data_ok:false, version:SYSTEM_VERSION, processed_by:WORKER_NAME, worker_name:row.worker_name, job_key:row.job_key, status:"worker_dispatch_exception", error:String(err && err.message ? err.message : err) };
  }

  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && (output.matrix_rows_read || output.live_rows_read) ? (output.matrix_rows_read || output.live_rows_read) : 0);
  const rowsWritten = Number(output && (output.current_rows_written || output.final_rows_written) ? (output.current_rows_written || output.final_rows_written) : 0);
  const certification = String((output && output.certification) || (ok ? "SCORE_FINAL_BOARD_COMPLETED" : "SCORE_FINAL_BOARD_FAILED")).slice(0, 120);
  const queueStatus = ok ? "completed" : "failed";
  const runStatus = ok ? "completed" : "failed";
  const errorCode = ok ? null : "score_final_board_worker_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status)) || "Score Final Board worker failed").slice(0, 900);
  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      deployed_worker_slot: "alphadog-v2-score-final-board",
      service_binding: "SCORE_FINAL_BOARD_WORKER",
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      writes_score_final_board_current: true,
      no_external_calls: true,
      no_source_board_mutation: true,
      no_simulation_shadow_mutation: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  const partial = false;
  if (partial) {
    const nextInput = {
      ...rowInput,
      matrix_batch_id: output && (output.matrix_batch_id || output.batch_id) ? (output.matrix_batch_id || output.batch_id) : rowInput.matrix_batch_id || null,
      resume_batch_id: output && (output.matrix_batch_id || output.batch_id) ? (output.matrix_batch_id || output.batch_id) : rowInput.resume_batch_id || null,
      matrix_resume: true,
      continuation_from_request_id: row.request_id
    };
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      JSON.stringify(nextInput), JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'score_final_board_dispatch_completed', 'Orchestrator completed exact Score Final Board dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, certification, rows_read: rowsRead, rows_written: rowsWritten, final_board_batch_id: output && output.final_board_batch_id || null, dispatch: cappedOutput.orchestrator_dispatch })
  );

  return cappedOutput;
}

async function processScorePrepJob(env, row, runId, trigger) {
  if (!env.SCORE_PREP_WORKER || typeof env.SCORE_PREP_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      status: "blocked_missing_service_binding",
      certification: "SCORE_PREP_SERVICE_BINDING_MISSING",
      trigger,
      note: "Exact dispatch is enabled only through SCORE_PREP_WORKER service binding. Deploy orchestrator with services config."
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_score_prep_service_binding', 'SCORE_PREP_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_score_prep_service_binding', error_message='SCORE_PREP_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );
    return output;
  }

  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const requestedMode = String(rowInput.mode || "market_hitter_prop_line_context");
  const isPitcherMode = requestedMode === "market_pitcher_prop_line_context" || requestedMode === "pitcher_props" || requestedMode === "market_pitcher_props";
  const propFamily = isPitcherMode ? "pitcher" : "hitter";
  const selectedMode = isPitcherMode ? "market_pitcher_prop_line_context" : "market_hitter_prop_line_context";
  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: "board_prep_enrichment",
    input_json: rowInput,
    exact_worker_only: true,
    reads_market_boards: true,
    reads_team_calendar: true,
    reads_ref_identity: true,
    writes_score_prepared_board_only: true,
    no_market_board_mutation: true,
    no_raw_board_delete: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    preserve_all_source_rows: true
  };

  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

  const started = Date.now();
  let output;
  let httpStatus = null;
  try {
    const resp = await env.SCORE_PREP_WORKER.fetch("https://internal.alphadog-v2-score-prep/run", {
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

  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && output.rows_read ? output.rows_read : 0);
  const rowsWritten = Number(output && output.rows_written ? output.rows_written : 0);
  const externalCalls = Number(output && output.external_calls_performed ? output.external_calls_performed : 0);
  const certification = String((output && output.certification) || (ok ? "score_prep_completed" : "score_prep_failed")).slice(0, 120);
  const queueStatus = ok ? "completed" : "failed";
  const runStatus = ok ? "completed" : "failed";
  const errorCode = ok ? null : "score_prep_worker_failed";
  const errorMessage = ok ? null : String((output && (output.error || output.status)) || "Score Prep worker failed").slice(0, 900);
  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      no_market_board_mutation: true,
      no_raw_board_delete: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true,
      writes_shadow_table_only: false,
      no_old_production_touch: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  const partial = false;
  if (partial) {
    const nextInput = {
      ...rowInput,
      matrix_batch_id: output && (output.matrix_batch_id || output.batch_id) ? (output.matrix_batch_id || output.batch_id) : rowInput.matrix_batch_id || null,
      resume_batch_id: output && (output.matrix_batch_id || output.batch_id) ? (output.matrix_batch_id || output.batch_id) : rowInput.resume_batch_id || null,
      matrix_resume: true,
      continuation_from_request_id: row.request_id
    };
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      JSON.stringify(nextInput), JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'score_prep_dispatch_completed', 'Orchestrator completed exact Score Prep dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, certification, rows_read: rowsRead, rows_written: rowsWritten, dispatch: cappedOutput.orchestrator_dispatch })
  );

  return cappedOutput;
}


async function processDeltaCertifierJob(env, row, runId, trigger) {
  if (!env.DELTA_CERTIFIER_WORKER || typeof env.DELTA_CERTIFIER_WORKER.fetch !== "function") {
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      worker_name: row.worker_name,
      job_key: row.job_key,
      request_id: row.request_id,
      chain_id: row.chain_id,
      status: "blocked_missing_service_binding",
      certification: "DELTA_CERTIFIER_SERVICE_BINDING_MISSING",
      certification_grade: "BLOCKED",
      trigger,
      note: "Exact delta-certifier dispatch requires DELTA_CERTIFIER_WORKER service binding. Deploy orchestrator with the services wrangler config."
    };

    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'missing_service_binding', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'missing_delta_certifier_service_binding', 'DELTA_CERTIFIER_WORKER service binding is missing')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );

    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='missing_delta_certifier_service_binding', error_message='DELTA_CERTIFIER_WORKER service binding is missing' WHERE request_id=?",
      JSON.stringify(output), row.request_id
    );

    return output;
  }

  const rowInput = (() => { try { return JSON.parse(row.input_json || "{}"); } catch (_) { return {}; } })();
  const requestedMode = String(rowInput.mode || "game_calendar_differential_check_update");
  const normalizedInputJson = {
    ...rowInput,
    mode: requestedMode,
    exact_delta_certifier_dispatch_v0_2_117: true,
    no_browser_loop: true,
    backend_scheduled_continuation: true
  };
  const input = {
    request_id: row.request_id,
    chain_id: row.chain_id,
    run_id: runId,
    job_key: row.job_key,
    worker_name: row.worker_name,
    trigger,
    mode: requestedMode,
    input_json: normalizedInputJson,
    exact_worker_only: true,
    calendar_tally_stage: normalizedInputJson.calendar_tally_stage || null,
    parent_full_run: normalizedInputJson.parent_full_run === true,
    parent_request_id: normalizedInputJson.parent_request_id || null,
    parent_chain_id: normalizedInputJson.parent_chain_id || row.chain_id || null,
    full_run_stage_key: normalizedInputJson.full_run_stage_key || null,
    require_zero_blocking_gaps: normalizedInputJson.require_zero_blocking_gaps === true,
    allow_blocking_gaps: normalizedInputJson.allow_blocking_gaps === true,
    no_source_history_mutation: true,
    no_repair_jobs_created: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_board_mutation: true,
    no_daily_context_mutation: true
  };

  const recentPartial = await first(env.CONTROL_DB, `SELECT
      COUNT(*) AS partial_continue_runs,
      MAX(finished_at) AS last_partial_finished_at,
      CAST((julianday(CURRENT_TIMESTAMP) - julianday(MAX(finished_at))) * 86400 AS INTEGER) AS seconds_since_last_partial
    FROM control_job_runs
    WHERE request_id=?
      AND job_key=?
      AND status='partial_continue'
      AND finished_at IS NOT NULL`, row.request_id, row.job_key);
  const partialRunCount = Number(recentPartial && recentPartial.partial_continue_runs || 0);
  const secondsSinceLastPartial = recentPartial && recentPartial.seconds_since_last_partial !== null && recentPartial.seconds_since_last_partial !== undefined ? Number(recentPartial.seconds_since_last_partial) : 999999;
  if (partialRunCount > 0 && secondsSinceLastPartial >= 0 && secondsSinceLastPartial < PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS) {
    const family = isPitcherMode ? "pitcher" : "hitter";
    const batchRow = env.SCORE_DB ? await first(env.SCORE_DB, `SELECT batch_id, prepared_rows_read, eligible_rows, packets_written, blocked_rows, warning_rows, issue_rows, missing_factor_rows, status, certification_status, certification_grade
      FROM prop_factor_batches
      WHERE request_id=? AND factor_family=?
      ORDER BY datetime(updated_at) DESC
      LIMIT 1`, row.request_id, family) : null;
    const resumeBatchId = batchRow && batchRow.batch_id ? batchRow.batch_id : (rowInput.resume_batch_id || rowInput.factor_batch_id || null);
    const output = {
      ok:true,
      data_ok:true,
      version:SYSTEM_VERSION,
      processed_by:WORKER_NAME,
      worker_name:"alphadog-v2-prop-factor-miner",
      deployed_worker_slot:"alphadog-v2-phase2b-recent-form",
      job_key:row.job_key,
      request_id:row.request_id,
      chain_id:row.chain_id,
      run_id:runId,
      mode:selectedMode,
      factor_family:family,
      status:"PARTIAL_CONTINUE_PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification:"PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD",
      certification_grade:"PARTIAL_CONTINUE",
      batch_id:resumeBatchId,
      prepared_rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      eligible_rows:Number(batchRow && batchRow.eligible_rows || 0),
      packets_written:Number(batchRow && batchRow.packets_written || 0),
      rows_read:Number(batchRow && batchRow.prepared_rows_read || 0),
      rows_written:Number(batchRow && batchRow.packets_written || 0),
      blocked_rows:Number(batchRow && batchRow.blocked_rows || 0),
      warning_rows:Number(batchRow && batchRow.warning_rows || 0),
      issue_rows:Number(batchRow && batchRow.issue_rows || 0),
      missing_factor_rows:Number(batchRow && batchRow.missing_factor_rows || 0),
      partial_continue_runs_seen:partialRunCount,
      seconds_since_last_partial:secondsSinceLastPartial,
      prop_factor_service_binding_cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS,
      service_binding_limit_policy:"one_heavy_prop_factor_dispatch_per_fresh_orchestrator_continuation",
      official_service_binding_invocation_limit:32,
      official_service_binding_90pct_budget:28,
      alphadog_observed_heavy_dispatch_limit_override:true,
      continuation_required:true,
      orchestrator_should_self_continue:true,
      factor_resume:true,
      resume_batch_id:resumeBatchId,
      no_external_api_calls:true,
      no_scoring:true,
      no_ranking:true,
      no_matrix_builder:true,
      no_final_board:true
    };
    const nextInput = {
      ...rowInput,
      factor_batch_id: resumeBatchId,
      resume_batch_id: resumeBatchId,
      factor_resume: true,
      continuation_from_request_id: row.request_id,
      service_binding_cooldown_yield: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'partial_continue', 1, 'PROP_FACTOR_SERVICE_BINDING_COOLDOWN_YIELD', ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, output.rows_read, output.rows_written, JSON.stringify(input), JSON.stringify(output));
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=datetime(CURRENT_TIMESTAMP, '+' || ? || ' seconds'), finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, JSON.stringify(nextInput), JSON.stringify(output), row.request_id);
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'prop_factor_service_binding_cooldown_yield', 'Yielded Prop Factor child instead of starting another immediate heavy service-binding dispatch inside the same hot continuation window', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ request_id:row.request_id, batch_id:resumeBatchId, partialRunCount, secondsSinceLastPartial, cooldown_seconds:PROP_FACTOR_SERVICE_BINDING_COOLDOWN_SECONDS, version:SYSTEM_VERSION }).slice(0, 9000));
    return output;
  }

  const started = Date.now();
  let output;
  let httpStatus = null;

  try {
    const resp = await env.DELTA_CERTIFIER_WORKER.fetch("https://internal.alphadog-v2-delta-certifier/run", {
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
        request_id: row.request_id,
        chain_id: row.chain_id,
        mode: requestedMode,
        status: "worker_non_json_response",
        certification: "DELTA_CERTIFIER_NON_JSON_RESPONSE",
        certification_grade: "FAILED",
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
      request_id: row.request_id,
      chain_id: row.chain_id,
      mode: requestedMode,
      status: "worker_dispatch_exception",
      certification: "DELTA_CERTIFIER_DISPATCH_EXCEPTION",
      certification_grade: "FAILED",
      error: String(err && err.message ? err.message : err)
    };
  }

  const ok = !!(output && output.ok);
  const dataOk = !!(output && output.data_ok);
  const rowsRead = Number(output && (output.rows_read ?? output.source_game_count) ? (output.rows_read ?? output.source_game_count) : 0);
  const rowsWritten = Number(output && (output.rows_written ?? output.coverage_rows_written) ? (output.rows_written ?? output.coverage_rows_written) : 0);
  const externalCalls = Number(output && output.external_calls_performed ? output.external_calls_performed : 0);
  const certification = String((output && (output.certification || output.certification_status)) || (ok ? "delta_certifier_completed" : "delta_certifier_failed")).slice(0, 120);
  const queueStatus = ok && dataOk ? "completed" : "failed";
  const runStatus = ok && dataOk ? "completed" : "failed";
  const errorCode = ok && dataOk ? null : "delta_certifier_worker_failed";
  const errorMessage = ok && dataOk ? null : String((output && (output.error || output.status || output.certification)) || "Delta Certifier worker failed").slice(0, 900);
  const cappedOutput = {
    ...output,
    orchestrator_dispatch: {
      version: SYSTEM_VERSION,
      processed_by: WORKER_NAME,
      exact_worker_only: true,
      trigger,
      http_status: httpStatus,
      elapsed_ms: Date.now() - started,
      delta_certifier_dispatch_v0_2_117: true,
      mode: requestedMode,
      calendar_tally_stage: normalizedInputJson.calendar_tally_stage || null,
      parent_full_run: normalizedInputJson.parent_full_run === true,
      require_zero_blocking_gaps: normalizedInputJson.require_zero_blocking_gaps === true,
      allow_blocking_gaps: normalizedInputJson.allow_blocking_gaps === true,
      finalizes_queue_on_exception: true,
      backend_self_continuation_ready: true,
      manual_wake_testing_only: true,
      no_browser_pump: true,
      no_generic_dispatch: true,
      no_source_history_mutation: true,
      no_repair_jobs_created: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true,
      writes_shadow_table_only: isSimulationJob,
      no_board_mutation: true,
      no_daily_context_mutation: true
    }
  };

  await run(env.CONTROL_DB,
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, runStatus, dataOk ? 1 : 0, certification, rowsRead, rowsWritten, externalCalls, Date.now() - started, JSON.stringify(input), JSON.stringify(cappedOutput), errorCode, errorMessage
  );

  const partial = false;
  if (partial) {
    const nextInput = {
      ...rowInput,
      matrix_batch_id: output && (output.matrix_batch_id || output.batch_id) ? (output.matrix_batch_id || output.batch_id) : rowInput.matrix_batch_id || null,
      resume_batch_id: output && (output.matrix_batch_id || output.batch_id) ? (output.matrix_batch_id || output.batch_id) : rowInput.resume_batch_id || null,
      matrix_resume: true,
      continuation_from_request_id: row.request_id
    };
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, finished_at=NULL, updated_at=CURRENT_TIMESTAMP, input_json=?, output_json=?, error_code=NULL, error_message=NULL WHERE request_id=? AND status IN ('pending','running','partial_continue','completed')",
      JSON.stringify(nextInput), JSON.stringify(cappedOutput), row.request_id
    );
  } else {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=?",
      queueStatus, JSON.stringify(cappedOutput), errorCode, errorMessage, row.request_id
    );
  }

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, 'delta_certifier_dispatch_completed', 'Orchestrator completed exact delta-certifier calendar/tally dispatch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, ok && dataOk ? "INFO" : "ERROR", JSON.stringify({ request_id: row.request_id, certification, rows_read: rowsRead, rows_written: rowsWritten, external_calls: externalCalls, mode: requestedMode, calendar_tally_stage: normalizedInputJson.calendar_tally_stage || null, queue_status: queueStatus, dispatch: cappedOutput.orchestrator_dispatch })
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
    "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json) VALUES (?, ?, ?, ?, ?, 'completed', 1, 'real_orchestrator_safe_test_complete', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?)",
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
      writes_shadow_table_only: isSimulationJob,
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


async function claimSelectedQueueRowForDispatch(env, row, trigger) {
  if (!row || !row.request_id) return { claimed: false, reason: "missing_row" };
  const previousStatus = String(row.status || "");
  if (previousStatus === "pending" || previousStatus === "partial_continue") {
    const res = await run(env.CONTROL_DB,
      `UPDATE control_job_queue
          SET status='running',
              started_at=COALESCE(started_at,CURRENT_TIMESTAMP),
              updated_at=CURRENT_TIMESTAMP,
              tick_count=COALESCE(tick_count,0)+1
        WHERE request_id=?
          AND status IN ('pending','partial_continue')
          AND finished_at IS NULL`,
      row.request_id
    );
    const changes = Number((res && res.meta && res.meta.changes) || res && res.changes || 0);
    if (changes !== 1) {
      const latest = await first(env.CONTROL_DB,
        "SELECT status, tick_count, started_at, updated_at, finished_at, error_code, error_message FROM control_job_queue WHERE request_id=? LIMIT 1",
        row.request_id
      );
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'WARN', 'orchestrator_atomic_dispatch_claim_lost', 'Skipped selected queue row because another hot pump claimed or finished it first', ?, CURRENT_TIMESTAMP)",
        row.request_id, WORKER_NAME, row.job_key || "unknown", JSON.stringify({ trigger, selected_request_id: row.request_id, selected_job_key: row.job_key, selected_worker_name: row.worker_name, previous_status: previousStatus, latest, claim_changes: changes, atomic_dispatch_claim_guard_v0_2_218: true, no_duplicate_service_binding_dispatch: true, version: SYSTEM_VERSION })
      );
      return { claimed: false, reason: "claim_lost", latest };
    }
    row.status = "running";
    row.tick_count = Number(row.tick_count || 0) + 1;
    return { claimed: true, previous_status: previousStatus, acquired_by_atomic_claim: true };
  }
  if (previousStatus === "running") {
    await run(env.CONTROL_DB,
      `UPDATE control_job_queue
          SET status='running',
              started_at=COALESCE(started_at,CURRENT_TIMESTAMP),
              updated_at=CURRENT_TIMESTAMP,
              tick_count=COALESCE(tick_count,0)+1
        WHERE request_id=?
          AND status='running'
          AND finished_at IS NULL`,
      row.request_id
    );
    return { claimed: true, previous_status: previousStatus, running_rescue_reclaimed: true };
  }
  const latest = await first(env.CONTROL_DB,
    "SELECT status, tick_count, started_at, updated_at, finished_at, error_code, error_message FROM control_job_queue WHERE request_id=? LIMIT 1",
    row.request_id
  );
  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'WARN', 'orchestrator_atomic_dispatch_non_runnable_status', 'Skipped selected queue row because status was not runnable at claim time', ?, CURRENT_TIMESTAMP)",
    row.request_id, WORKER_NAME, row.job_key || "unknown", JSON.stringify({ trigger, selected_request_id: row.request_id, previous_status: previousStatus, latest, atomic_dispatch_claim_guard_v0_2_218: true, version: SYSTEM_VERSION })
  );
  return { claimed: false, reason: "non_runnable_status", latest };
}


async function rescueStalePlayerBaselineRunningJobForResume(env, trigger) {
  if (!env || !env.CONTROL_DB) return null;
  const row = await first(env.CONTROL_DB,
    `SELECT request_id, chain_id, job_key, worker_name, status, tick_count, input_json, output_json, updated_at, started_at, run_after
     FROM control_job_queue
     WHERE job_key IN ('player-baseline-sanity','player-baseline-hp')
       AND worker_name='alphadog-v2-phase2b-pitcher-role'
       AND status='running'
       AND finished_at IS NULL
       AND datetime(COALESCE(updated_at, started_at, created_at)) <= datetime(CURRENT_TIMESTAMP, '-90 seconds')
       AND datetime(COALESCE(run_after, CURRENT_TIMESTAMP)) <= datetime(CURRENT_TIMESTAMP)
     ORDER BY datetime(COALESCE(updated_at, started_at, created_at)) ASC
     LIMIT 1`
  );
  if (!row || !row.request_id) return null;

  const latestPartial = await first(env.CONTROL_DB,
    `SELECT run_id, finished_at, output_json
     FROM control_job_runs
     WHERE request_id=?
       AND job_key=?
       AND status='partial_continue'
       AND finished_at IS NOT NULL
     ORDER BY datetime(finished_at) DESC
     LIMIT 1`,
    row.request_id, row.job_key
  );
  const staleRuns = await all(env.CONTROL_DB,
    `SELECT run_id, started_at
     FROM control_job_runs
     WHERE request_id=?
       AND job_key=?
       AND status='running'
       AND finished_at IS NULL
       AND datetime(started_at) <= datetime(CURRENT_TIMESTAMP, '-90 seconds')
     ORDER BY datetime(started_at) DESC
     LIMIT 20`,
    row.request_id, row.job_key
  );

  let nextInput = parseJsonSafeText(row.input_json || '{}', {});
  if (!nextInput || typeof nextInput !== 'object') nextInput = {};
  const partialOutput = latestPartial && latestPartial.output_json ? parseJsonSafeText(latestPartial.output_json, {}) : {};
  if ((!nextInput.mode && !nextInput.next_mode) && partialOutput && partialOutput.next_input && typeof partialOutput.next_input === 'object') {
    nextInput = { ...partialOutput.next_input };
  }
  if (row.job_key === 'player-baseline-hp') {
    nextInput.mode = nextInput.mode || nextInput.next_mode || 'history_only_baseline_hp_enrichment';
  } else {
    nextInput.mode = nextInput.mode || nextInput.next_mode || 'history_only_layer_1_sanity_baseline';
  }
  nextInput.request_id = row.request_id;
  nextInput.chain_id = row.chain_id;
  nextInput.job_key = row.job_key;
  nextInput.worker_name = row.worker_name;
  nextInput.stale_running_auto_resume = true;
  nextInput.stale_running_auto_resume_version = SYSTEM_VERSION;
  nextInput.stale_running_auto_resume_trigger = trigger;
  nextInput.stale_running_auto_resume_at = new Date().toISOString();
  if (latestPartial && latestPartial.run_id) nextInput.resume_from_partial_run_id = latestPartial.run_id;

  const output = {
    ok: true,
    data_ok: true,
    version: SYSTEM_VERSION,
    processed_by: WORKER_NAME,
    worker_name: row.worker_name,
    job_key: row.job_key,
    request_id: row.request_id,
    chain_id: row.chain_id,
    status: 'PLAYER_BASELINE_STALE_RUNNING_DISPATCH_AUTO_RESUMED',
    certification: 'PLAYER_BASELINE_STALE_RUNNING_DISPATCH_AUTO_RESUMED',
    certification_grade: 'RECOVERED_PARTIAL_CONTINUE',
    stale_running_auto_resume: true,
    stale_threshold_seconds: 90,
    previous_status: row.status,
    previous_updated_at: row.updated_at,
    previous_run_after: row.run_after,
    latest_partial_run_id: latestPartial && latestPartial.run_id || null,
    latest_partial_finished_at: latestPartial && latestPartial.finished_at || null,
    stale_running_run_ids: staleRuns.map(r => r.run_id),
    resume_mode: nextInput.mode || null,
    resume_batch_id: nextInput.batch_id || null,
    resume_last_player_id: nextInput.last_player_id || null,
    history_only: true,
    no_daily_live_context: true,
    no_market_context: true,
    no_external_api_calls: true,
    no_scoring: true,
    no_final_board: true,
    no_prepared_board_mutation: true
  };

  await run(env.CONTROL_DB,
    `UPDATE control_job_runs
        SET status='failed_stale_auto_recovered',
            data_ok=0,
            certification_status='PLAYER_BASELINE_STALE_RUNNING_DISPATCH_AUTO_RESUMED',
            finished_at=CURRENT_TIMESTAMP,
            elapsed_ms=CASE WHEN started_at IS NOT NULL THEN CAST((julianday(CURRENT_TIMESTAMP)-julianday(started_at))*86400000 AS INTEGER) ELSE 0 END,
            output_json=?,
            error_code='player_baseline_stale_running_dispatch_auto_resumed',
            error_message='Stale running Player Baseline dispatch was auto-closed so same queue row can resume from last safe continuation input.'
      WHERE request_id=?
        AND job_key=?
        AND status='running'
        AND finished_at IS NULL
        AND datetime(started_at) <= datetime(CURRENT_TIMESTAMP, '-90 seconds')`,
    safeStringifyD1(output), row.request_id, row.job_key
  );

  await run(env.CONTROL_DB,
    `UPDATE control_job_queue
        SET status='pending',
            run_after=CURRENT_TIMESTAMP,
            finished_at=NULL,
            updated_at=CURRENT_TIMESTAMP,
            input_json=?,
            output_json=?,
            error_code=NULL,
            error_message=NULL
      WHERE request_id=?
        AND job_key IN ('player-baseline-sanity','player-baseline-hp')
        AND worker_name='alphadog-v2-phase2b-pitcher-role'
        AND status='running'
        AND finished_at IS NULL`,
    safeStringifyD1(nextInput), safeStringifyD1(output), row.request_id
  );

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'WARN', 'player_baseline_stale_running_dispatch_auto_resumed', 'Auto-recovered stale running Player Baseline queue row back to pending from last safe continuation input; no manual SQL rescue required', ?, CURRENT_TIMESTAMP)",
    row.request_id, WORKER_NAME, row.job_key, JSON.stringify(output).slice(0, 9000)
  );

  return {
    request_id: row.request_id,
    chain_id: row.chain_id,
    job_key: row.job_key,
    worker_name: row.worker_name,
    status: 'pending',
    tick_count: row.tick_count,
    input_json: safeStringifyD1(nextInput)
  };
}


async function processOneUnlocked(env, trigger) {
  // v0.2.160: Delta Full Run owns its own backend continuation path.
  // Prefer due same-chain Delta Full Run children, then the parent, before generic
  // queue work. Running children are not blindly redispatched; the parent owns
  // stale-running detection, trusted Calendar/Tally batch recovery, and retry
  // replacement for all 11 Delta Full Run child stages. The 5-minute cron remains
  // a starter/backup, not the normal stage pump.
  let row = await first(env.CONTROL_DB,
    `SELECT c.request_id, c.chain_id, c.job_key, c.worker_name, c.status, c.tick_count, c.input_json
     FROM control_job_queue p
     JOIN control_job_queue c ON c.parent_request_id = p.request_id AND c.chain_id = p.chain_id
     WHERE p.job_key='incremental-morning-full-run'
       AND p.worker_name='alphadog-v2-orchestrator'
       AND p.status IN ('pending','running','partial_continue')
       AND p.finished_at IS NULL
       AND c.status IN ('pending','partial_continue')
       AND c.finished_at IS NULL
       AND datetime(COALESCE(c.run_after, CURRENT_TIMESTAMP)) <= datetime(CURRENT_TIMESTAMP)
     ORDER BY datetime(COALESCE(c.run_after, CURRENT_TIMESTAMP)) ASC, datetime(c.created_at) ASC
     LIMIT 1`
  );

  if (!row) {
    row = await first(env.CONTROL_DB,
      `SELECT request_id, chain_id, job_key, worker_name, status, tick_count, input_json
       FROM control_job_queue
       WHERE job_key='incremental-morning-full-run'
         AND worker_name='alphadog-v2-orchestrator'
         AND status IN ('pending','running','partial_continue')
         AND finished_at IS NULL
         AND datetime(COALESCE(run_after, CURRENT_TIMESTAMP)) <= datetime(CURRENT_TIMESTAMP)
       ORDER BY datetime(COALESCE(run_after, CURRENT_TIMESTAMP)) ASC, datetime(created_at) ASC
       LIMIT 1`
    );
  }


  // v0.2.208: When Daily Full Run is active, prefer due grandchildren of its
  // component full-run child before reselecting the component parent. Root cause:
  // v0.2.207 correctly let Daily Full own the outer order, but its direct-child
  // selector kept choosing the Daily Context parent while that parent was already
  // waiting on a due inner child (for example daily-certifier). The parent then
  // observed WAITING_ON_CHILD repeatedly until its stale-child guard failed a
  // child that had never been dispatched. This preserves the hard parent boundary
  // and only changes hot-drain selection priority: runnable inner child first,
  // then component parent observation/advance.
  if (!row) {
    row = await first(env.CONTROL_DB,
      `SELECT gc.request_id, gc.chain_id, gc.job_key, gc.worker_name, gc.status, gc.tick_count, gc.input_json
       FROM control_job_queue gp
       JOIN control_job_queue p ON p.parent_request_id = gp.request_id AND p.chain_id = gp.chain_id
       JOIN control_job_queue gc ON gc.parent_request_id = p.request_id AND gc.chain_id = p.chain_id
       WHERE gp.job_key='daily-full-run'
         AND gp.worker_name='alphadog-v2-orchestrator'
         AND gp.status IN ('pending','running','partial_continue')
         AND gp.finished_at IS NULL
         AND p.job_key IN ('daily-context-full-run','board-full-run','market-scoring-full-run')
         AND p.worker_name='alphadog-v2-orchestrator'
         AND p.status IN ('pending','running','partial_continue')
         AND p.finished_at IS NULL
         AND gc.status IN ('pending','partial_continue')
         AND gc.finished_at IS NULL
         AND datetime(COALESCE(gc.run_after, CURRENT_TIMESTAMP)) <= datetime(CURRENT_TIMESTAMP)
       ORDER BY datetime(COALESCE(gc.run_after, CURRENT_TIMESTAMP)) ASC, datetime(gc.created_at) ASC
       LIMIT 1`
    );
    if (row) {
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'INFO', 'daily_full_run_grandchild_selected_before_component_parent', 'Selected due inner full-run child before reselecting Daily Full component parent', ?, CURRENT_TIMESTAMP)",
        row.request_id, WORKER_NAME, row.job_key, JSON.stringify({ trigger, selected_request_id: row.request_id, selected_job_key: row.job_key, selected_worker_name: row.worker_name, daily_full_run_grandchild_hot_priority_v0_2_208: true, preserves_parent_boundary: true, no_new_child_created: true, version: SYSTEM_VERSION })
      );
    }
  }

  // v0.2.207: Hot-drain top-level Daily Full Run before its component chains.
  // This parent owns the day-level order: Daily Context Full Run, Board Full Run,
  // then Market/Scoring Full Run. Children remain hard parent boundaries; this
  // selector only ensures the parent can enqueue/observe the next component without cron/manual wake.
  if (!row) {
    row = await first(env.CONTROL_DB,
      `SELECT c.request_id, c.chain_id, c.job_key, c.worker_name, c.status, c.tick_count, c.input_json
       FROM control_job_queue p
       JOIN control_job_queue c ON c.parent_request_id = p.request_id AND c.chain_id = p.chain_id
       WHERE p.job_key='daily-full-run'
         AND p.worker_name='alphadog-v2-orchestrator'
         AND p.status IN ('pending','running','partial_continue')
         AND p.finished_at IS NULL
         AND c.status IN ('pending','partial_continue')
         AND c.finished_at IS NULL
         AND datetime(COALESCE(c.run_after, CURRENT_TIMESTAMP)) <= datetime(CURRENT_TIMESTAMP)
       ORDER BY datetime(COALESCE(c.run_after, CURRENT_TIMESTAMP)) ASC, datetime(c.created_at) ASC
       LIMIT 1`
    );
  }

  if (!row) {
    row = await first(env.CONTROL_DB,
      `SELECT request_id, chain_id, job_key, worker_name, status, tick_count, input_json
       FROM control_job_queue
       WHERE job_key='daily-full-run'
         AND worker_name='alphadog-v2-orchestrator'
         AND status IN ('pending','partial_continue')
         AND finished_at IS NULL
         AND datetime(COALESCE(run_after, CURRENT_TIMESTAMP)) <= datetime(CURRENT_TIMESTAMP)
       ORDER BY datetime(COALESCE(run_after, CURRENT_TIMESTAMP)) ASC, datetime(created_at) ASC
       LIMIT 1`
    );
  }

  // v0.2.146: Hot-drain Daily Context Full Run before generic queue work.
  // This copies the Board/Incremental intent but fixes the Daily-specific pacing
  // failure where due same-chain children waited for cron while unrelated or
  // older rows could be selected first.
  if (!row) {
    row = await first(env.CONTROL_DB,
      `SELECT c.request_id, c.chain_id, c.job_key, c.worker_name, c.status, c.tick_count, c.input_json
       FROM control_job_queue p
       JOIN control_job_queue c ON c.parent_request_id = p.request_id AND c.chain_id = p.chain_id
       WHERE p.job_key='daily-context-full-run'
         AND p.worker_name='alphadog-v2-orchestrator'
         AND p.status IN ('pending','running','partial_continue')
         AND p.finished_at IS NULL
         AND c.status IN ('pending','partial_continue')
         AND c.finished_at IS NULL
         AND datetime(COALESCE(c.run_after, CURRENT_TIMESTAMP)) <= datetime(CURRENT_TIMESTAMP)
       ORDER BY datetime(COALESCE(c.run_after, CURRENT_TIMESTAMP)) ASC, datetime(c.created_at) ASC
       LIMIT 1`
    );
  }

  if (!row) {
    row = await first(env.CONTROL_DB,
      `SELECT request_id, chain_id, job_key, worker_name, status, tick_count, input_json
       FROM control_job_queue
       WHERE job_key='daily-context-full-run'
         AND worker_name='alphadog-v2-orchestrator'
         AND status IN ('pending','partial_continue')
         AND finished_at IS NULL
         AND datetime(COALESCE(run_after, CURRENT_TIMESTAMP)) <= datetime(CURRENT_TIMESTAMP)
       ORDER BY datetime(COALESCE(run_after, CURRENT_TIMESTAMP)) ASC, datetime(created_at) ASC
       LIMIT 1`
    );
  }

  // v0.2.183: Market Full running player-prop child rescue must be BEFORE the
  // Market Full parent pending selector. If the parent row is selected first, it
  // only observes the child as active/waiting and this rescue is never reached.
  // This is scoped to the Market Full player-prop context child only; it re-runs
  // the same request_id so the classifier can terminal-finalize from already
  // written MARKET_DB evidence rows without creating a duplicate child.
  if (!row) {
    row = await first(env.CONTROL_DB,
      `SELECT c.request_id, c.chain_id, c.job_key, c.worker_name, c.status, c.tick_count, c.input_json
       FROM control_job_queue c
       JOIN control_job_queue p ON p.request_id = c.parent_request_id AND p.chain_id = c.chain_id
       WHERE p.job_key='market-scoring-full-run'
         AND p.worker_name='alphadog-v2-orchestrator'
         AND p.status IN ('pending','running','partial_continue')
         AND p.finished_at IS NULL
         AND c.parent_request_id IS NOT NULL
         AND c.job_key='market-line-shape-classifier'
         AND c.worker_name='alphadog-v2-market-line-shape-classifier'
         AND c.status='running'
         AND c.finished_at IS NULL
         AND datetime(c.updated_at) <= datetime(CURRENT_TIMESTAMP, '-20 seconds')
       ORDER BY datetime(c.updated_at) ASC
       LIMIT 1`
    );
    if (row) {
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'WARN', 'market_scoring_full_run_player_prop_child_pre_parent_rescued_as_due', 'Recovered running Market Full player-prop child before parent selection so worker can terminal-finalize from evidence rows', ?, CURRENT_TIMESTAMP)",
        row.request_id, WORKER_NAME, row.job_key, JSON.stringify({ request_id: row.request_id, previous_status: row.status, trigger, stale_threshold_seconds: 20, market_scoring_player_prop_pre_parent_terminal_rescue_v0_2_183: true, no_new_child_created: true, expected_worker_evidence_finalizer: true })
      );
    }
  }

  // v0.2.211: Hit Probability can finish HP current rows and then stall before HP board terminalization.
  // If the current batch is complete but hp_board_batches is missing, requeue the same child
  // so the v0.4.18 fast HP-board terminalizer can finish without creating duplicate children.
  if (!row) {
    row = await rescueHitProbabilityCurrentReadyForHpBoardChild(env, trigger);
  }

  // v0.2.184: Before selecting the Market Full parent again, first terminalize
  // active player-prop children that already wrote quiet MARKET_DB evidence rows.
  // This avoids waiting for a stale-running timeout when a service-binding worker
  // returned only a heartbeat but completed its evidence writes in the background.
  if (!row) {
    row = await rescueMarketScoringFullRunTerminalEvidenceChild(env, trigger);
  }

  // v0.2.174: Hot-drain Market/Factors/Matrix/Scoring Full Run before generic queue work.
  // This mirrors Daily Context and Incremental Morning Full Run: same-chain children are
  // preferred over unrelated pending work, and the parent remains the stage driver.
  // Board refresh is intentionally not part of this chain.
  if (!row) {
    row = await first(env.CONTROL_DB,
      `SELECT c.request_id, c.chain_id, c.job_key, c.worker_name, c.status, c.tick_count, c.input_json
       FROM control_job_queue p
       JOIN control_job_queue c ON c.parent_request_id = p.request_id AND c.chain_id = p.chain_id
       WHERE p.job_key='market-scoring-full-run'
         AND p.worker_name='alphadog-v2-orchestrator'
         AND p.status IN ('pending','running','partial_continue')
         AND p.finished_at IS NULL
         AND c.status IN ('pending','partial_continue')
         AND c.finished_at IS NULL
         AND datetime(COALESCE(c.run_after, CURRENT_TIMESTAMP)) <= datetime(CURRENT_TIMESTAMP)
       ORDER BY datetime(COALESCE(c.run_after, CURRENT_TIMESTAMP)) ASC, datetime(c.created_at) ASC
       LIMIT 1`
    );
  }

  if (!row) {
    row = await first(env.CONTROL_DB,
      `SELECT request_id, chain_id, job_key, worker_name, status, tick_count, input_json
       FROM control_job_queue
       WHERE job_key='market-scoring-full-run'
         AND worker_name='alphadog-v2-orchestrator'
         AND status IN ('pending','partial_continue')
         AND finished_at IS NULL
         AND datetime(COALESCE(run_after, CURRENT_TIMESTAMP)) <= datetime(CURRENT_TIMESTAMP)
       ORDER BY datetime(COALESCE(run_after, CURRENT_TIMESTAMP)) ASC, datetime(created_at) ASC
       LIMIT 1`
    );
  }

  // v0.2.238: Player Baseline Sanity / Baseline HP are daily/scheduled, self-continuing, history-only
  // workers. If a service-binding dispatch is interrupted after the queue row is marked
  // running, automatically close the stale ORCHESTRATOR_DISPATCH_STARTED run and return
  // the same queue row to pending from its last safe continuation input. This is the
  // permanent no-band-aid version of the manual stale-running rescue.
  if (!row) {
    row = await rescueStalePlayerBaselineRunningJobForResume(env, trigger);
  }

  if (!row) {
    row = await first(env.CONTROL_DB,
      "SELECT request_id, chain_id, job_key, worker_name, status, tick_count, input_json FROM control_job_queue WHERE status='pending' AND datetime(COALESCE(run_after, CURRENT_TIMESTAMP)) <= datetime(CURRENT_TIMESTAMP) ORDER BY priority ASC, datetime(created_at) ASC LIMIT 1"
    );
  }

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

  // v0.2.159: Do not redispatch RUNNING Delta Full Run children from the generic
  // due selector. The parent is the stage driver: it waits, validates, and for
  // Calendar/Tally auto-finalizes from TEAM_DB.mlb_game_coverage_batches if the
  // child produced trusted proof but CONTROL_DB finalization was lost. This avoids
  // duplicate certifier executions and keeps cron as backup only.

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


  // v0.2.144: Daily Context Full Run must use the same hot-continuation rescue
  // pattern as Board Full Run and Incremental Morning Full Run. A bounded tick can
  // be interrupted after a Daily Context parent or child queue row is marked
  // running but before the parent writes its next terminal partial/completed/failed
  // state. Without this scoped rescue, the queue can show no due work while the
  // Daily Context lock remains held. This rescue is scoped only to Daily Context
  // Full Run parent/child rows and does not affect Board Full Run, Incremental
  // Morning Full Run, static, market, score prep, or individual daily workers.
  if (!row) {
    row = await first(env.CONTROL_DB,
      `SELECT p.request_id, p.chain_id, p.job_key, p.worker_name, p.status, p.tick_count, p.input_json
       FROM control_job_queue c
       JOIN control_job_queue p ON p.request_id = c.parent_request_id
       WHERE p.job_key='daily-context-full-run'
         AND p.worker_name='alphadog-v2-orchestrator'
         AND p.status IN ('pending','running','partial_continue')
         AND p.finished_at IS NULL
         AND c.parent_request_id IS NOT NULL
         AND c.status='running'
         AND c.finished_at IS NULL
         AND datetime(c.updated_at) <= datetime(CURRENT_TIMESTAMP, '-20 seconds')
       ORDER BY datetime(c.updated_at) ASC
       LIMIT 1`
    );
    if (row) {
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'INFO', 'daily_context_full_run_child_running_rescued_as_due', 'Recovered Daily Context Full Run parent as due work so stale child can be recovered from sidecar instead of redispatched', ?, CURRENT_TIMESTAMP)",
        row.request_id, WORKER_NAME, row.job_key, JSON.stringify({ request_id: row.request_id, previous_status: row.status, trigger, daily_context_parent_sidecar_recovery_v0_2_197: true })
      );
    }
  }

  if (!row) {
    row = await first(env.CONTROL_DB,
      `SELECT request_id, chain_id, job_key, worker_name, status, tick_count, input_json
       FROM control_job_queue
       WHERE job_key='daily-context-full-run'
         AND worker_name='alphadog-v2-orchestrator'
         AND status='running'
         AND finished_at IS NULL
         AND datetime(updated_at) <= datetime(CURRENT_TIMESTAMP, '-20 seconds')
       ORDER BY datetime(updated_at) ASC
       LIMIT 1`
    );
    if (row) {
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'INFO', 'daily_context_full_run_running_parent_rescued_as_due', 'Recovered running Daily Context Full Run parent row as due work for backend continuation', ?, CURRENT_TIMESTAMP)",
        row.request_id, WORKER_NAME, row.job_key, JSON.stringify({ request_id: row.request_id, previous_status: row.status, trigger, daily_context_parent_hot_rescue_v0_2_144: true })
      );
    }
  }


  // v0.2.182: Market Full player-prop stages are intentionally backend timeboxed.
  // If the service-binding response is interrupted after evidence rows are written,
  // redispatch the same child quickly so the worker can terminal-finalize from its
  // own MARKET_DB evidence instead of leaving the parent waiting for the 12-minute
  // generic long-stage stale window. Scoped to market-line-shape-classifier only.
  if (!row) {
    row = await first(env.CONTROL_DB,
      `SELECT c.request_id, c.chain_id, c.job_key, c.worker_name, c.status, c.tick_count, c.input_json
       FROM control_job_queue c
       JOIN control_job_queue p ON p.request_id = c.parent_request_id AND p.chain_id = c.chain_id
       WHERE p.job_key='market-scoring-full-run'
         AND p.worker_name='alphadog-v2-orchestrator'
         AND p.status IN ('pending','running','partial_continue')
         AND p.finished_at IS NULL
         AND c.parent_request_id IS NOT NULL
         AND c.job_key='market-line-shape-classifier'
         AND c.worker_name='alphadog-v2-market-line-shape-classifier'
         AND c.status='running'
         AND c.finished_at IS NULL
         AND datetime(c.updated_at) <= datetime(CURRENT_TIMESTAMP, '-20 seconds')
       ORDER BY datetime(c.updated_at) ASC
       LIMIT 1`
    );
    if (row) {
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'WARN', 'market_scoring_full_run_player_prop_child_rescued_as_due', 'Recovered running Market Full player-prop child as due so worker can terminal-finalize from evidence rows', ?, CURRENT_TIMESTAMP)",
        row.request_id, WORKER_NAME, row.job_key, JSON.stringify({ request_id: row.request_id, previous_status: row.status, trigger, stale_threshold_seconds: 20, market_scoring_player_prop_terminal_rescue_v0_2_182: true, no_new_child_created: true, expected_worker_evidence_finalizer: true })
      );
    }
  }

  // v0.2.174: Market Scoring Full Run running-row rescue.
  // External market stages and scoring simulation can run longer than daily context
  // workers, so the child stale threshold is deliberately two minutes to avoid
  // duplicate external calls during legitimate runs. Once stale, the same row is
  // treated as due again so backend auto-pump/cron can recover without manual Wake.
  if (!row) {
    row = await first(env.CONTROL_DB,
      `SELECT c.request_id, c.chain_id, c.job_key, c.worker_name, c.status, c.tick_count, c.input_json
       FROM control_job_queue c
       JOIN control_job_queue p ON p.request_id = c.parent_request_id AND p.chain_id = c.chain_id
       WHERE p.job_key='market-scoring-full-run'
         AND p.worker_name='alphadog-v2-orchestrator'
         AND p.status IN ('pending','running','partial_continue')
         AND p.finished_at IS NULL
         AND c.parent_request_id IS NOT NULL
         AND c.status='running'
         AND c.finished_at IS NULL
         AND datetime(c.updated_at) <= datetime(CURRENT_TIMESTAMP, '-12 minutes')
       ORDER BY datetime(c.updated_at) ASC
       LIMIT 1`
    );
    if (row) {
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'WARN', 'market_scoring_full_run_child_running_rescued_as_due', 'Recovered stale running Market Scoring Full Run child row as due work for backend continuation', ?, CURRENT_TIMESTAMP)",
        row.request_id, WORKER_NAME, row.job_key, JSON.stringify({ request_id: row.request_id, previous_status: row.status, trigger, stale_threshold_minutes: 12, market_scoring_child_hot_rescue_v0_2_176: true, no_duplicate_dispatch_before_long_stage_grace_window: true, no_manual_wake_required: true, board_refresh_not_in_chain: true })
      );
    }
  }

  if (!row) {
    row = await first(env.CONTROL_DB,
      `SELECT request_id, chain_id, job_key, worker_name, status, tick_count, input_json
       FROM control_job_queue
       WHERE job_key='market-scoring-full-run'
         AND worker_name='alphadog-v2-orchestrator'
         AND status='running'
         AND finished_at IS NULL
         AND datetime(updated_at) <= datetime(CURRENT_TIMESTAMP, '-20 seconds')
       ORDER BY datetime(updated_at) ASC
       LIMIT 1`
    );
    if (row) {
      await run(env.CONTROL_DB,
        "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'INFO', 'market_scoring_full_run_running_parent_rescued_as_due', 'Recovered running Market Scoring Full Run parent row as due work for backend continuation', ?, CURRENT_TIMESTAMP)",
        row.request_id, WORKER_NAME, row.job_key, JSON.stringify({ request_id: row.request_id, previous_status: row.status, trigger, market_scoring_parent_hot_rescue_v0_2_174: true, no_manual_wake_required: true, board_refresh_not_in_chain: true })
      );
    }
  }

  if (!row) {
    return { status: "no_due_jobs" };
  }

  const claim = await claimSelectedQueueRowForDispatch(env, row, trigger);
  if (!claim || claim.claimed !== true) {
    return { status: "no_due_jobs_atomic_claim_lost", request_id: row.request_id, reason: claim && claim.reason || "claim_not_acquired", latest: claim && claim.latest || null, version: SYSTEM_VERSION, atomic_dispatch_claim_guard_v0_2_218: true };
  }

  const runId = rid("run");

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'real_orchestrator_tick_started', 'Real orchestrator backend tick started one job', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ trigger, row })
  );
  await run(env.CONTROL_DB,
    "INSERT OR IGNORE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'running', 0, 'ORCHESTRATOR_DISPATCH_STARTED', 0, 0, 0, CURRENT_TIMESTAMP, NULL, NULL, ?, NULL, NULL, NULL)",
    runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(parseJsonSafeText(row.input_json || "{}", {}))
  );

  await run(env.CONTROL_DB,
    "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'INFO', 'orchestrator_dispatch_run_registered', 'Registered control_job_runs dispatch-start row before service-binding worker fetch', ?, CURRENT_TIMESTAMP)",
    row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify({ trigger, row, dispatch_started_v0_2_160: true, protects_against_no_run_row_on_fetch_hang: true })
  );

  try {
  if (isMarketContextSourceProbeJob(row)) {
    const output = await processMarketContextSourceProbeJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_market_teams_game_odds_job" : "failed_one_market_teams_game_odds_job",
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }



  if (isMarketHitterPropContextJob(row)) {
    const output = await processMarketHitterPropContextJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? (output.prop_family === "pitcher" || (output.output_json && output.output_json.parlay_api && output.output_json.mode === "market_pitcher_prop_line_context") ? "completed_one_market_pitcher_prop_context_job" : "completed_one_market_hitter_prop_context_job") : (output && (output.prop_family === "pitcher" || (output.output_json && output.output_json.mode === "market_pitcher_prop_line_context")) ? "failed_one_market_pitcher_prop_context_job" : "failed_one_market_hitter_prop_context_job"),
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }


  if (isOddsApiHitterPropContextJob(row)) {
    const output = await processOddsApiHitterPropContextJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_oddsapi_hitter_prop_context_job" : "failed_one_oddsapi_hitter_prop_context_job",
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }

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


  if (isDailyProbablePitchersJob(row)) {
    const output = await processDailyProbablePitchersJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_daily_starters_job" : "failed_one_daily_starters_job",
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }


  if (isDailyPlayerAvailabilityJob(row)) {
    const output = await processDailyPlayerAvailabilityJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_daily_player_availability_job" : "failed_one_daily_player_availability_job",
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }


  if (isDailyWeatherJob(row)) {
    const output = await processDailyWeatherJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_daily_weather_job" : "failed_one_daily_weather_job",
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }



  if (isDailyTeamScheduleSpotJob(row)) {
    const output = await processDailyTeamScheduleSpotJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_daily_team_schedule_spot_job" : "failed_one_daily_team_schedule_spot_job",
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }

  if (isDailyBullpenAvailabilityJob(row)) {
    const output = await processDailyBullpenAvailabilityJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_daily_bullpen_availability_job" : "failed_one_daily_bullpen_availability_job",
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }

  if (isDailyUmpireContextJob(row)) {
    const output = await processDailyUmpireContextJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_daily_umpire_context_job" : "failed_one_daily_umpire_context_job",
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }

  if (isDailyContextCertifierJob(row)) {
    const output = await processDailyContextCertifierJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_daily_context_certifier_job" : "failed_one_daily_context_certifier_job",
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }

  if (isDailyLineupsJob(row)) {
    const output = await processDailyLineupsJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_daily_lineups_source_probe_job" : "failed_one_daily_lineups_source_probe_job",
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
    const partial = isPartialContinueOutput(output) || rawStatus === "source_shape_probe_partial_continue";
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
    const partial = isPartialContinueOutput(output);
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
    const partial = isPartialContinueOutput(output);
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
    const partial = isPartialContinueOutput(output) || rawStatus === "source_shape_probe_partial_continue";
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
    const partial = isPartialContinueOutput(output) || rawStatus === "source_shape_probe_partial_continue";
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
    const partial = isPartialContinueOutput(output) || rawStatus === "source_shape_probe_partial_continue";
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
    const partial = isPartialContinueOutput(output);
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
      status: output && output.ok && output.data_ok ? "completed_one_delta_certifier_job" : "failed_one_delta_certifier_job",
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


  if (isDailyFullRunJob(row)) {
    const output = await processDailyFullRunJob(env, row, runId, trigger);
    const rawStatus = String((output && output.status) || "").toLowerCase();
    const status = rawStatus.includes("partial_continue") || output && output.orchestrator_should_self_continue
      ? "partial_continue_daily_full_run_job"
      : (output && output.ok ? "completed_one_daily_full_run_job" : "failed_one_daily_full_run_job");
    return { status, request_id: row.request_id, run_id: runId, output };
  }

  if (isMarketScoringFullRunJob(row)) {
    const output = await processMarketScoringFullRunJob(env, row, runId, trigger);
    const rawStatus = String((output && output.status) || "").toLowerCase();
    const status = rawStatus.includes("partial_continue") || output && output.orchestrator_should_self_continue
      ? "partial_continue_market_scoring_full_run_job"
      : (output && output.ok ? "completed_one_market_scoring_full_run_job" : "failed_one_market_scoring_full_run_job");
    return { status, request_id: row.request_id, run_id: runId, output };
  }

  if (isBoardFullRunJob(row)) {
    const output = await processBoardFullRunJob(env, row, runId, trigger);
    const rawStatus = String((output && output.status) || "").toLowerCase();
    const status = rawStatus.includes("partial_continue") || output && output.orchestrator_should_self_continue
      ? "partial_continue_board_full_run_job"
      : (output && output.ok ? "completed_one_board_full_run_job" : "failed_one_board_full_run_job");
    return { status, request_id: row.request_id, run_id: runId, output };
  }

  if (isDailyContextFullRunJob(row)) {
    const output = await processDailyContextFullRunJob(env, row, runId, trigger);
    const rawStatus = String((output && output.status) || "").toLowerCase();
    const status = rawStatus.includes("partial_continue") || output && output.orchestrator_should_self_continue
      ? "partial_continue_daily_context_full_run_job"
      : (output && output.ok ? "completed_one_daily_context_full_run_job" : "failed_one_daily_context_full_run_job");
    return { status, request_id: row.request_id, run_id: runId, output };
  }

  if (isPlayerBaselineSanityJob(row)) {
    const output = await processPlayerBaselineSanityJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_player_baseline_sanity_job" : "failed_one_player_baseline_sanity_job",
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }

  if (isPropFactorMinerJob(row)) {
    const output = await processPropFactorMinerJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_prop_factor_miner_job" : "failed_one_prop_factor_miner_job",
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }

  if (isPropMatrixBuilderJob(row)) {
    const output = await processPropMatrixBuilderJob(env, row, runId, trigger);
    const partial = isPartialContinueOutput(output);
    return {
      status: partial ? "partial_continue_prop_matrix_builder_job" : (output && output.ok ? "completed_one_prop_matrix_builder_job" : "failed_one_prop_matrix_builder_job"),
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }

  if (isScoringEngineJob(row)) {
    const output = await processScoringEngineJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_scoring_engine_job" : "failed_one_scoring_engine_job",
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }

  if (isScorePrepJob(row)) {
    const output = await processScorePrepJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_score_prep_job" : "failed_one_score_prep_job",
      request_id: row.request_id,
      run_id: runId,
      output
    };
  }

  if (isScoreFinalBoardJob(row)) {
    const output = await processScoreFinalBoardJob(env, row, runId, trigger);
    return {
      status: output && output.ok ? "completed_one_score_final_board_job" : "failed_one_score_final_board_job",
      request_id: row.request_id,
      run_id: runId,
      output
    };
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
      note: "v0.2.32 only processes safe system-health, exact market-source-health, exact prizepicks-github-board, exact parlay-sleeper-board source-probe, exact board-full-run backend chain, exact base-hitter-game-logs self-continuing base_backfill, exact base-hitter-splits base promotion and delta no-op/restore gate with backend hot continuation, exact base-hitter-metrics v0.4.1 snapshot promote/retained-stage delta repair dispatch, exact base-pitcher-metrics v0.4.1 snapshot delta-repair/snapshot-promote/snapshot-prep/full-stage dispatch, exact base-pitcher-game-logs base/delta continuation with bounded tick recovery, exact active static workers, exact static-certifier, exact delta-certifier calendar/tally, exact score-final-board generator, exact market-scoring-full-run backend chain, and exact static-full-run jobs. Generic dispatch remains blocked. Base Hitter and Base Hitter Splits promotion/delta hot continuation use backend waitUntil, not browser pump; cron is rescue only. Base Pitcher supports locked base promotion and delta_update retained-stage continuation; base promotion makes no MLB calls, delta uses MLB StatsAPI only after base integrity gate."
    };

    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'blocked', 0, 'blocked_safe_shell', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'unsupported_job_in_v0_2_32', 'Only safe system-health, exact market-source-health, exact prizepicks-github-board, exact parlay-sleeper-board source-probe, exact board-full-run backend chain, exact base-hitter-game-logs self-continuing base_backfill, exact base-hitter-splits base promotion and delta no-op/restore gate with backend hot continuation, exact base-hitter-metrics v0.4.1 snapshot promote/retained-stage delta repair dispatch, exact base-pitcher-metrics v0.4.1 snapshot delta-repair/snapshot-promote/snapshot-prep/full-stage dispatch, exact base-pitcher-game-logs base/delta continuation with bounded tick recovery, exact active static workers, exact static-certifier, exact delta-certifier calendar/tally, exact market-scoring-full-run backend chain, and exact static-full-run jobs are enabled in orchestrator v0.2.174')",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(row), JSON.stringify(output)
    );

    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='blocked', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='unsupported_job_in_v0_2_32', error_message='Only safe system-health, exact market-source-health, exact prizepicks-github-board, exact parlay-sleeper-board source-probe, exact board-full-run backend chain, exact base-hitter-game-logs self-continuing base_backfill, exact base-hitter-splits base promotion and delta no-op/restore gate with backend hot continuation, exact base-hitter-metrics v0.4.1 snapshot promote/retained-stage delta repair dispatch, exact base-pitcher-metrics v0.4.1 snapshot delta-repair/snapshot-promote/snapshot-prep/full-stage dispatch, exact base-pitcher-game-logs base/delta continuation with bounded tick recovery, exact active static workers, exact static-certifier, exact delta-certifier calendar/tally, exact market-scoring-full-run backend chain, and exact static-full-run jobs are enabled in orchestrator v0.2.174' WHERE request_id=?",
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
  } catch (err) {
    const message = String(err && err.message ? err.message : err).slice(0, 900);
    const output = {
      ok: false,
      data_ok: false,
      version: SYSTEM_VERSION,
      worker_name: WORKER_NAME,
      job_key: row.job_key,
      request_id: row.request_id,
      chain_id: row.chain_id,
      status: "ORCHESTRATOR_DISPATCH_EXCEPTION_CONTAINED",
      certification: "ORCHESTRATOR_DISPATCH_EXCEPTION_CONTAINED",
      certification_grade: "FAILED",
      error: message,
      trigger,
      process_one_unlocked_dispatch_exception_containment_v0_2_165: true,
      queue_finalized_failed_not_left_running: true
    };
    await run(env.CONTROL_DB,
      "INSERT OR REPLACE INTO control_job_runs (run_id, request_id, chain_id, job_key, worker_name, status, data_ok, certification_status, rows_read, rows_written, external_calls, started_at, finished_at, elapsed_ms, input_json, output_json, error_code, error_message) VALUES (?, ?, ?, ?, ?, 'failed', 0, 'ORCHESTRATOR_DISPATCH_EXCEPTION_CONTAINED', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?, ?, 'orchestrator_dispatch_exception', ?)",
      runId, row.request_id, row.chain_id, row.job_key, row.worker_name, JSON.stringify(parseJsonSafeText(row.input_json || "{}", {})), JSON.stringify(output), message
    );
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='failed', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code='orchestrator_dispatch_exception', error_message=? WHERE request_id=?",
      JSON.stringify(output), message, row.request_id
    );
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, 'ERROR', 'process_one_unlocked_dispatch_exception_contained', 'Contained dispatch exception and finalized queue row failed instead of leaving it running', ?, CURRENT_TIMESTAMP)",
      row.request_id, runId, WORKER_NAME, row.job_key, JSON.stringify(output)
    );
    return { status: "failed_one_dispatch_exception_contained", request_id: row.request_id, run_id: runId, output };
  }
}

async function tick(env, trigger = "manual", maxJobs = 3) {
  let prelockDailyContextRecovery = null;
  try {
    prelockDailyContextRecovery = await recoverDailyContextRunningChildrenFromCompleteSidecarsPreLock(env, trigger);
  } catch (err) {
    prelockDailyContextRecovery = { recovered: 0, error: String(err && err.message ? err.message : err).slice(0, 900) };
    try {
      await run(env.CONTROL_DB, "INSERT INTO control_worker_run_log (worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'orchestrator', 'WARN', 'daily_context_prelock_sidecar_recovery_failed', 'Pre-lock Daily Context sidecar recovery probe failed before acquiring GLOBAL_ORCHESTRATOR', ?, CURRENT_TIMESTAMP)", WORKER_NAME, JSON.stringify({ trigger, error: prelockDailyContextRecovery.error, version: SYSTEM_VERSION }));
    } catch (_) {}
  }
  const owner = rid("owner");
  const lock = await acquireLock(env, owner);

  if (!lock.ok) {
    return base(env, {
      job: "orchestrator_tick",
      status: "lock_busy",
      trigger,
      lock,
      prelock_daily_context_recovery: prelockDailyContextRecovery
    });
  }

  const processed = [];
  try {
    const deltaChildReconcile = await reconcileRunningDeltaFullRunChildrenFromOutput(env, trigger);
    if (deltaChildReconcile.reconciled_pending > 0 || deltaChildReconcile.reconciled_completed > 0) {
      processed.push({ status: "delta_full_run_child_output_reconciled", ...deltaChildReconcile });
    }

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

    const dailyContextCertifierStaleRecovery = await recoverStaleDailyContextCertifierJobs(env, trigger);
    if (dailyContextCertifierStaleRecovery.recovered > 0) {
      processed.push({ status: "stale_daily_context_certifier_recovered", recovered_count: dailyContextCertifierStaleRecovery.recovered });
    }

    const limit = Math.max(1, Math.min(Number(maxJobs || 3), 10));

    for (let i = 0; i < limit; i++) {
      const result = await processOneUnlocked(env, trigger);
      processed.push(result);
      if (result.status === "no_due_jobs") break;
      // v0.2.146: Do not break after Daily Context parent enqueues a child.
      // The next loop must hot-drain the due same-chain child or parent recheck.
      if (result.status === "failed_one_dispatch_exception_contained" || result.status === "blocked_unsupported_job" || result.status === "failed_one_market_teams_game_odds_job" || result.status === "failed_one_market_hitter_prop_context_job" || result.status === "failed_one_market_pitcher_prop_context_job" || result.status === "failed_one_oddsapi_hitter_prop_context_job" || result.status === "failed_one_market_source_health_job" || result.status === "failed_one_prizepicks_github_board_job" || result.status === "failed_one_parlay_sleeper_board_job" || result.status === "failed_one_base_hitter_game_logs_job" || result.status === "failed_one_base_hitter_splits_job" || result.status === "failed_one_base_hitter_metrics_job" || result.status === "failed_one_base_pitcher_game_logs_job" || result.status === "failed_one_base_team_game_logs_job" || result.status === "failed_one_base_pitcher_splits_job" || result.status === "failed_one_base_starter_history_job" || result.status === "failed_one_base_bullpen_history_job" || result.status === "failed_one_static_teams_job" || result.status === "failed_one_static_stadiums_job" || result.status === "failed_one_static_park_factors_job" || result.status === "failed_one_static_players_job" || result.status === "failed_one_static_prop_taxonomy_job" || result.status === "failed_one_static_certifier_job" || result.status === "failed_one_delta_certifier_job" || result.status === "failed_one_static_full_run_job" || result.status === "failed_one_incremental_morning_full_run_job" || result.status === "failed_one_board_full_run_job" || result.status === "failed_one_daily_weather_job" || result.status === "failed_one_daily_bullpen_availability_job" || result.status === "failed_one_daily_team_schedule_spot_job" || result.status === "failed_one_daily_starters_job" || result.status === "failed_one_daily_player_availability_job" || result.status === "failed_one_daily_lineups_source_probe_job" || result.status === "failed_one_daily_game_status_job" || result.status === "failed_one_daily_context_certifier_job" || result.status === "failed_one_daily_context_full_run_job" || result.status === "failed_one_prop_factor_miner_job" || result.status === "failed_one_prop_matrix_builder_job" || result.status === "failed_one_scoring_engine_job" || result.status === "failed_one_score_final_board_job" || result.status === "failed_one_market_scoring_full_run_job") break;
    }

    await releaseLock(env, owner, "IDLE");

    const completed = processed.filter(x => x.status === "completed_one_safe_test_job" || x.status === "completed_one_market_source_health_job" || x.status === "completed_one_market_teams_game_odds_job" || x.status === "completed_one_market_hitter_prop_context_job" || x.status === "completed_one_market_pitcher_prop_context_job" || x.status === "completed_one_oddsapi_hitter_prop_context_job" || x.status === "completed_one_prizepicks_github_board_job" || x.status === "completed_one_parlay_sleeper_board_job" || x.status === "completed_one_base_hitter_game_logs_job" || x.status === "completed_one_base_hitter_splits_job" || x.status === "completed_one_base_hitter_metrics_job" || x.status === "completed_one_base_pitcher_game_logs_job" || x.status === "completed_one_base_team_game_logs_job" || x.status === "completed_one_base_pitcher_splits_job" || x.status === "completed_one_base_starter_history_job" || x.status === "completed_one_base_bullpen_history_job" || x.status === "completed_one_static_teams_job" || x.status === "completed_one_static_stadiums_job" || x.status === "completed_one_static_park_factors_job" || x.status === "completed_one_static_players_job" || x.status === "completed_one_static_prop_taxonomy_job" || x.status === "completed_one_static_certifier_job" || x.status === "completed_one_delta_certifier_job" || x.status === "completed_one_static_full_run_job" || x.status === "completed_one_incremental_morning_full_run_job" || x.status === "completed_one_board_full_run_job" || x.status === "completed_one_daily_weather_job" || x.status === "completed_one_daily_bullpen_availability_job" || x.status === "completed_one_daily_team_schedule_spot_job" || x.status === "completed_one_daily_starters_job" || x.status === "completed_one_daily_player_availability_job" || x.status === "completed_one_daily_lineups_source_probe_job" || x.status === "completed_one_daily_game_status_job" || x.status === "completed_one_daily_context_certifier_job" || x.status === "completed_one_daily_context_full_run_job" || x.status === "completed_one_prop_factor_miner_job" || x.status === "completed_one_prop_matrix_builder_job" || x.status === "completed_one_scoring_engine_job" || x.status === "completed_one_score_final_board_job" || x.status === "completed_one_market_scoring_full_run_job" || x.status === "completed_one_daily_full_run_job").length;
    const partialContinue = processed.filter(x => x.status === "partial_continue_static_full_run_job" || x.status === "partial_continue_incremental_morning_full_run_job" || x.status === "partial_continue_base_hitter_game_logs_job" || x.status === "partial_continue_base_hitter_splits_job" || x.status === "partial_continue_base_hitter_metrics_job" || x.status === "partial_continue_base_pitcher_game_logs_job" || x.status === "partial_continue_base_team_game_logs_job" || x.status === "partial_continue_base_pitcher_splits_job" || x.status === "partial_continue_base_starter_history_job" || x.status === "partial_continue_base_bullpen_history_job" || x.status === "partial_continue_board_full_run_job" || x.status === "partial_continue_daily_context_full_run_job" || x.status === "partial_continue_market_scoring_full_run_job" || x.status === "partial_continue_daily_full_run_job" || x.status === "partial_continue_prop_matrix_builder_job").length;
    const blocked = processed.filter(x => x.status === "failed_one_dispatch_exception_contained" || x.status === "blocked_unsupported_job" || x.status === "failed_one_market_teams_game_odds_job" || x.status === "failed_one_market_hitter_prop_context_job" || x.status === "failed_one_market_pitcher_prop_context_job" || x.status === "failed_one_oddsapi_hitter_prop_context_job" || x.status === "failed_one_market_source_health_job" || x.status === "failed_one_prizepicks_github_board_job" || x.status === "failed_one_parlay_sleeper_board_job" || x.status === "failed_one_base_hitter_game_logs_job" || x.status === "failed_one_base_hitter_splits_job" || x.status === "failed_one_base_hitter_metrics_job" || x.status === "failed_one_base_pitcher_game_logs_job" || x.status === "failed_one_base_team_game_logs_job" || x.status === "failed_one_base_pitcher_splits_job" || x.status === "failed_one_base_starter_history_job" || x.status === "failed_one_base_bullpen_history_job" || x.status === "failed_one_static_teams_job" || x.status === "failed_one_static_stadiums_job" || x.status === "failed_one_static_park_factors_job" || x.status === "failed_one_static_players_job" || x.status === "failed_one_static_prop_taxonomy_job" || x.status === "failed_one_static_certifier_job" || x.status === "failed_one_delta_certifier_job" || x.status === "failed_one_static_full_run_job" || x.status === "failed_one_incremental_morning_full_run_job" || x.status === "failed_one_board_full_run_job" || x.status === "failed_one_daily_weather_job" || x.status === "failed_one_daily_bullpen_availability_job" || x.status === "failed_one_daily_team_schedule_spot_job" || x.status === "failed_one_daily_starters_job" || x.status === "failed_one_daily_player_availability_job" || x.status === "failed_one_daily_lineups_source_probe_job" || x.status === "failed_one_daily_game_status_job" || x.status === "failed_one_daily_context_certifier_job" || x.status === "failed_one_daily_context_full_run_job" || x.status === "failed_one_prop_factor_miner_job" || x.status === "failed_one_prop_matrix_builder_job" || x.status === "failed_one_scoring_engine_job" || x.status === "failed_one_score_final_board_job" || x.status === "failed_one_market_scoring_full_run_job" || x.status === "failed_one_daily_full_run_job").length;
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
    `SELECT COUNT(*) AS c
     FROM control_job_queue
     WHERE finished_at IS NULL
       AND status IN ('pending','running','partial_continue')
       AND (
         (job_key='incremental-morning-full-run' AND worker_name='alphadog-v2-orchestrator')
         OR parent_request_id IN (
           SELECT request_id
           FROM control_job_queue
           WHERE job_key='incremental-morning-full-run'
             AND worker_name='alphadog-v2-orchestrator'
             AND finished_at IS NULL
             AND status IN ('pending','running','partial_continue')
         )
       )`
  );
  return Number(row && row.c ? row.c : 0);
}


async function countDueDailyFullRun(env) {
  const row = await first(env.CONTROL_DB,
    `SELECT COUNT(*) AS c
     FROM control_job_queue
     WHERE finished_at IS NULL
       AND status IN ('pending','running','partial_continue')
       AND (
         (job_key='daily-full-run' AND worker_name='alphadog-v2-orchestrator')
         OR parent_request_id IN (
           SELECT request_id
           FROM control_job_queue
           WHERE job_key='daily-full-run'
             AND worker_name='alphadog-v2-orchestrator'
             AND finished_at IS NULL
             AND status IN ('pending','running','partial_continue')
         )
       )`
  );
  return Number(row && row.c ? row.c : 0);
}

async function countDueMarketScoringFullRun(env) {
  const row = await first(env.CONTROL_DB,
    `SELECT COUNT(*) AS c
     FROM control_job_queue
     WHERE finished_at IS NULL
       AND status IN ('pending','running','partial_continue')
       AND (
         (job_key='market-scoring-full-run' AND worker_name='alphadog-v2-orchestrator')
         OR parent_request_id IN (
           SELECT request_id
           FROM control_job_queue
           WHERE job_key='market-scoring-full-run'
             AND worker_name='alphadog-v2-orchestrator'
             AND finished_at IS NULL
             AND status IN ('pending','running','partial_continue')
         )
       )`
  );
  return Number(row && row.c ? row.c : 0);
}

async function countDueDailyContextFullRun(env) {
  // Count the active Daily Context chain parent and its unfinished children.
  // This is intentionally not limited to run_after due rows: if the parent just
  // inserted a child with a 1-second guard, waitUntil must keep the backend alive
  // instead of letting cron become the normal stage driver.
  const row = await first(env.CONTROL_DB,
    `SELECT COUNT(*) AS c
     FROM control_job_queue
     WHERE finished_at IS NULL
       AND status IN ('pending','running','partial_continue')
       AND (
         (job_key='daily-context-full-run' AND worker_name='alphadog-v2-orchestrator')
         OR parent_request_id IN (
           SELECT request_id
           FROM control_job_queue
           WHERE job_key='daily-context-full-run'
             AND worker_name='alphadog-v2-orchestrator'
             AND finished_at IS NULL
             AND status IN ('pending','running','partial_continue')
         )
       )`
  );
  return Number(row && row.c ? row.c : 0);
}


async function recoverStaleDailyContextCertifierJobs(env, trigger) {
  const staleRows = await all(env.CONTROL_DB,
    "SELECT request_id, chain_id, job_key, worker_name, status, tick_count, started_at, updated_at, substr(output_json,1,900) AS output_preview FROM control_job_queue WHERE job_key='daily-certifier' AND worker_name='alphadog-v2-daily-certifier' AND status='running' AND finished_at IS NULL AND datetime(updated_at) <= datetime('now','-2 minutes') ORDER BY datetime(updated_at) ASC LIMIT 3"
  );

  let recovered = 0;
  for (const row of staleRows) {
    await run(env.CONTROL_DB,
      "UPDATE control_job_queue SET status='pending', run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, error_code=NULL, error_message=NULL WHERE request_id=? AND job_key='daily-certifier' AND worker_name='alphadog-v2-daily-certifier' AND status='running' AND finished_at IS NULL",
      row.request_id
    );
    await run(env.CONTROL_DB,
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, 'daily-certifier', 'WARN', 'daily_context_certifier_stale_running_auto_recovered', 'Recovered stale running daily-certifier queue row back to pending for fast aggregate rerun', ?, CURRENT_TIMESTAMP)",
      row.request_id, WORKER_NAME, JSON.stringify({ trigger, recovered_from_status: row.status, started_at: row.started_at, updated_at: row.updated_at, tick_count: row.tick_count, version: SYSTEM_VERSION, reason: 'previous worker wrote partial readiness rows but did not return terminal status' })
    );
    recovered += 1;
  }

  return { recovered, rows: staleRows };
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

async function countDuePlayerBaselineSanity(env) {
  const row = await first(env.CONTROL_DB,
    "SELECT COUNT(*) AS c FROM control_job_queue WHERE job_key IN ('player-baseline-sanity','player-baseline-hp') AND worker_name='alphadog-v2-phase2b-pitcher-role' AND status IN ('pending','running','partial_continue') AND finished_at IS NULL"
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
  const maxChains = Math.max(0, Math.min(Number(maxPumpChains || 12), 80));

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
  const dueDailyFullRun = await countDueDailyFullRun(env);
  const dueDailyContextFullRun = await countDueDailyContextFullRun(env);
  const dueMarketScoringFullRun = await countDueMarketScoringFullRun(env);
  const dueStaticPlayers = await countDueStaticPlayers(env);
  const duePlayerBaselineSanity = await countDuePlayerBaselineSanity(env);
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
  const dueAnyHotChain = (dueIncrementalMorningFullRun > 0 || dueBoardFullRun > 0 || dueDailyFullRun > 0 || dueDailyContextFullRun > 0 || dueMarketScoringFullRun > 0 || dueStaticPlayers > 0 || duePlayerBaselineSanity > 0 || dueBaseHitterGameLogs > 0 || dueBaseHitterSplits > 0 || dueBaseHitterMetrics > 0 || dueBasePitcherMetrics > 0 || dueBasePitcherGameLogs > 0 || dueBaseTeamGameLogs > 0 || dueBasePitcherSplits > 0 || dueBaseStarterHistory > 0 || dueBaseBullpenHistory > 0);
  // v0.2.175: Market Scoring Full Run contains long external-market/scoring stages.
  // A bounded pump can legitimately observe GLOBAL_ORCHESTRATOR busy while a prior
  // service-binding fetch is still running or while its 5-minute owner lock is waiting
  // to expire after a platform interruption. Unlike generic workers, the Market Full
  // parent/child rows are chain-scoped, lock-guarded, and counted by countDueMarketScoringFullRun(),
  // so continuing after lock_busy is safe and prevents manual Wake from becoming required.
  const marketScoringLockBusyContinuation = sawLockBusy && !sawHardStop && dueMarketScoringFullRun > 0;
  // v0.2.204: Daily Context Full Run is also a lock-guarded backend cascade.
  // A child service-binding fetch can hold GLOBAL_ORCHESTRATOR long enough for a
  // parallel hot pump/manual wake/cron pump to see lock_busy. Suppressing all
  // self-continuation on that lock_busy made Daily Context rely on the 5-minute
  // cron or manual Wake for the next stage/final parent closeout. Treat the
  // active Daily Context chain like Market Scoring: continue after a short delay
  // when due work remains.
  const dailyFullRunLockBusyContinuation = sawLockBusy && !sawHardStop && dueDailyFullRun > 0;
  const dailyContextLockBusyContinuation = sawLockBusy && !sawHardStop && dueDailyContextFullRun > 0;
  const playerBaselineSanityLockBusyContinuation = sawLockBusy && !sawHardStop && duePlayerBaselineSanity > 0;
  const lockBusyHotContinuation = marketScoringLockBusyContinuation || dailyContextLockBusyContinuation || dailyFullRunLockBusyContinuation || playerBaselineSanityLockBusyContinuation;
  const shouldSelfContinue = (continuationAllowedByLastCycle || lockBusyHotContinuation) && dueAnyHotChain && depth < maxChains && !!ctx;
  const lastCycle = cycles.length ? cycles[cycles.length - 1] : null;
  const lastStatus = String((lastCycle && lastCycle.status) || "");
  const hotContinuationDelayMs = shouldSelfContinue && (lastStatus === "no_due_jobs" || lockBusyHotContinuation) ? 6500 : 0;

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
      due_daily_full_run_after_pump: dueDailyFullRun,
      due_daily_context_full_run_after_pump: dueDailyContextFullRun,
      due_market_scoring_full_run_after_pump: dueMarketScoringFullRun,
      due_static_players_after_pump: dueStaticPlayers,
      due_player_baseline_sanity_after_pump: duePlayerBaselineSanity,
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
      self_continue_suppressed_due_to_lock_busy: !!(sawLockBusy && !lockBusyHotContinuation),
      self_continue_suppressed_due_to_hard_stop: !!sawHardStop,
      continuation_allowed_by_last_cycle: !!continuationAllowedByLastCycle,
      market_scoring_lock_busy_continuation: !!marketScoringLockBusyContinuation,
      daily_full_run_lock_busy_continuation: !!dailyFullRunLockBusyContinuation,
      daily_context_lock_busy_continuation: !!dailyContextLockBusyContinuation,
      lock_busy_hot_continuation: !!lockBusyHotContinuation,
      daily_context_lockbusy_hot_continuation_v0_2_204: true, daily_context_zero_delay_hot_drain_v0_2_206: true, daily_full_run_grandchild_hot_priority_v0_2_208: true, player_baseline_sanity_auto_pump_v0_2_236: true,
      player_baseline_sanity_lock_busy_continuation: !!playerBaselineSanityLockBusyContinuation,
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
        due_daily_full_run_after_pump: dueDailyFullRun,
        due_daily_context_full_run_after_pump: dueDailyContextFullRun,
        due_market_scoring_full_run_after_pump: dueMarketScoringFullRun,
        due_static_players_after_pump: dueStaticPlayers,
        due_player_baseline_sanity_after_pump: duePlayerBaselineSanity,
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
        market_scoring_lock_busy_continuation: !!marketScoringLockBusyContinuation,
        daily_full_run_lock_busy_continuation: !!dailyFullRunLockBusyContinuation,
        daily_context_lock_busy_continuation: !!dailyContextLockBusyContinuation,
        lock_busy_hot_continuation: !!lockBusyHotContinuation,
        daily_context_lockbusy_hot_continuation_v0_2_204: true, daily_context_zero_delay_hot_drain_v0_2_206: true, daily_full_run_grandchild_hot_priority_v0_2_208: true, player_baseline_sanity_auto_pump_v0_2_236: true,
      player_baseline_sanity_lock_busy_continuation: !!playerBaselineSanityLockBusyContinuation,
        self_continue_suppressed_due_to_lock_busy: !!(sawLockBusy && !lockBusyHotContinuation),
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
    due_daily_context_full_run_after_pump: dueDailyContextFullRun,
    due_static_players_after_pump: dueStaticPlayers,
    due_player_baseline_sanity_after_pump: duePlayerBaselineSanity,
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
      await enqueueScheduledDailyFullRunIfDue(env, cronExpression);
      await enqueueScheduledBoardFullRunIfDue(env, cronExpression);
      await pump(env, `cron:${cronExpression}`, 10, 1, 65000, ctx, "https://alphadog-v2-orchestrator.rodolfoaamattos.workers.dev/scheduled", 0, 12);
    })());
  }
};
