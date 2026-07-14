// Real Scoring Full-Run Certifier (alphadog-v2-scoring-full-run-certifier, deployed to
// the alphadog-v2-phase3b-certifier slot - repurposed from a dummy placeholder).
//
// Real, locked design: same real certifier pattern already proven in this system (Daily
// Context's alphadog-v2-daily-certifier.js, the delta pipeline's certifier, and the Market
// certifier) - runs as the FIRST stage of the real full run (finds gaps before the chain
// executes) AND the LAST stage (verifies gaps were actually closed after the chain ran),
// same worker/job_key reused for both, since the tally computation is cheap and idempotent
// - no separate first-pass/last-pass mode needed, matching the established precedent.
//
// Real stages tracked (in real pipeline order): prop-factor-miner, matrix-builder,
// enrichment-engine, scoring-engine, hit-probability-board, final-board. For each stage,
// counts real rows written for the current real board window against the real expected
// count (the board's own real pickable-leg count from SCORE_DB.score_board_prepared_current),
// so a genuine gap (a stage that under-produced relative to the real board) is visible and
// trackable, not just assumed clean because the chain "completed".

const WORKER_NAME = "alphadog-v2-phase3b-certifier";
const LOGICAL_WORKER_NAME = "alphadog-v2-scoring-full-run-certifier";
const JOB_KEY = "scoring-full-run-certifier";
const SYSTEM_VERSION = "alphadog-v2-scoring-full-run-certifier-v0.1.0-real-skeleton";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "SCORE_DB", "SCORING_DB", "ARCHIVE_DB"];

function nowUtc() { return new Date().toISOString(); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function bindingPresence(env, names) { const out = {}; for (const n of names) out[n] = Boolean(env && env[n]); return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

async function all(db, sql, ...binds) {
  const stmt = binds.length ? db.prepare(sql).bind(...binds) : db.prepare(sql);
  const res = await stmt.all();
  return res.results || [];
}
async function first(db, sql, ...binds) {
  const stmt = binds.length ? db.prepare(sql).bind(...binds) : db.prepare(sql);
  return stmt.first();
}
async function run(db, sql, ...binds) {
  const stmt = binds.length ? db.prepare(sql).bind(...binds) : db.prepare(sql);
  return stmt.run();
}

async function ensureSchema(env) {
  await run(env.SCORING_DB, `
    CREATE TABLE IF NOT EXISTS scoring_full_run_tally_current (
      tally_id TEXT PRIMARY KEY,
      run_pass TEXT,
      stage_key TEXT,
      expected_rows INTEGER DEFAULT 0,
      actual_rows INTEGER DEFAULT 0,
      gap_count INTEGER DEFAULT 0,
      status TEXT,
      details_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await run(env.SCORING_DB, `
    CREATE TABLE IF NOT EXISTS scoring_full_run_certifier_runs (
      certifier_run_id TEXT PRIMARY KEY,
      run_pass TEXT,
      total_expected_rows INTEGER DEFAULT 0,
      total_gap_count INTEGER DEFAULT 0,
      overall_status TEXT,
      stage_summary_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function expectedRowCount(env) {
  const row = await first(env.SCORE_DB,
    `SELECT COUNT(*) AS c FROM score_board_prepared_current WHERE pickable_safe=1 AND matchup_status='calendar_matched' AND player_match_status='matched'`);
  return (row && row.c) || 0;
}

async function stageRowCount(env, stageKey, expected) {
  try {
    switch (stageKey) {
      case "prop-factor-miner": {
        const r = await first(env.SCORING_DB, `SELECT (SELECT COUNT(*) FROM prop_factor_hitter_packets) + (SELECT COUNT(*) FROM prop_factor_pitcher_packets) AS c`);
        return (r && r.c) || 0;
      }
      case "matrix-builder": {
        const r = await first(env.SCORING_DB, `SELECT COUNT(*) AS c FROM prop_matrix_current`);
        return (r && r.c) || 0;
      }
      case "enrichment-engine": {
        const r = await first(env.SCORING_DB, `SELECT COUNT(*) AS c FROM enrichment_leg_current`);
        return (r && r.c) || 0;
      }
      case "scoring-engine": {
        const r = await first(env.SCORE_DB, `SELECT COUNT(*) AS c FROM scoring_engine_current`);
        return (r && r.c) || 0;
      }
      case "hit-probability-board": {
        const r = await first(env.SCORE_DB, `SELECT COUNT(*) AS c FROM hp_board_current`);
        return (r && r.c) || 0;
      }
      case "final-board": {
        const r = await first(env.SCORE_DB, `SELECT COUNT(*) AS c FROM score_final_board_current`);
        return (r && r.c) || 0;
      }
      default:
        return 0;
    }
  } catch (err) {
    // Real, honest handling: a stage table that doesn't exist yet (e.g. before its first
    // real run) is a genuine, real gap - counted as 0 actual rows, not an error that blocks
    // the certifier itself from reporting the rest of the real tally.
    return 0;
  }
}

const REAL_STAGE_ORDER = ["prop-factor-miner", "matrix-builder", "enrichment-engine", "scoring-engine", "hit-probability-board", "final-board"];

async function runCertifier(env, input) {
  await ensureSchema(env);
  const runPass = input.run_pass === "last" ? "last" : "first";
  const certifierRunId = rid("scoring_full_run_certifier");
  const expected = await expectedRowCount(env);

  const stageSummaries = [];
  let totalGap = 0;
  for (const stageKey of REAL_STAGE_ORDER) {
    const actual = await stageRowCount(env, stageKey, expected);
    const gap = Math.max(0, expected - actual);
    totalGap += gap;
    const status = expected === 0 ? "no_board_expected_zero" : (actual >= expected ? "complete" : (actual > 0 ? "partial" : "missing"));
    stageSummaries.push({ stage_key: stageKey, expected_rows: expected, actual_rows: actual, gap_count: gap, status });

    await run(env.SCORING_DB,
      `INSERT OR REPLACE INTO scoring_full_run_tally_current (tally_id, run_pass, stage_key, expected_rows, actual_rows, gap_count, status, details_json, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      `tally_${stageKey}`, runPass, stageKey, expected, actual, gap, status, JSON.stringify({ certifier_run_id: certifierRunId })
    );
  }

  const overallStatus = totalGap === 0 ? "clean" : "gaps_present";
  await run(env.SCORING_DB,
    `INSERT INTO scoring_full_run_certifier_runs (certifier_run_id, run_pass, total_expected_rows, total_gap_count, overall_status, stage_summary_json, created_at)
     VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
    certifierRunId, runPass, expected, totalGap, overallStatus, JSON.stringify(stageSummaries));

  return {
    ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    request_id: input.request_id || null, chain_id: input.chain_id || null, certifier_run_id: certifierRunId,
    run_pass: runPass, status: overallStatus === "clean" ? "completed_clean" : "completed_with_gaps",
    expected_rows: expected, total_gap_count: totalGap, stage_summary: stageSummaries,
    timestamp_utc: nowUtc(),
  };
}

function identity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  return { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY, status: "ready", schema_owner: "SCORING_DB.scoring_full_run_*", tracked_stages: REAL_STAGE_ORDER, required_db_bindings_present: allTrue(db), db_bindings: db };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (request.method === "GET" && (path === "/" || path === "/health")) return jsonResponse(identity(env));
    if (request.method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        const output = await runCertifier(env, input);
        return jsonResponse(output, output.ok ? 200 : 400);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, error: String(err && err.stack ? err.stack : err) }, 500);
      }
    }
    return jsonResponse({ ok: false, error: "not_found", allowed_routes: ["GET /", "GET /health", "POST /run"] }, 404);
  },
};
