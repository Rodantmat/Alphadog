import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-base-classification-v5";
const VERSION = "alphadog-v2-base-classification-v5-postgres-v1.0.0-tier-profiles";
const JOB_KEY = "base-classification-v5";
const FORMULA_VERSION = "classification_v5_formula_v0_1_55_history_only_no_daily_context";
const DEFAULT_SEASON = 2026;
const DEFAULT_CHUNK_SIZE = 150;

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function asInt(v, fallback = null) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : fallback; }
function asText(v, fallback = null) { if (v === undefined || v === null || String(v).trim() === "") return fallback; return String(v).trim(); }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function round(v, d = 2) { if (v === null || v === undefined || !Number.isFinite(Number(v))) return null; const m = Math.pow(10, d); return Math.round(Number(v) * m) / m; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ---- Real tier functions, ported exactly from the live D1 source (verified: tier logic is player-level, not prop/line-specific) ----
function hitterTier12({ games, paPerGame, abRatio, avgOrder, hitRatePerGame, walkRate, soRate }) {
  if (games < 30) return { tier_key: "TIER_12_MICRO_SAMPLE_ROOKIE", tier_number: 12 };
  if (paPerGame <= 1.5) return { tier_key: "TIER_11_LATE_GAME_SUB_PINCH_HITTER", tier_number: 11 };
  if (paPerGame < 3.5 && games >= 30) return { tier_key: "TIER_10_HIGH_USAGE_UTILITY_BENCH", tier_number: 10 };
  if (avgOrder >= 8.5 && hitRatePerGame < 0.85) return { tier_key: "TIER_09_DEFENSIVE_BOTTOM_ORDER_BLACK_HOLE", tier_number: 9 };
  if (avgOrder >= 7 || (paPerGame >= 3.0 && paPerGame < 3.7)) return { tier_key: "TIER_06_BOTTOM_ORDER_STARTER", tier_number: 6 };
  if (avgOrder >= 4 && avgOrder <= 6 && abRatio < 0.75) return { tier_key: "TIER_05_MIDDLE_ORDER_TTO_SLUGGER", tier_number: 5 };
  if (avgOrder >= 3 && avgOrder <= 5 && abRatio >= 0.86) return { tier_key: "TIER_04_MIDDLE_ORDER_CONTACT_REGULAR", tier_number: 4 };
  if (avgOrder <= 2.5 && paPerGame >= 4.1 && hitRatePerGame < 1.05) return { tier_key: "TIER_03_AGGRESSIVE_VOLUME_DEPENDENT_REGULAR", tier_number: 3 };
  if (avgOrder <= 3 && paPerGame >= 4.0 && (walkRate + soRate) >= 0.30) return { tier_key: "TIER_02_HIGH_VOLUME_MIDDLE_ORDER_ANCHOR_LOWER_AB_RATIO", tier_number: 2 };
  if (avgOrder <= 2.5 && paPerGame >= 4.2 && hitRatePerGame >= 1.05 && abRatio >= 0.90) return { tier_key: "TIER_01_HIGH_VOLUME_LEADOFF_CONTACT_ANCHOR", tier_number: 1 };
  return { tier_key: "TIER_04_MIDDLE_ORDER_CONTACT_REGULAR", tier_number: 4 };
}
function pitcherTier({ games, outsPerStart, bfPerStart, kRate, bbRate, haRate, splitDelta }) {
  if (games < 5) return { tier_key: "PITCHER_TIER_12_MICRO_SAMPLE", tier_number: 12 };
  if (outsPerStart >= 18 && bfPerStart >= 24 && kRate >= 0.27) return { tier_key: "PITCHER_TIER_01_DEEP_K_WORKHORSE", tier_number: 1 };
  if (outsPerStart >= 18 && bfPerStart >= 24) return { tier_key: "PITCHER_TIER_02_DEEP_VOLUME_STARTER", tier_number: 2 };
  if (outsPerStart >= 15 && bbRate <= 0.075) return { tier_key: "PITCHER_TIER_03_COMMAND_VOLUME_STARTER", tier_number: 3 };
  if (outsPerStart >= 15 && (bbRate >= 0.105 || haRate >= 0.24)) return { tier_key: "PITCHER_TIER_05_DAMAGE_OR_CONTROL_VOLATILE_STARTER", tier_number: 5 };
  if (outsPerStart >= 12) return { tier_key: "PITCHER_TIER_06_LOW_WORKLOAD_STARTER", tier_number: 6 };
  if (Math.abs(splitDelta) >= 6) return { tier_key: splitDelta < 0 ? "PITCHER_TIER_07_PLATOON_FAVORABLE_SUPPRESSOR" : "PITCHER_TIER_08_PLATOON_UNFAVORABLE_DAMAGE_RISK", tier_number: splitDelta < 0 ? 7 : 8 };
  return { tier_key: "PITCHER_TIER_04_STANDARD_STARTER", tier_number: 4 };
}
function normalizedBattingOrderValue(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 100 && n <= 999) { const slot = Math.floor(n / 100); return (slot >= 1 && slot <= 9) ? slot : null; }
  if (n >= 1 && n <= 9) return n;
  return null;
}
function battingOrderSummary(rows) {
  const total = (rows || []).length;
  const vals = [];
  for (const r of (rows || [])) { const v = normalizedBattingOrderValue(r && r.batting_order); if (v != null) vals.push(v); }
  const coverage = total ? vals.length / total : 0;
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  return { avg_batting_order_normalized: avg, batting_order_rows: vals.length, batting_order_coverage: coverage };
}
function resolveLineupProfileFromOrder(orderSummary) {
  const avg = orderSummary && Number(orderSummary.avg_batting_order_normalized);
  const coverage = orderSummary && Number(orderSummary.batting_order_coverage || 0);
  const orderRows = orderSummary && Number(orderSummary.batting_order_rows || 0);
  if (!Number.isFinite(avg) || orderRows < 3 || coverage < 0.25) return "LINEUP_UNKNOWN";
  if (avg <= 3) return "TOP_ORDER";
  if (avg <= 6) return "MIDDLE_ORDER";
  return "BOTTOM_ORDER";
}
function splitRate(rows, key, numField, denField) {
  const r = (rows || []).find(x => String(x.split_key) === key);
  if (!r) return null;
  const den = num(r[denField]);
  if (den <= 0) return null;
  return 100 * num(r[numField]) / den;
}
function sumNum(rows, field) { return rows.reduce((a, r) => a + num(r[field]), 0); }

async function ensureSchema(sql) { await sql`SELECT 1`; return { ok: true }; }

async function getWorkerTickConfig(sql, workerName, fallbackChunk) {
  try {
    const rows = await sql`SELECT chunk_size_players FROM config.worker_tick_settings WHERE worker_name=${workerName} LIMIT 1`;
    return { chunk_size_players: rows[0] ? asInt(rows[0].chunk_size_players, fallbackChunk) : fallbackChunk };
  } catch (_) { return { chunk_size_players: fallbackChunk }; }
}

async function classifyHitter(playerId, logs, splitsByKey) {
  const games = logs.length;
  const pa = sumNum(logs, "pa"), ab = sumNum(logs, "ab"), hits = sumNum(logs, "hits"), walks = sumNum(logs, "walks"), so = sumNum(logs, "strikeouts");
  const paPerGame = games ? pa / games : 0, abRatio = pa ? ab / pa : 0, hitRatePerGame = games ? hits / games : 0, walkRate = pa ? walks / pa : 0, soRate = pa ? so / pa : 0;
  const orderSummary = battingOrderSummary(logs);
  const avgOrder = orderSummary.avg_batting_order_normalized;
  const leftHit = splitRate(splitsByKey, "vl", "hits", "pa");
  const rightHit = splitRate(splitsByKey, "vr", "hits", "pa");
  const splitDelta = (leftHit != null && rightHit != null) ? round(leftHit - rightHit, 2) : 0;
  const tier = hitterTier12({ games, paPerGame, abRatio, avgOrder: avgOrder || 0, hitRatePerGame, walkRate, soRate });
  const lineupProfile = resolveLineupProfileFromOrder(orderSummary);
  const volumeProfile = paPerGame >= 4.2 ? "HIGH_VOLUME" : (paPerGame >= 3.7 ? "EVERYDAY_CORE" : (paPerGame >= 2.0 ? "LOW_USAGE_OR_PARTIAL" : "MICRO_USAGE"));
  const platoonProfile = Math.abs(splitDelta) >= 6 ? (splitDelta > 0 ? "FAVORABLE_VS_LEFT_SHAPE" : "FAVORABLE_VS_RIGHT_SHAPE") : "NEUTRAL_OR_LOW_SPLIT_SIGNAL";
  const confidence = clamp(25 + Math.min(50, games * 0.6), 1, 95); // real model's baseline_confidence_0_100 default fallback path (25) scaled by sample; exact HP-model confidence comes from Stage 4, not classification alone
  return {
    classification_row_id: `class_v5|hitter|${playerId}`, player_id: playerId, entity_type: "hitter",
    games_sample: games, tier_key: tier.tier_key, tier_number: tier.tier_number, volume_profile: volumeProfile, lineup_profile: lineupProfile,
    platoon_profile: platoonProfile, usage_profile: volumeProfile, split_delta_0_100: splitDelta,
    pa_per_game: round(paPerGame, 3), ab_ratio: round(abRatio, 3), avg_batting_order: avgOrder != null ? round(avgOrder, 2) : null,
    outs_per_start: null, bf_per_start: null, k_rate: null, bb_rate: null, ha_rate: null,
    hits_per_game: round(hitRatePerGame, 3), walk_rate: round(walkRate, 4), strikeout_rate: round(soRate, 4),
    classification_confidence_0_100: round(confidence, 2), formula_version: FORMULA_VERSION,
    metrics_json: JSON.stringify({ pa, ab, hits, walks, strikeouts: so, batting_order_rows: orderSummary.batting_order_rows, batting_order_coverage: round(orderSummary.batting_order_coverage, 3), split_rows: splitsByKey.length })
  };
}
async function classifyPitcher(playerId, logs, splitsByKey) {
  const games = logs.length;
  const bf = sumNum(logs, "batters_faced"), outs = sumNum(logs, "outs_recorded"), k = sumNum(logs, "strikeouts"), bb = sumNum(logs, "walks_allowed"), ha = sumNum(logs, "hits_allowed");
  const leftHa = splitRate(splitsByKey, "vl", "hits_allowed", "batters_faced");
  const rightHa = splitRate(splitsByKey, "vr", "hits_allowed", "batters_faced");
  const splitDelta = (leftHa != null && rightHa != null) ? round(leftHa - rightHa, 2) : 0;
  const outsPerStart = games ? outs / games : 0, bfPerStart = games ? bf / games : 0;
  const kRate = bf ? k / bf : 0, bbRate = bf ? bb / bf : 0, haRate = bf ? ha / bf : 0;
  const tier = pitcherTier({ games, outsPerStart, bfPerStart, kRate, bbRate, haRate, splitDelta });
  const volumeProfile = outsPerStart >= 18 ? "DEEP_STARTER" : (outsPerStart >= 15 ? "NORMAL_STARTER" : (outsPerStart >= 12 ? "LOW_WORKLOAD_STARTER" : "SHORT_OR_UNSTABLE_WORKLOAD"));
  const platoonProfile = Math.abs(splitDelta) >= 6 ? (splitDelta < 0 ? "SUPPRESSES_LEFT_MORE_THAN_RIGHT" : "MORE_DAMAGE_VS_LEFT_THAN_RIGHT") : "NEUTRAL_OR_LOW_SPLIT_SIGNAL";
  const confidence = clamp(25 + Math.min(50, games * 2), 1, 95);
  return {
    classification_row_id: `class_v5|pitcher|${playerId}`, player_id: playerId, entity_type: "pitcher",
    games_sample: games, tier_key: tier.tier_key, tier_number: tier.tier_number, volume_profile: volumeProfile, lineup_profile: "PITCHER_NA",
    platoon_profile: platoonProfile, usage_profile: volumeProfile, split_delta_0_100: splitDelta,
    pa_per_game: null, ab_ratio: null, avg_batting_order: null,
    outs_per_start: round(outsPerStart, 2), bf_per_start: round(bfPerStart, 2), k_rate: round(kRate, 4), bb_rate: round(bbRate, 4), ha_rate: round(haRate, 4),
    hits_per_game: null, walk_rate: null, strikeout_rate: null,
    classification_confidence_0_100: round(confidence, 2), formula_version: FORMULA_VERSION,
    metrics_json: JSON.stringify({ bf, outs, k, bb, hits_allowed: ha, split_rows: splitsByKey.length })
  };
}

async function getPlayerUniverse(sql, entityType, season) {
  if (entityType === "hitter") {
    const rows = await sql`SELECT DISTINCT player_id FROM stats_hitter.game_logs WHERE season=${season} ORDER BY player_id`;
    return rows.map(r => Number(r.player_id));
  }
  const rows = await sql`SELECT DISTINCT mlb_player_id AS player_id FROM team.starter_history WHERE mlb_player_id IS NOT NULL ORDER BY mlb_player_id`;
  return rows.map(r => Number(r.player_id));
}

async function loadHitterInputs(sql, playerIds, season) {
  if (!playerIds.length) return { logsByPlayer: new Map(), splitsByPlayer: new Map() };
  const logRows = await sql`SELECT player_id, game_date, batting_order, pa, ab, hits, walks, strikeouts FROM stats_hitter.game_logs WHERE season=${season} AND player_id IN ${sql(playerIds)} ORDER BY player_id, game_date`;
  const splitRows = await sql`SELECT player_id, split_key, pa, hits FROM stats_hitter.splits WHERE season=${season} AND split_key IN ('vl','vr') AND ingestion_mode IS NOT NULL AND player_id IN ${sql(playerIds)}`;
  const logsByPlayer = new Map(), splitsByPlayer = new Map();
  for (const r of logRows) { const k = Number(r.player_id); if (!logsByPlayer.has(k)) logsByPlayer.set(k, []); logsByPlayer.get(k).push(r); }
  for (const r of splitRows) { const k = Number(r.player_id); if (!splitsByPlayer.has(k)) splitsByPlayer.set(k, []); splitsByPlayer.get(k).push(r); }
  return { logsByPlayer, splitsByPlayer };
}
async function loadPitcherInputs(sql, playerIds, season) {
  if (!playerIds.length) return { logsByPlayer: new Map(), splitsByPlayer: new Map() };
  const logRows = await sql`SELECT mlb_player_id AS player_id, game_date, outs_recorded, batters_faced, strikeouts, walks_allowed, hits_allowed FROM team.starter_history WHERE mlb_player_id IN ${sql(playerIds)} ORDER BY mlb_player_id, game_date`;
  const splitRows = await sql`SELECT player_id, split_key, batters_faced, hits_allowed FROM stats_pitcher.splits WHERE season=${season} AND split_key IN ('vl','vr') AND ingestion_mode IS NOT NULL AND player_id IN ${sql(playerIds)}`;
  const logsByPlayer = new Map(), splitsByPlayer = new Map();
  for (const r of logRows) { const k = Number(r.player_id); if (!logsByPlayer.has(k)) logsByPlayer.set(k, []); logsByPlayer.get(k).push(r); }
  for (const r of splitRows) { const k = Number(r.player_id); if (!splitsByPlayer.has(k)) splitsByPlayer.set(k, []); splitsByPlayer.get(k).push(r); }
  return { logsByPlayer, splitsByPlayer };
}

async function insertRowsBulk(sql, rows) {
  if (!rows.length) return 0;
  const cols = ["classification_row_id","batch_id","run_id","player_id","entity_type","games_sample","tier_key","tier_number","volume_profile","lineup_profile","platoon_profile","usage_profile","split_delta_0_100","pa_per_game","ab_ratio","avg_batting_order","outs_per_start","bf_per_start","k_rate","bb_rate","ha_rate","hits_per_game","walk_rate","strikeout_rate","classification_confidence_0_100","formula_version","metrics_json"];
  const CHUNK = 300;
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await sql`
      INSERT INTO classification.player_classification_v5_current ${sql(chunk, ...cols)}
      ON CONFLICT (classification_row_id) DO UPDATE SET
        games_sample=excluded.games_sample, tier_key=excluded.tier_key, tier_number=excluded.tier_number,
        volume_profile=excluded.volume_profile, lineup_profile=excluded.lineup_profile, platoon_profile=excluded.platoon_profile,
        usage_profile=excluded.usage_profile, split_delta_0_100=excluded.split_delta_0_100, pa_per_game=excluded.pa_per_game,
        ab_ratio=excluded.ab_ratio, avg_batting_order=excluded.avg_batting_order, outs_per_start=excluded.outs_per_start,
        bf_per_start=excluded.bf_per_start, k_rate=excluded.k_rate, bb_rate=excluded.bb_rate, ha_rate=excluded.ha_rate,
        hits_per_game=excluded.hits_per_game, walk_rate=excluded.walk_rate, strikeout_rate=excluded.strikeout_rate,
        classification_confidence_0_100=excluded.classification_confidence_0_100, metrics_json=excluded.metrics_json, updated_at=now()
    `;
    written += chunk.length;
  }
  return written;
}

async function runBaseClassify(sql, input) {
  const season = asInt(input.source_season, DEFAULT_SEASON);
  const batchId = "classification_v5_base_backfill_singleton";
  const runId = asText(input.run_id, rid("run_classification_v5"));
  const tickConfig = await getWorkerTickConfig(sql, WORKER_NAME, DEFAULT_CHUNK_SIZE);

  await sql`
    INSERT INTO classification.player_classification_v5_batches (batch_id, run_id, mode, status)
    VALUES (${batchId}, ${runId}, 'base_classify', 'running')
    ON CONFLICT (batch_id) DO UPDATE SET run_id=excluded.run_id, status='running', updated_at=now()
  `;
  const batchRows = await sql`SELECT * FROM classification.player_classification_v5_batches WHERE batch_id=${batchId} LIMIT 1`;
  const batch = batchRows[0];
  if (batch.status === "completed") return { ok: true, data_ok: true, mode: "base_classify", batch_id: batchId, status: "COMPLETED_CLASSIFICATION_V5_BASE", already_completed: true };

  const hitterUniverse = await getPlayerUniverse(sql, "hitter", season);
  const pitcherUniverse = await getPlayerUniverse(sql, "pitcher", season);
  const totalUniverse = hitterUniverse.length + pitcherUniverse.length;
  if (!batch.players_total) await sql`UPDATE classification.player_classification_v5_batches SET players_total=${totalUniverse}, updated_at=now() WHERE batch_id=${batchId}`;

  const cursor = batch.cursor_player_id ? Number(batch.cursor_player_id) : 0;
  const isHitterPhase = cursor < hitterUniverse.length;
  const remaining = isHitterPhase ? hitterUniverse.slice(cursor) : pitcherUniverse.slice(cursor - hitterUniverse.length);
  const chunk = remaining.slice(0, tickConfig.chunk_size_players);
  const rows = [];

  if (chunk.length) {
    if (isHitterPhase) {
      const { logsByPlayer, splitsByPlayer } = await loadHitterInputs(sql, chunk, season);
      for (const playerId of chunk) {
        const row = await classifyHitter(playerId, logsByPlayer.get(playerId) || [], splitsByPlayer.get(playerId) || []);
        rows.push({ ...row, batch_id: batchId, run_id: runId });
      }
    } else {
      const { logsByPlayer, splitsByPlayer } = await loadPitcherInputs(sql, chunk, season);
      for (const playerId of chunk) {
        const row = await classifyPitcher(playerId, logsByPlayer.get(playerId) || [], splitsByPlayer.get(playerId) || []);
        rows.push({ ...row, batch_id: batchId, run_id: runId });
      }
    }
  }
  const written = await insertRowsBulk(sql, rows);
  const newCursor = cursor + chunk.length;
  const done = newCursor >= totalUniverse;
  const totalWrittenRows = await sql`SELECT COUNT(*)::int AS c FROM classification.player_classification_v5_current`;

  await sql`
    UPDATE classification.player_classification_v5_batches SET
      status=${done ? "completed" : "running"}, cursor_player_id=${newCursor}, players_processed=players_processed + ${chunk.length},
      rows_written=${totalWrittenRows[0].c}, certification=${done ? "CLASSIFICATION_V5_BASE_CERTIFIED" : "PARTIAL_CONTINUE"},
      certification_grade=${done ? "PASS" : "PARTIAL_CONTINUE"}, finished_at=${done ? sql`now()` : null}, updated_at=now()
    WHERE batch_id=${batchId}
  `;
  return {
    ok: true, data_ok: true, mode: "base_classify", batch_id: batchId, status: done ? "COMPLETED_CLASSIFICATION_V5_BASE" : "CLASSIFICATION_V5_PARTIAL_CONTINUE",
    players_total: totalUniverse, players_this_tick: chunk.length, rows_written_this_tick: written, rows_written_total: totalWrittenRows[0].c,
    continuation_required: !done, next_input_json: !done ? { ...input } : null
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const sql = postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false });
    try {
      if (url.pathname === "/" || url.pathname === "/health") {
        return new Response(JSON.stringify({ ok: true, worker_name: WORKER_NAME, version: VERSION, job_key: JOB_KEY, timestamp_utc: nowUtc() }), { headers: { "content-type": "application/json" } });
      }
      if (url.pathname === "/run" && request.method === "POST") {
        await ensureSchema(sql);
        let input = {};
        try { input = await request.json(); } catch (_) { input = {}; }
        const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
        const merged = { ...inputJson, ...input };
        const result = await runBaseClassify(sql, merged);
        return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: false, error: "not_found", path: url.pathname }), { status: 404, headers: { "content-type": "application/json" } });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err), stack: String(err && err.stack ? err.stack : "") }), { status: 500, headers: { "content-type": "application/json" } });
    } finally {
      try { await sql.end(); } catch (_) {}
    }
  }
};
