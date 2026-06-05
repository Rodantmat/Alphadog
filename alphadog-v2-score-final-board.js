const WORKER_NAME = "alphadog-v2-score-final-board";
const VERSION = "alphadog-v2-score-final-board-v0.1.0-strict-b-live-board-current";
const JOB_KEY = "score-final-board";
const PRIMARY_PROFILE = "STRICT_B";

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
async function readJsonSafe(request) { try { return await request.json(); } catch (_) { return {}; } }
async function run(db, sql, ...binds) { return await db.prepare(sql).bind(...binds).run(); }
async function first(db, sql, ...binds) { return await db.prepare(sql).bind(...binds).first(); }
async function all(db, sql, ...binds) { const r = await db.prepare(sql).bind(...binds).all(); return (r && r.results) || []; }
function safeJson(v) { try { return JSON.stringify(v == null ? {} : v); } catch (_) { return "{}"; } }

async function addColumnIfMissing(db, table, col, ddl) {
  const cols = await all(db, `PRAGMA table_info(${table})`);
  if (!cols.some(c => String(c.name) === col)) await run(db, `ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

async function ensureSchema(env) {
  await run(env.SCORE_DB, `
    CREATE TABLE IF NOT EXISTS score_final_board_batches (
      final_board_batch_id TEXT PRIMARY KEY,
      worker_version TEXT,
      job_key TEXT,
      source_simulation_batch_id TEXT,
      source_scoring_worker_version TEXT,
      profile_key TEXT,
      status TEXT,
      certification TEXT,
      certification_grade TEXT,
      matrix_rows_read INTEGER DEFAULT 0,
      live_rows_read INTEGER DEFAULT 0,
      final_rows_written INTEGER DEFAULT 0,
      current_rows_written INTEGER DEFAULT 0,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT,
      output_json TEXT
    )
  `);

  await run(env.SCORE_DB, `
    CREATE TABLE IF NOT EXISTS score_final_board_current (
      final_board_row_id TEXT PRIMARY KEY,
      final_board_batch_id TEXT,
      source_simulation_batch_id TEXT,
      profile_key TEXT,
      rank_order INTEGER,
      source_key TEXT,
      game_pk INTEGER,
      official_date TEXT,
      official_game_time_utc TEXT,
      prepared_row_id TEXT,
      matrix_id TEXT,
      source_line_id TEXT,
      mlb_player_id INTEGER,
      player_name TEXT,
      canonical_prop_key TEXT,
      line_value REAL,
      selected_side TEXT,
      score_0_100 REAL,
      confidence_0_100 REAL,
      score_grade TEXT,
      score_sort_0_100 REAL,
      factor_status TEXT,
      market_prop_context_status TEXT,
      daily_readiness_status TEXT,
      side_mode TEXT,
      odds_type TEXT,
      payout_variant TEXT,
      archive_eligible INTEGER DEFAULT 1,
      live_playable INTEGER DEFAULT 1,
      calculation_json TEXT,
      matrix_payload_json_snapshot TEXT,
      details_json_snapshot TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(env.SCORE_DB, `
    CREATE TABLE IF NOT EXISTS score_final_board_history (
      final_board_row_id TEXT PRIMARY KEY,
      final_board_batch_id TEXT,
      source_simulation_batch_id TEXT,
      profile_key TEXT,
      rank_order INTEGER,
      source_key TEXT,
      game_pk INTEGER,
      official_date TEXT,
      official_game_time_utc TEXT,
      prepared_row_id TEXT,
      matrix_id TEXT,
      source_line_id TEXT,
      mlb_player_id INTEGER,
      player_name TEXT,
      canonical_prop_key TEXT,
      line_value REAL,
      selected_side TEXT,
      score_0_100 REAL,
      confidence_0_100 REAL,
      score_grade TEXT,
      score_sort_0_100 REAL,
      factor_status TEXT,
      market_prop_context_status TEXT,
      daily_readiness_status TEXT,
      side_mode TEXT,
      odds_type TEXT,
      payout_variant TEXT,
      archive_eligible INTEGER DEFAULT 1,
      live_playable INTEGER DEFAULT 1,
      calculation_json TEXT,
      matrix_payload_json_snapshot TEXT,
      details_json_snapshot TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(env.SCORE_DB, `
    CREATE TABLE IF NOT EXISTS score_final_board_issues (
      issue_id TEXT PRIMARY KEY,
      final_board_batch_id TEXT,
      source_simulation_batch_id TEXT,
      issue_key TEXT,
      severity TEXT,
      issue_count INTEGER DEFAULT 0,
      issue_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const currentExtra = [
    ["source_simulation_batch_id", "source_simulation_batch_id TEXT"], ["confidence_0_100", "confidence_0_100 REAL"],
    ["score_sort_0_100", "score_sort_0_100 REAL"], ["side_mode", "side_mode TEXT"], ["odds_type", "odds_type TEXT"],
    ["payout_variant", "payout_variant TEXT"], ["calculation_json", "calculation_json TEXT"],
    ["matrix_payload_json_snapshot", "matrix_payload_json_snapshot TEXT"], ["details_json_snapshot", "details_json_snapshot TEXT"]
  ];
  for (const [col, ddl] of currentExtra) {
    await addColumnIfMissing(env.SCORE_DB, "score_final_board_current", col, ddl);
    await addColumnIfMissing(env.SCORE_DB, "score_final_board_history", col, ddl);
  }

  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_score_final_board_current_rank ON score_final_board_current(profile_key, rank_order)`);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_score_final_board_current_date ON score_final_board_current(official_date, source_key, canonical_prop_key)`);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_score_final_board_current_game ON score_final_board_current(game_pk, mlb_player_id)`);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_score_final_board_history_batch ON score_final_board_history(final_board_batch_id, rank_order)`);
  await run(env.SCORE_DB, `CREATE INDEX IF NOT EXISTS idx_score_final_board_batches_started ON score_final_board_batches(started_at, status)`);
}

async function latestCompletedSimulationBatch(env, requestedBatchId) {
  if (requestedBatchId) {
    return await first(env.SCORE_DB, `
      SELECT simulation_batch_id, worker_version, status, certification, certification_grade, matrix_rows_read, simulation_rows_written, started_at, finished_at
      FROM scoring_engine_simulation_batches
      WHERE simulation_batch_id = ?
      LIMIT 1
    `, requestedBatchId);
  }
  return await first(env.SCORE_DB, `
    SELECT simulation_batch_id, worker_version, status, certification, certification_grade, matrix_rows_read, simulation_rows_written, started_at, finished_at
    FROM scoring_engine_simulation_batches
    WHERE status = 'completed_simulation_shadow_only'
      AND certification_grade LIKE 'PASS%'
      AND strict_b_rows_written > 0
      AND hybrid_control_rows_written > 0
    ORDER BY datetime(finished_at) DESC, datetime(started_at) DESC
    LIMIT 1
  `);
}

async function writeIssue(env, batchId, simBatchId, key, severity, count, payload) {
  await run(env.SCORE_DB, `
    INSERT OR REPLACE INTO score_final_board_issues (issue_id, final_board_batch_id, source_simulation_batch_id, issue_key, severity, issue_count, issue_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, `issue|${batchId}|${key}`, batchId, simBatchId || null, key, severity, Number(count || 0), safeJson(payload));
}

function rowId(batchId, rank, row) {
  return `final|${batchId}|${PRIMARY_PROFILE}|${String(rank).padStart(4, "0")}|${row.matrix_id || row.prepared_row_id || row.source_line_id || rank}`;
}

async function insertBoardRow(env, table, id, batchId, simBatchId, rank, row) {
  await run(env.SCORE_DB, `
    INSERT OR REPLACE INTO ${table} (
      final_board_row_id, final_board_batch_id, source_simulation_batch_id, profile_key, rank_order,
      source_key, game_pk, official_date, official_game_time_utc, prepared_row_id, matrix_id, source_line_id,
      mlb_player_id, player_name, canonical_prop_key, line_value, selected_side, score_0_100, confidence_0_100,
      score_grade, score_sort_0_100, factor_status, market_prop_context_status, daily_readiness_status,
      side_mode, odds_type, payout_variant, archive_eligible, live_playable,
      calculation_json, matrix_payload_json_snapshot, details_json_snapshot, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `,
    id, batchId, simBatchId, PRIMARY_PROFILE, rank,
    row.source_key || null, row.game_pk || null, row.official_date || null, row.official_game_time_utc || null,
    row.prepared_row_id || null, row.matrix_id || null, row.source_line_id || null,
    row.mlb_player_id || null, row.player_name || null, row.canonical_prop_key || null, row.line_value == null ? null : Number(row.line_value),
    row.selected_side || null, row.score_0_100 == null ? null : Number(row.score_0_100), row.confidence_0_100 == null ? null : Number(row.confidence_0_100),
    row.score_grade || null, row.score_sort_0_100 == null ? null : Number(row.score_sort_0_100), row.factor_status || null,
    row.market_prop_context_status || null, row.daily_readiness_status || null, row.side_mode || null, row.odds_type || null, row.payout_variant || null,
    Number(row.archive_eligible || 0), Number(row.live_playable || 0),
    row.calculation_json || null, row.matrix_payload_json_snapshot || null, row.details_json_snapshot || null
  );
}

async function generateFinalBoard(env, input) {
  await ensureSchema(env);
  const started = Date.now();
  const batchId = rid("score_final_board_batch");
  const sim = await latestCompletedSimulationBatch(env, input.source_simulation_batch_id || input.simulation_batch_id || null);

  await run(env.SCORE_DB, `
    INSERT INTO score_final_board_batches (final_board_batch_id, worker_version, job_key, source_simulation_batch_id, source_scoring_worker_version, profile_key, status, certification, certification_grade, started_at)
    VALUES (?, ?, ?, ?, ?, ?, 'running', 'SCORE_FINAL_BOARD_STARTED', 'RUNNING', CURRENT_TIMESTAMP)
  `, batchId, VERSION, JOB_KEY, sim && sim.simulation_batch_id || null, sim && sim.worker_version || null, PRIMARY_PROFILE);

  if (!sim || sim.status !== "completed_simulation_shadow_only") {
    const output = { ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, status:"blocked_no_completed_simulation_batch", certification:"SCORE_FINAL_BOARD_BLOCKED_NO_COMPLETED_SIMULATION", certification_grade:"BLOCKED", final_board_batch_id:batchId, requested_simulation_batch_id:input.source_simulation_batch_id || input.simulation_batch_id || null };
    await writeIssue(env, batchId, sim && sim.simulation_batch_id || null, "NO_COMPLETED_SIMULATION_BATCH", "BLOCKER", 1, output);
    await run(env.SCORE_DB, `UPDATE score_final_board_batches SET status=?, certification=?, certification_grade=?, finished_at=CURRENT_TIMESTAMP, output_json=? WHERE final_board_batch_id=?`, output.status, output.certification, output.certification_grade, safeJson(output), batchId);
    return output;
  }

  const simBatchId = sim.simulation_batch_id;
  const bad = await first(env.SCORE_DB, `
    SELECT COUNT(*) AS bad_rows
    FROM scoring_engine_simulation_shadow
    WHERE simulation_batch_id = ?
      AND profile_key = ?
      AND live_playable = 1
      AND (
        archive_eligible <> 1
        OR score_0_100 < 76
        OR confidence_0_100 < 55
        OR selected_side IS NULL
        OR factor_status <> 'packet_ready'
        OR market_prop_context_status <> 'market_prop_context_present'
        OR daily_readiness_status NOT IN ('ready','ready_with_warnings')
        OR invariant_violation_count > 0
      )
  `, simBatchId, PRIMARY_PROFILE);
  const badRows = Number(bad && bad.bad_rows || 0);
  if (badRows > 0) {
    const output = { ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, status:"blocked_live_invariant_failure", certification:"SCORE_FINAL_BOARD_BLOCKED_LIVE_INVARIANTS", certification_grade:"BLOCKED", final_board_batch_id:batchId, source_simulation_batch_id:simBatchId, bad_live_rows:badRows };
    await writeIssue(env, batchId, simBatchId, "LIVE_INVARIANT_FAILURE", "BLOCKER", badRows, output);
    await run(env.SCORE_DB, `UPDATE score_final_board_batches SET status=?, certification=?, certification_grade=?, finished_at=CURRENT_TIMESTAMP, output_json=? WHERE final_board_batch_id=?`, output.status, output.certification, output.certification_grade, safeJson(output), batchId);
    return output;
  }

  const rows = await all(env.SCORE_DB, `
    SELECT *
    FROM scoring_engine_simulation_shadow
    WHERE simulation_batch_id = ?
      AND profile_key = ?
      AND live_playable = 1
      AND archive_eligible = 1
      AND factor_status = 'packet_ready'
      AND market_prop_context_status = 'market_prop_context_present'
      AND daily_readiness_status IN ('ready','ready_with_warnings')
      AND selected_side IS NOT NULL
      AND score_0_100 >= 76
      AND confidence_0_100 >= 55
      AND invariant_violation_count = 0
    ORDER BY score_0_100 DESC, confidence_0_100 DESC, COALESCE(score_sort_0_100, score_0_100) DESC, player_name, canonical_prop_key, selected_side, matrix_id
  `, simBatchId, PRIMARY_PROFILE);

  if (!rows.length) {
    const output = { ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, status:"blocked_no_live_rows", certification:"SCORE_FINAL_BOARD_BLOCKED_NO_LIVE_ROWS", certification_grade:"BLOCKED", final_board_batch_id:batchId, source_simulation_batch_id:simBatchId };
    await writeIssue(env, batchId, simBatchId, "NO_LIVE_ROWS", "BLOCKER", 1, output);
    await run(env.SCORE_DB, `UPDATE score_final_board_batches SET status=?, certification=?, certification_grade=?, finished_at=CURRENT_TIMESTAMP, output_json=? WHERE final_board_batch_id=?`, output.status, output.certification, output.certification_grade, safeJson(output), batchId);
    return output;
  }

  let rank = 0;
  for (const row of rows) {
    rank += 1;
    const id = rowId(batchId, rank, row);
    await insertBoardRow(env, "score_final_board_history", id, batchId, simBatchId, rank, row);
  }

  await run(env.SCORE_DB, `DELETE FROM score_final_board_current`);
  rank = 0;
  for (const row of rows) {
    rank += 1;
    const id = rowId(batchId, rank, row);
    await insertBoardRow(env, "score_final_board_current", id, batchId, simBatchId, rank, row);
  }

  const bySource = await all(env.SCORE_DB, `
    SELECT source_key, canonical_prop_key, selected_side, COUNT(*) AS rows, MIN(score_0_100) AS min_score, MAX(score_0_100) AS max_score
    FROM score_final_board_current
    WHERE final_board_batch_id = ?
    GROUP BY source_key, canonical_prop_key, selected_side
    ORDER BY rows DESC, max_score DESC
  `, batchId);

  const output = {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "completed_final_board_current_replaced",
    certification: "SCORE_FINAL_BOARD_CERTIFIED_CURRENT_REPLACED",
    certification_grade: "PASS",
    final_board_batch_id: batchId,
    source_simulation_batch_id: simBatchId,
    source_scoring_worker_version: sim.worker_version,
    profile_key: PRIMARY_PROFILE,
    matrix_rows_read: Number(sim.matrix_rows_read || 0),
    live_rows_read: rows.length,
    final_rows_written: rows.length,
    current_rows_written: rows.length,
    table_for_final_ui: "SCORE_DB.score_final_board_current",
    history_table: "SCORE_DB.score_final_board_history",
    no_external_calls: true,
    no_source_board_mutation: true,
    no_simulation_shadow_mutation: true,
    by_source_prop_side: bySource,
    elapsed_ms: Date.now() - started,
    timestamp_utc: nowUtc()
  };

  await writeIssue(env, batchId, simBatchId, "LIVE_INVARIANT_FAILURE", "INFO", 0, { note: "No live row invariant failures detected before final board write." });
  await run(env.SCORE_DB, `
    UPDATE score_final_board_batches
    SET status=?, certification=?, certification_grade=?, matrix_rows_read=?, live_rows_read=?, final_rows_written=?, current_rows_written=?, finished_at=CURRENT_TIMESTAMP, output_json=?
    WHERE final_board_batch_id=?
  `, output.status, output.certification, output.certification_grade, output.matrix_rows_read, output.live_rows_read, output.final_rows_written, output.current_rows_written, safeJson(output), batchId);

  return output;
}

function baseIdentity() {
  return { ok:true, data_ok:true, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, status:"READY", timestamp_utc:nowUtc(), purpose:"Generate SCORE_DB.score_final_board_current from latest completed STRICT_B scoring simulation live rows." };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "GET" && (path === "/" || path === "/health")) return jsonResponse(baseIdentity());

    if (method === "POST" && path === "/diagnostic") {
      return jsonResponse({ ...baseIdentity(), route:"/diagnostic", bindings:{ SCORE_DB: !!(env && env.SCORE_DB), CONTROL_DB: !!(env && env.CONTROL_DB) }, writes_performed:0, external_calls_performed:0 });
    }

    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        return jsonResponse(await generateFinalBoard(env, input || {}));
      } catch (err) {
        return jsonResponse({ ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, status:"score_final_board_exception", certification:"SCORE_FINAL_BOARD_EXCEPTION", certification_grade:"FAILED", error:String(err && err.message ? err.message : err), timestamp_utc:nowUtc() }, 500);
      }
    }

    return jsonResponse({ ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, status:"NOT_FOUND", allowed_routes:["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc:nowUtc() }, 404);
  }
};
