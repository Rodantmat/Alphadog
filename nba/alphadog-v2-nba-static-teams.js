import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-nba-static-teams";
const VERSION = "alphadog-v2-nba-static-teams-v0.1.0";
const JOB_KEY = "nba-static-teams";

const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_TIMEZONE", "NBA_STATS_API_BASE_URL", "WORKER_SAFE_MODE", "DEBUG_MODE"];

// Source-locked (Phase 3a): stats.nba.com is the NBA's own official API (same discipline as
// MLB's own MLB Stats API usage - blueprint Section 4i). It requires specific browser-like
// headers or it 403s; this is a known, documented requirement (see nba_api Python package),
// NOT yet live-tested from this build session (network sandbox could not reach stats.nba.com
// directly - see NBA_PROJECT_LOG.md). The certified static fallback below is the real,
// verified-correct 30-team list (team IDs are NBA's own stable stats.nba.com TEAM_ID values,
// unchanged for decades) and is what this worker will actually certify against until the live
// fetch path is confirmed working post-deploy.
const NBA_STATS_REQUIRED_HEADERS = {
  "Host": "stats.nba.com",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Connection": "keep-alive",
  "Referer": "https://stats.nba.com/",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
};

// Certified static fallback - real, current (2026-27 season) 30-team NBA dictionary.
// team IDs = stats.nba.com's own stable TEAM_ID values. No relocations/renames pending for
// this season as of 2026-08-31 (a 32-team Seattle/Las Vegas expansion is only in early-vote
// stages for the 2028-29 season per direct research this session - does not affect this list).
const STATIC_FALLBACK_TEAMS = [
  { id: 1610612737, abbreviation: "ATL", name: "Atlanta Hawks", nickname: "Hawks", city: "Atlanta", conference: "East", division: "Southeast" },
  { id: 1610612738, abbreviation: "BOS", name: "Boston Celtics", nickname: "Celtics", city: "Boston", conference: "East", division: "Atlantic" },
  { id: 1610612751, abbreviation: "BKN", name: "Brooklyn Nets", nickname: "Nets", city: "Brooklyn", conference: "East", division: "Atlantic" },
  { id: 1610612766, abbreviation: "CHA", name: "Charlotte Hornets", nickname: "Hornets", city: "Charlotte", conference: "East", division: "Southeast" },
  { id: 1610612741, abbreviation: "CHI", name: "Chicago Bulls", nickname: "Bulls", city: "Chicago", conference: "East", division: "Central" },
  { id: 1610612739, abbreviation: "CLE", name: "Cleveland Cavaliers", nickname: "Cavaliers", city: "Cleveland", conference: "East", division: "Central" },
  { id: 1610612742, abbreviation: "DAL", name: "Dallas Mavericks", nickname: "Mavericks", city: "Dallas", conference: "West", division: "Southwest" },
  { id: 1610612743, abbreviation: "DEN", name: "Denver Nuggets", nickname: "Nuggets", city: "Denver", conference: "West", division: "Northwest" },
  { id: 1610612765, abbreviation: "DET", name: "Detroit Pistons", nickname: "Pistons", city: "Detroit", conference: "East", division: "Central" },
  { id: 1610612744, abbreviation: "GSW", name: "Golden State Warriors", nickname: "Warriors", city: "San Francisco", conference: "West", division: "Pacific" },
  { id: 1610612745, abbreviation: "HOU", name: "Houston Rockets", nickname: "Rockets", city: "Houston", conference: "West", division: "Southwest" },
  { id: 1610612754, abbreviation: "IND", name: "Indiana Pacers", nickname: "Pacers", city: "Indianapolis", conference: "East", division: "Central" },
  { id: 1610612746, abbreviation: "LAC", name: "LA Clippers", nickname: "Clippers", city: "Los Angeles", conference: "West", division: "Pacific" },
  { id: 1610612747, abbreviation: "LAL", name: "Los Angeles Lakers", nickname: "Lakers", city: "Los Angeles", conference: "West", division: "Pacific" },
  { id: 1610612763, abbreviation: "MEM", name: "Memphis Grizzlies", nickname: "Grizzlies", city: "Memphis", conference: "West", division: "Southwest" },
  { id: 1610612748, abbreviation: "MIA", name: "Miami Heat", nickname: "Heat", city: "Miami", conference: "East", division: "Southeast" },
  { id: 1610612749, abbreviation: "MIL", name: "Milwaukee Bucks", nickname: "Bucks", city: "Milwaukee", conference: "East", division: "Central" },
  { id: 1610612750, abbreviation: "MIN", name: "Minnesota Timberwolves", nickname: "Timberwolves", city: "Minneapolis", conference: "West", division: "Northwest" },
  { id: 1610612740, abbreviation: "NOP", name: "New Orleans Pelicans", nickname: "Pelicans", city: "New Orleans", conference: "West", division: "Southwest" },
  { id: 1610612752, abbreviation: "NYK", name: "New York Knicks", nickname: "Knicks", city: "New York", conference: "East", division: "Atlantic" },
  { id: 1610612760, abbreviation: "OKC", name: "Oklahoma City Thunder", nickname: "Thunder", city: "Oklahoma City", conference: "West", division: "Northwest" },
  { id: 1610612753, abbreviation: "ORL", name: "Orlando Magic", nickname: "Magic", city: "Orlando", conference: "East", division: "Southeast" },
  { id: 1610612755, abbreviation: "PHI", name: "Philadelphia 76ers", nickname: "76ers", city: "Philadelphia", conference: "East", division: "Atlantic" },
  { id: 1610612756, abbreviation: "PHX", name: "Phoenix Suns", nickname: "Suns", city: "Phoenix", conference: "West", division: "Pacific" },
  { id: 1610612757, abbreviation: "POR", name: "Portland Trail Blazers", nickname: "Trail Blazers", city: "Portland", conference: "West", division: "Northwest" },
  { id: 1610612758, abbreviation: "SAC", name: "Sacramento Kings", nickname: "Kings", city: "Sacramento", conference: "West", division: "Pacific" },
  { id: 1610612759, abbreviation: "SAS", name: "San Antonio Spurs", nickname: "Spurs", city: "San Antonio", conference: "West", division: "Southwest" },
  { id: 1610612761, abbreviation: "TOR", name: "Toronto Raptors", nickname: "Raptors", city: "Toronto", conference: "East", division: "Atlantic" },
  { id: 1610612762, abbreviation: "UTA", name: "Utah Jazz", nickname: "Jazz", city: "Salt Lake City", conference: "West", division: "Northwest" },
  { id: 1610612764, abbreviation: "WAS", name: "Washington Wizards", nickname: "Wizards", city: "Washington", conference: "East", division: "Southeast" }
];

const EXTRA_ALIASES = {
  BKN: ["Nets", "Brooklyn Nets", "New Jersey Nets"],
  GSW: ["Warriors", "Golden State", "GS Warriors"],
  LAC: ["Clippers", "Los Angeles Clippers"],
  LAL: ["Lakers", "Los Angeles Lakers"],
  NOP: ["Pelicans", "New Orleans"],
  NYK: ["Knicks", "New York Knicks"],
  OKC: ["Thunder", "Oklahoma City", "Seattle SuperSonics (historical, pre-2008)"],
  PHI: ["Sixers", "76ers", "Philadelphia 76ers"],
  PHX: ["Suns", "Phoenix"],
  SAS: ["Spurs", "San Antonio"],
  UTA: ["Jazz", "Utah"]
};

function nowUtc() { return new Date().toISOString(); }

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

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
  return postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false });
}

async function fetchNbaTeamsFromGithub(env) {
  // Real, working source (confirmed 2026-08-31): stats.nba.com cannot be called directly from
  // this Cloudflare Worker (every nba.com/nba.net domain edge-blocks Cloudflare Workers'
  // egress IPs - see nba/NBA_PROJECT_LOG.md for the full probe history). The real fix, proven
  // working, is nba/scrape_nba_stats_teams.py running on a GitHub Actions runner (a different
  // network origin, using curl_cffi Chrome-TLS impersonation) which commits
  // nba/data/nba_teams_current.json to the repo - this function just reads that committed file,
  // exactly the same pattern alphadog-v2-prizepicks-github-board.js uses for
  // prizepicks_mlb_current.json, using the same already-present GITHUB_TOKEN/OWNER/REPO/BRANCH
  // secrets (no new secret plumbing needed).
  const owner = env.GITHUB_OWNER || "Rodantmat";
  const repo = env.GITHUB_REPO || "Alphadog";
  const branch = env.GITHUB_BRANCH || "main";
  const path = "nba/data/nba_teams_current.json";
  const metaPath = "nba/data/nba_teams_current_meta.json";

  const headers = { "Accept": "application/vnd.github.raw+json", "User-Agent": "Alphadog-NBA-StaticTeams" };
  if (env.GITHUB_TOKEN) headers["Authorization"] = `Bearer ${env.GITHUB_TOKEN}`;

  const apiUrl = (p) => `https://api.github.com/repos/${owner}/${repo}/contents/${p}?ref=${encodeURIComponent(branch)}`;

  const [dataResp, metaResp] = await Promise.all([
    fetch(apiUrl(path), { headers }),
    fetch(apiUrl(metaPath), { headers })
  ]);
  if (!dataResp.ok) throw new Error(`github_read_failed_http_${dataResp.status}:${(await dataResp.text()).slice(0, 200)}`);

  const dataJson = await dataResp.json();
  const teamsFile = JSON.parse(atob(String(dataJson.content || "").replace(/\n/g, "")));
  let meta = null;
  if (metaResp.ok) {
    try {
      const metaJson = await metaResp.json();
      meta = JSON.parse(atob(String(metaJson.content || "").replace(/\n/g, "")));
    } catch (_) { /* meta is informational only */ }
  }
  if (meta && meta.error) throw new Error(`last_committed_scrape_failed: ${meta.error}`);

  const teams = (teamsFile.teams || []).map(t => ({
    id: Number(t.id),
    abbreviation: String(t.abbreviation || "").toUpperCase(),
    name: `${t.city || ""} ${t.nickname || ""}`.trim(),
    nickname: String(t.nickname || ""),
    city: String(t.city || ""),
    conference: String(t.conference || ""),
    division: String(t.division || "")
  })).filter(t => t.id && t.abbreviation);

  return { source_path: path, fetched_at_by_scraper: meta ? meta.fetched_at : null, teams, raw_count: (teamsFile.teams || []).length };
}

async function fetchNbaTeamsLive(env) {
  const base = String(env.NBA_STATS_API_BASE_URL || "https://stats.nba.com/stats").replace(/\/+$/, "");
  const url = `${base}/leaguestandingsv3?LeagueID=00&Season=2025-26&SeasonType=Regular%20Season`;
  const resp = await fetch(url, { method: "GET", headers: NBA_STATS_REQUIRED_HEADERS });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`nba_stats_api_http_${resp.status}:${text.slice(0, 200)}`);
  let body;
  try { body = JSON.parse(text); } catch (_) { throw new Error("nba_stats_api_non_json_response"); }
  // leaguestandingsv3 shape: resultSets[0].rowSet with TeamID/TeamCity/TeamName/Conference/Division columns.
  const rs = body && Array.isArray(body.resultSets) ? body.resultSets[0] : null;
  if (!rs || !Array.isArray(rs.rowSet)) throw new Error("nba_stats_api_unexpected_shape");
  const headers = rs.headers;
  const idx = (col) => headers.indexOf(col);
  const teams = rs.rowSet.map(row => ({
    id: Number(row[idx("TeamID")]),
    abbreviation: String(row[idx("TeamAbbreviation")] || row[idx("TeamCode")] || "").toUpperCase(),
    name: `${row[idx("TeamCity")] || ""} ${row[idx("TeamName")] || ""}`.trim(),
    nickname: String(row[idx("TeamName")] || ""),
    city: String(row[idx("TeamCity")] || ""),
    conference: String(row[idx("Conference")] || ""),
    division: String(row[idx("Division")] || "")
  })).filter(t => t.id && t.abbreviation);
  return { url, http_status: resp.status, teams, raw_count: rs.rowSet.length };
}

function fallbackTeams() {
  return STATIC_FALLBACK_TEAMS.slice();
}

function buildAliases(team, sourceKey) {
  const teamId = `nba_${team.id}`;
  const values = [
    ["abbreviation", team.abbreviation],
    ["full_name", team.name],
    ["nickname", team.nickname],
    ["city", team.city],
    ["nba_team_id", String(team.id)]
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
      nba_team_id: team.id,
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
  const rows = await sql`SELECT team_id, nba_team_id, abbreviation, full_name, nickname, location_name, conference, division, active FROM nba_ref.teams`;
  const map = new Map();
  for (const r of rows) map.set(String(r.team_id), r);
  return map;
}

function teamHasRealChange(current, team) {
  if (!current) return true;
  return String(current.nba_team_id || "") !== String(team.id || "")
    || String(current.abbreviation || "") !== String(team.abbreviation || "")
    || String(current.full_name || "") !== String(team.name || "")
    || String(current.nickname || "") !== String(team.nickname || "")
    || String(current.location_name || "") !== String(team.city || "")
    || String(current.conference || "") !== String(team.conference || "")
    || String(current.division || "") !== String(team.division || "")
    || Number(current.active || 0) !== 1;
}

async function upsertTeams(sql, teams, sourceKey) {
  let teamRowsWritten = 0;
  let aliasesWritten = 0;
  let teamRowsUnchanged = 0;
  const currentSnapshot = await loadCurrentTeamsSnapshot(sql);

  for (const team of teams) {
    const teamId = `nba_${team.id}`;
    const current = currentSnapshot.get(teamId);
    const writeAliases = async () => {
      for (const alias of buildAliases(team, sourceKey)) {
        await sql`
          INSERT INTO nba_ref.team_aliases (alias_key, team_id, nba_team_id, alias_value, alias_normalized, alias_type, source_key, confidence, active, updated_at)
          VALUES (${alias.alias_key}, ${alias.team_id}, ${alias.nba_team_id}, ${alias.alias_value}, ${alias.alias_normalized}, ${alias.alias_type}, ${alias.source_key}, ${alias.confidence}, 1, now())
          ON CONFLICT (alias_key) DO UPDATE SET
            team_id=excluded.team_id, nba_team_id=excluded.nba_team_id, alias_value=excluded.alias_value,
            alias_normalized=excluded.alias_normalized, alias_type=excluded.alias_type, source_key=excluded.source_key,
            confidence=excluded.confidence, active=1, updated_at=now()
        `;
        aliasesWritten += 1;
      }
    };

    if (!teamHasRealChange(current, team)) {
      teamRowsUnchanged += 1;
      await writeAliases();
      continue;
    }

    await sql`
      INSERT INTO nba_ref.teams (team_id, nba_team_id, abbreviation, full_name, nickname, location_name, conference, division, active, source_key, raw_json, updated_at)
      VALUES (${teamId}, ${team.id}, ${team.abbreviation}, ${team.name}, ${team.nickname}, ${team.city}, ${team.conference}, ${team.division}, 1, ${sourceKey}, ${JSON.stringify(team).slice(0, 5000)}, now())
      ON CONFLICT (team_id) DO UPDATE SET
        nba_team_id=excluded.nba_team_id, abbreviation=excluded.abbreviation, full_name=excluded.full_name,
        nickname=excluded.nickname, location_name=excluded.location_name, conference=excluded.conference,
        division=excluded.division, active=1, source_key=excluded.source_key, raw_json=excluded.raw_json, updated_at=now()
    `;
    teamRowsWritten += 1;
    await writeAliases();
  }

  return { team_rows_written: teamRowsWritten, alias_rows_written: aliasesWritten, team_rows_unchanged_skipped: teamRowsUnchanged };
}

async function counts(sql) {
  const active = await sql`SELECT COUNT(*)::int AS c FROM nba_ref.teams WHERE active=1`;
  const teams = await sql`SELECT COUNT(*)::int AS c FROM nba_ref.teams`;
  const aliases = await sql`SELECT COUNT(*)::int AS c FROM nba_ref.team_aliases WHERE active=1`;
  const sample = await sql`SELECT abbreviation, full_name, conference, division FROM nba_ref.teams WHERE active=1 ORDER BY abbreviation LIMIT 30`;
  return {
    nba_ref_teams_rows: Number(teams[0] && teams[0].c ? teams[0].c : 0),
    active_nba_teams: Number(active[0] && active[0].c ? active[0].c : 0),
    nba_ref_team_aliases_active_rows: Number(aliases[0] && aliases[0].c ? aliases[0].c : 0),
    sample_rows: sample
  };
}

function baseIdentity(env) {
  return {
    ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "NBA_STATIC_TEAM_DICTIONARY_READY",
    timestamp_utc: nowUtc(),
    scope_lock: {
      writes_only: ["POSTGRES.nba_ref.teams", "POSTGRES.nba_ref.team_aliases"],
      no_mlb_table_access: true,
      no_scoring: true,
      no_board_mutation: true
    },
    hyperdrive_bound: !!(env && env.HYPERDRIVE)
  };
}

async function runStaticTeams(input, env) {
  const started = Date.now();
  const sql = pg(env);
  let sourceKey = "NBA_GITHUB_COMMITTED_STATS_NBA_SCRAPE";
  let fetchInfo = null;
  let teams = [];
  let fetchError = null;
  let fetchMethod = "github_committed_json";

  try {
    fetchInfo = await fetchNbaTeamsFromGithub(env);
    teams = fetchInfo.teams;
  } catch (githubErr) {
    fetchError = `github_read_failed: ${String(githubErr && githubErr.message ? githubErr.message : githubErr)}`;
    // Second attempt: direct stats.nba.com call, kept only as a secondary path - known to be
    // edge-blocked from Cloudflare Workers as of 2026-08-31 (see NBA_PROJECT_LOG.md), so this
    // is expected to keep failing until/unless that changes, but costs nothing to still try.
    try {
      fetchMethod = "direct_stats_nba_com_fetch";
      fetchInfo = await fetchNbaTeamsLive(env);
      teams = fetchInfo.teams;
      fetchError = null;
    } catch (directErr) {
      fetchError += ` | direct_fetch_also_failed: ${String(directErr && directErr.message ? directErr.message : directErr)}`;
    }
  }

  if (teams.length !== 30) {
    sourceKey = fetchError ? "STATIC_SEED_FALLBACK_AFTER_FETCH_ERROR" : "STATIC_SEED_FALLBACK_AFTER_COUNT_MISMATCH";
    fetchMethod = "certified_static_fallback";
    teams = fallbackTeams();
  }

  teams = teams.slice().sort((a, b) => String(a.abbreviation).localeCompare(String(b.abbreviation)));
  const writes = await upsertTeams(sql, teams, sourceKey);
  const finalCounts = await counts(sql);
  await sql.end();
  const certified = finalCounts.active_nba_teams === 30 && finalCounts.nba_ref_team_aliases_active_rows >= 100;

  return {
    ok: certified,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: input.job_key || JOB_KEY,
    request_id: input.request_id || null,
    status: certified ? "completed_nba_static_team_dictionary_seed" : "failed_nba_static_team_dictionary_certification",
    certification: certified ? "NBA_STATIC_TEAM_DICTIONARY_SEEDED_30_ACTIVE_TEAMS_ALIASES_WRITTEN" : "NBA_STATIC_TEAM_DICTIONARY_CERTIFICATION_FAILED",
    rows_read: teams.length,
    teams_written: writes.team_rows_written,
    teams_unchanged_skipped: writes.team_rows_unchanged_skipped,
    aliases_written: writes.alias_rows_written,
    external_calls_performed: fetchInfo ? 1 : 0,
    elapsed_ms: Date.now() - started,
    source_key: sourceKey,
    fetch_method: fetchMethod,
    source_fetch: fetchInfo ? { url: fetchInfo.url || fetchInfo.source_path || null, http_status: fetchInfo.http_status || null, raw_count: fetchInfo.raw_count, parsed_count: fetchInfo.teams ? fetchInfo.teams.length : null, scraper_fetched_at: fetchInfo.fetched_at_by_scraper || null } : null,
    source_fetch_error: fetchError,
    fetch_note: "Live stats.nba.com fetch path is untested from the build session that wrote this worker (network sandbox could not reach stats.nba.com). First real /run after deploy will show whether the live path or the certified static fallback actually served this run - check source_key in the response.",
    final_counts: finalCounts,
    scope_lock: baseIdentity(env).scope_lock,
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
      return jsonResponse({
        ...baseIdentity(env),
        route: "/health",
        vars_present: Object.fromEntries(EXPECTED_VARS.map(v => [v, Boolean(env && env[v])]))
      });
    }

    if (method === "GET" && path === "/probe-sources") {
      // Diagnostic-only route (never writes anything): tries several real, candidate NBA-owned
      // or NBA-official-CDN endpoints in sequence and reports the raw outcome of each, so a
      // source decision can be made from real evidence instead of one single guess. None of
      // these calls touch Postgres.
      const candidates = [
        { name: "stats.nba.com/stats/leaguestandingsv3", url: "https://stats.nba.com/stats/leaguestandingsv3?LeagueID=00&Season=2025-26&SeasonType=Regular%20Season", headers: NBA_STATS_REQUIRED_HEADERS },
        { name: "cdn.nba.com/static/json/staticData/teams.json", url: "https://cdn.nba.com/static/json/staticData/teams.json", headers: { "Accept": "application/json", "User-Agent": NBA_STATS_REQUIRED_HEADERS["User-Agent"] } },
        { name: "core-api.nba.com/cp/api/v1.7/feeds/leaguesInfoFeed", url: "https://core-api.nba.com/cp/api/v1.7/feeds/leaguesInfoFeed", headers: { "Accept": "application/json", "User-Agent": NBA_STATS_REQUIRED_HEADERS["User-Agent"] } },
        { name: "data.nba.net/prod/v1/2025/teams.json", url: "https://data.nba.net/prod/v1/2025/teams.json", headers: { "Accept": "application/json", "User-Agent": NBA_STATS_REQUIRED_HEADERS["User-Agent"] } }
      ];
      const results = [];
      for (const c of candidates) {
        try {
          const resp = await fetch(c.url, { method: "GET", headers: c.headers });
          const text = await resp.text();
          results.push({ name: c.name, url: c.url, http_status: resp.status, ok: resp.ok, body_preview: text.slice(0, 300), looks_like_json: text.trim().startsWith("{") || text.trim().startsWith("[") });
        } catch (err) {
          results.push({ name: c.name, url: c.url, error: String(err && err.message ? err.message : err) });
        }
      }
      return jsonResponse({ ok: true, probed_at: nowUtc(), results });
    }

    if (method === "GET" && path === "/debug-fetch") {
      // Diagnostic-only route (never writes anything) to see the raw stats.nba.com response
      // during source verification - not part of the certified /run path.
      try {
        const info = await fetchNbaTeamsLive(env);
        return jsonResponse({ ok: true, ...info });
      } catch (err) {
        return jsonResponse({ ok: false, error: String(err && err.message ? err.message : err) }, 200);
      }
    }

    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        return jsonResponse(await runStaticTeams(input, env));
      } catch (err) {
        return jsonResponse({
          ok: false,
          version: VERSION,
          worker_name: WORKER_NAME,
          job_key: input.job_key || JOB_KEY,
          status: "nba_static_team_dictionary_exception",
          error: String(err && err.message ? err.message : err),
          timestamp_utc: nowUtc()
        }, 500);
      }
    }

    return jsonResponse({
      ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      status: "NOT_FOUND",
      allowed_routes: ["GET /", "GET /health", "POST /run"],
      timestamp_utc: nowUtc()
    }, 404);
  }
};
