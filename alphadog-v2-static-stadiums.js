const WORKER_NAME = "alphadog-v2-static-stadiums";
const VERSION = "alphadog-v2-static-stadiums-v0.1.1-sql-variable-cap-fix";
const JOB_KEY = "static-stadiums";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "MLB_API_BASE_URL", "WORKER_SAFE_MODE", "DEBUG_MODE"];

const CONTROLLED_PARK_CONTEXT = {
  ARI: { city: "Phoenix", state: "AZ", timezone: "America/Phoenix", roof_type: "retractable", turf_type: "artificial", aliases: ["Chase Field", "The Bob"] },
  ATL: { city: "Atlanta", state: "GA", timezone: "America/New_York", roof_type: "outdoor", turf_type: "grass", aliases: ["Truist Park", "SunTrust Park"] },
  BAL: { city: "Baltimore", state: "MD", timezone: "America/New_York", roof_type: "outdoor", turf_type: "grass", aliases: ["Oriole Park at Camden Yards", "Camden Yards"] },
  BOS: { city: "Boston", state: "MA", timezone: "America/New_York", roof_type: "outdoor", turf_type: "grass", aliases: ["Fenway Park"] },
  CHC: { city: "Chicago", state: "IL", timezone: "America/Chicago", roof_type: "outdoor", turf_type: "grass", aliases: ["Wrigley Field"] },
  CWS: { city: "Chicago", state: "IL", timezone: "America/Chicago", roof_type: "outdoor", turf_type: "grass", aliases: ["Rate Field", "Guaranteed Rate Field", "U.S. Cellular Field", "Comiskey Park"] },
  CIN: { city: "Cincinnati", state: "OH", timezone: "America/New_York", roof_type: "outdoor", turf_type: "grass", aliases: ["Great American Ball Park", "GABP"] },
  CLE: { city: "Cleveland", state: "OH", timezone: "America/New_York", roof_type: "outdoor", turf_type: "grass", aliases: ["Progressive Field", "Jacobs Field"] },
  COL: { city: "Denver", state: "CO", timezone: "America/Denver", roof_type: "outdoor", turf_type: "grass", aliases: ["Coors Field"] },
  DET: { city: "Detroit", state: "MI", timezone: "America/Detroit", roof_type: "outdoor", turf_type: "grass", aliases: ["Comerica Park"] },
  HOU: { city: "Houston", state: "TX", timezone: "America/Chicago", roof_type: "retractable", turf_type: "grass", aliases: ["Daikin Park", "Minute Maid Park", "The Juice Box"] },
  KC: { city: "Kansas City", state: "MO", timezone: "America/Chicago", roof_type: "outdoor", turf_type: "grass", aliases: ["Kauffman Stadium", "The K"] },
  LAA: { city: "Anaheim", state: "CA", timezone: "America/Los_Angeles", roof_type: "outdoor", turf_type: "grass", aliases: ["Angel Stadium", "Angel Stadium of Anaheim", "The Big A"] },
  LAD: { city: "Los Angeles", state: "CA", timezone: "America/Los_Angeles", roof_type: "outdoor", turf_type: "grass", aliases: ["Dodger Stadium"] },
  MIA: { city: "Miami", state: "FL", timezone: "America/New_York", roof_type: "retractable", turf_type: "artificial", aliases: ["loanDepot park", "Marlins Park"] },
  MIL: { city: "Milwaukee", state: "WI", timezone: "America/Chicago", roof_type: "retractable", turf_type: "grass", aliases: ["American Family Field", "Miller Park"] },
  MIN: { city: "Minneapolis", state: "MN", timezone: "America/Chicago", roof_type: "outdoor", turf_type: "grass", aliases: ["Target Field"] },
  NYM: { city: "New York", state: "NY", timezone: "America/New_York", roof_type: "outdoor", turf_type: "grass", aliases: ["Citi Field"] },
  NYY: { city: "Bronx", state: "NY", timezone: "America/New_York", roof_type: "outdoor", turf_type: "grass", aliases: ["Yankee Stadium"] },
  ATH: { city: "West Sacramento", state: "CA", timezone: "America/Los_Angeles", roof_type: "outdoor", turf_type: "grass", aliases: ["Sutter Health Park", "Oakland Coliseum", "O.co Coliseum", "RingCentral Coliseum", "Sacramento Athletics", "Athletics"] },
  PHI: { city: "Philadelphia", state: "PA", timezone: "America/New_York", roof_type: "outdoor", turf_type: "grass", aliases: ["Citizens Bank Park", "CBP"] },
  PIT: { city: "Pittsburgh", state: "PA", timezone: "America/New_York", roof_type: "outdoor", turf_type: "grass", aliases: ["PNC Park"] },
  SD: { city: "San Diego", state: "CA", timezone: "America/Los_Angeles", roof_type: "outdoor", turf_type: "grass", aliases: ["Petco Park", "PETCO Park"] },
  SF: { city: "San Francisco", state: "CA", timezone: "America/Los_Angeles", roof_type: "outdoor", turf_type: "grass", aliases: ["Oracle Park", "AT&T Park", "SBC Park", "Pacific Bell Park"] },
  SEA: { city: "Seattle", state: "WA", timezone: "America/Los_Angeles", roof_type: "retractable", turf_type: "grass", aliases: ["T-Mobile Park", "Safeco Field"] },
  STL: { city: "St. Louis", state: "MO", timezone: "America/Chicago", roof_type: "outdoor", turf_type: "grass", aliases: ["Busch Stadium"] },
  TB: { city: "Tampa", state: "FL", timezone: "America/New_York", roof_type: "outdoor", turf_type: "grass", aliases: ["George M. Steinbrenner Field", "Steinbrenner Field", "Tropicana Field", "The Trop"] },
  TEX: { city: "Arlington", state: "TX", timezone: "America/Chicago", roof_type: "retractable", turf_type: "artificial", aliases: ["Globe Life Field"] },
  TOR: { city: "Toronto", state: "ON", timezone: "America/Toronto", roof_type: "retractable", turf_type: "artificial", aliases: ["Rogers Centre", "SkyDome", "Skydome"] },
  WSH: { city: "Washington", state: "DC", timezone: "America/New_York", roof_type: "outdoor", turf_type: "grass", aliases: ["Nationals Park", "Nats Park"] }
};

const STATIC_FALLBACK_STADIUMS = [
  ["ARI", 109, 15, "Chase Field"], ["ATL", 144, 4705, "Truist Park"], ["BAL", 110, 2, "Oriole Park at Camden Yards"], ["BOS", 111, 3, "Fenway Park"], ["CHC", 112, 17, "Wrigley Field"],
  ["CWS", 145, 4, "Rate Field"], ["CIN", 113, 2602, "Great American Ball Park"], ["CLE", 114, 5, "Progressive Field"], ["COL", 115, 19, "Coors Field"], ["DET", 116, 2394, "Comerica Park"],
  ["HOU", 117, 2392, "Daikin Park"], ["KC", 118, 7, "Kauffman Stadium"], ["LAA", 108, 1, "Angel Stadium"], ["LAD", 119, 22, "Dodger Stadium"], ["MIA", 146, 4169, "loanDepot park"],
  ["MIL", 158, 32, "American Family Field"], ["MIN", 142, 3312, "Target Field"], ["NYM", 121, 3289, "Citi Field"], ["NYY", 147, 3313, "Yankee Stadium"], ["ATH", 133, null, "Sutter Health Park"],
  ["PHI", 143, 2681, "Citizens Bank Park"], ["PIT", 134, 31, "PNC Park"], ["SD", 135, 2680, "Petco Park"], ["SF", 137, 2395, "Oracle Park"], ["SEA", 136, 680, "T-Mobile Park"],
  ["STL", 138, 2889, "Busch Stadium"], ["TB", 139, null, "George M. Steinbrenner Field"], ["TEX", 140, 5325, "Globe Life Field"], ["TOR", 141, 14, "Rogers Centre"], ["WSH", 120, 3309, "Nationals Park"]
];

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
function numberOrNull(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }

function normalizeAlias(value) {
  return String(value || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function stableKey(...parts) {
  return parts.map(p => normalizeAlias(p)).filter(Boolean).join("|").slice(0, 240);
}

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

async function ensureSchema(env) {
  await run(env.REF_DB, `CREATE TABLE IF NOT EXISTS ref_stadiums (
    stadium_id TEXT PRIMARY KEY,
    team_id TEXT,
    stadium_name TEXT,
    city TEXT,
    state TEXT,
    latitude REAL,
    longitude REAL,
    roof_type TEXT,
    turf_type TEXT,
    park_json TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  const columns = await all(env.REF_DB, "PRAGMA table_info(ref_stadiums)");
  const have = new Set(columns.map(c => String(c.name || "")));
  const additions = [
    ["mlb_venue_id", "INTEGER"],
    ["timezone", "TEXT"],
    ["active", "INTEGER DEFAULT 1"],
    ["source_key", "TEXT"],
    ["raw_json", "TEXT"]
  ];
  const applied = [];
  for (const [name, type] of additions) {
    if (!have.has(name)) {
      await run(env.REF_DB, `ALTER TABLE ref_stadiums ADD COLUMN ${name} ${type}`);
      applied.push(name);
    }
  }

  await run(env.REF_DB, `CREATE TABLE IF NOT EXISTS ref_stadium_aliases (
    alias_key TEXT PRIMARY KEY,
    stadium_id TEXT,
    mlb_venue_id INTEGER,
    alias_value TEXT,
    alias_normalized TEXT,
    alias_type TEXT,
    source_key TEXT,
    confidence TEXT,
    active INTEGER DEFAULT 1,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_ref_stadiums_mlb_venue ON ref_stadiums(mlb_venue_id)");
  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_ref_stadiums_team ON ref_stadiums(team_id, active)");
  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_ref_stadium_aliases_lookup ON ref_stadium_aliases(alias_normalized, active)");
  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_ref_stadium_aliases_stadium ON ref_stadium_aliases(stadium_id, active)");

  return { ref_stadiums_columns_added: applied, ref_stadium_aliases_ready: true };
}

function extractVenueLocation(venue, team, controlled) {
  const loc = (venue && venue.location) || {};
  const coords = loc.defaultCoordinates || venue?.defaultCoordinates || {};
  const tz = loc.timeZone || venue?.timeZone || team?.timeZone || {};
  return {
    city: text(loc.city || venue?.city || controlled.city || team?.locationName),
    state: text(loc.stateAbbrev || loc.state || loc.province || controlled.state),
    latitude: numberOrNull(coords.latitude || coords.lat),
    longitude: numberOrNull(coords.longitude || coords.lng || coords.lon),
    timezone: text(tz.id || tz.name || controlled.timezone)
  };
}

function surfaceFromVenue(venue) {
  return text(venue?.fieldInfo?.turfType || venue?.fieldInfo?.surface || venue?.surface || venue?.turfType);
}

function roofFromVenue(venue) {
  return text(venue?.fieldInfo?.roofType || venue?.roofType || venue?.roof);
}

function fromMlbTeam(t, hydratedVenueById = {}) {
  const abbreviation = text(t.abbreviation).toUpperCase();
  const controlled = CONTROLLED_PARK_CONTEXT[abbreviation] || {};
  const mlbTeamId = Number(t.id);
  const teamId = `mlb_${mlbTeamId}`;
  const venueBase = t.venue || {};
  const venueId = numberOrNull(venueBase.id);
  const hydrated = venueId && hydratedVenueById[String(venueId)] ? hydratedVenueById[String(venueId)] : {};
  const venue = { ...venueBase, ...hydrated, location: hydrated.location || venueBase.location, fieldInfo: hydrated.fieldInfo || venueBase.fieldInfo };
  const loc = extractVenueLocation(venue, t, controlled);
  const stadiumName = text(venue.name || controlled.aliases?.[0] || `${text(t.name)} home venue`);
  const stadiumId = venueId ? `mlb_venue_${venueId}_team_${mlbTeamId}` : `mlb_team_${mlbTeamId}_venue_${stableKey(stadiumName)}`;
  return {
    stadium_id: stadiumId,
    team_id: teamId,
    mlb_team_id: mlbTeamId,
    abbreviation,
    team_name: text(t.name),
    stadium_name: stadiumName,
    mlb_venue_id: venueId,
    city: loc.city,
    state: loc.state,
    latitude: loc.latitude,
    longitude: loc.longitude,
    timezone: loc.timezone || controlled.timezone || "",
    roof_type: text(roofFromVenue(venue) || controlled.roof_type || "unknown").toLowerCase(),
    turf_type: text(surfaceFromVenue(venue) || controlled.turf_type || "unknown").toLowerCase(),
    source_team_raw: t,
    source_venue_raw: venue,
    controlled_context: controlled,
    source_kind: "MLB_STATSAPI"
  };
}

async function fetchJson(url, env) {
  const headers = { accept: "application/json" };
  if (env.MLB_API_USER_AGENT) headers["user-agent"] = String(env.MLB_API_USER_AGENT);
  const resp = await fetch(url, { method: "GET", headers });
  const textBody = await resp.text();
  if (!resp.ok) throw new Error(`http_${resp.status}:${textBody.slice(0, 240)}`);
  try { return { http_status: resp.status, body: JSON.parse(textBody) }; }
  catch (_) { throw new Error("non_json_response"); }
}

async function fetchMlbStadiums(env) {
  const base = String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com/api/v1").replace(/\/+$/, "");
  const teamsUrl = `${base}/teams?sportId=1&activeStatus=Y&hydrate=venue(location)`;
  const teamsResp = await fetchJson(teamsUrl, env);
  const rawTeams = Array.isArray(teamsResp.body.teams) ? teamsResp.body.teams : [];

  const venueIds = Array.from(new Set(rawTeams.map(t => t && t.venue && t.venue.id).filter(Boolean).map(String)));
  let venueUrl = null;
  let venueResp = null;
  let venueById = {};
  if (venueIds.length) {
    try {
      venueUrl = `${base}/venues?venueIds=${encodeURIComponent(venueIds.join(","))}&hydrate=location`;
      venueResp = await fetchJson(venueUrl, env);
      const venues = Array.isArray(venueResp.body.venues) ? venueResp.body.venues : [];
      for (const v of venues) if (v && v.id) venueById[String(v.id)] = v;
    } catch (err) {
      venueResp = { error: String(err && err.message ? err.message : err) };
    }
  }

  const stadiums = rawTeams.map(t => fromMlbTeam(t, venueById)).filter(s => s.mlb_team_id && s.abbreviation && s.stadium_name);
  return {
    source_key: "MLB_STATSAPI_TEAMS_AND_VENUES",
    external_calls: venueUrl ? 2 : 1,
    teams_url: teamsUrl,
    teams_http_status: teamsResp.http_status,
    raw_team_count: rawTeams.length,
    venue_url: venueUrl,
    venue_http_status: venueResp && venueResp.http_status ? venueResp.http_status : null,
    venue_fetch_error: venueResp && venueResp.error ? venueResp.error : null,
    venue_count: Object.keys(venueById).length,
    stadiums
  };
}

function fallbackStadiums() {
  return STATIC_FALLBACK_STADIUMS.map(([abbr, mlbTeamId, venueId, name]) => {
    const controlled = CONTROLLED_PARK_CONTEXT[abbr] || {};
    return {
      stadium_id: venueId ? `mlb_venue_${venueId}_team_${mlbTeamId}` : `fallback_team_${mlbTeamId}_venue_${stableKey(name)}`,
      team_id: `mlb_${mlbTeamId}`,
      mlb_team_id: mlbTeamId,
      abbreviation: abbr,
      team_name: abbr,
      stadium_name: name,
      mlb_venue_id: venueId,
      city: controlled.city || "",
      state: controlled.state || "",
      latitude: null,
      longitude: null,
      timezone: controlled.timezone || "",
      roof_type: controlled.roof_type || "unknown",
      turf_type: controlled.turf_type || "unknown",
      source_team_raw: null,
      source_venue_raw: null,
      controlled_context: controlled,
      source_kind: "CONTROLLED_STATIC_FALLBACK_NON_CERTIFYING"
    };
  });
}

function buildAliases(stadium, sourceKey) {
  const values = [
    ["stadium_name", stadium.stadium_name],
    ["stadium_id", stadium.stadium_id],
    ["mlb_venue_id", stadium.mlb_venue_id ? String(stadium.mlb_venue_id) : ""],
    ["team_abbreviation", stadium.abbreviation],
    ["team_id", stadium.team_id],
    ["home_team", stadium.team_name],
    ["city_stadium", `${stadium.city} ${stadium.stadium_name}`]
  ];

  const controlledAliases = (stadium.controlled_context && Array.isArray(stadium.controlled_context.aliases)) ? stadium.controlled_context.aliases : [];
  for (const alias of controlledAliases) values.push(["controlled_alias", alias]);

  const seen = new Set();
  const aliases = [];
  for (const [type, value] of values) {
    const cleaned = text(value);
    const normalized = normalizeAlias(cleaned);
    if (!cleaned || !normalized || seen.has(`${type}|${normalized}`)) continue;
    seen.add(`${type}|${normalized}`);
    aliases.push({
      alias_key: stableKey(stadium.stadium_id, type, cleaned),
      stadium_id: stadium.stadium_id,
      mlb_venue_id: stadium.mlb_venue_id,
      alias_value: cleaned,
      alias_normalized: normalized,
      alias_type: type,
      source_key: sourceKey,
      confidence: type === "controlled_alias" ? "CONTROLLED_ALIAS" : "CANONICAL"
    });
  }
  return aliases;
}

async function upsertStadiums(env, stadiums, sourceKey) {
  let stadiumRowsWritten = 0;
  let aliasesWritten = 0;

  // D1/SQLite has a bounded SQL variable limit. The v0.1.0 worker tried to
  // deactivate stale aliases with one giant NOT IN (?, ?, ...), which can exceed
  // the variable cap once stadium aliases are expanded. The safe static refresh
  // pattern is: mark this worker source inactive first, then upsert the current
  // canonical 30-team set back to active=1. This is additive/safe for REF_DB and
  // does not touch TEAM_DB, PrizePicks, scoring, or final board tables.
  await run(env.REF_DB, "UPDATE ref_stadiums SET active=0, updated_at=CURRENT_TIMESTAMP WHERE source_key IN ('MLB_STATSAPI_TEAMS_AND_VENUES','CONTROLLED_STATIC_FALLBACK_NON_CERTIFYING')");
  await run(env.REF_DB, "UPDATE ref_stadium_aliases SET active=0, updated_at=CURRENT_TIMESTAMP WHERE source_key IN ('MLB_STATSAPI_TEAMS_AND_VENUES','CONTROLLED_STATIC_FALLBACK_NON_CERTIFYING')");

  for (const stadium of stadiums) {
    const parkJson = {
      abbreviation: stadium.abbreviation,
      mlb_team_id: stadium.mlb_team_id,
      team_name: stadium.team_name,
      source_kind: stadium.source_kind,
      roof_type: stadium.roof_type,
      turf_type: stadium.turf_type,
      timezone: stadium.timezone,
      source_key: sourceKey
    };
    const rawJson = {
      source_team_raw: stadium.source_team_raw,
      source_venue_raw: stadium.source_venue_raw,
      controlled_context: stadium.controlled_context
    };

    await run(env.REF_DB, `INSERT INTO ref_stadiums (
      stadium_id, team_id, stadium_name, city, state, latitude, longitude, roof_type, turf_type, park_json, mlb_venue_id, timezone, active, source_key, raw_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(stadium_id) DO UPDATE SET
      team_id=excluded.team_id,
      stadium_name=excluded.stadium_name,
      city=excluded.city,
      state=excluded.state,
      latitude=excluded.latitude,
      longitude=excluded.longitude,
      roof_type=excluded.roof_type,
      turf_type=excluded.turf_type,
      park_json=excluded.park_json,
      mlb_venue_id=excluded.mlb_venue_id,
      timezone=excluded.timezone,
      active=1,
      source_key=excluded.source_key,
      raw_json=excluded.raw_json,
      updated_at=CURRENT_TIMESTAMP`,
      stadium.stadium_id,
      stadium.team_id,
      stadium.stadium_name,
      stadium.city,
      stadium.state,
      stadium.latitude,
      stadium.longitude,
      stadium.roof_type,
      stadium.turf_type,
      JSON.stringify(parkJson).slice(0, 3000),
      stadium.mlb_venue_id,
      stadium.timezone,
      sourceKey,
      JSON.stringify(rawJson).slice(0, 7000)
    );
    stadiumRowsWritten += 1;

    for (const alias of buildAliases(stadium, sourceKey)) {
      await run(env.REF_DB, `INSERT INTO ref_stadium_aliases (
        alias_key, stadium_id, mlb_venue_id, alias_value, alias_normalized, alias_type, source_key, confidence, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(alias_key) DO UPDATE SET
        stadium_id=excluded.stadium_id,
        mlb_venue_id=excluded.mlb_venue_id,
        alias_value=excluded.alias_value,
        alias_normalized=excluded.alias_normalized,
        alias_type=excluded.alias_type,
        source_key=excluded.source_key,
        confidence=excluded.confidence,
        active=1,
        updated_at=CURRENT_TIMESTAMP`,
        alias.alias_key,
        alias.stadium_id,
        alias.mlb_venue_id,
        alias.alias_value,
        alias.alias_normalized,
        alias.alias_type,
        alias.source_key,
        alias.confidence
      );
      aliasesWritten += 1;
    }
  }

  return { stadium_rows_written: stadiumRowsWritten, alias_rows_written: aliasesWritten, stale_deactivation_mode: "deactivate_source_then_reactivate_current_rows" };
}

async function counts(env) {
  const activeRows = await all(env.REF_DB, "SELECT COUNT(*) AS c FROM ref_stadiums WHERE active=1");
  const activeTeams = await all(env.REF_DB, "SELECT COUNT(DISTINCT team_id) AS c FROM ref_stadiums WHERE active=1 AND team_id IS NOT NULL AND team_id <> ''");
  const activeVenueIds = await all(env.REF_DB, "SELECT COUNT(*) AS c FROM ref_stadiums WHERE active=1 AND mlb_venue_id IS NOT NULL");
  const aliases = await all(env.REF_DB, "SELECT COUNT(*) AS c FROM ref_stadium_aliases WHERE active=1");
  const sample = await all(env.REF_DB, "SELECT team_id, mlb_venue_id, stadium_name, city, state, timezone, roof_type, turf_type, active FROM ref_stadiums WHERE active=1 ORDER BY team_id LIMIT 30");
  return {
    ref_stadiums_active_rows: Number(activeRows[0] && activeRows[0].c ? activeRows[0].c : 0),
    active_mlb_team_stadium_mappings: Number(activeTeams[0] && activeTeams[0].c ? activeTeams[0].c : 0),
    active_rows_with_mlb_venue_id: Number(activeVenueIds[0] && activeVenueIds[0].c ? activeVenueIds[0].c : 0),
    ref_stadium_aliases_active_rows: Number(aliases[0] && aliases[0].c ? aliases[0].c : 0),
    sample_rows: sample
  };
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
    status: "STATIC_STADIUM_DICTIONARY_READY",
    timestamp_utc: nowUtc(),
    scope_lock: {
      writes_only: ["REF_DB.ref_stadiums", "REF_DB.ref_stadium_aliases"],
      no_team_db_writes: true,
      no_prizepicks_board_mutation: true,
      no_opponent_backfill: true,
      no_scoring: true,
      no_final_board: true,
      no_sleeper_work: true,
      no_scheduling: true
    },
    binding_summary: {
      required_db_bindings_present: allTrue(db),
      expected_vars_present: allTrue(vars)
    }
  };
}

async function runStaticStadiums(input, env) {
  const started = Date.now();
  const schema = await ensureSchema(env);
  let fetchInfo = null;
  let sourceKey = "MLB_STATSAPI_TEAMS_AND_VENUES";
  let stadiums = [];
  let fetchError = null;
  let fallbackUsed = false;

  try {
    fetchInfo = await fetchMlbStadiums(env);
    stadiums = fetchInfo.stadiums;
  } catch (err) {
    fetchError = String(err && err.message ? err.message : err);
  }

  if (stadiums.length !== 30) {
    sourceKey = "CONTROLLED_STATIC_FALLBACK_NON_CERTIFYING";
    fallbackUsed = true;
    stadiums = fallbackStadiums();
  }

  stadiums = stadiums.slice().sort((a, b) => String(a.abbreviation).localeCompare(String(b.abbreviation)));
  const writes = await upsertStadiums(env, stadiums, sourceKey);
  const finalCounts = await counts(env);

  const apiSource = sourceKey === "MLB_STATSAPI_TEAMS_AND_VENUES";
  const certified = apiSource &&
    finalCounts.active_mlb_team_stadium_mappings === 30 &&
    finalCounts.active_rows_with_mlb_venue_id >= 30 &&
    finalCounts.ref_stadium_aliases_active_rows >= 90;

  return {
    ok: certified,
    data_ok: certified,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: input.job_key || JOB_KEY,
    request_id: input.request_id || null,
    chain_id: input.chain_id || null,
    status: certified ? "completed_static_stadium_dictionary_seed" : "failed_static_stadium_dictionary_certification",
    certification: certified ? "STATIC_STADIUM_DICTIONARY_SEEDED_30_ACTIVE_TEAM_STADIUMS_ALIASES_WRITTEN" : "STATIC_STADIUM_DICTIONARY_CERTIFICATION_FAILED",
    rows_read: stadiums.length,
    rows_written: writes.stadium_rows_written + writes.alias_rows_written,
    stadiums_written: writes.stadium_rows_written,
    aliases_written: writes.alias_rows_written,
    stale_deactivation_mode: writes.stale_deactivation_mode,
    external_calls_performed: fetchInfo ? fetchInfo.external_calls : 0,
    elapsed_ms: Date.now() - started,
    source_key: sourceKey,
    fallback_used: fallbackUsed,
    source_fetch: fetchInfo ? {
      teams_url: fetchInfo.teams_url,
      teams_http_status: fetchInfo.teams_http_status,
      raw_team_count: fetchInfo.raw_team_count,
      venue_url: fetchInfo.venue_url,
      venue_http_status: fetchInfo.venue_http_status,
      venue_fetch_error: fetchInfo.venue_fetch_error,
      venue_count: fetchInfo.venue_count,
      parsed_stadium_count: fetchInfo.stadiums.length
    } : null,
    source_fetch_error: fetchError,
    schema_patch: schema,
    final_counts: finalCounts,
    output_cap: { sample_rows_limit: 30, raw_json_per_stadium_cap_chars: 7000 },
    scope_lock: baseIdentity(env).scope_lock,
    downstream_block_reason: certified ? null : "Static stadium dictionary must certify 30 active MLB team/stadium mappings from MLB StatsAPI before downstream park/weather/scoring context can depend on it.",
    next_allowed_use: "Future workers may use REF_DB.ref_stadiums and REF_DB.ref_stadium_aliases for park, roof, weather, and game/stadium mapping. This worker does not backfill PrizePicks opponents or score candidates.",
    timestamp_utc: nowUtc()
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));

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
        diagnostics: {
          ref_db_bound: !!env.REF_DB,
          mlb_api_base_url_present: !!env.MLB_API_BASE_URL,
          worker_safe_mode: env.WORKER_SAFE_MODE || null
        }
      });
    }

    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        return jsonResponse(await runStaticStadiums(input, env));
      } catch (err) {
        return jsonResponse({
          ok: false,
          data_ok: false,
          version: VERSION,
          worker_name: WORKER_NAME,
          job_key: input.job_key || JOB_KEY,
          request_id: input.request_id || null,
          chain_id: input.chain_id || null,
          status: "static_stadium_dictionary_exception",
          certification: "STATIC_STADIUM_DICTIONARY_EXCEPTION",
          error: String(err && err.message ? err.message : err),
          rows_read: 0,
          rows_written: 0,
          external_calls_performed: 0,
          scope_lock: baseIdentity(env).scope_lock,
          timestamp_utc: nowUtc()
        }, 500);
      }
    }

    return jsonResponse({
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      status: "NOT_FOUND",
      allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"],
      timestamp_utc: nowUtc()
    }, 404);
  }
};
