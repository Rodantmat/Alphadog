ALPHADOG V2 DUMMY WORKERS PACK
Version: alphadog-v2-dummy-workers-v0.1
Date: 2026-05-17
Files: 116 dummy Worker JS files

PURPOSE
These are dummy/shell Workers for the fresh AlphaDog v2 parallel environment.

They are intentionally safe:
- no real mining
- no real scoring
- no external API calls
- no writes
- no old production access
- no secret values printed

ROUTES ON EVERY WORKER
GET /
GET /health
POST /run
POST /diagnostic

DATABASE BINDINGS TO ADD TO EVERY WORKER
CONTROL_DB       -> alphadog-v2-control-db
CONFIG_DB        -> alphadog-v2-config-db
REF_DB           -> alphadog-v2-ref-db
STATS_HITTER_DB  -> alphadog-v2-stats-hitter-db
STATS_PITCHER_DB -> alphadog-v2-stats-pitcher-db
TEAM_DB          -> alphadog-v2-team-db
DAILY_DB         -> alphadog-v2-daily-db
MARKET_DB        -> alphadog-v2-market-db
CONTEXT_DB       -> alphadog-v2-context-db
SCORE_DB         -> alphadog-v2-score-db
ARCHIVE_DB       -> alphadog-v2-archive-db

SECRETS TO ADD TO EVERY WORKER
ALPHADOG_ADMIN_TOKEN
ALPHADOG_INTERNAL_TOKEN
ODDS_API_KEY
PARLAY_API_KEY
GEMINI_API_KEY
GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO
GITHUB_BRANCH
GITHUB_PRIZEPICKS_PATH
MLB_API_USER_AGENT

VARIABLES TO ADD TO EVERY WORKER
SYSTEM_ENV = production
SYSTEM_FAMILY = alphadog-v2
SYSTEM_VERSION = v2.0.0
SYSTEM_TIMEZONE = America/Los_Angeles
ACTIVE_SPORT = MLB
ACTIVE_SEASON = 2026
DEFAULT_DAY_SCOPE = TODAY_TOMORROW
DEFAULT_SLATE_MODE = AUTO
ODDS_API_BASE_URL = https://api.the-odds-api.com/v4
PARLAY_API_BASE_URL = https://parlay-api.com/v1
MLB_API_BASE_URL = https://statsapi.mlb.com/api/v1
PRIZEPICKS_SOURCE_MODE = GITHUB
MAX_TICK_MS = 20000
MAX_API_CALLS_PER_TICK = 20
MAX_ROWS_PER_TICK = 250
LOCK_STALE_MINUTES = 15
WORKER_SAFE_MODE = 1
DEBUG_MODE = 1
MANUAL_SQL_ENABLED = 1
CONFIG_PHASE = 1

BASIC TEST
Open each Worker URL:
GET /

Expected:
status = DUMMY_READY

Then test:
GET /health

Expected:
db_bindings all true after bindings are added.
vars all true after variables are added.
secrets_present_only all true after secrets are added.

IMPORTANT
These files are flat on purpose.
No subfolders.
