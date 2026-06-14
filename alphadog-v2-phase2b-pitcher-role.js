const WORKER_NAME = "alphadog-v2-phase2b-pitcher-role";
const LOGICAL_WORKER_NAME = "alphadog-v2-player-baseline-sanity";
const VERSION = "alphadog-v2-phase2b-pitcher-role-v0.1.10-hitter-name-hydration";
const JOB_KEY = "player-baseline-sanity";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "SCORE_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON"];

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function round(n, d = 2) { const x = Number(n || 0); const p = Math.pow(10, d); return Math.round(x * p) / p; }
function pct(n) { return round(Number(n || 0) * 100, 2); }
function safeJson(v) { try { return JSON.stringify(v == null ? null : v); } catch (_) { return JSON.stringify({ json_error: true }); } }

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

async function readJsonSafe(request) { try { return await request.json(); } catch (_) { return {}; } }
function hasBinding(env, name) { return !!(env && env[name]); }
function bindingPresence(env, names) { const out = {}; for (const n of names) out[n] = hasBinding(env, n); return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }

async function all(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  const res = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
  return res.results || [];
}
async function first(db, sql, ...binds) { const rows = await all(db, sql, ...binds); return rows[0] || null; }
async function run(db, sql, ...binds) { const stmt = db.prepare(sql); return binds.length ? await stmt.bind(...binds).run() : await stmt.run(); }
async function batch(db, stmts, size = 40) {
  for (let i = 0; i < stmts.length; i += size) await db.batch(stmts.slice(i, i + size));
}

function baseIdentity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars = {}; for (const n of EXPECTED_VARS) vars[n] = env && env[n] !== undefined && env[n] !== null && String(env[n]).length > 0;
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    logical_worker_name: LOGICAL_WORKER_NAME,
    deployed_worker_slot: WORKER_NAME,
    job_key: JOB_KEY,
    status: "PLAYER_BASELINE_SANITY_WORKER_READY",
    timestamp_utc: nowUtc(),
    layer: "layer_1_history_only_sanity_and_baseline",
    no_external_api_calls: true,
    no_daily_live_context: true,
    no_market_context: true,
    no_scoring: true,
    no_final_board: true,
    no_prepared_board_mutation: true,
    binding_summary: { required_db_bindings_present: allTrue(db), db_bindings: db, vars }
  };
}

const HITTER_PROPS = [
  { key:"hits", lines:[0.5,1.5,2.5], value:r=>num(r.hits), fast:true },
  { key:"total_bases", lines:[0.5,1.5,2.5,3.5,4.5,5.5,6.5], value:r=>num(r.total_bases), heavyTail:true },
  { key:"hits_runs_rbis", lines:[0.5,1.5,2.5,3.5,4.5,5.5,6.5], value:r=>num(r.hits)+num(r.runs)+num(r.rbi), heavyTail:true },
  { key:"runs", lines:[0.5,1.5,2.5], value:r=>num(r.runs) },
  { key:"rbis", lines:[0.5,1.5,2.5], value:r=>num(r.rbi) },
  { key:"walks", lines:[0.5,1.5,2.5], value:r=>num(r.walks), fast:true },
  { key:"singles", lines:[0.5,1.5], value:r=>num(r.singles) },
  { key:"doubles", lines:[0.5], value:r=>num(r.doubles), rare:true },
  { key:"home_runs", lines:[0.5], value:r=>num(r.home_runs), rare:true, heavyTail:true },
  { key:"stolen_bases", lines:[0.5], value:r=>num(r.stolen_bases), rare:true, heavyTail:true },
  { key:"hitter_strikeouts", lines:[0.5,1.5,2.5], value:r=>num(r.strikeouts), fast:true }
];
const PITCHER_PROPS = [
  { key:"pitcher_strikeouts", lines:[2.5,3.0,3.5,4.5,5.0,5.5,6.5,7.5,8.5,9.5], value:r=>num(r.strikeouts), fast:true, heavyTail:true },
  { key:"pitcher_outs", lines:[12.5,14.5,15.5,16.5,17.5], value:r=>num(r.outs_recorded), volume:true },
  { key:"pitches_thrown", lines:[84.5,89.5,94.5,95.5,100.5], value:r=>num(r.pitches), volume:true },
  { key:"earned_runs", lines:[0.5,1.5,2.5,3.5,4.5,5.5,6.5], value:r=>num(r.earned_runs), noisy:true },
  { key:"hits_allowed", lines:[3.5,4.5,5.5,6.5,7.5,9.5], value:r=>num(r.hits_allowed), noisy:true },
  { key:"walks_allowed", lines:[0.5,1.5,2.5,4.5], value:r=>num(r.walks_allowed), fast:true }
];
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function calcRate(rows, prop, line, side) {
  let hit = 0, miss = 0, push = 0;
  for (const r of rows) {
    const v = prop.value(r);
    if (v > line) { if (side === "more") hit++; else miss++; }
    else if (v < line) { if (side === "less") hit++; else miss++; }
    else push++;
  }
  const nonPush = hit + miss;
  return { hit, miss, push, non_push_sample: nonPush, rate_0_100: nonPush ? (hit * 100 / nonPush) : null };
}

function sampleProfile(games) {
  if (games < 3) return "TINY_SAMPLE";
  if (games < 10) return "LOW_SAMPLE";
  if (games < 25) return "MEDIUM_SAMPLE";
  return "ESTABLISHED_SAMPLE";
}
function dragForSample(profile) {
  if (profile === "TINY_SAMPLE") return "STRONG";
  if (profile === "LOW_SAMPLE") return "MODERATE";
  if (profile === "MEDIUM_SAMPLE") return "LIGHT";
  return "NONE";
}
function sampleTarget(prop) {
  if (prop.fast) return 12;
  if (prop.volume) return 10;
  if (prop.rare || prop.heavyTail) return 25;
  if (prop.noisy) return 18;
  return 15;
}
function priorStrength(profile, prop) {
  const target = sampleTarget(prop);
  if (profile === "TINY_SAMPLE") return target;
  if (profile === "LOW_SAMPLE") return Math.round(target * 0.65);
  if (profile === "MEDIUM_SAMPLE") return Math.round(target * 0.35);
  return Math.round(target * 0.15);
}
function confidenceFromSample(games, profile, prop, volatility) {
  const target = sampleTarget(prop);
  let base = clamp((games / target) * 72, 12, 88);
  if (profile === "TINY_SAMPLE") base -= 22;
  else if (profile === "LOW_SAMPLE") base -= 12;
  else if (profile === "MEDIUM_SAMPLE") base -= 4;
  if (volatility === "VOLATILITY_EXTREME") base -= 14;
  else if (volatility === "VOLATILITY_STRONG") base -= 9;
  else if (volatility === "VOLATILITY_MODERATE") base -= 5;
  return round(clamp(base, 5, 92), 1);
}

function volatilityProfile(values, prop) {
  const n = values.length;
  if (!n) return { profile:"VOLATILITY_UNKNOWN", zero_rate:0, boom_rate:0, max_value:0, avg_value:0 };
  let zero = 0, boom = 0, max = 0, sum = 0;
  const boomCut = prop.key === "pitcher_strikeouts" ? 7 : (prop.key === "home_runs" || prop.key === "stolen_bases" ? 1 : 4);
  for (const v0 of values) {
    const v = Number(v0 || 0);
    if (v === 0) zero++;
    if (v >= boomCut) boom++;
    if (v > max) max = v;
    sum += v;
  }
  const zr = zero / n;
  const br = boom / n;
  let profile = "VOLATILITY_NONE";
  if ((zr >= 0.60 && br >= 0.15) || (prop.key === "pitcher_strikeouts" && br >= 0.30 && zr >= 0.20)) profile = "VOLATILITY_EXTREME";
  else if ((zr >= 0.50 && br >= 0.12) || (prop.key === "pitcher_strikeouts" && br >= 0.20 && zr >= 0.20)) profile = "VOLATILITY_STRONG";
  else if ((zr >= 0.40 && br >= 0.08) || (prop.key === "pitcher_strikeouts" && br >= 0.15 && zr >= 0.15)) profile = "VOLATILITY_MODERATE";
  else if (zr >= 0.30 || br >= 0.08) profile = "VOLATILITY_LIGHT";
  return { profile, zero_rate: pct(zr), boom_rate: pct(br), max_value:max, avg_value: round(sum / n, 2), boom_cutoff: boomCut };
}

function lineDifficulty(prop, line, roleProfile) {
  if (prop.key === "pitcher_strikeouts" && line >= 8.5) return "EXTREME_LINE_DIFFICULTY";
  if (prop.key === "total_bases" && line >= 4.5) return "EXTREME_LINE_DIFFICULTY";
  if (prop.key === "hits_runs_rbis" && line >= 5.5) return "EXTREME_LINE_DIFFICULTY";
  if ((prop.key === "home_runs" || prop.key === "stolen_bases") && line >= 0.5) return "RARE_EVENT_LINE";
  if (prop.key === "pitcher_outs" && roleProfile !== "STARTER_PROFILE" && line >= 12.5) return "ROLE_SENSITIVE_VOLUME_LINE";
  if (prop.key === "pitches_thrown" && roleProfile !== "STARTER_PROFILE") return "ROLE_SENSITIVE_VOLUME_LINE";
  return "NORMAL_LINE";
}

function pickSanityProfile({playerType, games, sampleProf, usageProfile, roleProfile, volatility, prop, maxLineDifficulty}) {
  if (volatility === "VOLATILITY_EXTREME" || volatility === "VOLATILITY_STRONG") return "EXTREME_HEAVY_TAIL_VOLATILITY_PLAYER";
  if (maxLineDifficulty === "EXTREME_LINE_DIFFICULTY" || maxLineDifficulty === "RARE_EVENT_LINE") return "EXTREME_LINE_DIFFICULTY";
  if (playerType === "pitcher") {
    if (roleProfile === "PITCHER_TINY_SAMPLE") return "ROOKIE_LIMITED_SAMPLE";
    if (roleProfile === "BULK_OR_MULTI_INNING_PROFILE") return "BULK_FOLLOWER_PROFILE";
    if (roleProfile === "RELIEF_SHORT_PROFILE") return "OPENER_PROFILE";
    if (roleProfile === "STARTER_PROFILE" && games < 10) return "LOW_SAMPLE_STARTER";
    if (roleProfile === "STARTER_PROFILE") return "STABLE_STARTER";
  }
  if (sampleProf === "TINY_SAMPLE" || sampleProf === "LOW_SAMPLE") return "ROOKIE_LIMITED_SAMPLE";
  if (usageProfile === "LOW_USAGE_HITTER") return "LOW_USAGE_HITTER";
  return "ESTABLISHED_REGULAR";
}

function derivePitcherRole(profile) {
  const games = profile.games;
  if (games < 3) return "PITCHER_TINY_SAMPLE";
  const rate12 = games ? profile.games12 / games : 0;
  const rate60 = games ? profile.games60 / games : 0;
  if (rate12 >= 0.60 || rate60 >= 0.60 || profile.avg_outs >= 12 || profile.avg_pitches >= 60) return "STARTER_PROFILE";
  if ((profile.avg_outs >= 4 && profile.avg_outs <= 11) || (profile.avg_pitches >= 25 && profile.avg_pitches <= 59)) return "BULK_OR_MULTI_INNING_PROFILE";
  return "RELIEF_SHORT_PROFILE";
}

function assignTiers(profiles, scoreFn, prefix) {
  const eligible = profiles.filter(p => p.games >= 5).sort((a,b) => scoreFn(b) - scoreFn(a));
  const n = eligible.length || 1;
  for (let i = 0; i < eligible.length; i++) eligible[i].tier = `${prefix}_${Math.floor(i * 5 / n) + 1}`;
  for (const p of profiles) if (!p.tier) p.tier = `${prefix}_TINY_SAMPLE`;
}

function indexRowsByPlayer(rows, playerIdKey = "player_id") {
  const map = new Map();
  for (const r of rows) {
    const id = String(r[playerIdKey]);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(r);
  }
  return map;
}

async function ensureSchema(env) {
  const db = env.SCORE_DB;
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_sanity_batches (
    batch_id TEXT PRIMARY KEY,
    request_id TEXT,
    run_id TEXT,
    mode TEXT,
    status TEXT,
    worker_version TEXT,
    started_at TEXT,
    finished_at TEXT,
    hitter_players INTEGER DEFAULT 0,
    pitcher_players INTEGER DEFAULT 0,
    rows_staged INTEGER DEFAULT 0,
    rows_promoted INTEGER DEFAULT 0,
    issue_rows INTEGER DEFAULT 0,
    certification TEXT,
    certification_grade TEXT,
    output_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  const ddl = `(baseline_row_id TEXT PRIMARY KEY, batch_id TEXT, player_type TEXT, player_id INTEGER, player_name TEXT,
    canonical_prop_key TEXT, role_profile TEXT, prior_pool_key TEXT, sanity_profile_key TEXT, sample_profile TEXT,
    usage_profile TEXT, line_difficulty_profile TEXT, volatility_profile TEXT, baseline_drag_profile TEXT,
    confidence_drag_profile TEXT, variance_profile TEXT, games_sample INTEGER, events_sample INTEGER,
    baseline_confidence_0_100 REAL, line_baseline_json TEXT, distribution_shape_json TEXT, notes_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`;
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_sanity_stage ${ddl}`);
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_sanity_current ${ddl}`);
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_sanity_history ${ddl.replace('updated_at TEXT DEFAULT CURRENT_TIMESTAMP)', 'updated_at TEXT DEFAULT CURRENT_TIMESTAMP, archived_at TEXT DEFAULT CURRENT_TIMESTAMP)')}`);
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_sanity_issues (
    issue_id TEXT PRIMARY KEY, batch_id TEXT, severity TEXT, issue_code TEXT, issue_message TEXT, issue_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pbs_current_player_prop ON player_baseline_sanity_current(player_type, player_id, canonical_prop_key)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pbs_current_profile ON player_baseline_sanity_current(sanity_profile_key, role_profile, volatility_profile)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pbs_history_batch ON player_baseline_sanity_history(batch_id)`);

  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_hp_batches (
    batch_id TEXT PRIMARY KEY,
    request_id TEXT,
    run_id TEXT,
    mode TEXT,
    status TEXT,
    worker_version TEXT,
    source_sanity_batch_id TEXT,
    started_at TEXT,
    finished_at TEXT,
    source_rows_read INTEGER DEFAULT 0,
    rows_staged INTEGER DEFAULT 0,
    rows_promoted INTEGER DEFAULT 0,
    history_rows INTEGER DEFAULT 0,
    issue_rows INTEGER DEFAULT 0,
    certification TEXT,
    certification_grade TEXT,
    output_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  const hpDdl = `(baseline_hp_row_id TEXT PRIMARY KEY, batch_id TEXT, source_sanity_batch_id TEXT, source_baseline_row_id TEXT,
    player_type TEXT, player_id INTEGER, player_name TEXT, canonical_prop_key TEXT, prop_family TEXT,
    line_value REAL, selected_side TEXT, baseline_hp_0_100 REAL, hp_adjustment_0_100 REAL DEFAULT 0,
    raw_rate_0_100 REAL, tier_prior_rate_0_100 REAL, raw_prior_gap_0_100 REAL,
    baseline_confidence_0_100 REAL, baseline_enriched_confidence_0_100 REAL,
    consistency_bonus_0_100 REAL, soft_uncertainty_reserve_0_100 REAL,
    sample_profile TEXT, role_profile TEXT, sanity_profile_key TEXT, volatility_profile TEXT, variance_profile TEXT,
    line_difficulty_profile TEXT, baseline_hp_profile_key TEXT,
    non_push_sample INTEGER, hit_count INTEGER, miss_count INTEGER, push_count INTEGER, prior_strength REAL,
    formula_version TEXT, confidence_formula_version TEXT,
    no_daily_context INTEGER DEFAULT 1, no_market_context INTEGER DEFAULT 1, no_scoring_context INTEGER DEFAULT 1,
    profile_notes_json TEXT, source_snapshot_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`;
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_hp_stage ${hpDdl}`);
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_hp_current ${hpDdl}`);
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_hp_history ${hpDdl.replace('updated_at TEXT DEFAULT CURRENT_TIMESTAMP)', 'updated_at TEXT DEFAULT CURRENT_TIMESTAMP, archived_at TEXT DEFAULT CURRENT_TIMESTAMP)')}`);
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_hp_issues (
    issue_id TEXT PRIMARY KEY, batch_id TEXT, source_baseline_row_id TEXT, severity TEXT, issue_code TEXT, issue_message TEXT, issue_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pbhp_current_player_prop_line ON player_baseline_hp_current(player_type, player_id, canonical_prop_key, line_value, selected_side)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pbhp_current_profile ON player_baseline_hp_current(prop_family, baseline_hp_profile_key, sample_profile, line_difficulty_profile)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pbhp_stage_batch_row ON player_baseline_hp_stage(batch_id, baseline_hp_row_id)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pbhp_history_batch ON player_baseline_hp_history(batch_id)`);
}

async function fetchPaged(db, sql, pageSize = 5000) {
  let out = [];
  for (let offset = 0; ; offset += pageSize) {
    const rows = await all(db, `${sql} LIMIT ${pageSize} OFFSET ${offset}`);
    out = out.concat(rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

function buildPlayerProfiles(hitterRows, pitcherRows) {
  const hitterByPlayer = indexRowsByPlayer(hitterRows);
  const hitterProfiles = [];
  for (const [id, rows] of hitterByPlayer) {
    const games = rows.length;
    const sums = rows.reduce((a,r)=>{ a.pa+=num(r.pa); a.hits+=num(r.hits); a.tb+=num(r.total_bases); a.hrr+=num(r.hits)+num(r.runs)+num(r.rbi); return a; }, {pa:0,hits:0,tb:0,hrr:0});
    const avgPa = games ? sums.pa/games : 0;
    const name = rows.find(r => r.player_name)?.player_name || null;
    hitterProfiles.push({ player_id:Number(id), player_name:name, games, avg_pa:avgPa, hits_pg:sums.hits/games, tb_pg:sums.tb/games, hrr_pg:sums.hrr/games, usage_profile: avgPa < 2.25 ? "LOW_USAGE_HITTER" : (avgPa < 3.25 ? "MEDIUM_USAGE_HITTER" : "REGULAR_USAGE_HITTER") });
  }
  assignTiers(hitterProfiles, p => (p.games*.15)+(p.avg_pa*8)+(p.hits_pg*18)+(p.tb_pg*10)+(p.hrr_pg*6), "HITTER_TIER");

  const pitcherByPlayer = indexRowsByPlayer(pitcherRows);
  const pitcherProfiles = [];
  for (const [id, rows] of pitcherByPlayer) {
    const games = rows.length;
    const name = rows.find(r => r.player_name)?.player_name || null;
    const games12 = rows.filter(r=>num(r.outs_recorded)>=12).length;
    const games60 = rows.filter(r=>num(r.pitches)>=60).length;
    const sums = rows.reduce((a,r)=>{ a.outs+=num(r.outs_recorded); a.k+=num(r.strikeouts); a.pitches+=num(r.pitches); a.bf+=num(r.batters_faced); return a; }, {outs:0,k:0,pitches:0,bf:0});
    const p = { player_id:Number(id), player_name:name, games, games12, games60, avg_outs:sums.outs/games, avg_k:sums.k/games, avg_pitches:sums.pitches/games, avg_bf:sums.bf/games };
    p.role_profile = derivePitcherRole(p);
    pitcherProfiles.push(p);
  }
  const starters = pitcherProfiles.filter(p => p.role_profile === "STARTER_PROFILE");
  assignTiers(starters, p => (p.games*.15)+(p.avg_outs*2)+(p.avg_k*9)+(p.avg_pitches*.35)+(p.avg_bf*.8), "PITCHER_STARTER_PROFILE_TIER");
  for (const p of pitcherProfiles) if (!p.tier) p.tier = p.role_profile;
  return { hitterProfiles, pitcherProfiles, hitterByPlayer, pitcherByPlayer };
}

function buildPriorRates(playerProfiles, byPlayer, props, playerType) {
  const pools = new Map();
  for (const p of playerProfiles) {
    const poolKey = p.tier || p.role_profile || "UNKNOWN_PRIOR_POOL";
    const rows = byPlayer.get(String(p.player_id)) || [];
    if (!pools.has(poolKey)) pools.set(poolKey, []);
    pools.get(poolKey).push(...rows);
  }
  const prior = new Map();
  for (const [poolKey, rows] of pools) {
    for (const prop of props) {
      for (const line of prop.lines) {
        for (const side of ["more","less"]) {
          const r = calcRate(rows, prop, line, side);
          prior.set(`${poolKey}|${prop.key}|${line}|${side}`, r.rate_0_100);
        }
      }
    }
  }
  return prior;
}

function makeBaselineRows({profiles, byPlayer, props, priorRates, playerType, batchId}) {
  const out = [];
  for (const p of profiles) {
    const playerRows = byPlayer.get(String(p.player_id)) || [];
    const sampleProf = sampleProfile(p.games);
    const roleProfile = playerType === "pitcher" ? p.role_profile : "HITTER_PROFILE";
    const usageProfile = playerType === "pitcher" ? roleProfile : p.usage_profile;
    const priorPool = p.tier || roleProfile || "UNKNOWN_PRIOR_POOL";
    for (const prop of props) {
      const values = playerRows.map(r => prop.value(r));
      const v = volatilityProfile(values, prop);
      let maxDiff = "NORMAL_LINE";
      for (const line of prop.lines) {
        const d = lineDifficulty(prop, line, roleProfile);
        if (d === "EXTREME_LINE_DIFFICULTY") maxDiff = d;
        else if (maxDiff === "NORMAL_LINE" && d !== "NORMAL_LINE") maxDiff = d;
      }
      const sanity = pickSanityProfile({playerType, games:p.games, sampleProf, usageProfile, roleProfile, volatility:v.profile, prop, maxLineDifficulty:maxDiff});
      const baselineDrag = dragForSample(sampleProf);
      const confidenceDrag = v.profile === "VOLATILITY_EXTREME" || v.profile === "VOLATILITY_STRONG" ? "MODERATE" : baselineDrag;
      const variance = v.profile === "VOLATILITY_EXTREME" || v.profile === "VOLATILITY_STRONG" ? "HIGH_VARIANCE" : (v.profile === "VOLATILITY_MODERATE" ? "MEDIUM_VARIANCE" : "NORMAL_VARIANCE");
      const lines = [];
      let totalNonPush = 0;
      for (const line of prop.lines) {
        const lineObj = { line_value: line, line_difficulty_profile: lineDifficulty(prop, line, roleProfile) };
        for (const side of ["more","less"]) {
          const raw = calcRate(playerRows, prop, line, side);
          const prior = priorRates.get(`${priorPool}|${prop.key}|${line}|${side}`);
          const ps = priorStrength(sampleProf, prop);
          const baseline = raw.rate_0_100 == null && prior == null ? null : (
            raw.rate_0_100 == null ? prior : (prior == null ? raw.rate_0_100 : ((raw.rate_0_100 * raw.non_push_sample) + (prior * ps)) / (raw.non_push_sample + ps))
          );
          lineObj[side] = {
            raw_rate_0_100: raw.rate_0_100 == null ? null : round(raw.rate_0_100, 2),
            tier_prior_rate_0_100: prior == null ? null : round(prior, 2),
            baseline_pre_context_0_100: baseline == null ? null : round(baseline, 2),
            hit_count: raw.hit,
            miss_count: raw.miss,
            push_count: raw.push,
            non_push_sample: raw.non_push_sample,
            prior_strength: ps,
            formula: "history_only_empirical_bayes_skeleton_not_final_weight"
          };
          totalNonPush += raw.non_push_sample;
        }
        lines.push(lineObj);
      }
      const confidence = confidenceFromSample(p.games, sampleProf, prop, v.profile);
      out.push({
        baseline_row_id: `${batchId}_${playerType}_${p.player_id}_${prop.key}`,
        batch_id: batchId,
        player_type: playerType,
        player_id: p.player_id,
        player_name: p.player_name || null,
        canonical_prop_key: prop.key,
        role_profile: roleProfile,
        prior_pool_key: priorPool,
        sanity_profile_key: sanity,
        sample_profile: sampleProf,
        usage_profile: usageProfile,
        line_difficulty_profile: maxDiff,
        volatility_profile: v.profile,
        baseline_drag_profile: baselineDrag,
        confidence_drag_profile: confidenceDrag,
        variance_profile: variance,
        games_sample: p.games,
        events_sample: totalNonPush,
        baseline_confidence_0_100: confidence,
        line_baseline_json: safeJson(lines),
        distribution_shape_json: safeJson(v),
        notes_json: safeJson({
          layer: "history_only_layer_1",
          no_daily_live_context: true,
          no_market_context: true,
          row_granularity: "player_prop_with_all_configured_line_variations_in_json",
          player_profile: playerType === "pitcher" ? { games:p.games, games12:p.games12, games60:p.games60, avg_outs:round(p.avg_outs,2), avg_pitches:round(p.avg_pitches,2), avg_bf:round(p.avg_bf,2) } : { games:p.games, avg_pa:round(p.avg_pa,2), hits_pg:round(p.hits_pg,2), tb_pg:round(p.tb_pg,2), hrr_pg:round(p.hrr_pg,2) }
        })
      });
    }
  }
  return out;
}

async function insertStageRows(env, rows) {
  const db = env.SCORE_DB;
  const cols = [
    "baseline_row_id","batch_id","player_type","player_id","player_name","canonical_prop_key","role_profile","prior_pool_key",
    "sanity_profile_key","sample_profile","usage_profile","line_difficulty_profile","volatility_profile","baseline_drag_profile",
    "confidence_drag_profile","variance_profile","games_sample","events_sample","baseline_confidence_0_100","line_baseline_json",
    "distribution_shape_json","notes_json"
  ];
  const batchSize = Math.max(10, Math.min(25, Number(env.BASELINE_SANITY_INSERT_BATCH_SIZE || 25)));
  const sql = `INSERT OR REPLACE INTO player_baseline_sanity_stage (${cols.join(",")},created_at,updated_at) VALUES (${cols.map(() => "?").join(",")},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`;
  const stmts = rows.map(r => db.prepare(sql).bind(
    r.baseline_row_id,r.batch_id,r.player_type,r.player_id,r.player_name,r.canonical_prop_key,r.role_profile,r.prior_pool_key,
    r.sanity_profile_key,r.sample_profile,r.usage_profile,r.line_difficulty_profile,r.volatility_profile,r.baseline_drag_profile,
    r.confidence_drag_profile,r.variance_profile,r.games_sample,r.events_sample,r.baseline_confidence_0_100,r.line_baseline_json,
    r.distribution_shape_json,r.notes_json
  ));
  await batch(db, stmts, batchSize);
}

async function countRows(db, table, whereSql = "", ...binds) {
  const row = await first(db, `SELECT COUNT(*) AS n FROM ${table} ${whereSql}`, ...binds);
  return Number(row && row.n || 0);
}

async function historyChunkIds(env, batchId, lastRowId, limit) {
  return await all(env.SCORE_DB,
    "SELECT baseline_row_id FROM player_baseline_sanity_stage WHERE batch_id=? AND baseline_row_id > ? ORDER BY baseline_row_id LIMIT ?",
    batchId, String(lastRowId || ""), Number(limit || 500));
}

function progressOutput(base, extra = {}) {
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    logical_worker_name: LOGICAL_WORKER_NAME,
    deployed_worker_slot: WORKER_NAME,
    job_key: JOB_KEY,
    history_only: true,
    no_daily_live_context: true,
    no_market_context: true,
    no_external_api_calls: true,
    no_scoring: true,
    no_final_board: true,
    no_prepared_board_mutation: true,
    ...base,
    ...extra
  };
}

function makeContinuationInput(input, patch) {
  return {
    ...input,
    ...patch,
    mode: patch.next_mode || patch.mode || input.mode || "stage_hitters_chunk",
    continuation_from_worker: WORKER_NAME,
    continuation_updated_at: nowUtc()
  };
}

async function loadAllProfiles(env) {
  const hitterRows = await fetchPaged(env.STATS_HITTER_DB, `SELECT player_id, game_pk, pa, hits, singles, doubles, triples, home_runs, runs, rbi, walks, strikeouts, stolen_bases, total_bases FROM hitter_game_logs`);
  const pitcherRows = await fetchPaged(env.STATS_PITCHER_DB, `SELECT player_id, player_name, game_pk, outs_recorded, batters_faced, hits_allowed, earned_runs, walks_allowed, strikeouts, pitches FROM pitcher_game_logs`);
  const built = buildPlayerProfiles(hitterRows, pitcherRows);
  const hitterPrior = buildPriorRates(built.hitterProfiles, built.hitterByPlayer, HITTER_PROPS, "hitter");
  const pitcherPrior = buildPriorRates(built.pitcherProfiles, built.pitcherByPlayer, PITCHER_PROPS, "pitcher");
  return { ...built, hitterRows, pitcherRows, hitterPrior, pitcherPrior };
}

async function updateBatchProgress(env, batchId, fields = {}) {
  const stageRows = await countRows(env.SCORE_DB, "player_baseline_sanity_stage", "WHERE batch_id=?", batchId);
  const issueRows = await countRows(env.SCORE_DB, "player_baseline_sanity_issues", "WHERE batch_id=?", batchId);
  const outputJson = fields.output_json || null;
  await run(env.SCORE_DB,
    `UPDATE player_baseline_sanity_batches
     SET rows_staged=?, issue_rows=?, output_json=COALESCE(?, output_json), updated_at=CURRENT_TIMESTAMP
     WHERE batch_id=?`,
    stageRows, issueRows, outputJson, batchId);
  return { stageRows, issueRows };
}


const BASELINE_HP_STAGE_CHUNK_ROWS = 80;
const BASELINE_HP_HISTORY_CHUNK_ROWS = 750;
const BASELINE_HP_INSERT_BATCH_SIZE = 25;
const BASELINE_HP_CONFIDENCE_FORMULA_VERSION = "baseline_hp_confidence_v0.1.6_anchor_only_soft_profile";
const BASELINE_HP_FORMULA_VERSION = "baseline_hp_v0.1.6_exact_layer1_side_line_anchor_no_hard_clamp";

function isBaselineHpMode(mode) {
  return [
    "baseline_hp_begin",
    "baseline_hp_stage_chunk",
    "baseline_hp_promote_current",
    "baseline_hp_write_history_chunk",
    "baseline_hp_finalize",
    "history_only_baseline_hp_enrichment",
    "player_baseline_hp_enrichment"
  ].includes(String(mode || ""));
}

function normalizeBaselineHpMode(mode) {
  const m = String(mode || "baseline_hp_begin");
  if (m === "history_only_baseline_hp_enrichment" || m === "player_baseline_hp_enrichment") return "baseline_hp_begin";
  return m;
}

function propFamilyForBaselineHp(propKey) {
  const k = String(propKey || "");
  if (k === "hits" || k === "singles") return "CONTACT_STANDARD";
  if (k === "doubles") return "CONTACT_EXTRA_BASE";
  if (k === "total_bases" || k === "hits_runs_rbis") return "COMPOSITE_BATTING";
  if (k === "home_runs") return "RARE_POWER";
  if (k === "stolen_bases") return "RARE_SPEED";
  if (k === "runs" || k === "rbis") return "CONTEXT_COUNTING";
  if (k === "walks" || k === "hitter_strikeouts") return "PLATE_DISCIPLINE";
  if (k === "pitcher_strikeouts") return "PITCHER_STRIKEOUT";
  if (k === "pitcher_outs" || k === "pitches_thrown" || k === "batters_faced") return "PITCHER_VOLUME";
  if (k === "hits_allowed" || k === "earned_runs" || k === "runs_allowed") return "PITCHER_DAMAGE_ALLOWED";
  if (k === "walks_allowed") return "PITCHER_COMMAND_ALLOWED";
  if (k === "rfi_nrfi") return "TEAM_GAME_EVENT_DEFERRED";
  if (k === "fantasy" || k === "fantasy_score") return "FANTASY_DERIVED_DEFERRED";
  return "UNKNOWN_PROP_FAMILY";
}

function parseJsonArraySafe(text) {
  try {
    const v = JSON.parse(String(text || "[]"));
    return Array.isArray(v) ? v : [];
  } catch (_) {
    return [];
  }
}

function lineReserveForBaselineHp(lineDifficulty) {
  if (lineDifficulty === "RARE_EVENT_LINE") return 3;
  if (lineDifficulty === "EXTREME_LINE_DIFFICULTY") return 2;
  if (lineDifficulty === "ROLE_SENSITIVE_VOLUME_LINE") return 3;
  return 0;
}

function roleReserveForBaselineHp(roleProfile) {
  if (roleProfile === "ROLE_TRANSITION_PITCHER") return 5;
  if (roleProfile === "OPENER_PROFILE" || roleProfile === "RELIEF_SHORT_PROFILE" || roleProfile === "PITCHER_TINY_SAMPLE") return 4;
  if (roleProfile === "BULK_OR_MULTI_INNING_PROFILE") return 3;
  return 0;
}

function consistencyBonusForBaselineHp(rawPriorGap, sampleProfile) {
  const gap = Number(rawPriorGap || 0);
  let bonus = 0;
  if (gap <= 5) bonus = 4;
  else if (gap <= 10) bonus = 2;
  if (sampleProfile === "TINY_SAMPLE") return 0;
  if (sampleProfile === "LOW_SAMPLE") return Math.min(bonus, 2);
  return bonus;
}

function confidenceReserveForBaselineHp({ rawPriorGap, nonPushSample, varianceProfile, lineDifficultyProfile, roleProfile }) {
  let reserve = 0;
  const gap = Number(rawPriorGap || 0);
  const n = Number(nonPushSample || 0);
  if (gap > 30 && n >= 20) reserve += 3;
  if (varianceProfile === "HIGH_VARIANCE") reserve += 2;
  reserve += lineReserveForBaselineHp(lineDifficultyProfile);
  reserve += roleReserveForBaselineHp(roleProfile);
  return Math.min(reserve, 6);
}

function baselineHpProfileKey({ propFamily, selectedSide, lineDifficultyProfile, sampleProfile, roleProfile, varianceProfile }) {
  return ["BASELINE_HP", propFamily, selectedSide, lineDifficultyProfile, sampleProfile, roleProfile, varianceProfile]
    .map(v => String(v || "UNKNOWN").toUpperCase())
    .join("|");
}

function buildBaselineHpRowsFromSanityRow(sourceRow, batchId) {
  const out = { rows: [], issues: [] };
  const propFamily = propFamilyForBaselineHp(sourceRow.canonical_prop_key);
  if (propFamily.endsWith("_DEFERRED") || propFamily === "UNKNOWN_PROP_FAMILY") {
    out.issues.push({
      source_baseline_row_id: sourceRow.baseline_row_id,
      severity: "WARN",
      issue_code: "BASELINE_HP_DEFERRED_OR_UNKNOWN_PROP",
      issue_message: `Baseline HP v1 deferred unsupported prop ${sourceRow.canonical_prop_key}`,
      issue_json: { canonical_prop_key: sourceRow.canonical_prop_key, prop_family: propFamily }
    });
    return out;
  }
  const lines = parseJsonArraySafe(sourceRow.line_baseline_json);
  if (!lines.length) {
    out.issues.push({
      source_baseline_row_id: sourceRow.baseline_row_id,
      severity: "WARN",
      issue_code: "BASELINE_HP_EMPTY_LINE_BASELINE_JSON",
      issue_message: "Layer 1 line_baseline_json was empty or malformed; row preserved as issue, no HP row emitted.",
      issue_json: { baseline_row_id: sourceRow.baseline_row_id, player_id: sourceRow.player_id, canonical_prop_key: sourceRow.canonical_prop_key }
    });
    return out;
  }
  for (const line of lines) {
    const lineValue = Number(line && line.line_value);
    if (!Number.isFinite(lineValue)) continue;
    const lineDifficultyProfile = String((line && line.line_difficulty_profile) || sourceRow.line_difficulty_profile || "NORMAL_LINE");
    for (const selectedSide of ["more", "less"]) {
      const side = line && line[selectedSide] && typeof line[selectedSide] === "object" ? line[selectedSide] : null;
      if (!side) {
        out.issues.push({
          source_baseline_row_id: sourceRow.baseline_row_id,
          severity: "WARN",
          issue_code: "BASELINE_HP_MISSING_SIDE_PAYLOAD",
          issue_message: `Layer 1 line payload missing ${selectedSide} side; row preserved as issue, no HP row emitted for that side.`,
          issue_json: { baseline_row_id: sourceRow.baseline_row_id, line_value: lineValue, selected_side: selectedSide }
        });
        continue;
      }
      const baselineHp = Number(side.baseline_pre_context_0_100);
      const rawRate = Number(side.raw_rate_0_100);
      const tierPriorRate = Number(side.tier_prior_rate_0_100);
      const nonPushSample = Number(side.non_push_sample || 0);
      if (!Number.isFinite(baselineHp)) {
        out.issues.push({
          source_baseline_row_id: sourceRow.baseline_row_id,
          severity: "WARN",
          issue_code: "BASELINE_HP_MISSING_BASELINE_VALUE",
          issue_message: "Layer 1 side payload missing baseline_pre_context_0_100; row preserved as issue, no HP row emitted for that side.",
          issue_json: { baseline_row_id: sourceRow.baseline_row_id, line_value: lineValue, selected_side: selectedSide }
        });
        continue;
      }
      const rawPriorGap = Number.isFinite(rawRate) && Number.isFinite(tierPriorRate) ? Math.abs(rawRate - tierPriorRate) : 0;
      const consistencyBonus = consistencyBonusForBaselineHp(rawPriorGap, sourceRow.sample_profile);
      const reserve = confidenceReserveForBaselineHp({
        rawPriorGap,
        nonPushSample,
        varianceProfile: sourceRow.variance_profile,
        lineDifficultyProfile,
        roleProfile: sourceRow.role_profile
      });
      const baselineConf = Number(sourceRow.baseline_confidence_0_100 || 0);
      const enrichedConf = round(clamp(baselineConf + consistencyBonus - reserve, 5, 92), 1);
      const profileKey = baselineHpProfileKey({
        propFamily,
        selectedSide,
        lineDifficultyProfile,
        sampleProfile: sourceRow.sample_profile,
        roleProfile: sourceRow.role_profile,
        varianceProfile: sourceRow.variance_profile
      });
      const lineToken = String(lineValue).replace(/[^0-9A-Za-z]+/g, "_");
      out.rows.push({
        baseline_hp_row_id: `baseline_hp_${batchId}_${sourceRow.baseline_row_id}_${lineToken}_${selectedSide}`,
        batch_id: batchId,
        source_sanity_batch_id: sourceRow.batch_id,
        source_baseline_row_id: sourceRow.baseline_row_id,
        player_type: sourceRow.player_type,
        player_id: Number(sourceRow.player_id),
        player_name: sourceRow.player_name || null,
        canonical_prop_key: sourceRow.canonical_prop_key,
        prop_family: propFamily,
        line_value: lineValue,
        selected_side: selectedSide,
        baseline_hp_0_100: round(clamp(baselineHp, 0, 100), 2),
        hp_adjustment_0_100: 0,
        raw_rate_0_100: Number.isFinite(rawRate) ? round(rawRate, 2) : null,
        tier_prior_rate_0_100: Number.isFinite(tierPriorRate) ? round(tierPriorRate, 2) : null,
        raw_prior_gap_0_100: round(rawPriorGap, 2),
        baseline_confidence_0_100: round(baselineConf, 1),
        baseline_enriched_confidence_0_100: enrichedConf,
        consistency_bonus_0_100: round(consistencyBonus, 1),
        soft_uncertainty_reserve_0_100: round(reserve, 1),
        sample_profile: sourceRow.sample_profile,
        role_profile: sourceRow.role_profile,
        sanity_profile_key: sourceRow.sanity_profile_key,
        volatility_profile: sourceRow.volatility_profile,
        variance_profile: sourceRow.variance_profile,
        line_difficulty_profile: lineDifficultyProfile,
        baseline_hp_profile_key: profileKey,
        non_push_sample: nonPushSample,
        hit_count: Number(side.hit_count || 0),
        miss_count: Number(side.miss_count || 0),
        push_count: Number(side.push_count || 0),
        prior_strength: Number(side.prior_strength || 0),
        formula_version: BASELINE_HP_FORMULA_VERSION,
        confidence_formula_version: BASELINE_HP_CONFIDENCE_FORMULA_VERSION,
        no_daily_context: 1,
        no_market_context: 1,
        no_scoring_context: 1,
        profile_notes_json: safeJson({
          hp_anchor: "exact_layer1_line_side_baseline_pre_context_0_100",
          hp_adjustment_0_100: 0,
          no_old_hp_blend: true,
          no_profile_shape_adjustment_v1: true,
          no_daily_live_context: true,
          no_market_context: true,
          no_scoring_context: true,
          consistency_bonus_rule: "gap<=5:+4; gap<=10:+2; low_sample bonus capped at +2; tiny_sample +0",
          reserve_rule: "soft reserves only; reserve capped at 6; no direct low/tiny sample penalty",
          rare_event_policy: "preserve high LESS HP and low MORE HP; confidence carries volatility metadata"
        }),
        source_snapshot_json: safeJson({
          source_baseline_row_id: sourceRow.baseline_row_id,
          source_sanity_batch_id: sourceRow.batch_id,
          baseline_confidence_0_100: sourceRow.baseline_confidence_0_100,
          raw_rate_0_100: side.raw_rate_0_100,
          tier_prior_rate_0_100: side.tier_prior_rate_0_100,
          baseline_pre_context_0_100: side.baseline_pre_context_0_100,
          line_payload_formula: side.formula || null,
          push_count: side.push_count || 0
        })
      });
    }
  }
  return out;
}

const BASELINE_HP_COLS = [
  "baseline_hp_row_id","batch_id","source_sanity_batch_id","source_baseline_row_id","player_type","player_id","player_name",
  "canonical_prop_key","prop_family","line_value","selected_side","baseline_hp_0_100","hp_adjustment_0_100",
  "raw_rate_0_100","tier_prior_rate_0_100","raw_prior_gap_0_100","baseline_confidence_0_100","baseline_enriched_confidence_0_100",
  "consistency_bonus_0_100","soft_uncertainty_reserve_0_100","sample_profile","role_profile","sanity_profile_key",
  "volatility_profile","variance_profile","line_difficulty_profile","baseline_hp_profile_key","non_push_sample","hit_count","miss_count","push_count","prior_strength",
  "formula_version","confidence_formula_version","no_daily_context","no_market_context","no_scoring_context","profile_notes_json","source_snapshot_json"
];

function baselineHpValues(r) { return BASELINE_HP_COLS.map(c => r[c] === undefined ? null : r[c]); }

async function insertBaselineHpStageRows(env, rows) {
  if (!rows.length) return;
  const sql = `INSERT OR REPLACE INTO player_baseline_hp_stage (${BASELINE_HP_COLS.join(",")},created_at,updated_at) VALUES (${BASELINE_HP_COLS.map(()=>"?").join(",")},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`;
  const stmts = rows.map(r => env.SCORE_DB.prepare(sql).bind(...baselineHpValues(r)));
  await batch(env.SCORE_DB, stmts, BASELINE_HP_INSERT_BATCH_SIZE);
}

async function insertBaselineHpIssues(env, batchId, issues) {
  if (!issues.length) return;
  const sql = `INSERT OR REPLACE INTO player_baseline_hp_issues (issue_id,batch_id,source_baseline_row_id,severity,issue_code,issue_message,issue_json,created_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`;
  const stmts = issues.map(x => env.SCORE_DB.prepare(sql).bind(
    rid("baseline_hp_issue"), batchId, x.source_baseline_row_id || null, x.severity || "WARN", x.issue_code || "BASELINE_HP_ISSUE", String(x.issue_message || "").slice(0, 900), safeJson(x.issue_json || x)
  ));
  await batch(env.SCORE_DB, stmts, BASELINE_HP_INSERT_BATCH_SIZE);
}

async function latestSourceSanityBatchId(env) {
  const row = await first(env.SCORE_DB,
    `SELECT batch_id, COUNT(*) AS rows
     FROM player_baseline_sanity_current
     GROUP BY batch_id
     ORDER BY rows DESC, batch_id DESC
     LIMIT 1`);
  return row ? String(row.batch_id || "") : "";
}

async function baselineHpHistoryChunkIds(env, batchId, lastRowId, limit) {
  return await all(env.SCORE_DB,
    "SELECT baseline_hp_row_id FROM player_baseline_hp_stage WHERE batch_id=? AND baseline_hp_row_id > ? ORDER BY baseline_hp_row_id LIMIT ?",
    batchId, String(lastRowId || ""), Number(limit || BASELINE_HP_HISTORY_CHUNK_ROWS));
}

async function updateBaselineHpBatchProgress(env, batchId, fields = {}) {
  const stageRows = await countRows(env.SCORE_DB, "player_baseline_hp_stage", "WHERE batch_id=?", batchId);
  const issueRows = await countRows(env.SCORE_DB, "player_baseline_hp_issues", "WHERE batch_id=?", batchId);
  const outputJson = fields.output_json || null;
  await run(env.SCORE_DB,
    `UPDATE player_baseline_hp_batches
     SET rows_staged=?, issue_rows=?, output_json=COALESCE(?, output_json), updated_at=CURRENT_TIMESTAMP
     WHERE batch_id=?`,
    stageRows, issueRows, outputJson, batchId);
  return { stageRows, issueRows };
}

async function runBaselineHp(env, input = {}) {
  const requestId = input.request_id || rid("player_baseline_hp");
  const runId = input.run_id || rid("run_player_baseline_hp");
  const mode = normalizeBaselineHpMode(input.mode || input.next_mode || "baseline_hp_begin");
  let batchId = input.batch_id || null;
  const cooldownSeconds = Math.max(0, Math.min(5, Number(input.run_after_delay_seconds ?? 1)));
  await ensureSchema(env);

  try {
    if (mode === "baseline_hp_begin" || !batchId) {
      batchId = input.batch_id || rid("player_baseline_hp_batch");
      const sourceSanityBatchId = input.source_sanity_batch_id || await latestSourceSanityBatchId(env);
      const sourceRows = await countRows(env.SCORE_DB, "player_baseline_sanity_current");
      const staleOutput = { ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, status:"PLAYER_BASELINE_HP_STALE_RUNNING_CLEANED", cleaned_at:nowUtc() };
      await run(env.SCORE_DB,
        "UPDATE player_baseline_hp_batches SET status='failed_stale', finished_at=CURRENT_TIMESTAMP, certification='PLAYER_BASELINE_HP_STALE_RUNNING_CLEANED', certification_grade='FAIL_STALE', output_json=COALESCE(output_json, ?), updated_at=CURRENT_TIMESTAMP WHERE status='running' AND finished_at IS NULL AND COALESCE(request_id,'') <> ?",
        safeJson(staleOutput), requestId);
      await run(env.SCORE_DB, "DELETE FROM player_baseline_hp_stage WHERE batch_id=?", batchId);
      await run(env.SCORE_DB, "DELETE FROM player_baseline_hp_issues WHERE batch_id=?", batchId);
      await run(env.SCORE_DB, `INSERT OR REPLACE INTO player_baseline_hp_batches (batch_id, request_id, run_id, mode, status, worker_version, source_sanity_batch_id, source_rows_read, started_at, created_at, updated_at)
        VALUES (?, ?, ?, 'history_only_baseline_hp_enrichment', 'running', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        batchId, requestId, runId, VERSION, sourceSanityBatchId, sourceRows);
      const nextInput = makeContinuationInput(input, { batch_id:batchId, source_sanity_batch_id:sourceSanityBatchId, next_mode:"baseline_hp_stage_chunk", last_baseline_row_id:"" });
      const output = progressOutput({ request_id:requestId, run_id:runId, batch_id:batchId, mode, status:"PARTIAL_CONTINUE_BASELINE_HP_INIT", certification:"PLAYER_BASELINE_HP_INIT_READY", certification_grade:"PARTIAL", continuation_required:true, next_mode:"baseline_hp_stage_chunk", next_input:nextInput, run_after_delay_seconds:cooldownSeconds, source_sanity_batch_id:sourceSanityBatchId, source_sanity_rows:sourceRows, baseline_hp_owner:"alphadog-v2-player-baseline-sanity", scorer_worker_role:"future_consumer_only" });
      await updateBaselineHpBatchProgress(env, batchId, { output_json: safeJson(output) });
      return output;
    }

    if (mode === "baseline_hp_stage_chunk") {
      const lastBaselineRowId = String(input.last_baseline_row_id || "");
      const chunkLimit = Math.max(20, Math.min(Number(input.source_chunk_rows || BASELINE_HP_STAGE_CHUNK_ROWS), 160));
      const sourceRows = await all(env.SCORE_DB,
        `SELECT * FROM player_baseline_sanity_current
         WHERE baseline_row_id > ?
         ORDER BY baseline_row_id
         LIMIT ?`,
        lastBaselineRowId, chunkLimit);
      let hpRows = [];
      let issues = [];
      for (const r of sourceRows) {
        const built = buildBaselineHpRowsFromSanityRow(r, batchId);
        hpRows = hpRows.concat(built.rows);
        issues = issues.concat(built.issues);
      }
      await insertBaselineHpStageRows(env, hpRows);
      await insertBaselineHpIssues(env, batchId, issues);
      const nextLast = sourceRows.length ? String(sourceRows[sourceRows.length - 1].baseline_row_id || lastBaselineRowId) : lastBaselineRowId;
      const moreRows = sourceRows.length >= chunkLimit;
      const progress = await updateBaselineHpBatchProgress(env, batchId);
      if (moreRows) {
        const nextInput = makeContinuationInput(input, { batch_id:batchId, next_mode:"baseline_hp_stage_chunk", last_baseline_row_id:nextLast, source_chunk_rows:chunkLimit });
        const output = progressOutput({ request_id:requestId, run_id:runId, batch_id:batchId, mode, status:"PARTIAL_CONTINUE_BASELINE_HP_STAGE_CHUNK", certification:"PLAYER_BASELINE_HP_STAGE_CHUNK_WRITTEN", certification_grade:"PARTIAL", continuation_required:true, next_mode:"baseline_hp_stage_chunk", next_input:nextInput, run_after_delay_seconds:cooldownSeconds, source_rows_processed_this_chunk:sourceRows.length, rows_written_this_chunk:hpRows.length, issue_rows_written_this_chunk:issues.length, rows_staged:progress.stageRows, issue_rows:progress.issueRows, last_baseline_row_id:nextLast, d1_chunked:true, cooldown_safe:true });
        await updateBaselineHpBatchProgress(env, batchId, { output_json: safeJson(output) });
        return output;
      }
      const nextInput = makeContinuationInput(input, { batch_id:batchId, next_mode:"baseline_hp_promote_current" });
      const output = progressOutput({ request_id:requestId, run_id:runId, batch_id:batchId, mode, status:"PARTIAL_CONTINUE_BASELINE_HP_STAGE_COMPLETE", certification:"PLAYER_BASELINE_HP_STAGE_COMPLETE", certification_grade:"PARTIAL", continuation_required:true, next_mode:"baseline_hp_promote_current", next_input:nextInput, run_after_delay_seconds:cooldownSeconds, source_rows_processed_this_chunk:sourceRows.length, rows_written_this_chunk:hpRows.length, rows_staged:progress.stageRows, issue_rows:progress.issueRows, d1_chunked:true, cooldown_safe:true });
      await updateBaselineHpBatchProgress(env, batchId, { output_json: safeJson(output) });
      return output;
    }

    if (mode === "baseline_hp_promote_current") {
      await run(env.SCORE_DB, "DELETE FROM player_baseline_hp_current");
      await run(env.SCORE_DB, `INSERT INTO player_baseline_hp_current SELECT * FROM player_baseline_hp_stage WHERE batch_id=?`, batchId);
      const promoted = await countRows(env.SCORE_DB, "player_baseline_hp_current");
      await run(env.SCORE_DB, "UPDATE player_baseline_hp_batches SET rows_promoted=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", promoted, batchId);
      const nextInput = makeContinuationInput(input, { batch_id:batchId, next_mode:"baseline_hp_write_history_chunk", last_history_row_id:"" });
      const output = progressOutput({ request_id:requestId, run_id:runId, batch_id:batchId, mode, status:"PARTIAL_CONTINUE_BASELINE_HP_CURRENT_PROMOTED", certification:"PLAYER_BASELINE_HP_CURRENT_PROMOTED", certification_grade:"PARTIAL", continuation_required:true, next_mode:"baseline_hp_write_history_chunk", next_input:nextInput, run_after_delay_seconds:cooldownSeconds, rows_promoted:promoted });
      await updateBaselineHpBatchProgress(env, batchId, { output_json: safeJson(output) });
      return output;
    }

    if (mode === "baseline_hp_write_history_chunk") {
      const stageRows = await countRows(env.SCORE_DB, "player_baseline_hp_stage", "WHERE batch_id=?", batchId);
      const currentRows = await countRows(env.SCORE_DB, "player_baseline_hp_current");
      const lastHistoryRowId = String(input.last_history_row_id || "");
      const chunkLimit = Math.max(100, Math.min(Number(input.history_chunk_size || BASELINE_HP_HISTORY_CHUNK_ROWS), 1200));
      const ids = await baselineHpHistoryChunkIds(env, batchId, lastHistoryRowId, chunkLimit);
      if (ids.length > 0) {
        const nextLast = String(ids[ids.length - 1].baseline_hp_row_id || "");
        await run(env.SCORE_DB,
          `INSERT OR REPLACE INTO player_baseline_hp_history
           SELECT *, CURRENT_TIMESTAMP AS archived_at
           FROM player_baseline_hp_stage
           WHERE batch_id=? AND baseline_hp_row_id > ? AND baseline_hp_row_id <= ?
           ORDER BY baseline_hp_row_id`,
          batchId, lastHistoryRowId, nextLast);
      }
      const historyRows = await countRows(env.SCORE_DB, "player_baseline_hp_history", "WHERE batch_id=?", batchId);
      const complete = historyRows >= stageRows && stageRows > 0 && currentRows >= stageRows;
      if (!complete) {
        const nextLast = ids.length > 0 ? String(ids[ids.length - 1].baseline_hp_row_id || lastHistoryRowId) : lastHistoryRowId;
        const nextInput = makeContinuationInput(input, { batch_id:batchId, next_mode:"baseline_hp_write_history_chunk", last_history_row_id:nextLast, history_chunk_size:chunkLimit });
        const output = progressOutput({ request_id:requestId, run_id:runId, batch_id:batchId, mode, status:"PARTIAL_CONTINUE_BASELINE_HP_HISTORY_CHUNK", certification:"PLAYER_BASELINE_HP_HISTORY_CHUNK_WRITTEN", certification_grade:"PARTIAL", continuation_required:true, next_mode:"baseline_hp_write_history_chunk", next_input:nextInput, run_after_delay_seconds:cooldownSeconds, history_rows:historyRows, stage_rows:stageRows, current_rows:currentRows, history_rows_written_this_chunk:ids.length, last_history_row_id:nextLast, cooldown_safe:true });
        await updateBaselineHpBatchProgress(env, batchId, { output_json: safeJson(output) });
        return output;
      }
      const nextInput = makeContinuationInput(input, { batch_id:batchId, next_mode:"baseline_hp_finalize" });
      const output = progressOutput({ request_id:requestId, run_id:runId, batch_id:batchId, mode, status:"PARTIAL_CONTINUE_BASELINE_HP_HISTORY_WRITTEN", certification:"PLAYER_BASELINE_HP_HISTORY_WRITTEN", certification_grade:"PARTIAL", continuation_required:true, next_mode:"baseline_hp_finalize", next_input:nextInput, run_after_delay_seconds:cooldownSeconds, history_rows:historyRows, stage_rows:stageRows, current_rows:currentRows });
      await updateBaselineHpBatchProgress(env, batchId, { output_json: safeJson(output) });
      return output;
    }

    if (mode === "baseline_hp_finalize") {
      const stageRows = await countRows(env.SCORE_DB, "player_baseline_hp_stage", "WHERE batch_id=?", batchId);
      const currentRows = await countRows(env.SCORE_DB, "player_baseline_hp_current");
      const historyRows = await countRows(env.SCORE_DB, "player_baseline_hp_history", "WHERE batch_id=?", batchId);
      const issueRows = await countRows(env.SCORE_DB, "player_baseline_hp_issues", "WHERE batch_id=?", batchId);
      const nullCritical = Number((await first(env.SCORE_DB, `SELECT COUNT(*) AS n FROM player_baseline_hp_stage WHERE batch_id=? AND (player_id IS NULL OR canonical_prop_key IS NULL OR line_value IS NULL OR selected_side IS NULL OR baseline_hp_0_100 IS NULL)`, batchId))?.n || 0);
      const adjustedRows = Number((await first(env.SCORE_DB, `SELECT COUNT(*) AS n FROM player_baseline_hp_stage WHERE batch_id=? AND COALESCE(hp_adjustment_0_100,0) <> 0`, batchId))?.n || 0);
      const familyRows = await all(env.SCORE_DB, "SELECT prop_family, selected_side, COUNT(*) AS rows FROM player_baseline_hp_stage WHERE batch_id=? GROUP BY prop_family, selected_side ORDER BY prop_family, selected_side", batchId);
      const profileRows = await all(env.SCORE_DB, "SELECT line_difficulty_profile, sample_profile, COUNT(*) AS rows, ROUND(AVG(baseline_hp_0_100),2) AS avg_baseline_hp, ROUND(AVG(baseline_enriched_confidence_0_100),2) AS avg_conf FROM player_baseline_hp_stage WHERE batch_id=? GROUP BY line_difficulty_profile, sample_profile ORDER BY rows DESC LIMIT 50", batchId);
      const grade = stageRows > 0 && currentRows >= stageRows && historyRows >= stageRows && nullCritical === 0 && adjustedRows === 0 ? "PASS" : "FAIL";
      const cert = grade === "PASS" ? "PLAYER_BASELINE_HP_CERTIFIED_HISTORY_ONLY_ANCHORED" : "PLAYER_BASELINE_HP_CERTIFICATION_FAILED";
      const output = progressOutput({ request_id:requestId, run_id:runId, batch_id:batchId, mode, status:cert, certification:cert, certification_grade:grade, continuation_required:false, rows_staged:stageRows, rows_promoted:currentRows, history_rows:historyRows, issue_rows:issueRows, null_critical_rows:nullCritical, hp_adjusted_rows:adjustedRows, family_side_summary:familyRows, profile_summary:profileRows, baseline_hp_contract:{ owner_worker:WORKER_NAME, same_worker_as_sanity:true, hp_anchor:"line_baseline_json.<side>.baseline_pre_context_0_100", hp_adjustment_v1:0, old_hp_blend:false, daily_context:false, market_context:false, scoring_context:false, confidence_only_enrichment:true, no_double_jeopardy_sample_penalty:true }, notes:["This is history-only baseline HP enrichment from Layer 1 sanity data.","HP is exact Layer 1 side+line baseline; Layer 2 only shapes confidence/profile metadata.","Low/tiny samples are not penalized again; they only limit consistency bonus and inherit Layer 1 confidence.","Scorer/HP/final-board workers consume this later; they are not mutated here."] });
      await run(env.SCORE_DB, `UPDATE player_baseline_hp_batches SET status=?, finished_at=CURRENT_TIMESTAMP, rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
        grade === "PASS" ? "completed" : "failed", stageRows, currentRows, historyRows, issueRows, cert, grade, safeJson(output), batchId);
      return output;
    }

    throw new Error(`Unsupported Baseline HP mode: ${mode}`);
  } catch (err) {
    const msg = String(err && err.message ? err.message : err).slice(0, 900);
    const output = progressOutput({ ok:false, data_ok:false, request_id:requestId, run_id:runId, batch_id:batchId, mode, status:"PLAYER_BASELINE_HP_FAILED", certification:"PLAYER_BASELINE_HP_FAILED", certification_grade:"FAIL", error:msg, timestamp_utc:nowUtc() });
    if (batchId) {
      await run(env.SCORE_DB, `UPDATE player_baseline_hp_batches SET status='failed', finished_at=CURRENT_TIMESTAMP, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
        output.certification, output.certification_grade, safeJson(output), batchId);
    }
    return output;
  }
}

async function runLayer1(env, input = {}) {
  const requestId = input.request_id || rid("player_baseline_sanity");
  const runId = input.run_id || rid("run_player_baseline_sanity");
  const modeIn = input.mode || input.next_mode || "init";
  const normalizedMode = modeIn === "history_only_layer_1_sanity_baseline" ? "init" : modeIn;
  const mode = normalizedMode === "write_history" ? "write_history_chunk" : normalizedMode;
  let batchId = input.batch_id || null;
  await ensureSchema(env);

  if (isBaselineHpMode(modeIn) || isBaselineHpMode(mode)) return await runBaselineHp(env, { ...input, mode });

  if (mode === "init" || !batchId) {
    batchId = input.batch_id || rid("player_baseline_sanity_batch");
    const staleOutput = { ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, status:"PLAYER_BASELINE_SANITY_STALE_RUNNING_CLEANED", reason:"Previous running batch had no finished_at before a new run started", cleaned_at:nowUtc() };
    await run(env.SCORE_DB,
      "UPDATE player_baseline_sanity_batches SET status='failed_stale', finished_at=CURRENT_TIMESTAMP, certification='PLAYER_BASELINE_SANITY_STALE_RUNNING_CLEANED', certification_grade='FAIL_STALE', output_json=COALESCE(output_json, ?), updated_at=CURRENT_TIMESTAMP WHERE status='running' AND finished_at IS NULL AND COALESCE(request_id,'') <> ?",
      safeJson(staleOutput), requestId);
    await run(env.SCORE_DB, "DELETE FROM player_baseline_sanity_stage WHERE batch_id IN (SELECT batch_id FROM player_baseline_sanity_batches WHERE status IN ('failed','failed_stale') AND COALESCE(rows_promoted,0)=0)");
    await run(env.SCORE_DB, `INSERT OR REPLACE INTO player_baseline_sanity_batches (batch_id, request_id, run_id, mode, status, worker_version, started_at, created_at, updated_at)
      VALUES (?, ?, ?, 'history_only_layer_1_sanity_baseline', 'running', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, batchId, requestId, runId, VERSION);
    await run(env.SCORE_DB, "DELETE FROM player_baseline_sanity_stage WHERE batch_id=?", batchId);
    const nextInput = makeContinuationInput(input, { batch_id: batchId, next_mode: "stage_hitters_chunk", last_player_id: 0 });
    const output = progressOutput({ request_id:requestId, run_id:runId, batch_id:batchId, mode:"init", status:"PARTIAL_CONTINUE_PLAYER_BASELINE_SANITY_INIT", certification:"PLAYER_BASELINE_SANITY_INIT_READY", certification_grade:"PARTIAL", continuation_required:true, next_mode:"stage_hitters_chunk", next_input:nextInput, run_after_delay_seconds:0 });
    await updateBatchProgress(env, batchId, { output_json: safeJson(output) });
    return output;
  }

  try {
    if (mode === "stage_hitters_chunk") {
      const loaded = await loadAllProfiles(env);
      const lastId = Number(input.last_player_id || 0);
      const chunkSize = Math.max(5, Math.min(15, Number(input.player_chunk_size || 15)));
      const allProfiles = loaded.hitterProfiles.slice().sort((a,b)=>a.player_id-b.player_id);
      const chunkProfiles = allProfiles.filter(p => Number(p.player_id) > lastId).slice(0, chunkSize);
      const selectedIds = new Set(chunkProfiles.map(p => Number(p.player_id)));
      const selectedByPlayer = new Map();
      for (const id of selectedIds) selectedByPlayer.set(String(id), loaded.hitterByPlayer.get(String(id)) || []);
      const rows = makeBaselineRows({ profiles:chunkProfiles, byPlayer:selectedByPlayer, props:HITTER_PROPS, priorRates:loaded.hitterPrior, playerType:"hitter", batchId });
      await insertStageRows(env, rows);
      const newLastId = chunkProfiles.length ? Number(chunkProfiles[chunkProfiles.length - 1].player_id) : lastId;
      const done = chunkProfiles.length === 0 || newLastId >= Number(allProfiles[allProfiles.length - 1]?.player_id || 0);
      const progress = await updateBatchProgress(env, batchId);
      if (!done) {
        const nextInput = makeContinuationInput(input, { batch_id:batchId, next_mode:"stage_hitters_chunk", last_player_id:newLastId });
        const output = progressOutput({ request_id:requestId, run_id:runId, batch_id:batchId, mode, status:"PARTIAL_CONTINUE_PLAYER_BASELINE_SANITY_HITTERS", certification:"PLAYER_BASELINE_SANITY_HITTER_CHUNK_WRITTEN", certification_grade:"PARTIAL", continuation_required:true, next_mode:"stage_hitters_chunk", next_input:nextInput, run_after_delay_seconds:0, players_processed_this_chunk:chunkProfiles.length, rows_written_this_chunk:rows.length, insert_batch_size:Math.max(10, Math.min(25, Number(env.BASELINE_SANITY_INSERT_BATCH_SIZE || 25))), player_chunk_size:chunkSize, d1_safe_microbatch:true, rows_staged:progress.stageRows, last_player_id:newLastId });
        await updateBatchProgress(env, batchId, { output_json: safeJson(output) });
        return output;
      }
      const nextInput = makeContinuationInput(input, { batch_id:batchId, next_mode:"stage_pitchers_chunk", last_player_id:0 });
      const output = progressOutput({ request_id:requestId, run_id:runId, batch_id:batchId, mode, status:"PARTIAL_CONTINUE_PLAYER_BASELINE_SANITY_HITTERS_COMPLETE", certification:"PLAYER_BASELINE_SANITY_HITTERS_STAGED", certification_grade:"PARTIAL", continuation_required:true, next_mode:"stage_pitchers_chunk", next_input:nextInput, run_after_delay_seconds:0, players_processed_this_chunk:chunkProfiles.length, rows_written_this_chunk:rows.length, insert_batch_size:Math.max(10, Math.min(25, Number(env.BASELINE_SANITY_INSERT_BATCH_SIZE || 25))), player_chunk_size:chunkSize, d1_safe_microbatch:true, rows_staged:progress.stageRows });
      await updateBatchProgress(env, batchId, { output_json: safeJson(output) });
      return output;
    }

    if (mode === "stage_pitchers_chunk") {
      const loaded = await loadAllProfiles(env);
      const lastId = Number(input.last_player_id || 0);
      const chunkSize = Math.max(5, Math.min(15, Number(input.player_chunk_size || 15)));
      const allProfiles = loaded.pitcherProfiles.slice().sort((a,b)=>a.player_id-b.player_id);
      const chunkProfiles = allProfiles.filter(p => Number(p.player_id) > lastId).slice(0, chunkSize);
      const selectedIds = new Set(chunkProfiles.map(p => Number(p.player_id)));
      const selectedByPlayer = new Map();
      for (const id of selectedIds) selectedByPlayer.set(String(id), loaded.pitcherByPlayer.get(String(id)) || []);
      const rows = makeBaselineRows({ profiles:chunkProfiles, byPlayer:selectedByPlayer, props:PITCHER_PROPS, priorRates:loaded.pitcherPrior, playerType:"pitcher", batchId });
      await insertStageRows(env, rows);
      const newLastId = chunkProfiles.length ? Number(chunkProfiles[chunkProfiles.length - 1].player_id) : lastId;
      const done = chunkProfiles.length === 0 || newLastId >= Number(allProfiles[allProfiles.length - 1]?.player_id || 0);
      const progress = await updateBatchProgress(env, batchId);
      if (!done) {
        const nextInput = makeContinuationInput(input, { batch_id:batchId, next_mode:"stage_pitchers_chunk", last_player_id:newLastId });
        const output = progressOutput({ request_id:requestId, run_id:runId, batch_id:batchId, mode, status:"PARTIAL_CONTINUE_PLAYER_BASELINE_SANITY_PITCHERS", certification:"PLAYER_BASELINE_SANITY_PITCHER_CHUNK_WRITTEN", certification_grade:"PARTIAL", continuation_required:true, next_mode:"stage_pitchers_chunk", next_input:nextInput, run_after_delay_seconds:0, players_processed_this_chunk:chunkProfiles.length, rows_written_this_chunk:rows.length, insert_batch_size:Math.max(10, Math.min(25, Number(env.BASELINE_SANITY_INSERT_BATCH_SIZE || 25))), player_chunk_size:chunkSize, d1_safe_microbatch:true, rows_staged:progress.stageRows, last_player_id:newLastId });
        await updateBatchProgress(env, batchId, { output_json: safeJson(output) });
        return output;
      }
      const nextInput = makeContinuationInput(input, { batch_id:batchId, next_mode:"promote_current" });
      const output = progressOutput({ request_id:requestId, run_id:runId, batch_id:batchId, mode, status:"PARTIAL_CONTINUE_PLAYER_BASELINE_SANITY_PITCHERS_COMPLETE", certification:"PLAYER_BASELINE_SANITY_PITCHERS_STAGED", certification_grade:"PARTIAL", continuation_required:true, next_mode:"promote_current", next_input:nextInput, run_after_delay_seconds:0, players_processed_this_chunk:chunkProfiles.length, rows_written_this_chunk:rows.length, insert_batch_size:Math.max(10, Math.min(25, Number(env.BASELINE_SANITY_INSERT_BATCH_SIZE || 25))), player_chunk_size:chunkSize, d1_safe_microbatch:true, rows_staged:progress.stageRows });
      await updateBatchProgress(env, batchId, { output_json: safeJson(output) });
      return output;
    }

    if (mode === "promote_current") {
      await run(env.SCORE_DB, "DELETE FROM player_baseline_sanity_current");
      await run(env.SCORE_DB, `INSERT INTO player_baseline_sanity_current SELECT * FROM player_baseline_sanity_stage WHERE batch_id=?`, batchId);
      const promoted = await countRows(env.SCORE_DB, "player_baseline_sanity_current");
      await run(env.SCORE_DB, "UPDATE player_baseline_sanity_batches SET rows_promoted=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", promoted, batchId);
      const nextInput = makeContinuationInput(input, { batch_id:batchId, next_mode:"write_history_chunk", last_history_row_id:"" });
      const output = progressOutput({ request_id:requestId, run_id:runId, batch_id:batchId, mode, status:"PARTIAL_CONTINUE_PLAYER_BASELINE_SANITY_CURRENT_PROMOTED", certification:"PLAYER_BASELINE_SANITY_CURRENT_PROMOTED", certification_grade:"PARTIAL", continuation_required:true, next_mode:"write_history_chunk", next_input:nextInput, run_after_delay_seconds:0, rows_promoted:promoted });
      await updateBatchProgress(env, batchId, { output_json: safeJson(output) });
      return output;
    }

    if (mode === "write_history_chunk") {
      const stageRows = await countRows(env.SCORE_DB, "player_baseline_sanity_stage", "WHERE batch_id=?", batchId);
      const currentRows = await countRows(env.SCORE_DB, "player_baseline_sanity_current");
      const lastHistoryRowId = String(input.last_history_row_id || "");
      const chunkLimit = Math.max(100, Math.min(Number(input.history_chunk_size || 500), 1000));
      const ids = await historyChunkIds(env, batchId, lastHistoryRowId, chunkLimit);
      if (ids.length > 0) {
        const nextLast = String(ids[ids.length - 1].baseline_row_id || "");
        await run(env.SCORE_DB,
          `INSERT OR REPLACE INTO player_baseline_sanity_history
           SELECT *, CURRENT_TIMESTAMP AS archived_at
           FROM player_baseline_sanity_stage
           WHERE batch_id=? AND baseline_row_id > ? AND baseline_row_id <= ?
           ORDER BY baseline_row_id`,
          batchId, lastHistoryRowId, nextLast);
      }
      const historyRows = await countRows(env.SCORE_DB, "player_baseline_sanity_history", "WHERE batch_id=?", batchId);
      const complete = historyRows >= stageRows && stageRows > 0 && currentRows >= stageRows;
      if (!complete) {
        const nextLast = ids.length > 0 ? String(ids[ids.length - 1].baseline_row_id || lastHistoryRowId) : lastHistoryRowId;
        const nextInput = makeContinuationInput(input, { batch_id:batchId, next_mode:"write_history_chunk", last_history_row_id:nextLast, history_chunk_size:chunkLimit });
        const output = progressOutput({ request_id:requestId, run_id:runId, batch_id:batchId, mode, status:"PARTIAL_CONTINUE_PLAYER_BASELINE_SANITY_HISTORY_CHUNK_WRITTEN", certification:"PLAYER_BASELINE_SANITY_HISTORY_CHUNK_WRITTEN", certification_grade:"PARTIAL", continuation_required:true, next_mode:"write_history_chunk", next_input:nextInput, run_after_delay_seconds:0, history_rows:historyRows, stage_rows:stageRows, current_rows:currentRows, last_history_row_id:nextLast, history_rows_written_this_chunk:ids.length });
        await updateBatchProgress(env, batchId, { output_json: safeJson(output) });
        return output;
      }
      const nextInput = makeContinuationInput(input, { batch_id:batchId, next_mode:"finalize" });
      const output = progressOutput({ request_id:requestId, run_id:runId, batch_id:batchId, mode, status:"PARTIAL_CONTINUE_PLAYER_BASELINE_SANITY_HISTORY_WRITTEN", certification:"PLAYER_BASELINE_SANITY_HISTORY_WRITTEN", certification_grade:"PARTIAL", continuation_required:true, next_mode:"finalize", next_input:nextInput, run_after_delay_seconds:0, history_rows:historyRows, stage_rows:stageRows, current_rows:currentRows });
      await updateBatchProgress(env, batchId, { output_json: safeJson(output) });
      return output;
    }

    if (mode === "finalize") {
      const stageRows = await countRows(env.SCORE_DB, "player_baseline_sanity_stage", "WHERE batch_id=?", batchId);
      const currentRows = await countRows(env.SCORE_DB, "player_baseline_sanity_current");
      const historyRows = await countRows(env.SCORE_DB, "player_baseline_sanity_history", "WHERE batch_id=?", batchId);
      const hitterPlayers = Number((await first(env.SCORE_DB, "SELECT COUNT(DISTINCT player_id) AS n FROM player_baseline_sanity_stage WHERE batch_id=? AND player_type='hitter'", batchId))?.n || 0);
      const pitcherPlayers = Number((await first(env.SCORE_DB, "SELECT COUNT(DISTINCT player_id) AS n FROM player_baseline_sanity_stage WHERE batch_id=? AND player_type='pitcher'", batchId))?.n || 0);
      const roleRows = await all(env.SCORE_DB, "SELECT role_profile, COUNT(*) AS rows FROM player_baseline_sanity_stage WHERE batch_id=? GROUP BY role_profile ORDER BY rows DESC", batchId);
      const sanityRows = await all(env.SCORE_DB, "SELECT sanity_profile_key, COUNT(*) AS rows FROM player_baseline_sanity_stage WHERE batch_id=? GROUP BY sanity_profile_key ORDER BY rows DESC", batchId);
      const volatilityRows = await all(env.SCORE_DB, "SELECT volatility_profile, COUNT(*) AS rows FROM player_baseline_sanity_stage WHERE batch_id=? GROUP BY volatility_profile ORDER BY rows DESC", batchId);
      const output = progressOutput({ request_id:requestId, run_id:runId, batch_id:batchId, mode, status:"PLAYER_BASELINE_SANITY_CERTIFIED_HISTORY_ONLY_BASELINE_WRITTEN", certification:"PLAYER_BASELINE_SANITY_CERTIFIED_HISTORY_ONLY_BASELINE_WRITTEN", certification_grade:"PASS", continuation_required:false, hitter_players:hitterPlayers, pitcher_players:pitcherPlayers, rows_staged:stageRows, rows_promoted:currentRows, history_rows:historyRows, role_summary:roleRows, sanity_profile_summary:sanityRows, volatility_summary:volatilityRows, notes:["Layer 1 is history-only. Daily/live data is intentionally excluded and belongs to later enrichment layers.","Rows are player+prop records with configured line/side variations inside line_baseline_json.","No rows are cut. Low sample becomes shrinkage/confidence/variance metadata, not automatic HP punishment."] });
      await run(env.SCORE_DB, `UPDATE player_baseline_sanity_batches SET status='completed', finished_at=CURRENT_TIMESTAMP, hitter_players=?, pitcher_players=?, rows_staged=?, rows_promoted=?, issue_rows=0, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
        hitterPlayers, pitcherPlayers, stageRows, currentRows, output.certification, output.certification_grade, safeJson(output), batchId);
      return output;
    }

    throw new Error(`Unsupported Player Baseline Sanity mode: ${mode}`);
  } catch (err) {
    const msg = String(err && err.message ? err.message : err).slice(0, 900);
    const output = progressOutput({ ok:false, data_ok:false, request_id:requestId, run_id:runId, batch_id:batchId, mode, status:"PLAYER_BASELINE_SANITY_FAILED", certification:"PLAYER_BASELINE_SANITY_FAILED", certification_grade:"FAIL", error:msg, timestamp_utc:nowUtc() });
    await run(env.SCORE_DB, `UPDATE player_baseline_sanity_batches SET status='failed', finished_at=CURRENT_TIMESTAMP, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
      output.certification, output.certification_grade, safeJson(output), batchId);
    return output;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();
    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));
    if (method === "GET" && path === "/health") return jsonResponse({...baseIdentity(env), route:"/health"});
    if (method === "POST" && path === "/diagnostic") return jsonResponse({...baseIdentity(env), route:"/diagnostic", input_echo_safe: await readJsonSafe(request)});
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try { return jsonResponse(await runLayer1(env, input)); }
      catch (err) {
        return jsonResponse({ ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, logical_worker_name:LOGICAL_WORKER_NAME, job_key:JOB_KEY, status:"PLAYER_BASELINE_SANITY_FAILED", error:String(err && err.message ? err.message : err), timestamp_utc:nowUtc() }, 500);
      }
    }
    return jsonResponse({ ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, status:"NOT_FOUND", allowed_routes:["GET /", "GET /health", "POST /diagnostic", "POST /run"] }, 404);
  }
};
