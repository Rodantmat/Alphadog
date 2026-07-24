import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-market-normalizer";
const VERSION = "alphadog-v2-market-normalizer-v0.2.0-postgres-rewire";
const JOB_KEY = "market-normalizer";
const PHASE_KEY = "market_teams_game_odds";
const ODDS_API_SOURCE_KEY = "odds_api";
const FEATURED_GAME_MARKET_KEYS = ["h2h", "spreads", "totals"];
const EXPANDED_GAME_TEAM_MARKET_KEYS = ["team_totals", "alternate_spreads", "alternate_totals"];
const ALL_GAME_TEAM_MARKET_KEYS = [...FEATURED_GAME_MARKET_KEYS, ...EXPANDED_GAME_TEAM_MARKET_KEYS];
const MAX_PREPARED_ROWS = 9000;
const TEAM_MATCH_TOLERANCE_MINUTES = 25;
const MARKET_TEAMS_DEFAULT_WORKER_BUDGET_MS = 20000;
const MARKET_TEAMS_EXPANDED_MIN_REMAINING_MS = 8000;
const MARKET_TEAMS_EXPANDED_DEFAULT_MAX_EVENTS = 1;
const MARKET_TEAMS_EXPANDED_DEFAULT_CONCURRENCY = 2;

function pg(env) { return postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false, prepare: false }); }
function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function safeText(value, max = 900) {
  const text = value === undefined || value === null ? "" : String(value);
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}
function safeJson(value, max = 7000) {
  const text = JSON.stringify(value === undefined ? null : value);
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,x-ingest-token,x-admin-token,authorization", "access-control-allow-methods": "GET,POST,OPTIONS" }
  });
}
async function readJsonSafe(request) { try { return await request.json(); } catch (_) { return {}; } }
async function mapLimit(items, limit, mapper) {
  const list = Array.isArray(items) ? items : [];
  const max = Math.max(1, Number(limit || 1));
  const results = new Array(list.length);
  let next = 0;
  async function worker() { while (next < list.length) { const idx = next++; results[idx] = await mapper(list[idx], idx); } }
  const workers = [];
  for (let i = 0; i < Math.min(max, list.length); i += 1) workers.push(worker());
  await Promise.all(workers);
  return results;
}
function bindingPresence(env, names) { const out = {}; for (const name of names) out[name] = Boolean(env && env[name]); return out; }
function valuePresence(env, names) { const out = {}; for (const name of names) out[name] = env && env[name] !== undefined && env[name] !== null && String(env[name]).length > 0; return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
function ptDate(offsetDays = 0) {
  const dt = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(dt);
  const o = {}; for (const p of parts) if (p.type !== "literal") o[p.type] = p.value;
  return `${o.year}-${o.month}-${o.day}`;
}
function normalizeName(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/\b(the)\b/gi, "").replace(/\b(jr|sr|ii|iii|iv)\.?\b/gi, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase().replace(/\s+/g, " ");
}
function normalizeProp(value) { return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function parseTime(value) { const t = Date.parse(value || ""); return Number.isFinite(t) ? t : null; }
function minutesBetween(a, b) { if (a === null || b === null) return null; return Math.abs(a - b) / 60000; }
function sourceHas(env, key) {
  if (!env || env[key] === undefined || env[key] === null) return false;
  const value = String(env[key]).trim();
  return value.length > 0 && value.toUpperCase() !== "DISABLED" && value.toUpperCase() !== "SET_ME";
}
async function resolveOddsApiKey(env, pgClient) {
  try {
    const rows = await pgClient`SELECT credential_value_encrypted FROM config.external_credentials WHERE credential_key='the_odds_api_key' LIMIT 1`;
    if (rows[0] && rows[0].credential_value_encrypted) {
      const raw = rows[0].credential_value_encrypted;
      try { const parsed = JSON.parse(raw); if (parsed && parsed.password) return String(parsed.password).trim(); } catch (_) {}
      if (String(raw).trim()) return String(raw).trim();
    }
  } catch (_) { /* fall through to secret */ }
  return env.ODDS_API_KEY ? String(env.ODDS_API_KEY) : null;
}
function fetchTimeoutMs(env) { const n = Number(env && env.ODDS_API_FETCH_TIMEOUT_MS ? env.ODDS_API_FETCH_TIMEOUT_MS : 12000); return Number.isFinite(n) && n > 1000 ? Math.min(n, 25000) : 12000; }
function marketTeamsWorkerBudgetMs(env) { const n = Number(env && env.MARKET_TEAMS_WORKER_BUDGET_MS ? env.MARKET_TEAMS_WORKER_BUDGET_MS : MARKET_TEAMS_DEFAULT_WORKER_BUDGET_MS); return Number.isFinite(n) && n >= 20000 ? Math.min(n, 70000) : MARKET_TEAMS_DEFAULT_WORKER_BUDGET_MS; }
function remainingBudgetMs(deadlineMs) { if (!Number.isFinite(Number(deadlineMs))) return Number.POSITIVE_INFINITY; return Number(deadlineMs) - Date.now(); }
function hasRemainingBudget(deadlineMs, minRemainingMs = 2500) { return remainingBudgetMs(deadlineMs) > Number(minRemainingMs || 0); }
function marketTeamsExpandedMaxEvents(env) {
  const raw = env && env.ODDS_API_EXPANDED_MAX_EVENTS !== undefined ? Number(env.ODDS_API_EXPANDED_MAX_EVENTS) : MARKET_TEAMS_EXPANDED_DEFAULT_MAX_EVENTS;
  if (!Number.isFinite(raw)) return MARKET_TEAMS_EXPANDED_DEFAULT_MAX_EVENTS;
  return Math.max(0, Math.min(20, raw));
}
async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("fetch_timeout"), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); } finally { clearTimeout(timer); }
}

function baseIdentity(env, extra = {}) {
  const db = { HYPERDRIVE: Boolean(env && env.HYPERDRIVE) };
  const secrets = valuePresence(env, ["ODDS_API_KEY"]);
  return {
    ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, phase_key: PHASE_KEY, status: "READY",
    timestamp_utc: nowUtc(), mode: "market_teams_game_odds",
    binding_summary: { required_db_bindings_present: allTrue(db), source_secret_presence_only: secrets },
    hard_boundaries: { writes_market_current_lines: false, mutates_score_board_prepared_current: false, scoring: false, ranking: false, final_board: false, matrix_builder: false, retention: "today_tomorrow_only_probe_and_normalized_market_tables" },
    ...extra
  };
}

async function pruneProbeWindow(pgClient, boardWindowDates, slateWindowKey) {
  const tables = ["context_probe_game_odds", "context_probe_player_props", "context_probe_event_map", "context_probe_coverage", "context_probe_issues", "context_probe_book_market_status", "context_probe_game_market_summary", "context_probe_game_team_market_expansion"];
  const deleted = {};
  for (const table of tables) {
    await pgClient.unsafe(`DELETE FROM market.${table} WHERE slate_window_key <> $1 OR official_date NOT IN (${boardWindowDates.map((_, i) => `$${i + 2}`).join(",")})`, [slateWindowKey, ...boardWindowDates]);
    await pgClient.unsafe(`DELETE FROM market.${table} WHERE slate_window_key = $1`, [slateWindowKey]);
    deleted[table] = "pruned_outside_board_window_and_replaced_current_window";
  }
  await pgClient`DELETE FROM market.context_probe_batches WHERE slate_window_key <> ${slateWindowKey}`;
  await pgClient`DELETE FROM market.context_probe_batches WHERE slate_window_key = ${slateWindowKey}`;
  deleted.context_probe_batches = "pruned_outside_board_window_and_replaced_current_window";
  return deleted;
}

async function permanentlyRecordConfirmedMarketOdds(pgClient) {
  const rows = await pgClient`SELECT official_date, source_event_id, source_home_team, source_away_team, source_commence_time_utc, bookmaker_key, market_key, outcome_name, price_american, point, market_last_update, raw_json FROM market.context_probe_game_odds WHERE mapping_status IS NOT NULL AND source_event_id IS NOT NULL`.catch(() => []);
  if (!rows.length) return { copied: 0, checked: 0 };
  let copied = 0;
  for (const r of rows) {
    const rowId = `${r.official_date}|${r.source_event_id}|${r.bookmaker_key}|${r.market_key}|${r.outcome_name}|${r.point}`.slice(0, 200);
    await pgClient`INSERT INTO market.historical_props_2025 (row_id, batch_id, official_date, odds_api_event_id, home_team, away_team, commence_time_utc, bookmaker_key, market_key, player_name, outcome_name, line_point, price_american, snapshot_timestamp, raw_json, created_at)
      VALUES (${rowId}, 'permanent_daily_backfill_v0_2_0', ${r.official_date}, ${r.source_event_id}, ${r.source_home_team}, ${r.source_away_team}, ${r.source_commence_time_utc}, ${r.bookmaker_key}, ${r.market_key}, NULL, ${r.outcome_name}, ${r.point}, ${r.price_american}, ${r.market_last_update}, ${r.raw_json}, now())
      ON CONFLICT (row_id) DO NOTHING`.catch(() => {});
    copied++;
  }
  return { copied, checked: rows.length };
}

function preparedSelectColumns() {
  return `prepared_row_id, source_key, source_row_id, source_event_id, projection_id, player_name, player_name_normalized, resolved_player_id, resolved_mlb_player_id,
      player_match_status, player_match_confidence, team, opponent, team_full_name, opponent_full_name, canonical_prop_key, source_prop_name, line_value,
      official_game_pk, official_game_time_utc, official_date, source_start_time, source_time_status, start_time_confidence, matchup_status, matchup_confidence,
      source_pickable, pickable_safe, prep_status, block_reason`;
}
async function loadPreparedRows(pgClient, boardWindowDates) {
  return pgClient.unsafe(`SELECT ${preparedSelectColumns()}
    FROM score.board_prepared_current
    WHERE pickable_safe = 1 AND matchup_status = 'calendar_matched' AND player_match_status = 'matched'
      AND official_game_pk IS NOT NULL AND official_game_time_utc IS NOT NULL
      AND official_date::text IN (${boardWindowDates.map((_, i) => `$${i + 1}`).join(",")})
      AND official_game_time_utc > $${boardWindowDates.length + 1}
    ORDER BY official_game_time_utc, official_game_pk, source_key, canonical_prop_key, player_name
    LIMIT ${MAX_PREPARED_ROWS}`, [...boardWindowDates, new Date().toISOString()]);
}
async function loadCalendarGames(pgClient, gamePks) {
  if (!gamePks.length) return [];
  const out = [];
  const chunkSize = 200;
  for (let i = 0; i < gamePks.length; i += chunkSize) {
    const chunk = gamePks.slice(i, i + chunkSize);
    const rows = await pgClient.unsafe(`SELECT game_pk, official_date::text AS official_date, game_time_utc, status_code, abstract_game_state, detailed_state, is_scheduled, is_pregame, is_live, is_final, home_team_id, away_team_id, home_team_name, away_team_name, doubleheader, game_number, venue_name FROM calendar.game_calendar WHERE game_pk IN (${chunk.map((_, i) => `${i + 1}`).join(",")})`, chunk);
    out.push(...rows);
  }
  return out;
}
async function loadTeamAliases(pgClient) {
  const rows = [];
  try { rows.push(...await pgClient`SELECT team_id, mlb_team_id, abbreviation, full_name, nickname, location_name, short_name FROM ref.teams WHERE active=1`); } catch (_) {}
  const aliases = [];
  try { aliases.push(...await pgClient`SELECT team_id, mlb_team_id, alias_normalized FROM ref.team_aliases WHERE active=1`); } catch (_) {}
  const map = new Map();
  for (const r of rows) {
    const id = Number(r.mlb_team_id);
    for (const v of [r.abbreviation, r.full_name, r.nickname, r.location_name, r.short_name]) { const n = normalizeName(v); if (n && Number.isFinite(id)) map.set(n, id); }
  }
  for (const r of aliases) { const id = Number(r.mlb_team_id); const n = normalizeName(r.alias_normalized); if (n && Number.isFinite(id)) map.set(n, id); }
  map.set("oakland athletics", 133); map.set("athletics", 133); map.set("a s", 133);
  map.set("la angels", 108); map.set("los angeles angels", 108);
  map.set("la dodgers", 119); map.set("los angeles dodgers", 119);
  return map;
}
function buildGameMatcher(calendarRows, teamAliasMap) {
  const games = calendarRows.map(g => ({ ...g, game_pk_num: Number(g.game_pk), home_id: Number(g.home_team_id), away_id: Number(g.away_team_id), game_time_ms: parseTime(g.game_time_utc), official_date_text: String(g.official_date || "") }));
  return function matchEvent(event) {
    const sourceHome = event.home_team || event.homeTeam || event.home || "";
    const sourceAway = event.away_team || event.awayTeam || event.away || "";
    const eventTime = parseTime(event.commence_time || event.start_time || event.startTime || event.game_time);
    const homeNorm = normalizeName(sourceHome); const awayNorm = normalizeName(sourceAway);
    const homeId = teamAliasMap.get(homeNorm) || null; const awayId = teamAliasMap.get(awayNorm) || null;
    const candidates = [];
    for (const g of games) {
      const delta = minutesBetween(eventTime, g.game_time_ms);
      if (delta === null || delta > TEAM_MATCH_TOLERANCE_MINUTES) continue;
      const exactIds = homeId && awayId && homeId === g.home_id && awayId === g.away_id;
      const reversedIds = homeId && awayId && homeId === g.away_id && awayId === g.home_id;
      const exactNames = normalizeName(g.home_team_name) === homeNorm && normalizeName(g.away_team_name) === awayNorm;
      const reversedNames = normalizeName(g.home_team_name) === awayNorm && normalizeName(g.away_team_name) === homeNorm;
      if (exactIds || exactNames) candidates.push({ game: g, reason: exactIds ? "team_ids_time_match" : "team_names_time_match", confidence: "high", reversed: false, delta_minutes: delta });
      else if (reversedIds || reversedNames) candidates.push({ game: g, reason: reversedIds ? "reversed_team_ids_time_match" : "reversed_team_names_time_match", confidence: "medium", reversed: true, delta_minutes: delta });
    }
    if (candidates.length === 1) return { status: "mapped", game_pk: candidates[0].game.game_pk_num, official_date: candidates[0].game.official_date_text, confidence: candidates[0].confidence, reason: candidates[0].reason, candidate_count: 1, reversed: candidates[0].reversed };
    if (candidates.length > 1) return { status: "ambiguous", game_pk: null, official_date: null, confidence: "none", reason: "multiple_calendar_candidates", candidate_count: candidates.length };
    return { status: "unmapped", game_pk: null, official_date: null, confidence: "none", reason: "no_calendar_candidate", candidate_count: 0 };
  };
}
async function writeIssue(pgClient, batchId, slateWindowKey, officialDate, severity, type, gamePk, preparedRowId, sourceKey, reason, details) {
  await pgClient`INSERT INTO market.context_probe_issues (issue_id, batch_id, slate_window_key, official_date, severity, issue_type, game_pk, prepared_row_id, source_key, reason, details_json, created_at)
    VALUES (${rid("mcp_issue")}, ${batchId}, ${slateWindowKey}, ${officialDate || null}, ${severity}, ${type}, ${gamePk || null}, ${preparedRowId || null}, ${sourceKey || null}, ${safeText(reason, 900)}, ${safeJson(details, 6000)}, now())`;
}
async function fetchOddsApiGameOdds(env, apiKey) {
  if (!apiKey) return { ok: false, missing_key: true, events: [], external_calls: 0, error: "ODDS_API_KEY missing" };
  const base = String(env.ODDS_API_BASE_URL || "https://api.the-odds-api.com/v4").replace(/\/+$/, "");
  const url = new URL(`${base}/sports/baseball_mlb/odds`);
  url.searchParams.set("apiKey", apiKey);
  const bookmakerList = String(env.ODDS_API_BOOKMAKERS || "draftkings,fanduel,betmgm,caesars,espnbet,fanatics,bet365").replace(/\s+/g, "");
  if (bookmakerList) url.searchParams.set("bookmakers", bookmakerList); else url.searchParams.set("regions", String(env.ODDS_API_REGIONS || "us"));
  url.searchParams.set("markets", FEATURED_GAME_MARKET_KEYS.join(","));
  url.searchParams.set("oddsFormat", "american"); url.searchParams.set("dateFormat", "iso");
  const started = nowUtc();
  try {
    const resp = await fetchWithTimeout(url.toString(), { method: "GET", headers: { "accept": "application/json", "user-agent": "AlphaDog-v2 Teams Game Odds" } }, fetchTimeoutMs(env));
    const text = await resp.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (err) { return { ok: false, external_calls: 1, http_status: resp.status, parse_error: safeText(err.message), response_preview: safeText(text, 700), events: [], error: "odds_api_json_parse_failed", started_at: started, finished_at: nowUtc() }; }
    if (!resp.ok) return { ok: false, external_calls: 1, http_status: resp.status, events: [], error: "odds_api_http_error", response_preview: safeText(text, 900), started_at: started, finished_at: nowUtc() };
    return { ok: true, external_calls: 1, http_status: resp.status, events: Array.isArray(parsed) ? parsed : [], bookmaker_targets: bookmakerList, endpoint_scope: "strong_sportsbook_reference_game_odds", raw_response_length: text.length, raw_response_preview: safeText(text, 1500), request_url_no_key: url.toString().replace(/apiKey=[^&]+/, "apiKey=REDACTED"), started_at: started, finished_at: nowUtc() };
  } catch (err) {
    return { ok: false, external_calls: 1, events: [], error: "odds_api_fetch_exception", message: safeText(err && err.message ? err.message : err), started_at: started, finished_at: nowUtc() };
  }
}
function outcomeSide(marketKey, outcomeName, point, description, homeTeam, awayTeam) {
  const n = normalizeName(outcomeName);
  const teamRole = sideTeamRole(description || outcomeName, homeTeam, awayTeam);
  if (marketKey === "team_totals" || marketKey === "alternate_team_totals") {
    const ou = n === "over" || n === "under" ? n : "team_total";
    return teamRole ? `${teamRole}_team_total_${ou}` : `team_total_${ou}`;
  }
  if (n === "over") return marketKey === "alternate_totals" ? "alternate_over" : "over";
  if (n === "under") return marketKey === "alternate_totals" ? "alternate_under" : "under";
  if (marketKey === "spreads" || marketKey === "alternate_spreads") return point !== undefined && point !== null && Number(point) < 0 ? (marketKey === "alternate_spreads" ? "alternate_favorite_spread" : "favorite_spread") : (marketKey === "alternate_spreads" ? "alternate_underdog_spread" : "underdog_spread");
  if (marketKey === "h2h") return "moneyline";
  return normalizeName(description) || n || null;
}
async function writeOddsApiEvidence(pgClient, batchId, slateWindowKey, oddsEvents, matchEvent) {
  let eventRows = 0, mappedEvents = 0, gameOddsRows = 0;
  const normalizedRows = []; const mappedGameSet = new Set(); const mappedEventsList = [];
  const eventMapRows = []; const gameOddsRowsArr = [];
  for (const ev of (Array.isArray(oddsEvents) ? oddsEvents : [])) {
    const mapping = matchEvent(ev || {});
    eventRows += 1;
    eventMapRows.push({ probe_row_id: rid("mcp_event"), batch_id: batchId, slate_window_key: slateWindowKey, official_date: mapping.official_date, game_pk: mapping.game_pk, source_key: ODDS_API_SOURCE_KEY,
      source_event_id: ev.id || null, source_commence_time_utc: ev.commence_time || null, source_home_team: ev.home_team || null, source_away_team: ev.away_team || null,
      mapping_status: mapping.status, mapping_confidence: mapping.confidence, mapping_reason: mapping.reason, candidate_count: mapping.candidate_count,
      raw_json: safeJson({ id: ev.id, commence_time: ev.commence_time, home_team: ev.home_team, away_team: ev.away_team }, 3000) });
    if (mapping.status === "mapped") { mappedEvents += 1; mappedGameSet.add(String(mapping.game_pk)); mappedEventsList.push({ ev, mapping }); } else { continue; }
    const bookmakers = Array.isArray(ev.bookmakers) ? ev.bookmakers : [];
    for (const book of bookmakers) {
      const markets = Array.isArray(book.markets) ? book.markets : [];
      for (const market of markets) {
        const key = String(market.key || "");
        if (!FEATURED_GAME_MARKET_KEYS.includes(key)) continue;
        const outcomes = Array.isArray(market.outcomes) ? market.outcomes : [];
        for (const out of outcomes) {
          const normalizedRow = { official_date: mapping.official_date, game_pk: mapping.game_pk, source_event_id: ev.id || null, source_commence_time_utc: ev.commence_time || null, source_home_team: ev.home_team || null, source_away_team: ev.away_team || null, bookmaker_key: book.key || null, bookmaker_title: book.title || null, market_key: key, market_last_update: market.last_update || null, outcome_name: out.name || null, outcome_side: outcomeSide(key, out.name, out.point, out.description, ev.home_team, ev.away_team), price_american: Number.isFinite(Number(out.price)) ? Number(out.price) : null, point: Number.isFinite(Number(out.point)) ? Number(out.point) : null, mapping_status: mapping.status, mapping_confidence: mapping.confidence };
          normalizedRows.push(normalizedRow);
          gameOddsRowsArr.push({ probe_row_id: rid("mcp_game_odds"), batch_id: batchId, slate_window_key: slateWindowKey, official_date: mapping.official_date, game_pk: mapping.game_pk, source_key: ODDS_API_SOURCE_KEY, source_event_id: ev.id || null, source_commence_time_utc: ev.commence_time || null, source_home_team: ev.home_team || null, source_away_team: ev.away_team || null, bookmaker_key: book.key || null, bookmaker_title: book.title || null, market_key: key, market_last_update: market.last_update || null, outcome_name: out.description ? `${out.description} ${out.name || ""}`.trim() : (out.name || null), outcome_side: normalizedRow.outcome_side, price_american: normalizedRow.price_american, point: normalizedRow.point, mapping_status: mapping.status, mapping_confidence: mapping.confidence, raw_json: safeJson({ endpoint_scope: "featured_bulk_odds", bookmaker_key: book.key, bookmaker_title: book.title, market_key: key, last_update: market.last_update, outcome: out }, 3000) });
          gameOddsRows += 1;
        }
      }
    }
  }
  const cols1 = ["probe_row_id", "batch_id", "slate_window_key", "official_date", "game_pk", "source_key", "source_event_id", "source_commence_time_utc", "source_home_team", "source_away_team", "mapping_status", "mapping_confidence", "mapping_reason", "candidate_count", "raw_json"];
  const cols2 = ["probe_row_id", "batch_id", "slate_window_key", "official_date", "game_pk", "source_key", "source_event_id", "source_commence_time_utc", "source_home_team", "source_away_team", "bookmaker_key", "bookmaker_title", "market_key", "market_last_update", "outcome_name", "outcome_side", "price_american", "point", "mapping_status", "mapping_confidence", "raw_json"];
  const CHUNK = 300;
  for (let i = 0; i < eventMapRows.length; i += CHUNK) await pgClient`INSERT INTO market.context_probe_event_map ${pgClient(eventMapRows.slice(i, i + CHUNK), ...cols1)}`;
  for (let i = 0; i < gameOddsRowsArr.length; i += CHUNK) await pgClient`INSERT INTO market.context_probe_game_odds ${pgClient(gameOddsRowsArr.slice(i, i + CHUNK), ...cols2)}`;
  return { eventRows, mappedEvents, gameOddsRows, mappedGameSet, normalizedRows, mappedEventsList, batched_evidence_writes: true };
}
function numeric(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function round(value, places = 3) { const n = Number(value); if (!Number.isFinite(n)) return null; const m = Math.pow(10, places); return Math.round(n * m) / m; }
function median(values) { const nums = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b); if (!nums.length) return null; const mid = Math.floor(nums.length / 2); return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2; }
function bestAmerican(values) { const nums = values.map(Number).filter(Number.isFinite); if (!nums.length) return null; return Math.max(...nums); }
function americanToImplied(price) { const p = Number(price); if (!Number.isFinite(p) || p === 0) return null; return p > 0 ? 100 / (p + 100) : Math.abs(p) / (Math.abs(p) + 100); }
function devigTwoWay(homePrice, awayPrice) { const hp = americanToImplied(homePrice); const ap = americanToImplied(awayPrice); if (hp === null || ap === null || hp + ap <= 0) return { home: null, away: null }; return { home: hp / (hp + ap), away: ap / (hp + ap) }; }
function derivedImpliedRuns(totalLine, homeMl, awayMl) {
  const total = Number(totalLine);
  if (!Number.isFinite(total) || total <= 0) return { home: null, away: null, confidence: "NONE" };
  const p = devigTwoWay(homeMl, awayMl);
  if (p.home === null || p.away === null) return { home: round(total / 2, 3), away: round(total / 2, 3), confidence: "LOW_TOTAL_ONLY" };
  const edge = Math.max(-0.32, Math.min(0.32, p.home - 0.5));
  const adjustment = edge * total * 0.42;
  return { home: round((total / 2) + adjustment, 3), away: round((total / 2) - adjustment, 3), confidence: "DERIVED_MEDIUM_HEURISTIC" };
}
function freshnessFromUpdates(updates, nowMs, staleMinutes) {
  const times = updates.map(parseTime).filter(t => t !== null).sort((a, b) => a - b);
  if (!times.length) return { oldest: null, newest: null, status: "UNKNOWN_NO_LAST_UPDATE" };
  const newest = times[times.length - 1]; const oldest = times[0];
  const ageMin = (nowMs - newest) / 60000;
  return { oldest: new Date(oldest).toISOString(), newest: new Date(newest).toISOString(), status: ageMin > staleMinutes ? "MARKET_STALE" : "MARKET_FRESH" };
}
function sideTeamRole(outcomeName, homeTeam, awayTeam) {
  const n = normalizeName(outcomeName);
  if (n && n === normalizeName(homeTeam)) return "home";
  if (n && n === normalizeName(awayTeam)) return "away";
  return null;
}
function compactPriceList(rows) { return rows.map(r => ({ book: r.bookmaker_key, price: r.price_american, point: r.point, side: r.outcome_side })).slice(0, 24); }
function expandedGameTeamMarketKeys(env) {
  const raw = String(env.ODDS_API_EXPANDED_GAME_TEAM_MARKETS || EXPANDED_GAME_TEAM_MARKET_KEYS.join(","));
  const requested = raw.split(",").map(v => normalizeProp(v)).filter(Boolean);
  const allowed = new Set(["team_totals", "alternate_spreads", "alternate_totals", "alternate_team_totals"]);
  return requested.filter(k => allowed.has(k) && !k.includes("batter") && !k.includes("pitcher") && !k.includes("player"));
}
async function fetchOddsApiEventMarket(env, eventId, marketKey, bookmakerList, apiKey) {
  const base = String(env.ODDS_API_BASE_URL || "https://api.the-odds-api.com/v4").replace(/\/+$/, "");
  const url = new URL(`${base}/sports/baseball_mlb/events/${encodeURIComponent(eventId)}/odds`);
  url.searchParams.set("apiKey", apiKey || "");
  if (bookmakerList) url.searchParams.set("bookmakers", bookmakerList); else url.searchParams.set("regions", String(env.ODDS_API_REGIONS || "us"));
  url.searchParams.set("markets", marketKey); url.searchParams.set("oddsFormat", "american"); url.searchParams.set("dateFormat", "iso");
  const started = nowUtc();
  try {
    const resp = await fetchWithTimeout(url.toString(), { method: "GET", headers: { "accept": "application/json", "user-agent": "AlphaDog-v2 Teams Game Odds Expansion Probe" } }, fetchTimeoutMs(env));
    const text = await resp.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (err) { return { ok: false, external_calls: 1, http_status: resp.status, market_key: marketKey, event_id: eventId, fetch_status: "JSON_PARSE_FAILED", error_code: "odds_api_event_json_parse_failed", error_message: safeText(err.message), response_preview: safeText(text, 900), started_at: started, finished_at: nowUtc() }; }
    if (!resp.ok) return { ok: false, external_calls: 1, http_status: resp.status, market_key: marketKey, event_id: eventId, fetch_status: "HTTP_ERROR", error_code: "odds_api_event_http_error", error_message: safeText(parsed && (parsed.message || parsed.error || JSON.stringify(parsed)), 900), response_preview: safeJson(parsed, 1800), started_at: started, finished_at: nowUtc() };
    return { ok: true, external_calls: 1, http_status: resp.status, market_key: marketKey, event_id: eventId, fetch_status: "FETCH_OK", event: parsed || {}, started_at: started, finished_at: nowUtc() };
  } catch (err) {
    return { ok: false, external_calls: 1, http_status: null, market_key: marketKey, event_id: eventId, fetch_status: "FETCH_EXCEPTION", error_code: "odds_api_event_fetch_exception", error_message: safeText(err && err.message ? err.message : err), started_at: started, finished_at: nowUtc() };
  }
}
async function probeExpandedGameTeamMarkets() {
  // Explicitly disabled by design fairness decision (kept from prior version) - see runMarketSourceProbe.
  return { externalCalls: 0, expansionRows: 0, expandedGameOddsRows: 0, normalizedRows: [], marketKeys: [], byMarket: {}, expansionFailures: [], skipped: true, skipped_reason: "expanded_game_team_markets_disabled_by_design_fairness_decision", batched_evidence_writes: true };
}
async function writeNormalizedGameMarketMining(pgClient, batchId, slateWindowKey, oddsRows, oddsEvents, matchEvent, bookmakerTargets) {
  const targetBooks = String(bookmakerTargets || "").split(",").map(s => s.trim()).filter(Boolean);
  const nowMs = Date.now();
  const staleMinutes = 30;
  const byGame = new Map();
  for (const ev of oddsEvents || []) {
    const mapping = matchEvent(ev || {});
    if (mapping.status !== "mapped") continue;
    const key = String(mapping.game_pk);
    if (!byGame.has(key)) byGame.set(key, { event: ev, mapping, rows: [] });
  }
  for (const r of oddsRows || []) { const key = String(r.game_pk); if (!byGame.has(key)) continue; byGame.get(key).rows.push(r); }

  const statusRows = []; const summaryRows = [];
  for (const [, g] of byGame) {
    const ev = g.event; const rows = g.rows;
    const availableBooks = [...new Set(rows.map(r => r.bookmaker_key).filter(Boolean))];
    const bookLoop = targetBooks.length ? targetBooks : availableBooks;
    for (const book of bookLoop) {
      const title = rows.find(r => r.bookmaker_key === book)?.bookmaker_title || null;
      for (const market of ALL_GAME_TEAM_MARKET_KEYS) {
        const marketRows = rows.filter(r => r.bookmaker_key === book && r.market_key === market);
        const updates = marketRows.map(r => r.market_last_update).filter(Boolean);
        const fresh = freshnessFromUpdates(updates, nowMs, staleMinutes);
        const status = marketRows.length ? "MARKET_PRESENT" : "MARKET_MISSING";
        statusRows.push({ status_row_id: rid("mcp_bm_status"), batch_id: batchId, slate_window_key: slateWindowKey, official_date: g.mapping.official_date, game_pk: g.mapping.game_pk, source_key: ODDS_API_SOURCE_KEY, source_event_id: ev.id || null, bookmaker_key: book, bookmaker_title: title, market_key: market, market_status: status, outcome_rows: marketRows.length, point_values_json: safeJson([...new Set(marketRows.map(r => r.point).filter(v => v !== null && v !== undefined))], 1200), price_values_json: safeJson(compactPriceList(marketRows), 2200), market_last_update: fresh.newest, freshness_status: fresh.status, missing_reason: marketRows.length ? null : "book_market_not_returned_by_odds_api_payload", raw_json: safeJson({ source_event_id: ev.id, bookmaker_key: book, market_key: market, outcome_rows: marketRows.length }, 2200) });
      }
    }
    const h2h = rows.filter(r => r.market_key === "h2h"); const spreads = rows.filter(r => r.market_key === "spreads"); const totals = rows.filter(r => r.market_key === "totals");
    const teamTotals = rows.filter(r => r.market_key === "team_totals"); const alternateSpreads = rows.filter(r => r.market_key === "alternate_spreads"); const alternateTotals = rows.filter(r => r.market_key === "alternate_totals");
    const homeMlRows = h2h.filter(r => sideTeamRole(r.outcome_name, ev.home_team, ev.away_team) === "home");
    const awayMlRows = h2h.filter(r => sideTeamRole(r.outcome_name, ev.home_team, ev.away_team) === "away");
    const homeSpreadRows = spreads.filter(r => sideTeamRole(r.outcome_name, ev.home_team, ev.away_team) === "home");
    const awaySpreadRows = spreads.filter(r => sideTeamRole(r.outcome_name, ev.home_team, ev.away_team) === "away");
    const overRows = totals.filter(r => r.outcome_side === "over"); const underRows = totals.filter(r => r.outcome_side === "under");
    const allUpdates = rows.map(r => r.market_last_update).filter(Boolean);
    const fresh = freshnessFromUpdates(allUpdates, nowMs, staleMinutes);
    const homeMlConsensus = round(median(homeMlRows.map(r => r.price_american)), 1);
    const awayMlConsensus = round(median(awayMlRows.map(r => r.price_american)), 1);
    const totalConsensus = round(median(totals.map(r => r.point)), 1);
    const implied = derivedImpliedRuns(totalConsensus, homeMlConsensus, awayMlConsensus);
    const warnings = [];
    const bookCoverageGrade = availableBooks.length >= Math.max(1, targetBooks.length) ? "FULL_TARGET_BOOK_COVERAGE" : (availableBooks.length >= 5 ? "STRONG_PARTIAL_BOOK_COVERAGE" : (availableBooks.length >= 3 ? "PARTIAL_BOOK_COVERAGE" : "BOOK_COVERAGE_THIN"));
    if (!h2h.length) warnings.push("MISSING_MONEYLINE"); if (!spreads.length) warnings.push("MISSING_RUNLINE"); if (!totals.length) warnings.push("MISSING_TOTAL"); if (fresh.status === "MARKET_STALE") warnings.push("MARKET_STALE");
    const homeMlBest = bestAmerican(homeMlRows.map(r => r.price_american)); const awayMlBest = bestAmerican(awayMlRows.map(r => r.price_american));
    const favHome = homeMlConsensus !== null && awayMlConsensus !== null ? homeMlConsensus < awayMlConsensus : null;
    const favTeam = favHome === null ? null : (favHome ? ev.home_team : ev.away_team); const dogTeam = favHome === null ? null : (favHome ? ev.away_team : ev.home_team);
    const favPrice = favHome === null ? null : (favHome ? homeMlConsensus : awayMlConsensus); const dogPrice = favHome === null ? null : (favHome ? awayMlConsensus : homeMlConsensus);
    const totalPoints = totals.map(r => Number(r.point)).filter(Number.isFinite);
    const totalMin = totalPoints.length ? round(Math.min(...totalPoints), 1) : null; const totalMax = totalPoints.length ? round(Math.max(...totalPoints), 1) : null;
    const homeRunlinePoint = round(median(homeSpreadRows.map(r => r.point)), 1), awayRunlinePoint = round(median(awaySpreadRows.map(r => r.point)), 1);
    const homeRunlineConsensus = round(median(homeSpreadRows.map(r => r.price_american)), 1), awayRunlineConsensus = round(median(awaySpreadRows.map(r => r.price_american)), 1);
    const homeRunlineBest = bestAmerican(homeSpreadRows.map(r => r.price_american)), awayRunlineBest = bestAmerican(awaySpreadRows.map(r => r.price_american));
    const overConsensus = round(median(overRows.map(r => r.price_american)), 1), underConsensus = round(median(underRows.map(r => r.price_american)), 1);
    const overBest = bestAmerican(overRows.map(r => r.price_american)), underBest = bestAmerican(underRows.map(r => r.price_american));
    const summary = { source_scope: "odds_api_strong_sportsbooks_game_team_markets_only", game_pk: g.mapping.game_pk, source_event_id: ev.id || null, home_team: ev.home_team || null, away_team: ev.away_team || null, books_available: availableBooks, books_targeted: targetBooks,
      moneyline: { home_consensus: homeMlConsensus, away_consensus: awayMlConsensus, home_best: homeMlBest, away_best: awayMlBest, favorite_team: favTeam, underdog_team: dogTeam },
      runline: { home_point: homeRunlinePoint, away_point: awayRunlinePoint, home_consensus_price: homeRunlineConsensus, away_consensus_price: awayRunlineConsensus, home_best_price: homeRunlineBest, away_best_price: awayRunlineBest },
      total: { consensus_line: totalConsensus, over_consensus_price: overConsensus, under_consensus_price: underConsensus, over_best_price: overBest, under_best_price: underBest, min_line: totalMin, max_line: totalMax },
      implied_runs: { home: implied.home, away: implied.away, method: "DERIVED_FROM_CONSENSUS_TOTAL_AND_DEVIG_CONSENSUS_MONEYLINE_HEURISTIC_NOT_DIRECT_TEAM_TOTAL", confidence: implied.confidence },
      expanded_game_team_markets: { team_totals: { rows: teamTotals.length, books: [...new Set(teamTotals.map(r => r.bookmaker_key).filter(Boolean))].length }, alternate_spreads: { rows: alternateSpreads.length, books: [...new Set(alternateSpreads.map(r => r.bookmaker_key).filter(Boolean))].length }, alternate_totals: { rows: alternateTotals.length, books: [...new Set(alternateTotals.map(r => r.bookmaker_key).filter(Boolean))].length } },
      freshness: fresh, warnings };
    summaryRows.push({ summary_row_id: rid("mcp_gm_summary"), batch_id: batchId, slate_window_key: slateWindowKey, official_date: g.mapping.official_date, game_pk: g.mapping.game_pk, source_key: ODDS_API_SOURCE_KEY, source_event_id: ev.id || null, source_commence_time_utc: ev.commence_time || null, home_team: ev.home_team || null, away_team: ev.away_team || null,
      book_target_count: targetBooks.length, book_available_count: availableBooks.length, book_coverage_grade: bookCoverageGrade, freshness_status: fresh.status, oldest_market_update: fresh.oldest, newest_market_update: fresh.newest,
      h2h_book_count: new Set(h2h.map(r => r.bookmaker_key)).size, home_ml_consensus: homeMlConsensus, away_ml_consensus: awayMlConsensus, home_ml_best: homeMlBest, away_ml_best: awayMlBest,
      moneyline_favorite_team: favTeam, moneyline_favorite_price: favPrice, moneyline_underdog_team: dogTeam, moneyline_underdog_price: dogPrice,
      runline_book_count: new Set(spreads.map(r => r.bookmaker_key)).size, home_runline_point: homeRunlinePoint, home_runline_consensus_price: homeRunlineConsensus, home_runline_best_price: homeRunlineBest,
      away_runline_point: awayRunlinePoint, away_runline_consensus_price: awayRunlineConsensus, away_runline_best_price: awayRunlineBest,
      total_book_count: new Set(totals.map(r => r.bookmaker_key)).size, total_consensus_line: totalConsensus, over_consensus_price: overConsensus, under_consensus_price: underConsensus,
      over_best_price: overBest, under_best_price: underBest, total_line_min: totalMin, total_line_max: totalMax, total_line_range: (totalMin !== null && totalMax !== null ? round(totalMax - totalMin, 1) : null),
      derived_home_implied_runs: implied.home, derived_away_implied_runs: implied.away, implied_runs_method: summary.implied_runs.method, implied_runs_confidence: implied.confidence,
      parse_status: warnings.length ? "PARSED_WITH_WARNINGS" : "PARSED_OK", warning_flags: safeJson(warnings, 1200), summary_json: safeJson(summary, 6500) });
  }
  const statusCols = ["status_row_id", "batch_id", "slate_window_key", "official_date", "game_pk", "source_key", "source_event_id", "bookmaker_key", "bookmaker_title", "market_key", "market_status", "outcome_rows", "point_values_json", "price_values_json", "market_last_update", "freshness_status", "missing_reason", "raw_json"];
  const summaryCols = ["summary_row_id", "batch_id", "slate_window_key", "official_date", "game_pk", "source_key", "source_event_id", "source_commence_time_utc", "home_team", "away_team", "book_target_count", "book_available_count", "book_coverage_grade", "freshness_status", "oldest_market_update", "newest_market_update", "h2h_book_count", "home_ml_consensus", "away_ml_consensus", "home_ml_best", "away_ml_best", "moneyline_favorite_team", "moneyline_favorite_price", "moneyline_underdog_team", "moneyline_underdog_price", "runline_book_count", "home_runline_point", "home_runline_consensus_price", "home_runline_best_price", "away_runline_point", "away_runline_consensus_price", "away_runline_best_price", "total_book_count", "total_consensus_line", "over_consensus_price", "under_consensus_price", "over_best_price", "under_best_price", "total_line_min", "total_line_max", "total_line_range", "derived_home_implied_runs", "derived_away_implied_runs", "implied_runs_method", "implied_runs_confidence", "parse_status", "warning_flags", "summary_json"];
  const CHUNK = 150;
  for (let i = 0; i < statusRows.length; i += CHUNK) await pgClient`INSERT INTO market.context_probe_book_market_status ${pgClient(statusRows.slice(i, i + CHUNK), ...statusCols)}`;
  for (let i = 0; i < summaryRows.length; i += CHUNK) await pgClient`INSERT INTO market.context_probe_game_market_summary ${pgClient(summaryRows.slice(i, i + CHUNK), ...summaryCols)}`;
  return { statusRows: statusRows.length, summaryRows: summaryRows.length, batched_evidence_writes: true };
}
async function writeCoverage(pgClient, batchId, slateWindowKey, preparedRows, oddsMappedGameSet) {
  let present = 0, missing = 0;
  const coverageRows = [];
  for (const p of preparedRows) {
    const hasGame = oddsMappedGameSet.has(String(p.official_game_pk));
    const gameStatus = hasGame ? "SPORTSBOOK_GAME_MARKET_CONTEXT_PRESENT" : "MARKET_CONTEXT_MISSING";
    const propStatus = "PLAYER_PROP_REFERENCE_NOT_PROBED_GAME_MARKET_SCOPE";
    const status = hasGame ? "PARTIAL_MARKET_CONTEXT" : "MARKET_CONTEXT_MISSING";
    const grade = hasGame ? "GAME_ONLY_SPORTSBOOK_REFERENCE" : "NONE";
    if (hasGame) present += 1; else missing += 1;
    coverageRows.push({ coverage_row_id: rid("mcp_cov"), batch_id: batchId, slate_window_key: slateWindowKey, official_date: p.official_date, prepared_row_id: p.prepared_row_id, source_key: p.source_key,
      game_pk: Number(p.official_game_pk), resolved_mlb_player_id: Number(p.resolved_mlb_player_id), canonical_prop_key: p.canonical_prop_key,
      board_line_value: Number.isFinite(Number(p.line_value)) ? Number(p.line_value) : null, game_market_status: gameStatus, player_prop_market_status: propStatus, market_context_status: status, coverage_grade: grade,
      details_json: safeJson({ odds_api_sportsbook_game_context: hasGame, board_sources_used_as_market_reference: false, sleeper_used: false, prizepicks_used: false, player_prop_reference_probe: "not_in_teams_worker_scope", no_scoring: true }, 2200) });
  }
  const cols = ["coverage_row_id", "batch_id", "slate_window_key", "official_date", "prepared_row_id", "source_key", "game_pk", "resolved_mlb_player_id", "canonical_prop_key", "board_line_value", "game_market_status", "player_prop_market_status", "market_context_status", "coverage_grade", "details_json"];
  const CHUNK = 300;
  for (let i = 0; i < coverageRows.length; i += CHUNK) await pgClient`INSERT INTO market.context_probe_coverage ${pgClient(coverageRows.slice(i, i + CHUNK), ...cols)}`;
  return { game_context_present: present, missing, rows: preparedRows.length, batched_evidence_writes: true };
}

async function runMarketSourceProbe(env, input = {}) {
  const startedMs = Date.now();
  const deadlineMs = startedMs + marketTeamsWorkerBudgetMs(env);
  const requestId = input.request_id || null;
  const runId = input.run_id || null;
  const pgClient = pg(env);
  try {
    const nowIsoForWindow = new Date().toISOString();
    const realBoardDateRowsPrelim = await pgClient`SELECT DISTINCT official_date::text AS official_date FROM score.board_prepared_current WHERE pickable_safe = 1 AND official_game_time_utc IS NOT NULL AND official_game_time_utc > ${nowIsoForWindow}`;
    const realBoardDatesPrelim = realBoardDateRowsPrelim.map(r => r.official_date).filter(Boolean);
    const boardWindowDates = [...new Set([...realBoardDatesPrelim, ptDate(0), ptDate(1)])].sort();
    const today = boardWindowDates[0]; const tomorrow = boardWindowDates[boardWindowDates.length - 1];
    const slateWindowKey = `${today}_${tomorrow}`;
    const batchId = rid("market_context_probe_batch");
    let externalCalls = 0, warningCount = 0, blockerCount = 0;
    const retention = { today, tomorrow, slate_window_key: slateWindowKey, board_window_dates: boardWindowDates };
    const resolvedOddsApiKey = await resolveOddsApiKey(env, pgClient);
    const hasOddsApiKey = Boolean(resolvedOddsApiKey);

    if (!env.HYPERDRIVE) {
      return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, run_id: runId, status: "BLOCKED_MISSING_DB_BINDINGS", certification: "MARKET_TEAMS_GAME_ODDS_BLOCKED_MISSING_DB_BINDINGS", missing_db_bindings: ["HYPERDRIVE"], rows_read: 0, rows_written: 0, external_calls_performed: 0, retention, timestamp_utc: nowUtc() };
    }

    const permanentMarketBackfill = await permanentlyRecordConfirmedMarketOdds(pgClient).catch(() => ({ copied: 0, checked: 0, error: true }));
    const prune = await pruneProbeWindow(pgClient, boardWindowDates, slateWindowKey);
    const preparedRows = await loadPreparedRows(pgClient, boardWindowDates);
    const gamePks = [...new Set(preparedRows.map(r => Number(r.official_game_pk)).filter(Number.isFinite))];
    const playerIds = [...new Set(preparedRows.map(r => Number(r.resolved_mlb_player_id)).filter(Number.isFinite))];
    const propKeys = [...new Set(preparedRows.map(r => String(r.canonical_prop_key || "")).filter(Boolean))];

    await pgClient`INSERT INTO market.context_probe_batches (batch_id, request_id, run_id, worker_name, worker_version, mode, slate_window_key, window_start_date, window_end_date, status, prepared_rows_read, prepared_games_checked, prepared_players_checked, prepared_prop_keys_checked, odds_api_config_present, warning_count, blocker_count, certification_status, certification_grade, output_json, created_at, updated_at)
      VALUES (${batchId}, ${requestId}, ${runId}, ${WORKER_NAME}, ${VERSION}, 'market_teams_game_odds', ${slateWindowKey}, ${today}, ${tomorrow}, 'running_teams_game_odds_started', ${preparedRows.length}, ${gamePks.length}, ${playerIds.length}, ${propKeys.length}, ${hasOddsApiKey ? 1 : 0}, 0, 0, 'MARKET_TEAMS_GAME_ODDS_RUNNING_STARTED', 'RUNNING', ${safeJson({ retention, started_heartbeat: true, request_id: requestId, run_id: runId }, 3000)}, now(), now())`;

    const calendarRows = await loadCalendarGames(pgClient, gamePks);
    const calendarGameSet = new Set(calendarRows.map(r => String(r.game_pk)));
    const missingCalendar = gamePks.filter(g => !calendarGameSet.has(String(g)));

    if (!preparedRows.length) {
      blockerCount += 1;
      await pgClient`UPDATE market.context_probe_batches SET status='blocked_no_prepared_safe_rows', certification_status='MARKET_TEAMS_GAME_ODDS_NO_PREPARED_SAFE_ROWS', certification_grade='BLOCKED', warning_count=${warningCount}, blocker_count=${blockerCount}, output_json=${safeJson({ retention, prune })}, updated_at=now() WHERE batch_id=${batchId}`;
      const blockedOutput = { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, run_id: runId, batch_id: batchId, status: "blocked_no_prepared_safe_rows", certification: "MARKET_TEAMS_GAME_ODDS_NO_PREPARED_SAFE_ROWS", certification_grade: "BLOCKED", rows_read: 0, rows_written: 1, external_calls_performed: 0, retention, prune, elapsed_ms: Date.now() - startedMs, timestamp_utc: nowUtc() };
      return blockedOutput;
    }
    if (missingCalendar.length) { blockerCount += 1; await writeIssue(pgClient, batchId, slateWindowKey, today, "BLOCKER", "CALENDAR_ROWS_MISSING_FOR_PREPARED_GAMES", null, null, "team_db", "Prepared safe rows referenced game_pk values not found in calendar.game_calendar", { missing_game_pks: missingCalendar }); }

    const teamAliases = await loadTeamAliases(pgClient);
    const matcher = buildGameMatcher(calendarRows, teamAliases);
    await pgClient`UPDATE market.context_probe_batches SET status='running_fetching_featured_game_odds', certification_status='MARKET_TEAMS_GAME_ODDS_RUNNING_FETCHING_FEATURED', updated_at=now() WHERE batch_id=${batchId}`;
    const odds = await fetchOddsApiGameOdds(env, resolvedOddsApiKey);
    externalCalls += odds.external_calls || 0;
    await pgClient`UPDATE market.context_probe_batches SET status='running_featured_game_odds_fetched', odds_api_events_seen=${Number((odds && odds.events && odds.events.length) || 0)}, updated_at=now() WHERE batch_id=${batchId}`;
    if (!odds.ok) { if (odds.missing_key) blockerCount += 1; else warningCount += 1; await writeIssue(pgClient, batchId, slateWindowKey, today, odds.missing_key ? "BLOCKER" : "WARNING", odds.missing_key ? "ODDS_API_KEY_MISSING" : "ODDS_API_GAME_ODDS_FETCH_FAILED", null, null, ODDS_API_SOURCE_KEY, odds.error || "Odds API game odds fetch failed", odds); }
    const oddsWrite = odds.ok ? await writeOddsApiEvidence(pgClient, batchId, slateWindowKey, odds.events, matcher) : { eventRows: 0, mappedEvents: 0, gameOddsRows: 0, mappedGameSet: new Set(), normalizedRows: [], mappedEventsList: [] };
    await pgClient`UPDATE market.context_probe_batches SET status='running_featured_game_odds_evidence_written', odds_api_events_seen=${oddsWrite.eventRows || 0}, odds_api_events_mapped=${oddsWrite.mappedEvents || 0}, odds_api_game_odds_rows=${oddsWrite.gameOddsRows || 0}, updated_at=now() WHERE batch_id=${batchId}`;
    if (odds.ok && oddsWrite.mappedEvents === 0) { blockerCount += 1; await writeIssue(pgClient, batchId, slateWindowKey, today, "BLOCKER", "ODDS_API_EVENTS_UNMAPPED", null, null, ODDS_API_SOURCE_KEY, "Odds API returned events but none mapped to prepared game_pk values", { odds_api_events_seen: oddsWrite.eventRows, prepared_game_pks: gamePks }); }
    if (odds.ok && oddsWrite.mappedEvents < gamePks.length) { warningCount += 1; await writeIssue(pgClient, batchId, slateWindowKey, today, "WARNING", "PARTIAL_ODDS_API_GAME_EVENT_MAPPING", null, null, ODDS_API_SOURCE_KEY, "Not every prepared game had mapped Odds API event context", { prepared_games_checked: gamePks.length, odds_api_events_mapped: oddsWrite.mappedEvents }); }

    await pgClient`UPDATE market.context_probe_batches SET status='running_expanded_game_team_markets', odds_api_events_mapped=${oddsWrite.mappedEvents || 0}, odds_api_game_odds_rows=${oddsWrite.gameOddsRows || 0}, updated_at=now() WHERE batch_id=${batchId}`;
    const expanded = await probeExpandedGameTeamMarkets();
    if (expanded.skipped && expanded.skipped_reason && odds.ok && oddsWrite.mappedEvents > 0) { warningCount += 1; await writeIssue(pgClient, batchId, slateWindowKey, today, "WARNING", "ODDS_API_EXPANDED_GAME_TEAM_MARKETS_SKIPPED_FOR_TIME_BUDGET", null, null, ODDS_API_SOURCE_KEY, "Expanded game/team markets were skipped by design (fairness decision)", { skipped_reason: expanded.skipped_reason }); }
    externalCalls += expanded.externalCalls || 0;

    await pgClient`UPDATE market.context_probe_batches SET status='running_writing_normalized_game_market_context', odds_api_game_odds_rows=${(oddsWrite.gameOddsRows || 0) + (expanded.expandedGameOddsRows || 0)}, warning_count=${warningCount}, updated_at=now() WHERE batch_id=${batchId}`;
    const allMarketRows = [...(oddsWrite.normalizedRows || []), ...(expanded.normalizedRows || [])];
    const normalizedMining = odds.ok ? await writeNormalizedGameMarketMining(pgClient, batchId, slateWindowKey, allMarketRows, odds.events || [], matcher, odds.bookmaker_targets || "") : { statusRows: 0, summaryRows: 0 };

    const coverage = await writeCoverage(pgClient, batchId, slateWindowKey, preparedRows, oddsWrite.mappedGameSet);

    const certificationGrade = blockerCount > 0 ? "BLOCKED" : (warningCount > 0 ? "PASS_WITH_WARNINGS" : "PASS");
    const certification = blockerCount > 0 ? "MARKET_TEAMS_GAME_ODDS_BLOCKED_STRUCTURAL" : "MARKET_TEAMS_GAME_ODDS_EVIDENCE_WRITTEN";
    const status = blockerCount > 0 ? "completed_blocked_structural" : "completed_teams_game_odds_evidence_written";
    const rowsWritten = 1 + oddsWrite.eventRows + oddsWrite.gameOddsRows + (expanded.expandedGameOddsRows || 0) + (expanded.expansionRows || 0) + normalizedMining.statusRows + normalizedMining.summaryRows + coverage.rows + warningCount + blockerCount;
    const output = {
      retention, prune, permanent_market_history_backfill: permanentMarketBackfill,
      prepared_rows_read: preparedRows.length, prepared_games_checked: gamePks.length, prepared_players_checked: playerIds.length, prepared_prop_keys_checked: propKeys.length, calendar_games_loaded: calendarRows.length,
      odds_api: { config_present: hasOddsApiKey, fetch_ok: odds.ok, http_status: odds.http_status || null, events_seen: oddsWrite.eventRows, events_mapped: oddsWrite.mappedEvents, game_odds_rows_written: oddsWrite.gameOddsRows, book_market_status_rows_written: normalizedMining.statusRows, game_market_summary_rows_written: normalizedMining.summaryRows, bookmaker_targets: odds.bookmaker_targets || null, source_scope: "strong_sportsbook_reference_game_team_markets_only", featured_markets: FEATURED_GAME_MARKET_KEYS },
      board_sources: { sleeper_used: false, prizepicks_used: false, parlay_api_called: false, purpose: "excluded_from_market_context_reference" },
      coverage, boundaries: { market_current_lines_writes: 0, score_board_prepared_current_mutation: false, scoring: false, ranking: false, final_board: false, matrix_builder: false },
      terminal_safety: { bounded_evidence_writes_v0_2_0: true, worker_budget_ms: marketTeamsWorkerBudgetMs(env), remaining_ms_at_output: remainingBudgetMs(deadlineMs), expanded_markets_skipped: !!expanded.skipped, expanded_skipped_reason: expanded.skipped_reason || null }
    };

    await pgClient`UPDATE market.context_probe_batches SET status=${status}, odds_api_events_seen=${oddsWrite.eventRows}, odds_api_events_mapped=${oddsWrite.mappedEvents}, odds_api_game_odds_rows=${oddsWrite.gameOddsRows + (expanded.expandedGameOddsRows || 0)}, warning_count=${warningCount}, blocker_count=${blockerCount}, certification_status=${certification}, certification_grade=${certificationGrade}, output_json=${safeJson(output, 9000)}, updated_at=now() WHERE batch_id=${batchId}`;

    return { ok: true, data_ok: blockerCount === 0, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, run_id: runId, batch_id: batchId, mode: "market_teams_game_odds", status, certification, certification_grade: certificationGrade,
      rows_read: preparedRows.length, rows_written: rowsWritten, external_calls_performed: externalCalls,
      prepared_rows_read: preparedRows.length, prepared_games_checked: gamePks.length,
      odds_api_events_seen: oddsWrite.eventRows, odds_api_events_mapped: oddsWrite.mappedEvents, odds_api_game_odds_rows: oddsWrite.gameOddsRows + (expanded.expandedGameOddsRows || 0),
      odds_api_book_market_status_rows: normalizedMining.statusRows, odds_api_game_market_summary_rows: normalizedMining.summaryRows,
      warning_count: warningCount, blocker_count: blockerCount, retention, elapsed_ms: Date.now() - startedMs, timestamp_utc: nowUtc() };
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
    if (method === "GET" && path === "/health") return jsonResponse({ ...baseIdentity(env), route: "/health", today: ptDate(0), tomorrow: ptDate(1) });
    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      return jsonResponse({ ...baseIdentity(env), route: "/diagnostic", input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, mode: input.mode || null }, writes_performed: 0, external_calls_performed: 0 });
    }
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        const output = await runMarketSourceProbe(env, input);
        return jsonResponse(output, 200);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, run_id: input.run_id || null, mode: input.mode || PHASE_KEY, status: "failed_market_normalizer_exception", certification: "MARKET_TEAMS_GAME_ODDS_WORKER_EXCEPTION", certification_grade: "FAIL", rows_read: 0, rows_written: 0, external_calls_performed: 0, error: safeText(err && err.stack ? err.stack : (err && err.message ? err.message : err), 2400), timestamp_utc: nowUtc() }, 200);
      }
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
