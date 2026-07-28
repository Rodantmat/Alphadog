#!/usr/bin/env python3
import json
from pathlib import Path

COMPATIBILITY_DATE = "2026-05-18"
WORKERS = json.loads(Path("worker_manifest.json").read_text(encoding="utf-8"))["workers"]
D1_BINDINGS = json.loads(Path("cloudflare_d1_bindings.json").read_text(encoding="utf-8"))["d1_databases"]
VARS = json.loads(Path("vars.production.json").read_text(encoding="utf-8"))

ORCHESTRATOR_CRONS = []  # Retired: board/daily-context/market/scoring (via master-runner),
# weekly-differential-runner, and daily-delta-runner now own all real scheduling. The
# orchestrator itself is fully retired - kept deployed only for any manual/direct-call debugging
# via its own service binding, never self-triggered again.

def service_binding_name(worker_name):
    return worker_name.replace("alphadog-v2-", "").replace("-", "_").upper() + "_WORKER"

def main_file(worker_name):
    return f"./{worker_name}.js" if Path(f"{worker_name}.js").exists() else "./worker.js"

def make_config(worker_name, include_services=False):
    # Workers fully verified migrated to Postgres, zero D1 usage anywhere in their code
    # (confirmed via direct grep of every .prepare()/env.*_DB call site - none found).
    # D1 is being deleted with no exceptions, so these get NO D1 binding at all - not even
    # the old CONTROL_DB-only exception, which was a temporary allowance from before that
    # mandate and is now obsolete. An unused binding is still "wiring to the old database".
    FULLY_MIGRATED_NO_D1_AT_ALL = (
        "alphadog-v2-prizepicks-github-board",
        "alphadog-v2-parlay-sleeper-board",
        "alphadog-v2-parlay-underdog-board",
        "alphadog-v2-score-prep",
        "alphadog-v2-daily-certifier",
        "alphadog-v2-daily-probable-pitchers",
        "alphadog-v2-daily-lineups",
        "alphadog-v2-daily-player-availability",
        "alphadog-v2-daily-weather",
        "alphadog-v2-daily-bullpen-availability",
        "alphadog-v2-daily-schedule",
        "alphadog-v2-daily-usage-pulse",
        "alphadog-v2-market-normalizer",
        "alphadog-v2-market-line-shape-classifier",
        "alphadog-v2-market-certifier",
    )
    cfg = {
        "$schema": "node_modules/wrangler/config-schema.json",
        "name": worker_name,
        "main": main_file(worker_name),
        "compatibility_date": COMPATIBILITY_DATE,
        "observability": {"enabled": True},
        "vars": VARS,
        "d1_databases": [] if worker_name in FULLY_MIGRATED_NO_D1_AT_ALL else D1_BINDINGS
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
            {"binding": "BASE_HITTER_GAME_LOGS_WORKER", "service": "alphadog-v2-base-hitter-game-logs"},
            {"binding": "BOARD_RUNNER_WORKER", "service": "alphadog-v2-board-runner"},
            {"binding": "DAILY_CONTEXT_RUNNER_WORKER", "service": "alphadog-v2-daily-context-runner"},
            {"binding": "MARKET_RUNNER_WORKER", "service": "alphadog-v2-market-runner"},
            {"binding": "SCORING_RUNNER_WORKER", "service": "alphadog-v2-scoring-runner"},
            {"binding": "MASTER_RUNNER_WORKER", "service": "alphadog-v2-master-runner"},
            {"binding": "SCORE_PREP_WORKER", "service": "alphadog-v2-score-prep"},
            {"binding": "WEEKLY_DIFFERENTIAL_RUNNER_WORKER", "service": "alphadog-v2-weekly-differential-runner"},
            {"binding": "DAILY_DELTA_RUNNER_WORKER", "service": "alphadog-v2-daily-delta-runner"}
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
        # Native cron triggers RETIRED: weekly-differential-runner and daily-delta-runner now
        # own these schedules (via their own dedicated cron triggers, calling this worker
        # directly through a service binding). Leaving both active here would double-trigger
        # the exact same chains, causing the same lock-contention problem already found and
        # fixed for the old orchestrator this session.
        # cfg["triggers"] = {"crons": ["0 3 * * 1", "45 8 * * *"]}
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
        "alphadog-v2-base-certifier-postgres",
        "alphadog-v2-prizepicks-github-board",
        "alphadog-v2-parlay-sleeper-board",
        "alphadog-v2-parlay-underdog-board",
        "alphadog-v2-score-prep",
        "alphadog-v2-daily-certifier",
        "alphadog-v2-daily-probable-pitchers",
        "alphadog-v2-daily-lineups",
        "alphadog-v2-daily-player-availability",
        "alphadog-v2-daily-weather",
        "alphadog-v2-daily-bullpen-availability",
        "alphadog-v2-daily-schedule",
        "alphadog-v2-daily-usage-pulse",
        "alphadog-v2-daily-games-status",
        "alphadog-v2-market-normalizer",
        "alphadog-v2-market-line-shape-classifier",
        "alphadog-v2-market-certifier",
        "alphadog-v2-phase3b-certifier",
        "alphadog-v2-phase3a-certifier",
        "alphadog-v2-phase3c-certifier",
        "alphadog-v2-phase2a-run-environment",
        "alphadog-v2-phase2b-certifier",
        "alphadog-v2-phase2b-recent-form",
        "alphadog-v2-score-final-board",
        "alphadog-v2-certification-center",
        "alphadog-v2-board-ui",
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
    if worker_name == "alphadog-v2-certification-center":
        # Explicit, generous CPU time override. This worker builds and serves a very large
        # (~578KB) HTML response by string-concatenating a giant template literal at request
        # time - if this exceeds the platform's default CPU budget (30s on paid tier, or the
        # strict 10ms free-tier limit if this worker is somehow on that tier), the worker gets
        # silently killed mid-response with no error surfaced to the client - which would
        # explain a large HTML/script payload appearing to "load" (headers + partial body sent)
        # while never actually delivering/executing the trailing <script> block. Must live in
        # the generator or it gets wiped on every deploy before Wrangler even runs.
        cfg["limits"] = {"cpu_ms": 300000}
        # Service bindings so this UI worker can directly trigger calibration functions and
        # scoped health-dashboard reruns (Health/Calibration are explicitly not read-only).
        cfg["services"] = [
            {"binding": "PHASE3A_WORKER", "service": "alphadog-v2-phase3a-first-inning-pitcher-context"},
            {"binding": "BOARD_RUNNER_WORKER", "service": "alphadog-v2-board-runner"},
            {"binding": "DAILY_CONTEXT_RUNNER_WORKER", "service": "alphadog-v2-daily-context-runner"},
            {"binding": "MARKET_RUNNER_WORKER", "service": "alphadog-v2-market-runner"},
            {"binding": "SCORING_RUNNER_WORKER", "service": "alphadog-v2-scoring-runner"},
            {"binding": "WEEKLY_DIFFERENTIAL_RUNNER_WORKER", "service": "alphadog-v2-weekly-differential-runner"},
            {"binding": "DAILY_DELTA_RUNNER_WORKER", "service": "alphadog-v2-daily-delta-runner"}
        ]
    if worker_name == "alphadog-v2-board-runner":
        # New, deliberately simple standalone runner for board-full-run only (separate from the
        # legacy orchestrator's queue-table/lock-table machinery). No D1, no shared vars - it only
        # needs service bindings to the 4 stage workers it calls directly in sequence, and a raised
        # cpu_ms ceiling for headroom (the work itself is I/O-bound, so this is mostly precautionary).
        cfg["vars"] = {}
        cfg["d1_databases"] = []
        cfg["limits"] = {"cpu_ms": 300000}
        cfg["hyperdrive"] = [
            {"binding": "HYPERDRIVE", "id": "f6c6e778ebfe4dfa8e17d7effbeaff8b"}
        ]
        cfg["compatibility_flags"] = ["nodejs_compat"]
        cfg["services"] = [
            {"binding": "PRIZEPICKS_GITHUB_BOARD_WORKER", "service": "alphadog-v2-prizepicks-github-board"},
            {"binding": "PARLAY_SLEEPER_BOARD_WORKER", "service": "alphadog-v2-parlay-sleeper-board"},
            {"binding": "PARLAY_UNDERDOG_BOARD_WORKER", "service": "alphadog-v2-parlay-underdog-board"},
            {"binding": "SCORE_PREP_WORKER", "service": "alphadog-v2-score-prep"},
        ]
        # TEMPORARY for initial testing only - will be replaced with the real 3x/day schedule
        # once this is verified working end to end.
        # Cron disabled during direct-trigger testing (see run_job -> BOARD_RUNNER_WORKER) to avoid
        # overlapping runs fighting over the same Postgres connections. Will be re-enabled as part
        # of the single master runner's schedule once board/daily-context/market/scoring are all
        # chained together.
        # cfg["triggers"] = {"crons": ["*/5 * * * *"]}
    if worker_name == "alphadog-v2-daily-context-runner":
        # New, deliberately simple standalone runner for daily-context-full-run only, same design
        # as board-runner: no queue table, no lock table, just sequential awaited service-binding
        # calls to the 9-stage sequence (daily-certifier is called twice, first pass and final pass).
        cfg["vars"] = {}
        cfg["d1_databases"] = []
        cfg["limits"] = {"cpu_ms": 300000}
        cfg["hyperdrive"] = [
            {"binding": "HYPERDRIVE", "id": "f6c6e778ebfe4dfa8e17d7effbeaff8b"}
        ]
        cfg["compatibility_flags"] = ["nodejs_compat"]
        cfg["services"] = [
            {"binding": "DAILY_CERTIFIER_WORKER", "service": "alphadog-v2-daily-certifier"},
            {"binding": "DAILY_GAMES_STATUS_WORKER", "service": "alphadog-v2-daily-games-status"},
            {"binding": "DAILY_PROBABLE_PITCHERS_WORKER", "service": "alphadog-v2-daily-probable-pitchers"},
            {"binding": "DAILY_LINEUPS_WORKER", "service": "alphadog-v2-daily-lineups"},
            {"binding": "DAILY_PLAYER_AVAILABILITY_WORKER", "service": "alphadog-v2-daily-player-availability"},
            {"binding": "DAILY_WEATHER_WORKER", "service": "alphadog-v2-daily-weather"},
            {"binding": "DAILY_BULLPEN_AVAILABILITY_WORKER", "service": "alphadog-v2-daily-bullpen-availability"},
            {"binding": "DAILY_SCHEDULE_WORKER", "service": "alphadog-v2-daily-schedule"},
            {"binding": "DAILY_USAGE_PULSE_WORKER", "service": "alphadog-v2-daily-usage-pulse"},
        ]
        # No cron yet - testing via direct run_job trigger first, same lesson learned from
        # board-runner (avoid overlapping runs fighting over connections).
    if worker_name == "alphadog-v2-market-runner":
        # New, deliberately simple standalone runner for market-full-run only, same design as
        # board-runner/daily-context-runner: no queue table, no lock table, just sequential
        # awaited service-binding calls to the 5-stage sequence (market-certifier called twice,
        # first pass and final pass; market-line-shape-classifier called twice, hitters then
        # pitchers).
        cfg["vars"] = {}
        cfg["d1_databases"] = []
        cfg["limits"] = {"cpu_ms": 300000}
        cfg["hyperdrive"] = [
            {"binding": "HYPERDRIVE", "id": "f6c6e778ebfe4dfa8e17d7effbeaff8b"}
        ]
        cfg["compatibility_flags"] = ["nodejs_compat"]
        cfg["services"] = [
            {"binding": "MARKET_CERTIFIER_WORKER", "service": "alphadog-v2-market-certifier"},
            {"binding": "MARKET_NORMALIZER_WORKER", "service": "alphadog-v2-market-normalizer"},
            {"binding": "MARKET_LINE_SHAPE_CLASSIFIER_WORKER", "service": "alphadog-v2-market-line-shape-classifier"},
        ]
        # No cron yet - testing via direct run_job trigger first.
    if worker_name == "alphadog-v2-scoring-runner":
        # New, deliberately simple standalone runner for scoring-full-run only, same design as
        # the other three runners: no queue table, no lock table, just sequential awaited
        # service-binding calls through the 9-stage dependency chain (scoring-full-run-certifier
        # called twice, prop-factor-miner called twice for hitter then pitcher).
        cfg["vars"] = {}
        cfg["d1_databases"] = []
        cfg["limits"] = {"cpu_ms": 300000}
        cfg["hyperdrive"] = [
            {"binding": "HYPERDRIVE", "id": "f6c6e778ebfe4dfa8e17d7effbeaff8b"}
        ]
        cfg["compatibility_flags"] = ["nodejs_compat"]
        cfg["services"] = [
            {"binding": "SCORING_CERTIFIER_WORKER", "service": "alphadog-v2-phase3b-certifier"},
            {"binding": "PROP_FACTOR_MINER_WORKER", "service": "alphadog-v2-phase2b-recent-form"},
            {"binding": "MATRIX_BUILDER_WORKER", "service": "alphadog-v2-phase2b-certifier"},
            {"binding": "ENRICHMENT_ENGINE_WORKER", "service": "alphadog-v2-phase2a-run-environment"},
            {"binding": "HIT_PROBABILITY_BOARD_WORKER", "service": "alphadog-v2-phase3c-certifier"},
            {"binding": "SCORING_ENGINE_WORKER", "service": "alphadog-v2-phase3a-certifier"},
            {"binding": "SCORE_FINAL_BOARD_WORKER", "service": "alphadog-v2-score-final-board"},
        ]
        # No cron yet - testing via direct run_job trigger first.
    if worker_name == "alphadog-v2-master-runner":
        # New, deliberately simple standalone runner that chains the four individual full-run
        # workers in sequence: board -> daily-context -> market -> scoring. Same design as the
        # runners it calls: no queue table, no lock table, single request start to finish.
        cfg["vars"] = {}
        cfg["d1_databases"] = []
        cfg["limits"] = {"cpu_ms": 300000}
        cfg["hyperdrive"] = [
            {"binding": "HYPERDRIVE", "id": "f6c6e778ebfe4dfa8e17d7effbeaff8b"}
        ]
        cfg["compatibility_flags"] = ["nodejs_compat"]
        cfg["services"] = [
            {"binding": "BOARD_RUNNER_WORKER", "service": "alphadog-v2-board-runner"},
            {"binding": "DAILY_CONTEXT_RUNNER_WORKER", "service": "alphadog-v2-daily-context-runner"},
            {"binding": "MARKET_RUNNER_WORKER", "service": "alphadog-v2-market-runner"},
            {"binding": "SCORING_RUNNER_WORKER", "service": "alphadog-v2-scoring-runner"},
        ]
        # Real 3x/day schedule per config.scheduled_jobs (board_full_run_0900_pt/1300_pt/2200_pt):
        # 09:00, 13:00, 22:00 America/Los_Angeles (PDT, UTC-7 in July) = 16:00, 20:00, 05:00 UTC.
        cfg["triggers"] = {"crons": ["0 16 * * *", "0 20 * * *", "0 5 * * *"]}
    if worker_name == "alphadog-v2-weekly-differential-runner":
        # New, deliberately simple standalone runner for the weekly static differential, same
        # design as the other runners: no queue table, no lock table beyond the shared
        # control.runner_locks table, preflight cleanup, single service binding to the one worker
        # that owns this whole chain internally (its own 13-step resume sequence).
        cfg["vars"] = {}
        cfg["d1_databases"] = []
        cfg["limits"] = {"cpu_ms": 300000}
        cfg["hyperdrive"] = [
            {"binding": "HYPERDRIVE", "id": "f6c6e778ebfe4dfa8e17d7effbeaff8b"}
        ]
        cfg["compatibility_flags"] = ["nodejs_compat"]
        cfg["services"] = [
            {"binding": "PHASE3A_WORKER", "service": "alphadog-v2-phase3a-first-inning-pitcher-context"},
        ]
        # Real schedule: 2:00 AM Pacific Monday (PDT, UTC-7 in July) = 09:00 UTC Monday. Corrected
        # 2026-07-27: was "0 3 * * 1" (3am UTC Monday = 8pm PT SUNDAY, the wrong day and 6 hours
        # off from the documented "Monday 2am PT" intent) - confirmed this caused the run to be
        # missed/mistimed relative to expectation.
        cfg["triggers"] = {"crons": ["0 9 * * 1"]}
    if worker_name == "alphadog-v2-daily-delta-runner":
        # New, deliberately simple standalone runner for the daily morning delta, same design as
        # weekly-differential-runner: single service binding to the one worker that owns this
        # whole chain internally (its own 6-step resume sequence).
        cfg["vars"] = {}
        cfg["d1_databases"] = []
        cfg["limits"] = {"cpu_ms": 300000}
        cfg["hyperdrive"] = [
            {"binding": "HYPERDRIVE", "id": "f6c6e778ebfe4dfa8e17d7effbeaff8b"}
        ]
        cfg["compatibility_flags"] = ["nodejs_compat"]
        cfg["services"] = [
            {"binding": "PHASE3A_WORKER", "service": "alphadog-v2-phase3a-first-inning-pitcher-context"},
            {"binding": "BASE_CLASSIFICATION_V5_WORKER", "service": "alphadog-v2-base-classification-v5"},
            {"binding": "OUTCOME_GRADER_WORKER", "service": "alphadog-v2-outcome-grader"},
        ]
        # Real schedule: 7:00 AM Pacific (PDT, UTC-7 in July) = 14:00 UTC. Moved from 1:45 AM PT
        # (the original "45 8 * * *" UTC time, matching the old scheduled() dispatch) per explicit
        # request - the run is fast now, and 7 AM gives more complete previous-night game data
        # (box scores, final stats) time to settle before this pulls it.
        cfg["triggers"] = {"crons": ["0 14 * * *"]}
    if worker_name == "alphadog-v2-outcome-grader":
        # New, deliberately isolated worker: grades yesterday's board legs against already-mined
        # real game logs (stats_hitter.game_logs / stats_pitcher.game_logs) and writes results to
        # score.prop_outcome_history only - the table calibration_report reads to validate/fit
        # corrections. Never touches score.final_board_current, hp_board_current, or any table
        # read by the live scoring path, so a bug here cannot affect today's live board.
        cfg["vars"] = {}
        cfg["d1_databases"] = []
        cfg["limits"] = {"cpu_ms": 60000}
        cfg["hyperdrive"] = [
            {"binding": "HYPERDRIVE", "id": "f6c6e778ebfe4dfa8e17d7effbeaff8b"}
        ]
        cfg["compatibility_flags"] = ["nodejs_compat"]
        # Enabled after manual verification: run 6+ times across 4 different dates (July 24-27),
        # confirmed idempotent (ON CONFLICT DO NOTHING, safe re-runs) and confirmed the live board
        # (score.final_board_current) is completely unaffected across every test. Scheduled 15
        # minutes after daily-delta-runner's 14:00 UTC (7am Pacific) run, so the real box-score
        # stats it depends on (stats_hitter/pitcher.game_logs) are freshly mined first.
        cfg["triggers"] = {"crons": ["15 14 * * *"]}
    if worker_name == "alphadog-v2-calibration-scheduler":
        # New, deliberately tiny and separate worker: only job is to call the already-existing,
        # already-safe calibration_report mode on alphadog-v2-phase3a-first-inning-pitcher-context
        # via service binding, on a schedule. Never edits that file directly - kept fully isolated
        # from it given it caused a production hang earlier this session when modified live.
        # No D1, no Hyperdrive - this worker never touches the database itself.
        cfg["vars"] = {}
        cfg["d1_databases"] = []
        cfg["limits"] = {"cpu_ms": 60000}
        cfg["services"] = [
            {"binding": "PHASE3A_WORKER", "service": "alphadog-v2-phase3a-first-inning-pitcher-context"}
        ]
        cfg["hyperdrive"] = [
            {"binding": "HYPERDRIVE", "id": "f6c6e778ebfe4dfa8e17d7effbeaff8b"}
        ]
        # 14:30 UTC = 15 minutes after outcome-grader (14:15), 30 after daily-delta-runner (14:00).
        # Full daily loop: mine real stats -> grade outcomes -> check/report calibration.
        cfg["triggers"] = {"crons": ["30 14 * * *"]}
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
