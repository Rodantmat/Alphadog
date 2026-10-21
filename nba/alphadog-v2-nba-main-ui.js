// ALPHADOG NBA MAIN INTERFACE (2026-10-14) - the NBA copy of the MLB main UI (alphadog-v2-certification-center): same screens,
// same look, same functions - board cards, the tap-through dossier, the slip builder, the Slips screen with leg substitution and
// saving, player profiles, health and calibration - on NBA data. Read-only on every NBA table except its own
// nba_score.ui_saved_slips; reruns and calibration are GitHub workflow_dispatches guarded by the run-once rules.
//
// SPLIT FOR A LIGHT LOAD (owner: "break it in phases ... so to load it and use it, it's not too heavy"): the MLB worker is one
// 1.06 MB file that inlines the whole client. Here the server is split by concern under nba/main_ui/ and the client is split
// into a small core (board + cards) plus parts the browser fetches only when a screen first opens (dossier, builder, slips,
// profile, admin, pricing). The client sources (nba/main_ui/client/) are imported as text modules and served as they are.
// DEPLOY NOTE: the deploy script redeploys a worker when THIS file changes - bump VERSION with any change under nba/main_ui/.
import { WORKER_NAME, jsonResponse, readJsonSafe, withPg, loadConfig, resolveSlate } from "./main_ui/common.js";
import { apiCurrent, apiFilters } from "./main_ui/board.js";
import { apiDossier } from "./main_ui/dossier.js";
import { apiPlayerSearch, apiPlayerProfile } from "./main_ui/profile.js";
import { apiGenerate, apiHighHit, apiSave, apiRecent, apiStakeUnit } from "./main_ui/slips.js";
import { apiHealth, apiHealthRerun, apiCalibrationReport, apiCalibrationApply } from "./main_ui/health.js";
import { ASSETS } from "./main_ui/assets.js";

const VERSION = "alphadog-v2-nba-main-ui-v1.4.29";   // v1.4.29 (2026-10-21 14:40 PT): Overview NOT pre-selected for now - its first load hit the 20 s query limit (the board fell back to nothing); the whole board loads as before, Overview is one tick away. // v1.4.28 (owner 2026-10-21 13:56 PT: "create one option called overview that comes also pre-selected ... real good legs ... less heavy to load"): the board opens on OVERVIEW (ticked by default) - PrizePicks / Underdog / Sleeper legs with the market-anchored probability, main props only (no Double-Double / Fantasy / FGA / FGM / FTA / FTM / OREB / DREB / fouls), an edge of 3+ points over the leg's own break-even, best edge first, one line per player-prop-app, up to 60 (tunable nba_main_ui.overview); untick it for the whole board. // v1.4.27 (2026-10-21): redeploy of the repaired slips part (the v1.4.26 commit's patch duplicated the file tail; slips.js restored, same fix). // v1.4.26 (owner 2026-10-21 13:56 PT, Slips: "Build failed: query failed: HARD_QUERY_TIMEOUT_12000MS"): the place-by team lookup compared player ids as text, which disabled the game-log index (one full scan per leg; 29 slips on 10-21 timed out) - compared as bigint now, 0.8 s. // v1.4.25 (owner 2026-10-20 19:44 PT: board empty + "it should not show started legs/games" + "the bad underdog legs from earlier still there"): on a live slate the server leaves legs of started games out of the board AND the filter counts; the filter counts now apply the same unplaceable-Underdog screen as the board (569 of 1,307 Underdog legs on 10-20 were counted but never shown); when every game of the slate has started the board says so and names the next slate and when it is scored. // v1.4.24 (2026-10-20): the Slips screen loads the board unscreened so every built slip leg still resolves; unplaceable Underdog legs (ud_hidden) stay out of its percentile and backup pool; tests C7 / C24 count only placeable lines. // v1.4.23 (owner 2026-10-20 12:25 PT, Underdog slips matched one leg of five in the app): alternate rungs of prediction-market Underdog lines are in the feed but were not offered in the app - the board and the slip engine leave them out (nba_market.ud_line_flags; tunable nba_main_ui.ud_alt_policy.hide_prediction_market_alts); a slip leg on a whole-number line (e.g. KAT PRA 35) now shows its probability from nba_score.final_hp_derived instead of a blank. // v1.4.22 (owner 2026-10-19 17:30 PT: Fliff and Betr wired like the other apps): Fliff and Betr legs reach the board with their own filter groups; a Fliff leg shows its sportsbook price (decimal from its American odds) and breaks even at 1 / decimal. // v1.4.21 (owner 2026-10-18 23:19 PT with Underdog / Sleeper screenshots: "scores does not match"): every Underdog / Sleeper leg shows the number the APP shows (Underdog's pick price - 1.87x on a balanced line, the rung price on a ladder; marked approximate on Odds-API history, sqrt(3.5) x modifier; Sleeper's multiplier) on its card badge and in its read, beside the payout factor the slip is priced on; a Sleeper leg's break-even is 1 / its multiplier (it is a price) - 0.56 / m had put a 1.87x leg at 30%; test C63. v1.4.20 (owner 2026-10-18 22:59 PT, Board showed "UNHANDLED REJECTION: Invalid call to runtime.sendMessage(). Tab not found."): a browser extension's own rejection (runtime.sendMessage / connect, Tab not found, an extension:// stack) is logged, not bannered - AlphaDog never calls the extension runtime; our own rejections are still bannered, now HTML-escaped; test C62. v1.4.19 (2026-10-18): each live PrizePicks slip shows PrizePicks' OWN quote (P3 quotes every engine slip, nba_score.live_slip_quotes) - its multiplier / Flex tiers replace the model's, the model's number is named when it differs, and a slip whose leg moved or left the board says which leg to substitute. v1.4.18 (owner 2026-10-18: "be sure we are using the proper multipliers, prove ..."): PrizePicks slip payouts on GRADER v3, proven on PrizePicks' own quotes on the live board - all-regular Power / Flex pay the tables exactly (5-pick Power 20x, was 17.87x), Power with goblins / demons the conservative power_alt_v3 law, a same-game 3 / 4-Flex the adjusted table (pricing.js = build_slip_engine.pp_payout; test B parity with same-game cases). v1.4.17 (2026-10-18): before opening night the Slips screen replays the LIVE ENGINE's own slips for the latest past slate (production-configuration season replay, nba_main_ui.replay_live.label) - caps, slate-size rule, states, streak flags and the earned unit as live applies them - instead of every strategy at its backtest cap; each says what was staked that day; tests C61, C13 / C50 extended. v1.4.16 (2026-10-18): before opening night the Slips screen replays the latest slate the plan PLAYS (the final 7 days of the regular season are never staked - it showed 2026-04-12), with a plain note; test C60. v1.4.15 (owner 2026-10-18: "put in placing order, so the right times ones first"): the Slips screen lists slips by Place by, earliest first (PLAY before skips at the same time, PrizePicks before Underdog); test C59. v1.4.14 (2026-10-18): the unit is read past the Hyperdrive query cache (now()) and saved with UPDATE ... RETURNING - a re-read after a save came back stale (C51). v1.4.13 (owner 2026-10-18: "all 6 and earn the raise, auto calculated and auto preset on the my unit"): My unit is the engine's earned unit (auto), the Slips screen states the season profit, the next raise and the step-down point; a hand-set unit turns auto off and the Auto button turns it back on; each slip's PLAY amount uses the unit in force when it was picked. v1.4.12 (owner 2026-10-17): the Slips screen notes each streak flag's state (A_core legs < 55% over 5 days, A_regular 3 losing days: ON since / reason / when it stops, acted or recorded only) and each flagged slip carries its streak note. v1.4.11 (owner 2026-10-17): test-only slips (shadow / paper / not-staked strategies) are recorded as not played and not shown on the Slips screen; the replay note names the window-only twin. NOTE: the deploy ships this worker only when THIS file changes - bump VERSION with every nba/main_ui/ change (UI test C0b enforces it). v1.4.10: a browser-muted foreign "Script error." (in-app browser / extension code; same-origin errors always carry their file) is logged, not bannered; our own errors name their file. v1.4.9 (owner 2026-10-17, deeper pass): one name normaliser (common.normName = nba_ref.norm_name; suffixed players matched on Underdog backtest slips, injuries, with/without), a pushed leg says PUSH and the result counts it, a missing probability shows a dash not 0%, the board takes a live slate's team from the current roster, season windows holding playoff / play-in games say so. v1.4.8 (owner 2026-10-17): Slips opened cold no longer fails (multiplierLabel moved into the slips part); the profile uses the CURRENT roster team (offseason movers), its opponent-defender list is the current roster on live dates, an offseason arrival gets no false absence ramp; B2B / Home-Road splits are per-game (stored totals); Home / Away (this season) no longer blank (client avgOf name clash); one estimated line for trend cards and Line Profile. v1.4.7: Underdog P5 slips say PLAY $ / SKIP (stake_unit.ud_play; edge-monitor ALARM stops them); the day note totals both apps. v1.4.6: every slip shows its place-by time (first tip among its legs' games). v1.4.5: the owner sets his own unit on the Slips screen (/api/stake-unit); slips client repaired. v1.4.4: every slip says PLAY $x (owner's unit, classification_config['stake_unit']) or SKIP with its reason, plus the day's play total. v1.4.3 (full pass): board edge is against the leg's own break-even (goblin/demon factor), a warning when any row lacks the honest HP, slips say staked / paper / shadow, the backtest context leaves out the final-7 phase. v1.4.2: certified slips show the backtest behind them (cell rates, certified leg hit, backtest ROI by season). v1.4.1: dossier shows the sportsbook's real main line + no-vig split instead of a derived "implied HP". v1.4.0: honest hit probability - the board shows the market-anchored HP (nba_score.board_true_hp) beside the model's own; edge no longer double-scaled. v1.3.x: the Sharp Read
const ASSET_HASH = VERSION.replace(/^.*-v/, "v");   // browser cache key for the client parts: bump VERSION on any client change

// every route this worker answers (also returned on a 404, as the MLB worker does)
const ALLOWED_ROUTES = ["GET /", "GET /index.html", "GET /app.js", "GET /js/{pricing,dossier,build,slips,profile,admin}.js", "GET /health", "GET /diagnostic",
  "POST /run", "GET /api/main-board/current", "GET /api/main-board/filters", "GET /api/main-board/dossier", "GET /api/main-board/health",
  "POST /api/main-board/health/rerun", "GET /api/calibration/report", "POST /api/calibration/apply", "GET /api/player-search", "GET /api/player-profile",
  "POST /api/slips/generate", "POST /api/slips/save", "GET /api/slips/recent", "GET /api/stake-unit", "POST /api/stake-unit", "POST /api/slips/high-hit", "POST /api/slips/auto-create",
  "POST /api/slips/research-create", "POST /api/slips/high-hit-underdog", "POST /api/slips/regular", "POST /api/slips/goblin", "POST /api/slips/demon",
  "GET /main_alphadog_logo.png", "GET /main_alphadog_favicon.png", "GET /main_alphadog_apple_touch_icon.png"];

const STATIC = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["core.js", "application/javascript; charset=utf-8"],
  "/js/pricing.js": ["pricing.js", "application/javascript; charset=utf-8"],
  "/js/dossier.js": ["dossier.js", "application/javascript; charset=utf-8"],
  "/js/build.js": ["build.js", "application/javascript; charset=utf-8"],
  "/js/slips.js": ["slips.js", "application/javascript; charset=utf-8"],
  "/js/profile.js": ["profile.js", "application/javascript; charset=utf-8"],
  "/js/admin.js": ["admin.js", "application/javascript; charset=utf-8"]
};

function asset(path) {
  if (path === "/main_alphadog_logo.png" || path === "/main_alphadog_favicon.png" || path === "/main_alphadog_apple_touch_icon.png") {
    const bin = Uint8Array.from(atob(ASSETS["logo.png.b64"]), c => c.charCodeAt(0));
    return new Response(bin, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
  }
  const s = STATIC[path];
  if (!s) return null;
  let body = ASSETS[s[0]];
  if (s[0] === "index.html") body = body.replaceAll("{{ASSET_HASH}}", ASSET_HASH);
  return new Response(body, { headers: { "content-type": s[1], "cache-control": s[0] === "index.html" ? "no-store" : "public, max-age=3600", "x-nba-ui-version": VERSION } });
}

async function api(path, request, env, url) {
  const get = request.method === "GET", post = request.method === "POST";
  return withPg(env, async sql => {
    const cfg = await loadConfig(sql);
    const send = r => (r && r.status && r.body ? jsonResponse(r.body, r.status) : jsonResponse(r));
    if (get && path === "/api/main-board/current") return send(await apiCurrent(sql, cfg, await resolveSlate(sql, cfg, url), url, VERSION));
    if (get && path === "/api/main-board/filters") return send(await apiFilters(sql, cfg, await resolveSlate(sql, cfg, url), VERSION));
    if (get && path === "/api/main-board/dossier") return send(await apiDossier(sql, cfg, url, VERSION));
    if (get && path === "/api/main-board/health") return send(await apiHealth(sql, cfg, url, VERSION));
    if (post && path === "/api/main-board/health/rerun") return send(await apiHealthRerun(sql, cfg, env, await readJsonSafe(request), VERSION));
    if (get && path === "/api/calibration/report") return send(await apiCalibrationReport(sql, cfg, url, VERSION));
    if (post && path === "/api/calibration/apply") return send(await apiCalibrationApply(sql, cfg, env, await readJsonSafe(request), VERSION));
    if (get && path === "/api/player-search") return send(await apiPlayerSearch(sql, url, VERSION));
    if (get && path === "/api/player-profile") return send(await apiPlayerProfile(sql, cfg, url, VERSION));
    if (post && path === "/api/slips/generate") return send(await apiGenerate(sql, cfg, await readJsonSafe(request), VERSION));
    if (path === "/api/slips/save" && post) return send(await apiSave(sql, cfg, await readJsonSafe(request), VERSION));
    if (path === "/api/slips/recent" && get) return send(await apiRecent(sql, url, VERSION));
    if (path === "/api/stake-unit" && get) return send(await apiStakeUnit(sql, null, VERSION));
    if (path === "/api/stake-unit" && post) return send(await apiStakeUnit(sql, await readJsonSafe(request), VERSION));
    // the Slips screen and every MLB slip route alias (same contract; NBA slips come from the engines, filtered per route)
    const slipRoutes = { "/api/slips/high-hit": null, "/api/slips/auto-create": null, "/api/slips/research-create": null, "/api/slips/high-hit-underdog": "underdog",
      "/api/slips/regular": "regular", "/api/slips/goblin": "goblin", "/api/slips/demon": "demon" };
    if (path in slipRoutes) {
      const r = await apiHighHit(sql, cfg, url, VERSION);
      const f = slipRoutes[path];
      if (f === "underdog") r.generated_slips = r.generated_slips.filter(s => s.source_key === "underdog");
      else if (f) r.generated_slips = r.generated_slips.filter(s => s.source_key === "prizepicks" && s.legs.some(l => (l.line_type || "regular") === f));
      r.route = path;
      return send(r);
    }
    return jsonResponse({ ok: false, error: "not_found", path, version: VERSION, allowed_routes: ALLOWED_ROUTES }, 404);
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (request.method === "OPTIONS") return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" } });
      const a = request.method === "GET" ? asset(path) : null;
      if (a) return a;
      if (path === "/health" || path === "/diagnostic") {
        return withPg(env, async sql => {
          const cfg = await loadConfig(sql);
          const slate = await resolveSlate(sql, cfg, url);
          return jsonResponse({ ok: true, worker: WORKER_NAME, version: VERSION, asset_hash: ASSET_HASH, slate, apps: cfg.ui.apps,
            bindings: { HYPERDRIVE: !!env.HYPERDRIVE, GITHUB_TOKEN: !!(env.GITHUB_TOKEN && env.GITHUB_TOKEN !== "DISABLED") },
            pp_rules_loaded: Object.keys(cfg.pp), reliability_loaded: !!cfg.reliability, sleeper_rules_loaded: !!cfg.sleeper, timestamp_utc: new Date().toISOString() });
        });
      }
      // the orchestrator's job slot (MLB parity): this worker is a read-only UI and never runs a pipeline from /run
      if (request.method === "POST" && path === "/run") {
        const input = await readJsonSafe(request);
        return jsonResponse({ ok: true, worker: WORKER_NAME, version: VERSION, route: "/run", request_id: input.request_id || null, chain_id: input.chain_id || null,
          job_key: input.job_key || null, status: "MAIN_UI_READ_ONLY_NOOP", rows_read: 0, rows_written: 0,
          output_json: { noop: true, message: "NBA main UI worker is read-only and does not run pipelines; P1/P2A/P2B/P3 run from their own workflows." } });
      }
      if (path.startsWith("/api/")) return await api(path, request, env, url);
      return jsonResponse({ ok: false, error: "not_found", path, version: VERSION, allowed_routes: ALLOWED_ROUTES }, 404);
    } catch (err) {
      return jsonResponse({ ok: false, error: String(err && err.message ? err.message : err), path, version: VERSION }, 500);
    }
  }
};
