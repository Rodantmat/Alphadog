import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-static-teams";
const VERSION = "alphadog-v2-static-teams-v0.2.0-postgres-cutover";
const JOB_KEY = "static-teams";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "MLB_API_BASE_URL", "WORKER_SAFE_MODE", "DEBUG_MODE"];

const STATIC_FALLBACK_TEAMS = [
  { id: 109, abbreviation: "ARI", teamCode: "ari", fileCode: "ari", name: "Arizona Diamondbacks", teamName: "Diamondbacks", shortName: "Arizona", locationName: "Arizona", league: "National League", division: "National League West" },
  { id: 144, abbreviation: "ATL", teamCode: "atl", fileCode: "atl", name: "Atlanta Braves", teamName: "Braves", shortName: "Atlanta", locationName: "Atlanta", league: "National League", division: "National League East" },
  { id: 110, abbreviation: "BAL", teamCode: "bal", fileCode: "bal", name: "Baltimore Orioles", teamName: "Orioles", shortName: "Baltimore", locationName: "Baltimore", league: "American League", division: "American League East" },
  { id: 111, abbreviation: "BOS", teamCode: "bos", fileCode: "bos", name: "Boston Red Sox", teamName: "Red Sox", shortName: "Boston", locationName: "Boston", league: "American League", division: "American League East" },
  { id: 112, abbreviation: "CHC", teamCode: "chn", fileCode: "chc", name: "Chicago Cubs", teamName: "Cubs", shortName: "Chi Cubs", locationName: "Chicago", league: "National League", division: "National League Central" },
  { id: 145, abbreviation: "CWS", teamCode: "cha", fileCode: "cws", name: "Chicago White Sox", teamName: "White Sox", shortName: "Chi White Sox", locationName: "Chicago", league: "American League", division: "American League Central" },
  { id: 113, abbreviation: "CIN", teamCode: "cin", fileCode: "cin", name: "Cincinnati Reds", teamName: "Reds", shortName: "Cincinnati", locationName: "Cincinnati", league: "National League", division: "National League Central" },
  { id: 114, abbreviation: "CLE", teamCode: "cle", fileCode: "cle", name: "Cleveland Guardians", teamName: "Guardians", shortName: "Cleveland", locationName: "Cleveland", league: "American League", division: "American League Central" },
  { id: 115, abbreviation: "COL", teamCode: "col", fileCode: "col", name: "Colorado Rockies", teamName: "Rockies", shortName: "Colorado", locationName: "Colorado", league: "National League", division: "National League West" },
  { id: 116, abbreviation: "DET", teamCode: "det", fileCode: "det", name: "Detroit Tigers", teamName: "Tigers", shortName: "Detroit", locationName: "Detroit", league: "American League", division: "American League Central" },
  { id: 117, abbreviation: "HOU", teamCode: "hou", fileCode: "hou", name: "Houston Astros", teamName: "Astros", shortName: "Houston", locationName: "Houston", league: "American League", division: "American League West" },
  { id: 118, abbreviation: "KC", teamCode: "kca", fileCode: "kc", name: "Kansas City Royals", teamName: "Royals", shortName: "Kansas City", locationName: "Kansas City", league: "American League", division: "American League Central" },
  { id: 108, abbreviation: "LAA", teamCode: "ana", fileCode: "ana", name: "Los Angeles Angels", teamName: "Angels", shortName: "LA Angels", locationName: "Anaheim", league: "American League", division: "American League West" },
  { id: 119, abbreviation: "LAD", teamCode: "lan", fileCode: "la", name: "Los Angeles Dodgers", teamName: "Dodgers", shortName: "LA Dodgers", locationName: "Los Angeles", league: "National League", division: "National League West" },
  { id: 146, abbreviation: "MIA", teamCode: "mia", fileCode: "mia", name: "Miami Marlins", teamName: "Marlins", shortName: "Miami", locationName: "Miami", league: "National League", division: "National League East" },
  { id: 158, abbreviation: "MIL", teamCode: "mil", fileCode: "mil", name: "Milwaukee Brewers", teamName: "Brewers", shortName: "Milwaukee", locationName: "Milwaukee", league: "National League", division: "National League Central" },
  { id: 142, abbreviation: "MIN", teamCode: "min", fileCode: "min", name: "Minnesota Twins", teamName: "Twins", shortName: "Minnesota", locationName: "Minnesota", league: "American League", division: "American League Central" },
  { id: 121, abbreviation: "NYM", teamCode: "nyn", fileCode: "nym", name: "New York Mets", teamName: "Mets", shortName: "NY Mets", locationName: "New York", league: "National League", division: "National League East" },
  { id: 147, abbreviation: "NYY", teamCode: "nya", fileCode: "nyy", name: "New York Yankees", teamName: "Yankees", shortName: "NY Yankees", locationName: "New York", league: "American League", division: "American League East" },
  { id: 133, abbreviation: "ATH", teamCode: "ath", fileCode: "ath", name: "Athletics", teamName: "Athletics", shortName: "Athletics", locationName: "Sacramento", league: "American League", division: "American League West" },
  { id: 143, abbreviation: "PHI", teamCode: "phi", fileCode: "phi", name: "Philadelphia Phillies", teamName: "Phillies", shortName: "Philadelphia", locationName: "Philadelphia", league: "National League", division: "National League East" },
  { id: 134, abbreviation: "PIT", teamCode: "pit", fileCode: "pit", name: "Pittsburgh Pirates", teamName: "Pirates", shortName: "Pittsburgh", locationName: "Pittsburgh", league: "National League", division: "National League Central" },
  { id: 135, abbreviation: "SD", teamCode: "sdn", fileCode: "sd", name: "San Diego Padres", teamName: "Padres", shortName: "San Diego", locationName: "San Diego", league: "National League", division: "National League West" },
  { id: 137, abbreviation: "SF", teamCode: "sfn", fileCode: "sf", name: "San Francisco Giants", teamName: "Giants", shortName: "San Francisco", locationName: "San Francisco", league: "National League", division: "National League West" },
  { id: 136, abbreviation: "SEA", teamCode: "sea", fileCode: "sea", name: "Seattle Mariners", teamName: "Mariners", shortName: "Seattle", locationName: "Seattle", league: "American League", division: "American League West" },
  { id: 138, abbreviation: "STL", teamCode: "sln", fileCode: "stl", name: "St. Louis Cardinals", teamName: "Cardinals", shortName: "St. Louis", locationName: "St. Louis", league: "National League", division: "National League Central" },
  { id: 139, abbreviation: "TB", teamCode: "tba", fileCode: "tb", name: "Tampa Bay Rays", teamName: "Rays", shortName: "Tampa Bay", locationName: "Tampa Bay", league: "American League", division: "American League East" },
  { id: 140, abbreviation: "TEX", teamCode: "tex", fileCode: "tex", name: "Texas Rangers", teamName: "Rangers", shortName: "Texas", locationName: "Texas", league: "American League", division: "American League West" },
  { id: 141, abbreviation: "TOR", teamCode: "tor", fileCode: "tor", name: "Toronto Blue Jays", teamName: "Blue Jays", shortName: "Toronto", locationName: "Toronto", league: "American League", division: "American League East" },
  { id: 120, abbreviation: "WSH", teamCode: "was", fileCode: "was", name: "Washington Nationals", teamName: "Nationals", shortName: "Washington", locationName: "Washington", league: "National League", division: "National League East" }
];

const EXTRA_ALIASES = {
  ARI: ["D-backs", "Dbacks", "Diamondbacks"],
  BOS: ["Red Sox"],
  CHC: ["Cubs", "Chicago Cubs"],
  CWS: ["White Sox", "Chicago White Sox", "CHW"],
  KC: ["KCR", "Kansas City"],
  LAA: ["Angels", "LA Angels", "Los Angeles Angels", "ANA", "Anaheim Angels"],
  LAD: ["Dodgers", "LA Dodgers", "Los Angeles Dodgers", "LA"],
  MIA: ["Marlins", "Florida Marlins"],
  NYM: ["Mets", "NY Mets"],
  NYY: ["Yankees", "NY Yankees"],
  ATH: ["Athletics", "A's", "A\u2019s", "Oakland Athletics", "OAK", "Sacramento Athletics"],
  SD: ["Padres", "SDP"],
  SF: ["Giants", "SFG"],
  STL: ["Cardinals", "St Louis Cardinals", "St. Louis Cardinals"],
  TB: ["Rays", "Tampa Rays", "TBR"],
  TOR: ["Blue Jays", "Jays"],
  WSH: ["Nationals", "Washington Nats", "Nats", "WAS"]
};

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

function normalizeAlias(value) {
  return String(value || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function aliasKey(teamId, aliasType, aliasValue) {
  return `${teamId}|${aliasType}|${normalizeAlias(aliasValue)}`.slice(0, 240);
}

async function readJsonSafe(request) {
  try { return await request.json(); } catch { return {}; }
}

function pg(env) {
  return postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false });
}

// Postgres cutover: D1 (REF_DB.ref_teams / REF_DB.ref_team_aliases) is no longer written by
// this worker. All reads/writes now go to ref.teams / ref.team_aliases via Hyperdrive. D1
// remains readable elsewhere as a reference if ever needed, but this worker never writes it.
async function ensureSchema(env) {
  const sql = pg(env);
  const applied = [];
  const additions = ["nickname TEXT", "location_name TEXT", "short_name TEXT", "team_code TEXT", "file_code TEXT", "source_key TEXT"];
  for (const clause of additions) {
    const colName = clause.split(" ")[0];
    try {
      await sql.unsafe(`ALTER TABLE ref.teams ADD COLUMN IF NOT EXISTS ${clause}`);
      applied.push(colName);
    } catch (_) { /* column already present or table managed elsewhere - non-fatal */ }
  }
  await sql.end();
  return { ref_teams_columns_checked: applied, ref_team_aliases_ready: true };
}

function fromMlbTeam(t) {
  return {
    id: Number(t.id),
    abbreviation: String(t.abbreviation || "").trim().toUpperCase(),
    teamCode: String(t.teamCode || "").trim().toLowerCase(),
    fileCode: String(t.fileCode || "").trim().toLowerCase(),
    name: String(t.name || "").trim(),
    teamName: String(t.teamName || "").trim(),
    shortName: String(t.shortName || "").trim(),
    locationName: String(t.locationName || "").trim(),
    league: String((t.league && (t.league.name || t.league.abbreviation)) || "").trim(),
    division: String((t.division && (t.division.name || t.division.abbreviation)) || "").trim(),
    raw: t
  };
}

async function fetchMlbTeams(env) {
  const base = String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com/api/v1").replace(/\/+$/, "");
  const url = `${base}/teams?sportId=1&activeStatus=Y`;
  const headers = { accept: "application/json" };
  if (env.MLB_API_USER_AGENT) headers["user-agent"] = String(env.MLB_API_USER_AGENT);
  const resp = await fetch(url, { method: "GET", headers });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`mlb_api_http_${resp.status}:${text.slice(0, 200)}`);
  let body;
  try { body = JSON.parse(text); } catch (_) { throw new Error("mlb_api_non_json_response"); }
  const teams = Array.isArray(body.teams) ? body.teams.map(fromMlbTeam).filter(t => t.id && t.abbreviation && t.name) : [];
  return { url, http_status: resp.status, teams, raw_count: Array.isArray(body.teams) ? body.teams.length : 0 };
}

function fallbackTeams() {
  return STATIC_FALLBACK_TEAMS.map(t => fromMlbTeam({
    id: t.id,
    abbreviation: t.abbreviation,
    teamCode: t.teamCode,
    fileCode: t.fileCode,
    name: t.name,
    teamName: t.teamName,
    shortName: t.shortName,
    locationName: t.locationName,
    league: { name: t.league },
    division: { name: t.division },
    active: true
  }));
}

function buildAliases(team, sourceKey) {
  const teamId = `mlb_${team.id}`;
  const values = [
    ["abbreviation", team.abbreviation],
    ["full_name", team.name],
    ["nickname", team.teamName],
    ["short_name", team.shortName],
    ["team_code", team.teamCode],
    ["file_code", team.fileCode],
    ["mlb_team_id", String(team.id)]
  ];
  const extra = EXTRA_ALIASES[team.abbreviation] || [];
  for (const v of extra) values.push(["manual_alias", v]);

  const seen = new Set();
  const aliases = [];
  for (const [type, value] of values) {
    const cleaned = String(value || "").trim();
    const normalized = normalizeAlias(cleaned);
    if (!cleaned || !normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    aliases.push({
      alias_key: aliasKey(teamId, type, cleaned),
      team_id: teamId,
      mlb_team_id: team.id,
      alias_value: cleaned,
      alias_normalized: normalized,
      alias_type: type,
      source_key: sourceKey,
      confidence: type === "manual_alias" ? "CONTROLLED_ALIAS" : "CANONICAL"
    });
  }
  return aliases;
}

async function loadCurrentTeamsSnapshot(sql) {
  const rows = await sql`SELECT team_id, mlb_team_id, abbreviation, full_name, nickname, location_name, short_name, team_code, file_code, league, division, active FROM ref.teams`;
  const map = new Map();
  for (const r of rows) map.set(String(r.team_id), r);
  return map;
}

function teamHasRealChange(current, teamId, team) {
  if (!current) return true;
  return String(current.mlb_team_id || "") !== String(team.id || "")
    || String(current.abbreviation || "") !== String(team.abbreviation || "")
    || String(current.full_name || "") !== String(team.name || "")
    || String(current.nickname || "") !== String(team.teamName || "")
    || String(current.location_name || "") !== String(team.locationName || "")
    || String(current.short_name || "") !== String(team.shortName || "")
    || String(current.team_code || "") !== String(team.teamCode || "")
    || String(current.file_code || "") !== String(team.fileCode || "")
    || String(current.league || "") !== String(team.league || "")
    || String(current.division || "") !== String(team.division || "")
    || Number(current.active || 0) !== 1;
}

async function upsertTeams(sql, teams, sourceKey) {
  let teamRowsWritten = 0;
  let aliasesWritten = 0;
  let teamRowsUnchanged = 0;
  // Same real differential logic as before: skip the UPSERT for any team whose meaningful
  // fields haven't actually changed since last run. Teams data is close to fully static.
  const currentSnapshot = await loadCurrentTeamsSnapshot(sql);

  for (const team of teams) {
    const teamId = `mlb_${team.id}`;
    const current = currentSnapshot.get(teamId);
    if (!teamHasRealChange(current, teamId, team)) {
      teamRowsUnchanged += 1;
      for (const alias of buildAliases(team, sourceKey)) {
        await sql`
          INSERT INTO ref.team_aliases (alias_key, team_id, mlb_team_id, alias_value, alias_normalized, alias_type, source_key, confidence, active, updated_at)
          VALUES (${alias.alias_key}, ${alias.team_id}, ${alias.mlb_team_id}, ${alias.alias_value}, ${alias.alias_normalized}, ${alias.alias_type}, ${alias.source_key}, ${alias.confidence}, 1, now())
          ON CONFLICT (alias_key) DO UPDATE SET
            team_id=excluded.team_id, mlb_team_id=excluded.mlb_team_id, alias_value=excluded.alias_value,
            alias_normalized=excluded.alias_normalized, alias_type=excluded.alias_type, source_key=excluded.source_key,
            confidence=excluded.confidence, active=1, updated_at=now()
        `;
        aliasesWritten += 1;
      }
      continue;
    }
    await sql`
      INSERT INTO ref.teams (team_id, mlb_team_id, abbreviation, full_name, nickname, location_name, short_name, team_code, file_code, league, division, active, source_key, raw_json, updated_at)
      VALUES (${teamId}, ${team.id}, ${team.abbreviation}, ${team.name}, ${team.teamName}, ${team.locationName}, ${team.shortName}, ${team.teamCode}, ${team.fileCode}, ${team.league}, ${team.division}, 1, ${sourceKey}, ${JSON.stringify(team.raw || team).slice(0, 5000)}, now())
      ON CONFLICT (team_id) DO UPDATE SET
        mlb_team_id=excluded.mlb_team_id, abbreviation=excluded.abbreviation, full_name=excluded.full_name,
        nickname=excluded.nickname, location_name=excluded.location_name, short_name=excluded.short_name,
        team_code=excluded.team_code, file_code=excluded.file_code, league=excluded.league, division=excluded.division,
        active=1, source_key=excluded.source_key, raw_json=excluded.raw_json, updated_at=now()
    `;
    teamRowsWritten += 1;

    for (const alias of buildAliases(team, sourceKey)) {
      await sql`
        INSERT INTO ref.team_aliases (alias_key, team_id, mlb_team_id, alias_value, alias_normalized, alias_type, source_key, confidence, active, updated_at)
        VALUES (${alias.alias_key}, ${alias.team_id}, ${alias.mlb_team_id}, ${alias.alias_value}, ${alias.alias_normalized}, ${alias.alias_type}, ${alias.source_key}, ${alias.confidence}, 1, now())
        ON CONFLICT (alias_key) DO UPDATE SET
          team_id=excluded.team_id, mlb_team_id=excluded.mlb_team_id, alias_value=excluded.alias_value,
          alias_normalized=excluded.alias_normalized, alias_type=excluded.alias_type, source_key=excluded.source_key,
          confidence=excluded.confidence, active=1, updated_at=now()
      `;
      aliasesWritten += 1;
    }
  }

  return { team_rows_written: teamRowsWritten, alias_rows_written: aliasesWritten, team_rows_unchanged_skipped: teamRowsUnchanged };
}

async function counts(sql) {
  const active = await sql`SELECT COUNT(*)::int AS c FROM ref.teams WHERE active=1`;
  const teams = await sql`SELECT COUNT(*)::int AS c FROM ref.teams`;
  const aliases = await sql`SELECT COUNT(*)::int AS c FROM ref.team_aliases WHERE active=1`;
  const sample = await sql`SELECT abbreviation, full_name, nickname, location_name, league, division FROM ref.teams WHERE active=1 ORDER BY abbreviation LIMIT 30`;
  return {
    ref_teams_rows: Number(teams[0] && teams[0].c ? teams[0].c : 0),
    active_mlb_teams: Number(active[0] && active[0].c ? active[0].c : 0),
    ref_team_aliases_active_rows: Number(aliases[0] && aliases[0].c ? aliases[0].c : 0),
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
    status: "STATIC_TEAM_DICTIONARY_READY",
    timestamp_utc: nowUtc(),
    scope_lock: {
      writes_only: ["POSTGRES.ref.teams", "POSTGRES.ref.team_aliases"],
      no_prizepicks_board_mutation: true,
      no_opponent_backfill: true,
      no_scoring: true,
      no_final_board: true,
      no_scheduling: true
    },
    binding_summary: {
      required_db_bindings_present: allTrue(db),
      expected_vars_present: allTrue(vars),
      hyperdrive_bound: !!env.HYPERDRIVE
    }
  };
}

async function runStaticTeams(input, env) {
  const started = Date.now();
  const schema = await ensureSchema(env);
  const sql = pg(env);
  let sourceKey = "MLB_STATSAPI";
  let fetchInfo = null;
  let teams = [];
  let fetchError = null;

  try {
    fetchInfo = await fetchMlbTeams(env);
    teams = fetchInfo.teams;
  } catch (err) {
    fetchError = String(err && err.message ? err.message : err);
  }

  if (teams.length !== 30) {
    sourceKey = fetchError ? "STATIC_SEED_FALLBACK_AFTER_FETCH_ERROR" : "STATIC_SEED_FALLBACK_AFTER_COUNT_MISMATCH";
    teams = fallbackTeams();
  }

  teams = teams.slice().sort((a, b) => String(a.abbreviation).localeCompare(String(b.abbreviation)));
  const writes = await upsertTeams(sql, teams, sourceKey);
  const finalCounts = await counts(sql);
  await sql.end();
  const certified = finalCounts.active_mlb_teams === 30 && finalCounts.ref_team_aliases_active_rows >= 150;

  return {
    ok: certified,
    data_ok: certified,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: input.job_key || JOB_KEY,
    request_id: input.request_id || null,
    chain_id: input.chain_id || null,
    status: certified ? "completed_static_team_dictionary_seed" : "failed_static_team_dictionary_certification",
    certification: certified ? "STATIC_TEAM_DICTIONARY_SEEDED_30_ACTIVE_TEAMS_ALIASES_WRITTEN" : "STATIC_TEAM_DICTIONARY_CERTIFICATION_FAILED",
    rows_read: teams.length,
    rows_written: writes.team_rows_written + writes.alias_rows_written,
    teams_written: writes.team_rows_written,
    teams_unchanged_skipped: writes.team_rows_unchanged_skipped || 0,
    differential_note: "teams_written is the honest count of teams whose real fields actually changed and were rewritten; teams_unchanged_skipped were verified identical to current data and not rewritten.",
    aliases_written: writes.alias_rows_written,
    external_calls_performed: fetchInfo ? 1 : 0,
    elapsed_ms: Date.now() - started,
    source_key: sourceKey,
    source_fetch: fetchInfo ? { url: fetchInfo.url, http_status: fetchInfo.http_status, raw_count: fetchInfo.raw_count, parsed_count: fetchInfo.teams.length } : null,
    source_fetch_error: fetchError,
    schema_patch: schema,
    final_counts: finalCounts,
    output_cap: { sample_rows_limit: 30, raw_json_per_team_cap_chars: 5000 },
    scope_lock: baseIdentity(env).scope_lock,
    database_target: "postgres_ref_teams_ref_team_aliases",
    next_allowed_use: "Future worker may use Postgres ref.teams and ref.team_aliases for team/opponent/game mapping. This build does not backfill PrizePicks opponent values.",
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
          hyperdrive_bound: !!env.HYPERDRIVE,
          mlb_api_base_url_present: !!env.MLB_API_BASE_URL,
          worker_safe_mode: env.WORKER_SAFE_MODE || null
        }
      });
    }

    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        return jsonResponse(await runStaticTeams(input, env));
      } catch (err) {
        return jsonResponse({
          ok: false,
          data_ok: false,
          version: VERSION,
          worker_name: WORKER_NAME,
          job_key: input.job_key || JOB_KEY,
          request_id: input.request_id || null,
          chain_id: input.chain_id || null,
          status: "static_team_dictionary_exception",
          certification: "STATIC_TEAM_DICTIONARY_EXCEPTION",
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
