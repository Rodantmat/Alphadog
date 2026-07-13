const WORKER_NAME = "alphadog-v2-delta-hitter-metrics";
const LOGICAL_WORKER_NAME = "alphadog-v2-gemini-deep-test";
const VERSION = "alphadog-v2-gemini-deep-test-v0.2.0";
const JOB_KEY = "gemini-deep-test";

// Real, safe, read-only, multi-strategy test - tries several genuinely different prompting
// approaches to see if ANY of them can extract usable historical MLB player-prop market data
// from Gemini + Google Search grounding, rather than relying on one direct-ask attempt.

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB"];
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_TIMEOUT_MS = 20000;

function nowUtc() { return new Date().toISOString(); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function bindingPresence(env, names) { const out = {}; for (const n of names) out[n] = Boolean(env && env[n]); return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }

const STRATEGIES = [
  {
    key: "recap_article_repeat_date2",
    label: "Repeat recap-article strategy on a DIFFERENT real date (repeatability check)",
    prompt: `Find a real sports betting recap or "prop bets today" article from a site like DocSports, RotoBaller, Lineups.com, or SI Betting, that discusses MLB player props from real games on 2025-08-01. I'm looking for a real article that quotes actual player-prop line values (like "Over 1.5 total bases") for a specific real player. Respond with ONLY a single JSON object: {"found": true or false, "answer": string or null, "source_url": string or null, "source_note": string, "confidence": "high" or "low" or "unknown"}.`
  },
  {
    key: "recap_article_multi_player_same_date",
    label: "Ask for MULTIPLE players' real props from one recap article (efficiency test)",
    prompt: `Find a real MLB player-props recap/picks article (from DocSports, RotoBaller, Lineups.com, SI Betting, or similar) covering real games on 2025-06-15. List EVERY real player-prop line value you can find in that one real article (player name, prop type, line value - not just one player). Respond with ONLY a single JSON object: {"found": true or false, "answer": string or null (list all real props found, semicolon separated), "source_url": string or null, "source_note": string, "confidence": "high" or "low" or "unknown"}.`
  },
  {
    key: "docsports_direct_site_search",
    label: "Search DocSports.com directly by name (since it's confirmed to work) for a new date",
    prompt: `Search specifically on docsports.com for a real MLB player prop picks article for games on 2025-07-08. Tell me the real player name(s), prop type(s), and line value(s) mentioned in that specific real article if you can find it. Respond with ONLY a single JSON object: {"found": true or false, "answer": string or null, "source_url": string or null, "source_note": string, "confidence": "high" or "low" or "unknown"}.`
  },
  {
    key: "pitcher_strikeout_prop_recap",
    label: "Try a different prop category: pitcher strikeout recap articles",
    prompt: `Find a real sports betting article discussing pitcher strikeout prop bets for a real MLB starting pitcher on 2025-06-15 (any real game that day). I need the real pitcher's name and the real strikeout line value (e.g. "Over 5.5 strikeouts") from a real, specific source. Respond with ONLY a single JSON object: {"found": true or false, "answer": string or null, "source_url": string or null, "source_note": string, "confidence": "high" or "low" or "unknown"}.`
  },
  {
    key: "batch_five_dates_one_call",
    label: "Efficiency test: ask for real props across 5 different dates in ONE call",
    prompt: `For each of these 5 real MLB dates in 2025 - 2025-04-10, 2025-05-01, 2025-06-01, 2025-07-01, 2025-08-01 - try to find one real MLB player-prop recap/picks article (DocSports, RotoBaller, Lineups.com, SI Betting, etc.) and report one real specific player-prop line value from each if you can find it. Respond with ONLY a single JSON object: {"found": true or false, "answer": string or null (one line per date, real findings only), "source_url": string or null (best one), "source_note": string, "confidence": "high" or "low" or "unknown"}.`
  }
];


async function callGemini(env, prompt) {
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
      return { ok: false, http_status: resp.status, error_preview: String(errText || "").slice(0, 400), elapsed_ms: Date.now() - started };
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
    return { ok: true, http_status: resp.status, raw_text: text, parsed, real_search_queries_executed: realSearchQueriesUsed, real_grounding_source_urls: realGroundingSources, elapsed_ms: Date.now() - started };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, error: String(err && err.message ? err.message : err), elapsed_ms: Date.now() - started };
  }
}

async function runDeepTest(env, input) {
  if (!env.GEMINI_API_KEY) return { ok: false, data_ok: false, error: "gemini_api_key_not_configured" };
  const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : input;
  const onlyKeys = Array.isArray(inputJson.strategy_keys) && inputJson.strategy_keys.length ? new Set(inputJson.strategy_keys) : null;
  const strategiesToRun = onlyKeys ? STRATEGIES.filter(s => onlyKeys.has(s.key)) : STRATEGIES;

  const results = [];
  for (const strat of strategiesToRun) {
    const res = await callGemini(env, strat.prompt);
    results.push({
      strategy_key: strat.key,
      strategy_label: strat.label,
      call_ok: res.ok,
      http_status: res.http_status || null,
      error: res.error || res.error_preview || null,
      gemini_parsed_response: res.parsed || null,
      gemini_raw_text: res.raw_text || null,
      real_search_queries_executed: res.real_search_queries_executed || [],
      real_grounding_source_urls: res.real_grounding_source_urls || [],
      elapsed_ms: res.elapsed_ms
    });
  }

  const foundCount = results.filter(r => r.gemini_parsed_response && r.gemini_parsed_response.found === true).length;

  return {
    ok: true, data_ok: true, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    request_id: input.request_id || null, chain_id: input.chain_id || null,
    status: "completed", certification: "GEMINI_DEEP_TEST_COMPLETED",
    strategies_run: results.length,
    strategies_reporting_found_true: foundCount,
    results,
    external_calls_performed: results.length,
    no_scoring: true, no_ranking: true, no_final_board: true,
    timestamp_utc: nowUtc()
  };
}

function baseIdentity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  return {
    ok: true, data_ok: true, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    status: "GEMINI_DEEP_TEST_READY", timestamp_utc: nowUtc(),
    notes: ["Real, read-only, multi-strategy probe - tries 6 different real prompting approaches to see if any can extract usable historical MLB prop data via Gemini + Google Search grounding.", "POST /run, optionally with input_json.strategy_keys to run a subset."],
    strategy_keys_available: STRATEGIES.map(s => s.key),
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
        const output = await runDeepTest(env, input);
        return jsonResponse(output, output.ok ? 200 : 400);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: LOGICAL_WORKER_NAME, error: String(err && err.stack ? err.stack : err) }, 500);
      }
    }
    return jsonResponse({ ok: false, error: "not_found", allowed_routes: ["GET /", "GET /health", "POST /run"] }, 404);
  }
};
