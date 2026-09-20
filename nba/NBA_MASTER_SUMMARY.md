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
| 1 | `2026-09-03-03-22-04-nba-expansion-phase1-static.txt` | **PASS 10 — clean count 0/3** |
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

**`nba_ref.team_aliases` — 157 rows in T1, 162 in T2.** The T1 count came from the **certified static
fallback**; the T2 count from **live nba.com data**. The five-row difference is the progression from
fallback to live source, not a discrepancy.

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

### T1.32 — CURRENT STATE OF T1

**19 passes. 15 found new material. Clean count: 1/3** (pass 19).

**Dimensions swept (19):** narrative text · tool results · SQL bodies · DDL and settings · handoff
text · owner specification · caveats and limits · artefacts · endpoint/table/file names · owner
messages · measured numbers · rules and principles · endpoint inventory · external services ·
verification claims · decisions and alternatives · error vocabulary · time and scheduling ·
IDs/hashes/SHAs.

**Dimensions NOT yet swept:** person/team/proper nouns · tool-call sequences and ordering ·
quoted third-party content (search results, external docs) · structure and formatting of written
artefacts.

**Two more consecutive clean passes required.** The ledger is the resume point — continue at pass 20
without repeating any dimension already marked.

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