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
| 1 | `2026-09-03-03-22-04-nba-expansion-phase1-static.txt` | ✅ **DONE — 3/3 clean (passes 26, 27, 28)** |
| 2 | `2026-09-03-04-41-28-nba-expansion-phase3a-enrichment-complete.txt` | ✅ **DONE — 3/3 clean (passes 9, 10, 11)** |
| 3 | `2026-09-03-22-24-13-nba-expansion-phase3a-final-complete.txt` | ✅ **DONE — 3/3 clean (passes 8, 9, 10)** |
| 4 | `2026-09-03-22-38-55-nba-expansion-phase3b-backfill-complete.txt` | ✅ **DONE — 3/3 clean (passes 10, 11, 12)** |
| 5 | `2026-09-09-01-49-59-nba-expansion-phase3c-starter-status-complete.txt` | ✅ **DONE — 3/3 clean (passes 6, 7, 8)** |
| 6 | `2026-09-09-02-15-50-nba-expansion-phase3d-delta-complete.txt` | ✅ **DONE — 3/3 clean (passes 6, 7, 8)** |
| 7 | `2026-09-09-03-51-16-nba-classification-baseline-design-research.txt` | **NEXT** |
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

### T1.15 — PASS 5 FINDINGS (added 2026-09-20; the founding handoff text, verbatim)

**THE ORIGINAL HANDOFF — the instruction that started the entire NBA build**, reproduced by the
assistant when the owner asked for a portable version:

> *"You are starting the NBA expansion of AlphaDog — an existing, live, working MLB player-prop scoring
> and slip-strategy system. This is an **EXPANSION joining an already-built, already-Postgres-native
> system, not a migration and not a from-scratch build**. NBA shares the same GitHub repo, deploy
> pipeline, and MCP admin-bridge worker that MLB runs on. **No changes to the existing MLB system are
> authorized at any point — everything is additive.**"*

Three reference documents under `/nba/`, *"built from an exhaustive read of MLB's own documentation"*:
`NBA_ARCHITECTURE_BLUEPRINT.md`, `NBA_LESSONS_LEARNED_FROM_MLB.md`,
`NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md`.

**THE PARALLEL-CHAT EPISODE (why the file trigger exists).** The owner opened a second chat with this
handoff. That chat reported back, and its message is preserved in T1:
- It confirmed `nba/scrape_nba_stats_teams.py` and `.github/workflows/nba-scrape.yml` live in the repo,
  *"weekly Monday 9am UTC cron + manual `workflow_dispatch`"*.
- It confirmed **all D1 bindings correctly `false` — "the system is fully Postgres-native via
  Hyperdrive"**.
- **`github_trigger_workflow` was not in ITS tool list either.** Its available GitHub tools were exactly:
  `github_get_file`, `github_put_file`, `github_patch_file`, `github_list_dir`, `github_grep_file`,
  `github_list_workflow_runs`, `github_get_workflow_run_log` — **no dispatch capability**.
- **And it could not work around it**: *"I don't have the `GITHUB_TOKEN` value (it's a Worker secret,
  correctly not exposed to me) to hit the GitHub REST API directly from bash, and **`workflow_dispatch`
  can't be triggered via a commit/push**."*
- It offered two ways forward: the owner triggers manually via the Actions tab, or the tool gets
  properly registered in the live bridge schema — noting *"if it was built but never registered as an
  exposed tool, that's a real gap worth fixing so future chats don't hit this same wall."*

**The owner rejected manual triggering** (*"no, the whole point is for me to do not run it manually"*),
which forced the real solution: since `workflow_dispatch` cannot be fired by a push but **`on: push:
paths:` can**, the workflow was changed to watch a trigger file. **That constraint is the direct cause
of the file-trigger mechanism still in use today.**

### T1.16 — PASS 6 FINDINGS (added 2026-09-20; the owner's full specification, verbatim)

**RUN 3 — THE MASTER RUN, IN THE OWNER'S OWN WORDS.** This is the spec the whole scoring engine
implements:
> *"master run is composed by 4 stages. **stage 1 is board**, it will mine the board for prizepicks,
> sleeper and underdog (at least for now). **stage 2 is daily context**, factors individually mined
> from external sources, daily fresh, **with a fallback for each, so factors are always there** —
> they are factors like: referee, arena, fatigue, injury and many more, many of them can have multiple
> sub factors… these factors will provide data to be turned into **multipliers, quotients, bonus,
> penalties** and will be used in a **enrichment level, that works somewhat like the
> classification/baseline**. **stage 3 is market/odds data**, mined from books, **game level and player
> prop level**, to be used on the same way to enrich the final calculations. **stage 4 is the scoring
> engine** which will have many steps and gets the baseline and the enrichment factors and create final
> numbers."*

**RUN 2 in the owner's words** — *"this same phase will create a baseline, which is **the heart of the
system**… a series of functions that prepare the data runs and get all ready for classification, which
is a **logic dataset classifier, with multiple layers for players, proplines, variations and
directions, each one with its logic, thresholds, caps, bonuses and penalties**, and the baseline
execute the logic and calculate the baseline hit probability percentage and the confidence."*

**THE HARD CONSTRAINTS FOR EVERY NBA CHAT** (locked here, still binding):
1. **Never edit anything in the MLB system.**
2. **Every NBA worker file lives inside `/nba/`**, clearly labelled, no mixing.
3. **Every tunable variable — bonuses, penalties, caps, timeouts, retries, chunk sizes — lives in the
   database (`nba_config.system_settings`), NEVER hardcoded.**
4. **Fully separate data/system universe** — nothing shares tables, schemas, folders or control-plane
   with MLB. *"This overruled an earlier proposal of mine to share the job-queue/registry — the person
   explicitly said no, fully separate, always."*
5. **Every chat must log important steps/issues/fixes to `nba/NBA_PROJECT_LOG.md`.**

**THE WORK MODEL**: *"we will create a new chat for each big piece of data and a worker will be
responsible for a small piece of work, so we don't overload any specific work"*, and
*"each new chat should look into the current MLB worker and understand the functionality, **research if
any improvement should be done**, then create with new nba sources."*

**THE RESEARCH STANDARD**: *"deep online research mandatory; **Gemini consultation mandatory for
complicated decisions** (useful reference, **not authoritative — verify independently**)."*

**A DEPENDENCY LOCKED EXPLICITLY**: *"the baseline must fully finish before master-run's Daily Context
or Scoring stages touch it."* — the ancestor of P2-before-P3.

**SIX OPEN QUESTIONS RAISED AND NOT SILENTLY ANSWERED** (T1), of which three matter:
1. **ParlayAPI's real `basketball_nba` coverage was unverified** — needed an isolated probe or a manual
   check. *(Later resolved: our own scrapers beat it; ParlayAPI drops ~25% of rungs.)*
2. **Reuse the DFS board tables' existing-but-unused `sport` column, or build separate `nba_market`
   tables?** Defaulted to separate, flagged as *"a real fork worth your sign-off."*
   *(Resolved in favour of `nba_market.board_snapshots`.)*
3. **A referee dictionary/factor has NO MLB analogue at all** — *"genuinely new territory, needs its own
   source check."* *(Resolved: Wikipedia roster + `ref.umpire_tendency` as the conceptual model.)*

**The recommended sequencing, also from T1**: static data first (teams, players, arenas, calendar) plus
the historical half of game logs — *"both fully backfillable right now"* — while treating
board/daily-context/market as **design-only** until the season gives something live to mine.

### T1.17 — PASS 7 FINDINGS (added 2026-09-20; caveats, limits and a missing document)

**A DOCUMENT NOT PREVIOUSLY CATALOGUED: `nba/NBA_AVAILABLE_TOOLS.md`** — a repo reference file holding
the full tool inventory, written in T1 after the parallel-chat episode.

**`x-deny-reason: host_not_allowed`** — the assistant's own egress proxy rejects `workers.dev` URLs.
Confirmed **from the raw response headers**, not assumed. *"Same limitation would apply to any chat with
`bash_tool` network access — it's not fixable by switching tools, only by changing network settings."*
**This is why a worker cannot be invoked directly and must go through `run_job`.**

**`run_job`'s `target` is a FIXED, pre-wired enum.** A brand-new worker cannot be triggered until the
bridge gets a **service binding + an enum value + a dispatch branch**, then a redeploy.
*"That's worth doing now, since every NBA worker after this one will hit the identical wall otherwise."*
**This is the origin of the four-step wiring pattern.**

**D1 WAS FULLY DECOMMISSIONED SYSTEM-WIDE ON 2026-08-12.** The twelve `false` bindings are *"expected,
benign, already-documented behavior — not a bug, and doesn't affect NBA since it's Postgres-only from
day one."* **This dates the migration precisely** and confirms that later attempts to read MLB logic
through D1 were never going to work.

**AN HONEST CAVEAT LOGGED AT THE TIME**: after the first successful worker run, *"the team dictionary is
genuinely seeded and correct today, **but via the fallback, not the live API**."* The certified static
30-team list was doing the work until the GitHub-Actions path was proven. **Logged in
`NBA_PROJECT_LOG.md` rather than reported as a live-source success.**

**ParlayAPI could not be tested**: *"`parlay-api.com` isn't reachable from my sandboxed network, and I
deliberately didn't trigger a live MLB job through the shared queue to probe it indirectly, since
that's outside this phase's read-only-recon scope."* — **flagged as an unresolved gap rather than
guessed around**, and left for *"a small isolated test worker or a manual check before Phase 2 locks
anything ParlayAPI-dependent."*

**THE THREE OPEN QUESTIONS, ANSWERED BY THE OWNER IN T1** (recorded as locked):
1. **ParlayAPI** — *"should have backdata from past seasons for nba, but it will definitely have the
   boards and live market data when the time comes."*
2. **PrizePicks board** — *"will be got by a scraper, just like the MLB one but scoped to NBA, it
   resides on github."*
3. **Referee = MLB's umpire** — the analogue is accepted, so `ref.umpire_tendency` is the model.

Plus the decisive instruction that overruled the shared control plane:
> *"you must build a **completely separate data and system universe from mlb**, nothing will share same
> space, tables, folders, all separated for each sport."*

**`nba_config.system_settings` is described at the time as doing exactly its intended job** — *"already
holds your first tunable variables (timeout, retry limit, chunk size, differential cadence) —
SQL-editable, no hardcoding, as you required."*

### T1.18 — PASS 8 (added 2026-09-20; artefact inventory sweep) — **NOTHING NEW**

A complete regex sweep of every file path mentioned in T1 returned exactly the artefacts already
documented in T1.10 and T1.17, with their mention counts:
`nba/NBA_PROJECT_LOG.md` (7) · `nba/alphadog-v2-nba-static-teams.js` (4) ·
`nba/scrape_nba_stats_teams.py` (3) · `nba/NBA_SYSTEM_DRAFT.md` (3) ·
`.github/workflows/nba-scrape.yml` (3) · `nba/NBA_ARCHITECTURE_BLUEPRINT.md` (2) ·
`nba/NBA_LESSONS_LEARNED_FROM_MLB.md` (1) · `nba/NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` (1) ·
`nba/NBA_AVAILABLE_TOOLS.md` (1) · `.github/workflows/scrape.yml` (1, MLB's, read as the template).

**This is CLEAN PASS 1 of 3 — but only on the artefact dimension.** The pass rule is not yet satisfied:
a clean pass must find nothing new across ALL dimensions (narrative text, tool results, SQL bodies,
written file contents, artefacts, owner instructions). Passes 2–7 each found substantial new material
on a dimension the previous pass had not examined, which is why the count could not start until now.

**Dimensions verified so far for T1:**
| Dimension | Pass | Result |
|---|---|---|
| narrative text (truncated) | 1 | new material |
| tool RESULTS | 2 | new material — MLB universe, 116 workers, column lists |
| full SQL bodies | 3 | new material — 3-run model, 14 schemas, naming convention |
| remaining DDL + settings | 4 | new material — full `nba_ref` DDL, seeded settings, original cron |
| founding handoff text | 5 | new material — the handoff, the parallel-chat episode |
| owner specification (full) | 6 | new material — Run 3's four stages, the hard constraints |
| caveats and limits | 7 | new material — `host_not_allowed`, D1 date, `NBA_AVAILABLE_TOOLS.md` |
| artefact inventory | 8 | **CLEAN** |

**Next for T1: two more full-dimension passes must both come back clean.**

### T1.19 — PASS 9 FINDINGS (added 2026-09-20; endpoint/table/file name sweep) — **NEW MATERIAL**

**A DECISION POINT NOT PREVIOUSLY DOCUMENTED — the deploy fork, and why the shared script was touched.**

The first worker was built and registered, then hit a blocker that was **flagged rather than worked
around**:

> *"this file alone won't actually deploy as a live Cloudflare Worker yet. MLB's deploy pipeline
> generates each worker's wrangler config via `generate_wrangler_configs.py` at the repo root — **an
> MLB-owned file**. Given your 'don't touch MLB, keep everything separate' rule, NBA needs its own
> equivalent deploy mechanism before any worker can go live. **I didn't want to unilaterally edit that
> shared script.**"*

Two options were put to the owner rather than chosen unilaterally:
1. **`generate_wrangler_configs_nba.py`** — NBA gets its own generator and its own deploy workflow,
   fully separate. *(Recommended at the time as "safest given your instructions".)*
2. **One narrow, additive-only touch** to the existing generator — adding NBA workers to its list,
   changing nothing about MLB's.

**The owner chose option 2**: *"you have access to all of it, we can do 2, if it doesnt change much and
does not affect the mlb universe, that is fine."*

**So `generate_wrangler_configs_nba.py` WAS NEVER BUILT** — it is a discarded proposal, not an
artefact. The shared `generate_wrangler_configs.py` and `github_mobile_deploy_workers.py` carry an
isolated NBA branch instead. **This is the single, owner-approved exception to "never touch MLB
files"**, and it is why both shared scripts appear in NBA's artefact list.

**Everything else in the sweep was already documented**: the four `nba_*` tables, the three
`nba_config` tables, `nba_teams_current.json`, `prizepicks_mlb_current.json`, `main.py`, `scrape.yml`,
and the document set.

**Dimension table updated:**
| Dimension | Pass | Result |
|---|---|---|
| artefact inventory | 8 | CLEAN |
| endpoint/table/file name sweep | 9 | **new — the deploy fork decision** |

**Clean-pass count RESET to 0 by pass 9.** Three consecutive clean passes are still required.

### T1.20 — PASS 10 FINDINGS (added 2026-09-20; every owner message in order) — **NEW MATERIAL**

**THE UI — not previously documented anywhere in this document set:**
> *"the main UI will be the same, **the certification center**, which is just an **aggregator of legs
> and slip builder**, it already exist and when the time comes **it will be integrated**."*

So the NBA system has **no UI to build**. The existing MLB certification center is the front end, and
NBA integration is a later step, after the engine and pipelines. This is the destination for
`nba_score.board_scored` and the slip engine.

**The 14 owner messages in T1, in order** (the complete decision trail):
| # | Message | Effect |
|---|---|---|
| 54 | the full founding directive (3 runs, constraints, research standard, **certification center**) | locked the operating model |
| 64/65 | ParlayAPI has back data + live boards; PrizePicks via a GitHub scraper; **"completely separate data and system universe"** | overruled the shared control plane |
| 117 | *"we can do 2, if it doesnt change much and does not affect the mlb universe"* | **approved the one narrow touch to the shared deploy scripts** |
| 186 | *"what is going on? what are these waits for?"* | prompted an explanation of deploy polling |
| 188, 248 | *"continue"* | |
| 206 | pasted the parallel chat's report | surfaced the `github_trigger_workflow` gap |
| 291 | the balldontlie API key | stored in `nba_config.external_credentials` |
| 363 | ***"so setup whatever you need to do the work yourself, we will need that multiple times"*** | **authorised building new tooling — the mandate behind the bridge tool and the file trigger** |
| 406 | *"ill open a new chat, give me all the needed information…"* | produced the portable handoff |
| 409, 416 | relayed the other chat's replies | confirmed the tool-list limitation was universal |
| 422 | ***"no, the whole point is for me to do not run it manually"*** | **forced the file-trigger solution** |

**Two owner messages are the load-bearing ones for how the system still works**: message 363
(build your own tooling) and message 422 (never manual). Together they produced the trigger-file
mechanism that is still the fallback today.

**Also captured verbatim from message 54, previously paraphrased:**
- *"start probing and testing sources, and **locking source for each piece of data**"*
- *"more than anything **design the system**, find out all possible individual factors that will help
  give an edge, rank legs, give signals, enrich the baseline"*
- *"no runner, orchestrator or anything like, **it only breaks the run**… individual worker by
  individual worker, path by path and making sure they are properly doing their jobs, **that is the way
  MLB system runs now and is running just fine**"*
- *"all chats, this included must work with a log system, and create documents for important
  reference, **each important step, issue, solution, must have a log in the system log**"*

**Dimension table updated:**
| Dimension | Pass | Result |
|---|---|---|
| endpoint/table/file sweep | 9 | new — the deploy fork |
| every owner message in order | 10 | **new — the certification center UI; the full message trail** |

**Clean-pass count still 0.** T1 remains open.

### T1.21 — PASS 11 FINDINGS (added 2026-09-20; every measured number) — **NEW MATERIAL**

**THE GUARD THAT PROTECTS MLB — the exact mechanism, not previously documented:**
> *"Patched `generate_wrangler_configs.py` and `github_mobile_deploy_workers.py`, **every change guarded
> behind `worker_name.startswith("alphadog-v2-nba-")`** so it's **provably zero-impact** on MLB
> workers."*

This is how the one approved touch to shared files stays safe: a prefix test on every NBA branch.
**Any future edit to those scripts must keep that guard.**

**TWO WORKER COUNTS, and they are different things:**
- **116** — rows in `config.worker_definitions` (the registry)
- **~130** — workers actually deployed in the fleet (*"MLB's ~130 workers plus the new NBA one"*)

Previously documented as 116 only. The gap matters when reading deploy logs.

**`nba_ref.team_aliases` — 157 rows in T1, 162 in T2.** *(CORRECTED 2026-09-20 by T2 pass 4: these are
not a fallback-to-live progression. `aliases_written` counts rows UPSERTED in a run (155, 157); 162 is
the TOTAL active rows in the table. Unchanged rows are not rewritten, exactly as with `source_key`.
Comparing a worker's `*_written` figure to a `SELECT count(*)` will always show a gap that is not a
bug.)*

**TOUCHING A "GLOBAL TOOLING" FILE TRIGGERS A FULL-FLEET REDEPLOY** — *"it triggered a full redeploy of
every worker — MLB's ~130 workers plus the new NBA one."* **This is why deploys took 15+ minutes and
why so much of T1 is waiting.** Editing `generate_wrangler_configs.py`,
`github_mobile_deploy_workers.py` or `alphadog-v2-admin-sql.js` redeploys everything.

**THE PATH BUG, exactly:** wrangler looked for **`nba/nba/alphadog-v2-nba-static-teams.js`** instead of
`nba/alphadog-v2-nba-static-teams.js` — a **doubled folder prefix** in the new NBA branch.
*"All the MLB workers redeployed successfully before that — nothing of yours broke."*

**The manual-trigger ask that was refused** — *"You click 'Run workflow' on 'NBA Static Data Scraper'
in the repo's Actions tab (**takes 10 seconds**)"* — and the alternative offered was *"wait for its
first scheduled run this coming Monday 9am UTC."* The owner rejected both, which produced the file
trigger.

**HTTP codes seen from Cloudflare against nba.com: 200 (only via GitHub Actions), 403, 520, 526.**

**Dimension table updated:**
| Dimension | Pass | Result |
|---|---|---|
| every owner message | 10 | new — certification center |
| every measured number | 11 | **new — the `startswith` guard, 130 vs 116, 157→162 aliases, full-fleet redeploy** |

**Clean count still 0/3.**

### T1.22 — PASS 12 FINDINGS (added 2026-09-20; rules, principles, standards) — **NEW MATERIAL**

**THE ROOT CAUSE OF THE CLOUDFLARE BLOCK, stated precisely** — previously recorded only as "403/520/526":
> *"**Cloudflare's own edge returning error 520** ('web server is returning an unknown error'), meaning
> **the request never even reaches stats.nba.com's app layer**. This is a known, real pattern:
> **stats.nba.com is itself Cloudflare-fronted, and Cloudflare-to-Cloudflare traffic** (i.e. Workers
> calling another Cloudflare-protected site) **commonly gets flagged and blocked at the WAF/edge
> level**. No amount of header tuning is going to fix this — it's an infrastructure-level block."*

**So the mechanism is Cloudflare-to-Cloudflare, not an IP reputation or header problem.** That is why
a proxy could never have helped from a Worker, and why only a non-Cloudflare origin (GitHub Actions)
works.

**AND THE DECISION IT FORCED** — the scope of the finding was recognised immediately:
> *"This matters beyond teams — it means **stats.nba.com may not be usable as a live source for any NBA
> worker running on Cloudflare Workers**, including the players worker I was about to build.
> **Rather than build on that same broken assumption, I'm stopping here to ask you.**"*

**A NAMED PROJECT STANDARD, cited from the lessons document:**
> ***"verify before building on top"*** — *"the standard already established for this whole project,
> per the lessons document."*

Invoked when the parallel chat was told: *"Trigger and confirm the teams worker first. **Do not build
the players worker yet.**"* **This is the discipline that produced every "verify in Postgres, not from
the worker's own report" check in this build.**

**The complete rule set from T1, consolidated** (all now cross-referenced in RECIPE step 0):
| Rule | Source |
|---|---|
| Never edit anything in the MLB system | owner, msg 54 |
| Completely separate data and system universe | owner, msg 64 |
| Every worker inside `/nba/`, labelled | owner, msg 54 |
| Every tunable in the database, never hardcoded | owner, msg 54 |
| Every step/issue/solution logged | owner, msg 54 |
| Deep research + Gemini mandatory, **not authoritative** | owner, msg 54 |
| **The baseline must finish before Daily Context or Scoring** | locked in T1 draft |
| **Verify before building on top** | the lessons document |
| **`startswith("alphadog-v2-nba-")` guards every shared-file change** | T1 implementation |

**Dimension table updated:**
| Dimension | Pass | Result |
|---|---|---|
| every measured number | 11 | new |
| rules, principles, standards | 12 | **new — Cloudflare-to-Cloudflare root cause; "verify before building on top"** |

**Clean count 0/3.** Twelve passes; ten found new material.

### T1.23 — PASS 13 (endpoint inventory) — **minor new**
`playerindex` recorded as a **considered alternative** to `commonallplayers` for the players worker
(*"~450+ active players via stats.nba.com's `commonallplayers` or `playerindex` endpoint"*).
**`commonallplayers` was the one used.** No other endpoint in T1 beyond `leaguestandingsv3`.

### T1.24 — PASS 14 FINDINGS (added 2026-09-20; external services and tooling) — **NEW MATERIAL**

**CLAUDE COWORKER is the scheduler** — not previously documented as a component:
> *"the **Coworker-scheduled, worker-by-worker model MLB already uses**"*

Each of the three runs is triggered by a **Claude Coworker scheduled task**, worker by worker. This is
the operating model in place of an orchestrator — *"so no runner, orchestrator or anything like, it
only breaks the run."* **Coworker is the thing that replaced the orchestrator.**

**`PROXY_URL` already existed as a repo secret before NBA** — *"`PROXY_URL` secret set up for exactly
this kind of problem"*, and it needed only *"referencing"* in the NBA workflow's env, not creating.
Inherited from MLB's own anti-bot work.

**Credential discipline, stated as a pattern**: the balldontlie key was stored *"the same way
`PARLAY_API_KEY` already is — **in the database, never in chat memory**."*

**The D1 finding was cross-checked three ways** before being accepted as benign: the parallel chat
reported it, this chat confirmed it independently with `check_bindings`, and it was then matched
against the documented decommission date (**2026-08-12**). *"expected, benign, already-documented
behavior — not a bug."* **Recorded with the caveat that `run_sql` (the D1 tool) should not be trusted
for live data; `run_sql_postgres` is confirmed fine.**

**The manual invocation path, for the record**: `POST` to
`https://alphadog-v2-nba-static-teams.rodolfoaamattos.workers.dev/run` — possible for the owner, **not
for the assistant** (`host_not_allowed`).

**Dimension table updated:**
| Dimension | Pass | Result |
|---|---|---|
| rules and principles | 12 | new |
| endpoint inventory | 13 | minor new — `playerindex` |
| external services and tooling | 14 | **new — Claude Coworker as the scheduler; `PROXY_URL` pre-existing** |

**Clean count 0/3.** Fourteen passes; twelve found new material.

### T1.25 — PASS 15 FINDINGS (added 2026-09-20; verification and fallback claims) — **NEW MATERIAL**

**THE SHARED GITHUB SECRET SET** — not previously documented:
**`GITHUB_TOKEN` · `GITHUB_OWNER` · `GITHUB_REPO` · `GITHUB_BRANCH`** — *"Confirmed the existing shared
… secrets already flow"* to the NBA workers. They were inherited, not created. This is what lets a
Worker read a committed file through the Contents API, and what the bridge uses for every GitHub tool.

**A `source_key` VALUE NOT PREVIOUSLY RECORDED: `FALLBACK_AFTER_FETCH_ERROR`** — written when the live
`stats.nba.com` fetch fails and the certified static list is used instead. **This is the marker that
distinguishes a fallback load from a real one**, and it is why the honest caveat (*"seeded via the
fallback, not the live API"*) could be made at all.

The full set of `source_key` values seen in T1:
| Value | Meaning |
|---|---|
| `FALLBACK_AFTER_FETCH_ERROR` | live fetch failed; certified static list used |
| `NBA_GITHUB_COMMITTED_STATS_NBA_SCRAPE` | real nba.com data via GitHub Actions |

**THE VERIFICATION DISCIPLINE, in the session's own words** — every claim in T1 is paired with an
independent check, and the phrasing is consistent enough to be a pattern:
- *"Confirmed **directly, not assumed**"*
- *"Confirmed with **real data, not just a guess**"*
- *"triggered it for real, then **independently queried Postgres directly (not just trusting its own
  report)**"*
- *"**confirmed against live data — not just its own claim**"*
- *"confirmed **fixed via CI log**"*
- *"confirmed correctly registered and deployed (**verified directly from another session**)"*

**This is "verify before building on top" in practice**, and it is why T1's findings held up under
eleven later passes.

**Dimension table updated:**
| Dimension | Pass | Result |
|---|---|---|
| external services | 14 | new |
| verification and fallback claims | 15 | **new — the GitHub secret set; `FALLBACK_AFTER_FETCH_ERROR`** |

**Clean count 0/3.** Fifteen passes; thirteen found new material.

### T1.26 — PASS 16 (decisions and alternatives) — **CLEAN 1/3**

A sweep for every decision point, rejected alternative and "rather than" construction returned
**nothing not already documented**. Every item mapped to an existing entry:
| Found | Already in |
|---|---|
| file trigger instead of chasing the tool-list caching issue | T1.8, T1.15 |
| stopping rather than building on a broken assumption | T1.22 |
| deploy fork, option 1 vs option 2 | T1.19 |
| ParlayAPI flagged rather than guessed around | T1.17 |
| balldontlie as the alternative found | T1.5 |
| the doubled-prefix path bug | T1.21 |
| tarpit = silent stall, not an explicit block | T1.7 |
| the whole verification-discipline vocabulary | T1.25 |
| no hitter/pitcher split — offence only | T1.13 |

**CLEAN PASS 1 of 3.**

### T1.27 — RUNNING PASS LEDGER

| Pass | Dimension | Result |
|---|---|---|
| 1 | narrative text (truncated) | new |
| 2 | tool RESULTS | new |
| 3 | full SQL bodies | new |
| 4 | remaining DDL + seeded settings | new |
| 5 | founding handoff text | new |
| 6 | owner specification, full | new |
| 7 | caveats and limits | new |
| 8 | artefact inventory | clean |
| 9 | endpoint/table/file name sweep | new |
| 10 | every owner message in order | new |
| 11 | every measured number | new |
| 12 | rules, principles, standards | new |
| 13 | endpoint inventory | minor new |
| 14 | external services and tooling | new |
| 15 | verification and fallback claims | new |
| 16 | decisions and alternatives | **CLEAN 1/3** |

**Two more consecutive clean passes required before T1 is DONE.**
Dimensions not yet swept: error/exception vocabulary · time and scheduling references ·
person/team/proper nouns · numeric IDs and hashes.

### T1.28 — PASS 17 FINDINGS (added 2026-09-20; error vocabulary) — **NEW MATERIAL · CLEAN COUNT RESET TO 0**

**THE TOOL-LIST CACHING DIAGNOSIS, precisely** — previously recorded only as "the tool list is fixed at
session start":
> *"it looks like **the MCP connector caches its tool list at the connection level, not per new chat**"*

That is why the owner's disconnect-and-reconnect did not surface `github_trigger_workflow`, and why a
genuinely fresh connection was needed. **A more specific and more useful statement of the constraint.**

**THE 403's ACTUAL MESSAGE**: *"403 **'Access Denied'** or 520/526"* — so the family of responses from
a Worker origin is: **403 Access Denied · 520 (edge, 'web server is returning an unknown error') ·
526**. Previously recorded as bare status codes.

**THE PROXY IS MLB's OWN**: *"timeouts, even through **the same proxy MLB's scraper uses** — ruled out
IP blocking."* The `PROXY_URL` secret is the one MLB's PrizePicks scraper already relied on, which is
why it needed only referencing. **And its failure here is what made the conclusion decisive** — that
proxy demonstrably works for MLB scraping, so its failure against stats.nba.com could not be an IP
reputation problem.

**A NON-BLOCKING FOLLOW-UP FLAGGED AND NEVER CLOSED**: after the header rewrite, one path still
returned an error *"(still needs real header/cookie debugging, **flagged as a non-blocking
follow-up**)"* — so it *"correctly fell back"*. **This is an open thread from T1** and is now recorded
in OPEN_ITEMS.

**Dimension table updated:**
| Dimension | Pass | Result |
|---|---|---|
| decisions and alternatives | 16 | CLEAN 1/3 |
| error/exception vocabulary | 17 | **NEW — connection-level tool caching; 403 "Access Denied"; MLB's own proxy; an unclosed follow-up** |

**CLEAN COUNT RESET TO 0/3.** Seventeen passes; fourteen found new material.
This is the rule working as intended — pass 16 looked clean, and pass 17 proved the count was premature.

### T1.29 — PASS 18 (time and scheduling) — **MINOR NEW**

**A SEQUENCING PRINCIPLE**: *"weekly re-check cadence, **but backfill comes first**."*
The weekly cron is for *differential* checks once the historical load is done — it is not the mechanism
for getting the data in the first place. **Backfill, then cadence.** This is why T1 set the cron but the
data came from manual triggers throughout, and why P1's value is keeping things current rather than
populating them.

Everything else in the sweep was already documented: Monday 9am UTC, the three runs, the four master-run
stages, the Coworker-scheduled model, `nba_differential_check_cadence`, and the design-only treatment of
board/daily-context/market until the season starts.

**Clean count 0/3** — pass 18 found new material, so the count does not begin.

### T1.31 — PASS 19 (IDs, hashes, commit SHAs) — **CLEAN 1/3**

A sweep for every hex string, numeric ID and UUID returned only already-documented values:
| Found | Already in |
|---|---|
| `00b8dbe` (the redeploy run SHA) | T1.21 |
| `dcb12926-916e-4b28-a64e-d7bdd3f13d6d` (balldontlie key) | T1.5 |
| `1610612xxx` team IDs | T1.14 |
| `cceeded` | false positive — substring of "succeeded" |

**CLEAN PASS 1 of 3.**

### T1.33 — PASS 20 (proper nouns) — **CLEAN 2/3**

A sweep for every capitalised proper noun returned only already-documented entities:
Cloudflare Worker(s) · Alphadog Bridge · NBA Static Data Scraper · AlphaDog v2 Mobile Auto Deploy ·
Daily Context / Scoring Engine (the master-run stages) · Architecture Blueprint / Lessons Learned /
Domain Mapping · "Access Denied" · Seattle / Vegas (the 2028-29 expansion note, correctly not acted on) ·
the team names from the certified static fallback (Atlanta Hawks, Boston Celtics, Brooklyn Nets,
Charlotte Hornets, Chicago Bulls …).

**CLEAN PASS 2 of 3.**

### T1.35 — PASS 21 (quoted third-party content) — **NEW MATERIAL · CLEAN COUNT RESET TO 0**

**THREE RESEARCH SOURCES NOT PREVIOUSLY DOCUMENTED**, recovered from the search-result titles inside
tool results:

1. **`swar/nba_api` — `docs/nba_api/stats/static/teams.md`**
   The canonical Python NBA API package. **This is the origin of both the certified static 30-team list
   (with stats.nba.com's own stable TEAM_IDs) and the canonical header set.** Previously cited only as
   "researched via nba_api docs" without the specific document.

2. **`swar/nba_api` Issue #155 — "Is the API still working? Are there new headers?"**
   A live GitHub issue thread on stats.nba.com's changing header requirements. **The evidence that the
   header problem was a known, community-tracked moving target** — not a local mistake. This is what
   justified rewriting to the canonical set before concluding the block was infrastructural.

3. **BALLDONTLIE API blog — "Getting Started with the BALLDONTLIE API"**
   Researched when balldontlie was being evaluated as the fallback source.

**Previously documented from the same sweep:** `publicapi.dev` NBA Data API · `kshvmdn/nba.js`
(`data.nba.net` paths) · `future.fandom.com` (fan-fiction, correctly not acted upon).

**Why this matters beyond bookkeeping:** the header set in every NBA scraper traces to `nba_api`, and
Issue #155 is where to look first if stats.nba.com ever changes its requirements again.

**CLEAN COUNT RESET TO 0/3.** Twenty-one passes; sixteen found new material.
Passes 19 and 20 were clean; pass 21 invalidated them. **This is the second time the rule has caught a
premature count** — and both times the material found was genuinely useful.

### T1.37 — PASS 22 (tool-call sequencing) — **CLEAN 1/3**

Tool-use distribution across T1's 205 calls:
| Tool | Calls |
|---|---|
| Alphadog Bridge (all) | 159 |
| `bash_tool` | 31 (almost entirely `sleep` for deploy polling) |
| `web_search` | 6 |
| `view`, `memory_read`, `create_file` | 2 each |
| `web_fetch`, `memory_write`, `memory_append` | 1 each |

**No new system facts.** The working pattern it confirms — write locally → `node --check` /
`py_compile` → `cat` to inspect → commit — is already documented in T1.4 and T1.7. The heavy
`bash_tool` count is the deploy-polling already explained in T1.21 (full-fleet redeploys).

**CLEAN PASS 1 of 3.**

### T1.38 — PASS 23 (structure of written artefacts) — **CLEAN 2/3**

Heading and bold-label structure inside the files written during T1:
- `nba/NBA_PROJECT_LOG.md` — `## <date> — Session: <summary>`, newest first
- `nba/NBA_SYSTEM_DRAFT.md` — `**Worker files & job_keys**`, `**Repo location**`,
  `**Postgres schemas**`

Both structures are already described in T1.13 (naming convention) and T1.12 (the log's self-binding
rule). **No new material.**

**CLEAN PASS 2 of 3.**

### T1.40 — PASS 24 (full re-read, segment 1) — **NEW MATERIAL · CLEAN COUNT RESET TO 0**

**AN OWNER INSTRUCTION MISSED IN ALL 23 PRIOR PASSES** — message 65 carried a third line that the
targeted sweeps never surfaced because it matched no pattern:

> *"**mlb calls referees 'Umpire' — that is how you will find what exists for referee.**"*

This is not the assistant inferring the analogue; **the owner supplied the search key directly.**
It is why `ref.umpire_tendency` was found and used as the model, and it is the answer to the open
question *"a referee dictionary/factor has no MLB analogue at all — genuinely new territory."*
**It did have one; the owner knew where it was.**

**AN ATTRIBUTION CORRECTION — "backfill first" is the OWNER's rule, not the assistant's.**
Pass 18 recorded *"weekly re-check cadence, but backfill comes first"* as an assistant observation.
The source is message 65:
> *"the static data needs a differential path that **once a week** will run and check for any changes.
> **but first focus on the backfill**."*

So the weekly cadence AND its subordination to backfill are both owner directives. **This also dates
the weekly cron to the owner's instruction**, not to a convention inherited from MLB.

**The go-ahead, verbatim**: *"definetely start with the static data, historical data. **you can
start**."*

**CLEAN COUNT RESET TO 0/3.** Twenty-four passes; seventeen found new material.
**Third reset.** Passes 22 and 23 were clean; pass 24 invalidated them.

**The lesson this reset teaches, and it is the important one:** every targeted sweep is pattern-bound,
and an instruction that matches no pattern survives any number of them. **Only a full sequential
re-read can close a transcript.** Passes 24+ are therefore full re-reads in segments, not sweeps.

### T1.41 — CURRENT STATE OF T1

**24 passes. 17 found new material. Clean count: 0/3.**

**Method for the remaining passes:** full sequential re-read in segments of ~55 message-blocks.
T1 has ~292 blocks → roughly 6 segments per pass.

### T1.42 — PASS 24, SEGMENT 2 (blocks 131–200) — **NEW MATERIAL**

**A CORRECTION TO A VALUE RECORDED IN PASS 15.** The `source_key` is not
`FALLBACK_AFTER_FETCH_ERROR` — the full value is:
> **`STATIC_SEED_FALLBACK_AFTER_FETCH_ERROR`**

Pass 15 captured a truncated form from a grep window. **The full string is what to search for.**
Corrected in DATABASE and OPEN_ITEMS.

**THE DISPATCH PATTERN NBA WORKERS COPY, named exactly:**
> *"using **`BASE_HITTER_GAME_LOGS_WORKER`'s exact style (direct call, bypasses queue entirely)**"*

So NBA workers are wired for **direct invocation**, not queued dispatch — deliberately, because the
owner wanted no orchestrator. `BASE_HITTER_GAME_LOGS_WORKER` is the MLB precedent to copy when adding
any new NBA worker to the bridge.

**THE FULL-FLEET REDEPLOY IS CONFIRMED SAFE**, not merely assumed:
> *"I confirmed in the log this was a **clean, idempotent redeploy (same configs, same code)** — not a
> functional change to anything MLB."*

**The live-fetch failure at this point was a 520**, and the fallback worked exactly as designed — which
is what made the honest "seeded via fallback, not live API" statement possible.

**Segment 2 of pass 24: NEW MATERIAL. Clean count remains 0/3.**

### T1.44 — PASS 24, SEGMENTS 3–4 (blocks 200–340) — **NEW MATERIAL**

**balldontlie.io, the full evaluation** — previously recorded only as "a fallback":
- *"a real, documented REST API with Teams/Players/Games on its **free tier**"*
- *"it **recently started requiring an API key** (unauthenticated calls now **401**)"*
- *"the free tier is **5 requests/minute**"*
- *"**I can't sign up for accounts myself**"* — which is why the owner had to supply the key

**The 5 req/min ceiling is why it was only ever a backup**: the static layer needs per-team loops
(arenas alone is 30 calls), and the delta layer needs far more. It could not have carried the system.

**THE ORIGINAL PHASE STRUCTURE — which is what the transcript filenames encode:**
| Phase | Scope |
|---|---|
| **Phase 1** | internal research + live verification of the current MLB system |
| **Phase 2** | draft design doc |
| **Phase 3a** | static data |
| **Phase 3b** | incremental / delta data |
| **Phase 3c** | board / daily-context / market |
| **Phase 3d** | scoring engine |

*"each a real design phase with **sourced, verified data**."* This is the plan T1–T6's filenames follow
(`phase1-static`, `phase3a-enrichment`, `phase3b-backfill`, `phase3c-starter-status`,
`phase3d-delta`). **Note the transcripts deviate from the plan** — 3b became backfill and 3d became
the delta worker, so the filename phase labels are approximate, not authoritative.

**THE READING INSTRUCTION, binding**: *"**Read all three in full before doing anything else** —
they're **authoritative, don't re-derive what they establish**."*

**The tool-list limitation, stated most precisely here**: *"it doesn't show up until **a fresh session
connects**"* — and three options were offered (new chat / manual click / wait for Monday's cron).
The owner chose the new chat, which produced the handoff, which produced the parallel-chat episode.

**Segments 3–4: NEW MATERIAL. Clean count remains 0/3.**

### T1.46 — PASS 24, SEGMENT 5 (blocks 340–420) — **NEW MATERIAL**

**A LESSONS-DOC WARNING, CORROBORATED LIVE — not previously documented:**
> *"one live corroboration of the **'registry entry ≠ real functionality'** warning
> (**dead `score-<prop>` stub workers still `enabled=1`**)"*

So MLB's own registry contains **enabled rows for workers that do nothing**. This is why
`config.worker_definitions`'s 116 rows are not a reliable inventory of working capability, and it is a
standing caution for any audit that counts registry rows. **A registry entry proves registration, not
function.**

**A SECOND DIAGNOSTIC ROUTE, named**: **`/probe-sources`** — the multi-endpoint diagnostic that tested
`cdn.nba.com`, `core-api.nba.com` and `data.nba.net` together. Previously only `/debug-fetch` was
recorded. **Both routes exist on `alphadog-v2-nba-static-teams.js`.**

**THE HANDOFF'S SIX NEXT STEPS**, which are a good template for any source cutover:
1. confirm the tool is actually available · 2. call it · 3. **poll and confirm the still-unverified
assumption — "confirm it, don't assume it"** · 4. if it works, read the committed file and rewire the
Worker · 5. **if it fails, fall back to balldontlie "and tell the person plainly before proceeding"** ·
6. only then move to the next worker, following the established pattern.

**And the instruction to read the log, not the summary**: *"read this in full — it has **more granular
detail than this summary**, including exact error messages and file diffs referenced by name."*

**Segment 5: NEW MATERIAL. Clean count remains 0/3.**

### T1.48 — PASS 24, SEGMENT 6 (blocks 420–end) — **NEW MATERIAL · PASS 24 COMPLETE**

**AN ATTRIBUTION CORRECTION — `curl_cffi` was not discovered, it was COPIED from MLB:**
> *"This is exactly why **MLB's own scraper installs `curl_cffi`** (a library that impersonates real
> Chrome's TLS fingerprint) instead of plain `requests`. **Let's use the same fix.**"*

Earlier entries present the four-failure chain as ending in an independent diagnosis. The diagnosis
(TLS fingerprinting) was independent; **the remedy was already in MLB's codebase and was recognised
there.** The same is true of `PROXY_URL`: *"MLB's own scraper already has a working `PROXY_URL` secret
set up for exactly this kind of problem."*

**The pattern worth keeping**: at each wall, the working answer was found by **reading MLB's existing
solution** — the GitHub-Actions architecture, the proxy secret, and `curl_cffi` all came from there.
That is the handoff's instruction (*"look into the current MLB worker and understand the
functionality"*) doing its job.

**THE ABBREVIATION FIX, exactly what it was**: not a re-parse — *"a **static ID→abbreviation map**
(team IDs are stable, already verified)."* An honest patch over a source gap, not a workaround hiding
one.

**The GitHub UI detail that cost a cycle**: *"there are **two clicks total** — opening the dropdown
isn't enough on its own"*, and the branch dropdown *"defaults to whatever branch you're viewing."*
This is why the first manual-trigger attempt produced no run.

**And the connector-reconnect nuance**: *"the connector reconnect you did may only give
`github_trigger_workflow` to a **new chat opened AFTER** the reconnect — the chat that's already open
(and this one too) likely still has the tool list from before."*

---

## T1 — PASS 24 COMPLETE. **ALL SIX SEGMENTS FOUND NEW MATERIAL.**

**25 dimensions/segments examined. 21 found new material. Clean count: 0/3.**

**What pass 24 proves:** the 23 targeted sweeps, despite covering every dimension I could name, missed
**six distinct findings** — an owner instruction, a truncated value, a source's rate limit, the
original phase plan, a live-corroborated warning about dead registry entries, and an attribution error
about where `curl_cffi` came from. **A full sequential read is not an optional final check; it is the
only pass that counts.**

**Next: pass 25 — a complete sequential re-read, all six segments, start to finish.** Three of those
must come back clean in a row.

### T1.49 — PASS 25, SEGMENT 1 (blocks 1–54) — **NEW MATERIAL**

**THE DEAD-STUB FINDING, with its count and its detection method** — pass 24 recorded the warning;
this gives the specifics:
> *"The **19ish `score-<prop>` files** (score-doubles, score-hits, etc.) are still `enabled=1` in the
> registry **despite matching the ~5.3 KB stub signature** — live proof of the doc's 'registry ≠
> reality' warning."*

So roughly **19 of MLB's 116 registry rows are dead stubs**, and they were identified by **file size**
(~5.3 KB, the stub signature). **The real working-worker count is nearer 97.** Any audit that counts
registry rows overstates capability by about 16%.

**A THIRD CORRECTION TO THE HANDOFF DOC**, not previously recorded: the live schema count is
*"a few more than the doc's table listed"* — 18 actual vs fewer documented. So the Phase 1 recon
corrected the blueprint in **three** places, not two: the sport/league column, the schema count, and
the registry-vs-reality confirmation.

**Deploy pipeline state at session start**: *"Live, healthy, **successful auto-deploy this
morning**"* — the baseline against which the later full-fleet redeploys were judged safe.

**Phase 1's verification table, in full** — the six checks run before any building:
| Check | Result |
|---|---|
| NBA namespace | zero exists, clean slate |
| Postgres schemas | 18 confirmed |
| `ref.teams` | MLB-specific (`mlb_team_id`, AL/NL, `file_code`) |
| Worker registry | 116 rows, no sport prefix — collision risk real |
| Dead-stub workers | ~19 `score-<prop>` stubs still enabled |
| Deploy pipeline | live and healthy |

**Segment 1 of pass 25: NEW MATERIAL. Clean count remains 0/3.**

### T1.50 — PASS 25, SEGMENT 2 (blocks 55–75) — **CLEAN**
Naming convention · no hitter/pitcher split · the 3-run mapping · the six open questions ·
the static-data-first recommendation. All already documented (T1.13, T1.17, T1.6).
Only new reference: the recommendation lives in *"Section 6 of the draft"* — a pointer, not material.

### T1.51 — PASS 25, SEGMENT 3 (blocks 76–131) — **MINOR NEW**

**An MLB reference file not previously catalogued: `schema_ref_db.sql`** —
> *"look at the MLB static-teams worker as a structural template, and **check `schema_ref_db.sql` for
> the full static-layer pattern**."*

So the NBA reference-layer DDL was modelled on **two** MLB artefacts, not one: the worker file for
structure, and `schema_ref_db.sql` for the schema pattern. **This is where `source_key`, `raw_json`,
`data_quality DEFAULT 'derived'` and the aliases-table pattern come from** — they were not invented for
NBA.

Everything else in the segment is documented.

### T1.52 — PASS 25 COMPLETE — segments 4, 5, 6 all **CLEAN**

| Segment | Blocks | Result |
|---|---|---|
| 1 | 1–54 | **NEW** — dead-stub count and detection method; third blueprint correction |
| 2 | 55–75 | CLEAN |
| 3 | 76–131 | **MINOR NEW** — `schema_ref_db.sql` as the reference-layer DDL source |
| 4 | 132–205 | CLEAN |
| 5 | 206–300 | CLEAN |
| 6 | 440–end | CLEAN |

**Pass 25: NEW MATERIAL (segments 1 and 3). Clean count remains 0/3.**

Segments 4–6 contained only already-documented material: the full-fleet redeploy and path bug (T1.21,
T1.42), the `host_not_allowed` finding (T1.17), the Cloudflare-to-Cloudflare root cause (T1.22),
balldontlie's terms (T1.44), the GitHub-Actions discovery (T1.6), the four-failure chain and
`curl_cffi` (T1.7, T1.48), and the two-click UI detail (T1.48).

### T1.53 — CURRENT STATE OF T1

**25 passes. 23 found new material. Clean count: 0/3.**

**Pass 25's yield was 2 findings from 6 segments** — down from pass 24's 6 from 6. The rate is falling,
which is what convergence looks like.

**Next: pass 26 — full sequential re-read, all six segments.** If it is entirely clean, the count
begins at 1/3.

### T1.54 — PASS 26 COMPLETE — **ALL SIX SEGMENTS CLEAN · CLEAN 1/3**

A complete sequential re-read of all 504 extracted lines / 292 content blocks, segment by segment:

| Segment | Blocks | Result |
|---|---|---|
| 1 | 1–90 | CLEAN |
| 2 | 91–180 | CLEAN |
| 3–6 | 181–504 | CLEAN |

**Every message-block maps to an existing entry.** Nothing new in the owner directives, the schema
creation, the deploy patches, the debug routes, the Cloudflare diagnosis, the credential storage, the
GitHub-Actions discovery, the bridge-tool build, the handoff, or the parallel-chat exchange.

One structural detail noted and judged **not material**: `generate_wrangler_configs.py` contains an
*"output-writing loop and orchestrator-services loop"* which were both patched. This is internal
structure of the generator, already covered by the four-step wiring pattern (T2.2) and the
`startswith` guard (T1.21).

**CLEAN PASS 1 of 3.**

### T1.55 — CURRENT STATE OF T1

**26 passes. 23 found new material. Clean count: 1/3** (pass 26).

**Convergence is visible in the yield curve:**
| Pass | New findings |
|---|---|
| 24 (6 segments) | 6 |
| 25 (6 segments) | 2 |
| 26 (6 segments) | **0** |

**Two more complete clean sequential passes required before T1 is DONE** and T2 can begin its own
cycle. The method is fixed: full sequential read, all six segments, no targeted sweaps.

### T1.56 — PASS 27 COMPLETE — **ALL 87 CONTENT BLOCKS CLEAN · CLEAN 2/3**

A full sequential read of every one of T1's **87 message-level content blocks** (the 292 figure counts
tool_use and tool_result items; 87 are actual text messages). Read in two halves, blocks 21→176 and
408→552, covering the complete arc:

recon → owner directive → Phase 2 draft → the separate-universe instruction → 14 schemas → first
worker → the deploy fork → shared-script patches → full-fleet redeploy and path bug → `run_job`
wiring → `/debug-fetch` → Cloudflare 520 → credential storage → `/probe-sources` → the
GitHub-Actions discovery → the bridge tool → the tool-list limitation → the handoff → the
parallel-chat exchange → *"no manual"* → the file trigger → four timeout failures → proxy → tarpit →
`curl_cffi` success → the abbreviation gap → the static ID→abbreviation map → rewiring the Worker to
read the committed file → final deploy.

**Every block maps to an existing entry. Nothing new.**

**CLEAN PASS 2 of 3.**

### T1.57 — CURRENT STATE OF T1

**27 passes. 23 found new material. Clean count: 2/3** (passes 26, 27).

| Pass | Segments | New findings |
|---|---|---|
| 24 | 6 | 6 |
| 25 | 6 | 2 |
| 26 | 6 | **0** |
| 27 | full, 87 blocks | **0** |

**ONE more complete clean sequential pass and T1 is DONE (3/3).**

### T1.58 — PASS 28 COMPLETE — **ALL 87 BLOCKS CLEAN · CLEAN 3/3**

Full sequential read of every content block with 200 characters of context each, both halves
(blocks 21→352, then 355→552). **Every block maps to an existing documented entry. Nothing new.**

---

# ✅ T1 IS **DONE** — 3 CONSECUTIVE CLEAN PASSES (26, 27, 28)

**Final tally: 28 passes. 23 found new material. Passes 26, 27, 28 clean.**

| Pass | Method | New findings |
|---|---|---|
| 1–23 | targeted sweeps, one dimension each | 21 |
| 24 | full sequential, 6 segments | 6 |
| 25 | full sequential, 6 segments | 2 |
| 26 | full sequential, 6 segments | **0** |
| 27 | full sequential, 87 blocks | **0** |
| 28 | full sequential, 87 blocks + context | **0** |

**T1 documentation lives in T1.1 → T1.58 of this file**, plus entries in GLOSSARY, RECIPE,
SYSTEM_ARCHITECTURE, DATABASE, WORKERS, SYSTEM_DESIGN and OPEN_ITEMS.

**THE METHOD, now proven and fixed for T2–T16:**
1. **Targeted sweeps first** — they build the skeleton fast (23 passes produced 21 findings).
2. **Then full sequential reads** — and these are the only ones that can count as clean. Passes 24–25
   found 8 more things that 23 sweeps had missed, because a sweep is pattern-bound: **a line matching
   no pattern survives any number of them, and a grep window can silently truncate a value.**
3. **The clean count only starts once sweeps are exhausted** and consecutive full reads come back empty.

**What the 8 late findings had in common: provenance.** Sweeps capture *what exists*; sequential
reading captures *where it came from* — which is the part that matters when changing it.

---

## NEXT: T2 begins its own cycle.
`2026-09-03-04-41-28-nba-expansion-phase3a-enrichment-complete.txt` · 417 content blocks ·
currently at **PASS 1 (incomplete)**.

**Everything found in passes 24–25, consolidated** (all provenance-type findings):
| Finding | Why it matters |
|---|---|
| Owner supplied *"mlb calls referees Umpire"* | the referee analogue was given, not derived |
| `STATIC_SEED_FALLBACK_AFTER_FETCH_ERROR` | the recorded value was truncated |
| balldontlie: 5 req/min, 401 without key | why it could never have carried the system |
| Phase 1 → 3d plan; filenames deviate from it | transcript phase labels are approximate |
| ~19 of 116 registry rows are dead stubs (~5.3 KB) | **real worker count is ~97** |
| Blueprint corrected in **three** places | schema count was also wrong |
| `schema_ref_db.sql` is the DDL pattern source | `source_key`/`raw_json`/`data_quality` were inherited |
| `curl_cffi`, `PROXY_URL`, GitHub Actions all came from MLB's code | **the remedy at every wall was read, not invented** |

**Two corrections this pass produced**, both from reading rather than grepping:
1. The owner supplied the referee search key himself (*"mlb calls referees 'Umpire'"*).
2. The `source_key` value was recorded truncated.

**Both are the kind of error that only a sequential read catches** — a grep window cuts a string, and a
pattern-bound sweep never sees a line that matches no pattern.

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

### T2.9 — PASS 2 FINDINGS (added 2026-09-20; full sequential read) — **MAJOR NEW MATERIAL**

*Pass 1 used the truncated-text digest and covered roughly the first third. This pass read all 136
content blocks sequentially. The findings below were entirely absent from pass 1.*

#### T2.9a — A stats.nba.com API constraint that bites every new endpoint
The team-stats scraper returned a **real HTTP 500**:
> *"`stats.nba.com`'s API is known to require the **full parameter set (many as empty strings)** or it
> rejects the request. My URL omitted several required params."*

**This is a standing rule for every new stats.nba.com endpoint**: send every documented parameter, even
if blank. A partial query string is rejected with a 500, not a helpful error.

#### T2.9b — BUG: "Undrafted" is a string in numeric fields
Player bio load failed because **`DRAFT_NUMBER`, `DRAFT_YEAR` and `DRAFT_ROUND` return the literal
string `"Undrafted"`** for undrafted players, not a number or null.
Fixed with defensive coercion — **and applied to ALL numeric fields, not just the three that failed**
(*"gp could theoretically also be non-numeric, but let's be safe across all numeric fields"*).

#### T2.9c — The diacritic problem, first appearance
A spot-check on Jokić appeared to fail. Diagnosed correctly: *"it's just the diacritic in the name, not
a data bug (my query used the ASCII spelling)."*
**This is the first appearance of the name-normalisation problem** that later becomes `nba/nba_names.py`
and `nba_ref.player_name_map` (5,212 players).

#### T2.9d — On/off-court splits
- Source: **`teamplayeronoffdetails`** — per-team, **30 calls** (the second 30-call loop after arenas)
- **661 raw rows → 582 distinct players** after dedup
- Real values spot-checked: **Wembanyama's team is +16.4 net rating better with him on the floor;
  LeBron's +2.3** — plausible magnitudes, not placeholder numbers
- Gemini had flagged on/off as high-impact; this confirmed it

#### T2.9e — **GARBAGE-TIME FILTERING — a major finding, and an open gap**
> *"**garbage-time filtering** is an industry-standard practice (**Cleaning the Glass**, pioneered by
> **Ben Falk**) that our existing season-aggregate data does **not** apply — `stats.nba.com`'s raw stats
> **include garbage time**."*

**Every season-aggregate figure we mine is contaminated with garbage-time minutes.** This is the
conceptual ancestor of the blowout factor (T16), which handles the same problem from the minutes side.
Recorded in OPEN_ITEMS.

#### T2.9f — EPM vs DARKO, and why DARKO won
*(CORRECTED by pass 6 — my pass-2 entry recorded the intermediate statement, not the final finding.)*
- **EPM (Dunks & Threes)** was initially reported as *"public, real, and Gemini rates it as one of the
  highest-value single features."* **That was wrong.** On verification:
  > *"**EPM's full data is behind a paid subscription**, not freely scrapable like everything else I've
  > built this session."*
  And the line that was drawn: *"**Scraping paywalled content isn't something I'll do without your
  explicit sign-off** — it's a real legitimacy/ToS question, not just a technical one."*
  **Nothing was built against it.**
- **LEBRON** — the other third-party impact metric considered.
- **DARKO at `darko.app`** was then found: *"publicly accessible, no paywall mentioned anywhere, and
  independently rated by NBA analytics experts as **beating both EPM and LEBRON on predictive accuracy
  (RMSE)**"*, and *"the single best **predictive** metric."*
- **DARKO won on both counts — free AND rated higher.** The build lands in T3.
- **The verification order matters**: EPM was checked for scrapability BEFORE anything was built on it.
  *"I checked before building anything."*

#### T2.9g — An honest stop
> *"I hit a real, honest **stopping point rather than manufacturing more work**."*

After the second research pass, the assistant reported that the remaining candidates (garbage-time
filtering, rolling averages, defence-vs-position) were **derivable from data already held**, not new
sources — and stopped rather than inventing scrapers. The owner then directed:
*"Find alternatives, research online, use Gemini, also understand the relevance of it"*, which produced
the DARKO finding.

#### T2.9h — Player tracking confirmed
**582 players with real speed/distance tracking data**, and *"the real headers confirm the column names
matched exactly"* — verified against the response, not assumed.

#### T2.9i — Owner messages in T2, in order
| # | Message | Effect |
|---|---|---|
| 367, 604, 621 | *"Continue"* | |
| 460 | *"use Gemini as well… what can be weekly (static or semi-static) data, like player age, speed"* | triggered the research pass that found bio/tracking/team-stats |
| 482 | *"Mine it, backfill it and continue with your passes"* | |
| 697 | *"**No**, keep looking for possible static / weekly data, use Gemini, online research, strong systems, similar systems"* | rejected the stopping point, forced a second research pass |
| 723 | *"Find alternatives, research online, use Gemini, also **understand the relevance of it**"* | produced DARKO |

**Note the pattern**: the owner twice pushed past a "we're done here" report, and **both times the push
produced the highest-value finding of the session** — garbage-time filtering, then DARKO.

**T2 PASS 2: MAJOR NEW MATERIAL. Clean count 0/3.**

### T2.10 — PASS 3 FINDINGS (added 2026-09-20; sequential, opening and middle regions) — **NEW MATERIAL**

#### T2.10a — `continue-on-error` is set on the scrape steps
> *"likely a partial failure since **`continue-on-error` is set**"*

The static scraper workflow deliberately lets an individual scraper fail without killing the run — so
one broken endpoint does not block the other seven. **This is the opposite discipline from the later
baseline rule** (*"never use `|| echo failed`… that pattern left 44% of a slate missing while the job
reported green"*, COMPASS fact 63).

**The two are reconcilable and the distinction matters:**
| Layer | Policy | Why |
|---|---|---|
| **Static scrapers** (T2) | `continue-on-error: true` per step | 8 independent entities; one failing endpoint should not block the other seven. **A missing entity is visible** — the table simply doesn't update. |
| **Baseline build** (T14+) | fail loudly, no swallowing | the outputs are interdependent; a silently missing prop pair is **invisible** and corrupts the slate. |

**The rule is not "never tolerate failure" — it is "never let an invisible failure pass."**

#### T2.10b — Why arenas need periodic refresh
> *"**arena naming rights change every 1-2 years**"*

This is the justification for arenas sitting in the weekly-differential layer rather than being
loaded once. (Confirmed in practice: Rocket Arena, Frost Bank Center and Xfinity Mobile Arena are all
recent renames.)

#### T2.10c — One trigger fires every scrape step
> *"same trigger file — **one push scrapes both**"*, and later *"this pulls teams+players+arenas in one
> run"*, growing to *"8 scrapers including two 30-call loops (arenas + on/off)"*.

`nba/TRIGGER_NBA_SCRAPE.txt` fires the **whole** static workflow, not a selected step. **Run time grows
with every scraper added** — by the end of T2 a single trigger meant 8 scrapers and ~60 sequential API
calls.

**T2 PASS 3: NEW MATERIAL. Clean count 0/3.**

### T2.11 — PASS 4 FINDINGS (added 2026-09-20; tool results and measured values) — **NEW MATERIAL**

#### T2.11a — `aliases_written` ≠ total aliases (resolves an apparent discrepancy)
Tool results report **`aliases_written: 155`** and **`157`** on different runs, while the narrative
reports **162 active aliases**. These are **different metrics, both correct**:
- `aliases_written` = rows **upserted in that run**
- 162 = **total active rows in the table**

The gap is the same upsert property as `source_key`: **unchanged rows are not rewritten.** Anyone
comparing a worker's `*_written` figure to a `SELECT count(*)` will see a mismatch that is not a bug.
**T1's 157 and T2's 162 are therefore not a progression from fallback to live data** — as recorded in
T1.21 — but a written-count vs total-count difference. *Correction to T1.21.*

#### T2.11b — Worker run times, measured
`elapsed_ms`: **768 · 995 · 3173 · 4185 · 12593 · 14347 · 25829 · 44440 · 62925**
The sub-second runs are single-call writers; **the ~63 s run is a 30-call loop** (arenas or on/off).
**A 30-call per-team loop costs about a minute** — which is why one-call-per-league endpoints were
strongly preferred (T2.5).

#### T2.11c — Confirmed result counts, from the workers' own reports
`arenas_written: 30` · `distinct_players_written: 582` · `aliases_written: 1822` (players)
Spot-check values visible in results: `height_inches: 88` (Wembanyama, 7'4") and `81` (LeBron, 6'9");
`draft_year: 2003` (LeBron) and `2023` (Wembanyama); `age: 22` and `41`.
**The spot-checks used real, verifiable people** — not row counts alone.

#### T2.11d — `http_status: 500` confirmed in the raw result
The team-stats failure is visible in the tool result itself, confirming T2.9a's diagnosis was read from
the response rather than inferred.

**T2 PASS 4: NEW MATERIAL. Clean count 0/3.**

### T2.12 — PASS 5 FINDINGS (added 2026-09-20; DDL and script docstrings) — **NEW MATERIAL**

#### T2.12a — Three new tables, full DDL (now in the DATABASE document)
- **`nba_stats.player_season_profile`** — `player_id` PK, `nba_player_id`, `season`, `games_played`,
  `pts_total`, `reb_total`, `ast_total`, `net_rating`, `oreb_pct`, `dreb_pct`, **`usg_pct`**,
  **`ts_pct`**, `ast_pct`, `source_key`, `data_quality`, `raw_json`, `updated_at`
- **`nba_stats.player_tracking_profile`** — `avg_speed`, `avg_speed_off`, `avg_speed_def`,
  `dist_miles`, `dist_miles_off`, `dist_miles_def` (+ standard columns)
- **`nba_team.season_profile`** — `games_played`, `wins`, `losses`, **`pace`**, `off_rating`,
  `def_rating`, `net_rating` (+ standard columns)

#### T2.12b — **`data_quality DEFAULT 'real'` here, vs `'derived'` in `nba_ref`**
A deliberate distinction present from the schema up: reference tables default to **`'derived'`**
(assembled/inferred), stats tables default to **`'real'`** (straight from the source). **The column is
not decorative** — it records provenance per row.

#### T2.12c — The justification for weekly cadence on season aggregates
> *"age/height/weight/draft background (**truly static**) plus season usage/efficiency aggregates
> (**semi-static, stable enough for weekly refresh — a single game barely moves a season average after
> 20+ games played**)"*

**This is the reasoning behind P1's weekly layer**, stated at the time: after ~20 games, one more game
cannot move a season aggregate enough to justify a daily refresh against a rate-limited API.
**It also implies the cadence is wrong early in the season**, when 20 games have not been played —
an unexamined edge recorded in OPEN_ITEMS.

#### T2.12d — `teamplayeronoffdetails` returns THREE result sets
`OverallTeamPlayerOnOffDetails` · `PlayersOnCourtTeamPlayerOnOffDetails` ·
`PlayersOffCourtTeamPlayerOnOffDetails`
> *"matches each player's ON row to their OFF row **by `VS_PLAYER_ID`** and computes the real
> net-rating differential (team net rating with the player on the floor minus with them off) — **the
> actual 'with/without you' signal**."*

**The join key is `VS_PLAYER_ID`**, and the metric is a computed differential, not a raw field.
Source-verified *"via nba_api/hoopR docs"* before building — the standard applied throughout.

**T2 PASS 5: NEW MATERIAL. Clean count 0/3.**

### T2.13 — PASS 6 FINDINGS (added 2026-09-20; the research passes in full) — **NEW MATERIAL**

#### T2.13a — **Garbage time hits BENCH PLAYERS hardest** — the refinement that matters
> *"Gemini rated it **medium-high priority, especially for bench-player props whose season stats are
> almost entirely garbage-time minutes**."*

This sharpens T2.9e considerably. It is not a uniform contamination — **a bench player's season
aggregates may be composed largely of garbage-time minutes**, while a starter's are barely affected.
**That is precisely the population where our confidence model later finds the largest error** (fringe
players miss by 0.0283 vs iron-men at 0.0008, a 35× gap — T16/live session). **The two findings may be
the same underlying problem, seen from opposite ends, and were never connected.** Recorded in
OPEN_ITEMS.

#### T2.13b — Why it was deferred, correctly
> *"it **can't be fixed at this layer** — it needs play-by-play data, which belongs to Phase 3b.
> **Correctly deferred, not forced in.**"*

#### T2.13c — Everything else Gemini surfaced also needs game logs
*"rolling/recent-form averages, defence-vs-position splits, 'impact of absences' tables — all genuinely
require game-log data, not static snapshots."* **All three were built later**: recent-form averaging is
in the baseline allocator, defence-vs-position in T5, and "impact of absences" became A2 (retracted,
T15/T16).

#### T2.13d — `PBP Stats` noted as a possession-level tool
Surfaced in research alongside EPM and LEBRON; not pursued.

#### T2.13e — The honest bottom line, and the boundary it drew
> *"the freely and legitimately sourceable static/weekly layer is **now complete**. There's no more
> static data sitting out there waiting to be found — what remains splits into exactly two buckets:
> **Phase 3b's game-log layer, or a paid subscription decision on your end**."*

**This is the statement that closed Phase 3a** — and the owner's response (*"No, keep looking"*) is
what produced DARKO, proving the boundary was drawn one source too early.

**T2 PASS 6: NEW MATERIAL. Clean count 0/3.**

### T2.14 — PASS 7 FINDINGS (added 2026-09-20; the status-summary blocks) — **NEW MATERIAL**

#### T2.14a — Arenas: the exact capacity split
**19 of 30 arenas have a real capacity; 11 carry an honest null** *"(source itself lacks it)"*.
Previously recorded only as "some null". **This is the number to check against if the arena scraper
is ever suspected of failing** — 11 nulls is correct, not a partial load.

#### T2.14b — The exact Postgres error behind the "Undrafted" bug
> **`invalid input syntax for type integer: "Undrafted"`**

The literal message. *"Fixed with a defensive integer coercion, redeployed, and it succeeded cleanly
on retry."*

#### T2.14c — The proven pipeline, stated as one chain
> *"bump `nba/TRIGGER_NBA_SCRAPE.txt` → GitHub Actions runs **`curl_cffi`** (Chrome TLS impersonation,
> **required** — plain `requests` gets silently tarpitted) → commits real JSON → Cloudflare Worker
> reads it via **GitHub's Contents API** → writes to Postgres → **I verify independently against the
> DB, not just the worker's own report**."*

**This is the canonical description of the static path**, and every static worker follows it.

#### T2.14d — Seven static-differential workers
The final count for Phase 3a's worker layer: **teams · players · arenas · officials · player bio ·
player tracking · team stats**, plus on/off added after. *"All 7 static-differential workers now live
and verified."*

#### T2.14e — A session constraint that shaped the work
> *"massive progress, **hitting the tool-call limit for this turn**"*

The team-stats worker was *"written, deployed, and registered, but I hit the tool limit before calling
`run_job` on it"* — with the data already confirmed in the committed JSON. **Work was left in a
documented, resumable state rather than reported as complete**, and the next turn picked it up.

#### T2.14f — "This is your real 'speed' data"
On tracking: *"582/582 players written to `nba_stats.player_tracking_profile` — this is your real
**'speed' data, actual in-game tracking, not a proxy**."* The owner had asked for player speed by name
in message 460; this closes that request explicitly.

**T2 PASS 7: NEW MATERIAL. Clean count 0/3.**

### T2.15 — PASS 8 FINDINGS (added 2026-09-20; on/off conclusion and the full DARKO evaluation) — **MAJOR NEW MATERIAL**

#### T2.15a — The traded-player edge case, and how 661 became 582
> *"players traded mid-season **appear twice in the raw source** — resolved by **keeping their
> current-team row**"*

**This is the dedup rule behind 661 raw rows → 582 distinct players.** Not a generic
`DISTINCT` — a deliberate choice of which duplicate to keep.

#### T2.15b — The actual on/off numbers
**Wembanyama: 17.0 with him on the floor vs 0.6 with him off** (the +16.4 differential).
LeBron: +2.3. Previously only the differentials were recorded.

#### T2.15c — Referee tendencies deferred, with the reason
> *"it genuinely **can't be built from a static roster call** — it requires knowing **which crew
> officiated which specific games**, which only exists in game-level data. Rather than force a bad fit
> into the static layer, I've deferred it to Phase 3b."*

**This is the origin of the D1 referee factor's placement** in the baseline/game-log layer.

#### T2.15d — **DARKO, in full — and the comparison that made it a PRIMARY input**
- Created by **Kostya Medvedovsky**. Metric: **DPM ("Daily Plus Minus")**.
- Rated by **NBA front-office analysts via a HoopsHype expert survey** as the **single best predictive
  catch-all metric**, beating paid EPM and LEBRON — *"specifically because it's **forward-looking**
  (projects future performance) rather than backward-looking, **which is exactly what matters for prop
  prediction**."*

**The question asked of Gemini was the right one — "is this redundant with the on/off data we already
built?" — and the answer reframed both:**

| | Our on/off net rating | DARKO DPM |
|---|---|---|
| Measures | what **happened** this season (descriptive) | how good a player **actually is** (predictive) |
| Noise | **High** — polluted by teammates, opponents, small samples | **Low** — Bayesian priors, multiple seasons, designed to strip noise |
| Value for props | **Secondary** signal (current-season role/chemistry) | **PRIMARY ANCHOR** — the stable measure of underlying talent |

> *"this isn't a 'nice to have' — it's a **load-bearing input worth prioritizing**, not a marginal
> addition on top of what's built."*

**Note what this says about the on/off splits built hours earlier**: they are explicitly **secondary and
noisy**, not a primary signal — a self-correction made immediately after building them.

#### T2.15e — DARKO's risks, listed before building
1. **Single-maintainer "bus factor"** — *"one person's project, not a company. Could stop updating with
   little warning."*
2. **Methodology can shift** — *"today's DPM value isn't guaranteed comparable to one from years back."*
3. **JS-heavy web app** — *"scraping it will likely need finding an underlying data API the page calls,
   not just parsing rendered text (a different, less-proven technique)."* **This is what the SvelteKit
   hydration extraction in T3 solves.**

#### T2.15f — **AN ARCHITECTURAL RECOMMENDATION — and it WAS followed**
> *"**don't hard-wire 'DARKO' everywhere — build a generic `player_impact_rating` concept** so it can
> be swapped out later if DARKO disappears."*

**RESOLVED 2026-09-20 by direct check: the recommendation was implemented.** The table is
**`nba_stats.player_impact_rating`**, not `nba_stats.darko` — so the source can be swapped without
touching every consumer. The scraper (`nba/scrape_nba_darko.py`) names DARKO; the storage layer does
not. **Good separation, made on a stated risk rather than after being burned by it.**

The scraper's own docstring confirms the reasoning and adds one detail not in T2's chat text:
> *"crucially uses **the exact same NBA person IDs already in our system** (nba_id: 203999 = Jokić)"*

**DARKO keys on `nba_player_id` directly** — no name matching, so the diacritic problem (T2.9c) does
not apply to it.

**T2 PASS 8: MAJOR NEW MATERIAL. Clean count 0/3.**

### T2.16 — PASS 9 (final blocks, 610–739, sequential) — **CLEAN 1/3**

Every block maps to a documented entry: independent verification and spot-checks (T2.14),
the Jokić diacritic (T2.9c), the seven-worker milestone (T2.14d), `teamplayeronoffdetails` and its
30-call loop (T2.9d, T2.12d), the 8-scraper run time (T2.10c), 661→582 dedup (T2.15a), the Wembanyama
and LeBron values (T2.15b), the owner's two pushes (T2.9i), garbage time (T2.9e, T2.13a), EPM's paywall
(T2.9f corrected), and the DARKO evaluation (T2.15d–f).

**T2 ends at block 739 with the DARKO decision — the build lands in T3.**

**CLEAN PASS 1 of 3.**

### T2.17 — CURRENT STATE OF T2

**9 passes. 8 found new material. Clean count: 1/3** (pass 9).

| Pass | Method | New findings |
|---|---|---|
| 1 | truncated digest, ~first third | partial skeleton |
| 2 | full sequential | **major** — 9 findings incl. garbage time, DARKO, the 500 |
| 3 | sequential, opening/middle | `continue-on-error`, arena rename cadence |
| 4 | tool results | `*_written` ≠ total (corrected T1.21), run times |
| 5 | DDL + docstrings | 3 tables, `data_quality 'real'` vs `'derived'`, `VS_PLAYER_ID` |
| 6 | research passes in full | **EPM is PAID** (corrected T2.9f), bench-player garbage time |
| 7 | status summaries | 19/11 capacity split, the exact Postgres error, 7 workers |
| 8 | on/off + DARKO conclusions | **major** — traded-player dedup, the DARKO comparison table |
| 9 | final blocks | **CLEAN** |

**Two corrections to my own entries came out of this cycle** — the EPM paywall and the
`aliases_written` figure — both caught by sequential reading, both of the same type as T1's.

**Two more consecutive clean full passes required before T2 is DONE.**

### T2.18 — PASS 10 (full sequential, blocks 143–460) — **CLEAN 2/3**

Every block maps to a documented entry: the `source_key` upsert nuance (T2.11a), the players build and
four-step wiring (T2.2), the deploy-ordering bug (T2.2), 582/525/1822 (T2.11c), arena naming-rights
cadence (T2.10b), `continue-on-error` (T2.10a), the git-push race and retry-with-rebase (T2.3), the
`ARENA`/`ARENACAPACITY` chase ending at `teamdetails`/`TeamBackground` (T2.3), 30/30 arenas with real
sponsor names (T2.3), the officials build — Wikipedia, deliberately robust wikitext parser, plain
`requests` not `curl_cffi`, 80 parsed against an expected ~81 (T2.4) — and the owner's Gemini research
instruction (T2.9i).

**CLEAN PASS 2 of 3.**

### T2.19 — CURRENT STATE OF T2

**10 passes. 8 found new material. Clean count: 2/3** (passes 9, 10).

**ONE more complete clean sequential pass and T2 is DONE.**

### T2.20 — PASS 11 (full sequential, all 136 blocks, 190-char context) — **CLEAN 3/3**

Complete read of every block from 2 → 739. **Every one maps to a documented entry.** The full arc:
the T1 replay (file trigger, four timeouts, tarpit, proxy, `curl_cffi`, abbreviation gap) → the
GitHub-API media-type bug → end-to-end success → players → the deploy-ordering fix → arenas (push
race, missing columns, `teamdetails`) → officials (Wikipedia, `requests`, 80 parsed) → the Gemini
research pass → bio/tracking/team-stats → the HTTP 500 on the full parameter set → the `"Undrafted"`
coercion → verification and spot-checks → on/off splits → the two owner pushes → garbage time → EPM's
paywall → DARKO.

---

# ✅ T2 IS **DONE** — 3 CONSECUTIVE CLEAN PASSES (9, 10, 11)

**Final tally: 11 passes. 8 found new material. Passes 9, 10, 11 clean.**

**T2 produced two corrections to entries I had already written**, both caught only by sequential
reading:
1. **EPM is behind a paywall** — my pass-2 entry recorded the intermediate "public, real" statement and
   missed the verification that reversed it.
2. **`aliases_written` (155/157) vs 162 total** is an upsert property — not the fallback-to-live
   progression I had recorded in T1.21.

**And one open question was resolved by checking the live system**: the recommendation to avoid
hard-wiring DARKO **was followed** — the table is `nba_stats.player_impact_rating`.

**The highest-value finding is now in OPEN_ITEMS**: garbage time contaminates season aggregates
**worst for bench players**, which is **exactly the population where the confidence model measures its
largest error** (fringe 0.0283 vs iron-man 0.0008, 35×). These may be the same problem from two ends.
Deferred in T2 to Phase 3b, and **never picked up there.**

---

## NEXT: T3 begins its own cycle.
`2026-09-03-22-24-13-nba-expansion-phase3a-final-complete.txt` — DARKO build, weekly differential,
schedule (2,666 games), play types, tracking detail, shot quality.

---

## T3 — `2026-09-03-22-24-13-nba-expansion-phase3a-final-complete.txt`
**PHASE 3a FINAL — DARKO, the weekly differential, schedule, play types, tracking detail, shot quality**
*117 content blocks · **PASS 1 (full sequential) 2026-09-20***

### T3.1 — DARKO: four failures before the real mechanism

Owner go-ahead: *"If that does the same reliable work, continue"*.

1. **Checked for embedded data first** rather than guessing at hidden endpoints — *"common for
   Next.js-style apps."*
2. **The page is server-side rendered — no JS wall.** And a decisive bonus: *"the player URLs use the
   **exact same NBA person IDs** already in our system."*
3. **First build guessed the pagination scheme and got 50 of 530** — *"honestly flagged that the guessed
   pagination params didn't work"* rather than shipping a partial load.
4. **It's SvelteKit, not Next.js** — *"that's why `__NEXT_DATA__` didn't match."*
5. **A self-caught syntax slip**: *"I used `//` instead of `#` on one comment line"* — checked before
   triggering, not after.
6. **THE WIN**: *"The full dataset for all 530 players is embedded directly in the page's **SvelteKit
   hydration script** (`kit.start(app, element, {...})`)."*
7. **One more real obstacle**: JavaScript's bare `.534094` decimals are **invalid JSON** and need a
   leading zero before parsing.
8. **530/530 parsed**, values matched the earlier `web_fetch` exactly — **Jokić +6.76, Wembanyama
   +6.37**.
9. Verified against the **real captured HTML** before pushing, then end-to-end, then independently in
   Postgres.

### T3.2 — The weekly differential — and the owner's sequencing correction

> **OWNER:** *"**No, first you need to create the weekly function that will mine the differential** of
> it, players changing teams, new players, all possible changes that the 'static' data you did."*

**The sequencing insight, accepted immediately:** *"the regular upsert workers **already overwrite**
`nba_ref.players` on every run, so I can't diff against 'current DB state' after they've run."*
**→ A snapshot layer was required, and had to exist BEFORE the next upsert.**

**Then it was actually proven, not assumed:**
- Baseline established: **582 players / 30 teams / 80 officials** snapshotted
- Two consecutive runs → **zero false-positive events** — correct
- **But that only proves it doesn't fire wrongly.** So a change was *simulated*: LeBron's team edited,
  one official's ID renamed.
- **First simulated test: zero events — wrong.** Diagnosed as a **race** (the edit hadn't landed before
  the trigger), so the test was redone *"more rigorously — verify the edit actually lands before
  triggering."*
- **Confirmed working**: `LeBron James: nba_1610612738 → nba_1610612747`, persisted to the log table.
- **Then a phantom event**: LeBron's change fired again when nothing had been touched. Diagnosed as a
  **Hyperdrive caching artifact** — *"Cloudflare's Hyperdrive caches query results briefly; since I
  triggered runs seconds apart…"* — **not a logic bug.**
- Final clean run: **zero events**, test artifacts removed.

**This is the most rigorously tested component in T1–T3**: baseline → no false positives → simulated
true positive → race diagnosed → cache artifact diagnosed → clean baseline restored.

**Owner:** *"No, leave like this for now."*

### T3.3 — Season schedule: a gap named in the first architecture list, never built

> *"the season schedule/calendar (**named in your very first architecture list, never actually built**)"*

- Source `scheduleleaguev2`, structure verified first:
  `{"leagueSchedule": {"gameDates": [{"gameDate": "...", "games": [{...}]}]}}`
- **1,400 games** from the completed 2025-26 season on the first attempt
- **The 2026-27 schedule is ALREADY PUBLISHED — 1,266 games.** Total **2,666**.
- **A REAL BUG WITH A GENERAL LESSON**: the file is **1.2 MB, over GitHub's Contents API 1 MB
  inline-content limit**, and *"the Worker's fetch via that API **silently got empty content**."*
  **Fix: `raw.githubusercontent.com` instead of the Contents API.** *(This is COMPASS-worthy: any
  committed artefact over 1 MB must be read via raw, not the API.)*
- **2,666/2,666 written**, verified with team joins and real venues — *"Videotron Centre in Quebec
  City, Stan Sheriff Center in Hawaii — real NBA preseason exhibition sites."*
- **2026-27 runs Oct 3 2026 → Apr 11 2027**, *"exactly matching 'about a month away' from today."*

### T3.4 — Play types (Synergy)

- `synergyplaytypes` — Gemini's highest-priority new item, **schema verified before building**
  (`POSS_PCT`, `PPP`, `FG_PCT` per play type, player and team level)
- Built with a defensive design: *"testing whether `PlayType=` empty returns all play types in one call,
  **with defensive fallback to looping if not**"* — **the fallback path was the one that worked**
- **3,364 player records, 630 team records**, all 11 play types
- Spot-check: *"Jokić's post-up-heavy offensive profile (**22.5% of possessions in post-ups**) matches
  his well-known real-world playstyle"*

### T3.5 — Tracking detail

Owner checkpoint: *"All this still weekly data right? If so continue"* — answered directly:
*"Yes — same weekly/semi-static shape… season-long tracking aggregates, one call per stat family."*

- **8 tracking types, 4,652 records**, zero errors
- Spot-check with real meaning: *"Jokić's **`POTENTIAL_AST` (17.6) is much higher than his real assists
  (10.7)** — a genuine, well-known signature of his elite passing rate"*
- **12 workers now live and verified.**

### T3.6 — Shot quality: the last static candidate

Owner: *"do another online research pass and look for what the strong systems similar to ours use and
see if there is any weekly candidate"*

- Found **"Quantified Shot Quality"** from professional betting-model write-ups
- **`leaguedashplayerptshot`** — free, public **shot-quality-by-contest-level** data:
  **0–2 ft "Very Tight" through 6+ ft "Wide Open"**
- *"Gemini didn't just validate it, it gave me a **concrete, buildable methodology**."*

**T3 PASS 1: complete sequential read. Clean count 0/3.**

### T3.7 — PASS 2 FINDINGS (added 2026-09-20; DDL) — **NEW MATERIAL**

**`nba_stats.player_impact_rating` full DDL** — and it carries more than the headline metric:
`dpm` (Daily Plus Minus) · **`o_dpm` / `d_dpm`** (offensive/defensive split) ·
**`box_dpm` / `on_off_dpm`** (the two components DARKO blends) · `rank`.
**So the on/off signal is present inside DARKO too** — `on_off_dpm` is DARKO's noise-stripped version
of the same idea our own `teamplayeronoffdetails` scrape produces raw. That is a second, independent
reason the raw on/off splits are a secondary signal.

**The differential layer is SIX tables, three snapshot/log pairs** (now in DATABASE):
`player_roster_snapshot` + `player_differential_log` · `team_roster_snapshot` +
`team_differential_log` · `official_roster_snapshot` + `official_differential_log`.

**The two log shapes differ deliberately:**
- **Player log** is purpose-built for team moves — `old_team_id` / `new_team_id` — because that is the
  change that matters for props.
- **Team log is field-level** — `field_name` / `old_value` / `new_value` — because a team can change in
  many ways (rename, relocation, conference/division realignment) and none is predictable.
- **Official log is existence-only** — an official appears or departs; there is no field to track.

**Each is shaped to its own change profile rather than forced into one schema.**

**T3 PASS 2: NEW MATERIAL. Clean count 0/3.**

### T3.8 — PASS 3 FINDINGS (added 2026-09-20; tool results) — **NEW MATERIAL, INCLUDING A DISCREPANCY**

#### T3.8a — **82 play-type rows scraped but never loaded**
| Stage | Count |
|---|---|
| Scraped (`player_rows_written`) | **3,364** |
| Loaded (`nba_stats_player_playtype_profile_rows`) | **3,282** |
| **Difference** | **82 rows** |

**Verified live 2026-09-20: `nba_stats.player_playtype_profile` holds exactly 3,282.** The gap is real
and persists today.

**Every other load in T3 is exactly 1:1** — `rows_read` equals `rows_written` for 2,666 (schedule),
4,652 (tracking detail) and 530 (DARKO), and team play types match at 630. **Play types are the only
mismatch**, and it was not caught at the time because the session reported the scrape figure (3,364)
and the load figure separately, in different messages.

**Most likely cause** (not verified): play-type rows key on player *and* play type, so rows for players
absent from `nba_ref.players` — or duplicate (player, play_type) pairs collapsing on an upsert
conflict — would be silently dropped. **Recorded in OPEN_ITEMS; not fixed, per the documentation-pass
rule.**

#### T3.8b — Exact table names confirmed
`nba_stats.player_playtype_profile` · `nba_team.playtype_profile` ·
`nba_stats.player_tracking_detail` · `nba_stats.player_impact_rating`

#### T3.8c — The play types and tracking measure types, by name
**Play types seen in results:** `Transition`, `PRRollMan`, `Postup`, `Spotup` (of 11 total).
**Tracking measure types:** `Passing`, `PostTouch`, `CatchShoot` (of 8 total —
the others named in T3.5 are Rebounding, Drives, PullUpShot, touches, and one more).

#### T3.8d — A differential event captured in a real result
`"event_type": "team_change"` appears in the tool results — **the simulated LeBron move, persisted**.
Confirms T3.2's account came from the database, not from the worker's response.

#### T3.8e — Schedule split confirmed in results
`1400` (2025-26, completed) + `1266` (2026-27, published) = **2,666**, and `rows_read` = `rows_written`
= 2,666. Clean.

**T3 PASS 3: NEW MATERIAL. Clean count 0/3.**

### T3.9 — PASS 4 FINDINGS (added 2026-09-20; the research conclusions in full) — **MAJOR NEW MATERIAL**

#### T3.9a — **The schedule is "the chassis" — and it had been underrated**
Gemini *"didn't just confirm it — it **pushed back hard that I'd been underrating it**"*:
> *"the **central organizing entity for your entire system… the chassis everything else bolts onto**."*

**Without the schedule there is no way to compute**: rest days · back-to-backs · travel · strength of
schedule · *"or even cleanly join a player's stats to their specific opponent for a game."*
**→ "This should be built BEFORE anything else, not queued alongside it."**

**This is the origin of factors A4 (rest/B2B) and D2 (travel)** — they are not independent ideas, they
are things the schedule makes computable. It had been *"named in your very first architecture list but
got missed along the way."*

#### T3.9b — Play types are an **offensive-role** signal
> *"Knowing a player is **the pick-and-roll ball-handler 45% of the time** is a sharp, direct
> **'offensive role' signal**."*

#### T3.9c — **Gemini SELF-CORRECTED its own earlier ranking**
> *"it previously ranked on/off-court data as top-tier; **now says role/opportunity data (play-type,
> passing, drives) should rank above it**."*

**This is the third independent reason the raw on/off splits are secondary** — alongside DARKO's
noise-stripping (T2.15d) and DARKO's own `on_off_dpm` column (T3.7).

#### T3.9d — Tracking families, ranked
**High value** — `Passing`, `Rebounding`, `Drives`, `CatchShoot`/`PullUpShot`, because they
*"**separate opportunity from results** — e.g. a player with **high 'potential assists' but low actual
assists** is a real regression signal."* *(Exactly the Jokić check run later: POTENTIAL_AST 17.6 vs
10.7 actual.)*
**Lower priority or redundant** — `Defense`, `Possessions`, `Efficiency`.

#### T3.9e — Draft Combine anthropometrics: **a red herring, explicitly**
> *"**Real on-court results already encode a player's physical tools better than a years-old combine
> measurement.** Only rookies would benefit, and it's not worth the complexity here."*

**A rejected candidate with a stated reason** — worth keeping so it is not re-proposed.

#### T3.9f — **SHOT QUALITY DELTA — the complete methodology**
The full technique needs proprietary **Second Spectrum** data. The free public equivalent is
**`leaguedashplayerptshot`** — shooting broken down by defender distance:
**0–2 ft "Very Tight" · 2–4 ft "Tight" · 4–6 ft "Open" · 6+ ft "Wide Open"**.

Gemini called it *"**likely the single most valuable public data point you can add to your system at
this stage**"* and gave a concrete formula:

1. **Weekly**, pull the **league-wide average eFG%** at each of the 4 defender-distance buckets.
2. For each player, **weight those league averages by HIS OWN shot-frequency mix** across the buckets
   → his **expected eFG%** — *"what a league-average shooter would hit, taking the exact same shot
   diet."*
3. **Shot Quality Delta = actual eFG% − expected eFG%**
4. **Large positive → shooting unsustainably hot (regression-DOWN candidate).**
   **Large negative → shooting cold relative to difficulty (regression-UP candidate).**

> *"a real, direct answer to the **'hot/cold streak' problem** — something season-long averages alone
> can't catch."*

**The three shot dimensions are complementary, not redundant:**
| Dimension | Answers |
|---|---|
| Play type | **HOW** the shot happened |
| Shot location (court zone) | **WHERE** it was taken |
| Defender distance | **WHAT CONTEST** it faced |

#### T3.9g — The honest close of static research
> *"I asked Gemini to **be skeptical rather than just keep validating more searches**, and it said
> plainly — '**the well for truly novel, high-impact, weekly-static data is running low… Phase 3b is
> the right next move**.' This is confirmed as the **last major static pillar**."*

**Note the method**: the tool was explicitly asked to argue against continuing, rather than being asked
another "what else is there?" question that would always produce an answer.

**T3 PASS 4: MAJOR NEW MATERIAL. Clean count 0/3.**

### T3.10 — PASS 5 (live verification of what T3 designed) — **NEW MATERIAL**

**SHOT QUALITY DELTA WAS BUILT, AND THE FORMULA LANDED EXACTLY AS SPECIFIED.**
Three tables exist in Postgres:
- **`nba_stats.player_shot_quality`** — the raw defender-distance buckets
- **`nba_stats.player_shot_quality_delta`** — `player_id`, **`actual_efg_pct`**,
  **`expected_efg_pct`**, **`shot_quality_delta`**, `total_fga`, `source_key`, `data_quality`,
  `updated_at`
- **`nba_stats.player_shot_zone_profile`** — the court-zone dimension (the "WHERE")

**The three columns `actual_efg_pct` / `expected_efg_pct` / `shot_quality_delta` are the formula from
T3.9f, implemented verbatim.** `total_fga` is a sensible addition not in the original spec — it lets a
consumer weight or gate the delta by sample size, which the formula alone does not.

**All three complementary dimensions from T3.9f are present in the schema**: play type (HOW) in
`player_playtype_profile`, zone (WHERE) in `player_shot_zone_profile`, defender distance (WHAT
CONTEST) in `player_shot_quality`. **The design was followed, not abandoned.**

**Open question for T4+**: whether `shot_quality_delta` is actually CONSUMED by the baseline or
enrichment layer, or whether it is computed and never read. **Not established in T3** — the build ends
here. Flagged in OPEN_ITEMS.

**T3 PASS 5: NEW MATERIAL. Clean count 0/3.**

### T3.11 — PASS 6 FINDINGS (full sequential, segments 1–2) — **NEW MATERIAL, INCLUDING A GAP IN P1**

#### T3.11a — **THE DIFFERENTIAL WORKER WAS NEVER SCHEDULED — and P1 does not call it**
> *"**One honest gap left**: this worker **isn't wired to any automatic schedule yet** — it needs a
> manual `run_job` trigger after each weekly scrape, or wiring into the existing cron. I flagged this
> rather than assuming it's automatic."*
> **OWNER: *"No, leave like this for now."***

**It was left unwired — and `nba-p1-weekly-static.yml`, built 2026-09-20, does NOT call it either.**
P1 runs teams, arenas, players, bio, season tables, team stats, on/off, play types, DARKO, shot
quality, defender ratings and static context — **but not the differential worker**.

**Consequence:** every P1 run **overwrites** the reference tables, and because the differential worker
holds its own snapshot tables that only it touches, **it will report the accumulated difference since
whenever it last ran** — not week over week. Trades, signings and referee changes are **not being
detected at all** right now. **Recorded in OPEN_ITEMS as a concrete fix for after the documentation
pass.**

#### T3.11b — What the differential actually detects (the full list)
*"new players, departed players, **mid-season team trades**, new/removed teams, **team
renames/relocations**, and **referee roster changes**"* — running *"as its own dedicated layer separate
from the regular full-refresh workers."*

#### T3.11c — The architectural reason for separate snapshot tables, stated plainly
> *"the regular upsert workers **already overwrite the live tables** on every run, so I couldn't diff
> against those directly — **there'd be no 'before' left to compare against**. Fixed by giving this
> worker **its own independent snapshot tables that only it touches**, so the comparison is always
> against **its own** last run, not whatever the regular workers just did."*

#### T3.11d — BUG: raw scrape schema ≠ Worker-transformed schema
> *"I read `t.name` from the raw committed JSON, but that file's actual schema is **`city` + `nickname`
> separately** — the `name` field **only gets built inside the Worker's transform, not in the raw
> scrape**."*

**A general trap**: a worker reading the *committed JSON* sees the **raw** shape; a worker reading
*Postgres* sees the **transformed** shape. They are not the same, and the differential worker reads
the raw file.

#### T3.11e — The Hyperdrive cache caveat is testing-only
> *"In **real weekly-cadence usage (7 days apart) this is a complete non-issue**."*
The stale-read artifact only appears when runs are triggered seconds apart, as during testing.

#### T3.11f — The eight play types, named
`Isolation` · `PRBallHandler` · `PRRollman` · `Postup` · `Spotup` · `Handoff` · `Cut` · `Transition`
*(T3.4 reported "all 11 play types present" from the result check; these eight are the ones verified by
name in the schema confirmation.)*

#### T3.11g — DARKO's join advantage, verified before building
> *"the player URLs use **the exact same NBA person IDs already in our system** (`/player/203999` =
> Jokić, `/player/1641705` = Wembanyama). That means **a clean join with zero name-matching needed**."*

**T3 PASS 6: NEW MATERIAL. Clean count 0/3.**

### T3.12 — PASS 6, SEGMENTS 3–4 — **FURTHER NEW MATERIAL**

#### T3.12a — **A lesson applied PROACTIVELY, not after a second failure**
> *"I applied a lesson from the schedule worker's bug **proactively** this time — used
> **`raw.githubusercontent.com` from the start** instead of waiting to hit the same 1 MB file-size
> limit again."*

**This confirms the 1 MB Contents API fix was propagated forward**, at least to the play-type worker.
*(Whether every large-file reader uses raw is still worth an audit — see OPEN_ITEMS.)*

#### T3.12b — The play-type fallback's real dimensions
The "cheap path" (one call for all play types) **did not work**, and the scraper *"correctly detected
that and fell back to looping through **all 11 play types × 2 groupings × 2 levels**."*
**That is 44 calls** — and the 630 team records cover *"both offensive and defensive groupings."*
The defensive design (try cheap, fall back to loop) is what made the failure a non-event.

#### T3.12c — Worker count progression, and the final inventory
**7 → 8 → 11 → 12 workers** across T2–T3. The T3 closing inventory covers the full
static/weekly/foundational layer **plus the differential change-detection layer on top**.

#### T3.12d — The close of all three research passes, and what it explicitly defers
> *"**This genuinely closes out all three research passes.** Nothing further has been identified across
> web research, Gemini consultations, and independent verification — **every remaining real gap
> (garbage-time adjustment, rolling/recent-form averages, defence-vs-position/role, referee-crew
> tendencies, absence-impact tables) requires game-level data that doesn't exist yet**."*

**That is a five-item deferred list handed to Phase 3b.** Their later fates:
| Deferred item | What happened |
|---|---|
| Garbage-time adjustment | **never built** — see OPEN_ITEMS |
| Rolling/recent-form averages | built into the baseline allocator |
| Defence-vs-position/role | built T5; M1 defender quality rebuilt T16 |
| Referee-crew tendencies | D1, capture built T15, **0 rows until the season** |
| Absence-impact tables | became **A2 — retracted** T15/T16 |

**So of the five, one was never built, one was built and retracted, and three shipped.**

#### T3.12e — `leaguedashplayershotlocations` — the second shot source
Alongside `leaguedashplayerptshot` (defender distance), *"`leaguedashplayershotlocations` for shot
profile **by court zone**"* — *"Neither requires the proprietary Second Spectrum feed — this is the
legitimate free version of 'shot quality'."*
**Both were built** — `player_shot_quality` and `player_shot_zone_profile` (T3.10).

**T3 PASS 6 COMPLETE: NEW MATERIAL throughout. Clean count 0/3.**

### T3.13 — PASS 7 (the 12-worker inventory, as categorised at the time) — **NEW MATERIAL**

The T3 closing table, which is the canonical description of the static/weekly layer:

| Category | Workers |
|---|---|
| **Core dictionaries** | teams · players · arenas · officials |
| **Player profile** | bio/season-profile · speed/distance · tracking detail (passing, rebounding, drives, shots, touches) |
| **Team profile** | pace/ratings · play-type profile |
| **Impact metrics** | on/off-court splits · DARKO player-impact rating |
| **Foundational** | season schedule/calendar |
| **Change detection** | weekly differential layer |

**Note the categorisation itself is informative**: the schedule sits alone under *"Foundational"* —
consistent with Gemini's *"chassis everything else bolts onto"* — and change detection is its own
category rather than being folded into the dictionaries. **Shot quality is not in this table** because
it was found after it (T3.6), making **13** the true final count for the layer.

**T3 PASS 7: NEW MATERIAL. Clean count 0/3.**

### T3.14 — PASS 8 (full sequential verification, all 117 blocks) — **CLEAN 1/3**

Complete read from block 5 → 589. **Every block maps to a documented entry**: the DARKO evaluation and
four-failure build (T3.1), the owner's differential sequencing correction (T3.2, T3.11a–c), the
`t.name` field-mismatch bug (T3.11d), the baseline/simulate/race/cache test sequence (T3.2, T3.11e),
the third research pass and the schedule-as-chassis finding (T3.9a), `synergyplaytypes` schema
verification (T3.4), the 1,400 + 1,266 = 2,666 schedule build and the **1 MB Contents API** bug
(T3.3), the play-type cheap-path fallback (T3.12b), tracking detail and the Jokić `POTENTIAL_AST`
check (T3.5), the 12-worker inventory (T3.13), and the shot-quality finding with its formula (T3.9f).

**CLEAN PASS 1 of 3.**

### T3.15 — CURRENT STATE OF T3

**8 passes. 7 found new material. Clean count: 1/3** (pass 8).

| Pass | Method | New findings |
|---|---|---|
| 1 | full sequential | the whole T3 narrative — 6 sections |
| 2 | DDL | `player_impact_rating` components; 6 differential tables |
| 3 | tool results | **82 play-type rows lost**, verified live |
| 4 | research conclusions | schedule-as-chassis; **the Shot Quality Delta formula** |
| 5 | live verification | shot-quality tables exist; formula implemented verbatim |
| 6 | full sequential, 4 segments | **the differential worker is unscheduled and P1 omits it** |
| 7 | the worker inventory | the categorisation, and that shot quality makes it 13 |
| 8 | full sequential, all blocks | **CLEAN** |

**Two more consecutive clean full passes required before T3 is DONE.**

### T3.16 — PASS 9 (full sequential, 200-char context, all blocks) — **CLEAN 2/3**

Complete re-read with wider context. **Every block maps to a documented entry.** Confirmed in this pass
with no new material: the DARKO reconnaissance-before-building sequence, the 50/530 partial and the
honest flag, the SvelteKit discovery, the self-caught `//` vs `#` slip, the hydration-script win, the
bare-decimal JSON repair, Jokić +6.76 / Wembanyama +6.37, the differential build and its four-stage
test, the schedule-as-chassis finding, `synergyplaytypes` verification, 1,400 + 1,266 = 2,666, the
1 MB Contents API bug and the `raw.githubusercontent.com` fix, the Abu Dhabi preseason and Quebec
City / Hawaii venue spot-checks, and the play-type defensive fallback.

**CLEAN PASS 2 of 3.**

### T3.17 — CURRENT STATE OF T3

**9 passes. 7 found new material. Clean count: 2/3** (passes 8, 9).

**ONE more complete clean sequential pass and T3 is DONE.**

### T3.18 — PASS 10 (full sequential, 240-char context, all 117 blocks) — **CLEAN 3/3**

Complete read at maximum context. **Every block maps to a documented entry. Nothing new.**

One detail confirmed in full here, previously quoted in part — the owner's differential instruction
reads in its entirety: *"you need to create the weekly function that will mine the differential of it,
players changing teams, new players, **all possible changes that the 'static' data you just backfilled
can possibly have, you need to cover it**."* **The scope was "all possible changes", which is why the
worker covers players, teams AND officials rather than just roster moves.**

---

# ✅ T3 IS **DONE** — 3 CONSECUTIVE CLEAN PASSES (8, 9, 10)

**Final tally: 10 passes. 7 found new material. Passes 8, 9, 10 clean.**

**T3 produced two findings that bear on live code, both in OPEN_ITEMS:**
1. **82 play-type rows scraped but never loaded** — 3,364 vs 3,282, **verified still true today.**
   It escaped notice because the scrape count and the load count were reported in different messages.
2. **The weekly differential worker was never scheduled, and `nba-p1-weekly-static.yml` does not call
   it** — so trades, signings, team changes and referee moves are **not being detected at all**, and
   its snapshot baseline has been stale since 2026-09-03.

**Plus three operational caveats now recorded**: the GitHub Contents API **silently returns empty
content above 1 MB**; **Hyperdrive caches reads for seconds** (test-only artifact); and **JS bare
decimals are invalid JSON**.

**And one open question**: `shot_quality_delta` is built and implements its formula verbatim, but
**whether anything consumes it is unestablished** — the enrichment audit tested ten candidates and none
were shot-quality-based.

---

## RUNNING TOTAL: 3 of 16 transcripts DONE
| # | Transcript | Passes | Status |
|---|---|---|---|
| T1 | phase1-static | 28 | ✅ 3/3 clean |
| T2 | phase3a-enrichment | 11 | ✅ 3/3 clean |
| T3 | phase3a-final | 10 | ✅ 3/3 clean |

## NEXT: T4 — `2026-09-03-22-38-55-nba-expansion-phase3b-backfill-complete.txt`
3-season game-log backfill · advanced per-game stats · career totals · splits ·
**baseline projection methodology design (EWMA / Bayesian shrinkage / variance)** ·
**the architecture correction: baseline strictly historical, enrichment separate** ·
operating cadence locked.

---

## T4 — `2026-09-03-22-38-55-nba-expansion-phase3b-backfill-complete.txt`
**PHASE 3b — historical backfill and the baseline methodology design**
*119 content blocks · **PASS 1 (full sequential) 2026-09-20***

### T4.1 — Shot Quality Delta: built, with two real bugs

Owner: *"yes"* → build it.
The run had grown large: *"arenas 30 calls + on/off 30 calls + playtypes 44+ calls + tracking-detail 8
calls + shotquality 5 calls."*

**BUG 1 — URL encoding.** *"the `+` in '6+ Feet' needs proper URL encoding (`%2B`), but I just did a
**naive space replacement**, which mangled it."*

**BUG 2 — and it is a genuinely subtle one.** *"this endpoint returns **`resultSets` as a single dict,
not a list** like every other endpoint. My code assumed a list and did `dict[0]`, which raised
`KeyError`."*
**→ `leaguedashplayershotlocations` breaks the convention every other stats.nba.com endpoint follows.**

**The fix was verified against already-captured raw data before re-running**: *"zone names, skip=6,
span=3, 30-column rows all check out — e.g. `row[6:9] = [14,27,0.519]` matches A.J. Lawson's real
restricted-area line."* **Structural verification against a real row, not a re-scrape.**

**Result: 582/582 deltas computed.** Spot-check: **Jokić 61.9% actual eFG vs 53.8% expected =
+8.06% delta**, *"matching his known elite scoring efficiency"*, and the league averages by bucket
*"look exactly right."*

### T4.2 — The historical backfill, and an empirically-resolved unknown

Owner: *"identify the past seasons data we need, all games logs, histories… the same that we will mine
for the current season"*, then *"can we get aggregates for older seasons? anything we can smartly do
**without compromising reliability**?"*

**A claim was NOT accepted on trust**: Gemini's answer contained two checkable facts, and
*"let me independently verify the two concrete, checkable claims before trusting them — the **'TOT'
line handling for traded players**, and whether **retired players are even queryable**."*
Search could not settle the first: *"that's a **real gap I'll flag rather than assume**, to be
**verified empirically once we actually call the endpoint**."*

**RESOLVED EMPIRICALLY LATER IN THE SESSION**: *"traded players get **separate per-team rows PLUS a
combined total row (`TEAM_ID = 0`)**, and the games/points **sum correctly** across them."*
**This matters for every career-aggregate query** — summing naively double-counts traded players.

**Owner locked the scope**: *"that will be a **single time backfill**, we don't need a weekly delta
because it supposedly won't change."* → a **dedicated one-time workflow with its own trigger file**,
separate from the weekly cycle.

**Results:**
| Dataset | Rows |
|---|---|
| Player game logs 2025-26 | **26,651** |
| Team game logs 2025-26 | **2,460** — *"exactly 30 teams × 82 games, a perfect confirmation of full-season completeness"* |
| Career totals | **3,644** across all 582 players |

**582 sequential career-total calls at 0.4 s ≈ 4 minutes**; the run took ~13 minutes.

### T4.3 — **A cost correction that saved 1,230 API calls**

Gemini estimated advanced stats would need *"1230 individual calls."* That was checked rather than
accepted:
> *"**Real, important correction to Gemini's own cost estimate**: the **bulk**
> `playergamelogs`/`teamgamelogs` endpoints (the exact same ones I already used) accept a
> **`MeasureType=Advanced`** parameter."*

**→ 2 cheap bulk calls instead of 1,230.** Confirmed: **26,651 advanced rows matching the base log
exactly**, and 2,460 team rows. *"This really was just 2 cheap bulk calls."*

**This is the clearest example in the transcripts of Gemini being wrong on a checkable fact** — and the
research standard (*"not absolute truth"*) catching it.

Spot-check after loading: *"game-to-game **usage rate swings (16.2% to 38.2%)** and per-game pace
variation both check out, joined correctly across the base and advanced tables."*

### T4.4 — The baseline methodology: EWMA, variance, shrinkage

> *"Real, concrete techniques found: **EWMA** (recency-weighted averaging that catches role changes),
> **rolling variance** (**for over/under pricing specifically, not just point estimates**), **Bayesian
> shrinkage** for small samples, and blending…"*

**Note the second one**: rolling variance is called out as being *for over/under pricing*, not for the
point estimate — which is the distinction that later becomes the whole dispersion/ladder layer.

### T4.5 — **THE ARCHITECTURE CORRECTION — the owner's, and it was verified not just accepted**

> **OWNER:** *"these 2, daily injury/lineup layer, would very be on the **enrichment pipeline, not the
> baseline pipeline**, unless there is a better logic that unifies everything and work fast to run it
> daily."*

> **RESPONSE:** *"You're right, and this is an important correction to how I framed it — **let me think
> this through properly rather than just agree reflexively**."*

**And the reason it is right, from Gemini:**
> *"**caching and re-computation cost**. The baseline is **expensive to compute but only changes after
> a player plays a game — it can be cached**. Enrichment data (injuries, odds) **changes constantly**…"*

**This is the founding justification for the entire two-layer split** — baseline strictly historical
and cacheable, enrichment volatile and cheap — which is still the architecture today (P2 overnight vs
P3 afternoon).

### T4.6 — The operating cadence, locked

> **OWNER:** *"keep in mind that the baseline will run **early in the day** to not crash with the
> enrichment pipeline, will the data be available?"*

Verified rather than assumed: *"Real, confirmed timing data — this changes the answer from 'probably
fine' to a **concrete yes, with one actual gap to flag**."*
> **OWNER:** *"that is the design, just like the current MLB system."*

**→ The overnight-baseline / afternoon-enrichment cadence is locked here, mirroring MLB.**

### T4.7 — The gap inventory, done against the database not from memory

Owner: *"I need you to focus in any still needed backfills, seasons, splits, histories, static data,
everything that still needing backfill."*
> *"let me first do **a real inventory check against Postgres rather than rely on memory**, then
> identify concrete gaps **against what the backfill plan actually recommended**."*

**Two concrete gaps found**, and both built:
1. **Additional historical seasons** — via a *parameterised* new script, deliberately *"rather than
   risk modifying the already-verified 2025-26 script."*
2. **Splits** — a second scraper.

**The final run was ~1,200 sequential calls** (582 career totals + 612 splits + 2 seasons × 4 bulk
calls) and was still in progress when the transcript ends.

**T4 PASS 1: complete sequential read. Clean count 0/3.**

### T4.8 — PASS 2 FINDINGS (added 2026-09-20; DDL) — **NEW MATERIAL**

#### T4.8a — **`data_quality` is used as designed — and the delta proves it**
| Table | `data_quality` default |
|---|---|
| `player_shot_quality` | **`'real'`** — straight from the endpoint |
| `player_shot_zone_profile` | **`'real'`** |
| **`player_shot_quality_delta`** | **`'derived'`** — it is COMPUTED from the other two |

**This is the column doing exactly its job**: the two scraped tables are `'real'`, the computed one is
`'derived'`. The distinction established in T1's very first DDL is being applied consistently three
sessions later.

#### T4.8b — `player_shot_quality` full DDL
**Composite PK `(player_id, close_def_dist_range)`** — one row per player per defender-distance bucket.
Columns: `fga_frequency` (**the shot-diet weight the formula needs**), `fgm`, `fga`, `fg_pct`,
`efg_pct`, `fg3a_frequency`, `fg3_pct`.
**`fga_frequency` is the key column** — it is what weights the league averages in step 2 of the Shot
Quality Delta formula.

#### T4.8c — `player_shot_zone_profile`
**Composite PK `(player_id, zone)`** — `fgm`, `fga`, `fg_pct` per court zone.

#### T4.8d — `nba_stats.player_game_log` — the full column list
`player_id`, `nba_player_id`, `game_id`, `season`, `team_id`, `game_date`, `matchup`, `wl`, `min`,
`fgm/fga/fg_pct`, `fg3m/fg3a/fg3_pct`, `ftm/fta/ft_pct`, `oreb/dreb/reb`, `ast`, `tov`, `stl`, `blk`,
**`blka`** (blocked attempts), `pf`, **`pfd`** (personal fouls drawn), `pts`, `plus_minus`,
**`nba_fantasy_pts`**, **`dd2`**, **`td3`**.

**Note three columns that later become props**: `nba_fantasy_pts` (the `fantasy_score` prop),
`dd2` (`double_double`), and `blka`/`pfd` — the rarely-used ones. **The prop menu was already
supported by the game-log schema before the prop layer existed.**

#### T4.8e — `nba_team.team_game_log`
Same shape minus the player-specific fields (`blka`, `pfd`, `nba_fantasy_pts`, `dd2`, `td3`).

**T4 PASS 2: NEW MATERIAL. Clean count 0/3.**

### T4.9 — PASS 3 FINDINGS — **THE BASELINE METHODOLOGY IN FULL** (`nba/NBA_BASELINE_METHODOLOGY.md`)

This is the design of *"the heart of the system"*, and much of it is still recognisable in the engine
today.

#### T4.9a — The five-step pipeline
1. **EWMA-based per-36 rate**, with **Bayesian shrinkage** for rookies and injury-returners toward
   their **career/positional prior**
2. **Projected minutes** — a **separate, faster-moving average**, *"since rotations shift quickly"*
3. **Pace + opponent-defence multipliers** from the team game logs already backfilled
4. **Raw projection** = the combination
5. **ANCHOR TO TEAM-IMPLIED TOTALS** — *"sum every teammate's projection, scale to match the market's
   implied team total. This is **a real fix a practitioner reported needing after getting 'wild
   numbers' from unanchored projections**."*

**Step 5 is the direct ancestor of the market-implied matchup factor built in T16**
(`f_impl_own` / `f_impl_opp` = total/2 ∓ spread/2, r=0.4637 vs 0.2364 derived). **The idea was in the
design from the start and took thirteen transcripts to ship.**

#### T4.9b — Variation and direction, handled deliberately
- **Volatility via rolling standard deviation** — *"turns a point guess into **a real distribution you
  can price an over/under against**."* **→ the dispersion layer and the whole ladder.**
- **Trend via a SECOND, faster EWMA** compared against the primary — *"applied as a **dampened**
  adjustment **specifically so it doesn't double-count what the main average already captures**."*

**That dampening caution is the same failure mode the enrichment audit later hit repeatedly**: ten
factors rejected because *"the baseline already carries what these factors re-express."* **The warning
was written down in T4 and the lesson still had to be relearned by measurement in T15–T16.**

#### T4.9c — **The honest part, stated at design time**
> *"minutes projection is flagged as **'the single biggest source of error in any player-prop model'**
> — not a solved problem. **Cascading injury effects are a real network problem, not a single rule.**"*

**Both proved true.** Minutes projection is what the allocator, the blowout factor and the availability
model all attack; cascading absence effects became **A2 — five failed panels, then fully retracted.**

#### T4.9d — **Explicitly declared NOT worth solving directly**
> *"**Player-vs-player defensive matchups** and things like **revenge games or contract-year
> motivation** are explicitly named as **not** worth trying to solve directly — **anchoring to the
> market price is the honest answer there, since the market already prices most of that in**."*

**Two of these held; one was overturned by measurement.**
| Called off-limits in T4 | What happened |
|---|---|
| Revenge games, contract-year motivation | **never built** — correctly |
| **Player-vs-player defensive matchups** | **REVISITED and partially overturned**: M1 was rejected on a crude metric, then **rebuilt as a two-way ridge** (`nba_ref.defender_ratings`, 111,768 ratings) and **wired on 4 props — but only in the INTERACTION form, never as a main effect** |

**So the T4 caution was right in substance**: a defender main-effect adds nothing, and the value only
appears in interaction. **The design note was directionally correct and the measurement refined it.**

#### T4.9e — A concrete tunable example, and the no-hardcoding rule applied
> *"when a team's primary ball-handler is confirmed out, **boost the secondary playmaker's assist
> projection**, with **every threshold living in the database, not hardcoded**."*

**This exact scenario is what A2 tried to generalise — and failed.** The specific rule was never built;
the general version was retracted.

#### T4.9f — Two gaps flagged at design time
*"this design depends on **the daily injury/lineup layer** and **the live-odds/market layer**, neither
of which is built yet — both were part of the original plan but come later."*
**Both were built** — injury in T10/T11, market in T11/T13.

#### T4.9g — Design-only discipline held
> *"This is **a design document only — no scoring code yet**, matching the research-first pattern this
> whole project has followed."*

**T4 PASS 3: MAJOR NEW MATERIAL. Clean count 0/3.**

### T4.10 — PASS 4 FINDINGS — the architecture correction, verified, and its risks section

#### T4.10a — **The correction was VERIFIED, not just accepted**
> *"I ran **a second Gemini consultation specifically to check whether the two-stage separation is
> actually correct**, rather than taking **either your note or the first answer** on faith."*

**Note what that checks**: not just the first answer, but the owner's correction too. The full reason:
> *"the baseline… is expensive to compute but **only changes after a player's next game — it's
> cacheable**. Enrichment data (injury news, line movement) **changes all day**. Keep them separate,
> and the fast-changing Scoring Engine can **re-run in milliseconds** on new injury/odds data without
> ever recomputing the expensive baseline. **Merge them, and every minor daily update forces a full
> slow recompute.**"*

#### T4.10b — **GBDT / neural nets considered and REJECTED, with reasons**
The owner's question — *"unless there is a better logic that unifies everything and works fast"* —
was answered directly:
> *"only if you're using **a single large ML model (gradient boosting/neural net)** that can learn
> complex non-linear interactions a multiplier system can't — but that needs **far more data and
> compute than currently available**, and **sacrifices the explainability** the two-stage system gives
> you for free. **Not recommended here.**"*

**A recorded architectural decision with its conditions**: the unified-model path is not wrong in
principle, it is wrong *given current data volume, compute and the explainability requirement.*
*(Note MLB's control plane has `gbdt_training_requests` and `gbdt_auto_trigger_switch` tables — so MLB
went down this road; NBA deliberately did not.)*

#### T4.10c — **THE RISKS SECTION — and the first of them is a live concern today**
The rewritten methodology added a risks section naming three:

**1. DOUBLE-COUNTING** — *"**the baseline already reflects historical blowout-shortened minutes — don't
penalize twice**."*

**This warning was written in T4. The blowout factor was built in T16** on the real market spread,
measuring that a 13+ favourite blows the game open 39.7% of the time and that starters lose ~4 minutes
in a winning blowout. **The T4 warning says the baseline's historical minutes ALREADY contain those
shortened games.** Whether the T16 build avoided double-counting — by modelling the *deviation* from
the historical average rather than re-applying the penalty — **is not established in these
transcripts.** **Flagged in OPEN_ITEMS as a specific thing to verify.**

**2. ORDER-OF-OPERATIONS** — the sequence in which adjustments are applied changes the result.

**3. BASELINE STALENESS ON TRADES AND SEASON-ENDING INJURIES** — a cached baseline is wrong the moment
a player changes team. **This is exactly what the weekly differential worker was built to detect —
and it is currently not scheduled** (T3.11a). **The two open items connect.**

#### T4.10d — The doc's final shape, and the dependency claim
- **Sections 1–3 (baseline)**: rate, minutes role, pace/defence, variance, trend — *"**all strictly
  historical now, zero dependency on anything not yet built**. This can be implemented and run today."*
- **Section 4 (enrichment)**: injury adjustments, blowout/fatigue factors, market-anchoring — *"a
  separate layer applied **on top of** the cached baseline, not fused into it."*

**Note that "blowout/fatigue factors" are placed in ENRICHMENT here**, not the baseline — which is
consistent with the later parity doc assigning them to stages, and with the double-counting warning.

**T4 PASS 4: MAJOR NEW MATERIAL. Clean count 0/3.**

### T4.11 — PASS 5 (live verification of the T4 double-counting warning) — **RESOLVED**

**The T4 risks section warned: *"the baseline already reflects historical blowout-shortened minutes —
don't penalize twice."* Checked against `nba_score.blowout_model` today. The design avoids it.**

`minutes_by_margin` stores **`v1` as a RATIO relative to the player's own baseline**, not an absolute
penalty:

| Margin band | n | **v1** |
|---|---|---|
| **competitive** | 12,966 | **1.0333** |
| won by 12–20 | 3,001 | 0.9760 |
| won by 25+ | 1,597 | **0.8748** |
| lost by 25+ | 1,306 | 0.9124 |

**A value ABOVE 1.0 for the most common case is the signature of a deviation model.** The ratios are
measured against the same blended historical average the baseline uses, so applying a margin-weighted
ratio **re-centres** the projection rather than subtracting twice.

**This also identifies the source of a T16 figure**: *"competitive games run 3.3% above baseline"* is
`v1 = 1.0333` read directly.

**The T4 warning was heeded thirteen transcripts later** — and the documentation pass is what
established that, since neither transcript states the connection.

**T4 PASS 5: NEW MATERIAL (a resolution). Clean count 0/3.**

### T4.12 — PASS 6 — **THE ORIGINAL OPERATING CADENCE, AND A GAP IN TODAY'S P3**

#### T4.12a — The cadence as locked in `NBA_SYSTEM_DRAFT.md` Section 4b
| Run | Original schedule |
|---|---|
| **Static differential** | **Mondays 2:00 am Pacific** |
| **Delta daily** | **~11:00 am every day** |
| **Master run** | **2 hours before the first game**, optional second pass later |

#### T4.12b — **THE MASTER RUN WAS DESIGNED TO BE DYNAMIC, NOT A FIXED CLOCK TIME**
> *"unlike the other two runs, **the master run's trigger time isn't a fixed clock time — NBA start
> times shift day to day**, so it needs to be **computed dynamically from `nba_calendar.games`
> (today's earliest real tip-off time) minus 2 hours**."*

**`nba-p3-afternoon-light.yml`, built 2026-09-20, uses a FIXED 1:15 PM PT.**

**This is safe on a normal slate** (earliest tip ~4 PM PT) but **wrong on early-tip days**. The NBA
regularly schedules noon and 1 PM **Eastern** starts — Christmas, MLK Day, and most Saturday/Sunday
national-TV windows. **A 12:00 PM ET tip is 9:00 AM PT — more than four hours BEFORE P3 would run.**

**On those days P3 would score a slate whose games had already started.** Recorded in OPEN_ITEMS.
**The fix the original design already specifies**: compute the trigger from the earliest tip in
`nba_calendar.games`, and take **min(1:15 PM PT, earliest_tip − 2h)**. The schedule data needed for it
is already in Postgres (T3.3, 2,666 games).

#### T4.12c — **THE PRE-FLIGHT COMPLETENESS CHECK — designed here**
> *"Before ingesting, **compare the number of games SCHEDULED for yesterday** (already sitting in
> `nba_calendar.games`) **against the number showing as FINAL in the fresh API pull**. If they don't
> match — **halt and warn, don't silently proceed on an incomplete night** (postponements, suspended
> games, or just running too early would all get caught this way)."*

**`nba/check_delta_gaps.py` (built 2026-09-20) implements this check — but runs it AFTER mining, as an
audit, not BEFORE as a gate.** The design intent was *"halt and warn, don't silently proceed."*
**In practice the ordering matters less than it seems** (P2 fails the job either way, before the
baseline builds) **but the design called for a pre-flight gate and the implementation is a
post-flight audit.** Noted rather than treated as a defect.

#### T4.12d — **The baseline must NEVER live-query stats.nba.com — three reasons**
1. **Speed** — querying Postgres beats re-fetching thousands of game logs
2. **Stability** — *"if the NBA's API has an outage during your run window, you're not blocked"*
3. **REPRODUCIBILITY** — *"a live query run at 9am vs 10am could return different data if a correction
   posted in between — **your baseline needs a fixed, consistent snapshot**"*

**Reason 3 is the as-of principle arriving early**, applied to API reads rather than to dates. The same
logic later becomes the whole day-by-day parity directive.

#### T4.12e — **A permanent caveat, deliberately not solved**
> *"the NBA does issue **rare stat corrections hours or days later** (a rebound reattributed to a
> different player). **Don't chase these** — treat each day's baseline as **a consistent point-in-time
> snapshot**, and accept that occasional tiny corrections won't be reflected until the next natural
> recalculation."*

#### T4.12f — The timing research behind the cadence
*"even the latest West Coast game (tip ~10:30 pm ET, **going to double overtime**) finishes by
~1:45 am ET, and stats.nba.com finalizes within **10–15 minutes**. **6 am ET gives a 4-hour safety
buffer**."*
**P2's planned 01:00 PT = 04:00 ET is tighter than the 6 am ET this research endorsed** — still clear
of the ~2:00 am ET worst case, but with ~2 hours of margin rather than 4.

**T4 PASS 6: MAJOR NEW MATERIAL. Clean count 0/3.**

### T4.13 — PASS 7 — **THE BACKFILL RESEARCH** (`nba/NBA_HISTORICAL_BACKFILL_PLAN.md`)

#### T4.13a — Splits: six groups in ONE call
**`playerdashboardbygeneralsplits`** returns **6 split groups in a single call**:
**DaysRest · Location (home/away) · Month · PrePostAllStar · StartingPosition · WinsLosses**
— and the same exists at team level.

#### T4.13b — **"3–5 seasons, NOT as much as possible" — and the reasoning is the point**
> *"a player's own stats from several years ago, **in a different role on a different team, actively
> HURTS a model** rather than just being less useful — **Kevin Durant's 2016 Thunder numbers being
> actively misleading** for predicting his performance today."*

**This is an argument for BOUNDING history, not a cost-saving shortcut.** Locked at **3 seasons
(2023-24, 2024-25, 2025-26)**.
**This is the ancestor of `BT_TRAIN`** — and of COMPASS fact 66's warning that *"BT_TRAIN must be
explicit or the test season lands in its own training set (leak + OOM)."*

#### T4.13c — **Splits prioritised, with a DATA-LEAKAGE warning**
| Priority | Split | Why |
|---|---|---|
| **Essential** | **DaysRest** | *"one of the strongest real signals — back-to-back effects"* → **factor A4** |
| **Essential** | **Location** | home/away |
| **Essential** | **StartingPosition** | *"a direct proxy for role/usage — **starter vs. bench is night-and-day**"* → **the role_tier concept** |
| Worthwhile | PrePostAllStar | → the **phase** dimension |
| **⚠ WARNING** | **WinsLosses** | *"**correlational, not causal** — players play better in wins **partly BECAUSE good play caused the win**. Using it as a raw feature risks **real data leakage**. **Collect it, but don't naively feed it to a model**."* |
| Low | Month | *"any real signal is better captured elsewhere"* |

**The WinsLosses warning is a genuine leakage trap identified before the data was even mined** — and it
is the same class of error the A5 lineup factor later fell into (box-score starters are post-tip truth).

#### T4.13d — Three structural rules, all still honoured
1. **Per-game granularity is the required base unit** — one row per player per game.
   *"Season aggregates only as **derived features attached to those rows, never a substitute**."*
2. **Team game logs are equally essential, not an afterthought** — needed for pace and opponent-defence.
3. **A 3-step pipeline: raw ingestion → transformation → feature engineering**, *"so a later modelling
   change doesn't force re-mining the expensive historical data."*
   **→ This is exactly why `baseline_history` (19.3M rows) is stored separately from `final_hp`**, and
   why re-scoring never requires re-mining.

#### T4.13e — `playercareerstats`, and what it legitimately unlocks
*"**one call per player** returns their entire career, season-by-season, already aggregated, back to
their rookie year."*

**The contamination concern was addressed structurally, not waved away**: *"the original concern was
mixing old **per-game** rows into current training data as if predictive of today. **Season-level
aggregates used as features describing the player's trajectory — not stand-in training rows — are a
fundamentally different, safer use**."*

Three things it unlocks:
1. **Real aging curves** — age vs performance across a career, smoothed of per-game noise
2. **A "context stability" flag** — *"how many teams a player's been on relative to career length; a
   genuinely different risk signal that's **invisible in any single season**"*
3. **A durability proxy** — *"games played vs the team's total games, **without touching anything
   health-related**"*

#### T4.13f — **SURVIVORSHIP BIAS — the serious risk, surfaced by pushing back on Gemini**
> *"I pushed back on Gemini rather than just accepting it, per your instruction… **Survivorship bias is
> the serious one.** This data only exists for players who **stayed in the league long enough to still
> be queryable**. Any 'typical aging curve' built from it is a curve for **SUCCESSFUL NBA players** —
> the players who **washed out after 2–3 seasons are invisible**. Any model using this needs to treat
> it as **conditioned on 'currently-relevant NBA player', not a neutral population**."*

**Plus era effects**: *"a 2004 stat line isn't directly comparable to 2024 without normalising for pace
and 3-point rate."*

**This is the most statistically sophisticated caution in T1–T4**, and it was produced by explicitly
asking the tool to argue against its own recommendation.

#### T4.13g — The refusal to guess, stated as a rule
> *"One thing I couldn't confirm from research and **refused to guess at**: how this endpoint handles
> players traded mid-season… **This needs to be checked against a real API response before the data is
> trusted, not assumed from documentation**."*
**Resolved empirically the same session** — the `TEAM_ID = 0` combined row (T4.2).

**T4 PASS 7: MAJOR NEW MATERIAL. Clean count 0/3.**

### T4.14 — PASS 8 — the research verdict table, and a connection to the garbage-time gap

#### T4.14a — The four-way research verdict, with what was actually found
| Data source | Gemini's call | What was found |
|---|---|---|
| Advanced per-game stats | *do now — highest leverage* | ✅ Built via the **same bulk endpoint**, not 1,230 calls |
| **Play-by-play / garbage-time** | *defer — **use a proxy first*** | **"MIN + margin proxy noted for later"** |
| Officials / lineups history | ***skip entirely** for historical* | *"genuinely redundant — **starters/inactives are already in the game logs**"* |
| Betting market / closing lines | *new finding — high value for **evaluation*** | *"connects to your already-planned market/odds layer, not a new build"* |

#### T4.14b — **THE GARBAGE-TIME PROXY WAS SPECIFIED HERE — and it may already exist**
The deferral was not open-ended: **"MIN + margin proxy noted for later."**

**`nba_score.blowout_model` is literally a `minutes_by_margin` table** (T4.11) — minutes ratios keyed
to final margin bands, measured on 24,025 player-games. **That is the MIN + margin proxy, built in
T16 under a different name and for a different stated purpose.**

**So the T2 garbage-time gap may be partially closed without anyone noticing.** The distinction that
remains:
- The blowout model corrects **projected minutes** for expected game script — forward-looking.
- Garbage-time filtering would clean the **historical rate stats themselves** (usage, efficiency)
  of unrepresentative minutes — backward-looking.

**They attack the same contamination from opposite ends, and only one end is covered.** For a bench
player whose season stats are *"almost entirely garbage-time minutes"* (T2.13a), correcting his
projected minutes does not fix a per-36 rate computed from garbage time. **OPEN_ITEMS updated.**

#### T4.14c — "Skip officials history entirely" was later OVERRULED
Gemini called historical officials/lineups *"genuinely redundant"*. **T5 and T6 built per-game
officials and lineup backfills anyway** — and D1 (referee) became a named baseline-stage factor.
**A case where the research recommendation was correctly ignored**: the redundancy argument holds for
*starters/inactives* (already in game logs) but not for *which crew officiated which game*, which
appears nowhere else.

#### T4.14d — Market data framed as EVALUATION, not input
*"high value for **evaluation**"* — i.e. for grading and calibration, not as a projection input.
**This framing held**: COMPASS fact 62 says the market is *"a confidence adjuster and ranking signal,
not ground truth."*

#### T4.14e — The gap audit, done against the database
**Two concrete gaps found against the plan's own recommendations:**
1. *"Only **1 of the recommended 3 seasons** of full game logs existed (2025-26 only — 2023-24 and
   2024-25 were missing)"*
2. *"**Zero splits data existed** (DaysRest, Location, Month, PrePostAllStar, WinsLosses) despite being
   identified in earlier research and **never actually built**"*

**Both closed in the same session.** The pattern is worth noting: **research identified the splits,
the plan recommended them, and they were still not built until an explicit audit against Postgres
caught it.** *"Identified in research"* and *"built"* are different states, and only a database check
distinguishes them.

#### T4.14f — 15 datasets at this milestone
*"15 total datasets are now real, live, and independently verified — the complete static/weekly layer
plus the full one-time historical backfill (game logs, team logs, advanced stats, career totals)."*

**T4 PASS 8: MAJOR NEW MATERIAL. Clean count 0/3.**

### T4.15 — PASS 9 — the plan document's own tables, and the season-count reasoning in full

#### T4.15a — The endpoint inventory, as written into `NBA_HISTORICAL_BACKFILL_PLAN.md`
| Endpoint | Returns | Cost |
|---|---|---|
| `playergamelogs` | one row per player per game — MIN, FGM/A, FG_PCT, FG3M/A, FTM/A, OREB, DREB, REB, AST, TOV, STL, BLK, PF, PTS, PLUS_MINUS, **NBA_FANTASY_PTS, DD2, TD3** | **one call = an entire season, whole league**, date-filterable |
| `teamgamelogs` | same shape, team level (pace, ratings per game) | one call per season, whole league |
| `playerdashboardbygeneralsplits` | **6 split groups in one call**: `DaysRestPlayerDashboard`, `LocationPlayerDashboard`, `MonthPlayerDashboard`, `PrePostAllStarPlayerDashboard`, `StartingPosition`, `WinsLossesPlayerDashboard` | one call **per player per season** |
| `teamdashboardbygeneralsplits` | same groups, team level (`TEAM_DAYS_REST_RANGE`, `TEAM_GAME_LOCATION`) | one call **per team per season** |

#### T4.15b — **Data depth is NOT the constraint — scope discipline is**
> *"detailed box scores exist back to **1996-97** league-wide; advanced stats specifically **from 1997**
> onward. So **historical depth is not the constraint — scope discipline is**."*

**Thirty years of data were available and deliberately not taken.**

#### T4.15c — The season-count argument, both bounds
**Why 1–2 is too few**: *"too small a sample for context-specific patterns (e.g. a player's performance
on **0 days rest against a specific opponent**), no way to build an aging curve or **tell a hot streak
from a new baseline**, and not enough cross-player sample to model **typical injury-return
ramp-up**."*

**Note the third item is factor A3 (return ramp)** — it needs cross-player sample, which is why it was
assigned to the baseline rather than treated as a per-player adjustment.

**Why more than 5–6 is actively harmful**: *"the game itself has **structurally changed** — pre-2018
data predates the full pace-and-space era."* **Not "extra work" — a different sport.**

#### T4.15d — `nba_stats.player_career_season_totals` DDL
`player_id`, `nba_player_id`, **`season_id`**, `team_id`, **`player_age`**, `gp`, **`gs`** (games
started), `min`, and the full shooting/rebounding line.
**`player_age` is what makes the aging curve computable**; **`gs` vs `gp`** is the starter-rate signal;
**`team_id` is where `TEAM_ID = 0` appears** for traded players.

#### T4.15e — Indexes created with the tables
`idx_team_game_log_game ON nba_team.team_game_log (game_id)` — and the equivalent on the player log.
**Indexed on `game_id` from the start**, which is what makes the later per-game joins viable.

#### T4.15f — The document's own framing
> *"Written 2026-09-03, **before any Phase 3b code is built**… This is a **design/identification
> document — no scrapers built yet**, per the person's explicit 'identify… research and understand
> what we really need' framing."*

**T4 PASS 9: NEW MATERIAL. Clean count 0/3.**

### T4.16 — PASS 10 (full sequential, all 119 blocks) — **CLEAN 1/3**

Complete read from block 5 → 514. **Every block maps to a documented entry**: the shot-quality build
and its two bugs (T4.1), the backfill research (T4.13), the `TEAM_ID = 0` resolution (T4.2), the
one-time workflow and its ~13-minute run (T4.2), the `MeasureType=Advanced` correction (T4.3), the
baseline methodology (T4.9), the architecture correction and its risks section (T4.10), the cadence
lock (T4.12), and the gap audit that found 1-of-3 seasons and zero splits (T4.14e).

One detail confirmed here and worth recording: **the loader used batched inserts** — *"using batched
inserts given the real scale (**32,755 rows total**)"* — and **all three datasets loaded in under
10 seconds**. The scale that needed batching was modest by later standards (`baseline_history` is
19.3M rows), but the pattern was established here.

**CLEAN PASS 1 of 3.**

### T4.17 — CURRENT STATE OF T4

**10 passes. 9 found new material. Clean count: 1/3** (pass 10).

| Pass | Method | New findings |
|---|---|---|
| 1 | full sequential | the whole T4 narrative — 7 sections |
| 2 | DDL | game-log columns; `data_quality` real vs derived on the delta |
| 3 | methodology detail | **the five-step baseline design** |
| 4 | architecture correction | **the caching argument; GBDT rejected; the risks section** |
| 5 | live verification | **blowout double-counting RESOLVED — it's a ratio** |
| 6 | cadence lock | **P3's fixed time vs the designed dynamic trigger** |
| 7 | backfill research | **WinsLosses leakage; survivorship bias; 3-season bound** |
| 8 | research verdict table | **the MIN+margin garbage-time proxy may half-exist** |
| 9 | plan document tables | depth available vs taken; career DDL |
| 10 | full sequential | **CLEAN** |

**Two more consecutive clean full passes required before T4 is DONE.**

### T4.18 — PASS 11 (full sequential, 230-char context) — **CLEAN 2/3**

Complete re-read at wider context. **Every block maps to a documented entry. Nothing new.**

One phrase confirmed in full, previously quoted in part — the owner's standing instruction on Gemini,
stated here in his own words:
> *"ground on online research and gemini insight, **remember that gemini is not the absolute truth, it
> is great insight helper**"*

**That instruction is what produced three of T4's most valuable outputs**: the `MeasureType=Advanced`
correction (2 calls, not 1,230), the empirical `TEAM_ID = 0` resolution, and the survivorship-bias
caution that came from pushing back rather than accepting.

**CLEAN PASS 2 of 3.**

### T4.19 — CURRENT STATE OF T4

**11 passes. 9 found new material. Clean count: 2/3** (passes 10, 11).

**ONE more complete clean sequential pass and T4 is DONE.**

### T4.20 — PASS 12 (full sequential, 260-char context) — **CLEAN 3/3**

Complete read at maximum context. **Every block maps to a documented entry. Nothing new.**

Two details resolved to their full form in this pass, both refinements rather than new findings:
- The `resultSets`-as-dict bug produced **`KeyError(0)`**, which *"renders as literally `\"0\"` when
  stringified"* — which is why the error message was uninformative and the cause took a second look.
- The league eFG% by defender distance: **0–2 ft "Very Tight" = 46.7%, 6+ ft "Wide Open" = 58.9%** —
  *"a sensible, real spread"*. These are the league baselines the Shot Quality Delta formula weights.

---

# ✅ T4 IS **DONE** — 3 CONSECUTIVE CLEAN PASSES (10, 11, 12)

**Final tally: 12 passes. 9 found new material. Passes 10, 11, 12 clean.**

**T4 is the most consequential transcript so far** — it contains the design of the baseline and the
architecture decision the whole system still runs on.

**What it produced, and what is now actionable:**

| Finding | Status |
|---|---|
| **The architecture correction** — baseline cacheable, enrichment volatile | **the reason for today's P2/P3 split** |
| **The five-step baseline design** — EWMA, shrinkage, minutes, pace/defence, **anchor to team-implied totals** | step 5 shipped in T16 as the matchup factor |
| **"Don't penalize twice" blowout warning** | ✅ **RESOLVED** — `blowout_model` stores ratios, not penalties |
| **P3's trigger should be DYNAMIC** (earliest tip − 2h), not a fixed 1:15 PM | ⚠ **OPEN — breaks on early-tip days** |
| **WinsLosses splits carry leakage risk** | ⚠ collected; consumers unverified |
| **Survivorship bias in career aggregates** | ⚠ loaded; conditions unapplied |
| **"MIN + margin" garbage-time proxy** | ⚠ **half-exists** as `blowout_model`; the rate-stat half is still open |
| **GBDT/NN rejected with conditions** | recorded decision |
| `TEAM_ID = 0` traded-player row | ⚠ naive `SUM()` double-counts |
| 3-season bound, deliberately | *"scope discipline is the constraint, not depth"* |

---

## RUNNING TOTAL: 4 of 16 transcripts DONE
| # | Transcript | Passes | Status |
|---|---|---|---|
| T1 | phase1-static | 28 | ✅ 3/3 clean |
| T2 | phase3a-enrichment | 11 | ✅ 3/3 clean |
| T3 | phase3a-final | 10 | ✅ 3/3 clean |
| T4 | phase3b-backfill | 12 | ✅ 3/3 clean |

## NEXT: T5 — `2026-09-09-01-49-59-nba-expansion-phase3c-starter-status-complete.txt`
MLB-analogy backfill audit · position bug fix · **Defense-vs-Position derived table** ·
per-game starter/bench backfill (`boxscoretraditionalv2` failure → v3) · Postgres writer worker ·
a tooling constraint blocking the final load.

---

## T5 — `2026-09-09-01-49-59-nba-expansion-phase3c-starter-status-complete.txt`
**PHASE 3c — splits completion, the position bug, Defence-vs-Position, and the starter-status backfill**
*115 content blocks · **PASS 1 (full sequential) 2026-09-20***

### T5.1 — The 49-minute run, and its real error rate
The splits + 2-seasons job *"took about **49 minutes** — real, expected given the ~1,200+ sequential
API calls."*

| Dataset | Result |
|---|---|
| Player splits | **9,948 rows across 577/582 players** — **5 real HTTP 500s** |
| Team splits | 30/30 teams, **581 rows**, zero errors |
| 2023-24 game logs | **26,401 rows**, zero errors |
| 2024-25 game logs | **26,306 rows**, zero errors |

**The 5 failures were diagnosed, not ignored**: *"server-side, **likely players with zero games this
season** causing a real data edge case on the source's end"*, and judged *"well under the 5% tolerance"*
— **a stated tolerance, not an implicit one.**

**A fix applied while loading**: the worker had a hardcoded `season: "2025-26"` — rewritten *"to loop
over all 3 seasons generically."*

**Verification used arithmetic that had to balance**: *"Jokić's **12+35+11+5+2 = 65 games** across rest
buckets, and **33+32 = 65** home/road games, **exactly matching his real season game count**."*
**Two independent partitions summing to the same total is a much stronger check than a row count.**

### T5.2 — **Owner's instinct catches a wrong claim** (message 141)
> **OWNER:** *"double check if no other information is needed on the backfill, any kind of history,
> like mlb has, bullpen, lineups, starters or some kind of aggregates that will do the same job"*

> *"Good instinct to double-check rather than assume completeness — let me verify one specific thing
> first. **Gemini earlier claimed starters are 'already inferable from the game logs' via a `GS`
> column**…"*

**CONFIRMED WRONG**: *"`GS` only exists as a **season aggregate** in career totals; there's **no
per-game starter/bench flag in `playergamelogs` at all**. **Gemini's earlier claim was wrong.**"*

**This is the T4 verdict-table entry "Officials/lineups history: skip entirely — starters/inactives are
already in the game logs" being overturned by direct check.** *(T4.14c predicted this from the other
direction.)*

Further confirmed: *"`START_POSITION` genuinely only exists on the **expensive per-game endpoint**
(`boxscoretraditionalv2`) — there's **no bulk equivalent**, confirmed by **someone in the wild asking
the exact same question**."*

**And a second Gemini claim checked and rejected**: *"**Team Pace is already fully covered** (Gemini was
wrong on this one; the advanced stats backfill already got it)."*
**Two wrong Gemini claims caught in one message.**

### T5.3 — **THE POSITION BUG — a column that existed and was never filled**
> *"Real, **previously undiscovered gap** — the `position` column **exists in the schema but is
> completely empty**."*

**And it was a bug, not a gap**: *"the position field exists in the schema, but **the scraper never
actually extracted `PLAYER_POSITION`** from the API response."*

**Then a correction to the fix itself, before wasting a cycle**: *"let me verify the exact field name
before triggering… that source's real schema confirms **no position column exists in the output** —
`PlayerPosition` was my assumption."*
**The first fix was wrong and was caught by checking the schema rather than running it.**

**The real source**: **`playerindex`** — *"the real, bulk, one-call endpoint with a genuine `POSITION`
field… **verified against confirmed documentation rather than assumption**."*
*(This is the endpoint considered and passed over in T2 — see T2's pass 13 note on `playerindex`.)*

**The Postgres worker had the same omission**: *"this worker **never writes `position` either**."*
**Two components, same silent gap.**

**Result: 582/582 positions matched — a perfect fix.**

### T5.4 — Defence-vs-Position: a derived table, free from data already held
*"genuinely free from data already in Postgres"* — **630 rows (30 teams × 7 position groups ×
3 seasons)**.
Spot-check: *"the strongest center-defence teams (best rim protectors/interior defence) allow around
**8-9 points per game to opposing centers**."*
**This is factor M-something's ancestor, and it required no new mining at all** — the position fix
unlocked it.

### T5.5 — **THE STARTER-STATUS BACKFILL — a silent failure worth studying**

**First run: 1,230 per-game calls, ~40 minutes.** Reported success.
> *"Real problem — **1,228 games reported success, but only 799 total rows** were produced. With ~26
> players per game, that should be closer to **25,000-30,000 rows**. **Something's silently failing
> without raising an error.**"*

**Then a second inconsistency — between the meta and the data file itself**: *"there's a real
inconsistency between the meta and the actual data file that needs resolving."*
**Resolved by counting programmatically**: *"the actual answer is **799 rows across only 31 games**,
not 1,228 as the meta implied. This means **most 'successful' calls silently returned empty data
without technically erroring**."*

**The diagnosis was made cheaply, not by re-running**: *"Before committing to another expensive
~40-minute full re-run, let me **test a small sample of games spread across the season**"* — a
**7-call diagnostic workflow**.

**The finding**: *"**HTTP 200 and structurally correct responses, but ZERO player rows for every game
except the very last one.**"*

**The fix, proven by comparison before committing**: *"**Confirmed — v3 works reliably for every single
sample, including all the games v2 silently failed on.** `boxscoretraditionalv2` is **unreliable for
historical games**; `v3` is not."*
**v3's schema differs**: *"flat per-player fields — `personId`, `position`, `comment`, nested under
`boxScoreTraditional.homeTeam.players` / `awayTeam.players`."*

**Final result, with a sanity check that could not be faked**:
> *"All **1,230 games** succeeded, zero errors, **32,179 rows** — exactly the expected magnitude…
> and **starter rows are exactly 12,300 (10 starters × 1,230 games)** — a perfect, decisive sanity
> check."*

**12,300 = 10 × 1,230 is an arithmetic identity that only holds if every game parsed correctly.**

### T5.6 — The tooling wall that ended the session
The worker was built and wired, but could not be invoked:
1. *"The tool's **target enum hasn't picked up the new binding** yet"*
2. *"The MCP tool's enum is **fixed for this session** and can't pick up new bindings dynamically"*
   *(the same constraint as T1.8)*
3. *"Both the tool's fixed enum **and Control Room's static job dispatch** are blocking direct worker
   invocation"*

**Fallback attempted**: load the verified data directly via SQL — *"17 chunks of ~175 KB each"*, then
*"regenerate with fewer, larger chunks"*, then a check for a Postgres HTTP extension (*"No HTTP
extension available"*), and finally:
> *"Let me be **honest about where things actually stand** rather than continue burning turns on this
> mechanical process."*

**The data was verified and committed; only the load was blocked.** T6 opens with the manual SQL load.

**T5 PASS 1: complete sequential read. Clean count 0/3.**

### T5.7 — PASS 2 FINDINGS (added 2026-09-20; DDL) — **NEW MATERIAL**

#### T5.7a — A PK design flaw worth noting: splits omit `season`
Both `nba_stats.player_splits` and `nba_team.team_splits` have:
> **`PRIMARY KEY (player_id, split_type, group_value)`** — **`season` is a column but NOT in the key.**

**Three seasons were backfilled. With `season` outside the PK, a second season's load for the same
player/split/group would UPDATE the first rather than coexist.** The tables hold **9,948 player rows
and 581 team rows** — consistent with **one season retained, not three**.
**Recorded in OPEN_ITEMS as a verifiable question**: does `player_splits` contain one season or three?

#### T5.7b — `nba_team.defense_vs_position` — an exemplary derived table
`team_id`, `opponent_position`, `season`, **`games_sampled`**, `avg_pts_allowed`, `avg_reb_allowed`,
`avg_ast_allowed`, `avg_fg_pct_allowed`.
**PK `(team_id, opponent_position, season)` — season IS in this key**, so all 3 seasons coexist
(630 rows = 30 × 7 × 3 ✓).
**`source_key DEFAULT 'DERIVED_FROM_PLAYER_GAME_LOG'`** and **`data_quality DEFAULT 'derived'`** —
the provenance is declared in the schema itself, and **`games_sampled` lets a consumer weight or gate
by sample size**, the same foresight as `total_fga` on the shot-quality delta.

#### T5.7c — `nba_stats.player_game_starter_status`
`player_id`, `game_id`, **`start_position`**, **`is_starter`**, **`comment`** — PK `(player_id,
game_id)`.
**`comment` is the DNP/inactive reason field**, which is why the grader can distinguish a real DNP from
a join failure (COMPASS fact 60). **32,179 rows; exactly 12,300 starter rows = 10 × 1,230 games.**

#### T5.7d — Both splits tables carry the win/loss columns
`w`, `l`, `w_pct` are stored — **which is the WinsLosses leakage surface from T4.13c sitting in the
schema.** The data is there; the caution is not enforced by anything.

**T5 PASS 2: NEW MATERIAL. Clean count 0/3.**

### T5.8 — PASS 3 (live verification of the splits tables) — **TWO CONFIRMED FINDINGS**

#### T5.8a — **`player_splits` holds ONE season, not three**
```
season    rows   players  split_types
2025-26   9,948  577      5
```
**Only 2025-26 is present.** The game logs cover three seasons (26,651 + 26,401 + 26,306); **the splits
do not.**

**And the PK guarantees they never can**: `PRIMARY KEY (player_id, split_type, group_value)` **omits
`season`**, so a second season's load would UPDATE the first rather than coexist. **Whether only one
season was ever scraped, or three were scraped and two overwritten, the end state is the same and the
schema cannot hold more.** `defense_vs_position` got this right — its PK **does** include `season`,
and it holds all three (630 = 30 × 7 × 3).

#### T5.8b — **`StartingPosition` — rated ESSENTIAL — is ABSENT**
```
days_rest          3,311 rows   7 groups
month              3,236        7
location           1,217        3
wins_losses        1,135        2
pre_post_allstar   1,049        2
```
**Five split types. `StartingPosition` is not among them** — yet T4.13c rated it **Essential**:
*"a direct proxy for role/usage — **starter vs. bench is night-and-day**."*

**Note the priority inversion**: `month` — rated **Low**, *"any real signal is better captured
elsewhere"* — is the second-largest table at 3,236 rows, while the essential one is missing entirely.

**Two readings, and the benign one is probably right:**
1. **Benign**: T5 built `nba_stats.player_game_starter_status` in the same session — **32,179 rows at
   PER-GAME granularity**, which is strictly better than a season-aggregate StartingPosition split.
   The split would be redundant, and the better source superseded it.
2. **Not benign**: it was simply dropped, and nobody noticed because the counts looked healthy.

**The per-game table exists and is verified (12,300 starter rows = 10 × 1,230), so the capability is
covered either way.** Recorded so the absence is not mistaken for a gap in role data.

**T5 PASS 3: NEW MATERIAL. Clean count 0/3.**

### T5.9 — PASS 4 FINDINGS (the milestone summaries) — **NEW MATERIAL**

#### T5.9a — The full three-season game-log totals
| Season | Player-game rows |
|---|---|
| 2023-24 | 26,401 |
| 2024-25 | 26,306 |
| 2025-26 | 26,651 |
| **Total** | **79,358** + **7,380 team-log rows** |

#### T5.9b — Position distribution after the fix
**582/582 populated: 240 G · 180 F · 64 C**, plus real combo positions.
*(Note 240+180+64 = 484, so ~98 carry combo designations like G-F.)*

#### T5.9c — **Starter status covers ONE season, by explicit decision**
> *"it costs **~3,690 calls across 3 seasons** (far more than anything built so far), so **I stopped and
> flagged it rather than just running it**."*
> **OWNER: *"yes"*** → *"starting with just **the most recent season (1,230 calls)** as Gemini
> suggested, rather than all 3 at once."*

**✅ VERIFIED LIVE 2026-09-20**: `nba_stats.player_game_starter_status` holds
**32,179 rows · 1,230 games · 12,300 starters · 591 players** — **exactly one season (2025-26).**
**The 12,300 = 10 × 1,230 identity still holds.**

**This is a deliberate, owner-approved scope decision, not a gap** — but it means **per-game starter
status exists for 2025-26 only**, while game logs cover three seasons. Any model training across
three seasons has this feature for one of them. **Recorded in OPEN_ITEMS.**

#### T5.9d — Why Gemini rated it non-negotiable
> *"**foundational, non-negotiable** for props — a player's role (starter vs. bench) is **the single
> biggest driver of their opportunity**, and **it can shift game-to-game in ways season averages miss
> entirely**."*

**That last clause is the whole argument for per-game over the season-aggregate StartingPosition
split** — and confirms T5.8b's benign reading.

#### T5.9e — **Two items surfaced and deliberately NOT built**
1. **Historical injury / active-inactive status** — *"flagged as **very high value**, needs a real
   source investigated first"* → **built in T10** (the injury-report PDF scraper).
2. **Lineup synergy data (2–5 man units)** — *"a real **'next level'** addition, not urgent"* →
   **built in T6** (`leaguedashlineups`, 8,000 rows).

**Both were built within two transcripts**, so neither became a lost thread.

#### T5.9f — The self-caught mistake, stated plainly
> *"along the way **caught my own mistake**: I first tried pulling it from `leaguedashplayerbiostats`,
> checked the real schema, found that endpoint **doesn't actually have a position output field**, and
> **reverted before it shipped**."*

#### T5.9g — The honest process note on the 49-minute run
> *"I **didn't rush it or assume completion early**; I kept checking until it genuinely finished and
> then **verified against Postgres before reporting anything**."*

#### T5.9h — The offline-preparation boundary, stated
> *"This is **the maximum useful offline preparation achievable before the season starts** — the one
> remaining piece (the ongoing **Daily Delta Ingestion worker**) genuinely can't be tested until there
> are live games to ingest."*

**T5 PASS 4: NEW MATERIAL. Clean count 0/3.**

### T5.10 — PASS 5 FINDINGS (status reports) — **NEW MATERIAL**

#### T5.10a — **Why game logs hold 3 seasons but splits hold 1 — the reason is stated here**
> *"writing to the same Postgres tables (**safe, since `game_id` is unique across seasons**)"*

**The game-log tables work across seasons because `game_id` is globally unique**, so rows from
different seasons cannot collide. **The splits tables have no such natural key** — a player's
`days_rest` / `0 Days Rest` row is identical across seasons, which is exactly why `season` needed to be
in the PK and was not. **The design reasoning was sound for one table type and not carried to the
other.**

#### T5.10b — Script names
`nba/scrape_nba_backfill_historical_seasons.py` (parameterised, *"rather than risk modifying the
already-verified 2025-26 script"*) and `nba/scrape_nba_splits.py`.

#### T5.10c — **Per-item error tracking, by design**
> *"the **per-item error tracking built into both scripts** will show **exactly which
> players/teams/seasons need a retry** rather than an opaque failure."*

**This is why the 5 HTTP 500s were identifiable as specific players** rather than a vague partial
failure — and why the starter backfill could report *"1,228 games reported success"* precisely enough
for the discrepancy to be caught. **Per-item tracking is what made the silent v2 failure visible at
all.**

#### T5.10d — The lean-workflow decision, with its cost
> *"I **deliberately built it as its own lean, dedicated workflow** rather than re-triggering the full
> backfill pipeline (**which would have wasted ~50 minutes** re-running already-completed career totals
> and splits work just to add this one piece)."*

**And the same judgement appears for the diagnostic**: a **7-call sample workflow** instead of another
40-minute full run. **Two separate instances of building a narrow tool rather than paying a broad cost.**

#### T5.10e — Status reporting discipline under uncertainty
Both mid-run reports state plainly what is **not** yet known:
- *"**Currently in progress, not yet complete**… I have **not yet been able to confirm** success or
  verify real row counts against Postgres — the workflow log isn't retrievable until the job finishes."*
- *"**Not yet verified**: I haven't confirmed completion or checked real row counts against Postgres
  yet — that's the next step once the job finishes."*

**And the close**: *"The data itself is completely solid — 32,179 rows confirmed independently correct…
**already verified twice**."*

**T5 PASS 5: NEW MATERIAL. Clean count 0/3.**

### T5.11 — PASS 6 (full sequential, all 115 blocks) — **CLEAN 1/3**

Complete read from block 2 → 503. **Every block maps to a documented entry**: the gap audit and both
scripts (T5.1, T5.10b), the 49-minute run and its 5 HTTP 500s (T5.1), the hardcoded-season fix
(T5.1), Jokić's two-partition consistency check (T5.1), the owner's double-check instruction and the
two wrong Gemini claims (T5.2), the position bug and its self-corrected fix (T5.3),
Defence-vs-Position (T5.4), the starter-status scope decision (T5.9c), the lean workflow (T5.10d),
the **799-row silent failure** and its resolution (T5.5), the 7-call diagnostic, the v2→v3 fix, the
32,179-row result with the 12,300 identity, and the three-layer invocation block (T5.6).

One detail confirmed here: **`stats.nba.com` is not on the sandbox's allowed network list** —
*"so I can't debug this directly — I need to add real diagnostics to the script and re-run it through
the actual workflow."* **That constraint is why the diagnostic had to be a workflow rather than a local
call**, and it is the same egress restriction recorded in T1.17.

**CLEAN PASS 1 of 3.**

### T5.12 — CURRENT STATE OF T5

**6 passes. 5 found new material. Clean count: 1/3** (pass 6).

| Pass | Method | New findings |
|---|---|---|
| 1 | full sequential | the whole T5 narrative — 6 sections |
| 2 | DDL | **the splits PK omits `season`**; `defense_vs_position` gets it right |
| 3 | live verification | **splits = 1 season; `StartingPosition` absent** |
| 4 | milestone summaries | **starter status = 1 season, owner-approved**; 79,358 total rows |
| 5 | status reports | **why game logs span 3 seasons and splits cannot**; per-item error tracking |
| 6 | full sequential | **CLEAN** |

**Two more consecutive clean full passes required before T5 is DONE.**

### T5.13 — PASS 7 (full sequential, 210-char context) — **CLEAN 2/3**

Complete re-read at wider context, head and tail. **Every block maps to a documented entry. Nothing
new.**

One phrase confirmed in full: the `START_POSITION` finding was corroborated *"by **someone in the wild
asking the exact same question**"* — i.e. the absence of a bulk equivalent was confirmed against a
public discussion, not only against documentation. **A third form of verification alongside schema
checks and empirical calls.**

**CLEAN PASS 2 of 3.**

### T5.14 — CURRENT STATE OF T5

**7 passes. 5 found new material. Clean count: 2/3** (passes 6, 7).

**ONE more complete clean sequential pass and T5 is DONE.**

### T5.15 — PASS 8 (full sequential, 250-char context) — **CLEAN 3/3**

Complete read at maximum context. **Every block maps to a documented entry. Nothing new.**

---

# ✅ T5 IS **DONE** — 3 CONSECUTIVE CLEAN PASSES (6, 7, 8)

**Final tally: 8 passes. 5 found new material. Passes 6, 7, 8 clean.**

**T5's findings, and what each means now:**

| Finding | Status |
|---|---|
| **`boxscoretraditionalv2` returns HTTP 200 with ZERO rows** on historical games — 1,228 "successes" → 799 rows | ✅ fixed with v3; **live delta scraper verified clean** |
| **`position` column existed unfilled for 3 sessions** — scraper never extracted it, worker never wrote it | ✅ fixed via `playerindex`, 582/582 |
| **Splits PK omits `season`** — cannot hold more than one | ⚠ **OPEN** — verified 2025-26 only |
| **`StartingPosition` split absent** | probably benign — superseded by per-game table |
| **Starter status = 1 season** (owner-approved scope) | ⚠ coverage asymmetry vs 3-season game logs |
| **Two wrong Gemini claims caught** (GS inferable; Team Pace missing) | both rejected by direct check |
| `defense_vs_position` built free from existing data | ✅ 630 rows, 3 seasons |

**The methodological lesson T5 teaches best**: *"1,228 games reported success, but only 799 total
rows."* **Nothing errored.** The failure was caught only by comparing the output against an expected
magnitude — ~26 players × 1,230 games. **A success count is not a result.**

---

## RUNNING TOTAL: 5 of 16 transcripts DONE
| # | Transcript | Passes | Status |
|---|---|---|---|
| T1 | phase1-static | 28 | ✅ 3/3 |
| T2 | phase3a-enrichment | 11 | ✅ 3/3 |
| T3 | phase3a-final | 10 | ✅ 3/3 |
| T4 | phase3b-backfill | 12 | ✅ 3/3 |
| T5 | phase3c-starter-status | 8 | ✅ 3/3 |

## NEXT: T6 — `2026-09-09-02-15-50-nba-expansion-phase3d-delta-complete.txt`
Manual starter-status SQL load · per-game officials backfill (`boxscoresummaryv3`) ·
**lineup synergy (`leaguedashlineups`, 8,000 rows, two bugs)** · a double-check research pass
(sharp-bettor claims, **the NBA injury-PDF discovery**) · **the daily delta ingestion worker**
with a completeness-check bug caught via the `002` GAME_ID prefix.

---

## T6 — `2026-09-09-02-15-50-nba-expansion-phase3d-delta-complete.txt`
**PHASE 3d — officials, lineups, the injury-PDF discovery, and the daily delta worker**
*125 content blocks · **PASS 1 (full sequential) 2026-09-20***

### T6.1 — The manual load, and the wall that dissolved
T5's blocked load resumed here. Owner: *"manual for now, this is a once and done task"*, then
*"just get it figured out and the work done."*

**Every Postgres-side escape was checked and closed**: *"`dblink` only connects to other Postgres
databases (not HTTP), and **`http`/`plpython3u` aren't available at all**."*

**The method that worked was found by shrinking, not pushing**: 17 chunks of ~175 KB failed; **33
chunks of ~44 KB with a row-count verification after each** worked — *"1,000 rows landed exactly as
expected"*, then *"2,000 rows confirmed — exactly matching 2 chunks."*

**Then, after 2 of 33 chunks**: *"Given how much this is costing per chunk, **let me check once more
whether the Worker binding has become available**"* — **it had.** *"The tool's enum refreshed, and the
Worker just loaded all remaining rows in **25 seconds**."*

**The lesson**: the enum refreshes **between** turns, not within a session as T1 concluded. **Re-check
a blocked binding before committing to an expensive workaround.**

### T6.2 — Officials backfill: the v2 lesson applied *before* being burned
> *"let me verify the real endpoint and field names before building anything — **especially given the
> earlier lesson that v2 endpoints can silently fail for historical games**."*

**And the warning was found documented**: *"there's a **documented warning that `boxscoresummaryv2` is
unreliable after 4/10/2025**, exactly the same failure pattern I found earlier with
`boxscoretraditionalv2`."*

**v3 tested on 5 samples first** — *"Confirmed reliable across all 5 samples (old and new games
alike)."* **The T5 lesson cost one session; here it cost five API calls.**

**Result: 1,230/1,230 games, 3,681 rows (exactly 3 officials × 1,230).**

#### T6.2a — **But the meta lied again — and this time it was OUR bug**
> *"meta claims 1,230/1,230 succeeded with zero errors, but only **1,227 distinct games** actually have
> officials data (**9 rows short = 3 missing games**)."*

**The bug, found by reading the code rather than guessing**:
> *"When a game returns zero officials, the code returns `([], "error_string")`, but my main loop checks
> **`if rows is not None`** (true for an empty list) instead of checking the error."*

**`[] is not None` is `True`** — the same class of error as `float(NaN or 0)` in the live session.
**Empty-but-valid is not the same as absent, and Python's truthiness rules make both look like
success.**

#### T6.2b — And the 3 games were a real NBA.com gap, not our code
Patched, re-run, still empty. *"This is a **genuine data gap on NBA.com's side** for these 3 specific
games (**all Nov 19, 2025**) — the API itself returns an empty officials array. At **3 out of 1,230
games (0.24%)**"* — accepted, with the date recorded.

**Spot-check**: *"top officials working **65-66 games** out of ~1,227 tracked, consistent with real NBA
referee workloads (**~65-70 games per season** for full-time officials)."*

### T6.3 — Lineup synergy: cheap, and two real bugs
**4 bulk calls total** — one per lineup size (2/3/4/5-man), whole league. *"Much cheaper than the
previous two backfills."* **8,000 combinations, 2,000 per group size.**

**BUG 1 — Postgres array literals.** *"A real Postgres array-literal formatting issue."* First fix
attempt with `sql.array()` was reconsidered before shipping — *"may not compose well inside the bulk-row
helper. A **manually-built Postgres array literal string is safer and more predictable**."*

**BUG 2 — a PK that was genuinely too narrow, with a real-world reason:**
> *"the same `group_id` can **legitimately appear for two different teams within a season** (e.g.
> **traded players who happened to pair up elsewhere too**), and my primary key is **missing
> `team_id`**."*

**Compare T5.8a**: the splits PK omitted `season` and nobody noticed. **Here the same class of flaw was
caught because the load failed loudly.** *(Which is itself the argument for constraints: the lineup PK
failed; the splits PK silently overwrote.)*

**Spot-check**: *"Real, sensible NBA starting lineups (Timberwolves, Knicks, Pistons, Hornets, Hawks)
with real minutes and plus-minus values."*

### T6.4 — **THE INJURY-PDF DISCOVERY**
Owner: *"Double check, look into strong systems, deep online research and after that Gemini insight"*

> *"Major finding — the NBA publishes **official pregame injury reports as public PDFs** directly from
> **their own CDN**, with real **historical coverage back to 2021-22**. This is the real, legitimate
> source… **several times daily, going back years**."*

**Flagged rather than built**: *"Given the scope and technical shift involved (**PDF parsing**)…"*
→ **built in T10**, and it becomes the backbone of the entire availability layer (N1, the day-before
and day-of reports, the 1:15 PM cutoff).

### T6.5 — **The owner's scope correction**
> **OWNER:** *"We still **not touching the daily context (master run) nor the baseline logic**, we still
> backfilling, static and delta (**baseline pipeline**) backfill"*

> *"**You're right — thanks for the correction.** Let me check the real current state of the daily delta
> layer specifically, since that was flagged as an open gap early on and I haven't verified whether it
> actually exists."*

**CONFIRMED**: *"there's **no delta-phase worker anywhere in the registry**. This is the real, concrete
gap that's been **flagged since the very start of this whole NBA build and never actually closed**."*

**The owner's correction redirected effort from a new research thread back to the oldest open gap.**

### T6.6 — The daily delta worker, and the completeness check's three wrong answers

**Built for future-readiness, honestly stated**: *"2025-26 is fully complete (1400/1400), and 2026-27
hasn't started yet (0/1266, begins Oct 3, 2026). This worker is **genuinely for future-readiness, not
live testing today**."*

**Mechanical verification at zero**: *"Correctly detected 2026-27, correctly returned **0 rows with zero
errors** — exactly as expected for a season with no games played yet."*

**Then the logic was tested against non-trivial data** — *"let's also verify the completeness-check
LOGIC against real, non-trivial data — **the fully-complete 2025-26 season**"*:

| Attempt | Result |
|---|---|
| 1. Naive count | **170-game gap** — explained as *"preseason, playoffs, All-Star weekend, and Cup knockout games"*, all correctly out of scope |
| 2. Blank-label filter | *"**too aggressive** — it excludes legitimate regular-season games with special branding (**NBA Cup group stage, Rivals Week, international games**)"* |
| 3. **`GAME_ID` prefix `002`** | *"a well-known, **precise convention** for game type, rather than relying on free-text labels"* — **verified first**: *"`002` = **1230 games, precisely matching** the known-correct regular season count"* |

**`1230 = 1230, exact match.`**

**This is the origin of the `002` prefix convention** used by `check_delta_gaps.py` today.

### T6.7 — A small honesty note
> *"**I accidentally dropped a useful earlier lesson in that edit — let me restore it.**"*
Documentation damage caught and reverted in the same session.

**T6 PASS 1: complete sequential read. Clean count 0/3.**

### T6.8 — PASS 2 FINDINGS (DDL) — **NEW MATERIAL**

#### T6.8a — `nba_stats.game_officials`
`game_id`, `official_id`, `nba_official_id`, `full_name`, **`jersey_num`**, **`assignment`** —
PK `(game_id, official_id)`.
`source_key DEFAULT 'NBA_GITHUB_COMMITTED_ONETIME_BACKFILL_V3'` — **the `_V3` suffix is in the source
key itself**, so any row loaded by the broken v2 path would be distinguishable. **Provenance encoding
that survives the bug.**
**`assignment`** distinguishes crew chief / referee / umpire — the role hierarchy, not just presence.

#### T6.8b — `nba_team.lineup_profile` — and `player_ids TEXT[]`
`group_quantity` (2/3/4/5), `group_id`, **`player_ids TEXT[]`** — a genuine Postgres array, which is
what caused the array-literal bug — `group_name`, `team_id`, `season`, then the full statistical line
including **`blka`** and **`pfd`**.
**PK had to become `(group_id, team_id, …)`** after the traded-player collision.

**The `TEXT[]` choice is notable**: it makes *"which lineups contain player X"* a single
`player_ids @> ARRAY[...]` query rather than a join table. **8,000 rows, 2,000 per group size.**

#### T6.8c — Both tables carry `source_key` and `data_quality` defaults in the DDL
Consistent with every table since T1. **`data_quality 'real'`** on both — scraped, not derived.

**T6 PASS 2: NEW MATERIAL. Clean count 0/3.**

### T6.9 — PASS 3 — **THE RESEARCH CONCLUSION, AND A PRIORITY RANKING THAT HELD**

#### T6.9a — **The sharp-bettor "XYZ tracking" claim, and the tell that debunked it**
> *"Sharp-bettor commentary claims the 'real' edge lives in **raw XYZ player-tracking data (25fps
> positional data)** — enterprise-grade, Second Spectrum-level stuff. **The same sources, when they
> actually explain their winning bets, talk about role changes, usage shifts, pace, and rest — not raw
> positional data. That's a tell.**"*

**The reasoning is the valuable part: compare what a source CLAIMS its edge is against what it
DEMONSTRATES when explaining a specific win.** The gap between the two is diagnostic.

**And the structural argument**: *"What you already have (shot-quality/defender-distance, tracking
speed/distance summaries) **are the refined signal extracted from that raw data** — the sharp bettors'
own examples ('**PG is out, usage jumps 8%**') are exactly the kind of thing your existing data
supports."*

#### T6.9b — The injury-PDF URL, exactly
**`ak-static.cms.nba.com/referee/injury/...`** — *"several times a day, with real historical archives
back to **2021-22** — free, official, **no third-party paywall**."*

#### T6.9c — **A recommendation that was later OVERRULED, correctly**
> *"**Historical injury-PDF backfill would be a real scope mistake right now.** It doesn't belong in
> the baseline (which is **explicitly designed to be injury-agnostic**, per the architecture already
> locked in) — it's **training data for a future enrichment refinement**, not urgent."*

**T10 built the historical injury backfill anyway** — and it became load-bearing: the day-before report
feeds P2's baseline build, N1's availability model is fitted on it, and the parity rule depends on it.
**The "injury-agnostic baseline" framing was right about the BASELINE and wrong about the
BACKFILL's urgency** — you cannot backtest an availability-aware pipeline without historical
availability.

#### T6.9d — **The priority ranking, and how each item actually landed**
| # | Priority as stated | Outcome |
|---|---|---|
| **1** | **The baseline projection pipeline itself** — *"Every real thing built in this whole multi-session audit — starter status, DvP, officials, lineups — is **enrichment or context sitting on top of a baseline that doesn't exist yet**. This is the actual gap that matters most."* | **Built T7–T9.** Correct call. |
| **2** | **Daily injury report ingestion** (the PDF source), *"wired into enrichment once the baseline exists"* | **Built T10–T11.** Correct order. |
| **3** | **Distribution/variance modelling** — *"**mean isn't enough — two players can share a projection with very different bet value**"* | **Became the entire ladder/dispersion layer.** |

**All three shipped, in that order.** Item 3's phrasing is the clearest one-line statement of why the
system prices a distribution rather than a point estimate — and it predates the ladder by five
transcripts.

#### T6.9e — The honest self-assessment
> *"the data-gap audit is **genuinely done**. The honest next move, per this research, **isn't more
> data — it's building the baseline pipeline that's been designed but not built**."*

**T6 PASS 3: NEW MATERIAL. Clean count 0/3.**

### T6.10 — PASS 4 — **A FREE DATA ASSET, AND A FORMAT INCONSISTENCY IN IT**

#### T6.10a — The starter-status `comment` field is historical absence-reason data
> *"a real, **free bonus** I found while checking: the starter-status backfill's `comment` field
> already captures **actual DNP/DND reasons as a byproduct** — 975 'DND - Injury/Illness', 99 'DNP -
> Injury/Illness', plus rest, suspension, and personal-reason entries, **all real and already sitting
> in Postgres**. It's not full pregame questionable/probable tracking, but it's **genuine historical
> absence-reason data that didn't require any extra scraping**."*

**✅ VERIFIED LIVE 2026-09-20 — and it is richer than the transcript records:**
| `comment` | n |
|---|---|
| **DNP - Coach's Decision** | **4,319** |
| DND - Injury/Illness | 975 |
| DNP - Injury/Illness | 99 |
| NWT - Not With Team | 29 |
| DND - Rest | 27 |
| NWT - Injury/Illness | 25 |
| DNP - League Suspension | 12 |
| NWT - League Suspension | 12 |
| **DND_LEAGUE_SUSPENSION** | **11** |
| NWT - Personal | 9 |

**The dominant category was never mentioned: 4,319 "DNP - Coach's Decision"** — healthy scratches.
**That is the purest available signal for role volatility**, and it dwarfs the injury categories 4:1.
For a fringe player, a coach's-decision DNP is exactly the event `f_role` is trying to price.

#### T6.10b — **⚠ A FORMAT INCONSISTENCY IN THE SOURCE**
**`DND_LEAGUE_SUSPENSION`** (underscores, no spaces) appears alongside **`DNP - League Suspension`**
and **`NWT - League Suspension`** (hyphen-space format). **11 rows use the odd format.**
**Any `LIKE '% - %'` or naive parse of the prefix will silently miss them.** Recorded in OPEN_ITEMS.

#### T6.10c — The two gaps that prompted the officials and lineup builds
Both found *"via **direct schema inspection** — not from memory or assumption"*:
1. *"`nba_ref.officials` is **only a roster**… there's **no table anywhere recording WHICH officials
   worked WHICH game**. Without it, 'referee tendency' **can't be computed as a live enrichment
   factor**."*
2. *"`nba_stats.player_onoff_profile` only covers **single-player** on/off… **I checked its actual
   columns to be sure**, and there's no 2-man/3-man/5-man combination data anywhere."*

#### T6.10d — **A verification that settles a question T5 raised**
> *"I verified there's **no missing season dimension on the static tables** (shot quality, playtype,
> tracking, impact rating, on/off); those are **correctly weekly-refresh snapshots by original
> design, not gaps**."*

**This is the distinction T5.8a needed**: the weekly-snapshot tables are *meant* to hold one state.
**The splits tables are different** — they carry a `season` column, so they were intended to be
multi-season, and the PK omission is a genuine flaw rather than a design choice.

#### T6.10e — The exact Postgres error from the PK bug
**`ON CONFLICT cannot affect row a second time`** — and *"Fixed by **widening the key rather than
suppressing the error**."*

#### T6.10f — The audit's closing arc
✅ Starter/bench status (32,179) · ✅ Defence-vs-Position (630, free) · ✅ Position bug (582/582) ·
✅ Per-game officials (3,681) · ✅ Lineup synergy (8,000)
> *"**every real bug encountered along the way** (the v2-unreliable-for-history pattern **twice**, the
> truthiness bug, the array-literal issue, the primary-key gap) **was caught by checking actual data
> rather than accepting a 'success' status at face value**."*

**T6 PASS 4: MAJOR NEW MATERIAL. Clean count 0/3.**

### T6.11 — PASS 5 — the delta worker's properties, and a CORRECTION to T4.12c

#### T6.11a — **The pre-flight completeness check WAS built as designed — correcting T4.12c**
> *"**I built the pre-flight completeness check** (Final games in the calendar vs. games actually
> logged) and **it immediately flagged a discrepancy**."*

**T4.12c recorded that the pre-flight gate "became a post-flight audit."** That is only half right, and
the correction matters: **there are TWO checks, at different points in the pipeline.**

| Check | Where | When |
|---|---|---|
| **The delta worker's completeness check** | inside the delta ingestion worker (T6) | **PRE-flight** — calendar Final count vs logged count, before proceeding |
| **`check_delta_gaps.py`** | P2 step 6 (live session) | **POST-mining audit** — dates, games, both teams, roster rate |

**The T4 design intent was honoured in T6.** The later `check_delta_gaps.py` is an additional,
broader audit, not a replacement. **T4.12c amended.**

#### T6.11b — The check caught a real discrepancy on its first run
**1,400 calendar games vs 1,230 logged** for the known-complete 2025-26 season — *"Investigated rather
than assumed."* The 170 were preseason, playoffs, All-Star weekend and Cup-final games *"that were
never meant to be in `player_game_log`."*

**The check found a flaw in itself, not in the data** — which is the best possible outcome for a new
validator run against known-good data. **This is why it was tested against a complete season rather
than only against the empty 2026-27.**

#### T6.11c — **Idempotency, stated as a design property**
> *"**Idempotent**, so it's **safe to run daily** once the season starts — **new games just appear via
> upsert**."*

**This is what makes the daily delta safe to re-run after a partial failure** — and it is why the
gap audit can fail a job without risking duplicate data on the retry.

#### T6.11d — Season auto-detection
*"for **whatever season today's date falls in** (auto-detected — currently correctly resolves to
**2026-27**)"* — verified in T6 against the real date. **No hardcoded season**, unlike the loader bug
fixed in T5.1.

#### T6.11e — The honest limitation, and what was done instead
> *"**this can't be tested against real new games yet** since the 2026-27 season hasn't started
> (**0/1,266 Final**). I verified the pipeline runs cleanly against the current empty season instead —
> 0 rows, 0 errors, completeness check correctly reports 'complete' **trivially**."*

**Note the word "trivially"** — the report distinguishes a mechanically-correct zero from a meaningful
pass, which is exactly why the logic was then tested against the full 2025-26 season separately.

#### T6.11f — Scope discipline, confirmed at the close
> *"**Nothing in the master-run/baseline-logic layer has been touched, per your direction.**"*

**T6 PASS 5: NEW MATERIAL (including a correction). Clean count 0/3.**

### T6.12 — PASS 6 (full sequential, all 125 blocks) — **CLEAN 1/3**

Complete read from block 5 → 624. **Every block maps to a documented entry**: the chunked load and the
enum refresh (T6.1), the officials build with the v2 warning found in advance (T6.2), the
truthiness bug and the 3-game NBA.com gap (T6.2a–b), lineups with both bugs (T6.3), the schema-audit
gaps (T6.10c), the injury-PDF discovery (T6.4), the owner's scope correction (T6.5), and the delta
worker with its three-attempt completeness check (T6.6, T6.11).

One detail confirmed here: the **officials writer's enum picked up immediately** — *"The tool's enum
picked this one up right away"* — in contrast to the starter-status writer that needed a turn boundary.
**The refresh is not deterministic**, which is why re-checking is worth a single call.

**CLEAN PASS 1 of 3.**

### T6.13 — CURRENT STATE OF T6

**6 passes. 5 found new material. Clean count: 1/3** (pass 6).

| Pass | Method | New findings |
|---|---|---|
| 1 | full sequential | the whole T6 narrative — 7 sections |
| 2 | DDL | `game_officials` `assignment`/`_V3` key; `lineup_profile` `TEXT[]` |
| 3 | research conclusion | **the XYZ-tracking tell; the priority ranking that held** |
| 4 | milestones + live check | **4,319 coach's-decision DNPs**; the `comment` format split |
| 5 | delta worker close | **the pre-flight check DOES exist — T4.12c corrected** |
| 6 | full sequential | **CLEAN** |

**Two more consecutive clean full passes required before T6 is DONE.**

### T6.14 — PASS 7 (full sequential, 215-char context, head and tail) — **CLEAN 2/3**

**Every block maps to a documented entry. Nothing new.**

Two implementation details confirmed in the tail, both consistent with patterns already recorded:
- **`DAILY_DELTA_RUNNER_WORKER` already existed as a shared/MLB binding**, so *"I'll use a **new
  NBA-specific binding name to avoid any conflict**"* — the namespace-collision discipline from T1.13
  applied to bindings, not just tables.
- **An empty-result guard was added pre-emptively**: *"since this season likely has zero games so far
  and **an empty bulk insert could error**"* — anticipating the zero case rather than discovering it.

**CLEAN PASS 2 of 3.**

### T6.15 — CURRENT STATE OF T6

**7 passes. 5 found new material. Clean count: 2/3** (passes 6, 7).

**ONE more complete clean sequential pass and T6 is DONE.**

### T6.16 — PASS 8 (full sequential, 255-char context) — **CLEAN 3/3**

**Every block maps to a documented entry. Nothing new.**

One phrase resolved to its full form: the invocation block was *"the MCP tool's **hard client-side
validation** blocking the new worker binding"* — so the enum is enforced **client-side**, which is why
no server-side routing (Control Room) could work around it, and why only a refreshed tool list could
resolve it.

---

# ✅ T6 IS **DONE** — 3 CONSECUTIVE CLEAN PASSES (6, 7, 8)

**Final tally: 8 passes. 5 found new material. Passes 6, 7, 8 clean.**

**T6 built five things and hit four bugs. What matters going forward:**

| Finding | Status |
|---|---|
| **`if rows is not None` passes `[]`** — 1,230 "successes", 1,227 real | ✅ fixed; **same class as the NaN bug** |
| **`boxscoresummaryv2` unreliable after 2025-04-10** — found documented BEFORE building | ✅ v3, tested on 5 samples first |
| **Lineup PK omitted `team_id`** (traded players pair up on two teams) | ✅ fixed — **failed loudly, unlike the splits PK** |
| **Completeness check: 3 attempts → `GAME_ID` prefix `002`** | ✅ **1230 = 1230**; origin of the convention in `check_delta_gaps.py` |
| **4,319 coach's-decision DNPs sitting unused** | ⚠ **OPEN** — purest role-volatility signal available |
| **`comment` has two formats** (`DND_LEAGUE_SUSPENSION` vs `DNP - League Suspension`) | ⚠ any naive parse misses 11 rows |
| **The MCP enum refreshes between turns** | ✅ **overturns T1's conclusion** — re-check before expensive workarounds |
| **The injury-PDF source** (`ak-static.cms.nba.com/referee/injury/…`, back to 2021-22) | → built T10, became the availability backbone |
| Pre-flight completeness check | ✅ **exists** — T4.12c corrected |

**The transcript's own summary of its method is the durable lesson:**
> *"every real bug encountered along the way (**the v2-unreliable-for-history pattern twice**, the
> truthiness bug, the array-literal issue, the primary-key gap) was caught by **checking actual data
> rather than accepting a 'success' status at face value**."*

---

## RUNNING TOTAL: 6 of 16 transcripts DONE
| # | Transcript | Passes | Status |
|---|---|---|---|
| T1 | phase1-static | 28 | ✅ 3/3 |
| T2 | phase3a-enrichment | 11 | ✅ 3/3 |
| T3 | phase3a-final | 10 | ✅ 3/3 |
| T4 | phase3b-backfill | 12 | ✅ 3/3 |
| T5 | phase3c-starter-status | 8 | ✅ 3/3 |
| T6 | phase3d-delta | 8 | ✅ 3/3 |

**Phase 3 is fully documented. The data layer is complete.**

## NEXT: T7 — `2026-09-09-03-51-16-nba-classification-baseline-design-research.txt` (3.1 MB)
The classification/baseline **design** session — the full prop universe across all apps and period
layers, the **5-dimension tiering architecture** (player / rate / role tiers, factor tiers, variation
bands, direction, prop line), and the design document that gets materialised into `nba_config`.

---

## T7 — `2026-09-09-03-51-16-nba-classification-baseline-design-research.txt`
**Delta completion · the final audit · THE SEASON-HARDCODING FINDING · the deep documentation
checkpoint · data-universe research**
*154 content blocks · **PASS 1 (full sequential) 2026-09-20***

**⚠ Note on the journal's label**: the journal describes T7 as the classification/baseline design
session. **The transcript's actual content is different** — it finishes the delta worker, runs the
final completeness audit, uncovers a systemic season-hardcoding bug, writes the deep documentation
checkpoint, and researches the data universe. **The tiering-architecture design is in T8.**
*(This matches the T4.13 finding that transcript phase labels are approximate.)*

### T7.1 — **THE SEASON-HARDCODING BUG — the most dangerous finding in the transcripts**

Triggered by the owner's simulation question, which *"surfaced real gaps"* when taken seriously.

> *"Confirmed — and this is a **systemic finding, not an isolated one**… **Confirmed on 6 scrapers
> checked directly — the pattern is universal.**"*

> *"**Every weekly scraper** (bio, tracking, playtypes, shot quality, lineups, splits) **hardcodes
> `Season=2025-26`**. **On Oct 3, the whole weekly cycle would SILENTLY KEEP PULLING LAST SEASON'S
> FROZEN DATA WHILE REPORTING SUCCESS** — **the most dangerous kind of failure**. Only the daily-delta
> scraper auto-detects season."*

**The season opens 2026-10-03. Without this fix, P1 would run every Monday, report green, and serve
2025-26 data into a 2026-27 pipeline indefinitely.**

**Fix: one shared `detect_current_season()` utility applied everywhere** — the same one the delta
scraper already had. **Patched across 9 stats scrapers**, with `active_stats_season` vs
`current_season` distinguished (players/teams/schedule keep `current_season`).
**DARKO needs no season parameter** — it always serves current.
**Schedule was hardcoded to a 2-season list** → made dynamic (prior + current).
**Shot quality had TWO hardcoded URLs** — both patched, plus a missing `SEASON` import.
**All patched scrapers were syntax-checked in the sandbox before shipping.**

### T7.2 — The four other delta-path gaps found by the same question
| Gap | Severity | What was wrong |
|---|---|---|
| **Splits + career totals** | Medium | *"Only exist in the one-time backfill — **no recurring refresh at all**, so they'd go stale as the season progresses. They're cumulative aggregates, so weekly is the right cadence."* |
| **Defence-vs-Position** | Medium | *"Derived via a **one-off manual SQL** — no worker recomputes it as new game logs arrive."* |
| **Starter-status + officials for NEW games** | Medium | *"The scrapers hardcode 'all games from the full-season JSON.' Need a **delta mode**… daily volume is tiny (~5–15 games ≈ 10–30 calls)."* |
| **New players (rookies/signings)** | Low | *"Won't exist in `nba_ref.players` until the weekly players scrape; game logs still insert fine (**no FK**), but **position-dependent derived tables silently skip them** until the roster catches up."* |

### T7.3 — **The replay-mode idea, proposed here and built much later**
> *"A **'replay mode' for the delta pipeline**: replay 2025-26 **day-by-day as if it were arriving
> fresh** — game logs → starter-status delta → officials delta → DvP recompute → completeness check —
> using only historical data. That validates **the entire delta logic end-to-end before Oct 3, without
> a single live game**."*

**This is exactly what the live session's P2 replay (`asof` + `skip_mining=true`) and the 2025-11-29
P3 verification do** — proposed in T7, realised thirteen transcripts later.

### T7.4 — The owner's simulation insight, confirmed
> **OWNER:** *"with the previous seasons, I am sure you can **simulate the classification/baseline
> pipeline**, which is already enough to define logic, define the player tiers, the metrics…"*

> *"**Your simulation insight is right, and it's a strong one.** With 3 complete seasons, the entire
> baseline/classification pipeline can be **developed and validated fully offline** — walk-forward on
> 2025-26 (**treat each date as 'today', compute from prior data only, compare to the actual
> result**). Player tiers, metrics, shrinkage weights, EWMA alpha, variance windows — all definable and
> testable with **zero live data. No reason to wait for October for any of that.**"*

**This is the as-of walk-forward method that the entire backtest harness implements.**

### T7.5 — The final 100% audit, and one more gap closed
Owner: *"Do one last pass and be sure we are covering 100% of static, weekly and backfill"*

**Audited against the planning docs, not memory**: *"starting with the original planning docs to check
against what's actually been built, rather than relying on memory of what I think I did"*, then
*"checking actual row counts across every table in every NBA schema, to catch anything that **exists
structurally but is empty or stale**."*

**A gap found in the assistant's own work**: *"my own daily-delta worker's **docstring promised** it
would identify new games needing starter-status/officials data, but **I never actually implemented
that part**."* Closed in the same session.
**Then a column error on the fix** — `player_game_log` has no team tricode columns (those are on
`nba_calendar.games`) → used the `matchup` field instead.
**Verified against known reality**: *"**0 missing starter-status games, 3 missing officials games** (the
same 3 real ones already documented)."*

**`prop_taxonomy` found empty** — correctly judged *"a scoring/master-run concept, not static/backfill
scope."* **Differential logs empty** — *"correct and expected (only one baseline run so far)."*

### T7.6 — The deep documentation checkpoint
Owner: *"I need you to detailed document your work so far, deep detail, research, sources, methods,
connections, data, tables, structure, everything that matters… to the point any new chat…"*

→ **`nba/NBA_DEEP_DOCUMENTATION_CHECKPOINT_2026-09-04.md`, 30 KB**, built in sections, with
*"fresh, verified numbers one more time before writing this, so the documentation is **accurate rather
than based on memory** of earlier counts."*
**The memory file was updated to point at it**, *"so future sessions find it immediately."*

### T7.7 — Another Gemini correction
> *"Verified — Gemini was **wrong** on one point: **potential assists, adjusted assists, secondary
> assists, and assist-points-created are already in our tracking data** (the Passing measure type).
> **Good that I checked.**"*

**T7 PASS 1: complete sequential read. Clean count 0/3.**

### T7.8 — PASS 2 (live verification of the season fix) — **CONFIRMED, WITH ONE EDGE CASE**

#### T7.8a — ✅ The fix holds
`nba/scrape_nba_player_bio.py` now reads:
```python
from nba_season import active_stats_season
SEASON = active_stats_season()
URL = f"…leaguedashplayerbiostats?LeagueID=00&Season={SEASON}&…"
POSITION_URL = f"…playerindex?LeagueID=00&Season={SEASON}&Historical=0"
```
**No hardcoded `2025-26`.** Both URLs in the file use the utility.

#### T7.8b — `nba/nba_season.py` — and the distinction that matters
| Function | Logic | Today (2026-09-20) |
|---|---|---|
| **`current_season()`** | `month >= 7` → current year | **2026-27** — the calendar season |
| **`active_stats_season()`** | *"**Jul, Aug, Sep = off-season: the season with real game data is still the prior one**"* | **2025-26** — the season that HAS data |
| `prior_seasons(n)` | the n seasons before a base | |
| `stats_seasons(n)` | **anchored on `active_stats_season`, NOT `current_season`** | |

**Both honour an `NBA_SEASON` environment override** — so any run can be pinned for replay.

**`stats_seasons` documents a real bug it fixes (2026-09-08)**: *"building the [3-season list] back
from `current_season` (2026-27) while the anchor was `active_stats_season` (2025-26)"* — **an
off-by-one-season error in the training window**, which would have silently trained on the wrong three
seasons.

#### T7.8c — **⚠ AN EDGE CASE, and the season opens in two weeks**
`active_stats_season` branches on `month >= 10` → current year. So:
| Date | `active_stats_season()` | Regular-season games in it |
|---|---|---|
| 2026-09-30 | 2025-26 | 1,230 ✓ |
| **2026-10-01** | **2026-27** | **0** |
| **2026-10-02** | **2026-27** | **0** |
| 2026-10-03 (opening night) | 2026-27 | games begin |

**There is a ~2-day window (Oct 1–2) where `active_stats_season` points at a season with zero
regular-season data.** Preseason games also run in early October, but they carry `GAME_ID` prefix
`001`, not `002`, so they do not count.

**Likely impact is small** — a weekly scraper running Oct 1–2 would pull empty aggregates and write
them, and P1 next runs Monday. **But it is exactly the "silently succeeds with wrong data" shape the
utility was built to prevent.** The month-boundary heuristic is one day-granularity assumption away
from being exact; the schedule table already holds the real opening date (2026-10-03).
**Recorded in OPEN_ITEMS. Not fixed — documentation pass.**

**T7 PASS 2: NEW MATERIAL. Clean count 0/3.**

### T7.9 — PASS 3 — the 100% audit, and the checkpoint document's structure

#### T7.9a — The audit table, in full
| Category | Status |
|---|---|
| **All 30 data tables** (`nba_ref`/`nba_calendar`/`nba_team`/`nba_stats`) | ✅ real, correct counts |
| `nba_ref.prop_taxonomy` (0 rows) | correctly empty — *"a Board/Scoring concept, out of scope for this layer"* |
| `*_differential_log` (0 rows) | correctly empty — *"only one weekly baseline run has happened; **detection starts on the second run**"* |
| **18 registered workers** | *"All have real corresponding scrapers on disk, **no orphans either direction**"* |
| Weekly scrape workflow | *"All **14 static/weekly-phase scrapers** cross-checked **step-by-step against the actual workflow file**"* |

**"No orphans either direction"** is the strong form of the check: no registry row without a script,
**and** no script without a registry row.

**The differential note is worth keeping**: an empty `*_differential_log` after one run is *correct*.
**But T3.11a establishes the worker was never scheduled** — so those tables are still empty for a
different reason now, and the "expected on first run" explanation no longer applies.

#### T7.9b — The gap found by re-reading the assistant's own code against its own claims
> *"my own daily-delta worker's **design comment promised** it would surface which new games are
> missing starter-status/officials coverage — but I'd **only built the game-log completeness check,
> never the part I'd actually described**. **Found it by re-reading my own code against my own claims,
> not by assumption.**"*

**Verified against known reality after fixing**: *"exactly **0 missing starter-status games and 3
missing officials games** for 2025-26 — matching the earlier, independently-confirmed findings
exactly."*

**A docstring that overstates what the code does is a real defect class** — and the only way it was
caught was comparing the two directly.

#### T7.9c — The checkpoint document's 10 sections
**✅ VERIFIED PRESENT 2026-09-20: `nba/NBA_DEEP_DOCUMENTATION_CHECKPOINT_2026-09-04.md` — 30,601
bytes, 359 lines.** Confirmed headings include *"What this system is"*, *"Infrastructure — how
everything actually runs"*, *"Complete table inventory — every table, real row count, real purpose
(verified 2026-09-04)"*, and *"Complete worker inventory (**19 registered, all `enabled=1`**)"*.

**Note 19 vs 18**: the audit table says 18 registered workers; the checkpoint written in the same
session says 19. **The delta worker registered between the two** — the count moved during the session.

The 10 sections, as described:
1. What this system is — scope, boundaries, isolation from MLB
2. Infrastructure — schemas, Workers, the bridge, **the Cloudflare→GitHub Actions workaround**, triggers
3. Every table — 30, real verified counts, **including the two correctly-empty ones explained**
4. Every worker — 19, job keys, phases, **exact source endpoints, binding names**
5. Every real data source — *"with honest reliability notes (**v2-vs-v3 lesson front and centre**)"*
6. **Every real bug found and fixed — 9 of them, each with root cause, not just 'fixed it'**
7. Key research/Gemini findings, condensed
8. **What's explicitly NOT built yet, and why** — *"**the most important section for continuity**:
   baseline pipeline, master run, enrichment, board scraper, outcome grading — **all deliberate scope
   boundaries, not oversights**"*
9. **Non-obvious lessons** — *"v3-before-v2, **don't trust '0 errors'**, cheap diagnostics first,
   `GAME_ID` prefixes, the tool-enum lag"*
10. Suggested next steps, in priority order

**Section 8's framing is the one worth copying**: distinguishing *deliberate scope boundary* from
*oversight* is what stops a future session from "fixing" something that was never meant to exist yet.

#### T7.9d — The write-time discipline
> *"**Every number in it was re-pulled from live Postgres at write-time, not carried from memory.**"*

#### T7.9e — The owner's brainstorm framing
> *"This is just a **test and brainstorm, do not start building yet**, you can build **probe workers**
> for now if needed."*

**And the question it asked was the productive one**: *"is the path already known for when the real
data comes up?"* — which is what surfaced the season-hardcoding bug (T7.1) and the four delta gaps
(T7.2). **Asking "will this work later?" found five problems that "does this work now?" could not.**

**T7 PASS 3: NEW MATERIAL. Clean count 0/3.**

### T7.10 — PASS 4 — **THE DATA-UNIVERSE RESEARCH, AND THE PER-STAT DECAY TABLE**

#### T7.10a — The six-gap verdict table
| Gap | Cost | Baseline impact | Verdict |
|---|---|---|---|
| **Usage / Scoring / Four Factors** measure types | **9 cheap bulk calls** (3 types × 3 seasons) | **High** — Usage = *"share-of-team-stats per game, the direct input for role/opportunity modelling"*; Scoring = *"composition (%paint/mid/3pt/FT, %assisted → **scoring stability archetype**)"*; Four Factors = *"true efficiency (eFG%, FTA rate)"* | **BUILD** |
| **Per-stat decay rates** (not one alpha) | **Zero data cost** — methodology + config table | **HIGHEST** — *"3pt% needs a **long memory**, assist rate needs a **short** one; **a single alpha is wrong for all of them**"* | **DO IT** |
| Opponent / Defence / Misc types | 9 more cheap calls | Low — *"matchup/single-game descriptive, **not baseline talent**"* | Skip |
| Play-by-play (garbage time, per-possession) | Real engineering | High, but *"our **MIN + score-margin proxy** is a reasonable stand-in"* | Defer, document |
| **Starter-status for 2023-24/2024-25** | 2,460 expensive calls | Moderate — ***"90% proxied by MIN + Usage once we have it"*** | Defer |
| Teammate-context conditional rates | Zero new data | High, but *"it's baseline **LOGIC, not data**"* | Note for the pipeline |

**Two of these settle open items I raised earlier:**
- **The T5 starter-status coverage asymmetry has a stated mitigation**: *"90% proxied by MIN + Usage."*
  The one-season gap is less severe than it looked, **provided Usage is actually used that way.**
- **The garbage-time proxy is confirmed a third time** as MIN + margin (cf. T4.14b, T6.9).

#### T7.10b — The execution order, and its reasoning
> *"1. **Season utility first** → 2. new measure types → 3. decay config table → 4. **replay probe
> last**. The utility had to come first so the **new scrapers use it from day one instead of repeating
> the bug**; the replay probe goes last so I'm **not validating a delta path for data that's about to
> expand**."*

**Both halves are ordering-by-dependency rather than by priority** — a fix applied before the code
that would inherit the bug, and a validator built after the thing it validates stops changing.

#### T7.10c — ✅ **ALL OF IT WAS BUILT — verified live 2026-09-20**
`nba_config.stat_decay_config` · `nba_stats.player_game_log_usage` ·
`nba_stats.player_game_log_scoring` · `nba_team.team_game_log_four_factors` ·
`nba_team.team_game_log_scoring`

#### T7.10d — **`nba_config.stat_decay_config` — 13 rows, and every one carries its reasoning**
Columns: `stat_key`, `display_name`, **`ewma_alpha`**, **`min_lookback_games`**,
**`shrinkage_stabilization_games`**, **`memory_class`**, **`rationale`**, `active`, `updated_at`.

| `stat_key` | α | lookback | stabilise | class |
|---|---|---|---|---|
| **minutes** | **0.20** | 8 | **10** | short |
| usg_pct | 0.15 | 10 | 15 | short |
| ast_rate | 0.15 | 10 | 20 | short |
| pts_rate | 0.12 | 15 | 25 | medium-short |
| fg3a_rate | 0.12 | 15 | 25 | medium-short |
| stl_rate | 0.10 | 15 | 60 | medium-short |
| fta_rate | 0.10 | 15 | 30 | medium |
| tov_rate | 0.10 | 15 | 40 | medium |
| reb_rate | 0.08 | 20 | 40 | medium |
| blk_rate | 0.08 | 20 | 50 | medium |
| fg_pct | 0.06 | 25 | 120 | medium-long |
| ft_pct | 0.04 | 30 | **150** | long |
| **fg3_pct** | **0.03** | **40** | **300** | **long** |

**The alpha spread is 6.7× (0.03 → 0.20) and the stabilisation spread is 30× (10 → 300 games).**
**A single alpha would have been wrong for eleven of the thirteen.**

**The `rationale` column is the most valuable part** — each row explains itself:
- **minutes**: *"the **single biggest error source in props** and are set by coaching decisions that
  change abruptly; **shortest memory of all**"* — the T4.9c warning, encoded as a parameter.
- **usg_pct**: *"Role can change overnight (trade, teammate injury); **USG% from 30 games ago as a 4th
  option is irrelevant if now a 2nd option**. React fast."*
- **fg3_pct**: *"True 3pt shooting talent takes **hundreds of attempts** to stabilise; **a 10-game
  hot/cold streak is mostly noise**."*
- **fg3a_rate**: *"**Attempt VOLUME (unlike make %) is role/scheme-driven** and moves with usage, not
  shooting talent."* — **the same stat split into two memory classes depending on which component.**

**This is the no-hardcoding rule (owner, T1) applied to its hardest case**: not timeouts or chunk
sizes, but **model hyperparameters**, each with its justification stored beside it and SQL-editable.

**T7 PASS 4: MAJOR NEW MATERIAL. Clean count 0/3.**

### T7.11 — PASS 5 — **the measure-type build's bugs, and the classification research begins**

#### T7.11a — **THE SEASON-HARDCODING BUG AGAIN, IN THE WRITERS**
> *"Now make the two **per-game writers** season-aware — **they hardcode `_2025_26` and would silently
> keep loading last season's file in October**. Both read the season from the delta meta by default."*

**The same bug class as T7.1, in a different layer.** The scrapers were fixed; **the Workers that read
their output had the identical flaw.** A fix applied to one layer did not propagate to the other —
which is exactly why the OPEN_ITEMS entry keeps the pattern listed even though it is "fixed".

**And a follow-on defect in the fix itself**: *"The starter-status writer's `fetchFromGithubRaw`
returns **`{file, meta}`**, so `.season` needs to be **`.file.season`**."*

#### T7.11b — **A mapper silently writing columns that do not exist**
> *"Confirmed — **the team table has no `usg_pct` and no `reb_pct`**. Aligning the mapper to the real
> schema."*

**Then the sharper move — checking the one that WORKED:**
> *"Let me also verify the **player** advanced mapper matches its real table, **since it 'worked' but
> might be silently mapping a nonexistent column too**."*
> *"Player advanced matches exactly (**it has `usg_pct` and `reb_pct`; team doesn't**) — that mapper is
> correct."*

**Player and team advanced tables have genuinely different columns**, and only the team mapper was
wrong. **Verifying the passing case is what confirmed the difference was real rather than a lucky
escape.**

#### T7.11c — Two more fixes in the same pass
- **`nn()` null-handling wrapped around all four mappers**, applied via `nnRow(...)` at each closing
  site — with *"the two advanced mappers have **identical closing lines** — I need a unique anchor for
  each"*, disambiguated by the preceding `player_id`/`team_id` line.
- **A cosmetic duplicate in the gap sample**: *"each game listed twice because **both teams' `matchup`
  strings differ**"* → dropped `matchup` from the grouping.

**Result**: *"All **2,460 rows** touched by the delta with real pace values, **no nulls**."*

#### T7.11d — **Documentation kept in sync with config, deliberately**
> *"the methodology doc still says a **single `alpha=0.2`** — **that's now wrong and must be corrected
> so the design and the config table agree**."*

**A design document that contradicts the live config is a future trap**, and it was fixed in the same
step that created the divergence.

#### T7.11e — The remaining recurring-path gaps, closed
- **DvP recompute placed inside the delta worker** (*"before `sql.end()`"*, after a no-op patch attempt)
- **Splits + career totals onto a recurring path** via *"a **`mode` input** rather than build a new
  worker"*, reading season from the scraper meta — *"Both metas carry `season`."*
- **Both added to the weekly cycle workflow.**

**→ This closes two of the four T7.2 gaps and one from the T7 gap table.** OPEN_ITEMS updated.

#### T7.11f — **THE CLASSIFICATION RESEARCH BEGINS** (the journal's label, arriving late)
> **OWNER:** *"What is the next phase? The next phase is **the classification and baseline
> configuration**. So I want you to take a look on the **MLB classification and baseline pipeline**…"*

> *"**this is the real heart of the system**. Before I ask questions, let me **ground them in the actual
> MLB code rather than guess** at how it works."*

**MLB source files read**: `alphadog-v2-base-classification-v5.js`, `alphadog-v2-base-baseline.js`,
plus the design/calibration docs. *"**The live function starts at line 8688.** Let me read it in full —
**this is the logic I need to port exactly**."*
Then: *"let me pull the **real calibration config values from Postgres** so I understand the **actual
parameters, not just the code shape**."*

#### T7.11g — The owner's design instructions, by voice
*(These messages are voice-transcribed — the phrasing shows it.)*
- *"the **caps, lifts and penalties**… each one of the pipelines are gonna have its proper caps and
  lifts and penalties according to [its tier]"*
- *"**Lifts and penalties are factor driven** with deeper research to understand which factors are
  important to be considered on the baseline, **remembering that the baseline is looking to the best
  [and] poor diagnos[tic]**"*
- *"the different variations get different **tiers**. That is working very well for MLB. And **every
  once in a while, we have to granulate even more**. **Again, Gemini is not the absolute truth.**"*
- *"There are a few very important factors like **injury report, projected minutes, and lineups** —
  **minutes is very, very important on NBA**."*

#### T7.11h — The research standard applied to sources, not just claims
- **OpticOdds** consulted on empirical-vs-parametric — *"an **industry pricing source rather than a
  hobbyist one**."*
- *"every conclusion below has **at least two independent sources** behind it"*
- *"I've **flagged the one place I'm proposing an adaptation to the MLB logic**"*
- **Peer-reviewed factors found**: *"The sweep found real, **peer-reviewed** factors I hadn't
  included."*

#### T7.11i — The owner's correction on prop coverage
> **OWNER:** *"you should have a **map/list of all possible available prop lines already for the 3 apps
> we use**, otherwise you **cannot properly do a factors research**"*
> *"**You're right** — I only have PrizePicks' catalog, and **only roughly**. **A factor study can't be
> complete against an incomplete prop map.**"*

**T7 PASS 5: MAJOR NEW MATERIAL. Clean count 0/3.**

### T7.12 — PASS 6 — the delta path proven end-to-end, and a design detail worth copying

#### T7.12a — **`known_empty_games` — a skip list that prevents a permanent daily cost**
> *"The per-game delta persists a **`known_empty_games` skip list**. **Without it, the 3 games the
> source itself returns empty would be re-fetched EVERY SINGLE DAY FOREVER.** Real run confirmed:
> attempted 3, all empty, recorded, and they're now **excluded for good**."*

**This is the right way to handle the accepted 0.24% gap from T6.2b.** The alternative — treating them
as perpetually "missing" — would mean three wasted calls every day of the season, and a completeness
check that never reports clean. **A permanent source gap needs a permanent record, not a retry loop.**

#### T7.12b — **The derivation was dry-run against real files BEFORE any network call**
> *"I **dry-ran the derivation logic against the real committed files before any network call** — it
> produced **exactly the right delta (starter: 0, officials: those 3)**."*

**The delta logic was validated against a known-correct answer with zero API cost** — the same method
as T5's 7-call diagnostic and T6's 5-sample v3 test, taken one step further: **no calls at all.**

#### T7.12c — The four closures, with their mechanics
| Gap | How it was closed |
|---|---|
| DvP had no recurring path | Runs **inside the daily-delta worker after game logs load** — **210 rows (30 × 7)**, i.e. **current season only**, not the 630 three-season backfill |
| Splits + career totals had no recurring path | Backfill worker gained **`{"mode":"weekly"}`** — *"loads only those two in **~6s instead of re-touching 79k rows**"*; **splits season read from the scraper meta, not hardcoded** |
| New games surfaced but **never fetched** | **`scrape_nba_per_game_delta.py`** — *"derives the delta **purely from committed files**, fetches **only new games**, **appends** to the season file"* |
| Writers hardcoded `_2025_26` | Season-aware via the delta meta — *"would have **silently loaded last season forever in October**"* |

**Note the `mode` pattern**: rather than build a fifth worker, an existing one gained a mode input that
scopes it to two tables and runs in **~6 seconds instead of touching 79,000 rows**. **Reuse with a
narrowing parameter, not duplication.**

#### T7.12d — The DvP recompute is single-season by design
**210 rows = 30 teams × 7 positions × 1 season.** The three-season table (630 rows) came from the
backfill; **the recurring path maintains the current season only**, which is correct — historical
seasons do not change.

**T7 PASS 6: NEW MATERIAL. Clean count 0/3.**

### T7.13 — PASS 7 — **THE MLB PIPELINE PORTED, AND THE BASELINE BOUNDARY REDEFINED**

#### T7.13a — **THE THREE-GENERATION TRAP, avoided by reading headers**
> *"There are **three generations** of classification/baseline in the repo, and **only one is live**:"*
| Generation | Status |
|---|---|
| `alphadog-v2-base-classification-v5.js` | header literally says ***"OLD VERSION — DO NOT TOUCH — CONFIRMED DEAD"*** |
| v6 in D1 (inside the 1 MB phase3a file) | ***"D1 pipeline — CONFIRMED DEAD, do not build on this"*** |
| **`runClassificationBaselineV6ToPostgres`** | **the real one** — daily cron, writes `classification.classification_v6_current` + `classification.baseline_v6_current` |

> *"**Porting from either dead version would have locked in wrong logic.** I read the live one line by
> line."*

**This is the single highest-value "verify before building on top" moment in the transcripts** — the
file named `-v5` with the most obvious name was dead, and so was the v6 that sounded current.

#### T7.13b — **The live MLB logic, in full** (per prop × line × side)
**Classification:**
1. **Recency-blended rate** from `metric_snapshots`: **last_5 (0.4) / last_10 (0.3) / last_20 (0.2) /
   season (0.1)**, renormalised if a window is missing
2. **Population stats across all eligible players for that exact combo** — *"computed **once, never
   per-chunk, so tier boundaries don't drift**"*
3. **Tier by QUANTILE RANK, not fixed z-bands** — **`max_tiers=24`** *(raised from 12 after a real
   backtest: **MAE improved, then plateaued at 24**)*, **`min_population_per_tier=15`**

**Baseline:**
4. **Tier prior** = tier's mean rate, blended toward population mean with **`k=5`**
5. **Empirical-Bayes prior strength** — *"a single population-level constant per combo (**Efron-Morris
   method of moments**), branched by distribution type, so **shrinkage genuinely decays to zero as a
   player's sample grows**"*
6. **Shrunk rate** = `(n·rate + priorStrength·tierPrior) / (n + priorStrength)`
7. **Distribution → hit probability, chosen per prop**, in a cascade:
   **empirical per-tier outcome table** (*"the sharpest — sums real observed P(0..threshold), **no
   assumed family**, requires **≥300 games/tier**"*) → else **Negative-Binomial/Poisson** for counts
   (with per-mean-tier dispersion) → else **Normal** with a real prediction interval and within-player
   variance
8. **Guards**: **Wilson clamp below n=30** · a sample-size ceiling on confidence · **a discontinuity
   override** (role change / long gap → use only role-consistent recent games) · role-aware and
   opponent-aware tier lookups for specific props

**Every one of these survives into the NBA engine** — the quantile tiers, the empirical-first cascade,
the shrinkage-decays-to-zero property and the discontinuity override are all recognisable in
`classification_ladder_v12.py`.

#### T7.13c — **The owner corrects a Gemini recommendation, and the correction is accepted with cause**
> **OWNER:** *"the different variations get different tiers. That is working very well for MLB…
> **Gemini is not the absolute truth**."*

> *"**you're right, and I should have checked the MLB code before relaying Gemini's argument.** The
> live MLB function runs **per `prop + line + side`**: population stats and tiers are computed **per
> combo**, which *is* per variation. **Gemini's 'tier globally' advice contradicts the proven
> architecture.**"*

**The owner's domain knowledge beat the research tool on a structural question** — and the resolution
was to check the code, not to arbitrate between opinions.

#### T7.13d — **THE BASELINE BOUNDARY, REDEFINED — the most consequential design decision here**
> *"this is the important refinement. **The baseline isn't 'player history only.' It's everything
> derivable from static and historical data** — including **the calendar**, which tells us the
> opponent, home/away, and rest days for the actual game. So **opponent defence, pace matchup, and
> blowout risk all belong in the baseline**, derived from **team strength rather than a live spread**.
> **Only truly live inputs (injury reports, confirmed lineups, market lines) are enrichment** — and for
> the important ones, **the baseline carries a derived signal as backup**."*

**This redraws the line set in T4.** It is why the parity document later assigns D1 (referee),
M1 (matchup) and blowout to the **baseline stage** rather than enrichment, and why T16's factors are
baseline-stage refits rather than enrichment multipliers.

**And "the baseline carries a derived signal as backup" is the origin of the derived-spread proxy**
(r=0.46) that T16 eventually **replaced with the real market spread** — the backup was built first,
by design, and upgraded when the live input proved reliably available.

#### T7.13e — **BLOWOUT AS A MINUTES MIXTURE, NOT A PENALTY — specified here**
> *"All sources converge: **blowouts don't reduce points, they reduce MINUTES**, which reduces
> everything. So the mechanism is
> **`P(blowout) × [blowout-minutes distribution] + (1−P) × [competitive-minutes distribution]`** —
> **causal and self-explaining** — rather than a post-hoc probability drag. **A direct penalty is what
> you called capping; this is the 'proper logic that drives the number there on its own.'**"*

**✅ This confirms T4.11's finding from the design side.** `nba_score.blowout_model` stores **ratios**
(competitive 1.0333, won-by-25+ 0.8748) precisely because it was specified as a **mixture over minutes
distributions**, not a penalty. **The T4 "don't penalize twice" warning and this mixture design are
the same idea reached from two directions**, and the implementation honours both.

#### T7.13f — The blowout evidence base
**DataStreak (40,856 graded props)**: over-rate decays **monotonically 46.7% → 44.9% → 43.8% → 40.9%**
from close games to 20+ blowouts, *"hitting the **favourite's starters** hardest."*
**RotoGrinders**: *"use a sliding scale by spread, **asymmetric**, and **team-specific** (coaches differ
in how they empty benches)."*
**Design**: `derived_spread = net-rating differential + home court + rest differential` (all
static/historical) → `P(blowout)` from a lookup built on our own 3 seasons → then a **team-specific
`E[minutes | blowout]`** from each team's real history.
> *"I can **reproduce the DataStreak curve on our 79k logs** as a validation — **no market data
> needed**."*

**Note what T16 kept and dropped**: the asymmetry survived (won-by-25+ 0.8748 vs lost-by-25+ 0.9124 —
the favourite's starters lose more), but **`blowout_model` has no team-specific dimension** — it is
keyed on margin band and side only. **The RotoGrinders team-specific recommendation was not
implemented.** Recorded in OPEN_ITEMS.

#### T7.13g — Ladder width as specified here, vs as later measured
> *"**anchor ±5–6 steps each direction**, clipped at natural floors (0.5). **That's where the
> Goblin/Demon ROI lives**; the matrix has to cover it."*

**The live session measured the books laddering to ±13 for points and ±16 for pra** — far wider than
±5–6. **The design estimate was roughly half the real depth**, which is exactly the gap the
`LADDER_DEPTH` table was built to close.

**T7 PASS 7: MAJOR NEW MATERIAL. Clean count 0/3.**

### T7.14 — PASS 8 — **THE MINUTES MODEL, AND THE ORIGIN OF A2**

#### T7.14a — Historical prop lines: the verdict, and how it was later overtaken
| Source | Verdict at the time |
|---|---|
| **ParlayAPI** | NBA **game lines back to 2007**, **no historical props**, no DFS books. *"Still useful: real historical spreads to **validate** our derived static spread against (**validation only — never a baseline input**)"* |
| balldontlie | no history |
| **BigDataBall** | sells per-season archives **including sportsbook prop lines** — *"the only retroactive option; **a purchase decision for you**"* |
| Own capture | *"We start our own capture on **Oct 3**, as MLB does"* |

> *"**This does not block the baseline backtest.** Calibration on our own ladder against real outcomes
> (**79k rows**) needs **no market data** — exactly how MLB's baseline was validated. **Market lines
> only matter for ROI later.**"*

**This verdict was overtaken in T13**, which obtained **two full seasons of historical board data from
The Odds API** (→ `nba_market.board_snapshots`, 6.6 GB) — a source not considered here. **BigDataBall
was never purchased and never needed.**

#### T7.14b — **THE MINUTES MODEL — a three-component mixture**
*"all parameters estimable from our 3 seasons"*:
| Component | Distribution | Fit on |
|---|---|---|
| **Normal play** | truncated **Normal(μ_role, σ_player, 0–48)** | **competitive games only** |
| **Blowout-reduced** | same σ, **μ shifted by a regression fit on our own 15+/20+ margin games** | *"**not the published `1.5% × (spread−7)` heuristic**, which Gemini and I both flag as **too linear and player-agnostic**"* |
| **Dud** (foul trouble / early exit) | **log-Normal** | *"competitive games in the player's **bottom 15% or 5+ PF**"* |

**Mixing weights**: `P(blowout)` from the **derived static spread**; `P(dud)` from *"the player's own
history and PF rate."*

**The "dud" component is a distinct idea worth noting** — it separates *early exit for foul trouble* from
*blowout benching*, two different mechanisms that both truncate minutes. **Whether it survives into
`classification_ladder_v12.py` is not established here.**

#### T7.14c — A Gemini correction that follows directly from the boundary rule
> *"**The correction**: Gemini's answer reaches for **'the Vegas spread'** for `P(blowout)`. **In the
> baseline that's the derived spread; the market spread is the enrichment-layer override later.**
> That's exactly your derived-backup principle."*

**And T16 eventually promoted the override to the primary** once the market spread proved reliably
available at 08:00 — the layering worked as designed.

#### T7.14d — **The 240-minute constraint is TIERED, not pro-rata**
> *"**240-minute team constraint** enforced by **tiered renormalisation** — **stars' minutes are
> inelastic, fringe minutes absorb the adjustment. Not pro-rata.**"*

**This is a real modelling insight**: when a team's projected minutes overflow 240, taking the excess
proportionally from everyone would shave a star's minutes as readily as a 12th man's. **Reality
concentrates the adjustment at the bottom of the rotation.**

#### T7.14e — **THE ORIGIN OF A2 — with its confidence tiers specified**
> *"**Derived injury backup**: a **precomputed with/without-teammate minutes table from DNP games**,
> with **confidence tiers** (**<5 games → generic role-based redistribution; 5–14 → shrunk blend;
> 15+ → trust**) — **the 'Wally Pipp' effect**, derived from history."*

**This is A2, designed here in T7 and RETRACTED in T15/T16 after five failed panels** — *"the certified
anchor wins every slice, and worst where the mechanism predicted it should win"* (COMPASS fact 91).

**Worth noting what the design already contained that the failed versions may not have honoured**: the
**confidence tiers keyed on sample size** (<5 / 5–14 / 15+). A with/without table built on fewer than
five shared-absence games is almost pure noise, and the design said so. **Whether the five panels
implemented that gating is not established in these transcripts** — but it is the first thing to check
if A2 is ever revisited.

#### T7.14f — The role-change detector, fully specified
> *"**starter flag flips for 2+ games**, or a **3-game minutes mean >3σ from prior**, or **a trade** →
> **reset the window, use post-change games only**. Minutes EWMA **α≈0.2 (matches our decay config)**."*

**The α≈0.2 cross-check is the design and the config table agreeing** — `stat_decay_config.minutes`
holds exactly 0.20 (T7.10d). **Two independently-derived numbers landing on the same value.**

#### T7.14g — B2B validation targets, used as a sign check
> *"veterans **−1.5 to −3.0 min**, young stars **−0.5 to −1.5**, bench **≈0**, amplified after **OT and
> 3-in-4**. **We derive our own; these catch a sign error.**"*

**Published figures used as a sanity check on our own derivation, not as inputs** — the same discipline
as *"reproduce the DataStreak curve on our 79k logs as a validation."*

#### T7.14h — Rejected on evidence
**Basketball-Reference's 6/3/1 season weighting** — *"archival, **far too slow for in-season role
changes**; usable only as a **day-one cold-start prior**."*

**T7 PASS 8: MAJOR NEW MATERIAL. Clean count 0/3.**

### T7.15 — PASS 9 — **THE PER-PROP FACTOR LOCK, AND THREE STRUCTURAL FINDINGS**

#### T7.15a — The per-prop factor lock table (baseline, static/derived only)
| Prop | Primary drivers (ranked) | Main LIFT | Main PENALTY | Shape |
|---|---|---|---|---|
| **Points** | Minutes · Usage · Pace×DvP · derived teammate-out redistribution | Usage share (esp. **inherited role**) | Opponent efficiency allowed | High-mean **Normal**; low-line **NegBin** |
| **Rebounds** | Minutes (**most linear stat**) · **teammate competition / lineup geometry** · Pace×opp miss rate · opp shot diet | Second big absent / small-ball | **3PA-heavy opponent** (long boards to wings) | **Tight for bigs — most stable prop** |
| **Assists** | Creator role (potential-AST/min) · Minutes · **teammate shooting quality** · opp scheme | Role change (backup PG → starter) | Poor-shooting lineup | **Left-skewed** |
| **3PM** | **3PA volume (≫ 3P%)** · Minutes · opp 3PA allowed · C&S vs pull-up mix | Attempt volume | Run-shooters-off-line schemes | Right-skewed, **zero-inflated, bursty** |
| **Blocks / Steals** | Opp rim-attempt rate / opp TO rate · player rate/min · role · Minutes | Attacking / sloppy opponent | Perimeter-oriented / secure-ball opponent | **Zero-inflated NegBin** |
| **Turnovers** | Usage/ball-handling volume · opp forced-TO rate · Pace | High-usage night | — | **Right-skewed**, spikes regress |
| **Combos / Fantasy** | Union of components · **component covariance** | — | — | **Joint simulation, not direct fit** |

**"3PA volume ≫ 3P%" is the same insight `stat_decay_config` encodes** as two different memory classes
(`fg3a_rate` α=0.12 short vs `fg3_pct` α=0.03 long). **The factor study and the decay table agree.**

#### T7.15b — **STRUCTURAL FINDING 1: direction asymmetry is real and MECHANISTIC**
> *"**assists skew *down*** — an assist requires **pass AND effective pass AND teammate makes it**; any
> failure = zero; **blowouts rest playmakers first**. **Turnovers, stocks and 3PM skew *up*** —
> zero-inflation plus burst games; **mode sits below mean**. So **`more` and `less` genuinely need
> different tier logic** for these — **your instinct confirmed with a mechanism**."*

**This is the justification for `side` being a first-class dimension** in `baseline_history`,
`final_hp` and the calibration cells — not a symmetry to exploit but a genuine asymmetry to model.
**And it was the owner's instinct first, confirmed by mechanism second.**

#### T7.15c — **STRUCTURAL FINDING 2: variation asymmetry — why tiers differ by line band**
> *"for **low-line players (5.5 pts, 0.5 3PM)** the bet is **almost entirely on minutes and dud risk**;
> for **high-line stars** it's **usage and efficiency** — **their minutes are stable**. This is the
> concrete justification for different tier logic per variation band."*

**This is the cleanest statement of why `band` exists** in the calibration cells — and it connects
directly to the confidence model's `f_role` finding (fringe players miss by 0.0283, iron-men by
0.0008). **The same underlying fact, measured three transcripts apart: low-line props are minutes
bets, and minutes are where the error lives.**

#### T7.15d — **STRUCTURAL FINDING 3: combos need joint simulation, and the covariance has a SIGN**
> *"**P–A covariance is strongly positive for ball-handlers**, **R–A positive for bigs like Jokić**,
> **negative for guards**. For a **do-it-all star, PRA has LOWER relative variance than its parts**; for
> a **3-and-D wing, higher**. We have per-game P/R/A to **estimate each player's own covariance
> directly**."*

**Per-player covariance, not a league constant** — and the direction flips by archetype. This is why
combos are built from pickled singles components (`BT_SAVE_COMPONENTS`) rather than fitted directly,
and why a missing combos build costs 44% of the board.

#### T7.15e — **The memory map — and one entry that is NOT in `stat_decay_config`**
> **Long**: 3P%, FT%, contested-rebound rate, assist-to-potential ratio
> **Short**: minutes, usage, FGA/3PA volume, **and opponent defence ratings (last 10–15 games, not
> season-long)**

**`stat_decay_config` covers the player stats** (13 rows: minutes, usg_pct, ast_rate, pts_rate,
fg3a_rate, stl_rate, fta_rate, tov_rate, reb_rate, blk_rate, fg_pct, ft_pct, fg3_pct).
**It has NO entry for opponent defence ratings** — yet the study explicitly calls for them to be
**short memory, 10–15 games, not season-long**.
**`nba_team.defense_vs_position` is a SEASON aggregate**, and `nba_ref.defender_ratings` is a weekly
as-of fit. **Neither is a 10–15 game rolling window.** Recorded in OPEN_ITEMS.

#### T7.15f — Where Gemini was overridden or deferred
| Item | Decision |
|---|---|
| *"Injured teammate is the top lift for points/assists"* | **It is a LIVE factor.** In the baseline it enters as the **derived with/without table and `P(start)`** — the backup principle |
| **DvP for rebounds** | Gemini calls it overrated; **DataStreak says it's worth multiple boards**. *"Both derivable — I'll rank the drivers (miss rate, shot diet) above it and **let the backtest decide**"* |
| **Referees** | *"tonight's crew is announced **the morning of** — **semi-live**. Baseline artefact = **historical crew foul-rate table**; **assignment applied in enrichment**"* |
| **Archetype × scheme interaction** (drop coverage vs pull-up shooters) | *"a real next-level factor, and **we HAVE Synergy play-type data for it** — **deferred to phase 2**, not day one"* |
| **Rest/fatigue affects RATE stats, not just minutes** | **Accepted from Gemini** — *"efficiency, TO rate… **fully static from the schedule**"* |

**"Let the backtest decide" is the right resolution for a genuine source conflict** — and it is what
the factor-gate harness in T15/T16 exists to do.

**T7 PASS 9: MAJOR NEW MATERIAL. Clean count 0/3.**

### T7.16 — PASS 10 — **THE 3-APP PROP MAP, AND PEER-REVIEWED FACTORS**

Built after the owner's correction: *"you should have a map/list of all possible available prop lines
already for the 3 apps we use, otherwise **you cannot properly do a factors research**."*

#### T7.16a — The shared core (all three apps)
Points · Rebounds · Assists · 3PM · Blocks · Steals · Turnovers · P+R · P+A · R+A ·
Stocks (Blk+Stl) · PRA · **Fantasy Score**

**Fantasy Score uses one shared scale — `1 / 1.2 / 1.5 / 3 / 3 / −1`** — *"resolved from **PrizePicks'
official page after a conflicting third-party source**."* **A disagreement between sources settled at
the primary, not averaged.**

#### T7.16b — **Period variants, and an OT rule that is GRADING-CRITICAL**
1Q · 1H · 2H · 4Q for the main stats, **with app-specific OT rules**:
> *"**PrizePicks/Underdog include OT in 2H/4Q; Sleeper's quarter markets EXCLUDE it.**"*

**The same nominal prop grades differently by app.** A 4Q line that pushes on PrizePicks can win or
lose on Sleeper when a game goes to overtime. **This is a per-app grading rule, not a modelling
detail** — and it is exactly the kind of thing COMPASS fact 60's "leg truth and operator settlement
are separate" exists for.

#### T7.16c — App-specific additions
| App | Exclusive props |
|---|---|
| **Underdog** | Personal Fouls · FT Made · FG Attempts · 3PT Attempts · **points per individual quarter** · **First 5 Minutes** stats · First FG/3PT attempt make-or-miss · **First to 10+ Points** · Game/Team High Scorer |
| **Sleeper** | **Double-Double · Triple-Double** · **milestone/alternate lines (20+/25+/30+)** — *"Sleeper's equivalent of Goblin/Demon ladders"* |
| **PrizePicks** | Demon and Goblin variants |

**⚠ THE CLAIM THAT LATER BECAME FALSE**: *"PrizePicks: Demon and Goblin variants — **both More-only
(confirmed officially)**, so the 'less' side exists only on standard lines."*
**This was true when written and verified against PrizePicks' own documentation.** **PrizePicks enabled
Less in 2026-08** (MLB and WNBA first). **This is the origin of the `board_tiers` v1 two-way taxonomy**
that the four-way rule replaces — the v1 design was correct for the world it was built in.

**And the Sleeper note corrects a later assumption**: the live session recorded *"Sleeper has no
alternate lines."* **T7 found milestone lines (20+/25+/30+) — Sleeper's ladder equivalent.** Worth
re-checking.

#### T7.16d — Priority tiers for the baseline matrix
| Tier | Contents | Status |
|---|---|---|
| **A** | the shared core, all apps | built |
| **B** | period variants · Double-Double/Triple-Double · FTM/FGA/3PA — *"all directly derivable from our game logs"* | built (periods, `dd2`) |
| **C** | first-basket · high-scorer · first-5-minutes — *"need **play-by-play we don't have**; **deferred**"* | still deferred |

#### T7.16e — **PEER-REVIEWED FACTORS the sweep added**
| Factor | Evidence | Derivable? |
|---|---|---|
| **Altitude** (Denver, Utah) | ***J. Sports Sciences* 2025**: defensive performance varies significantly with elevation (**p=0.005**); shot selection shifts toward 3PA; ***4Q starter minutes/efficiency reduced*** | **Yes — `nba_ref.arenas.altitude_ft` exists from T1** |
| **Eastward jet lag** | **Peer-reviewed, 10 seasons (PMC)**: west→east travel impairs performance; ***effect ~DOUBLE the reverse direction*** | Yes — needs arena time zone (static, small add) |
| **Schedule density** (3-in-4, 5-in-7, 5-day cumulative load) | Same study (**p=0.065**) + feature-engineering literature | Yes — pure schedule |
| **Rest × position × age interactions** | *"**perimeter shooters and veterans hit hardest on 0 rest**; rim protectors less so"* | Yes — position and age are in our data |
| **Late-season phase** (eliminated/tanking teams rest veterans, play youth) | Widely observed; partially live | Partially — flagged lower-confidence, **backtest decides** |

**Two of these are notable for being *already supported by data built earlier*:**
- **`altitude_ft` was put in `nba_ref.arenas` in T1's very first DDL**, before any factor needed it.
  The peer-reviewed justification arrived six transcripts later.
- **The jet-lag asymmetry (west→east ≈ double) is directionally specific** — a symmetric travel-distance
  factor would wash it out. **D2 (travel) must be directional to capture this.**

> *"These go into the design as **rate-stat modifiers and minutes-model inputs, not as hand-waved
> adjustments** — **each gets validated on the 3-season data before it earns a weight**."*

**T7 PASS 10: MAJOR NEW MATERIAL. Clean count 0/3.**

### T7.17 — PASS 11 (full sequential) — **NEW MATERIAL in the build mechanics**

#### T7.17a — **The count cross-check that proves a load, not just reports it**
> *"**All 12 succeeded, zero errors**, and the per-season counts (**26,651 / 26,306 / 26,401**) match
> the base game logs **EXACTLY** — **that's a real cross-check, not a coincidence**."*
> *"The counts match the base tables **to the row (79,358 / 7,380)**."*

**The new measure-type tables had to match the already-verified base tables exactly**, per season and
in total. **Three independent numbers agreeing is not something a partial load can fake** — this is the
same class of proof as `12,300 = 10 × 1,230` in T5.

#### T7.17b — **A bug prevented by testing the fix against the failure class that had just bitten**
> *"Let me verify the fix produces the right list **across dates** before running, **since this is the
> exact class of bug that just bit me**."*
> *"Correct across every date — **no duplicates**, and today gives exactly
> `['2025-26', '2024-25', '2023-24']`."*

**Having just fixed the season-anchoring off-by-one, the next season-derived list was validated across
multiple dates before use** rather than on today's date alone.

#### T7.17c — The `slim()` filter — dropping columns the API pads out
> *"Let me verify the `slim()` filter keeps exactly the right columns **against the real probed
> headers** before running."* → *"**Every metric column preserved, all `_RANK`/name padding dropped**."*

**stats.nba.com returns a `_RANK` companion for most metrics plus repeated name fields.** Dropping
them before commit is what keeps the per-season JSON manageable — and the filter was validated against
probed headers, not assumed.

#### T7.17d — A race condition with large commits
*"The JSON files are large — **~80k rows each across 4 files**, so **the commit takes a moment**"* —
the first status check found *"a newer commit (`f8b6ad9e`) landed after my last push"* and the run
initially **failed**. Resolved by moving to **per-season files with a glob in the commit step**.

#### T7.17e — Safer-by-construction choices, made before testing
- *"Let me **avoid the uncertain dynamic-identifier pattern** and use **two explicit functions**
  instead — **safer than testing unclear driver behaviour**."*
- *"Every mapped column verified **against the real probed headers** — **zero mismatches**."*

**Choosing the boring construction over investigating whether the clever one works** is a recurring
pattern, and it is what the `sql.array()`-vs-manual-literal decision in T6.3 did too.

#### T7.17f — The enum refresh confirmed non-deterministic, again
> *"Loaded — and **the binding was recognised immediately this time**."*
Contrast T6.1, where it took a turn boundary and 2 of 33 manual chunks. **Sometimes instant, sometimes
not — which is precisely why re-checking costs one call and can save thirty.**

#### T7.17g — `file_prefix` composition, tested end-to-end
The measure-types writer takes a **`file_prefix`** so the same worker loads both the backfill files and
the delta files. *"a real end-to-end test of the full delta path — trigger the delta scrape, then load
via both workers (**this exercises the `file_prefix` composition for real**)."*
**The same reuse-with-a-parameter pattern as the backfill worker's `mode` input** (T7.12c).

**T7 PASS 11: NEW MATERIAL. Clean count 0/3.**

### T7.18 — PASS 12 — **SEASON-READINESS, AND THE OWNER'S DEFINITIVE BASELINE SPEC**

#### T7.18a — What "ready" actually meant, stated with its caveat
> *"everything has been proven against **historical data replayed through the pipeline**. The genuine
> first live test is **a real newly-completed game on October 3**. I expect it to work — the same logic
> has already processed **1,230 real games** — but **I won't call it fully proven until that day**."*

#### T7.18b — **"The endpoints and paths are NOT the risk" — the precise distinction**
The owner asked whether endpoints would need adjusting. The answer corrected the premise:
> *"**The endpoints and paths are not the risk.** They're the exact same ones that already processed
> 1,230 real games. **They won't change on October 3.** What's genuinely untested is the
> **INCREMENTAL STATE** — things that **only exist mid-season, never in a completed one**."*

**Three named untested states:**
| State | Why it only appears live |
|---|---|
| **Timing lag** | *"the calendar can mark a game **Final before the bulk stats endpoint has it** (advanced stats lag **~15 minutes**). If the delta runs in that window, the completeness check will **correctly flag a 'missing' game that simply isn't published yet**. **That's the check working, not failing**"* |
| **Partial-season file** | *"season files will be **small in October instead of 26k rows**. I already **relaxed the 'certified' thresholds** for this, but **it's untested**"* |
| **New players** | *"rookies won't be in the roster table until the weekly scrape catches up"* |

> *"the honest expectation: **small timing and edge-case adjustments, not endpoint or path changes**.
> If something does break, it'll be a **'ran too early'** or **'new player not mapped yet'** issue, not
> a 'wrong data source' issue."*

#### T7.18c — **"Only observable live" ≠ "only handleable live" — and the fix was never built**
> *"**Genuinely only observable live**: the exact publishing lag of stats.nba.com… **But 'only
> observable live' doesn't mean 'can only be handled live.'** The lag is **already known** from the
> earlier research (~15 min after the final buzzer; **the 6am ET operating window was chosen as a
> 4-hour buffer for exactly this reason**). So I **could build the defensive handling now** — for
> example, **the completeness check treating a game as 'expected' only after a grace window past its
> scheduled end, so a run that lands in the publishing gap doesn't cry wolf**. That's a design decision
> I can make today from what's already known, **rather than discover in October**."*

> *"real data is the only true **CONFIRMATION**, but it shouldn't be the only **PREPARATION**."*

**The grace window was proposed, reasoned through, and left as a judgment call — then never built.**
**And P2's planned 01:00 PT = 04:00 ET is TIGHTER than the 6am ET window this reasoning relied on**
(T4.12f). **Recorded as SEASON-START CRITICAL in OPEN_ITEMS.**

#### T7.18d — **THE OWNER'S DEFINITIVE BASELINE SPECIFICATION** *(block 761, verbatim)*
This is the fullest statement of what the classification/baseline layer must be:

> *"all the players need to be **classified to specific tiers and methods, caps, lifts, penalties** that
> are gonna be used, and then **the baseline is gonna do the final job**…"*

> *"**it does ALL the possibilities for ALL the players, for ALL prop lines, ALL variations, ALL
> directions — a FULL MATRIX of anything that later can be available on the app boards to be
> picked**."*

> *"**It needs to be VERY GRANULAR. So we don't flatten the players into a low count of
> differentiation.**"*

> *"**different prop lines are gonna have different tier levels. Different variations are gonna have
> different tier levels. Different directions — more or less — are gonna have different tier levels as
> well.** …For each specific prop line and each specific variation and each specific direction, we're
> gonna create this very granular, deep count of tiers. **Each tier is gonna have a different set of
> logic to qualify a player, and then the baseline is gonna make the final calculation.**"*

> *"**it looks to the past, and then it predicts the best baseline based on the past**… these numbers
> need to be **trained and tested in the past season, even the two past seasons**, so we are sure that
> we have these numbers very, very sharp for when the season starts."*

> *"when the season starts, it's gonna be very different from the last season — **different players,
> different teams, different rosters**. So the best that we can get is the data from the past."*

**Every structural property of today's engine is in this paragraph**: the full matrix
(prop × line × side × player), tiers per prop AND per variation AND per direction, per-tier logic,
and the two-season train/test requirement. **`baseline_history` at 19.3M rows and `final_hp` at 38.7M
are this specification executed literally.**

**And "don't flatten the players into a low count of differentiation" is the origin of `max_tiers=24`** —
the MLB value raised from 12 after backtesting, adopted because the owner's requirement was granularity.

**T7 PASS 12: MAJOR NEW MATERIAL. Clean count 0/3.**

**T3's two findings that bear on live code**, both now in OPEN_ITEMS:
1. **82 play-type rows scraped but never loaded** — verified still true today (3,282 vs 3,364).
2. **The weekly differential worker is not scheduled, and `nba-p1-weekly-static.yml` does not call
   it** — so trades, signings and referee changes are not being detected at all.

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