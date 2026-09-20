# NBA OPEN ITEMS — deferred, dropped, partial, bugs, caveats

## ⚠⚠ BLOCKER FOR THE OWNER · **the 20 transcripts are not in the repo, and this session cannot put them there**
*Recorded 2026-09-20 (T1 pass 40). **VERIFIED**: `nba/transcripts/` holds only `README.md` and
`journal.txt`.*

**From pass 37 onward these documents are written as POINTERS into the transcripts** — an assertion
of what is true plus a precise path to the source — rather than as copies of them. **That format is
only useful if the sources are reachable.** They are not:

- **`nba/transcripts/` contains no `.txt` files.** The 20 transcripts (55 MB) exist only in this
  session's sandbox, from the uploaded package.
- **This session cannot commit them.** `git push` to `Rodantmat/Alphadog` is refused by the
  environment's proxy — *"not in this session's authorized repository set"* — and the bridge's
  `github_put_file` must pass content through the model's context, which 2–3 MB per file makes
  impossible. **Cloning and reading work; writing binary-scale files does not.**

**What the owner needs to do**: commit the 20 `.txt` files to `nba/transcripts/` from a machine with
repo access (drag-and-drop into the GitHub web UI works, or `git add nba/transcripts/ && git push`),
**or** add this repository to the session's authorized set so `git push` works here.

**Until then, every pointer in these documents that names a transcript resolves to a file no other
reader can open.** Mitigations already applied:
- **Where a handoff document is the real source, the pointer cites THAT document and section** —
  `NBA_ARCHITECTURE_BLUEPRINT.md`, `NBA_LESSONS_LEARNED_FROM_MLB.md`,
  `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md`, `NBA_SYSTEM_DRAFT.md` — **all four are in the repo as
  clean markdown** and are far cheaper to read than the escaped copies inside T1.
- **Anything VERIFIED by live SQL or a code grep is stated in full**, because no transcript contains
  it and a pointer would point at nothing.
- **This file stays complete in itself** and is never reduced to pointers.

---

## ⚠ DEFECT-FOUND-AND-CORRECTED · **the summary ledger drifted four passes behind its own body**
*Found and corrected 2026-09-20, on the owner's instruction. Recorded rather than silently fixed,
because the discipline directly below requires it.*

**`NBA_MASTER_SUMMARY.md`'s transcript-inventory row for T1 read *"0/3 — ACTIVE. 29 passes. Pass 29
found new material in blueprint §7f, §7g, §9"* while the body of the same file carried entries
through §T1.63 (pass 33), including a confirmed destructive bug.** The header was **four passes
stale**, and it is the first thing a reader consults.

**This is the third recorded instance of the same defect class in this system:**
| # | Instance | Where |
|---|---|---|
| 1 | **`minutes_mixture`** — config specifies three components the recipe does not implement | this file |
| 2 | *"two files meant to be exact copies can silently drift out of sync, **with only the self-reported version string revealing the drift**"* | `NBA_SYSTEM_ARCHITECTURE.md` |
| 3 | **this ledger** — a header that no longer describes the content beneath it | `NBA_MASTER_SUMMARY.md` |

**And it is blueprint §9 failure mode #6** — *"silent config/formula drift… no error thrown; the
output is just silently wrong-but-plausible."* **A stale ledger is wrong-but-plausible in the most
expensive way available to this effort**: it is how a future session finishes against a wrong picture
of what remains. **The 16-vs-20 transcript-inventory error corrected the same morning was the same
defect with a different number.**

**The standing correction** — now **step 7b of the execution loop** in
`nba/NBA_DOCUMENTATION_PROMPT.md` and restated at the ledger itself: **a pass is not finished until
that transcript's row states the current clean count, the total passes run, what the latest pass
found, and the pass numbers of any consecutive clean run in progress. If row and body disagree, the
body is authoritative.**

---

## ⚠ DOCUMENTATION-GAP HONESTY DISCIPLINE
*Source: T1, blueprint §4l. Recorded 2026-09-20. Applies to THIS documentation effort.*

> *"MLB's own real-time working log had **a genuine, MULTI-WEEK GAP where it simply wasn't updated
> during a period of SUBSTANTIAL REAL WORK** — and **rather than LET THAT GAP SILENTLY IMPLY NOTHING
> HAPPENED, or RETROACTIVELY FABRICATE A CLEAN SUMMARY**, the team:
> **(a) EXPLICITLY, HONESTLY FLAGGED THE GAP IN THE LOG ITSELF**,
> **(b) POINTED TO THE RAW SESSION RECORDS that did exist for that period — with A SHORT INDEX /
> CATALOG DOCUMENT summarizing what each one covered, so A FUTURE READER COULD NAVIGATE THEM WITHOUT
> READING ALL OF THEM**, and
> **(c) STATED PLAINLY THAT THE POLISHED LOG ALONE SHOULD NOT BE ASSUMED TO REPRESENT CURRENT STATE
> for that window.**
> **Adopt the same honesty discipline for NBA's own project documentation: IF A PERIOD OF REAL WORK
> HAPPENS WITHOUT THE POLISHED REFERENCE DOCUMENTS BEING UPDATED, SAY SO EXPLICITLY IN THOSE DOCUMENTS
> rather than LETTING SILENCE IMPLY CONTINUITY THAT ISN'T THERE, and MAINTAIN AT LEAST A LIGHTWEIGHT
> INDEX of whatever raw records do exist.**"*

### This discipline governs the present effort, and one gap is already recorded
**The DRIFT NOTICE at the top of this file is exactly (a)** — T3–T9 were passed against four of eight
documents, and the counts were voided rather than left to imply completeness.

**(b) is satisfied structurally**: the sixteen transcripts are the raw records, and
`NBA_MASTER_SUMMARY.md` is the per-transcript index — *"separated by transcripts, so if you need more
detail, you know where to look"* (the owner's own instruction, which is this rule independently
arrived at).

**(c) is the one to state plainly, and it is stated here:**
> **These twelve documents do NOT yet represent complete coverage.** T1 alone has produced new
> material on every pass since the reset, and **no transcript currently holds three consecutive clean
> passes against all twelve documents.** **The raw transcripts remain authoritative** until each file
> is marked DONE with its clean-pass count.

### The pre-existing NBA equivalent
`nba/NBA_PROJECT_LOG.md` already carries a self-binding version of this rule: *"every session must add
an entry; **don't let this go stale silently**."* **T1's §4l is where that instruction comes from.**

---

*Added 2026-09-20, per T1 blueprint §4f.*

> *"**'I searched every worker file I could think of' is NOT the same as 'I searched everywhere real
> functionality could live.'** MLB found a real case where **a confident claim that 'no automated
> mining worker exists' WAS WRONG — the actual logic existed as AN INTERNAL STEP INSIDE A LARGER,
> DIFFERENTLY-NAMED RUNNER FILE, INVISIBLE TO A FILE-NAME-PATTERN SEARCH.**
> **Before concluding a piece of functionality doesn't exist, CHECK THE INTERNAL STEP LISTS OF LARGER
> RUNNER/ORCHESTRATOR-STYLE FILES TOO.**"*

**Many entries below say "not recorded as built" or "no X is recorded."** Those conclusions come from
**transcript reading plus targeted greps** — which is exactly the search the warning describes as
insufficient for a confident negative.

**Two tiers of confidence apply in this file:**
| Tier | Basis | Examples |
|---|---|---|
| **VERIFIED** | a direct grep of the actual file, or a live SQL query | *duds excluded not mixed* (0 grep matches in the recipe); *altitude 0/30*; *differential logs empty*; *P1's step list* |
| **NOT RECORDED** | absence from transcripts and targeted search | *no validation between grading and refit*; *no RSS*; *no magnitude check*; *no monotonic constraints* |

**Before acting on any NOT RECORDED entry, read the internal step list of the relevant runner** —
`build_asof_calibration.py`, `build_final_hp.py`, `grade_board_outcomes.py`, and the writer Workers'
`scheduled()` handlers. **The functionality may exist inside a differently-named file.**

---

## ⚠⚠⚠ BUG-OPEN · **`FE_DATE` SCOPES THE READ BUT NOT THE DELETE — ~19.5M ROWS OF `final_hp` ARE GONE**
*Found 2026-09-20 (T1 pass 33) by applying blueprint §7g's first named bug class to NBA's own scope
parameters. **VERIFIED by direct grep of `nba/build_final_hp.py` AND by live SQL against Postgres.***
**Not fixed, per the standing instruction. This is the highest-severity item in this file.**

### The code
`nba/build_final_hp.py` — the read is scoped by `FE_DATE`:
```sql
SELECT game_date, game_id, player_id, prop, line, anchor, ladder_offset,
       p_more, p_less, role_tier, used_emp
FROM nba_score.baseline_history
WHERE season=%s AND prop=%s
  AND (%s = '' OR game_date = NULLIF(%s,'')::date)      -- FE_DATE, FE_DATE
```
**and the write is not:**
```sql
SELECT pg_advisory_xact_lock(hashtext('nba_score.final_hp'));
DELETE FROM nba_score.final_hp WHERE season=%s AND prop=%s;   -- ⚠ NO game_date PREDICATE
INSERT INTO nba_score.final_hp (...) VALUES (...) ON CONFLICT ... DO UPDATE ...;
```

**So a run scoped to one slate deletes the ENTIRE season × prop partition and re-inserts only that
slate.** The advisory lock makes it atomic, so it completes cleanly and reports success.
**`FE_DATE` is a read filter whose name implies a write scope it does not have** — **blueprint §7g's
first bug class, exactly**, and **the blueprint's mitigating caveat does not apply here.** MLB's
instance was *"not unsafe in this specific case — every write, filtered or not, passed the same
validation gate."* **This one destroys data.**

### The damage, measured live 2026-09-20
| season | distinct dates | props | rows |
|---|---|---|---|
| 2024-25 | **162** | 30 | **19,075,070** |
| **2025-26** | **1** *(2026-01-15 only)* | 30 | **140,130** |
| **TOTAL LIVE** | 163 | 30 | **19,215,200** |

**The documented size of `nba_score.final_hp` is 38.7M rows.** **The live table holds 19,215,200.**
**19,075,070 of those are 2024-25**, which leaves **~19.6M rows that the 2025-26 season should hold
and does not.** **The arithmetic closes**: 19.07M + ~19.6M ≈ **38.7M**, the documented figure —
**so the 2025-26 partition was fully built once and is now a single slate.**

**Every one of the 30 props in 2025-26 holds exactly one date.** That is not a partial failure or a
half-finished build; **it is the precise signature of a `FE_DATE`-scoped run with `FE_WRITE=1`.**

### ✅ It is RECOVERABLE — verified
`build_final_hp.py` derives every column from `nba_score.baseline_history`, and **that table is
intact**: **VERIFIED — 2025-26 holds 163 distinct dates × 30 props.** **Re-running the engine for
2025-26 with `FE_DATE` blank and `FE_WRITE=1` rebuilds the partition.** The documented cost is
*"~90 minutes"* for a full-history run. **Nothing needs to be re-derived, re-scraped or re-fit.**
**No fix is applied here, per the instruction — this is recorded for the owner to act on.**

### ⚠ How it was triggered is NOT ESTABLISHED — flagged, not guessed
**VERIFIED**: the only caller in the repo that sets `FE_DATE` is
`.github/workflows/nba-engine-test.yml`, and **it sets `FE_WRITE: '0'`** — a dry run that cannot
write. **P3 does not call `build_final_hp.py` at all** (it scores through
`nba/score_board_legs.py`). **So no committed, wired path produces this.** The remaining
possibilities — a manual invocation from a Cowork session, an earlier version of a workflow, or a
different caller — **are not distinguishable from the evidence available and are NOT resolved here.**

### ⚠ AND A SECOND, SEPARATE DEFECT IN THE SAME PLACE: comment-vs-code drift
The comment above `FE_DATE` in `build_final_hp.py` reads:
> *"`FE_DATE` scopes the run to ONE slate. **P3 sets it** so the afternoon pipeline rescores only
> today's legs (seconds) instead of all 38.7M (~90 minutes)."*

**P3 does not set it, and P3 does not run this script.** **VERIFIED** — `build_final_hp` appears in
`nba-absence-panel.yml`, `nba-engine-test.yml` and `build_confidence_v3.py`, and **not** in
`nba-p3-afternoon-light.yml`, whose scoring step is `python nba/score_board_legs.py`.
**This is blueprint §9 failure mode #6 in miniature** — a description that documents an intended
architecture rather than the live one — and **`NBA_WORKERS.md` §5 inherited the same claim from the
comment.** Corrected there.
⚠ **The drift makes the bug more dangerous, not less**: the comment tells a future reader that a
`FE_DATE`-scoped write is the normal, intended daily path.

### ⚠ A third, minor observation in the same block
The `INSERT … ON CONFLICT (game_date, player_id, prop, line, side) DO UPDATE` follows a `DELETE` of
the whole season × prop partition, **so within a single run it can never fire** — after the delete no
conflicting row remains for that season, and the unique key's `game_date` determines the season.
**Defensive dead code, not a bug.** Recorded because it reads as a safety net that is not one — **it
does not protect against the delete above it.**

---

## FROM T1 PASS 43 — A STALE SCHEMA MANIFEST, AND NBA HAS NO SCHEMA FILES AT ALL *(added 2026-09-20)*
*Angle: the **repo-root file listing** returned by T1's `github_list_dir` (T1 lines ~5114–8800),
read as an inventory rather than as scenery, then **verified against the live clone**.*

### ⚠⚠ `schema_manifest.json` DESCRIBES A BACKEND THAT HAS NOT EXISTED SINCE 2026-08-12
**VERIFIED by reading the live file.** Its own header:
```json
"version": "alphadog-v2-schema-phase-pack-v0.1",
"date":    "2026-05-18",
"target":  "AlphaDog v2 new D1 databases only"
```
It names **11 D1 databases** — `CONTROL_DB, CONFIG_DB, REF_DB, STATS_HITTER_DB, STATS_PITCHER_DB,
TEAM_DB, DAILY_DB, MARKET_DB, CONTEXT_DB, SCORE_DB, ARCHIVE_DB` — and carries `apply_order` and
`expected_worker_count`. **D1 was fully decommissioned system-wide on 2026-08-12**
(`NBA_MASTER_SUMMARY.md` §T1.17). **The manifest is four months old and describes a dead
architecture.**

**And so do its eleven companion files**, all at the repo root, **133 KB in total**:
`schema_config_db.sql` **24,405 B** · `schema_team_db.sql` **24,286 B** ·
`schema_stats_pitcher_db.sql` **24,059 B** · `schema_stats_hitter_db.sql` **23,101 B** ·
`schema_daily_db.sql` **18,769 B** · `schema_market_db.sql` **5,654 B** ·
`schema_control_db.sql` **4,925 B** · `schema_ref_db.sql` **2,838 B** ·
`schema_score_db.sql` **2,336 B** · `schema_context_db.sql` **1,493 B** ·
`schema_archive_db.sql` **1,349 B**.

**Their DDL is SQLite/D1-flavoured and flat-named** — `schema_ref_db.sql` defines **`ref_teams`**
with `applied_at TEXT DEFAULT CURRENT_TIMESTAMP` — **not the Postgres `ref.teams` that actually
exists.** So they are wrong in **naming**, in **type system**, and in **target backend**.

**⚠⚠ This is blueprint §5b standing in the repository, verbatim**: *"static manifest/mapping files
can silently describe an earlier architecture, not the current one — a powerful, generalizable
warning."* **The warning NBA inherited has an instance sitting one directory above `nba/`.**

**⚠ And NBA was pointed at one of these files as a template.** `NBA_MASTER_SUMMARY.md` §T1.51 records
T1's own recommendation: *"look at the MLB static-teams worker as a structural template, and **check
`schema_ref_db.sql` for the full static-layer pattern**."* **`schema_ref_db.sql` is a D1-era file.**
**Whether that recommendation was acted on is NOT RECORDED.** The outcome suggests it was not
followed literally — NBA's tables are Postgres with real schemas (`nba_ref.teams`, not `nba_ref_teams`)
— **but the pointer was to a stale file and nothing in the record flags it as such.**

### ⚠ NBA HAS NO COMMITTED SCHEMA FILES — the asymmetry cuts both ways
**VERIFIED**: `ls nba/*.sql` returns **nothing**. MLB has **eleven** committed schema files (stale);
**NBA has zero.**

| | MLB | NBA |
|---|---|---|
| Committed DDL | 11 files, 133 KB | **none** |
| Currency | **stale since 2026-08-12** | n/a |
| Can be diffed against the live database | yes (and would fail) | **no — there is nothing to diff** |

**Nothing has gone stale because nothing was written.** But the cost is real and is the same cost
recorded elsewhere in this file: **blueprint §9's whole-universe comparison — *"diff the live config
against the real formula for every entry at once"* — has no NBA schema artefact to diff against.**
The live schema is the only record of itself. **`NBA_DATABASE.md` is the closest thing NBA has to a
schema file, and it is prose.**
**NOT RECORDED as a decision** — there is no entry saying NBA deliberately skipped committed DDL.

---

## FROM T1 PASS 42 — `NBA_PROJECT_LOG.md` IS MISSING ITS FOUNDING ENTRY *(added 2026-09-20)*
*Angle: diff the project-log entries **written during T1** against the repo's `NBA_PROJECT_LOG.md`
today. **VERIFIED by grep of both.***

### ⚠⚠ DOCUMENT DEFECT · **the first entry of the entire NBA project log does not exist in the repo**
T1 wrote **`## 2026-08-31 — Session: Phase 1 (recon) complete, operating model locked`**
(T1 lines **10511–10545**). **The repo's `NBA_PROJECT_LOG.md` does not contain it** — `grep -c
"Phase 1 (recon) complete"` returns **0**. The file's first dated entry is
**`## 2026-08-31 (cont'd)`**, at line 9. **A log that begins at "continued" is missing its first
page.**

**What is lost with it** — this is not a thin entry:
- **The canonical operating model**, recorded there as *"the canonical, binding spec for all future
  NBA sessions"* — the 3-run architecture, the no-orchestrator rule, the chat/worker granularity
  rule, the hard constraints, the research standard, and the UI decision.
- **The Phase-1 live verification**: 18 schemas named individually, *"zero NBA-anything exists
  anywhere yet — confirmed clean slate"*, `ref.teams` confirmed MLB-specific, **116 rows in
  `config.worker_definitions`**, the dead-stub `score-<prop>` workers still `enabled=1`.
- **The blueprint correction** that became the Phase-1 banner (the `sport`/`league` discriminator).
- **The ParlayAPI open gap**, stated with its reason — *"deliberately avoided (out of scope for
  read-only recon, risk of touching shared production job queue)."*
- **The per-worker rule in its fullest form**: *"Every new NBA chat should first study the equivalent
  live MLB worker, **research whether real improvements exist**, then build fresh with NBA sources —
  **not a blind port**."* **This is the clearest statement of the rule found anywhere** (cf. *PASS
  36*, where it is recorded from the owner's own message).
- **The tunables rule with its full list**: *"every tunable numeric variable (**bonuses, penalties,
  caps, timeouts, retries, chunk sizes**, etc.) lives in the database, never hardcoded, **so it's
  SQL-changeable without a deploy**"* — the rule *PASS 36* VERIFIED is not holding.

**Not fixed, per the standing instruction.** Recorded so the owner can restore it from T1.

### ⚠ The log violates its own stated ordering rule
`NBA_PROJECT_LOG.md`'s header states: *"**Newest entries at the top.**"*
**The file is oldest-first** — line 9 is 2026-08-31, and it runs forward through 09-01, 09-02, 09-03.
**And the tail is not in order either**: `## 2026-09-13 → 09-19` sits at **line 650**, ahead of
`## 2026-09-12` at **line 732** and `## 2026-09-12 (later)` at **line 789**.
**So the file is neither newest-first nor strictly chronological.** A reader following the stated
rule reads the oldest entry first and the newest in the middle. **Flagged, not fixed.**

### ⚠ The missing entry treats the assistant memory store as a source of record
It says: *"Operating model locked by the person, this session (**see `/areas/alphadog-nba.md` in
assistant memory for the full statement**)."*
**The canonical log entry points at a file outside version control** — the fourth store recorded at
*PASS 39*. **This is the concrete instance of the tension flagged there**: the owner's rule is
*"document everything into committed repository files"*, and the project log's founding entry
delegates *"the full statement"* to a file that is not one. **And that log entry is itself missing.**

---

## FROM T1 PASS 41 — THE PHASE-1 RECON, RE-RUN AGAINST THE LIVE DATABASE *(added 2026-09-20)*
*Angle: the **11 `run_sql_postgres` recon queries** T1 ran before writing any code — T1 lines
**1906–3424** — re-executed today to see whether their answers still hold. **Every figure below is
VERIFIED by live SQL 2026-09-20**, so it is stated in full rather than pointed at.*

### ✅ VERIFIED · **the MLB schema count is unchanged: 18, exactly what T1's recon returned**
T1's first recon query returned **18 non-system schemas** on **2026-08-31**. Live today: **18
non-NBA schemas, plus 14 NBA schemas, 32 total.** The NBA list matches `NBA_DATABASE.md` exactly:
`nba_archive, nba_backtest, nba_calendar, nba_classification, nba_config, nba_context, nba_control,
nba_daily, nba_market, nba_ref, nba_score, nba_scoring, nba_stats, nba_team`.

**This is the THIRD independent confirmation that the *"additive only, no MLB-system side effects"*
constraint held**, alongside the 116-row `config.worker_definitions` with 0 NBA rows (*PASS 35*).
**Twenty days and a complete NBA build added 14 schemas and changed none of MLB's 18.**

### ✅ VERIFIED · **the shared MLB board tables still contain ZERO NBA rows** — and this closes a recorded open question
| Shared table | `sport` | `league` | rows |
|---|---|---|---|
| `market.prizepicks_board_current` | *(no column)* | `mlb` | **8,720** |
| `market.sleeper_board_current` | `baseball_mlb` | `MLB` | **811** |
| `market.underdog_board_current` | `baseball_mlb` | `MLB` | **2,449** |

**One distinct sport/league value per table. No NBA row anywhere.**

**This resolves System Draft §5, open question 2** — recorded at *PASS 32* as part of the broken
Section 5 — which asked whether to *"reuse `market.sleeper_board_current` / `underdog_board_current`
(which already carry unused `sport`/`league` columns) filtered by sport, vs. new
`nba_market.sleeper_board_current`."* **Answered by observation: NBA built its own and never wrote a
row to the shared tables.** The question was never formally closed; **it is closed now, by
measurement rather than by decision record.**
⚠ **Note what this does NOT say**: the `sport`/`league` columns on the shared tables are **still
unused as discriminators** — they carry one value each. **The blueprint's Phase-1 banner correction
(*"a sport/league discriminator column DOES already exist"*) remains true and remains irrelevant**,
exactly as T1 predicted: *"the column existing doesn't mean the pipeline is sport-generic."*

### The recon procedure itself — reusable, and worth naming
Eleven queries in order: schemas → any `%nba%` table or schema → any `sport`/`league` column anywhere
→ the distinct values in those columns → `ref.teams` columns → `control` tables → `config` tables →
`config.worker_definitions` rows → its real columns → re-query with the corrected column.
**Full bodies: T1, lines 1906–3424.**
**The shape is the lesson**: *look for the thing, look for anything named like it, look for the
mechanism that would make sharing possible, then check whether that mechanism is actually used.*
⚠ **Query 8 used a column that does not exist** (`active`; the real column is `enabled`) — already
recorded in this file — and **queries 9–10 are the correction loop**: list the real columns, then
re-run. **The recon contains its own worked example of "verify the schema before trusting a query."**

---

## FROM T1 PASS 40 — THE REPO ITSELF, CHECKED AGAINST A LIVE CLONE *(added 2026-09-20)*

### ⚠⚠ REPO HAZARD · **`BACKUPS/` and `backups/` both exist at the repo root**
**VERIFIED on a live clone 2026-09-20.** `BACKUPS/` = 20 screenshot PNGs; `backups/` = one archived
MLB worker (`overdispersedTailGE_ORIGINAL_2026-07-29.js`). Two directories differing only in case.
**On Linux, two directories. On macOS or Windows — case-insensitive by default — a clone collapses
them**, producing a tree `git` reports as modified/deleted that a normal checkout cannot resolve.
**Costs nothing today; breaks the first time anyone clones this repo on a Mac.** Not fixed.

### ⚠ `gbdt_training/` is 28 files of dead code against a backend decommissioned 2026-08-12
**VERIFIED by grep of a live clone.** `gbdt_training/d1_client.py` is *"a **real D1 REST API
client** … pulls real historical data out of **each D1 database**."* **D1 was fully decommissioned
system-wide on 2026-08-12** (§T1.17). **Six MLB workers at the repo root still carry D1 bindings** —
`alphadog-v2-certification-center.js`, `alphadog-v2-static-prop-taxonomy.js`,
`alphadog-v2-phase3a-rbi-context.js`, `alphadog-v2-phase3a-first-inning-pitcher-context.js`,
`alphadog-v2-score-hits-allowed.js`, `alphadog-v2-phase3b-stolen-bases-context.js`.
**NBA must not touch any of it** — recorded because it is a **live, one-grep instance** of the two
warnings NBA inherited: blueprint §5b (*static manifests describing an earlier architecture*) and §6
(*registry entry ≠ real functionality*).

### ⚠⚠ T1's central discovery was PRIOR ART, already sitting in this repo
`gbdt_training/d1_client.py` states, before NBA existed:
> *"Runs inside GitHub Actions (**which has real network access, unlike Cloudflare Workers, which
> cannot train models at all — confirmed from Cloudflare's own docs**)."*

**The Cloudflare network constraint and GitHub Actions as its answer were already written down.**
T1 reached them through **four failed runs and thirteen polling sleeps**.
**The first measured cost of two gaps already recorded**: the owner's per-worker *"understand the MLB
functionality first"* rule (*PASS 36*) was followed for the **worker pattern** but not for the
**network constraint**; and the MLB source index (*PASS 37*) lists only `.md` files — **`gbdt_training/`
appears in no list of MLB material at all.** **The search space for "has MLB already solved this" was
never defined, and still is not.**

### ⚠ NOT RECORDED · workflow logs are unavailable in flight and expire afterwards
`github_get_workflow_run_log` returned **HTTP 404 — *"Could not fetch log text (link may have expired,
or run is too old)"*** for `run_id` **33429867514** while that run still reported `"conclusion":
null`. **Diagnose a failure while it is fresh, or from the job's step list rather than its log.**
A standing constraint on every future NBA debugging session.

### The run-ID audit trail — §T1.7's claim was previously unauditable
| Job | `run_id` | job id | conclusion |
|---|---|---|---|
| `deploy` | **33429867514** | 99612350869 | **failure** |
| `deploy` | **33431309511** | 99617046472 | ✅ **success** |
| `scrape-nba-teams` | **33444713366** | 99661055215 | **failure** |
| `scrape-nba-teams` | **33444861845** | 99661541226 | **failure** |
| `scrape-nba-teams` | **33445264412** | 99662814403 | **failure** |

### ⚠ REPO LAYOUT omitted seven root directories
`BACKUPS/` · `backups/` · `Screenshots/` (8 files) · `chat_history_backup/` · `control/` ·
`coworker/` · `gbdt_training/`. Added to `NBA_SYSTEM_ARCHITECTURE.md` §8.
⚠ **`chat_history_backup/` holds `2026-08-14-15-31-35-journal-session-catalog.txt`** — **the
session-catalog pattern `nba/transcripts/journal.txt` later followed**, never recorded as inherited.

---

## FROM T1 PASS 39 — WHAT THE SESSION PERSISTED OUTSIDE THE REPO *(added 2026-09-20)*

### ⚠ UNDOCUMENTED DEPENDENCY · an assistant memory store, outside version control, capped at 49,152 bytes
**VERIFIED from T1's own `memory_read`/`memory_write`/`memory_append` results.**
`/areas/alphadog.md` (MLB, **6,140 bytes**, updated **2026-08-30T04:48:04Z**, version `2c573cdc3a8d`)
and `/areas/alphadog-nba.md` (**created in T1**, 4,000 → **4,471 bytes**, versions `f53885f3abbf` →
`57ba0456b10c`). **Every write result states the cap: `of 49152 bytes`.** Writes are version-guarded
via `if_version`, so concurrent edits are detected rather than silently lost.
**A future session inherits NBA context from a file that is not in the repo, not covered by `git`, and
invisible to anyone reading the twelve documents.** Full entry: `NBA_SYSTEM_ARCHITECTURE.md` §8d.
**Flagged, not resolved**: whether the owner intends this store to be authoritative for anything;
what happens at the cap; and whether it is covered by the founding rule *"document everything into
committed repository files, not only into chat conversation"* — **it is neither a committed file nor
chat.**

### ⚠ NOT RECORDED · **the source hierarchy: nba.com is PRIMARY, BallDontLie is BACKUP**
The memory append written during T1 records the owner's position:
> *"[stated] provided a real **balldontlie.io API key** (stored securely in
> `nba_config.external_credentials`, **not in chat memory**) **as a BACKUP SOURCE**, but said **the
> data ideally should come from nba.com itself, just like the MLB system uses the official MLB Stats
> API**"*

The documents record that the key exists and that BallDontLie was used; **they never recorded that it
is explicitly subordinate to stats.nba.com by owner instruction.** That ordering is why the Cloudflare
block was a blocking problem rather than a reason to switch sources. **Second independent record of
the source mandate found at *PASS 36*.**

### ⚠ NOT RECORDED · the session had NO file-view tool for the remote repo
Both `view` calls in T1 target `/dev/null`; the second says why: *"peek needed lines via grep since
**no direct file view tool for remote repo**; use `github_get_file` range instead."*
**This is the provenance of the investigation methodology at `NBA_WORKERS.md` §0a** — it was **the
only option available**, not a chosen technique.

### The draft-then-commit workflow, rationale stated at the moment of decision
Both `create_file` calls wrote to `/home/claude/`, not the repo:
*"adapted from MLB `alphadog-v2-static-teams.js` pattern — **before committing to repo**"* and
*"NBA teams scraper script for GitHub Actions runner (**real network origin, not Cloudflare
Workers**)."* **The second is the whole Phase-1 architecture in nine words.**
⚠ Corroborates the per-worker mandate from *PASS 36*: the first worker was explicitly *"adapted from
MLB … pattern"* — **steps 1 and 3** of the owner's three-step rule. **Step 2, "research if any
improvement should be done," is not visible in the record.**

---

## FROM T1 PASS 38 — THE SESSION'S OWN EXECUTION SURFACE *(added 2026-09-20)*

### ⚠⚠ CORRECTION · `NBA_SYSTEM_DESIGN.md` §0.8 claimed blueprint §4o was followed. In T1 it was not.
**VERIFIED by extracting every `bash_tool` call in T1.** The session's entire local execution is
**two syntax checks, two `cat`s, and THIRTEEN polling sleeps** — `sleep 30, 40, 45, 50, 55, 60, 70,
90, 150, 240, 280, 290`, each `; echo done`, each waiting on a GitHub Actions run.
**§4o forbids exactly this**: *"do not sit there repeatedly polling or re-checking its status turn by
turn — that burns real attention and session budget for no benefit."*
**The owner interrupted it live** — owner message 6 of 15: *"**what is going on? what are these waits
for?**"*
**The cause is structural as well as behavioural**: T1 had **no way to await a run** —
`github_trigger_workflow` was absent from the session's tool list (§T1.17), so there was **no
completion signal, only a run list to re-read.** §0.8's contrary evidence comes from **later**
transcripts; **T1 is the counter-example.** Corrected in place.

### ⚠ NOT RECORDED · the pre-commit syntax gate is two-language
**VERIFIED** from T1's bash history: **`node --check <file>.js && echo SYNTAX_OK`** *and*
**`python3 -m py_compile <file>.py && echo SYNTAX_OK`**, both run immediately before the commit that
auto-deploys. `NBA_RECIPE.md` recorded only the `node --check` half.
**This is the only local verification before a push that deploys on push** — no staging environment
exists. It catches syntax only: **not a missing binding, not a wrong column name, not an unwired
dispatch branch.**

### ⚠ NOT RECORDED · the 30-team fallback's provenance carries a caveat
T1 searched *"NBA team relocation rename expansion team 2026 2027 season"* and concluded:
> *"the league still has exactly **30 teams with no expansion or relocations for 2026-27**, so it's
> **safe to hardcode that as the static fallback list**, though **I still shouldn't fully trust
> unofficial sources for expansion details**."*

**The caveat is the part that matters**: the check rests on **unofficial sources**, was made
**2026-08-31**, and is **NOT RECORDED as re-checked**. The fallback is what served the first
successful run (§T1.17: *"genuinely seeded and correct today, but via the fallback, not the live
API"*), so a franchise change before **2026-10-03** would propagate silently.

### The complete web-research inventory — seven queries, all of T1
`stats.nba.com API teams endpoint free public 2026` · `data.nba.net prod v1 teams.json public feed` ·
`NBA team relocation rename expansion team 2026 2027 season` · `nba_api python stats.nba.com required
headers Host Referer x-nba-stats-origin 2026` · `balldontlie.io API v1 players endpoint documentation
free tier rate limit pagination` · a search for the `workers.dev` hostname · a **fetch** of
`…/health` — **the call that hit `x-deny-reason: host_not_allowed`.**
Recorded in full because the owner's founding rule is *"deep online research is a must"*: **this is
what that produced in T1, and it is a short list.** Six of seven topics were already documented.

---

## FROM T1 PASS 37 — THE MLB SOURCE LIBRARY: 17 OF 23 DOCUMENTS CATALOGUED NOWHERE *(added 2026-09-20)*

### The provenance problem
**The twelve documents inherit hundreds of claims from an MLB document library they do not index.**
T1 names **23 distinct MLB-side `.md` files. Six appear anywhere in the twelve documents — all six
only in `NBA_MULTIPLIERS.md`. Seventeen appear nowhere.** Full index now at
`NBA_SYSTEM_ARCHITECTURE.md` §8c.

**Catalogued (6)**: `GOBLIN_DEMON_MECHANISM_EXPLAINED.md` · `MULTIPLIER_TABLES_MASTER.md` ·
`SIGNALS_TECHNIQUES_TRIED.md` · `HIGH_HIT_RATE_METHODOLOGY.md` · `MASTER_DELTA_SCRUTINY_GUIDE.md` ·
`GEMINI_USAGE_GUIDE.md` · `COWORKER_DAILY_SLIP_RESEARCH_PROMPT.md`

**Not catalogued (17)**: `ALPHADOG_DOS_AND_DONTS.md` · `ALPHADOG_SYSTEM_MAP.md` ·
`CALIBRATION_ENRICHMENT_AUDIT.md` · `CORE_LOGIC_CALIBRATION_DOSSIER.md` ·
`OUTCOME_ENGINE_AND_DOC_INDEX.md` · `FACTOR_CLASSIFICATION_CALIBRATION_DESIGN.md` ·
`FACTOR_REDESIGN_AND_QOC_FINDINGS.md` · `QUALITY_OF_CONTACT_METRICS_EXPANSION.md` ·
`HANDOFF_MASTER_SUMMARY.md` · `LIVING_LOG.md` · `claude-work-log.md` ·
`SESSION_2026-08-22_FULL_LOG.md` · `SESSION_2026-08-29_ENRICHMENT_CALIBRATION_LOG.md` ·
`ENRICHMENT_CALIBRATION_DOSSIER.md` · `ENRICHMENT_CALIBRATION_HANDOFF.md` ·
`THIS_CHAT_MULTIPLIER_STUDY_DOSSIER.md` · `GOBLIN_DEMON_MULTIPLIER_STUDY_DOSSIER.md` ·
`BACKTEST_LAYOUTS_AND_9AM_METHODOLOGY.md` · `ALPHADOG_REALIGNMENT.md` · `ALPHADOG_QUESTIONNAIRE.md` ·
`ALPHADOG_HANDOFF.md` · `ALPHADOG_HANDOFF_2026-08-26.md` · `ALPHADOG_SESSION_LOG.md`

**`ALPHADOG_DOS_AND_DONTS.md` and `ALPHADOG_SYSTEM_MAP.md` are the named sources of blueprint §7's
deploy gotchas and §6's system-self-knowledge warnings** — material these documents quote as
authoritative. **A reader who wants to check a transferred claim against its source has no index.**
This is the **document-index half of blueprint §4l's own honesty discipline**, built for the NBA side
and never for the MLB side.

### ⚠⚠ T1 names exactly what was never read, and gives an instruction that was not followed
> *"**~40%** of `ALPHADOG_DOS_AND_DONTS.md` and `ALPHADOG_SYSTEM_MAP.md` [remain unread] — **PARTS
> 3-5** of the former and **Sections 3-9** of the latter … **BEFORE WRITING ANY NBA-SPECIFIC CODE,
> skim what remains of** [both] **— every section actually read from both surfaced genuinely new,
> high-value material, so the unread middle sections likely do too.**"*

**NBA-specific code was written later in T1 itself.** **No document records a later read**, and the
repo blueprint carries no addendum from them. **This is the largest single named, sized, unread body
in the corpus**, and the estimate of its value is T1's own.
Also never read: `QUALITY_OF_CONTACT_METRICS_EXPANSION.md` (deliberately out of scope),
`FACTOR_REDESIGN_AND_QOC_FINDINGS.md`, and the mega-logs — **`HANDOFF_MASTER_SUMMARY.md` 208 KB,
`LIVING_LOG.md` 153 KB, `claude-work-log.md` 188 KB** — deprioritised on an **inherited assumption**
(*"the repo's own internal documentation index describes [them] as likely overlapping"*), **not a
check.**
⚠ **A counting error in the source, flagged not corrected**: the passage says *"**three** large
session-log-style files"* and lists **four**.

### ⚠ CORRECTION · a claim recorded at §T1.17 is falsified
§T1.17 records the in-session statement that `nba_config.system_settings` *"already holds your first
tunable variables (timeout, retry limit, chunk size, differential cadence) — **SQL-editable, no
hardcoding, as you required.**"*
**The table exists and holds those rows — true. "No hardcoding, as you required" — false.**
Pass 36 VERIFIED that **nothing reads `system_settings`** and that timeouts, retries and chunk sizes
are Python literals. **The requirement was reported satisfied on the strength of the table
EXISTING.** Same *declared done, never wired* shape as the weekly differential worker that is *"built
but never scheduled."* §T1.17 is annotated, not rewritten.

---

## FROM T1 PASS 36 — THE FOUNDING SPECIFICATION, RE-READ IN FULL, AND TESTED *(added 2026-09-20)*
*Angle: **the owner's own messages**, extracted from T1's 15 `Human:` blocks in full rather than in
excerpt — then each standing rule tested against the live code. Full entry:
`NBA_MASTER_SUMMARY.md` §T1.66.*

### ⚠⚠⚠ VERIFIED VIOLATION · **NO CODE READS ANY `nba_config` TUNABLE TABLE**

**The owner's founding rule, verbatim, from the first specification message:**
> *"**any future variable numbers must reside on the database, NOT HARD CODED** — any equation
> variables like, **bonus, penalties, caps**, for example, or **system variables like, TIMEOUTS,
> RETRIES, CHUNK SIZE**, for example, **so all these are EASILY CHANGED BY SQL COMMAND INSTEAD OF
> CODING AND DEPLOYS.**"*

**VERIFIED 2026-09-20 by grep of all 190 `.py`/`.js` files in `nba/` PLUS the MCP admin bridge
`alphadog-v2-admin-sql.js`:**

| Config table | Documented contents | Readers found in code |
|---|---|---|
| `nba_config.classification_config` | the ladder config, `BACKTEST-LOCKED` tag, `minutes_mixture` | **0** |
| `nba_config.factor_registry` | **67 rows** | **0** |
| `nba_config.factor_relevance` | **460 rows** | **0** |
| `nba_config.factor_profile_cells` | **35 rows** | **0** |
| `nba_config.external_credentials` | API keys | **12** — the only config table anything reads |

**The strings `classification_config`, `factor_registry`, `factor_relevance`, `factor_profile_cells`
and `minutes_mixture` appear ZERO times in the entire codebase.**

**And the system variables are hardcoded throughout**: `timeout=30` · `timeout=60` · `timeout=90` ·
`timeout=120` · `timeout=300` across the scrapers; retry counts as literal `range(3)`, `range(4)`,
`range(1, 3)`; batch and chunk sizes as Python constants. The certified recipe
`backtest/classification_ladder_v12.py` carries **its ladder steps, caps and thresholds as Python
constants**, not config rows.

**⚠ This REFRAMES the already-recorded `minutes_mixture` drift.** That item says *"config specifies
three components the recipe does not implement — config and code have drifted."* **The truth is
larger and simpler: there is no coupling to drift from.** The config table is not consulted by
anything. **`minutes_mixture` is not an inconsistency between two live things; it is one of four
tables that nothing reads.** *(The earlier entry is not deleted — it was correct about what it
observed and is superseded in its explanation, per the dating rule.)*

**⚠ And it defeats the rule's stated PURPOSE, which is operational, not stylistic.**
*"Easily changed by SQL command instead of coding and deploys"* matters **because the owner has no
terminal** — the assistant is the only interface to the database, repo and deploy pipeline
(`NBA_SYSTEM_ARCHITECTURE.md` §1a). **Changing a cap, a penalty or a scrape timeout today requires a
code edit, a commit and a deploy** — exactly the loop the rule was written to avoid.

### ⚠⚠ AND THE WHOLE-UNIVERSE COMPARISON WAS THEN RUN — **the config and the code DO disagree**
*Blueprint §9 technique 1, applied: diff the live config against the real formula for **every entry**
at once. **VERIFIED 2026-09-20** — live `SELECT` from `nba_config.stat_decay_config` (13 rows) against
the `PROPS` dict and `ROLE_TIERS` in `nba/backtest/classification_ladder_v12.py`.*

| stat | config `ewma_alpha` | code `alpha` | config `shrinkage_stabilization_games` | code `k_stab` |
|---|---|---|---|---|
| `pts_rate` → `points` | 0.12 | 0.12 ✅ | 25 | 25 ✅ |
| `reb_rate` → `rebounds` | 0.08 | 0.08 ✅ | 40 | 40 ✅ |
| `ast_rate` → `assists` | 0.15 | 0.15 ✅ | 20 | 20 ✅ |
| `fg3_pct` → `threes_made.pct_alpha` | 0.03 | 0.03 ✅ | 300 | *(no counterpart)* |
| **`blk_rate` → `blocks`** | **0.08** | **0.10** ❌ | 50 | 50 ✅ |
| **`stl_rate` → `steals`** | 0.10 | 0.10 ✅ | **60** | **125** ❌ |
| **`tov_rate` → `turnovers`** | **0.10** | **0.12** ❌ | **40** | **95** ❌ |
| **`fta_rate` → `fta`** | **0.10** | **0.12** ❌ | **30** | **40** ❌ |
| **`ft_pct` → `ftm.pct_alpha`** | **0.04** | **0.03** ❌ | 150 | *(no counterpart)* |
| **`fg3a_rate` → `fg3a`** | 0.12 | 0.12 ✅ | **25** | **20** ❌ |
| `minutes`, `fg_pct`, `usg_pct` | 0.20 / 0.06 / 0.15 | *not in this dict* | 10 / 120 / 15 | — |

**Seven of the ten mappable stats disagree on at least one parameter.** **Three disagree on the decay
rate itself** — blocks, turnovers and free-throw percentage.

**⚠ Because nothing reads the table, THE CODE VALUES ARE WHAT RUNS.** The config rows are a **stale
seed**, not a live setting. **The danger is precisely that they do not look stale**: `active = 1` on
all 13, and `NBA_DATABASE.md` calls this *"the single most important config table in the system."*
**A future edit of `blk_rate`'s alpha by SQL — exactly the workflow the owner's rule promises —
changes nothing and reports no error.**

**⚠ Two caveats on the mapping, stated rather than assumed (rule 1.6):**
1. **The join is by name and is an inference.** Config keys are **rates** (`pts_rate`); code keys are
   **props** (`points`). The pairing is the obvious one and no other is plausible, but **it is not
   declared anywhere in code or schema** — no foreign key, no comment, nothing.
2. **`shrinkage_stabilization_games` ↔ `k_stab` is likewise inferred from the names.** If they are not
   the same quantity, the four `k_stab` disagreements are not disagreements — **and the fact that this
   cannot be determined from either side is itself the finding.**

**Same result for `nba_config.role_tiers`.** `NBA_DATABASE.md` records *"exactly matching `ROLE_TIERS`
in `classification_ladder_v12.py` — **config and code agree, so the no-hardcoding rule holds here**."*
**The values do agree — VERIFIED.** **But the conclusion does not follow**: `ROLE_TIERS` is a
hardcoded Python list (`classification_ladder_v12.py` line 129) and **no code reads
`nba_config.role_tiers`.** **Agreement maintained by hand is not the no-hardcoding rule holding.**
*(That line is superseded here, not deleted — it was right about the values.)*

**What is NOT claimed here**: that the code's values are the wrong ones. The code carries dated
justifications for several of them (*"alpha raised 0.08 → 0.15"* for `oreb`, *"top-decile regression
13%"* for turnovers), so **the code looks like the evidence-updated side and the config like the
abandoned seed** — but **which side is intended is NOT ESTABLISHED, and it is exactly the kind of
question blueprint §9 says to put to a human rather than resolve by guessing.**
**Stated with the method's limits (rule 1.6)**: this is a text search of the current repo; it would
not catch a table name assembled at runtime from fragments, and `nba/data/` (mined JSON, no code) was
not searched.

### ⚠ NOT RECORDED · **the per-worker improvement-research mandate**
From the same founding message:
> *"**each new chat should look into the current MLB worker and understand the functionality,
> RESEARCH IF ANY IMPROVEMENT SHOULD BE DONE, then create with new nba sources.**"*

**A standing three-step build rule — read the MLB worker, research an improvement, then build NBA's
— and it appears in none of the twelve documents.** `NBA_RECIPE.md` records *"research is
mandatory"* generically; **this is specific, per worker, and bounded to the MLB counterpart.**
**Whether it was followed for each of the ~25 NBA workers is NOT RECORDED** — no worker entry cites
an MLB-counterpart review.

### ⚠ NOT RECORDED · the owner's own words on the MLB no-touch constraint
> *"**this chat and any chat coming from here must not edit anything from the mlb system.**"*

The documents carry the blueprint's *"additive only"* framing; **the owner's own, stronger phrasing —
binding on every descendant chat, not just T1 — was not recorded.** ✅ **VERIFIED HELD at pass 35**:
`config.worker_definitions` holds 116 rows, 0 NBA, unchanged since 2026-08-31.

### ⚠ NOT RECORDED · the source mandate that explains why the Cloudflare block was fatal
> *"**ideally all these data should be coming from nba.com just like the mlb api.**"* *(T1, owner)*

**This is why `stats.nba.com` being unreachable from Cloudflare was treated as a blocking problem
requiring a whole new scraping architecture, rather than a reason to pick another source.** The
documents record the block and the GitHub-Actions fix; **they do not record the constraint that made
substitution unacceptable.** It is also the owner-stated origin of blueprint §4i (*"check the sport's
own official API first"*) — **two independent sources, one rule.**

### ⚠ AMBIGUITY UNRESOLVED · *"we can do 2"*
Owner message 5, in full: *"you have access to all of it, **we can do 2**, if it doesnt change much
and does not affect the mlb universe, that is fine."* **What "2" refers to is not recoverable from
the owner's message alone** — it answers an enumerated question posed in the preceding assistant
turn. `NBA_MASTER_SUMMARY.md` already quotes the phrase; **what it selected is not established
anywhere.** **Flagged, not guessed.** The conditional attached to it — *"if it doesn't change much
and does not affect the MLB universe"* — is itself a standing constraint and is recorded as such.

---

## FROM T1 PASS 35 — NEGATIVE SPACE: WHAT T1 ASKED FOR AND NEVER GOT *(added 2026-09-20)*
*Angle: **what a section promises and never delivers.** Every forward reference, deferred decision and
"worth checking directly" in T1's four handoff documents, tested against the twelve documents and,
where possible, against the live system.*

### ✅ CLOSED · the blueprint's shared-queue contention question — **answered by live query**
**Blueprint §0 posed a concrete task**: *"does adding a second sport's worth of jobs to the existing
shared queue and scheduling system introduce any real contention or collision risk — **a genuine,
concrete thing worth checking directly against the live system before assuming it's fine.**"*

**It was never recorded as open.** The word *"contention"* appeared in **none of the twelve
documents** before this pass.

**Answered, VERIFIED 2026-09-20:** **the risk is structurally zero — NBA never joined the shared
queue.** NBA runs `nba_control.job_runs`, `nba_control.worker_run_log` and
`nba_config.worker_definitions`; **MLB's `config.worker_definitions` holds 116 rows, of which 0 are
NBA.** Full entry: `NBA_SYSTEM_ARCHITECTURE.md` §1a0.

### ⚠ CONTRADICTION · the blueprint said "don't build your own queue"; NBA built one
**Flagged, not resolved.** Blueprint §0 answers its own sub-question — *"should we build our own job
queue"* — **"(no)"**, citing §7e's *"hard-won lesson"* that duplicating shared plumbing *"just for
NBA is almost always the wrong move."* **The owner overruled it** (*"NBA gets its own everything"*,
§T1.3) **and the live system follows the owner.**

**The owner's decision is binding and is not in question.** What is recorded is that **the
blueprint's contrary recommendation was never explicitly closed out — it simply stopped being
followed**, and a future reader consulting the blueprint would find advice the system does not take.
**The isolation it bought is real**: it is the same isolation that makes
`startswith("alphadog-v2-nba-")` provably zero-impact on MLB.

### ✅ VERIFIED HELD · the "additive only, no MLB-system side effects" constraint
Stated in T1 and **never independently tested since**. **`config.worker_definitions` holds 116 rows
— the exact count T1's Phase 1 banner recorded on 2026-08-31 — and NBA's share is 0.** Twenty days
and a complete NBA build later, **the shared registry is untouched.** **VERIFIED 2026-09-20.**

---

## FROM T1 PASS 34 — EVERY DESTRUCTIVE STATEMENT IN THE CODEBASE, AUDITED *(added 2026-09-20)*
*Angle: pass 33 found one unscoped `DELETE` by auditing a **parameter**. This pass inverts it and
audits **every `DELETE` and `TRUNCATE` in all 190 `.py`/`.js` files** — **24 statements** — asking of
each whether its scope matches its caller's. Full inventory in `NBA_WORKERS.md` §8; delete semantics
per table in `NBA_DATABASE.md`. **VERIFIED by grep of the code and live SQL.***

### ⚠ HAZARD-LATENT · **`verify_confidence.py` deletes the WHOLE `confidence_verification` table**
**Four scripts write to `nba_score.confidence_verification`. Three scope their deletes to their own
partition. One does not.**

| Script | Its delete | Scoped? |
|---|---|---|
| `build_confidence_v3.py` | `DELETE … WHERE tier='v3'` *(twice)* | ✅ |
| `build_confidence_v2.py` | `DELETE … WHERE tier IN ('v2','high_vs_low')` | ✅ |
| `build_mondrian_confidence.py` | `DELETE … WHERE check_type='mondrian_quintile'` | ✅ |
| **`verify_confidence.py`** | **`DELETE FROM nba_score.confidence_verification`** | ❌ **whole table** |

**So running `verify_confidence.py` erases every other script's verification rows**, including the
ones **P2 writes nightly** via `build_confidence_v3.py`.

**VERIFIED it has not yet fired — and that the collision is real.** The live table holds **three
generations of rows coexisting**: `verify_confidence`'s own at **2026-09-17 18:16**, mondrian's at
**2026-09-17 23:31**, and v3's at **2026-09-20 03:30**. **The only reason the v3 and mondrian rows
survive is that the unscoped writer happens to have run first.** **The next `verify_confidence.py`
run deletes both sets.**

**It is wired**: `.github/workflows/nba-absence-panel.yml` runs it. **P2 does not** — P2 runs
`build_confidence_v3.py`, which is correctly scoped. **So this is a manual-run hazard, not a nightly
one**, which is why it has survived undetected.
⚠ **Note what the damage looks like**: not an error, just **a verification table that silently
contains only one script's view.** **Blueprint §9 failure mode #2** — *"a stable count that is wrong
in composition."*

### ⚠ LIVE CODE STILL RECREATES A TABLE THAT WAS DELIBERATELY DROPPED
**`nba_score.ladder_calibration` was dropped** as *"a parity violation"* and superseded by
`ladder_calibration_asof` — recorded in `NBA_DATABASE.md`. **VERIFIED it is gone**: it does not appear
in `information_schema.tables` for `nba_score` (2026-09-20).

**But `nba/calibrate_all_props.py` still does:**
```sql
CREATE TABLE IF NOT EXISTS nba_score.ladder_calibration (...);
DELETE FROM nba_score.ladder_calibration;
INSERT INTO nba_score.ladder_calibration ...;
```
**and it is still wired** — `nba-absence-panel.yml`, behind `allocator == '22'`, a manual input.
**Running it resurrects the dropped, parity-violating table**, repopulated by a fit that is
*"fitted on TRAIN season, applied to TEST season"* — **exactly the parity violation that caused the
drop** (`NBA_DAILY_PARITY §5`, *"no constant is carried between days"*).

**✅ Mitigating, VERIFIED**: **nothing reads it.** A grep of all 190 files finds **no `SELECT` from
`nba_score.ladder_calibration`** — the only other mentions are comments. So a resurrection today
**pollutes the schema without changing any number.** **The risk is that a future reader finds a
populated table with a plausible name and uses it.**
**Blueprint §9 failure mode #4** — *"a 'deactivated' correction still silently present, because the
deactivation didn't defeat the thing that brings it back."* **Here the deactivation was a `DROP`, and
a `CREATE TABLE IF NOT EXISTS` defeats it.**

### ⚠ A SECOND COMMENT-VS-CODE DRIFT IN `build_final_hp.py` — the same file as the pass-33 bug
Its docstring says the calibration correction comes from **`nba_score.ladder_calibration`**:
> *"3. **CALIBRATION CORRECTION `nba_score.ladder_calibration`** — a log-odds shift per (prop, phase,
> band, …)"*

**The code reads `nba_score.ladder_calibration_asof`** — VERIFIED by grep. **The docstring names a
table that no longer exists**, and names it as the source of the correction the engine applies.
**Two independent documentation drifts in one file**, the other being *"P3 sets it"* for `FE_DATE`.
⚠ **This is the file the whole final-scoring layer runs through.** Its header is the first thing a
future reader reads and **two of its structural claims are false.**

### ⚠ NOTHING REBUILDS `final_hp` — so the pass-33 loss is PERSISTENT
**VERIFIED by reading the workflow files**: `build_final_hp.py` is invoked by
**`nba-absence-panel.yml`** (`FE_WRITE` defaults `'0'`) and **`nba-engine-test.yml`**
(`FE_WRITE: '0'`) **and by no P-pipeline at all.** **P2 does not rebuild it. P3 does not rebuild
it.**

**Consequence**: the 2025-26 partition reduced to a single date **will stay that way until someone
runs the engine manually with `FE_WRITE=1` and `FE_DATE` blank.** No scheduled job will notice or
repair it, and **no certifier checks `final_hp`'s date coverage** — `certify_pipeline.py`'s P2 check
counts `confidence_model` rows, not `final_hp` dates.
⚠ **And `nba-absence-panel.yml` defaults `FE_SEASONS: '2025-26'`** — the damaged season — so the one
wired path that *could* rebuild it defaults to the right season and the wrong write flag.
**SEASON-START RELEVANT.**

### ✅ VERIFIED CORRECT — the counter-examples that prove the house convention
**`build_final_hp.py`'s unscoped delete is an anomaly, not a style.** Every other date-scoped writer
scopes its delete properly:

| Script | Delete | |
|---|---|---|
| `score_board_legs.py` | `DELETE … WHERE game_date = %s` | ✅ **the P3 scorer, correct** |
| `build_availability_delta.py` | `DELETE … WHERE game_date = %s` | ✅ |
| `build_rung_market.py` | `DELETE … WHERE game_date >= %(d0)s AND game_date < %(d1)s` | ✅ |
| `load_baseline_ladder.py` | `DELETE … WHERE asof = %s` *(both tables)* | ✅ |
| `load_baseline_history.py` | `DELETE … WHERE season = %s AND prop = ANY(%s)` | ✅ matches its full-season input |
| `gate_remaining_factors.py`, `fit_n1_model.py` | `DELETE … WHERE slice = '…'` | ✅ own partition only |

**This strengthens the pass-33 finding**: the codebase's convention is to scope a delete to exactly
what the run rewrites. **`build_final_hp.py` is the one place that does not.**

### ✅ INTENTIONAL WHOLE-TABLE REBUILDS — recorded so they are not re-flagged later
These delete everything **by design**, because each run recomputes the whole small table, and each has
a **single writer**: `blowout_model` (35 rows) · `scenario_calibration` · `conformal_confidence` ·
`confidence_model` · `ladder_calibration_asof` · `board_tiers_v2` (`TRUNCATE`) · and the three
`weekly_differential` snapshot tables (`player_roster_snapshot`, `team_roster_snapshot`,
`official_roster_snapshot`), whose replace-in-full semantics are the documented snapshot design.
**No action needed on any of these.**
⚠ **One caveat on `ladder_calibration_asof`**: a full-table rebuild every P2 run means **there is no
incremental history and no diff between last night's cells and tonight's.** That is the mechanism
blueprint §7f's *"mandatory human review before applying"* would need in order to review anything —
**you cannot review a change you cannot see.** Recorded against the §7f gap above.

---

## ⚠ SEASON-START CRITICAL — items that bite on or before 2026-10-03

### ⓪ GOOD NEWS FIRST — **the season-opening coverage problem is already SOLVED**
`classification_ladder_v12.py` carries **cross-season carryover** (*"season-opening study
2026-09-09"*). Without it, *"**the opening month has ZERO projections and November only 62%
coverage**"* — because within-season rates need 3 games and the minutes role needs 5.
**With it: October 85%, November 90%.** Minutes role and rate EWMA are carried at the player level, and
carried evidence counts as `CARRY_N` games at the boundary.
**Controlled by `BT_CARRY`, default `"1"`.** ⚠ **If a replay ever sets `BT_CARRY=0` and it is left
off, opening month produces nothing.** Worth an explicit assertion in the P2 certifier.

### ① THE DIFFERENTIAL WORKER HAS NOT RUN SINCE 2026-09-03
**Verified live 2026-09-20**: all three `*_differential_log` tables are **empty**;
`player_roster_snapshot` holds **582 rows frozen 17 days ago**.
**Nothing schedules it** — it was flagged unwired when built (T3), the owner said *"leave like this for
now"*, and `nba-p1-weekly-static.yml` does not call it.
**September–October is peak roster churn**: camp signings, two-way conversions, waivers, final cuts.
**Every one is exactly what this worker detects.**

**✅ AND THE FIX PATTERN ALREADY EXISTS ON THE MLB SIDE (T1):**
> *"`alphadog-v2-weekly-differential-runner` — **Native cron triggers for the Postgres weekly static
> differential (Monday 3am**, matching the existing `sched_static_weekly` convention)"*

**MLB runs its weekly differential on a native cron set in the generator.** Two routes for NBA:
**(a)** a native cron in `generate_wrangler_configs.py` (the MLB pattern), or
**(b)** a step in `nba-p1-weekly-static.yml` **after** the scrape+load steps.
**⚠ Whichever route, it must go through the generator** — *"the GitHub workflow regenerates wrangler
files before deploy, so this binding must live in the generator or it will be ERASED."*

**⚠ And check for the never-fire idiom first**: `crons: ["0 0 30 2 *"]` is **February 30th**, used on 8
MLB workers to disable a schedule while keeping the worker deployed. **A worker with that cron is not
scheduled, however it looks.**

### ② `active_stats_season()` returns a data-less season on Oct 1–2
`nba/nba_season.py` branches on `month >= 10` → current year. So on **2026-10-01 and 10-02** it returns
**2026-27**, which has **zero regular-season games** (opening night is **2026-10-03**). Preseason games
exist but carry `GAME_ID` prefix `001`, not `002`.
**A weekly scraper running in that window pulls empty aggregates and writes them, reporting success** —
the exact failure shape the utility was built to prevent (see the season-hardcoding fix below).
**Low impact** (P1 runs Mondays; 2026-10-01 is a Thursday) **but the fix is trivial**: the real opening
date is already in `nba_calendar.games`. **Not fixed — documentation pass.**

### BUG-FIXED (2026-09-08) · `stats_seasons` was anchored on the wrong season
Documented in the utility itself: the 3-season training list was *"built back from `current_season`
(2026-27) while the anchor was `active_stats_season` (2025-26)"* — **an off-by-one-season error that
would have silently trained on the wrong window.** Now anchored on `active_stats_season`.

### ③ Season hardcoding — FIXED, but the pattern recurs silently
**Every weekly scraper hardcoded `Season=2025-26`.** Confirmed universal across 6 scrapers checked
directly. *"On Oct 3, the whole weekly cycle would **SILENTLY KEEP PULLING LAST SEASON'S FROZEN DATA
WHILE REPORTING SUCCESS** — the most dangerous kind of failure."*
**Fixed with a shared `active_stats_season()` utility across 9 scrapers**, all syntax-checked before
shipping. **Verified live 2026-09-20 in `scrape_nba_player_bio.py`.**
**Kept here because any NEW scraper written without the utility reintroduces it, invisibly.**

### ④ New players are invisible to derived tables until the weekly roster scrape
*"Won't exist in `nba_ref.players` until the weekly players scrape; game logs still insert fine (**no
FK**), but **position-dependent derived tables silently skip them**."*
**Acute in October**, when rookies and new signings are most numerous — and compounded by ① above,
since the differential worker is what would flag them.

### ⑤ P3's trigger is fixed at 1:15 PM PT; the design called for dynamic
Breaks on early-tip days (noon/1 PM ET starts = 9/10 AM PT). Detail under "FROM T4".
**The NBA's opening week and every holiday slate include early tips.**

### ⑥ **THE PUBLISHING-LAG GRACE WINDOW WAS PROPOSED AND NEVER BUILT**
T7 reasoned this through completely, then left it as a judgment call:
> *"the calendar can mark a game **Final before the bulk stats endpoint has it** (advanced stats lag
> **~15 minutes**). If the delta runs in that window, the completeness check will **correctly flag a
> 'missing' game that simply isn't published yet. That's the check working, not failing.**"*
> *"I **could build the defensive handling now** — the completeness check treating a game as 'expected'
> **only after a grace window past its scheduled end**, so a run that lands in the publishing gap
> **doesn't cry wolf**… rather than discover it in October."*
> *"real data is the only true **confirmation**, but it shouldn't be the only **preparation**."*

**Why it is tighter now than when written:** that reasoning assumed the **6am ET** operating window,
chosen as a *"4-hour safety buffer"* against the worst-case ~1:45am ET finish (T4.12f).
**P2's planned cron is 01:00 PT = 04:00 ET — two hours tighter.** A West-Coast double-overtime game
finishing ~1:45am ET publishes ~2:00am ET, so P2 still clears it — but with **2 hours of margin
instead of 4**, and any late finish plus a publishing delay lands inside the gap.

**What happens when it fires**: `check_delta_gaps.py` **fails the P2 job loudly** — correct for a real
hole, a false alarm for a publishing lag. **The two are indistinguishable without a grace window**, and
the right response to each is opposite (investigate vs. just re-run later). **An unattended pipeline
that cries wolf in week one is one people stop trusting.**

**The fix is small and already specified**: treat a game as expected only after
`scheduled_end + grace`, grace ≥ 30 min. The schedule already carries tip times (2,666 games).

### STILL OPEN from T7's gap table — recurring refresh
| Gap | Status |
|---|---|
| **Splits + career totals** | ✅ **CLOSED in T7** — put on a recurring path via a `mode` input on the existing backfill worker (not a new worker), season read from the scraper meta, both added to the weekly cycle workflow |
| **Defence-vs-Position** | ✅ **CLOSED in T7** — the recompute SQL was placed inside the delta worker, before `sql.end()` |
| **Starter-status + officials for NEW games** | ✅ `scrape_nba_per_game_delta.py` does this |

**All three T7 recurring-path gaps are closed.** ⚠ **But verify they are in `nba-p1-weekly-static.yml`
as built 2026-09-20.**

### ⚠⚠ VERIFIED 2026-09-20 — **P1 DROPPED THREE THINGS IN THE REBUILD**

`nba-p1-weekly-static.yml` runs exactly: teams · arenas · players · bio · weekly as-of season tables ·
team stats · on/off · playtypes · player tracking · DARKO · shot quality · defender ratings ·
static context (coach changes) · commit · certify.

**Not present, and each was on a recurring path before the rebuild:**
| Dropped | Was |
|---|---|
| **The weekly differential worker** | unwired since T3 — see ① above |
| **`scrape_nba_splits.py`** | added to the weekly cycle in T7 |
| **Career totals** | added to the weekly cycle in T7 (`mode` input on the backfill worker) |

*(The DvP recompute is fine — T7 placed it inside the **delta** worker, so it lives on P2's path, not
P1's.)*

**Consequence**: splits and career totals go stale from opening night — they are **cumulative
aggregates**, so a 2025-26 snapshot becomes steadily more wrong as 2026-27 progresses. `days_rest`
(→ factor A4) and `location` are among them.

### ⚠⚠ AND A LARGER QUESTION THE SAME CHECK RAISED — **do the pipelines load anything into Postgres?**

**VERIFIED 2026-09-20 across both workflow files:**

| Pipeline | Steps touching Postgres |
|---|---|
| **P1 weekly static** | `build_defender_ratings.py` · `build_static_context.py` · the certifier. **Nothing else.** |
| **P2 overnight heavy** | `check_delta_gaps.py` (reads) · `grade_board_outcomes.py` · `export_market_spreads.py` · **`load_baseline_ladder.py`** · calibration/confidence refits · the certifier |

**`load_baseline_ladder.py` is the ONLY loader in either pipeline, and it loads only the baseline
ladder artefact.**

**There is no load step for:** teams · players · bio · arenas · season tables · team stats · on/off ·
playtypes · tracking · DARKO · shot quality · **player game logs** · **starter status** ·
**officials** · splits · career totals.

**All of these have Postgres writer Workers** — built T1–T6, registered in
`nba_config.worker_definitions`, wired through admin-sql. **Nothing in P1 or P2 invokes any of them.**

**Two readings:**
1. **Benign** — the writer Workers carry their own cron triggers, or a Coworker scheduled task calls
   them (which is the T1 operating model: *"each run triggered by a Claude Coworker scheduled task"*).
2. **Not benign** — the pipelines refresh committed JSON and **Postgres never sees it**, leaving every
   `nba_ref`/`nba_stats` table frozen at whatever the last manual `run_job` wrote.

**Reading 1 is plausible and consistent with the original no-orchestrator design** — the pipelines
mine and commit; Coworker triggers the writers. **But nothing in the workflows documents that
handoff**, and an unattended P2 at 01:00 PT would then depend on a separate trigger firing between
P2's commit and P3's 1:15 PM scoring.

**→ THE SINGLE MOST IMPORTANT PRE-SEASON VERIFICATION.** Either confirm the writer Workers are
scheduled, or add explicit load steps to P1 and P2. **One counter-check settles it**: if
`nba_stats.player_game_log` gains rows after opening night without a manual trigger, reading 1 holds.

---

**Purpose.** Everything that is NOT finished, NOT shipped, or NOT to be trusted at face value, plus
every bug and error found along the way. Nothing here is fixed by the documentation pass — it is
recorded so it can be fixed deliberately afterwards.

**Status vocabulary**
| Status | Meaning |
|---|---|
| `DEFERRED` | intentionally postponed, will be done |
| `DROPPED` | decided against, will NOT be done |
| `PARTIAL` | built but incomplete |
| `BLOCKED` | cannot proceed without something external |
| `CAVEAT` | works, but has a condition you must know |
| `BUG-FIXED` | a real defect found and fixed — kept because the pattern recurs |
| `BUG-OPEN` | a real defect found and NOT yet fixed |

Every entry carries the transcript it came from and the date it was added here.

---

## FROM T1 — `2026-09-03-03-22-04-nba-expansion-phase1-static.txt`
*added 2026-09-20*

### BLOCKED-PERMANENT · Cloudflare Workers cannot reach nba.com
Every domain in the family — `stats.nba.com`, `cdn.nba.com`, `core-api.nba.com`, `data.nba.net` —
fails identically from Cloudflare Workers. Proven with a read-only multi-endpoint probe, not assumed.
**This is why every NBA scrape runs on GitHub Actions instead.** Not fixable; it is the architecture.

### CAVEAT · plain `requests` is TLS-fingerprinted and tarpitted
Three consecutive timeouts (not rejections — silent hangs). A proxy did NOT help, which ruled out IP
blocking and pointed at TLS fingerprinting. **`curl_cffi` with browser impersonation is mandatory** for
every NBA scraper. Any new scraper written with plain `requests` or `urllib` will hang.

### CAVEAT · a new MCP tool cannot be used in the session that creates it
`github_trigger_workflow` was added to `alphadog-v2-admin-sql.js` and deployed, but the conversation's
tool list is fixed at session start, so it was unusable that session — and a reconnect did not help.
**Workaround in use: file-based workflow triggers** (`nba/TRIGGER_NBA_SCRAPE.txt`,
`nba/TRIGGER_NBA_PROBE.txt`), which need no new tool.

### BUG-FIXED · `abbreviation` empty for all 30 teams
The first successful scrape returned blank abbreviations because `TeamAbbreviation` is not in that
endpoint's actual response. Caught by verifying the committed file rather than the scraper's own meta
claim. **Pattern: always verify the artefact, never the success report.**

### BUG-FIXED · deploy path bug on the first NBA worker
First deploy of `alphadog-v2-nba-static-teams` failed on a path error in the patched
`generate_wrangler_configs.py`; fixed and redeployed clean.

### CAVEAT · balldontlie is a fallback, not the source
`balldontlie_api_key` is stored in `nba_config.external_credentials`, but the owner's stated preference
is that data come from nba.com itself, as MLB's does. Treat balldontlie as contingency only.

---

## FROM T1 PASS 32 — THE LOCKED CADENCE, AND A BROKEN SECTION IN A LIVE REPO FILE *(added 2026-09-20)*
*Source: T1, `NBA_SYSTEM_DRAFT.md` §4b and §5. Full text at `NBA_SYSTEM_DESIGN.md` §0.95 and
`NBA_MASTER_SUMMARY.md` §T1.62.*

### ⚠⚠ DOCUMENT DEFECT · **`nba/NBA_SYSTEM_DRAFT.md` has a broken, duplicated Section 5**
**VERIFIED by direct comparison of the repo file against T1's pasted copy, 2026-09-20.**

**In T1** the document runs `§1 · §2 · §3 · §4 · §5 Open questions — explicit, not silently decided ·
§6 Immediate next step`, with **six numbered open questions** under §5.

**In the repo file today** it runs `§1 · §2 · §3 · §4 · §4b · §6`. **There is no `## 5.` heading at
all** — and yet **the list is still there**, dangling under §4b, in this state:
- items **1, 2, 3, 4** rewritten as **`ANSWERED (2026-08-31)`**, then
- items **3, 4, 5, 6** — **the ORIGINAL, un-answered text of the same list, still present, still
  numbered 3–6.**

**So items 3 and 4 appear twice, in two different states, under no heading.** A reader arriving at
`NBA_SYSTEM_DRAFT.md` today sees a numbered list that runs **1, 2, 3, 4, 3, 4, 5, 6** with no
section title.

**What appears to have happened** — *stated as inference, flagged not resolved*: §4b was inserted
2026-09-03, four of the six open questions were answered in place on 2026-08-31, and **the `## 5.`
heading was lost in one of those edits while the original items 3–6 were never removed.**
**NOT FIXED, per the standing instruction.** **This is blueprint §9 failure mode #3 in documentation
form** — stale evidence from an earlier state surviving alongside the new state, with nothing
erroring.

**⚠ And two of the four ANSWERED items are answered with expectations, not verifications** —
*"the person states ParlayAPI should have real backdata… **still needs a real, direct test (not yet
performed)** before being trusted as more than a stated expectation."* **ParlayAPI was never verified;
it was superseded** (`NBA_SYSTEM_ARCHITECTURE.md`). **The open question was closed by replacement, and
the file still reads as though it were closed by answer.**

### ⚠ NOT BUILT · **the optional second master run**
§4b specifies the master run as *"once, **sometimes twice a day**… an **optional second run later
'only if needed'** — e.g. **a late injury designation change or significant line movement after the
first run**."*

**P3 (`NBA_SYSTEM_DESIGN.md` §4) documents one run, with a cutoff, and no second-run path.**
**Neither trigger condition has a detector**: nothing watches for a designation change after 1:15 PM
PT, and nothing watches for line movement.
**The cost objection does not apply.** §4's own reasoning — *"the refit uses only games strictly
before today, so **it is identical at 1 AM and 1:15 PM**"* — means **a second run costs the board
scrape, the availability delta and the scoring, not the refit.** And §4b states this is precisely what
the two-stage baseline/enrichment separation was designed to make possible.
**SEASON-START RELEVANT** — a star ruled out at 5 PM on a 7 PM tip is the exact case, and the system
would carry a 1:15 PM view of him into the night.

### ⚠ NOT BUILT · **the dynamic master-run trigger**, and a structural conflict with the cutoff
§4b: *"this trigger time **must be computed dynamically** from **today's earliest `game_datetime_utc`
minus 2 hours** — **not a hardcoded time-of-day.**"* **P3 ships a fixed `15 21 * * *`.**
`NBA_SYSTEM_DESIGN.md` §0.7 already flags this as *"breaks on early-tip days."*

**What this pass adds**: **the input exists.** `nba_calendar.games` holds **2,666 games** and carries
`game_datetime_utc`. **Nothing was missing but the implementation.**
⚠ **And the two rules genuinely conflict on early-tip days** — this is not a defect in either:
- **§1's cutoff** is a LOWER bound: *Pacific clubs file their injury report last, by 1:00 PM PT*, so
  **P3 refuses to run for today before 13:00 PT.**
- **§4b's rule** is an UPPER bound: **first tip minus 2 hours.**
- On a day whose earliest tip is **before 3:00 PM PT**, the upper bound falls below the lower bound
  and **no time satisfies both.** **Flagged, not resolved** — the resolution is a product decision
  (run late and incomplete, or run early and miss Pacific filings).

### ⚠ CONSTRAINT RECORDED · the physical floor under the overnight run
§4b derives ~11:00 AM from *"**~2:00am ET latest-possible-game-end + 10–15 min data-finalization
window** — confirmed via **research and Gemini consultation on 2026-09-03**."*
**P2 ships at 01:00 PT = 04:00 ET**, clearing it by ~2 hours. **The shipped time is safe; the margin
is much thinner than the specified one.** Recorded because **this is the number any future re-timing
of P2 must respect**, and it was previously only implicit.

### ⚠ AMBIGUITY · what "no cron/orchestrator automation" actually forbids
§4b: *"these times are the real, intended **Claude Coworker-scheduled-task** trigger times… **not
in-code scheduling logic to be built into any NBA worker.**"*
**The rule is "no worker schedules itself," not "nothing is scheduled."** **P1 already carries a
GitHub Actions cron** (`0 19 * * 1`). **Whether a workflow cron counts as "in-code scheduling logic"
is not stated anywhere.** **Flagged, not resolved** — it bears directly on whether P2 and P3 may
simply be given crons before **2026-10-03**.

---

## FROM T1 PASS 31 — THE OPERATING MODEL AND THE NON-GOALS *(added 2026-09-20)*
*`NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` **§7 was entirely undocumented** across all twelve
documents; **§6** existed only as scattered facts, never as the instruction list it is. Full text at
`NBA_MASTER_SUMMARY.md` §T1.61.*

### ⚠ NEVER PRODUCED · **the day-by-day report layout the owner explicitly specified**
§7 gives the exact table *"they expect for **any** backtest or real-slip report — **reuse directly for
NBA**"*: `Date · Slips · Full hits · 5/6 · ≤4/6 · Staked · Return · Profit · ROI`, **$1/slip**, **total
row bolded**, **partial-hit columns explicit** *"so the actual failure mode stays visible rather than
being collapsed into a single win/loss count."*

**It has never been produced for NBA**, and the reason is a data gap, not an oversight: there is **no
NBA slip history**. `nba_score.real_slip_leg_observations` holds **139 legs**, not dated slips with
outcomes. **NOT RECORDED as built.**
⚠ **The `5/6` and `≤4/6` columns are the empirical Flex partial-tier distribution** — the thing lesson
#27 (pass 30) says must be verified per platform. **So the missing report and the unverified partial
tiers are the same gap**: the report is the instrument that would measure them.
**And §7 states the layout is owed *"before being asked, every time a finding is reported."***

### ⚠ UNVERIFIED · **the three standing UI rules, against an inherited UI**
§7's standing product rules, *"apply the same defaults for any NBA-side interface"*:
1. **every deployed strategy needs a real backup-leg substitution system**
2. **slip-leg checkboxes default to CHECKED**
3. **a manually-entered multiplier value must NEVER be lost or reset on a UI re-render**

The certification center is **inherited from MLB** and recorded as *"already exists… **nothing to
build**."* **Whether it satisfies these three for NBA legs is NOT RECORDED — never checked.**
⚠ **Rule 3 is the highest-stakes of the three here.** PrizePicks multipliers are **ruled out
programmatically, exhaustively** (`NBA_MULTIPLIERS.md` §2), so **every one in the system is
hand-typed** and **no API can re-fetch it.** A re-render bug destroys data that cost a logged-in
browser session to obtain.

### ⚠ NON-GOAL 3 HAS EXPIRED — and the pipelines are still unscheduled
§6's third non-goal: *"**don't invest in an elaborate auto-scheduling orchestrator BEFORE the manual
pipeline works end-to-end and has been verified against real data at least once.**"*

**This is a sequencing rule, not a permanent ban**, and it is **the reason P2 and P3 were never given
a cron** — correctly, at the time. **P2 and P3 still have no cron** (`NBA_SYSTEM_DESIGN.md` §3, §4)
with the season opening **2026-10-03**. **SEASON-START CRITICAL.** The question the non-goal poses is
now answerable and **has not been asked**: *has the manual pipeline run end-to-end and been verified
against real data at least once?* **Until that is answered, whether the non-goal still binds is
undetermined — flagged, not resolved.**

### ⚠ CONTRADICTION-ADJACENT · two rules that must not be collapsed
§7 states **both**:
- the report layout uses **one dollar per slip** as its reporting convention, **and**
- *"**always normalize by CAPITAL DEPLOYED, not by slip or leg count**"* — from a **real, confirmed**
  push-back where *"comparing profit at a fixed dollar-per-slip rate when capital deployed… was the
  actual real-world constraint"* was the error.

**These are not in conflict, but they read as if they were**, and the push-back shows the confusion is
one that actually happened. **Recorded so the next reader does not resolve it by picking one**: the
$1 convention makes the table readable; the capital-deployed rule governs what any **comparison
between strategies** is divided by. **Identify what is genuinely fixed in the real scenario first.**

### ⚠ A STANDING RULE THE DOCUMENTATION EFFORT ITSELF INHERITS
> *"**Document everything into committed repository files, not only into chat conversation** — this
> whole NBA transfer package is itself a direct expression of that same standing instruction, and
> **the practice should continue throughout NBA's own build, NOT JUST AT THE OUTSET.**"*

**This is the origin of the twelve-document mandate**, stated in T1 before any NBA code existed.
Recorded here because it makes the **"not just at the outset"** clause an open, standing obligation
rather than a completed task.

---

## FROM T1 PASS 30 — THE RESEARCH STANDARD WAS MISCOUNTED *(added 2026-09-20)*

### ⚠ CORRECTION · **The research standard has 27 lessons, not 26** — and #27 was undocumented
**VERIFIED 2026-09-20, two independent ways:**
1. Direct grep of the source: `grep -c "^### [0-9]\+\." NBA_LESSONS_LEARNED_FROM_MLB.md` → **27**.
2. Grep of T1 itself: the pasted copy inside the transcript carries `### 27.` in Part A.

**The "26" figure appears in the owner's work order and propagated into
`NBA_FINAL_SCORING_CALIBRATION.md` (two places, both now corrected) and into
`NBA_GOBLIN_DEMON.md` §6. It was never checked against the file.** **Lesson #27 had no entry in any
of the twelve documents** — it is now recorded at `NBA_FINAL_SCORING_CALIBRATION.md` §14 and
`NBA_MULTIPLIERS.md` §0.2h.

**This is a live instance of the documentation-gap discipline at the top of this file**: a number
repeated often enough to look settled, never verified against its own source. **Cheap to check, and
it hid a whole lesson.**

### ⚠ OPEN · **Flex partial-credit structure is verified for PrizePicks only** *(lesson #27)*
**The lesson**: *"one platform's partial-hit Flex payouts were **flat, fixed values independent of how
large the underlying full-hit multiplier was**, while a different platform's **scaled proportionally
with its own full-hit multiplier**… **verify each platform's actual mechanic directly from real
observed data before building any EV model that depends on it.**"*

**Where NBA stands:**
- **PrizePicks** — **flat** tiers `4/5 = 0.5`, `3/5 = 0.25`, from **two independent MLB-side
  observations** (`NBA_MULTIPLIERS.md` §0.2). Labelled *first pass* under #26. **No NBA-side
  observation exists.**
- **Underdog, Sleeper** — **NOT RECORDED.** And the **informed prior points away from flat**: §0.2e
  records both as pricing **per-leg dynamically** rather than off a flat published table, which is the
  shape that would scale partial tiers proportionally. **These two findings had never been read
  against each other.**
- **Betr, Fliff** — **NOT RECORDED.**

**Why it is not cosmetic**: Flex EV is a **weighted sum over the partial tiers**, so a wrong tier
shape biases **every** slip priced on that platform in the same direction. It also means
**§0.2d.2's "Flex can flip an EV-negative Power pool positive" argument cannot be evaluated** on any
platform whose tier shape is unverified.

**The fix is one observed slip per platform, and costs nothing** — the payout displays **before**
placing (#16). Build two slips of the same shape with materially different headline multipliers and
read the partial tiers off both: **identical → flat; moving with the headline → proportional.**
**`NBA_MULTIPLIERS.md` §4b's capture protocol does not currently include this test** — recorded there
as question 5.

### ⚠ GAP · **Parts G and H of the research standard are not in the twelve documents**
Every reference in these documents describes the standard as *"the 26 lessons plus Parts A–F."*
**The current `NBA_LESSONS_LEARNED_FROM_MLB.md` carries Parts A, B, C, D, E, F, G and H.** VERIFIED by
grep 2026-09-20:

| Part | Title, verbatim | Items |
|---|---|---|
| **G** | *"Lessons earned by the NBA baseline work itself (2026-09-09), now part of the standard"* | **10** |
| **H** | *"Lessons from the enrichment backfill, market and board-sourcing phase (2026-09-10)"* | **12** |

**These are NBA-earned, not MLB-inherited** — the first NBA content ever added to the standard.
**Both postdate T1** (2026-09-03), so they are **not T1 material**: they were written by the sessions
that became **T7–T11** and are swept with those transcripts. **Recorded here so the gap is not lost.**
**Total standard: 27 + 10 + 12 = 49 numbered items. The twelve documents currently carry 27.**

⚠ **Two Part G items already collide with things recorded elsewhere as open**, which is why this
cannot wait for T7: **G1** (*"certify at the leg level, never the aggregate"* — with a measured
instance, *"3PM 'more' 60–65 at −4.6pp inside a ladder within ±1pp"*) is the same argument as
blueprint §7f recorded at pass 29, **now with an NBA number attached**; and **G8** (*"the season
opening is a regime the mid-season certification never sees"*) is **season-start critical** with the
season opening **2026-10-03**.

---

## FROM T2 — `2026-09-03-04-41-28-nba-expansion-phase3a-enrichment-complete.txt`
*added 2026-09-20*

### BUG-FIXED · GitHub API content-type mismatch
The worker requested the GitHub API's **raw** content-type then parsed it as the **base64-JSON
envelope**, producing `"Unexpected end of JSON input"`. Looked like a permissions error; was not.

### BUG-FIXED · fleet deploy order breaks new bindings
Workers deploy **alphabetically from the file diff**, so `alphadog-v2-admin-sql.js` (which holds the
bindings for new workers) sorted BEFORE `nba/alphadog-v2-nba-static-players.js` and failed.
**Permanent fix in `github_mobile_deploy_workers.py`: admin-sql always deploys LAST.**

### BUG-FIXED · git push race, non-fast-forward
Three scrapes succeeded but the final push was rejected by a concurrent push.
**Permanent fix: retry-with-rebase loop** — now standard in every NBA workflow.

### BUG-FIXED · arenas: the endpoint no longer carries the columns
`ARENA` / `ARENACAPACITY` came back null for all 30 teams. A diagnostic dump proved the columns are
genuinely **absent from that endpoint's real schema**, not mis-parsed. Switched to
`teamdetails` → `TeamBackground`. **Pattern: dump the real response before patching the parser.**

### BUG-FIXED · officials script needs plain `requests`, not `curl_cffi`
Wikipedia's API is designed for programmatic access and needs no bot bypass; the package was never
installed in the workflow. **Not every source takes the same transport.**

### BUG-FIXED · commit step hard-failed when one scraper produced nothing
Fixed so a single empty scraper cannot fail the whole run.

### CAVEAT · arena capacities are null where the SOURCE lacks them
Some of the 30 arenas have no capacity because `teamdetails` itself does not carry it. Recorded
honestly rather than filled from another source.

### CAVEAT · `source_key` only updates on rows that actually changed
25 of 30 teams kept their previous `source_key` because their data was identical. This is an upsert
property — do not read a stale `source_key` as a failed refresh.

---

## FROM T1 PASSES 3–7 — additional items *(added 2026-09-20)*

### BUG-FIXED · `column "active" does not exist`
The first query against `config.worker_definitions` used `active`; the real column is `enabled`.
Found by inspecting the real columns rather than guessing again.

### BLOCKED-PERMANENT · the assistant cannot reach `workers.dev` URLs
`x-deny-reason: host_not_allowed` from its own egress proxy, confirmed from raw response headers.
**Not fixable by switching tools.** Consequence: a worker can only be invoked through `run_job`.

### CAVEAT · `run_job`'s `target` is a fixed pre-wired enum
A new worker cannot be triggered until the bridge gets a service binding, an enum value and a dispatch
branch, followed by a redeploy. **This is why the four-step wiring pattern exists.**

### CAVEAT · D1 decommissioned system-wide 2026-08-12
All twelve bindings report `false` by design. Any attempt to read MLB logic through D1 will fail — this
is not transient.

### CAVEAT · the first teams load came from the FALLBACK, not the live API
Honestly logged at the time: *"genuinely seeded and correct today, but via the fallback, not the live
API."* The certified static 30-team list carried it until the GitHub-Actions path was proven.

### PARTIAL (resolved later) · ParlayAPI coverage was never verified in T1
`parlay-api.com` was unreachable from the sandbox, and probing it via the shared MLB queue was
deliberately refused as out of scope. Left explicitly open.
**Resolved in T12: our own scrapers beat it — ParlayAPI drops ~25% of rungs, proven by same-moment diffs.**

### OPEN DESIGN FORK (resolved) · shared board tables vs separate `nba_market`
The `sport`/`league` column exists on MLB's Sleeper/Underdog board tables but is **not wired for
dispatch** (the live code hardcodes `baseball_mlb` in the probe URL, the row filter and the league
literal). Flagged as *"a real fork worth your sign-off."* **Resolved in favour of separate
`nba_market` tables.**

### CAVEAT · inherited from MLB's own code
*"Cloudflare/GitHub deploys may not apply wrangler var-only edits reliably"* — which is why endpoint
and header defaults are hard-coded as fallbacks rather than relying on vars.

### OPEN-SINCE-T1 · an unclosed header/cookie follow-up
After the canonical-header rewrite, one path still returned an error and was *"flagged as a
non-blocking follow-up"* needing *"real header/cookie debugging"*. It correctly fell back, so nothing
broke — **but the follow-up was never closed.** Low priority (the GitHub-Actions path superseded it),
recorded so it is not lost.

### CAVEAT · the MCP connector caches its tool list at the CONNECTION level
Not per chat. This is why a disconnect-and-reconnect did not surface a newly deployed tool — a
genuinely fresh connection is required.

### CAVEAT · the full Cloudflare-origin response family
**403 "Access Denied" · 520 ("web server is returning an unknown error", edge-level) · 526.**
Root cause: **stats.nba.com is itself Cloudflare-fronted, and Cloudflare-to-Cloudflare traffic gets
flagged at the WAF/edge.** The request never reaches the app layer. No header tuning can fix it.

### CAVEAT · `STATIC_SEED_FALLBACK_AFTER_FETCH_ERROR` is the marker to watch
A `source_key` of **`STATIC_SEED_FALLBACK_AFTER_FETCH_ERROR`** means the certified static list was
used, not live data. `NBA_GITHUB_COMMITTED_STATS_NBA_SCRAPE` means real nba.com data. **Check the key
before trusting a load.** *(Corrected 2026-09-20 — an earlier entry recorded the truncated form.)*

### CAVEAT · NBA workers use DIRECT dispatch, bypassing the queue
Wired in the `BASE_HITTER_GAME_LOGS_WORKER` style — a direct call that *"bypasses queue entirely"*.
Deliberate: the owner specified no orchestrator. Copy that precedent for any new NBA worker.

---

## FROM T1 PASS 29 — BLUEPRINT §7f, §7g, §9 *(added 2026-09-20)*
*These three blueprint sections were **unswept** until this pass. Earlier T1 passes covered blueprint
§1–§7e plus the lessons document; **§8 was already captured** at `NBA_SYSTEM_ARCHITECTURE.md` §8b
(corrupt-and-fix testing). §7f, §7g and §9 were not.*

### ⚠ CORRECTION TO THIS SECTION'S OWN HEADER *(same day, same pass)*
The header above first read *"§7f, §7g, §9 — these three blueprint sections were unswept."*
**Only §7g and §9 were unswept.** **§7f was already recorded**, thoroughly, at
`NBA_BASELINE_CALIBRATION.md` §5.6 — with a **VERIFIED code grep** showing NBA is **structurally
protected** against the exact MLB failure (`p_less = 1 − p_more` by construction, so no second
population exists to be dominated). The gap entry immediately below is therefore **a restatement with
one new element — the cost precedent — not a newly discovered gap.** Corrected 2026-09-20.

### ⚠ GAP · No human-review gate on the calibration refit — **already recorded, now with its price tag**
**Already open at `NBA_BASELINE_CALIBRATION.md` §5.6**, which states it precisely: *"NBA's as-of
calibration refits and applies WITHOUT a review step. P2 runs the refit at step 14 and
`build_final_hp.py` consumes it on the next run. **The cadence matches (weekly-ish), the trigger-based
part is absent, and the human review is absent.**"* — and notes the `shift > 0.15` guard is only a
**partial** substitute, since *"it cannot catch a plausible-magnitude correction that is wrong for one
subgroup."*

**What this pass adds: what it cost MLB.** *"Two props running with **zero active correction for
roughly two and a half weeks** after a root-cause fix, showing real **30–45 percentage point
overconfidence gaps**, undetected until someone manually checked."* **NOT RECORDED anywhere before
2026-09-20 pass 29.** The blueprint names this precedent as the **direct motivation for the
coverage-gap diagnostic** — so the open gap and the unbuilt safeguard are **one item, not two**.

**Blueprint §7f** (primary record `NBA_BASELINE_CALIBRATION.md` §5.6; enrichment-side application
`NBA_FINAL_SCORING_CALIBRATION.md` §7m2) states the rule:
*"an aggregate validation metric passing is **necessary but not sufficient**… keep a **human review
step before applying any calibration correction** even when it has technically passed validation,"*
with a recommended cadence of *"**weekly recalibration checks, trigger-based re-fitting and mandatory
human review before applying — not full unattended automation.**"*

**NBA's refit runs unattended inside P2, nightly.** Whether it validates per `side` / `phase` / `band`
rather than on the pooled average, and whether any human gate exists before a shift is applied, is
**NOT RECORDED as built** — no such check appears in the transcripts or in the calibration document.
**MLB's own instance of this failure cost 30–45 percentage points of overconfidence on two props for
roughly two and a half weeks, undetected.** `ladder_calibration_asof` is keyed on `side`, so the
subgroup dimension MLB collapsed **already exists in NBA's schema** and a per-side validation is
available at zero data cost.
**SEASON-START RELEVANT** — the exposure is an unattended season-long pipeline.

### ⚠ BUG CLASS TO GUARD · a "limit to these items" parameter that filters the RESPONSE, not the WRITE
*Source: T1, blueprint §7g, first of two named bugs.*
> *"MLB found a function whose **'which props to touch' input parameter correctly filtered its own
> RESPONSE SUMMARY, but the underlying WRITE LOGIC IGNORED THAT FILTER ENTIRELY** and touched every
> eligible row regardless — **invisible except by noticing unrelated timestamps had also updated.**"*

Stated as **not unsafe in that specific case** (every write, filtered or not, passed the same
validation gate) — *"but the parameter's name implied a selectivity that didn't actually exist."*
**The standing check**: *"when adding any 'limit to these specific items' parameter to an NBA worker,
**verify it constrains the actual WRITE PATH, not just what gets echoed back in the response.**"*
**NBA workers carrying mode/scope parameters have NOT been audited against this** — not recorded.

### ⚠ BUG CLASS TO GUARD · `NOT IN` built from an array parameter → "malformed array literal"
*Source: T1, blueprint §7g, second of two named bugs.*
> *"A **`NOT IN` clause built from an ARRAY PARAMETER via a query-builder's TAGGED-TEMPLATE ARRAY
> HANDLING can be unreliable, especially WHEN THE ARRAY IS EMPTY**, producing a real **'malformed
> array literal'** error."*

**The prescribed fix pattern**: *"use an **explicit array-literal-with-cast pattern** and an
**explicit EMPTY-ARRAY BRANCH** instead of relying on implicit array-to-SQL handling for this specific
clause shape."* This is a **shared-stack gotcha** — same Postgres/Hyperdrive path MLB hit it on.
**Whether any NBA worker builds a `NOT IN` this way is NOT RECORDED** — not searched for as of this
pass.

### ⚠ SIX NAMED PIPELINE FAILURE MODES — §9 says build checks for ALL SIX from day one
*Source: T1, blueprint §9 — a whole methodology built from **"a real multi-bug night."***
Full text recorded at `NBA_SYSTEM_DESIGN.md` §6b. **None of the six is recorded as having a check
built in NBA.** Listed here because §9's own instruction is *"build checks for all six into NBA's
pipeline from the start."*

| # | Failure mode | Prescribed check | Built in NBA? |
|---|---|---|---|
| 1 | Reconciliation trusting a **still-actively-writing** batch | require the row count **stable across two reads separated by a real wait** | **NOT RECORDED** |
| 2 | Reconciliation trusting a **permanently-dead writer** (also shows a stable count) | check **data composition**, not count — a died-mid-write batch recovers as **100% one category / 0% of what was written later**; refuse to reconcile if a category with real upstream supply is wholly absent | **NOT RECORDED** |
| 3 | A completion check satisfied by **stale evidence from a PRIOR run** | use a check only **this run's own fresh output** can satisfy — e.g. `MAX(updated_at)` per entity falling **inside this run's execution window** | **NOT RECORDED** |
| 4 | A **"deactivated" correction still silently applying**, because the label doesn't defeat the live filter condition (e.g. a substring match a prefix doesn't break) | read **the exact filter condition in live code** and confirm the deactivation genuinely fails it | **NOT RECORDED** |
| 5 | **Raw source-API field ambiguity** corrupting a value, when the heuristic is built on a different field that merely *correlates* with the ambiguity | find the source's **genuine disambiguating field** (often a human-readable label string) | **NOT RECORDED** |
| 6 | **Silent config/formula drift across a whole universe**, no error thrown — output silently wrong-but-plausible | periodically **diff live config against the actual formula for the ENTIRE universe in one pass** | **NOT RECORDED** |

**⚠ Failure mode #6 is not hypothetical here.** The already-recorded **`minutes_mixture` drift** —
config specifying three components the recipe does not implement — **is exactly this failure mode,
already live in NBA.** §9 names the fix (whole-universe config-vs-formula diff) and it has not been
run.

**⚠ Failure mode #2 has a live analogue too**: board composition. §9's own board check —
*"verify that BOTH expected output categories (a PRIMARY/high-confidence tier and a REVIEW/lower-
confidence tier) are present in plausible proportions — **a 100%/0% split is a red flag even when the
total row count exactly matches expectations**"* — is **not recorded as implemented** on
`nba_score.board_scored`.

### ⚠ CONTRADICTION · T1's clean count — the work order and `NBA_MASTER_SUMMARY.md` disagree
**Flagged, not resolved.**
- `NBA_MASTER_SUMMARY.md` §T1.58 and its status table record **T1 as ✅ DONE — 3/3 clean (passes 26,
  27, 28)**, on the basis of full sequential reads of all 87 content blocks.
- The owner's work order dated **2026-09-20** records **T1 as 0/3, ACTIVE, ~30 passes done, "still
  producing new material on essentially every pass,"** with the resume point given explicitly as
  **"blueprint §7f onward."**

**This pass resolves which is factually right without resolving the count**: blueprint **§7f, §7g and
§9 were genuinely undocumented**, and all three produced new material recorded above. **The 3/3 was
earned against T1's conversational body and its 87 message blocks, not against the four handoff
documents embedded inside T1.** The pass-24–28 method — *"full sequential read, all six segments"* —
was reading **message blocks**, and a 95 KB blueprint pasted inside one block is not covered by
reading that block's first 200 characters.
**Per rule 1.2, the new material resets T1 to 0/3 regardless.** The count is treated as **0/3 from
pass 29**, matching the owner's work order. **The DONE marking in `NBA_MASTER_SUMMARY.md` is
superseded, and the reason is recorded there.**

---

## FROM T2 PASS 2 *(added 2026-09-20)*

### OPEN GAP · **garbage time is NOT filtered out of our season aggregates**
*"**garbage-time filtering** is an industry-standard practice (Cleaning the Glass, pioneered by Ben
Falk) that our existing season-aggregate data does **not** apply — `stats.nba.com`'s raw stats
**include garbage time**."*

**And it is NOT uniform** — Gemini rated it *"medium-high priority, **especially for bench-player props
whose season stats are almost entirely garbage-time minutes**."*

**A CONNECTION NEVER MADE, worth investigating:** the population most contaminated by garbage time
(bench and fringe players) is **exactly the population where the confidence model later measures the
largest error** — fringe players miss by **0.0283** vs iron-men at **0.0008**, a **35× gap**, which is
why `f_role` carries 55.6% of the deduction budget. **These may be the same problem seen from two
ends.** If a bench player's season aggregates are mostly garbage-time minutes, his baseline projection
is built on unrepresentative data — and the confidence model is measuring that, not just sample size.
**Never tested.**

Correctly deferred at the time: *"it can't be fixed at this layer — it needs play-by-play data, which
belongs to Phase 3b."* **It was never picked up in Phase 3b either.**

**⚠ UPDATE 2026-09-20 (T4 pass 8) — the specified proxy MAY ALREADY EXIST, half of it anyway.**
T4's research verdict deferred play-by-play but named the substitute: **"MIN + margin proxy noted for
later."** `nba_score.blowout_model` **is** a `minutes_by_margin` table — minutes ratios keyed to final
margin bands, 24,025 player-games. **That is the MIN + margin proxy, built in T16 under a different
name for a different stated purpose.**

**But it only covers one end of the contamination:**
| | Covered? |
|---|---|
| Correcting **projected minutes** for expected game script (forward-looking) | ✅ the blowout model |
| Cleaning **historical rate stats** (usage, per-36, efficiency) of garbage-time minutes (backward-looking) | ❌ **still open** |

**For a bench player whose season stats are "almost entirely garbage-time minutes", correcting his
projected MINUTES does not fix a per-36 RATE computed from garbage time.** The rate is the input the
baseline multiplies by. **That is the half that remains unfixed, and it is the half that hits exactly
the population where `f_role` measures a 35× error.**

### DECISION RECORD · EPM rejected on licensing, not capability
**EPM (Dunks & Threes)** was rated by Gemini as *"one of the highest predictive-lift single features"* —
then found to be **behind a paid subscription**. The line drawn:
*"Scraping paywalled content isn't something I'll do without your explicit sign-off — it's a real
legitimacy/ToS question, not just a technical one."* **Nothing was built against it.**
**This remains an open decision for the owner**, and DARKO (free, rated higher on RMSE) made it
non-urgent rather than resolved.

### CAVEAT · stats.nba.com requires the FULL parameter set
A partial query string returns a **real HTTP 500**, not a helpful error. *"many as empty strings"* —
send every documented parameter even when blank. Cost one debugging cycle on team stats; will cost one
on every new endpoint that forgets it.

### BUG-FIXED · `"Undrafted"` is a string in numeric draft fields
`DRAFT_NUMBER`, `DRAFT_YEAR`, `DRAFT_ROUND` return the literal string `"Undrafted"`. Fixed with
defensive coercion **applied to every numeric field**, not just the three that failed.

### CAVEAT · diacritics break naive name matching
A Jokić spot-check appeared to fail because the query used the ASCII spelling. **Not a data bug.**
First appearance of the problem that later becomes `nba/nba_names.py` + `nba_ref.player_name_map`.

### DECISION RECORD · DARKO chosen over EPM
**EPM (Dunks & Threes)** is public and was rated *"one of the highest-value single features."*
**DARKO (`darko.app`)** was then found to be **free AND rated higher** — *"beating both EPM and LEBRON
on predictive accuracy (RMSE)"*, and *"the single best predictive metric."* DARKO won on both counts.

### PROCESS NOTE · the owner twice overruled a "we're done" report
Message 697 (*"**No**, keep looking"*) and message 723 (*"Find alternatives… understand the relevance
of it"*) each followed an honest stopping point — and **each produced the session's highest-value
finding** (garbage-time filtering, then DARKO). Worth remembering before reporting exhaustion.

### UNEXAMINED EDGE · the weekly cadence reasoning fails early in a season
The justification for refreshing season aggregates weekly is explicit: *"a single game barely moves a
season average **after 20+ games played**."* **That is false in October and November**, when a single
game can move a season average substantially. The weekly cadence was never revisited for the
early-season case. **P1 runs weekly year-round.**

### CAVEAT · `*_written` counts are upserts, not totals
`aliases_written: 155/157` vs 162 total active rows. Unchanged rows are not rewritten — the same
property as `source_key`. **Comparing a worker's `*_written` figure to a `SELECT count(*)` will always
show a gap that is not a bug.**

### CAVEAT · `continue-on-error` on static scrapers vs fail-loudly on the baseline
The static scraper workflow sets `continue-on-error: true` per step so one broken endpoint does not
block the other seven — **and that is correct there**, because a missing entity is visible (its table
simply doesn't update). The baseline build forbids swallowing failures, because a missing prop pair is
**invisible** and corrupts the slate. **The rule is "never let an INVISIBLE failure pass," not "never
tolerate failure."**

---

## FROM T3 PASS 1 *(added 2026-09-20)*

### BUG-FIXED · **GitHub Contents API silently returns EMPTY content over 1 MB**
The schedule JSON is **1.2 MB**, above GitHub's Contents API inline-content limit, and *"the Worker's
fetch via that API **silently got empty content**"* — no error, no warning, just nothing.
**Fix: read via `raw.githubusercontent.com`, not the Contents API.**
**This applies to EVERY committed artefact over 1 MB** — and several now are (the injury shards, the
board files, the baseline ladders). Any worker still reading a large file through the Contents API is
silently getting nothing.

### CAVEAT · Hyperdrive caches query results for seconds
A differential test fired a phantom event because *"Cloudflare's Hyperdrive **caches query results
briefly** for performance; since I triggered runs seconds apart…"* — **not a logic bug.**
**Any test that writes then immediately reads through Hyperdrive can see stale data.** Verify the write
landed before triggering the read.

### CAVEAT · JavaScript bare decimals are invalid JSON
DARKO's hydration payload contains values like `.534094` with no leading zero — **valid JS, invalid
JSON.** The scraper repairs them before parsing. Any future hydration-extraction scraper will hit this.

### PROCESS NOTE · the snapshot layer had to exist BEFORE the next upsert
The owner corrected the sequencing: *"**first** you need to create the weekly function that will mine
the differential."* The reason is structural — *"the regular upsert workers already overwrite
`nba_ref.players` on every run, so I can't diff against 'current DB state' after they've run."*
**A differential layer cannot be added retroactively; it must capture a baseline before the next
overwrite.**

### PROCESS NOTE · the differential was proven, not assumed
Zero false positives across two runs only proves it does not fire wrongly. A **simulated** change was
required to prove it fires correctly — and that test failed twice (a race, then a cache artifact)
before passing. **"No events" is not evidence that a detector works.**

### BUG-OPEN · **82 play-type rows are scraped but never loaded**
| Stage | Count |
|---|---|
| Scraped (`player_rows_written`) | **3,364** |
| Loaded into Postgres | **3,282** |
| **Lost** | **82** |

**Verified live 2026-09-20 — `nba_stats.player_playtype_profile` holds 3,282 today.** Every other T3
load is exactly 1:1 (schedule 2,666, tracking detail 4,652, DARKO 530, team play types 630).
**Play types are the only mismatch.**

It went unnoticed because the scrape figure and the load figure were reported in **different messages**,
so no one compared them. **Likely cause (unverified): rows for players absent from `nba_ref.players`,
or duplicate (player, play_type) pairs collapsing on upsert conflict.**

**Not fixed** — per the documentation-pass rule. **The general lesson is the reportable one: a worker
that reports `rows_written` from the SCRAPE and a loader that reports its own count are two different
numbers, and nothing in the pipeline compares them.** The same blind spot could exist in any
scrape→load pair where the two counts are never asserted equal.

### OPEN QUESTION · is `shot_quality_delta` actually CONSUMED?
`nba_stats.player_shot_quality_delta` exists with the formula implemented exactly as designed
(`actual_efg_pct`, `expected_efg_pct`, `shot_quality_delta`, `total_fga`). Gemini called the underlying
metric *"likely the single most valuable public data point you can add to your system at this stage"*,
and it is the only direct answer the system has to the **hot/cold streak problem** — something season
averages structurally cannot catch.
**But whether the baseline or enrichment layer ever READS it is not established.** The enrichment
factor audit (T15/T16) tested ten candidates and none were shot-quality-based.
**If it is computed weekly and never consumed, that is a real gap** — the metric is built, validated
and sitting unused. **To verify: check whether any factor set or baseline recipe references it.**

### ⚠ UNCERTIFIED PROPS WILL STILL PRODUCE NUMBERS
`classification_ladder_v12.py` carries three certification states, and **only one of them has been
validated**:

| State | Props |
|---|---|
| **CERTIFIED** | the main singles set; `fga` — *"CERTIFIED both seasons (0.9 / 1.3, **0 band misses**)"* |
| **CONFIGURED, NOT YET RUN** | `turnovers` · `fg3a` · `ftm` · `personal_fouls` |
| **NOT YET CERTIFIED** | **`fgm` · `fta`** — *"ADDED 2026-09-12 (owner: the live PrizePicks menu carries these). **Configs are the closest certified analogue; NOT yet certified** — the first history run prints the band tables."* |

**These props have alphas, `k_stab`, step sizes and distribution families configured, so the ladder
builds them and `score_board_legs.py` will score them.** What they lack is the band-table validation
every certified prop passed. **A score with no certification behind it looks identical to one with.**

**Underdog offers FT Made, FG Attempts, 3PT Attempts and Personal Fouls** (T7's verified prop map), so
these are live board surface, not hypotheticals.

**To close**: run the history build for each and read the band tables — the mechanism already prints
them. **Or gate them out of the scorer until certified.**

### ⚠ `P(OT)` AND `foul risk` — named in the architecture
The five-dimension design lists *"Blowout risk, **P(OT)**, **foul risk**"* together as minutes-model
inputs, *"they act on opportunity, not efficiency."*

**✅ `P(OT)` EXISTS in the period layer** — measured at **5.3% at pick'em falling to 1.9% at 15+**, and
treated as a **mixture branch** (*"a star either gets ~5 crunch minutes or none"*). **It is absent from
the full-game ladder**, where it matters less.

**⚠ `foul risk` remains unbuilt anywhere.** In the full-game ladder, foul trouble appears only as an
exclusion filter (`PF < 6`). **The period layer models sit-out rates by game STATE, not by foul
trouble** — so a player fouling out of a competitive game is still unmodelled at every layer.

### ⚠ POSSIBLY AFFECTS MLB TOO · the symmetric sample-size floor
NBA's backtest found **a real bug in MLB's own guard, inherited by porting it**:
> *"Cell shrinkage toward the parametric value made far tails **worse**, which exposed a **real bug in
> MLB's own guard as ported**: **the symmetric sample-size floor forced true 0.002 rungs up to 0.25.**
> **Upper ceiling only.**"*

A guard meant to stop overconfident extremes was **symmetric**, so it also dragged genuinely tiny
probabilities **up** — **a 125× error at the far tail** (0.002 → 0.25). NBA fixed it by applying the
ceiling on the upper side only, after which *"far tails are exact (3PM +6 rung: predicted 0.002, actual
0.002)"* — the exact rung the bug had inflated.

**If MLB's live guard is still symmetric, MLB has this bug today**, and it would bite hardest on
demon-tier legs and long-shot alternates — precisely where the tails matter. **Worth checking
`alphadog-v2-base-baseline.js` / the live v6 function.** *(Not actioned — this pass documents only.)*

### ✅ RESOLVED · the FRINGE anomaly was LEAKAGE, not a filter artifact
The 0.87 fringe minutes ratio in won blowouts — *"below 1, where garbage-time accumulators should be
above"* — was suspected to be the ≥40%-of-median filter on small baselines. **It was not.**
> *"a **leakage bug** in the minutes harness (**a season-wide mean was using future games**; **that was
> the entire 'fringe anomaly'**), which shrank the role minutes multipliers to **honest ~1.0 values**."*

**Two lessons kept:**
1. **The anomaly was only detectable because the expectation was written down first** — the seed cells
   encoded *"a LIFT for a fringe garbage-time accumulator"*, so a ratio below 1 was a wrong *sign*
   against a stated prediction, not just an odd number.
2. **Leakage inflates apparent skill** — the multipliers were over-confident until it was removed.
   *"Shrank to honest ~1.0 values"* is the signature.

### 🎯 WHERE THE EDGE ACTUALLY LIVES — a prediction that half came true
T9 measured the factor layer and stated plainly where the gains would have to come from:
> *"**Effect on precision is real but small**: **Brier improves 0.1–0.3%**, calibration unchanged.
> **A ±3% pace edge moves a 20-point player ~0.7 points — about 2 pp of probability.** …the factors
> were not unneeded: **no, but they are NOT where the big gains are. Those must come from THE LIVE
> ENRICHMENT (injuries and lineups moving minutes and usage) and from COMBO STRUCTURE.**"*

**Scoreboard on that prediction:**
| Named source of edge | Outcome |
|---|---|
| **Combo structure** | ✅ **delivered** — P+R 0.9, R+A 0.9, fantasy 0.8 pp on the holdout; *"combos via joint structure, never a direct fit"* validated |
| **Live enrichment** | ❌ **did not** — T15/T16 tested **ten candidates; none survived at leg level** |

**One for one.** Which leaves the system's edge resting on **calibration quality + combo structure +
the board-scoped tails**.

**And the tails were already nominated as the biggest prize** (T8.16c): *"we're not modelling the
mean, we're modelling the **right tail** (80th–99th percentile)… likely the **#1 area where a sharp
baseline earns the most**, because **naive book models mis-price tails**."*

**That is now the standing hypothesis by ELIMINATION, not merely by design** — and it is testable the
moment real board data with goblin/demon rungs is in hand. **Worth making explicit before the season,
because it determines what the slip-building phase should optimise for.**

### STRUCTURAL FINDING · **the props that won't certify are the OPPONENT-driven ones**
> *"the **'close' props are EXACTLY the ones whose primary drivers are *opponent* stats** — **steals ←
> opponent turnover rate**…"* (T9)

**Blocks, steals and FTM all failed or nearly failed the two-season standard, and all three depend on
what the OPPONENT does** — opponent rim-attempt rate, opponent turnover rate, opponent foul rate.
**A player-history baseline structurally cannot see these.**

**This is a diagnosis, not an excuse**, and it matches T7.15a's factor lock exactly (blocks/steals
driven by *"opp rim-attempt rate / opp TO rate"*). **It also explains why the factor layer was the
proposed remedy** — the missing information is not in the player's history at any depth.

**It connects to the opponent-defence memory gap above**: the factor study asked for opponent ratings
on a **10–15 game rolling window**, and only season aggregates and weekly as-of fits exist.
**The props that need opponent signal most are the ones whose opponent signal is coarsest.**

### PRINCIPLE · test new factors against the props that ALREADY PASS, first
> *"the certified props with factors in — **points and rebounds first, since if factors *hurt* the
> certified ones that's the most important thing to know**"* (T9)

**The risk of adding a factor layer is regression on what already works**, not merely failure to
improve the laggards.

### ⚠ TRAP (inherited from MLB, applies to any NBA worker) · a filter parameter that doesn't filter
> *"When adding any **'limit to these specific items' parameter** to an NBA worker, **verify it
> constrains the ACTUAL WRITE PATH, not just what gets echoed back in the response.**"*

**A scope parameter that only shapes the response looks correct in every test that reads the
response.** The write proceeds unfiltered.

**This is live for NBA**: `FE_DATE` on `build_final_hp.py`, `BT_PROPS`, `GAP_SEASON`, `INJURY_MODE`,
`SLEEPER_SPORTS`, the backfill worker's `mode`, the measure-types writer's `file_prefix` — **every one
is a "limit to these specific items" parameter.** *(The `SLEEPER_SPORTS`/`SLEEPER_OUT_DIR` case is the
same family: the default scraped MLB and wrote to a path nothing committed.)*

### ⚠ TRAP · `NOT IN` from an array parameter, especially when EMPTY
> *"A **`NOT IN` clause built from an array parameter via a query-builder's tagged-template array
> handling can be unreliable, especially when the array is empty**, producing a real *malformed array
> literal* [error]."*

**The empty case is the dangerous one** — an exclusion list that is empty should exclude nothing, and
instead errors or silently changes the predicate. **`known_empty_games` is exactly this shape**: a
skip list that is empty on day one.

### ⚠ PROCESS DISCIPLINE — from real user feedback during the MLB migration
*Source: T1, blueprint §7d — "apply the same standard to NBA work." Recorded 2026-09-20.*

### 1. Don't present a guessed root cause as a confirmed fix
> *"**Don't GUESS at a root cause and PRESENT IT AS A CONFIRMED FIX — VERIFY AGAINST REAL DATA
> FIRST.** MLB had **MULTIPLE REAL CASES of a PLAUSIBLE-SOUNDING THEORY being presented as a fix, only
> for THE IDENTICAL FAILURE TO RECUR IMMEDIATELY AFTER**, which **COST REAL TRUST AND TIME.**
> **STATE PLAINLY WHAT'S CONFIRMED VERSUS STILL HYPOTHESIZED AT EVERY STEP.**"*

**This is lesson #19 (language strength ≤ evidence strength) applied to debugging**, and it is the
standard this documentation uses: every entry is marked **VERIFIED** (live SQL or direct grep) or
**NOT RECORDED** (absence from transcripts and targeted search).

**And the NBA record shows it being followed at cost**: the FRINGE anomaly was held open across
several iterations with a *stated suspicion* (the ≥40%-of-median filter) that **turned out to be
wrong** — the real cause was leakage. **The suspicion was recorded as a suspicion, so the correction
cost nothing.**

### 2. After 2–3 failed hypotheses, STOP GUESSING and get structured diagnostics
> *"**When 2–3 TARGETED HYPOTHESES HAVE FAILED IN A ROW, STOP GUESSING at INCREASINGLY SPECIFIC
> VARIATIONS OF THE SAME WRONG THEORY — GET REAL, STRUCTURED DIAGNOSTIC DATA INSTEAD:
> STEP-BY-STEP ERROR LABELLING, PER-ROW TRY/CATCH to isolate EXACTLY WHERE AND ON WHAT DATA a failure
> occurs.**"*

**A concrete stopping rule — two or three — and a concrete alternative.**

**✅ NBA's record contains the pattern applied correctly, repeatedly:**
| Situation | Structured diagnostic used |
|---|---|
| The completeness check | **three attempts**, then the `GAME_ID` prefix — *"a well-known, precise convention rather than relying on free-text labels"* |
| DARKO extraction | **four failed approaches**, then reading the page structure directly — *"it's SvelteKit, not Next.js"* |
| The starter-status v2 failure | a **5-sample v3 test** before committing to 1,230 calls |
| The delta derivation | **dry-run against committed files** before any network call |
| `leaguedashplayershotlocations` | dumping the real response — *"`resultSets` is a DICT, not a list"* |

**The `GAME_ID` case is the clearest instance of the rule**: two label-based hypotheses failed, and
the third attempt **abandoned the approach entirely** rather than refining the same wrong theory.

**⚠ And the counter-example is in the record too**: T6's **33 manual SQL chunks** were an increasingly
specific workaround for a theory (*"the enum is unusable this session"*) that was **simply wrong** —
the enum had already refreshed. **Two chunks in, a re-check would have ended it.** That is the
failure mode this rule names.

### ⚠ THE PASS-COUNT PRECEDENT — MLB needed 13 passes to reach two consecutive clean
Part E records what the standard actually cost in practice:
> *"a real scrutiny effort that **would have stopped after an early clean-seeming pass** instead
> **kept finding genuinely new, real issues across 13 TOTAL PASSES before finally reaching TWO
> CONSECUTIVE CLEAN ONES**. **Apply the same discipline to any NBA system component receiving a
> dedicated verification effort — the scoring engine, the outcome grader, a new enrichment factor —
> rather than treating a single clean-looking check as sufficient.**"*

**Three named NBA components are due this treatment and have not had it**: **the scoring engine**,
**the outcome grader**, and **each new enrichment factor**.

### ⚠ BUG PATTERN · an "unprocessed rows" filter that loops forever
> *"**A 'still needs processing' filter that doesn't exclude rows which can STRUCTURALLY NEVER satisfy
> the condition being waited on causes a GENUINE INFINITE LOOP, not slow progress.** MLB found a real
> case of a scoring query filtering only on **'score is still null'**, without also excluding rows that
> **could never receive a score because a hard prerequisite value was itself missing** — the pipeline
> **endlessly re-attempted the same unscoreable rows forever**, and the apparent 'progress' (**a
> slowly ticking percentage**) was **actually STUCK, not advancing**."*

> **The rule**: *"**Any NBA processing loop with a 'find rows still needing work' filter must ALSO
> explicitly exclude rows that can never satisfy that condition, OR verify TOTAL ADDRESSABLE COUNT is
> actually SHRINKING over time — not just that some percentage metric is moving.**"*

**Live instances to check in this build:**
| Loop | Rows that can never satisfy |
|---|---|
| **`score_board_legs.py`** | legs whose prop has **no ladder** (`double_double` carries a sentinel −1.0), legs for players with **no `mu_role`** (`role_tier is None` → NaN), **unmapped `market_key`s** |
| **`grade_board_outcomes.py`** | `unmatched_player` / `unmatched_not_in_season` legs — **permanently ungradeable** |
| **The per-game delta** | ✅ **already solved** — `known_empty_games` is exactly this exclusion: *"without it the 3 games the source returns empty would be re-fetched every single day forever"* |

**`known_empty_games` is the correct pattern, already proven in this codebase.** The same shape should
exist wherever a loop asks "what still needs work?"

**And the diagnostic**: **a percentage that ticks is not progress.** Check the **absolute addressable
count** is falling.

### ⚠ BUG PATTERN · naive truncation corrupts structured payloads
> *"**A generic payload-truncation utility that does a NAIVE BYTE/CHARACTER SLICE on serialized
> structured data (JSON) can CORRUPT that data by CUTTING IT MID-FIELD**, producing **invalid, garbled
> output rather than cleanly dropping whole fields**. MLB found and **traced a real, subtly-caused
> downstream data-quality bug all the way back to exactly this.**"*

> **The rule**: *"**Any NBA utility that truncates a structured payload to fit a size limit must be
> STRUCTURE-AWARE — truncate whole fields/objects, never a raw string slice.** A naive slice is a real,
> **hard-to-trace** corruption source."*

**Live surfaces where a payload is size-constrained in this build:**
- **`raw_json` JSONB** on every reference and stats table — if anything trims it to fit, it must drop
  whole keys
- **The bridge's own tool results** — `max_rows`, and the **grep/read utilities that return truncated
  file content** *(this is the same mechanism that truncated `FALLBACK_AFTER_FETCH_ERROR` to a
  partial string during this documentation effort — a live instance of the pattern, caught only by
  reading the full line later)*
- **`nba_score.baseline_ladder_runs.factor_fits` / `.role_minutes_multiplier`** JSONB
- **The 1 MB Contents API limit** — which does not truncate but returns **empty**, a different and
  arguably safer failure

### ⚠ BUG PATTERN · a read-side filter that hides the evidence of its own cause
> *"**A read-side filter that silently EXCLUDES rows with a missing/null field can HIDE THE VERY
> EVIDENCE needed to diagnose the upstream bug causing that field to be null in the first place.**
> MLB found a case where a downstream query **required a specific field to be n[on-null]**…"*

**This is a diagnostic trap, not just a data bug**: the rows that would explain the problem are
exactly the ones the query drops.

**Live instances in this build:**
| Filter | What it hides |
|---|---|
| `mu_role` / `role_tier IS NOT NULL` gates | players the minutes model could not project — **the population most worth diagnosing** |
| `comp_min` `np.nan` for non-competitive/high-foul games | the dud population, by construction |
| The NaN guard in `build_availability_delta.py` | ✅ **correctly counts and REPORTS what it drops** — the right pattern |

**The NaN guard is the model to copy**: it drops bad rows **and reports the count**, so the exclusion
is visible rather than silent.

### ⚠ PROP-DEFINITION MISMATCH CREATES A PHANTOM LINE-SHOPPING SIGNAL
Lesson #14 (T1), stated in full:
> *"**The same-sounding prop name can mean genuinely different underlying stats on different
> platforms.** [The recorded case]: **a fantasy-score-style composite prop used DIFFERENT SCORING
> FORMULAS on different platforms, producing a LARGE PHANTOM 'LINE DIFFERENCE' that LOOKED LIKE A
> LINE-SHOPPING OPPORTUNITY but was actually just TWO PLATFORMS MEASURING DIFFERENT THINGS WITH THE
> SAME NAME.**
> **Before any cross-platform prop comparison for NBA, explicitly verify the prop's exact
> definition/formula** [on each platform]."*

**The danger is not a wrong number — it is a FALSE OPPORTUNITY.** A definitional gap between two apps
presents exactly as a mispriced line, and it points the wrong way with high confidence.

**Directly live for NBA**: five apps are scraped and their boards land in one table,
`nba_market.board_snapshots`, keyed by `market_key`. **Any cross-app comparison on the same
`market_key` assumes definitional equivalence.**

**Known definitional differences already recorded:**
| Difference | Source |
|---|---|
| **OT included in 2H/4Q on PrizePicks/Underdog, EXCLUDED on Sleeper** | T7 prop map — *"different products, different models"*; ~7–8% OT probability at a 1-point spread |
| Fantasy scale **verified identical** (`1/1.2/1.5/3/3/−1`) across all three apps | T9 `prop_taxonomy` seeding — this one was checked |
| Sleeper milestone lines (20+/25+/30+) vs "no alternate lines" | unresolved, `NBA_GOBLIN_DEMON.md` §9 |

**The fantasy scale was the one checked, and it passed.** **The OT rule is the one that differs — and
it is exactly a same-name-different-stat case.** A 4Q points line on Sleeper and on PrizePicks are
**different props**, and comparing them would produce precisely the phantom signal #14 describes.

**Not verified for**: period props generally, `stocks` composition, `fantasy_score` on Fliff and Betr.

### ⚠ THE DOMINANT BUG CLASS · a grouping key or join that doesn't isolate what it claims to

**MLB's lessons document devotes an entire section — Part C, *"the pipeline/data-quality bug family to
actively guard against in NBA FROM DAY ONE"* — to this.**
> *"All of the following were **real, separately-discovered bugs** in MLB, and **every one of them is
> the SAME UNDERLYING SHAPE: a query, join, or grouping key that SILENTLY INCLUDED THE WRONG
> POPULATION.**"*

#### The named members of the family, with their tells
**The source lists the recurring forms as: *"an opponent's data via an UNFILTERED JOIN, a DIFFERENT
TIER/VARIANT SHARING A NAME, MULTIPLE SIMULTANEOUS LINE-LADDER RUNGS MISTAKEN FOR TIME-SERIES
MOVEMENT"*** — i.e. the failure is *"a grouping key or join that failed to isolate the specific unit
being measured — instead **silently pooling in something else**."*

| # | Bug | **The tell** |
|---|---|---|
| **1** | **A join on a shared key without a FULLY-SPECIFYING condition** (e.g. team+game **without player**) **fans out and double- or multi-counts** | **an unexpected EXACT MULTIPLE in row counts — 2×, 3× — versus the expected population size** |
| **2** | **A "baseline" or "control" that already CONDITIONS ON THE VERY THING BEING MEASURED** — *"erases the effect it's supposed to measure"* | **always check the control is defined INDEPENDENTLY of the effect under test** |
| **3** | **Pooling across sub-groups with different true base rates before computing a ratio** — **Jensen-style aggregation bias** | *"can INFLATE OR INVENT an effect that isn't really there at the pooled level"* |
| **4** | **Nested / hierarchical outcomes** — *"a lower threshold AUTOMATICALLY IMPLIED by a higher one on the same underlying stat… look like independent correlated events but are actually NEAR-DETERMINISTIC"* | **EXCLUDE same-entity nested lines from any independence/correlation study** |
| **5** | **A composite/derived stat computed with TWO DIFFERENT UNDERLYING FORMULAS across data sources** | *"produces PHANTOM 'differences' that look like real signal"* |
| **6** | **Multiple simultaneous price/line variants** (a full ladder of tiers offered at once) **mistaken for a TIME-SERIES of one thing moving**, *"if the grouping key doesn't ALSO key on the specific VARIANT/TIER"* | — |

#### ⚠ Members 4 and 6 are live risks for this system right now
**#6 is the ladder, exactly.** A PrizePicks board offers **standard, goblin and demon rungs for the
same player-prop simultaneously**. Any grouping that keys on `(player, prop, snapshot)` **without
`line` and `odds_type`** will read a static ladder as a line that moved. **`board_snapshots` keys
include `line` and the tier tables key on `kind`/`tier` — but any ad-hoc query over that table must
do the same.**

**#4 is combos and milestones.** `points ≥ 20` and `points ≥ 25` for the same player are
**near-deterministic, not two correlated observations** — and neither are `points` and `PRA`.
**Lesson #12 names this as one of three contamination sources** inflating same-game correlation.
**NBA's per-player covariance work avoids it by modelling components jointly**, but any future
correlation study must exclude same-entity nested lines explicitly.

**#5 is the fantasy-scale issue in general form** — the same nominal stat computed under two
formulas produces differences that are artefacts, not signal. **Lesson #14 is its specific case.**

**The standing action**: *"before trusting any grouping key or join in a new table, sanity-check that
it actually isolates what it claims to"* — **and look for exact multiples in row counts as the first
diagnostic.**

#### NBA's own instances — at least four, three of them silent
| Instance | Effect | Visibility |
|---|---|---|
| `norm_market()` naive `replace('player_','')` | **23,286 legs — 44% of the board — scored nothing** | **silent** |
| Splits PK omitting `season` | only one season can ever exist | **silent overwrite** |
| Lineup PK omitting `team_id` | traded players collide | **failed loudly** ✅ |
| Gap sample grouping on `matchup` | **every game listed TWICE** | **exactly the 2× tell from #1** |

**The `matchup` duplicate is member #1, textbook** — a grouping key that did not fully specify the row,
producing an exact 2× multiple. **It was caught because the multiple was exact.**

**Member #2 is worth watching here specifically**: `gain_vs_anchor` compares a factor against the
certified anchor. **If a factor's evaluation slice were selected using anything the anchor already
conditions on, the comparison would erase the effect.** *(T8's note that prior strength measured
against tier-mates is **circular** — tier-mates were *selected* for similarity — is the same shape.)*

### 📏 THE SAMPLE-SIZE POSTURE — adopt as a mechanical default from opening night
> *"**fewer than 15 real days is NOT YET A RESULT AT ALL; 15–30 days is DIRECTIONAL ONLY; 30–70 days is
> usable WITH REAL CAVEATS STATED; 70+ days is GENUINELY REPORTABLE.**
> **Days of real, distinct data matter FAR MORE than total leg count — a large leg count concentrated
> in a handful of days is A SMALL-SAMPLE FINDING WEARING A LARGE-N DISGUISE.**"*

**The NBA season opens 2026-10-03.** By this standard: **directional around 24 October, caveated
results in early November, genuinely reportable around mid-December.** ~58k legs/day will look like an
enormous sample long before it is one.

### ⚠ #25 · COMPOUNDING SAFETY MARGINS — relevant the moment slip EV is computed
MLB deployed *"an extra, deliberate conservative discount **ON TOP OF** an already-real,
already-conservative observed ratio"* — which **compounds absurdly once exponentiated across a
multi-leg slip.**
**A 5% haircut per leg is 23% on a 5-pick slip.** Any conservatism must be applied **once, at the slip
level**, not per leg and then again in aggregate. **Not yet relevant — the slip phase has not begun —
but it will be immediately.**

### ⚠ AS-OF CONTAMINATION — the recurring bug of this system, FOUR instances
| Instance | Where | Recorded |
|---|---|---|
| **A baseline measurement included day D's own results** → apparent discrimination **+39.76 pp**; corrected to **+5.32 pp**, vs the enriched model's **+5.31 pp** | T1, Part F | *"an entire multi-day investigation's founding premise rested on a lookahead-bias bug in the baseline measurement itself"* |
| **`backtest.baseline_v6_asof` leaked each leg's own game-day** (`as_of_date = D` included day D) | T1, relayed 2026-08-29 | verified via `non_push_sample` matching game-log counts |
| **A season-wide mean using future games** — *"that was the entire FRINGE anomaly"* | T8 | multipliers *"shrank to honest ~1.0 values"* after the fix |
| **A pasted calibration table carried across days** — the parity violation | live session | `ladder_calibration` dropped, replaced by `ladder_calibration_asof` |

**Common signature: INFLATED APPARENT SKILL.**

**Part F adds a second signature worth knowing**: *"a huge apparent gap"* between two components that
should be comparable. The +39.76 vs +5.31 gap looked like a finding about enrichment; it was a defect
in how the baseline was measured. **When two layers of the same pipeline disagree dramatically,
suspect the measurement before the mechanism.**

**Verification methods recorded:**
- **Non-push sample vs game-log counts** (the MLB method) — if the as-of prediction can only be right
  because day D is in it, the counts reveal it
- **NBA's structural guard**: `classification_ladder_v12.py` is `shift(1)`-based by construction, and
  T9 records *"the backtest harness on a past day IS already the production computation — every
  feature is shift(1)-based"*

**Open**: no equivalent of the non-push-count check has been run against NBA's own as-of surfaces.

### ⚠ APPLY THE SAME SUSPICION TO THE CONTROL AS TO THE TREATMENT
Stated in T1, Part F:
> *"**Before investigating why a component seems to underperform a supposedly-strong reference point,
> VERIFY THE REFERENCE POINT ITSELF as rigorously as the thing being blamed** — a 'before' or
> 'control' measurement is **just as capable of containing a lookahead-bias or leakage bug** as the
> 'after' measurement everyone's default instinct is to scrutinize."*

**Direct application in this system**: `gain_vs_anchor` measures every enrichment factor **against the
certified anchor**. **Ten factors were rejected on that comparison.** The anchor is the reference
point, and Part F's rule says it warrants the same scrutiny as the candidates.

**What supports the anchor**: it is `shift(1)`-based by construction, certified on both seasons
(0.7–1.2 pp ladders, `0 misses of 37`), and its holdout ran with the fitted cells disabled.
**What has not been done**: a leakage check on the anchor of the kind Part F describes — i.e. verifying
the anchor's own as-of construction with the same method used on candidates.

**Note this is not a claim that the anchor leaks.** It is a recorded gap between the rule and what has
been verified.

### FROM T1 · the open questions raised at the outset, *"explicit, not silently decided"*

**1. ParlayAPI `basketball_nba` real coverage was never independently verified**
> *"bookmakers, markets, live-vs-historical depth — **carried over from Phase 1's unresolved gap**.
> Needs a decision on how to test it (**a small isolated NBA probe worker seems the lowest-risk
> path**, given the 'no MLB-system changes' constraint) **before Section 2's 'reused as-is'
> assumption is trusted for anything beyond the account/key**."*

**Never verified — superseded instead.** Own scrapers proved to capture ~25% more rungs, so the
question stopped mattering for boards. **ParlayAPI's retained use is validating the derived spread**,
which is a narrower claim than the "reused as-is" assumption the question was gating.

**2. The board-table fork — reuse MLB's tables filtered by sport, or create `nba_market`?**
> *"**Reuse `market.sleeper_board_current` / `underdog_board_current` (which ALREADY CARRY UNUSED
> `sport`/`league` COLUMNS) filtered by sport, vs new `nba_market.sleeper_board_current`?**
> …defaults to **fully new `nba_market` tables for a clean, independent data universe** (matching the
> person's explicit instruction), **but flagging this as A REAL FORK IN THE ROAD since the existing
> columns exist and are currently unused for MLB filtering**."*

**Decided: fully separate `nba_market`.** The MLB tables' `sport`/`league` columns remain unused.
**Consistent with the two-mechanism isolation rule** (prefix *and* folder; here, schema *and*
dataset). **Recorded as a deliberate fork, not an oversight** — the alternative was viable and was
rejected on the owner's isolation instruction.

**3. Which enrichment factors for v1, and in what order?**
> *"The person named categories (**referee, arena, fatigue, injury, 'and many more'**) but said
> explicitly these are **'yet to be locked'**. **Phase 3c is where this gets decided WITH REAL SOURCE
> VERIFICATION PER FACTOR — not assumed here.**"*

**Resolved**: the factor registry holds 67 factors, 25 tagged baseline / 4 enrichment at seeding, each
with `relevant_prop_keys` gating. **The "real source verification per factor" discipline held** —
e.g. EPM was rejected on licensing, referees were sourced from Wikipedia after the stats API proved to
have none.

**4. ⚠ The referee dictionary was an OWNER-ORIGINATED factor with NO MLB precedent**
> *"**MLB's own factor mapping doesn't carry an MLB referee-tendency analogue into NBA AT ALL; the
> person is proposing a GENUINELY NEW, NBA-SPECIFIC FACTOR CATEGORY NOT COVERED BY THE TRANSFER
> PACKAGE.** Needs its own real source-verification pass — **does the NBA's own official API expose
> referee assignments/tendencies, per the blueprint's discipline of CHECKING THE SPORT'S OWN OFFICIAL
> API BEFORE ANY THIRD-PARTY SOURCE?**"*

**Verified and partially resolved:**
| Question | Answer found |
|---|---|
| Does the official API expose referee **rosters**? | **No** — *"the stats API has none"*, so Wikipedia's `List of NBA referees` was used |
| Does it expose per-game **assignments**? | **Yes** — `boxscoresummaryv2`/v3 `Officials` result set → `nba_stats.game_officials`, 3,681 rows |
| Same-day **assignments** for tonight? | `scrape_referee_assignments.py`, ~6–7 AM PT — **semi-live**, so the baseline holds a historical crew foul-rate table and **the assignment is applied in enrichment** |
| Referee **tendencies** as a scoring factor? | **D1** — capture built, **0 rows until the season** |

**The discipline named — check the sport's own official API before any third party — was followed and
produced a split answer**: assignments yes, roster no.

**5. The exact list of "static differential" entities**
> *"the person named **calendar / teams / players / rosters / arenas / referees**; confirm this is the
> full v1 list or whether anything else (e.g. **an alias table**, **a stadium/arena-context table
> analogous to MLB's park factors**) belongs in the same run."*

**Resolved — both suggested additions were built**: `nba_ref.team_aliases` (162) and
`nba_ref.player_aliases` are the alias tables; `nba_ref.arenas` (30) is the arena-context table.
**⚠ But `arenas` carries the park-factor analogue only as empty columns** — `altitude_ft` and
`timezone` are **0-of-30 populated** (see the cheap-fix entry above).

**6. ⚠ THE QUESTION THAT DEFINED THE ENTIRE OFFSEASON BUILD**
> *"**With no live season for ~1 month, what's the real, useful scope of 'backfill + design' work
> right now** — i.e. **which specific static/historical data sources can genuinely be probed and
> locked TODAY**, versus **which board/market/live-context work HAS TO WAIT until the season starts**
> regardless of how much design work is done in advance.
> **Recommend addressing this concretely as the VERY NEXT STEP, before opening multiple new per-domain
> chats, so each new chat has a real, doable ta[sk].**"*

**This question shaped everything that followed.** The answer, as executed across T1–T9:
| Doable without a season | Had to wait |
|---|---|
| all static/reference data | live board capture |
| 3 seasons of game logs (79,358 rows) | goblin/demon tier certification |
| the full baseline + calibration to leg level | the multiplier observation study |
| combos, periods, the production builder | real-money/quote confirmation |
| the delta path, proven by replay | selection and slip strategy |

**And the owner's own later framing confirmed the split** — *"with the previous seasons, I am sure you
can **simulate** the classification/baseline pipeline, which is already enough to define logic, define
the player tiers, the metrics"* (T7), answered with *"**no reason to wait for October for any of
that**."*

**The one thing the plan expected to be doable and wasn't**: the board scraper first (startup plan
step 3) — see `NBA_RECIPE.md` STEP 0b.

### ⚠ THE CANONICAL-ID RULE — decided in T1, worth auditing
> *"**Naming discipline that mattered in MLB, KEEP IT IDENTICAL: use ONE CANONICAL ID FORMAT FROM DAY
> ONE.** MLB had **a real, MULTI-TABLE BUG from mixing bare numeric team IDs with a prefixed format
> like `mlb_133`** — **GREP FOR FORMAT INCONSISTENCY PROACTIVELY, DON'T WAIT FOR IT TO SURFACE AS A
> DOWNSTREAM SYMPTOM.**
> **For NBA, decide the ID convention (e.g. `nba_<team_id>`) BEFORE WRITING THE FIRST TABLE and apply
> it everywhere.**"*

**What NBA actually uses**: `nba_ref.teams` carries **`team_id` TEXT** *and* **`nba_team_id` BIGINT**
side by side — i.e. **both a prefixed/text form and the bare numeric form, by design**, with the
aliases keyed on `alias_key`.

**Two known ID incidents already in the record, both of the flagged family:**
| Incident | Detail |
|---|---|
| **`PLAYER_ID` cast to string too late** | *"the virtual rows are built **before `PLAYER_ID` is cast to string**, so the roster ids come out as **ints**"* (T9) — a one-line fix |
| **`player_id` lowercase vs `PLAYER_ID`** | the bio file used `players`/`player_id`/`age`, not `records`/`PLAYER_ID`/`AGE` — **every age was NaN** and the B2B table was silently empty (T8) |

**Neither was a prefix mismatch, but both were ID-format mismatches producing silent wrong results** —
which is the failure class the rule exists to prevent.

**The instruction not followed**: *"grep for format inconsistency **proactively**."* **No proactive
ID-format audit is recorded in any transcript.** With `team_id` TEXT and `nba_team_id` BIGINT
coexisting across `nba_ref`, `nba_team`, `nba_stats` and `nba_calendar`, **a proactive grep is the
cheap version of the check the rule asks for.**

### ⚠ EIGHT PLANNED SCHEMAS WERE NEVER CREATED

**T1 specified fourteen `nba_`-prefixed schemas, ported from MLB's per-domain convention.** The
blueprint gives each one's purpose:
| Schema | Stated purpose | NBA state |
|---|---|---|
| `ref` | *"Static reference: teams, players, **aliases**, stadiums/**arenas**, **prop taxonomy**"* | ✅ `nba_ref` |
| `calendar` | *"Game calendar/schedule, **live game status (`is_live`, `is_final`, `game_time_utc`)**"* | ✅ `nba_calendar` |
| `stats_hitter` / `stats_pitcher` | *"Player game logs, splits, rolling metrics"* — **renamed for NBA** | ✅ **one** `nba_stats` (no hitter/pitcher split) |
| `team` | *"Team-level game logs, **starter/rotation history**"* | ✅ `nba_team` |
| **`daily`** | *"**Same-day context: lineups, confirmed starters/rotations, availability, matchup context**"* | ❌ **never created** — contents landed in `nba_score` (`availability_delta`) and committed JSON |
| **`context`** | *"**Historical snapshots of daily-context factors** — **SHORT RETENTION BY DESIGN in MLB — SEE LESSONS DOC FOR WHY THIS BIT THEM**"* | ❌ **never created** |
| `market` | *"**Live board/odds state per platform — CURRENT-ONLY tables**"* | ✅ `nba_market` — **but NBA's is NOT current-only**: `board_snapshots` holds 6.6 GB of history |
| **`archive`** | *"**Permanent historical archives of anything `market`/`context` only holds CURRENT-STATE for**"* | ❌ never created — **and NBA does not need it the same way**, since `nba_market` keeps history directly |
| `score` | *"Scoring engine output: prepared board, final board, **outcome grading**, **pricing/multiplier study tables**"* | ✅ `nba_score` |
| **`backtest`** | *"**Point-in-time reconstruction tables** and ad-hoc research tables (**walk-forward datasets, real-multiplier studies**)"* | ❌ never created — walk-forward lives in `nba/backtest/` scripts and `nba_score.baseline_history` |
| `control` | *"Job queue, worker registry, scheduled jobs, session logs"* | shared with MLB, **bookkeeping only** |
| `config` | *"Worker definitions, external credentials, system settings"* | ✅ `nba_config` |

**⚠ `context`'s short retention is flagged in T1 as a KNOWN MLB REGRET** — *"see lessons doc for **why
this bit them**."* **NBA avoided it by accident rather than design**: `nba_market.board_snapshots`
retains full history (6.6 GB, 327 dates) rather than current-only, and the archive schema was never
needed. **But the daily-context equivalent — injury-report snapshots, availability state — should be
checked for the same retention trap**, since that is precisely what `context` was for.

**Plus `nba_config`, which was NOT in the original list** — added in T8 for the tiering layer.

**The two most notable absences are `daily` and `context`**, because their stated purpose —
*"same-day context: lineups, confirmed starters/rotations, availability"* and *"historical snapshots
of daily-context"* — **is exactly the enrichment layer's data.** That data exists today
(`availability_delta`, the injury-report captures, `board_snapshots`) but is **distributed across
`nba_score` and `nba_market` rather than in its own domain schema.**

**Worth confirming** that nothing ported from MLB expects `nba_daily`, `nba_context` or `nba_archive`
to exist — the MLB system has `daily`, `context` and `archive`, so any query written by analogy would
fail.

### 💰 UNVERIFIED SPEND · BallDontLie GOAT tier — $39.99/month, possibly unused
T1 records a **paid, verified BallDontLie integration**:
> *"Fully operational with **paid GOAT tier ($39.99/month)**. Rate limit **600 requests/min** (10× the
> free tier). `/stats` → 200 OK (**CRITICAL — paid tier only**). API key confirmed active.
> Timeout raised **10s → 30s**. **API is SLOW (10–30 s per request) but functional; CACHING CRITICAL
> for production.**"*

**Nothing in any later transcript uses it.** The build took **stats.nba.com** as its primary source
from T1 onward, and T9's historical-prop research records *"balldontlie: **no history**"* as the reason
it was ruled out for board data.

**Not referenced in P1, P2 or P3.** No scraper in `nba/` is recorded as calling it.

**To check**: whether the subscription is still being billed, and whether anything at all consumes it.
**If unused, it is a recurring cost with no consumer.**
*(Documentation only — no action taken, per the standing rule.)*

### ⚠ THE FACTOR GATE — neither branch of the multiple-comparisons rule has been applied
Lesson #7 (T1) requires the significance bar to match how the test was run:
| Situation | Correct bar |
|---|---|
| **Scanning many cells for the best result** | **corrected** (Bonferroni or equivalent), scaled to the number searched |
| **A single, PRE-REGISTERED confirmatory test** | **UNCORRECTED** — *"using a scan-level bar on a single confirmatory test is ITSELF AN ERROR"* |

The source records both errors happening: under-correction on scans, and one case where *"a
40-cell-scan-corrected bar was wrongly used on what was actually a single pre-specified test, making a
real, borderline-positive result look **far more rejected than the evidence warranted**."*

**NBA state**: the factor gate scanned many **prop × band × side** cells across ten candidates.
**No multiple-comparisons correction is recorded, and no per-cell pre-registration is recorded.**
Neither branch has been applied.

**This compounds with the #8 gap above** — ten factors closed, without the confirmed-negative /
underpowered split, and without a correction scaled to the scan. **The rejections may well be right;
what is missing is the record that makes them defensible.**

**⚠ And the counterweight still applies (#9)**: do not now apply a stricter bar because the results
were negative. **Fix the method, not the threshold.**

### ⚠ TEN REJECTED FACTORS — "confirmed negative" vs "underpowered" is not recorded separately
Lesson #8 (T1): *"**'Insufficient data / underpowered' is a DISTINCT verdict from 'confirmed
negative' — don't collapse them.** A non-significant result with a wide confidence interval that still
contains a materially positive value is **NOT** the same as a confirmed-zero effect. **State the
actual POWER CALCULATION** — how many days would be needed to detect the effect size in question —
**and track genuinely underpowered candidates in their own list.**"*

**NBA state:** `nba_score.factor_gate_results` stores `n`, `log_loss`, `brier`, `gain_vs_anchor`,
`shrink_beta` per verdict — **the sample size is there**, but the ten closures are recorded as
rejections without the two-way split.

**Two of the ten have stated sample constraints:**
| Factor | Constraint recorded |
|---|---|
| **A2** | design specified confidence tiers on shared-absence games — **<5 / 5–14 / 15+**; a table built on <5 games is near-noise |
| **B4** | *"closed in three formulations, **0 of 5 props**"* — no power figure recorded |

**What is missing per #8**: a power calculation per closed factor, and a separate list for
underpowered candidates.
**Counterweight (#9)**: do not raise the bar for candidates that looked promising — **keep the bar
fixed and classify the outcome honestly.**

### ⚠ "CAN THIS PROP BE GRADED?" IS A SHIPPING PREREQUISITE, NOT A FOLLOW-UP
> *"**Before deploying ANY new prop to a live board, CONFIRM ITS OUTCOME-GRADING PATH IS ACTUALLY
> BUILT AND TESTED END TO END.** MLB had a real case of **a prop (situational, requiring
> play-by-play-level data no standard game log carries) being SERVED ON THE LIVE BOARD WITH
> PREDICTIONS FOR WEEKS BEFORE ITS OUTCOME-GRADING PATH EXISTED AT ALL** — meaning **those predictions
> COULD NEVER BE VALIDATED AGAINST REALITY during that entire window.**
> **Treat 'CAN THIS PROP'S REAL OUTCOME BE GRADED' as a HARD PREREQUISITE for shipping a new prop, NOT
> a follow-up task.**"*

**⚠ The MLB case is a play-by-play prop — and NBA has an entire deferred tier of exactly those.**
Tier C props (**first basket, first to 10+, game/team high scorer, First 5 Minutes**) *"need
play-by-play we don't have"* and are correctly out of scope. **The rule says they must stay out until
the grading path exists, not merely until the projection does.**

**The props to check this against are the ones already configured but unvalidated:**
| Prop | State | Gradeable from `player_game_log`? |
|---|---|---|
| `fgm`, `fta` | NOT YET CERTIFIED | ✅ `FGM`, `FTA` are box-score columns |
| `turnovers`, `fg3a`, `ftm`, `personal_fouls` | CONFIGURED, NOT RUN | ✅ box-score columns |
| **`double_double`** | sentinel −1.0, **no ladder** | ⚠ derivable, but **the grading expression is not recorded** |
| **period props** (1Q/1H/2H/4Q) | built, certified for points | ✅ `Period=1..4` bulk data exists |
| **`ot_rule = exclude` variants** | unverified whether built | ⚠ **requires OT isolation = full-game − quarters** |

**The last row is the live risk**: if an `exclude` variant is ever served, **its grading path needs the
OT subtraction to exist too** — and T9 lists *"the OT-exclude variant for Sleeper"* as outstanding.

### ⚠ THE GRADER NEEDS AN IDEMPOTENT, DETERMINISTIC OUTCOME ID
> *"**Build an IDEMPOTENT, DETERMINISTIC OUTCOME ID** — built from **EVERY field that distinguishes
> one real graded leg from another: ENTITY, PLAYER, PROP, LINE, SIDE, VARIANT, DATE** — **so the
> grader can be SAFELY RE-RUN for the same date WITHOUT DUPLICATING OR CORRUPTING existing rows** —
> **this also makes the grader resilient to the platform-level schedu[le changes]**."*

**Seven fields named: entity · player · prop · line · side · VARIANT · date.**

**⚠ `variant` appears again** — the same column whose omission caused the dedup collapse (above), and
the same column whose labelling is currently wrong in `board_tiers` v1. **It is named in both the
dedup key and the outcome ID.**

**Why idempotency matters operationally for NBA**: P2 re-runs are expected (replay mode, `asof`
override, a failed night re-run). **A grader that is not idempotent duplicates or corrupts on every
re-run** — and `board_outcomes` has **6.9M rows across 327 dates**, all produced by repeated runs.
**Whether its key includes `variant` is unverified.**

### ⚠ PUSH / TIE / DNP IS A THIRD STATE — and it needs fixing in TWO places
T1's blueprint §4c:
> *"**Distinguish push/tie/DNP from genuine hit/miss AS A REAL THIRD STATE**, and **exclude it from
> hit-rate denominators at the STATISTICAL level** — **but recognise this is a *DIFFERENT* FIX from
> correctly handling it at the *SLIP-CONSTRUCTION* level.**
> MLB found that **its per-leg hit-rate statistics ALREADY CORRECTLY EXCLUDED VOIDS**, while **its
> SLIP-LEVEL BACKTEST SIMULATIONS DID NOT correctly model that A REAL SLIP CONTAINING A VOIDED LEG
> GETS RE-PRICED BY THE PLATFORM TO ONE FEWER PICK** — **two different places needing the same
> real-world event handled correctly, where fixing [one does not fix the other].**"*

**✅ NBA has the third state at the data level**: `board_outcomes.leg_result` carries **`push`** and
**`dnp`** as distinct categories alongside `over_win`/`under_win`.

**⚠ The slip-level half cannot be checked yet — and that is exactly when it bites.** The slip-strategy
phase has not begun, so there is no backtest simulation to inspect. **But the lesson is that the
statistical fix is the easy one and gets done first**, while the slip-level one is missed *because*
the statistics already look correct.

**The specific mechanic to model when the slip phase starts:**
> **a real slip containing a voided leg is RE-PRICED BY THE PLATFORM TO ONE FEWER PICK.**

**A 5-pick slip with one DNP becomes a 4-pick slip at 4-pick pricing** — not a 5-pick slip with a free
leg, and not a loss. **Any EV or ROI simulation that treats a void as either must be wrong.**

**And the frequency is not negligible for NBA**: the baseline deliberately projects players who will
not play (*"43 roster players were DNP — enrichment removes"* on one replay slate), and the
availability delta exists precisely because players flip to OUT after P2.

**Recorded now, before the slip phase, because the lesson is that it gets missed at exactly that
point.**

### ⚠⚠ TWO HISTORICAL GRADER BUGS — both live risks for NBA's grader
T1's blueprint §4c: *"**two real, historical bugs, both worth ACTIVELY DESIGNING AGAINST in NBA's own
grader.**"*

**BUG 1 — an INNER JOIN silently dropping non-participants**
> *"**An INNER JOIN between the board and game-log tables SILENTLY DROPPED ANY PLAYER WITH ZERO
> MATCHING GAME-LOG ROWS** — **a rest day, an unused bench player, a scratched starter** — **from the
> graded set ENTIRELY: never graded, never stored, PERMANENTLY INVISIBLE rather than correctly
> captured as a genuine push/void.**
> **Fix: use a LEFT JOIN plus an explicit 'IS THIS GAME CONFIRMED FINAL' check, so genuine
> non-participation becomes a CAPTURED PUSH/VOID, not a silent disappearance.**"*

**✅ NBA appears to handle this** — `board_outcomes.leg_result` includes **`dnp`** alongside
`over_win` / `under_win` / `push` / `unmatched_player` / `unmatched_not_in_season`. **A DNP is a
captured category, not a dropped row.**
**⚠ What is unverified**: whether the join is actually a LEFT JOIN, and whether the **"is this game
confirmed final"** check exists. **A DNP category can be populated and still lose rows if the join
drops them before the category is assigned.**
**The distinction matters for the season**: rest days and scratches are the most common
non-participation in the NBA, and they are exactly what a scratched-after-P2 slate produces.

**BUG 2 — a dedup key missing variant-distinguishing columns**
> *"**A deduplication key that DIDN'T INCLUDE EVERY VARIANT-DISTINGUISHING COLUMN** (in MLB's case,
> **the GOBLIN/DEMON TAGS**) caused **two genuinely different real market variants sharing the same
> underlying player/prop/line to SILENTLY COLLAPSE into a SINGLE graded row** — **the other variant's
> outcome was NEVER CREATED AT ALL, not even as a placeholder, WITH NO ERROR THROWN.**"*

**⚠⚠ This is the highest-risk item for NBA's grader, and the variant column is exactly the one whose
labelling is currently wrong.**

**The shape of the risk:**
- **`board_tiers` v1 derives `kind` from PRICE and is Over-only** — so the goblin/demon tag is
  unreliable on Less rows since 2026-08
- **A goblin and a demon can now sit at the same `(player, prop, line)`** — below the anchor, More is
  a goblin and Less is a demon **on the same rung**
- **If the grader's dedup or unique key does not carry BOTH `side` AND the variant tag**, those two
  collapse — and per the source, **the other outcome is never created, not even as a placeholder, with
  no error.**

**What is known**: `board_outcomes` is keyed on prop, side and line. **Whether it carries a variant
dimension, and whether `ot_rule` is in its key, is unverified** — `baseline_ladder` does carry
`ot_rule` in its PK, but that is a different table.

**And the source names the family**: *"this is the same 'grou[ping key]' failure"* — Part C's dominant
bug class, in the grader.

### ⚠ A TWO-PARADIGM SPLIT EMERGED IN THE CONSTANTS — the exact cost T1 warned against
T1's blueprint §4e records **"a real, avoidable complexity MLB is currently living with"**: its factor
system was migrated piecemeal, so **some factors live in config cells and others remain hardcoded**.
> *"**The real, practical cost: for ANY GIVEN FACTOR, a session doing enrichment work FIRST HAS TO
> CHECK *WHICH PARADIGM THAT SPECIFIC FACTOR CURRENTLY FOLLOWS* before doing anything else**, since
> the two require **genuinely different investigation and modification approaches.**"*
> *"**NBA has a real, ONE-TIME OPPORTUNITY MLB no longer has… build the config-table-driven, two-layer
> architecture FROM DAY ONE, FOR EVERY FACTOR FROM THE START — avoid EVER maintaining TWO DIFFERENT
> PARADIGMS SIDE BY SIDE.**"*

**✅ NBA took the opportunity for FACTORS.** Every enrichment factor is in the config layer —
`factor_registry` (67), `factor_relevance` (460), `factor_profile_cells` (35). No hardcoded-JS
enrichment system exists.

**⚠ The split reappeared in the CONSTANTS:**
| Paradigm | Holds |
|---|---|
| Config tables | `stat_decay_config` (13), `role_tiers` (6), `factor_profile_cells`, `classification_config` (66), `minutes_mixture` |
| **Python literals in the recipes** | `MAX_TIERS`, `MIN_PER_TIER`, `TIER_BLEND_K`, `SHIFT_LAMBDA`, `BLOWOUT_MARGIN`, `COMPETITIVE_MARGIN`, `LADDER_DEPTH`, Wilson n=30 |

**And the named cost has already been paid once**: `minutes_mixture` specifies `dud_lognormal`,
`tiered_inelastic` renormalisation and a **per-team** `E[min|blowout]` — **none implemented in the
recipe.** **To know what the system does, you must check which paradigm holds that value.**

**Severity is not uniform**: `role_tiers` (DB) and `ROLE_TIERS` (code) **were verified to agree**;
`minutes_mixture` and the code **do not**. **The split is harmful specifically where the two disagree
and nothing asserts they should not.**

**A cheap mitigation exists**: an assertion at recipe start that each literal matches its config
counterpart — the same pattern as the patcher's **anchor assertions**, which already *"fail loudly"*
on drift.

### ⚠ A "FAILED" STATUS CAN MEAN A SAFETY GUARD DID ITS JOB
*Source: T1, blueprint §5a. Recorded 2026-09-20.*
> *"MLB traced **a real case where AN ENTIRE TOP-LEVEL RUN SHOWED AS FAILED**, and **the honest root
> cause was A SAFETY GUARD *CORRECTLY* REFUSING TO OVERWRITE GOOD EXISTING DATA WITH AN EMPTY
> RESULT — NOT AN ACTUAL BUG.** The failure **CASCADED UPWARD through several stages before reaching a
> safety check that BEHAVED EXACTLY AS IT SHOULD.**
> **A 'FAILED' STATUS DOESN'T ALWAYS MEAN SOMETHING IS BROKEN; IT CAN MEAN A SAFETY GUARD DID ITS JOB
> CORRECTLY** — **before treating any cascading failure as a bug to fix, TRACE IT ALL THE WAY TO ITS
> ACTUAL ROOT and CONFIRM WHETHER THE TERMINAL CAUSE WAS A GENUINE PROBLEM OR A SAFETY MECHANISM
> WORKING AS INTENDED.**"*

**NBA is deliberately full of loud guards, so this will happen**, and the pipelines are designed to
fail hard:
| Guard | A "FAILED" run it will cause |
|---|---|
| **P1's certifier** | already observed — *"correctly FAILED on defender ratings 6 days stale"* ✅ **working as intended** |
| **P2's delta gap audit** | *"both fail the job loudly. **No `\|\| echo failed` anywhere**"* |
| **The delta worker's pre-flight** | *"halt and warn, don't silently proceed on an incomplete night"* |
| **The patcher's anchor assertions** | *"the anchor check did exactly its job — it failed loudly"* ✅ |
| **`load_baseline_ladder.py`** | *"**refuses a singles-only slate**"* — the exact "refuse to write an incomplete result" shape |
| **P3's cutoff assertion** | refuses to score a slate clubs have not filed for |

**⚠ The publishing-lag case is the one that will look most like a bug and not be one.** A delta run
landing inside the ~15-minute stats.nba.com publishing window makes the gap audit **correctly** flag a
game that simply is not published yet — *"that's the check working, not failing."* **Without the grace
window (still unbuilt), this produces genuine FAILED runs that need no fix.**

**The operational consequence**: an unattended pipeline that fails loudly is only useful if **failures
are triaged to root before being "fixed"** — otherwise the natural response is to weaken the guard.

### ⚠ CONFIGURATION CONTRADICTIONS — flag, don't silently "fix"
> *"MLB found **a live scheduling flag whose `enabled` STATE DIRECTLY CONTRADICTED ITS OWN EXPLANATORY
> NOTE** — one said **'temporarily disabled'**, the other said it was **active**.
> **Rather than GUESSING WHICH ONE WAS CORRECT and SILENTLY 'FIXING' IT, this was EXPLICITLY FLAGGED
> FOR DIRECT HUMAN CONFIRMATION OF INTENT**, since ei[ther could be the truth]."*

**NBA has at least one live contradiction of exactly this shape, already recorded:**
> **`fga` appears in two states in the harness header** — the header line lists it under *"configured,
> NOT yet run"*, while the inline comment says *"**CERTIFIED both seasons (0.9 / 1.3, 0 band
> misses)**."*

**Per this rule, that is flagged rather than resolved by inference.** The inline comment is more
likely current, **but which is right determines whether `fga` is a certified prop or an untested
one** — and guessing would silently create a certification claim.

**The `enabled=1` MLB registry rows are a second instance**: **~19 of 116 are dead stubs at ~5.3 KB,
still flagged enabled.** **The flag and the reality contradict**, and it is recorded rather than
"corrected."

### ⚠ "NO GAMES SCHEDULED" IS NOT A FIRST-CLASS STATE — and Oct 1–2 are zero-game days
T1's blueprint §5, listed as *"a real, confirmed architecture gap in MLB, **worth designing around
from the start for NBA**"*:
> *"**The system COULD NOT ORIGINALLY DISTINGUISH 'GENUINELY ZERO GAMES TODAY' (e.g. ALL-STAR BREAK)
> from 'SOMETHING IS BROKEN AND RETURNED ZERO ROWS.'**
> **Build an EXPLICIT, FIRST-CLASS 'NO GAMES SCHEDULED' STATE into the NBA pipeline FROM DAY ONE —
> don't let a natural zero-game day SILENTLY LOOK IDENTICAL TO A REAL FAILURE.**"*

**NBA has real zero-game days**: the **All-Star break** (~5 days), scattered dates, and —
**immediately relevant — 2026-10-01 and 10-02, before opening night on the 3rd.**

**The current signals are ambiguous in exactly the described way:**
| Signal | Genuinely zero games | Broken and returned zero |
|---|---|---|
| P2's delta gap audit | 0 expected, 0 found → **passes** | calendar read failed → 0 expected → **also passes** |
| P3's scored-leg count | 0 | 0 |
| The certifiers | freshness + row counts | — |

**The distinguishing information already exists** — `nba_calendar.games` holds 2,666 games and knows
which dates are empty. **What is missing is a state that says so.**

**⚠ And it compounds with two other season-start items on the same dates:**
- **Oct 1–2: `active_stats_season()` returns 2026-27, which has ZERO regular-season games** (edge case
  ② above)
- **A weekly scraper running in that window pulls empty aggregates and writes them, reporting
  success**

**So on 2026-10-01, three separate mechanisms would each produce "zero, and that's fine" — two of them
wrongly.** A first-class no-games state is what distinguishes the legitimate zero from the other two.

### ⚠⚠ ROUNDING CONVENTION — a measured 14.5% row disagreement
T1's blueprint §4n, *"a confirmed, QUANTIFIED numeric-precision bug worth guarding against
directly"*:
> *"**Multiple analysis tables were found to have been computed using THE WRONG ROUNDING CONVENTION —
> a 'ROUND HALF TO EVEN' convention rather than the standard 'ROUND HALF AWAY FROM ZERO' convention
> THE LIVE SYSTEM ACTUALLY USES — causing A REAL, MEASURED 14.5% OF ROWS TO DISAGREE with what the
> live system would actually compute FOR THE SAME INPUT.**
> **Before trusting ANY NBA backtest or analysis table's EXACT BOUNDARY VALUES — A TIER CUTOFF, A
> THRESHOLD CLASSIFICATION — CONFIRM ITS ROUNDING CONVENTION EXPLICITLY MATCHES THE LIVE SYSTEM'S OWN
> CONVENTION** — **a mismatch here is a real, SILENT, and NON-TRIVIAL source of d[isagreement].**"*

**14.5% of rows, from a rounding convention alone.** And the named cases are **tier cutoffs and
threshold classifications** — which is what NBA's entire tiering layer consists of.

**⚠ NBA's exposure — CHECKED 2026-09-20, and it is SMALLER than feared:**

**Every `round()` in `classification_ladder_v12.py` is for REPORTING, not classification:**
| Line | Use |
|---|---|
| 385 | `print("RETURN RAMP multipliers…")` — console output |
| 492 | `FACTOR_FITS[prop]` — recording fitted coefficients |
| 535 | `FACTOR_FITS["season_phase"]` — recording |
| 672 | `platt_log` — recording A, B, `max_shift` |
| 685 | the summary table — `mean_pred`, `gap_pp`, `brier`, `logloss` |
| **397** | **the ONLY functional one** — `_compound_cdf_cached(int(k), round(att_mean,1), round(att_var,1), round(pct,2))` — **deliberate quantisation for a CACHE KEY** |

**✅ Tier assignment does NOT round.** `role_tier()` uses **interval comparison**:
```python
for k, lo, hi in ROLE_TIERS:
    if lo <= m < hi: return k
```
**A comparison has no rounding convention** — so the 36/32/27/21/15 boundaries are convention-safe.
The same holds for `variation_band`, `P_BLOWOUT_BINS` and the margin thresholds, which are all
interval tests.

**And prop lines end in `.5`**, so ties at the line itself cannot occur by construction.

**⚠ Two residual exposures worth noting:**
1. **Line 397's cache-key rounding** uses Python's half-to-even. Two genuinely different
   `att_mean` values that round to the same 0.1 share a cached CDF — **a deliberate trade, but the
   boundary case is convention-dependent.**
2. **The reporting rounds feed `factor_fits` and `platt_fits` INTO `baseline_ladder_runs`** — so the
   **stored** coefficients are half-to-even rounded, while any Postgres re-derivation would round
   half-away-from-zero. **These are audit records, not inputs**, so the impact is cosmetic — but a
   comparison between a stored fit and a recomputed one could differ in the last digit.

**Net: the 14.5% failure mode does not apply to NBA's tier assignment.** The risk is confined to the
compound-CDF cache key and to displayed/stored precision.

### ⚠ MEASURE THE ACTUAL FIRING HISTORY, NOT THE DESIGNED SCHEDULE
> *"MLB's real, intended **'runs four times daily' schedule was found, ON DIRECT MEASUREMENT, to
> actually fire CLOSER TO THREE TIMES DAILY in practice — ONE OF THE FOUR INTENDED TIMES NEVER FIRED
> AT ALL across the entire window checked** — and **a different scheduled run was found to FREQUENTLY
> FAIL AND SILENTLY RETRY MANY TIMES IN A ROW before finally succeeding, pushing its REAL, USABLE
> OUTPUT WELL PAST ITS INTENDED TIME WINDOW ON A RECURRING BASIS.**
> **For NBA: once any scheduled or recurring process exists, MEASURE ITS ACTUAL REAL FIRING HISTORY
> DIRECTLY rather than trusting the documented or designed schedule — a schedule that LOOKS CORRECT ON
> PAPER CAN DIVERGE SUBSTANTIALLY from what's actually happening in production.**"*

**This is measurable for NBA the moment the season starts**, and it bears on three time-sensitive
assumptions:
- **P2 at 01:00 PT** — already **two hours tighter** than the 6am ET window the publishing-lag research
  endorsed. **A silent-retry delay would erode what margin remains.**
- **P3 at 1:15 PM PT** — the cutoff assertion protects correctness, **but a late fire means a late
  slate.**
- **P1 Mondays 12:00 PT** — the least sensitive.

**`control.job_runs` and GitHub Actions run history both record actual fire times.** **Comparing
intended vs actual over the first two weeks is the check** — and the MLB case shows **one of four
intended times never firing at all**, which no amount of config inspection would reveal.
T1's blueprint §4n, flagged as *"directly relevant given **NBA is joining an ALREADY-MIGRATED
system**"*:
> *"MLB found **a real, confirmed case of A SIZE-LIMITING GUARD added specifically to work around a
> size constraint on its *ORIGINAL* DATABASE PLATFORM** — and **after migrating to a new platform with
> NO SUCH CONSTRAINT, THE GUARD WAS NEVER REMOVED**, so it **KEPT TRUNCATING EVERY NEW RECORD DOWN TO
> A TINY PLACEHOLDER STUB, DISCARDING WHAT WOULD OTHERWISE HAVE BEEN A FULL, SEVERAL-MEGABYTE REAL
> PAYLOAD, FOR AN EXTENDED PERIOD** after the migration was otherwise complete.
> **After any platform or database migration, EXPLICITLY AUDIT FOR SIZE LIMITS, FORMAT CONSTRAINTS OR
> DEFENSIVE GUARDS that made sense on the OLD platform but serve NO PURPOSE on the new one — a guard
> like this FAILS SILENTLY (it doesn't error, it just QUIETLY DISCARDS DATA) and can GO UNNOTICED FOR
> A LONG TIME.**
> **If NBA's own build ever needs to work around a TEMPORARY platform limitation, DOCUMENT THAT GUARD
> CLEARLY ENOUGH THAT REMOVING IT IS AN EXPLICIT, TRACKED FOLLOW-UP once the limitation is gone, NOT
> something left to be REDISCOVERED BY ACCIDENT LATER.**"*

**⚠ NBA inherited a codebase that was built for D1 and migrated to Postgres (D1 decommissioned
2026-08-12).** **Any D1-era size or format guard in shared code is exactly this hazard**, and NBA
workers reuse MLB-derived patterns throughout.

**Known size-related guards in NBA's own code, each worth checking against its stated reason:**
| Guard | Original reason | Still valid? |
|---|---|---|
| **`slim()` column filter** — drops `_RANK` and name padding | keep per-season JSON manageable | ✅ real, and the columns are genuinely unused |
| **Chunked / batched upserts** | Worker CPU and request limits | ✅ Cloudflare limits persist |
| **`raw.githubusercontent.com` over the Contents API** | **the 1 MB silent-empty bug** | ✅ the limit is real and current |
| **`max_rows` 500 on the bridge** | tooling cap | ✅ external, not ours |
| **The `>17-minute` period sanity gate** | catch a silently-ignored `Period` parameter | ✅ |

**None of these is a stale D1-era guard on current evidence** — but **the audit the rule prescribes
has not been run against shared/inherited code**, which is where the MLB instance lived.

**And NBA has one guard that fits the "document it for removal" instruction and does not carry that
note**: the **`BT_LADDER_STEPS` override** silently flattens the per-prop `LADDER_DEPTH` table. It is
a legitimate escape hatch, **but nothing marks it as one that should not be left set.**

### ⚠ A FIELD CAN SURVIVE IN AN ARCHIVE FOR FAR FEWER DAYS THAN THE TABLE APPEARS TO COVER
> *"**A related, confirmed real archival gap worth checking for directly**: **a specific field needed
> for later reconstruction was found to survive in an archive table for ONLY 2 OF 34 REAL RETENTION
> DAYS, DESPITE THE TABLE APPEARING TO HOLD FULL HISTORICAL DATA FOR THE WHOLE WINDOW** — **a genuine,
> UNFIXED FIELD-LEVEL ARCHIVAL BUG, not a retentio[n policy]**."*

**Row-level completeness does not imply field-level completeness.** A table can pass every row count
and date-coverage check while a specific column is null for all but a handful of days.

**⚠ NBA's completeness checks are ROW-LEVEL.** `check_delta_gaps.py` audits *"no missing dates,
games, teams or rosters"*; the certifiers assert freshness and row counts. **None is recorded as
checking per-column null rates over the retention window.**

**NBA already has three confirmed instances of exactly this shape:**
| Case | Row-level | Field-level |
|---|---|---|
| `nba_ref.arenas` | ✅ 30 rows | ❌ **`altitude_ft` 0/30, `timezone` 0/30, `capacity` 19/30** |
| The position column | ✅ rows present | ❌ **empty for three sessions** |
| `player_splits` | ✅ rows present | ❌ **only ONE season can exist — the PK omits `season`** |

**The check is one query per table**: `count(*)` vs `count(col)` per column, grouped by date.
**It would have surfaced all three immediately.**

### ⚠⚠ STALE-CDN RISK ON THE COMMIT → LOAD CHAIN
T1's blueprint §4m:
> *"**A CDN or edge cache in front of a raw file-serving endpoint — e.g. a raw-content URL for a
> hosted git repository — can serve A STALE, PRE-DEPLOY VERSION OF A FILE FOR SEVERAL MINUTES AFTER A
> REAL, SUCCESSFUL DEPLOY.**
> MLB confirmed this produced **TWO SEPARATE FALSE 'the change didn't actually land' conclusions**
> before learning to **verify through THE PLATFORM'S OWN API-LEVEL FILE-READ TOOL rather than fetching
> the raw public URL directly.**"*

**NBA's entire load path runs through that surface:**
- Every writer Worker fetches committed JSON from **`raw.githubusercontent.com`** — chosen
  deliberately because *"the GitHub Contents API **silently returns EMPTY above 1 MB**."*
- **`load_baseline_ladder.py` fetches the artefact over HTTP from the repo**, with the workflow's own
  note: *"**COMMIT BEFORE LOADING** … fetches over HTTP from raw.githubusercontent, **NOT from the
  runner's local disk**."*

**The two surfaces fail in opposite directions, which is the trap:**
| Surface | Failure |
|---|---|
| Contents API | **silently EMPTY above 1 MB** |
| `raw.githubusercontent.com` | **silently STALE for minutes after commit** |

**⚠ P2 commits the ladder and loads it IN THE SAME RUN** — the shortest possible write-to-read gap,
and therefore the highest stale-read exposure. **A stale load would ingest the PREVIOUS day's artefact
while reporting success.**

**Detectable after the fact**: `baseline_ladder_runs.source_file` records what was loaded, and
`baseline_ladder.asof` would reveal a wrong date. **Nothing asserts freshness BEFORE loading.**

**A cheap guard exists**: the loader already knows the expected `asof`; **asserting that the fetched
artefact's own `asof` matches before writing** turns a silent stale load into a loud failure — the
same shape as the patcher's anchor assertions.

**And it explains T3's polling behaviour**: *"a newer commit landed after my last push"*, *"still not
committed — let me check the run directly rather than keep polling blindly."* **Polling a raw URL for
a just-committed file is exactly the pattern that produces false negatives.**

### ⚠⚠ A ROLLING RE-VERIFICATION WINDOW WAS SPECIFIED — NBA DECIDED THE OPPOSITE
T1's blueprint §4k:
> *"**Any pipeline that FINALIZES DATA for a recently-completed event should use a BOUNDED ROLLING
> RE-VERIFICATION WINDOW, NOT a single, PERMANENTLY-FROZEN CUTOFF.**
> **Real, external COMMERCIAL SPORTS-DATA PRACTICE (and general idempotent-pipeline literature)
> converges on REDOING A 3–4 DAY, UP TO ROUGHLY A WEEK, ROLLING CORRECTION PASS on recently-completed
> games, since OFFICIAL STAT CORRECTIONS ARE ROUTINELY ISSUED MULTIPLE DAYS AFTER A GAME CONCLUDES.**
> **Build the same rolling re-verification window into NBA's own outcome/game-log pipeline FROM DAY
> ONE — a HARD-FROZEN 'FINAL' CUTOFF the moment a game ends WILL MISS REAL, LEGITIMATE CORRECTIONS
> that arrive later.**"*

**⚠ NBA explicitly decided the opposite, and recorded the reasoning:**
> *"**Late NBA stat corrections are NOT chased** — treat each day's baseline as **a consistent
> point-in-time snapshot**."*

**Both positions are defensible, and they optimise for different things:**
| Position | Optimises for |
|---|---|
| **Rolling 3–7 day re-verification** (blueprint) | **accuracy of the historical record** — corrections land |
| **Point-in-time snapshot, no chasing** (NBA) | **reproducibility** — *"a live query at 9am vs 10am could return different data if a correction posted in between"* |

**The NBA choice is coherent with its as-of discipline**: a baseline that changes retroactively breaks
walk-forward parity, and **as-of contamination is already this system's recurring bug** (four
instances). **Chasing corrections means yesterday's baseline can change after today's was built from
it.**

**⚠ But the blueprint's warning still applies to ONE place the NBA reasoning does not cover: OUTCOME
GRADING.**
- **The baseline** must be point-in-time — correct as decided.
- **`board_outcomes`** is the *truth* the calibration learns from. **A stat correction that lands three
  days after a game changes whether a leg actually hit.** Freezing that is not reproducibility — it is
  **training on a known-stale label.**

**The blueprint names exactly this pipeline**: *"NBA's own **outcome/game-log** pipeline."*

**Whether the grader re-verifies recent dates is unverified.** It is idempotent on its key, so a
re-run would update — **but nothing is recorded as scheduling one.** `check_delta_gaps.py` audits
**completeness** (are games present), not **correctness** (did values change).

**A concrete NBA-specific reason this matters**: minutes and rebounds are among the most commonly
corrected NBA box-score fields, and **`mu_role` is a rolling mean of minutes** — so a correction
affects both the graded outcome *and* every subsequent projection built on that game.

### ⚠⚠ UPSERT UPDATE-CLAUSE AUDIT — a silent-staleness bug class, never checked
T1's blueprint §4k:
> *"**When using an `ON CONFLICT DO UPDATE`-style upsert, VERIFY EVERY COLUMN THAT SHOULD EVER BE
> REFRESHED ON A REPEAT WRITE IS ACTUALLY LISTED IN THE UPDATE CLAUSE.**
> MLB found **a real, specific bug where SEVERAL COLUMNS WERE MISSING from an upsert's update list** —
> meaning **those columns were SET CORRECTLY ON FIRST INSERT but SILENTLY FROZEN AT THAT ORIGINAL
> VALUE FOREVER AFTERWARD, NEVER UPDATED AGAIN.**"*

**No error, no symptom.** The row exists, the value looks plausible, and it is from whenever the row
was first written.

**⚠ NBA is broadly exposed — every writer Worker upserts**: `nba_ref.teams`, `players`, `arenas`,
`officials`, `team_aliases`, `player_aliases`, the `nba_stats` tables, `baseline_ladder`
(*"idempotent on PK (asof, player_id, game_id, prop, period, ot_rule, line)"*), `board_outcomes`.

**Two NBA findings already match the shape:**
- **`nba_ref.arenas`: 19/30 have `capacity`, 0/30 have `altitude_ft`/`timezone`** — a partially
  populated table where some columns never refresh
- **The position column was empty for three sessions** — *"the scraper never extracted it **and** the
  worker never wrote it"* — the same frozen-silently outcome from the write side

**⚠ And the differential layer depends on this working.** T3 records that the snapshot tables *"had to
exist BEFORE the next upsert **because the writers OVERWRITE**."* **If a snapshot column is missing
from its update clause, the differential compares against a frozen value and correctly reports NO
CHANGE — a false negative on trades, signings and renames**, which is precisely what that layer
exists to catch.

**The check is mechanical**: for each writer, compare the `INSERT` column list against the
`DO UPDATE SET` list. **Not recorded as having been run.**

### ⚠ NBA'S DIRECT DISPATCH HAS NO "BUSY" REJECTION
T1's blueprint §4j:
> *"**When a job appears stuck in a running state with no progress, the correct response is usually to
> WAIT AND RE-CHECK via a lightweight status query, NOT to repeatedly manually retry it.**
> MLB's system **holds a GLOBAL LOCK for a bounded window per acquisition**, and **a legitimate
> in-progress background cycle will correctly REJECT repeated manual re-triggers with a 'BUSY'
> response rather than a real failure — that's THE SYSTEM BEHAVING SAFELY, NOT A BUG TO WORK
> AROUND.** Give a stuck-looking job **one to two minutes** before concluding it needs intervention."*

**⚠ NBA workers are dispatched DIRECTLY, bypassing the queue and its lock** — the deliberate
no-orchestrator design. **So the "busy" rejection MLB relies on may not exist for NBA.** A re-trigger
of an NBA worker mid-run **may start a second concurrent run rather than being refused.**

**What protects NBA instead**: **GitHub Actions concurrency groups** per pipeline
(`alphadog-nba-p1-weekly` etc.), which serialise **workflow** runs. **They do not protect a direct
`run_job` call to an individual Worker.**

**Where this could bite**: the writer Workers are idempotent on their PKs (`baseline_ladder`,
`board_outcomes`), **so a double run should be safe for those.** **The delta worker is the one to
check** — it appends to season files and maintains `known_empty_games`.

### ⚠ DELIBERATELY-DUPLICATED FILES DRIFT SILENTLY — one pair already has
> *"**Two files meant to be exact copies CAN SILENTLY DRIFT OUT OF SYNC** — a static fallback file was
> **a full version behind the deployed worker**, with **only the SELF-REPORTED VERSION STRING
> revealing the drift.** **Periodically VERIFY rather than ASSUMING a 'kept in sync' file stays that
> way.**"*

| NBA pair | Status |
|---|---|
| `nba_config.role_tiers` ↔ `ROLE_TIERS` | ✅ verified identical 2026-09-20 |
| **`classification_config.minutes_mixture` ↔ the recipe** | ❌ **DRIFTED** — three configured components unimplemented |
| Singles recipe ↔ combos recipe constants | ⚠ unverified |
| Certified recipe ↔ production patcher | ✅ **anchor assertions fail loudly** — the model to copy |

**`baseline_ladder.recipe_version` exists per row**, so the version-string mechanism the MLB case
relied on is present — **what is missing is anything comparing it against the config's expectations.**

### ⚠ SYSTEMIC RISK · "a function is called but was never actually defined"
T1's blueprint §4h, flagged as *"a SYSTEMIC RISK CATEGORY, NOT A ONE-OFF"*:
> *"MLB found **at least TWO MORE separate, real cases of DISPATCH CODE CALLING A FUNCTION THAT SIMPLY
> DIDN'T EXIST anywhere in the file being called from** — **confirmed via DIRECT GREP SHOWING EXACTLY
> ONE MATCH (the call site) and ZERO MATCHES FOR A DEFINITION.**
> **Both went UNDETECTED UNTIL THE EXACT RARE CODE PATH that triggered them was finally exercised, at
> which point they caused an IMMEDIATE, REPRODUCIBLE CRASH.**
> **Given this has now happened AT LEAST THREE SEPARATE TIMES in the same codebase, treat it as a
> systemic, recurring risk for NBA specifically: WHENEVER WIRING A NEW NBA WORKER OR CODE PATH INTO
> ANY SHARED DISPATCH LOGIC, DIRECTLY GREP-VERIFY THAT EVERY FUNCTION IT CALLS ACTUALLY HAS A REAL
> DEFINITION SOMEWHERE REACHABLE.**
> **DON'T RELY ON THE CODE COMPILING OR THE COMMON PATH WORKING as proof that AN ERROR-RECOVERY OR
> EDGE-CASE BRANCH IS ALSO SOUND.**"*

**The detection method is exact and cheap**: grep the function name — **one match means call site
only, zero definition.**

**Why NBA is exposed**: every new worker is wired into `admin-sql`'s **dispatch branch**, and the
shared dispatch is precisely the *"shared dispatch logic"* named. **The rare paths are the risk** —
error-recovery branches, the `mode` variants (`weekly`, `probe`, `backfill`), replay paths, and
`ot_rule = exclude` handling. **These run rarely or never, so the common path working proves nothing
about them.**

**Three NBA instances of the adjacent family are already recorded** — not missing definitions, but
**code paths that never ran and were wrong**:
- the delta worker's **docstring promised** starter-status/officials gap detection that *"I never
  actually implemented"*
- the measure-types mapper writing **`usg_pct`/`reb_pct` columns that do not exist on the team table**
- **`SLEEPER_SPORTS` defaulting to MLB**, writing to a path nothing committed

**The prescribed check has not been run against the NBA dispatch surface.**

### ⚠ EMPTY FACTOR INPUTS ARE NOT LABELLED "UNAVAILABLE"
T1's blueprint §4d:
> *"**When a factor CANNOT BE HONESTLY IMPLEMENTED because the real underlying data DOESN'T EXIST
> YET, SAY SO EXPLICITLY IN THE SYSTEM ITSELF** — **a clearly-labelled 'NOT YET AVAILABLE, NO VERIFIED
> DATA SOURCE' status** — **rather than approximating it with a guess OR SILENTLY LEAVING IT AS A
> MISLEADING ZERO.**
> MLB **hardcoded an umpire-tendency factor to an EXPLICIT 'UNAVAILABLE' STATUS** and **blocked a
> wind-direction factor on missing reference data** — **rather than faking plausible values.**"*

**NBA has the same situation, unlabelled:**
| Factor | State | Labelled? |
|---|---|---|
| **Altitude** | `arenas.altitude_ft` — **0 of 30** | ❌ column simply empty |
| **Jet lag / travel direction** | `arenas.timezone` — **0 of 30** | ❌ |
| **D1 referee tendency** | capture built, **0 rows until the season** | ⚠ known, but no status field |
| Tier C props | *"need play-by-play we don't have"* | ✅ excluded from the taxonomy entirely |

**An empty column and a declared "unavailable" status are different things.** A factor reading an
empty column yields **a silent zero or NaN** — the *"misleading zero"* named here, and exactly what
`stddev(factor_value) > 0` exists to catch.

**`nba_config.factor_registry` has 67 rows and could carry the status field**, following the umpire
precedent: present in the registry, visibly not contributing, impossible to mistake for a measured
zero.

### ⚠ TUNABLES AS PYTHON LITERALS ARE NOT CALIBRATION-ADDRESSABLE
> *"**Every tunable numeric parameter gets its OWN DEDICATED DATABASE COLUMN, never embedded as a
> literal inside an opaque formula-expression string** — **this is what actually lets A CALIBRATION
> LOOP ADJUST ONE SPECIFIC VALUE DIRECTLY** rather than needing to parse and rewrite a formula
> string."*

**The rule's purpose is mechanical, not stylistic**: a calibration loop **cannot tune what it cannot
address.**

**✅ Honoured** in `factor_profile_cells` (dedicated `cap`/`lift`/`penalty`/`coefficient` columns) and
`stat_decay_config` (a column per parameter).

**⚠ Not honoured** in the certified recipes: `MAX_TIERS`, `MIN_PER_TIER`, `TIER_BLEND_K`,
`SHIFT_LAMBDA`, `BLOWOUT_MARGIN`, `COMPETITIVE_MARGIN`, `LADDER_DEPTH` are **Python literals**.
Env-overridable, **but not addressable by an automated loop** — which is the capability the rule
preserves.

### ⚠⚠ MORE DATA DOES NOT FIX RARE-EVENT CALIBRATION — three independent lines of evidence
T1's blueprint §4d, flagged as *"worth taking seriously for NBA's own rare-event props — **whatever
those turn out to be, likely triple-doubles, specific low-frequency defensive stats**"*:

> *"MLB found, **via THREE SEPARATE INDEPENDENT LINES OF EVIDENCE** — **a machine-learning model's own
> calibration testing**, **player-level statistical research**, and **park-level factor research** —
> that **simply ADDING MORE HISTORICAL DATA VOLUME DOES *NOT* FIX CALIBRATION for genuinely rare,
> high-variance events.** They need **REAL FEATURE RICHNESS AND/OR DEDICATED MODELLING TREATMENT, NOT
> JUST A BIGGER DATASET.**
> **DON'T ASSUME an NBA rare-event prop's calibration problem WILL RESOLVE ITSELF once more games are
> collected.**"*

**This is the most directly applicable warning to NBA's current open state**, and it names NBA's own
rare-event props correctly in advance — **triple-doubles and low-frequency defensive stats.**

**Four NBA items sit exactly here:**
| Item | Status |
|---|---|
| **blocks, steals** | **CLOSE, not certified** — *"the noisiest per-game stats in the sport"* |
| **P(0 blocks) for ~1.5 bpg players** | **−4.3 pp, n=3900, *"persists at ANY lambda"*, same signs in holdout** |
| **triple-double** | in the taxonomy; **no certification recorded** |
| **goblin/demon tails beyond ±6** | **uncertified** — and tails are rare events by definition |

**The instruction forecloses the tempting response.** The season will add ~1,230 games and millions of
legs, and **the natural assumption is that blocks and steals will certify once the sample grows.**
**Three independent lines of evidence say they will not.**

**What the source says is needed instead**: *"**real feature richness and/or dedicated modelling
treatment**."*
- **Feature richness** → the opponent factors already identified (opponent paint share 0.30/0.37 for
  blocks, opponent TO rate 0.27/0.26 for steals) — **real and measured, but Brier +0.1–0.3% overall**
- **Dedicated modelling treatment** → the §4b prescription of **a separate, clearly-labelled
  calibration path with its own prior-strength scale and hard floor/ceiling caps** for thin-data props
  — **which NBA does not have** (see the uncertified-props entry)

**Two of the three MLB evidence lines have NBA analogues already**: the harness's own calibration
testing (*"persists at any lambda"*) and player-level research. **The conclusion they support is the
same one.**

### ⚠ NO MONOTONIC CONSTRAINTS AT THE FACTOR LEVEL
T1's blueprint §4d, third academic caution:
> *"**Monotonic constraints are genuinely valuable SPECIFICALLY IN RARE-EVENT, LIMITED-DATA
> situations**, where **a model might otherwise OVERFIT A RELATIONSHIP THAT SPURIOUSLY REVERSES
> DIRECTION** — e.g. **a factor that should ONLY EVER INCREASE a rate getting fit to OCCASIONALLY
> DECREASE it, purely from NOISE IN A THIN SAMPLE.**"*

**No sign constraint is recorded in NBA's factor fitting.** Coefficients are fit in log-rate space
freely, so **a factor with a known direction can be fit against that direction in a thin cell.**

**Where it bites**: the rare-event props are **exactly the unresolved ones** — blocks, steals (CLOSE)
and the **goblin/demon tails** (uncertified).

**And the concept is present in the standard but absent from the build**: lesson #4's pre-stated
falsification bar names **"required MONOTONICITY"** as one of its three components.

**Already monotonic**: the **ladder** (rungs ordered) and the **upper-only ceiling** fix, which was
about preserving tail ordering. **The gap is at the factor level.**

### ⚠ SHRINKAGE INTENSITY IS NOT BOOTSTRAP-ESTIMATED PER CELL
> *"**Shrinkage does not automatically improve results, and the correct shrinkage amount is HARDEST TO
> ESTIMATE EXACTLY WHERE IT'S NEEDED MOST (low sample size).** The established countermeasure is
> **BOOTSTRAP-BASED ESTIMATION of shrinkage intensity, RE-ESTIMATED PERIODICALLY FROM EACH CELL'S OWN
> REAL OUTCOME HISTORY — not one static, hand-picked global constant.**"*

**NBA is partly there**: `k_stab` is **per prop and measured** (STL 125, TOV 60), and
`stat_decay_config` holds 13 per-stat values — **not a global constant.**
**Not done**: bootstrap estimation, and **per-cell re-estimation from that cell's own outcome
history.** Values are fit on TRAIN and carried.

**⚠ T8 measured the underlying difficulty directly**: *"data-fit prior strength is **k≈2 against the
population** but **k≈100–250 against tier-mates (circular)**"* — **two orders of magnitude apart
depending on the reference chosen.** That is this caution stated in numbers, and it is currently
resolved by judgement rather than by bootstrap.

### ⚠ NO PUBLISHED STABILIZATION-POINT REFERENCE WAS SOURCED
T1's blueprint §4d: *"**Build (or find) an equivalent 'stabilization point' reference table for EVERY
NBA prop BEFORE FINALIZING SHRINKAGE DESIGN.**"*

**Why MLB's version mattered**, in the source's own words:
> *"This precise, quantified reference **directly explained *WHY* certain props RESISTED CALIBRATION
> NO MATTER HOW MUCH SAME-SEASON DATA WAS ADDED** — **it wasn't a pipeline bug, it was a REAL,
> MEASURED PROPERTY OF THE STAT ITSELF.**"* MLB's range ran from **60 PA (strikeout rate)** to
> **over 1,600 PA (extra-base-hit rate, which essentially never fully stabilizes within a season)**.

**NBA met the per-prop requirement by internal measurement** — `stat_decay_config`'s
`shrinkage_stabilization_games` (minutes 10 → fg3_pct 300) and the per-prop `k_stab` (STL 125, TOV 60).
**What was not done is the external cross-check the instruction asks for**: *"source the closest
available real research **the same way MLB did**."*

**What it would settle:**
- Whether `fg3_pct` at **300 games** and `blocks` at **50** are right
- **Which props can NEVER be certified within one season** — known in advance rather than discovered
  prop by prop

**And it likely explains the four CLOSE props.** The harness header records *"blocks more 70–75:
−4.3 … **persists at any lambda**; holdout shows the same signs."* **"Persists at any lambda" is what
an unreachable stabilization point looks like** — no shrinkage tuning fixes it. That is a second,
independent reason alongside T9's *"they are opponent-driven"*.

### ⚠ THE FACTOR LIST WAS NEVER BENCHMARKED AGAINST A WORKING SYSTEM
> *"**Benchmark the planned factor list against REAL, PUBLICLY-VERIFIED SYSTEMS BEFORE FINALIZING
> it.** MLB checked its list against **a real, independently-verified industry-leading projection
> product** and **adopted several concrete refinements from studying HOW THAT SYSTEM ACTUALLY
> IMPLEMENTS THINGS**: **matchup-specific rather than team-aggregate defensive metrics**; **treating
> 'quality of surrounding lineup' as a DISTINCT input**; **role-specific adjustments for players who
> don't fit a standard usage pattern.**"*

**Two of the three refinements landed in NBA anyway:**
| Refinement | NBA |
|---|---|
| Matchup-specific defence | ✅ M1 two-way ridge (111,768 ratings) — ⚠ but **interaction-only**, and team-aggregate `defense_vs_position` is what most props read |
| **"Quality of surrounding lineup" as a distinct input** | ⚠ **GAP** — `lineup_synergy` (8,000 rows) and on/off data exist; the factor lock names *"teammate shooting quality"* (assists) and *"teammate competition / lineup geometry"* (rebounds) as **primary drivers** — **neither is a built, surviving factor**, and A2 was retracted |
| Role-specific adjustments | ✅ `ROLE_TIERS` + the discontinuity override |

**NBA's research was source-rich but not system-benchmarked.** OpticOdds, Unabated, DataStreak,
RotoGrinders, peer-reviewed papers and Gemini are **sources of findings**; **none is a working
projection system whose implementation was studied.** The stated MLB benefit came specifically from
*"studying how that system actually implements things"* — structural choices a paper does not give
you. **DARKO is already a data source here and publishes its methodology.**

### ⚠ NO VALIDATION STEP BETWEEN GRADING AND THE CALIBRATION REFIT
T1's blueprint §4c specifies the grader's isolation as **a load-bearing safety property**:
> *"The grader **only ever reads** from historical board/game-log tables and **only ever writes to a
> dedicated outcome-history table** — **it never touches any table the live board-serving path
> reads.** **This means a bug in the grader CANNOT CORRUPT TODAY'S LIVE BOARD; its blast radius is
> limited to producing wrong or missing TRAINING data**, which **A SEPARATE DOWNSTREAM VALIDATION STEP
> CHECKS BEFORE ANY CALIBRATION CORRECTION IS EVER APPLIED.**"*

**NBA has the read/write isolation** — `grade_board_outcomes.py` reads snapshots and game logs, writes
`nba_market.board_outcomes`.

**⚠ But the blast radius is not contained, because the second clause is missing.** P2 runs
**grade (step 3) → … → calibration refit (step 14)** in one workflow, and the refit writes
`ladder_calibration_asof`, which **`build_final_hp.py` reads on the next run.**

**The path exists**: bad grades → bad `log_odds_shift` → bad `final_hp`.

**The ordering is correct and deliberate** (*"grading must run before the refit, or yesterday's
evidence is invisible to today's cells"*). **What is missing is the validation step between them** —
the thing that makes the grader's isolation actually load-bearing.

**Compounding factors already recorded**: the refit has **no over-flattening check**.
**⚠ CORRECTED 2026-09-20 on the magnitude guard**: the *recipe* **does** carry one —
`classification_ladder_v12.py` line 670: **`if shift > 0.15: continue`**, so a Platt fit implying a
shift above 0.15 is **discarded outright** and the leg keeps `p_raw`. `max_shift` is logged per fit.
**That is exactly the prescribed "reject a statistically valid fit that implies too large a
correction" guard.**
**What is still unverified**: whether **`build_asof_calibration.py`** — the separate weekly
production refit that writes `ladder_calibration_asof` — carries the same threshold. **Only the
recipe has been read.** **Two guards absent on this path, not three.**

### ⚠ PROP FORMULAS NOT FLAGGED AS VALIDATED-OR-NOT
> *"**Map every canonical prop to an explicit, direct expression against raw game-log columns**…
> **keep this map IN ONE PLACE, VERSIONED**, and **FLAG any prop whose scoring formula hasn't been
> independently validated against a confirmed, authoritative spec AS A KNOWN, EXPLICIT GAP** rather
> than silently trusting an assumed formula — **the exact mechanism that would have caught the
> fantasy-score formula bug much earlier.**"*

**NBA's map is in three places**: `prop_taxonomy` (the list), `norm_market()` (board key → prop), and
**`PROPS` in the recipe (prop → raw column, e.g. `"col": "PF"`)**. **The recipe's `PROPS` is the real
expression map for singles.**

**The validation was done for fantasy** — T9 verified the scale across all three apps — **but is
recorded in a transcript, not versioned beside the map.**

**Not flagged as validated-or-not**: `double_double` (sentinel −1.0, no ladder), `stocks`, and the
period props.

### ⚠⚠ THE COST OF NOT HAVING THE COVERAGE-GAP DIAGNOSTIC — quantified
T1's blueprint §7f records what the missing diagnostic actually cost:
> *"MLB's own history includes **a real, COSTLY case of TWO PROPS RUNNING WITH ZERO ACTIVE CORRECTION
> FOR ROUGHLY TWO AND A HALF WEEKS AFTER A ROOT-CAUSE FIX, SHOWING REAL 30–45 PERCENTAGE POINT
> OVERCONFIDENCE GAPS, UNDETECTED UNTIL SOMEONE MANUALLY CHECKED** — **directly motivating the
> coverage-gap diagnostic.**"*

**Two and a half weeks. 30–45 percentage points. Found by a manual check, not by the system.**

**This is the concrete price of the gap already recorded above** — *"a (prop, side, high-confidence
bucket) combination showing a real, resolved-outcome deviation past a threshold **with zero active
correction covering it**."* **NBA has both inputs (`board_outcomes` 6.9M graded legs;
`factor_profile_cells` 35 cells against 460 relevance rows) and has not built the check.**

**⚠ And the trigger condition is one NBA will meet**: the failure appeared **after a root-cause fix** —
i.e. a correction was removed as no longer needed, and nothing replaced it. **NBA's band cells are
refit weekly and cells can drop out when a season's evidence changes**, which is the same shape.

**Related, from the same section — the recommended operating cadence:**
> *"**WEEKLY RECALIBRATION CHECKS, WITH TRIGGER-BASED RE-FITTING AND MANDATORY HUMAN REVIEW BEFORE
> APPLYING — NOT FULL UNATTENDED AUTOMATION.**"*

**NBA's refit is weekly-ish and fully unattended**: P2 refits at step 14, `build_final_hp.py` consumes
it next run. **Cadence ✅, trigger-based ❌, human review ❌.**

### ⚠ TWO DIAGNOSTIC SAFEGUARDS SPECIFIED FOR DAY ONE — neither built
T1's blueprint §4b names two **diagnostic-only (never automatically acting)** safeguards, *"since they
directly target the exact failure classes documented elsewhere in this package."*

**1. Coverage-gap check**
> *"surfaces any **(prop, side, high-confidence bucket)** combination showing **a real,
> resolved-outcome deviation past a threshold WITH ZERO ACTIVE CORRECTION COVERING IT** — **precisely
> the mechanism that would catch A SILENT FORMULA/CALIBRATION REGRESSION BEFORE IT RUNS FOR WEEKS
> UNDETECTED.**"*

**Both inputs exist**: `board_outcomes` (6.9M graded legs) and `factor_profile_cells` (35 fitted cells
against a **460-row** relevance matrix). **The 35-vs-460 gap is the exact surface this scans.**
**The stated purpose — catching a silent regression before weeks pass — is the failure an unattended
season-long pipeline is most exposed to.**

**2. Role/context-discontinuity check**
> *"**flags when a player's most recent real performance context differs sharply from their trailing
> sample** — a bench player suddenly starting, a return from a long injury layoff — **surfacing the
> risk that a baseline sample MIXES AN OLD, NO-LONGER-RELEVANT CONTEXT WITH THE CURRENT ONE.**"*

**⚠ NBA built the CORRECTIONS but not the FLAG.** Both named cases are already *acted on*: the
team-change discount and role-change detector handle *"a bench player suddenly starting"*; the return
ramp (A3) handles *"a return from a long injury layoff."*

**The specification is for a diagnostic, precisely because the correction may be wrong.** A silently
applied window reset on a misread context **produces a confident wrong number with nothing surfacing
it** — the same shape as tier misclassification being *"a quiet, indirect source of a wrong final
probability."*

### ⚠ UNCERTIFIED PROPS SHARE THE MAIN SYSTEM'S THRESHOLDS
T1's blueprint §4b prescribes a **separate, clearly-labelled calibration path** for thin-data props —
MLB has one for its *"expansion scope"* props with **a completely different prior-strength scale and
hard floor/ceiling caps the main system doesn't use**:
> *"**Design it as an EXPLICITLY SEPARATE, CLEARLY-LABELLED path FROM DAY ONE — don't let it SILENTLY
> SHARE THRESHOLDS with the main system, and DON'T ASSUME A FIX TO ONE TOUCHES THE OTHER.**"*

**NBA's uncertified props sit on the main path.** `fgm` and `fta` carry *"configs are the **closest
certified analogue** — NOT yet certified"* — i.e. **a certified prop's thresholds assigned by
analogy**, marked only by a code comment.

**Per-prop tuning exists** (`k_stab` measured per prop, `SHIFT_LAMBDA` per prop) — **but that is
parameter variation inside one system, not a separate path.** There is no distinct prior-strength
scale and no hard floor/ceiling caps for the thin props.

**The stated risk is the second clause**: *"don't assume a fix to one touches the other."* A fix
validated on points may or may not be right for `fta`, **and nothing marks the difference at
runtime.**

### ⚠ TIER MISCLASSIFICATION IS A SILENT WRONG-PROBABILITY SOURCE
> *"**Player/context classification tiers DETERMINE WHICH PRIOR A PLAYER GETS SHRUNK TOWARD — a
> misclassification here is a QUIET, INDIRECT SOURCE OF A WRONG FINAL PROBABILITY**, not just a
> display [issue]."*

**Exposure in NBA:**
- `role_tier` is derived from **`mu_role` = 20-game rolling mean, `min_periods=5`** — **5–19 games
  gives a tier from a thin window**
- **The team-change discount resets the window**: ≥5 competitive games with a new team → use only
  those. **A traded player is re-tiered on as few as 5 games**, and October is peak roster churn
- `role_tier is None` drops the leg (**visible**); **a wrong tier is silent**
- **T8's v9 doubled the stakes** — *"rate tiers ranked WITHIN role tier"* — so a misclassified role
  tier now selects the wrong prior on **both** dimensions

**No tier-stability or misclassification check is recorded.** A cheap one exists: **how often does a
player's `role_tier` change between consecutive slates**, and what is the distribution of `n_prior` at
the moment of tier assignment.

### ⚠⚠ NO "DON'T OVER-SHRINK A REAL SIGNAL" SAFETY VALVE
T1's blueprint §4b specifies one, with exact thresholds, and says to build it **from the start**:
> *"**Hierarchical Bayesian shrinkage needs an EXPLICIT 'don't over-shrink a real signal' safety
> valve**: once a player has **n ≥ 20 real observations** **AND** their raw rate **differs from the
> population prior by > 15 points**, **the prior is CAPPED at contributing NO MORE THAN 25% of the
> final estimate** — **preventing well-supported individual signal from being WASHED OUT just because
> it disagrees with the average.** **Build an equivalent into NBA's shrinkage design FROM THE START,
> NOT AS A LATER PATCH.**"*

**NBA has no such valve.** Its shrinkage machinery is **entirely protective in the other direction**:
| Mechanism | Direction |
|---|---|
| Empirical-Bayes prior strength (Efron-Morris) | decays with sample size — **shrinks less as n grows, but never caps the prior** |
| Per-prop `k_stab` (STL 125, TOV 60) | **shrinks MORE** for noisier props |
| `min_real_sample_threshold` on cells | *"cells under sample are **fully shrunk to prior**"* — **shrinks MORE when thin** |

**Every mechanism guards against trusting thin samples. None guards against distrusting thick ones.**

**⚠ And the symptom this valve prevents is already measured in NBA.** T8: *"the bias is **monotone in
the variation band**… **the quantile tier prior COMPRESSES THE EXTREMES**"*, with **rebounds ELITE
under-predicted in BOTH seasons** — a structural miss kept as a band cell.

**"The tier prior compresses the extremes" is precisely what the valve exists to stop.** NBA
corrected it **after the fact with per-band cells**; the blueprint prescribed preventing it
**structurally, from the start**.

**Worth evaluating**: whether adding the valve would remove the need for some band cells — and per the
T8 rule, a cell whose sign is consistent across seasons is *structural*, which is what an
over-compressed prior would produce.

### ⚠ RELIABILITY TIERS SHOULD BE A PURE FUNCTION OF SAMPLE COUNT
> *"**Keep sample-size reliability tiers PURELY a function of sample count, NOT a blend of other
> signals** — **MLB explicitly TRIED AND REVERTED** an attempt to make this 'smarter'; **the locked,
> simpler version was correct.**"*

**A tried-and-reverted experiment, recorded so it is not repeated.**
**To check in NBA's confidence model**: `c_exist`, `c_quality` and `f_prov` are reliability-adjacent.
Whether any blends a non-count signal is unverified. *(`f_role` is an empirical error measurement by
role band, not a reliability tier, so it is likely out of scope — but worth confirming.)*

### ⚠⚠ SHARED-EVENT PROP PAIRS — an explicit T1 check, never run
T1's blueprint §4b records a bug where **two props measuring the *literally identical underlying
event*** received **different shrinkage treatment**, and the inconsistency **grew from a 40%
violation rate to 97% by player tier before being caught.**

> *"**For NBA: CHECK EXPLICITLY for any pair of props/combo-stats that SHARE AN UNDERLYING EVENT AT A
> GIVEN THRESHOLD** — e.g. **a single-category prop crossing zero versus a COMBO PROP THAT NECESSARILY
> CROSSES ZERO AT THE SAME MOMENT** — **and make sure they receive IDENTICAL TREATMENT. Don't let two
> nominally-different props that are SECRETLY THE SAME EVENT drift apart.**"*

**NBA's 28-prop taxonomy contains this shape repeatedly:**
| Pair | Shared event at the threshold |
|---|---|
| `blocks` 0.5 / `stocks` 0.5 | with 0 steals, `stocks ≥ 1` **is** `blocks ≥ 1` |
| `steals` 0.5 / `stocks` 0.5 | the mirror |
| `points` 0.5 / `pts_reb`, `pts_ast`, `pra` 0.5 | co-trigger at the bottom rung |
| `rebounds` 0.5 / `reb_ast` 0.5 | same |
| `double_double` / its components | DD is **determined by** the component props |

**Partial protection exists:**
- ✅ Combos are **simulated from calibrated marginals** — *"joint structure, never a direct fit"* — so
  a combo inherits its components' treatment by construction
- ✅ `stocks` is explicitly recorded as *"inherits the blocks/steals floor"*

**Where it could still drift:**
- ⚠ Singles and combos are **separate certified files with separate constants**
- ⚠ `SHIFT_LAMBDA` is **per prop** (`blocks: 0.5`, `steals: 0.5`), while combos route through a
  different recipe entirely
- ⚠ `double_double` carries a **sentinel −1.0 and no ladder** — a third path

**The check is not recorded as having been run.** And its failure mode is **monotonicity**, which the
calibration-technique guidance independently names as disqualifying.

### ⚠ DUPLICATED CONSTANTS ACROSS THE TWO CERTIFIED RECIPES
T1's blueprint names this as a *"**real, costly duplication risk**"*: MLB **implemented the Wilson
sample-support clamp in TWO SEPARATE CODE LOCATIONS**, so any future threshold change had to be
applied to both.

**NBA has the same shape by design**: the **singles recipe** (`classification_ladder_v12.py`) and the
**combos recipe** (`combos_ladder_v1.py`) are separate certified files, **each carrying its own
constants** — already noted as *"a change must be applied to BOTH."*

**Constants that exist in more than one place:**
| Constant | Locations |
|---|---|
| Wilson clamp threshold (n=30) | singles recipe; combos recipe |
| `MAX_TIERS` = 24, `MIN_PER_TIER` = 15, `TIER_BLEND_K` = 5 | singles recipe; **`nba_config.role_tiers` / `classification_config`** |
| `LADDER_STEPS` / `LADDER_DEPTH` | singles recipe; **combos recipe has its OWN `LADDER_STEPS`** |
| `ROLE_TIERS` (6 bands) | singles recipe **and** `nba_config.role_tiers` — **verified to agree 2026-09-20** |
| Blowout margins (15 / 20) | singles recipe; `nba_config.classification_config.minutes_mixture` (`blowout_threshold_margin: 20`) |

**The config/code pairs are the safer half** — `role_tiers` was checked and agrees. **The
singles/combos pair is the riskier one**, since both are Python and neither reads the other.

**Already-recorded divergence of exactly this kind**: `minutes_mixture` in `classification_config`
specifies `dud_lognormal`, `tiered_inelastic` renormalisation and a **per-team** `E[min|blowout]` —
**none of which the recipe implements.** **The config and the code have already drifted apart once.**

### ⚠ THREE FACTOR AUDITS NAMED IN T1, NONE RUN
The blueprint lists five enrichment-factor bug patterns *"all real, all worth actively checking for in
NBA's own factors."* **Three are single queries against tables that already exist.**

**1. Cap-presence audit** *(pattern 2)*
> *"**one factor's lookup table left UNCAPPED while every sibling factor in the same system has
> explicit caps** — **the INCONSISTENCY ITSELF is the red flag; audit cap presence across the WHOLE
> factor registry AT ONCE, not factor-by-factor.**"*
**`nba_config.factor_profile_cells` has dedicated `cap` / `lift` / `penalty` / `coefficient`
columns.** One query: which cells carry a null `cap` where siblings do not.

**2. Contribution-discrimination audit** *(pattern 4)*
> *"**a factor showing the IDENTICAL contribution value across wildly different real cases** — an
> elite player and an average player getting **the exact same adjustment** — **a sign the factor is
> simply HITTING ITS OWN CAP for nearly everyone, not actually discriminating, even though the code
> 'runs' without error.**"*
**This is NOT caught by the `stddev(factor_value)` check** — the inputs differ, the contributions do
not. **`final_hp`'s `breakdown` stores per-factor contributions**, so the test is: distinct
contribution values per factor.

**3. Per-game vs cumulative audit** *(pattern 1)*
> *"**a cumulative/season-total stat used as if it were a per-game rate**, with no division by games
> played — **causing one factor to SWAMP EVERY OTHER FACTOR COMBINED.** **Tell: the source field name
> says 'TOTAL' while the consuming code treats it as 'PER GAME'.**"*
**`nba_stats.player_career_totals` is cumulative; `player_game_log` is per-game.**

### ⚠ RSS AGGREGATION — a named fix for a live multicollinearity, not implemented
*Pattern 3*:
> *"several factors all correlating with the same underlying signal — e.g. **a market-derived game
> total ALREADY PRICES IN park/weather/pace effects that separate factors also try to capture** — so
> **naively multiplying or summing them DOUBLE- AND TRIPLE-COUNTS the same real information.**
> **Fix: RSS (root-sum-squares) aggregation for a genuinely correlated factor cluster** — **zero
> dampening when only ONE factor in the cluster fires**, **increasing dampening as more correlated
> factors stack**. **Keep genuinely independent factors OUT of this treatment.**"*

**The example is live in NBA.** The matchup factor uses **market-implied totals** (`f_impl_own` /
`f_impl_opp` = `total/2 ∓ spread/2`), which on this description **already price in pace and opponent
strength** — the same information the pace coefficient (1.17) and opponent-defence coefficient (0.53)
also carry.

**`factor_registry` already stores MACRO-CLUSTERS** (T8), so the grouping RSS needs exists.
**No RSS aggregation is recorded anywhere.**

**Note the architecture solved the same problem differently elsewhere**: putting blowout, OT and foul
risk in the **minutes model** *"dissolves their correlation"*. **RSS is for clusters that cannot be
re-homed that way.**

### 🔍 CHEAP DIAGNOSTIC NEVER RUN · the enrichment-displacement calibration split
T1's blueprint §4a records an audit technique and its MLB result:
> *"**Split graded legs by HOW FAR THE ENRICHMENT LAYER MOVED THE FINAL PROBABILITY AWAY FROM THE
> BASELINE MODEL'S OWN NUMBER, then compare predicted-vs-actual SEPARATELY FOR EACH BUCKET.**"*
> MLB found **baseline-dominated legs nearly perfectly calibrated (~1 pt gap)** while
> **heavy-enrichment legs showed a 5+ POINT OVERCONFIDENCE GAP**.
> *"**This single check immediately LOCALIZES whether a calibration problem lives in the baseline model
> or the enrichment layer, WITHOUT DEBUGGING EVERY FACTOR INDIVIDUALLY FIRST.**"*

**NBA has every input and has never run it.** `nba_score.final_hp` stores **`baseline_hp` and
`final_hp` on the same row**, plus `cal_shift` — so the displacement is `final_hp − baseline_hp`,
already present. **One bucketed group-by against `board_outcomes`.**

**Why it is worth running here specifically:**
- The measured factor effect is **Brier +0.1–0.3%**, so **most legs sit in the baseline-dominated
  bucket** — but the diagnostic is about the **tail** of displacement, not the average.
- **The largest displacements the system produces are availability overrides**: `now_out` moves a leg
  by **0.2640 on average, max 0.9924**; `reallocated` by ~0.0131.
- **The reallocation sensitivity parameter (0.15 per tier) is ESTIMATED, not measured.**

**So the highest-displacement bucket is also the one with the least-validated parameter.** The
diagnostic would show whether that matters, without touching any individual factor.

### ⚠ VERIFY · is the NBA Platt calibration OVER-FLATTENING?
**The owner's experience with MLB's automated calibrator, from T1:**
> *"there is a **daily automated calibration engine** (runs **Platt scaling, beta**, and possibly other
> techniques) that **in their experience OFTEN OVER-FLATTENS / FLATTENS TOO MUCH**."*
> *"**prefers calibration to be done MANUALLY** rather than via the automated daily calibration."*

**NBA applies per-rung Platt automatically**, on a weekly refit, with no manual review step.

**Over-flattening destroys exactly what this system is built to price**: pulling everything toward the
base rate removes the tail discrimination that goblin/demon legs depend on — and the tails were
independently nominated as *"the #1 area where a sharp baseline earns the most."*

**NBA's design happens to carry four mitigations** (per-rung rather than one curve; variation band in
the key; upper-only ceiling; n≥1,000 gate) — **but none of them were chosen to answer this warning, and
none has been checked against it.**

**The diagnostic is cheap and the data already exists**: `nba_score.final_hp` retains **`p_raw`**
alongside `p_more`/`p_less`. **Compare the pre- and post-calibration distributions per rung** — if the
calibrated spread is systematically narrower at the outer rungs, it is over-flattening.

### ⚠ AS-OF CONTAMINATION — the recurring bug of this system, three instances
| Instance | Where |
|---|---|
| **`backtest.baseline_v6_asof` leaked each leg's own game-day** (`as_of_date = D` included day D) | **MLB**, relayed 2026-08-29 (T1) |
| **A season-wide mean using future games** — *"that was the entire FRINGE anomaly"* | NBA, T8 |
| **A pasted calibration table carried across days** — the parity violation | NBA, live session |

**It always presents the same way: INFLATED APPARENT SKILL.** The FRINGE multipliers *"shrank to honest
~1.0 values"* once removed.

**MLB's verification method transfers**: check a **non-push sample against game-log counts** — if the
as-of prediction for day D can only be right because day D is in it, the counts give it away.

**The fix workflow, also from T1**: *"research/debug/simulate fixes **at large sample sizes across all
individual niches** first; **only once solutions are very well developed**, test **on the backtest
tables**; **only if that testing behaves very well, move to live tables**."*

### KNOWN MISS (documented, reproducible) · P(0 blocks) under-predicted
From the harness header: *"**blocks more 70–75: −4.3, n=3900** = **P(0 blocks) under-predicted for
~1.5 bpg players, persists at any lambda**; blocks less 75–80: −2.6 thin; steals less 60–65: +3.6.
**Holdout 2024-25 shows the same signs.**"*
**Structural, not noise** — it persists at any lambda and reproduces out-of-sample. Recorded so it is
not rediscovered as a new bug.

### PATTERN WORTH KNOWING · three separate attempts at per-player granularity, all defeated by sample
1. **Player-own L0 calibration cells** — *"REJECTED ON DATA: n=40–80; **regression-noise dominated**;
   ELITE rebounds ±7.7. Off."*
2. **A2's with/without-teammate table** — retracted after five failed panels
3. **Conformal confidence** — dominated by aleatoric noise

**Per-player cells look attractive and fail for the same reason every time: 40–80 games is not enough
to fit anything.** The system's granularity lives in *tiers*, not players — by evidence, three times
over.

### IF A2 IS EVER REVISITED · check the sample-size gating first
A2 (teammate redistribution) was **retracted** after five failed panels — *"the certified anchor wins
every slice, and worst where the mechanism predicted it should win"* (COMPASS fact 91).

**But the T7 design specified confidence tiers the failed panels may not have honoured:**
> *"a precomputed with/without-teammate minutes table from DNP games, with **confidence tiers
> (<5 games → generic role-based redistribution; 5–14 → shrunk blend; 15+ → trust)** — the **'Wally
> Pipp' effect**."*

**A with/without table built on fewer than five shared-absence games is close to pure noise, and the
original design said so.** Whether the panels gated on sample size is not established in the
transcripts. **If A2 is reopened, that is the first thing to check** — a mechanism that fails worst
where it should work best is also the signature of an ungated noisy estimator.

### ⚠ GRADING RULE · **OT handling differs BY APP on period props**
> *"**PrizePicks/Underdog include OT in 2H/4Q; Sleeper's quarter markets EXCLUDE it.**"* (T7)

**⚠ QUANTIFIED IN T8, and the consequence is stronger than a grading rule:**
> *"PP/UD include OT, Sleeper doesn't — **DIFFERENT PRODUCTS, DIFFERENT MODELS**; **a 1-point spread
> carries ~7–8% OT probability**."*

**So this is not only a settlement difference — it is a MODELLING difference.** A Sleeper 2H line and a
PrizePicks 2H line on the same player are different bets, and on a tight spread the gap is worth
**7–8% of outcomes**. Rating them from one distribution misprices one of them.

**Two things to check:**
1. Does `grade_board_outcomes.py` apply a per-app OT rule? (6.9M legs, five apps, period props present)
2. Does `score_board_legs.py` price 2H/4Q identically regardless of app? **T8 says it should not.**

**And `P(OT)` — which the five-dimension architecture names as a minutes-model input — was never
built** (verified: no `p_ot`/`overtime` in `classification_ladder_v12.py`). **It is the term that would
make the two products distinguishable.**

**✅ PARTIAL RESOLUTION (T9): the STORAGE supports it.** `nba_score.baseline_ladder` has **`ot_rule`
as a first-class PRIMARY KEY column** (`DEFAULT 'include'`), alongside `period`. So the same
player × prop × period can hold an `include` row and an `exclude` row at once.

**✅ AND `P(OT)` WAS BUILT — in the PERIOD layer.** My earlier finding (no `p_ot` in
`classification_ladder_v12.py`) is correct for the **full-game** ladder only. T9:
> *"**OT as a mixture branch, not a mean bump** — a star either gets ~5 crunch minutes or none.
> **P(OT | spread) measured at 5.3% at pick'em falling to 1.9% at 15+.**"*

**So all three pieces exist**: the storage key, the measured probability, and the mixture treatment.
**What remains open:**
1. Is the **`exclude` variant actually built** for Sleeper's quarter markets, or only the default?
   (T9's own remaining list named *"the OT-exclude variant for Sleeper"* as outstanding.)
2. Does **`score_board_legs.py` select by app** — Sleeper → `exclude`, PP/UD → `include`?
3. Does **`grade_board_outcomes.py`** apply the same per-app rule when settling?

### ⚠ FANTASY-SCORE SCALE — **largely resolved, one third-party outlier remains**

**✅ T9's `prop_taxonomy` seeding verified the scale across ALL THREE APPS:**
> *"`prop_taxonomy` (28, **all 3 apps verified — fantasy scale IDENTICAL `1 / 1.2 / 1.5 / 3 / 3 / −1`**)"*

**So `+3` for blocks and steals is confirmed on PrizePicks, Underdog AND Sleeper**, and lesson #14's
requirement (*"verify each platform's own formula explicitly"*) **was satisfied** — the three were
checked separately and agreed.

**What remains is a single third-party outlier**, noted in T9:
> *"a third-party sheet lists PrizePicks blocks/steals at **+2** vs the **+3** I recorded from the
> official page."*

**Two primary-source verifications (T7's official page, T9's three-app check) against one secondary
sheet.** **The +3 stands**; the third-party sheet is most likely stale or describing a different
product.

**Why it was worth chasing at all**: T8.16g establishes that *"the **3× multiplier on blocks/steals**
reintroduces exactly MLB's home-run lumpiness — a single steal is a 3-point jump — producing a **fat
right tail** a direct fit would smooth away."* **At +2 that tail is materially thinner**, and
`fantasy_score` is simulated from components, so the multiplier propagates into every rung.

**Residual action**: re-read each app's live scoring page once the season board is up — **scales are
platform-level mechanics, and platform mechanics have a shelf life** (the same way demons went from
More-only to both sides in 2026-08).

### RE-CHECK · **Sleeper DOES have alternate lines** — milestone markets
The live session recorded *"Sleeper has no alternate lines (one line per player+stat, priced via
per-side multipliers)."*
**T7's verified 3-app inventory says otherwise**: Sleeper offers **Double-Double, Triple-Double, and
milestone/alternate lines (20+ / 25+ / 30+)** — described as *"**Sleeper's equivalent of Goblin/Demon
ladders**."*
**Both cannot be right.** Either Sleeper changed, or the later scrape only captured the standard
markets. **If milestone lines exist and are unscraped, that is unpriced board surface.**

### DEFERRED (Tier C, needs play-by-play) · first-basket, high-scorer, first-5-minutes
Underdog offers First FG/3PT make-or-miss, First to 10+ Points, Game/Team High Scorer, and First 5
Minutes stats. **All require play-by-play we do not have.** Correctly out of scope; recorded so the
board-coverage number is understood as *"of the props we can model"*, not *"of everything offered."*

### 🔧 CHEAP FIX, CONCRETE · **altitude and timezone are EMPTY — two factors have no input**
**Verified 2026-09-20**: `nba_ref.arenas` has **30 rows, 0 with `altitude_ft`, 0 with `timezone`**
(19 of 30 have `capacity`).

**⚠ AND THE LESSONS DOCUMENT NAMES THE CHECK THAT WOULD HAVE CAUGHT THIS (T1):**
> *"for any factor, **verify it actually has variance (`stddev(factor_value) > 0`) as a FIRST sanity
> check** — **this is cheap and MLB never did it proactively**."*

**An altitude factor built today would have `stddev = 0`.** The one-line check catches it before any
gate run, any cell fit, or any conclusion about whether altitude matters.

**Worth running across every factor column before the season**, not just these two — any column
created but never filled has the same signature.

**Two peer-reviewed factors cannot be computed at all:**
| Factor | Evidence | Needs | State |
|---|---|---|---|
| **Altitude** | *J. Sports Sciences* 2025, **p=0.005** — defensive performance varies with elevation, shot selection shifts toward 3PA, **4Q starter minutes and efficiency reduced** | `arenas.altitude_ft` | **empty** |
| **Eastward jet lag** | Peer-reviewed, 10 seasons (PMC) — west→east travel impairs performance, **effect ~DOUBLE the reverse direction** | `arenas.timezone` | **empty** |

**T8 flagged both as *"small data adds"* and they were never added.** The columns exist (created in
T1's first DDL); the values do not. `teamdetails` — the source that fills the rest of the arena row —
does not carry them, which is presumably why.

**This is 30 static values that never change.** Only **Denver (~1,610 m)** and **Utah (~1,290 m)** are
near the design's *"gated >1500 m"* threshold, so altitude is effectively a one-team factor plus a
borderline second. Time zones are public record.

**Note for jet lag**: the effect is **directional** — west→east is roughly twice the reverse — so a
symmetric travel-distance factor would wash it out. **D2 must carry direction, not just distance.**

**Design caution to preserve**: altitude was specified as *"continuous, gated >1500 m"* with the
warning *"small, physiological, **sparse data — don't overfit**."* With one clear team above the
threshold, that caution matters more than the effect size.

### GAP · **opponent defence has no SHORT-memory form** — the factor study asked for oneThe T7 prop-by-prop study's memory map puts opponent defence ratings firmly in the **short** column:
> **Short**: minutes, usage, FGA/3PA volume, **and opponent defence ratings (last 10–15 games, NOT
> season-long)**

**What exists:**
| Table | Window |
|---|---|
| `nba_team.defense_vs_position` | **season aggregate** (`games_sampled` per season) |
| `nba_ref.defender_ratings` | **weekly as-of** two-way ridge, reliability-shrunk |
| `nba_config.stat_decay_config` | **13 player stats — no opponent-defence entry at all** |

**Neither form is a 10–15 game rolling window**, and the decay table — which exists precisely to stop
one-size-fits-all memory — does not cover opponent defence.

**Why it matters**: a team's defence changes with injuries, trades and scheme adjustments on exactly
the timescale the study flagged. A season-long DvP figure in March is averaging over a roster that may
no longer exist. **This is the same "3PA volume vs 3P%" distinction** the decay table already
encodes for player stats, unapplied to team stats.

**Untested** — it may not move the number. But the study called for it explicitly and it was not built.

### ⚠ DESIGNED-BUT-UNVERIFIED · **the "dud" mixture, and the data built for it**

**⚠⚠ MAJOR CORRECTION 2026-09-20 (T8 re-pass): the mixture IS CONFIGURED. The CODE is what diverges.**

`nba_config.classification_config.minutes_mixture` holds the complete design:
```json
{"components": ["normal_truncated", "blowout_truncated", "dud_lognormal"],
 "normal_filter": {"max_margin": 15, "max_pf": 5, "min_pct_own_avg": 0.4},
 "dud_filter":    {"bottom_pct": 15, "or_pf_ge": 5},
 "blowout_threshold_margin": 20,
 "team_constraint": 240,
 "renormalization": "tiered_inelastic"}
```
*"Three-component minutes model; **f(spread) and E[min|blowout] fit on own data PER TEAM**"*

**`classification_ladder_v12.py` implements the `normal_filter` and nothing else:**
```python
pg["comp_min"] = np.where(pg["competitive"] & (pg["PF"] < 6), pg["MINF"], np.nan)
```

| Configured | In the recipe? |
|---|---|
| `normal_truncated` + `normal_filter` | ✅ (as an exclusion) |
| `blowout_truncated` | ✅ via `MIN_RATIO` |
| **`dud_lognormal`** + `dud_filter` (bottom 15% **or PF ≥ 5**) | ❌ **absent** |
| **`renormalization: "tiered_inelastic"`** (240-minute constraint) | ❌ **absent** |
| **`E[min|blowout]` fit PER TEAM** | ❌ **absent** — `blowout_model` is league-wide |

**So three configured components are unimplemented in the full-game recipe**, and the config is the
authority on intent. **The period layer implements the mixture properly** (sit-out rate and "plays"
ratio per role × state), which proves the technique works on this data.

**Note `min_pct_own_avg: 0.4`** — the ≥40%-of-median floor that was the *suspected* cause of the FRINGE
anomaly before leakage turned out to be the real one. **It is a configured filter, not an accident.****The single most NBA-specific finding in the design research (T7):**
> *"**'Dud games' — a fat low tail MLB doesn't have.** Blowouts, foul trouble, early exits produce
> **5-minute, 2-point games**. **A distribution fit to all games is systematically OVER-OPTIMISTIC on
> 'more'.** This is the NBA analogue of MLB's **home-run bimodality** (which MLB fixed with a
> two-component mixture), and we have the exact data to detect duds: **minutes per game, score margin,
> and the DNP/DND comments from starter-status**. **Design: model P(dud) separately, then mix.**"*

**The bias has a DIRECTION — over-optimistic on `more`**, which is the side most legs are taken on.

**The three named inputs all exist:**
| Input | Status |
|---|---|
| Minutes per game | ✅ `player_game_log.min`, 79,358 rows |
| Score margin | ✅ and `blowout_model` is built on it |
| **DNP/DND comments** | ✅ **`player_game_starter_status.comment` — 4,319 coach's-decision + 1,074 injury rows** |

**This supersedes the T6 "underused asset" framing**: the DNP comments were not overlooked, they were
**designated for this purpose in the design**. **What is unverified is whether
`classification_ladder_v12.py` implements the dud mixture and reads them.**

**Why it matters if it was not built**: blowout benching is modelled (`blowout_model`), but that covers
only one of the three dud causes. **Foul trouble and early exits truncate minutes in COMPETITIVE
games**, which a margin-keyed model by construction cannot see. And a distribution fitted across all
games — including the duds — is biased on the `more` side for every prop.

**⚠ STRENGTHENED 2026-09-20 (T8 pass 3): `foul risk` is named in the ARCHITECTURE, not just the
minutes-model design.** The five-dimension factor table lists **"Blowout risk, P(OT), foul risk"**
together as ***"minutes-model inputs, not rate factors"***, with the rationale *"they act on
opportunity, not efficiency — **moving them there also dissolves their correlation**."*
**So foul risk was a first-class designed input at the architecture level**, and the implementation
treats `PF ≥ 6` games only as rows to exclude. **`P(OT)` appears to be similarly absent.**

**To verify**: does the ladder builder fit a mixture, or a single distribution over all games?

**⚠ PARTIALLY RESOLVED (T9): the mixture WAS built — but only in the PERIOD layer.**
T9 implemented *"the **three-part Q4/2H mixture** with everything fit on train: **state probabilities
(close / medium / blowout) from the derived spread**, and **per role tier and state a sit-out rate**
plus a 'plays' distribution."* → *"**the fourth quarter is solved**"*, and 1H certified at
*"holdout ladder 1.0, 0 of 19 bands."*

**So the mixture machinery exists and is certified — in the period props.** The full-game ladder still
uses the exclusion approach (`competitive & PF < 6`). **The period layer has an explicit sit-out rate
per role tier and state; the full-game layer does not.**

**That makes the gap narrower and more concrete**: the technique is proven in this codebase, on this
data, and the question is only whether to apply it to the full-game props too.

### ✅ RESOLVED 2026-09-20 — **duds are EXCLUDED, not MIXED. The design said mix.**
`classification_ladder_v12.py` line 222:
```python
pg["comp_min"] = np.where(pg["competitive"] & (pg["PF"] < 6), pg["MINF"], np.nan)
```
**The minutes role (`mu_role`) is computed ONLY from competitive games with fewer than 6 personal
fouls** — so blowouts *and* foul-trouble games are **removed from the role estimate**. There is **no
`dud`, `mixture` or `p_dud` anywhere in the file** (grep: 0 matches).

**What this means, precisely:**
| Dud cause | Handled? |
|---|---|
| **Blowout benching** | ✅ — excluded from the role, then re-applied via `MIN_RATIO` per `role_tier` (the `blowout_model` ratios) |
| **Foul trouble (PF ≥ 6)** | ⚠ **excluded from the role, and never restored** — `P(foul trouble)` is not modelled |
| **Early exit / other** | ⚠ not modelled |

**The implementation cleans the input; the design asked to clean it AND add the tail back as a mixture
component.** So the projection effectively assumes the player plays his *clean-game* role every night.

**The direction of the residual bias is worth measuring rather than assuming.** Excluding foul-trouble
games raises `mu_role` (clean games have more minutes), which argues *toward* over-optimism on `more` —
the exact bias T7 named. But dispersion is fitted separately, and the empirical per-tier outcome tables
(where sample supports them) are built from *real* game results including duds, which would carry the
tail natively. **Whether the net effect is material is an empirical question the factor-gate harness
could answer in one run.**

**This is a genuine design-vs-implementation divergence**, not an oversight to panic about — the
exclusion is defensible and the blowout half is properly restored. But it is the one place where the
most NBA-specific insight in the whole design research was only half implemented.

### UNVERIFIED · does the minutes model include the "dud" component?The T7 design specified a **three-component mixture**: normal play (truncated Normal), blowout-reduced,
and a **"dud" (foul trouble / early exit) ~ log-Normal**, fit on *"competitive games in the player's
bottom 15% or 5+ PF"*, with `P(dud)` from the player's own history and PF rate.
**Blowout is implemented (`blowout_model`). Whether the dud component exists in
`classification_ladder_v12.py` is not established.** It is a distinct mechanism — early exit for fouls
truncates minutes in *competitive* games, which the blowout model by construction does not cover.

### NOT IMPLEMENTED (specified, MEASURED, justified — and still unbuilt) · **team-specific blowout benching**
The T7 blowout design called for a **team-specific `E[minutes | blowout]`**, on RotoGrinders' evidence
that *"coaches differ in how they empty benches."*

**⚠ T8 MEASURED IT AND CONFIRMED IT WAS WORTH HAVING:**
> *"**Team-specific starter pull: 0.81 (Orlando) to 1.10 (Dallas)** — **a 30% spread — the
> team-specific design is justified.**"*

**`nba_score.blowout_model` is still league-wide**, keyed on margin band + side only (7
`minutes_by_margin` rows). **A 30% spread between the most and least bench-emptying coaches is being
averaged away**, with 24,025 player-games available to fit a per-team term.

### CORRECTION · the blowout asymmetry is NOT what DataStreak claimed
DataStreak reported *"the favourite's starters hit hardest."* **On our own 79,138 player-games it did
not reproduce** — favoured starters **47.7%** over-rate, underdog starters **39.4%**.
> *"Won: **51.9% over-rate (NOT a penalty)**. Lost: **36.9% (a 12-point collapse)**. **The losing side
> is benched *and* played badly to get there.**"*

| | Won blowout | Lost blowout |
|---|---|---|
| Minutes ratio (`blowout_model.v1`) | **0.8748** — benched harder | 0.9124 |
| Over-rate | **51.9%** | **36.9%** |

**Both are real and point opposite ways.** A starter in a won blowout plays fewer minutes but was
productive in them. **The engine keys on minutes, so it captures the mechanism correctly** — but the
over-rate literature is backwards on our data.

### ⚠ B2B IS AN AVAILABILITY FACTOR, NOT A MINUTES FACTOR
Published ranges (veterans −1.5 to −3.0 min on zero rest) **did not reproduce**:
> *"Stars on zero rest: **~0 to −0.4 min *when they play***. **Bench and rotation GAIN +0.6 to +2.5.**
> The mechanism is **DNP-Rest: stars sit ENTIRELY**, so the star B2B effect is a **P(available) effect
> belonging in the P(start) model**, and the bench gains are the redistribution."*

**The published figure averages over a population containing zeros**; conditioning on *playing*
dissolves it. **Whether A4 is implemented as an availability term or a minutes term determines whether
it measures anything at all.** The quantifying data exists: `player_game_starter_status.comment`
carries **`DND - Rest`**.

### SUPERSEDED — the old team-specific entry
The T7 blowout design called for a **team-specific `E[minutes | blowout]`**, on RotoGrinders' evidence
that *"coaches differ in how they empty benches"* and the scale should be *"asymmetric and
**team-specific**."*

**`nba_score.blowout_model` has no team dimension** — it is keyed on **margin band + side only**
(7 `minutes_by_margin` rows, league-wide). **The asymmetry survived** (won-by-25+ 0.8748 vs lost-by-25+
0.9124 — the favourite's starters lose more minutes, matching DataStreak's *"hitting the favourite's
starters hardest"*). **The team-specific half did not.**

**Whether it matters is measurable**: a Spurs-vs-Warriors blowout may empty benches at different rates,
and with 24,025 player-games in the model there is sample for a per-team term. **Untested.**

### REJECTED CANDIDATE (with reason, so it is not re-proposed) · Draft Combine anthropometrics*"Real on-court results already encode a player's physical tools better than a years-old combine
measurement. Only rookies would benefit, and it's not worth the complexity here."*

### BUG-OPEN · **the weekly differential worker is NOT scheduled, and P1 does not call it**
Flagged honestly when built (T3): *"this worker **isn't wired to any automatic schedule yet** — it
needs a manual `run_job` trigger after each weekly scrape."* Owner: *"No, leave like this for now."*
**It was never wired since — and `nba-p1-weekly-static.yml` (built 2026-09-20) does not call it.**

**⚠ CORROBORATED by T7's audit, then CONFIRMED LIVE 2026-09-20**: T7 recorded the
`*_differential_log` tables as *"correctly empty — only one weekly baseline run has happened;
**detection starts on the second run**."*

**Checked today:**
```
player_differential_log    0 rows
team_differential_log      0 rows
official_differential_log  0 rows
player_roster_snapshot   582 rows   ← frozen since 2026-09-03
```

**The second run never came.** The snapshot is 17 days stale and the logs have never recorded an event.
**T7's "expected on first run" explanation was true then and is not true now.**

**Why this is worse than it looks with the season two weeks out**: September and early October are when
roster churn peaks — training-camp signings, two-way conversions, waivers, camp invites and final
cuts. **Every one of those is exactly what this worker detects, and none are being detected.**
When it is eventually run, it will emit one enormous catch-up batch rather than a usable history.

P1 runs: teams · arenas · players · bio · weekly season tables · team stats · on/off · play types ·
DARKO · shot quality · defender ratings · static context. **No differential worker.**

**Consequences, and they compound:**
1. **Trades, signings, departures, team renames and referee changes are not being detected at all.**
2. Because the worker diffs against **its own** snapshot tables, whenever it is next run it will report
   the **accumulated** difference since its last run — not a weekly delta. The event log will show one
   enormous batch rather than a history.
3. Its snapshot baseline is from **2026-09-03** and is now stale by the whole off-season.

**The fix is small**: add a step to `nba-p1-weekly-static.yml` calling the differential worker
**AFTER** the scrape+load steps (it must see the fresh data), and accept that the first run will emit a
large catch-up batch. **Not applied — documentation pass only.**

### TRAP · raw committed JSON ≠ Worker-transformed shape
The differential worker broke on `t.name` because the raw scrape file has **`city` + `nickname`
separately**; `name` is only assembled **inside the Worker's transform**. Any worker reading the
committed JSON sees the raw shape; any worker reading Postgres sees the transformed one.

---

## FROM T4 PASS 1 *(added 2026-09-20)*

### TRAP · `leaguedashplayershotlocations` returns `resultSets` as a **dict, not a list**
*"this endpoint returns `resultSets` as a single **dict**, not a list like **every other endpoint**.
My code assumed a list and did `dict[0]`, which raised `KeyError`."*
**It breaks the convention every other stats.nba.com endpoint follows.** Any new parser copied from a
working scraper will fail on it.

### BUG-FIXED · naive space-replacement mangles `+` in URL params
*"the `+` in **'6+ Feet'** needs proper URL encoding (`%2B`), but I just did a naive space replacement."*
**Use real URL encoding on stats.nba.com parameter values**, not string substitution.

### RESOLVED EMPIRICALLY · traded players in career totals — the `TEAM_ID = 0` row
The question could not be settled by search and was flagged rather than assumed, then **verified by
calling the endpoint**: *"traded players get **separate per-team rows PLUS a combined total row
(`TEAM_ID = 0`)**, and the games/points sum correctly across them."*
**Consequence: any naive `SUM()` over `playercareerstats` DOUBLE-COUNTS traded players.** Filter
`TEAM_ID = 0` for totals, or exclude it when summing per-team rows.

### CORRECTION TO GEMINI · advanced stats cost 2 calls, not 1,230
Gemini estimated *"1230 individual calls"* for per-game advanced stats. **Wrong** — the bulk
`playergamelogs`/`teamgamelogs` endpoints accept **`MeasureType=Advanced`**, so it was **2 bulk calls**
producing 26,651 + 2,460 rows matching the base logs exactly.
**The clearest instance in the transcripts of the "Gemini is not absolute truth" standard paying off.**
Worth remembering: **check whether a bulk endpoint already supports the parameter before accepting a
per-entity loop estimate.**

### VERIFY · **does the blowout factor DOUBLE-COUNT?** — ✅ **RESOLVED 2026-09-20: NO**
The T4 methodology's risks section warned: *"the baseline already reflects historical
blowout-shortened minutes — **don't penalize twice**."*

**Checked directly against `nba_score.blowout_model`. The design avoids it.** The `minutes_by_margin`
rows store **`v1` as a RATIO relative to the player's own baseline**, not an absolute penalty:

| Margin band | n | **v1 (ratio)** | v2 (min lost) |
|---|---|---|---|
| **competitive (−12 to +12)** | 12,966 | **1.0333** | −1.0140 |
| won by 12–20 | 3,001 | 0.9760 | 0.790 |
| won by 20–25 | 1,120 | 0.9194 | 2.586 |
| **won by 25+** | 1,597 | **0.8748** | 3.992 |
| lost by 12–20 | 2,672 | 0.9721 | 0.903 |
| lost by 25+ | 1,306 | 0.9124 | 2.856 |

**Why this is correct**: the ratios are measured against the **same blended historical average the
baseline uses** — competitive sits **above** 1.0 (1.0333) and every blowout band **below** it. So
applying a margin-weighted ratio **re-centres** the baseline onto the expected game script rather than
subtracting a penalty a second time. **A value above 1.0 for the most common case is the signature of a
deviation model, not a penalty model.**

**This also explains the T16 finding** that *"competitive games run 3.3% ABOVE baseline"* — it is
`v1 = 1.0333` read directly. **The warning written in T4 was heeded, thirteen transcripts later,
whether consciously or by good instinct.**

**`p_blowout` rows** store three values per spread band (`v1`, `v2`, `v3`) — the blow-open, blown-out
and presumably competitive probabilities, e.g. spread 0–2: 0.1634 / 0.0842 / 0.0792.

### VERIFY · baseline staleness on trades and season-ending injuries
Named as risk 3 in T4's methodology. A cached baseline is wrong the moment a player changes team.
**The weekly differential worker exists precisely to detect this — and it is not scheduled** (see the
open item above). **The two gaps compound**: trades are not detected, so stale baselines are not
flagged.

### RECORDED DECISION · GBDT / neural nets rejected, with conditions
A unified single-model approach was considered and rejected: *"needs **far more data and compute than
currently available**, and **sacrifices the explainability** the two-stage system gives you for free.
Not recommended here."*
**Not wrong in principle — wrong given current data volume, compute, and the explainability
requirement.** *(MLB's control plane has `gbdt_training_requests` and `gbdt_auto_trigger_switch`, so
MLB went this way; NBA deliberately did not.)*

### BUG-OPEN · **P3 uses a FIXED 1:15 PM PT — the design called for a DYNAMIC trigger**
The T4 cadence design is explicit:
> *"unlike the other two runs, **the master run's trigger time isn't a fixed clock time — NBA start
> times shift day to day** — so it needs to be **computed dynamically from `nba_calendar.games`
> (today's earliest real tip-off) minus 2 hours**."*

**`nba-p3-afternoon-light.yml` (built 2026-09-20) uses a fixed 1:15 PM PT.**

**Safe on a normal slate** (earliest tip ~4 PM PT) but **wrong on early-tip days**. The NBA regularly
schedules **noon and 1 PM Eastern** starts — Christmas, MLK Day, and most weekend national-TV windows.
**A 12:00 PM ET tip is 9:00 AM PT, over four hours BEFORE P3 would run.** On those days P3 would score
a slate whose games had already tipped.

**Note this interacts with the injury-report cutoff**: on an early-tip day the game-day report is also
filed earlier (8–10 am local for tips at 5 pm local or earlier), so an earlier run is *both necessary
and possible*.

**The fix, already specified by the original design**: trigger at
**min(1:15 PM PT, earliest_tip − 2h)**, computing the earliest tip from `nba_calendar.games` — the
schedule is already loaded (2,666 games). **Not applied — documentation pass only.**

### DESIGN DRIFT · the pre-flight check became a post-flight audit
**⚠ CORRECTED 2026-09-20 (T6 pass 5) — this entry was half wrong. There are TWO checks:**

| Check | Where | When |
|---|---|---|
| **Delta worker's completeness check** | inside the daily delta ingestion worker (T6) | **PRE-flight** — calendar Final count vs logged count |
| **`check_delta_gaps.py`** | P2 step 6 (live session) | **POST-mining audit** — dates, games, both teams, roster rate, freshness |

**The T4 design intent WAS honoured** — the pre-flight gate exists in the delta worker.
`check_delta_gaps.py` is an additional, broader audit layered on top, not a replacement.
**No drift. Entry retained only to record the correction.**

### PERMANENT CAVEAT (accepted, not a bug) · late NBA stat corrections
*"the NBA does issue rare stat corrections hours or days later (a rebound reattributed to a different
player). **Don't chase these** — treat each day's baseline as a consistent point-in-time snapshot."*

### PRINCIPLE · the baseline must NEVER live-query stats.nba.com
Three reasons given at design time: **speed**, **stability** (API outage during the run window), and
**reproducibility** — *"a live query run at 9am vs 10am could return different data if a correction
posted in between."* **This is the as-of principle applied to API reads, before it was applied to
dates.**

### ⚠ LEAKAGE TRAP (identified before mining, still live) · **WinsLosses splits**
> *"**correlational, not causal** — players play better in wins **partly BECAUSE good play caused the
> win**. Using it as a raw feature risks **real data leakage**. **Collect it, but don't naively feed it
> to a model.**"*

**The data was collected.** Anyone building a factor from the WinsLosses split must treat it as
outcome-conditioned. **Same class of error as A5** (box-score starters are post-tip truth) — which was
caught and closed. **Whether anything currently reads the WinsLosses split is unverified.**

### ⚠ SURVIVORSHIP BIAS in career aggregates · accepted, must be handled by consumers
`playercareerstats` *"only exists for players who **stayed in the league long enough to still be
queryable**. Any 'typical aging curve' built from it is a curve for **SUCCESSFUL NBA players** — the
players who **washed out after 2–3 seasons are invisible**."*
**Any consumer must treat it as conditioned on "currently-relevant NBA player", not a neutral
population.** Plus **era effects**: *"a 2004 stat line isn't directly comparable to 2024 without
normalising for pace and 3-point rate."*
**3,644 career-season rows are loaded. Whether any consumer applies these conditions is unverified.**

### BOUNDED HISTORY, on purpose · 3 seasons, not "as much as possible"
*"a player's own stats from several years ago, in a different role on a different team, **actively
HURTS a model**… Kevin Durant's 2016 Thunder numbers being actively misleading for predicting his
performance today."* **Locked at 2023-24 / 2024-25 / 2025-26.** This is why `BT_TRAIN` must be set
explicitly (COMPASS fact 66) — the bound is a modelling decision, not a storage one.

---

## FROM T5 PASS 1 *(added 2026-09-20)*

### ⚠ TRAP · **`boxscoretraditionalv2` returns HTTP 200 with ZERO rows on historical games**
The worst failure mode in the transcripts: **1,228 games "succeeded" and produced 799 rows** where
~30,000 were expected. *"HTTP 200 and **structurally correct responses, but zero player rows** for every
game except the very last one."*
**No error was raised. The meta file reported success.** The discrepancy was only caught by comparing
the row count against an expected magnitude (26 players/game).

**Fix: use `boxscoretraditionalv3`** — *"v3 works reliably for every single sample, including all the
games v2 silently failed on."* **v3 schema differs**: flat per-player fields (`personId`, `position`,
`comment`) nested under `boxScoreTraditional.homeTeam.players` / `awayTeam.players`.

**✅ VERIFIED CLEAN 2026-09-20**: `nba/scrape_nba_per_game_delta.py` — the script P2 calls daily — uses
**`boxscoretraditionalv3`** for starter status and **`boxscoresummaryv3`** for officials. **No v2
remains in the live path.** The lesson propagated correctly.

### BUG-FIXED · `nba_ref.players.position` existed in the schema and was never written
Two components had the same silent omission: **the scraper never extracted the field**, and **the
Postgres worker never wrote it**. The column sat empty for three sessions.
**And the first fix was also wrong** — `PlayerPosition` was assumed; the real source is the
**`playerindex`** bulk endpoint with a genuine `POSITION` field. Caught by checking the schema before
re-running, not after. **582/582 after the fix.**

### GEMINI WRONG (twice, in one exchange) · caught by the owner's instinct to double-check
1. *"starters are already inferable from the game logs via a `GS` column"* — **false**. `GS` exists only
   as a **season aggregate** in career totals; there is **no per-game starter flag** in
   `playergamelogs`. `START_POSITION` exists only on the expensive per-game endpoint.
2. *"Team Pace still needed"* — **false**. Already covered by the advanced-stats backfill.

**Both surfaced because the owner asked to "double check if no other information is needed" rather than
accepting a completeness claim.**

### ACCEPTED ERROR RATE (stated, not implicit) · splits backfill
**5 HTTP 500s out of 582 players** — diagnosed as *"likely players with zero games this season causing
a real data edge case on the source's end"*, and accepted as *"well under the 5% tolerance."*
**9,948 player-split rows across 577/582 players.** The 5 gaps persist.

### BLOCKED (resolved in T6) · a new worker could not be invoked
Three layers blocked it: the MCP tool's **target enum is fixed for the session**, **Control Room's job
dispatch is static**, and **no Postgres HTTP extension** exists to pull the data server-side.
The fallback — pasting ~3 MB of SQL in 17 chunks — was abandoned as *"burning turns on a mechanical
process."* **The data was verified and committed; only the load was blocked.**

### SCHEMA FLAW · **`player_splits` / `team_splits` PK omits `season` — only one season can exist**
`PRIMARY KEY (player_id, split_type, group_value)` — **`season` is a column but not part of the key.**
**Verified live 2026-09-20: `nba_stats.player_splits` holds only 2025-26** (9,948 rows, 577 players),
while the game logs cover **three** seasons.
**Whether two seasons were overwritten or never scraped, the schema cannot hold more than one.**
`nba_team.defense_vs_position` got this right — its PK includes `season` and it holds all three
(630 rows = 30 teams × 7 positions × 3 seasons). **Fix would require a PK change plus a re-scrape.**

### VERIFY · **`StartingPosition` split is absent** — the one rated ESSENTIAL
Present: `days_rest` (3,311) · `month` (3,236) · `location` (1,217) · `wins_losses` (1,135) ·
`pre_post_allstar` (1,049). **`StartingPosition` is not there.**
T4.13c rated it **Essential** — *"a direct proxy for role/usage — starter vs. bench is
night-and-day"* — while `month` was rated **Low** and is the second-largest table.

**Probably benign**: `nba_stats.player_game_starter_status` was built in the same session with
**32,179 rows at PER-GAME granularity**, which supersedes a season aggregate. **The capability is
covered.** Recorded so the absence is not later mistaken for missing role data.

**⚠ AND THE PK FLAW IS CONFIRMED AS A FLAW, not a design choice.** T6 explicitly verified that the
weekly-snapshot tables (shot quality, playtype, tracking, impact rating, on/off) are *"correctly
weekly-refresh snapshots **by original design**, not gaps."* **The splits tables are different — they
carry a `season` column**, so they were intended to hold multiple seasons and the PK omission defeats
that intent.

### STILL LIVE · the WinsLosses leakage surface is in the schema
`w`, `l`, `w_pct` columns exist on both splits tables and `wins_losses` holds 1,135 rows.
**The T4 caution — "collect it, but don't naively feed it to a model" — is not enforced by anything.**

### SCOPE DECISION (owner-approved, not a gap) · starter status = ONE season onlyPer-game starter/bench status costs **~3,690 calls across 3 seasons**. It was flagged rather than run,
and the owner approved starting with **the most recent season only (1,230 calls)**.
**✅ Verified live 2026-09-20: 32,179 rows · 1,230 games · 12,300 starters · 591 players — 2025-26
only.**

**The consequence to keep in view**: game logs span **three** seasons; per-game starter status spans
**one**. Any model trained across all three has this feature for a third of its data.
Gemini rated it *"foundational, non-negotiable — a player's role is **the single biggest driver of
opportunity**, and it can **shift game-to-game in ways season averages miss entirely**."*
**Extending it to 2023-24 and 2024-25 costs ~2,460 more calls.**

**✅ MITIGATION STATED IN T7 — this is less severe than it looks.** The data-universe research
explicitly rated backfilling the other two seasons as **"Defer"**, because it is
***"90% proxied by MIN + Usage once we have it"*** — and `nba_stats.player_game_log_usage` was then
built for all three seasons. **Usage share is a continuous role measure that subsumes most of what the
binary starter flag carries.**
**Caveat: this holds only if the baseline actually uses Usage as the role input.** If role is derived
from the starter flag alone, the asymmetry is real.

### COVERAGE ASYMMETRY SUMMARY *(added 2026-09-20)*What actually spans three seasons versus one:
| Dataset | Seasons |
|---|---|
| Player game logs (base + advanced) | **3** — 79,358 rows |
| Team game logs | **3** — 7,380 rows |
| `defense_vs_position` | **3** — 630 rows |
| **Player/team splits** | **1** — PK cannot hold more |
| **Per-game starter status** | **1** — owner-approved scope |
| Career totals | all-time, 3,644 rows |

---

## FROM T6 PASS 1 *(added 2026-09-20)*

### BUG-FIXED · **`if rows is not None` passes an EMPTY list**
The officials backfill reported *"1,230/1,230 succeeded, zero errors"* but produced data for only
**1,227 games**. The cause:
> *"When a game returns zero officials, the code returns `([], "error_string")`, but my main loop checks
> **`if rows is not None`** (true for an empty list) instead of checking the error."*

**`[] is not None` is `True`.** Same class as `float(NaN or 0) = NaN` in the live session:
**Python truthiness makes "empty but valid" and "present" indistinguishable.**
**Check the error, not the container.**

### CAVEAT · `boxscoresummaryv2` is documented as unreliable after 2025-04-10
The same failure pattern as `boxscoretraditionalv2`. **`boxscoresummaryv3` verified on 5 samples, old
and new games alike, before committing.** The live delta scraper uses v3 — verified.

### ACCEPTED GAP · 3 games have no officials on NBA.com's side
**All three are 2025-11-19.** The API returns an empty officials array; re-running does not help.
**3 of 1,230 = 0.24%**, accepted. Recorded so the gap is not re-investigated as a bug.

### BUG-FIXED · lineup PK omitted `team_id`
*"the same `group_id` can **legitimately appear for two different teams within a season** (e.g. traded
players who happened to pair up elsewhere too)."*
**Caught because the load failed loudly.** Contrast the splits PK, which omitted `season` and
**silently overwrote** instead — the same class of flaw with opposite visibility.
**This is the argument for tight constraints: a PK that fails is better than one that overwrites.**

### BUG-FIXED (three attempts) · the delta completeness check
1. **Naive count** → 170-game gap (preseason, playoffs, All-Star, Cup knockout — correctly out of scope)
2. **Blank-label filter** → *"too aggressive — excludes legitimate regular-season games with special
   branding (NBA Cup group stage, Rivals Week, international games)"*
3. **✅ `GAME_ID` prefix `002`** — *"a well-known, precise convention for game type"*, verified before
   use: **`002` = 1,230 games, exactly the known regular-season count.**

**This is the origin of the `002` convention in `check_delta_gaps.py`.** Any future game-type filter
should use the prefix, never the free-text label.

### CAVEAT (resolved) · the MCP enum refreshes BETWEEN turns
T1 concluded a new binding is unusable for the whole session. **T6 disproves that**: after 2 of 33
manual chunks, a re-check found the enum had refreshed and the Worker loaded the rest in **25 seconds**.
**Re-check a blocked binding before committing to an expensive workaround.**

### CLOSED · no Postgres-side HTTP path exists
`dblink` connects only to other Postgres databases; **`http` and `plpython3u` are not available.**
Large loads must go through a Worker or chunked SQL. **Checked exhaustively, so it need not be
re-checked.**

### ⚠ DATA QUALITY · `comment` field has TWO formats
`nba_stats.player_game_starter_status.comment` mostly uses `"DNP - League Suspension"` (hyphen-space)
but **11 rows use `"DND_LEAGUE_SUSPENSION"`** (underscores). **Any `LIKE '% - %'` filter or naive
prefix parse silently misses them.** Verified live 2026-09-20.

### UNDERUSED ASSET · 5,500+ historical absence reasons already in Postgres
The starter-status backfill captured DNP/DND reasons as a byproduct — **no extra scraping needed**:
| `comment` | n |
|---|---|
| **DNP - Coach's Decision** | **4,319** |
| DND - Injury/Illness | 975 |
| DNP - Injury/Illness | 99 |
| NWT - Not With Team | 29 |
| DND - Rest | 27 |
| + suspension, personal, NWT-injury | ~70 |

**The dominant category is healthy scratches (4,319 coach's decisions), dwarfing injuries 4:1** — and
it is **the purest available signal for role volatility**. For a fringe player, a coach's-decision DNP
is precisely the event `f_role` prices (fringe players miss by 0.0283 vs iron-men at 0.0008).
**Whether anything consumes this field is unverified.** It covers 2025-26 only, matching the
starter-status scope.

### OVERRULED LATER (correctly) · "historical injury-PDF backfill is a scope mistake"
T6's research concluded: *"It doesn't belong in the baseline (which is explicitly designed to be
injury-agnostic) — it's training data for a future enrichment refinement, not urgent."*
**T10 built it anyway, and it became load-bearing** — the day-before report feeds P2's baseline build,
N1 is fitted on it, and the parity rule depends on it.
**The framing was right about the BASELINE and wrong about the BACKFILL's urgency**: you cannot
backtest an availability-aware pipeline without historical availability.

---

## FROM THE LIVE SESSION 2026-09-19/20 (not yet a transcript file)
*added 2026-09-20 — these are current and unfixed unless marked*

### BUG-OPEN · PrizePicks is NOT wired for NBA in the live pipeline
`main.py` at the repo root is the **MLB** producer: `league_id=2` is a literal in all four candidate
URLs and `OUTPUT_JSON` is fixed to `prizepicks_mlb_current.json`. It honours a
`PRIZEPICKS_PROJECTIONS_URLS` override, so it CAN be pointed at NBA — but it would then write the NBA
board into the MLB file and the next MLB run would overwrite it.
**Mitigation built 2026-09-20:** `nba/scrape_prizepicks_nba_board.py`, a separate producer with its own
URLs (`league_id=7`), its own output (`boards/prizepicks_nba_current.json`) and its own env namespace
(`PP_NBA_*`). **Live-tested: 192 projections, 104 demons / 52 goblins / 36 standard.**
Still open: `main.py` itself is untouched, and COMPASS fact 176 still describes the old plan.

### PARTIAL · `board_tiers` is a TWO-way taxonomy; the board is now FOUR-way
`nba_market.board_tiers` (2.2M legs) derives `kind` from the Odds API **price** (`price=100` → demon,
`price=-137` → goblin). Every row is **Over-only**, which was correct while demons/goblins were
more-only (confirmed: zero Under rows on alternates in 2024-25, and the official help centre said so
through 2025-08).
**PrizePicks enabled LESS in 2026-08** (MLB + WNBA first; owner screenshots confirm it live on WNBA).
Under the four-way rule a **demon-Less sits BELOW the anchor**, which the price-based label would call
a goblin. **The rule, already worked out in T13:** below the anchor, More = goblin / Less = demon;
above it, More = demon / Less = goblin — a function of (position vs anchor, side), never the emoji.
**`nba_market.board_tiers_ud` (Underdog) ALREADY implements this** — see T13. The PrizePicks version
does not. `nba/build_board_tiers_v2.py` was written 2026-09-20 to close it; **not yet verified**.

### CAVEAT · tier sign convention breaks under the four-way rule
v1 signs tiers by KIND (goblin negative, demon positive). That fails once a demon can sit below the
anchor. v2 signs by **position** (negative below, positive above) so the sign always means direction.

### DEFERRED · PrizePicks per-leg multipliers are not on any public surface
Ruled out exhaustively 2026-09-19: **zero hits** for `multiplier|payout|factor|coefficient` across
691,431 lines of the live board payload (a demon carries only `odds_type`, `adjusted_odds` as a
BOOLEAN, and `line_score`); ~20 guessed API paths all DataDome-403 even through the working proxy with
`curl_cffi` chrome124 and a US/California egress; `app.prizepicks.com` is itself DataDome-walled so its
bundles cannot be scanned the way the Underdog ladder was; and **eight independent commercial scrapers
expose the LABEL only** while the same vendors expose real multipliers for Underdog, Sleeper and Pick6.
The factor is priced **server-side at entry build** — which is exactly why the app shows nothing on one
leg and a multiplier on the second.
**The capture to do:** from a COMPUTER browser (free), log in, DevTools → Network → Fetch/XHR, add leg
1, CLEAR, add leg 2, then "Copy as cURL" — the method that solved the Underdog and Fliff APIs. iOS
cannot do it free (iOS 17+ blocks `javascript:` bookmarklets).
**Owner's correction to keep in view:** the factor is NOT one number per tier — it varies by rung,
side, prop, player form and team form, so slip-by-slip inference needs an enormous sample and is never
certain.

### DEFERRED · Sleeper ladder, Chalkboard
Sleeper has no alternate lines (one line per player+stat, priced via per-side multipliers).
Chalkboard is app-only with no web app and is in no aggregator we hold → phone-proxy capture only.

### DROPPED · data-freshness gate
At a single 1:15 PM PT cutoff every leg carries the same report generation, so a freshness term
penalises uniformly and discriminates nothing. The uncertainty it would proxy for is already priced by
N1 probability-weighted availability. Late tips do get more post-cutoff amendment, but those amendments
are unusable when slips are placed once at ~1:30.

### DROPPED · scenario precompute as a daily job
Its value was "enumerate every availability branch now, SELECT the realised one at a later window".
With ONE window there is nothing to select with, so enumeration is pure cost (~0.5–1M rows/day).
`nba_score.scenario_realised` and its calibration stay as a MEASUREMENT (the finding that the
most-likely branch is right only ~17% of the time with three uncertain players remains true) but it no
longer runs daily.

### BUG-FIXED · the 2:30 PM PT cutoff was drift, traced to its origin
The 2026-09-09 session recorded a list of OBSERVED injury-PDF snapshot timestamps
(12:30 / 1:00 / **2:30** / 3:30 / 4:00 / 6:45 / 7:45 PM) — **Eastern**, from the PDF filenames —
alongside the correct policy on the same line ("game-day 11am–1pm local"). **2:30 PM ET is 11:30 AM
PT.** It was promoted to "the 2:30 PM PT day-of report" and repeated as established in COMPASS facts
41, 68, 73, 74 and 96. `nba_asof.py` shows the true source: `PHASE2_CUTOFF_LOCAL = "17:45"  # 2:45 PM
PT (after the 5:30 PM ET day-of report)` — a league **bulletin**, not a filing deadline.
**Corrected: the real constraint is 11am–1pm LOCAL to each game's market, so Pacific clubs file last at
1:00 PM PT → cutoff 1:15 PM PT.** `nba_asof.py` already had `PHASE1_CUTOFF_LOCAL = "16:00"` = 1:00 PM PT.

### CAVEAT · the injury backfill is HOURLY, not 15-minute
48 snapshots per game-date (real archived PDFs, Eastern timestamps). The league publishes every 15
minutes. Any cutoff analysis finer than ±1 hour needs the 15-minute archive. The season also crosses
DST.

### BUG-FIXED · `float(x or 0)` returns NaN — NaN is truthy
In `build_availability_delta.py`, one player with NaN minutes poisoned `wsum` → `share` → `gain` →
every downstream probability, writing **6,748 NaN overrides** that would have gone straight into the
scorer. A NaN hit probability is worse than a missing one because it looks like data. Fixed with an
explicit `v != v` check plus a hard guard that drops any NaN before write and reports the count.

### BUG-FIXED · market_key → prop mapping would have dropped 44% of the board
`replace(market_key,'player_','')` yields `points_rebounds_assists`, which matches nothing in our
baseline (we call it `pra`). Six of the largest groups — pra, pts_reb, pts_ast, reb_ast, stocks,
threes_made — **23,286 legs, 44% of the board** — would have scored nothing, silently. Same magnitude
as the historical combos gap. Fixed with an explicit verified mapping table.

### BUG-FIXED · a caught exception left a poisoned transaction
`try/except` around a read of a not-yet-existing table swallowed the error but left psycopg in a failed
transaction, so every later query died with `InFailedSqlTransaction` and the traceback pointed at an
innocent query 60 lines away. **`conn.rollback()` in the except is mandatory.**

### BUG-FIXED · loader reads over HTTP, not from local disk
`load_baseline_ladder.py` fetches the ladder artefact from `raw.githubusercontent` — so a ladder built
in the runner but **not committed** is invisible to it and the load 404s. Both P2 and P3 needed an
explicit commit step between merge and load.

### BUG-FIXED · the per-pair build needs a merge step
The builder writes `nba_baseline_ladder_<asof>_<pair>.json` per invocation; the loader reads
`nba_baseline_ladder_<asof>.json`. Without a merge the loader finds nothing. The loader also has its
own guard — *"ABORT: artifact has no combo props"* — so combos must exist BEFORE the merge.

### BUG-FIXED · five wrong env var names in the new pipelines
`ASOF`→`BT_ASOF`; `BT_MODE=combos`→ separate scripts `build_combos_ladder.py`/`build_periods_ladder.py`;
`BT_WINDOW`→`BT_CUTOFF=phase1`; `IR_MODE`→`INJURY_MODE`; `SPORT`→`SLEEPER_SPORTS`.
Also: `SLEEPER_OUT_DIR` defaults to `.` (repo ROOT) where the file is never committed and the archiver
never sees it; `ARCHIVE_LABEL` defaults to `routine`, so the decision snapshot must set `window`
explicitly or the grader and every backtest lose the decision moment.

### CAVEAT · `final_hp` stays denormalised — deliberate, tested
The columns it shares with `baseline_history` look like ~25 GB of duplication. Two claims against
slimming were tested and ONE WAS WRONG: "the join duplicates rows" is **false** (verified 140,130 in →
140,130 out, exactly 1:1; a planner ESTIMATE was misread as an actual), and "32.9 s per day" was
**cold cache** (`read=50707`; warm it is `shared hit=28514 read=1`). **The real reason to keep it** is
that slip-strategy work means days of backtesting across many dates at once — the cold-cache case —
where joining forces repeated `baseline_history` reads on a **2 GB RAM** server. Revisit only if the
server is upgraded AND the workload stops being backtest-heavy.

### CAVEAT · `VACUUM FULL` cannot run on `final_hp`
It needs free disk equal to the table size (13 GB) and the disk pressure that makes it necessary is
what prevents it. Plain `VACUUM` is the safe alternative; it reclaimed ~4 GB and cleared dead tuples to
zero on 2026-09-19.

### CAVEAT · a 0-scan index may still be load-bearing
`board_outcomes_leg_uidx` shows **0 scans but is UNIQUE** — it enforces no-duplicate-legs. Scan count
is the wrong test for a unique index. Only `board_outcomes_nm_idx` (343 MB, 0 scans, superseded by the
temp-table approach) was genuinely droppable, and was dropped.

### PARTIAL · P3's reallocation path verified on ONE date only
The whole chain was proven on **2025-11-29** (Klay Thompson flips to OUT after P2 builds → 3,446
teammate overrides at ~1.3 pp each → his own 828 legs zeroed → board scored → his Overs 0.0122 /
Unders 0.9834). A season scan found only **4 dates** where a ladder-carrying player flipped to OUT
after P2, so the branch is genuinely rare. On 2026-01-15 it correctly wrote nothing: all 20
"newly OUT" players had no ladder rows because they were already known out overnight.

### PARTIAL · ladder depth is too shallow for the books, too deep for low-count props
Measured on a real slate (2026-01-15, 60k+ board legs joined to our anchors): books ladder out to
roughly **85–90% of the anchor**, consistently. Fixed `±10` is wrong in both directions — points needs
13 and gets 10 (1,294 rungs interpolated); steals/blocks/stocks/turnovers need 1–2 and get 10 (zero
interpolated). Per-prop `LADDER_DEPTH` table added to `classification_ladder_v12.py`;
**the scoped expansion has not completed.**

### CAVEAT · `fantasy_score` has never appeared in the NBA board archive
A scan of both seasons found `player_fantasy_points` on exactly one date (2026-09-12), and that same
snapshot carries `player_first_inning_runs` — **it is MLB data**. Fantasy score and the period props
reach us only through the DFS scrapers, which is what the live pipeline reads. Mapped in
`score_board_legs.py` so they score correctly the moment they arrive.

### DEFERRED (owner-sequenced) · leg correlation, live plumbing
Leg correlation is slip-building-stage work and will be treated there, not in this pipeline.
Live plumbing is LAST — nothing is live until the NBA season opens in October.
</content>
</parameter>
<parameter name="message">docs: NBA open items - deferred, dropped, partial, bugs, caveats