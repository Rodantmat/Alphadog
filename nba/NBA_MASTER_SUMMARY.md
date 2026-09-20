# NBA MASTER SUMMARY — every transcript, message by message

**Purpose.** A complete, per-transcript record of everything done across the whole NBA build. Nothing
summarised away: every decision, build, fix, dead end and finding, in the order it happened, with the
transcript it came from so you can go straight to the source.

**How to use it.** Each section is one transcript file in `/mnt/transcripts/`. Within a section,
entries run oldest → newest. When you need more detail than is here, open that transcript and grep the
term — the GLOSSARY maps terms to their transcript.

**Update protocol.** Every entry carries the date it was ADDED to this document, so new material is
distinguishable from old.

**PASS RULE (owner directive, binding).** A transcript is DONE only after **3 CONSECUTIVE passes that
find nothing new**. If passes 1 and 2 are clean but pass 3 finds something, the count RESTARTS at zero.
This applies per transcript and to every document.

**Pass status vocabulary**
| Marker | Meaning |
|---|---|
| `PASS n — INCOMPLETE` | pass run, found new material; not clean |
| `CLEAN 1/3`, `CLEAN 2/3` | consecutive clean passes so far |
| `DONE (3/3 clean)` | satisfied the rule |

**Known limitation of pass 1 (recorded 2026-09-20).** Pass 1 used a digest that TRUNCATED text blocks
to ~220-260 chars, showed only tool NAMES and first arguments, and **skipped `tool_result` entirely** —
which is where row counts, errors and verification output live. So pass 1 captured narrative and
decisions but NOT full SQL bodies, full reasoning, or measured results. Pass 2 uses a different
extraction (full text, full SQL, tool results included). Pass 2 is therefore expected to find new
material; it is not a rerun.

| Document | What it holds |
|---|---|
| `NBA_MASTER_SUMMARY.md` | this file — everything done, per transcript |
| `NBA_GLOSSARY.md` | every term → which transcript, which context |
| `NBA_RECIPE.md` | how the system was built, step by step |
| `NBA_SYSTEM_ARCHITECTURE.md` | workers, tools, sources, infrastructure |
| `NBA_DATABASE.md` | every table and column, what it holds |
| `NBA_WORKERS.md` | every worker/script, path, function |
| `NBA_SYSTEM_DESIGN.md` | the three pipelines in detail |
| `NBA_OPEN_ITEMS.md` | deferred, dropped, partial, bugs, caveats |

**Transcript inventory (16 files, ~44 MB, 2026-09-03 → 2026-09-19):**

| # | File | Pass status |
|---|---|---|
| 1 | `2026-09-03-03-22-04-nba-expansion-phase1-static.txt` | **PASS 1 — INCOMPLETE** |
| 2 | `2026-09-03-04-41-28-nba-expansion-phase3a-enrichment-complete.txt` | **PASS 1 — INCOMPLETE** |
| 3 | `2026-09-03-22-24-13-nba-expansion-phase3a-final-complete.txt` | pending |
| 4 | `2026-09-03-22-38-55-nba-expansion-phase3b-backfill-complete.txt` | pending |
| 5 | `2026-09-09-01-49-59-nba-expansion-phase3c-starter-status-complete.txt` | pending |
| 6 | `2026-09-09-02-15-50-nba-expansion-phase3d-delta-complete.txt` | pending |
| 7 | `2026-09-09-03-51-16-nba-classification-baseline-design-research.txt` | pending |
| 8 | `2026-09-09-20-48-33-nba-classification-baseline-backtest-calibration.txt` | pending |
| 9 | `2026-09-09-22-10-00-nba-baseline-production-pipeline.txt` | pending |
| 10 | `2026-09-10-01-31-13-nba-enrichment-backfill-pipeline-2026-09-09.txt` | pending |
| 11 | `2026-09-10-04-53-47-nba-enrichment-backfill-dfs-boards-2026-09-10.txt` | pending |
| 12 | `2026-09-11-21-01-23-nba-board-scrapers-fliff-docs-2026-09-10.txt` | pending |
| 13 | `2026-09-13-01-03-48-nba-boards-grader-market-2026-09-10.txt` | pending |
| 14 | `2026-09-13-20-53-23-nba-boards-grader-market-baseline-history-2026-09-11-12.txt` | pending |
| 15 | `2026-09-18-17-12-53-nba-enrichment-factors-a2-n1-reliability-audit-2026-09-12.txt` | pending |
| 16 | `2026-09-19-18-20-09-nba-enrichment-blowout-matchup-2026-09-13.txt` | pending |
| — | live chat 2026-09-19/20 (not yet a transcript file) | pending |

---

## T1 — `2026-09-03-03-22-04-nba-expansion-phase1-static.txt`
**PHASE 1 (recon) · PHASE 2 (system draft) · PHASE 3a start (static data)**
*292 content blocks · **PASS 1 2026-09-20 (incomplete) · PASS 2 2026-09-20 (incomplete — found new)***

### T1.1 Orientation and recon
- Session opened from a **handoff package** of three prior documents, all read in full:
  `nba/NBA_ARCHITECTURE_BLUEPRINT.md` (96 KB), `nba/NBA_LESSONS_LEARNED_FROM_MLB.md` (57 KB),
  `nba/NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` (18 KB).
- Read memory `/areas/alphadog.md`; listed repo root and `nba/`.
- **Verified against the live database that NO NBA namespace existed anywhere** in Postgres — checked
  `information_schema.schemata`, then every table/column matching `%nba%`, `%sport%`, `%league%`.
- Inspected MLB's discriminators: `market.sleeper_board_current` (sport, league),
  `market.prizepicks_board_current` (league), `ref.teams`, `control.*`, `config.worker_definitions`.
- Phase 1 findings committed as a banner to `nba/NBA_ARCHITECTURE_BLUEPRINT.md`.

### T1.2 Owner directives captured (the operating model)
- **NBA season is OFF** — this is preparation. Backfill static + past-season + market data where possible.
- Probe and **lock a source for each data type** before building on it.
- **ParlayAPI** expected to have past-season NBA data and will have live boards/market when the season starts.
- **PrizePicks board comes from a scraper scoped to NBA**, mirroring MLB's, living in GitHub.
- **All NBA work is additive-only. No MLB edits authorised.**
- Committed to `nba/NBA_PROJECT_LOG.md` (created here) and `nba/NBA_SYSTEM_DRAFT.md` (created here).
- Memory file `/areas/alphadog-nba.md` created.

### T1.3 The separate-universe decision (owner overruled the first proposal)
- First proposal was a shared control plane; **owner overruled it** — NBA gets its own everything.
- **14 NBA-only Postgres schemas created in one command**: `nba_ref`, `nba_calendar`, `nba_team`,
  `nba_stats`, `nba_daily`, `nba_context`, `nba_market`, `nba_score`, `nba_config`, `nba_control`,
  and others. Fully separate from MLB's.
- First tables: `nba_ref.teams` (team_id PK, nba_team_id, abbreviation, full_name, nickname,
  location_name, conference, division, arena_id, active, source_key, raw_json, created_at),
  plus players/arenas/officials, and `nba_config.worker_definitions` / `nba_config.system_settings`
  modelled on MLB's `config.worker_definitions` and `control.job_queue` / `control.worker_run_log`.

### T1.4 First worker, and the deploy-pipeline extension
- Built `nba/alphadog-v2-nba-static-teams.js` (syntax-checked with `node --check` before commit).
- **Extended the two SHARED deploy scripts additively** — `generate_wrangler_configs.py` and
  `github_mobile_deploy_workers.py` — with an isolated NBA branch (Hyperdrive, `nodejs_compat`,
  NBA vars), never touching MLB's paths. Created `nba/worker_manifest_nba.json`.
- Registered the worker in `nba_config.worker_definitions` (job_key `nba-static-teams`,
  group `01 Static`, phase `static`).
- First deploy FAILED on a path bug → patched → **deployed clean** to
  `alphadog-v2-nba-static-teams.rodolfoaamattos.workers.dev`.

### T1.5 THE BLOCKING DISCOVERY — Cloudflare cannot reach nba.com
- Worker deployed fine but **could not fetch `stats.nba.com`**. Added a `/debug-fetch` route to see
  the raw body rather than a truncated error.
- Rewrote headers to the canonical set real NBA scrapers use (Host, Referer, `x-nba-stats-origin`,
  researched via web search + `nba_api` docs). **Still blocked.**
- Added a read-only multi-endpoint probe: **`cdn.nba.com`, `core-api.nba.com` and `data.nba.net` ALL
  fail identically.** Conclusion: a **Cloudflare edge block on the whole nba.com family**, not a
  header problem and not endpoint-specific.
- Stored `balldontlie_api_key` (owner-supplied) in a new `nba_config.external_credentials` table,
  mirroring how `PARLAY_API_KEY` is held — **never in chat memory**.
- Owner preference recorded: **data should come from nba.com itself, like the MLB API** — so
  balldontlie stays a fallback, not the plan.

### T1.6 THE FIX — GitHub Actions as the scraping network
- Found the pattern by reading MLB's `.github/workflows/scrape.yml`: **MLB's PrizePicks scraper runs on
  GitHub Actions runners (a different network from Cloudflare), commits JSON to the repo, and the
  Worker reads the committed file.**
- Built `nba/scrape_nba_stats_teams.py` + a new isolated workflow `.github/workflows/nba-scrape.yml`
  (does not touch `scrape.yml`).

### T1.7 Four consecutive failures, each diagnosed, before it worked
1. **30 s timeout** — not a rejection, a slow/soft response → raised timeout, added retries.
2. **Timeout again, 3 attempts** — a consistent hang. Diagnosed as an anti-bot **tarpit** (silently
   stalling rather than returning a block).
3. **Timeout through the PROXY too** — which *ruled out IP blocking entirely* and pointed at
   **TLS fingerprinting** (Python `requests` has a recognisable handshake).
4. **`curl_cffi` (browser TLS impersonation) — SUCCESS.** HTTP 200, 30 teams, real live data.
   → This is the origin of `curl_cffi` as the standard transport for every NBA scraper since.

### T1.8 The self-trigger problem, and the file-based solution
- Building the scraper wasn't enough — it had to be **triggerable without the owner acting manually**.
- Added a real `github_trigger_workflow` tool to the MCP bridge (`alphadog-v2-admin-sql.js`), deployed
  it — **but the conversation's tool list was fixed at session start, so the new tool was unusable in
  that session.** Owner reconnected; the dispatch still never fired.
- Owner: *"no, the whole point is for me to do not run it manually."*
- **SOLUTION: a file-based trigger.** `.github/workflows/nba-scrape.yml` patched to fire on a push to
  `nba/TRIGGER_NBA_SCRAPE.txt`; writing that file (a capability already held) fires the workflow.
  **This mechanism is still in use** — later generalised to `nba/TRIGGER_NBA_PROBE.txt`.

### T1.9 Data-quality catch and the end-to-end loop
- First successful scrape returned **`abbreviation` empty for all 30 teams** — the `TeamAbbreviation`
  column isn't in that endpoint's real response. Patched the scraper, re-triggered, verified the fix
  against the actual committed file (not the meta claim).
- Rewired the Worker to **read the GitHub-committed file first**, falling back to a direct fetch, then
  to a certified static list. Deployed.
- **Verified independently in Postgres**, not from the worker's own report:
  `SELECT COUNT(*) FROM nba_ref.teams WHERE active=1` and a 5-row sample with real IDs, cities,
  conferences and divisions.

### T1.10 Artefacts created in T1
`nba/NBA_PROJECT_LOG.md` · `nba/NBA_SYSTEM_DRAFT.md` · `nba/worker_manifest_nba.json` ·
`nba/alphadog-v2-nba-static-teams.js` · `nba/scrape_nba_stats_teams.py` ·
`.github/workflows/nba-scrape.yml` · `nba/TRIGGER_NBA_SCRAPE.txt` ·
`nba/data/nba_teams_current.json` + `_meta.json` · 14 Postgres schemas ·
`nba_ref.teams` and siblings · `nba_config.worker_definitions`, `system_settings`,
`external_credentials` · memory `/areas/alphadog-nba.md` ·
patches to `generate_wrangler_configs.py`, `github_mobile_deploy_workers.py`, `alphadog-v2-admin-sql.js`

### T1.11 Findings that still govern the system
- **Cloudflare Workers cannot reach the nba.com family at all** → every NBA scrape runs on GitHub Actions.
- **`curl_cffi` browser impersonation is mandatory** — plain `requests` is TLS-fingerprinted and tarpitted.
- **A proxy alone does not help** against fingerprinting (proved: same timeout through the proxy).
- **A new MCP tool is not usable in the session that creates it** (tool list fixed at session start).
- **File-based workflow triggers** are the reliable self-service mechanism.
- **Verify in the database, never from the worker's own success claim.**

### T1.12 — PASS 2 FINDINGS (added 2026-09-20; tool RESULTS, which pass 1 skipped entirely)

**The MLB universe as it actually stood, measured — this is the baseline NBA was built beside:**
- **18 MLB Postgres schemas**: `archive`, `backtest`, `calendar`, `certifier`, `classification`,
  `config`, `context`, `context_cert`, `control`, `daily`, `market`, + 7 more.
- **`config.worker_definitions` held 116 MLB workers.** Groups seen: `00 System`
  (`alphadog-v2-admin-sql`, `alphadog-v2-certification-center`, `alphadog-v2-config-manager`).
- **ALL 12 MLB D1 bindings report FALSE** — `CONTROL_DB`, `CONFIG_DB`, `REF_DB`, `STATS_HITTER_DB`,
  `STATS_PITCHER_DB`, `TEAM_DB`, `DAILY_DB`, `MARKET_DB`, `CONTEXT_DB`, `SCORE_DB`, `ARCHIVE_DB`,
  `SCORING_DB`. **The MLB system had already migrated off D1 to Postgres.** (This is why, much later on
  2026-09-19, an attempt to read the MLB confidence implementation via those bindings returned
  "binding not present" — it was never a transient failure.)
- **Worker vars present**: `SYSTEM_ENV`, `SYSTEM_FAMILY`, `SYSTEM_VERSION`, `SYSTEM_TIMEZONE`,
  `ACTIVE_SPORT`, `ACTIVE_SEASON`, `DEFAULT_DAY_SCOPE`, `DEFAULT_SLATE_MODE`, `ODDS_API_BASE_URL`,
  `PARLAY_*`.
- **`control` schema — 21 tables**: `board_runner_log`, `board_runner_results`,
  `calibration_audit_tracker`, `claude_session_log`, `debug_catcher_errors`, `debug_sleeper_raw`,
  `gbdt_auto_trigger_switch`, `gbdt_training_requests`, `gemini_calibration_checks`, + 12 more.
- **`config` schema — 15 tables**: `calibration_config`, `enrichment_factors`,
  `enrichment_profile_cells`, `external_credentials`, `external_sessions`,
  `prop_empirical_distribution`, `prop_taxonomy`, `prop_tier_role_assignment`,
  `residual_correction_bins`, + 6 more.
- **`config.worker_definitions` columns** (16): `worker_name`, `job_key`, `worker_group`, `phase_key`,
  `display_name`, `enabled`, `owns_db_binding`, `schedule_profile_key`, `max_tick_ms`,
  `max_api_calls_per_tick`, + 6 more. **NBA's copy was modelled on this.**
- **`control.job_queue` columns** (25): `request_id`, `chain_id`, `parent_request_id`, `job_key`,
  `worker_name`, `worker_group`, `phase_key`, + 18 more.
- **`control.worker_run_log` columns** (10): `log_id`, `request_id`, `run_id`, `worker_name`,
  `job_key`, `level`, `event_key`, + 3 more.
- **MLB `ref.teams` columns** (16): `team_id` TEXT, `mlb_team_id` INT, `full_name`, `abbreviation`,
  `league`, `division`, `active`, + 9 more. **NBA's `nba_ref.teams` mirrors this shape** with
  `nba_team_id` in place of `mlb_team_id` and `conference` added.
- **MLB sport/league discriminators confirmed**: `market.sleeper_board_current` →
  `sport='baseball_mlb'`, `league='MLB'`; `market.prizepicks_board_current` → `league='mlb'`.
  Both single-valued — **no NBA rows anywhere**, which is what justified a fully separate namespace.
- **`ref.umpire_tendency` columns** (11): `umpire_id`, `umpire_name`, `games_umpired`,
  `avg_strikeouts_per_game`, `avg_walks_per_game`, `avg_runs_per_game`, + 5 more.
  **This is the MLB analogue the NBA referee factor (D1) was modelled on.**

**Handoff document sizes (exact):** `NBA_ARCHITECTURE_BLUEPRINT.md` 95,803 B ·
`NBA_LESSONS_LEARNED_FROM_MLB.md` 57,066 B · `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` 18,034 B.
The LESSONS doc self-describes as *"the single most important document in this transfer package…
a research standard built the hard way, across dozens of strategy candidates, almost all of which
looked real at first and were later found to be artifacts."*

**`nba/NBA_PROJECT_LOG.md` created at 5,940 B**, with a self-binding rule in its own header:
*"Every NBA chat/session must add an entry here … for every important step, decision, issue found, and
fix applied. Newest entries at the top … don't let this go stale silently; if a gap happens, say so
explicitly rather than implying continuity."*

**MLB `alphadog-v2-static-teams.js` (24,317 B) was read as the structural template** — version string
`v0.2.0-postgres-cutover`, `REQUIRED_DB_BINDINGS` listing all 11 D1 names, `EXPECTED_VARS`.
NBA's first worker copied this shape exactly (`EXPECTED_VARS = [SYSTEM_ENV, SYSTEM_TIMEZONE,
NBA_STATS_API_BASE_URL, WORKER_SAFE_MODE, DEBUG_MODE]`).

**MLB `alphadog-v2-parlay-sleeper-board.js` (63,216 B, 1,282 lines)** grepped for sport handling —
`DEFAULT_PARLAY_API_BASE_URL = "https://parlay-api.com/v1"`, with a comment that endpoint/header names
are *"intentionally coded as fallback defaults because Cloudflare/GitHub deploys may not apply
wrangler var-only edits reliably."* **A known deploy caveat, inherited.**

**BUG (pass 2, not in pass 1): `column "active" does not exist`** — the first query against
`config.worker_definitions` used a column that isn't there; corrected to `enabled` after inspecting
the real columns.

**Research results captured in pass 2**: `publicapi.dev` NBA Data API listing, and
`kshvmdn/nba.js` documenting `data.nba.net` paths (`/data/10s/prod/v1/{year}/teams.json`,
`players.json`, `coaches.json`) — the endpoints later proven Cloudflare-blocked.
A `future.fandom.com` result on NBA expansion/realignment was returned but is **fan-fiction, not
fact** — correctly not acted upon.

### T1.13 — PASS 3 FINDINGS (added 2026-09-20; full SQL bodies and written file contents)

**THE THREE-RUN OPERATING MODEL — the origin of the whole pipeline design.** Written to memory
`/areas/alphadog-nba.md` verbatim from the owner:
- **Run 1 — "static differential"**: rarely/sporadically-changing data — calendar, team dictionary,
  player dictionary, roster, arenas, possibly referee dictionary.
- **Run 2 — "delta daily"**: data that changes every game/day (game logs), a backfilled base plus daily
  incremental mining; **this run also builds the baseline, described as "the heart of the system"**.
  After mining, prep functions ready the data for a **classification layer** (logic dataset classifier,
  multiple layers for players / prop-lines / variations / directions, each with its own
  thresholds / caps / bonuses / penalties) which computes **the baseline hit-probability % and
  confidence**.
- **Run 3 — "master run", 4 stages**, beginning with Board (mine PrizePicks).
- **"explicitly NO runner/orchestrator/master-automation script"** — three runs, each triggered
  manually by a Claude Coworker scheduled task, worker by worker, path by path, verifying each does its
  job correctly. *Matches how the MLB system runs, which the owner says works fine.*
- **This is the direct ancestor of today's P1/P2/P3**, and it is why no orchestrator was ever built.

**The 14 NBA schemas, exact list** (one `CREATE SCHEMA IF NOT EXISTS` each, in one statement):
`nba_ref`, `nba_calendar`, `nba_team`, `nba_stats`, `nba_daily`, `nba_context`, `nba_market`,
`nba_archive`, `nba_score`, `nba_scoring`, `nba_backtest`, `nba_classification`, `nba_config`,
`nba_control`.

**The 18 MLB schemas, exact list**: `archive`, `backtest`, `calendar`, `certifier`, `classification`,
`config`, `context`, `context_cert`, `control`, `daily`, `market`, `public`, `ref`, `score`, `scoring`,
`stats_hitter`, `stats_pitcher`, `team`. **NBA has no hitter/pitcher split** — one `nba_stats`.

**`nba_ref.teams` full DDL as created:**
`team_id TEXT PRIMARY KEY, nba_team_id BIGINT, abbreviation TEXT, full_name TEXT, nickname TEXT,
location_name TEXT, conference TEXT, division TEXT, arena_id TEXT, active INTEGER DEFAULT 1,
source_key TEXT, raw_json JSONB, created_at TIMESTAMPTZ DEFAULT now(),
updated_at TIMESTAMPTZ DEFAULT now()`

**NAMING CONVENTION LOCKED** (in `nba/NBA_SYSTEM_DRAFT.md`):
- Workers: `alphadog-v2-nba-<domain>-<thing>.js`, job_key `nba-<domain>-<thing>` — mirrors MLB's
  `alphadog-v2-<domain>-<thing>` with an unambiguous `nba-` token inserted.
- **Repo location: every NBA worker, wrangler config and schema file lives inside `/nba/`**, not the
  repo root where every MLB worker lives — *"a second, independent way (folder, not just filename
  prefix) to guarantee zero accidental mixing"*.
- Postgres: new `nba_`-prefixed schemas, none reusing or extending an MLB schema.

**A CORRECTION TO THE HANDOFF BLUEPRINT, made here and banner-committed**: a `sport`/`league`
discriminator column **DOES already exist** on `market.sleeper_board_current/stage` and
`market.underdog_board_current/stage` — contrary to the blueprint's Section 0 claim. It holds only
`baseball_mlb`/`MLB`. **It does not change the conclusion** that NBA needs its own board workers,
because *"the live sleeper/underdog board-mining code hardcodes `baseball_mlb` in the probe URL, the
row filter, and the league literal — the column isn't actually wired for multi-sport dispatch"*.
Left as an open Phase 2 design question: reuse the shared board tables filtered by sport, vs. build
parallel `nba_`-prefixed tables. **Resolved later in favour of `nba_market.board_snapshots`.**

**THE ONE DELIBERATE EXCEPTION, as originally drafted**: per blueprint Section 7e, NBA workers were to
register into the **EXISTING, SHARED** `config.worker_definitions` / `config.worker_schedules` and
`control.job_queue`. **This was subsequently overruled** — the owner required a completely independent
universe, so `nba_config.worker_definitions` and `nba_control` were created instead. The draft text
records the earlier intent; the schemas record the final decision.

**MLB `ref.teams` is genuinely MLB-specific** — `mlb_team_id`, AL/NL `division`, `file_code` — which is
what justified a separate `nba_ref.teams` rather than adding a discriminator.

**Naming-collision risk confirmed as real, not theoretical**: 116 rows in `config.worker_definitions`,
**zero sport prefix anywhere**.

### T1.14 — PASS 4 FINDINGS (added 2026-09-20; remaining DDL, seeded settings, original cron)

**FULL DDL of every `nba_ref` table created in T1** (this is the foundation of the DATABASE document):
- `nba_ref.team_aliases` — `alias_key TEXT PK, team_id, nba_team_id BIGINT, alias_value,
  alias_normalized, alias_type, source_key, confidence, active INT DEFAULT 1, updated_at`
- `nba_ref.players` — `player_id TEXT PK, nba_player_id BIGINT, full_name, first_name, last_name,
  team_id, position, height_inches INT, weight_lbs INT, birth_date DATE, years_pro INT,
  active INT DEFAULT 1, source_key, raw_json JSONB, created_at, updated_at`
- `nba_ref.player_aliases` — same shape as team_aliases, keyed on `player_id`
- `nba_ref.arenas` — `arena_id TEXT PK, arena_name, team_id, city, state, capacity INT,
  **altitude_ft INT**, timezone, source_key, raw_json JSONB, **data_quality TEXT DEFAULT 'derived'**,
  created_at, updated_at`
- `nba_ref.officials` — `official_id TEXT PK, nba_official_id BIGINT, full_name, active,
  games_officiated INT DEFAULT 0, source_key, data_quality DEFAULT 'derived', raw_json, timestamps`
- `nba_ref.prop_taxonomy` — `canonical_prop_key TEXT PK, prop_family, display_name, …`

**`data_quality TEXT DEFAULT 'derived'`** appears from the very first schema — the system was built to
distinguish sourced from derived data from day one.

**Control-plane DDL (the NBA copies):**
- `nba_config.worker_definitions` — `worker_name TEXT PK, job_key TEXT UNIQUE, worker_group, phase_key,
  display_name, enabled INT DEFAULT 1, notes, updated_at` *(8 columns — deliberately simpler than
  MLB's 16)*
- `nba_config.system_settings` — `setting_key TEXT PK, setting_value TEXT, updated_at`
- `nba_config.external_credentials` — `credential_key TEXT PK, credential_value_encrypted TEXT,
  updated_at`
- `nba_control.worker_run_log` — `log_id BIGSERIAL PK, request_id, run_id, worker_name, job_key, level,
  event_key, message, data_json, created_at`
- `nba_control.job_runs` — `run_id TEXT PK, job_key, worker_name, status, input_json, output_json,
  error_message, started_at, finished_at, created_at`

**SEEDED `nba_config.system_settings` values (the original operating constants):**
`nba_static_teams_expected_count = 30` · `nba_default_timeout_ms = 20000` ·
`nba_default_retry_limit = 3` · `nba_default_chunk_size = 200` ·
**`nba_differential_check_cadence = weekly`**

**THE ORIGINAL WEEKLY CRON — direct ancestor of today's P1.** `.github/workflows/nba-scrape.yml` was
created with `cron: '0 9 * * 1'` (**Monday 09:00 UTC**), commented: *"per the person's own instruction
(2026-08-31): teams/static data changes rarely, so a weekly re-check is enough once backfill is done…
matches the general weekly-differential convention already used for MLB."*
**P1 Weekly Static (Mondays 12:00 PT) is this same cadence, re-established 2026-09-20.**

**The certified static fallback**: a real 30-team list with **stats.nba.com's own stable `TEAM_ID`
values** (1610612737 ATL, 1610612738 BOS, 1610612751 BKN, 1610612766 CHA …), used to certify against
until the live fetch was proven. Comment notes *"a 32-team Seattle/Las Vegas expansion is only in
early-vote stages for the 2028-29 season per direct research this session — does not affect this
list."*

**The canonical stats.nba.com header set** (two variants, both recorded):
worker-side `accept, referer https://www.nba.com/, origin, x-nba-stats-origin: stats,
x-nba-stats-token: true, user-agent`; scraper-side adds `Host: stats.nba.com`, `Accept-Language`,
`Accept-Encoding: gzip, deflate, br`, `Connection: keep-alive`, `Referer: https://stats.nba.com/`,
and a full Chrome 128 UA.

**The first scraper's docstring records the block precisely**: *"every
stats.nba.com/cdn.nba.com/core-api.nba.com/data.nba.net endpoint returned a **403/520/526** from a
Cloudflare Worker origin, headers notwithstanding"* — and names the read pattern it mirrors:
`alphadog-v2-prizepicks-github-board.js` reading `prizepicks_mlb_current.json`.

**First source endpoint, exact**:
`https://stats.nba.com/stats/leaguestandingsv3?LeagueID=00&Season=2025-26&SeasonType=Regular%20Season`

**`nba/worker_manifest_nba.json` initial content**: `{"workers": ["alphadog-v2-nba-static-teams"]}`

---

## T2 — `2026-09-03-04-41-28-nba-expansion-phase3a-enrichment-complete.txt`
**PHASE 3a — static/enrichment layer: players, arenas, officials, bio/tracking/team stats, research**
*417 content blocks · added 2026-09-20 · PASSES: 1*

*Note: T2 opens by REPLAYING the last ~60 blocks of T1 (the file-trigger build, the four timeout
failures, the `curl_cffi` breakthrough, the abbreviation fix). Those are documented in T1.x and are not
repeated here. New material starts at T2.1.*

### T2.1 The end-to-end loop actually closes
- Owner: *"so continue the work, i dont even need the new chat"* — the session continues rather than
  handing off.
- First `run_job` after rewiring the worker FAILED with **`"Unexpected end of JSON input"`**.
  Diagnosed precisely: the code requested the GitHub API's **raw** content-type but then tried to parse
  it as the **base64-JSON envelope**. Not a permissions problem. Patched, redeployed, re-triggered.
- **SUCCESS: `source_key: NBA_GITHUB_COMMITTED_STATS_NBA_SCRAPE`** — real nba.com data flowing
  automatically through GitHub Actions → committed file → Worker → Postgres, with no manual step.
- Verified independently in Postgres (active teams, total, aliases, distinct source_keys).
- **Honest nuance recorded**: `source_key` only updates on rows that actually CHANGED — 25 of 30 teams
  had identical data and kept their old key. Not a bug; an upsert property worth knowing.

### T2.2 Players worker (the pattern becomes repeatable)
- Source located by research: **`commonallplayers`** (`IsOnlyCurrentSeason` parameter).
- Built `nba/scrape_nba_stats_players.py` + `nba/alphadog-v2-nba-static-players.js`.
- **The four-step wiring pattern is established here** and reused for every later worker:
  1. `nba/worker_manifest_nba.json`, 2. `generate_wrangler_configs.py`,
  3. `alphadog-v2-admin-sql.js` (bindingMap + dispatch branch + tool enum),
  4. `nba_config.worker_definitions` row.
- **BUG FOUND — deploy ORDER**: the fleet deploys **alphabetically from the file diff**, so
  `alphadog-v2-admin-sql.js` (which now depends on the new worker existing) sorted BEFORE
  `nba/alphadog-v2-nba-static-players.js` and failed. **Permanent fix: `github_mobile_deploy_workers.py`
  patched so admin-sql always deploys LAST.** This fix protects every future NBA worker.
- Result verified in Postgres: **582 players, 525 active, 1,822 aliases**, real names.

### T2.3 Arenas — three source failures before the right endpoint
- Owner instruction: *"research online and check all data that is static and can be mined now,
  including enrichment factors that does not change often."*
- Built `nba/scrape_nba_stats_arenas.py`, added as a third workflow step (depends on committed teams).
- **FAILURE 1 — git push race**: all three scrapes succeeded (30 teams, 582 players, 30 arenas) but the
  final `git push` was rejected non-fast-forward by a concurrent push.
  **Permanent fix: retry-with-rebase loop in the workflow** — still in use in every pipeline today.
- **FAILURE 2 — wrong columns**: `ARENA` / `ARENACAPACITY` came back null for all 30. Added a
  diagnostic to dump the real column names.
- **FAILURE 3 — the endpoint no longer carries them at all.** Confirmed genuinely absent, not a
  parsing bug. Researched and switched to **`teamdetails` → `TeamBackground` result set**.
- **SUCCESS**: 30/30 arenas with genuine current sponsor names (Rocket Arena, Frost Bank Center,
  Xfinity Mobile Arena). Some capacities null **because the source itself lacks them** — recorded
  honestly rather than filled in.
- Built `nba/alphadog-v2-nba-static-arenas.js`, wired the four ways, verified in Postgres.

### T2.4 Officials — a non-NBA source, deliberately
- Research found the NBA stats API has no referee-roster endpoint; **Wikipedia's "List of NBA referees"**
  does, with the real 2025-26 roster (74 staff + 7 non-staff, with jersey numbers), citing the NBA's
  own directory.
- Built `nba/scrape_nba_officials.py` with a **deliberately robust wikitext parser** — multiple real
  formats are plausible (same-line `||` vs separate-line cells, wikilinks, bold for active).
- **BUG: the officials script needs plain `requests`, not `curl_cffi`** (Wikipedia's API is designed
  for programmatic access and needs no bot bypass) — it was never installed in the workflow. Fixed.
- **Second fix in the same patch: the commit step must not hard-fail when one scraper produces no
  output.**
- Result: **80 officials parsed** (matches the expected ~81), names spot-checked against the source.
- Built `nba/alphadog-v2-nba-static-officials.js`, wired, verified 80/80 in Postgres.

### T2.5 The research pass (owner-directed, Gemini + web)
- Owner: *"use Gemini as well to give you insight, check online, check how systems deal with which data
  they use, what can be weekly (static or semi-static) data, like player age, speed…"*
- Web research on prop-model factors (usage rate, pace, rest, defensive rating), plus
  **`Alphadog Bridge:call_gemini`** for an independent synthesis — the two agreed.
- **Three new sources found, each ONE CALL for the whole league** (far cheaper than the per-team
  looping arenas required):
  - **`leaguedashplayerbiostats`** — age, height, weight, draft background, usage rate, efficiency
  - **`leaguedashptstats`** (SpeedDistance) — player tracking
  - team stats endpoint
- Written up as a permanent document: **`nba/NBA_ENRICHMENT_FACTORS_RESEARCH.md`**.

### T2.6 Bio / tracking / team-stats build
- `nba_ref.players` extended: `age`, `college`, `country`, `draft_year`, and more (`ALTER TABLE … ADD
  COLUMN IF NOT EXISTS`).
- Built `nba/scrape_nba_player_bio.py`, `nba/scrape_nba_player_tracking.py`,
  `nba/scrape_nba_team_stats.py` — all single-call, all added to the same workflow.
- Session continues into on/off-court splits and the DARKO research that completes in T3.

### T2.7 Artefacts created in T2
`nba/scrape_nba_stats_players.py` · `nba/alphadog-v2-nba-static-players.js` ·
`nba/scrape_nba_stats_arenas.py` · `nba/alphadog-v2-nba-static-arenas.js` ·
`nba/scrape_nba_officials.py` · `nba/alphadog-v2-nba-static-officials.js` ·
`nba/scrape_nba_player_bio.py` · `nba/scrape_nba_player_tracking.py` · `nba/scrape_nba_team_stats.py` ·
`nba/NBA_ENRICHMENT_FACTORS_RESEARCH.md` · `nba_ref.players` column extensions ·
4 more `nba_config.worker_definitions` rows

### T2.8 Findings that still govern the system
- **The four-step worker wiring pattern** (manifest → generator → admin-sql ×3 → registry).
- **admin-sql must deploy LAST** — alphabetical fleet deploy order otherwise breaks new bindings.
- **git push must retry with rebase** — concurrent pushes race.
- **An endpoint's documented columns may simply not exist any more** — diagnose by dumping the real
  response, then find the right endpoint (`teamdetails`/`TeamBackground`), don't patch around it.
- **Not every source needs `curl_cffi`** — Wikipedia needs plain `requests`; mixing them up breaks the run.
- **One-call-per-league endpoints are strongly preferred** over per-team loops.
- **`source_key` only changes on changed rows** — an upsert property, not a failure.
</content>
</parameter>
<parameter name="message">docs: NBA master summary - transcript 1 pass 1 complete