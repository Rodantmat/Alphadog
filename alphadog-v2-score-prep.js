const WORKER_NAME = "alphadog-v2-score-prep";
const VERSION = "alphadog-v2-score-prep-v0.2.1-sleeper-calendar-pair-resolver";
const JOB_KEY = "score-prep";
const SOURCE_PRIZEPICKS = "prizepicks";
const SOURCE_SLEEPER = "sleeper";
const INSERT_CHUNK_SIZE = 75;

function nowIso() {
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

async function readJsonSafe(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function safeStr(v) {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function safeJsonParse(v, fallback = null) {
  if (!v) return fallback;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

function normalizeName(v) {
  return safeStr(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeTeam(v) {
  return normalizeName(v);
}

function dateOnlyFromAnyTime(v) {
  const s = safeStr(v);
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function dateAddDays(yyyyMmDd, days) {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function toUtcComparable(v) {
  const s = safeStr(v);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isoOrNull(v) {
  const d = toUtcComparable(v);
  return d ? d.toISOString() : null;
}

function sourceKeyForRow(source, row) {
  if (source === SOURCE_PRIZEPICKS) return safeStr(row.projection_id || row.current_row_id || row.source_line_id || row.player_name);
  return safeStr(row.source_line_id || row.current_row_id || row.player_name);
}

function propKeyPrizePicks(statType) {
  const n = normalizeName(statType);
  const map = new Map([
    ["hits", "hits"],
    ["hitter hits", "hits"],
    ["singles", "singles"],
    ["doubles", "doubles"],
    ["total bases", "total_bases"],
    ["home runs", "home_runs"],
    ["runs", "runs"],
    ["rbis", "rbis"],
    ["rbi", "rbis"],
    ["hitter fantasy score", "fantasy"],
    ["pitcher fantasy score", "fantasy"],
    ["strikeouts", "pitcher_strikeouts"],
    ["pitcher strikeouts", "pitcher_strikeouts"],
    ["pitcher outs", "pitcher_outs"],
    ["earned runs", "earned_runs"],
    ["hits allowed", "hits_allowed"],
    ["walks", "walks"],
    ["walks allowed", "walks_allowed"],
    ["stolen bases", "stolen_bases"]
  ]);
  return map.get(n) || n.replace(/ /g, "_") || null;
}

function bindingSummary(env) {
  const names = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "TEAM_DB", "MARKET_DB", "SCORE_DB"];
  const out = {};
  for (const n of names) out[n] = Boolean(env && env[n]);
  return out;
}

async function allRows(db, sql, binds = []) {
  const stmt = db.prepare(sql);
  const res = await stmt.bind(...binds).all();
  return res && res.results ? res.results : [];
}

async function firstRow(db, sql, binds = []) {
  const rows = await allRows(db, sql, binds);
  return rows[0] || null;
}

async function ensureScoreTables(env) {
  await env.SCORE_DB.exec(`
CREATE TABLE IF NOT EXISTS score_board_prep_batches (
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
);
CREATE TABLE IF NOT EXISTS score_board_prepared_current (
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
);
CREATE INDEX IF NOT EXISTS idx_score_board_prepared_current_source ON score_board_prepared_current(source_key, pickable_safe);
CREATE INDEX IF NOT EXISTS idx_score_board_prepared_current_game ON score_board_prepared_current(official_date, official_game_pk);
CREATE INDEX IF NOT EXISTS idx_score_board_prepared_current_player_prop ON score_board_prepared_current(resolved_mlb_player_id, canonical_prop_key);
`);
}

async function loadReference(env) {
  const [teams, players, rosters, aliases] = await Promise.all([
    allRows(env.REF_DB, "SELECT team_id, mlb_team_id, abbreviation, full_name, nickname, location_name, short_name, team_code, file_code, active FROM ref_teams WHERE active=1"),
    allRows(env.REF_DB, "SELECT player_id, mlb_player_id, full_name, player_name, current_team_id, current_mlb_team_id, primary_position, active FROM ref_players WHERE active=1"),
    allRows(env.REF_DB, "SELECT player_id, mlb_team_id, team_id, player_name, position_abbreviation, roster_status, role, active, updated_at FROM ref_rosters WHERE active=1"),
    allRows(env.REF_DB, "SELECT alias_name, alias_normalized, player_id, confidence, alias_type, team_id, mlb_team_id, active FROM ref_player_aliases WHERE active=1")
  ]);

  const teamByMlbId = new Map();
  const teamByAbbr = new Map();
  const teamByFull = new Map();
  for (const t of teams) {
    const rec = {
      team_id: safeStr(t.team_id),
      mlb_team_id: Number(t.mlb_team_id),
      abbreviation: safeStr(t.abbreviation),
      full_name: safeStr(t.full_name),
      nickname: safeStr(t.nickname),
      location_name: safeStr(t.location_name),
      short_name: safeStr(t.short_name),
      team_code: safeStr(t.team_code),
      file_code: safeStr(t.file_code)
    };
    if (rec.mlb_team_id) teamByMlbId.set(rec.mlb_team_id, rec);
    if (rec.abbreviation) teamByAbbr.set(rec.abbreviation.toUpperCase(), rec);
    for (const key of [rec.full_name, rec.nickname, rec.short_name, rec.location_name, rec.team_code, rec.file_code, rec.abbreviation]) {
      const n = normalizeTeam(key);
      if (n) teamByFull.set(n, rec);
    }
  }

  const rosterByPlayerId = new Map();
  for (const r of rosters) {
    const pid = Number(r.player_id);
    if (!pid) continue;
    const existing = rosterByPlayerId.get(pid);
    if (!existing || safeStr(r.updated_at) > safeStr(existing.updated_at)) rosterByPlayerId.set(pid, r);
  }

  const playerById = new Map();
  const aliasMap = new Map();
  function addAlias(alias, playerId) {
    const key = normalizeName(alias);
    const pid = Number(playerId);
    if (!key || !pid) return;
    if (!aliasMap.has(key)) aliasMap.set(key, new Set());
    aliasMap.get(key).add(pid);
  }

  for (const p of players) {
    const pid = Number(p.player_id || p.mlb_player_id);
    if (!pid) continue;
    const roster = rosterByPlayerId.get(pid);
    const teamId = roster && roster.mlb_team_id ? Number(roster.mlb_team_id) : Number(p.current_mlb_team_id || 0);
    const team = teamByMlbId.get(teamId) || null;
    const rec = {
      player_id: pid,
      mlb_player_id: Number(p.mlb_player_id || pid),
      full_name: safeStr(p.full_name || p.player_name),
      current_mlb_team_id: teamId || null,
      team_abbreviation: team ? team.abbreviation : null,
      team_full_name: team ? team.full_name : null,
      primary_position: safeStr(p.primary_position || (roster && roster.position_abbreviation))
    };
    playerById.set(pid, rec);
    addAlias(rec.full_name, pid);
    addAlias(p.player_name, pid);
  }

  for (const a of aliases) {
    addAlias(a.alias_name, a.player_id);
    addAlias(a.alias_normalized, a.player_id);
  }

  return { teams, players, aliases, teamByMlbId, teamByAbbr, teamByFull, playerById, aliasMap };
}

async function loadCalendar(env, dateSet) {
  const dates = Array.from(dateSet).filter(Boolean).sort();
  if (!dates.length) dates.push(new Date().toISOString().slice(0, 10));
  const minDate = dateAddDays(dates[0], -1);
  const maxDate = dateAddDays(dates[dates.length - 1], 1);
  const rows = await allRows(env.TEAM_DB, `
SELECT game_pk, official_date, game_time_utc, home_team_name, away_team_name,
       status_code, abstract_game_state, detailed_state, is_pregame, is_live, is_final, source_snapshot_at, updated_at
FROM mlb_game_calendar
WHERE official_date >= ? AND official_date <= ?
ORDER BY official_date, game_time_utc, game_pk`, [minDate, maxDate]);

  const pairMap = new Map();
  function add(key, rec) {
    if (!pairMap.has(key)) pairMap.set(key, []);
    pairMap.get(key).push(rec);
  }

  for (const r of rows) {
    const rec = {
      game_pk: Number(r.game_pk),
      official_date: safeStr(r.official_date),
      game_time_utc: safeStr(r.game_time_utc),
      home_team_name: safeStr(r.home_team_name),
      away_team_name: safeStr(r.away_team_name),
      home_norm: normalizeTeam(r.home_team_name),
      away_norm: normalizeTeam(r.away_team_name),
      status_code: safeStr(r.status_code),
      abstract_game_state: safeStr(r.abstract_game_state),
      detailed_state: safeStr(r.detailed_state),
      is_final: Number(r.is_final || 0),
      is_live: Number(r.is_live || 0),
      is_pregame: Number(r.is_pregame || 0)
    };
    add(`${rec.official_date}|${rec.home_norm}|${rec.away_norm}`, { ...rec, orientation: "exact" });
    add(`${rec.official_date}|${rec.away_norm}|${rec.home_norm}`, { ...rec, orientation: "reversed" });
  }

  return { rows, pairMap };
}

function resolveCalendarByTeamNames(calendar, officialDate, rawHome, rawAway, sourceStartTime) {
  const date = safeStr(officialDate);
  const home = normalizeTeam(rawHome);
  const away = normalizeTeam(rawAway);
  if (!date || !home || !away) {
    return { status: "calendar_unresolved", confidence: "missing_team_pair_or_date", game: null };
  }
  const candidates = calendar.pairMap.get(`${date}|${home}|${away}`) || [];
  if (candidates.length === 0) return { status: "calendar_unresolved", confidence: "no_calendar_match", game: null };
  if (candidates.length === 1) return { status: "calendar_matched", confidence: "official_calendar_team_pair", game: candidates[0] };

  const sourceTime = toUtcComparable(sourceStartTime);
  if (sourceTime) {
    let best = null;
    let bestDiff = Infinity;
    for (const c of candidates) {
      const t = toUtcComparable(c.game_time_utc);
      if (!t) continue;
      const diff = Math.abs(t.getTime() - sourceTime.getTime());
      if (diff < bestDiff) {
        bestDiff = diff;
        best = c;
      }
    }
    if (best && bestDiff <= 4 * 60 * 60 * 1000) {
      return { status: "calendar_matched", confidence: "official_calendar_team_pair_source_time_tiebreak", game: best };
    }
  }
  return { status: "calendar_ambiguous", confidence: "multiple_calendar_games_same_team_pair", game: null, candidates };
}

function resolveCalendarByAbbrPair(calendar, ref, officialDate, teamAbbr, oppAbbr, sourceStartTime) {
  const team = ref.teamByAbbr.get(safeStr(teamAbbr).toUpperCase());
  const opp = ref.teamByAbbr.get(safeStr(oppAbbr).toUpperCase());
  if (!team || !opp) return { status: "calendar_unresolved", confidence: "missing_team_abbreviation_pair", game: null };
  return resolveCalendarByTeamNames(calendar, officialDate, team.full_name, opp.full_name, sourceStartTime);
}

function resolvePlayer(ref, playerName, game) {
  const key = normalizeName(playerName);
  const ids = Array.from(ref.aliasMap.get(key) || []);
  if (ids.length === 0) {
    return { status: "unresolved", confidence: "no_alias_match", player: null, candidate_count: 0 };
  }

  let candidates = ids.map(id => ref.playerById.get(id)).filter(Boolean);
  if (game && candidates.length > 1) {
    const homeTeam = ref.teamByFull.get(normalizeTeam(game.home_team_name));
    const awayTeam = ref.teamByFull.get(normalizeTeam(game.away_team_name));
    const allowed = new Set([homeTeam && homeTeam.mlb_team_id, awayTeam && awayTeam.mlb_team_id].filter(Boolean));
    const filtered = candidates.filter(p => allowed.has(Number(p.current_mlb_team_id)));
    if (filtered.length === 1) candidates = filtered;
    else if (filtered.length > 1) candidates = filtered;
  }

  if (candidates.length === 1) return { status: "matched", confidence: "exact_name", player: candidates[0], candidate_count: ids.length };
  return { status: "ambiguous", confidence: "ambiguous_exact_name", player: null, candidate_count: ids.length };
}

function teamSideForPlayer(ref, player, game) {
  if (!player || !game) return { team: null, opponent: null, team_full_name: null, opponent_full_name: null, conflict: false };
  const playerTeamId = Number(player.current_mlb_team_id || 0);
  const homeTeam = ref.teamByFull.get(normalizeTeam(game.home_team_name));
  const awayTeam = ref.teamByFull.get(normalizeTeam(game.away_team_name));
  const homeId = homeTeam ? Number(homeTeam.mlb_team_id) : null;
  const awayId = awayTeam ? Number(awayTeam.mlb_team_id) : null;

  if (playerTeamId && homeId && playerTeamId === homeId) {
    return { team: homeTeam.abbreviation, opponent: awayTeam ? awayTeam.abbreviation : null, team_full_name: game.home_team_name, opponent_full_name: game.away_team_name, conflict: false };
  }
  if (playerTeamId && awayId && playerTeamId === awayId) {
    return { team: awayTeam.abbreviation, opponent: homeTeam ? homeTeam.abbreviation : null, team_full_name: game.away_team_name, opponent_full_name: game.home_team_name, conflict: false };
  }
  return { team: null, opponent: null, team_full_name: null, opponent_full_name: null, conflict: Boolean(playerTeamId && game) };
}

function startedByOfficialTime(game, now = new Date()) {
  if (!game || !game.game_time_utc) return false;
  const start = toUtcComparable(game.game_time_utc);
  if (!start) return false;
  return start.getTime() <= now.getTime();
}

function buildBlockReasons({ sourcePickable, sourceKey, calendarResolution, playerResolution, side, game, now }) {
  const reasons = [];
  if (sourceKey === SOURCE_PRIZEPICKS && Number(sourcePickable || 0) !== 1) reasons.push("source_unpickable_flag");
  if (calendarResolution.status === "calendar_unresolved") reasons.push("calendar_match_unresolved");
  if (calendarResolution.status === "calendar_ambiguous") reasons.push("calendar_match_ambiguous");
  if (playerResolution.status === "unresolved") reasons.push("player_unresolved");
  if (playerResolution.status === "ambiguous") reasons.push("player_ambiguous");
  if (side.conflict) reasons.push("player_team_conflict");
  if (game && startedByOfficialTime(game, now)) reasons.push("started_or_expired_by_official_time");
  return Array.from(new Set(reasons));
}

function preparedRowBase({ batchId, sourceKey, sourceRowId, sourceEventId, projectionId, playerName, propKey, sourcePropName, lineValue, sourceStartTime, sourcePickable, rawJson, payloadJson, calendarResolution, playerResolution, side, now }) {
  const game = calendarResolution.game || null;
  const blockReasons = buildBlockReasons({ sourcePickable, sourceKey, calendarResolution, playerResolution, side, game, now });
  const pickableSafe = blockReasons.length === 0 ? 1 : 0;
  const sourceTimeStatus = game
    ? (sourceKey === SOURCE_SLEEPER ? "source_time_replaced_by_calendar" : "source_time_verified_by_calendar")
    : (sourceStartTime ? "source_time_unverified" : "source_time_missing");
  const startTimeConfidence = game ? "official_calendar" : (sourceStartTime ? "source_time_only_unverified" : "missing_time");
  const matchupStatus = calendarResolution.status;

  return {
    prepared_row_id: `${sourceKey}|${sourceRowId}`,
    prep_batch_id: batchId,
    source_key: sourceKey,
    source_row_id: sourceRowId,
    source_event_id: sourceEventId,
    projection_id: projectionId,
    player_name: playerName,
    player_name_normalized: normalizeName(playerName),
    resolved_player_id: playerResolution.player ? playerResolution.player.player_id : null,
    resolved_mlb_player_id: playerResolution.player ? playerResolution.player.mlb_player_id : null,
    player_match_status: playerResolution.status,
    player_match_confidence: playerResolution.confidence,
    team: side.team,
    opponent: side.opponent,
    team_full_name: side.team_full_name,
    opponent_full_name: side.opponent_full_name,
    canonical_prop_key: propKey,
    source_prop_name: sourcePropName,
    line_value: lineValue === null || lineValue === undefined || lineValue === "" ? null : Number(lineValue),
    official_game_pk: game ? game.game_pk : null,
    official_game_time_utc: game ? game.game_time_utc : null,
    official_date: game ? game.official_date : null,
    source_start_time: sourceStartTime || null,
    source_time_status: sourceTimeStatus,
    start_time_confidence: startTimeConfidence,
    matchup_status: matchupStatus,
    matchup_confidence: calendarResolution.confidence,
    source_pickable: sourcePickable === null || sourcePickable === undefined ? null : Number(sourcePickable),
    pickable_safe: pickableSafe,
    prep_status: pickableSafe ? "prepared_pickable_safe" : "prepared_blocked_with_flags",
    block_reason: blockReasons.length ? blockReasons.join("|") : null,
    raw_source_json: typeof rawJson === "string" ? rawJson : JSON.stringify(rawJson || {}),
    row_payload_json: typeof payloadJson === "string" ? payloadJson : JSON.stringify(payloadJson || {})
  };
}

async function loadMarketRows(env) {
  const prizepicksRows = await allRows(env.MARKET_DB, "SELECT * FROM prizepicks_board_current");
  const sleeperRows = await allRows(env.MARKET_DB, "SELECT * FROM sleeper_board_current");
  return { prizepicksRows, sleeperRows };
}

function collectCalendarDates(prizepicksRows, sleeperRows) {
  const dates = new Set();
  for (const r of prizepicksRows) {
    const d = dateOnlyFromAnyTime(r.start_time);
    if (d) dates.add(d);
  }
  for (const r of sleeperRows) {
    const raw = safeJsonParse(r.raw_line_json, {});
    const d = safeStr(raw.game_date) || dateOnlyFromAnyTime(raw.commence_time || r.start_time);
    if (d) dates.add(d);
  }
  const today = new Date().toISOString().slice(0, 10);
  dates.add(today);
  dates.add(dateAddDays(today, 1));
  return dates;
}

function preparePrizePicksRows(rows, ref, calendar, batchId, now) {
  const out = [];
  for (const r of rows) {
    const sourceRowId = sourceKeyForRow(SOURCE_PRIZEPICKS, r);
    const playerName = safeStr(r.player_name);
    const officialDate = dateOnlyFromAnyTime(r.start_time);
    const teamAbbr = safeStr(r.team);
    const opponentAbbr = safeStr(r.opponent || r.description);
    const cal = resolveCalendarByAbbrPair(calendar, ref, officialDate, teamAbbr, opponentAbbr, r.start_time);
    const playerId = Number(r.player_id || 0);
    let playerRes;
    if (playerId) {
      const p = ref.playerById.get(playerId) || null;
      playerRes = p ? { status: "source_player_id_present", confidence: "source_player_id", player: p, candidate_count: 1 } : resolvePlayer(ref, playerName, cal.game);
    } else {
      playerRes = resolvePlayer(ref, playerName, cal.game);
    }
    const side = teamSideForPlayer(ref, playerRes.player, cal.game);
    const fallbackTeam = ref.teamByAbbr.get(teamAbbr.toUpperCase()) || null;
    const fallbackOpp = ref.teamByAbbr.get(opponentAbbr.toUpperCase()) || null;
    if (!side.team && fallbackTeam) {
      side.team = fallbackTeam.abbreviation;
      side.team_full_name = fallbackTeam.full_name;
    }
    if (!side.opponent && fallbackOpp) {
      side.opponent = fallbackOpp.abbreviation;
      side.opponent_full_name = fallbackOpp.full_name;
    }
    out.push(preparedRowBase({
      batchId,
      sourceKey: SOURCE_PRIZEPICKS,
      sourceRowId,
      sourceEventId: safeStr(r.game_id),
      projectionId: safeStr(r.projection_id),
      playerName,
      propKey: propKeyPrizePicks(r.stat_type),
      sourcePropName: safeStr(r.stat_type),
      lineValue: r.line_score,
      sourceStartTime: safeStr(r.start_time),
      sourcePickable: Number(r.pickable_flag || 0),
      rawJson: r.raw_projection_json,
      payloadJson: r.row_payload_json,
      calendarResolution: cal,
      playerResolution: playerRes,
      side,
      now
    }));
  }
  return out;
}

function prepareSleeperRows(rows, ref, calendar, batchId, now) {
  const out = [];
  for (const r of rows) {
    const raw = safeJsonParse(r.raw_line_json, {});
    const payload = safeJsonParse(r.row_payload_json, {});
    const rawHome = safeStr(raw.home_team || payload.home_team);
    const rawAway = safeStr(raw.away_team || payload.away_team);
    const rawDate = safeStr(raw.game_date) || dateOnlyFromAnyTime(raw.commence_time || r.start_time);
    const rawCommence = safeStr(raw.commence_time || r.start_time);

    // Critical v0.2.1 fix: Sleeper's commence_time can be a provider placeholder.
    // Calendar grounding must use official_date + raw team pair in either orientation,
    // then replace source time with the internal MLB calendar time.
    const cal = resolveCalendarByTeamNames(calendar, rawDate, rawHome, rawAway, null);
    const playerName = safeStr(r.player_name || raw.player);
    const playerRes = resolvePlayer(ref, playerName, cal.game);
    const side = teamSideForPlayer(ref, playerRes.player, cal.game);

    const mergedPayload = {
      ...(payload || {}),
      source_key: "parlay_sleeper",
      source_market: safeStr(raw.market || r.source_stat_name),
      market_key: safeStr(raw.market_key || r.source_stat_name),
      over_price: raw.over_price ?? null,
      under_price: raw.under_price ?? null,
      implied_probability: raw.implied_probability ?? null,
      is_dfs_flat_payout: raw.is_dfs_flat_payout ?? null,
      dfs_normalized: raw.dfs_normalized ?? null,
      last_update: raw.last_update || null,
      home_team: rawHome || null,
      away_team: rawAway || null,
      bookmaker: raw.bookmaker || "sleeper",
      bookmaker_title: raw.bookmaker_title || "Sleeper",
      source_commence_time_replaced_by_calendar: Boolean(cal.game),
      raw_home_team: rawHome || null,
      raw_away_team: rawAway || null,
      raw_commence_time: rawCommence || null,
      raw_last_update: raw.last_update || null,
      source_pickable_inventory_only: true,
      source_prices: {
        side: r.side || null,
        price: r.price ?? null,
        decimal_price: r.decimal_price ?? null,
        over_price: raw.over_price ?? null,
        under_price: raw.under_price ?? null,
        implied_probability: raw.implied_probability ?? null
      }
    };

    out.push(preparedRowBase({
      batchId,
      sourceKey: SOURCE_SLEEPER,
      sourceRowId: sourceKeyForRow(SOURCE_SLEEPER, r),
      sourceEventId: safeStr(r.source_event_id || raw.event_id),
      projectionId: null,
      playerName,
      propKey: safeStr(r.canonical_prop_key || raw.market),
      sourcePropName: safeStr(r.source_stat_name || raw.market_key || raw.market),
      lineValue: r.line_value ?? raw.line,
      sourceStartTime: rawCommence || safeStr(r.start_time),
      sourcePickable: 1,
      rawJson: r.raw_line_json || raw,
      payloadJson: mergedPayload,
      calendarResolution: cal,
      playerResolution: playerRes,
      side,
      now
    }));
  }
  return out;
}

function summarizeBySource(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.source_key)) {
      map.set(r.source_key, {
        source_key: r.source_key,
        rows: 0,
        pickable_safe_rows: 0,
        blocked_rows: 0,
        started_rows: 0,
        player_unresolved_rows: 0,
        player_ambiguous_rows: 0,
        matchup_unresolved_rows: 0,
        matchup_ambiguous_rows: 0,
        player_team_conflict_rows: 0
      });
    }
    const s = map.get(r.source_key);
    s.rows += 1;
    if (r.pickable_safe === 1) s.pickable_safe_rows += 1;
    else s.blocked_rows += 1;
    if (safeStr(r.block_reason).includes("started_or_expired_by_official_time")) s.started_rows += 1;
    if (r.player_match_status === "unresolved") s.player_unresolved_rows += 1;
    if (r.player_match_status === "ambiguous") s.player_ambiguous_rows += 1;
    if (r.matchup_status === "calendar_unresolved") s.matchup_unresolved_rows += 1;
    if (r.matchup_status === "calendar_ambiguous") s.matchup_ambiguous_rows += 1;
    if (safeStr(r.block_reason).includes("player_team_conflict")) s.player_team_conflict_rows += 1;
  }
  return Array.from(map.values()).sort((a, b) => a.source_key.localeCompare(b.source_key));
}

function summarizeSleeperEvents(rows) {
  const m = new Map();
  for (const r of rows.filter(x => x.source_key === SOURCE_SLEEPER)) {
    const raw = safeJsonParse(r.raw_source_json, {});
    const key = `${r.source_event_id}|${safeStr(raw.home_team)}|${safeStr(raw.away_team)}`;
    if (!m.has(key)) {
      m.set(key, {
        source_event_id: r.source_event_id,
        raw_home_team: safeStr(raw.home_team),
        raw_away_team: safeStr(raw.away_team),
        rows: 0,
        official_game_pk: r.official_game_pk || null,
        official_game_time_utc: r.official_game_time_utc || null,
        matchup_statuses: new Set(),
        pickable_safe_rows: 0,
        blocked_rows: 0
      });
    }
    const s = m.get(key);
    s.rows += 1;
    if (!s.official_game_pk && r.official_game_pk) s.official_game_pk = r.official_game_pk;
    if (!s.official_game_time_utc && r.official_game_time_utc) s.official_game_time_utc = r.official_game_time_utc;
    s.matchup_statuses.add(r.matchup_status);
    if (r.pickable_safe === 1) s.pickable_safe_rows += 1;
    else s.blocked_rows += 1;
  }
  return Array.from(m.values()).map(s => ({ ...s, matchup_statuses: Array.from(s.matchup_statuses).join(",") })).sort((a, b) => b.rows - a.rows);
}

async function writePreparedRows(env, batchId, rows, bySource, startedAt, input) {
  await ensureScoreTables(env);
  await env.SCORE_DB.prepare("DELETE FROM score_board_prepared_current").run();

  const insertSql = `INSERT OR REPLACE INTO score_board_prepared_current (
    prepared_row_id, prep_batch_id, source_key, source_row_id, source_event_id, projection_id,
    player_name, player_name_normalized, resolved_player_id, resolved_mlb_player_id,
    player_match_status, player_match_confidence, team, opponent, team_full_name, opponent_full_name,
    canonical_prop_key, source_prop_name, line_value, official_game_pk, official_game_time_utc, official_date,
    source_start_time, source_time_status, start_time_confidence, matchup_status, matchup_confidence,
    source_pickable, pickable_safe, prep_status, block_reason, raw_source_json, row_payload_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE);
    const statements = chunk.map(r => env.SCORE_DB.prepare(insertSql).bind(
      r.prepared_row_id,
      r.prep_batch_id,
      r.source_key,
      r.source_row_id,
      r.source_event_id,
      r.projection_id,
      r.player_name,
      r.player_name_normalized,
      r.resolved_player_id,
      r.resolved_mlb_player_id,
      r.player_match_status,
      r.player_match_confidence,
      r.team,
      r.opponent,
      r.team_full_name,
      r.opponent_full_name,
      r.canonical_prop_key,
      r.source_prop_name,
      r.line_value,
      r.official_game_pk,
      r.official_game_time_utc,
      r.official_date,
      r.source_start_time,
      r.source_time_status,
      r.start_time_confidence,
      r.matchup_status,
      r.matchup_confidence,
      r.source_pickable,
      r.pickable_safe,
      r.prep_status,
      r.block_reason,
      r.raw_source_json,
      r.row_payload_json
    ));
    await env.SCORE_DB.batch(statements);
  }

  const totals = computeTotals(rows);
  await env.SCORE_DB.prepare(`INSERT OR REPLACE INTO score_board_prep_batches (
    batch_id, worker_name, worker_version, mode, status, certification_status, certification_grade,
    prizepicks_rows, sleeper_rows, prepared_rows, pickable_safe_rows, blocked_rows,
    unresolved_player_rows, matchup_unresolved_rows, started_rows, source_json, certification_json,
    started_at, finished_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      batchId,
      WORKER_NAME,
      VERSION,
      "board_prep_enrichment",
      "COMPLETED_BOARD_PREP_ENRICHMENT",
      "SCORE_BOARD_PREP_ENRICHMENT_COMPLETED_PRESERVED_RAW_BOARDS",
      totals.blocked_rows > 0 ? "PREP_PASS_WITH_BLOCK_FLAGS" : "PREP_PASS",
      totals.prizepicks_rows,
      totals.sleeper_rows,
      totals.prepared_rows,
      totals.pickable_safe_rows,
      totals.blocked_rows,
      totals.unresolved_player_rows,
      totals.matchup_unresolved_rows,
      totals.started_rows,
      JSON.stringify({ request_id: input.request_id || null, chain_id: input.chain_id || null, by_source: bySource }),
      JSON.stringify({ ...totals, sleeper_events: summarizeSleeperEvents(rows) }),
      startedAt,
      nowIso(),
      nowIso()
    )
    .run();
}

function computeTotals(rows) {
  let prizepicks_rows = 0, sleeper_rows = 0, pickable_safe_rows = 0, blocked_rows = 0, unresolved_player_rows = 0, matchup_unresolved_rows = 0, started_rows = 0, source_unpickable_rows = 0, player_team_conflict_rows = 0;
  for (const r of rows) {
    if (r.source_key === SOURCE_PRIZEPICKS) prizepicks_rows += 1;
    if (r.source_key === SOURCE_SLEEPER) sleeper_rows += 1;
    if (r.pickable_safe === 1) pickable_safe_rows += 1;
    else blocked_rows += 1;
    if (r.player_match_status === "unresolved") unresolved_player_rows += 1;
    if (r.matchup_status === "calendar_unresolved") matchup_unresolved_rows += 1;
    if (safeStr(r.block_reason).includes("started_or_expired_by_official_time")) started_rows += 1;
    if (safeStr(r.block_reason).includes("source_unpickable_flag")) source_unpickable_rows += 1;
    if (safeStr(r.block_reason).includes("player_team_conflict")) player_team_conflict_rows += 1;
  }
  return {
    rows_read: rows.length,
    rows_written: rows.length + 1,
    prepared_rows: rows.length,
    prizepicks_rows,
    sleeper_rows,
    pickable_safe_rows,
    blocked_rows,
    started_rows,
    source_unpickable_rows,
    unresolved_player_rows,
    matchup_unresolved_rows,
    player_team_conflict_rows
  };
}

async function runBoardPrep(env, input) {
  const startedAt = nowIso();
  const requestId = input.request_id || `score_prep_${Date.now()}`;
  const batchId = `score_board_prep_batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const bindings = bindingSummary(env);
  for (const required of ["REF_DB", "TEAM_DB", "MARKET_DB", "SCORE_DB"]) {
    if (!bindings[required]) throw new Error(`missing_required_binding_${required}`);
  }

  const [{ prizepicksRows, sleeperRows }, ref] = await Promise.all([
    loadMarketRows(env),
    loadReference(env)
  ]);
  const dates = collectCalendarDates(prizepicksRows, sleeperRows);
  const calendar = await loadCalendar(env, dates);
  const now = new Date();

  const prepared = [
    ...preparePrizePicksRows(prizepicksRows, ref, calendar, batchId, now),
    ...prepareSleeperRows(sleeperRows, ref, calendar, batchId, now)
  ];
  const bySource = summarizeBySource(prepared);
  const totals = computeTotals(prepared);

  await writePreparedRows(env, batchId, prepared, bySource, startedAt, input);

  const blockedSamples = prepared.filter(r => r.pickable_safe === 0).slice(0, 20).map(r => ({
    source_key: r.source_key,
    player_name: r.player_name,
    team: r.team,
    opponent: r.opponent,
    canonical_prop_key: r.canonical_prop_key,
    line_value: r.line_value,
    official_game_pk: r.official_game_pk,
    official_game_time_utc: r.official_game_time_utc,
    matchup_status: r.matchup_status,
    player_match_status: r.player_match_status,
    pickable_safe: r.pickable_safe,
    block_reason: r.block_reason
  }));

  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    request_id: requestId,
    chain_id: input.chain_id || null,
    batch_id: batchId,
    mode: "board_prep_enrichment",
    status: "COMPLETED_BOARD_PREP_ENRICHMENT",
    certification: "SCORE_BOARD_PREP_ENRICHMENT_COMPLETED_PRESERVED_RAW_BOARDS",
    certification_grade: totals.blocked_rows > 0 ? "PREP_PASS_WITH_BLOCK_FLAGS" : "PREP_PASS",
    ...totals,
    by_source: bySource,
    sleeper_event_resolution: summarizeSleeperEvents(prepared),
    blocked_samples: blockedSamples,
    calendar_rows_loaded: calendar.rows.length,
    ref_alias_rows_loaded: ref.aliases.length,
    ref_player_rows_loaded: ref.players.length,
    output_tables: ["SCORE_DB.score_board_prep_batches", "SCORE_DB.score_board_prepared_current"],
    no_market_board_mutation: true,
    no_raw_board_delete: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    timestamp_utc: nowIso(),
    elapsed_ms: Date.now() - new Date(startedAt).getTime()
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "GET" && (path === "/" || path === "/health")) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version: VERSION,
        worker_name: WORKER_NAME,
        job_key: JOB_KEY,
        status: "READY",
        binding_summary: bindingSummary(env),
        purpose: "Board Prep enrichment only. Reads PrizePicks/Sleeper current boards plus REF/TEAM calendar and writes SCORE_DB prepared rows. Does not mutate market boards, score, rank, or write final board.",
        timestamp_utc: nowIso()
      });
    }

    if (method === "POST" && (path === "/run" || path === "/")) {
      const input = await readJsonSafe(request);
      try {
        const output = await runBoardPrep(env, input);
        return jsonResponse(output);
      } catch (err) {
        return jsonResponse({
          ok: false,
          data_ok: false,
          version: VERSION,
          worker_name: WORKER_NAME,
          job_key: JOB_KEY,
          status: "FAILED_BOARD_PREP_ENRICHMENT",
          error: err && err.message ? err.message : String(err),
          timestamp_utc: nowIso()
        }, 500);
      }
    }

    return jsonResponse({
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      status: "NOT_FOUND",
      allowed_routes: ["GET /", "GET /health", "POST /run"],
      timestamp_utc: nowIso()
    }, 404);
  }
};
