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
        # RE-ENABLED 2026-07-28: master-runner's chained single-cron-invocation approach hit
        # Cloudflare's hard 15-minute cron wall-clock ceiling (confirmed via research - this cap
        # applies regardless of ctx.waitUntil or cpu_ms) when board+daily-context+market alone
        # took ~8.5 minutes, leaving too little runway for scoring's full pipeline. Each stage now
        # gets its OWN independent cron and its OWN fresh 15-minute budget, staggered so each
        # stage has a realistic head start based on observed durations (board ~5-8 min with
        # retries, daily-context/market ~1-3 min each, scoring is the long tail and gets the most
        # runway before the next cycle 4-11 hours later).
        # RETIRED 2026-08-02: Cowork scheduled task (Claude-supervised, 3x/day at 9am/1pm/5pm,
        # game-day-aware) now owns triggering this stage instead of a blind cron - it verifies
        # real data completeness and can diagnose/fix issues live, which a cron trigger cannot.
        # IMPORTANT: must be an EXPLICIT empty array, not an omitted key - omitting cfg["triggers"]
        # does NOT clear an existing Cloudflare cron (confirmed live with master-runner's own
        # retirement this session), it leaves the previously-deployed schedule untouched.
        cfg["triggers"] = {"crons": []}
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
            {"binding": "GAME_CALENDAR_WORKER", "service": "alphadog-v2-base-game-calendar"},
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
        # T+7 minutes past each of master's 3 daily times - gives board-runner (T+0) real
        # headroom (observed 5-8 min including retries) before this stage starts.
        cfg["triggers"] = {"crons": ["7 16 * * *", "7 20 * * *", "7 5 * * *"]}
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
        # T+10 minutes past each of master's 3 daily times - after daily-context (T+7) has had
        # its own real headroom (observed 1-2 min typical).
        cfg["triggers"] = {"crons": ["10 16 * * *", "10 20 * * *", "10 5 * * *"]}
    if worker_name == "alphadog-v2-scoring-runner":
        # PART 1 of 2 (split 2026-07-29): certifier-first-pass, prop-factor-miner (hitter+pitcher),
        # matrix-builder - the heaviest, most variable stages. Split from the original single
        # 9-stage worker after its cron-triggered invocation was confirmed to exceed Cloudflare's
        # hard 15-minute cron wall-clock ceiling on a heavy day (got through matrix-builder but
        # died mid-scoring-engine, never reaching final-board). Part 2
        # (alphadog-v2-scoring-runner-part2) picks up from here and verifies this part's output
        # is fresh before proceeding - keeps the same strict, ordered cascade, just across two
        # scheduled workers instead of one, each with its own full 15-minute budget.
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
        ]
        # T+14 minutes past each of master's 3 daily times (widened from T+12 on 2026-07-30
        # after confirmed evidence of a near-miss: market's last write and scoring's first read
        # happened within 0.6 seconds of each other on a clean run - real margin, not luck, is
        # needed here). Only needs to fit 3 light stages (certifier + prop-factor x2) inside its
        # own 15-minute budget.
        cfg["triggers"] = {"crons": ["14 16 * * *", "14 20 * * *", "14 5 * * *"]}
    if worker_name == "alphadog-v2-scoring-runner-matrix":
        # PART 1b (new 2026-07-29): matrix-builder, fully isolated. Confirmed live to be the
        # real bottleneck in the scoring chain - even paired with just 2 light stages, the
        # combination exceeded a 15-minute window on a heavy real-data day. Gets its own full,
        # dedicated budget with nothing else competing for it. Verifies Part 1's prop-factor
        # packet output is fresh before proceeding (see this worker's own
        # checkPart1Freshness()).
        cfg["vars"] = {}
        cfg["d1_databases"] = []
        cfg["limits"] = {"cpu_ms": 300000}
        cfg["hyperdrive"] = [
            {"binding": "HYPERDRIVE", "id": "f6c6e778ebfe4dfa8e17d7effbeaff8b"}
        ]
        cfg["compatibility_flags"] = ["nodejs_compat"]
        cfg["services"] = [
            {"binding": "MATRIX_BUILDER_WORKER", "service": "alphadog-v2-phase2b-certifier"},
        ]
        # T+20 minutes past each of master's 3 daily times. Previously widened to T+32 to cover
        # Part 1's worst-case duration after adding time-aware pagination, but that padded every
        # normal day for a rare exception. Fixed properly instead: Matrix now waits and rechecks
        # Part 1's freshness itself (3 min apart, up to 2 retries) if it fires and finds Part 1
        # not yet ready, so the schedule can reflect typical timing (Part 1 usually settles by
        # T+17-18) while the rare slow day is handled by the wait-retry, not schedule padding.
        cfg["triggers"] = {"crons": ["20 16 * * *", "20 20 * * *", "20 5 * * *"]}
    if worker_name == "alphadog-v2-scoring-runner-part2":
        # PART 2 of 2 (new 2026-07-29): enrichment, hp-board, scoring-engine, final-board,
        # certifier-last-pass. Verifies Part 1's output (score.prop_matrix_current) is genuinely
        # fresh before proceeding - see this worker's own checkPart1Freshness() - so the cascade
        # stays strictly ordered and dependable across the two scheduled workers.
        cfg["vars"] = {}
        cfg["d1_databases"] = []
        cfg["limits"] = {"cpu_ms": 300000}
        cfg["hyperdrive"] = [
            {"binding": "HYPERDRIVE", "id": "f6c6e778ebfe4dfa8e17d7effbeaff8b"}
        ]
        cfg["compatibility_flags"] = ["nodejs_compat"]
        cfg["services"] = [
            {"binding": "ENRICHMENT_ENGINE_WORKER", "service": "alphadog-v2-phase2a-run-environment"},
            {"binding": "HIT_PROBABILITY_BOARD_WORKER", "service": "alphadog-v2-phase3c-certifier"},
            {"binding": "SCORING_ENGINE_WORKER", "service": "alphadog-v2-phase3a-certifier"},
            {"binding": "SCORE_FINAL_BOARD_WORKER", "service": "alphadog-v2-score-final-board"},
            {"binding": "SCORING_CERTIFIER_WORKER", "service": "alphadog-v2-phase3b-certifier"},
        ]
        # T+26 minutes past each of master's 3 daily times. Previously widened to T+48 to cover
        # worst-case padding, but Matrix is confirmed fast in practice (under 2 minutes typical
        # for a 9,000-row board after the parallelization fix), and this worker now waits and
        # rechecks Matrix's freshness itself (3 min apart, up to 2 retries) on the rare slow day,
        # so the schedule reflects typical timing instead of padding for an exception.
        cfg["triggers"] = {"crons": ["26 16 * * *", "26 20 * * *", "26 5 * * *"]}
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
        # RETIRED 2026-07-28: this worker's own cron chained all 4 stages inside ONE cron
        # invocation, hitting Cloudflare's hard 15-minute cron wall-clock ceiling (confirmed via
        # research, applies regardless of ctx.waitUntil) whenever the earlier stages took long
        # enough to leave insufficient runway for scoring's full pipeline. Each of the 4 stages
        # now has its own independent, staggered cron (see their own blocks above/below) so each
        # gets a full fresh 15-minute budget instead of sharing one window. This worker is kept
        # deployed and fully functional for manual/on-demand full-chain runs via run_job, just no
        # longer self-triggered on a schedule.
        # IMPORTANT: must be an EXPLICIT empty array, not an omitted key. Omitting cfg["triggers"]
        # does NOT clear an existing Cloudflare cron - it leaves whatever was previously deployed
        # untouched. Confirmed live: master-runner fired again at 05:01:02 UTC on its OLD
        # 0 16/20/5 schedule even after this line was simply commented out, because nothing told
        # Cloudflare to actually remove the existing triggers.
        cfg["triggers"] = {"crons": []}
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
        # Split into two independently-locked parts (2026-08-02): Part 1 (mining through
        # metrics) completes fully in one cron-triggered call. Part 2 (classification/baseline,
        # looped to genuine completion via its own internal self-chaining fetch calls) is NOT
        # guaranteed to finish from a single trigger alone - confirmed live that its self-chain
        # can stall and require external intervention. The scheduled() handler now checks
        # event.cron: the first (14:00 UTC) trigger runs both Part 1 and Part 2's first step;
        # the remaining crons call Part 2 ONLY, spaced ~10 minutes apart for about 50 minutes of
        # real, externally-driven retry coverage - safe to call repeatedly since Part 2's own
        # lock and persisted phase state make this idempotent (a no-op if already complete for
        # the day, or a genuine continuation if the self-chain stalled).
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
        # Real schedule: 7:00 AM Pacific (PDT, UTC-7 in July) = 14:00 UTC triggers the full
        # Part1+Part2 kickoff. Additional crons at :10/:20/:30/:40/:50 past call Part 2 only, as
        # an external safety net independent of its internal self-chain.
        cfg["triggers"] = {"crons": ["0 14 * * *", "10 14 * * *", "20 14 * * *", "30 14 * * *", "40 14 * * *", "50 14 * * *"]}
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
        # This worker now has direct Hyperdrive access too, used only to write its own execution
        # log independent of the fragile core scoring file.
        cfg["vars"] = {}
        cfg["d1_databases"] = []
        cfg["limits"] = {"cpu_ms": 60000}
        cfg["services"] = [
            {"binding": "PHASE3A_WORKER", "service": "alphadog-v2-phase3a-first-inning-pitcher-context"}
        ]
        cfg["hyperdrive"] = [
            {"binding": "HYPERDRIVE", "id": "f6c6e778ebfe4dfa8e17d7effbeaff8b"}
        ]
        cfg["compatibility_flags"] = ["nodejs_compat"]
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
