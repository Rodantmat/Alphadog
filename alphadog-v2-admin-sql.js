import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-admin-sql";
const VERSION = "alphadog-v2-admin-sql-mcp-bridge-v3.5-daily-games-status-binding";
const JOB_KEY = "admin-sql-mcp-bridge";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB", "SCORING_DB"];
const REQUIRED_SECRETS = ["ALPHADOG_ADMIN_TOKEN", "ALPHADOG_INTERNAL_TOKEN", "ODDS_API_KEY", "PARLAY_API_KEY", "GEMINI_API_KEY", "GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BRANCH", "GITHUB_PRIZEPICKS_PATH", "MLB_API_USER_AGENT"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "DEFAULT_DAY_SCOPE", "DEFAULT_SLATE_MODE", "ODDS_API_BASE_URL", "PARLAY_API_BASE_URL", "MLB_API_BASE_URL", "PRIZEPICKS_SOURCE_MODE", "MAX_TICK_MS", "MAX_API_CALLS_PER_TICK", "MAX_ROWS_PER_TICK", "LOCK_STALE_MINUTES", "WORKER_SAFE_MODE", "DEBUG_MODE", "MANUAL_SQL_ENABLED", "CONFIG_PHASE"];

const HARD_MAX_ROWS = 500;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "Mcp-Session-Id"
};

function nowUtc() {
  return new Date().toISOString();
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...CORS_HEADERS
    }
  });
}

function bindingPresence(env, names) {
  const out = {};
  for (const name of names) out[name] = Boolean(env && env[name]);
  return out;
}

function varPresence(env, names) {
  const out = {};
  for (const name of names) out[name] = env && env[name] !== undefined && env[name] !== null && String(env[name]).length > 0;
  return out;
}

function allTrue(obj) {
  return Object.values(obj).every(Boolean);
}

function baseIdentity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars = varPresence(env, EXPECTED_VARS);
  const secrets = varPresence(env, REQUIRED_SECRETS);

  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "MCP_BRIDGE_ACTIVE",
    timestamp_utc: nowUtc(),
    phase: "alphadog-v2-mcp-bridge",
    notes: [
      "This worker is the MCP bridge for Claude, built on Cloudflare's official agents/MCP SDK.",
      "GET /health and POST /diagnostic still report binding/secret presence.",
      "POST /mcp is handled by the McpAgent Durable Object, not hand-rolled JSON-RPC.",
      "OAuth endpoints below are a minimal single-user auto-approve flow, not a real login system."
    ],
    binding_summary: {
      required_db_bindings_present: allTrue(db),
      expected_vars_present: allTrue(vars),
      required_secrets_present: allTrue(secrets),
      control_room_service_binding_present: Boolean(env && env.CONTROL_ROOM)
    }
  };
}

async function readJsonSafe(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function isAuthorized(request, env) {
  const auth = request.headers.get("authorization") || "";
  const headerToken = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token") || "";
  const token = headerToken || queryToken;
  return Boolean(env.ALPHADOG_ADMIN_TOKEN) && token === env.ALPHADOG_ADMIN_TOKEN;
}

function isWriteStatement(sql) {
  const head = String(sql || "").trim().slice(0, 12).toUpperCase();
  return !head.startsWith("SELECT") && !head.startsWith("WITH") && !head.startsWith("PRAGMA");
}

async function toolRunSql(env, args) {
  const { database, sql, params, max_rows, allow_write } = args || {};

  if (!database || !REQUIRED_DB_BINDINGS.includes(database)) {
    return { ok: false, error: `Unknown or missing database. Must be one of: ${REQUIRED_DB_BINDINGS.join(", ")}` };
  }
  if (!env[database]) {
    return { ok: false, error: `Binding ${database} is not present on this worker.` };
  }
  if (!sql || typeof sql !== "string") {
    return { ok: false, error: "Missing sql string." };
  }
  if (isWriteStatement(sql) && !allow_write) {
    return { ok: false, error: "This looks like a write statement (not SELECT/WITH/PRAGMA). Re-call with allow_write:true if that's intended." };
  }

  const cap = Math.min(Number(max_rows) > 0 ? Number(max_rows) : HARD_MAX_ROWS, HARD_MAX_ROWS);

  try {
    const stmt = env[database].prepare(sql);
    const bound = Array.isArray(params) && params.length ? stmt.bind(...params) : stmt;
    const result = await bound.all();
    const rows = (result.results || []).slice(0, cap);
    return {
      ok: true,
      database,
      row_count_returned: rows.length,
      row_count_total_from_driver: (result.results || []).length,
      truncated: (result.results || []).length > rows.length,
      rows,
      meta: result.meta || null
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

async function toolRunPostgres(env, args) {
  // Read-only-by-default Postgres query tool via Hyperdrive, mirroring toolRunSql's D1 safety
  // pattern exactly (SELECT/WITH always allowed, anything else needs allow_write:true).
  // prepare:false is mandatory here - see ALPHADOG_DOS_AND_DONTS.md - without it, postgres.js's
  // prepared-statement mode silently masks real Postgres errors as generic "connection lost".
  const { sql: sqlText, params, max_rows, allow_write } = args || {};
  if (!env.HYPERDRIVE) {
    return { ok: false, error: "HYPERDRIVE binding is not present on this worker." };
  }
  if (!sqlText || typeof sqlText !== "string") {
    return { ok: false, error: "Missing sql string." };
  }
  if (isWriteStatement(sqlText) && !allow_write) {
    return { ok: false, error: "This looks like a write statement (not SELECT/WITH). Re-call with allow_write:true if that's intended." };
  }

  const cap = Math.min(Number(max_rows) > 0 ? Number(max_rows) : HARD_MAX_ROWS, HARD_MAX_ROWS);
  const sql = postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false });
  try {
    const rows = Array.isArray(params) && params.length
      ? await sql.unsafe(sqlText, params)
      : await sql.unsafe(sqlText);
    const list = Array.from(rows || []);
    const trimmed = list.slice(0, cap);
    return {
      ok: true,
      row_count_returned: trimmed.length,
      row_count_total_from_driver: list.length,
      truncated: list.length > trimmed.length,
      rows: trimmed
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    try { await sql.end({ timeout: 5 }); } catch (_) { /* best-effort close */ }
  }
}

async function toolRunJob(env, args) {
  const { job, extra, target } = args || {};
  if (!job || typeof job !== "string") {
    return { ok: false, error: "Missing job string." };
  }
  if (job === "board_compare_parlay_vs_ours") {
    // Same-moment diff of OUR board scraper output (boards/<app>_<sport>_current.json: legs[]) vs ParlayAPI live props for that book.
    // extra: { app: "sleeper"|"underdog", sport_key: "baseball_mlb", file_sport: "mlb" }
    const app = String((extra && extra.app) || "sleeper"); const sport = String((extra && extra.sport_key) || "baseball_mlb"); const fs = String((extra && extra.file_sport) || "mlb");
    const sqlp = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false });
    let key = "";
    try { const r = await sqlp`SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = 'parlay_api_key' LIMIT 1`; key = r && r[0] ? String(r[0].credential_value_encrypted).trim() : (env.PARLAY_API_KEY || ""); } finally { await sqlp.end({ timeout: 5 }); }
    const norm = (s) => String(s || "").toLowerCase().replace(/rbis?/g, "rbi").replace(/[^a-z0-9+]/g, "");
    const normPlayer = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/[^a-z]/g, "");
    const pr = await fetch(`https://parlay-api.com/v1/sports/${sport}/props?bookmakers=${app}`, { headers: { "X-API-Key": key, accept: "application/json" } });
    const parlay = await pr.json(); const parlayAt = new Date().toISOString();
    const sr = await fetch(`https://raw.githubusercontent.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/main/boards/${app}_${fs}_current.json?r=${Date.now()}`);
    const ours = await sr.json();
    const oursLegs = (ours.legs || []).map((l) => ({ player: l.player, stat: l.wager_type || l.stat, line: Number(l.line), mult_over: l.over_multiplier ?? l.higher_multiplier, mult_under: l.under_multiplier ?? l.lower_multiplier, line_type: l.line_type, live: l.live || l.game_status === "in_game" }));
    const pLegs = (Array.isArray(parlay) ? parlay : []).map((r) => ({ player: r.player, stat: r.market_key || r.market, line: Number(r.line), over: r.over_price, under: r.under_price, flat: r.is_dfs_flat_payout }));
    const k3 = (l) => `${normPlayer(l.player)}|${l.line}`; // player+line (stat naming differs between the two systems)
    const kStat = (l) => `${normPlayer(l.player)}|${norm(l.stat)}|${l.line}`;
    const oMap = new Map(oursLegs.map((l) => [kStat(l), l])), pMap = new Map(pLegs.map((l) => [kStat(l), l]));
    const matchedStat = [...oMap.keys()].filter((k) => pMap.has(k)).length;
    const oPL = new Set(oursLegs.map(k3)), pPL = new Set(pLegs.map(k3));
    const matchedPL = [...oPL].filter((k) => pPL.has(k)).length;
    const count = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
    return { ok: true, app, sport, ours_fetched_at: ours.meta && ours.meta.fetched_at, parlay_fetched_at: parlayAt, ours_legs: oursLegs.length, parlay_legs: pLegs.length,
      ours_players: new Set(oursLegs.map((l) => normPlayer(l.player))).size, parlay_players: new Set(pLegs.map((l) => normPlayer(l.player))).size,
      matched_player_stat_line: matchedStat, matched_player_line: matchedPL, ours_only_player_line: oPL.size - matchedPL, parlay_only_player_line: pPL.size - matchedPL,
      ours_stat_names: Object.entries(count(oursLegs, (l) => norm(l.stat))).slice(0, 30), parlay_stat_names: Object.entries(count(pLegs, (l) => norm(l.stat))).slice(0, 30),
      ours_multiplier_sample: oursLegs.slice(0, 6), parlay_price_sample: pLegs.slice(0, 6), ours_line_types: count(oursLegs, (l) => String(l.line_type)), ours_live: oursLegs.filter((l) => l.live).length };
  }
  if (job === "pp_compare_parlay_vs_scraper") {
    // Same-moment comparison of PrizePicks legs: ParlayAPI live props (bookmakers=prizepicks) vs our own scraper output
    // (raw PrizePicks JSON:API committed to the repo). extra: { sport_key: "baseball_mlb", scraper_path: "prizepicks_mlb_current.json" }
    const sport = String((extra && extra.sport_key) || "baseball_mlb"); const scraperPath = String((extra && extra.scraper_path) || "prizepicks_mlb_current.json");
    const sqlp = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false });
    let key = "";
    try { const r = await sqlp`SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = 'parlay_api_key' LIMIT 1`; key = r && r[0] ? String(r[0].credential_value_encrypted).trim() : (env.PARLAY_API_KEY || ""); } finally { await sqlp.end({ timeout: 5 }); }
    const norm = (s) => String(s || "").toLowerCase().replace(/rbis?/g, "rbi").replace(/[^a-z0-9+]/g, "");
    const normPlayer = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/[^a-z]/g, "");
    const pr = await fetch(`https://parlay-api.com/v1/sports/${sport}/props?bookmakers=prizepicks`, { headers: { "X-API-Key": key, accept: "application/json" } });
    const parlay = await pr.json(); const parlayAt = new Date().toISOString();
    const sr = await fetch(`https://raw.githubusercontent.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/main/${scraperPath}?r=${Date.now()}`);
    const scr = await sr.json();
    const mr = await fetch(`https://raw.githubusercontent.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/main/${scraperPath.replace(".json", "_meta.json")}?r=${Date.now()}`);
    const meta = await mr.json().catch(() => ({}));
    // scraper: JSON:API -> legs
    const players = {}, stats = {};
    for (const inc of scr.included || []) { if (inc.type === "new_player") players[inc.id] = inc.attributes && (inc.attributes.display_name || inc.attributes.name); if (inc.type === "stat_type") stats[inc.id] = inc.attributes && inc.attributes.name; }
    const sLegs = [];
    for (const p of scr.data || []) {
      const a = p.attributes || {}; if (a.status && a.status !== "pre_game") continue;
      const pid = p.relationships && p.relationships.new_player && p.relationships.new_player.data && p.relationships.new_player.data.id;
      sLegs.push({ player: players[pid] || "", stat: a.stat_type || stats[(p.relationships.stat_type || {}).data?.id] || "", line: Number(a.line_score), odds_type: String(a.odds_type || "standard").toLowerCase(), start: a.start_time, live: !!a.is_live });
    }
    const pLegs = (Array.isArray(parlay) ? parlay : []).map((r) => ({ player: r.player, stat: r.market, line: Number(r.line), odds_type: String(r.odds_type || "standard").toLowerCase(), commence: r.commence_time }));
    const keyOf = (l) => `${normPlayer(l.player)}|${norm(l.stat)}|${l.line}|${l.odds_type}`;
    const sMap = new Map(sLegs.map((l) => [keyOf(l), l])), pMap = new Map(pLegs.map((l) => [keyOf(l), l]));
    const matched = [...sMap.keys()].filter((k) => pMap.has(k));
    const scraperOnly = [...sMap.keys()].filter((k) => !pMap.has(k)), parlayOnly = [...pMap.keys()].filter((k) => !sMap.has(k));
    // looser match: same player+stat+odds_type, different line
    const loose = (l) => `${normPlayer(l.player)}|${norm(l.stat)}|${l.odds_type}`;
    const pLoose = new Map(); for (const l of pLegs) pLoose.set(loose(l), (pLoose.get(loose(l)) || []).concat([l.line]));
    const lineDiffs = scraperOnly.map((k) => sMap.get(k)).filter((l) => pLoose.has(loose(l))).map((l) => ({ player: l.player, stat: l.stat, scraper_line: l.line, parlay_lines: pLoose.get(loose(l)), odds_type: l.odds_type }));
    const count = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
    const statsS = count(sLegs, (l) => norm(l.stat)), statsP = count(pLegs, (l) => norm(l.stat));
    const statsOnlyScraper = Object.keys(statsS).filter((k) => !statsP[k]).map((k) => [k, statsS[k]]), statsOnlyParlay = Object.keys(statsP).filter((k) => !statsS[k]).map((k) => [k, statsP[k]]);
    return { ok: true, parlay_fetched_at: parlayAt, scraper_finished_at: meta.finished_at, scraper_total_projections: (scr.data || []).length, scraper_pregame_legs: sLegs.length, parlay_legs: pLegs.length,
      by_odds_type: { scraper: count(sLegs, (l) => l.odds_type), parlay: count(pLegs, (l) => l.odds_type) },
      matched_exact: matched.length, scraper_only: scraperOnly.length, parlay_only: parlayOnly.length, scraper_only_with_line_diff: lineDiffs.length,
      distinct_players: { scraper: new Set(sLegs.map((l) => normPlayer(l.player))).size, parlay: new Set(pLegs.map((l) => normPlayer(l.player))).size },
      stats_only_scraper: statsOnlyScraper.slice(0, 40), stats_only_parlay: statsOnlyParlay.slice(0, 40),
      sample_scraper_only: scraperOnly.slice(0, 25).map((k) => sMap.get(k)), sample_parlay_only: parlayOnly.slice(0, 25).map((k) => pMap.get(k)), sample_line_diffs: lineDiffs.slice(0, 25) };
  }
  if (job === "odds_api_board_backfill") {
    // NBA DFS + sportsbook prop-board backfill from The Odds API historical endpoints into nba_market.board_snapshots.
    // extra: { start, end (YYYY-MM-DD, Pacific game dates), snapshots: ["window","close"], window_pt: "14:45", close_minus_min: 30,
    //          markets: comma list (default NBA_MARKETS), regions: "us_dfs,us", max_events: N (test cap), key_name: "odds_api_key_nba" }
    // Cost: 10 credits x markets x regions per event-snapshot. Resumable: board_backfill_log skips done (event, label).
    const NBA_MARKETS = "player_points,player_rebounds,player_assists,player_threes,player_blocks,player_steals,player_turnovers,player_points_rebounds_assists,player_points_rebounds,player_points_assists,player_rebounds_assists,player_blocks_steals,player_double_double,player_points_alternate,player_rebounds_alternate,player_assists_alternate,player_threes_alternate,player_points_rebounds_assists_alternate,player_points_rebounds_alternate,player_points_assists_alternate,player_rebounds_assists_alternate";
    const start = String((extra && extra.start) || "").trim(); const end = String((extra && extra.end) || start).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return { ok: false, error: "extra.start (YYYY-MM-DD) required" };
    const markets = String((extra && extra.markets) || NBA_MARKETS); const regions = String((extra && extra.regions) || "us_dfs,us");
    const labels = (extra && extra.snapshots) || ["window", "close"]; const windowPt = String((extra && extra.window_pt) || "14:45");
    const closeMinus = Number((extra && extra.close_minus_min) || 30); const maxEvents = Number((extra && extra.max_events) || 0);
    const keyName = String((extra && extra.key_name) || "odds_api_key_nba");
    const nMarkets = markets.split(",").filter(Boolean).length, nRegions = regions.split(",").filter(Boolean).length;
    const sqlp = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false });
    try {
      const kr = await sqlp`SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = ${keyName} LIMIT 1`;
      const key = kr && kr[0] ? String(kr[0].credential_value_encrypted).trim() : ""; if (!key) return { ok: false, error: `no credential ${keyName}` };
      const base = "https://api.the-odds-api.com/v4";
      // Pacific offset per date (PDT -07 until early Nov, PST -08 after; DST boundaries approximated by month/day)
      const ptOffset = (ds) => { const [y, m, d] = ds.split("-").map(Number); const dst = (m > 3 && m < 11) || (m === 3 && d >= 9) || (m === 11 && d < 2); return dst ? 7 : 8; };
      const out = { dates: 0, events: 0, snapshots_done: 0, rows: 0, credits_est: 0, skipped: 0, errors: [] };
      for (let d = new Date(start + "T00:00:00Z"); d <= new Date(end + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
        const ds = d.toISOString().slice(0, 10); out.dates += 1; const off = ptOffset(ds);
        // events as of 09:00 PT that day (games whose commence_time falls on this Pacific date)
        const listTs = `${ds}T${String(9 + off).padStart(2, "0")}:00:00Z`;
        let events = [];
        try {
          const er = await fetch(`${base}/historical/sports/basketball_nba/events?date=${listTs}&apiKey=${key}`); const ej = await er.json();
          if (!er.ok) { out.errors.push({ date: ds, stage: "events", status: er.status, body: JSON.stringify(ej).slice(0, 200) }); continue; }
          events = (ej.data || []).filter((e) => { const ct = new Date(e.commence_time); const local = new Date(ct.getTime() - off * 3600e3); return local.toISOString().slice(0, 10) === ds; });
        } catch (e) { out.errors.push({ date: ds, stage: "events", error: String(e) }); continue; }
        for (const ev of events) {
          if (maxEvents && out.events >= maxEvents) break;
          out.events += 1;
          for (const label of labels) {
            const done = await sqlp`SELECT 1 FROM nba_market.board_backfill_log WHERE event_id = ${ev.id} AND snapshot_label = ${label} AND status = 'ok'`;
            if (done.length) { out.skipped += 1; continue; }
            let reqTs;
            if (label === "close") reqTs = new Date(new Date(ev.commence_time).getTime() - closeMinus * 60e3).toISOString().slice(0, 19) + "Z";
            else { const [hh, mm] = windowPt.split(":").map(Number); reqTs = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh + off, mm)).toISOString().slice(0, 19) + "Z"; }
            try {
              const r = await fetch(`${base}/historical/sports/basketball_nba/events/${ev.id}/odds?date=${reqTs}&regions=${regions}&markets=${markets}&oddsFormat=american&includeMultipliers=true&apiKey=${key}`);
              const j = await r.json();
              if (!r.ok) { await sqlp`INSERT INTO nba_market.board_backfill_log (event_id, snapshot_label, status, rows, credits_used, requested_ts, error) VALUES (${ev.id}, ${label}, 'error', 0, 0, ${reqTs}, ${JSON.stringify(j).slice(0, 300)}) ON CONFLICT (event_id, snapshot_label) DO UPDATE SET status='error', error=EXCLUDED.error, done_at=now()`; out.errors.push({ event: ev.id, label, status: r.status, body: JSON.stringify(j).slice(0, 200) }); continue; }
              const snapTs = j.timestamp; let n = 0;
              for (const bk of (j.data && j.data.bookmakers) || []) for (const mk of bk.markets || []) for (const oc of mk.outcomes || []) {
                await sqlp`INSERT INTO nba_market.board_snapshots (game_date, event_id, snapshot_label, snapshot_ts, bookmaker, market_key, player, side, line, price, multiplier, home_team, away_team, commence_time)
                  VALUES (${ds}, ${ev.id}, ${label}, ${snapTs}, ${bk.key}, ${mk.key}, ${oc.description || oc.name}, ${oc.name}, ${oc.point ?? -1}, ${oc.price ?? null}, ${oc.multiplier ?? null}, ${ev.home_team}, ${ev.away_team}, ${ev.commence_time})
                  ON CONFLICT (event_id, snapshot_label, bookmaker, market_key, player, side, line) DO UPDATE SET price = EXCLUDED.price, multiplier = EXCLUDED.multiplier, snapshot_ts = EXCLUDED.snapshot_ts, fetched_at = now()`;
                n += 1;
              }
              const credits = 10 * nMarkets * nRegions; out.credits_est += credits; out.rows += n; out.snapshots_done += 1;
              await sqlp`INSERT INTO nba_market.board_backfill_log (event_id, snapshot_label, status, rows, credits_used, requested_ts, snapshot_ts) VALUES (${ev.id}, ${label}, 'ok', ${n}, ${credits}, ${reqTs}, ${snapTs}) ON CONFLICT (event_id, snapshot_label) DO UPDATE SET status='ok', rows=EXCLUDED.rows, credits_used=EXCLUDED.credits_used, snapshot_ts=EXCLUDED.snapshot_ts, error=NULL, done_at=now()`;
            } catch (e) { out.errors.push({ event: ev.id, label, error: String(e && e.message ? e.message : e) }); }
          }
        }
        if (maxEvents && out.events >= maxEvents) break;
      }
      return { ok: true, start, end, markets: nMarkets, regions: nRegions, credits_per_snapshot: 10 * nMarkets * nRegions, ...out, errors: out.errors.slice(0, 15) };
    } finally { await sqlp.end({ timeout: 5 }); }
  }
  if (job === "parlay_game_lines_backfill") {
    // Backfill NBA (or any sport) closing game lines from ParlayAPI's archive into nba_market.game_lines_closing.
    // extra: { sport_key, start (YYYY-MM-DD), end (YYYY-MM-DD) } - one closing-odds call per date (10 credits), all books.
    // Chunk by month per call (the worker's wall-time budget); the caller loops months.
    const sport = String((extra && extra.sport_key) || "basketball_nba");
    const start = String((extra && extra.start) || "").trim(); const end = String((extra && extra.end) || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return { ok: false, error: "extra.start and extra.end (YYYY-MM-DD) required" };
    let key = "";
    const sqlp = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false });
    try {
      const r = await sqlp`SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = 'parlay_api_key' LIMIT 1`;
      key = r && r[0] ? String(r[0].credential_value_encrypted).trim() : (env.PARLAY_API_KEY || "");
      if (!key) return { ok: false, error: "no parlay key" };
      const base = String(env.PARLAY_API_BASE_URL || "https://parlay-api.com/v1").replace(/\/+$/, "");
      const out = { dates: 0, dates_with_rows: 0, rows: 0, errors: [] };
      for (let d = new Date(start + "T00:00:00Z"); d <= new Date(end + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
        const ds = d.toISOString().slice(0, 10); out.dates += 1;
        try {
          const resp = await fetch(`${base}/historical/sports/${sport}/closing-odds?markets=spreads,totals,h2h&date=${ds}`, { headers: { "X-API-Key": key, accept: "application/json" } });
          const rows = await resp.json();
          if (!resp.ok || !Array.isArray(rows)) { out.errors.push({ date: ds, status: resp.status, body: JSON.stringify(rows).slice(0, 200) }); continue; }
          if (!rows.length) continue;
          out.dates_with_rows += 1;
          for (const r0 of rows) {
            if (!r0.canonical_event_id || !r0.bookmaker) continue;
            await sqlp`INSERT INTO nba_market.game_lines_closing (game_date, canonical_event_id, bookmaker, home_team, away_team, season, home_odds, away_odds, total_line, over_odds, under_odds, home_spread, home_spread_odds, away_spread_odds, home_score, away_score)
              VALUES (${r0.game_date}, ${r0.canonical_event_id}, ${r0.bookmaker}, ${r0.home_team || null}, ${r0.away_team || null}, ${r0.season || null}, ${r0.home_odds ?? null}, ${r0.away_odds ?? null}, ${r0.total_line ?? null}, ${r0.over_odds ?? null}, ${r0.under_odds ?? null}, ${r0.home_spread ?? null}, ${r0.home_spread_odds ?? null}, ${r0.away_spread_odds ?? null}, ${r0.home_score ?? null}, ${r0.away_score ?? null})
              ON CONFLICT (game_date, canonical_event_id, bookmaker) DO UPDATE SET home_odds = EXCLUDED.home_odds, away_odds = EXCLUDED.away_odds, total_line = EXCLUDED.total_line, over_odds = EXCLUDED.over_odds, under_odds = EXCLUDED.under_odds, home_spread = EXCLUDED.home_spread, home_spread_odds = EXCLUDED.home_spread_odds, away_spread_odds = EXCLUDED.away_spread_odds, home_score = EXCLUDED.home_score, away_score = EXCLUDED.away_score, fetched_at = now()`;
            out.rows += 1;
          }
        } catch (e) { out.errors.push({ date: ds, error: String(e && e.message ? e.message : e) }); }
      }
      return { ok: true, sport, start, end, ...out, errors: out.errors.slice(0, 20) };
    } finally { await sqlp.end({ timeout: 5 }); }
  }
  if (job === "market_source_probe_raw") {
    // Real diagnostic: direct, raw fetch against a market/odds provider using this worker's
    // already-bound real credentials (ODDS_API_KEY / PARLAY_API_KEY), bypassing all pipeline
    // parsing/staging logic entirely. Used to compare providers' real, live game-level and
    // player-prop-level coverage before deciding which one the Market phase should mine from.
    const provider = String((extra && extra.provider) || "parlay").toLowerCase();
    const path = String((extra && extra.path) || "").trim();
    if (!path) return { ok: false, error: "extra.path is required, e.g. '/sports/baseball_mlb/odds?regions=us&markets=h2h'" };
    let baseUrl, headers;
    if (provider === "parlay") {
      // Key precedence: extra.api_key (explicit override, e.g. a freshly issued key not yet deployed as a secret) >
      // nba_config.external_credentials 'parlay_api_key' (Postgres) > the worker secret PARLAY_API_KEY.
      let parlayKey = String((extra && extra.api_key) || "").trim();
      if (!parlayKey && env.HYPERDRIVE) {
        try {
          const sqlp = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false });
          const r = await sqlp`SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = 'parlay_api_key' LIMIT 1`;
          if (r && r[0] && r[0].credential_value_encrypted) parlayKey = String(r[0].credential_value_encrypted).trim();
          await sqlp.end({ timeout: 5 });
        } catch (e) { /* fall through to the worker secret */ }
      }
      if (!parlayKey) parlayKey = env.PARLAY_API_KEY;
      if (!parlayKey) return { ok: false, error: "PARLAY_API_KEY not present on this worker's environment." };
      baseUrl = String((extra && extra.base_url) || env.PARLAY_API_BASE_URL || "https://parlay-api.com/v1").replace(/\/+$/, "");
      headers = { "X-API-Key": parlayKey, "accept": "application/json" };
    } else if (provider === "oddsapi") {
      let oddsKey = String((extra && extra.api_key) || "").trim();
      // Key selection by name: extra.key_name (default 'odds_api_key' = the FREE key, 500 credits, MLB/general).
      // NBA historical pulls use 'odds_api_key_nba' (paid plan) - kept separate per owner (2026-09-10).
      const keyName = String((extra && extra.key_name) || "odds_api_key");
      if (!oddsKey && env.HYPERDRIVE) {
        try {
          const sqlp = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false });
          const r = await sqlp`SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = ${keyName} LIMIT 1`;
          if (r && r[0] && r[0].credential_value_encrypted) oddsKey = String(r[0].credential_value_encrypted).trim();
          await sqlp.end({ timeout: 5 });
        } catch (e) { /* fall through */ }
      }
      if (!oddsKey) oddsKey = env.ODDS_API_KEY;
      if (!oddsKey) return { ok: false, error: "ODDS_API_KEY not present on this worker's environment." };
      baseUrl = String((extra && extra.base_url) || env.ODDS_API_BASE_URL || "https://api.the-odds-api.com/v4").replace(/\/+$/, "");
      const sep = path.includes("?") ? "&" : "?";
      headers = { "accept": "application/json" };
      // OddsAPI uses an apiKey query param rather than a header.
      const fullUrl = `${baseUrl}${path}${sep}apiKey=${encodeURIComponent(oddsKey)}`;
      try {
        const resp = await fetch(fullUrl, { method: "GET", headers });
        const text = await resp.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        return { ok: resp.ok, http_status: resp.status, provider, path, body_preview: json ? JSON.stringify(json).slice(0, 6000) : text.slice(0, 3000), array_length: Array.isArray(json) ? json.length : null };
      } catch (err) {
        return { ok: false, error: String(err && err.message ? err.message : err) };
      }
    } else if (provider === "oddspapi") {
      const credRow = await env.CONFIG_DB.prepare("SELECT password FROM config_external_credentials WHERE credential_key='oddspapi_api_key'").first();
      const apiKey = credRow && credRow.password;
      if (!apiKey) return { ok: false, error: "oddspapi_api_key not present in CONFIG_DB.config_external_credentials." };
      baseUrl = "https://api.oddspapi.io/v4";
      const sep = path.includes("?") ? "&" : "?";
      const fullUrl = `${baseUrl}${path}${sep}apiKey=${encodeURIComponent(apiKey)}`;
      try {
        const resp = await fetch(fullUrl, { method: "GET", headers: { "accept": "application/json" } });
        const text = await resp.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        const headerDump = {};
        for (const [k, v] of resp.headers.entries()) headerDump[k] = v;
        // Optional summary: value counts of one or more fields across an array response (e.g. bookmaker, market_key)
        let summary = null;
        const fields = extra && extra.summarize_fields ? String(extra.summarize_fields).split(",").map((s) => s.trim()).filter(Boolean) : [];
        if (Array.isArray(json) && fields.length) {
          summary = {};
          for (const f of fields) {
            const counts = {};
            for (const row of json) { const v = row && typeof row === "object" ? row[f] : undefined; const k = v === undefined ? "<missing>" : String(v); counts[k] = (counts[k] || 0) + 1; }
            summary[f] = counts;
          }
          if (extra.filter_field && extra.filter_value) summary.sample = json.filter((r) => r && String(r[extra.filter_field]) === String(extra.filter_value)).slice(0, 5);
        }
        return { ok: resp.ok, http_status: resp.status, provider, path, body_preview: json ? JSON.stringify(json).slice(0, summary ? 500 : 6000) : text.slice(0, 3000), full_body: extra && extra.full_body ? (json || text) : undefined, array_length: Array.isArray(json) ? json.length : null, summary, headers: extra && extra.no_headers ? undefined : headerDump };
      } catch (err) {
        return { ok: false, error: String(err && err.message ? err.message : err) };
      }
    } else {
      return { ok: false, error: "extra.provider must be 'parlay', 'oddsapi', or 'oddspapi'" };
    }
    const fullUrl = `${baseUrl}${path}`;
    try {
      const resp = await fetch(fullUrl, { method: "GET", headers });
      const text = await resp.text();
      let json = null;
      try { json = JSON.parse(text); } catch (_) {}
      const headerDump = {};
      for (const [k, v] of resp.headers.entries()) headerDump[k] = v;
      return { ok: resp.ok, http_status: resp.status, provider, path, body_preview: json ? JSON.stringify(json).slice(0, 6000) : text.slice(0, 3000), array_length: Array.isArray(json) ? json.length : null, headers: headerDump };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  }
  if (job === "worker_invocation_logs") {
    // Real diagnostic: Cloudflare's GraphQL Analytics API (workersInvocationsAdaptive dataset)
    // records the actual outcome of every Worker invocation - including exceededCpu, canceled,
    // exception, scriptNotFound - which lets us confirm or rule out a platform-level kill during
    // the daily-context-full-run freezes, instead of inferring it from silence alone.
    const token = env.CLOUDFLARE_API_TOKEN;
    const accountId = env.CLOUDFLARE_ACCOUNT_ID;
    if (!token || !accountId) {
      return { ok: false, error: "CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID not present on this worker's environment yet." };
    }
    const scriptName = (extra && extra.script_name) || "alphadog-v2-orchestrator";
    const minutesBack = Number((extra && extra.minutes_back) || 30);
    const limit = Number((extra && extra.limit) || 100);
    const now = new Date();
    const start = new Date(now.getTime() - minutesBack * 60000);
    const query = `
      query WorkerLogs($accountTag: string!, $scriptName: string!, $start: Time!, $end: Time!, $limit: Int!) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            workersInvocationsAdaptive(
              limit: $limit,
              filter: { scriptName: $scriptName, datetime_geq: $start, datetime_leq: $end }
              orderBy: [datetime_DESC]
            ) {
              dimensions {
                datetime
                scriptName
                status
              }
              sum {
                requests
                errors
              }
              quantiles {
                cpuTimeP50
                cpuTimeP99
              }
            }
          }
        }
      }`;
    const variables = { accountTag: accountId, scriptName, start: start.toISOString(), end: now.toISOString(), limit };
    try {
      const resp = await fetch("https://api.cloudflare.com/client/v4/graphql", {
        method: "POST",
        headers: { "authorization": `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ query, variables })
      });
      const text = await resp.text();
      let json = null;
      try { json = JSON.parse(text); } catch (_) {}
      if (!resp.ok) return { ok: false, http_status: resp.status, body: text.slice(0, 2000) };
      const rows = json?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive || null;
      return { ok: true, script_name: scriptName, window_start: start.toISOString(), window_end: now.toISOString(), row_count: rows ? rows.length : 0, rows, raw_errors: json?.errors || null };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  }
  if (job === "direct_worker_probe") {
    // TEMPORARY diagnostic - direct fetch to a worker's public workers.dev URL, bypassing
    // the orchestrator's queue/dedup entirely, to isolate whether a stall is inside the
    // worker itself or inside the orchestrator's dispatch/response-handling.
    const url2 = extra && extra.url;
    if (!url2) return { ok: false, error: "Missing extra.url" };
    const method = (extra && extra.method) || "GET";
    const body = extra && extra.body;
    const started = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort("probe_timeout"), Number(extra.timeout_ms || 40000));
      const resp = await fetch(url2, { method, headers: { "content-type": "application/json" }, body, signal: controller.signal });
      clearTimeout(timer);
      const text = await resp.text();
      return { ok: resp.ok, http_status: resp.status, elapsed_ms: Date.now() - started, body: text.slice(0, 3000) };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err), elapsed_ms: Date.now() - started };
    }
  }
  const bindingMap = { CONTROL_ROOM: env.CONTROL_ROOM, PHASE3A_WORKER: env.PHASE3A_WORKER, ORCHESTRATOR_WORKER: env.ORCHESTRATOR_WORKER, BASE_HITTER_GAME_LOGS_WORKER: env.BASE_HITTER_GAME_LOGS_WORKER, BOARD_RUNNER_WORKER: env.BOARD_RUNNER_WORKER, DAILY_CONTEXT_RUNNER_WORKER: env.DAILY_CONTEXT_RUNNER_WORKER, MARKET_RUNNER_WORKER: env.MARKET_RUNNER_WORKER, SCORING_RUNNER_WORKER: env.SCORING_RUNNER_WORKER, MASTER_RUNNER_WORKER: env.MASTER_RUNNER_WORKER, SCORE_PREP_WORKER: env.SCORE_PREP_WORKER, WEEKLY_DIFFERENTIAL_RUNNER_WORKER: env.WEEKLY_DIFFERENTIAL_RUNNER_WORKER, DAILY_DELTA_RUNNER_WORKER: env.DAILY_DELTA_RUNNER_WORKER, NBA_STATIC_TEAMS_WORKER: env.NBA_STATIC_TEAMS_WORKER, NBA_STATIC_PLAYERS_WORKER: env.NBA_STATIC_PLAYERS_WORKER, NBA_STATIC_ARENAS_WORKER: env.NBA_STATIC_ARENAS_WORKER, NBA_STATIC_OFFICIALS_WORKER: env.NBA_STATIC_OFFICIALS_WORKER, NBA_STATIC_PLAYER_BIO_WORKER: env.NBA_STATIC_PLAYER_BIO_WORKER, NBA_STATIC_PLAYER_TRACKING_WORKER: env.NBA_STATIC_PLAYER_TRACKING_WORKER, NBA_STATIC_TEAM_STATS_WORKER: env.NBA_STATIC_TEAM_STATS_WORKER, NBA_STATIC_ONOFF_WORKER: env.NBA_STATIC_ONOFF_WORKER, NBA_STATIC_DARKO_WORKER: env.NBA_STATIC_DARKO_WORKER, NBA_STATIC_WEEKLY_DIFFERENTIAL_WORKER: env.NBA_STATIC_WEEKLY_DIFFERENTIAL_WORKER, NBA_STATIC_SCHEDULE_WORKER: env.NBA_STATIC_SCHEDULE_WORKER, NBA_STATIC_PLAYTYPES_WORKER: env.NBA_STATIC_PLAYTYPES_WORKER, NBA_STATIC_TRACKING_DETAIL_WORKER: env.NBA_STATIC_TRACKING_DETAIL_WORKER, NBA_STATIC_SHOTQUALITY_WORKER: env.NBA_STATIC_SHOTQUALITY_WORKER, NBA_STATIC_BACKFILL_WORKER: env.NBA_STATIC_BACKFILL_WORKER, NBA_STATIC_STARTER_STATUS_WORKER: env.NBA_STATIC_STARTER_STATUS_WORKER, NBA_STATIC_GAME_OFFICIALS_WORKER: env.NBA_STATIC_GAME_OFFICIALS_WORKER, NBA_STATIC_LINEUPS_WORKER: env.NBA_STATIC_LINEUPS_WORKER, NBA_DAILY_DELTA_WORKER: env.NBA_DAILY_DELTA_WORKER, NBA_STATIC_MEASURE_TYPES_WORKER: env.NBA_STATIC_MEASURE_TYPES_WORKER, NBA_BASELINE_LADDER_WORKER: env.NBA_BASELINE_LADDER_WORKER };
  const bindingName = target && bindingMap[target] !== undefined ? target : "CONTROL_ROOM";
  const binding = bindingMap[bindingName];
  if (!binding) {
    return { ok: false, error: `${bindingName} service binding is not configured on this worker.` };
  }

  let body, path;
  if (bindingName === "PHASE3A_WORKER") {
    body = { mode: job, ...(extra && typeof extra === "object" ? extra : {}) };
    path = "https://internal/run";
  } else if (bindingName === "ORCHESTRATOR_WORKER") {
    body = { max_jobs: 5, ...(extra && typeof extra === "object" ? extra : {}) };
    path = "https://internal/tick";
  } else if (bindingName === "BASE_HITTER_GAME_LOGS_WORKER") {
    // Direct call, bypasses control_job_queue + orchestrator entirely - no shared lock
    // contention with other real production jobs. For one-time base/mining workers only;
    // delta_update-style periodic jobs should keep going through the orchestrator.
    body = { mode: job, ...(extra && typeof extra === "object" ? extra : {}) };
    path = "https://internal/run";
  } else if (bindingName === "BOARD_RUNNER_WORKER") {
    // Direct, on-demand call to the new standalone board-full-run worker's /run endpoint.
    // No queue table, no lock table involved - triggers the exact same code path its own
    // cron trigger calls, just synchronously and on demand instead of waiting for a schedule.
    body = { ...(extra && typeof extra === "object" ? extra : {}) };
    path = "https://internal.board-runner/run";
  } else if (bindingName === "DAILY_CONTEXT_RUNNER_WORKER") {
    // Same pattern as BOARD_RUNNER_WORKER, for the new standalone daily-context-full-run worker.
    body = { ...(extra && typeof extra === "object" ? extra : {}) };
    path = "https://internal.daily-context-runner/run";
  } else if (bindingName === "MARKET_RUNNER_WORKER") {
    // Same pattern, for the new standalone market-full-run worker.
    body = { ...(extra && typeof extra === "object" ? extra : {}) };
    path = "https://internal.market-runner/run";
  } else if (bindingName === "SCORING_RUNNER_WORKER") {
    // Same pattern, for the new standalone scoring-full-run worker.
    body = { ...(extra && typeof extra === "object" ? extra : {}) };
    path = "https://internal.scoring-runner/run";
  } else if (bindingName === "MASTER_RUNNER_WORKER") {
    // Same pattern, for the new master runner chaining all four full-runs in sequence.
    body = { ...(extra && typeof extra === "object" ? extra : {}) };
    path = "https://internal.master-runner/run";
  } else if (bindingName === "SCORE_PREP_WORKER") {
    // Direct debug call to score-prep to see its full raw response.
    body = { ...(extra && typeof extra === "object" ? extra : {}) };
    path = "https://internal.score-prep/run";
  } else if (bindingName === "WEEKLY_DIFFERENTIAL_RUNNER_WORKER") {
    body = { ...(extra && typeof extra === "object" ? extra : {}) };
    path = "https://internal.weekly-differential-runner/run";
  } else if (bindingName === "DAILY_DELTA_RUNNER_WORKER") {
    body = { ...(extra && typeof extra === "object" ? extra : {}) };
    path = "https://internal.daily-delta-runner/run";
  } else if (bindingName === "NBA_STATIC_TEAMS_WORKER" || bindingName === "NBA_STATIC_PLAYERS_WORKER" || bindingName === "NBA_STATIC_ARENAS_WORKER" || bindingName === "NBA_STATIC_OFFICIALS_WORKER" || bindingName === "NBA_STATIC_PLAYER_BIO_WORKER" || bindingName === "NBA_STATIC_PLAYER_TRACKING_WORKER" || bindingName === "NBA_STATIC_TEAM_STATS_WORKER" || bindingName === "NBA_STATIC_ONOFF_WORKER" || bindingName === "NBA_STATIC_DARKO_WORKER" || bindingName === "NBA_STATIC_WEEKLY_DIFFERENTIAL_WORKER" || bindingName === "NBA_STATIC_SCHEDULE_WORKER" || bindingName === "NBA_STATIC_PLAYTYPES_WORKER" || bindingName === "NBA_STATIC_TRACKING_DETAIL_WORKER" || bindingName === "NBA_STATIC_SHOTQUALITY_WORKER" || bindingName === "NBA_STATIC_BACKFILL_WORKER" || bindingName === "NBA_STATIC_STARTER_STATUS_WORKER" || bindingName === "NBA_STATIC_GAME_OFFICIALS_WORKER" || bindingName === "NBA_STATIC_LINEUPS_WORKER" || bindingName === "NBA_DAILY_DELTA_WORKER" || bindingName === "NBA_STATIC_MEASURE_TYPES_WORKER" || bindingName === "NBA_BASELINE_LADDER_WORKER") {
    // NBA expansion (additive only). Same direct-call pattern as BASE_HITTER_GAME_LOGS_WORKER -
    // bypasses control_job_queue + orchestrator entirely (NBA has no orchestrator by design).
    if (job === "probe-sources") {
      body = null;
      path = "https://internal/probe-sources";
    } else {
      body = { ...(extra && typeof extra === "object" ? extra : {}) };
      path = "https://internal/run";
    }
  } else {
    body = {
      job,
      slate_mode: "AUTO_BY_GAME_DATE_TIME",
      backend_only: true,
      source: "claude_mcp_bridge",
      ...(extra && typeof extra === "object" ? extra : {})
    };
    path = "https://internal/tasks/run";
  }

  try {
    const method = body === null ? "GET" : "POST";
    const fetchOpts = method === "GET"
      ? { method: "GET" }
      : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
    const resp = await binding.fetch(path, fetchOpts);
    const text = await resp.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { ok: resp.ok, http_status: resp.status, response: parsed };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

async function toolGithubPatchFile(env, args) {
  const { path, old_str, new_str, message } = args || {};
  if (!path || old_str === undefined || new_str === undefined) {
    return { ok: false, error: "Missing path, old_str, or new_str." };
  }
  const current = await toolGithubGetFile(env, { path });
  if (!current.ok) return { ok: false, error: "Could not read current file.", details: current };

  const content = current.content || "";
  const occurrences = content.split(old_str).length - 1;
  if (occurrences === 0) {
    return { ok: false, error: "old_str not found in file. No changes made." };
  }
  if (occurrences > 1) {
    return { ok: false, error: `old_str matches ${occurrences} times, must be unique. No changes made.` };
  }

  const updatedContent = content.replace(old_str, new_str);
  return await toolGithubPutFile(env, {
    path,
    content: updatedContent,
    message: message || `Patch ${path} via Claude MCP bridge (server-side find/replace)`,
    sha: current.sha
  });
}

async function toolGithubGrepFile(env, args) {
  const { path, pattern, context_lines, max_matches } = args || {};
  if (!path || !pattern) return { ok: false, error: "Missing path or pattern." };
  const current = await toolGithubGetFile(env, { path });
  if (!current.ok) return { ok: false, error: "Could not read file.", details: current };
  if (!current.content) return { ok: false, error: "File has no content or is empty." };

  const lines = current.content.split("\n");
  const ctx = Math.max(0, Number(context_lines) || 3);
  const maxMatches = Math.max(1, Math.min(Number(max_matches) || 20, 50));

  let regex;
  try { regex = new RegExp(pattern); } catch (e) { return { ok: false, error: `Invalid regex pattern: ${e.message}` }; }

  const matches = [];
  for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
    if (regex.test(lines[i])) {
      const start = Math.max(0, i - ctx);
      const end = Math.min(lines.length, i + ctx + 1);
      matches.push({
        matched_line_number: i + 1,
        snippet: lines.slice(start, end).map((l, idx) => `${start + idx + 1}: ${l}`).join("\n")
      });
    }
  }

  return {
    ok: true,
    path,
    file_size: current.size,
    total_lines: lines.length,
    pattern,
    match_count: matches.length,
    truncated_at_max_matches: matches.length >= maxMatches,
    matches
  };
}

async function toolCheckBindings(env) {
  return {
    ok: true,
    db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS),
    vars_present: varPresence(env, EXPECTED_VARS),
    secrets_present_only: varPresence(env, REQUIRED_SECRETS),
    control_room_service_binding_present: Boolean(env.CONTROL_ROOM)
  };
}

// ---- GitHub file read/write, using the GITHUB_TOKEN secret already on this worker ----

function b64EncodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function b64DecodeUtf8(b64) {
  const binary = atob(String(b64 || "").replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function encodeRepoPath(path) {
  return String(path || "").split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

async function githubRequest(env, method, path, body) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
    return { ok: false, status: 0, data: { error: "GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO not configured on this worker." } };
  }
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}${path}`;
  const resp = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "Alphadog-MCP-Bridge",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await resp.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: resp.status, ok: resp.ok, data: parsed };
}

const BINARY_FILE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".pdf", ".zip", ".gz", ".woff", ".woff2", ".ttf", ".mp4", ".mp3"]);
function isBinaryPath(path) {
  const p = String(path || "").toLowerCase();
  const dot = p.lastIndexOf(".");
  if (dot === -1) return false;
  return BINARY_FILE_EXTENSIONS.has(p.slice(dot));
}
async function toolGithubGetFile(env, args) {
  const { path } = args || {};
  if (!path) return { ok: false, error: "Missing path." };
  const branch = env.GITHUB_BRANCH || "main";
  const r = await githubRequest(env, "GET", `/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(branch)}`);
  if (!r.ok) return { ok: false, status: r.status, error: r.data };
  if (Array.isArray(r.data)) return { ok: false, error: "That path is a directory, not a file. Use github_list_dir instead." };
  const binary = isBinaryPath(path);

  // Contents API caps out around 1MB and returns content:null for larger files.
  // Fall back to the Git Blobs API, which supports much larger files, using the sha we already have.
  if (!r.data.content && r.data.sha) {
    const blob = await githubRequest(env, "GET", `/git/blobs/${r.data.sha}`);
    if (!blob.ok) return { ok: false, status: blob.status, error: blob.data, note: "Contents API returned null content and Blobs API fallback also failed." };
    const rawB64 = blob.data.content ? String(blob.data.content).replace(/\n/g, "") : null;
    const content = binary ? rawB64 : (rawB64 ? b64DecodeUtf8(rawB64) : null);
    return { ok: true, path, sha: r.data.sha, size: r.data.size, content, encoding: binary ? "base64" : "utf8", fetched_via: "git_blobs_api_fallback" };
  }

  const rawB64 = r.data.content ? String(r.data.content).replace(/\n/g, "") : null;
  const content = binary ? rawB64 : (rawB64 ? b64DecodeUtf8(rawB64) : null);
  return { ok: true, path, sha: r.data.sha, size: r.data.size, content, encoding: binary ? "base64" : "utf8" };
}

async function toolGithubPutFileViaGitDataApi(env, args) {
  const { path, content, message } = args;
  const branch = env.GITHUB_BRANCH || "main";

  const refResp = await githubRequest(env, "GET", `/git/refs/heads/${encodeURIComponent(branch)}`);
  if (!refResp.ok) return { ok: false, status: refResp.status, error: refResp.data, stage: "get_ref" };
  const commitSha = refResp.data.object.sha;

  const commitResp = await githubRequest(env, "GET", `/git/commits/${commitSha}`);
  if (!commitResp.ok) return { ok: false, status: commitResp.status, error: commitResp.data, stage: "get_commit" };
  const baseTreeSha = commitResp.data.tree.sha;

  const blobResp = await githubRequest(env, "POST", `/git/blobs`, { content: b64EncodeUtf8(content), encoding: "base64" });
  if (!blobResp.ok) return { ok: false, status: blobResp.status, error: blobResp.data, stage: "create_blob" };
  const blobSha = blobResp.data.sha;

  const treeResp = await githubRequest(env, "POST", `/git/trees`, {
    base_tree: baseTreeSha,
    tree: [{ path, mode: "100644", type: "blob", sha: blobSha }]
  });
  if (!treeResp.ok) return { ok: false, status: treeResp.status, error: treeResp.data, stage: "create_tree" };
  const newTreeSha = treeResp.data.sha;

  const newCommitResp = await githubRequest(env, "POST", `/git/commits`, {
    message: message || `Update ${path} via Claude MCP bridge (large file, Git Data API)`,
    tree: newTreeSha,
    parents: [commitSha]
  });
  if (!newCommitResp.ok) return { ok: false, status: newCommitResp.status, error: newCommitResp.data, stage: "create_commit" };
  const newCommitSha = newCommitResp.data.sha;

  const updateRefResp = await githubRequest(env, "PATCH", `/git/refs/heads/${encodeURIComponent(branch)}`, { sha: newCommitSha });
  if (!updateRefResp.ok) return { ok: false, status: updateRefResp.status, error: updateRefResp.data, stage: "update_ref" };

  return {
    ok: true,
    status: 200,
    commit_sha: newCommitSha,
    file_sha: blobSha,
    note: "Pushed via Git Data API (large file path). Your existing GitHub Actions auto-deploy will now run.",
    fetched_via: "git_data_api"
  };
}

async function toolGithubPutFile(env, args) {
  const { path, content, message, sha } = args || {};
  if (!path || content === undefined) return { ok: false, error: "Missing path or content." };

  // Contents API has roughly the same ~1MB practical ceiling on both read and write.
  // Above that, use the Git Data API (blob -> tree -> commit -> ref) instead.
  if (content.length > 900000) {
    return await toolGithubPutFileViaGitDataApi(env, { path, content, message });
  }

  const branch = env.GITHUB_BRANCH || "main";

  let existingSha = sha;
  if (!existingSha) {
    const existing = await githubRequest(env, "GET", `/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(branch)}`);
    if (existing.ok && existing.data && existing.data.sha) existingSha = existing.data.sha;
  }

  const body = {
    message: message || `Update ${path} via Claude MCP bridge`,
    content: b64EncodeUtf8(content),
    branch
  };
  if (existingSha) body.sha = existingSha;

  const r = await githubRequest(env, "PUT", `/contents/${encodeRepoPath(path)}`, body);
  return {
    ok: r.ok,
    status: r.status,
    commit_sha: r.data && r.data.commit ? r.data.commit.sha : null,
    file_sha: r.data && r.data.content ? r.data.content.sha : null,
    note: r.ok ? "Pushed to branch. Your existing GitHub Actions auto-deploy will now run." : null,
    response: r.ok ? undefined : r.data
  };
}

async function toolGithubListDir(env, args) {
  const path = (args && args.path) || "";
  const branch = env.GITHUB_BRANCH || "main";
  const r = await githubRequest(env, "GET", `/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(branch)}`);
  if (!r.ok) return { ok: false, status: r.status, error: r.data };
  const entries = Array.isArray(r.data)
    ? r.data.map((e) => ({ name: e.name, path: e.path, type: e.type, size: e.size }))
    : [{ name: r.data.name, path: r.data.path, type: r.data.type, size: r.data.size }];
  return { ok: true, path: path || "/", entries };
}

async function toolGithubListWorkflowRuns(env, args) {
  const perPage = (args && args.per_page) || 5;
  const r = await githubRequest(env, "GET", `/actions/runs?per_page=${encodeURIComponent(perPage)}`);
  if (!r.ok) return { ok: false, status: r.status, error: r.data };
  const runs = (r.data.workflow_runs || []).map((w) => ({
    id: w.id,
    name: w.name,
    status: w.status,
    conclusion: w.conclusion,
    head_branch: w.head_branch,
    head_sha: w.head_sha,
    created_at: w.created_at,
    html_url: w.html_url
  }));
  return { ok: true, runs };
}

async function toolGithubTriggerWorkflow(env, args) {
  // Generic, reusable workflow-dispatch trigger - works for ANY workflow file in the repo, not
  // just NBA ones. Added 2026-08-31 because this chat had no way to actually press "Run
  // workflow" on a new GitHub Actions workflow (e.g. nba-scrape.yml) - every prior GitHub tool
  // here only reads/writes files or reports run status, none of them can start a run. Uses the
  // same GITHUB_TOKEN already on this worker; requires that token to have `actions: write`
  // (or classic `workflow`) scope - if it doesn't, this returns a 403 from GitHub directly,
  // not a guess.
  const { workflow_file, ref, inputs } = args || {};
  if (!workflow_file || typeof workflow_file !== "string") {
    return { ok: false, error: "Missing workflow_file, e.g. 'nba-scrape.yml' (the file name under .github/workflows/)." };
  }
  const branch = ref || env.GITHUB_BRANCH || "main";
  const body = { ref: branch };
  if (inputs && typeof inputs === "object") body.inputs = inputs;
  const r = await githubRequest(env, "POST", `/actions/workflows/${encodeURIComponent(workflow_file)}/dispatches`, body);
  if (!r.ok) return { ok: false, status: r.status, error: r.data, note: "A 404 usually means the workflow_file name is wrong or has no workflow_dispatch trigger. A 403 usually means GITHUB_TOKEN lacks the actions:write/workflow scope." };
  return { ok: true, status: r.status, workflow_file, ref: branch, note: "Dispatch accepted (GitHub returns no run id synchronously) - check github_list_workflow_runs in a few seconds for the new run." };
}

async function toolGithubGetWorkflowRunLog(env, args) {
  const runId = args && args.run_id;
  if (!runId) return { ok: false, error: "Missing run_id. Get one from github_list_workflow_runs." };

  const jobsResp = await githubRequest(env, "GET", `/actions/runs/${encodeURIComponent(runId)}/jobs`);
  if (!jobsResp.ok) return { ok: false, status: jobsResp.status, error: jobsResp.data };
  const jobs = jobsResp.data.jobs || [];
  if (!jobs.length) return { ok: false, error: "No jobs found for this run_id.", run_id: runId };

  const jobIndex = Number.isInteger(args && args.job_index) ? args.job_index : 0;
  const job = jobs[jobIndex] || jobs[0];

  // GitHub's /logs endpoint 302-redirects to a plain-text blob URL; fetch() follows
  // redirects by default, so githubRequest's existing fetch already lands on the raw text.
  const logResp = await githubRequest(env, "GET", `/actions/jobs/${encodeURIComponent(job.id)}/logs`);
  if (!logResp.ok) {
    return { ok: false, status: logResp.status, error: "Could not fetch log text (link may have expired, or run is too old).", job: { id: job.id, name: job.name, conclusion: job.conclusion } };
  }
  const logText = typeof logResp.data === "string" ? logResp.data : JSON.stringify(logResp.data);
  const allLines = logText.split("\n");

  let selectedLines = allLines;
  const pattern = args && args.grep;
  if (pattern) {
    try {
      const re = new RegExp(pattern, "i");
      const matched = [];
      allLines.forEach((line, i) => {
        if (re.test(line)) matched.push(...allLines.slice(Math.max(0, i - 3), i + 4), "---");
      });
      if (matched.length) selectedLines = matched;
    } catch (_) { /* invalid regex: fall through to tail behavior */ }
  }

  const tailLines = (args && args.tail_lines) || 200;
  const finalLines = selectedLines.slice(-tailLines);

  return {
    ok: true,
    run_id: runId,
    job: {
      id: job.id,
      name: job.name,
      status: job.status,
      conclusion: job.conclusion,
      steps: (job.steps || []).map((s) => ({ name: s.name, status: s.status, conclusion: s.conclusion }))
    },
    total_log_lines: allLines.length,
    returned_lines: finalLines.length,
    grep_applied: pattern || null,
    log_text: finalLines.join("\n")
  };
}

// ---- The actual MCP server, built on Cloudflare's official SDK ----------

export class AlphadogMcp extends McpAgent {
  server = new McpServer({ name: WORKER_NAME, version: VERSION });

  async init() {
    this.server.tool(
      "check_bindings",
      "Report which D1 database bindings, secrets, and vars are present on this bridge worker, without exposing any secret values.",
      {},
      async () => {
        const result = await toolCheckBindings(this.env);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.ok === false
        };
      }
    );

    this.server.tool(
      "run_sql",
      "Run a SQL statement against one of the AlphaDog D1 databases and return the rows. SELECT is always allowed. Writes (INSERT/UPDATE/DELETE/CREATE/DROP/ALTER) require allow_write=true.",
      {
        database: z.enum(REQUIRED_DB_BINDINGS).describe("Which D1 database binding to run against."),
        sql: z.string().describe("The SQL statement to run. One statement at a time."),
        params: z.array(z.any()).optional().describe("Optional positional bind parameters."),
        max_rows: z.number().optional().describe(`Max rows to return (capped at ${HARD_MAX_ROWS}).`),
        allow_write: z.boolean().optional().describe("Must be true to run anything other than a SELECT statement.")
      },
      async (args) => {
        const result = await toolRunSql(this.env, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.ok === false
        };
      }
    );

    this.server.tool(
      "run_sql_postgres",
      "Read-only-by-default query against the new DigitalOcean Postgres database via Hyperdrive (the Postgres migration target). SELECT/WITH always allowed; anything else requires allow_write=true. Use this to check what tables/schemas/rows already exist on Postgres before porting or backfilling a worker, so existing work isn't redone.",
      {
        sql: z.string().describe("The SQL statement to run against Postgres. One statement at a time."),
        params: z.array(z.any()).optional().describe("Optional positional bind parameters ($1, $2, ...)."),
        max_rows: z.number().optional().describe(`Max rows to return (capped at ${HARD_MAX_ROWS}).`),
        allow_write: z.boolean().optional().describe("Must be true to run anything other than a SELECT/WITH statement.")
      },
      async (args) => {
        const result = await toolRunPostgres(this.env, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.ok === false
        };
      }
    );

    this.server.tool(
      "run_job",
      "Enqueue a job on the AlphaDog orchestrator via the Control Room, the same way its dashboard buttons do. Set target='PHASE3A_WORKER' to call the phase3a-first-inning-pitcher-context worker directly instead (useful for testing modes not yet registered in Control Room's job registry). Set target='BASE_HITTER_GAME_LOGS_WORKER' to call alphadog-v2-base-hitter-game-logs directly, bypassing control_job_queue and the shared orchestrator lock entirely - use this for one-time base/mining work; keep delta_update-style periodic jobs on the orchestrator. Set target='NBA_STATIC_TEAMS_WORKER' to call the NBA static-teams worker directly (same direct-call pattern, NBA has no orchestrator by design) - set job='run' and check the response's source_key field to see whether it served from a live stats.nba.com fetch or the certified static fallback. Returns the immediate response, not the finished job result — use run_sql afterward to check status/output tables.",
      {
        job: z.string().describe("The job key (Control Room) or mode string (direct worker call)."),
        extra: z.record(z.any()).optional().describe("Optional extra fields merged into the request body."),
        target: z.enum(["CONTROL_ROOM", "PHASE3A_WORKER", "ORCHESTRATOR_WORKER", "BASE_HITTER_GAME_LOGS_WORKER", "BOARD_RUNNER_WORKER", "DAILY_CONTEXT_RUNNER_WORKER", "MARKET_RUNNER_WORKER", "SCORING_RUNNER_WORKER", "MASTER_RUNNER_WORKER", "SCORE_PREP_WORKER", "WEEKLY_DIFFERENTIAL_RUNNER_WORKER", "DAILY_DELTA_RUNNER_WORKER", "NBA_STATIC_TEAMS_WORKER", "NBA_STATIC_PLAYERS_WORKER", "NBA_STATIC_ARENAS_WORKER", "NBA_STATIC_OFFICIALS_WORKER", "NBA_STATIC_PLAYER_BIO_WORKER", "NBA_STATIC_PLAYER_TRACKING_WORKER", "NBA_STATIC_TEAM_STATS_WORKER", "NBA_STATIC_ONOFF_WORKER", "NBA_STATIC_DARKO_WORKER", "NBA_STATIC_WEEKLY_DIFFERENTIAL_WORKER", "NBA_STATIC_SCHEDULE_WORKER", "NBA_STATIC_PLAYTYPES_WORKER", "NBA_STATIC_TRACKING_DETAIL_WORKER", "NBA_STATIC_SHOTQUALITY_WORKER", "NBA_STATIC_BACKFILL_WORKER", "NBA_STATIC_STARTER_STATUS_WORKER", "NBA_STATIC_GAME_OFFICIALS_WORKER", "NBA_STATIC_LINEUPS_WORKER", "NBA_DAILY_DELTA_WORKER", "NBA_STATIC_MEASURE_TYPES_WORKER", "NBA_BASELINE_LADDER_WORKER"]).optional().describe("Which service to call. Defaults to CONTROL_ROOM.")
      },
      async (args) => {
        const result = await toolRunJob(this.env, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.ok === false
        };
      }
    );

    this.server.tool(
      "github_get_file",
      "Read a file's current content from the repo (branch = GITHUB_BRANCH secret, default 'main').",
      {
        path: z.string().describe("File path within the repo, e.g. 'alphadog-v2-admin-sql.js'.")
      },
      async (args) => {
        const result = await toolGithubGetFile(this.env, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.ok === false
        };
      }
    );

    this.server.tool(
      "github_put_file",
      "Create or update a file in the repo and commit it directly to the branch. This will trigger the existing GitHub Actions auto-deploy workflow, same as a manual commit would.",
      {
        path: z.string().describe("File path within the repo to write."),
        content: z.string().describe("Full new text content of the file."),
        message: z.string().optional().describe("Commit message. Defaults to a generic one if omitted."),
        sha: z.string().optional().describe("Blob sha of the file being replaced, if known. If omitted, it's looked up automatically.")
      },
      async (args) => {
        const result = await toolGithubPutFile(this.env, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.ok === false
        };
      }
    );

    this.server.tool(
      "github_list_dir",
      "List files in a directory of the repo (or the repo root if path is omitted).",
      {
        path: z.string().optional().describe("Directory path within the repo. Omit for repo root.")
      },
      async (args) => {
        const result = await toolGithubListDir(this.env, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.ok === false
        };
      }
    );

    this.server.tool(
      "github_list_workflow_runs",
      "Check the status of recent GitHub Actions workflow runs (deploys), most recent first.",
      {
        per_page: z.number().optional().describe("How many recent runs to return. Defaults to 5.")
      },
      async (args) => {
        const result = await toolGithubListWorkflowRuns(this.env, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.ok === false
        };
      }
    );

    this.server.tool(
      "github_trigger_workflow",
      "Trigger a GitHub Actions workflow_dispatch run for any workflow file in the repo (e.g. 'nba-scrape.yml'). Use this to actually run a scraper/workflow on demand instead of waiting for its schedule - needed repeatedly for NBA source-scraping work since those workflows run on GitHub's own runners (a different network origin than this Worker, which is why some sources like stats.nba.com must be scraped from a workflow rather than fetched directly here). Check github_list_workflow_runs a few seconds after calling this to see the new run and its status.",
      {
        workflow_file: z.string().describe("The workflow file name under .github/workflows/, e.g. 'nba-scrape.yml'."),
        ref: z.string().optional().describe("Branch to run on. Defaults to the GITHUB_BRANCH secret (main)."),
        inputs: z.record(z.any()).optional().describe("Optional workflow_dispatch inputs, if the workflow defines any.")
      },
      async (args) => {
        const result = await toolGithubTriggerWorkflow(this.env, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.ok === false
        };
      }
    );

    this.server.tool(
      "github_get_workflow_run_log",
      "Fetch the actual plain-text log for a failed (or any) GitHub Actions workflow run, using the run_id from github_list_workflow_runs. Use this instead of asking the user to paste deploy errors. Returns per-step status plus the tail of the log text (or, if 'grep' is given, only the matching lines with context) - use grep for something like 'ERROR|Uncaught|Error:' to jump straight to the failure instead of reading the whole log.",
      {
        run_id: z.number().describe("The workflow run ID, from github_list_workflow_runs."),
        job_index: z.number().optional().describe("Which job within the run to fetch, 0-indexed. Defaults to 0 (most workflows here have a single job)."),
        tail_lines: z.number().optional().describe("How many lines from the end (or from the grep matches) to return. Defaults to 200."),
        grep: z.string().optional().describe("Optional case-insensitive regex. If given, only lines matching it (plus 3 lines of surrounding context) are returned, instead of the plain tail.")
      },
      async (args) => {
        const result = await toolGithubGetWorkflowRunLog(this.env, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.ok === false
        };
      }
    );

    this.server.tool(
      "github_patch_file",
      "Find-and-replace inside a repo file entirely server-side (the old and new content never pass through the calling context). Use this instead of github_get_file + github_put_file for files too large to round-trip through a chat context. old_str must match exactly once in the current file.",
      {
        path: z.string().describe("File path within the repo to patch."),
        old_str: z.string().describe("Exact string to find. Must be unique in the file."),
        new_str: z.string().describe("String to replace it with."),
        message: z.string().optional().describe("Commit message.")
      },
      async (args) => {
        const result = await toolGithubPatchFile(this.env, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.ok === false
        };
      }
    );

    this.server.tool(
      "github_grep_file",
      "Search inside a repo file server-side, returning only matching lines plus surrounding context — never the whole file. Use this for files too large to ever safely return in full (multi-hundred-KB+ files). pattern is a JS regex string.",
      {
        path: z.string().describe("File path within the repo to search."),
        pattern: z.string().describe("Regex pattern to search for (JS regex syntax, no slashes)."),
        context_lines: z.number().optional().describe("Lines of context before/after each match. Default 3."),
        max_matches: z.number().optional().describe("Max matches to return. Default 20, capped at 50.")
      },
      async (args) => {
        const result = await toolGithubGrepFile(this.env, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.ok === false
        };
      }
    );

    this.server.tool(
      "call_gemini",
      "Call the Gemini API directly from inside this worker (same real logic as the existing /gemini-proxy HTTP route, now exposed as a proper MCP tool). Runs server-side, so it uses this worker's own outbound fetch access, not the calling agent's sandboxed network - use this instead of trying to reach /gemini-proxy over HTTP from a restricted environment.",
      {
        prompt: z.string().describe("The prompt to send to Gemini."),
        model: z.string().optional().describe("Gemini model name. Defaults to gemini-2.0-flash.")
      },
      async (args) => {
        const { prompt, model } = args || {};
        if (!this.env.GEMINI_API_KEY) {
          return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: "GEMINI_API_KEY not bound" }) }], isError: true };
        }
        try {
          const useModel = model || "gemini-2.0-flash";
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent?key=${this.env.GEMINI_API_KEY}`;
          const geminiResp = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
          });
          const geminiJson = await geminiResp.json();
          const text = geminiJson?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || null;
          const result = { ok: geminiResp.ok, status: geminiResp.status, text, model: useModel };
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: !geminiResp.ok };
        } catch (err) {
          return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) }) }], isError: true };
        }
      }
    );
  }
}

// ---- Minimal auto-approving OAuth (single-user, no real login) ----------

async function handleOAuthAndAdminRoutes(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (method === "GET" && path === "/") {
    return jsonResponse(baseIdentity(env));
  }

  if (method === "GET" && path === "/health") {
    return jsonResponse({
      ...baseIdentity(env),
      route: "/health",
      checks: {
        db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS),
        vars: varPresence(env, EXPECTED_VARS),
        secrets_present_only: varPresence(env, REQUIRED_SECRETS)
      },
      safe_secret_note: "Secret values are intentionally never printed."
    });
  }

  if (method === "POST" && path === "/diagnostic") {
    const input = await readJsonSafe(request);
    return jsonResponse({
      ...baseIdentity(env),
      route: "/diagnostic",
      input_echo_safe: {
        request_id: input.request_id || null,
        chain_id: input.chain_id || null,
        job_key: input.job_key || null,
        mode: input.mode || null
      },
      diagnostics: {
        db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS),
        vars: varPresence(env, EXPECTED_VARS),
        secrets_present_only: varPresence(env, REQUIRED_SECRETS)
      },
      writes_performed: 0,
      external_calls_performed: 0
    });
  }

  if (method === "GET" && path === "/debug-auth") {
    const authOk = isAuthorized(request, env);
    const queryToken = url.searchParams.get("token") || "";
    return jsonResponse({
      authorized: authOk,
      token_provided: Boolean(queryToken),
      token_provided_length: queryToken.length,
      admin_token_secret_present: Boolean(env.ALPHADOG_ADMIN_TOKEN),
      admin_token_secret_length: env.ALPHADOG_ADMIN_TOKEN ? env.ALPHADOG_ADMIN_TOKEN.length : 0
    });
  }

  if (method === "GET" && path === "/.well-known/oauth-protected-resource") {
    return jsonResponse({
      resource: `${url.origin}/mcp`,
      authorization_servers: [url.origin]
    });
  }

  if (method === "GET" && path === "/.well-known/oauth-authorization-server") {
    return jsonResponse({
      issuer: url.origin,
      authorization_endpoint: `${url.origin}/authorize`,
      token_endpoint: `${url.origin}/token`,
      registration_endpoint: `${url.origin}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256", "plain"]
    });
  }

  if (method === "POST" && path === "/register") {
    const input = await readJsonSafe(request);
    return jsonResponse({
      client_id: "alphadog-bridge-client",
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: input.redirect_uris || [],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"]
    }, 201);
  }

  if (method === "GET" && path === "/authorize") {
    const redirectUri = url.searchParams.get("redirect_uri");
    const state = url.searchParams.get("state") || "";
    if (!redirectUri) {
      return jsonResponse({ ok: false, error: "Missing redirect_uri" }, 400);
    }
    const code = btoa(env.ALPHADOG_ADMIN_TOKEN || "");
    const redirect = new URL(redirectUri);
    redirect.searchParams.set("code", code);
    if (state) redirect.searchParams.set("state", state);
    return Response.redirect(redirect.toString(), 302);
  }

  if (method === "POST" && path === "/token") {
    const contentType = request.headers.get("content-type") || "";
    let params;
    if (contentType.includes("application/json")) {
      params = await readJsonSafe(request);
    } else {
      const text = await request.text();
      params = Object.fromEntries(new URLSearchParams(text));
    }
    const grantType = params.grant_type;
    let accessToken = null;

    if (grantType === "authorization_code" && params.code) {
      try { accessToken = atob(params.code); } catch { accessToken = null; }
    } else if (grantType === "refresh_token" && params.refresh_token) {
      try { accessToken = atob(params.refresh_token); } catch { accessToken = null; }
    }

    if (!accessToken || accessToken !== env.ALPHADOG_ADMIN_TOKEN) {
      return jsonResponse({ error: "invalid_grant" }, 400);
    }

    return jsonResponse({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 31536000,
      refresh_token: btoa(env.ALPHADOG_ADMIN_TOKEN || "")
    });
  }

  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    const handled = await handleOAuthAndAdminRoutes(request, env);
    if (handled) return handled;

    if (path === "/gemini-proxy") {
      if (request.method !== "POST") return jsonResponse({ ok: false, error: "POST required" }, 405);
      if (!env.GEMINI_API_KEY) return jsonResponse({ ok: false, error: "GEMINI_API_KEY not bound" }, 500);
      try {
        const body = await request.json();
        const prompt = body.prompt || "";
        const model = body.model || "gemini-2.0-flash";
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
        const geminiResp = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const geminiJson = await geminiResp.json();
        const text = geminiJson?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || null;
        return jsonResponse({ ok: geminiResp.ok, status: geminiResp.status, text, raw: geminiJson });
      } catch (e) {
        return jsonResponse({ ok: false, error: String(e) }, 500);
      }
    }

    if (path === "/mcp") {
      if (!isAuthorized(request, env)) {
        return jsonResponse({ ok: false, error: "Unauthorized." }, 401);
      }
      return AlphadogMcp.serve("/mcp").fetch(request, env, ctx);
    }

    return jsonResponse({
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      status: "NOT_FOUND",
      allowed_routes: ["GET /", "GET /health", "POST /diagnostic", "GET /debug-auth", "POST /mcp"],
      timestamp_utc: nowUtc()
    }, 404);
  }
};
