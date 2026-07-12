const WORKER_NAME = "alphadog-v2-market-certifier";
const VERSION = "alphadog-v2-market-certifier-v0.1.0-initial-parsing-tally-and-readiness";
const JOB_KEY = "market-certifier";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "MARKET_DB", "SCORE_DB", "TEAM_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON"];

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
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
async function readJsonSafe(request) { try { return await request.json(); } catch (_) { return {}; } }
async function all(db, sql, ...binds) { const s = db.prepare(sql); const r = binds.length ? await s.bind(...binds).all() : await s.all(); return r.results || []; }
async function run(db, sql, ...binds) { const s = db.prepare(sql); return binds.length ? await s.bind(...binds).run() : await s.run(); }
async function withDeadline(promise, ms, fallbackValue) {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise(resolve => { timer = setTimeout(() => resolve(typeof fallbackValue === "function" ? fallbackValue() : fallbackValue), Math.max(500, Number(ms || 5000))); })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function batchRun(db, statements, chunkSize = 80) {
  for (let i = 0; i < statements.length; i += chunkSize) {
    const chunk = statements.slice(i, i + chunkSize);
    if (chunk.length) await db.batch(chunk);
  }
}
function safeJson(value, max = 10000) {
  if (value === undefined || value === null) return null;
  let text;
  try { text = typeof value === "string" ? value : JSON.stringify(value); } catch (_) { text = String(value); }
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}
function parseObjectSafe(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") { try { const p = JSON.parse(value); return p && typeof p === "object" && !Array.isArray(p) ? p : {}; } catch (_) { return {}; } }
  return {};
}
function bindingPresence(env, names) { const out = {}; for (const name of names) out[name] = Boolean(env && env[name]); return out; }
function varPresence(env, names) { const out = {}; for (const name of names) out[name] = env && env[name] !== undefined && env[name] !== null && String(env[name]).length > 0; return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
function ptDate(offsetDays = 0) {
  const base = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(base);
  const m = {}; parts.forEach(p => { m[p.type] = p.value; });
  const d = new Date(`${m.year}-${m.month}-${m.day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
function determineSlateShape(todayCount, tomorrowCount) {
  if (todayCount > 0 && tomorrowCount > 0) return "split_today_tomorrow";
  if (todayCount > 0 && tomorrowCount === 0) return "same_day_only";
  if (todayCount === 0 && tomorrowCount > 0) return "next_day_only";
  return "no_games";
}

function baseIdentity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars = varPresence(env, EXPECTED_VARS);
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "READY_MARKET_CONTEXT_READINESS_AND_PARSING_CERTIFIER",
    timestamp_utc: nowUtc(),
    phase: "market-context-readiness-and-parsing-certifier",
    binding_summary: { required_db_bindings_present: allTrue(db), expected_vars_present: allTrue(vars) },
    guardrails: {
      readiness_and_parsing_tally_only: true,
      no_external_calls: true,
      no_vendor_fetch: true,
      no_board_mutation: true,
      no_score_db_mutation: true,
      no_market_current_lines_writes: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_matrix_builder: true,
      volatile_current_retention_today_tomorrow_only: true,
      batches_retained_for_small_audit_metadata: true
    },
    layers_tracked: ["team_game_odds", "hitter_prop_lines", "pitcher_prop_lines"]
  };
}

async function ensureSchema(env) {
  await run(env.MARKET_DB, `CREATE TABLE IF NOT EXISTS market_certifier_batches (
    batch_id TEXT PRIMARY KEY,
    request_id TEXT,
    run_id TEXT,
    worker_name TEXT,
    worker_version TEXT,
    job_key TEXT,
    mode TEXT,
    status TEXT,
    window_start TEXT,
    window_end TEXT,
    prepared_rows_read INTEGER DEFAULT 0,
    prepared_games_checked INTEGER DEFAULT 0,
    current_rows_written INTEGER DEFAULT 0,
    issue_rows_written INTEGER DEFAULT 0,
    hard_blocker_count INTEGER DEFAULT 0,
    warning_count INTEGER DEFAULT 0,
    ready_full_count INTEGER DEFAULT 0,
    ready_with_warnings_count INTEGER DEFAULT 0,
    ready_partial_count INTEGER DEFAULT 0,
    blocked_count INTEGER DEFAULT 0,
    not_applicable_count INTEGER DEFAULT 0,
    certification_status TEXT,
    certification_grade TEXT,
    certification_reason TEXT,
    output_json TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.MARKET_DB, `CREATE TABLE IF NOT EXISTS market_context_readiness_current (
    readiness_key TEXT PRIMARY KEY,
    batch_id TEXT,
    official_date TEXT,
    game_pk INTEGER,
    prepared_row_id TEXT,
    source_key TEXT,
    player_id INTEGER,
    player_name TEXT,
    canonical_prop_key TEXT,
    prop_family TEXT,
    team_odds_context_status TEXT,
    prop_line_context_status TEXT,
    market_context_status TEXT,
    market_context_grade TEXT,
    hard_blocker_count INTEGER DEFAULT 0,
    warning_count INTEGER DEFAULT 0,
    hard_block_reasons_json TEXT,
    warning_reasons_json TEXT,
    details_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.MARKET_DB, `CREATE TABLE IF NOT EXISTS market_context_readiness_issues (
    issue_id TEXT PRIMARY KEY,
    batch_id TEXT,
    official_date TEXT,
    game_pk INTEGER,
    prepared_row_id TEXT,
    player_id INTEGER,
    layer_key TEXT,
    issue_class TEXT,
    severity TEXT,
    issue_type TEXT,
    reason TEXT,
    details_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  // The parsing-quality tracker: per layer, per real vendor source_key (bookmaker), how many
  // rows were seen from the vendor vs successfully normalized (parsed into a canonical prop/
  // player/line) vs matched to a real prepared-board row vs quarantined by a known parsing
  // issue vs a true, unexplained non-match. This is what lets us see, over time, whether
  // parsing is actually improving as fixes land, per source - not just "did the layer run".
  await run(env.MARKET_DB, `CREATE TABLE IF NOT EXISTS market_parsing_tally_current (
    tally_key TEXT PRIMARY KEY,
    batch_id TEXT,
    official_date TEXT,
    layer_key TEXT,
    source_key TEXT,
    rows_seen INTEGER DEFAULT 0,
    rows_normalized INTEGER DEFAULT 0,
    rows_matched_to_board INTEGER DEFAULT 0,
    rows_external_valid_unanchored INTEGER DEFAULT 0,
    rows_quarantined INTEGER DEFAULT 0,
    rows_true_unmatched INTEGER DEFAULT 0,
    normalization_rate_pct REAL,
    match_rate_pct REAL,
    true_unmatched_rate_pct REAL,
    quarantine_reason_breakdown_json TEXT,
    last_computed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.MARKET_DB, `CREATE TABLE IF NOT EXISTS market_parsing_tally_history (
    history_id TEXT PRIMARY KEY,
    tally_key TEXT,
    official_date TEXT,
    layer_key TEXT,
    source_key TEXT,
    rows_seen INTEGER DEFAULT 0,
    rows_normalized INTEGER DEFAULT 0,
    rows_matched_to_board INTEGER DEFAULT 0,
    rows_quarantined INTEGER DEFAULT 0,
    rows_true_unmatched INTEGER DEFAULT 0,
    normalization_rate_pct REAL,
    match_rate_pct REAL,
    recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.MARKET_DB, `CREATE TABLE IF NOT EXISTS market_certifier_slate_current (
    slate_date TEXT PRIMARY KEY,
    batch_id TEXT,
    slate_shape TEXT,
    game_count INTEGER DEFAULT 0,
    computed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.MARKET_DB, "CREATE INDEX IF NOT EXISTS idx_market_context_readiness_current_game ON market_context_readiness_current(official_date, game_pk)");
  await run(env.MARKET_DB, "CREATE INDEX IF NOT EXISTS idx_market_context_readiness_current_player ON market_context_readiness_current(player_id, game_pk)");
  await run(env.MARKET_DB, "CREATE INDEX IF NOT EXISTS idx_market_context_readiness_issues_batch ON market_context_readiness_issues(batch_id)");
  await run(env.MARKET_DB, "CREATE INDEX IF NOT EXISTS idx_market_parsing_tally_current_layer ON market_parsing_tally_current(official_date, layer_key, source_key)");
  await run(env.MARKET_DB, "CREATE INDEX IF NOT EXISTS idx_market_parsing_tally_history_layer ON market_parsing_tally_history(official_date, layer_key, source_key)");
}

function pct(part, whole) {
  const p = Number(part || 0), w = Number(whole || 0);
  return w ? Number((100 * p / w).toFixed(1)) : null;
}

async function readLatestBatch(env, mode) {
  return (await all(env.MARKET_DB, `SELECT * FROM market_context_probe_batches WHERE mode = ? ORDER BY datetime(updated_at) DESC LIMIT 1`, mode))[0] || null;
}

async function readPreparedRows(env) {
  return await all(env.SCORE_DB, `SELECT prepared_row_id, source_key, player_name, resolved_mlb_player_id, canonical_prop_key, line_value, official_game_pk, official_game_time_utc, official_date
    FROM score_board_prepared_current
    WHERE pickable_safe = 1
      AND matchup_status = 'calendar_matched'
      AND player_match_status = 'matched'
      AND official_game_pk IS NOT NULL
      AND official_game_time_utc IS NOT NULL
    ORDER BY official_game_time_utc, prepared_row_id`);
}

function isPitcherProp(prop) {
  const p = String(prop || "").toLowerCase();
  return p.includes("pitcher") || p.includes("earned_runs") || p.includes("hits_allowed") || p.includes("walks_allowed") || p.includes("runs_allowed");
}

// Reads the real per-source-key parsing detail out of a market-line-shape-classifier batch's
// own output_json (source_key_status_counts / book_counts_normalized / normalization_status_
// counts) rather than recomputing it - that worker already computes this correctly per run,
// the certifier's job is to tally and track it over time, not duplicate the parsing logic.
function extractPropParsingTally(batchRow) {
  if (!batchRow) return { rows_seen: 0, per_source: {} };
  const output = parseObjectSafe(batchRow.output_json);
  const rowsSeen = Number(output.parlay_inventory_rows_seen || 0);
  const sourceStatusCounts = (output.parlay_api && output.parlay_api.external_resolver_summary && output.parlay_api.external_resolver_summary.source_key_status_counts) || {};
  const perSource = {};
  for (const [sourceKey, counts] of Object.entries(sourceStatusCounts)) {
    perSource[sourceKey] = {
      rows_seen: Number(counts.rows || 0),
      rows_matched_to_board: Number(counts.board_matched_rows || 0),
      rows_external_valid_unanchored: Number(counts.external_valid_unanchored_rows || 0),
      rows_quarantined: Number(counts.quarantined_rows || 0),
      rows_true_unmatched: Number(counts.true_hard_unmatched_rows || 0)
    };
  }
  return { rows_seen: rowsSeen, per_source: perSource, normalized_total: Number((output.parlay_api && output.parlay_api.normalized_player_prop_rows) || 0) };
}

async function writeParsingTallyForLayer(env, batchId, officialDate, layerKey, perSourceTally, statements) {
  for (const [sourceKey, counts] of Object.entries(perSourceTally)) {
    const tallyKey = `${officialDate}|${layerKey}|${sourceKey}`;
    const normalizationRate = pct(counts.rows_seen - (counts.rows_quarantined || 0), counts.rows_seen);
    const matchRate = pct(counts.rows_matched_to_board, counts.rows_seen);
    const trueUnmatchedRate = pct(counts.rows_true_unmatched, counts.rows_seen);
    statements.push(env.MARKET_DB.prepare(`INSERT OR REPLACE INTO market_parsing_tally_current (tally_key,batch_id,official_date,layer_key,source_key,rows_seen,rows_normalized,rows_matched_to_board,rows_external_valid_unanchored,rows_quarantined,rows_true_unmatched,normalization_rate_pct,match_rate_pct,true_unmatched_rate_pct,quarantine_reason_breakdown_json,last_computed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM market_parsing_tally_current WHERE tally_key=?), CURRENT_TIMESTAMP),CURRENT_TIMESTAMP)`)
      .bind(tallyKey, batchId, officialDate, layerKey, sourceKey, counts.rows_seen, counts.rows_seen - (counts.rows_quarantined || 0), counts.rows_matched_to_board, counts.rows_external_valid_unanchored || 0, counts.rows_quarantined || 0, counts.rows_true_unmatched || 0, normalizationRate, matchRate, trueUnmatchedRate, safeJson(counts.quarantine_breakdown || {}), nowUtc(), tallyKey));
    statements.push(env.MARKET_DB.prepare(`INSERT INTO market_parsing_tally_history (history_id,tally_key,official_date,layer_key,source_key,rows_seen,rows_normalized,rows_matched_to_board,rows_quarantined,rows_true_unmatched,normalization_rate_pct,match_rate_pct,recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
      .bind(rid("mkt_parse_hist"), tallyKey, officialDate, layerKey, sourceKey, counts.rows_seen, counts.rows_seen - (counts.rows_quarantined || 0), counts.rows_matched_to_board, counts.rows_quarantined || 0, counts.rows_true_unmatched || 0, normalizationRate, matchRate));
  }
}

// Reads real per-game team-odds coverage out of the market-normalizer batch's own coverage
// object (game_context_present / missing), keyed by game_pk via the event_map table, rather
// than re-deriving mapping logic that worker already owns.
async function readTeamOddsGameCoverage(env, today, tomorrow) {
  const rows = await all(env.MARKET_DB, `SELECT game_pk, mapping_status FROM market_context_probe_event_map WHERE slate_window_key = ? OR official_date IN (?, ?)`, `${today}_${tomorrow}`, today, tomorrow);
  const covered = new Set();
  for (const r of rows) if (r.mapping_status === "mapped" && r.game_pk) covered.add(String(r.game_pk));
  return covered;
}

async function runCertifier(env, input) {
  const startedAt = nowUtc();
  const batchId = rid("market_certifier_batch");
  const today = ptDate(0);
  const tomorrow = ptDate(1);
  await ensureSchema(env);

  await run(env.MARKET_DB, `INSERT OR REPLACE INTO market_certifier_batches (batch_id,request_id,run_id,worker_name,worker_version,job_key,mode,status,window_start,window_end,started_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
    batchId, input.request_id || null, input.run_id || null, WORKER_NAME, VERSION, JOB_KEY, input.mode || "market_context_readiness_refresh", "running", today, tomorrow, startedAt);

  await run(env.MARKET_DB, "DELETE FROM market_context_readiness_current WHERE official_date NOT IN (?, ?)", today, tomorrow);
  await run(env.MARKET_DB, "DELETE FROM market_context_readiness_issues WHERE official_date NOT IN (?, ?)", today, tomorrow);
  await run(env.MARKET_DB, "DELETE FROM market_context_readiness_current WHERE official_date IN (?, ?)", today, tomorrow);
  await run(env.MARKET_DB, "DELETE FROM market_context_readiness_issues WHERE official_date IN (?, ?)", today, tomorrow);

  const prepared = await readPreparedRows(env);
  const todayCount = prepared.filter(r => r.official_date === today).length;
  const tomorrowCount = prepared.filter(r => r.official_date === tomorrow).length;
  const slateShape = determineSlateShape(todayCount, tomorrowCount);
  const gamePks = [...new Set(prepared.map(r => r.official_game_pk).filter(Boolean))];
  await run(env.MARKET_DB, `INSERT OR REPLACE INTO market_certifier_slate_current (slate_date,batch_id,slate_shape,game_count,computed_at,created_at,updated_at) VALUES (?,?,?,?,?,COALESCE((SELECT created_at FROM market_certifier_slate_current WHERE slate_date=?), CURRENT_TIMESTAMP),CURRENT_TIMESTAMP)`, today, batchId, slateShape, todayCount > 0 ? new Set(prepared.filter(r=>r.official_date===today).map(r=>r.official_game_pk)).size : 0, nowUtc(), today);

  const [teamBatch, hitterBatch, pitcherBatch] = await Promise.all([
    readLatestBatch(env, "market_teams_game_odds"),
    readLatestBatch(env, "market_hitter_prop_line_context"),
    readLatestBatch(env, "market_pitcher_prop_line_context")
  ]);
  const teamCoverage = await readTeamOddsGameCoverage(env, today, tomorrow);
  const hitterTally = extractPropParsingTally(hitterBatch);
  const pitcherTally = extractPropParsingTally(pitcherBatch);

  const tallyStatements = [];
  await writeParsingTallyForLayer(env, batchId, today, "hitter_prop_lines", hitterTally.per_source, tallyStatements);
  await writeParsingTallyForLayer(env, batchId, today, "pitcher_prop_lines", pitcherTally.per_source, tallyStatements);
  await batchRun(env.MARKET_DB, tallyStatements, 80);

  // Cross-reference: for each real prepared-board row, does it have team-odds context for its
  // game, and prop-line context for its own player/prop? This mirrors Daily Context's per-row
  // readiness pattern but scoped to the 3 real market layers instead of 7 daily-context layers.
  const propRowsHitter = hitterBatch ? await all(env.MARKET_DB, `SELECT prepared_row_id, source_key, mapping_status FROM market_context_probe_player_props WHERE batch_id = ?`, hitterBatch.batch_id) : [];
  const propRowsPitcher = pitcherBatch ? await all(env.MARKET_DB, `SELECT prepared_row_id, source_key, mapping_status FROM market_context_probe_player_props WHERE batch_id = ?`, pitcherBatch.batch_id) : [];
  const propMatchedSet = new Set([...propRowsHitter, ...propRowsPitcher].filter(r => r.prepared_row_id && String(r.mapping_status || "").startsWith("matched")).map(r => r.prepared_row_id));

  const counts = { hard: 0, warning: 0, rows: 0, issues: 0, ready_full: 0, ready_warnings: 0, ready_partial: 0, blocked: 0, not_applicable: 0 };
  const currentStatements = [];
  const issueRows = [];
  const insertCurrentSql = `INSERT OR REPLACE INTO market_context_readiness_current (readiness_key,batch_id,official_date,game_pk,prepared_row_id,source_key,player_id,player_name,canonical_prop_key,prop_family,team_odds_context_status,prop_line_context_status,market_context_status,market_context_grade,hard_blocker_count,warning_count,hard_block_reasons_json,warning_reasons_json,details_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`;

  for (const p of prepared) {
    const propFamily = isPitcherProp(p.canonical_prop_key) ? "pitcher" : "hitter";
    const hasTeamOdds = teamCoverage.has(String(p.official_game_pk));
    const hasPropLine = propMatchedSet.has(p.prepared_row_id);
    const hard = [], warnings = [];
    if (!hasTeamOdds) warnings.push({ layer: "team_game_odds", type: "missing_team_odds_context", reason: "No mapped sportsbook game-odds context for this game yet" });
    if (!hasPropLine) warnings.push({ layer: `${propFamily}_prop_lines`, type: "missing_prop_line_context", reason: `No matched ${propFamily} prop-line vendor evidence for this player/prop yet` });

    let status = "ready_full_context", grade = "READY_FULL_MARKET_CONTEXT";
    if (!hasTeamOdds && !hasPropLine) { status = "no_market_context"; grade = "NO_MARKET_CONTEXT"; counts.blocked++; }
    else if (!hasTeamOdds || !hasPropLine) { status = "partial_market_context"; grade = "READY_PARTIAL_MARKET_CONTEXT"; counts.ready_partial++; }
    else { counts.ready_full++; }
    counts.warning += warnings.length; counts.rows++;

    for (const w of warnings) { counts.issues++; issueRows.push(env.MARKET_DB.prepare(`INSERT OR REPLACE INTO market_context_readiness_issues (issue_id,batch_id,official_date,game_pk,prepared_row_id,player_id,layer_key,issue_class,severity,issue_type,reason,details_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(rid("mkt_issue"), batchId, p.official_date, p.official_game_pk, p.prepared_row_id, p.resolved_mlb_player_id || null, w.layer, "warning", "warning", w.type, w.reason, safeJson({ prop_family: propFamily }))); }

    currentStatements.push(env.MARKET_DB.prepare(insertCurrentSql).bind(
      `mkt_${p.prepared_row_id}`, batchId, p.official_date, p.official_game_pk, p.prepared_row_id, p.source_key, p.resolved_mlb_player_id || null, p.player_name, p.canonical_prop_key, propFamily,
      hasTeamOdds ? "present" : "missing", hasPropLine ? "present" : "missing", status, grade, hard.length, warnings.length,
      safeJson(hard), safeJson(warnings), safeJson({ line_value: p.line_value, official_game_time_utc: p.official_game_time_utc })
    ));
  }
  await batchRun(env.MARKET_DB, currentStatements, 80);
  await batchRun(env.MARKET_DB, issueRows, 80);

  const output = {
    ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY,
    request_id: input.request_id || null, run_id: input.run_id || null, batch_id: batchId,
    status: "completed", certification: "MARKET_CONTEXT_CERTIFIED_READINESS_AND_PARSING_LEDGER_WRITTEN",
    certification_grade: counts.blocked ? "PASS_WITH_GAPS" : (counts.warning ? "PASS_WITH_WARNINGS" : "PASS"),
    window_start: today, window_end: tomorrow, slate_shape: slateShape,
    prepared_rows_read: prepared.length, prepared_games_checked: gamePks.length,
    current_rows_written: counts.rows, issue_rows_written: counts.issues,
    warning_count: counts.warning, ready_full_context_count: counts.ready_full,
    partial_context_count: counts.ready_partial, no_context_count: counts.blocked,
    layer_source_batches: {
      team_game_odds: teamBatch ? { batch_id: teamBatch.batch_id, updated_at: teamBatch.updated_at, certification_status: teamBatch.certification_status } : null,
      hitter_prop_lines: hitterBatch ? { batch_id: hitterBatch.batch_id, updated_at: hitterBatch.updated_at, certification_status: hitterBatch.certification_status } : null,
      pitcher_prop_lines: pitcherBatch ? { batch_id: pitcherBatch.batch_id, updated_at: pitcherBatch.updated_at, certification_status: pitcherBatch.certification_status } : null
    },
    parsing_tally: {
      hitter_prop_lines: { rows_seen: hitterTally.rows_seen, per_source: hitterTally.per_source },
      pitcher_prop_lines: { rows_seen: pitcherTally.rows_seen, per_source: pitcherTally.per_source }
    },
    team_odds_games_covered: teamCoverage.size,
    external_calls: 0, external_calls_performed: 0, rows_read: prepared.length, rows_written: counts.rows,
    guardrails: baseIdentity(env).guardrails, completed_at: nowUtc()
  };

  await run(env.MARKET_DB, `UPDATE market_certifier_batches SET status='completed', prepared_rows_read=?, prepared_games_checked=?, current_rows_written=?, issue_rows_written=?, warning_count=?, ready_full_count=?, ready_partial_count=?, blocked_count=?, certification_status=?, certification_grade=?, certification_reason=?, output_json=?, completed_at=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    prepared.length, gamePks.length, counts.rows, counts.issues, counts.warning, counts.ready_full, counts.ready_partial, counts.blocked, output.certification, output.certification_grade, "Market context readiness + real parsing-quality tally written per layer/source", safeJson(output), output.completed_at, batchId);
  return output;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return jsonResponse({ ok: true });
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();
    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));
    if (method === "GET" && path === "/health") return jsonResponse({ ...baseIdentity(env), route: "/health", checks: { db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS), vars: varPresence(env, EXPECTED_VARS) } });
    if (method === "POST" && path === "/diagnostic") return jsonResponse({ ...baseIdentity(env), route: "/diagnostic", writes_performed: 0, external_calls_performed: 0 });
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const HARD_DEADLINE_MS = 40000;
      const TIMEOUT_SENTINEL = { __hard_deadline_timeout__: true };
      try {
        const out = await withDeadline(runCertifier(env, input), HARD_DEADLINE_MS, TIMEOUT_SENTINEL);
        if (out === TIMEOUT_SENTINEL) {
          return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "hard_deadline_timeout", certification: "MARKET_CERTIFIER_HARD_DEADLINE_TIMEOUT", error: `Worker exceeded its own ${HARD_DEADLINE_MS}ms internal deadline`, hard_deadline_ms: HARD_DEADLINE_MS, timestamp_utc: nowUtc() }, 200);
        }
        return jsonResponse(out);
      } catch (e) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "failed", certification: "MARKET_CONTEXT_CERTIFIER_FAILED", error: String(e && e.message ? e.message : e), stack_preview: String(e && e.stack ? e.stack : "").slice(0, 900), external_calls: 0, external_calls_performed: 0 }, 500);
      }
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
