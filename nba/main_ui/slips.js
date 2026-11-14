// NBA MAIN UI - slips: the builder (/api/slips/generate), the Slips screen (/api/slips/high-hit = today's engine slips, or the
// certified backtest's slips for a replayed slate), saving (/api/slips/save) and the saved list (/api/slips/recent).
import { q, pgArr, num, r1, parseLegId, legId, sideIn, sideOut, propLabel, appLabel, resolveSlate, normName } from "./common.js";
import { loadLegs } from "./board.js";
import { nbaEv, nbaBreakeven, nbaModes, nbaTiers, nbaModeLabel } from "./pricing.js";
import { overlayLive } from "./livecheck.js";

export function pricingFrom(cfg) {
  return { pp: cfg.pp, ud: cfg.ui.ud_payout, sleeper: cfg.sleeper || {}, betr: (cfg.pp || {}).betr_payout_v1 || null };
}

// ------------------------------------------------------------------ legs by id
export async function legsByIds(sql, cfg, ids) {
  const parsed = (ids || []).map(parseLegId).filter(Boolean);
  if (!parsed.length) return [];
  const date = parsed[0].date;
  const same = parsed.filter(p => p.date === date);
  const today = (await q(sql, "SELECT (now() AT TIME ZONE 'America/Los_Angeles')::date::text d"))[0].d;
  const slate = { date, mode: date === today ? "live" : "replay" };
  const where = `AND (b.app, b.player_id, b.prop, b.line, b.side) IN (SELECT * FROM unnest($6::text[], $7::text[], $8::text[], $9::numeric[], $10::text[]))`;
  return loadLegs(sql, cfg, slate, { where, extra: [pgArr(same.map(p => p.app)), pgArr(same.map(p => p.player_id)), pgArr(same.map(p => p.prop)),
    pgArr(same.map(p => p.line)), pgArr(same.map(p => p.side))], limit: 500 });
}

// ------------------------------------------------------------------ builder
function legProb(l) { return Math.max(0.01, Math.min(0.99, Number(l.estimated_hit_probability_0_100 || l.hit_probability_0_100 || 0) / 100)); }
function teamsOf(legs) { return new Set(legs.map(l => l.team_id || l.game_pk)); }
function validSlip(legs) {
  const players = new Set(legs.map(l => String(l.player_id || l.mlb_player_id)));
  return players.size === legs.length && teamsOf(legs).size >= 2;
}
function slipWarnings(legs) {
  const w = [];
  const byGame = {};
  for (const l of legs) byGame[l.game_pk] = (byGame[l.game_pk] || 0) + 1;
  const sg = Object.values(byGame).filter(c => c > 1);
  if (sg.length) w.push(`${sg.reduce((a, b) => a + b, 0)} legs share a game - same-game legs are correlated (EV assumes independence).`);
  if (legs.some(l => l.replay_mode)) w.push("Replay slate - these games are already played; this is a what-if build.");
  return w;
}
function pickSlip(pool, size, usedIds, usedSigs) {
  // best legs first, unused legs preferred; one leg per player; at least two teams; never repeat an identical slip
  const order = [...pool.filter(l => !usedIds.has(l.final_board_row_id)), ...pool.filter(l => usedIds.has(l.final_board_row_id))];
  for (let start = 0; start < order.length; start++) {
    const picked = [];
    const players = new Set();
    for (let i = start; i < order.length + start && picked.length < size; i++) {
      const l = order[i % order.length];
      const pk = String(l.player_id);
      if (players.has(pk)) continue;
      if (picked.length === size - 1 && teamsOf([...picked, l]).size < 2) continue;
      picked.push(l); players.add(pk);
    }
    if (picked.length === size && validSlip(picked)) {
      const sig = picked.map(l => l.final_board_row_id).sort().join("|");
      if (!usedSigs.has(sig)) { usedSigs.add(sig); return picked; }
    }
  }
  return null;
}
function evalSlip(pricing, app, mode, legs) {
  const probs = legs.map(legProb);
  const r = nbaEv(pricing, app, mode, legs, probs);
  if (!r) return null;
  return { ...r, breakeven: nbaBreakeven(pricing, app, mode, legs), tiers: mode === "flex" ? nbaTiers(pricing, app, mode, legs) : null,
    multiplier: (nbaTiers(pricing, app, mode, legs) || {})[legs.length] || null };
}
function bestStructure(pricing, cfg, app, pool) {
  let best = null;
  const mx = Math.min(Number(cfg.ui.builder.max_size), pool.length);
  for (let size = Number(cfg.ui.builder.min_size); size <= mx; size++) {
    const legs = pickSlip(pool, size, new Set(), new Set());
    if (!legs) continue;
    for (const mode of nbaModes(app, size)) {
      if (mode === "flex" && size < Number((cfg.ui.builder.flex_min || {})[app] || 3)) continue;
      const r = evalSlip(pricing, app, mode, legs);
      if (!r) continue;
      const risk = r.ev / Math.max(r.stdev, 1e-6);
      if (!best || risk > best.risk) best = { size, mode, risk };
    }
  }
  return best;
}
function slipOut(pricing, app, mode, legs, extra = {}) {
  const r = evalSlip(pricing, app, mode, legs);
  const n = legs.length;
  const warnings = slipWarnings(legs);
  const pAll = legs.reduce((a, l) => a * legProb(l), 1);
  const avgHp = r1(legs.reduce((a, l) => a + legProb(l), 0) / n * 100);
  return {
    client_slip_id: "gen_" + Math.random().toString(36).slice(2, 10),
    source_key: app, slip_type: `${n}-pick`, slip_size: n, entry_mode: mode,
    structure_label: `${n}-pick ${nbaModeLabel(app, mode)}`,
    estimated_hit_probability_0_100: avgHp,
    hit_all_probability_0_100: r ? r.hit_all_probability_0_100 : r1(pAll * 100),
    estimated_multiplier: r ? r.multiplier : null,
    estimated_multiplier_flex_tiers: r && r.tiers ? r.tiers : null,
    estimated_ev_per_unit_stake: r ? Math.round(r.ev * 1000) / 1000 : null,
    breakeven_hit_rate_0_100: r ? r.breakeven : null,
    estimated_payout_note: "Payouts follow the certified graders: PrizePicks base x model factor (compressed), Underdog table x pick multipliers, Sleeper product of multipliers. The app's displayed payout at entry is authoritative.",
    strategy_grade: warnings.length && warnings[0].includes("share") ? "REVIEW" : (r && r.ev > 0 ? "STRONG" : (r && r.ev > -0.15 ? "STANDARD" : "CAUTION")),
    strategy_notes: [r ? `Estimated EV: ${r.ev >= 0 ? "+" : ""}${Math.round(r.ev * 100)}% per unit staked, vs a ${r.breakeven}% breakeven hit rate needed per leg.` : "A leg has no payout factor yet - EV not computed.", ...warnings].join(" "),
    legs: legs.map(l => slipLeg(l)),
    ...extra
  };
}
// props the box-score graders can score; anything else (3-pt/FT attempts, defensive rebounds, fantasy score, quarter props, double-doubles) is never offered (2026-11-09: such legs could not be graded)
const GRADABLE_PROPS = new Set(["points", "rebounds", "assists", "threes_made", "steals", "blocks", "turnovers", "pts_ast", "pts_reb", "reb_ast", "pra", "stocks"]);

export function slipLeg(l, extra = {}) {
  return {
    board_row_id: l.final_board_row_id, final_board_row_id: l.final_board_row_id, player_name: l.player_name, player_id: l.player_id, mlb_player_id: l.player_id,
    team_id: l.team_id, team_abbr: l.team_abbr, opponent_abbr: l.opponent_abbr, game_pk: l.game_pk, official_game_time_utc: l.official_game_time_utc,
    source_key: l.source_key, canonical_prop_key: l.canonical_prop_key, prop_label: l.prop_label, line_value: l.line_value, selected_side: l.selected_side,
    line_type: l.line_type, is_goblin: l.is_goblin, is_demon: l.is_demon, leg_factor: l.leg_factor, app_multiplier: l.app_multiplier,
    ud_prediction: l.ud_prediction === true,   // Underdog Prediction line: Power / Standard only, never in a Flex slip or a Flex substitute list
    edge_0_100: l.edge_0_100, breakeven_0_100: l.breakeven_0_100,
    hit_probability_0_100: l.estimated_hit_probability_0_100, estimated_hit_probability_0_100: l.estimated_hit_probability_0_100,
    certainty_0_100: l.probability_confidence_0_100, overall_score_0_100: l.score_0_100, score_0_100: l.score_0_100, replay_mode: l.replay_mode, ...extra
  };
}

export async function apiGenerate(sql, cfg, body, version) {
  const legs = await legsByIds(sql, cfg, body.leg_ids || body.board_row_ids || []);
  const pricing = pricingFrom(cfg);
  const bySource = new Map();
  for (const l of legs) { if (!bySource.has(l.source_key)) bySource.set(l.source_key, []); bySource.get(l.source_key).push(l); }
  const out = [];
  const requested = Array.isArray(body.structures) && body.structures.length ? body.structures : null;
  for (const [app, raw] of bySource) {
    const pool = raw.slice().sort((a, b) => legProb(b) - legProb(a) || Number(b.score_0_100) - Number(a.score_0_100));
    const usedIds = new Set(), usedSigs = new Set();
    let plans;
    if (requested) plans = requested.map(s => ({ amount: Math.max(1, Math.min(Number(cfg.ui.builder.max_amount), Math.floor(Number(s.amount || 1)))), size: Math.floor(Number(s.slip_type || s.size || 0)), mode: s.mode === "flex" ? "flex" : "power" }));
    else {
      plans = [];
      let remaining = pool.slice();
      while (remaining.length >= Number(cfg.ui.builder.min_size)) {
        const b = bestStructure(pricing, cfg, app, remaining);
        if (!b) break;
        plans.push({ amount: 1, size: b.size, mode: b.mode });
        const used = pickSlip(remaining, b.size, new Set(), new Set());
        const ids = new Set(used.map(l => l.final_board_row_id));
        remaining = remaining.filter(l => !ids.has(l.final_board_row_id));
      }
    }
    for (const plan of plans) {
      if (plan.size < 2 || plan.size > pool.length || !nbaModes(app, plan.size).includes(plan.mode)) continue;
      for (let i = 0; i < plan.amount; i++) {
        const picked = pickSlip(pool, plan.size, usedIds, usedSigs);
        if (!picked) break;
        picked.forEach(l => usedIds.add(l.final_board_row_id));
        out.push(slipOut(pricing, app, plan.mode, picked));
      }
    }
  }
  out.sort((a, b) => Number(b.estimated_ev_per_unit_stake ?? -9) - Number(a.estimated_ev_per_unit_stake ?? -9));
  return { ok: true, data_ok: true, version, route: "/api/slips/generate", selected_leg_count: legs.length,
    source_counts: legs.reduce((a, l) => { a[l.source_key] = (a[l.source_key] || 0) + 1; return a; }, {}), generated_slips: out, pricing,
    notes: ["EV uses each leg's calibrated hit probability, assumes independent legs, and prices with the certified payout rules."] };
}

// ------------------------------------------------------------------ the Slips screen (engine slips)
async function dnpRisk(sql, date, names) {
  if (!names.length) return new Map();
  const rows = await q(sql, `
    WITH s AS (SELECT max(snapshot_ts) ts FROM nba_daily.injury_report_snapshots WHERE game_date = $1::date)
    SELECT player_name, status, reason FROM nba_daily.injury_report_snapshots WHERE game_date = $1::date AND snapshot_ts = (SELECT ts FROM s)`, [date]);
  const m = new Map();
  for (const r of rows) {
    const p = String(r.player_name || "").split(", ");
    const nm = (p.length === 2 ? p[1] + " " + p[0] : r.player_name).toLowerCase();
    m.set(nm, r);
  }
  return m;
}
function riskFor(map, name) {
  const r = map.get(String(name || "").toLowerCase());
  if (!r) return {};
  const s = String(r.status || "");
  return { dnp_risk: s === "Out" || s === "Doubtful" ? "HIGH" : s === "Questionable" ? "MEDIUM" : null, dnp_risk_reason: `${s}${r.reason ? " - " + r.reason : ""}` };
}

async function engineSlips(sql, cfg, slate) {
  // streak_note via to_jsonb: the column is added by the engine's next run (2026-10-17) - reading it this way never breaks the screen
  const pp = await q(sql, `SELECT strategy, k, legs_json, size, structure, status, stake_weight, hits, payout, to_jsonb(s) ->> 'streak_note' AS streak_note,
                                  to_jsonb(s) ->> 'unit_usd' AS unit_usd
                           FROM nba_score.live_slips s WHERE game_date = $1::date AND status NOT IN ('dup') ORDER BY strategy, k`, [slate.date]);
  const ud = await q(sql, `SELECT portfolio, composition, size, structure, k, legs_json, stake, status, hits, payout FROM nba_score.ud_live_slips WHERE game_date = $1::date ORDER BY portfolio, composition, size, k`, [slate.date]);
  // SLEEPER (owner 2026-10-26 12:17 PT: "I like the 1 2pick and 1 3pick flex, deploy it") - nba/sleeper_live_slip_engine.py;
  // the table is created by the engine's first run, so it is looked up first (never breaks the screen before then)
  let sl = [];
  const hasSl = (await q(sql, "SELECT to_regclass('nba_score.sleeper_live_slips') IS NOT NULL ok"))[0];
  if (hasSl && hasSl.ok) sl = await q(sql, `SELECT strategy, size, structure, k, legs_json, stake, status, hits, payout FROM nba_score.sleeper_live_slips WHERE game_date = $1::date ORDER BY strategy, k`, [slate.date]);
  return { source: "live", pp: pp.map(r => ({ ...r, app: "prizepicks", track: r.strategy })), ud: ud.map(r => ({ ...r, app: "underdog", track: `UD ${r.portfolio} ${r.composition} ${r.size}${r.structure === "flex" ? "F" : "S"}` })),
           sl: sl.map(r => ({ ...r, app: "sleeper", track: `Sleeper ${r.size}-pick ${r.structure === "flex" ? "Flex" : "Max"} ${String(r.strategy || "").startsWith("S_ALL") ? `(all Sleeper legs, slip ${r.k})` : /^S_[BCDF]_/.test(String(r.strategy || "")) ? `(ROI rule ${String(r.strategy).slice(2)}, slip ${r.k})` : "(Underdog T1 legs)"}` })),
           fl: (await fliffLive(sql, slate)).map(r => ({ ...r, app: "fliff", track: /^F_[ACE]_/.test(String(r.strategy || "")) ? `Fliff ${r.size}-pick Max (ROI rule ${String(r.strategy).slice(2)}, slip ${r.k})` : `Fliff ${r.size}-pick Max (Underdog T1 legs)` })),
           bt: (await betrLive(sql, slate)).map(r => ({ ...r, app: "betr", track: r.structure === "perfect" ? `Betr ${r.size}-pick Perfect (ROI rule, top 20 by the ROI score - shown by owner request, Betr history not credible)` : String(r.strategy || "").startsWith("B_ROI") ? `Betr ${r.size}-pick Dynamic (ROI rule, top 5 by the ROI score)` : String(r.strategy || "").startsWith("B_BRD") ? `Betr ${r.size}-pick Dynamic ${String(r.strategy).endsWith("_fb") ? "fallback " : ""}(Betr board, slip ${r.k})` : `Betr ${r.size}-pick Dynamic (Underdog T2+T3 legs)` })) };
}
// BETR (owner 2026-10-26 18:31 PT: "Let's go b so, you can deploy it in the slip system") - nba/betr_live_slip_engine.py, two 4-pick
// Dynamic slips a slate at Betr's own line (= the Underdog leg's line); the table is created by the engine, so it is looked up first
async function betrLive(sql, slate) {
  const has = (await q(sql, "SELECT to_regclass('nba_score.betr_live_slips') IS NOT NULL ok"))[0];
  if (!has || !has.ok) return [];
  return q(sql, `SELECT strategy, size, structure, k, legs_json, stake, status, hits, payout FROM nba_score.betr_live_slips WHERE game_date = $1::date ORDER BY strategy, k`, [slate.date]);
}
// FLIFF PICK'EM (owner 2026-10-26 14:22 PT: Fliff option 2 "deploy that") - nba/fliff_live_slip_engine.py, one 2-pick Max a slate at
// Fliff Pick'Em's own line and multiplier; the table is created by the engine, so it is looked up first
async function fliffLive(sql, slate) {
  const has = (await q(sql, "SELECT to_regclass('nba_score.fliff_live_slips') IS NOT NULL ok"))[0];
  if (!has || !has.ok) return [];
  return q(sql, `SELECT strategy, size, structure, k, legs_json, stake, status, hits, payout FROM nba_score.fliff_live_slips WHERE game_date = $1::date ORDER BY strategy, k`, [slate.date]);
}

// PLACE BY (2026-10-16, owner: "The place by is a good idea"). A slip can be entered until the FIRST of its own legs' games tips,
// not the slate's first tip: on 38 of the 39 2026-27 slates with a game before 1:45 PM PT only ~2 of ~8 games are early, and the
// afternoon run moves to first tip - 29 min for the whole slate. Each leg's game = its player's team that day (the box score's
// team on a played date, else today's roster in nba_ref.players - refreshed by P2B every morning, so off-season moves count; a leg
// without an id is resolved by nba_ref.player_name_map, the grader's own name map)
// joined to nba_calendar.slate_games (the official tip, not an app's displayed start). A leg that cannot be placed in a game
// makes its slip fall back to the slate's first tip (conservative) and says so.
async function placeByMap(sql, date, keys) {
  const pids = [...new Set(keys.map(k => k.pid).filter(Boolean))], names = [...new Set(keys.map(k => k.name).filter(Boolean))];
  const first = (await q(sql, "SELECT min(game_datetime_utc) t FROM nba_calendar.slate_games WHERE game_date = $1::date", [date]))[0];
  const out = { tip: new Map(), first: first && first.t ? new Date(first.t) : null };
  if (!pids.length && !names.length) return out;
  // 2026-10-21 (owner 13:56 PT: "Build failed: query failed: HARD_QUERY_TIMEOUT_12000MS"): the ids were compared as TEXT
  // (nba_player_id::text = pid), which disables the (nba_player_id, game_date) index - one sequential scan of the game log per
  // leg; 29 slips timed out. Compared as bigint now (non-numeric ids -> NULL -> no match, as before): 0.8 s on the 10-21 slips.
  const rows = await q(sql, `WITH k0 AS (SELECT x AS key, x AS pid FROM unnest($2::text[]) x
        UNION ALL SELECT n, m.player_id FROM unnest($3::text[]) n JOIN nba_ref.player_name_map m ON m.norm_name = nba_ref.norm_name(n)),
      k AS (SELECT key, pid, CASE WHEN pid <> '' AND pid !~ '[^0-9]' THEN pid::bigint END AS pid_n FROM k0),
      t AS (SELECT k.key, COALESCE((SELECT g.team_id FROM nba_stats.player_game_log g WHERE g.nba_player_id = k.pid_n AND g.game_date = $1::date LIMIT 1),
                                   (SELECT g.team_id FROM nba_stats.player_game_log_postseason g WHERE g.nba_player_id = k.pid_n AND g.game_date = $1::date LIMIT 1),
                                   (SELECT p.team_id FROM nba_ref.players p WHERE p.nba_player_id = k.pid_n LIMIT 1)) team FROM k)
      SELECT t.key, min(s.game_datetime_utc) tip, min(s.away_team_tricode || '@' || s.home_team_tricode) game
      FROM t JOIN nba_calendar.slate_games s ON s.game_date = $1::date AND t.team IN (s.home_team_id, s.away_team_id) GROUP BY t.key`,
    [date, pgArr(pids), pgArr(names)]);
  for (const r of rows) out.tip.set(r.key, { at: new Date(r.tip), game: r.game });
  return out;
}
function legKey(x) { return x.player_id ? String(x.player_id) : String(x.player || "").toLowerCase(); }
function ptClock(d) { return d ? d.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" }) + " PT" : null; }
function placeBy(lj, pb) {
  let best = null, game = null, exact = lj.length > 0;
  for (const x of lj) {
    const t = pb.tip.get(legKey(x));
    if (!t) { exact = false; continue; }
    if (!best || t.at < best) { best = t.at; game = t.game; }
  }
  if (!exact || !best) { best = pb.first; game = null; }
  return { place_by_utc: best ? best.toISOString() : null, place_by_pt: ptClock(best), place_by_game: game, place_by_exact: exact && !!game };
}

// APP LINKS (2026-11-03, owner: "turn the title PRIZEPICKS 3-pick Power into the link that will open the app with the lineup"). The slip title
// opens the app with the lineup filled (PrizePicks / Sleeper / Betr - verified on the owner's phone; Underdog and Fliff have no such link, their
// title stays plain). The ids come from nba_market.app_link_ids (written with every board archive, nba/archive_live_boards.py). The server sends
// each leg's id + its game's tip; the CLIENT builds the url at view time and leaves out a leg whose game has already started (so a started
// leg never goes into the link, even on a stored snapshot). Amount and Flex/Power are NOT settable by any of the three links - the card keeps
// its PLAY $ line.
const LINK_MK = { steals: "player_steals", turnovers: "player_turnovers", blocks: "player_blocks", stocks: "player_blocks_steals", blocks_steals: "player_blocks_steals",
  rebounds: "player_rebounds", points: "player_points", pts_ast: "player_points_assists", pra: "player_points_rebounds_assists", pts_reb: "player_points_rebounds",
  assists: "player_assists", threes_made: "player_threes", threes: "player_threes", reb_ast: "player_rebounds_assists",
  // the board archive files these under other names than the leg's prop key (2026-11-07: a Sleeper Fantasy Score leg got no link id, so the deep link left it out and the live check never verified it)
  fantasy_score: "player_fantasy_points", fantasy_points: "player_fantasy_points", fg3a: "player_threes_attempted", three_point_attempts: "player_threes_attempted" };
async function appLinkMap(sql) {
  const has = (await q(sql, "SELECT to_regclass('nba_market.app_link_ids') IS NOT NULL ok"))[0];
  if (!has || !has.ok) return new Map();
  const rows = await q(sql, `SELECT bookmaker, pn, market_key, side, line::float line, ids FROM nba_market.app_link_ids
                             WHERE bookmaker IN ('prizepicks','sleeper','betr') AND updated_at > now() - interval '4 days'`);
  return new Map(rows.map(r => [[r.bookmaker, r.pn, r.market_key, r.side, Number(r.line)].join("|"), typeof r.ids === "string" ? JSON.parse(r.ids) : r.ids]));
}
function appLinkIds(map, app, x) {
  if (!["prizepicks", "sleeper", "betr"].includes(app)) return null;
  const base = LINK_MK[x.prop] || ("player_" + x.prop), side = sideIn(x.side), pn = normName(x.player), line = Number(x.line);
  return map.get([app, pn, base, side, line].join("|")) || map.get([app, pn, base + "_alternate", side, line].join("|")) || null;
}
const LINK_APPS = ["prizepicks", "sleeper", "betr"];
// one leg's link data: the app's ids for it + its side/line + its game's tip (the client builds the url from the legs that are IN the slip at
// view time - an unchecked, started or substituted leg is handled there)
function linkLegFor(app, x, map, tipAt) {
  if (!LINK_APPS.includes(app)) return null;
  return { ids: appLinkIds(map, app, x), side: sideIn(x.side) === "Under" ? "u" : "o", line: Number(x.line), tip_utc: tipAt ? new Date(tipAt).toISOString() : null };
}

async function replaySlips(sql, cfg, slate) {
  const sfxRow = (await q(sql, "SELECT config_json FROM nba_config.classification_config WHERE config_key = $1", [cfg.ui.replay_backtest.pp_table_suffix_config]))[0];
  const sfxCfg = sfxRow ? (typeof sfxRow.config_json === "string" ? JSON.parse(sfxRow.config_json) : sfxRow.config_json) : {};
  const suffix = String(sfxCfg.suffix || "").replace(/[^a-z0-9_]/gi, "");
  const states = await q(sql, "SELECT strategy, state, live_cap FROM nba_score.live_strategy_state");
  const st = new Map(states.map(s => [s.strategy, s]));
  const pp = [];
  for (const [name, spec] of Object.entries(cfg.ui.pp_strategies)) {
    const s = st.get(name);
    if (!s || s.state === "red" || !(Number(s.live_cap) > 0) || /^[WR]_/.test(name)) continue;   // red / retired / all-star-week / rotation-only sit out a normal slate
    const table = `nba_score.slip_engine_slips${suffix}${/^[CDRW]_/.test(name) ? "_nosteals" : ""}`;
    const rows = await q(sql, `SELECT k, legs_json, size, structure, hits, payout FROM ${table}
                               WHERE game_date = $1::date AND composition = $2 AND size = $3 AND structure = $4 AND k <= $5 AND phase <> 'final7' ORDER BY k`,
      [slate.date, spec.composition, spec.size, spec.structure, Number(s.live_cap)]);
    for (const r of rows) pp.push({ ...r, app: "prizepicks", track: name, strategy: name, status: "replay_backtest" });
  }
  const ud = [];
  for (const spec of (cfg.ui.ud_portfolios || {})[cfg.ui.ud_portfolio] || []) {
    const table = String(cfg.ui.replay_backtest.ud_table).replace(/[^a-z0-9_.]/gi, "");
    const rows = await q(sql, `SELECT k, legs_json, size, structure, hits, payout FROM ${table}
                               WHERE game_date = $1::date AND composition = $2 AND size = $3 AND structure = $4 AND k <= $5 ORDER BY k`,
      [slate.date, spec.composition, spec.size, spec.structure, spec.cap]);
    for (const r of rows) ud.push({ ...r, app: "underdog", track: `UD ${cfg.ui.ud_portfolio} ${spec.composition} ${spec.size}${spec.structure === "flex" ? "F" : "S"}`, status: "replay_backtest" });
  }
  return { source: "replay_backtest", suffix, pp, ud };
}

// LIVE-LOOP REPLAY (2026-10-18, owner reviewing the replay screen: "Good now?"). The certified backtest shows every strategy at
// its cap on every slate; the live engine does not (slate-size cap 1 on <= 4 games, red / week-1 states, streak flags, the earned
// unit). So before opening night the screen replays the slips the LIVE ENGINE built for a past slate in the production-
// configuration season replay (nba_score.replay_audit_slips, label = nba_main_ui.replay_live.label, audit_season_replay with no
// overrides). Shadow slips stay hidden (recorded, never staked). Underdog is not in that replay - its slips come from the
// certified Underdog backtest and say so.
async function liveReplayLabel(sql, cfg) {
  const label = String(((cfg.ui || {}).replay_live || {}).label || "").replace(/[^a-z0-9_]/gi, "");
  if (!label) return null;
  const has = (await q(sql, "SELECT to_regclass('nba_score.replay_audit_slips') IS NOT NULL ok"))[0];
  return has && has.ok ? label : null;
}
async function liveReplaySlips(sql, cfg, slate, label) {
  const rows = await q(sql, `SELECT strategy, k, legs_json, size, structure, status, stake_weight, hits, payout, streak_note, unit_usd
                             FROM nba_score.replay_audit_slips WHERE label = $1 AND game_date = $2::date AND status NOT IN ('dup')
                             AND status NOT LIKE '%shadow%' ORDER BY strategy, k`, [label, slate.date]);
  const bt = await replaySlips(sql, cfg, slate);
  return { source: "replay_live", label, pp: rows.map(r => ({ ...r, app: "prizepicks", track: r.strategy, replay_live: true })), ud: bt.ud };
}

// THE BACKTEST BEHIND EACH CERTIFIED SLIP (2026-10-15; owner: "be sure it also reflects the backtest"). The board's hit
// probability is the market-anchored number for ANY leg; a certified slip's legs come from cells whose hit rate the backtest
// measured and certified, and the strategy audit (nba/audit_strategy_honest_hp.py) showed that measured cell rate tracks what
// the strategies' legs hit (within 3-5 points a season) while a per-leg board number does not see the cell selection. So each
// PrizePicks engine slip also carries: per leg the certified cell rate (nba_score.edge_monitor_ref, the edge monitor's own
// reference), and per slip the strategy's certified leg hit rate (live_strategy_calib.cert_leg_hit) and its backtest record by
// season (the market-free twin the live engine calibrates against, at the strategy's live cap).
async function backtestContext(sql, cfg, names) {
  const cells = await q(sql, "SELECT cell, tier, side, p, n FROM nba_score.edge_monitor_ref");
  const cellRate = new Map(cells.map(r => [`${r.cell}|${r.tier}|${r.side}`, { p: Number(r.p), n: Number(r.n) }]));
  const calib = await q(sql, "SELECT strategy, cert_leg_hit FROM nba_score.live_strategy_calib");
  const certHit = new Map(calib.map(r => [r.strategy, r.cert_leg_hit == null ? null : Number(r.cert_leg_hit)]));
  const sfxRow = (await q(sql, "SELECT config_json FROM nba_config.classification_config WHERE config_key = $1", [cfg.ui.replay_backtest.pp_table_suffix_config]))[0];
  const sfxCfg = sfxRow ? (typeof sfxRow.config_json === "string" ? JSON.parse(sfxRow.config_json) : sfxRow.config_json) : {};
  const suffix = String(sfxCfg.suffix || "").replace(/[^a-z0-9_]/gi, "");
  const states = new Map((await q(sql, "SELECT strategy, live_cap FROM nba_score.live_strategy_state")).map(s => [s.strategy, Number(s.live_cap)]));
  const record = new Map();
  for (const name of names) {
    const spec = (cfg.ui.pp_strategies || {})[name];
    if (!spec) continue;
    const cap = Math.max(1, states.get(name) || 0);
    const table = `nba_score.slip_engine_slips${suffix}${/^[CDRW]_/.test(name) ? "_nosteals" : ""}`;
    // final7 excluded (2026-10-15 full pass): the engine stakes nothing in the last 7 days and certification excludes them
    const rows = await q(sql, `SELECT season, count(*)::int slips, sum(stake)::float stake, sum(payout)::float payout, sum(hits)::float hits, sum(size)::float legs
                               FROM ${table} WHERE composition = $1 AND size = $2 AND structure = $3 AND k <= $4 AND phase <> 'final7'
                               GROUP BY season ORDER BY season`,
      [spec.composition, spec.size, spec.structure, cap]);
    record.set(name, rows.map(r => ({ season: r.season, slips: r.slips, roi_pct: r.stake ? r1(100 * (r.payout / r.stake - 1)) : null,
      leg_hit_0_100: r.legs ? r1(100 * r.hits / r.legs) : null })));
  }
  const stateOf = new Map((await q(sql, "SELECT strategy, state FROM nba_score.live_strategy_state")).map(s => [s.strategy, s.state]));
  // THE OWNER'S UNIT (2026-10-15): classification_config['stake_unit'] - what one unit is in dollars, the apps' minimum entry, and
  // whether paper strategies are played from the first night (owner: "I'm going to start from the beginning of the season").
  const suRow = (await q(sql, "SELECT config_json, now() AS read_at FROM nba_config.classification_config WHERE config_key = 'stake_unit'"))[0];   // now(): never cached (the engine moves the unit)
  const su = suRow ? (typeof suRow.config_json === "string" ? JSON.parse(suRow.config_json) : suRow.config_json) : {};
  const unit = { usd: Number(su.unit_usd || 1), min: Number(su.min_stake_usd || 1), playPaper: su.play_from_day1 !== false,
                 udPlay: su.ud_play === true, auto: await unitAutoStatus(sql, su), byApp: null, perApp: null };
  // UNIT PER APP (owner 2026-11-02 14:00 PT: "the unit is gonna be by app, not more the total"): stake_unit.per_app.units, written by
  // nba/unit_per_app.py after every graded slate - each app's slips are priced at that app's unit
  const pa = su.per_app;
  if (pa && pa.enabled && pa.units) {
    unit.byApp = Object.fromEntries(Object.entries(pa.units).map(([a, v]) => [a, Number(v && v.unit)]));
    unit.perApp = pa.units;
    unit.flat = !!pa.flat;
    try {
      const ch = await q(sql, `SELECT app, unit_from f, unit_usd u, reason FROM nba_score.live_unit_app
                               WHERE game_date = (SELECT max(game_date) FROM nba_score.live_unit_app) AND unit_usd <> unit_from ORDER BY app`);
      unit.changes = ch.map(r => ({ app: r.app, from: Number(r.f), to: Number(r.u), reason: r.reason }));
    } catch (_e) { unit.changes = []; }
  }
  // UNDERDOG STOP (2026-10-16, owner: "full force since day one ... if things are not going well, then we start changing"): the
  // Underdog P5 portfolio is played when stake_unit.ud_play is true; its edge monitor's ALARM (sticky per season, §31o) stops it.
  let udAlarm = false;
  try {
    udAlarm = !!((await q(sql, `SELECT bool_or(decision = 'ALARM') a FROM nba_score.ud_edge_monitor
                                WHERE season_start = (SELECT max(season_start) FROM nba_score.ud_edge_monitor)`))[0] || {}).a;
  } catch (_e) { udAlarm = false; }
  // SLEEPER PLAY GATE (2026-10-26): classification_config['sleeper_live'].play - false returns Sleeper to paper (recorded, not shown)
  let slPlay = false;
  try {
    const r = (await q(sql, "SELECT config_json, now() AS read_at FROM nba_config.classification_config WHERE config_key = 'sleeper_live'"))[0];
    const c = r ? (typeof r.config_json === "string" ? JSON.parse(r.config_json) : r.config_json) : {};
    slPlay = c.enabled === true && c.play === true;
  } catch (_e) { slPlay = false; }
  // FLIFF PLAY GATE (2026-10-26): classification_config['fliff_live'].play - false returns Fliff to paper (recorded, not shown)
  let flPlay = false;
  try {
    const r = (await q(sql, "SELECT config_json, now() AS read_at FROM nba_config.classification_config WHERE config_key = 'fliff_live'"))[0];
    const c = r ? (typeof r.config_json === "string" ? JSON.parse(r.config_json) : r.config_json) : {};
    flPlay = c.enabled === true && c.play === true;
  } catch (_e) { flPlay = false; }
  // BETR PLAY GATE (2026-10-26): classification_config['betr_live'].play - false returns Betr to paper (recorded, not shown)
  let btPlay = false;
  try {
    const r = (await q(sql, "SELECT config_json, now() AS read_at FROM nba_config.classification_config WHERE config_key = 'betr_live'"))[0];
    const c = r ? (typeof r.config_json === "string" ? JSON.parse(r.config_json) : r.config_json) : {};
    btPlay = c.enabled === true && c.play === true;
  } catch (_e) { btPlay = false; }
  return { cellRate, certHit, record, suffix, stateOf, unit, udAlarm, slPlay, flPlay, btPlay };
}

// PLAY OR SKIP, AND HOW MUCH (2026-10-15). Until today the label read only 'shadow' from the status, so a slip the engine recorded
// but did not stake (week-1 / week-2 rules, the daily ceiling, below the minimum entry) showed "staked" for an active strategy.
const SKIP_REASON = [["shadow", "shadow strategy"], ["week1_skip", "week-1 rule"], ["week2_skip", "week-2 rule"],
  ["capped", "daily ceiling reached"], ["below_min", "its half stake is below the minimum entry"],
  // 2026-10-22 quote gate: a backup is used only when a slip fails PrizePicks' quote; a gate skip failed it - never PLAY, never shown
  ["backup", "backup (not needed)"], ["quote_skip", "PrizePicks' quote did not confirm it"]];
function unitOf(bt, app) {
  const v = bt.unit.byApp && bt.unit.byApp[app];
  return Number.isFinite(v) && v > 0 ? v : bt.unit.usd;
}
function udAdvice(s, bt) {
  const st = String(s.status || "");
  if (!bt.unit.udPlay) return { label: "paper (Underdog engine)", play_usd: null };
  if (st.startsWith("stand_down")) return { label: "SKIP - Underdog stand-down (" + st.slice(11) + ")", play_usd: null };
  if (st.startsWith("shadow") || s.portfolio === "P4") return { label: "SKIP - shadow portfolio", play_usd: null };
  // the edge monitor measures P5's certified cells; it stops P5 only (portfolio T, owner 2026-10-25, is not what it measures)
  if (bt.udAlarm && s.portfolio === "P5") return { label: "SKIP - Underdog edge monitor ALARM (stopped)", play_usd: null };
  const w = Number(s.stake == null ? 1 : s.stake);
  if (!(w > 0)) return { label: "SKIP - not staked", play_usd: null };
  const usd = Math.round(unitOf(bt, "underdog") * w * 100) / 100;
  if (usd < bt.unit.min) return { label: "SKIP - its stake is below the minimum entry", play_usd: null };
  return { label: "PLAY $" + usd.toFixed(2) + " (Underdog)", play_usd: usd };
}
function stakeAdvice(s, bt) {
  const st = String(s.status || "");
  if (st === "replay_backtest") return { label: "backtest replay", play_usd: null };
  if (s.replay_live) {
    // a past slate as the live engine played it: what was staked that day (its unit then x weight), never a PLAY for today
    const skip = SKIP_REASON.find(([k]) => st.includes(k));
    if (skip) return { label: `SKIP - ${skip[1]} (replay)`, play_usd: null };
    if (st.includes("void")) return { label: "replay: void - stake returned", play_usd: null };
    const u = s.unit_usd != null && s.unit_usd !== "" ? Number(s.unit_usd) : bt.unit.usd;
    return { label: "replay: staked $" + (Math.round(u * (s.stake_weight == null ? 1 : Number(s.stake_weight)) * 100) / 100).toFixed(2) + " that day", play_usd: null };
  }
  if (s.app === "underdog") return udAdvice(s, bt);
  if (s.app === "sleeper") {
    if (!bt.slPlay) return { label: "paper (Sleeper engine)", play_usd: null };
    const w = Number(s.stake == null ? 1 : s.stake);
    if (!(w > 0)) return { label: "SKIP - not staked", play_usd: null };
    const usd = Math.round(unitOf(bt, "sleeper") * w * 100) / 100;
    if (usd < bt.unit.min) return { label: "SKIP - its stake is below the minimum entry", play_usd: null };
    return { label: "PLAY $" + usd.toFixed(2) + " (Sleeper)", play_usd: usd };
  }
  if (s.app === "fliff") {
    if (!bt.flPlay) return { label: "paper (Fliff engine)", play_usd: null };
    const w = Number(s.stake == null ? 1 : s.stake);
    if (!(w > 0)) return { label: "SKIP - not staked", play_usd: null };
    const usd = Math.round(unitOf(bt, "fliff") * w * 100) / 100;
    if (usd < bt.unit.min) return { label: "SKIP - its stake is below the minimum entry", play_usd: null };
    return { label: "PLAY $" + usd.toFixed(2) + " (Fliff)", play_usd: usd };
  }
  if (s.app === "betr") {
    if (!bt.btPlay) return { label: "paper (Betr engine)", play_usd: null };
    const w = Number(s.stake == null ? 1 : s.stake);
    if (!(w > 0)) return { label: "SKIP - not staked", play_usd: null };
    const usd = Math.round(unitOf(bt, "betr") * w * 100) / 100;
    if (usd < bt.unit.min) return { label: "SKIP - its stake is below the minimum entry", play_usd: null };
    return { label: "PLAY $" + usd.toFixed(2) + " (Betr)", play_usd: usd };
  }
  if (s.app !== "prizepicks") return { label: "paper", play_usd: null };
  const skip = SKIP_REASON.find(([k]) => st.includes(k));
  if (skip) return { label: `SKIP - ${skip[1]}`, play_usd: null };
  const state = bt.stateOf.get(s.strategy) || "paper";
  const plays = state === "active" || (bt.unit.playPaper && ["paper", "yellow", "critical", "week2"].includes(state));
  if (!plays) return { label: `SKIP - strategy ${state}`, play_usd: null };
  // 2026-10-18: a slip is priced at the unit in force when the engine picked it (live_slips.unit_usd; earn the raise moves it)
  const u = s.unit_usd != null && s.unit_usd !== "" ? Number(s.unit_usd) : unitOf(bt, "prizepicks");
  const usd = Math.round(u * (s.stake_weight == null ? 1 : Number(s.stake_weight)) * 100) / 100;
  if (usd < bt.unit.min) return { label: "SKIP - its stake is below the minimum entry", play_usd: null };
  return { label: "PLAY $" + usd.toFixed(2) + (state === "active" ? "" : " (" + state + ")"), play_usd: usd };
}

// THE SLIPS SCREEN IS PRECOMPUTED (owner 2026-10-26 18:31 PT: "The slips also take long to load ... it should run in a pipeline before
// and just be retrieved by the ui"). The screen's payload is built by THIS code (no second copy of the logic) and kept in
// nba_score.ui_slips_snapshot, one row per slate and mode, with a fingerprint of everything it is built from (every app's slips for
// the slate - status, stake, results -, PrizePicks' quotes, the scored board, injuries, whole-number probabilities, the UI / unit /
// play-gate configs and payout rules, strategy states, the unit history, streak flags, the edge monitors, the code version and the
// Pacific date). A view serves the stored payload while the fingerprint matches (at most 6 h old); otherwise it builds, stores and
// serves. The pipelines warm it right after they change what the screen shows (P3 after the picks, the PrizePicks quote gate, P2A
// after grading: POST /api/slips/high-hit?refresh=1), so the owner's first view is the stored one. A failed snapshot read or write
// never blocks the screen - it builds as before.
const SNAP_MAX_AGE = "6 hours";
async function slipsFingerprint(sql, slate, version) {
  const r = (await q(sql, `SELECT md5(concat_ws('|',
     (SELECT count(*) || ':' || coalesce(max(placed_at)::text, '') || ':' || coalesce(max(graded_at)::text, '') || ':' || md5(coalesce(string_agg(strategy || k || status || coalesce(hits::text, '') || coalesce(stake_weight::text, '') || coalesce(unit_usd::text, ''), ',' ORDER BY strategy, k), '')) FROM nba_score.live_slips WHERE game_date = $1::date),
     (SELECT count(*) || ':' || coalesce(max(built_at)::text, '') || ':' || coalesce(max(graded_at)::text, '') || ':' || md5(coalesce(string_agg(status || coalesce(hits::text, '') || stake::text, ',' ORDER BY portfolio, composition, size, k), '')) FROM nba_score.ud_live_slips WHERE game_date = $1::date),
     (SELECT count(*) || ':' || coalesce(max(built_at)::text, '') || ':' || coalesce(max(graded_at)::text, '') || ':' || md5(coalesce(string_agg(status || stake::text, ','), '')) FROM nba_score.sleeper_live_slips WHERE game_date = $1::date),
     (SELECT count(*) || ':' || coalesce(max(built_at)::text, '') || ':' || coalesce(max(graded_at)::text, '') || ':' || md5(coalesce(string_agg(status || stake::text, ','), '')) FROM nba_score.fliff_live_slips WHERE game_date = $1::date),
     (SELECT count(*) || ':' || coalesce(max(built_at)::text, '') || ':' || coalesce(max(graded_at)::text, '') || ':' || md5(coalesce(string_agg(status || stake::text, ','), '')) FROM nba_score.betr_live_slips WHERE game_date = $1::date),
     (SELECT count(*) || ':' || coalesce(max(quoted_at)::text, '') FROM nba_score.live_slip_quotes WHERE game_date = $1::date),
     (SELECT count(*) || ':' || coalesce(max(built_at)::text, '') FROM nba_score.board_scored WHERE game_date = $1::date),
     (SELECT count(*) || ':' || coalesce(max(updated_at)::text, '') FROM nba_market.app_link_ids WHERE updated_at > now() - interval '4 days'),
     (SELECT coalesce(max(snapshot_ts)::text, '') FROM nba_daily.injury_report_snapshots WHERE game_date = $1::date),
     (SELECT count(*) || ':' || coalesce(max(built_at)::text, '') FROM nba_score.final_hp_derived WHERE game_date = $1::date),
     (SELECT md5(string_agg(config_key || config_json::text, ',' ORDER BY config_key)) FROM nba_config.classification_config
       WHERE config_key IN ('nba_main_ui', 'stake_unit', 'sleeper_live', 'fliff_live', 'betr_live', 'sleeper_payout', 'prop_reliability_audit_latest')),
     (SELECT md5(string_agg(rule_key || rule_json::text, ',' ORDER BY rule_key)) FROM nba_config.pp_slip_rules),
     (SELECT md5(coalesce(string_agg(strategy || state || live_cap, ',' ORDER BY strategy), '')) || coalesce(max(updated_at)::text, '') FROM nba_score.live_strategy_state),
     (SELECT coalesce(max(updated_at)::text, '') FROM nba_score.live_unit_history),
     (SELECT md5(coalesce(string_agg(strategy || flag_on || coalesce(reason, ''), ',' ORDER BY strategy), '')) FROM nba_score.live_streak_flags WHERE game_date = $1::date),
     (SELECT count(*) || ':' || coalesce(max(decided_at)::text, '') FROM nba_score.ud_edge_monitor),
     (SELECT count(*) || ':' || coalesce(sum(p)::text, '') FROM nba_score.edge_monitor_ref),
     (SELECT count(*) || ':' || coalesce(sum(cert_leg_hit)::text, '') FROM nba_score.live_strategy_calib),
     (now() AT TIME ZONE 'America/Los_Angeles')::date::text, $2::text, $3::text)) AS fp, now() AS read_at`, [slate.date, slate.mode, version]))[0];
  return r ? r.fp : null;
}

// LIVE LINE CHECK (2026-11-04, owner 14:01 PT: a PrizePicks leg turned goblin / demon after the 1:42 quote - Randle 0.5 Blocks, Brown 2.5 Turnovers - and
// a goblin came in as a "regular" substitute). EVERY load re-reads PrizePicks' own latest board (nba_market.pp_board_row, the newest payout-map run: kind per
// projection straight from PrizePicks) and marks each PrizePicks slip leg and pool leg: pp_now = standard | goblin | demon | moved (the line is gone, other
// lines of that prop remain) | missing (player / prop off the board). The check runs AFTER the stored snapshot is read, so a cached payload is never trusted.
// A pool leg that is not confirmed standard is dropped; a slip leg that is not standard is flagged (the client unchecks it and swaps in a confirmed one).
const PP_STAT_PROP = { "Points": "points", "Rebounds": "rebounds", "Assists": "assists", "3-PT Made": "threes_made", "Blocked Shots": "blocks", "Steals": "steals",
  "Turnovers": "turnovers", "Blks+Stls": "stocks", "Pts+Rebs+Asts": "pra", "Pts+Rebs": "pts_reb", "Pts+Asts": "pts_ast", "Rebs+Asts": "reb_ast",
  "Personal Fouls": "personal_fouls", "Fantasy Score": "fantasy_score", "Double-Double": "double_double", "FG Made": "fgm", "FG Attempted": "fga",
  "Free Throws Made": "ftm", "Free Throws Attempted": "fta", "3-PT Attempted": "fg3a", "Offensive Rebounds": "oreb", "Defensive Rebounds": "dreb" };
// LIVE CHECK ON EVERY LOAD (owner 2026-11-04 16:17 PT): each app's own board is read from inside the Worker (livecheck.js, all apps in parallel, seconds); when
// no app answered, the stored-board check below still runs.
// BEST PAIRINGS OF THE DAY (owner 2026-11-06): nba_friend.pairs (built by the friend pipeline) live-checked like the slips; out.pairs = { app: [legs] }
async function pairsLive(sql) {
  const r = {};
  try {
    const rows = await q(sql, "SELECT app, kind, p::float p, leg, rank FROM nba_friend.pairs WHERE game_date = (now() AT TIME ZONE 'America/Los_Angeles')::date ORDER BY app, rank", [], 6000);
    const by = {};
    for (const x of rows) { const l = typeof x.leg === "string" ? JSON.parse(x.leg) : x.leg; l.p = x.p; l._pair = true; l.kind = x.kind; if (x.app === "prizepicks" && x.kind !== "standard") l.want_odds = x.kind; (by[x.app] = by[x.app] || []).push(l); }
    const tmp = { ok: true, source: "live", generated_slips: Object.keys(by).map(a => ({ source_key: a, name: "pairs", legs: by[a] })), backup_pool: [] };
    try { await overlayLive(sql, tmp, overlayPpLiveDb); } catch (_e) { /* unchecked legs stay listed */ }
    const now = Date.now();
    for (const s of tmp.generated_slips) {
      r[s.source_key] = s.legs.filter(l => !(s.source_key === "prizepicks" ? (l.pp_now && l.pp_now !== (l.want_odds || "standard")) : (l.live_now && l.live_now !== "ok")))
        .filter(l => { const t = Date.parse(l.official_game_time_utc || ""); return !(t && t <= now); })
        .map(l => ({ player: l.player_name, prop: l.prop_label || l.canonical_prop_key, side: l.selected_side, line: l.line_value, matchup: l.matchup || null, tip: l.official_game_time_utc || (l.link && l.link.tip_utc) || null, p: l.p, kind: l.kind || "standard", extra: l.extra || null, ids: (l.link && l.link.ids) || null, sd: sideIn(l.selected_side) === "Under" ? "u" : "o" }));   // ids + side: the client turns each pairing into a deep link (owner 2026-11-10)
      const ex = r[s.source_key].filter(l => l.extra), main = r[s.source_key].filter(l => !l.extra).slice(0, ({ prizepicks: 8, underdog: 5, sleeper: 5, fliff: 3, betr: 3 }[s.source_key] || 3) * 2);
      r[s.source_key] = main.concat(ex);   // pool of twice the shown count: the screen drops a started leg and the next takes its place
    }
  } catch (_e) { /* pairs not built yet */ }
  return r;
}
export async function overlayPpLive(sql, out) {
  const [res, pr] = await Promise.all([overlayPpLive0(sql, out), pairsLive(sql)]);
  if (res && typeof res === "object") res.pairs = pr;
  return res;
}
async function overlayPpLive0(sql, out) {
  let liveErr = null;
  try {
    const r = await overlayLive(sql, out, overlayPpLiveDb);   // PrizePicks unreachable: its legs are marked from the stored board inside the live check
    const apps = (r && r.pp_live && r.pp_live.apps) || null;
    if (apps && Object.values(apps).some(a => a.ok)) return r;
    liveErr = apps ? "no app answered: " + JSON.stringify(apps).slice(0, 200) : "live check did not run (" + (out && out.source) + ")";
  } catch (e) { liveErr = String(e && e.message || e).slice(0, 200); }
  const d = await overlayPpLiveDb(sql, out);
  if (d && d.pp_live) d.pp_live.live_error = liveErr;
  return d;
}
async function overlayPpLiveDb(sql, out) {
  try {
    if (!out || !out.ok || out.source !== "live") return out;
    const slipsPP = (out.generated_slips || []).filter(s => s.source_key === "prizepicks");
    const poolPP = (out.backup_pool || []).filter(l => l.source_key === "prizepicks");
    const legs = [...slipsPP.flatMap(s => s.legs || []), ...poolPP];
    if (!legs.length) return out;
    const rf = (await q(sql, "SELECT max(run_file) rf FROM nba_market.pp_board_row"))[0];
    const m = rf && rf.rf && /pp_payout_map_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(rf.rf);
    if (!m) return out;
    const ranAt = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
    const names = [...new Set(legs.map(l => String(l.player_name || "")).filter(Boolean))];
    const rows = await q(sql, "SELECT player, stat, line::float line, odds FROM nba_market.pp_board_row WHERE run_file = $1 AND player = ANY($2::text[])", [rf.rf, names]);
    const by = new Map();
    for (const r of rows) { const p = PP_STAT_PROP[r.stat]; if (!p) continue; const k = r.player + "|" + p; if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
    const mark = l => {
      const rs = by.get(String(l.player_name) + "|" + String(l.canonical_prop_key)) || [];
      const hit = rs.find(r => Math.abs(Number(r.line) - Number(l.line_value)) < 1e-9);
      l.pp_now = hit ? String(hit.odds || "unknown").toLowerCase() : (rs.length ? "moved" : "missing");
      l.pp_checked_at = ranAt;
    };
    legs.forEach(mark);
    out.backup_pool = (out.backup_pool || []).filter(l => l.source_key !== "prizepicks" || l.pp_now === "standard");
    const flagged = [];
    for (const s of slipsPP) {
      const bad = (s.legs || []).filter(l => l.pp_now !== "standard");
      if (bad.length) { s.pp_alert = bad.map(l => `${l.player_name} ${l.line_value} ${l.canonical_prop_key} is now ${l.pp_now}`); flagged.push(...s.pp_alert.map(a => `${s.structure_label || s.slip_type}: ${a}`)); }
    }
    out.pp_live = { checked_at: ranAt, run_file: rf.rf, legs_checked: legs.length, flagged };
  } catch (e) { out.pp_live = { error: String(e && e.message || e).slice(0, 160) }; }
  return out;
}

export async function apiHighHit(sql, cfg, url, version) {
  const t0 = Date.now();
  const refresh = url && url.searchParams && url.searchParams.get("refresh") === "1";
  let slate = null, fp = null;
  try { slate = await resolveSlate(sql, cfg, url); fp = await slipsFingerprint(sql, slate, version); } catch (_e) { fp = null; }
  if (fp && !refresh) {
    try {
      const row = (await q(sql, `SELECT payload, to_char(built_at AT TIME ZONE 'America/Los_Angeles', 'FMHH12:MI AM') t, build_ms, now() AS read_at
                                 FROM nba_score.ui_slips_snapshot WHERE slate_date = $1::date AND slate_mode = $2 AND fingerprint = $3
                                 AND built_at > now() - interval '${SNAP_MAX_AGE}'`, [slate.date, slate.mode, fp]))[0];
      if (row) {
        const out = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
        out.snapshot = { served: true, built_pt: row.t, build_ms: row.build_ms, fingerprint: fp };
        out.timing_ms = { snapshot: Date.now() - t0 };
        return await overlayPpLive(sql, out);
      }
    } catch (_e) { /* snapshot unreadable - build below */ }
  }
  const out = await buildHighHit(sql, cfg, url, version);
  const ms = Date.now() - t0;
  if (fp && out && out.ok) {
    try {
      await q(sql, `INSERT INTO nba_score.ui_slips_snapshot (slate_date, slate_mode, fingerprint, payload, built_at, build_ms)
                    VALUES ($1::date, $2, $3, $4::jsonb, now(), $5)
                    ON CONFLICT (slate_date, slate_mode) DO UPDATE SET fingerprint = EXCLUDED.fingerprint, payload = EXCLUDED.payload,
                      built_at = EXCLUDED.built_at, build_ms = EXCLUDED.build_ms RETURNING 1`, [slate.date, slate.mode, fp, JSON.stringify(out), ms], 20000);
      out.snapshot = { served: false, stored: true, build_ms: ms, fingerprint: fp, refresh: !!refresh };
    } catch (e) { out.snapshot = { served: false, stored: false, error: String(e && e.message || e).slice(0, 160) }; }
  }
  return await overlayPpLive(sql, out);
}

async function buildHighHit(sql, cfg, url, version) {
  const T = {}; let tp = Date.now();
  const lap = k => { T[k] = Date.now() - tp; tp = Date.now(); };
  let slate = await resolveSlate(sql, cfg, url);
  const pricing = pricingFrom(cfg);
  const boardSlate = slate;
  let eng = await engineSlips(sql, cfg, boardSlate);
  let fallbackNote = null;
  if (!eng.pp.length && !eng.ud.length && !(eng.sl || []).length && !(eng.fl || []).length && !(eng.bt || []).length) {
    // first choice: the live engine's own slips for a past slate (production-configuration season replay)
    const lbl = await liveReplayLabel(sql, cfg);
    if (lbl) {
      const last = (await q(sql, `SELECT max(game_date)::text d FROM nba_score.replay_audit_slips WHERE label = $1 AND game_date <= $2::date
                                  AND status NOT IN ('dup') AND status NOT LIKE '%shadow%'`, [lbl, slate.date]))[0];
      if (last && last.d && (slate.mode === "replay" || last.d === slate.date)) {
        if (last.d !== slate.date) {
          slate = { ...slate, date: last.d, replay_of: boardSlate.date };
          fallbackNote = `No live slips yet for ${boardSlate.date}: showing ${last.d}, the latest past slate the live engine played, exactly as it played it (production-configuration season replay '${lbl}': caps, slate-size rule, strategy states, streak flags, the earned unit), with results. Underdog slips are from the certified Underdog backtest.`;
        }
        eng = await liveReplaySlips(sql, cfg, slate, lbl);
      }
    }
    if (!eng.pp.length && !eng.ud.length) { slate = boardSlate; fallbackNote = null; eng = await replaySlips(sql, cfg, boardSlate); }
  }
  // Replay of a slate the certified backtest does not cover (it is regular season only - a playoff replay slate has none):
  // replay the latest slate it does cover instead, and say so. A live slate never falls back - it shows today's or nothing.
  if (!eng.pp.length && !eng.ud.length && slate.mode === "replay") {
    const sfx = String(eng.suffix || "").replace(/[^a-z0-9_]/gi, "");
    // the latest slate the live plan STAKES: the final 7 days of the regular season are never played (engine H6), so they are skipped
    const last = (await q(sql, `SELECT max(game_date)::text d FROM nba_score.slip_engine_slips${sfx} WHERE game_date <= $1::date AND phase <> 'final7'`, [slate.date]))[0];
    if (last && last.d && last.d !== slate.date) {
      slate = { ...slate, date: last.d, replay_of: boardSlate.date };
      eng = await replaySlips(sql, cfg, slate);
      fallbackNote = `No live slips yet for ${boardSlate.date}: showing a past slate instead - the certified backtest's latest slate the plan plays, ${last.d} (regular season; the final 7 days are never staked).`;
    }
  }
  lap("slips");
  // every board leg of the slate (both apps the engines play), to price and describe each slip leg and to draw the backup pool.
  // The whole slate is loaded on purpose: the largest PrizePicks + Underdog slate on record is 11,844 legs (cap 20,000; a hit
  // on the cap is reported, never silent), and a narrowed load measured no faster (2026-10-14: 7.6 s vs 6.0 s).
  const minScore = Number(cfg.ui.backup_pool.min_score), size = Number(cfg.ui.backup_pool.size);
  const BOARD_CAP = 20000;
  const board = await loadLegs(sql, cfg, { date: slate.date, mode: slate.mode }, { where: "AND b.app IN ('prizepicks', 'underdog', 'sleeper')", limit: BOARD_CAP, withInsight: false, screen: false });
  lap("board");
  const pct = new Map();
  // the board is loaded unscreened so every slip leg resolves; unplaceable Underdog legs (ud_hidden) stay out of the percentile and the backup pool
  for (const app of ["prizepicks", "underdog", "sleeper"]) pct.set(app, board.filter(l => l.source_key === app && !l.ud_hidden).map(l => Number(l.score_0_100)).sort((a, b) => a - b));
  const percentile = (app, s) => { const arr = pct.get(app) || []; if (!arr.length) return null; let lo = 0; while (lo < arr.length && arr[lo] <= s) lo++; return r1(100 * lo / arr.length); };
  const byKey = new Map();
  const norm = normName;
  for (const l of board) {
    byKey.set([l.source_key, l.player_id, l.canonical_prop_key, Number(l.line_value), l.selected_side].join("|"), l);
    byKey.set([l.source_key, "n:" + norm(l.player_name), l.canonical_prop_key, Number(l.line_value), l.selected_side].join("|"), l);
  }
  const risk = await dnpRisk(sql, slate.date, board.map(l => l.player_name));
  lap("injuries");
  const bt = await backtestContext(sql, cfg, [...new Set(eng.pp.map(s => s.strategy).filter(Boolean))]);
  lap("backtest");
  const notes = [];
  if (board.length >= BOARD_CAP) notes.push(`The slate has more than ${BOARD_CAP} legs - only the top ${BOARD_CAP} by score were matched.`);
  let unmatched = 0;
  const slips = [];
  const ljOf = s => (typeof s.legs_json === "string" ? JSON.parse(s.legs_json) : s.legs_json || []);
  eng.sl = [...(eng.sl || []), ...(eng.fl || []), ...(eng.bt || [])];   // Sleeper + Fliff + Betr (live only; the replays carry none) - each row keeps its own app
  const pb = await placeByMap(sql, slate.date, [...eng.pp, ...eng.ud, ...eng.sl].flatMap(s => ljOf(s).map(x => ({
    pid: x.player_id ? String(x.player_id) : null, name: x.player_id ? null : String(x.player || "").toLowerCase() }))));
  lap("place_by");
  // display names for legs keyed by a normalised name only (the Underdog backtest stores e.g. "craigporter")
  const nameKeys = [...new Set([...eng.pp, ...eng.ud, ...eng.sl].flatMap(s => ljOf(s).filter(x => !x.player_id && x.player).map(x => norm(x.player))))];
  const fullName = new Map(nameKeys.length ? (await q(sql, `SELECT DISTINCT ON (m.norm_name) m.norm_name, p.full_name FROM nba_ref.player_name_map m
      JOIN nba_ref.players p ON p.nba_player_id::text = m.player_id::text WHERE m.norm_name = ANY($1::text[]) ORDER BY m.norm_name, p.active DESC NULLS LAST`,
      [pgArr(nameKeys)])).map(r => [r.norm_name, r.full_name]) : []);
  // WHOLE-NUMBER LEGS (2026-10-20: KAT PRA 35 on a 5-pick Power showed no probability): the board keeps only half-point lines
  // (board_scored); whole-number lines are priced in nba_score.final_hp_derived (derivation whole_number / wn_neighbor / ..._nb).
  // A slip leg with no board row takes its probability and score from there, so the slip still shows a number and an average.
  const wnPids = [...new Set([...eng.pp, ...eng.ud, ...eng.sl].flatMap(s => ljOf(s).filter(x => x.player_id).map(x => String(x.player_id))))];
  const wnMap = new Map(wnPids.length ? (await q(sql, `SELECT player_id, prop, line::float line, side, final_hp::float hp, score::float score, derivation
      FROM nba_score.final_hp_derived WHERE game_date = $1::date AND player_id = ANY($2::text[])`, [slate.date, pgArr(wnPids)]))
    .map(r => [[r.player_id, r.prop, Number(r.line), sideIn(r.side)].join("|"), r]) : []);
  lap("whole_number_hp");
  let linkMap = new Map();
  try { linkMap = await appLinkMap(sql); } catch (_e) { linkMap = new Map(); }   // links are an add-on: a failed lookup never breaks the screen
  lap("app_links");
  for (const s of [...eng.pp, ...eng.ud, ...eng.sl]) {
    const lj = typeof s.legs_json === "string" ? JSON.parse(s.legs_json) : s.legs_json || [];
    const legs = [];
    for (const x of lj) {
      const side = sideOut(x.side), line = Number(x.line);
      // a Betr leg is the Underdog leg at the same line (the engine requires it; Betr stays off the scored board) - it reads that row
      // a Fliff leg is an Underdog T1 leg (fliff_live_slip_engine): it reads that row when Fliff's line is Underdog's (ud_line) -
      // C13 2026-10-26: the Fliff slip's legs looked for a 'fliff' board row that does not exist and showed no probability
      // 2026-11-01 Betr-board rules (B_BRD_*): the leg is Betr's own line, which need not be Underdog's - it reads the Underdog row only
      // when one exists at that line, else it shows the engine's own final_hp at Betr's line (legs_json p)
      const viaUd = (s.app === "betr" && (!String(s.strategy || "").startsWith("B_BRD") || byKey.has(["underdog", String(x.player_id), x.prop, line, side].join("|"))))
        || (s.app === "fliff" && x.ud_line != null && Number(x.ud_line) === line);
      const app = viaUd ? "underdog" : s.app;
      const hit = (x.player_id && byKey.get([app, String(x.player_id), x.prop, line, side].join("|"))) || byKey.get([app, "n:" + norm(x.player), x.prop, line, side].join("|"));
      const cr = s.app === "prizepicks" && x.cell ? bt.cellRate.get(`${x.cell}|${x.tier}|${sideIn(x.side)}`) : null;
      const cellFields = cr ? { cell_backtest_hit_0_100: r1(100 * cr.p), cell_backtest_legs: cr.n } : {};
      // a graded slip's leg with no result is a push / void (the grader drops it and pays the smaller slip)
      const push = s.hits != null && x.hit == null;
      // FLIFF GAME (owner 2026-10-28 13:59 PT: "For fliff I don't have how to search players, so for fliff only, add which game
      // (teams) each legs are"): the Fliff board's own matchup (fliff_pickem_board.matchup, e.g. "OKC@DAL") on every Fliff leg
      const gameFields = s.app === "fliff" && x.matchup ? { game_label: String(x.matchup).replace("@", " @ ") } : {};
      if (hit) legs.push(slipLeg(hit, { ...gameFields, tier: x.tier, leg_factor: Number(x.factor) || hit.leg_factor, cell: x.cell, result_hit: x.hit == null ? null : Number(x.hit), result_push: push, board_percentile: percentile(app, Number(hit.score_0_100)), ...cellFields, ...riskFor(risk, hit.player_name),
        ...(viaUd ? { source_key: s.app, line_type: "regular", app_multiplier: null, edge_0_100: null, breakeven_0_100: null } : {}) }));
      else {
        const wn = x.player_id ? wnMap.get([String(x.player_id), x.prop, line, sideIn(x.side)].join("|")) : null;
        const ownP = s.app === "betr" && x.p != null ? r1(100 * Number(x.p)) : null;   // a Betr-board leg's final_hp at Betr's line
        if (!wn && ownP == null) unmatched++;
        const wnHp = wn && wn.hp != null ? r1(100 * wn.hp) : ownP;
        legs.push({ board_row_id: `${slate.date}~${s.app}~${x.player_id || x.player}~${x.prop}~${line}~${sideIn(x.side)}`, player_name: fullName.get(norm(x.player)) || x.player, canonical_prop_key: x.prop, prop_label: propLabel(x.prop),
          line_value: line, selected_side: side, source_key: s.app, tier: x.tier, leg_factor: Number(x.factor) || null, hit_probability_0_100: wnHp, estimated_hit_probability_0_100: wnHp,
          score_0_100: wn && wn.score != null ? r1(wn.score) : undefined, hp_source: wn ? "final_hp_derived:" + wn.derivation : undefined, cell: x.cell,
          result_hit: x.hit == null ? null : Number(x.hit), result_push: push, game_pk: x.event_id || null, mlb_player_id: x.player_id || x.player, ...cellFields, ...gameFields });
      }
    }
    const mode = (s.structure === "flex" || s.structure === "dynamic") ? "flex" : "power";   // 2026-11-02: Betr Dynamic is the flex-type entry (was shown as Perfect)
    const tiers = nbaTiers(pricing, s.app, mode, legs) || {};
    slips.push({
      source_key: s.app, entry_mode: mode, slip_size: legs.length, slip_type: `${legs.length}-pick`,
      structure_label: `${legs.length}-pick ${nbaModeLabel(s.app, mode)}`, track_label: s.track, strategy: s.strategy || s.track, k: s.k,
      status: s.status, stake_weight: s.stake_weight == null ? (s.stake == null ? null : Number(s.stake)) : Number(s.stake_weight),
      estimated_multiplier: tiers[legs.length] || null, estimated_multiplier_flex_tiers: mode === "flex" ? tiers : null,
      estimated_hit_probability_0_100: legs.every(l => l.hit_probability_0_100 != null) ? r1(legs.reduce((a, l) => a + Number(l.hit_probability_0_100), 0) / legs.length) : null,
      result: s.hits == null ? null : { hits: Number(s.hits), payout: num(s.payout), pushes: lj.filter(x => x.hit == null).length },
      // PAPER vs STAKED (2026-10-15 full pass): 'placed' only means the engine built it for a non-shadow strategy; whether money
      // goes on it is the strategy's state (paper = recorded, never staked, §29c; active = staked)
      strategy_state: s.app === "prizepicks" ? (bt.stateOf.get(s.strategy) || null) : null,
      ...placeBy(lj, pb),
      app_link: LINK_APPS.includes(s.app) ? { app: s.app } : null,
      stake_label: stakeAdvice(s, bt).label,
      streak_note: s.streak_note || null,
      unit_usd: s.unit_usd != null && s.unit_usd !== "" ? Number(s.unit_usd) : null,
      play_usd: stakeAdvice(s, bt).play_usd,
      backtest_hit_probability_0_100: legs.length && legs.every(l => l.cell_backtest_hit_0_100 != null) ? r1(legs.reduce((a, l) => a + Number(l.cell_backtest_hit_0_100), 0) / legs.length) : null,
      strategy_cert_leg_hit_0_100: s.app === "prizepicks" && bt.certHit.get(s.strategy) != null ? r1(100 * bt.certHit.get(s.strategy)) : null,
      strategy_backtest: s.app === "prizepicks" ? (bt.record.get(s.strategy) || null) : null,
      legs: legs.map((lg, i) => ({ ...lg, link: linkLegFor(s.app, lj[i], linkMap, (pb.tip.get(legKey(lj[i])) || {}).at) }))
    });
  }
  // PRIZEPICKS' OWN QUOTE (2026-10-18, owner: "be sure we are using the proper multipliers"): P3 has PrizePicks quote every engine
  // slip at the window (pp_payout_map.py SLIPQ -> nba_score.live_slip_quotes). When a slip has one, its multiplier and Flex tiers
  // ARE PrizePicks' (the model's number is kept as model_multiplier and named when it differs); a slip whose leg left the board
  // or moved says which leg to substitute. The grade pays the same quote.
  if (eng.source === "live") {
    try {
      const hasQ = (await q(sql, "SELECT to_regclass('nba_score.live_slip_quotes') IS NOT NULL ok"))[0];
      if (hasQ && hasQ.ok) {
        const qs = await q(sql, `SELECT DISTINCT ON (strategy, k) strategy, k, status, power, flex, power_adj, flex_adj, legs,
                                        to_char(quoted_at AT TIME ZONE 'America/Los_Angeles', 'FMHH12:MI AM') t
                                 FROM nba_score.live_slip_quotes WHERE game_date = $1::date ORDER BY strategy, k, quoted_at DESC`, [slate.date]);
        const byK = new Map(qs.map(r => [r.strategy + ":" + r.k, r]));
        for (const x of slips) {
          if (x.source_key !== "prizepicks") continue;
          const r = byK.get(x.strategy + ":" + x.k);
          if (!r) {
            // 2026-10-22 (owner: nothing on the screen unless PrizePicks' own quote confirms it): a slip to PLAY that PrizePicks has not
            // quoted yet is held back until the quote and the quote gate (nba/apply_quote_gate.py) have run - recorded, not shown
            if (String(x.stake_label || "").startsWith("PLAY")) { x.stake_label = "SKIP - waiting for PrizePicks' quote"; x.play_usd = null; x.awaiting_quote = true; }
            continue;
          }
          const js = v => (typeof v === "string" ? JSON.parse(v) : v);
          if (Number(r.status) === 200) {
            const n = x.slip_size, tb = js(x.entry_mode === "flex" ? r.flex : r.power) || {}, tiers = tb[String(n)] || {};
            const full = Number(tiers[String(n)]);
            if (full > 0) {
              x.model_multiplier = x.estimated_multiplier;
              x.estimated_multiplier = full;
              if (x.entry_mode === "flex") x.estimated_multiplier_flex_tiers = Object.fromEntries(Object.entries(tiers).filter(([h]) => /^[0-9]+/.test(h)).map(([h, v]) => [h, Number(v)]));
              const mm = Number(x.model_multiplier);
              x.quote_note = `PrizePicks quote ${r.t} PT: ${full}x` + (mm > 0 && Math.abs(mm - full) > 0.005 ? ` (our model ${Math.round(mm * 100) / 100}x)` : "") +
                ((x.entry_mode === "flex" ? r.flex_adj : r.power_adj) && x.legs.every(l => !l.tier || l.tier === "R") ? " - adjusted by PrizePicks (same game)" : "");
            }
          } else {
            const lg = js(r.legs) || {};
            x.quote_failed = true;
            if (lg.unmapped) {
              x.leg_missing = lg.unmapped;
              // 2026-10-22 (owner 14:52 PT: "whatever shows there, I put ... don't let anything that's not allowed go on that screen"):
              // a slip with a leg PrizePicks no longer offers cannot be placed as built - never PLAY, kept off the screen (recorded)
              x.stake_label = "SKIP - a leg is no longer on PrizePicks' board";
              x.play_usd = null;
              x.quote_note = `⚠ At ${r.t} PT not on PrizePicks' board as built (moved or pulled) - substitute before placing: ${lg.unmapped.join(", ")}. The multiplier shown is our model's, not PrizePicks'.`;
            } else x.quote_note = `⚠ PrizePicks did not quote this slip at ${r.t} PT - the multiplier shown is our model's, not PrizePicks'.`;
          }
        }
        // LOUD, NOT A FOOTNOTE (2026-10-21: Keyonte George Turnovers 2.5 was a demon-only line at the 1:30 PM quote - all 17
        // PrizePicks slips carried it as a regular Less, the quote recorded it as unmapped, and the screen showed it only in each
        // card's small print). The day's note leads with it, naming every missing leg and how many slips carry it.
        const miss = new Map();
        for (const x of slips) for (const m of (x.leg_missing || [])) miss.set(m, (miss.get(m) || 0) + 1);
        const failed = slips.filter(x => x.quote_failed).length;
        if (miss.size) notes.unshift(`⚠ ${failed} PrizePicks slip(s) have a leg that was NOT on PrizePicks' board when PrizePicks quoted them: ` +
          [...miss].map(([m, n]) => `${m} (in ${n} slip${n > 1 ? "s" : ""})`).join("; ") + ". Those slips cannot be placed as built - they are not shown and not played (recorded).");
        else if (failed) notes.unshift(`⚠ ${failed} PrizePicks slip(s) were not quoted by PrizePicks - their multipliers are our model's.`);
      }
    } catch (e) { notes.push("PrizePicks slip quotes could not be read: " + String(e && e.message || e)); }
  }
  // TEST-ONLY SLIPS ARE NOT SHOWN (owner 2026-10-17: "anything that is test only, do not show on the slip screen, you can
  // record them but as not played"): shadow strategies / portfolios, strategies whose state is not staked, the Underdog engine
  // while it is paper, unstaked rows. They stay recorded in live_slips / ud_live_slips with their not-played status; the screen
  // shows only slips of strategies that are bet (PLAY, or a SKIP by a betting rule: week-1/2, ceiling, below-minimum, stand-down,
  // ALARM) and says how many test slips were recorded.
  const TEST_ONLY = /^(SKIP - shadow|paper|SKIP - strategy |SKIP - not staked|SKIP - a leg is no longer on|SKIP - backup|SKIP - PrizePicks' quote|SKIP - waiting for PrizePicks' quote)/;
  const awaiting = slips.filter(x => x.awaiting_quote).length;
  if (awaiting) notes.unshift(`${awaiting} PrizePicks slip(s) are waiting for PrizePicks' own quote (asked right after the pick, a few minutes) - they appear here once PrizePicks confirms every leg and the payout.`);
  const testOnly = slips.filter(x => TEST_ONLY.test(String(x.stake_label || "")));
  if (testOnly.length) {
    const kept = slips.filter(x => !TEST_ONLY.test(String(x.stake_label || "")));
    slips.length = 0; slips.push(...kept);
    const by = new Map(); for (const x of testOnly) by.set(x.track_label || x.strategy, (by.get(x.track_label || x.strategy) || 0) + 1);
    notes.push(`${testOnly.length} test-only slip(s) recorded as not played and not shown (${[...by].map(([k, n]) => n + " " + k).join(", ")}).`);
  }
  // PLACING ORDER (2026-10-18, owner: "When ordering the slips on the slip screen put in placing order, so the right times ones
  // first"): the slips are listed by their Place by time (the first tip among their own legs), earliest first; at the same time
  // the slips to PLAY come before the skips, PrizePicks before Underdog, then the engine's own order. No Place by -> last.
  const ord = slips.map((x, i) => [x, i]);
  ord.sort(([a, i], [b, j]) => {
    const ta = a.place_by_utc ? Date.parse(a.place_by_utc) : Infinity, tb = b.place_by_utc ? Date.parse(b.place_by_utc) : Infinity;
    if (ta !== tb) return ta < tb ? -1 : 1;
    const pa = a.play_usd != null ? 0 : 1, pb2 = b.play_usd != null ? 0 : 1;
    if (pa !== pb2) return pa - pb2;
    const sa = a.source_key === "prizepicks" ? 0 : 1, sb = b.source_key === "prizepicks" ? 0 : 1;
    return sa - sb || i - j;
  });
  slips.length = 0; slips.push(...ord.map(([x]) => x));
  const plays = slips.filter(x => x.play_usd != null);
  if (eng.source === "live" && slips.length) {
    const byApp = ["prizepicks", "underdog", "sleeper", "fliff", "betr"].map(a => [a, plays.filter(x => x.source_key === a)]).filter(([, xs]) => xs.length)
      .map(([a, xs]) => xs.length + ({ prizepicks: " PrizePicks", underdog: " Underdog", sleeper: " Sleeper", fliff: " Fliff", betr: " Betr" })[a] + " slip(s) $" + xs.reduce((t, x) => t + x.play_usd, 0).toFixed(2));
    notes.push("To play today: " + (byApp.length ? byApp.join(" + ") : "0 slips") + " (total $" + plays.reduce((a, x) => a + x.play_usd, 0).toFixed(2) + ") " + (bt.unit.byApp ? "at each app's own unit (" + ["prizepicks", "underdog", "sleeper", "fliff", "betr"].filter(a => bt.unit.byApp[a]).map(a => ({ prizepicks: "PrizePicks", underdog: "Underdog", sleeper: "Sleeper", fliff: "Fliff", betr: "Betr" })[a] + " $" + unitOf(bt, a).toFixed(2)).join(", ") + ")" : "at $" + bt.unit.usd.toFixed(2) + " per unit") + " - place them soon after they appear: on 2025-26 slates 27% of picked legs had moved or left the board by the close capture (first tip - 25 min).");
  }
  if (eng.source === "live" && plays.length) {
    const by = new Map();
    for (const x of plays) by.set(x.place_by_pt || "unknown", (by.get(x.place_by_pt || "unknown") || 0) + 1);
    const order = [...by.keys()].sort((u, v) => String((plays.find(x => x.place_by_pt === u) || {}).place_by_utc).localeCompare(String((plays.find(x => x.place_by_pt === v) || {}).place_by_utc)));
    notes.push("Place by (each slip closes when the first game among its legs tips): " + order.map(k => by.get(k) + " by " + k).join(", ") + ".");
  }
  // STREAK FLAGS (2026-10-17): each rule's state on this slate - when it started, why, and when it stops - from the engine's record
  if (eng.source === "live") {
    try {
      const has = (await q(sql, "SELECT to_regclass('nba_score.live_streak_flags') IS NOT NULL ok"))[0];
      if (has && has.ok) {
        const fl = await q(sql, "SELECT strategy, flag_on, since::text since, reason, acted, stake_factor FROM nba_score.live_streak_flags WHERE game_date = $1::date ORDER BY strategy", [slate.date]);
        for (const f of fl) notes.push(`Streak flag ${f.strategy}: ${f.flag_on ? "ON since " + f.since + " - " : ""}${f.reason}` +
          (f.flag_on ? (f.acted ? ` - stake x${Number(f.stake_factor)} (kept at full when the half stake is below the minimum entry).` : " - streak rules are off: recorded only, stakes unchanged.") : "."));
      }
    } catch (e) { notes.push("Streak flags could not be read: " + String(e && e.message || e)); }
  }
  // EARN THE RAISE (2026-10-18): the unit, how it was earned and what moves it next
  const au = bt.unit.byApp ? null : bt.unit.auto;
  if (bt.unit.byApp) {
    const NM = { prizepicks: "PrizePicks", underdog: "Underdog", sleeper: "Sleeper", fliff: "Fliff", betr: "Betr" };
    const AB = { pp: "prizepicks", ud: "underdog", sleeper: "sleeper", fliff: "fliff", betr: "betr" };
    for (const c of (bt.unit.changes || []).slice().reverse())
      notes.unshift(`⚠ UNIT CHANGE ${NM[AB[c.app]] || c.app}: ${money(c.from)} -> ${money(c.to)} from this slate (${c.reason}).`);
    notes.push("Units by app (earn the raise per app, each app's own ladder sized to its slips a day; the same points going down): " +
      ["prizepicks", "underdog", "sleeper", "fliff", "betr"].filter(a => bt.unit.perApp[a]).map(a => {
        const v = bt.unit.perApp[a];
        return `${NM[a]} ${money(v.unit)} (profit ${money(v.profit)}` + (v.next_raise_at != null ? `, next ${money(Number(v.unit) + 1)} at ${money(v.next_raise_at)}` : "") +
          (v.step_down_below != null ? `, down to ${money(Number(v.unit) - 1)} below ${money(v.step_down_below)}` : "") + ")";
      }).join(" | ") + ".");
  }
  // UNIT CHANGE ALERT (owner 2026-10-28 13:00 PT: "show itself on the slip screen and give an alert message of unit amount change"):
  // the engine moved the unit after the last graded slate -> the first note, in red (a leading warning sign), until the next grade
  if (au && au.enabled && au.last_change && au.last_change.date === au.as_of)
    notes.unshift(`⚠ UNIT CHANGE: ${money(au.last_change.from)} -> ${money(au.last_change.to)} from this slate - enter every slip at ${money(au.last_change.to)} (${au.last_change.reason}).`);
  if (au && au.enabled) notes.push(`Unit ${money(bt.unit.usd)} - earn the raise (auto): ${au.apps === "all" ? "profit on every app" : "season profit"}` +
    `${au.season_start ? " since " + au.season_start : ""} ${money(au.season_profit)}` +
    (au.next_raise_at != null ? `, next raise to ${money(au.unit + au.step)} at ${money(au.next_raise_at)}` : ", at the maximum") +
    (au.step_down_below != null ? (au.ladder_from
      ? `; steps down to ${money(au.unit - 1)} if the profit falls below ${money(au.step_down_below)} (unit ladder: +$1 at 25, 75, 150, 250, 375 ..., the same points down).`
      : `; steps down to ${money(au.unit - au.step)} if the season profit falls to ${money(au.step_down_below)}.`) : "."));
  else if (au) notes.push(`Unit ${money(bt.unit.usd)} - set by hand (earn the raise is off; the Auto button turns it back on).`);
  if (unmatched) notes.push(`${unmatched} slip legs are not on the scored board (shown without a probability).`);
  if (fallbackNote) notes.push(fallbackNote);
  if (eng.source === "replay_backtest") notes.push(`No engine slips for ${slate.date} - showing the certified backtest's slips for that slate (${({ _mf: "market-free twin", _wo: "window-only twin - the market term as live sees it" })[eng.suffix] || (eng.suffix ? "twin " + eng.suffix : "certified tables")}), with results.`);
  // backup pool: the best board legs not already in a slip, per app, for substitution. ORDERED BY EDGE over the leg's own
  // break-even (2026-10-21: ordered by hit probability the pool was all goblins - a goblin replaced a regular leg and cut the
  // payout), +EV legs only, each line type kept in the pool (up to `size` per app per line type) so a removed regular leg has a
  // regular substitute; ties keep the board order (score, then player / prop / line / side), reproducible from the DB
  const inSlip = new Set(slips.flatMap(s => s.legs.map(l => l.board_row_id)));
  const pool = [];
  for (const app of ["prizepicks", "underdog", "sleeper"]) {
    const cand = board.filter(l => l.source_key === app && !l.ud_hidden && !inSlip.has(l.final_board_row_id) && Number(l.score_0_100) >= minScore
                                   && Number(l.edge_0_100) > 0 && GRADABLE_PROPS.has(String(l.canonical_prop_key)))
      .sort((a, b) => Number(b.edge_0_100) - Number(a.edge_0_100));
    const perType = new Map();
    for (const l of cand) {
      const t = String(l.line_type || "regular");
      // 2026-11-04: PrizePicks pool = lines PrizePicks itself marks STANDARD, nothing else. board_tiers_v2 also stores kind 'unknown' (an alternate rung
      // with no anchor) and lineType() read unknown as 'regular' - a goblin (Mikal Bridges 1.5 PF) was offered as a regular substitute (owner 14:01 PT).
      if (app === "prizepicks" && (String(l.pp_kind || "").toLowerCase() !== "standard" || t !== "regular" || Number(l.is_goblin) === 1 || Number(l.is_demon) === 1)) continue;
      if ((perType.get(t) || 0) >= size) continue;
      perType.set(t, (perType.get(t) || 0) + 1);
      pool.push(slipLeg(l, { board_percentile: percentile(app, Number(l.score_0_100)), ...riskFor(risk, l.player_name),
        link: linkLegFor(app, { player: l.player_name, prop: l.canonical_prop_key, side: l.selected_side, line: l.line_value }, linkMap, l.official_game_time_utc) }));
    }
  }
  // STRATEGY-FAITHFUL SLEEPER SUBS (owner 2026-11-10 "the subs don't follow the logic"): Sleeper's pool is the S_ALL rule's own ranked candidates (nba_score.slip_leg_bank,
  // written by slip_leg_bank.py: final_hp >= 0.50, final_hp x multiplier >= 1.12, ranked by blended chance x multiplier) matched to the scored board row; a bank
  // that is empty or missing leaves the generic pool above in place (never an empty bank).
  try {
    const bank = await q(sql, "SELECT rank, leg FROM nba_score.slip_leg_bank WHERE game_date = $1 AND app = 'sleeper' ORDER BY rank", [slate.date], 4000);
    if (bank && bank.length) {
      const nrm = x => String(x == null ? "" : x).toLowerCase().replace(/[^a-z0-9]/g, "");   // the bank stores the player as a bare key (collingillespie)
      const idx = new Map(board.filter(l => l.source_key === "sleeper" && !inSlip.has(l.final_board_row_id))
        .map(l => [nrm(l.player_name) + "|" + nrm(l.canonical_prop_key) + "|" + nrm(sideIn(l.selected_side)) + "|" + Number(l.line_value), l]));
      const fromBank = [];
      for (const b of bank) {
        const bl = typeof b.leg === "string" ? JSON.parse(b.leg) : b.leg;
        const l = idx.get(nrm(bl.player) + "|" + nrm(bl.prop) + "|" + nrm(sideIn(bl.side)) + "|" + Number(bl.line));
        if (!l) continue;
        fromBank.push(slipLeg(l, { board_percentile: percentile("sleeper", Number(l.score_0_100)), ...riskFor(risk, l.player_name),
          link: linkLegFor("sleeper", { player: l.player_name, prop: l.canonical_prop_key, side: l.selected_side, line: l.line_value }, linkMap, l.official_game_time_utc) }));
      }
      if (fromBank.length) { for (let i = pool.length - 1; i >= 0; i--) if (pool[i].source_key === "sleeper") pool.splice(i, 1); pool.push(...fromBank); }
    }
  } catch (_e) { /* no bank table / query failed: the generic pool stays */ }
  // STRATEGY-FAITHFUL UNDERDOG SUBS (owner 2026-11-10): the Underdog pool is the T1 candidate list (nba_score.slip_leg_bank, app 'underdog' - the list the T slips, Fliff and
  // Betr are built from) matched to the scored board row by player id / prop / side / line; no bank or no match leaves the generic pool.
  let udBankRows = [];   // board rows of the Underdog T1 bank (rule order) - also the source of the Fliff / Betr banks below
  try {
    const bankU = await q(sql, "SELECT rank, leg FROM nba_score.slip_leg_bank WHERE game_date = $1 AND app = 'underdog' ORDER BY rank", [slate.date], 4000);
    if (bankU && bankU.length) {
      const idxU = new Map(board.filter(l => l.source_key === "underdog" && !l.ud_hidden && !inSlip.has(l.final_board_row_id))
        .map(l => [String(l.player_id) + "|" + String(l.canonical_prop_key) + "|" + sideIn(l.selected_side) + "|" + Number(l.line_value), l]));
      const fromU = [];
      for (const b of bankU) {
        const bl = typeof b.leg === "string" ? JSON.parse(b.leg) : b.leg;
        const l = idxU.get(String(bl.pid) + "|" + String(bl.prop) + "|" + sideIn(bl.side) + "|" + Number(bl.line));
        if (!l || Number(l.estimated_hit_probability_0_100 || 0) < 55) continue;   // a substitute below 55% hit chance never carries the strategy's ROI
        udBankRows.push(l);
        fromU.push(slipLeg(l, { board_percentile: percentile("underdog", Number(l.score_0_100)), ...riskFor(risk, l.player_name),
          link: linkLegFor("underdog", { player: l.player_name, prop: l.canonical_prop_key, side: l.selected_side, line: l.line_value }, linkMap, l.official_game_time_utc) }));
      }
      if (fromU.length) { for (let i = pool.length - 1; i >= 0; i--) if (pool[i].source_key === "underdog") pool.splice(i, 1); pool.push(...fromU); }
    }
  } catch (_e) { /* no bank: the generic pool stays */ }
  // PRIZEPICKS SUBS (owner 2026-11-10): the PrizePicks strategies that stake on a thin board are Unders on STANDARD lines (the thin-night fallback: Unders at final_hp >= 0.55,
  // +63% / +65% on those nights, U3 +104% this season) - so a substitute is a standard Under with the best hit chance first; Overs and low-chance legs stay only as a last resort.
  try {
    const ppAll = pool.filter(l => l.source_key === "prizepicks");
    const hp = l => Number(l.estimated_hit_probability_0_100 != null ? l.estimated_hit_probability_0_100 : l.hit_probability_0_100 || 0);
    const good = ppAll.filter(l => sideIn(l.selected_side) === "Under" && hp(l) >= 55).sort((a, b) => hp(b) - hp(a));
    if (good.length >= 3) { for (let i = pool.length - 1; i >= 0; i--) if (pool[i].source_key === "prizepicks") pool.splice(i, 1); pool.push(...good); }
  } catch (_e) { /* generic PrizePicks pool stays */ }
  // BETR + FLIFF BACKUP BANKS (owner 2026-11-09: "both apps need a leg bank, Fliff and Betr ... create a fallback"). Both apps place the Underdog board's legs
  // (the engines build them from it), so the bank is the Underdog candidates that sit on the app's OWN board right now: Betr = same player / prop / side AT THE SAME
  // LINE on the newest Betr snapshot (a regular pick, factor 1); Fliff = same player / prop / side at the same line on the newest Fliff Pick'Em board, with Fliff's own
  // multiplier (cap 1.85, the engine's mcap) as the leg factor. Same legality as every pool (same app only, no duplicate player, game cap, 2 teams), ordered by edge.
  // FALLBACK: a bank that cannot be built (no fresh board) is empty and the screen says so - the slip then shrinks and its multiplier is recomputed from the legs left.
  try {
    const BETR_MK = { player_points: "points", player_rebounds: "rebounds", player_assists: "assists", player_threes: "threes_made", player_steals: "steals", player_blocks: "blocks",
      player_turnovers: "turnovers", player_blocks_steals: "stocks", player_points_rebounds: "pts_reb", player_points_assists: "pts_ast", player_rebounds_assists: "reb_ast", player_points_rebounds_assists: "pra" };
    const udCand = board.filter(l => l.source_key === "underdog" && !l.ud_hidden && Number(l.score_0_100) >= minScore && Number(l.edge_0_100) > 0
      && String(l.line_type || "regular") === "regular" && GRADABLE_PROPS.has(String(l.canonical_prop_key))).sort((a, b) => Number(b.edge_0_100) - Number(a.edge_0_100));
    const udByP = (udBankRows.length ? udBankRows : udCand).slice().sort((a, b) => Number(b.estimated_hit_probability_0_100 || 0) - Number(a.estimated_hit_probability_0_100 || 0));   // the Fliff / Betr engines order the Underdog candidates by hit chance
    const used = app => new Set(slips.filter(x => x.source_key === app).flatMap(x => x.legs.map(l => [l.mlb_player_id || l.player_id, l.canonical_prop_key, sideIn(l.selected_side), Number(l.line_value)].join("|"))));
    const keyOf = l => [l.player_id, l.canonical_prop_key, sideIn(l.selected_side), Number(l.line_value)].join("|");
    const mkLeg = (l, app, extra) => ({ ...slipLeg(l, { board_percentile: percentile("underdog", Number(l.score_0_100)), ...riskFor(risk, l.player_name), ...extra }),
      board_row_id: `${slate.date}~${app}~${l.player_id}~${l.canonical_prop_key}~${Number(l.line_value)}~${sideIn(l.selected_side)}`, final_board_row_id: `${slate.date}~${app}~${l.player_id}~${l.canonical_prop_key}~${Number(l.line_value)}~${sideIn(l.selected_side)}`,
      source_key: app, line_type: "regular", is_goblin: 0, is_demon: 0, app_multiplier: null, link: null });
    const bsnap = (await q(sql, `SELECT max(snapshot_ts) ts FROM nba_market.board_snapshots WHERE bookmaker='betr' AND game_date=$1::date`, [slate.date]))[0];
    if (bsnap && bsnap.ts && Date.now() - Date.parse(bsnap.ts) <= 3 * 3600 * 1000) {
      const rows = await q(sql, `SELECT nm.player_id::text pid, b.market_key mk, b.side, b.line::float line FROM nba_market.board_snapshots b
        JOIN nba_ref.player_name_map nm ON nm.norm_name = nba_ref.norm_name(b.player)
        WHERE b.bookmaker='betr' AND b.game_date=$1::date AND b.snapshot_ts=$2 AND b.market_key = ANY($3::text[])`, [slate.date, bsnap.ts, pgArr(Object.keys(BETR_MK))]);
      const on = new Set(rows.map(r => [r.pid, BETR_MK[r.mk], sideIn(r.side), Number(r.line)].join("|")));
      const u = used("betr"); let n = 0;
      for (const l of udByP) { if (n >= size) break; const k = keyOf(l); if (!on.has(k) || u.has(k)) continue; n++; pool.push(mkLeg(l, "betr", { leg_factor: 1, tier: "REGULAR" })); }
    } else notes.push("Betr backup bank: no Betr board captured in the last 3 hours - the bank is empty (a removed leg shrinks the slip).");
    const fsnap = (await q(sql, `SELECT max(snapshot_ts) ts FROM nba_market.fliff_pickem_board WHERE game_date=$1::date`, [slate.date]))[0];
    if (fsnap && fsnap.ts) {
      const rows = await q(sql, `SELECT nm.player_id::text pid, b.prop, b.line::float line, b.option_type ot, b.multiplier::float m, b.matchup FROM nba_market.fliff_pickem_board b
        JOIN nba_ref.player_name_map nm ON nm.norm_name = nba_ref.norm_name(b.player) WHERE b.game_date=$1::date AND b.snapshot_ts=$2`, [slate.date, fsnap.ts]);
      const on = new Map(rows.map(r => [[r.pid, r.prop, Number(r.ot) === 0 ? "Over" : "Under", Number(r.line)].join("|"), r]));
      const u = used("fliff"); let n = 0;
      for (const l of udByP) {
        if (n >= size) break; const k = keyOf(l), r = on.get(k);
        if (!r || u.has(k) || !(Number(r.m) > 1) || Number(r.m) > 1.85 || Number(l.estimated_hit_probability_0_100) < 56) continue;
        n++; pool.push(mkLeg(l, "fliff", { leg_factor: Number(r.m), tier: "R", game_label: r.matchup ? String(r.matchup).replace("@", " @ ") : undefined }));
      }
    } else notes.push("Fliff backup bank: no Fliff Pick'Em board captured for the slate - the bank is empty.");
  } catch (e) { notes.push("Betr / Fliff backup banks could not be built: " + String(e && e.message || e)); }
  if (!slips.length) notes.unshift(slate.mode === "live" ? "No engine slips yet for today - the afternoon run builds them at 1:16 PM PT, or 29 minutes before the first tip when that is earlier; they appear here a few minutes later." : `No slips recorded for ${slate.date}.`);
  // UNITS ONLY ON TOP (owner 2026-11-02 14:05 PT: "remove all the description ... keep that hidden ... just put the units per app ...
  // which app, what's the current unit, when it increases, what's the current accumulate"): with units per app on, the top of the
  // screen is the unit table; every other note stays in the payload as hidden_notes (not shown).
  let unitTable = null, hiddenNotes = null;
  if (bt.unit.byApp && bt.unit.perApp) {
    const NM = { prizepicks: "PrizePicks", underdog: "Underdog", sleeper: "Sleeper", fliff: "Fliff", betr: "Betr" };
    const AB = { pp: "prizepicks", ud: "underdog", sleeper: "sleeper", fliff: "fliff", betr: "betr" };
    const chg = new Map((bt.unit.changes || []).map(c => [AB[c.app] || c.app, c.from]));
    unitTable = ["prizepicks", "underdog", "sleeper", "fliff", "betr"].filter(a => bt.unit.perApp[a]).map(a => {
      const v = bt.unit.perApp[a];
      return { app: NM[a], unit: Number(v.unit), next_unit: v.next_raise_at != null ? Number(v.unit) + 1 : null,
               next_at: v.next_raise_at != null ? Number(v.next_raise_at) : null, accumulated: Number(v.profit),
               down_below: v.step_down_below != null ? Number(v.step_down_below) : null, changed_from: chg.has(a) ? chg.get(a) : null };
    });
    if (bt.unit.flat) unitTable = null;   // owner 2026-11-13: flat units by hand - no unit table on top, each slip shows its own bet amount
    hiddenNotes = notes.slice();
    notes.length = 0;
  }
  // FLIFF / BETR LAST-RESORT BANK (owner 2026-11-10, "all needs to be fixed"): when the Underdog-derived bank finds nothing on an app's own board, the app's own best-hit-chance
  // legs (nba_friend.pairs - the engine's pairing list, built from that app's board ranked by hit chance, the order the Fliff / Betr engines pick in) fill the bank,
  // never a player already on one of the app's slips; the live check still drops anything not on the board.
  try {
    for (const app of ["fliff", "betr"]) {
      if (pool.some(l => l.source_key === app)) continue;
      const inApp = new Set(slips.filter(x => x.source_key === app).flatMap(x => x.legs.map(l => normName(l.player_name))));
      const prow = await q(sql, "SELECT p::float p, mult::float m, leg FROM nba_friend.pairs WHERE game_date = $1::date AND app = $2 AND kind = 'main' ORDER BY rank LIMIT 12", [slate.date, app], 4000);
      let n = 0;
      for (const x of prow) {
        const l = typeof x.leg === "string" ? JSON.parse(x.leg) : x.leg;
        if (!l || !l.player_name || inApp.has(normName(l.player_name)) || Number(x.p) < 0.55) continue;
        const side = sideIn(l.selected_side) === "Over" ? "more" : "less";
        const id = `${slate.date}~${app}~${l.player_id}~${l.canonical_prop_key}~${Number(l.line_value)}~${sideIn(l.selected_side)}`;
        pool.push({ ...l, source_key: app, selected_side: side, line_type: "regular", is_goblin: 0, is_demon: 0, tier: l.tier || "R", leg_factor: app === "betr" ? 1 : (Number(x.m) > 1 ? Number(x.m) : 1),
          estimated_hit_probability_0_100: Math.round(Number(x.p) * 1000) / 10, hit_probability_0_100: Math.round(Number(x.p) * 1000) / 10, board_row_id: id, final_board_row_id: id });
        if (++n >= 8) break;
      }
    }
  } catch (_e) { /* no pairs: the bank stays as built */ }
  // SUB THE NEXT RANKED CANDIDATE OF THE SLIP'S OWN STRATEGY (owner 2026-11-12 00:03 PT: "all strategies should work with sub the next ranked candidate"): every engine writes the ranked
  // candidates of each unit at pick time (nba_score.slip_next_legs, strategy + k + rank). Each slip gets next_ranked = the board_row_ids of those candidates that are on the
  // board now, in rank order (a candidate missing from the pool is added, except PrizePicks where only confirmed standard pool legs count); the screen takes the first legal one
  // and only then falls back to the generic pool. Nothing here can fail the build: no table / no rows / no match leaves the slips as they were.
  try {
    const nx = await q(sql, "SELECT strategy, k, rank, leg FROM nba_score.slip_next_legs WHERE game_date = $1 ORDER BY strategy, k, rank", [slate.date], 4000);
    if (nx && nx.length) {
      const nrm2 = x => String(x == null ? "" : x).toLowerCase().replace(/[^a-z0-9]/g, "");
      const byPid = new Map(), byName = new Map();
      const addIdx = (l, from) => {
        const tail = "|" + nrm2(l.canonical_prop_key) + "|" + nrm2(sideIn(l.selected_side)) + "|" + Number(l.line_value);
        const a = l.source_key;
        if (l.player_id != null) byPid.set(a + "|" + String(l.player_id) + tail, from === "pool" ? l : (byPid.get(a + "|" + String(l.player_id) + tail) || l));
        byName.set(a + "|" + nrm2(l.player_name) + tail, from === "pool" ? l : (byName.get(a + "|" + nrm2(l.player_name) + tail) || l));
      };
      for (const l of board) if (!inSlip.has(l.final_board_row_id) && !(l.source_key === "underdog" && l.ud_hidden)) addIdx(l, "board");
      const poolById = new Map(pool.map(l => [String(l.board_row_id), l]));
      const poolIdx = new Map();
      for (const l of pool) poolIdx.set(l.source_key + "|" + nrm2(l.player_name) + "|" + nrm2(l.canonical_prop_key) + "|" + nrm2(sideIn(l.selected_side)) + "|" + Number(l.line_value), l);
      const grp = new Map();
      for (const r of nx) { const key = r.strategy + "|" + r.k; if (!grp.has(key)) grp.set(key, []); grp.get(key).push(typeof r.leg === "string" ? JSON.parse(r.leg) : r.leg); }
      let nSlips = 0;
      for (const s of slips) {
        const lst = grp.get(String(s.strategy) + "|" + s.k);
        if (!lst) continue;
        const app = s.source_key, ids = [], seen = new Set();
        for (const bl of lst) {
          const tail = "|" + nrm2(bl.prop) + "|" + nrm2(bl.side) + "|" + Number(bl.line);
          let pl = poolIdx.get(app + "|" + nrm2(bl.player) + tail);
          if (!pl && app !== "prizepicks") {
            const b = (bl.player_id != null ? byPid.get(app + "|" + String(bl.player_id) + tail) : null) || byName.get(app + "|" + nrm2(bl.player) + tail);
            if (b) {
              pl = poolById.get(String(b.final_board_row_id));
              if (!pl) {
                pl = slipLeg(b, { board_percentile: percentile(app, Number(b.score_0_100)), ...riskFor(risk, b.player_name),
                  link: linkLegFor(app, { player: b.player_name, prop: b.canonical_prop_key, side: b.selected_side, line: b.line_value }, linkMap, b.official_game_time_utc) });
                pool.push(pl); poolById.set(String(pl.board_row_id), pl);
              }
            }
          }
          if (!pl || seen.has(String(pl.board_row_id))) continue;
          seen.add(String(pl.board_row_id)); ids.push(String(pl.board_row_id));
          if (ids.length >= 25) break;
        }
        if (ids.length) { s.next_ranked = ids; nSlips++; }
      }
      if (nSlips) notes.push(`Substitutes: ${nSlips} slips carry their own strategy's ranked candidate list.`);
    }
  } catch (_e) { /* no slip_next_legs: the pools above stay */ }
  // START TIMES FOR EVERY LEG (owner 2026-11-10: a leg whose game started is scratched and a sub pops up): stored slip legs (Fliff, Underdog...) carry only their game label, so the
  // tip-off comes from any other leg of the same game that has one; the screen's started-leg swap reads official_game_time_utc.
  try {
    const gk = l => { const t = String(l.matchup || l.game_label || "").toUpperCase().match(/([A-Z]{2,3})\s*@\s*([A-Z]{2,3})/); return t ? t[1] + "@" + t[2] : null; };
    const all = [...slips.flatMap(x => x.legs || []), ...pool], tm = new Map();
    for (const l of all) { const k = gk(l); if (k && l.official_game_time_utc && !tm.has(k)) tm.set(k, l.official_game_time_utc); }
    for (const l of all) { const k = gk(l); if (k && !l.official_game_time_utc && tm.has(k)) l.official_game_time_utc = tm.get(k); }
    for (const l of all) if (!l.game_label && l.matchup) l.game_label = String(l.matchup).replace(/\s*@\s*/, "  @  ");   // every leg shows its game (Fliff / Betr bank legs came without one)
    // EVERY APP shows the game on every leg (owner 2026-11-10: "without the game I cannot find the leg"): the away @ home label when any leg of that game carries one, else TEAM vs OPP
    const pk = l => (l.team_abbr && l.opponent_abbr) ? [l.team_abbr, l.opponent_abbr].sort().join("-") : null, lab = new Map();
    for (const l of all) { const k = pk(l); if (k && l.game_label && /@/.test(l.game_label) && !lab.has(k)) lab.set(k, l.game_label); }
    for (const l of all) if (!l.game_label) { const k = pk(l); if (k) l.game_label = lab.get(k) || (l.team_abbr + " vs " + l.opponent_abbr); }
  } catch (_e) { /* no times: the live check still drops a leg off the board */ }
  return { ok: true, data_ok: true, version, route: "/api/slips/high-hit", slate, source: eng.source, generated_slips: slips, test_only_recorded: testOnly.length, backup_pool: pool,
    unit_table: unitTable, hidden_notes: hiddenNotes,
    pricing, max_per_game: cfg.ui.backup_pool.max_per_game, notes, board_legs: board.length, stake_unit: bt.unit, timing_ms: (lap("build"), T) };
}

function money(v) { return String.fromCharCode(36) + Number(v || 0).toFixed(2); }

// EARN THE RAISE STATUS (2026-10-18; owner: "earn the raise, auto calculated and auto preset on the my unit"): the engine moves the
// unit after every graded slate (live_slip_engine.auto_unit) and records it in nba_score.live_unit_history. null when the config
// has no auto block.
async function unitAutoStatus(sql, su) {
  const a = su && su.auto;
  if (!a) return null;
  const st = { enabled: a.enabled === true, start: Number(a.start || 1), step: Number(a.step || 1), max: Number(a.max || 15),
               up_x: Number(a.up_x || 25), down_x: Number(a.down_x || 15), unit: Number(su.unit_usd || a.start || 1),
               floor: Number(a.floor != null ? a.floor : (a.start || 1)), apps: a.apps || "pp", count_from: a.count_from || null,
               season_profit: 0, season_high: 0, last_change: null };
  try {
    const has = (await q(sql, "SELECT to_regclass('nba_score.live_unit_history') IS NOT NULL ok"))[0];
    if (has && has.ok) {
      const h = (await q(sql, `SELECT game_date::text d, season_start::text s0, season_profit p, season_high hi, unit_usd u FROM nba_score.live_unit_history
                               ORDER BY game_date DESC LIMIT 1`))[0];
      // 2026-10-28: only the current count (auto.count_from) - rows of an earlier count are history
      if (h && (!st.count_from || h.s0 >= String(st.count_from).slice(0, 10))) { st.season_profit = Number(h.p); st.season_high = Number(h.hi); st.as_of = h.d; st.season_start = h.s0; }
      else if (st.count_from) st.season_start = String(st.count_from).slice(0, 10);
      const c = (await q(sql, `SELECT game_date::text d, unit_from f, unit_usd u, reason FROM nba_score.live_unit_history
                               WHERE unit_usd <> unit_from AND season_start::text = $1 ORDER BY game_date DESC LIMIT 1`, [st.season_start || ""]))[0];
      if (c) st.last_change = { date: c.d, from: Number(c.f), to: Number(c.u), reason: c.reason };
    }
  } catch (_e) { /* the history table appears with the engine's next run */ }
  // raise_basis 'current' (owner 2026-10-28 13:28 PT): the raise from the unit u comes at up_x x u ($2 -> $3 at $50)
  st.raise_basis = a.raise_basis || "next";
  st.next_raise_at = st.unit + st.step <= st.max + 1e-9 ? Math.round(st.up_x * (st.raise_basis === "current" ? st.unit : st.unit + st.step) * 100) / 100 : null;
  st.step_down_below = st.unit - st.step >= st.floor - 1e-9 ? Math.round((st.season_high - st.down_x * st.unit) * 100) / 100 : null;
  // THE LADDER (owner 2026-11-01 11:41 / 11:43 PT; live_slip_engine.auto_unit, auto.ladder_from): rung n starts at up_x x n(n-1)/2
  // ($2 from 25, $3 from 75, $4 from 150, $5 from 250 ...) and the same thresholds count downwards - the next raise is the next
  // rung's start, the step-down point is the current rung's own start.
  st.ladder_from = a.ladder_from || null;
  if (st.ladder_from) {
    st.raise_basis = "ladder";
    st.next_raise_at = st.unit + 1 <= st.max + 1e-9 ? st.up_x * st.unit * (st.unit + 1) / 2 : null;
    st.step_down_below = st.unit - 1 >= st.floor - 1e-9 ? st.up_x * (st.unit - 1) * st.unit / 2 : null;
  }
  return st;
}

// THE OWNER SETS HIS OWN UNIT (2026-10-15, owner: "I'm going to start growing gradually. So $1.50, $2, $2.50, $3, $4, $5 ... I don't
// need to be bugging you"). One number, written to classification_config['stake_unit'].unit_usd; the next pick (live engine) and
// this screen read it. Bounded: never below the apps' minimum entry, never above 1000.
export async function apiStakeUnit(sql, body, version) {
  // 2026-10-18: read with now() (a volatile function - Hyperdrive never serves it from its query cache) and write with RETURNING;
  // a second identical SELECT after an UPDATE came back from the cache with the OLD config (UI test C51, run 39123112709)
  const rows = await q(sql, "SELECT config_json, now() AS read_at FROM nba_config.classification_config WHERE config_key = 'stake_unit'");
  const cur = rows[0] ? (typeof rows[0].config_json === "string" ? JSON.parse(rows[0].config_json) : rows[0].config_json) : {};
  if (body == null) return { ok: true, version, route: "/api/stake-unit", stake_unit: { ...cur, auto_status: await unitAutoStatus(sql, cur) } };
  // 2026-10-18: {auto: true | false} turns earn-the-raise on / off; a hand-set unit turns it off (the owner's number wins until Auto)
  if (body.auto === true || body.auto === false) {
    if (!cur.auto) return { status: 400, body: { ok: false, version, error: "no auto block in stake_unit", stake_unit: cur } };
    const af = (await q(sql, "UPDATE nba_config.classification_config SET config_json = jsonb_set(config_json::jsonb, '{auto,enabled}', to_jsonb($1::boolean)) WHERE config_key = 'stake_unit' RETURNING config_json", [body.auto]))[0];
    const nf = typeof af.config_json === "string" ? JSON.parse(af.config_json) : af.config_json;
    return { ok: true, version, route: "/api/stake-unit", stake_unit: { ...nf, auto_status: await unitAutoStatus(sql, nf) } };
  }
  const v = Math.round(Number(body.unit_usd) * 100) / 100;
  const min = Number(cur.min_stake_usd || 1);
  if (!Number.isFinite(v) || v < min || v > 1000) return { status: 400, body: { ok: false, version, error: `unit_usd must be between ${min} and 1000`, stake_unit: cur } };
  const after = (await q(sql, `UPDATE nba_config.classification_config SET config_json = CASE
                                 WHEN (config_json::jsonb #>> '{auto,enabled}') = 'true'
                                 THEN jsonb_set(jsonb_set(config_json::jsonb, '{unit_usd}', to_jsonb($1::numeric)), '{auto,enabled}', 'false'::jsonb)
                                 ELSE jsonb_set(config_json::jsonb, '{unit_usd}', to_jsonb($1::numeric)) END
                               WHERE config_key = 'stake_unit' RETURNING config_json`, [v]))[0];
  const nc = typeof after.config_json === "string" ? JSON.parse(after.config_json) : after.config_json;
  return { ok: true, version, route: "/api/stake-unit", previous_unit_usd: cur.unit_usd, stake_unit: { ...nc, auto_status: await unitAutoStatus(sql, nc) } };
}

// ------------------------------------------------------------------ save / recent
export async function apiSave(sql, cfg, body, version) {
  const slips = Array.isArray(body.slips) ? body.slips.slice(0, 50) : [];
  const saved = [], skipped = [];
  for (const s of slips) {
    const legs = Array.isArray(s.legs) ? s.legs : [];
    if (legs.length < 2) { skipped.push({ reason: "fewer_than_2_legs" }); continue; }
    const fp = legs.map(l => [l.player_id || l.mlb_player_id || l.player_name, l.canonical_prop_key, Number(l.line_value), l.selected_side].join("|")).sort().join(",");
    const slate = String((legs[0].board_row_id || legs[0].final_board_row_id || "").split("~")[0] || "").slice(0, 10) || null;
    const ins = await q(sql, `INSERT INTO nba_score.ui_saved_slips (slate_date, source_key, entry_mode, slip_size, structure_label, track_label, strategy,
        estimated_multiplier, real_multiplier, real_multiplier_flex_tiers, estimated_hit_probability_0_100, legs_json, fingerprint, saved_by)
      VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8, $9, $10::text::jsonb, $11, $12::text::jsonb, $13, $14)
      ON CONFLICT (saved_on, source_key, entry_mode, fingerprint) DO UPDATE SET
        -- RE-SAVE REPLACES (owner 2026-10-21 15:03 PT: saved the Underdog slips again with the app's multipliers; the second save was
        -- silently dropped as a duplicate). Same legs saved again the same day = the newer numbers win; a slip already graded is left alone.
        estimated_multiplier = COALESCE(EXCLUDED.estimated_multiplier, nba_score.ui_saved_slips.estimated_multiplier),
        real_multiplier = COALESCE(EXCLUDED.real_multiplier, nba_score.ui_saved_slips.real_multiplier),
        real_multiplier_flex_tiers = COALESCE(EXCLUDED.real_multiplier_flex_tiers, nba_score.ui_saved_slips.real_multiplier_flex_tiers),
        estimated_hit_probability_0_100 = COALESCE(EXCLUDED.estimated_hit_probability_0_100, nba_score.ui_saved_slips.estimated_hit_probability_0_100),
        legs_json = EXCLUDED.legs_json, strategy = COALESCE(EXCLUDED.strategy, nba_score.ui_saved_slips.strategy),
        structure_label = COALESCE(EXCLUDED.structure_label, nba_score.ui_saved_slips.structure_label),
        track_label = COALESCE(EXCLUDED.track_label, nba_score.ui_saved_slips.track_label), saved_at = now()
      WHERE nba_score.ui_saved_slips.status = 'saved_pending'
      RETURNING slip_id, (xmax <> 0) AS replaced`,
      [slate && /^\d{4}-\d{2}-\d{2}$/.test(slate) ? slate : null, s.source_key || null, s.entry_mode || null, legs.length, s.structure_label || null, s.track_label || null,
       s.strategy || null, s.estimated_multiplier == null ? null : Number(s.estimated_multiplier), s.real_multiplier == null ? null : Number(s.real_multiplier),
       s.real_multiplier_flex_tiers ? JSON.stringify(s.real_multiplier_flex_tiers) : null,
       s.estimated_hit_probability_0_100 == null ? null : Number(s.estimated_hit_probability_0_100), JSON.stringify(legs), fp, body.saved_by || "nba_main_ui"]);
    if (ins.length) saved.push({ slip_id: Number(ins[0].slip_id), leg_count: legs.length, replaced_earlier_save: ins[0].replaced === true });
    else skipped.push({ source_key: s.source_key, slip_size: legs.length, reason: "identical_slip_already_graded" });
  }
  return { ok: true, data_ok: true, version, route: "/api/slips/save", saved_count: saved.length, saved_slips: saved, skipped_duplicates: skipped.filter(x => x.reason === "identical_slip_already_saved_today"), skipped };
}

export async function apiRecent(sql, url, version) {
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") || 50)));
  const rows = await q(sql, "SELECT * FROM nba_score.ui_saved_slips ORDER BY saved_at DESC LIMIT $1", [limit]);
  return { ok: true, data_ok: true, version, route: "/api/slips/recent", slips: rows.map(r => ({ ...r, slip_id: Number(r.slip_id), legs: typeof r.legs_json === "string" ? JSON.parse(r.legs_json) : r.legs_json })) };
}

export { appLabel, legId };
