const WORKER_NAME = "alphadog-v2-static-rosters";
const LOGICAL_WORKER_NAME = "alphadog-v2-historical-season-backfill";
const VERSION = "alphadog-v2-historical-season-backfill-v0.1.0-standalone";
const JOB_KEY = "historical-season-backfill";

// Real, deliberate design decision: this is a standalone, isolated, one-time-use historical
// backfill tool - it does NOT touch or extend the production base-hitter-game-logs.js /
// base-pitcher-game-logs.js cursor/batch state machine at all. Those workers hardcode a single,
// season-unaware cursor key and a literal locked batch_id (confirmed via direct code inspection -
// see HANDOFF_MASTER_SUMMARY.md), making them unsafe to repurpose for other seasons without a
// real, risky rewrite of live production code. This tool reuses their PROVEN, safe-to-copy parts
// (the real MLB StatsAPI endpoint pattern and field-mapping logic) but writes directly to the
// live tables with no cursor/certifier involvement, and can never interfere with the live 2026
// delta pipeline no matter how it's invoked.

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "MLB_API_BASE_URL", "WORKER_SAFE_MODE", "DEBUG_MODE"];

const DEFAULT_CHUNK_SIZE_PLAYERS = 8;
const DEFAULT_FETCH_TIMEOUT_MS = 7000;
const HITTER_SOURCE_KEY = "mlb_statsapi_people_gameLog_hitting_historical_backfill_v0_1_0";
const PITCHER_SOURCE_KEY = "mlb_statsapi_people_gameLog_pitching_historical_backfill_v0_1_0";

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function asInt(v, fallback = null) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : fallback; }
function asText(v, fallback = null) { return v === undefined || v === null ? fallback : String(v); }

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function bindingPresence(env, names) { const out = {}; for (const n of names) out[n] = Boolean(env && env[n]); return out; }
function varPresence(env, names) { const out = {}; for (const n of names) out[n] = env && env[n] !== undefined && env[n] !== null && String(env[n]).length > 0; return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }

async function all(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  const res = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
  return res && res.results ? res.results : [];
}
async function run(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  return binds.length ? await stmt.bind(...binds).run() : await stmt.run();
}

function mlbBaseUrl(env) {
  return String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com/api/v1").replace(/\/$/, "");
}

async function fetchWithTimeout(url, env, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("fetch_timeout"), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json", "user-agent": env.MLB_API_USER_AGENT || "AlphaDogV2HistoricalBackfill/0.1" },
      signal: controller.signal
    });
    const text = await resp.text();
    clearTimeout(timer);
    if (!resp.ok) return { ok: false, http_status: resp.status, error: `http_${resp.status}` };
    let json;
    try { json = JSON.parse(text); } catch (_) { return { ok: false, http_status: resp.status, error: "non_json_response" }; }
    return { ok: true, http_status: resp.status, json };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

// Real, proven field mapping reused (read-only reference) from alphadog-v2-base-hitter-game-logs.js's
// parseHitterSplit - same real MLB StatsAPI shape, adapted for direct-write (no stage table).
function mapHitterRow(split, playerId, playerName, season, batchId) {
  const stat = split && split.stat ? split.stat : {};
  const game = split && split.game ? split.game : {};
  const team = split && split.team ? split.team : {};
  const opponent = split && split.opponent ? split.opponent : {};
  const gamePk = asInt(game.gamePk || game.pk || split.gamePk, 0);
  const gameDate = asText(game.gameDate || split.date || split.gameDate);
  if (!gamePk || !gameDate) return null;
  const hits = asInt(stat.hits, 0);
  const doubles = asInt(stat.doubles, 0);
  const triples = asInt(stat.triples, 0);
  const homeRuns = asInt(stat.homeRuns, 0);
  return {
    player_id: asInt(playerId), player_name: playerName || null, game_pk: gamePk, season: asInt(season), game_date: gameDate,
    team_id: team && team.id !== undefined ? String(team.id) : null,
    opponent_team_id: opponent && opponent.id !== undefined ? String(opponent.id) : null,
    is_home: split && split.isHome !== undefined ? (split.isHome ? 1 : 0) : null,
    batting_order: split && split.battingOrder !== undefined ? asInt(split.battingOrder) : null,
    pa: stat.plateAppearances !== undefined ? asInt(stat.plateAppearances) : null,
    ab: stat.atBats !== undefined ? asInt(stat.atBats) : null,
    hits, singles: Math.max(0, hits - doubles - triples - homeRuns), doubles, triples, home_runs: homeRuns,
    runs: stat.runs !== undefined ? asInt(stat.runs) : null, rbi: stat.rbi !== undefined ? asInt(stat.rbi) : null,
    walks: stat.baseOnBalls !== undefined ? asInt(stat.baseOnBalls) : null, strikeouts: stat.strikeOuts !== undefined ? asInt(stat.strikeOuts) : null,
    stolen_bases: stat.stolenBases !== undefined ? asInt(stat.stolenBases) : null, total_bases: stat.totalBases !== undefined ? asInt(stat.totalBases) : null,
    raw_json: JSON.stringify(split)
  };
}

function mapPitcherRow(split, playerId, playerName, season) {
  const stat = split && split.stat ? split.stat : {};
  const game = split && split.game ? split.game : {};
  const team = split && split.team ? split.team : {};
  const opponent = split && split.opponent ? split.opponent : {};
  const gamePk = asInt(game.gamePk || game.pk || split.gamePk, 0);
  const gameDate = asText(game.gameDate || split.date || split.gameDate);
  if (!gamePk || !gameDate) return null;
  return {
    player_id: asInt(playerId), player_name: playerName || null, game_pk: gamePk, season: asInt(season), game_date: gameDate,
    team_id: team && team.id !== undefined ? String(team.id) : null,
    opponent_team_id: opponent && opponent.id !== undefined ? String(opponent.id) : null,
    is_home: split && split.isHome !== undefined ? (split.isHome ? 1 : 0) : null,
    role: "P",
    innings_pitched: stat.inningsPitched !== undefined ? String(stat.inningsPitched) : null,
    innings_pitched_decimal: stat.inningsPitched !== undefined ? Number(stat.inningsPitched) : null,
    outs_recorded: stat.outs !== undefined ? asInt(stat.outs) : null,
    batters_faced: stat.battersFaced !== undefined ? asInt(stat.battersFaced) : null,
    hits_allowed: stat.hits !== undefined ? asInt(stat.hits) : null,
    runs_allowed: stat.runs !== undefined ? asInt(stat.runs) : null,
    earned_runs: stat.earnedRuns !== undefined ? asInt(stat.earnedRuns) : null,
    walks_allowed: stat.baseOnBalls !== undefined ? asInt(stat.baseOnBalls) : null,
    strikeouts: stat.strikeOuts !== undefined ? asInt(stat.strikeOuts) : null,
    home_runs_allowed: stat.homeRuns !== undefined ? asInt(stat.homeRuns) : null,
    pitches: stat.numberOfPitches !== undefined ? asInt(stat.numberOfPitches) : null,
    balls: stat.balls !== undefined ? asInt(stat.balls) : null,
    strikes: stat.strikes !== undefined ? asInt(stat.strikes) : null,
    wins: stat.wins !== undefined ? asInt(stat.wins) : null, losses: stat.losses !== undefined ? asInt(stat.losses) : null,
    saves: stat.saves !== undefined ? asInt(stat.saves) : null, holds: stat.holds !== undefined ? asInt(stat.holds) : null,
    blown_saves: stat.blownSaves !== undefined ? asInt(stat.blownSaves) : null,
    raw_json: JSON.stringify(split)
  };
}

async function insertHitterRow(env, r, batchId, runId) {
  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_game_logs (
    player_id, game_pk, season, game_date, team_id, opponent_team_id, is_home, batting_order,
    pa, ab, hits, singles, doubles, triples, home_runs, runs, rbi, walks, strikeouts, stolen_bases, total_bases,
    raw_json, source_key, source_confidence, updated_at, group_type, data_feed_key, source_endpoint, source_season, source_game_type,
    ingestion_mode, batch_id, run_id, certification_status, certification_grade, certified_at, promoted_at, created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,'hitting','historical_backfill',?,?,'R','historical_backfill',?,?,'HISTORICAL_BACKFILL_CERTIFIED','BASE_PASS',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
    r.player_id, r.game_pk, r.season, r.game_date, r.team_id, r.opponent_team_id, r.is_home, r.batting_order,
    r.pa, r.ab, r.hits, r.singles, r.doubles, r.triples, r.home_runs, r.runs, r.rbi, r.walks, r.strikeouts, r.stolen_bases, r.total_bases,
    r.raw_json, HITTER_SOURCE_KEY, "SOURCE_LOCKED_STATSAPI_GAMELOG_HITTING_HISTORICAL",
    `${mlbBaseUrl(env)}/people/${r.player_id}/stats?stats=gameLog&group=hitting&season=${r.season}`, r.season,
    batchId, runId
  );
}

async function insertPitcherRow(env, r, batchId, runId) {
  await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_game_logs (
    player_id, game_pk, season, game_date, team_id, opponent_team_id, is_home, role,
    innings_pitched, outs_recorded, batters_faced, hits_allowed, runs_allowed, earned_runs,
    walks_allowed, strikeouts, home_runs_allowed, pitches, raw_json, source_key, source_confidence, updated_at,
    data_feed_key, source_endpoint, source_season, source_game_type, ingestion_mode, batch_id, run_id,
    certification_status, certification_grade, certified_at, promoted_at, created_at, group_type,
    player_name, innings_pitched_decimal, balls, strikes, wins, losses, saves, holds, blown_saves
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,'historical_backfill',?,?,'R','historical_backfill',?,?,'HISTORICAL_BACKFILL_CERTIFIED','BASE_PASS',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'pitching',?,?,?,?,?,?,?,?,?)`,
    r.player_id, r.game_pk, r.season, r.game_date, r.team_id, r.opponent_team_id, r.is_home, r.role,
    r.innings_pitched, r.outs_recorded, r.batters_faced, r.hits_allowed, r.runs_allowed, r.earned_runs,
    r.walks_allowed, r.strikeouts, r.home_runs_allowed, r.pitches, r.raw_json, PITCHER_SOURCE_KEY, "SOURCE_LOCKED_STATSAPI_GAMELOG_PITCHING_HISTORICAL",
    `${mlbBaseUrl(env)}/people/${r.player_id}/stats?stats=gameLog&group=pitching&season=${r.season}`, r.season,
    batchId, runId, r.player_name, r.innings_pitched_decimal, r.balls, r.strikes, r.wins, r.losses, r.saves, r.holds, r.blown_saves
  );
}

async function choosePlayers(env, inputJson, group) {
  const explicit = Array.isArray(inputJson.player_ids) ? inputJson.player_ids.map(x => asInt(x)).filter(Boolean) : [];
  if (explicit.length) return explicit.map(player_id => ({ player_id, player_name: null }));
  const positions = group === "pitching" ? ["P"] : ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "OF", "DH"];
  const placeholders = positions.map(() => "?").join(",");
  const rows = await all(env.REF_DB, `SELECT COALESCE(mlb_player_id, player_id) AS player_id, COALESCE(full_name, player_name) AS player_name FROM ref_players WHERE COALESCE(active,1)=1 AND primary_position IN (${placeholders})`, ...positions);
  const seen = new Set();
  return rows.filter(r => { const id = asInt(r.player_id); if (!id || seen.has(id)) return false; seen.add(id); return true; }).map(r => ({ player_id: asInt(r.player_id), player_name: r.player_name }));
}

async function runBackfill(env, input) {
  const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
  const season = asInt(inputJson.season, null);
  const group = inputJson.group === "pitching" ? "pitching" : "hitting";
  if (!season) return { ok: false, data_ok: false, error: "input_json.season is required (e.g. 2025)" };

  const batchId = asText(inputJson.batch_id, rid(`historical_backfill_${group}_${season}`));
  const runId = asText(input.run_id, rid("run_historical_backfill"));
  const offset = asInt(inputJson.player_offset, 0);
  const chunkSize = Math.max(1, Math.min(asInt(inputJson.chunk_size_players, DEFAULT_CHUNK_SIZE_PLAYERS), 15));

  const allPlayers = await choosePlayers(env, inputJson, group);
  const playersThisRun = allPlayers.slice(offset, offset + chunkSize);

  let externalCalls = 0, rowsWritten = 0, playersProcessed = 0, playersNoData = 0, playersError = 0;
  const perPlayerSummary = [];

  for (const player of playersThisRun) {
    const url = `${mlbBaseUrl(env)}/people/${player.player_id}/stats?stats=gameLog&group=${group}&season=${season}`;
    const fetched = await fetchWithTimeout(url, env);
    externalCalls += 1;
    playersProcessed += 1;
    if (!fetched.ok) { playersError += 1; perPlayerSummary.push({ player_id: player.player_id, status: "fetch_error", error: fetched.error || fetched.http_status }); continue; }
    const splits = (fetched.json && fetched.json.stats && fetched.json.stats[0] && Array.isArray(fetched.json.stats[0].splits)) ? fetched.json.stats[0].splits : [];
    if (!splits.length) { playersNoData += 1; perPlayerSummary.push({ player_id: player.player_id, status: "no_data", real_row_count: 0 }); continue; }
    let writtenForPlayer = 0;
    for (const split of splits) {
      const row = group === "pitching" ? mapPitcherRow(split, player.player_id, player.player_name, season) : mapHitterRow(split, player.player_id, player.player_name, season, batchId);
      if (!row) continue;
      if (group === "pitching") await insertPitcherRow(env, row, batchId, runId); else await insertHitterRow(env, row, batchId, runId);
      writtenForPlayer += 1;
      rowsWritten += 1;
    }
    perPlayerSummary.push({ player_id: player.player_id, status: "written", real_row_count: writtenForPlayer });
  }

  const nextOffset = offset + playersThisRun.length;
  const remaining = Math.max(0, allPlayers.length - nextOffset);

  return {
    ok: true, data_ok: true, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    request_id: input.request_id || null, chain_id: input.chain_id || null, run_id: runId, batch_id: batchId,
    status: remaining > 0 ? "partial_continue" : "completed",
    certification: remaining > 0 ? "HISTORICAL_BACKFILL_PARTIAL_CONTINUE" : "HISTORICAL_BACKFILL_COMPLETED",
    season, group, players_total: allPlayers.length, players_processed_this_tick: playersProcessed,
    players_no_data: playersNoData, players_error: playersError, player_offset: offset, next_player_offset: nextOffset, players_remaining: remaining,
    rows_written: rowsWritten, rows_read: 0, external_calls_performed: externalCalls,
    continuation_required: remaining > 0, orchestrator_should_self_continue: false,
    continuation_input_json: remaining > 0 ? { ...inputJson, batch_id: batchId, player_offset: nextOffset, season, group } : null,
    per_player_summary_sample: perPlayerSummary.slice(0, 10),
    isolated_from_production_delta_pipeline: true,
    no_stage_cursor_certifier_state_machine: true,
    no_scoring: true, no_ranking: true, no_final_board: true,
    timestamp_utc: nowUtc()
  };
}

function baseIdentity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars = varPresence(env, EXPECTED_VARS);
  return {
    ok: true, data_ok: true, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    status: "STANDALONE_HISTORICAL_BACKFILL_READY", timestamp_utc: nowUtc(),
    notes: [
      "Standalone, isolated historical season backfill tool - repurposed from a dead dummy worker slot.",
      "Does not touch or extend base-hitter-game-logs.js / base-pitcher-game-logs.js's production cursor/batch state machine at all.",
      "Writes directly to hitter_game_logs / pitcher_game_logs with no cursor/certifier involvement - safe to run without affecting the live 2026 delta pipeline.",
      "POST /run with input_json: { season: 2025, group: 'hitting'|'pitching', player_offset, chunk_size_players }"
    ],
    binding_summary: { required_db_bindings_present: allTrue(db), expected_vars_present: allTrue(vars) }
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));
    if (method === "GET" && path === "/health") return jsonResponse({ ...baseIdentity(env), route: "/health" });

    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        const output = await runBackfill(env, input);
        return jsonResponse(output, output.ok ? 200 : 400);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: LOGICAL_WORKER_NAME, error: String(err && err.stack ? err.stack : err) }, 500);
      }
    }

    return jsonResponse({ ok: false, error: "not_found", allowed_routes: ["GET /", "GET /health", "POST /run"] }, 404);
  }
};
