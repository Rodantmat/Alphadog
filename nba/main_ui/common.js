// NBA MAIN UI - shared server helpers (Postgres client, JSON responses, config, labels).
// Part of the NBA copy of the MLB main interface (owner request 2026-10-14): same screens, same client, NBA data.
// Every tunable comes from nba_config.classification_config['nba_main_ui'] (never hardcoded here).
import postgres from "postgres";

export const WORKER_NAME = "alphadog-v2-nba-main-ui";
export const LOGICAL_APP = "alphadog-v2-nba-main-ui";

export function nowUtc() { return new Date().toISOString(); }

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, (k, v) => (typeof v === "bigint" ? Number(v) : v)), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" }
  });
}

export async function readJsonSafe(request) {
  try { return await request.json(); } catch { return {}; }
}

export function pgClient(env) {
  if (!env.HYPERDRIVE) throw new Error("HYPERDRIVE binding missing");
  return postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false, prepare: false, connect_timeout: 8 });
}

// postgres.js under Workers/Hyperdrive can hang without rejecting (documented in the MLB worker) - every query is raced
// against a hard timeout so a request always answers.
export async function q(sql, text, params = [], ms = 12000) {
  let timer;
  const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`HARD_QUERY_TIMEOUT_${ms}MS`)), ms); });
  try {
    return await Promise.race([sql.unsafe(text, params, { prepare: false }), timeout]);
  } catch (err) {
    throw new Error(`query failed: ${err && err.message ? err.message : err} || SQL: ${String(text).replace(/\s+/g, " ").trim().slice(0, 400)}`);
  } finally { clearTimeout(timer); }
}

export async function withPg(env, fn) {
  const sql = pgClient(env);
  try { return await fn(sql); } finally { await sql.end({ timeout: 1 }).catch(() => {}); }
}

// Postgres array literal for a $n::text[] / $n::bigint[] parameter (postgres.js unsafe() with fetch_types off does not
// serialize JS arrays reliably - bind the literal text instead)
export function pgArr(arr) {
  return "{" + (arr || []).map(v => '"' + String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"').join(",") + "}";
}

export function num(v, d = null) { const n = Number(v); return Number.isFinite(n) ? n : d; }
export function r1(v) { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 10) / 10 : null; }
export function r3(v) { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null; }
export function isoDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
export function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) ? String(s) : null; }

// ---------------------------------------------------------------- config
export async function loadConfig(sql) {
  const rows = await q(sql, "SELECT config_key, config_json FROM nba_config.classification_config WHERE config_key = ANY($1::text[])",
    [pgArr(["nba_main_ui", "prop_reliability_audit_latest", "sleeper_payout"])]);
  const by = {};
  for (const r of rows) by[r.config_key] = typeof r.config_json === "string" ? JSON.parse(r.config_json) : r.config_json;
  if (!by.nba_main_ui) throw new Error("REFUSED: nba_config.classification_config['nba_main_ui'] missing - the UI reads every tunable from it");
  const pp = await q(sql, "SELECT rule_key, rule_json FROM nba_config.pp_slip_rules WHERE rule_key = ANY($1::text[])",
    [pgArr(["base_power", "flex_all_standard", "flex_2pick_base", "compression", "flex_alt_tiers"])]);
  const ppRules = {};
  for (const r of pp) ppRules[r.rule_key] = typeof r.rule_json === "string" ? JSON.parse(r.rule_json) : r.rule_json;
  return { ui: by.nba_main_ui, reliability: by.prop_reliability_audit_latest || null, sleeper: by.sleeper_payout || null, pp: ppRules };
}

// ---------------------------------------------------------------- labels
const PROP_LABELS = {
  points: "Points", rebounds: "Rebounds", assists: "Assists", threes_made: "3-PT Made", blocks: "Blocks", steals: "Steals",
  turnovers: "Turnovers", pts_reb: "Pts+Rebs", pts_ast: "Pts+Asts", reb_ast: "Rebs+Asts", pra: "Pts+Rebs+Asts", stocks: "Blks+Stls",
  fantasy_score: "Fantasy Score", double_double: "Double-Double", triple_double: "Triple-Double", ftm: "Free Throws Made",
  fga: "FG Attempts", fgm: "FG Made", fta: "FT Attempts", fg3a: "3-PT Attempted", oreb: "Offensive Rebounds", dreb: "Defensive Rebounds",
  personal_fouls: "Personal Fouls"
};
export function propLabel(k) {
  const key = String(k || "").toLowerCase();
  if (PROP_LABELS[key]) return PROP_LABELS[key];
  const m = key.match(/^(.*)_(q1|q4|h1|h2|1q|4q|1h|2h)$/);
  if (m) { const p = { q1: "1Q", "1q": "1Q", q4: "4Q", "4q": "4Q", h1: "1H", "1h": "1H", h2: "2H", "2h": "2H" }[m[2]]; return (PROP_LABELS[m[1]] || cap(m[1])) + " " + p; }
  return cap(key);
}
export function cap(s) { return String(s || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
export function propFamily(k) { return /^(points|rebounds|assists|threes_made|blocks|steals|turnovers|ftm|fga|fgm|fta|fg3a|oreb|dreb|personal_fouls)(_(q1|q4|h1|h2))?$/.test(String(k || "")) ? "single" : "combo"; }
export function appLabel(s) { s = String(s || "").toLowerCase(); return s === "prizepicks" ? "PrizePicks" : s === "sleeper" ? "Sleeper" : s === "underdog" ? "Underdog" : cap(s); }
export function lineTypeLabel(t) { return cap(t || "regular"); }
export function sideOut(side) { const s = String(side || "").toLowerCase(); return s === "over" || s === "more" || s === "higher" ? "more" : "less"; }
export function sideIn(side) { const s = String(side || "").toLowerCase(); return s === "more" || s === "over" || s === "higher" ? "Over" : "Under"; }

// leg id: date|app|player_id|prop|line|side - every board leg is unique on it (board_scored_uidx)
export function legId(date, app, pid, prop, line, side) {
  return [isoDate(date), app, pid, prop, String(Number(line)), sideIn(side)].join("~");
}
export function parseLegId(id) {
  const p = String(id || "").split("~");
  if (p.length !== 6 || !validDate(p[0])) return null;
  return { date: p[0], app: p[1], player_id: p[2], prop: p[3], line: Number(p[4]), side: sideIn(p[5]) };
}

// The NBA board's slate: today's (Pacific) scored board when P3 has written it, otherwise the latest scored slate (replay) -
// the UI always shows a real board; mode and date are reported so nothing is mistaken for today's.
export async function resolveSlate(sql, cfg, url) {
  const asked = validDate(url && url.searchParams.get("date"));
  const r = (await q(sql, `SELECT (now() AT TIME ZONE 'America/Los_Angeles')::date::text today,
      (SELECT max(game_date)::text FROM nba_score.board_scored WHERE game_date <= (now() AT TIME ZONE 'America/Los_Angeles')::date AND app = ANY($1::text[])) latest,
      (SELECT min(game_date)::text FROM nba_calendar.slate_games WHERE game_date >= (now() AT TIME ZONE 'America/Los_Angeles')::date) next_slate,
      (SELECT min(game_datetime_utc) FROM nba_calendar.slate_games WHERE game_date = (now() AT TIME ZONE 'America/Los_Angeles')::date) first_tip_today`,
    [pgArr(cfg.ui.apps)]))[0];
  const date = asked || (r.latest === r.today ? r.today : (r.latest || r.today));
  return { date, today: r.today, mode: date === r.today ? "live" : "replay", latest_scored: r.latest, next_slate: r.next_slate, first_tip_today: r.first_tip_today, requested: asked };
}
