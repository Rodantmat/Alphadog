// ALPHADOG NBA JESSI PAGE (owner 2026-11-06): a separate, read-only Worker for Jessi (PrizePicks + Sleeper). Same build as the friend page (jstacks) but its own
// third-tier slips (nba_jessi.*), a unit per app on the owner's "earn the raise" ladder with the season's accumulated profit, a "Bet: $x" on every slip, and the
// best pairings as SINGLE-LEG deep links. Every load re-checks each leg against the apps' own boards (same leg checker as his Slips screen) and swaps a started /
// drifted / off-board leg from her own backup pool. Access: an unguessable token in the path (nba_config.classification_config 'jessi_page'.token); else 404.
// DEPLOY NOTE: the deploy script redeploys a worker when THIS file changes - bump VERSION with any change.
import { withPg, q } from "./main_ui/common.js";
import { overlayLive } from "./main_ui/livecheck.js";
import LOGO_B64 from "./main_ui/client/logo.png.b64.txt";

const VERSION = "alphadog-v2-nba-jessi-v1.1.4";   // v1.1.4 (owner 2026-11-10): subs also come from the app pairing list (best hit-chance legs), live-checked. // v1.1.3 prior;   // v1.1.2 (owner 2026-11-07): Sleeper pairings re-resolved against the live board, Fliff pairings listed without a link. // v1.1.0 (owner 2026-11-07): FLIFF added (PrizePicks, Sleeper, Fliff)
const APP_LABEL = { prizepicks: "PrizePicks", sleeper: "Sleeper", fliff: "Fliff" };
const APP_ORDER = ["prizepicks", "sleeper", "fliff"];
// the unit ladder (owner 2026-11-01): rung n starts at UPX x n(n-1)/2 of accumulated dollars ($2 at UPX, $3 at 3 UPX, $4 at 6 UPX ...), the same points going down.
// UPX is sized to the app's slips a day (3.5 per slip, as on his screen).
const UPX = { prizepicks: 10.5, sleeper: 7, fliff: 7 };
const PAIR_SHOW = { prizepicks: 8, sleeper: 5, fliff: 3 };
const HEAD_ICONS = `<link rel="icon" type="image/png" href="/icon.png"><link rel="apple-touch-icon" href="/icon.png"><link rel="manifest" href="/{{T}}/manifest.webmanifest"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Jessiquinha"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="theme-color" content="#0e1116">`;
const BRAND = `<div style="display:flex;align-items:center;gap:10px;margin:4px 0 12px"><img src="/icon.png" width="36" height="36" style="border-radius:8px" alt=""><h1 style="margin:0">Jessiquinha</h1></div>`;

const notFound = () => new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
function ptDate(d = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }

async function tokenOk(sql, token) {
  const r = await q(sql, "SELECT config_json FROM nba_config.classification_config WHERE config_key='jessi_page'", [], 6000);
  const t = r[0] && (typeof r[0].config_json === "string" ? JSON.parse(r[0].config_json) : r[0].config_json);
  return !!(t && t.token && token && String(t.token) === String(token));
}

const startedMs = l => { const t = Date.parse((l.link && l.link.tip_utc) || l.official_game_time_utc || ""); return Number.isFinite(t) ? t : null; };
const isBad = l => (l.source_key === "prizepicks" ? (l.pp_now && l.pp_now !== (l.want_odds || "standard")) : (l.live_now && l.live_now !== "ok"));

// replace a drifted / started leg from her own pool: same app, other player, never the opposite side of a player already on the day's slips, the slip's game cap, >= 2 teams
function autoSwap(out, now) {
  const slips = (out.generated_slips || []).filter(s => !s._pairs);
  // her bank = her own backup pool, then the app's pairing list (the best hit-chance legs of that app, ranked); a leg the live check marks gone / moved never goes in (owner 2026-11-10: "if it is not available, we get a sub")
  let pool = [...(out.backup_pool || [])];
  for (const ps of (out.generated_slips || []).filter(s => s._pairs)) for (const l of ps.legs) if (l.source_key !== "prizepicks" && !pool.some(c => c.source_key === l.source_key && c.player_name === l.player_name)) pool.push(l);
  pool = pool.filter(c => !isBad(c));
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
      if (k >= 0) { const c = pool.splice(k, 1)[0]; c.sub = true; s.legs[i] = c; }
      else l.off = true;
    });
  }
  out.backup_pool = pool.filter(c => !c._pair);
}

function legUrls(l) {   // one leg, one deep link: she taps it and pairs it with a taco or a discounted line inside the app
  if (!(l.link && l.link.ids)) return null;
  if (l.source_key === "prizepicks") return "https://app.prizepicks.com/board?projections=" + l.link.ids.projection_id + "-" + (l.selected_side === "less" ? "u" : "o") + "-" + l.line_value;
  if (l.source_key === "sleeper") return "https://sleeper.onelink.me/GF91?deep_link_value=entry_prefill&af_dp=sleeper://&deep_link_sub1=" + l.link.ids.line_id;
  return null;
}
function slipUrl(s, now) {
  const legs = (s.legs || []).filter(l => l.link && l.link.ids && !l.off && !(startedMs(l) != null && startedMs(l) <= now) && !isBad(l));
  if (legs.length < 2) return null;
  if (s.source_key === "prizepicks") return "https://app.prizepicks.com/board?projections=" + legs.map(l => l.link.ids.projection_id + "-" + (l.selected_side === "less" ? "u" : "o") + "-" + l.line_value).join(",");
  if (s.source_key === "sleeper") return "https://sleeper.onelink.me/GF91?deep_link_value=entry_prefill&af_dp=sleeper://&deep_link_sub1=" + legs.map(l => l.link.ids.line_id).join(",");
  return null;
}

// the unit ladder replayed over the season: each day's profit is the day's $1-per-slip profit x the unit in force that morning
function unitFor(acc, upx) { let n = 1; while (upx * (n + 1) * n / 2 <= acc + 1e-9) n++; return n; }
function ladder(rows, app) {
  const upx = UPX[app]; let acc = 0;
  for (const r of rows) { if (r.app !== app) continue; acc += unitFor(acc, upx) * r.p; }
  const u = unitFor(acc, upx);
  return { unit: u, acc: Math.round(acc * 100) / 100, next_at: Math.round(upx * u * (u + 1) / 2 * 100) / 100, down_below: u > 1 ? Math.round(upx * (u - 1) * u / 2 * 100) / 100 : null };
}

async function data(env, token, save = true) {
  return withPg(env, async sql => {
    if (!(await tokenOk(sql, token))) return null;
    const today = ptDate();
    const snaps = await q(sql, "SELECT game_date::text d, payload FROM nba_jessi.snapshot WHERE game_date = (SELECT max(game_date) FROM nba_jessi.snapshot WHERE game_date <= $1::date)", [today], 8000);
    const hist = await q(sql, `SELECT app, game_date::text d, sum(profit)::float p FROM nba_jessi.slips WHERE status='graded' AND game_date >= (SELECT season_start FROM nba_jessi.season) GROUP BY app, game_date ORDER BY game_date`, [], 8000);
    const units = {}; for (const a of APP_ORDER) units[a] = ladder(hist, a);
    const out = { ok: true, source: "live", generated_slips: [], backup_pool: [] };
    let date = null;
    for (const sn of snaps) {
      const pl = typeof sn.payload === "string" ? JSON.parse(sn.payload) : sn.payload;
      date = sn.d; out.generated_slips.push(...(pl.slips || [])); out.backup_pool.push(...(pl.pool || []));
    }
    if (date && date === today) {
      try {
        const pr = await q(sql, "SELECT app, kind, p::float p, leg FROM nba_jessi.pairs WHERE game_date = $1::date ORDER BY app, rank", [today], 6000);
        const by = {};
        for (const r of pr) { const l = typeof r.leg === "string" ? JSON.parse(r.leg) : r.leg; l.p = r.p; l._pair = true; l.kind = r.kind; if (r.app === "prizepicks" && r.kind !== "standard") l.want_odds = r.kind; (by[r.app] = by[r.app] || []).push(l); }
        for (const a of Object.keys(by)) out.generated_slips.push({ _pairs: true, source_key: a, name: "pairs", legs: by[a] });
      } catch (e) { /* pairs not built yet */ }
      try { await overlayLive(sql, out, null); autoSwap(out, Date.now()); } catch (e) { out.live_error = String(e && e.message || e).slice(0, 120); }
    }
    const now = Date.now();
    // SAVE AS SEEN (owner 2026-11-06): no save button here, so the slips as this page FIRST showed them on the day (after the leg check and swaps) are what the grade counts
    if (save && date && date === today && !out.live_error) {
      for (const s of out.generated_slips) {
        if (s._pairs) continue;
        try {
          const bad = s.legs.some(l => l.off || (startedMs(l) != null && startedMs(l) <= now) || isBad(l));
          await q(sql, "INSERT INTO nba_jessi.seen (game_date, app, slip_name, legs, skipped) VALUES ($1::date,$2,$3,$4::jsonb,$5) ON CONFLICT DO NOTHING", [today, s.source_key, s.name, JSON.stringify(s.legs), bad], 6000);
        } catch (e) { /* never blocks the page */ }
      }
      // AUDIT TRAIL (owner 2026-11-09): every distinct version of a slip this page showed today (the first one is the one graded; a later one means a leg drifted / started and was swapped
      // after the first open), and the backup pool as it stood at the first open of each app - so a mismatch between what was shown and what was placed can always be traced
      try {
        const lk = l => [l.player_name, l.canonical_prop_key, l.selected_side, l.line_value].join("|");
        for (const s of out.generated_slips) {
          if (s._pairs) continue;
          await q(sql, "INSERT INTO nba_jessi.seen_log (game_date, app, slip_name, sig, kind, legs) VALUES ($1::date,$2,$3,$4,'shown',$5::jsonb) ON CONFLICT DO NOTHING", [today, s.source_key, s.name, s.legs.map(lk).join(";"), JSON.stringify(s.legs.map(l => ({ player: l.player_name, prop: l.canonical_prop_key, side: l.selected_side, line: l.line_value, sub: !!l.sub, off: !!l.off })))], 6000);
        }
        for (const a of new Set(out.generated_slips.filter(x => !x._pairs).map(x => x.source_key))) {
          const pl = (out.backup_pool || []).filter(l => l.source_key === a).slice(0, 40).map(l => ({ player: l.player_name, prop: l.canonical_prop_key, side: l.selected_side, line: l.line_value, matchup: l.matchup || null }));
          await q(sql, "INSERT INTO nba_jessi.seen_log (game_date, app, slip_name, sig, kind, legs) VALUES ($1::date,$2,'pool','pool','pool',$3::jsonb) ON CONFLICT DO NOTHING", [today, a, JSON.stringify(pl)], 6000);
        }
      } catch (e) { /* never blocks the page */ }
    }
    const mapLeg = l => ({ player: l.player_name, prop: l.prop_label || l.canonical_prop_key, side: l.selected_side, line: l.line_value, matchup: l.matchup || null,
      tip: l.official_game_time_utc || (l.link && l.link.tip_utc) || null });
    const slips = (date === today ? out.generated_slips : []).filter(s => !s._pairs).map(s => ({ app: s.source_key, name: s.name, structure: s.structure_label, url: slipUrl(s, now), bet: units[s.source_key] ? units[s.source_key].unit : null,
      legs: s.legs.map(l => Object.assign(mapLeg(l), { sub: !!l.sub, off: !!l.off, started: startedMs(l) != null && startedMs(l) <= now })) }));
    const pairs = {};
    if (date === today) for (const s of out.generated_slips) {
      if (!s._pairs) continue;
      pairs[s.source_key] = s.legs.filter(l => !isBad(l) && !(startedMs(l) != null && startedMs(l) <= now) && (legUrls(l) || s.source_key === "fliff")).map(l => Object.assign(mapLeg(l), { p: l.p, kind: l.kind || "standard", url: legUrls(l) })).slice(0, PAIR_SHOW[s.source_key] * 2);
    }
    return { ok: true, version: VERSION, date, today, checked_at: new Date().toISOString(), order: APP_ORDER, labels: APP_LABEL, units, slips, pairs };
  });
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Jessiquinha</title>${HEAD_ICONS}
<style>
:root{--bg:#0e1116;--card:#171c24;--ink:#e8edf3;--mut:#8b97a6;--ok:#38c172;--bad:#ef4d4d;--line:#252c37;--acc:#6aa9ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.4 -apple-system,system-ui,Segoe UI,Roboto,sans-serif;padding:16px;max-width:640px;margin:0 auto}
h1{font-size:18px;margin:4px 0 12px}table{width:100%;border-collapse:collapse;background:var(--card);border-radius:12px;overflow:hidden}
td,th{padding:9px 12px;text-align:left;border-bottom:1px solid var(--line)}th{color:var(--mut);font-weight:600;font-size:12px;text-transform:uppercase}tr:last-child td{border-bottom:0}
.slip{background:var(--card);border-radius:12px;padding:12px 14px;margin:12px 0}.slip h3{margin:0 0 4px;font-size:15px}.slip h3 a{color:var(--acc);text-decoration:none}.tag{color:var(--mut);font-weight:400;font-size:12px;margin-left:6px}
.bet{display:inline-block;background:#1f2a1f;color:var(--ok);border-radius:999px;padding:2px 10px;font-weight:700;font-size:13px;margin:2px 0 8px}
.leg{padding:7px 0;border-top:1px solid var(--line)}.leg:first-of-type{border-top:0}.leg b{font-weight:600}.sub{color:var(--mut);font-size:12.5px}.flag{color:var(--bad);font-size:12px}
.spin{display:flex;gap:10px;align-items:center;color:var(--mut);padding:24px 0}.dot{width:16px;height:16px;border:3px solid var(--line);border-top-color:var(--acc);border-radius:50%;animation:r 0.8s linear infinite}@keyframes r{to{transform:rotate(360deg)}}
h2{font-size:15px;margin:18px 0 4px;color:var(--mut);text-transform:uppercase;letter-spacing:.04em}
.pair{background:var(--card);border-radius:12px;padding:10px 14px;margin:8px 0}.pair summary{cursor:pointer;font-weight:600;list-style:none}.pair summary::-webkit-details-marker{display:none}.pair[open] summary{margin-bottom:6px}
.pl{display:block;color:inherit;text-decoration:none}.pl .go{color:var(--acc);font-size:12px}
</style></head><body>${BRAND}<div id="app"><div class="spin"><div class="dot"></div><span>Checking every leg on every app…</span></div></div>
<script>
const $=s=>document.querySelector(s);const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const DL=String.fromCharCode(36);const money=v=>v==null?'—':DL+Number(v).toFixed(2);
const tipFmt=t=>{if(!t)return'';const d=new Date(t);return isNaN(d)?'':d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})};
const propName=p=>String(p).replace(/_/g,' ').replace('threes made','3-pointers made').split(' ').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
function render(d){
  let h='<table><tr><th>App</th><th>Unit</th><th>Next increase</th><th>Accumulated</th></tr>';
  for(const a of d.order){const u=d.units[a];h+='<tr><td>'+esc(d.labels[a])+'</td><td>'+money(u.unit)+'</td><td>'+money(u.unit+1)+' at '+money(u.next_at)+'</td><td>'+money(u.acc)+'</td></tr>'}
  h+='</table>';
  if(!d.slips.length)h+='<p class="sub" style="margin-top:16px">No slips right now. They appear here once the day\\'s lineups are set.</p>';
  for(const a of d.order){const ss=d.slips.filter(s=>s.app===a);if(!ss.length)continue;h+='<h2>'+esc(d.labels[a])+'</h2>';
    for(const s of ss){h+='<div class="slip"><h3>'+(s.url?'<a href="'+esc(s.url)+'" target="_blank" rel="noopener">'+esc(s.name)+'</a>':esc(s.name))+(s.structure?'<span class="tag">'+esc(s.structure)+'</span>':'')+'</h3>'+(s.bet!=null?'<div class="bet">Bet: '+money(s.bet)+'</div>':'');
      for(const l of s.legs){h+='<div class="leg"><b>'+esc(l.player)+'</b> · '+esc(propName(l.prop))+' '+(l.side==='less'?'Under':'Over')+' '+esc(l.line)+'<div class="sub">'+esc(l.matchup||'')+(l.tip?' · '+esc(tipFmt(l.tip)):'')+(l.sub?' · replaced':'')+'</div>'+(l.off?'<div class="flag">off the board</div>':l.started?'<div class="flag">game started</div>':'')+'</div>'}
      h+='</div>'}}
  h+='<div id="pairsBox"></div>';
  $('#app').innerHTML=h;window.PD=d;drawPairs()}
var SHOW={prizepicks:8,sleeper:5,fliff:3};var pOpen={};
function drawPairs(){var d=window.PD;if(!d)return;var box=document.getElementById('pairsBox');if(!box)return;
  var pr=d.pairs||{};var now=Date.now();var h='';var any=false;
  d.order.forEach(function(a){var ls=(pr[a]||[]).filter(function(l){var t=l.tip?Date.parse(l.tip):NaN;return !(t&&t<=now)}).slice(0,SHOW[a]||5);if(!ls.length)return;
    if(!any){h+='<h2>Best pairings of the day</h2><p class="sub">The legs most likely to hit, for an easy pairing. Tap a leg to open just that leg in the app, then add your own. A leg whose game has started or whose line changed is replaced automatically.</p>';any=true}
    h+='<details class="pair" data-a="'+a+'"'+(pOpen[a]?' open':'')+'><summary>'+esc(d.labels[a])+'<span class="tag">'+ls.length+' legs</span></summary>';
    ls.forEach(function(l){h+='<div class="leg"><'+(l.url?'a class="pl" href="'+esc(l.url)+'" target="_blank" rel="noopener"':'div')+'><b>'+esc(l.player)+'</b> · '+esc(propName(l.prop))+' '+(l.side==='less'?'Under':'Over')+' '+esc(l.line)+'<div class="sub">'+esc(l.matchup||'')+(l.tip?' · '+esc(tipFmt(l.tip)):'')+' · '+(l.p*100).toFixed(1)+'% hit chance'+(l.kind&&l.kind!=='standard'?' · '+esc(l.kind.charAt(0).toUpperCase()+l.kind.slice(1)):'')+' '+(l.url?'<span class="go">Open in app ›</span>':'')+'</div></'+(l.url?'a':'div')+'></div>'});
    h+='</details>'});
  box.innerHTML=h;box.querySelectorAll('details.pair').forEach(function(el){el.addEventListener('toggle',function(){pOpen[el.dataset.a]=el.open})})}
setInterval(drawPairs,60000);
fetch(location.pathname.replace(/\\/$/,'')+'/data',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(r.status)).then(render).catch(e=>{$('#app').innerHTML='<p class="flag">Could not load ('+esc(e)+'). Pull down to retry.</p>'});
</script></body></html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.replace(/\/+$/, "").match(/^\/([A-Za-z0-9_-]{5,64})(\/data|\/manifest\.webmanifest)?$/);
    try {
      if (url.pathname === "/icon.png") { const bin = Uint8Array.from(atob(String(LOGO_B64).trim()), c => c.charCodeAt(0)); return new Response(bin, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } }); }
      if (url.pathname === "/health") return json({ ok: true, worker: "alphadog-v2-nba-jessi", version: VERSION, hyperdrive: !!env.HYPERDRIVE });
      if (!m) return notFound();
      if (m[2] === "/manifest.webmanifest") {
        if (!(await withPg(env, sql => tokenOk(sql, m[1])))) return notFound();
        return new Response(JSON.stringify({ name: "Jessiquinha", short_name: "Jessiquinha", start_url: "/" + m[1], scope: "/", display: "standalone", background_color: "#0e1116", theme_color: "#0e1116",
          icons: [{ src: "/icon.png", sizes: "192x192", type: "image/png", purpose: "any" }] }), { headers: { "content-type": "application/manifest+json", "cache-control": "no-store" } });
      }
      if (m[2] === "/data") { const d = await data(env, m[1], !url.searchParams.has("nosave")); return d ? json(d) : notFound(); }
      if (!(await withPg(env, sql => tokenOk(sql, m[1])))) return notFound();
      return new Response(PAGE.replaceAll("{{T}}", m[1]), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
    } catch (err) { return json({ ok: false, error: String(err && err.message || err).slice(0, 200) }, 500); }
  }
};
