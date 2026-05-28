const WORKER_NAME = "alphadog-v2-daily-lineups";
const VERSION = "alphadog-v2-daily-lineups-v0.1.6-write-framework-locked-off";
const JOB_KEY = "daily-lineups";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "TEAM_DB", "DAILY_DB", "SCORE_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "MLB_API_BASE_URL", "MAX_API_CALLS_PER_TICK"];
const DEFAULT_MLB_BASE_URL = "https://statsapi.mlb.com";
const MAX_GAMES = 8;
const MAX_CALENDAR_PROBE_GAMES = 6;
const FETCH_TIMEOUT_MS = 12000;
const MAX_ENDPOINT_RETRIES = 2;
const MLB_STARTING_LINEUPS_URL = "https://www.mlb.com/starting-lineups";
const PRODUCTION_LINEUP_WRITES_ENABLED = false;
const DERIVED_BACKUP_WRITE_ENABLED = false;

function normalizeMlbOrigin(raw) {
  const fallback = DEFAULT_MLB_BASE_URL;
  try {
    const input = String(raw || fallback).trim().replace(/\/+$/, "");
    const parsed = new URL(input);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return fallback;
  }
}

function buildMlbUrl(origin, path) {
  const cleanOrigin = normalizeMlbOrigin(origin);
  const cleanPath = String(path || "").startsWith("/") ? String(path || "") : `/${path}`;
  return `${cleanOrigin}${cleanPath}`;
}

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

async function all(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  const res = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
  return res.results || [];
}

async function readJsonSafe(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
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
    status: "SOURCE_PROBE_READY",
    timestamp_utc: nowUtc(),
    phase: "daily-context-phase-2-lineups-source-probe",
    binding_summary: {
      required_db_bindings_present: allTrue(db),
      expected_vars_present: allTrue(vars)
    },
    guardrails: {
      source_probe_only: true,
      no_daily_lineups_current_writes: true,
      no_prepared_board_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_daily_starters_duplication: true,
      no_daily_game_status_duplication: true
    }
  };
}

function normalizeTeamKey(value) {
  return String(value || "").trim().toUpperCase();
}

function intOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function uniqInts(values) {
  return [...new Set((values || []).map(intOrNull).filter((v) => v !== null))];
}

function buildInClause(values) {
  return values.map(() => "?").join(",");
}

async function getPreparedGameAnchors(env) {
  return await all(env.SCORE_DB, `
    SELECT
      official_game_pk,
      official_game_time_utc,
      COUNT(*) AS prepared_rows,
      COUNT(DISTINCT resolved_mlb_player_id) AS prepared_players
    FROM score_board_prepared_current
    WHERE pickable_safe = 1
      AND matchup_status = 'calendar_matched'
      AND player_match_status = 'matched'
      AND official_game_pk IS NOT NULL
      AND official_game_time_utc IS NOT NULL
      AND resolved_mlb_player_id IS NOT NULL
    GROUP BY official_game_pk, official_game_time_utc
    ORDER BY official_game_time_utc
    LIMIT ${MAX_GAMES}
  `);
}

async function getPreparedPlayers(env, gamePks) {
  if (!gamePks.length) return [];
  const placeholders = buildInClause(gamePks);
  return await all(env.SCORE_DB, `
    SELECT
      official_game_pk,
      official_game_time_utc,
      resolved_mlb_player_id,
      MIN(player_name) AS player_name,
      team,
      opponent,
      COUNT(*) AS prepared_rows,
      GROUP_CONCAT(DISTINCT source_key) AS sources,
      GROUP_CONCAT(DISTINCT canonical_prop_key) AS prop_keys
    FROM score_board_prepared_current
    WHERE pickable_safe = 1
      AND matchup_status = 'calendar_matched'
      AND player_match_status = 'matched'
      AND official_game_pk IN (${placeholders})
      AND official_game_time_utc IS NOT NULL
      AND resolved_mlb_player_id IS NOT NULL
    GROUP BY
      official_game_pk,
      official_game_time_utc,
      resolved_mlb_player_id,
      team,
      opponent
    ORDER BY official_game_time_utc, official_game_pk, team, player_name
  `, ...gamePks);
}

async function getCalendarRows(env, gamePks) {
  if (!gamePks.length) return [];
  const placeholders = buildInClause(gamePks);
  return await all(env.TEAM_DB, `
    SELECT
      game_pk,
      official_date,
      game_time_utc,
      home_team_id,
      away_team_id,
      home_team_name,
      away_team_name,
      detailed_state,
      abstract_game_state,
      is_final,
      is_live,
      is_scheduled,
      is_pregame,
      is_available_for_stats,
      doubleheader,
      game_number,
      updated_at
    FROM mlb_game_calendar
    WHERE game_pk IN (${placeholders})
    ORDER BY game_time_utc
  `, ...gamePks);
}

async function getCalendarOnlyProbeRows(env, targetDate) {
  const rows = await all(env.TEAM_DB, `
    SELECT
      game_pk,
      official_date,
      game_time_utc,
      home_team_id,
      away_team_id,
      home_team_name,
      away_team_name,
      detailed_state,
      abstract_game_state,
      is_final,
      is_live,
      is_scheduled,
      is_pregame,
      is_available_for_stats,
      doubleheader,
      game_number,
      updated_at
    FROM mlb_game_calendar
    WHERE official_date >= ?
      AND COALESCE(is_final, 0) = 0
    ORDER BY official_date, game_time_utc
    LIMIT ${MAX_CALENDAR_PROBE_GAMES}
  `, targetDate);
  return rows || [];
}

async function discoverOfficialSchedule(env, sourceBase, userAgent, rows, label) {
  const gamePks = uniqInts((rows || []).map((r) => r.game_pk || r.official_game_pk));
  const { start, end } = minMaxOfficialDates(rows || []);
  const base = {
    [`${label}_official_schedule_checked`]: false,
    [`${label}_official_schedule_url`]: null,
    [`${label}_official_schedule_http_status`]: null,
    [`${label}_official_schedule_ok`]: false,
    [`${label}_official_schedule_game_count`]: 0,
    [`${label}_official_schedule_anchor_hit_count`]: 0,
    [`${label}_official_schedule_anchor_hit_game_pks`]: [],
    [`${label}_official_schedule_anchor_missing_count`]: gamePks.length,
    [`${label}_official_schedule_anchor_missing_game_pks`]: gamePks
  };
  if (!start || !end || !gamePks.length) return base;
  const scheduleUrl = buildMlbUrl(sourceBase, `/api/v1/schedule?sportId=1&gameType=R&startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&hydrate=probablePitcher(note,person),team,linescore`);
  const scheduleRes = await fetchJsonWithRetry(scheduleUrl, userAgent, 1);
  const schedulePks = collectScheduleGamePks(scheduleRes.json);
  const hits = gamePks.filter((pk) => schedulePks.has(pk));
  const misses = gamePks.filter((pk) => !schedulePks.has(pk));
  return {
    [`${label}_official_schedule_checked`]: true,
    [`${label}_official_schedule_url`]: scheduleUrl,
    [`${label}_official_schedule_http_status`]: scheduleRes.http_status,
    [`${label}_official_schedule_ok`]: !!scheduleRes.ok,
    [`${label}_official_schedule_game_count`]: schedulePks.size,
    [`${label}_official_schedule_anchor_hit_count`]: hits.length,
    [`${label}_official_schedule_anchor_hit_game_pks`]: hits,
    [`${label}_official_schedule_anchor_missing_count`]: misses.length,
    [`${label}_official_schedule_anchor_missing_game_pks`]: misses
  };
}

async function getTeamMap(env) {
  const rows = await all(env.REF_DB, `
    SELECT
      team_id,
      mlb_team_id,
      abbreviation,
      full_name,
      team_code,
      file_code,
      active
    FROM ref_teams
    WHERE active = 1
  `);
  const out = new Map();
  for (const row of rows) {
    const mlbTeamId = intOrNull(row.mlb_team_id);
    if (!mlbTeamId) continue;
    for (const key of [row.abbreviation, row.team_id, row.team_code, row.file_code]) {
      const k = normalizeTeamKey(key);
      if (k) out.set(k, { mlb_team_id: mlbTeamId, team_id: row.team_id, abbreviation: row.abbreviation, full_name: row.full_name });
    }
  }
  return out;
}

async function fetchJsonWithTimeout(url, userAgent) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), FETCH_TIMEOUT_MS);
  const started = Date.now();
  try {
    const headers = {};
    if (userAgent) headers["user-agent"] = userAgent;
    const resp = await fetch(url, { headers, signal: controller.signal });
    const text = await resp.text();
    let json = null;
    if (text) {
      try { json = JSON.parse(text); }
      catch (err) {
        return { ok: false, http_status: resp.status, elapsed_ms: Date.now() - started, error: "json_parse_error", response_preview: text.slice(0, 500) };
      }
    }
    return { ok: resp.ok, http_status: resp.status, elapsed_ms: Date.now() - started, json, response_bytes: text.length };
  } catch (err) {
    return { ok: false, http_status: null, elapsed_ms: Date.now() - started, error: String(err && err.message ? err.message : err) };
  } finally {
    clearTimeout(timer);
  }
}


async function fetchTextWithTimeout(url, userAgent) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), FETCH_TIMEOUT_MS);
  const started = Date.now();
  try {
    const headers = {};
    if (userAgent) headers["user-agent"] = userAgent;
    const resp = await fetch(url, { headers, signal: controller.signal });
    const text = await resp.text();
    return { ok: resp.ok, http_status: resp.status, elapsed_ms: Date.now() - started, text, response_bytes: text.length };
  } catch (err) {
    return { ok: false, http_status: null, elapsed_ms: Date.now() - started, error: String(err && err.message ? err.message : err), text: "", response_bytes: 0 };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithRetry(url, userAgent, attempts = MAX_ENDPOINT_RETRIES) {
  const tries = [];
  let last = null;
  for (let i = 0; i < Math.max(1, attempts); i += 1) {
    const res = await fetchJsonWithTimeout(url, userAgent);
    tries.push({ attempt: i + 1, http_status: res.http_status, ok: res.ok, elapsed_ms: res.elapsed_ms, response_bytes: res.response_bytes || 0, error: res.error || null });
    last = res;
    if (res.ok) break;
    // 404 is source-state evidence, not a transient transport failure. Do not spin more calls.
    if (res.http_status === 404) break;
  }
  return { ...last, attempts: tries, attempt_count: tries.length };
}

function minMaxOfficialDates(calendarRows) {
  const dates = (calendarRows || []).map((r) => r.official_date).filter(Boolean).sort();
  if (!dates.length) return { start: null, end: null };
  return { start: dates[0], end: dates[dates.length - 1] };
}

function collectScheduleGamePks(scheduleJson) {
  const out = new Set();
  const dates = scheduleJson && Array.isArray(scheduleJson.dates) ? scheduleJson.dates : [];
  for (const d of dates) {
    const games = Array.isArray(d.games) ? d.games : [];
    for (const g of games) {
      const pk = intOrNull(g.gamePk);
      if (pk) out.add(pk);
    }
  }
  return out;
}

function analyzeStartingLineupsPage(text, calendarRows, preparedPlayers) {
  const hay = String(text || "").toLowerCase();
  const hasNextData = hay.includes('id="__next_data__') || hay.includes("id='__next_data__") || hay.includes("__next_data__");
  const hasJsonScript = hasNextData || hay.includes("application/json") || hay.includes("lineups");
  const dateHits = new Set();
  for (const row of calendarRows || []) {
    if (row.official_date && hay.includes(String(row.official_date).toLowerCase())) dateHits.add(row.official_date);
  }
  const teamNameHits = [];
  for (const row of calendarRows || []) {
    for (const value of [row.home_team_name, row.away_team_name]) {
      if (value && hay.includes(String(value).toLowerCase())) teamNameHits.push(value);
    }
  }
  const abbrHits = [];
  for (const row of preparedPlayers || []) {
    for (const value of [row.team, row.opponent]) {
      const v = normalizeTeamKey(value);
      if (v && hay.includes(v.toLowerCase())) abbrHits.push(v);
    }
  }
  const playerNameHits = [];
  for (const row of preparedPlayers || []) {
    if (row.player_name && hay.includes(String(row.player_name).toLowerCase())) playerNameHits.push(row.player_name);
    if (playerNameHits.length >= 30) break;
  }
  return {
    has_next_data_marker: hasNextData,
    has_json_or_lineup_marker: hasJsonScript,
    target_date_hits: [...new Set(dateHits)],
    target_team_name_hit_count: [...new Set(teamNameHits)].length,
    target_team_name_hits_sample: [...new Set(teamNameHits)].slice(0, 20),
    target_team_abbr_hit_count: [...new Set(abbrHits)].length,
    target_team_abbr_hits_sample: [...new Set(abbrHits)].slice(0, 20),
    target_player_name_hit_count: [...new Set(playerNameHits)].length,
    target_player_name_hits_sample: [...new Set(playerNameHits)].slice(0, 20)
  };
}

function samplePlayersFromMap(players) {
  if (!players || typeof players !== "object") return [];
  const out = [];
  for (const key of Object.keys(players).slice(0, 12)) {
    const player = players[key];
    if (!player || typeof player !== "object") continue;
    const person = player.person || {};
    out.push({
      map_key: key,
      person_id: intOrNull(person.id),
      full_name: person.fullName || null,
      bat_side: person.batSide ? person.batSide.code || null : null,
      bat_side_description: person.batSide ? person.batSide.description || null : null,
      primary_position: person.primaryPosition ? person.primaryPosition.code || null : null,
      active_position: player.position ? player.position.code || null : null,
      batting_order_code: player.battingOrder || null,
      status_code: player.status ? player.status.code || null : null,
      status_description: player.status ? player.status.description || null : null
    });
    if (out.length >= 3) break;
  }
  return out;
}

function validateSide(sideName, node) {
  const warnings = [];
  const blockers = [];
  const battingOrder = Array.isArray(node && node.battingOrder) ? node.battingOrder : null;
  const players = node && node.players && typeof node.players === "object" ? node.players : null;

  if (!node) blockers.push(`${sideName}_team_node_missing`);
  if (!battingOrder) blockers.push(`${sideName}_batting_order_not_array`);
  if (!players) blockers.push(`${sideName}_players_map_missing`);

  const order = battingOrder || [];
  const nonIntegerValues = order.filter((v) => !Number.isInteger(v));
  if (nonIntegerValues.length) blockers.push(`${sideName}_batting_order_contains_non_integer_values`);

  let mappingValid = blockers.length === 0;
  const mappedPlayers = [];
  if (players && Array.isArray(order)) {
    order.forEach((id, index) => {
      const key = `ID${id}`;
      const player = players[key];
      if (!player) {
        mappingValid = false;
        blockers.push(`${sideName}_missing_player_map_key_${key}`);
        return;
      }
      if (!player.person || intOrNull(player.person.id) !== id) {
        mappingValid = false;
        blockers.push(`${sideName}_person_id_mismatch_${key}`);
      }
      if (!player.person || !player.person.fullName) {
        mappingValid = false;
        blockers.push(`${sideName}_person_full_name_missing_${key}`);
      }
      if (!player.person || !player.person.batSide || !player.person.batSide.code) warnings.push(`${sideName}_bat_side_missing_${key}`);
      if (!player.position || !player.position.code) warnings.push(`${sideName}_position_missing_${key}`);
      if (!player.battingOrder) warnings.push(`${sideName}_player_batting_order_string_missing_${key}`);
      mappedPlayers.push({
        player_id: id,
        player_name: player.person && player.person.fullName ? player.person.fullName : null,
        lineup_slot: index + 1,
        batting_order_code: player.battingOrder || null,
        bat_side: player.person && player.person.batSide ? player.person.batSide.code || null : null,
        position: player.position ? player.position.code || null : null
      });
    });
  }

  let lineupStatus = "source_malformed";
  if (!blockers.length) {
    if (order.length === 0) lineupStatus = "lineup_not_posted";
    else if (order.length >= 9) lineupStatus = "posted_lineup";
    else lineupStatus = "partial_lineup_warning";
  }

  return {
    batting_order_count: order.length,
    batting_order_sample: order.slice(0, 12),
    player_map_count: players ? Object.keys(players).length : 0,
    player_map_sample: samplePlayersFromMap(players),
    lineup_status: lineupStatus,
    mapping_valid: mappingValid,
    mapped_players: mappedPlayers,
    mapped_players_sample: mappedPlayers.slice(0, 12),
    warnings,
    blockers
  };
}

function getPreparedPlayerNode(playerId, sideNode) {
  const players = sideNode && sideNode.players && typeof sideNode.players === "object" ? sideNode.players : {};
  return players[`ID${playerId}`] || null;
}

function playerStatusForSide(playerId, sideValidation, sideNode) {
  const order = Array.isArray(sideNode && sideNode.battingOrder) ? sideNode.battingOrder : [];
  const player = getPreparedPlayerNode(playerId, sideNode);
  if (order.includes(playerId)) return "player_in_lineup";
  if (order.length >= 9) return "player_not_in_lineup";
  if (player) return "pre_lineup_roster_validated";
  return "player_match_missing";
}

function summarizePreparedPlayers(preparedPlayers, calendar, teamMap, homeValidation, awayValidation, boxscoreTeams) {
  const warnings = [];
  const blockers = [];
  const samples = [];
  let checked = 0;
  let inLineup = 0;
  let notInLineup = 0;
  let unknown = 0;
  let rosterValidated = 0;
  let inactiveRosterMatches = 0;
  let matchMissing = 0;

  for (const row of preparedPlayers) {
    checked += 1;
    const teamKey = normalizeTeamKey(row.team);
    const teamRef = teamMap.get(teamKey);
    if (!teamRef) {
      unknown += 1;
      warnings.push(`team_ref_missing_${teamKey || "blank"}_${row.resolved_mlb_player_id}`);
      continue;
    }
    const playerId = intOrNull(row.resolved_mlb_player_id);
    let side = null;
    if (teamRef.mlb_team_id === intOrNull(calendar.home_team_id)) side = "home";
    else if (teamRef.mlb_team_id === intOrNull(calendar.away_team_id)) side = "away";
    else {
      unknown += 1;
      warnings.push(`prepared_team_not_in_calendar_${teamKey}_${row.resolved_mlb_player_id}`);
      continue;
    }
    const validation = side === "home" ? homeValidation : awayValidation;
    const sideNode = boxscoreTeams && boxscoreTeams[side] ? boxscoreTeams[side] : null;
    const playerNode = getPreparedPlayerNode(playerId, sideNode);
    const status = playerStatusForSide(playerId, validation, sideNode);
    const statusCode = playerNode && playerNode.status ? playerNode.status.code || null : null;
    const statusDescription = playerNode && playerNode.status ? playerNode.status.description || null : null;

    if (status === "player_in_lineup") inLineup += 1;
    else if (status === "player_not_in_lineup") notInLineup += 1;
    else if (status === "pre_lineup_roster_validated") {
      if (statusCode && statusCode !== "A") {
        inactiveRosterMatches += 1;
        warnings.push(`prepared_player_non_active_status_${teamKey}_${playerId}_${statusCode}`);
      } else {
        rosterValidated += 1;
      }
    }
    else if (status === "player_match_missing") matchMissing += 1;
    else unknown += 1;

    if (samples.length < 15) {
      samples.push({
        game_pk: intOrNull(row.official_game_pk),
        player_id: playerId,
        player_name: row.player_name || null,
        team: teamKey,
        side,
        status,
        roster_status_code: statusCode,
        roster_status_description: statusDescription,
        prepared_rows: Number(row.prepared_rows || 0),
        sources: row.sources || null,
        prop_keys: row.prop_keys || null
      });
    }
  }

  if (matchMissing > 0) warnings.push(`prepared_player_match_missing_count_${matchMissing}`);
  if (inactiveRosterMatches > 0) warnings.push(`prepared_player_non_active_status_count_${inactiveRosterMatches}`);
  return { checked, inLineup, notInLineup, unknown, rosterValidated, inactiveRosterMatches, matchMissing, samples, warnings, blockers };
}


function buildLineupWritePreviewRows(gamePk, calendar, side, validation) {
  const sidePrefix = side === "home" ? "home" : "away";
  const teamId = intOrNull(calendar[`${sidePrefix}_team_id`]);
  const teamName = calendar[`${sidePrefix}_team_name`] || null;
  const rows = [];
  const mapped = Array.isArray(validation && validation.mapped_players) ? validation.mapped_players : [];
  for (const player of mapped) {
    rows.push({
      dry_run_only: true,
      target_table: "daily_lineups_current",
      game_pk: intOrNull(gamePk),
      official_date: calendar.official_date || null,
      game_time_utc: calendar.game_time_utc || null,
      team_side: side,
      team_id: teamId,
      team_name: teamName,
      player_id: intOrNull(player.player_id),
      player_name: player.player_name || null,
      lineup_slot: intOrNull(player.lineup_slot),
      batting_order_code: player.batting_order_code || null,
      bat_side: player.bat_side || null,
      active_position: player.position || null,
      lineup_status: "posted_lineup",
      source_endpoint: "/api/v1/game/{gamePk}/boxscore",
      write_gate: "locked_preview_only",
      write_enabled: PRODUCTION_LINEUP_WRITES_ENABLED
    });
  }
  return rows;
}

function buildAvailabilityWritePreviewRows(gamePk, calendar, preparedSummary) {
  const rows = [];
  for (const player of (preparedSummary && preparedSummary.samples ? preparedSummary.samples : [])) {
    rows.push({
      dry_run_only: true,
      target_table: "daily_player_availability_current",
      game_pk: intOrNull(gamePk),
      official_date: calendar.official_date || null,
      game_time_utc: calendar.game_time_utc || null,
      player_id: intOrNull(player.player_id),
      player_name: player.player_name || null,
      team: player.team || null,
      side: player.side || null,
      availability_status: player.status || null,
      roster_status_code: player.roster_status_code || null,
      roster_status_description: player.roster_status_description || null,
      source_status: "derived_from_boxscore_players_map_before_batting_order_posted",
      confidence_label: player.status === "pre_lineup_roster_validated" ? "PRE_LINEUP_ROSTER_VALIDATED" : "SOURCE_PROBE_ONLY",
      prepared_rows: Number(player.prepared_rows || 0),
      sources: player.sources || null,
      prop_keys: player.prop_keys || null,
      write_gate: "locked_preview_only",
      write_enabled: DERIVED_BACKUP_WRITE_ENABLED
    });
  }
  return rows;
}

function lineupParserContract() {
  return {
    parser_status: "wired_dry_run_only",
    boxscore_lineup_path_home: "teams.home.battingOrder",
    boxscore_lineup_path_away: "teams.away.battingOrder",
    player_map_path_home: "teams.home.players.ID{playerId}",
    player_map_path_away: "teams.away.players.ID{playerId}",
    slot_rule: "array_index_plus_one_is_lineup_slot",
    identity_rule: "battingOrder integer must equal players.ID{playerId}.person.id",
    posted_lineup_gate: "battingOrder.length >= 9",
    not_posted_gate: "battingOrder.length === 0",
    partial_lineup_gate: "battingOrder.length between 1 and 8",
    position_rule: "position fields are informational only before battingOrder posts",
    production_write_gate: "locked_until_user_explicitly_approves_after_real_posted_lineup_probe"
  };
}

function futureWriteUnlockRequirements() {
  return [
    "At least one real game returns battingOrder.length >= 9 for both teams or a valid posted lineup side.",
    "Every battingOrder player ID maps to teams.[side].players.ID{playerId}.",
    "Every mapped player has person.id matching the battingOrder integer.",
    "Dry-run lineup_write_preview_sample shows correct slot, side, team, player_id, and player_name.",
    "No production writes, score writes, board mutation, ranking, or final-board writes occur during the probe.",
    "production_lineup_writes_enabled is changed only after user approval and a posted-lineup probe pass.",
    "derived_backup_write_enabled is changed only after user approval and repeated pre-lineup roster validation passes."
  ];
}

function futureTableContracts() {
  return {
    daily_lineups_current: {
      status: "future_contract_placeholder_no_writes",
      minimum_fields: ["game_pk", "official_date", "game_time_utc", "team_side", "team_id", "player_id", "player_name", "lineup_slot", "lineup_status", "source_endpoint", "fetched_at_utc"]
    },
    daily_player_availability_current: {
      status: "future_contract_placeholder_no_writes",
      minimum_fields: ["game_pk", "official_date", "game_time_utc", "player_id", "player_name", "team", "side", "availability_status", "roster_status_code", "confidence_label", "fetched_at_utc"]
    },
    daily_lineups_batches: {
      status: "future_contract_placeholder_no_writes",
      minimum_fields: ["batch_id", "source_mode", "certification_status", "games_checked", "players_checked", "rows_written", "created_at"]
    }
  };
}

function writeFrameworkContract() {
  return {
    framework_status: "wired_locked_off",
    production_lineup_writes_enabled: PRODUCTION_LINEUP_WRITES_ENABLED,
    derived_backup_write_enabled: DERIVED_BACKUP_WRITE_ENABLED,
    writes_performed_required_value: 0,
    confirmed_lineup_write_rule: "only from battingOrder arrays with length >= 9 and verified players.ID{playerId}.person.id mappings",
    pre_lineup_availability_rule: "only active roster validation from players map; never implies confirmed starting lineup",
    hard_block_rules: [
      "block if production lineup writes are enabled while any target side has battingOrder length 0",
      "block if production lineup writes are enabled while any target side has battingOrder length 1-8",
      "block if production lineup writes are enabled and the boxscore players map is missing or has fewer than 15 players for a target side",
      "block if derived backup writes are enabled and the boxscore players map is missing or has fewer than 15 players for a target side",
      "block if any battingOrder ID fails players.ID{playerId}.person.id mapping"
    ],
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_prepared_board_mutation: true
  };
}

function evaluateWriteFrameworkSafety(games) {
  const hardBlocks = [];
  const checks = [];
  for (const g of games || []) {
    for (const side of ["home", "away"]) {
      const orderCount = Number(g[`${side}_batting_order_count`] || 0);
      const playerMapCount = Number(g[`${side}_player_map_count`] || 0);
      checks.push({
        game_pk: g.game_pk,
        side,
        batting_order_count: orderCount,
        player_map_count: playerMapCount,
        production_lineup_write_safe: !PRODUCTION_LINEUP_WRITES_ENABLED,
        derived_backup_write_safe: !DERIVED_BACKUP_WRITE_ENABLED || playerMapCount >= 15
      });
      if (PRODUCTION_LINEUP_WRITES_ENABLED && orderCount === 0) hardBlocks.push(`production_lineup_write_enabled_but_${g.game_pk}_${side}_batting_order_empty`);
      if (PRODUCTION_LINEUP_WRITES_ENABLED && orderCount > 0 && orderCount < 9) hardBlocks.push(`production_lineup_write_enabled_but_${g.game_pk}_${side}_batting_order_partial_${orderCount}`);
      if (PRODUCTION_LINEUP_WRITES_ENABLED && playerMapCount < 15) hardBlocks.push(`production_lineup_write_enabled_but_${g.game_pk}_${side}_player_map_underpopulated_${playerMapCount}`);
      if (DERIVED_BACKUP_WRITE_ENABLED && playerMapCount < 15) hardBlocks.push(`derived_backup_write_enabled_but_${g.game_pk}_${side}_player_map_underpopulated_${playerMapCount}`);
    }
  }
  return {
    write_framework_locked_off: !PRODUCTION_LINEUP_WRITES_ENABLED && !DERIVED_BACKUP_WRITE_ENABLED,
    production_lineup_writes_enabled: PRODUCTION_LINEUP_WRITES_ENABLED,
    derived_backup_write_enabled: DERIVED_BACKUP_WRITE_ENABLED,
    hard_blocks: hardBlocks,
    checks: checks.slice(0, 20)
  };
}


function certificationFrom(games, sourceFailures, discovery, writeHardBlocks = []) {
  const blockerCount = games.reduce((sum, g) => sum + g.blockers.length, 0) + sourceFailures + writeHardBlocks.length;
  const warningCount = games.reduce((sum, g) => sum + g.warnings.length, 0);
  const mappingFailure = games.some((g) => (g.home_mapping_valid === false && g.home_batting_order_count > 0) || (g.away_mapping_valid === false && g.away_batting_order_count > 0));
  const malformed = games.some((g) => (g.boxscore_ok || g.feed_live_ok) && g.blockers.some((b) => String(b).includes("malformed") || String(b).includes("missing") || String(b).includes("not_array")));
  const anyEndpointAvailable = games.some((g) => g.boxscore_ok || g.feed_live_ok);
  const allEndpointUninitialized = games.length > 0 && games.every((g) => g.boxscore_http_status === 404 && g.feed_live_http_status === 404);
  const allLineupsNotPosted = games.length > 0 && games.every((g) => (g.home_lineup_status === "lineup_not_posted" || g.home_lineup_status === "game_endpoint_not_initialized") && (g.away_lineup_status === "lineup_not_posted" || g.away_lineup_status === "game_endpoint_not_initialized"));
  const anyPostedLineup = games.some((g) => g.home_lineup_status === "posted_lineup" || g.away_lineup_status === "posted_lineup");
  const lineupPreviewRows = games.reduce((sum, g) => sum + Number(g.lineup_write_preview_row_count || 0), 0);
  const preparedStale = discovery && discovery.prepared_board_stale_warning;

  if (writeHardBlocks.length > 0) return { status: "BLOCKED_WRITE_FRAMEWORK_GUARDRAIL", grade: "BLOCKED", blockerCount, warningCount };
  if (mappingFailure && anyEndpointAvailable) return { status: "BLOCKED_MAPPING_FAILURE", grade: "BLOCKED", blockerCount, warningCount };
  if (malformed) return { status: "BLOCKED_MALFORMED_SOURCE", grade: "BLOCKED", blockerCount, warningCount };
  if (sourceFailures > 0 && !anyEndpointAvailable) return { status: "BLOCKED_SOURCE_FAILURE", grade: "BLOCKED", blockerCount, warningCount };
  if (allEndpointUninitialized) return { status: "BLOCKED_GAME_ENDPOINTS_UNINITIALIZED", grade: "BLOCKED", blockerCount, warningCount };
  if (blockerCount > 0) return { status: "BLOCKED_SOURCE_DISCOVERY", grade: "BLOCKED", blockerCount, warningCount };
  const preparedChecked = games.reduce((sum, g) => sum + Number(g.prepared_players_checked || 0), 0);
  const rosterValidated = games.reduce((sum, g) => sum + Number(g.prepared_players_roster_validated || 0), 0);
  if (anyEndpointAvailable && anyPostedLineup && lineupPreviewRows > 0) return { status: "PASS_LINEUP_PARSER_READY_WRITE_LOCKED", grade: "DISCOVERY_PASS_LINEUP_WRITE_PREVIEW_READY", blockerCount, warningCount };
  if (anyEndpointAvailable && allLineupsNotPosted && preparedStale) return { status: "PASS_CALENDAR_SOURCE_PROBE_WITH_PREPARED_BOARD_STALE", grade: "DISCOVERY_PASS_LINEUPS_NOT_POSTED", blockerCount, warningCount: warningCount + 1 };
  if (anyEndpointAvailable && allLineupsNotPosted && preparedChecked > 0 && rosterValidated > 0) return { status: "PASS_WRITE_FRAMEWORK_LOCKED_OFF", grade: "WRITE_FRAMEWORK_LOCKED_OFF_PRE_LINEUP_ROSTER_VALIDATED", blockerCount, warningCount };
  if (anyEndpointAvailable && allLineupsNotPosted) return { status: "PASS_SOURCE_REACHABLE_LINEUPS_NOT_POSTED", grade: "DISCOVERY_PASS_LINEUPS_NOT_POSTED", blockerCount, warningCount };
  if (warningCount > 0 || preparedStale) return { status: "PASS_WITH_WARNINGS", grade: "A_MINUS", blockerCount, warningCount: warningCount + (preparedStale ? 1 : 0) };
  return { status: "PASS", grade: "A", blockerCount, warningCount };
}

async function runSourceProbe(env, input) {
  const startedAt = nowUtc();
  const rawSourceBase = String(env.MLB_API_BASE_URL || DEFAULT_MLB_BASE_URL).replace(/\/$/, "");
  const sourceBase = normalizeMlbOrigin(rawSourceBase);
  const userAgent = env.MLB_API_USER_AGENT || "AlphaDogDailyLineupsSourceProbe/0.1.6";
  const probeFeedLive = input.probe_feed_live !== false;
  const todayUtc = nowUtc().slice(0, 10);

  const anchors = await getPreparedGameAnchors(env);
  const preparedGamePks = uniqInts(anchors.map((r) => r.official_game_pk));
  const [preparedCalendarRows, preparedPlayers, calendarProbeRows, teamMap] = await Promise.all([
    getCalendarRows(env, preparedGamePks),
    getPreparedPlayers(env, preparedGamePks),
    getCalendarOnlyProbeRows(env, todayUtc),
    getTeamMap(env)
  ]);

  const preparedScheduleDiscovery = await discoverOfficialSchedule(env, sourceBase, userAgent, preparedCalendarRows, "prepared");
  const calendarScheduleDiscovery = await discoverOfficialSchedule(env, sourceBase, userAgent, calendarProbeRows, "calendar_probe");
  const preparedBoardStale = preparedGamePks.length > 0 && preparedScheduleDiscovery.prepared_official_schedule_checked && Number(preparedScheduleDiscovery.prepared_official_schedule_anchor_hit_count || 0) < preparedGamePks.length;

  const usePreparedBoardLane = preparedGamePks.length > 0 && !preparedBoardStale && preparedCalendarRows.length > 0;
  const sourceRows = usePreparedBoardLane ? preparedCalendarRows : calendarProbeRows.length ? calendarProbeRows : preparedCalendarRows;
  const sourceLane = usePreparedBoardLane ? "prepared_board_source_probe" : "calendar_only_source_probe";
  const sourceGamePks = uniqInts(sourceRows.map((r) => r.game_pk));
  const calendarByGame = new Map(sourceRows.map((r) => [intOrNull(r.game_pk), r]));

  const preparedByGame = new Map();
  for (const row of preparedPlayers) {
    const pk = intOrNull(row.official_game_pk);
    if (!preparedByGame.has(pk)) preparedByGame.set(pk, []);
    preparedByGame.get(pk).push(row);
  }

  const startingPageFetch = await fetchTextWithTimeout(MLB_STARTING_LINEUPS_URL, userAgent);
  const startingPageAnalysis = analyzeStartingLineupsPage(startingPageFetch.text, sourceRows, preparedPlayers);
  const discovery = {
    ...preparedScheduleDiscovery,
    ...calendarScheduleDiscovery,
    prepared_board_stale_warning: preparedBoardStale,
    source_probe_lane: sourceLane,
    calendar_probe_target_date_utc: todayUtc,
    calendar_probe_games_available: calendarProbeRows.length,
    calendar_probe_game_pks: sourceGamePks,
    mlb_starting_lineups_page_checked: true,
    mlb_starting_lineups_url: MLB_STARTING_LINEUPS_URL,
    mlb_starting_lineups_http_status: startingPageFetch.http_status,
    mlb_starting_lineups_ok: !!startingPageFetch.ok,
    mlb_starting_lineups_response_bytes: startingPageFetch.response_bytes || 0,
    mlb_starting_lineups_has_embedded_json_marker: startingPageAnalysis.has_next_data_marker,
    mlb_starting_lineups_has_json_or_lineup_marker: startingPageAnalysis.has_json_or_lineup_marker,
    mlb_starting_lineups_target_date_hits: startingPageAnalysis.target_date_hits,
    mlb_starting_lineups_target_team_name_hit_count: startingPageAnalysis.target_team_name_hit_count,
    mlb_starting_lineups_target_team_name_hits_sample: startingPageAnalysis.target_team_name_hits_sample,
    mlb_starting_lineups_target_team_abbr_hit_count: startingPageAnalysis.target_team_abbr_hit_count,
    mlb_starting_lineups_target_team_abbr_hits_sample: startingPageAnalysis.target_team_abbr_hits_sample,
    mlb_starting_lineups_target_player_name_hit_count: startingPageAnalysis.target_player_name_hit_count,
    mlb_starting_lineups_target_player_name_hits_sample: startingPageAnalysis.target_player_name_hits_sample
  };

  const games = [];
  let boxscoreCalls = 0;
  let feedLiveCalls = 0;
  let sourceFailures = 0;

  for (const gamePk of sourceGamePks) {
    const calendar = calendarByGame.get(gamePk) || { game_pk: gamePk };
    const gamePreparedPlayers = preparedByGame.get(gamePk) || [];
    const warnings = [];
    const blockers = [];
    if (preparedBoardStale && sourceLane === "calendar_only_source_probe") warnings.push("prepared_board_stale_calendar_only_probe_used");

    const boxscoreUrl = buildMlbUrl(sourceBase, `/api/v1/game/${gamePk}/boxscore`);
    const feedLiveUrl = buildMlbUrl(sourceBase, `/api/v1.1/game/${gamePk}/feed/live`);

    boxscoreCalls += 1;
    const box = await fetchJsonWithRetry(boxscoreUrl, userAgent, MAX_ENDPOINT_RETRIES);
    let boxscoreOk = !!(box.ok && box.json);
    let boxscoreTeams = boxscoreOk && box.json && box.json.teams ? box.json.teams : null;
    if (!boxscoreOk) {
      if (box.http_status === 404) warnings.push("boxscore_game_endpoint_not_initialized_http_404");
      else {
        sourceFailures += 1;
        blockers.push(`boxscore_fetch_failed_http_${box.http_status || "none"}`);
      }
    }
    if (boxscoreOk && !boxscoreTeams) blockers.push("boxscore_root_teams_missing");

    let feedLiveOk = null;
    let feedLiveTimestamp = null;
    let live = null;
    let liveTeams = null;
    if (probeFeedLive || !boxscoreOk) {
      feedLiveCalls += 1;
      live = await fetchJsonWithRetry(feedLiveUrl, userAgent, MAX_ENDPOINT_RETRIES);
      feedLiveOk = !!(live.ok && live.json && live.json.gamePk === gamePk && live.json.liveData && live.json.liveData.boxscore);
      if (!feedLiveOk) {
        if (live.http_status === 404) warnings.push("feed_live_game_endpoint_not_initialized_http_404");
        else warnings.push(`feed_live_probe_failed_http_${live.http_status || "none"}`);
      }
      feedLiveTimestamp = live.json && live.json.metaData ? live.json.metaData.timeStamp || null : null;
      liveTeams = feedLiveOk && live.json.liveData.boxscore ? live.json.liveData.boxscore.teams || null : null;
      if (feedLiveOk && boxscoreOk) {
        const liveHome = liveTeams && liveTeams.home ? liveTeams.home.battingOrder || [] : [];
        const liveAway = liveTeams && liveTeams.away ? liveTeams.away.battingOrder || [] : [];
        const boxHome = boxscoreTeams && boxscoreTeams.home ? boxscoreTeams.home.battingOrder || [] : [];
        const boxAway = boxscoreTeams && boxscoreTeams.away ? boxscoreTeams.away.battingOrder || [] : [];
        if (JSON.stringify(liveHome) !== JSON.stringify(boxHome)) warnings.push("feed_live_home_batting_order_differs_from_boxscore");
        if (JSON.stringify(liveAway) !== JSON.stringify(boxAway)) warnings.push("feed_live_away_batting_order_differs_from_boxscore");
      }
    }

    const activeTeams = boxscoreTeams || liveTeams;
    let homeValidation;
    let awayValidation;
    if (activeTeams) {
      homeValidation = validateSide("home", activeTeams && activeTeams.home);
      awayValidation = validateSide("away", activeTeams && activeTeams.away);
      warnings.push(...homeValidation.warnings, ...awayValidation.warnings);
      blockers.push(...homeValidation.blockers);
      blockers.push(...awayValidation.blockers);
    } else {
      homeValidation = { batting_order_count: 0, batting_order_sample: [], player_map_count: 0, player_map_sample: [], lineup_status: "game_endpoint_not_initialized", mapping_valid: null, mapped_players_sample: [], warnings: [], blockers: [] };
      awayValidation = { batting_order_count: 0, batting_order_sample: [], player_map_count: 0, player_map_sample: [], lineup_status: "game_endpoint_not_initialized", mapping_valid: null, mapped_players_sample: [], warnings: [], blockers: [] };
    }

    const preparedSummary = summarizePreparedPlayers(gamePreparedPlayers, calendar, teamMap, homeValidation, awayValidation, activeTeams);
    warnings.push(...preparedSummary.warnings);
    blockers.push(...preparedSummary.blockers);

    const lineupWritePreviewRows = [
      ...buildLineupWritePreviewRows(gamePk, calendar, "home", homeValidation),
      ...buildLineupWritePreviewRows(gamePk, calendar, "away", awayValidation)
    ];
    const availabilityWritePreviewRows = buildAvailabilityWritePreviewRows(gamePk, calendar, preparedSummary);
    const lineupWriteReady = lineupWritePreviewRows.length > 0 && (homeValidation.lineup_status === "posted_lineup" || awayValidation.lineup_status === "posted_lineup");

    games.push({
      game_pk: gamePk,
      probe_lane: sourceLane,
      official_date: calendar.official_date || null,
      game_time_utc: calendar.game_time_utc || null,
      home_team_id: intOrNull(calendar.home_team_id),
      away_team_id: intOrNull(calendar.away_team_id),
      home_team_name: calendar.home_team_name || null,
      away_team_name: calendar.away_team_name || null,
      detailed_state: calendar.detailed_state || null,
      abstract_game_state: calendar.abstract_game_state || null,
      boxscore_ok: boxscoreOk,
      boxscore_http_status: box.http_status,
      boxscore_elapsed_ms: box.elapsed_ms,
      boxscore_response_bytes: box.response_bytes || 0,
      feed_live_ok: feedLiveOk,
      feed_live_http_status: live ? live.http_status : null,
      feed_live_source_timestamp: feedLiveTimestamp,
      boxscore_attempts: box.attempts || [],
      feed_live_attempts: live && live.attempts ? live.attempts : [],
      game_endpoint_availability_status: activeTeams ? "game_endpoint_available" : ((box.http_status === 404 && live && live.http_status === 404) ? "game_endpoints_uninitialized" : "game_endpoints_unavailable"),
      fetched_at_utc: nowUtc(),
      home_batting_order_count: homeValidation.batting_order_count,
      away_batting_order_count: awayValidation.batting_order_count,
      home_batting_order_sample: homeValidation.batting_order_sample,
      away_batting_order_sample: awayValidation.batting_order_sample,
      home_player_map_count: homeValidation.player_map_count,
      away_player_map_count: awayValidation.player_map_count,
      home_player_map_sample: homeValidation.player_map_sample,
      away_player_map_sample: awayValidation.player_map_sample,
      home_lineup_status: homeValidation.lineup_status,
      away_lineup_status: awayValidation.lineup_status,
      home_mapping_valid: homeValidation.mapping_valid,
      away_mapping_valid: awayValidation.mapping_valid,
      home_mapped_players_sample: homeValidation.mapped_players_sample,
      away_mapped_players_sample: awayValidation.mapped_players_sample,
      prepared_players_checked: preparedSummary.checked,
      prepared_players_in_lineup: preparedSummary.inLineup,
      prepared_players_not_in_lineup: preparedSummary.notInLineup,
      prepared_players_unknown: preparedSummary.unknown,
      prepared_players_roster_validated: preparedSummary.rosterValidated,
      prepared_players_inactive_roster_matches: preparedSummary.inactiveRosterMatches,
      prepared_players_match_missing: preparedSummary.matchMissing,
      prepared_player_status_sample: preparedSummary.samples,
      lineup_write_ready: lineupWriteReady,
      lineup_write_preview_only: true,
      lineup_write_preview_row_count: lineupWritePreviewRows.length,
      lineup_write_preview_sample: lineupWritePreviewRows.slice(0, 18),
      availability_write_preview_only: true,
      availability_write_preview_row_count: availabilityWritePreviewRows.length,
      availability_write_preview_sample: availabilityWritePreviewRows.slice(0, 15),
      derived_backup_status: preparedSummary.rosterValidated > 0 && homeValidation.batting_order_count === 0 && awayValidation.batting_order_count === 0 ? "PRE_LINEUP_ROSTER_VALIDATED" : null,
      warnings: warnings.slice(0, 80),
      blockers: blockers.slice(0, 80)
    });
  }

  const writeSafety = evaluateWriteFrameworkSafety(games);
  const cert = certificationFrom(games, sourceFailures, discovery, writeSafety.hard_blocks);
  const ok = cert.status.startsWith("PASS");
  const preparedRowsRead = anchors.reduce((sum, r) => sum + Number(r.prepared_rows || 0), 0);
  const preparedPlayersChecked = games.reduce((sum, g) => sum + Number(g.prepared_players_checked || 0), 0);
  const lineupWritePreviewSample = games.flatMap((g) => g.lineup_write_preview_sample || []).slice(0, 30);
  const availabilityWritePreviewSample = games.flatMap((g) => g.availability_write_preview_sample || []).slice(0, 30);
  const lineupWritePreviewRows = games.reduce((sum, g) => sum + Number(g.lineup_write_preview_row_count || 0), 0);
  const availabilityWritePreviewRows = games.reduce((sum, g) => sum + Number(g.availability_write_preview_row_count || 0), 0);
  const lineupWriteReadyGames = games.filter((g) => g.lineup_write_ready).length;

  return {
    ok,
    data_ok: ok,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    mode: "source_probe",
    status: ok ? "COMPLETED_SOURCE_PROBE" : "BLOCKED_SOURCE_PROBE",
    certification: cert.status,
    certification_status: cert.status,
    certification_grade: cert.grade,
    request_id: input.request_id || null,
    chain_id: input.chain_id || null,
    started_at: startedAt,
    completed_at: nowUtc(),
    source_probe_lane: sourceLane,
    mlb_api_base_url_raw: rawSourceBase,
    mlb_api_origin_used: sourceBase,
    prepared_board_stale_warning: preparedBoardStale,
    games_checked: games.length,
    calendar_probe_games_checked: calendarProbeRows.length,
    prepared_games_checked: anchors.length,
    prepared_rows_read: preparedRowsRead,
    prepared_players_checked: preparedPlayersChecked,
    prepared_players_roster_validated: games.reduce((sum, g) => sum + Number(g.prepared_players_roster_validated || 0), 0),
    prepared_player_status_sample: games.flatMap((g) => g.prepared_player_status_sample || []).slice(0, 30),
    derived_backup_status: games.some((g) => Number(g.prepared_players_roster_validated || 0) > 0) ? "PRE_LINEUP_ROSTER_VALIDATED_SOURCE_PROBE_ONLY" : null,
    production_lineup_writes_enabled: PRODUCTION_LINEUP_WRITES_ENABLED,
    derived_backup_write_enabled: DERIVED_BACKUP_WRITE_ENABLED,
    write_framework_locked_off: writeSafety.write_framework_locked_off,
    write_framework_contract: writeFrameworkContract(),
    future_table_contracts: futureTableContracts(),
    write_safety_hard_blocks: writeSafety.hard_blocks,
    write_safety_checks: writeSafety.checks,
    lineup_write_ready_games: lineupWriteReadyGames,
    lineup_write_preview_only: true,
    lineup_write_preview_row_count: lineupWritePreviewRows,
    lineup_write_preview_sample: lineupWritePreviewSample,
    availability_write_preview_only: true,
    availability_write_preview_row_count: availabilityWritePreviewRows,
    availability_write_preview_sample: availabilityWritePreviewSample,
    lineup_parser_contract: lineupParserContract(),
    future_write_unlock_requirements: futureWriteUnlockRequirements(),
    boxscore_calls: boxscoreCalls,
    feed_live_calls: feedLiveCalls,
    external_calls_performed: boxscoreCalls + feedLiveCalls + 3,
    source_failures: sourceFailures,
    boxscore_404_count: games.filter((g) => g.boxscore_http_status === 404).length,
    feed_live_404_count: games.filter((g) => g.feed_live_http_status === 404).length,
    mlb_starting_lineups_page_checked: discovery.mlb_starting_lineups_page_checked,
    mlb_starting_lineups_http_status: discovery.mlb_starting_lineups_http_status,
    mlb_starting_lineups_response_bytes: discovery.mlb_starting_lineups_response_bytes,
    mlb_starting_lineups_has_embedded_json_marker: discovery.mlb_starting_lineups_has_embedded_json_marker,
    mlb_starting_lineups_target_team_name_hit_count: discovery.mlb_starting_lineups_target_team_name_hit_count,
    mlb_starting_lineups_target_player_name_hit_count: discovery.mlb_starting_lineups_target_player_name_hit_count,
    official_schedule_checked: discovery.calendar_probe_official_schedule_checked || discovery.prepared_official_schedule_checked,
    prepared_official_schedule_anchor_hit_count: discovery.prepared_official_schedule_anchor_hit_count,
    prepared_official_schedule_anchor_missing_count: discovery.prepared_official_schedule_anchor_missing_count,
    calendar_probe_official_schedule_anchor_hit_count: discovery.calendar_probe_official_schedule_anchor_hit_count,
    calendar_probe_official_schedule_anchor_missing_count: discovery.calendar_probe_official_schedule_anchor_missing_count,
    warning_count: cert.warningCount,
    blocker_count: cert.blockerCount,
    rows_read: preparedRowsRead + sourceRows.length,
    rows_written: 0,
    writes_performed: 0,
    output_json: {
      source_probe_only: true,
      source_probe_lane: sourceLane,
      mlb_api_base_url_raw: rawSourceBase,
      mlb_api_origin_used: sourceBase,
      prepared_board_stale_warning: preparedBoardStale,
      derived_backup_status: games.some((g) => Number(g.prepared_players_roster_validated || 0) > 0) ? "PRE_LINEUP_ROSTER_VALIDATED_SOURCE_PROBE_ONLY" : null,
      production_lineup_writes_enabled: PRODUCTION_LINEUP_WRITES_ENABLED,
      derived_backup_write_enabled: DERIVED_BACKUP_WRITE_ENABLED,
      write_framework_locked_off: writeSafety.write_framework_locked_off,
      write_framework_contract: writeFrameworkContract(),
      future_table_contracts: futureTableContracts(),
      write_safety_hard_blocks: writeSafety.hard_blocks,
      write_safety_checks: writeSafety.checks,
      lineup_write_preview_only: true,
      lineup_write_ready_games: lineupWriteReadyGames,
      lineup_write_preview_row_count: lineupWritePreviewRows,
      lineup_write_preview_sample: lineupWritePreviewSample,
      availability_write_preview_only: true,
      availability_write_preview_row_count: availabilityWritePreviewRows,
      availability_write_preview_sample: availabilityWritePreviewSample,
      lineup_parser_contract: lineupParserContract(),
      future_write_unlock_requirements: futureWriteUnlockRequirements(),
      primary_endpoint: "/api/v1/game/{gamePk}/boxscore",
      fallback_endpoint: "/api/v1.1/game/{gamePk}/feed/live",
      source_discovery_ladder: ["prepared_board_anchor_check", "calendar_only_source_probe", "official_schedule_anchor_check", "mlb_starting_lineups_page_probe", "game_boxscore_probe", "feed_live_probe"],
      discovery,
      no_prepared_board_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      unlock_note: "Production daily_lineups_current and daily_player_availability_current writes remain blocked until source_probe passes repeatedly and user explicitly approves write phase."
    },
    games
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") return new Response(null, { status: 204 });

    if (method === "GET" && path === "/") {
      return jsonResponse(baseIdentity(env));
    }

    if (method === "GET" && path === "/health") {
      const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
      const vars = varPresence(env, EXPECTED_VARS);
      return jsonResponse({
        ...baseIdentity(env),
        route: "/health",
        checks: { db_bindings: db, vars },
        safe_secret_note: "Secret values are intentionally never printed."
      });
    }

    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      return jsonResponse({
        ...baseIdentity(env),
        route: "/diagnostic",
        input_echo_safe: {
          request_id: input.request_id || null,
          chain_id: input.chain_id || null,
          job_key: input.job_key || null,
          mode: input.mode || null
        },
        writes_performed: 0,
        external_calls_performed: 0
      });
    }

    if (method === "POST" && (path === "/run" || path === "/source-probe")) {
      const input = await readJsonSafe(request);
      const mode = String(input.mode || "source_probe");
      if (mode !== "source_probe" && mode !== "orchestrator_exact_daily_lineups_source_probe") {
        return jsonResponse({
          ok: false,
          data_ok: false,
          version: VERSION,
          worker_name: WORKER_NAME,
          job_key: input.job_key || JOB_KEY,
          status: "unsupported_mode_source_probe_only",
          supported_modes: ["source_probe"],
          requested_mode: mode,
          rows_written: 0,
          writes_performed: 0,
          no_scoring: true,
          no_ranking: true,
          no_final_board: true
        }, 400);
      }
      const output = await runSourceProbe(env, input);
      return jsonResponse(output, output.ok ? 200 : 502);
    }

    return jsonResponse({
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      status: "NOT_FOUND",
      allowed_routes: ["GET /", "GET /health", "POST /run", "POST /source-probe", "POST /diagnostic"],
      timestamp_utc: nowUtc()
    }, 404);
  }
};
