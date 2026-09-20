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
places: `bindingMap`, a dispatch branch, and the tool-schema enum.

**Tools it exposes:** `run_sql_postgres` · `run_sql` (D1, legacy) · `github_get_file` ·
`github_put_file` · `github_patch_file` · `github_str_replace` · `github_list_dir` ·
`github_grep_file` · `github_list_workflow_runs` · `github_get_workflow_run_log` ·
`github_trigger_workflow` · `run_job` · `check_bindings` · `call_gemini` · `scan_webpack_chunks`

**Known constraints:**
- **A newly added tool is NOT usable in the session that adds it** — the conversation's tool list is
  fixed at session start, and a reconnect does not help.
- **`GITHUB_TOKEN` is a Worker secret, correctly not exposed** to the assistant, so the GitHub REST API
  cannot be called directly from bash.
- **`workflow_dispatch` cannot be fired by a commit/push** — but `on: push: paths:` can.
  **→ hence the file-trigger mechanism.**
- The bridge's own SQL tool has a short request timeout: long `CREATE INDEX` and `VACUUM` statements
  must run inside a GitHub Actions job instead.

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

**Inherited caveat, from MLB's own code comments:** *"Cloudflare/GitHub deploys may not apply wrangler
var-only edits reliably"* — which is why endpoint/header defaults are hard-coded as fallbacks.

---

## 5. DATA SOURCES

### `stats.nba.com` — the primary source
Endpoints in use: `leaguestandingsv3` · `commonallplayers` · `teamdetails` (→ `TeamBackground`) ·
`leaguedashplayerbiostats` · `leaguedashptstats` · `leaguedashlineups` · `synergyplaytypes` ·
`scheduleleaguev2` · `boxscoretraditionalv3` · `boxscoresummaryv3` · `leaguedashteamstats`

**Access requirements, learned the hard way:**
1. Must run from **GitHub Actions**, not Cloudflare.
2. Must use **`curl_cffi` with browser impersonation** — plain `requests` is TLS-fingerprinted and
   **tarpitted** (silent hangs, not rejections). A proxy alone does NOT help; that was proven.
3. Canonical headers: `Host`, `Referer: https://stats.nba.com/`, `x-nba-stats-origin: stats`,
   `x-nba-stats-token: true`, full Chrome UA, `Accept-Encoding: gzip, deflate, br`.
4. **Documented columns may simply not exist any more** — dump the real response before patching a
   parser.

### Wikipedia
`List of NBA referees` — the officials roster (the stats API has none) and coach-change pages.
**Uses plain `requests`, NOT `curl_cffi`** — its API is built for programmatic access.

### The Odds API
Historical and live sportsbook lines → `nba_market.board_snapshots`. 12 books. $30 plan verified
against 2024-25 data. **Carries PrizePicks as a bookmaker but NOT the DFS-only markets**
(fantasy_score, period props).

### ParlayAPI
Expected to hold past-season data and live boards. **Superseded for boards** — our own scrapers beat it
(ParlayAPI drops ~25% of rungs; proven with same-moment diffs).

### DFS apps — own scrapers
| App | Ladder structure | Transport |
|---|---|---|
| **PrizePicks** | rungs in the raw feed (standard/goblin/demon) | `curl_cffi`, multiple candidate URLs (api + partner-api) |
| **Underdog** | `alternate_projections` per line, **with both sides' multipliers** | own scraper from owner-captured cURLs |
| **Sleeper** | **no alternate lines** — one line per player+stat, per-side multipliers | own scraper |
| **Fliff** | alternate lines are separate proposals per market group | reverse-engineered from web bundles |
| **Betr** | tiers REGULAR/MINI_BOOSTED/BOOSTED/SUPER_BOOSTED/BOOSTED_4/EDGE_1..4 | GraphQL, owner's Keycloak token in `nba_config.external_credentials` |

**PrizePicks NBA producer**: `nba/scrape_prizepicks_nba_board.py` (`league_id=7`), **separate from
MLB's `main.py`** (`league_id=2`, hardcoded). Live-tested 2026-09-20: 192 projections,
104 demons / 52 goblins / 36 standard. **The `partner-api` host answered while `api` was blocked** —
which is why multiple candidate URLs are mandatory.

### DARKO
DPM ratings, extracted from SvelteKit hydration. 530/530.

### Gemini — `call_gemini` on the bridge
Used for independent research synthesis, cross-checked against web research rather than trusted alone.

### The proxy — `PROXY_URL` secret
Residential proxy, egress verified US/California. Required for DataDome-protected hosts.
**Does NOT defeat TLS fingerprinting** — `curl_cffi` is the answer to that, not the proxy.

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