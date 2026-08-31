import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-nba-static-players";
const VERSION = "alphadog-v2-nba-static-players-v0.1.0";
const JOB_KEY = "nba-static-players";

const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "WORKER_SAFE_MODE", "DEBUG_MODE"];

function nowUtc() { return new Date().toISOString(); }

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function normalizeAlias(value) {
  return String(value || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function aliasKey(playerId, aliasType, aliasValue) {
  return `${playerId}|${aliasType}|${normalizeAlias(aliasValue)}`.slice(0, 240);
}

async function readJsonSafe(request) {
  try { return await request.json(); } catch { return {}; }
}

function pg(env) {
  return postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false });
}

async function fetchNbaPlayersFromGithub(env) {
  // Same proven pattern as alphadog-v2-nba-static-teams.js's fetchNbaTeamsFromGithub - see that
  // worker's comments for the full history of why this reads a GitHub-committed file instead of
  // calling stats.nba.com directly (confirmed edge-blocked from Cloudflare Workers, 2026-08-31).
  const owner = env.GITHUB_OWNER || "Rodantmat";
  const repo = env.GITHUB_REPO || "Alphadog";
  const branch = env.GITHUB_BRANCH || "main";
  const path = "nba/data/nba_players_current.json";
  const metaPath = "nba/data/nba_players_current_meta.json";

  const headers = { "Accept": "application/vnd.github+json", "User-Agent": "Alphadog-NBA-StaticPlayers" };
  if (env.GITHUB_TOKEN) headers["Authorization"] = `Bearer ${env.GITHUB_TOKEN}`;

  const apiUrl = (p) => `https://api.github.com/repos/${owner}/${repo}/contents/${p}?ref=${encodeURIComponent(branch)}`;

  const [dataResp, metaResp] = await Promise.all([
    fetch(apiUrl(path), { headers }),
    fetch(apiUrl(metaPath), { headers })
  ]);
  if (!dataResp.ok) throw new Error(`github_read_failed_http_${dataResp.status}:${(await dataResp.text()).slice(0, 200)}`);

  const dataJson = await dataResp.json();
  const playersFile = JSON.parse(atob(String(dataJson.content || "").replace(/\n/g, "")));
  let meta = null;
  if (metaResp.ok) {
    try {
      const metaJson = await metaResp.json();
      meta = JSON.parse(atob(String(metaJson.content || "").replace(/\n/g, "")));
    } catch (_) { /* meta is informational only */ }
  }
  if (meta && meta.error) throw new Error(`last_committed_scrape_failed: ${meta.error}`);

  const players = (playersFile.players || []).filter(p => p && p.id).map(p => ({
    id: Number(p.id),
    full_name: String(p.full_name || ""),
    last_comma_first: String(p.last_comma_first || ""),
    roster_status: p.roster_status,
    from_year: p.from_year,
    to_year: p.to_year,
    player_code: String(p.player_code || ""),
    team_id: p.team_id ? Number(p.team_id) : null,
    team_abbreviation: String(p.team_abbreviation || "")
  }));

  return { source_path: path, fetched_at_by_scraper: meta ? meta.fetched_at : null, players, raw_count: (playersFile.players || []).length };
}

function splitName(fullName, lastCommaFirst) {
  if (lastCommaFirst && lastCommaFirst.includes(",")) {
    const [last, first] = lastCommaFirst.split(",").map(s => s.trim());
    return { first_name: first || "", last_name: last || "" };
  }
  const parts = String(fullName || "").trim().split(/\s+/);
  if (parts.length < 2) return { first_name: fullName || "", last_name: "" };
  return { first_name: parts.slice(0, -1).join(" "), last_name: parts[parts.length - 1] };
}

function buildAliases(player, sourceKey) {
  const playerId = `nba_${player.id}`;
  const { first_name, last_name } = splitName(player.full_name, player.last_comma_first);
  const values = [
    ["full_name", player.full_name],
    ["last_comma_first", player.last_comma_first],
    ["player_code", player.player_code],
    ["nba_player_id", String(player.id)]
  ];
  const seen = new Set();
  const aliases = [];
  for (const [type, value] of values) {
    const cleaned = String(value || "").trim();
    const normalized = normalizeAlias(cleaned);
    if (!cleaned || !normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    aliases.push({
      alias_key: aliasKey(playerId, type, cleaned),
      player_id: playerId,
      nba_player_id: player.id,
      alias_value: cleaned,
      alias_normalized: normalized,
      alias_type: type,
      source_key: sourceKey,
      confidence: "CANONICAL"
    });
  }
  return { aliases, first_name, last_name };
}

async function loadCurrentPlayersSnapshot(sql) {
  const rows = await sql`SELECT player_id, nba_player_id, full_name, team_id, active FROM nba_ref.players`;
  const map = new Map();
  for (const r of rows) map.set(String(r.player_id), r);
  return map;
}

function playerHasRealChange(current, player, teamId) {
  if (!current) return true;
  return String(current.nba_player_id || "") !== String(player.id || "")
    || String(current.full_name || "") !== String(player.full_name || "")
    || String(current.team_id || "") !== String(teamId || "")
    || Number(current.active || 0) !== (player.roster_status === 1 ? 1 : 0);
}

async function upsertPlayers(sql, players, sourceKey) {
  let playersWritten = 0;
  let aliasesWritten = 0;
  let playersUnchanged = 0;
  const currentSnapshot = await loadCurrentPlayersSnapshot(sql);

  for (const player of players) {
    const playerId = `nba_${player.id}`;
    const teamId = player.team_id ? `nba_${player.team_id}` : null;
    const current = currentSnapshot.get(playerId);
    const { aliases, first_name, last_name } = buildAliases(player, sourceKey);
    const active = player.roster_status === 1 ? 1 : 0;

    const writeAliases = async () => {
      for (const alias of aliases) {
        await sql`
          INSERT INTO nba_ref.player_aliases (alias_key, player_id, nba_player_id, alias_value, alias_normalized, alias_type, source_key, confidence, active, updated_at)
          VALUES (${alias.alias_key}, ${alias.player_id}, ${alias.nba_player_id}, ${alias.alias_value}, ${alias.alias_normalized}, ${alias.alias_type}, ${alias.source_key}, ${alias.confidence}, 1, now())
          ON CONFLICT (alias_key) DO UPDATE SET
            player_id=excluded.player_id, nba_player_id=excluded.nba_player_id, alias_value=excluded.alias_value,
            alias_normalized=excluded.alias_normalized, alias_type=excluded.alias_type, source_key=excluded.source_key,
            confidence=excluded.confidence, active=1, updated_at=now()
        `;
        aliasesWritten += 1;
      }
    };

    if (!playerHasRealChange(current, player, teamId)) {
      playersUnchanged += 1;
      await writeAliases();
      continue;
    }

    await sql`
      INSERT INTO nba_ref.players (player_id, nba_player_id, full_name, first_name, last_name, team_id, years_pro, active, source_key, raw_json, updated_at)
      VALUES (${playerId}, ${player.id}, ${player.full_name}, ${first_name}, ${last_name}, ${teamId}, ${player.from_year && player.to_year ? Number(player.to_year) - Number(player.from_year) : null}, ${active}, ${sourceKey}, ${JSON.stringify(player).slice(0, 5000)}, now())
      ON CONFLICT (player_id) DO UPDATE SET
        nba_player_id=excluded.nba_player_id, full_name=excluded.full_name, first_name=excluded.first_name,
        last_name=excluded.last_name, team_id=excluded.team_id, years_pro=excluded.years_pro, active=excluded.active,
        source_key=excluded.source_key, raw_json=excluded.raw_json, updated_at=now()
    `;
    playersWritten += 1;
    await writeAliases();
  }

  return { players_written: playersWritten, alias_rows_written: aliasesWritten, players_unchanged_skipped: playersUnchanged };
}

async function counts(sql) {
  const active = await sql`SELECT COUNT(*)::int AS c FROM nba_ref.players WHERE active=1`;
  const total = await sql`SELECT COUNT(*)::int AS c FROM nba_ref.players`;
  const aliases = await sql`SELECT COUNT(*)::int AS c FROM nba_ref.player_aliases WHERE active=1`;
  const teamsMissing = await sql`SELECT COUNT(*)::int AS c FROM nba_ref.players WHERE active=1 AND team_id IS NULL`;
  const sample = await sql`SELECT full_name, team_id, active FROM nba_ref.players WHERE active=1 ORDER BY full_name LIMIT 8`;
  return {
    nba_ref_players_rows: Number(total[0] && total[0].c ? total[0].c : 0),
    active_nba_players: Number(active[0] && active[0].c ? active[0].c : 0),
    active_players_missing_team_id: Number(teamsMissing[0] && teamsMissing[0].c ? teamsMissing[0].c : 0),
    nba_ref_player_aliases_active_rows: Number(aliases[0] && aliases[0].c ? aliases[0].c : 0),
    sample_rows: sample
  };
}

function baseIdentity(env) {
  return {
    ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "NBA_STATIC_PLAYER_DICTIONARY_READY",
    timestamp_utc: nowUtc(),
    scope_lock: {
      writes_only: ["POSTGRES.nba_ref.players", "POSTGRES.nba_ref.player_aliases"],
      no_mlb_table_access: true,
      no_scoring: true,
      no_board_mutation: true
    },
    hyperdrive_bound: !!(env && env.HYPERDRIVE)
  };
}

async function runStaticPlayers(input, env) {
  const started = Date.now();
  const sql = pg(env);
  let sourceKey = "NBA_GITHUB_COMMITTED_STATS_NBA_SCRAPE";
  let fetchInfo = null;
  let players = [];
  let fetchError = null;

  try {
    fetchInfo = await fetchNbaPlayersFromGithub(env);
    players = fetchInfo.players;
  } catch (err) {
    fetchError = String(err && err.message ? err.message : err);
  }

  // No hardcoded fallback for players (unlike the 30-team list) - a 450+ player roster changes
  // too often and is too large to safely hand-maintain as a certified fallback. If the real
  // source fails, this worker fails honestly rather than silently writing stale/wrong data.
  const sourceOk = players.length > 0 && !fetchError;
  if (!sourceOk) {
    await sql.end();
    return {
      ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: input.job_key || JOB_KEY,
      status: "failed_nba_static_player_dictionary_no_fallback_available",
      error: fetchError || "zero_players_returned",
      elapsed_ms: Date.now() - started,
      timestamp_utc: nowUtc()
    };
  }

  const writes = await upsertPlayers(sql, players, sourceKey);
  const finalCounts = await counts(sql);
  await sql.end();
  const certified = finalCounts.active_nba_players >= 400 && finalCounts.active_players_missing_team_id < finalCounts.active_nba_players * 0.05;

  return {
    ok: certified,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: input.job_key || JOB_KEY,
    request_id: input.request_id || null,
    status: certified ? "completed_nba_static_player_dictionary_seed" : "completed_with_certification_warning",
    rows_read: players.length,
    players_written: writes.players_written,
    players_unchanged_skipped: writes.players_unchanged_skipped,
    aliases_written: writes.alias_rows_written,
    elapsed_ms: Date.now() - started,
    source_key: sourceKey,
    source_fetch: fetchInfo ? { path: fetchInfo.source_path, raw_count: fetchInfo.raw_count, parsed_count: fetchInfo.players.length, scraper_fetched_at: fetchInfo.fetched_at_by_scraper } : null,
    final_counts: finalCounts,
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
      return jsonResponse({
        ...baseIdentity(env),
        route: "/health",
        vars_present: Object.fromEntries(EXPECTED_VARS.map(v => [v, Boolean(env && env[v])]))
      });
    }

    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        return jsonResponse(await runStaticPlayers(input, env));
      } catch (err) {
        return jsonResponse({
          ok: false,
          version: VERSION,
          worker_name: WORKER_NAME,
          job_key: input.job_key || JOB_KEY,
          status: "nba_static_player_dictionary_exception",
          error: String(err && err.message ? err.message : err),
          timestamp_utc: nowUtc()
        }, 500);
      }
    }

    return jsonResponse({
      ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      status: "NOT_FOUND",
      allowed_routes: ["GET /", "GET /health", "POST /run"],
      timestamp_utc: nowUtc()
    }, 404);
  }
};
