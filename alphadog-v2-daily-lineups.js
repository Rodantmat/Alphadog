const WORKER_NAME = "alphadog-v2-daily-lineups";
const VERSION = "alphadog-v2-daily-lineups-v0.1.0-source-probe";
const JOB_KEY = "daily-lineups";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "TEAM_DB", "DAILY_DB", "SCORE_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "MLB_API_BASE_URL", "MAX_API_CALLS_PER_TICK"];
const DEFAULT_MLB_BASE_URL = "https://statsapi.mlb.com";
const MAX_GAMES = 5;
const FETCH_TIMEOUT_MS = 12000;

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
    lineup_status: lineupStatus,
    mapping_valid: mappingValid,
    mapped_players_sample: mappedPlayers.slice(0, 12),
    warnings,
    blockers
  };
}

function playerStatusForSide(playerId, sideValidation, sideNode) {
  const order = Array.isArray(sideNode && sideNode.battingOrder) ? sideNode.battingOrder : [];
  const players = sideNode && sideNode.players && typeof sideNode.players === "object" ? sideNode.players : {};
  const key = `ID${playerId}`;
  if (order.includes(playerId)) return "player_in_lineup";
  if (order.length >= 9) return "player_not_in_lineup";
  if (players[key]) return "player_unknown";
  return "player_match_missing";
}

function summarizePreparedPlayers(preparedPlayers, calendar, teamMap, homeValidation, awayValidation, boxscoreTeams) {
  const warnings = [];
  const blockers = [];
  let checked = 0;
  let inLineup = 0;
  let notInLineup = 0;
  let unknown = 0;
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
    const status = playerStatusForSide(playerId, validation, sideNode);
    if (status === "player_in_lineup") inLineup += 1;
    else if (status === "player_not_in_lineup") notInLineup += 1;
    else if (status === "player_match_missing") matchMissing += 1;
    else unknown += 1;
  }

  if (matchMissing > 0) warnings.push(`prepared_player_match_missing_count_${matchMissing}`);
  return { checked, inLineup, notInLineup, unknown, matchMissing, warnings, blockers };
}

function certificationFrom(games, sourceFailures) {
  const blockerCount = games.reduce((sum, g) => sum + g.blockers.length, 0) + sourceFailures;
  const warningCount = games.reduce((sum, g) => sum + g.warnings.length, 0);
  const mappingFailure = games.some((g) => g.home_mapping_valid === false || g.away_mapping_valid === false);
  const malformed = games.some((g) => g.boxscore_ok && g.blockers.some((b) => String(b).includes("malformed") || String(b).includes("missing") || String(b).includes("not_array")));

  if (sourceFailures > 0) return { status: "BLOCKED_SOURCE_FAILURE", grade: "BLOCKED", blockerCount, warningCount };
  if (mappingFailure) return { status: "BLOCKED_MAPPING_FAILURE", grade: "BLOCKED", blockerCount, warningCount };
  if (malformed || blockerCount > 0) return { status: "BLOCKED_MALFORMED_SOURCE", grade: "BLOCKED", blockerCount, warningCount };
  if (warningCount > 0) return { status: "PASS_WITH_WARNINGS", grade: "A_MINUS", blockerCount, warningCount };
  return { status: "PASS", grade: "A", blockerCount, warningCount };
}

async function runSourceProbe(env, input) {
  const startedAt = nowUtc();
  const sourceBase = String(env.MLB_API_BASE_URL || DEFAULT_MLB_BASE_URL).replace(/\/$/, "");
  const userAgent = env.MLB_API_USER_AGENT || "AlphaDogDailyLineupsSourceProbe/0.1";
  const probeFeedLive = input.probe_feed_live === true;

  const anchors = await getPreparedGameAnchors(env);
  const gamePks = uniqInts(anchors.map((r) => r.official_game_pk));
  const [calendarRows, preparedPlayers, teamMap] = await Promise.all([
    getCalendarRows(env, gamePks),
    getPreparedPlayers(env, gamePks),
    getTeamMap(env)
  ]);

  const calendarByGame = new Map(calendarRows.map((r) => [intOrNull(r.game_pk), r]));
  const preparedByGame = new Map();
  for (const row of preparedPlayers) {
    const pk = intOrNull(row.official_game_pk);
    if (!preparedByGame.has(pk)) preparedByGame.set(pk, []);
    preparedByGame.get(pk).push(row);
  }

  const games = [];
  let boxscoreCalls = 0;
  let feedLiveCalls = 0;
  let sourceFailures = 0;

  for (const gamePk of gamePks) {
    const calendar = calendarByGame.get(gamePk) || anchors.find((r) => intOrNull(r.official_game_pk) === gamePk) || { game_pk: gamePk };
    const gamePreparedPlayers = preparedByGame.get(gamePk) || [];
    const warnings = [];
    const blockers = [];
    const boxscoreUrl = `${sourceBase}/api/v1/game/${gamePk}/boxscore`;
    const feedLiveUrl = `${sourceBase}/api/v1.1/game/${gamePk}/feed/live`;

    boxscoreCalls += 1;
    const box = await fetchJsonWithTimeout(boxscoreUrl, userAgent);
    let boxscoreOk = !!(box.ok && box.json);
    let boxscoreTeams = boxscoreOk && box.json && box.json.teams ? box.json.teams : null;
    if (!boxscoreOk) {
      sourceFailures += 1;
      blockers.push(`boxscore_fetch_failed_http_${box.http_status || "none"}`);
    }
    if (boxscoreOk && !boxscoreTeams) blockers.push("boxscore_root_teams_missing");

    const homeValidation = validateSide("home", boxscoreTeams && boxscoreTeams.home);
    const awayValidation = validateSide("away", boxscoreTeams && boxscoreTeams.away);
    warnings.push(...homeValidation.warnings, ...awayValidation.warnings);
    blockers.push(...homeValidation.blockers, ...awayValidation.blockers);

    let feedLiveOk = null;
    let feedLiveTimestamp = null;
    if (probeFeedLive || !boxscoreOk) {
      feedLiveCalls += 1;
      const live = await fetchJsonWithTimeout(feedLiveUrl, userAgent);
      feedLiveOk = !!(live.ok && live.json && live.json.gamePk === gamePk && live.json.liveData && live.json.liveData.boxscore);
      if (!feedLiveOk) warnings.push(`feed_live_probe_failed_http_${live.http_status || "none"}`);
      feedLiveTimestamp = live.json && live.json.metaData ? live.json.metaData.timeStamp || null : null;
      if (feedLiveOk && boxscoreOk) {
        const liveHome = live.json.liveData.boxscore.teams && live.json.liveData.boxscore.teams.home ? live.json.liveData.boxscore.teams.home.battingOrder || [] : [];
        const liveAway = live.json.liveData.boxscore.teams && live.json.liveData.boxscore.teams.away ? live.json.liveData.boxscore.teams.away.battingOrder || [] : [];
        const boxHome = boxscoreTeams && boxscoreTeams.home ? boxscoreTeams.home.battingOrder || [] : [];
        const boxAway = boxscoreTeams && boxscoreTeams.away ? boxscoreTeams.away.battingOrder || [] : [];
        if (JSON.stringify(liveHome) !== JSON.stringify(boxHome)) warnings.push("feed_live_home_batting_order_differs_from_boxscore");
        if (JSON.stringify(liveAway) !== JSON.stringify(boxAway)) warnings.push("feed_live_away_batting_order_differs_from_boxscore");
      }
    }

    const preparedSummary = summarizePreparedPlayers(gamePreparedPlayers, calendar, teamMap, homeValidation, awayValidation, boxscoreTeams);
    warnings.push(...preparedSummary.warnings);
    blockers.push(...preparedSummary.blockers);

    games.push({
      game_pk: gamePk,
      official_date: calendar.official_date || null,
      game_time_utc: calendar.game_time_utc || null,
      home_team_id: intOrNull(calendar.home_team_id),
      away_team_id: intOrNull(calendar.away_team_id),
      detailed_state: calendar.detailed_state || null,
      abstract_game_state: calendar.abstract_game_state || null,
      boxscore_ok: boxscoreOk,
      boxscore_http_status: box.http_status,
      boxscore_elapsed_ms: box.elapsed_ms,
      boxscore_response_bytes: box.response_bytes || 0,
      feed_live_ok: feedLiveOk,
      feed_live_source_timestamp: feedLiveTimestamp,
      fetched_at_utc: nowUtc(),
      home_batting_order_count: homeValidation.batting_order_count,
      away_batting_order_count: awayValidation.batting_order_count,
      home_batting_order_sample: homeValidation.batting_order_sample,
      away_batting_order_sample: awayValidation.batting_order_sample,
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
      prepared_players_match_missing: preparedSummary.matchMissing,
      warnings: warnings.slice(0, 80),
      blockers: blockers.slice(0, 80)
    });
  }

  const cert = certificationFrom(games, sourceFailures);
  const ok = cert.status === "PASS" || cert.status === "PASS_WITH_WARNINGS";
  const preparedRowsRead = anchors.reduce((sum, r) => sum + Number(r.prepared_rows || 0), 0);
  const preparedPlayersChecked = games.reduce((sum, g) => sum + Number(g.prepared_players_checked || 0), 0);

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
    games_checked: games.length,
    prepared_games_checked: anchors.length,
    prepared_rows_read: preparedRowsRead,
    prepared_players_checked: preparedPlayersChecked,
    boxscore_calls: boxscoreCalls,
    feed_live_calls: feedLiveCalls,
    external_calls_performed: boxscoreCalls + feedLiveCalls,
    source_failures: sourceFailures,
    warning_count: cert.warningCount,
    blocker_count: cert.blockerCount,
    rows_read: preparedRowsRead + calendarRows.length,
    rows_written: 0,
    writes_performed: 0,
    output_json: {
      source_probe_only: true,
      primary_endpoint: "/api/v1/game/{gamePk}/boxscore",
      fallback_endpoint: "/api/v1.1/game/{gamePk}/feed/live",
      production_lineup_writes_enabled: false,
      no_prepared_board_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      unlock_note: "Production daily_lineups_current writes remain blocked until source_probe passes repeatedly and user explicitly approves write phase."
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
