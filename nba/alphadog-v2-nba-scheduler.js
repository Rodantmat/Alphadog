import postgres from "postgres";

// NBA PIPELINE SCHEDULER (2026-10-02). Replaces GitHub's own cron as the trigger for P1 / P2 / P3.
//
// WHY: measured on this repository, GitHub started every scheduled NBA run late - P2 median 4 h 23 min (max 5 h 38 min),
// P3 median 2 h 59 min (max 3 h 46 min), P1 3-4.5 h - and dropped some outright. GitHub documents scheduled events as
// best-effort ("can be delayed during periods of high load ... queued jobs may be dropped"). A late P3 places the pick
// after the first tip. Cloudflare Cron Triggers fire to the minute (at-least-once), and a workflow_dispatch starts
// within about a minute, so this worker fires the pipelines through GitHub's dispatch API instead.
//
// RULES (owner): no pipeline may run twice for the same slate; the P3 watchdog fires 5 and 10 minutes after its slot.
//   1. Every pipeline begins with a run-once claim (nba/pipeline_claim.py -> nba_control.pipeline_runs). A second run for
//      the same slate - however it was started - stops at the claim and runs nothing.
//   2. This worker never dispatches a pipeline whose slate is already claimed, and records each dispatch it makes in
//      nba_control.scheduler_dispatches (one row per pipeline + slate + slot), so a duplicate Cloudflare fire of the same
//      minute cannot dispatch twice either.
//   3. A watchdog slot re-dispatches only when the slate is NOT claimed AND GitHub shows no queued or running run of that
//      pipeline started since the slot's own dispatch - i.e. only when the original truly never started.
//
// One every-minute cron ("* * * * *"); the schedule table below is matched against the event's scheduledTime in UTC.
// Times are UTC by design, matching the pipelines' own specification (P3 = 21:15 UTC; 21:16 here gives the one-minute
// trigger accuracy room against P3's own cutoff gate, which refuses a dispatched run before 13:15 PT in winter).

const WORKER_NAME = "alphadog-v2-nba-scheduler";
const VERSION = "alphadog-v2-nba-scheduler-v1.0.0";

const WORKFLOWS = {
  P1: "nba-p1-weekly-static.yml",
  P2: "nba-p2-overnight-heavy.yml",
  P3: "nba-p3-afternoon-light.yml",
};

// UTC "HH:MM"; dow = UTC day of week (1 = Monday) for weekly slots
const SLOTS = [
  { at: "15:45", pipeline: "P2", kind: "dispatch" },
  { at: "15:55", pipeline: "P2", kind: "watchdog" },
  { at: "16:05", pipeline: "P2", kind: "watchdog" },
  { at: "21:16", pipeline: "P3", kind: "dispatch" },
  { at: "21:21", pipeline: "P3", kind: "watchdog" },   // 5 minutes after (owner)
  { at: "21:26", pipeline: "P3", kind: "watchdog" },   // 10 minutes after (owner)
  { at: "19:00", pipeline: "P1", kind: "dispatch", dow: 1 },
  { at: "19:10", pipeline: "P1", kind: "watchdog", dow: 1 },
];

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function pg(env) { return postgres(env.HYPERDRIVE.connectionString, { max: 2, fetch_types: false, prepare: false, connect_timeout: 8 }); }

function ptDate(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}
// the same key the pipelines claim with: the Pacific date (P2/P3), or the Monday of the Pacific week (P1)
function runKey(pipeline, ms) {
  const d = ptDate(ms);
  if (pipeline !== "P1") return d;
  const x = new Date(d + "T12:00:00Z");
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}
function hhmm(ms) { const d = new Date(ms); return String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0"); }
function slotsAt(ms) {
  const t = hhmm(ms), dow = new Date(ms).getUTCDay();
  return SLOTS.filter((s) => s.at === t && (s.dow === undefined || s.dow === dow));
}

async function ensureSchema(sql) {
  await sql`CREATE TABLE IF NOT EXISTS nba_control.pipeline_runs (pipeline text NOT NULL, run_key date NOT NULL, claimed_at timestamptz NOT NULL DEFAULT now(),
            source text, github_run_id text, status text NOT NULL DEFAULT 'claimed', finished_at timestamptz, note text, PRIMARY KEY (pipeline, run_key))`;
  await sql`CREATE TABLE IF NOT EXISTS nba_control.scheduler_dispatches (pipeline text NOT NULL, run_key date NOT NULL, slot text NOT NULL,
            dispatched_at timestamptz NOT NULL DEFAULT now(), ok boolean, detail text, PRIMARY KEY (pipeline, run_key, slot))`;
  await sql`CREATE TABLE IF NOT EXISTS nba_control.scheduler_log (at timestamptz NOT NULL DEFAULT now(), slot text, pipeline text, run_key date,
            action text, detail text)`;
  await sql`CREATE TABLE IF NOT EXISTS nba_control.scheduler_switch (id int PRIMARY KEY DEFAULT 1, enabled boolean NOT NULL DEFAULT true, updated_at timestamptz DEFAULT now())`;
  await sql`INSERT INTO nba_control.scheduler_switch (id, enabled) VALUES (1, true) ON CONFLICT (id) DO NOTHING`;
}

async function log(sql, slot, pipeline, key, action, detail) {
  await sql`INSERT INTO nba_control.scheduler_log (slot, pipeline, run_key, action, detail) VALUES (${slot}, ${pipeline}, ${key}, ${action}, ${String(detail || "").slice(0, 900)})`;
}

async function github(env, method, path, body) {
  if (!env.GITHUB_TOKEN || env.GITHUB_TOKEN === "DISABLED") return { ok: false, status: 0, data: { error: "GITHUB_TOKEN not configured" } };
  const owner = env.GITHUB_OWNER || "Rodantmat", repo = env.GITHUB_REPO || "Alphadog";
  const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    method,
    headers: { "Authorization": `Bearer ${env.GITHUB_TOKEN}`, "Accept": "application/vnd.github+json", "User-Agent": "AlphaDog-NBA-Scheduler", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = resp.status === 204 ? null : await resp.json(); } catch (_) { data = null; }
  return { ok: resp.status >= 200 && resp.status < 300, status: resp.status, data };
}

async function dispatch(env, workflow) {
  const r = await github(env, "POST", `/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, { ref: env.GITHUB_BRANCH || "main" });
  return r.ok ? { ok: true } : { ok: false, detail: `github ${r.status} ${JSON.stringify(r.data || {}).slice(0, 300)}` };
}

// any run of this workflow created at or after `sinceIso` that is still queued / waiting / in progress
async function activeRunSince(env, workflow, sinceIso) {
  const r = await github(env, "GET", `/actions/workflows/${encodeURIComponent(workflow)}/runs?per_page=10&created=%3E%3D${encodeURIComponent(sinceIso)}`);
  if (!r.ok || !r.data || !Array.isArray(r.data.workflow_runs)) return { known: false };
  const live = r.data.workflow_runs.filter((x) => ["queued", "waiting", "pending", "requested", "in_progress"].includes(x.status));
  return { known: true, live: live.length, ids: live.map((x) => x.id) };
}

async function handleSlot(env, slot, ms, dryRun = false) {
  const sql = pg(env);
  const key = runKey(slot.pipeline, ms);
  const tag = `${slot.at}${slot.dow !== undefined ? "/dow" + slot.dow : ""} ${slot.kind}`;
  try {
    await ensureSchema(sql);
    const sw = await sql`SELECT enabled FROM nba_control.scheduler_switch WHERE id=1`;
    if (!sw[0] || !sw[0].enabled) { await log(sql, tag, slot.pipeline, key, "skipped_disabled", "scheduler switch is off"); return { slot: tag, action: "skipped_disabled" }; }
    const claimed = await sql`SELECT status, github_run_id, claimed_at FROM nba_control.pipeline_runs WHERE pipeline=${slot.pipeline} AND run_key=${key}`;
    if (claimed[0]) {
      const action = slot.kind === "dispatch" ? "skip_already_claimed" : "watchdog_ok_claimed";
      await log(sql, tag, slot.pipeline, key, action, `run ${claimed[0].github_run_id} status ${claimed[0].status} claimed ${claimed[0].claimed_at}`);
      return { slot: tag, action };
    }
    if (slot.kind === "watchdog") {
      const prev = await sql`SELECT min(dispatched_at) AS first FROM nba_control.scheduler_dispatches WHERE pipeline=${slot.pipeline} AND run_key=${key}`;
      const since = prev[0] && prev[0].first ? new Date(prev[0].first).toISOString() : new Date(ms - 30 * 60000).toISOString();
      const active = await activeRunSince(env, WORKFLOWS[slot.pipeline], since);
      if (active.known && active.live > 0) {
        await log(sql, tag, slot.pipeline, key, "watchdog_run_pending", `not claimed yet but ${active.live} run(s) queued/running: ${active.ids.join(",")}`);
        return { slot: tag, action: "watchdog_run_pending", runs: active.ids };
      }
    }
    if (dryRun) { await log(sql, tag, slot.pipeline, key, "dry_run_would_dispatch", "simulation - nothing dispatched"); return { slot: tag, action: "dry_run_would_dispatch", run_key: key }; }
    // one dispatch per pipeline + slate + slot, even if Cloudflare fires this minute twice
    const ins = await sql`INSERT INTO nba_control.scheduler_dispatches (pipeline, run_key, slot) VALUES (${slot.pipeline}, ${key}, ${tag})
                          ON CONFLICT (pipeline, run_key, slot) DO NOTHING RETURNING pipeline`;
    if (!ins[0]) { await log(sql, tag, slot.pipeline, key, "skip_duplicate_fire", "this slot already dispatched for this slate"); return { slot: tag, action: "skip_duplicate_fire" }; }
    const res = await dispatch(env, WORKFLOWS[slot.pipeline]);
    await sql`UPDATE nba_control.scheduler_dispatches SET ok=${res.ok}, detail=${res.ok ? "accepted" : res.detail} WHERE pipeline=${slot.pipeline} AND run_key=${key} AND slot=${tag}`;
    const action = res.ok ? (slot.kind === "dispatch" ? "dispatched" : "watchdog_redispatched") : "dispatch_failed";
    await log(sql, tag, slot.pipeline, key, action, res.ok ? WORKFLOWS[slot.pipeline] : res.detail);
    return { slot: tag, action, run_key: key, detail: res.ok ? undefined : res.detail };
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }
}

async function tick(env, ms, dryRun = false) {
  const due = slotsAt(ms);
  const out = [];
  for (const s of due) {
    try { out.push(await handleSlot(env, s, ms, dryRun)); }
    catch (e) { out.push({ slot: s.at, pipeline: s.pipeline, action: "error", error: String(e && e.message || e).slice(0, 300) }); }
  }
  // heartbeat + one-off test slots (proof of the whole chain without touching a pipeline)
  if (!dryRun) {
    const sql = pg(env);
    try {
      await ensureSchema(sql);
      await sql`ALTER TABLE nba_control.scheduler_switch ADD COLUMN IF NOT EXISTS last_tick timestamptz`;
      await sql`UPDATE nba_control.scheduler_switch SET last_tick=now() WHERE id=1`;
      await sql`CREATE TABLE IF NOT EXISTS nba_control.scheduler_test (id serial PRIMARY KEY, run_at timestamptz NOT NULL, workflow text NOT NULL,
                done boolean NOT NULL DEFAULT false, result text)`;
      const tests = await sql`SELECT id, workflow FROM nba_control.scheduler_test WHERE NOT done AND run_at <= now() ORDER BY id LIMIT 3`;
      for (const t of tests) {
        const allowed = ["nba-schedule-audit.yml"];   // test slots may only fire a harmless diagnostic
        const res = allowed.includes(t.workflow) ? await dispatch(env, t.workflow) : { ok: false, detail: "workflow not allowed for test slots" };
        await sql`UPDATE nba_control.scheduler_test SET done=true, result=${res.ok ? "dispatched" : res.detail} WHERE id=${t.id}`;
        await log(sql, "test", "TEST", null, res.ok ? "test_dispatched" : "test_failed", res.ok ? t.workflow : res.detail);
        out.push({ slot: "test", action: res.ok ? "test_dispatched" : "test_failed" });
      }
    } catch (e) {
      out.push({ slot: "heartbeat", action: "error", error: String(e && e.message || e).slice(0, 300) });
    } finally { await sql.end({ timeout: 2 }).catch(() => {}); }
  }
  return { ok: true, at_utc: new Date(ms).toISOString(), due: due.length, results: out };
}

function authorized(request, env) {
  const t = request.headers.get("x-admin-token") || "";
  return env.ALPHADOG_ADMIN_TOKEN && t === env.ALPHADOG_ADMIN_TOKEN;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (request.method === "GET" && (path === "/" || path === "/health")) {
      const sql = pg(env);
      try {
        await ensureSchema(sql);
        const sw = await sql`SELECT enabled, updated_at FROM nba_control.scheduler_switch WHERE id=1`;
        const recent = await sql`SELECT at, slot, pipeline, run_key, action, left(detail, 160) detail FROM nba_control.scheduler_log ORDER BY at DESC LIMIT 15`;
        const runs = await sql`SELECT pipeline, run_key, status, github_run_id, claimed_at, finished_at FROM nba_control.pipeline_runs ORDER BY claimed_at DESC LIMIT 10`;
        return jsonResponse({ ok: true, worker: WORKER_NAME, version: VERSION, enabled: sw[0] && sw[0].enabled, now_utc: new Date().toISOString(),
          schedule_utc: SLOTS, workflows: WORKFLOWS, github_token_present: !!(env.GITHUB_TOKEN && env.GITHUB_TOKEN !== "DISABLED"),
          recent_actions: recent, recent_claims: runs });
      } finally { await sql.end({ timeout: 2 }).catch(() => {}); }
    }
    if (!authorized(request, env)) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
    if (request.method === "POST" && path === "/toggle") {
      const body = await request.json().catch(() => ({}));
      const sql = pg(env);
      try { await ensureSchema(sql); await sql`UPDATE nba_control.scheduler_switch SET enabled=${!!body.enabled}, updated_at=now() WHERE id=1`; return jsonResponse({ ok: true, enabled: !!body.enabled }); }
      finally { await sql.end({ timeout: 2 }).catch(() => {}); }
    }
    if (request.method === "POST" && path === "/simulate") {
      // dry run of the decision logic at a given UTC time, e.g. {"at":"2026-10-20T21:16:00Z"} - never dispatches
      const body = await request.json().catch(() => ({}));
      const ms = Date.parse(body.at || new Date().toISOString());
      return jsonResponse(await tick(env, ms, true));
    }
    return jsonResponse({ ok: false, error: "not_found", routes: ["GET / (health)", "POST /toggle {enabled} [admin]", "POST /simulate {at} [admin]"] }, 404);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(tick(env, controller.scheduledTime));
  },
};
