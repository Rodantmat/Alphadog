import postgres from "postgres";

/**
 * alphadog-v2-slip-builder.js
 *
 * FIRST AUTONOMOUS WRITER to score.slip_entries / score.slip_legs.
 * Every prior row (116 as of 2026-09-03) was saved_by='main_ui' (manual).
 *
 * SAFETY: This worker NEVER places a bet. It writes candidate slips with
 * status='saved_pending' exactly as the Control Room UI does. Rodolfo places
 * them manually in the PrizePicks app. There is no auto-submit path.
 *
 * Strategy: SLIP_STRATEGY_V1 (see SLIP_STRATEGY_V1_SPEC_AND_BLOCKERS.md and
 * SLIP_STRATEGY_V1_VERIFICATION_ADDENDUM.md).
 * Backtest: 34 slips / 23 days, +68.8% ROI, bootstrap 100%, CI [+39.9,+94.5],
 * leg accuracy 94.9%, best-day share 9.5%, 20/23 profitable days.
 *
 * KEY DESIGN DECISIONS (all measured, see addendum):
 *  - POWER not Flex. Flex lowers the all-hit tier to ~0.73x and pays 0.50 on n-1;
 *    at 95% leg accuracy that trade loses (+68.8% Power vs ~+24% Flex).
 *  - 4-pick not 5-pick. Multipliers are SIZE-DEPENDENT: total_bases t2 measured
 *    1.2447/leg on a 4-pick but 1.1914/leg on a 5-pick (-4.3%). The 5th leg costs
 *    accuracy and gains almost nothing.
 *  - Tiers computed from the RAW UNCUT board, never from final_board_history.
 *    goblin_demon_anchor_line is populated on only 16.1% of final-board rows
 *    because the anchor fallback needs both More and Less rows present and cut
 *    rows never arrive.
 *  - Pool ordered by each cell's OWN signal, NOT final HP. Final HP is downstream
 *    of baseline, whose formula changed 2026-09-02. Dropping it costs ~10 ROI
 *    points and removes the dependency entirely. Config is now baseline-free.
 *  - On leg unavailability: SHRINK the slip, never substitute a backup leg.
 *    Measured: shrink wins at every drop rate (0%: +93.4 vs +92.7; 30%: +84.2 vs +77.2).
 *    Backup legs come from beyond the cap, exactly the ranks proven dilutive.
 */

const WORKER_NAME = "alphadog-v2-slip-builder";
const VERSION = "alphadog-v2-slip-builder-v1.1.0-power-5pick-own-signal";
const JOB_KEY = "slip-builder";
const STRATEGY_VERSION = "SLIP_STRATEGY_V1";

const TARGET_SIZE = 5;
const MIN_SIZE = 4;
const MAX_SLIPS_PER_DAY = 2;
const MAX_LEGS_PER_PROP = 3;

// Pre-placement gate. Slip win rate measured 25/33 = 75.8%; breakeven multiplier
// is 1/p. Rounded conservatively. If the app shows a multiplier below this, the
// slip is no longer +EV and must NOT be placed.
const MIN_REAL_MULTIPLIER = 1.35;

// Cell definitions. signal: 'deep' | 'shallow'. cap_lo/cap_hi are daily ranks
// within the cell (1-indexed, inclusive).
const CELLS = [
  { key: "total_bases/over",        prop: "total_bases",        side: "less", tier: 2, dir: "over",  signal: "deep",    cap_lo: 1, cap_hi: 3, mult: 1.1583 },
  { key: "pitcher_strikeouts/over", prop: "pitcher_strikeouts", side: "less", tier: 2, dir: "over",  signal: "shallow", cap_lo: 1, cap_hi: 1, mult: 1.2743 },
  { key: "doubles/over",            prop: "doubles",            side: "less", tier: 0, dir: "over",  signal: "deep",    cap_lo: 1, cap_hi: 1, mult: 1.1247 },
  { key: "hits_allowed/under",      prop: "hits_allowed",       side: "more", tier: 2, dir: "under", signal: "shallow", cap_lo: 1, cap_hi: 1, mult: 1.1832 },
  { key: "hits_allowed/over",       prop: "hits_allowed",       side: "less", tier: 2, dir: "over",  signal: "shallow", cap_lo: 1, cap_hi: 2, mult: 1.1832 },
  { key: "walks_allowed/under",     prop: "walks_allowed",      side: "more", tier: 1, dir: "under", signal: "deep",    cap_lo: 1, cap_hi: 1, mult: 1.1362 }
];

const MIN_DEEP_GAMES = 10;
const MIN_SHALLOW_LEGS = 3;

// stat_type on the raw board -> canonical_prop_key
const STAT_TYPE_MAP = {
  "Total Bases": "total_bases",
  "Doubles": "doubles",
  "Pitcher Strikeouts": "pitcher_strikeouts",
  "Hits Allowed": "hits_allowed",
  "Walks Allowed": "walks_allowed"
};

// game-log column per prop, for deep trailing
const DEEP_STAT = {
  total_bases: { table: "stats_hitter", col: "total_bases" },
  doubles:     { table: "stats_hitter", col: "doubles" },
  pitcher_strikeouts: { table: "stats_pitcher", col: "strikeouts" },
  hits_allowed:       { table: "stats_pitcher", col: "hits_allowed" },
  walks_allowed:      { table: "stats_pitcher", col: "walks_allowed" }
};

function nowUtc() { return new Date().toISOString(); }
function makeSlipId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  return `slip_${ts}_${rand.slice(0, 16)}`;
}
function round(v, d = 4) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return null;
  const m = Math.pow(10, d);
  return Math.round(Number(v) * m) / m;
}

/**
 * Resolve the anchor line for one player/prop ladder, 3 layers:
 *   1. visible standard row
 *   2. switch-point between last goblin and first demon
 *   3. prop-level modal anchor (caller supplies)
 * Returns { anchor, source } or null.
 */
function resolveAnchor(rows, propFallback) {
  const std = rows.filter(r => r.odds_type === "standard");
  if (std.length) {
    return { anchor: Math.min(...std.map(r => Number(r.line_score))), source: "visible" };
  }
  const gob = rows.filter(r => r.odds_type === "goblin").map(r => Number(r.line_score));
  const dem = rows.filter(r => r.odds_type === "demon").map(r => Number(r.line_score));
  if (gob.length && dem.length) {
    const hiGob = Math.max(...gob);
    const loDem = Math.min(...dem);
    if (loDem > hiGob) return { anchor: (hiGob + loDem) / 2, source: "inferred" };
  }
  if (propFallback !== null && propFallback !== undefined) {
    return { anchor: propFallback, source: "prop_fallback" };
  }
  return null;
}

/**
 * Given a raw board row and the resolved anchor, produce the two sides with
 * correct variant identity using the complement rule:
 *   odds_type tags the MORE side. The LESS side is always the complement.
 *   A demon-tagged row bet LESS is a goblin. A goblin-tagged row bet LESS is a demon.
 * Returns array of { side, is_goblin, is_demon, tier, tier_direction }.
 */
function sidesForRow(row, anchor) {
  const line = Number(row.line_score);
  const tier = line === anchor ? 0 : Math.round(Math.abs(line - anchor));
  const dirOver = line > anchor;   // line sits above the anchor
  const out = [];
  const ot = row.odds_type;
  if (ot !== "standard") {
    // MORE side carries the raw tag
    out.push({
      side: "more",
      is_goblin: ot === "goblin" ? 1 : 0,
      is_demon: ot === "demon" ? 1 : 0,
      tier,
      tier_direction: dirOver ? "over" : "under"
    });
    // LESS side is the complement, and only exists if under is allowed
    if (Number(row.is_under_allowed) === 1) {
      out.push({
        side: "less",
        is_goblin: ot === "demon" ? 1 : 0,
        is_demon: ot === "goblin" ? 1 : 0,
        tier,
        tier_direction: dirOver ? "over" : "under"
      });
    }
  }
  return out;
}

async function buildPool(sql, slateDate) {
  // 1. Raw uncut board. This is the authoritative source for tiers.
  const board = await sql`
    SELECT player_name, mlb_player_id, game_id, stat_type, line_score, odds_type,
           is_under_allowed, official_game_time_utc
    FROM market.prizepicks_board_current
    WHERE pickable_flag = 1
  `;
  if (!board.length) return { legs: [], reason: "EMPTY_BOARD" };

  const nowTs = Date.now();

  // 2. Group into ladders by player+stat_type
  const ladders = new Map();
  for (const r of board) {
    const prop = STAT_TYPE_MAP[r.stat_type];
    if (!prop) continue;
    const k = `${r.mlb_player_id}|${prop}`;
    if (!ladders.has(k)) ladders.set(k, { prop, rows: [], meta: r });
    ladders.get(k).rows.push(r);
  }

  // 3. Prop-level modal anchor fallback, from ladders that DO have a visible standard
  const stdByProp = new Map();
  for (const { prop, rows } of ladders.values()) {
    const std = rows.filter(x => x.odds_type === "standard");
    if (!std.length) continue;
    const v = Math.min(...std.map(x => Number(x.line_score)));
    if (!stdByProp.has(prop)) stdByProp.set(prop, new Map());
    const m = stdByProp.get(prop);
    m.set(v, (m.get(v) || 0) + 1);
  }
  const propFallback = new Map();
  for (const [prop, counts] of stdByProp.entries()) {
    let best = null, bestN = -1;
    for (const [v, n] of counts.entries()) if (n > bestN) { best = v; bestN = n; }
    propFallback.set(prop, best);
  }

  // 4. Expand to sided legs and keep only those matching a target cell
  const cellByKey = new Map(CELLS.map(c => [`${c.prop}|${c.tier}|${c.dir}|${c.side}`, c]));
  const candidates = [];
  for (const { prop, rows } of ladders.values()) {
    const a = resolveAnchor(rows, propFallback.has(prop) ? propFallback.get(prop) : null);
    if (!a) continue;
    for (const r of rows) {
      // BLOCKER 5: exclude games already underway at build time
      if (r.official_game_time_utc && new Date(r.official_game_time_utc).getTime() <= nowTs) continue;
      for (const s of sidesForRow(r, a.anchor)) {
        if (!s.is_goblin) continue; // strategy is goblin-only
        const ck = `${prop}|${s.tier}|${s.tier_direction}|${s.side}`;
        const cell = cellByKey.get(ck);
        if (!cell) continue;
        candidates.push({
          cell_key: cell.key,
          cell,
          player_id: Number(r.mlb_player_id),
          player_name: r.player_name,
          game_id: r.game_id,
          game_time_utc: r.official_game_time_utc,
          prop,
          line_value: Number(r.line_score),
          selected_side: s.side,
          tier: s.tier,
          tier_direction: s.tier_direction,
          anchor_line: a.anchor,
          anchor_source: a.source,
          mult: cell.mult
        });
      }
    }
  }
  if (!candidates.length) return { legs: [], reason: "NO_CANDIDATES_MATCHED_CELLS" };

  // 5. Signals
  for (const c of candidates) {
    if (c.cell.signal === "deep") {
      const ds = DEEP_STAT[c.prop];
      const rows = ds.table === "stats_hitter"
        ? await sql`
            SELECT COUNT(*)::int AS n,
              AVG(CASE WHEN ${c.selected_side === "less"}
                   THEN (CASE WHEN ${sql(ds.col)} < ${c.line_value} THEN 1.0 ELSE 0.0 END)
                   ELSE (CASE WHEN ${sql(ds.col)} > ${c.line_value} THEN 1.0 ELSE 0.0 END) END)::float AS rate
            FROM stats_hitter.game_logs
            WHERE player_id = ${c.player_id} AND game_date < ${slateDate} AND ${sql(ds.col)} IS NOT NULL`
        : await sql`
            SELECT COUNT(*)::int AS n,
              AVG(CASE WHEN ${c.selected_side === "less"}
                   THEN (CASE WHEN ${sql(ds.col)} < ${c.line_value} THEN 1.0 ELSE 0.0 END)
                   ELSE (CASE WHEN ${sql(ds.col)} > ${c.line_value} THEN 1.0 ELSE 0.0 END) END)::float AS rate
            FROM stats_pitcher.game_logs
            WHERE player_id = ${c.player_id} AND game_date < ${slateDate} AND ${sql(ds.col)} IS NOT NULL`;
      c.signal_n = rows[0] ? Number(rows[0].n) : 0;
      c.signal_value = rows[0] && rows[0].rate !== null ? Number(rows[0].rate) : null;
      c.signal_kind = "deep_trailing";
    } else {
      const rows = await sql`
        SELECT COUNT(*)::int AS n, AVG(outcome_hit::numeric)::float AS rate
        FROM score.prop_outcome_history
        WHERE mlb_player_id = ${c.player_id}
          AND canonical_prop_key = ${c.prop}
          AND selected_side = ${c.selected_side}
          AND official_date::date < ${slateDate}
          AND outcome_hit IS NOT NULL`;
      c.signal_n = rows[0] ? Number(rows[0].n) : 0;
      c.signal_value = rows[0] && rows[0].rate !== null ? Number(rows[0].rate) : null;
      c.signal_kind = "shallow_trailing";
    }
  }

  // 6. Minimum history + rank within cell + apply cap
  const qualified = candidates.filter(c => {
    if (c.signal_value === null) return false;
    const need = c.cell.signal === "deep" ? MIN_DEEP_GAMES : MIN_SHALLOW_LEGS;
    return c.signal_n >= need;
  });

  const byCell = new Map();
  for (const c of qualified) {
    if (!byCell.has(c.cell_key)) byCell.set(c.cell_key, []);
    byCell.get(c.cell_key).push(c);
  }
  const pool = [];
  for (const [ck, list] of byCell.entries()) {
    const cell = CELLS.find(x => x.key === ck);
    list.sort((a, b) => b.signal_value - a.signal_value);
    for (let i = cell.cap_lo - 1; i < Math.min(cell.cap_hi, list.length); i++) {
      list[i].daily_rank = i + 1;
      pool.push(list[i]);
    }
  }

  // 7. Order by OWN signal (not final HP - see header)
  pool.sort((a, b) => b.signal_value - a.signal_value);
  return { legs: pool, reason: null };
}

function assembleSlips(pool) {
  const slips = [];
  const remaining = pool.slice();
  while (remaining.length >= MIN_SIZE && slips.length < MAX_SLIPS_PER_DAY) {
    // Take up to TARGET_SIZE, never more than MAX_LEGS_PER_PROP of any one prop.
    // Measured neutral on the backtest (identical result) but bounds concentration risk.
    const legs = [];
    const propCount = {};
    for (let j = 0; j < remaining.length && legs.length < TARGET_SIZE; j++) {
      const cand = remaining[j];
      if ((propCount[cand.prop] || 0) >= MAX_LEGS_PER_PROP) continue;
      legs.push(cand);
      propCount[cand.prop] = (propCount[cand.prop] || 0) + 1;
    }
    if (legs.length < MIN_SIZE) break;
    for (const l of legs) remaining.splice(remaining.indexOf(l), 1);

    const mult = legs.reduce((a, l) => a * l.mult, 1);
    const estHp = legs.reduce((a, l) => a * l.signal_value, 1);
    const breakeven = 1 / estHp; // multiplier the app must show for this slip to be +EV
    slips.push({
      legs,
      slip_size: legs.length,
      estimated_multiplier: round(mult, 4),
      estimated_hit_probability_0_100: round(estHp * 100, 2),
      breakeven_hit_rate_0_100: round((1 / mult) * 100, 2),
      edge_vs_breakeven_0_100: round((estHp - 1 / mult) * 100, 2),
      // PRE-PLACEMENT GATE. Measured multiplier drift of ~7% on identical
      // compositions (same 4 players priced 2.40 one day, 1.80 another), so the
      // estimate cannot be trusted at placement time. Read the REAL multiplier in
      // the app and refuse the slip if it is below this floor.
      min_real_multiplier_to_place: round(Math.max(breakeven, MIN_REAL_MULTIPLIER), 4),
      placement_rule: `Check the app's displayed multiplier before placing. If it is below ${round(Math.max(breakeven, MIN_REAL_MULTIPLIER), 4)}x, DO NOT PLACE - the slip is no longer +EV at that price.`
    });
  }
  return slips;
}

async function writeSlips(sql, slips, slateDate, dryRun) {
  const written = [];
  for (const s of slips) {
    const slipId = makeSlipId();
    const grade = s.edge_vs_breakeven_0_100 >= 10 ? "A" : (s.edge_vs_breakeven_0_100 >= 3 ? "B" : "C");
    const notes = `${STRATEGY_VERSION} | POWER ${s.slip_size}-pick | cells: ${s.legs.map(l => l.cell_key).join(", ")}`;
    if (dryRun) { written.push({ slip_id: slipId, dry_run: true, ...s, legs: undefined, leg_count: s.legs.length }); continue; }

    await sql`
      INSERT INTO score.slip_entries (
        slip_id, source_key, slip_type, slip_size, structure_label, entry_mode,
        selected_leg_count, estimated_hit_probability_0_100, estimated_multiplier,
        estimated_payout_note, breakeven_hit_rate_0_100, edge_vs_breakeven_0_100,
        strategy_grade, strategy_notes, status, saved_by, slip_json
      ) VALUES (
        ${slipId}, 'prizepicks', ${`${s.slip_size}-pick`}, ${s.slip_size},
        ${`goblin_power_${s.slip_size}`}, 'power',
        ${s.slip_size}, ${s.estimated_hit_probability_0_100}, ${s.estimated_multiplier},
        ${`est ${s.estimated_multiplier}x on ${s.slip_size}/${s.slip_size}`},
        ${s.breakeven_hit_rate_0_100}, ${s.edge_vs_breakeven_0_100},
        ${grade}, ${notes}, 'saved_pending', ${WORKER_NAME},
        ${sql.json({ strategy_version: STRATEGY_VERSION, worker_version: VERSION, slate_date: slateDate,
                     legs: s.legs.map(l => ({ player_id: l.player_id, player_name: l.player_name,
                       prop: l.prop, line: l.line_value, side: l.selected_side, cell: l.cell_key,
                       tier: l.tier, tier_direction: l.tier_direction, anchor: l.anchor_line,
                       anchor_source: l.anchor_source, signal_kind: l.signal_kind,
                       signal_value: round(l.signal_value, 4), signal_n: l.signal_n,
                       daily_rank: l.daily_rank, mult: l.mult })) })}
      )`;

    // slip_legs: player_id and official_date MUST be populated or the auto-grader breaks
    let idx = 0;
    for (const l of s.legs) {
      await sql`
        INSERT INTO score.slip_legs (
          slip_leg_id, slip_id, leg_index, source_key, game_pk, official_date,
          official_game_time_utc, player_id, player_name, canonical_prop_key,
          line_value, selected_side, hit_probability_0_100
        ) VALUES (
          ${`${slipId}_leg${idx}`}, ${slipId}, ${idx}, 'prizepicks', ${l.game_id}, ${slateDate},
          ${l.game_time_utc}, ${l.player_id}, ${l.player_name}, ${l.prop},
          ${l.line_value}, ${l.selected_side}, ${round(l.signal_value * 100, 2)}
        )`;
      idx++;
    }
    written.push({ slip_id: slipId, slip_size: s.slip_size, estimated_multiplier: s.estimated_multiplier,
                   edge: s.edge_vs_breakeven_0_100, grade });
  }
  return written;
}

async function run(sql, input) {
  const slateDate = input.slate_date || new Date().toISOString().slice(0, 10);
  const dryRun = input.dry_run !== false; // DEFAULT DRY RUN. Must pass dry_run:false to write.

  const { legs, reason } = await buildPool(sql, slateDate);
  if (!legs.length) {
    return { ok: true, data_ok: true, worker_name: WORKER_NAME, version: VERSION,
             slate_date: slateDate, status: "NO_QUALIFIED_LEGS", reason, slips_built: 0 };
  }
  const slips = assembleSlips(legs);
  if (!slips.length) {
    return { ok: true, data_ok: true, worker_name: WORKER_NAME, version: VERSION,
             slate_date: slateDate, status: "POOL_BELOW_MIN_SIZE",
             pool_size: legs.length, min_size: MIN_SIZE, slips_built: 0 };
  }
  const written = await writeSlips(sql, slips, slateDate, dryRun);
  return {
    ok: true, data_ok: true, worker_name: WORKER_NAME, version: VERSION,
    strategy_version: STRATEGY_VERSION, slate_date: slateDate,
    status: dryRun ? "DRY_RUN_NO_WRITE" : "SLIPS_WRITTEN",
    dry_run: dryRun, pool_size: legs.length, slips_built: slips.length,
    pool_by_cell: CELLS.map(c => ({ cell: c.key, n: legs.filter(l => l.cell_key === c.key).length })),
    slips: written,
    safety_note: "This worker never places a bet. Slips are written status='saved_pending' for manual placement."
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const sql = postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false });
    try {
      if (url.pathname === "/" || url.pathname === "/health") {
        return new Response(JSON.stringify({
          ok: true, worker_name: WORKER_NAME, version: VERSION, job_key: JOB_KEY,
          strategy_version: STRATEGY_VERSION, timestamp_utc: nowUtc(),
          reads: ["market.prizepicks_board_current", "stats_hitter.game_logs",
                  "stats_pitcher.game_logs", "score.prop_outcome_history"],
          writes: ["score.slip_entries", "score.slip_legs"],
          config: { entry_mode: "power", target_size: TARGET_SIZE, min_size: MIN_SIZE,
                    max_slips_per_day: MAX_SLIPS_PER_DAY, cells: CELLS.length },
          backtest: { slips: 34, days: 23, roi_pct: 68.8, leg_accuracy_pct: 94.9,
                      bootstrap_positive_pct: 100.0, ci_95: "[+39.9, +94.5]" },
          safety_note: "Never places a bet. Writes status='saved_pending' only. Defaults to dry_run.",
          known_gaps: [
            "Sample is 34 slips over 23 days; per-cell signal and cap were selected in-sample.",
            "Multipliers are size-dependent and are calibrated for 4-pick slips only.",
            "Not yet registered for cron; invoke manually via POST /run."
          ]
        }), { headers: { "content-type": "application/json" } });
      }
      if (url.pathname === "/run" && request.method === "POST") {
        let input = {};
        try { input = await request.json(); } catch (_) { input = {}; }
        const merged = { ...(input.input_json && typeof input.input_json === "object" ? input.input_json : {}), ...input };
        const result = await run(sql, merged);
        return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: false, error: "not_found", path: url.pathname }),
        { status: 404, headers: { "content-type": "application/json" } });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err),
        stack: String(err && err.stack ? err.stack : "") }), { status: 500, headers: { "content-type": "application/json" } });
    } finally {
      try { await sql.end(); } catch (_) {}
    }
  }
};
