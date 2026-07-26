import postgres from "postgres";

const VERSION = "alphadog-v2-board-ui-v1.0.0-fresh-rebuild";
const HYPERDRIVE_ID = "f6c6e778ebfe4dfa8e17d7effbeaff8b";

function pgClient(env) {
  return postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false, prepare: false, connect_timeout: 8 });
}

async function q(sql, text, params = []) {
  let i = 0;
  const converted = String(text).replace(/\?/g, () => "$" + (++i));
  const queryPromise = sql.unsafe(converted, params, { prepare: false });
  const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("QUERY_TIMEOUT_8000MS")), 8000));
  return await Promise.race([queryPromise, timeoutPromise]);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" } });
}

function html(body, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

async function apiBoard(env) {
  if (!env.HYPERDRIVE) return json({ ok: false, error: "HYPERDRIVE binding missing" }, 500);
  const pg = pgClient(env);
  try {
    const rows = await q(pg, `
      SELECT
        f.final_board_row_id, f.player_name, f.canonical_prop_key, f.line_value, f.selected_side,
        f.source_key, f.rank_order, f.score_0_100, f.confidence_0_100, f.estimated_hit_probability_0_100,
        f.board_tier, f.official_date, f.official_game_time_utc,
        COALESCE(p.team_full_name, p.team) AS home_team_name,
        COALESCE(p.opponent_full_name, p.opponent) AS away_team_name
      FROM score.final_board_current f
      LEFT JOIN score.board_prepared_current p ON p.prepared_row_id = f.prepared_row_id
      WHERE f.final_board_batch_id = (SELECT final_board_batch_id FROM score.final_board_batches ORDER BY COALESCE(finished_at, started_at) DESC LIMIT 1)
        AND f.review_playable = 1
        AND COALESCE(f.live_playable,0) = 0
      ORDER BY COALESCE(f.rank_order, 999999) ASC
      LIMIT 500
    `);
    await pg.end({ timeout: 1 }).catch(() => {});
    const openRows = rows.filter(r => {
      const t = Date.parse(r.official_game_time_utc || "");
      if (Number.isFinite(t) && t <= Date.now()) return false;
      return true;
    });
    return json({ ok: true, version: VERSION, row_count: openRows.length, raw_row_count: rows.length, rows: openRows });
  } catch (err) {
    await pg.end({ timeout: 1 }).catch(() => {});
    return json({ ok: false, error: String(err && err.message ? err.message : err), version: VERSION }, 500);
  }
}

async function apiDossier(env, url) {
  const id = url.searchParams.get("id");
  if (!id) return json({ ok: false, error: "id required" }, 400);
  if (!env.HYPERDRIVE) return json({ ok: false, error: "HYPERDRIVE binding missing" }, 500);
  const pg = pgClient(env);
  try {
    const rows = await q(pg, `
      SELECT f.*, COALESCE(p.team_full_name, p.team) AS home_team_name, COALESCE(p.opponent_full_name, p.opponent) AS away_team_name
      FROM score.final_board_current f
      LEFT JOIN score.board_prepared_current p ON p.prepared_row_id = f.prepared_row_id
      WHERE f.final_board_row_id = ?
      LIMIT 1
    `, [id]);
    if (!rows.length) { await pg.end({ timeout: 1 }).catch(() => {}); return json({ ok: false, error: "not found" }, 404); }
    const leg = rows[0];
    const isPitcher = String(leg.canonical_prop_key || "").startsWith("pitcher_") || ["earned_runs","hits_allowed","walks_allowed","runs_allowed"].includes(leg.canonical_prop_key);
    const gameLogsTable = isPitcher ? "stats_pitcher.game_logs" : "stats_hitter.game_logs";
    const gameLogs = await q(pg, `SELECT * FROM ${gameLogsTable} WHERE player_id = ? ORDER BY game_date DESC LIMIT 20`, [leg.mlb_player_id]);
    const player = await q(pg, `SELECT * FROM ref.players WHERE mlb_player_id = ? LIMIT 1`, [leg.mlb_player_id]);
    const weather = await q(pg, `SELECT * FROM daily.game_weather_current WHERE game_pk = ? ORDER BY updated_at DESC LIMIT 1`, [leg.game_pk]);
    const umpire = await q(pg, `SELECT * FROM daily.umpire_context_current WHERE game_pk = ? ORDER BY updated_at DESC LIMIT 1`, [leg.game_pk]);
    const splitsTable = isPitcher ? "stats_pitcher.splits" : "stats_hitter.splits";
    const splits = await q(pg, `SELECT * FROM ${splitsTable} WHERE player_id = ? ORDER BY season DESC`, [leg.mlb_player_id]);
    const availability = await q(pg, `SELECT availability_status, roster_status_description FROM daily.player_availability_current WHERE player_id = ? ORDER BY updated_at DESC LIMIT 1`, [leg.mlb_player_id]);
    let qoc = [];
    if (!isPitcher) {
      qoc = await q(pg, `SELECT xba, xslg, xwoba, woba, exit_velocity_avg, barrel_batted_rate, hard_hit_percent, season_year FROM ref.batter_quality_of_contact WHERE mlb_player_id = ? AND active=1 ORDER BY season_year DESC LIMIT 1`, [leg.mlb_player_id]);
    }
    await pg.end({ timeout: 1 }).catch(() => {});
    return json({ ok: true, version: VERSION, leg, player: player[0] || null, recent_games: gameLogs, is_pitcher: isPitcher,
      weather: weather[0] || null, umpire: umpire[0] || null, splits, availability: availability[0] || null, quality_of_contact: qoc[0] || null });
  } catch (err) {
    await pg.end({ timeout: 1 }).catch(() => {});
    return json({ ok: false, error: String(err && err.message ? err.message : err) }, 500);
  }
}

async function apiPlayerSearch(env, url) {
  const qs = String(url.searchParams.get("q") || "").trim();
  if (qs.length < 3) return json({ ok: true, rows: [] });
  if (!env.HYPERDRIVE) return json({ ok: false, error: "HYPERDRIVE binding missing" }, 500);
  const pg = pgClient(env);
  try {
    const like = `%${qs.replace(/[%_]/g, "")}%`;
    const rows = await q(pg, `
      SELECT player_id, mlb_player_id, COALESCE(full_name, player_name) AS player_name, primary_position
      FROM ref.players WHERE active = 1 AND LOWER(COALESCE(full_name, player_name,'')) LIKE LOWER(?)
      ORDER BY player_name LIMIT 20
    `, [like]);
    await pg.end({ timeout: 1 }).catch(() => {});
    return json({ ok: true, rows });
  } catch (err) {
    await pg.end({ timeout: 1 }).catch(() => {});
    return json({ ok: false, error: String(err && err.message ? err.message : err) }, 500);
  }
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>AlphaDog Fresh</title>
<style>
body{margin:0;font-family:-apple-system,system-ui,sans-serif;background:#0b1220;color:#e8edf5}
.hdr{padding:16px;background:#111a2e;display:flex;justify-content:space-between;align-items:center}
.hdr h1{margin:0;font-size:20px}
.status{padding:12px 16px;color:#9db2d0}
.err{color:#ff6b6b}
.cards{display:flex;flex-direction:column;gap:8px;padding:0 16px}
.card{background:#151f36;border:1px solid #26324e;border-radius:10px;padding:12px;cursor:pointer}
.card .name{font-weight:700;font-size:16px}
.card .meta{color:#9db2d0;font-size:13px;margin-top:4px}
.card .hp{float:right;font-size:20px;font-weight:800;color:#7ee787}
.dossier{padding:16px}
.back{background:#26324e;border:none;color:#fff;padding:8px 14px;border-radius:8px;font-size:14px}
table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
td,th{padding:6px 4px;border-bottom:1px solid #26324e;text-align:left}
</style>
</head>
<body>
<div class="hdr"><h1>AlphaDog — Fresh Build</h1><span id="marker" style="background:#ff0;color:#000;padding:3px 8px;border-radius:4px;font-weight:700">RAW-BUILD-1</span></div>
<div id="boardView">
  <div class="status" id="status">Loading...</div>
  <div class="cards" id="cards"></div>
</div>
<div id="dossierView" style="display:none">
  <div style="padding:16px"><button class="back" id="backBtn">&larr; Back</button></div>
  <div class="dossier" id="dossierBody"></div>
</div>
<script>
document.getElementById('marker').textContent = 'JS-RUNNING-' + Date.now();

function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function pct(v){ const n=Number(v); return Number.isFinite(n) ? n.toFixed(1)+'%' : '—'; }

async function loadBoard(){
  const statusEl = document.getElementById('status');
  const cardsEl = document.getElementById('cards');
  statusEl.textContent = 'Loading board...';
  try {
    const res = await fetch('/api/board?t=' + Date.now(), { cache: 'no-store' });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'board failed');
    statusEl.textContent = j.row_count + ' legs available (of ' + j.raw_row_count + ' total on board)';
    if (!j.rows.length) {
      cardsEl.innerHTML = '<div class="status">No upcoming legs right now (all of today\\'s games may have already started). Try again closer to first pitch.</div>';
      return;
    }
    cardsEl.innerHTML = j.rows.map(r => {
      const match = (r.away_team_name && r.home_team_name) ? (r.away_team_name + ' @ ' + r.home_team_name) : '';
      return '<div class="card" data-id="' + esc(r.final_board_row_id) + '">' +
        '<span class="hp">' + pct(r.estimated_hit_probability_0_100) + '</span>' +
        '<div class="name">' + esc(r.player_name) + '</div>' +
        '<div class="meta">' + esc(r.canonical_prop_key) + ' ' + esc(String(r.selected_side||'').toUpperCase()) + ' ' + esc(r.line_value) + ' • ' + esc(r.source_key) + '</div>' +
        '<div class="meta">' + esc(match) + '</div>' +
        '</div>';
    }).join('');
    document.querySelectorAll('.card[data-id]').forEach(el => {
      el.onclick = () => openDossier(el.getAttribute('data-id'));
    });
  } catch (e) {
    statusEl.innerHTML = '<span class="err">Board load failed: ' + esc(e.message || e) + '</span>';
  }
}

async function openDossier(id){
  document.getElementById('boardView').style.display = 'none';
  document.getElementById('dossierView').style.display = 'block';
  const body = document.getElementById('dossierBody');
  body.innerHTML = '<div class="status">Loading dossier...</div>';
  try {
    const res = await fetch('/api/dossier?id=' + encodeURIComponent(id) + '&t=' + Date.now(), { cache: 'no-store' });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'dossier failed');
    const leg = j.leg, player = j.player || {}, games = j.recent_games || [];
    let h = '<h2>' + esc(leg.player_name) + '</h2>';
    h += '<div class="meta">' + esc(leg.canonical_prop_key) + ' ' + esc(String(leg.selected_side||'').toUpperCase()) + ' ' + esc(leg.line_value) + '</div>';
    h += '<div class="meta">Hit Probability: ' + pct(leg.estimated_hit_probability_0_100) + ' • Score: ' + esc(leg.score_0_100) + '</div>';
    h += '<div class="meta">' + esc(leg.home_team_name||'') + ' vs ' + esc(leg.away_team_name||'') + '</div>';
    if (player.primary_position) h += '<div class="meta">Position: ' + esc(player.primary_position) + ' • Bats: ' + esc(player.bat_side||'—') + '</div>';
    if (games.length) {
      h += '<table><thead><tr><th>Date</th><th>H</th><th>HR</th><th>R</th><th>RBI</th><th>BB</th><th>SO</th><th>TB</th></tr></thead><tbody>';
      games.forEach(g => {
        h += '<tr><td>' + esc(String(g.game_date||'').slice(0,10)) + '</td><td>' + esc(g.hits) + '</td><td>' + esc(g.home_runs) + '</td><td>' + esc(g.runs) + '</td><td>' + esc(g.rbi) + '</td><td>' + esc(g.walks) + '</td><td>' + esc(g.strikeouts) + '</td><td>' + esc(g.total_bases) + '</td></tr>';
      });
      h += '</tbody></table>';
    } else {
      h += '<div class="status">No recent game log available for this player.</div>';
    }
    body.innerHTML = h;
  } catch (e) {
    body.innerHTML = '<div class="status err">Dossier load failed: ' + esc(e.message || e) + '</div>';
  }
}

document.getElementById('backBtn').onclick = () => {
  document.getElementById('dossierView').style.display = 'none';
  document.getElementById('boardView').style.display = 'block';
};

loadBoard();
</script>
</body>
</html>`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();
    try {
      if (method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,OPTIONS", "access-control-allow-headers": "content-type" } });
      if (method === "GET" && (path === "/" || path === "/index.html")) return html(PAGE);
      if (method === "GET" && path === "/api/board") return await apiBoard(env);
      if (method === "GET" && path === "/api/dossier") return await apiDossier(env, url);
      if (method === "GET" && path === "/api/player-search") return await apiPlayerSearch(env, url);
      if (method === "GET" && path === "/health") return json({ ok: true, version: VERSION, hyperdrive_present: Boolean(env.HYPERDRIVE) });
      return json({ ok: false, error: "not_found", allowed_routes: ["GET /", "GET /api/board", "GET /api/dossier?id=", "GET /api/player-search?q=", "GET /health"] }, 404);
    } catch (error) {
      return json({ ok: false, error: String(error && error.message ? error.message : error), stack: String(error && error.stack || "").slice(0, 1000) }, 500);
    }
  }
};
