// TEMPORARY PROBE v3 - compact output to avoid truncation, only returns bookmaker keys/titles
// and candidate-probe results, not full per-bookmaker detail.
const WORKER_NAME = "alphadog-v2-daily-batting-orders";
const VERSION = "TEMP_PROBE_bookmakers_list_v3";
const JOB_KEY = "daily-batting-orders";
const DEFAULT_PARLAY_API_BASE_URL = "https://parlay-api.com/v1";

function nowUtc() { return new Date().toISOString(); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "GET" && (path === "/" || path === "/health")) {
      return jsonResponse({ ok: true, worker_name: WORKER_NAME, version: VERSION, status: "TEMP_PROBE_READY", api_key_present: !!env.PARLAY_API_KEY });
    }

    if (method === "POST" && path === "/run") {
      const apiKey = env.PARLAY_API_KEY ? String(env.PARLAY_API_KEY) : null;
      if (!apiKey) return jsonResponse({ ok: false, error: "no_api_key_found_in_env" });
      const headers = new Headers({ accept: "application/json", "user-agent": "AlphaDog-v2-TempBookmakersProbe/1.0", "X-API-Key": apiKey });
      const results = {};

      try {
        const resp = await fetch(`${DEFAULT_PARLAY_API_BASE_URL}/bookmakers`, { method: "GET", headers, signal: AbortSignal.timeout(15000) });
        const text = await resp.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        const list = Array.isArray(json) ? json : (json && Array.isArray(json.bookmakers) ? json.bookmakers : (json && Array.isArray(json.data) ? json.data : []));
        results.bookmakers = {
          http_status: resp.status,
          total_count: list.length,
          all_keys_and_titles: list.map(b => ({ key: b.key, title: b.title, status: b.status })),
          sleeper_matches: list.filter(b => /sleeper/i.test(JSON.stringify(b)))
        };
      } catch (err) {
        results.bookmakers = { error: String(err && err.message ? err.message : err) };
      }

      const candidateKeys = ["sleeper", "sleeper_dfs", "sleeperdfs", "sleeper_picks", "sleeperpicks", "dfs_sleeper"];
      results.candidate_probes = {};
      for (const key of candidateKeys) {
        try {
          const testUrl = `${DEFAULT_PARLAY_API_BASE_URL}/sports/baseball_mlb/props?bookmakers=${encodeURIComponent(key)}&limit=5`;
          const resp = await fetch(testUrl, { method: "GET", headers, signal: AbortSignal.timeout(10000) });
          const text = await resp.text();
          results.candidate_probes[key] = { http_status: resp.status, preview: text.slice(0, 200) };
        } catch (err) {
          results.candidate_probes[key] = { error: String(err && err.message ? err.message : err) };
        }
      }

      return jsonResponse({ ok: true, worker_name: WORKER_NAME, version: VERSION, results, timestamp_utc: nowUtc() });
    }

    return jsonResponse({ ok: false, status: "NOT_FOUND" }, 404);
  }
};
