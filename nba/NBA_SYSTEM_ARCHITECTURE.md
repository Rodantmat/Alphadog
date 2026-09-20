# NBA SYSTEM ARCHITECTURE — infrastructure, tools, sources

**Purpose.** What the system actually runs on: every external service, every source, every piece of
infrastructure, and how each is used. Built from the transcripts, not from memory.

**Update log**
| Date | What changed |
|---|---|
| 2026-09-20 | Created. Infrastructure, sources and constraints from T1 passes 1–5 and the live session. |

---

## 1. THE FOUNDING CONSTRAINT

> *"This is an EXPANSION joining an already-built, already-Postgres-native system, not a migration and
> not a from-scratch build. NBA shares the same GitHub repo, deploy pipeline, and MCP admin-bridge
> worker that MLB runs on. **No changes to the existing MLB system are authorized at any point —
> everything is additive.**"* — the original handoff, T1

Every architectural choice below follows from that.

---

## 2. COMPUTE

### Cloudflare Workers
- Where MLB's 116 workers run, and where NBA's writer workers run.
- Named `alphadog-v2-nba-<domain>-<thing>`, deployed to `<name>.rodolfoaamattos.workers.dev`.
- **CRITICAL LIMITATION: Cloudflare Workers CANNOT reach the nba.com family.** Every endpoint —
  `stats.nba.com`, `cdn.nba.com`, `core-api.nba.com`, `data.nba.net` — returns **403/520/526** from a
  Worker origin regardless of headers. Proven with a read-only multi-endpoint probe in T1.
  **This single fact determines the whole scraping architecture.**

### GitHub Actions runners
- **The scraping network.** A different, non-Cloudflare origin, which is why it works.
- Same pattern MLB already used for its PrizePicks board scraper.
- Scrapers write JSON into `nba/data/` or `boards/`, commit it to `main`, and Workers read the
  **committed file** via the GitHub Contents API.
- Also runs every heavy Python job: baseline builds, backtests, loaders, calibration, scoring.
- **Runner limits that bite:** jobs are killed by a shutdown signal when a script pulls millions of
  rows into memory (happened 3×). Push the join into Postgres instead.

### DigitalOcean Postgres (via Cloudflare Hyperdrive)
- The database for both universes. **MLB is fully Postgres-native — all 12 D1 bindings report FALSE.**
- **2 GB RAM.** This is a real architectural constraint: it is why `final_hp` stays denormalised, and
  why a cold-cache join across many dates is expensive.
- Disk ~30 GiB with autoscale; hit its cap once mid-run and DigitalOcean flipped the primary
  **read-only**, failing an insert. Derived tables are built **scoped and in monthly blocks**.
- `VACUUM FULL` cannot run on the largest table — it needs free space equal to the table size.

---

## 3. THE MCP ADMIN BRIDGE — `alphadog-v2-admin-sql.js`

The single worker that gives the assistant its tools. Every NBA worker must be wired into it in three
places — `bindingMap`, a dispatch branch, and the tool-schema enum — **plus a fourth edit in
`generate_wrangler_configs.py`**, because the deploy regenerates wrangler files and would erase
anything added by hand.

**Implementation details worth knowing:**
- **`POST /mcp` is handled by a Durable Object** — binding **`MCP_OBJECT`**, class **`AlphadogMcp`**,
  via the **McpAgent** — *"not hand-rolled JSON-RPC."*
- **The OAuth endpoints are a minimal single-user auto-approve flow, NOT a real login system.**
- A diagnostics route reports **binding and secret PRESENCE** (never values) —
  `bindingPresence(env, REQUIRED_DB_BINDINGS)`, `varPresence(env, EXPECTED_VARS)`,
  `secrets_present_only`.
- Service bindings are declared in the generator, e.g.
  `{"service": "alphadog-v2-daily-delta-runner"}`.

**Tools it exposes:** `run_sql_postgres` · `run_sql` (D1, legacy — **D1 decommissioned 2026-08-12**) ·
`github_get_file` · `github_put_file` · `github_patch_file` · `github_str_replace` ·
`github_list_dir` · `github_grep_file` · `github_list_workflow_runs` · `github_get_workflow_run_log` ·
`github_trigger_workflow` · `run_job` · `check_bindings` · `call_gemini` · `scan_webpack_chunks`

**Known constraints:**
- **A newly added tool is NOT usable in the session that adds it** — the tool list is cached **at the
  CONNECTION level, not per chat**, so a reconnect does not help. **It refreshes between turns**, and
  the refresh is **non-deterministic** — sometimes immediate, sometimes not. **Re-check a blocked
  binding before committing to an expensive workaround** (T6: 2 of 33 manual SQL chunks, then the
  Worker did the rest in 25 seconds).
- **`GITHUB_TOKEN` is a Worker secret, correctly not exposed**, so the GitHub REST API cannot be called
  from bash. The shared set is `GITHUB_TOKEN` / `GITHUB_OWNER` / `GITHUB_REPO` / `GITHUB_BRANCH`.
- **`workflow_dispatch` cannot be fired by a commit/push** — but `on: push: paths:` can. **→ hence the
  file-trigger mechanism.**
- **`run_job`'s `target` is a FIXED, pre-wired enum** with **hard client-side validation** — which is
  why no server-side routing can work around a missing binding.
- The bridge's SQL tool has a short request timeout: long `CREATE INDEX` and `VACUUM` statements must
  run inside a GitHub Actions job.
- **The assistant cannot reach `workers.dev` URLs at all** — `x-deny-reason: host_not_allowed` from its
  own egress proxy. **Everything goes through `run_job`.**

---

## 4. THE DEPLOY PIPELINE (shared with MLB, extended additively)

| File | Role | NBA change |
|---|---|---|
| `generate_wrangler_configs.py` | writes wrangler configs | isolated NBA branch (Hyperdrive, `nodejs_compat`, NBA vars); writes into `nba/` |
| `github_mobile_deploy_workers.py` | deploys changed workers | **patched so `admin-sql` always deploys LAST** |
| `nba/worker_manifest_nba.json` | the NBA worker list | created T1 |
| `.github/workflows/alphadog-v2-github-auto-deploy.yml` | the deploy run | unchanged |

**Deploy order matters:** the fleet deploys **alphabetically from the file diff**, so `admin-sql`
(which holds new workers' bindings) sorted before them and failed. The last-deploy fix is permanent.

### ⚠ ANYTHING NOT IN THE GENERATOR IS ERASED
> *"**The GitHub workflow REGENERATES wrangler files before deploy, so this binding MUST LIVE IN THE
> GENERATOR or it will be ERASED before Wrangler deploys.**"*

**Hand-editing a `wrangler.json` is futile** — the deploy rewrites it first. **Service bindings,
`compatibility_flags`, cron triggers and vars all have to be added to
`generate_wrangler_configs.py`.** This is why registering a new worker is **four** edits (bridge
binding map + direct-call list + tool enum, **plus the generator**), not three.

**Inherited caveat, from MLB's own code comments:** *"Cloudflare/GitHub deploys may not apply wrangler
var-only edits reliably"* — which is why endpoint and header defaults are hard-coded as fallbacks.

### The never-fire cron idiom
```python
cfg["triggers"] = {"crons": ["0 0 30 2 *"]}   # February 30th — a date that cannot occur
```
**Applied to 8 similarly-affected workers.** A structurally impossible cron is used to **disable a
worker's schedule without removing the worker** — it stays deployed, callable on demand, and never
self-triggers. **Recognise this pattern before concluding a worker is "scheduled."**

### MLB's `alphadog-v2-weekly-differential-runner` — the precedent NBA lacks
> *"**Native cron triggers for the Postgres weekly static differential (Monday 3am**, matching the
> existing `sched_static_weekly` convention)"*

**MLB runs its weekly differential on a native cron.** **NBA's equivalent worker has never been
scheduled** (verified empty 2026-09-20) — see `NBA_OPEN_ITEMS.md` ①. **The pattern to copy already
exists on the MLB side.**

### Chunk-kill signature
> *"the signature of **a chunk being killed by the platform MID-LOOP before it can checkpoint**, not of
> application logic"*

**A run that dies at the same step repeatedly, without an application error, is a platform kill** —
the fix is smaller chunks and checkpointing, not debugging the logic. *(Same family as the three
GitHub-runner OOM kills on million-row pulls.)*

---

## 5. DATA SOURCES

### `stats.nba.com` — the primary source
Endpoints in use: `leaguestandingsv3` · `commonallplayers` · **`playerindex`** (the only one with a real
`POSITION` field) · `teamdetails` (→ `TeamBackground`) · `leaguedashplayerbiostats` ·
`leaguedashptstats` · **`teamplayeronoffdetails`** (30 calls, 3 result sets, join on `VS_PLAYER_ID`) ·
`leaguedashlineups` · `synergyplaytypes` · `scheduleleaguev2` · **`playergamelogs`/`teamgamelogs`**
(and **`MeasureType=Advanced`** — 2 calls, not 1,230) · `playerdashboardbygeneralsplits` (6 groups in
one call) · `playercareerstats` · **`boxscoretraditionalv3`** · **`boxscoresummaryv3`** ·
`leaguedashplayerptshot` · `leaguedashplayershotlocations` · `leaguedashteamstats`

**Access requirements, learned the hard way:**
1. Must run from **GitHub Actions**, not Cloudflare. **Root cause: stats.nba.com is itself
   Cloudflare-fronted, and Cloudflare→Cloudflare traffic is flagged at the WAF/edge** — error 520 means
   *"the request never reaches the app layer."*
2. **`curl_cffi` with browser impersonation is mandatory** — plain `requests` is TLS-fingerprinted and
   **tarpitted** (silent hangs). A proxy alone does NOT help. *(And `curl_cffi` was not discovered —
   it was read out of MLB's existing scraper.)*
3. **SEND THE FULL PARAMETER SET, many as empty strings.** A partial query string returns a **real
   HTTP 500**, not a helpful error.
4. **Documented columns may simply not exist any more** — dump the real response before patching a
   parser (`ARENA`/`ARENACAPACITY` are gone from the standings endpoint).
5. **⚠ v2 endpoints are unreliable for historical games.** `boxscoretraditionalv2` returns **HTTP 200
   with ZERO player rows**; `boxscoresummaryv2` is **documented unreliable after 2025-04-10**.
   **Use v3.**
6. **⚠ `leaguedashplayershotlocations` returns `resultSets` as a DICT, not a list** — it breaks the
   convention every other endpoint follows.
7. **Use real URL encoding** on parameter values — `'6+ Feet'` needs `%2B`, not a space replacement.
8. **`Period=1..4` works on the BULK endpoint** — 4 calls per season, not ~5,000 per-game calls.
   **OT is isolated as `full-game − (Q1+Q2+Q3+Q4)`; halves as Q1+Q2 / Q3+Q4.**
9. **`GAME_ID` prefix `002` = regular season** — the precise convention; free-text labels are fragile
   (NBA Cup group stage, Rivals Week and international games carry special branding).
10. **`playercareerstats` gives traded players per-team rows PLUS a combined `TEAM_ID = 0` row** — a
    naive `SUM()` double-counts.

### Wikipedia
`List of NBA referees` (the stats API has none) and coach-change pages.
**Uses plain `requests`, NOT `curl_cffi`** — its API is built for programmatic access.

### DARKO — `darko.app`
DPM ratings by Kostya Medvedovsky. **Free**, and rated by NBA front-office analysts (HoopsHype survey)
above the **paid** EPM and LEBRON on RMSE — *"forward-looking rather than backward-looking, which is
exactly what matters for prop prediction."*
**Extraction: the page is SvelteKit; the full dataset is embedded in the `kit.start()` hydration
script.** **⚠ JS bare decimals (`.534094`) are invalid JSON and must be repaired before parsing.**
**Keys on `nba_player_id` directly** — no name matching. Stored as **`player_impact_rating`, not
`darko`**, against the single-maintainer risk.

### **The NBA injury-report CDN** — `ak-static.cms.nba.com/referee/injury/`
Official pregame injury reports as **public PDFs**, *"several times daily, with real historical
archives back to **2021-22** — free, official, no third-party paywall."*
**⚠ The backfill captured is HOURLY (48 snapshots/game-date), while the league publishes every 15
minutes.** Any cutoff analysis finer than ±1 hour needs the 15-minute archive. The season crosses DST.

### The Odds API
Historical and live sportsbook lines → `nba_market.board_snapshots`. 12 books, $30 plan.
**Carries PrizePicks as a bookmaker but NOT the DFS-only markets** (fantasy_score, period props).
**This superseded the T9 verdict that no retroactive prop archive existed** — BigDataBall was never
needed.

### ParlayAPI
`https://parlay-api.com/v1`. **NBA game lines back to 2007; NO historical props; no DFS books.**
Useful only to **validate** the derived spread. **Superseded for boards** — our own scrapers beat it
(ParlayAPI drops ~25% of rungs, proven with same-moment diffs).

### EPM (Dunks & Threes) — **REJECTED on licensing, not capability**
Rated *"one of the highest-value single features"*, then found **behind a paid subscription**.
*"Scraping paywalled content isn't something I'll do without your explicit sign-off — it's a real
legitimacy/ToS question."* **Nothing was built against it.**

### DFS apps — own scrapers
| App | Ladder structure | Multipliers |
|---|---|---|
| **PrizePicks** | rungs in the raw feed (standard/goblin/demon) | ❌ **not on any public surface** |
| **Underdog** | `alternate_projections` per line | ✅ both sides |
| **Sleeper** | *"no alternate lines"* ⚠ (T7 found milestone 20+/25+/30+) | ✅ per-side |
| **Fliff** | separate proposals per market group | ✅ |
| **Betr** | REGULAR → EDGE_4 tiers, GraphQL, Keycloak token | ✅ |

**PrizePicks NBA producer**: `nba/scrape_prizepicks_nba_board.py`, **`league_id=7`**, separate from
MLB's `main.py` (`league_id=2`). **The `partner-api` host answered while `api` was blocked** — which is
why multiple candidate URLs are mandatory. **Candidate selection by future-pickable rows, not size.**

### Research sources used
**Gemini** (`call_gemini` on the bridge) — *"not absolute truth, a tool to bring more information to
the table in a different point of view."* **Corrected on checkable facts at least five times**: the
1,230-call estimate, "starters are inferable from game logs", "Team Pace is missing", "potential
assists aren't in our data", and "tier globally".
**OpticOdds** (industry pricing vendor) · **Unabated** · **DataStreak** (40,856 graded props) ·
**RotoGrinders** · **Cleaning the Glass / Ben Falk** (garbage-time filtering) ·
***J. Sports Sciences* 2025** (altitude, p=0.005) · **PMC 10-season study** (eastward jet lag) ·
**`swar/nba_api`** — the source of the canonical headers and the static TEAM_ID list; **Issue #155**
tracks header changes and is the first place to look if scraping breaks.

### The proxy — `PROXY_URL`
Residential, egress verified **US/California**. **Inherited from MLB's own scraper**, not created here.
Required for DataDome-protected hosts. **Does NOT defeat TLS fingerprinting.**

---

## 6. ANTI-BOT REALITY

| Wall | Where | Defeated by |
|---|---|---|
| Cloudflare edge block | nba.com family from Workers | run on GitHub Actions |
| TLS fingerprinting / tarpit | stats.nba.com from plain `requests` | `curl_cffi` impersonation |
| **DataDome** | `app.prizepicks.com`, PP payout/config endpoints | **NOT defeated** — proxy + chrome124 still 403 |

**DataDome consequence:** the PrizePicks entry/pricing surface and the app's own JS bundles are
unreachable, which is why per-leg multipliers must come from a logged-in browser capture.

---

## 7. THE TRIGGER MECHANISM

`workflow_dispatch` cannot be fired by a push; `on: push: paths:` can. So workflows watch a trigger
file and the assistant writes to it:
- `nba/TRIGGER_NBA_SCRAPE.txt` — the static scraper
- `nba/TRIGGER_NBA_PROBE.txt` — the probe runner, format `script: <name>.py`

Once `github_trigger_workflow` became available in later sessions, dispatch is used directly — but the
file mechanism remains as the fallback that needs no tool.

---

## 8. REPO LAYOUT

| Path | Holds |
|---|---|
| `/` (root) | **MLB** workers, `main.py` (MLB PrizePicks producer), shared deploy scripts |
| `/nba/` | **every** NBA worker, scraper, wrangler config, schema file and document |
| `/nba/data/` | committed JSON: game logs, schedules, injury shards, market spreads |
| `/boards/` | live board pulls, all apps |
| `/.github/workflows/` | every workflow, MLB and NBA |

**Two independent guarantees against mixing**: the `nba-` filename token AND the `/nba/` folder.

---

## 9. DOCUMENTATION SYSTEM

### The twelve mandated documents *(2026-09-20)*
| Document | Role |
|---|---|
| `NBA_MASTER_SUMMARY.md` | everything done, per transcript, message by message |
| `NBA_GLOSSARY.md` | every term → transcript and context |
| `NBA_RECIPE.md` | how the system was built, step by step |
| `NBA_SYSTEM_ARCHITECTURE.md` | this file |
| `NBA_DATABASE.md` | every schema, table, column |
| `NBA_WORKERS.md` | every worker, scraper, script, workflow |
| `NBA_SYSTEM_DESIGN.md` | the three pipelines |
| `NBA_OPEN_ITEMS.md` | deferred, dropped, partial, caveats, bugs |
| **`NBA_BASELINE_CALIBRATION.md`** | the baseline hit-probability calibration |
| **`NBA_FINAL_SCORING_CALIBRATION.md`** | final HP, confidence, score, edge |
| **`NBA_MULTIPLIERS.md`** | multipliers across every app |
| **`NBA_GOBLIN_DEMON.md`** | goblin/demon ingestion, anchors, ladders |

### Pre-existing repo documents
| Document | Role |
|---|---|
| `nba/NBA_CLASSIFICATION_BASELINE_DESIGN.md` *(T8)* | the five tiering dimensions, per-prop lock table, combination math, backtest plan. *"Every number in it is a seed; the backtest owns the sharpening"* |
| `nba/NBA_BASELINE_METHODOLOGY.md` *(T4)* | the five-step baseline design |
| `nba/NBA_HISTORICAL_BACKFILL_PLAN.md` *(T4)* | endpoint inventory, season-count reasoning, splits priority |
| `nba/NBA_DEEP_DOCUMENTATION_CHECKPOINT_2026-09-04.md` *(T7)* | **30,601 B, 359 lines**, 10 sections; **§8 "what's explicitly NOT built yet, and why" is the continuity section**; every number re-pulled from live Postgres at write time |
| `nba/NBA_ENRICHMENT_FACTORS_RESEARCH.md` *(T2)* | the first factor research |
| `nba/NBA_SYSTEM_DRAFT.md` | naming convention, repo location, **the original cadence (§4b)** |
| `nba/NBA_AVAILABLE_TOOLS.md` | tool inventory |

| Document | Role |
|---|---|
| `nba/NBA_COMPASS.md` | the fact base — numbered, durable findings |
| `nba/NBA_PROJECT_LOG.md` | the narrative log, newest first. **Self-binding rule: every session must add an entry; "don't let this go stale silently"** |
| `nba/NBA_DAILY_PARITY_AND_BACKFILL.md` | the governing directive on day-by-day parity |
| `nba/NBA_ENRICHMENT_FACTOR_LOCK.md` | the factor registry |
| `nba/NBA_ARCHITECTURE_BLUEPRINT.md` (95,803 B) | the MLB→NBA transfer package |
| `nba/NBA_LESSONS_LEARNED_FROM_MLB.md` (57,066 B) | *"the single most important document… a research standard built the hard way"* |
| `nba/NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` (18,034 B) | concept mapping |
| `nba_config.classification_config` | **machine-readable decisions** — verdicts live in the DB, not in logs |
</content>
</parameter>
<parameter name="message">docs: NBA system architecture - infrastructure, tools, sources, constraints