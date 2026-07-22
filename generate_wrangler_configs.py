#!/usr/bin/env python3
import json
from pathlib import Path

COMPATIBILITY_DATE = "2026-05-18"
WORKERS = json.loads(Path("worker_manifest.json").read_text(encoding="utf-8"))["workers"]
D1_BINDINGS = json.loads(Path("cloudflare_d1_bindings.json").read_text(encoding="utf-8"))["d1_databases"]
VARS = json.loads(Path("vars.production.json").read_text(encoding="utf-8"))

ORCHESTRATOR_CRONS = ["* * * * *","0 8 * * *","0 9 * * *","15 4 * * *","45 8 * * *","0 12 * * *","30 15 * * *","0 3 * * 1"]

def service_binding_name(worker_name):
    return worker_name.replace("alphadog-v2-", "").replace("-", "_").upper() + "_WORKER"

def main_file(worker_name):
    return f"./{worker_name}.js" if Path(f"{worker_name}.js").exists() else "./worker.js"

def make_config(worker_name, include_services=False):
    cfg = {
        "$schema": "node_modules/wrangler/config-schema.json",
        "name": worker_name,
        "main": main_file(worker_name),
        "compatibility_date": COMPATIBILITY_DATE,
        "observability": {"enabled": True},
        "vars": VARS,
        "d1_databases": D1_BINDINGS
    }
    if worker_name == "alphadog-v2-orchestrator":
        cfg["triggers"] = {"crons": ORCHESTRATOR_CRONS}
        # Real diagnostic: stream every invocation's true outcome (success/exception/
        # exceededCpu/canceled), including service-binding-triggered ones inside waitUntil
        # chains, to alphadog-v2-tail-logger for later querying - the GraphQL Analytics API
        # does not surface these at all (confirmed live: known-successful service-bound
        # invocations show zero rows there).
        cfg["tail_consumers"] = [{"service": "alphadog-v2-tail-logger"}]
    if worker_name == "alphadog-v2-control-room":
        # Required for ORCHESTRATOR > Wake / Control Room hot-start.
        # The GitHub workflow regenerates wrangler files before deploy, so this binding
        # must live in the generator or it will be erased before Wrangler deploys.
        cfg["services"] = [
            {"binding": "ORCHESTRATOR_WORKER", "service": "alphadog-v2-orchestrator"}
        ]
    if worker_name == "alphadog-v2-admin-sql":
        # This worker doubles as the Claude MCP bridge (agents/MCP SDK).
        # Same reason as control-room above: this must live in the generator
        # or it gets wiped on every deploy before Wrangler even runs.
        # Hyperdrive added so the bridge can offer a read-only Postgres query tool
        # (run_sql_postgres) for verifying what's already migrated/backfilled on the
        # new database, mirroring the existing D1 run_sql tool. Same Hyperdrive id
        # used by every other Postgres-cutover worker.
        cfg["hyperdrive"] = [
            {"binding": "HYPERDRIVE", "id": "f6c6e778ebfe4dfa8e17d7effbeaff8b"}
        ]
        cfg["compatibility_flags"] = ["nodejs_compat"]
        cfg["services"] = [
            {"binding": "CONTROL_ROOM", "service": "alphadog-v2-control-room"},
            {"binding": "PHASE3A_WORKER", "service": "alphadog-v2-phase3a-first-inning-pitcher-context"},
            {"binding": "ORCHESTRATOR_WORKER", "service": "alphadog-v2-orchestrator"},
            {"binding": "BASE_HITTER_GAME_LOGS_WORKER", "service": "alphadog-v2-base-hitter-game-logs"}
        ]
        cfg["durable_objects"] = {
            "bindings": [
                {"name": "MCP_OBJECT", "class_name": "AlphadogMcp"}
            ]
        }
        cfg["migrations"] = [
            {"tag": "v1", "new_sqlite_classes": ["AlphadogMcp"]}
        ]
    if worker_name == "alphadog-v2-phase3a-first-inning-pitcher-context":
        # Hyperdrive binding for the DigitalOcean managed Postgres instance
        # (config name "alphadog-postgres"). Placed here (not on the standalone
        # alphadog-v2-postgres-migration worker) because this worker is the one
        # actually invocable via the existing PHASE3A_WORKER run_job routing -
        # same reason the Savant quality-of-contact miner mode lives here too.
        # Must live in the generator or it gets wiped on every deploy before
        # Wrangler even runs.
        cfg["hyperdrive"] = [
            {"binding": "HYPERDRIVE", "id": "f6c6e778ebfe4dfa8e17d7effbeaff8b"}
        ]
        cfg["compatibility_flags"] = ["nodejs_compat"]
        # Native cron triggers for the Postgres weekly static differential (Monday 3am,
        # matching the existing sched_static_weekly convention) and daily morning delta
        # (8:45am, matching sched_daily_morning). Dispatched independently of the legacy
        # orchestrator's hardcoded per-worker tick logic - see this worker's own
        # scheduled() handler for the event.cron -> mode mapping. Must live in the
        # generator or it gets wiped on every deploy before Wrangler even runs.
        cfg["triggers"] = {"crons": ["0 3 * * 1", "45 8 * * *"]}
    if worker_name == "alphadog-v2-parlay-underdog-board":
        # Same reason as control-room/admin-sql above: worker-specific vars must live in the
        # generator or they get wiped on every deploy before Wrangler even runs. NOTE: the
        # Sleeper board worker (alphadog-v2-parlay-sleeper-board) has this same unprotected gap
        # already - not fixed here (out of scope for this change), but worth knowing about.
        cfg["vars"] = dict(VARS)
        cfg["vars"]["PARLAY_UNDERDOG_PROBE_ENDPOINT"] = "/sports/baseball_mlb/props?bookmakers=underdog"
        cfg["vars"]["PARLAY_API_UNDERDOG_ENDPOINT"] = "/sports/baseball_mlb/props?bookmakers=underdog"
        cfg["vars"]["PARLAY_API_AUTH_HEADER_NAME"] = "X-API-Key"
        cfg["vars"]["PARLAY_API_AUTH_HEADER_PREFIX"] = ""
        cfg["vars"]["UNDERDOG_PROVIDER"] = "PARLAY_API"
    if worker_name in (
        "alphadog-v2-static-teams",
        "alphadog-v2-static-stadiums",
        "alphadog-v2-static-park-factors",
        "alphadog-v2-static-prop-taxonomy",
        "alphadog-v2-static-certifier",
        "alphadog-v2-static-player-aliases",
        "alphadog-v2-delta-bullpen-update",
        "alphadog-v2-static-players",
        "alphadog-v2-orchestrator",
        "alphadog-v2-base-hitter-game-logs",
        "alphadog-v2-base-pitcher-game-logs",
        "alphadog-v2-base-team-game-logs",
        "alphadog-v2-base-starter-history",
        "alphadog-v2-base-bullpen-history",
        "alphadog-v2-base-hitter-splits",
        "alphadog-v2-base-pitcher-splits",
        "alphadog-v2-base-hitter-metrics",
        "alphadog-v2-base-pitcher-metrics",
        "alphadog-v2-base-expansion-mining",
        "alphadog-v2-base-classification-v5",
        "alphadog-v2-base-baseline",
        "alphadog-v2-base-game-calendar",
    ):
        # Postgres cutover (static-full-run chain, stages 1-4 so far): these workers now read/
        # write DigitalOcean Postgres via Hyperdrive instead of their old D1 tables. Same reason
        # as every other special case above - this MUST live in the generator or it gets wiped
        # on every deploy before Wrangler even runs. Root-caused live: earlier manual edits to
        # the wrangler.*.jsonc files directly were silently erased by this exact script on the
        # very next deploy, which is why production kept serving the old D1 code despite the
        # repo's .js files already being correctly rewritten.
        cfg["hyperdrive"] = [
            {"binding": "HYPERDRIVE", "id": "f6c6e778ebfe4dfa8e17d7effbeaff8b"}
        ]
        cfg["compatibility_flags"] = ["nodejs_compat"]
    if include_services and worker_name == "alphadog-v2-orchestrator":
        cfg["services"] = [
            {"binding": service_binding_name(w), "service": w}
            for w in WORKERS if w != "alphadog-v2-orchestrator"
        ]
    return cfg

generated = []
for worker in WORKERS:
    path = Path(f"wrangler.{worker}.jsonc")
    path.write_text(json.dumps(make_config(worker), indent=2), encoding="utf-8")
    generated.append(str(path))

path = Path("wrangler.alphadog-v2-orchestrator.with-services.jsonc")
path.write_text(json.dumps(make_config("alphadog-v2-orchestrator", include_services=True), indent=2), encoding="utf-8")
generated.append(str(path))

Path("generated_wrangler_files_manifest.txt").write_text("\n".join(generated) + "\n", encoding="utf-8")
print(f"Generated {len(generated)} wrangler config files.")
print("Deploy phase 1 with wrangler.<worker>.jsonc.")
print("After all workers exist, deploy orchestrator with wrangler.alphadog-v2-orchestrator.with-services.jsonc.")
