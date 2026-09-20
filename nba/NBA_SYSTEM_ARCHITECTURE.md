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

## 1a0. THE SHARED-QUEUE QUESTION THE BLUEPRINT POSED — **answered 2026-09-20, by live query**
*Angle: negative space — what a section promises and never delivers. Recorded 2026-09-20 (T1 pass 35).
**The question was never recorded as open in any of the twelve documents. The word "contention"
appeared in none of them.***

**The blueprint, §0, posed it as a concrete task — not a musing:**
> *"**Shared operational infrastructure should generally be REUSED, NOT DUPLICATED** — the job queue,
> the worker registry, the scheduled-jobs table, the MCP admin bridge, and the deploy pipeline are all
> genuinely sport-agnostic plumbing… **The real design question for NBA isn't 'should we build our own
> job queue' (NO) — it's 'DOES ADDING A SECOND SPORT'S WORTH OF JOBS TO THE EXISTING SHARED QUEUE AND
> SCHEDULING SYSTEM INTRODUCE ANY REAL CONTENTION OR COLLISION RISK'** — **a genuine, concrete thing
> worth CHECKING DIRECTLY AGAINST THE LIVE SYSTEM before assuming it's fine, rather than either
> avoiding it or assuming it's automatically safe.**"*

### ✅ THE ANSWER — **the risk is structurally zero, because NBA never joined the queue. VERIFIED.**

| Check | Result |
|---|---|
| NBA's own control plane exists | **`nba_control.job_runs`, `nba_control.worker_run_log`, `nba_config.worker_definitions`** — VERIFIED present |
| NBA rows in MLB's shared registry `config.worker_definitions` | **0** |
| Total rows in `config.worker_definitions` | **116** |

**NBA runs an entirely separate control plane.** There is **no shared queue to contend for**, so the
blueprint's risk cannot materialise. **The question is closed — by architecture, not by measurement
of contention.**

### ⚠ BUT NOTE WHAT CLOSED IT — a direct contradiction of the blueprint, flagged not resolved
**The blueprint answered its own sub-question in advance: *"should we build our own job queue"* —
**"(no)"**. **NBA built its own anyway**, because **the owner overruled the shared-control-plane
proposal** (`NBA_MASTER_SUMMARY.md` §T1.3 — *"owner overruled it — NBA gets its own everything"*).

**So the blueprint's recommendation and the system as built disagree on the record:**
| | Says |
|---|---|
| **Blueprint §0**, citing §7e's *"hard-won lesson"* | reuse shared plumbing; duplicating it *"just for NBA" is almost always the wrong move* |
| **The owner, T1** | *"NBA gets its own everything"* |
| **The live system** | **the owner's version** — separate schemas, separate registry, separate run log |

**The owner's decision is the binding one and is not in question here.** What is recorded is that
**the blueprint's contrary recommendation was never explicitly closed out** — it simply stopped being
followed. **Flagged per the standing rule on contradictions; not resolved.**
**The benefit is real and worth stating**: the isolation that made the question moot is the same
isolation that makes **`startswith("alphadog-v2-nba-")`** provably zero-impact on MLB.

### ✅ AND A SECOND THING THE SAME QUERY VERIFIES — the additive-only constraint HELD
**`config.worker_definitions` holds 116 rows.** T1's Phase 1 live-verification banner, dated
**2026-08-31**, recorded **116 live rows** in that same registry.
**Twenty days and an entire NBA build later, the number is unchanged and NBA's share of it is zero.**
**That is direct, live evidence that the *"additive only, no MLB-system side effects"* constraint —
stated in T1 and never independently tested since — was honoured.** **VERIFIED 2026-09-20.**

---

## 1a. ⚠⚠ THE OPERATING CONSTRAINT THAT EXPLAINS THE WHOLE ARCHITECTURE
*Source: T1, `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` **§7**. **Recorded 2026-09-20 (T1 pass 31) —
§7 was entirely undocumented across all twelve documents.***

> *"**This person owns and operates the entire system alone, working from a phone with no terminal
> access — the AI assistant is THE ONLY INTERFACE to the database, repository, and deploy pipeline.**
> They expect **a senior technical partner: real root-cause analysis, calibration honesty, and NO
> CLAIMS OF SUCCESS WITHOUT EVIDENCE VERIFIED DIRECTLY AGAINST LIVE DATA.**"*

**This is not a preference note — it is the load-bearing constraint behind every infrastructure
decision recorded in this document**, and it was stated in the handoff **before any NBA code existed**.
Read against the rest of this file it explains:

| Architectural choice | Why it had to be that way |
|---|---|
| **The MCP admin bridge** (§3) exists at all, and was built **before any other worker** | there is no terminal. **The bridge IS the terminal.** `NBA_RECIPE.md` STEP 0b records the startup plan's own ranking: *"set up the database schemas and the MCP admin-worker bridge BEFORE writing any other worker — this is the tool surface everything else depends on"* |
| **Trigger files** (§7) instead of `workflow_dispatch` from a CLI | a `git push` to a watched path is reachable from the bridge; a CLI invocation is not |
| **GitHub as data transport** — scrape on a runner, commit JSON, worker reads the committed file | there is no local machine to run a scraper on |
| **Everything documented into committed repo files** | §7's own standing rule, quoted below — chat is not a durable record when chat is the only interface |
| **`node --check` before commit, dry-runs before writes** | a broken deploy cannot be fixed from a phone at speed |
| **No orchestrator** (`NBA_SYSTEM_DESIGN.md` §0.6) | *"it only breaks the run"* — an unattended failure is expensive when the operator has no shell to debug from |

**The standing documentation rule, verbatim** — and it is the instruction this entire twelve-document
effort descends from:
> *"**Document everything into committed repository files, not only into chat conversation** — this
> whole NBA transfer package is itself a direct expression of that same standing instruction, and
> **the practice should continue throughout NBA's own build, not just at the outset.**"*

**Full operating model** — output style, what the owner pushes back on, how decisions get made, the
required report layout and the standing UI rules — in `NBA_MASTER_SUMMARY.md` §T1.61.

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

### ⚠⚠ NEVER HARDCODE A FIXED UTC OFFSET FOR A US TIMEZONE
*Source: T1, blueprint §7e. Recorded 2026-09-20.*
> *"**NEVER HARDCODE A FIXED UTC OFFSET FOR A US TIMEZONE IN SCHEDULING LOGIC — IT CHANGES TWICE A
> YEAR WITH DAYLIGHT SAVING TIME.**
> **Use A REAL TIMEZONE-AWARE FUNCTION** — e.g. a standard library's timezone-formatting capability
> **WITH AN EXPLICIT NAMED TIMEZONE** — **for ANY TIME-OF-DAY SCHEDULING CHECK.**"*

**⚠ This is live for NBA, and the season crosses DST on 2026-11-01.**

**Where NBA is exposed:**
| Surface | Form | Risk |
|---|---|---|
| **P1 cron `0 19 * * 1`** | UTC | **drifts an hour across DST** — documented as *"harmless, because nothing here is cutoff-sensitive"* ✅ |
| **P2 cron 01:00 PT** | UTC in the workflow | **drifts an hour** — and P2's margin is already **2 hours tighter** than the lag research endorsed |
| **P3 cron 1:15 PM PT** | UTC in the workflow | **drifts an hour** — against a cutoff that IS time-sensitive |
| **`nba_asof.py` — `PHASE1_CUTOFF_LOCAL = "16:00"`** | **a LOCAL time string**, not an offset | ✅ **the correct form** |
| The injury-report archive | *"the season crosses DST"* — already recorded as a caveat on the hourly backfill | ⚠ noted |

**✅ `nba_asof.py` gets it right** — storing `"16:00"` as a **local wall-clock time** with the timezone
resolved at use is exactly the prescribed pattern, not a fixed offset.

**⚠ The crons are the exposure.** GitHub Actions crons are **UTC-only** — there is no named-timezone
option — so **a PT-anchored schedule necessarily drifts one hour twice a year.**

**Consequences by pipeline:**
- **P1**: genuinely harmless, and documented as such.
- **P3**: the **cutoff assertion protects correctness** — it refuses to score a slate clubs have not
  filed for — **so a drifted P3 fails safe rather than scoring stale.** But on 2026-11-01 the run
  moves to **12:15 PM PT**, an hour before the injury-report cutoff logic expects.
- **P2**: **the one that matters.** A drift to **00:00 PT / 03:00 ET** puts the delta run **an hour
  closer to the publishing window**, compounding the missing grace window.

**The generalisable check**: any comparison of "now" against a fixed hour must resolve the timezone by
name (`America/Los_Angeles`), **never by a stored `-08:00` / `-07:00`.**

## 8b. ⚠ CORRUPT-AND-FIX TESTING — "the single most reliable verification pattern"
*Source: T1, blueprint §8. Recorded 2026-09-20.*

> *"**MLB's SINGLE MOST RELIABLE VERIFICATION PATTERN, worth adopting IMMEDIATELY: CORRUPT-AND-FIX
> TESTING** — **DELIBERATELY CHANGE OR DELETE A REAL ROW DIRECTLY IN THE DATABASE** — **FLIP A VALUE,
> SIMULATE A TRADE/ROSTER CHANGE, DELETE A ROW** — **and CONFIRM THE PIPELINE CORRECTLY DETECTS AND
> REPAIRS IT ON THE NEXT RUN, rather than ONLY EVER TESTING THE HAPPY PATH.**"*

**The three named corruptions map directly onto NBA's differential layer's job:**
| Corruption | What it tests |
|---|---|
| **Flip a value** | does the field-by-field comparison detect it? |
| **Simulate a trade / roster change** | does the differential log it? |
| **Delete a row** | does the next run restore it? |

**⚠ This is the test that would settle several open items at once**, and it is the one form of
verification the NBA build has not used. The record shows extensive **happy-path** and **replay**
verification — *"the delta dry-run produced the correct delta"*, *"the ladder reproduces exactly"*,
*"0 NaN"* — **but no deliberate corruption.**

**What corrupt-and-fix would answer immediately:**
| Open item | The corruption that tests it |
|---|---|
| **The upsert update-clause audit** | flip one field per writer, re-run, see which fields refresh |
| **The differential worker being empty** | simulate a trade — **nothing would log, proving it** |
| **Source-scoping by natural key** | write a row from source A, then a fresher one from source B |
| **The `active=1` deactivate-by-absence logic** | delete a roster row, confirm it returns rather than deactivating peers |
| **Field-level archive gaps** | null a populated column, see whether the next run repairs it |

**And the timing is right**: the differential snapshot is **frozen at 2026-09-03** and the season has
not started, so **a deliberate corruption now costs nothing** — there is no live output to protect.

**⚠ One caution from the same blueprint**: `nba_ref.teams` and `players` are **write-through from
committed JSON**, so a corrupted row is repaired from the file on the next run. **That makes the test
safe, and it also means the test is meaningful only where a real comparison happens** — the
differential layer, the alias tables, the `active` flags.
*Source: T1, blueprint §7e — **"the single most important database-discipline rule from the whole MLB
migration."*** Recorded 2026-09-20.

> *"MLB's standing rule was **'ZERO NEW TABLES ON THE LEGACY/D1-STYLE DATABASE'** — but **the PRECISE,
> CORRECT VERSION of this rule has A REAL, IMPORTANT EXCEPTION worth carrying forward exactly:**
> **the OPERATIONAL CONTROL-PLANE — job dispatch bookkeeping: A JOB QUEUE, RUN HISTORY, LOCKS, WORKER
> RUN LOGS — is A LEGITIMATE, ACCEPTED EXCEPTION**, since **every part of the system already flows
> through it REGARDLESS OF WHICH DATABASE HOLDS THE ACTUAL BUSINESS/SPORTS DATA.**
> **What is A HARD VIOLATION, WITH ZERO EXCEPTIONS, is creating ANY NEW TABLE OF ANY KIND — INCLUDING
> A TINY CONFIGURATION OR MARKER VALUE — ON THE LEGACY DATABASE WHEN AN EXISTING POSTGRES TABLE OR AN
> ALREADY-ESTABLISHED PATTERN IN THE SAME CODEBASE ALREADY SOLVES THE SAME PROBLEM.**"*

**The rule has a shape worth noting: an exception for the control plane, and NO exception for
anything else — explicitly including "a tiny configuration or marker value."** The small case is named
because it is the one that gets waved through.

### ✅ NBA is structurally compliant, and by a wider margin than the rule requires
| | Rule | NBA |
|---|---|---|
| Business/sports data | never on legacy | **Postgres-only from day one** — *"NBA is Postgres-native from the start"* |
| **Control plane** | **legitimate exception** | **uses the SHARED `control.*` / `config.*` tables — bookkeeping only** |
| New tables on legacy | **hard violation** | **none — D1 was decommissioned system-wide 2026-08-12**; all 12 MLB D1 bindings report false |

**NBA never had the opportunity to violate this**, because it began after the Postgres migration and
D1 was retired during the build.

### ⚠ But the rule's GENERAL form still applies, and it is the live one
***"…when an existing Postgres table or AN ALREADY-ESTABLISHED PATTERN IN THE SAME CODEBASE ALREADY
SOLVES THE SAME PROBLEM."***

**That clause is about DUPLICATION, not about D1** — and it is the same principle as §5a's *"check
whether an equivalent, already-correct pattern exists elsewhere in the same codebase; copying a proven
pattern beats inventing a new one."*

**Live NBA cases where an established pattern already solves a recorded gap:**
| Gap | Established pattern that already solves it |
|---|---|
| The board producer's zero-vs-broken ambiguity | **the delta worker's calendar-based pre-flight** |
| Config↔code drift (`minutes_mixture`) | **the patcher's anchor assertions** |
| A stale artefact load | **`baseline_ladder_runs.source_file`** + an `asof` assertion |
| Unscheduled differential worker | **MLB's `weekly-differential-runner` native cron** |

**In each case the answer is to copy, not to invent** — which is what this rule's final clause says.

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

## 2c. POSTGRES / HYPERDRIVE AND DEPLOY GOTCHAS — confirmed real in THIS stack
*Source: T1, blueprint §4m — "a real, hard-won list… worth carrying into NBA's own workers directly
since the infrastructure is shared." Recorded 2026-09-20.*

### 1. ⚠ `round()` on a double-precision value fails without an explicit cast
> *"**A numeric rounding function call can FAIL TO RESOLVE TO ANY REAL OVERLOAD without an explicit
> cast** — a real, confirmed case where **rounding a DOUBLE-PRECISION value to a given number of
> decimal places FAILED OUTRIGHT because NO MATCHING FUNCTION SIGNATURE EXISTED for that exact type
> combination**; **casting to NUMERIC first resolved it.**
> **ALWAYS CAST EXPLICITLY when rounding a computed floating-point value in SQL against this
> stack.**"*

**Directly live for NBA**: `p_more`, `p_less`, `p_raw`, `baseline_hp`, `final_hp`, `cal_shift`,
`confidence`, `score` and `edge` are all **`DOUBLE PRECISION`**. **Any reporting query that rounds
them needs `::numeric` first** — `round(x::numeric, 4)`, not `round(x, 4)`.

**Note this fails LOUDLY** (no matching function), so it is a nuisance rather than a silent-data
risk — the opposite of most items in this record.

### 2. ⚠ Reserved words silently break as aliases
> *"**Certain plain, unquoted words are RESERVED and will SILENTLY BREAK as column/table aliases** —
> e.g. **a word that also functions as SQL syntax elsewhere, like a BLOCK-BOUNDARY KEYWORD.**
> **Avoid short, generic aliases that might collide with the dialect's own reserved vocabulary.**"*

**"Silently" is the important word here** — unlike the cast issue, this one can change a query's
meaning rather than refuse to run.

**NBA's exposure**: the documentation and queries throughout this project use short aliases
(`t`, `p`, `a`, `g`). **`end` is the named example class** — a block-boundary keyword — and NBA's
schema contains fields that invite exactly such aliases (`period`, `side`, `line`, `anchor`, `phase`,
`band`, `status`, `source`, `kind`).

### 3. ⚠ Double-JSON-encoded columns need an explicit unwrap
> *"**A DOUBLE-JSON-ENCODED COLUMN** — a JSON-typed column whose **actual stored value is ITSELF A
> JSON-ENCODED STRING, not a native object** — **needs an EXPLICIT UNWRAP STEP before further JSON
> operations work correctly.** **This is A RECURRING SHAPE IN THIS SYSTEM, NOT A ONE-OFF.**"*

**NBA's JSONB columns**: `raw_json` on every reference and stats table, `factor_fits` and
`role_minutes_multiplier` on `baseline_ladder_runs`, `config_json` on `classification_config`, and
**the enrichment `breakdown`** — which is **stored as a STRING containing JSON**
(`"breakdown": "[{\"factor_key\":…}]"`), i.e. **exactly this shape.**

**Any query doing JSON operations on `breakdown` must unwrap first.** The per-factor audit described
in §7c depends on reading it.

### 4. ⚠⚠ A SILENT TYPE MISMATCH ON A JOIN KEY — fails slowly, not loudly
> *"**A SILENT TYPE MISMATCH between two columns that are logically 'THE SAME FIELD' can FORCE A JOIN
> INTO A SLOW, UN-INDEXED NESTED-LOOP PLAN THAT TIMES OUT, rather than THROWING A CLEAR ERROR** — a
> real, confirmed case of **the same logical identifier stored as ONE NUMERIC TYPE IN ONE TABLE AND A
> DIFFERENT NUMERIC TYPE IN ANOTHER**, and separately as **A TEXT TYPE IN ONE TABLE AND A
> LARGE-INTEGER TYPE IN ANOTHER, for what's conceptually THE IDENTICAL FIELD.**
> **Before joining on ANY identifier across two tables in NBA's own schema, CONFIRM BOTH COLUMNS SHARE
> THE EXACT SAME REAL DATA TYPE** — **a mismatch here FAILS SILENTLY AND EXPENSIVELY, NOT LOU[DLY].**"*

**⚠⚠ NBA stores identifiers in exactly the two mismatched forms named.** `nba_ref.teams` carries
**`team_id` TEXT** *and* **`nba_team_id` BIGINT** — *"a text type in one table and a large-integer
type in another, for what's conceptually the identical field"* is a precise description of that pair.

**And the same split exists on players**: `player_id` appears as TEXT in some tables and as a numeric
elsewhere — **the T9 bug *"the virtual rows are built before `PLAYER_ID` is cast to string, so the
roster ids come out as ints"* is this exact hazard caught at the write side.**

**Why it matters at NBA's scale**: `final_hp` is **38.7M rows** and `baseline_history` **19.3M**. **A
join key type mismatch there does not error — it degrades to a nested loop and times out**, which
presents as "the query is slow" rather than as a bug.

**This also connects to T1's own canonical-ID rule** — *"use ONE canonical ID format from day one…
**grep for format inconsistency PROACTIVELY, don't wait for it to surface as a downstream
symptom**."* **The downstream symptom this rule warns about is precisely a timing-out join.**

**Neither check is recorded as having been run.** A single `information_schema.columns` query across
the NBA schemas would list every `*_id` column with its type.

### 5. ⚠ A large multi-stage join can DROP THE CONNECTION, not just run slowly
> *"**A large, multi-stage join query against this kind of POOLED POSTGRES CONNECTION can DROP THE
> CONNECTION OUTRIGHT, rather than simply running slowly.**
> **The reliable fix, CONFIRMED WORKING REPEATEDLY: BUILD INTERMEDIATE RESULTS AS THEIR OWN SEPARATE,
> INDEXED TABLES IN SEQUENCE rather than NESTING MANY JOINS/CTEs INTO ONE LARGE QUERY.**"*

**✅ NBA already works this way**, and the pattern appears throughout: `rung_market` was *"built in
monthly blocks"*, the ladder is built **per prop pair** (*"too slow for one call with all four props…
splitting by prop"*), and `baseline_history` is loaded in season chunks. **Each is an intermediate
indexed table rather than one nested query.**

**⚠ And it compounds with gotcha #4**: a type-mismatched join inside a large multi-stage query does
not merely run slowly — **at this scale it can drop the connection**, which presents as an
infrastructure failure rather than a schema problem.

### 6. ⚠⚠ ONE SQL STATEMENT PER BRIDGE CALL — batching can SILENTLY CORRUPT DATA
> *"**Send EXACTLY ONE SQL statement per tool/API call to this kind of database bridge** — **batching
> multiple statements into one call has been CONFIRMED to SILENTLY CORRUPT DATA rather than cleanly
> executing OR cleanly failing.**"*

**This is the most severe gotcha in the list** — not a failure mode but a **corruption** mode, with no
error either way.

**The bridge's own tool description enforces it**: *"**One statement at a time**"* on both
`run_sql` and `run_sql_postgres`. **The constraint is honoured by the tooling, and now the reason is
recorded**: it is not a convenience limit, it is a data-integrity guard.

### 7. Result sets are capped by the bridge, not by the query
> *"**Query result sets are CAPPED AT A FIXED ROW COUNT BY THE BRIDGE TOOLING ITSELF (confirmed at 500
> rows)** — **AGGREGATE OR PAGINATE INSIDE THE SQL ITSELF** for anything that could exceed this,
> **rather than assuming a raw `SELECT *` will return everything.**"*

**Confirmed identical in this stack**: `max_rows` is documented as *"capped at 500."*
**This is the "hidden internal cap" of §4c.4 in its most common form** — the caller can request more
and will silently receive 500. **Any count or coverage check must aggregate in SQL (`count(*)`,
`group by`) rather than returning rows and counting them.**

**⚠ A live example of getting this right**: every live verification in this documentation used
`count(*)` aggregates — `arenas` (30/0/0/19), the differential logs (0/0/0/582), the config tables —
**never a `SELECT *` row count.**

### 8. ⚠ A CDN in front of raw-file URLs serves STALE content after a successful deploy
> *"**A CDN OR EDGE CACHE in front of a raw file-serving endpoint** — e.g. **a raw-content URL for a
> hosted git repository** — **can serve a STALE, PRE-DEPLOY VERSION OF A FILE FOR SEVERAL MINUTES
> AFTER A REAL, SUCCESSFUL DEPLOY.**
> MLB confirmed this **produced TWO SEPARATE FALSE 'the change didn't actually land' CONCLUSIONS**
> before the team learned to **VERIFY A DEPLOYED CHANGE THROUGH THE PLATFORM'S OWN API-LEVEL FILE-READ
> TOOL RATHER THAN FETCHING THE RAW PUBLIC URL DIRECTLY.**"*

**⚠⚠ This is directly live for NBA, because the loaders fetch from exactly that surface.**
- **Every writer Worker fetches committed JSON from `raw.githubusercontent.com`** — chosen
  deliberately, because *"the GitHub Contents API silently returns EMPTY above 1 MB."*
- **`load_baseline_ladder.py` fetches the artefact over HTTP from the repo** — with the workflow
  comment *"**COMMIT BEFORE LOADING** … load_baseline_ladder.py fetches the artefact over HTTP from
  the repo (raw.githubusercontent), **NOT from the runner's local disk** — so a ladder built but not
  committed [is invisible]."*

**So NBA has a commit → CDN → load chain, and a stale read would load the PREVIOUS day's artefact
while reporting success.**

**The two surfaces have opposite failure modes, which is the trap:**
| Surface | Failure |
|---|---|
| **Contents API** | **silently returns EMPTY above 1 MB** — the reason raw is used |
| **`raw.githubusercontent.com`** | **silently returns STALE for minutes after a deploy** |

**And the prescribed fix points back at the surface NBA avoided**: *"verify through the platform's own
**API-level file-read tool** rather than fetching the raw public URL."* **Under 1 MB the Contents API
is the correct verifier; above it, neither is safe alone.**

**The NBA-specific risk window**: P2 commits the ladder and then loads it **in the same workflow run**
— the shortest possible gap between write and read. **`baseline_ladder_runs.source_file` records what
was loaded**, so a stale load is detectable after the fact, **but nothing asserts freshness before
loading.**

**Note this also explains a T3 observation**: *"a newer commit (`f8b6ad9e`) landed after my last push"*
and the repeated *"still not committed — let me check the run directly rather than keep polling
blindly."* **Polling a raw URL for a just-committed file is precisely the pattern that produces false
negatives.**

---

## 2d. TWO NAMED CODE-LEVEL BUGS IN THIS EXACT STACK
*Source: T1, `NBA_ARCHITECTURE_BLUEPRINT.md` **§7g** — "two specific, real software bugs worth
actively guarding against in NBA's own code."*
***Recorded 2026-09-20 (T1 pass 29) — previously unswept.***

### 1. A filter parameter that constrains the RESPONSE but not the WRITE PATH
> *"MLB found a function whose **'which props to touch' INPUT PARAMETER correctly filtered its own
> RESPONSE SUMMARY, but the underlying WRITE LOGIC IGNORED THAT FILTER ENTIRELY** and touched every
> eligible row regardless — **INVISIBLE EXCEPT BY NOTICING UNRELATED TIMESTAMPS HAD ALSO UPDATED.**"*

Stated as **not unsafe in that instance** — every write, filtered or not, passed the same validation
gate — *"but the parameter's name implied a selectivity that didn't actually exist."*

**The standing rule for NBA:**
> *"**When adding any 'limit to these specific items' parameter to an NBA worker, VERIFY IT CONSTRAINS
> THE ACTUAL WRITE PATH, not just what gets echoed back in the response.**"*

**⚠⚠ CONFIRMED LIVE IN NBA — 2026-09-20 (T1 pass 33). This is no longer a class to guard against; it
is a bug that has already fired.**
`nba/build_final_hp.py`'s **`FE_DATE`** scopes the `SELECT` from `baseline_history` and **not** the
`DELETE FROM nba_score.final_hp WHERE season=%s AND prop=%s`, which carries **no `game_date`
predicate**. A slate-scoped write replaces the whole season × prop partition. **Measured: the 2025-26
partition of `final_hp` holds ONE date and 140,130 rows against a documented 38.7M-row table.**
**And MLB's mitigating caveat does not transfer** — MLB's instance was *"not unsafe… every write
passed the same validation gate."* **NBA's deletes data.** Full entry at the top of
`NBA_OPEN_ITEMS.md`; row counts in `NBA_DATABASE.md`; parameter detail in `NBA_WORKERS.md` §5.

**Where this bites in NBA**: every worker with a mode/scope argument — `--season`, `--prop`,
`--player`, a date range, the mode-dispatch table in `NBA_WORKERS.md`. **One candidate has now been
audited and failed. The rest are still NOT AUDITED.** The detection signal named in the source — *unrelated timestamps also updating* —
means an `updated_at` spot-check on rows **outside** the requested scope is the cheap test.

### 2. `NOT IN` from an array parameter → real `malformed array literal` error
> *"A **`NOT IN` clause built from an ARRAY PARAMETER via a query-builder's TAGGED-TEMPLATE ARRAY
> HANDLING can be UNRELIABLE, ESPECIALLY WHEN THE ARRAY IS EMPTY**, producing a real **'malformed
> array literal'** error."*

**Prescribed fix pattern**: *"use an **EXPLICIT ARRAY-LITERAL-WITH-CAST pattern** and an **EXPLICIT
EMPTY-ARRAY BRANCH** instead of relying on implicit array-to-SQL handling for this specific clause
shape."*

**This is a shared-infrastructure gotcha, not an MLB-only one** — same Postgres, same Hyperdrive
path, same query-builder idiom. It belongs beside the §4m gotchas in §2c above.
**✅ VERIFIED ABSENT FROM NBA — 2026-09-20 (T1 pass 33).** A grep of **every `.py` and `.js` file in
`nba/`** (190 files, including `backtest/` and `workflows/`) for `NOT IN` in any case returns **no SQL
occurrence**. The nine hits are all **Python tuple-membership tests** (`if st not in ("OUT",
"DOUBTFUL")`, `if price not in (None, "")`), not SQL clauses. **No NBA query builds a `NOT IN` from an
array parameter, so this bug class cannot currently fire.**

**⚠ Stated with the limits of the method, per rule 1.6.** This is a **text search of the current
repo**, so it is evidence about **today's code**, not a guarantee about future code, and it would not
catch a `NOT IN` assembled from string fragments at runtime or one living outside `nba/`. **The
blueprint's prescribed pattern — an explicit array-literal-with-cast plus an explicit empty-array
branch — remains the rule for any `NOT IN` added later.**
*(This entry supersedes the "NOT RECORDED — not searched" note first written at pass 29.)*

### ⚠ Related, already-recorded: Hyperdrive read staleness
Blueprint §9 adds a third stack-level caution that belongs here: *"**connection-pool-fronted reads can
show STALE RESULTS FOR SECONDS TO TENS OF SECONDS after a write**"* — **Hyperdrive is exactly a
connection-pool front**, so a verify-immediately-after-write check against NBA Postgres can report a
false negative. Full context in `NBA_SYSTEM_DESIGN.md` §6b.

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

### ⚠⚠ "NETWORK CONNECTION LOST" USUALLY MEANS A PLAIN SQL ERROR
*Source: T1, blueprint §7a — **"the single biggest mistake of MLB's entire infrastructure migration."***

> *"MLB spent **REAL HOURS chasing a generic 'NETWORK CONNECTION LOST' error as an ACTUAL
> CONNECTION/NETWORK PROBLEM** — trying, in sequence:
> **(1) reverting bulk inserts to individual-row inserts — WRONG, cost a real ~15× PERFORMANCE
> REGRESSION that then had to be undone**;
> **(2) restructuring code to close/reopen connections around external fetches — reasonable in
> principle, NOT the cause**;
> **(3) adding multi-tick chunking — a good pattern regardless, ALSO NOT THE CAUSE.**
> **THE REAL FIX WAS ONE CONNECTION OPTION: `prepare: false`.**
> **The underlying problem the whole time was `postgres.js`'s PREPARED-STATEMENT MODE MASKING A PLAIN,
> ORDINARY SQL ERROR — A MISSING COLUMN, A TYPE MISMATCH — BEHIND A GENERIC-SOUNDING CONNECTION
> ERROR.**
> **For NBA: if a Postgres/Hyperdrive worker throws a vague 'connection lost'-style error, CHECK
> `prepare: false` AND LOOK FOR A GENUINE UNDERLYING SQL ERROR BEFORE TRYING ANYTHING ELSE** — **don't
> let a scary-sounding error name send you down expensive, unrelated rabbit holes.**"*

**This is why `prepare: false` is mandatory in the connection signature** — and now the reason is
recorded, not just the setting.

**⚠ The masked errors named are exactly NBA's two most common bug classes:**
| Masked error | NBA instances |
|---|---|
| **A missing column** | the team advanced table has no `usg_pct`/`reb_pct`; `player_game_log` has no team tricode columns; `ARENA`/`ARENACAPACITY` gone from the standings endpoint |
| **A type mismatch** | `team_id` TEXT vs `nba_team_id` BIGINT; `PLAYER_ID` cast to string too late |

**So NBA has repeatedly hit precisely the errors that `prepare: true` would have disguised as network
failures.** They surfaced as clear errors **because `prepare: false` is set.**

**The cost of the misdiagnosis is the lesson**: three plausible fixes attempted, one of them a **15×
performance regression** that had to be reverted, before a single config option resolved it.

### ⚠⚠ A CATALOG OF RECURRING FALSE ASSUMPTIONS — each a standing check
*Source: T1, blueprint §7c. Recorded 2026-09-20.*

**1. Never assume `CREATE TABLE IF NOT EXISTS` produced the schema your code expects**
> *"**A table can genuinely PRE-EXIST from earlier, unrelated work WITH A DIFFERENT REAL SCHEMA.**
> **Always VERIFY ACTUAL LIVE COLUMNS when there's any chance of this.**
> **This exact mistake RECURRED FOUR SEPARATE TIMES IN MLB before becoming a standing rule.**"*

**Four recurrences.** `IF NOT EXISTS` is silent by design — it neither creates nor complains.

**⚠ NBA's writers open with DDL blocks** (`baseline_ladder` + index + `baseline_ladder_runs`), and
**`nba_ref.prop_taxonomy` is the live case**: created in T1, **empty and unused until T8 seeded it
seven transcripts later.** A table existing with the wrong shape from earlier work is exactly that
timeline.

**2. Never assume a differential/dedup scoping check is correct because it runs without error**
> *"**A check MISSING ONE SCOPING CONDITION can SILENTLY BLOCK THE OVERWHELMING MAJORITY OF REAL ROWS
> from ever writing — a real MLB case: 1,344 OF 1,349 ROWS SILENTLY BLOCKED — WITH ZERO ERRORS THROWN
> ANYWHERE.**"*

**99.6% of rows blocked, no error.** This is the source-scoping bug (§7) quantified.

**⚠ NBA's differential layer is exactly this shape** — `teamHasRealChange()` gates every write. **And
the observable signature would be the one already seen**: `*_written` counters far below the expected
row count. **T2's 155/157-vs-162 discrepancy was investigated and correctly explained**; the same
signal at 5/1,349 would be this bug.

**3. Never trust a worker's own `ok: true` without an independent database check**
> *"**Multiple real MLB bugs — A MISSING FILTER, A SILENT FETCH FAILURE, DOUBLE-ENCODED JSON, AN ID
> FORMAT MISMATCH — ALL PRODUCED A WORKER RESPONSE REPORTING SUCCESS while QUIETLY UNDER-DELIVERING OR
> CORRUPTING REAL DATA.**"*

**All four named causes have NBA instances:**
| Cause | NBA instance |
|---|---|
| A missing filter | `SLEEPER_SPORTS` defaulting to MLB |
| **A silent fetch failure** | **`boxscoretraditionalv2` returning HTTP 200 with ZERO rows — 1,228 "successes" → 799 rows** |
| Double-encoded JSON | the enrichment `breakdown` is a JSON string, not an object |
| An ID format mismatch | `PLAYER_ID` cast to string too late → int roster ids |

**✅ And this is the discipline NBA follows consistently** — *"verify independently"*, *"check actual
row counts"*, *"exactly matches known reality."* **The v2-endpoint case is the canonical proof: 1,228
reported successes, 799 actual rows, caught only by comparing against expected magnitude.**

**4. Never assume two similarly-named data sources are the same data**
> *"MLB found **real cases of A LEGACY TABLE AND ITS SUPPOSED NEWER COUNTERPART holding GENUINELY
> DIFFERENT ROW COUNTS, ID CONVENTIONS, AND POPULATION CODE PATHS.** **Treat them as FULLY INDEPENDENT
> until DIRECTLY PROVEN OTHERWISE.**"*

**⚠ NBA has near-identical name pairs by design**: `player_game_log` / `_advanced` / `_usage` /
`_scoring`; `team_game_log_four_factors` / `_scoring`; `board_tiers` / `_ud` / `_v2`;
`ladder_calibration` / `_asof`.
**Two pairs are confirmed genuinely different**: the team advanced table **lacks `usg_pct` and
`reb_pct`** the player one has; **`board_tiers` v1 uses a two-way price-derived taxonomy while
`board_tiers_ud` uses the four-way fair-rung one.** **Same name shape, different semantics.**

**5. ⚠⚠ A "CANCELLED" CI JOB DOES NOT MEAN THE DEPLOY IS FINE**
> *"**A WORKER KEPT RUNNING OLD CODE BECAUSE ITS DEPLOY WAS SILENTLY SKIPPED** — since **A GIVEN
> PUSH'S CI DIFF IS COMPUTED ONLY AGAINST THAT PUSH'S *IMMEDIATE PARENT COMMIT*, NOT THE FULL RECENT
> CHANGE HISTORY** — **a file needing redeploy CAN FALL OUTSIDE a specific push's detected change
> scope.**
> **ALWAYS VERIFY THE DEPLOYED VERSION STRING IN A LIVE TEST RESPONSE, NEVER JUST A CI RUN'S
> CONCLUSION STATUS.**"*

**A structural property of diff-based deploys** — and NBA's is diff-based: *"the fleet deploys
**alphabetically from the file diff**."*

**⚠ The risk window is rapid successive pushes**, which this build does constantly. **A worker changed
two commits ago can fall outside the current push's diff and never redeploy**, while CI reports
success.

**NBA has the verification mechanism**: `VERSION = "alphadog-v2-nba-baseline-ladder-v0.1.0"` and the
health-check endpoints. **Checking it after a deploy closes this.**

**And it pairs with the stale-CDN gotcha**: after a push, **the deploy status can say success without
deploying, and the raw URL can serve pre-deploy content.** **Only a live response from the worker
itself settles it.**

---

*Source: T1, blueprint §7b. Recorded 2026-09-20.*

> *"MLB later hit **a real, INTERMITTENT Hyperdrive connection-closed failure, RULED OUT ACROSS THREE
> DIFFERENT DRIVER/CONFIGURATION COMBINATIONS THAT ALL FAILED IDENTICALLY — strong evidence AGAINST
> driver choice being the cause.** The actual root causes turned out to be **TWO DISTINCT BUGS
> PRODUCING THE SAME SYMPTOM.**"*

**Cause 1 — a stale per-tick row-count constant**
> *"**A STALE, HARDCODED PER-TICK ROW-COUNT CONSTANT CARRIED OVER FROM AN EARLIER, SLOWER DATABASE'S
> ERA**, **never re-tuned for the new database's much higher real bulk-insert throughput.**
> **Standing check for ANY per-tick row-count constant in NBA's own workers: IF IT PREDATES THE
> WORKER'S CURRENT BULK-INSERT IMPLEMENTATION, DON'T ASSUME IT'S STILL CORRECTLY TUNED — RE-DERIVE IT
> FROM REAL, OBSERVED PER-TICK THROUGHPUT.**"*

**⚠ This is the legacy-guard problem (§4n) applied to a tuning constant**, and **NBA inherited a
D1-era codebase.** The prescribed chunk size here is **150–200 rows per statement** — **worth checking
that NBA's writers use that and not a smaller D1-era figure.**

**A datapoint from NBA's own record**: T6's manual load ran **33 chunks of 44 KB** before the Worker
did the remaining **30,000 rows in 25 seconds** — **an ~1,000× throughput difference between the
manual path and the bulk path**, which is the scale of mis-tuning this warns about.

**Cause 2 — an N+1 query pattern**
> *"**An N+1 QUERY PATTERN — a loop issuing ONE WRITE PER ROW/ITEM instead of A SINGLE BULK
> STATEMENT — combined with SEQUENTIAL, UNBATCHED SCHEMA-SETUP STATEMENTS** — **an ORDINARY tick with
> FAR MORE ROUND TRIPS THAN NECESSARY, NOT a genuinely heavy one, producing the IDENTICAL 'looks like
> the connection is unhealthy' symptom.**"*

**The diagnostic insight**: the tick was **not heavy** — it was **chatty**. Round-trip count, not data
volume, produced the failure.

**And "sequential, unbatched schema-setup statements" is a named contributor** — `CREATE TABLE IF NOT
EXISTS` / `CREATE INDEX IF NOT EXISTS` blocks at the top of a worker, issued one at a time. **NBA's
writers do exactly this** (`baseline_ladder` + its index + `baseline_ladder_runs`).

**Together, §7a and §7b give three different root causes behind one error string:**
| Symptom | Actual cause |
|---|---|
| "Network connection lost" | **a plain SQL error masked by `prepare: true`** |
| "Connection closed", intermittent | **a stale per-tick constant** |
| "Connection closed", intermittent | **an N+1 pattern — too many round trips** |

**None is a network problem.** *"Don't let a scary-sounding error name send you down expensive,
unrelated rabbit holes."*

### Scope the differential/dedup logic BY SOURCE, not just by natural key
> *"Rows that are identical get **a cheap `active=1, updated_at=now()` TOUCH ONLY**.
> **Scope this differential/dedup logic BY SOURCE, not just by NATURAL KEY** — MLB had **a real bug
> where scoping ONLY BY NATURAL KEY caused ONE SOURCE'S FRESHER DATA TO BE SILENTLY BLOCKED because A
> DIFFERENT SOURCE HAD ALREADY 'SATISFIED' THE SAME KEY.**"*

**⚠ NBA has multi-source keys in several places:**
| Table | Sources sharing a key |
|---|---|
| `nba_ref.officials` | **Wikipedia roster** + **`boxscoresummaryv3` per-game assignments** |
| `nba_ref.players` | `commonallplayers` + **`playerindex`** (the position fix) |
| `nba_ref.arenas` | `teamdetails` + *(altitude/timezone, currently unpopulated)* |
| `nba_market.board_snapshots` | **five apps** + The Odds API |
| `nba_ref.team_aliases` | `alias_type` distinguishes **`manual_alias`** from derived |

**`team_aliases` carries `source_key` explicitly** — that is the prescribed source-scoping. **Whether
the others scope by source or only by natural key is unverified**, and the named failure is
**silent**: fresher data blocked because another source already satisfied the key.

**The `playerindex` position fix is the case to check**: positions arrived from a *second* source for
players already written from `commonallplayers`. **It worked (582/582), so the scoping held there.**

### ⚠ CHUNKING / MULTI-TICK CONTINUATION — and the per-tick trap
> *"**Cloudflare Workers have REAL EXECUTION-TIME CONSTRAINTS.** The proven MLB pattern: **PROCESS A
> BOUNDED SLICE PER INVOCATION, TRACK CONTINUATION STATE, and ONLY MARK A SOURCE 'FULLY SYNCED' ON THE
> FINAL TICK once THE COMPLETE FRESH DATASET HAS BEEN SEEN** — **NEVER PER-TICK, or INTERMEDIATE TICKS
> WILL INCORRECTLY TREAT UNPROCESSED ROWS AS STALE/INACTIVE.**"*

**The trap is specific**: marking synced per-tick makes rows that simply have not been reached yet
look **deactivated**. **A worker that deactivates by absence must only do so once it has seen
everything.**

**⚠ Directly relevant to NBA's `active` columns.** `nba_ref.team_aliases` and `player_aliases` carry
**`active INT DEFAULT 1`**, and the differential/snapshot layer deactivates by absence. **If any of
those writers is chunked, mid-run state would mark unreached rows inactive.**

**And the chunk-kill signature is the other half**: *"the signature of a chunk being killed by the
platform MID-LOOP BEFORE IT CAN CHECKPOINT"* — **a kill between ticks leaves exactly that
half-deactivated state** unless "fully synced" is final-tick-only.

### FRESHNESS GATES / WATERMARKS — with MLB's actual windows
> *"For any external source with **no cheap 'what changed since X' signal**: **SKIP AN EXPENSIVE FULL
> RE-MINE IF A CERTIFIED/PROMOTED RUN COMPLETED WITHIN A BOUNDED FRESHNESS WINDOW** — **MLB used 20
> HOURS for daily-ish sources, 3 HOURS for market/pricing sources it wanted fresher.**
> **ALWAYS ALLOW AN EXPLICIT `force_refresh` OVERRIDE.**"*

**Two windows named: 20h for daily sources, 3h for market/pricing.**

**NBA's equivalent is the certifier's staleness assertion** — P1 asserts *"freshness ≤ 8 days"* and
**correctly failed on defender ratings 6 days stale**. **But that is a FAILURE gate, not a SKIP
gate**: it refuses to certify stale data rather than skipping a re-mine of fresh data.

**⚠ NBA has no freshness skip gate recorded**, which is why the weekly scrapers re-pull whole
aggregates unconditionally. **For P1 that is correct** (§4k.7 — aggregates need refetch-and-replace).
**For P2's board and market scrapes, a 3-hour-style window would be the applicable pattern**, and
`force_refresh` maps onto the existing `skip_mining` input inverted.

### THE DIFFERENTIAL WRITE PATTERN — *"the actual core design philosophy"*
> *"**LOAD CURRENT STATE FROM POSTGRES FIRST, COMPARE EACH INCOMING ROW FIELD-BY-FIELD, and ONLY
> INSERT/UPDATE r[ows that genuinely changed]** — **worth replicating EXACTLY.**"*

**✅ NBA implements this**: `teamHasRealChange()` gates the write, and `*_written` counters report
**rows upserted in that run** (155/157) rather than the table total (162) — *"not a fallback-to-live
progression"*, as T2 resolved.

**⚠ And it is precisely why the upsert update-clause audit matters**: a differential writer that
compares field-by-field **but omits a field from its `DO UPDATE SET`** will detect the change,
attempt the write, and **silently leave that field frozen.**
> *"**The wrangler-config generator had a HARDCODED WHITELIST TUPLE of WHICH WORKERS GET CERTAIN
> BINDINGS (e.g. HYPERDRIVE)** — **a new worker NOT IN THAT TUPLE SILENTLY DEPLOYS WITHOUT THE BINDING
> IT NEEDS, producing A CONFUSING DOWNSTREAM ERROR WITH NO OBVIOUS CONNECTION TO THE ACTUAL CAUSE.**
> **If NBA's deploy pipeline has an equivalent generator, CHECK FOR AND AVOID THE SAME
> WHITELIST-OMISSION TRAP.**"*

**⚠ Hyperdrive is named, and every NBA writer Worker needs it.** A new NBA worker omitted from the
tuple **deploys successfully** and then fails at runtime with a database error that looks like a
connection problem, not a config one.

**This is the fourth of the four wiring edits** — and the reason it is four, not three:
| Edit | Omission symptom |
|---|---|
| Bridge binding map | the target is unreachable |
| Bridge dispatch branch | routing fails |
| Bridge tool enum | **hard client-side validation rejects the call** |
| **The generator** | **deploys cleanly, fails at runtime with a misleading error** |

**The generator omission is the only one of the four that fails SILENTLY at deploy time.**

### ⚠ BULK INSERTS, ALWAYS — and the misdiagnosis that cost real time
> *"**BULK INSERTS OVER INDIVIDUAL-ROW INSERTS, ALWAYS**, for anything with more than a handful of
> rows per invocation — **`postgres.js`'s `sql(arrayOfObjects, ...columnNames)` helper, CHUNKED
> ~150–200 ROWS PER STATEMENT.**
> MLB **initially SUSPECTED BULK INSERTS of being unsafe after a scary 'NETWORK CONNECTION LOST'
> error, WASTED REAL TIME REVERTING TO SLOW INDIVIDUAL INSERTS, and LATER FOUND THE ACTUAL CAUSE WAS A
> CONNECTION CONFIG ISSUE — `prepare: false` WAS THE FIX — NOT BULK INSERTS THEMSELVES.**"*

**Two things recorded here**: the exact pattern (`sql(arrayOfObjects, ...columnNames)`, **150–200 rows
per chunk**) and **a misdiagnosis to avoid repeating** — a connection error blamed on the wrong
mechanism.

**✅ NBA uses `prepare: false`** (part of the mandated three-option connection signature) **and batched
upserts throughout** — so it inherits both the fix and the pattern.

**And the misdiagnosis shape recurs in NBA's own record**: the T6 *"the MCP enum is unusable for the
whole session"* conclusion was also a wrong attribution — **the enum refreshes between turns**, and
33 manual chunks were nearly spent working around a problem that had resolved itself. **Same class:
an infrastructure symptom attributed to the wrong cause, at real cost.**

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

### 6. ✅ Check whether the data is DERIVABLE BY SQL before building an integration
> *"**Before building a new external data-mining integration, CHECK WHETHER THE NEEDED INFORMATION CAN
> BE DERIVED PURELY VIA SQL FROM DATA ALREADY BEING COLLECTED FOR A DIFFERENT PURPOSE.**
> MLB found a real case where **a seemingly separate data need REQUIRED ZERO NEW EXTERNAL API
> INTEGRATION AT ALL** — it was **fully derivable from data already being mined for a different
> reason** (*any pitcher's appearance in a game where they aren't the designated starter is, by
> definition, a bullpen appearance*), **computed with a SINGLE SQL JOIN.**
> **Check for this opportunity on EVERY new NBA data need.**"*

**✅ NBA hit this at least twice, and the record says so in the same terms:**
| Need | How it was satisfied |
|---|---|
| **Defence-vs-Position** (630 rows) | *"**free from data already held**"* — a **one-off SQL derivation** from game logs + positions, no new endpoint |
| **OT contribution per player** | *"**full-game MINUS quarters** isolates each player's OT contribution"* — arithmetic on data already scraped, **no OT endpoint exists or was needed** |
| Halves (1H/2H) | *"**Q1+Q2 / Q3+Q4**"* — same |

**And the T2 case is the same principle applied to a purchase decision**: **Team Pace** was proposed
as a gap by Gemini and found *"**already covered** by what we have"* — **an integration avoided by
checking first.**

**⚠ The counter-case worth noting**: **Defence-vs-Position was derived by a ONE-OFF MANUAL SQL** and
therefore had **no recurring path** until T7 placed the recompute inside the delta worker. **Derivable
by SQL is not the same as maintained** — a derived table still needs an owner in a pipeline.

### 7. ✅ CLASSIFY EACH SOURCE'S SHAPE BEFORE DESIGNING ITS MINING PATTERN
> *"**Classify each data source's REAL SHAPE before designing its mining architecture — PER-EVENT /
> PER-GAME data and SEASON-TO-DATE AGGREGATE data need GENUINELY DIFFERENT PATTERNS.**
> **Game-log-style data (ONE ROW PER GAME) supports CLEAN INCREMENTAL DATE-RANGE DIFFING**;
> **season-aggregate data (A CUMULATIVE STAT AS OF RIGHT NOW) has NO STABLE DATE RANGE TO DIFF
> AGAINST, since THE UNDERLYING REAL VALUE CHANGES WITH EVERY NEW GAME PLAYED, and needs a
> REFETCH-AND-REPLACE approach instead.**
> **Decide this EXPLICITLY for every NBA data source rather than applying ONE MINING PATTERN
> UNIVERSALLY.**"*

**✅ This distinction IS the P1/P2 split, and NBA got it right.**
| Shape | Pattern | NBA |
|---|---|---|
| **Per-game** (one row per game) | **incremental date-range diff** | **P2's daily delta** — new games only, pre-flight completeness check against the calendar, `GAME_ID` prefix `002` |
| **Season-to-date aggregate** | **refetch-and-replace** | **P1's weekly scrapers** — team stats, on/off, play types, tracking, DARKO, shot quality, splits, career totals |

**And it retroactively justifies the one place the "don't re-fetch" rule (§4c.1) does not apply**: the
weekly scrapers re-pull whole aggregates **because refetch-and-replace is the correct pattern for that
shape** — not because the incremental optimisation was overlooked.

**⚠ It also explains a recorded gap precisely.** T7 found **splits and career totals had *"no
recurring refresh at all"*** — *"they are **cumulative aggregates**, so **weekly is the right
cadence**."* **That is this rule diagnosing a missing refetch-and-replace path**, and the fix was to
add exactly that (`mode: "weekly"`).
**⚠ And they were then DROPPED from P1 in the rebuild** — so a source with the cumulative shape is
currently on no refresh path at all.

**The `player_game_starter_status` / `game_officials` case is a third shape**: per-game, but from a
**per-game endpoint**, which is why it needed its own delta scraper (`scrape_nba_per_game_delta.py`)
plus a `known_empty_games` exclusion — **incremental diffing where the diff is derived from committed
files rather than a date range.**

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