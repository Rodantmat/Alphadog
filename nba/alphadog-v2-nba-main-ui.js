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
import { apiGenerate, apiHighHit, apiSave, apiRecent } from "./main_ui/slips.js";
import { apiHealth, apiHealthRerun, apiCalibrationReport, apiCalibrationApply } from "./main_ui/health.js";
import { ASSETS } from "./main_ui/assets.js";

const VERSION = "alphadog-v2-nba-main-ui-v1.3.4";   // v1.3.x: the Sharp Read (main_ui/sharp.js + client/sharp.js.txt); .1 standard-line comparisons, .2 small-sample notes, .3 ramp-aware projection
const ASSET_HASH = VERSION.replace(/^.*-v/, "v");   // browser cache key for the client parts: bump VERSION on any client change

// every route this worker answers (also returned on a 404, as the MLB worker does)
const ALLOWED_ROUTES = ["GET /", "GET /index.html", "GET /app.js", "GET /js/{pricing,dossier,build,slips,profile,admin}.js", "GET /health", "GET /diagnostic",
  "POST /run", "GET /api/main-board/current", "GET /api/main-board/filters", "GET /api/main-board/dossier", "GET /api/main-board/health",
  "POST /api/main-board/health/rerun", "GET /api/calibration/report", "POST /api/calibration/apply", "GET /api/player-search", "GET /api/player-profile",
  "POST /api/slips/generate", "POST /api/slips/save", "GET /api/slips/recent", "POST /api/slips/high-hit", "POST /api/slips/auto-create",
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
