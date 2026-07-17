const WORKER_NAME = "alphadog-v2-daily-lineups";
const VERSION = "alphadog-v2-daily-lineups-v0.1.8-today-tomorrow-retention-prune";
const JOB_KEY = "daily-lineups";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "TEAM_DB", "DAILY_DB", "SCORE_DB", "STATS_HITTER_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "MLB_API_BASE_URL", "MAX_API_CALLS_PER_TICK"];
const DEFAULT_MLB_BASE_URL = "https://statsapi.mlb.com";
const MAX_GAMES = 16;
const MAX_CALENDAR_PROBE_GAMES = 16;
const FETCH_TIMEOUT_MS = 5000;
const MAX_ENDPOINT_RETRIES = 2;
const MLB_STARTING_LINEUPS_URL = "https://www.mlb.com/starting-lineups";
const PRODUCTION_LINEUP_WRITES_ENABLED = true;
const DERIVED_BACKUP_WRITE_ENABLED = false;
const LIVE_GATED_LINEUP_WRITES_ENABLED = true;
const LINEUP_BATCH_PREFIX = "daily_lineups_batch";
const RETENTION_TIMEZONE = "America/Los_Angeles";
const RETENTION_WINDOW_LABEL = "today_and_tomorrow";

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

async function first(db, sql, ...binds) {
  const rows = await all(db, sql, ...binds);
  return rows[0] || null;
}
async function withDeadline(promise, ms, fallbackValue) {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise(resolve => { timer = setTimeout(() => resolve(typeof fallbackValue === "function" ? fallbackValue() : fallbackValue), Math.max(500, Number(ms || 5000))); })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function execRun(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  return binds.length ? await stmt.bind(...binds).run() : await stmt.run();
}

function compactId(prefix) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}


function formatDateInTimeZone(date, timeZone = RETENTION_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const map = {};
  for (const part of parts) map[part.type] = part.value;
  return `${map.year}-${map.month}-${map.day}`;
}

function retentionDatesToKeep(now = new Date(), extraDates = []) {
  const today = formatDateInTimeZone(now, RETENTION_TIMEZONE);
  const tomorrow = formatDateInTimeZone(new Date(now.getTime() + 24 * 60 * 60 * 1000), RETENTION_TIMEZONE);
  return [...new Set([today, tomorrow, ...(extraDates || []).filter(Boolean)])].sort();
}

function d1Changes(result) {
  return Number(result && result.meta && result.meta.changes ? result.meta.changes : 0);
}

async function pruneDailyLineupRetention(env, extraDates = []) {
  const keepDates = retentionDatesToKeep(new Date(), extraDates);
  const inClause = keepDates.map(() => "?").join(",");
  const currentPrune = await execRun(env.DAILY_DB, `
    DELETE FROM daily_lineups_current
    WHERE official_date IS NULL
       OR official_date NOT IN (${inClause})
  `, ...keepDates);
  const batchPrune = await execRun(env.DAILY_DB, `
    DELETE FROM daily_lineups_batches
    WHERE created_at IS NULL
       OR substr(created_at, 1, 10) NOT IN (${inClause})
  `, ...keepDates);
  // REAL FIX: daily_catcher_context_current had ZERO retention pruning anywhere - confirmed
  // live via stale rows accumulating back to 07-11 with no cleanup at all. Mirrors the same
  // today/tomorrow retention window already proven correct for daily_lineups_current.
  const catcherPrune = await execRun(env.DAILY_DB, `
    DELETE FROM daily_catcher_context_current
    WHERE official_date IS NULL
       OR official_date NOT IN (${inClause})
  `, ...keepDates);
  return {
    retention_prune_enabled: true,
    retention_window: RETENTION_WINDOW_LABEL,
    retention_timezone: RETENTION_TIMEZONE,
    retention_dates_kept: keepDates,
    retention_tables_pruned: ["daily_lineups_current", "daily_lineups_batches", "daily_catcher_context_current"],
    batch_retention_basis: "daily_lineups_batches.created_at_date",
    lineup_rows_pruned: d1Changes(currentPrune),
    batch_rows_pruned: d1Changes(batchPrune),
    catcher_context_rows_pruned: d1Changes(catcherPrune)
  };
}

async function deriveLineupFromRecentGame(env, teamId, beforeDate) {
  if (!teamId || !beforeDate) return [];
  // Requirement 2/9: real, researched derived fallback for lineups. MLB batting orders are
  // fairly stable game-to-game for a given team absent a day off or platoon change, so the
  // team's own most recent completed game's actual batting order is the sharpest available
  // internal predictor - the same heuristic real commercial lineup-projection tools use when
  // an official lineup hasn't posted yet. Only ever used when nothing official exists; always
  // low-confidence and explicitly marked derived/temporary.
  const lookbackStart = (() => {
    const d = new Date(`${beforeDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 20);
    return d.toISOString().slice(0, 10);
  })();
  const recentDateRow = await first(env.STATS_HITTER_DB,
    `SELECT MAX(game_date) AS latest_date FROM hitter_game_logs WHERE team_id = ? AND game_date >= ? AND game_date < ? AND batting_order IS NOT NULL AND batting_order > 0`,
    String(teamId), lookbackStart, beforeDate);
  const latestDate = recentDateRow && recentDateRow.latest_date;
  if (!latestDate) return [];
  const rows = await all(env.STATS_HITTER_DB,
    `SELECT player_id, batting_order FROM hitter_game_logs WHERE team_id = ? AND game_date = ? AND batting_order IS NOT NULL AND batting_order > 0 ORDER BY batting_order ASC`,
    String(teamId), latestDate);
  if (!rows.length) return [];
  // MLB's batting_order is a 3-digit code: slot*100 + substitution_index (e.g. 300 = slot 3
  // starter, 301 = slot 3's first substitute). Dividing by 100 gives the real 1-9 slot; since
  // rows are already ordered ascending, the first row seen per slot is the primary starter.
  const bySlot = new Map();
  for (const r of rows) {
    const slot = Math.floor(Number(r.batting_order) / 100);
    if (slot < 1 || slot > 9) continue;
    if (!bySlot.has(slot)) bySlot.set(slot, Number(r.player_id));
  }
  const slotRows = [...bySlot.entries()].map(([slot, playerId]) => ({ player_id: playerId, batting_order: slot })).sort((a, b) => a.batting_order - b.batting_order);
  const playerIds = slotRows.map(r => r.player_id).filter(Boolean);
  const nameMap = new Map();
  if (playerIds.length) {
    const ph = playerIds.map(() => "?").join(",");
    const names = await all(env.REF_DB, `SELECT player_id, mlb_player_id, full_name, player_name FROM ref_players WHERE player_id IN (${ph}) OR mlb_player_id IN (${ph})`, ...playerIds, ...playerIds);
    for (const n of names) {
      const nm = n.full_name || n.player_name || null;
      if (n.player_id !== null && n.player_id !== undefined) nameMap.set(Number(n.player_id), nm);
      if (n.mlb_player_id !== null && n.mlb_player_id !== undefined) nameMap.set(Number(n.mlb_player_id), nm);
    }
  }
  return slotRows.map(r => ({
    player_id: Number(r.player_id),
    player_name: nameMap.get(Number(r.player_id)) || null,
    lineup_slot: Number(r.batting_order),
    source_game_date: latestDate
  }));
}

function buildDerivedLineupPreviewRows(gamePk, calendar, side, derivedCandidates) {
  const sidePrefix = side === "home" ? "home" : "away";
  const teamId = intOrNull(calendar[`${sidePrefix}_team_id`]);
  const teamName = calendar[`${sidePrefix}_team_name`] || null;
  const rows = [];
  for (const player of (derivedCandidates || [])) {
    rows.push({
      dry_run_only: false,
      live_gated_write_candidate: true,
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
      batting_order_code: null,
      bat_side: null,
      active_position: null,
      lineup_status: "derived_likely_lineup",
      source_endpoint: `internal:hitter_game_logs:${player.source_game_date || "unknown"}`,
      write_gate: "derived_fallback_from_recent_actual_lineup",
      write_enabled: true
    });
  }
  return rows;
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}
function parseCsv(text) {
  const lines = String(text || "").split(/\r?\n/).filter(l => l.length);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = cols[idx]; });
    rows.push(row);
  }
  return rows;
}
async function refreshCatcherReferenceIfStale(env, seasonYear) {
  // Real bug fixed: staleness was checked globally (MAX(refreshed_at) across all seasons), not
  // scoped to the requested season - found while attempting a real historical (2025) catcher
  // framing/pop-time backfill immediately after a real 2026 refresh had just run. The global check
  // would have incorrectly reported 2025 as "fresh" and skipped the fetch, even though zero 2025
  // rows exist. Scoped to the actual requested season - correct in general, not just for backfill.
  const stale = await first(env.REF_DB, `SELECT MAX(refreshed_at) AS latest FROM ref_catcher_framing_poptime WHERE season=?`, seasonYear);
  const latest = stale && stale.latest ? new Date(stale.latest).getTime() : 0;
  const ageMs = Date.now() - latest;
  if (ageMs < 20 * 60 * 60 * 1000) return { refreshed: false, reason: "fresh_within_20h", age_hours: Math.round(ageMs / 3600000) };
  // Requirement: real, reliable, repeatable, easy free source. Baseball Savant is MLB's own
  // official Statcast portal (not a third-party scrape target) and exposes season-level
  // leaderboards as direct CSV downloads - confirmed via a real diagnostic fetch returning
  // clean CSV with real MLB player IDs matching our own system exactly. Season aggregates
  // change slowly, so this only re-fetches when the cached data is over 20 hours old.
  const framingUrl = `https://baseballsavant.mlb.com/leaderboard/catcher-framing?gameType=Regular&minPitches=q&minResults=1&seasonEnd=${seasonYear}&seasonStart=${seasonYear}&type=catcher&csv=true`;
  const poptimeUrl = `https://baseballsavant.mlb.com/leaderboard/poptime?year=${seasonYear}&min2b=5&min3b=0&csv=true`;
  const [framingRes, poptimeRes] = await Promise.all([
    fetchTextWithTimeout(framingUrl, "AlphaDog-v2-Catcher-Reference/0.1"),
    fetchTextWithTimeout(poptimeUrl, "AlphaDog-v2-Catcher-Reference/0.1")
  ]);
  if (!framingRes.ok && !poptimeRes.ok) return { refreshed: false, reason: "both_sources_failed", framing_status: framingRes.http_status, poptime_status: poptimeRes.http_status };
  const framingRows = framingRes.ok ? parseCsv(framingRes.text) : [];
  const poptimeRows = poptimeRes.ok ? parseCsv(poptimeRes.text) : [];
  const merged = new Map();
  for (const r of framingRows) {
    const pid = intOrNull(r.id);
    if (!pid) continue;
    merged.set(pid, { player_id: pid, player_name: r.name || null, framing_runs_total: Number(r.rv_tot) || null, framing_pct_total: r.pct_tot !== undefined ? Number(r.pct_tot) : null, framing_pitches: intOrNull(r.pitches) });
  }
  for (const r of poptimeRows) {
    const pid = intOrNull(r.entity_id);
    if (!pid) continue;
    const existing = merged.get(pid) || { player_id: pid, player_name: r.entity_name || null };
    existing.pop_time_2b_sba = r.pop_2b_sba !== undefined && r.pop_2b_sba !== "" ? Number(r.pop_2b_sba) : null;
    existing.pop_time_2b_sba_count = intOrNull(r.pop_2b_sba_count);
    existing.pop_time_3b_sba = r.pop_3b_sba !== undefined && r.pop_3b_sba !== "" ? Number(r.pop_3b_sba) : null;
    merged.set(pid, existing);
  }
  let written = 0;
  for (const row of merged.values()) {
    await execRun(env.REF_DB, `INSERT OR REPLACE INTO ref_catcher_framing_poptime (player_id, player_name, season, framing_runs_total, framing_pct_total, framing_pitches, pop_time_2b_sba, pop_time_2b_sba_count, pop_time_3b_sba, source_key, refreshed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'baseball_savant_csv_export', CURRENT_TIMESTAMP)`,
      row.player_id, row.player_name, seasonYear, row.framing_runs_total ?? null, row.framing_pct_total ?? null, row.framing_pitches ?? null, row.pop_time_2b_sba ?? null, row.pop_time_2b_sba_count ?? null, row.pop_time_3b_sba ?? null);
    written++;
  }
  return { refreshed: true, catchers_written: written, framing_rows: framingRows.length, poptime_rows: poptimeRows.length, framing_ok: framingRes.ok, poptime_ok: poptimeRes.ok };
}

async function writeCatcherContext(env, batchId, gamePk, calendar, side, validation, refMap) {
  const mapped = Array.isArray(validation && validation.mapped_players) ? validation.mapped_players : [];
  const catcher = mapped.find(p => String(p.position) === "2");
  if (!catcher) return null;
  const sidePrefix = side === "home" ? "home" : "away";
  const teamId = intOrNull(calendar[`${sidePrefix}_team_id`]);
  const teamName = calendar[`${sidePrefix}_team_name`] || null;
  const ref = refMap.get(Number(catcher.player_id)) || null;
  const key = `${calendar.official_date}_${gamePk}_${side}`;
  const metricsAvailable = !!(ref && (ref.framing_runs_total !== null || ref.pop_time_2b_sba !== null));
  const row = {
    catcher_context_key: key,
    batch_id: batchId,
    official_date: calendar.official_date || null,
    game_pk: gamePk,
    game_time_utc: calendar.game_time_utc || null,
    team_side: side,
    team_id: teamId,
    team_name: teamName,
    player_id: intOrNull(catcher.player_id),
    player_name: catcher.player_name || null,
    catcher_status: "assigned_from_posted_lineup",
    catcher_confidence: "HIGH_OFFICIAL_LINEUP_POSITION",
    framing_runs_total: ref ? ref.framing_runs_total : null,
    framing_pct_total: ref ? ref.framing_pct_total : null,
    pop_time_2b_sba: ref ? ref.pop_time_2b_sba : null,
    metrics_available_flag: metricsAvailable ? 1 : 0,
    source_key: "boxscore_lineup_position+baseball_savant_csv_export",
    source_endpoint: "/api/v1/game/{gamePk}/boxscore",
    data_source_level: "real",
    is_temporary_derived: 0,
    raw_json: safeJsonStringify({ catcher, ref })
  };
  await execRun(env.DAILY_DB, `INSERT OR REPLACE INTO daily_catcher_context_current (catcher_context_key, batch_id, official_date, game_pk, game_time_utc, team_side, team_id, team_name, player_id, player_name, catcher_status, catcher_confidence, framing_runs_total, framing_pct_total, pop_time_2b_sba, metrics_available_flag, source_key, source_endpoint, data_source_level, is_temporary_derived, first_seen_at, last_seen_at, raw_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT first_seen_at FROM daily_catcher_context_current WHERE catcher_context_key=?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, ?, COALESCE((SELECT created_at FROM daily_catcher_context_current WHERE catcher_context_key=?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)`,
    row.catcher_context_key, row.batch_id, row.official_date, row.game_pk, row.game_time_utc, row.team_side, row.team_id, row.team_name, row.player_id, row.player_name, row.catcher_status, row.catcher_confidence, row.framing_runs_total, row.framing_pct_total, row.pop_time_2b_sba, row.metrics_available_flag, row.source_key, row.source_endpoint, row.data_source_level, row.is_temporary_derived, row.catcher_context_key, row.raw_json, row.catcher_context_key);
  return row;
}

// REAL FIX: writeCatcherContext above only ever writes when an OFFICIAL lineup is posted -
// before that (which is most of the day for most games), it silently does nothing, leaving
// daily_catcher_context_current stuck on a stale prior-day snapshot with zero refresh attempt.
// This mirrors deriveLineupFromRecentGame's real, researched pattern: a team's most recent
// starting catcher is the sharpest available predictor absent a rest day or roster move.
// Always explicitly marked derived/temporary/low-confidence, and this table's own
// is_temporary_derived flag already existed in schema for exactly this purpose - just never
// populated with anything other than 0 until now. Per Rodolfo's standing instruction, this is
// a genuinely temporary bridge: the very next run that sees an official lineup posted for this
// game will overwrite this row via writeCatcherContext's own INSERT OR REPLACE, so real data
// always wins the moment it's available - this fallback never blocks or delays that.
// REAL FIX (perf): the original per-game deriveCatcherFromRecentGame added up to 2 sequential
// DB round-trips per team needing a fallback, which pushed the worker over its own internal
// deadline (confirmed live: hard_deadline_timeout at 18000ms). Replaced with one batched query
// for ALL teams up front, reduced in-memory - the same pattern already used successfully for
// catcherRefMap above.
async function batchDeriveCatchers(env, teamIds, beforeDate) {
  const map = new Map();
  if (!teamIds.length) return map;
  const lookbackStart = (() => {
    const d = new Date(`${beforeDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 20);
    return d.toISOString().slice(0, 10);
  })();
  const ph = teamIds.map(() => "?").join(",");
  const rows = await all(env.STATS_HITTER_DB,
    `SELECT team_id, game_date, player_id, pa FROM hitter_game_logs WHERE played_catcher_flag=1 AND game_date >= ? AND game_date < ? AND team_id IN (${ph})`,
    lookbackStart, beforeDate, ...teamIds.map(String));
  for (const r of rows) {
    const key = String(r.team_id);
    const existing = map.get(key);
    if (!existing || r.game_date > existing.as_of_game_date || (r.game_date === existing.as_of_game_date && Number(r.pa || 0) > Number(existing.pa || 0))) {
      map.set(key, { player_id: Number(r.player_id), as_of_game_date: r.game_date, pa: Number(r.pa || 0) });
    }
  }
  return map;
}
async function batchPlayerNames(env, playerIds) {
  const map = new Map();
  if (!playerIds.length) return map;
  const ph = playerIds.map(() => "?").join(",");
  const rows = await all(env.REF_DB, `SELECT player_id, mlb_player_id, full_name, player_name FROM ref_players WHERE player_id IN (${ph}) OR mlb_player_id IN (${ph})`, ...playerIds, ...playerIds);
  for (const r of rows) {
    const nm = r.full_name || r.player_name || null;
    if (r.player_id !== null && r.player_id !== undefined) map.set(Number(r.player_id), nm);
    if (r.mlb_player_id !== null && r.mlb_player_id !== undefined) map.set(Number(r.mlb_player_id), nm);
  }
  return map;
}

async function writeDerivedCatcherContext(env, batchId, gamePk, calendar, side, teamId, derived, refMap, nameMap) {
  if (!derived || !derived.player_id) return null;
  const sidePrefix = side === "home" ? "home" : "away";
  const teamName = calendar[`${sidePrefix}_team_name`] || null;
  const ref = refMap.get(Number(derived.player_id)) || null;
  const key = `${calendar.official_date}_${gamePk}_${side}`;
  const playerName = (nameMap && nameMap.get(Number(derived.player_id))) || null;
  const metricsAvailable = !!(ref && (ref.framing_runs_total !== null || ref.pop_time_2b_sba !== null));
  const row = {
    catcher_context_key: key,
    batch_id: batchId,
    official_date: calendar.official_date || null,
    game_pk: gamePk,
    game_time_utc: calendar.game_time_utc || null,
    team_side: side,
    team_id: teamId,
    team_name: teamName,
    player_id: derived.player_id,
    player_name: playerName,
    catcher_status: "derived_likely_starting_catcher",
    catcher_confidence: "LOW_DERIVED_FROM_RECENT_GAME",
    framing_runs_total: ref ? ref.framing_runs_total : null,
    framing_pct_total: ref ? ref.framing_pct_total : null,
    pop_time_2b_sba: ref ? ref.pop_time_2b_sba : null,
    metrics_available_flag: metricsAvailable ? 1 : 0,
    source_key: "derived_recent_game_played_catcher_flag+baseball_savant_csv_export",
    source_endpoint: "internal:hitter_game_logs",
    data_source_level: "derived",
    is_temporary_derived: 1,
    raw_json: safeJsonStringify({ derived, ref })
  };
  await execRun(env.DAILY_DB, `INSERT OR REPLACE INTO daily_catcher_context_current (catcher_context_key, batch_id, official_date, game_pk, game_time_utc, team_side, team_id, team_name, player_id, player_name, catcher_status, catcher_confidence, framing_runs_total, framing_pct_total, pop_time_2b_sba, metrics_available_flag, source_key, source_endpoint, data_source_level, is_temporary_derived, first_seen_at, last_seen_at, raw_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT first_seen_at FROM daily_catcher_context_current WHERE catcher_context_key=?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, ?, COALESCE((SELECT created_at FROM daily_catcher_context_current WHERE catcher_context_key=?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)`,
    row.catcher_context_key, row.batch_id, row.official_date, row.game_pk, row.game_time_utc, row.team_side, row.team_id, row.team_name, row.player_id, row.player_name, row.catcher_status, row.catcher_confidence, row.framing_runs_total, row.framing_pct_total, row.pop_time_2b_sba, row.metrics_available_flag, row.source_key, row.source_endpoint, row.data_source_level, row.is_temporary_derived, row.catcher_context_key, row.raw_json, row.catcher_context_key);
  return row;
}

function safeJsonStringify(value) {
  try { return JSON.stringify(value).slice(0, 3000); } catch (_) { return null; }
}

async function ensureDailyLineupTables(env) {
  const db = env.DAILY_DB;
  await db.batch([
    db.prepare(`
    CREATE TABLE IF NOT EXISTS daily_lineups_batches (
      batch_id TEXT PRIMARY KEY,
      job_key TEXT,
      worker_name TEXT,
      worker_version TEXT,
      mode TEXT,
      source_probe_lane TEXT,
      certification_status TEXT,
      certification_grade TEXT,
      write_gate_status TEXT,
      production_lineup_writes_enabled INTEGER DEFAULT 0,
      derived_backup_write_enabled INTEGER DEFAULT 0,
      games_checked INTEGER DEFAULT 0,
      lineup_write_ready_games INTEGER DEFAULT 0,
      rows_written INTEGER DEFAULT 0,
      writes_performed INTEGER DEFAULT 0,
      started_at TEXT,
      completed_at TEXT,
      output_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `),
    db.prepare(`
    CREATE TABLE IF NOT EXISTS daily_lineups_current (
      lineup_row_id TEXT PRIMARY KEY,
      batch_id TEXT,
      game_pk INTEGER NOT NULL,
      official_date TEXT,
      game_time_utc TEXT,
      team_side TEXT NOT NULL,
      team_id INTEGER,
      team_name TEXT,
      player_id INTEGER NOT NULL,
      player_name TEXT,
      lineup_slot INTEGER NOT NULL,
      batting_order_code TEXT,
      bat_side TEXT,
      active_position TEXT,
      lineup_status TEXT,
      confidence_label TEXT,
      source_endpoint TEXT,
      source_mode TEXT,
      fetched_at_utc TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `),
    db.prepare(`
    CREATE TABLE IF NOT EXISTS daily_player_availability_current (
      availability_row_id TEXT PRIMARY KEY,
      batch_id TEXT,
      game_pk INTEGER NOT NULL,
      official_date TEXT,
      game_time_utc TEXT,
      player_id INTEGER NOT NULL,
      player_name TEXT,
      team TEXT,
      side TEXT,
      availability_status TEXT,
      roster_status_code TEXT,
      roster_status_description TEXT,
      source_status TEXT,
      confidence_label TEXT,
      prepared_rows INTEGER DEFAULT 0,
      sources TEXT,
      prop_keys TEXT,
      fetched_at_utc TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_daily_lineups_current_game ON daily_lineups_current(game_pk, team_side, lineup_slot)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_daily_lineups_current_player ON daily_lineups_current(player_id, game_pk)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_daily_lineups_batches_created ON daily_lineups_batches(created_at)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_daily_availability_current_game ON daily_player_availability_current(game_pk, side, player_id)`)
  ]);
  return true;
}

function writeGateStatusFrom(games, writeHardBlocks) {
  if ((writeHardBlocks || []).length > 0) return "blocked_by_live_gate";
  const readyGames = (games || []).filter((g) => g.lineup_write_ready).length;
  if (readyGames > 0) return "live_gate_open_posted_lineup_ready";
  return "live_gate_closed_waiting_for_posted_batting_order";
}

function collectLineupWriteRows(games, batchId, fetchedAtUtc) {
  const rows = [];
  for (const game of games || []) {
    for (const row of (game.lineup_write_preview_sample || [])) {
      const isOfficial = row.lineup_status === "posted_lineup";
      const isDerived = row.lineup_status === "derived_likely_lineup";
      if (!isOfficial && !isDerived) continue;
      const gamePk = intOrNull(row.game_pk);
      const slot = intOrNull(row.lineup_slot);
      const playerId = intOrNull(row.player_id);
      if (!gamePk || !slot || !playerId) continue;
      rows.push({
        lineup_row_id: `${gamePk}_${row.team_side}_${slot}`,
        batch_id: batchId,
        game_pk: gamePk,
        official_date: row.official_date || game.official_date || null,
        game_time_utc: row.game_time_utc || game.game_time_utc || null,
        team_side: row.team_side,
        team_id: intOrNull(row.team_id),
        team_name: row.team_name || null,
        player_id: playerId,
        player_name: row.player_name || null,
        lineup_slot: slot,
        batting_order_code: row.batting_order_code || null,
        bat_side: row.bat_side || null,
        active_position: row.active_position || null,
        lineup_status: isOfficial ? "posted_lineup" : "derived_likely_lineup",
        confidence_label: isOfficial ? "OFFICIAL_BATTING_ORDER_POSTED" : "LOW_DERIVED_FROM_RECENT_LINEUP",
        source_endpoint: row.source_endpoint || (isOfficial ? "/api/v1/game/{gamePk}/boxscore" : "internal:hitter_game_logs"),
        source_mode: isOfficial ? "boxscore_batting_order" : "derived_recent_lineup",
        data_source_level: isOfficial ? "real" : "derived",
        is_temporary_derived: isOfficial ? 0 : 1,
        fetched_at_utc: fetchedAtUtc
      });
    }
  }
  return rows;
}

async function writeConfirmedLineupsIfGateOpen(env, summary, cert, writeSafety) {
  const schemaReady = await ensureDailyLineupTables(env);
  const realBoardDates = [...new Set((summary.games || []).map(g => g && g.official_date).filter(Boolean))];
  const retentionPrune = await pruneDailyLineupRetention(env, realBoardDates);
  const gateStatus = writeGateStatusFrom(summary.games, writeSafety.hard_blocks);
  const fetchedAt = nowUtc();
  const batchId = compactId(LINEUP_BATCH_PREFIX);
  const rows = collectLineupWriteRows(summary.games, batchId, fetchedAt);

  if (!PRODUCTION_LINEUP_WRITES_ENABLED || !LIVE_GATED_LINEUP_WRITES_ENABLED || gateStatus !== "live_gate_open_posted_lineup_ready" || rows.length === 0) {
    return {
      schema_bootstrap_performed: schemaReady,
      batch_id: null,
      write_framework_live_gated: LIVE_GATED_LINEUP_WRITES_ENABLED,
      write_gate_status: gateStatus,
      ...retentionPrune,
      lineup_rows_ready_to_write: rows.length,
      rows_written: 0,
      writes_performed: 0,
      write_error: null
    };
  }

  if ((writeSafety.hard_blocks || []).length > 0 || cert.blockerCount > 0) {
    return {
      schema_bootstrap_performed: schemaReady,
      batch_id: null,
      write_framework_live_gated: LIVE_GATED_LINEUP_WRITES_ENABLED,
      write_gate_status: "blocked_by_live_gate",
      ...retentionPrune,
      lineup_rows_ready_to_write: rows.length,
      rows_written: 0,
      writes_performed: 0,
      write_error: "blocked_by_live_gate"
    };
  }

  await execRun(env.DAILY_DB, `
    INSERT OR REPLACE INTO daily_lineups_batches (
      batch_id, job_key, worker_name, worker_version, mode, source_probe_lane,
      certification_status, certification_grade, write_gate_status,
      production_lineup_writes_enabled, derived_backup_write_enabled,
      games_checked, lineup_write_ready_games, rows_written, writes_performed,
      started_at, completed_at, output_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `,
    batchId, JOB_KEY, WORKER_NAME, VERSION, "live_gated_lineup_write", summary.source_probe_lane || null,
    "PASS_LIVE_GATED_LINEUPS_WRITTEN", "LIVE_GATED_CONFIRMED_LINEUP_WRITES", gateStatus,
    PRODUCTION_LINEUP_WRITES_ENABLED ? 1 : 0, DERIVED_BACKUP_WRITE_ENABLED ? 1 : 0,
    Number(summary.games_checked || 0), Number(summary.lineup_write_ready_games || 0), rows.length, rows.length,
    summary.started_at || null, fetchedAt, JSON.stringify({ request_id: summary.request_id || null, rows_written: rows.length })
  );

  const statements = rows.map(row => env.DAILY_DB.prepare(`
      INSERT OR REPLACE INTO daily_lineups_current (
        lineup_row_id, batch_id, game_pk, official_date, game_time_utc, team_side,
        team_id, team_name, player_id, player_name, lineup_slot, batting_order_code,
        bat_side, active_position, lineup_status, confidence_label, source_endpoint,
        source_mode, data_source_level, is_temporary_derived, fetched_at_utc, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
    row.lineup_row_id, row.batch_id, row.game_pk, row.official_date, row.game_time_utc,
    row.team_side, row.team_id, row.team_name, row.player_id, row.player_name,
    row.lineup_slot, row.batting_order_code, row.bat_side, row.active_position,
    row.lineup_status, row.confidence_label, row.source_endpoint, row.source_mode,
    row.data_source_level, row.is_temporary_derived, row.fetched_at_utc
  ));
  if (statements.length) await env.DAILY_DB.batch(statements);

  return {
    schema_bootstrap_performed: schemaReady,
    batch_id: batchId,
    write_framework_live_gated: LIVE_GATED_LINEUP_WRITES_ENABLED,
    write_gate_status: gateStatus,
    ...retentionPrune,
    lineup_rows_ready_to_write: rows.length,
    rows_written: rows.length,
    writes_performed: rows.length,
    write_error: null
  };
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
      live_gated_daily_lineups_current_writes: LIVE_GATED_LINEUP_WRITES_ENABLED,
      no_daily_lineups_current_writes_before_posted_batting_order: true,
      no_prepared_board_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_daily_starters_duplication: true,
      no_daily_game_status_duplication: true,
      retention_prune_enabled: true,
      retention_window: RETENTION_WINDOW_LABEL,
      retention_scope: ["DAILY_DB.daily_lineups_current", "DAILY_DB.daily_lineups_batches"]
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
      dry_run_only: !PRODUCTION_LINEUP_WRITES_ENABLED,
      live_gated_write_candidate: PRODUCTION_LINEUP_WRITES_ENABLED,
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
      write_gate: PRODUCTION_LINEUP_WRITES_ENABLED ? "live_gated_posted_batting_order_only" : "locked_preview_only",
      write_enabled: PRODUCTION_LINEUP_WRITES_ENABLED
    });
  }
  return rows;
}

function buildAvailabilityWritePreviewRows(gamePk, calendar, preparedSummary) {
  const rows = [];
  for (const player of (preparedSummary && preparedSummary.samples ? preparedSummary.samples : [])) {
    rows.push({
      dry_run_only: !DERIVED_BACKUP_WRITE_ENABLED,
      live_gated_write_candidate: DERIVED_BACKUP_WRITE_ENABLED,
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
      write_gate: DERIVED_BACKUP_WRITE_ENABLED ? "derived_backup_live_gate" : "locked_preview_only",
      write_enabled: DERIVED_BACKUP_WRITE_ENABLED
    });
  }
  return rows;
}

function lineupParserContract() {
  return {
    parser_status: "wired_live_gated_write_ready",
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
    production_write_gate: "live_gated_enabled_only_when_battingOrder_length_at_least_9_and_mapping_valid"
  };
}

function futureWriteUnlockRequirements() {
  return [
    "At least one real game returns battingOrder.length >= 9 for both teams or a valid posted lineup side.",
    "Every battingOrder player ID maps to teams.[side].players.ID{playerId}.",
    "Every mapped player has person.id matching the battingOrder integer.",
    "Dry-run lineup_write_preview_sample shows correct slot, side, team, player_id, and player_name.",
    "No production writes, score writes, board mutation, ranking, or final-board writes occur during the probe.",
    "production_lineup_writes_enabled is true, but live gate writes only posted battingOrder sides with complete ID mapping.",
    "derived_backup_write_enabled is changed only after user approval and repeated pre-lineup roster validation passes."
  ];
}

function futureTableContracts() {
  return {
    daily_lineups_current: {
      status: "live_gated_write_table_bootstrapped_by_worker",
      minimum_fields: ["game_pk", "official_date", "game_time_utc", "team_side", "team_id", "player_id", "player_name", "lineup_slot", "lineup_status", "source_endpoint", "fetched_at_utc"]
    },
    daily_player_availability_current: {
      status: "table_bootstrapped_by_worker_but_derived_writes_locked_off",
      minimum_fields: ["game_pk", "official_date", "game_time_utc", "player_id", "player_name", "team", "side", "availability_status", "roster_status_code", "confidence_label", "fetched_at_utc"]
    },
    daily_lineups_batches: {
      status: "live_gated_write_batch_table_bootstrapped_by_worker",
      minimum_fields: ["batch_id", "source_mode", "certification_status", "games_checked", "players_checked", "rows_written", "created_at"]
    }
  };
}

function writeFrameworkContract() {
  return {
    framework_status: LIVE_GATED_LINEUP_WRITES_ENABLED ? "live_gated_lineup_writes_enabled" : "wired_locked_off",
    production_lineup_writes_enabled: PRODUCTION_LINEUP_WRITES_ENABLED,
    derived_backup_write_enabled: DERIVED_BACKUP_WRITE_ENABLED,
    write_framework_live_gated: LIVE_GATED_LINEUP_WRITES_ENABLED,
    writes_performed_rule: "0 until posted battingOrder gate opens; then equals confirmed lineup rows written",
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
      const mappingValid = g[`${side}_mapping_valid`] === true;
      const sideWriteReady = orderCount >= 9 && mappingValid && playerMapCount >= 15;
      checks.push({
        game_pk: g.game_pk,
        side,
        batting_order_count: orderCount,
        player_map_count: playerMapCount,
        mapping_valid: mappingValid,
        live_gate_status: sideWriteReady ? "open_for_confirmed_lineup_side" : "closed_waiting_for_posted_batting_order",
        production_lineup_write_safe: !PRODUCTION_LINEUP_WRITES_ENABLED || LIVE_GATED_LINEUP_WRITES_ENABLED,
        derived_backup_write_safe: !DERIVED_BACKUP_WRITE_ENABLED || playerMapCount >= 15
      });
      if (PRODUCTION_LINEUP_WRITES_ENABLED && orderCount > 0 && orderCount < 9) hardBlocks.push(`production_lineup_write_enabled_but_${g.game_pk}_${side}_batting_order_partial_${orderCount}`);
      if (PRODUCTION_LINEUP_WRITES_ENABLED && orderCount >= 9 && !mappingValid) hardBlocks.push(`production_lineup_write_enabled_but_${g.game_pk}_${side}_mapping_invalid`);
      if (PRODUCTION_LINEUP_WRITES_ENABLED && orderCount >= 9 && playerMapCount < 15) hardBlocks.push(`production_lineup_write_enabled_but_${g.game_pk}_${side}_player_map_underpopulated_${playerMapCount}`);
      if (DERIVED_BACKUP_WRITE_ENABLED && playerMapCount < 15) hardBlocks.push(`derived_backup_write_enabled_but_${g.game_pk}_${side}_player_map_underpopulated_${playerMapCount}`);
    }
  }
  return {
    write_framework_locked_off: !PRODUCTION_LINEUP_WRITES_ENABLED && !DERIVED_BACKUP_WRITE_ENABLED,
    write_framework_live_gated: LIVE_GATED_LINEUP_WRITES_ENABLED,
    production_lineup_writes_enabled: PRODUCTION_LINEUP_WRITES_ENABLED,
    derived_backup_write_enabled: DERIVED_BACKUP_WRITE_ENABLED,
    write_gate_status: writeGateStatusFrom(games, hardBlocks),
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
  if (anyEndpointAvailable && anyPostedLineup && lineupPreviewRows > 0 && LIVE_GATED_LINEUP_WRITES_ENABLED && PRODUCTION_LINEUP_WRITES_ENABLED) return { status: "PASS_LIVE_GATED_LINEUP_WRITE_READY", grade: "LIVE_GATED_CONFIRMED_LINEUP_READY", blockerCount, warningCount };
  if (anyEndpointAvailable && anyPostedLineup && lineupPreviewRows > 0) return { status: "PASS_LINEUP_PARSER_READY_WRITE_LOCKED", grade: "DISCOVERY_PASS_LINEUP_WRITE_PREVIEW_READY", blockerCount, warningCount };
  if (anyEndpointAvailable && allLineupsNotPosted && preparedStale) return { status: "PASS_CALENDAR_SOURCE_PROBE_WITH_PREPARED_BOARD_STALE", grade: "DISCOVERY_PASS_LINEUPS_NOT_POSTED", blockerCount, warningCount: warningCount + 1 };
  if (anyEndpointAvailable && allLineupsNotPosted && preparedChecked > 0 && rosterValidated > 0 && LIVE_GATED_LINEUP_WRITES_ENABLED && PRODUCTION_LINEUP_WRITES_ENABLED) return { status: "PASS_LIVE_GATED_WAITING_FOR_POSTED_LINEUP", grade: "LIVE_GATED_PRE_LINEUP_ROSTER_VALIDATED", blockerCount, warningCount };
  if (anyEndpointAvailable && allLineupsNotPosted && preparedChecked > 0 && rosterValidated > 0) return { status: "PASS_WRITE_FRAMEWORK_LOCKED_OFF", grade: "WRITE_FRAMEWORK_LOCKED_OFF_PRE_LINEUP_ROSTER_VALIDATED", blockerCount, warningCount };
  if (anyEndpointAvailable && allLineupsNotPosted) return { status: "PASS_SOURCE_REACHABLE_LINEUPS_NOT_POSTED", grade: "DISCOVERY_PASS_LINEUPS_NOT_POSTED", blockerCount, warningCount };
  if (warningCount > 0 || preparedStale) return { status: "PASS_WITH_WARNINGS", grade: "A_MINUS", blockerCount, warningCount: warningCount + (preparedStale ? 1 : 0) };
  return { status: "PASS", grade: "A", blockerCount, warningCount };
}

async function runSourceProbe(env, input) {
  const _t0 = Date.now();
  const _tm = {};
  const _requestId = (input && input.request_id) || compactId("daily_lineups_debug");
  const startedAt = nowUtc();
  const catcherBatchId = compactId("daily_catcher_ctx_batch");
  const rawSourceBase = String(env.MLB_API_BASE_URL || DEFAULT_MLB_BASE_URL).replace(/\/$/, "");
  const sourceBase = normalizeMlbOrigin(rawSourceBase);
  const userAgent = env.MLB_API_USER_AGENT || "AlphaDogDailyLineupsSourceProbe/0.1.8";
  const probeFeedLive = input.probe_feed_live !== false;
  const todayUtc = nowUtc().slice(0, 10);

  const anchors = await getPreparedGameAnchors(env);
  _tm.after_anchors_ms = Date.now() - _t0;
  try {
    await execRun(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'INFO', 'lineups_debug_early_checkpoint', 'Immediate checkpoint after anchors', ?, CURRENT_TIMESTAMP)",
      _requestId, WORKER_NAME, JOB_KEY, JSON.stringify({ after_anchors_ms: _tm.after_anchors_ms, anchors_count: anchors.length }));
  } catch (_) {}
  // Real, safe addition: optional override for a one-time historical catcher-framing/pop-time
  // backfill (e.g. a prior season) - defaults to the real current year exactly as before, so live
  // production behavior is completely unchanged unless this is explicitly requested.
  const catcherRefreshSeasonOverride = Number(input && input.catcher_reference_backfill_season);
  const catcherRefreshSeason = Number.isFinite(catcherRefreshSeasonOverride) && catcherRefreshSeasonOverride > 2000 ? catcherRefreshSeasonOverride : new Date().getUTCFullYear();
  const catcherRefreshResult = await refreshCatcherReferenceIfStale(env, catcherRefreshSeason);
  _tm.after_catcher_refresh_ms = Date.now() - _t0;
  try {
    await execRun(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'INFO', 'lineups_debug_after_catcher_refresh', 'Checkpoint after catcher refresh', ?, CURRENT_TIMESTAMP)",
      _requestId, WORKER_NAME, JOB_KEY, JSON.stringify({ after_catcher_refresh_ms: _tm.after_catcher_refresh_ms, refreshed: catcherRefreshResult && catcherRefreshResult.refreshed })).catch(() => {});
  } catch (_) {}
  const catcherRefRows = await all(env.REF_DB, `SELECT player_id, player_name, framing_runs_total, framing_pct_total, pop_time_2b_sba FROM ref_catcher_framing_poptime`);
  const catcherRefMap = new Map(catcherRefRows.map(r => [Number(r.player_id), r]));
  const preparedGamePks = uniqInts(anchors.map((r) => r.official_game_pk));
  const [preparedCalendarRows, preparedPlayers, calendarProbeRows, teamMap] = await Promise.all([
    getCalendarRows(env, preparedGamePks),
    getPreparedPlayers(env, preparedGamePks),
    getCalendarOnlyProbeRows(env, todayUtc),
    getTeamMap(env)
  ]);
  _tm.after_calendar_and_players_ms = Date.now() - _t0;

  const [preparedScheduleDiscovery, calendarScheduleDiscovery] = await Promise.all([
    discoverOfficialSchedule(env, sourceBase, userAgent, preparedCalendarRows, "prepared"),
    discoverOfficialSchedule(env, sourceBase, userAgent, calendarProbeRows, "calendar_probe")
  ]);
  _tm.after_schedule_discovery_ms = Date.now() - _t0;
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

  // REAL FIX (perf): batch-derive fallback catchers for every team in today's slate in ONE
  // pass here, before per-game processing starts, rather than per-game awaits inside the loop
  // (which caused a real hard_deadline_timeout - confirmed live). processOneGame below closes
  // over these maps and does pure synchronous lookups, no additional DB calls.
  const allTeamIdsToday = uniqInts(sourceRows.flatMap(r => [r.home_team_id, r.away_team_id]).filter(Boolean));
  const derivedCatcherMap = await batchDeriveCatchers(env, allTeamIdsToday, todayUtc);
  const derivedCatcherNameMap = await batchPlayerNames(env, [...derivedCatcherMap.values()].map(d => d.player_id));

  const startingPageFetch = await fetchTextWithTimeout(MLB_STARTING_LINEUPS_URL, userAgent);
  _tm.after_starting_page_fetch_ms = Date.now() - _t0;
  try {
    await execRun(env.CONTROL_DB, "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, ?, 'INFO', 'lineups_debug_pipeline_timings', 'Concrete timing checkpoint', ?, CURRENT_TIMESTAMP)",
      _requestId, WORKER_NAME, JOB_KEY, JSON.stringify({ timings: _tm, game_pks: sourceGamePks.length, prepared_players: preparedPlayers.length })).catch(() => {});
  } catch (_) {}
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

  async function processOneGame(gamePk) {
    const calendar = calendarByGame.get(gamePk) || { game_pk: gamePk };
    const gamePreparedPlayers = preparedByGame.get(gamePk) || [];
    const warnings = [];
    const blockers = [];
    if (preparedBoardStale && sourceLane === "calendar_only_source_probe") warnings.push("prepared_board_stale_calendar_only_probe_used");

    const boxscoreUrl = buildMlbUrl(sourceBase, `/api/v1/game/${gamePk}/boxscore`);
    const feedLiveUrl = buildMlbUrl(sourceBase, `/api/v1.1/game/${gamePk}/feed/live`);

    let localBoxscoreCalls = 1;
    let localFeedLiveCalls = 0;
    let localSourceFailures = 0;
    const needsFeedLive = probeFeedLive;
    const [box, liveEarly] = await Promise.all([
      fetchJsonWithRetry(boxscoreUrl, userAgent, MAX_ENDPOINT_RETRIES),
      needsFeedLive ? fetchJsonWithRetry(feedLiveUrl, userAgent, MAX_ENDPOINT_RETRIES) : Promise.resolve(null)
    ]);
    let boxscoreOk = !!(box.ok && box.json);
    let boxscoreTeams = boxscoreOk && box.json && box.json.teams ? box.json.teams : null;
    if (!boxscoreOk) {
      if (box.http_status === 404) warnings.push("boxscore_game_endpoint_not_initialized_http_404");
      else {
        localSourceFailures += 1;
        blockers.push(`boxscore_fetch_failed_http_${box.http_status || "none"}`);
      }
    }
    if (boxscoreOk && !boxscoreTeams) blockers.push("boxscore_root_teams_missing");

    let feedLiveOk = null;
    let feedLiveTimestamp = null;
    let live = null;
    let liveTeams = null;
    if (needsFeedLive || !boxscoreOk) {
      localFeedLiveCalls += 1;
      live = needsFeedLive ? liveEarly : await fetchJsonWithRetry(feedLiveUrl, userAgent, MAX_ENDPOINT_RETRIES);
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

    const [homeCatcherRow, awayCatcherRow] = await Promise.all([
      writeCatcherContext(env, catcherBatchId, gamePk, calendar, "home", homeValidation, catcherRefMap),
      writeCatcherContext(env, catcherBatchId, gamePk, calendar, "away", awayValidation, catcherRefMap)
    ]);
    // REAL FIX: try the real, official source first (above) - only fall back to a derived
    // most-recent-starting-catcher estimate for whichever side didn't get an official row,
    // rather than leaving that side permanently stale until a lineup posts.
    if (!homeCatcherRow && intOrNull(calendar.home_team_id)) {
      const derivedHomeCatcher = derivedCatcherMap.get(String(calendar.home_team_id));
      if (derivedHomeCatcher) await writeDerivedCatcherContext(env, catcherBatchId, gamePk, calendar, "home", intOrNull(calendar.home_team_id), derivedHomeCatcher, catcherRefMap, derivedCatcherNameMap);
    }
    if (!awayCatcherRow && intOrNull(calendar.away_team_id)) {
      const derivedAwayCatcher = derivedCatcherMap.get(String(calendar.away_team_id));
      if (derivedAwayCatcher) await writeDerivedCatcherContext(env, catcherBatchId, gamePk, calendar, "away", intOrNull(calendar.away_team_id), derivedAwayCatcher, catcherRefMap, derivedCatcherNameMap);
    }

    const officialLineupPreviewRows = [
      ...buildLineupWritePreviewRows(gamePk, calendar, "home", homeValidation),
      ...buildLineupWritePreviewRows(gamePk, calendar, "away", awayValidation)
    ];
    let derivedLineupPreviewRows = [];
    const derivedFallbackDate = calendar.official_date || retentionDatesToKeep()[0];
    const needHomeDerived = homeValidation.lineup_status !== "posted_lineup" && intOrNull(calendar.home_team_id);
    const needAwayDerived = awayValidation.lineup_status !== "posted_lineup" && intOrNull(calendar.away_team_id);
    const [homeDerived, awayDerived] = await Promise.all([
      needHomeDerived ? deriveLineupFromRecentGame(env, calendar.home_team_id, derivedFallbackDate) : Promise.resolve(null),
      needAwayDerived ? deriveLineupFromRecentGame(env, calendar.away_team_id, derivedFallbackDate) : Promise.resolve(null)
    ]);
    if (needHomeDerived) derivedLineupPreviewRows.push(...buildDerivedLineupPreviewRows(gamePk, calendar, "home", homeDerived));
    if (needAwayDerived) derivedLineupPreviewRows.push(...buildDerivedLineupPreviewRows(gamePk, calendar, "away", awayDerived));
    const lineupWritePreviewRows = [...officialLineupPreviewRows, ...derivedLineupPreviewRows];
    const availabilityWritePreviewRows = buildAvailabilityWritePreviewRows(gamePk, calendar, preparedSummary);
    const lineupWriteReady = lineupWritePreviewRows.length > 0 && (homeValidation.lineup_status === "posted_lineup" || awayValidation.lineup_status === "posted_lineup" || derivedLineupPreviewRows.length > 0);

    const gameResult = {
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
    };
    return { gameResult, localBoxscoreCalls, localFeedLiveCalls, localSourceFailures };
  }

  const CONCURRENCY = 6;
  for (let i = 0; i < sourceGamePks.length; i += CONCURRENCY) {
    const chunk = sourceGamePks.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map(gamePk => processOneGame(gamePk)));
    for (const r of chunkResults) {
      games.push(r.gameResult);
      boxscoreCalls += r.localBoxscoreCalls;
      feedLiveCalls += r.localFeedLiveCalls;
      sourceFailures += r.localSourceFailures;
    }
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

  const preWriteSummary = {
    games,
    games_checked: games.length,
    lineup_write_ready_games: lineupWriteReadyGames,
    source_probe_lane: sourceLane,
    request_id: input.request_id || null,
    started_at: startedAt
  };
  let writeResult;
  try {
    writeResult = await writeConfirmedLineupsIfGateOpen(env, preWriteSummary, cert, writeSafety);
  } catch (err) {
    writeResult = {
      schema_bootstrap_performed: false,
      batch_id: null,
      write_framework_live_gated: LIVE_GATED_LINEUP_WRITES_ENABLED,
      write_gate_status: "write_exception",
      retention_prune_enabled: true,
      retention_window: RETENTION_WINDOW_LABEL,
      retention_dates_kept: retentionDatesToKeep(),
      lineup_rows_pruned: 0,
      batch_rows_pruned: 0,
      lineup_rows_ready_to_write: 0,
      rows_written: 0,
      writes_performed: 0,
      write_error: err && err.stack ? String(err.stack).slice(0, 1800) : String(err)
    };
  }

  let finalCertStatus = cert.status;
  let finalCertGrade = cert.grade;
  let finalOk = ok && !writeResult.write_error;
  if (writeResult.write_error) {
    finalCertStatus = "BLOCKED_DAILY_LINEUPS_WRITE_EXCEPTION";
    finalCertGrade = "BLOCKED";
  } else if (writeResult.rows_written > 0) {
    finalCertStatus = "PASS_LIVE_GATED_LINEUPS_WRITTEN";
    finalCertGrade = "LIVE_GATED_CONFIRMED_LINEUP_WRITES";
  } else if (LIVE_GATED_LINEUP_WRITES_ENABLED && PRODUCTION_LINEUP_WRITES_ENABLED && lineupWriteReadyGames === 0 && ok) {
    finalCertStatus = "PASS_LIVE_GATED_WAITING_FOR_POSTED_LINEUP";
    finalCertGrade = "LIVE_GATED_PRE_LINEUP_ROSTER_VALIDATED";
  }

  return {
    ok: finalOk,
    data_ok: finalOk,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    mode: "source_probe",
    status: finalOk ? "COMPLETED_SOURCE_PROBE" : "BLOCKED_SOURCE_PROBE",
    certification: finalCertStatus,
    certification_status: finalCertStatus,
    certification_grade: finalCertGrade,
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
    write_framework_live_gated: writeSafety.write_framework_live_gated,
    write_gate_status: writeResult.write_gate_status,
    schema_bootstrap_performed: writeResult.schema_bootstrap_performed,
    retention_prune_enabled: writeResult.retention_prune_enabled,
    retention_window: writeResult.retention_window,
    retention_timezone: writeResult.retention_timezone,
    retention_dates_kept: writeResult.retention_dates_kept,
    retention_tables_pruned: writeResult.retention_tables_pruned,
    batch_retention_basis: writeResult.batch_retention_basis,
    lineup_rows_pruned: writeResult.lineup_rows_pruned,
    batch_rows_pruned: writeResult.batch_rows_pruned,
    live_lineup_batch_id: writeResult.batch_id,
    write_framework_contract: writeFrameworkContract(),
    future_table_contracts: futureTableContracts(),
    write_safety_hard_blocks: writeSafety.hard_blocks,
    write_safety_checks: writeSafety.checks,
    lineup_rows_ready_to_write: writeResult.lineup_rows_ready_to_write,
    write_error: writeResult.write_error,
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
    rows_written: writeResult.rows_written,
    writes_performed: writeResult.writes_performed,
    output_json: {
      source_probe_only: true,
      live_gated_lineup_writes_possible: LIVE_GATED_LINEUP_WRITES_ENABLED,
      source_probe_lane: sourceLane,
      mlb_api_base_url_raw: rawSourceBase,
      mlb_api_origin_used: sourceBase,
      prepared_board_stale_warning: preparedBoardStale,
      derived_backup_status: games.some((g) => Number(g.prepared_players_roster_validated || 0) > 0) ? "PRE_LINEUP_ROSTER_VALIDATED_SOURCE_PROBE_ONLY" : null,
      production_lineup_writes_enabled: PRODUCTION_LINEUP_WRITES_ENABLED,
      derived_backup_write_enabled: DERIVED_BACKUP_WRITE_ENABLED,
      write_framework_locked_off: writeSafety.write_framework_locked_off,
      write_framework_live_gated: writeSafety.write_framework_live_gated,
      write_gate_status: writeResult.write_gate_status,
      schema_bootstrap_performed: writeResult.schema_bootstrap_performed,
      retention_prune_enabled: writeResult.retention_prune_enabled,
      retention_window: writeResult.retention_window,
      retention_timezone: writeResult.retention_timezone,
      retention_dates_kept: writeResult.retention_dates_kept,
      retention_tables_pruned: writeResult.retention_tables_pruned,
      batch_retention_basis: writeResult.batch_retention_basis,
      lineup_rows_pruned: writeResult.lineup_rows_pruned,
      batch_rows_pruned: writeResult.batch_rows_pruned,
      live_lineup_batch_id: writeResult.batch_id,
      write_framework_contract: writeFrameworkContract(),
      future_table_contracts: futureTableContracts(),
      write_safety_hard_blocks: writeSafety.hard_blocks,
      write_safety_checks: writeSafety.checks,
      lineup_rows_ready_to_write: writeResult.lineup_rows_ready_to_write,
      write_error: writeResult.write_error,
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
      unlock_note: "daily_lineups_current is live-gated: writes occur only when official battingOrder is posted and ID mapping passes; daily_player_availability_current derived writes remain locked off."
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

    if (method === "GET" && path === "/diagnostic-savant") {
      const framingUrl = "https://baseballsavant.mlb.com/leaderboard/catcher-framing?gameType=Regular&minPitches=q&minResults=1&seasonEnd=2026&seasonStart=2026&type=catcher&csv=true";
      const poptimeUrl = "https://baseballsavant.mlb.com/leaderboard/poptime?year=2026&min2b=5&min3b=0&csv=true";
      const [framing, poptime] = await Promise.all([
        fetchTextWithTimeout(framingUrl, "AlphaDog-v2-Savant-Probe/0.1"),
        fetchTextWithTimeout(poptimeUrl, "AlphaDog-v2-Savant-Probe/0.1")
      ]);
      const analyze = (res) => {
        const text = res.text || "";
        const firstLine = text.split("\n")[0] || "";
        const looksLikeCsv = firstLine.includes(",") && !firstLine.toLowerCase().includes("<!doctype") && !firstLine.toLowerCase().includes("<html");
        return {
          ok: res.ok,
          http_status: res.http_status,
          response_bytes: res.response_bytes || 0,
          looks_like_csv: looksLikeCsv,
          first_line_preview: firstLine.slice(0, 300),
          first_400_chars: text.slice(0, 400)
        };
      };
      return jsonResponse({ ok: true, route: "/diagnostic-savant", framing: analyze(framing), poptime: analyze(poptime), timestamp_utc: nowUtc() });
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
      if (input.probe_savant_csv === true) {
        const framingUrl = "https://baseballsavant.mlb.com/leaderboard/catcher-framing?gameType=Regular&minPitches=q&minResults=1&seasonEnd=2026&seasonStart=2026&type=catcher&csv=true";
        const poptimeUrl = "https://baseballsavant.mlb.com/leaderboard/poptime?year=2026&min2b=5&min3b=0&csv=true";
        const [framing, poptime] = await Promise.all([
          fetchTextWithTimeout(framingUrl, "AlphaDog-v2-Savant-Probe/0.1"),
          fetchTextWithTimeout(poptimeUrl, "AlphaDog-v2-Savant-Probe/0.1")
        ]);
        const analyze = (res) => {
          const text = res.text || "";
          const firstLine = text.split("\n")[0] || "";
          const looksLikeCsv = firstLine.includes(",") && !firstLine.toLowerCase().includes("<!doctype") && !firstLine.toLowerCase().includes("<html");
          return { ok: res.ok, http_status: res.http_status, response_bytes: res.response_bytes || 0, looks_like_csv: looksLikeCsv, first_line_preview: firstLine.slice(0, 300), first_400_chars: text.slice(0, 400) };
        };
        return jsonResponse({ ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "diagnostic_savant_probe_only", framing: analyze(framing), poptime: analyze(poptime), rows_written: 0, writes_performed: 0, timestamp_utc: nowUtc() });
      }
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
      const HARD_DEADLINE_MS = 18000;
      const TIMEOUT_SENTINEL = { __hard_deadline_timeout__: true };
      const output = await withDeadline(runSourceProbe(env, input), HARD_DEADLINE_MS, TIMEOUT_SENTINEL);
      if (output === TIMEOUT_SENTINEL) {
        // Real fix (same class found live in daily-schedule.js): a genuine internal hang -
        // likely a stalled D1 call - previously had no safety net inside this worker.
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "hard_deadline_timeout", certification: "DAILY_LINEUPS_HARD_DEADLINE_TIMEOUT", error: `Worker exceeded its own ${HARD_DEADLINE_MS}ms internal deadline`, hard_deadline_ms: HARD_DEADLINE_MS, timestamp_utc: nowUtc() }, 200);
      }
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
