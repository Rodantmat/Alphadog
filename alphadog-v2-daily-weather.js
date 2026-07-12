const WORKER_NAME = "alphadog-v2-daily-weather";
const VERSION = "alphadog-v2-daily-weather-v0.1.5-batched-compact-weather-writes";
const JOB_KEY = "daily-weather";
const MLB_SOURCE_KEY = "official_mlb_statsapi_live_feed_weather";
const OPEN_METEO_SOURCE_KEY = "open_meteo_no_key_forecast";
const OPENWEATHER_SOURCE_KEY = "openweather_onecall_forecast";
const FETCH_TIMEOUT_MS = 2500;
const WEATHER_SOFT_LIMIT_MS = 90000;
const WEATHER_FETCH_CONCURRENCY = 4;

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "TEAM_DB", "DAILY_DB", "SCORE_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "MLB_API_BASE_URL", "OPEN_METEO_BASE_URL"];

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
function placeholders(n) { return Array.from({ length: n }, () => "?").join(","); }
function safeJson(value, max = 14000) {
  if (value === undefined || value === null) return null;
  let text;
  try { text = typeof value === "string" ? value : JSON.stringify(value); }
  catch (_) { text = String(value); }
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}
function bindingPresence(env, names) { const out = {}; for (const name of names) out[name] = Boolean(env && env[name]); return out; }
function varPresence(env, names) { const out = {}; for (const name of names) out[name] = env && env[name] !== undefined && env[name] !== null && String(env[name]).length > 0; return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
function baseIdentity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars = varPresence(env, EXPECTED_VARS);
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "READY_DAILY_WEATHER_ROOF_CONTEXT",
    timestamp_utc: nowUtc(),
    phase: "daily-context-phase-4-weather-roof-park-conditions",
    binding_summary: { required_db_bindings_present: allTrue(db), expected_vars_present: allTrue(vars) },
    guardrails: {
      unified_weather_roof_context: true,
      anchors_to_mlb_game_calendar_game_pk: true,
      prepared_board_relevance_only: true,
      current_retention_today_tomorrow_only: true,
      static_reference_data_may_persist: true,
      volatile_weather_data_not_stored_forever: true,
      no_calendar_rebuild: true,
      no_daily_starters_duplication: true,
      no_daily_lineups_duplication: true,
      no_daily_player_availability_duplication: true,
      no_score_db_mutation: true,
      no_board_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true
    }
  };
}
function dateOnly(value) {
  const m = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
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
function retentionWindowPt() {
  const today = todayPt();
  const tomorrow = addDays(today, 1);
  return { start: today, end: tomorrow, dates: [today, tomorrow] };
}
function intOrNull(v) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : null; }
function numOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function roundOrNull(v, d = 1) { const n = numOrNull(v); if (n === null) return null; const f = 10 ** d; return Math.round(n * f) / f; }
function mphFromMps(v) { const n = numOrNull(v); return n === null ? null : n * 2.23693629; }
function pressureHpaToMb(v) { const n = numOrNull(v); return n === null ? null : n; }
function directionCardinal(deg) {
  const n = numOrNull(deg);
  if (n === null) return null;
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round((((n % 360) + 360) % 360) / 22.5) % 16];
}
function normalizeRoofType(value) {
  const v = String(value || "").toLowerCase();
  if (!v) return "unknown";
  if (v.includes("retract")) return "retractable";
  if (v.includes("dome") || v.includes("indoor") || v.includes("fixed")) return "fixed_dome";
  if (v.includes("outdoor") || v.includes("open")) return "outdoor";
  return v.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}
function parseMlbWind(windText) {
  const text = String(windText || "").trim();
  if (!text) return { wind_speed_mph: null, wind_direction_cardinal: null, wind_context: null };
  const mph = text.match(/(\d+(?:\.\d+)?)\s*mph/i);
  const parts = text.split(",").map(s => s.trim()).filter(Boolean);
  return {
    wind_speed_mph: mph ? numOrNull(mph[1]) : null,
    wind_direction_cardinal: parts.length > 1 ? parts.slice(1).join(", ") : null,
    wind_context: text
  };
}
function extractMlbWeather(json) {
  const w = (json && json.gameData && json.gameData.weather) || (json && json.liveData && json.liveData.linescore && json.liveData.linescore.weather) || null;
  if (!w || typeof w !== "object") return { ok: false, source_key: MLB_SOURCE_KEY, weather: null };
  const wind = parseMlbWind(w.wind || w.windSpeed || w.windDescription || "");
  return {
    ok: true,
    source_key: MLB_SOURCE_KEY,
    weather: {
      condition: w.condition || w.conditions || null,
      temperature_f: numOrNull(w.temp || w.temperature || w.temperatureF),
      wind_speed_mph: wind.wind_speed_mph,
      wind_direction_cardinal: wind.wind_direction_cardinal,
      wind_context: wind.wind_context,
      raw_weather: w
    }
  };
}
function mlbV11Base(env) {
  const raw = String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com/api/v1").replace(/\/+$/, "");
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}/api/v1.1`;
  } catch (_) {
    return "https://statsapi.mlb.com/api/v1.1";
  }
}
function requestHeaders(env) {
  return { "accept": "application/json", "user-agent": String(env.MLB_API_USER_AGENT || "AlphaDog-v2-Daily-Weather/0.1 contact=Alphadog") };
}
async function fetchJson(url, env, optional = false) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { headers: requestHeaders(env), signal: controller.signal });
    const text = await resp.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { ok: resp.ok, optional, status: resp.status, url, json, text_preview: text.slice(0, 500), elapsed_ms: Date.now() - started };
  } catch (err) {
    return { ok: false, optional, status: null, url, json: null, error: String(err && err.message ? err.message : err), elapsed_ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}
async function ensureSchema(env) {
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_game_weather_batches (
    batch_id TEXT PRIMARY KEY,
    request_id TEXT,
    run_id TEXT,
    worker_name TEXT,
    worker_version TEXT,
    job_key TEXT,
    mode TEXT,
    status TEXT,
    window_start TEXT,
    window_end TEXT,
    calendar_games_checked INTEGER DEFAULT 0,
    prepared_games_checked INTEGER DEFAULT 0,
    prepared_rows_read INTEGER DEFAULT 0,
    weather_rows_written INTEGER DEFAULT 0,
    snapshot_rows_written INTEGER DEFAULT 0,
    indoor_games INTEGER DEFAULT 0,
    outdoor_games INTEGER DEFAULT 0,
    retractable_roof_games INTEGER DEFAULT 0,
    weather_source_failures INTEGER DEFAULT 0,
    roof_unknown_count INTEGER DEFAULT 0,
    weather_unknown_count INTEGER DEFAULT 0,
    blocker_count INTEGER DEFAULT 0,
    warning_count INTEGER DEFAULT 0,
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
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_game_weather_current (
    weather_key TEXT PRIMARY KEY,
    batch_id TEXT,
    game_pk INTEGER,
    official_date TEXT,
    game_time_utc TEXT,
    venue_id INTEGER,
    venue_name TEXT,
    home_team_id INTEGER,
    away_team_id INTEGER,
    prepared_board_relevant INTEGER DEFAULT 0,
    prepared_board_pickable_rows INTEGER DEFAULT 0,
    weather_status TEXT,
    weather_confidence TEXT,
    source_key TEXT,
    source_endpoint TEXT,
    source_snapshot_at TEXT,
    forecast_time_utc TEXT,
    forecast_offset_minutes INTEGER,
    temperature_f REAL,
    feels_like_f REAL,
    humidity_pct REAL,
    pressure_mb REAL,
    wind_speed_mph REAL,
    wind_gust_mph REAL,
    wind_direction_degrees REAL,
    wind_direction_cardinal TEXT,
    wind_context TEXT,
    precipitation_probability_pct REAL,
    precipitation_type TEXT,
    rain_risk_flag INTEGER DEFAULT 0,
    delay_risk_flag INTEGER DEFAULT 0,
    roof_type TEXT,
    roof_status TEXT,
    roof_confidence TEXT,
    indoor_flag INTEGER DEFAULT 0,
    retractable_roof_flag INTEGER DEFAULT 0,
    weather_applicable_flag INTEGER DEFAULT 1,
    park_weather_notes TEXT,
    first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
    changed_at TEXT,
    raw_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.DAILY_DB, `CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_game_weather_current_game ON daily_game_weather_current(game_pk)`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_daily_game_weather_current_date ON daily_game_weather_current(official_date)`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_daily_game_weather_current_status ON daily_game_weather_current(weather_status, roof_status)`);
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_game_weather_snapshots (
    snapshot_id TEXT PRIMARY KEY,
    batch_id TEXT,
    game_pk INTEGER,
    official_date TEXT,
    venue_id INTEGER,
    source_key TEXT,
    source_snapshot_at TEXT,
    forecast_time_utc TEXT,
    temperature_f REAL,
    wind_speed_mph REAL,
    wind_direction_degrees REAL,
    precipitation_probability_pct REAL,
    roof_status TEXT,
    weather_status TEXT,
    raw_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_daily_game_weather_snap_batch ON daily_game_weather_snapshots(batch_id)`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_daily_game_weather_snap_date ON daily_game_weather_snapshots(official_date)`);
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_game_weather_issues (
    issue_id TEXT PRIMARY KEY,
    batch_id TEXT,
    game_pk INTEGER,
    official_date TEXT,
    venue_id INTEGER,
    issue_status TEXT,
    issue_type TEXT,
    severity TEXT,
    reason TEXT,
    details_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_daily_game_weather_issues_batch ON daily_game_weather_issues(batch_id)`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_daily_game_weather_issues_date ON daily_game_weather_issues(official_date)`);
  await run(env.DAILY_DB, `INSERT OR IGNORE INTO daily_schema_migrations (migration_key, package_version, applied_at, notes) VALUES ('daily_game_weather_v0_1_0', ?, CURRENT_TIMESTAMP, 'Daily Context Phase 4 weather/roof/park-condition v2 tables')`, VERSION);
}
async function pruneRetention(env, retention, batchId) {
  const current = await run(env.DAILY_DB, `DELETE FROM daily_game_weather_current WHERE official_date IS NULL OR official_date NOT IN (?, ?)`, retention.start, retention.end);
  const snapshots = await run(env.DAILY_DB, `DELETE FROM daily_game_weather_snapshots WHERE official_date IS NULL OR official_date NOT IN (?, ?)`, retention.start, retention.end);
  const issues = await run(env.DAILY_DB, `DELETE FROM daily_game_weather_issues WHERE official_date IS NULL OR official_date NOT IN (?, ?)`, retention.start, retention.end);
  return {
    current_deleted: current && current.meta ? current.meta.changes : null,
    snapshots_deleted: snapshots && snapshots.meta ? snapshots.meta.changes : null,
    issues_deleted: issues && issues.meta ? issues.meta.changes : null,
    retention_date_start: retention.start,
    retention_date_end: retention.end,
    protected_batch_id: batchId || null
  };
}
async function getPreparedGames(env, retention) {
  return all(env.SCORE_DB, `SELECT
      official_game_pk,
      official_game_time_utc,
      official_date,
      COUNT(*) AS prepared_board_pickable_rows
    FROM score_board_prepared_current
    WHERE pickable_safe = 1
      AND matchup_status = 'calendar_matched'
      AND player_match_status = 'matched'
      AND official_game_pk IS NOT NULL
      AND official_game_time_utc IS NOT NULL
      AND official_date IN (?, ?)
    GROUP BY official_game_pk, official_game_time_utc, official_date
    ORDER BY official_game_time_utc`, retention.start, retention.end);
}
async function getCalendar(env, gamePks) {
  if (!gamePks.length) return [];
  return all(env.TEAM_DB, `SELECT game_pk, official_date, game_time_utc, status_code, abstract_game_state, detailed_state, home_team_id, away_team_id, home_team_name, away_team_name, venue_id, venue_name, source_snapshot_at, updated_at, raw_json FROM mlb_game_calendar WHERE game_pk IN (${placeholders(gamePks.length)})`, ...gamePks);
}
async function getStadiums(env, venueIds) {
  if (!venueIds.length) return [];
  return all(env.REF_DB, `SELECT stadium_id, team_id, stadium_name, city, state, latitude, longitude, roof_type, turf_type, mlb_venue_id, timezone, active, source_key, raw_json, updated_at FROM ref_stadiums WHERE active=1 AND mlb_venue_id IN (${placeholders(venueIds.length)})`, ...venueIds);
}
async function getParkFactors(env, venueIds) {
  if (!venueIds.length) return [];
  return all(env.REF_DB, `SELECT park_factor_id, stadium_id, mlb_venue_id, team_id, park_name, season_year, run_factor, hr_factor, lhb_run_factor, rhb_run_factor, lhb_hr_factor, rhb_hr_factor, factor_scale, source_key, source_name, source_confidence, active, updated_at FROM ref_park_factors WHERE active=1 AND mlb_venue_id IN (${placeholders(venueIds.length)}) ORDER BY mlb_venue_id, season_year DESC`, ...venueIds);
}
async function fetchMlbFeed(env, gamePk) {
  const url = `${mlbV11Base(env)}/game/${gamePk}/feed/live`;
  const fetched = await fetchJson(url, env, true);
  return { ...fetched, source_key: MLB_SOURCE_KEY };
}
function openWeatherKey(env) {
  return env.OPENWEATHER_API_KEY || env.OPEN_WEATHER_API_KEY || env.OPENWEATHERMAP_API_KEY || null;
}
function nearestByUnixHourly(hourly, gameTimeUtc) {
  if (!hourly || !Array.isArray(hourly) || !hourly.length || !gameTimeUtc) return null;
  const target = new Date(gameTimeUtc).getTime();
  if (!Number.isFinite(target)) return null;
  let best = null;
  for (const h of hourly) {
    const ms = Number(h.dt) * 1000;
    if (!Number.isFinite(ms)) continue;
    const offset = Math.round((ms - target) / 60000);
    const abs = Math.abs(offset);
    if (!best || abs < best.abs) best = { row: h, forecast_time_utc: new Date(ms).toISOString(), forecast_offset_minutes: offset, abs };
  }
  return best;
}
async function fetchOpenWeather(env, stadium, gameTimeUtc) {
  const key = openWeatherKey(env);
  if (!key) return { ok: false, skipped: true, source_key: OPENWEATHER_SOURCE_KEY, reason: "openweather_key_missing" };
  const lat = numOrNull(stadium && stadium.latitude);
  const lon = numOrNull(stadium && stadium.longitude);
  if (lat === null || lon === null) return { ok: false, skipped: true, source_key: OPENWEATHER_SOURCE_KEY, reason: "venue_coordinates_missing" };
  const base = String(env.OPENWEATHER_ONECALL_BASE_URL || "https://api.openweathermap.org/data/3.0").replace(/\/+$/, "");
  const url = `${base}/onecall?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&units=imperial&exclude=minutely,daily,alerts&appid=${encodeURIComponent(key)}`;
  const fetched = await fetchJson(url, env, true);
  if (!fetched.ok || !fetched.json) return { ...fetched, source_key: OPENWEATHER_SOURCE_KEY };
  const nearest = nearestByUnixHourly(fetched.json.hourly || [], gameTimeUtc);
  const row = nearest ? nearest.row : (fetched.json.current || null);
  if (!row) return { ...fetched, ok: false, source_key: OPENWEATHER_SOURCE_KEY, reason: "no_hourly_or_current_weather_row" };
  return {
    ...fetched,
    source_key: OPENWEATHER_SOURCE_KEY,
    weather: {
      forecast_time_utc: nearest ? nearest.forecast_time_utc : (row.dt ? new Date(Number(row.dt) * 1000).toISOString() : null),
      forecast_offset_minutes: nearest ? nearest.forecast_offset_minutes : null,
      temperature_f: roundOrNull(row.temp),
      feels_like_f: roundOrNull(row.feels_like),
      humidity_pct: roundOrNull(row.humidity, 0),
      pressure_mb: pressureHpaToMb(row.pressure),
      wind_speed_mph: roundOrNull(row.wind_speed),
      wind_gust_mph: roundOrNull(row.wind_gust),
      wind_direction_degrees: roundOrNull(row.wind_deg, 0),
      wind_direction_cardinal: directionCardinal(row.wind_deg),
      precipitation_probability_pct: nearest && row.pop !== undefined ? roundOrNull(Number(row.pop) * 100, 0) : null,
      precipitation_type: row.rain ? "rain" : (row.snow ? "snow" : null),
      condition: Array.isArray(row.weather) && row.weather[0] ? row.weather[0].description || row.weather[0].main || null : null
    }
  };
}
function nearestOpenMeteoHourly(hourly, gameTimeUtc) {
  if (!hourly || !Array.isArray(hourly.time) || !hourly.time.length || !gameTimeUtc) return null;
  const target = new Date(gameTimeUtc).getTime();
  if (!Number.isFinite(target)) return null;
  let best = null;
  for (let i = 0; i < hourly.time.length; i++) {
    const t = String(hourly.time[i] || "");
    const ms = new Date(t.endsWith("Z") ? t : `${t}Z`).getTime();
    if (!Number.isFinite(ms)) continue;
    const offset = Math.round((ms - target) / 60000);
    const abs = Math.abs(offset);
    if (!best || abs < best.abs) best = { index: i, forecast_time_utc: new Date(ms).toISOString(), forecast_offset_minutes: offset, abs };
  }
  return best;
}
async function fetchOpenMeteo(env, stadium, gameTimeUtc) {
  const lat = numOrNull(stadium && stadium.latitude);
  const lon = numOrNull(stadium && stadium.longitude);
  if (lat === null || lon === null) return { ok: false, skipped: true, source_key: OPEN_METEO_SOURCE_KEY, reason: "venue_coordinates_missing" };
  const base = String(env.OPEN_METEO_BASE_URL || "https://api.open-meteo.com/v1").replace(/\/+$/, "");
  const hourly = "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,rain,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m";
  const url = `${base}/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&hourly=${encodeURIComponent(hourly)}&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=UTC&forecast_days=3`;
  const fetched = await fetchJson(url, env, true);
  if (!fetched.ok || !fetched.json) return { ...fetched, source_key: OPEN_METEO_SOURCE_KEY };
  const nearest = nearestOpenMeteoHourly(fetched.json.hourly, gameTimeUtc);
  if (!nearest) return { ...fetched, ok: false, source_key: OPEN_METEO_SOURCE_KEY, reason: "no_nearest_hourly_weather_row" };
  const i = nearest.index;
  const h = fetched.json.hourly || {};
  return {
    ...fetched,
    source_key: OPEN_METEO_SOURCE_KEY,
    weather: {
      forecast_time_utc: nearest.forecast_time_utc,
      forecast_offset_minutes: nearest.forecast_offset_minutes,
      temperature_f: roundOrNull(h.temperature_2m && h.temperature_2m[i]),
      feels_like_f: roundOrNull(h.apparent_temperature && h.apparent_temperature[i]),
      humidity_pct: roundOrNull(h.relative_humidity_2m && h.relative_humidity_2m[i], 0),
      pressure_mb: roundOrNull(h.surface_pressure && h.surface_pressure[i], 0),
      wind_speed_mph: roundOrNull(h.wind_speed_10m && h.wind_speed_10m[i]),
      wind_gust_mph: roundOrNull(h.wind_gusts_10m && h.wind_gusts_10m[i]),
      wind_direction_degrees: roundOrNull(h.wind_direction_10m && h.wind_direction_10m[i], 0),
      wind_direction_cardinal: directionCardinal(h.wind_direction_10m && h.wind_direction_10m[i]),
      precipitation_probability_pct: roundOrNull(h.precipitation_probability && h.precipitation_probability[i], 0),
      precipitation_type: numOrNull(h.rain && h.rain[i]) > 0 ? "rain" : (numOrNull(h.precipitation && h.precipitation[i]) > 0 ? "precipitation" : null),
      condition: null
    }
  };
}
function mergeWeather(mlb, external) {
  const m = mlb && mlb.weather ? mlb.weather : {};
  const e = external && external.weather ? external.weather : {};
  return {
    forecast_time_utc: e.forecast_time_utc || null,
    forecast_offset_minutes: e.forecast_offset_minutes ?? null,
    temperature_f: e.temperature_f ?? m.temperature_f ?? null,
    feels_like_f: e.feels_like_f ?? null,
    humidity_pct: e.humidity_pct ?? null,
    pressure_mb: e.pressure_mb ?? null,
    wind_speed_mph: e.wind_speed_mph ?? m.wind_speed_mph ?? null,
    wind_gust_mph: e.wind_gust_mph ?? null,
    wind_direction_degrees: e.wind_direction_degrees ?? null,
    wind_direction_cardinal: e.wind_direction_cardinal ?? m.wind_direction_cardinal ?? null,
    wind_context: m.wind_context || null,
    precipitation_probability_pct: e.precipitation_probability_pct ?? null,
    precipitation_type: e.precipitation_type || null,
    condition: e.condition || m.condition || null
  };
}
function classifyWeather(row, calendar, stadium, parkFactor, mlbResult, externalResult, merged) {
  const issues = [];
  const roofType = normalizeRoofType(stadium && stadium.roof_type);
  let roofStatus = "unknown";
  let roofConfidence = "LOW_SOURCE_AMBIGUOUS";
  let indoorFlag = 0;
  let weatherApplicableFlag = 1;
  const retractableFlag = roofType === "retractable" ? 1 : 0;
  if (roofType === "outdoor") {
    roofStatus = "outdoor";
    roofConfidence = "HIGH_STATIC_STADIUM_ROOF_TYPE";
  } else if (roofType === "fixed_dome") {
    roofStatus = "fixed_dome";
    roofConfidence = "HIGH_STATIC_STADIUM_ROOF_TYPE";
    indoorFlag = 1;
    weatherApplicableFlag = 0;
  } else if (roofType === "retractable") {
    const hasAnyWeatherForRoof = !!((mlbResult && mlbResult.ok && mlbResult.weather) || (externalResult && externalResult.ok && externalResult.weather));
    const roofPrecip = numOrNull(merged.precipitation_probability_pct);
    const roofTemp = numOrNull(merged.temperature_f);
    if (hasAnyWeatherForRoof && (roofPrecip !== null || roofTemp !== null)) {
      // Real, defensible derived inference (not invented weather): teams generally close a
      // retractable roof for meaningful rain risk or uncomfortable temperature extremes, and
      // open it for pleasant conditions. Uses real forecast data we already fetched; explicitly
      // low-confidence and marked derived/temporary since it is inference, not an observed fact.
      const likelyClosed = (roofPrecip !== null && roofPrecip >= 40) || (roofTemp !== null && (roofTemp < 50 || roofTemp > 95));
      roofStatus = likelyClosed ? "derived_likely_closed" : "derived_likely_open";
      roofConfidence = "LOW_DERIVED_FROM_WEATHER_CONDITIONS";
      issues.push({ severity: "warning", issue_type: "roof_status_derived", reason: `No live roof source; inferred ${roofStatus} from forecast conditions (precip ${roofPrecip}%, temp ${roofTemp}F).` });
    } else {
      roofStatus = "retractable_unknown";
      roofConfidence = "WARNING_ROOF_UNKNOWN";
      issues.push({ severity: "warning", issue_type: "roof_unknown_retractable", reason: "Retractable roof venue has no proved live open/closed source and no weather data available to derive a likely state." });
    }
  } else {
    roofStatus = "unknown";
    roofConfidence = "WARNING_ROOF_CLASSIFICATION_MISSING";
    issues.push({ severity: "warning", issue_type: "roof_classification_missing", reason: "Prepared-board relevant venue is missing safe roof classification; weather row is still written and full-run continues with warning." });
  }

  const hasMlb = !!(mlbResult && mlbResult.ok && mlbResult.weather);
  const hasExternal = !!(externalResult && externalResult.ok && externalResult.weather);
  const hasAnyWeather = hasMlb || hasExternal;
  let weatherStatus = "source_missing";
  let weatherConfidence = "BLOCKED_SOURCE_MISSING";
  if (!weatherApplicableFlag) {
    weatherStatus = "indoor_not_applicable";
    weatherConfidence = roofConfidence;
  } else if (hasExternal && merged.forecast_offset_minutes !== null && Math.abs(Number(merged.forecast_offset_minutes)) <= 90) {
    weatherStatus = "forecast_available";
    weatherConfidence = "HIGH_FORECAST_NEAR_FIRST_PITCH";
  } else if (hasExternal) {
    weatherStatus = "forecast_available";
    weatherConfidence = "MEDIUM_FORECAST_WINDOW";
    issues.push({ severity: "warning", issue_type: "forecast_offset_window", reason: "Forecast row is available but not within 90 minutes of first pitch." });
  } else if (hasMlb) {
    weatherStatus = "current_conditions_available";
    weatherConfidence = "HIGH_OFFICIAL_WEATHER";
  }
  if (weatherApplicableFlag && !hasAnyWeather) {
    issues.push({ severity: "blocker", issue_type: "weather_source_missing", reason: "Outdoor/weather-applicable prepared-board game has no usable MLB or external weather source row." });
  }
  if (weatherApplicableFlag && (!stadium || numOrNull(stadium.latitude) === null || numOrNull(stadium.longitude) === null) && !hasMlb) {
    issues.push({ severity: "blocker", issue_type: "venue_coordinates_missing", reason: "Venue coordinates missing and no MLB official weather fallback exists." });
  }
  const precip = numOrNull(merged.precipitation_probability_pct);
  const wind = numOrNull(merged.wind_speed_mph);
  const rainRiskFlag = precip !== null && precip >= 35 ? 1 : 0;
  const delayRiskFlag = precip !== null && precip >= 55 ? 1 : 0;
  if (rainRiskFlag) issues.push({ severity: "warning", issue_type: "rain_risk", reason: `Precipitation probability is ${precip}%.` });
  if (wind !== null && wind >= 18) issues.push({ severity: "warning", issue_type: "wind_extreme", reason: `Wind speed is ${wind} mph.` });
  return {
    roof_type: roofType,
    roof_status: roofStatus,
    roof_confidence: roofConfidence,
    indoor_flag: indoorFlag,
    retractable_roof_flag: retractableFlag,
    weather_applicable_flag: weatherApplicableFlag,
    weather_status: weatherStatus,
    weather_confidence: weatherConfidence,
    rain_risk_flag: rainRiskFlag,
    delay_risk_flag: delayRiskFlag,
    issues,
    park_weather_notes: parkFactor ? `Park factors ${parkFactor.season_year}: run ${parkFactor.run_factor}, HR ${parkFactor.hr_factor}, scale ${parkFactor.factor_scale}` : null
  };
}
function compactRawWeatherAudit(record) {
  const raw = record && record.raw_json ? record.raw_json : {};
  return {
    compact_weather_audit_v0_1_5: true,
    game_pk: record.game_pk,
    official_date: record.official_date,
    game_time_utc: record.game_time_utc,
    venue_id: record.venue_id,
    venue_name: record.venue_name,
    prepared_board_pickable_rows: record.prepared_board_pickable_rows,
    weather_status: record.weather_status,
    weather_confidence: record.weather_confidence,
    roof_type: record.roof_type,
    roof_status: record.roof_status,
    roof_confidence: record.roof_confidence,
    source_key: record.source_key,
    source_endpoint: record.source_endpoint,
    source_snapshot_at: record.source_snapshot_at,
    forecast_time_utc: record.forecast_time_utc,
    forecast_offset_minutes: record.forecast_offset_minutes,
    temperature_f: record.temperature_f,
    feels_like_f: record.feels_like_f,
    humidity_pct: record.humidity_pct,
    pressure_mb: record.pressure_mb,
    wind_speed_mph: record.wind_speed_mph,
    wind_gust_mph: record.wind_gust_mph,
    wind_direction_degrees: record.wind_direction_degrees,
    wind_direction_cardinal: record.wind_direction_cardinal,
    precipitation_probability_pct: record.precipitation_probability_pct,
    precipitation_type: record.precipitation_type,
    rain_risk_flag: record.rain_risk_flag,
    delay_risk_flag: record.delay_risk_flag,
    indoor_flag: record.indoor_flag,
    retractable_roof_flag: record.retractable_roof_flag,
    weather_applicable_flag: record.weather_applicable_flag,
    park_weather_notes: record.park_weather_notes,
    issues: record.issues || [],
    source_summaries: {
      mlb_weather: raw.mlb_weather ? { ok: raw.mlb_weather.ok, source_key: raw.mlb_weather.source_key, weather: raw.mlb_weather.weather || null } : null,
      external_weather: raw.external_weather || null,
      merged_weather: raw.merged_weather || null,
      classification: raw.classification || null
    },
    note: "v0.1.5 stores compact audit JSON in current/snapshot rows; full scoring fields remain first-class columns."
  };
}

function weatherScalarChanged(old, record) {
  if (!old) return true;
  const keys = [
    "weather_status", "weather_confidence", "source_key", "forecast_time_utc", "temperature_f",
    "wind_speed_mph", "wind_direction_degrees", "precipitation_probability_pct", "roof_status",
    "rain_risk_flag", "delay_risk_flag"
  ];
  for (const key of keys) {
    const oldValue = old[key] === undefined || old[key] === null ? null : String(old[key]);
    const newValue = record[key] === undefined || record[key] === null ? null : String(record[key]);
    if (oldValue !== newValue) return true;
  }
  return false;
}

async function writeGame(env, batchId, record) {
  const old = await first(env.DAILY_DB, `SELECT weather_status, weather_confidence, source_key, forecast_time_utc, temperature_f, wind_speed_mph, wind_direction_degrees, precipitation_probability_pct, roof_status, rain_risk_flag, delay_risk_flag FROM daily_game_weather_current WHERE game_pk=?`, record.game_pk);
  const rawText = safeJson(compactRawWeatherAudit(record), 6000);
  const changedAt = weatherScalarChanged(old, record) ? nowUtc() : null;
  const weatherKey = `dgw_${record.official_date}_${record.game_pk}`;
  const statements = [
    env.DAILY_DB.prepare(`INSERT OR REPLACE INTO daily_game_weather_current (
      weather_key, batch_id, game_pk, official_date, game_time_utc, venue_id, venue_name, home_team_id, away_team_id,
      prepared_board_relevant, prepared_board_pickable_rows, weather_status, weather_confidence, source_key, source_endpoint, source_snapshot_at,
      forecast_time_utc, forecast_offset_minutes, temperature_f, feels_like_f, humidity_pct, pressure_mb, wind_speed_mph, wind_gust_mph,
      wind_direction_degrees, wind_direction_cardinal, wind_context, precipitation_probability_pct, precipitation_type, rain_risk_flag, delay_risk_flag,
      roof_type, roof_status, roof_confidence, indoor_flag, retractable_roof_flag, weather_applicable_flag, park_weather_notes,
      first_seen_at, last_seen_at, changed_at, raw_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT first_seen_at FROM daily_game_weather_current WHERE game_pk=?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, COALESCE(?, (SELECT changed_at FROM daily_game_weather_current WHERE game_pk=?)), ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).bind(
      weatherKey, batchId, record.game_pk, record.official_date, record.game_time_utc, record.venue_id, record.venue_name, record.home_team_id, record.away_team_id,
      record.prepared_board_relevant, record.prepared_board_pickable_rows, record.weather_status, record.weather_confidence, record.source_key, record.source_endpoint, record.source_snapshot_at,
      record.forecast_time_utc, record.forecast_offset_minutes, record.temperature_f, record.feels_like_f, record.humidity_pct, record.pressure_mb, record.wind_speed_mph, record.wind_gust_mph,
      record.wind_direction_degrees, record.wind_direction_cardinal, record.wind_context, record.precipitation_probability_pct, record.precipitation_type, record.rain_risk_flag, record.delay_risk_flag,
      record.roof_type, record.roof_status, record.roof_confidence, record.indoor_flag, record.retractable_roof_flag, record.weather_applicable_flag, record.park_weather_notes,
      record.game_pk, changedAt, record.game_pk, rawText
    ),
    env.DAILY_DB.prepare(`INSERT INTO daily_game_weather_snapshots (snapshot_id, batch_id, game_pk, official_date, venue_id, source_key, source_snapshot_at, forecast_time_utc, temperature_f, wind_speed_mph, wind_direction_degrees, precipitation_probability_pct, roof_status, weather_status, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      rid("dgw_snap"), batchId, record.game_pk, record.official_date, record.venue_id, record.source_key, record.source_snapshot_at, record.forecast_time_utc, record.temperature_f, record.wind_speed_mph, record.wind_direction_degrees, record.precipitation_probability_pct, record.roof_status, record.weather_status, rawText
    )
  ];
  for (const issue of record.issues) {
    statements.push(env.DAILY_DB.prepare(`INSERT INTO daily_game_weather_issues (issue_id, batch_id, game_pk, official_date, venue_id, issue_status, issue_type, severity, reason, details_json) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`).bind(
      rid("dgw_issue"), batchId, record.game_pk, record.official_date, record.venue_id, issue.issue_type, issue.severity, issue.reason, safeJson({ game_pk: record.game_pk, venue_id: record.venue_id, roof_type: record.roof_type, source_key: record.source_key, weather_status: record.weather_status }, 3000)
    ));
  }
  await env.DAILY_DB.batch(statements);
  return { current_written: 1, snapshot_written: 1, issues_written: record.issues.length };
}

function compactWeatherProgress(payload) {
  return safeJson({
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "RUNNING_DAILY_WEATHER_PROGRESS",
    ...payload,
    timestamp_utc: nowUtc(),
    root_cause_guard: "worker_updates_child_queue_heartbeat_and_batch_progress_so_parent_stale_guard_does_not_misclassify_legitimate_work"
  }, 3500);
}

async function heartbeatWeather(env, requestId, batchId, step, extra = {}) {
  if (!requestId) return;
  const progress = compactWeatherProgress({ request_id: requestId, batch_id: batchId || null, step, ...extra });
  try {
    if (env && env.CONTROL_DB) {
      await run(env.CONTROL_DB,
        `UPDATE control_job_queue
         SET updated_at=CURRENT_TIMESTAMP,
             output_json=?
         WHERE request_id=?
           AND status='running'
           AND finished_at IS NULL`,
        progress, requestId);
    }
  } catch (_) {
    // Heartbeat is lifecycle-only. Never let heartbeat failure break weather context.
  }
}


async function finalizeControlLifecycleWeather(env, requestId, output, rowsRead, rowsWritten, externalCalls) {
  if (!requestId || !env || !env.CONTROL_DB || !output) return;
  const ok = output.ok === true;
  const queueStatus = ok ? "completed" : "failed";
  const runStatus = ok ? "completed" : "failed";
  const cert = String(output.certification || output.certification_status || (ok ? "completed" : "failed")).slice(0, 120);
  const errCode = ok ? null : "daily_weather_worker_failed";
  const errMsg = ok ? null : String(output.error || output.certification || output.status || "worker failed").slice(0, 900);
  const out = safeJson(output, 14000);
  try {
    await run(env.CONTROL_DB, "UPDATE control_job_queue SET status=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=? AND status IN ('pending','running','queued','partial_continue') AND finished_at IS NULL", queueStatus, out, errCode, errMsg, requestId);
    await run(env.CONTROL_DB, "UPDATE control_job_runs SET status=?, data_ok=?, certification_status=?, rows_read=?, rows_written=?, external_calls=?, finished_at=CURRENT_TIMESTAMP, elapsed_ms=CASE WHEN started_at IS NOT NULL THEN CAST((julianday(CURRENT_TIMESTAMP)-julianday(started_at))*86400000 AS INTEGER) ELSE 0 END, output_json=?, error_code=?, error_message=? WHERE request_id=? AND status='running' AND finished_at IS NULL", runStatus, ok ? 1 : 0, cert, Number(rowsRead || 0), Number(rowsWritten || 0), Number(externalCalls || 0), out, errCode, errMsg, requestId);
  } catch (_) {
    // Best-effort terminal handoff. The worker response remains source of truth for orchestrator dispatch.
  }
}

async function markWeatherBatch(env, batchId, fields = {}) {
  if (!batchId) return;
  const allowed = [
    "status", "calendar_games_checked", "prepared_games_checked", "prepared_rows_read", "weather_rows_written",
    "snapshot_rows_written", "indoor_games", "outdoor_games", "retractable_roof_games", "weather_source_failures",
    "roof_unknown_count", "weather_unknown_count", "blocker_count", "warning_count", "external_calls",
    "certification_status", "certification_grade", "certification_reason", "output_json", "completed_at"
  ];
  const sets = [];
  const binds = [];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${key}=?`);
      binds.push(fields[key]);
    }
  }
  if (!sets.length) return;
  sets.push("updated_at=CURRENT_TIMESTAMP");
  binds.push(batchId);
  await run(env.DAILY_DB, `UPDATE daily_game_weather_batches SET ${sets.join(", ")} WHERE batch_id=?`, ...binds);
}

function assertWeatherBudget(startedMs, step) {
  const elapsed = Date.now() - startedMs;
  if (elapsed > WEATHER_SOFT_LIMIT_MS) {
    const err = new Error(`Daily Weather soft time budget exceeded at ${step} after ${elapsed}ms`);
    err.code = "DAILY_WEATHER_SOFT_TIME_BUDGET_EXCEEDED";
    err.elapsed_ms = elapsed;
    err.step = step;
    throw err;
  }
}

async function mapLimit(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

async function cleanupWeatherBatchSidecars(env, batchId) {
  if (!batchId) return { cleaned: false };
  // Non-destructive failure cleanup: do NOT delete current rows. INSERT OR REPLACE can replace a prior
  // certified current row; deleting failed-batch current rows can leave the live layer empty. A terminal
  // failure response prevents parent stale cleanup; old/mixed current rows are safer than an empty layer.
  const snapshots = await run(env.DAILY_DB, `DELETE FROM daily_game_weather_snapshots WHERE batch_id=?`, batchId);
  const issues = await run(env.DAILY_DB, `DELETE FROM daily_game_weather_issues WHERE batch_id=?`, batchId);
  return {
    cleaned: true,
    batch_id: batchId,
    current_deleted: 0,
    current_cleanup_policy: "non_destructive_keep_current_rows_on_failure",
    snapshots_deleted: snapshots && snapshots.meta ? snapshots.meta.changes : null,
    issues_deleted: issues && issues.meta ? issues.meta.changes : null
  };
}

async function finalizeWeatherWindowReplacement(env, retention, batchId) {
  // Success-only cleanup: after the new batch has full certified coverage, remove stale current rows
  // in the active PT today/tomorrow window that were not refreshed by this successful batch.
  const staleCurrent = await run(env.DAILY_DB,
    `DELETE FROM daily_game_weather_current
     WHERE official_date IN (?, ?)
       AND (batch_id IS NULL OR batch_id <> ?)`,
    retention.start, retention.end, batchId);
  return {
    cleaned: true,
    stale_current_deleted: staleCurrent && staleCurrent.meta ? staleCurrent.meta.changes : null,
    active_batch_id: batchId,
    retention_date_start: retention.start,
    retention_date_end: retention.end
  };
}

async function runWeather(env, input) {
  const startedMs = Date.now();
  const startedAt = nowUtc();
  const batchId = rid("daily_game_weather_batch");
  const requestId = input.request_id || batchId;
  const runId = input.run_id || null;
  let batchStarted = false;
  let prepared = [];
  let calendars = [];
  let records = [];
  let currentWritten = 0;
  let snapshotWritten = 0;
  let issuesWritten = 0;
  let externalCalls = 0;
  let sourceFailures = 0;
  const retention = retentionWindowPt();

  await ensureSchema(env);
  await run(env.DAILY_DB, `INSERT INTO daily_game_weather_batches (batch_id, request_id, run_id, worker_name, worker_version, job_key, mode, status, window_start, window_end, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?)`,
    batchId, requestId, runId, WORKER_NAME, VERSION, input.job_key || JOB_KEY, input.mode || "daily_weather_refresh_window", retention.start, retention.end, startedAt
  );
  batchStarted = true;
  await heartbeatWeather(env, requestId, batchId, "batch_created", { window_start: retention.start, window_end: retention.end, fetch_timeout_ms: FETCH_TIMEOUT_MS, fetch_concurrency: WEATHER_FETCH_CONCURRENCY });

  try {
    // Root-cause fix: no pre-run destructive current cleanup. The prior weather lifecycle could hang after
    // creating a running batch, then the parent stale cleanup could leave the live weather layer empty.
    prepared = await getPreparedGames(env, retention);
    const preparedRowsRead = prepared.reduce((n, r) => n + Number(r.prepared_board_pickable_rows || 0), 0);
    await markWeatherBatch(env, batchId, { prepared_rows_read: preparedRowsRead, certification_status: "DAILY_WEATHER_STEP_PREPARED_READ" });
    await heartbeatWeather(env, requestId, batchId, "prepared_rows_read", { prepared_games_seen: prepared.length, prepared_rows_read: preparedRowsRead });
    assertWeatherBudget(startedMs, "prepared_rows_read");

    const gamePks = [...new Set(prepared.map(r => intOrNull(r.official_game_pk)).filter(v => v !== null))];
    calendars = await getCalendar(env, gamePks);
    const calendarByGame = new Map(calendars.map(r => [intOrNull(r.game_pk), r]));
    const venueIds = [...new Set(calendars.map(r => intOrNull(r.venue_id)).filter(v => v !== null))];
    const stadiums = await getStadiums(env, venueIds);
    const stadiumByVenue = new Map(stadiums.map(r => [intOrNull(r.mlb_venue_id), r]));
    const parkFactors = await getParkFactors(env, venueIds);
    const parkByVenue = new Map();
    for (const pf of parkFactors) if (!parkByVenue.has(intOrNull(pf.mlb_venue_id))) parkByVenue.set(intOrNull(pf.mlb_venue_id), pf);
    await markWeatherBatch(env, batchId, { calendar_games_checked: calendars.length, prepared_games_checked: gamePks.length, certification_status: "DAILY_WEATHER_STEP_REFERENCE_READ" });
    await heartbeatWeather(env, requestId, batchId, "reference_rows_read", { prepared_games_checked: gamePks.length, calendar_games_checked: calendars.length, venue_count: venueIds.length, stadium_rows: stadiums.length, park_factor_rows: parkFactors.length });
    assertWeatherBudget(startedMs, "reference_rows_read");

    const sourceSnapshotAt = nowUtc();
    const progressEvery = Math.max(1, Math.min(4, Math.ceil(prepared.length / 3)));
    let processed = 0;
    records = await mapLimit(prepared, WEATHER_FETCH_CONCURRENCY, async (p, idx) => {
      const gamePk = intOrNull(p.official_game_pk);
      const cal = calendarByGame.get(gamePk) || {};
      const venueId = intOrNull(cal.venue_id);
      const stadium = stadiumByVenue.get(venueId) || null;
      const parkFactor = parkByVenue.get(venueId) || null;
      const mlbFetch = await fetchMlbFeed(env, gamePk);
      externalCalls++;
      const mlbWeather = mlbFetch.ok ? extractMlbWeather(mlbFetch.json) : { ok: false, source_key: MLB_SOURCE_KEY, weather: null };
      if (!mlbFetch.ok) sourceFailures++;

      let external = await fetchOpenWeather(env, stadium, p.official_game_time_utc);
      if (!external.skipped) externalCalls++;
      if (!external.ok) {
        const fallback = await fetchOpenMeteo(env, stadium, p.official_game_time_utc);
        if (!fallback.skipped) externalCalls++;
        external = fallback;
      }
      if (!external.ok && !external.skipped) sourceFailures++;

      const merged = mergeWeather(mlbWeather, external);
      const classified = classifyWeather(p, cal, stadium, parkFactor, mlbWeather, external, merged);
      const sourceParts = [];
      if (mlbWeather.ok) sourceParts.push(MLB_SOURCE_KEY);
      if (external.ok) sourceParts.push(external.source_key);
      const sourceKey = sourceParts.length ? sourceParts.join("+") : "source_missing";
      const sourceEndpoint = [mlbFetch && mlbFetch.url, external && external.url].filter(Boolean).join(" | ") || null;
      const record = {
        game_pk: gamePk,
        official_date: p.official_date || cal.official_date,
        game_time_utc: p.official_game_time_utc || cal.game_time_utc,
        venue_id: venueId,
        venue_name: cal.venue_name || (stadium && stadium.stadium_name) || null,
        home_team_id: intOrNull(cal.home_team_id),
        away_team_id: intOrNull(cal.away_team_id),
        prepared_board_relevant: 1,
        prepared_board_pickable_rows: Number(p.prepared_board_pickable_rows || 0),
        weather_status: classified.weather_status,
        weather_confidence: classified.weather_confidence,
        source_key: sourceKey,
        source_endpoint: sourceEndpoint,
        source_snapshot_at: sourceSnapshotAt,
        forecast_time_utc: merged.forecast_time_utc,
        forecast_offset_minutes: merged.forecast_offset_minutes,
        temperature_f: merged.temperature_f,
        feels_like_f: merged.feels_like_f,
        humidity_pct: merged.humidity_pct,
        pressure_mb: merged.pressure_mb,
        wind_speed_mph: merged.wind_speed_mph,
        wind_gust_mph: merged.wind_gust_mph,
        wind_direction_degrees: merged.wind_direction_degrees,
        wind_direction_cardinal: merged.wind_direction_cardinal,
        wind_context: merged.wind_context,
        precipitation_probability_pct: merged.precipitation_probability_pct,
        precipitation_type: merged.precipitation_type,
        rain_risk_flag: classified.rain_risk_flag,
        delay_risk_flag: classified.delay_risk_flag,
        roof_type: classified.roof_type,
        roof_status: classified.roof_status,
        roof_confidence: classified.roof_confidence,
        indoor_flag: classified.indoor_flag,
        retractable_roof_flag: classified.retractable_roof_flag,
        weather_applicable_flag: classified.weather_applicable_flag,
        park_weather_notes: classified.park_weather_notes,
        issues: classified.issues,
        raw_json: {
          prepared: p,
          calendar: cal,
          stadium,
          park_factor: parkFactor,
          mlb_weather: mlbWeather,
          external_weather: external ? { ok: external.ok, skipped: external.skipped || false, source_key: external.source_key, status: external.status, reason: external.reason || null, weather: external.weather || null, url: external.url || null, error: external.error || null } : null,
          merged_weather: merged,
          classification: classified
        }
      };
      processed += 1;
      if (processed === prepared.length || processed % progressEvery === 0) {
        await markWeatherBatch(env, batchId, { calendar_games_checked: calendars.length, prepared_games_checked: gamePks.length, prepared_rows_read: preparedRowsRead, weather_source_failures: sourceFailures, external_calls: externalCalls, certification_status: "DAILY_WEATHER_STEP_FETCHING_SOURCES" });
        await heartbeatWeather(env, requestId, batchId, "fetching_sources", { processed_games: processed, total_games: prepared.length, external_calls: externalCalls, source_failures: sourceFailures });
        assertWeatherBudget(startedMs, "fetching_sources");
      }
      return record;
    });

    await heartbeatWeather(env, requestId, batchId, "source_fetch_complete", { records: records.length, external_calls: externalCalls, source_failures: sourceFailures });
    assertWeatherBudget(startedMs, "source_fetch_complete");

    for (let i = 0; i < records.length; i += 1) {
      const w = await writeGame(env, batchId, records[i]);
      currentWritten += w.current_written;
      snapshotWritten += w.snapshot_written;
      issuesWritten += w.issues_written;
      await markWeatherBatch(env, batchId, { weather_rows_written: currentWritten, snapshot_rows_written: snapshotWritten, certification_status: "DAILY_WEATHER_STEP_WRITING_CONTEXT" });
      await heartbeatWeather(env, requestId, batchId, "writing_context", { written_games: i + 1, total_games: records.length, weather_rows_written: currentWritten, snapshot_rows_written: snapshotWritten, issues_written: issuesWritten, d1_write_mode: "batched_per_game_compact_raw_v0_1_5" });
      assertWeatherBudget(startedMs, "writing_context");
    }

    const replacementCleanup = await finalizeWeatherWindowReplacement(env, retention, batchId);
    const postRetentionPrune = await pruneRetention(env, retention, batchId);
    await heartbeatWeather(env, requestId, batchId, "success_cleanup_complete", { replacement_cleanup: replacementCleanup, retention_post_prune: postRetentionPrune });
    assertWeatherBudget(startedMs, "success_cleanup_complete");

    const blockerCount = records.reduce((n, r) => n + r.issues.filter(i => i.severity === "blocker").length, 0);
    const warningCount = records.reduce((n, r) => n + r.issues.filter(i => i.severity === "warning").length, 0);
    const weatherUnknownCount = records.filter(r => ["source_missing", "blocked"].includes(String(r.weather_status || ""))).length;
    const roofUnknownCount = records.filter(r => String(r.roof_status || "").includes("unknown")).length;
    const indoorGames = records.filter(r => r.indoor_flag === 1).length;
    const outdoorGames = records.filter(r => r.roof_status === "outdoor").length;
    const retractableGames = records.filter(r => r.retractable_roof_flag === 1).length;
    const coverageOk = records.length === prepared.length && currentWritten === records.length && snapshotWritten === records.length;
    const noPickableSlate = prepared.length === 0;
    const dataOk = noPickableSlate || (coverageOk && blockerCount === 0);
    const certification = noPickableSlate ? "DAILY_WEATHER_NO_PICKABLE_SAFE_GAMES_IN_WINDOW" : (dataOk ? (warningCount ? "DAILY_WEATHER_CERTIFIED_WITH_WARNINGS" : "DAILY_WEATHER_CERTIFIED_READY") : "DAILY_WEATHER_FAILED_BLOCKERS_OR_COVERAGE");
    const grade = noPickableSlate ? "VALID_ZERO" : (dataOk ? (warningCount ? "PASS_WITH_WARNINGS" : "PASS") : "FAIL");
    const status = dataOk ? "completed" : "failed_blockers_or_coverage";
    const output = {
      ok: dataOk,
      data_ok: dataOk,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      request_id: requestId,
      run_id: runId,
      batch_id: batchId,
      status,
      certification,
      certification_grade: grade,
      certification_reason: noPickableSlate ? "No prepared-board pickable_safe games exist for today/tomorrow retention window." : (dataOk ? "Every prepared-board relevant game received weather/roof current and snapshot rows; warnings are sidecar issues." : "One or more prepared-board relevant games had blockers or coverage gaps."),
      window_start: retention.start,
      window_end: retention.end,
      calendar_games_checked: calendars.length,
      prepared_games_checked: records.length,
      prepared_rows_read: preparedRowsRead,
      weather_rows_written: currentWritten,
      rows_written: currentWritten,
      snapshot_rows_written: snapshotWritten,
      issues_written: issuesWritten,
      indoor_games: indoorGames,
      outdoor_games: outdoorGames,
      retractable_roof_games: retractableGames,
      weather_source_failures: sourceFailures,
      roof_unknown_count: roofUnknownCount,
      weather_unknown_count: weatherUnknownCount,
      blocker_count: blockerCount,
      warning_count: warningCount,
      external_calls: externalCalls,
      external_calls_performed: externalCalls,
      current_games: records.map(r => ({ game_pk: r.game_pk, official_date: r.official_date, venue_name: r.venue_name, roof_status: r.roof_status, weather_status: r.weather_status, weather_confidence: r.weather_confidence, source_key: r.source_key, temp_f: r.temperature_f, wind_mph: r.wind_speed_mph, precip_pct: r.precipitation_probability_pct, issues: r.issues.length })),
      retention_policy: "non_destructive_fetch_then_success_only_window_replacement_today_tomorrow_batches_retained_for_audit",
      successful_window_replacement_cleanup: replacementCleanup,
      retention_post_prune: postRetentionPrune,
      source_fetch_timeout_ms: FETCH_TIMEOUT_MS,
      source_fetch_concurrency: WEATHER_FETCH_CONCURRENCY,
      lifecycle_fix: "bounded_parallel_fetch_batched_compact_d1_writes_per_game_heartbeat",
      sidecar_tables: ["daily_game_weather_current", "daily_game_weather_snapshots", "daily_game_weather_batches", "daily_game_weather_issues"],
      legacy_tables_untouched: ["daily_weather", "daily_roof_status"],
      static_reference_tables_read_only: ["REF_DB.ref_stadiums", "REF_DB.ref_stadium_aliases", "REF_DB.ref_park_factors"],
      no_score_db_mutation: true,
      no_board_mutation: true,
      no_calendar_rebuild: true,
      no_daily_starters_duplication: true,
      no_daily_lineups_duplication: true,
      no_daily_player_availability_duplication: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      timestamp_utc: nowUtc()
    };
    await markWeatherBatch(env, batchId, {
      status, calendar_games_checked: calendars.length, prepared_games_checked: records.length, prepared_rows_read: preparedRowsRead,
      weather_rows_written: currentWritten, snapshot_rows_written: snapshotWritten, indoor_games: indoorGames, outdoor_games: outdoorGames,
      retractable_roof_games: retractableGames, weather_source_failures: sourceFailures, roof_unknown_count: roofUnknownCount,
      weather_unknown_count: weatherUnknownCount, blocker_count: blockerCount, warning_count: warningCount, external_calls: externalCalls,
      certification_status: certification, certification_grade: grade, certification_reason: output.certification_reason,
      output_json: safeJson(output, 14000), completed_at: nowUtc()
    });
    await finalizeControlLifecycleWeather(env, requestId, output, output.prepared_rows_read, output.weather_rows_written, output.external_calls);
    return output;
  } catch (err) {
    const errorText = String(err && err.stack ? err.stack : err);
    let cleanup = null;
    if (batchStarted) cleanup = await cleanupWeatherBatchSidecars(env, batchId);
    const preparedRowsRead = prepared.reduce((n, r) => n + Number(r.prepared_board_pickable_rows || 0), 0);
    const output = {
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      request_id: requestId,
      run_id: runId,
      batch_id: batchId,
      status: "failed_exception_terminal",
      certification: "DAILY_WEATHER_FAILED_EXCEPTION_TERMINAL_NON_DESTRUCTIVE",
      certification_grade: "FAIL",
      certification_reason: "Daily Weather failed inside bounded worker lifecycle; partial snapshots/issues for this batch were cleaned and current rows were preserved.",
      error: errorText,
      cleanup,
      window_start: retention.start,
      window_end: retention.end,
      calendar_games_checked: calendars.length,
      prepared_games_checked: records.length || prepared.length,
      prepared_rows_read: preparedRowsRead,
      weather_rows_written: currentWritten,
      snapshot_rows_written: snapshotWritten,
      issues_written: issuesWritten,
      external_calls: externalCalls,
      source_failures: sourceFailures,
      source_fetch_timeout_ms: FETCH_TIMEOUT_MS,
      source_fetch_concurrency: WEATHER_FETCH_CONCURRENCY,
      lifecycle_fix: "terminal_failure_returned_to_orchestrator_instead_of_parent_stale_child_cleanup",
      timestamp_utc: nowUtc(),
      no_score_db_mutation: true,
      no_board_mutation: true,
      no_scoring: true
    };
    if (batchStarted) await markWeatherBatch(env, batchId, {
      status: "failed_exception_terminal", calendar_games_checked: calendars.length, prepared_games_checked: records.length || prepared.length,
      prepared_rows_read: preparedRowsRead, weather_rows_written: currentWritten, snapshot_rows_written: snapshotWritten,
      weather_source_failures: sourceFailures, external_calls: externalCalls, certification_status: output.certification,
      certification_grade: output.certification_grade, certification_reason: output.certification_reason,
      output_json: safeJson(output, 14000), completed_at: nowUtc()
    });
    await heartbeatWeather(env, requestId, batchId, "failed_exception_terminal", { certification: output.certification, error: errorText.slice(0, 500) });
    await finalizeControlLifecycleWeather(env, requestId, output, output.prepared_rows_read, output.weather_rows_written, output.external_calls);
    return output;
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return jsonResponse({ ok: true });
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();
    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));
    if (method === "GET" && path === "/health") return jsonResponse({ ...baseIdentity(env), route: "/health", checks: { db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS), vars: varPresence(env, EXPECTED_VARS), weather_keys_present: { OPENWEATHER_API_KEY: !!env.OPENWEATHER_API_KEY, OPEN_WEATHER_API_KEY: !!env.OPEN_WEATHER_API_KEY, OPENWEATHERMAP_API_KEY: !!env.OPENWEATHERMAP_API_KEY } } });
    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      return jsonResponse({ ...baseIdentity(env), route: "/diagnostic", input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, job_key: input.job_key || null, mode: input.mode || null } });
    }
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        return jsonResponse(await runWeather(env, input));
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "exception_terminal", certification: "DAILY_WEATHER_EXCEPTION_TERMINAL", error: String(err && err.stack ? err.stack : err), timestamp_utc: nowUtc(), no_score_db_mutation: true, no_board_mutation: true });
      }
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
