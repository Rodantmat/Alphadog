import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-prizepicks-github-board";
const VERSION = "alphadog-v2-prizepicks-github-board-v0.2.2-control-db-only-binding";
const JOB_KEY = "prizepicks-github-board";
const SOURCE_KEY = "prizepicks_github";
const RAW_SNAPSHOT_STATUS_OK = "source_shape_staged";
const STAGE_CERT_PASS = "certified_ready_for_promotion";
const STAGE_CERT_FAIL = "failed_not_promoted";
const PROMOTION_CERT_PASS = "promoted_current_board";
const PROMOTION_CERT_FAIL = "promotion_failed_active_board_preserved";
const SOURCE_STALE_CERT = "PRIZEPICKS_SOURCE_STALE_NO_FUTURE_PICKABLE_ROWS";
const SOURCE_REFRESH_WAIT_CERT = "PRIZEPICKS_SOURCE_REFRESH_WAIT_EXHAUSTED_NO_FUTURE_ROWS_CURRENT_PRESERVED";
const SOURCE_REFRESH_WAIT_NO_CURRENT_CERT = "PRIZEPICKS_SOURCE_REFRESH_WAIT_EXHAUSTED_NO_FUTURE_ROWS_NO_CURRENT_TO_PRESERVE";
const SOURCE_REFRESH_WAIT_MAX_MS = 110000;
const SOURCE_REFRESH_WORKER_BUDGET_MS = 125000;
const SOURCE_REFRESH_POLL_INTERVAL_MS = 10000;
const SOURCE_REFRESH_POLL_CONTINUE_SECONDS = 30;
const SOURCE_REFRESH_MAX_POLL_ATTEMPTS = 12;
const MAX_RAW_JSON_CHARS = 180000;
const MAX_HEALTH_JSON_CHARS = 7000;
const MAX_OUTPUT_PREVIEW_CHARS = 900;
const STAGE_INSERT_CHUNK_SIZE = 200; // bulk insert chunk size, proven pattern (DOS_AND_DONTS PART 1)

const REQUIRED_DB_BINDINGS = ["HYPERDRIVE"];
const REQUIRED_CONFIG_VALUES = ["GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BRANCH", "GITHUB_PRIZEPICKS_PATH"];
const EXPECTED_MARKET_RAW_SNAPSHOTS_COLUMNS = ["snapshot_id", "source_key", "slate_date", "fetched_at", "raw_json", "row_count", "status", "error"];
const EXPECTED_MARKET_SOURCE_HEALTH_COLUMNS = ["source_key", "status", "last_success_at", "last_error_at", "last_error", "rows_last_fetch", "health_json", "updated_at"];
const EXPECTED_PP_STAGE_COLUMNS = ["stage_id", "batch_id", "source_key", "slate_date", "fetched_at", "staged_at", "projection_id", "player_id", "player_name", "team", "opponent", "league", "stat_type", "line_score", "description", "start_time", "raw_projection_json", "parse_status", "parse_error", "certification_status", "created_at"];
const EXPECTED_PP_BATCH_COLUMNS = ["batch_id", "source_key", "slate_date", "fetched_at", "staged_at", "certified_at", "source_path", "source_http_status", "source_size_bytes", "top_level_shape", "total_rows", "staged_rows", "mlb_rows", "valid_rows", "invalid_rows", "certification_status", "certification_reason", "certification_json", "promoted_at", "cleaned_at", "created_at", "updated_at"];
const EXPECTED_PP_CURRENT_COLUMNS = ["current_row_id", "batch_id", "source_key", "slate_date", "projection_id", "player_id", "player_name", "team", "opponent", "league", "stat_type", "line_score", "description", "start_time", "board_time", "end_time", "game_id", "event_type", "status", "projection_type", "odds_type", "source_line_type", "payout_variant", "is_goblin", "is_demon", "is_standard", "pickable_flag", "raw_projection_json", "row_payload_json", "promoted_at", "updated_at"];
const EXPECTED_PP_ACTIVE_COLUMNS = ["source_key", "slate_date", "active_batch_id", "certification_status", "row_count", "valid_rows", "activated_at", "updated_at"];

function nowUtc() { return new Date().toISOString(); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms || 0)))); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

function safeIdPart(value, fallback = "x") {
  const text = value === undefined || value === null || value === "" ? String(fallback) : String(value);
  const cleaned = text.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
  return cleaned || String(fallback);
}

function deterministicStageId(batchId, projectionId, index) {
  // Stage rows must be retry-safe and collision-proof inside large PrizePicks slates.
  // The previous random 6-char suffix can collide on 7k+ rows and crash D1 primary-key inserts.
  return `pp_stage_${safeIdPart(batchId)}_${safeIdPart(projectionId, `row_${index}`)}_${Number(index || 0)}`;
}


const GITHUB_FETCH_TIMEOUT_MS = 6000;
const PRIMARY_FETCH_MAX_RETRIES = 3;
const PRIMARY_FETCH_BASE_DELAY_MS = 1000;
const PRIMARY_FETCH_MAX_DELAY_MS = 4000;

function timeoutSignal(ms) {
  // AbortSignal.timeout is native to the Workers runtime - no manual AbortController/setTimeout
  // plumbing needed. This is the actual root fix for the hang: every fetch() call in this worker
  // previously had no timeout at all, so a single slow GitHub response could hang the entire
  // invocation indefinitely with nothing to bound it.
  return AbortSignal.timeout(ms);
}

function jitteredBackoffDelayMs(attemptIndex) {
  // Real, standard exponential-backoff-with-jitter pattern (Google Cloud/AWS-documented
  // approach): base * 2^attempt, capped, plus a random jitter component so retries from
  // multiple concurrent invocations don't synchronize into a thundering herd.
  const exponential = Math.min(PRIMARY_FETCH_MAX_DELAY_MS, PRIMARY_FETCH_BASE_DELAY_MS * Math.pow(2, attemptIndex));
  const jitter = Math.random() * exponential * 0.3;
  return Math.round(exponential + jitter);
}

function isRetryableGithubFailure(candidate) {
  // Real, standard classification: retry transient failures (timeout/network/429/5xx), not a
  // definitive 404 (file genuinely doesn't exist at this path/ref - retrying won't help).
  if (!candidate) return true;
  const status = candidate.http_status;
  if (status === 404) return false;
  if (status === 200 && candidate.summary && candidate.summary.json_parse_ok === false) return false; // malformed content, not transient
  return true;
}

async function fetchPrimarySourceWithRetries(source, env) {
  const attempts = [];
  for (let attemptIndex = 0; attemptIndex < PRIMARY_FETCH_MAX_RETRIES; attemptIndex++) {
    if (attemptIndex > 0) await sleep(jitteredBackoffDelayMs(attemptIndex - 1));
    const candidate = await fetchTextCandidate(source.raw_branch_url || source.url, env, "raw_branch_primary", githubHeaders(env, "application/json, text/plain, */*"), { ref: source.branch, api_url: source.raw_branch_url || source.url, attempt: attemptIndex + 1 });
    attempts.push({ attempt: attemptIndex + 1, ok: Boolean(candidate && candidate.ok), http_status: candidate ? candidate.http_status : null, error: candidate && candidate.error ? candidate.error : null });
    if (candidate && candidate.ok && candidate.summary && Number(candidate.summary.future_pickable_rows || 0) > 0) {
      return { candidate, attempts, succeeded_on_primary: true };
    }
    if (candidate && !isRetryableGithubFailure(candidate)) {
      return { candidate, attempts, succeeded_on_primary: false, non_retryable: true };
    }
  }
  return { candidate: null, attempts, succeeded_on_primary: false, non_retryable: false };
}

const D1_WRITE_CONCURRENCY = 6;

async function runWithBoundedConcurrency(items, worker, concurrency) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function runOne() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await worker(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, runOne);
  await Promise.all(workers);
  return results;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type,x-ingest-token,x-admin-token,authorization",
      "access-control-allow-methods": "GET,POST,OPTIONS"
    }
  });
}

function safeString(value, max = MAX_OUTPUT_PREVIEW_CHARS) {
  const text = value === undefined || value === null ? "" : String(value);
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}

function safeJson(value, max = MAX_HEALTH_JSON_CHARS) {
  const text = JSON.stringify(value || {}, null, 2);
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}

function safeCell(value, max = 900) {
  if (value === undefined || value === null) return null;
  const text = String(value);
  return text.length > max ? text.slice(0, max) : text;
}

function bindingPresence(env, names) {
  const out = {};
  for (const name of names) out[name] = Boolean(env && env[name]);
  return out;
}

function valuePresence(env, names) {
  const out = {};
  for (const name of names) out[name] = env && env[name] !== undefined && env[name] !== null && String(env[name]).length > 0;
  return out;
}

function allTrue(obj) { return Object.values(obj).every(Boolean); }
async function readJsonSafe(request) { try { return await request.json(); } catch (_) { return {}; } }

function pgClient(env) {
  return postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false });
}

function toPgPlaceholders(sqlText) {
  let i = 0;
  return String(sqlText).replace(/\?/g, () => "$" + (++i));
}

// Real, proven pattern (see DOS_AND_DONTS.md PART 1): prepare:false is required so postgres.js
// does not mask real SQL errors as generic "Network connection lost". These two helpers keep the
// existing "?"-placeholder call sites unchanged elsewhere in this file - only the underlying
// engine changes, from D1 .prepare()/.bind() to Postgres sql.unsafe() with $-placeholders.
async function all(client, sqlText, ...binds) {
  return await client.unsafe(toPgPlaceholders(sqlText), binds);
}

async function run(client, sqlText, ...binds) {
  return await client.unsafe(toPgPlaceholders(sqlText), binds);
}

function baseIdentity(env, extra = {}) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const cfg = valuePresence(env, REQUIRED_CONFIG_VALUES);
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    source_key: SOURCE_KEY,
    status: "READY",
    timestamp_utc: nowUtc(),
    phase: "prizepicks_github_board_multi_surface_freshness_select_v0_1_14",
    notes: [
      "Reads the configured PrizePicks GitHub JSON source.",
      "Parses JSON, stages PrizePicks rows into MARKET_DB.prizepicks_board_stage, and writes a batch certification row.",
      "Promotes only certified staged rows into MARKET_DB.prizepicks_board_current and flips MARKET_DB.prizepicks_board_active_batches after inserts succeed.",
      "No market_current_lines writes, no scoring, no ranking, no final board. Fetches multiple GitHub surfaces, selects the freshest valid PrizePicks JSON candidate, and only treats the source as stale when every usable candidate has no future pickable rows. If all consumed candidates are stale, clear stale current inventory, dispatch the GitHub scraper workflow, and require a later fresh consumer run before Board Full Run can pass."
    ],
    binding_summary: {
      required_db_bindings_present: allTrue(db),
      required_config_values_present: allTrue(cfg)
    },
    ...extra
  };
}

async function validateTableColumns(client, tableName, expectedColumns) {
  if (!client) return { ok: false, table: tableName, reason: "missing_postgres_client", columns_present: [], missing_columns: expectedColumns };
  const [schema, bareTable] = tableName.includes(".") ? tableName.split(".") : ["market", tableName];
  const cols = await client.unsafe("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2", [schema, bareTable]);
  const names = cols.map(c => String(c.column_name || ""));
  const missing = expectedColumns.filter(c => !names.includes(c));
  return { ok: missing.length === 0, table: tableName, columns_present: names, required_columns: expectedColumns, missing_columns: missing };
}

async function validateWriteSchema(env) {
  const client = pgClient(env);
  try {
    const raw = await validateTableColumns(client, "market.raw_snapshots", EXPECTED_MARKET_RAW_SNAPSHOTS_COLUMNS);
    const health = await validateTableColumns(client, "market.source_health", EXPECTED_MARKET_SOURCE_HEALTH_COLUMNS);
    const batches = await validateTableColumns(client, "market.prizepicks_board_batches", EXPECTED_PP_BATCH_COLUMNS);
    const stage = await validateTableColumns(client, "market.prizepicks_board_stage", EXPECTED_PP_STAGE_COLUMNS);
    const current = await validateTableColumns(client, "market.prizepicks_board_current", EXPECTED_PP_CURRENT_COLUMNS);
    const active = await validateTableColumns(client, "market.prizepicks_board_active_batches", EXPECTED_PP_ACTIVE_COLUMNS);
    return { ok: raw.ok && health.ok && batches.ok && stage.ok && current.ok && active.ok, market_raw_snapshots: raw, market_source_health: health, prizepicks_board_batches: batches, prizepicks_board_stage: stage, prizepicks_board_current: current, prizepicks_board_active_batches: active };
  } finally {
    await client.end({ timeout: 1 });
  }
}

async function readConfigSystemSettings(env, keys) {
  const out = {};
  if (!env.HYPERDRIVE) return out;
  const client = pgClient(env);
  try {
    const placeholders = keys.map((_, i) => "$" + (i + 1)).join(",");
    const rows = await client.unsafe(`SELECT setting_key, setting_value FROM config.system_settings WHERE setting_key IN (${placeholders})`, keys);
    for (const row of rows) if (row && row.setting_key) out[String(row.setting_key)] = row.setting_value;
  } catch (err) {
    out.__config_read_error = safeString(err && err.message ? err.message : err, 500);
  } finally {
    await client.end({ timeout: 1 });
  }
  return out;
}

function buildRawGithubUrl(owner, repo, branch, path) {
  const cleanPath = String(path || "").replace(/^\/+/, "").trim();
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${cleanPath.split("/").map(encodeURIComponent).join("/")}`;
}

function buildGithubContentsApiUrl(owner, repo, branch, path) {
  const cleanPath = String(path || "").replace(/^\/+/, "").trim();
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${cleanPath.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`;
}

function buildRawGithubCommitUrl(owner, repo, commitish, path) {
  const cleanPath = String(path || "").replace(/^\/+/, "").trim();
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(commitish)}/${cleanPath.split("/").map(encodeURIComponent).join("/")}`;
}

function buildGithubBlobApiUrl(owner, repo, sha) {
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(sha)}`;
}

function decodeBase64Utf8(base64Text) {
  const compact = String(base64Text || "").replace(/\s+/g, "");
  const binary = atob(compact);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

function githubRepositoryDispatchUrl(owner, repo) {
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/dispatches`;
}

function safeGithubToken(env) {
  const token = env && env.GITHUB_TOKEN ? String(env.GITHUB_TOKEN).trim() : "";
  if (!token || token === "DISABLED" || token === "SET_ME" || token === "undefined" || token === "null") return "";
  return token;
}

async function triggerPrizePicksSourceRefresh(env, source, input, reason) {
  const token = safeGithubToken(env);
  const dispatch = {
    attempted: false,
    ok: false,
    provider: "github_repository_dispatch",
    owner: source && source.owner ? source.owner : "Rodantmat",
    repo: source && source.repo ? source.repo : "Alphadog",
    branch: source && source.branch ? source.branch : "main",
    event_type: "alphadog_prizepicks_board",
    workflow_file: ".github/workflows/scrape.yml",
    reason: String(reason || "source_stale_no_future_pickable_rows"),
    request_id: input && input.request_id ? String(input.request_id) : null,
    chain_id: input && input.chain_id ? String(input.chain_id) : null,
    slate_date: input && input.slate_date ? String(input.slate_date).slice(0, 40) : currentPtDate(),
    token_present: Boolean(token),
    token_value_printed: false
  };
  if (!token) {
    return { ...dispatch, blocked: true, error: "missing_GITHUB_TOKEN_secret_for_worker_repository_dispatch" };
  }

  const url = githubRepositoryDispatchUrl(dispatch.owner, dispatch.repo);
  const body = {
    event_type: dispatch.event_type,
    client_payload: {
      dispatch_id: dispatch.request_id || rid("pp_scrape_dispatch"),
      request_id: dispatch.request_id || null,
      chain_id: dispatch.chain_id || null,
      slate_date: dispatch.slate_date,
      source: "alphadog-v2-prizepicks-github-board",
      source_worker_version: VERSION,
      reason: dispatch.reason,
      target_file: source && source.path ? source.path : "prizepicks_mlb_current.json"
    }
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "accept": "application/vnd.github+json",
        "authorization": `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "AlphaDog-v2 PrizePicks Source Refresh Dispatcher",
        "x-github-api-version": "2022-11-28"
      },
      body: JSON.stringify(body),
      signal: timeoutSignal(GITHUB_FETCH_TIMEOUT_MS)
    });
    const text = await res.text();
    return {
      ...dispatch,
      attempted: true,
      ok: res.status === 204,
      http_status: res.status,
      response_preview: res.status === 204 ? "" : safeString(text, 700),
      note: res.status === 204
        ? "GitHub scrape workflow dispatch accepted. Run BOARD > PrizePicks again after the GitHub MLB Automatic Scraper workflow commits a fresh prizepicks_mlb_current.json."
        : "GitHub repository_dispatch failed; inspect token permissions and workflow availability."
    };
  } catch (err) {
    return {
      ...dispatch,
      attempted: true,
      ok: false,
      error: safeString(err && err.message ? err.message : err, 700)
    };
  }
}

async function githubSourceConfig(env) {
  const keys = ["GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BRANCH", "GITHUB_PRIZEPICKS_PATH"];
  const dbSettings = await readConfigSystemSettings(env, keys);
  const owner = String(dbSettings.GITHUB_OWNER || env.GITHUB_OWNER || "Rodantmat").trim();
  const repo = String(dbSettings.GITHUB_REPO || env.GITHUB_REPO || "Alphadog").trim();
  const branch = String(dbSettings.GITHUB_BRANCH || env.GITHUB_BRANCH || "main").trim();
  const path = String(dbSettings.GITHUB_PRIZEPICKS_PATH || env.GITHUB_PRIZEPICKS_PATH || "prizepicks_mlb_current.json").replace(/^\/+/, "").trim();
  return {
    owner,
    repo,
    branch,
    path,
    url: buildRawGithubUrl(owner, repo, branch, path),
    raw_branch_url: buildRawGithubUrl(owner, repo, branch, path),
    contents_api_url: buildGithubContentsApiUrl(owner, repo, branch, path),
    config_resolution: {
      source: dbSettings.GITHUB_PRIZEPICKS_PATH ? "CONFIG_DB.config_system_settings" : "worker_vars_fallback",
      config_db_read_error: dbSettings.__config_read_error || null,
      db_keys_present: {
        GITHUB_OWNER: dbSettings.GITHUB_OWNER !== undefined,
        GITHUB_REPO: dbSettings.GITHUB_REPO !== undefined,
        GITHUB_BRANCH: dbSettings.GITHUB_BRANCH !== undefined,
        GITHUB_PRIZEPICKS_PATH: dbSettings.GITHUB_PRIZEPICKS_PATH !== undefined
      },
      worker_var_keys_present: valuePresence(env, keys)
    }
  };
}

function looksLikeAlphaDogWorkerScript(text) {
  const body = String(text || "");
  return body.includes("export default") && body.includes("WORKER_NAME") && body.includes("JOB_KEY");
}

function extractConst(text, name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*[\"']([^\"']+)[\"']`);
  const match = String(text || "").match(re);
  return match ? match[1] : null;
}

function summarizeWorkerScript(text) {
  const body = String(text || "");
  return {
    file_type: "javascript_worker_script",
    worker_name: extractConst(body, "WORKER_NAME"),
    version: extractConst(body, "VERSION"),
    job_key: extractConst(body, "JOB_KEY"),
    has_export_default: body.includes("export default"),
    size_bytes_estimate: new TextEncoder().encode(body).length,
    line_count_estimate: body ? body.split(/\r?\n/).length : 0
  };
}

function detectArray(json) {
  if (Array.isArray(json)) return { key: "root_array", rows: json };
  if (!json || typeof json !== "object") return { key: "non_object", rows: [] };
  const candidates = ["data", "projections", "lines", "items", "rows", "entries", "results"];
  for (const key of candidates) if (Array.isArray(json[key])) return { key, rows: json[key] };
  if (json.data && typeof json.data === "object" && !Array.isArray(json.data)) {
    for (const key of candidates) if (Array.isArray(json.data[key])) return { key: `data.${key}`, rows: json.data[key] };
  }
  if (json.payload && typeof json.payload === "object" && !Array.isArray(json.payload)) {
    for (const key of candidates) if (Array.isArray(json.payload[key])) return { key: `payload.${key}`, rows: json.payload[key] };
  }
  return { key: "no_known_array", rows: [] };
}

function getDeepValue(obj, paths) {
  for (const path of paths) {
    const parts = path.split(".");
    let cur = obj;
    let ok = true;
    for (const part of parts) {
      if (!cur || typeof cur !== "object" || !(part in cur)) { ok = false; break; }
      cur = cur[part];
    }
    if (ok && cur !== undefined && cur !== null && String(cur).length > 0) return cur;
  }
  return null;
}

function buildIncludedIndex(json) {
  const byKey = new Map();
  const byId = new Map();
  const included = json && Array.isArray(json.included) ? json.included : [];
  for (const item of included) {
    if (!item || typeof item !== "object") continue;
    const type = String(item.type || "");
    const id = String(item.id || "");
    if (type && id) byKey.set(`${type}:${id}`, item);
    if (id && !byId.has(id)) byId.set(id, item);
  }
  return { byKey, byId };
}

function findRelationshipItem(row, index, relationshipNames) {
  const rels = row && row.relationships && typeof row.relationships === "object" ? row.relationships : {};
  for (const name of relationshipNames) {
    const rel = rels[name];
    const data = rel && rel.data;
    if (!data) continue;
    const candidate = Array.isArray(data) ? data[0] : data;
    if (!candidate) continue;
    const id = String(candidate.id || "");
    const type = String(candidate.type || "");
    if (type && id && index.byKey.has(`${type}:${id}`)) return index.byKey.get(`${type}:${id}`);
    if (id && index.byId.has(id)) return index.byId.get(id);
  }
  return null;
}

function includedLeagueMap(json) {
  const map = new Map();
  const included = json && Array.isArray(json.included) ? json.included : [];
  for (const item of included) {
    if (!item || typeof item !== "object") continue;
    const type = String(item.type || "").toLowerCase();
    if (!type.includes("league") && !type.includes("sport")) continue;
    const id = String(item.id || "");
    const attrs = item.attributes || {};
    const name = String(attrs.name || attrs.display_name || attrs.league || attrs.sport || attrs.abbreviation || "").toLowerCase();
    if (id) map.set(id, name);
  }
  return map;
}

function rowLooksMlb(row, leagueMap) {
  if (!row || typeof row !== "object") return false;
  const haystackValues = [
    getDeepValue(row, ["league", "sport", "sport_name", "league_name", "attributes.league", "attributes.sport", "attributes.sport_name", "attributes.league_name", "attributes.league_abbreviation"]),
    getDeepValue(row, ["attributes.stat_type", "attributes.description", "attributes.name"])
  ].filter(Boolean).map(v => String(v).toLowerCase());
  if (haystackValues.some(v => v === "mlb" || v.includes("major league baseball") || v.includes("baseball"))) return true;
  const leagueId = getDeepValue(row, ["relationships.league.data.id", "league_id", "attributes.league_id"]);
  if (leagueId && leagueMap.has(String(leagueId))) {
    const name = leagueMap.get(String(leagueId));
    if (name === "mlb" || name.includes("major league baseball") || name.includes("baseball")) return true;
  }
  return false;
}

function findFreshness(json) {
  if (!json || typeof json !== "object") return null;
  const locations = [json, json.meta, json.metadata, json.status, json.source, json.payload].filter(Boolean);
  const keys = ["fetched_at", "updated_at", "generated_at", "created_at", "scraped_at", "timestamp", "last_update", "last_updated"];
  for (const obj of locations) {
    if (!obj || typeof obj !== "object") continue;
    for (const key of keys) if (obj[key]) return { field: key, value: String(obj[key]).slice(0, 120) };
  }
  return null;
}

function currentPtDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const m = {};
  for (const p of parts) m[p.type] = p.value;
  return `${m.year}-${m.month}-${m.day}`;
}
function parseStartTimeMs(value) {
  if (value === undefined || value === null || value === "") return null;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

function isFutureStartTime(value, nowMs = Date.now()) {
  const ms = parseStartTimeMs(value);
  return ms !== null && ms > nowMs;
}

function buildBoardTimingSummary(rows, nowMs = Date.now()) {
  const validMlbRows = rows.filter(r => r && r.is_mlb && r.parse_status === "valid");
  const startTimes = validMlbRows.map(r => r.start_time).filter(Boolean);
  const parsedTimes = startTimes.map(parseStartTimeMs).filter(ms => ms !== null);
  const futurePickableRows = validMlbRows.filter(r => Number(r.pickable_flag || 0) === 1).length;
  const expiredOrStartedRows = validMlbRows.filter(r => {
    const ms = parseStartTimeMs(r.start_time);
    return ms !== null && ms <= nowMs;
  }).length;
  const missingStartTimeRows = validMlbRows.filter(r => !r.start_time).length;
  const invalidStartTimeRows = validMlbRows.filter(r => r.start_time && parseStartTimeMs(r.start_time) === null).length;
  return {
    checked_at_utc: new Date(nowMs).toISOString(),
    valid_mlb_rows: validMlbRows.length,
    future_pickable_rows: futurePickableRows,
    expired_or_started_rows: expiredOrStartedRows,
    missing_start_time_rows: missingStartTimeRows,
    invalid_start_time_rows: invalidStartTimeRows,
    min_start_time: startTimes.length ? startTimes.slice().sort()[0] : null,
    max_start_time: startTimes.length ? startTimes.slice().sort().slice(-1)[0] : null,
    min_start_time_utc: parsedTimes.length ? new Date(Math.min(...parsedTimes)).toISOString() : null,
    max_start_time_utc: parsedTimes.length ? new Date(Math.max(...parsedTimes)).toISOString() : null,
    all_valid_rows_started_or_expired: validMlbRows.length > 0 && futurePickableRows === 0
  };
}


function slateDateFromJson(json, input) {
  if (input && input.slate_date) return String(input.slate_date).slice(0, 40);
  const value = findFreshness(json);
  if (value && /^\d{4}-\d{2}-\d{2}/.test(value.value)) return value.value.slice(0, 10);
  return currentPtDate();
}

function summarizeJsonShape(json) {
  const detected = detectArray(json);
  const rows = detected.rows || [];
  const leagueMap = includedLeagueMap(json);
  const mlbRows = rows.filter(row => rowLooksMlb(row, leagueMap));
  const firstRow = rows[0] && typeof rows[0] === "object" ? rows[0] : null;
  return {
    top_level_type: Array.isArray(json) ? "array" : typeof json,
    top_level_keys: json && typeof json === "object" && !Array.isArray(json) ? Object.keys(json).slice(0, 40) : [],
    detected_rows_key: detected.key,
    detected_row_count: rows.length,
    likely_mlb_row_count: mlbRows.length,
    included_count: json && Array.isArray(json.included) ? json.included.length : 0,
    included_league_map_size: leagueMap.size,
    first_row_type: firstRow ? String(firstRow.type || "") : null,
    first_row_keys: firstRow ? Object.keys(firstRow).slice(0, 40) : [],
    first_row_attribute_keys: firstRow && firstRow.attributes && typeof firstRow.attributes === "object" ? Object.keys(firstRow.attributes).slice(0, 40) : [],
    freshness_signal: findFreshness(json)
  };
}

function boundedRawJson(value) {
  const fullText = JSON.stringify(value || {}, null, 0);
  const detected = detectArray(value);
  const rows = detected.rows || [];
  const firstRows = rows.slice(0, 5).map((row) => {
    const text = JSON.stringify(row || {}, null, 0);
    if (text.length <= 9000) return row;
    return { alphadog_row_preview_truncated: true, original_chars: text.length, preview: text.slice(0, 9000) };
  });
  const envelope = {
    alphadog_bounded_source_snapshot: true,
    storage_reason: "d1_text_cell_size_guard",
    source_shape_only: true,
    original_chars: fullText.length,
    detected_rows_key: detected.key,
    detected_row_count: rows.length,
    top_level_type: Array.isArray(value) ? "array" : typeof value,
    top_level_keys: value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).slice(0, 80) : [],
    included_count: value && Array.isArray(value.included) ? value.included.length : 0,
    first_rows_sample_count: firstRows.length,
    first_rows_sample: firstRows,
    note: "Full raw PrizePicks JSON remains in GitHub prizepicks_mlb_current.json. D1 stores bounded source-shape staging only to avoid SQLITE_TOOBIG. No scoring, no ranking, no market_current_lines write."
  };
  let text = JSON.stringify(envelope, null, 0);
  if (text.length > MAX_RAW_JSON_CHARS) {
    text = JSON.stringify({ alphadog_bounded_source_snapshot: true, storage_reason: "d1_text_cell_size_guard", original_chars: fullText.length, detected_rows_key: detected.key, detected_row_count: rows.length, preview: text.slice(0, MAX_RAW_JSON_CHARS - 500), note: envelope.note });
  }
  return { text, truncated: true, original_chars: fullText.length, stored_chars: text.length };
}

function parseProjectionRow(row, index, leagueMap, slateDate, fetchedAt, batchId) {
  const attrs = row && row.attributes && typeof row.attributes === "object" ? row.attributes : {};
  const projectionId = safeCell(row && row.id, 120);
  const playerItem = findRelationshipItem(row, index, ["new_player", "player", "participant", "players", "athlete"]);
  const playerAttrs = playerItem && playerItem.attributes && typeof playerItem.attributes === "object" ? playerItem.attributes : {};
  const statItem = findRelationshipItem(row, index, ["stat_type", "stat", "market", "projection_type"]);
  const statAttrs = statItem && statItem.attributes && typeof statItem.attributes === "object" ? statItem.attributes : {};
  const playerId = safeCell(playerItem && playerItem.id, 120) || safeCell(getDeepValue(row, ["relationships.new_player.data.id", "relationships.player.data.id", "player_id", "attributes.player_id"]), 120);
  const playerName = safeCell(playerAttrs.name || playerAttrs.display_name || playerAttrs.full_name || playerAttrs.player_name || attrs.player_name || attrs.name || attrs.description, 240);
  const team = safeCell(playerAttrs.team || playerAttrs.team_name || playerAttrs.team_abbreviation || playerAttrs.team_abbr || attrs.team || attrs.team_abbreviation, 120);
  const opponent = safeCell(attrs.opponent || attrs.opponent_team || attrs.game_opponent || attrs.away_team || null, 120);
  const leagueId = getDeepValue(row, ["relationships.league.data.id", "league_id", "attributes.league_id"]);
  const leagueFromMap = leagueId && leagueMap.has(String(leagueId)) ? leagueMap.get(String(leagueId)) : null;
  const league = safeCell(attrs.league || attrs.league_name || attrs.league_abbreviation || leagueFromMap || (rowLooksMlb(row, leagueMap) ? "mlb" : null), 80);
  const statType = safeCell(attrs.stat_type || attrs.stat_display_name || statAttrs.name || statAttrs.display_name || statAttrs.stat_type, 160);
  const lineRaw = attrs.line_score ?? attrs.flash_sale_line_score ?? attrs.score ?? attrs.line;
  const lineScore = lineRaw === undefined || lineRaw === null || lineRaw === "" ? null : Number(lineRaw);
  const description = safeCell(attrs.description || attrs.board_label || attrs.name, 400);
  const startTime = safeCell(attrs.start_time || attrs.board_time || attrs.end_time, 120);
  const boardTime = safeCell(attrs.board_time || attrs.start_time || null, 120);
  const endTime = safeCell(attrs.end_time || null, 120);
  const gameId = safeCell(attrs.game_id || getDeepValue(row, ["relationships.game.data.id", "game_id"]), 120);
  const eventType = safeCell(attrs.event_type || null, 120);
  const boardStatus = safeCell(attrs.status || null, 120);
  const projectionType = safeCell(attrs.projection_type || null, 120);
  const oddsType = safeCell(attrs.odds_type || null, 120);
  const variantHaystack = [attrs.projection_type, attrs.odds_type, attrs.description, attrs.stat_display_name, attrs.event_type, attrs.name].filter(Boolean).join(" ").toLowerCase();
  const isGoblin = variantHaystack.includes("goblin") ? 1 : 0;
  const isDemon = variantHaystack.includes("demon") ? 1 : 0;
  const isStandard = isGoblin || isDemon ? 0 : 1;
  const payoutVariant = safeCell(isGoblin ? "goblin" : isDemon ? "demon" : (attrs.odds_type || attrs.projection_type || "standard"), 120);
  const sourceLineType = safeCell(attrs.projection_type || attrs.odds_type || attrs.event_type || null, 120);
  const normalizedStatus = String(boardStatus || "").toLowerCase();
  const blockedByStatus = normalizedStatus === "removed" || normalizedStatus === "suspended";
  const startTimeMs = parseStartTimeMs(startTime);
  const blockedByStartTime = startTimeMs === null || startTimeMs <= Date.now();
  const pickableFlag = (!blockedByStatus && !blockedByStartTime) ? 1 : 0;
  const pickabilityReason = blockedByStatus ? `blocked_status_${normalizedStatus}` : (startTimeMs === null ? "blocked_missing_or_invalid_start_time" : (blockedByStartTime ? "blocked_started_or_expired" : "future_pickable"));
  const rowPayloadJson = JSON.stringify({
    projection_id: projectionId,
    player_id: playerId,
    player_name: playerName,
    team,
    opponent,
    league: league || (rowLooksMlb(row, leagueMap) ? "mlb" : null),
    stat_type: statType,
    line_score: lineScore === null || Number.isNaN(lineScore) ? null : lineScore,
    description,
    start_time: startTime,
    board_time: boardTime,
    end_time: endTime,
    game_id: gameId,
    event_type: eventType,
    status: boardStatus,
    projection_type: projectionType,
    odds_type: oddsType,
    source_line_type: sourceLineType,
    payout_variant: payoutVariant,
    is_goblin: isGoblin,
    is_demon: isDemon,
    is_standard: isStandard,
    pickable_flag: pickableFlag,
    pickability_reason: pickabilityReason,
    raw_type: row && row.type ? String(row.type) : null,
    relationship_keys: row && row.relationships && typeof row.relationships === "object" ? Object.keys(row.relationships).slice(0, 40) : []
  });
  const rawProjectionJson = JSON.stringify(row || {});
  const isMlb = rowLooksMlb(row, leagueMap) || String(league || "").toLowerCase().includes("mlb") || leagueMap.size === 1;
  const errors = [];
  if (!projectionId) errors.push("missing_projection_id");
  if (!playerName) errors.push("missing_player_name");
  if (!statType) errors.push("missing_stat_type");
  if (lineScore === null || Number.isNaN(lineScore)) errors.push("missing_or_invalid_line_score");
  if (!isMlb) errors.push("not_identified_as_mlb");
  const parseStatus = errors.length === 0 ? "valid" : "invalid";
  return {
    stage_id: deterministicStageId(batchId, projectionId, index),
    batch_id: batchId,
    source_key: SOURCE_KEY,
    slate_date: slateDate,
    fetched_at: fetchedAt,
    projection_id: projectionId,
    player_id: playerId,
    player_name: playerName,
    team,
    opponent,
    league: league || (isMlb ? "mlb" : null),
    stat_type: statType,
    line_score: lineScore === null || Number.isNaN(lineScore) ? null : lineScore,
    description,
    start_time: startTime,
    board_time: boardTime,
    end_time: endTime,
    game_id: gameId,
    event_type: eventType,
    status: boardStatus,
    projection_type: projectionType,
    odds_type: oddsType,
    source_line_type: sourceLineType,
    payout_variant: payoutVariant,
    is_goblin: isGoblin,
    is_demon: isDemon,
    is_standard: isStandard,
    pickable_flag: pickableFlag,
    raw_projection_json: rawProjectionJson,
    row_payload_json: rowPayloadJson,
    parse_status: parseStatus,
    parse_error: errors.length ? errors.join(",") : null,
    certification_status: "pending",
    is_mlb: isMlb
  };
}

function buildCertification(shape, stagedRows, sourceSizeBytes, sourcePath) {
  const totalRows = shape.detected_row_count || 0;
  const mlbRows = stagedRows.filter(r => r.is_mlb).length;
  const validRows = stagedRows.filter(r => r.is_mlb && r.parse_status === "valid").length;
  const invalidRows = stagedRows.length - validRows;
  const validRate = mlbRows > 0 ? validRows / mlbRows : 0;
  const checks = {
    github_fetch_http_200: true,
    json_parse_ok: true,
    recognized_top_level_shape: shape.detected_rows_key === "data" || shape.detected_rows_key === "root_array" || shape.detected_row_count > 0,
    total_rows_gt_0: totalRows > 0,
    mlb_rows_min_100: mlbRows >= 100,
    valid_rate_min_90pct: validRate >= 0.90,
    source_size_gt_1000: sourceSizeBytes > 1000,
    not_worker_script: !String(sourcePath || "").toLowerCase().endsWith(".js")
  };
  const passed = Object.values(checks).every(Boolean);
  const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  return {
    passed,
    certification_status: passed ? STAGE_CERT_PASS : STAGE_CERT_FAIL,
    certification_reason: passed ? "PrizePicks JSON parsed, staged, certified, and ready for current-board promotion." : `Certification failed: ${failed.join(",")}`,
    totalRows,
    stagedRows: stagedRows.length,
    mlbRows,
    validRows,
    invalidRows,
    validRate,
    checks,
    failed_checks: failed,
    no_market_current_lines_write: true,
    promotes_prizepicks_board_current_only: passed,
    no_scoring: true,
    manual_refresh_only: false,
    source_refresh_dispatch_enabled: true
  };
}

async function writeHealth(env, status, rowsLastFetch, health, errorText = null) {
  const healthJson = safeJson(health);
  const client = pgClient(env);
  try {
    if (status === "healthy") {
      await client.unsafe(
        "INSERT INTO market.source_health (source_key, status, last_success_at, last_error_at, last_error, rows_last_fetch, health_json, updated_at) VALUES ($1, $2, now(), NULL, NULL, $3, $4, now()) ON CONFLICT(source_key) DO UPDATE SET status=excluded.status, last_success_at=now(), last_error_at=NULL, last_error=NULL, rows_last_fetch=excluded.rows_last_fetch, health_json=excluded.health_json, updated_at=now()",
        [SOURCE_KEY, status, rowsLastFetch, healthJson]
      );
    } else {
      await client.unsafe(
        "INSERT INTO market.source_health (source_key, status, last_success_at, last_error_at, last_error, rows_last_fetch, health_json, updated_at) VALUES ($1, $2, NULL, now(), $3, $4, $5, now()) ON CONFLICT(source_key) DO UPDATE SET status=excluded.status, last_error_at=now(), last_error=excluded.last_error, rows_last_fetch=excluded.rows_last_fetch, health_json=excluded.health_json, updated_at=now()",
        [SOURCE_KEY, status, safeString(errorText || status, 900), rowsLastFetch, healthJson]
      );
    }
  } finally {
    await client.end({ timeout: 1 });
  }
  return { wrote_table: "market.source_health", source_key: SOURCE_KEY };
}

async function writeRawSnapshot(env, parsedJson, rowCount, slateDate, status, errorText = null) {
  const snapshotId = rid("pp_raw");
  const bounded = boundedRawJson(parsedJson);
  const client = pgClient(env);
  try {
    await client.unsafe(
      "INSERT INTO market.raw_snapshots (snapshot_id, source_key, slate_date, fetched_at, raw_json, row_count, status, error) VALUES ($1, $2, $3, now(), $4, $5, $6, $7)",
      [snapshotId, SOURCE_KEY, slateDate, bounded.text, rowCount, status, errorText]
    );
  } finally {
    await client.end({ timeout: 1 });
  }
  return { wrote_table: "market.raw_snapshots", snapshot_id: snapshotId, source_key: SOURCE_KEY, slate_date: slateDate, row_count: rowCount, status, raw_json_truncated: bounded.truncated, raw_json_original_chars: bounded.original_chars, raw_json_stored_chars: bounded.stored_chars };
}

async function insertBatchPending(env, batchId, source, fetchedAt, slateDate, httpStatus, sizeBytes, shape) {
  const client = pgClient(env);
  try {
    await client.unsafe(
      "INSERT INTO market.prizepicks_board_batches (batch_id, source_key, slate_date, fetched_at, staged_at, source_path, source_http_status, source_size_bytes, top_level_shape, total_rows, certification_status, certification_reason, certification_json, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), $5, $6, $7, $8, $9, 'pending', 'stage_started', $10, now(), now())",
      [batchId, SOURCE_KEY, slateDate, fetchedAt, source.path, httpStatus, sizeBytes, JSON.stringify({ detected_rows_key: shape.detected_rows_key, top_level_keys: shape.top_level_keys }), shape.detected_row_count, safeJson({ phase: "stage_started", version: VERSION })]
    );
  } finally {
    await client.end({ timeout: 1 });
  }
  return { wrote_table: "market.prizepicks_board_batches", batch_id: batchId, status: "pending" };
}

async function stageRows(env, rows) {
  const cols = ["stage_id", "batch_id", "source_key", "slate_date", "fetched_at", "projection_id", "player_id", "player_name", "team", "opponent", "league", "stat_type", "line_score", "description", "start_time", "raw_projection_json", "parse_status", "parse_error", "certification_status"];
  const chunks = [];
  for (let i = 0; i < rows.length; i += STAGE_INSERT_CHUNK_SIZE) chunks.push(rows.slice(i, i + STAGE_INSERT_CHUNK_SIZE));
  // Bulk insert via postgres.js's sql(arrayOfObjects, ...columnNames) helper - the proven,
  // correct approach per DOS_AND_DONTS PART 1 (bulk + prepare:false, not per-row inserts).
  const client = pgClient(env);
  try {
    for (const chunk of chunks) {
      await client`INSERT INTO market.prizepicks_board_stage ${client(chunk, ...cols)}`;
    }
  } finally {
    await client.end({ timeout: 1 });
  }
  return { wrote_table: "market.prizepicks_board_stage", inserted_rows: rows.length, chunk_size: STAGE_INSERT_CHUNK_SIZE, chunk_count: chunks.length, parallel_chunks: false };
}

async function finalizeBatch(env, batchId, cert) {
  const client = pgClient(env);
  try {
    await client.unsafe(
      "UPDATE market.prizepicks_board_batches SET certified_at=now(), staged_rows=$1, mlb_rows=$2, valid_rows=$3, invalid_rows=$4, certification_status=$5, certification_reason=$6, certification_json=$7, updated_at=now() WHERE batch_id=$8",
      [cert.stagedRows, cert.mlbRows, cert.validRows, cert.invalidRows, cert.certification_status, cert.certification_reason, safeJson(cert, 6000), batchId]
    );
    await client.unsafe("UPDATE market.prizepicks_board_stage SET certification_status=$1 WHERE batch_id=$2", [cert.certification_status, batchId]);
  } finally {
    await client.end({ timeout: 1 });
  }
  return { wrote_table: "market.prizepicks_board_batches", updated_stage_table: "market.prizepicks_board_stage", batch_id: batchId, certification_status: cert.certification_status };
}

async function insertCurrentRows(env, rows, batchId, slateDate) {
  const validRows = rows.filter(r => r.is_mlb && r.parse_status === "valid").map(r => ({
    current_row_id: `pp_current_${batchId}_${String(r.projection_id || r.stage_id).replace(/[^a-zA-Z0-9_\-]/g, "_")}`,
    batch_id: batchId,
    source_key: SOURCE_KEY,
    slate_date: slateDate,
    projection_id: r.projection_id,
    player_id: r.player_id,
    player_name: r.player_name,
    team: r.team,
    opponent: r.opponent,
    league: r.league,
    stat_type: r.stat_type,
    line_score: r.line_score,
    description: r.description,
    start_time: r.start_time,
    board_time: r.board_time,
    end_time: r.end_time,
    game_id: r.game_id,
    event_type: r.event_type,
    status: r.status,
    projection_type: r.projection_type,
    odds_type: r.odds_type,
    source_line_type: r.source_line_type,
    payout_variant: r.payout_variant,
    is_goblin: r.is_goblin,
    is_demon: r.is_demon,
    is_standard: r.is_standard,
    pickable_flag: r.pickable_flag,
    raw_projection_json: r.raw_projection_json,
    row_payload_json: r.row_payload_json
  }));
  const cols = ["current_row_id", "batch_id", "source_key", "slate_date", "projection_id", "player_id", "player_name", "team", "opponent", "league", "stat_type", "line_score", "description", "start_time", "board_time", "end_time", "game_id", "event_type", "status", "projection_type", "odds_type", "source_line_type", "payout_variant", "is_goblin", "is_demon", "is_standard", "pickable_flag", "raw_projection_json", "row_payload_json"];
  const chunks = [];
  for (let i = 0; i < validRows.length; i += STAGE_INSERT_CHUNK_SIZE) chunks.push(validRows.slice(i, i + STAGE_INSERT_CHUNK_SIZE));
  const client = pgClient(env);
  try {
    for (const chunk of chunks) {
      await client`INSERT INTO market.prizepicks_board_current ${client(chunk, ...cols)}`;
    }
  } finally {
    await client.end({ timeout: 1 });
  }
  const inserted = validRows.length;
  return { wrote_table: "market.prizepicks_board_current", batch_id: batchId, slate_date: slateDate, inserted_rows: inserted, chunk_size: STAGE_INSERT_CHUNK_SIZE, chunk_count: chunks.length, parallel_chunks: false };
}

async function clearActivePrizePicksBoardForStaleSource(env, batchId, slateDate, cert, timing) {
  const staleReason = "Fetched PrizePicks source has no future pickable MLB rows; stale PrizePicks current inventory was cleared so downstream Score Prep cannot reuse yesterday/started lines.";
  const certificationJson = safeJson({
    version: VERSION,
    batch_id: batchId,
    source_key: SOURCE_KEY,
    slate_date: slateDate,
    certification: SOURCE_STALE_CERT,
    reason: staleReason,
    board_timing: timing,
    stale_current_clear_policy: "clear_prizepicks_current_and_active_pointer_when_fetched_source_has_no_future_pickable_rows",
    no_market_current_lines_write: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board_write: true
  }, 6000);

  const client = pgClient(env);
  try {
    await client.begin(async (tx) => {
      await tx.unsafe("DELETE FROM market.prizepicks_board_stage WHERE source_key=$1", [SOURCE_KEY]);
      await tx.unsafe("DELETE FROM market.prizepicks_board_current WHERE source_key=$1", [SOURCE_KEY]);
      await tx.unsafe("DELETE FROM market.prizepicks_board_active_batches WHERE source_key=$1", [SOURCE_KEY]);
      await tx.unsafe("UPDATE market.prizepicks_board_batches SET certification_status=$1, certification_reason=$2, certification_json=$3, cleaned_at=now(), updated_at=now() WHERE batch_id=$4", [SOURCE_STALE_CERT, staleReason, certificationJson, batchId]);
    });
  } finally {
    await client.end({ timeout: 1 });
  }

  return {
    promoted: false,
    source_stale_no_future_pickable: true,
    certification_status: SOURCE_STALE_CERT,
    reason: staleReason,
    batch_id: batchId,
    slate_date: slateDate,
    rows_promoted: 0,
    board_timing: timing,
    active_board_preserved: false,
    active_board_cleared: true,
    current_clear: { table: "prizepicks_board_current", source_key: SOURCE_KEY, cleared_existing_current_rows: true },
    active_pointer_clear: { table: "prizepicks_board_active_batches", source_key: SOURCE_KEY, cleared_existing_active_pointer: true },
    stage_cleanup: { table: "prizepicks_board_stage", source_key: SOURCE_KEY, cleaned: true },
    no_market_current_lines_write: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board_write: true
  };
}

async function currentPrizePicksInventorySummary(env) {
  const client = pgClient(env);
  let rows;
  try {
    rows = await client.unsafe(
      "SELECT COUNT(*) AS current_rows, SUM(CASE WHEN pickable_flag=1 THEN 1 ELSE 0 END) AS pickable_flag_rows, MIN(start_time) AS min_start_time, MAX(start_time) AS max_start_time, COUNT(DISTINCT batch_id) AS current_batches FROM market.prizepicks_board_current WHERE source_key=$1",
      [SOURCE_KEY]
    );
  } finally {
    await client.end({ timeout: 1 });
  }
  const row = rows && rows[0] ? rows[0] : {};
  return {
    current_rows: Number(row.current_rows || 0),
    pickable_flag_rows: Number(row.pickable_flag_rows || 0),
    min_start_time: row.min_start_time || null,
    max_start_time: row.max_start_time || null,
    current_batches: Number(row.current_batches || 0),
    has_current_inventory: Number(row.current_rows || 0) > 0
  };
}

async function preserveActivePrizePicksBoardForUnrefreshedSource(env, batchId, slateDate, cert, timing, sourceRefreshWait, sourceRefreshDispatch) {
  const inventory = await currentPrizePicksInventorySummary(env);
  const hasCurrent = Boolean(inventory && inventory.has_current_inventory);
  const certificationStatus = hasCurrent ? SOURCE_REFRESH_WAIT_CERT : SOURCE_REFRESH_WAIT_NO_CURRENT_CERT;
  const reason = hasCurrent
    ? "Fetched PrizePicks source still had no future pickable MLB rows after bounded refresh wait; existing PrizePicks current inventory was verified and preserved so downstream cannot be emptied by a transient stale producer file."
    : "Fetched PrizePicks source still had no future pickable MLB rows after bounded refresh wait, and there is no existing PrizePicks current inventory to preserve; Board Full must stop until the producer commits a fresh future board.";
  const certificationJson = safeJson({
    version: VERSION,
    batch_id: batchId,
    source_key: SOURCE_KEY,
    slate_date: slateDate,
    certification: certificationStatus,
    reason,
    board_timing: timing,
    current_inventory: inventory,
    source_refresh_dispatch: sourceRefreshDispatch || null,
    source_refresh_wait: sourceRefreshWait || null,
    stale_current_policy: hasCurrent
      ? "preserve_verified_existing_prizepicks_current_when_refresh_wait_does_not_observe_future_pickable_rows"
      : "no_current_inventory_to_preserve_refuse_false_pass",
    no_market_current_lines_write: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board_write: true
  }, 6000);

  const client = pgClient(env);
  try {
    await client.begin(async (tx) => {
      await tx.unsafe("DELETE FROM market.prizepicks_board_stage WHERE batch_id=$1", [batchId]);
      await tx.unsafe("UPDATE market.prizepicks_board_batches SET certification_status=$1, certification_reason=$2, certification_json=$3, cleaned_at=now(), updated_at=now() WHERE batch_id=$4", [certificationStatus, reason, certificationJson, batchId]);
    });
  } finally {
    await client.end({ timeout: 1 });
  }

  return {
    promoted: false,
    source_refresh_wait_exhausted_no_future_pickable: true,
    source_refresh_wait_no_current_to_preserve: !hasCurrent,
    certification_status: certificationStatus,
    reason,
    batch_id: batchId,
    slate_date: slateDate,
    rows_promoted: 0,
    board_timing: timing,
    current_inventory: inventory,
    preserved_current_rows: inventory.current_rows,
    active_board_preserved: hasCurrent,
    active_board_cleared: false,
    current_clear: { table: "prizepicks_board_current", source_key: SOURCE_KEY, cleared_existing_current_rows: false },
    active_pointer_clear: { table: "prizepicks_board_active_batches", source_key: SOURCE_KEY, cleared_existing_active_pointer: false },
    stage_cleanup: { table: "prizepicks_board_stage", batch_id: batchId, cleaned: true },
    source_refresh_dispatch: sourceRefreshDispatch || null,
    source_refresh_wait: sourceRefreshWait || null,
    no_market_current_lines_write: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board_write: true
  };
}

async function promoteCertifiedBatch(env, batchId, slateDate, cert, stagedRows, timing) {
  if (!cert.passed || cert.validRows !== cert.mlbRows || cert.validRows !== stagedRows.length) {
    return {
      promoted: false,
      certification_status: PROMOTION_CERT_FAIL,
      reason: "promotion_blocked_certification_or_row_count_mismatch",
      checks: {
        cert_passed: Boolean(cert.passed),
        valid_rows_equal_mlb_rows: cert.validRows === cert.mlbRows,
        valid_rows_equal_staged_rows: cert.validRows === stagedRows.length
      },
      active_board_preserved: true
    };
  }

  if (timing && timing.all_valid_rows_started_or_expired) {
    return await clearActivePrizePicksBoardForStaleSource(env, batchId, slateDate, cert, timing);
  }

  const inserted = await insertCurrentRows(env, stagedRows, batchId, slateDate);
  if (inserted.inserted_rows !== cert.validRows) {
    throw new Error(`promotion_insert_count_mismatch inserted=${inserted.inserted_rows} valid=${cert.validRows}`);
  }

  const promotionJson = safeJson({
    version: VERSION,
    batch_id: batchId,
    source_key: SOURCE_KEY,
    slate_date: slateDate,
    inserted_rows: inserted.inserted_rows,
    certification: cert,
    board_timing: timing || null,
    active_pointer_switch_after_insert: true,
    old_current_cleanup_after_pointer_switch: true,
    no_market_current_lines_write: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board_write: true
  }, 6000);

  const client = pgClient(env);
  try {
    await client.begin(async (tx) => {
      await tx.unsafe(
        "INSERT INTO market.prizepicks_board_active_batches (source_key, slate_date, active_batch_id, certification_status, row_count, valid_rows, activated_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, now(), now()) ON CONFLICT(source_key, slate_date) DO UPDATE SET active_batch_id=excluded.active_batch_id, certification_status=excluded.certification_status, row_count=excluded.row_count, valid_rows=excluded.valid_rows, activated_at=now(), updated_at=now()",
        [SOURCE_KEY, slateDate, batchId, PROMOTION_CERT_PASS, inserted.inserted_rows, cert.validRows]
      );
      await tx.unsafe("DELETE FROM market.prizepicks_board_active_batches WHERE source_key=$1 AND active_batch_id<>$2", [SOURCE_KEY, batchId]);
      await tx.unsafe(
        "UPDATE market.prizepicks_board_batches SET certification_status=$1, certification_reason=$2, certification_json=$3, promoted_at=now(), updated_at=now() WHERE batch_id=$4",
        [PROMOTION_CERT_PASS, "Certified PrizePicks batch promoted to active current board.", promotionJson, batchId]
      );
      await tx.unsafe("DELETE FROM market.prizepicks_board_stage WHERE source_key=$1", [SOURCE_KEY]);
      await tx.unsafe("UPDATE market.prizepicks_board_batches SET cleaned_at=now(), updated_at=now() WHERE batch_id=$1", [batchId]);
      await tx.unsafe("DELETE FROM market.prizepicks_board_current WHERE source_key=$1 AND batch_id<>$2", [SOURCE_KEY, batchId]);
    });
  } finally {
    await client.end({ timeout: 1 });
  }

  return {
    promoted: true,
    certification_status: PROMOTION_CERT_PASS,
    batch_id: batchId,
    slate_date: slateDate,
    rows_promoted: inserted.inserted_rows,
    active_pointer: { wrote_table: "prizepicks_board_active_batches", source_key: SOURCE_KEY, slate_date: slateDate, active_batch_id: batchId },
    current_rows: inserted,
    old_current_cleanup: { table: "prizepicks_board_current", source_key: SOURCE_KEY, kept_batch_id: batchId, cleanup_scope: "all_prior_prizepicks_batches" },
    stale_active_batch_cleanup: { table: "prizepicks_board_active_batches", source_key: SOURCE_KEY, kept_batch_id: batchId, cleanup_scope: "all_prior_prizepicks_active_pointers" },
    stage_cleanup: { table: "prizepicks_board_stage", source_key: SOURCE_KEY, cleaned: true },
    no_market_current_lines_write: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board_write: true
  };
}

function githubHeaders(env, accept = "application/vnd.github+json") {
  const headers = {
    "accept": accept,
    "user-agent": "AlphaDog-v2 PrizePicks GitHub Board Worker",
    "x-github-api-version": "2022-11-28",
    "cache-control": "no-cache, no-store, max-age=0",
    "pragma": "no-cache"
  };
  if (env && env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return headers;
}

function withCacheBust(url, label) {
  const text = String(url || "");
  if (!text) return text;
  const joiner = text.includes("?") ? "&" : "?";
  return `${text}${joiner}alphadog_cache_bust=${encodeURIComponent(`${Date.now()}_${label || "fresh"}`)}`;
}

function buildGithubRefApiUrl(owner, repo, branch) {
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(branch)}`;
}

function buildGithubContentsApiUrlForRef(owner, repo, ref, path) {
  const cleanPath = String(path || "").replace(/^\/+/, "").trim();
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${cleanPath.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`;
}

async function fetchGithubRefHead(source, env) {
  const url = buildGithubRefApiUrl(source.owner, source.repo, source.branch);
  try {
    const res = await fetch(withCacheBust(url, "ref_head"), { method: "GET", headers: githubHeaders(env), signal: timeoutSignal(GITHUB_FETCH_TIMEOUT_MS) });
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (_) {}
    const sha = parsed && parsed.object && parsed.object.sha ? String(parsed.object.sha) : null;
    return {
      ok: Boolean(res.ok && sha),
      http_status: res.status,
      content_type: res.headers.get("content-type"),
      branch: source.branch,
      commit_sha: sha,
      api_url: url,
      response_preview: res.ok ? null : safeString(text, 700)
    };
  } catch (err) {
    return { ok: false, http_status: null, content_type: null, branch: source.branch, commit_sha: null, api_url: url, error: safeString(err && err.message ? err.message : err, 700) };
  }
}

async function fetchGithubContentsMetadata(source, env, refOverride = null, label = "branch") {
  const ref = refOverride || source.branch;
  const apiUrl = buildGithubContentsApiUrlForRef(source.owner, source.repo, ref, source.path);
  try {
    const res = await fetch(withCacheBust(apiUrl, `contents_${label}`), { method: "GET", headers: githubHeaders(env), signal: timeoutSignal(GITHUB_FETCH_TIMEOUT_MS) });
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (_) {}
    const sha = parsed && parsed.sha ? String(parsed.sha) : null;
    const size = parsed && typeof parsed.size === "number" ? parsed.size : null;
    const htmlUrl = parsed && parsed.html_url ? String(parsed.html_url) : null;
    const gitUrl = parsed && parsed.git_url ? String(parsed.git_url) : null;
    const downloadUrl = parsed && parsed.download_url ? String(parsed.download_url) : null;
    return {
      ok: Boolean(res.ok && sha),
      http_status: res.status,
      content_type: res.headers.get("content-type"),
      ref,
      label,
      sha,
      size,
      html_url: htmlUrl,
      git_url: gitUrl,
      download_url: downloadUrl,
      response_preview: res.ok ? null : safeString(text, 700),
      api_url: apiUrl
    };
  } catch (err) {
    return { ok: false, http_status: null, content_type: null, ref, label, sha: null, size: null, api_url: apiUrl, error: safeString(err && err.message ? err.message : err, 700) };
  }
}

function summarizeCandidateJsonText(text) {
  const sizeBytes = new TextEncoder().encode(String(text || "")).length;
  let parsed = null;
  try { parsed = JSON.parse(text); } catch (err) {
    return { json_parse_ok: false, size_bytes: sizeBytes, error: safeString(err && err.message ? err.message : err, 500), row_count: 0, future_pickable_rows: 0 };
  }
  const detected = detectArray(parsed);
  const rows = detected.rows || [];
  const nowMs = Date.now();
  let future = 0;
  let expired = 0;
  let missing = 0;
  let invalid = 0;
  let minStart = null;
  let maxStart = null;
  let minStartUtc = null;
  let maxStartUtc = null;
  const statuses = new Map();
  const games = new Set();
  for (const row of rows) {
    const attrs = row && row.attributes && typeof row.attributes === "object" ? row.attributes : row || {};
    const rawStatus = attrs.status === undefined || attrs.status === null ? "unknown" : String(attrs.status);
    statuses.set(rawStatus, (statuses.get(rawStatus) || 0) + 1);
    const gameId = attrs.game_id || getDeepValue(row, ["relationships.game.data.id"]);
    if (gameId !== undefined && gameId !== null && String(gameId)) games.add(String(gameId));
    const start = attrs.start_time || attrs.startTime || attrs.start || null;
    if (!start) { missing++; continue; }
    const ms = Date.parse(String(start));
    if (!Number.isFinite(ms)) { invalid++; continue; }
    const iso = new Date(ms).toISOString();
    if (minStart === null || String(start) < minStart) minStart = String(start);
    if (maxStart === null || String(start) > maxStart) maxStart = String(start);
    if (minStartUtc === null || iso < minStartUtc) minStartUtc = iso;
    if (maxStartUtc === null || iso > maxStartUtc) maxStartUtc = iso;
    const normalizedStatus = rawStatus.toLowerCase().trim();
    const blockedByStatus = ["final", "complete", "completed", "canceled", "cancelled", "postponed", "suspended", "closed", "settled", "removed"].includes(normalizedStatus);
    if (!blockedByStatus && ms > nowMs) future++;
    else expired++;
  }
  return {
    json_parse_ok: true,
    size_bytes: sizeBytes,
    detected_rows_key: detected.key,
    row_count: rows.length,
    future_pickable_rows: future,
    expired_or_started_rows: expired,
    missing_start_time_rows: missing,
    invalid_start_time_rows: invalid,
    min_start_time: minStart,
    max_start_time: maxStart,
    min_start_time_utc: minStartUtc,
    max_start_time_utc: maxStartUtc,
    distinct_games: games.size,
    status_distribution: Array.from(statuses.entries()).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count).slice(0, 12)
  };
}

async function fetchTextCandidate(url, env, label, headers = null, metadata = null) {
  const started = Date.now();
  try {
    const res = await fetch(withCacheBust(url, label), { method: "GET", headers: headers || githubHeaders(env, "application/vnd.github.raw+json, application/json, text/plain, */*"), signal: timeoutSignal(GITHUB_FETCH_TIMEOUT_MS) });
    const text = await res.text();
    const summary = summarizeCandidateJsonText(text);
    return {
      ok: Boolean(res.ok && summary.json_parse_ok && summary.row_count > 0),
      label,
      url,
      http_status: res.status,
      content_type: res.headers.get("content-type"),
      elapsed_ms: Date.now() - started,
      metadata,
      text,
      summary,
      error: res.ok ? (summary.json_parse_ok ? null : summary.error) : `HTTP ${res.status}`,
      response_preview: res.ok ? null : safeString(text, 700)
    };
  } catch (err) {
    return {
      ok: false,
      label,
      url,
      http_status: null,
      content_type: null,
      elapsed_ms: Date.now() - started,
      metadata,
      text: "",
      summary: { json_parse_ok: false, row_count: 0, future_pickable_rows: 0, error: safeString(err && err.message ? err.message : err, 700) },
      error: safeString(err && err.message ? err.message : err, 700)
    };
  }
}

async function fetchBlobCandidate(blobUrl, source, env, label, metadata = null) {
  const started = Date.now();
  try {
    const res = await fetch(withCacheBust(blobUrl, label), { method: "GET", headers: githubHeaders(env), signal: timeoutSignal(GITHUB_FETCH_TIMEOUT_MS) });
    const body = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(body); } catch (_) {}
    let text = "";
    let decodeError = null;
    if (res.ok && parsed && parsed.encoding === "base64" && typeof parsed.content === "string") {
      try { text = decodeBase64Utf8(parsed.content); } catch (err) { decodeError = safeString(err && err.message ? err.message : err, 700); }
    }
    const summary = text ? summarizeCandidateJsonText(text) : { json_parse_ok: false, row_count: 0, future_pickable_rows: 0, error: decodeError || "GitHub blob API did not return decodable base64 content." };
    return {
      ok: Boolean(res.ok && text && !decodeError && summary.json_parse_ok && summary.row_count > 0),
      label,
      url: blobUrl,
      raw_branch_url: source.raw_branch_url || source.url,
      fetch_mode: "github_blob_api_base64",
      http_status: res.status,
      content_type: res.headers.get("content-type"),
      elapsed_ms: Date.now() - started,
      metadata,
      blob_encoding: parsed && parsed.encoding ? String(parsed.encoding) : null,
      blob_size: parsed && typeof parsed.size === "number" ? parsed.size : null,
      text,
      summary,
      error: res.ok ? (decodeError || (summary.json_parse_ok ? null : summary.error)) : `GitHub blob API fetch failed with HTTP ${res.status}`,
      response_preview: res.ok ? null : safeString(body, 700)
    };
  } catch (err) {
    return { ok: false, label, url: blobUrl, fetch_mode: "github_blob_api_base64", http_status: null, content_type: null, elapsed_ms: Date.now() - started, metadata, text: "", summary: { json_parse_ok: false, row_count: 0, future_pickable_rows: 0 }, error: safeString(err && err.message ? err.message : err, 700) };
  }
}

function candidatePublicSummary(candidate) {
  const summary = candidate && candidate.summary ? candidate.summary : {};
  const metadata = candidate && candidate.metadata ? candidate.metadata : null;
  return {
    label: candidate ? candidate.label : null,
    ok: Boolean(candidate && candidate.ok),
    http_status: candidate ? candidate.http_status : null,
    content_type: candidate ? candidate.content_type : null,
    metadata_sha: metadata && metadata.sha ? metadata.sha : null,
    metadata_size: metadata && metadata.size !== undefined ? metadata.size : null,
    metadata_ref: metadata && metadata.ref ? metadata.ref : null,
    blob_size: candidate && candidate.blob_size !== undefined ? candidate.blob_size : null,
    response_size_bytes: summary.size_bytes || 0,
    row_count: summary.row_count || 0,
    future_pickable_rows: summary.future_pickable_rows || 0,
    expired_or_started_rows: summary.expired_or_started_rows || 0,
    min_start_time: summary.min_start_time || null,
    max_start_time: summary.max_start_time || null,
    min_start_time_utc: summary.min_start_time_utc || null,
    max_start_time_utc: summary.max_start_time_utc || null,
    distinct_games: summary.distinct_games || 0,
    error: candidate && candidate.error ? safeString(candidate.error, 500) : null
  };
}
function sourceFetchHasRowsButNoFuturePickable(sourceFetch) {
  const selected = sourceFetch && sourceFetch.selected_candidate ? sourceFetch.selected_candidate : null;
  return Boolean(
    sourceFetch &&
    sourceFetch.ok &&
    selected &&
    Number(selected.row_count || 0) > 0 &&
    Number(selected.future_pickable_rows || 0) === 0 &&
    Number(selected.expired_or_started_rows || 0) > 0
  );
}

async function waitForFilledPrizePicksJsonAfterRefresh(env, source, input, initialSourceFetch, refreshDispatch, workerStartedMs) {
  const elapsedBeforeWait = Date.now() - Number(workerStartedMs || Date.now());
  const remainingBudget = Math.max(0, SOURCE_REFRESH_WORKER_BUDGET_MS - elapsedBeforeWait);
  const maxWaitMs = Math.min(SOURCE_REFRESH_WAIT_MAX_MS, remainingBudget);
  const attempts = [];
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const deadline = startedAtMs + maxWaitMs;
  let bestObserved = initialSourceFetch && initialSourceFetch.selected_candidate ? initialSourceFetch.selected_candidate : null;

  if (maxWaitMs <= 0) {
    return {
      ok: false,
      waited_ms: 0,
      attempts,
      started_at: startedAt,
      completed_at: nowUtc(),
      reason: "no_worker_budget_remaining_for_prizepicks_source_refresh_wait",
      refresh_dispatch: refreshDispatch || null,
      best_observed_candidate: bestObserved
    };
  }

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    await sleep(Math.min(SOURCE_REFRESH_POLL_INTERVAL_MS, remaining));
    const checkedAt = nowUtc();
    const candidateFetch = await fetchGithubJsonBySha(source, env);
    const selected = candidateFetch && candidateFetch.selected_candidate ? candidateFetch.selected_candidate : null;
    if (selected) {
      const currentFuture = Number(selected.future_pickable_rows || 0);
      const bestFuture = bestObserved ? Number(bestObserved.future_pickable_rows || 0) : -1;
      const currentRows = Number(selected.row_count || 0);
      const bestRows = bestObserved ? Number(bestObserved.row_count || 0) : -1;
      if (!bestObserved || currentFuture > bestFuture || (currentFuture === bestFuture && currentRows > bestRows)) bestObserved = selected;
    }
    attempts.push({
      checked_at: checkedAt,
      ok: Boolean(candidateFetch && candidateFetch.ok),
      selected_candidate: selected,
      external_calls_performed: candidateFetch && candidateFetch.external_calls_performed ? candidateFetch.external_calls_performed : 0,
      error: candidateFetch && candidateFetch.error ? safeString(candidateFetch.error, 500) : null
    });
    if (candidateFetch && candidateFetch.ok && selected && Number(selected.future_pickable_rows || 0) > 0) {
      return {
        ok: true,
        waited_ms: Date.now() - startedAtMs,
        attempts,
        started_at: startedAt,
        completed_at: nowUtc(),
        reason: "fresh_prizepicks_json_with_future_pickable_rows_observed_after_refresh_wait",
        refresh_dispatch: refreshDispatch || null,
        best_observed_candidate: selected,
        fresh_source_fetch: candidateFetch
      };
    }
  }

  return {
    ok: false,
    waited_ms: Date.now() - startedAtMs,
    attempts,
    started_at: startedAt,
    completed_at: nowUtc(),
    reason: "prizepicks_source_refresh_wait_exhausted_without_future_pickable_rows",
    refresh_dispatch: refreshDispatch || null,
    best_observed_candidate: bestObserved
  };
}


function chooseBestGithubCandidate(candidates) {
  const usable = candidates.filter(c => c && c.ok && c.summary && c.summary.row_count > 0);
  if (!usable.length) return null;
  usable.sort((a, b) => {
    const af = a.summary.future_pickable_rows || 0;
    const bf = b.summary.future_pickable_rows || 0;
    if (bf !== af) return bf - af;
    const ar = a.summary.row_count || 0;
    const br = b.summary.row_count || 0;
    if (br !== ar) return br - ar;
    const as = a.summary.size_bytes || 0;
    const bs = b.summary.size_bytes || 0;
    if (bs !== as) return bs - as;
    return String(a.label || "").localeCompare(String(b.label || ""));
  });
  return usable[0];
}

async function fetchGithubJsonBySha(source, env) {
  // REAL FIX (root-caused via direct code investigation, per Rodolfo's instruction - no
  // guessing): the previous version of this function always fetched up to ~9 GitHub surfaces
  // sequentially before picking the best one - the actual cause of the real board_full_run
  // timeout failure, since the whole operation was capped at a 15s hard deadline while each
  // individual fetch alone was allowed 12s. Real fix: try the fast, common-case primary source
  // (raw branch URL) first, with 3 retries using researched exponential-backoff-with-jitter
  // (standard pattern for transient network/rate-limit failures - Google Cloud/AWS-documented).
  // Only fall back to the expensive multi-surface comparison if the primary path genuinely
  // fails all 3 attempts or is non-retryable (e.g. a real 404) - preserving the existing
  // fallback robustness for real edge cases without paying its cost on every normal run.
  const primaryResult = await fetchPrimarySourceWithRetries(source, env);
  if (primaryResult.succeeded_on_primary && primaryResult.candidate) {
    const selected = primaryResult.candidate;
    return {
      ok: true,
      metadata: null,
      metadata_all: [],
      head_ref: null,
      candidates: [candidatePublicSummary(selected)],
      selected_candidate: candidatePublicSummary(selected),
      selected_label: selected.label,
      url: selected.url,
      raw_branch_url: source.raw_branch_url || source.url,
      fetch_mode: "github_primary_fast_path_with_retries",
      primary_fetch_attempts: primaryResult.attempts,
      http_status: selected.http_status,
      content_type: selected.content_type,
      text: selected.text,
      error: null,
      response_preview: null,
      external_calls_performed: primaryResult.attempts.length
    };
  }
  // Primary path exhausted (either non-retryable or all 3 attempts failed/stale) - fall back to
  // the full multi-surface comparison as a real, last-resort safety net.
  const fallback = await fetchGithubJsonMultiSurfaceFallback(source, env);
  return {
    ...fallback,
    fetch_mode: `${fallback.fetch_mode || "github_multi_surface_freshness_select"}_after_primary_fallback`,
    primary_fetch_attempts: primaryResult.attempts,
    primary_fetch_non_retryable: Boolean(primaryResult.non_retryable),
    external_calls_performed: (fallback.external_calls_performed || 0) + primaryResult.attempts.length
  };
}

async function fetchGithubJsonMultiSurfaceFallback(source, env) {
  const externalCalls = { count: 0 };
  const candidates = [];
  const metadataList = [];

  const [branchMeta, head] = await Promise.all([
    fetchGithubContentsMetadata(source, env, source.branch, "branch_contents"),
    fetchGithubRefHead(source, env)
  ]);
  externalCalls.count += 2;
  metadataList.push(branchMeta);

  let commitMeta = null;
  if (head && head.ok && head.commit_sha) {
    commitMeta = await fetchGithubContentsMetadata(source, env, head.commit_sha, "head_commit_contents");
    externalCalls.count++;
    metadataList.push(commitMeta);
  }

  const addMetaCandidates = async (meta, labelPrefix) => {
    if (!meta || !meta.ok) return;
    if (meta.download_url) {
      const c = await fetchTextCandidate(meta.download_url, env, `${labelPrefix}_download_url`, githubHeaders(env, "application/vnd.github.raw+json, application/json, text/plain, */*"), meta);
      externalCalls.count++;
      candidates.push(c);
    }
    if (meta.git_url || meta.sha) {
      const blobUrl = meta.git_url || buildGithubBlobApiUrl(source.owner, source.repo, meta.sha);
      const c = await fetchBlobCandidate(blobUrl, source, env, `${labelPrefix}_blob_api`, meta);
      externalCalls.count++;
      candidates.push(c);
    }
  };

  await addMetaCandidates(branchMeta, "branch_contents");
  if (commitMeta && (!branchMeta || commitMeta.sha !== branchMeta.sha || commitMeta.size !== branchMeta.size)) {
    await addMetaCandidates(commitMeta, "head_commit_contents");
  } else if (commitMeta && branchMeta && commitMeta.sha === branchMeta.sha && commitMeta.size === branchMeta.size) {
    metadataList.push({ ...commitMeta, duplicate_of_branch_metadata: true });
  }

  const rawBranch = await fetchTextCandidate(source.raw_branch_url || source.url, env, "raw_branch_cache_bust", githubHeaders(env, "application/json, text/plain, */*"), { ref: source.branch, api_url: source.raw_branch_url || source.url });
  externalCalls.count++;
  candidates.push(rawBranch);

  if (head && head.ok && head.commit_sha) {
    const rawCommitUrl = buildRawGithubCommitUrl(source.owner, source.repo, head.commit_sha, source.path);
    const rawCommit = await fetchTextCandidate(rawCommitUrl, env, "raw_head_commit_cache_bust", githubHeaders(env, "application/json, text/plain, */*"), { ref: head.commit_sha, commit_sha: head.commit_sha, api_url: rawCommitUrl });
    externalCalls.count++;
    candidates.push(rawCommit);
  }

  const selected = chooseBestGithubCandidate(candidates);
  const publicCandidates = candidates.map(candidatePublicSummary);
  const metadataSummary = metadataList.map(m => ({
    ok: Boolean(m && m.ok),
    label: m && m.label ? m.label : null,
    ref: m && m.ref ? m.ref : null,
    http_status: m ? m.http_status : null,
    sha: m && m.sha ? m.sha : null,
    size: m && m.size !== undefined ? m.size : null,
    download_url_present: Boolean(m && m.download_url),
    git_url_present: Boolean(m && m.git_url),
    api_url: m && m.api_url ? m.api_url : null,
    duplicate_of_branch_metadata: Boolean(m && m.duplicate_of_branch_metadata),
    error: m && m.error ? safeString(m.error, 500) : null,
    response_preview: m && m.response_preview ? safeString(m.response_preview, 500) : null
  }));

  if (!selected) {
    return {
      ok: false,
      metadata: branchMeta,
      metadata_all: metadataSummary,
      head_ref: head,
      candidates: publicCandidates,
      selected_candidate: null,
      external_calls_performed: externalCalls.count,
      url: source.contents_api_url,
      http_status: branchMeta ? branchMeta.http_status : null,
      content_type: branchMeta ? branchMeta.content_type : null,
      text: "",
      error: "No GitHub surface returned usable PrizePicks JSON rows. See source_fetch_candidates for per-surface failure details.",
      fetch_mode: "github_multi_surface_freshness_select"
    };
  }

  return {
    ok: true,
    metadata: selected.metadata || branchMeta,
    metadata_all: metadataSummary,
    head_ref: head,
    candidates: publicCandidates,
    selected_candidate: candidatePublicSummary(selected),
    selected_label: selected.label,
    url: selected.url,
    raw_branch_url: source.raw_branch_url || source.url,
    fetch_mode: "github_multi_surface_freshness_select",
    http_status: selected.http_status,
    content_type: selected.content_type,
    blob_encoding: selected.blob_encoding || null,
    blob_size: selected.blob_size || null,
    text: selected.text,
    error: null,
    response_preview: null,
    external_calls_performed: externalCalls.count
  };
}


function buildPrizePicksFreshJsonPollContinuation(input, source, sourceFetch, sourceRefreshDispatch, pollAttempt, started, reason = "prizepicks_github_json_not_fresh_yet") {
  const selected = sourceFetch && sourceFetch.selected_candidate ? sourceFetch.selected_candidate : null;
  const nextAttempt = Number(pollAttempt || 0) + 1;
  const nextInput = {
    ...(input || {}),
    prizepicks_refresh_poll_attempt: nextAttempt,
    prizepicks_refresh_poll_started_at: input && input.prizepicks_refresh_poll_started_at ? input.prizepicks_refresh_poll_started_at : nowUtc(),
    prizepicks_refresh_dispatch_attempted: true,
    prizepicks_refresh_dispatch_ok: sourceRefreshDispatch ? sourceRefreshDispatch.ok === true : Boolean(input && input.prizepicks_refresh_dispatch_ok),
    prizepicks_refresh_dispatch_summary: sourceRefreshDispatch ? {
      attempted: sourceRefreshDispatch.attempted === true,
      ok: sourceRefreshDispatch.ok === true,
      event_type: sourceRefreshDispatch.event_type || null,
      http_status: sourceRefreshDispatch.http_status || null,
      reason: sourceRefreshDispatch.reason || null,
      error: sourceRefreshDispatch.error || null
    } : (input && input.prizepicks_refresh_dispatch_summary ? input.prizepicks_refresh_dispatch_summary : null),
    backend_scheduled_continuation: true,
    source_refresh_poll_continuation: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true
  };
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    request_id: input && input.request_id ? input.request_id : null,
    chain_id: input && input.chain_id ? input.chain_id : null,
    source_key: SOURCE_KEY,
    mode: input && input.mode ? input.mode : "board_full_run_prizepicks_refresh",
    status: "partial_continue",
    certification: "PRIZEPICKS_SOURCE_REFRESH_WAITING_FOR_FRESH_JSON",
    certification_grade: "PARTIAL",
    reason,
    rows_read: selected ? Number(selected.row_count || 0) : 0,
    rows_staged: 0,
    rows_promoted: 0,
    future_pickable_rows: selected ? Number(selected.future_pickable_rows || 0) : 0,
    expired_or_started_rows: selected ? Number(selected.expired_or_started_rows || 0) : 0,
    external_calls_performed: sourceFetch && sourceFetch.external_calls_performed ? sourceFetch.external_calls_performed : 0,
    elapsed_ms: Date.now() - started,
    continuation_required: true,
    orchestrator_should_self_continue: true,
    run_after_seconds: SOURCE_REFRESH_POLL_CONTINUE_SECONDS,
    poll_attempt: Number(pollAttempt || 0),
    next_poll_attempt: nextAttempt,
    max_poll_attempts: SOURCE_REFRESH_MAX_POLL_ATTEMPTS,
    selected_source_candidate: selected,
    source_fetch_candidates: sourceFetch && sourceFetch.candidates ? sourceFetch.candidates : [],
    source_refresh_dispatch: sourceRefreshDispatch || (input && input.prizepicks_refresh_dispatch_summary ? input.prizepicks_refresh_dispatch_summary : null),
    next_input: nextInput,
    github_json_freshness_gate: {
      required_before_parse_and_promotion: true,
      required_future_pickable_rows_gt_0: true,
      stale_json_not_parsed_or_promoted: true,
      inline_sleep_removed: true,
      reason: "GitHub producer is asynchronous; consumer yields and polls instead of sleeping inside one service-binding invocation."
    },
    no_market_current_lines_write: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board_write: true,
    timestamp_utc: nowUtc()
  };
}

async function runBoardParseStageCertify(env, input = {}) {
  const started = Date.now();
  const requestId = input.request_id || null;
  const chainId = input.chain_id || null;
  const schema = await validateWriteSchema(env);
  if (!schema.ok) {
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, source_key: SOURCE_KEY, status: "blocked_schema_mismatch", certification: "SCHEMA_NOT_SAFE_TO_PROMOTE", schema, rows_read: 0, rows_staged: 0, rows_written: 0, external_calls_performed: 0, error: "MARKET_DB schema is missing required v0.1.3 staging/current-board promotion columns. Stop and patch schema only after review.", timestamp_utc: nowUtc() };
  }

  const source = await githubSourceConfig(env);
  let fetchStarted = nowUtc();
  let sourceFetch;
  let text = "";
  let sourceRefreshDispatch = null;
  let sourceRefreshWait = null;
  let sourceRefreshWaitPreservedCurrent = false;
  try {
    sourceFetch = await fetchGithubJsonBySha(source, env);
    if (sourceFetchHasRowsButNoFuturePickable(sourceFetch)) {
      const pollAttempt = Number(input && input.prizepicks_refresh_poll_attempt || 0);
      const dispatchAlreadyAttempted = Boolean(input && input.prizepicks_refresh_dispatch_attempted);
      if (!dispatchAlreadyAttempted) {
        sourceRefreshDispatch = await triggerPrizePicksSourceRefresh(
          env,
          source,
          { ...input, request_id: requestId, chain_id: chainId, slate_date: currentPtDate() },
          "initial_github_json_had_no_future_pickable_rows_before_stage_or_clear"
        );
      }
      if (pollAttempt < SOURCE_REFRESH_MAX_POLL_ATTEMPTS) {
        return buildPrizePicksFreshJsonPollContinuation(
          input,
          source,
          sourceFetch,
          sourceRefreshDispatch,
          pollAttempt,
          started,
          dispatchAlreadyAttempted ? "prizepicks_github_json_still_has_no_future_pickable_rows" : "prizepicks_github_refresh_dispatched_waiting_for_fresh_json"
        );
      }
      sourceRefreshWaitPreservedCurrent = true;
      sourceRefreshWait = {
        ok: false,
        waited_ms: 0,
        attempts: [],
        reason: "prizepicks_source_refresh_poll_attempts_exhausted_without_future_pickable_rows",
        max_poll_attempts: SOURCE_REFRESH_MAX_POLL_ATTEMPTS,
        best_observed_candidate: sourceFetch && sourceFetch.selected_candidate ? sourceFetch.selected_candidate : null,
        completed_at: nowUtc()
      };
    }
    text = sourceFetch.text || "";
  } catch (err) {
    const error = safeString(err && err.message ? err.message : err);
    const health = { version: VERSION, request_id: requestId, chain_id: chainId, source_key: SOURCE_KEY, source_config: { owner: source.owner, repo: source.repo, branch: source.branch, path: source.path, raw_branch_url: source.raw_branch_url, contents_api_url: source.contents_api_url, config_resolution: source.config_resolution }, fetch_started_at: fetchStarted, checked_at: nowUtc(), reachable: false, http_status: null, json_parse_ok: false, error, fetch_mode: "github_multi_surface_freshness_select", no_market_current_lines_write: true, no_scoring: true };
    const write = await writeHealth(env, "error", 0, health, error);
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, source_key: SOURCE_KEY, status: "error", certification: "SOURCE_UNREACHABLE", rows_read: 0, rows_staged: 0, rows_written: 1, external_calls_performed: 1, elapsed_ms: Date.now() - started, health, write, timestamp_utc: nowUtc() };
  }

  const httpStatus = sourceFetch ? sourceFetch.http_status : null;
  const contentType = sourceFetch ? sourceFetch.content_type : null;
  const sizeBytes = new TextEncoder().encode(text || "").length;

  if (!sourceFetch || !sourceFetch.ok) {
    const error = sourceFetch && sourceFetch.error ? sourceFetch.error : `GitHub blob-sha source fetch failed with HTTP ${httpStatus}`;
    const health = { version: VERSION, request_id: requestId, chain_id: chainId, source_key: SOURCE_KEY, source_config: { owner: source.owner, repo: source.repo, branch: source.branch, path: source.path, raw_branch_url: source.raw_branch_url, contents_api_url: source.contents_api_url, config_resolution: source.config_resolution }, github_file_metadata: sourceFetch ? sourceFetch.metadata : null, github_file_metadata_all: sourceFetch ? sourceFetch.metadata_all : null, github_head_ref: sourceFetch ? sourceFetch.head_ref : null, fetched_url: sourceFetch ? sourceFetch.url : null, fetch_mode: sourceFetch ? sourceFetch.fetch_mode : "github_multi_surface_freshness_select", selected_source_candidate: sourceFetch ? sourceFetch.selected_candidate : null, source_fetch_candidates: sourceFetch ? sourceFetch.candidates : [], fetch_started_at: fetchStarted, checked_at: nowUtc(), reachable: false, http_status: httpStatus, content_type: contentType, response_size_bytes: sizeBytes, json_parse_ok: false, error, response_preview: safeString(text, 500), no_market_current_lines_write: true, no_scoring: true };
    const write = await writeHealth(env, "error", 0, health, error);
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, source_key: SOURCE_KEY, status: "error", certification: "SOURCE_HTTP_ERROR", rows_read: 0, rows_staged: 0, rows_written: 1, external_calls_performed: sourceFetch && sourceFetch.external_calls_performed ? sourceFetch.external_calls_performed : 0, elapsed_ms: Date.now() - started, health, write, timestamp_utc: nowUtc() };
  }

  const pathLower = String(source.path || "").toLowerCase();
  const isJavascriptSource = pathLower.endsWith(".js") || String(contentType || "").includes("javascript") || looksLikeAlphaDogWorkerScript(text);
  if (isJavascriptSource) {
    const scriptShape = summarizeWorkerScript(text);
    const error = "Configured PrizePicks path reached a Worker script, not the real PrizePicks JSON board dump.";
    const health = { version: VERSION, request_id: requestId, chain_id: chainId, source_key: SOURCE_KEY, source_config: { owner: source.owner, repo: source.repo, branch: source.branch, path: source.path, config_resolution: source.config_resolution }, fetch_started_at: fetchStarted, checked_at: nowUtc(), reachable: true, http_status: httpStatus, content_type: contentType, response_size_bytes: sizeBytes, json_parse_ok: false, source_file_mode: "javascript_worker_script", script_shape: scriptShape, error, no_market_current_lines_write: true, no_scoring: true, no_final_board_write: true };
    const write = await writeHealth(env, "error", 0, health, error);
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, source_key: SOURCE_KEY, status: "error", certification: "SOURCE_IS_WORKER_SCRIPT_NOT_BOARD_JSON", rows_read: 0, rows_staged: 0, rows_written: 1, external_calls_performed: 1, elapsed_ms: Date.now() - started, health, write, timestamp_utc: nowUtc() };
  }

  let parsed;
  let parseError = null;
  try { parsed = JSON.parse(text); } catch (err) { parseError = safeString(err && err.message ? err.message : err); }
  if (parseError) {
    const health = { version: VERSION, request_id: requestId, chain_id: chainId, source_key: SOURCE_KEY, source_config: { owner: source.owner, repo: source.repo, branch: source.branch, path: source.path, config_resolution: source.config_resolution }, fetch_started_at: fetchStarted, checked_at: nowUtc(), reachable: true, http_status: httpStatus, content_type: contentType, response_size_bytes: sizeBytes, json_parse_ok: false, error: parseError, response_preview: safeString(text, 500), no_market_current_lines_write: true, no_scoring: true };
    const write = await writeHealth(env, "error", 0, health, parseError);
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, source_key: SOURCE_KEY, status: "error", certification: "JSON_PARSE_FAILED", rows_read: 0, rows_staged: 0, rows_written: 1, external_calls_performed: 1, elapsed_ms: Date.now() - started, health, write, timestamp_utc: nowUtc() };
  }

  const shape = summarizeJsonShape(parsed);
  const detected = detectArray(parsed);
  const sourceRows = detected.rows || [];
  const slateDate = slateDateFromJson(parsed, input);
  const batchId = rid("pp_batch");
  const includedIndex = buildIncludedIndex(parsed);
  const leagueMap = includedLeagueMap(parsed);
  const stagedRows = sourceRows.map(row => parseProjectionRow(row, includedIndex, leagueMap, slateDate, fetchStarted, batchId));

  const rawWrite = await writeRawSnapshot(env, parsed, shape.detected_row_count, slateDate, RAW_SNAPSHOT_STATUS_OK, null);
  const batchPending = await insertBatchPending(env, batchId, source, fetchStarted, slateDate, httpStatus, sizeBytes, shape);
  const stageWrite = await stageRows(env, stagedRows);
  const cert = buildCertification(shape, stagedRows, sizeBytes, source.path);
  const boardTiming = buildBoardTimingSummary(stagedRows, Date.now());
  cert.board_timing = boardTiming;
  cert.future_pickable_rows = boardTiming.future_pickable_rows;
  cert.expired_or_started_rows = boardTiming.expired_or_started_rows;
  const batchFinalize = await finalizeBatch(env, batchId, cert);

  let promotion = { promoted: false, certification_status: cert.certification_status, reason: cert.passed ? "promotion_not_attempted" : cert.certification_reason, active_board_preserved: true };
  if (cert.passed) {
    try {
      if (sourceRefreshWaitPreservedCurrent && boardTiming && boardTiming.all_valid_rows_started_or_expired) {
        promotion = await preserveActivePrizePicksBoardForUnrefreshedSource(env, batchId, slateDate, cert, boardTiming, sourceRefreshWait, sourceRefreshDispatch);
      } else {
        promotion = await promoteCertifiedBatch(env, batchId, slateDate, cert, stagedRows, boardTiming);
      }
    } catch (err) {
      const promotionError = safeString(err && err.message ? err.message : err, 900);
      promotion = { promoted: false, certification_status: PROMOTION_CERT_FAIL, reason: promotionError, active_board_preserved: true };
      const errClient = pgClient(env);
      try {
        await errClient.unsafe(
          "UPDATE market.prizepicks_board_batches SET certification_status=$1, certification_reason=$2, certification_json=$3, updated_at=now() WHERE batch_id=$4",
          [PROMOTION_CERT_FAIL, `Promotion failed after successful staging/certification: ${promotionError}`, safeJson({ version: VERSION, batch_id: batchId, promotion_error: promotionError, active_board_preserved_until_pointer_switch: true, no_market_current_lines_write: true, no_scoring: true }, 6000), batchId]
        );
      } finally {
        await errClient.end({ timeout: 1 });
      }
    }
  }

  const sourceStaleHandled = Boolean(promotion && promotion.source_stale_no_future_pickable);
  const sourceRefreshWaitPreserved = Boolean(promotion && promotion.source_refresh_wait_exhausted_no_future_pickable && promotion.active_board_preserved && Number(promotion.preserved_current_rows || 0) > 0);
  const sourceRefreshWaitNoCurrent = Boolean(promotion && promotion.source_refresh_wait_no_current_to_preserve);
  if (sourceStaleHandled && !sourceRefreshDispatch) {
    sourceRefreshDispatch = await triggerPrizePicksSourceRefresh(
      env,
      source,
      { ...input, request_id: requestId, chain_id: chainId, slate_date: slateDate },
      SOURCE_STALE_CERT
    );
  }
  // Additive fix (2026-07-14): certification can fail with a nonzero-but-thin board (e.g. 1
  // future-pickable row, well below mlb_rows_min_100) - this is distinct from the "all rows
  // expired/stale" case above and was never triggering a rescrape. Fire the same GitHub
  // repository_dispatch refresh for this case too, so a thin board self-heals on the next run
  // instead of silently staying thin forever.
  const sourceInsufficientRows = Boolean(!cert.passed && Array.isArray(cert.failed_checks) && cert.failed_checks.includes("mlb_rows_min_100") && Number(cert.future_pickable_rows || 0) > 0);
  if (sourceInsufficientRows && !sourceRefreshDispatch) {
    sourceRefreshDispatch = await triggerPrizePicksSourceRefresh(
      env,
      source,
      { ...input, request_id: requestId, chain_id: chainId, slate_date: slateDate },
      "source_certification_failed_insufficient_mlb_rows_below_min_100"
    );
  }
  const finalPassed = cert.passed && promotion.promoted;
  const finalHandled = finalPassed || sourceStaleHandled || sourceRefreshWaitPreserved;
  const finalCertification = finalPassed ? PROMOTION_CERT_PASS : (sourceStaleHandled ? SOURCE_STALE_CERT : (sourceRefreshWaitNoCurrent ? SOURCE_REFRESH_WAIT_NO_CURRENT_CERT : (sourceRefreshWaitPreserved ? SOURCE_REFRESH_WAIT_CERT : (cert.passed ? PROMOTION_CERT_FAIL : cert.certification_status))));
  const finalReason = finalPassed ? "Certified PrizePicks batch promoted to active current board." : (promotion.reason || cert.certification_reason);
  const healthStatus = finalPassed ? "healthy" : (sourceStaleHandled ? "source_stale_no_future_pickable_rows" : (sourceRefreshWaitNoCurrent ? "source_stale_no_future_pickable_rows_no_current" : "warning"));
  const health = {
    version: VERSION,
    request_id: requestId,
    chain_id: chainId,
    source_key: SOURCE_KEY,
    source_config: { owner: source.owner, repo: source.repo, branch: source.branch, path: source.path, raw_branch_url: source.raw_branch_url, contents_api_url: source.contents_api_url, config_resolution: source.config_resolution },
    github_file_metadata: sourceFetch ? sourceFetch.metadata : null,
    github_file_metadata_all: sourceFetch ? sourceFetch.metadata_all : null,
    github_head_ref: sourceFetch ? sourceFetch.head_ref : null,
    fetched_url: sourceFetch ? sourceFetch.url : null,
    fetch_mode: sourceFetch ? sourceFetch.fetch_mode : "github_multi_surface_freshness_select",
    selected_source_candidate: sourceFetch ? sourceFetch.selected_candidate : null,
    source_fetch_candidates: sourceFetch ? sourceFetch.candidates : [],
    fetch_started_at: fetchStarted,
    checked_at: nowUtc(),
    reachable: true,
    http_status: httpStatus,
    content_type: contentType,
    response_size_bytes: sizeBytes,
    json_parse_ok: true,
    slate_date: slateDate,
    shape,
    selected_source_candidate: sourceFetch ? sourceFetch.selected_candidate : null,
    source_fetch_candidates: sourceFetch ? sourceFetch.candidates : [],
    github_file_metadata_all: sourceFetch ? sourceFetch.metadata_all : null,
    github_head_ref: sourceFetch ? sourceFetch.head_ref : null,
    batch: { batch_id: batchId, certification_status: finalCertification, certification_reason: finalReason, valid_rate: cert.validRate },
    board_timing: boardTiming,
    promotion,
    source_refresh_wait: sourceRefreshWait,
    source_refresh_wait_preserved_current: sourceRefreshWaitPreservedCurrent,
    raw_snapshot: rawWrite,
    no_market_current_lines_write: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board_write: true,
    manual_refresh_only: false,
    source_refresh_dispatch_enabled: true
  };
  const healthWrite = await writeHealth(env, healthStatus, cert.mlbRows || shape.detected_row_count, health, finalPassed ? null : finalReason);

  return {
    ok: finalHandled,
    data_ok: finalHandled,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    request_id: requestId,
    chain_id: chainId,
    source_key: SOURCE_KEY,
    status: healthStatus,
    certification: finalCertification,
    certification_reason: finalReason,
    rows_read: shape.detected_row_count,
    rows_staged: stagedRows.length,
    rows_promoted: promotion.rows_promoted || 0,
    future_pickable_rows: boardTiming.future_pickable_rows,
    expired_or_started_rows: boardTiming.expired_or_started_rows,
    missing_start_time_rows: boardTiming.missing_start_time_rows,
    invalid_start_time_rows: boardTiming.invalid_start_time_rows,
    mlb_rows: cert.mlbRows,
    valid_rows: cert.validRows,
    invalid_rows: cert.invalidRows,
    valid_rate: Number(cert.validRate.toFixed(4)),
    rows_written: 5 + stagedRows.length + (promotion.rows_promoted || 0),
    external_calls_performed: sourceFetch && sourceFetch.external_calls_performed ? sourceFetch.external_calls_performed : 0,
    elapsed_ms: Date.now() - started,
    source_config_safe: { owner: source.owner, repo: source.repo, branch: source.branch, path: source.path, config_resolution: source.config_resolution, selected_source_candidate: sourceFetch ? sourceFetch.selected_candidate : null },
    shape,
    selected_source_candidate: sourceFetch ? sourceFetch.selected_candidate : null,
    source_fetch_candidates: sourceFetch ? sourceFetch.candidates : [],
    github_file_metadata_all: sourceFetch ? sourceFetch.metadata_all : null,
    github_head_ref: sourceFetch ? sourceFetch.head_ref : null,
    batch: { batch_id: batchId, certification_status: finalCertification, certification_checks: cert.checks, failed_checks: cert.failed_checks },
    board_timing: boardTiming,
    promotion,
    source_refresh_dispatch: sourceRefreshDispatch,
    source_refresh_wait: sourceRefreshWait,
    writes: { raw_snapshot: rawWrite, batch_pending: batchPending, stage: stageWrite, batch_finalize: batchFinalize, promotion, source_health: healthWrite },
    lifecycle_locked: {
      fetch_parse_stage_certify_promote_complete: finalPassed,
      source_stale_no_future_pickable_handled: sourceStaleHandled,
      source_stale_current_preserved: Boolean(promotion && promotion.active_board_preserved),
      source_refresh_wait_preserved_current: Boolean(promotion && promotion.source_refresh_wait_exhausted_no_future_pickable),
      active_pointer_table: "prizepicks_board_active_batches",
      current_board_table: "prizepicks_board_current",
      stage_cleaned_after_success: Boolean(promotion.stage_cleanup && promotion.stage_cleanup.cleaned),
      no_market_current_lines_write: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true,
      github_source_refresh_dispatch_enabled: true,
      manual_buttons: ["BOARD > PrizePicks", "ORCHESTRATOR > Wake"]
    },
    output_cap_note: "Response contains promotion/certification only. Full raw JSON stays in GitHub. Active PrizePicks board is held in prizepicks_board_current behind prizepicks_board_active_batches. No market_current_lines, scoring, ranking, or final board. v0.1.16 compares GitHub metadata/download/raw/blob surfaces, dispatches the producer on no-future source, yields partial continuation while polling for fresh JSON, and preserves existing current inventory only after bounded poll exhaustion when MARKET_DB proves rows actually exist.",
    timestamp_utc: nowUtc()
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();
    if (method === "OPTIONS") return jsonResponse({ ok: true });
    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));
    if (method === "GET" && path === "/health") {
      let schema = null;
      let source = null;
      try { schema = await validateWriteSchema(env); } catch (err) { schema = { ok: false, error: safeString(err && err.message ? err.message : err) }; }
      try { source = await githubSourceConfig(env); } catch (err) { source = { ok: false, error: safeString(err && err.message ? err.message : err) }; }
      return jsonResponse({ ...baseIdentity(env), route: "/health", checks: { db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS), config_values_present: valuePresence(env, REQUIRED_CONFIG_VALUES), write_schema: schema, github_source_config: source }, safe_secret_note: "Secret/config values are presence-checked only. GitHub token value is never printed." });
    }
    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      return jsonResponse({ ...baseIdentity(env), route: "/diagnostic", input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, job_key: input.job_key || null, mode: input.mode || null }, diagnostics: { db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS), config_values_present: valuePresence(env, REQUIRED_CONFIG_VALUES), write_schema: await validateWriteSchema(env), github_source_config: await githubSourceConfig(env) }, writes_performed: 0, external_calls_performed: 0 });
    }
async function withDeadline(promise, ms, fallbackFactory) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(typeof fallbackFactory === "function" ? fallbackFactory() : fallbackFactory), Math.max(1000, Number(ms) || 1000));
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const HARD_DEADLINE_MS = 45000;
      const TIMEOUT_SENTINEL = { __hard_deadline_timeout__: true };
      const rawOutput = await withDeadline(runBoardParseStageCertify(env, input), HARD_DEADLINE_MS, () => TIMEOUT_SENTINEL);
      const output = rawOutput === TIMEOUT_SENTINEL ? {
        ok: false,
        data_ok: false,
        version: VERSION,
        worker_name: WORKER_NAME,
        job_key: JOB_KEY,
        status: "hard_deadline_timeout",
        certification: "PRIZEPICKS_GITHUB_BOARD_HARD_DEADLINE_TIMEOUT",
        error: `Worker exceeded its own ${HARD_DEADLINE_MS}ms internal deadline`,
        hard_deadline_ms: HARD_DEADLINE_MS
      } : rawOutput;
      return jsonResponse(output, 200);
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
