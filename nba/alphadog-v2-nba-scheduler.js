import postgres from "postgres";

// NBA PIPELINE SCHEDULER v2 (2026-10-02, strategy doc §29z, §29z-b, §29z-c). The trigger for P1 / P2A / P2B / P3.
//
// WHY A WORKER: GitHub's own schedules started every NBA pipeline late on this repository (measured: P2 median
// 4h23m, P3 median 2h59m, P1 3-4.5h) - P3 would pick after tip-off. Cloudflare cron fires to the minute; a
// workflow_dispatch starts within about a minute.
//
// WHY A DAILY PLAN (owner decision 2026-10-02): the start times MOVE WITH EACH DAY'S FIRST TIP. 41 of 156 slates in
// 2026-27 tip before 13:15 PT (weekends, Christmas, MLK, the 07:30 PT Manchester game); a fixed time silently drops
// their early games. The rules, all Pacific-anchored (no DST drift):
//   P3  = min(13:15 PT, first tip - 30 min) + 1 min    (P3's own documented cutoff, COMPASS fact 107 / 2026-09-23)
//   P2B = min(08:05 PT, P3 - 110 min)                    (08:05 = after the 08:00 PT morning line; ~80-min build + 30 buffer)
//   P2A = min(03:30 PT, P2B - 60 min)                    (prior-night box scores final ~3 AM PT, fact 107)
//   P1  = Mondays 19:00 UTC (weekly static; unchanged)
// DEPENDENCIES (nothing lost, nothing out of order): P2B starts only after P2A has finished (or at the latest start
// that still beats P3); P3 starts only after P2B has finished (or at its hard deadline = first tip - 30 min), and
// NEVER after the first tip. A finished-but-failed predecessor does not block (P3 must still capture the board; its
// own freshness gate refuses a pick without today's scores).
// RUN-ONCE (owner rule): every pipeline claims its slate first (nba/pipeline_claim.py); this worker never dispatches
// a claimed slate, records each dispatch (one per pipeline + slate + slot), and its WATCHDOGS (+5 and +10 minutes
// after the dispatch - owner: 5-10) re-dispatch only if the slate is still unclaimed AND GitHub shows no queued or
// running run of that pipeline.

const WORKER_NAME = "alphadog-v2-nba-scheduler";
const VERSION = "alphadog-v2-nba-scheduler-v2.2.1";   // v2.2.1: a recovered predecessor blocks successors (2026-10-08, round 2 P2A#9); v2.2.0: stale-claim recovery
const WORKFLOWS = {
  P1: "nba-p1-weekly-static.yml",
  P2A: "nba-p2a-results.yml",
  P2B: "nba-p2b-slate.yml",
  P3: "nba-p3-afternoon-light.yml",
  CLOSE: "nba-close-capture.yml",   // §31c: the close board, once per game day at first tip - 25 min (input-free workflow)
};
const MIN = 60000;

// ---------- pure time helpers (Pacific-anchored) ----------
function ptParts(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hh: Number(p.hour), mi: Number(p.minute), dow: new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`).getUTCDay() };
}
function ptDate(ms) { return ptParts(ms).date; }
// the UTC instant of a Pacific wall-clock time on a Pacific date (handles PDT/PST)
function ptWall(dateStr, hhmm) {
  const [y, m, d] = dateStr.split("-").map(Number), [h, mi] = hhmm.split(":").map(Number);
  for (const off of [7, 8]) {
    const ms = Date.UTC(y, m - 1, d, h + off, mi);
    const p = ptParts(ms);
    if (p.date === dateStr && p.hh === h && p.mi === mi) return ms;
  }
  return Date.UTC(y, m - 1, d, h + 8, mi);
}
function mondayOf(dateStr) {
  const x = new Date(dateStr + "T12:00:00Z");
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}
// the key each pipeline claims with (identical to nba/pipeline_claim.py)
function runKey(pipeline, ms) { const d = ptDate(ms); return pipeline === "P1" ? mondayOf(d) : d; }

// ---------- pure plan ----------
// firstTipMs: the first REGULAR-SEASON tip on the Pacific date, or null (no games: preseason, off day)
function computePlan(dateStr, firstTipMs) {
  const cutoff = ptWall(dateStr, "13:15");
  const p3cut = firstTipMs ? Math.min(cutoff, firstTipMs - 30 * MIN) : cutoff;
  const p3 = p3cut + 1 * MIN;
  const p2b = Math.min(ptWall(dateStr, "08:05"), p3 - 110 * MIN);
  const p2a = Math.min(ptWall(dateStr, "03:30"), p2b - 60 * MIN);
  return {
    date: dateStr, first_tip: firstTipMs, p2a, p2b, p3,
    p2b_latest: p3 - 110 * MIN,                                   // the latest P2B start that still beats P3
    p3_deadline: firstTipMs ? firstTipMs - 30 * MIN : p3,           // P3 stops waiting for P2B here
    p3_never_after: firstTipMs || null,                             // P3 never starts after the first tip
  };
}
const DONE = (s) => !!s && s !== "claimed";   // success / failure / cancelled / "success/success" (P1)

// ---------- pure decision ----------
// st: { status: claim status or null, dispatches: [{slot, at}], live: number of queued/running GitHub runs or null }
// deps: { P2A: status, P2B: status }
// returns { action: "dispatch"|"watchdog"|"wait"|"skip"|"missed", slot, reason }
function decide(pipeline, plan, now, st, deps) {
  if (st.status) return { action: "skip", reason: `claimed (${st.status})` };
  const disp = (st.dispatches || []).slice().sort((a, b) => a.at - b.at);
  if (disp.length) {
    const k = disp.length;   // 1 -> first watchdog due at +5, 2 -> second at +10
    if (k > 2) return { action: "skip", reason: "two watchdogs already fired" };
    if (now < disp[0].at + 5 * k * MIN) return { action: "wait", reason: `dispatched, watchdog ${k} due at +${5 * k} min` };
    if (st.live === null) return { action: "wait", reason: "GitHub run status unknown - not re-dispatching blind" };
    if (st.live > 0) return { action: "wait", reason: `not claimed yet but ${st.live} run(s) queued/running` };
    if (pipeline === "P3" && plan.p3_never_after && now >= plan.p3_never_after) return { action: "missed", slot: "missed", reason: "first tip passed" };
    return { action: "watchdog", slot: `watchdog-${k}`, reason: `unclaimed ${5 * k} min after dispatch and nothing running` };
  }
  if (pipeline === "P2A") {
    return now >= plan.p2a ? { action: "dispatch", slot: "primary", reason: "P2A time" } : { action: "wait", reason: "before P2A time" };
  }
  if (pipeline === "P2B") {
    if (now < plan.p2b) return { action: "wait", reason: "before P2B time" };
    if (DONE(deps.P2A)) return { action: "dispatch", slot: "primary", reason: `P2A finished (${deps.P2A})` };
    if (now >= plan.p2b_latest) return { action: "dispatch", slot: "primary", reason: "latest P2B start reached - not waiting for P2A any longer" };
    return { action: "wait", reason: `waiting for P2A (${deps.P2A || "not claimed"})` };
  }
  if (pipeline === "P3") {
    if (now < plan.p3) return { action: "wait", reason: "before P3 time" };
    if (plan.p3_never_after && now >= plan.p3_never_after) return { action: "missed", slot: "missed", reason: "first tip passed before P3 could start" };
    if (DONE(deps.P2B)) return { action: "dispatch", slot: "primary", reason: `P2B finished (${deps.P2B})` };
    if (now >= plan.p3_deadline) return { action: "dispatch", slot: "primary", reason: "P3 deadline reached - not waiting for P2B any longer" };
    return { action: "wait", reason: `waiting for P2B (${deps.P2B || "not claimed"})` };
  }
  return { action: "wait", reason: "unknown pipeline" };
}
// CLOSE capture (§31c, 2026-10-03): ONE dispatch per game day in [first tip - 25 min, first tip). Single-shot by design:
// a capture job never claims a slate, so the generic watchdog (re-dispatch when unclaimed) would re-fire it forever.
// No games -> never; before the window -> wait; inside it -> dispatch once; after the first tip -> 'missed' (logged, no retry).
function decideClose(plan, now, alreadyDispatched) {
  if (!plan.first_tip) return { action: "skip", reason: "no regular-season games" };
  if (alreadyDispatched) return { action: "skip", reason: "close capture already dispatched today" };
  const start = plan.first_tip - 25 * MIN;
  if (now < start) return { action: "wait", reason: "before first tip - 25 min" };
  if (now >= plan.first_tip) return { action: "missed", slot: "missed", reason: "first tip passed before the close capture fired" };
  return { action: "dispatch", slot: "primary", reason: "first tip - 25 min: close board capture" };
}
function p1Due(now) { const d = new Date(now); return d.getUTCDay() === 1 && d.getUTCHours() >= 19; }

// ---------- I/O ----------
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function pg(env) { return postgres(env.HYPERDRIVE.connectionString, { max: 2, fetch_types: false, prepare: false, connect_timeout: 8 }); }

async function ensureSchema(sql) {
  await sql`CREATE TABLE IF NOT EXISTS nba_control.pipeline_runs (pipeline text NOT NULL, run_key date NOT NULL, claimed_at timestamptz NOT NULL DEFAULT now(),
            source text, github_run_id text, status text NOT NULL DEFAULT 'claimed', finished_at timestamptz, note text, PRIMARY KEY (pipeline, run_key))`;
  await sql`CREATE TABLE IF NOT EXISTS nba_control.scheduler_dispatches (pipeline text NOT NULL, run_key date NOT NULL, slot text NOT NULL,
            dispatched_at timestamptz NOT NULL DEFAULT now(), ok boolean, detail text, PRIMARY KEY (pipeline, run_key, slot))`;
  await sql`CREATE TABLE IF NOT EXISTS nba_control.scheduler_log (at timestamptz NOT NULL DEFAULT now(), slot text, pipeline text, run_key date, action text, detail text)`;
  await sql`CREATE TABLE IF NOT EXISTS nba_control.scheduler_switch (id int PRIMARY KEY DEFAULT 1, enabled boolean NOT NULL DEFAULT true, updated_at timestamptz DEFAULT now())`;
  await sql`ALTER TABLE nba_control.scheduler_switch ADD COLUMN IF NOT EXISTS last_tick timestamptz`;
  await sql`INSERT INTO nba_control.scheduler_switch (id, enabled) VALUES (1, true) ON CONFLICT (id) DO NOTHING`;
  await sql`CREATE TABLE IF NOT EXISTS nba_control.scheduler_plan (run_key date PRIMARY KEY, first_tip timestamptz, p2a timestamptz, p2b timestamptz,
            p3 timestamptz, p3_deadline timestamptz, computed_at timestamptz DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS nba_control.scheduler_test (id serial PRIMARY KEY, run_at timestamptz NOT NULL, workflow text NOT NULL,
            done boolean NOT NULL DEFAULT false, result text)`;
}
async function log(sql, slot, pipeline, key, action, detail) {
  await sql`INSERT INTO nba_control.scheduler_log (slot, pipeline, run_key, action, detail) VALUES (${slot}, ${pipeline}, ${key}, ${action}, ${String(detail || "").slice(0, 900)})`;
}
async function github(env, method, path, body) {
  if (!env.GITHUB_TOKEN || env.GITHUB_TOKEN === "DISABLED") return { ok: false, status: 0, data: { error: "GITHUB_TOKEN not configured" } };
  const owner = env.GITHUB_OWNER || "Rodantmat", repo = env.GITHUB_REPO || "Alphadog";
  const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { "Authorization": `Bearer ${env.GITHUB_TOKEN}`, "Accept": "application/vnd.github+json", "User-Agent": "AlphaDog-NBA-Scheduler", "Content-Type": "application/json" },
  });
  let data = null;
  try { data = resp.status === 204 ? null : await resp.json(); } catch (_) { data = null; }
  return { ok: resp.status >= 200 && resp.status < 300, status: resp.status, data };
}
async function dispatch(env, workflow, inputs) {
  const body = { ref: env.GITHUB_BRANCH || "main" };
  if (inputs) body.inputs = inputs;
  const r = await github(env, "POST", `/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, body);
  return r.ok ? { ok: true } : { ok: false, detail: `github ${r.status} ${JSON.stringify(r.data || {}).slice(0, 300)}` };
}
async function liveRunsSince(env, workflow, sinceMs) {
  const r = await github(env, "GET", `/actions/workflows/${encodeURIComponent(workflow)}/runs?per_page=10&created=%3E%3D${encodeURIComponent(new Date(sinceMs - MIN).toISOString())}`);
  if (!r.ok || !r.data || !Array.isArray(r.data.workflow_runs)) return null;
  return r.data.workflow_runs.filter((x) => ["queued", "waiting", "pending", "requested", "in_progress"].includes(x.status)).length;
}

async function firstTip(sql, dateStr) {
  // the ONE slate predicate (round 2 P2A#16, 2026-10-08): nba_calendar.regular_season_games (game-id prefix 002; the label
  // regex let the NBA Cup Final through - nba/sql/regular_season_games.sql)
  const r = await sql`SELECT min(game_datetime_utc) AS first FROM nba_calendar.regular_season_games WHERE game_date = ${dateStr}::date`;
  return r[0] && r[0].first ? new Date(r[0].first).getTime() : null;
}
// STALE CLAIM (2026-10-07): P2B 2026-10-07 run 37642228109 claimed its slate, then GitHub never started the `slate` job and the
// `finish` job (if: always()) never ran either - the row stayed 'claimed' for good. A claimed slate is skipped by decide(), so a
// dead run was never recovered and its successor only moved on at its own deadline. Here: a 'claimed' row whose GitHub run is
// already `completed` is DEAD -> the claim is closed as 'failure' with a note, and the pipeline gets ONE forced recovery
// dispatch (slot 'recovery-1', force=true) if its window is still open. Never when the run is queued or in progress.
async function runCompleted(env, runId) {
  if (!runId) return null;
  const r = await github(env, "GET", `/actions/runs/${encodeURIComponent(runId)}`);
  if (!r.ok || !r.data || !r.data.status) return null;            // unknown -> never treat as dead
  return r.data.status === "completed" ? (r.data.conclusion || "completed") : false;
}
async function pipelineState(sql, env, pipeline, key, needLive) {
  const s = await sql`SELECT status, github_run_id FROM nba_control.pipeline_runs WHERE pipeline=${pipeline} AND run_key=${key}::date`;
  const d = await sql`SELECT slot, dispatched_at FROM nba_control.scheduler_dispatches WHERE pipeline=${pipeline} AND run_key=${key}::date AND ok IS DISTINCT FROM false`;
  const dispatches = d.filter((x) => x.slot !== "missed").map((x) => ({ slot: x.slot, at: new Date(x.dispatched_at).getTime() }));
  const missed = d.some((x) => x.slot === "missed");
  let live = 0;
  if (needLive && !s[0] && dispatches.length) live = await liveRunsSince(env, WORKFLOWS[pipeline], Math.min(...dispatches.map((x) => x.at)));
  let dead = null;
  if (needLive && s[0] && s[0].status === "claimed") {
    const done = await runCompleted(env, s[0].github_run_id);
    if (done) dead = { run_id: s[0].github_run_id, conclusion: done };
  }
  return { status: s[0] ? s[0].status : null, dispatches, live, missed, dead };
}
// window in which a dead claim may still be recovered (one forced re-dispatch)
function recoveryOpen(pipeline, plan, now) {
  if (pipeline === "P2A" || pipeline === "P2B") return now < plan.p2b_latest;
  if (pipeline === "P3") return !plan.p3_never_after || now < plan.p3_never_after;
  return false;
}
async function closeStaleClaim(sql, env, pipeline, key, plan, now, st, dryRun) {
  const note = ` [stale claim closed by scheduler at ${new Date(now).toISOString()}: run ${st.dead.run_id} ended (${st.dead.conclusion}) without recording its result]`;
  if (dryRun) return { pipeline, run_key: key, action: "stale_claim_closed", dry_run: true, detail: note };
  await sql`UPDATE nba_control.pipeline_runs SET status='failure', finished_at=now(), note=coalesce(note,'') || ${note}
            WHERE pipeline=${pipeline} AND run_key=${key}::date AND status='claimed' AND github_run_id=${st.dead.run_id}`;
  await log(sql, "stale", pipeline, key, "stale_claim_closed", note);
  if (!recoveryOpen(pipeline, plan, now)) { await log(sql, "stale", pipeline, key, "recovery_window_closed", "dead claim closed, no re-dispatch"); return { pipeline, run_key: key, action: "stale_claim_closed", recovered: false }; }
  const ins = await sql`INSERT INTO nba_control.scheduler_dispatches (pipeline, run_key, slot) VALUES (${pipeline}, ${key}::date, 'recovery-1')
                        ON CONFLICT (pipeline, run_key, slot) DO NOTHING RETURNING pipeline`;
  if (!ins[0]) return { pipeline, run_key: key, action: "stale_claim_closed", recovered: false, reason: "recovery already used" };
  const res = await dispatch(env, WORKFLOWS[pipeline], { force: "true" });
  if (!res.ok) {
    await sql`DELETE FROM nba_control.scheduler_dispatches WHERE pipeline=${pipeline} AND run_key=${key}::date AND slot='recovery-1'`;
    await log(sql, "recovery-1", pipeline, key, "dispatch_failed_will_retry", res.detail);
    return { pipeline, run_key: key, action: "recovery_dispatch_failed", detail: res.detail };
  }
  await sql`UPDATE nba_control.scheduler_dispatches SET ok=true, detail='forced recovery of a dead claim' WHERE pipeline=${pipeline} AND run_key=${key}::date AND slot='recovery-1'`;
  await log(sql, "recovery-1", pipeline, key, "recovery_dispatched", `force=true after run ${st.dead.run_id} (${st.dead.conclusion})`);
  return { pipeline, run_key: key, action: "recovery_dispatched" };
}

async function act(sql, env, pipeline, key, dec, dryRun) {
  if (dryRun) return { pipeline, run_key: key, ...dec, dry_run: true };
  if (dec.action === "missed") {
    const ins = await sql`INSERT INTO nba_control.scheduler_dispatches (pipeline, run_key, slot, ok, detail) VALUES (${pipeline}, ${key}::date, 'missed', false, ${dec.reason})
                          ON CONFLICT DO NOTHING RETURNING pipeline`;
    if (ins[0]) await log(sql, "missed", pipeline, key, "missed", dec.reason);
    return { pipeline, run_key: key, ...dec };
  }
  if (dec.action !== "dispatch" && dec.action !== "watchdog") return { pipeline, run_key: key, ...dec };
  const ins = await sql`INSERT INTO nba_control.scheduler_dispatches (pipeline, run_key, slot) VALUES (${pipeline}, ${key}::date, ${dec.slot})
                        ON CONFLICT (pipeline, run_key, slot) DO NOTHING RETURNING pipeline`;
  if (!ins[0]) return { pipeline, run_key: key, action: "skip", reason: "duplicate fire - this slot already dispatched" };
  const res = await dispatch(env, WORKFLOWS[pipeline]);
  if (!res.ok) {
    // remove the slot record so the next tick retries; a kept record would be read as "already dispatched"
    await sql`DELETE FROM nba_control.scheduler_dispatches WHERE pipeline=${pipeline} AND run_key=${key}::date AND slot=${dec.slot}`;
    await log(sql, dec.slot, pipeline, key, "dispatch_failed_will_retry", res.detail);
    return { pipeline, run_key: key, action: "dispatch_failed_will_retry", reason: dec.reason, detail: res.detail };
  }
  await sql`UPDATE nba_control.scheduler_dispatches SET ok=true, detail=${dec.reason} WHERE pipeline=${pipeline} AND run_key=${key}::date AND slot=${dec.slot}`;
  const action = dec.action === "dispatch" ? "dispatched" : "watchdog_redispatched";
  await log(sql, dec.slot, pipeline, key, action, dec.reason);
  return { pipeline, run_key: key, action, reason: dec.reason };
}

async function tick(env, now, dryRun = false) {
  const sql = pg(env);
  const out = [];
  try {
    await ensureSchema(sql);
    if (!dryRun) await sql`UPDATE nba_control.scheduler_switch SET last_tick=now() WHERE id=1`;
    const sw = await sql`SELECT enabled FROM nba_control.scheduler_switch WHERE id=1`;
    if (!sw[0] || !sw[0].enabled) return { ok: true, at_utc: new Date(now).toISOString(), disabled: true };
    const date = ptDate(now);
    const plan = computePlan(date, await firstTip(sql, date));
    if (!dryRun) {
      await sql`INSERT INTO nba_control.scheduler_plan (run_key, first_tip, p2a, p2b, p3, p3_deadline)
                VALUES (${date}::date, ${plan.first_tip ? new Date(plan.first_tip) : null}, ${new Date(plan.p2a)}, ${new Date(plan.p2b)}, ${new Date(plan.p3)}, ${new Date(plan.p3_deadline)})
                ON CONFLICT (run_key) DO UPDATE SET first_tip=EXCLUDED.first_tip, p2a=EXCLUDED.p2a, p2b=EXCLUDED.p2b, p3=EXCLUDED.p3, p3_deadline=EXCLUDED.p3_deadline, computed_at=now()
                WHERE nba_control.scheduler_plan.p3 IS DISTINCT FROM EXCLUDED.p3 OR nba_control.scheduler_plan.p2b IS DISTINCT FROM EXCLUDED.p2b
                   OR nba_control.scheduler_plan.p2a IS DISTINCT FROM EXCLUDED.p2a OR nba_control.scheduler_plan.first_tip IS DISTINCT FROM EXCLUDED.first_tip`;
    }
    const states = {};
    for (const p of ["P2A", "P2B", "P3"]) states[p] = await pipelineState(sql, env, p, date, true);
    for (const p of ["P2A", "P2B", "P3"]) {
      if (states[p].dead) {                       // a claimed slate whose run already ended: close it, recover once
        const rec = await closeStaleClaim(sql, env, p, date, plan, now, states[p], dryRun);
        out.push(rec);
        // Round-2 P2A#9 (2026-10-08): when a forced recovery was (or will be) dispatched, the predecessor is NOT finished -
        // it is being re-run. Successors keep waiting (bounded by p2b_latest / p3_deadline as for any claimed run) instead
        // of building on logs the recovery is still loading. Only a dead claim that will not be recovered counts as finished.
        const rerunning = rec.action === "recovery_dispatched" || rec.action === "recovery_dispatch_failed";
        states[p].status = rerunning ? "claimed" : "failure";
        continue;
      }
      if (states[p].missed) continue;
      const dec = decide(p, plan, now, states[p], { P2A: states.P2A.status, P2B: states.P2B.status });
      if (dec.action !== "wait" && dec.action !== "skip") out.push(await act(sql, env, p, date, dec, dryRun));
      else if (dryRun) out.push({ pipeline: p, run_key: date, ...dec });
    }
    {   // CLOSE board capture (§31c) - single-shot, no claim, no watchdog
      const cst = await pipelineState(sql, env, "CLOSE", date, false);
      if (!cst.missed) {
        const dec = decideClose(plan, now, cst.dispatches.length > 0);
        if (dec.action === "dispatch" || dec.action === "missed") out.push(await act(sql, env, "CLOSE", date, dec, dryRun));
        else if (dryRun) out.push({ pipeline: "CLOSE", run_key: date, ...dec });
      }
    }
    if (p1Due(now)) {
      const key = runKey("P1", now);
      const st = await pipelineState(sql, env, "P1", key, true);
      const dec = st.status ? { action: "skip", reason: `claimed (${st.status})` }
        : st.dispatches.length ? decide("P1", plan, now, st, {}) : { action: "dispatch", slot: "primary", reason: "Monday 19:00 UTC" };
      if (dec.action === "dispatch" || dec.action === "watchdog") out.push(await act(sql, env, "P1", key, dec, dryRun));
      else if (dryRun) out.push({ pipeline: "P1", run_key: key, ...dec });
    }
    if (!dryRun) {   // one-off test slots (may only fire the harmless audit workflow)
      const tests = await sql`SELECT id, workflow FROM nba_control.scheduler_test WHERE NOT done AND run_at <= now() ORDER BY id LIMIT 3`;
      for (const t of tests) {
        const res = t.workflow === "nba-schedule-audit.yml" ? await dispatch(env, t.workflow) : { ok: false, detail: "workflow not allowed for test slots" };
        await sql`UPDATE nba_control.scheduler_test SET done=true, result=${res.ok ? "dispatched" : res.detail} WHERE id=${t.id}`;
        await log(sql, "test", "TEST", null, res.ok ? "test_dispatched" : "test_failed", res.ok ? t.workflow : res.detail);
      }
    }
    return { ok: true, at_utc: new Date(now).toISOString(), plan: fmtPlan(plan), results: out };
  } catch (e) {
    return { ok: false, at_utc: new Date(now).toISOString(), error: String(e && e.message || e).slice(0, 400) };
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }
}
function fmtPt(ms) { if (!ms) return null; const p = ptParts(ms); return `${p.date} ${String(p.hh).padStart(2, "0")}:${String(p.mi).padStart(2, "0")} PT`; }
function fmtPlan(p) { return { date: p.date, first_tip: fmtPt(p.first_tip), p2a: fmtPt(p.p2a), p2b: fmtPt(p.p2b), p3: fmtPt(p.p3), p3_deadline: fmtPt(p.p3_deadline) }; }

function authorized(request, env) { const t = request.headers.get("x-admin-token") || ""; return env.ALPHADOG_ADMIN_TOKEN && t === env.ALPHADOG_ADMIN_TOKEN; }

export const __test = { ptParts, ptDate, ptWall, mondayOf, runKey, computePlan, decide, decideClose, p1Due, fmtPlan, recoveryOpen };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (request.method === "GET" && (path === "/" || path === "/health")) {
      const sql = pg(env);
      try {
        await ensureSchema(sql);
        const sw = await sql`SELECT enabled, last_tick FROM nba_control.scheduler_switch WHERE id=1`;
        const now = Date.now(), days = [];
        for (let i = 0; i < 7; i++) { const d = ptDate(now + i * 86400000); days.push(fmtPlan(computePlan(d, await firstTip(sql, d)))); }
        const recent = await sql`SELECT at, slot, pipeline, run_key, action, left(detail, 160) detail FROM nba_control.scheduler_log ORDER BY at DESC LIMIT 15`;
        const runs = await sql`SELECT pipeline, run_key, status, github_run_id, claimed_at, finished_at FROM nba_control.pipeline_runs ORDER BY claimed_at DESC LIMIT 10`;
        return jsonResponse({ ok: true, worker: WORKER_NAME, version: VERSION, enabled: sw[0] && sw[0].enabled, last_tick: sw[0] && sw[0].last_tick,
          github_token_present: !!(env.GITHUB_TOKEN && env.GITHUB_TOKEN !== "DISABLED"), workflows: WORKFLOWS, next_7_days: days, recent_actions: recent, recent_claims: runs });
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
      const body = await request.json().catch(() => ({}));
      return jsonResponse(await tick(env, Date.parse(body.at || new Date().toISOString()), true));
    }
    return jsonResponse({ ok: false, error: "not_found", routes: ["GET / (health)", "POST /toggle {enabled} [admin]", "POST /simulate {at} [admin]"] }, 404);
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(tick(env, controller.scheduledTime));
  },
};
