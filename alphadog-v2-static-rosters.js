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

// ==== TEAM/BULLPEN HISTORICAL BACKFILL (schedule + boxscore two-step pattern) ====
// Real, separate mode added because team_game_logs/bullpen_history were confirmed to have
// zero 2025 rows (only live 2026 data) despite hitter/pitcher_game_logs already being backfilled -
// a genuine gap for bullpen-fatigue/schedule-fatigue GBDT training features. Same isolated,
// no-cursor, no-certifier design as the player-level backfill above: safe to run without
// touching the live 2026 delta pipeline. Unit of work here is a GAME, not a player, since the
// boxscore endpoint returns both teams' full data plus every pitcher's per-appearance stats
// in a single real fetch.
const TEAM_SOURCE_KEY = "mlb_statsapi_schedule_boxscore_team_historical_backfill_v0_1_0";
const BULLPEN_SOURCE_KEY = "mlb_statsapi_schedule_boxscore_bullpen_historical_backfill_v0_1_0";

async function fetchSeasonScheduleGamePks(env, season) {
  const url = `${mlbBaseUrl(env)}/schedule?sportId=1&season=${season}&gameType=R`;
  const fetched = await fetchWithTimeout(url, env, 15000);
  if (!fetched.ok) return { ok: false, error: fetched.error || fetched.http_status, game_pks: [] };
  const dates = Array.isArray(fetched.json && fetched.json.dates) ? fetched.json.dates : [];
  const gamePks = [];
  for (const d of dates) {
    for (const g of (Array.isArray(d.games) ? d.games : [])) {
      const pk = asInt(g.gamePk, 0);
      const status = g.status && g.status.abstractGameState;
      if (pk && status === "Final") gamePks.push({ game_pk: pk, official_date: d.date });
    }
  }
  return { ok: true, game_pks: gamePks };
}

function inningsPitchedToDecimal(ip) {
  if (ip === undefined || ip === null || ip === "") return null;
  const s = String(ip);
  const [wholePart, fracPart] = s.split(".");
  const whole = Number(wholePart) || 0;
  const frac = fracPart === "1" ? (1 / 3) : (fracPart === "2" ? (2 / 3) : 0);
  return Number((whole + frac).toFixed(4));
}

function mapTeamGameRow(sideKey, boxscore, gamePk, officialDate, season) {
  const side = boxscore.teams && boxscore.teams[sideKey];
  if (!side || !side.team) return null;
  const otherSideKey = sideKey === "home" ? "away" : "home";
  const otherSide = boxscore.teams && boxscore.teams[otherSideKey];
  const stat = side.teamStats && side.teamStats.batting ? side.teamStats.batting : {};
  const pitchStat = side.teamStats && side.teamStats.pitching ? side.teamStats.pitching : {};
  const hits = asInt(stat.hits, 0);
  const doubles = asInt(stat.doubles, 0);
  const triples = asInt(stat.triples, 0);
  const homeRuns = asInt(stat.homeRuns, 0);
  return {
    team_game_key: `tgl_historical_${gamePk}_${side.team.id}`,
    game_pk: gamePk, season: asInt(season), game_date: officialDate,
    team_id: String(side.team.id), opponent_team_id: otherSide && otherSide.team ? String(otherSide.team.id) : null,
    is_home: sideKey === "home" ? 1 : 0,
    runs: asInt(stat.runs, 0), hits, errors: asInt(side.teamStats && side.teamStats.fielding && side.teamStats.fielding.errors, 0),
    plate_appearances: asInt(stat.plateAppearances, null), at_bats: asInt(stat.atBats, null), walks: asInt(stat.baseOnBalls, null),
    strikeouts: asInt(stat.strikeOuts, null), home_runs: homeRuns, doubles, triples, stolen_bases: asInt(stat.stolenBases, null),
    left_on_base: asInt(stat.leftOnBase, null), total_bases: asInt(stat.totalBases, null), rbi: asInt(stat.rbi, null),
    runs_allowed: asInt(pitchStat.runs, null), hits_allowed: asInt(pitchStat.hits, null), earned_runs_allowed: asInt(pitchStat.earnedRuns, null),
    walks_allowed: asInt(pitchStat.baseOnBalls, null), strikeouts_pitched: asInt(pitchStat.strikeOuts, null), home_runs_allowed: asInt(pitchStat.homeRuns, null),
    innings_pitched: pitchStat.inningsPitched !== undefined ? String(pitchStat.inningsPitched) : null,
    outs_recorded: pitchStat.inningsPitched !== undefined ? Math.round(inningsPitchedToDecimal(pitchStat.inningsPitched) * 3) : null,
    raw_json: JSON.stringify({ team: side.team, teamStats: side.teamStats })
  };
}

function mapBullpenRows(sideKey, boxscore, gamePk, officialDate, season) {
  const side = boxscore.teams && boxscore.teams[sideKey];
  if (!side || !side.team || !side.players) return [];
  const otherSideKey = sideKey === "home" ? "away" : "home";
  const otherSide = boxscore.teams && boxscore.teams[otherSideKey];
  const pitcherIds = Array.isArray(side.pitchers) ? side.pitchers.map(id => String(id)) : [];
  const rows = [];
  let order = 0;
  for (const pId of pitcherIds) {
    const p = side.players[`ID${pId}`];
    if (!p || !p.stats || !p.stats.pitching) continue;
    const stat = p.stats.pitching;
    order += 1;
    const gamesStarted = asInt(stat.gamesStarted, 0);
    rows.push({
      bullpen_key: `blh_historical_${gamePk}_${pId}`,
      team_id: String(side.team.id), game_date: officialDate, game_pk: gamePk, season: asInt(season),
      opponent_team_id: otherSide && otherSide.team ? String(otherSide.team.id) : null,
      is_home: sideKey === "home" ? 1 : 0,
      pitcher_id: asInt(pId), pitcher_name: p.person ? p.person.fullName : null,
      pitcher_hand: p.person && p.person.pitchHand ? p.person.pitchHand.code : null,
      pitcher_role: gamesStarted > 0 ? "SP" : "RP",
      relief_appearance: gamesStarted > 0 ? 0 : 1,
      games_started: gamesStarted, games_pitched: asInt(stat.gamesPitched, 1),
      pitcher_order_index: order, bullpen_appearance_index: gamesStarted > 0 ? 0 : order,
      innings_pitched: stat.inningsPitched !== undefined ? String(stat.inningsPitched) : null,
      innings_pitched_decimal: inningsPitchedToDecimal(stat.inningsPitched),
      outs_recorded: stat.inningsPitched !== undefined ? Math.round(inningsPitchedToDecimal(stat.inningsPitched) * 3) : null,
      batters_faced: asInt(stat.battersFaced, null), pitches: asInt(stat.numberOfPitches, null), strikes: asInt(stat.strikes, null),
      hits_allowed: asInt(stat.hits, null), runs_allowed: asInt(stat.runs, null), earned_runs: asInt(stat.earnedRuns, null),
      walks_allowed: asInt(stat.baseOnBalls, null), strikeouts: asInt(stat.strikeOuts, null), home_runs_allowed: asInt(stat.homeRuns, null),
      inherited_runners: asInt(stat.inheritedRunners, null), inherited_runners_scored: asInt(stat.inheritedRunnersScored, null),
      holds: asInt(stat.holds, 0), saves: asInt(stat.saves, 0), blown_saves: asInt(stat.blownSaves, 0),
      raw_json: JSON.stringify({ person: p.person, stat })
    });
  }
  return rows;
}

async function insertTeamGameRow(env, r, batchId, runId) {
  await run(env.TEAM_DB, `INSERT OR REPLACE INTO team_game_logs (
    team_game_key, game_pk, season, game_date, team_id, opponent_team_id, is_home, runs, hits, errors,
    plate_appearances, at_bats, walks, strikeouts, home_runs, doubles, triples, stolen_bases, left_on_base,
    total_bases, rbi, runs_allowed, hits_allowed, earned_runs_allowed, walks_allowed, strikeouts_pitched,
    home_runs_allowed, innings_pitched, outs_recorded, raw_json, source_key, source_confidence, updated_at,
    data_feed_key, source_endpoint, source_season, source_game_type, ingestion_mode, batch_id, run_id,
    certification_status, certification_grade, certified_at, promoted_at, created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,'historical_backfill',?,?,'R','historical_backfill',?,?,'HISTORICAL_BACKFILL_CERTIFIED','BASE_PASS',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
    r.team_game_key, r.game_pk, r.season, r.game_date, r.team_id, r.opponent_team_id, r.is_home, r.runs, r.hits, r.errors,
    r.plate_appearances, r.at_bats, r.walks, r.strikeouts, r.home_runs, r.doubles, r.triples, r.stolen_bases, r.left_on_base,
    r.total_bases, r.rbi, r.runs_allowed, r.hits_allowed, r.earned_runs_allowed, r.walks_allowed, r.strikeouts_pitched,
    r.home_runs_allowed, r.innings_pitched, r.outs_recorded, r.raw_json, TEAM_SOURCE_KEY, "SOURCE_LOCKED_STATSAPI_BOXSCORE_TEAM_HISTORICAL",
    `${mlbBaseUrl(env)}/game/${r.game_pk}/boxscore`, r.season, batchId, runId
  );
}

async function insertBullpenRow(env, r, batchId, runId) {
  await run(env.TEAM_DB, `INSERT OR REPLACE INTO bullpen_history (
    bullpen_key, team_id, game_date, game_pk, season, opponent_team_id, is_home, pitcher_id, pitcher_name,
    pitcher_hand, pitcher_role, relief_appearance, games_started, games_pitched, pitcher_order_index,
    bullpen_appearance_index, innings_pitched, innings_pitched_decimal, outs_recorded, batters_faced, pitches,
    strikes, hits_allowed, runs_allowed, earned_runs, walks_allowed, strikeouts, home_runs_allowed,
    inherited_runners, inherited_runners_scored, holds, saves, blown_saves, raw_json, source_key,
    source_confidence, updated_at, source_endpoint, source_season, source_game_type, ingestion_mode,
    batch_id, run_id, certification_status, certification_grade, certified_at, promoted_at, created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?,'R','historical_backfill',?,?,'HISTORICAL_BACKFILL_CERTIFIED','BASE_PASS',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
    r.bullpen_key, r.team_id, r.game_date, r.game_pk, r.season, r.opponent_team_id, r.is_home, r.pitcher_id, r.pitcher_name,
    r.pitcher_hand, r.pitcher_role, r.relief_appearance, r.games_started, r.games_pitched, r.pitcher_order_index,
    r.bullpen_appearance_index, r.innings_pitched, r.innings_pitched_decimal, r.outs_recorded, r.batters_faced, r.pitches,
    r.strikes, r.hits_allowed, r.runs_allowed, r.earned_runs, r.walks_allowed, r.strikeouts, r.home_runs_allowed,
    r.inherited_runners, r.inherited_runners_scored, r.holds, r.saves, r.blown_saves, r.raw_json, BULLPEN_SOURCE_KEY,
    "SOURCE_LOCKED_STATSAPI_BOXSCORE_BULLPEN_HISTORICAL",
    `${mlbBaseUrl(env)}/game/${r.game_pk}/boxscore`, r.season, batchId, runId
  );
}

async function runTeamBullpenBackfill(env, input) {
  const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
  const season = asInt(inputJson.season, null);
  if (!season) return { ok: false, data_ok: false, error: "input_json.season is required (e.g. 2025)" };

  const batchId = asText(inputJson.batch_id, rid(`historical_team_bullpen_backfill_${season}`));
  const runId = asText(input.run_id, rid("run_historical_team_bullpen_backfill"));
  const chunkSize = Math.max(1, Math.min(asInt(inputJson.chunk_size_games, 15), 25));

  let gamePkList = Array.isArray(inputJson.game_pk_list) ? inputJson.game_pk_list : null;
  if (!gamePkList) {
    const scheduleResult = await fetchSeasonScheduleGamePks(env, season);
    if (!scheduleResult.ok) return { ok: false, data_ok: false, error: "schedule_fetch_failed", detail: scheduleResult.error };
    gamePkList = scheduleResult.game_pks;
  }

  const offset = asInt(inputJson.game_offset, 0);
  const gamesThisRun = gamePkList.slice(offset, offset + chunkSize);

  let externalCalls = 0, rowsWritten = 0, gamesProcessed = 0, gamesError = 0;
  const perGameSummary = [];

  for (const g of gamesThisRun) {
    const gamePk = g.game_pk || g;
    const officialDate = g.official_date || null;
    const url = `${mlbBaseUrl(env)}/game/${gamePk}/boxscore`;
    const fetched = await fetchWithTimeout(url, env, 10000);
    externalCalls += 1;
    gamesProcessed += 1;
    if (!fetched.ok || !fetched.json || !fetched.json.teams) { gamesError += 1; perGameSummary.push({ game_pk: gamePk, status: "fetch_error", error: fetched.error || fetched.http_status }); continue; }
    const boxscore = fetched.json;
    let writtenForGame = 0;
    for (const sideKey of ["home", "away"]) {
      const teamRow = mapTeamGameRow(sideKey, boxscore, gamePk, officialDate, season);
      if (teamRow) { await insertTeamGameRow(env, teamRow, batchId, runId); writtenForGame += 1; }
      const bullpenRows = mapBullpenRows(sideKey, boxscore, gamePk, officialDate, season);
      for (const bRow of bullpenRows) { await insertBullpenRow(env, bRow, batchId, runId); writtenForGame += 1; }
    }
    rowsWritten += writtenForGame;
    perGameSummary.push({ game_pk: gamePk, status: "written", real_row_count: writtenForGame });
  }

  const nextOffset = offset + gamesThisRun.length;
  const remaining = Math.max(0, gamePkList.length - nextOffset);

  return {
    ok: true, data_ok: true, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    request_id: input.request_id || null, chain_id: input.chain_id || null, run_id: runId, batch_id: batchId,
    status: remaining > 0 ? "partial_continue" : "completed",
    certification: remaining > 0 ? "HISTORICAL_TEAM_BULLPEN_BACKFILL_PARTIAL_CONTINUE" : "HISTORICAL_TEAM_BULLPEN_BACKFILL_COMPLETED",
    season, games_total: gamePkList.length, games_processed_this_tick: gamesProcessed, games_error: gamesError,
    game_offset: offset, next_game_offset: nextOffset, games_remaining: remaining,
    rows_written: rowsWritten, rows_read: 0, external_calls_performed: externalCalls,
    continuation_required: remaining > 0, orchestrator_should_self_continue: remaining > 0,
    continuation_input_json: remaining > 0 ? { ...inputJson, batch_id: batchId, game_offset: nextOffset, season, game_pk_list: gamePkList } : null,
    per_game_summary_sample: perGameSummary.slice(0, 10),
    isolated_from_production_delta_pipeline: true,
    no_stage_cursor_certifier_state_machine: true,
    no_scoring: true, no_ranking: true, no_final_board: true,
    timestamp_utc: nowUtc()
  };
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
      const innerInput = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
      try {
        const output = innerInput.mode === "team_bullpen_backfill" ? await runTeamBullpenBackfill(env, input) : await runBackfill(env, input);
        return jsonResponse(output, output.ok ? 200 : 400);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: LOGICAL_WORKER_NAME, error: String(err && err.stack ? err.stack : err) }, 500);
      }
    }

    return jsonResponse({ ok: false, error: "not_found", allowed_routes: ["GET /", "GET /health", "POST /run"] }, 404);
  }
};
