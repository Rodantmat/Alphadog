// ALPHADOG NBA FRIEND PAGE (owner 2026-11-05): a separate, read-only Worker for a friend. Shows only the season-so-far ROI per app + total and the
// day's slips for the five apps (PrizePicks, Underdog, Sleeper, Betr, Fliff) with deep links, re-checked live against every app's board on every load and
// auto-swapped from the friend's own backup pool. Own tables (nba_friend.*), no save button, no units, no strategy text. Access: an unguessable token in the
// path (nba_config.classification_config 'friend_page'.token); anything else is a plain 404. Reads nothing of the owner's UI, writes nothing.
// DEPLOY NOTE: the deploy script redeploys a worker when THIS file changes - bump VERSION with any change.
import { withPg, q } from "./main_ui/common.js";
import { overlayLive } from "./main_ui/livecheck.js";

const VERSION = "alphadog-v2-nba-friend-v1.1.0";
const APP_LABEL = { prizepicks: "PrizePicks", underdog: "Underdog", sleeper: "Sleeper", betr: "Betr", fliff: "Fliff" };
const APP_ORDER = ["prizepicks", "underdog", "sleeper", "betr", "fliff"];

const notFound = () => new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

function ptDate(d = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }

async function tokenOk(sql, token) {
  const r = await q(sql, "SELECT config_json FROM nba_config.classification_config WHERE config_key='friend_page'", [], 6000);
  const t = r[0] && (typeof r[0].config_json === "string" ? JSON.parse(r[0].config_json) : r[0].config_json);
  return !!(t && t.token && token && String(t.token) === String(token));
}

const startedMs = l => { const t = Date.parse((l.link && l.link.tip_utc) || l.official_game_time_utc || ""); return Number.isFinite(t) ? t : null; };
const isBad = l => (l.source_key === "prizepicks" ? (l.pp_now && l.pp_now !== "standard") : (l.live_now && l.live_now !== "ok"));

// replace a drifted / started leg from the friend's own pool: same app, other player, never the opposite side of a player already on the day's slips,
// the slip's game cap, >= 2 teams, best edge first
function autoSwap(out, now) {
  const slips = out.generated_slips || []; let pool = [...(out.backup_pool || [])];
  const used = new Set(slips.flatMap(s => s.legs.map(l => l.player_name + "|" + l.canonical_prop_key + "|" + l.selected_side)));
  const sidesOf = new Map(); for (const s of slips) for (const l of s.legs) sidesOf.set(l.player_name + "|" + l.canonical_prop_key, l.selected_side);
  for (const s of slips) {
    s.legs.forEach((l, i) => {
      const st = startedMs(l); const started = st != null && st <= now;
      if (!started && !isBad(l)) return;
      const kept = s.legs.filter((_x, j) => j !== i);
      const gcap = s.game_cap || 1;
      const k = pool.findIndex(c => c.source_key === s.source_key && !(startedMs(c) != null && startedMs(c) <= now)
        && !kept.some(x => x.player_name === c.player_name)
        && !(sidesOf.has(c.player_name + "|" + c.canonical_prop_key) && sidesOf.get(c.player_name + "|" + c.canonical_prop_key) !== c.selected_side)
        && kept.filter(x => x.matchup === c.matchup).length < gcap
        && new Set([...kept.map(x => x.team_abbr), c.team_abbr]).size >= 2);
      if (k >= 0) { const c = pool.splice(k, 1)[0]; c.sub = true; s.legs[i] = c; used.add(c.player_name + "|" + c.canonical_prop_key + "|" + c.selected_side); }
      else l.off = true;
    });
  }
  out.backup_pool = pool;
}

function linkUrl(s, now) {
  const legs = (s.legs || []).filter(l => l.link && l.link.ids && !l.off && !(startedMs(l) != null && startedMs(l) <= now) && !isBad(l));
  if (legs.length < 2 || legs.length < s.legs.length) { if (legs.length < 2) return null; }
  if (s.source_key === "prizepicks") return "https://app.prizepicks.com/board?projections=" + legs.map(l => l.link.ids.projection_id + "-" + (l.selected_side === "less" ? "u" : "o") + "-" + l.line_value).join(",");
  if (s.source_key === "sleeper") return "https://sleeper.onelink.me/GF91?deep_link_value=entry_prefill&af_dp=sleeper://&deep_link_sub1=" + legs.map(l => l.link.ids.line_id).join(",");
  if (s.source_key === "betr") {
    const raw = legs.map(l => [l.link.ids.player_id, l.link.ids.event_id, l.link.ids.stat, l.selected_side === "less" ? "LESS" : "MORE", l.link.ids.tier || "REGULAR"].join(":")).join(",");
    return "https://l.betr.app/referral?partner=alphadog&picks=" + encodeURIComponent(btoa(raw));
  }
  return null;
}

async function data(env, token) {
  return withPg(env, async sql => {
    if (!(await tokenOk(sql, token))) return null;
    const today = ptDate();
    const snaps = await q(sql, "SELECT game_date::text d, payload FROM nba_friend.snapshot WHERE game_date = (SELECT max(game_date) FROM nba_friend.snapshot WHERE game_date <= $1::date)", [today], 8000);
    const roi = await q(sql, `SELECT app, count(*)::int n, sum(profit)::float p FROM nba_friend.slips WHERE status='graded' AND game_date >= (SELECT season_start FROM nba_friend.season) GROUP BY app`, [], 8000);
    const apps = {}; let n = 0, p = 0;
    for (const r of roi) { apps[r.app] = { n: r.n, roi: r.n ? r.p / r.n : null }; n += r.n; p += r.p; }
    const out = { ok: true, source: "live", generated_slips: [], backup_pool: [] };
    let date = null;
    for (const sn of snaps) {
      const pl = typeof sn.payload === "string" ? JSON.parse(sn.payload) : sn.payload;
      date = sn.d; out.generated_slips.push(...(pl.slips || [])); out.backup_pool.push(...(pl.pool || []));
    }
    if (date && date === today) { try { await overlayLive(sql, out, null); autoSwap(out, Date.now()); } catch (e) { out.live_error = String(e && e.message || e).slice(0, 120); } }
    const now = Date.now();
    const slips = (date === today ? out.generated_slips : []).map(s => ({ app: s.source_key, name: s.name, structure: s.structure_label, url: linkUrl(s, now),
      legs: s.legs.map(l => ({ player: l.player_name, prop: l.prop_label || l.canonical_prop_key, side: l.selected_side, line: l.line_value, matchup: l.matchup || null, tip: l.official_game_time_utc || (l.link && l.link.tip_utc) || null,
        sub: !!l.sub, off: !!l.off, started: startedMs(l) != null && startedMs(l) <= now, status: l.source_key === "prizepicks" ? l.pp_now || null : l.live_now || null })) }));
    return { ok: true, version: VERSION, date, today, checked_at: new Date().toISOString(), live: out.pp_live ? { ms: out.pp_live.total_ms, flagged: out.pp_live.flagged.length } : null,
      roi: { apps, total: n ? { n, roi: p / n } : null }, order: APP_ORDER, labels: APP_LABEL, slips };
  });
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>NBA Slips</title>
<style>
:root{--bg:#0e1116;--card:#171c24;--ink:#e8edf3;--mut:#8b97a6;--ok:#38c172;--bad:#ef4d4d;--line:#252c37;--acc:#6aa9ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.4 -apple-system,system-ui,Segoe UI,Roboto,sans-serif;padding:16px;max-width:640px;margin:0 auto}
h1{font-size:18px;margin:4px 0 12px}table{width:100%;border-collapse:collapse;background:var(--card);border-radius:12px;overflow:hidden}
td,th{padding:9px 12px;text-align:left;border-bottom:1px solid var(--line)}th{color:var(--mut);font-weight:600;font-size:12px;text-transform:uppercase}tr:last-child td{border-bottom:0}
.pos{color:var(--ok)}.neg{color:var(--bad)}.tot td{font-weight:700}
.slip{background:var(--card);border-radius:12px;padding:12px 14px;margin:12px 0}.slip h3{margin:0 0 8px;font-size:15px}.slip h3 a{color:var(--acc);text-decoration:none}.tag{color:var(--mut);font-weight:400;font-size:12px;margin-left:6px}
.leg{padding:7px 0;border-top:1px solid var(--line)}.leg:first-of-type{border-top:0}.leg b{font-weight:600}.sub{color:var(--mut);font-size:12.5px}.flag{color:var(--bad);font-size:12px}
.spin{display:flex;gap:10px;align-items:center;color:var(--mut);padding:24px 0}.dot{width:16px;height:16px;border:3px solid var(--line);border-top-color:var(--acc);border-radius:50%;animation:r 0.8s linear infinite}@keyframes r{to{transform:rotate(360deg)}}
h2{font-size:15px;margin:18px 0 4px;color:var(--mut);text-transform:uppercase;letter-spacing:.04em}
</style></head><body><h1>NBA slips</h1><div id="app"><div class="spin"><div class="dot"></div><span>Checking every leg on every app…</span></div></div>
<script>
const $=s=>document.querySelector(s);const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pct=v=>v==null?'—':(v>=0?'+':'')+(v*100).toFixed(1)+'%';const cls=v=>v==null?'':(v>=0?'pos':'neg');
const tipFmt=t=>{if(!t)return'';const d=new Date(t);return isNaN(d)?'':d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})};
const propName=p=>String(p).replace(/_/g,' ').replace('threes made','3-pointers made').replace(/\\b\\w/g,c=>c.toUpperCase());
function render(d){
  let h='<table><tr><th>Season so far</th><th>ROI</th></tr>';
  for(const a of d.order){const r=d.roi.apps[a];h+='<tr><td>'+esc(d.labels[a])+'</td><td class="'+cls(r&&r.roi)+'">'+pct(r&&r.roi)+'</td></tr>'}
  h+='<tr class="tot"><td>Total</td><td class="'+cls(d.roi.total&&d.roi.total.roi)+'">'+pct(d.roi.total&&d.roi.total.roi)+'</td></tr></table>';
  if(!d.slips.length)h+='<p class="sub" style="margin-top:16px">No slips right now. They appear here once the day\\'s lineups are set.</p>';
  for(const a of d.order){const ss=d.slips.filter(s=>s.app===a);if(!ss.length)continue;h+='<h2>'+esc(d.labels[a])+'</h2>';
    for(const s of ss){h+='<div class="slip"><h3>'+(s.url?'<a href="'+esc(s.url)+'" target="_blank" rel="noopener">'+esc(s.name)+'</a>':esc(s.name))+(s.structure?'<span class="tag">'+esc(s.structure)+'</span>':'')+'</h3>';
      for(const l of s.legs){h+='<div class="leg"><b>'+esc(l.player)+'</b> · '+esc(propName(l.prop))+' '+(l.side==='less'?'Under':'Over')+' '+esc(l.line)+'<div class="sub">'+esc(l.matchup||'')+(l.tip?' · '+esc(tipFmt(l.tip)):'')+(l.sub?' · replaced':'')+'</div>'+(l.off?'<div class="flag">off the board</div>':l.started?'<div class="flag">game started</div>':'')+'</div>'}
      h+='</div>'}}
  $('#app').innerHTML=h}
fetch(location.pathname.replace(/\\/$/,'')+'/data',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(r.status)).then(render).catch(e=>{$('#app').innerHTML='<p class="flag">Could not load ('+esc(e)+'). Pull down to retry.</p>'});
</script></body></html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.replace(/\/+$/, "").match(/^\/([A-Za-z0-9_-]{5,64})(\/data)?$/);
    try {
      if (url.pathname === "/health") return json({ ok: true, worker: "alphadog-v2-nba-friend", version: VERSION, hyperdrive: !!env.HYPERDRIVE });
      if (!m) return notFound();
      if (m[2]) { const d = await data(env, m[1]); return d ? json(d) : notFound(); }
      const ok = await withPg(env, sql => tokenOk(sql, m[1]));
      if (!ok) return notFound();
      return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
    } catch (err) { return json({ ok: false, error: String(err && err.message || err).slice(0, 200) }, 500); }
  }
};
