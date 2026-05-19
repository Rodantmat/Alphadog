ALPHADOG V2 SCHEMA PHASE PACK
Version: alphadog-v2-schema-phase-pack-v0.1
Date: 2026-05-18
Flat-folder package.

PURPOSE
Install the first AlphaDog v2 schema foundation into the 11 new D1 databases.

THIS PACK TOUCHES ONLY NEW V2 DATABASES
It does not touch the old production database.

DATABASES TARGETED
- alphadog-v2-control-db
- alphadog-v2-config-db
- alphadog-v2-ref-db
- alphadog-v2-stats-hitter-db
- alphadog-v2-stats-pitcher-db
- alphadog-v2-team-db
- alphadog-v2-daily-db
- alphadog-v2-market-db
- alphadog-v2-context-db
- alphadog-v2-score-db
- alphadog-v2-archive-db

WHAT IT INSTALLS
CONTROL_DB:
- control_system_state
- control_worker_registry
- control_job_queue
- control_job_runs
- control_worker_run_log
- control_certification_status
- control_phase_state
- control_locks
- control_action_log
- control_health_snapshots
- control_schema_migrations

CONFIG_DB:
- config_system_settings
- config_feature_flags
- config_worker_definitions
- config_worker_schedules
- config_prop_taxonomy
- config_market_sources
- config_line_shape_policy
- config_certification_rules
- config_scoring_profiles
- config_scoring_rules
- config_source_priority
- config_refresh_windows
- config_schema_migrations

OTHER DBS:
Starter schemas for ref, hitter stats, pitcher stats, team, daily, market, context, score, and archive.

SEEDS
- 116 worker registry rows in CONTROL_DB
- 116 worker definition rows in CONFIG_DB
- 19 prop taxonomy rows
- 7 market/source rows
- 6 certification rules
- starter schedule config rows
- starter system settings
- initial GLOBAL state

HOW TO USE

1. Extract this ZIP into:
C:\2\V2

2. Make sure Wrangler works:
npx wrangler --version

3. Apply schema:
python apply_schema_all.py

4. Verify schema:
python verify_schema_all.py

EXPECTED VERIFY RESULT:
Schema verify passed

OUTPUT FILE:
schema_verify_results.json

IMPORTANT
If apply_schema_all.py errors, stop and send the terminal output.
Do not rerun random commands.
The SQL is idempotent, so a clean rerun is safe after fixing the root cause.
