const WORKER_NAME = "alphadog-v2-static-certifier";
const VERSION = "alphadog-v2-static-certifier-v0.1.0-read-only-static-layer-certification";
const JOB_KEY = "static-certifier";

function nowUtc() { return new Date().toISOString(); }

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

async function all(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  const res = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
  return res.results || [];
}

async function first(db, sql, ...binds) {
  const rows = await all(db, sql, ...binds);
  return rows[0] || null;
}

async function readJsonSafe(request) {
  try { return await request.json(); } catch (_) { return {}; }
}

function n(row, key = "c") {
  return Number(row && row[key] !== undefined && row[key] !== null ? row[key] : 0);
}

function passCheck(name, passed, counts = {}, details = {}) {
  return { name, pass: !!passed, counts, details };
}

async function tableExists(db, tableName) {
  try {
    const row = await first(db, "SELECT name FROM sqlite_master WHERE type='table' AND name=?", tableName);
    return !!row;
  } catch (err) {
    return false;
  }
}

async function tableCount(db, tableName) {
  if (!(await tableExists(db, tableName))) return 0;
  const row = await first(db, `SELECT COUNT(*) AS c FROM ${tableName}`);
  return n(row);
}

async function runCheck(name, fn) {
  try {
    return await fn();
  } catch (err) {
    return passCheck(name, false, {}, { error: String(err && err.message ? err.message : err) });
  }
}

async function certify(env, input = {}) {
  const started = Date.now();
  const checks = {};

  checks.teams = await runCheck("Teams", async () => {
    const counts = await first(env.REF_DB, `SELECT
      COUNT(*) AS active_rows,
      COUNT(DISTINCT team_id) AS distinct_team_ids,
      COUNT(DISTINCT mlb_team_id) AS distinct_mlb_team_ids,
      SUM(CASE WHEN team_id IS NULL OR team_id='' OR mlb_team_id IS NULL OR abbreviation IS NULL OR abbreviation='' OR full_name IS NULL OR full_name='' THEN 1 ELSE 0 END) AS missing_core
      FROM ref_teams WHERE active=1`);
    const pass = n(counts, "active_rows") === 30 && n(counts, "distinct_team_ids") === 30 && n(counts, "distinct_mlb_team_ids") === 30 && n(counts, "missing_core") === 0;
    return passCheck("Teams", pass, counts, { expected_active_mlb_teams: 30 });
  });

  checks.team_aliases = await runCheck("Team aliases", async () => {
    const counts = await first(env.REF_DB, `SELECT
      COUNT(*) AS active_rows,
      COUNT(DISTINCT team_id) AS teams_with_aliases,
      SUM(CASE WHEN alias_key IS NULL OR alias_key='' OR team_id IS NULL OR team_id='' OR alias_value IS NULL OR alias_value='' OR alias_normalized IS NULL OR alias_normalized='' THEN 1 ELSE 0 END) AS missing_core
      FROM ref_team_aliases WHERE active=1`);
    const dup = await first(env.REF_DB, `SELECT COUNT(*) AS c FROM (
      SELECT alias_normalized, COUNT(*) AS row_count, COUNT(DISTINCT team_id) AS team_count
      FROM ref_team_aliases WHERE active=1 GROUP BY alias_normalized HAVING row_count > 1 AND team_count > 1
    )`);
    const pass = n(counts, "active_rows") >= 177 && n(counts, "teams_with_aliases") === 30 && n(counts, "missing_core") === 0 && n(dup) === 0;
    return passCheck("Team aliases", pass, { ...counts, dangerous_duplicate_aliases: n(dup) }, { expected_active_alias_rows_minimum: 177, expected_team_coverage: 30 });
  });

  checks.stadiums = await runCheck("Stadiums", async () => {
    const counts = await first(env.REF_DB, `SELECT
      COUNT(*) AS active_rows,
      COUNT(DISTINCT team_id) AS distinct_teams,
      COUNT(DISTINCT mlb_venue_id) AS distinct_venues,
      SUM(CASE WHEN stadium_id IS NULL OR stadium_id='' OR team_id IS NULL OR team_id='' OR mlb_venue_id IS NULL OR stadium_name IS NULL OR stadium_name='' OR city IS NULL OR city='' OR state IS NULL OR state='' THEN 1 ELSE 0 END) AS missing_core,
      SUM(CASE WHEN timezone IS NULL OR timezone='' OR roof_type IS NULL OR roof_type='' OR turf_type IS NULL OR turf_type='' OR lower(timezone)='unknown' OR lower(roof_type)='unknown' OR lower(turf_type)='unknown' THEN 1 ELSE 0 END) AS missing_unknown_timezone_roof_surface
      FROM ref_stadiums WHERE active=1`);
    const pass = n(counts, "active_rows") === 30 && n(counts, "distinct_teams") === 30 && n(counts, "distinct_venues") === 30 && n(counts, "missing_core") === 0 && n(counts, "missing_unknown_timezone_roof_surface") === 0;
    return passCheck("Stadiums", pass, counts, { expected_active_stadiums: 30 });
  });

  checks.stadium_aliases = await runCheck("Stadium aliases", async () => {
    const counts = await first(env.REF_DB, `SELECT
      COUNT(*) AS active_rows,
      COUNT(DISTINCT stadium_id) AS stadiums_with_aliases,
      COUNT(DISTINCT mlb_venue_id) AS venues_with_aliases,
      SUM(CASE WHEN alias_key IS NULL OR alias_key='' OR stadium_id IS NULL OR stadium_id='' OR alias_value IS NULL OR alias_value='' OR alias_normalized IS NULL OR alias_normalized='' THEN 1 ELSE 0 END) AS missing_core
      FROM ref_stadium_aliases WHERE active=1`);
    const pass = n(counts, "active_rows") >= 270 && n(counts, "stadiums_with_aliases") === 30 && n(counts, "venues_with_aliases") === 30 && n(counts, "missing_core") === 0;
    return passCheck("Stadium aliases", pass, counts, { expected_active_alias_rows_minimum: 270, expected_stadium_coverage: 30 });
  });

  checks.park_factors = await runCheck("Park factors", async () => {
    const counts = await first(env.REF_DB, `SELECT
      COUNT(*) AS active_rows,
      COUNT(DISTINCT stadium_id) AS distinct_stadiums,
      COUNT(DISTINCT team_id) AS distinct_teams,
      COUNT(DISTINCT mlb_venue_id) AS distinct_venues,
      SUM(CASE WHEN run_factor IS NULL OR hr_factor IS NULL OR lhb_run_factor IS NULL OR rhb_run_factor IS NULL OR lhb_hr_factor IS NULL OR rhb_hr_factor IS NULL THEN 1 ELSE 0 END) AS missing_factors
      FROM ref_park_factors WHERE active=1`);
    const pass = n(counts, "active_rows") === 30 && n(counts, "distinct_stadiums") === 30 && n(counts, "distinct_teams") === 30 && n(counts, "distinct_venues") === 30 && n(counts, "missing_factors") === 0;
    return passCheck("Park factors", pass, counts, { expected_active_rows: 30, source: "Baseball Savant / MLB Statcast Park Factors" });
  });

  checks.players = await runCheck("Players", async () => {
    const counts = await first(env.REF_DB, `SELECT
      COUNT(*) AS active_rows,
      COUNT(DISTINCT mlb_player_id) AS distinct_mlb_player_ids,
      COUNT(DISTINCT current_team_id) AS active_player_team_coverage,
      SUM(CASE WHEN mlb_player_id IS NULL THEN 1 ELSE 0 END) AS missing_mlb_player_id,
      SUM(CASE WHEN COALESCE(full_name, player_name, '')='' THEN 1 ELSE 0 END) AS missing_name
      FROM ref_players WHERE active=1`);
    const dup = await first(env.REF_DB, `SELECT COUNT(*) AS c FROM (
      SELECT mlb_player_id FROM ref_players WHERE active=1 AND mlb_player_id IS NOT NULL GROUP BY mlb_player_id HAVING COUNT(*) > 1
    )`);
    const pass = n(counts, "active_rows") === 1310 && n(counts, "distinct_mlb_player_ids") === 1310 && n(counts, "active_player_team_coverage") === 30 && n(counts, "missing_mlb_player_id") === 0 && n(counts, "missing_name") === 0 && n(dup) === 0;
    return passCheck("Players", pass, { ...counts, duplicate_active_mlb_player_ids: n(dup) }, { expected_active_players: 1310 });
  });

  checks.player_aliases = await runCheck("Player aliases", async () => {
    const counts = await first(env.REF_DB, `SELECT
      COUNT(*) AS active_rows,
      COUNT(DISTINCT player_id) AS players_with_active_aliases,
      SUM(CASE WHEN player_id IS NULL OR alias_name IS NULL OR alias_name='' OR alias_normalized IS NULL OR alias_normalized='' OR source_key IS NULL OR source_key='' THEN 1 ELSE 0 END) AS missing_core
      FROM ref_player_aliases WHERE active=1`);
    const uncovered = await first(env.REF_DB, `SELECT COUNT(*) AS c FROM ref_players p
      WHERE p.active=1 AND NOT EXISTS (SELECT 1 FROM ref_player_aliases a WHERE a.active=1 AND a.player_id=p.player_id)`);
    const orphan = await first(env.REF_DB, `SELECT COUNT(*) AS c FROM ref_player_aliases a
      WHERE a.active=1 AND NOT EXISTS (SELECT 1 FROM ref_players p WHERE p.active=1 AND p.player_id=a.player_id)`);
    const pass = n(counts, "active_rows") >= 6425 && n(counts, "players_with_active_aliases") === 1310 && n(counts, "missing_core") === 0 && n(uncovered) === 0 && n(orphan) === 0;
    return passCheck("Player aliases", pass, { ...counts, active_players_without_aliases: n(uncovered), active_aliases_without_active_player: n(orphan) }, { expected_active_alias_rows_minimum: 6425 });
  });

  checks.rosters = await runCheck("Rosters", async () => {
    const counts = await first(env.REF_DB, `SELECT
      COUNT(*) AS active_rows,
      COUNT(DISTINCT player_id) AS distinct_player_ids,
      COUNT(DISTINCT mlb_team_id) AS distinct_mlb_teams,
      SUM(CASE WHEN player_id IS NULL OR team_id IS NULL OR team_id='' OR mlb_team_id IS NULL OR source_key IS NULL OR source_key='' THEN 1 ELSE 0 END) AS missing_core
      FROM ref_rosters WHERE active=1`);
    const dup = await first(env.REF_DB, `SELECT COUNT(*) AS c FROM (
      SELECT player_id FROM ref_rosters WHERE active=1 AND player_id IS NOT NULL GROUP BY player_id HAVING COUNT(*) > 1
    )`);
    const pass = n(counts, "active_rows") === 1310 && n(counts, "distinct_player_ids") === 1310 && n(counts, "distinct_mlb_teams") === 30 && n(counts, "missing_core") === 0 && n(dup) === 0;
    return passCheck("Rosters", pass, { ...counts, duplicate_active_player_ids: n(dup) }, { deferred_worker: "static-rosters", satisfied_by: "alphadog-v2-static-players-v0.1.9" });
  });

  checks.static_players_stage_cleanup = await runCheck("Static Players staging cleanup", async () => {
    const playersStage = await tableCount(env.REF_DB, "ref_players_stage");
    const aliasesStage = await tableCount(env.REF_DB, "ref_player_aliases_stage");
    const rostersStage = await tableCount(env.REF_DB, "ref_rosters_stage");
    const batch = (await tableExists(env.REF_DB, "static_players_batches")) ? await first(env.REF_DB, `SELECT batch_id, status, players_staged, aliases_staged, rosters_staged, teams_covered, duplicate_mlb_ids, missing_mlb_player_id, missing_name, certification_status, promoted_at, cleaned_at
      FROM static_players_batches ORDER BY datetime(updated_at) DESC LIMIT 1`) : null;
    const batchOk = !!batch && String(batch.status || "") === "promoted" && !!batch.promoted_at && !!batch.cleaned_at && n(batch, "teams_covered") === 30 && n(batch, "duplicate_mlb_ids") === 0 && n(batch, "missing_mlb_player_id") === 0 && n(batch, "missing_name") === 0;
    const pass = playersStage === 0 && aliasesStage === 0 && rostersStage === 0 && batchOk;
    return passCheck("Static Players staging cleanup", pass, { ref_players_stage: playersStage, ref_player_aliases_stage: aliasesStage, ref_rosters_stage: rostersStage }, { latest_batch: batch });
  });

  checks.prop_taxonomy = await runCheck("Prop taxonomy", async () => {
    const counts = await first(env.CONFIG_DB, `SELECT
      COUNT(*) AS taxonomy_rows,
      SUM(CASE WHEN prop_key IS NULL OR prop_key='' OR display_name IS NULL OR display_name='' OR primary_role IS NULL OR primary_role='' THEN 1 ELSE 0 END) AS missing_core,
      SUM(CASE WHEN prop_key='triples' THEN 1 ELSE 0 END) AS triples_rows,
      SUM(CASE WHEN prop_key='pitcher_strikeouts_combo' THEN 1 ELSE 0 END) AS pitcher_strikeouts_combo_rows,
      SUM(CASE WHEN prop_key IN ('triples','pitcher_strikeouts_combo') AND COALESCE(scoring_enabled,0) <> 0 THEN 1 ELSE 0 END) AS disabled_props_scoring_enabled
      FROM config_prop_taxonomy`);
    const pass = n(counts, "taxonomy_rows") === 21 && n(counts, "missing_core") === 0 && n(counts, "triples_rows") === 1 && n(counts, "pitcher_strikeouts_combo_rows") === 1 && n(counts, "disabled_props_scoring_enabled") === 0;
    return passCheck("Prop taxonomy", pass, counts, { expected_rows: 21, triples_supported_scoring_disabled: true, pitcher_strikeouts_combo_supported_scoring_disabled: true });
  });

  checks.prop_aliases = await runCheck("Prop aliases", async () => {
    const aliasCounts = await first(env.REF_DB, `SELECT
      COUNT(*) AS prizepicks_alias_rows,
      COUNT(DISTINCT source_market_name) AS distinct_source_market_names,
      SUM(CASE WHEN alias_key IS NULL OR alias_key='' OR prop_key IS NULL OR prop_key='' OR source_key IS NULL OR source_key='' OR source_market_name IS NULL OR source_market_name='' OR normalized_market_name IS NULL OR normalized_market_name='' THEN 1 ELSE 0 END) AS missing_core
      FROM ref_prop_aliases WHERE source_key='prizepicks_github'`);
    const board = await all(env.MARKET_DB, `SELECT stat_type, COUNT(*) AS rows_count FROM prizepicks_board_current WHERE stat_type IS NOT NULL AND stat_type<>'' GROUP BY stat_type ORDER BY stat_type`);
    const aliases = await all(env.REF_DB, `SELECT source_market_name, prop_key FROM ref_prop_aliases WHERE source_key='prizepicks_github'`);
    const aliasMarkets = new Set(aliases.map(r => String(r.source_market_name || "")));
    const unmapped = board.filter(r => !aliasMarkets.has(String(r.stat_type || "")));
    const dup = await first(env.REF_DB, `SELECT COUNT(*) AS c FROM (
      SELECT source_key, normalized_market_name, COUNT(*) AS row_count, COUNT(DISTINCT prop_key) AS prop_count
      FROM ref_prop_aliases WHERE source_key='prizepicks_github'
      GROUP BY source_key, normalized_market_name HAVING row_count > 1 OR prop_count > 1
    )`);
    const pass = n(aliasCounts, "prizepicks_alias_rows") === 20 && n(aliasCounts, "distinct_source_market_names") === 20 && n(aliasCounts, "missing_core") === 0 && board.length === 20 && unmapped.length === 0 && n(dup) === 0;
    return passCheck("Prop aliases", pass, { ...aliasCounts, active_prizepicks_board_stat_types: board.length, unmapped_board_stat_types: unmapped.length, dangerous_duplicate_aliases: n(dup) }, { unmapped_board_stats: unmapped });
  });

  checks.deferred_static_rosters = passCheck("Deferred Static Rosters validation", checks.rosters.pass, {}, {
    worker: "alphadog-v2-static-rosters",
    decision: "certified_deferred",
    reason: "Static Players v0.1.9 already satisfies initial roster foundation through REF_DB.ref_rosters",
    do_not_run_in_static_full_run: true
  });

  checks.deferred_static_player_aliases = passCheck("Deferred Static Player Aliases validation", checks.player_aliases.pass, {}, {
    worker: "alphadog-v2-static-player-aliases",
    decision: "certified_deferred",
    reason: "Static Players v0.1.9 already satisfies initial alias foundation through REF_DB.ref_player_aliases",
    do_not_run_in_static_full_run: true
  });

  checks.safety = passCheck("Static certifier safety", true, { rows_written: 0, external_calls_performed: 0 }, {
    read_only_validation_only: true,
    no_reruns: true,
    no_mutations: true,
    no_source_fetches: true,
    no_promotion: true,
    no_cleanup: true,
    no_prizepicks_board_mutation: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board_writes: true,
    no_old_production_touch: true,
    no_browser_pump: true
  });

  const failed = Object.values(checks).filter(c => !c.pass);
  const fullStaticCertified = failed.length === 0;

  return {
    ok: fullStaticCertified,
    data_ok: fullStaticCertified,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: input.job_key || JOB_KEY,
    request_id: input.request_id || null,
    chain_id: input.chain_id || null,
    status: fullStaticCertified ? "completed_static_layer_certification" : "failed_static_layer_certification",
    certification: fullStaticCertified ? "STATIC_LAYER_CERTIFIED_ALL_COMPLETED_AND_DEFERRED_STATIC_FOUNDATIONS_PASS" : "STATIC_LAYER_CERTIFICATION_FAILED",
    full_static_certified: fullStaticCertified,
    rows_read: Object.keys(checks).length,
    rows_written: 0,
    external_calls_performed: 0,
    elapsed_ms: Date.now() - started,
    checks,
    failed_checks: failed.map(c => c.name),
    deferred_workers: {
      static_rosters: "certified_deferred_skipped_because_ref_rosters_foundation_is_satisfied_by_static_players_v0_1_9",
      static_player_aliases: "certified_deferred_skipped_because_ref_player_aliases_foundation_is_satisfied_by_static_players_v0_1_9"
    },
    safety_assertions: checks.safety.details,
    timestamp_utc: nowUtc()
  };
}

function baseIdentity(env) {
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "READY_READ_ONLY_STATIC_CERTIFIER",
    timestamp_utc: nowUtc(),
    bindings: {
      CONTROL_DB: !!env.CONTROL_DB,
      CONFIG_DB: !!env.CONFIG_DB,
      REF_DB: !!env.REF_DB,
      MARKET_DB: !!env.MARKET_DB
    },
    notes: [
      "STATIC > Certifier is read-only validation only.",
      "It does not rerun source workers, fetch sources, promote rows, clean staging, score, rank, or mutate board data.",
      "STATIC > Full Run is a separate orchestrator-owned chain and is not implemented inside this worker."
    ]
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "GET" && (path === "/" || path === "/health")) {
      return jsonResponse(baseIdentity(env));
    }

    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      return jsonResponse({ ...baseIdentity(env), route: "/diagnostic", input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, job_key: input.job_key || null } });
    }

    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const output = await certify(env, input);
      return jsonResponse(output, output.ok ? 200 : 200);
    }

    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
