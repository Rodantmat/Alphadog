const WORKER_NAME = "alphadog-v2-delta-certifier";

/*
2026-05-26
alphadog-v2-delta-certifier-v0.1.0-game-calendar-coverage-audit

AUDIT ONLY:
- no repairs
- no source/history mutation
- no scoring
- no ranking
- no board mutation
*/

const VERSION = "alphadog-v2-delta-certifier-v0.1.0-game-calendar-coverage-audit";

async function ensureCoverageTables(env) {
  const calendarSql = `
  CREATE TABLE IF NOT EXISTS mlb_game_calendar (
    game_pk INTEGER PRIMARY KEY,
    season INTEGER,
    game_type TEXT,
    official_date TEXT,
    game_time_utc TEXT,
    status_code TEXT,
    abstract_game_state TEXT,
    detailed_state TEXT,
    is_final INTEGER DEFAULT 0,
    is_available_for_stats INTEGER DEFAULT 0,
    home_team_id INTEGER,
    away_team_id INTEGER,
    venue_id INTEGER,
    raw_json TEXT,
    first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`;

  const coverageSql = `
  CREATE TABLE IF NOT EXISTS mlb_game_data_coverage (
    game_pk INTEGER NOT NULL,
    layer_key TEXT NOT NULL,
    official_date TEXT,
    coverage_status TEXT,
    coverage_grade TEXT,
    blocking_for_full_run INTEGER DEFAULT 1,
    live_rows INTEGER DEFAULT 0,
    stage_rows INTEGER DEFAULT 0,
    outcome_rows INTEGER DEFAULT 0,
    missing_reason TEXT,
    details_json TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (game_pk, layer_key)
  )`;

  const batchSql = `
  CREATE TABLE IF NOT EXISTS mlb_game_coverage_batches (
    batch_id TEXT PRIMARY KEY,
    request_id TEXT,
    mode TEXT,
    status TEXT,
    source_game_count INTEGER DEFAULT 0,
    source_final_game_pk_count INTEGER DEFAULT 0,
    coverage_rows_written INTEGER DEFAULT 0,
    blocking_gap_count INTEGER DEFAULT 0,
    certification_status TEXT,
    certification_grade TEXT,
    output_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`;

  const gapsSql = `
  CREATE TABLE IF NOT EXISTS mlb_game_coverage_gaps (
    gap_id TEXT PRIMARY KEY,
    batch_id TEXT,
    game_pk INTEGER,
    official_date TEXT,
    layer_key TEXT,
    gap_status TEXT,
    missing_reason TEXT,
    details_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`;

  await env.TEAM_DB.prepare(calendarSql).run();
  await env.TEAM_DB.prepare(coverageSql).run();
  await env.TEAM_DB.prepare(batchSql).run();
  await env.TEAM_DB.prepare(gapsSql).run();
}

async function probeScheduleShape() {
  const url = "https://statsapi.mlb.com/api/v1/schedule?sportId=1&gameTypes=R&startDate=2026-05-23&endDate=2026-05-26";
  const res = await fetch(url);
  const data = await res.json();

  const sample = (((data || {}).dates || [])[0] || {}).games || [];
  const firstGame = sample[0] || {};

  return {
    endpoint: url,
    ok: res.ok,
    observed_fields: Object.keys(firstGame || {}),
    observed_status_code: (((firstGame || {}).status || {}).statusCode) || null,
    observed_game_count: sample.length
  };
}

async function handleCoverageAudit(request, env) {
  await ensureCoverageTables(env);

  const probe = await probeScheduleShape();

  
if ((url.searchParams.get("mode") || "") === "game_calendar_coverage_audit") {
  return handleCoverageAudit(request, env);
}

return jsonResponse({

    ok: true,
    data_ok: true,
    worker_name: WORKER_NAME,
    version: VERSION,
    job_key: JOB_KEY,
    mode: "game_calendar_coverage_audit",
    status: "GAME_CALENDAR_COVERAGE_AUDIT_READY",
    certification: "GAME_CALENDAR_COVERAGE_AUDIT_SOURCE_PROBE_OK",
    certification_grade: "AUDIT_READY",
    schedule_probe: probe,
    no_source_history_mutation: true,
    no_repairs: true,
    no_scoring: true,
    no_board_mutation: true
  });
}

const JOB_KEY = "delta-certifier";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB"];
const REQUIRED_SECRETS = ["ALPHADOG_ADMIN_TOKEN", "ALPHADOG_INTERNAL_TOKEN", "ODDS_API_KEY", "PARLAY_API_KEY", "GEMINI_API_KEY", "GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BRANCH", "GITHUB_PRIZEPICKS_PATH", "MLB_API_USER_AGENT"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "DEFAULT_DAY_SCOPE", "DEFAULT_SLATE_MODE", "ODDS_API_BASE_URL", "PARLAY_API_BASE_URL", "MLB_API_BASE_URL", "PRIZEPICKS_SOURCE_MODE", "MAX_TICK_MS", "MAX_API_CALLS_PER_TICK", "MAX_ROWS_PER_TICK", "LOCK_STALE_MINUTES", "WORKER_SAFE_MODE", "DEBUG_MODE", "MANUAL_SQL_ENABLED", "CONFIG_PHASE"];

function nowUtc() {
  return new Date().toISOString();
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function bindingPresence(env, names) {
  const out = {};
  for (const name of names) out[name] = Boolean(env && env[name]);
  return out;
}

function varPresence(env, names) {
  const out = {};
  for (const name of names) out[name] = env && env[name] !== undefined && env[name] !== null && String(env[name]).length > 0;
  return out;
}

function allTrue(obj) {
  return Object.values(obj).every(Boolean);
}

function baseIdentity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars = varPresence(env, EXPECTED_VARS);
  const secrets = varPresence(env, REQUIRED_SECRETS);

  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "DUMMY_READY",
    timestamp_utc: nowUtc(),
    phase: "alphadog-v2-config-bootstrap",
    notes: [
      "Dummy worker only.",
      "No mining, scoring, external API calls, or production writes.",
      "Use /health and /diagnostic to verify bindings/secrets/vars."
    ],
    binding_summary: {
      required_db_bindings_present: allTrue(db),
      expected_vars_present: allTrue(vars),
      required_secrets_present: allTrue(secrets)
    }
  };
}

async function readJsonSafe(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "GET" && path === "/") {
      return jsonResponse(baseIdentity(env));
    }

    if (method === "GET" && path === "/health") {
      const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
      const vars = varPresence(env, EXPECTED_VARS);
      const secrets = varPresence(env, REQUIRED_SECRETS);

      return jsonResponse({
        ...baseIdentity(env),
        route: "/health",
        checks: {
          db_bindings: db,
          vars: vars,
          secrets_present_only: secrets
        },
        safe_secret_note: "Secret values are intentionally never printed."
      });
    }

    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
      const vars = varPresence(env, EXPECTED_VARS);
      const secrets = varPresence(env, REQUIRED_SECRETS);

      return jsonResponse({
        ...baseIdentity(env),
        route: "/diagnostic",
        input_echo_safe: {
          request_id: input.request_id || null,
          chain_id: input.chain_id || null,
          job_key: input.job_key || null,
          mode: input.mode || null
        },
        diagnostics: {
          db_bindings: db,
          vars: vars,
          secrets_present_only: secrets
        },
        writes_performed: 0,
        external_calls_performed: 0
      });
    }

    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);

      return jsonResponse({
        ok: true,
        data_ok: true,
        version: VERSION,
        worker_name: WORKER_NAME,
        job_key: input.job_key || JOB_KEY,
        request_id: input.request_id || null,
        chain_id: input.chain_id || null,
        status: "DUMMY_READY",
        certification: "DUMMY_ONLY_NOT_REAL_DATA",
        rows_read: 0,
        rows_written: 0,
        next_action: "ADD_BINDINGS_SECRETS_VARS_AND_VERIFY_HEALTH",
        block_downstream_reason: null,
        output_json: {
          dummy: true,
          slate_date: input.slate_date || null,
          mode: input.mode || null,
          received_input_json: input.input_json || null
        },
        timestamp_utc: nowUtc(),
        writes_performed: 0,
        external_calls_performed: 0
      });
    }

    return jsonResponse({
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      status: "NOT_FOUND",
      allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"],
      timestamp_utc: nowUtc()
    }, 404);
  }
};
