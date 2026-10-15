// NBA MAIN UI - slips: the builder (/api/slips/generate), the Slips screen (/api/slips/high-hit = today's engine slips, or the
// certified backtest's slips for a replayed slate), saving (/api/slips/save) and the saved list (/api/slips/recent).
import { q, pgArr, num, r1, parseLegId, legId, sideIn, sideOut, propLabel, appLabel, resolveSlate } from "./common.js";
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
  const pp = await q(sql, `SELECT strategy, k, legs_json, size, structure, status, stake_weight, hits, payout FROM nba_score.live_slips WHERE game_date = $1::date
                           AND status NOT IN ('dup') ORDER BY strategy, k`, [slate.date]);
  const ud = await q(sql, `SELECT portfolio, composition, size, structure, k, legs_json, stake, status, hits, payout FROM nba_score.ud_live_slips WHERE game_date = $1::date ORDER BY portfolio, composition, size, k`, [slate.date]);
  return { source: "live", pp: pp.map(r => ({ ...r, app: "prizepicks", track: r.strategy })), ud: ud.map(r => ({ ...r, app: "underdog", track: `UD ${r.portfolio} ${r.composition} ${r.size}${r.structure === "flex" ? "F" : "S"}` })) };
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
                               WHERE game_date = $1::date AND composition = $2 AND size = $3 AND structure = $4 AND k <= $5 ORDER BY k`,
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
    const rows = await q(sql, `SELECT season, count(*)::int slips, sum(stake)::float stake, sum(payout)::float payout, sum(hits)::float hits, sum(size)::float legs
                               FROM ${table} WHERE composition = $1 AND size = $2 AND structure = $3 AND k <= $4 GROUP BY season ORDER BY season`,
      [spec.composition, spec.size, spec.structure, cap]);
    record.set(name, rows.map(r => ({ season: r.season, slips: r.slips, roi_pct: r.stake ? r1(100 * (r.payout / r.stake - 1)) : null,
      leg_hit_0_100: r.legs ? r1(100 * r.hits / r.legs) : null })));
  }
  return { cellRate, certHit, record, suffix };
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
    const last = (await q(sql, `SELECT max(game_date)::text d FROM nba_score.slip_engine_slips${sfx} WHERE game_date <= $1::date`, [slate.date]))[0];
    if (last && last.d && last.d !== slate.date) {
      slate = { ...slate, date: last.d, replay_of: boardSlate.date };
      eng = await replaySlips(sql, cfg, slate);
      fallbackNote = `The certified backtest covers regular seasons only (latest slate ${last.d}); ${boardSlate.date} is not in it, so this replays ${last.d}.`;
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
  const norm = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");
  for (const l of board) {
    byKey.set([l.source_key, l.player_id, l.canonical_prop_key, Number(l.line_value), l.selected_side].join("|"), l);
    byKey.set([l.source_key, "n:" + norm(l.player_name), l.canonical_prop_key, Number(l.line_value), l.selected_side].join("|"), l);
  }
  const risk = await dnpRisk(sql, slate.date, board.map(l => l.player_name));
  lap("injuries");
  const notes = [];
  if (board.length >= BOARD_CAP) notes.push(`The slate has more than ${BOARD_CAP} legs - only the top ${BOARD_CAP} by score were matched.`);
  let unmatched = 0;
  const slips = [];
  for (const s of [...eng.pp, ...eng.ud]) {
    const lj = typeof s.legs_json === "string" ? JSON.parse(s.legs_json) : s.legs_json || [];
    const legs = [];
    for (const x of lj) {
      const side = sideOut(x.side), line = Number(x.line);
      const hit = (x.player_id && byKey.get([s.app, String(x.player_id), x.prop, line, side].join("|"))) || byKey.get([s.app, "n:" + norm(x.player), x.prop, line, side].join("|"));
      if (hit) legs.push(slipLeg(hit, { tier: x.tier, leg_factor: Number(x.factor) || hit.leg_factor, cell: x.cell, result_hit: x.hit == null ? null : Number(x.hit), board_percentile: percentile(s.app, Number(hit.score_0_100)), ...riskFor(risk, hit.player_name) }));
      else {
        unmatched++;
        legs.push({ board_row_id: `${slate.date}~${s.app}~${x.player_id || x.player}~${x.prop}~${line}~${sideIn(x.side)}`, player_name: x.player, canonical_prop_key: x.prop, prop_label: propLabel(x.prop),
          line_value: line, selected_side: side, source_key: s.app, tier: x.tier, leg_factor: Number(x.factor) || null, hit_probability_0_100: null, cell: x.cell,
          result_hit: x.hit == null ? null : Number(x.hit), game_pk: x.event_id || null, mlb_player_id: x.player_id || x.player });
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
      result: s.hits == null ? null : { hits: Number(s.hits), payout: num(s.payout) },
      legs
    });
  }
  if (unmatched) notes.push(`${unmatched} slip legs are not on the scored board (shown without a probability).`);
  if (fallbackNote) notes.push(fallbackNote);
  if (eng.source === "replay_backtest") notes.push(`No engine slips for ${slate.date} - showing the certified backtest's slips for that slate (${eng.suffix ? "market-free twin" : "certified tables"}), with results.`);
  // backup pool: the best board legs not already in a slip, per app, for substitution - ordered by the UNROUNDED hit
  // probability (ties keep the board order: score, then player / prop / line / side), so the pool is reproducible from the DB
  const inSlip = new Set(slips.flatMap(s => s.legs.map(l => l.board_row_id)));
  const pool = [];
  for (const app of ["prizepicks", "underdog"]) {
    pool.push(...board.filter(l => l.source_key === app && !inSlip.has(l.final_board_row_id) && Number(l.score_0_100) >= minScore)
      .sort((a, b) => Number(b.final_hp_raw) - Number(a.final_hp_raw)).slice(0, size)
      .map(l => slipLeg(l, { board_percentile: percentile(app, Number(l.score_0_100)), ...riskFor(risk, l.player_name) })));
  }
  if (!slips.length) notes.unshift(slate.mode === "live" ? "No engine slips yet for today - P3 builds them about 30 minutes before the first tip." : `No slips recorded for ${slate.date}.`);
  return { ok: true, data_ok: true, version, route: "/api/slips/high-hit", slate, source: eng.source, generated_slips: slips, backup_pool: pool,
    pricing, max_per_game: cfg.ui.backup_pool.max_per_game, notes, board_legs: board.length, timing_ms: (lap("build"), T) };
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
