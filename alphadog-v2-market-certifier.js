import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-market-certifier";
const VERSION = "alphadog-v2-market-certifier-v0.2.0-postgres-rewire";
const JOB_KEY = "market-certifier";

function pg(env) { return postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false, prepare: false, connect_timeout: 8, connection: { statement_timeout: 60000, idle_in_transaction_session_timeout: 60000 } }); }
function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,x-ingest-token,x-admin-token,authorization", "access-control-allow-methods": "GET,POST,OPTIONS" }
  });
}
async function readJsonSafe(request) { try { return await request.json(); } catch (_) { return {}; } }
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
function safeJson(value, max = 10000) {
  if (value === undefined || value === null) return null;
  let text;
  try { text = typeof value === "string" ? value : JSON.stringify(value); } catch (_) { text = String(value); }
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}
function bindingPresence(env, names) { const out = {}; for (const name of names) out[name] = Boolean(env && env[name]); return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
function ptDate(offsetDays = 0) {
  const base = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(base);
  const m = {}; parts.forEach(p => { m[p.type] = p.value; });
  const d = new Date(`${m.year}-${m.month}-${m.day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
function pct(part, whole) {
  const p = Number(part || 0), w = Number(whole || 0);
  return w ? Number((100 * p / w).toFixed(1)) : null;
}
function isPitcherProp(prop) {
  const p = String(prop || "").toLowerCase();
  return p.includes("pitcher") || p.includes("earned_runs") || p.includes("hits_allowed") || p.includes("walks_allowed") || p.includes("runs_allowed");
}

function baseIdentity(env) {
  const db = { HYPERDRIVE: Boolean(env && env.HYPERDRIVE) };
  return {
    ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY,
    status: "READY_MARKET_CONTEXT_READINESS_AND_PARSING_CERTIFIER", timestamp_utc: nowUtc(),
    phase: "market-context-readiness-and-parsing-certifier",
    binding_summary: { required_db_bindings_present: allTrue(db) },
    guardrails: { readiness_and_parsing_tally_only: true, no_external_calls: true, no_vendor_fetch: true, no_board_mutation: true, no_score_db_mutation: true, no_market_current_lines_writes: true, no_scoring: true, no_ranking: true, no_final_board: true, no_matrix_builder: true, volatile_current_retention_today_tomorrow_only: true, batches_retained_for_small_audit_metadata: true },
    layers_tracked: ["team_game_odds", "hitter_prop_lines", "pitcher_prop_lines"]
  };
}

async function readLatestBatch(pgClient, mode) {
  const rows = await pgClient`SELECT * FROM market.context_probe_batches WHERE mode = ${mode} ORDER BY updated_at DESC LIMIT 1`;
  return rows[0] || null;
}
async function readPreparedRows(pgClient) {
  return pgClient`SELECT prepared_row_id, source_key, player_name, resolved_mlb_player_id, canonical_prop_key, line_value, official_game_pk, official_game_time_utc, official_date::text AS official_date
    FROM score.board_prepared_current
    WHERE pickable_safe = 1 AND matchup_status = 'calendar_matched' AND player_match_status = 'matched'
      AND official_game_pk IS NOT NULL AND official_game_time_utc IS NOT NULL
    ORDER BY official_game_time_utc, prepared_row_id`;
}
async function computePropParsingTally(pgClient, batchId) {
  if (!batchId) return { rows_seen: 0, per_source: {} };
  const rows = await pgClient`SELECT source_key, mapping_status, COUNT(*) AS c FROM market.context_probe_player_props WHERE batch_id = ${batchId} GROUP BY source_key, mapping_status`;
  const perSource = {};
  let rowsSeen = 0;
  for (const r of rows) {
    const sourceKey = String(r.source_key || "unknown");
    const status = String(r.mapping_status || "");
    const count = Number(r.c || 0);
    rowsSeen += count;
    if (!perSource[sourceKey]) perSource[sourceKey] = { rows_seen: 0, rows_matched_to_board: 0, rows_external_valid_unanchored: 0, rows_quarantined: 0, rows_true_unmatched: 0 };
    perSource[sourceKey].rows_seen += count;
    if (status.startsWith("matched_")) perSource[sourceKey].rows_matched_to_board += count;
    else if (status === "external_valid_player_resolved_not_on_prepared_board") perSource[sourceKey].rows_external_valid_unanchored += count;
    else if (status.startsWith("quarantined_")) perSource[sourceKey].rows_quarantined += count;
    else perSource[sourceKey].rows_true_unmatched += count;
  }
  return { rows_seen: rowsSeen, per_source: perSource };
}
async function writeParsingTallyForLayer(pgClient, batchId, officialDate, layerKey, perSourceTally, rowsOut) {
  for (const [sourceKey, counts] of Object.entries(perSourceTally)) {
    const tallyKey = `${officialDate}|${layerKey}|${sourceKey}`;
    const normalizationRate = pct(counts.rows_seen - (counts.rows_quarantined || 0), counts.rows_seen);
    const matchRate = pct(counts.rows_matched_to_board, counts.rows_seen);
    const trueUnmatchedRate = pct(counts.rows_true_unmatched, counts.rows_seen);
    rowsOut.push({
      tally_key: tallyKey, batch_id: batchId, official_date: officialDate, layer_key: layerKey, source_key: sourceKey,
      rows_seen: counts.rows_seen, rows_normalized: counts.rows_seen - (counts.rows_quarantined || 0), rows_matched_to_board: counts.rows_matched_to_board,
      rows_external_valid_unanchored: counts.rows_external_valid_unanchored || 0, rows_quarantined: counts.rows_quarantined || 0, rows_true_unmatched: counts.rows_true_unmatched || 0,
      normalization_rate_pct: normalizationRate, match_rate_pct: matchRate, true_unmatched_rate_pct: trueUnmatchedRate,
      quarantine_reason_breakdown_json: safeJson(counts.quarantine_breakdown || {})
    });
  }
}
async function readTeamOddsGameCoverage(pgClient, boardWindowDates) {
  const datesLiteral = "{" + boardWindowDates.map(d => `"${String(d).replace(/"/g, '\\"')}"`).join(",") + "}";
  const rows = await pgClient`SELECT game_pk, mapping_status FROM market.context_probe_event_map WHERE official_date::text = ANY(${datesLiteral}::text[])`;
  const covered = new Set();
  for (const r of rows) if (r.mapping_status === "mapped" && r.game_pk) covered.add(String(r.game_pk));
  return covered;
}

async function runCertifier(pgClient, input) {
  const startedAt = nowUtc();
  const batchId = rid("market_certifier_batch");

  const preparedAllDates = await readPreparedRows(pgClient);
  const gamePksAllDates = [...new Set(preparedAllDates.map(r => r.official_game_pk).filter(Boolean))];
  const gamesAllDatesLiteral = "{" + gamePksAllDates.join(",") + "}";
  const gamesAllDates = gamePksAllDates.length ? await pgClient`SELECT game_pk, official_date::text AS official_date, game_time_utc, is_final, is_postponed, is_cancelled FROM calendar.game_calendar WHERE game_pk = ANY(${gamesAllDatesLiteral}::bigint[])` : [];
  const gameMapAllDates = new Map(gamesAllDates.map(g => [String(g.game_pk), g]));
  const nowIsoForStartCheck = nowUtc();
  function gameHasStarted(gamePk) {
    const g = gameMapAllDates.get(String(gamePk));
    if (!g) return false;
    if (Number(g.is_final) === 1 || Number(g.is_postponed) === 1 || Number(g.is_cancelled) === 1) return true;
    if (g.game_time_utc && new Date(g.game_time_utc).toISOString() <= nowIsoForStartCheck) return true;
    return false;
  }
  const notYetStartedDates = [...new Set(preparedAllDates.filter(r => !gameHasStarted(r.official_game_pk)).map(r => r.official_date).filter(Boolean))];
  const boardWindowDates = [...new Set([...notYetStartedDates, ptDate(0), ptDate(1)])].sort();
  const today = boardWindowDates[0];
  const tomorrow = boardWindowDates[boardWindowDates.length - 1];
  const windowLiteral = "{" + boardWindowDates.map(d => `"${String(d).replace(/"/g, '\\"')}"`).join(",") + "}";

  await pgClient`DELETE FROM market.parsing_tally_history WHERE recorded_at < now() - interval '30 days'`;
  await pgClient`DELETE FROM market.certifier_batches WHERE created_at < now() - interval '60 days'`;

  await pgClient`INSERT INTO market.certifier_batches (batch_id, request_id, run_id, worker_name, worker_version, job_key, mode, status, window_start, window_end, started_at, created_at, updated_at)
    VALUES (${batchId}, ${input.request_id || null}, ${input.run_id || null}, ${WORKER_NAME}, ${VERSION}, ${JOB_KEY}, ${input.mode || "market_context_readiness_refresh"}, 'running', ${boardWindowDates[0]}, ${boardWindowDates[boardWindowDates.length - 1]}, ${startedAt}, now(), now())`;

  await pgClient`DELETE FROM market.context_readiness_current WHERE NOT (official_date::text = ANY(${windowLiteral}::text[]))`;
  await pgClient`DELETE FROM market.context_readiness_issues WHERE NOT (official_date::text = ANY(${windowLiteral}::text[]))`;
  await pgClient`DELETE FROM market.context_readiness_current WHERE official_date::text = ANY(${windowLiteral}::text[])`;
  await pgClient`DELETE FROM market.context_readiness_issues WHERE official_date::text = ANY(${windowLiteral}::text[])`;

  const prepared = preparedAllDates.filter(r => !gameHasStarted(r.official_game_pk));
  const todayCount = prepared.filter(r => r.official_date === today).length;
  const tomorrowCount = prepared.filter(r => r.official_date === tomorrow).length;
  const totalBoardGameCount = new Set(prepared.map(r => String(r.official_game_pk))).size;
  const slateShape = totalBoardGameCount > 0 ? "board_scoped_multi_date" : "no_games";
  const gamePks = [...new Set(prepared.map(r => r.official_game_pk).filter(Boolean))];
  for (const d of boardWindowDates) {
    const gameCountForDate = new Set(prepared.filter(r => r.official_date === d).map(r => r.official_game_pk)).size;
    await pgClient`INSERT INTO market.certifier_slate_current (slate_date, batch_id, slate_shape, game_count, computed_at, created_at, updated_at)
      VALUES (${d}, ${batchId}, ${slateShape}, ${gameCountForDate}, ${nowUtc()}, now(), now())
      ON CONFLICT (slate_date) DO UPDATE SET batch_id=EXCLUDED.batch_id, slate_shape=EXCLUDED.slate_shape, game_count=EXCLUDED.game_count, computed_at=EXCLUDED.computed_at, updated_at=now()`;
  }

  const [teamBatch, hitterBatch, pitcherBatch] = await Promise.all([
    readLatestBatch(pgClient, "market_teams_game_odds"),
    readLatestBatch(pgClient, "market_hitter_prop_line_context"),
    readLatestBatch(pgClient, "market_pitcher_prop_line_context")
  ]);
  const teamCoverage = await readTeamOddsGameCoverage(pgClient, boardWindowDates);
  const hitterTally = await computePropParsingTally(pgClient, hitterBatch && hitterBatch.batch_id);
  const pitcherTally = await computePropParsingTally(pgClient, pitcherBatch && pitcherBatch.batch_id);

  const tallyRows = [];
  await writeParsingTallyForLayer(pgClient, batchId, today, "hitter_prop_lines", hitterTally.per_source, tallyRows);
  await writeParsingTallyForLayer(pgClient, batchId, today, "pitcher_prop_lines", pitcherTally.per_source, tallyRows);
  const tallyCols = ["tally_key", "batch_id", "official_date", "layer_key", "source_key", "rows_seen", "rows_normalized", "rows_matched_to_board", "rows_external_valid_unanchored", "rows_quarantined", "rows_true_unmatched", "normalization_rate_pct", "match_rate_pct", "true_unmatched_rate_pct", "quarantine_reason_breakdown_json"];
  for (const r of tallyRows) {
    await pgClient`INSERT INTO market.parsing_tally_current (tally_key, batch_id, official_date, layer_key, source_key, rows_seen, rows_normalized, rows_matched_to_board, rows_external_valid_unanchored, rows_quarantined, rows_true_unmatched, normalization_rate_pct, match_rate_pct, true_unmatched_rate_pct, quarantine_reason_breakdown_json, last_computed_at, created_at, updated_at)
      VALUES (${r.tally_key}, ${r.batch_id}, ${r.official_date}, ${r.layer_key}, ${r.source_key}, ${r.rows_seen}, ${r.rows_normalized}, ${r.rows_matched_to_board}, ${r.rows_external_valid_unanchored}, ${r.rows_quarantined}, ${r.rows_true_unmatched}, ${r.normalization_rate_pct}, ${r.match_rate_pct}, ${r.true_unmatched_rate_pct}, ${r.quarantine_reason_breakdown_json}, ${nowUtc()}, now(), now())
      ON CONFLICT (tally_key) DO UPDATE SET batch_id=EXCLUDED.batch_id, rows_seen=EXCLUDED.rows_seen, rows_normalized=EXCLUDED.rows_normalized, rows_matched_to_board=EXCLUDED.rows_matched_to_board, rows_external_valid_unanchored=EXCLUDED.rows_external_valid_unanchored, rows_quarantined=EXCLUDED.rows_quarantined, rows_true_unmatched=EXCLUDED.rows_true_unmatched, normalization_rate_pct=EXCLUDED.normalization_rate_pct, match_rate_pct=EXCLUDED.match_rate_pct, true_unmatched_rate_pct=EXCLUDED.true_unmatched_rate_pct, quarantine_reason_breakdown_json=EXCLUDED.quarantine_reason_breakdown_json, last_computed_at=EXCLUDED.last_computed_at, updated_at=now()`;
    await pgClient`INSERT INTO market.parsing_tally_history (history_id, tally_key, official_date, layer_key, source_key, rows_seen, rows_normalized, rows_matched_to_board, rows_quarantined, rows_true_unmatched, normalization_rate_pct, match_rate_pct, recorded_at)
      VALUES (${rid("mkt_parse_hist")}, ${r.tally_key}, ${r.official_date}, ${r.layer_key}, ${r.source_key}, ${r.rows_seen}, ${r.rows_normalized}, ${r.rows_matched_to_board}, ${r.rows_quarantined}, ${r.rows_true_unmatched}, ${r.normalization_rate_pct}, ${r.match_rate_pct}, now())`;
  }

  const hitterBatchIdForProps = hitterBatch && hitterBatch.batch_id;
  const pitcherBatchIdForProps = pitcherBatch && pitcherBatch.batch_id;
  const propRowsHitter = hitterBatchIdForProps ? await pgClient`SELECT prepared_row_id, source_key, mapping_status FROM market.context_probe_player_props WHERE batch_id = ${hitterBatchIdForProps}` : [];
  const propRowsPitcher = pitcherBatchIdForProps ? await pgClient`SELECT prepared_row_id, source_key, mapping_status FROM market.context_probe_player_props WHERE batch_id = ${pitcherBatchIdForProps}` : [];
  const propMatchedSet = new Set([...propRowsHitter, ...propRowsPitcher].filter(r => r.prepared_row_id && String(r.mapping_status || "").startsWith("matched")).map(r => r.prepared_row_id));

  const counts = { hard: 0, warning: 0, rows: 0, issues: 0, ready_full: 0, ready_warnings: 0, ready_partial: 0, blocked: 0, not_applicable: 0 };
  const currentRows = []; const issueRows = [];

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

    for (const w of warnings) { counts.issues++; issueRows.push({ issue_id: rid("mkt_issue"), batch_id: batchId, official_date: p.official_date, game_pk: p.official_game_pk, prepared_row_id: p.prepared_row_id, player_id: p.resolved_mlb_player_id || null, layer_key: w.layer, issue_class: "warning", severity: "warning", issue_type: w.type, reason: w.reason, details_json: safeJson({ prop_family: propFamily }) }); }

    currentRows.push({
      readiness_key: `mkt_${p.prepared_row_id}`, batch_id: batchId, official_date: p.official_date, game_pk: p.official_game_pk, prepared_row_id: p.prepared_row_id, source_key: p.source_key,
      player_id: p.resolved_mlb_player_id || null, player_name: p.player_name, canonical_prop_key: p.canonical_prop_key, prop_family: propFamily,
      team_odds_context_status: hasTeamOdds ? "present" : "missing", prop_line_context_status: hasPropLine ? "present" : "missing", market_context_status: status, market_context_grade: grade,
      hard_blocker_count: hard.length, warning_count: warnings.length, hard_block_reasons_json: safeJson(hard), warning_reasons_json: safeJson(warnings),
      details_json: safeJson({ line_value: p.line_value, official_game_time_utc: p.official_game_time_utc })
    });
  }
  const currentCols = ["readiness_key", "batch_id", "official_date", "game_pk", "prepared_row_id", "source_key", "player_id", "player_name", "canonical_prop_key", "prop_family", "team_odds_context_status", "prop_line_context_status", "market_context_status", "market_context_grade", "hard_blocker_count", "warning_count", "hard_block_reasons_json", "warning_reasons_json", "details_json"];
  const issueCols = ["issue_id", "batch_id", "official_date", "game_pk", "prepared_row_id", "player_id", "layer_key", "issue_class", "severity", "issue_type", "reason", "details_json"];
  const CHUNK = 300;
  for (let i = 0; i < currentRows.length; i += CHUNK) await pgClient`INSERT INTO market.context_readiness_current ${pgClient(currentRows.slice(i, i + CHUNK), ...currentCols)}`;
  for (let i = 0; i < issueRows.length; i += CHUNK) await pgClient`INSERT INTO market.context_readiness_issues ${pgClient(issueRows.slice(i, i + CHUNK), ...issueCols)}`;

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
    parsing_tally: { hitter_prop_lines: { rows_seen: hitterTally.rows_seen, per_source: hitterTally.per_source }, pitcher_prop_lines: { rows_seen: pitcherTally.rows_seen, per_source: pitcherTally.per_source } },
    team_odds_games_covered: teamCoverage.size,
    external_calls: 0, external_calls_performed: 0, rows_read: prepared.length, rows_written: counts.rows,
    guardrails: baseIdentity({ HYPERDRIVE: true }).guardrails, completed_at: nowUtc()
  };

  await pgClient`UPDATE market.certifier_batches SET status='completed', prepared_rows_read=${prepared.length}, prepared_games_checked=${gamePks.length}, current_rows_written=${counts.rows}, issue_rows_written=${counts.issues}, warning_count=${counts.warning}, ready_full_count=${counts.ready_full}, ready_partial_count=${counts.ready_partial}, blocked_count=${counts.blocked}, certification_status=${output.certification}, certification_grade=${output.certification_grade}, certification_reason='Market context readiness + real parsing-quality tally written per layer/source', output_json=${safeJson(output)}, completed_at=${output.completed_at}, updated_at=now() WHERE batch_id=${batchId}`;
  return output;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return jsonResponse({ ok: true });
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();
    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));
    if (method === "GET" && path === "/health") return jsonResponse({ ...baseIdentity(env), route: "/health", checks: { db_bindings: bindingPresence(env, ["HYPERDRIVE"]) } });
    if (method === "POST" && path === "/diagnostic") return jsonResponse({ ...baseIdentity(env), route: "/diagnostic", writes_performed: 0, external_calls_performed: 0 });
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const pgClient = pg(env);
      try {
        const out = await runCertifier(pgClient, input);
        return jsonResponse(out);
      } catch (e) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "failed", certification: "MARKET_CONTEXT_CERTIFIER_FAILED", error: String(e && e.message ? e.message : e), stack_preview: String(e && e.stack ? e.stack : "").slice(0, 900), external_calls: 0, external_calls_performed: 0 }, 500);
      } finally {
        await pgClient.end({ timeout: 1 }).catch(() => {});
      }
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
