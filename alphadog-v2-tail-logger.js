const WORKER_NAME = "alphadog-v2-tail-logger";
const VERSION = "alphadog-v2-tail-logger-v0.1.0";

async function run(db, sql, ...binds) {
  const s = db.prepare(sql);
  return binds.length ? await s.bind(...binds).run() : await s.run();
}
async function all(db, sql, ...binds) {
  const s = db.prepare(sql);
  const r = binds.length ? await s.bind(...binds).all() : await s.all();
  return r.results || [];
}

async function ensureSchema(env) {
  await run(env.CONTROL_DB, `CREATE TABLE IF NOT EXISTS tail_worker_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    script_name TEXT,
    outcome TEXT,
    event_timestamp TEXT,
    cpu_time_ms REAL,
    wall_time_ms REAL,
    exceptions_json TEXT,
    logs_json TEXT,
    diagnostics_channel_events_json TEXT,
    received_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
}

function safeJson(value, max = 8000) {
  if (value === undefined || value === null) return null;
  let text;
  try { text = JSON.stringify(value); } catch (_) { text = String(value); }
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}

export default {
  // Real Cloudflare Tail Worker entrypoint - receives one array of trace events per
  // invocation of whatever worker(s) this is attached to as a tail_consumer. This is the
  // only way to see the TRUE outcome (success/exception/exceededCpu/canceled/...) of every
  // invocation, including ones triggered via service bindings (waitUntil chains), which the
  // GraphQL Analytics API does not surface.
  async tail(events, env, ctx) {
    try {
      await ensureSchema(env);
      const rows = [];
      for (const event of events) {
        const scriptName = event.scriptName || null;
        const outcome = event.outcome || null;
        const eventTimestamp = event.eventTimestamp ? new Date(event.eventTimestamp).toISOString() : null;
        const cpuMs = event.cpuTime ?? null;
        const wallMs = event.wallTime ?? null;
        const exceptions = (event.exceptions || []).map(e => ({ name: e.name, message: String(e.message || "").slice(0, 500), timestamp: e.timestamp }));
        const logs = (event.logs || []).slice(0, 20).map(l => ({ level: l.level, message: safeJson(l.message, 500), timestamp: l.timestamp }));
        rows.push({ scriptName, outcome, eventTimestamp, cpuMs, wallMs, exceptions, logs });
      }
      for (const r of rows) {
        await run(env.CONTROL_DB,
          `INSERT INTO tail_worker_events (script_name, outcome, event_timestamp, cpu_time_ms, wall_time_ms, exceptions_json, logs_json, received_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          r.scriptName, r.outcome, r.eventTimestamp, r.cpuMs, r.wallMs, safeJson(r.exceptions), safeJson(r.logs)
        );
      }
    } catch (err) {
      // Never let tail-logging failures affect anything else; best-effort only.
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (path === "/" || path === "/health") {
      return new Response(JSON.stringify({ ok: true, version: VERSION, worker_name: WORKER_NAME }), { headers: { "content-type": "application/json" } });
    }
    if (path === "/query") {
      await ensureSchema(env);
      const scriptName = url.searchParams.get("script_name");
      const limit = Math.min(200, Number(url.searchParams.get("limit") || 50));
      const minutesBack = Number(url.searchParams.get("minutes_back") || 60);
      const rows = scriptName
        ? await all(env.CONTROL_DB, `SELECT * FROM tail_worker_events WHERE script_name=? AND datetime(received_at) >= datetime('now', ?) ORDER BY received_at DESC LIMIT ?`, scriptName, `-${minutesBack} minutes`, limit)
        : await all(env.CONTROL_DB, `SELECT * FROM tail_worker_events WHERE datetime(received_at) >= datetime('now', ?) ORDER BY received_at DESC LIMIT ?`, `-${minutesBack} minutes`, limit);
      return new Response(JSON.stringify({ ok: true, row_count: rows.length, rows }, null, 2), { headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: false, status: "not_found", path }), { status: 404, headers: { "content-type": "application/json" } });
  }
};
