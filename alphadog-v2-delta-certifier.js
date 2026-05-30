const WORKER_NAME = "alphadog-v2-delta-certifier";
const VERSION = "alphadog-v2-delta-certifier-v0.2.0-stat-evidence-finality-gate";
const JOB_KEY = "delta-certifier";

const ACTIVE_COVERAGE_LAYER_KEYS = [
  "hitter_game_logs",
  "pitcher_game_logs",
  "team_game_logs",
  "starter_history",
  "bullpen_history",
  "hitter_splits",
  "pitcher_splits",
  "hitter_metrics",
  "pitcher_metrics"
];

function activeCoverageLayerKeys() {
  return [...ACTIVE_COVERAGE_LAYER_KEYS];
}

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

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

async function batchPrepared(db, preparedStatements, chunkSize = 40) {
  let executed = 0;
  for (let i = 0; i < preparedStatements.length; i += chunkSize) {
    const chunk = preparedStatements.slice(i, i + chunkSize);
    if (chunk.length) {
      await db.batch(chunk);
      executed += chunk.length;
    }
  }
  return executed;
}

function asInt(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bindingSummary(env) {
  return {
    CONTROL_DB: !!env.CONTROL_DB,
    TEAM_DB: !!env.TEAM_DB,
    STATS_HITTER_DB: !!env.STATS_HITTER_DB,
    STATS_PITCHER_DB: !!env.STATS_PITCHER_DB
  };
}

function baseIdentity(env) {
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "DELTA_CERTIFIER_READY",
    timestamp_utc: nowUtc(),
    binding_summary: bindingSummary(env),
    audit_only: true,
    no_repairs: true,
    no_source_history_mutation: true,
    no_scoring: true,
    no_ranking: true,
    no_board_mutation: true
  };
}

async function ensureCoverageTables(env) {
  await run(env.TEAM_DB, `CREATE TABLE IF NOT EXISTS mlb_game_calendar (
    game_pk INTEGER PRIMARY KEY,
    season INTEGER NOT NULL,
    game_type TEXT NOT NULL,
    official_date TEXT NOT NULL,
    game_time_utc TEXT,
    game_time_pt TEXT,
    status_code TEXT,
    abstract_game_state TEXT,
    detailed_state TEXT,
    is_scheduled INTEGER DEFAULT 0,
    is_pregame INTEGER DEFAULT 0,
    is_live INTEGER DEFAULT 0,
    is_final INTEGER DEFAULT 0,
    is_postponed INTEGER DEFAULT 0,
    is_suspended INTEGER DEFAULT 0,
    is_cancelled INTEGER DEFAULT 0,
    is_available_for_stats INTEGER DEFAULT 0,
    home_team_id INTEGER,
    away_team_id INTEGER,
    home_team_name TEXT,
    away_team_name TEXT,
    venue_id INTEGER,
    venue_name TEXT,
    doubleheader TEXT,
    game_number INTEGER,
    series_game_number INTEGER,
    source_key TEXT NOT NULL,
    source_endpoint TEXT,
    source_snapshot_at TEXT,
    first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_status_change_at TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    raw_json TEXT
  )`);
  await run(env.TEAM_DB, `CREATE INDEX IF NOT EXISTS idx_mlb_game_calendar_official_date ON mlb_game_calendar(official_date)`);
  await run(env.TEAM_DB, `CREATE INDEX IF NOT EXISTS idx_mlb_game_calendar_available_date ON mlb_game_calendar(is_available_for_stats, official_date)`);

  await run(env.TEAM_DB, `CREATE TABLE IF NOT EXISTS mlb_game_data_coverage (
    game_pk INTEGER NOT NULL,
    season INTEGER NOT NULL,
    official_date TEXT NOT NULL,
    layer_key TEXT NOT NULL,
    layer_family TEXT NOT NULL,
    coverage_scope TEXT NOT NULL,
    coverage_status TEXT NOT NULL,
    coverage_grade TEXT NOT NULL,
    blocking_for_full_run INTEGER DEFAULT 1,
    expected_rows INTEGER,
    live_rows INTEGER DEFAULT 0,
    stage_rows INTEGER DEFAULT 0,
    outcome_rows INTEGER DEFAULT 0,
    missing_rows INTEGER,
    expected_entity_type TEXT,
    live_entity_count INTEGER DEFAULT 0,
    stage_entity_count INTEGER DEFAULT 0,
    exception_count INTEGER DEFAULT 0,
    represented_by_live INTEGER DEFAULT 0,
    represented_by_stage INTEGER DEFAULT 0,
    represented_by_exception INTEGER DEFAULT 0,
    missing_reason TEXT,
    exception_reason TEXT,
    last_batch_id TEXT,
    last_run_id TEXT,
    last_request_id TEXT,
    last_worker_name TEXT,
    last_worker_version TEXT,
    last_checked_at TEXT,
    last_completed_at TEXT,
    source_endpoint TEXT,
    details_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (game_pk, layer_key)
  )`);
  await run(env.TEAM_DB, `CREATE INDEX IF NOT EXISTS idx_mlb_game_data_coverage_layer_status ON mlb_game_data_coverage(layer_key, coverage_status)`);
  await run(env.TEAM_DB, `CREATE INDEX IF NOT EXISTS idx_mlb_game_data_coverage_date_layer ON mlb_game_data_coverage(official_date, layer_key)`);
  await run(env.TEAM_DB, `CREATE INDEX IF NOT EXISTS idx_mlb_game_data_coverage_blocking ON mlb_game_data_coverage(blocking_for_full_run, coverage_status)`);

  await run(env.TEAM_DB, `CREATE TABLE IF NOT EXISTS mlb_game_coverage_batches (
    batch_id TEXT PRIMARY KEY,
    run_id TEXT,
    request_id TEXT,
    worker_name TEXT,
    worker_version TEXT,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    coverage_window_start TEXT,
    coverage_window_end TEXT,
    source_game_count INTEGER DEFAULT 0,
    source_final_game_pk_count INTEGER DEFAULT 0,
    coverage_rows_written INTEGER DEFAULT 0,
    missing_game_layer_count INTEGER DEFAULT 0,
    blocking_gap_count INTEGER DEFAULT 0,
    certification_status TEXT,
    certification_grade TEXT,
    started_at TEXT,
    finished_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    output_json TEXT
  )`);
  await run(env.TEAM_DB, `CREATE INDEX IF NOT EXISTS idx_mlb_game_coverage_batches_updated ON mlb_game_coverage_batches(updated_at)`);

  await run(env.TEAM_DB, `CREATE TABLE IF NOT EXISTS mlb_game_coverage_gaps (
    gap_id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    game_pk INTEGER NOT NULL,
    season INTEGER,
    official_date TEXT,
    layer_key TEXT NOT NULL,
    gap_status TEXT NOT NULL,
    missing_reason TEXT,
    expected_rows INTEGER,
    live_rows INTEGER,
    stage_rows INTEGER,
    outcome_rows INTEGER,
    details_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(batch_id, game_pk, layer_key)
  )`);
  await run(env.TEAM_DB, `CREATE INDEX IF NOT EXISTS idx_mlb_game_coverage_gaps_batch ON mlb_game_coverage_gaps(batch_id)`);

  await run(env.TEAM_DB, `CREATE TABLE IF NOT EXISTS mlb_game_calendar_stage (
    snapshot_batch_id TEXT NOT NULL,
    game_pk INTEGER NOT NULL,
    season INTEGER NOT NULL,
    game_type TEXT NOT NULL,
    official_date TEXT NOT NULL,
    game_time_utc TEXT,
    status_code TEXT,
    abstract_game_state TEXT,
    detailed_state TEXT,
    is_scheduled INTEGER DEFAULT 0,
    is_pregame INTEGER DEFAULT 0,
    is_live INTEGER DEFAULT 0,
    is_final INTEGER DEFAULT 0,
    is_postponed INTEGER DEFAULT 0,
    is_suspended INTEGER DEFAULT 0,
    is_cancelled INTEGER DEFAULT 0,
    is_available_for_stats INTEGER DEFAULT 0,
    home_team_id INTEGER,
    away_team_id INTEGER,
    home_team_name TEXT,
    away_team_name TEXT,
    venue_id INTEGER,
    venue_name TEXT,
    doubleheader TEXT,
    game_number INTEGER,
    series_game_number INTEGER,
    source_key TEXT NOT NULL,
    source_endpoint TEXT,
    source_snapshot_at TEXT DEFAULT CURRENT_TIMESTAMP,
    raw_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (snapshot_batch_id, game_pk)
  )`);
  await run(env.TEAM_DB, `CREATE INDEX IF NOT EXISTS idx_mlb_game_calendar_stage_batch ON mlb_game_calendar_stage(snapshot_batch_id)`);
  await run(env.TEAM_DB, `CREATE INDEX IF NOT EXISTS idx_mlb_game_calendar_stage_date ON mlb_game_calendar_stage(official_date)`);

  await run(env.TEAM_DB, `CREATE TABLE IF NOT EXISTS mlb_game_calendar_diff_changes (
    change_id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    game_pk INTEGER NOT NULL,
    official_date_old TEXT,
    official_date_new TEXT,
    change_type TEXT NOT NULL,
    changed_fields_json TEXT,
    old_values_json TEXT,
    new_values_json TEXT,
    applied_to_main INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(batch_id, game_pk)
  )`);
  await run(env.TEAM_DB, `CREATE INDEX IF NOT EXISTS idx_mlb_game_calendar_diff_batch ON mlb_game_calendar_diff_changes(batch_id)`);
}

function classifyGame(game) {
  const status = game.status || {};
  const code = String(status.statusCode || "");
  const detailed = String(status.detailedState || "");
  const abstractState = String(status.abstractGameState || "");
  const hay = `${code} ${detailed} ${abstractState}`.toLowerCase();
  const isLive = abstractState.toLowerCase() === "live" || hay.includes("in progress") || hay.includes("manager challenge") || hay.includes("review");
  const isPostponed = hay.includes("postponed") || code === "DR";
  const isSuspended = hay.includes("suspended");
  const isCancelled = hay.includes("cancelled") || hay.includes("canceled");
  const isFinalRaw = hay.includes("final") || hay.includes("game over") || code === "F";
  const isFinal = isFinalRaw && !isPostponed && !isSuspended && !isCancelled;
  const isPregame = abstractState.toLowerCase() === "preview" || hay.includes("scheduled") || hay.includes("pre-game") || hay.includes("warmup");
  return {
    status_code: code || null,
    abstract_game_state: abstractState || null,
    detailed_state: detailed || null,
    is_scheduled: isPregame ? 1 : 0,
    is_pregame: isPregame ? 1 : 0,
    is_live: isLive ? 1 : 0,
    is_final: isFinal ? 1 : 0,
    is_postponed: isPostponed ? 1 : 0,
    is_suspended: isSuspended ? 1 : 0,
    is_cancelled: isCancelled ? 1 : 0,
    is_available_for_stats: (isFinal && !isPostponed && !isSuspended && !isCancelled) ? 1 : 0
  };
}

async function fetchSchedule(startDate, endDate, gameTypes = "R", hydrate = "team,venue,linescore,probablePitcher(note)") {
  const endpoint = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&gameTypes=${encodeURIComponent(gameTypes)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&hydrate=${encodeURIComponent(hydrate)}`;
  const resp = await fetch(endpoint, { headers: { "accept": "application/json" } });
  const text = await resp.text();
  let data = {};
  try { data = JSON.parse(text); } catch (_) { data = { parse_error: true, raw_preview: text.slice(0, 500) }; }
  if (!resp.ok) throw new Error(`MLB schedule fetch failed ${resp.status}: ${text.slice(0, 400)}`);
  const games = [];
  for (const d of (data.dates || [])) for (const g of (d.games || [])) games.push(g);
  const statusSamples = [...new Set(games.map(g => `${g?.status?.statusCode || ""}|${g?.status?.abstractGameState || ""}|${g?.status?.detailedState || ""}`).filter(Boolean))].slice(0, 25);
  const observedGameTypes = [...new Set(games.map(g => String(g.gameType || "")).filter(Boolean))].slice(0, 10);
  return { endpoint, data, games, statusSamples, gameTypes: observedGameTypes };
}

async function upsertCalendar(env, games, endpoint) {
  let upserted = 0;
  for (const game of games) {
    const c = classifyGame(game);
    const gamePk = Number(game.gamePk);
    if (!gamePk) continue;
    const officialDate = String(game.officialDate || "");
    const season = Number(String(officialDate || game.gameDate || "").slice(0, 4)) || 2026;
    await run(env.TEAM_DB, `INSERT INTO mlb_game_calendar (
      game_pk, season, game_type, official_date, game_time_utc, game_time_pt,
      status_code, abstract_game_state, detailed_state,
      is_scheduled, is_pregame, is_live, is_final, is_postponed, is_suspended, is_cancelled, is_available_for_stats,
      home_team_id, away_team_id, home_team_name, away_team_name, venue_id, venue_name,
      doubleheader, game_number, series_game_number, source_key, source_endpoint, source_snapshot_at, raw_json, first_seen_at, last_seen_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'mlb_statsapi_schedule', ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(game_pk) DO UPDATE SET
      season=excluded.season,
      game_type=excluded.game_type,
      official_date=excluded.official_date,
      game_time_utc=excluded.game_time_utc,
      status_code=excluded.status_code,
      abstract_game_state=excluded.abstract_game_state,
      detailed_state=excluded.detailed_state,
      is_scheduled=excluded.is_scheduled,
      is_pregame=excluded.is_pregame,
      is_live=excluded.is_live,
      is_final=excluded.is_final,
      is_postponed=excluded.is_postponed,
      is_suspended=excluded.is_suspended,
      is_cancelled=excluded.is_cancelled,
      is_available_for_stats=excluded.is_available_for_stats,
      home_team_id=excluded.home_team_id,
      away_team_id=excluded.away_team_id,
      home_team_name=excluded.home_team_name,
      away_team_name=excluded.away_team_name,
      venue_id=excluded.venue_id,
      venue_name=excluded.venue_name,
      doubleheader=excluded.doubleheader,
      game_number=excluded.game_number,
      series_game_number=excluded.series_game_number,
      source_endpoint=excluded.source_endpoint,
      source_snapshot_at=excluded.source_snapshot_at,
      raw_json=excluded.raw_json,
      last_seen_at=CURRENT_TIMESTAMP,
      updated_at=CURRENT_TIMESTAMP`,
      gamePk, season, String(game.gameType || "R"), officialDate, String(game.gameDate || ""),
      c.status_code, c.abstract_game_state, c.detailed_state,
      c.is_scheduled, c.is_pregame, c.is_live, c.is_final, c.is_postponed, c.is_suspended, c.is_cancelled, c.is_available_for_stats,
      Number(game?.teams?.home?.team?.id || 0) || null,
      Number(game?.teams?.away?.team?.id || 0) || null,
      String(game?.teams?.home?.team?.name || "") || null,
      String(game?.teams?.away?.team?.name || "") || null,
      Number(game?.venue?.id || 0) || null,
      String(game?.venue?.name || "") || null,
      game.doubleHeader == null ? null : String(game.doubleHeader),
      game.gameNumber == null ? null : Number(game.gameNumber),
      game.seriesGameNumber == null ? null : Number(game.seriesGameNumber),
      endpoint,
      JSON.stringify(game)
    );
    upserted++;
  }
  return upserted;
}


async function upsertCalendarStage(env, games, endpoint, batchId) {
  await run(env.TEAM_DB, `DELETE FROM mlb_game_calendar_stage WHERE snapshot_batch_id=?`, batchId);
  const statements = [];
  let upserted = 0;
  const sql = `INSERT INTO mlb_game_calendar_stage (
      snapshot_batch_id, game_pk, season, game_type, official_date, game_time_utc,
      status_code, abstract_game_state, detailed_state,
      is_scheduled, is_pregame, is_live, is_final, is_postponed, is_suspended, is_cancelled, is_available_for_stats,
      home_team_id, away_team_id, home_team_name, away_team_name, venue_id, venue_name,
      doubleheader, game_number, series_game_number, source_key, source_endpoint, source_snapshot_at, raw_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'mlb_statsapi_schedule_stage', ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(snapshot_batch_id, game_pk) DO UPDATE SET
      season=excluded.season, game_type=excluded.game_type, official_date=excluded.official_date, game_time_utc=excluded.game_time_utc,
      status_code=excluded.status_code, abstract_game_state=excluded.abstract_game_state, detailed_state=excluded.detailed_state,
      is_scheduled=excluded.is_scheduled, is_pregame=excluded.is_pregame, is_live=excluded.is_live, is_final=excluded.is_final,
      is_postponed=excluded.is_postponed, is_suspended=excluded.is_suspended, is_cancelled=excluded.is_cancelled, is_available_for_stats=excluded.is_available_for_stats,
      home_team_id=excluded.home_team_id, away_team_id=excluded.away_team_id, home_team_name=excluded.home_team_name, away_team_name=excluded.away_team_name,
      venue_id=excluded.venue_id, venue_name=excluded.venue_name, doubleheader=excluded.doubleheader, game_number=excluded.game_number,
      series_game_number=excluded.series_game_number, source_endpoint=excluded.source_endpoint, source_snapshot_at=CURRENT_TIMESTAMP, raw_json=excluded.raw_json, updated_at=CURRENT_TIMESTAMP`;
  for (const game of games) {
    const c = classifyGame(game);
    const gamePk = Number(game.gamePk);
    if (!gamePk) continue;
    const officialDate = String(game.officialDate || "");
    const season = Number(String(officialDate || game.gameDate || "").slice(0, 4)) || 2026;
    statements.push(env.TEAM_DB.prepare(sql).bind(
      batchId, gamePk, season, String(game.gameType || "R"), officialDate, String(game.gameDate || ""),
      c.status_code, c.abstract_game_state, c.detailed_state,
      c.is_scheduled, c.is_pregame, c.is_live, c.is_final, c.is_postponed, c.is_suspended, c.is_cancelled, c.is_available_for_stats,
      Number(game?.teams?.home?.team?.id || 0) || null,
      Number(game?.teams?.away?.team?.id || 0) || null,
      String(game?.teams?.home?.team?.name || "") || null,
      String(game?.teams?.away?.team?.name || "") || null,
      Number(game?.venue?.id || 0) || null,
      String(game?.venue?.name || "") || null,
      game.doubleHeader == null ? null : String(game.doubleHeader),
      game.gameNumber == null ? null : Number(game.gameNumber),
      game.seriesGameNumber == null ? null : Number(game.seriesGameNumber),
      endpoint,
      JSON.stringify(game)
    ));
    upserted++;
    if (statements.length >= 40) {
      await batchPrepared(env.TEAM_DB, statements.splice(0), 40);
    }
  }
  await batchPrepared(env.TEAM_DB, statements, 40);
  return upserted;
}

function changedFields(oldRow, newRow) {
  const fields = ["season","game_type","official_date","game_time_utc","status_code","abstract_game_state","detailed_state","is_scheduled","is_pregame","is_live","is_final","is_postponed","is_suspended","is_cancelled","is_available_for_stats","home_team_id","away_team_id","home_team_name","away_team_name","venue_id","venue_name","doubleheader","game_number","series_game_number"];
  const changed = [];
  const oldValues = {};
  const newValues = {};
  for (const f of fields) {
    const ov = oldRow ? oldRow[f] : null;
    const nv = newRow ? newRow[f] : null;
    if (String(ov ?? "") !== String(nv ?? "")) {
      changed.push(f);
      oldValues[f] = ov;
      newValues[f] = nv;
    }
  }
  return { changed, oldValues, newValues };
}

async function applyCalendarDifferential(env, batchId) {
  await run(env.TEAM_DB, `DELETE FROM mlb_game_calendar_diff_changes WHERE batch_id=?`, batchId);
  const staged = await all(env.TEAM_DB, `SELECT * FROM mlb_game_calendar_stage WHERE snapshot_batch_id=? ORDER BY official_date, game_pk`, batchId);
  const currentRows = await all(env.TEAM_DB, `SELECT * FROM mlb_game_calendar`);
  const currentByGamePk = new Map(currentRows.map(r => [String(r.game_pk), r]));
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let applied = 0;
  const changeSamples = [];
  const upsertSql = `INSERT INTO mlb_game_calendar (
      game_pk, season, game_type, official_date, game_time_utc, game_time_pt,
      status_code, abstract_game_state, detailed_state,
      is_scheduled, is_pregame, is_live, is_final, is_postponed, is_suspended, is_cancelled, is_available_for_stats,
      home_team_id, away_team_id, home_team_name, away_team_name, venue_id, venue_name,
      doubleheader, game_number, series_game_number, source_key, source_endpoint, source_snapshot_at, raw_json, first_seen_at, last_seen_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'mlb_statsapi_schedule', ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(game_pk) DO UPDATE SET
      season=excluded.season, game_type=excluded.game_type, official_date=excluded.official_date, game_time_utc=excluded.game_time_utc,
      status_code=excluded.status_code, abstract_game_state=excluded.abstract_game_state, detailed_state=excluded.detailed_state,
      is_scheduled=excluded.is_scheduled, is_pregame=excluded.is_pregame, is_live=excluded.is_live, is_final=excluded.is_final,
      is_postponed=excluded.is_postponed, is_suspended=excluded.is_suspended, is_cancelled=excluded.is_cancelled, is_available_for_stats=excluded.is_available_for_stats,
      home_team_id=excluded.home_team_id, away_team_id=excluded.away_team_id, home_team_name=excluded.home_team_name, away_team_name=excluded.away_team_name,
      venue_id=excluded.venue_id, venue_name=excluded.venue_name, doubleheader=excluded.doubleheader, game_number=excluded.game_number,
      series_game_number=excluded.series_game_number, source_endpoint=excluded.source_endpoint, source_snapshot_at=excluded.source_snapshot_at,
      raw_json=excluded.raw_json, last_seen_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP`;
  const statements = [];
  const markStatements = [];
  for (const st of staged) {
    const cur = currentByGamePk.get(String(st.game_pk)) || null;
    const diff = changedFields(cur, st);
    const changeType = cur ? (diff.changed.length ? "updated" : "unchanged") : "inserted";
    if (changeType === "unchanged") { unchanged++; continue; }
    if (changeType === "inserted") inserted++; else updated++;
    const changeId = rid("calendar_diff");
    statements.push(env.TEAM_DB.prepare(`INSERT INTO mlb_game_calendar_diff_changes (change_id, batch_id, game_pk, official_date_old, official_date_new, change_type, changed_fields_json, old_values_json, new_values_json, applied_to_main, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).bind(
      changeId, batchId, Number(st.game_pk), cur?.official_date || null, st.official_date || null, changeType, JSON.stringify(diff.changed), JSON.stringify(diff.oldValues), JSON.stringify(diff.newValues)
    ));
    statements.push(env.TEAM_DB.prepare(upsertSql).bind(
      Number(st.game_pk), Number(st.season), String(st.game_type || "R"), String(st.official_date || ""), String(st.game_time_utc || ""),
      st.status_code, st.abstract_game_state, st.detailed_state,
      Number(st.is_scheduled || 0), Number(st.is_pregame || 0), Number(st.is_live || 0), Number(st.is_final || 0), Number(st.is_postponed || 0), Number(st.is_suspended || 0), Number(st.is_cancelled || 0), Number(st.is_available_for_stats || 0),
      st.home_team_id == null ? null : Number(st.home_team_id), st.away_team_id == null ? null : Number(st.away_team_id), st.home_team_name || null, st.away_team_name || null,
      st.venue_id == null ? null : Number(st.venue_id), st.venue_name || null, st.doubleheader || null, st.game_number == null ? null : Number(st.game_number), st.series_game_number == null ? null : Number(st.series_game_number),
      st.source_endpoint || null, st.raw_json || null
    ));
    markStatements.push(env.TEAM_DB.prepare(`UPDATE mlb_game_calendar_diff_changes SET applied_to_main=1, updated_at=CURRENT_TIMESTAMP WHERE change_id=?`).bind(changeId));
    applied++;
    if (changeSamples.length < 20) changeSamples.push({ game_pk: st.game_pk, change_type: changeType, official_date_old: cur?.official_date || null, official_date_new: st.official_date || null, changed_fields: diff.changed });
    if (statements.length >= 40) {
      await batchPrepared(env.TEAM_DB, statements.splice(0), 40);
      await batchPrepared(env.TEAM_DB, markStatements.splice(0), 40);
    }
  }
  await batchPrepared(env.TEAM_DB, statements, 40);
  await batchPrepared(env.TEAM_DB, markStatements, 40);
  return { staged_rows: staged.length, inserted, updated, unchanged, applied, change_samples: changeSamples, fast_map_diff_v0_1_5: true };
}

async function latestMaxDate(db, table, column, where = "1=1") {
  const meta = await tableColumns(db, table);
  if (!meta.table_exists || !meta.columns.includes(column)) return { table_exists: meta.table_exists, column_exists: false, max_date: null, rows: 0 };
  const row = await first(db, `SELECT COUNT(*) AS rows, MAX(${column}) AS max_date FROM ${table} WHERE ${where}`);
  return { table_exists: true, column_exists: true, max_date: row?.max_date || null, rows: Number(row?.rows || 0) };
}

function passDateCoverage(officialDate, maxDate) {
  if (!officialDate || !maxDate) return false;
  return String(maxDate).slice(0, 10) >= String(officialDate).slice(0, 10);
}

async function snapshotLayerTemplateStatuses(env) {
  const hitterSplits = await latestMaxDate(env.STATS_HITTER_DB, "hitter_splits", "source_snapshot_date");
  const pitcherSplits = await latestMaxDate(env.STATS_PITCHER_DB, "pitcher_splits", "source_snapshot_date");
  const hitterMetrics = await latestMaxDate(env.STATS_HITTER_DB, "hitter_metric_batches", "input_latest_game_date", "certification_grade IN ('DELTA_RECALC_PASS','DELTA_NOOP_PASS','BASE_STAGE_PASS_NO_PROMOTION')");
  const hitterMetricRows = await first(env.STATS_HITTER_DB, `SELECT COUNT(*) AS rows FROM hitter_metric_snapshots`);
  const pitcherMetrics = await latestMaxDate(env.STATS_PITCHER_DB, "pitcher_metric_batches", "input_latest_game_date", "certification_grade IN ('DELTA_RECALC_PASS','DELTA_NOOP_PASS','BASE_STAGE_PASS_NO_PROMOTION')");
  const pitcherMetricRows = await first(env.STATS_PITCHER_DB, `SELECT COUNT(*) AS rows FROM pitcher_metric_snapshots`);
  return {
    hitter_splits: { meta: hitterSplits, rows: hitterSplits.rows, maxDate: hitterSplits.max_date, reason: "MISSING_HITTER_SPLITS_SNAPSHOT_COVERAGE_FOR_GAME_DATE", passGrade: "PASS_SNAPSHOT_DATE_ANCHORED", anchor: "game_date_snapshot" },
    pitcher_splits: { meta: pitcherSplits, rows: pitcherSplits.rows, maxDate: pitcherSplits.max_date, reason: "MISSING_PITCHER_SPLITS_SNAPSHOT_COVERAGE_FOR_GAME_DATE", passGrade: "PASS_SNAPSHOT_DATE_ANCHORED", anchor: "game_date_snapshot" },
    hitter_metrics: { meta: { ...hitterMetrics, snapshot_rows: Number(hitterMetricRows?.rows || 0) }, rows: Number(hitterMetricRows?.rows || 0), maxDate: hitterMetrics.max_date, reason: "MISSING_HITTER_METRIC_COVERAGE_FOR_GAME_DATE", passGrade: "PASS_METRIC_INPUT_DATE_ANCHORED", anchor: "game_date_metric_input_latest_game_date" },
    pitcher_metrics: { meta: { ...pitcherMetrics, snapshot_rows: Number(pitcherMetricRows?.rows || 0) }, rows: Number(pitcherMetricRows?.rows || 0), maxDate: pitcherMetrics.max_date, reason: "MISSING_PITCHER_METRIC_COVERAGE_FOR_GAME_DATE", passGrade: "PASS_METRIC_INPUT_DATE_ANCHORED", anchor: "game_date_metric_input_latest_game_date" }
  };
}

function snapshotLayerFromTemplate(layerKey, officialDate, templates) {
  const t = templates[layerKey];
  const pass = t.rows > 0 && passDateCoverage(officialDate, t.maxDate);
  return {
    layerKey,
    status: pass ? "complete" : "missing",
    grade: pass ? t.passGrade : "MISSING_BLOCKER",
    blocking: pass ? 0 : 1,
    liveRows: t.rows,
    entityCount: 0,
    expectedRows: null,
    missingRows: pass ? 0 : null,
    reason: pass ? null : t.reason,
    details: { ...t.meta, calendar_anchor_scope: t.anchor, snapshot_or_metric_date_anchor_v0_1_5: true, metrics_are_derived_from_game_logs_and_splits: layerKey.includes("metrics") || undefined }
  };
}

function dateOnlyForTimeZone(date = new Date(), timeZone = "America/Los_Angeles") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function calendarGameIsFinalOrStatsReady(g) {
  return Number(g.is_available_for_stats || 0) === 1 || Number(g.is_final || 0) === 1;
}

function shouldWaitForNonFinalCalendarGame(g, currentOfficialDate) {
  const officialDate = String(g.official_date || "").slice(0, 10);
  if (!officialDate || officialDate < String(currentOfficialDate || "")) return false;
  if (calendarGameIsFinalOrStatsReady(g)) return false;
  if (Number(g.is_postponed || 0) === 1 || Number(g.is_suspended || 0) === 1 || Number(g.is_cancelled || 0) === 1) return true;
  const abstractState = String(g.abstract_game_state || "").toLowerCase();
  const detailedState = String(g.detailed_state || "").toLowerCase();
  const statusCode = String(g.status_code || "").toUpperCase();
  const scheduledOrLiveNotFinal =
    Number(g.is_scheduled || 0) === 1 ||
    Number(g.is_pregame || 0) === 1 ||
    Number(g.is_live || 0) === 1 ||
    abstractState === "preview" ||
    abstractState === "live" ||
    detailedState.includes("scheduled") ||
    detailedState.includes("pre-game") ||
    detailedState.includes("warmup") ||
    statusCode === "S" ||
    statusCode === "P" ||
    statusCode === "I";
  return scheduledOrLiveNotFinal;
}

function scheduledNotReadyLayer(layerKey, g, liveSourceRowsForGame, extraDetails = {}) {
  return {
    layerKey,
    status: "scheduled_not_ready",
    grade: "WAITING_NOT_FINAL",
    blocking: 0,
    liveRows: Number(liveSourceRowsForGame || 0),
    entityCount: 0,
    expectedRows: null,
    missingRows: null,
    reason: null,
    details: {
      calendar_is_available_for_stats: Number(g.is_available_for_stats || 0),
      calendar_is_final: Number(g.is_final || 0),
      calendar_status_code: g.status_code || null,
      calendar_abstract_game_state: g.abstract_game_state || null,
      calendar_detailed_state: g.detailed_state || null,
      live_source_rows_for_game: Number(liveSourceRowsForGame || 0),
      current_day_nonfinal_nonblocking_v0_1_9: true,
      ...extraDetails
    }
  };
}

async function tableColumns(db, table) {
  const tableRow = await first(db, "SELECT name FROM sqlite_master WHERE type='table' AND name=?", table);
  if (!tableRow) return { table_exists: false, columns: [] };
  const rows = await all(db, `PRAGMA table_info(${table})`);
  return { table_exists: true, columns: rows.map(r => String(r.name || "")) };
}

async function groupedGameCounts(env, dbKey, table, distinctColumn, startDate, endDate) {
  const db = env[dbKey];
  const meta = await tableColumns(db, table);
  const out = new Map();
  if (!meta.table_exists || !meta.columns.includes("game_pk")) return { map: out, table_exists: meta.table_exists, game_pk_column_exists: meta.columns.includes("game_pk"), distinct_column: distinctColumn, distinct_column_exists: false };
  const hasDistinct = distinctColumn && meta.columns.includes(distinctColumn);
  const hasGameDate = meta.columns.includes("game_date");
  const where = hasGameDate ? `WHERE game_date BETWEEN ? AND ?` : `WHERE 1=1`;
  const sql = `SELECT game_pk, COUNT(*) AS rows${hasDistinct ? `, COUNT(DISTINCT ${distinctColumn}) AS entities` : `, 0 AS entities`} FROM ${table} ${where} GROUP BY game_pk`;
  const rows = hasGameDate ? await all(db, sql, startDate, endDate) : await all(db, sql);
  for (const r of rows) out.set(String(r.game_pk), { rows: Number(r.rows || 0), entities: Number(r.entities || 0) });
  return { map: out, table_exists: true, game_pk_column_exists: true, distinct_column: distinctColumn, distinct_column_exists: Boolean(hasDistinct) };
}

function countFromMap(meta, gamePk) {
  const val = meta.map.get(String(gamePk)) || { rows: 0, entities: 0 };
  return { rows: val.rows, entities: val.entities, table_exists: meta.table_exists, game_pk_column_exists: meta.game_pk_column_exists, distinct_column: meta.distinct_column, distinct_column_exists: meta.distinct_column_exists };
}

async function rebuildCoverage(env, batchId, requestId, startDate, endDate) {
  const activeLayers = activeCoverageLayerKeys();
  const currentOfficialDate = dateOnlyForTimeZone(new Date(), "America/Los_Angeles");
  const games = await all(env.TEAM_DB, `SELECT
      game_pk,
      season,
      official_date,
      status_code,
      abstract_game_state,
      detailed_state,
      is_scheduled,
      is_pregame,
      is_live,
      is_final,
      is_postponed,
      is_suspended,
      is_cancelled,
      is_available_for_stats
    FROM mlb_game_calendar
    WHERE official_date BETWEEN ? AND ?
    ORDER BY official_date, game_pk`, startDate, endDate);
  let coverageRows = 0;
  let blockingGaps = 0;
  const gapsSample = [];

  await run(env.TEAM_DB, `DELETE FROM mlb_game_coverage_gaps WHERE batch_id=?`, batchId);

  // Critical v0.1.6 ownership fix:
  // Differential calendar updates may be incremental, but coverage tally ownership must be a full current-window matrix.
  // Delete only the scoped current calendar window + explicit known layer set, then rebuild every game_pk + layer_key.
  // This prevents stale last_batch_id rows from surviving when a prior batch already inserted the same PK pair.
  const layerListSql = activeLayers.map(k => `'${k}'`).join(',');
  await run(env.TEAM_DB, `DELETE FROM mlb_game_data_coverage
    WHERE game_pk IN (SELECT game_pk FROM mlb_game_calendar WHERE official_date BETWEEN ? AND ?)
      AND layer_key IN (${layerListSql})`, startDate, endDate);

  const hitterCounts = await groupedGameCounts(env, "STATS_HITTER_DB", "hitter_game_logs", "player_id", startDate, endDate);
  const pitcherCounts = await groupedGameCounts(env, "STATS_PITCHER_DB", "pitcher_game_logs", "player_id", startDate, endDate);
  const teamCounts = await groupedGameCounts(env, "TEAM_DB", "team_game_logs", "team_id", startDate, endDate);
  const starterPlayerCounts = await groupedGameCounts(env, "TEAM_DB", "starter_history", "player_id", startDate, endDate);
  const starterTeamCounts = await groupedGameCounts(env, "TEAM_DB", "starter_history", "team_id", startDate, endDate);
  const bullpenCounts = await groupedGameCounts(env, "TEAM_DB", "bullpen_history", "pitcher_id", startDate, endDate);
  const snapshotTemplates = await snapshotLayerTemplateStatuses(env);

  const coverageSql = `INSERT INTO mlb_game_data_coverage (
        game_pk, season, official_date, layer_key, layer_family, coverage_scope, coverage_status, coverage_grade, blocking_for_full_run,
        expected_rows, live_rows, stage_rows, outcome_rows, missing_rows, expected_entity_type, live_entity_count, stage_entity_count, exception_count,
        represented_by_live, represented_by_stage, represented_by_exception, missing_reason, exception_reason,
        last_batch_id, last_request_id, last_worker_name, last_worker_version, last_checked_at, last_completed_at, details_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(game_pk, layer_key) DO UPDATE SET
        season=excluded.season,
        official_date=excluded.official_date,
        layer_family=excluded.layer_family,
        coverage_scope=excluded.coverage_scope,
        coverage_status=excluded.coverage_status,
        coverage_grade=excluded.coverage_grade,
        blocking_for_full_run=excluded.blocking_for_full_run,
        expected_rows=excluded.expected_rows,
        live_rows=excluded.live_rows,
        stage_rows=excluded.stage_rows,
        outcome_rows=excluded.outcome_rows,
        missing_rows=excluded.missing_rows,
        expected_entity_type=excluded.expected_entity_type,
        live_entity_count=excluded.live_entity_count,
        stage_entity_count=excluded.stage_entity_count,
        exception_count=excluded.exception_count,
        represented_by_live=excluded.represented_by_live,
        represented_by_stage=excluded.represented_by_stage,
        represented_by_exception=excluded.represented_by_exception,
        missing_reason=excluded.missing_reason,
        exception_reason=excluded.exception_reason,
        last_batch_id=excluded.last_batch_id,
        last_request_id=excluded.last_request_id,
        last_worker_name=excluded.last_worker_name,
        last_worker_version=excluded.last_worker_version,
        last_checked_at=CURRENT_TIMESTAMP,
        last_completed_at=CURRENT_TIMESTAMP,
        details_json=excluded.details_json,
        updated_at=CURRENT_TIMESTAMP`;
  const gapSql = `INSERT OR REPLACE INTO mlb_game_coverage_gaps (gap_id, batch_id, game_pk, season, official_date, layer_key, gap_status, missing_reason, expected_rows, live_rows, stage_rows, outcome_rows, details_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
  const coverageStatements = [];
  const gapStatements = [];

  function addLayer(g, l) {
    const gamePk = Number(g.game_pk);
    const stageRows = Number(l.stageRows || 0);
    const outcomeRows = Number(l.outcomeRows || 0);
    const exceptionCount = Number(l.exceptionCount || 0);
    const representedByLive = l.liveRows > 0 ? 1 : 0;
    const representedByStage = stageRows > 0 ? 1 : 0;
    const representedByException = exceptionCount > 0 ? 1 : 0;
    coverageStatements.push(env.TEAM_DB.prepare(coverageSql).bind(
      gamePk, Number(g.season), String(g.official_date), l.layerKey,
      (String(l.layerKey).includes('splits') || String(l.layerKey).includes('metrics')) ? 'derived_snapshot' : 'source_history',
      (String(l.layerKey).includes('splits') || String(l.layerKey).includes('metrics')) ? 'game_date' : 'game',
      l.status, l.grade, l.blocking, l.expectedRows, l.liveRows, stageRows, outcomeRows, l.missingRows,
      l.layerKey, l.entityCount, 0, exceptionCount, representedByLive, representedByStage, representedByException,
      l.reason, l.exceptionReason || null,
      batchId, requestId, WORKER_NAME, VERSION, JSON.stringify(l.details || {})
    ));
    coverageRows++;
    if (l.blocking === 1) {
      blockingGaps++;
      const gap = { game_pk: gamePk, official_date: g.official_date, layer_key: l.layerKey, missing_reason: l.reason, live_rows: l.liveRows, coverage_grade: l.grade };
      if (gapsSample.length < 20) gapsSample.push(gap);
      gapStatements.push(env.TEAM_DB.prepare(gapSql).bind(rid("gap"), batchId, gamePk, Number(g.season), String(g.official_date), l.layerKey, l.status, l.reason, l.expectedRows, l.liveRows, stageRows, outcomeRows, JSON.stringify(gap)));
    }
  }

  for (const g of games) {
    const gamePk = Number(g.game_pk);
    const calendarStatsReady = Number(g.is_available_for_stats || 0) === 1;
    const hitter = countFromMap(hitterCounts, gamePk);
    const pitcher = countFromMap(pitcherCounts, gamePk);
    const team = countFromMap(teamCounts, gamePk);
    const starter = countFromMap(starterPlayerCounts, gamePk);
    const starterTeam = countFromMap(starterTeamCounts, gamePk);
    const bullpen = countFromMap(bullpenCounts, gamePk);
    const liveSourceRowsForGame = hitter.rows + pitcher.rows + team.rows + starter.rows + bullpen.rows;
    const statEvidenceRowsForGame = hitter.rows + pitcher.rows;
    const downstreamEvidenceRowsForGame = team.rows + starter.rows + bullpen.rows;
    const statEvidenceFinalityGate = statEvidenceRowsForGame > 0 || downstreamEvidenceRowsForGame > 0;
    const rawWaitForNonFinalCalendarGame = shouldWaitForNonFinalCalendarGame(g, currentOfficialDate);
    const waitForNonFinalCalendarGame = rawWaitForNonFinalCalendarGame && !statEvidenceFinalityGate;
    const evaluateLiveLayers = calendarStatsReady || Number(g.is_final || 0) === 1 || statEvidenceFinalityGate;

    if (waitForNonFinalCalendarGame || !evaluateLiveLayers) {
      for (const layerKey of activeLayers) {
        addLayer(g, scheduledNotReadyLayer(layerKey, g, liveSourceRowsForGame, {
          live_source_override_v0_1_8: false,
          stat_evidence_finality_gate_v0_2_0: true,
          stat_evidence_rows_for_game: statEvidenceRowsForGame,
          downstream_evidence_rows_for_game: downstreamEvidenceRowsForGame,
          raw_wait_for_nonfinal_calendar_game: rawWaitForNonFinalCalendarGame,
          wait_suppressed_by_stat_evidence: false
        }));
      }
    } else {
      const overrideDetails = {
        calendar_is_available_for_stats: Number(g.is_available_for_stats || 0),
        calendar_is_final: Number(g.is_final || 0),
        calendar_status_code: g.status_code || null,
        calendar_abstract_game_state: g.abstract_game_state || null,
        calendar_detailed_state: g.detailed_state || null,
        live_source_rows_for_game: liveSourceRowsForGame,
        stat_evidence_rows_for_game: statEvidenceRowsForGame,
        downstream_evidence_rows_for_game: downstreamEvidenceRowsForGame,
        stat_evidence_finality_gate_v0_2_0: true,
        stale_calendar_wait_suppressed_by_stat_evidence_v0_2_0: rawWaitForNonFinalCalendarGame && statEvidenceFinalityGate,
        live_source_override_v0_1_8: !calendarStatsReady && Number(g.is_final || 0) === 1 && liveSourceRowsForGame > 0,
        current_day_nonfinal_nonblocking_v0_1_9: false
      };
      addLayer(g, hitter.rows > 0 ? { layerKey: "hitter_game_logs", status: "complete", grade: "PASS", blocking: 0, liveRows: hitter.rows, entityCount: hitter.entities, expectedRows: null, missingRows: 0, reason: null, details: { ...hitter, ...overrideDetails } } : { layerKey: "hitter_game_logs", status: "missing", grade: "MISSING_BLOCKER", blocking: 1, liveRows: 0, entityCount: 0, expectedRows: null, missingRows: null, reason: "MISSING_HITTER_GAME_LOG_ROWS_FOR_FINAL_OR_LIVE_EVIDENCED_GAME_PK", details: { ...hitter, ...overrideDetails } });
      addLayer(g, pitcher.rows > 0 ? { layerKey: "pitcher_game_logs", status: "complete", grade: "PASS", blocking: 0, liveRows: pitcher.rows, entityCount: pitcher.entities, expectedRows: null, missingRows: 0, reason: null, details: { ...pitcher, ...overrideDetails } } : { layerKey: "pitcher_game_logs", status: "missing", grade: "MISSING_BLOCKER", blocking: 1, liveRows: 0, entityCount: 0, expectedRows: null, missingRows: null, reason: "MISSING_PITCHER_GAME_LOG_ROWS_FOR_FINAL_OR_LIVE_EVIDENCED_GAME_PK", details: { ...pitcher, ...overrideDetails } });
      const teamPass = team.rows === 2 && team.entities === 2;
      addLayer(g, teamPass ? { layerKey: "team_game_logs", status: "complete", grade: "PASS", blocking: 0, liveRows: team.rows, entityCount: team.entities, expectedRows: 2, missingRows: 0, reason: null, details: { ...team, ...overrideDetails } } : { layerKey: "team_game_logs", status: team.rows > 0 ? "partial" : "missing", grade: team.rows > 0 ? "PARTIAL_BLOCKER" : "MISSING_BLOCKER", blocking: 1, liveRows: team.rows, entityCount: team.entities, expectedRows: 2, missingRows: Math.max(0, 2 - team.rows), reason: team.rows > 0 ? "PARTIAL_TEAM_GAME_LOG_ROWS_FOR_FINAL_OR_LIVE_EVIDENCED_GAME_PK" : "MISSING_TEAM_GAME_LOG_ROWS_FOR_FINAL_OR_LIVE_EVIDENCED_GAME_PK", details: { ...team, ...overrideDetails } });
      const starterPass = starter.rows >= 2 && starter.entities >= 2 && starterTeam.entities === 2;
      addLayer(g, starterPass ? { layerKey: "starter_history", status: "complete", grade: "PASS", blocking: 0, liveRows: starter.rows, entityCount: starter.entities, expectedRows: 2, missingRows: 0, reason: null, details: { ...starter, distinct_teams: starterTeam.entities, ...overrideDetails } } : { layerKey: "starter_history", status: starter.rows > 0 ? "partial" : "missing", grade: starter.rows > 0 ? "PARTIAL_BLOCKER" : "MISSING_BLOCKER", blocking: 1, liveRows: starter.rows, entityCount: starter.entities, expectedRows: 2, missingRows: Math.max(0, 2 - starter.rows), reason: starter.rows > 0 ? "PARTIAL_STARTER_HISTORY_ROWS_FOR_FINAL_OR_LIVE_EVIDENCED_GAME_PK" : "MISSING_STARTER_HISTORY_ROWS_FOR_FINAL_OR_LIVE_EVIDENCED_GAME_PK", details: { ...starter, distinct_teams: starterTeam.entities, ...overrideDetails } });
      addLayer(g, bullpen.rows > 0 ? { layerKey: "bullpen_history", status: "complete", grade: "PASS", blocking: 0, liveRows: bullpen.rows, entityCount: bullpen.entities, expectedRows: null, missingRows: 0, reason: null, details: { ...bullpen, ...overrideDetails } } : { layerKey: "bullpen_history", status: "missing", grade: "MISSING_BLOCKER", blocking: 1, liveRows: 0, entityCount: 0, expectedRows: null, missingRows: null, reason: "MISSING_BULLPEN_HISTORY_REPRESENTATION_FOR_FINAL_OR_LIVE_EVIDENCED_GAME_PK", details: { ...bullpen, ...overrideDetails } });
      for (const snapshotLayerKey of ["hitter_splits", "pitcher_splits", "hitter_metrics", "pitcher_metrics"]) addLayer(g, snapshotLayerFromTemplate(snapshotLayerKey, String(g.official_date), snapshotTemplates));
    }
    if (coverageStatements.length >= 80) {
      await batchPrepared(env.TEAM_DB, coverageStatements.splice(0), 40);
      await batchPrepared(env.TEAM_DB, gapStatements.splice(0), 40);
    }
  }
  await batchPrepared(env.TEAM_DB, coverageStatements, 40);
  await batchPrepared(env.TEAM_DB, gapStatements, 40);

  // v0.1.8 hard reconcile: if bullpen live rows already exist for a game, coverage must not remain missing.
  // This protects the full-run gate from partial-success cases where live promotion succeeds before a later metadata/cursor write fails.
  const bullpenReconcile = { checked_rows: 0, updated_rows: 0, sample: [] };
  const bullpenMismatchRows = await all(env.TEAM_DB, `
    SELECT
      cov.game_pk,
      cov.season,
      cov.official_date,
      cov.coverage_status,
      cov.coverage_grade,
      cov.live_rows AS coverage_live_rows,
      cov.blocking_for_full_run AS coverage_blocking_for_full_run,
      COUNT(DISTINCT bh.bullpen_key) AS actual_live_rows,
      COUNT(DISTINCT bh.pitcher_id) AS actual_entity_count
    FROM mlb_game_data_coverage cov
    LEFT JOIN bullpen_history bh
      ON bh.game_pk = cov.game_pk
     AND bh.season = cov.season
    WHERE cov.official_date BETWEEN ? AND ?
      AND cov.layer_key = 'bullpen_history'
    GROUP BY
      cov.game_pk,
      cov.season,
      cov.official_date,
      cov.coverage_status,
      cov.coverage_grade,
      cov.live_rows,
      cov.blocking_for_full_run
    HAVING actual_live_rows > 0
       AND (cov.coverage_status <> 'complete' OR cov.coverage_grade <> 'PASS' OR COALESCE(cov.live_rows,0) <> actual_live_rows OR COALESCE(cov.blocking_for_full_run,0) <> 0)
    ORDER BY cov.official_date, cov.game_pk
  `, startDate, endDate);
  bullpenReconcile.checked_rows = bullpenMismatchRows.length;
  for (const r of bullpenMismatchRows) {
    const actualRows = Number(r.actual_live_rows || 0);
    const actualEntities = Number(r.actual_entity_count || 0);
    await run(env.TEAM_DB, `
      UPDATE mlb_game_data_coverage
      SET coverage_status='complete',
          coverage_grade='PASS',
          blocking_for_full_run=0,
          expected_rows=NULL,
          live_rows=?,
          live_entity_count=?,
          missing_rows=0,
          represented_by_live=1,
          missing_reason=NULL,
          last_batch_id=?,
          last_request_id=?,
          last_worker_name=?,
          last_worker_version=?,
          last_checked_at=CURRENT_TIMESTAMP,
          last_completed_at=CURRENT_TIMESTAMP,
          details_json=?,
          updated_at=CURRENT_TIMESTAMP
      WHERE game_pk=?
        AND season=?
        AND layer_key='bullpen_history'
    `, actualRows, actualEntities, batchId, requestId, WORKER_NAME, VERSION, JSON.stringify({ bullpen_live_reconcile_after_coverage_v0_1_8: true, previous_coverage_status: r.coverage_status, previous_coverage_grade: r.coverage_grade, previous_coverage_live_rows: Number(r.coverage_live_rows || 0), previous_blocking_for_full_run: Number(r.coverage_blocking_for_full_run || 0), actual_live_rows: actualRows, actual_entity_count: actualEntities }), Number(r.game_pk), Number(r.season));
    await run(env.TEAM_DB, `DELETE FROM mlb_game_coverage_gaps WHERE batch_id=? AND game_pk=? AND layer_key='bullpen_history'`, batchId, Number(r.game_pk));
    bullpenReconcile.updated_rows++;
    if (bullpenReconcile.sample.length < 10) bullpenReconcile.sample.push({ game_pk: Number(r.game_pk), official_date: String(r.official_date), previous_status: r.coverage_status, previous_live_rows: Number(r.coverage_live_rows || 0), actual_live_rows: actualRows });
  }

  const expectedCoverageRows = games.length * activeLayers.length;
  const actualCoverage = await first(env.TEAM_DB, `SELECT COUNT(*) AS rows FROM mlb_game_data_coverage WHERE game_pk IN (SELECT game_pk FROM mlb_game_calendar WHERE official_date BETWEEN ? AND ?) AND layer_key IN (${layerListSql})`, startDate, endDate);
  const latestBatchCoverage = await first(env.TEAM_DB, `SELECT COUNT(*) AS rows FROM mlb_game_data_coverage WHERE game_pk IN (SELECT game_pk FROM mlb_game_calendar WHERE official_date BETWEEN ? AND ?) AND layer_key IN (${layerListSql}) AND last_batch_id=?`, startDate, endDate, batchId);
  const staleOwnership = await first(env.TEAM_DB, `SELECT COUNT(*) AS rows FROM mlb_game_data_coverage WHERE game_pk IN (SELECT game_pk FROM mlb_game_calendar WHERE official_date BETWEEN ? AND ?) AND layer_key IN (${layerListSql}) AND (last_batch_id IS NULL OR last_batch_id <> ?)`, startDate, endDate, batchId);
  const nullGuards = await first(env.TEAM_DB, `SELECT
      SUM(CASE WHEN last_batch_id IS NULL THEN 1 ELSE 0 END) AS null_batch_rows,
      SUM(CASE WHEN last_checked_at IS NULL THEN 1 ELSE 0 END) AS null_checked_rows,
      SUM(CASE WHEN coverage_status IS NULL OR coverage_grade IS NULL THEN 1 ELSE 0 END) AS null_status_grade_rows
    FROM mlb_game_data_coverage
    WHERE game_pk IN (SELECT game_pk FROM mlb_game_calendar WHERE official_date BETWEEN ? AND ?)
      AND layer_key IN (${layerListSql})`, startDate, endDate);

  const actualCoverageRows = Number(actualCoverage?.rows || 0);
  const latestBatchCoverageRows = Number(latestBatchCoverage?.rows || 0);
  const staleCoverageOwnerRows = Number(staleOwnership?.rows || 0);
  const coverageRowsWithNullBatch = Number(nullGuards?.null_batch_rows || 0);
  const coverageRowsWithNullCheckedAt = Number(nullGuards?.null_checked_rows || 0);
  const coverageRowsWithNullStatusGrade = Number(nullGuards?.null_status_grade_rows || 0);
  const coverageOwnershipClean = actualCoverageRows === expectedCoverageRows &&
    latestBatchCoverageRows === expectedCoverageRows &&
    staleCoverageOwnerRows === 0 &&
    coverageRowsWithNullBatch === 0 &&
    coverageRowsWithNullCheckedAt === 0 &&
    coverageRowsWithNullStatusGrade === 0;

  return {
    coverageRows,
    blockingGaps,
    gapsSample,
    gamesChecked: games.length,
    active_layer_count: activeLayers.length,
    expected_coverage_rows: expectedCoverageRows,
    actual_coverage_rows: actualCoverageRows,
    latest_batch_coverage_rows: latestBatchCoverageRows,
    stale_coverage_owner_rows: staleCoverageOwnerRows,
    coverage_rows_with_null_batch: coverageRowsWithNullBatch,
    coverage_rows_with_null_checked_at: coverageRowsWithNullCheckedAt,
    coverage_rows_with_null_status_grade: coverageRowsWithNullStatusGrade,
    coverage_ownership_clean: coverageOwnershipClean,
    scoped_delete_then_rebuild_current_window_v0_1_6: true,
    optimized_full_calendar_coverage_v0_1_6: true,
    live_source_override_calendar_wait_v0_1_8: true,
    current_day_nonfinal_nonblocking_v0_1_9: true,
    stat_evidence_finality_gate_v0_2_0: true,
    stale_calendar_nonfinal_wait_suppressed_when_stat_evidence_exists: true,
    current_official_date_pt: currentOfficialDate,
    bullpen_live_reconcile_after_coverage_v0_1_8: true,
    bullpen_live_reconcile_checked_rows: bullpenReconcile.checked_rows,
    bullpen_live_reconcile_updated_rows: bullpenReconcile.updated_rows,
    bullpen_live_reconcile_sample: bullpenReconcile.sample
  };
}

function dateOnlyUtc(d) { return d.toISOString().slice(0, 10); }
function parseDateSafe(value, fallback) {
  const s = String(value || fallback || "").slice(0, 10);
  const d = new Date(s + "T00:00:00Z");
  return Number.isNaN(d.getTime()) ? new Date(String(fallback).slice(0, 10) + "T00:00:00Z") : d;
}
function addMonthsUtc(date, months) {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}
function buildMonthChunks(startDate, endDate) {
  const start = parseDateSafe(startDate, "2026-03-01");
  const end = parseDateSafe(endDate, "2026-11-30");
  const chunks = [];
  let cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  if (cur < start) cur = start;
  while (cur <= end) {
    const monthEnd = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0));
    const chunkEnd = monthEnd < end ? monthEnd : end;
    chunks.push({ start: dateOnlyUtc(cur), end: dateOnlyUtc(chunkEnd) });
    cur = new Date(Date.UTC(chunkEnd.getUTCFullYear(), chunkEnd.getUTCMonth(), chunkEnd.getUTCDate() + 1));
  }
  return chunks;
}

async function handleFullCalendarSeed(input, env) {
  const startedAt = nowUtc();
  const batchId = rid("game_calendar_full_seed_batch");
  const requestId = input.request_id || null;
  const nested = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
  const season = Number(nested.season || input.season || 2026);
  const startDate = String(nested.season_start_date || nested.start_date || input.start_date || `${season}-03-01`).slice(0, 10);
  const endDate = String(nested.season_end_date || nested.end_date || input.end_date || `${season}-11-30`).slice(0, 10);
  const gameTypes = String(nested.game_types || input.game_types || "R,P");
  const hydrate = String(nested.hydrate || input.hydrate || "team,venue,probablePitcher(note)");

  await ensureCoverageTables(env);
  const chunks = buildMonthChunks(startDate, endDate);
  let sourceGameCount = 0;
  let sourceStatsAvailableCount = 0;
  let calendarRowsUpserted = 0;
  let externalCalls = 0;
  const chunkReports = [];
  const statusCounts = {};
  const gameTypeCounts = {};

  for (const chunk of chunks) {
    const schedule = await fetchSchedule(chunk.start, chunk.end, gameTypes, hydrate);
    externalCalls++;
    const upserted = await upsertCalendar(env, schedule.games, schedule.endpoint);
    sourceGameCount += schedule.games.length;
    calendarRowsUpserted += upserted;
    let chunkStatsAvailable = 0;
    for (const g of schedule.games) {
      const c = classifyGame(g);
      if (c.is_available_for_stats === 1) chunkStatsAvailable++;
      const sk = `${c.status_code || ""}|${c.abstract_game_state || ""}|${c.detailed_state || ""}`;
      statusCounts[sk] = (statusCounts[sk] || 0) + 1;
      const gt = String(g.gameType || "");
      gameTypeCounts[gt] = (gameTypeCounts[gt] || 0) + 1;
    }
    sourceStatsAvailableCount += chunkStatsAvailable;
    chunkReports.push({ start_date: chunk.start, end_date: chunk.end, endpoint: schedule.endpoint, source_game_count: schedule.games.length, stats_available_game_count: chunkStatsAvailable, rows_upserted: upserted, observed_status_codes_sample: schedule.statusSamples.slice(0, 12), observed_game_types_sample: schedule.gameTypes });
  }

  const seasonSummary = await all(env.TEAM_DB, `SELECT substr(official_date,1,7) AS month, game_type, status_code, detailed_state, COUNT(*) AS games, SUM(is_available_for_stats) AS stats_available_games FROM mlb_game_calendar WHERE official_date BETWEEN ? AND ? GROUP BY substr(official_date,1,7), game_type, status_code, detailed_state ORDER BY month, game_type, status_code`, startDate, endDate);
  const totalStored = await first(env.TEAM_DB, `SELECT COUNT(*) AS rows, COUNT(DISTINCT game_pk) AS distinct_game_pks, MIN(official_date) AS first_official_date, MAX(official_date) AS last_official_date, SUM(is_available_for_stats) AS stats_available_games FROM mlb_game_calendar WHERE official_date BETWEEN ? AND ?`, startDate, endDate);
  const badIdentity = await first(env.TEAM_DB, `SELECT COUNT(*) AS bad_rows FROM mlb_game_calendar WHERE official_date BETWEEN ? AND ? AND (game_pk IS NULL OR home_team_id IS NULL OR away_team_id IS NULL OR home_team_id = away_team_id OR raw_json IS NULL OR raw_json='')`, startDate, endDate);

  const output = {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    request_id: requestId,
    chain_id: input.chain_id || null,
    batch_id: batchId,
    mode: "game_calendar_full_seed",
    status: "GAME_CALENDAR_FULL_SEED_COMPLETED",
    certification: "GAME_CALENDAR_FULL_SEED_COMPLETED_NO_REPAIRS",
    certification_grade: "CALENDAR_SEED_PASS_VALIDATE_WITH_LIVE_TOTALS",
    season,
    season_start_date: startDate,
    season_end_date: endDate,
    game_types: gameTypes,
    chunk_count: chunks.length,
    source_game_count: sourceGameCount,
    source_stats_available_game_count: sourceStatsAvailableCount,
    calendar_rows_upserted: calendarRowsUpserted,
    stored_calendar_rows_in_range: Number(totalStored?.rows || 0),
    stored_distinct_game_pks_in_range: Number(totalStored?.distinct_game_pks || 0),
    first_official_date: totalStored?.first_official_date || null,
    last_official_date: totalStored?.last_official_date || null,
    stored_stats_available_games_in_range: Number(totalStored?.stats_available_games || 0),
    bad_identity_rows_in_range: Number(badIdentity?.bad_rows || 0),
    observed_status_counts: statusCounts,
    observed_game_type_counts: gameTypeCounts,
    chunk_reports: chunkReports,
    month_status_summary: seasonSummary,
    official_date_is_canonical_anchor: true,
    preserve_out_of_window_rescheduled_rows: true,
    upsert_by_game_pk_only: true,
    no_unscoped_hard_delete: true,
    scoped_coverage_matrix_delete_only: true,
    no_source_history_mutation: true,
    no_repair_jobs_created: true,
    no_coverage_rebuild_in_full_seed: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_board_mutation: true,
    no_daily_context_mutation: true,
    rows_read: sourceGameCount,
    rows_written: calendarRowsUpserted,
    external_calls_performed: externalCalls,
    finished_at: nowUtc()
  };

  await run(env.TEAM_DB, `INSERT INTO mlb_game_coverage_batches (batch_id, run_id, request_id, worker_name, worker_version, mode, status, coverage_window_start, coverage_window_end, source_game_count, source_final_game_pk_count, coverage_rows_written, missing_game_layer_count, blocking_gap_count, certification_status, certification_grade, started_at, finished_at, output_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    batchId, input.run_id || null, requestId, WORKER_NAME, VERSION, "game_calendar_full_seed", output.status, startDate, endDate, sourceGameCount, sourceStatsAvailableCount, output.certification, output.certification_grade, startedAt, JSON.stringify(output));

  return output;
}

async function handleCoverageAudit(input, env) {
  const startedAt = nowUtc();
  const batchId = rid("game_coverage_batch");
  const requestId = input.request_id || null;
  const nested = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
  const startDate = nested.coverage_window_start || input.coverage_window_start || "2026-05-23";
  const endDate = nested.coverage_window_end || input.coverage_window_end || "2026-05-26";

  await ensureCoverageTables(env);
  const schedule = await fetchSchedule(startDate, endDate);
  const calendarRowsUpserted = await upsertCalendar(env, schedule.games, schedule.endpoint);
  const sourceFinalGamePkCount = schedule.games.filter(g => classifyGame(g).is_available_for_stats === 1).length;
  const coverage = await rebuildCoverage(env, batchId, requestId, startDate, endDate);

  const ownershipFailed = coverage.coverage_ownership_clean !== true;
  const status = ownershipFailed ? "GAME_CALENDAR_COVERAGE_AUDIT_FAILED_COVERAGE_OWNERSHIP" : (coverage.blockingGaps > 0 ? "GAME_CALENDAR_COVERAGE_AUDIT_COMPLETED_WITH_GAPS" : "GAME_CALENDAR_COVERAGE_AUDIT_COMPLETED_CLEAN");
  const certification = ownershipFailed ? "GAME_CALENDAR_COVERAGE_AUDIT_COVERAGE_OWNERSHIP_FAILED" : (coverage.blockingGaps > 0 ? "GAME_CALENDAR_COVERAGE_AUDIT_GAPS_FOUND" : "GAME_CALENDAR_COVERAGE_AUDIT_NO_BLOCKING_GAPS");
  const grade = ownershipFailed ? "AUDIT_FAIL_COVERAGE_OWNERSHIP" : (coverage.blockingGaps > 0 ? "AUDIT_PASS_WITH_BLOCKERS" : "AUDIT_PASS_CLEAN");

  const output = {
    ok: !ownershipFailed,
    data_ok: !ownershipFailed,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    request_id: requestId,
    chain_id: input.chain_id || null,
    batch_id: batchId,
    mode: "game_calendar_coverage_audit",
    status,
    certification,
    certification_grade: grade,
    coverage_window_start: startDate,
    coverage_window_end: endDate,
    source_endpoint: schedule.endpoint,
    schedule_fetch_ok: true,
    source_game_count: schedule.games.length,
    source_final_game_pk_count: sourceFinalGamePkCount,
    stats_available_game_pk_count: sourceFinalGamePkCount,
    calendar_rows_upserted: calendarRowsUpserted,
    observed_status_codes_sample: schedule.statusSamples,
    observed_game_types_sample: schedule.gameTypes,
    live_schema_column_guard_v0_1_2: true,
    source_shape_probe: {
      endpoint: schedule.endpoint,
      game_count: schedule.games.length,
      sample_game_fields: Object.keys(schedule.games[0] || {}).slice(0, 50),
      sample_status: schedule.games[0]?.status || null,
      critical_fields_present_sample: !!(schedule.games[0]?.gamePk && schedule.games[0]?.officialDate && schedule.games[0]?.status && schedule.games[0]?.teams?.home?.team?.id && schedule.games[0]?.teams?.away?.team?.id)
    },
    coverage_checked: true,
    coverage_rows_written: coverage.coverageRows,
    active_layer_count: coverage.active_layer_count,
    expected_coverage_rows: coverage.expected_coverage_rows,
    actual_coverage_rows: coverage.actual_coverage_rows,
    latest_batch_coverage_rows: coverage.latest_batch_coverage_rows,
    stale_coverage_owner_rows: coverage.stale_coverage_owner_rows,
    coverage_rows_with_null_batch: coverage.coverage_rows_with_null_batch,
    coverage_rows_with_null_checked_at: coverage.coverage_rows_with_null_checked_at,
    coverage_rows_with_null_status_grade: coverage.coverage_rows_with_null_status_grade,
    coverage_ownership_clean: coverage.coverage_ownership_clean,
    scoped_delete_then_rebuild_current_window_v0_1_6: coverage.scoped_delete_then_rebuild_current_window_v0_1_6,
    layer_keys_checked: activeCoverageLayerKeys(),
    missing_game_layer_count: coverage.blockingGaps,
    blocking_gap_count: coverage.blockingGaps,
    gaps_sample: coverage.gapsSample,
    known_false_pass_gap_detected: coverage.gapsSample.some(g => String(g.official_date) === "2026-05-25"),
    no_source_history_mutation: true,
    no_repair_jobs_created: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_board_mutation: true,
    no_daily_context_mutation: true,
    rows_read: schedule.games.length,
    rows_written: calendarRowsUpserted + coverage.coverageRows,
    external_calls_performed: 1,
    finished_at: nowUtc()
  };

  await run(env.TEAM_DB, `INSERT INTO mlb_game_coverage_batches (batch_id, run_id, request_id, worker_name, worker_version, mode, status, coverage_window_start, coverage_window_end, source_game_count, source_final_game_pk_count, coverage_rows_written, missing_game_layer_count, blocking_gap_count, certification_status, certification_grade, started_at, finished_at, output_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    batchId, input.run_id || null, requestId, WORKER_NAME, VERSION, "game_calendar_coverage_audit", status, startDate, endDate, schedule.games.length, sourceFinalGamePkCount, coverage.coverageRows, coverage.blockingGaps, coverage.blockingGaps, certification, grade, startedAt, JSON.stringify(output));

  return output;
}


async function handleCalendarDifferentialCheck(input, env) {
  const startedAt = nowUtc();
  const batchId = rid("game_calendar_differential_batch");
  const requestId = input.request_id || null;
  const nested = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
  const season = Number(nested.season || input.season || 2026);
  const startDate = String(nested.season_start_date || nested.start_date || input.start_date || `${season}-03-01`).slice(0, 10);
  const endDate = String(nested.season_end_date || nested.end_date || input.end_date || `${season}-11-30`).slice(0, 10);
  const gameTypes = String(nested.game_types || input.game_types || "R,P");
  const hydrate = String(nested.hydrate || input.hydrate || "team,venue,probablePitcher(note)");

  await ensureCoverageTables(env);
  const chunks = buildMonthChunks(startDate, endDate);
  let sourceGameCount = 0;
  let sourceStatsAvailableCount = 0;
  let stageRowsUpserted = 0;
  let externalCalls = 0;
  const chunkReports = [];
  const statusCounts = {};
  const gameTypeCounts = {};

  for (const chunk of chunks) {
    const schedule = await fetchSchedule(chunk.start, chunk.end, gameTypes, hydrate);
    externalCalls++;
    const staged = await upsertCalendarStage(env, schedule.games, schedule.endpoint, batchId);
    sourceGameCount += schedule.games.length;
    stageRowsUpserted += staged;
    let chunkStatsAvailable = 0;
    for (const g of schedule.games) {
      const c = classifyGame(g);
      if (c.is_available_for_stats === 1) chunkStatsAvailable++;
      const sk = `${c.status_code || ""}|${c.abstract_game_state || ""}|${c.detailed_state || ""}`;
      statusCounts[sk] = (statusCounts[sk] || 0) + 1;
      const gt = String(g.gameType || "");
      gameTypeCounts[gt] = (gameTypeCounts[gt] || 0) + 1;
    }
    sourceStatsAvailableCount += chunkStatsAvailable;
    chunkReports.push({ start_date: chunk.start, end_date: chunk.end, endpoint: schedule.endpoint, source_game_count: schedule.games.length, stats_available_game_count: chunkStatsAvailable, stage_rows_upserted: staged, observed_status_codes_sample: schedule.statusSamples.slice(0, 12), observed_game_types_sample: schedule.gameTypes });
  }

  const diff = await applyCalendarDifferential(env, batchId);
  const coverage = await rebuildCoverage(env, batchId, requestId, startDate, endDate);
  const totalStored = await first(env.TEAM_DB, `SELECT COUNT(*) AS rows, COUNT(DISTINCT game_pk) AS distinct_game_pks, MIN(official_date) AS first_official_date, MAX(official_date) AS last_official_date, SUM(is_available_for_stats) AS stats_available_games FROM mlb_game_calendar WHERE official_date BETWEEN ? AND ?`, startDate, endDate);
  const badIdentity = await first(env.TEAM_DB, `SELECT COUNT(*) AS bad_rows FROM mlb_game_calendar WHERE official_date BETWEEN ? AND ? AND (game_pk IS NULL OR home_team_id IS NULL OR away_team_id IS NULL OR home_team_id = away_team_id OR raw_json IS NULL OR raw_json='')`, startDate, endDate);
  const layerSummary = await all(env.TEAM_DB, `SELECT layer_key, coverage_status, coverage_grade, blocking_for_full_run, COUNT(*) AS rows FROM mlb_game_data_coverage WHERE official_date BETWEEN ? AND ? GROUP BY layer_key, coverage_status, coverage_grade, blocking_for_full_run ORDER BY layer_key, coverage_status`, startDate, endDate);
  const monthSummary = await all(env.TEAM_DB, `SELECT substr(official_date,1,7) AS month, game_type, COUNT(*) AS games, SUM(is_available_for_stats) AS stats_available_games FROM mlb_game_calendar WHERE official_date BETWEEN ? AND ? GROUP BY substr(official_date,1,7), game_type ORDER BY month, game_type`, startDate, endDate);

  const ownershipFailed = coverage.coverage_ownership_clean !== true;
  const status = ownershipFailed ? "GAME_CALENDAR_DIFFERENTIAL_CHECK_FAILED_COVERAGE_OWNERSHIP" : (coverage.blockingGaps > 0 ? "GAME_CALENDAR_DIFFERENTIAL_CHECK_COMPLETED_WITH_DATA_GAPS" : "GAME_CALENDAR_DIFFERENTIAL_CHECK_COMPLETED_CLEAN");
  const certification = ownershipFailed ? "GAME_CALENDAR_DIFFERENTIAL_CHECK_COVERAGE_OWNERSHIP_FAILED" : (coverage.blockingGaps > 0 ? "GAME_CALENDAR_DIFFERENTIAL_CHECK_UPDATED_WITH_BLOCKERS" : "GAME_CALENDAR_DIFFERENTIAL_CHECK_UPDATED_NO_BLOCKERS");
  const grade = ownershipFailed ? "DIFF_FAIL_COVERAGE_OWNERSHIP" : (coverage.blockingGaps > 0 ? "DIFF_PASS_WITH_DATA_BLOCKERS" : "DIFF_PASS_CLEAN");

  const output = {
    ok: !ownershipFailed,
    data_ok: !ownershipFailed,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    request_id: requestId,
    chain_id: input.chain_id || null,
    batch_id: batchId,
    mode: "game_calendar_differential_check_update",
    optimized_fast_finalize_v0_1_6: true,
    coverage_ownership_fix_v0_1_6: true,
    status,
    certification,
    certification_grade: grade,
    season,
    season_start_date: startDate,
    season_end_date: endDate,
    game_types: gameTypes,
    full_calendar_check_every_run: true,
    no_rolling_window: true,
    full_calendar_template_stage_table: "mlb_game_calendar_stage",
    calendar_diff_change_table: "mlb_game_calendar_diff_changes",
    source_game_count: sourceGameCount,
    source_stats_available_game_count: sourceStatsAvailableCount,
    stage_rows_upserted: stageRowsUpserted,
    calendar_differential: diff,
    stored_calendar_rows_in_range: Number(totalStored?.rows || 0),
    stored_distinct_game_pks_in_range: Number(totalStored?.distinct_game_pks || 0),
    first_official_date: totalStored?.first_official_date || null,
    last_official_date: totalStored?.last_official_date || null,
    stored_stats_available_games_in_range: Number(totalStored?.stats_available_games || 0),
    bad_identity_rows_in_range: Number(badIdentity?.bad_rows || 0),
    observed_status_counts: statusCounts,
    observed_game_type_counts: gameTypeCounts,
    month_summary: monthSummary,
    chunk_reports: chunkReports,
    coverage_checked: true,
    coverage_rows_written: coverage.coverageRows,
    active_layer_count: coverage.active_layer_count,
    expected_coverage_rows: coverage.expected_coverage_rows,
    actual_coverage_rows: coverage.actual_coverage_rows,
    latest_batch_coverage_rows: coverage.latest_batch_coverage_rows,
    stale_coverage_owner_rows: coverage.stale_coverage_owner_rows,
    coverage_rows_with_null_batch: coverage.coverage_rows_with_null_batch,
    coverage_rows_with_null_checked_at: coverage.coverage_rows_with_null_checked_at,
    coverage_rows_with_null_status_grade: coverage.coverage_rows_with_null_status_grade,
    coverage_ownership_clean: coverage.coverage_ownership_clean,
    scoped_delete_then_rebuild_current_window_v0_1_6: coverage.scoped_delete_then_rebuild_current_window_v0_1_6,
    layer_keys_checked: activeCoverageLayerKeys(),
    layer_coverage_summary: layerSummary,
    missing_game_layer_count: coverage.blockingGaps,
    blocking_gap_count: coverage.blockingGaps,
    gaps_sample: coverage.gapsSample,
    calendar_anchor_policy: {
      official_date_is_canonical_anchor: true,
      game_level_anchor_for_logs_team_starter_bullpen: true,
      game_date_snapshot_anchor_for_splits: true,
      game_date_metric_input_anchor_for_metrics: true,
      game_pk_columns_are_not_faked_for_snapshot_tables: true
    },
    upsert_by_game_pk_only: true,
    no_unscoped_hard_delete: true,
    scoped_coverage_matrix_delete_only: true,
    no_source_history_mutation: true,
    no_repair_jobs_created: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_board_mutation: true,
    no_daily_context_mutation: true,
    rows_read: sourceGameCount,
    rows_written: stageRowsUpserted + diff.applied + coverage.coverageRows,
    external_calls_performed: externalCalls,
    finished_at: nowUtc()
  };

  await run(env.TEAM_DB, `INSERT INTO mlb_game_coverage_batches (batch_id, run_id, request_id, worker_name, worker_version, mode, status, coverage_window_start, coverage_window_end, source_game_count, source_final_game_pk_count, coverage_rows_written, missing_game_layer_count, blocking_gap_count, certification_status, certification_grade, started_at, finished_at, output_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    batchId, input.run_id || null, requestId, WORKER_NAME, VERSION, "game_calendar_differential_check_update", status, startDate, endDate, sourceGameCount, sourceStatsAvailableCount, coverage.coverageRows, coverage.blockingGaps, coverage.blockingGaps, certification, grade, startedAt, JSON.stringify(output));

  return output;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "GET" && (path === "/" || path === "/health")) return jsonResponse(baseIdentity(env));

    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      return jsonResponse({ ...baseIdentity(env), route: "/diagnostic", input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, job_key: input.job_key || null, mode: input.mode || null }, writes_performed: 0, external_calls_performed: 0 });
    }

    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const mode = String(input.mode || input?.input_json?.mode || url.searchParams.get("mode") || "");
      if (mode === "game_calendar_full_seed") {
        try { return jsonResponse(await handleFullCalendarSeed(input, env)); }
        catch (err) {
          return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, mode, status: "GAME_CALENDAR_FULL_SEED_FAILED", certification: "GAME_CALENDAR_FULL_SEED_FAILED", certification_grade: "CALENDAR_SEED_FAIL", error: String(err && err.message ? err.message : err), no_source_history_mutation: true, no_repair_jobs_created: true, no_scoring: true, no_board_mutation: true, rows_read: 0, rows_written: 0, external_calls_performed: 0 }, 200);
        }
      }
      if (mode === "game_calendar_differential_check_update") {
        try { return jsonResponse(await handleCalendarDifferentialCheck(input, env)); }
        catch (err) {
          return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, mode, status: "GAME_CALENDAR_DIFFERENTIAL_CHECK_FAILED_FAST_FINALIZE", certification: "GAME_CALENDAR_DIFFERENTIAL_CHECK_FAILED_FAST_FINALIZE", certification_grade: "DIFF_FAIL", error: String(err && err.message ? err.message : err), fast_finalize_guard_v0_1_6: true, no_source_history_mutation: true, no_repair_jobs_created: true, no_scoring: true, no_board_mutation: true, rows_read: 0, rows_written: 0, external_calls_performed: 0 }, 200);
        }
      }
      if (mode === "game_calendar_coverage_audit") {
        try { return jsonResponse(await handleCoverageAudit(input, env)); }
        catch (err) {
          return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, mode, status: "GAME_CALENDAR_COVERAGE_AUDIT_FAILED", certification: "GAME_CALENDAR_COVERAGE_AUDIT_FAILED", certification_grade: "AUDIT_FAIL", error: String(err && err.message ? err.message : err), no_source_history_mutation: true, no_repair_jobs_created: true, no_scoring: true, no_board_mutation: true, rows_read: 0, rows_written: 0, external_calls_performed: 0 }, 200);
        }
      }
      return jsonResponse({ ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: input.job_key || JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: "DUMMY_READY", certification: "DUMMY_ONLY_NOT_REAL_DATA", rows_read: 0, rows_written: 0, output_json: { dummy: true, mode }, timestamp_utc: nowUtc(), writes_performed: 0, external_calls_performed: 0 });
    }

    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
