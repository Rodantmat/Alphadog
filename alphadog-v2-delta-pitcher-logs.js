const WORKER_NAME = "alphadog-v2-delta-pitcher-logs";
const LOGICAL_WORKER_NAME = "alphadog-v2-oddspapi-mlb-historical-props-probe";
const VERSION = "alphadog-v2-oddspapi-probe-v0.1.0";
const JOB_KEY = "oddspapi-mlb-historical-props-probe";

// Real, safe, read-only probe worker - answers one real question with one real API call:
// does OddsPapi.io's free-tier historical-odds endpoint actually have real MLB player-prop
// coverage reaching back into the 2025 season (not just a recent rolling window)?
// Reads the already-configured, real oddspapi_api_key from CONFIG_DB.config_external_credentials
// server-side only - the raw key value is never returned in any response.

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB"];
const ODDSPAPI_BASE_URL = "https://api.oddspapi.io/v4";
const MLB_SPORT_ID = 13;

function nowUtc() { return new Date().toISOString(); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function bindingPresence(env, names) { const out = {}; for (const n of names) out[n] = Boolean(env && env[n]); return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }

async function first(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  const res = binds.length ? await stmt.bind(...binds).first() : await stmt.first();
  return res || null;
}

async function fetchJson(url) {
  try {
    const resp = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20000) });
    const text = await resp.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { ok: resp.ok, http_status: resp.status, json, raw_len: text.length, raw_text_safe: text.slice(0, 500) };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

async function runProbe(env, input) {
  const cred = await first(env.CONFIG_DB, "SELECT password FROM config_external_credentials WHERE credential_key='oddspapi_api_key'");
  const apiKey = cred && cred.password ? String(cred.password) : null;
  if (!apiKey) {
    return { ok: false, data_ok: false, error: "no_oddspapi_api_key_configured", note: "Expected a row in CONFIG_DB.config_external_credentials with credential_key='oddspapi_api_key'" };
  }

  // Real, minimal sanity check FIRST: is the key valid at the account level at all?
  const accountUrl = `${ODDSPAPI_BASE_URL}/account?apiKey=${encodeURIComponent(apiKey)}`;
  const accountRes = await fetchJson(accountUrl);

  // Also try the sports endpoint (should be the lowest-friction real endpoint - just a list, no filters)
  const sportsUrl = `${ODDSPAPI_BASE_URL}/sports?apiKey=${encodeURIComponent(apiKey)}`;
  const sportsRes = await fetchJson(sportsUrl);

  // Real, new endpoint from official docs shared by the user - test independently, different endpoint entirely
  const settlementsUrl = `${ODDSPAPI_BASE_URL}/settlements?apiKey=${encodeURIComponent(apiKey)}&fixtureId=id1000000761280685`;
  const settlementsRes = await fetchJson(settlementsUrl);

  const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
  const fromDate = String(inputJson.from_date || "2025-06-01");
  const toDate = String(inputJson.to_date || "2025-06-08");

  // Step 1: real, minimal, free fixtures call for a real, narrow 2025 MLB date window
  const fixturesUrl = `${ODDSPAPI_BASE_URL}/fixtures?apiKey=${encodeURIComponent(apiKey)}&sportId=${MLB_SPORT_ID}&from=${fromDate}&to=${toDate}`;
  const fixturesRes = await fetchJson(fixturesUrl);
  if (!fixturesRes.ok || !Array.isArray(fixturesRes.json)) {
    return { ok: true, data_ok: false, version: VERSION, worker_name: LOGICAL_WORKER_NAME, job_key: JOB_KEY, status: "fixtures_call_failed", certification: "ODDSPAPI_PROBE_FIXTURES_FAILED", http_status: fixturesRes.http_status, error: fixturesRes.error || "non_array_response", raw_len: fixturesRes.raw_len || 0, raw_text_safe: fixturesRes.raw_text_safe || null, account_check: { http_status: accountRes.http_status, ok: accountRes.ok, raw_preview: accountRes.raw_text_safe }, sports_check: { http_status: sportsRes.http_status, ok: sportsRes.ok, raw_preview: sportsRes.raw_text_safe, is_array: Array.isArray(sportsRes.json) }, settlements_check: { http_status: settlementsRes.http_status, ok: settlementsRes.ok, raw_preview: settlementsRes.raw_text_safe }, external_calls_performed: 4, no_scoring: true, no_ranking: true, no_final_board: true, timestamp_utc: nowUtc() };
  }
  const fixtures = fixturesRes.json;
  const withOdds = fixtures.filter(f => f && f.hasOdds);
  const sampleFixture = withOdds[0] || fixtures[0] || null;

  let historicalRes = null;
  let historicalSummary = null;
  if (sampleFixture && sampleFixture.fixtureId) {
    const histUrl = `${ODDSPAPI_BASE_URL}/historical-odds?apiKey=${encodeURIComponent(apiKey)}&fixtureId=${encodeURIComponent(sampleFixture.fixtureId)}`;
    historicalRes = await fetchJson(histUrl);
    if (historicalRes.ok && historicalRes.json) {
      const bookmakers = historicalRes.json.bookmakers ? Object.keys(historicalRes.json.bookmakers) : [];
      let totalMarkets = 0, totalOutcomes = 0, totalPricePoints = 0, sampleTimestamps = [];
      for (const bk of bookmakers) {
        const markets = historicalRes.json.bookmakers[bk] && historicalRes.json.bookmakers[bk].markets ? historicalRes.json.bookmakers[bk].markets : {};
        for (const marketId of Object.keys(markets)) {
          totalMarkets += 1;
          const outcomes = markets[marketId].outcomes || {};
          for (const outcomeId of Object.keys(outcomes)) {
            totalOutcomes += 1;
            const players = outcomes[outcomeId].players || {};
            for (const playerIdx of Object.keys(players)) {
              const entries = Array.isArray(players[playerIdx]) ? players[playerIdx] : [players[playerIdx]];
              totalPricePoints += entries.length;
              for (const e of entries) { if (e && e.createdAt && sampleTimestamps.length < 5) sampleTimestamps.push(e.createdAt); }
            }
          }
        }
      }
      historicalSummary = { bookmakers, total_markets: totalMarkets, total_outcomes: totalOutcomes, total_price_points: totalPricePoints, sample_timestamps: sampleTimestamps };
    }
  }

  return {
    ok: true, data_ok: true, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    request_id: input.request_id || null, chain_id: input.chain_id || null,
    status: "completed", certification: "ODDSPAPI_MLB_HISTORICAL_PROPS_PROBE_COMPLETED",
    account_check: { http_status: accountRes.http_status, ok: accountRes.ok, raw_preview: accountRes.raw_text_safe },
    sports_check: { http_status: sportsRes.http_status, ok: sportsRes.ok, raw_preview: sportsRes.raw_text_safe, is_array: Array.isArray(sportsRes.json), count: Array.isArray(sportsRes.json) ? sportsRes.json.length : null },
    settlements_check: { http_status: settlementsRes.http_status, ok: settlementsRes.ok, raw_preview: settlementsRes.raw_text_safe },
    real_probe_window: { from_date: fromDate, to_date: toDate },
    real_fixtures_found: fixtures.length,
    real_fixtures_with_odds: withOdds.length,
    sample_fixture: sampleFixture ? { fixtureId: sampleFixture.fixtureId, participant1Name: sampleFixture.participant1Name, participant2Name: sampleFixture.participant2Name, startTime: sampleFixture.startTime, hasOdds: sampleFixture.hasOdds, statusName: sampleFixture.statusName } : null,
    historical_call_ok: historicalRes ? historicalRes.ok : null,
    historical_http_status: historicalRes ? historicalRes.http_status : null,
    historical_summary: historicalSummary,
    external_calls_performed: sampleFixture ? 2 : 1,
    api_key_value_never_returned: true,
    no_scoring: true, no_ranking: true, no_final_board: true,
    timestamp_utc: nowUtc()
  };
}

function baseIdentity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  return {
    ok: true, data_ok: true, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    status: "ODDSPAPI_PROBE_READY", timestamp_utc: nowUtc(),
    notes: ["Real, read-only, single-purpose probe of OddsPapi.io's free-tier historical odds endpoint for real 2025 MLB player-prop depth.", "POST /run with input_json: { from_date: '2025-06-01', to_date: '2025-06-08' }"],
    binding_summary: { required_db_bindings_present: allTrue(db) }
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
