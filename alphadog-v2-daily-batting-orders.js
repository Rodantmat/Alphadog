// TEMPORARY PROBE v5 - test /props with no bookmaker filter vs explicit sleeper filter,
// per official docs: "/props call returns ALL books for that sport" - so maybe filtering
// by bookmakers=sleeper specifically is where the issue lives, not sleeper's existence.
const WORKER_NAME = "alphadog-v2-daily-batting-orders";
const VERSION = "TEMP_PROBE_v5";
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
      return jsonResponse({ ok: true, worker_name: WORKER_NAME, version: VERSION, api_key_present: !!env.PARLAY_API_KEY });
    }

    if (method === "POST" && path === "/run") {
      const apiKey = env.PARLAY_API_KEY ? String(env.PARLAY_API_KEY) : null;
      if (!apiKey) return jsonResponse({ ok: false, error: "no_api_key" });
      const headers = new Headers({ accept: "application/json", "user-agent": "AlphaDog-v2-TempProbe/1.0", "X-API-Key": apiKey });

      // Test A: /props with NO bookmakers filter at all - does sleeper data appear in the unfiltered set?
      let noFilterTest = null;
      try {
        const r = await fetch(`${DEFAULT_PARLAY_API_BASE_URL}/sports/baseball_mlb/props?limit=2000`, { headers, signal: AbortSignal.timeout(20000) });
        const text = await r.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        const rows = Array.isArray(json) ? json : [];
        const bookmakerCounts = {};
        for (const row of rows) { const bm = row && row.bookmaker; if (bm) bookmakerCounts[bm] = (bookmakerCounts[bm] || 0) + 1; }
        noFilterTest = { http_status: r.status, total_rows: rows.length, bookmaker_counts: bookmakerCounts };
      } catch (err) { noFilterTest = { error: String(err && err.message ? err.message : err) }; }

      // Test B: explicit bookmakers=sleeper filter (what our real worker does)
      let filterTest = null;
      try {
        const r = await fetch(`${DEFAULT_PARLAY_API_BASE_URL}/sports/baseball_mlb/props?bookmakers=sleeper&limit=10`, { headers, signal: AbortSignal.timeout(15000) });
        const text = await r.text();
        filterTest = { http_status: r.status, preview: text.slice(0, 400) };
      } catch (err) { filterTest = { error: String(err && err.message ? err.message : err) }; }

      // Test C: bookmakers filter but as part of a comma list with a KNOWN-good book, to see if the multi-value form works differently
      let comboFilterTest = null;
      try {
        const r = await fetch(`${DEFAULT_PARLAY_API_BASE_URL}/sports/baseball_mlb/props?bookmakers=draftkings,sleeper&limit=10`, { headers, signal: AbortSignal.timeout(15000) });
        const text = await r.text();
        comboFilterTest = { http_status: r.status, preview: text.slice(0, 400) };
      } catch (err) { comboFilterTest = { error: String(err && err.message ? err.message : err) }; }

      return jsonResponse({ ok: true, worker_name: WORKER_NAME, version: VERSION, noFilterTest, filterTest, comboFilterTest, timestamp_utc: nowUtc() });
    }

    return jsonResponse({ ok: false, status: "NOT_FOUND" }, 404);
  }
};
