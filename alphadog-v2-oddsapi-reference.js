const WORKER_NAME = "alphadog-v2-oddsapi-reference";
const VERSION = "alphadog-v2-oddsapi-reference-v0.1.1-batch-writes-memory-coverage";
const JOB_KEY = "oddsapi-reference";
const MODE = "market_hitter_prop_line_context_oddsapi";
const SOURCE_KEY_PREFIX = "odds_api";
const MAX_PREPARED_ROWS = 9000;
const DEFAULT_ODDS_API_BASE_URL = "https://api.the-odds-api.com/v4";
const DEFAULT_BOOKMAKERS = "draftkings,fanduel,betmgm,caesars,espnbet,fanatics,bet365";
const ODDS_MLB_MARKETS = [
  "batter_hits",
  "batter_total_bases",
  "batter_hits_runs_rbis",
  "batter_home_runs",
  "batter_rbis",
  "batter_runs_scored",
  "batter_singles",
  "batter_doubles",
  "batter_triples",
  "batter_walks",
  "batter_strikeouts",
  "batter_stolen_bases"
];
const MARKET_TO_PROP = {
  batter_hits: "hits",
  batter_total_bases: "total_bases",
  batter_hits_runs_rbis: "hits_runs_rbis",
  batter_home_runs: "home_runs",
  batter_rbis: "rbis",
  batter_runs_scored: "runs",
  batter_singles: "singles",
  batter_doubles: "doubles",
  batter_triples: "triples",
  batter_walks: "walks",
  batter_strikeouts: "hitter_strikeouts",
  batter_stolen_bases: "stolen_bases"
};
const PROP_TO_MARKET = Object.fromEntries(Object.entries(MARKET_TO_PROP).map(([k, v]) => [v, k]));
const HITTER_PROP_KEYS = Object.keys(PROP_TO_MARKET);
const REQUIRED_DB_BINDINGS = ["MARKET_DB", "SCORE_DB", "TEAM_DB", "REF_DB", "CONTROL_DB"];
const OPTIONAL_DB_BINDINGS = ["CONFIG_DB"];

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function jsonResponse(body, status = 200) { return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", "access-control-allow-origin":"*", "access-control-allow-headers":"content-type,x-ingest-token,x-admin-token,authorization", "access-control-allow-methods":"GET,POST,OPTIONS" } }); }
function safeText(v, max = 900) { const s = v === undefined || v === null ? "" : String(v); return s.length > max ? s.slice(0, max) + "...TRUNCATED" : s; }
function safeJson(v, max = 7000) { const s = JSON.stringify(v === undefined ? null : v); return s.length > max ? s.slice(0, max) + "...TRUNCATED" : s; }
function sourceHas(env, key) { return !!(env && env[key] !== undefined && env[key] !== null && String(env[key]).trim()); }
function bindingPresence(env, names) { const out = {}; for (const n of names) out[n] = Boolean(env && env[n]); return out; }
async function readJsonSafe(request) { try { return await request.json(); } catch (_) { return {}; } }
async function all(db, sql, ...binds) { const stmt = db.prepare(sql); const res = binds.length ? await stmt.bind(...binds).all() : await stmt.all(); return res.results || []; }
async function first(db, sql, ...binds) { const rows = await all(db, sql, ...binds); return rows[0] || null; }
async function run(db, sql, ...binds) { const stmt = db.prepare(sql); return binds.length ? await stmt.bind(...binds).run() : await stmt.run(); }
async function batchRun(db, sql, bindRows, chunkSize = 75) { let batches = 0, statements = 0; for (let i = 0; i < bindRows.length; i += chunkSize) { const c = bindRows.slice(i, i + chunkSize); await db.batch(c.map(b => db.prepare(sql).bind(...b))); batches++; statements += c.length; } return { batches, statements }; }
function matchedCoverageKey(sourceKey, gamePk, playerId, propKey) { return `${sourceKey}|${String(gamePk)}|${String(playerId)}|${String(propKey)}`; }
function ptDate(offsetDays = 0) { const fmt = new Intl.DateTimeFormat("en-CA", { timeZone:"America/Los_Angeles", year:"numeric", month:"2-digit", day:"2-digit" }); return fmt.format(new Date(Date.now() + offsetDays * 86400000)); }
function normalizeText(v) { return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim(); }
function numberOrNull(v) { if (v === undefined || v === null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
function americanToDecimal(american) { const n = numberOrNull(american); if (n === null || n === 0) return null; return n > 0 ? Number((1 + n / 100).toFixed(4)) : Number((1 + 100 / Math.abs(n)).toFixed(4)); }
function outcomeSide(name) { const n = normalizeText(name); if (n === "over" || n.startsWith("over ")) return "over"; if (n === "under" || n.startsWith("under ")) return "under"; if (n === "yes") return "over"; if (n === "no") return "under"; return null; }
function safeHost(url) { try { return new URL(url).host; } catch (_) { return null; } }
function safeEndpoint(url) { try { const u = new URL(url); u.searchParams.set("apiKey", "REDACTED"); return u.toString(); } catch (_) { return "invalid_url"; } }
function sourceKeyForBook(bookKey) { return `${SOURCE_KEY_PREFIX}_${normalizeText(bookKey || "unknown_book").replace(/ /g, "_")}_hitter_props`; }
function gamePairKey(home, away) { return [normalizeText(home), normalizeText(away)].sort().join("|"); }
function baseIdentity(env, extra = {}) {
  const required = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const optional = bindingPresence(env, OPTIONAL_DB_BINDINGS);
  const missingDb = Object.entries(required).filter(([, ok]) => !ok).map(([name]) => name);
  return {
    ok: true,
    data_ok: missingDb.length === 0,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: missingDb.length ? "BLOCKED_MISSING_DB_BINDINGS" : "READY",
    phase: MODE,
    selected_dummy_slot_audit: {
      selected_worker_slot: WORKER_NAME,
      original_source_status: "dummy_only_alphadog_v2_dummy_workers_v0_1",
      reason_selected: "closest unused Market-family dummy already provisioned for Odds API reference work; separate from existing Parlay hitter worker and existing Teams odds worker"
    },
    docs_source_lock: {
      official_odds_api_behavior: "MLB player props are event-level /events/{eventId}/odds markets; this worker fetches game events first, then event player-prop markets only for prepared today/tomorrow games"
    },
    bindings: { required, optional },
    secrets_present_only: { ODDS_API_KEY: sourceHas(env, "ODDS_API_KEY") },
    boundaries: { hitter_player_props_only:true, odds_api_only:true, no_parlay_api_calls:true, no_prizepicks_board_mutation:true, no_sleeper_board_mutation:true, no_market_current_lines_writes:true, no_score_db_mutation:true, no_scoring:true, no_ranking:true, no_final_board:true, no_matrix:true },
    timestamp_utc: nowUtc(),
    ...extra
  };
}
async function ensureSchema(env) {
  await env.MARKET_DB.batch([
    env.MARKET_DB.prepare(`CREATE TABLE IF NOT EXISTS market_context_probe_batches (batch_id TEXT PRIMARY KEY, request_id TEXT, run_id TEXT, worker_name TEXT, worker_version TEXT, mode TEXT, slate_window_key TEXT, window_start_date TEXT, window_end_date TEXT, status TEXT, prepared_rows_read INTEGER DEFAULT 0, prepared_games_checked INTEGER DEFAULT 0, prepared_players_checked INTEGER DEFAULT 0, prepared_prop_keys_checked INTEGER DEFAULT 0, odds_api_config_present INTEGER DEFAULT 0, odds_api_events_seen INTEGER DEFAULT 0, odds_api_events_mapped INTEGER DEFAULT 0, odds_api_game_odds_rows INTEGER DEFAULT 0, parlay_inventory_rows_seen INTEGER DEFAULT 0, parlay_props_mapped_to_prepared INTEGER DEFAULT 0, parlay_coverage_grade TEXT, warning_count INTEGER DEFAULT 0, blocker_count INTEGER DEFAULT 0, certification_status TEXT, certification_grade TEXT, output_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`),
    env.MARKET_DB.prepare(`CREATE TABLE IF NOT EXISTS market_context_probe_player_props (probe_row_id TEXT PRIMARY KEY, batch_id TEXT, slate_window_key TEXT, official_date TEXT, prepared_row_id TEXT, source_key TEXT, source_event_id TEXT, source_line_id TEXT, game_pk INTEGER, resolved_mlb_player_id INTEGER, source_player_name TEXT, canonical_prop_key TEXT, source_market_key TEXT, line_value REAL, price_american REAL, price_decimal REAL, outcome_side TEXT, mapping_status TEXT, coverage_status TEXT, raw_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`),
    env.MARKET_DB.prepare(`CREATE TABLE IF NOT EXISTS market_context_probe_coverage (coverage_row_id TEXT PRIMARY KEY, batch_id TEXT, slate_window_key TEXT, official_date TEXT, prepared_row_id TEXT, source_key TEXT, game_pk INTEGER, resolved_mlb_player_id INTEGER, canonical_prop_key TEXT, board_line_value REAL, game_market_status TEXT, player_prop_market_status TEXT, market_context_status TEXT, coverage_grade TEXT, details_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`),
    env.MARKET_DB.prepare(`CREATE TABLE IF NOT EXISTS market_context_probe_issues (issue_id TEXT PRIMARY KEY, batch_id TEXT, slate_window_key TEXT, official_date TEXT, severity TEXT, issue_type TEXT, game_pk INTEGER, prepared_row_id TEXT, source_key TEXT, reason TEXT, details_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`),
    env.MARKET_DB.prepare("CREATE INDEX IF NOT EXISTS idx_market_context_player_props_oddsapi ON market_context_probe_player_props(batch_id, source_key, game_pk, resolved_mlb_player_id, canonical_prop_key)"),
    env.MARKET_DB.prepare("CREATE INDEX IF NOT EXISTS idx_market_context_coverage_oddsapi ON market_context_probe_coverage(batch_id, source_key, game_pk, resolved_mlb_player_id, canonical_prop_key)")
  ]);
}
async function writeIssue(env, batchId, slateWindowKey, officialDate, severity, issueType, gamePk, preparedRowId, sourceKey, reason, details) {
  await run(env.MARKET_DB, `INSERT INTO market_context_probe_issues (issue_id, batch_id, slate_window_key, official_date, severity, issue_type, game_pk, prepared_row_id, source_key, reason, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, rid("mcp_issue"), batchId, slateWindowKey, officialDate || null, severity, issueType, gamePk || null, preparedRowId || null, sourceKey || SOURCE_KEY_PREFIX, safeText(reason, 900), safeJson(details || {}, 3600));
}
async function loadPreparedRows(env, today, tomorrow) {
  const table = await first(env.SCORE_DB, "SELECT name FROM sqlite_master WHERE type='table' AND name='score_board_prepared_current'");
  if (!table) return [];
  return all(env.SCORE_DB, `SELECT prepared_row_id, source_key, source_row_id, player_name, player_name_normalized, resolved_mlb_player_id, team, opponent, team_full_name, opponent_full_name, canonical_prop_key, line_value, official_game_pk, official_game_time_utc, official_date, pickable_safe, matchup_status, player_match_status FROM score_board_prepared_current WHERE pickable_safe=1 AND matchup_status='calendar_matched' AND player_match_status='matched' AND official_game_pk IS NOT NULL AND official_game_time_utc IS NOT NULL AND official_date IN (?, ?) AND canonical_prop_key IN (${HITTER_PROP_KEYS.map(() => "?").join(",")}) LIMIT ${MAX_PREPARED_ROWS}`, today, tomorrow, ...HITTER_PROP_KEYS);
}
async function loadCalendarRows(env, today, tomorrow) {
  const table = await first(env.TEAM_DB, "SELECT name FROM sqlite_master WHERE type='table' AND name='mlb_game_calendar'");
  if (!table) return [];
  return all(env.TEAM_DB, "SELECT official_date, game_pk, game_time_utc, home_team_id, away_team_id, home_team_name, away_team_name FROM mlb_game_calendar WHERE official_date IN (?, ?)", today, tomorrow);
}
async function loadPlayerAliases(env, playerIds) {
  if (!playerIds.length) return new Map();
  const aliases = new Map();
  for (let i = 0; i < playerIds.length; i += 80) {
    const chunk = playerIds.slice(i, i + 80);
    const rows = await all(env.REF_DB, `SELECT player_id, alias_name FROM ref_player_aliases WHERE active=1 AND player_id IN (${chunk.map(() => "?").join(",")})`, ...chunk);
    for (const r of rows) {
      const key = String(r.player_id);
      if (!aliases.has(key)) aliases.set(key, new Set());
      aliases.get(key).add(normalizeText(r.alias_name));
    }
  }
  return aliases;
}
function buildPreparedIndexes(prepared, aliasMap) {
  const byGame = new Map();
  const wantedMarketKeys = new Set();
  for (const p of prepared) {
    const g = String(p.official_game_pk);
    if (!byGame.has(g)) byGame.set(g, []);
    byGame.get(g).push(p);
    if (PROP_TO_MARKET[p.canonical_prop_key]) wantedMarketKeys.add(PROP_TO_MARKET[p.canonical_prop_key]);
    p._aliases = new Set([normalizeText(p.player_name), normalizeText(p.player_name_normalized)]);
    const ext = aliasMap.get(String(p.resolved_mlb_player_id));
    if (ext) for (const a of ext) p._aliases.add(a);
  }
  return { byGame, wantedMarketKeys };
}
function buildCalendarMatcher(calendarRows) {
  const byPair = new Map();
  for (const g of calendarRows) {
    const keys = [
      gamePairKey(g.home_team_name, g.away_team_name),
      gamePairKey(g.home_team_id, g.away_team_id)
    ];
    for (const key of keys) {
      if (!byPair.has(key)) byPair.set(key, []);
      byPair.get(key).push(g);
    }
  }
  return (event) => {
    const candidates = byPair.get(gamePairKey(event.home_team, event.away_team)) || [];
    if (!candidates.length) return { status:"unmatched_event", confidence:"NONE", reason:"team_pair_not_found", game:null, candidate_count:0 };
    const evTime = Date.parse(event.commence_time || "");
    let best = candidates[0], bestDiff = Number.POSITIVE_INFINITY;
    for (const c of candidates) {
      const diff = Math.abs(Date.parse(c.game_time_utc || "") - evTime);
      if (Number.isFinite(diff) && diff < bestDiff) { best = c; bestDiff = diff; }
    }
    return { status:"matched_event_team_pair_time", confidence: bestDiff <= 4 * 3600000 ? "HIGH" : "MEDIUM", reason:"team_pair_match_plus_nearest_commence_time", game:best, candidate_count:candidates.length, time_diff_minutes:Number.isFinite(bestDiff) ? Math.round(bestDiff/60000) : null };
  };
}
function buildEventsUrl(env, input) {
  const base = String(input.odds_api_base_url || env.ODDS_API_BASE_URL || DEFAULT_ODDS_API_BASE_URL).replace(/\/+$/, "");
  const url = new URL(`${base}/sports/baseball_mlb/odds`);
  url.searchParams.set("apiKey", String(env.ODDS_API_KEY));
  url.searchParams.set("regions", String(input.regions || env.ODDS_API_REGIONS || "us"));
  url.searchParams.set("markets", "h2h");
  url.searchParams.set("oddsFormat", "american");
  const books = String(input.bookmakers || env.ODDS_API_HITTER_BOOKMAKERS || env.ODDS_API_BOOKMAKERS || DEFAULT_BOOKMAKERS).replace(/\s+/g, "");
  if (books) url.searchParams.set("bookmakers", books);
  return { url:url.toString(), bookmakers:books };
}
function buildEventPropsUrl(env, input, eventId, marketKeys, bookmakers) {
  const base = String(input.odds_api_base_url || env.ODDS_API_BASE_URL || DEFAULT_ODDS_API_BASE_URL).replace(/\/+$/, "");
  const url = new URL(`${base}/sports/baseball_mlb/events/${encodeURIComponent(eventId)}/odds`);
  url.searchParams.set("apiKey", String(env.ODDS_API_KEY));
  url.searchParams.set("regions", String(input.regions || env.ODDS_API_REGIONS || "us"));
  if (bookmakers) url.searchParams.set("bookmakers", bookmakers);
  url.searchParams.set("markets", [...marketKeys].join(","));
  url.searchParams.set("oddsFormat", "american");
  return url.toString();
}
async function fetchJson(url, timeoutMs = 12000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort("timeout"), timeoutMs);
  const started = nowUtc();
  try {
    const resp = await fetch(url, { method:"GET", headers:{ accept:"application/json" }, signal:ac.signal });
    const text = await resp.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (_) {}
    return { ok:resp.ok, http_status:resp.status, json:parsed, text_preview:safeText(text, 1200), started_at:started, finished_at:nowUtc() };
  } catch (err) {
    return { ok:false, http_status:null, json:null, text_preview:null, started_at:started, finished_at:nowUtc(), error:safeText(err && err.message ? err.message : err) };
  } finally { clearTimeout(t); }
}
async function runWorker(env, input) {
  await ensureSchema(env);
  const today = input.today || input.slate_date || ptDate(0);
  const tomorrow = input.tomorrow || ptDate(1);
  const slateWindowKey = `${today}_${tomorrow}`;
  const batchId = `market_hitter_oddsapi_batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const requestId = input.request_id || null;
  const runId = input.run_id || null;
  let warningCount = 0;
  let blockerCount = 0;
  await run(env.MARKET_DB, "DELETE FROM market_context_probe_player_props WHERE slate_window_key=? AND source_key LIKE 'odds_api_%_hitter_props'", slateWindowKey);
  await run(env.MARKET_DB, "DELETE FROM market_context_probe_coverage WHERE slate_window_key=? AND source_key LIKE 'odds_api_%_hitter_props'", slateWindowKey);
  await run(env.MARKET_DB, "DELETE FROM market_context_probe_issues WHERE slate_window_key=? AND source_key LIKE 'odds_api%'", slateWindowKey);

  const preparedRows = await loadPreparedRows(env, today, tomorrow);
  const calendarRows = await loadCalendarRows(env, today, tomorrow);
  const playerIds = [...new Set(preparedRows.map(r => Number(r.resolved_mlb_player_id)).filter(Number.isFinite))];
  const aliasMap = await loadPlayerAliases(env, playerIds);
  const indexes = buildPreparedIndexes(preparedRows, aliasMap);
  const eventMatcher = buildCalendarMatcher(calendarRows);

  if (!sourceHas(env, "ODDS_API_KEY")) {
    blockerCount++;
    await writeIssue(env, batchId, slateWindowKey, today, "BLOCKER", "ODDS_API_KEY_MISSING", null, null, SOURCE_KEY_PREFIX, "ODDS_API_KEY missing", {});
  }
  if (!preparedRows.length) {
    blockerCount++;
    await writeIssue(env, batchId, slateWindowKey, today, "BLOCKER", "NO_PREPARED_SAFE_HITTER_ROWS", null, null, SOURCE_KEY_PREFIX, "No pickable safe hitter prepared rows for today/tomorrow", { today, tomorrow });
  }

  let eventsSeen = 0, eventsMapped = 0, eventCalls = 0, rowsWritten = 0, matchedRows = 0, unmatchedRows = 0;
  const propRows = [];
  const matchedCoverageSet = new Set();
  const bookStats = {};
  const eventSummaries = [];
  let eventsFetch = { ok:false, skipped:true };
  if (sourceHas(env, "ODDS_API_KEY") && preparedRows.length) {
    const eventUrl = buildEventsUrl(env, input);
    eventsFetch = await fetchJson(eventUrl.url, Number(env.ODDS_API_FETCH_TIMEOUT_MS || 12000));
    eventCalls += 1;
    const events = Array.isArray(eventsFetch.json) ? eventsFetch.json : [];
    eventsSeen = events.length;
    const matchedEvents = [];
    for (const ev of events) {
      const m = eventMatcher(ev);
      if (m.game && indexes.byGame.has(String(m.game.game_pk))) {
        matchedEvents.push({ ev, match:m });
      }
    }
    const maxEvents = Math.max(0, Math.min(40, Number(input.max_events || env.ODDS_API_HITTER_MAX_EVENTS || 24)));
    const selectedEvents = matchedEvents.slice(0, maxEvents);
    eventsMapped = selectedEvents.length;
    if (!eventsFetch.ok) { warningCount++; await writeIssue(env, batchId, slateWindowKey, today, "WARNING", "ODDS_API_EVENTS_FETCH_FAILED", null, null, SOURCE_KEY_PREFIX, "Odds API events fetch failed", { http_status:eventsFetch.http_status, response_preview:eventsFetch.text_preview, error:eventsFetch.error || null, endpoint:safeEndpoint(eventUrl.url) }); }
    if (eventsFetch.ok && !selectedEvents.length) { blockerCount++; await writeIssue(env, batchId, slateWindowKey, today, "BLOCKER", "ODDS_API_EVENTS_UNMAPPED", null, null, SOURCE_KEY_PREFIX, "Odds API returned no event mapped to prepared today/tomorrow hitter games", { events_seen:eventsSeen, prepared_games:[...indexes.byGame.keys()].length }); }
    for (const item of selectedEvents) {
      const wantedMarketKeys = new Set(indexes.byGame.get(String(item.match.game.game_pk)).map(p => PROP_TO_MARKET[p.canonical_prop_key]).filter(Boolean));
      const url = buildEventPropsUrl(env, input, item.ev.id, wantedMarketKeys.size ? wantedMarketKeys : indexes.wantedMarketKeys, eventUrl.bookmakers);
      const fetched = await fetchJson(url, Number(env.ODDS_API_FETCH_TIMEOUT_MS || 12000));
      eventCalls += 1;
      eventSummaries.push({ event_id:item.ev.id, game_pk:item.match.game.game_pk, endpoint:safeEndpoint(url), http_status:fetched.http_status, ok:fetched.ok });
      if (!fetched.ok) { warningCount++; await writeIssue(env, batchId, slateWindowKey, item.match.game.official_date, "WARNING", "ODDS_API_EVENT_PLAYER_PROPS_FETCH_FAILED", item.match.game.game_pk, null, SOURCE_KEY_PREFIX, "Event player props fetch failed", { http_status:fetched.http_status, response_preview:fetched.text_preview, error:fetched.error || null, event_id:item.ev.id, endpoint:safeEndpoint(url) }); continue; }
      const evPayload = fetched.json && typeof fetched.json === "object" ? fetched.json : {};
      const books = Array.isArray(evPayload.bookmakers) ? evPayload.bookmakers : [];
      for (const book of books) {
        const sourceKey = sourceKeyForBook(book.key);
        if (!bookStats[sourceKey]) bookStats[sourceKey] = { bookmaker_key:book.key || null, bookmaker_title:book.title || null, rows:0, matched:0, unmatched:0, markets:new Set(), players:new Set() };
        const markets = Array.isArray(book.markets) ? book.markets : [];
        for (const market of markets) {
          const canonical = MARKET_TO_PROP[market.key];
          if (!canonical) continue;
          const outcomes = Array.isArray(market.outcomes) ? market.outcomes : [];
          for (const out of outcomes) {
            const playerName = out.description || out.participant || out.player || out.name || null;
            const side = outcomeSide(out.name);
            if (!playerName || !side) continue;
            const lineValue = numberOrNull(out.point);
            const preparedCandidates = (indexes.byGame.get(String(item.match.game.game_pk)) || []).filter(p => p.canonical_prop_key === canonical);
            const normPlayer = normalizeText(playerName);
            const matched = preparedCandidates.find(p => p._aliases && p._aliases.has(normPlayer));
            const mappingStatus = matched ? "matched_prepared_team_pair_player_alias_prop" : "no_prepared_match_after_required_team_pair_resolver";
            const coverageStatus = matched ? "oddsapi_hitter_prop_line_matched_to_prepared" : "oddsapi_hitter_prop_line_not_matched_to_prepared";
            const raw = { mode:MODE, odds_api:{ event_id:item.ev.id, bookmaker_key:book.key, bookmaker_title:book.title, market_key:market.key, market_last_update:market.last_update || null, outcome:out }, resolver:{ game_pk:item.match.game.game_pk, match_status:item.match.status, match_confidence:item.match.confidence, player_name_normalized:normPlayer, prepared_candidates:preparedCandidates.length, mapping_status:mappingStatus }, prepared_match: matched ? { prepared_row_id:matched.prepared_row_id, resolved_mlb_player_id:matched.resolved_mlb_player_id, board_line_value:matched.line_value, source_key:matched.source_key } : null };
            propRows.push([rid("mcp_prop"), batchId, slateWindowKey, item.match.game.official_date, matched ? matched.prepared_row_id : null, sourceKey, item.ev.id || null, `${item.ev.id || "event"}|${book.key || "book"}|${market.key}|${playerName}|${side}|${lineValue}`, item.match.game.game_pk, matched ? Number(matched.resolved_mlb_player_id) : null, playerName, canonical, market.key, lineValue, numberOrNull(out.price), americanToDecimal(out.price), side, mappingStatus, coverageStatus, safeJson(raw, 6500)]);
            rowsWritten++;
            bookStats[sourceKey].rows++;
            bookStats[sourceKey].markets.add(canonical);
            bookStats[sourceKey].players.add(normPlayer);
            if (matched) {
              matchedRows++;
              bookStats[sourceKey].matched++;
              matchedCoverageSet.add(matchedCoverageKey(sourceKey, item.match.game.game_pk, matched.resolved_mlb_player_id, canonical));
            } else {
              unmatchedRows++;
              bookStats[sourceKey].unmatched++;
            }
          }
        }
      }
    }
  }

  if (propRows.length) {
    await batchRun(env.MARKET_DB, `INSERT INTO market_context_probe_player_props (probe_row_id, batch_id, slate_window_key, official_date, prepared_row_id, source_key, source_event_id, source_line_id, game_pk, resolved_mlb_player_id, source_player_name, canonical_prop_key, source_market_key, line_value, price_american, price_decimal, outcome_side, mapping_status, coverage_status, raw_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, propRows, 50);
  }

  const sourceKeys = Object.keys(bookStats);
  const coverageRows = [];
  for (const p of preparedRows) {
    for (const sourceKey of sourceKeys) {
      const has = matchedCoverageSet.has(matchedCoverageKey(sourceKey, p.official_game_pk, p.resolved_mlb_player_id, p.canonical_prop_key));
      coverageRows.push([rid("mcp_cov"), batchId, slateWindowKey, p.official_date, p.prepared_row_id, sourceKey, p.official_game_pk, p.resolved_mlb_player_id, p.canonical_prop_key, numberOrNull(p.line_value), "prepared_game_checked", has ? "oddsapi_book_market_player_found" : "oddsapi_book_market_player_missing", has ? "covered" : "missing", has ? "COVERED" : "MISSING", safeJson({ bookmaker:bookStats[sourceKey], source_scope:"oddsapi_event_player_props", board_source:p.source_key }, 2200)]);
    }
  }
  if (coverageRows.length) {
    await batchRun(env.MARKET_DB, `INSERT INTO market_context_probe_coverage (coverage_row_id, batch_id, slate_window_key, official_date, prepared_row_id, source_key, game_pk, resolved_mlb_player_id, canonical_prop_key, board_line_value, game_market_status, player_prop_market_status, market_context_status, coverage_grade, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, coverageRows, 50);
  }

  const bookSummary = Object.fromEntries(Object.entries(bookStats).map(([k, v]) => [k, { bookmaker_key:v.bookmaker_key, bookmaker_title:v.bookmaker_title, rows:v.rows, matched:v.matched, unmatched:v.unmatched, markets:v.markets.size, players:v.players.size }]));
  const strongBooks = Object.values(bookSummary).filter(b => ["draftkings", "fanduel", "betmgm", "caesars", "espnbet", "fanatics", "bet365"].includes(String(b.bookmaker_key || ""))).reduce((a, b) => ({ rows:a.rows+b.rows, matched:a.matched+b.matched }), { rows:0, matched:0 });
  const boardBaseRows = preparedRows.length;
  const strongRawPct = boardBaseRows ? Number((strongBooks.rows / boardBaseRows * 100).toFixed(1)) : 0;
  const strongMatchedPct = boardBaseRows ? Number((strongBooks.matched / boardBaseRows * 100).toFixed(1)) : 0;
  const status = blockerCount ? "BLOCKED_WITH_ISSUES" : "COMPLETED_ODDSAPI_HITTER_PROP_CONTEXT";
  const certification = blockerCount ? "ODDSAPI_HITTER_PROP_CONTEXT_BLOCKED" : "ODDSAPI_HITTER_PROP_CONTEXT_CERTIFIED_EVIDENCE_ONLY";
  const grade = blockerCount ? "BLOCKED" : (matchedRows > 0 ? "PASS_WITH_WARNINGS" : "NO_MATCHED_MARKET_ROWS");
  const output = { ok:blockerCount === 0, data_ok:blockerCount === 0, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, mode:MODE, request_id:requestId, run_id:runId, batch_id:batchId, status, certification, certification_status:certification, certification_grade:grade, rows_read:preparedRows.length, rows_written:rowsWritten + coverageRows.length, prepared_rows_read:preparedRows.length, prepared_games_checked:indexes.byGame.size, prepared_players_checked:playerIds.length, prepared_prop_keys_checked:new Set(preparedRows.map(r => r.canonical_prop_key)).size, odds_api_config_present:sourceHas(env, "ODDS_API_KEY") ? 1 : 0, odds_api_events_seen:eventsSeen, odds_api_events_mapped:eventsMapped, odds_api_event_calls: eventCalls, oddsapi_hitter_prop_rows_written:rowsWritten, oddsapi_hitter_prop_rows_matched:matchedRows, oddsapi_hitter_prop_rows_unmatched:unmatchedRows, coverage_rows_written:coverageRows.length, strong_book_coverage_against_prepared_board:{ denominator_prepared_pickable_hitter_rows:boardBaseRows, strong_books_raw_rows:strongBooks.rows, strong_books_matched_rows:strongBooks.matched, strong_books_raw_percent:strongRawPct, strong_books_matched_percent:strongMatchedPct }, book_summary:bookSummary, warning_count:warningCount, blocker_count:blockerCount, external_calls_performed:eventCalls, d1_request_reduction:"v0.1.1 batches prop inserts and builds coverage from in-memory matchedCoverageSet; no per-prepared-row COUNT probes", output_json:{ source_scope:"odds_api_event_level_mlb_hitter_props", official_docs_shape:"player props accessed one event at a time through /events/{eventId}/odds", selected_dummy_slot:"alphadog-v2-oddsapi-reference", slate_window:{ today, tomorrow, slateWindowKey }, event_fetch:{ ok:eventsFetch.ok || false, http_status:eventsFetch.http_status || null }, event_summaries:eventSummaries.slice(0, 24), markets_requested:ODDS_MLB_MARKETS, source_boundaries:baseIdentity(env).boundaries }, timestamp_utc:nowUtc() };
  await run(env.MARKET_DB, `INSERT OR REPLACE INTO market_context_probe_batches (batch_id, request_id, run_id, worker_name, worker_version, mode, slate_window_key, window_start_date, window_end_date, status, prepared_rows_read, prepared_games_checked, prepared_players_checked, prepared_prop_keys_checked, odds_api_config_present, odds_api_events_seen, odds_api_events_mapped, odds_api_game_odds_rows, parlay_inventory_rows_seen, parlay_props_mapped_to_prepared, parlay_coverage_grade, warning_count, blocker_count, certification_status, certification_grade, output_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, batchId, requestId, runId, WORKER_NAME, VERSION, MODE, slateWindowKey, today, tomorrow, status, preparedRows.length, indexes.byGame.size, playerIds.length, new Set(preparedRows.map(r => r.canonical_prop_key)).size, sourceHas(env, "ODDS_API_KEY") ? 1 : 0, eventsSeen, eventsMapped, rowsWritten, matchedRows, "ODDSAPI_HITTER_EVIDENCE_ONLY", warningCount, blockerCount, certification, grade, safeJson(output, 9000));
  return output;
}

async function runHistoricalPropsProbe(env, input) {
  // Real, minimal, safe, read-only probe - added to answer one real question: does the-odds-api.com's
  // real historical archive (which the docs say covers player props for MLB from May 2023) actually
  // return real player-prop data for a real 2025 MLB game, given the account already paying for it.
  // Reuses the exact same real base URL / auth mechanism already live in this worker.
  const base = String(input.odds_api_base_url || env.ODDS_API_BASE_URL || DEFAULT_ODDS_API_BASE_URL).replace(/\/+$/, "");
  const date = String(input.date || "2025-06-15T20:00:00Z");
  const regions = String(input.regions || env.ODDS_API_REGIONS || "us");

  const eventsUrl = new URL(`${base}/historical/sports/baseball_mlb/events`);
  eventsUrl.searchParams.set("apiKey", String(env.ODDS_API_KEY));
  eventsUrl.searchParams.set("date", date);
  const eventsRes = await fetchJson(eventsUrl.toString());
  if (!eventsRes.ok || !eventsRes.json || !Array.isArray(eventsRes.json.data)) {
    return { ok: true, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "historical_events_call_failed", certification: "ODDS_API_HISTORICAL_PROBE_EVENTS_FAILED", real_probe_date: date, http_status: eventsRes.http_status, error: eventsRes.error || "unexpected_response_shape", text_preview: eventsRes.text_preview || null, external_calls_performed: 1, no_scoring: true, no_ranking: true, no_final_board: true, timestamp_utc: nowUtc() };
  }
  const events = eventsRes.json.data;
  const sampleEvent = events[0] || null;

  let oddsRes = null, oddsSummary = null;
  if (sampleEvent && sampleEvent.id) {
    const oddsUrl = new URL(`${base}/historical/sports/baseball_mlb/events/${encodeURIComponent(sampleEvent.id)}/odds`);
    oddsUrl.searchParams.set("apiKey", String(env.ODDS_API_KEY));
    oddsUrl.searchParams.set("regions", regions);
    oddsUrl.searchParams.set("markets", ODDS_MLB_MARKETS.join(","));
    oddsUrl.searchParams.set("date", date);
    oddsRes = await fetchJson(oddsUrl.toString());
    if (oddsRes.ok && oddsRes.json && oddsRes.json.data) {
      const bookmakers = oddsRes.json.data.bookmakers || [];
      let totalMarkets = 0, totalOutcomes = 0, marketKeysSeen = new Set(), sampleOutcomes = [];
      for (const bk of bookmakers) {
        for (const mk of (bk.markets || [])) {
          totalMarkets += 1;
          marketKeysSeen.add(mk.key);
          for (const oc of (mk.outcomes || [])) {
            totalOutcomes += 1;
            if (sampleOutcomes.length < 5) sampleOutcomes.push({ bookmaker: bk.key, market: mk.key, name: oc.name, description: oc.description || null, price: oc.price, point: oc.point });
          }
        }
      }
      oddsSummary = { bookmakers_present: bookmakers.map(b => b.key), total_markets: totalMarkets, total_outcomes: totalOutcomes, distinct_market_keys: Array.from(marketKeysSeen), sample_outcomes: sampleOutcomes, response_timestamp: oddsRes.json.timestamp || null };
    }
  }

  return {
    ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY,
    status: "completed", certification: "ODDS_API_HISTORICAL_PROPS_PROBE_COMPLETED",
    real_probe_date: date,
    real_events_found: events.length,
    sample_event: sampleEvent ? { id: sampleEvent.id, home_team: sampleEvent.home_team, away_team: sampleEvent.away_team, commence_time: sampleEvent.commence_time } : null,
    historical_odds_call_ok: oddsRes ? oddsRes.ok : null,
    historical_odds_http_status: oddsRes ? oddsRes.http_status : null,
    historical_odds_summary: oddsSummary,
    historical_odds_error: oddsRes && !oddsRes.ok ? (oddsRes.error || oddsRes.text_preview) : null,
    external_calls_performed: sampleEvent ? 2 : 1,
    api_key_value_never_returned: true,
    no_scoring: true, no_ranking: true, no_final_board: true,
    timestamp_utc: nowUtc()
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();
    if (method === "OPTIONS") return new Response(null, { status:204, headers:{ "access-control-allow-origin":"*", "access-control-allow-headers":"content-type,x-ingest-token,x-admin-token,authorization", "access-control-allow-methods":"GET,POST,OPTIONS" } });
    if (method === "GET" && (path === "/" || path === "/health")) return jsonResponse(baseIdentity(env));
    if (method === "POST" && path === "/diagnostic") return jsonResponse(baseIdentity(env, { route:"/diagnostic", schema_checked:false }));
    if (method === "POST" && path === "/historical-probe") {
      const input = await readJsonSafe(request);
      try { return jsonResponse(await runHistoricalPropsProbe(env, input)); }
      catch (err) { return jsonResponse({ ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, status:"WORKER_EXCEPTION", certification:"ODDS_API_HISTORICAL_PROBE_EXCEPTION", error:safeText(err && err.stack ? err.stack : err), timestamp_utc:nowUtc() }, 500); }
    }
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const innerInput = input.input_json && typeof input.input_json === "object" ? input.input_json : input;
      if (innerInput.mode === "historical_props_probe") {
        try { return jsonResponse(await runHistoricalPropsProbe(env, innerInput)); }
        catch (err) { return jsonResponse({ ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, status:"WORKER_EXCEPTION", certification:"ODDS_API_HISTORICAL_PROBE_EXCEPTION", error:safeText(err && err.stack ? err.stack : err), timestamp_utc:nowUtc() }, 500); }
      }
      try { return jsonResponse(await runWorker(env, input)); }
      catch (err) { return jsonResponse({ ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, status:"WORKER_EXCEPTION", certification:"ODDSAPI_HITTER_PROP_CONTEXT_EXCEPTION", error:safeText(err && err.stack ? err.stack : err), timestamp_utc:nowUtc() }, 500); }
    }
    return jsonResponse({ ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, status:"NOT_FOUND", allowed_routes:["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc:nowUtc() }, 404);
  }
};
