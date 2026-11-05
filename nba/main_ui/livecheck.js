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

// ---------------------------------------------------------------------------------------------------------------- Underdog (scoped)
// match_grouped_lines (core) names the NBA appearances; then ONLY the players on our legs: lines_with_stats per appearance (main lines) and, for a leg that
// sits on an alternate rung, alternate_projections of that line. A leg whose player Underdog's core call does not name is left unchecked (no status).
const UD_STAT = { "points": "points", "rebounds": "rebounds", "assists": "assists", "3-pointers made": "threes_made", "3-pointers": "threes_made", "steals": "steals",
  "blocks": "blocks", "turnovers": "turnovers", "pts + rebs + asts": "pra", "points + rebounds + assists": "pra", "pts + rebs": "pts_reb", "points + rebounds": "pts_reb",
  "pts + asts": "pts_ast", "points + assists": "pts_ast", "rebs + asts": "reb_ast", "rebounds + assists": "reb_ast", "blks + stls": "stocks", "blocks + steals": "stocks",
  "fantasy points": "fantasy_score", "1q points": "points_q1", "1q 3-pointers made": "threes_made_q1", "1q assists": "assists_q1", "1q rebounds": "rebounds_q1", "1q pts + rebs + asts": "pra_q1",
  "1h points": "points_h1", "1h 3-pointers made": "threes_made_h1", "1h assists": "assists_h1", "1h rebounds": "rebounds_h1", "1h pts + rebs + asts": "pra_h1", "fg attempted": "fga", "3s attempted": "fg3a", "double-double": "double_double", "double doubles": "double_double" };
const UD_PILL = { points: "8d718cf2-1487-401e-88f7-f9f799e85871", rebounds: "0d33e7f2-6601-486b-9f9e-cbe268d8fc88", assists: "e3bc1aaa-7964-4a84-bcfa-2d92a4d477a2", threes_made: "4295c94a-3110-417e-953f-a4f3ed0dd18b",
  steals: "acc77cd9-21c3-4763-8109-181edd441f47", blocks: "8476240a-e58b-4744-aabb-f9c5e956f150", pra: "590e7c83-99fc-419f-bdd8-78bb0a691f8b", pts_reb: "cd25de54-fbb4-4111-85ac-60a347a8728f",
  pts_ast: "80eee07b-f568-4dad-81f6-b05e42aae24e", reb_ast: "e5346095-1c5e-40f0-bb31-95181490038d", stocks: "2eaf3415-32f1-4ffe-9bb1-e49cea27af8d", fantasy_score: "1099ec6f-260c-4407-b168-05abdf611c05",
  turnovers: "cbb724cf-304d-492e-9060-491f711dbef2", points_q1: "ff6438f9-7dad-422e-ae9a-8561636dbff5", threes_made_q1: "fbbda150-82f4-44cf-97ee-4206187096fe", points_h1: "696aa7ae-8d9a-4180-bd24-8e58985a3d43",
  threes_made_h1: "683ea76c-9a01-441c-8e16-2bbc3ac53c8e" };
const UD_API = "https://api.underdogfantasy.com";
const UD_COMMON = "product=fantasy&product_experience_id=b34dfd93-d0e8-4da3-8bf4-45c15c548dec&state_config_id=725014ef-3570-4e93-871d-d69674ab3521";
const UD_H = () => ({ accept: "application/json", "accept-language": "en-US,en;q=0.9", origin: "https://app.underdogsports.com", referer: "https://app.underdogsports.com/", "client-type": "web",
  "client-version": "20260907143253", "client-device-id": crypto.randomUUID(), "client-request-id": crypto.randomUUID(),
  "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  "user-latitude": "32.65148161377867", "user-longitude": "-116.8550890281236" });
async function udGet(path) {
  const r = await getText(UD_API + path, { headers: UD_H() }, 10000);
  if (r.status !== 200) throw new Error("underdog HTTP " + r.status + (r.error ? " " + r.error : ""));
  return JSON.parse(r.text);
}
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } })); return out; }
const asArr = x => Array.isArray(x) ? x : Object.values(x || {});
function udEntries(j, appId, out) {
  for (const ln of asArr(j.over_under_lines)) {
    const ou = ln.over_under || {}, st = ou.appearance_stat || {};
    if (appId && String(st.appearance_id) !== String(appId)) continue;
    const prop = UD_STAT[String(st.display_stat || "").trim().toLowerCase()]; if (!prop) continue;
    const opts = {}; for (const o of ln.options || []) opts[String(o.choice)] = o.status == null || String(o.status).toLowerCase() === "active";
    out.push({ prop, aid: st.appearance_id, line: Number(ln.stat_value), ouId: ou.id, higher: opts.higher !== false && "higher" in opts ? opts.higher : (opts.higher == null ? true : opts.higher), lower: "lower" in opts ? opts.lower : true });
  }
}
async function udCheck(legs) {
  const core = await udGet(`/v1/lobbies/content/match_grouped_lines?include_live=true&market_categories%5B%5D=core&match_limit=200&${UD_COMMON}&show_more_picks_cta=true&sport_id=NBA&two_box_enabled_surface=true`);
  // the core call names games only: fetch every NBA match's own lines (10-ish calls in parallel) for the appearances + players dicts
  const mids = asArr(core.match_groups).filter(m => m && m.id).map(m => [m.id, m.type || "Game"]);
  const mj = [];
  // a match's plain lines list only its ~20 popular lines: sweep the stat pills the legs need (same filter calls the app uses) to reach every player
  const gtitle = mid => { const g = asArr(core.games).find(x => x && String(x.id) === String(mid)) || {}; return String(g.title || g.abbreviated_title || "").toUpperCase(); };
  const pairs = [];   // only the (game, stat) pairs the legs sit in: a leg's team is in the game title ("ATL @ WAS")
  for (const [mid, mt] of mids) { const tt = gtitle(mid); const sids = new Set(legs.filter(l => !tt || tt.includes(String(l.team_abbr || "").toUpperCase())).map(l => UD_PILL[l.canonical_prop_key]).filter(Boolean)); for (const sid of sids) pairs.push([mid, mt, sid]); }
  const pj = await pool(pairs, 10, async ([mid, mt, sid]) => { try { return await udGet(`/v1/lobbies/content/lines?include_live=true&match_id=${mid}&match_type=${encodeURIComponent(mt)}&${UD_COMMON}&show_mass_option_markets=true&filter_id=${sid}&filter_type=PickemStat`); } catch (_e) { return null; } });
  mj.push(...pj);
  const allApps = [...asArr(core.appearances)], allPl = [...asArr(core.players)];
  for (const j of mj) if (j) { allApps.push(...asArr(j.appearances)); allPl.push(...asArr(j.players)); }
  const players = allPl, apps = allApps.filter(a => a && a.player_id);
  const byName = new Map();
  const addName = (nm, id) => { if (!nm) return; if (!byName.has(nm)) byName.set(nm, []); if (!byName.get(nm).includes(id)) byName.get(nm).push(id); };
  const pl = new Map(asArr(players).filter(x => x && x.id).map(x => [String(x.id), x]));
  for (const a of apps) { const p = pl.get(String(a.player_id)) || players[a.player_id] || {}; addName(normName((p.first_name || "") + (p.last_name || "")), a.id); }
  // the core call may not carry the players dict: name the appearances from the lines' own titles ("<Player> <stat>")
  for (const ln of asArr(core.over_under_lines)) {
    const ou = ln.over_under || {}, st = ou.appearance_stat || {}; if (!st.appearance_id) continue;
    let t = String(ou.title || ""); const ds = String(st.display_stat || ""); if (ds && t.toLowerCase().endsWith(ds.toLowerCase())) t = t.slice(0, t.length - ds.length);
    t = t.replace(/\s+(O\/U|Over\/Under).*$/i, ""); addName(normName(t), st.appearance_id);
  }
  // appearances of these matches that no list named: ask for their own lines_with_stats (the answer carries the player), cached for the pass below
  const lws = new Map(), midSet = new Set(mids.map(m => String(m[0]))), namedIds = new Set([...byName.values()].flat().map(String));
  const unnamed = [...new Set(apps.filter(a => a.type === "Player" && midSet.has(String(a.match_id)) && !namedIds.has(String(a.id))).map(a => String(a.id)))];
  await pool(unnamed, 12, async aid => {
    try { const j = await udGet(`/v1/lobbies/content/lines_with_stats?appearance_id=${aid}&${UD_COMMON}`); lws.set(aid, j);
      const ap = asArr(j.appearances).find(x => x && String(x.id) === aid) || apps.find(x => String(x.id) === aid) || {};
      const p = asArr(j.players).find(x => x && String(x.id) === String(ap.player_id)) || asArr(j.players)[0] || {};
      addName(normName((p.first_name || "") + (p.last_name || "")), aid); } catch (_e) { /* stays unnamed */ }
  });
  const names = [...new Set(legs.map(l => normName(l.player_name)))].filter(n => byName.has(n));
  const entries = new Map();   // name|prop -> [{line, ouId, higher, lower, alt}]
  // the stat-pill answers already carry every line of the stat: read the entries straight from them (no per-player call)
  const aidName = new Map(); for (const [nm, ids] of byName) for (const id of ids) aidName.set(String(id), nm);
  const seenOu = new Set();
  for (const j of mj) if (j) { const o = []; udEntries(j, null, o);
    for (const e of o) { const nm = aidName.get(String(e.aid)); if (!nm) continue; const dk = nm + "|" + e.prop + "|" + e.ouId + "|" + e.line; if (seenOu.has(dk)) continue; seenOu.add(dk);
      const k = nm + "|" + e.prop; if (!entries.has(k)) entries.set(k, []); entries.get(k).push(e); } }
  // fallback: a named player whose leg stat the pills did not return gets his own lines_with_stats
  const lack = new Set(legs.filter(l => { const nm = normName(l.player_name); return byName.has(nm) && !entries.has(nm + "|" + l.canonical_prop_key); }).map(l => normName(l.player_name)));
  await pool([...lack], 8, async nm => {
    for (const aid of byName.get(nm)) {
      try { const j = lws.get(String(aid)) || await udGet(`/v1/lobbies/content/lines_with_stats?appearance_id=${aid}&${UD_COMMON}`); const out = []; udEntries(j, aid, out);
        for (const e of out) { const k = nm + "|" + e.prop; if (!entries.has(k)) entries.set(k, []); entries.get(k).push(e); } } catch (_e) { /* that player stays unchecked */ }
    }
  });
  // legs not on a main line: look at that line's alternate rungs
  const needAlt = new Map();
  for (const l of legs) { const nm = normName(l.player_name), k = nm + "|" + l.canonical_prop_key, es = entries.get(k);
    if (es && es.length && !es.some(e => near(e.line, l.line_value))) for (const e of es) if (e.ouId) needAlt.set(e.ouId, k); }
  await pool([...needAlt.entries()], 6, async ([ouId, k]) => {
    try { const j = await udGet(`/v3/over_unders/${ouId}/alternate_projections?${UD_COMMON}`);
      for (const pr of j.projections || []) { const opts = {}; for (const o of pr.options || []) opts[String(o.choice)] = o.status == null || String(o.status).toLowerCase() === "active";
        entries.get(k).push({ line: Number(pr.stat_value), higher: opts.higher !== false, lower: opts.lower !== false, alt: true }); } } catch (_e) { /* keep main lines only */ }
  });
  let unresolved = 0; const unres = [];
  const dbg = { unres, core_apps: apps.length, core_players: asArr(players).length, names_indexed: byName.size, keys: Object.keys(core).slice(0, 8),
    app_keys: Object.keys(asArr(core.appearances)[0] || {}).join(","), n_lines: asArr(core.over_under_lines).length, names: [...byName.keys()].slice(0, 6).join("|"), titles: asArr(core.over_under_lines).slice(0, 3).map(x => String((x.over_under || {}).title) + "/" + String(((x.over_under || {}).appearance_stat || {}).display_stat)).join("|"), legs: legs.slice(0, 4).map(l => normName(l.player_name)).join("|") };
  for (const l of legs) {
    const nm = normName(l.player_name);
    if (!byName.has(nm)) { unresolved++; if (unres.length < 60) unres.push(nm + "@" + String((l.link && l.link.tip_utc) || l.official_game_time_utc || l.game_time_utc || "?").slice(5, 16)); if (byName.size > 30) l.live_now = "missing"; continue; }   // Underdog no longer lists the player (game started / pulled): off the board
    const es = entries.get(nm + "|" + l.canonical_prop_key) || [];
    const ex = es.filter(e => near(e.line, l.line_value)), less = sideOf(l) === "less";
    l.live_now = ex.length ? (ex.some(e => less ? e.lower : e.higher) ? "ok" : "side") : (es.length ? "moved" : "missing");
  }
  return { unresolved, ...dbg };
}

// Underdog rate-limits bursts (HTTP 429 on rapid reloads): per-leg results are reused for 15 s and, when a fresh pass fails, for 3 min.
const UD_C = new Map(); let UD_AT = 0;
const legKey = l => normName(l.player_name) + "|" + l.canonical_prop_key + "|" + l.line_value + "|" + sideOf(l);
async function udCached(legs) {
  const age = Date.now() - UD_AT;
  const apply = () => { let n = 0; for (const l of legs) { const v = UD_C.get(legKey(l)); if (v) { l.live_now = v; n++; } } return n; };
  if (UD_AT && age < 15000) { const n = apply(); if (n === legs.length) return { cached_s: Math.round(age / 1000), applied: n }; }
  try { const d = await udCheck(legs); for (const l of legs) if (l.live_now) UD_C.set(legKey(l), l.live_now); UD_AT = Date.now(); return d; }
  catch (e) { if (UD_AT && age < 180000) { const n = apply(); return { stale_s: Math.round(age / 1000), applied: n, error_was: String(e && e.message || e).slice(0, 40) }; } throw e; }
}

// ---------------------------------------------------------------------------------------------------------------- Fliff (scoped)
// Fliff's public Pick'Em feed (no login): ping -> skipper host -> leagues -> games -> cards; only the games / stat categories the Fliff legs need.
const FLIFF_CAT = { points: "1060", rebounds: "1031", assists: "1058", threes_made: "1032", pra: "1033", reb_ast: "1034", pts_reb: "1035", pts_ast: "1036", steals: "1037", blocks: "1059", stocks: "1038" };
async function fliffCheck(legs) {
  const hdr = { product_code: 10, device_x_id: "web." + crypto.randomUUID().replace(/-/g, ""), app_x_version: "5.0.35.286", app_install_token: "abcdEFGH12", auth_token: "", conn_id: 1, platform: "prod",
    usa_state_code: "", usa_state_code_source: "ipOrigin=2702|regionCode=|meta=|geocodeOrigin=2702|regionCode=|meta=", xtag: "", country_code: "", af_uid: "no_appsflyer_uid_for_web", location_token: "" };
  const post = async (host, obj) => {
    const r = await getText(host.replace(/\/$/, "") + "/fc_mobile_api_public?" + new URLSearchParams(hdr).toString(), { method: "POST", headers: { accept: "application/json, text/plain, */*", "content-type": "application/json",
      origin: "https://sports.getfliff.com", referer: "https://sports.getfliff.com/", "user-agent": UA },
      body: JSON.stringify({ header: hdr, invocation: { request: obj }, x_invocations: null, x_sb_meta: { sb_config_version: -1, sb_user_profile_version: -1, sb_user_profile_meta: null, campaigns_meta: { all_visible_campaigns_keys: {} } } }) }, 10000);
    if (r.status !== 200) throw new Error("fliff HTTP " + r.status); return JSON.parse(r.text);
  };
  const ping = await post("https://m-c2.app.getfliff.com/", { __object_class_name: "FCM__Ping__Request", message: "ping " + Date.now() });
  const host = (((ping.result || {}).response || {}).data || {}).skipper_public_feed_endpoint; if (!host) throw new Error("fliff ping: " + JSON.stringify((ping.result || {}).error || "").slice(0, 80));
  const lg = await post(host, { __object_class_name: "FCM__Skipper_GetLeagues__Request" });
  const nba = (((lg.result || {}).response || {}).collections || {}).page.find(x => String(x.abbreviation).toUpperCase() === "NBA").id;
  const gm = await post(host, { __object_class_name: "FCM__Skipper_GetGames__Request", variables: { filter: { league: nba } } });
  const games = (((gm.result || {}).response || {}).games || {}).page.map(g => { const r = g.game_render_data; return { id: r.id, teams: [r.away_team.abbreviation, r.home_team.abbreviation] }; });
  if (legs.sweepAll) legs = games.map(g => ({ player_name: "zz", team_abbr: g.teams[0], canonical_prop_key: "points", line_value: 0, selected_side: "more" }));
  const need = new Map();   // gameId|cat -> true
  for (const l of legs) { const cat = FLIFF_CAT[l.canonical_prop_key]; const g = games.find(x => x.teams.includes(l.team_abbr)); if (cat && g) need.set(g.id + "|" + cat, [g.id, cat]); }
  const rows = new Map();   // name|prop -> [{line, type}]
  await pool([...need.values()], 6, async ([gid, cat]) => {
    try { const c = await post(host, { __object_class_name: "FCM__Skipper_GetCards__Request", variables: { filter: { league: nba, games: [gid], prop_categories: ["fkey__sk_prop_category__" + cat] } } });
      const prop = Object.keys(FLIFF_CAT).find(k => FLIFF_CAT[k] === cat);
      for (const pk of ((c.result || {}).response || {}).cards_packs || []) for (const cd of pk.cards || []) { const pr = cd.player_prop_render_data || {}; if (!pr.name) continue;
        for (const o of ((cd.betting_options || {}).options) || []) if (o.is_main_line && (o.option_type === 0 || o.option_type === 1) && o.status === 0 && o.eu_odds) {
          const k = normName(pr.name) + "|" + prop; if (!rows.has(k)) rows.set(k, []); rows.get(k).push({ line: Number(o.line), type: o.option_type }); } } } catch (_e) { /* those legs stay unchecked */ }
  });
  for (const l of legs) {
    const cat = FLIFF_CAT[l.canonical_prop_key]; const g = games.find(x => x.teams.includes(l.team_abbr)); if (!cat || !g || !need.has(g.id + "|" + cat)) continue;
    const rs = rows.get(normName(l.player_name) + "|" + l.canonical_prop_key) || [], t = sideOf(l) === "less" ? 1 : 0;
    l.live_now = rs.some(r => near(r.line, l.line_value) && r.type === t) ? "ok" : (rs.length ? "moved" : "missing");
  }
  return { games: games.length, cards: need.size, teams: games.map(g => g.teams.join("@")).join(","), sample: [...rows.entries()].slice(0, 6).map(([k, v]) => k + "=" + v.map(x => x.line + "/" + x.type).join(";")).join(" | "), n_rows: rows.size };
}
export async function fliffTest() {   // TEMP: Fliff feed reachability + shape from the Worker (a synthetic leg per game)
  const t0 = Date.now(); const legs = []; legs.sweepAll = true;
  try { const d = await fliffCheck(legs); return { ok: true, ms: Date.now() - t0, ...d }; } catch (e) { return { ok: false, ms: Date.now() - t0, error: String(e && e.message || e).slice(0, 200) }; }
}

const LABEL = { moved: "line moved", missing: "off the board", side: "more only now", goblin: "now a goblin", demon: "now a demon" };

let PP_IX = null, PP_AT = 0;   // last good PrizePicks index in this isolate: rapid reloads reuse it (15 s); a failed fetch falls back to it (3 min)
export async function overlayLive(sql, out, ppFallback) {
  const t0 = Date.now();
  const ppFresh = !!PP_IX && Date.now() - PP_AT < 15000;
  if (!out || !out.ok || out.source !== "live") return out;
  const slips = out.generated_slips || [], pool = out.backup_pool || [];
  const legs = [...slips.flatMap(s => s.legs || []), ...pool];
  const by = k => legs.filter(l => l.source_key === k);
  const want = { prizepicks: by("prizepicks"), betr: by("betr"), sleeper: by("sleeper") };
  if (!legs.length) return out;
  const apps = {};
  const jobs = [];
  if (want.prizepicks.length && !ppFresh) jobs.push(getText("https://partner-api.prizepicks.com/projections?league_id=7&per_page=1000&single_stat=true",
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
  const extra = [];
  for (const [app, fn] of [["underdog", udCached], ["fliff", fliffCheck]]) {
    const ls = by(app); if (!ls.length) continue;
    const t1 = Date.now();
    extra.push(fn(ls).then(d => { apps[app] = { ok: true, ms: Date.now() - t1, ...d }; }).catch(e => { apps[app] = { ok: false, ms: Date.now() - t1, error: String(e && e.message || e).slice(0, 100) }; }));
  }
  const done = await Promise.all(jobs);
  await Promise.all(extra);
  for (const { app, r } of done) {   // parse one board at a time (memory)
    const info = { ms: r.ms, status: r.status, ok: false };
    try {
      if (r.status !== 200) throw new Error(r.error || ("HTTP " + r.status));
      const doc = JSON.parse(r.text); r.text = "";
      if (app === "prizepicks") { const ix = indexPP(doc); PP_IX = ix; PP_AT = Date.now(); want.prizepicks.forEach(l => markPP(l, ix)); }
      else if (app === "betr") { const mp = indexBetr(doc); want.betr.forEach(l => markBetr(l, mp)); }
      else { const set = new Set(); for (const ln of Array.isArray(doc) ? doc : []) for (const o of ln.options || []) if (o.line_id != null) set.add(String(o.line_id)); want.sleeper.forEach(l => markSleeper(l, set)); }
      info.ok = true;
    } catch (e) {
      info.error = String(e && e.message || e).slice(0, 100) + (r.text ? " | " + String(r.text).slice(0, 80) : "");
      if (app === "prizepicks" && PP_IX && Date.now() - PP_AT < 180000) { want.prizepicks.forEach(l => markPP(l, PP_IX)); info.ok = true; info.stale_s = Math.round((Date.now() - PP_AT) / 1000); }
    }
    apps[app] = info;
  }
  if (ppFresh && want.prizepicks.length) { want.prizepicks.forEach(l => markPP(l, PP_IX)); apps.prizepicks = { ok: true, ms: 0, cached_s: Math.round((Date.now() - PP_AT) / 1000) }; }
  if (apps.prizepicks && !apps.prizepicks.ok && ppFallback) { await ppFallback(sql, out); apps.prizepicks.fallback = "stored board"; apps.prizepicks.ok = !!(out.pp_live && !out.pp_live.error); }
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
