const WORKER_NAME = "alphadog-v2-static-prop-taxonomy";
const VERSION = "alphadog-v2-static-prop-taxonomy-v0.1.0-taxonomy-alias-certifier";
const JOB_KEY = "static-prop-taxonomy";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "MARKET_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "WORKER_SAFE_MODE", "DEBUG_MODE"];

const PRIZEPICKS_SOURCE_KEY = "prizepicks_github";
const EXPECTED_TAXONOMY_COUNT = 21;
const EXPECTED_PRIZEPICKS_ALIAS_COUNT = 20;

const TAXONOMY_ADDITIONS = [
  {
    prop_key: "triples",
    display_name: "Triples",
    player_side: "hitter",
    stat_family: "batting",
    primary_role: "BATTER",
    supported_market_sources: "PrizePicks,Sleeper",
    default_line_policy: "normal",
    over_under_policy: "both",
    california_pickable: 1,
    scoring_enabled: 0,
    notes: "Triples; added because live PrizePicks board exposed Triples stat_type. Scoring disabled."
  },
  {
    prop_key: "pitcher_strikeouts_combo",
    display_name: "Pitcher Strikeouts (Combo)",
    player_side: "pitcher_combo",
    stat_family: "pitching_combo",
    primary_role: "PITCHER",
    supported_market_sources: "PrizePicks",
    default_line_policy: "source_specific_combo",
    over_under_policy: "both",
    california_pickable: 1,
    scoring_enabled: 0,
    notes: "Distinct routing key for PrizePicks Pitcher Strikeouts (Combo); not silently collapsed into normal pitcher_strikeouts. Scoring disabled."
  }
];

const PRIZEPICKS_ALIASES = [
  { source_market_name: "1st Inning Runs Allowed", prop_key: "rfi_nrfi" },
  { source_market_name: "Doubles", prop_key: "doubles" },
  { source_market_name: "Earned Runs Allowed", prop_key: "earned_runs" },
  { source_market_name: "Hits", prop_key: "hits" },
  { source_market_name: "Hits Allowed", prop_key: "hits_allowed" },
  { source_market_name: "Hits+Runs+RBIs", prop_key: "hits_runs_rbis" },
  { source_market_name: "Hitter Fantasy Score", prop_key: "fantasy_score" },
  { source_market_name: "Hitter Strikeouts", prop_key: "hitter_strikeouts" },
  { source_market_name: "Home Runs", prop_key: "home_runs" },
  { source_market_name: "Pitcher Strikeouts", prop_key: "pitcher_strikeouts" },
  { source_market_name: "Pitcher Strikeouts (Combo)", prop_key: "pitcher_strikeouts_combo" },
  { source_market_name: "Pitching Outs", prop_key: "pitcher_outs" },
  { source_market_name: "RBIs", prop_key: "rbis" },
  { source_market_name: "Runs", prop_key: "runs" },
  { source_market_name: "Singles", prop_key: "singles" },
  { source_market_name: "Stolen Bases", prop_key: "stolen_bases" },
  { source_market_name: "Total Bases", prop_key: "total_bases" },
  { source_market_name: "Triples", prop_key: "triples" },
  { source_market_name: "Walks", prop_key: "walks" },
  { source_market_name: "Walks Allowed", prop_key: "walks_allowed" }
];

function nowUtc() { return new Date().toISOString(); }
function text(value) { return String(value === undefined || value === null ? "" : value).trim(); }
function normalize(value) { return text(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " "); }
function safeId(value) { return normalize(value).replace(/\s+/g, "_").slice(0, 140); }
function aliasKey(sourceKey, sourceMarketName) { return `${safeId(sourceKey)}__${safeId(sourceMarketName)}`; }

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function bindingPresence(env, names) {
  const out = {};
  for (const name of names) out[name] = Boolean(env && env[name]);
  return out;
}

function varPresence(env, names) {
  const out = {};
  for (const name of names) out[name] = env && env[name] !== undefined && env[name] !== null && String(env[name]).length > 0;
  return out;
}

function allTrue(obj) { return Object.values(obj).every(Boolean); }

async function readJsonSafe(request) {
  try { return await request.json(); } catch { return {}; }
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

async function run(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  return binds.length ? await stmt.bind(...binds).run() : await stmt.run();
}

function baseIdentity(env, extra = {}) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars = varPresence(env, EXPECTED_VARS);
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "STATIC_PROP_TAXONOMY_WORKER_READY",
    timestamp_utc: nowUtc(),
    scope_lock: {
      writes_only: ["CONFIG_DB.config_prop_taxonomy", "REF_DB.ref_prop_aliases source_key='prizepicks_github'"],
      no_prizepicks_board_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true,
      no_sleeper_work: true,
      no_old_production_touch: true,
      no_browser_pump: true,
      no_external_calls: true
    },
    binding_summary: {
      required_db_bindings_present: allTrue(db),
      expected_vars_present: allTrue(vars)
    },
    checks: { db_bindings: db, vars },
    ...extra
  };
}

function stagedAliases() {
  return PRIZEPICKS_ALIASES.map(a => ({
    alias_key: aliasKey(PRIZEPICKS_SOURCE_KEY, a.source_market_name),
    prop_key: a.prop_key,
    source_key: PRIZEPICKS_SOURCE_KEY,
    source_market_name: a.source_market_name,
    normalized_market_name: normalize(a.source_market_name)
  }));
}

function dangerousDuplicateAliases(aliasRows) {
  const map = new Map();
  for (const a of aliasRows) {
    const k = `${a.source_key}::${a.normalized_market_name}`;
    if (!map.has(k)) map.set(k, new Set());
    map.get(k).add(a.prop_key);
  }
  const out = [];
  for (const [k, set] of map.entries()) {
    if (set.size > 1) out.push({ alias_identity: k, prop_keys: Array.from(set).sort() });
  }
  return out;
}

async function insertMissingTaxonomyRows(env) {
  let rowsWritten = 0;
  for (const row of TAXONOMY_ADDITIONS) {
    const before = await first(env.CONFIG_DB, "SELECT prop_key FROM config_prop_taxonomy WHERE prop_key=?", row.prop_key);
    if (!before) {
      await run(env.CONFIG_DB, `INSERT INTO config_prop_taxonomy
        (prop_key, display_name, player_side, stat_family, primary_role, supported_market_sources, default_line_policy, over_under_policy, california_pickable, scoring_enabled, notes, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        row.prop_key,
        row.display_name,
        row.player_side,
        row.stat_family,
        row.primary_role,
        row.supported_market_sources,
        row.default_line_policy,
        row.over_under_policy,
        row.california_pickable,
        row.scoring_enabled,
        row.notes
      );
      rowsWritten += 1;
    }
  }
  return rowsWritten;
}

async function replacePrizePicksAliases(env, aliasRows) {
  await run(env.REF_DB, "DELETE FROM ref_prop_aliases WHERE source_key=?", PRIZEPICKS_SOURCE_KEY);
  let rowsWritten = 0;
  for (const a of aliasRows) {
    await run(env.REF_DB, `INSERT INTO ref_prop_aliases
      (alias_key, prop_key, source_key, source_market_name, normalized_market_name, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      a.alias_key, a.prop_key, a.source_key, a.source_market_name, a.normalized_market_name
    );
    rowsWritten += 1;
  }
  return rowsWritten;
}

async function collectCertification(env) {
  const taxonomyCount = await first(env.CONFIG_DB, "SELECT COUNT(*) AS c FROM config_prop_taxonomy");
  const taxonomyKeys = await all(env.CONFIG_DB, "SELECT prop_key FROM config_prop_taxonomy ORDER BY prop_key");
  const taxonomyKeySet = new Set(taxonomyKeys.map(r => String(r.prop_key)));

  const boardStats = await all(env.MARKET_DB, `SELECT stat_type, COUNT(*) AS rows_count
    FROM prizepicks_board_current
    GROUP BY stat_type
    ORDER BY stat_type`);

  const aliases = await all(env.REF_DB, `SELECT alias_key, prop_key, source_key, source_market_name, normalized_market_name
    FROM ref_prop_aliases
    WHERE source_key=?
    ORDER BY source_market_name`, PRIZEPICKS_SOURCE_KEY);

  const aliasByMarket = new Map(aliases.map(a => [String(a.source_market_name), a]));
  const unmappedBoardStats = [];
  const mappedBoardStats = [];
  for (const b of boardStats) {
    const a = aliasByMarket.get(String(b.stat_type));
    if (!a || !taxonomyKeySet.has(String(a.prop_key))) {
      unmappedBoardStats.push({ stat_type: b.stat_type, rows_count: b.rows_count, alias_found: !!a, prop_key: a ? a.prop_key : null });
    } else {
      mappedBoardStats.push({ stat_type: b.stat_type, rows_count: b.rows_count, prop_key: a.prop_key });
    }
  }

  const aliasMissingRequired = aliases.filter(a => !text(a.alias_key) || !text(a.prop_key) || !text(a.source_key) || !text(a.source_market_name) || !text(a.normalized_market_name));
  const aliasInvalidPropKeys = aliases.filter(a => !taxonomyKeySet.has(String(a.prop_key)));
  const dangerousDuplicates = dangerousDuplicateAliases(aliases);
  const sourceScopedDuplicateRows = await all(env.REF_DB, `SELECT source_key, normalized_market_name, COUNT(*) AS row_count, COUNT(DISTINCT prop_key) AS distinct_prop_keys
    FROM ref_prop_aliases
    WHERE source_key=?
    GROUP BY source_key, normalized_market_name
    HAVING COUNT(*) > 1 OR COUNT(DISTINCT prop_key) > 1
    ORDER BY normalized_market_name`, PRIZEPICKS_SOURCE_KEY);

  const triples = aliasByMarket.get("Triples") || null;
  const combo = aliasByMarket.get("Pitcher Strikeouts (Combo)") || null;

  const checks = {
    taxonomy_row_count_is_21: Number(taxonomyCount && taxonomyCount.c) === EXPECTED_TAXONOMY_COUNT,
    prizepicks_alias_count_is_20: aliases.length === EXPECTED_PRIZEPICKS_ALIAS_COUNT,
    all_current_prizepicks_stat_types_mapped: unmappedBoardStats.length === 0,
    all_aliases_have_required_fields: aliasMissingRequired.length === 0,
    all_alias_prop_keys_exist_in_taxonomy: aliasInvalidPropKeys.length === 0,
    no_dangerous_duplicate_alias_mappings: dangerousDuplicates.length === 0 && sourceScopedDuplicateRows.length === 0,
    triples_maps_to_triples: !!triples && triples.prop_key === "triples",
    pitcher_strikeouts_combo_maps_to_distinct_key: !!combo && combo.prop_key === "pitcher_strikeouts_combo",
    no_prizepicks_board_mutation: true,
    no_scoring_or_final_board_writes: true
  };

  return {
    checks,
    final_counts: {
      config_prop_taxonomy_rows: Number(taxonomyCount && taxonomyCount.c),
      ref_prop_aliases_prizepicks_rows: aliases.length,
      prizepicks_current_board_stat_types: boardStats.length,
      prizepicks_current_board_rows: boardStats.reduce((sum, r) => sum + Number(r.rows_count || 0), 0)
    },
    board_stat_type_mapping: mappedBoardStats,
    unmapped_board_stat_types: unmappedBoardStats,
    alias_missing_required: aliasMissingRequired,
    alias_invalid_prop_keys: aliasInvalidPropKeys,
    dangerous_duplicate_alias_mappings: dangerousDuplicates,
    source_scoped_duplicate_rows: sourceScopedDuplicateRows,
    decisions: {
      triples: "SUPPORTED_CANONICAL_PROP_KEY_triples_SCORING_DISABLED",
      pitcher_strikeouts_combo: "DISTINCT_CANONICAL_ROUTING_KEY_pitcher_strikeouts_combo_NOT_COLLAPSED_SCORING_DISABLED",
      prizepicks_alias_source_key: PRIZEPICKS_SOURCE_KEY
    }
  };
}

async function runStaticPropTaxonomy(input, env) {
  const started = Date.now();
  const stagedTaxonomyRows = TAXONOMY_ADDITIONS.length;
  const stagedAliasRows = stagedAliases();
  const stagedDuplicateProblems = dangerousDuplicateAliases(stagedAliasRows);
  if (stagedDuplicateProblems.length > 0) {
    throw new Error(`staged_aliases_have_dangerous_duplicates:${JSON.stringify(stagedDuplicateProblems)}`);
  }

  const before = await collectCertification(env);
  const taxonomyRowsWritten = await insertMissingTaxonomyRows(env);
  const aliasRowsWritten = await replacePrizePicksAliases(env, stagedAliasRows);
  const after = await collectCertification(env);
  const certified = Object.values(after.checks).every(Boolean);

  return {
    ok: certified,
    data_ok: certified,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: input.job_key || JOB_KEY,
    request_id: input.request_id || null,
    chain_id: input.chain_id || null,
    status: certified ? "completed_static_prop_taxonomy_alias_certifier" : "failed_static_prop_taxonomy_alias_certification",
    certification: certified ? "STATIC_PROP_TAXONOMY_21_ROWS_PRIZEPICKS_20_ALIASES_CERTIFIED" : "STATIC_PROP_TAXONOMY_ALIAS_CERTIFICATION_FAILED",
    rows_read: before.final_counts.prizepicks_current_board_stat_types,
    rows_written: taxonomyRowsWritten + aliasRowsWritten,
    taxonomy_rows_staged: stagedTaxonomyRows,
    taxonomy_rows_inserted: taxonomyRowsWritten,
    prizepicks_alias_rows_staged: stagedAliasRows.length,
    prizepicks_alias_rows_replaced: aliasRowsWritten,
    external_calls_performed: 0,
    elapsed_ms: Date.now() - started,
    before_counts: before.final_counts,
    final_counts: after.final_counts,
    certification_checks: after.checks,
    decisions: after.decisions,
    board_stat_type_mapping: after.board_stat_type_mapping,
    certification_failures: certified ? [] : {
      unmapped_board_stat_types: after.unmapped_board_stat_types,
      alias_missing_required: after.alias_missing_required,
      alias_invalid_prop_keys: after.alias_invalid_prop_keys,
      dangerous_duplicate_alias_mappings: after.dangerous_duplicate_alias_mappings,
      source_scoped_duplicate_rows: after.source_scoped_duplicate_rows
    },
    scope_lock: baseIdentity(env).scope_lock,
    timestamp_utc: nowUtc()
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));

    if (method === "GET" && path === "/health") {
      return jsonResponse(baseIdentity(env, {
        route: "/health",
        expected_taxonomy_count_after_run: EXPECTED_TAXONOMY_COUNT,
        expected_prizepicks_alias_count_after_run: EXPECTED_PRIZEPICKS_ALIAS_COUNT,
        source_key: PRIZEPICKS_SOURCE_KEY
      }));
    }

    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      return jsonResponse(baseIdentity(env, {
        route: "/diagnostic",
        input_echo_safe: {
          request_id: input.request_id || null,
          chain_id: input.chain_id || null,
          job_key: input.job_key || null,
          mode: input.mode || null
        },
        diagnostics: {
          config_db_bound: !!env.CONFIG_DB,
          ref_db_bound: !!env.REF_DB,
          market_db_bound: !!env.MARKET_DB,
          staged_taxonomy_additions: TAXONOMY_ADDITIONS.map(r => r.prop_key),
          staged_prizepicks_aliases: PRIZEPICKS_ALIASES.map(r => ({ source_market_name: r.source_market_name, prop_key: r.prop_key }))
        }
      }));
    }

    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        return jsonResponse(await runStaticPropTaxonomy(input, env));
      } catch (err) {
        return jsonResponse({
          ok: false,
          data_ok: false,
          version: VERSION,
          worker_name: WORKER_NAME,
          job_key: input.job_key || JOB_KEY,
          request_id: input.request_id || null,
          chain_id: input.chain_id || null,
          status: "static_prop_taxonomy_alias_certifier_exception",
          certification: "STATIC_PROP_TAXONOMY_ALIAS_CERTIFIER_EXCEPTION",
          error: String(err && err.message ? err.message : err),
          rows_read: 0,
          rows_written: 0,
          external_calls_performed: 0,
          scope_lock: baseIdentity(env).scope_lock,
          timestamp_utc: nowUtc()
        }, 500);
      }
    }

    return jsonResponse({
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      status: "NOT_FOUND",
      allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"],
      timestamp_utc: nowUtc()
    }, 404);
  }
};
