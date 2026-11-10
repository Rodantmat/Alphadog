// ALPHADOG NBA FRIEND PAGE (owner 2026-11-05): a separate, read-only Worker for a friend. Shows only the season-so-far ROI per app + total and the
// day's slips for the five apps (PrizePicks, Underdog, Sleeper, Betr, Fliff) with deep links, re-checked live against every app's board on every load and
// auto-swapped from the friend's own backup pool. Own tables (nba_friend.*), no save button, no units, no strategy text. Access: an unguessable token in the
// path (nba_config.classification_config 'friend_page'.token); anything else is a plain 404. Reads nothing of the owner's UI, writes nothing.
// DEPLOY NOTE: the deploy script redeploys a worker when THIS file changes - bump VERSION with any change.
import { withPg, q } from "./main_ui/common.js";
import { overlayLive } from "./main_ui/livecheck.js";
import LOGO_B64 from "./main_ui/client/logo.png.b64.txt";

const VERSION = "alphadog-v2-nba-friend-v1.7.1";   // v1.7.0 (owner 2026-11-10): every leg has a checkbox - untick it and a sub comes in; started / off-board legs swap themselves. //   // owner 2026-11-10: unconfirmed legs are missing; tip-offs filled.
// prior:
const HEAD_ICONS = `<link rel="icon" type="image/png" href="/icon.png"><link rel="apple-touch-icon" href="/icon.png"><link rel="manifest" href="/{{T}}/manifest.webmanifest"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="JStacks"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="theme-color" content="#0e1116">`;
const BRAND = `<div style="display:flex;align-items:center;gap:10px;margin:4px 0 12px"><img src="/icon.png" width="36" height="36" style="border-radius:8px" alt=""><h1 style="margin:0">AlphaDog-JStacks</h1></div>`;
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

const legLid = l => { const i = l.link && l.link.ids; if (!i) return null; if (l.source_key === "prizepicks") return i.projection_id ? i.projection_id + "-" + (l.selected_side === "less" ? "u" : "o") + "-" + l.line_value : null; return l.source_key === "sleeper" && i.line_id ? String(i.line_id) : null; };
const startedMs = l => { const t = Date.parse((l.link && l.link.tip_utc) || l.official_game_time_utc || ""); return Number.isFinite(t) ? t : null; };
const isBad = l => (l.source_key === "prizepicks" ? (l.pp_now && l.pp_now !== (l.want_odds || "standard")) : (l.live_now && l.live_now !== "ok"));

// replace a drifted / started leg from the friend's own pool: same app, other player, never the opposite side of a player already on the day's slips,
// the slip's game cap, >= 2 teams, best edge first
function autoSwap(out, now) {
  const slips = (out.generated_slips || []).filter(s => !s._pairs); let pool = [...(out.backup_pool || [])];
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

// BEST PAIRINGS (owner 2026-11-06): the day's most likely legs per app (nba_friend.pairs), live-checked with the slips; a leg that is off the board or started is left out
const PAIR_SHOW = { prizepicks: 8, underdog: 5, sleeper: 5, fliff: 3, betr: 3 };
function pairsOut(out, now, on) {
  const r = {}; if (!on) return r;
  for (const s of out.generated_slips || []) {
    if (!s._pairs) continue;
    r[s.source_key] = s.legs.filter(l => !isBad(l) && !(startedMs(l) != null && startedMs(l) <= now)).map(l => ({ player: l.player_name, prop: l.prop_label || l.canonical_prop_key, side: l.selected_side, line: l.line_value,
      matchup: l.matchup || null, tip: l.official_game_time_utc || (l.link && l.link.tip_utc) || null, p: l.p, kind: l.kind || "standard" })).slice(0, PAIR_SHOW[s.source_key] * 2);   // the pool the page fills from (twice the shown count: the page drops a leg whose game starts and takes the next)
  }
  return r;
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

async function data(env, token, save = true) {
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
    if (date && date === today) {
      try {
        const pr = await q(sql, "SELECT app, kind, p::float p, leg FROM nba_friend.pairs WHERE game_date = $1::date ORDER BY app, rank", [today], 6000);
        const by = {};
        for (const r of pr) { const l = typeof r.leg === "string" ? JSON.parse(r.leg) : r.leg; l.p = r.p; l.kind = r.kind; if (r.app === "prizepicks" && r.kind !== "standard") l.want_odds = r.kind; (by[r.app] = by[r.app] || []).push(l); }
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
          await q(sql, "INSERT INTO nba_friend.seen (game_date, app, slip_name, legs, skipped) VALUES ($1::date,$2,$3,$4::jsonb,$5) ON CONFLICT DO NOTHING", [today, s.source_key, s.name, JSON.stringify(s.legs), bad], 6000);
        } catch (e) { /* never blocks the page */ }
      }
      // AUDIT TRAIL (owner 2026-11-09): every distinct version of a slip this page showed today (the first one is the one graded; a later one means a leg drifted / started and was swapped
      // after the first open), and the backup pool as it stood at the first open of each app - so a mismatch between what was shown and what was placed can always be traced
      try {
        const lk = l => [l.player_name, l.canonical_prop_key, l.selected_side, l.line_value].join("|");
        for (const s of out.generated_slips) {
          if (s._pairs) continue;
          await q(sql, "INSERT INTO nba_friend.seen_log (game_date, app, slip_name, sig, kind, legs) VALUES ($1::date,$2,$3,$4,'shown',$5::jsonb) ON CONFLICT DO NOTHING", [today, s.source_key, s.name, s.legs.map(lk).join(";"), JSON.stringify(s.legs.map(l => ({ player: l.player_name, prop: l.canonical_prop_key, side: l.selected_side, line: l.line_value, sub: !!l.sub, off: !!l.off })))], 6000);
        }
        for (const a of new Set(out.generated_slips.filter(x => !x._pairs).map(x => x.source_key))) {
          const pl = (out.backup_pool || []).filter(l => l.source_key === a).slice(0, 40).map(l => ({ player: l.player_name, prop: l.canonical_prop_key, side: l.selected_side, line: l.line_value, matchup: l.matchup || null }));
          await q(sql, "INSERT INTO nba_friend.seen_log (game_date, app, slip_name, sig, kind, legs) VALUES ($1::date,$2,'pool','pool','pool',$3::jsonb) ON CONFLICT DO NOTHING", [today, a, JSON.stringify(pl)], 6000);
        }
      } catch (e) { /* never blocks the page */ }
    }
    const slips = (date === today ? out.generated_slips : []).filter(s => !s._pairs).map(s => ({ app: s.source_key, name: s.name, structure: s.structure_label, url: linkUrl(s, now),
      legs: s.legs.map(l => ({ player: l.player_name, prop: l.prop_label || l.canonical_prop_key, side: l.selected_side, line: l.line_value, matchup: l.matchup || null, tip: l.official_game_time_utc || (l.link && l.link.tip_utc) || null,
        sub: !!l.sub, off: !!l.off, started: startedMs(l) != null && startedMs(l) <= now, status: l.source_key === "prizepicks" ? l.pp_now || null : l.live_now || null, team: l.team_abbr || null, lid: legLid(l) })), gcap: s.game_cap || 1 }));
    const pairLegs = (out.generated_slips || []).filter(x => x._pairs).flatMap(x => x.legs);
    const cpool = date === today ? [...(out.backup_pool || []), ...pairLegs].filter(l => !isBad(l) && !(startedMs(l) != null && startedMs(l) <= now) && !l.off)
      .map(l => ({ app: l.source_key, player: l.player_name, prop: l.prop_label || l.canonical_prop_key, side: l.selected_side, line: l.line_value, matchup: l.matchup || null, tip: l.official_game_time_utc || (l.link && l.link.tip_utc) || null, team: l.team_abbr || null, lid: legLid(l), p: Number(l.p) || (Number(l.estimated_hit_probability_0_100) / 100) || 0 })).sort((x, y) => y.p - x.p) : [];
    return { ok: true, version: VERSION, date, today, checked_at: new Date().toISOString(), live: out.pp_live ? { ms: out.pp_live.total_ms, flagged: out.pp_live.flagged.length } : null,
      roi: { apps, total: n ? { n, roi: p / n } : null }, order: APP_ORDER, labels: APP_LABEL, slips, pairs: pairsOut(out, now, date === today), pool: cpool };
  });
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>AlphaDog-JStacks</title>${HEAD_ICONS}
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
.pair{background:var(--card);border-radius:12px;padding:10px 14px;margin:8px 0}.pair summary{cursor:pointer;font-weight:600;list-style:none}.pair summary::-webkit-details-marker{display:none}.pair[open] summary{margin-bottom:6px}
</style></head><body>${BRAND}<div id="app"><div class="spin"><div class="dot"></div><span>Checking every leg on every app…</span></div></div>
<script>
const $=s=>document.querySelector(s);const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pct=v=>v==null?'—':(v>=0?'+':'')+(v*100).toFixed(1)+'%';const cls=v=>v==null?'':(v>=0?'pos':'neg');
const tipFmt=t=>{if(!t)return'';const d=new Date(t);return isNaN(d)?'':d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})};
const propName=p=>String(p).replace(/_/g,' ').replace('threes made','3-pointers made').replace(/\\b\\w/g,c=>c.toUpperCase());
var DL=String.fromCharCode(36);var money=function(v){return v==null?'—':DL+Number(v).toFixed(2)};
function started(l){var t=l.tip?Date.parse(l.tip):NaN;return !!t&&t<=Date.now()}
function alive(s){return s.legs.filter(function(l){return !l.dropped})}
function lidUrl(app,ls){var ids=ls.map(function(l){return l.lid});if(ids.length<2||ids.some(function(x){return !x}))return null;
  if(app==='prizepicks')return 'https://app.prizepicks.com/board?projections='+ids.join(',');
  if(app==='sleeper')return 'https://sleeper.onelink.me/GF91?deep_link_value=entry_prefill&af_dp=sleeper://&deep_link_sub1='+ids.join(',');return null}
function canTake(s,c){var k=alive(s);if(c.app!==s.app||started(c)||c.bad)return false;
  if(k.some(function(x){return x.player===c.player}))return false;
  if(k.filter(function(x){return x.matchup&&x.matchup===c.matchup}).length>=(s.gcap||1))return false;
  var tm=k.map(function(x){return x.team}).concat([c.team]);if(tm.every(Boolean)&&new Set(tm).size<2)return false;return true}
function pickSub(s){var P=window.PD.pool||[];for(var i=0;i<P.length;i++){if(canTake(s,P[i]))return P.splice(i,1)[0]}return null}
function dropLeg(s,l,why){l.dropped=true;l.why=why||null;var c=pickSub(s);if(c){c.sub=true;l.sub_in=c;s.legs.push(c)}s.changed=true}
function restoreLeg(s,l){l.dropped=false;l.why=null;if(l.sub_in){var i=s.legs.indexOf(l.sub_in);if(i>=0)s.legs.splice(i,1);window.PD.pool.unshift(l.sub_in);l.sub_in=null}}
function sweep(s){var ch=false;for(var i=0;i<s.legs.length;i++){var l=s.legs[i];if(l.dropped)continue;if(l.off||l.started||started(l)){dropLeg(s,l,l.off?'off the board':'game started');ch=true}}return ch}
function initSwap(d){window.PD=d;d.pool=(d.pool||[]).slice();d.slips.forEach(function(s){sweep(s)})}
function slipHtml(s,si){var k=alive(s);var url=s.changed?lidUrl(s.app,k):s.url;
  var h='<div class="slip" id="slip'+si+'"><h3>'+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener">'+esc(s.name)+'</a>':esc(s.name))+(s.structure?'<span class="tag">'+esc(s.structure)+'</span>':'')+'</h3>'+(s.bet!=null?'<div class="bet">Bet: '+money(s.bet)+'</div>':'');
  s.legs.forEach(function(l,li){h+='<label class="leg" style="display:block'+(l.dropped?';opacity:.45;text-decoration:line-through':'')+'"><input type="checkbox" class="kb" data-si="'+si+'" data-li="'+li+'"'+(l.dropped?'':' checked')+' style="float:right;width:20px;height:20px"><b>'+esc(l.player)+'</b> · '+esc(propName(l.prop))+' '+(l.side==='less'?'Under':'Over')+' '+esc(l.line)+'<div class="sub">'+esc(l.matchup||'')+(l.tip?' · '+esc(tipFmt(l.tip)):'')+(l.sub?' · SUB':'')+'</div>'+(l.dropped&&l.why?'<div class="flag">'+esc(l.why)+'</div>':'')+'</label>'});
  if(k.length<2)h+='<div class="flag">Not enough legs kept (min 2)</div>';return h+'</div>'}
function redraw(si){var s=window.PD.slips[si],el=document.getElementById('slip'+si);if(!s||!el)return;var t=document.createElement('div');t.innerHTML=slipHtml(s,si);el.replaceWith(t.firstChild)}
document.addEventListener('change',function(e){var t=e.target;if(!t||!t.classList||!t.classList.contains('kb'))return;var si=+t.dataset.si,li=+t.dataset.li,s=window.PD.slips[si],l=s.legs[li];if(t.checked)restoreLeg(s,l);else dropLeg(s,l,'you unchecked it');redraw(si)});
setInterval(function(){if(!window.PD)return;window.PD.slips.forEach(function(s,si){if(sweep(s))redraw(si)})},60000);
function render(d){
  initSwap(d);
  let h='<table><tr><th>Season so far</th><th>ROI</th></tr>';
  for(const a of d.order){const r=d.roi.apps[a];h+='<tr><td>'+esc(d.labels[a])+'</td><td class="'+cls(r&&r.roi)+'">'+pct(r&&r.roi)+'</td></tr>'}
  h+='<tr class="tot"><td>Total</td><td class="'+cls(d.roi.total&&d.roi.total.roi)+'">'+pct(d.roi.total&&d.roi.total.roi)+'</td></tr></table>';
  if(!d.slips.length)h+='<p class="sub" style="margin-top:16px">No slips right now. They appear here once the day\\'s lineups are set.</p>';
  for(const a of d.order){const ss=d.slips.filter(s=>s.app===a);if(!ss.length)continue;h+='<h2>'+esc(d.labels[a])+'</h2>';
    for(const s of ss){h+=slipHtml(s,d.slips.indexOf(s))}}
  h+='<div id="pairsBox"></div>';
  $('#app').innerHTML=h;window.PD=d;drawPairs()}
var SHOW={prizepicks:8,underdog:5,sleeper:5,fliff:3,betr:3};var pOpen={};
function drawPairs(){var d=window.PD;if(!d)return;var box=document.getElementById('pairsBox');if(!box)return;
  var pr=d.pairs||{};var now=Date.now();var h='';var any=false;
  d.order.forEach(function(a){var ls=(pr[a]||[]).filter(function(l){var t=l.tip?Date.parse(l.tip):NaN;return !(t&&t<=now)}).slice(0,SHOW[a]||3);if(!ls.length)return;
    if(!any){h+='<h2>Best pairings of the day</h2><p class="sub">The legs most likely to hit, for an easy pairing. Tap an app to open its list. A leg whose game has started or whose line changed is replaced automatically.</p>';any=true}
    h+='<details class="pair" data-a="'+a+'"'+(pOpen[a]?' open':'')+'><summary>'+esc(d.labels[a])+'<span class="tag">'+ls.length+' legs</span></summary>';
    ls.forEach(function(l){h+='<div class="leg"><b>'+esc(l.player)+'</b> · '+esc(propName(l.prop))+' '+(l.side==='less'?'Under':'Over')+' '+esc(l.line)+'<div class="sub">'+esc(l.matchup||'')+(l.tip?' · '+esc(tipFmt(l.tip)):'')+' · '+(l.p*100).toFixed(1)+'% hit chance'+(l.kind&&l.kind!=='standard'?' · '+esc(l.kind.charAt(0).toUpperCase()+l.kind.slice(1)):'')+'</div></div>'});
    h+='</details>'});
  box.innerHTML=h;box.querySelectorAll('details.pair').forEach(function(el){el.addEventListener('toggle',function(){pOpen[el.dataset.a]=el.open})})}
setInterval(drawPairs,60000);
fetch(location.pathname.replace(/\\/$/,'')+'/data',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(r.status)).then(render).catch(e=>{$('#app').innerHTML='<p class="flag">Could not load ('+esc(e)+'). Pull down to retry.</p>'});
</script></body></html>`;

const REPORT = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>AlphaDog-JStacks Track Record</title>${HEAD_ICONS}
<style>
:root{--bg:#0e1116;--card:#171c24;--ink:#e8edf3;--mut:#8b97a6;--ok:#38c172;--bad:#ef4d4d;--line:#252c37;--acc:#6aa9ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 -apple-system,system-ui,Segoe UI,Roboto,sans-serif;padding:16px;max-width:900px;margin:0 auto}
h1{font-size:20px;margin:6px 0 2px}h2{font-size:14px;margin:26px 0 8px;color:var(--mut);text-transform:uppercase;letter-spacing:.04em}.sub{color:var(--mut);font-size:13px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:14px 0}.c{background:var(--card);border-radius:12px;padding:12px}.c b{display:block;font-size:20px}.c span{color:var(--mut);font-size:12px}
.wrap{overflow-x:auto;background:var(--card);border-radius:12px}table{width:100%;border-collapse:collapse;min-width:520px}td,th{padding:8px 10px;text-align:right;border-bottom:1px solid var(--line);white-space:nowrap}
td:first-child,th:first-child{text-align:left}th{color:var(--mut);font-weight:600;font-size:11.5px;text-transform:uppercase}tr:last-child td{border-bottom:0}.tot td{font-weight:700}
.pos{color:var(--ok)}.neg{color:var(--bad)}.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 10px}.tabs button{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer}.tabs button.on{background:var(--acc);color:#071018;border-color:var(--acc)}
.note{background:var(--card);border-radius:12px;padding:12px 14px;color:var(--mut);font-size:13px;margin-top:10px}.note b{color:var(--ink)}svg{width:100%;height:auto;background:var(--card);border-radius:12px}
.lg{display:flex;gap:12px;flex-wrap:wrap;margin:8px 0;font-size:13px}.lg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px}
.spin{color:var(--mut);padding:24px 0}
</style></head><body>${BRAND}<div class="sub" style="margin-bottom:6px">Track record</div><div class="sub">Every slip graded, one dollar on every slip. Seasons 2024-25, 2025-26 and 2026-27 to date.</div><div id="app" class="spin">Loading…</div>
<script>
var DL=String.fromCharCode(36);
var $=function(s){return document.querySelector(s)};var esc=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
var COL={prizepicks:'#6aa9ff',underdog:'#f5b942',sleeper:'#38c172',betr:'#e0679a',fliff:'#a78bfa'};
var HC=0.95;var D=null,SEAS='all',DAYAPP='prizepicks',DAYSEAS='all';
function seasonOf(d){var y=+d.slice(0,4),m=+d.slice(5,7);var s=m>=8?y:y-1;return s+'-'+String(s+1).slice(2)}
function money(v){return (v>=0?'+':'-')+DL+Math.abs(v).toFixed(2)}function pct(v){return (v>=0?'+':'')+(v*100).toFixed(1)+'%'}function cls(v){return v>=0?'pos':'neg'}
function adj(v){return v>0?v*HC:v}
function stats(rows){var n=0,p=0,h=0,w=0,c=0,pk=0,dd=0,dry=0,cur=0;rows.forEach(function(r){n+=r.n;p+=r.p;h+=adj(r.p);w+=r.w;c+=r.p;if(c>pk)pk=c;if(pk-c>dd)dd=pk-c;if(r.p<=0){cur++;if(cur>dry)dry=cur}else cur=0});
  return {n:n,days:rows.length,profit:p,wins:w,roi:n?p/n:0,hc:h,dd:dd,dry:dry}}
function rowsFor(app,seas){return D.rows.filter(function(r){return r.app===app&&(seas==='all'||r.s===seas)})}
function render(){
  var seasons=['all'].concat(D.seasons);var h='';
  var tot=0,tn=0;var cards='';
  D.order.forEach(function(a){var st=stats(rowsFor(a,'all'));tot+=st.hc;tn+=st.n;cards+='<div class="c"><span>'+esc(D.labels[a])+'</span><b class="'+cls(st.hc)+'">'+money(st.hc)+'</b><span>on '+st.n+' slips, after the 5% cut</span></div>'});
  h+='<div class="cards">'+cards+'<div class="c"><span>All five apps</span><b class="'+cls(tot)+'">'+money(tot)+'</b><span>on '+tn+' slips, 1 dollar each</span></div></div>';
  h+='<h2>Summary by app</h2><div class="tabs">'+seasons.map(function(s){return '<button class="'+(s===SEAS?'on':'')+'" data-s="'+s+'">'+(s==='all'?'All seasons':s)+'</button>'}).join('')+'</div>';
  h+='<div class="wrap"><table><tr><th>App</th><th>Slips</th><th>Slips won</th><th>Profit</th><th>ROI</th><th>ROI after 5% cut</th><th>Max drawdown</th><th>Longest dry run (days)</th></tr>';
  var T=[];D.order.forEach(function(a){var rs=rowsFor(a,SEAS);if(!rs.length)return;T=T.concat(rs);var st=stats(rs);
    h+='<tr><td>'+esc(D.labels[a])+'<div class="sub">'+esc(D.struct[a])+'</div></td><td>'+st.n+'</td><td>'+Math.round(100*st.wins/st.n)+'%</td><td class="'+cls(st.profit)+'">'+money(st.profit)+'</td><td class="'+cls(st.roi)+'">'+pct(st.roi)+'</td><td class="'+cls(st.roi)+'">'+pct(st.hc/st.n)+'</td><td>'+DL+st.dd.toFixed(2)+'</td><td>'+st.dry+'</td></tr>'});
  var n=0,p=0,hh=0;T.forEach(function(r){n+=r.n;p+=r.p;hh+=adj(r.p)});
  h+='<tr class="tot"><td>Total</td><td>'+n+'</td><td></td><td class="'+cls(p)+'">'+money(p)+'</td><td class="'+cls(p)+'">'+(n?pct(p/n):'')+'</td><td class="'+cls(hh)+'">'+(n?pct(hh/n):'')+'</td><td></td><td></td></tr></table></div>';
  h+='<div class="note"><b>How to read it.</b> Profit is in dollars with one dollar on every slip: a slip that loses is -1 dollar, a win is its payout minus the dollar. "After 5% cut" takes 5% off every winning payout, to allow for lines that move between our build and your entry; losses stay as they are. Max drawdown is the biggest drop from a peak in the running total; dry run is the longest streak of days that did not make money.</div>';
  h+='<h2>Running total, one dollar on every slip</h2>'+chart()+'<div class="lg">'+D.order.map(function(a){return '<span><i style="background:'+COL[a]+'"></i>'+esc(D.labels[a])+'</span>'}).join('')+'</div>';
  h+='<h2>Day by day</h2><div class="tabs">'+D.order.map(function(a){return '<button class="'+(a===DAYAPP?'on':'')+'" data-a="'+a+'">'+esc(D.labels[a])+'</button>'}).join('')+'</div><div class="tabs">'+seasons.map(function(s){return '<button class="'+(s===DAYSEAS?'on':'')+'" data-d="'+s+'">'+(s==='all'?'All seasons':s)+'</button>'}).join('')+'</div>';
  var rs=rowsFor(DAYAPP,'all');var cum=0;var cu={};rs.forEach(function(r){cum+=r.p;cu[r.d]=cum});
  var shown=rs.filter(function(r){return DAYSEAS==='all'||r.s===DAYSEAS}).slice().reverse();
  h+='<div class="wrap"><table><tr><th>Date</th><th>Slips</th><th>Won</th><th>Day result</th><th>Running total (all seasons)</th></tr>'+shown.map(function(r){return '<tr><td>'+r.d+'</td><td>'+r.n+'</td><td>'+r.w+'</td><td class="'+cls(r.p)+'">'+money(r.p)+'</td><td class="'+cls(cu[r.d])+'">'+money(cu[r.d])+'</td></tr>'}).join('')+'</table></div>';
  h+='<div class="note"><b>About the history.</b> '+esc(D.notes)+'</div>';
  $('#app').className='';$('#app').innerHTML=h;
  Array.prototype.forEach.call(document.querySelectorAll('button[data-s]'),function(b){b.onclick=function(){SEAS=b.getAttribute('data-s');render()}});
  Array.prototype.forEach.call(document.querySelectorAll('button[data-a]'),function(b){b.onclick=function(){DAYAPP=b.getAttribute('data-a');render()}});
  Array.prototype.forEach.call(document.querySelectorAll('button[data-d]'),function(b){b.onclick=function(){DAYSEAS=b.getAttribute('data-d');render()}});
}
function chart(){
  var dates=[];D.rows.forEach(function(r){if(dates.indexOf(r.d)<0)dates.push(r.d)});dates.sort();var W=860,H=300,L=50,R=10,T=10,B=24;
  var series=D.order.map(function(a){var c=0,m={};rowsFor(a,'all').forEach(function(r){c+=adj(r.p);m[r.d]=c});var last=0;return {a:a,pts:dates.map(function(d){if(m[d]!=null)last=m[d];return last})}});
  var mn=0,mx=1;series.forEach(function(s){s.pts.forEach(function(v){if(v<mn)mn=v;if(v>mx)mx=v})});
  var x=function(i){return L+(W-L-R)*i/Math.max(1,dates.length-1)},y=function(v){return T+(H-T-B)*(1-(v-mn)/(mx-mn))};
  var g='';var step=Math.max(10,Math.ceil((mx-mn)/5/10)*10);for(var t=Math.ceil(mn/step)*step;t<=mx;t+=step){g+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(t)+'" y2="'+y(t)+'" stroke="#252c37"/><text x="'+(L-6)+'" y="'+(y(t)+4)+'" fill="#8b97a6" font-size="11" text-anchor="end">'+DL+t+'</text>'}
  var lab='';['2024-10','2025-10','2026-10'].forEach(function(m){var i=dates.findIndex(function(d){return d.slice(0,7)>=m});if(i>=0)lab+='<text x="'+x(i)+'" y="'+(H-6)+'" fill="#8b97a6" font-size="11">'+m+'</text>'});
  var ls=series.map(function(s){return '<polyline fill="none" stroke="'+COL[s.a]+'" stroke-width="2" points="'+s.pts.map(function(v,i){return x(i).toFixed(1)+','+y(v).toFixed(1)}).join(' ')+'"/>'}).join('');
  return '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Running total per app">'+g+lab+ls+'</svg>'}
fetch(location.pathname.replace(/\\/report\\/?$/,'')+'/report-data',{cache:'no-store'}).then(function(r){return r.ok?r.json():Promise.reject(r.status)}).then(function(d){D=d;D.rows.forEach(function(r){r.s=seasonOf(r.d)});D.seasons=[];D.rows.forEach(function(r){if(D.seasons.indexOf(r.s)<0)D.seasons.push(r.s)});D.seasons.sort();render()}).catch(function(e){$('#app').textContent='Could not load ('+e+').'});
</script></body></html>`;

async function reportData(env, token) {
  return withPg(env, async sql => {
    if (!(await tokenOk(sql, token))) return null;
    const rows = await q(sql, "SELECT app, game_date::text d, count(*)::int n, sum(profit)::float p, sum((profit>0)::int)::int w FROM nba_friend.slips WHERE status='graded' GROUP BY 1,2 ORDER BY 2,1", [], 15000);
    return { ok: true, order: APP_ORDER, labels: APP_LABEL, rows,
      struct: { prizepicks: "4-pick Flex + 3-pick Power", underdog: "4-pick Flex", sleeper: "3-pick Flex", betr: "4-pick Dynamic", fliff: "3-pick Max" },
      notes: "Every slip was rebuilt day by day with the same rules used today and graded on the real box scores, one dollar a slip. PrizePicks and Underdog history uses the real boards of each day. For Sleeper, Betr and Fliff, the 2024-25 and 2025-26 seasons use modelled boards (the sportsbooks' main lines priced with each app's measured payout rules); only 2026-27 uses the apps' real boards, so treat those two seasons as a close estimate, not an exact record. The 2026-27 season is small so far, so its numbers can swing a lot." };
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.replace(/\/+$/, "").match(/^\/([A-Za-z0-9_-]{5,64})(\/data|\/report|\/report-data|\/manifest\.webmanifest)?$/);
    try {
      if (url.pathname === "/icon.png") { const bin = Uint8Array.from(atob(String(LOGO_B64).trim()), c => c.charCodeAt(0)); return new Response(bin, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } }); }
      if (m && m[2] === "/manifest.webmanifest") {
        const okm = await withPg(env, sql => tokenOk(sql, m[1]));
        if (!okm) return notFound();
        return new Response(JSON.stringify({ name: "AlphaDog-JStacks", short_name: "JStacks", start_url: "/" + m[1], scope: "/", display: "standalone", background_color: "#0e1116", theme_color: "#0e1116",
          icons: [{ src: "/icon.png", sizes: "192x192", type: "image/png", purpose: "any" }] }), { headers: { "content-type": "application/manifest+json", "cache-control": "no-store" } });
      }
      if (url.pathname === "/health") return json({ ok: true, worker: "alphadog-v2-nba-friend", version: VERSION, hyperdrive: !!env.HYPERDRIVE });
      if (!m) return notFound();
      if (m[2] === "/report-data") { const d = await reportData(env, m[1]); return d ? json(d) : notFound(); }
      if (m[2] === "/report") { const ok2 = await withPg(env, sql => tokenOk(sql, m[1])); return ok2 ? new Response(REPORT.replaceAll("{{T}}", m[1]), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } }) : notFound(); }
      if (m[2]) { const d = await data(env, m[1], !url.searchParams.has("nosave")); return d ? json(d) : notFound(); }
      const ok = await withPg(env, sql => tokenOk(sql, m[1]));
      if (!ok) return notFound();
      return new Response(PAGE.replaceAll("{{T}}", m[1]), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
    } catch (err) { return json({ ok: false, error: String(err && err.message || err).slice(0, 200) }, 500); }
  }
};
