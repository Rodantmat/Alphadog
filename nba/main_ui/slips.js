// NBA MAIN UI - slips: the builder (/api/slips/generate), the Slips screen (/api/slips/high-hit = today's engine slips, or the
// certified backtest's slips for a replayed slate), saving (/api/slips/save) and the saved list (/api/slips/recent).
import { q, pgArr, num, r1, parseLegId, legId, sideIn, sideOut, propLabel, appLabel, resolveSlate, normName } from "./common.js";
import { loadLegs } from "./board.js";
import { nbaEv, nbaBreakeven, nbaModes, nbaTiers, nbaModeLabel } from "./pricing.js";

export function pricingFrom(cfg) {
  return { pp: cfg.pp, ud: cfg.ui.ud_payout, sleeper: cfg.sleeper || {} };
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
export function slipLeg(l, extra = {}) {
  return {
    board_row_id: l.final_board_row_id, final_board_row_id: l.final_board_row_id, player_name: l.player_name, player_id: l.player_id, mlb_player_id: l.player_id,
    team_id: l.team_id, team_abbr: l.team_abbr, opponent_abbr: l.opponent_abbr, game_pk: l.game_pk, official_game_time_utc: l.official_game_time_utc,
    source_key: l.source_key, canonical_prop_key: l.canonical_prop_key, prop_label: l.prop_label, line_value: l.line_value, selected_side: l.selected_side,
    line_type: l.line_type, is_goblin: l.is_goblin, is_demon: l.is_demon, leg_factor: l.leg_factor, app_multiplier: l.app_multiplier,
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
  return { source: "live", pp: pp.map(r => ({ ...r, app: "prizepicks", track: r.strategy })), ud: ud.map(r => ({ ...r, app: "underdog", track: `UD ${r.portfolio} ${r.composition} ${r.size}${r.structure === "flex" ? "F" : "S"}` })) };
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
  const rows = await q(sql, `WITH k AS (SELECT x AS key, x AS pid FROM unnest($2::text[]) x
        UNION ALL SELECT n, m.player_id FROM unnest($3::text[]) n JOIN nba_ref.player_name_map m ON m.norm_name = nba_ref.norm_name(n)),
      t AS (SELECT k.key, COALESCE((SELECT g.team_id FROM nba_stats.player_game_log g WHERE g.nba_player_id::text = k.pid AND g.game_date = $1::date LIMIT 1),
                                   (SELECT g.team_id FROM nba_stats.player_game_log_postseason g WHERE g.nba_player_id::text = k.pid AND g.game_date = $1::date LIMIT 1),
                                   (SELECT p.team_id FROM nba_ref.players p WHERE p.nba_player_id::text = k.pid LIMIT 1)) team FROM k)
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
                 udPlay: su.ud_play === true, auto: await unitAutoStatus(sql, su) };
  // UNDERDOG STOP (2026-10-16, owner: "full force since day one ... if things are not going well, then we start changing"): the
  // Underdog P5 portfolio is played when stake_unit.ud_play is true; its edge monitor's ALARM (sticky per season, §31o) stops it.
  let udAlarm = false;
  try {
    udAlarm = !!((await q(sql, `SELECT bool_or(decision = 'ALARM') a FROM nba_score.ud_edge_monitor
                                WHERE season_start = (SELECT max(season_start) FROM nba_score.ud_edge_monitor)`))[0] || {}).a;
  } catch (_e) { udAlarm = false; }
  return { cellRate, certHit, record, suffix, stateOf, unit, udAlarm };
}

// PLAY OR SKIP, AND HOW MUCH (2026-10-15). Until today the label read only 'shadow' from the status, so a slip the engine recorded
// but did not stake (week-1 / week-2 rules, the daily ceiling, below the minimum entry) showed "staked" for an active strategy.
const SKIP_REASON = [["shadow", "shadow strategy"], ["week1_skip", "week-1 rule"], ["week2_skip", "week-2 rule"],
  ["capped", "daily ceiling reached"], ["below_min", "its half stake is below the minimum entry"]];
function udAdvice(s, bt) {
  const st = String(s.status || "");
  if (!bt.unit.udPlay) return { label: "paper (Underdog engine)", play_usd: null };
  if (st.startsWith("stand_down")) return { label: "SKIP - Underdog stand-down (" + st.slice(11) + ")", play_usd: null };
  if (st.startsWith("shadow") || s.portfolio === "P4") return { label: "SKIP - shadow portfolio", play_usd: null };
  if (bt.udAlarm) return { label: "SKIP - Underdog edge monitor ALARM (stopped)", play_usd: null };
  const w = Number(s.stake == null ? 1 : s.stake);
  if (!(w > 0)) return { label: "SKIP - not staked", play_usd: null };
  const usd = Math.round(bt.unit.usd * w * 100) / 100;
  if (usd < bt.unit.min) return { label: "SKIP - its stake is below the minimum entry", play_usd: null };
  return { label: "PLAY $" + usd.toFixed(2) + " (Underdog)", play_usd: usd };
}
function stakeAdvice(s, bt) {
  const st = String(s.status || "");
  if (st === "replay_backtest") return { label: "backtest replay", play_usd: null };
  if (s.app === "underdog") return udAdvice(s, bt);
  if (s.app !== "prizepicks") return { label: "paper", play_usd: null };
  const skip = SKIP_REASON.find(([k]) => st.includes(k));
  if (skip) return { label: `SKIP - ${skip[1]}`, play_usd: null };
  const state = bt.stateOf.get(s.strategy) || "paper";
  const plays = state === "active" || (bt.unit.playPaper && ["paper", "yellow", "critical", "week2"].includes(state));
  if (!plays) return { label: `SKIP - strategy ${state}`, play_usd: null };
  // 2026-10-18: a slip is priced at the unit in force when the engine picked it (live_slips.unit_usd; earn the raise moves it)
  const u = s.unit_usd != null && s.unit_usd !== "" ? Number(s.unit_usd) : bt.unit.usd;
  const usd = Math.round(u * (s.stake_weight == null ? 1 : Number(s.stake_weight)) * 100) / 100;
  if (usd < bt.unit.min) return { label: "SKIP - its stake is below the minimum entry", play_usd: null };
  return { label: "PLAY $" + usd.toFixed(2) + (state === "active" ? "" : " (" + state + ")"), play_usd: usd };
}

export async function apiHighHit(sql, cfg, url, version) {
  const T = {}; let tp = Date.now();
  const lap = k => { T[k] = Date.now() - tp; tp = Date.now(); };
  let slate = await resolveSlate(sql, cfg, url);
  const pricing = pricingFrom(cfg);
  const boardSlate = slate;
  let eng = await engineSlips(sql, cfg, boardSlate);
  if (!eng.pp.length && !eng.ud.length) eng = await replaySlips(sql, cfg, boardSlate);
  // Replay of a slate the certified backtest does not cover (it is regular season only - a playoff replay slate has none):
  // replay the latest slate it does cover instead, and say so. A live slate never falls back - it shows today's or nothing.
  let fallbackNote = null;
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
  const board = await loadLegs(sql, cfg, { date: slate.date, mode: slate.mode }, { where: "AND b.app IN ('prizepicks', 'underdog')", limit: BOARD_CAP, withInsight: false });
  lap("board");
  const pct = new Map();
  for (const app of ["prizepicks", "underdog"]) pct.set(app, board.filter(l => l.source_key === app).map(l => Number(l.score_0_100)).sort((a, b) => a - b));
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
  const pb = await placeByMap(sql, slate.date, [...eng.pp, ...eng.ud].flatMap(s => ljOf(s).map(x => ({
    pid: x.player_id ? String(x.player_id) : null, name: x.player_id ? null : String(x.player || "").toLowerCase() }))));
  lap("place_by");
  // display names for legs keyed by a normalised name only (the Underdog backtest stores e.g. "craigporter")
  const nameKeys = [...new Set([...eng.pp, ...eng.ud].flatMap(s => ljOf(s).filter(x => !x.player_id && x.player).map(x => norm(x.player))))];
  const fullName = new Map(nameKeys.length ? (await q(sql, `SELECT DISTINCT ON (m.norm_name) m.norm_name, p.full_name FROM nba_ref.player_name_map m
      JOIN nba_ref.players p ON p.nba_player_id::text = m.player_id::text WHERE m.norm_name = ANY($1::text[]) ORDER BY m.norm_name, p.active DESC NULLS LAST`,
      [pgArr(nameKeys)])).map(r => [r.norm_name, r.full_name]) : []);
  for (const s of [...eng.pp, ...eng.ud]) {
    const lj = typeof s.legs_json === "string" ? JSON.parse(s.legs_json) : s.legs_json || [];
    const legs = [];
    for (const x of lj) {
      const side = sideOut(x.side), line = Number(x.line);
      const hit = (x.player_id && byKey.get([s.app, String(x.player_id), x.prop, line, side].join("|"))) || byKey.get([s.app, "n:" + norm(x.player), x.prop, line, side].join("|"));
      const cr = s.app === "prizepicks" && x.cell ? bt.cellRate.get(`${x.cell}|${x.tier}|${sideIn(x.side)}`) : null;
      const cellFields = cr ? { cell_backtest_hit_0_100: r1(100 * cr.p), cell_backtest_legs: cr.n } : {};
      // a graded slip's leg with no result is a push / void (the grader drops it and pays the smaller slip)
      const push = s.hits != null && x.hit == null;
      if (hit) legs.push(slipLeg(hit, { tier: x.tier, leg_factor: Number(x.factor) || hit.leg_factor, cell: x.cell, result_hit: x.hit == null ? null : Number(x.hit), result_push: push, board_percentile: percentile(s.app, Number(hit.score_0_100)), ...cellFields, ...riskFor(risk, hit.player_name) }));
      else {
        unmatched++;
        legs.push({ board_row_id: `${slate.date}~${s.app}~${x.player_id || x.player}~${x.prop}~${line}~${sideIn(x.side)}`, player_name: fullName.get(norm(x.player)) || x.player, canonical_prop_key: x.prop, prop_label: propLabel(x.prop),
          line_value: line, selected_side: side, source_key: s.app, tier: x.tier, leg_factor: Number(x.factor) || null, hit_probability_0_100: null, cell: x.cell,
          result_hit: x.hit == null ? null : Number(x.hit), result_push: push, game_pk: x.event_id || null, mlb_player_id: x.player_id || x.player, ...cellFields });
      }
    }
    const mode = s.structure === "flex" ? "flex" : "power";
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
      stake_label: stakeAdvice(s, bt).label,
      streak_note: s.streak_note || null,
      unit_usd: s.unit_usd != null && s.unit_usd !== "" ? Number(s.unit_usd) : null,
      play_usd: stakeAdvice(s, bt).play_usd,
      backtest_hit_probability_0_100: legs.length && legs.every(l => l.cell_backtest_hit_0_100 != null) ? r1(legs.reduce((a, l) => a + Number(l.cell_backtest_hit_0_100), 0) / legs.length) : null,
      strategy_cert_leg_hit_0_100: s.app === "prizepicks" && bt.certHit.get(s.strategy) != null ? r1(100 * bt.certHit.get(s.strategy)) : null,
      strategy_backtest: s.app === "prizepicks" ? (bt.record.get(s.strategy) || null) : null,
      legs
    });
  }
  // TEST-ONLY SLIPS ARE NOT SHOWN (owner 2026-10-17: "anything that is test only, do not show on the slip screen, you can
  // record them but as not played"): shadow strategies / portfolios, strategies whose state is not staked, the Underdog engine
  // while it is paper, unstaked rows. They stay recorded in live_slips / ud_live_slips with their not-played status; the screen
  // shows only slips of strategies that are bet (PLAY, or a SKIP by a betting rule: week-1/2, ceiling, below-minimum, stand-down,
  // ALARM) and says how many test slips were recorded.
  const TEST_ONLY = /^(SKIP - shadow|paper|SKIP - strategy |SKIP - not staked)/;
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
  if (eng.source !== "replay_backtest" && slips.length) {
    const byApp = ["prizepicks", "underdog"].map(a => [a, plays.filter(x => x.source_key === a)]).filter(([, xs]) => xs.length)
      .map(([a, xs]) => xs.length + (a === "prizepicks" ? " PrizePicks" : " Underdog") + " slip(s) $" + xs.reduce((t, x) => t + x.play_usd, 0).toFixed(2));
    notes.push("To play today: " + (byApp.length ? byApp.join(" + ") : "0 slips") + " (total $" + plays.reduce((a, x) => a + x.play_usd, 0).toFixed(2) + ") at $" + bt.unit.usd.toFixed(2) + " per unit - place them soon after they appear: on 2025-26 slates 27% of picked legs had moved or left the board by the close capture (first tip - 25 min).");
  }
  if (eng.source !== "replay_backtest" && plays.length) {
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
  const au = bt.unit.auto;
  if (au && au.enabled) notes.push(`Unit ${money(bt.unit.usd)} - earn the raise (auto): season profit ${money(au.season_profit)}` +
    (au.next_raise_at != null ? `, next raise to ${money(au.unit + au.step)} at ${money(au.next_raise_at)}` : ", at the maximum") +
    (au.step_down_below != null ? `; steps down to ${money(au.unit - au.step)} if the season profit falls to ${money(au.step_down_below)}.` : "."));
  else if (au) notes.push(`Unit ${money(bt.unit.usd)} - set by hand (earn the raise is off; the Auto button turns it back on).`);
  if (unmatched) notes.push(`${unmatched} slip legs are not on the scored board (shown without a probability).`);
  if (fallbackNote) notes.push(fallbackNote);
  if (eng.source === "replay_backtest") notes.push(`No engine slips for ${slate.date} - showing the certified backtest's slips for that slate (${({ _mf: "market-free twin", _wo: "window-only twin - the market term as live sees it" })[eng.suffix] || (eng.suffix ? "twin " + eng.suffix : "certified tables")}), with results.`);
  // backup pool: the best board legs not already in a slip, per app, for substitution - ordered by the UNROUNDED hit
  // probability (ties keep the board order: score, then player / prop / line / side), so the pool is reproducible from the DB
  const inSlip = new Set(slips.flatMap(s => s.legs.map(l => l.board_row_id)));
  const pool = [];
  for (const app of ["prizepicks", "underdog"]) {
    pool.push(...board.filter(l => l.source_key === app && !inSlip.has(l.final_board_row_id) && Number(l.score_0_100) >= minScore)
      .sort((a, b) => Number(b.final_hp_raw) - Number(a.final_hp_raw)).slice(0, size)
      .map(l => slipLeg(l, { board_percentile: percentile(app, Number(l.score_0_100)), ...riskFor(risk, l.player_name) })));
  }
  if (!slips.length) notes.unshift(slate.mode === "live" ? "No engine slips yet for today - the afternoon run builds them at 1:16 PM PT, or 29 minutes before the first tip when that is earlier; they appear here a few minutes later." : `No slips recorded for ${slate.date}.`);
  return { ok: true, data_ok: true, version, route: "/api/slips/high-hit", slate, source: eng.source, generated_slips: slips, test_only_recorded: testOnly.length, backup_pool: pool,
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
               season_profit: 0, season_high: 0, last_change: null };
  try {
    const has = (await q(sql, "SELECT to_regclass('nba_score.live_unit_history') IS NOT NULL ok"))[0];
    if (has && has.ok) {
      const h = (await q(sql, `SELECT game_date::text d, season_start::text s0, season_profit p, season_high hi, unit_usd u FROM nba_score.live_unit_history
                               ORDER BY game_date DESC LIMIT 1`))[0];
      if (h) { st.season_profit = Number(h.p); st.season_high = Number(h.hi); st.as_of = h.d; st.season_start = h.s0; }
      const c = (await q(sql, `SELECT game_date::text d, unit_from f, unit_usd u, reason FROM nba_score.live_unit_history
                               WHERE unit_usd <> unit_from ORDER BY game_date DESC LIMIT 1`))[0];
      if (c) st.last_change = { date: c.d, from: Number(c.f), to: Number(c.u), reason: c.reason };
    }
  } catch (_e) { /* the history table appears with the engine's next run */ }
  st.next_raise_at = st.unit + st.step <= st.max + 1e-9 ? Math.round(st.up_x * (st.unit + st.step) * 100) / 100 : null;
  st.step_down_below = st.unit - st.step >= st.start - 1e-9 ? Math.round((st.season_high - st.down_x * st.unit) * 100) / 100 : null;
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
      ON CONFLICT (saved_on, source_key, entry_mode, fingerprint) DO NOTHING RETURNING slip_id`,
      [slate && /^\d{4}-\d{2}-\d{2}$/.test(slate) ? slate : null, s.source_key || null, s.entry_mode || null, legs.length, s.structure_label || null, s.track_label || null,
       s.strategy || null, s.estimated_multiplier == null ? null : Number(s.estimated_multiplier), s.real_multiplier == null ? null : Number(s.real_multiplier),
       s.real_multiplier_flex_tiers ? JSON.stringify(s.real_multiplier_flex_tiers) : null,
       s.estimated_hit_probability_0_100 == null ? null : Number(s.estimated_hit_probability_0_100), JSON.stringify(legs), fp, body.saved_by || "nba_main_ui"]);
    if (ins.length) saved.push({ slip_id: Number(ins[0].slip_id), leg_count: legs.length });
    else skipped.push({ source_key: s.source_key, slip_size: legs.length, reason: "identical_slip_already_saved_today" });
  }
  return { ok: true, data_ok: true, version, route: "/api/slips/save", saved_count: saved.length, saved_slips: saved, skipped_duplicates: skipped.filter(x => x.reason === "identical_slip_already_saved_today"), skipped };
}

export async function apiRecent(sql, url, version) {
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") || 50)));
  const rows = await q(sql, "SELECT * FROM nba_score.ui_saved_slips ORDER BY saved_at DESC LIMIT $1", [limit]);
  return { ok: true, data_ok: true, version, route: "/api/slips/recent", slips: rows.map(r => ({ ...r, slip_id: Number(r.slip_id), legs: typeof r.legs_json === "string" ? JSON.parse(r.legs_json) : r.legs_json })) };
}

export { appLabel, legId };
