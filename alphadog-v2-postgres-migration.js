import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-postgres-migration";
const VERSION = "v0.1.0-initial";

const CHUNK_SIZE = 500;

const TABLE_PLAN = {
  market_historical_props_2025: {
    d1_binding: "MARKET_DB",
    d1_table: "market_historical_props_2025",
    pg_table: "market.historical_props_2025",
    order_by: "prop_id",
    columns: ["prop_id","game_pk","player_name","canonical_prop_key","line_value","side","price","bookmaker","official_date","raw_json","created_at"]
  },
  archive_board_leg_history: {
    d1_binding: "ARCHIVE_DB",
    d1_table: "archive_board_leg_history",
    pg_table: "archive.board_leg_history",
    order_by: "history_id",
    columns: ["history_id","final_board_row_id","mlb_player_id","canonical_prop_key","line_value","selected_side","estimated_hit_probability_0_100","score_0_100","outcome_result","official_date","archived_at"]
  },
  archive_player_availability_history: {
    d1_binding: "ARCHIVE_DB",
    d1_table: "archive_player_availability_history",
    pg_table: "archive.player_availability_history",
    order_by: "history_id",
    columns: ["history_id","mlb_player_id","official_date","availability_status","archived_at"]
  },
  config_system_settings: {
    d1_binding: "CONFIG_DB", d1_table: "config_system_settings", pg_table: "config.system_settings",
    order_by: "setting_key", columns: ["setting_key","setting_value","updated_at"]
  },
  calibration_config: {
    d1_binding: "CONFIG_DB", d1_table: "calibration_config", pg_table: "config.calibration_config",
    order_by: "config_key", columns: ["config_key","config_json","is_active","updated_at"]
  },
  config_worker_definitions: {
    d1_binding: "CONFIG_DB", d1_table: "config_worker_definitions", pg_table: "config.worker_definitions",
    order_by: "worker_name", columns: ["worker_name","definition_json","updated_at"]
  },
  config_worker_schedules: {
    d1_binding: "CONFIG_DB", d1_table: "config_worker_schedules", pg_table: "config.worker_schedules",
    order_by: "job_key", columns: ["job_key","schedule_json","updated_at"]
  },
  config_prop_taxonomy: {
    d1_binding: "CONFIG_DB", d1_table: "config_prop_taxonomy", pg_table: "config.prop_taxonomy",
    order_by: "canonical_prop_key", columns: ["canonical_prop_key","prop_family","display_label","updated_at"]
  }
};

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), { status, headers: { "content-type": "application/json" } });
}

async function readD1Chunk(env, binding, tableName, orderBy, whereClause, offset, limit) {
  const where = whereClause ? `WHERE ${whereClause}` : "";
  const sql = `SELECT * FROM ${tableName} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
  const stmt = env[binding].prepare(sql).bind(limit, offset);
  const res = await stmt.all();
  return res.results || [];
}

async function writePgChunk(sql, pgTable, columns, rows) {
  if (!rows.length) return 0;
  const conflictCol = columns[0];
  await sql`
    INSERT INTO ${sql(pgTable.split(".")[0])}.${sql(pgTable.split(".")[1])} ${sql(rows, ...columns)}
    ON CONFLICT (${sql(conflictCol)}) DO NOTHING
  `;
  return rows.length;
}

async function migrateTable(env, sql, key, startOffset) {
  const plan = TABLE_PLAN[key];
  if (!plan) return { ok: false, error: `unknown_table_key_${key}`, available: Object.keys(TABLE_PLAN) };
  let offset = startOffset || 0, totalWritten = 0, done = false;
  const startedAt = Date.now();
  const TIME_BUDGET_MS = 20000;
  while (!done) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      return { ok: true, partial: true, table: key, rows_written_this_invocation: totalWritten, next_offset: offset,
               note: "Time budget reached - call /migrate?table=" + key + "&offset=" + offset + " to continue." };
    }
    const rows = await readD1Chunk(env, plan.d1_binding, plan.d1_table, plan.order_by, plan.where, offset, CHUNK_SIZE);
    if (!rows.length) { done = true; break; }
    const written = await writePgChunk(sql, plan.pg_table, plan.columns, rows);
    totalWritten += written;
    offset += rows.length;
    if (rows.length < CHUNK_SIZE) done = true;
  }
  return { ok: true, partial: false, table: key, rows_written_total: totalWritten, complete: true };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      let pgOk = false, pgError = null, pgVersion = null;
      try {
        const sql = postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false });
        const res = await sql`SELECT version()`;
        pgVersion = res[0]?.version || null;
        pgOk = true;
        ctx.waitUntil(sql.end());
      } catch (err) {
        pgError = String(err && err.message ? err.message : err);
      }
      return jsonResponse({
        ok: pgOk, worker_name: WORKER_NAME, version: VERSION,
        hyperdrive_bound: !!env.HYPERDRIVE, postgres_connected: pgOk,
        postgres_version: pgVersion, error: pgError
      }, pgOk ? 200 : 500);
    }

    if (url.pathname === "/schema") {
      try {
        const sql = postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false });
        const ddl = await request.text();
        if (!ddl || ddl.length < 50) {
          return jsonResponse({ ok: false, error: "post_full_ddl_text_as_request_body" }, 400);
        }
        await sql.unsafe(ddl);
        ctx.waitUntil(sql.end());
        return jsonResponse({ ok: true, status: "schema_applied" });
      } catch (err) {
        return jsonResponse({ ok: false, error: String(err && err.message ? err.message : err) }, 500);
      }
    }

    if (url.pathname === "/migrate") {
      const table = url.searchParams.get("table");
      const offsetParam = url.searchParams.get("offset");
      const startOffset = offsetParam ? Number(offsetParam) : 0;
      if (!table) return jsonResponse({ ok: false, error: "missing_table_param", available: Object.keys(TABLE_PLAN) }, 400);
      try {
        const sql = postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false });
        const result = await migrateTable(env, sql, table, startOffset);
        ctx.waitUntil(sql.end());
        return jsonResponse(result);
      } catch (err) {
        return jsonResponse({ ok: false, error: String(err && err.message ? err.message : err) }, 500);
      }
    }

    return jsonResponse({ ok: false, error: "not_found", routes: ["/health", "/schema (POST, body=DDL)", "/migrate?table=<key>"] }, 404);
  }
};
