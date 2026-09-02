import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-nba-weekly-differential";
const VERSION = "alphadog-v2-nba-weekly-differential-v0.1.0";
const JOB_KEY = "nba-weekly-differential";
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "WORKER_SAFE_MODE", "DEBUG_MODE"];

// This worker owns a dedicated set of "snapshot" tables (nba_stats.player_roster_snapshot,
// nba_ref.team_roster_snapshot, nba_ref.official_roster_snapshot) that ONLY it reads and writes.
// This is deliberate, not incidental: the regular static workers (alphadog-v2-nba-static-players
// etc.) upsert nba_ref.players/teams/officials on every run, which would destroy any "before"
// state if this worker tried to diff against those tables directly - by the time this worker ran,
// the "before" would already be overwritten with "after". Keeping an independent snapshot means
// this worker's diff is always against the state as of ITS OWN last run, regardless of how many
// times the regular upsert workers have run in between.

function nowUtc() { return new Date().toISOString(); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }
function pg(env) { return postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false }); }

async function fetchFromGithub(env, path, metaPath) {
  const owner = env.GITHUB_OWNER || "Rodantmat";
  const repo = env.GITHUB_REPO || "Alphadog";
  const branch = env.GITHUB_BRANCH || "main";
  const headers = { "Accept": "application/vnd.github+json", "User-Agent": "Alphadog-NBA-WeeklyDifferential" };
  if (env.GITHUB_TOKEN) headers["Authorization"] = `Bearer ${env.GITHUB_TOKEN}`;
  const apiUrl = (p) => `https://api.github.com/repos/${owner}/${repo}/contents/${p}?ref=${encodeURIComponent(branch)}`;
  const [dataResp, metaResp] = await Promise.all([fetch(apiUrl(path), { headers }), fetch(apiUrl(metaPath), { headers })]);
  if (!dataResp.ok) throw new Error(`github_read_failed_http_${dataResp.status}:${(await dataResp.text()).slice(0, 200)}`);
  const dataJson = await dataResp.json();
  const file = JSON.parse(atob(String(dataJson.content || "").replace(/\n/g, "")));
  let meta = null;
  if (metaResp.ok) {
    try { const metaJson = await metaResp.json(); meta = JSON.parse(atob(String(metaJson.content || "").replace(/\n/g, ""))); } catch (_) {}
  }
  if (meta && meta.error) throw new Error(`last_committed_scrape_failed_for_${path}: ${meta.error}`);
  return { file, meta };
}

function normalizeOfficialId(name) {
  return `nba_official_${String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;
}

async function diffPlayers(sql, newPlayers) {
  const oldSnapshot = await sql`SELECT player_id, nba_player_id, full_name, team_id, active FROM nba_stats.player_roster_snapshot`;
  const oldByPlayer = new Map(oldSnapshot.map(r => [String(r.player_id), r]));
  const isFirstRun = oldSnapshot.length === 0;

  const newActiveIds = new Set();
  const events = [];

  for (const p of newPlayers) {
    if (!p.id) continue;
    const playerId = `nba_${p.id}`;
    const teamId = p.team_id ? `nba_${p.team_id}` : null;
    const isActive = p.roster_status === 1;
    if (isActive) newActiveIds.add(playerId);

    const old = oldByPlayer.get(playerId);
    if (!old) {
      if (!isFirstRun) {
        events.push({ event_type: "new_player", player_id: playerId, nba_player_id: p.id, full_name: p.full_name, old_team_id: null, new_team_id: teamId });
      }
    } else if (isActive && old.team_id && teamId && old.team_id !== teamId) {
      events.push({ event_type: "team_change", player_id: playerId, nba_player_id: p.id, full_name: p.full_name, old_team_id: old.team_id, new_team_id: teamId });
    } else if (isActive && Number(old.active) === 0) {
      events.push({ event_type: "reactivated", player_id: playerId, nba_player_id: p.id, full_name: p.full_name, old_team_id: old.team_id, new_team_id: teamId });
    }
  }

  // Departed: were active in the last snapshot, no longer active (or missing) in the new data.
  if (!isFirstRun) {
    for (const old of oldSnapshot) {
      if (Number(old.active) === 1 && !newActiveIds.has(String(old.player_id))) {
        events.push({ event_type: "departed", player_id: old.player_id, nba_player_id: old.nba_player_id, full_name: old.full_name, old_team_id: old.team_id, new_team_id: null });
      }
    }
  }

  for (const e of events) {
    await sql`
      INSERT INTO nba_stats.player_differential_log (event_type, player_id, nba_player_id, full_name, old_team_id, new_team_id, details)
      VALUES (${e.event_type}, ${e.player_id}, ${e.nba_player_id}, ${e.full_name}, ${e.old_team_id}, ${e.new_team_id}, ${JSON.stringify(e)})
    `;
  }

  // Apply the real, missing consequence the regular upsert worker never does: mark departed
  // players inactive in the live table. The regular worker only ever upserts players present in
  // its scrape - it never flips a player off when they disappear from the active list.
  for (const e of events.filter(e => e.event_type === "departed")) {
    await sql`UPDATE nba_ref.players SET active = 0, updated_at = now() WHERE player_id = ${e.player_id}`;
  }

  // Refresh the snapshot to the new state for next week's diff.
  await sql`DELETE FROM nba_stats.player_roster_snapshot`;
  for (const p of newPlayers) {
    if (!p.id) continue;
    await sql`
      INSERT INTO nba_stats.player_roster_snapshot (player_id, nba_player_id, full_name, team_id, active, snapshot_taken_at)
      VALUES (${`nba_${p.id}`}, ${p.id}, ${p.full_name}, ${p.team_id ? `nba_${p.team_id}` : null}, ${p.roster_status === 1 ? 1 : 0}, now())
    `;
  }

  return { events, is_first_run: isFirstRun };
}

async function diffTeams(sql, newTeams) {
  const oldSnapshot = await sql`SELECT team_id, nba_team_id, abbreviation, full_name, conference, division FROM nba_ref.team_roster_snapshot`;
  const oldByTeam = new Map(oldSnapshot.map(r => [String(r.team_id), r]));
  const isFirstRun = oldSnapshot.length === 0;
  const events = [];
  const newIds = new Set();

  for (const t of newTeams) {
    if (!t.id) continue;
    const teamId = `nba_${t.id}`;
    newIds.add(teamId);
    const old = oldByTeam.get(teamId);
    if (!old) {
      if (!isFirstRun) events.push({ event_type: "new_team", team_id: teamId, field_name: null, old_value: null, new_value: t.abbreviation });
      continue;
    }
    for (const [field, newVal, oldVal] of [
      ["abbreviation", t.abbreviation, old.abbreviation],
      ["full_name", `${t.city || ""} ${t.nickname || ""}`.trim(), old.full_name],
      ["conference", t.conference, old.conference],
      ["division", t.division, old.division],
    ]) {
      if (String(newVal || "") !== String(oldVal || "")) {
        events.push({ event_type: "field_change", team_id: teamId, field_name: field, old_value: oldVal, new_value: newVal });
      }
    }
  }
  if (!isFirstRun) {
    for (const old of oldSnapshot) {
      if (!newIds.has(String(old.team_id))) {
        events.push({ event_type: "team_removed", team_id: old.team_id, field_name: null, old_value: old.abbreviation, new_value: null });
      }
    }
  }

  for (const e of events) {
    await sql`
      INSERT INTO nba_ref.team_differential_log (event_type, team_id, field_name, old_value, new_value)
      VALUES (${e.event_type}, ${e.team_id}, ${e.field_name}, ${e.old_value}, ${e.new_value})
    `;
  }

  await sql`DELETE FROM nba_ref.team_roster_snapshot`;
  for (const t of newTeams) {
    if (!t.id) continue;
    await sql`
      INSERT INTO nba_ref.team_roster_snapshot (team_id, nba_team_id, abbreviation, full_name, conference, division, snapshot_taken_at)
      VALUES (${`nba_${t.id}`}, ${t.id}, ${t.abbreviation}, ${`${t.city || ""} ${t.nickname || ""}`.trim()}, ${t.conference}, ${t.division}, now())
    `;
  }

  return { events, is_first_run: isFirstRun };
}

async function diffOfficials(sql, newOfficials) {
  const oldSnapshot = await sql`SELECT official_id, full_name FROM nba_ref.official_roster_snapshot`;
  const oldIds = new Set(oldSnapshot.map(r => String(r.official_id)));
  const isFirstRun = oldSnapshot.length === 0;
  const events = [];
  const newIds = new Set();

  for (const o of newOfficials) {
    if (!o.full_name) continue;
    const officialId = normalizeOfficialId(o.full_name);
    newIds.add(officialId);
    if (!oldIds.has(officialId) && !isFirstRun) {
      events.push({ event_type: "new_official", official_id: officialId, full_name: o.full_name });
    }
  }
  if (!isFirstRun) {
    for (const old of oldSnapshot) {
      if (!newIds.has(String(old.official_id))) {
        events.push({ event_type: "departed_official", official_id: old.official_id, full_name: old.full_name });
      }
    }
  }

  for (const e of events) {
    await sql`
      INSERT INTO nba_ref.official_differential_log (event_type, official_id, full_name)
      VALUES (${e.event_type}, ${e.official_id}, ${e.full_name})
    `;
  }

  await sql`DELETE FROM nba_ref.official_roster_snapshot`;
  for (const o of newOfficials) {
    if (!o.full_name) continue;
    await sql`INSERT INTO nba_ref.official_roster_snapshot (official_id, full_name, snapshot_taken_at) VALUES (${normalizeOfficialId(o.full_name)}, ${o.full_name}, now())`;
  }

  return { events, is_first_run: isFirstRun };
}

async function runDifferential(input, env) {
  const started = Date.now();
  const sql = pg(env);
  const errors = [];
  let playersResult = { events: [], is_first_run: null };
  let teamsResult = { events: [], is_first_run: null };
  let officialsResult = { events: [], is_first_run: null };

  try {
    const r = await fetchFromGithub(env, "nba/data/nba_players_current.json", "nba/data/nba_players_current_meta.json");
    playersResult = await diffPlayers(sql, r.file.players || []);
  } catch (err) { errors.push(`players_diff_failed: ${String(err && err.message ? err.message : err)}`); }

  try {
    const r = await fetchFromGithub(env, "nba/data/nba_teams_current.json", "nba/data/nba_teams_current_meta.json");
    teamsResult = await diffTeams(sql, r.file.teams || []);
  } catch (err) { errors.push(`teams_diff_failed: ${String(err && err.message ? err.message : err)}`); }

  try {
    const r = await fetchFromGithub(env, "nba/data/nba_officials_current.json", "nba/data/nba_officials_current_meta.json");
    officialsResult = await diffOfficials(sql, r.file.officials || []);
  } catch (err) { errors.push(`officials_diff_failed: ${String(err && err.message ? err.message : err)}`); }

  await sql.end();

  return {
    ok: errors.length === 0,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: input.job_key || JOB_KEY,
    status: errors.length === 0 ? "completed" : "completed_with_errors",
    errors: errors.length ? errors : null,
    players: {
      is_first_run: playersResult.is_first_run,
      event_counts: countByType(playersResult.events),
      events: playersResult.events,
    },
    teams: {
      is_first_run: teamsResult.is_first_run,
      event_counts: countByType(teamsResult.events),
      events: teamsResult.events,
    },
    officials: {
      is_first_run: officialsResult.is_first_run,
      event_counts: countByType(officialsResult.events),
      events: officialsResult.events,
    },
    note: "is_first_run=true means the snapshot table was empty (first-ever run) - everything reports as a baseline, not a real change. Real differential detection starts from the SECOND run of this worker onward.",
    elapsed_ms: Date.now() - started,
    timestamp_utc: nowUtc()
  };
}

function countByType(events) {
  const counts = {};
  for (const e of events) counts[e.event_type] = (counts[e.event_type] || 0) + 1;
  return counts;
}

function baseIdentity(env) {
  return {
    ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY,
    status: "NBA_WEEKLY_DIFFERENTIAL_READY", timestamp_utc: nowUtc(),
    scope_lock: {
      writes_only: ["POSTGRES.nba_stats.player_roster_snapshot", "POSTGRES.nba_stats.player_differential_log", "POSTGRES.nba_ref.team_roster_snapshot", "POSTGRES.nba_ref.team_differential_log", "POSTGRES.nba_ref.official_roster_snapshot", "POSTGRES.nba_ref.official_differential_log", "POSTGRES.nba_ref.players (active flag only, for departed players)"],
      no_mlb_table_access: true, no_scoring: true, no_board_mutation: true
    },
    hyperdrive_bound: !!(env && env.HYPERDRIVE)
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (request.method === "GET" && path === "/") return jsonResponse(baseIdentity(env));
    if (request.method === "GET" && path === "/health") {
      return jsonResponse({ ...baseIdentity(env), vars_present: Object.fromEntries(EXPECTED_VARS.map(v => [v, Boolean(env[v])])) });
    }
    if (request.method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try { return jsonResponse(await runDifferential(input, env)); }
      catch (err) { return jsonResponse({ ok: false, error: String(err && err.message ? err.message : err), timestamp_utc: nowUtc() }, 500); }
    }
    return jsonResponse({ ok: false, status: "NOT_FOUND" }, 404);
  }
};
