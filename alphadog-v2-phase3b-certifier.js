import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-phase3b-certifier";
const LOGICAL_WORKER_NAME = "alphadog-v2-scoring-full-run-certifier";
const JOB_KEY = "scoring-full-run-certifier";
const SYSTEM_VERSION = "alphadog-v2-scoring-full-run-certifier-v0.2.0-postgres-rewire";

function pg(env) { return postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false, prepare: false }); }
function nowUtc() { return new Date().toISOString(); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function bindingPresence(env, names) { const out = {}; for (const n of names) out[n] = Boolean(env && env[n]); return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

async function expectedRowCount(pgClient) {
  const rows = await pgClient`SELECT COUNT(*) AS c FROM score.board_prepared_current WHERE pickable_safe=1 AND matchup_status='calendar_matched' AND player_match_status='matched'`;
  return Number(rows[0] && rows[0].c || 0);
}

async function stageRowCount(pgClient, stageKey) {
  try {
    switch (stageKey) {
      case "prop-factor-miner": {
        const r1 = await pgClient`SELECT COUNT(*) AS c FROM scoring.prop_factor_hitter_packets`.catch(() => [{ c: 0 }]);
        const r2 = await pgClient`SELECT COUNT(*) AS c FROM scoring.prop_factor_pitcher_packets`.catch(() => [{ c: 0 }]);
        return Number(r1[0] && r1[0].c || 0) + Number(r2[0] && r2[0].c || 0);
      }
      case "matrix-builder": {
        const r = await pgClient`SELECT COUNT(*) AS c FROM score.prop_matrix_current`;
        return Number(r[0] && r[0].c || 0);
      }
      case "enrichment-engine": {
        const r = await pgClient`SELECT COUNT(*) AS c FROM scoring.enrichment_leg_current`;
        return Number(r[0] && r[0].c || 0);
      }
      case "scoring-engine": {
        const r = await pgClient`SELECT COUNT(*) AS c FROM score.scoring_engine_current`;
        return Number(r[0] && r[0].c || 0);
      }
      case "hit-probability-board": {
        const r = await pgClient`SELECT COUNT(*) AS c FROM score.hp_board_current`;
        return Number(r[0] && r[0].c || 0);
      }
      case "final-board": {
        const r = await pgClient`SELECT COUNT(*) AS c FROM score.final_board_current`;
        return Number(r[0] && r[0].c || 0);
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

async function runCertifier(pgClient, input) {
  // FIXED (2026-08-03): input.run_pass was never actually set by either caller (scoring-runner.js
  // or scoring-runner-part2.js) - confirmed live every certifier run was permanently mislabeled
  // 'first' regardless of which pass invoked it. Both callers do already send a mode string that
  // correctly distinguishes the two passes (e.g. 'scoring_full_run_certifier_last_pass' vs
  // '_first_pass') - deriving from that instead, since it's already being sent correctly.
  const runPass = String(input.mode || "").includes("last_pass") ? "last" : (input.run_pass === "last" ? "last" : "first");
  const certifierRunId = rid("scoring_full_run_certifier");
  const expected = await expectedRowCount(pgClient);

  const stageSummaries = [];
  let totalGap = 0;
  for (const stageKey of REAL_STAGE_ORDER) {
    const actual = await stageRowCount(pgClient, stageKey);
    const gap = Math.max(0, expected - actual);
    totalGap += gap;
    const status = expected === 0 ? "no_board_expected_zero" : (actual >= expected ? "complete" : (actual > 0 ? "partial" : "missing"));
    stageSummaries.push({ stage_key: stageKey, expected_rows: expected, actual_rows: actual, gap_count: gap, status });

    await pgClient`INSERT INTO scoring.full_run_tally_current (tally_id, run_pass, stage_key, expected_rows, actual_rows, gap_count, status, details_json, created_at, updated_at)
      VALUES (${`tally_${stageKey}`}, ${runPass}, ${stageKey}, ${expected}, ${actual}, ${gap}, ${status}, ${JSON.stringify({ certifier_run_id: certifierRunId })}, now(), now())
      ON CONFLICT (tally_id) DO UPDATE SET run_pass=EXCLUDED.run_pass, expected_rows=EXCLUDED.expected_rows, actual_rows=EXCLUDED.actual_rows, gap_count=EXCLUDED.gap_count, status=EXCLUDED.status, details_json=EXCLUDED.details_json, updated_at=now()`;
  }

  const overallStatus = totalGap === 0 ? "clean" : "gaps_present";
  await pgClient`INSERT INTO scoring.full_run_certifier_runs (certifier_run_id, run_pass, total_expected_rows, total_gap_count, overall_status, stage_summary_json, created_at)
    VALUES (${certifierRunId}, ${runPass}, ${expected}, ${totalGap}, ${overallStatus}, ${JSON.stringify(stageSummaries)}, now())`;

  return {
    ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    request_id: input.request_id || null, chain_id: input.chain_id || null, certifier_run_id: certifierRunId,
    run_pass: runPass, status: overallStatus === "clean" ? "completed_clean" : "completed_with_gaps",
    expected_rows: expected, total_gap_count: totalGap, stage_summary: stageSummaries,
    timestamp_utc: nowUtc(),
  };
}

function identity(env) {
  const db = bindingPresence(env, ["HYPERDRIVE"]);
  return { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY, status: "ready", schema_owner: "scoring.full_run_*", tracked_stages: REAL_STAGE_ORDER, required_db_bindings_present: allTrue(db), db_bindings: db };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (request.method === "GET" && (path === "/" || path === "/health")) return jsonResponse(identity(env));
    if (request.method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const pgClient = pg(env);
      try {
        const workPromise = runCertifier(pgClient, input);
        ctx.waitUntil(workPromise.then(() => {}, () => {}));
        const output = await workPromise;
        return jsonResponse(output, output.ok ? 200 : 400);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, error: String(err && err.stack ? err.stack : err) }, 500);
      } finally {
        await pgClient.end({ timeout: 1 }).catch(() => {});
      }
    }
    return jsonResponse({ ok: false, error: "not_found", allowed_routes: ["GET /", "GET /health", "POST /run"] }, 404);
  },
};
