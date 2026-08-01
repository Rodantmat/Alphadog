// TEMPORARY PROBE v4 - only returns the sleeper-specific candidate probe results.
const WORKER_NAME = "alphadog-v2-daily-batting-orders";
const VERSION = "TEMP_PROBE_bookmakers_list_v4";
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

      // 1. Sleeper's own entry in the bookmakers list, in full, to see its exact metadata
      let sleeperEntry = null;
      try {
        const resp = await fetch(`${DEFAULT_PARLAY_API_BASE_URL}/bookmakers`, { method: "GET", headers, signal: AbortSignal.timeout(15000) });
        const json = await resp.json();
        const list = Array.isArray(json) ? json : (json.bookmakers || json.data || []);
        sleeperEntry = list.find(b => String(b.key).toLowerCase() === "sleeper") || null;
      } catch (err) { sleeperEntry = { error: String(err && err.message ? err.message : err) }; }

      // 2. Direct test: exact same request our real worker makes
      let directTest = null;
      try {
        const testUrl = `${DEFAULT_PARLAY_API_BASE_URL}/sports/baseball_mlb/props?bookmakers=sleeper&limit=10000&dfsOdds=effective`;
        const resp = await fetch(testUrl, { method: "GET", headers, signal: AbortSignal.timeout(15000) });
        const text = await resp.text();
        directTest = { http_status: resp.status, body_preview: text.slice(0, 500) };
      } catch (err) { directTest = { error: String(err && err.message ? err.message : err) }; }

      // 3. Same request but WITHOUT dfsOdds=effective, in case that param is the actual culprit
      let noDfsOddsTest = null;
      try {
        const testUrl = `${DEFAULT_PARLAY_API_BASE_URL}/sports/baseball_mlb/props?bookmakers=sleeper&limit=10`;
        const resp = await fetch(testUrl, { method: "GET", headers, signal: AbortSignal.timeout(15000) });
        const text = await resp.text();
        noDfsOddsTest = { http_status: resp.status, body_preview: text.slice(0, 500) };
      } catch (err) { noDfsOddsTest = { error: String(err && err.message ? err.message : err) }; }

      return jsonResponse({ ok: true, worker_name: WORKER_NAME, version: VERSION, sleeperEntry, directTest, noDfsOddsTest, timestamp_utc: nowUtc() });
    }

    return jsonResponse({ ok: false, status: "NOT_FOUND" }, 404);
  }
};
