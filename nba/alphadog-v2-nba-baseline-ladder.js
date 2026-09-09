import postgres from "postgres";

// alphadog-v2-nba-baseline-ladder: loads the daily BASELINE LADDER (built by nba-baseline.yml from the certified
// recipe, nba/baseline/build_baseline_ladder.py) from the committed JSON into Postgres.
//   POST /run {"asof":"YYYY-MM-DD"}   -> loads nba/data/nba_baseline_ladder_<asof>.json (default: _latest.json)
// Idempotent: PK (asof, player_id, game_id, prop, period, ot_rule, line). Run summary -> nba_score.baseline_ladder_runs.
const WORKER_NAME = "alphadog-v2-nba-baseline-ladder";
const VERSION = "alphadog-v2-nba-baseline-ladder-v0.1.0";
const JOB_KEY = "nba-baseline-ladder";
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "WORKER_SAFE_MODE", "DEBUG_MODE"];
const BATCH_SIZE = 500;

function nowUtc() { return new Date().toISOString(); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }
function pg(env) { return postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false }); }
function nn(v) { return v === undefined ? null : v; }

async function fetchFromGithubRaw(env, path) {
  const owner = env.GITHUB_OWNER || "Rodantmat";
  const repo = env.GITHUB_REPO || "Alphadog";
  const branch = env.GITHUB_BRANCH || "main";
  const headers = { "User-Agent": "Alphadog-NBA-BaselineLadder" };
  if (env.GITHUB_TOKEN) headers["Authorization"] = `Bearer ${env.GITHUB_TOKEN}`;
  const resp = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`, { headers });
  if (!resp.ok) throw new Error(`github_raw_read_failed_http_${resp.status}:${(await resp.text()).slice(0, 200)}`);
  return await resp.json();
}

function chunk(arr, size) { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; }

async function runJob(input, env) {
  const started = Date.now();
  const sql = pg(env);
  let written = 0, error = null, meta = null, asof = input.asof || null;
  try {
    const path = asof ? `nba/data/nba_baseline_ladder_${asof}.json` : "nba/data/nba_baseline_ladder_latest.json";
    const file = await fetchFromGithubRaw(env, path);
    meta = file.meta || {}; asof = asof || meta.asof;
    if (!asof) throw new Error("ladder file has no asof");
    const rows = (file.ladder || []).filter(x => x && x.player_id && x.game_id && x.prop && x.line != null).map(x => ({
      asof, player_id: String(x.player_id), team_id: nn(x.team_id ? String(x.team_id) : null), game_id: String(x.game_id), game_date: nn(x.game_date || asof),
      prop: x.prop, period: x.period || "FULL", ot_rule: x.ot_rule || "include", line: Number(x.line), anchor: nn(x.anchor), ladder_offset: nn(x.offset),
      p_more: Number(x.p_more), p_less: Number(x.p_less), p_raw: nn(x.p_raw), role_tier: nn(x.role_tier), var_band: nn(x.var_band), used_emp: nn(x.used_emp),
      recipe_version: nn(meta.recipe || null),
    }));
    for (const batch of chunk(rows, BATCH_SIZE)) {
      await sql`
        INSERT INTO nba_score.baseline_ladder ${sql(batch, "asof", "player_id", "team_id", "game_id", "game_date", "prop", "period", "ot_rule", "line", "anchor", "ladder_offset", "p_more", "p_less", "p_raw", "role_tier", "var_band", "used_emp", "recipe_version")}
        ON CONFLICT (asof, player_id, game_id, prop, period, ot_rule, line) DO UPDATE SET
          team_id=excluded.team_id, game_date=excluded.game_date, anchor=excluded.anchor, ladder_offset=excluded.ladder_offset,
          p_more=excluded.p_more, p_less=excluded.p_less, p_raw=excluded.p_raw, role_tier=excluded.role_tier, var_band=excluded.var_band,
          used_emp=excluded.used_emp, recipe_version=excluded.recipe_version, loaded_at=now()
      `;
      written += batch.length;
    }
    await sql`
      INSERT INTO nba_score.baseline_ladder_runs (asof, slate_games, players, rows, props, history_seasons, current_season, factor_fits, role_minutes_multiplier, source_file)
      VALUES (${asof}, ${nn(meta.slate_games)}, ${nn(meta.players)}, ${rows.length}, ${meta.props || null}, ${meta.history_seasons || null}, ${nn(meta.current_season)}, ${JSON.stringify(meta.factor_fits || {})}, ${JSON.stringify(meta.role_minutes_multiplier || {})}, ${path})
      ON CONFLICT (asof) DO UPDATE SET slate_games=excluded.slate_games, players=excluded.players, rows=excluded.rows, props=excluded.props, history_seasons=excluded.history_seasons,
        current_season=excluded.current_season, factor_fits=excluded.factor_fits, role_minutes_multiplier=excluded.role_minutes_multiplier, source_file=excluded.source_file, loaded_at=now()
    `;
  } catch (err) { error = String(err && err.message ? err.message : err); }
  let counts = {};
  try {
    const t = await sql`SELECT COUNT(*)::int AS c, COUNT(DISTINCT player_id)::int AS p, COUNT(DISTINCT prop)::int AS k FROM nba_score.baseline_ladder WHERE asof = ${asof}`;
    counts = { rows_for_asof: Number(t[0]?.c || 0), players_for_asof: Number(t[0]?.p || 0), props_for_asof: Number(t[0]?.k || 0) };
  } catch (_) {}
  await sql.end();
  return { ok: !error && written > 0, version: VERSION, worker_name: WORKER_NAME, job_key: input.job_key || JOB_KEY, status: error ? "failed" : "completed", error, asof, rows_written: written,
           meta: meta ? { slate_games: meta.slate_games, players: meta.players, props: meta.props, history_seasons: meta.history_seasons, current_season: meta.current_season } : null,
           final_counts: counts, elapsed_ms: Date.now() - started, timestamp_utc: nowUtc() };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (request.method === "GET" && path === "/") return jsonResponse({ ok: true, worker_name: WORKER_NAME, version: VERSION, timestamp_utc: nowUtc() });
    if (request.method === "GET" && path === "/health") return jsonResponse({ ok: true, worker_name: WORKER_NAME, vars_present: Object.fromEntries(EXPECTED_VARS.map(v => [v, Boolean(env[v])])) });
    if (request.method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try { return jsonResponse(await runJob(input, env)); }
      catch (err) { return jsonResponse({ ok: false, error: String(err && err.message ? err.message : err), timestamp_utc: nowUtc() }, 500); }
    }
    return jsonResponse({ ok: false, status: "NOT_FOUND" }, 404);
  }
};
