const WORKER_NAME = "alphadog-v2-phase2b-pitcher-role";
const LOGICAL_WORKER_NAME = "alphadog-v2-player-baseline-sanity";
const VERSION = "alphadog-v2-phase2b-pitcher-role-v0.1.1-d1-microchunk-batch-finalizer";
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
    hitterProfiles.push({ player_id:Number(id), player_name:null, games, avg_pa:avgPa, hits_pg:sums.hits/games, tb_pg:sums.tb/games, hrr_pg:sums.hrr/games, usage_profile: avgPa < 2.25 ? "LOW_USAGE_HITTER" : (avgPa < 3.25 ? "MEDIUM_USAGE_HITTER" : "REGULAR_USAGE_HITTER") });
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
  const chunkSize = 4;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => `(${cols.map(() => "?").join(",")},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).join(",");
    const sql = `INSERT INTO player_baseline_sanity_stage (${cols.join(",")},created_at,updated_at) VALUES ${placeholders}`;
    const binds = [];
    for (const r of chunk) {
      binds.push(
        r.baseline_row_id,r.batch_id,r.player_type,r.player_id,r.player_name,r.canonical_prop_key,r.role_profile,r.prior_pool_key,
        r.sanity_profile_key,r.sample_profile,r.usage_profile,r.line_difficulty_profile,r.volatility_profile,r.baseline_drag_profile,
        r.confidence_drag_profile,r.variance_profile,r.games_sample,r.events_sample,r.baseline_confidence_0_100,r.line_baseline_json,
        r.distribution_shape_json,r.notes_json
      );
    }
    await db.prepare(sql).bind(...binds).run();
  }
}

async function runLayer1(env, input = {}) {
  const requestId = input.request_id || rid("player_baseline_sanity");
  const runId = input.run_id || rid("run_player_baseline_sanity");
  const batchId = input.batch_id || rid("player_baseline_sanity_batch");
  await ensureSchema(env);
  const staleOutput = { ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, status:"PLAYER_BASELINE_SANITY_STALE_RUNNING_CLEANED", reason:"Previous running batch had no finished_at before a new run started" };
  await run(env.SCORE_DB,
    "UPDATE player_baseline_sanity_batches SET status='failed_stale', finished_at=CURRENT_TIMESTAMP, certification='PLAYER_BASELINE_SANITY_STALE_RUNNING_CLEANED', certification_grade='FAIL_STALE', output_json=COALESCE(output_json, ?), updated_at=CURRENT_TIMESTAMP WHERE status='running' AND finished_at IS NULL",
    safeJson(staleOutput));
  await run(env.SCORE_DB, `INSERT INTO player_baseline_sanity_batches (batch_id, request_id, run_id, mode, status, worker_version, started_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'running', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, batchId, requestId, runId, input.mode || "history_only_layer_1_sanity_baseline", VERSION);
  await run(env.SCORE_DB, "DELETE FROM player_baseline_sanity_stage WHERE batch_id=?", batchId);

  try {
  const hitterRows = await fetchPaged(env.STATS_HITTER_DB, `SELECT player_id, game_pk, pa, hits, singles, doubles, triples, home_runs, runs, rbi, walks, strikeouts, stolen_bases, total_bases FROM hitter_game_logs`);
  const pitcherRows = await fetchPaged(env.STATS_PITCHER_DB, `SELECT player_id, player_name, game_pk, outs_recorded, batters_faced, hits_allowed, earned_runs, walks_allowed, strikeouts, pitches FROM pitcher_game_logs`);
  const { hitterProfiles, pitcherProfiles, hitterByPlayer, pitcherByPlayer } = buildPlayerProfiles(hitterRows, pitcherRows);
  const hitterPrior = buildPriorRates(hitterProfiles, hitterByPlayer, HITTER_PROPS, "hitter");
  const pitcherPrior = buildPriorRates(pitcherProfiles, pitcherByPlayer, PITCHER_PROPS, "pitcher");
  const hitterBaselineRows = makeBaselineRows({ profiles:hitterProfiles, byPlayer:hitterByPlayer, props:HITTER_PROPS, priorRates:hitterPrior, playerType:"hitter", batchId });
  const pitcherBaselineRows = makeBaselineRows({ profiles:pitcherProfiles, byPlayer:pitcherByPlayer, props:PITCHER_PROPS, priorRates:pitcherPrior, playerType:"pitcher", batchId });
  const rows = hitterBaselineRows.concat(pitcherBaselineRows);
  await insertStageRows(env, rows);
  await run(env.SCORE_DB, "DELETE FROM player_baseline_sanity_current");
  await run(env.SCORE_DB, `INSERT INTO player_baseline_sanity_current SELECT * FROM player_baseline_sanity_stage WHERE batch_id=?`, batchId);
  await run(env.SCORE_DB, `INSERT INTO player_baseline_sanity_history SELECT *, CURRENT_TIMESTAMP AS archived_at FROM player_baseline_sanity_stage WHERE batch_id=?`, batchId);

  const roleSummary = pitcherProfiles.reduce((a,p)=>{ a[p.role_profile]=(a[p.role_profile]||0)+1; return a; }, {});
  const sanitySummary = rows.reduce((a,r)=>{ a[r.sanity_profile_key]=(a[r.sanity_profile_key]||0)+1; return a; }, {});
  const volatilitySummary = rows.reduce((a,r)=>{ a[r.volatility_profile]=(a[r.volatility_profile]||0)+1; return a; }, {});
  const output = {
    ok:true,
    data_ok:true,
    version:VERSION,
    worker_name:WORKER_NAME,
    logical_worker_name:LOGICAL_WORKER_NAME,
    deployed_worker_slot:WORKER_NAME,
    job_key:JOB_KEY,
    request_id:requestId,
    run_id:runId,
    batch_id:batchId,
    mode:input.mode || "history_only_layer_1_sanity_baseline",
    status:"PLAYER_BASELINE_SANITY_CERTIFIED_HISTORY_ONLY_BASELINE_WRITTEN",
    certification:"PLAYER_BASELINE_SANITY_CERTIFIED_HISTORY_ONLY_BASELINE_WRITTEN",
    certification_grade:"PASS",
    hitter_players:hitterProfiles.length,
    pitcher_players:pitcherProfiles.length,
    hitter_log_rows_read:hitterRows.length,
    pitcher_log_rows_read:pitcherRows.length,
    rows_staged:rows.length,
    rows_written:rows.length,
    rows_promoted:rows.length,
    role_summary:roleSummary,
    sanity_profile_summary:sanitySummary,
    volatility_summary:volatilitySummary,
    history_only:true,
    no_daily_live_context:true,
    no_market_context:true,
    no_external_api_calls:true,
    no_scoring:true,
    no_final_board:true,
    no_prepared_board_mutation:true,
    layer_1_modules:["historical_sanity_classification","history_based_baseline_calculation"],
    notes:[
      "Layer 1 is history-only. Daily/live data is intentionally excluded and belongs to later enrichment layers.",
      "Rows are player+prop records with all configured line/side variations inside line_baseline_json.",
      "Formula is a skeleton empirical-Bayes blend: raw player rate + prior pool rate. Weights are transparent placeholders for calibration, not final locked probability weights.",
      "No rows are cut. Low sample becomes shrinkage/confidence/variance metadata, not automatic HP punishment."
    ]
  };
  await run(env.SCORE_DB, `UPDATE player_baseline_sanity_batches SET status='completed', finished_at=CURRENT_TIMESTAMP, hitter_players=?, pitcher_players=?, rows_staged=?, rows_promoted=?, issue_rows=0, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    hitterProfiles.length, pitcherProfiles.length, rows.length, rows.length, output.certification, output.certification_grade, safeJson(output), batchId);
  return output;
  } catch (err) {
    const msg = String(err && err.message ? err.message : err).slice(0, 900);
    const output = {
      ok:false,
      data_ok:false,
      version:VERSION,
      worker_name:WORKER_NAME,
      logical_worker_name:LOGICAL_WORKER_NAME,
      deployed_worker_slot:WORKER_NAME,
      job_key:JOB_KEY,
      request_id:requestId,
      run_id:runId,
      batch_id:batchId,
      mode:input.mode || "history_only_layer_1_sanity_baseline",
      status:"PLAYER_BASELINE_SANITY_FAILED",
      certification:"PLAYER_BASELINE_SANITY_FAILED",
      certification_grade:"FAIL",
      error:msg,
      history_only:true,
      no_daily_live_context:true,
      no_market_context:true,
      no_external_api_calls:true,
      no_scoring:true,
      no_final_board:true,
      no_prepared_board_mutation:true,
      timestamp_utc:nowUtc()
    };
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
