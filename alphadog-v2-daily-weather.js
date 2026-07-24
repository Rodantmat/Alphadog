import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-daily-weather";
const VERSION = "alphadog-v2-daily-weather-v0.2.1-postgres-rewire-redeploy";
const JOB_KEY = "daily-weather";
const MLB_SOURCE_KEY = "official_mlb_statsapi_live_feed_weather";
const OPEN_METEO_SOURCE_KEY = "open_meteo_no_key_forecast";
const OPENWEATHER_SOURCE_KEY = "openweather_onecall_forecast";
const FETCH_TIMEOUT_MS = 2500;
const WEATHER_SOFT_LIMIT_MS = 90000;
const WEATHER_FETCH_CONCURRENCY = 4;
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "MLB_API_BASE_URL", "OPEN_METEO_BASE_URL"];

function pgClient(env) {
  return postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false, prepare: false, connect_timeout: 8 });
}
function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,x-ingest-token,x-admin-token,authorization", "access-control-allow-methods": "GET,POST,OPTIONS" }
  });
}
async function readJsonSafe(request) { try { return await request.json(); } catch (_) { return {}; } }
function safeJson(value, max = 14000) {
  if (value === undefined || value === null) return null;
  let text;
  try { text = typeof value === "string" ? value : JSON.stringify(value); } catch (_) { text = String(value); }
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}
function varPresence(env, names) { const out = {}; for (const name of names) out[name] = env && env[name] !== undefined && env[name] !== null && String(env[name]).length > 0; return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
function baseIdentity(env) {
  const vars = varPresence(env, EXPECTED_VARS);
  return {
    ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "READY_DAILY_WEATHER_ROOF_CONTEXT", timestamp_utc: nowUtc(),
    phase: "daily-context-phase-4-weather-roof-park-conditions",
    binding_summary: { required_db_bindings_present: Boolean(env && env.HYPERDRIVE), expected_vars_present: allTrue(vars) },
    guardrails: { unified_weather_roof_context: true, anchors_to_mlb_game_calendar_game_pk: true, prepared_board_relevance_only: true, current_retention_today_tomorrow_only: true, no_calendar_rebuild: true, no_daily_starters_duplication: true, no_daily_lineups_duplication: true, no_daily_player_availability_duplication: true, no_score_db_mutation: true, no_board_mutation: true, no_scoring: true, no_ranking: true, no_final_board: true }
  };
}
function dateOnly(value) {
  const m = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function addDays(dateText, days) { const d = new Date(`${dateText}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function todayPt() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const m = {}; for (const p of parts) m[p.type] = p.value;
  return `${m.year}-${m.month}-${m.day}`;
}
function retentionWindowPt(extraDates = []) {
  const today = todayPt();
  const tomorrow = addDays(today, 1);
  const dates = [...new Set([today, tomorrow, ...(extraDates || []).map(d => d instanceof Date ? d.toISOString().slice(0, 10) : dateOnly(d)).filter(Boolean)])].sort();
  return { start: dates[0], end: dates[dates.length - 1], dates };
}
function intOrNull(v) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : null; }
function numOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function roundOrNull(v, d = 1) { const n = numOrNull(v); if (n === null) return null; const f = 10 ** d; return Math.round(n * f) / f; }
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
  return { wind_speed_mph: mph ? numOrNull(mph[1]) : null, wind_direction_cardinal: parts.length > 1 ? parts.slice(1).join(", ") : null, wind_context: text };
}
function extractMlbWeather(json) {
  const w = (json && json.gameData && json.gameData.weather) || (json && json.liveData && json.liveData.linescore && json.liveData.linescore.weather) || null;
  if (!w || typeof w !== "object") return { ok: false, source_key: MLB_SOURCE_KEY, weather: null };
  const wind = parseMlbWind(w.wind || w.windSpeed || w.windDescription || "");
  return { ok: true, source_key: MLB_SOURCE_KEY, weather: { condition: w.condition || w.conditions || null, temperature_f: numOrNull(w.temp || w.temperature || w.temperatureF), wind_speed_mph: wind.wind_speed_mph, wind_direction_cardinal: wind.wind_direction_cardinal, wind_context: wind.wind_context, raw_weather: w } };
}
function mlbV11Base(env) {
  const raw = String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com/api/v1").replace(/\/+$/, "");
  try { const u = new URL(raw); return `${u.protocol}//${u.host}/api/v1.1`; } catch (_) { return "https://statsapi.mlb.com/api/v1.1"; }
}
function requestHeaders(env) { return { "accept": "application/json", "user-agent": String(env.MLB_API_USER_AGENT || "AlphaDog-v2-Daily-Weather/0.2 contact=Alphadog") }; }
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
  } finally { clearTimeout(timer); }
}
async function withDeadline(promise, ms, fallbackValue) {
  let timer = null;
  try {
    return await Promise.race([Promise.resolve(promise), new Promise(resolve => { timer = setTimeout(() => resolve(typeof fallbackValue === "function" ? fallbackValue() : fallbackValue), Math.max(500, Number(ms || 5000))); })]);
  } finally { if (timer) clearTimeout(timer); }
}
async function mapLimit(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await worker(items[i], i); } });
  await Promise.all(runners);
  return out;
}

async function ensureSchema(pg) {
  await pg.unsafe(`
CREATE TABLE IF NOT EXISTS daily.game_weather_batches (
  batch_id TEXT PRIMARY KEY, request_id TEXT, run_id TEXT, worker_name TEXT, worker_version TEXT, job_key TEXT, mode TEXT, status TEXT,
  window_start TEXT, window_end TEXT, calendar_games_checked INTEGER DEFAULT 0, prepared_games_checked INTEGER DEFAULT 0, prepared_rows_read INTEGER DEFAULT 0,
  weather_rows_written INTEGER DEFAULT 0, snapshot_rows_written INTEGER DEFAULT 0, indoor_games INTEGER DEFAULT 0, outdoor_games INTEGER DEFAULT 0,
  retractable_roof_games INTEGER DEFAULT 0, weather_source_failures INTEGER DEFAULT 0, roof_unknown_count INTEGER DEFAULT 0, weather_unknown_count INTEGER DEFAULT 0,
  blocker_count INTEGER DEFAULT 0, warning_count INTEGER DEFAULT 0, external_calls INTEGER DEFAULT 0, certification_status TEXT, certification_grade TEXT,
  certification_reason TEXT, output_json JSONB, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS daily.game_weather_snapshots (
  snapshot_id TEXT PRIMARY KEY, batch_id TEXT, game_pk BIGINT, official_date TEXT, venue_id BIGINT, source_key TEXT,
  source_snapshot_at TIMESTAMPTZ, forecast_time_utc TIMESTAMPTZ, temperature_f DOUBLE PRECISION, wind_speed_mph DOUBLE PRECISION,
  wind_direction_degrees DOUBLE PRECISION, precipitation_probability_pct DOUBLE PRECISION, roof_status TEXT, weather_status TEXT,
  raw_json JSONB, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS daily.game_weather_issues (
  issue_id TEXT PRIMARY KEY, batch_id TEXT, game_pk BIGINT, official_date TEXT, venue_id BIGINT, issue_status TEXT,
  issue_type TEXT, severity TEXT, reason TEXT, details_json JSONB, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gw_snap_batch ON daily.game_weather_snapshots(batch_id);
CREATE INDEX IF NOT EXISTS idx_gw_snap_date ON daily.game_weather_snapshots(official_date);
CREATE INDEX IF NOT EXISTS idx_gw_issues_batch ON daily.game_weather_issues(batch_id);
CREATE INDEX IF NOT EXISTS idx_gw_issues_date ON daily.game_weather_issues(official_date);
CREATE SCHEMA IF NOT EXISTS context;
CREATE TABLE IF NOT EXISTS context.history_game_weather (
  game_pk BIGINT PRIMARY KEY, official_date TEXT, venue_id BIGINT, home_team_id TEXT, temp_f INTEGER, condition TEXT,
  wind_speed_mph INTEGER, wind_direction_cardinal TEXT, wind_context TEXT, source_key TEXT, raw_json JSONB, captured_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE daily.game_weather_current ADD COLUMN IF NOT EXISTS weather_status TEXT;`);
}

async function permanentlyRecordConfirmedWeather(pg) {
  const rows = await pg`SELECT game_pk, official_date, venue_id, home_team_id, temperature_f, wind_speed_mph, wind_direction_cardinal, wind_context, source_key, raw_json FROM daily.game_weather_current WHERE data_source_level='real' AND temperature_f IS NOT NULL`.catch(() => []);
  if (!rows.length) return { copied: 0, checked: 0 };
  const gamePks = rows.map(r => r.game_pk);
  const existingRows = await pg`SELECT game_pk FROM context.history_game_weather WHERE game_pk IN ${pg(gamePks)}`.catch(() => []);
  const existingPks = new Set(existingRows.map(r => Number(r.game_pk)));
  const toInsert = rows.filter(r => !existingPks.has(Number(r.game_pk)));
  if (!toInsert.length) return { copied: 0, checked: rows.length };
  const insertRows = toInsert.map(r => ({ game_pk: r.game_pk, official_date: r.official_date, venue_id: r.venue_id, home_team_id: String(r.home_team_id || ""), temp_f: Math.round(Number(r.temperature_f)), condition: null, wind_speed_mph: Math.round(Number(r.wind_speed_mph) || 0), wind_direction_cardinal: r.wind_direction_cardinal, wind_context: r.wind_context, source_key: r.source_key, raw_json: r.raw_json }));
  const cols = ["game_pk", "official_date", "venue_id", "home_team_id", "temp_f", "condition", "wind_speed_mph", "wind_direction_cardinal", "wind_context", "source_key", "raw_json"];
  await pg`INSERT INTO context.history_game_weather ${pg(insertRows, ...cols)} ON CONFLICT (game_pk) DO NOTHING`;
  return { copied: insertRows.length, checked: rows.length };
}

async function pruneRetention(pg, retention) {
  const keepDatesLiteral = "{" + retention.dates.map(d => `"${d}"`).join(",") + "}";
  const current = await pg.unsafe(`DELETE FROM daily.game_weather_current WHERE official_date IS NULL OR official_date <> ALL($1::text[])`, [keepDatesLiteral]);
  const snapshots = await pg.unsafe(`DELETE FROM daily.game_weather_snapshots WHERE official_date IS NULL OR official_date <> ALL($1::text[])`, [keepDatesLiteral]);
  const issues = await pg.unsafe(`DELETE FROM daily.game_weather_issues WHERE official_date IS NULL OR official_date <> ALL($1::text[])`, [keepDatesLiteral]);
  return { current_deleted: current.count ?? null, snapshots_deleted: snapshots.count ?? null, issues_deleted: issues.count ?? null, retention_date_start: retention.start, retention_date_end: retention.end };
}

async function getPreparedGames(pg, retention) {
  const nowIso = new Date().toISOString();
  return await pg`SELECT official_game_pk, official_game_time_utc, official_date::text AS official_date, COUNT(*) AS prepared_board_pickable_rows
    FROM score.board_prepared_current
    WHERE pickable_safe = 1 AND matchup_status = 'calendar_matched' AND player_match_status = 'matched'
      AND official_game_pk IS NOT NULL AND official_game_time_utc IS NOT NULL AND official_date IN ${pg(retention.dates)} AND official_game_time_utc > ${nowIso}
    GROUP BY official_game_pk, official_game_time_utc, official_date ORDER BY official_game_time_utc`;
}
async function getCalendar(pg, gamePks) {
  if (!gamePks.length) return [];
  return await pg`SELECT game_pk, official_date::text AS official_date, game_time_utc, status_code, abstract_game_state, detailed_state, home_team_id, away_team_id, home_team_name, away_team_name, venue_id, venue_name
    FROM calendar.game_calendar WHERE game_pk IN ${pg(gamePks)}`;
}
async function getStadiums(pg, venueIds) {
  if (!venueIds.length) return [];
  return await pg`SELECT stadium_id, team_id, stadium_name, city, state, latitude, longitude, roof_type, turf_type, mlb_venue_id, timezone, active, source_key
    FROM ref.stadiums WHERE active=1 AND mlb_venue_id IN ${pg(venueIds)}`;
}
async function getParkFactors(pg, venueIds) {
  if (!venueIds.length) return [];
  return await pg`SELECT park_factor_id, stadium_id, mlb_venue_id, team_id, park_name, season_year, run_factor, hr_factor, lhb_run_factor, rhb_run_factor, lhb_hr_factor, rhb_hr_factor, factor_scale, source_key, source_name, source_confidence, active
    FROM ref.park_factors WHERE active=1 AND mlb_venue_id IN ${pg(venueIds)} ORDER BY mlb_venue_id, season_year DESC`;
}
async function fetchMlbFeed(env, gamePk) {
  const url = `${mlbV11Base(env)}/game/${gamePk}/feed/live`;
  const fetched = await fetchJson(url, env, true);
  return { ...fetched, source_key: MLB_SOURCE_KEY };
}
function openWeatherKey(env) { return env.OPENWEATHER_API_KEY || env.OPEN_WEATHER_API_KEY || env.OPENWEATHERMAP_API_KEY || null; }
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
    ...fetched, source_key: OPENWEATHER_SOURCE_KEY,
    weather: {
      forecast_time_utc: nearest ? nearest.forecast_time_utc : (row.dt ? new Date(Number(row.dt) * 1000).toISOString() : null),
      forecast_offset_minutes: nearest ? nearest.forecast_offset_minutes : null, temperature_f: roundOrNull(row.temp), feels_like_f: roundOrNull(row.feels_like),
      humidity_pct: roundOrNull(row.humidity, 0), pressure_mb: pressureHpaToMb(row.pressure), wind_speed_mph: roundOrNull(row.wind_speed), wind_gust_mph: roundOrNull(row.wind_gust),
      wind_direction_degrees: roundOrNull(row.wind_deg, 0), wind_direction_cardinal: directionCardinal(row.wind_deg),
      precipitation_probability_pct: nearest && row.pop !== undefined ? roundOrNull(Number(row.pop) * 100, 0) : null,
      precipitation_type: row.rain ? "rain" : (row.snow ? "snow" : null), condition: Array.isArray(row.weather) && row.weather[0] ? row.weather[0].description || row.weather[0].main || null : null
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
    ...fetched, source_key: OPEN_METEO_SOURCE_KEY,
    weather: {
      forecast_time_utc: nearest.forecast_time_utc, forecast_offset_minutes: nearest.forecast_offset_minutes,
      temperature_f: roundOrNull(h.temperature_2m && h.temperature_2m[i]), feels_like_f: roundOrNull(h.apparent_temperature && h.apparent_temperature[i]),
      humidity_pct: roundOrNull(h.relative_humidity_2m && h.relative_humidity_2m[i], 0), pressure_mb: roundOrNull(h.surface_pressure && h.surface_pressure[i], 0),
      wind_speed_mph: roundOrNull(h.wind_speed_10m && h.wind_speed_10m[i]), wind_gust_mph: roundOrNull(h.wind_gusts_10m && h.wind_gusts_10m[i]),
      wind_direction_degrees: roundOrNull(h.wind_direction_10m && h.wind_direction_10m[i], 0), wind_direction_cardinal: directionCardinal(h.wind_direction_10m && h.wind_direction_10m[i]),
      precipitation_probability_pct: roundOrNull(h.precipitation_probability && h.precipitation_probability[i], 0),
      precipitation_type: numOrNull(h.rain && h.rain[i]) > 0 ? "rain" : (numOrNull(h.precipitation && h.precipitation[i]) > 0 ? "precipitation" : null), condition: null
    }
  };
}
function mergeWeather(mlb, external) {
  const m = mlb && mlb.weather ? mlb.weather : {};
  const e = external && external.weather ? external.weather : {};
  return {
    forecast_time_utc: e.forecast_time_utc || null, forecast_offset_minutes: e.forecast_offset_minutes ?? null, temperature_f: e.temperature_f ?? m.temperature_f ?? null,
    feels_like_f: e.feels_like_f ?? null, humidity_pct: e.humidity_pct ?? null, pressure_mb: e.pressure_mb ?? null, wind_speed_mph: e.wind_speed_mph ?? m.wind_speed_mph ?? null,
    wind_gust_mph: e.wind_gust_mph ?? null, wind_direction_degrees: e.wind_direction_degrees ?? null, wind_direction_cardinal: e.wind_direction_cardinal ?? m.wind_direction_cardinal ?? null,
    wind_context: m.wind_context || null, precipitation_probability_pct: e.precipitation_probability_pct ?? null, precipitation_type: e.precipitation_type || null, condition: e.condition || m.condition || null
  };
}
function classifyWeather(row, calendar, stadium, parkFactor, mlbResult, externalResult, merged) {
  const issues = [];
  const roofType = normalizeRoofType(stadium && stadium.roof_type);
  let roofStatus = "unknown", roofConfidence = "LOW_SOURCE_AMBIGUOUS", indoorFlag = 0, weatherApplicableFlag = 1;
  const retractableFlag = roofType === "retractable" ? 1 : 0;
  if (roofType === "outdoor") { roofStatus = "outdoor"; roofConfidence = "HIGH_STATIC_STADIUM_ROOF_TYPE"; }
  else if (roofType === "fixed_dome") { roofStatus = "fixed_dome"; roofConfidence = "HIGH_STATIC_STADIUM_ROOF_TYPE"; indoorFlag = 1; weatherApplicableFlag = 0; }
  else if (roofType === "retractable") {
    const hasAnyWeatherForRoof = !!((mlbResult && mlbResult.ok && mlbResult.weather) || (externalResult && externalResult.ok && externalResult.weather));
    const roofPrecip = numOrNull(merged.precipitation_probability_pct);
    const roofTemp = numOrNull(merged.temperature_f);
    if (hasAnyWeatherForRoof && (roofPrecip !== null || roofTemp !== null)) {
      const likelyClosed = (roofPrecip !== null && roofPrecip >= 40) || (roofTemp !== null && (roofTemp < 50 || roofTemp > 95));
      roofStatus = likelyClosed ? "derived_likely_closed" : "derived_likely_open";
      roofConfidence = "LOW_DERIVED_FROM_WEATHER_CONDITIONS";
      issues.push({ severity: "warning", issue_type: "roof_status_derived", reason: `No live roof source; inferred ${roofStatus} from forecast conditions (precip ${roofPrecip}%, temp ${roofTemp}F).` });
    } else {
      roofStatus = "retractable_unknown"; roofConfidence = "WARNING_ROOF_UNKNOWN";
      issues.push({ severity: "warning", issue_type: "roof_unknown_retractable", reason: "Retractable roof venue has no proved live open/closed source and no weather data available to derive a likely state." });
    }
  } else {
    roofStatus = "unknown"; roofConfidence = "WARNING_ROOF_CLASSIFICATION_MISSING";
    issues.push({ severity: "warning", issue_type: "roof_classification_missing", reason: "Prepared-board relevant venue is missing safe roof classification; weather row is still written and full-run continues with warning." });
  }
  const hasMlb = !!(mlbResult && mlbResult.ok && mlbResult.weather);
  const hasExternal = !!(externalResult && externalResult.ok && externalResult.weather);
  const hasAnyWeather = hasMlb || hasExternal;
  let weatherStatus = "source_missing", weatherConfidence = "BLOCKED_SOURCE_MISSING";
  if (!weatherApplicableFlag) { weatherStatus = "indoor_not_applicable"; weatherConfidence = roofConfidence; }
  else if (hasExternal && merged.forecast_offset_minutes !== null && Math.abs(Number(merged.forecast_offset_minutes)) <= 90) { weatherStatus = "forecast_available"; weatherConfidence = "HIGH_FORECAST_NEAR_FIRST_PITCH"; }
  else if (hasExternal) { weatherStatus = "forecast_available"; weatherConfidence = "MEDIUM_FORECAST_WINDOW"; issues.push({ severity: "warning", issue_type: "forecast_offset_window", reason: "Forecast row is available but not within 90 minutes of first pitch." }); }
  else if (hasMlb) { weatherStatus = "current_conditions_available"; weatherConfidence = "HIGH_OFFICIAL_WEATHER"; }
  if (weatherApplicableFlag && !hasAnyWeather) issues.push({ severity: "blocker", issue_type: "weather_source_missing", reason: "Outdoor/weather-applicable prepared-board game has no usable MLB or external weather source row." });
  if (weatherApplicableFlag && (!stadium || numOrNull(stadium.latitude) === null || numOrNull(stadium.longitude) === null) && !hasMlb) issues.push({ severity: "blocker", issue_type: "venue_coordinates_missing", reason: "Venue coordinates missing and no MLB official weather fallback exists." });
  const precip = numOrNull(merged.precipitation_probability_pct);
  const wind = numOrNull(merged.wind_speed_mph);
  const rainRiskFlag = precip !== null && precip >= 35 ? 1 : 0;
  const delayRiskFlag = precip !== null && precip >= 55 ? 1 : 0;
  if (rainRiskFlag) issues.push({ severity: "warning", issue_type: "rain_risk", reason: `Precipitation probability is ${precip}%.` });
  if (wind !== null && wind >= 18) issues.push({ severity: "warning", issue_type: "wind_extreme", reason: `Wind speed is ${wind} mph.` });
  const roofIsDerived = roofStatus === "derived_likely_closed" || roofStatus === "derived_likely_open";
  const weatherIsReal = hasAnyWeather || !weatherApplicableFlag;
  const overallDataSourceLevel = roofIsDerived ? "derived" : (weatherIsReal ? "real" : "unknown");
  return {
    roof_type: roofType, roof_status: roofStatus, roof_confidence: roofConfidence, indoor_flag: indoorFlag, retractable_roof_flag: retractableFlag,
    weather_applicable_flag: weatherApplicableFlag, weather_status: weatherStatus, weather_confidence: weatherConfidence, rain_risk_flag: rainRiskFlag, delay_risk_flag: delayRiskFlag,
    data_source_level: overallDataSourceLevel, is_temporary_derived: roofIsDerived ? 1 : 0, issues,
    park_weather_notes: parkFactor ? `Park factors ${parkFactor.season_year}: run ${parkFactor.run_factor}, HR ${parkFactor.hr_factor}, scale ${parkFactor.factor_scale}` : null
  };
}
function compactRawWeatherAudit(record) {
  const raw = record && record.raw_json ? record.raw_json : {};
  return {
    compact_weather_audit_v0_2_0: true, game_pk: record.game_pk, official_date: record.official_date, game_time_utc: record.game_time_utc, venue_id: record.venue_id, venue_name: record.venue_name,
    prepared_board_pickable_rows: record.prepared_board_pickable_rows, weather_status: record.weather_status, weather_confidence: record.weather_confidence, roof_type: record.roof_type,
    roof_status: record.roof_status, roof_confidence: record.roof_confidence, source_key: record.source_key, source_endpoint: record.source_endpoint, source_snapshot_at: record.source_snapshot_at,
    forecast_time_utc: record.forecast_time_utc, forecast_offset_minutes: record.forecast_offset_minutes, temperature_f: record.temperature_f, feels_like_f: record.feels_like_f,
    humidity_pct: record.humidity_pct, pressure_mb: record.pressure_mb, wind_speed_mph: record.wind_speed_mph, wind_gust_mph: record.wind_gust_mph, wind_direction_degrees: record.wind_direction_degrees,
    wind_direction_cardinal: record.wind_direction_cardinal, precipitation_probability_pct: record.precipitation_probability_pct, precipitation_type: record.precipitation_type,
    rain_risk_flag: record.rain_risk_flag, delay_risk_flag: record.delay_risk_flag, indoor_flag: record.indoor_flag, retractable_roof_flag: record.retractable_roof_flag,
    weather_applicable_flag: record.weather_applicable_flag, park_weather_notes: record.park_weather_notes, issues: record.issues || [],
    source_summaries: { mlb_weather: raw.mlb_weather ? { ok: raw.mlb_weather.ok, source_key: raw.mlb_weather.source_key, weather: raw.mlb_weather.weather || null } : null, external_weather: raw.external_weather || null, merged_weather: raw.merged_weather || null, classification: raw.classification || null }
  };
}
async function writeGames(pg, batchId, records) {
  if (!records.length) return { current_written: 0, snapshot_written: 0, issues_written: 0 };
  const currentRows = records.map(record => ({
    weather_id: `dgw_${record.official_date}_${record.game_pk}`, batch_id: batchId, game_pk: record.game_pk, official_date: record.official_date, game_time_utc: record.game_time_utc,
    venue_id: record.venue_id, venue_name: record.venue_name, home_team_id: record.home_team_id, away_team_id: record.away_team_id, prepared_board_relevant: record.prepared_board_relevant,
    prepared_board_pickable_rows: record.prepared_board_pickable_rows, weather_status: record.weather_status, weather_confidence: record.weather_confidence, source_key: record.source_key,
    source_endpoint: record.source_endpoint, source_snapshot_at: record.source_snapshot_at, forecast_time_utc: record.forecast_time_utc, forecast_offset_minutes: record.forecast_offset_minutes,
    temperature_f: record.temperature_f, feels_like_f: record.feels_like_f, humidity_pct: record.humidity_pct, pressure_mb: record.pressure_mb, wind_speed_mph: record.wind_speed_mph,
    wind_gust_mph: record.wind_gust_mph, wind_direction_degrees: record.wind_direction_degrees, wind_direction_cardinal: record.wind_direction_cardinal, wind_context: record.wind_context,
    precipitation_probability_pct: record.precipitation_probability_pct, precipitation_type: record.precipitation_type, rain_risk_flag: record.rain_risk_flag, delay_risk_flag: record.delay_risk_flag,
    roof_type: record.roof_type, roof_status: record.roof_status, roof_confidence: record.roof_confidence, indoor_flag: record.indoor_flag, retractable_roof_flag: record.retractable_roof_flag,
    weather_applicable_flag: record.weather_applicable_flag, data_source_level: record.data_source_level, is_temporary_derived: record.is_temporary_derived, park_weather_notes: record.park_weather_notes,
    raw_json: safeJson(compactRawWeatherAudit(record), 6000)
  }));
  const currentCols = ["weather_id", "batch_id", "game_pk", "official_date", "game_time_utc", "venue_id", "venue_name", "home_team_id", "away_team_id", "prepared_board_relevant", "prepared_board_pickable_rows", "weather_status", "weather_confidence", "source_key", "source_endpoint", "source_snapshot_at", "forecast_time_utc", "forecast_offset_minutes", "temperature_f", "feels_like_f", "humidity_pct", "pressure_mb", "wind_speed_mph", "wind_gust_mph", "wind_direction_degrees", "wind_direction_cardinal", "wind_context", "precipitation_probability_pct", "precipitation_type", "rain_risk_flag", "delay_risk_flag", "roof_type", "roof_status", "roof_confidence", "indoor_flag", "retractable_roof_flag", "weather_applicable_flag", "data_source_level", "is_temporary_derived", "park_weather_notes", "raw_json"];
  await pg`INSERT INTO daily.game_weather_current ${pg(currentRows, ...currentCols)}
    ON CONFLICT (game_pk) DO UPDATE SET weather_id=excluded.weather_id, batch_id=excluded.batch_id, official_date=excluded.official_date, game_time_utc=excluded.game_time_utc,
    venue_id=excluded.venue_id, venue_name=excluded.venue_name, home_team_id=excluded.home_team_id, away_team_id=excluded.away_team_id, prepared_board_relevant=excluded.prepared_board_relevant,
    prepared_board_pickable_rows=excluded.prepared_board_pickable_rows, weather_status=excluded.weather_status, weather_confidence=excluded.weather_confidence, source_key=excluded.source_key,
    source_endpoint=excluded.source_endpoint, source_snapshot_at=excluded.source_snapshot_at, forecast_time_utc=excluded.forecast_time_utc, forecast_offset_minutes=excluded.forecast_offset_minutes,
    temperature_f=excluded.temperature_f, feels_like_f=excluded.feels_like_f, humidity_pct=excluded.humidity_pct, pressure_mb=excluded.pressure_mb, wind_speed_mph=excluded.wind_speed_mph,
    wind_gust_mph=excluded.wind_gust_mph, wind_direction_degrees=excluded.wind_direction_degrees, wind_direction_cardinal=excluded.wind_direction_cardinal, wind_context=excluded.wind_context,
    precipitation_probability_pct=excluded.precipitation_probability_pct, precipitation_type=excluded.precipitation_type, rain_risk_flag=excluded.rain_risk_flag, delay_risk_flag=excluded.delay_risk_flag,
    roof_type=excluded.roof_type, roof_status=excluded.roof_status, roof_confidence=excluded.roof_confidence, indoor_flag=excluded.indoor_flag, retractable_roof_flag=excluded.retractable_roof_flag,
    weather_applicable_flag=excluded.weather_applicable_flag, data_source_level=excluded.data_source_level, is_temporary_derived=excluded.is_temporary_derived, park_weather_notes=excluded.park_weather_notes,
    last_seen_at=now(), raw_json=excluded.raw_json, updated_at=now()`;

  const snapshotRows = records.map(r => ({ snapshot_id: rid("dgw_snap"), batch_id: batchId, game_pk: r.game_pk, official_date: r.official_date, venue_id: r.venue_id, source_key: r.source_key, source_snapshot_at: r.source_snapshot_at, forecast_time_utc: r.forecast_time_utc, temperature_f: r.temperature_f, wind_speed_mph: r.wind_speed_mph, wind_direction_degrees: r.wind_direction_degrees, precipitation_probability_pct: r.precipitation_probability_pct, roof_status: r.roof_status, weather_status: r.weather_status, raw_json: safeJson(compactRawWeatherAudit(r), 6000) }));
  const snapshotCols = ["snapshot_id", "batch_id", "game_pk", "official_date", "venue_id", "source_key", "source_snapshot_at", "forecast_time_utc", "temperature_f", "wind_speed_mph", "wind_direction_degrees", "precipitation_probability_pct", "roof_status", "weather_status", "raw_json"];
  await pg`INSERT INTO daily.game_weather_snapshots ${pg(snapshotRows, ...snapshotCols)}`;

  const issueRows = [];
  for (const record of records) {
    for (const issue of record.issues) {
      issueRows.push({ issue_id: rid("dgw_issue"), batch_id: batchId, game_pk: record.game_pk, official_date: record.official_date, venue_id: record.venue_id, issue_status: "open", issue_type: issue.issue_type, severity: issue.severity, reason: issue.reason, details_json: safeJson({ game_pk: record.game_pk, venue_id: record.venue_id, roof_type: record.roof_type, source_key: record.source_key, weather_status: record.weather_status }, 3000) });
    }
  }
  if (issueRows.length) {
    const issueCols = ["issue_id", "batch_id", "game_pk", "official_date", "venue_id", "issue_status", "issue_type", "severity", "reason", "details_json"];
    await pg`INSERT INTO daily.game_weather_issues ${pg(issueRows, ...issueCols)}`;
  }
  return { current_written: currentRows.length, snapshot_written: snapshotRows.length, issues_written: issueRows.length };
}

function assertWeatherBudget(startedMs, step) {
  const elapsed = Date.now() - startedMs;
  if (elapsed > WEATHER_SOFT_LIMIT_MS) {
    const err = new Error(`Daily Weather soft time budget exceeded at ${step} after ${elapsed}ms`);
    err.code = "DAILY_WEATHER_SOFT_TIME_BUDGET_EXCEEDED"; err.elapsed_ms = elapsed; err.step = step;
    throw err;
  }
}

async function finalizeWeatherWindowReplacement(pg, retention, batchId) {
  const r = await pg.unsafe(`DELETE FROM daily.game_weather_current WHERE official_date IN ($1, $2) AND (batch_id IS NULL OR batch_id <> $3)`, [retention.start, retention.end, batchId]);
  return { cleaned: true, stale_current_deleted: r.count ?? null, active_batch_id: batchId, retention_date_start: retention.start, retention_date_end: retention.end };
}
async function cleanupWeatherBatchSidecars(pg, batchId) {
  if (!batchId) return { cleaned: false };
  const snapshots = await pg`DELETE FROM daily.game_weather_snapshots WHERE batch_id=${batchId}`;
  const issues = await pg`DELETE FROM daily.game_weather_issues WHERE batch_id=${batchId}`;
  return { cleaned: true, batch_id: batchId, current_deleted: 0, current_cleanup_policy: "non_destructive_keep_current_rows_on_failure", snapshots_deleted: snapshots.count ?? null, issues_deleted: issues.count ?? null };
}

async function runWeather(env, input) {
  const startedMs = Date.now();
  const startedAt = nowUtc();
  const batchId = rid("daily_game_weather_batch");
  const requestId = input.request_id || batchId;
  const runId = input.run_id || null;
  let batchStarted = false;
  let prepared = [], calendars = [], records = [];
  let currentWritten = 0, snapshotWritten = 0, issuesWritten = 0, externalCalls = 0, sourceFailures = 0;
  const pg = pgClient(env);
  try {
    const nowIsoForWindow = new Date().toISOString();
    const realBoardDateRows = await pg.unsafe(`SELECT DISTINCT official_date::text AS official_date FROM score.board_prepared_current WHERE pickable_safe = 1 AND official_game_time_utc IS NOT NULL AND official_game_time_utc > $1`, [nowIsoForWindow]);
    const realBoardDates = realBoardDateRows.map(r => r.official_date).filter(Boolean);
    const retention = retentionWindowPt(realBoardDates);

    await ensureSchema(pg);
    await pg.unsafe(`INSERT INTO daily.game_weather_batches (batch_id, request_id, run_id, worker_name, worker_version, job_key, mode, status, window_start, window_end, started_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'running',$8,$9,$10)`,
      [batchId, requestId, runId, WORKER_NAME, VERSION, input.job_key || JOB_KEY, input.mode || "daily_weather_refresh_window", retention.start, retention.end, startedAt]);
    batchStarted = true;

    prepared = await getPreparedGames(pg, retention);
    const preparedRowsRead = prepared.reduce((n, r) => n + Number(r.prepared_board_pickable_rows || 0), 0);
    assertWeatherBudget(startedMs, "prepared_rows_read");

    const gamePks = [...new Set(prepared.map(r => intOrNull(r.official_game_pk)).filter(v => v !== null))];
    calendars = await getCalendar(pg, gamePks);
    const calendarByGame = new Map(calendars.map(r => [intOrNull(r.game_pk), r]));
    const venueIds = [...new Set(calendars.map(r => intOrNull(r.venue_id)).filter(v => v !== null))];
    const stadiums = await getStadiums(pg, venueIds);
    const stadiumByVenue = new Map(stadiums.map(r => [intOrNull(r.mlb_venue_id), r]));
    const parkFactors = await getParkFactors(pg, venueIds);
    const parkByVenue = new Map();
    for (const pf of parkFactors) if (!parkByVenue.has(intOrNull(pf.mlb_venue_id))) parkByVenue.set(intOrNull(pf.mlb_venue_id), pf);
    assertWeatherBudget(startedMs, "reference_rows_read");

    const sourceSnapshotAt = nowUtc();
    records = await mapLimit(prepared, WEATHER_FETCH_CONCURRENCY, async (p) => {
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
      return {
        game_pk: gamePk, official_date: p.official_date || cal.official_date, game_time_utc: p.official_game_time_utc || cal.game_time_utc, venue_id: venueId,
        venue_name: cal.venue_name || (stadium && stadium.stadium_name) || null, home_team_id: intOrNull(cal.home_team_id), away_team_id: intOrNull(cal.away_team_id),
        prepared_board_relevant: 1, prepared_board_pickable_rows: Number(p.prepared_board_pickable_rows || 0), weather_status: classified.weather_status, weather_confidence: classified.weather_confidence,
        source_key: sourceKey, source_endpoint: sourceEndpoint, source_snapshot_at: sourceSnapshotAt, forecast_time_utc: merged.forecast_time_utc, forecast_offset_minutes: merged.forecast_offset_minutes,
        temperature_f: merged.temperature_f, feels_like_f: merged.feels_like_f, humidity_pct: merged.humidity_pct, pressure_mb: merged.pressure_mb, wind_speed_mph: merged.wind_speed_mph,
        wind_gust_mph: merged.wind_gust_mph, wind_direction_degrees: merged.wind_direction_degrees, wind_direction_cardinal: merged.wind_direction_cardinal, wind_context: merged.wind_context,
        precipitation_probability_pct: merged.precipitation_probability_pct, precipitation_type: merged.precipitation_type, rain_risk_flag: classified.rain_risk_flag, delay_risk_flag: classified.delay_risk_flag,
        roof_type: classified.roof_type, roof_status: classified.roof_status, roof_confidence: classified.roof_confidence, indoor_flag: classified.indoor_flag, retractable_roof_flag: classified.retractable_roof_flag,
        weather_applicable_flag: classified.weather_applicable_flag, data_source_level: classified.data_source_level, is_temporary_derived: classified.is_temporary_derived, park_weather_notes: classified.park_weather_notes,
        issues: classified.issues,
        raw_json: { prepared: p, calendar: cal, stadium, park_factor: parkFactor, mlb_weather: mlbWeather, external_weather: external ? { ok: external.ok, skipped: external.skipped || false, source_key: external.source_key, status: external.status, reason: external.reason || null, weather: external.weather || null, url: external.url || null, error: external.error || null } : null, merged_weather: merged, classification: classified }
      };
    });
    assertWeatherBudget(startedMs, "source_fetch_complete");

    const written = await writeGames(pg, batchId, records);
    currentWritten = written.current_written; snapshotWritten = written.snapshot_written; issuesWritten = written.issues_written;
    assertWeatherBudget(startedMs, "writing_context");

    const replacementCleanup = await finalizeWeatherWindowReplacement(pg, retention, batchId);
    const permanentWeatherBackfill = await permanentlyRecordConfirmedWeather(pg).catch(() => ({ copied: 0, checked: 0, error: true }));
    const postRetentionPrune = await pruneRetention(pg, retention);
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
      ok: dataOk, data_ok: dataOk, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, run_id: runId, batch_id: batchId, status, certification, certification_grade: grade,
      certification_reason: noPickableSlate ? "No prepared-board pickable_safe games exist for today/tomorrow retention window." : (dataOk ? "Every prepared-board relevant game received weather/roof current and snapshot rows; warnings are sidecar issues." : "One or more prepared-board relevant games had blockers or coverage gaps."),
      window_start: retention.start, window_end: retention.end, calendar_games_checked: calendars.length, prepared_games_checked: records.length, prepared_rows_read: preparedRowsRead,
      weather_rows_written: currentWritten, rows_written: currentWritten, snapshot_rows_written: snapshotWritten, issues_written: issuesWritten, indoor_games: indoorGames, outdoor_games: outdoorGames,
      retractable_roof_games: retractableGames, weather_source_failures: sourceFailures, roof_unknown_count: roofUnknownCount, weather_unknown_count: weatherUnknownCount, blocker_count: blockerCount,
      warning_count: warningCount, external_calls: externalCalls, external_calls_performed: externalCalls,
      current_games: records.map(r => ({ game_pk: r.game_pk, official_date: r.official_date, venue_name: r.venue_name, roof_status: r.roof_status, weather_status: r.weather_status, weather_confidence: r.weather_confidence, source_key: r.source_key, temp_f: r.temperature_f, wind_mph: r.wind_speed_mph, precip_pct: r.precipitation_probability_pct, issues: r.issues.length })),
      retention_policy: "non_destructive_fetch_then_success_only_window_replacement_today_tomorrow_batches_retained_for_audit",
      successful_window_replacement_cleanup: replacementCleanup, retention_post_prune: postRetentionPrune, permanent_history_backfill: permanentWeatherBackfill,
      source_fetch_timeout_ms: FETCH_TIMEOUT_MS, source_fetch_concurrency: WEATHER_FETCH_CONCURRENCY,
      sidecar_tables: ["daily.game_weather_current", "daily.game_weather_snapshots", "daily.game_weather_batches", "daily.game_weather_issues"],
      no_score_db_mutation: true, no_board_mutation: true, no_calendar_rebuild: true, no_daily_starters_duplication: true, no_daily_lineups_duplication: true, no_daily_player_availability_duplication: true,
      no_scoring: true, no_ranking: true, no_final_board: true, timestamp_utc: nowUtc()
    };
    await pg.unsafe(`UPDATE daily.game_weather_batches SET status=$1, calendar_games_checked=$2, prepared_games_checked=$3, prepared_rows_read=$4, weather_rows_written=$5, snapshot_rows_written=$6,
       indoor_games=$7, outdoor_games=$8, retractable_roof_games=$9, weather_source_failures=$10, roof_unknown_count=$11, weather_unknown_count=$12, blocker_count=$13, warning_count=$14, external_calls=$15,
       certification_status=$16, certification_grade=$17, certification_reason=$18, output_json=$19, completed_at=now(), updated_at=now() WHERE batch_id=$20`,
      [status, calendars.length, records.length, preparedRowsRead, currentWritten, snapshotWritten, indoorGames, outdoorGames, retractableGames, sourceFailures, roofUnknownCount, weatherUnknownCount, blockerCount, warningCount, externalCalls, certification, grade, output.certification_reason, JSON.stringify(output).slice(0, 14000), batchId]);
    return output;
  } catch (err) {
    const errorText = String(err && err.stack ? err.stack : err);
    let cleanup = null;
    if (batchStarted) cleanup = await cleanupWeatherBatchSidecars(pg, batchId).catch(() => null);
    const preparedRowsRead = prepared.reduce((n, r) => n + Number(r.prepared_board_pickable_rows || 0), 0);
    const output = {
      ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, run_id: runId, batch_id: batchId,
      status: "failed_exception_terminal", certification: "DAILY_WEATHER_FAILED_EXCEPTION_TERMINAL_NON_DESTRUCTIVE", certification_grade: "FAIL",
      certification_reason: "Daily Weather failed inside bounded worker lifecycle; partial snapshots/issues for this batch were cleaned and current rows were preserved.",
      error: errorText, cleanup, calendar_games_checked: calendars.length, prepared_games_checked: records.length || prepared.length, prepared_rows_read: preparedRowsRead,
      weather_rows_written: currentWritten, snapshot_rows_written: snapshotWritten, issues_written: issuesWritten, external_calls: externalCalls, source_failures: sourceFailures,
      timestamp_utc: nowUtc(), no_score_db_mutation: true, no_board_mutation: true, no_scoring: true
    };
    if (batchStarted) {
      await pg.unsafe(`UPDATE daily.game_weather_batches SET status=$1, calendar_games_checked=$2, prepared_games_checked=$3, prepared_rows_read=$4, weather_rows_written=$5, snapshot_rows_written=$6,
         weather_source_failures=$7, external_calls=$8, certification_status=$9, certification_grade=$10, certification_reason=$11, output_json=$12, completed_at=now(), updated_at=now() WHERE batch_id=$13`,
        ["failed_exception_terminal", calendars.length, records.length || prepared.length, preparedRowsRead, currentWritten, snapshotWritten, sourceFailures, externalCalls, output.certification, output.certification_grade, output.certification_reason, JSON.stringify(output).slice(0, 14000), batchId]).catch(() => {});
    }
    return output;
  } finally {
    await pg.end({ timeout: 1 }).catch(() => {});
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return jsonResponse({ ok: true });
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();
    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));
    if (method === "GET" && path === "/health") return jsonResponse({ ...baseIdentity(env), route: "/health", checks: { db_bindings: { HYPERDRIVE: Boolean(env.HYPERDRIVE) }, vars: varPresence(env, EXPECTED_VARS), weather_keys_present: { OPENWEATHER_API_KEY: !!env.OPENWEATHER_API_KEY, OPEN_WEATHER_API_KEY: !!env.OPEN_WEATHER_API_KEY, OPENWEATHERMAP_API_KEY: !!env.OPENWEATHERMAP_API_KEY } } });
    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      return jsonResponse({ ...baseIdentity(env), route: "/diagnostic", input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, job_key: input.job_key || null, mode: input.mode || null } });
    }
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        const HARD_DEADLINE_MS = 19200;
        const TIMEOUT_SENTINEL = { __hard_deadline_timeout__: true };
        const out = await withDeadline(runWeather(env, input), HARD_DEADLINE_MS, TIMEOUT_SENTINEL);
        if (out === TIMEOUT_SENTINEL) {
          return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "hard_deadline_timeout", certification: "DAILY_WEATHER_HARD_DEADLINE_TIMEOUT", error: `Worker exceeded its own ${HARD_DEADLINE_MS}ms internal deadline`, hard_deadline_ms: HARD_DEADLINE_MS, timestamp_utc: nowUtc() }, 200);
        }
        return jsonResponse(out);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "exception_terminal", certification: "DAILY_WEATHER_EXCEPTION_TERMINAL", error: String(err && err.stack ? err.stack : err), timestamp_utc: nowUtc(), no_score_db_mutation: true, no_board_mutation: true }, 500);
      }
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
