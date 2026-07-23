import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-daily-probable-pitchers";
const VERSION = "alphadog-v2-daily-probable-pitchers-v0.2.1-postgres-rewire-redeploy";
const JOB_KEY = "daily-probable-pitchers";
const SOURCE_KEY = "official_mlb_statsapi_schedule_probable_pitcher";
const MAX_PREPARED_ROWS = 5000;
const MAX_PEOPLE_FALLBACK_CALLS = 250;
const MAX_LIVE_FEED_CALLS = 10;

function pgClient(env) {
  return postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false, prepare: false });
}
function toPgPlaceholders(sqlText) {
  let i = 0;
  return String(sqlText).replace(/\?/g, () => "$" + (++i));
}
async function all(pg, sqlText, binds = []) {
  return await pg.unsafe(toPgPlaceholders(sqlText), binds);
}

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
function safeString(value, max = 6000) {
  if (value === undefined || value === null) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}
function dateOnly(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function addDays(dateText, days) {
  const d = new Date(`${dateText}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function todayPt() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const m = {};
  for (const p of parts) m[p.type] = p.value;
  return `${m.year}-${m.month}-${m.day}`;
}
function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}
function boolInt(v) { return v ? 1 : 0; }
function statusIsLiveOrFinal(game) {
  const abs = String(game?.status?.abstractGameState || "").toLowerCase();
  const detail = String(game?.status?.detailedState || "").toLowerCase();
  return abs === "live" || abs === "final" || detail.includes("final") || detail.includes("game over");
}
function statusIsPregame(game) {
  const abs = String(game?.status?.abstractGameState || "").toLowerCase();
  return abs === "preview" || abs === "pregame";
}
function extractPitchHand(obj) {
  const candidates = [obj?.pitchHand, obj?.person?.pitchHand, obj?.player?.pitchHand];
  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    const code = c.code || c.abbreviation || c.description;
    if (code) return String(code).slice(0, 12);
  }
  return null;
}
function noteFlags(note) {
  const text = String(note || "").toLowerCase();
  return {
    opener: /\bopener\b/.test(text),
    bulk: /\bbulk\b|\bfollower\b|pitch count|limited/.test(text),
    scratch: /\bscratch(?:ed)?\b|will not start|won't start|not start|disabled list|\bil\b/.test(text)
  };
}
function sourceBase(env) {
  const configured = String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com/api/v1").replace(/\/$/, "");
  return configured.endsWith("/api/v1") ? configured : "https://statsapi.mlb.com/api/v1";
}
function scheduleUrl(env, startDate, endDate) {
  return `${sourceBase(env)}/schedule?sportId=1&gameType=R&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&hydrate=probablePitcher(note,person)`;
}
function liveFeedUrl(gamePk) {
  return `https://statsapi.mlb.com/api/v1.1/game/${encodeURIComponent(String(gamePk))}/feed/live`;
}
function requestHeaders(env) {
  const ua = String(env.MLB_API_USER_AGENT || "AlphaDog-v2-Daily-Starters/0.2");
  return { "accept": "application/json", "user-agent": ua };
}
function liveFeedActualsEnabled(input, env) {
  const inputEnabled = input && (input.enable_live_feed_actuals === true || input.force_live_feed_actuals === true);
  const envValue = String(env.DAILY_STARTERS_ENABLE_LIVE_FEED_ACTUALS || env.ENABLE_DAILY_STARTERS_LIVE_FEED_ACTUALS || "").toLowerCase();
  return inputEnabled || envValue === "1" || envValue === "true" || envValue === "yes";
}

async function ensureSchema(pg) {
  await pg.unsafe(`
CREATE TABLE IF NOT EXISTS daily.starters_batches (
  batch_id TEXT PRIMARY KEY, request_id TEXT, run_id TEXT, job_key TEXT, worker_name TEXT, worker_version TEXT, mode TEXT, status TEXT,
  window_start TEXT, window_end TEXT, prepared_games_checked INTEGER DEFAULT 0, prepared_rows_read INTEGER DEFAULT 0,
  calendar_games_checked INTEGER DEFAULT 0, schedule_games_seen INTEGER DEFAULT 0, live_feed_games_checked INTEGER DEFAULT 0,
  teams_checked INTEGER DEFAULT 0, starters_found INTEGER DEFAULT 0, starters_tbd INTEGER DEFAULT 0, starters_changed INTEGER DEFAULT 0,
  actual_starters_found INTEGER DEFAULT 0, warning_rows INTEGER DEFAULT 0, blocking_rows INTEGER DEFAULT 0, rows_written INTEGER DEFAULT 0,
  external_calls INTEGER DEFAULT 0, certification_status TEXT, certification_grade TEXT, certification_reason TEXT, output_json JSONB,
  started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS daily.starters_stage (
  stage_id TEXT PRIMARY KEY, batch_id TEXT, current_key TEXT, source_key TEXT, source_endpoint TEXT, source_snapshot_at TIMESTAMPTZ,
  game_pk BIGINT, official_date TEXT, game_time_utc TIMESTAMPTZ, team_id BIGINT, team_name TEXT, opponent_team_id BIGINT, opponent_team_name TEXT,
  is_home INTEGER, starter_player_id BIGINT, starter_name TEXT, starter_hand TEXT, starter_status TEXT, starter_confidence TEXT,
  source_status TEXT, game_status TEXT, abstract_game_state TEXT, detailed_state TEXT, previous_starter_player_id BIGINT,
  previous_starter_name TEXT, change_detected INTEGER DEFAULT 0, scratch_flag INTEGER DEFAULT 0, opener_flag INTEGER DEFAULT 0,
  bulk_pitcher_flag INTEGER DEFAULT 0, tbd_flag INTEGER DEFAULT 0, unavailable_flag INTEGER DEFAULT 0, hand_missing_flag INTEGER DEFAULT 0,
  prepared_board_relevant INTEGER DEFAULT 0, prepared_board_pickable_rows INTEGER DEFAULT 0, raw_json JSONB, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS daily.starters_snapshots (
  snapshot_id TEXT PRIMARY KEY, batch_id TEXT, current_key TEXT, game_pk BIGINT, team_id BIGINT, starter_player_id BIGINT,
  starter_name TEXT, starter_hand TEXT, starter_status TEXT, starter_confidence TEXT, source_status TEXT, source_key TEXT,
  source_endpoint TEXT, source_snapshot_at TIMESTAMPTZ, raw_json JSONB, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS daily.starters_issues (
  issue_id TEXT PRIMARY KEY, batch_id TEXT, game_pk BIGINT, team_id BIGINT, issue_status TEXT, issue_type TEXT, severity TEXT,
  reason TEXT, details_json JSONB, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_starters_stage_batch ON daily.starters_stage(batch_id);
CREATE INDEX IF NOT EXISTS idx_starters_snapshots_game ON daily.starters_snapshots(game_pk);
CREATE INDEX IF NOT EXISTS idx_starters_issues_batch ON daily.starters_issues(batch_id);`);
}

async function fetchJson(url, env) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("fetch_timeout"), 8000);
  try {
    const resp = await fetch(url, { headers: requestHeaders(env), signal: controller.signal });
    const text = await resp.text();
    if (!resp.ok) return { ok: false, status: resp.status, error: `HTTP_${resp.status}`, text: text.slice(0, 900) };
    try { return { ok: true, status: resp.status, json: JSON.parse(text) }; }
    catch (err) { return { ok: false, status: resp.status, error: "non_json_response", text: text.slice(0, 900) }; }
  } catch (err) {
    return { ok: false, status: null, error: `fetch_exception_${String(err && err.message ? err.message : err).slice(0, 120)}` };
  } finally {
    clearTimeout(timer);
  }
}

async function loadPreparedRows(pg) {
  return await pg.unsafe(`SELECT
      official_game_pk, official_game_time_utc, official_date, source_key, player_name, team, opponent,
      canonical_prop_key, line_value, pickable_safe, matchup_status, player_match_status
    FROM score.board_prepared_current
    WHERE pickable_safe = 1 AND matchup_status = 'calendar_matched' AND player_match_status = 'matched'
      AND official_game_pk IS NOT NULL AND official_game_time_utc IS NOT NULL
    ORDER BY official_game_time_utc LIMIT ${MAX_PREPARED_ROWS}`);
}

async function loadTeamAliasMap(pg) {
  const map = new Map();
  const teams = await pg.unsafe("SELECT team_id, mlb_team_id, abbreviation, full_name, nickname, location_name, short_name, team_code, file_code FROM ref.teams WHERE active = 1");
  for (const t of teams) {
    for (const v of [t.team_id, t.mlb_team_id, t.abbreviation, t.full_name, t.nickname, t.location_name, t.short_name, t.team_code, t.file_code]) {
      const n = normalize(v);
      if (n && t.mlb_team_id !== null && t.mlb_team_id !== undefined) map.set(n, Number(t.mlb_team_id));
    }
  }
  const aliases = await pg.unsafe("SELECT team_id, mlb_team_id, alias_value, alias_normalized FROM ref.team_aliases WHERE active = 1");
  for (const a of aliases) {
    const id = a.mlb_team_id !== null && a.mlb_team_id !== undefined ? Number(a.mlb_team_id) : null;
    if (!id) continue;
    for (const v of [a.alias_value, a.alias_normalized]) {
      const n = normalize(v);
      if (n) map.set(n, id);
    }
  }
  return map;
}

function preparedMaps(preparedRows, teamAliasMap) {
  const gameSet = new Set();
  const dateSet = new Set();
  const gameCounts = new Map();
  const teamCounts = new Map();
  for (const r of preparedRows) {
    const gp = Number(r.official_game_pk);
    if (!gp) continue;
    gameSet.add(gp);
    const d = dateOnly(r.official_date || r.official_game_time_utc);
    if (d) dateSet.add(d);
    gameCounts.set(gp, (gameCounts.get(gp) || 0) + 1);
    const teamId = teamAliasMap.get(normalize(r.team));
    if (teamId) {
      const key = `${gp}:${teamId}`;
      teamCounts.set(key, (teamCounts.get(key) || 0) + 1);
    }
  }
  return { gameSet, dateSet, gameCounts, teamCounts };
}

// Real schema adjustment: team.starter_history's real Postgres schema (built by an earlier
// daily-delta session, already proven end-to-end) stores team_id/mlb_player_id/game_date/
// raw_json only - no starter_name/throws/started_game columns like the old D1 table had. Every
// row in this table already represents a confirmed actual starter for that game (that's the
// table's whole purpose), so no started_game filter is needed. Name/hand for a derived candidate
// now gets resolved the same way as every other starter ID, via the existing ref.players lookup
// (see collectStarterIdsForHandFill below, which now also includes derived candidates).
async function loadRecentTeamStarters(pg, teamIds, beforeDate) {
  const ids = [...new Set((teamIds || []).filter(Boolean).map(String))];
  const map = new Map();
  if (!ids.length) return map;
  const lookbackStart = addDays(beforeDate, -30);
  const rows = await pg`SELECT team_id, mlb_player_id AS player_id, game_date FROM team.starter_history
     WHERE team_id IN ${pg(ids)} AND game_date >= ${lookbackStart} AND game_date < ${beforeDate}
     ORDER BY game_date DESC`;
  for (const r of rows) {
    const key = String(r.team_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ ...r, game_date: dateOnly(r.game_date) });
  }
  return map;
}

function deriveLikelyStarter(recentStarts, targetDateText) {
  if (!recentStarts || !recentStarts.length) return null;
  const byPlayer = new Map();
  for (const r of recentStarts) {
    const pid = Number(r.player_id);
    if (!pid) continue;
    if (!byPlayer.has(pid)) byPlayer.set(pid, { player_id: pid, dates: [] });
    byPlayer.get(pid).dates.push(r.game_date);
  }
  const targetMs = new Date(`${targetDateText}T12:00:00Z`).getTime();
  const candidates = [];
  for (const p of byPlayer.values()) {
    const lastStart = p.dates[0];
    const lastMs = new Date(`${lastStart}T12:00:00Z`).getTime();
    const daysSince = Math.round((targetMs - lastMs) / 86400000);
    if (daysSince < 3) continue;
    const gapFrom5 = Math.abs(daysSince - 5);
    candidates.push({ player_id: p.player_id, name: null, throws: null, days_since_last_start: daysSince, rotation_fit_score: gapFrom5, starts_in_window: p.dates.length });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.rotation_fit_score - b.rotation_fit_score || b.starts_in_window - a.starts_in_window);
  return candidates[0];
}

async function loadCalendarRows(pg, gamePks) {
  const ids = [...gamePks].filter(Boolean).map(Number);
  if (!ids.length) return new Map();
  const rows = await pg.unsafe(
    `SELECT game_pk, official_date, game_time_utc, home_team_id, away_team_id, home_team_name, away_team_name, status_code, abstract_game_state, detailed_state, is_pregame, is_live, is_final, is_postponed, is_cancelled FROM calendar.game_calendar WHERE game_pk = ANY($1::bigint[])`,
    [ids]
  );
  return new Map(rows.map(r => [Number(r.game_pk), r]));
}

async function loadRefPlayerHands(pg, playerIds) {
  const ids = [...new Set(playerIds.filter(Boolean).map(Number))];
  const map = new Map();
  if (!ids.length) return map;
  const rows = await pg.unsafe(
    `SELECT player_id, mlb_player_id, player_name, full_name, throw_side FROM ref.players WHERE player_id = ANY($1::bigint[]) OR mlb_player_id = ANY($1::bigint[])`,
    [ids]
  );
  for (const r of rows) {
    const hand = r.throw_side || null;
    if (r.player_id !== null && r.player_id !== undefined) map.set(Number(r.player_id), { hand, name: r.full_name || r.player_name || null });
    if (r.mlb_player_id !== null && r.mlb_player_id !== undefined) map.set(Number(r.mlb_player_id), { hand, name: r.full_name || r.player_name || null });
  }
  return map;
}

async function fetchPeopleHands(env, missingIds, counters) {
  const map = new Map();
  const ids = [...new Set(missingIds.filter(Boolean).map(Number))].slice(0, MAX_PEOPLE_FALLBACK_CALLS);
  if (!ids.length) return map;
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const url = `${sourceBase(env)}/people?personIds=${encodeURIComponent(chunk.join(","))}`;
    counters.external_calls++;
    const res = await fetchJson(url, env);
    if (!res.ok) continue;
    for (const person of res.json?.people || []) {
      const id = Number(person?.id);
      if (!id) continue;
      const hand = extractPitchHand(person);
      const name = person?.fullName || null;
      if (hand || name) map.set(id, { hand, name });
    }
  }
  return map;
}

function collectStarterIdsForHandFill(relevantGames, actualMap, refHands, derivedCandidatesById) {
  const byId = new Map();
  for (const g of relevantGames) {
    const gamePk = Number(g.gamePk);
    for (const side of ["away", "home"]) {
      const probable = g?.teams?.[side]?.probablePitcher || null;
      const probableId = probable?.id ? Number(probable.id) : null;
      if (probableId) byId.set(probableId, { id: probableId, sourceHand: extractPitchHand(probable) });
      const actual = actualMap.get(`${gamePk}:${side}`) || null;
      const actualId = actual?.id ? Number(actual.id) : null;
      if (actualId) byId.set(actualId, { id: actualId, sourceHand: actual.hand || byId.get(actualId)?.sourceHand || null });
    }
  }
  for (const id of derivedCandidatesById.keys()) {
    if (!byId.has(id)) byId.set(id, { id, sourceHand: null });
  }
  const missing = [];
  for (const item of byId.values()) {
    if (!item.id) continue;
    if (item.sourceHand) continue;
    if (refHands.get(item.id)?.hand) continue;
    missing.push(item.id);
  }
  return missing;
}

async function fetchActualStarterMap(env, games, counters, options = {}) {
  const out = new Map();
  if (!options.enabled) return out;
  const limit = Number.isFinite(Number(options.limit)) ? Math.max(0, Math.min(MAX_LIVE_FEED_CALLS, Number(options.limit))) : MAX_LIVE_FEED_CALLS;
  const candidates = games.filter(g => statusIsLiveOrFinal(g)).slice(0, limit);
  const CONCURRENCY = 6;
  let cursor = 0;
  async function worker() {
    while (cursor < candidates.length) {
      const game = candidates[cursor++];
      const gamePk = Number(game.gamePk);
      const url = liveFeedUrl(gamePk);
      counters.external_calls++;
      counters.live_feed_games_checked++;
      const res = await fetchJson(url, env);
      if (!res.ok) continue;
      const box = res.json?.liveData?.boxscore?.teams || {};
      for (const side of ["away", "home"]) {
        const id = box?.[side]?.pitchers?.[0] ? Number(box[side].pitchers[0]) : null;
        if (!id) continue;
        const playerObj = box?.[side]?.players?.[`ID${id}`] || null;
        out.set(`${gamePk}:${side}`, { id, name: playerObj?.person?.fullName || null, hand: extractPitchHand(playerObj?.person) || extractPitchHand(playerObj) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, () => worker()));
  return out;
}

function retentionWindow(dateSet) {
  const today = todayPt();
  const tomorrow = addDays(today, 1);
  const realDates = dateSet && dateSet.size ? Array.from(dateSet).filter(Boolean).sort() : [];
  const allDates = [...new Set([...realDates, today, tomorrow])].sort();
  return { start: allDates[0], end: allDates[allDates.length - 1], dates: allDates, keepDates: new Set(allDates) };
}
function buildWindow(dateSet) {
  const retention = retentionWindow(dateSet);
  return { start: retention.start, end: retention.end, dates: retention.dates, keepDates: retention.keepDates };
}
function gameHasStartedForRetention(row, nowIso) {
  const t = row && row.official_game_time_utc ? String(row.official_game_time_utc) : null;
  return Boolean(t && t <= nowIso);
}
function filterPreparedRowsForRetention(rows, retention, nowIso) {
  return (rows || []).filter(r => retention.keepDates.has(dateOnly(r.official_date || r.official_game_time_utc)) && !gameHasStartedForRetention(r, nowIso));
}

async function pruneDateScopedDailyStarterTables(pg, retention) {
  await pg`DELETE FROM daily.probable_pitchers WHERE official_date NOT IN ${pg(retention.dates)}`;
  await pg`DELETE FROM daily.starters_stage WHERE official_date NOT IN ${pg(retention.dates)}`;
}

async function pruneGameScopedDailyStarterTables(pg, keepGamePks, batchId, retention) {
  const ids = [...new Set((keepGamePks || []).filter(Boolean).map(Number))];
  if (ids.length) {
    await pg`DELETE FROM daily.starters_snapshots WHERE game_pk IS NULL OR game_pk NOT IN ${pg(ids)}`;
    await pg`DELETE FROM daily.starters_issues WHERE game_pk IS NULL OR game_pk NOT IN ${pg(ids)}`;
  } else {
    await pg.unsafe(`DELETE FROM daily.starters_snapshots`);
    await pg.unsafe(`DELETE FROM daily.starters_issues`);
  }
  await pg.unsafe(
    `DELETE FROM daily.starters_batches WHERE batch_id <> $1 AND (window_start IS NULL OR window_end IS NULL OR window_start < $2 OR window_start > $3 OR window_end < $2 OR window_end > $3)`,
    [batchId, retention.start, retention.end]
  );
}

function rowFromTeamSide({ game, calendar, side, previous, preparedTeamCount, actual, refHand, peopleHand, sourceEndpoint, snapshotAt, derivedCandidate }) {
  const gamePk = Number(game.gamePk);
  const teamObj = game?.teams?.[side]?.team || {};
  const oppSide = side === "away" ? "home" : "away";
  const oppObj = game?.teams?.[oppSide]?.team || {};
  const probable = game?.teams?.[side]?.probablePitcher || null;
  const note = probable?.note || "";
  const flags = noteFlags(note);
  const rawPitcherId = probable?.id ? Number(probable.id) : null;
  const actualId = actual?.id || null;
  const officialStarterId = actualId || rawPitcherId || null;
  const usingDerived = !officialStarterId && !!derivedCandidate;
  const starterId = officialStarterId || (usingDerived ? derivedCandidate.player_id : null);
  const ref = starterId ? refHand.get(starterId) : null;
  const person = starterId ? peopleHand.get(starterId) : null;
  const hand = actual?.hand || extractPitchHand(probable) || ref?.hand || person?.hand || (usingDerived ? derivedCandidate.throws : null) || null;
  const starterName = actual?.name || probable?.fullName || ref?.name || person?.name || (usingDerived ? derivedCandidate.name : null) || null;
  const abs = String(game?.status?.abstractGameState || calendar?.abstract_game_state || "");
  const detail = String(game?.status?.detailedState || calendar?.detailed_state || "");
  const previousId = previous?.starter_player_id ? Number(previous.starter_player_id) : null;
  const previousName = previous?.starter_name || null;
  const pregame = statusIsPregame(game);
  const changed = !!(previousId && officialStarterId && previousId !== officialStarterId && pregame);
  const scratch = flags.scratch || changed;
  const tbd = !officialStarterId && !usingDerived;
  const unavailable = false;
  let starterStatus = "probable";
  let confidence = "MEDIUM_OFFICIAL_PROBABLE";

  if (actualId) { starterStatus = "actual_started"; confidence = "HIGH_OFFICIAL_ACTUAL_STARTED"; }
  else if (usingDerived) { starterStatus = "derived_likely_starter"; confidence = "LOW_DERIVED_ROTATION_PREDICTION"; }
  else if (tbd) { starterStatus = "tbd"; confidence = "LOW_TBD"; }
  else if (flags.opener) { starterStatus = "opener_expected"; confidence = "WARNING_OPENER_BULK_UNCLEAR"; }
  else if (flags.bulk) { starterStatus = "bulk_unclear"; confidence = "WARNING_OPENER_BULK_UNCLEAR"; }
  else if (scratch) { starterStatus = "changed"; confidence = "WARNING_CHANGED"; }

  if (starterId && !hand && confidence === "MEDIUM_OFFICIAL_PROBABLE") confidence = "WARNING_HAND_MISSING";

  return {
    current_key: `${gamePk}_${Number(teamObj.id)}`,
    game_pk: gamePk,
    official_date: calendar?.official_date || game.officialDate || dateOnly(game.gameDate),
    game_time_utc: calendar?.game_time_utc || game.gameDate || null,
    team_id: Number(teamObj.id),
    team_name: teamObj.name || null,
    opponent_team_id: Number(oppObj.id),
    opponent_team_name: oppObj.name || null,
    is_home: side === "home" ? 1 : 0,
    starter_player_id: starterId,
    starter_name: starterName,
    starter_hand: hand,
    starter_status: starterStatus,
    starter_confidence: confidence,
    source_status: "source_ok",
    source_key: SOURCE_KEY,
    source_endpoint: sourceEndpoint,
    source_snapshot_at: snapshotAt,
    game_status: detail || abs || null,
    abstract_game_state: abs || null,
    detailed_state: detail || null,
    previous_starter_player_id: changed ? previousId : null,
    previous_starter_name: changed ? previousName : null,
    change_detected: boolInt(changed),
    scratch_flag: boolInt(scratch),
    opener_flag: boolInt(flags.opener),
    bulk_pitcher_flag: boolInt(flags.bulk),
    tbd_flag: boolInt(tbd),
    unavailable_flag: boolInt(unavailable),
    hand_missing_flag: boolInt(!!starterId && !hand),
    prepared_board_relevant: boolInt(preparedTeamCount > 0),
    prepared_board_pickable_rows: preparedTeamCount || 0,
    data_source_level: starterId ? (usingDerived ? "derived" : "real") : "unknown",
    is_temporary_derived: boolInt(usingDerived),
    raw_json: safeString({ side, probablePitcher: probable, actualStarter: actual, note, derived_candidate: usingDerived ? derivedCandidate : null })
  };
}

async function writeStarterRows(pg, batchId, rows, previousMap, counters) {
  if (!rows.length) return;
  const stageRows = rows.map(r => ({ ...r, stage_id: rid("daily_starters_stage"), batch_id: batchId }));
  const stageCols = ["stage_id", "batch_id", "current_key", "source_key", "source_endpoint", "source_snapshot_at", "game_pk", "official_date", "game_time_utc", "team_id", "team_name", "opponent_team_id", "opponent_team_name", "is_home", "starter_player_id", "starter_name", "starter_hand", "starter_status", "starter_confidence", "source_status", "game_status", "abstract_game_state", "detailed_state", "previous_starter_player_id", "previous_starter_name", "change_detected", "scratch_flag", "opener_flag", "bulk_pitcher_flag", "tbd_flag", "unavailable_flag", "hand_missing_flag", "prepared_board_relevant", "prepared_board_pickable_rows", "raw_json"];
  await pg`INSERT INTO daily.starters_stage ${pg(stageRows, ...stageCols)}`;

  const currentRows = rows.map(r => {
    const prev = previousMap.get(r.current_key);
    const firstSeen = prev?.first_seen_at || nowUtc();
    const changedAt = r.change_detected ? nowUtc() : (prev?.changed_at || null);
    return { entry_id: r.current_key, batch_id: batchId, ...r, first_seen_at: firstSeen, changed_at: changedAt };
  });
  const currentCols = ["entry_id", "batch_id", "source_key", "source_endpoint", "source_snapshot_at", "game_pk", "official_date", "game_time_utc", "team_id", "team_name", "opponent_team_id", "opponent_team_name", "is_home", "starter_player_id", "starter_name", "starter_hand", "starter_status", "starter_confidence", "source_status", "game_status", "abstract_game_state", "detailed_state", "previous_starter_player_id", "previous_starter_name", "change_detected", "scratch_flag", "opener_flag", "bulk_pitcher_flag", "tbd_flag", "unavailable_flag", "hand_missing_flag", "prepared_board_relevant", "prepared_board_pickable_rows", "first_seen_at", "changed_at", "raw_json", "data_source_level", "is_temporary_derived"];
  await pg`INSERT INTO daily.probable_pitchers ${pg(currentRows, ...currentCols)}
    ON CONFLICT (entry_id) DO UPDATE SET batch_id=excluded.batch_id, source_key=excluded.source_key, source_endpoint=excluded.source_endpoint,
    source_snapshot_at=excluded.source_snapshot_at, game_pk=excluded.game_pk, official_date=excluded.official_date, game_time_utc=excluded.game_time_utc,
    team_id=excluded.team_id, team_name=excluded.team_name, opponent_team_id=excluded.opponent_team_id, opponent_team_name=excluded.opponent_team_name,
    is_home=excluded.is_home, starter_player_id=excluded.starter_player_id, starter_name=excluded.starter_name, starter_hand=excluded.starter_hand,
    starter_status=excluded.starter_status, starter_confidence=excluded.starter_confidence, source_status=excluded.source_status,
    game_status=excluded.game_status, abstract_game_state=excluded.abstract_game_state, detailed_state=excluded.detailed_state,
    previous_starter_player_id=excluded.previous_starter_player_id, previous_starter_name=excluded.previous_starter_name,
    change_detected=excluded.change_detected, scratch_flag=excluded.scratch_flag, opener_flag=excluded.opener_flag,
    bulk_pitcher_flag=excluded.bulk_pitcher_flag, tbd_flag=excluded.tbd_flag, unavailable_flag=excluded.unavailable_flag,
    hand_missing_flag=excluded.hand_missing_flag, prepared_board_relevant=excluded.prepared_board_relevant,
    prepared_board_pickable_rows=excluded.prepared_board_pickable_rows, last_seen_at=now(), changed_at=excluded.changed_at,
    raw_json=excluded.raw_json, data_source_level=excluded.data_source_level, is_temporary_derived=excluded.is_temporary_derived, updated_at=now()`;

  const snapshotRows = rows.map(r => ({ snapshot_id: rid("daily_starters_snapshot"), batch_id: batchId, current_key: r.current_key, game_pk: r.game_pk, team_id: r.team_id, starter_player_id: r.starter_player_id, starter_name: r.starter_name, starter_hand: r.starter_hand, starter_status: r.starter_status, starter_confidence: r.starter_confidence, source_status: r.source_status, source_key: r.source_key, source_endpoint: r.source_endpoint, source_snapshot_at: r.source_snapshot_at, raw_json: r.raw_json }));
  const snapshotCols = ["snapshot_id", "batch_id", "current_key", "game_pk", "team_id", "starter_player_id", "starter_name", "starter_hand", "starter_status", "starter_confidence", "source_status", "source_key", "source_endpoint", "source_snapshot_at", "raw_json"];
  await pg`INSERT INTO daily.starters_snapshots ${pg(snapshotRows, ...snapshotCols)}`;
  counters.rows_written += rows.length;
  counters.snapshot_rows_written += rows.length;

  const issueRows = [];
  for (const r of rows) {
    if (r.tbd_flag && r.prepared_board_relevant) issueRows.push({ issue_id: rid("daily_starters_issue"), batch_id: batchId, game_pk: r.game_pk, team_id: r.team_id, issue_status: "open", issue_type: "starter_tbd", severity: "blocking", reason: "Prepared-board-relevant team has no probable/actual starter from official source.", details_json: safeString({ current_key: r.current_key }) });
    if (r.change_detected) issueRows.push({ issue_id: rid("daily_starters_issue"), batch_id: batchId, game_pk: r.game_pk, team_id: r.team_id, issue_status: "open", issue_type: "starter_changed", severity: "warning", reason: "Starter player ID changed versus previous current snapshot before live/final state.", details_json: safeString({ previous_starter_player_id: r.previous_starter_player_id, starter_player_id: r.starter_player_id }) });
    if (r.scratch_flag) issueRows.push({ issue_id: rid("daily_starters_issue"), batch_id: batchId, game_pk: r.game_pk, team_id: r.team_id, issue_status: "open", issue_type: "starter_scratch_or_change", severity: "warning", reason: "Scratch/change detected from note text or previous snapshot comparison.", details_json: safeString({ starter_status: r.starter_status }) });
    if (r.opener_flag) issueRows.push({ issue_id: rid("daily_starters_issue"), batch_id: batchId, game_pk: r.game_pk, team_id: r.team_id, issue_status: "open", issue_type: "opener_expected", severity: "warning", reason: "Official note text indicates opener possibility.", details_json: "{}" });
    if (r.bulk_pitcher_flag) issueRows.push({ issue_id: rid("daily_starters_issue"), batch_id: batchId, game_pk: r.game_pk, team_id: r.team_id, issue_status: "open", issue_type: "bulk_unclear", severity: "warning", reason: "Official note text indicates bulk/follower/limited pitch-count possibility.", details_json: "{}" });
    if (r.hand_missing_flag) issueRows.push({ issue_id: rid("daily_starters_issue"), batch_id: batchId, game_pk: r.game_pk, team_id: r.team_id, issue_status: "open", issue_type: "starter_hand_missing", severity: "warning", reason: "Starter ID resolved but throw hand was not found in source/person hydrate/local REF lookup.", details_json: "{}" });
  }
  if (issueRows.length) {
    const issueCols = ["issue_id", "batch_id", "game_pk", "team_id", "issue_status", "issue_type", "severity", "reason", "details_json"];
    await pg`INSERT INTO daily.starters_issues ${pg(issueRows, ...issueCols)}`;
  }
}

async function updateLegacyProbable(pg, batchId, rows, counters) {
  const byGame = new Map();
  for (const r of rows) {
    const g = byGame.get(r.game_pk) || { game_key: String(r.game_pk), slate_date: r.official_date, away_pitcher_id: null, home_pitcher_id: null, raw: [] };
    if (r.is_home) g.home_pitcher_id = r.starter_player_id || null;
    else g.away_pitcher_id = r.starter_player_id || null;
    g.raw.push({ team_id: r.team_id, starter_player_id: r.starter_player_id, starter_status: r.starter_status, starter_confidence: r.starter_confidence });
    byGame.set(r.game_pk, g);
  }
  for (const g of byGame.values()) {
    await pg.unsafe(
      `INSERT INTO daily.probable_pitchers (entry_id, game_key, slate_date, away_pitcher_id, home_pitcher_id, source_key, confidence, raw_json, updated_at)
       VALUES ($1, $1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (entry_id) DO NOTHING`,
      [`legacy_${g.game_key}`, g.slate_date, g.away_pitcher_id, g.home_pitcher_id, SOURCE_KEY, "DAILY_STARTERS_COMPAT_V0_1", safeString({ batch_id: batchId, rows: g.raw })]
    ).catch(() => {});
    counters.legacy_rows_written++;
  }
}

async function runDailyStarters(request, env) {
  const input = await readJsonSafe(request);
  const requestId = input.request_id || rid("daily_starters_request");
  const runId = input.run_id || rid("daily_starters_run");
  const batchId = rid("daily_starters_batch");
  const startedAt = nowUtc();
  const mode = input.mode || "daily_starters_refresh_window";
  const counters = { external_calls: 0, live_feed_games_checked: 0, rows_written: 0, snapshot_rows_written: 0, legacy_rows_written: 0 };
  const pg = pgClient(env);

  try {
    await ensureSchema(pg);
    await pg.unsafe(
      `INSERT INTO daily.starters_batches (batch_id, request_id, run_id, job_key, worker_name, worker_version, mode, status, started_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'running', $8, now(), now())`,
      [batchId, requestId, runId, JOB_KEY, WORKER_NAME, VERSION, mode, startedAt]
    );

    let output = null;
    try {
      const rawPreparedRowsPrelim = await loadPreparedRows(pg);
      const nowIsoForRetention = new Date().toISOString();
      const notYetStartedDates = new Set(rawPreparedRowsPrelim.filter(r => !gameHasStartedForRetention(r, nowIsoForRetention)).map(r => dateOnly(r.official_date || r.official_game_time_utc)).filter(Boolean));
      const retention = retentionWindow(notYetStartedDates);
      await pruneDateScopedDailyStarterTables(pg, retention);

      const rawPreparedRows = rawPreparedRowsPrelim;
      const preparedRows = filterPreparedRowsForRetention(rawPreparedRows, retention, nowIsoForRetention);
      const teamAliasMap = await loadTeamAliasMap(pg);
      const prep = preparedMaps(preparedRows, teamAliasMap);
      const window = buildWindow(prep.dateSet);
      const endpoint = scheduleUrl(env, window.start, window.end);
      counters.external_calls++;
      const schedule = await fetchJson(endpoint, env);
      if (!schedule.ok) {
        output = { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "source_missing", certification: "DAILY_STARTERS_SOURCE_MISSING", batch_id: batchId, request_id: requestId, run_id: runId, source_endpoint: endpoint, source_error: schedule };
        await pg.unsafe(`UPDATE daily.starters_batches SET status='failed', completed_at=now(), updated_at=now(), external_calls=$1, certification_status='DAILY_STARTERS_SOURCE_MISSING', certification_grade='SOURCE_FAIL', certification_reason='MLB schedule endpoint failed', output_json=$2 WHERE batch_id=$3`, [counters.external_calls, JSON.stringify(output), batchId]);
        return jsonResponse(output, 502);
      }

      const games = [];
      for (const d of schedule.json?.dates || []) for (const g of d.games || []) games.push(g);
      const calendarMap = await loadCalendarRows(pg, new Set(games.map(g => Number(g.gamePk)).filter(Boolean)));
      const relevantGames = games.filter(g => { const gp = Number(g.gamePk); return prep.gameSet.size ? prep.gameSet.has(gp) || calendarMap.has(gp) : true; });

      const probableIds = [];
      for (const g of relevantGames) for (const side of ["away", "home"]) { const id = g?.teams?.[side]?.probablePitcher?.id; if (id) probableIds.push(Number(id)); }

      const liveFeedActuals = liveFeedActualsEnabled(input, env);
      const actualMap = await fetchActualStarterMap(env, relevantGames, counters, { enabled: liveFeedActuals });

      const relevantTeamIds = new Set();
      for (const g of relevantGames) for (const side of ["away", "home"]) { const tid = g?.teams?.[side]?.team?.id; if (tid) relevantTeamIds.add(String(tid)); }
      const recentStartersByTeam = await loadRecentTeamStarters(pg, [...relevantTeamIds], window.start);

      const derivedByTeamGame = new Map();
      const derivedCandidatesById = new Map();
      for (const game of relevantGames) {
        const gamePk = Number(game.gamePk);
        const calendar = calendarMap.get(gamePk) || null;
        const gameDate = calendar?.official_date || game.officialDate || dateOnly(game.gameDate) || window.start;
        for (const side of ["away", "home"]) {
          const teamId = Number(game?.teams?.[side]?.team?.id);
          const probable = game?.teams?.[side]?.probablePitcher || null;
          if (probable?.id) continue;
          const dc = deriveLikelyStarter(recentStartersByTeam.get(String(teamId)), gameDate);
          if (dc) { derivedByTeamGame.set(`${gamePk}:${teamId}`, dc); derivedCandidatesById.set(dc.player_id, dc); }
        }
      }

      const allStarterIds = [...probableIds];
      for (const actual of actualMap.values()) if (actual?.id) allStarterIds.push(Number(actual.id));
      for (const id of derivedCandidatesById.keys()) allStarterIds.push(id);
      const refHands = await loadRefPlayerHands(pg, allStarterIds);
      const missingHandIds = collectStarterIdsForHandFill(relevantGames, actualMap, refHands, derivedCandidatesById);
      const peopleHands = await fetchPeopleHands(env, missingHandIds, counters);

      const previousRows = await pg.unsafe("SELECT entry_id AS current_key, starter_player_id, starter_name, first_seen_at, changed_at FROM daily.probable_pitchers");
      const previousMap = new Map(previousRows.map(r => [r.current_key, r]));
      const rows = [];
      const snapshotAt = nowUtc();

      for (const game of relevantGames) {
        const gamePk = Number(game.gamePk);
        const calendar = calendarMap.get(gamePk) || null;
        for (const side of ["away", "home"]) {
          const teamId = Number(game?.teams?.[side]?.team?.id);
          const preparedTeamCount = prep.teamCounts.get(`${gamePk}:${teamId}`) || 0;
          const currentKey = `${gamePk}_${teamId}`;
          const actual = actualMap.get(`${gamePk}:${side}`) || null;
          const derivedCandidate = derivedByTeamGame.get(`${gamePk}:${teamId}`) || null;
          rows.push(rowFromTeamSide({ game, calendar, side, previous: previousMap.get(currentKey), preparedTeamCount, actual, refHand: refHands, peopleHand: peopleHands, sourceEndpoint: endpoint, snapshotAt, derivedCandidate }));
        }
      }

      await pg.unsafe("DELETE FROM daily.starters_stage WHERE batch_id = $1", [batchId]);
      await writeStarterRows(pg, batchId, rows, previousMap, counters);
      await updateLegacyProbable(pg, batchId, rows, counters);
      await pruneGameScopedDailyStarterTables(pg, rows.map(r => r.game_pk), batchId, retention);

      const warningRows = rows.filter(r => r.change_detected || r.scratch_flag || r.opener_flag || r.bulk_pitcher_flag || r.hand_missing_flag || r.starter_status === "probable").length;
      const blockingRows = rows.filter(r => r.prepared_board_relevant && r.tbd_flag).length;
      const startersFound = rows.filter(r => r.starter_player_id).length;
      const tbd = rows.filter(r => r.tbd_flag).length;
      const changed = rows.filter(r => r.change_detected).length;
      const actualStarted = rows.filter(r => r.starter_status === "actual_started").length;
      const derivedStarters = rows.filter(r => r.is_temporary_derived === 1).length;
      const realStarters = rows.filter(r => r.data_source_level === "real").length;

      const certification = blockingRows > 0 ? "DAILY_STARTERS_COMPLETED_WITH_BLOCKERS" : "DAILY_STARTERS_CERTIFIED_REFRESHED";
      const grade = blockingRows > 0 ? "WARN_BLOCKERS" : "PASS";

      output = {
        ok: true, data_ok: blockingRows === 0, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY,
        status: "completed_daily_starters_refresh", certification, certification_grade: grade, batch_id: batchId, request_id: requestId, run_id: runId,
        window_start: window.start, window_end: window.end, retention_policy: "board_scoped_not_yet_started_games_only",
        source_endpoint: endpoint, prepared_rows_read: preparedRows.length, raw_prepared_rows_seen_before_retention_filter: rawPreparedRows.length,
        prepared_games_checked: prep.gameSet.size, calendar_games_checked: calendarMap.size, schedule_games_seen: games.length, teams_checked: rows.length,
        starters_found: startersFound, starters_tbd: tbd, starters_changed: changed, actual_starters_found: actualStarted,
        derived_starters_used: derivedStarters, real_starters_confirmed: realStarters, warning_rows: warningRows, blocking_rows: blockingRows,
        rows_written: counters.rows_written, snapshot_rows_written: counters.snapshot_rows_written, legacy_rows_written: counters.legacy_rows_written,
        external_calls_performed: counters.external_calls, live_feed_games_checked: counters.live_feed_games_checked, live_feed_actuals_enabled: liveFeedActuals,
        no_board_mutation: true, no_scoring: true, no_ranking: true, no_final_board: true,
        status_model_note: liveFeedActuals ? "Live/final boxscore actual starter verification enabled for this run." : "Timeout-safe default: MLB schedule hydrate probablePitcher is authoritative for daily context; live/final boxscore actual starter verification is opt-in only."
      };

      await pg.unsafe(
        `UPDATE daily.starters_batches SET status='completed', window_start=$1, window_end=$2, prepared_games_checked=$3, prepared_rows_read=$4,
         calendar_games_checked=$5, schedule_games_seen=$6, live_feed_games_checked=$7, teams_checked=$8, starters_found=$9, starters_tbd=$10,
         starters_changed=$11, actual_starters_found=$12, warning_rows=$13, blocking_rows=$14, rows_written=$15, external_calls=$16,
         certification_status=$17, certification_grade=$18, certification_reason=$19, output_json=$20, completed_at=now(), updated_at=now() WHERE batch_id=$21`,
        [window.start, window.end, prep.gameSet.size, preparedRows.length, calendarMap.size, games.length, counters.live_feed_games_checked, rows.length,
          startersFound, tbd, changed, actualStarted, warningRows, blockingRows, counters.rows_written, counters.external_calls, certification, grade,
          blockingRows > 0 ? "Prepared-board-relevant starters still TBD or blocked." : "Daily starters refreshed from official MLB StatsAPI without prepared-board starter blockers.",
          JSON.stringify(output), batchId]
      );
      return jsonResponse(output);
    } catch (err) {
      output = { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "daily_starters_exception", certification: "DAILY_STARTERS_EXCEPTION", batch_id: batchId, request_id: requestId, run_id: runId, error: String(err && err.stack ? err.stack : err) };
      await pg.unsafe(`UPDATE daily.starters_batches SET status='failed', completed_at=now(), updated_at=now(), external_calls=$1, certification_status='DAILY_STARTERS_EXCEPTION', certification_grade='FAIL', certification_reason=$2, output_json=$3 WHERE batch_id=$4`, [counters.external_calls, String(err && err.message ? err.message : err).slice(0, 900), JSON.stringify(output), batchId]).catch(() => {});
      return jsonResponse(output, 500);
    }
  } finally {
    await pg.end({ timeout: 1 }).catch(() => {});
  }
}

function health(env) {
  return {
    ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "DAILY_STARTERS_WORKER_READY", timestamp_utc: nowUtc(),
    bindings: { HYPERDRIVE: !!env.HYPERDRIVE, CONTROL_DB: !!env.CONTROL_DB },
    source_strategy: {
      primary: "MLB StatsAPI schedule hydrate=probablePitcher(note,person)",
      secondary: "MLB StatsAPI live feed actual_started verification is opt-in only to avoid service-binding timeout",
      no_paid_sources: true, no_html_scraping: true, live_feed_actuals_default: "disabled", timeout_safe_default: true,
      retention_policy: "current/snapshot/issue/legacy starter data retained only for PT today and tomorrow"
    }
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();
    if (method === "OPTIONS") return jsonResponse({ ok: true });
    if (method === "GET" && (path === "/" || path === "/health")) return jsonResponse(health(env));
    if (method === "GET" && path === "/diagnostic") return jsonResponse({ ...health(env), diagnostic: "ready_for_orchestrator_exact_dispatch" });
    if (method === "POST" && path === "/run") {
      const HARD_DEADLINE_MS = 18000;
      const TIMEOUT_SENTINEL = { __hard_deadline_timeout__: true };
      const withDeadline = (promise, ms, fallbackValue) => {
        let timer = null;
        return Promise.race([
          Promise.resolve(promise),
          new Promise(resolve => { timer = setTimeout(() => resolve(fallbackValue), ms); })
        ]).finally(() => { if (timer) clearTimeout(timer); });
      };
      const out = await withDeadline(runDailyStarters(request, env), HARD_DEADLINE_MS, TIMEOUT_SENTINEL);
      if (out === TIMEOUT_SENTINEL) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "hard_deadline_timeout", certification: "DAILY_STARTERS_HARD_DEADLINE_TIMEOUT", error: `Worker exceeded its own ${HARD_DEADLINE_MS}ms internal deadline`, hard_deadline_ms: HARD_DEADLINE_MS, timestamp_utc: nowUtc() }, 200);
      }
      return out;
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "not_found", path }, 404);
  }
};
