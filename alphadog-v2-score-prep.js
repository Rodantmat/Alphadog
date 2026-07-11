const WORKER_NAME = "alphadog-v2-score-prep";
const VERSION = "alphadog-v2-score-prep-v0.2.20-fast-finalize-after-db-truth";
const JOB_KEY = "score-prep";
const SOURCE_PRIZEPICKS = "prizepicks";
const SOURCE_PRIZEPICKS_ALIAS_FALLBACK = "prizepicks_github";
const SOURCE_SLEEPER = "sleeper";
const SOURCE_UNDERDOG = "parlay_underdog";
const INSERT_CHUNK_SIZE = 75;
const WRITE_ROWS_PER_INVOCATION = 20000; // v0.2.19: Score Prep is proven to finish ~5-8k rows inside service-binding budget; disable chunk resume race.

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

function dateOnly(d) {
  return d.toISOString().slice(0, 10);
}

function ptTodayTomorrow() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const m = {};
  for (const part of parts) m[part.type] = part.value;
  const today = `${m.year}-${m.month}-${m.day}`;
  const noonPt = new Date(`${today}T12:00:00-07:00`);
  noonPt.setDate(noonPt.getDate() + 1);
  return [today, dateOnly(noonPt)];
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

function stableKeyComponent(v) {
  const s = safeStr(v);
  if (!s) return "na";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._:-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96) || "na";
}

function stableLineComponent(v) {
  if (v === undefined || v === null || v === "") return "na";
  const n = Number(v);
  if (Number.isFinite(n)) return String(n).replace(/\./g, "p");
  return stableKeyComponent(v);
}

function makePreparedRowId({ sourceKey, sourceRowId, sourceEventId, playerName, propKey, lineValue, sourcePropName }) {
  // v0.2.4: source_line_id/current_row_id can collide across source universes or market variants.
  // Use a stable composite identity so valid Sleeper/PrizePicks line variants are preserved,
  // and final DB counts match certification counts instead of being distorted by INSERT OR REPLACE.
  return [
    stableKeyComponent(sourceKey),
    stableKeyComponent(sourceEventId),
    stableKeyComponent(sourceRowId),
    stableKeyComponent(playerName),
    stableKeyComponent(propKey || sourcePropName),
    stableLineComponent(lineValue)
  ].join("|");
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

function normalizeNameWithoutSuffix(v) {
  const suffixTokens = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
  const parts = normalizeName(v).split(" ").filter(Boolean);
  while (parts.length > 1 && suffixTokens.has(parts[parts.length - 1])) parts.pop();
  return parts.join(" ");
}

function normalizeTeam(v) {
  return normalizeName(v);
}

function isComboMarketRow({ playerName, propKey, payloadJson, rawJson }) {
  const player = safeStr(playerName);
  const prop = safeStr(propKey);
  const payload = safeJsonParse(payloadJson, {});
  const raw = safeJsonParse(rawJson, {});
  const eventType = normalizeName(payload.event_type || raw.event_type);
  return eventType === "combo" || player.includes(" + ") || prop === "1st_inning_runs_allowed";
}

function classifyCalendarNoMatch(calendar, officialDate, rawHome, rawAway) {
  const date = safeStr(officialDate);
  const home = normalizeTeam(rawHome);
  const away = normalizeTeam(rawAway);
  if (!calendar || !calendar.teamDateMap || !date || !home || !away) return "no_calendar_match";

  const dates = [dateAddDays(date, -1), date, dateAddDays(date, 1), dateAddDays(date, 2)];
  let homeSeen = false;
  let awaySeen = false;
  for (const d of dates) {
    if ((calendar.teamDateMap.get(`${d}|${home}`) || []).length) homeSeen = true;
    if ((calendar.teamDateMap.get(`${d}|${away}`) || []).length) awaySeen = true;
  }
  if (homeSeen && awaySeen) return "source_event_calendar_mismatch";
  return "no_calendar_match";
}

function teamNameAliasesForReference(rec) {
  // v0.2.6: Keep team aliases narrow and explicit. This is not fuzzy matching.
  // It fixes official/source naming drift such as MLB calendar "Athletics" vs
  // source payload "Oakland Athletics" without creating unsafe broad matches.
  const aliases = new Set();
  const add = (v) => {
    const n = normalizeTeam(v);
    if (n) aliases.add(n);
  };

  for (const v of [
    rec.full_name,
    rec.nickname,
    rec.short_name,
    rec.location_name,
    rec.team_code,
    rec.file_code,
    rec.abbreviation
  ]) add(v);

  const full = normalizeTeam(rec.full_name);
  const nick = normalizeTeam(rec.nickname);
  const shortName = normalizeTeam(rec.short_name);
  const abbr = safeStr(rec.abbreviation).toUpperCase();

  if (abbr === "ATH" || full === "athletics" || full === "oakland athletics" || nick === "athletics" || shortName === "athletics") {
    add("Athletics");
    add("Oakland Athletics");
  }

  return Array.from(aliases);
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

function propAliasLookupKeys(sourceKey, marketName) {
  const n = normalizeName(marketName);
  if (!sourceKey || !n) return [];
  const sourceKeys = [sourceKey];

  // v0.2.10: Prepared rows intentionally emit source_key=prizepicks, but
  // REF_DB.ref_prop_aliases stores PrizePicks prop aliases under
  // source_key=prizepicks_github. Use this only for alias lookup; do not
  // change the emitted prepared source_key.
  if (sourceKey === SOURCE_PRIZEPICKS) sourceKeys.push(SOURCE_PRIZEPICKS_ALIAS_FALLBACK);

  return sourceKeys.map(src => `${src}|${n}`);
}

function lookupPropAlias(ref, sourceKey, marketName) {
  if (!ref || !ref.propAliasMap) return null;
  for (const key of propAliasLookupKeys(sourceKey, marketName)) {
    const propKey = ref.propAliasMap.get(key);
    if (propKey) return propKey;
  }
  return null;
}

function propKeyPrizePicks(statType, ref = null) {
  const aliasKey = lookupPropAlias(ref, SOURCE_PRIZEPICKS, statType);
  if (aliasKey) return aliasKey;

  const n = normalizeName(statType);
  const map = new Map([
    ["hits", "hits"],
    ["hitter hits", "hits"],
    ["singles", "singles"],
    ["doubles", "doubles"],
    ["triples", "triples"],
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
    ["stolen bases", "stolen_bases"],
    ["plate appearances", "plate_appearances"],
    ["hitter plate appearances", "plate_appearances"],
    ["batter plate appearances", "plate_appearances"],
    ["pitches thrown", "pitches_thrown"],
    ["pitcher pitches thrown", "pitches_thrown"],
    ["pitch count", "pitches_thrown"],
    ["pitcher pitch count", "pitches_thrown"]
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

function limitText(v, max = 900) {
  const s = v === undefined || v === null ? "" : String(v);
  return s.length > max ? s.slice(0, max) : s;
}

function safeJson(v, max = 9000) {
  let text = "{}";
  try { text = JSON.stringify(v == null ? {} : v); } catch (_) { text = JSON.stringify({ serialization_error: true }); }
  return text.length > max ? text.slice(0, max) : text;
}

async function controlLog(env, input, level, eventKey, message, data = {}) {
  if (!env || !env.CONTROL_DB || !input || !input.request_id) return;
  try {
    await env.CONTROL_DB.prepare(`INSERT INTO control_worker_run_log (request_id, run_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
      .bind(String(input.request_id || ""), input.run_id || null, WORKER_NAME, JOB_KEY, level, eventKey, limitText(message, 900), safeJson(data, 9000))
      .run();
  } catch (_) {}
}

async function controlRunHeartbeat(env, input, statusText, rowsRead = 0, rowsWritten = 0, extra = {}) {
  if (!env || !env.CONTROL_DB || !input || !input.request_id) return;
  try {
    await env.CONTROL_DB.prepare(`UPDATE control_job_runs SET status=CASE WHEN status='running' THEN 'running' ELSE status END, data_ok=0, certification_status=?, rows_read=?, rows_written=?, output_json=COALESCE(output_json, ?), error_code=NULL, error_message=NULL WHERE request_id=? AND finished_at IS NULL`)
      .bind(statusText, Number(rowsRead || 0), Number(rowsWritten || 0), safeJson({ ok: true, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: statusText, ...extra }, 9000), String(input.request_id || ""))
      .run();
  } catch (_) {}
}

async function markPrepBatchRunning(env, batchId, input, startedAt) {
  await ensureScoreTables(env);
  await env.SCORE_DB.prepare(`INSERT OR REPLACE INTO score_board_prep_batches (
    batch_id, worker_name, worker_version, mode, status, certification_status, certification_grade,
    prizepicks_rows, sleeper_rows, prepared_rows, pickable_safe_rows, blocked_rows,
    unresolved_player_rows, matchup_unresolved_rows, started_rows, source_json, certification_json,
    started_at, finished_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?, ?, ?, NULL, CURRENT_TIMESTAMP)`)
    .bind(
      batchId,
      WORKER_NAME,
      VERSION,
      "board_prep_enrichment",
      "RUNNING_BOARD_PREP_ENRICHMENT",
      "SCORE_BOARD_PREP_ENRICHMENT_RUNNING_CHECKPOINTED",
      "RUNNING",
      safeJson({ request_id: input.request_id || null, chain_id: input.chain_id || null, checkpoint: "started", preserve_current_until_verified: true }, 9000),
      safeJson({ checkpoint: "started", preserve_current_until_verified: true }, 9000),
      startedAt
    )
    .run();
}

async function updatePrepBatchCheckpoint(env, batchId, status, certificationStatus, data = {}) {
  try {
    await env.SCORE_DB.prepare(`UPDATE score_board_prep_batches SET status=?, certification_status=?, certification_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`)
      .bind(status, certificationStatus, safeJson(data, 9000), batchId)
      .run();
  } catch (_) {}
}

async function recoverResumeBatchForRequest(env, input) {
  const requestId = input && input.request_id ? String(input.request_id) : "";
  if (!requestId) return null;
  try {
    const row = await firstRow(env.SCORE_DB, `
SELECT
  b.batch_id,
  COUNT(s.stage_row_id) AS stage_rows,
  MAX(s.updated_at) AS max_stage_updated_at,
  MAX(b.updated_at) AS batch_updated_at
FROM score_board_prep_batches b
LEFT JOIN score_board_prepared_stage s ON s.prep_batch_id = b.batch_id
WHERE b.worker_name = ?
  AND b.status IN ('PARTIAL_CONTINUE_BOARD_PREP_WRITE','PREPARED_ROWS_BUILT','RUNNING_BOARD_PREP_ENRICHMENT','PARTIAL_CONTINUE_BOARD_PREP_PROMOTE')
  AND b.source_json LIKE ?
GROUP BY b.batch_id
HAVING COUNT(s.stage_row_id) > 0
ORDER BY COUNT(s.stage_row_id) DESC, MAX(s.updated_at) DESC, MAX(b.updated_at) DESC
LIMIT 1`, [WORKER_NAME, `%${requestId}%`]);
    if (!row || !row.batch_id) return null;
    return { batch_id: row.batch_id, stage_rows: Number(row.stage_rows || 0), max_stage_updated_at: row.max_stage_updated_at || null };
  } catch (_) {
    return null;
  }
}

async function ensureScoreTables(env) {
  // v0.2.2: Use separate D1 prepare().run() statements instead of one multi-statement exec().
  // The v0.2.1 worker failed before prep because D1 received an incomplete CREATE TABLE statement.
  await env.SCORE_DB.prepare(`
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
  underdog_rows INTEGER DEFAULT 0,
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
)`).run();

  // v0.2.21: safe migration for the already-existing production table. CREATE TABLE IF NOT
  // EXISTS above is a no-op once the table already exists, so a new column must be added
  // explicitly. Check first via PRAGMA rather than assuming ALTER TABLE is safe to run blind.
  try {
    const existingCols = await allRows(env.SCORE_DB, "PRAGMA table_info(score_board_prep_batches)");
    const hasUnderdogCol = existingCols.some(c => String(c.name) === "underdog_rows");
    if (!hasUnderdogCol) {
      await env.SCORE_DB.prepare("ALTER TABLE score_board_prep_batches ADD COLUMN underdog_rows INTEGER DEFAULT 0").run();
    }
  } catch (_) { /* best-effort migration guard; ensureScoreTables is called on every run */ }

  await env.SCORE_DB.prepare(`
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
)`).run();

  await env.SCORE_DB.prepare(`
CREATE TABLE IF NOT EXISTS score_board_prepared_stage (
  stage_row_id TEXT PRIMARY KEY,
  prepared_row_id TEXT NOT NULL,
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
)`).run();

  await env.SCORE_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_score_board_prepared_stage_batch ON score_board_prepared_stage(prep_batch_id)`).run();
  await env.SCORE_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_score_board_prepared_stage_batch_source ON score_board_prepared_stage(prep_batch_id, source_key)`).run();

  await env.SCORE_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_score_board_prepared_current_source ON score_board_prepared_current(source_key, pickable_safe)`).run();
  await env.SCORE_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_score_board_prepared_current_game ON score_board_prepared_current(official_date, official_game_pk)`).run();
  await env.SCORE_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_score_board_prepared_current_player_prop ON score_board_prepared_current(resolved_mlb_player_id, canonical_prop_key)`).run();
}

async function loadReference(env) {
  const [teams, teamAliases, players, rosters, aliases, propAliases] = await Promise.all([
    allRows(env.REF_DB, "SELECT team_id, mlb_team_id, abbreviation, full_name, nickname, location_name, short_name, team_code, file_code, active FROM ref_teams WHERE active=1"),
    allRows(env.REF_DB, "SELECT alias_value, alias_normalized, team_id, mlb_team_id, alias_type, confidence, active FROM ref_team_aliases WHERE active=1"),
    allRows(env.REF_DB, "SELECT player_id, mlb_player_id, full_name, player_name, current_team_id, current_mlb_team_id, primary_position, active FROM ref_players WHERE active=1"),
    allRows(env.REF_DB, "SELECT player_id, mlb_team_id, team_id, player_name, position_abbreviation, roster_status, role, active, updated_at FROM ref_rosters WHERE active=1"),
    allRows(env.REF_DB, "SELECT alias_name, alias_normalized, player_id, confidence, alias_type, team_id, mlb_team_id, active FROM ref_player_aliases WHERE active=1"),
    allRows(env.REF_DB, "SELECT prop_key, source_key, source_market_name, normalized_market_name FROM ref_prop_aliases")
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
    for (const n of teamNameAliasesForReference(rec)) {
      teamByFull.set(n, rec);
    }
  }

  for (const a of teamAliases) {
    const mlbId = Number(a.mlb_team_id || 0);
    const rec = teamByMlbId.get(mlbId);
    if (!rec) continue;
    const aliasValue = normalizeTeam(a.alias_value);
    const aliasNormalized = normalizeTeam(a.alias_normalized);
    if (aliasValue) teamByFull.set(aliasValue, rec);
    if (aliasNormalized) teamByFull.set(aliasNormalized, rec);
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
  const suffixAliasMap = new Map();
  function addToMap(map, key, playerId) {
    const pid = Number(playerId);
    if (!key || !pid) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(pid);
  }
  function addAlias(alias, playerId) {
    const key = normalizeName(alias);
    const suffixKey = normalizeNameWithoutSuffix(alias);
    addToMap(aliasMap, key, playerId);
    addToMap(suffixAliasMap, suffixKey, playerId);
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

  const propAliasMap = new Map();
  for (const a of propAliases) {
    const propKey = safeStr(a.prop_key);
    const sourceKey = safeStr(a.source_key);
    if (!propKey || !sourceKey) continue;
    for (const name of [a.source_market_name, a.normalized_market_name]) {
      const n = normalizeName(name);
      if (n) propAliasMap.set(`${sourceKey}|${n}`, propKey);
    }
  }

  return { teams, teamAliases, players, aliases, propAliases, propAliasMap, teamByMlbId, teamByAbbr, teamByFull, playerById, aliasMap, suffixAliasMap };
}

async function loadCalendar(env, dateSet, ref) {
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
  const teamDateMap = new Map();
  function addTeamDate(key, rec) {
    if (!teamDateMap.has(key)) teamDateMap.set(key, []);
    const list = teamDateMap.get(key);
    if (!list.some(x => Number(x.game_pk) === Number(rec.game_pk))) list.push(rec);
  }

  function add(key, rec) {
    if (!pairMap.has(key)) pairMap.set(key, []);
    const list = pairMap.get(key);
    if (!list.some(x => Number(x.game_pk) === Number(rec.game_pk))) list.push(rec);
  }

  function aliasesForCalendarTeamName(name) {
    const aliases = new Set();
    const raw = normalizeTeam(name);
    if (raw) aliases.add(raw);

    // v0.2.7: Calendar/source team names drift. Example: MLB calendar now uses
    // "Athletics" while Parlay/Sleeper can still emit "Oakland Athletics".
    // Use the REF team alias library to generate exact alias keys for the same
    // MLB team. This is deterministic alias expansion, not fuzzy matching.
    const team = ref && ref.teamByFull ? ref.teamByFull.get(raw) : null;
    if (team) {
      for (const a of teamNameAliasesForReference(team)) aliases.add(a);
    }

    // Conservative hard aliases for known MLB naming drift that may not be
    // represented in older REF team rows.
    if (raw === "athletics" || raw === "oakland athletics") {
      aliases.add("athletics");
      aliases.add("oakland athletics");
    }
    return Array.from(aliases).filter(Boolean);
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

    const homeAliases = aliasesForCalendarTeamName(rec.home_team_name);
    const awayAliases = aliasesForCalendarTeamName(rec.away_team_name);
    for (const h of homeAliases) addTeamDate(`${rec.official_date}|${h}`, rec);
    for (const a of awayAliases) addTeamDate(`${rec.official_date}|${a}`, rec);
    for (const h of homeAliases) {
      for (const a of awayAliases) {
        add(`${rec.official_date}|${h}|${a}`, { ...rec, orientation: "exact" });
        add(`${rec.official_date}|${a}|${h}`, { ...rec, orientation: "reversed" });
      }
    }
  }

  return { rows, pairMap, teamDateMap };
}

function resolveCalendarByTeamNames(calendar, officialDate, rawHome, rawAway, sourceStartTime) {
  const date = safeStr(officialDate);
  const home = normalizeTeam(rawHome);
  const away = normalizeTeam(rawAway);
  if (!date || !home || !away) {
    return { status: "calendar_unresolved", confidence: "missing_team_pair_or_date", game: null };
  }
  const candidates = calendar.pairMap.get(`${date}|${home}|${away}`) || [];
  if (candidates.length === 0) {
    return { status: "calendar_unresolved", confidence: classifyCalendarNoMatch(calendar, date, rawHome, rawAway), game: null };
  }
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

function gameTeamFilter(ref, candidates, game) {
  if (!game || !candidates.length) return { filtered: candidates, allowed_team_ids: [] };
  const homeTeam = ref.teamByFull.get(normalizeTeam(game.home_team_name));
  const awayTeam = ref.teamByFull.get(normalizeTeam(game.away_team_name));
  const allowed = new Set([homeTeam && homeTeam.mlb_team_id, awayTeam && awayTeam.mlb_team_id].filter(Boolean).map(Number));
  if (!allowed.size) return { filtered: candidates, allowed_team_ids: [] };
  const filtered = candidates.filter(p => allowed.has(Number(p.current_mlb_team_id)));
  return { filtered, allowed_team_ids: Array.from(allowed) };
}

function resolvePlayer(ref, playerName, game) {
  const key = normalizeName(playerName);
  const exactIds = Array.from(ref.aliasMap.get(key) || []);

  if (exactIds.length > 0) {
    const exactCandidates = exactIds.map(id => ref.playerById.get(id)).filter(Boolean);
    const filteredResult = gameTeamFilter(ref, exactCandidates, game);
    const candidates = game && filteredResult.filtered.length > 0 ? filteredResult.filtered : exactCandidates;

    if (game && filteredResult.allowed_team_ids.length && filteredResult.filtered.length === 0) {
      // v0.2.7: Exact-name matching can hit the wrong same-name player first
      // (for example a pitcher named Luis Garcia when the board row is a hitter
      // on one of the game's teams). Before hard-blocking, retry the suffix-flex
      // alias family under the official game-team filter. This preserves safety:
      // only one game-team candidate is accepted.
      const suffixKeyForWrongExact = normalizeNameWithoutSuffix(playerName);
      const suffixIdsForWrongExact = Array.from(ref.suffixAliasMap.get(suffixKeyForWrongExact) || []);
      if (suffixIdsForWrongExact.length > 0) {
        const suffixCandidatesForWrongExact = suffixIdsForWrongExact.map(id => ref.playerById.get(id)).filter(Boolean);
        const suffixFilteredForWrongExact = gameTeamFilter(ref, suffixCandidatesForWrongExact, game).filtered;
        if (suffixFilteredForWrongExact.length === 1) {
          return {
            status: "matched",
            confidence: "suffix_flex_game_team_over_wrong_exact",
            player: suffixFilteredForWrongExact[0],
            candidate_count: suffixIdsForWrongExact.length
          };
        }
      }

      // v0.2.6: exact name alone is not enough to make a row mineable.
      // Return the unique candidate, if it exists, so the downstream side check can
      // hard-block as player_team_conflict with useful evidence instead of pretending
      // the row is unresolved. Do not make it pickable.
      if (exactCandidates.length === 1) {
        return {
          status: "matched",
          confidence: "exact_name_wrong_game_team_blocked",
          player: exactCandidates[0],
          candidate_count: exactIds.length
        };
      }
      return {
        status: "ambiguous",
        confidence: "ambiguous_exact_name_no_game_team_match",
        player: null,
        candidate_count: exactCandidates.length || exactIds.length
      };
    }

    if (candidates.length === 1) {
      return {
        status: "matched",
        confidence: game && filteredResult.filtered.length === 1 ? "exact_name_game_team" : "exact_name",
        player: candidates[0],
        candidate_count: exactIds.length
      };
    }
    return { status: "ambiguous", confidence: "ambiguous_exact_name", player: null, candidate_count: exactCandidates.length || exactIds.length };
  }

  // Sleeper often omits legal display suffixes while REF/MLB keeps them:
  // Bobby Witt -> Bobby Witt Jr.; Jazz Chisholm -> Jazz Chisholm Jr.;
  // Michael Harris -> Michael Harris II; Fernando Tatis -> Fernando Tatis Jr.
  // This fallback is intentionally conservative: it only accepts one active
  // candidate, and with an official game it must belong to one of the two teams.
  const suffixKey = normalizeNameWithoutSuffix(playerName);
  const suffixIds = Array.from(ref.suffixAliasMap.get(suffixKey) || []);
  if (suffixIds.length > 0) {
    const suffixCandidates = suffixIds.map(id => ref.playerById.get(id)).filter(Boolean);
    const filteredResult = gameTeamFilter(ref, suffixCandidates, game);
    const candidates = game ? filteredResult.filtered : suffixCandidates;

    if (candidates.length === 1) {
      return {
        status: "matched",
        confidence: game ? "suffix_flex_game_team" : "suffix_flex_unique",
        player: candidates[0],
        candidate_count: suffixIds.length
      };
    }
    if (candidates.length > 1) {
      return { status: "ambiguous", confidence: "ambiguous_suffix_flex", player: null, candidate_count: candidates.length };
    }
    return {
      status: "unresolved",
      confidence: game ? "suffix_flex_no_game_team_match" : "suffix_flex_no_unique_match",
      player: null,
      candidate_count: suffixIds.length
    };
  }

  return { status: "unresolved", confidence: "no_alias_match", player: null, candidate_count: 0 };
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

  if (calendarResolution && calendarResolution.block_reason) {
    reasons.push(calendarResolution.block_reason);
  } else if (calendarResolution.status === "calendar_unresolved") {
    reasons.push(calendarResolution.confidence === "source_event_calendar_mismatch" ? "source_event_calendar_mismatch" : "calendar_match_unresolved");
  } else if (calendarResolution.status === "calendar_ambiguous") {
    reasons.push("calendar_match_ambiguous");
  } else if (calendarResolution.status === "unsupported") {
    reasons.push(calendarResolution.confidence || "calendar_unsupported");
  }

  if (playerResolution && playerResolution.block_reason) {
    reasons.push(playerResolution.block_reason);
  } else if (playerResolution.status === "unresolved") {
    reasons.push((playerResolution.candidate_count || 0) === 0 ? "player_ref_missing" : "player_unresolved");
  } else if (playerResolution.status === "ambiguous") {
    reasons.push("player_ambiguous");
  } else if (playerResolution.status === "unsupported") {
    reasons.push(playerResolution.confidence || "player_unsupported");
  }

  if (side.conflict) reasons.push("player_team_conflict");
  if (game && startedByOfficialTime(game, now)) reasons.push("started_or_expired_by_official_time");
  return Array.from(new Set(reasons));
}

function preparedRowBase({ batchId, sourceKey, sourceRowId, sourceEventId, projectionId, playerName, propKey, sourcePropName, lineValue, sourceStartTime, sourcePickable, rawJson, payloadJson, calendarResolution, playerResolution, side, now }) {
  const game = calendarResolution.game || null;
  const blockReasons = buildBlockReasons({ sourcePickable, sourceKey, calendarResolution, playerResolution, side, game, now });
  const pickableSafe = blockReasons.length === 0 ? 1 : 0;
  const sourceTimeStatus = game
    ? (sourceKey === SOURCE_SLEEPER || sourceKey === SOURCE_UNDERDOG ? "source_time_replaced_by_calendar" : "source_time_verified_by_calendar")
    : (sourceStartTime ? "source_time_unverified" : "source_time_missing");
  const startTimeConfidence = game ? "official_calendar" : (sourceStartTime ? "source_time_only_unverified" : "missing_time");
  const matchupStatus = calendarResolution.status;

  return {
    prepared_row_id: makePreparedRowId({ sourceKey, sourceRowId, sourceEventId, playerName, propKey, lineValue, sourcePropName }),
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
  const underdogRows = await allRows(env.MARKET_DB, "SELECT * FROM underdog_board_current");
  return { prizepicksRows, sleeperRows, underdogRows };
}

function collectCalendarDates(prizepicksRows, sleeperRows, underdogRows) {
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
  for (const r of underdogRows || []) {
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
    const propKey = propKeyPrizePicks(r.stat_type, ref);
    const comboMarket = isComboMarketRow({ playerName, propKey, payloadJson: r.row_payload_json, rawJson: r.raw_projection_json });
    const officialDate = dateOnlyFromAnyTime(r.start_time);
    const teamAbbr = safeStr(r.team);
    const opponentAbbr = safeStr(r.opponent || r.description);
    const cal = comboMarket
      ? { status: "unsupported", confidence: "combo_market_unsupported", block_reason: "combo_market_unsupported", game: null }
      : resolveCalendarByAbbrPair(calendar, ref, officialDate, teamAbbr, opponentAbbr, r.start_time);
    const playerId = Number(r.player_id || 0);
    let playerRes;
    if (comboMarket) {
      playerRes = { status: "unsupported", confidence: "combo_market_unsupported", block_reason: "combo_market_unsupported", player: null, candidate_count: 0 };
    } else if (playerId) {
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
      propKey,
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

function isPitcherPrimaryPosition(player) {
  const pos = normalizeName(player && player.primary_position);
  return pos === "p" || pos === "pitcher" || pos.includes("pitcher");
}

function sleeperPreparedPropKeyForResolvedPlayer({ rawPropKey, sourcePropName, rawMarketKey, player }) {
  const prop = safeStr(rawPropKey);
  const source = safeStr(sourcePropName || rawMarketKey);
  const sourceNorm = source.toLowerCase();

  if (["player_plate_appearances", "plate_appearances", "player_batter_plate_appearances", "batter_plate_appearances"].includes(sourceNorm)) {
    return "plate_appearances";
  }
  if (["player_pitches_thrown", "pitches_thrown", "player_pitch_count", "pitch_count", "pitcher_pitch_count"].includes(sourceNorm)) {
    return "pitches_thrown";
  }

  // Sleeper/Parlay can emit pitcher walk props as generic player_walks/walks.
  // Hitter walk props are source-distinct as player_bat_walks and must remain walks.
  // Once the player is resolved as a pitcher, player_walks is pitcher walks allowed.
  if (prop === "walks" && sourceNorm === "player_walks" && isPitcherPrimaryPosition(player)) {
    return "walks_allowed";
  }
  return prop;
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

    const sleeperSourcePropName = safeStr(r.source_stat_name || raw.market_key || raw.market);
    const sleeperPropKey = sleeperPreparedPropKeyForResolvedPlayer({
      rawPropKey: safeStr(r.canonical_prop_key || raw.market),
      sourcePropName: sleeperSourcePropName,
      rawMarketKey: raw.market_key,
      player: playerRes.player
    });

    if (sleeperPropKey !== safeStr(r.canonical_prop_key || raw.market)) {
      mergedPayload.canonical_prop_role_remap = {
        from: safeStr(r.canonical_prop_key || raw.market),
        to: sleeperPropKey,
        reason: "sleeper_player_walks_resolved_pitcher_to_walks_allowed",
        source_market_key: sleeperSourcePropName,
        resolved_player_primary_position: playerRes.player ? playerRes.player.primary_position : null
      };
    }

    out.push(preparedRowBase({
      batchId,
      sourceKey: SOURCE_SLEEPER,
      sourceRowId: sourceKeyForRow(SOURCE_SLEEPER, r),
      sourceEventId: safeStr(r.source_event_id || raw.event_id),
      projectionId: null,
      playerName,
      propKey: sleeperPropKey,
      sourcePropName: sleeperSourcePropName,
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

function prepareUnderdogRows(rows, ref, calendar, batchId, now) {
  const out = [];
  for (const r of rows) {
    const raw = safeJsonParse(r.raw_line_json, {});
    const payload = safeJsonParse(r.row_payload_json, {});
    const rawHome = safeStr(raw.home_team || payload.home_team);
    const rawAway = safeStr(raw.away_team || payload.away_team);
    const rawDate = safeStr(raw.game_date) || dateOnlyFromAnyTime(raw.commence_time || r.start_time);
    const rawCommence = safeStr(raw.commence_time || r.start_time);

    // Same reasoning as Sleeper: Underdog's commence_time (via the same ParlayAPI structure)
    // can be a provider placeholder. Calendar grounding must use official_date + raw team pair,
    // then replace source time with the internal MLB calendar time.
    const cal = resolveCalendarByTeamNames(calendar, rawDate, rawHome, rawAway, null);
    const playerName = safeStr(r.player_name || raw.player);
    const playerRes = resolvePlayer(ref, playerName, cal.game);
    const side = teamSideForPlayer(ref, playerRes.player, cal.game);

    const mergedPayload = {
      ...(payload || {}),
      source_key: "parlay_underdog",
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
      bookmaker: raw.bookmaker || "underdog",
      bookmaker_title: raw.bookmaker_title || "Underdog",
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

    const underdogSourcePropName = safeStr(r.source_stat_name || raw.market_key || raw.market);
    const underdogPropKey = sleeperPreparedPropKeyForResolvedPlayer({
      rawPropKey: safeStr(r.canonical_prop_key || raw.market),
      sourcePropName: underdogSourcePropName,
      rawMarketKey: raw.market_key,
      player: playerRes.player
    });

    if (underdogPropKey !== safeStr(r.canonical_prop_key || raw.market)) {
      mergedPayload.canonical_prop_role_remap = {
        from: safeStr(r.canonical_prop_key || raw.market),
        to: underdogPropKey,
        reason: "underdog_player_walks_resolved_pitcher_to_walks_allowed",
        source_market_key: underdogSourcePropName,
        resolved_player_primary_position: playerRes.player ? playerRes.player.primary_position : null
      };
    }

    out.push(preparedRowBase({
      batchId,
      sourceKey: SOURCE_UNDERDOG,
      sourceRowId: sourceKeyForRow(SOURCE_UNDERDOG, r),
      sourceEventId: safeStr(r.source_event_id || raw.event_id),
      projectionId: null,
      playerName,
      propKey: underdogPropKey,
      sourcePropName: underdogSourcePropName,
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

async function writePreparedRows(env, batchId, rows, bySource, startedAt, input, timing = {}) {
  const writeStart = Date.now();
  const writeOffset = Math.max(0, Number(input.score_prep_write_offset ?? input.write_offset ?? 0) || 0);
  const writeEndExclusive = Math.min(rows.length, writeOffset + WRITE_ROWS_PER_INVOCATION);
  const partialWrite = writeEndExclusive < rows.length;
  await ensureScoreTables(env);

  const insertSql = `INSERT OR REPLACE INTO score_board_prepared_stage (
    stage_row_id, prepared_row_id, prep_batch_id, source_key, source_row_id, source_event_id, projection_id,
    player_name, player_name_normalized, resolved_player_id, resolved_mlb_player_id,
    player_match_status, player_match_confidence, team, opponent, team_full_name, opponent_full_name,
    canonical_prop_key, source_prop_name, line_value, official_game_pk, official_game_time_utc, official_date,
    source_start_time, source_time_status, start_time_confidence, matchup_status, matchup_confidence,
    source_pickable, pickable_safe, prep_status, block_reason, raw_source_json, row_payload_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  await updatePrepBatchCheckpoint(env, batchId, "WRITING_REPLACEMENT_ROWS", "SCORE_BOARD_PREP_WRITING_REPLACEMENT_ROWS", { attempted_rows: rows.length, write_offset: writeOffset, write_end_exclusive: writeEndExclusive, write_rows_per_invocation: WRITE_ROWS_PER_INVOCATION, insert_chunk_size: INSERT_CHUNK_SIZE, preserve_current_until_verified: true });
  const insertStart = Date.now();
  for (let i = writeOffset; i < writeEndExclusive; i += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, Math.min(i + INSERT_CHUNK_SIZE, writeEndExclusive));
    const statements = chunk.map(r => env.SCORE_DB.prepare(insertSql).bind(
      `${batchId}|${r.prepared_row_id}`,
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
  timing.insert_ms = Date.now() - insertStart;

  // v0.2.5 performance fix: v0.2.4 proved the final DB-truth contract but
  // made a full SELECT * after insert. Pulling 8k rows plus raw JSON payloads
  // caused multi-minute runs. Keep DB-truth, but verify with aggregate SQL only.
  const verifyStart = Date.now();
  const totalRow = await firstRow(env.SCORE_DB, `
SELECT
  COUNT(*) AS prepared_rows,
  SUM(CASE WHEN source_key = 'prizepicks' THEN 1 ELSE 0 END) AS prizepicks_rows,
  SUM(CASE WHEN source_key = 'sleeper' THEN 1 ELSE 0 END) AS sleeper_rows,
  SUM(CASE WHEN pickable_safe = 1 THEN 1 ELSE 0 END) AS pickable_safe_rows,
  SUM(CASE WHEN pickable_safe = 0 THEN 1 ELSE 0 END) AS blocked_rows,
  SUM(CASE WHEN player_match_status = 'unresolved' THEN 1 ELSE 0 END) AS unresolved_player_rows,
  SUM(CASE WHEN matchup_status = 'calendar_unresolved' THEN 1 ELSE 0 END) AS matchup_unresolved_rows,
  SUM(CASE WHEN block_reason LIKE '%started_or_expired_by_official_time%' THEN 1 ELSE 0 END) AS started_rows,
  SUM(CASE WHEN block_reason LIKE '%source_unpickable_flag%' THEN 1 ELSE 0 END) AS source_unpickable_rows,
  SUM(CASE WHEN block_reason LIKE '%player_team_conflict%' THEN 1 ELSE 0 END) AS player_team_conflict_rows
FROM score_board_prepared_stage
WHERE prep_batch_id = ?`, [batchId]);

  const verifiedPreparedRows = Number(totalRow && totalRow.prepared_rows || 0);
  if (verifiedPreparedRows < rows.length) {
    await updatePrepBatchCheckpoint(env, batchId, "PARTIAL_CONTINUE_BOARD_PREP_WRITE", "SCORE_BOARD_PREP_PARTIAL_WRITE_COUNT_GUARD", {
      attempted_rows: rows.length,
      inserted_current_rows: verifiedPreparedRows,
      next_write_offset: verifiedPreparedRows,
      remaining_rows: rows.length - verifiedPreparedRows,
      completion_guard: "verified_rows_less_than_attempted_rows_no_cleanup",
      timing_ms: timing
    });
    return {
      partial: true,
      next_write_offset: verifiedPreparedRows,
      remaining_rows: rows.length - verifiedPreparedRows,
      insertedThisInvocation: Math.max(0, verifiedPreparedRows - writeOffset),
      insertedCurrentRows: verifiedPreparedRows,
      totals: computeTotals(rows),
      bySource,
      sleeperEvents: []
    };
  }

  const totals = {
    rows_read: Number(totalRow.prepared_rows || 0),
    rows_written: Number(totalRow.prepared_rows || 0) + 1,
    prepared_rows: Number(totalRow.prepared_rows || 0),
    prizepicks_rows: Number(totalRow.prizepicks_rows || 0),
    sleeper_rows: Number(totalRow.sleeper_rows || 0),
    pickable_safe_rows: Number(totalRow.pickable_safe_rows || 0),
    blocked_rows: Number(totalRow.blocked_rows || 0),
    started_rows: Number(totalRow.started_rows || 0),
    source_unpickable_rows: Number(totalRow.source_unpickable_rows || 0),
    unresolved_player_rows: Number(totalRow.unresolved_player_rows || 0),
    matchup_unresolved_rows: Number(totalRow.matchup_unresolved_rows || 0),
    player_team_conflict_rows: Number(totalRow.player_team_conflict_rows || 0)
  };

  const promoteStart = Date.now();
  await updatePrepBatchCheckpoint(env, batchId, "PROMOTING_STAGE_TO_CURRENT", "SCORE_BOARD_PREP_PROMOTING_STAGE_TO_CURRENT", { attempted_rows: rows.length, stage_rows: verifiedPreparedRows, no_active_current_staging: true, timing_ms: timing });
  await env.SCORE_DB.prepare(`INSERT OR REPLACE INTO score_board_prepared_current (
    prepared_row_id, prep_batch_id, source_key, source_row_id, source_event_id, projection_id,
    player_name, player_name_normalized, resolved_player_id, resolved_mlb_player_id,
    player_match_status, player_match_confidence, team, opponent, team_full_name, opponent_full_name,
    canonical_prop_key, source_prop_name, line_value, official_game_pk, official_game_time_utc, official_date,
    source_start_time, source_time_status, start_time_confidence, matchup_status, matchup_confidence,
    source_pickable, pickable_safe, prep_status, block_reason, raw_source_json, row_payload_json, created_at, updated_at
  ) SELECT
    prepared_row_id, prep_batch_id, source_key, source_row_id, source_event_id, projection_id,
    player_name, player_name_normalized, resolved_player_id, resolved_mlb_player_id,
    player_match_status, player_match_confidence, team, opponent, team_full_name, opponent_full_name,
    canonical_prop_key, source_prop_name, line_value, official_game_pk, official_game_time_utc, official_date,
    source_start_time, source_time_status, start_time_confidence, matchup_status, matchup_confidence,
    source_pickable, pickable_safe, prep_status, block_reason, raw_source_json, row_payload_json, created_at, CURRENT_TIMESTAMP
  FROM score_board_prepared_stage WHERE prep_batch_id=?`).bind(batchId).run();
  const promotedRow = await firstRow(env.SCORE_DB, "SELECT COUNT(*) AS rows FROM score_board_prepared_current WHERE prep_batch_id=?", [batchId]);
  const promotedRows = Number(promotedRow && promotedRow.rows || 0);
  timing.promote_ms = Date.now() - promoteStart;
  if (promotedRows < rows.length) {
    await updatePrepBatchCheckpoint(env, batchId, "PARTIAL_CONTINUE_BOARD_PREP_PROMOTE", "SCORE_BOARD_PREP_PARTIAL_PROMOTE_COUNT_GUARD", { attempted_rows: rows.length, promoted_rows: promotedRows, stage_rows: verifiedPreparedRows, no_cleanup: true, timing_ms: timing });
    return { partial:true, next_write_offset: verifiedPreparedRows, remaining_rows: rows.length - promotedRows, insertedThisInvocation:0, insertedCurrentRows: promotedRows, totals: computeTotals(rows), bySource, sleeperEvents: [] };
  }

  const finalBySource = await allRows(env.SCORE_DB, `
SELECT
  source_key,
  COUNT(*) AS rows,
  SUM(CASE WHEN pickable_safe = 1 THEN 1 ELSE 0 END) AS pickable_safe_rows,
  SUM(CASE WHEN pickable_safe = 0 THEN 1 ELSE 0 END) AS blocked_rows,
  SUM(CASE WHEN block_reason LIKE '%started_or_expired_by_official_time%' THEN 1 ELSE 0 END) AS started_rows,
  SUM(CASE WHEN player_match_status = 'unresolved' THEN 1 ELSE 0 END) AS player_unresolved_rows,
  SUM(CASE WHEN player_match_status = 'ambiguous' THEN 1 ELSE 0 END) AS player_ambiguous_rows,
  SUM(CASE WHEN matchup_status = 'calendar_unresolved' THEN 1 ELSE 0 END) AS matchup_unresolved_rows,
  SUM(CASE WHEN matchup_status = 'calendar_ambiguous' THEN 1 ELSE 0 END) AS matchup_ambiguous_rows,
  SUM(CASE WHEN block_reason LIKE '%player_team_conflict%' THEN 1 ELSE 0 END) AS player_team_conflict_rows
FROM score_board_prepared_current
WHERE prep_batch_id = ?
GROUP BY source_key
ORDER BY source_key`, [batchId]).then(rows => rows.map(r => ({
    source_key: r.source_key,
    rows: Number(r.rows || 0),
    pickable_safe_rows: Number(r.pickable_safe_rows || 0),
    blocked_rows: Number(r.blocked_rows || 0),
    started_rows: Number(r.started_rows || 0),
    player_unresolved_rows: Number(r.player_unresolved_rows || 0),
    player_ambiguous_rows: Number(r.player_ambiguous_rows || 0),
    matchup_unresolved_rows: Number(r.matchup_unresolved_rows || 0),
    matchup_ambiguous_rows: Number(r.matchup_ambiguous_rows || 0),
    player_team_conflict_rows: Number(r.player_team_conflict_rows || 0)
  })));

  const finalSleeperEvents = await allRows(env.SCORE_DB, `
SELECT
  source_event_id,
  MIN(team_full_name) AS sample_team_full_name,
  MIN(opponent_full_name) AS sample_opponent_full_name,
  COUNT(*) AS rows,
  MIN(official_game_pk) AS official_game_pk,
  MIN(official_game_time_utc) AS official_game_time_utc,
  GROUP_CONCAT(DISTINCT matchup_status) AS matchup_statuses,
  SUM(CASE WHEN pickable_safe = 1 THEN 1 ELSE 0 END) AS pickable_safe_rows,
  SUM(CASE WHEN pickable_safe = 0 THEN 1 ELSE 0 END) AS blocked_rows,
  SUM(CASE WHEN player_match_status = 'unresolved' THEN 1 ELSE 0 END) AS player_unresolved_rows
FROM score_board_prepared_current
WHERE prep_batch_id = ? AND source_key = 'sleeper'
GROUP BY source_event_id
ORDER BY rows DESC`, [batchId]).then(rows => rows.map(r => ({
    source_event_id: r.source_event_id,
    sample_team_full_name: r.sample_team_full_name,
    sample_opponent_full_name: r.sample_opponent_full_name,
    rows: Number(r.rows || 0),
    official_game_pk: r.official_game_pk ? Number(r.official_game_pk) : null,
    official_game_time_utc: r.official_game_time_utc || null,
    matchup_statuses: r.matchup_statuses || null,
    pickable_safe_rows: Number(r.pickable_safe_rows || 0),
    blocked_rows: Number(r.blocked_rows || 0),
    player_unresolved_rows: Number(r.player_unresolved_rows || 0)
  })));

  timing.verify_ms = Date.now() - verifyStart;

  // v0.2.12 safety fix: never clear the active prepared board before the
  // replacement batch has been fully inserted and DB-verified. A hung/aborted
  // worker after an early DELETE left score_board_prepared_current empty.
  // Now the swap is: insert/verify new batch first, then remove older batches.
  const cleanupStart = Date.now();
  if (totals.prepared_rows > 0 && totals.prepared_rows > 0) {
    await updatePrepBatchCheckpoint(env, batchId, "CLEANING_OLD_PREP_BATCHES", "SCORE_BOARD_PREP_CLEANING_OLD_BATCHES_AFTER_VERIFY", { prepared_rows: totals.prepared_rows, preserve_current_until_verified: true });
    await env.SCORE_DB.prepare("DELETE FROM score_board_prepared_current WHERE prep_batch_id <> ?").bind(batchId).run();
    await env.SCORE_DB.prepare("DELETE FROM score_board_prepared_stage WHERE prep_batch_id <> ?").bind(batchId).run();
  }
  timing.cleanup_old_batches_ms = Date.now() - cleanupStart;

  const finishAt = nowIso();
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
      JSON.stringify({ request_id: input.request_id || null, chain_id: input.chain_id || null, by_source: finalBySource, attempted_rows: rows.length, inserted_current_rows: totals.prepared_rows, timing_ms: timing }),
      JSON.stringify({ ...totals, sleeper_events: finalSleeperEvents, final_db_truth: true, attempted_rows: rows.length, inserted_current_rows: totals.prepared_rows, timing_ms: timing }),
      startedAt,
      finishAt,
      finishAt
    )
    .run();

  timing.write_total_ms = Date.now() - writeStart;
  return { totals, bySource: finalBySource, sleeperEvents: finalSleeperEvents, insertedCurrentRows: totals.prepared_rows };
}
function computeTotals(rows) {
  let prizepicks_rows = 0, sleeper_rows = 0, underdog_rows = 0, pickable_safe_rows = 0, blocked_rows = 0, unresolved_player_rows = 0, matchup_unresolved_rows = 0, started_rows = 0, source_unpickable_rows = 0, player_team_conflict_rows = 0;
  for (const r of rows) {
    if (r.source_key === SOURCE_PRIZEPICKS) prizepicks_rows += 1;
    if (r.source_key === SOURCE_SLEEPER) sleeper_rows += 1;
    if (r.source_key === SOURCE_UNDERDOG) underdog_rows += 1;
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
    underdog_rows,
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
  const wallStart = Date.now();
  const startedAt = nowIso();
  const timing = {};
  const requestId = input.request_id || `score_prep_${Date.now()}`;
  let batchId = input.prep_batch_id || input.batch_id || null;

  const bindings = bindingSummary(env);
  for (const required of ["REF_DB", "TEAM_DB", "MARKET_DB", "SCORE_DB"]) {
    if (!bindings[required]) throw new Error(`missing_required_binding_${required}`);
  }

  await ensureScoreTables(env);
  let recoveredResume = null;
  if (!batchId) {
    recoveredResume = await recoverResumeBatchForRequest(env, input);
    if (recoveredResume && recoveredResume.batch_id) {
      batchId = recoveredResume.batch_id;
      if (!Number(input.score_prep_write_offset || input.write_offset || 0)) {
        input.score_prep_write_offset = recoveredResume.stage_rows;
      }
    }
  }
  if (!batchId) batchId = `score_board_prep_batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  await markPrepBatchRunning(env, batchId, input, startedAt);
  await controlLog(env, input, "INFO", "score_prep_worker_started", "Score Prep worker started with checkpointed batch row before source load", { batch_id: batchId, recovered_resume_batch: recoveredResume, write_offset: Number(input.score_prep_write_offset || input.write_offset || 0), bindings, preserve_current_until_verified: true });
  await controlRunHeartbeat(env, input, "SCORE_PREP_WORKER_STARTED", 0, 0, { batch_id: batchId });

  const loadStart = Date.now();
  const [{ prizepicksRows, sleeperRows }, ref] = await Promise.all([
    loadMarketRows(env),
    loadReference(env)
  ]);
  const dates = collectCalendarDates(prizepicksRows, sleeperRows);
  const calendar = await loadCalendar(env, dates, ref);
  timing.load_ms = Date.now() - loadStart;
  await updatePrepBatchCheckpoint(env, batchId, "LOADED_BOARD_SOURCES", "SCORE_BOARD_PREP_SOURCES_LOADED", { prizepicks_rows: prizepicksRows.length, sleeper_rows: sleeperRows.length, calendar_candidate_dates: dates, timing_ms: timing });
  await controlLog(env, input, "INFO", "score_prep_sources_loaded", "Score Prep loaded board sources and reference/calendar context", { batch_id: batchId, prizepicks_rows: prizepicksRows.length, sleeper_rows: sleeperRows.length, calendar_dates: dates, timing_ms: timing });
  await controlRunHeartbeat(env, input, "SCORE_PREP_SOURCES_LOADED", prizepicksRows.length + sleeperRows.length, 0, { batch_id: batchId, timing_ms: timing });
  const now = new Date();

  const resolveStart = Date.now();
  const preparedAllSources = [
    ...preparePrizePicksRows(prizepicksRows, ref, calendar, batchId, now),
    ...prepareSleeperRows(sleeperRows, ref, calendar, batchId, now)
  ];
  const explicitWindowDates = Array.isArray(input.window_dates) && input.window_dates.length >= 2
    ? input.window_dates.slice(0, 2).map(safeStr).filter(Boolean)
    : ptTodayTomorrow();
  const currentWindowDateSet = new Set(explicitWindowDates);
  const prepared = preparedAllSources.filter(r => currentWindowDateSet.has(r.official_date));
  const staleExcluded = preparedAllSources.filter(r => !currentWindowDateSet.has(r.official_date));
  timing.resolve_ms = Date.now() - resolveStart;
  const initialBySource = summarizeBySource(prepared);
  const staleExcludedBySource = summarizeBySource(staleExcluded);
  await updatePrepBatchCheckpoint(env, batchId, "PREPARED_ROWS_BUILT", "SCORE_BOARD_PREP_ROWS_BUILT_BEFORE_WRITE", { prepared_rows: prepared.length, all_source_rows_seen_before_window_filter: preparedAllSources.length, current_window_dates: Array.from(currentWindowDateSet), stale_or_out_of_window_rows_excluded_from_current: staleExcluded.length, by_source: initialBySource, timing_ms: timing });
  await controlLog(env, input, "INFO", "score_prep_rows_built", "Score Prep built replacement prepared rows before DB write", { batch_id: batchId, prepared_rows: prepared.length, all_source_rows_seen_before_window_filter: preparedAllSources.length, current_window_dates: Array.from(currentWindowDateSet), by_source: initialBySource, timing_ms: timing });
  await controlRunHeartbeat(env, input, "SCORE_PREP_ROWS_BUILT_BEFORE_WRITE", prepared.length, 0, { batch_id: batchId, by_source: initialBySource });
  if (!prepared.length) throw new Error("score_prep_zero_prepared_rows_guard_preserved_existing_current");
  const writeResult = await writePreparedRows(env, batchId, prepared, initialBySource, startedAt, input, timing);
  const totals = writeResult.totals;
  const bySource = writeResult.bySource;
  if (writeResult.partial) {
    await controlLog(env, input, "INFO", "score_prep_partial_write_continue", "Score Prep wrote a bounded chunk and yielded for backend continuation", { batch_id: batchId, next_write_offset: writeResult.next_write_offset, remaining_rows: writeResult.remaining_rows, inserted_current_rows: writeResult.insertedCurrentRows, timing_ms: timing });
    await controlRunHeartbeat(env, input, "SCORE_PREP_PARTIAL_WRITE_CONTINUE", totals.rows_read, writeResult.insertedCurrentRows, { batch_id: batchId, next_write_offset: writeResult.next_write_offset, remaining_rows: writeResult.remaining_rows });
    return {
      ok: true,
      data_ok: true,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      request_id: requestId,
      chain_id: input.chain_id || null,
      batch_id: batchId,
      prep_batch_id: batchId,
      mode: "board_prep_enrichment",
      status: "PARTIAL_CONTINUE_BOARD_PREP_WRITE",
      certification: "SCORE_BOARD_PREP_PARTIAL_WRITE_CONTINUE",
      certification_grade: "PARTIAL",
      rows_read: totals.rows_read,
      rows_written: writeResult.insertedCurrentRows,
      prepared_rows: totals.prepared_rows,
      inserted_this_invocation: writeResult.insertedThisInvocation,
      inserted_current_rows: writeResult.insertedCurrentRows,
      next_write_offset: writeResult.next_write_offset,
      remaining_rows: writeResult.remaining_rows,
      continuation_required: true,
      orchestrator_should_self_continue: true,
      score_prep_chunked_write_resume: true,
      score_prep_complete_count_guard: true,
      score_prep_stage_table_write: true,
      score_prep_resume_batch_recovery: true,
      score_prep_single_pass_stage_swap_v0_2_19: true,
    score_prep_fast_finalize_after_db_truth_v0_2_20: true,
      current_table_retention_policy: "partial_new_batch_rows_may_coexist_with_previous_current_until_final_verify_cleanup",
      by_source: bySource,
      timing_ms: { ...timing, total_ms: Date.now() - wallStart },
      timestamp_utc: nowIso(),
      elapsed_ms: Date.now() - wallStart
    };
  }
  await controlLog(env, input, "INFO", "score_prep_write_verified", "Score Prep inserted and DB-verified replacement rows before old-batch cleanup", { batch_id: batchId, totals, by_source: bySource, timing_ms: timing });
  await controlRunHeartbeat(env, input, "SCORE_PREP_WRITE_VERIFIED", totals.rows_read, totals.rows_written, { batch_id: batchId, totals, by_source: bySource });

  // v0.2.20: the DB-truth point is the safe terminal point.
  // Prior code did extra sample reads and returned large diagnostics after
  // score_prep_write_verified; the service binding could time out even though
  // score_board_prepared_current had already been inserted and verified.
  // Return a compact certified payload immediately after DB truth.
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
    attempted_rows: prepared.length,
    all_source_rows_seen_before_window_filter: preparedAllSources.length,
    current_window_dates: Array.from(currentWindowDateSet),
    stale_or_out_of_window_rows_excluded_from_current: staleExcluded.length,
    stale_or_out_of_window_by_source: staleExcludedBySource,
    inserted_current_rows: writeResult.insertedCurrentRows,
    final_db_truth: true,
    preserve_previous_current_until_replacement_verified: true,
    score_prep_complete_count_guard: true,
    score_prep_stage_table_write: true,
    score_prep_resume_batch_recovery: true,
      score_prep_single_pass_stage_swap_v0_2_19: true,
    score_prep_fast_finalize_after_db_truth_v0_2_20: true,
    current_table_retention_policy: "score_board_prepared_current_current_pt_today_tomorrow_only_insert_verify_then_cleanup_old_batches",
    by_source: bySource,
    sleeper_event_resolution_count: Array.isArray(writeResult.sleeperEvents) ? writeResult.sleeperEvents.length : 0,
    diagnostics_compacted_after_db_truth: true,
    output_tables: ["SCORE_DB.score_board_prep_batches", "SCORE_DB.score_board_prepared_current"],
    no_market_board_mutation: true,
    no_raw_board_delete: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    timing_ms: { ...timing, total_ms: Date.now() - wallStart },
    timestamp_utc: nowIso(),
    elapsed_ms: Date.now() - wallStart
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
        await controlLog(env, input, "ERROR", "score_prep_worker_failed", "Score Prep worker failed before certified completion", { error: err && err.message ? err.message : String(err) });
        await controlRunHeartbeat(env, input, "SCORE_PREP_WORKER_FAILED", 0, 0, { error: err && err.message ? err.message : String(err) });
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
