// NBA MAIN UI - LIVE LEG CHECK (owner 2026-11-04 16:17 PT: "every time I open the page and hit Slips ... refresh the legs on the slips and the backup bank,
// all apps, fast, no Chrome, rebuild the deep links"). Runs INSIDE this Worker on every Slips load: one request per app, all in parallel, no runner start.
// Measured from the Worker (probe-test, 2026-11-04): PrizePicks partner board 0.7 s, Sleeper lines 5.6 s, Betr / Underdog reachable in ~0.13 s.
//   PrizePicks: partner-api board (api.prizepicks.com answers DataDome 403 to every non-browser client; the partner host answers 200). Each leg is matched by
//               its projection id, then by player + stat + line; status standard | goblin | demon | moved | missing; the FRESH standard projection id is written
//               back onto the leg (slip legs AND backup-pool legs) so the title deep link carries every leg, replacements included.
//   Betr:       the owner's session token (nba_config.external_credentials 'betr_session_state', renewed by betr-cloud-harvest) on the same GraphQL board query the
//               harvester uses; a leg is matched by its player id + stat + line + side: ok | side (the app offers MORE only) | moved | missing.
//   Sleeper:    lines/available; a leg whose line id is no longer offered is missing.
// Every leg gets live_now (ok | moved | missing | side) and PrizePicks legs also pp_now (the contract the screen already swaps on).
import { q, normName } from "./common.js";

const PP_STAT_PROP = { "Points": "points", "Rebounds": "rebounds", "Assists": "assists", "3-PT Made": "threes_made", "Blocked Shots": "blocks", "Steals": "steals",
  "Turnovers": "turnovers", "Blks+Stls": "stocks", "Pts+Rebs+Asts": "pra", "Pts+Rebs": "pts_reb", "Pts+Asts": "pts_ast", "Rebs+Asts": "reb_ast",
  "Personal Fouls": "personal_fouls", "Fantasy Score": "fantasy_score", "Double-Double": "double_double", "FG Made": "fgm", "FG Attempted": "fga",
  "Free Throws Made": "ftm", "Free Throws Attempted": "fta", "3-PT Attempted": "fg3a", "Offensive Rebounds": "oreb", "Defensive Rebounds": "dreb" };
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const BETR_Q = "query LeagueUpcomingEvents($league: League!) { getUpcomingEventsV2(league: $league) { id date status sport league name competitionType " +
  "... on TeamVersusEvent { teams { id name fullName players { id firstName lastName position projections { marketId marketStatus isLive " +
  "type label name key order value nonRegularPercentage nonRegularValue currentValue allowedOptions { marketOptionId outcome } } } } } } }";

async function getText(url, init, ms = 12000) {
  const t0 = Date.now(); const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { ...init, signal: ac.signal }); const text = await r.text(); return { status: r.status, text, ms: Date.now() - t0 }; }
  catch (e) { return { status: 0, text: "", ms: Date.now() - t0, error: String(e && e.name === "AbortError" ? "timeout" : (e && e.message || e)).slice(0, 80) }; }
  finally { clearTimeout(timer); }
}

function b64urlJson(s) { try { return JSON.parse(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + (4 - s.length % 4) % 4, "="))); } catch (_e) { return {}; } }
async function betrToken(sql) {
  const r = (await q(sql, "SELECT credential_value_encrypted v FROM nba_config.external_credentials WHERE credential_key='betr_session_state'", [], 6000))[0];
  if (!r || !r.v) return null;
  let st; try { st = JSON.parse(r.v); } catch (_e) { return null; }
  for (const v of Object.values(st.localStorage || {})) {
    if (typeof v !== "string") continue;
    for (const t of (v.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) || [])) {
      const c = b64urlJson(t.split(".")[1]); if (c.typ === "Bearer" && (!c.exp || c.exp * 1000 > Date.now())) return t;
    }
  }
  return null;
}

const sideOf = l => (String(l.selected_side || (l.link && l.link.side) || "").toLowerCase().startsWith("l") || String(l.selected_side || "").toLowerCase() === "under" || (l.link && l.link.side === "u")) ? "less" : "more";
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-9;

function indexPP(doc) {
  const names = new Map();
  for (const i of doc.included || []) if (i.type === "new_player") names.set(i.id, normName((i.attributes || {}).display_name || (i.attributes || {}).name));
  const byId = new Map(), byKey = new Map();
  for (const p of doc.data || []) {
    const a = p.attributes || {}; const pl = ((p.relationships || {}).new_player || {}).data || {};
    if (a.line_score == null || !pl.id) continue;
    const prop = PP_STAT_PROP[a.stat_type]; if (!prop) continue;
    const row = { id: String(p.id), line: Number(a.line_score), odds: String(a.odds_type || "standard").toLowerCase() };
    byId.set(row.id, row);
    const k = (names.get(pl.id) || "") + "|" + prop; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(row);
  }
  return { byId, byKey };
}
function markPP(l, ix) {
  const pid = l.link && l.link.ids && l.link.ids.projection_id ? String(l.link.ids.projection_id) : null;
  const line = Number(l.line_value);
  const byId = pid ? ix.byId.get(pid) : null;
  let res = null;
  if (byId && near(byId.line, line) && byId.odds === "standard") res = byId;
  const cand = ix.byKey.get(normName(l.player_name) + "|" + String(l.canonical_prop_key)) || [];
  if (!res) res = cand.find(r => near(r.line, line) && r.odds === "standard") || null;
  if (res) { l.pp_now = "standard"; l.live_now = "ok"; }
  else {
    const same = cand.find(r => near(r.line, line));
    l.pp_now = same ? same.odds : (cand.length ? "moved" : "missing");
    l.live_now = l.pp_now === "standard" ? "ok" : (l.pp_now === "moved" ? "moved" : l.pp_now === "missing" ? "missing" : "moved");
  }
  if (res) {   // rebuild the deep-link ids from the FRESH board (replacement legs gain theirs here)
    const tip = (l.link && l.link.tip_utc) || l.official_game_time_utc || null;
    l.link = { ids: { odds_type: "standard", projection_id: res.id }, line: res.line, side: sideOf(l) === "less" ? "u" : "o", tip_utc: tip };
  }
}

function indexBetr(body) {
  const map = new Map();
  const evs = ((body || {}).data || {}).getUpcomingEventsV2 || [];
  for (const ev of evs) for (const t of ev.teams || []) for (const p of t.players || []) for (const pr of p.projections || []) {
    const line = pr.value; if (line == null) continue;
    const stat = pr.key || pr.name || pr.label; const tier = String(pr.type || "").toUpperCase();
    const opts = (pr.allowedOptions || []).map(o => String(o.outcome).toUpperCase());
    const alt = pr.nonRegularValue; const placeholder = tier !== "REGULAR" && alt != null && alt > 0 && alt !== line;
    const k = String(p.id) + "|" + String(stat); if (!map.has(k)) map.set(k, []);
    if (!placeholder) map.get(k).push({ line: Number(line), over: opts.includes("MORE"), under: opts.includes("LESS") });
    if (alt != null && alt > 0 && alt !== line) map.get(k).push({ line: Number(alt), over: true, under: false });
  }
  return map;
}
function markBetr(l, map) {
  const ids = l.link && l.link.ids; if (!ids || !ids.player_id || !ids.stat) return;
  const es = map.get(String(ids.player_id) + "|" + String(ids.stat)) || [];
  const line = Number(l.line_value), less = sideOf(l) === "less";
  const exact = es.filter(e => near(e.line, line));
  if (exact.length) l.live_now = exact.some(e => less ? e.under : e.over) ? "ok" : "side";
  else l.live_now = es.length ? "moved" : "missing";
}
function markSleeper(l, idset) {
  const id = l.link && l.link.ids && l.link.ids.line_id; if (!id) return;
  l.live_now = idset.has(String(id)) ? "ok" : "missing";
}

const LABEL = { moved: "line moved", missing: "off the board", side: "more only now", goblin: "now a goblin", demon: "now a demon" };

export async function overlayLive(sql, out) {
  const t0 = Date.now();
  if (!out || !out.ok || out.source !== "live") return out;
  const slips = out.generated_slips || [], pool = out.backup_pool || [];
  const legs = [...slips.flatMap(s => s.legs || []), ...pool];
  const by = k => legs.filter(l => l.source_key === k);
  const want = { prizepicks: by("prizepicks"), betr: by("betr"), sleeper: by("sleeper") };
  if (!legs.length) return out;
  const apps = {};
  const jobs = [];
  if (want.prizepicks.length) jobs.push(getText("https://partner-api.prizepicks.com/projections?league_id=7&per_page=1000&single_stat=true",
    { headers: { "user-agent": UA, accept: "application/json, text/plain, */*", referer: "https://app.prizepicks.com/", origin: "https://app.prizepicks.com" } }).then(r => ({ app: "prizepicks", r })));
  if (want.sleeper.length) jobs.push(getText("https://api.sleeper.app/lines/available?dynamic=true&include_preseason=true&enable_one_sided_lines=true",
    { headers: { "user-agent": UA, accept: "application/json", referer: "https://sleeper.com/" } }, 15000).then(r => ({ app: "sleeper", r })));
  if (want.betr.length) jobs.push((async () => {
    const tok = await betrToken(sql); if (!tok) return { app: "betr", r: { status: 0, text: "", ms: 0, error: "no valid Betr session token" } };
    const r = await getText("https://api.fantasy.betr.app/graphql", { method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: tok,
      origin: "https://picks.betr.app", referer: "https://picks.betr.app/", "user-agent": UA, channel: "MOBILE_WEB", "fantasy-api-version": "16.0", "fantasy-application-version": "3.42.9",
      "promotions-api-version": "6.0", jurisdiction: "CA" }, body: JSON.stringify({ operationName: "LeagueUpcomingEvents", query: BETR_Q, variables: { league: "NBA" } }) });
    return { app: "betr", r };
  })());
  const done = await Promise.all(jobs);
  for (const { app, r } of done) {   // parse one board at a time (memory)
    const info = { ms: r.ms, status: r.status, ok: false };
    try {
      if (r.status !== 200) throw new Error(r.error || ("HTTP " + r.status));
      const doc = JSON.parse(r.text); r.text = "";
      if (app === "prizepicks") { const ix = indexPP(doc); want.prizepicks.forEach(l => markPP(l, ix)); }
      else if (app === "betr") { const mp = indexBetr(doc); want.betr.forEach(l => markBetr(l, mp)); }
      else { const set = new Set(); for (const ln of Array.isArray(doc) ? doc : []) for (const o of ln.options || []) if (o.line_id != null) set.add(String(o.line_id)); want.sleeper.forEach(l => markSleeper(l, set)); }
      info.ok = true;
    } catch (e) { info.error = String(e && e.message || e).slice(0, 100); }
    apps[app] = info;
  }
  // a pool leg that is not confirmed on its own app's board is never offered as a substitute
  out.backup_pool = pool.filter(l => {
    if (l.source_key === "prizepicks" && apps.prizepicks && apps.prizepicks.ok) return l.pp_now === "standard";
    if (l.live_now && l.live_now !== "ok") return false;
    return true;
  });
  const flagged = [];
  for (const s of slips) {
    const bad = (s.legs || []).filter(l => (l.source_key === "prizepicks" ? l.pp_now && l.pp_now !== "standard" : l.live_now && l.live_now !== "ok"));
    if (bad.length) {
      s.pp_alert = bad.map(l => `${l.player_name} ${l.line_value} ${l.canonical_prop_key} is ${LABEL[l.source_key === "prizepicks" ? l.pp_now : l.live_now] || "changed"}`);
      flagged.push(...s.pp_alert.map(a => `${s.structure_label || s.slip_type}: ${a}`));
    }
  }
  out.pp_live = { checked_at: new Date().toISOString(), legs_checked: legs.length, flagged, apps, total_ms: Date.now() - t0, live: true };
  return out;
}
