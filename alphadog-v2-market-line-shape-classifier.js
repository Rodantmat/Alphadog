import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-market-line-shape-classifier";
const VERSION = "alphadog-v2-market-line-shape-classifier-v0.3.0-postgres-rewire";
const JOB_KEY = "market-line-shape-classifier";
const MODE_HITTER = "market_hitter_prop_line_context";
const MODE_PITCHER = "market_pitcher_prop_line_context";
const MODE = MODE_HITTER;
const PARLAY_SOURCE_KEY = "parlay_api_hitter_props";
const LEGACY_PARLAY_SOURCE_KEYS = ["parlay_api_sleeper_hitter_props", "parlay_api_hitter_props"];
const MAX_PREPARED_ROWS = 9000;
const MAX_PARLAY_ROWS = 20000;
const DEFAULT_PARLAY_API_BASE_URL = "https://parlay-api.com/v1";
const DEFAULT_PARLAY_PROPS_ENDPOINT = "/sports/baseball_mlb/props";
const DEFAULT_PARLAY_ODDS_ENDPOINT = "/sports/baseball_mlb/odds";
const PARLAY_HITTER_MARKETS = ["player_hits", "player_rbis", "player_runs", "player_singles", "player_doubles", "player_triples", "player_home_runs", "player_total_bases", "player_hits_runs_rbis", "player_stolen_bases", "player_walks", "player_bat_walks", "player_hitter_strikeouts", "player_bat_strike_outs"];
const PARLAY_HITTER_ODDS_MARKETS = ["player_hits", "player_rbis", "player_runs", "player_singles", "player_doubles", "player_triples", "player_home_runs", "player_total_bases", "player_hits_runs_rbis", "player_stolen_bases", "player_walks", "player_hitter_strikeouts", "batter_home_runs", "batter_hits", "batter_total_bases", "batter_rbis", "batter_runs", "batter_hits_runs_rbis", "batter_stolen_bases"];
const PARLAY_PITCHER_MARKETS = ["player_strikeouts", "player_pitcher_strikeouts", "pitcher_strikeouts", "player_pitcher_outs", "pitcher_outs", "player_outs", "player_outs_recorded", "pitcher_outs_recorded", "player_hits_allowed", "pitcher_hits_allowed", "player_walks_allowed", "pitcher_walks_allowed", "player_earned_runs", "player_earned_runs_allowed", "pitcher_earned_runs", "pitcher_earned_runs_allowed", "player_runs_allowed", "pitcher_runs_allowed"];
const PARLAY_PITCHER_ODDS_MARKETS = PARLAY_PITCHER_MARKETS;
const PARLAY_MARKETS = PARLAY_HITTER_MARKETS;
const PARLAY_ODDS_MARKETS = PARLAY_HITTER_ODDS_MARKETS;
const PARLAY_PAGE_LIMIT = 10000;
const PARLAY_MAX_PAGES = 4;
const PARLAY_MAX_DISCOVERY_PROBES = 14;
const PARLAY_FETCH_TIMEOUT_MS = 9000;
const PARLAY_TOTAL_FETCH_BUDGET_MS = 240000;
const MARKET_FULL_WORKER_SOFT_DEADLINE_MS = 260000;
const MARKET_FULL_BACKEND_FETCH_BUDGET_MS = 20000;
const MARKET_FULL_BACKEND_FETCH_TIMEOUT_MS = 24000;
const MARKET_FULL_BACKEND_MAX_NORMALIZED_PARLAY_ROWS = 5200;
const MARKET_FULL_BACKEND_MAX_PROP_EVIDENCE_ROWS = 2800;
const MARKET_FULL_BACKEND_BATCH_CHUNK_SIZE = 300;
const PARLAY_OWNED_BOOKS_EXCLUDED_FROM_DECISION = ["prizepicks", "sleeper"];
const PARLAY_PICKEM_BOOKS_QUARANTINE = ["underdog", "betr", "pick6", "parlayplay", "dabble"];
const PARLAY_PICKEM_BOOKS_COMPARISON = ["underdog", "pick6"];
const PARLAY_PRIMARY_BOOK_GROUPS = [
  { probe_id: "props_core_us_books", endpoint_kind: "props", bookmakers: ["draftkings", "fanduel", "fanatics", "betmgm", "caesars", "espnbet", "betrivers", "pointsbet", "hardrockbet", "fliff"] },
  { probe_id: "props_secondary_and_international_books", endpoint_kind: "props", bookmakers: ["bet365", "bovada", "pinnacle", "williamhill_us", "betus", "lowvig"] },
  { probe_id: "props_exchange_books", endpoint_kind: "props", bookmakers: ["novig", "prophetx", "kalshi"] },
  { probe_id: "props_pickem_quarantine_books", endpoint_kind: "props", bookmakers: PARLAY_PICKEM_BOOKS_QUARANTINE }
];
const PARLAY_CORE_FALLBACK_BOOKS = ["draftkings", "fanduel", "fanatics", "betmgm", "caesars", "espnbet", "betrivers", "bet365", "bovada", "novig", "prophetx"];
const PARLAY_ODDS_ENDPOINT_BOOK_GROUPS = [
  { probe_id: "odds_core_us_books", endpoint_kind: "odds", bookmakers: ["draftkings", "fanduel", "fanatics", "betmgm", "caesars", "espnbet", "betrivers"] },
  { probe_id: "odds_exchange_secondary_books", endpoint_kind: "odds", bookmakers: ["bet365", "bovada", "novig", "prophetx", "pinnacle"] }
];

const EXPECTED_SECRETS = ["PARLAY_API_KEY"];
const HITTER_PROP_KEYS = ["doubles", "hits", "hits_runs_rbis", "hitter_strikeouts", "home_runs", "rbis", "runs", "singles", "stolen_bases", "total_bases", "triples", "walks"];
const PITCHER_PROP_KEYS = ["earned_runs", "hits_allowed", "pitcher_outs", "pitcher_strikeouts", "pitcher_strikeouts_combo", "runs_allowed", "walks_allowed"];
const HITTER_MARKET_KEY_TO_PROP = {
  player_hits: "hits", hits: "hits", player_rbis: "rbis", player_rbi: "rbis", rbis: "rbis", player_runs: "runs", runs: "runs",
  player_singles: "singles", singles: "singles", player_doubles: "doubles", doubles: "doubles", player_triples: "triples", triples: "triples",
  player_home_runs: "home_runs", home_runs: "home_runs", player_total_bases: "total_bases", total_bases: "total_bases",
  player_hits_runs_rbis: "hits_runs_rbis", hits_runs_rbis: "hits_runs_rbis", hitter_strikeouts: "hitter_strikeouts",
  player_hitter_strikeouts: "hitter_strikeouts", player_bat_strike_outs: "hitter_strikeouts", player_stolen_bases: "stolen_bases",
  stolen_bases: "stolen_bases", player_walks: "walks", player_bat_walks: "walks", walks: "walks"
};
const PITCHER_MARKET_KEY_TO_PROP = {
  player_strikeouts: "pitcher_strikeouts", player_pitcher_strikeouts: "pitcher_strikeouts", pitcher_strikeouts: "pitcher_strikeouts",
  player_pitcher_outs: "pitcher_outs", pitcher_outs: "pitcher_outs", player_outs: "pitcher_outs", player_outs_recorded: "pitcher_outs",
  pitcher_outs_recorded: "pitcher_outs", player_hits_allowed: "hits_allowed", pitcher_hits_allowed: "hits_allowed", hits_allowed: "hits_allowed",
  player_walks_allowed: "walks_allowed", pitcher_walks_allowed: "walks_allowed", walks_allowed: "walks_allowed", player_earned_runs: "earned_runs",
  player_earned_runs_allowed: "earned_runs", pitcher_earned_runs: "earned_runs", pitcher_earned_runs_allowed: "earned_runs", earned_runs: "earned_runs",
  earned_runs_allowed: "earned_runs", player_runs_allowed: "runs_allowed", pitcher_runs_allowed: "runs_allowed", runs_allowed: "runs_allowed",
  pitcher_strikeouts_combo: "pitcher_strikeouts_combo", player_pitcher_strikeouts_combo: "pitcher_strikeouts_combo"
};

function pg(env) { return postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false, prepare: false, connect_timeout: 8 }); }

function modeConfig(input = {}) {
  const requested = String(input.mode || MODE_HITTER);
  const isPitcher = requested === MODE_PITCHER || requested === "pitcher_props" || requested === "market_pitcher_props";
  const mode = isPitcher ? MODE_PITCHER : MODE_HITTER;
  return isPitcher ? {
    mode, prop_family: "pitcher", prop_keys: PITCHER_PROP_KEYS, market_map: PITCHER_MARKET_KEY_TO_PROP, parlay_markets: PARLAY_PITCHER_MARKETS,
    parlay_odds_markets: PARLAY_PITCHER_ODDS_MARKETS, source_suffix: "pitcher_props", batch_prefix: "market_pitcher_props_batch",
    request_prefix: "market_pitchers", issue_prefix: "PITCHER_PROP", coverage_prefix: "PITCHER_PROP", player_props_label: "pitcher", no_opposite_boundary_key: "no_hitter_props"
  } : {
    mode, prop_family: "hitter", prop_keys: HITTER_PROP_KEYS, market_map: HITTER_MARKET_KEY_TO_PROP, parlay_markets: PARLAY_HITTER_MARKETS,
    parlay_odds_markets: PARLAY_HITTER_ODDS_MARKETS, source_suffix: "hitter_props", batch_prefix: "market_hitter_props_batch",
    request_prefix: "market_hitters", issue_prefix: "HITTER_PROP", coverage_prefix: "HITTER_PROP", player_props_label: "hitter", no_opposite_boundary_key: "no_pitcher_props"
  };
}

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,x-ingest-token,x-admin-token,authorization", "access-control-allow-methods": "GET,POST,OPTIONS" } });
}
function safeText(value, max = 900) {
  const text = value === undefined || value === null ? "" : String(value);
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}
function safeJson(value, max = 7000) {
  const text = JSON.stringify(value === undefined ? null : value);
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}
function bindingPresence(env, names) { const out = {}; for (const name of names) out[name] = Boolean(env && env[name]); return out; }
function sourceHas(env, key) { return !!(env && env[key] !== undefined && env[key] !== null && String(env[key]).trim().length > 0); }
async function readJsonSafe(request) { try { return await request.json(); } catch (_) { return {}; } }
function ptDate(offsetDays = 0) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
  const base = new Date(Date.now() + offsetDays * 86400000);
  return fmt.format(base);
}
function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function normalizedMarket(value) { return normalizeText(value).replace(/ /g, "_"); }
function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function americanToDecimal(american) {
  const n = numberOrNull(american);
  if (n === null || n === 0) return null;
  return n > 0 ? Number((1 + n / 100).toFixed(4)) : Number((1 + 100 / Math.abs(n)).toFixed(4));
}
function nestedInputJson(input = {}) {
  const nested = input && input.input_json;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) return nested;
  if (typeof nested === "string") { try { const parsed = JSON.parse(nested); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed; } catch (_) {} }
  return {};
}
function inputValue(input = {}, key) {
  if (input && Object.prototype.hasOwnProperty.call(input, key)) return input[key];
  const nested = nestedInputJson(input);
  return nested ? nested[key] : undefined;
}
function inputFlag(input = {}, key) {
  const value = inputValue(input, key);
  if (value === true || value === 1) return true;
  if (typeof value === "string") return value.toLowerCase() === "true" || value === "1";
  return false;
}
function isBackendMarketSequence(input = {}) {
  const source = String(inputValue(input, "source") || "");
  const parentRequestId = inputValue(input, "parent_request_id") || inputValue(input, "parentRequestId");
  return !!(input && (inputFlag(input, "backend_chain_only") || inputFlag(input, "backend_scheduled_continuation") || source === "market_scoring_full_run_parent" || !!parentRequestId));
}
function shouldAttemptLiveParlayFetch(input = {}) { return true; }
function marketFullSoftDeadlineExceeded(startedMs, reserveMs = 0) {
  return Date.now() - Number(startedMs || Date.now()) >= Math.max(1000, MARKET_FULL_WORKER_SOFT_DEADLINE_MS - Number(reserveMs || 0));
}
function syntheticParlaySkippedForBackendChain(input = {}, config = modeConfig(input)) {
  return {
    ok: false, skipped_for_backend_chain: true, external_calls: 0, http_status: null,
    response_preview: "parlay_live_fetch_skipped_for_backend_chain_service_binding_safety", rows: [], normalized: [], rows_seen: 0, normalized_player_prop_rows: 0,
    endpoint: { ok: true, skipped: true, request_strategy: "backend_chain_soft_finalizer_no_live_parlay_fetch" },
    probe_strategy: { split_book_probe_active: false, backend_chain_soft_finalizer: true, prop_family: config.prop_family, reason: "Prior runs proved service-binding child can hang; backend chain now fails open with a MARKET warning unless force_parlay_live_fetch=true." },
    pagination: { pages: [], max_pages: 0, deduped_rows: 0, book_counts: {}, book_quality_counts: {}, missing_core_books_after_split_and_fallback: PARLAY_CORE_FALLBACK_BOOKS },
    detected_rows_path: null, detected_array_candidates: [], normalized_primary_non_owned_rows: 0
  };
}
function compactRawJson(value) { return safeJson(value, 6500); }
function baseIdentity(env, extra = {}) {
  const required = { HYPERDRIVE: Boolean(env && env.HYPERDRIVE) };
  const missingDb = Object.entries(required).filter(([, ok]) => !ok).map(([name]) => name);
  return {
    ok: true, data_ok: missingDb.length === 0, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY,
    status: missingDb.length ? "BLOCKED_MISSING_DB_BINDINGS" : "READY", phase: MODE,
    bindings: { required },
    secrets_present_only: { PARLAY_API_KEY: sourceHas(env, "PARLAY_API_KEY") },
    boundaries: { hitter_player_props_supported: true, pitcher_player_props_supported_evidence_only: true, active_mode_selected_on_run: true, no_teams_game_odds: true, no_market_current_lines: true, no_score_db_mutation: true, no_scoring: true, no_ranking: true, no_matrix: true, no_final_board: true },
    timestamp_utc: nowUtc(), ...extra
  };
}
async function configuredParlayEndpoint(env, input = {}) {
  const baseUrl = String(input.parlay_api_base_url || env.PARLAY_API_BASE_URL || DEFAULT_PARLAY_API_BASE_URL).trim().replace(/\/+$/, "");
  const endpoint = String(input.parlay_endpoint || input.source_endpoint || env.PARLAY_API_PROPS_ENDPOINT || env.PARLAY_HITTER_PROPS_ENDPOINT || DEFAULT_PARLAY_PROPS_ENDPOINT).trim();
  if (!baseUrl || !endpoint) return { ok: false, reason: "PARLAY_API_BASE_URL_OR_ENDPOINT_MISSING", base_url_present: !!baseUrl, endpoint_present: !!endpoint };
  const rawUrl = /^https?:\/\//i.test(endpoint) ? endpoint : `${baseUrl}${endpoint.startsWith("/") ? endpoint : "/" + endpoint}`;
  const url = buildParlayDiscoveryUrl(rawUrl, input);
  return { ok: true, url, endpoint_preview: safeEndpoint(url), base_url_host: safeHost(baseUrl), request_strategy: "full_book_discovery_no_default_bookmaker_filter" };
}
function buildParlayDiscoveryUrl(rawUrl, input = {}) {
  const u = new URL(rawUrl);
  const explicitBookmakers = input.bookmakers || input.parlay_bookmakers || input.parlayBookmakers || null;
  if (explicitBookmakers) u.searchParams.set("bookmakers", Array.isArray(explicitBookmakers) ? explicitBookmakers.join(",") : String(explicitBookmakers));
  else u.searchParams.delete("bookmakers");
  if (!u.searchParams.get("markets")) u.searchParams.set("markets", PARLAY_MARKETS.join(","));
  u.searchParams.set("limit", String(Math.min(PARLAY_PAGE_LIMIT, Math.max(1000, Number(input.limit || PARLAY_PAGE_LIMIT) || PARLAY_PAGE_LIMIT))));
  if (!u.searchParams.get("dfsOdds")) u.searchParams.set("dfsOdds", "effective");
  return u.toString();
}
function nextParlayPageUrl(currentUrl, pageIndex, headers, json) {
  const headerNext = headers.get("x-next-offset") || headers.get("x-next-page") || headers.get("x-next-cursor") || headers.get("next-offset");
  const jsonNext = getDeep(json, ["next_offset", "nextOffset", "nextPage", "next_page", "next_cursor", "nextCursor", "pagination.next_offset", "pagination.nextOffset", "pagination.next_cursor", "meta.next_offset"]);
  const next = headerNext || jsonNext;
  const hasMoreHeader = headers.get("x-result-has-more") || headers.get("x-has-more") || headers.get("has-more");
  const hasMoreJson = getDeep(json, ["has_more", "hasMore", "pagination.has_more", "pagination.hasMore", "meta.has_more"]);
  const hasMore = String(hasMoreHeader || hasMoreJson || "").toLowerCase();
  if (!next && !["true", "1", "yes"].includes(hasMore)) return null;
  const u = new URL(currentUrl);
  if (next) {
    if (/^https?:\/\//i.test(String(next))) return String(next);
    u.searchParams.set("offset", String(next));
    return u.toString();
  }
  const currentOffset = Number(u.searchParams.get("offset") || 0);
  const limit = Number(u.searchParams.get("limit") || PARLAY_PAGE_LIMIT);
  u.searchParams.set("offset", String(currentOffset + limit));
  return pageIndex + 1 < PARLAY_MAX_PAGES ? u.toString() : null;
}
function sourceKeyForParlay(row, config = modeConfig()) {
  const book = normalizeText(row && row.bookmaker ? row.bookmaker : "unknown").replace(/ /g, "_") || "unknown";
  return `parlay_api_${book}_${config.source_suffix}`;
}
function safeHost(urlText) { try { return new URL(urlText).host; } catch (_) { return "invalid_url"; } }
function safeEndpoint(urlText) { try { const u = new URL(urlText); return `${u.origin}${u.pathname}`; } catch (_) { return String(urlText || "").split("?")[0]; } }
async function authHeaders(env) {
  const headers = new Headers({ "accept": "application/json", "user-agent": "AlphaDog-v2-market-player-prop-context/0.3.0" });
  const headerName = String(env.PARLAY_API_AUTH_HEADER_NAME || "X-API-Key").trim();
  const prefix = String(env.PARLAY_API_AUTH_HEADER_PREFIX || "").trim();
  let apiKey = null;
  if (env.HYPERDRIVE) {
    const client = pg(env);
    try {
      const rows = await client.unsafe("SELECT credential_value_encrypted FROM config.external_credentials WHERE credential_key='parlay_api_key'");
      if (rows && rows[0] && rows[0].credential_value_encrypted) {
        const parsed = JSON.parse(rows[0].credential_value_encrypted);
        if (parsed && parsed.password) apiKey = String(parsed.password);
      }
    } catch (_) {
      // fall through to env secret fallback below
    } finally {
      await client.end({ timeout: 1 }).catch(() => {});
    }
  }
  if (!apiKey && sourceHas(env, "PARLAY_API_KEY")) apiKey = String(env.PARLAY_API_KEY);
  if (apiKey && headerName) headers.set(headerName, prefix ? `${prefix} ${apiKey}` : apiKey);
  return headers;
}
function findArraysDeep(value, path = "$", out = [], depth = 0) {
  if (depth > 5 || !value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    if (value.some(x => x && typeof x === "object" && !Array.isArray(x))) out.push({ path, rows: value });
    for (let i = 0; i < Math.min(value.length, 5); i++) findArraysDeep(value[i], `${path}[${i}]`, out, depth + 1);
    return out;
  }
  for (const [k, v] of Object.entries(value)) findArraysDeep(v, `${path}.${k}`, out, depth + 1);
  return out;
}
function extractRawRows(json) {
  const arrays = findArraysDeep(json).sort((a, b) => b.rows.length - a.rows.length);
  const best = arrays[0] || { path: null, rows: [] };
  return { path: best.path, rows: best.rows.slice(0, MAX_PARLAY_ROWS), candidates: arrays.slice(0, 8).map(a => ({ path: a.path, rows: a.rows.length })) };
}
function getDeep(obj, keys) {
  for (const key of keys) {
    if (!key) continue;
    const parts = key.split(".");
    let cur = obj; let ok = true;
    for (const p of parts) { if (cur && typeof cur === "object" && p in cur) cur = cur[p]; else { ok = false; break; } }
    if (ok && cur !== undefined && cur !== null && String(cur).trim() !== "") return cur;
  }
  return null;
}
function firstPrice(obj, side) {
  const keys = side === "over" ? ["over_price", "overPrice", "prices.over", "price_over", "outcomes.over.price", "over.price", "over.american", "over_price_american"] : ["under_price", "underPrice", "prices.under", "price_under", "outcomes.under.price", "under.price", "under.american", "under_price_american"];
  return numberOrNull(getDeep(obj, keys));
}
function cleanPlayerCandidate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.includes("{optionTypeAbbr}") || raw.includes("{value}")) return null;
  if (raw.includes(" @ ")) return null;
  const norm = normalizeText(raw);
  if (!norm || ["odd", "even", "over", "under", "yes", "no"].includes(norm)) return null;
  if (/^(hits?|rbis?|runs?|singles?|doubles?|triples?|home\s*runs?|stolen\s*bases?|walks?|total\s*bases?|(?:total\s+)?strikeouts?|(?:total\s+)?pitcher\s*strikeouts?|(?:total\s+)?pitching\s*outs?|(?:total\s+)?pitcher\s*outs?|outs\s*recorded|hits\s*allowed|walks\s*allowed|earned\s*runs(?:\s*allowed)?|runs\s*allowed)$/i.test(raw)) return null;
  if (/^to\s+record\s+\d+\+/i.test(raw)) return null;
  if (/^\d+\+\s*(hits?|rbis?|runs?|singles?|doubles?|triples?|home\s*runs?|stolen\s*bases?|walks?|total\s*bases?|(?:total\s+)?strikeouts?|(?:total\s+)?pitcher\s*strikeouts?|(?:total\s+)?pitching\s*outs?|(?:total\s+)?pitcher\s*outs?|outs\s*recorded|hits\s*allowed|walks\s*allowed|earned\s*runs(?:\s*allowed)?|runs\s*allowed)$/i.test(raw)) return null;
  if (/^[+-]?\d+(?:\.\d+)?$/.test(raw)) return null;
  return raw.replace(/\s+\([A-Z]{2,4}\)$/, "").trim();
}
function extractPlayerFromMarketLabel(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const patterns = [
    /^(?:alternate\s+)?(?:total\s+)?(?:hits\s*,?\s+runs\s+(?:and\s+)?rbis?|hits\s+runs\s+(?:and\s+)?rbis?|bases|hits?|rbis?|runs?|singles?|doubles?|triples?|home\s+runs?|stolen\s+bases?|walks?|hitter\s+walks?|(?:pitcher\s+)?strikeouts?|pitching\s+outs?|pitcher\s+outs?|outs\s+recorded|hits\s+allowed|walks\s+allowed|earned\s+runs(?:\s+allowed)?|runs\s+allowed)\s+-\s+(.+?)(?:\s+\([A-Z]{2,4}\))?$/i,
    /^(.+?)\s+-\s+(?:alternate\s+)?(?:total\s+)?(?:hits\s*,?\s+runs\s+(?:and\s+)?rbis?|hits\s+runs\s+(?:and\s+)?rbis?|bases|hits?|rbis?|runs?|singles?|doubles?|triples?|home\s+runs?|stolen\s+bases?|walks?|(?:pitcher\s+)?strikeouts?|pitching\s+outs?|pitcher\s+outs?|outs\s+recorded|hits\s+allowed|walks\s+allowed|earned\s+runs(?:\s+allowed)?|runs\s+allowed)$/i
  ];
  for (const re of patterns) { const m = text.match(re); if (m) return cleanPlayerCandidate(m[1]); }
  return null;
}
function propFromThresholdText(value) {
  const propText = normalizeText(value).replace(/ /g, "_");
  const propMap = { hit: "hits", hits: "hits", total_base: "total_bases", total_bases: "total_bases", rbi: "rbis", rbis: "rbis", run: "runs", runs: "runs", single: "singles", singles: "singles", double: "doubles", doubles: "doubles", triple: "triples", triples: "triples", home_run: "home_runs", home_runs: "home_runs", stolen_base: "stolen_bases", stolen_bases: "stolen_bases", walk: "walks", walks: "walks", hitter_walk: "walks", hitter_walks: "walks", total_strikeouts: "pitcher_strikeouts", strikeout: "pitcher_strikeouts", strikeouts: "pitcher_strikeouts", pitcher_strikeout: "pitcher_strikeouts", pitcher_strikeouts: "pitcher_strikeouts", pitching_out: "pitcher_outs", pitching_outs: "pitcher_outs", pitcher_out: "pitcher_outs", pitcher_outs: "pitcher_outs", out: "pitcher_outs", outs: "pitcher_outs", hits_allowed: "hits_allowed", hit_allowed: "hits_allowed", walks_allowed: "walks_allowed", walk_allowed: "walks_allowed", earned_runs: "earned_runs", earned_runs_allowed: "earned_runs", runs_allowed: "runs_allowed", run_allowed: "runs_allowed" };
  return propMap[propText] || null;
}
function parsePlusThreshold(value) {
  const text = String(value || "");
  const m = text.match(/(?:to\s+record\s+)?(\d+)\s*\+\s*(hits?|total\s+bases|rbis?|runs?|singles?|doubles?|triples?|home\s+runs?|stolen\s+bases?|walks?|hitter\s+walks?|(?:total\s+)?(?:pitcher\s+)?strikeouts?|(?:total\s+)?pitching\s+outs?|(?:total\s+)?pitcher\s+outs?|outs?|hits\s+allowed|walks\s+allowed|earned\s+runs(?:\s+allowed)?|runs\s+allowed)/i);
  if (!m) return null;
  const threshold = Number(m[1]);
  if (!Number.isFinite(threshold) || threshold <= 0) return null;
  const canonical_prop_key = propFromThresholdText(m[2]);
  return { threshold, canonical_prop_key, normalized_line_value: Number((threshold - 0.5).toFixed(3)), source_text: text };
}
function likelyHumanName(value) {
  const text = cleanPlayerCandidate(value);
  if (!text) return null;
  const norm = normalizeText(text);
  if (!norm || norm.split(" ").length > 5) return null;
  if (/\b(team|game|market|player|option|record|total|bases|runs|hits|rbi|stolen|walks|strikeouts|outs|allowed|earned)\b/i.test(norm) && norm.split(" ").length <= 2) return null;
  return text;
}
function collectDeepPlayerCandidates(obj, out = [], path = "", depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 5 || out.length > 80) return out;
  if (Array.isArray(obj)) { for (let i = 0; i < Math.min(obj.length, 20); i++) collectDeepPlayerCandidates(obj[i], out, `${path}[${i}]`, depth + 1); return out; }
  for (const [k, v] of Object.entries(obj)) {
    const key = normalizeText(k);
    if (v !== null && v !== undefined && typeof v !== "object") {
      const text = String(v);
      const candidate = likelyHumanName(text);
      const keyLooksPlayer = /(^|_)(player|participant|athlete|competitor|selection|outcome|option|description|display|name|label)(_|$)/i.test(key.replace(/ /g, "_"));
      if (candidate && keyLooksPlayer) out.push({ value: candidate, path: `${path}.${k}`.replace(/^\./, ""), score: key.includes("player") || key.includes("athlete") ? 4 : key.includes("participant") || key.includes("competitor") ? 3 : key.includes("selection") || key.includes("outcome") || key.includes("option") ? 2 : 1 });
    } else if (v && typeof v === "object") collectDeepPlayerCandidates(v, out, `${path}.${k}`.replace(/^\./, ""), depth + 1);
  }
  return out;
}
function extractPlayerNameDeep(row, currentPlayerName, marketRaw) {
  const cleanedCurrent = cleanPlayerCandidate(currentPlayerName);
  if (cleanedCurrent) return { player_name: cleanedCurrent, reason: "direct_player_field" };
  const fromMarket = extractPlayerFromMarketLabel(marketRaw);
  if (fromMarket) return { player_name: fromMarket, reason: "market_title_player_parser" };
  const candidates = collectDeepPlayerCandidates(row).sort((a, b) => b.score - a.score || a.value.length - b.value.length);
  for (const c of candidates) {
    const norm = normalizeText(c.value);
    if (!norm || norm === normalizeText(marketRaw)) continue;
    return { player_name: c.value, reason: `deep_raw_player_candidate:${c.path}` };
  }
  return { player_name: currentPlayerName ? String(currentPlayerName) : null, reason: "no_usable_player_candidate_found" };
}
function canonicalFromMarket(marketRaw, marketKey, config = modeConfig()) {
  const rawNorm = normalizeText(marketRaw);
  const rawKey = rawNorm.replace(/ /g, "_");
  if (config.prop_family === "pitcher" && /\bhitter\b|\bbatter\b/.test(rawNorm)) return { canonical: null, market_key: marketKey || String(marketRaw || ""), reason: "title_explicitly_names_opposite_role_hitter_batter_rejected_in_pitcher_mode" };
  if (config.prop_family === "hitter" && /\bpitcher\b|\bpitching\b/.test(rawNorm)) return { canonical: null, market_key: marketKey || String(marketRaw || ""), reason: "title_explicitly_names_opposite_role_pitcher_rejected_in_hitter_mode" };
  if (config.prop_family === "pitcher") {
    if (/^(?:total\s+)?(?:pitcher\s+)?strikeouts?$/.test(rawNorm) || rawKey === "player_strikeouts") return { canonical: "pitcher_strikeouts", market_key: "player_pitcher_strikeouts", reason: "pitcher_strikeouts_alias" };
    if (/^(?:(?:total\s+)?pitching\s+outs?|(?:total\s+)?pitcher\s+outs?|outs\s+recorded|outs)$/.test(rawNorm)) return { canonical: "pitcher_outs", market_key: "player_pitcher_outs", reason: "pitcher_outs_alias" };
    if (/^hits?\s+allowed$/.test(rawNorm)) return { canonical: "hits_allowed", market_key: "player_hits_allowed", reason: "hits_allowed_alias" };
    if (/^walks?\s+allowed$/.test(rawNorm)) return { canonical: "walks_allowed", market_key: "player_walks_allowed", reason: "walks_allowed_alias" };
    if (/^earned\s+runs?(?:\s+allowed)?$/.test(rawNorm)) return { canonical: "earned_runs", market_key: "player_earned_runs", reason: "earned_runs_alias" };
    if (/^runs?\s+allowed$/.test(rawNorm)) return { canonical: "runs_allowed", market_key: "player_runs_allowed", reason: "runs_allowed_alias" };
    const canonical = config.market_map[marketKey] || config.market_map[rawKey] || null;
    return { canonical, market_key: marketKey || String(marketRaw || ""), reason: "default_pitcher_market_alias" };
  }
  if (rawNorm === "home runs" || rawNorm === "home run" || rawKey === "batter_home_runs") return { canonical: "home_runs", market_key: "player_home_runs", reason: "raw_market_home_runs_override" };
  if (rawNorm === "bases" || rawNorm === "total bases" || rawKey === "batter_total_bases") return { canonical: "total_bases", market_key: "player_total_bases", reason: "raw_market_total_bases_override" };
  if (rawNorm === "hits runs rbis" || rawNorm === "hits runs and rbis" || rawNorm === "hits runs rbis ou" || rawNorm === "hits runs rbis o u" || rawNorm.startsWith("total hits runs and rbis")) return { canonical: "hits_runs_rbis", market_key: "player_hits_runs_rbis", reason: "raw_market_hrr_override" };
  if (rawKey === "batter_hits") return { canonical: "hits", market_key: "player_hits", reason: "batter_hits_alias" };
  if (rawKey === "batter_rbis") return { canonical: "rbis", market_key: "player_rbis", reason: "batter_rbis_alias" };
  if (rawKey === "batter_runs") return { canonical: "runs", market_key: "player_runs", reason: "batter_runs_alias" };
  if (rawKey === "batter_stolen_bases") return { canonical: "stolen_bases", market_key: "player_stolen_bases", reason: "batter_stolen_bases_alias" };
  const canonical = config.market_map[marketKey] || config.market_map[rawKey] || null;
  return { canonical, market_key: marketKey || String(marketRaw || ""), reason: "default_market_alias" };
}
function normalizeParlayRow(row, config = modeConfig()) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const marketKeyRaw = getDeep(row, ["market_key", "marketKey", "source_market_key", "stat", "stat_type", "statType", "prop", "prop_type", "type"]);
  const marketTitleRaw = getDeep(row, ["market", "market_name", "marketName", "source_market", "name", "title", "description.market", "description.market_name"]);
  const marketRawForThreshold = marketTitleRaw || marketKeyRaw;
  let marketKey = normalizedMarket(marketKeyRaw || marketTitleRaw);
  const plus = parsePlusThreshold(marketRawForThreshold) || parsePlusThreshold(marketKeyRaw);
  let canonicalInfo = plus && plus.canonical_prop_key ? { canonical: plus.canonical_prop_key, market_key: `player_${plus.canonical_prop_key}`, reason: "plus_threshold_market_parser" } : canonicalFromMarket(marketTitleRaw || marketKeyRaw, marketKey, config);
  let canonical = canonicalInfo.canonical;
  if (!canonical || !config.prop_keys.includes(canonical)) return null;
  marketKey = canonicalInfo.market_key || marketKey;
  const directPlayerName = getDeep(row, ["player", "player_name", "playerName", "participant.name", "selection_name", "selection.name", "outcome.name", "description.player", "description.player_name", "athlete.name", "competitor.name"]);
  const playerExtract = extractPlayerNameDeep(row, directPlayerName, marketTitleRaw || marketKeyRaw);
  let playerName = playerExtract.player_name;
  const marketNorm = normalizeText(marketTitleRaw || marketKeyRaw);
  const playerNormNow = normalizeText(playerName);
  if ((!playerNormNow || playerNormNow === "odd" || playerNormNow === "even" || String(playerName || "").includes(" @ ")) && extractPlayerFromMarketLabel(marketTitleRaw || marketKeyRaw)) playerName = extractPlayerFromMarketLabel(marketTitleRaw || marketKeyRaw);
  let lineValue = numberOrNull(getDeep(row, ["line_value", "line", "points", "point", "handicap", "line_score", "value"]));
  let side = normalizeText(getDeep(row, ["side", "outcome", "label", "name"])) || null;
  let thresholdLineValue = null;
  if (plus && plus.normalized_line_value !== null) { thresholdLineValue = plus.normalized_line_value; lineValue = thresholdLineValue; side = "over"; }
  const eventId = getDeep(row, ["event_id", "eventId", "source_event_id", "game_id", "gameId", "match_id", "fixture_id"]);
  const lineId = getDeep(row, ["line_id", "lineId", "source_line_id", "id", "selection_id", "outcome_id"]);
  const commenceTime = getDeep(row, ["commence_time", "commenceTime", "start_time", "startTime", "game_time", "event.start_time"]);
  const homeTeam = getDeep(row, ["home_team", "homeTeam", "event.home_team", "teams.home", "home.name"]);
  const awayTeam = getDeep(row, ["away_team", "awayTeam", "event.away_team", "teams.away", "away.name"]);
  const bookmaker = getDeep(row, ["bookmaker", "bookmaker_key", "bookmakerKey", "sportsbook", "book"]);
  const bookmakerKey = normalizeText(bookmaker).replace(/ /g, "_") || "sleeper";
  let normalizationStatus = "usable_player_prop_line";
  const issues = [];
  const directHadTemplate = String(directPlayerName || "").includes("{optionTypeAbbr}") || String(getDeep(row, ["player", "player_name", "playerName"]) || "").includes("{optionTypeAbbr}");
  if (directHadTemplate && playerExtract.reason === "no_usable_player_candidate_found") { normalizationStatus = "quarantined_template_player_label"; issues.push("template_player_label_unresolved"); }
  else if (directHadTemplate) issues.push("template_player_label_recovered");
  if (marketNorm.includes("odd even") || ["odd", "even"].includes(normalizeText(playerName))) { normalizationStatus = "quarantined_event_level_market"; issues.push("event_level_odd_even_market"); }
  if (!normalizeText(playerName)) { normalizationStatus = "quarantined_missing_player_name"; issues.push("missing_player_name"); }
  const overPrice = firstPrice(row, "over");
  const underPrice = firstPrice(row, "under");
  const directPrice = numberOrNull(getDeep(row, ["price", "american_price", "americanPrice", "odds", "price_american"]));
  return {
    raw: row, market_key: marketKey || String(marketKeyRaw || marketTitleRaw || ""), canonical_prop_key: canonical,
    player_name: playerName ? String(playerName) : null, player_name_normalized: normalizeText(playerName),
    line_value: lineValue, threshold_value: plus ? plus.threshold : null, normalized_threshold: plus ? plus.threshold : null, threshold_line_value: thresholdLineValue,
    source_event_id: eventId ? String(eventId) : null, source_line_id: lineId ? String(lineId) : null, commence_time: commenceTime ? String(commenceTime) : null,
    home_team: homeTeam ? String(homeTeam) : null, away_team: awayTeam ? String(awayTeam) : null, bookmaker: bookmaker ? String(bookmaker) : "sleeper",
    bookmaker_key: bookmakerKey, book_quality: bookmakerQuality(bookmakerKey), normalization_status: normalizationStatus, normalization_issues: issues,
    normalization_reason: canonicalInfo.reason, player_name_resolution_reason: playerExtract.reason, threshold_source_text: plus ? plus.source_text : null,
    over_price: overPrice, under_price: underPrice, side, price_american: directPrice
  };
}
function cloneUrlWithParams(baseUrl, params = {}) {
  const u = new URL(baseUrl);
  for (const [k, v] of Object.entries(params)) { if (v === undefined || v === null || v === "") continue; u.searchParams.set(k, Array.isArray(v) ? v.join(",") : String(v)); }
  return u.toString();
}
function parlayBaseUrlFromEndpoint(endpoint) { if (endpoint && endpoint.url) return endpoint.url; return `${DEFAULT_PARLAY_API_BASE_URL}${DEFAULT_PARLAY_PROPS_ENDPOINT}`; }
function parlayOddsUrlFromPropsUrl(propsUrl, input = {}) {
  const u = new URL(propsUrl);
  const explicit = input.parlay_odds_endpoint || input.odds_endpoint || null;
  if (explicit) return /^https?:\/\//i.test(String(explicit)) ? String(explicit) : `${u.origin}${String(explicit).startsWith("/") ? explicit : "/" + explicit}`;
  u.pathname = DEFAULT_PARLAY_ODDS_ENDPOINT;
  return u.toString();
}
function buildProbePlan(endpoint, input = {}, config = modeConfig(input)) {
  const propsBase = parlayBaseUrlFromEndpoint(endpoint);
  const oddsBase = parlayOddsUrlFromPropsUrl(propsBase, input);
  const probes = [];
  const includeBroad = String(input.include_broad_probe || input.parlay_include_broad_probe || "false").toLowerCase() === "true";
  if (includeBroad) probes.push({ probe_id: "props_broad_all_books_audit_only", endpoint_kind: "props", bookmakers: [], url: cloneUrlWithParams(propsBase, { markets: config.parlay_markets.join(","), limit: PARLAY_PAGE_LIMIT, dfsOdds: "effective" }) });
  for (const g of PARLAY_PRIMARY_BOOK_GROUPS) probes.push({ ...g, url: cloneUrlWithParams(propsBase, { bookmakers: g.bookmakers, markets: config.parlay_markets.join(","), limit: PARLAY_PAGE_LIMIT, dfsOdds: "effective" }) });
  const backendSequence = isBackendMarketSequence(input);
  const includeOddsEndpoint = String(input.include_odds_endpoint_probe ?? input.parlay_include_odds_endpoint_probe ?? (backendSequence ? "false" : "true")).toLowerCase() !== "false";
  if (includeOddsEndpoint) for (const g of PARLAY_ODDS_ENDPOINT_BOOK_GROUPS) probes.push({ ...g, url: cloneUrlWithParams(oddsBase, { regions: "us,us2", bookmakers: g.bookmakers, markets: config.parlay_odds_markets.join(","), oddsFormat: "american", limit: PARLAY_PAGE_LIMIT }) });
  const maxProbes = backendSequence && input.full_parlay_book_scan !== true ? Math.max(1, Math.min(Number(input.max_parlay_discovery_probes || 4), PARLAY_MAX_DISCOVERY_PROBES)) : PARLAY_MAX_DISCOVERY_PROBES;
  return probes.slice(0, maxProbes);
}
function bookmakerQuality(book) {
  const b = normalizeText(book).replace(/ /g, "_");
  if (PARLAY_OWNED_BOOKS_EXCLUDED_FROM_DECISION.includes(b)) return "owned_board_excluded_from_vendor_decision";
  if (PARLAY_PICKEM_BOOKS_COMPARISON.includes(b)) return "pickem_comparison";
  if (PARLAY_PICKEM_BOOKS_QUARANTINE.includes(b)) return "dfs_pickem_quarantine_not_primary_book_comparison";
  if (["bet365", "bovada"].includes(b)) return "requires_shape_validation";
  if (["novig", "prophetx", "kalshi", "pinnacle"].includes(b)) return "exchange_or_sharp_reference";
  return "primary_comparison_book";
}
function flattenOddsEndpointRows(json, probe = {}) {
  const roots = [];
  if (Array.isArray(json)) roots.push(...json);
  if (json && typeof json === "object") for (const key of ["data", "events", "results"]) if (Array.isArray(json[key])) roots.push(...json[key]);
  const rows = [];
  for (const event of roots) {
    if (!event || typeof event !== "object" || Array.isArray(event)) continue;
    const bookmakers = Array.isArray(event.bookmakers) ? event.bookmakers : [];
    for (const book of bookmakers) {
      const markets = Array.isArray(book.markets) ? book.markets : [];
      for (const market of markets) {
        const marketKey = market.key || market.market_key || market.market || market.name;
        const outcomes = Array.isArray(market.outcomes) ? market.outcomes : [];
        for (const outcome of outcomes) {
          const outcomeName = outcome.name || outcome.label || outcome.selection || outcome.side;
          const outcomeNorm = normalizeText(outcomeName);
          const directSide = outcomeNorm.includes("under") ? "under" : (outcomeNorm.includes("over") ? "over" : (outcomeNorm || null));
          const player = outcome.description || outcome.player || outcome.participant || outcome.participant_name || outcome.player_name || (directSide ? null : outcomeName);
          rows.push({ __probe_id: probe.probe_id || "odds_endpoint_probe", __endpoint_kind: "odds", bookmaker: book.key || book.bookmaker || book.title || book.name, bookmaker_title: book.title || book.name || book.key, player, market_key: marketKey, market: marketKey, line: outcome.point ?? outcome.line ?? outcome.line_value ?? market.point ?? null, side: directSide, price: outcome.price ?? outcome.american_price ?? outcome.odds ?? null, event_id: event.id || event.event_id || event.canonical_event_id, canonical_event_id: event.canonical_event_id || event.id || event.event_id, commence_time: event.commence_time || event.start_time || event.game_time, home_team: event.home_team || event.homeTeam, away_team: event.away_team || event.awayTeam, last_update: book.last_update || market.last_update || outcome.last_update, source_shape: "parlay_odds_endpoint_nested_event_market_outcome", raw_odds_event_id: event.id || null, raw_market_key: marketKey, raw_outcome: outcome });
        }
      }
    }
  }
  return rows;
}
function timeoutSignal(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  if (typeof AbortController === "undefined") return undefined;
  const controller = new AbortController();
  setTimeout(() => { try { controller.abort("timeout"); } catch (_) {} }, ms);
  return controller.signal;
}
async function promiseWithTimeout(promise, timeoutMs, label = "operation_timeout") {
  const ms = Math.max(1000, Number(timeoutMs || PARLAY_FETCH_TIMEOUT_MS));
  let timer = null;
  try { return await Promise.race([Promise.resolve(promise), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label}_after_${ms}ms`)), ms); })]); }
  finally { if (timer) clearTimeout(timer); }
}
async function fetchWithTimeout(url, init = {}, timeoutMs = PARLAY_FETCH_TIMEOUT_MS) {
  const ms = Math.max(1000, Number(timeoutMs || PARLAY_FETCH_TIMEOUT_MS));
  try { return await promiseWithTimeout(fetch(url, { ...init, signal: timeoutSignal(ms) }), ms + 500, "parlay_fetch_timeout"); }
  catch (err) {
    const msg = String(err && (err.name || err.message) ? (err.name || err.message) : err);
    if (msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("timeout")) throw new Error(`parlay_fetch_timeout_after_${ms}ms`);
    throw err;
  }
}
async function fetchOneParlayProbe(env, probe, deadlineAt = Date.now() + PARLAY_TOTAL_FETCH_BUDGET_MS) {
  const rows = []; const candidates = []; const pages = [];
  let ok = true; let httpStatus = null; let nonJson = false; let responsePreview = null; let nextUrl = probe.url;
  try {
    for (let page = 0; page < PARLAY_MAX_PAGES && nextUrl; page++) {
      if (Date.now() >= deadlineAt) { ok = false; responsePreview = "parlay_total_fetch_budget_exhausted"; break; }
      const remainingMs = Math.max(1000, Math.min(PARLAY_FETCH_TIMEOUT_MS, deadlineAt - Date.now()));
      const resp = await fetchWithTimeout(nextUrl, { method: "GET", headers: await authHeaders(env) }, remainingMs);
      httpStatus = resp.status;
      const text = await promiseWithTimeout(resp.text(), Math.max(1000, remainingMs), "parlay_response_body_timeout");
      let json = null;
      try { json = JSON.parse(text); } catch (_) { ok = false; nonJson = true; responsePreview = safeText(text); break; }
      if (!resp.ok) ok = false;
      let extractedRows = []; let detectedPath = null;
      if (probe.endpoint_kind === "odds") { extractedRows = flattenOddsEndpointRows(json, probe); detectedPath = "events[].bookmakers[].markets[].outcomes[]"; }
      else { const extracted = extractRawRows(json); extractedRows = extracted.rows || []; detectedPath = extracted.path; candidates.push(...(extracted.candidates || []).map(c => ({ ...c, page, probe_id: probe.probe_id }))); }
      for (const r of extractedRows) rows.push({ ...r, __probe_id: probe.probe_id, __endpoint_kind: probe.endpoint_kind });
      pages.push({ probe_id: probe.probe_id, endpoint_kind: probe.endpoint_kind, page, http_status: resp.status, rows_seen: extractedRows.length, detected_rows_path: detectedPath, endpoint_preview: safeEndpoint(nextUrl), bookmakers: probe.bookmakers || [] });
      if (probe.endpoint_kind === "odds") break;
      nextUrl = nextParlayPageUrl(nextUrl, page, resp.headers, json);
      if (rows.length >= MAX_PARLAY_ROWS) break;
    }
    return { ok, http_status: httpStatus, non_json: nonJson, response_preview: responsePreview, rows, candidates, pages };
  } catch (err) { return { ok: false, error: safeText(err && err.message ? err.message : err), rows, candidates, pages }; }
}
async function fetchParlayProps(env, input = {}, config = modeConfig(input)) {
  const endpoint = await configuredParlayEndpoint(env, input);
  if (!endpoint.ok) return { ok: false, external_calls: 0, missing_config: true, rows: [], normalized: [], endpoint };
  if (!sourceHas(env, "PARLAY_API_KEY")) return { ok: false, external_calls: 0, missing_key: true, rows: [], normalized: [], endpoint };
  const probes = buildProbePlan(endpoint, input, config);
  const backendSequence = isBackendMarketSequence(input);
  const requestedBudget = Number(input.parlay_total_fetch_budget_ms || (backendSequence ? MARKET_FULL_BACKEND_FETCH_BUDGET_MS : PARLAY_TOTAL_FETCH_BUDGET_MS));
  const effectiveFetchBudgetMs = Math.max(5000, Math.min(PARLAY_TOTAL_FETCH_BUDGET_MS, requestedBudget));
  const deadlineAt = Date.now() + effectiveFetchBudgetMs;
  const probeResults = []; const allRows = [];
  let ok = true; let httpStatus = null; let responsePreview = null;
  for (const probe of probes) {
    if (Date.now() >= deadlineAt) { ok = false; responsePreview = responsePreview || "parlay_total_fetch_budget_exhausted_before_probe"; break; }
    const result = await fetchOneParlayProbe(env, probe, deadlineAt);
    probeResults.push(result);
    if (!result.ok) ok = false;
    httpStatus = result.http_status || httpStatus;
    responsePreview = result.response_preview || responsePreview;
    allRows.push(...(result.rows || []));
  }
  const unique = []; const seen = new Set();
  for (const row of allRows.slice(0, MAX_PARLAY_ROWS * 2)) {
    const key = safeJson({ probe_kind: row.__endpoint_kind, id: getDeep(row, ["id", "line_id", "lineId", "selection_id", "raw_odds_event_id"]), event_id: getDeep(row, ["event_id", "eventId", "canonical_event_id"]), player: getDeep(row, ["player", "player_name", "playerName", "description"]), market: getDeep(row, ["market_key", "marketKey", "market"]), line: getDeep(row, ["line", "line_value", "point", "points"]), side: getDeep(row, ["side", "name", "outcome"]), price: getDeep(row, ["price", "american_price", "over_price", "under_price"]), bookmaker: getDeep(row, ["bookmaker", "bookmaker_key", "sportsbook", "book"]) }, 1000);
    if (seen.has(key)) continue;
    seen.add(key); unique.push(row);
    if (unique.length >= MAX_PARLAY_ROWS) break;
  }
  let normalized = unique.map(row => normalizeParlayRow(row, config)).filter(Boolean);
  const bookCounts = {};
  for (const r of normalized) { const k = normalizeText(r.bookmaker).replace(/ /g, "_") || "unknown"; bookCounts[k] = (bookCounts[k] || 0) + 1; }
  const missingCoreBooks = PARLAY_CORE_FALLBACK_BOOKS.filter(b => !bookCounts[b]);
  const fallbackResults = [];
  const propsBase = parlayBaseUrlFromEndpoint(endpoint);
  for (const book of missingCoreBooks.slice(0, Math.max(0, PARLAY_MAX_DISCOVERY_PROBES - probes.length))) {
    const probe = { probe_id: `props_single_book_fallback_${book}`, endpoint_kind: "props", bookmakers: [book], url: cloneUrlWithParams(propsBase, { bookmakers: book, markets: config.parlay_markets.join(","), limit: PARLAY_PAGE_LIMIT, dfsOdds: "effective" }) };
    if (Date.now() >= deadlineAt) { ok = false; responsePreview = responsePreview || "parlay_total_fetch_budget_exhausted_before_probe"; break; }
    const result = await fetchOneParlayProbe(env, probe, deadlineAt);
    fallbackResults.push(result);
    if (!result.ok) ok = false;
    for (const row of result.rows || []) {
      const key = safeJson({ id: getDeep(row, ["id", "line_id", "lineId", "selection_id"]), event_id: getDeep(row, ["event_id", "eventId", "canonical_event_id"]), player: getDeep(row, ["player", "player_name", "playerName"]), market: getDeep(row, ["market_key", "marketKey", "market"]), line: getDeep(row, ["line", "line_value", "point", "points"]), over: firstPrice(row, "over"), under: firstPrice(row, "under"), bookmaker: getDeep(row, ["bookmaker", "bookmaker_key", "sportsbook", "book"]) }, 1000);
      if (seen.has(key)) continue;
      seen.add(key); unique.push(row);
    }
  }
  if (fallbackResults.length) {
    normalized = unique.slice(0, MAX_PARLAY_ROWS).map(row => normalizeParlayRow(row, config)).filter(Boolean);
    for (const k of Object.keys(bookCounts)) delete bookCounts[k];
    for (const r of normalized) { const k = normalizeText(r.bookmaker).replace(/ /g, "_") || "unknown"; bookCounts[k] = (bookCounts[k] || 0) + 1; }
  }
  const bookQualityCounts = {};
  for (const [book, count] of Object.entries(bookCounts)) { const q = bookmakerQuality(book); bookQualityCounts[q] = (bookQualityCounts[q] || 0) + count; }
  const allProbeResults = [...probeResults, ...fallbackResults];
  const pages = allProbeResults.flatMap(r => r.pages || []);
  const allCandidates = allProbeResults.flatMap(r => r.candidates || []);
  const primaryBookRows = normalized.filter(r => ["primary_comparison_book", "exchange_or_sharp_reference", "requires_shape_validation", "pickem_comparison"].includes(bookmakerQuality(r.bookmaker))).length;
  return { ok, external_calls: allProbeResults.length, http_status: httpStatus, response_preview: responsePreview, parlay_total_fetch_budget_ms: effectiveFetchBudgetMs, parlay_fetch_timeout_ms: PARLAY_FETCH_TIMEOUT_MS, endpoint, probe_strategy: { split_book_probe_active: true, broad_probe_default_enabled: false, props_endpoint_used: true, odds_endpoint_probe_used: probes.some(p => p.endpoint_kind === "odds"), per_book_fallback_used: fallbackResults.length > 0, prop_family: config.prop_family, owned_books_excluded_from_decision: PARLAY_OWNED_BOOKS_EXCLUDED_FROM_DECISION, pickem_books_comparison: PARLAY_PICKEM_BOOKS_COMPARISON, pickem_books_quarantine: PARLAY_PICKEM_BOOKS_QUARANTINE }, pagination: { pages, max_pages: PARLAY_MAX_PAGES, deduped_rows: unique.length, book_counts: bookCounts, book_quality_counts: bookQualityCounts, missing_core_books_after_split_and_fallback: PARLAY_CORE_FALLBACK_BOOKS.filter(b => !bookCounts[b]) }, detected_rows_path: pages[0] && pages[0].detected_rows_path || null, detected_array_candidates: allCandidates.slice(0, 12), rows_seen: unique.length, normalized_player_prop_rows: normalized.length, normalized_primary_non_owned_rows: primaryBookRows, rows: unique.slice(0, MAX_PARLAY_ROWS), normalized };
}
async function loadPreparedRows(pgClient, boardWindowDates, config = modeConfig()) {
  const nowIso = new Date().toISOString();
  const datesLiteral = "{" + boardWindowDates.map(d => `"${String(d).replace(/"/g, '\\"')}"`).join(",") + "}";
  const propKeysLiteral = "{" + config.prop_keys.map(k => `"${String(k).replace(/"/g, '\\"')}"`).join(",") + "}";
  return pgClient`SELECT prepared_row_id, prep_batch_id, source_key, source_row_id, source_event_id, projection_id, player_name, player_name_normalized, resolved_player_id, resolved_mlb_player_id, team, opponent, team_full_name, opponent_full_name, canonical_prop_key, source_prop_name, line_value, official_game_pk, official_game_time_utc, official_date::text AS official_date, source_start_time, row_payload_json
    FROM score.board_prepared_current
    WHERE pickable_safe = 1 AND matchup_status = 'calendar_matched' AND player_match_status = 'matched'
      AND official_game_pk IS NOT NULL AND official_game_time_utc IS NOT NULL
      AND official_date::text = ANY(${datesLiteral}::text[])
      AND official_game_time_utc > ${nowIso}
      AND canonical_prop_key = ANY(${propKeysLiteral}::text[])
      AND player_name NOT LIKE '% + %'
    ORDER BY official_game_time_utc, official_game_pk, source_key, canonical_prop_key, player_name, line_value
    LIMIT ${MAX_PREPARED_ROWS}`;
}
function lineEqual(a, b) { const na = numberOrNull(a); const nb = numberOrNull(b); if (na === null || nb === null) return false; return Math.abs(na - nb) < 0.001; }
function mapPush(map, key, row) { if (!key || key.includes("undefined")) return; if (!map.has(key)) map.set(key, []); map.get(key).push(row); }
function lineKey(value) { const n = numberOrNull(value); return n === null ? "" : String(Number(n.toFixed(3))); }
function teamPairKey(a, b) { const aa = normalizeText(a).toUpperCase(); const bb = normalizeText(b).toUpperCase(); if (!aa || !bb) return ""; return [aa, bb].sort().join("|"); }
function dedupeRows(rows) {
  const seen = new Set(); const out = [];
  for (const row of rows || []) {
    const id = String(row.prepared_row_id || `${row.official_game_pk}|${row.source_key}|${row.player_name}|${row.canonical_prop_key}|${row.line_value}`);
    if (seen.has(id)) continue;
    seen.add(id); out.push(row);
  }
  return out;
}
function preparedUnitKey(row) {
  if (!row) return "";
  const player = String(row.resolved_mlb_player_id || row.resolved_player_id || row.player_name_normalized || row.player_name || "");
  const game = String(row.official_game_pk || row.source_event_id || "");
  const prop = String(row.canonical_prop_key || "");
  return player && game && prop ? `${player}|${game}|${prop}` : "";
}
function pct(part, whole) { const p = Number(part || 0), w = Number(whole || 0); return w ? Number((100 * p / w).toFixed(1)) : null; }
function countBy(rows, fn) { const out = {}; for (const r of rows || []) { const k = fn(r) || "unknown"; out[k] = (out[k] || 0) + 1; } return out; }
function choosePreparedCandidate(rows, sourceRow, statusBase) {
  const allRows = dedupeRows(rows);
  if (!allRows.length) return { status: "no_prepared_match", row: null, rows: [], candidates: 0, choice_reason: "no_candidates" };
  let candidates = allRows;
  const sourceBook = normalizeText(sourceRow.bookmaker);
  const bookMatched = candidates.filter(r => normalizeText(r.source_key) === sourceBook);
  if (bookMatched.length) candidates = bookMatched;
  const line = numberOrNull(sourceRow.line_value);
  let exactLineMatched = false;
  if (line !== null) { const lineMatched = candidates.filter(r => lineEqual(r.line_value, line)); if (lineMatched.length) { candidates = lineMatched; exactLineMatched = true; } }
  if (candidates.length === 1) return { status: statusBase, row: candidates[0], rows: allRows, candidates: allRows.length, choice_reason: bookMatched.length ? "preferred_source_book" : "unique_candidate" };
  const uniqueGamePlayerPropLine = new Map();
  for (const r of candidates) uniqueGamePlayerPropLine.set(`${r.official_game_pk}|${r.resolved_mlb_player_id}|${r.canonical_prop_key}|${lineKey(r.line_value)}`, r);
  if (uniqueGamePlayerPropLine.size === 1) { const first = [...uniqueGamePlayerPropLine.values()][0]; return { status: `${statusBase}_multiple_board_rows`, row: first, rows: allRows, candidates: allRows.length, choice_reason: "same_game_player_prop_line_multiple_board_sources" }; }
  const uniqueGamePlayerProp = new Map();
  for (const r of candidates) uniqueGamePlayerProp.set(`${r.official_game_pk}|${r.resolved_mlb_player_id}|${r.canonical_prop_key}`, r);
  if (uniqueGamePlayerProp.size === 1) {
    let selected = [...uniqueGamePlayerProp.values()][0];
    if (line !== null) { const sorted = [...candidates].sort((a, b) => Math.abs(Number(a.line_value || 0) - line) - Math.abs(Number(b.line_value || 0) - line)); if (sorted.length) selected = sorted[0]; }
    return { status: exactLineMatched ? `${statusBase}_multiple_board_rows` : `${statusBase}_prop_unit_multiple_board_lines`, row: selected, rows: allRows, candidates: allRows.length, choice_reason: exactLineMatched ? "same_game_player_prop_line_multiple_board_sources" : "same_game_player_prop_multiple_board_lines_source_line_preserved" };
  }
  return { status: `ambiguous_${statusBase}`, row: null, rows: allRows, candidates: allRows.length, choice_reason: "multiple_distinct_candidates" };
}
function buildPreparedIndex(rows) {
  const maps = { teamPairNamePropLine: new Map(), teamPairNameProp: new Map(), teamPairPlayerIdPropLine: new Map(), teamPairPlayerIdProp: new Map(), namePropLine: new Map(), nameProp: new Map(), playerIdPropLine: new Map(), playerIdProp: new Map() };
  for (const row of rows) {
    const name = normalizeText(row.player_name_normalized || row.player_name);
    const prop = String(row.canonical_prop_key || "");
    const line = lineKey(row.line_value);
    const pair = teamPairKey(row.team, row.opponent);
    const pid = String(row.resolved_mlb_player_id || row.resolved_player_id || "");
    row.__norm_name = name; row.__team_pair_key = pair; row.__line_key = line; row.__player_id_key = pid;
    mapPush(maps.namePropLine, `${name}|${prop}|${line}`, row);
    mapPush(maps.nameProp, `${name}|${prop}`, row);
    if (pid) { mapPush(maps.playerIdPropLine, `${pid}|${prop}|${line}`, row); mapPush(maps.playerIdProp, `${pid}|${prop}`, row); }
    if (pair) {
      mapPush(maps.teamPairNamePropLine, `${pair}|${name}|${prop}|${line}`, row);
      mapPush(maps.teamPairNameProp, `${pair}|${name}|${prop}`, row);
      if (pid) { mapPush(maps.teamPairPlayerIdPropLine, `${pair}|${pid}|${prop}|${line}`, row); mapPush(maps.teamPairPlayerIdProp, `${pair}|${pid}|${prop}`, row); }
    }
  }
  return maps;
}
async function loadTeamAliasMap(pgClient) {
  const out = new Map();
  try {
    const teams = await pgClient`SELECT team_id, abbreviation, full_name, nickname, location_name, short_name, team_code, file_code FROM ref.teams WHERE active = 1`;
    for (const t of teams) { const values = [t.team_id, t.abbreviation, t.full_name, t.nickname, t.location_name, t.short_name, t.team_code, t.file_code]; for (const v of values) if (v !== undefined && v !== null && String(v).trim()) out.set(normalizeText(v), String(t.abbreviation || t.team_id || "").toUpperCase()); }
  } catch (_) {}
  try {
    const aliases = await pgClient`SELECT a.team_id, t.abbreviation, a.alias_normalized FROM ref.team_aliases a LEFT JOIN ref.teams t ON t.team_id = a.team_id WHERE a.active = 1`;
    for (const a of aliases) { const id = String(a.abbreviation || a.team_id || "").toUpperCase(); if (!id) continue; if (a.alias_normalized) out.set(normalizeText(a.alias_normalized), id); }
  } catch (_) {}
  return out;
}
async function loadPlayerAliasMap(pgClient) {
  const out = new Map();
  try {
    const aliases = await pgClient`SELECT player_id, alias_normalized AS alias_value FROM ref.player_aliases WHERE alias_normalized IS NOT NULL LIMIT 20000`;
    for (const a of aliases) {
      const key = normalizeText(a.alias_value);
      const pid = numberOrNull(a.player_id);
      if (!key || pid === null) continue;
      if (!out.has(key)) out.set(key, new Set());
      out.get(key).add(Number(pid));
    }
  } catch (_) {}
  return out;
}
function enrichParlayRows(rows, teamAliases, playerAliases) {
  const out = [];
  for (const row of rows || []) {
    const homeId = teamAliases.get(normalizeText(row.home_team)) || null;
    const awayId = teamAliases.get(normalizeText(row.away_team)) || null;
    const aliasPlayers = playerAliases.get(row.player_name_normalized) || new Set();
    out.push({ ...row, home_team_id: homeId, away_team_id: awayId, source_team_pair_key: teamPairKey(homeId, awayId), alias_player_ids: [...aliasPlayers] });
  }
  return out;
}
function sourceRowHasExternallyValidPlayer(sourceRow) {
  if (!sourceRow || sourceRow.normalization_status !== "usable_player_prop_line") return false;
  const hasAlias = Array.isArray(sourceRow.alias_player_ids) && sourceRow.alias_player_ids.length > 0;
  if (hasAlias) return true;
  return !!likelyHumanName(sourceRow.player_name);
}
function bestPreparedMatch(sourceRow, index) {
  if (sourceRow && sourceRow.normalization_status && sourceRow.normalization_status !== "usable_player_prop_line") return { status: sourceRow.normalization_status, row: null, rows: [], candidates: 0, choice_reason: "normalization_quarantine_before_prepared_match" };
  const name = sourceRow.player_name_normalized;
  const prop = sourceRow.canonical_prop_key;
  if (!name || !prop) return { status: "unmatched_missing_player_or_prop", row: null, rows: [], candidates: 0, choice_reason: "missing_player_or_prop" };
  const line = lineKey(sourceRow.line_value);
  const pair = sourceRow.source_team_pair_key || "";
  const playerIds = (sourceRow.alias_player_ids || []).map(x => String(x)).filter(Boolean);
  const attempts = [];
  if (pair) {
    for (const pid of playerIds) attempts.push([index.teamPairPlayerIdPropLine, `${pair}|${pid}|${prop}|${line}`, "matched_prepared_team_pair_player_alias_prop_line"]);
    attempts.push([index.teamPairNamePropLine, `${pair}|${name}|${prop}|${line}`, "matched_prepared_team_pair_player_prop_line"]);
    for (const pid of playerIds) attempts.push([index.teamPairPlayerIdProp, `${pair}|${pid}|${prop}`, "matched_prepared_team_pair_player_alias_prop"]);
    attempts.push([index.teamPairNameProp, `${pair}|${name}|${prop}`, "matched_prepared_team_pair_player_prop"]);
    for (const [map, key, status] of attempts) { const rows = map.get(key) || []; if (rows.length) return choosePreparedCandidate(rows, sourceRow, status); }
    if (sourceRowHasExternallyValidPlayer(sourceRow)) return { status: "external_valid_player_resolved_not_on_prepared_board", row: null, rows: [], candidates: 0, choice_reason: "source_team_pair_and_player_resolved_but_prop_not_present_on_prepared_board" };
    return { status: "no_prepared_match_after_required_team_pair_resolver", row: null, rows: [], candidates: 0, choice_reason: "source_team_pair_resolved_so_global_name_fallback_blocked_to_prevent_wrong_game_match" };
  }
  for (const pid of playerIds) attempts.push([index.playerIdPropLine, `${pid}|${prop}|${line}`, "matched_prepared_player_alias_prop_line_no_team_pair"]);
  attempts.push([index.namePropLine, `${name}|${prop}|${line}`, "matched_prepared_player_prop_line_no_team_pair"]);
  for (const pid of playerIds) attempts.push([index.playerIdProp, `${pid}|${prop}`, "matched_prepared_player_alias_prop_no_team_pair"]);
  attempts.push([index.nameProp, `${name}|${prop}`, "matched_prepared_player_prop_no_team_pair"]);
  for (const [map, key, status] of attempts) { const rows = map.get(key) || []; if (rows.length) return choosePreparedCandidate(rows, sourceRow, status); }
  return { status: "no_prepared_match_no_resolved_team_pair", row: null, rows: [], candidates: 0, choice_reason: "raw_team_pair_unresolved_or_absent" };
}
async function permanentlyRecordMarketPropContext(pgClient) {
  const rows = await pgClient`SELECT probe_row_id, batch_id, slate_window_key, official_date, prepared_row_id, source_key, source_event_id, source_line_id, game_pk, resolved_mlb_player_id, source_player_name, canonical_prop_key, source_market_key, line_value, price_american, price_decimal, outcome_side, mapping_status, coverage_status, raw_json, created_at FROM market.context_probe_player_props`.catch(() => []);
  if (!rows.length) return { copied: 0, checked: 0 };
  const cols = ["probe_row_id", "batch_id", "slate_window_key", "official_date", "prepared_row_id", "source_key", "source_event_id", "source_line_id", "game_pk", "resolved_mlb_player_id", "source_player_name", "canonical_prop_key", "source_market_key", "line_value", "price_american", "price_decimal", "outcome_side", "mapping_status", "coverage_status", "raw_json", "captured_at"];
  const withCapturedAt = rows.map(r => ({ ...r, captured_at: nowUtc() }));
  const CHUNK = 200;
  let copied = 0;
  for (let i = 0; i < withCapturedAt.length; i += CHUNK) {
    const chunk = withCapturedAt.slice(i, i + CHUNK);
    await pgClient`INSERT INTO archive.market_prop_context_history ${pgClient(chunk, ...cols)} ON CONFLICT (probe_row_id) DO NOTHING`.catch(() => {});
    copied += chunk.length;
  }
  return { copied, checked: rows.length };
}

async function prunePlayerPropRows(pgClient, boardWindowDates, slateWindowKey, config = modeConfig()) {
  const deleted = {};
  await pgClient`CREATE TABLE IF NOT EXISTS archive.market_prop_context_history (probe_row_id TEXT PRIMARY KEY, batch_id TEXT, slate_window_key TEXT, official_date TEXT, prepared_row_id TEXT, source_key TEXT, source_event_id TEXT, source_line_id TEXT, game_pk BIGINT, resolved_mlb_player_id BIGINT, source_player_name TEXT, canonical_prop_key TEXT, source_market_key TEXT, line_value DOUBLE PRECISION, price_american DOUBLE PRECISION, price_decimal DOUBLE PRECISION, outcome_side TEXT, mapping_status TEXT, coverage_status TEXT, raw_json TEXT, created_at TIMESTAMPTZ, captured_at TIMESTAMPTZ DEFAULT now())`.catch(() => {});
  const archived = await permanentlyRecordMarketPropContext(pgClient);
  deleted.archive_before_cleanup = archived;
  const datesLiteral = "{" + boardWindowDates.map(d => `"${String(d).replace(/"/g, '\\"')}"`).join(",") + "}";
  if (config.prop_family === "hitter") {
    for (const sourceKey of LEGACY_PARLAY_SOURCE_KEYS) {
      await pgClient`DELETE FROM market.context_probe_player_props WHERE source_key = ${sourceKey} AND (slate_window_key <> ${slateWindowKey} OR NOT (official_date::text = ANY(${datesLiteral}::text[])))`;
      await pgClient`DELETE FROM market.context_probe_player_props WHERE source_key = ${sourceKey} AND slate_window_key = ${slateWindowKey}`;
    }
  }
  const parlayLike = `parlay_api_%_${config.source_suffix}`;
  await pgClient`DELETE FROM market.context_probe_player_props WHERE source_key LIKE ${parlayLike} AND (slate_window_key <> ${slateWindowKey} OR NOT (official_date::text = ANY(${datesLiteral}::text[])))`;
  await pgClient`DELETE FROM market.context_probe_player_props WHERE source_key LIKE ${parlayLike} AND slate_window_key = ${slateWindowKey}`;
  deleted.context_probe_player_props = `deleted_${config.prop_family}_parlay_source_rows_outside_or_current_board_window_all_books`;
  const covGradeLike = `${config.coverage_prefix}_%`;
  const covModeLike = `%"mode":"${config.mode}"%`;
  await pgClient`DELETE FROM market.context_probe_coverage WHERE (coverage_grade LIKE ${covGradeLike} OR details_json LIKE ${covModeLike}) AND (slate_window_key <> ${slateWindowKey} OR NOT (official_date::text = ANY(${datesLiteral}::text[])))`;
  await pgClient`DELETE FROM market.context_probe_coverage WHERE (coverage_grade LIKE ${covGradeLike} OR details_json LIKE ${covModeLike}) AND slate_window_key = ${slateWindowKey}`;
  deleted.context_probe_coverage = `deleted_only_${config.prop_family}_prop_context_rows_no_teams_coverage_wipe`;
  const issueLike = `${config.issue_prefix}_%`;
  await pgClient`DELETE FROM market.context_probe_issues WHERE issue_type LIKE ${issueLike} AND (slate_window_key <> ${slateWindowKey} OR NOT (official_date::text = ANY(${datesLiteral}::text[])))`;
  await pgClient`DELETE FROM market.context_probe_issues WHERE issue_type LIKE ${issueLike} AND slate_window_key = ${slateWindowKey}`;
  deleted.context_probe_issues = `deleted_only_${config.prop_family}_prop_issues`;
  await pgClient`DELETE FROM market.context_probe_batches WHERE mode = ${config.mode} AND (slate_window_key <> ${slateWindowKey} OR NOT (window_start_date::text = ANY(${datesLiteral}::text[])) OR NOT (window_end_date::text = ANY(${datesLiteral}::text[])))`;
  await pgClient`DELETE FROM market.context_probe_batches WHERE mode = ${config.mode} AND slate_window_key = ${slateWindowKey}`;
  deleted.context_probe_batches = `deleted_${config.prop_family}_prop_batches_outside_or_current_board_window`;
  return deleted;
}
async function findRecoverablePlayerPropBatch(pgClient, requestId, config, slateWindowKey) {
  if (!requestId) return null;
  const rows = await pgClient`SELECT batch_id, request_id, run_id, worker_name, worker_version, mode, slate_window_key, window_start_date, window_end_date, status, prepared_rows_read, prepared_games_checked, prepared_players_checked, prepared_prop_keys_checked, odds_api_config_present, parlay_inventory_rows_seen, parlay_props_mapped_to_prepared, parlay_coverage_grade, warning_count, blocker_count, certification_status, certification_grade, created_at, updated_at
    FROM market.context_probe_batches
    WHERE request_id=${requestId} AND mode=${config.mode} AND slate_window_key=${slateWindowKey} AND status LIKE 'running_%'
    ORDER BY updated_at DESC, created_at DESC LIMIT 1`;
  return rows[0] || null;
}
async function finalizePlayerPropBatchFromEvidence(pgClient, input, config, batch, preparedRows, today, tomorrow, slateWindowKey, retention, prune, reason = "evidence_finalizer") {
  if (!batch || !batch.batch_id) return null;
  const batchId = batch.batch_id;
  const countsRows = await pgClient`SELECT COUNT(*) AS prop_rows, COUNT(DISTINCT prepared_row_id) AS prepared_rows, SUM(CASE WHEN prepared_row_id IS NOT NULL AND prepared_row_id <> '' THEN 1 ELSE 0 END) AS matched_rows, COUNT(DISTINCT source_key) AS source_keys, COUNT(DISTINCT game_pk) AS games, COUNT(DISTINCT resolved_mlb_player_id) AS players, COUNT(DISTINCT canonical_prop_key) AS prop_keys, MIN(created_at) AS first_at, MAX(created_at) AS last_at FROM market.context_probe_player_props WHERE batch_id=${batchId}`;
  const counts = countsRows[0] || {};
  const propRows = Number(counts.prop_rows || 0);
  if (propRows <= 0) return null;
  const covCountRows = await pgClient`SELECT COUNT(*) AS coverage_rows FROM market.context_probe_coverage WHERE batch_id=${batchId}`;
  let coverageRowsWritten = Number(covCountRows[0] && covCountRows[0].coverage_rows || 0);
  const backendSequenceFinalizer = isBackendMarketSequence(input);
  if (coverageRowsWritten === 0 && !backendSequenceFinalizer && Array.isArray(preparedRows) && preparedRows.length && !marketFullSoftDeadlineExceeded(Date.now() - 1, 0)) {
    const matchedIdRows = await pgClient`SELECT DISTINCT prepared_row_id FROM market.context_probe_player_props WHERE batch_id=${batchId} AND prepared_row_id IS NOT NULL AND prepared_row_id <> ''`;
    const matchedIds = new Set(matchedIdRows.map(r => String(r.prepared_row_id)));
    const coverageRows = preparedRows.map(row => {
      const has = matchedIds.has(String(row.prepared_row_id));
      return { coverage_row_id: rid(`mcp_${config.prop_family}_cov`), batch_id: batchId, slate_window_key: slateWindowKey, official_date: row.official_date, prepared_row_id: row.prepared_row_id, source_key: row.source_key, game_pk: Number(row.official_game_pk), resolved_mlb_player_id: Number(row.resolved_mlb_player_id), canonical_prop_key: row.canonical_prop_key, board_line_value: numberOrNull(row.line_value), game_market_status: "TEAMS_GAME_ODDS_NOT_IN_PLAYER_PROP_SCOPE", player_prop_market_status: has ? `${config.coverage_prefix}_PARLAY_REFERENCE_MATCHED` : `${config.coverage_prefix}_PARLAY_REFERENCE_NOT_MATCHED`, market_context_status: has ? `${config.coverage_prefix}_LINE_CONTEXT_PRESENT` : `${config.coverage_prefix}_LINE_CONTEXT_NOT_FOUND`, coverage_grade: has ? `${config.coverage_prefix}_PARLAY_REFERENCE_MATCHED` : `${config.coverage_prefix}_PARLAY_REFERENCE_MISSING`, details_json: safeJson({ mode: config.mode, prop_family: config.prop_family, source_worker: WORKER_NAME, source_key: row.source_key, source_prop_name: row.source_prop_name, line_value: row.line_value, official_game_time_utc: row.official_game_time_utc, no_teams_game_odds: true, no_market_current_lines: true, recovered_batch_finalizer: true }, 3000) };
    });
    const cols = ["coverage_row_id", "batch_id", "slate_window_key", "official_date", "prepared_row_id", "source_key", "game_pk", "resolved_mlb_player_id", "canonical_prop_key", "board_line_value", "game_market_status", "player_prop_market_status", "market_context_status", "coverage_grade", "details_json"];
    const CHUNK = MARKET_FULL_BACKEND_BATCH_CHUNK_SIZE;
    for (let i = 0; i < coverageRows.length; i += CHUNK) await pgClient`INSERT INTO market.context_probe_coverage ${pgClient(coverageRows.slice(i, i + CHUNK), ...cols)}`;
    coverageRowsWritten = coverageRows.length;
  }
  const issueRowsRes = await pgClient`SELECT COUNT(*) AS issue_rows FROM market.context_probe_issues WHERE batch_id=${batchId}`;
  const issueRows = issueRowsRes[0] || {};
  const matchedPrepared = Number(counts.prepared_rows || 0);
  const warningCount = Number(batch.warning_count || 0) || (propRows > matchedPrepared ? 1 : 0) || (coverageRowsWritten === 0 ? 1 : 0) || (backendSequenceFinalizer ? 1 : 0);
  const blockerCount = 0;
  const coverageGrade = matchedPrepared > 0 ? "NORMALIZED_PARLAY_CONTEXT_PARTIAL_MATCH" : "PARLAY_NORMALIZED_RESOLVER_UNMATCHED";
  const certification = "MARKET_PLAYER_PROP_CONTEXT_EVIDENCE_WRITTEN";
  const certificationGrade = warningCount ? "PASS_WITH_WARNINGS" : "PASS";
  const status = "completed_player_prop_context_evidence_written";
  const output = { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || batch.request_id || null, run_id: input.run_id || batch.run_id || null, batch_id: batchId, mode: config.mode, prop_family: config.prop_family, status, certification, certification_grade: certificationGrade, rows_read: Number(batch.prepared_rows_read || (preparedRows || []).length || 0), rows_written: propRows + coverageRowsWritten + Number(issueRows.issue_rows || 0) + 1, external_calls_performed: Number(input.external_calls_performed || 0), retention, prune, recovered_or_timebox_finalized: true, finalizer_reason: reason, backend_sequence_terminal_finalizer: backendSequenceFinalizer, coverage_write_skipped_for_backend_timebox: backendSequenceFinalizer && coverageRowsWritten === 0, evidence_summary: { player_prop_rows: propRows, matched_player_prop_rows: Number(counts.matched_rows || 0), distinct_matched_prepared_rows: matchedPrepared, coverage_rows: coverageRowsWritten, issue_rows: Number(issueRows.issue_rows || 0), source_keys: Number(counts.source_keys || 0), games: Number(counts.games || 0), players: Number(counts.players || 0), prop_keys: Number(counts.prop_keys || 0), first_player_prop_at: counts.first_at || null, last_player_prop_at: counts.last_at || null }, boundaries: { no_teams_game_odds: true, opposite_prop_family_not_in_this_run: true, no_market_current_lines: true, no_prepared_board_mutation: true, no_score_db_mutation: true, no_scoring: true, no_ranking: true, no_matrix: true, no_final_board: true } };
  await pgClient`UPDATE market.context_probe_batches SET worker_version=${VERSION}, status=${status}, parlay_props_mapped_to_prepared=${Number(counts.matched_rows || 0)}, parlay_coverage_grade=${coverageGrade}, warning_count=${warningCount}, blocker_count=${blockerCount}, certification_status=${certification}, certification_grade=${certificationGrade}, output_json=${safeJson(output, 9000)}, updated_at=now() WHERE batch_id=${batchId}`;
  return output;
}
function writeIssue(issueRows, batchId, slateWindowKey, officialDate, severity, issueType, gamePk, preparedRowId, sourceKey, reason, details, config = modeConfig()) {
  issueRows.push({ issue_id: rid(`issue_${config.prop_family}_prop`), batch_id: batchId, slate_window_key: slateWindowKey, official_date: officialDate, severity, issue_type: issueType, game_pk: gamePk || null, prepared_row_id: preparedRowId || null, source_key: sourceKey || PARLAY_SOURCE_KEY, reason: safeText(reason, 900), details_json: safeJson({ mode: config.mode, prop_family: config.prop_family, ...details }, 3000) });
}
const FRESHNESS_BUFFER_MS = 3 * 60 * 60 * 1000; // 3 hours - skip re-mining if current data for this mode is still this fresh

async function lastSuccessfulRunAge(env, mode) {
  if (!env.HYPERDRIVE) return null;
  const client = pg(env);
  try {
    const rows = await client.unsafe(
      "SELECT MAX(updated_at) AS last_run FROM market.context_probe_batches WHERE mode=$1 AND certification_status='MARKET_PLAYER_PROP_CONTEXT_EVIDENCE_WRITTEN'",
      [mode]
    );
    return rows && rows[0] && rows[0].last_run ? new Date(rows[0].last_run).getTime() : null;
  } catch (_) {
    return null;
  } finally {
    await client.end({ timeout: 1 }).catch(() => {});
  }
}

async function runPlayerPropContext(env, input = {}) {
  const startedMs = Date.now();
  const config = modeConfig(input);
  if (!input.force_refresh) {
    const lastRun = await lastSuccessfulRunAge(env, config.mode);
    if (lastRun !== null) {
      const ageMs = Date.now() - lastRun;
      if (ageMs < FRESHNESS_BUFFER_MS) {
        return {
          ok: true,
          data_ok: true,
          version: VERSION,
          worker_name: WORKER_NAME,
          job_key: JOB_KEY,
          request_id: input.request_id || null,
          run_id: input.run_id || null,
          mode: config.mode,
          prop_family: config.prop_family,
          status: "skipped_still_fresh",
          certification: "MARKET_PLAYER_PROP_CONTEXT_SKIPPED_WITHIN_FRESHNESS_BUFFER",
          certification_grade: "PASS",
          freshness_buffer_ms: FRESHNESS_BUFFER_MS,
          last_run_age_ms: ageMs,
          last_run_age_minutes: Math.round(ageMs / 60000),
          note: `Current ${config.prop_family} prop market context is under 3 hours old, so the external ParlayAPI multi-probe fetch was skipped to avoid consuming credits unnecessarily. Pass {force_refresh: true} to bypass this buffer.`,
          rows_read: 0,
          rows_written: 0,
          external_calls_performed: 0,
          no_teams_game_odds: true,
          no_market_current_lines_writes: true,
          no_scoring: true,
          no_ranking: true,
          no_final_board: true,
          elapsed_ms: Date.now() - startedMs,
          timestamp_utc: nowUtc()
        };
      }
    }
  }
  const requestId = input.request_id || rid(config.request_prefix);
  const runId = input.run_id || rid("run");
  const batchId = rid(config.batch_prefix);
  const pgClient = pg(env);
  try {
    const nowIsoForWindow = new Date().toISOString();
    const realBoardDateRowsPrelim = await pgClient`SELECT DISTINCT official_date::text AS official_date FROM score.board_prepared_current WHERE pickable_safe = 1 AND official_game_time_utc IS NOT NULL AND official_game_time_utc > ${nowIsoForWindow}`;
    const realBoardDatesPrelim = realBoardDateRowsPrelim.map(r => r.official_date).filter(Boolean);
    const boardWindowDates = [...new Set([...realBoardDatesPrelim, ptDate(0), ptDate(1)])].sort();
    const today = boardWindowDates[0];
    const tomorrow = boardWindowDates[boardWindowDates.length - 1];
    const slateWindowKey = `${today}_${tomorrow}`;
    const retention = { today, tomorrow, slate_window_key: slateWindowKey, board_window_dates: boardWindowDates, policy: `board_scoped_not_yet_started_games_only_for_${config.prop_family}_prop_line_context` };

    if (!env.HYPERDRIVE) return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, run_id: runId, mode: config.mode, status: "blocked_missing_db_bindings", certification: `MARKET_${config.issue_prefix}_CONTEXT_BLOCKED_MISSING_DB_BINDINGS`, certification_grade: "BLOCKED", missing_db_bindings: ["HYPERDRIVE"], rows_read: 0, rows_written: 0, external_calls_performed: 0, retention, timestamp_utc: nowUtc() };

    const preparedRows = await loadPreparedRows(pgClient, boardWindowDates, config);
    const backendSequence = isBackendMarketSequence(input);
    const existingRunningBatch = await findRecoverablePlayerPropBatch(pgClient, requestId, config, slateWindowKey);
    if (existingRunningBatch) {
      const recovered = await finalizePlayerPropBatchFromEvidence(pgClient, input, config, existingRunningBatch, preparedRows, today, tomorrow, slateWindowKey, retention, { skipped_current_window_prune_for_existing_running_batch: true }, "resume_existing_running_batch_with_written_evidence");
      if (recovered) return recovered;
    }
    const prune = await prunePlayerPropRows(pgClient, boardWindowDates, slateWindowKey, config);
    const gamePks = [...new Set(preparedRows.map(r => Number(r.official_game_pk)).filter(Number.isFinite))];
    const playerIds = [...new Set(preparedRows.map(r => Number(r.resolved_mlb_player_id)).filter(Number.isFinite))];
    const propKeys = [...new Set(preparedRows.map(r => String(r.canonical_prop_key || "")).filter(Boolean))];

    await pgClient`INSERT INTO market.context_probe_batches (batch_id, request_id, run_id, worker_name, worker_version, mode, slate_window_key, window_start_date, window_end_date, status, prepared_rows_read, prepared_games_checked, prepared_players_checked, prepared_prop_keys_checked, odds_api_config_present, parlay_inventory_rows_seen, parlay_props_mapped_to_prepared, parlay_coverage_grade, warning_count, blocker_count, certification_status, certification_grade, output_json, created_at, updated_at)
      VALUES (${batchId}, ${requestId}, ${runId}, ${WORKER_NAME}, ${VERSION}, ${config.mode}, ${slateWindowKey}, ${today}, ${tomorrow}, ${`running_${config.prop_family}_prop_context_started`}, ${preparedRows.length}, ${gamePks.length}, ${playerIds.length}, ${propKeys.length}, ${sourceHas(env, "ODDS_API_KEY") ? 1 : 0}, 0, 0, 'RUNNING', 0, 0, ${`MARKET_${config.issue_prefix}_CONTEXT_RUNNING_STARTED`}, 'RUNNING', ${safeJson({ retention, started_heartbeat: true, request_id: requestId, run_id: runId, prop_family: config.prop_family }, 3000)}, now(), now())`;
    const issues = [];
    let blockerCount = 0; let warningCount = 0;

    if (!preparedRows.length) {
      blockerCount += 1;
      const output = { retention, prune, reason: "No prepared-safe player prop rows found for today/tomorrow." };
      await pgClient`UPDATE market.context_probe_batches SET status='blocked_no_prepared_safe_player_prop_rows', certification_status='MARKET_PLAYER_PROP_CONTEXT_NO_PREPARED_SAFE_ROWS', certification_grade='BLOCKED', warning_count=${warningCount}, blocker_count=${blockerCount}, output_json=${safeJson(output, 9000)}, updated_at=now() WHERE batch_id=${batchId}`;
      return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, run_id: runId, batch_id: batchId, mode: config.mode, status: "blocked_no_prepared_safe_player_prop_rows", certification: "MARKET_PLAYER_PROP_CONTEXT_NO_PREPARED_SAFE_ROWS", certification_grade: "BLOCKED", rows_read: 0, rows_written: 1, external_calls_performed: 0, retention, prune, timestamp_utc: nowUtc() };
    }

    const liveParlayFetchAllowed = shouldAttemptLiveParlayFetch(input);
    await pgClient`UPDATE market.context_probe_batches SET status=${`running_${config.prop_family}_parlay_prop_fetch`}, certification_status=${`MARKET_${config.issue_prefix}_CONTEXT_RUNNING_PARLAY_FETCH`}, output_json=${safeJson({ retention, request_id: requestId, run_id: runId, prop_family: config.prop_family, phase: "parlay_fetch_gate", live_parlay_fetch_allowed: liveParlayFetchAllowed }, 4000)}, updated_at=now() WHERE batch_id=${batchId}`;
    let parlay;
    if (!liveParlayFetchAllowed) parlay = syntheticParlaySkippedForBackendChain(input, config);
    else {
      try {
        parlay = await promiseWithTimeout(fetchParlayProps(env, input, config), isBackendMarketSequence(input) ? MARKET_FULL_BACKEND_FETCH_TIMEOUT_MS : PARLAY_TOTAL_FETCH_BUDGET_MS + 5000, `parlay_${config.prop_family}_total_fetch_budget_timeout`);
      } catch (err) {
        parlay = { ok: false, external_calls: 0, http_status: null, response_preview: safeText(err && err.message ? err.message : err), rows: [], normalized: [], rows_seen: 0, normalized_player_prop_rows: 0, total_fetch_budget_timeout: true, endpoint: await configuredParlayEndpoint(env, input), parlay_total_fetch_budget_ms: (isBackendMarketSequence(input) ? MARKET_FULL_BACKEND_FETCH_BUDGET_MS : PARLAY_TOTAL_FETCH_BUDGET_MS), parlay_fetch_timeout_ms: (isBackendMarketSequence(input) ? MARKET_FULL_BACKEND_FETCH_TIMEOUT_MS : PARLAY_FETCH_TIMEOUT_MS) };
      }
    }
    const externalCalls = parlay.external_calls || 0;
    let normalizedRowsForMapping = parlay.normalized || [];
    let normalizedRowsTruncatedForBackendTimebox = false;
    const normalizedRowsSeenBeforeBackendCap = normalizedRowsForMapping.length;
    if (backendSequence && normalizedRowsForMapping.length > MARKET_FULL_BACKEND_MAX_NORMALIZED_PARLAY_ROWS && input.full_market_prop_evidence_scan !== true) { normalizedRowsForMapping = normalizedRowsForMapping.slice(0, MARKET_FULL_BACKEND_MAX_NORMALIZED_PARLAY_ROWS); normalizedRowsTruncatedForBackendTimebox = true; }
    await pgClient`UPDATE market.context_probe_batches SET status=${`running_${config.prop_family}_mapping_player_props`}, parlay_inventory_rows_seen=${Number((parlay && parlay.rows_seen) || normalizedRowsSeenBeforeBackendCap || 0)}, updated_at=now() WHERE batch_id=${batchId}`;
    const teamAliases = await loadTeamAliasMap(pgClient);
    const playerAliases = await loadPlayerAliasMap(pgClient);
    const enrichedParlayRows = enrichParlayRows(normalizedRowsForMapping, teamAliases, playerAliases);
    if (!parlay.ok) {
      if (parlay.missing_key || parlay.missing_config) blockerCount += 1; else warningCount += 1;
      writeIssue(issues, batchId, slateWindowKey, today, parlay.missing_key || parlay.missing_config ? "BLOCKER" : "WARNING", parlay.missing_key ? `${config.issue_prefix}_PARLAY_API_KEY_MISSING` : (parlay.missing_config ? `${config.issue_prefix}_PARLAY_API_CONFIG_MISSING` : `${config.issue_prefix}_PARLAY_API_FETCH_FAILED`), null, null, PARLAY_SOURCE_KEY, `Parlay API ${config.prop_family} prop fetch did not return usable data`, { parlay_status: parlay }, config);
    }

    const index = buildPreparedIndex(preparedRows);
    const propRows = [];
    const matchedPrepared = new Map();
    let matched = 0; let noMatch = 0; let ambiguous = 0; let sourceRowsWithOverUnder = 0;
    const sourceRowStatusCounts = {}; const sourceKeyStatusCounts = {};
    let externalValidUnanchoredRows = 0; let quarantinedRows = 0; let trueHardUnmatchedRows = 0;
    const preparedUniquePlayerPropUnits = new Set(preparedRows.map(preparedUnitKey).filter(Boolean));
    const coveredUnits = { primary_comparison_book: new Set(), pickem_comparison: new Set(), exchange_or_sharp_reference: new Set(), requires_shape_validation: new Set(), total_non_owned: new Set(), owned_board_excluded_from_vendor_decision: new Set(), dfs_pickem_quarantine_not_primary_book_comparison: new Set() };
    const matchedBySourceKey = {}; const uniqueMatchedBySourceKey = {};
    for (const sourceRow of enrichedParlayRows) {
      const match = bestPreparedMatch(sourceRow, index);
      const matchedRow = match.row;
      if (match.status.startsWith("matched")) matched += 1;
      else if (match.status.startsWith("ambiguous")) ambiguous += 1;
      else noMatch += 1;
      const sourceKey = sourceKeyForParlay(sourceRow, config);
      const normalizedStatus = sourceRow.normalization_status || "unknown";
      const statusBucket = match.status.startsWith("matched") ? "board_matched" : (match.status === "external_valid_player_resolved_not_on_prepared_board" ? "external_valid_unanchored" : (match.status.startsWith("quarantined") || normalizedStatus.startsWith("quarantined") ? "quarantined" : "true_hard_unmatched"));
      if (statusBucket === "external_valid_unanchored") externalValidUnanchoredRows += 1;
      else if (statusBucket === "quarantined") quarantinedRows += 1;
      else if (statusBucket === "true_hard_unmatched") trueHardUnmatchedRows += 1;
      sourceRowStatusCounts[statusBucket] = (sourceRowStatusCounts[statusBucket] || 0) + 1;
      if (!sourceKeyStatusCounts[sourceKey]) sourceKeyStatusCounts[sourceKey] = { rows: 0, board_matched_rows: 0, external_valid_unanchored_rows: 0, quarantined_rows: 0, true_hard_unmatched_rows: 0 };
      sourceKeyStatusCounts[sourceKey].rows += 1;
      sourceKeyStatusCounts[sourceKey][`${statusBucket}_rows`] += 1;
      for (const r of (match.rows || (matchedRow ? [matchedRow] : []))) matchedPrepared.set(r.prepared_row_id, true);
      if (matchedRow) {
        matchedBySourceKey[sourceKey] = (matchedBySourceKey[sourceKey] || 0) + 1;
        const unit = preparedUnitKey(matchedRow);
        if (unit) {
          if (!uniqueMatchedBySourceKey[sourceKey]) uniqueMatchedBySourceKey[sourceKey] = new Set();
          uniqueMatchedBySourceKey[sourceKey].add(unit);
          const quality = sourceRow.book_quality || bookmakerQuality(sourceRow.bookmaker);
          if (!coveredUnits[quality]) coveredUnits[quality] = new Set();
          coveredUnits[quality].add(unit);
          if (quality !== "owned_board_excluded_from_vendor_decision" && quality !== "dfs_pickem_quarantine_not_primary_book_comparison") coveredUnits.total_non_owned.add(unit);
        }
      }
      const sides = [];
      if (sourceRow.over_price !== null) sides.push({ side: "over", price: sourceRow.over_price });
      if (sourceRow.under_price !== null) sides.push({ side: "under", price: sourceRow.under_price });
      if (!sides.length && sourceRow.price_american !== null) sides.push({ side: sourceRow.side || "listed", price: sourceRow.price_american });
      if (sides.length) sourceRowsWithOverUnder += 1;
      if (!sides.length) sides.push({ side: "line_present_price_missing", price: null });
      for (const s of sides) {
        propRows.push({
          probe_row_id: rid(`mcp_${config.prop_family}_prop`), batch_id: batchId, slate_window_key: slateWindowKey, official_date: matchedRow ? matchedRow.official_date : today,
          prepared_row_id: matchedRow ? matchedRow.prepared_row_id : null, source_key: sourceKeyForParlay(sourceRow, config), source_event_id: sourceRow.source_event_id, source_line_id: sourceRow.source_line_id,
          game_pk: matchedRow ? Number(matchedRow.official_game_pk) : null, resolved_mlb_player_id: matchedRow ? Number(matchedRow.resolved_mlb_player_id) : null,
          source_player_name: sourceRow.player_name, canonical_prop_key: sourceRow.canonical_prop_key, source_market_key: sourceRow.market_key, line_value: sourceRow.line_value,
          price_american: s.price, price_decimal: americanToDecimal(s.price), outcome_side: s.side, mapping_status: match.status,
          coverage_status: matchedRow ? `parlay_${config.prop_family}_prop_line_matched_to_prepared` : (match.status === "external_valid_player_resolved_not_on_prepared_board" ? `parlay_valid_external_${config.prop_family}_not_on_prepared_board` : `parlay_${config.prop_family}_prop_line_not_matched_to_prepared`),
          raw_json: compactRawJson({ mode: config.mode, prop_family: config.prop_family, parlay: { ...sourceRow, raw: undefined }, normalized_context: { bookmaker_key: sourceRow.bookmaker_key, book_quality: sourceRow.book_quality, normalization_status: sourceRow.normalization_status, normalization_issues: sourceRow.normalization_issues || [], threshold_value: sourceRow.threshold_value || null }, resolver: { raw_home_team: sourceRow.home_team, raw_away_team: sourceRow.away_team, home_team_id: sourceRow.home_team_id, away_team_id: sourceRow.away_team_id, source_team_pair_key: sourceRow.source_team_pair_key, alias_player_ids: sourceRow.alias_player_ids || [], candidates: match.candidates || 0, choice_reason: match.choice_reason || null }, prepared_match: matchedRow ? { prepared_row_id: matchedRow.prepared_row_id, source_key: matchedRow.source_key, player_name: matchedRow.player_name, canonical_prop_key: matchedRow.canonical_prop_key, line_value: matchedRow.line_value, game_pk: matchedRow.official_game_pk } : null })
        });
      }
    }

    if (parlay.ok && (parlay.normalized || []).length === 0) { warningCount += 1; writeIssue(issues, batchId, slateWindowKey, today, "WARNING", `${config.issue_prefix}_PARLAY_API_NO_MARKETS_NORMALIZED`, null, null, PARLAY_SOURCE_KEY, `Parlay API returned rows but no supported ${config.prop_family} markets normalized`, { rows_seen: parlay.rows_seen || 0, detected_rows_path: parlay.detected_rows_path }, config); }
    if (parlay.ok && matched === 0 && (parlay.normalized || []).length > 0) { warningCount += 1; writeIssue(issues, batchId, slateWindowKey, today, "WARNING", `${config.issue_prefix}_PARLAY_API_NO_PREPARED_MATCHES`, null, null, PARLAY_SOURCE_KEY, `Parlay API ${config.prop_family} prop rows normalized but did not match prepared-safe board rows`, { normalized_player_prop_rows: parlay.normalized_player_prop_rows, prepared_rows: preparedRows.length, team_aliases_loaded: teamAliases.size, player_aliases_loaded: playerAliases.size }, config); }

    const coverageRows = [];
    for (const row of preparedRows) {
      const has = matchedPrepared.has(row.prepared_row_id);
      coverageRows.push({ coverage_row_id: rid(`mcp_${config.prop_family}_cov`), batch_id: batchId, slate_window_key: slateWindowKey, official_date: row.official_date, prepared_row_id: row.prepared_row_id, source_key: row.source_key, game_pk: Number(row.official_game_pk), resolved_mlb_player_id: Number(row.resolved_mlb_player_id), canonical_prop_key: row.canonical_prop_key, board_line_value: numberOrNull(row.line_value), game_market_status: "TEAMS_GAME_ODDS_NOT_IN_PLAYER_PROP_SCOPE", player_prop_market_status: has ? `${config.coverage_prefix}_PARLAY_REFERENCE_MATCHED` : `${config.coverage_prefix}_PARLAY_REFERENCE_NOT_MATCHED`, market_context_status: has ? `${config.coverage_prefix}_LINE_CONTEXT_PRESENT` : `${config.coverage_prefix}_LINE_CONTEXT_NOT_FOUND`, coverage_grade: has ? `${config.coverage_prefix}_PARLAY_REFERENCE_MATCHED` : `${config.coverage_prefix}_PARLAY_REFERENCE_MISSING`, details_json: safeJson({ mode: config.mode, prop_family: config.prop_family, source_worker: WORKER_NAME, source_key: row.source_key, line_value: row.line_value, official_game_time_utc: row.official_game_time_utc, no_teams_game_odds: true, no_market_current_lines: true }, 3000) });
    }

    if (normalizedRowsTruncatedForBackendTimebox) warningCount += 1;
    let effectivePropRows = propRows;
    let propEvidenceTruncatedForBackendTimebox = false;
    if (backendSequence && propRows.length > MARKET_FULL_BACKEND_MAX_PROP_EVIDENCE_ROWS && input.full_market_prop_evidence_scan !== true) {
      const max = MARKET_FULL_BACKEND_MAX_PROP_EVIDENCE_ROWS;
      const selected = []; const seenKeys = new Set(); const seenPrepared = new Set();
      for (const row of propRows) { const p = row.prepared_row_id ? String(row.prepared_row_id) : ""; if (!p || seenPrepared.has(p)) continue; seenPrepared.add(p); if (!seenKeys.has(row.probe_row_id)) { seenKeys.add(row.probe_row_id); selected.push(row); } if (selected.length >= max) break; }
      if (selected.length < max) for (const row of propRows) { if (row.prepared_row_id && !seenKeys.has(row.probe_row_id)) { seenKeys.add(row.probe_row_id); selected.push(row); } if (selected.length >= max) break; }
      if (selected.length < max) for (const row of propRows) { if (!row.prepared_row_id && !seenKeys.has(row.probe_row_id)) { seenKeys.add(row.probe_row_id); selected.push(row); } if (selected.length >= max) break; }
      effectivePropRows = selected;
      propEvidenceTruncatedForBackendTimebox = true;
      warningCount += 1;
    }
    const propCols = ["probe_row_id", "batch_id", "slate_window_key", "official_date", "prepared_row_id", "source_key", "source_event_id", "source_line_id", "game_pk", "resolved_mlb_player_id", "source_player_name", "canonical_prop_key", "source_market_key", "line_value", "price_american", "price_decimal", "outcome_side", "mapping_status", "coverage_status", "raw_json"];
    const BATCH_CHUNK = backendSequence ? MARKET_FULL_BACKEND_BATCH_CHUNK_SIZE : 150;
    for (let i = 0; i < effectivePropRows.length; i += BATCH_CHUNK) await pgClient`INSERT INTO market.context_probe_player_props ${pgClient(effectivePropRows.slice(i, i + BATCH_CHUNK), ...propCols)}`;

    if (backendSequence) {
      const terminalFromEvidence = await finalizePlayerPropBatchFromEvidence(pgClient, { ...input, external_calls_performed: externalCalls }, config, { batch_id: batchId, request_id: requestId, run_id: runId, prepared_rows_read: preparedRows.length, warning_count: warningCount + 1, blocker_count: blockerCount }, preparedRows, today, tomorrow, slateWindowKey, retention, { ...prune, immediate_terminal_after_player_prop_evidence_insert: true, coverage_write_skipped_for_backend_timebox: true }, "backend_sequence_terminal_after_player_prop_evidence_insert");
      if (terminalFromEvidence) {
        terminalFromEvidence.backend_sequence_terminal_short_circuit = true;
        terminalFromEvidence.persisted_player_prop_rows = effectivePropRows.length;
        terminalFromEvidence.source_player_prop_rows_seen_before_timebox = propRows.length;
        terminalFromEvidence.prop_evidence_truncated_for_backend_timebox = propEvidenceTruncatedForBackendTimebox;
        terminalFromEvidence.normalized_player_prop_rows_used_for_mapping = normalizedRowsForMapping.length;
        terminalFromEvidence.normalized_player_prop_rows_seen_before_backend_cap = normalizedRowsSeenBeforeBackendCap;
        terminalFromEvidence.normalized_rows_truncated_for_backend_timebox = normalizedRowsTruncatedForBackendTimebox;
        terminalFromEvidence.coverage_write_skipped_for_backend_timebox = true;
        terminalFromEvidence.elapsed_ms = Date.now() - startedMs;
        return terminalFromEvidence;
      }
    }
    let coverageWriteSkippedForTimebox = false;
    if (backendSequence && marketFullSoftDeadlineExceeded(startedMs, 3500)) { coverageWriteSkippedForTimebox = true; warningCount += 1; }
    else {
      const covCols = ["coverage_row_id", "batch_id", "slate_window_key", "official_date", "prepared_row_id", "source_key", "game_pk", "resolved_mlb_player_id", "canonical_prop_key", "board_line_value", "game_market_status", "player_prop_market_status", "market_context_status", "coverage_grade", "details_json"];
      for (let i = 0; i < coverageRows.length; i += BATCH_CHUNK) await pgClient`INSERT INTO market.context_probe_coverage ${pgClient(coverageRows.slice(i, i + BATCH_CHUNK), ...covCols)}`;
    }
    const issueCols = ["issue_id", "batch_id", "slate_window_key", "official_date", "severity", "issue_type", "game_pk", "prepared_row_id", "source_key", "reason", "details_json"];
    for (let i = 0; i < issues.length; i += BATCH_CHUNK) await pgClient`INSERT INTO market.context_probe_issues ${pgClient(issues.slice(i, i + BATCH_CHUNK), ...issueCols)}`;

    const bookQualityRowCounts = countBy(enrichedParlayRows, r => r.book_quality || bookmakerQuality(r.bookmaker));
    const normalizationStatusCounts = countBy(enrichedParlayRows, r => r.normalization_status || "unknown");
    const bookCountsNormalized = countBy(enrichedParlayRows, r => r.bookmaker_key || normalizeText(r.bookmaker).replace(/ /g, "_"));
    const uniqueMatchedBySourceKeyCounts = Object.fromEntries(Object.entries(uniqueMatchedBySourceKey).map(([k, v]) => [k, v.size]));
    const uniqueCoverageSummary = { prepared_unique_player_prop_units: preparedUniquePlayerPropUnits.size, primary_comparison_book_units: coveredUnits.primary_comparison_book.size, pickem_comparison_units: coveredUnits.pickem_comparison.size, exchange_or_sharp_reference_units: coveredUnits.exchange_or_sharp_reference.size, requires_shape_validation_units: coveredUnits.requires_shape_validation.size, total_non_owned_units: coveredUnits.total_non_owned.size, primary_comparison_book_pct: pct(coveredUnits.primary_comparison_book.size, preparedUniquePlayerPropUnits.size), total_non_owned_pct: pct(coveredUnits.total_non_owned.size, preparedUniquePlayerPropUnits.size) };
    const validNonOwnedProviderRows = enrichedParlayRows.filter(r => { const q = r.book_quality || bookmakerQuality(r.bookmaker); const ns = r.normalization_status || ""; return q !== "owned_board_excluded_from_vendor_decision" && !ns.startsWith("quarantined"); }).length;
    const validNonOwnedProviderRowsAccounted = (sourceRowStatusCounts.board_matched || 0) + externalValidUnanchoredRows;
    const externalResolverSummary = { source_row_status_counts: sourceRowStatusCounts, source_key_status_counts: sourceKeyStatusCounts, valid_non_owned_provider_rows_excluding_quarantined: validNonOwnedProviderRows, valid_non_owned_provider_rows_accounted_by_board_or_external_valid: validNonOwnedProviderRowsAccounted, external_valid_unanchored_rows: externalValidUnanchoredRows, quarantined_rows: quarantinedRows, true_hard_unmatched_rows: trueHardUnmatchedRows, true_hard_unmatched_rate_excluding_quarantined: pct(trueHardUnmatchedRows, validNonOwnedProviderRows), coverage_plus_external_valid_pct_excluding_quarantined: pct(validNonOwnedProviderRowsAccounted, validNonOwnedProviderRows) };
    const coverageGrade = blockerCount ? "BLOCKED" : (coveredUnits.total_non_owned.size > 0 ? "NORMALIZED_PARLAY_CONTEXT_PARTIAL_MATCH" : (matched > 0 ? "OWNED_OR_QUARANTINED_MATCH_ONLY" : ((parlay.normalized || []).length > 0 ? "PARLAY_NORMALIZED_RESOLVER_UNMATCHED" : "PARLAY_NO_SUPPORTED_PLAYER_PROP_MARKETS")));
    const certification = blockerCount ? "MARKET_PLAYER_PROP_CONTEXT_BLOCKED" : "MARKET_PLAYER_PROP_CONTEXT_EVIDENCE_WRITTEN";
    const certificationGrade = blockerCount ? "BLOCKED" : (warningCount ? "PASS_WITH_WARNINGS" : "PASS");
    const status = blockerCount ? "completed_player_prop_context_blocked" : "completed_player_prop_context_evidence_written";
    const output = {
      retention, prune, mode: config.mode, prepared_rows_read: preparedRows.length, prepared_games_checked: gamePks.length, prepared_players_checked: playerIds.length, prepared_prop_keys_checked: propKeys.length,
      parlay_api: { config_present: !!(parlay.endpoint && parlay.endpoint.ok), key_present: sourceHas(env, "PARLAY_API_KEY"), fetch_ok: !!parlay.ok, live_fetch_allowed: liveParlayFetchAllowed, rows_seen: parlay.rows_seen || 0, normalized_player_prop_rows: parlay.normalized_player_prop_rows || 0, matched_to_prepared: matched, no_prepared_match: noMatch, ambiguous_prepared_match: ambiguous, persisted_player_prop_rows: effectivePropRows.length, unique_coverage_summary: uniqueCoverageSummary, external_resolver_summary: externalResolverSummary },
      coverage_grade: coverageGrade, warning_count: warningCount, blocker_count: blockerCount,
      boundaries: { no_teams_game_odds: true, opposite_prop_family_not_in_this_run: true, no_market_current_lines: true, no_prepared_board_mutation: true, no_score_db_mutation: true, no_scoring: true, no_ranking: true, no_matrix: true, no_final_board: true }
    };
    await pgClient`UPDATE market.context_probe_batches SET status=${status}, parlay_inventory_rows_seen=${parlay.rows_seen || 0}, parlay_props_mapped_to_prepared=${matched}, parlay_coverage_grade=${coverageGrade}, warning_count=${warningCount}, blocker_count=${blockerCount}, certification_status=${certification}, certification_grade=${certificationGrade}, output_json=${safeJson(output, 9000)}, updated_at=now() WHERE batch_id=${batchId}`;
    const rowsWritten = effectivePropRows.length + (coverageWriteSkippedForTimebox ? 0 : coverageRows.length) + issues.length + 1;
    return { ok: true, data_ok: blockerCount === 0, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, run_id: runId, batch_id: batchId, mode: config.mode, prop_family: config.prop_family, status, certification, certification_grade: certificationGrade, rows_read: preparedRows.length, rows_written: rowsWritten, external_calls_performed: externalCalls, prepared_rows_read: preparedRows.length, prepared_games_checked: gamePks.length, prepared_players_checked: playerIds.length, prepared_prop_keys_checked: propKeys.length, parlay_inventory_rows_seen: parlay.rows_seen || 0, parlay_props_mapped_to_prepared: matched, persisted_player_prop_rows: effectivePropRows.length, coverage_write_skipped_for_timebox: coverageWriteSkippedForTimebox, parlay_unique_player_prop_units_covered_non_owned: uniqueCoverageSummary.total_non_owned_units, parlay_unique_player_prop_units_coverage_pct: uniqueCoverageSummary.total_non_owned_pct, parlay_coverage_grade: coverageGrade, warning_count: warningCount, blocker_count: blockerCount, retention, no_teams_game_odds: true, active_prop_family: config.prop_family, opposite_prop_family_not_in_this_run: true, no_market_current_lines_writes: true, no_score_db_mutation: true, no_scoring: true, no_ranking: true, no_matrix_builder: true, no_final_board: true, elapsed_ms: Date.now() - startedMs, timestamp_utc: nowUtc() };
  } finally {
    await pgClient.end({ timeout: 1 }).catch(() => {});
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();
    if (method === "OPTIONS") return jsonResponse({ ok: true });
    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));
    if (method === "GET" && path === "/health") return jsonResponse(baseIdentity(env, { route: "/health", today: ptDate(0), tomorrow: ptDate(1) }));
    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      return jsonResponse(baseIdentity(env, { route: "/diagnostic", input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, mode: input.mode || null }, writes_performed: 0, external_calls_performed: 0 }));
    }
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      if (input.mode && ![MODE_HITTER, MODE_PITCHER, "hitter_props", "pitcher_props", "market_pitcher_props"].includes(String(input.mode))) return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "unsupported_mode", supported_modes: [MODE_HITTER, MODE_PITCHER], received_mode: input.mode }, 400);
      try {
        const output = await runPlayerPropContext(env, input);
        return jsonResponse(output, output.ok !== false ? 200 : 500);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, run_id: input.run_id || null, mode: input.mode || null, status: "market_line_shape_classifier_exception", certification: "MARKET_LINE_SHAPE_CLASSIFIER_EXCEPTION", certification_grade: "FAILED", error: String(err && err.stack ? err.stack : err), external_calls_performed: 0 }, 500);
      }
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
