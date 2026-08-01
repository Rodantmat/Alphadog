import postgres from "postgres";

// TEMPORARY PROBE v6 - now with HYPERDRIVE access to use the REAL database-stored API key
// (config.external_credentials), not the stale worker-secret fallback that returned 401
// INVALID_KEY on every prior test. This is the key that matters - what the real, live
// parlay-sleeper-board worker actually uses and what got the genuine 400 UNKNOWN_BOOKMAKER.
const WORKER_NAME = "alphadog-v2-daily-batting-orders";
const VERSION = "TEMP_PROBE_v6_real_key";
const DEFAULT_PARLAY_API_BASE_URL = "https://parlay-api.com/v1";

function nowUtc() { return new Date().toISOString(); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

async function getRealApiKey(env) {
  if (!env.HYPERDRIVE) return null;
  const client = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false, connect_timeout: 8 });
  try {
    const rows = await client.unsafe("SELECT credential_value_encrypted FROM config.external_credentials WHERE credential_key='parlay_api_key'");
    if (rows && rows[0] && rows[0].credential_value_encrypted) {
      const parsed = JSON.parse(rows[0].credential_value_encrypted);
      if (parsed && parsed.password) return String(parsed.password);
    }
  } catch (_) {
  } finally {
    await client.end({ timeout: 1 });
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "GET" && (path === "/" || path === "/health")) {
      return jsonResponse({ ok: true, worker_name: WORKER_NAME, version: VERSION, hyperdrive_present: !!env.HYPERDRIVE });
    }

    if (method === "POST" && path === "/run") {
      const apiKey = await getRealApiKey(env);
      if (!apiKey) return jsonResponse({ ok: false, error: "could_not_load_real_db_api_key" });
      const headers = new Headers({ accept: "application/json", "user-agent": "AlphaDog-v2-TempProbe/1.0", "X-API-Key": apiKey });

      let noFilterTest = null;
      try {
        const r = await fetch(`${DEFAULT_PARLAY_API_BASE_URL}/sports/baseball_mlb/props?limit=3000`, { headers, signal: AbortSignal.timeout(20000) });
        const text = await r.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        const rows = Array.isArray(json) ? json : [];
        const bookmakerCounts = {};
        for (const row of rows) { const bm = row && row.bookmaker; if (bm) bookmakerCounts[bm] = (bookmakerCounts[bm] || 0) + 1; }
        noFilterTest = { http_status: r.status, total_rows: rows.length, bookmaker_counts: bookmakerCounts, preview_if_error: rows.length ? undefined : text.slice(0, 500) };
      } catch (err) { noFilterTest = { error: String(err && err.message ? err.message : err) }; }

      let filterTest = null;
      try {
        const r = await fetch(`${DEFAULT_PARLAY_API_BASE_URL}/sports/baseball_mlb/props?bookmakers=sleeper&limit=10`, { headers, signal: AbortSignal.timeout(15000) });
        const text = await r.text();
        filterTest = { http_status: r.status, preview: text.slice(0, 500) };
      } catch (err) { filterTest = { error: String(err && err.message ? err.message : err) }; }

      return jsonResponse({ ok: true, worker_name: WORKER_NAME, version: VERSION, key_source: "real_database_key", noFilterTest, filterTest, timestamp_utc: nowUtc() });
    }

    return jsonResponse({ ok: false, status: "NOT_FOUND" }, 404);
  }
};
