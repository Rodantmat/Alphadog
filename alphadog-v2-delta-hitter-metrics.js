const WORKER_NAME = "alphadog-v2-delta-hitter-metrics";
const LOGICAL_WORKER_NAME = "alphadog-v2-gemini-historical-prop-probe";
const VERSION = "alphadog-v2-gemini-historical-prop-probe-v0.1.0";
const JOB_KEY = "gemini-historical-prop-probe";

// Real, safe, read-only probe - tests whether Gemini + Google Search grounding can actually find
// and accurately extract a real historical MLB player-prop line, checked against a REAL, KNOWN
// ground-truth answer already confirmed via The Odds API live probe earlier this session
// (Ronald Acuna Jr., Doubles Over 0.5 @ +11 FanDuel, Braves @ Rockies, 2025-06-15). Reuses the
// exact real Gemini call pattern already live in alphadog-v2-daily-usage-pulse.js (same model,
// same google_search tool, same auth) - no new secret, no new integration risk.

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB"];
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_TIMEOUT_MS = 15000;

function nowUtc() { return new Date().toISOString(); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function bindingPresence(env, names) { const out = {}; for (const n of names) out[n] = Boolean(env && env[n]); return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }

async function runProbe(env, input) {
  if (!env.GEMINI_API_KEY) return { ok: false, data_ok: false, error: "gemini_api_key_not_configured" };

  const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : input;
  const prompt = String(inputJson.prompt || `What was the FanDuel player-prop betting line for Ronald Acuna Jr. Doubles (Over/Under) for the real MLB game between the Atlanta Braves and Colorado Rockies on 2025-06-15? I need the real, specific line value (e.g. Over 0.5) and the real American odds price for the Over side, from a real, specific, cited source - not a general estimate. Respond with ONLY a single JSON object, no other text, no markdown fences, in exactly this shape: {"found": true or false, "line_value": number or null, "over_price_american": number or null, "source_url": string or null, "source_note": a short plain-text note on where this came from or why it's unknown, "confidence": "high" or "low" or "unknown"}. If you cannot find a real, specific, sourced answer, set found to false rather than inventing a plausible-looking number.`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("gemini_probe_timeout"), GEMINI_TIMEOUT_MS);
  const started = Date.now();
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return { ok: true, data_ok: false, version: VERSION, worker_name: LOGICAL_WORKER_NAME, job_key: JOB_KEY, status: "gemini_call_failed", certification: "GEMINI_HISTORICAL_PROP_PROBE_FAILED", http_status: resp.status, error_preview: String(errText || "").slice(0, 500), elapsed_ms: Date.now() - started, timestamp_utc: nowUtc() };
    }
    const data = await resp.json();
    const cand = data && data.candidates && data.candidates[0];
    const text = cand && cand.content && cand.content.parts && cand.content.parts[0] ? cand.content.parts[0].text : "";
    const groundingMeta = cand && cand.groundingMetadata ? cand.groundingMetadata : null;
    const realSearchQueriesUsed = groundingMeta && groundingMeta.webSearchQueries ? groundingMeta.webSearchQueries : [];
    const realGroundingSources = groundingMeta && groundingMeta.groundingChunks ? groundingMeta.groundingChunks.map(c => c.web && c.web.uri).filter(Boolean) : [];
    const cleaned = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    let parsed = null;
    try { parsed = JSON.parse(cleaned); } catch (_) {}

    return {
      ok: true, data_ok: true, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
      request_id: input.request_id || null, chain_id: input.chain_id || null,
      status: "completed", certification: "GEMINI_HISTORICAL_PROP_PROBE_COMPLETED",
      real_known_ground_truth: { player: "Ronald Acuna Jr.", market: "batter_doubles", line: 0.5, side: "Over", real_price_american: 11, real_bookmaker: "fanduel", real_source: "The Odds API historical event-odds, verified live earlier this session" },
      gemini_raw_text: text,
      gemini_parsed_response: parsed,
      real_search_queries_executed: realSearchQueriesUsed,
      real_grounding_source_urls: realGroundingSources,
      external_calls_performed: 1,
      elapsed_ms: Date.now() - started,
      no_scoring: true, no_ranking: true, no_final_board: true,
      timestamp_utc: nowUtc()
    };
  } catch (err) {
    clearTimeout(timer);
    return { ok: true, data_ok: false, version: VERSION, worker_name: LOGICAL_WORKER_NAME, job_key: JOB_KEY, status: "gemini_call_exception", certification: "GEMINI_HISTORICAL_PROP_PROBE_EXCEPTION", error: String(err && err.message ? err.message : err), elapsed_ms: Date.now() - started, timestamp_utc: nowUtc() };
  }
}

function baseIdentity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  return {
    ok: true, data_ok: true, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    status: "GEMINI_PROBE_READY", timestamp_utc: nowUtc(),
    notes: ["Real, read-only probe - asks Gemini (with Google Search grounding) to find a real historical MLB player-prop line already independently verified via The Odds API, to honestly check accuracy.", "POST /run"],
    binding_summary: { required_db_bindings_present: allTrue(db), gemini_key_present: Boolean(env.GEMINI_API_KEY) }
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();
    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));
    if (method === "GET" && path === "/health") return jsonResponse({ ...baseIdentity(env), route: "/health" });
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        const output = await runProbe(env, input);
        return jsonResponse(output, output.ok ? 200 : 400);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: LOGICAL_WORKER_NAME, error: String(err && err.stack ? err.stack : err) }, 500);
      }
    }
    return jsonResponse({ ok: false, error: "not_found", allowed_routes: ["GET /", "GET /health", "POST /run"] }, 404);
  }
};
