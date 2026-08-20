import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-manual-catcher-backfill";
const VERSION = "v0.1.0-one-off-staging-only";
const MLB_API_BASE_URL = "https://statsapi.mlb.com/api/v1";
const FETCH_TIMEOUT_MS = 8000;
const MAX_ENDPOINT_RETRIES = 2;
const CONCURRENCY = 5;
const MAX_GAMES_PER_INVOCATION = 40;

function pgClient(env) {
  return postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false, prepare: false, connect_timeout: 8 });
}
function nowUtc() { return new Date().toISOString(); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" }
  });
}
async function readJsonSafe(request) { try { return await request.json(); } catch (_) { return {}; } }
function intOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function safeJsonStringify(value, max = 4000) {
  if (value === undefined || value === null) return null;
  const text = JSON.stringify(value);
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(Number(limit) || 1, items.length || 1));
  async function worker() { while (next < items.length) { const idx = next++; out[idx] = await fn(items[idx], idx); } }
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return out;
}

async function fetchJsonWithRetry(url, attempts = MAX_ENDPOINT_RETRIES) {
  let last = null;
  for (let i = 0; i < Math.max(1, attempts); i += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("timeout"), FETCH_TIMEOUT_MS);
    const started = Date.now();
    try {
      const resp = await fetch(url, { headers: { "accept": "application/json", "user-agent": "AlphaDog-v2-Manual-Catcher-Backfill/0.1" }, signal: controller.signal });
      const text = await resp.text();
      let json = null;
      try { json = JSON.parse(text); } catch (_) {}
      last = { ok: resp.ok, http_status: resp.status, elapsed_ms: Date.now() - started, json, response_bytes: text.length };
    } catch (err) {
      last = { ok: false, http_status: null, elapsed_ms: Date.now() - started, error: String(err && err.message ? err.message : err) };
    } finally {
      clearTimeout(timer);
    }
    if (last.ok) break;
    if (last.http_status === 404) break;
  }
  return last;
}

// Exact same pattern as the real deployed alphadog-v2-daily-lineups.js validateSide/writeCatcherContext:
// battingOrder array = real starters for that side; players[`ID${id}`] holds person/position/battingOrder.
function findStartingCatcher(sideNode) {
  if (!sideNode) return null;
  const battingOrder = Array.isArray(sideNode.battingOrder) ? sideNode.battingOrder : [];
  const players = sideNode.players && typeof sideNode.players === "object" ? sideNode.players : {};
  for (const id of battingOrder) {
    const key = `ID${id}`;
    const p = players[key];
    if (!p) continue;
    const positionCode = p.position && p.position.code ? String(p.position.code) : null;
    if (positionCode === "2") {
      return { player_id: intOrNull(p.person && p.person.id), player_name: (p.person && p.person.fullName) || null, batting_order: p.battingOrder || null };
    }
  }
  return null;
}

async function backfillOneGame(pg, gamePk, officialDate, homeTeamId, awayTeamId) {
  const url = `${MLB_API_BASE_URL}/game/${gamePk}/boxscore`;
  const res = await fetchJsonWithRetry(url);
  if (!res.ok || !res.json || !res.json.teams) {
    return { game_pk: gamePk, ok: false, reason: "fetch_failed", http_status: res.http_status || null, error: res.error || null };
  }
  const teams = res.json.teams;
  const results = [];
  for (const side of ["home", "away"]) {
    const node = teams[side];
    if (!node) continue;
    const teamId = side === "home" ? homeTeamId : awayTeamId;
    const catcher = findStartingCatcher(node);
    if (!catcher || !catcher.player_id) {
      results.push({ side, found: false });
      continue;
    }
    const key = `mcb_${officialDate}_${gamePk}_${side}`;
    const row = {
      catcher_context_key: key, official_date: officialDate, game_pk: gamePk, team_side: side, team_id: teamId,
      player_id: catcher.player_id, player_name: catcher.player_name, catcher_status: "assigned_from_boxscore_position",
      catcher_confidence: "HIGH_OFFICIAL_BOXSCORE_POSITION", source_key: "manual_backfill_boxscore_position",
      source_endpoint: "/api/v1/game/{gamePk}/boxscore", data_source_level: "real", is_temporary_derived: 0,
      raw_json: safeJsonStringify({ catcher })
    };
    await pg`INSERT INTO context.manual_backfill_catcher_context_staging
      (catcher_context_key, official_date, game_pk, team_side, team_id, player_id, player_name, catcher_status, catcher_confidence, source_key, source_endpoint, data_source_level, is_temporary_derived, raw_json)
      VALUES (${row.catcher_context_key}, ${row.official_date}, ${row.game_pk}, ${row.team_side}, ${row.team_id}, ${row.player_id}, ${row.player_name}, ${row.catcher_status}, ${row.catcher_confidence}, ${row.source_key}, ${row.source_endpoint}, ${row.data_source_level}, ${row.is_temporary_derived}, ${row.raw_json}::jsonb)
      ON CONFLICT (catcher_context_key) DO UPDATE SET player_id=excluded.player_id, player_name=excluded.player_name, raw_json=excluded.raw_json`;
    results.push({ side, found: true, player_id: catcher.player_id, player_name: catcher.player_name });
  }
  return { game_pk: gamePk, ok: true, results };
}

async function runBackfill(env, input) {
  const pg = pgClient(env);
  try {
    const startDate = input.start_date || "2026-07-24";
    const endDate = input.end_date || "2026-08-04";
    // Pull the exact real game list + team ids from already-verified data (team.game_logs), same source used for the real lineup backfill this session.
    const games = await pg`
      SELECT DISTINCT game_pk, game_date::text AS official_date,
        MAX(CASE WHEN is_home=1 THEN team_id END) AS home_team_id,
        MAX(CASE WHEN is_home=0 THEN team_id END) AS away_team_id
      FROM team.game_logs
      WHERE game_date::date BETWEEN ${startDate} AND ${endDate}
      GROUP BY game_pk, game_date
      ORDER BY game_date, game_pk`;

    const already = await pg`SELECT DISTINCT game_pk FROM context.manual_backfill_catcher_context_staging`;
    const alreadyDone = new Set(already.map(r => Number(r.game_pk)));
    const remaining = games.filter(g => !alreadyDone.has(Number(g.game_pk)));
    const chunk = remaining.slice(0, MAX_GAMES_PER_INVOCATION);

    const outcomes = await mapLimit(chunk, CONCURRENCY, (g) => backfillOneGame(pg, Number(g.game_pk), g.official_date, intOrNull(g.home_team_id), intOrNull(g.away_team_id)));

    const okCount = outcomes.filter(o => o.ok).length;
    const failCount = outcomes.filter(o => !o.ok).length;

    return {
      ok: true, version: VERSION, worker_name: WORKER_NAME, timestamp_utc: nowUtc(),
      total_games_in_window: games.length, already_done_before_this_call: alreadyDone.size,
      processed_this_call: chunk.length, ok_count: okCount, fail_count: failCount,
      continuation_required: remaining.length > chunk.length,
      remaining_after_this_call: Math.max(0, remaining.length - chunk.length),
      failures_sample: outcomes.filter(o => !o.ok).slice(0, 10),
      staging_table: "context.manual_backfill_catcher_context_staging",
      note: "Writes ONLY to the staging table above. Never touches daily.catcher_context_current or context.history_catcher_context."
    };
  } catch (err) {
    return { ok: false, error: String(err && err.stack ? err.stack : err), version: VERSION, worker_name: WORKER_NAME };
  } finally {
    await pg.end({ timeout: 1 }).catch(() => {});
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return jsonResponse({ ok: true });
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();
    if (method === "GET" && path === "/") return jsonResponse({ ok: true, worker_name: WORKER_NAME, version: VERSION, note: "One-off temporary catcher backfill, staging table only." });
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const out = await runBackfill(env, input);
      return jsonResponse(out, out.ok ? 200 : 500);
    }
    return jsonResponse({ ok: false, allowed_routes: ["GET /", "POST /run"] }, 404);
  }
};
