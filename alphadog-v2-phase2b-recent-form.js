import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-phase2b-recent-form";
const LOGICAL_WORKER_NAME = "alphadog-v2-prop-factor-miner";
const JOB_KEY = "prop-factor-miner";
const SYSTEM_VERSION = "alphadog-v2-prop-factor-miner-v0.3.0-postgres-rewire";
const DEPLOYED_SLOT_VERSION = "alphadog-v2-phase2b-recent-form-v0.4.0-postgres-rewire";

const HITTER_PACKET_FLUSH_SIZE = 100;
const PITCHER_PACKET_FLUSH_SIZE = 250;
const HITTER_MAX_FACTOR_ROWS_PER_INVOCATION = 50000;
const PITCHER_MAX_FACTOR_ROWS_PER_INVOCATION = 50000;
const HITTER_SOFT_TIMEBOX_MS = 280000;
const PITCHER_SOFT_TIMEBOX_MS = 280000;

function pg(env) { return postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false, prepare: false, connect_timeout: 8, connection: { statement_timeout: 240000, idle_in_transaction_session_timeout: 240000 } }); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function nowIso() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function safeJsonParse(s, fallback = null) {
  if (!s) return fallback;
  if (typeof s === "object") return s;
  try { return JSON.parse(s); } catch (_) { return fallback; }
}
function dateOnly(d) { return d.toISOString().slice(0, 10); }
function ptTodayTomorrow() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const m = {}; for (const p of parts) m[p.type] = p.value;
  const today = `${m.year}-${m.month}-${m.day}`;
  const t = new Date(`${today}T12:00:00-07:00`);
  t.setDate(t.getDate() + 1);
  return [today, dateOnly(t)];
}
function modeFamily(mode) {
  const m = String(mode || "").toLowerCase();
  if (m === "pitcher_prop_factor_mining" || m === "pitcher" || m === "pitchers") return "pitcher";
  return "hitter";
}
function allTrue(obj) { return Object.values(obj).every(Boolean); }
function key(...parts) { return parts.map(v => v === null || v === undefined ? "" : String(v)).join("|"); }
function pushMapArray(map, k, row) { if (!map.has(k)) map.set(k, []); map.get(k).push(row); }
function latestRowsBy(rows, keyFn, dateField = "updated_at") {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    const prev = m.get(k);
    if (!prev || String(r[dateField] || r.created_at || "") >= String(prev[dateField] || prev.created_at || "")) m.set(k, r);
  }
  return m;
}
function arrLit(arr) {
  if (!arr.length) return null;
  if (typeof arr[0] === "string") return "{" + arr.map(v => `"${String(v).replace(/"/g, '\\"')}"`).join(",") + "}";
  return "{" + arr.join(",") + "}";
}

let TAXONOMY_CACHE = null;
async function loadTaxonomyClassifier(pgClient) {
  if (TAXONOMY_CACHE) return TAXONOMY_CACHE;
  const rows = await pgClient`SELECT prop_key, player_side FROM config.prop_taxonomy`;
  const map = new Map();
  for (const r of rows) {
    const side = String(r.player_side || "").toLowerCase();
    let family;
    if (side === "hitter") family = "hitter";
    else if (side === "pitcher" || side === "game_pitcher") family = "pitcher";
    else if (side === "pitcher_combo") family = "deferred";
    else family = "ambiguous_disambiguate_by_source_name";
    map.set(String(r.prop_key || "").toLowerCase(), family);
  }
  TAXONOMY_CACHE = map;
  return map;
}
function classifyProp(propKey, sourcePropName) {
  const keyLc = String(propKey || "").toLowerCase();
  const sourceName = String(sourcePropName || "").toLowerCase();
  const taxonomyMap = TAXONOMY_CACHE;
  if (!taxonomyMap || !taxonomyMap.has(keyLc)) return { family: "unknown", normalized_lane: keyLc || null, supported: false, reason: "UNSUPPORTED_PROP_KEY_NOT_IN_TAXONOMY" };
  const family = taxonomyMap.get(keyLc);
  if (family === "deferred") return { family: "deferred", normalized_lane: keyLc, supported: false, reason: "PROP_DEFERRED_PENDING_SEPARATE_DESIGN" };
  if (family === "ambiguous_disambiguate_by_source_name") {
    const isPitcherFantasy = sourceName.includes("pitch");
    return { family: isPitcherFantasy ? "pitcher" : "hitter", normalized_lane: isPitcherFantasy ? "pitcher_fantasy" : "hitter_fantasy", supported: true };
  }
  const lane = keyLc === "pitching_outs" ? "pitcher_outs" : (keyLc === "earned_runs_allowed" ? "earned_runs" : keyLc);
  return { family, normalized_lane: lane, supported: true };
}

async function retentionCleanup(pgClient, dates, family) {
  const datesLit = arrLit(dates);
  await pgClient`DELETE FROM scoring.prop_factor_hitter_packets WHERE NOT (official_date = ANY(${datesLit}::text[]))`;
  await pgClient`DELETE FROM scoring.prop_factor_pitcher_packets WHERE NOT (official_date = ANY(${datesLit}::text[]))`;
  await pgClient`DELETE FROM scoring.prop_factor_issues WHERE official_date IS NOT NULL AND NOT (official_date = ANY(${datesLit}::text[]))`;
  await pgClient`DELETE FROM scoring.prop_factor_coverage_current WHERE NOT (official_date = ANY(${datesLit}::text[]))`;
  await pgClient`DELETE FROM scoring.prop_factor_batches WHERE NOT (window_start = ANY(${datesLit}::text[])) AND NOT (window_end = ANY(${datesLit}::text[]))`;
  const packetTable = family === "pitcher" ? "scoring.prop_factor_pitcher_packets" : "scoring.prop_factor_hitter_packets";
  await pgClient`DELETE FROM ${pgClient.unsafe(packetTable)} WHERE official_date = ANY(${datesLit}::text[])`;
  await pgClient`DELETE FROM scoring.prop_factor_issues WHERE factor_family=${family} AND official_date = ANY(${datesLit}::text[])`;
  await pgClient`DELETE FROM scoring.prop_factor_coverage_current WHERE factor_family=${family} AND official_date = ANY(${datesLit}::text[])`;
}

async function markStaleRunningBatches(pgClient, dates, family, reason = "STALE_RUNNING_BATCH_MARKED_FAILED_BEFORE_NEW_RUN") {
  const datesLit = arrLit(dates);
  await pgClient`UPDATE scoring.prop_factor_batches
    SET status='failed_stale_interrupted', certification_status=${reason}, certification_grade='FAIL_STALE_INTERRUPTED',
        output_json=${JSON.stringify({ ok: 0, data_ok: 0, version: SYSTEM_VERSION, status: "failed_stale_interrupted", reason })}, updated_at=now()
    WHERE factor_family=${family} AND status='running' AND window_start = ANY(${datesLit}::text[]) AND window_end = ANY(${datesLit}::text[])`;
}

async function getPreparedSourceDiagnostics(pgClient, dates) {
  const datesLit = arrLit(dates);
  const nowIsoV = new Date().toISOString();
  const currentByDateSource = await pgClient`SELECT official_date::text AS official_date, source_key, COUNT(*) AS rows, SUM(CASE WHEN pickable_safe=1 THEN 1 ELSE 0 END) AS pickable_safe_rows FROM score.board_prepared_current GROUP BY official_date, source_key ORDER BY official_date, source_key`;
  const eligibleByDateSource = await pgClient`SELECT official_date::text AS official_date, source_key, COUNT(*) AS eligible_rows, COUNT(DISTINCT official_game_pk) AS games, COUNT(DISTINCT resolved_mlb_player_id) AS players
    FROM score.board_prepared_current
    WHERE official_date::text = ANY(${datesLit}::text[]) AND pickable_safe=1 AND matchup_status='calendar_matched' AND player_match_status='matched' AND official_game_pk IS NOT NULL AND official_game_time_utc IS NOT NULL
    GROUP BY official_date, source_key ORDER BY official_date, source_key`;
  return {
    current_table_by_date_source: currentByDateSource,
    eligible_window_by_date_source: eligibleByDateSource,
    source_keys_eligible_in_window: [...new Set(eligibleByDateSource.map(r => r.source_key).filter(Boolean))],
    window_dates: dates
  };
}

async function getPreparedRows(pgClient, dates) {
  const datesLit = arrLit(dates);
  const nowIsoV = new Date().toISOString();
  return pgClient`SELECT prepared_row_id, prep_batch_id, source_key, source_row_id, source_event_id, projection_id,
      player_name, resolved_player_id, resolved_mlb_player_id, player_match_status, team, opponent,
      team_full_name, opponent_full_name, canonical_prop_key, source_prop_name, line_value, official_game_pk,
      official_game_time_utc, official_date::text AS official_date, matchup_status, pickable_safe, prep_status, block_reason, row_payload_json
    FROM score.board_prepared_current
    WHERE official_date::text = ANY(${datesLit}::text[])
      AND pickable_safe=1
      AND matchup_status='calendar_matched'
      AND player_match_status='matched'
      AND official_game_pk IS NOT NULL
      AND official_game_time_utc IS NOT NULL
      AND official_game_time_utc > ${nowIsoV}
    ORDER BY official_date, official_game_pk, resolved_mlb_player_id, canonical_prop_key, source_key`;
}

function shouldConsiderPreparedRowForFamily(row, family) {
  const classification = classifyProp(row && row.canonical_prop_key, row && row.source_prop_name);
  return classification.family === family || (family === "pitcher" && classification.family === "deferred");
}
function expectedFactorPreparedRows(prepared, family) {
  let n = 0;
  for (const row of prepared || []) if (shouldConsiderPreparedRowForFamily(row, family)) n++;
  return n;
}
async function findRunningPropFactorBatch(pgClient, requestId, family) {
  if (!requestId) return null;
  const rows = await pgClient`SELECT batch_id, request_id, run_id, worker_version, mode, factor_family, status, window_start, window_end, prepared_rows_read, eligible_rows, packets_written
    FROM scoring.prop_factor_batches
    WHERE request_id=${requestId} AND factor_family=${family} AND status IN ('running','partial_continue','partial_continue_factor_packets_chunk_written')
    ORDER BY updated_at DESC LIMIT 1`;
  return rows[0] || null;
}
async function getCoveredPreparedIds(pgClient, batchId, family) {
  const rows = await pgClient`SELECT prepared_row_id FROM scoring.prop_factor_coverage_current WHERE latest_batch_id=${batchId} AND factor_family=${family}`;
  return new Set(rows.map(r => String(r.prepared_row_id || "")).filter(Boolean));
}
async function summarizeFactorBatch(pgClient, batchId, family) {
  const packetTable = family === "pitcher" ? "scoring.prop_factor_pitcher_packets" : "scoring.prop_factor_hitter_packets";
  const packetRows = await pgClient`SELECT
      COUNT(*) AS packets, COUNT(DISTINCT prepared_row_id) AS packet_prepared_rows, COUNT(DISTINCT game_pk) AS games,
      COUNT(DISTINCT mlb_player_id) AS players, COUNT(DISTINCT canonical_prop_key) AS prop_keys,
      SUM(CASE WHEN warning_count > 0 THEN 1 ELSE 0 END) AS warning_rows,
      SUM(CASE WHEN blocker_count > 0 OR factor_status='blocked' THEN 1 ELSE 0 END) AS blocked_rows,
      SUM(CASE WHEN missing_factor_count > 0 THEN 1 ELSE 0 END) AS missing_factor_rows
    FROM ${pgClient.unsafe(packetTable)} WHERE batch_id=${batchId}`;
  const packetSummary = packetRows[0] || {};
  const coverageRows = await pgClient`SELECT COUNT(*) AS coverage_rows, COUNT(DISTINCT prepared_row_id) AS coverage_prepared_rows,
      SUM(CASE WHEN blocking_for_matrix=1 THEN 1 ELSE 0 END) AS coverage_blocked_rows
    FROM scoring.prop_factor_coverage_current WHERE latest_batch_id=${batchId} AND factor_family=${family}`;
  const coverageSummary = coverageRows[0] || {};
  const issueRows = await pgClient`SELECT COUNT(*) AS issue_rows FROM scoring.prop_factor_issues WHERE batch_id=${batchId}`;
  const issueSummary = issueRows[0] || {};
  return {
    packets: Number(packetSummary.packets || 0), packet_prepared_rows: Number(packetSummary.packet_prepared_rows || 0),
    coverage_rows: Number(coverageSummary.coverage_rows || 0), coverage_prepared_rows: Number(coverageSummary.coverage_prepared_rows || 0),
    games: Number(packetSummary.games || 0), players: Number(packetSummary.players || 0), prop_keys: Number(packetSummary.prop_keys || 0),
    warning_rows: Number(packetSummary.warning_rows || 0),
    blocked_rows: Number(packetSummary.blocked_rows || coverageSummary.coverage_blocked_rows || 0),
    missing_factor_rows: Number(packetSummary.missing_factor_rows || 0), issue_rows: Number(issueSummary.issue_rows || 0)
  };
}
function buildPropFactorOutput({ input, family, mode, batchId, runId, dates, status, certification, grade, prepared, expectedRows, summary, processedThisInvocation, remainingRows, preparedDiagnostics, ctx, partial, timeboxBreak = false, invocationElapsedMs = null, resumeFastPath = false }) {
  return {
    ok: true, data_ok: true, version: SYSTEM_VERSION, deployed_slot_version: DEPLOYED_SLOT_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    request_id: input.request_id || null, chain_id: input.chain_id || null, mode, factor_family: family, status, certification, certification_grade: grade, batch_id: batchId, run_id: runId,
    window_dates: dates, prepared_rows_read: prepared.length, expected_factor_rows: expectedRows, eligible_rows: summary.packet_prepared_rows, packets_written: summary.packets,
    blocked_rows: summary.blocked_rows, warning_rows: summary.warning_rows, issue_rows: summary.issue_rows, missing_factor_rows: summary.missing_factor_rows,
    coverage_rows_written: summary.coverage_rows, coverage_prepared_rows: summary.coverage_prepared_rows, coverage_missing_rows: Math.max(0, expectedRows - summary.coverage_prepared_rows),
    rows_processed_this_invocation: processedThisInvocation, remaining_factor_rows: remainingRows, games_processed: summary.games, players: summary.players, prop_keys: summary.prop_keys,
    prepared_source_diagnostics: preparedDiagnostics, chunked_memory_mode: family === "hitter", packet_flush_size: family === "hitter" ? HITTER_PACKET_FLUSH_SIZE : PITCHER_PACKET_FLUSH_SIZE,
    max_factor_rows_per_invocation: family === "hitter" ? HITTER_MAX_FACTOR_ROWS_PER_INVOCATION : PITCHER_MAX_FACTOR_ROWS_PER_INVOCATION,
    soft_timebox_ms: family === "hitter" ? HITTER_SOFT_TIMEBOX_MS : PITCHER_SOFT_TIMEBOX_MS, timebox_break: !!timeboxBreak, invocation_elapsed_ms: invocationElapsedMs,
    continuation_required: !!partial, orchestrator_should_self_continue: !!partial, factor_resume: !!partial, resume_batch_id: partial ? batchId : null,
    coverage_reconciliation_guard_enabled: true, stale_running_batches_marked_before_run: !input.factor_resume, resume_fast_path: !!resumeFastPath,
    coverage_current_written_incrementally: true, retention_policy: "today_tomorrow_only_packets_issues_coverage_and_batches",
    daily_readiness_dates_available: ctx && ctx.readinessDatesAvailable || [], daily_readiness_missing_for_current_window: ctx ? ctx.readinessDatesAvailable.length === 0 : false,
    base_metrics_primary_source: family === "pitcher" ? "pitcher_metric_snapshots" : "hitter_metric_snapshots", legacy_metric_tables_optional: true, legacy_empty_tables_are_not_blocking: true,
    external_calls: 0, no_scoring: true, no_ranking: true, no_final_board: true, no_matrix_builder: true
  };
}

async function loadContext(pgClient, dates) {
  const datesLit = arrLit(dates);
  const ctx = {};
  const gameRows = await pgClient`SELECT game_pk, official_date::text AS official_date, game_time_utc, home_team_id, away_team_id, home_team_name, away_team_name, venue_id, venue_name, status_code, abstract_game_state, detailed_state, is_pregame, is_live, is_final FROM calendar.game_calendar WHERE official_date::text = ANY(${datesLit}::text[])`;
  ctx.games = latestRowsBy(gameRows, r => key(r.game_pk));
  const coverageRows = await pgClient`SELECT game_pk, official_date::text AS official_date, layer_key, coverage_status, live_rows, updated_at FROM team.game_data_coverage WHERE official_date::text = ANY(${datesLit}::text[])`.catch(() => []);
  ctx.gameCoverage = new Map(); for (const r of coverageRows) pushMapArray(ctx.gameCoverage, key(r.game_pk), r);

  const marketCoverageRows = await pgClient`SELECT coverage_row_id, batch_id, official_date::text AS official_date, prepared_row_id, source_key, game_pk, resolved_mlb_player_id, canonical_prop_key, board_line_value, game_market_status, player_prop_market_status, market_context_status, coverage_grade, details_json, created_at FROM market.context_probe_coverage WHERE official_date::text = ANY(${datesLit}::text[])`.catch(() => []);
  ctx.marketCoverage = new Map(); for (const r of marketCoverageRows) pushMapArray(ctx.marketCoverage, key(r.prepared_row_id), r);
  const playerPropRows = await pgClient`SELECT probe_row_id, batch_id, official_date::text AS official_date, prepared_row_id, source_key, source_line_id, game_pk, resolved_mlb_player_id, canonical_prop_key, source_market_key, line_value, price_american, price_decimal, outcome_side, mapping_status, coverage_status, created_at FROM market.context_probe_player_props WHERE official_date::text = ANY(${datesLit}::text[])`.catch(() => []);
  ctx.playerProps = new Map(); for (const r of playerPropRows) pushMapArray(ctx.playerProps, key(r.prepared_row_id), r);
  const gameMarketRows = await pgClient`SELECT summary_row_id, batch_id, official_date::text AS official_date, game_pk, source_key, book_coverage_grade, freshness_status, h2h_book_count, home_ml_consensus, away_ml_consensus, total_book_count, total_consensus_line, over_consensus_price, under_consensus_price, derived_home_implied_runs, derived_away_implied_runs, implied_runs_method, parse_status, warning_flags, created_at FROM market.context_probe_game_market_summary WHERE official_date::text = ANY(${datesLit}::text[])`.catch(() => []);
  ctx.gameMarket = new Map(); for (const r of gameMarketRows) pushMapArray(ctx.gameMarket, key(r.game_pk), r);

  const readinessRows = await pgClient`SELECT readiness_key, batch_id, official_date::text AS official_date, game_pk, prepared_row_id, player_id, canonical_prop_key, context_status, context_grade, hard_blocker_count, warning_count, enrichment_gap_count, starter_context_status, lineup_context_status, player_availability_status, weather_context_status, bullpen_context_status, schedule_spot_context_status, umpire_context_status, hard_block_reasons_json, warning_reasons_json, enrichment_gaps_json, details_json, updated_at FROM context_cert.readiness_current WHERE official_date::text = ANY(${datesLit}::text[])`.catch(() => []);
  ctx.readiness = latestRowsBy(readinessRows, r => key(r.prepared_row_id));
  ctx.readinessDatesAvailable = [...new Set(readinessRows.map(r => r.official_date))];

  ctx.lineups = latestRowsBy(await pgClient`SELECT lineup_row_id, batch_id, game_pk, official_date::text AS official_date, team_side, team_id, player_id, lineup_slot, batting_order_code, bat_side, active_position, lineup_status, confidence_label, updated_at FROM daily.lineups_current WHERE official_date::text = ANY(${datesLit}::text[])`.catch(() => []), r => key(r.game_pk, r.player_id));
  ctx.availability = latestRowsBy(await pgClient`SELECT availability_key, batch_id, official_date::text AS official_date, game_pk, mlb_player_id, team_mlb_id, opponent_mlb_id, availability_status, roster_status, availability_confidence, active_roster_flag, injured_list_flag, transaction_warning_flag, transaction_block_flag, team_mismatch_flag, source_missing_flag, reason, evaluation_json, updated_at FROM daily.player_availability_current WHERE official_date::text = ANY(${datesLit}::text[])`.catch(() => []), r => key(r.game_pk, r.mlb_player_id));
  ctx.weather = latestRowsBy(await pgClient`SELECT weather_id, batch_id, game_pk, official_date::text AS official_date, weather_status, weather_confidence, temperature_f, humidity_pct, wind_speed_mph, wind_gust_mph, wind_direction_cardinal, wind_context, rain_risk_flag, delay_risk_flag, roof_type, roof_status, indoor_flag, weather_applicable_flag, park_weather_notes, updated_at FROM daily.game_weather_current WHERE official_date::text = ANY(${datesLit}::text[])`.catch(() => []), r => key(r.game_pk));
  ctx.starters = latestRowsBy(await pgClient`SELECT entry_id, batch_id, game_pk, official_date::text AS official_date, team_id, opponent_team_id, is_home, starter_player_id, starter_name, starter_hand, starter_status, starter_confidence, source_status, game_status, scratch_flag, opener_flag, bulk_pitcher_flag, tbd_flag, unavailable_flag, updated_at FROM daily.probable_pitchers WHERE official_date::text = ANY(${datesLit}::text[])`.catch(() => []), r => key(r.game_pk, r.team_id));
  ctx.bullpen = latestRowsBy(await pgClient`SELECT bullpen_id, batch_id, official_date::text AS official_date, game_pk, team_id, opponent_team_id, is_home, bullpen_status, bullpen_confidence, availability_grade, games_played_last_1_day, games_played_last_2_days, games_played_last_3_days, bullpen_pitches_last_1_day, bullpen_pitches_last_2_days, bullpen_pitches_last_3_days, high_usage_reliever_count, back_to_back_reliever_count, likely_unavailable_reliever_count, rested_reliever_count, bullpen_fatigue_score, bullpen_risk_level, details_json, updated_at FROM daily.bullpen_availability_current WHERE official_date::text = ANY(${datesLit}::text[])`.catch(() => []), r => key(r.game_pk, r.team_id));
  ctx.pitcherBullpen = latestRowsBy(await pgClient`SELECT pitcher_availability_key, batch_id, official_date::text AS official_date, team_id, pitcher_id, pitcher_hand, role_hint, active_roster_flag, availability_status, availability_confidence, pitches_last_1_day, pitches_last_2_days, pitches_last_3_days, outs_last_1_day, outs_last_2_days, outs_last_3_days, back_to_back_flag, high_pitch_recent_flag, likely_unavailable_flag, notes, details_json, updated_at FROM daily.bullpen_pitcher_availability_current WHERE official_date::text = ANY(${datesLit}::text[])`.catch(() => []), r => key(r.official_date, r.team_id, r.pitcher_id));
  ctx.schedule = latestRowsBy(await pgClient`SELECT spot_id, batch_id, official_date::text AS official_date, game_pk, team_id, opponent_team_id, is_home, schedule_spot_status, schedule_spot_confidence, days_rest, games_last_1_day, games_last_2_days, games_last_3_days, games_last_5_days, played_yesterday_flag, back_to_back_flag, three_in_four_flag, four_in_six_flag, doubleheader_today_flag, travel_required_flag, travel_distance_bucket, timezone_transition_flag, schedule_fatigue_score, schedule_risk_level, details_json, updated_at FROM daily.team_schedule_spot_current WHERE official_date::text = ANY(${datesLit}::text[])`.catch(() => []), r => key(r.game_pk, r.team_id));
  ctx.umpire = latestRowsBy(await pgClient`SELECT umpire_ctx_id, batch_id, official_date::text AS official_date, game_pk, umpire_context_status, umpire_context_confidence, source_status, home_plate_umpire_id, home_plate_umpire_name, umpire_assignment_status, assignment_confirmed_flag, assignment_pending_flag, assignment_missing_flag, umpire_tendency_status, strike_zone_context_status, run_environment_context_status, walk_context_status, strikeout_context_status, details_json, updated_at FROM daily.umpire_context_current WHERE official_date::text = ANY(${datesLit}::text[])`.catch(() => []), r => key(r.game_pk));

  ctx.hitterMetrics = new Map();
  ctx.pitcherMetrics = new Map();
  ctx.hitterSnapshots = new Map(); for (const r of await pgClient`SELECT player_id, season, metric_window, games_count, pa_sum, hits_sum, singles_sum, doubles_sum, home_runs_sum, walks_sum, strikeouts_sum, runs_sum, rbi_sum, stolen_bases_sum, batting_average, slugging_percentage, strikeout_rate, walk_rate, hr_rate, tb_per_pa, h_per_ab, sample_size_label, certification_grade, updated_at FROM stats_hitter.metric_snapshots WHERE season=2026`.catch(() => [])) pushMapArray(ctx.hitterSnapshots, key(r.player_id), r);
  ctx.pitcherSnapshots = new Map(); for (const r of await pgClient`SELECT player_id, season, metric_window, games_count, appearances_count, starts_count, innings_pitched_sum, outs_recorded_sum, batters_faced_sum, pitches_sum, strikes_sum, hits_allowed_sum, runs_allowed_sum, earned_runs_sum, walks_allowed_sum, strikeouts_sum, home_runs_allowed_sum, era_calculated, whip_calculated, k_rate_calculated, bb_rate_calculated, hr_rate_calculated, k_minus_bb_rate_calculated, pitches_per_out_calculated, strikes_per_pitch_calculated, innings_per_appearance_calculated, sample_size_label, certification_grade, updated_at FROM stats_pitcher.metric_snapshots WHERE season=2026`.catch(() => [])) pushMapArray(ctx.pitcherSnapshots, key(r.player_id), r);
  ctx.hitterSplits = new Map(); for (const r of await pgClient`SELECT player_id, season, split_key, split_code, split_description, pa, ab, hits, singles, doubles, home_runs, runs, rbi, walks, strikeouts, avg, obp, slg, ops, babip, certification_grade, updated_at FROM stats_hitter.splits WHERE season=2026`.catch(() => [])) pushMapArray(ctx.hitterSplits, key(r.player_id), r);
  ctx.pitcherSplits = new Map(); for (const r of await pgClient`SELECT player_id, season, split_key, split_code, split_description, innings_pitched, outs_recorded, batters_faced, hits_allowed, earned_runs, walks_allowed, strikeouts, era, whip, updated_at FROM stats_pitcher.splits WHERE season=2026`.catch(() => [])) pushMapArray(ctx.pitcherSplits, key(r.player_id), r);
  ctx.classificationV6 = new Map();
  for (const r of await pgClient`SELECT player_id, canonical_prop_key, line_value, selected_side, tier_key, metric_value, games_sample FROM classification.classification_v6_current`.catch(() => [])) {
    pushMapArray(ctx.classificationV6, key(r.player_id, r.canonical_prop_key, r.line_value), r);
  }
  ctx.baselineV6 = new Map();
  for (const r of await pgClient`SELECT player_id, canonical_prop_key, line_value, selected_side, tier_key, hit_probability_0_100, confidence_0_100, non_push_sample, prior_strength, recency_blended_rate_0_100, formula_version FROM classification.baseline_v6_current`.catch(() => [])) {
    pushMapArray(ctx.baselineV6, key(r.player_id, r.canonical_prop_key, r.line_value), r);
  }
  ctx.catcherContext = new Map();
  for (const r of await pgClient`SELECT catcher_context_key, game_pk, official_date::text AS official_date, team_id, player_id AS catcher_player_id, player_name AS catcher_name, framing_runs_total AS framing_runs, framing_pct_total AS strike_rate_shadow_zone, pop_time_2b_sba AS pop_time_seconds, NULL AS arm_strength, metrics_available_flag, updated_at FROM daily.catcher_context_current WHERE official_date::text = ANY(${datesLit}::text[])`.catch(() => [])) {
    ctx.catcherContext.set(key(r.game_pk, r.team_id), r);
  }
  ctx.refTeams = new Map();
  for (const r of await pgClient`SELECT team_id, mlb_team_id, abbreviation, full_name, nickname, short_name, team_code, file_code FROM ref.teams WHERE active=1`.catch(() => [])) {
    for (const v of [r.team_id, r.mlb_team_id, r.abbreviation, r.full_name, r.nickname, r.short_name, r.team_code, r.file_code]) {
      if (v !== null && v !== undefined && String(v).trim()) ctx.refTeams.set(String(v).toLowerCase(), r);
    }
  }
  return ctx;
}

function parseJsonMaybe(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}
function latestSnapshotByWindow(snapshots) {
  const out = {};
  for (const r of snapshots || []) {
    const w = String(r.metric_window || "unknown");
    const prev = out[w];
    if (!prev || String(r.updated_at || "") >= String(prev.updated_at || "")) out[w] = r;
  }
  return out;
}
function pickSeasonSnapshot(snapshots) {
  const byWindow = latestSnapshotByWindow(snapshots || []);
  return byWindow.season_to_date || Object.values(byWindow).sort((a,b)=>String(b.updated_at||"").localeCompare(String(a.updated_at||"")))[0] || null;
}
function buildMetricSummaryFromSnapshots(family, snapshots) {
  const base = pickSeasonSnapshot(snapshots || []);
  if (!base) return null;
  const windows = latestSnapshotByWindow(snapshots || []);
  if (family === "pitcher") {
    return {
      derived_from: "pitcher_metric_snapshots", player_id: base.player_id, season: base.season, metric_window: base.metric_window, sample_size_label: base.sample_size_label,
      games_count: base.games_count, appearances_count: base.appearances_count, starts_count: base.starts_count, innings_pitched_sum: base.innings_pitched_sum,
      outs_recorded_sum: base.outs_recorded_sum, batters_faced_sum: base.batters_faced_sum, pitches_sum: base.pitches_sum, strikes_sum: base.strikes_sum,
      hits_allowed_sum: base.hits_allowed_sum, runs_allowed_sum: base.runs_allowed_sum, earned_runs_sum: base.earned_runs_sum, walks_allowed_sum: base.walks_allowed_sum,
      strikeouts_sum: base.strikeouts_sum, home_runs_allowed_sum: base.home_runs_allowed_sum, era_calculated: base.era_calculated, whip_calculated: base.whip_calculated,
      k_rate_calculated: base.k_rate_calculated, bb_rate_calculated: base.bb_rate_calculated, hr_rate_calculated: base.hr_rate_calculated, k_minus_bb_rate_calculated: base.k_minus_bb_rate_calculated,
      pitches_per_out_calculated: base.pitches_per_out_calculated, strikes_per_pitch_calculated: base.strikes_per_pitch_calculated, innings_per_appearance_calculated: base.innings_per_appearance_calculated,
      windows_available: Object.keys(windows), latest_updated_at: base.updated_at, certification_grade: base.certification_grade
    };
  }
  return {
    derived_from: "hitter_metric_snapshots", player_id: base.player_id, season: base.season, metric_window: base.metric_window, sample_size_label: base.sample_size_label,
    games_count: base.games_count, pa_sum: base.pa_sum, hits_sum: base.hits_sum, singles_sum: base.singles_sum, doubles_sum: base.doubles_sum, home_runs_sum: base.home_runs_sum,
    walks_sum: base.walks_sum, strikeouts_sum: base.strikeouts_sum, runs_sum: base.runs_sum, rbi_sum: base.rbi_sum, stolen_bases_sum: base.stolen_bases_sum,
    batting_average: base.batting_average, slugging_percentage: base.slugging_percentage, strikeout_rate: base.strikeout_rate, walk_rate: base.walk_rate, hr_rate: base.hr_rate,
    tb_per_pa: base.tb_per_pa, h_per_ab: base.h_per_ab, windows_available: Object.keys(windows), latest_updated_at: base.updated_at, certification_grade: base.certification_grade
  };
}

function buildMarketSummary(ctx, row) {
  const cov = ctx.marketCoverage.get(key(row.prepared_row_id)) || [];
  const propEvidence = ctx.playerProps.get(key(row.prepared_row_id)) || [];
  const gameMarket = ctx.gameMarket.get(key(row.official_game_pk)) || [];
  const statuses = [...new Set(cov.map(r => r.market_context_status).filter(Boolean))];
  const covered = cov.filter(r => String(r.market_context_status).toLowerCase() === "covered").length;
  const missing = cov.filter(r => String(r.market_context_status).toLowerCase() === "missing").length;
  return {
    status: cov.length || propEvidence.length || gameMarket.length ? (covered > 0 ? "market_context_present" : "market_context_partial_or_game_only") : "market_context_missing",
    coverage_rows: cov.length, player_prop_evidence_rows: propEvidence.length, game_market_rows: gameMarket.length, covered_rows: covered, missing_rows: missing, statuses,
    coverage_grades: [...new Set(cov.map(r => r.coverage_grade).filter(Boolean))],
    source_keys: [...new Set([...cov.map(r => r.source_key), ...propEvidence.map(r => r.source_key), ...gameMarket.map(r => r.source_key)].filter(Boolean))],
    player_prop_evidence: propEvidence.slice(0, 8), game_market_summary: gameMarket.slice(0, 3)
  };
}
function gradeFromCounts(blockers, warnings, missing) {
  if (blockers > 0) return "BLOCKED";
  if (missing > 3 || warnings > 5) return "PARTIAL_WITH_WARNINGS";
  if (missing > 0 || warnings > 0) return "READY_WITH_WARNINGS";
  return "READY";
}
function packetStatusFromGrade(grade) { return grade === "BLOCKED" ? "blocked" : (grade === "READY" ? "packet_ready" : "packet_partial"); }
function isPositiveDailyStatus(value) {
  const v = String(value || "").toLowerCase();
  return v === "available" || v === "active_available" || v === "confirmed" || v === "probable" || v === "normal" || v === "ready" || v === "ready_with_warnings" || v === "ready_partial_enrichment";
}
function buildPitcherAvailabilityFromReadiness(readiness) {
  if (!readiness) return null;
  const playerOk = isPositiveDailyStatus(readiness.player_availability_status);
  const starterOk = isPositiveDailyStatus(readiness.starter_context_status);
  if (!playerOk && !starterOk) return null;
  return {
    pitcher_availability_key: readiness.readiness_key, source_table: "context_cert.readiness_current", source_mode: "starter_pitcher_readiness_fallback",
    availability_status: readiness.player_availability_status || (starterOk ? "active_available" : null), availability_confidence: readiness.context_grade || readiness.context_status || null,
    starter_context_status: readiness.starter_context_status || null, bullpen_context_status: readiness.bullpen_context_status || null,
    hard_blocker_count: readiness.hard_blocker_count || 0, warning_count: readiness.warning_count || 0, enrichment_gap_count: readiness.enrichment_gap_count || 0,
    note: "Resolved from daily readiness because bullpen pitcher availability table is reliever-oriented and does not include most starters."
  };
}

function buildPacket(family, row, classification, ctx) {
  const game = ctx.games.get(key(row.official_game_pk)) || null;
  const playerId = row.resolved_mlb_player_id || row.resolved_player_id;
  const refTeam = ctx.refTeams && (ctx.refTeams.get(String(row.team || "").toLowerCase()) || ctx.refTeams.get(String(row.team_full_name || "").toLowerCase()));
  const refOpp = ctx.refTeams && (ctx.refTeams.get(String(row.opponent || "").toLowerCase()) || ctx.refTeams.get(String(row.opponent_full_name || "").toLowerCase()));
  let teamId = refTeam && refTeam.mlb_team_id ? refTeam.mlb_team_id : row.team;
  let opponentTeamId = refOpp && refOpp.mlb_team_id ? refOpp.mlb_team_id : row.opponent;
  if (game) {
    if (String(row.team_full_name || "") === String(game.home_team_name || "") || String(teamId) === String(game.home_team_id)) { teamId = game.home_team_id; opponentTeamId = game.away_team_id; }
    else if (String(row.team_full_name || "") === String(game.away_team_name || "") || String(teamId) === String(game.away_team_id)) { teamId = game.away_team_id; opponentTeamId = game.home_team_id; }
  }
  const isHome = game && String(teamId) === String(game.home_team_id) ? 1 : (game && String(teamId) === String(game.away_team_id) ? 0 : null);
  const lineup = ctx.lineups.get(key(row.official_game_pk, playerId)) || null;
  const availability = ctx.availability.get(key(row.official_game_pk, playerId)) || null;
  if (lineup && lineup.team_id) teamId = lineup.team_id;
  if (availability && availability.team_mlb_id) teamId = availability.team_mlb_id;
  if (availability && availability.opponent_mlb_id) opponentTeamId = availability.opponent_mlb_id;
  const readiness = ctx.readiness.get(key(row.prepared_row_id)) || null;
  const weather = ctx.weather.get(key(row.official_game_pk)) || null;
  const teamSchedule = ctx.schedule.get(key(row.official_game_pk, teamId)) || null;
  const opponentSchedule = ctx.schedule.get(key(row.official_game_pk, opponentTeamId)) || null;
  const umpire = ctx.umpire.get(key(row.official_game_pk)) || null;
  const teamBullpen = ctx.bullpen.get(key(row.official_game_pk, teamId)) || null;
  const opponentBullpen = ctx.bullpen.get(key(row.official_game_pk, opponentTeamId)) || null;
  const ownStarter = ctx.starters.get(key(row.official_game_pk, teamId)) || null;
  const oppStarter = ctx.starters.get(key(row.official_game_pk, opponentTeamId)) || null;
  const bullpenPitcherAvailability = family === "pitcher" ? (ctx.pitcherBullpen.get(key(row.official_date, teamId, playerId)) || null) : null;
  const readinessPitcherAvailability = family === "pitcher" ? buildPitcherAvailabilityFromReadiness(readiness) : null;
  const pitcherAvailability = family === "pitcher" ? (bullpenPitcherAvailability || readinessPitcherAvailability) : null;
  const market = buildMarketSummary(ctx, row);
  const snapshots = family === "pitcher" ? (ctx.pitcherSnapshots.get(key(playerId)) || []) : (ctx.hitterSnapshots.get(key(playerId)) || []);
  const splits = family === "pitcher" ? (ctx.pitcherSplits.get(key(playerId)) || []) : (ctx.hitterSplits.get(key(playerId)) || []);
  const legacyMetric = family === "pitcher" ? (ctx.pitcherMetrics.get(key(playerId)) || null) : (ctx.hitterMetrics.get(key(playerId)) || null);
  const snapshotMetric = buildMetricSummaryFromSnapshots(family, snapshots);
  const baseMetric = legacyMetric || snapshotMetric;
  const baseMetricSource = legacyMetric ? (family === "pitcher" ? "pitcher_metrics" : "hitter_metrics") : (snapshotMetric ? (family === "pitcher" ? "pitcher_metric_snapshots" : "hitter_metric_snapshots") : "missing");

  const warnings = [];
  const missing = [];
  if (!readiness) missing.push("daily_context_readiness_missing_for_current_prepared_row");
  else if (Number(readiness.hard_blocker_count || 0) > 0) warnings.push("daily_readiness_contains_hard_blocker_flag");
  if (!baseMetric) missing.push(family === "pitcher" ? "pitcher_base_metric_summary_missing" : "hitter_base_metric_summary_missing");
  if (!snapshots.length) missing.push(family === "pitcher" ? "pitcher_metric_snapshots_missing" : "hitter_metric_snapshots_missing");
  if (!splits.length) missing.push(family === "pitcher" ? "pitcher_splits_missing" : "hitter_splits_missing");
  if (market.status === "market_context_missing") warnings.push("market_context_missing");
  if (!weather) warnings.push("weather_context_missing");
  if (!teamSchedule) warnings.push("team_schedule_context_missing");
  if (!umpire) warnings.push("umpire_context_missing");
  if (family === "hitter" && !lineup) warnings.push("lineup_context_missing_or_not_posted");
  if (family === "hitter" && !oppStarter) warnings.push("opposing_starter_context_missing_or_tbd");
  if (family === "pitcher" && !ownStarter) warnings.push("starter_context_missing_or_tbd");
  if (family === "pitcher" && !pitcherAvailability) warnings.push("pitcher_availability_context_missing");

  const readinessStatus = readiness ? readiness.context_status : "missing";
  const marketStatus = market.status;
  const dailyStatus = readiness ? readiness.context_grade : "missing_current_readiness";
  const classificationV6Rows = ctx.classificationV6 ? (ctx.classificationV6.get(key(playerId, row.canonical_prop_key, row.line_value)) || []) : [];
  const baselineV6Rows = ctx.baselineV6 ? (ctx.baselineV6.get(key(playerId, row.canonical_prop_key, row.line_value)) || []) : [];
  if (baselineV6Rows.length === 0) warnings.push("baseline_v6_missing_for_prop_line");
  const catcherCtx = ctx.catcherContext ? ctx.catcherContext.get(key(row.official_game_pk, opponentTeamId)) : null;
  if (family === "pitcher" && !catcherCtx) warnings.push("catcher_context_missing");
  const baseMetricStatus = baseMetric ? `present_from_${baseMetricSource}` : "missing";
  const grade = gradeFromCounts(0, warnings.length, missing.length);
  const payload = {
    logical_worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, factor_family: family, factor_mode: family === "pitcher" ? "pitcher_prop_factor_mining" : "hitter_prop_factor_mining",
    canonical_prop_key: row.canonical_prop_key, normalized_factor_lane: classification.normalized_lane,
    board_context: { prepared_row_id: row.prepared_row_id, source_key: row.source_key, source_row_id: row.source_row_id, projection_id: row.projection_id, source_prop_name: row.source_prop_name, line_value: row.line_value, prep_batch_id: row.prep_batch_id, prep_status: row.prep_status },
    game_context: { game, game_coverage: ctx.gameCoverage.get(key(row.official_game_pk)) || [] },
    player_context: { mlb_player_id: playerId, player_name: row.player_name, team_id: teamId, opponent_team_id: opponentTeamId, is_home: isHome },
    base_metrics: { season_summary: baseMetric, season_summary_source: baseMetricSource, legacy_summary_table_row: legacyMetric, snapshots, splits },
    classification_v6: { source_table: "classification.classification_v6_current", rows: classificationV6Rows, row_count: classificationV6Rows.length },
    baseline_v6: { source_table: "classification.baseline_v6_current", rows: baselineV6Rows, row_count: baselineV6Rows.length, consumed_by_factor_packet: baselineV6Rows.length > 0 },
    daily_context: { readiness, lineup, availability, weather, own_starter: ownStarter, opposing_starter: oppStarter, team_bullpen: teamBullpen, opponent_bullpen: opponentBullpen, pitcher_availability: pitcherAvailability, bullpen_pitcher_availability: bullpenPitcherAvailability, readiness_pitcher_availability: readinessPitcherAvailability, team_schedule: teamSchedule, opponent_schedule: opponentSchedule, umpire, catcher_context: catcherCtx },
    market_context: market, warning_flags: warnings, missing_factors: missing, blocker_flags: [], no_scoring: true, no_ranking: true, no_final_board: true, no_matrix_builder: true, no_external_calls: true
  };
  return {
    packet_id: rid(`pf_${family}`), source_line_id: (market.player_prop_evidence && market.player_prop_evidence[0] && market.player_prop_evidence[0].source_line_id) || row.source_row_id || row.projection_id || null,
    team_id: teamId, opponent_team_id: opponentTeamId, is_home: isHome, factor_status: packetStatusFromGrade(grade), factor_grade: grade, readiness_status: readinessStatus,
    market_context_status: marketStatus, daily_context_status: dailyStatus, base_metric_status: baseMetricStatus, missing_factor_count: missing.length, warning_count: warnings.length,
    blocker_count: 0, payload, warnings, missing
  };
}

async function insertPacketAndIssueRows(pgClient, family, batchId, packets, issues) {
  const packetTable = family === "pitcher" ? "scoring.prop_factor_pitcher_packets" : "scoring.prop_factor_hitter_packets";
  const packetCols = ["packet_id", "batch_id", "prepared_row_id", "source_line_id", "source_key", "game_pk", "official_date", "official_game_time_utc", "mlb_player_id", "player_name", "team_id", "opponent_team_id", "is_home", "canonical_prop_key", "normalized_factor_lane", "board_line_value", "factor_status", "factor_grade", "readiness_status", "market_context_status", "daily_context_status", "base_metric_status", "missing_factor_count", "warning_count", "blocker_count", "factor_payload_json", "details_json"];
  if (packets.length) {
    const rowsForInsert = packets.map(p => ({
      packet_id: p.packet_id, batch_id: batchId, prepared_row_id: p.row.prepared_row_id, source_line_id: p.source_line_id, source_key: p.row.source_key, game_pk: p.row.official_game_pk,
      official_date: p.row.official_date, official_game_time_utc: p.row.official_game_time_utc, mlb_player_id: p.row.resolved_mlb_player_id || p.row.resolved_player_id, player_name: p.row.player_name,
      team_id: String(p.team_id || ""), opponent_team_id: String(p.opponent_team_id || ""), is_home: p.is_home, canonical_prop_key: p.row.canonical_prop_key, normalized_factor_lane: p.classification.normalized_lane,
      board_line_value: p.row.line_value, factor_status: p.factor_status, factor_grade: p.factor_grade, readiness_status: p.readiness_status, market_context_status: p.market_context_status,
      daily_context_status: p.daily_context_status, base_metric_status: p.base_metric_status, missing_factor_count: p.missing_factor_count, warning_count: p.warning_count, blocker_count: p.blocker_count,
      factor_payload_json: JSON.stringify(p.payload), details_json: JSON.stringify({ source_prop_name: p.row.source_prop_name, warnings: p.warnings, missing: p.missing })
    }));
    const CHUNK = 150;
    for (let i = 0; i < rowsForInsert.length; i += CHUNK) {
      const slice = rowsForInsert.slice(i, i + CHUNK);
      await pgClient`INSERT INTO ${pgClient.unsafe(packetTable)} ${pgClient(slice, ...packetCols)}
        ON CONFLICT (packet_id) DO UPDATE SET factor_status=EXCLUDED.factor_status, factor_grade=EXCLUDED.factor_grade, readiness_status=EXCLUDED.readiness_status, market_context_status=EXCLUDED.market_context_status, daily_context_status=EXCLUDED.daily_context_status, base_metric_status=EXCLUDED.base_metric_status, missing_factor_count=EXCLUDED.missing_factor_count, warning_count=EXCLUDED.warning_count, blocker_count=EXCLUDED.blocker_count, factor_payload_json=EXCLUDED.factor_payload_json, details_json=EXCLUDED.details_json, updated_at=now()`;
    }
  }
  if (issues.length) {
    const issueCols = ["issue_id", "batch_id", "factor_family", "packet_id", "prepared_row_id", "game_pk", "mlb_player_id", "canonical_prop_key", "severity", "issue_type", "reason", "details_json", "official_date"];
    const issueRowsForInsert = issues.map(i => ({ issue_id: i.issue_id, batch_id: batchId, factor_family: i.factor_family, packet_id: i.packet_id || null, prepared_row_id: i.prepared_row_id || null, game_pk: i.game_pk || null, mlb_player_id: i.mlb_player_id || null, canonical_prop_key: i.canonical_prop_key || null, severity: i.severity, issue_type: i.issue_type, reason: i.reason, details_json: JSON.stringify(i.details || {}), official_date: i.official_date || null }));
    const CHUNK = 150;
    for (let i = 0; i < issueRowsForInsert.length; i += CHUNK) await pgClient`INSERT INTO scoring.prop_factor_issues ${pgClient(issueRowsForInsert.slice(i, i + CHUNK), ...issueCols)}`;
  }
}

async function insertCoverageRows(pgClient, batchId, coverageRows) {
  if (!coverageRows.length) return;
  const covCols = ["coverage_key", "factor_family", "prepared_row_id", "game_pk", "mlb_player_id", "canonical_prop_key", "normalized_factor_lane", "factor_status", "factor_grade", "packet_id", "latest_batch_id", "latest_checked_at", "blocking_for_matrix", "missing_reason", "details_json", "official_date"];
  const rowsForInsert = coverageRows.map(c => ({
    coverage_key: c.coverage_key, factor_family: c.factor_family, prepared_row_id: c.prepared_row_id, game_pk: c.game_pk, mlb_player_id: c.mlb_player_id, canonical_prop_key: c.canonical_prop_key,
    normalized_factor_lane: c.normalized_factor_lane, factor_status: c.factor_status, factor_grade: c.factor_grade, packet_id: c.packet_id || null, latest_batch_id: batchId, latest_checked_at: nowIso(),
    blocking_for_matrix: c.blocking_for_matrix ? 1 : 0, missing_reason: c.missing_reason || null, details_json: JSON.stringify(c.details || {}), official_date: c.official_date
  }));
  const CHUNK = 150;
  for (let i = 0; i < rowsForInsert.length; i += CHUNK) {
    const slice = rowsForInsert.slice(i, i + CHUNK);
    await pgClient`INSERT INTO scoring.prop_factor_coverage_current ${pgClient(slice, ...covCols)}
      ON CONFLICT (coverage_key) DO UPDATE SET factor_status=EXCLUDED.factor_status, factor_grade=EXCLUDED.factor_grade, packet_id=EXCLUDED.packet_id, latest_batch_id=EXCLUDED.latest_batch_id, latest_checked_at=EXCLUDED.latest_checked_at, blocking_for_matrix=EXCLUDED.blocking_for_matrix, missing_reason=EXCLUDED.missing_reason, details_json=EXCLUDED.details_json, updated_at=now()`;
  }
}

async function flushFactorChunks(pgClient, family, batchId, packetChunk, issueChunk, coverageChunk = null) {
  const hasPacketsOrIssues = !!(packetChunk.length || issueChunk.length);
  const hasCoverage = !!(coverageChunk && coverageChunk.length);
  if (!hasPacketsOrIssues && !hasCoverage) return;
  if (hasPacketsOrIssues) await insertPacketAndIssueRows(pgClient, family, batchId, packetChunk, issueChunk);
  if (hasCoverage) await insertCoverageRows(pgClient, batchId, coverageChunk);
  packetChunk.length = 0;
  issueChunk.length = 0;
  if (coverageChunk) coverageChunk.length = 0;
}

async function runFactorMining(request, env, pgClient) {
  const input = await request.json().catch(() => ({}));
  const family = modeFamily(input.mode || input.factor_mode);
  const mode = family === "pitcher" ? "pitcher_prop_factor_mining" : "hitter_prop_factor_mining";
  let dates;
  if (Array.isArray(input.window_dates) && input.window_dates.length) {
    dates = [...new Set(input.window_dates)].sort();
  } else {
    const nowIsoForWindow = new Date().toISOString();
    const realBoardDateRows = await pgClient`SELECT DISTINCT official_date::text AS official_date FROM score.board_prepared_current WHERE pickable_safe = 1 AND official_game_time_utc IS NOT NULL AND official_game_time_utc > ${nowIsoForWindow}`;
    const realBoardDates = realBoardDateRows.map(r => r.official_date).filter(Boolean);
    const floor = ptTodayTomorrow();
    dates = [...new Set([...realBoardDates, ...floor])].sort();
  }
  await loadTaxonomyClassifier(pgClient);

  const requestedResumeBatchId = input.resume_batch_id || input.factor_batch_id || null;
  const resumeFastPath = input.factor_resume === true || !!requestedResumeBatchId;
  let batchId = null;
  let runId = null;

  try {
    const preparedDiagnostics = resumeFastPath
      ? { skipped_on_resume_fast_path: true, reason: "static source diagnostics skipped during Prop Factor resume chunk to avoid repeated full diagnostic scans", window_dates: dates }
      : await getPreparedSourceDiagnostics(pgClient, dates);
    const prepared = await getPreparedRows(pgClient, dates);
    const expectedRows = expectedFactorPreparedRows(prepared, family);
    let existingRunning = await findRunningPropFactorBatch(pgClient, input.request_id || null, family);
    if (requestedResumeBatchId && (!existingRunning || existingRunning.batch_id !== requestedResumeBatchId)) {
      const rows = await pgClient`SELECT batch_id, request_id, run_id, worker_version, mode, factor_family, status, window_start, window_end, prepared_rows_read, eligible_rows, packets_written
        FROM scoring.prop_factor_batches
        WHERE batch_id=${requestedResumeBatchId} AND factor_family=${family} AND status IN ('running','partial_continue','partial_continue_factor_packets_chunk_written')`;
      if (rows[0]) existingRunning = rows[0];
    }
    const resuming = !!(existingRunning && existingRunning.batch_id);
    if (!resuming) {
      await markStaleRunningBatches(pgClient, dates, family);
      await retentionCleanup(pgClient, dates, family);
    }
    batchId = resuming ? existingRunning.batch_id : rid(`prop_factor_${family}_batch`);
    runId = input.run_id || (existingRunning && existingRunning.run_id) || rid("run");
    const sourceTables = { score: ["board_prepared_current"], classification: ["classification_v6_current", "baseline_v6_current"], market: ["context_probe_coverage", "context_probe_player_props", "context_probe_game_market_summary"], daily: ["lineups_current", "probable_pitchers", "player_availability_current", "game_weather_current", "bullpen_availability_current", "bullpen_pitcher_availability_current", "team_schedule_spot_current", "umpire_context_current", "catcher_context_current"], context_cert: ["readiness_current"], stats_hitter: ["metric_snapshots(primary)", "splits"], stats_pitcher: ["metric_snapshots(primary)", "splits"], calendar: ["game_calendar"], team: ["game_data_coverage"], scoring: ["prop_factor_batches", "prop_factor_hitter_packets", "prop_factor_pitcher_packets", "prop_factor_issues", "prop_factor_coverage_current"] };
    if (!resuming) {
      await pgClient`INSERT INTO scoring.prop_factor_batches (batch_id, request_id, run_id, worker_name, worker_version, deployed_worker_slot, deployed_slot_version, mode, factor_family, status, window_start, window_end, prepared_rows_read, source_tables_checked_json, created_at, updated_at)
        VALUES (${batchId}, ${input.request_id || null}, ${runId}, ${LOGICAL_WORKER_NAME}, ${SYSTEM_VERSION}, ${WORKER_NAME}, ${DEPLOYED_SLOT_VERSION}, ${mode}, ${family}, 'running', ${dates[0]}, ${dates[dates.length - 1]}, ${prepared.length}, ${JSON.stringify(sourceTables)}, now(), now())`;
    } else {
      await pgClient`UPDATE scoring.prop_factor_batches SET status='running', prepared_rows_read=${prepared.length}, updated_at=now() WHERE batch_id=${batchId}`;
    }
    const ctx = await loadContext(pgClient, dates);
    const alreadyCovered = resuming ? await getCoveredPreparedIds(pgClient, batchId, family) : new Set();
    const coverageRows = [];
    const packetChunk = [];
    const issueChunk = [];
    const flushSize = family === "hitter" ? HITTER_PACKET_FLUSH_SIZE : PITCHER_PACKET_FLUSH_SIZE;
    let gamesProcessed = 0;
    let lastGamePk = null;
    let processedThisInvocation = 0;
    const maxRowsThisInvocation = family === "hitter" ? HITTER_MAX_FACTOR_ROWS_PER_INVOCATION : PITCHER_MAX_FACTOR_ROWS_PER_INVOCATION;
    const softTimeboxMs = family === "hitter" ? HITTER_SOFT_TIMEBOX_MS : PITCHER_SOFT_TIMEBOX_MS;
    const invocationStartedMs = Date.now();
    let timeboxBreak = false;

    for (const row of prepared) {
      const classification = classifyProp(row.canonical_prop_key, row.source_prop_name);
      const playerId = row.resolved_mlb_player_id || row.resolved_player_id;
      const rowFamily = classification.family;
      const shouldConsider = rowFamily === family || (family === "pitcher" && rowFamily === "deferred");
      if (!shouldConsider) continue;
      if (alreadyCovered.has(String(row.prepared_row_id || ""))) continue;
      if (processedThisInvocation >= maxRowsThisInvocation) break;
      if (processedThisInvocation > 0 && Date.now() - invocationStartedMs >= softTimeboxMs) { timeboxBreak = true; break; }
      processedThisInvocation++;

      if (lastGamePk !== row.official_game_pk) {
        if (lastGamePk !== null) gamesProcessed++;
        lastGamePk = row.official_game_pk;
        if (family === "hitter") await flushFactorChunks(pgClient, family, batchId, packetChunk, issueChunk, coverageRows);
      }

      if (!classification.supported) {
        const issue = { issue_id: rid("pfi"), factor_family: family, prepared_row_id: row.prepared_row_id, game_pk: row.official_game_pk, mlb_player_id: playerId, canonical_prop_key: row.canonical_prop_key, severity: "blocker", issue_type: "unsupported_or_deferred_prop", reason: classification.reason || "UNSUPPORTED_PROP_KEY", official_date: row.official_date, details: { source_prop_name: row.source_prop_name, source_key: row.source_key, mode, classification } };
        issueChunk.push(issue);
        coverageRows.push({ coverage_key: key(family, row.prepared_row_id), factor_family: family, prepared_row_id: row.prepared_row_id, game_pk: row.official_game_pk, mlb_player_id: playerId, canonical_prop_key: row.canonical_prop_key, normalized_factor_lane: classification.normalized_lane, factor_status: "blocked", factor_grade: "BLOCKED", packet_id: null, blocking_for_matrix: 1, missing_reason: issue.reason, details: issue.details, official_date: row.official_date });
        if (issueChunk.length >= flushSize || coverageRows.length >= flushSize) await flushFactorChunks(pgClient, family, batchId, packetChunk, issueChunk, coverageRows);
        continue;
      }

      const packet = buildPacket(family, row, classification, ctx);
      packet.row = row;
      packet.classification = classification;
      packetChunk.push(packet);
      const issueDetailsBase = { prepared_row_id: row.prepared_row_id, source_key: row.source_key, source_prop_name: row.source_prop_name, mode, packet_id: packet.packet_id };
      for (const w of packet.warnings) issueChunk.push({ issue_id: rid("pfi"), factor_family: family, packet_id: packet.packet_id, prepared_row_id: row.prepared_row_id, game_pk: row.official_game_pk, mlb_player_id: playerId, canonical_prop_key: row.canonical_prop_key, severity: "warning", issue_type: "factor_warning", reason: w, official_date: row.official_date, details: issueDetailsBase });
      for (const m of packet.missing) issueChunk.push({ issue_id: rid("pfi"), factor_family: family, packet_id: packet.packet_id, prepared_row_id: row.prepared_row_id, game_pk: row.official_game_pk, mlb_player_id: playerId, canonical_prop_key: row.canonical_prop_key, severity: "warning", issue_type: "missing_factor", reason: m, official_date: row.official_date, details: issueDetailsBase });
      coverageRows.push({ coverage_key: key(family, row.prepared_row_id), factor_family: family, prepared_row_id: row.prepared_row_id, game_pk: row.official_game_pk, mlb_player_id: playerId, canonical_prop_key: row.canonical_prop_key, normalized_factor_lane: classification.normalized_lane, factor_status: packet.factor_status, factor_grade: packet.factor_grade, packet_id: packet.packet_id, blocking_for_matrix: 0, missing_reason: packet.missing.length ? packet.missing.join(",") : null, details: { warnings: packet.warnings, missing: packet.missing, readiness_status: packet.readiness_status, market_context_status: packet.market_context_status, daily_context_status: packet.daily_context_status }, official_date: row.official_date });

      if (packetChunk.length >= flushSize || issueChunk.length >= flushSize) await flushFactorChunks(pgClient, family, batchId, packetChunk, issueChunk, coverageRows);
      if (processedThisInvocation > 0 && Date.now() - invocationStartedMs >= softTimeboxMs) { timeboxBreak = true; break; }
    }
    if (lastGamePk !== null) gamesProcessed++;
    await flushFactorChunks(pgClient, family, batchId, packetChunk, issueChunk, coverageRows);

    const summary = await summarizeFactorBatch(pgClient, batchId, family);
    const remainingRows = Math.max(0, expectedRows - summary.coverage_prepared_rows);
    const noEligible = expectedRows === 0;
    const partial = remainingRows > 0;
    const status = partial ? "partial_continue_factor_packets_chunk_written" : (noEligible ? "completed_no_eligible_factor_rows" : (summary.blocked_rows > 0 || summary.warning_rows > 0 ? "completed_with_warnings" : "completed"));
    const certification = partial ? "PROP_FACTOR_PACKETS_PARTIAL_CONTINUE_COVERAGE_INCOMPLETE" : (noEligible ? "PROP_FACTOR_PACKETS_NO_ELIGIBLE_ROWS" : (summary.blocked_rows > 0 || summary.warning_rows > 0 ? "PROP_FACTOR_PACKETS_CERTIFIED_WITH_WARNINGS" : "PROP_FACTOR_PACKETS_CERTIFIED"));
    const grade = partial ? "PARTIAL_CONTINUE" : (noEligible ? "NO_DATA_PASS" : (summary.blocked_rows > 0 ? "PASS_WITH_BLOCKED_ROWS" : (summary.warning_rows > 0 ? "PASS_WITH_WARNINGS" : "PASS")));
    const invocationElapsedMs = Date.now() - invocationStartedMs;
    const output = buildPropFactorOutput({ input, family, mode, batchId, runId, dates, status, certification, grade, prepared, expectedRows, summary, processedThisInvocation, remainingRows, preparedDiagnostics, ctx, partial, timeboxBreak, invocationElapsedMs, resumeFastPath });
    await pgClient`UPDATE scoring.prop_factor_batches SET status=${status}, prepared_rows_read=${prepared.length}, eligible_rows=${summary.packet_prepared_rows}, packets_written=${summary.packets}, blocked_rows=${summary.blocked_rows}, warning_rows=${summary.warning_rows}, issue_rows=${summary.issue_rows}, missing_factor_rows=${summary.missing_factor_rows}, certification_status=${certification}, certification_grade=${grade}, output_json=${JSON.stringify(output)}, updated_at=now() WHERE batch_id=${batchId}`;
    return jsonResponse(output);
  } catch (err) {
    const error = String(err && err.stack ? err.stack : err);
    const output = { ok: false, data_ok: false, version: SYSTEM_VERSION, deployed_slot_version: DEPLOYED_SLOT_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY, mode, factor_family: family, status: "prop_factor_miner_failed", certification: "PROP_FACTOR_PACKETS_FAILED", certification_grade: "FAIL", batch_id: batchId, run_id: runId, error, partial_batch_cleaned: true, no_scoring: true, no_ranking: true, no_final_board: true, no_matrix_builder: true };
    const packetTable = family === "pitcher" ? "scoring.prop_factor_pitcher_packets" : "scoring.prop_factor_hitter_packets";
    if (batchId) {
      await pgClient`DELETE FROM ${pgClient.unsafe(packetTable)} WHERE batch_id=${batchId}`.catch(() => {});
      await pgClient`DELETE FROM scoring.prop_factor_issues WHERE batch_id=${batchId}`.catch(() => {});
      await pgClient`DELETE FROM scoring.prop_factor_coverage_current WHERE latest_batch_id=${batchId}`.catch(() => {});
      await pgClient`UPDATE scoring.prop_factor_batches SET status='failed', certification_status='PROP_FACTOR_PACKETS_FAILED', certification_grade='FAIL', output_json=${JSON.stringify(output)}, updated_at=now() WHERE batch_id=${batchId}`.catch(() => {});
    }
    return jsonResponse(output, 500);
  }
}

function identity(env) {
  const db = { HYPERDRIVE: Boolean(env && env.HYPERDRIVE) };
  return { ok: true, data_ok: true, version: SYSTEM_VERSION, deployed_slot_version: DEPLOYED_SLOT_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY, status: "ready", internal_only: true, no_external_calls: true, no_scoring: true, no_ranking: true, no_final_board: true, schema_owner: "scoring.prop_factor_*", upstream_reads: "score.board_prepared_current, classification.classification_v6_current, classification.baseline_v6_current, daily.catcher_context_current", retention_policy: "today_tomorrow_only", required_db_bindings_present: allTrue(db), db_bindings: db };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (request.method === "GET" && (path === "/" || path === "/health")) return jsonResponse(identity(env));
    if (request.method === "POST" && (path === "/run" || path === "/mine")) {
      const pgClient = pg(env);
      try {
        const response = await runFactorMining(request, env, pgClient);
        return response;
      } catch (err) {
        const failOutput = { ok: false, data_ok: false, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY, status: "prop_factor_miner_exception", certification: "PROP_FACTOR_MINER_EXCEPTION", certification_grade: "FAILED", error: String(err && err.stack ? err.stack : err), external_calls: 0, no_scoring: true, no_ranking: true, no_final_board: true, no_matrix_builder: true };
        return jsonResponse(failOutput, 500);
      } finally {
        await pgClient.end({ timeout: 1 }).catch(() => {});
      }
    }
    return jsonResponse({ ok: false, error: "not_found", version: SYSTEM_VERSION, path }, 404);
  }
};
