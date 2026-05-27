const WORKER_NAME = "alphadog-v2-score-prep";
const VERSION = "alphadog-v2-score-prep-v0.2.0-board-prep-enrichment";
const JOB_KEY = "score-prep";
const PREP_TABLE = "score_board_prepared_current";
const BATCH_TABLE = "score_board_prep_batches";
const INSERT_CHUNK_SIZE = 25;
const MAX_BOARD_ROWS = 25000;

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,x-admin-token,authorization", "access-control-allow-methods": "GET,POST,OPTIONS" } });
}
async function readJsonSafe(request) { try { return await request.json(); } catch (_) { return {}; } }
async function all(db, sql, ...binds) { const s = db.prepare(sql); const r = binds.length ? await s.bind(...binds).all() : await s.all(); return r.results || []; }
async function first(db, sql, ...binds) { const s = db.prepare(sql); return binds.length ? await s.bind(...binds).first() : await s.first(); }
async function run(db, sql, ...binds) { const s = db.prepare(sql); return binds.length ? await s.bind(...binds).run() : await s.run(); }
function safeText(v, max = 6000) { if (v === undefined || v === null) return null; const s = String(v); return s.length > max ? s.slice(0, max) + "...TRUNCATED" : s; }
function parseJsonSafe(s) { try { return s ? JSON.parse(s) : {}; } catch (_) { return {}; } }
function dateOnlyFromAny(v) { const d = new Date(v); if (Number.isNaN(d.getTime())) return null; return d.toISOString().slice(0, 10); }
function toEpoch(v) { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.getTime(); }
function normalizeName(v) {
  return String(v || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
function normalizeTeamName(v) { return normalizeName(v); }
function uniquePush(map, key, value, dedupeKey) {
  if (!key) return;
  const arr = map.get(key) || [];
  const dkey = dedupeKey || JSON.stringify(value);
  if (!arr.some(x => x.__dedupeKey === dkey)) arr.push({ ...value, __dedupeKey: dkey });
  map.set(key, arr);
}
function canonicalPropFromPrizePicks(statType) {
  const t = normalizeName(statType);
  const exact = {
    "hits": "hits",
    "runs": "runs",
    "rbis": "rbis",
    "rbi": "rbis",
    "singles": "singles",
    "doubles": "doubles",
    "home runs": "home_runs",
    "total bases": "total_bases",
    "hits runs rbis": "hits_runs_rbis",
    "walks": "walks",
    "hitter strikeouts": "hitter_strikeouts",
    "stolen bases": "stolen_bases",
    "pitcher strikeouts": "pitcher_strikeouts",
    "pitcher fantasy score": "pitcher_fantasy_score",
    "hitter fantasy score": "hitter_fantasy_score",
    "pitcher outs": "pitcher_outs",
    "hits allowed": "hits_allowed",
    "earned runs allowed": "earned_runs",
    "walks allowed": "walks_allowed",
    "runs allowed": "runs_allowed",
    "1st inning runs allowed": "rfi_nrfi"
  };
  return exact[t] || t.replace(/ /g, "_") || null;
}
function calendarStatusFromTime(officialGameTimeUtc) {
  const t = toEpoch(officialGameTimeUtc);
  if (t === null) return { started: false, status: "unknown_time" };
  return { started: t <= Date.now(), status: t <= Date.now() ? "started_or_expired_by_official_time" : "future_by_official_time" };
}
function bindingSummary(env) {
  const names = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "TEAM_DB", "MARKET_DB", "SCORE_DB"];
  const out = {}; for (const n of names) out[n] = !!(env && env[n]); return out;
}
async function ensureScorePrepSchema(env) {
  await env.SCORE_DB.batch([
    env.SCORE_DB.prepare(`CREATE TABLE IF NOT EXISTS ${BATCH_TABLE} (
      batch_id TEXT PRIMARY KEY,
      worker_name TEXT,
      worker_version TEXT,
      mode TEXT,
      status TEXT,
      certification_status TEXT,
      certification_grade TEXT,
      prizepicks_rows INTEGER DEFAULT 0,
      sleeper_rows INTEGER DEFAULT 0,
      prepared_rows INTEGER DEFAULT 0,
      pickable_safe_rows INTEGER DEFAULT 0,
      blocked_rows INTEGER DEFAULT 0,
      unresolved_player_rows INTEGER DEFAULT 0,
      matchup_unresolved_rows INTEGER DEFAULT 0,
      started_rows INTEGER DEFAULT 0,
      source_json TEXT,
      certification_json TEXT,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`),
    env.SCORE_DB.prepare(`CREATE TABLE IF NOT EXISTS ${PREP_TABLE} (
      prepared_row_id TEXT PRIMARY KEY,
      prep_batch_id TEXT NOT NULL,
      source_key TEXT NOT NULL,
      source_row_id TEXT,
      source_event_id TEXT,
      projection_id TEXT,
      player_name TEXT,
      player_name_normalized TEXT,
      resolved_player_id INTEGER,
      resolved_mlb_player_id INTEGER,
      player_match_status TEXT,
      player_match_confidence TEXT,
      team TEXT,
      opponent TEXT,
      team_full_name TEXT,
      opponent_full_name TEXT,
      canonical_prop_key TEXT,
      source_prop_name TEXT,
      line_value REAL,
      official_game_pk INTEGER,
      official_game_time_utc TEXT,
      official_date TEXT,
      source_start_time TEXT,
      source_time_status TEXT,
      start_time_confidence TEXT,
      matchup_status TEXT,
      matchup_confidence TEXT,
      source_pickable INTEGER,
      pickable_safe INTEGER,
      prep_status TEXT,
      block_reason TEXT,
      raw_source_json TEXT,
      row_payload_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`),
    env.SCORE_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_score_board_prepared_current_source ON ${PREP_TABLE}(source_key, canonical_prop_key, pickable_safe)`),
    env.SCORE_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_score_board_prepared_current_player ON ${PREP_TABLE}(resolved_mlb_player_id, official_game_pk)`),
    env.SCORE_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_score_board_prepared_current_game ON ${PREP_TABLE}(official_game_pk, official_game_time_utc)`)
  ]);
}
async function loadReference(env) {
  const [teams, aliasRows, playerRows] = await Promise.all([
    all(env.REF_DB, `SELECT team_id, mlb_team_id, abbreviation, full_name, nickname, location_name, short_name, team_code, file_code, active FROM ref_teams WHERE active=1 LIMIT 2000`),
    all(env.REF_DB, `SELECT a.alias_name, a.alias_normalized, a.player_id, p.mlb_player_id, p.full_name, p.player_name, p.current_mlb_team_id, p.primary_position, p.active AS player_active, r.mlb_team_id AS roster_mlb_team_id, r.player_name AS roster_player_name, r.active AS roster_active, t.abbreviation AS team_abbreviation, t.full_name AS team_full_name FROM ref_player_aliases a LEFT JOIN ref_players p ON p.player_id=a.player_id LEFT JOIN ref_rosters r ON r.player_id=a.player_id AND r.active=1 LEFT JOIN ref_teams t ON t.mlb_team_id=COALESCE(r.mlb_team_id,p.current_mlb_team_id) WHERE a.active=1 LIMIT 20000`),
    all(env.REF_DB, `SELECT p.player_id, p.mlb_player_id, p.full_name, p.player_name, p.current_mlb_team_id, p.primary_position, p.active AS player_active, r.mlb_team_id AS roster_mlb_team_id, r.player_name AS roster_player_name, r.active AS roster_active, t.abbreviation AS team_abbreviation, t.full_name AS team_full_name FROM ref_players p LEFT JOIN ref_rosters r ON r.player_id=p.player_id AND r.active=1 LEFT JOIN ref_teams t ON t.mlb_team_id=COALESCE(r.mlb_team_id,p.current_mlb_team_id) WHERE p.active=1 LIMIT 20000`)
  ]);

  const teamByFull = new Map();
  const teamByAbbr = new Map();
  const teamByMlbId = new Map();
  for (const t of teams) {
    const obj = { team_id: t.team_id || null, mlb_team_id: t.mlb_team_id || null, abbreviation: t.abbreviation || null, full_name: t.full_name || null, nickname: t.nickname || null, location_name: t.location_name || null, short_name: t.short_name || null };
    for (const name of [t.full_name, t.nickname, t.location_name, t.short_name, t.team_code, t.file_code]) {
      const k = normalizeTeamName(name); if (k) teamByFull.set(k, obj);
    }
    if (t.abbreviation) teamByAbbr.set(String(t.abbreviation).toUpperCase(), obj);
    if (t.mlb_team_id !== null && t.mlb_team_id !== undefined) teamByMlbId.set(Number(t.mlb_team_id), obj);
  }

  const playerByName = new Map();
  const addPlayer = (name, row) => {
    const team = teamByMlbId.get(Number(row.roster_mlb_team_id || row.current_mlb_team_id));
    const obj = {
      player_id: row.player_id || null,
      mlb_player_id: row.mlb_player_id || row.player_id || null,
      full_name: row.full_name || row.player_name || row.roster_player_name || name || null,
      mlb_team_id: row.roster_mlb_team_id || row.current_mlb_team_id || null,
      team_abbreviation: row.team_abbreviation || (team && team.abbreviation) || null,
      team_full_name: row.team_full_name || (team && team.full_name) || null,
      primary_position: row.primary_position || null
    };
    uniquePush(playerByName, normalizeName(name), obj, `${obj.player_id}|${obj.mlb_team_id || ""}`);
  };
  for (const r of aliasRows) {
    addPlayer(r.alias_name, r);
    addPlayer(r.alias_normalized, r);
    addPlayer(r.full_name, r);
  }
  for (const r of playerRows) {
    addPlayer(r.full_name, r);
    addPlayer(r.player_name, r);
    addPlayer(r.roster_player_name, r);
  }
  return { teams, teamByFull, teamByAbbr, teamByMlbId, playerByName, alias_count: aliasRows.length, player_count: playerRows.length };
}
async function loadCalendar(env, slateDates, ref) {
  const dates = Array.from(slateDates).filter(Boolean).slice(0, 5);
  if (!dates.length) dates.push(nowUtc().slice(0, 10));
  const placeholders = dates.map(() => "?").join(",");
  const rows = await all(env.TEAM_DB, `SELECT game_pk, official_date, game_time_utc, status_code, abstract_game_state, detailed_state, is_pregame, is_live, is_final, is_postponed, is_suspended, is_cancelled, home_team_id, away_team_id, home_team_name, away_team_name, venue_name, source_snapshot_at, updated_at FROM mlb_game_calendar WHERE official_date IN (${placeholders}) LIMIT 200`, ...dates);
  const games = rows.map(g => {
    const homeTeam = ref.teamByFull.get(normalizeTeamName(g.home_team_name)) || ref.teamByMlbId.get(Number(g.home_team_id)) || {};
    const awayTeam = ref.teamByFull.get(normalizeTeamName(g.away_team_name)) || ref.teamByMlbId.get(Number(g.away_team_id)) || {};
    return { ...g, home_abbr: homeTeam.abbreviation || null, away_abbr: awayTeam.abbreviation || null, home_team_full: g.home_team_name, away_team_full: g.away_team_name };
  });
  return games;
}
function matchCalendarByTeamsAndTime(games, teamAbbr, oppAbbr, sourceStartTime) {
  const startEpoch = toEpoch(sourceStartTime);
  const team = teamAbbr ? String(teamAbbr).toUpperCase() : null;
  const opp = oppAbbr ? String(oppAbbr).toUpperCase() : null;
  const sourceTeams = new Set(String(team || "").split("/").concat(String(opp || "").split("/")).map(x => x.trim()).filter(Boolean));
  let candidates = games.filter(g => {
    const gameTeams = new Set([g.home_abbr, g.away_abbr].filter(Boolean).map(x => String(x).toUpperCase()));
    const teamsOk = sourceTeams.size >= 2 ? Array.from(sourceTeams).every(x => gameTeams.has(x)) : (team ? gameTeams.has(team) : true);
    if (!teamsOk) return false;
    if (startEpoch === null) return true;
    const ge = toEpoch(g.game_time_utc);
    return ge !== null && Math.abs(ge - startEpoch) <= 20 * 60 * 1000;
  });
  if (!candidates.length && startEpoch !== null) {
    candidates = games.filter(g => {
      const ge = toEpoch(g.game_time_utc);
      return ge !== null && Math.abs(ge - startEpoch) <= 20 * 60 * 1000;
    });
  }
  return candidates.length === 1 ? candidates[0] : null;
}
function matchCalendarByRawNames(games, homeName, awayName) {
  const h = normalizeTeamName(homeName); const a = normalizeTeamName(awayName);
  const candidates = games.filter(g => {
    const gh = normalizeTeamName(g.home_team_name); const ga = normalizeTeamName(g.away_team_name);
    return (gh === h && ga === a) || (gh === a && ga === h);
  });
  return candidates.length === 1 ? candidates[0] : null;
}
function resolvePlayer(playerByName, playerName) {
  const arr = playerByName.get(normalizeName(playerName)) || [];
  if (arr.length === 1) return { status: "matched", confidence: "exact_name", player: arr[0] };
  if (arr.length > 1) {
    const uniqueIds = Array.from(new Set(arr.map(x => String(x.player_id))));
    if (uniqueIds.length === 1) return { status: "matched", confidence: "exact_name_duplicate_alias", player: arr[0] };
    return { status: "ambiguous", confidence: "ambiguous_exact_name", player: null, candidates: arr.slice(0, 5) };
  }
  return { status: "unresolved", confidence: "no_alias_match", player: null };
}
function teamOpponentFromCalendarAndPlayer(game, player) {
  if (!game || !player || !player.team_abbreviation) return { team: null, opponent: null, team_full: null, opponent_full: null, ok: false, reason: "missing_game_or_player_team" };
  const p = String(player.team_abbreviation).toUpperCase();
  if (p === String(game.home_abbr || "").toUpperCase()) return { team: game.home_abbr, opponent: game.away_abbr, team_full: game.home_team_name, opponent_full: game.away_team_name, ok: true };
  if (p === String(game.away_abbr || "").toUpperCase()) return { team: game.away_abbr, opponent: game.home_abbr, team_full: game.away_team_name, opponent_full: game.home_team_name, ok: true };
  return { team: player.team_abbreviation, opponent: null, team_full: player.team_full_name || null, opponent_full: null, ok: false, reason: "player_team_not_in_calendar_matchup" };
}
function buildPreparedRowBase({batchId, sourceKey, sourceRowId, sourceEventId, projectionId, playerName, canonicalPropKey, sourcePropName, lineValue, sourceStartTime, sourcePickable, rawSourceJson, rowPayloadJson, game, playerResolution, teamInfo, blockReasons, sourceTimeStatus}) {
  const player = playerResolution.player || null;
  const officialTime = game ? game.game_time_utc : null;
  const timeStatus = calendarStatusFromTime(officialTime || sourceStartTime);
  if (timeStatus.started) blockReasons.push("started_or_expired_by_official_time");
  const prepStatus = blockReasons.length ? "blocked_preserved" : "prepared_ready";
  const pickableSafe = blockReasons.length ? 0 : 1;
  return {
    prepared_row_id: `${sourceKey}|${sourceRowId || projectionId || sourceEventId || rid("row")}`,
    prep_batch_id: batchId,
    source_key: sourceKey,
    source_row_id: sourceRowId || null,
    source_event_id: sourceEventId || null,
    projection_id: projectionId || null,
    player_name: playerName || null,
    player_name_normalized: normalizeName(playerName),
    resolved_player_id: player ? player.player_id : null,
    resolved_mlb_player_id: player ? player.mlb_player_id : null,
    player_match_status: playerResolution.status,
    player_match_confidence: playerResolution.confidence,
    team: teamInfo.team || null,
    opponent: teamInfo.opponent || null,
    team_full_name: teamInfo.team_full || null,
    opponent_full_name: teamInfo.opponent_full || null,
    canonical_prop_key: canonicalPropKey || null,
    source_prop_name: sourcePropName || null,
    line_value: lineValue === undefined || lineValue === null || lineValue === "" ? null : Number(lineValue),
    official_game_pk: game ? game.game_pk : null,
    official_game_time_utc: officialTime,
    official_date: game ? game.official_date : dateOnlyFromAny(sourceStartTime),
    source_start_time: sourceStartTime || null,
    source_time_status: sourceTimeStatus || timeStatus.status,
    start_time_confidence: game ? "official_calendar" : "source_time_only_unverified",
    matchup_status: game ? (teamInfo.ok === false ? "calendar_matched_player_team_conflict" : "calendar_matched") : "calendar_unresolved",
    matchup_confidence: game ? "official_calendar_team_pair" : "no_calendar_match",
    source_pickable: sourcePickable === null || sourcePickable === undefined ? null : Number(sourcePickable),
    pickable_safe: pickableSafe,
    prep_status: prepStatus,
    block_reason: blockReasons.length ? Array.from(new Set(blockReasons)).join("|") : null,
    raw_source_json: safeText(rawSourceJson, 8000),
    row_payload_json: safeText(rowPayloadJson, 8000)
  };
}
async function insertPreparedRows(env, rows) {
  await run(env.SCORE_DB, `DELETE FROM ${PREP_TABLE}`);
  const sql = `INSERT OR REPLACE INTO ${PREP_TABLE} (prepared_row_id, prep_batch_id, source_key, source_row_id, source_event_id, projection_id, player_name, player_name_normalized, resolved_player_id, resolved_mlb_player_id, player_match_status, player_match_confidence, team, opponent, team_full_name, opponent_full_name, canonical_prop_key, source_prop_name, line_value, official_game_pk, official_game_time_utc, official_date, source_start_time, source_time_status, start_time_confidence, matchup_status, matchup_confidence, source_pickable, pickable_safe, prep_status, block_reason, raw_source_json, row_payload_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;
  let written = 0;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE);
    const stmts = chunk.map(r => env.SCORE_DB.prepare(sql).bind(r.prepared_row_id, r.prep_batch_id, r.source_key, r.source_row_id, r.source_event_id, r.projection_id, r.player_name, r.player_name_normalized, r.resolved_player_id, r.resolved_mlb_player_id, r.player_match_status, r.player_match_confidence, r.team, r.opponent, r.team_full_name, r.opponent_full_name, r.canonical_prop_key, r.source_prop_name, r.line_value, r.official_game_pk, r.official_game_time_utc, r.official_date, r.source_start_time, r.source_time_status, r.start_time_confidence, r.matchup_status, r.matchup_confidence, r.source_pickable, r.pickable_safe, r.prep_status, r.block_reason, r.raw_source_json, r.row_payload_json));
    await env.SCORE_DB.batch(stmts);
    written += chunk.length;
  }
  return written;
}
async function runBoardPrep(env, input = {}) {
  const startedAt = nowUtc();
  const batchId = input.batch_id || rid("score_board_prep_batch");
  await ensureScorePrepSchema(env);
  await run(env.SCORE_DB, `INSERT OR REPLACE INTO ${BATCH_TABLE} (batch_id, worker_name, worker_version, mode, status, source_json, started_at, updated_at) VALUES (?, ?, ?, ?, 'RUNNING', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, batchId, WORKER_NAME, VERSION, input.mode || "board_prep_enrichment", JSON.stringify({ input, no_board_mutation: true, no_scoring: true, no_final_board: true }));

  const [ppRows, sleeperRows] = await Promise.all([
    all(env.MARKET_DB, `SELECT current_row_id, batch_id, slate_date, projection_id, player_id, player_name, team, opponent, league, stat_type, line_score, description, start_time, board_time, end_time, game_id, event_type, status, projection_type, odds_type, source_line_type, payout_variant, is_goblin, is_demon, is_standard, pickable_flag, raw_projection_json, row_payload_json FROM prizepicks_board_current LIMIT ${MAX_BOARD_ROWS}`),
    all(env.MARKET_DB, `SELECT current_row_id, batch_id, slate_date, source_event_id, source_line_id, source_player_id, player_name, team, opponent, league, sport, source_stat_name, canonical_prop_key, line_value, side, price, decimal_price, is_pickable, start_time, raw_line_json, row_payload_json FROM sleeper_board_current LIMIT ${MAX_BOARD_ROWS}`)
  ]);

  const slateDates = new Set();
  for (const r of ppRows) { if (r.slate_date) slateDates.add(String(r.slate_date)); const d = dateOnlyFromAny(r.start_time); if (d) slateDates.add(d); }
  for (const r of sleeperRows) { if (r.slate_date) slateDates.add(String(r.slate_date)); const raw = parseJsonSafe(r.raw_line_json); if (raw.game_date) slateDates.add(String(raw.game_date)); const d = dateOnlyFromAny(raw.commence_time || r.start_time); if (d) slateDates.add(d); }

  const ref = await loadReference(env);
  const calendar = await loadCalendar(env, slateDates, ref);
  const prepared = [];

  for (const r of ppRows) {
    const opp = r.opponent || r.description || null;
    const game = matchCalendarByTeamsAndTime(calendar, r.team, opp, r.start_time);
    const playerRes = r.player_id ? { status: "source_player_id_present", confidence: "source_player_id", player: { player_id: Number(r.player_id), mlb_player_id: Number(r.player_id), full_name: r.player_name, team_abbreviation: r.team, team_full_name: null } } : resolvePlayer(ref.playerByName, r.player_name);
    const teamFull = game && String(r.team || "").toUpperCase() === String(game.home_abbr || "").toUpperCase() ? game.home_team_name : (game && String(r.team || "").toUpperCase() === String(game.away_abbr || "").toUpperCase() ? game.away_team_name : null);
    const oppFull = game && String(opp || "").toUpperCase() === String(game.home_abbr || "").toUpperCase() ? game.home_team_name : (game && String(opp || "").toUpperCase() === String(game.away_abbr || "").toUpperCase() ? game.away_team_name : null);
    const block = [];
    if (!r.player_name) block.push("missing_player_name");
    if (!r.stat_type) block.push("missing_prop");
    if (r.line_score === null || r.line_score === undefined) block.push("missing_line_value");
    if (!game) block.push("calendar_match_unresolved");
    if (Number(r.pickable_flag) !== 1) block.push("source_unpickable_flag");
    prepared.push(buildPreparedRowBase({ batchId, sourceKey: "prizepicks", sourceRowId: r.current_row_id || r.projection_id, sourceEventId: r.game_id, projectionId: r.projection_id, playerName: r.player_name, canonicalPropKey: canonicalPropFromPrizePicks(r.stat_type), sourcePropName: r.stat_type, lineValue: r.line_score, sourceStartTime: r.start_time, sourcePickable: r.pickable_flag, rawSourceJson: r.raw_projection_json, rowPayloadJson: JSON.stringify({ ...(parseJsonSafe(r.row_payload_json)), opponent_filled_from_description: !r.opponent && !!r.description, source_opponent: opp, board_time: r.board_time, payout_variant: r.payout_variant, is_goblin: r.is_goblin, is_demon: r.is_demon, is_standard: r.is_standard }), game, playerResolution: playerRes, teamInfo: { team: r.team, opponent: opp, team_full: teamFull, opponent_full: oppFull, ok: !!game }, blockReasons: block, sourceTimeStatus: null }));
  }

  for (const r of sleeperRows) {
    const raw = parseJsonSafe(r.raw_line_json);
    const game = matchCalendarByRawNames(calendar, raw.home_team, raw.away_team);
    const playerRes = resolvePlayer(ref.playerByName, r.player_name);
    const teamInfo = teamOpponentFromCalendarAndPlayer(game, playerRes.player);
    const block = [];
    if (!r.player_name) block.push("missing_player_name");
    if (!r.canonical_prop_key) block.push("missing_prop");
    if (r.line_value === null || r.line_value === undefined) block.push("missing_line_value");
    if (!game) block.push("calendar_match_unresolved");
    if (playerRes.status === "unresolved") block.push("player_unresolved");
    if (playerRes.status === "ambiguous") block.push("player_ambiguous");
    if (game && teamInfo.ok === false) block.push(teamInfo.reason || "player_team_conflict");
    prepared.push(buildPreparedRowBase({ batchId, sourceKey: "sleeper", sourceRowId: r.current_row_id || r.source_line_id, sourceEventId: r.source_event_id, projectionId: r.source_line_id, playerName: r.player_name, canonicalPropKey: r.canonical_prop_key, sourcePropName: r.source_stat_name || raw.market_key || raw.market, lineValue: r.line_value, sourceStartTime: raw.commence_time || r.start_time, sourcePickable: r.is_pickable, rawSourceJson: r.raw_line_json, rowPayloadJson: JSON.stringify({ ...(parseJsonSafe(r.row_payload_json)), source_commence_time_replaced_by_calendar: !!game && raw.commence_time !== game.game_time_utc, raw_home_team: raw.home_team || null, raw_away_team: raw.away_team || null, raw_last_update: raw.last_update || null, source_pickable_inventory_only: true, source_prices: { side: r.side || null, price: r.price || null, decimal_price: r.decimal_price || null, over_price: raw.over_price || null, under_price: raw.under_price || null, implied_probability: raw.implied_probability || null } }), game, playerResolution: playerRes, teamInfo, blockReasons: block, sourceTimeStatus: game ? (raw.commence_time === game.game_time_utc ? "source_time_matches_calendar" : "source_time_replaced_by_calendar") : "source_time_unverified" }));
  }

  const rowsWritten = await insertPreparedRows(env, prepared);
  const summary = prepared.reduce((acc, r) => {
    acc.total++;
    if (r.source_key === "prizepicks") acc.prizepicks++; else if (r.source_key === "sleeper") acc.sleeper++;
    if (r.pickable_safe === 1) acc.pickable_safe++; else acc.blocked++;
    if (String(r.block_reason || "").includes("player_unresolved")) acc.unresolved_player++;
    if (String(r.block_reason || "").includes("calendar_match_unresolved")) acc.matchup_unresolved++;
    if (String(r.block_reason || "").includes("started_or_expired")) acc.started++;
    if (String(r.block_reason || "").includes("source_unpickable_flag")) acc.source_unpickable++;
    if (String(r.block_reason || "").includes("player_team_not_in_calendar_matchup")) acc.player_team_conflict++;
    return acc;
  }, { total: 0, prizepicks: 0, sleeper: 0, pickable_safe: 0, blocked: 0, unresolved_player: 0, matchup_unresolved: 0, started: 0, source_unpickable: 0, player_team_conflict: 0 });

  const bySource = await all(env.SCORE_DB, `SELECT source_key, COUNT(*) AS rows, SUM(CASE WHEN pickable_safe=1 THEN 1 ELSE 0 END) AS pickable_safe_rows, SUM(CASE WHEN pickable_safe=0 THEN 1 ELSE 0 END) AS blocked_rows, SUM(CASE WHEN block_reason LIKE '%started_or_expired%' THEN 1 ELSE 0 END) AS started_rows, SUM(CASE WHEN block_reason LIKE '%player_unresolved%' THEN 1 ELSE 0 END) AS player_unresolved_rows, SUM(CASE WHEN block_reason LIKE '%calendar_match_unresolved%' THEN 1 ELSE 0 END) AS matchup_unresolved_rows, SUM(CASE WHEN block_reason LIKE '%player_team_not_in_calendar_matchup%' THEN 1 ELSE 0 END) AS player_team_conflict_rows FROM ${PREP_TABLE} GROUP BY source_key ORDER BY source_key`);
  const samples = await all(env.SCORE_DB, `SELECT source_key, player_name, team, opponent, canonical_prop_key, line_value, official_game_time_utc, pickable_safe, block_reason FROM ${PREP_TABLE} WHERE pickable_safe=0 ORDER BY source_key, block_reason, official_game_time_utc LIMIT 20`);

  const certification = rowsWritten === prepared.length && prepared.length > 0 ? "SCORE_BOARD_PREP_ENRICHMENT_COMPLETED_PRESERVED_RAW_BOARDS" : "SCORE_BOARD_PREP_ENRICHMENT_FAILED_OR_EMPTY";
  const grade = rowsWritten === prepared.length && prepared.length > 0 ? "PREP_PASS_WITH_BLOCK_FLAGS" : "PREP_FAIL";
  await run(env.SCORE_DB, `UPDATE ${BATCH_TABLE} SET status=?, certification_status=?, certification_grade=?, prizepicks_rows=?, sleeper_rows=?, prepared_rows=?, pickable_safe_rows=?, blocked_rows=?, unresolved_player_rows=?, matchup_unresolved_rows=?, started_rows=?, certification_json=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, rowsWritten === prepared.length ? "COMPLETED" : "FAILED", certification, grade, summary.prizepicks, summary.sleeper, rowsWritten, summary.pickable_safe, summary.blocked, summary.unresolved_player, summary.matchup_unresolved, summary.started, JSON.stringify({ summary, by_source: bySource, no_board_mutation: true, no_scoring: true, no_final_board: true, official_calendar_used_for_sleeper_time: true, prizepicks_opponent_filled_from_description: true }), batchId);

  return { ok: rowsWritten === prepared.length && prepared.length > 0, data_ok: rowsWritten === prepared.length && prepared.length > 0, version: VERSION, worker_name: WORKER_NAME, job_key: input.job_key || JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, batch_id: batchId, mode: input.mode || "board_prep_enrichment", status: rowsWritten === prepared.length ? "COMPLETED_BOARD_PREP_ENRICHMENT" : "FAILED_BOARD_PREP_ENRICHMENT", certification, certification_grade: grade, rows_read: ppRows.length + sleeperRows.length, rows_written: rowsWritten + 1, prepared_rows: rowsWritten, prizepicks_rows: ppRows.length, sleeper_rows: sleeperRows.length, pickable_safe_rows: summary.pickable_safe, blocked_rows: summary.blocked, started_rows: summary.started, source_unpickable_rows: summary.source_unpickable, unresolved_player_rows: summary.unresolved_player, matchup_unresolved_rows: summary.matchup_unresolved, player_team_conflict_rows: summary.player_team_conflict, by_source: bySource, blocked_samples: samples, calendar_rows_loaded: calendar.length, ref_alias_rows_loaded: ref.alias_count, ref_player_rows_loaded: ref.player_count, output_tables: [`SCORE_DB.${BATCH_TABLE}`, `SCORE_DB.${PREP_TABLE}`], no_market_board_mutation: true, no_scoring: true, no_ranking: true, no_final_board: true, timestamp_utc: nowUtc(), elapsed_ms: Date.now() - toEpoch(startedAt) };
}
function baseIdentity(env, extra = {}) { return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "READY", purpose: "Board prep/enrichment only. Reads MARKET/REF/TEAM and writes SCORE prepared rows. Does not mutate boards, score, rank, or final-board.", bindings: bindingSummary(env), timestamp_utc: nowUtc(), ...extra }; }

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();
    if (method === "OPTIONS") return jsonResponse({ ok: true });
    if (method === "GET" && (path === "/" || path === "/health")) return jsonResponse(baseIdentity(env, { route: path }));
    if (method === "POST" && (path === "/run" || path === "/diagnostic")) {
      try {
        const input = await readJsonSafe(request);
        if (path === "/diagnostic") return jsonResponse(baseIdentity(env, { route: path, input_echo_safe: { request_id: input.request_id || null, mode: input.mode || null } }));
        const output = await runBoardPrep(env, input);
        return jsonResponse(output, output.ok ? 200 : 500);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "SCORE_PREP_EXCEPTION", error: String(err && err.message ? err.message : err), timestamp_utc: nowUtc() }, 500);
      }
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"] }, 404);
  }
};
