import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-static-players";
const VERSION = "alphadog-v2-static-players-v0.3.0-postgres-cutover";
const JOB_KEY = "static-players";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "MLB_API_BASE_URL", "WORKER_SAFE_MODE", "DEBUG_MODE"];

const SOURCE_KEY = "mlb_statsapi_40man_roster_v0_1_0";
const DEFAULT_MAX_TEAMS_PER_RUN = 6;
const HARD_MAX_TEAMS_PER_RUN = 10;
const SOURCE_NAME = "MLB StatsAPI 40-man roster endpoint";
const ROSTER_TYPE = "40Man";
const RAW_JSON_LIMIT = 6000;
const FRESHNESS_WINDOW_HOURS = 20;

function nowUtc() { return new Date().toISOString(); }
function text(value) { return String(value === undefined || value === null ? "" : value).trim(); }
function numOrNull(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function normalize(value) { return text(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " "); }
function compactJson(value) { return JSON.stringify(value || {}); }
function unique(values) { return Array.from(new Set(values.filter(v => v !== null && v !== undefined && String(v).length > 0).map(v => String(v)))); }

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

function pg(env) {
  return postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false });
}

function base(env, extra = {}) {
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "STATIC_PLAYERS_WORKER_READY",
    timestamp_utc: nowUtc(),
    source_name: SOURCE_NAME,
    source_key: SOURCE_KEY,
    roster_type: ROSTER_TYPE,
    boundaries: {
      primary_team_source: "Postgres ref.teams active MLB teams",
      primary_player_source: "MLB StatsAPI /teams/{mlb_team_id}/roster/40Man",
      writes_only: ["Postgres ref.players_stage", "ref.player_aliases_stage", "ref.rosters_stage", "config.static_players_batches", "ref.players", "ref.player_aliases", "ref.rosters"],
      lifecycle: "mine_to_stage_certify_promote_replace_main_clean_stage",
      no_26man_only_scope: true,
      no_every_minor_leaguer_scope: true,
      no_person_detail_hydration_in_v0_1_0: true,
      no_prizepicks_board_mutation: true,
      no_prizepicks_alias_guessing: true,
      no_sleeper_alias_guessing: true,
      no_opponent_backfill: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true,
      no_old_production_touch: true,
      no_gemini_api: true
    },
    bindings: bindingPresence(env, REQUIRED_DB_BINDINGS),
    vars: varPresence(env, EXPECTED_VARS),
    ...extra
  };
}

async function readActiveTeams(sql) {
  return await sql`SELECT team_id, mlb_team_id, abbreviation, full_name, active
    FROM ref.teams WHERE COALESCE(active,1)=1 AND mlb_team_id IS NOT NULL ORDER BY abbreviation, team_id`;
}

function mlbBaseUrl(env) {
  return text(env.MLB_API_BASE_URL) || "https://statsapi.mlb.com/api/v1";
}

async function fetchRoster(env, mlbTeamId) {
  const url = `${mlbBaseUrl(env).replace(/\/$/, "")}/teams/${encodeURIComponent(String(mlbTeamId))}/roster/${ROSTER_TYPE}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "accept": "application/json",
      "cache-control": "no-cache",
      "user-agent": text(env.MLB_API_USER_AGENT) || "AlphaDogV2StaticPlayers/0.3 (+controlled-reference-refresh)"
    }
  });
  const bodyText = await resp.text();
  let json = null;
  try { json = JSON.parse(bodyText); } catch (_) { json = null; }
  if (!resp.ok || !json || !Array.isArray(json.roster)) {
    throw new Error(`mlb_statsapi_40man_roster_fetch_failed_team_${mlbTeamId}_http_${resp.status}`);
  }
  return { url, http_status: resp.status, roster: json.roster, raw: json };
}

const HYDRATION_IDS_PER_CALL = 100;
async function fetchPersonDetailsBatch(env, personIds) {
  const map = new Map();
  if (!personIds || !personIds.length) return map;
  for (let i = 0; i < personIds.length; i += HYDRATION_IDS_PER_CALL) {
    const chunk = personIds.slice(i, i + HYDRATION_IDS_PER_CALL);
    const url = `${mlbBaseUrl(env).replace(/\/$/, "")}/people?personIds=${encodeURIComponent(chunk.join(","))}`;
    try {
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          "accept": "application/json",
          "cache-control": "no-cache",
          "user-agent": text(env.MLB_API_USER_AGENT) || "AlphaDogV2StaticPlayers/0.3 (+controlled-reference-refresh)"
        }
      });
      const bodyText = await resp.text();
      let json = null;
      try { json = JSON.parse(bodyText); } catch (_) { json = null; }
      if (resp.ok && json && Array.isArray(json.people)) {
        for (const person of json.people) {
          const id = numOrNull(person.id);
          if (!id) continue;
          const batSide = text(person.batSide?.code || person.batSide?.description || "") || null;
          const throwSide = text(person.pitchHand?.code || person.pitchHand?.description || "") || null;
          map.set(String(id), { bat_side: batSide, throw_side: throwSide });
        }
      }
    } catch (_) { /* real, honest partial failure: leave this chunk unhydrated, not fabricated */ }
  }
  return map;
}

function extractNameParts(person, fullName) {
  const firstFromPayload = text(person.firstName || person.useName || "");
  const lastFromPayload = text(person.lastName || "");
  if (firstFromPayload && lastFromPayload) return { first_name: firstFromPayload, last_name: lastFromPayload, derived: "payload" };

  const parts = text(fullName).split(/\s+/).filter(Boolean);
  if (parts.length === 2 && /^[A-Za-z.'-]+$/.test(parts[0]) && /^[A-Za-z.'-]+$/.test(parts[1])) {
    return { first_name: parts[0], last_name: parts[1], derived: "safe_two_token_full_name" };
  }

  return { first_name: null, last_name: null, derived: "not_safely_available" };
}

function playerFromRosterEntry(entry, team) {
  const person = entry.person || {};
  const position = entry.position || {};
  const status = entry.status || {};
  const mlbPlayerId = numOrNull(person.id);
  const fullName = text(person.fullName || person.name || entry.personName || "");
  const names = extractNameParts(person, fullName);
  const batSide = text(person.batSide?.code || person.batSide?.description || entry.batSide?.code || "") || null;
  const throwSide = text(person.pitchHand?.code || person.pitchHand?.description || entry.pitchHand?.code || "") || null;
  const primaryPosition = text(position.abbreviation || position.code || position.name || "") || null;

  return {
    player_id: mlbPlayerId,
    mlb_player_id: mlbPlayerId,
    full_name: fullName || null,
    player_name: fullName || null,
    first_name: names.first_name,
    last_name: names.last_name,
    name_parts_source: names.derived,
    current_team_id: text(team.team_id) || null,
    current_mlb_team_id: numOrNull(team.mlb_team_id),
    primary_team_id: text(team.team_id) || null,
    primary_position: primaryPosition,
    primary_role: primaryPosition,
    bat_side: batSide,
    throw_side: throwSide,
    bats: batSide,
    throws: throwSide,
    roster_status: text(status.code || status.description || "40Man") || "40Man",
    position_abbreviation: primaryPosition,
    active: 1,
    source_key: SOURCE_KEY,
    raw_json: compactJson({ team, roster_entry: entry })
  };
}

function aliasKey(playerId, aliasType, aliasName, teamId = "") {
  return `${playerId}|${aliasType}|${normalize(aliasName)}|${normalize(teamId)}`.slice(0, 240);
}

function buildAliases(player) {
  const aliases = [];
  function add(aliasType, aliasName, confidence = "HIGH", teamScoped = false) {
    const name = text(aliasName);
    const norm = normalize(name);
    if (!name || !norm || !player.player_id) return;
    const teamId = teamScoped ? player.current_team_id : null;
    aliases.push({
      alias_key: aliasKey(player.player_id, aliasType, name, teamId || ""),
      player_id: player.player_id,
      alias_name: name,
      alias_type: aliasType,
      alias_normalized: norm,
      team_id: teamId,
      mlb_team_id: teamScoped ? player.current_mlb_team_id : null,
      source_key: SOURCE_KEY,
      confidence,
      active: 1,
      raw_json: compactJson({ alias_type: aliasType, alias_name: name, team_id: teamId, mlb_team_id: teamScoped ? player.current_mlb_team_id : null })
    });
  }

  add("full_name", player.full_name, "HIGH", false);
  add("normalized_full_name", normalize(player.full_name), "HIGH", false);
  if (player.first_name && player.last_name) add("last_first", `${player.last_name}, ${player.first_name}`, "HIGH", false);
  add("mlb_player_id", String(player.mlb_player_id), "HIGH", false);
  if (player.current_team_id && player.full_name) add("team_scoped_full_name", `${player.current_team_id}:${player.full_name}`, "HIGH", true);

  const seen = new Set();
  return aliases.filter(a => {
    if (seen.has(a.alias_key)) return false;
    seen.add(a.alias_key);
    return true;
  });
}

function batchIdFor(input, originalInput) {
  return text(originalInput.batch_id || input.batch_id || input.request_id || `static_players_batch_${Date.now()}`);
}

async function purgeStaleStageBatches(sql, olderThanHours = 24) {
  const stale = await sql`SELECT batch_id FROM config.static_players_batches WHERE status NOT IN ('promoted') AND updated_at < now() - (${olderThanHours} || ' hours')::interval`;
  for (const row of stale) {
    await sql`DELETE FROM ref.players_stage WHERE batch_id=${row.batch_id}`;
    await sql`DELETE FROM ref.player_aliases_stage WHERE batch_id=${row.batch_id}`;
    await sql`DELETE FROM ref.rosters_stage WHERE batch_id=${row.batch_id}`;
    await sql`UPDATE config.static_players_batches SET status='abandoned_stale_cleanup', certification_status='STATIC_PLAYERS_STALE_BATCH_AUTO_CLEANED', updated_at=now() WHERE batch_id=${row.batch_id}`;
  }
  return { stale_batches_cleaned: stale.length };
}

async function initializeStageBatch(sql, batchId, input, originalInput) {
  await purgeStaleStageBatches(sql);
  await sql`
    INSERT INTO config.static_players_batches (batch_id, request_id, chain_id, source_key, status, certification_status, processed_mlb_team_ids_json, created_at, updated_at)
    VALUES (${batchId}, ${input.request_id || null}, ${input.chain_id || null}, ${SOURCE_KEY}, 'collecting', 'STATIC_PLAYERS_STAGE_COLLECTING', ${JSON.stringify([])}, now(), now())
    ON CONFLICT (batch_id) DO UPDATE SET request_id=excluded.request_id, chain_id=excluded.chain_id, status='collecting', certification_status='STATIC_PLAYERS_STAGE_COLLECTING', processed_mlb_team_ids_json=excluded.processed_mlb_team_ids_json, updated_at=now()
  `;
  await sql`DELETE FROM ref.players_stage WHERE batch_id=${batchId}`;
  await sql`DELETE FROM ref.player_aliases_stage WHERE batch_id=${batchId}`;
  await sql`DELETE FROM ref.rosters_stage WHERE batch_id=${batchId}`;
}

async function updateStageBatchMetrics(sql, batchId, processedMlbTeamIds, status, certificationStatus, errorJson = null) {
  const checks = await stageCertificationChecks(sql, batchId);
  await sql`UPDATE config.static_players_batches
    SET status=${status},
        rows_fetched=${Number(checks.static_40man_roster_rows || 0)},
        players_staged=${Number(checks.player_rows || 0)},
        aliases_staged=${Number(checks.alias_rows || 0)},
        rosters_staged=${Number(checks.static_40man_roster_rows || 0)},
        teams_covered=${Number(checks.active_roster_team_count || 0)},
        duplicate_mlb_ids=${Number(checks.duplicate_mlb_player_id_count || 0)},
        missing_mlb_player_id=${Number(checks.missing_mlb_player_id || 0)},
        missing_name=${Number(checks.missing_full_name_or_player_name || 0)},
        certification_status=${certificationStatus},
        processed_mlb_team_ids_json=${JSON.stringify(processedMlbTeamIds || [])},
        error_json=${errorJson ? JSON.stringify(errorJson) : null},
        updated_at=now()
    WHERE batch_id=${batchId}`;
  return checks;
}

async function promoteCertifiedStage(sql, batchId, requestId) {
  await sql`UPDATE config.static_players_batches
    SET status='promoting', certification_status='STATIC_PLAYERS_STAGE_CERTIFIED_PROMOTING', updated_at=now()
    WHERE batch_id=${batchId} AND source_key=${SOURCE_KEY} AND status IN ('certified','collecting')`;

  // Real differential: only rewrite a ref.players row when the staged data genuinely differs
  // from what's already there. Every staged player still gets a cheap last_seen touch regardless,
  // so the deactivation logic below continues to work correctly.
  const diffPromote = await sql`INSERT INTO ref.players
    (player_id, mlb_player_id, player_name, full_name, first_name, last_name, primary_team_id, current_team_id, current_mlb_team_id, primary_role, primary_position, bat_side, throw_side, active, source_key, raw_json, updated_at, last_seen_request_id, last_seen_at)
    SELECT s.player_id, s.mlb_player_id, s.player_name, s.full_name, s.first_name, s.last_name, s.primary_team_id, s.current_team_id, s.current_mlb_team_id, s.primary_role, s.primary_position, s.bat_side, s.throw_side, 1, s.source_key, s.raw_json, now(), ${requestId}, now()
    FROM ref.players_stage s
    WHERE s.batch_id=${batchId} AND s.source_key=${SOURCE_KEY}
      AND NOT EXISTS (
        SELECT 1 FROM ref.players p
        WHERE p.mlb_player_id = s.mlb_player_id
          AND COALESCE(p.current_team_id,'') = COALESCE(s.current_team_id,'')
          AND COALESCE(p.current_mlb_team_id::text,'') = COALESCE(s.current_mlb_team_id::text,'')
          AND COALESCE(p.primary_position,'') = COALESCE(s.primary_position,'')
          AND COALESCE(p.bat_side,'') = COALESCE(s.bat_side,'')
          AND COALESCE(p.throw_side,'') = COALESCE(s.throw_side,'')
          AND COALESCE(p.full_name,'') = COALESCE(s.full_name,'')
          AND COALESCE(p.active,0) = 1
      )
    ON CONFLICT (player_id) DO UPDATE SET mlb_player_id=excluded.mlb_player_id, player_name=excluded.player_name, full_name=excluded.full_name,
      first_name=excluded.first_name, last_name=excluded.last_name, primary_team_id=excluded.primary_team_id, current_team_id=excluded.current_team_id,
      current_mlb_team_id=excluded.current_mlb_team_id, primary_role=excluded.primary_role, primary_position=excluded.primary_position,
      bat_side=excluded.bat_side, throw_side=excluded.throw_side, active=1, source_key=excluded.source_key, raw_json=excluded.raw_json,
      updated_at=now(), last_seen_request_id=excluded.last_seen_request_id, last_seen_at=now()`;

  await sql`UPDATE ref.players
    SET last_seen_request_id=${requestId}, last_seen_at=now(), active=1, updated_at=now()
    WHERE source_key=${SOURCE_KEY}
      AND mlb_player_id IN (SELECT mlb_player_id FROM ref.players_stage WHERE batch_id=${batchId} AND source_key=${SOURCE_KEY})`;

  await sql`INSERT INTO ref.player_aliases
    (alias_key, player_id, alias_name, alias_type, alias_normalized, team_id, mlb_team_id, source_key, confidence, active, raw_json, updated_at, last_seen_request_id, last_seen_at)
    SELECT alias_key, player_id, alias_name, alias_type, alias_normalized, team_id, mlb_team_id, source_key, confidence, 1, raw_json, now(), ${requestId}, now()
    FROM ref.player_aliases_stage
    WHERE batch_id=${batchId} AND source_key=${SOURCE_KEY}
    ON CONFLICT (alias_key) DO UPDATE SET player_id=excluded.player_id, alias_name=excluded.alias_name, alias_type=excluded.alias_type,
      alias_normalized=excluded.alias_normalized, team_id=excluded.team_id, mlb_team_id=excluded.mlb_team_id, source_key=excluded.source_key,
      confidence=excluded.confidence, active=1, raw_json=excluded.raw_json, updated_at=now(), last_seen_request_id=excluded.last_seen_request_id, last_seen_at=now()`;

  await sql`INSERT INTO ref.rosters
    (roster_key, roster_date, snapshot_type, team_id, mlb_team_id, player_id, player_name, roster_status, role, position_abbreviation, source_key, active, raw_json, updated_at, last_seen_request_id, last_seen_at)
    SELECT roster_key, roster_date, snapshot_type, team_id, mlb_team_id, player_id, player_name, roster_status, role, position_abbreviation, source_key, 1, raw_json, now(), ${requestId}, now()
    FROM ref.rosters_stage
    WHERE batch_id=${batchId} AND source_key=${SOURCE_KEY} AND snapshot_type='STATIC_40MAN_SNAPSHOT'
    ON CONFLICT (roster_key) DO UPDATE SET slate_date=excluded.slate_date, roster_date=excluded.roster_date, snapshot_type=excluded.snapshot_type,
      team_id=excluded.team_id, mlb_team_id=excluded.mlb_team_id, player_id=excluded.player_id, player_name=excluded.player_name, roster_status=excluded.roster_status,
      role=excluded.role, position_abbreviation=excluded.position_abbreviation, source_key=excluded.source_key, active=1, raw_json=excluded.raw_json,
      updated_at=now(), last_seen_request_id=excluded.last_seen_request_id, last_seen_at=now()`;

  await sql`UPDATE ref.players SET active=0, updated_at=now() WHERE source_key=${SOURCE_KEY} AND COALESCE(last_seen_request_id, '') <> ${requestId}`;
  await sql`UPDATE ref.player_aliases SET active=0, updated_at=now() WHERE source_key=${SOURCE_KEY} AND COALESCE(last_seen_request_id, '') <> ${requestId}`;
  await sql`UPDATE ref.rosters SET active=0, updated_at=now() WHERE source_key=${SOURCE_KEY} AND snapshot_type='STATIC_40MAN_SNAPSHOT' AND COALESCE(last_seen_request_id, '') <> ${requestId}`;

  const mainChecks = await certificationChecks(sql);
  const mainOk = Number(mainChecks.player_rows || 0) > 500
    && Number(mainChecks.static_40man_roster_rows || 0) > 500
    && Number(mainChecks.active_player_team_count || 0) === 30
    && Number(mainChecks.active_roster_team_count || 0) === 30
    && Number(mainChecks.duplicate_mlb_player_id_count || 0) === 0
    && Number(mainChecks.missing_mlb_player_id || 0) === 0
    && Number(mainChecks.missing_full_name_or_player_name || 0) === 0
    && Number(mainChecks.alias_rows || 0) > 0;

  if (!mainOk) {
    await sql`UPDATE config.static_players_batches
      SET status='promotion_failed', certification_status='STATIC_PLAYERS_MAIN_CERTIFICATION_FAILED_AFTER_PROMOTION', error_json=${JSON.stringify({ mainChecks })}, updated_at=now()
      WHERE batch_id=${batchId}`;
    return { promoted: false, mainChecks, real_rows_changed_this_run: diffPromote.count || 0 };
  }

  await sql`DELETE FROM ref.players_stage WHERE batch_id=${batchId}`;
  await sql`DELETE FROM ref.player_aliases_stage WHERE batch_id=${batchId}`;
  await sql`DELETE FROM ref.rosters_stage WHERE batch_id=${batchId}`;

  await sql`UPDATE config.static_players_batches
    SET status='promoted', certification_status='STATIC_PLAYERS_STAGE_CERTIFIED_PROMOTED_MAIN_CLEANED', promoted_at=now(), cleaned_at=now(), updated_at=now()
    WHERE batch_id=${batchId}`;

  return { promoted: true, mainChecks, real_rows_changed_this_run: diffPromote.count || 0 };
}

async function runSeed(env, input = {}) {
  const originalInput = input && typeof input.input_json === "object" && input.input_json !== null ? input.input_json : input;
  const processedMlbTeamIds = new Set(Array.isArray(originalInput.processed_mlb_team_ids) ? originalInput.processed_mlb_team_ids.map(v => String(v)) : []);
  const maxTeamsPerRunRaw = Number(originalInput.max_teams_per_run || originalInput.maxTeamsPerRun || DEFAULT_MAX_TEAMS_PER_RUN);
  const maxTeamsPerRun = Math.max(1, Math.min(Number.isFinite(maxTeamsPerRunRaw) ? maxTeamsPerRunRaw : DEFAULT_MAX_TEAMS_PER_RUN, HARD_MAX_TEAMS_PER_RUN));
  const requestId = input.request_id || originalInput.request_id || batchIdFor(input, originalInput);
  const batchId = batchIdFor({ ...input, request_id: requestId }, originalInput);

  // Phase 1: short-lived connection just to read teams and check freshness/initialize the
  // stage batch. Closed before any external MLB API calls happen - holding a Hyperdrive
  // connection open and idle across multiple external HTTP fetches (up to 6 team rosters plus
  // batch person-detail hydration calls, which can genuinely take a while) was the real cause
  // of "Network connection lost" failures confirmed live on the Savant-sourced static workers;
  // the same risk applies here, just with more external calls per invocation.
  let sqlPhase1 = pg(env);
  const teams = await readActiveTeams(sqlPhase1);
  const distinctTeamIds = unique(teams.map(t => t.team_id)).length;
  const distinctMlbTeamIds = unique(teams.map(t => t.mlb_team_id)).length;

  if (teams.length !== 30 || distinctTeamIds !== 30 || distinctMlbTeamIds !== 30) {
    await sqlPhase1.end();
    return {
      ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY,
      request_id: input.request_id || null, chain_id: input.chain_id || null, batch_id: batchId,
      status: "blocked_ref_teams_not_ready", certification: "STATIC_PLAYERS_BLOCKED_REF_TEAMS_NOT_30_ACTIVE_MLB_TEAMS",
      teams_found: teams.length, distinct_team_ids: distinctTeamIds, distinct_mlb_team_ids: distinctMlbTeamIds,
      rows_read: teams.length, rows_written: 0, external_calls_performed: 0,
      error: "Postgres ref.teams must contain exactly 30 active teams with mlb_team_id before static player seed. Run/verify STATIC > Teams first.",
      boundaries: base(env).boundaries, timestamp_utc: nowUtc()
    };
  }

  const allMlbTeamIds = teams.map(t => String(t.mlb_team_id));
  const alreadyProcessedValid = Array.from(processedMlbTeamIds).filter(id => allMlbTeamIds.includes(id));
  const processedSet = new Set(alreadyProcessedValid);
  const isFirstChunk = processedSet.size === 0;

  if (isFirstChunk) {
    const freshRows = await sqlPhase1`SELECT MAX(promoted_at) AS last_promoted FROM config.static_players_batches WHERE source_key=${SOURCE_KEY} AND status='promoted'`;
    const lastPromoted = freshRows[0] && freshRows[0].last_promoted;
    if (lastPromoted) {
      const ageHours = (Date.now() - new Date(lastPromoted).getTime()) / 3600000;
      if (ageHours >= 0 && ageHours < FRESHNESS_WINDOW_HOURS) {
        const mainChecksNoop = await certificationChecks(sqlPhase1);
        await sqlPhase1.end();
        return {
          ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY,
          request_id: input.request_id || null, chain_id: input.chain_id || null, batch_id: batchId,
          status: "completed_noop_fresh", certification: "STATIC_PLAYERS_CERTIFIED_NOOP_ALREADY_FRESH",
          teams_processed_this_run: 0, teams_processed_total: 30, teams_remaining: 0, teams_expected: 30,
          rows_read: 0, rows_written: 0, external_calls_performed: 0,
          freshness_gate: { last_promoted: lastPromoted, age_hours: Math.round(ageHours * 100) / 100, window_hours: FRESHNESS_WINDOW_HOURS, skipped_expensive_fetch: true },
          differential_note: "No real fetch performed - a promoted batch completed within the freshness window, so nothing needed mining.",
          main_certification_checks: mainChecksNoop,
          database_target: "postgres_ref_players",
          boundaries: base(env).boundaries, timestamp_utc: nowUtc()
        };
      }
    }
  }

  if (isFirstChunk) {
    await initializeStageBatch(sqlPhase1, batchId, { ...input, request_id: requestId }, originalInput);
  }
  await sqlPhase1.end();

  const remainingTeams = teams.filter(t => !processedSet.has(String(t.mlb_team_id)));
  const teamsThisRun = remainingTeams.slice(0, maxTeamsPerRun);

  const byMlbPlayerId = new Map();
  const sourceSamples = [];
  let externalCalls = 0;
  let rosterRowsRead = 0;
  let teamsProcessedThisRun = 0;
  let aliasesWritten = 0;
  let playersWrittenThisRun = 0;
  let rostersWritten = 0;
  const rosterSnapshots = [];
  let missingPosition = 0;
  let missingBatSide = 0;
  let missingThrowSide = 0;
  const teamSummaries = [];

  // Phase 2: all external MLB API calls (roster fetches + person-detail hydration) happen here
  // with NO Postgres connection open at all.
  for (const team of teamsThisRun) {
    const mlbTeamId = numOrNull(team.mlb_team_id);
    const fetched = await fetchRoster(env, mlbTeamId);
    externalCalls += 1;
    teamsProcessedThisRun += 1;
    rosterRowsRead += fetched.roster.length;
    processedSet.add(String(mlbTeamId));
    teamSummaries.push({ team_id: team.team_id, mlb_team_id: mlbTeamId, abbreviation: team.abbreviation, roster_rows: fetched.roster.length, http_status: fetched.http_status });
    if (sourceSamples.length < 3) sourceSamples.push({ team_id: team.team_id, url: fetched.url, roster_rows: fetched.roster.length });

    for (const entry of fetched.roster) {
      const player = playerFromRosterEntry(entry, team);
      if (!player.mlb_player_id || !player.full_name) continue;
      if (!player.primary_position) missingPosition += 1;
      if (!player.bat_side) missingBatSide += 1;
      if (!player.throw_side) missingThrowSide += 1;

      rosterSnapshots.push({ player, team });
      const existing = byMlbPlayerId.get(String(player.mlb_player_id));
      if (!existing || (existing.current_team_id !== player.current_team_id && !existing.current_team_id)) {
        byMlbPlayerId.set(String(player.mlb_player_id), player);
      }
    }
  }

  const players = Array.from(byMlbPlayerId.values()).sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));

  const needsHydration = players.filter(p => (!p.bat_side || !p.throw_side) && p.mlb_player_id).map(p => p.mlb_player_id);
  let hydrationCallsPerformed = 0;
  let playersHydratedThisRun = 0;
  if (needsHydration.length) {
    const detailMap = await fetchPersonDetailsBatch(env, needsHydration);
    hydrationCallsPerformed = Math.ceil(needsHydration.length / HYDRATION_IDS_PER_CALL);
    for (const player of players) {
      const detail = detailMap.get(String(player.mlb_player_id));
      if (!detail) continue;
      if (detail.bat_side && !player.bat_side) { player.bat_side = detail.bat_side; player.bats = detail.bat_side; playersHydratedThisRun += 1; }
      if (detail.throw_side && !player.throw_side) { player.throw_side = detail.throw_side; player.throws = detail.throw_side; }
    }
  }

  // Phase 3: fresh Postgres connection opened only now, for the write phase.
  const sql = pg(env);
  try {

    const playerRowsForBulk = [];
    const aliasRowsForBulk = [];
    for (const player of players) {
      playerRowsForBulk.push({
        batch_id: batchId, player_id: player.player_id, mlb_player_id: player.mlb_player_id, player_name: player.player_name, full_name: player.full_name,
        first_name: player.first_name, last_name: player.last_name, primary_team_id: player.primary_team_id, current_team_id: player.current_team_id,
        current_mlb_team_id: player.current_mlb_team_id, primary_role: player.primary_role, primary_position: player.primary_position,
        bats: player.bats, throws: player.throws, bat_side: player.bat_side, throw_side: player.throw_side, active: player.active,
        source_key: player.source_key, raw_json: player.raw_json, last_seen_request_id: requestId
      });
      playersWrittenThisRun += 1;
      const aliases = buildAliases(player);
      for (const alias of aliases) {
        aliasRowsForBulk.push({
          batch_id: batchId, alias_key: alias.alias_key, player_id: alias.player_id, alias_name: alias.alias_name, alias_type: alias.alias_type,
          alias_normalized: alias.alias_normalized, team_id: alias.team_id, mlb_team_id: alias.mlb_team_id, source_key: alias.source_key,
          confidence: alias.confidence, active: alias.active, raw_json: alias.raw_json, last_seen_request_id: requestId
        });
        aliasesWritten += 1;
      }
    }

    // Bulk writes (postgres.js sql() array helper), chunked at 200 rows/statement. Re-introduced
    // after root-causing the earlier "Network connection lost" failures on static-pitcher-arsenal:
    // that was never actually about bulk-vs-individual insert syntax - it was postgres.js's
    // default prepared-statement mode masking a real "column does not exist" schema error as a
    // generic connection failure. With prepare:false now set (which surfaces real errors), and
    // these tables having no legacy schema issues (built fresh this session), bulk inserts are
    // safe and restore the tick times that individual-row inserts regressed badly (confirmed
    // live: ~350s/tick vs the original ~20-25s/tick on D1).
    const CHUNK = 200;
    for (let i = 0; i < playerRowsForBulk.length; i += CHUNK) {
      const chunk = playerRowsForBulk.slice(i, i + CHUNK);
      await sql`
        INSERT INTO ref.players_stage ${sql(chunk, "batch_id", "player_id", "mlb_player_id", "player_name", "full_name", "first_name", "last_name",
          "primary_team_id", "current_team_id", "current_mlb_team_id", "primary_role", "primary_position", "bats", "throws", "bat_side", "throw_side",
          "active", "source_key", "raw_json", "last_seen_request_id")}
        ON CONFLICT (batch_id, player_id) DO UPDATE SET mlb_player_id=excluded.mlb_player_id, player_name=excluded.player_name, full_name=excluded.full_name,
          first_name=excluded.first_name, last_name=excluded.last_name, primary_team_id=excluded.primary_team_id, current_team_id=excluded.current_team_id,
          current_mlb_team_id=excluded.current_mlb_team_id, primary_role=excluded.primary_role, primary_position=excluded.primary_position, bats=excluded.bats,
          throws=excluded.throws, bat_side=excluded.bat_side, throw_side=excluded.throw_side, active=excluded.active, raw_json=excluded.raw_json,
          updated_at=now(), last_seen_request_id=excluded.last_seen_request_id, last_seen_at=now()
      `;
    }
    for (let i = 0; i < aliasRowsForBulk.length; i += CHUNK) {
      const chunk = aliasRowsForBulk.slice(i, i + CHUNK);
      await sql`
        INSERT INTO ref.player_aliases_stage ${sql(chunk, "batch_id", "alias_key", "player_id", "alias_name", "alias_type", "alias_normalized",
          "team_id", "mlb_team_id", "source_key", "confidence", "active", "raw_json", "last_seen_request_id")}
        ON CONFLICT (batch_id, alias_key) DO UPDATE SET player_id=excluded.player_id, alias_name=excluded.alias_name, alias_type=excluded.alias_type,
          alias_normalized=excluded.alias_normalized, team_id=excluded.team_id, mlb_team_id=excluded.mlb_team_id, confidence=excluded.confidence,
          active=excluded.active, raw_json=excluded.raw_json, updated_at=now(), last_seen_request_id=excluded.last_seen_request_id, last_seen_at=now()
      `;
    }

    const rosterRowsForBulk = rosterSnapshots.map(snapshot => ({
      batch_id: batchId,
      roster_key: `${SOURCE_KEY}|${snapshot.team.team_id}|${snapshot.player.player_id}`.slice(0, 240),
      roster_date: new Date().toISOString().slice(0, 10),
      snapshot_type: "STATIC_40MAN_SNAPSHOT",
      team_id: snapshot.team.team_id,
      mlb_team_id: numOrNull(snapshot.team.mlb_team_id),
      player_id: snapshot.player.player_id,
      player_name: snapshot.player.full_name,
      roster_status: snapshot.player.roster_status,
      role: snapshot.player.primary_position,
      position_abbreviation: snapshot.player.position_abbreviation,
      source_key: SOURCE_KEY,
      active: 1,
      raw_json: snapshot.player.raw_json,
      last_seen_request_id: requestId
    }));
    for (let i = 0; i < rosterRowsForBulk.length; i += CHUNK) {
      const chunk = rosterRowsForBulk.slice(i, i + CHUNK);
      await sql`
        INSERT INTO ref.rosters_stage ${sql(chunk, "batch_id", "roster_key", "roster_date", "snapshot_type", "team_id", "mlb_team_id", "player_id",
          "player_name", "roster_status", "role", "position_abbreviation", "source_key", "active", "raw_json", "last_seen_request_id")}
        ON CONFLICT (batch_id, roster_key) DO UPDATE SET roster_date=excluded.roster_date, snapshot_type=excluded.snapshot_type, team_id=excluded.team_id,
          mlb_team_id=excluded.mlb_team_id, player_id=excluded.player_id, player_name=excluded.player_name, roster_status=excluded.roster_status,
          role=excluded.role, position_abbreviation=excluded.position_abbreviation, active=1, raw_json=excluded.raw_json,
          updated_at=now(), last_seen_request_id=excluded.last_seen_request_id, last_seen_at=now()
      `;
      rostersWritten += chunk.length;
    }

    externalCalls += hydrationCallsPerformed;

    const processedNow = Array.from(processedSet).filter(id => allMlbTeamIds.includes(id));
    const remainingAfter = teams.filter(t => !processedSet.has(String(t.mlb_team_id)));

    if (remainingAfter.length > 0) {
      const checks = await updateStageBatchMetrics(sql, batchId, processedNow, "collecting", "STATIC_PLAYERS_40MAN_IDENTITY_STAGE_PARTIAL_CONTINUE");
      const continuationInputJson = {
        ...originalInput, batch_id: batchId, mode: "static_players_40man_identity_seed", source_name: SOURCE_NAME,
        source_mode: "ref_teams_driven_mlb_statsapi_40man_roster", endpoint_pattern: "/teams/{mlb_team_id}/roster/40Man",
        max_teams_per_run: maxTeamsPerRun, processed_mlb_team_ids: processedNow, continuation_status: "partial_continue", last_continued_at: nowUtc(),
        lifecycle: "mine_to_stage_certify_promote_replace_main_clean_stage", no_26man_only_scope: true, no_every_minor_leaguer_scope: true,
        no_person_detail_hydration_in_v0_1_0: true, no_prizepicks_board_mutation: true, no_prizepicks_alias_guessing: true, no_sleeper_alias_guessing: true,
        no_scoring: true, no_final_board_write: true
      };

      return {
        ok: true, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY,
        request_id: input.request_id || null, chain_id: input.chain_id || null, batch_id: batchId,
        status: "partial_continue", certification: "STATIC_PLAYERS_40MAN_IDENTITY_STAGE_PARTIAL_CONTINUE",
        lifecycle: "mine_to_stage_certify_promote_replace_main_clean_stage", source_key: SOURCE_KEY, source_name: SOURCE_NAME,
        endpoint_pattern: "/teams/{mlb_team_id}/roster/40Man", teams_processed_this_run: teamsProcessedThisRun, teams_processed_total: processedNow.length,
        teams_remaining: remainingAfter.length, teams_expected: 30, rows_read: rosterRowsRead, rows_written: playersWrittenThisRun + aliasesWritten + rostersWritten,
        rows_written_target: "stage_only", main_tables_touched: false, stage_tables_touched: true, players_staged_this_run: playersWrittenThisRun,
        aliases_staged_this_run: aliasesWritten, rosters_staged_this_run: rostersWritten, external_calls_performed: externalCalls, max_teams_per_run: maxTeamsPerRun,
        continuation_input_json: continuationInputJson, source_samples: sourceSamples, team_summaries: teamSummaries,
        missing_detail_counts_from_roster_payload_this_run: { primary_position: missingPosition, bat_side: missingBatSide, throw_side: missingThrowSide, note: "Missing detail is counted, not guessed." },
        stage_certification_checks_so_far: checks, database_target: "postgres_ref_players", boundaries: base(env).boundaries, timestamp_utc: nowUtc()
      };
    }

    const stageChecks = await stageCertificationChecks(sql, batchId);
    const playerRows = Number(stageChecks.player_rows || 0);
    const duplicateMlbPlayerIds = Number(stageChecks.duplicate_mlb_player_id_count || 0);
    const missingMlbPlayerId = Number(stageChecks.missing_mlb_player_id || 0);
    const missingFullName = Number(stageChecks.missing_full_name_or_player_name || 0);
    const aliasRows = Number(stageChecks.alias_rows || 0);
    const rosterRows = Number(stageChecks.static_40man_roster_rows || 0);
    const activePlayerTeamCount = Number(stageChecks.active_player_team_count || 0);
    const activeRosterTeamCount = Number(stageChecks.active_roster_team_count || 0);

    const stageOk = processedNow.length === 30 && playerRows > 500 && rosterRows > 500 && activePlayerTeamCount === 30 && activeRosterTeamCount === 30 && duplicateMlbPlayerIds === 0 && missingMlbPlayerId === 0 && missingFullName === 0 && aliasRows > 0;

    if (!stageOk) {
      await updateStageBatchMetrics(sql, batchId, processedNow, "certification_failed", "STATIC_PLAYERS_STAGE_CERTIFICATION_FAILED", { stageChecks });
      return {
        ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY,
        request_id: input.request_id || null, chain_id: input.chain_id || null, batch_id: batchId,
        status: "failed_certification", certification: "STATIC_PLAYERS_STAGE_CERTIFICATION_FAILED_MAIN_NOT_TOUCHED",
        lifecycle: "mine_to_stage_certify_promote_replace_main_clean_stage", main_tables_touched: false, stage_tables_retained_for_inspection: true,
        source_key: SOURCE_KEY, source_name: SOURCE_NAME, teams_processed_this_run: teamsProcessedThisRun, teams_processed_total: processedNow.length,
        teams_remaining: 0, teams_expected: 30, rows_read: rosterRowsRead, rows_written: playersWrittenThisRun + aliasesWritten + rostersWritten,
        rows_written_target: "stage_only", stage_certification_checks: stageChecks, external_calls_performed: externalCalls,
        database_target: "postgres_ref_players", boundaries: base(env).boundaries, timestamp_utc: nowUtc()
      };
    }

    await updateStageBatchMetrics(sql, batchId, processedNow, "certified", "STATIC_PLAYERS_STAGE_CERTIFIED_READY_TO_PROMOTE");
    const promotion = await promoteCertifiedStage(sql, batchId, requestId);
    if (!promotion.promoted) {
      return {
        ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY,
        request_id: input.request_id || null, chain_id: input.chain_id || null, batch_id: batchId,
        status: "promotion_failed", certification: "STATIC_PLAYERS_STAGE_CERTIFIED_MAIN_PROMOTION_FAILED",
        lifecycle: "mine_to_stage_certify_promote_replace_main_clean_stage", stage_certification_checks: stageChecks, main_certification_checks: promotion.mainChecks,
        stage_tables_retained_for_inspection: true, rows_read: rosterRowsRead, rows_written: playersWrittenThisRun + aliasesWritten + rostersWritten,
        rows_written_target: "stage_then_failed_main_promotion", external_calls_performed: externalCalls, database_target: "postgres_ref_players",
        boundaries: base(env).boundaries, timestamp_utc: nowUtc()
      };
    }

    const mainChecks = promotion.mainChecks;
    const cleanup = await stageCleanupCounts(sql, batchId);
    return {
      ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY,
      request_id: input.request_id || null, chain_id: input.chain_id || null, batch_id: batchId,
      status: "completed", certification: "STATIC_PLAYERS_STAGE_CERTIFIED_PROMOTED_MAIN_CLEANED",
      lifecycle: "mine_to_stage_certify_promote_replace_main_clean_stage", source_key: SOURCE_KEY, source_name: SOURCE_NAME,
      endpoint_pattern: "/teams/{mlb_team_id}/roster/40Man", source_samples: sourceSamples, teams_processed_this_run: teamsProcessedThisRun,
      teams_processed_total: processedNow.length, teams_remaining: 0, teams_expected: 30, rows_read: rosterRowsRead,
      rows_written: playersWrittenThisRun + aliasesWritten + rostersWritten, rows_written_target: "stage_certified_promoted_to_main", main_tables_touched: true,
      stage_tables_cleaned: cleanup.total_stage_rows_for_batch === 0, players_staged_this_run: playersWrittenThisRun,
      players_total_active_source_rows: Number(mainChecks.player_rows || 0), aliases_staged_this_run: aliasesWritten, alias_rows_total: Number(mainChecks.alias_rows || 0),
      rosters_staged_this_run: rostersWritten, static_40man_roster_rows_total: Number(mainChecks.static_40man_roster_rows || 0),
      active_player_team_count: Number(mainChecks.active_player_team_count || 0), active_roster_team_count: Number(mainChecks.active_roster_team_count || 0),
      real_differential_rows_changed_this_run: promotion.real_rows_changed_this_run || 0,
      differential_note: "Every player is still staged and touched for real 'seen this run' bookkeeping, but only rows that genuinely differ from current ref.players are actually rewritten.",
      external_calls_performed: externalCalls, max_teams_per_run: maxTeamsPerRun, hydration_calls_performed_this_run: hydrationCallsPerformed,
      players_hydrated_bat_side_this_run: playersHydratedThisRun,
      missing_detail_counts_from_roster_payload_this_run: { primary_position: missingPosition, bat_side: missingBatSide, throw_side: missingThrowSide, note: "Missing detail is counted, not guessed." },
      stage_certification_checks: stageChecks, main_certification_checks: mainChecks, staging_cleanup: cleanup,
      final_missing_detail_counts_from_active_source_rows: { primary_position: Number(mainChecks.missing_primary_position || 0), bat_side: Number(mainChecks.missing_bat_side || 0), throw_side: Number(mainChecks.missing_throw_side || 0), note: "Hydrated via /people batch calls for any player missing them after the roster payload." },
      team_summaries: teamSummaries, sample_players: await samplePlayers(sql), database_target: "postgres_ref_players",
      boundaries: base(env).boundaries, timestamp_utc: nowUtc()
    };
  } finally {
    await sql.end();
  }
}

async function stageCertificationChecks(sql, batchId) {
  const rows = await sql`SELECT
      (SELECT COUNT(*)::int FROM ref.players_stage WHERE batch_id=${batchId} AND source_key=${SOURCE_KEY} AND COALESCE(active,1)=1) AS player_rows,
      (SELECT COUNT(*)::int FROM ref.players_stage WHERE batch_id=${batchId} AND source_key=${SOURCE_KEY} AND COALESCE(active,1)=1 AND (mlb_player_id IS NULL)) AS missing_mlb_player_id,
      (SELECT COUNT(*)::int FROM ref.players_stage WHERE batch_id=${batchId} AND source_key=${SOURCE_KEY} AND COALESCE(active,1)=1 AND (COALESCE(full_name, player_name, '')='')) AS missing_full_name_or_player_name,
      (SELECT COUNT(*)::int FROM (SELECT mlb_player_id FROM ref.players_stage WHERE batch_id=${batchId} AND source_key=${SOURCE_KEY} AND COALESCE(active,1)=1 AND mlb_player_id IS NOT NULL GROUP BY mlb_player_id HAVING COUNT(*) > 1) x) AS duplicate_mlb_player_id_count,
      (SELECT COUNT(*)::int FROM ref.player_aliases_stage WHERE batch_id=${batchId} AND source_key=${SOURCE_KEY} AND COALESCE(active,1)=1) AS alias_rows,
      (SELECT COUNT(*)::int FROM ref.rosters_stage WHERE batch_id=${batchId} AND source_key=${SOURCE_KEY} AND snapshot_type='STATIC_40MAN_SNAPSHOT' AND COALESCE(active,1)=1) AS static_40man_roster_rows,
      (SELECT COUNT(*)::int FROM (SELECT current_team_id FROM ref.players_stage WHERE batch_id=${batchId} AND source_key=${SOURCE_KEY} AND COALESCE(active,1)=1 GROUP BY current_team_id) x) AS active_player_team_count,
      (SELECT COUNT(*)::int FROM (SELECT team_id FROM ref.rosters_stage WHERE batch_id=${batchId} AND source_key=${SOURCE_KEY} AND snapshot_type='STATIC_40MAN_SNAPSHOT' AND COALESCE(active,1)=1 GROUP BY team_id) x) AS active_roster_team_count,
      (SELECT COUNT(*)::int FROM ref.players_stage WHERE batch_id=${batchId} AND source_key=${SOURCE_KEY} AND COALESCE(active,1)=1 AND COALESCE(primary_position, primary_role, '')='') AS missing_primary_position,
      (SELECT COUNT(*)::int FROM ref.players_stage WHERE batch_id=${batchId} AND source_key=${SOURCE_KEY} AND COALESCE(active,1)=1 AND COALESCE(bat_side, bats, '')='') AS missing_bat_side,
      (SELECT COUNT(*)::int FROM ref.players_stage WHERE batch_id=${batchId} AND source_key=${SOURCE_KEY} AND COALESCE(active,1)=1 AND COALESCE(throw_side, throws, '')='') AS missing_throw_side
  `;
  return rows[0] || {};
}

async function certificationChecks(sql) {
  const rows = await sql`SELECT
      (SELECT COUNT(*)::int FROM ref.players WHERE source_key=${SOURCE_KEY} AND COALESCE(active,1)=1) AS player_rows,
      (SELECT COUNT(*)::int FROM ref.players WHERE source_key=${SOURCE_KEY} AND COALESCE(active,1)=1 AND (mlb_player_id IS NULL)) AS missing_mlb_player_id,
      (SELECT COUNT(*)::int FROM ref.players WHERE source_key=${SOURCE_KEY} AND COALESCE(active,1)=1 AND (COALESCE(full_name, player_name, '')='')) AS missing_full_name_or_player_name,
      (SELECT COUNT(*)::int FROM (SELECT mlb_player_id FROM ref.players WHERE source_key=${SOURCE_KEY} AND COALESCE(active,1)=1 AND mlb_player_id IS NOT NULL GROUP BY mlb_player_id HAVING COUNT(*) > 1) x) AS duplicate_mlb_player_id_count,
      (SELECT COUNT(*)::int FROM ref.player_aliases WHERE source_key=${SOURCE_KEY} AND COALESCE(active,1)=1) AS alias_rows,
      (SELECT COUNT(*)::int FROM ref.rosters WHERE source_key=${SOURCE_KEY} AND snapshot_type='STATIC_40MAN_SNAPSHOT' AND COALESCE(active,1)=1) AS static_40man_roster_rows,
      (SELECT COUNT(*)::int FROM (SELECT current_team_id FROM ref.players WHERE source_key=${SOURCE_KEY} AND COALESCE(active,1)=1 GROUP BY current_team_id) x) AS active_player_team_count,
      (SELECT COUNT(*)::int FROM (SELECT team_id FROM ref.rosters WHERE source_key=${SOURCE_KEY} AND snapshot_type='STATIC_40MAN_SNAPSHOT' AND COALESCE(active,1)=1 GROUP BY team_id) x) AS active_roster_team_count,
      (SELECT COUNT(*)::int FROM ref.players WHERE source_key=${SOURCE_KEY} AND COALESCE(active,1)=1 AND COALESCE(primary_position, primary_role, '')='') AS missing_primary_position,
      (SELECT COUNT(*)::int FROM ref.players WHERE source_key=${SOURCE_KEY} AND COALESCE(active,1)=1 AND COALESCE(bat_side, bats, '')='') AS missing_bat_side,
      (SELECT COUNT(*)::int FROM ref.players WHERE source_key=${SOURCE_KEY} AND COALESCE(active,1)=1 AND COALESCE(throw_side, throws, '')='') AS missing_throw_side
  `;
  return rows[0] || {};
}

async function stageCleanupCounts(sql, batchId) {
  const rows = await sql`SELECT
      (SELECT COUNT(*)::int FROM ref.players_stage WHERE batch_id=${batchId}) AS players_stage_rows,
      (SELECT COUNT(*)::int FROM ref.player_aliases_stage WHERE batch_id=${batchId}) AS aliases_stage_rows,
      (SELECT COUNT(*)::int FROM ref.rosters_stage WHERE batch_id=${batchId}) AS rosters_stage_rows
  `;
  const out = rows[0] || { players_stage_rows: 0, aliases_stage_rows: 0, rosters_stage_rows: 0 };
  out.total_stage_rows_for_batch = Number(out.players_stage_rows || 0) + Number(out.aliases_stage_rows || 0) + Number(out.rosters_stage_rows || 0);
  return out;
}

async function samplePlayers(sql) {
  return await sql`SELECT player_id, mlb_player_id, full_name, first_name, last_name, current_team_id, current_mlb_team_id, primary_position, bat_side, throw_side, source_key, active
    FROM ref.players WHERE source_key=${SOURCE_KEY} AND COALESCE(active,1)=1 ORDER BY current_team_id, full_name LIMIT 12`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "GET" && path === "/") {
      return jsonResponse(base(env));
    }

    if (method === "GET" && path === "/health") {
      const bindings = bindingPresence(env, REQUIRED_DB_BINDINGS);
      const vars = varPresence(env, EXPECTED_VARS);
      return jsonResponse(base(env, {
        route: "/health",
        checks: { required_db_bindings_present: allTrue(bindings), expected_vars_present: allTrue(vars), db_bindings: bindings, vars, hyperdrive_bound: !!env.HYPERDRIVE }
      }));
    }

    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      let teams = [];
      const sql = pg(env);
      try { teams = await readActiveTeams(sql); } catch (_) { teams = []; } finally { await sql.end(); }
      return jsonResponse(base(env, {
        route: "/diagnostic",
        input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, job_key: input.job_key || null, mode: input.mode || null },
        ref_teams_probe: { active_team_rows_with_mlb_team_id: teams.length, sample: teams.slice(0, 5) },
        writes_performed: 0, external_calls_performed: 0
      }));
    }

    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        const output = await runSeed(env, input);
        return jsonResponse(output, output.ok ? 200 : 500);
      } catch (err) {
        return jsonResponse({
          ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY,
          request_id: input.request_id || null, chain_id: input.chain_id || null, status: "error",
          certification: "STATIC_PLAYERS_40MAN_IDENTITY_RUN_ERROR", error: String(err && err.stack ? err.stack : err),
          rows_read: 0, rows_written: 0, external_calls_performed: 0, boundaries: base(env).boundaries, timestamp_utc: nowUtc()
        }, 500);
      }
    }

    return jsonResponse({
      ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND",
      allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc()
    }, 404);
  }
};
