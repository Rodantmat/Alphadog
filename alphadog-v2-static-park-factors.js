const WORKER_NAME = "alphadog-v2-static-park-factors";
const VERSION = "alphadog-v2-static-park-factors-v0.1.2-tb-tbr-fallback-alias";
const JOB_KEY = "static-park-factors";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "MLB_API_BASE_URL", "WORKER_SAFE_MODE", "DEBUG_MODE"];

const SOURCE_NAME = "Baseball Savant / MLB Statcast Park Factors";
const SOURCE_BASE_URL = "https://baseballsavant.mlb.com/leaderboard/statcast-park-factors";
const SEASON_YEAR = 2025;
const PRIMARY_ROLLING = 3;
const FALLBACK_ROLLING = 1;
const FACTOR_SCALE = "100_NEUTRAL_STATCAST";
const SOURCE_CONFIDENCE = "AUTOMATED_OFFICIAL_MLB_HTML_PAYLOAD";
const PRIMARY_SOURCE_KEY = "baseball_savant_statcast_park_factors_2025_rolling3";
const FALLBACK_SOURCE_KEY = "baseball_savant_statcast_park_factors_2025_rolling1_fallback";
const FACTOR_MIN = 40;
const FACTOR_MAX = 220;

function nowUtc() { return new Date().toISOString(); }

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
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

function allTrue(obj) { return Object.values(obj).every(Boolean); }
function text(value) { return String(value === undefined || value === null ? "" : value).trim(); }
function num(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function normalize(value) { return text(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " "); }
function safeId(value) { return normalize(value).replace(/\s+/g, "_").slice(0, 120); }
function uniq(arr) { return Array.from(new Set(arr.filter(v => v !== null && v !== undefined && String(v).length > 0).map(v => String(v)))); }

async function readJsonSafe(request) {
  try { return await request.json(); } catch { return {}; }
}

async function all(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  const res = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
  return res.results || [];
}

async function run(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  return binds.length ? await stmt.bind(...binds).run() : await stmt.run();
}

function base(env, extra = {}) {
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "STATIC_PARK_FACTORS_WORKER_READY",
    timestamp_utc: nowUtc(),
    source_name: SOURCE_NAME,
    source_url: SOURCE_BASE_URL,
    boundaries: {
      writes_only: ["REF_DB.ref_park_factors"],
      no_prizepicks_board_mutation: true,
      no_opponent_backfill: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true,
      no_sleeper_work: true,
      no_old_production_touch: true,
      no_gemini_api: true,
      no_neutral_placeholder_values: true
    },
    bindings: bindingPresence(env, REQUIRED_DB_BINDINGS),
    vars: varPresence(env, EXPECTED_VARS),
    ...extra
  };
}

async function ensureSchema(env) {
  await run(env.REF_DB, `CREATE TABLE IF NOT EXISTS ref_park_factors (
    park_factor_id TEXT PRIMARY KEY,
    stadium_id TEXT NOT NULL,
    mlb_venue_id INTEGER,
    team_id TEXT,
    park_name TEXT NOT NULL,
    season_year INTEGER NOT NULL,
    run_factor REAL,
    hr_factor REAL,
    lhb_run_factor REAL,
    rhb_run_factor REAL,
    lhb_hr_factor REAL,
    rhb_hr_factor REAL,
    factor_scale TEXT DEFAULT '100_NEUTRAL',
    source_key TEXT NOT NULL,
    source_name TEXT,
    source_confidence TEXT,
    active INTEGER DEFAULT 1,
    raw_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_ref_park_factors_stadium_active ON ref_park_factors(stadium_id, active)");
  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_ref_park_factors_team_season_active ON ref_park_factors(team_id, season_year, active)");
  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_ref_park_factors_venue_season_active ON ref_park_factors(mlb_venue_id, season_year, active)");
  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_ref_park_factors_source_active ON ref_park_factors(source_key, active)");

  await run(env.REF_DB, `INSERT OR REPLACE INTO ref_schema_migrations
    (migration_key, package_version, applied_at, notes)
    VALUES ('schema_ref_db_static_park_factors_v0_1', ?, CURRENT_TIMESTAMP, 'Additive REF_DB static park factors table for real sourced Baseball Savant run/HR environment; no scoring, no board mutation')`, VERSION);
}

function savantUrl({ batSide = "", rolling = PRIMARY_ROLLING }) {
  const u = new URL(SOURCE_BASE_URL);
  u.searchParams.set("type", "year");
  u.searchParams.set("year", String(SEASON_YEAR));
  u.searchParams.set("batSide", batSide);
  u.searchParams.set("stat", "index_wOBA");
  u.searchParams.set("condition", "All");
  u.searchParams.set("rolling", String(rolling));
  return u.toString();
}

function extractVarData(html) {
  const source = String(html || "");
  const patterns = [
    /var\s+data\s*=\s*(\[[\s\S]*?\]);/,
    /let\s+data\s*=\s*(\[[\s\S]*?\]);/,
    /const\s+data\s*=\s*(\[[\s\S]*?\]);/,
    /data\s*=\s*(\[[\s\S]*?\]);/
  ];
  for (const pattern of patterns) {
    const m = source.match(pattern);
    if (m && m[1]) {
      const parsed = JSON.parse(m[1]);
      if (Array.isArray(parsed)) return parsed;
    }
  }
  throw new Error("baseball_savant_var_data_payload_not_found");
}

async function fetchSavant({ batSide = "", rolling = PRIMARY_ROLLING }) {
  const url = savantUrl({ batSide, rolling });
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      "user-agent": "AlphaDogV2StaticParkFactors/0.1 (+controlled-reference-refresh)"
    }
  });
  const html = await resp.text();
  if (!resp.ok) {
    throw new Error(`baseball_savant_fetch_failed_${resp.status}`);
  }
  if (!html || !html.includes("data")) {
    throw new Error("baseball_savant_html_missing_data_marker");
  }
  const rows = extractVarData(html);
  return { url, http_status: resp.status, rows, row_count: rows.length };
}

async function readActiveStadiums(env) {
  const rows = await all(env.REF_DB, `SELECT
      s.stadium_id,
      s.team_id,
      s.stadium_name,
      s.mlb_venue_id,
      s.active AS stadium_active,
      t.abbreviation,
      t.full_name,
      t.nickname,
      t.active AS team_active
    FROM ref_stadiums s
    LEFT JOIN ref_teams t ON t.team_id = s.team_id
    WHERE COALESCE(s.active,1)=1
      AND COALESCE(t.active,1)=1
    ORDER BY t.abbreviation, s.stadium_name`);
  return rows;
}

function indexByVenue(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const venue = num(row.venue_id);
    if (venue !== null) map.set(String(venue), row);
  }
  return map;
}

function abbrKey(value) {
  return text(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const TEAM_ABBREVIATION_ALIASES = {
  TB: ["TB", "TBR", "RAYS"],
  TBR: ["TBR", "TB", "RAYS"],
  ATH: ["ATH", "OAK", "AS", "ATHLETICS"],
  OAK: ["OAK", "ATH", "AS", "ATHLETICS"],
  AZ: ["AZ", "ARI", "DBACKS", "DIAMONDBACKS"],
  ARI: ["ARI", "AZ", "DBACKS", "DIAMONDBACKS"],
  CWS: ["CWS", "CHW", "WHITESOX"],
  CHW: ["CHW", "CWS", "WHITESOX"],
  LAD: ["LAD", "LA", "DODGERS"],
  WSH: ["WSH", "WAS", "NATIONALS"],
  WAS: ["WAS", "WSH", "NATIONALS"]
};

function teamLookupKeys(value) {
  const key = abbrKey(value);
  const out = [];
  if (key) out.push(key);
  const aliases = TEAM_ABBREVIATION_ALIASES[key] || [];
  for (const alias of aliases) {
    const k = abbrKey(alias);
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

function indexByTeamAlt(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const sourceValues = [row.team_name_alt, row.team_name, row.team_code, row.abbreviation];
    const keys = [];
    for (const value of sourceValues) {
      for (const key of teamLookupKeys(value)) {
        if (key && !keys.includes(key)) keys.push(key);
      }
    }
    for (const key of keys) if (!map.has(key)) map.set(key, row);
  }
  return map;
}

function getMetric(row, candidateKeys) {
  if (!row) return { value: null, key: null };
  for (const key of candidateKeys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const v = num(row[key]);
      if (v !== null && v !== 0) return { value: v, key };
    }
  }
  for (const key of candidateKeys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const v = num(row[key]);
      if (v !== null) return { value: v, key };
    }
  }
  return { value: null, key: null };
}

const RUN_FACTOR_KEYS = ["index_r", "index_run", "index_runs", "index_R", "index_RUN", "r", "R", "run", "runs"];
const HR_FACTOR_KEYS = ["index_hr", "index_HR", "hr", "HR", "home_run", "home_runs"];

function getCompleteRows(maps, stadium) {
  if (!maps) return null;
  const venue = String(num(stadium.mlb_venue_id));
  const teamKeys = [];
  for (const value of [stadium.abbreviation, stadium.nickname, stadium.full_name, stadium.team_id]) {
    for (const key of teamLookupKeys(value)) {
      if (key && !teamKeys.includes(key)) teamKeys.push(key);
    }
  }
  let matchMode = "venue_id";
  let overall = maps.bothByVenue.get(venue);
  let left = maps.lByVenue.get(venue);
  let right = maps.rByVenue.get(venue);
  if (!(overall && left && right) && teamKeys.length) {
    for (const team of teamKeys) {
      const tOverall = maps.bothByTeam.get(team);
      const tLeft = maps.lByTeam.get(team);
      const tRight = maps.rByTeam.get(team);
      if (tOverall && tLeft && tRight) {
        overall = tOverall;
        left = tLeft;
        right = tRight;
        matchMode = `team_abbreviation_fallback_${team}`;
        break;
      }
    }
  }
  return overall && left && right ? { overall, left, right, matchMode } : null;
}

function buildRow({ stadium, overall, left, right, rolling, matchMode }) {
  const run = getMetric(overall, RUN_FACTOR_KEYS);
  const hr = getMetric(overall, HR_FACTOR_KEYS);
  const lhbRunMetric = getMetric(left, RUN_FACTOR_KEYS);
  const rhbRunMetric = getMetric(right, RUN_FACTOR_KEYS);
  const lhbHrMetric = getMetric(left, HR_FACTOR_KEYS);
  const rhbHrMetric = getMetric(right, HR_FACTOR_KEYS);
  const sourceVenueId = num(overall && overall.venue_id);
  const refVenueId = num(stadium.mlb_venue_id);
  const mlbVenueId = sourceVenueId !== null ? sourceVenueId : refVenueId;
  const rollingLabel = rolling === PRIMARY_ROLLING ? "3_YEAR" : "1_YEAR_FALLBACK";
  const sourceKey = rolling === PRIMARY_ROLLING ? PRIMARY_SOURCE_KEY : FALLBACK_SOURCE_KEY;
  const sourceParkName = text(overall && overall.venue_name);
  const raw = {
    extraction_method: "baseball_savant_html_var_data_regex",
    season_year: SEASON_YEAR,
    rolling_window: rollingLabel,
    source_url_base: SOURCE_BASE_URL,
    matched_by: matchMode || "venue_id",
    source_metric_keys: {
      run_factor: run.key,
      hr_factor: hr.key,
      lhb_run_factor: lhbRunMetric.key,
      rhb_run_factor: rhbRunMetric.key,
      lhb_hr_factor: lhbHrMetric.key,
      rhb_hr_factor: rhbHrMetric.key
    },
    reference_stadium: {
      stadium_id: stadium.stadium_id,
      stadium_name: stadium.stadium_name,
      mlb_venue_id: refVenueId,
      team_id: stadium.team_id,
      abbreviation: stadium.abbreviation
    },
    source_venue_id_differs_from_ref: sourceVenueId !== null && refVenueId !== null && sourceVenueId !== refVenueId,
    both_source_row: overall,
    lhb_source_row: left,
    rhb_source_row: right
  };

  return {
    park_factor_id: `pf_${SEASON_YEAR}_${rolling === PRIMARY_ROLLING ? "rolling3" : "rolling1fb"}_${safeId(stadium.team_id)}_${safeId(sourceParkName || stadium.stadium_name || stadium.stadium_id)}`,
    stadium_id: text(stadium.stadium_id),
    mlb_venue_id: mlbVenueId,
    team_id: text(stadium.team_id),
    park_name: sourceParkName || text(stadium.stadium_name),
    season_year: SEASON_YEAR,
    run_factor: run.value,
    hr_factor: hr.value,
    lhb_run_factor: lhbRunMetric.value,
    rhb_run_factor: rhbRunMetric.value,
    lhb_hr_factor: lhbHrMetric.value,
    rhb_hr_factor: rhbHrMetric.value,
    factor_scale: FACTOR_SCALE,
    source_key: sourceKey,
    source_name: SOURCE_NAME,
    source_confidence: SOURCE_CONFIDENCE,
    active: 1,
    raw_json: JSON.stringify(raw).slice(0, 65000),
    rolling_window: rollingLabel,
    team_abbreviation: text(stadium.abbreviation),
    source_team_name_alt: text(overall && overall.team_name_alt),
    match_mode: matchMode || "venue_id"
  };
}

function validateRows(rows, activeStadiums) {
  const errors = [];
  const warnings = [];
  if (activeStadiums.length !== 30) errors.push(`active_stadium_count_expected_30_got_${activeStadiums.length}`);
  if (rows.length !== 30) errors.push(`final_row_count_expected_30_got_${rows.length}`);
  if (uniq(rows.map(r => r.stadium_id)).length !== rows.length) errors.push("duplicate_stadium_id_in_final_rows");
  if (uniq(rows.map(r => r.team_id)).length !== rows.length) errors.push("duplicate_team_id_in_final_rows");
  if (uniq(rows.map(r => r.mlb_venue_id)).length !== rows.length) errors.push("duplicate_or_missing_mlb_venue_id_in_final_rows");

  const required = ["run_factor", "hr_factor", "lhb_run_factor", "rhb_run_factor", "lhb_hr_factor", "rhb_hr_factor"];
  const allFactors = [];
  for (const row of rows) {
    if (!row.stadium_id) errors.push(`missing_stadium_id_${row.park_name}`);
    if (!row.team_id) errors.push(`missing_team_id_${row.park_name}`);
    if (!row.park_name) errors.push(`missing_park_name_${row.stadium_id}`);
    if (!row.source_key || !row.source_name || !row.source_confidence || !row.factor_scale) errors.push(`missing_source_metadata_${row.park_name}`);
    for (const key of required) {
      const v = num(row[key]);
      allFactors.push(v);
      if (v === null) errors.push(`missing_or_non_numeric_${key}_${row.park_name}`);
      if (v !== null && (v < FACTOR_MIN || v > FACTOR_MAX)) errors.push(`factor_outside_hard_range_${key}_${row.park_name}_${v}`);
      if (v !== null && (v < 50 || v > 150)) warnings.push(`factor_outside_soft_50_150_range_${key}_${row.park_name}_${v}`);
    }
  }

  const numeric = allFactors.filter(v => v !== null);
  if (numeric.length === rows.length * required.length && numeric.every(v => v === 100)) errors.push("all_factors_are_neutral_100_rejected");
  return { ok: errors.length === 0, errors, warnings };
}

async function writeRows(env, rows) {
  await run(env.REF_DB, "UPDATE ref_park_factors SET active=0, updated_at=CURRENT_TIMESTAMP WHERE season_year=? AND source_key LIKE 'baseball_savant_statcast_park_factors_2025%'", SEASON_YEAR);
  let written = 0;
  for (const r of rows) {
    await run(env.REF_DB, `INSERT OR REPLACE INTO ref_park_factors (
      park_factor_id, stadium_id, mlb_venue_id, team_id, park_name, season_year,
      run_factor, hr_factor, lhb_run_factor, rhb_run_factor, lhb_hr_factor, rhb_hr_factor,
      factor_scale, source_key, source_name, source_confidence, active, raw_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, COALESCE((SELECT created_at FROM ref_park_factors WHERE park_factor_id=?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)`,
      r.park_factor_id, r.stadium_id, r.mlb_venue_id, r.team_id, r.park_name, r.season_year,
      r.run_factor, r.hr_factor, r.lhb_run_factor, r.rhb_run_factor, r.lhb_hr_factor, r.rhb_hr_factor,
      r.factor_scale, r.source_key, r.source_name, r.source_confidence, r.raw_json, r.park_factor_id
    );
    written++;
  }
  return written;
}

async function runStaticParkFactors(env, input = {}) {
  const started = Date.now();
  await ensureSchema(env);

  const activeStadiums = await readActiveStadiums(env);
  if (activeStadiums.length !== 30) {
    return base(env, {
      ok: false,
      data_ok: false,
      status: "blocked_active_stadiums_not_30",
      certification: "STATIC_PARK_FACTORS_BLOCKED_ACTIVE_STADIUMS_NOT_30",
      active_stadium_count: activeStadiums.length,
      rows_read: activeStadiums.length,
      rows_written: 0,
      external_calls_performed: 0
    });
  }

  const fetches = [];
  const primaryBoth = await fetchSavant({ batSide: "", rolling: PRIMARY_ROLLING }); fetches.push({ label: "primary_both", ...primaryBoth, rows: undefined });
  const primaryL = await fetchSavant({ batSide: "L", rolling: PRIMARY_ROLLING }); fetches.push({ label: "primary_lhb", ...primaryL, rows: undefined });
  const primaryR = await fetchSavant({ batSide: "R", rolling: PRIMARY_ROLLING }); fetches.push({ label: "primary_rhb", ...primaryR, rows: undefined });

  const primaryMaps = {
    bothByVenue: indexByVenue(primaryBoth.rows),
    lByVenue: indexByVenue(primaryL.rows),
    rByVenue: indexByVenue(primaryR.rows),
    bothByTeam: indexByTeamAlt(primaryBoth.rows),
    lByTeam: indexByTeamAlt(primaryL.rows),
    rByTeam: indexByTeamAlt(primaryR.rows)
  };

  let fallbackMaps = null;
  let fallbackFetches = [];
  function primaryCompleteFor(stadium) {
    return Boolean(getCompleteRows(primaryMaps, stadium));
  }

  const needsFallback = activeStadiums.filter(s => !primaryCompleteFor(s));
  if (needsFallback.length > 0 || primaryBoth.rows.length !== 30 || primaryL.rows.length !== 30 || primaryR.rows.length !== 30) {
    const fbBoth = await fetchSavant({ batSide: "", rolling: FALLBACK_ROLLING }); fallbackFetches.push({ label: "fallback_both", ...fbBoth, rows: undefined });
    const fbL = await fetchSavant({ batSide: "L", rolling: FALLBACK_ROLLING }); fallbackFetches.push({ label: "fallback_lhb", ...fbL, rows: undefined });
    const fbR = await fetchSavant({ batSide: "R", rolling: FALLBACK_ROLLING }); fallbackFetches.push({ label: "fallback_rhb", ...fbR, rows: undefined });
    fallbackMaps = {
      bothByVenue: indexByVenue(fbBoth.rows),
      lByVenue: indexByVenue(fbL.rows),
      rByVenue: indexByVenue(fbR.rows),
      bothByTeam: indexByTeamAlt(fbBoth.rows),
      lByTeam: indexByTeamAlt(fbL.rows),
      rByTeam: indexByTeamAlt(fbR.rows)
    };
  }

  const finalRows = [];
  const missing = [];
  for (const stadium of activeStadiums) {
    let matched = getCompleteRows(primaryMaps, stadium);
    let rolling = PRIMARY_ROLLING;
    if (!matched) {
      matched = getCompleteRows(fallbackMaps, stadium);
      rolling = FALLBACK_ROLLING;
    }
    if (!matched) {
      missing.push({ stadium_id: stadium.stadium_id, park_name: stadium.stadium_name, team_id: stadium.team_id, team_abbreviation: stadium.abbreviation, mlb_venue_id: stadium.mlb_venue_id });
      continue;
    }
    finalRows.push(buildRow({
      stadium,
      overall: matched.overall,
      left: matched.left,
      right: matched.right,
      rolling,
      matchMode: matched.matchMode
    }));
  }

  const validation = validateRows(finalRows, activeStadiums);
  if (missing.length > 0 || !validation.ok) {
    return base(env, {
      ok: false,
      data_ok: false,
      status: "certification_failed_no_writes",
      certification: "STATIC_PARK_FACTORS_CERTIFICATION_FAILED_NO_WRITES",
      rows_read: activeStadiums.length + primaryBoth.rows.length + primaryL.rows.length + primaryR.rows.length + fallbackFetches.reduce((a, f) => a + (f.row_count || 0), 0),
      rows_written: 0,
      external_calls_performed: fetches.length + fallbackFetches.length,
      fetch_summary: fetches.concat(fallbackFetches).map(f => ({ label: f.label, url: f.url, http_status: f.http_status, row_count: f.row_count })),
      missing_mapped_stadiums: missing,
      validation,
      note: "No rows were written because sourced Baseball Savant data did not certify cleanly. No placeholders were used."
    });
  }

  const rowsWritten = await writeRows(env, finalRows);
  const activeAfter = await all(env.REF_DB, `SELECT
      COUNT(*) AS active_rows,
      COUNT(DISTINCT stadium_id) AS distinct_stadiums,
      COUNT(DISTINCT team_id) AS distinct_teams,
      COUNT(DISTINCT mlb_venue_id) AS distinct_venues,
      SUM(CASE WHEN run_factor IS NULL THEN 1 ELSE 0 END) AS missing_run_factor,
      SUM(CASE WHEN hr_factor IS NULL THEN 1 ELSE 0 END) AS missing_hr_factor,
      SUM(CASE WHEN lhb_run_factor IS NULL THEN 1 ELSE 0 END) AS missing_lhb_run_factor,
      SUM(CASE WHEN rhb_run_factor IS NULL THEN 1 ELSE 0 END) AS missing_rhb_run_factor,
      SUM(CASE WHEN lhb_hr_factor IS NULL THEN 1 ELSE 0 END) AS missing_lhb_hr_factor,
      SUM(CASE WHEN rhb_hr_factor IS NULL THEN 1 ELSE 0 END) AS missing_rhb_hr_factor
    FROM ref_park_factors
    WHERE season_year=? AND active=1 AND source_key LIKE 'baseball_savant_statcast_park_factors_2025%'`, SEASON_YEAR);

  const rollingSplit = finalRows.reduce((acc, r) => { acc[r.rolling_window] = (acc[r.rolling_window] || 0) + 1; return acc; }, {});
  const certified = rowsWritten === 30 && activeAfter[0] && Number(activeAfter[0].active_rows) === 30 && Number(activeAfter[0].distinct_stadiums) === 30 && Number(activeAfter[0].distinct_teams) === 30 && Number(activeAfter[0].distinct_venues) === 30;

  return base(env, {
    ok: certified,
    data_ok: certified,
    status: certified ? "completed" : "certification_failed_after_write",
    certification: certified ? "STATIC_PARK_FACTORS_SAVANT_2025_RUN_HR_LR_FACTORS_WRITTEN_30_ACTIVE_STADIUMS" : "STATIC_PARK_FACTORS_POST_WRITE_CERTIFICATION_FAILED",
    source_mode: "automated_baseball_savant_html_payload_regex",
    season_year: SEASON_YEAR,
    primary_rolling_window: "3_YEAR",
    fallback_policy: "Use rolling=1 only for active stadiums missing from rolling=3 payload; never use neutral placeholders.",
    rolling_split: rollingSplit,
    rows_read: activeStadiums.length + primaryBoth.rows.length + primaryL.rows.length + primaryR.rows.length + fallbackFetches.reduce((a, f) => a + (f.row_count || 0), 0),
    rows_written: rowsWritten,
    external_calls_performed: fetches.length + fallbackFetches.length,
    elapsed_ms: Date.now() - started,
    fetch_summary: fetches.concat(fallbackFetches).map(f => ({ label: f.label, url: f.url, http_status: f.http_status, row_count: f.row_count })),
    active_after: activeAfter[0] || null,
    validation,
    sample_written_rows: finalRows.slice(0, 5).map(r => ({ team_abbreviation: r.team_abbreviation, park_name: r.park_name, mlb_venue_id: r.mlb_venue_id, run_factor: r.run_factor, hr_factor: r.hr_factor, lhb_run_factor: r.lhb_run_factor, rhb_run_factor: r.rhb_run_factor, lhb_hr_factor: r.lhb_hr_factor, rhb_hr_factor: r.rhb_hr_factor, rolling_window: r.rolling_window, match_mode: r.match_mode, source_key: r.source_key }))
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return jsonResponse({ ok: true });

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return jsonResponse(base(env, {
        route: url.pathname,
        bindings_ok: allTrue(bindingPresence(env, REQUIRED_DB_BINDINGS)),
        vars_ok: allTrue(varPresence(env, EXPECTED_VARS))
      }));
    }

    if (request.method === "GET" && url.pathname === "/diagnostic") {
      let tableInfo = [];
      try { tableInfo = await all(env.REF_DB, "PRAGMA table_info(ref_park_factors)"); } catch (_) { tableInfo = []; }
      return jsonResponse(base(env, { route: "/diagnostic", ref_park_factors_columns: tableInfo }));
    }

    if (request.method === "POST" && (url.pathname === "/run" || url.pathname === "/tasks/run")) {
      try {
        const body = await readJsonSafe(request);
        const output = await runStaticParkFactors(env, body);
        return jsonResponse(output, output.ok ? 200 : 500);
      } catch (err) {
        return jsonResponse(base(env, {
          ok: false,
          data_ok: false,
          status: "exception",
          certification: "STATIC_PARK_FACTORS_EXCEPTION_NO_WRITES_AFTER_ERROR",
          error: String(err && err.message ? err.message : err),
          rows_written: 0
        }), 500);
      }
    }

    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, error: "not_found", path: url.pathname }, 404);
  }
};
