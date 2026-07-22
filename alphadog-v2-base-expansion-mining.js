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
  const chunkSize = Math.max(10, Math.min(asInt(input.delta_game_chunk_size, 40), 60));
  const timeoutMs = Math.max(1500, Math.min(asInt(input.mlb_linescore_timeout_ms, 8000), 15000));
  const maxGames = Math.max(1, Math.min(asInt(input.delta_game_limit, 2500), 2500));

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

  for (const gamePk of slice) {
    const gRows = await sql`
      SELECT game_pk, MAX(game_date) AS game_date,
        MAX(CASE WHEN is_home=1 THEN team_id END) AS home_team_id,
        MAX(CASE WHEN is_home=0 THEN team_id END) AS away_team_id
      FROM team.starter_history WHERE game_pk=${gamePk} GROUP BY game_pk
    `;
    const g = gRows[0] || null;
    try {
      const fetched = await fetchMlbLinescore(gamePk, timeoutMs);
      const parsed = firstInningFromLinescore(fetched.json);
      if (!parsed) throw new Error("MISSING_FIRST_INNING_LINESCORE_RUNS");
      const contextRowId = `exp_first_game|${gamePk}`;
      const yrfi = parsed.first_inning_total_runs >= 1 ? 1 : 0;
      const nrfi = parsed.first_inning_total_runs === 0 ? 1 : 0;
      await sql`
        INSERT INTO context.expansion_first_inning_game_context_current (
          context_row_id, batch_id, game_pk, game_date, home_team_id, away_team_id, home_team_name, away_team_name,
          top_1st_runs, bottom_1st_runs, first_inning_total_runs, yrfi_flag, nrfi_flag, rfi_pp_more_hit, rfi_pp_less_hit,
          source_endpoint, source_confidence, source_snapshot_json, updated_at
        ) VALUES (
          ${contextRowId}, ${batchId}, ${gamePk}, ${g ? g.game_date : null}, ${g ? g.home_team_id : null}, ${g ? g.away_team_id : null},
          ${parsed.home_team_name}, ${parsed.away_team_name}, ${parsed.top_1st_runs}, ${parsed.bottom_1st_runs}, ${parsed.first_inning_total_runs},
          ${yrfi}, ${nrfi}, ${yrfi}, ${nrfi}, ${fetched.url}, 'MLB_LINESCORE_FIRST_INNING',
          ${JSON.stringify({ game_pk: gamePk, first_inning: parsed, source: "MLB_STATS_API_LINESCORE", delta_update: true })}, now()
        )
        ON CONFLICT (context_row_id) DO UPDATE SET
          top_1st_runs=excluded.top_1st_runs, bottom_1st_runs=excluded.bottom_1st_runs, first_inning_total_runs=excluded.first_inning_total_runs,
          yrfi_flag=excluded.yrfi_flag, nrfi_flag=excluded.nrfi_flag, rfi_pp_more_hit=excluded.rfi_pp_more_hit, rfi_pp_less_hit=excluded.rfi_pp_less_hit,
          source_snapshot_json=excluded.source_snapshot_json, updated_at=now()
      `;
      gamesWritten++;

      const starters = await sql`
        SELECT sh.mlb_player_id AS pitcher_id, sh.team_id, sh.opponent_team_id, sh.is_home, sh.game_date, sh.source_key, p.full_name
        FROM team.starter_history sh LEFT JOIN ref.players p ON p.mlb_player_id = sh.mlb_player_id
        WHERE sh.game_pk = ${gamePk}
      `;
      for (const s0 of starters) {
        const pitcherId = Number(s0.pitcher_id) || null;
        if (!pitcherId) {
          issues++;
          await sql`
            INSERT INTO context.expansion_first_inning_context_issues (issue_id, batch_id, game_pk, pitcher_id, severity, issue_code, issue_message, details_json)
            VALUES (${rid("exp_delta_issue")}, ${batchId}, ${gamePk}, NULL, 'WARN', 'MISSING_STARTER_PLAYER_ID', 'Starter row missing pitcher id', ${JSON.stringify(s0)})
          `;
          continue;
        }
        const isHome = Number(s0.is_home || 0) === 1 ? 1 : 0;
        const runsAllowed = isHome ? parsed.top_1st_runs : parsed.bottom_1st_runs;
        const half = isHome ? "top_1st" : "bottom_1st";
        const rowId = `exp_first_pitcher|${gamePk}|${pitcherId}`;
        await sql`
          INSERT INTO context.expansion_first_inning_pitcher_context_current (
            pitcher_context_row_id, batch_id, game_pk, game_date, pitcher_id, pitcher_name, team_id, opponent_team_id, is_home, started_game,
            first_frame_half, first_frame_runs_allowed, rfi_sl_more_hit, rfi_sl_less_hit, source_game_context_row_id, starter_source_key,
            source_confidence, details_json, updated_at
          ) VALUES (
            ${rowId}, ${batchId}, ${gamePk}, ${s0.game_date || (g ? g.game_date : null)}, ${pitcherId}, ${s0.full_name || null}, ${s0.team_id}, ${s0.opponent_team_id},
            ${isHome}, 1, ${half}, ${runsAllowed}, ${runsAllowed >= 1 ? 1 : 0}, ${runsAllowed === 0 ? 1 : 0}, ${contextRowId}, ${s0.source_key || null},
            'MLB_LINESCORE_PLUS_STARTER_HISTORY',
            ${JSON.stringify({ mapping: isHome ? "home_starter_allows_top_1st" : "away_starter_allows_bottom_1st", top_1st_runs: parsed.top_1st_runs, bottom_1st_runs: parsed.bottom_1st_runs, delta_update: true })}, now()
          )
          ON CONFLICT (pitcher_context_row_id) DO UPDATE SET
            first_frame_runs_allowed=excluded.first_frame_runs_allowed, rfi_sl_more_hit=excluded.rfi_sl_more_hit, rfi_sl_less_hit=excluded.rfi_sl_less_hit,
            details_json=excluded.details_json, updated_at=now()
        `;
        pitcherRows++;
      }
    } catch (err) {
      issues++;
      await sql`
        INSERT INTO context.expansion_first_inning_context_issues (issue_id, batch_id, game_pk, pitcher_id, severity, issue_code, issue_message, details_json)
        VALUES (${rid("exp_delta_issue")}, ${batchId}, ${gamePk}, NULL, 'WARN', 'DELTA_MLB_LINESCORE_FETCH_OR_PARSE_FAILED', ${String(err && err.message ? err.message : err).slice(0, 500)}, ${JSON.stringify({ game_pk: gamePk, delta_update: true })})
      `;
    }
  }

  if (gamesWritten) {
    await sql`INSERT INTO context.expansion_first_inning_game_context_history SELECT *, now() AS archived_at FROM context.expansion_first_inning_game_context_current WHERE batch_id=${batchId}`;
    await sql`INSERT INTO context.expansion_first_inning_pitcher_context_history SELECT *, now() AS archived_at FROM context.expansion_first_inning_pitcher_context_current WHERE batch_id=${batchId}`;
  }

  const nextCursor = cursor + slice.length;
  const done = nextCursor >= total;
  const currentGamesRows = await sql`SELECT COUNT(*)::int AS c FROM context.expansion_first_inning_game_context_current`;
  const currentPitchersRows = await sql`SELECT COUNT(*)::int AS c FROM context.expansion_first_inning_pitcher_context_current`;
  const issueRows = await sql`SELECT COUNT(*)::int AS c FROM context.expansion_first_inning_context_issues WHERE batch_id=${batchId}`;
  const issueTotal = issueRows[0].c;
  const status = done ? (issueTotal ? "EXPANSION_DELTA_MINING_COMPLETED_WITH_WARNINGS" : "EXPANSION_DELTA_MINING_CERTIFIED") : "EXPANSION_DELTA_MINING_PARTIAL_CONTINUE";

  await sql`
    UPDATE context.expansion_first_inning_context_batches SET
      status=${done ? "completed" : "partial_continue"}, games_requested=${total}, games_written=games_written+${gamesWritten},
      pitcher_rows_written=pitcher_rows_written+${pitcherRows}, issue_rows=${issueTotal}, cursor_offset=${nextCursor},
      certification=${status}, certification_grade=${done ? (issueTotal ? "PASS_WITH_WARNINGS" : "PASS") : "PARTIAL_CONTINUE"},
      finished_at=${done ? sql`now()` : null}, updated_at=now()
    WHERE batch_id=${batchId}
  `;

  return {
    ok: true, data_ok: true, mode: "expansion_delta_mining", batch_id: batchId, request_id: requestId, run_id: runId,
    status, certification: status, certification_grade: done ? (issueTotal ? "PASS_WITH_WARNINGS" : "PASS") : "PARTIAL_CONTINUE",
    delta_games_total: total, delta_games_attempted: slice.length, delta_games_written: gamesWritten, delta_pitcher_rows_written: pitcherRows,
    current_game_rows: currentGamesRows[0].c, current_pitcher_rows: currentPitchersRows[0].c, issue_rows: issueTotal,
    delta_cursor_offset: nextCursor, delta_game_chunk_size: chunkSize, continuation_required: !done,
    next_input_json: !done ? { ...input, delta_mining_batch_id: batchId, delta_cursor_offset: nextCursor, delta_game_chunk_size: chunkSize } : null
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
