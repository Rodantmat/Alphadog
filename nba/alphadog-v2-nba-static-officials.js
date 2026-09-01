import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-nba-static-officials";
const VERSION = "alphadog-v2-nba-static-officials-v0.1.0";
const JOB_KEY = "nba-static-officials";

const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "WORKER_SAFE_MODE", "DEBUG_MODE"];

function nowUtc() { return new Date().toISOString(); }

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function normalizeId(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

async function readJsonSafe(request) {
  try { return await request.json(); } catch { return {}; }
}

function pg(env) {
  return postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false });
}

async function fetchNbaOfficialsFromGithub(env) {
  const owner = env.GITHUB_OWNER || "Rodantmat";
  const repo = env.GITHUB_REPO || "Alphadog";
  const branch = env.GITHUB_BRANCH || "main";
  const path = "nba/data/nba_officials_current.json";
  const metaPath = "nba/data/nba_officials_current_meta.json";

  const headers = { "Accept": "application/vnd.github+json", "User-Agent": "Alphadog-NBA-StaticOfficials" };
  if (env.GITHUB_TOKEN) headers["Authorization"] = `Bearer ${env.GITHUB_TOKEN}`;

  const apiUrl = (p) => `https://api.github.com/repos/${owner}/${repo}/contents/${p}?ref=${encodeURIComponent(branch)}`;

  const [dataResp, metaResp] = await Promise.all([
    fetch(apiUrl(path), { headers }),
    fetch(apiUrl(metaPath), { headers })
  ]);
  if (!dataResp.ok) throw new Error(`github_read_failed_http_${dataResp.status}:${(await dataResp.text()).slice(0, 200)}`);

  const dataJson = await dataResp.json();
  const officialsFile = JSON.parse(atob(String(dataJson.content || "").replace(/\n/g, "")));
  let meta = null;
  if (metaResp.ok) {
    try {
      const metaJson = await metaResp.json();
      meta = JSON.parse(atob(String(metaJson.content || "").replace(/\n/g, "")));
    } catch (_) { }
  }
  if (meta && meta.error) throw new Error(`last_committed_scrape_failed: ${meta.error}`);

  const officials = (officialsFile.officials || []).filter(o => o && o.full_name).map(o => ({
    full_name: String(o.full_name).trim(),
    jersey_number: o.jersey_number != null ? Number(o.jersey_number) : null
  }));

  return { source_path: path, fetched_at_by_scraper: meta ? meta.fetched_at : null, officials, raw_count: (officialsFile.officials || []).length };
}

async function upsertOfficials(sql, officials, sourceKey) {
  let written = 0;
  for (const o of officials) {
    const officialId = `nba_official_${normalizeId(o.full_name)}`;
    await sql`
      INSERT INTO nba_ref.officials (official_id, full_name, active, source_key, data_quality, raw_json, updated_at)
      VALUES (${officialId}, ${o.full_name}, 1, ${sourceKey}, 'real', ${JSON.stringify(o).slice(0, 1000)}, now())
      ON CONFLICT (official_id) DO UPDATE SET
        full_name=excluded.full_name, active=1, source_key=excluded.source_key,
        data_quality=excluded.data_quality, raw_json=excluded.raw_json, updated_at=now()
    `;
    written += 1;
  }
  return written;
}

async function counts(sql) {
  const total = await sql`SELECT COUNT(*)::int AS c FROM nba_ref.officials WHERE active=1`;
  const sample = await sql`SELECT full_name FROM nba_ref.officials WHERE active=1 ORDER BY full_name LIMIT 8`;
  return { nba_ref_officials_active_rows: Number(total[0] && total[0].c ? total[0].c : 0), sample_rows: sample };
}

function baseIdentity(env) {
  return {
    ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "NBA_STATIC_OFFICIAL_DICTIONARY_READY",
    timestamp_utc: nowUtc(),
    scope_lock: {
      writes_only: ["POSTGRES.nba_ref.officials"],
      no_mlb_table_access: true,
      no_scoring: true,
      no_board_mutation: true
    },
    hyperdrive_bound: !!(env && env.HYPERDRIVE)
  };
}

async function runStaticOfficials(input, env) {
  const started = Date.now();
  const sql = pg(env);
  let fetchInfo = null;
  let fetchError = null;

  try {
    fetchInfo = await fetchNbaOfficialsFromGithub(env);
  } catch (err) {
    fetchError = String(err && err.message ? err.message : err);
  }

  if (!fetchInfo || fetchInfo.officials.length === 0) {
    await sql.end();
    return {
      ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: input.job_key || JOB_KEY,
      status: "failed_nba_static_official_dictionary_no_data",
      error: fetchError || "zero_officials_returned",
      elapsed_ms: Date.now() - started,
      timestamp_utc: nowUtc()
    };
  }

  const written = await upsertOfficials(sql, fetchInfo.officials, "NBA_GITHUB_COMMITTED_WIKIPEDIA_SCRAPE");
  const finalCounts = await counts(sql);
  await sql.end();
  const certified = finalCounts.nba_ref_officials_active_rows >= 70;

  return {
    ok: certified,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: input.job_key || JOB_KEY,
    request_id: input.request_id || null,
    status: certified ? "completed_nba_static_official_dictionary_seed" : "completed_with_certification_warning",
    rows_read: fetchInfo.officials.length,
    officials_written: written,
    elapsed_ms: Date.now() - started,
    source_key: "NBA_GITHUB_COMMITTED_WIKIPEDIA_SCRAPE",
    source_fetch: { path: fetchInfo.source_path, raw_count: fetchInfo.raw_count, scraper_fetched_at: fetchInfo.fetched_at_by_scraper },
    known_limitation: "No stats.nba.com official ID crosswalk yet - official_id is name-derived until box-score officials data provides a real cross-reference",
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
        return jsonResponse(await runStaticOfficials(input, env));
      } catch (err) {
        return jsonResponse({
          ok: false,
          version: VERSION,
          worker_name: WORKER_NAME,
          job_key: input.job_key || JOB_KEY,
          status: "nba_static_official_dictionary_exception",
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
