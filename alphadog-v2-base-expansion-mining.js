import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-base-expansion-mining";
const VERSION = "alphadog-v2-base-expansion-mining-postgres-v1.0.0-first-inning-context";
const JOB_KEY = "base-expansion-mining";

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function asInt(v, fallback = null) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : fallback; }
function asText(v, fallback = null) { if (v === undefined || v === null || String(v).trim() === "") return fallback; return String(v).trim(); }

// ---- Real parsing logic, ported exactly from the live D1 worker ----
function firstInningFromLinescore(json) {
  const innings = json && json.innings;
  if (!Array.isArray(innings) || !innings.length) return null;
  const one = innings[0] || {};
  const away = one.away || {};
  const home = one.home || {};
  const top = Number(away.runs);
  const bottom = Number(home.runs);
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return null;
  return {
    top_1st_runs: top, bottom_1st_runs: bottom, first_inning_total_runs: top + bottom,
    home_team_name: (json.teams && json.teams.home && json.teams.home.team && json.teams.home.team.name) || null,
    away_team_name: (json.teams && json.teams.away && json.teams.away.team && json.teams.away.team.name) || null
  };
}
async function fetchMlbLinescore(gamePk, timeoutMs = 8000) {
  const base = "https://statsapi.mlb.com/api/v1";
  const url = `${base}/game/${gamePk}/linescore`;
  const controller = new AbortController();
  const timer = setTimeout(() => { try { controller.abort(`MLB_LINESCORE_TIMEOUT_${timeoutMs}MS`); } catch (_) {} }, Math.max(1000, Number(timeoutMs || 8000)));
  try {
    const resp = await fetch(url, { signal: controller.signal, headers: { "accept": "application/json", "user-agent": "AlphaDogExpansionBaseline/1.0" } });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`MLB_LINESCORE_HTTP_${resp.status}:${String(text || "").slice(0, 180)}`);
    return { url, json: JSON.parse(text) };
  } catch (err) {
    const msg = String(err && err.message ? err.message : err || "MLB_LINESCORE_FETCH_FAILED");
    if (/abort|timeout/i.test(msg)) throw new Error(`MLB_LINESCORE_TIMEOUT_${timeoutMs}MS`);
    throw err;
  } finally { clearTimeout(timer); }
}

async function ensureSchema(sql) {
  // Schema already created directly; this is a no-op safety check kept for parity with other workers.
  await sql`SELECT 1`;
  return { ok: true };
}

async function getDeltaGameList(sql, maxGames) {
  const currentRows = await sql`SELECT game_pk FROM context.expansion_first_inning_game_context_current WHERE game_pk IS NOT NULL`;
  const alreadyMined = new Set(currentRows.map(r => Number(r.game_pk)).filter(Boolean));
  const candidates = await sql`
    SELECT game_pk, MAX(game_date) AS game_date FROM team.starter_history
    WHERE game_pk IS NOT NULL GROUP BY game_pk ORDER BY MAX(game_date) ASC, game_pk ASC
  `;
  const out = [];
  for (const r of candidates) {
    const gamePk = Number(r.game_pk) || 0;
    if (!gamePk || alreadyMined.has(gamePk)) continue;
    out.push(gamePk);
    if (out.length >= maxGames) break;
  }
  return out;
}

async function runDeltaMining(sql, input) {
  const requestId = asText(input.request_id, rid("expansion_delta_mining"));
  const runId = asText(input.run_id, rid("run"));
  const batchId = asText(input.delta_mining_batch_id || input.batch_id, "expansion_first_inning_delta_batch_singleton");
  const chunkSize = Math.max(10, Math.min(asInt(input.delta_game_chunk_size, 200), 300));
  const timeoutMs = Math.max(1500, Math.min(asInt(input.mlb_linescore_timeout_ms, 8000), 15000));
  const maxGames = Math.max(1, Math.min(asInt(input.delta_game_limit, 2500), 2500));
  const concurrency = Math.max(5, Math.min(asInt(input.fetch_concurrency, 25), 40));

  await sql`
    INSERT INTO context.expansion_first_inning_context_batches (batch_id, request_id, run_id, mode, status, worker_version, cursor_offset)
    VALUES (${batchId}, ${requestId}, ${runId}, 'expansion_delta_mining', 'running', ${VERSION}, 0)
    ON CONFLICT (batch_id) DO UPDATE SET request_id=excluded.request_id, run_id=excluded.run_id, status='running', updated_at=now()
  `;

  // getDeltaGameList already anti-joins out previously-mined games, so it naturally
  // shrinks every call as mining progresses. No separate cursor is needed (or safe to
  // combine with this) - always take the front of the freshly-computed remaining list.
  const remainingGamePks = await getDeltaGameList(sql, maxGames);
  const totalRemainingBeforeThisTick = remainingGamePks.length;
  const slice = remainingGamePks.slice(0, chunkSize);
  let gamesWritten = 0, pitcherRows = 0, issues = 0;

  if (slice.length) {
    // Batch-load per-game home/away team_id AND all starters for the whole chunk in 2 queries
    // instead of 2 queries per game (was the single biggest source of round-trip overhead).
    const gameRowsAll = await sql`
      SELECT game_pk, MAX(game_date) AS game_date,
        MAX(CASE WHEN is_home=1 THEN regexp_replace(team_id::text, '^mlb_', '') END)::bigint AS home_team_id,
        MAX(CASE WHEN is_home=0 THEN regexp_replace(team_id::text, '^mlb_', '') END)::bigint AS away_team_id
      FROM team.starter_history WHERE game_pk IN ${sql(slice)} GROUP BY game_pk
    `;
    const gameInfoByPk = new Map(gameRowsAll.map(r => [Number(r.game_pk), r]));
    const startersAll = await sql`
      SELECT sh.game_pk, sh.mlb_player_id AS pitcher_id, regexp_replace(sh.team_id::text, '^mlb_', '')::bigint AS team_id,
        regexp_replace(sh.opponent_team_id::text, '^mlb_', '')::bigint AS opponent_team_id, sh.is_home, sh.game_date, sh.source_key, p.full_name
      FROM team.starter_history sh LEFT JOIN ref.players p ON p.mlb_player_id = sh.mlb_player_id
      WHERE sh.game_pk IN ${sql(slice)}
    `;
    const startersByGame = new Map();
    for (const s of startersAll) {
      const k = Number(s.game_pk);
      if (!startersByGame.has(k)) startersByGame.set(k, []);
      startersByGame.get(k).push(s);
    }

    // Fetch all MLB linescores concurrently (bounded pool), instead of one-at-a-time sequential awaits.
    const results = new Array(slice.length);
    let nextIdx = 0;
    async function worker() {
      while (nextIdx < slice.length) {
        const idx = nextIdx++;
        const gamePk = slice[idx];
        try {
          const fetched = await fetchMlbLinescore(gamePk, timeoutMs);
          const parsed = firstInningFromLinescore(fetched.json);
          if (!parsed) throw new Error("MISSING_FIRST_INNING_LINESCORE_RUNS");
          results[idx] = { gamePk, ok: true, fetched, parsed };
        } catch (err) {
          results[idx] = { gamePk, ok: false, error: String(err && err.message ? err.message : err) };
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, slice.length) }, () => worker()));

    const gameRowsToInsert = [];
    const pitcherRowsToInsert = [];
    const issueRowsToInsert = [];

    for (const r of results) {
      const gamePk = r.gamePk;
      const g = gameInfoByPk.get(gamePk) || null;
      if (!r.ok) {
        issues++;
        issueRowsToInsert.push({ issue_id: rid("exp_delta_issue"), batch_id: batchId, game_pk: gamePk, pitcher_id: null, severity: "WARN", issue_code: "DELTA_MLB_LINESCORE_FETCH_OR_PARSE_FAILED", issue_message: r.error.slice(0, 500), details_json: JSON.stringify({ game_pk: gamePk, delta_update: true }) });
        continue;
      }
      const parsed = r.parsed;
      const contextRowId = `exp_first_game|${gamePk}`;
      const yrfi = parsed.first_inning_total_runs >= 1 ? 1 : 0;
      const nrfi = parsed.first_inning_total_runs === 0 ? 1 : 0;
      gameRowsToInsert.push({
        context_row_id: contextRowId, batch_id: batchId, game_pk: gamePk, game_date: g ? g.game_date : null,
        home_team_id: g ? g.home_team_id : null, away_team_id: g ? g.away_team_id : null,
        home_team_name: parsed.home_team_name, away_team_name: parsed.away_team_name,
        top_1st_runs: parsed.top_1st_runs, bottom_1st_runs: parsed.bottom_1st_runs, first_inning_total_runs: parsed.first_inning_total_runs,
        yrfi_flag: yrfi, nrfi_flag: nrfi, rfi_pp_more_hit: yrfi, rfi_pp_less_hit: nrfi,
        source_endpoint: r.fetched.url, source_confidence: "MLB_LINESCORE_FIRST_INNING",
        source_snapshot_json: JSON.stringify({ game_pk: gamePk, first_inning: parsed, source: "MLB_STATS_API_LINESCORE", delta_update: true })
      });
      gamesWritten++;
      const starters = startersByGame.get(gamePk) || [];
      for (const s0 of starters) {
        const pitcherId = Number(s0.pitcher_id) || null;
        if (!pitcherId) {
          issues++;
          issueRowsToInsert.push({ issue_id: rid("exp_delta_issue"), batch_id: batchId, game_pk: gamePk, pitcher_id: null, severity: "WARN", issue_code: "MISSING_STARTER_PLAYER_ID", issue_message: "Starter row missing pitcher id", details_json: JSON.stringify(s0) });
          continue;
        }
        const isHome = Number(s0.is_home || 0) === 1 ? 1 : 0;
        const runsAllowed = isHome ? parsed.top_1st_runs : parsed.bottom_1st_runs;
        const half = isHome ? "top_1st" : "bottom_1st";
        pitcherRowsToInsert.push({
          pitcher_context_row_id: `exp_first_pitcher|${gamePk}|${pitcherId}`, batch_id: batchId, game_pk: gamePk,
          game_date: s0.game_date || (g ? g.game_date : null), pitcher_id: pitcherId, pitcher_name: s0.full_name || null,
          team_id: s0.team_id, opponent_team_id: s0.opponent_team_id, is_home: isHome, started_game: 1,
          first_frame_half: half, first_frame_runs_allowed: runsAllowed, rfi_sl_more_hit: runsAllowed >= 1 ? 1 : 0, rfi_sl_less_hit: runsAllowed === 0 ? 1 : 0,
          source_game_context_row_id: contextRowId, starter_source_key: s0.source_key || null, source_confidence: "MLB_LINESCORE_PLUS_STARTER_HISTORY",
          details_json: JSON.stringify({ mapping: isHome ? "home_starter_allows_top_1st" : "away_starter_allows_bottom_1st", top_1st_runs: parsed.top_1st_runs, bottom_1st_runs: parsed.bottom_1st_runs, delta_update: true })
        });
        pitcherRows++;
      }
    }

    const GAME_CHUNK = 200;
    const dedupedGameRows = [];
    { const seen = new Set(); for (const r of gameRowsToInsert) { if (seen.has(r.context_row_id)) continue; seen.add(r.context_row_id); dedupedGameRows.push(r); } }
    for (let i = 0; i < dedupedGameRows.length; i += GAME_CHUNK) {
      const chunk = dedupedGameRows.slice(i, i + GAME_CHUNK);
      await sql`
        INSERT INTO context.expansion_first_inning_game_context_current ${sql(chunk, "context_row_id","batch_id","game_pk","game_date","home_team_id","away_team_id","home_team_name","away_team_name","top_1st_runs","bottom_1st_runs","first_inning_total_runs","yrfi_flag","nrfi_flag","rfi_pp_more_hit","rfi_pp_less_hit","source_endpoint","source_confidence","source_snapshot_json")}
        ON CONFLICT (context_row_id) DO UPDATE SET
          top_1st_runs=excluded.top_1st_runs, bottom_1st_runs=excluded.bottom_1st_runs, first_inning_total_runs=excluded.first_inning_total_runs,
          yrfi_flag=excluded.yrfi_flag, nrfi_flag=excluded.nrfi_flag, rfi_pp_more_hit=excluded.rfi_pp_more_hit, rfi_pp_less_hit=excluded.rfi_pp_less_hit,
          source_snapshot_json=excluded.source_snapshot_json, updated_at=now()
      `;
    }
    const PITCHER_CHUNK = 200;
    const dedupedPitcherRows = [];
    { const seen = new Set(); for (const r of pitcherRowsToInsert) { if (seen.has(r.pitcher_context_row_id)) continue; seen.add(r.pitcher_context_row_id); dedupedPitcherRows.push(r); } }
    for (let i = 0; i < dedupedPitcherRows.length; i += PITCHER_CHUNK) {
      const chunk = dedupedPitcherRows.slice(i, i + PITCHER_CHUNK);
      await sql`
        INSERT INTO context.expansion_first_inning_pitcher_context_current ${sql(chunk, "pitcher_context_row_id","batch_id","game_pk","game_date","pitcher_id","pitcher_name","team_id","opponent_team_id","is_home","started_game","first_frame_half","first_frame_runs_allowed","rfi_sl_more_hit","rfi_sl_less_hit","source_game_context_row_id","starter_source_key","source_confidence","details_json")}
        ON CONFLICT (pitcher_context_row_id) DO UPDATE SET
          first_frame_runs_allowed=excluded.first_frame_runs_allowed, rfi_sl_more_hit=excluded.rfi_sl_more_hit, rfi_sl_less_hit=excluded.rfi_sl_less_hit,
          details_json=excluded.details_json, updated_at=now()
      `;
    }
    if (issueRowsToInsert.length) {
      await sql`
        INSERT INTO context.expansion_first_inning_context_issues ${sql(issueRowsToInsert, "issue_id","batch_id","game_pk","pitcher_id","severity","issue_code","issue_message","details_json")}
      `;
    }
  }

  if (gamesWritten) {
    await sql`INSERT INTO context.expansion_first_inning_game_context_history SELECT *, now() AS archived_at FROM context.expansion_first_inning_game_context_current WHERE batch_id=${batchId}`;
    await sql`INSERT INTO context.expansion_first_inning_pitcher_context_history SELECT *, now() AS archived_at FROM context.expansion_first_inning_pitcher_context_current WHERE batch_id=${batchId}`;
  }

  const done = totalRemainingBeforeThisTick <= slice.length;
  const currentGamesRows = await sql`SELECT COUNT(*)::int AS c FROM context.expansion_first_inning_game_context_current`;
  const currentPitchersRows = await sql`SELECT COUNT(*)::int AS c FROM context.expansion_first_inning_pitcher_context_current`;
  const issueRows = await sql`SELECT COUNT(*)::int AS c FROM context.expansion_first_inning_context_issues WHERE batch_id=${batchId}`;
  const issueTotal = issueRows[0].c;
  const status = done ? (issueTotal ? "EXPANSION_DELTA_MINING_COMPLETED_WITH_WARNINGS" : "EXPANSION_DELTA_MINING_CERTIFIED") : "EXPANSION_DELTA_MINING_PARTIAL_CONTINUE";

  await sql`
    UPDATE context.expansion_first_inning_context_batches SET
      status=${done ? "completed" : "partial_continue"}, games_requested=${totalRemainingBeforeThisTick}, games_written=games_written+${gamesWritten},
      pitcher_rows_written=pitcher_rows_written+${pitcherRows}, issue_rows=${issueTotal},
      certification=${status}, certification_grade=${done ? (issueTotal ? "PASS_WITH_WARNINGS" : "PASS") : "PARTIAL_CONTINUE"},
      finished_at=${done ? sql`now()` : null}, updated_at=now()
    WHERE batch_id=${batchId}
  `;

  return {
    ok: true, data_ok: true, mode: "expansion_delta_mining", batch_id: batchId, request_id: requestId, run_id: runId,
    status, certification: status, certification_grade: done ? (issueTotal ? "PASS_WITH_WARNINGS" : "PASS") : "PARTIAL_CONTINUE",
    delta_games_remaining_before_tick: totalRemainingBeforeThisTick, delta_games_attempted: slice.length, delta_games_written: gamesWritten, delta_pitcher_rows_written: pitcherRows,
    current_game_rows: currentGamesRows[0].c, current_pitcher_rows: currentPitchersRows[0].c, issue_rows: issueTotal,
    delta_game_chunk_size: chunkSize, continuation_required: !done,
    next_input_json: !done ? { ...input, delta_mining_batch_id: batchId, delta_game_chunk_size: chunkSize } : null
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const sql = postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false });
    try {
      if (url.pathname === "/" || url.pathname === "/health") {
        return new Response(JSON.stringify({ ok: true, worker_name: WORKER_NAME, version: VERSION, job_key: JOB_KEY, timestamp_utc: nowUtc() }), { headers: { "content-type": "application/json" } });
      }
      if (url.pathname === "/run" && request.method === "POST") {
        await ensureSchema(sql);
        let input = {};
        try { input = await request.json(); } catch (_) { input = {}; }
        const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
        const merged = { ...inputJson, ...input };
        const result = await runDeltaMining(sql, merged);
        return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: false, error: "not_found", path: url.pathname }), { status: 404, headers: { "content-type": "application/json" } });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err), stack: String(err && err.stack ? err.stack : "") }), { status: 500, headers: { "content-type": "application/json" } });
    } finally {
      try { await sql.end(); } catch (_) {}
    }
  }
};
