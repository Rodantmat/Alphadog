# NBA SYSTEM DESIGN — the three pipelines

**Purpose.** Exactly what each pipeline does, in what order, why each step sits where it does, and the
constraints that shaped it. This is the operational spec.

**Update log**
| Date | What changed |
|---|---|
| 2026-09-20 | Created. P1/P2/P3 as built and tested in the live session; lineage from the owner's three-run model in T1. |

---

## 0. LINEAGE — the owner's three-run model *(T1)*, refined through T4–T9

### 0.1 THE ARCHITECTURE CORRECTION *(T4)* — why the split exists at all
The owner's correction, and the verified reason:
> *"the baseline is **expensive to compute but only changes after a player plays a game — it can be
> CACHED**. Enrichment data (injury news, line movement) **changes all day**… the fast-changing
> scoring engine can **re-run in milliseconds** without ever recomputing the expensive baseline.
> **Merge them, and every minor daily update forces a full slow recompute.**"*

**A caching argument, not a convenience.** This is the founding justification for P2/P3.

### 0.2 The boundary, and how it is enforced *(T7, T8)*
> *"**daily-mined = enrichment; derivable-from-history = baseline**"* — the baseline is
> *"**AGNOSTIC** of daily context and market."*
**Encoded as a column**: `nba_config.factor_registry` tags **25 baseline / 4 enrichment** (injury
report, confirmed lineups, market-spread delta, referee assignment). **Queryable, therefore
enforceable.**

### 0.3 The two-layer contract *(T8)*
> *"Baseline applies static factors; **enrichment applies DELTA factors**: `market_spread −
> derived_spread`, `confirmed_out` superseding `questionable`. **No oscillation, no double-count, and
> the value of live information becomes measurable on its own.**"*

### 0.4 The original cadence vs today *(T4, `NBA_SYSTEM_DRAFT.md` §4b)*
| Run | Original | Today | Note |
|---|---|---|---|
| Static differential | Mondays **2:00 am PT** | Mondays **12:00 PT** | nothing here is cutoff-sensitive |
| Delta daily | **~11:00 am** | **01:00 PT** planned | ⚠ **tighter than the 6am ET the lag research endorsed** |
| Master run | **2h before the first game — DYNAMIC** | **fixed 1:15 PM PT** | ⚠ **breaks on early-tip days** |

### 0.5 Three governing principles
- **The baseline must NEVER live-query stats.nba.com** — speed, stability, and **reproducibility**
  (*"a live query at 9am vs 10am could return different data if a correction posted in between"*).
- **Late NBA stat corrections are NOT chased** — *"a consistent point-in-time snapshot."*
  **⚠ Note the tension with T1's blueprint §4k**, which prescribes the opposite for outcome data:
  *"**a BOUNDED ROLLING RE-VERIFICATION WINDOW, not a single permanently-frozen cutoff** — commercial
  sports-data practice converges on **a 3–4 day, up to roughly a week, rolling correction pass**,
  since **official stat corrections are routinely issued multiple days after a game concludes.**"*
  **Both are right for different layers**: the **baseline** must be point-in-time or walk-forward
  parity breaks; **`board_outcomes`** is the label the calibration learns from, and a frozen wrong
  label is training on stale truth. **See `NBA_OPEN_ITEMS.md`.**
- **No pasted constants** — HCA, `P(blowout|spread)` and the blowout ratios are derived from TRAIN
  inside each run; `baseline_ladder_runs` records what each run derived.

---

## 0.6 The original wording

> *"the system is composed by 3 runs, each run will be ran by claude coworker, **so no runner,
> orchestrator or anything like, it only breaks the run** … individual worker by individual worker,
> path by path and making sure they are properly doing their jobs, **that is the way MLB system runs
> now and is running just fine**."*

| Owner's run | Today's pipeline |
|---|---|
| **Static differential** — calendar, teams, players, rosters, arenas, referees | **P1 Weekly Static** |
| **Delta daily** — game logs + incremental mining, **and the baseline, "the heart of the system"** | **P2 Overnight Heavy** |
| **Master run** — Board → Daily Context → Market/Odds → Scoring Engine | **P3 Afternoon Light** |

**Locked dependency, from T1:** *"the baseline must fully finish before master-run's Daily Context or
Scoring stages touch it."* → **P2 must complete before P3 runs.**

**There is deliberately no orchestrator.** Each pipeline is its own workflow with its own concurrency
group.

---

## 0.7 THE FOUR-LAYER ORDERED FULL-RUN PATTERN *(T1, the blueprint)*
*Recorded 2026-09-20. Described as MLB's **real, current** architecture — explicitly **"not the
abandoned earlier 'orchestrator + auto-scheduled cron' design."***

| # | Layer | Contents |
|---|---|---|
| **1** | **Board** | pull each platform's raw board (own PrizePicks scraper + ParlayAPI for Sleeper/Underdog), **normalise into a common shape**, write to `market.*_board_current` |
| **2** | **Daily Context** | *"same-day contextual factors — **lineups/rotations, player availability, matchup context, injury status**"* |
| **3** | **Market** | *"mine sportsbook/DFS pricing data for **cross-referencing and multiplier-study** purposes"* → `market.context_probe_*`, archived to `archive.market_prop_context_history` |
| **4** | **Scoring** | *"the actual prediction/probability engine — **baseline model → enrichment factors (EACH A 'PHASE' FILE) → matrix builder → scoring engine → hit-probability board → FINAL BOARD (curated, tiered PRIMARY/REVIEW output)**"* |

> *"**This four-stage order is LOAD-BEARING, NOT ARBITRARY** — replicate the same ordering for NBA and
> **DON'T PARALLELIZE STAGES 1→2 WITHOUT RE-VERIFYING the same dependency doesn't exist.**"*

**Layer 4's internal chain names two stages NBA has not built under those names:**
| MLB stage | NBA equivalent |
|---|---|
| baseline model | ✅ `classification_ladder_v12.py` → `baseline_ladder` / `baseline_history` |
| enrichment factors, **each a separate "phase" file** | ✅ `build_final_hp.py` + the factor registry — **consolidated, not per-factor files** |
| **matrix builder** | the full prop × line × side matrix — ✅ **`baseline_history` (19.3M rows) is the matrix** |
| scoring engine | ✅ `score_board_legs.py` |
| hit-probability board | ✅ `final_hp` (38.7M rows) |
| **FINAL BOARD — *"curated, tiered PRIMARY/REVIEW output"*** | ⏸ **NOT BUILT** — this is the slip/selection layer, correctly deferred |

**⚠ The PRIMARY/REVIEW tiering is the stated end product**, and NBA stops one stage short of it. That
is consistent with the owner's sequencing (*"goblins and demons… board dependent"*, selection deferred),
**but it means `board_scored` is the last artefact, not a curated board.**

### ⚠ THE DOCUMENTED ORDERING BUG — Board must run BEFORE Daily Context
> *"MLB had **a real, documented ordering bug from running these OUT OF ORDER**:
> ***'Board/Score Prep MUST run before Daily Context. Daily-context sidecars FILTER BY PREPARED-BOARD
> pickable/current rows; running them BEFORE board refresh produced FALSE `VALID_ZERO` /
> `NOT_APPLICABLE`… despite calendar/source availability.'***"*

**The failure mode is specific**: daily-context steps filter against the prepared board, so if the
board has not been refreshed they find nothing and record **`VALID_ZERO` / `NOT_APPLICABLE`** —
*"despite calendar/source availability"*, i.e. **the data existed and was reachable; the filter had
nothing to match.**

**How NBA relates:**
- **P3** runs **board → context → market → score** inside one workflow, so ordering is enforced by
  step order rather than by a queue.
- **The same dependency exists inside P3**: `score_board_legs.py` is **board-scoped**, so **if the
  board scrape has not landed it has nothing to score** — a small or empty run, not an error.
- **The NBA analogue of the false-`VALID_ZERO` symptom is a low leg count.** P3's certifier asserts
  the cutoff; **whether it asserts a minimum board size is worth confirming.**

**This is also the origin of the owner's locked dependency** — *"the baseline must fully finish before
master-run's Daily Context or Scoring stages touch it"* → **P2 must complete before P3.**

---

## 0.75 THE THREE EXPLICIT NON-GOALS — what NBA was told NOT to build
*Source: T1, `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` **§6**, written before any NBA code existed.
Recorded 2026-09-20 (T1 pass 31) — the three facts existed in these documents as **things NBA did**;
they had never been recorded as **instructions NBA was given**.*

> 1. *"**Don't build a per-prop 'one worker per prop' architecture** — MLB tried this, abandoned it in
>    favour of a unified scoring engine, and **left 19 dead stub files behind as evidence**. **Build
>    the unified version from the start.**"*
> 2. *"**Don't try to port MLB's weather, quality-of-contact, or RFI/NRFI-style factors** — they have
>    **no basketball analogue** and building them would be **wasted effort**."*
> 3. *"**Don't invest in an elaborate auto-scheduling orchestrator BEFORE the manual pipeline works
>    end-to-end and has been verified against real data at least once.**"*

| # | Honoured? | Evidence in this system |
|---|---|---|
| 1 | ✅ | one unified engine — `nba/build_final_hp.py`; no per-prop worker was ever created |
| 2 | ✅ | no weather, quality-of-contact or RFI-analogue factor exists in `nba_config.factor_registry` |
| 3 | ✅ **then**, ⚠ **now** | **there is no orchestrator** — see §0.6 — but P2 and P3 **still have no cron** |

### ⚠ Non-goal 3 is a SEQUENCING rule, and the sequence has moved on
It forbids an orchestrator **"before the manual pipeline works end-to-end and has been verified
against real data at least once."** **It does not forbid scheduling.** It is the correct explanation
for why **P2 (§3) and P3 (§4) were built with `no cron yet`** — and **it stops applying the moment
that one verified end-to-end run exists.**

**Season opens 2026-10-20** *(corrected 2026-09-21, §T10.18b — this line read 2026-10-03; that is
preseason opening night, verified live: prefix 001 preseason 10-03→10-16, prefix 002 regular
10-20→2027-04-11)*. **Whether that verified end-to-end run has happened is NOT RECORDED** —
§7's verification table marks the pipelines' status, but the specific question non-goal 3 poses has
never been asked in these documents. **Flagged in `NBA_OPEN_ITEMS.md`, not resolved here.**

### ⚠ The owner restated non-goal 1's sibling independently, in his own words
Non-goal 3 came from the MLB handoff. **The owner arrived at the same conclusion separately** —
*"no runner, orchestrator or anything like, **it only breaks the run**"* (§0.6). **Two independent
sources, one rule**, which is why it is the most robust constraint in this document. **Note they are
not identical**: the handoff says *"not yet"*; the owner says *"not at all."* **The owner's is the
binding one.**

---

## 0.8 CHAIN INDEPENDENCE — don't build one monolithic run
*Source: T1, blueprint §4o. Recorded 2026-09-20.*

### The operational rule it comes from
> *"**When triggering a full run, backfill, or any multi-stage chain genuinely expected to take
> several minutes or more, DO NOT sit there REPEATEDLY POLLING or RE-CHECKING its status turn by
> turn** — that **burns real attention and session budget for no benefit, since THE JOB RUNS
> INDEPENDENTLY OF WHETHER ANYONE IS WATCHING IT.**
> **The correct pattern: TRIGGER IT, DO ONE REAL CONFIRMATION CHECK that it has genuinely started,
> REPORT THAT PLAINLY, and then STAND BY.**"*

### ⚠ The design consequence
> *"**DON'T design ONE GIANT COMBINED CHAIN where a SLOW EARLY STAGE SILENTLY DELAYS OR BLOCKS EVERY
> LATER STAGE for an UNBOUNDED amount of time.**
> **Each major layer — the BOARD layer, the DAILY-CONTEXT layer, the MARKET layer, the SCORING
> layer — should be ITS OWN GENUINELY INDEPENDENT, SELF-GATING, SELF-CONTINUING CHAIN that can be
> TRIGGERED ON ITS OWN and CHECKED ON ONLY WHEN ASKED** — **trigger one, let it finish in the
> background, then trigger the next** — **rather than A SINGLE MONOLITHIC RUN where an EARLY
> BOTTLENECK SILENTLY STALLS EVERYTHING DOWNSTREAM.**"*

### ⚠ NBA built the opposite for P3, deliberately
**P3 runs board → daily context → market → scoring as SEQUENTIAL STEPS IN ONE WORKFLOW.** The four
layers named here as *"genuinely independent chains"* are **one monolithic run** in NBA's design.

**The trade is real and cuts both ways:**
| One workflow (NBA's P3) | Four independent chains (prescribed) |
|---|---|
| ✅ **Ordering is enforced by construction** — the Board-before-Daily-Context bug (§0.7) cannot occur | ⚠ ordering must be managed |
| ✅ One concurrency group, one certifier, one failure surface | ⚠ four of each |
| ⚠ **A slow board scrape delays scoring** | ✅ a slow stage blocks only itself |
| ⚠ **An early failure means no scoring at all that day** | ✅ later layers can still run on prior data |

**NBA's mitigation is time budget, not independence**: P3 runs at **1:15 PM PT** against a first tip
no earlier than ~4 PM PT, so there is slack. **But the failure mode the blueprint names is exactly
"an early bottleneck silently stalls everything downstream", and P3 has that shape.**

**⚠ The sharpest case is the board scrape.** It is step one, it depends on an external DataDome-guarded
host, and **everything downstream is board-scoped** — so a board failure produces **a run that
completes with almost nothing scored**, rather than a loud stop.

**P1 and P2 are less exposed**: P1's steps are independent scrapers, and P2's heavy stages
(mine → grade → refit → build) have genuine data dependencies that justify sequencing.

**The operational half IS followed — in the LATER transcripts.** *"While that builds (~50 min for six
pairs), the loader worker"*, *"let me check the run directly rather than keep polling blindly."*

> ### ⚠ CORRECTION 2026-09-20 (T1 pass 38) — **it was NOT followed in T1, and the owner said so**
> **VERIFIED** by extracting every `bash_tool` call in T1. **The session's entire local execution is
> two syntax checks, two `cat`s, and **TWENTY-FIVE polling sleeps totalling 40.3 minutes** *(count and total corrected 2026-09-20, T1 pass 66 — **MEASURED** from the export's timestamps; the earlier "thirteen" counted distinct durations, not calls)*— `sleep 30, 40, 45, 50, 55, 60, 70,
> 90, 150, 240, 280, 290`, each `; echo done`, each waiting on a GitHub Actions run. **That is
> exactly what §4o prohibits.**
>
> **The owner interrupted it live** — owner message 6 of 15: *"**what is going on? what are these
> waits for?**"*
>
> **The cause is structural as well as behavioural**: T1 had **no way to await a run** —
> `github_trigger_workflow` was absent from the session's tool list (`NBA_MASTER_SUMMARY.md` §T1.17),
> so there was **no completion signal to subscribe to, only a run list to re-read.** The file-based
> trigger (`NBA_SYSTEM_ARCHITECTURE.md` §7) answers the first half; **the owner's objection answered
> the second.** **The evidence quoted above is from LATER transcripts — T1 is the counter-example.**

---

## 0.9 TRIGGER / SCHEDULING REALITY — "build this correctly from day one"
*Source: T1, blueprint §5. Recorded 2026-09-20.*

### MLB's real operating model, after abandoning automation
> *"**MLB's real, current operating model (AFTER ABANDONING AN EARLIER, MORE AUTOMATED DESIGN):
> MANUAL or COWORK-SESSION-DRIVEN, LAYER-BY-LAYER execution, NOT continuous automated cron
> dispatch.** The full **orchestrator/auto-scheduler machinery that was built earlier was later
> RETIRED** in favour of running each layer by hand or via a scheduled Cowork/Claude session
> — **currently 4× daily: 1am, 9am, 1pm, 5pm Pacific for MLB.**
> **DO NOT build an elaborate auto-scheduling orchestrator for NBA BEFORE you have A WORKING MANUAL
> PIPELINE** — **MLB's own history shows THE AUTOMATED VERSION ACCUMULATED REAL, HARD-TO-DETECT
> PROBLEMS before being scaled back to manual/scheduled-session control.**"*

**This is the origin of the owner's no-orchestrator rule** (*"so no runner, orchestrator or anything
like, **it only breaks the run**"*) — **it is not a preference, it is a retired architecture.**

> ### ⚠⚠ CONTRADICTION 2026-09-20 (T1 pass 44) — **the live code says FIVE windows, not four**
> **VERIFIED by grep of the live `generate_wrangler_configs.py`:**
> `MASTER_RUN_BASE_TIMES = ["16","20","0","5","9"]` with the inline comment
> **`# 9am/1pm/5pm/10pm/2am PT`** — and its reason: *"closes the **~11-hour overnight gap** the
> previous 3-time schedule left even when Cowork ran normally."*
>
> **The blueprint says four (1am, 9am, 1pm, 5pm). The code says five (9am, 1pm, 5pm, 10pm, 2am).**
> The overnight slot differs too — **2am in code, 1am in the blueprint.** **Flagged, not resolved**,
> but the standing precedence rule — *live code outranks documents* — points to the code, and the
> code's comment reads like the record of a later change.
>
> **The comparison below is built on the blueprint's four and should be read with that caveat.**
> On the code's five: **MLB's 10pm PT window has no NBA counterpart**, and **NBA's P2 at 01:00 PT
> falls between MLB's 10pm and 2am rather than matching a 1am run.**

**MLB's four daily windows — 1am / 9am / 1pm / 5pm PT — are worth comparing to NBA's three:**
| | MLB | NBA |
|---|---|---|
| Overnight | **1am PT** | **P2 at 01:00 PT** — the same hour |
| Morning | 9am PT | — *(NBA folds this into P2)* |
| Midday | **1pm PT** | **P3 at 1:15 PM PT** — near-identical |
| Late | 5pm PT | — |

**NBA runs three pipelines where MLB runs four sessions**, and the two shared times match almost
exactly. **The two NBA does not have are the 9am and 5pm windows** — and §4n's warning that *"one of
the four intended times NEVER FIRED AT ALL"* is a reason to measure rather than assume MLB's four are
real either.

### ⚠ "NO GAMES SCHEDULED" MUST BE A FIRST-CLASS STATE
> *"**A real, confirmed architecture gap in MLB, worth designing around from the start for NBA: the
> system COULD NOT ORIGINALLY DISTINGUISH 'GENUINELY ZERO GAMES TODAY' (e.g. ALL-STAR BREAK) from
> 'SOMETHING IS BROKEN AND RETURNED ZERO ROWS.'**
> **Build an EXPLICIT, FIRST-CLASS 'NO GAMES SCHEDULED' STATE into the NBA pipeline FROM DAY ONE —
> don't let a natural zero-game day SILENTLY LOOK IDENTICAL TO A REAL FAILURE.**"*

**The NBA calendar has real zero-game days**: the **All-Star break** (~5 days), and scattered dates.
**`nba_calendar.games` holds 2,666 games and knows exactly which dates are empty.**

**⚠ NBA's current signals are ambiguous in exactly the way described:**
| Signal | Zero games | Broken |
|---|---|---|
| P2's delta gap audit | 0 expected, 0 found → **passes** | 0 expected because the calendar read failed → **also passes** |
| P3's scored-leg count | 0 legs | 0 legs |
| The certifiers | assert freshness and row counts | — |

**The distinguishing information exists** — the schedule says whether games were expected — **but no
explicit "no games scheduled" state is recorded as implemented.**

**And it matters twice over for the season opener**: **2026-10-01 and 10-02 are genuinely zero-game
days** before opening night on the 3rd, **and they coincide with the `active_stats_season` edge case
already recorded.** A pipeline run on those dates should report *"no games scheduled"*, not silence
that looks like success.

### 5a. THE ROOT CAUSE, AND ITS SUBTLE NUANCE
*Source: T1, blueprint §5a — "the details matter more than the summary." Recorded 2026-09-20.*

**The bug itself was one line:**
> *"**A single line in the worker that *PRODUCES* the prepared board rows: AN UNCONDITIONAL THROW
> WHENEVER PREPARED ROWS WERE ZERO, WITH NO CHECK FOR *WHY* THEY WERE ZERO.**"*

**And the correct pattern already existed in the same codebase:**
> *"**A downstream daily-context worker had ALREADY SOLVED AN ANALOGOUS PROBLEM CORRECTLY**, reporting
> **a clean 'VALID ZERO' pass** instead of failing when its own input was legitimately empty.
> **The first, generalizable lesson: BEFORE BUILDING a new 'how do I distinguish a legitimate zero
> from a real failure' pattern, CHECK WHETHER AN EQUIVALENT, ALREADY-CORRECT PATTERN EXISTS ELSEWHERE
> IN THE SAME CODEBASE** — **it often does, and COPYING A PROVEN PATTERN BEATS INVENTING A NEW
> ONE.**"*

### ⚠⚠ BUT THE PATTERN COULD NOT BE COPIED NAIVELY — the producer/consumer distinction
> *"**The existing correct pattern worked BECAUSE THAT WORKER WAS A *DOWNSTREAM CONSUMER* of
> already-prepared rows** — **if its input was empty, that was AUTOMATICALLY a valid state, nothing
> upstream to double-check.**
> **The worker with the actual bug was DIFFERENT: it was the *PRODUCER* of the prepared rows in the
> first place, reading RAW BOARD DATA directly. It COULDN'T use 'my own input was empty' as a signal,
> BECAUSE THAT'S CIRCULAR** — the real question it needed answered was **'were there GENUINELY NO
> GAMES SCHEDULED TODAY AT ALL, INDEPENDENT of whether ANY SINGLE UPSTREAM DATA SOURCE happened to
> return anything.'**
> **That requires AN INDEPENDENT SOURCE OF TRUTH — A REAL GAME CALENDAR — NOT a SELF-REFERENTIAL CHECK
> on the worker's own inputs.**"*

**This is the precise reason `nba_calendar.games` must be the arbiter**, and it maps exactly onto
NBA's pipeline:
| Role | NBA component | Correct zero-check |
|---|---|---|
| **PRODUCER** — reads raw board/source data | the board scraper, the delta scraper | ❌ **cannot** use "my input was empty" — **must consult the calendar** |
| **CONSUMER** — reads already-prepared rows | `score_board_legs.py`, `build_final_hp.py` | ✅ an empty input **is** a valid zero |

**✅ NBA's delta worker already does this correctly.** Its **pre-flight completeness check compares
the calendar's Final count against the logged count** — *"halt and warn, don't silently proceed on an
incomplete night"* — **which is exactly "an independent source of truth, not a self-referential
check."** `check_delta_gaps.py` audits *"against the SCHEDULE, not itself"*, stated in those words.

**⚠ The producer NOT protected this way is the board scraper.** It reads raw DFS board data, and a
zero-projection return has no calendar cross-check recorded. **On a genuine no-games day it should
report a valid zero; on a DataDome block it should fail — and the two look identical from inside the
scraper.**

**And the first lesson applies directly**: NBA **already has the correct pattern** in the delta
worker's calendar-based pre-flight. ### ⚠⚠ THE DEEPER ROOT CAUSE — "correctly coded" is not "actually running"
> *"**The calendar tables that *SHOULD* have answered this question ALREADY EXISTED IN THE SCHEMA** —
> **but ONE HAD NEVER BEEN POPULATED AT ALL (ZERO ROWS, EVER), and THE OTHER WAS WEEKS STALE.**
> **The actual root cause WASN'T A MISSING FEATURE in the worker throwing the error — it was that THE
> ONE OTHER WORKER CAPABLE OF KEEPING THE REAL GAME CALENDAR FRESH HAD A FULLY-BUILT, REAL
> IMPLEMENTATION BUT HAD SIMPLY NEVER BEEN WIRED INTO ANY AUTOMATED SCHEDULE.**
> **For NBA: build the 'is a game genuinely scheduled today' calendar signal as ITS OWN
> INDEPENDENTLY-VERIFIED, ACTIVELY-SCHEDULED SOURCE OF TRUTH from day one, NOT something any
> individual pipeline stage tries to infer from its own inputs** — **AND CONFIRM WHATEVER WORKER
> MAINTAINS IT IS ACTUALLY RUNNING ON A REAL SCHEDULE, NOT JUST CORRECTLY CODED.**"*

### ✅ THE CALENDAR ITSELF IS SAFE — verified 2026-09-20
**`scrape_nba_schedule.py` runs in P2**, line 108, in the *"Baseline inputs — season files, quarters,
schedule"* step. **The calendar is refreshed nightly**, and it holds **2,666 games**.

**So NBA does not have MLB's exact failure**: its arbiter of truth is actively scheduled, and the
delta worker's pre-flight consults it rather than inferring from its own inputs.

### ⚠⚠ BUT NBA HAS THE IDENTICAL FAILURE ON A DIFFERENT WORKER
***"Fully-built, real implementation, never wired into any automated schedule"* is a verbatim
description of the weekly differential worker.**

| | MLB's calendar worker | **NBA's differential worker** |
|---|---|---|
| Implementation | fully built | **fully built (T3)** |
| Scheduled | **never wired** | **never wired** — P1 does not call it |
| Observable state | one table 0 rows ever, one weeks stale | **all three `*_differential_log` tables 0 rows; snapshot frozen 2026-09-03** |
| Consequence | zero-vs-broken indistinguishable | **trades, signings, renames undetected** |

**And the instruction — *"confirm whatever worker maintains it is ACTUALLY RUNNING on a real schedule,
NOT JUST CORRECTLY CODED"* — is the check that would have caught it.** It was caught here by querying
the tables, which is the same check applied to the output rather than the schedule.

**⚠ Also worth applying to the other never-scheduled items**: `scrape_nba_splits.py` and career
totals were **put on the weekly cycle in T7 and dropped in the P1 rebuild** — **correctly coded, not
running.**

**The generalisable form**: *"a fully-built implementation that was never scheduled"* is a distinct
failure class from a bug, and **the only reliable detector is observing the output, not reading the
code.**

---

## 0.95 THE CADENCE AS ORIGINALLY LOCKED — three elements never recorded
*Source: T1, `NBA_SYSTEM_DRAFT.md` **§4b — "Real operating cadence — locked 2026-09-03, mirrors the
existing MLB system exactly."*** *Recorded 2026-09-20 (T1 pass 32).*

**The cadence itself and its divergence from what was built are already recorded** in the comparison
table at §0.7. **Three elements of §4b were not**, and each is a design decision rather than a time.

### 1 · The master run's trigger was specified as a COMPUTATION, not a clock time
> *"**2 hours before the first scheduled game of the day**… **Real design implication, not a fixed
> clock time**: since **NBA game start times vary day to day**, this trigger time **must be COMPUTED
> DYNAMICALLY from the real data already in `nba_calendar.games` — today's earliest
> `game_datetime_utc` MINUS 2 HOURS** — **not a hardcoded time-of-day like the other two runs.**"*

**The mechanism was named, the table it reads was named, and the column was named.** §0.7 already
records the outcome — **P3 ships as a fixed `15 21 * * *` and *"breaks on early-tip days"*** — but not
that **the dynamic alternative was fully specified, sourced to an existing populated table, and
distinguished explicitly from the other two runs.** `nba_calendar.games` holds **2,666 games** and
carries `game_datetime_utc`, so **the input exists today.**
**⚠ The two constraints are not the same and both are real**: §1's **1:15 PM PT cutoff** is bounded
*below* by the injury report (*Pacific clubs file last, by 1:00 PM PT*); §4b's rule is bounded *above*
by the first tip. **On an early-tip day they conflict, and the conflict is structural, not a bug in
either.** Recorded in `NBA_OPEN_ITEMS.md`.

### 2 · The optional SECOND master run — and the architecture that exists to enable it
> *"**Once, sometimes TWICE a day**… with an **optional second run later 'only if needed'** (e.g. **a
> late injury designation change or significant line movement after the first run**). **The optional
> second run is exactly the cheap, fast re-run THE TWO-STAGE BASELINE/ENRICHMENT SEPARATION WAS
> DESIGNED TO MAKE POSSIBLE** — it only needs to **re-run the Scoring Engine against the
> already-cached baseline plus fresh enrichment/market data, NOT RECOMPUTE ANYTHING EXPENSIVE.**"*

**⚠ This is the stated PURPOSE of the two-layer split, and it had not been recorded anywhere.**
`NBA_FINAL_SCORING_CALIBRATION.md` §2 documents the two-layer contract as a *correctness* boundary
(baseline = static, enrichment = delta). **§4b says it was also, from the start, an
*operational* one: the split is what makes a second same-day run cheap.** The two framings are
compatible and neither implies the other.

**And §4's own reasoning already proves the second run is affordable**: *"the refit uses only games
strictly before today, so **it is identical at 1 AM and 1:15 PM**. What genuinely changes is
availability, and only for the affected teams."* **If it is identical at 1 AM and 1:15 PM, it is
identical at 4 PM.** **A second run costs the board scrape, the availability delta and the scoring —
not the refit.**

**Status: NOT RECORDED as built.** P3 (§4) documents one run with a cutoff and no second-run path,
and **the trigger conditions §4b names — a late designation change, significant line movement — have
no detector.** Recorded in `NBA_OPEN_ITEMS.md`.

### 3 · The ~11:00 AM delta time was DERIVED, not chosen
> *"**~11:00am** (person's stated time; matches Pacific…) giving **a large safety buffer well past the
> **~2:00am ET latest-possible-game-end + 10–15 min data-finalization window** — **confirmed via
> research and Gemini consultation on 2026-09-03.**"*

**The binding physical constraint on the overnight run is the latest possible game end plus the
league's own data-finalization lag** — *~2:00 AM ET + 10–15 min* — **and it was researched, not
assumed.** **P2 ships at 01:00 PT = 04:00 ET**, which is **~2 hours AFTER the constraint**, so the
shipped time satisfies it with less margin than the specified 11:00 AM but satisfies it. **Recording
the constraint matters more than the time**: it is the number any future re-timing of P2 must respect,
and it was previously only implicit.

### 4 · "No cron" meant something specific
> *"**No cron/orchestrator automation** — these times are **the real, intended Claude
> Coworker-SCHEDULED-TASK trigger times** (per Section 4's existing 'no orchestrator' confirmation),
> **NOT in-code scheduling logic to be built into any NBA worker.**"*

**The rule was never "nothing is scheduled."** It is **"no worker schedules itself."** **A scheduled
Cowork session firing a workflow is compliant; a `setInterval` or a self-triggering Cron Trigger
inside a Worker is not.** This resolves an ambiguity that reads through §0.75's third non-goal and
§0.6's *"it only breaks the run"* — **neither forbids the GitHub Actions cron that P1 already
carries.** **Flagged, not resolved**: whether a `.github/workflows` cron counts as *"in-code
scheduling logic"* is not stated anywhere, and P1 already has one.

---

## 1. THE CUTOFF — why 1:15 PM PT

**The binding constraint is the game-day injury report.** It is due **11am–1pm LOCAL to each game's
market**, so Eastern clubs file by 10 AM PT and **Pacific clubs are last at 1:00 PM PT**.

Every other daily input lands earlier:
| Input | Available by (PT) |
|---|---|
| Prior-night box scores | ~3 AM |
| Referee assignments | ~6–7 AM |
| Market spread / total | 08:00 snapshot |
| Projected lineups | through the morning |
| Boards | on demand |
| **Game-day injury report** | **1:00 PM** ← binding |

**⇒ One window at 1:15 PM PT holds every club's report.**

**The 2:30 PM PT figure was drift** — traced to a list of observed injury-PDF timestamps in *Eastern*
(2:30 PM ET = 11:30 AM PT), and to `nba_asof.py`'s `PHASE2_CUTOFF_LOCAL = "17:45"  # after the 5:30 PM
ET day-of report` — a league **bulletin**, not a filing deadline. `nba_asof.py` already had
`PHASE1_CUTOFF_LOCAL = "16:00"` = **1:00 PM PT**, which is the correct anchor.

**Consequences:** no third pipeline; **scenario precompute dropped** (one window = nothing to select
with); **freshness gate dropped** (uniform penalty discriminates nothing).

---

## 2. P1 — WEEKLY STATIC
`.github/workflows/nba-p1-weekly-static.yml` · **cron `0 19 * * 1` = Mondays 12:00 PT** ·
concurrency `alphadog-nba-p1-weekly` · timeout 180 min

**Why weekly:** these tables are as-of weekly by construction. The cadence is the original one from T1
(`nba_differential_check_cadence = weekly`, cron `0 9 * * 1`), and the reasoning from T2 is explicit —
bio fields are *"truly static"* and season aggregates are *"semi-static, **stable enough for weekly
refresh: a single game barely moves a season average after 20+ games played**."*
**⚠ That reasoning does NOT hold in the first 20 games of a season**, and the cadence was never
revisited for October.

**Why Monday noon:** deliberately far from P2 (daily 01:00 PT) so the two cannot contend. The cron is
UTC so the local hour drifts an hour across DST — harmless, because **nothing here is
cutoff-sensitive**.

**Steps, in order (as actually built):**
1. Teams and arenas
2. Players and bio
3. Weekly as-of season tables (pt_defend, hustle, clutch, coaches, all_players)
4. Team stats, on/off, play types, tracking
5. DARKO and shot quality
6. **Defender ratings** (two-way ridge, weekly as-of) — writes Postgres
7. Static context (coach changes) — writes Postgres
8. Commit data files
9. **Certify** (`PIPE=p1`) — asserts freshness ≤ 8 days; **fails the job** if stale.
   *(Run live: correctly FAILED on defender ratings 6 days stale.)*

### ⚠ THREE THINGS P1 DROPPED IN THE REBUILD — verified 2026-09-20
| Missing | Was |
|---|---|
| **The weekly differential worker** | unwired since T3; **verified empty today**, snapshot frozen at 2026-09-03 |
| **`scrape_nba_splits.py`** | put on the weekly cycle in T7 |
| **Career totals** | put on the weekly cycle in T7 via the `mode: "weekly"` input |

*(The DvP recompute is fine — T7 placed it inside the **delta** worker, so it lives on P2's path.)*
**Splits and career totals are cumulative aggregates** — a 2025-26 snapshot gets steadily more wrong as
2026-27 runs.

### ⚠ AND THE LARGER QUESTION — does P1 load anything to Postgres?
**Only `build_defender_ratings.py` and `build_static_context.py` touch `DATABASE_URL`.** There is **no
loader step or `run_job`** for teams, players, bio, season tables, team stats, on/off, play types,
tracking, DARKO or shot quality — **all of which have writer Workers built in T1–T3.**
**Either those Workers are triggered separately (the Coworker model), or P1 refreshes committed JSON
that Postgres never sees.** **This is the top pre-season verification.**

---

## 3. P2 — OVERNIGHT HEAVY
`.github/workflows/nba-p2-overnight-heavy.yml` · **no cron yet** · concurrency
`alphadog-nba-p2-overnight` · timeout 330 min

**No cron until the season opens.** A job failing nightly against an empty schedule trains everyone to
ignore red builds. Target at season start: **daily 09:00 UTC = 01:00 PT**, after the last West-Coast
game finalises and eight hours before P3's cutoff.

**Steps, in order — and the order is load-bearing:**
1. **Daily delta ingestion** — bulk current-season refresh + per-game starters/officials
2. **Injury report (day-before filing)** — `INJURY_MODE=daily`; the availability input P2 builds from
3. **Referee assignments + per-game matchups** — BASELINE-stage factors (D1, M1), available 6–7 AM
4. **Season files, quarters, schedule**
5. **Commit mined data**
6. **DELTA GAP AUDIT** — `nba/check_delta_gaps.py`, against the SCHEDULE (or the team-log witness).
   **The one check that catches a silent hole.** Fails on missing dates, missing games, half-captured
   games, or a truncated-roster RATE above 0.5%.
7. **GRADE last night's board** — **must precede the calibration refit**, or yesterday's evidence is
   invisible to today's cells
8. **Market spreads and totals** — blowout and matchup run on the real market line
9. **Build baseline ladder, PER PROP PAIR** (8 pairs, ~8 min each). Calling the builder once would
   silently produce only the default pair.
10. **Components → combos → periods.** Combos need `BT_SAVE_COMPONENTS=1` singles pickled FIRST.
11. **MERGE the per-pair artefacts** into `nba_baseline_ladder_<asof>.json`
12. **COMMIT the merged ladder** — the loader fetches over HTTP from the repo, so an uncommitted
    ladder is invisible and the load 404s
13. **Load into Postgres** — the loader **refuses a singles-only slate**
14. **As-of ladder calibration** — refit on everything graded strictly before today
15. **Blowout model refit** · 16. **Confidence deduction refit**
17. **Certify** (`PIPE=p2`) — today's baseline exists, ≥25 props, zero invalid probabilities

**Replay:** `asof` + `skip_mining=true` reruns the calculation path on any past date.

---

## 4. P3 — AFTERNOON LIGHT
`.github/workflows/nba-p3-afternoon-light.yml` · **no cron yet** · concurrency
`alphadog-nba-p3-afternoon` · timeout 120 min

**Target cron at season start:** `15 21 * * *` = 1:15 PM PST (2:15 PDT, still 105 min before the
earliest 4 PM PT tip).

**It refuses to run for TODAY before 13:00 PT** — Pacific clubs may not have filed.

**P3 IS BOARD-SCOPED.** It scores every leg the apps actually OFFER — all prop lines, every rung the
app exposes, both directions, goblins/standards/demons — **not** the internal ±10 ladder for rungs
nobody offers.

**Why it must not rebuild:** an earlier version rebuilt all 8 pairs and **ran 35+ minutes without
finishing** — disqualifying. The cost is REFITTING the recipe over three seasons, and **that refit uses
only games strictly before today, so it is identical at 1 AM and 1:15 PM.** What genuinely changes is
availability, and only for the affected teams.

**Steps, in order:**
1. **Resolve slate date; assert the cutoff has passed**
2. **Day-of injury report** — the binding input
3. **Boards** — PrizePicks (own NBA producer, `league_id=7`), Underdog, Sleeper, Fliff.
   Each in its own step; `SLEEPER_SPORTS=nba` and `SLEEPER_OUT_DIR=boards` are mandatory
4. **Archive into Postgres** — **`ARCHIVE_LABEL=window`**, never the `routine` default
5. **Board tiers** — goblin/standard/demon with the anchor
6. **Market snapshot + rung market**
7. **Commit day-of data**
8. **Availability delta** — `DELTA_FROM=baseline`, `DELTA_TO=phase1`
9. **Score the board** — HP from P2's ladder at the exact rung, off-ladder rungs interpolated in
   log-odds and **flagged** (−4 confidence), delta applied, as-of calibration, confidence, score, edge
10. **Certify** (`PIPE=p3`) — legs scored, confidence non-null, score in 0–100, board captured

**NO lineup scrape** (A5 closed). **NO scenario precompute.** **NO freshness gate.**

### ⚠ P3 does NOT run `build_final_hp.py` — and a live comment says it does
*Recorded 2026-09-20 (T1 pass 33). **VERIFIED** by reading `.github/workflows/nba-p3-afternoon-light.yml`.*

**P3's scoring step is step 9 above — `python nba/score_board_legs.py`.** `build_final_hp.py` appears
in `nba-absence-panel.yml`, `nba-engine-test.yml` and `build_confidence_v3.py`, **and in no P-pipeline
workflow.** The two engines are distinct: **`build_final_hp.py` scores the internal ladder into
`nba_score.final_hp`; `score_board_legs.py` scores the board into `nba_score.board_scored`** — which
is what §4's *"P3 IS BOARD-SCOPED"* rule requires.

**The drift**: a comment inside `build_final_hp.py` asserts *"**P3 sets it** [`FE_DATE`] so the
afternoon pipeline rescores only today's legs (seconds) instead of all 38.7M (~90 minutes)."*
**That describes an architecture that does not exist**, and `NBA_WORKERS.md` had inherited the claim.
⚠ **It matters because `FE_DATE` is destructive** — it scopes the read and not the delete, and the
2025-26 partition of `final_hp` has already been reduced to a single date. **Top of
`NBA_OPEN_ITEMS.md`.**

**Blueprint §9 failure mode #6** — *"silent config/formula drift… the output is just silently
wrong-but-plausible"* — **in documentation rather than in config.** The fix §9 prescribes is the
**whole-universe comparison**: diff every documented step against the workflow that actually runs it.
**That diff has been run for P3's scoring step only.** The rest of P1, P2 and P3 are **NOT VERIFIED
step-by-step against their workflow files.**

---

## 4b. ⚠ WHAT NO PIPELINE DOES — `final_hp` is rebuilt by nothing
*Recorded 2026-09-20 (T1 pass 34). **VERIFIED** by reading all three P-pipeline workflow files.*

The calculation chain in §5 below runs `baseline HP → availability delta → as-of calibration →
final HP`. **The last arrow is not wired into any pipeline.**

| Script | Writes | Run by |
|---|---|---|
| `build_final_hp.py` | `nba_score.final_hp` | **no P-pipeline.** Only `nba-absence-panel.yml` (`FE_WRITE` defaults `'0'`) and `nba-engine-test.yml` (`FE_WRITE: '0'`) |
| `score_board_legs.py` | `nba_score.board_scored` | **P3, step 9** |

**This is by design and worth stating plainly**: **P3 is board-scoped** (§4) — it scores the legs the
apps actually offer, not the internal ±10 ladder — so **`board_scored`, not `final_hp`, is the live
daily output.** `final_hp` is the **backtest/replication surface**, built on demand.

**⚠ Two consequences, neither previously recorded:**
1. **The `final_hp` data loss recorded in `NBA_OPEN_ITEMS.md` is PERSISTENT.** Nothing scheduled will
   notice or repair the 2025-26 partition reduced to a single date, and **no certifier checks its
   date coverage** — `certify_pipeline.py`'s P2 check counts `confidence_model` rows.
2. **§5's chain diagram reads as a nightly pipeline and is not one.** A reader tracing the chain
   would reasonably assume P2 or P3 produces `final_hp`. **Neither does.**

---

## 5. THE CALCULATION CHAIN

```
baseline HP  →  availability delta  →  as-of calibration  →  final HP
                                                                 ↓
                                              confidence (measured deductions)
                                                                 ↓
                                        score 0–100  +  edge (own column)
```

**Confidence** starts at 99 and deducts for named deficiencies, weights MEASURED from realised-gap
separation. Role carries the most (fringe players miss by 0.0283 vs iron-men at 0.0008).

**Score** pivots around a **0.85 confidence neutral**: above it the score lifts toward 100 by up to
half the remaining headroom; below it, down by up to 35%. **Verified**: 0.478 HP / 0.949 conf → 65.06,
and 0.434 HP / 0.952 conf **outranks** 0.468 HP / 0.884 conf.

---

## 6. FAILURE POLICY

**No `|| echo failed` anywhere.** That pattern left 44% of a slate missing while the job reported green.

Three safeguards, each answering a failure this project actually had:
| Safeguard | Answers |
|---|---|
| **Delta gap audit** | a silent hole corrupts every as-of value computed after it |
| **Certifier per pipeline** | a pipeline that cannot fail loudly cannot run unattended |
| **P3's cutoff assertion** | scoring a slate clubs have not filed for |

---

## 6b. PIPELINE SCRUTINY DISCIPLINE — the whole methodology
*Source: T1, `NBA_ARCHITECTURE_BLUEPRINT.md` **§9** — built by MLB after **"a single night of
independent verification turned up multiple serious, silent bugs that every automated check had
missed,"** and offered as **"worth adopting wholesale."***
***Recorded 2026-09-20 (T1 pass 29) — previously unswept.***

### The core philosophy
> *"**A pipeline's own 'PASS'/'COMPLETE' SELF-REPORT is the STARTING POINT FOR SCRUTINY, NEVER THE
> CONCLUSION.** Every real bug MLB found was caught by **independently RE-DERIVING a claim against
> LIVE DATA** — SQL queries against real tables, real deployed code read directly — **never by
> trusting a second read of the same status field the run already reported.**"*

**This is the design rationale behind `nba/certify_pipeline.py` and `nba/verify_confidence.py`, and
behind the existing failure policy in §6** (*no `|| echo failed` anywhere*): a green job is evidence
that nothing raised, not evidence that the data is right.

### The three techniques that found real bugs no automated check would have
| # | Technique | What it is |
|---|---|---|
| 1 | **Systematic whole-universe comparison** | diff the live config against the real formula/logic for **every entry in a universe at once** (every prop, every source, every combo) — **not just the one currently suspected** |
| 2 | **Leg-by-leg manual tracing** | pick real **high-confidence** outputs, pull raw source data **by hand**, compute the expected value independently, and **explain any gap through a documented mechanism** (shrinkage, calibration) rather than accepting *"looks close enough"* |
| 3 | **Tracing a real user-reported symptom back to raw source data** | when someone reports a concrete discrepancy, **trust the report** and trace it to the **actual raw payload** rather than defending the system's own output first |

**Technique 1 applied to NBA would immediately surface the already-recorded `minutes_mixture` drift**
— config describing three components the recipe does not implement. That is failure mode #6 below,
live, today.

### The six named failure modes — §9 says build a check for each, from the start
Full table, with NBA build status, in `NBA_OPEN_ITEMS.md` → *FROM T1 PASS 29*. In summary:

1. **Reconciliation trusting a still-actively-writing batch** — a background writer can still be
   writing after the calling request timed out. **Fix: require the row count stable across two reads
   separated by a real wait (several seconds).**
2. **Reconciliation trusting a permanently-dead writer** — *"indistinguishable from #1 by stability
   alone (both show a stable count), but the actual DATA COMPOSITION tells them apart."* A
   died-mid-write batch *"characteristically recovers as **100% one category and 0% of whatever would
   have been written later in the write order**."* **Fix: check what real upstream data supports per
   category; if a category with clear real supply is wholly absent, refuse to reconcile and force a
   fresh rebuild.**
3. **A completion check satisfied by stale evidence from a PREVIOUS run.** A staleness-window or
   reference-count check can pass *"purely from leftover evidence a prior, unrelated successful run
   produced."* **Fix: use a check only this run's own fresh output can satisfy — `MAX(updated_at)`
   per entity falling INSIDE this run's own execution window, not "recent enough in general."**
4. **A "deactivated" correction/config still silently applying live**, because the deactivation label
   *"doesn't actually defeat the exact filter condition the live code uses (e.g. a substring-match
   filter that a mere prefix doesn't actually break)."* **Fix: read the exact filter condition in the
   live code and confirm the deactivation genuinely fails it** — *"don't just check that a
   human-readable 'deactivated' label exists somewhere."*
5. **Raw source-API field ambiguity silently corrupting a value**, when the heuristic is built on *"a
   DIFFERENT field that merely CORRELATES with the ambiguity rather than genuinely disambiguating
   it."* **Fix: find the source's own genuine disambiguating field — often a human-readable label
   string.**
6. **Silent config/formula drift across a whole universe**, *"with NO ERROR THROWN — the output is
   just silently WRONG-BUT-PLAUSIBLE, invisible to spot-checking whichever entry currently seems
   suspicious."* **Fix: periodically diff live config against the actual formula for the entire
   universe in one pass.**

### Composition checks, not just row counts
> *"Verify that **BOTH expected output categories** (e.g. a PRIMARY/high-confidence tier and a
> REVIEW/lower-confidence tier) are present **in plausible proportions** — **a 100%/0% split is a red
> flag EVEN WHEN THE TOTAL ROW COUNT EXACTLY MATCHES EXPECTATIONS.** A corrupted batch can produce a
> row count that perfectly matches the log while being **wrong in composition.**"*

**Directly applicable to `nba_score.board_scored` and to the tier split.** **Not recorded as built.**

### General verification discipline — applies to every pipeline step
- **Never accept a claimed table/column/fix location without checking it exists exactly where
  claimed** — *"a claim can be true about a DIFFERENT TABLE than your first assumption — verify the
  actual target, don't dismiss from checking the wrong place first."*
- **Wait for real propagation delays.** *"Connection-pool-fronted reads can show STALE RESULTS FOR
  SECONDS TO TENS OF SECONDS after a write"* — directly relevant, since NBA reads Postgres through
  **Hyperdrive**, which is exactly a connection-pool front.
- **Confirm an actual deploy succeeded** (check the real workflow run status) **before testing against
  a fix** — *"a correct-looking diff that NEVER ACTUALLY DEPLOYED produces a false 'still broken'
  result unrelated to the fix's real correctness."*
- **Distinguish a genuine bug from a legitimate real-world anomaly.** *"Cross-source duplicate offers,
  doubleheaders, genuine no-shows/scratches can all look like bugs at a glance and are not —
  **chasing an anomaly to a verified, correct explanation is as much a part of rigorous scrutiny as
  finding an actual bug.**"*
  **NBA analogues**: the same player appearing on PrizePicks, Underdog, Sleeper, Betr and Fliff at
  different lines; **back-to-backs**; a late scratch after the 1:15 PM PT cutoff.

---

## 7. VERIFICATION STATUS *(2026-09-20)*

| Pipeline | Verified |
|---|---|
| **P1** | Certifier run live — correctly FAILED on stale defender ratings. **⚠ Three steps dropped; loader question open (§2).** |
| **P2** | Gap audit proven on all of 2024-25 (0 missing dates/games/half-captured; 2 truncated flagged). Full run pending. **`scrape_nba_per_game_delta.py` confirmed present.** |
| **P3** | **Full chain proven on 2025-11-29** — Klay Thompson flips OUT after P2 → 3,446 teammate overrides at ~1.3 pp → his 828 legs zeroed → 58,395 legs scored → **his Overs 0.0122, Unders 0.9834** |

### The production contract the pipelines implement
From `nba_config.classification_config.production_baseline_ladder`:
- **Builder**: a **patcher** over `classification_ladder_v12.py` — *"single source of truth; anchors
  assert"*
- **Slate**: schedule games on ASOF (`status != final`; replay allows final) × **each team's roster
  from its last 3 games** — not from `nba_ref.players`, which sidesteps the new-player lag
- **`asof_lag: 0 days`** — daily-exact walk-forward; **Platt fit on the season's prior months**
- **Validated**: replay 2026-03-15 — 7 games, 194 roster rows, **173 projected players, 4,498 rows**;
  **43 roster players were DNP — "enrichment removes"**

### The pipeline-level safeguards, and the failure each answers
| Safeguard | Answers |
|---|---|
| **Delta gap audit** (P2) | a silent hole corrupts every as-of value computed after it |
| **Pre-flight completeness check** (delta worker) | *"halt and warn, don't silently proceed on an incomplete night"* |
| **Certifier per pipeline** | a pipeline that cannot fail loudly cannot run unattended |
| **P3's cutoff assertion** | scoring a slate clubs have not filed for |
| **Anchor assertions in the patcher** | a drifted patch writing silently |
| **`known_empty_games`** | three permanently-empty games re-fetched every day forever |
| **`BT_CARRY`** | **October producing ZERO projections** |

**Open before opening day:** see `NBA_OPEN_ITEMS.md` — ranked, with the Postgres-loader question first.