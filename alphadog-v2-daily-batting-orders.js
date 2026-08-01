import postgres from "postgres";

// TEMPORARY PROBE - overwriting a confirmed dummy/unused worker (alphadog-v2-daily-batting-orders,
// version "dummy-workers-v0.1", never wired into any real pipeline stage) purely to safely check
// the ParlayAPI /v1/bookmakers list, without touching the real, live parlay-sleeper-board worker
// at all. To be reverted back to the original dummy stub after use.
const WORKER_NAME = "alphadog-v2-daily-batting-orders";
const VERSION = "TEMP_PROBE_bookmakers_list_v1";
const JOB_KEY = "daily-batting-orders";
const DEFAULT_PARLAY_API_BASE_URL = "https://parlay-api.com/v1";

function nowUtc() { return new Date().toISOString(); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function pgClient(env) { return postgres(env.HYPERDRIVE.connectionString, { max: 2, fetch_types: false, prepare: false, connect_timeout: 8 }); }

async function getApiKey(env) {
  if (env.HYPERDRIVE) {
    const client = pgClient(env);
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
  }
  return env.PARLAY_API_KEY ? String(env.PARLAY_API_KEY) : null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "GET" && (path === "/" || path === "/health")) {
      return jsonResponse({ ok: true, worker_name: WORKER_NAME, version: VERSION, status: "TEMP_PROBE_READY", note: "Temporary bookmakers-list probe. Does not touch the real Sleeper worker." });
    }

    if (method === "POST" && path === "/run") {
      const apiKey = await getApiKey(env);
      if (!apiKey) {
        return jsonResponse({ ok: false, error: "no_api_key_found", timestamp_utc: nowUtc() });
      }
      const headers = new Headers({ accept: "application/json", "user-agent": "AlphaDog-v2-TempBookmakersProbe/1.0", "X-API-Key": apiKey });
      const results = {};

      // 1. Fetch the canonical bookmakers list, as the API's own error message directed.
      try {
        const resp = await fetch(`${DEFAULT_PARLAY_API_BASE_URL}/bookmakers`, { method: "GET", headers, signal: AbortSignal.timeout(15000) });
        const text = await resp.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        results.bookmakers_list = { http_status: resp.status, body_len: text.length, parsed: json, raw_preview: json ? null : text.slice(0, 2000) };
      } catch (err) {
        results.bookmakers_list = { error: String(err && err.message ? err.message : err) };
      }

      // 2. Try a handful of likely alternate keys for Sleeper directly against the real props
      //    endpoint, in case the rename is simple (e.g. sleeper_dfs) rather than a full removal.
      const candidateKeys = ["sleeper", "sleeper_dfs", "sleeperdfs", "sleeper_picks", "sleeperpicks", "dfs_sleeper"];
      results.candidate_probes = {};
      for (const key of candidateKeys) {
        try {
          const testUrl = `${DEFAULT_PARLAY_API_BASE_URL}/sports/baseball_mlb/props?bookmakers=${encodeURIComponent(key)}&limit=5`;
          const resp = await fetch(testUrl, { method: "GET", headers, signal: AbortSignal.timeout(10000) });
          const text = await resp.text();
          results.candidate_probes[key] = { http_status: resp.status, body_len: text.length, preview: text.slice(0, 300) };
        } catch (err) {
          results.candidate_probes[key] = { error: String(err && err.message ? err.message : err) };
        }
      }

      return jsonResponse({ ok: true, worker_name: WORKER_NAME, version: VERSION, results, timestamp_utc: nowUtc() });
    }

    return jsonResponse({ ok: false, status: "NOT_FOUND", allowed_routes: ["GET /health", "POST /run"] }, 404);
  }
};
