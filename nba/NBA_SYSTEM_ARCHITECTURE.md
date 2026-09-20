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

## 1b. THE NAMING AND ISOLATION CONVENTION
*Source: T1, `NBA_SYSTEM_DRAFT.md` §1. Recorded 2026-09-20.*

Stated as *"locks the collision-avoidance decision the blueprint flagged as required **before the
first NBA table/worker**."*

| Axis | Convention |
|---|---|
| **Worker files & job_keys** | `alphadog-v2-nba-<domain>-<thing>.js` / `nba-<domain>-<thing>` — *"mirrors MLB's existing pattern exactly, with an **unambiguous `nba-` token inserted**."* Example: MLB `alphadog-v2-static-teams.js` / `static-teams` → NBA `alphadog-v2-nba-static-teams.js` / `nba-static-teams` |
| **Repo location** | **everything inside `/nba/`** — worker files, wrangler configs, schema files — *"**not the repo root, where every MLB worker currently lives**"* |
| **Why both** | *"This gives **a SECOND, INDEPENDENT way (FOLDER, not just filename prefix)** to guarantee **zero accidental mixing** with MLB files, **per the person's explicit instruction**."* |

**Two independent isolation mechanisms by design** — prefix *and* folder.

### The planned Postgres schema list, in full
> *"new, separate schemas, **`nba_`-prefixed, parallel to MLB's existing ones**… **Every one of these
> is a BRAND-NEW schema — none reuse or extend an MLB sche[ma]**."*

`nba_ref` · `nba_calendar` · `nba_stats` *(**"NBA has no hitter/pitcher split"**)* · `nba_team` ·
`nba_daily` · `nba_context` · `nba_market` · `nba_archive` · `nba_score` · `nba_scoring` ·
`nba_backtest` · `nba_classification` · `nba_certifier` · `nba_context_cert`

**⚠ Fourteen were planned. The ones carrying data today**: `nba_ref`, `nba_calendar`, `nba_stats`,
`nba_team`, `nba_config`, `nba_market`, `nba_score`.
**`nba_config` was NOT in the original list** — added in T8 for the tiering layer.
**`nba_daily`, `nba_context`, `nba_archive`, `nba_scoring`, `nba_backtest`, `nba_classification`,
`nba_certifier`, `nba_context_cert` do not appear in any later transcript** — their intended contents
landed in `nba_score` and `nba_config` instead.

**The "no hitter/pitcher split" note is the structural simplification** also recorded in the prop
taxonomy: NBA has no opposing-role prop family, so one `nba_stats` replaces MLB's two.

---

## 2. COMPUTE

### Reused as-is (shared, sport-agnostic infrastructure) *(T1)*
*Confirmed and refined against what Phase 1 actually found live.*

- **Cloudflare Workers + `wrangler` deploy mechanics**, the GitHub Actions auto-deploy pipeline, and
  **`generate_wrangler_configs.py`** — *"NBA workers get added to its template — **watch for the
  HARDCODED BINDING WHITELIST-TUPLE GOTCHA the blueprint flags**."*
- **The Hyperdrive/Postgres connection pattern**, exactly as specified:
  ```js
  postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false })
  ```
  > *"**All THREE connection options matter** — **`prepare: false` in particular AVOIDS A SPECIFIC,
  > PREVIOUSLY-ENCOUNTERED FAILURE MODE**. **`max: 3–5` is the PROVEN small-pool size for Workers'
  > short-lived invocation model.**"*
  **`fetch_types: false` is the third**, and is easy to omit when copying the pattern by memory.
- **Legacy/reference layer**: *"**D1 databases exist as READ-ONLY REFERENCE ONLY — NEVER write new
  data to D1. If porting a table, MIGRATE IT TO POSTGRES FIRST.**"* *(D1 was subsequently
  decommissioned system-wide on 2026-08-12; NBA is Postgres-only from day one.)*
- **Deploy pipeline**: GitHub repo → `alphadog-v2-github-auto-deploy.yml` → auto-deploys on push.
  **`generate_wrangler_configs.py` regenerates EVERY `wrangler.*.jsonc` from a Python template BEFORE
  EVERY DEPLOY** — *"**NEVER hand-edit a wrangler config file expecting it to survive, IT WILL BE
  SILENTLY OVERWRITTEN.**"* **The overwrite is silent** — no warning, no diff, no failure.
- **MCP bridge**: *"Build this FIRST — **it's the tool surface every subsequent session (including
  yours) will actually use**."* Exposes `run_sql`/`run_sql_postgres`, the GitHub file tools, and a
  **Gemini proxy endpoint**.
- **The MCP admin-bridge worker** (`alphadog-v2-admin-sql.js`) and its `run_sql_postgres` / GitHub
  tool surface.
- **`config.worker_definitions` / `config.worker_schedules` / `control.job_queue` /
  `control.job_runs`** — ***"bookkeeping ONLY"***, per the no-orchestrator exception.
- **The ParlayAPI account/key** — `config.external_credentials`, `credential_key='parlay_api_key'` —
  *"same paid account, `basketball_nba` sport key."*

**⚠ THE HARDCODED BINDING WHITELIST-TUPLE GOTCHA** is named in T1 as a known trap in
`generate_wrangler_configs.py`. **It is the same family as the later-confirmed rule that anything not
in the generator is erased on deploy** (§4): the generator is authoritative, *and* it carries a
hardcoded allowlist that a new binding must be added to.

**`prepare: false` matters for Hyperdrive specifically** — prepared statements do not survive
connection pooling; **`max: 3–5`** keeps the Worker within Hyperdrive's connection budget.

**The `control.*` tables being "bookkeeping only" is the no-orchestrator rule in practice**: NBA
workers are registered there and dispatched **directly**, never pulled from the queue.

### Also reused *(T1, continued)*
- **The "certification center" UI** — *"once NBA data exists in a shape it can read. **Per the
  person's explicit instruction, NO SEPARATE NBA UI is planned.**"*
- **The entire statistical research standard** (Lessons Parts A–F)
- **The differential-write pattern** and **the chunking pattern**
- **The tri-state (real / derived / temporary) data-quality tagging**
- **The two-layer interpretable-rule + calibration-loop scoring architecture**
- **The "preset dictionary" precompute-once principle**
- **The config-table-driven tunable-variable discipline** — *"**now DOUBLY REQUIRED, since the person
  independently RE-STATED it as a hard rule this session**"*

**Four of these are named patterns not otherwise recorded:**
| Pattern | What it means |
|---|---|
| **Tri-state data-quality tagging** | every value marked **real / derived / temporary** — a derived value is never mistaken for an observed one |
| **Two-layer: interpretable rule + calibration loop** | the architecture the NBA engine implements — an explainable model, then a calibration layer on top. *(It is why `p_raw` is retained alongside the calibrated `final_hp`.)* |
| **"Preset dictionary" precompute-once** | compute a lookup once, read it many times — the shape of `blowout_model`, `stat_decay_config`, `MIN_RATIO` |
| **Config-table-driven tunables** | *"every tunable variable lives in the database (`nba_config.system_settings`), **never hardcoded**"* — restated by the owner as a hard rule |

**⚠ ParlayAPI coverage caveat, stated in T1 and never closed there**: *"**Coverage for this sport key
is still NOT INDEPENDENTLY VERIFIED** — see Section 5, open question 1."* **It was later superseded by
own scrapers rather than verified.**

### Must be built fresh, NBA-specific *(T1)*
- **Every schema and table** listed in the naming convention
- **The full prop taxonomy**
- **Every enrichment factor** — arena, fatigue/rest, injury, referee, pace, matchup — *"still to be
  locked **per-factor**, per the person's own framing"*
- **The board-mining workers for PrizePicks / Sleeper / Underdog** — *"**the live MLB versions are
  HARDCODED to `baseball_mlb` AT MULTIPLE LAYERS, CONFIRMED DIRECTLY IN PHASE 1 — NOT SAFELY REUSABLE
  VIA A PARAMETER**, need real NBA-specific worker files"*
- **The scoring engine's actual formula/model**
- **The full multiplier/pricing study** — *"a first, direct NBA observation study — **no live season
  yet to observe against**"*

**⚠ The board-scraper finding was VERIFIED, not assumed.** *"Hardcoded to `baseball_mlb` at **multiple
layers**, confirmed directly in Phase 1"* — which is why `nba/scrape_prizepicks_nba_board.py` exists
as a **separate producer** (`league_id=7`, own env namespace `PP_NBA_*`, own output
`boards/prizepicks_nba_current.json`) rather than `main.py` with a sport filter.
**The startup plan had assumed a filter swap would do** (*"reuse the MLB scraper's architecture
directly, **swap the sport filter**"*); **Phase 1 checked and found otherwise.**

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

## 4c. BASE-LAYER DATA-MINING LESSONS
*Source: T1, blueprint §4k — "real, hands-on lessons from building MLB's actual base-data workers,
worth applying directly to NBA's own base layer." Recorded 2026-09-20.*

### 1. ✅ Adopt existing correct data rather than blindly re-fetching
> *"MLB found **a real, COSTLY MISTAKE where a new worker CALLED THE EXTERNAL API FRESH FOR EVERY
> SINGLE PLAYER, even though THE LARGE MAJORITY ALREADY HAD COMPLETE, CORRECT HISTORICAL DATA SITTING
> IN THE DATABASE from an earlier build.**
> The fix: **BEFORE MINING, CHECK WHETHER THE NEEDED DATA ALREADY EXISTS AND IS TRUSTWORTHY, and ONLY
> FETCH WHAT'S GENUINELY MISSING.**
> **Build EVERY NBA base-data worker to CHECK FOR AND ADOPT EXISTING CORRECT DATA FIRST — DON'T
> DEFAULT TO A FULL RE-MINE OUT OF CAUTION.**"*

**✅ NBA implements this in several places, and the savings are documented:**
| Mechanism | Saving |
|---|---|
| **The per-game delta** — *"derives the delta **purely from committed files**, fetches **only new games**"* | dry-run against real files produced the correct delta (starter 0, officials 3) **before any network call** |
| **`known_empty_games`** | *"without it the 3 games the source returns empty would be re-fetched **every single day forever**"* |
| **The backfill worker's `mode: "weekly"`** | *"loads only those two in **~6 s instead of re-touching 79k rows**"* |
| **The delta worker's pre-flight completeness check** | calendar Final count vs logged count — fetch only the gap |
| **The schedule scraper** | **1,400 + 1,266 already published** — recognised rather than re-fetched |

**And the T3 "check for embedded data first" instinct is the same principle applied to scraping**: the
DARKO extraction began by checking whether the page already carried the dataset — **it did, in the
`kit.start()` hydration script** — rather than defaulting to pagination.

**⚠ Where a full re-mine still happens**: the **weekly scrapers re-pull whole season aggregates every
Monday**. Correct by design (season aggregates change with every game), **but it is the one place the
principle does not apply — deliberate, not overlooked.**

### 2. ⚠ Never validate a new pipeline against an internal prior system
> *"**Never validate a new pipeline's correctness against an OLD OR REFERENCE DATABASE AS IF IT WERE
> GROUND TRUTH — validate against the REAL, EXTERNAL, AUTHORITATIVE SOURCE directly.**
> MLB made and caught a real mistake **computing a 'coverage percentage' by comparing NEW POSTGRES ROW
> COUNTS AGAINST OLD D1 ROW COUNTS, when the OLD DATABASE WAS ITSELF KNOWN TO HAVE REAL DUPLICATION
> AND QUALITY ISSUES.**
> **The correct method: PULL A REAL ANSWER DIRECTLY FROM THE ACTUAL EXTERNAL DATA PROVIDER (the
> league's own official API) FOR A SPECIFIC CASE and compare against that** — **not against any
> internal prior system's own counts.**"*

**✅ NBA's verification habit matches this consistently.** Every certification in the record compares
against an **externally-anchored** number, not an internal one:
| Check | External anchor |
|---|---|
| `GAME_ID` prefix `002` → **1230 = 1230** | the known regular-season game count |
| Starter status **12,300 = 10 × 1,230** | 10 starters per game × the real schedule |
| 3 missing officials games | **verified absent on NBA.com itself** |
| Measure-type counts **26,651 / 26,306 / 26,401** | matched the **base game logs**, per season |
| DARKO **530/530**, positions **582/582** | the source's own totals |
| The 170-game gap | explained by **preseason + playoffs + All-Star + Cup knockout** |

**And the one place an internal comparison was used, it was flagged**: the T3 `aliases_written`
discrepancy was resolved by recognising *"the counter reports rows UPSERTED in that run, not the table
total"* — **an internal-count confusion caught before it became a conclusion.**

### 3. ⚠⚠ VERIFY EVERY COLUMN IS IN THE `ON CONFLICT DO UPDATE` CLAUSE
> *"**When using an `ON CONFLICT DO UPDATE`-style upsert, VERIFY EVERY COLUMN THAT SHOULD EVER BE
> REFRESHED ON A REPEAT WRITE IS ACTUALLY LISTED IN THE UPDATE CLAUSE.**
> MLB found **a real, specific bug where SEVERAL COLUMNS WERE MISSING FROM AN UPSERT'S UPDATE LIST** —
> meaning **those columns were SET CORRECTLY ON FIRST INSERT but SILENTLY FROZEN AT THAT ORIGINAL
> VALUE FOREVER AFTERWARD, NEVER UPDATED AGAIN.**"*

**This is a silent-staleness bug with no error and no visible symptom** — the row exists, the value
looks plausible, and it is simply from whenever the row was first written.

**⚠ NBA is broadly exposed: every writer Worker upserts.** `nba_ref.teams`, `players`, `arenas`,
`officials`, `team_aliases`, `player_aliases`, the stats tables, `baseline_ladder`
(*"idempotent: PK (asof, player_id, game_id, prop, period, ot_rule, line)"*), `board_outcomes`.

**Two NBA findings are already consistent with this bug class:**
- **`nba_ref.arenas`: 19 of 30 have `capacity`; 0 of 30 have `altitude_ft`/`timezone`** — a partially
  populated table where some columns never refresh is exactly the shape
- **The position column was empty for three sessions** — *"the scraper never extracted it AND the
  worker never wrote it"* — the same silent-frozen outcome, from the write side

**And the T3 differential layer depends on upserts refreshing correctly**: the snapshot tables *"had
to exist BEFORE the next upsert because the writers OVERWRITE."* **If a snapshot column is missing
from an update clause, the differential compares against a frozen value and reports no change.**

**The check is mechanical**: for each writer, compare the column list in the `INSERT` against the
column list in `DO UPDATE SET`. **Not recorded as having been run.**

### 4. ⚠ A shared helper can carry its OWN hidden internal cap
> *"**A shared, reused helper function can carry ITS OWN HIDDEN INTERNAL CAP, completely independent
> of whatever limit the CALLING CODE passes in.**
> MLB found a real case where **RAISING A CALLER-SIDE THROUGHPUT SETTING HAD ZERO EFFECT**, because
> **a shared promotion function had its OWN SEPARATE, HARDCODED CEILING that SILENTLY RE-CLAMPED EVERY
> CALL regardless of the caller's own setting.**
> **When tuning any shared NBA helper's throughput or limits, CHECK THE HELPER'S OWN INTERNAL CODE FOR
> A HIDDEN CAP, not just the config value being passed into it.**"*

**The symptom is "the setting has no effect"** — which reads as the config not being applied, not as a
second limit existing further down.

**NBA's shared helpers with limit-like behaviour:**
| Helper | Potential internal cap |
|---|---|
| `nba_names.py` — shared name resolution (5,212 players) | match thresholds |
| `nba_asof.py` — cutoffs | the cutoff constants themselves |
| `nba_season.py` | — |
| **The bridge's `run_sql` / `run_sql_postgres`** | **`max_rows` is capped at 500 regardless of what is requested** — a known, documented instance of exactly this |
| The writer Workers' batched upserts | batch size |

**⚠ And NBA has a live instance of the same family in the OTHER direction**: `BT_LADDER_STEPS`
**overrides** `LADDER_DEPTH`, so a per-prop depth table can be silently flattened by an env var. **The
caller wins there; the warning is about the case where the helper wins.** **Both are "the value you
set is not the value used."**

### 5. Prefer rebuilding a clean proven pattern over porting a problematic legacy one
> *"**Prefer REBUILDING a clean, simple, ALREADY-PROVEN pattern over PORTING A COMPLEX LEGACY
> ARCHITECTURE FORWARD, once that legacy pattern has ALREADY CAUSED REAL PROBLEMS ELSEWHERE.**
> MLB made this call **repeatedly and deliberately** — when a new worker's legacy equivalent used the
> same complex, already-proven-problematic design as an earlier one, **the team REBUILT CLEAN using
> its own newer, simpler, already-proven pattern instead.**"*

**✅ NBA did exactly this, twice, and the record shows the reasoning:**
- **The PrizePicks NBA producer** — the startup plan assumed *"reuse the MLB scraper's architecture
  directly, **swap the sport filter**"*, but Phase 1 found the MLB versions *"**hardcoded to
  `baseball_mlb` at MULTIPLE LAYERS**"*, so a **separate producer** was built (`league_id=7`, own env
  namespace, own output).
- **The classification port** — two of three MLB generations were **dead and said so**; the live one
  was read line by line and **the recency blend was rejected outright** rather than ported.

**And the inverse discipline is also in the record**: `curl_cffi` and the writer-Worker shape **were**
copied wholesale, because those patterns were proven *good*. **The rule is about porting patterns that
have already caused problems — not about avoiding reuse.**

### The original MLB→NBA source mapping *(T1, `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` §3)*
| MLB source | NBA equivalent, as stated | How it turned out |
|---|---|---|
| **MLB Stats API** (game logs, box scores, schedule) | *"**NBA Stats API (stats.nba.com) or a wrapper (balldontlie.io, etc.) — pick ONE AUTHORITATIVE SOURCE and mirror MLB's 'base layer' pattern (raw ingestion → delta updates → certified/promoted state)**. **Verify rate limits and terms of service** before building a scraper-dependent pipeline around it."* | **stats.nba.com chosen.** The raw→delta→certified pattern is what P1/P2/P3 implement |
| **Baseball Savant** (exit velo, quality of contact) | *"NBA advanced stats (tracking via stats.nba.com, or a paid provider) — **LOWER PRIORITY given quality-of-contact-style metrics don't port over**. **Deprioritize relative to MLB's investment in this area.**"* | Tracking was built (8 families, 4,652 rows) but **after** the base layer |
| **ParlayAPI** | *"**Same service, same account, `basketball_nba` sport key** — **no new vendor onboarding needed** — **this is THE SINGLE BIGGEST HEAD START NBA HAS over where MLB started.**"* | **Superseded for boards** — own scrapers beat it (ParlayAPI drops ~25% of rungs). Retained only to validate the derived spread |

**Note the stated head start was ParlayAPI, and it is the one that did not hold.** The actual head
starts proved to be the **infrastructure** (Workers, deploy pipeline, `curl_cffi`, the bridge) and the
**research standard**, not the board vendor.

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

### ✅ RULE FOLLOWED · check the sport's own official API before any third-party source
*Source: T1, blueprint §4i. Recorded 2026-09-20.*

> *"MLB had **a LOCKED PLAN to integrate a separate, PAID weather API**, and **before building it, ran
> a real, DIRECT TEST against MLB's own official live-game-feed API — the same one already used
> elsewhere in the pipeline** — and found it **ALREADY RETAINED COMPLETE, PERMANENT HISTORICAL WEATHER
> *AND* UMPIRE DATA for every completed game, going back over a year, FOR FREE, with NO SEPARATE
> INTEGRATION NEEDED. This was confirmed BY AN ACTUAL TEST CALL, NOT ASSUMED FROM DOCUMENTATION.**
> **For NBA: before integrating any separate third-party historical data source** — and it names
> them — **REFEREE/OFFICIATING HISTORY, INJURY-REPORT ARCHIVES, PLAY-BY-PLAY, or anything else NBA's
> own official stats API might already provide — RUN THE EQUIVALENT DIRECT TEST AGAINST THE NBA'S OWN
> OFFICIAL API FIRST.**
> **A genuinely free, already-available, already-reliable source HIDING IN AN API YOU'RE ALREADY
> CALLING FOR SOMETHING ELSE is a REAL, RECURRING PATTERN worth actively checking for.**"*

**✅ NBA followed this, and it paid off on two of the three named categories:**
| Category named | What the official source yielded |
|---|---|
| **Referee/officiating history** | **`boxscoresummaryv3` `Officials` → `nba_stats.game_officials`, 3,681 rows** — free, from an endpoint already in use. *(The roster itself was NOT there — Wikipedia was needed — so the answer was split.)* |
| **Injury-report archives** | **`ak-static.cms.nba.com/referee/injury/` — official PDFs back to 2021-22**, *"free, official, **no third-party paywall**"* |
| **Play-by-play** | ⚠ correctly identified as **not available** in the bulk endpoints; Tier C props deferred rather than a third party bought |

**And the pattern recurred in a fourth place the blueprint did not name**: **period props**. The
assumption was they would need ~5,000 per-game calls; **a direct probe found `Period=1..4` works on
the BULK endpoint — 4 calls per season.** *"Confirmed by an actual test call, not assumed from
documentation"* is exactly how that was established.

**⚠ The one paid source that exists anyway**: **BallDontLie GOAT tier, $39.99/month** — recorded in T1
as verified and operational, **with no consumer in any later transcript.** By this rule it should have
been tested against stats.nba.com first; **stats.nba.com is in fact what the build used.**
*Source: T1, a pre-existing NBA integration report. Recorded 2026-09-20.*

| Property | Value |
|---|---|
| **Status** | *"Fully operational with paid GOAT tier"* |
| **Cost** | **$39.99/month** |
| **Rate limit** | **600 requests/min** — *"10× more than FREE tier"* |
| Endpoints verified | `/teams` 200 OK · `/games` 200 OK · **`/stats` 200 OK — *"CRITICAL, paid tier only"*** |
| API key | confirmed active (`d2bc0f1b…3ea7`) |
| **Timeout** | raised **10s → 30s** to handle slow responses |
| Documentation | `BALLDONTLIE_INTEGRATION_SUCCESS.md` |

> **Key finding, as stated**: *"**API is SLOW (10–30 s per request) but functional. CACHING CRITICAL
> for production.**"*

**⚠ This is a paid subscription that appears in no later transcript.** The NBA build went to
**stats.nba.com** as its primary source (T1 onward), and T9's historical-prop research records
*"balldontlie: **no history**"* as the reason it was not used for board data.

**Open questions**: is the subscription still active and being paid for? Is anything in the current
pipeline calling it? **Nothing in the P1/P2/P3 workflows references it.**
Recorded in `NBA_OPEN_ITEMS.md`.

### The Odds API
Historical and live sportsbook lines → `nba_market.board_snapshots`. 12 books, $30 plan.
**Carries PrizePicks as a bookmaker but NOT the DFS-only markets** (fantasy_score, period props).
**This superseded the T9 verdict that no retroactive prop archive existed** — BigDataBall was never
needed.

### ParlayAPI
`https://parlay-api.com/v1`. **The same paid service already integrated for MLB**, covering NBA via:
- **sport key** `basketball_nba`
- **market keys** `player_points` / `player_rebounds` / `player_assists` / etc.
- **DFS pick'em bookmaker keys** — **`prizepicks`, `underdog`, `sleeper`, `betr`, `pick6`**
- **Key storage**: `config.external_credentials`, `credential_key = 'parlay_api_key'`, with an
  **env-var fallback `PARLA[Y_API_KEY]`**

**NBA game lines back to 2007; NO historical props; no DFS books.**
**Superseded for boards** — own scrapers capture ~25% more rungs, proven with same-moment diffs.
**Retained use**: validating the derived spread.

**⚠ Coverage for `basketball_nba` was flagged in T1 as *"still NOT INDEPENDENTLY VERIFIED"*** and was
never verified — it was superseded instead.

**Note the bookmaker list includes `betr` and `pick6`**, which the NBA build later scraped directly
(Betr via GraphQL with a Keycloak token). **ParlayAPI listing a bookmaker does not mean it carries
that bookmaker's full rung depth** — that is the ~25% finding.

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
the table in a different point of view."*

**The documented correct usage pattern (T1, lessons #4 and #21):**
1. **Ask it to SET ITS OWN FALSIFICATION BAR BEFORE SEEING THE RESULT** — minimum sample size,
   **required monotonicity**, minimum edge over baseline — then check the actual number against that
   pre-stated bar.
2. **Multiple SMALL passes, not one large dump** — *"large single prompts caused DRIFT."* Working
   pattern: **present data + sharp questions → get a diagnosis → reference that diagnosis explicitly in
   a follow-up, without re-pasting everything.**
3. **Present your own known verification errors and EVERY control tested, not just the favourable
   ones.**
4. **Check the METHOD, then RE-DERIVE the conclusion yourself.**

**Stated as *"valuable but NOT infallible in EITHER direction"*** — and the NBA record shows both:
| Caught something real | Was wrong |
|---|---|
| garbage-time filtering (T2) | 1,230 calls for advanced stats — **actually 2** (T4) |
| the schedule as *"the chassis"* (T3) | *"starters inferable from game logs via `GS`"* (T5) |
| peer-reviewed altitude / jet-lag factors (T7) | *"Team Pace still needed"* (T5) |
| **self-corrected its own on/off ranking** (T3) | *"tier globally"* (T7) |
| the Shot Quality Delta methodology (T3) | *"potential assists aren't in our data"* (T7) |
| proposed halftime foul count → correctly rejected as in-game data (T9) | |

**Not recorded in any NBA session**: asking it to state a falsification bar **before** seeing a result.
**Usage has been synthesis and critique.**

**The two failure modes named in the source:**
- *"confidently **predicting a MECHANISM that a direct test then refuted**"*
- *"incorrectly asserting **historical data could resolve something that turned out to NOT EXIST AT
  ALL** when checked directly"*

> *"**Test Gemini's claims and mechanisms the same way you test your own — don't accept or reject on
> AUTHORITY.**"*

**Both failure modes have NBA instances**: the *"tier globally"* recommendation was a mechanism
refuted by reading the live MLB code (T7); the *"potential assists aren't in our data"* and
*"Team Pace still needed"* claims were assertions about what data existed, refuted by checking
(T5, T7).
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