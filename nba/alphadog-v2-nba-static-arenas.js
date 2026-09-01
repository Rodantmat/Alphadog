import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-nba-static-arenas";
const VERSION = "alphadog-v2-nba-static-arenas-v0.1.0";
const JOB_KEY = "nba-static-arenas";

const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "WORKER_SAFE_MODE", "DEBUG_MODE"];

function nowUtc() { return new Date().toISOString(); }

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

async function readJsonSafe(request) {
  try { return await request.json(); } catch { return {}; }
}

function pg(env) {
  return postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false });
}

async function fetchNbaArenasFromGithub(env) {
  // Same proven pattern as alphadog-v2-nba-static-teams.js / -players.js.
  const owner = env.GITHUB_OWNER || "Rodantmat";
  const repo = env.GITHUB_REPO || "Alphadog";
  const branch = env.GITHUB_BRANCH || "main";
  const path = "nba/data/nba_arenas_current.json";
  const metaPath = "nba/data/nba_arenas_current_meta.json";

  const headers = { "Accept": "application/vnd.github+json", "User-Agent": "Alphadog-NBA-StaticArenas" };
  if (env.GITHUB_TOKEN) headers["Authorization"] = `Bearer ${env.GITHUB_TOKEN}`;

  const apiUrl = (p) => `https://api.github.com/repos/${owner}/${repo}/contents/${p}?ref=${encodeURIComponent(branch)}`;

  const [dataResp, metaResp] = await Promise.all([
    fetch(apiUrl(path), { headers }),
    fetch(apiUrl(metaPath), { headers })
  ]);
  if (!dataResp.ok) throw new Error(`github_read_failed_http_${dataResp.status}:${(await dataResp.text()).slice(0, 200)}`);

  const dataJson = await dataResp.json();
  const arenasFile = JSON.parse(atob(String(dataJson.content || "").replace(/\n/g, "")));
  let meta = null;
  if (metaResp.ok) {
    try {
      const metaJson = await metaResp.json();
      meta = JSON.parse(atob(String(metaJson.content || "").replace(/\n/g, "")));
    } catch (_) { /* informational only */ }
  }

  const arenas = (arenasFile.arenas || []).filter(a => a && a.team_id && a.arena_name).map(a => ({
    team_id: Number(a.team_id),
    arena_name: String(a.arena_name).trim(),
    arena_capacity: a.arena_capacity && Number(a.arena_capacity) > 0 ? Number(a.arena_capacity) : null,
    city: String(a.city || "")
  }));

  return { source_path: path, fetched_at_by_scraper: meta ? meta.fetched_at : null, arenas, raw_count: (arenasFile.arenas || []).length, per_team_errors: meta ? meta.per_team_errors : null };
}

async function upsertArenas(sql, arenas, sourceKey) {
  let written = 0;
  for (const arena of arenas) {
    const arenaId = `nba_arena_${arena.team_id}`;
    const teamId = `nba_${arena.team_id}`;
    await sql`
      INSERT INTO nba_ref.arenas (arena_id, arena_name, team_id, city, capacity, source_key, data_quality, raw_json, updated_at)
      VALUES (${arenaId}, ${arena.arena_name}, ${teamId}, ${arena.city}, ${arena.arena_capacity}, ${sourceKey}, 'real', ${JSON.stringify(arena).slice(0, 2000)}, now())
      ON CONFLICT (arena_id) DO UPDATE SET
        arena_name=excluded.arena_name, team_id=excluded.team_id, city=excluded.city, capacity=excluded.capacity,
        source_key=excluded.source_key, data_quality=excluded.data_quality, raw_json=excluded.raw_json, updated_at=now()
    `;
    written += 1;
  }
  return written;
}

async function counts(sql) {
  const total = await sql`SELECT COUNT(*)::int AS c FROM nba_ref.arenas`;
  const missingCapacity = await sql`SELECT COUNT(*)::int AS c FROM nba_ref.arenas WHERE capacity IS NULL`;
  const sample = await sql`SELECT arena_name, team_id, capacity FROM nba_ref.arenas ORDER BY arena_name LIMIT 8`;
  return {
    nba_ref_arenas_rows: Number(total[0] && total[0].c ? total[0].c : 0),
    arenas_missing_capacity: Number(missingCapacity[0] && missingCapacity[0].c ? missingCapacity[0].c : 0),
    sample_rows: sample
  };
}

function baseIdentity(env) {
  return {
    ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "NBA_STATIC_ARENA_DICTIONARY_READY",
    timestamp_utc: nowUtc(),
    scope_lock: {
      writes_only: ["POSTGRES.nba_ref.arenas"],
      no_mlb_table_access: true,
      no_scoring: true,
      no_board_mutation: true
    },
    hyperdrive_bound: !!(env && env.HYPERDRIVE)
  };
}

async function runStaticArenas(input, env) {
  const started = Date.now();
  const sql = pg(env);
  let fetchInfo = null;
  let fetchError = null;

  try {
    fetchInfo = await fetchNbaArenasFromGithub(env);
  } catch (err) {
    fetchError = String(err && err.message ? err.message : err);
  }

  if (!fetchInfo || fetchInfo.arenas.length === 0) {
    await sql.end();
    return {
      ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: input.job_key || JOB_KEY,
      status: "failed_nba_static_arena_dictionary_no_data",
      error: fetchError || "zero_arenas_returned",
      elapsed_ms: Date.now() - started,
      timestamp_utc: nowUtc()
    };
  }

  const written = await upsertArenas(sql, fetchInfo.arenas, "NBA_GITHUB_COMMITTED_STATS_NBA_SCRAPE");
  const finalCounts = await counts(sql);
  await sql.end();
  const certified = finalCounts.nba_ref_arenas_rows === 30;

  return {
    ok: certified,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: input.job_key || JOB_KEY,
    request_id: input.request_id || null,
    status: certified ? "completed_nba_static_arena_dictionary_seed" : "completed_with_certification_warning",
    rows_read: fetchInfo.arenas.length,
    arenas_written: written,
    per_team_scrape_errors: fetchInfo.per_team_errors,
    elapsed_ms: Date.now() - started,
    source_key: "NBA_GITHUB_COMMITTED_STATS_NBA_SCRAPE",
    source_fetch: { path: fetchInfo.source_path, raw_count: fetchInfo.raw_count, scraper_fetched_at: fetchInfo.fetched_at_by_scraper },
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

    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        return jsonResponse(await runStaticArenas(input, env));
      } catch (err) {
        return jsonResponse({
          ok: false,
          version: VERSION,
          worker_name: WORKER_NAME,
          job_key: input.job_key || JOB_KEY,
          status: "nba_static_arena_dictionary_exception",
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
