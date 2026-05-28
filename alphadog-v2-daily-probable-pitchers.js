const WORKER_NAME = "alphadog-v2-daily-probable-pitchers";
const VERSION = "alphadog-v2-daily-probable-pitchers-v0.1.3-today-tomorrow-retention";
const JOB_KEY = "daily-probable-pitchers";
const SOURCE_KEY = "official_mlb_statsapi_schedule_probable_pitcher";
const MAX_PREPARED_ROWS = 5000;
const MAX_PEOPLE_FALLBACK_CALLS = 250;
const MAX_LIVE_FEED_CALLS = 20;

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
async function first(db, sql, ...binds) { const s = db.prepare(sql); return binds.length ? await s.bind(...binds).first() : await s.first(); }
async function run(db, sql, ...binds) { const s = db.prepare(sql); return binds.length ? await s.bind(...binds).run() : await s.run(); }
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
function placeholders(n) { return Array.from({ length: n }, () => "?").join(","); }
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
  const candidates = [
    obj?.pitchHand,
    obj?.person?.pitchHand,
    obj?.player?.pitchHand
  ];
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
  const ua = String(env.MLB_API_USER_AGENT || "AlphaDog-v2-Daily-Starters/0.1");
  return { "accept": "application/json", "user-agent": ua };
}

async function ensureSchema(env) {
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_starters_batches (
    batch_id TEXT PRIMARY KEY,
    request_id TEXT,
    run_id TEXT,
    job_key TEXT,
    worker_name TEXT,
    worker_version TEXT,
    mode TEXT,
    status TEXT,
    window_start TEXT,
    window_end TEXT,
    prepared_games_checked INTEGER DEFAULT 0,
    prepared_rows_read INTEGER DEFAULT 0,
    calendar_games_checked INTEGER DEFAULT 0,
    schedule_games_seen INTEGER DEFAULT 0,
    live_feed_games_checked INTEGER DEFAULT 0,
    teams_checked INTEGER DEFAULT 0,
    starters_found INTEGER DEFAULT 0,
    starters_tbd INTEGER DEFAULT 0,
    starters_changed INTEGER DEFAULT 0,
    actual_starters_found INTEGER DEFAULT 0,
    warning_rows INTEGER DEFAULT 0,
    blocking_rows INTEGER DEFAULT 0,
    rows_written INTEGER DEFAULT 0,
    snapshot_rows_written INTEGER DEFAULT 0,
    legacy_rows_written INTEGER DEFAULT 0,
    external_calls INTEGER DEFAULT 0,
    certification_status TEXT,
    certification_grade TEXT,
    certification_reason TEXT,
    output_json TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_starters_current (
    current_key TEXT PRIMARY KEY,
    batch_id TEXT,
    source_key TEXT,
    source_endpoint TEXT,
    source_snapshot_at TEXT,
    game_pk INTEGER,
    official_date TEXT,
    game_time_utc TEXT,
    team_id INTEGER,
    team_name TEXT,
    opponent_team_id INTEGER,
    opponent_team_name TEXT,
    is_home INTEGER,
    starter_player_id INTEGER,
    starter_name TEXT,
    starter_hand TEXT,
    starter_status TEXT,
    starter_confidence TEXT,
    source_status TEXT,
    game_status TEXT,
    abstract_game_state TEXT,
    detailed_state TEXT,
    previous_starter_player_id INTEGER,
    previous_starter_name TEXT,
    change_detected INTEGER DEFAULT 0,
    scratch_flag INTEGER DEFAULT 0,
    opener_flag INTEGER DEFAULT 0,
    bulk_pitcher_flag INTEGER DEFAULT 0,
    tbd_flag INTEGER DEFAULT 0,
    unavailable_flag INTEGER DEFAULT 0,
    hand_missing_flag INTEGER DEFAULT 0,
    prepared_board_relevant INTEGER DEFAULT 0,
    prepared_board_pickable_rows INTEGER DEFAULT 0,
    first_seen_at TEXT,
    last_seen_at TEXT,
    changed_at TEXT,
    raw_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_starters_stage (
    stage_id TEXT PRIMARY KEY,
    batch_id TEXT,
    current_key TEXT,
    source_key TEXT,
    source_endpoint TEXT,
    source_snapshot_at TEXT,
    game_pk INTEGER,
    official_date TEXT,
    game_time_utc TEXT,
    team_id INTEGER,
    team_name TEXT,
    opponent_team_id INTEGER,
    opponent_team_name TEXT,
    is_home INTEGER,
    starter_player_id INTEGER,
    starter_name TEXT,
    starter_hand TEXT,
    starter_status TEXT,
    starter_confidence TEXT,
    source_status TEXT,
    game_status TEXT,
    abstract_game_state TEXT,
    detailed_state TEXT,
    previous_starter_player_id INTEGER,
    previous_starter_name TEXT,
    change_detected INTEGER DEFAULT 0,
    scratch_flag INTEGER DEFAULT 0,
    opener_flag INTEGER DEFAULT 0,
    bulk_pitcher_flag INTEGER DEFAULT 0,
    tbd_flag INTEGER DEFAULT 0,
    unavailable_flag INTEGER DEFAULT 0,
    hand_missing_flag INTEGER DEFAULT 0,
    prepared_board_relevant INTEGER DEFAULT 0,
    prepared_board_pickable_rows INTEGER DEFAULT 0,
    raw_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_starters_snapshots (
    snapshot_id TEXT PRIMARY KEY,
    batch_id TEXT,
    current_key TEXT,
    game_pk INTEGER,
    team_id INTEGER,
    starter_player_id INTEGER,
    starter_name TEXT,
    starter_hand TEXT,
    starter_status TEXT,
    starter_confidence TEXT,
    source_status TEXT,
    source_key TEXT,
    source_endpoint TEXT,
    source_snapshot_at TEXT,
    raw_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_starters_issues (
    issue_id TEXT PRIMARY KEY,
    batch_id TEXT,
    game_pk INTEGER,
    team_id INTEGER,
    issue_status TEXT,
    issue_type TEXT,
    severity TEXT,
    reason TEXT,
    details_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_probable_pitchers (
    game_key TEXT PRIMARY KEY,
    slate_date TEXT,
    away_pitcher_id INTEGER,
    home_pitcher_id INTEGER,
    source_key TEXT,
    confidence TEXT,
    raw_json TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
}

async function fetchJson(url, env) {
  const resp = await fetch(url, { headers: requestHeaders(env) });
  const text = await resp.text();
  if (!resp.ok) {
    return { ok: false, status: resp.status, error: `HTTP_${resp.status}`, text: text.slice(0, 900) };
  }
  try { return { ok: true, status: resp.status, json: JSON.parse(text) }; }
  catch (err) { return { ok: false, status: resp.status, error: "non_json_response", text: text.slice(0, 900) }; }
}

async function loadPreparedRows(env) {
  return await all(env.SCORE_DB, `SELECT
      official_game_pk,
      official_game_time_utc,
      official_date,
      source_key,
      player_name,
      team,
      opponent,
      canonical_prop_key,
      line_value,
      pickable_safe,
      matchup_status,
      player_match_status
    FROM score_board_prepared_current
    WHERE pickable_safe = 1
      AND matchup_status = 'calendar_matched'
      AND player_match_status = 'matched'
      AND official_game_pk IS NOT NULL
      AND official_game_time_utc IS NOT NULL
    ORDER BY official_game_time_utc
    LIMIT ${MAX_PREPARED_ROWS}`);
}

async function loadTeamAliasMap(env) {
  const map = new Map();
  const teams = await all(env.REF_DB, "SELECT team_id, mlb_team_id, abbreviation, full_name, nickname, location_name, short_name, team_code, file_code FROM ref_teams WHERE active = 1");
  for (const t of teams) {
    for (const v of [t.team_id, t.mlb_team_id, t.abbreviation, t.full_name, t.nickname, t.location_name, t.short_name, t.team_code, t.file_code]) {
      const n = normalize(v);
      if (n && t.mlb_team_id !== null && t.mlb_team_id !== undefined) map.set(n, Number(t.mlb_team_id));
    }
  }
  const aliases = await all(env.REF_DB, "SELECT team_id, mlb_team_id, alias_value, alias_normalized FROM ref_team_aliases WHERE active = 1");
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

async function loadCalendarRows(env, gamePks) {
  const ids = [...gamePks].filter(Boolean).map(Number);
  if (!ids.length) return new Map();
  const rows = [];
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    rows.push(...await all(env.TEAM_DB, `SELECT game_pk, official_date, game_time_utc, home_team_id, away_team_id, home_team_name, away_team_name, status_code, abstract_game_state, detailed_state, is_scheduled, is_pregame, is_live, is_final, is_postponed, is_suspended, is_cancelled FROM mlb_game_calendar WHERE game_pk IN (${placeholders(chunk.length)})`, ...chunk));
  }
  return new Map(rows.map(r => [Number(r.game_pk), r]));
}

async function loadRefPlayerHands(env, playerIds) {
  const ids = [...new Set(playerIds.filter(Boolean).map(Number))];
  const map = new Map();
  if (!ids.length) return map;
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    // D1 has a low bind-variable ceiling. This query binds the chunk twice
    // (player_id IN (...) OR mlb_player_id IN (...)), so keep chunks at 40
    // to stay safely below the observed limit.
    const rows = await all(env.REF_DB, `SELECT player_id, mlb_player_id, player_name, full_name, throws, throw_side FROM ref_players WHERE player_id IN (${placeholders(chunk.length)}) OR mlb_player_id IN (${placeholders(chunk.length)})`, ...chunk, ...chunk);
    for (const r of rows) {
      const hand = r.throw_side || r.throws || null;
      if (r.player_id !== null && r.player_id !== undefined) map.set(Number(r.player_id), { hand, name: r.full_name || r.player_name || null });
      if (r.mlb_player_id !== null && r.mlb_player_id !== undefined) map.set(Number(r.mlb_player_id), { hand, name: r.full_name || r.player_name || null });
    }
  }
  return map;
}

async function fetchPeopleHands(env, missingIds, counters) {
  const map = new Map();
  const ids = [...new Set(missingIds.filter(Boolean).map(Number))].slice(0, MAX_PEOPLE_FALLBACK_CALLS);
  if (!ids.length) return map;

  // Use the StatsAPI batch people endpoint. v0.1.1 used one request per player
  // and capped at 20, which left many prepared-board starters with missing hands
  // when REF_DB had null throw_side/throws. Batch lookup keeps calls low while
  // still filling every relevant starter we are allowed to inspect.
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

function collectStarterIdsForHandFill(relevantGames, actualMap, refHands) {
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

  const missing = [];
  for (const item of byId.values()) {
    if (!item.id) continue;
    if (item.sourceHand) continue;
    if (refHands.get(item.id)?.hand) continue;
    missing.push(item.id);
  }
  return missing;
}

async function fetchActualStarterMap(env, games, counters) {
  const out = new Map();
  const candidates = games.filter(g => statusIsLiveOrFinal(g)).slice(0, MAX_LIVE_FEED_CALLS);
  for (const game of candidates) {
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
      out.set(`${gamePk}:${side}`, {
        id,
        name: playerObj?.person?.fullName || null,
        hand: extractPitchHand(playerObj?.person) || extractPitchHand(playerObj)
      });
    }
  }
  return out;
}

function retentionWindow() {
  const today = todayPt();
  const tomorrow = addDays(today, 1);
  return { start: today, end: tomorrow, dates: [today, tomorrow], keepDates: new Set([today, tomorrow]) };
}

function buildWindow(_dateSet) {
  // Daily Starters is volatile daily context. It must only fetch/keep PT today + tomorrow.
  // Calendar/Game Status remains owned by the calendar/tally layer; this worker does not
  // need yesterday/+2 retention.
  const retention = retentionWindow();
  return { start: retention.start, end: retention.end, dates: retention.dates };
}

function filterPreparedRowsForRetention(rows, retention) {
  return (rows || []).filter(r => retention.keepDates.has(dateOnly(r.official_date || r.official_game_time_utc)));
}

async function pruneDateScopedDailyStarterTables(env, retention) {
  // Tables with direct date columns can be pruned before the new run writes fresh rows.
  await run(env.DAILY_DB, `DELETE FROM daily_starters_current WHERE official_date NOT IN (?, ?)`, retention.start, retention.end);
  await run(env.DAILY_DB, `DELETE FROM daily_starters_stage WHERE official_date NOT IN (?, ?)`, retention.start, retention.end);
  await run(env.DAILY_DB, `DELETE FROM daily_probable_pitchers WHERE slate_date NOT IN (?, ?)`, retention.start, retention.end);
}

async function pruneGameScopedDailyStarterTables(env, keepGamePks, batchId, retention) {
  const ids = [...new Set((keepGamePks || []).filter(Boolean).map(Number))];
  if (ids.length) {
    for (let i = 0; i < ids.length; i += 80) {
      const chunk = ids.slice(i, i + 80);
      // Use NOT IN once with the complete keep list when possible. With MLB today+tomorrow
      // this is normally <= 60 game_pks and below D1 variable limits.
      if (i === 0) {
        await run(env.DAILY_DB, `DELETE FROM daily_starters_snapshots WHERE game_pk IS NULL OR game_pk NOT IN (${placeholders(ids.length)})`, ...ids);
        await run(env.DAILY_DB, `DELETE FROM daily_starters_issues WHERE game_pk IS NULL OR game_pk NOT IN (${placeholders(ids.length)})`, ...ids);
      }
    }
  } else {
    await run(env.DAILY_DB, `DELETE FROM daily_starters_snapshots`);
    await run(env.DAILY_DB, `DELETE FROM daily_starters_issues`);
  }

  // Keep only today's/tomorrow's Daily Starters batches plus the active/current batch.
  // Old failed/null-window batches from earlier attempts are intentionally removed.
  await run(env.DAILY_DB, `DELETE FROM daily_starters_batches
    WHERE batch_id <> ?
      AND (
        window_start IS NULL
        OR window_end IS NULL
        OR window_start < ?
        OR window_start > ?
        OR window_end < ?
        OR window_end > ?
      )`,
    batchId, retention.start, retention.end, retention.start, retention.end);
}

function rowFromTeamSide({ game, calendar, side, previous, preparedTeamCount, actual, refHand, peopleHand, sourceEndpoint, snapshotAt }) {
  const gamePk = Number(game.gamePk);
  const teamObj = game?.teams?.[side]?.team || {};
  const oppSide = side === "away" ? "home" : "away";
  const oppObj = game?.teams?.[oppSide]?.team || {};
  const probable = game?.teams?.[side]?.probablePitcher || null;
  const note = probable?.note || "";
  const flags = noteFlags(note);
  const rawPitcherId = probable?.id ? Number(probable.id) : null;
  const actualId = actual?.id || null;
  const starterId = actualId || rawPitcherId || null;
  const ref = starterId ? refHand.get(starterId) : null;
  const person = starterId ? peopleHand.get(starterId) : null;
  const hand = actual?.hand || extractPitchHand(probable) || ref?.hand || person?.hand || null;
  const starterName = actual?.name || probable?.fullName || ref?.name || person?.name || null;
  const abs = String(game?.status?.abstractGameState || calendar?.abstract_game_state || "");
  const detail = String(game?.status?.detailedState || calendar?.detailed_state || "");
  const previousId = previous?.starter_player_id ? Number(previous.starter_player_id) : null;
  const previousName = previous?.starter_name || null;
  const pregame = statusIsPregame(game);
  const changed = !!(previousId && starterId && previousId !== starterId && pregame);
  const scratch = flags.scratch || changed;
  const tbd = !starterId;
  const unavailable = false;
  let starterStatus = "probable";
  let confidence = "MEDIUM_OFFICIAL_PROBABLE";

  if (actualId) {
    starterStatus = "actual_started";
    confidence = "HIGH_OFFICIAL_ACTUAL_STARTED";
  } else if (tbd) {
    starterStatus = "tbd";
    confidence = "LOW_TBD";
  } else if (flags.opener) {
    starterStatus = "opener_expected";
    confidence = "WARNING_OPENER_BULK_UNCLEAR";
  } else if (flags.bulk) {
    starterStatus = "bulk_unclear";
    confidence = "WARNING_OPENER_BULK_UNCLEAR";
  } else if (scratch) {
    starterStatus = "changed";
    confidence = "WARNING_CHANGED";
  }

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
    raw_json: safeString({ side, probablePitcher: probable, actualStarter: actual, note })
  };
}

async function insertIssue(env, batchId, row, issueType, severity, reason, details = {}) {
  await run(env.DAILY_DB, `INSERT INTO daily_starters_issues (issue_id, batch_id, game_pk, team_id, issue_status, issue_type, severity, reason, details_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    rid("daily_starters_issue"), batchId, row.game_pk || null, row.team_id || null, issueType, severity, reason, JSON.stringify(details));
}

async function writeStarterRows(env, batchId, rows, previousMap, counters) {
  for (const r of rows) {
    const stageId = rid("daily_starters_stage");
    await run(env.DAILY_DB, `INSERT INTO daily_starters_stage (
      stage_id, batch_id, current_key, source_key, source_endpoint, source_snapshot_at, game_pk, official_date, game_time_utc,
      team_id, team_name, opponent_team_id, opponent_team_name, is_home, starter_player_id, starter_name, starter_hand,
      starter_status, starter_confidence, source_status, game_status, abstract_game_state, detailed_state,
      previous_starter_player_id, previous_starter_name, change_detected, scratch_flag, opener_flag, bulk_pitcher_flag,
      tbd_flag, unavailable_flag, hand_missing_flag, prepared_board_relevant, prepared_board_pickable_rows, raw_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      stageId, batchId, r.current_key, r.source_key, r.source_endpoint, r.source_snapshot_at, r.game_pk, r.official_date, r.game_time_utc,
      r.team_id, r.team_name, r.opponent_team_id, r.opponent_team_name, r.is_home, r.starter_player_id, r.starter_name, r.starter_hand,
      r.starter_status, r.starter_confidence, r.source_status, r.game_status, r.abstract_game_state, r.detailed_state,
      r.previous_starter_player_id, r.previous_starter_name, r.change_detected, r.scratch_flag, r.opener_flag, r.bulk_pitcher_flag,
      r.tbd_flag, r.unavailable_flag, r.hand_missing_flag, r.prepared_board_relevant, r.prepared_board_pickable_rows, r.raw_json);

    const prev = previousMap.get(r.current_key);
    const firstSeen = prev?.first_seen_at || nowUtc();
    const changedAt = r.change_detected ? nowUtc() : (prev?.changed_at || null);

    await run(env.DAILY_DB, `INSERT OR REPLACE INTO daily_starters_current (
      current_key, batch_id, source_key, source_endpoint, source_snapshot_at, game_pk, official_date, game_time_utc,
      team_id, team_name, opponent_team_id, opponent_team_name, is_home, starter_player_id, starter_name, starter_hand,
      starter_status, starter_confidence, source_status, game_status, abstract_game_state, detailed_state,
      previous_starter_player_id, previous_starter_name, change_detected, scratch_flag, opener_flag, bulk_pitcher_flag,
      tbd_flag, unavailable_flag, hand_missing_flag, prepared_board_relevant, prepared_board_pickable_rows,
      first_seen_at, last_seen_at, changed_at, raw_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, COALESCE((SELECT created_at FROM daily_starters_current WHERE current_key=?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)`,
      r.current_key, batchId, r.source_key, r.source_endpoint, r.source_snapshot_at, r.game_pk, r.official_date, r.game_time_utc,
      r.team_id, r.team_name, r.opponent_team_id, r.opponent_team_name, r.is_home, r.starter_player_id, r.starter_name, r.starter_hand,
      r.starter_status, r.starter_confidence, r.source_status, r.game_status, r.abstract_game_state, r.detailed_state,
      r.previous_starter_player_id, r.previous_starter_name, r.change_detected, r.scratch_flag, r.opener_flag, r.bulk_pitcher_flag,
      r.tbd_flag, r.unavailable_flag, r.hand_missing_flag, r.prepared_board_relevant, r.prepared_board_pickable_rows,
      firstSeen, changedAt, r.raw_json, r.current_key);

    await run(env.DAILY_DB, `INSERT INTO daily_starters_snapshots (
      snapshot_id, batch_id, current_key, game_pk, team_id, starter_player_id, starter_name, starter_hand,
      starter_status, starter_confidence, source_status, source_key, source_endpoint, source_snapshot_at, raw_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      rid("daily_starters_snapshot"), batchId, r.current_key, r.game_pk, r.team_id, r.starter_player_id, r.starter_name, r.starter_hand,
      r.starter_status, r.starter_confidence, r.source_status, r.source_key, r.source_endpoint, r.source_snapshot_at, r.raw_json);

    counters.rows_written++;
    counters.snapshot_rows_written++;

    if (r.tbd_flag && r.prepared_board_relevant) await insertIssue(env, batchId, r, "starter_tbd", "blocking", "Prepared-board-relevant team has no probable/actual starter from official source.", { current_key: r.current_key });
    if (r.change_detected) await insertIssue(env, batchId, r, "starter_changed", "warning", "Starter player ID changed versus previous current snapshot before live/final state.", { previous_starter_player_id: r.previous_starter_player_id, starter_player_id: r.starter_player_id });
    if (r.scratch_flag) await insertIssue(env, batchId, r, "starter_scratch_or_change", "warning", "Scratch/change detected from note text or previous snapshot comparison.", { starter_status: r.starter_status });
    if (r.opener_flag) await insertIssue(env, batchId, r, "opener_expected", "warning", "Official note text indicates opener possibility.", {});
    if (r.bulk_pitcher_flag) await insertIssue(env, batchId, r, "bulk_unclear", "warning", "Official note text indicates bulk/follower/limited pitch-count possibility.", {});
    if (r.hand_missing_flag) await insertIssue(env, batchId, r, "starter_hand_missing", "warning", "Starter ID resolved but throw hand was not found in source/person hydrate/local REF lookup.", {});
  }
}

async function updateLegacyProbable(env, batchId, rows, counters) {
  const byGame = new Map();
  for (const r of rows) {
    const g = byGame.get(r.game_pk) || { game_pk: r.game_pk, slate_date: r.official_date, away_pitcher_id: null, home_pitcher_id: null, raw: [] };
    if (r.is_home) g.home_pitcher_id = r.starter_player_id || null;
    else g.away_pitcher_id = r.starter_player_id || null;
    g.raw.push({ team_id: r.team_id, starter_player_id: r.starter_player_id, starter_status: r.starter_status, starter_confidence: r.starter_confidence });
    byGame.set(r.game_pk, g);
  }
  for (const g of byGame.values()) {
    await run(env.DAILY_DB, `INSERT OR REPLACE INTO daily_probable_pitchers (game_key, slate_date, away_pitcher_id, home_pitcher_id, source_key, confidence, raw_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      String(g.game_pk), g.slate_date, g.away_pitcher_id, g.home_pitcher_id, SOURCE_KEY, "DAILY_STARTERS_COMPAT_V0_1", safeString({ batch_id: batchId, rows: g.raw }));
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
  const counters = {
    external_calls: 0,
    live_feed_games_checked: 0,
    rows_written: 0,
    snapshot_rows_written: 0,
    legacy_rows_written: 0
  };

  await ensureSchema(env);
  await run(env.DAILY_DB, `INSERT INTO daily_starters_batches (batch_id, request_id, run_id, job_key, worker_name, worker_version, mode, status, started_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    batchId, requestId, runId, JOB_KEY, WORKER_NAME, VERSION, mode, startedAt);

  let output = null;
  try {
    const retention = retentionWindow();
    await pruneDateScopedDailyStarterTables(env, retention);

    const rawPreparedRows = await loadPreparedRows(env);
    const preparedRows = filterPreparedRowsForRetention(rawPreparedRows, retention);
    const teamAliasMap = await loadTeamAliasMap(env);
    const prep = preparedMaps(preparedRows, teamAliasMap);
    const window = buildWindow(prep.dateSet);
    const endpoint = scheduleUrl(env, window.start, window.end);
    counters.external_calls++;
    const schedule = await fetchJson(endpoint, env);
    if (!schedule.ok) {
      output = {
        ok: false,
        data_ok: false,
        version: VERSION,
        worker_name: WORKER_NAME,
        job_key: JOB_KEY,
        status: "source_missing",
        certification: "DAILY_STARTERS_SOURCE_MISSING",
        batch_id: batchId,
        request_id: requestId,
        run_id: runId,
        source_endpoint: endpoint,
        source_error: schedule
      };
      await run(env.DAILY_DB, `UPDATE daily_starters_batches SET status='failed', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, external_calls=?, certification_status='DAILY_STARTERS_SOURCE_MISSING', certification_grade='SOURCE_FAIL', certification_reason='MLB schedule endpoint failed', output_json=? WHERE batch_id=?`,
        counters.external_calls, JSON.stringify(output), batchId);
      return jsonResponse(output, 502);
    }

    const games = [];
    for (const d of schedule.json?.dates || []) {
      for (const g of d.games || []) games.push(g);
    }
    const calendarMap = await loadCalendarRows(env, new Set(games.map(g => Number(g.gamePk)).filter(Boolean)));
    const relevantGames = games.filter(g => {
      const gp = Number(g.gamePk);
      return prep.gameSet.size ? prep.gameSet.has(gp) || calendarMap.has(gp) : true;
    });

    const probableIds = [];
    for (const g of relevantGames) {
      for (const side of ["away", "home"]) {
        const id = g?.teams?.[side]?.probablePitcher?.id;
        if (id) probableIds.push(Number(id));
      }
    }

    const actualMap = await fetchActualStarterMap(env, relevantGames, counters);
    const allStarterIds = [...probableIds];
    for (const actual of actualMap.values()) {
      if (actual?.id) allStarterIds.push(Number(actual.id));
    }
    const refHands = await loadRefPlayerHands(env, allStarterIds);
    const missingHandIds = collectStarterIdsForHandFill(relevantGames, actualMap, refHands);
    const peopleHands = await fetchPeopleHands(env, missingHandIds, counters);

    const previousRows = await all(env.DAILY_DB, "SELECT current_key, starter_player_id, starter_name, first_seen_at, changed_at FROM daily_starters_current");
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
        rows.push(rowFromTeamSide({
          game,
          calendar,
          side,
          previous: previousMap.get(currentKey),
          preparedTeamCount,
          actual,
          refHand: refHands,
          peopleHand: peopleHands,
          sourceEndpoint: endpoint,
          snapshotAt
        }));
      }
    }

    await run(env.DAILY_DB, "DELETE FROM daily_starters_stage WHERE batch_id = ?", batchId);
    await writeStarterRows(env, batchId, rows, previousMap, counters);
    await updateLegacyProbable(env, batchId, rows, counters);
    await pruneGameScopedDailyStarterTables(env, rows.map(r => r.game_pk), batchId, retention);

    const warningRows = rows.filter(r => r.change_detected || r.scratch_flag || r.opener_flag || r.bulk_pitcher_flag || r.hand_missing_flag || r.starter_status === "probable").length;
    const blockingRows = rows.filter(r => r.prepared_board_relevant && r.tbd_flag).length;
    const startersFound = rows.filter(r => r.starter_player_id).length;
    const tbd = rows.filter(r => r.tbd_flag).length;
    const changed = rows.filter(r => r.change_detected).length;
    const actualStarted = rows.filter(r => r.starter_status === "actual_started").length;

    const certification = blockingRows > 0 ? "DAILY_STARTERS_COMPLETED_WITH_BLOCKERS" : "DAILY_STARTERS_CERTIFIED_REFRESHED";
    const grade = blockingRows > 0 ? "WARN_BLOCKERS" : "PASS";

    output = {
      ok: true,
      data_ok: blockingRows === 0,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      status: "completed_daily_starters_refresh",
      certification,
      certification_grade: grade,
      batch_id: batchId,
      request_id: requestId,
      run_id: runId,
      window_start: window.start,
      window_end: window.end,
      retention_policy: "retain_only_pt_today_and_tomorrow",
      source_endpoint: endpoint,
      prepared_rows_read: preparedRows.length,
      raw_prepared_rows_seen_before_retention_filter: rawPreparedRows.length,
      prepared_games_checked: prep.gameSet.size,
      calendar_games_checked: calendarMap.size,
      schedule_games_seen: games.length,
      teams_checked: rows.length,
      starters_found: startersFound,
      starters_tbd: tbd,
      starters_changed: changed,
      actual_starters_found: actualStarted,
      warning_rows: warningRows,
      blocking_rows: blockingRows,
      rows_written: counters.rows_written,
      snapshot_rows_written: counters.snapshot_rows_written,
      legacy_rows_written: counters.legacy_rows_written,
      external_calls_performed: counters.external_calls,
      live_feed_games_checked: counters.live_feed_games_checked,
      no_board_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      status_model_note: "v0.1 does not emit confirmed. Pregame MLB probablePitcher remains probable until live/final boxscore proves actual_started."
    };

    await run(env.DAILY_DB, `UPDATE daily_starters_batches SET
      status='completed',
      window_start=?,
      window_end=?,
      prepared_games_checked=?,
      prepared_rows_read=?,
      calendar_games_checked=?,
      schedule_games_seen=?,
      live_feed_games_checked=?,
      teams_checked=?,
      starters_found=?,
      starters_tbd=?,
      starters_changed=?,
      actual_starters_found=?,
      warning_rows=?,
      blocking_rows=?,
      rows_written=?,
      snapshot_rows_written=?,
      legacy_rows_written=?,
      external_calls=?,
      certification_status=?,
      certification_grade=?,
      certification_reason=?,
      output_json=?,
      completed_at=CURRENT_TIMESTAMP,
      updated_at=CURRENT_TIMESTAMP
      WHERE batch_id=?`,
      window.start, window.end, prep.gameSet.size, preparedRows.length, calendarMap.size, games.length, counters.live_feed_games_checked, rows.length,
      startersFound, tbd, changed, actualStarted, warningRows, blockingRows, counters.rows_written, counters.snapshot_rows_written,
      counters.legacy_rows_written, counters.external_calls, certification, grade,
      blockingRows > 0 ? "Prepared-board-relevant starters still TBD or blocked." : "Daily starters refreshed from official MLB StatsAPI without prepared-board starter blockers.",
      JSON.stringify(output), batchId);

    return jsonResponse(output);
  } catch (err) {
    output = {
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      status: "daily_starters_exception",
      certification: "DAILY_STARTERS_EXCEPTION",
      batch_id: batchId,
      request_id: requestId,
      run_id: runId,
      error: String(err && err.stack ? err.stack : err)
    };
    await run(env.DAILY_DB, `UPDATE daily_starters_batches SET status='failed', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, external_calls=?, certification_status='DAILY_STARTERS_EXCEPTION', certification_grade='FAIL', certification_reason=?, output_json=? WHERE batch_id=?`,
      counters.external_calls, String(err && err.message ? err.message : err).slice(0, 900), JSON.stringify(output), batchId);
    return jsonResponse(output, 500);
  }
}

function health(env) {
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "DAILY_STARTERS_WORKER_READY",
    timestamp_utc: nowUtc(),
    bindings: {
      CONTROL_DB: !!env.CONTROL_DB,
      CONFIG_DB: !!env.CONFIG_DB,
      REF_DB: !!env.REF_DB,
      TEAM_DB: !!env.TEAM_DB,
      DAILY_DB: !!env.DAILY_DB,
      SCORE_DB: !!env.SCORE_DB
    },
    source_strategy: {
      primary: "MLB StatsAPI schedule hydrate=probablePitcher(note,person)",
      secondary: "MLB StatsAPI live feed only for Live/Final actual_started verification",
      no_paid_sources: true,
      no_html_scraping: true,
      no_confirmed_status_in_v0_1: true,
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
    if (method === "POST" && path === "/run") return await runDailyStarters(request, env);

    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "not_found", path }, 404);
  }
};
