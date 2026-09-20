# NBA WORKERS — every worker, scraper and script

**Purpose.** What each piece of code is, where it lives, what it does, what it needs, and what it
writes. Grouped by role.

**Update log**
| Date | What changed |
|---|---|
| 2026-09-20 | Created. Cloudflare workers and static scrapers from T1–T2; engine/board/pipeline scripts from the live session and the journal. |

---

## 0. THE FOUR-STEP WIRING PATTERN *(established T2)*

Every Cloudflare worker must be registered in four places or it will not deploy or run:
1. `nba/worker_manifest_nba.json`
2. `generate_wrangler_configs.py` — the isolated NBA branch
3. `alphadog-v2-admin-sql.js` — **bindingMap + dispatch branch + tool-schema enum** (all three)
4. `nba_config.worker_definitions` — a registry row

**`admin-sql` must deploy LAST** (the fleet deploys alphabetically from the file diff).

---

## 0.5 ⚠ THE WORKER ARCHITECTURE WAS A NON-GOAL BEFORE IT WAS A DESIGN
*Source: T1, `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` **§6**, first non-goal. Recorded 2026-09-20
(T1 pass 31) — the dead-stub fact was already in these documents; **the instruction it produced was
not.***

> *"**Don't build a per-prop 'one worker per prop' architecture** — MLB tried this, abandoned it in
> favour of a unified scoring engine, and **left 19 DEAD STUB FILES behind as evidence**. **Build the
> unified version from the start.**"*

**This is why there is no `nba-score-points.js`, no `nba-score-rebounds.js`, and why the entire
scoring layer is one script** — `nba/build_final_hp.py` (§5) — **with props as a parameter
(`FE_PROPS`), not as files.** The 28 props in `nba_ref.prop_taxonomy` produce **one engine**, not 28
workers.

**The split that does exist is by DOMAIN, not by prop** — `static-teams`, `static-players`,
`static-officials`, `daily-delta`, `weekly-differential`. **That is the blueprint's "phase file"
pattern** (`NBA_FINAL_SCORING_CALIBRATION.md` §7i), and it is orthogonal to the non-goal: a phase is
a **stage of the pipeline**, a prop is a **row in a taxonomy**. **One worker per stage: yes. One
worker per prop: never.**

**The evidence that made it a rule is quantified**: MLB's abandoned attempt left **19 dead stub
files**, which remained in the repo long enough to be counted during T1's recon and are recorded in
`NBA_OPEN_ITEMS.md`. **NBA paid none of that cost** — **VERIFIED**: no per-prop worker appears in
`nba/worker_manifest_nba.json` or anywhere in `nba/`.

---

## 0a. THE INVESTIGATION METHODOLOGY — for understanding a large existing system
*Source: T1, blueprint §6b — worked out for "a genuinely huge (1MB+) orchestrator file, worth reusing
directly rather than reading the whole file top to bottom." Recorded 2026-09-20.*

| # | Step | Why |
|---|---|---|
| **1** | **Query the structured job/worker REGISTRY TABLES first** | *"**cheap, structured, and AUTHORITATIVE for 'what jobs and workers currently exist' — BEFORE TOUCHING ANY CODE.**"* |
| **2** | **Targeted code search for SPECIFIC PATTERNS** — job_key strings, stage-array variable names, function names | *"rather than reading entire large files — **cheap and precise**"* |
| **3** | **Only read a FULL physical file when a targeted search shows it's genuinely SMALL, or when a SPECIFIC CLAIM needs full-context confirmation** | *"**reserve full reads for when they're actually necessary**"* |
| **4** | **CROSS-CHECK every claim about 'what SHOULD happen' against REAL, LIVE EXECUTION HISTORY** — the job queue's run log, actual table row counts | *"**a registry or config table describes INTENT, not necessarily current real behaviour, and THE TWO CAN AND DO DRIFT APART.**"* |

**✅ This documentation effort has followed exactly this order**, which is why the findings hold:
- **Step 1** → `worker_definitions`, `factor_registry`, `classification_config`, `role_tiers` queried
  before any code was read
- **Step 2** → `github_grep_file` on `dud|mixture|p_dud`, `p_ot|overtime`, `round\(`, `MIN_RATIO`,
  `NOT yet|CERTIFIED`
- **Step 3** → full reads reserved for the workflow files and targeted recipe sections
- **Step 4** → the live SQL checks: `arenas` 30/0/0/19, the differential logs 0/0/0/582, the config
  tables, `prop_taxonomy` 28

**Step 4 is what produced every VERIFIED finding**, and step 4's own warning —
***"a config table describes INTENT, not current real behaviour, and the two DO drift"*** — **is
`minutes_mixture` exactly**: the config specifies `dud_lognormal`, `tiered_inelastic` and a per-team
blowout term; **the code implements none of them.**

**⚠ And it names the limit of step 1**: the registry is authoritative for *what exists*, **not for
what runs.** The differential worker is in the registry and has never executed.

---

*Source: T1, blueprint §6a. Recorded 2026-09-20.*

### 1. THE EXACT-PAIRING SAFETY CHECK
> *"**Where MLB reuses ONE PHYSICAL WORKER FILE for MULTIPLE LOGICAL ROLES, the dispatch code NEVER
> TRUSTS `job_key` ALONE — it requires A GUARD FUNCTION CHECKING THAT `job_key` AND `worker_name`
> MATCH TOGETHER AS A SPECIFIC, KNOWN PAIR before routing a job to that worker.**
> **This is precisely what PREVENTS A JOB FOR ONE LOGICAL ROLE FROM EVER BEING SILENTLY ROUTED TO THE
> WRONG PHYSICAL FILE.**
> **If any NBA worker ends up serving MORE THAN ONE LOGICAL ROLE — plausible for shared,
> sport-agnostic-shaped workers — APPLY THE SAME EXACT-PAIRING CHECK.**"*

**⚠ NBA has multi-role workers already** (§0d.1): the backfill worker (`mode`), the measure-types
writer (`file_prefix`), the injury scraper (`INJURY_MODE`), the season-tables scraper (`MODE`).

**And the precondition for mis-routing already occurred**: T6 records that
**`DAILY_DELTA_RUNNER_WORKER` already exists as a shared/MLB binding**, so an NBA-specific name was
chosen *"to avoid any conflict"* — **the hazard caught by naming discipline, not by a pairing guard.**

**The bridge's `run_job` takes a `target` ENUM with hard client-side validation — one field, not a
pair.** Whether a `job_key` + `worker_name` guard exists is not recorded.

### 2. LOGICAL NAME vs DEPLOYED SLOT
> *"**MLB's dispatch config EXPLICITLY DISTINGUISHES a job's *LOGICAL* (conceptual) worker name from
> its *DEPLOYED* (actual physical file) SLOT, specifically to MAKE WORKER-REUSE LEGI[BLE].**"*

**Two names per job, deliberately** — "which concept is this?" and "which file runs it?" as separate
questions, **instead of one name silently meaning both.**

**NBA's surfaces**: `nba_config.worker_definitions` carries `worker_name`, `job_key`, `worker_group`,
`phase_key`; the bridge carries a **binding name** and a **service name**. **No explicit
logical-vs-deployed distinction is recorded.**

**Most relevant to the patcher pattern**, which is worker reuse in its purest form:
`build_baseline_ladder.py` **is** `classification_ladder_v12.py`, transformed. **The logical job and
the deployed artefact are genuinely different things**, and the anchor assertions keep that
relationship honest.

---

## 0d. ⚠⚠ SYSTEM SELF-KNOWLEDGE — read before assuming anything is "live"
*Source: T1, blueprint §6 — **"file names, job_key names, and 'is this worker active' assumptions are
FREQUENTLY WRONG, and this cost real debugging time more than once."*** Recorded 2026-09-20.

### 1. One physical file can serve MANY unrelated logical roles
> *"**A single physical worker file can serve MANY UNRELATED LOGICAL ROLES, selected AT RUNTIME by a
> `mode` PARAMETER, not by which file it is.** MLB's most extreme case: **ONE 700 KB+ FILE SERVES ~24
> DIFFERENT LOGICAL FUNCTIONS across multiple job_key aliases.**
> **NEVER ASSUME 'ONE FILE = ONE JOB.'**
> If you're tempted to reuse an existing file for a new purpose via a mode switch, **that's CONSISTENT
> WITH THE ESTABLISHED PATTERN — but DOCUMENT THE MODE DISPATCH TABLE EXPLICITLY IN ONE PLACE, don't
> let it become IMPLICIT.**"*

**⚠ NBA uses mode switches throughout, and the dispatch table is NOT documented in one place.**
| File | Modes |
|---|---|
| `scrape_nba_injury_report.py` | **`INJURY_MODE`** = `daily` / `probe` / backfill *(with `INJURY_FROM`/`TO`)* |
| The backfill worker | **`mode`** = default / **`weekly`** (splits + career totals only) |
| The measure-types writer | **`file_prefix`** — backfill vs delta files |
| `scrape_nba_season_tables.py` | **`MODE`** = `season`, plus `SEASONS_N` |
| The certifiers | **`PIPE`** = `p1` / `p2` / `p3` |
| P2 itself | **`skip_mining`**, **`asof`**, **`season`** — replay vs live |
| The recipe | **`BT_CARRY`**, `BT_PROPS`, `BT_CUTOFF`, `BT_REPLAY`, `BT_TRAIN`/`BT_TEST`, `BT_PLAYER_L0`, `BT_SHIFT_LAMBDA`, `BT_LADDER_STEPS`, `BT_SAVE_COMPONENTS` |

**The table above IS the missing dispatch documentation**, assembled here for the first time.
**Note `INJURY_MODE` specifically**: the workflow comment records *"**`INJURY_MODE`, not `IR_MODE`
(verified in the script; MY FIRST GUESS WAS WRONG)**" — the exact cost this lesson describes.

### 2. A file name can be a complete DEAD STUB
> *"**A worker's own literal file name can be A COMPLETE DEAD STUB** while **ALL ITS REAL WORK HAPPENS
> UNDER OTHER job_key/mode ALIASES that have NOTHING TO DO WITH THE FILE'S NAME.**
> **Don't trust a file name as a description of current behaviour.**"*

**NBA's live instance of the inverse**: `classification_ladder_v12.py` **is at v18** — the file name
under-describes it by six versions. **And T7's three-generation trap is this lesson exactly**:
`alphadog-v2-base-classification-v5.js` is dead and says so; the live logic is a **function name**,
`runClassificationBaselineV6ToPostgres`.

### 3. "WIRED BUT NOT IMPLEMENTED" is a recurring shape
> *"**A dispatch guard function AND CALL SITE CAN EXIST and route to A HANDLER FUNCTION THAT WAS NEVER
> ACTUALLY WRITTEN**, causing **A CRASH ONLY WHEN THAT SPECIFIC PATH IS FINALLY EXERCISED.**
> **When wiring a new NBA worker into any dispatch table, VERIFY THE HANDLER FUNCTION ACTUALLY EXISTS
> — don't just verify THE ROUTING COMPILES.**"*

**This is §4h's called-but-undefined risk seen from the dispatch side**, and it is why NBA's wiring is
**four edits** rather than three — each is a place the routing can exist without the destination.

### 4. A batch of stubs can look entirely real from outside
> *"**A large batch of NEAR-IDENTICAL PLACEHOLDER/STUB FILES can look REAL FROM THE OUTSIDE** —
> **plausible file sizes, real-looking names** — **while being 100% UNIMPLEMENTED DUMMIES that were
> SCAFFOLDED EARLY AND ABANDONED when the design changed.**
> **MLB has 19 such per-prop 'SCORE' WORKERS, ALL RETURNING A HARDCODED
> `DUMMY_READY` / `DUMMY_ONLY_NOT_REAL_DATA` RESPONSE, NEVER ONCE INVOKED.**"*

**✅ Already recorded in this documentation**: *"MLB ~130 workers deployed vs 116 registry rows — **~19
are dead stubs at ~5.3 KB, still `enabled=1`**."* **This is the same 19**, and the detail now has its
source: they return a hardcoded dummy response and **were never once invoked.**

**The NBA-side implication**: `nba/worker_manifest_nba.json` lists workers by name and size. **Neither
signal distinguishes a real worker from a stub** — only invocation history does.

**✅ And the explicit instruction was followed**:
> *"**If NBA's design also considers 'ONE WORKER PER PROP', LEARN FROM MLB'S ABANDONMENT OF THAT IDEA
> IN FAVOUR OF A UNIFIED SCORING ENGINE — BUILD THE UNIFIED VERSION FIRST.**"*

**NBA has exactly one scoring path** — `classification_ladder_v12.py` with a `PROPS` config, plus
`combos_ladder_v1.py` — **not a worker per prop.** The 19 abandoned MLB stubs are what that
instruction exists to prevent, and NBA never created their equivalent.

*(⚠ The one place NBA did split is singles vs combos — two certified recipes rather than one. That is
a two-way split, not a per-prop one, but it carries the duplication cost recorded in OPEN_ITEMS.)*

### 5. ⚠ CHECK EXECUTION HISTORY, NOT THE `enabled` FLAG
> *"**Before assuming ANY schedule/cron is LIVE or DORMANT, CHECK THE ACTUAL JOB-QUEUE EXECUTION
> HISTORY DIRECTLY** (`control.control_job_queue` or equivalent) — **NOT the `enabled` flag alone, and
> NOT a note/comment in the config row.**
> MLB found **a real case of a cron flag and its own explanatory note DIRECTLY CONTRADICTING each
> other**, and separately found **'LONG DORMANT' job types that STILL HAD LIVE, WIRED UI BUTTONS
> DESPITE MONTHS OF ZERO REAL INVOCATIONS.**"*

**Three unreliable signals named**: the `enabled` flag, the config note, and a wired UI button.
**Only execution history is trusted.**

**✅ This is the method that caught NBA's differential worker** — the conclusion came from querying
the **output tables** (all three logs empty, snapshot frozen 2026-09-03), not from reading configs.

**⚠ And it reinforces the never-fire-cron caveat**: a `crons: ["0 0 30 2 *"]` entry **and** an
`enabled=1` flag can both be present and neither tells you whether the worker runs. **The MLB
observation that such crons kept firing twice despite the fix makes execution history the only
reliable answer in both directions.**

**NBA's equivalent sources**: `control.job_runs` / `control.job_queue` (shared, bookkeeping-only),
**GitHub Actions run history**, and — most directly — **the output tables' own row counts and
`updated_at`/`loaded_at` timestamps.**

---

*Source: T1, blueprint §5b — "a powerful, generalizable warning." Recorded 2026-09-20.*

> *"MLB found **MULTIPLE STATIC JSON MANIFEST FILES in its own repo that LOOKED AUTHORITATIVE** —
> structured, comprehensive, **one-worker-to-one-job mappings** — but **turned out to describe the
> system exactly as it was *ORIGINALLY SCAFFOLDED*, before extensive JOB-MULTIPLEXING was layered on
> top over time.** These files **were NEVER UPDATED as the real architecture evolved**, and **by the
> time they were checked, THEY DIRECTLY CONTRADICTED WHAT THE LIVE DISPATCH CODE ACTUALLY DID FOR A
> MAJORITY OF THE WORKERS INVOLVED.**
> **Any static 'WORKER → JOB' or 'FILE → FUNCTION' mapping document, HOWEVER OFFICIAL-LOOKING OR
> COMPREHENSIVE, SHOULD NEVER BE TRUSTED AS GROUND TRUTH for what a system CURRENTLY does — ONLY THE
> LIVE DISPATCH CODE (and, EVEN THEN, CROSS-CHECKED AGAINST LIVE EXECUTION HISTORY, since EVEN
> DATABASE CONFIG TABLES CAN DRIFT from what the code actually enforces) reflects current reality.**"*

### ⚠ NBA has exactly such a manifest
**`nba/worker_manifest_nba.json`** — created in T1, a **worker list** consumed by the deploy pipeline.
**By this warning it is a snapshot, not truth**, and it should be re-verified against the live
dispatch branch in `admin-sql` before being relied on.

**And the three-place wiring makes drift structurally possible**: a worker exists in the **manifest**,
the **bridge binding map + dispatch branch + tool enum**, and the **generator**. **Four surfaces that
must agree, with nothing asserting they do.**

### ⚠⚠ THIS WARNING APPLIES TO THIS DOCUMENTATION ITSELF
**`NBA_WORKERS.md`, `NBA_SYSTEM_DESIGN.md` and `NBA_DATABASE.md` are exactly the kind of
"official-looking, comprehensive mapping document"** this describes. **They are snapshots dated
2026-09-20.**

**The rule's own hierarchy of trust, applied here:**
| Source | Trust |
|---|---|
| **Live execution history** | highest — e.g. the differential logs being empty |
| **Live dispatch code / workflow files** | e.g. P1's actual step list, the recipe's `ROLE_TIERS` |
| **Database config tables** | ⚠ *"even database config tables can DRIFT from what the code actually enforces"* — **and `minutes_mixture` HAS** |
| **Static manifests and these documents** | lowest — snapshots |

**The `minutes_mixture` drift is this warning confirmed inside NBA**: the config table specifies three
components the code does not implement. **The config was trusted as describing the system; it
described the design.**

**Consequence for readers of these files**: entries marked **VERIFIED** (live SQL or a direct grep)
sit in the top two tiers. Everything else is a snapshot. *(See the confidence-tier header in
`NBA_OPEN_ITEMS.md`.)*

---

*Source: T1, blueprint §4m. Recorded 2026-09-20.*

### ⚠ A syntax validator will NOT catch JS embedded in a server-side template literal
> *"**A basic script-syntax validator WILL NOT CATCH AN ERROR IN CLIENT-SIDE JAVASCRIPT EMBEDDED
> INSIDE A SERVER-SIDE TEMPLATE LITERAL** — **that code needs to be EXTRACTED AND VALIDATED
> SEPARATELY**, since **a generic top-level syntax check treats THE WHOLE TEMPLATE LITERAL AS AN
> OPAQUE STRING.**"*

**Relevant wherever a Worker returns HTML or embeds a script** — the health-check and diagnostics
responses on `admin-sql` are that pattern. **A worker can deploy cleanly with broken embedded JS.**

### ⚠⚠ AFTER ANY RENAME, GREP THE WHOLE CODEBASE FOR THE OLD NAME
> *"**After renaming ANY shared constant or function, EXPLICITLY SEARCH THE WHOLE CODEBASE FOR THE OLD
> NAME BEFORE CONSIDERING THE RENAME COMPLETE** — **a reference to a renamed identifier LIVING INSIDE
> A STRING TEMPLATE WILL NOT FAIL UNTIL THAT SPECIFIC CODE PATH ACTUALLY EXECUTES AT RUNTIME**, not at
> deploy or parse time, **so a STALE REFERENCE CAN SIT INVISIBLE FOR A LONG TIME.**
> **MLB found SIX SUCH STALE REFERENCES IN A SINGLE SESSION, all traceable to THE SAME ROOT CAUSE.**"*

**Six from one rename**, each failing only on the path that uses it — **so the common path working
proves nothing**, the same property as the called-but-undefined-function risk (§4h).

**⚠ NBA is exposed through the PATCHER PATTERN specifically.** The production builders are **string
transformers** over the certified recipes — **any rename inside `classification_ladder_v12.py` is a
rename inside the patcher's search strings.**

**The record shows this failing and being caught by design:**
- *"The anchor check did exactly its job — **it failed loudly**"*
- *"**Verify all five anchors against the repo harness BEFORE re-triggering**"*
- *"The patch didn't apply (**third anchor mismatch**) — **that run was unchanged v17**"*

**The anchor assertions convert a silent stale reference into a loud failure. That is the mitigation
the rest of the codebase lacks.**

| Surface where an identifier lives in a string | Protected? |
|---|---|
| The patcher's anchor strings | ✅ **asserted** |
| `run_job`'s `target` enum ↔ bridge binding map ↔ generator | ⚠ **three places must agree** |
| `MARKET_TO_PROP` / `norm_market()` board keys | ⚠ string literals |
| `INJURY_MODE`, `BT_PROPS`, `GAP_SEASON` env names | ⚠ matched at runtime |
| Workflow `run:` lines naming scripts | ⚠ fails only when that step runs |

---

## 0e. ⚠ THE SCOPE-PARAMETER AUDIT — every mode/scope argument must constrain the WRITE, not the response
*Source: T1, `NBA_ARCHITECTURE_BLUEPRINT.md` **§7g**. Recorded 2026-09-20 (T1 pass 29) —
previously unswept.*

> *"MLB found a function whose **'which props to touch' input parameter correctly filtered its own
> RESPONSE SUMMARY, but the underlying WRITE LOGIC IGNORED THAT FILTER ENTIRELY** and touched every
> eligible row regardless — **invisible except by noticing unrelated timestamps had also updated.**"*

**The standing rule, stated for NBA directly:**
> *"**When adding any 'limit to these specific items' parameter to an NBA worker, VERIFY IT CONSTRAINS
> THE ACTUAL WRITE PATH, not just what gets echoed back in the response.**"*

**This document is the inventory of exactly the parameters at risk.** Every scoping env var recorded
in the tables below is a candidate:

| Worker / script | Scope parameters recorded here |
|---|---|
| `nba/build_final_hp.py` | `FE_SEASONS`, `FE_PROPS`, **`FE_DATE`** (*"scopes to one slate: seconds vs ~90 min"* — a large claimed selectivity) |
| `nba/backtest/classification_ladder_v12.py` and its patchers | `BT_REPLAY`, `BT_INJURY`, `BT_LADDER_STEPS`, `BT_SAVE_COMPONENTS`, `BT_TRAIN` / `BT_TEST` |
| `nba/certify_pipeline.py` | `PIPE=p1\|p2\|p3` |
| every static scraper | season / date-range arguments |
| every Cloudflare writer worker | the mode-dispatch branch it is invoked through |

**NOT RECORDED as audited — none of these has been checked against the §7g rule.**
**The cheap test is named in the source**: the detection signal was *unrelated timestamps also
updating*, so **a `SELECT max(updated_at)` on rows OUTSIDE the requested scope, before and after a
scoped run, settles it per worker.** Logged in `NBA_OPEN_ITEMS.md` → *FROM T1 PASS 29*.

**⚠ Why this matters more here than it did for MLB.** In MLB's instance the bug was *"not unsafe —
every write, filtered or not, passed the same validation gate."* **NBA's `FE_DATE` claim is a
performance claim (`seconds vs ~90 min`) as well as a scope claim**, so a write path ignoring it would
show up as a timing anomaly too — **but only if someone is watching the runtime.**

---

## 1. CLOUDFLARE WORKERS — Postgres writers
Pattern: read the GitHub-committed JSON → upsert into Postgres → log to `nba_control`.
They do **not** fetch from nba.com; they cannot (Cloudflare is blocked).

| Worker | job_key | Writes | Source file |
|---|---|---|---|
| `nba/alphadog-v2-nba-static-teams.js` | `nba-static-teams` | `nba_ref.teams`, `team_aliases` | `nba_teams_current.json` |
| `nba/alphadog-v2-nba-static-players.js` | `nba-static-players` | `nba_ref.players`, `player_aliases` | `nba_players_current.json` |
| `nba/alphadog-v2-nba-static-arenas.js` | `nba-static-arenas` | `nba_ref.arenas` | `nba_arenas_current.json` |
| `nba/alphadog-v2-nba-static-officials.js` | `nba-static-officials` | `nba_ref.officials` | `nba_officials_current.json` |

Each has `EXPECTED_VARS = [SYSTEM_ENV, SYSTEM_TIMEZONE, NBA_STATS_API_BASE_URL, WORKER_SAFE_MODE,
DEBUG_MODE]` and a `/debug-fetch` diagnostic route. Teams also carries a **certified static 30-team
fallback** with real stats.nba.com TEAM_IDs.

**`alphadog-v2-admin-sql.js`** (repo root, shared) — the MCP bridge. Every tool the assistant has.
**Touching it triggers a full-fleet redeploy.**

---

## 2. STATIC SCRAPERS — GitHub Actions, `nba/data/`
All use **`curl_cffi` with browser impersonation** except where noted.

| Script | Endpoint | Output |
|---|---|---|
| `scrape_nba_stats_teams.py` | `leaguestandingsv3` | `nba_teams_current.json` + `_meta` |
| `scrape_nba_stats_players.py` | `commonallplayers` | `nba_players_current.json` |
| `scrape_nba_stats_arenas.py` | **`teamdetails` → `TeamBackground`** | `nba_arenas_current.json` |
| `scrape_nba_officials.py` | **Wikipedia — plain `requests`** | `nba_officials_current.json` |
| `scrape_nba_player_bio.py` | `leaguedashplayerbiostats` | one call, whole league |
| `scrape_nba_player_tracking.py` | `leaguedashptstats` | one call |
| `scrape_nba_team_stats.py` | team stats | |
| `scrape_nba_onoff.py` | on/off splits | |
| `scrape_nba_playtypes.py` | `synergyplaytypes` | 3,364 player + 630 team |
| `scrape_nba_darko.py` | DARKO | SvelteKit hydration, 530/530 |
| `scrape_nba_shotquality.py` | shot quality | |
| `scrape_nba_schedule.py` | `scheduleleaguev2` | 2,666 games |
| `scrape_nba_periods.py` | quarter/half splits | |
| `scrape_nba_season_tables.py` | weekly as-of tables | pt_defend, hustle, clutch, coaches |
| `scrape_nba_matchups_pergame.py` | matchup shards | feeds M1 |
| `scrape_nba_injury_report.py` | NBA injury PDFs | **`INJURY_MODE`** = daily / probe / backfill |
| `scrape_referee_assignments.py` | referee assignments | ~6–7 AM PT |
| `scrape_nba_daily_delta.py` | bulk current-season | the delta |
| `scrape_nba_per_game_delta.py` | starters + officials | per new game |
| `sync_season_files_from_delta.py` | — | rebuilds season files |

---

## 3. BOARD SCRAPERS
| Script | App | Notes |
|---|---|---|
| `nba/scrape_prizepicks_nba_board.py` | PrizePicks | **`league_id=7`**, own env `PP_NBA_*`, output `boards/prizepicks_nba_current.json`. **Separate from MLB's `main.py`.** 4 candidate URLs; selects on **future-pickable rows**, not size. Live-tested: 192 projections, 104 demons / 52 goblins / 36 standard |
| `main.py` (root) | PrizePicks **MLB** | `league_id=2` hardcoded, output fixed. **Never use for NBA.** |
| `nba/scrape_underdog_board.py` | Underdog | `alternate_projections` = the full ladder with both sides' multipliers. `UNDERDOG_PXID`, `UNDERDOG_STATE_CONFIG`, `UNDERDOG_OUT_DIR`, `UNDERDOG_DEVICE_ID` |
| `nba/scrape_sleeper_board.py` | Sleeper | **`SLEEPER_SPORTS` defaults to `mlb,nba`** and **`SLEEPER_OUT_DIR` defaults to `.`** — both must be set |
| `nba/scrape_fliff_board.py` | Fliff | reverse-engineered from web bundles |
| Betr | Betr | bridge job, owner's Keycloak token |
| `nba/archive_live_boards.py` | all | normalises every app into `nba_market.board_snapshots`. **`ARCHIVE_LABEL` defaults to `routine`** — the decision pull must set `window` |

---

## 4. BASELINE ENGINE

### `nba/backtest/classification_ladder_v12.py` — THE CERTIFIED RECIPE *(now v18)*
**The single source of truth.** 60,176 bytes, 759 lines. Every production builder is a **patcher** over
it, with **anchor assertions** so a drifted patch fails loudly instead of writing silently.

**Constants** (full table and the calibration logic: see `NBA_BASELINE_CALIBRATION.md`):
`MAX_TIERS=24` · `MIN_PER_TIER=15` · `TIER_BLEND_K=5` · `LADDER_STEPS=6` ·
`BLOWOUT_MARGIN=20` / `COMPETITIVE_MARGIN=15` · `ROLE_TIERS` (6 bands) ·
`P_BLOWOUT_BINS=[0,2,4,6,8,10,12,15,99]` · `SHIFT_LAMBDA` per prop · `PLAYER_L0` **off (rejected)**.

**Env**: `BT_ASOF` · `BT_PROPS` · `BT_CUTOFF` · `BT_REPLAY` · `BT_INJURY` · `BT_LADDER_STEPS` ·
`BT_SAVE_COMPONENTS` · `BT_TRAIN`/`BT_TEST` · **`BT_CARRY` (default "1" — without it October produces
NOTHING)** · `BT_SHIFT_LAMBDA` · `BT_PLAYER_L0`.

### `nba/backtest/combos_ladder_v1.py`
Certified combos recipe — **its own `LADDER_STEPS`**. Joint simulation over calibrated marginals with
**per-player covariance**. **Requires `BT_SAVE_COMPONENTS=1` singles pickled first.**

### `nba/backtest/minutes_model_v1.py` *(T8)*
The first harness. Established the derived spread (r=0.46), `P(blowout|spread)`, the DataStreak
reproduction (5.4 vs 5.8) and team-specific starter pull (0.81 Orlando → 1.10 Dallas).

### `nba/backtest/bandfit.py` *(T8)* — the band-cell fitter.

### Production builders — the PATCHER PATTERN
> *"**The backtest harness on a PAST day is already the production computation** — every feature is
> `shift(1)`-based, so the only difference for today is the slate."*

| Script | Role |
|---|---|
| `nba/baseline/build_baseline_ladder.py` | patcher → today's slate. **Reproduces the ladder exactly** (173 players, 4,498 rows) |
| `nba/baseline/build_combos_ladder.py` | daily combos |
| `nba/baseline/build_periods_ladder.py` | daily periods |
| `nba/baseline/build_baseline_history.py` | season backfill (singles) |
| `nba/baseline/build_combos_history.py` · `build_periods_history.py` | season backfill |
| `nba/load_baseline_ladder.py` | **fetches over HTTP from the repo**; **refuses a singles-only slate** |
| `nba/load_baseline_history.py` | bulk history loader |
| `nba/nba_asof.py` | cutoffs — `PHASE1_CUTOFF_LOCAL = "16:00"` (1 PM PT) |
| `nba/nba_season.py` | **`current_season()` vs `active_stats_season()`** — the season-hardcoding fix; both honour `NBA_SEASON`. ⚠ Oct 1–2 edge case |

**A change must be applied to BOTH certified recipes** — singles and combos are separate files, each
with its own constants.

---

## 4b. CLOUDFLARE WRITER WORKERS BUILT T3–T9
All follow the same shape: **fetch the committed JSON from `raw.githubusercontent.com`** (never the
Contents API — it **silently returns empty above 1 MB**), **batched upsert through Hyperdrive**, run
summary to a `*_runs` table.

| Worker | Writes | Notes |
|---|---|---|
| `alphadog-v2-nba-static-players` / `-teams` / `-arenas` / `-officials` | `nba_ref.*` | the four-step wiring pattern |
| **the weekly differential worker** | `nba_stats.player_differential_log`, `nba_ref.team_differential_log`, `official_differential_log` + their 3 snapshot tables | **⚠ NEVER SCHEDULED.** Flagged unwired when built (T3); owner said *"leave like this for now"*; **P1 does not call it.** Verified empty 2026-09-20 |
| the measure-types writer | `player_game_log_usage` / `_scoring`, `team_game_log_four_factors` / `_scoring` | **`file_prefix`** input so one worker loads both backfill and delta files. Bug: the **team advanced table has no `usg_pct`/`reb_pct`** — the mapper wrote nonexistent columns |
| the starter-status writer | `player_game_starter_status` | **hardcoded `_2025_26`** until T7 — *"would silently keep loading last season's file in October."* `fetchFromGithubRaw` returns `{file, meta}`, so season is `.file.season` |
| the officials writer | `nba_stats.game_officials` | same season fix |
| the backfill worker | splits + career totals | gained a **`mode: "weekly"`** input — *"loads only those two in ~6 s instead of re-touching 79k rows"* |
| the daily-delta worker | game logs + **the DvP recompute** (210 rows = 30 × 7, current season) | **PRE-FLIGHT completeness check**: calendar Final count vs logged count, **`GAME_ID` prefix `002`**. Persists a **`known_empty_games` skip list** — without it the 3 permanently-empty games would be re-fetched *"every single day forever"* |
| **`alphadog-v2-nba-baseline-ladder` v0.1.0** | `nba_score.baseline_ladder` + `baseline_ladder_runs` | `POST /run {"asof":"YYYY-MM-DD"}`; idempotent on PK `(asof, player_id, game_id, prop, period, ot_rule, line)` |

**Registration is four edits**: bridge **binding map + direct-call list + tool enum**, plus the
**config generator** for the service binding. **NBA workers use DIRECT dispatch** (the
`BASE_HITTER_GAME_LOGS_WORKER` pattern), bypassing the queue — deliberate, per the no-orchestrator rule.
**⚠ Use NBA-specific binding names** — `DAILY_DELTA_RUNNER_WORKER` already exists as a shared/MLB
binding.

### ⚠ THE GENERATOR IS THE ONLY PLACE THAT PERSISTS
> *"**The GitHub workflow REGENERATES wrangler files before deploy, so this binding must live in the
> GENERATOR or it will be ERASED before Wrangler deploys.**"*

**Hand-edited `wrangler.json` changes do not survive a deploy.** Service bindings,
`compatibility_flags`, cron triggers and vars all belong in `generate_wrangler_configs.py`.
**This is why it is four edits, not three.**

### ⚠ THE NEVER-FIRE CRON IDIOM — and the platform gotcha that defeats it
```python
cfg["triggers"] = {"crons": ["0 0 30 2 *"]}   # February 30th — cannot occur
```
Used on **8 MLB workers** to **disable a schedule while keeping the worker deployed and callable**.
**Before concluding any worker is scheduled, check its cron for this pattern.**

**⚠⚠ BUT T1 RECORDS THAT THIS DOES NOT RELIABLY WORK:**
> *"**A specific, real Cloudflare Workers gotcha worth knowing in advance: A SCHEDULED CRON TRIGGER
> CAN PERSIST AND KEEP FIRING EVEN AFTER A SOURCE-LEVEL ATTEMPT TO RETIRE IT** — e.g. **setting an
> intentionally-invalid cron expression** — **MLB CONFIRMED THIS HAPPENING TWICE DESPITE A DEPLOYED
> FIX.**
> **If NBA hits the same platform behaviour, the RELIABLE FIX is to make THE SCHEDULED HANDLER ITSELF
> A GUARANTEED NO-OP (log and exit)** rather than continuing to fight the [platform]."*

**So the February-30th idiom is the *attempted* fix, and it was observed to fail twice.** The
**reliable** fix is a **no-op `scheduled()` handler**.

**Two consequences for auditing NBA:**
1. **A never-fire cron does not prove a worker is not running.** The only reliable evidence is
   whether the handler itself is a no-op, or observable writes.
2. **Conversely, a worker with a valid-looking cron may still be dormant** if its handler exits early.

**Directly relevant to the differential worker**: its schedule status was inferred from P1's workflow
steps and from empty tables. **Neither method is affected by this gotcha** — the tables are empty, so
it is genuinely not writing — **but any future "is this scheduled?" audit must check the handler, not
just the cron.**
| `nba/backtest/combos_ladder_v1.py` | the certified combos recipe — **its own `LADDER_STEPS`** |
| *(duplicate block removed 2026-09-20 — see §4 and §4b above)* |

**The patcher pattern:** production builders are string-transformers over the certified recipes, so the
certified file is never forked. A change must be applied to **both** recipes — singles and combos are
separate certified files each with its own constant.

---

## 5. SCORING ENGINE
| Script | Writes |
|---|---|
| `nba/build_final_hp.py` | `nba_score.final_hp` — the full chain. `FE_SEASONS`, `FE_PROPS`, `FE_WRITE`, **⚠ `FE_DATE` — see the warning below. It scopes the READ only.** |
| `nba/build_asof_calibration.py` | `ladder_calibration_asof` — weekly refits, strictly-before, prior-season inheritance |
| `nba/build_confidence_v3.py` | `confidence_model` — measured deductions |
| `nba/score_board_legs.py` | `nba_score.board_scored` — **board-scoped**, `MARKET_TO_PROP` mapping, log-odds interpolation for off-ladder rungs |
| `nba/build_availability_delta.py` | `availability_delta` — P2-view vs P3-view diff, minutes reallocation |
| `nba/build_board_tiers_v2.py` | `board_tiers_v2` — **four-way taxonomy** |
| `nba/build_blowout_model.py` | `blowout_model` — on the real market spread |
| `nba/build_rung_market.py` | `rung_market` — de-vigged book probability at DFS rungs, monthly blocks |
| `nba/export_market_spreads.py` | market spreads/totals |
| `nba/build_defender_ratings.py` | `nba_ref.defender_ratings` — two-way ridge |
| `nba/grade_board_outcomes.py` | `board_outcomes` — 6.9M legs |
| `nba/fit_n1_model.py` | availability model, AUC 0.630 |
| `nba/build_scenario_calibration.py` | `scenario_realised` — **no longer daily** |

---

## 6. VERIFIERS
| Script | Asserts |
|---|---|
| `nba/certify_pipeline.py` | per-pipeline artefacts present and fresh — **`PIPE=p1\|p2\|p3`**, exits non-zero |
| `nba/check_delta_gaps.py` | **no silent delta hole** — dates, games, both teams, roster rate, freshness |
| `nba/check_baseline_board_coverage.py` | board legs covered by the ladder |
| `nba/check_season_coverage.py` | season-wide coverage (89.6% of the real PP board) |
| `nba/find_delta_test_date.py` | finds dates that exercise the reallocation branch |
| `nba/measure_report_cutoff.py` | empirical cutoff measurement |
| `nba/run_storage_diet.py` | VACUUM + index audit, **row-count guards** |
| `nba/nba_names.py` | shared name resolution — `nba_ref.player_name_map`, 5,212 players |

---

## 7. WORKFLOWS
| Workflow | Trigger |
|---|---|
| `nba-p1-weekly-static.yml` | **cron Mondays 12:00 PT** |
| `nba-p2-overnight-heavy.yml` | dispatch (cron at season start: 01:00 PT) |
| `nba-p3-afternoon-light.yml` | dispatch (cron at season start: 1:15 PM PT) |
| `nba-boards-market.yml` | dispatch — own concurrency group, never queues behind MLB |
| `nba-engine-test.yml` | dispatch — **read-only, own queue**, so a 4-min test never waits on a 45-min write |
| `nba-scrape.yml` | push to `nba/TRIGGER_NBA_SCRAPE.txt` |
| `nba-probe.yml` | push to `nba/TRIGGER_NBA_PROBE.txt` (`script: <name>.py`) |
| `nba-baseline-history.yml` / `nba-combos-history.yml` / `nba-periods-history.yml` | dispatch, per prop pair per season |
| `nba-daily-delta.yml` · `nba-overnight-queue.yml` · `nba-season-tables.yml` | dispatch |

**Every workflow:** `persist-credentials: true`, **retry-with-rebase on push**, and **no
`|| echo failed`**.
</content>
</parameter>
<parameter name="message">docs: NBA workers - every worker, scraper and script