const WORKER_NAME = "alphadog-v2-daily-games-status";
const VERSION = "alphadog-v2-daily-games-status-v0.1.5-raw-event-shell-cross-board-resolution";
const JOB_KEY = "daily-games-status";
const MLB_SCHEDULE_SOURCE = "official_mlb_statsapi_schedule";
const MLB_SCHEDULE_ENDPOINT_PATH = "/api/v1/schedule?sportId=1&gameType=R&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD";
const MAX_BOARD_ROWS_PER_SOURCE = 5000;
const MAX_OUTPUT_CHARS = 1200;

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function safeString(value, max = MAX_OUTPUT_CHARS) {
  if (value === undefined || value === null) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type,x-ingest-token,x-admin-token,authorization",
      "access-control-allow-methods": "GET,POST,OPTIONS"
    }
  });
}
async function readJsonSafe(request) { try { return await request.json(); } catch (_) { return {}; } }
async function all(db, sql, ...binds) { const s = db.prepare(sql); const r = binds.length ? await s.bind(...binds).all() : await s.all(); return r.results || []; }
async function first(db, sql, ...binds) { const s = db.prepare(sql); return binds.length ? await s.bind(...binds).first() : await s.first(); }
async function run(db, sql, ...binds) { const s = db.prepare(sql); return binds.length ? await s.bind(...binds).run() : await s.run(); }
function normalize(v) { return String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim(); }
function dateOnly(value) {
  if (!value) return null;
  const text = String(value);
  const m = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function isoMs(value) { const d = new Date(value || ""); return Number.isNaN(d.getTime()) ? null : d.getTime(); }
function minutesAbs(a, b) { const am = isoMs(a), bm = isoMs(b); return am === null || bm === null ? null : Math.abs(am - bm) / 60000; }
function unique(arr) { return [...new Set(arr.filter(Boolean))]; }
function parseJsonMaybe(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try { return JSON.parse(String(value)); } catch (_) { return null; }
}
function firstJsonValue(objects, keys) {
  for (const obj of objects || []) {
    if (!obj || typeof obj !== "object") continue;
    for (const k of keys) {
      const v = obj[k];
      if (v !== undefined && v !== null && String(v).length) return v;
    }
  }
  return null;
}
function canonicalSleeperEventShell(rawLineJson, rowPayloadJson) {
  const raw = parseJsonMaybe(rawLineJson);
  const payload = parseJsonMaybe(rowPayloadJson);
  const objs = [raw, payload];
  const home_team = firstJsonValue(objs, ["home_team", "homeTeam", "home"]);
  const away_team = firstJsonValue(objs, ["away_team", "awayTeam", "away"]);
  const game_date = firstJsonValue(objs, ["game_date", "gameDate", "event_date", "date"]);
  const commence_time = firstJsonValue(objs, ["commence_time", "commenceTime", "start_time", "startTime"]);
  const canonical_event_id = firstJsonValue(objs, ["canonical_event_id", "canonicalEventId", "canonical_event", "game_id"]);
  const event_id = firstJsonValue(objs, ["event_id", "eventId"]);
  if (!home_team && !away_team && !game_date && !commence_time && !canonical_event_id && !event_id) return null;
  return {
    event_id: event_id || null,
    canonical_event_id: canonical_event_id || null,
    game_date: game_date || dateOnly(commence_time) || null,
    commence_time: commence_time || null,
    home_team: home_team || null,
    away_team: away_team || null
  };
}

function base(extra = {}) {
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    scope: "Daily Schedule + Game Status only",
    source_strategy: {
      mlb_endpoint: MLB_SCHEDULE_ENDPOINT_PATH,
      board_tables_read: ["MARKET_DB.prizepicks_board_current", "MARKET_DB.sleeper_board_current"],
      write_tables: ["DAILY_DB.daily_game_status_batches", "DAILY_DB.daily_game_status_stage", "DAILY_DB.daily_game_status_current", "DAILY_DB.daily_game_status_outcomes", "DAILY_DB.daily_game_status_certifications"],
      forbidden_work: ["board mutation", "broad player resolving", "lineups", "starters", "weather", "bullpen", "market odds", "scoring", "ranking", "final board"],
      allowed_enrichment: ["read-only REF_DB team aliases", "read-only REF_DB active player/team roster context", "Sleeper raw event shell home/away/game_date enrichment", "cross-board PrizePicks player/team/game enrichment", "official MLB schedule opponent/home-away fill"]
    },
    timestamp_utc: nowUtc(),
    ...extra
  };
}

async function ensureSchema(env) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS daily_game_status_batches (
      batch_id TEXT PRIMARY KEY,
      job_key TEXT,
      source_key TEXT,
      mode TEXT,
      board_rows_read INTEGER DEFAULT 0,
      board_relevant_dates INTEGER DEFAULT 0,
      board_relevant_games INTEGER DEFAULT 0,
      mlb_schedule_dates_fetched INTEGER DEFAULT 0,
      mlb_schedule_games_seen INTEGER DEFAULT 0,
      staged_rows INTEGER DEFAULT 0,
      promoted_rows INTEGER DEFAULT 0,
      unsafe_rows INTEGER DEFAULT 0,
      warning_rows INTEGER DEFAULT 0,
      certification_status TEXT,
      certification_grade TEXT,
      certification_reason TEXT,
      certification_json TEXT,
      started_at TEXT,
      certified_at TEXT,
      promoted_at TEXT,
      cleaned_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS daily_game_status_stage (
      stage_id TEXT PRIMARY KEY,
      batch_id TEXT,
      source_key TEXT,
      board_source_key TEXT,
      board_batch_id TEXT,
      board_row_id TEXT,
      source_line_id TEXT,
      source_event_id TEXT,
      source_player_id TEXT,
      player_name TEXT,
      canonical_prop_key TEXT,
      board_team TEXT,
      board_opponent TEXT,
      board_start_time TEXT,
      board_slate_date TEXT,
      board_pickable_flag INTEGER,
      resolved_game_key TEXT,
      game_pk INTEGER,
      official_date TEXT,
      official_start_time_utc TEXT,
      away_mlb_team_id INTEGER,
      away_team_name TEXT,
      home_mlb_team_id INTEGER,
      home_team_name TEXT,
      venue_id INTEGER,
      venue_name TEXT,
      double_header TEXT,
      game_number INTEGER,
      abstract_game_state TEXT,
      coded_game_state TEXT,
      detailed_state TEXT,
      status_code TEXT,
      game_status_class TEXT,
      safety_status TEXT,
      pickable_safe INTEGER DEFAULT 0,
      has_started INTEGER DEFAULT 0,
      is_final INTEGER DEFAULT 0,
      is_postponed INTEGER DEFAULT 0,
      is_suspended INTEGER DEFAULT 0,
      is_delayed INTEGER DEFAULT 0,
      is_in_progress INTEGER DEFAULT 0,
      warning_flags TEXT,
      block_reason TEXT,
      match_method TEXT,
      source_confidence TEXT,
      board_mlb_start_time_delta_minutes REAL,
      source_endpoint TEXT,
      source_fetched_at TEXT,
      raw_board_json TEXT,
      raw_mlb_game_json TEXT,
      staged_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS daily_game_status_current (
      current_key TEXT PRIMARY KEY,
      batch_id TEXT,
      source_key TEXT,
      board_source_key TEXT,
      board_batch_id TEXT,
      board_row_id TEXT,
      source_line_id TEXT,
      source_event_id TEXT,
      source_player_id TEXT,
      player_name TEXT,
      canonical_prop_key TEXT,
      board_team TEXT,
      board_opponent TEXT,
      board_start_time TEXT,
      board_slate_date TEXT,
      board_pickable_flag INTEGER,
      resolved_game_key TEXT,
      game_pk INTEGER,
      official_date TEXT,
      official_start_time_utc TEXT,
      away_mlb_team_id INTEGER,
      away_team_name TEXT,
      home_mlb_team_id INTEGER,
      home_team_name TEXT,
      venue_id INTEGER,
      venue_name TEXT,
      double_header TEXT,
      game_number INTEGER,
      abstract_game_state TEXT,
      coded_game_state TEXT,
      detailed_state TEXT,
      status_code TEXT,
      game_status_class TEXT,
      safety_status TEXT,
      pickable_safe INTEGER DEFAULT 0,
      has_started INTEGER DEFAULT 0,
      is_final INTEGER DEFAULT 0,
      is_postponed INTEGER DEFAULT 0,
      is_suspended INTEGER DEFAULT 0,
      is_delayed INTEGER DEFAULT 0,
      is_in_progress INTEGER DEFAULT 0,
      warning_flags TEXT,
      block_reason TEXT,
      match_method TEXT,
      source_confidence TEXT,
      board_mlb_start_time_delta_minutes REAL,
      source_endpoint TEXT,
      source_fetched_at TEXT,
      raw_board_json TEXT,
      raw_mlb_game_json TEXT,
      promoted_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS daily_game_status_outcomes (
      outcome_id TEXT PRIMARY KEY,
      batch_id TEXT,
      outcome_key TEXT,
      outcome_status TEXT,
      outcome_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS daily_game_status_certifications (
      certification_id TEXT PRIMARY KEY,
      batch_id TEXT,
      certification_status TEXT,
      certification_grade TEXT,
      certification_reason TEXT,
      certification_json TEXT,
      certified_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_daily_game_status_current_game ON daily_game_status_current(game_pk, official_date)`,
    `CREATE INDEX IF NOT EXISTS idx_daily_game_status_current_safety ON daily_game_status_current(safety_status, pickable_safe)`,
    `CREATE INDEX IF NOT EXISTS idx_daily_game_status_current_board ON daily_game_status_current(board_source_key, board_slate_date, board_batch_id)`,
    `CREATE INDEX IF NOT EXISTS idx_daily_game_status_stage_batch ON daily_game_status_stage(batch_id)`,
    `INSERT OR REPLACE INTO daily_schema_migrations (migration_key, package_version, applied_at, notes) VALUES ('schema_daily_game_status_v0_1_0', '${VERSION}', CURRENT_TIMESTAMP, 'Additive board-focused Daily Game Status lifecycle tables')`
  ];
  for (const sql of statements) await run(env.DAILY_DB, sql);
}

async function tableColumns(db, table) {
  try { return (await all(db, `PRAGMA table_info(${table})`)).map(r => String(r.name || "")); }
  catch (e) { return []; }
}
function has(cols, name) { return cols.includes(name); }
function pick(row, keys) { for (const k of keys) if (row && row[k] !== undefined && row[k] !== null && String(row[k]).length) return row[k]; return null; }
function selectSql(table, cols, wanted, whereParts) {
  const selected = wanted.filter(w => has(cols, w)).map(w => w).join(", ");
  if (!selected) return null;
  return `SELECT ${selected} FROM ${table} ${whereParts || ""} LIMIT ${MAX_BOARD_ROWS_PER_SOURCE}`;
}

async function readTeamAliases(env) {
  const aliases = new Map();
  if (!env.REF_DB) return aliases;
  const cols = await tableColumns(env.REF_DB, "ref_team_aliases");
  if (!(has(cols, "alias_normalized") && has(cols, "mlb_team_id"))) return aliases;
  const rows = await all(env.REF_DB, "SELECT alias_normalized, mlb_team_id FROM ref_team_aliases WHERE active=1 AND alias_normalized IS NOT NULL AND mlb_team_id IS NOT NULL LIMIT 1000");
  for (const r of rows) aliases.set(normalize(r.alias_normalized), Number(r.mlb_team_id));
  return aliases;
}
function aliasTeamId(aliases, value) {
  const n = normalize(value);
  if (!n) return null;
  if (aliases.has(n)) return aliases.get(n);
  return null;
}

async function readTeamDirectory(env) {
  const byMlbId = new Map();
  const byTeamId = new Map();
  if (!env.REF_DB) return { byMlbId, byTeamId };
  const cols = await tableColumns(env.REF_DB, "ref_teams");
  if (!(has(cols, "team_id") && has(cols, "mlb_team_id"))) return { byMlbId, byTeamId };
  const select = [
    "team_id",
    "mlb_team_id",
    has(cols, "abbreviation") ? "abbreviation" : "NULL AS abbreviation",
    has(cols, "full_name") ? "full_name" : "NULL AS full_name",
    has(cols, "short_name") ? "short_name" : "NULL AS short_name",
    has(cols, "active") ? "active" : "1 AS active"
  ].join(", ");
  const activeWhere = has(cols, "active") ? "COALESCE(active,1)=1" : "1=1";
  const rows = await all(env.REF_DB, `SELECT ${select} FROM ref_teams WHERE ${activeWhere} AND mlb_team_id IS NOT NULL LIMIT 1000`);
  for (const r of rows) {
    const obj = {
      team_id: r.team_id || null,
      mlb_team_id: Number(r.mlb_team_id || 0) || null,
      abbreviation: r.abbreviation || null,
      full_name: r.full_name || null,
      short_name: r.short_name || null
    };
    if (obj.mlb_team_id) byMlbId.set(obj.mlb_team_id, obj);
    if (obj.team_id) byTeamId.set(String(obj.team_id), obj);
  }
  return { byMlbId, byTeamId };
}

function mergePlayerTeam(map, key, value) {
  const n = normalize(key);
  if (!n || !value || !value.mlb_team_id) return;
  const existing = map.get(n);
  if (!existing) { map.set(n, value); return; }
  if (existing.ambiguous) return;
  if (Number(existing.mlb_team_id) !== Number(value.mlb_team_id)) {
    map.set(n, { ambiguous: true, reason: "player_name_maps_to_multiple_active_teams" });
  }
}

async function readPlayerTeamMap(env, teamDir) {
  const out = new Map();
  if (!env.REF_DB) return out;
  const pa = await tableColumns(env.REF_DB, "ref_player_aliases");
  const pcols = await tableColumns(env.REF_DB, "ref_players");
  const tcols = await tableColumns(env.REF_DB, "ref_teams");
  if (!(has(pa, "player_id") && has(pa, "alias_name") && has(pcols, "player_id"))) return out;
  const paTeam = has(pa, "team_id") ? "pa.team_id" : "NULL";
  const paMlbTeam = has(pa, "mlb_team_id") ? "pa.mlb_team_id" : "NULL";
  const pCurrentTeam = has(pcols, "current_team_id") ? "p.current_team_id" : "NULL";
  const pPrimaryTeam = has(pcols, "primary_team_id") ? "p.primary_team_id" : "NULL";
  const pCurrentMlb = has(pcols, "current_mlb_team_id") ? "p.current_mlb_team_id" : "NULL";
  const pName = has(pcols, "player_name") ? "p.player_name" : "NULL";
  const pFull = has(pcols, "full_name") ? "p.full_name" : "NULL";
  const aliasNorm = has(pa, "alias_normalized") ? "pa.alias_normalized" : "NULL";
  const aliasActive = has(pa, "active") ? "COALESCE(pa.active,1)=1" : "1=1";
  const playerActive = has(pcols, "active") ? "COALESCE(p.active,1)=1" : "1=1";
  const joinTeamExpr = `COALESCE(${paTeam}, ${pCurrentTeam}, ${pPrimaryTeam})`;
  const teamAbbr = has(tcols, "abbreviation") ? "t.abbreviation" : "NULL";
  const teamMlb = has(tcols, "mlb_team_id") ? "t.mlb_team_id" : "NULL";
  const rows = await all(env.REF_DB, `
    SELECT
      pa.alias_name AS alias_name,
      ${aliasNorm} AS alias_normalized,
      pa.player_id AS player_id,
      ${pName} AS player_name,
      ${pFull} AS full_name,
      COALESCE(${paTeam}, ${pCurrentTeam}, ${pPrimaryTeam}) AS team_id,
      COALESCE(${paMlbTeam}, ${pCurrentMlb}, ${teamMlb}) AS mlb_team_id,
      ${teamAbbr} AS abbreviation
    FROM ref_player_aliases pa
    LEFT JOIN ref_players p ON p.player_id=pa.player_id
    LEFT JOIN ref_teams t ON t.team_id=${joinTeamExpr}
    WHERE ${aliasActive} AND ${playerActive}
    LIMIT 20000
  `);
  for (const r of rows) {
    const mlbTeamId = Number(r.mlb_team_id || 0) || null;
    const teamObj = mlbTeamId ? (teamDir.byMlbId.get(mlbTeamId) || {}) : {};
    const value = {
      player_id: r.player_id || null,
      team_id: r.team_id || teamObj.team_id || null,
      mlb_team_id: mlbTeamId,
      abbreviation: r.abbreviation || teamObj.abbreviation || null,
      method: "ref_player_alias_active_team"
    };
    mergePlayerTeam(out, r.alias_name, value);
    mergePlayerTeam(out, r.alias_normalized, value);
    mergePlayerTeam(out, r.player_name, value);
    mergePlayerTeam(out, r.full_name, value);
  }
  return out;
}

function teamAbbrFromId(teamDir, teamId) {
  const t = teamDir && teamId ? teamDir.byMlbId.get(Number(teamId)) : null;
  return t?.abbreviation || t?.full_name || (teamId ? String(teamId) : null);
}
function sleeperShellTeamIds(shell, aliases) {
  if (!shell) return { homeId: null, awayId: null };
  return {
    homeId: aliasTeamId(aliases, shell.home_team),
    awayId: aliasTeamId(aliases, shell.away_team)
  };
}
function buildPrizePicksPlayerTeamMap(prizePicksRows, aliases) {
  const map = new Map();
  for (const r of prizePicksRows || []) {
    const name = normalize(r.player_name);
    const teamId = aliasTeamId(aliases, r.team);
    if (!name || !teamId) continue;
    if (!map.has(name)) map.set(name, []);
    map.get(name).push({
      player_name: r.player_name,
      team: r.team,
      team_id: teamId,
      opponent: r.opponent || null,
      start_time: r.start_time || null,
      slate_date: r.slate_date || dateOnly(r.start_time) || null,
      source_event_id: r.source_event_id || null,
      board_row_id: r.board_row_id || null
    });
  }
  return map;
}
function applySleeperRawEventShell(row, aliases, teamDir) {
  const shell = row.sleeper_event_shell;
  if (!shell) return false;
  const ids = sleeperShellTeamIds(shell, aliases);
  if (!ids.homeId || !ids.awayId) return false;
  row.sleeper_home_mlb_team_id = ids.homeId;
  row.sleeper_away_mlb_team_id = ids.awayId;
  row.sleeper_raw_game_date = shell.game_date || null;
  row.sleeper_raw_commence_time = shell.commence_time || null;
  row.sleeper_canonical_event_id = shell.canonical_event_id || null;
  if (!row.source_event_id && shell.event_id) row.source_event_id = shell.event_id;
  const currentTeamId = aliasTeamId(aliases, row.team) || (row.enriched_mlb_team_id ? Number(row.enriched_mlb_team_id) : null);
  if (currentTeamId) {
    if (!row.team) row.team = teamAbbrFromId(teamDir, currentTeamId);
    const oppId = Number(currentTeamId) === Number(ids.homeId) ? ids.awayId : (Number(currentTeamId) === Number(ids.awayId) ? ids.homeId : null);
    if (oppId && !row.opponent) {
      row.opponent = teamAbbrFromId(teamDir, oppId);
      row.enriched_opponent_mlb_team_id = Number(oppId);
      row.enriched_opponent_method = "sleeper_raw_event_shell_opponent";
      row.enrichment_flags.push("opponent_filled_from_sleeper_raw_event_shell");
    }
  }
  row.enrichment_flags.push("sleeper_raw_event_shell_available");
  return true;
}
function applyCrossBoardPrizePicksTeam(row, ppPlayerTeamMap, aliases, teamDir) {
  if (!row.sleeper_event_shell || row.team || !row.player_name) return false;
  const ids = sleeperShellTeamIds(row.sleeper_event_shell, aliases);
  if (!ids.homeId || !ids.awayId) return false;
  const candidates = (ppPlayerTeamMap.get(normalize(row.player_name)) || []).filter(c => Number(c.team_id) === Number(ids.homeId) || Number(c.team_id) === Number(ids.awayId));
  const uniqueTeamIds = unique(candidates.map(c => String(c.team_id)));
  if (uniqueTeamIds.length !== 1) return false;
  const teamId = Number(uniqueTeamIds[0]);
  const sample = candidates[0];
  row.team = teamAbbrFromId(teamDir, teamId);
  row.enriched_mlb_team_id = teamId;
  row.enriched_team_method = "cross_board_prizepicks_player_team_with_sleeper_event_shell";
  const oppId = Number(teamId) === Number(ids.homeId) ? ids.awayId : ids.homeId;
  row.opponent = teamAbbrFromId(teamDir, oppId);
  row.enriched_opponent_mlb_team_id = Number(oppId);
  row.enriched_opponent_method = "cross_board_prizepicks_player_team_with_sleeper_event_shell";
  row.cross_board_prizepicks_start_time = sample.start_time || null;
  row.cross_board_prizepicks_slate_date = sample.slate_date || dateOnly(sample.start_time) || null;
  row.cross_board_prizepicks_source_event_id = sample.source_event_id || null;
  row.enrichment_flags.push("team_filled_from_cross_board_prizepicks_player_team");
  row.enrichment_flags.push("opponent_filled_from_cross_board_prizepicks_player_team");
  return true;
}

function enrichBoardRows(rows, playerTeamMap, aliases = new Map(), teamDir = null, prizePicksRows = []) {
  let teamFilled = 0, ambiguous = 0, opponentFilled = 0, eventPairResolved = 0, eventPairAmbiguous = 0, rawEventShellResolved = 0, crossBoardTeamFilled = 0;
  const ppPlayerTeamMap = buildPrizePicksPlayerTeamMap(prizePicksRows, aliases);
  for (const r of rows) {
    r.enrichment_flags = [];
    if (!r.team && r.player_name) {
      const hit = playerTeamMap.get(normalize(r.player_name));
      if (hit && hit.ambiguous) {
        r.enrichment_flags.push("player_team_mapping_ambiguous");
        ambiguous++;
      } else if (hit && hit.mlb_team_id && hit.abbreviation) {
        r.team = hit.abbreviation;
        r.enriched_mlb_team_id = Number(hit.mlb_team_id);
        r.enriched_team_method = hit.method || "ref_player_active_team";
        r.enrichment_flags.push("team_filled_from_ref_player_team_context");
        teamFilled++;
      }
    }
    if (String(r.board_source_key || r.source_key || "") === "parlay_sleeper") {
      const beforeTeam = !!r.team;
      if (!beforeTeam && applyCrossBoardPrizePicksTeam(r, ppPlayerTeamMap, aliases, teamDir)) crossBoardTeamFilled++;
      if (applySleeperRawEventShell(r, aliases, teamDir)) rawEventShellResolved++;
    }
  }

  // Backstop for older Sleeper rows without raw home/away shell: use exactly-two-team event clusters.
  const events = new Map();
  for (const r of rows) {
    const src = String(r.board_source_key || r.source_key || "");
    const eventId = String(r.source_event_id || "").trim();
    if (!eventId || src !== "parlay_sleeper" || r.sleeper_event_shell) continue;
    const teamId = aliasTeamId(aliases, r.team) || (r.enriched_mlb_team_id ? Number(r.enriched_mlb_team_id) : null);
    if (!teamId) continue;
    if (!events.has(eventId)) events.set(eventId, { rows: [], teamIds: new Set() });
    const ev = events.get(eventId);
    ev.rows.push(r);
    ev.teamIds.add(Number(teamId));
  }
  for (const [eventId, ev] of events.entries()) {
    const teamIds = Array.from(ev.teamIds).filter(Boolean);
    if (teamIds.length === 2) {
      eventPairResolved++;
      for (const r of ev.rows) {
        const myId = aliasTeamId(aliases, r.team) || (r.enriched_mlb_team_id ? Number(r.enriched_mlb_team_id) : null);
        const otherId = teamIds.find(id => Number(id) !== Number(myId));
        const other = otherId && teamDir ? teamDir.byMlbId.get(Number(otherId)) : null;
        if (!r.opponent && otherId) {
          r.opponent = other?.abbreviation || other?.full_name || String(otherId);
          r.enriched_opponent_mlb_team_id = Number(otherId);
          r.enriched_opponent_method = "sleeper_source_event_two_team_cluster";
          r.enrichment_flags.push("opponent_filled_from_sleeper_event_team_cluster");
          opponentFilled++;
        }
      }
    } else if (teamIds.length > 2) {
      eventPairAmbiguous++;
      for (const r of ev.rows) r.enrichment_flags.push("sleeper_event_team_cluster_ambiguous");
    }
  }
  return { teamFilled, opponentFilled, eventPairResolved, eventPairAmbiguous, rawEventShellResolved, crossBoardTeamFilled, ambiguous };
}

async function readPrizePicksRows(env) {
  const cols = await tableColumns(env.MARKET_DB, "prizepicks_board_current");
  const wanted = ["current_row_id", "batch_id", "source_key", "slate_date", "projection_id", "player_id", "player_name", "team", "opponent", "stat_type", "line_score", "start_time", "board_time", "end_time", "game_id", "pickable_flag", "raw_projection_json", "row_payload_json"];
  const where = has(cols, "pickable_flag") ? "WHERE COALESCE(pickable_flag,0)=1" : "";
  const sql = selectSql("prizepicks_board_current", cols, wanted, where);
  if (!sql) return { rows: [], columns: cols, error: "missing_readable_columns" };
  const rows = await all(env.MARKET_DB, sql);
  return { columns: cols, rows: rows.map(r => ({
    source_key: "prizepicks_github",
    board_source_key: pick(r, ["source_key"]) || "prizepicks_github",
    board_batch_id: pick(r, ["batch_id"]),
    board_row_id: pick(r, ["current_row_id", "projection_id"]),
    source_line_id: pick(r, ["projection_id", "current_row_id"]),
    source_event_id: pick(r, ["game_id"]),
    source_player_id: pick(r, ["player_id"]),
    player_name: pick(r, ["player_name"]),
    canonical_prop_key: pick(r, ["stat_type"]),
    team: pick(r, ["team"]),
    opponent: pick(r, ["opponent"]),
    start_time: pick(r, ["start_time", "board_time", "end_time"]),
    slate_date: pick(r, ["slate_date"]),
    pickable_flag: Number(pick(r, ["pickable_flag"]) ?? 1),
    raw_board_json: pick(r, ["row_payload_json", "raw_projection_json"]),
    raw_row: r
  })) };
}

async function readSleeperRows(env) {
  const cols = await tableColumns(env.MARKET_DB, "sleeper_board_current");
  const wanted = ["current_row_id", "batch_id", "source_key", "slate_date", "source_event_id", "source_line_id", "source_player_id", "player_name", "team", "opponent", "canonical_prop_key", "source_stat_name", "line_value", "side", "is_pickable", "start_time", "raw_line_json", "row_payload_json"];
  const where = has(cols, "is_pickable") ? "WHERE COALESCE(is_pickable,0)=1" : "";
  const sql = selectSql("sleeper_board_current", cols, wanted, where);
  if (!sql) return { rows: [], columns: cols, error: "missing_readable_columns" };
  const rows = await all(env.MARKET_DB, sql);
  return { columns: cols, rows: rows.map(r => {
    const rawLine = pick(r, ["raw_line_json"]);
    const payload = pick(r, ["row_payload_json"]);
    const shell = canonicalSleeperEventShell(rawLine, payload);
    return {
      source_key: "sleeper",
      board_source_key: pick(r, ["source_key"]) || "sleeper",
      board_batch_id: pick(r, ["batch_id"]),
      board_row_id: pick(r, ["current_row_id", "source_line_id"]),
      source_line_id: pick(r, ["source_line_id", "current_row_id"]),
      source_event_id: pick(r, ["source_event_id"]) || shell?.event_id || null,
      source_player_id: pick(r, ["source_player_id"]),
      player_name: pick(r, ["player_name"]),
      canonical_prop_key: pick(r, ["canonical_prop_key", "source_stat_name"]),
      team: pick(r, ["team"]),
      opponent: pick(r, ["opponent"]),
      start_time: pick(r, ["start_time"]) || shell?.commence_time || null,
      slate_date: pick(r, ["slate_date"]) || shell?.game_date || dateOnly(shell?.commence_time),
      pickable_flag: Number(pick(r, ["is_pickable"]) ?? 1),
      raw_board_json: payload || rawLine,
      raw_line_json: rawLine,
      row_payload_json: payload,
      sleeper_event_shell: shell,
      raw_row: r
    };
  }) };
}

async function fetchMlbSchedule(env, dates) {
  const baseUrl = String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com/api/v1").replace(/\/+$/, "");
  const out = { dates_fetched: 0, games_seen: 0, games: [], fetches: [], errors: [] };
  for (const d of dates) {
    const url = `${baseUrl}/schedule?sportId=1&gameType=R&startDate=${encodeURIComponent(d)}&endDate=${encodeURIComponent(d)}`;
    const fetchedAt = nowUtc();
    try {
      const resp = await fetch(url, { headers: { "accept": "application/json", "user-agent": String(env.MLB_API_USER_AGENT || "AlphaDogV2DailyGameStatus/0.1") } });
      const text = await resp.text();
      let json = null;
      try { json = JSON.parse(text); } catch (_) {}
      out.fetches.push({ date: d, endpoint: url, http_status: resp.status, fetched_at: fetchedAt, response_bytes: text.length });
      if (!resp.ok || !json) { out.errors.push({ date: d, endpoint: url, http_status: resp.status, response_preview: text.slice(0, 600) }); continue; }
      out.dates_fetched += 1;
      const dateRows = Array.isArray(json.dates) ? json.dates : [];
      for (const dateRow of dateRows) {
        const games = Array.isArray(dateRow.games) ? dateRow.games : [];
        for (const g of games) {
          out.games_seen += 1;
          out.games.push({ ...g, __source_endpoint: url, __source_fetched_at: fetchedAt, __schedule_date: d });
        }
      }
    } catch (err) {
      out.errors.push({ date: d, endpoint: url, error: safeString(err && err.message ? err.message : err, 600), fetched_at: fetchedAt });
    }
  }
  return out;
}

function classifyGame(game, boardRow, nowMs) {
  const status = game && game.status ? game.status : {};
  const abstractState = String(status.abstractGameState || "");
  const coded = String(status.codedGameState || "");
  const detailed = String(status.detailedState || "");
  const statusCode = String(status.statusCode || "");
  const joined = `${abstractState} ${coded} ${detailed} ${statusCode}`.toLowerCase();
  const officialStart = game && game.gameDate ? game.gameDate : null;
  const startMs = isoMs(officialStart);
  const boardStartMs = isoMs(boardRow.start_time);
  const hasStarted = /in progress|live|warmup|final|completed|suspended|delayed/.test(joined) || (startMs !== null && nowMs >= startMs);
  const isFinal = /final|completed|game over/.test(joined) || abstractState.toLowerCase() === "final";
  const isPostponed = /postponed/.test(joined);
  const isSuspended = /suspended/.test(joined);
  const isDelayed = /delayed/.test(joined);
  const isInProgress = /in progress|live/.test(joined) || abstractState.toLowerCase() === "live";
  const warnings = [];
  const delta = minutesAbs(boardRow.start_time, officialStart);
  if (delta !== null && delta > 15) warnings.push("warning_board_mlb_time_mismatch");
  if (boardStartMs !== null && nowMs >= boardStartMs) warnings.push("warning_board_time_past");
  let safety = "safe_pregame";
  let block = null;
  if (!game) { safety = "blocked_missing_game_time"; block = "official_game_not_resolved"; }
  else if (!officialStart) { safety = "blocked_missing_game_time"; block = "official_start_time_missing"; }
  else if (isFinal) { safety = "blocked_final"; block = "official_game_final"; }
  else if (isPostponed) { safety = "blocked_postponed"; block = "official_game_postponed"; }
  else if (isSuspended) { safety = "blocked_suspended"; block = "official_game_suspended"; }
  else if (isInProgress || hasStarted) { safety = "blocked_started"; block = "official_game_started_or_in_progress"; }
  else if (boardStartMs !== null && nowMs >= boardStartMs) { safety = "blocked_board_time_past"; block = "board_start_time_in_past"; }
  else if (isDelayed) { safety = "review_required"; block = "official_game_delayed_review_required"; }
  return { abstractState, coded, detailed, statusCode, hasStarted, isFinal, isPostponed, isSuspended, isDelayed, isInProgress, warnings, delta, safety, block, pickableSafe: safety === "safe_pregame" ? 1 : 0 };
}

function scheduleTeamIds(game, teamDir = null) {
  const away = Number(game?.teams?.away?.team?.id || 0) || null;
  const home = Number(game?.teams?.home?.team?.id || 0) || null;
  const awayRef = teamDir && away ? teamDir.byMlbId.get(away) : null;
  const homeRef = teamDir && home ? teamDir.byMlbId.get(home) : null;
  return {
    away,
    home,
    awayName: game?.teams?.away?.team?.name || awayRef?.full_name || null,
    homeName: game?.teams?.home?.team?.name || homeRef?.full_name || null,
    awayAbbr: awayRef?.abbreviation || null,
    homeAbbr: homeRef?.abbreviation || null
  };
}
function gamesForDate(games, dateValue) {
  const d = dateOnly(dateValue);
  if (!d) return [];
  return games.filter(g => (g.officialDate || dateOnly(g.gameDate) || g.__schedule_date) === d || dateOnly(g.gameDate) === d || g.__schedule_date === d);
}
function gamesForTeamPair(games, homeId, awayId, teamDir = null) {
  if (!homeId || !awayId) return [];
  return games.filter(g => {
    const t = scheduleTeamIds(g, teamDir);
    return Number(t.home) === Number(homeId) && Number(t.away) === Number(awayId);
  });
}
function gamesForUnorderedTeamPair(games, teamId, oppId, teamDir = null) {
  if (!teamId || !oppId) return [];
  return games.filter(g => {
    const t = scheduleTeamIds(g, teamDir);
    return (Number(t.away) === Number(teamId) && Number(t.home) === Number(oppId)) ||
      (Number(t.home) === Number(teamId) && Number(t.away) === Number(oppId)) ||
      (Number(t.away) === Number(oppId) && Number(t.home) === Number(teamId)) ||
      (Number(t.home) === Number(oppId) && Number(t.away) === Number(teamId));
  });
}
function bestStartTimeMatch(games, startTime, maxMinutes = 15) {
  if (!startTime) return null;
  const sorted = games.map(g => ({ g, delta: minutesAbs(startTime, g.gameDate) })).filter(x => x.delta !== null).sort((a, b) => a.delta - b.delta);
  if (!sorted.length || sorted[0].delta > maxMinutes) return null;
  return { game: sorted[0].g, delta: sorted[0].delta };
}
function matchGame(row, games, aliases, teamDir = null) {
  const sourceEvent = String(row.source_event_id || "").trim();
  const shell = row.sleeper_event_shell || null;
  if (shell) {
    const ids = sleeperShellTeamIds(shell, aliases);
    if (ids.homeId && ids.awayId) {
      // Cross-board PrizePicks carries a stronger board-time anchor than Sleeper commence_time.
      // Use it first when available, because Sleeper raw commence_time can be a source placeholder
      // while the raw event shell still has the correct teams/game container.
      if (row.cross_board_prizepicks_start_time) {
        const crossDateGames = gamesForDate(games, row.cross_board_prizepicks_start_time || row.cross_board_prizepicks_slate_date);
        const crossPair = gamesForTeamPair(crossDateGames, ids.homeId, ids.awayId, teamDir);
        const crossTimeHit = bestStartTimeMatch(crossPair, row.cross_board_prizepicks_start_time, 20);
        if (crossTimeHit) {
          return { game: crossTimeHit.game, method: "sleeper_raw_event_shell_cross_board_prizepicks_official_schedule", confidence: "HIGH" };
        }
      }
      const shellDateGames = gamesForDate(games, shell.game_date || row.slate_date || row.start_time);
      const exactHomeAway = gamesForTeamPair(shellDateGames, ids.homeId, ids.awayId, teamDir);
      if (exactHomeAway.length === 1) {
        return { game: exactHomeAway[0], method: "sleeper_raw_event_shell_team_pair_official_schedule", confidence: "HIGH" };
      }
      if (exactHomeAway.length > 1) {
        const rawTimeHit = bestStartTimeMatch(exactHomeAway, shell.commence_time || row.start_time, 90);
        if (rawTimeHit) return { game: rawTimeHit.game, method: rawTimeHit.delta <= 15 ? "sleeper_raw_event_shell_team_pair_exact_start_time" : "sleeper_raw_event_shell_team_pair_near_start_time", confidence: rawTimeHit.delta <= 15 ? "HIGH" : "MEDIUM" };
        return { game: null, method: "ambiguous_raw_event_shell_team_pair_doubleheader", confidence: "LOW", ambiguous_count: exactHomeAway.length };
      }
    }
  }

  const boardDate = dateOnly(row.start_time) || dateOnly(row.slate_date);
  const possible = gamesForDate(games, boardDate);
  if (sourceEvent && /^\d+$/.test(sourceEvent)) {
    const byPk = possible.find(g => String(g.gamePk) === sourceEvent);
    if (byPk) return { game: byPk, method: "source_event_id_game_pk", confidence: "HIGH" };
  }
  const teamId = aliasTeamId(aliases, row.team) || (row.enriched_mlb_team_id ? Number(row.enriched_mlb_team_id) : null);
  const oppId = aliasTeamId(aliases, row.opponent) || (row.enriched_opponent_mlb_team_id ? Number(row.enriched_opponent_mlb_team_id) : null);
  if (teamId && oppId) {
    const pairMatches = gamesForUnorderedTeamPair(possible, teamId, oppId, teamDir);
    if (pairMatches.length === 1) return { game: pairMatches[0], method: "team_opponent_alias_pair", confidence: "HIGH" };
    if (pairMatches.length > 1 && row.start_time) {
      const sorted = pairMatches.map(g => ({ g, delta: minutesAbs(row.start_time, g.gameDate) })).filter(x => x.delta !== null).sort((a, b) => a.delta - b.delta);
      if (sorted.length && sorted[0].delta <= 90) return { game: sorted[0].g, method: "team_pair_plus_start_time", confidence: sorted[0].delta <= 15 ? "HIGH" : "MEDIUM" };
      return { game: null, method: "ambiguous_team_pair_doubleheader", confidence: "LOW", ambiguous_count: pairMatches.length };
    }
  }
  if (teamId) {
    const teamMatches = possible.filter(g => {
      const t = scheduleTeamIds(g, teamDir);
      return Number(t.away) === Number(teamId) || Number(t.home) === Number(teamId);
    });
    if (teamMatches.length === 1) {
      const delta = row.start_time ? minutesAbs(row.start_time, teamMatches[0].gameDate) : null;
      if (delta === null) return { game: teamMatches[0], method: row.enriched_team_method ? "player_roster_team_unique_date" : "single_team_unique_date", confidence: row.enriched_team_method ? "HIGH" : "MEDIUM" };
      if (delta <= 15) return { game: teamMatches[0], method: row.enriched_team_method ? "player_roster_team_exact_start_time" : "single_team_exact_start_time", confidence: "HIGH" };
      if (row.enriched_team_method) return { game: teamMatches[0], method: "player_roster_team_unique_date_official_time_override", confidence: "HIGH" };
      if (delta <= 90) return { game: teamMatches[0], method: "single_team_near_start_time", confidence: "MEDIUM" };
      return { game: teamMatches[0], method: "single_team_time_mismatch_review", confidence: "LOW" };
    }
    if (teamMatches.length > 1 && row.start_time) {
      const sorted = teamMatches.map(g => ({ g, delta: minutesAbs(row.start_time, g.gameDate) })).filter(x => x.delta !== null).sort((a, b) => a.delta - b.delta);
      if (sorted.length && sorted[0].delta <= 15 && (sorted.length === 1 || sorted[1].delta > 15)) {
        return { game: sorted[0].g, method: "single_team_doubleheader_exact_start_time", confidence: "HIGH" };
      }
      if (sorted.length && sorted[0].delta <= 90) return { game: sorted[0].g, method: "single_team_doubleheader_near_start_time", confidence: "MEDIUM" };
      return { game: null, method: "ambiguous_single_team_doubleheader", confidence: "LOW", ambiguous_count: teamMatches.length };
    }
  }
  if (row.start_time) {
    const sorted = possible.map(g => ({ g, delta: minutesAbs(row.start_time, g.gameDate) })).filter(x => x.delta !== null).sort((a, b) => a.delta - b.delta);
    if (sorted.length && sorted[0].delta <= 10) return { game: sorted[0].g, method: "start_time_only_low_confidence", confidence: "LOW" };
  }
  return { game: null, method: "unresolved_board_game_mapping", confidence: "LOW" };
}

function stageRow(batchId, row, match, nowMs, aliases, teamDir) {
  const g = match.game;
  const t = g ? scheduleTeamIds(g, teamDir) : {};
  const c = classifyGame(g, row, nowMs);
  const gameKey = g ? `mlb_${g.gamePk}` : `unresolved_${normalize(row.board_source_key)}_${normalize(row.board_row_id || row.source_line_id || Math.random())}`;
  let safety = c.safety;
  let block = c.block;
  if (!g && match.method && match.method.includes("ambiguous")) { safety = "blocked_ambiguous_game_mapping"; block = "ambiguous_game_mapping"; }
  else if (!g) { safety = "blocked_missing_game_time"; block = "official_game_not_resolved"; }
  const confidence = g && safety === "safe_pregame" && match.confidence === "HIGH" ? "HIGH" : (g ? match.confidence : "LOW");
  if (safety === "safe_pregame" && confidence !== "HIGH") {
    safety = "review_required";
    block = confidence === "MEDIUM" ? "medium_confidence_game_mapping_review_required" : "low_confidence_game_mapping_blocked";
  }
  const boardTeamId = aliasTeamId(aliases, row.team) || (row.enriched_mlb_team_id ? Number(row.enriched_mlb_team_id) : null);
  let derivedOpponent = row.opponent || null;
  if (!derivedOpponent && g && boardTeamId) {
    if (t.away === boardTeamId) derivedOpponent = t.homeAbbr || t.homeName || null;
    else if (t.home === boardTeamId) derivedOpponent = t.awayAbbr || t.awayName || null;
  }
  return {
    stage_id: rid("dgs_stage"),
    current_key: `${row.board_source_key || row.source_key}:${row.board_row_id || row.source_line_id || rid("row")}`,
    batch_id: batchId,
    source_key: MLB_SCHEDULE_SOURCE,
    board_source_key: row.board_source_key,
    board_batch_id: row.board_batch_id,
    board_row_id: row.board_row_id,
    source_line_id: row.source_line_id,
    source_event_id: row.source_event_id,
    source_player_id: row.source_player_id,
    player_name: row.player_name,
    canonical_prop_key: row.canonical_prop_key,
    board_team: row.team,
    board_opponent: derivedOpponent,
    board_start_time: row.start_time,
    board_slate_date: row.slate_date || dateOnly(row.start_time),
    board_pickable_flag: row.pickable_flag,
    resolved_game_key: gameKey,
    game_pk: g ? Number(g.gamePk) : null,
    official_date: g ? (g.officialDate || dateOnly(g.gameDate) || g.__schedule_date) : null,
    official_start_time_utc: g ? g.gameDate : null,
    away_mlb_team_id: t.away || null,
    away_team_name: t.awayName || null,
    home_mlb_team_id: t.home || null,
    home_team_name: t.homeName || null,
    venue_id: g?.venue?.id || null,
    venue_name: g?.venue?.name || null,
    double_header: g?.doubleHeader || null,
    game_number: g?.gameNumber || null,
    abstract_game_state: c.abstractState || null,
    coded_game_state: c.coded || null,
    detailed_state: c.detailed || null,
    status_code: c.statusCode || null,
    game_status_class: c.isFinal ? "final" : c.isInProgress ? "in_progress" : c.isPostponed ? "postponed" : c.isSuspended ? "suspended" : c.isDelayed ? "delayed" : c.hasStarted ? "started" : (g ? "pregame" : "unresolved"),
    safety_status: safety,
    pickable_safe: safety === "safe_pregame" && confidence !== "LOW" ? 1 : 0,
    has_started: c.hasStarted ? 1 : 0,
    is_final: c.isFinal ? 1 : 0,
    is_postponed: c.isPostponed ? 1 : 0,
    is_suspended: c.isSuspended ? 1 : 0,
    is_delayed: c.isDelayed ? 1 : 0,
    is_in_progress: c.isInProgress ? 1 : 0,
    warning_flags: JSON.stringify([...(c.warnings || []), ...((row.enrichment_flags || []).filter(f => /ambiguous|mismatch|missing/.test(String(f))))]),
    block_reason: block,
    match_method: match.method,
    source_confidence: confidence,
    board_mlb_start_time_delta_minutes: c.delta,
    source_endpoint: g?.__source_endpoint || null,
    source_fetched_at: g?.__source_fetched_at || null,
    raw_board_json: safeString(row.raw_board_json || row.raw_row, 7000),
    raw_mlb_game_json: safeString(g || {}, 7000)
  };
}

async function insertStage(env, row) {
  const cols = ["stage_id","batch_id","source_key","board_source_key","board_batch_id","board_row_id","source_line_id","source_event_id","source_player_id","player_name","canonical_prop_key","board_team","board_opponent","board_start_time","board_slate_date","board_pickable_flag","resolved_game_key","game_pk","official_date","official_start_time_utc","away_mlb_team_id","away_team_name","home_mlb_team_id","home_team_name","venue_id","venue_name","double_header","game_number","abstract_game_state","coded_game_state","detailed_state","status_code","game_status_class","safety_status","pickable_safe","has_started","is_final","is_postponed","is_suspended","is_delayed","is_in_progress","warning_flags","block_reason","match_method","source_confidence","board_mlb_start_time_delta_minutes","source_endpoint","source_fetched_at","raw_board_json","raw_mlb_game_json"];
  const sql = `INSERT INTO daily_game_status_stage (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`;
  await run(env.DAILY_DB, sql, ...cols.map(c => row[c] ?? null));
}
async function promoteCurrent(env, batchId) {
  await run(env.DAILY_DB, "DELETE FROM daily_game_status_current");
  await run(env.DAILY_DB, `INSERT OR REPLACE INTO daily_game_status_current (
    current_key,batch_id,source_key,board_source_key,board_batch_id,board_row_id,source_line_id,source_event_id,source_player_id,player_name,canonical_prop_key,board_team,board_opponent,board_start_time,board_slate_date,board_pickable_flag,resolved_game_key,game_pk,official_date,official_start_time_utc,away_mlb_team_id,away_team_name,home_mlb_team_id,home_team_name,venue_id,venue_name,double_header,game_number,abstract_game_state,coded_game_state,detailed_state,status_code,game_status_class,safety_status,pickable_safe,has_started,is_final,is_postponed,is_suspended,is_delayed,is_in_progress,warning_flags,block_reason,match_method,source_confidence,board_mlb_start_time_delta_minutes,source_endpoint,source_fetched_at,raw_board_json,raw_mlb_game_json,promoted_at,updated_at)
    SELECT board_source_key || ':' || COALESCE(board_row_id, source_line_id, stage_id),batch_id,source_key,board_source_key,board_batch_id,board_row_id,source_line_id,source_event_id,source_player_id,player_name,canonical_prop_key,board_team,board_opponent,board_start_time,board_slate_date,board_pickable_flag,resolved_game_key,game_pk,official_date,official_start_time_utc,away_mlb_team_id,away_team_name,home_mlb_team_id,home_team_name,venue_id,venue_name,double_header,game_number,abstract_game_state,coded_game_state,detailed_state,status_code,game_status_class,safety_status,pickable_safe,has_started,is_final,is_postponed,is_suspended,is_delayed,is_in_progress,warning_flags,block_reason,match_method,source_confidence,board_mlb_start_time_delta_minutes,source_endpoint,source_fetched_at,raw_board_json,raw_mlb_game_json,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
    FROM daily_game_status_stage WHERE batch_id=?`, batchId);
}

async function promoteCurrentSafe(env, batchId) {
  try {
    await promoteCurrent(env, batchId);
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (!/coded_game_state/i.test(msg)) throw err;
    await run(env.DAILY_DB, "DELETE FROM daily_game_status_current");
    await run(env.DAILY_DB, `INSERT OR REPLACE INTO daily_game_status_current (
      current_key,batch_id,source_key,board_source_key,board_batch_id,board_row_id,source_line_id,source_event_id,source_player_id,player_name,canonical_prop_key,board_team,board_opponent,board_start_time,board_slate_date,board_pickable_flag,resolved_game_key,game_pk,official_date,official_start_time_utc,away_mlb_team_id,away_team_name,home_mlb_team_id,home_team_name,venue_id,venue_name,double_header,game_number,abstract_game_state,coded_game_state,detailed_state,status_code,game_status_class,safety_status,pickable_safe,has_started,is_final,is_postponed,is_suspended,is_delayed,is_in_progress,warning_flags,block_reason,match_method,source_confidence,board_mlb_start_time_delta_minutes,source_endpoint,source_fetched_at,raw_board_json,raw_mlb_game_json,promoted_at,updated_at)
      SELECT board_source_key || ':' || COALESCE(board_row_id, source_line_id, stage_id),batch_id,source_key,board_source_key,board_batch_id,board_row_id,source_line_id,source_event_id,source_player_id,player_name,canonical_prop_key,board_team,board_opponent,board_start_time,board_slate_date,board_pickable_flag,resolved_game_key,game_pk,official_date,official_start_time_utc,away_mlb_team_id,away_team_name,home_mlb_team_id,home_team_name,venue_id,venue_name,double_header,game_number,abstract_game_state,coded_game_state,detailed_state,status_code,game_status_class,safety_status,pickable_safe,has_started,is_final,is_postponed,is_suspended,is_delayed,is_in_progress,warning_flags,block_reason,match_method,source_confidence,board_mlb_start_time_delta_minutes,source_endpoint,source_fetched_at,raw_board_json,raw_mlb_game_json,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      FROM daily_game_status_stage WHERE batch_id=?`, batchId);
  }
}

async function runDailyGameStatus(env, input = {}) {
  if (!env.DAILY_DB || !env.MARKET_DB) return { ...base({ ok:false, data_ok:false, status:"BLOCKED_MISSING_DB_BINDING", certification:"DAILY_GAME_STATUS_MISSING_DAILY_OR_MARKET_DB" }) };
  const started = Date.now();
  await ensureSchema(env);
  const batchId = rid("daily_game_status_batch");
  await run(env.DAILY_DB, "INSERT INTO daily_game_status_batches (batch_id, job_key, source_key, mode, started_at, certification_status) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 'RUNNING')", batchId, JOB_KEY, MLB_SCHEDULE_SOURCE, input.mode || "board_focused_current_status");
  await run(env.DAILY_DB, "DELETE FROM daily_game_status_stage WHERE batch_id=?", batchId);

  const pp = await readPrizePicksRows(env);
  const sl = await readSleeperRows(env);
  const boardRows = [...pp.rows, ...sl.rows];
  const aliases = await readTeamAliases(env);
  const teamDir = await readTeamDirectory(env);
  const playerTeamMap = await readPlayerTeamMap(env, teamDir);
  const enrichment = enrichBoardRows(boardRows, playerTeamMap, aliases, teamDir, pp.rows);
  const dates = unique(boardRows.flatMap(r => [
    dateOnly(r.start_time),
    dateOnly(r.slate_date),
    dateOnly(r.sleeper_event_shell?.game_date),
    dateOnly(r.sleeper_event_shell?.commence_time),
    dateOnly(r.cross_board_prizepicks_start_time),
    dateOnly(r.cross_board_prizepicks_slate_date)
  ])).sort();
  const schedule = dates.length ? await fetchMlbSchedule(env, dates) : { dates_fetched: 0, games_seen: 0, games: [], fetches: [], errors: [{ reason: "no_board_relevant_dates" }] };
  const nowMs = Date.now();
  let staged = 0, unsafe = 0, warnings = 0;
  for (const br of boardRows) {
    const match = matchGame(br, schedule.games, aliases, teamDir);
    const sr = stageRow(batchId, br, match, nowMs, aliases, teamDir);
    if (!sr.pickable_safe) unsafe++;
    try { const w = JSON.parse(sr.warning_flags || "[]"); if (w.length) warnings++; } catch (_) {}
    await insertStage(env, sr);
    staged++;
  }
  await promoteCurrentSafe(env, batchId);
  const currentCount = await first(env.DAILY_DB, "SELECT COUNT(*) AS c FROM daily_game_status_current WHERE batch_id=?", batchId);
  const duplicateKeys = await first(env.DAILY_DB, "SELECT COUNT(*) AS c FROM (SELECT current_key FROM daily_game_status_current GROUP BY current_key HAVING COUNT(*) > 1)");
  const stageRows = await first(env.DAILY_DB, "SELECT COUNT(*) AS c FROM daily_game_status_stage WHERE batch_id=?", batchId);
  await run(env.DAILY_DB, "DELETE FROM daily_game_status_stage WHERE batch_id=?", batchId);
  const stageAfterClean = await first(env.DAILY_DB, "SELECT COUNT(*) AS c FROM daily_game_status_stage WHERE batch_id=?", batchId);
  const certification = boardRows.length > 0 && schedule.dates_fetched > 0 && Number(duplicateKeys?.c || 0) === 0 ? "DAILY_GAME_STATUS_CERTIFIED_CURRENT_REPLACED" : (boardRows.length === 0 ? "DAILY_GAME_STATUS_NO_ACTIVE_BOARD_ROWS" : "DAILY_GAME_STATUS_COMPLETED_WITH_SOURCE_WARNINGS");
  const grade = certification === "DAILY_GAME_STATUS_CERTIFIED_CURRENT_REPLACED" ? "PASS" : "REVIEW";
  const certJson = { board_rows_read: boardRows.length, prizepicks_rows_read: pp.rows.length, sleeper_rows_read: sl.rows.length, board_relevant_dates: dates, mlb_schedule_fetches: schedule.fetches, mlb_schedule_errors: schedule.errors, duplicate_current_keys: Number(duplicateKeys?.c || 0), source_endpoint_template: MLB_SCHEDULE_ENDPOINT_PATH, exact_board_columns_used: { prizepicks: pp.columns, sleeper: sl.columns }, matching_methods: ["source_event_id_game_pk", "sleeper_raw_event_shell_team_pair_official_schedule", "sleeper_raw_event_shell_cross_board_prizepicks_official_schedule", "sleeper_raw_event_shell_team_pair_exact_start_time", "team_opponent_alias_pair", "team_pair_plus_start_time", "sleeper_source_event_two_team_cluster", "single_team_exact_start_time", "single_team_doubleheader_exact_start_time", "player_roster_team_unique_date", "player_roster_team_exact_start_time", "player_roster_team_unique_date_official_time_override", "start_time_only_low_confidence", "unresolved_board_game_mapping"], enrichment: enrichment, unsafe_rules: ["blocked_started", "blocked_final", "blocked_postponed", "blocked_suspended", "blocked_missing_game_time", "blocked_ambiguous_game_mapping", "blocked_board_time_past", "review_required"] };
  await run(env.DAILY_DB, "INSERT INTO daily_game_status_certifications (certification_id, batch_id, certification_status, certification_grade, certification_reason, certification_json) VALUES (?, ?, ?, ?, ?, ?)", rid("dgs_cert"), batchId, certification, grade, "Board-focused game status refresh completed without board/scoring mutation", JSON.stringify(certJson));
  await run(env.DAILY_DB, "INSERT INTO daily_game_status_outcomes (outcome_id, batch_id, outcome_key, outcome_status, outcome_json) VALUES (?, ?, 'daily_game_status_summary', ?, ?)", rid("dgs_outcome"), batchId, certification, JSON.stringify(certJson));
  await run(env.DAILY_DB, "UPDATE daily_game_status_batches SET board_rows_read=?, board_relevant_dates=?, board_relevant_games=?, mlb_schedule_dates_fetched=?, mlb_schedule_games_seen=?, staged_rows=?, promoted_rows=?, unsafe_rows=?, warning_rows=?, certification_status=?, certification_grade=?, certification_reason=?, certification_json=?, certified_at=CURRENT_TIMESTAMP, promoted_at=CURRENT_TIMESTAMP, cleaned_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", boardRows.length, dates.length, new Set(schedule.games.map(g => g.gamePk)).size, schedule.dates_fetched, schedule.games_seen, staged, Number(currentCount?.c || 0), unsafe, warnings, certification, grade, "Certified current replacement lifecycle; no board/scoring/final writes", JSON.stringify(certJson), batchId);
  return base({
    status: certification,
    certification,
    certification_grade: grade,
    batch_id: batchId,
    rows_read: boardRows.length,
    rows_written: Number(currentCount?.c || 0),
    board_rows_read: boardRows.length,
    prizepicks_rows_read: pp.rows.length,
    sleeper_rows_read: sl.rows.length,
    board_relevant_dates: dates.length,
    board_relevant_dates_list: dates,
    mlb_schedule_dates_fetched: schedule.dates_fetched,
    mlb_schedule_games_seen: schedule.games_seen,
    current_rows_promoted: Number(currentCount?.c || 0),
    stage_rows_before_clean: Number(stageRows?.c || 0),
    stage_rows_after_clean: Number(stageAfterClean?.c || 0),
    unsafe_rows: unsafe,
    warning_rows: warnings,
    duplicate_current_keys: Number(duplicateKeys?.c || 0),
    external_calls_performed: schedule.fetches.length,
    writes_performed: staged + Number(currentCount?.c || 0),
    board_mutation_performed: false,
    scoring_mutation_performed: false,
    final_board_mutation_performed: false,
    enrichment_summary: enrichment,
    source_details: {
      endpoint_template: MLB_SCHEDULE_ENDPOINT_PATH,
      fetches: schedule.fetches,
      errors: schedule.errors,
      confidence_policy: "HIGH from unique source_event_id gamePk, Sleeper raw event shell home/away/date matched to official MLB schedule, Sleeper raw event shell plus cross-board PrizePicks official schedule match, team/opponent alias pair, board team plus exact official start time, or active REF player/team roster mapped to a unique MLB schedule game; player-team enrichment can remain incomplete without blocking a resolved official game"
    },
    elapsed_ms: Date.now() - started
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method.toUpperCase() === "OPTIONS") return jsonResponse({ ok:true });
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (request.method === "GET" && (path === "/" || path === "/health")) {
      return jsonResponse(base({ status: "READY", route: path, bindings: { DAILY_DB: !!env.DAILY_DB, MARKET_DB: !!env.MARKET_DB, REF_DB: !!env.REF_DB }, exact_worker_only: true }));
    }
    if (request.method === "POST" && path === "/diagnostic") {
      return jsonResponse(base({ status: "DIAGNOSTIC_READY", input_echo_safe: await readJsonSafe(request), writes_performed: 0, external_calls_performed: 0 }));
    }
    if (request.method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try { return jsonResponse(await runDailyGameStatus(env, input)); }
      catch (err) { return jsonResponse(base({ ok:false, data_ok:false, status:"DAILY_GAME_STATUS_WORKER_FAILED", certification:"DAILY_GAME_STATUS_FAILED", error: safeString(err && err.stack ? err.stack : err, 2000), rows_read:0, rows_written:0 }), 200); }
    }
    return jsonResponse(base({ ok:false, data_ok:false, status:"NOT_FOUND", allowed_routes:["GET /", "GET /health", "POST /diagnostic", "POST /run"] }), 404);
  }
};
