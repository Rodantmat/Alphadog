# NBA OPEN ITEMS — deferred, dropped, partial, bugs, caveats

## 🔴🔴🔴 **T18 PASS 0 — A SEASON-CRITICAL COVERAGE DEFECT THE OWNER NAMES HIMSELF, AND THE SCOPE DECISION THAT ANSWERS T16-7** *(§T18.1, owner, 2026-09-19; **the largest owner stratum in the corpus**)*

### 🔴🔴🔴 **T18-1 — "OUR ANCHOR IS NOT AT THE PROPER PLACE OF THE LADDER, OR THE LADDER IS NOT DEEP ENOUGH"** *(**0 of the twelve, 0 of the thirty**; positive controls `goblin` 636/417, `multiplier` 617/432)*

> ***"Our system should be covering the APP LADDER. **If it is not, we need to change so it covers
> it. Our anchor is not at the proper place of the ladder, or the ladder is not deep enough** — plus
> everything else you have open."***

⚠⚠ **A COVERAGE DEFECT STATED BY THE OWNER AS AN OBSERVATION, WITH TWO CANDIDATE CAUSES AND NO
DIAGNOSIS.** 🔑 **It bears directly on work the sweep has already recorded**: **open item O5** *(the
ladder holds TWO depth regimes under ONE `recipe_version` — per-prop on one as-of day, flat 10 on the
other two)*; **open item O5b** *(30,989 rows sit beyond their prop's measured `LADDER_DEPTH` and carry
FULL provenance credit)*; and **§0e-T16-B's measured finding that the alternate ladder is where the
edge lives** *(alternates deliver 72.7% against a 55.0–57.7% break-even; standard lines 56.7%)*.
🔴🔴 **If the ladder does not reach the app's rungs, the system is not pricing the market it has
measured as the profitable one — and the opener is 2026-10-20.** ⚠ **NOT RECORDED which of the two
causes it is; pass 1 is where the diagnosis would be.**

⚠ **AND THE SLATE IS ABOUT TO GROW**: *"**the slate will be BIGGER than what you have now — new
goblins and demons on PrizePicks, all the ladders for all apps, so it will be HEAVY. Find the proper
logic.**"*

### ✅✅ **T16-7's SCOPE QUESTION IS ANSWERED BY THE OWNER DIRECTLY**

> ***"The full pipeline 3 needs to be **BOARD SCOPED — all legs, prop lines, all apps, all ladder
> variations and directions**."***
> ***"I mean **the ladder ON THE BOARD**, yes — **but NOT the full ladder on the baseline if
> unneeded, not on the board.**"***

🔑🔑 **So the intended population is explicit: the FINAL SCORING pipeline is board-scoped across every
app and every variation, and the baseline's rungs beyond the board are *"unneeded"*.** ⚠⚠ **That does
NOT dissolve T16-7** — *T17 measured `final_hp` at **38.7M legs on the FULL ladder** with only ~2.23M
board-matched, and the live table holds **2024-25 complete and 2025-26 at 140,130 rows on ONE date.***
🔑 **If anything it sharpens the item: the stored population is the one the owner calls unneeded, and
the one he asked for — all apps, all variations — is a DIFFERENT and probably larger set than
PrizePicks-only board matches.** 🔴 **OWNER DECISION stands.**

### ⚠ **T18-2 — THE STORAGE DIET'S LARGEST ITEM WAS REVERSED BY THE OWNER, ON BACKTEST GROUNDS** *(0 of the twelve, 0 of the thirty)*

*`storage_diet_plan_2026_09_17`'s top item was **slimming `final_hp` to a join table, 4–6 GB** —
"we're holding 22 GB for information stored twice" (`NBA_DATABASE.md` §0y-T17-B).* 🔑 **The owner
authorised the cleanup** — *"do the cleanup, but **be sure you are not deleting anything that we
use**… we just want to delete redundant information… **for example, we did the confidence and there
were MULTIPLE VERSIONS — so we just keep the completely full LAST version for each one of the
legs**"* — **and then reversed the slimming specifically:**

> ***"Once we're completely done with the final score system, **we're going to start doing a lot of
> BACKTESTS** — we're going to create logics to generate slips, and that's going to be **days of
> backtesting, multiple logics, all the time**. So **maybe it's better we leave as is so we can do our
> backtest FASTER**… **if the slim logic for the index is gonna make it slower and more complex for
> backtesting, it's better we do not do that.**"***

🔑🔑 **A DENORMALISATION DEFENDED ON WORKLOAD GROUNDS — and it is the same argument COMPASS fact 105
records** *("`final_hp` STAYS DENORMALISED — A DELIBERATE DECISION, NOT AN OVERSIGHT")*. ✅ **Fact 105
has an owner behind it, and this is the reasoning.** ⚠ **AND A CONSTRAINT HE ADDS**: *"if you do a
heavy join, **that's going to break the server — the two gigs of RAM it has is not going to be
enough**"* — *the same 2 GB limit `NBA_DATABASE.md` §0u records, cited by the owner as a design
input.* ⚠ **He does not close it outright**: *"**don't withdraw just yet** — probe, try, test,
simulate… and **put it in the compass, because maybe [it can be] done later if you upgrade the
server. But do not just drop it yet.**"*

🔴🔴 **AND ONE LINE IS A CANDIDATE CAUSE FOR T16-7'S LOSS, recorded under rule 6 as a candidate only**:
***"we did the confidence and there were multiple versions, so we just keep the completely full LAST
version for each one of the legs."*** ⚠ **A cleanup that keeps "the last version for each leg" is a
delete-heavy operation over `final_hp` authorised in the same session that T17's certified 19,611,626
legs became 140,130.** 🔴 **NOT RECORDED whether it ran, or on what scope; T18's prose stratum is
where the answer would be, and it is pass 1's highest-value target.**

### ⚠ **T18-3 — THE END-TO-END PARITY TEST THE OWNER SPECIFIES**

> ***"Get one day from the PAST that we already have a baseline calculation and also the final scoring
> calculation, and **run it END TO END and see if it MATCHES the data that we already have — BECAUSE
> IT NEEDS TO.**"***

🔑 **The strongest statement of the parity standard in the corpus: the new pipeline must REPRODUCE the
stored history exactly, not merely produce plausible numbers.** ⚠ **NOT RECORDED whether that test was
run or what it returned** — *and it is the one test that would have caught a `final_hp` loss
immediately.*

---

## 🔴🔴 **T17 PASS 3 — THE CENSUS IS EMPTY AND A LARGE STATE LOSS EXISTS ANYWAY. THAT IS RULE 37's *SILENT* CATEGORY, DEMONSTRATED.** *(§T17.4, the closure pass; mechanism strata 1,119 of 1,412 segments, 79.2%)*

### ✅ **EVERY DISTINCT FAILURE IS RECORDED — T17's prose names its own bugs by their exact error**

*Pinned 2026-09-22: **16 raw `exit code [1-9]` occurrences**; `NameError` 14 · `KeyError` 17 ·
`AttributeError` 13 · `ValueError` 10 · `shutdown signal` 11.*

| Failure | Recorded in the prose? |
|---|---|
| **`NameError: name 'unc' is not defined`** | ✅ *"I removed the scenario-uncertainty calculation when replacing the confidence block, but a later line still writes `n_uncertain` from it"* |
| **`AttributeError: 'Pandas' object has no attribute 'n'`** | ✅ *"`n` collides with pandas' internal namedtuple field, so `itertuples` doesn't expose it"* |
| **`AttributeError: 'Pandas' object has no attribute '_6'`** | ✅ *"I guessed the positional index for the `n` column. **Same class of error as before**"* |
| **`KeyError: 'n'`** | ✅ *"the select never included the column — **my own query** pulls level, prop, band, side, phase, `s_norm`, `lo_scale`, `hi_scale` and **no `n`**"* |
| **`KeyError: 'Column not found: per36'`** | ✅ *"`g2` was bound before `per36` existed"* |
| **`ValueError` — percentiles** | ✅ *"my quartile helper passes 1.01 as an upper bound, which is fine for `pd.cut` bin edges but **invalid for `.quantile`**"* |
| **`HINT: Perhaps you meant to reference the column "rung_market.player"`** | ✅ *"`rung_market` keys on **player name**, not `player_id`. Checking its actual columns **rather than guessing again**"* |
| **`shutdown signal` ×2 — the runner OOM-killed** | ✅ *"it died loading all 6.9M `board_outcomes` rows into memory at once — **an infrastructure limit, not a bug**"*, and later *"same memory kill as before"* |

✅✅ **SO THE CENSUS COMES BACK EMPTY — the second time in the sweep** *(after T15)*, **and T17's prose
is the most self-diagnostic in the corpus: it names the collision, the positional guess, the missing
column in its own `SELECT`, and the invalid quantile bound.**

### 🔴🔴🔴 **AND YET `final_hp` 2025-26 LOST 19.47 MILLION ROWS, AND NOTHING IN T17 ACCOUNTS FOR IT**

| | |
|---|---|
| T17's own completion check | **19,611,626 legs / 163 dates** |
| `[LIVE-AUDIT]` 2026-09-22, re-taken twice across the session | 🔴 **140,130 legs / ONE date** |
| Confidence values present | ✅ **v3** *(proven by the phase-wise arithmetic, §T17.3)* — **so the season was written COMPLETE with the current logic** |
| Recorded failures that could explain it | 🔴 **NONE** |

🔑🔑🔑 **THAT IS THE SILENT CATEGORY MADE CONCRETE.** *Rule 37 names three census outcomes — RECORDED ·
ATTRIBUTED-BUT-UNDIAGNOSED · SILENT — and §T14.3b's bound says **the census cannot see a silent
failure**. **T17 is the proof**: the census is exhaustive and empty, the prose is candid to the line
number, and a **19.47-million-row loss sits in the live system unexplained by either.*** ⚠⚠ **An empty
census is evidence that nothing failed LOUDLY. It is not evidence that nothing failed.**

⚠ **THE ONE MECHANISM T17 SUPPLIES**, recorded under rule 6 as a candidate and not as a cause: the
full-season confidence rewrites *"**DELETE prior rows at the start**, so the table is empty until the
props finish writing"*, **the workflow times out at 60 minutes**, and the transcript ends with
*"the job has been running ~50 minutes and the workflow times out at 60, **so it will be killed shortly
without producing results. I can't fetch its log — the API says the link expired.**"* 🔴 **A
delete-then-write killed at the 60-minute wall leaves exactly the observed shape, and its log is
unreadable — so it would be silent by construction.** ⚠ **NOT RECORDED whether that is what happened;
T18 is the same day and is where it would appear.**

### 🔒 **TWO KILLS LOGGED, AND THE SECOND REFINES RULE 36**

**KILL 1 — the COMPASS numbering.** ✅ Whole-sequence check re-run 1 → 107: **`MISSING = [69]` only**,
unchanged. **No new numbering casualty in the T17 window.**

**KILL 2 — and it is rule 36's TRUE NEGATIVE.** *The T17-window `git log --numstat` audit flagged
`56acdca0` (−66 / +32 on `NBA_FINAL_SCORING_CALIBRATION.md`) as the largest net deletion, and what it
removed was alarming: **`## 18. PART D — THE FOUNDATIONAL SELECTION METHODOLOGY`**, a section
declaring itself **"the ORIGINAL, FOUNDATIONAL rule set — EVERYTHING ELSE in this document is
DOWNSTREAM of it… Read this before any other strategy work."*** 🔒 **KILLED ON INSPECTION: it was a
CONDENSATION, not a deletion.** The same commit adds **`## 18. PART D — SELECTION METHODOLOGY, Rules
B0–B0c`**, preserving the source attribution, the "original, foundational" framing as a quotation,
**Rule B0** *("never rank by the platform's displayed score… **never trust a platform's own
confidence/probability display as a substitute for your own real graded buckets**")* and the artefact
*(`nba_market.board_outcomes`, **6.9M graded legs across 327 dates**)*. ✅ **All present today: `PART D`
16 of the thirty / 14 of the twelve · `Rule B0` 15 / 9 · the platform-score rule 5 / 2.**

🔑🔑 **THE REFINEMENT RULE 36 NEEDS**: ***a deletion-heavy commit is a SIGNAL TO CHECK, never a
finding. Rule 36's probe must be run on CONTENT — "what did the old text say that the new text does
not" — and a `numstat` cannot answer that question.*** ⚠ **Fact 85's overwrite (which DID lose an
audit) and this one (which lost nothing) have the same `numstat` shape.**

---

## ✅✅ **T17 PASS 1 — THREE OPEN ITEMS ANSWERED FROM THE TRANSCRIPT, AND ONE LIVE CONDITIONAL THAT HAS FIRED** *(§T17.2)*

### ✅ **T17-2 IS CLOSED — the 17%-vs-90% tension is answered IN THE TRANSCRIPT, and the two ARE different quantities**

> ***"Let me separate two things that the 17% conflates. **The 17% is JOINT-BRANCH PREDICTION
> ACCURACY.** With 3 independent uncertain players it's **mathematically capped**: if per-player
> accuracy is `p`, joint accuracy is `p³`. **To hit 90% on three players you need 96.5% per player.**
> But **the scenario system doesn't need to PREDICT. Its job is COVERAGE** — the realised branch must
> be among the precomputed set, **which it is by construction, since we enumerate all 2ᵏ**. At 2:30
> the final report resolves most questionables and **we SELECT, not guess.** The 17% measures
> prediction from the earlier report, **which is exactly what the architecture exists to avoid.**"***

✅ **And the owner's target was then MET on the axis where it applies**: *"**where your 90% demand
genuinely applies is PER-PLAYER RESOLUTION**"* — and after the league's own timing rules were encoded
as features *(the early-tip deadline 8–10am vs 11am–1pm, the road Out/Doubtful restriction,
hours-to-tip)*, the **confident band reached 80.0% accuracy**, up from 65.0%. 🔑 ***"80% correct in the
confident band — the accuracy you asked for, ON THE CASES WHERE IT'S ACHIEVABLE."***

⚠ **The sweep's pass-0 entry inferred the two were different quantities and flagged it as an OWNER
DECISION. They are, and the transcript says so — so T17-2 is CLOSED as answered, not escalated.**
🔑 **The lesson for the sweep: an apparent owner/measurement contradiction in an owner stratum may be
resolved later in the same transcript, and pass 0 cannot know that.**

### ✅ **T16-7 IS ANSWERED — `final_hp` WAS 38.7M LEGS, AND ITS EXPECTED POPULATION IS THE FULL LADDER, NOT THE BOARD-SCOPED SET**

*The engine's completion check, verbatim:* **"2024-25 **19,075,070** legs / 30 props · 2025-26
**19,611,626** / 30 · **total 38,686,696**"** — ✅ **which is COMPASS fact 99's "~38.7M".**

🔑🔑 **AND THE AUTHOR ANSWERS THE OWNER'S "BOARD SCOPED" QUESTION DIRECTLY, WHICH IS WHAT PASS 0 COULD
NOT RESOLVE**: *"**Caveat 1 — that's the FULL LADDER, not board-scoped.** The 38.7M covers every rung
at anchor ±10 in both directions. **Only about 2.23 MILLION of those matched a real PrizePicks board
line with a graded outcome.** The rest are rungs the board never offered. **So the system PRICES
everything; the VERIFIED subset is 2.23M.**"*

| | rows |
|---|---|
| priced (full ladder) | **38,686,696** |
| **verified against a graded board line** | **~2,230,000 (5.8%)** |

⚠⚠ **SO THE GAP IS REAL AND IT IS NOT A SCOPING CHOICE.** `[LIVE-AUDIT]` **2026-09-22: 2024-25 holds
19,075,070 — EXACTLY its recorded figure — while 2025-26 holds 140,130 rows on ONE date.** 🔴🔴 **2025-26
was 19,611,626 six days ago and is 0.7% of that today, while the other season is byte-exact.**

🔑🔑 **AND THE TRANSCRIPT NAMES A MECHANISM THAT FITS, which rule 6 permits recording as a candidate**:
the confidence rebuilds run repeatedly across both seasons, and the author describes one as *"it
**DELETES prior v3 rows at the start**, so the table is empty until the props finish writing"* — **a
delete-then-write whose write did not complete leaves exactly this shape.** ⚠ **The transcript ends
with two such rebuilds still in flight and a workflow that times out at 60 minutes.** 🔴 **NOT
RECORDED whether the final pass completed; T18 is where the answer would be. OWNER DECISION stands
until then, and it is season-critical — the opener is 2026-10-20.**

### 🔴🔴 **T16-9 IS ANSWERED — AND THE AUTHOR'S OWN CONDITIONAL HAS FIRED, UNCHECKED**

*The three expression indexes were built to fix a name-join that would not complete. **The author
wrote the check the sweep later ran:***

> ***"`idx_scan: 0` just means the planner hasn't consumed them yet; the query is still executing.
> **That's also the metric worth checking afterward — IF IT STAYS AT ZERO once the query completes,
> the planner isn't using them and the expression doesn't match exactly, WHICH I'D NEED TO FIX.**"***

🔴🔴 **`[LIVE-AUDIT]`, three days later: `board_outcomes_nm_idx` is STILL AT ZERO SCANS**, while its two
siblings on the same batch show **1,080,188** and **594,932**. ⚠⚠ **The conditional has fired and there
is no record of anyone checking it.**

✅ **AND THE TRANSCRIPT ALSO SUPPLIES WHY, in the `EXPLAIN` that finally diagnosed the stall**: *"Postgres
refused any index because the join condition contained `replace(replace(o.market_key,…))` and
`lower(regexp_replace(o.player,…))` — **functions on the join columns**. No index can be probed through
a function call, **so ALL FOUR INDEXES I BUILT WERE IRRELEVANT TO THIS QUERY.**"* 🔑 **The index was
built against the expression; the query that motivated it uses a DIFFERENT expression on the same
column — and only `board_outcomes` carries the double `replace(...)` on `market_key` as well as the
name normalisation.** ⚠ *That is a hypothesis the sweep can state because the transcript states the
mechanism; **which expression the live index actually indexes is NOT RECORDED** and needs a `\d+`-class
read the sweep's `SELECT`-only mandate covers but has not run.*

⚠ **Sizes also reconcile**: built at **343 / 97 / 47 MB** *(487 MB total, as COMPASS fact 104 records)*;
live at **303 / 97 / 47 MB** *(447 MB)* — **`board_outcomes_nm_idx` has shrunk 40 MB**, which closes the
40 MB discrepancy `NBA_DATABASE.md` §0x-T16 flagged as unexplained.

🔑 **AND THE OWNER'S DIET DIRECTIVE HAS A NAMED TARGET FOR IT**: the transcript's own storage plan lists
*"**index audit** — `final_hp` carries **3.7 GB** of indexes and `baseline_history` **3.4 GB**;
**checking `idx_scan` BEFORE THE SEASON STARTS** will show which are actually earning their space."*
✅ **That audit is exactly what this sweep ran, and it found one.**

---

## 🔴 **T17 PASS 0 — THREE ITEMS THE OWNER STRATUM OPENS** *(§T17.1, 2026-09-19)*

| # | Item | State |
|---|---|---|
| **T17-1** 🔴🔴 | **"KV2 NEEDS TO BE THE NEWEST LOGIC. IS IT? IF NOT, IT NEEDS TO BE FIXED."** *(0 of the twelve, 0 of the thirty)* — verbatim: *"the KV1 doesn't really matter, but **the KV2 needs to be the most accurate, the NEWEST LOGIC**. Is it the newest logic? If not, it needs to be fixed."* | ⚠⚠ **A direct owner question with a conditional instruction attached, and the corpus records NEITHER the question NOR the answer.** 🔴 **NOT RECORDED**: what KV1 and KV2 are, which logic each carries, or whether the check was made. 🔑 **Pass 1's job** — *and if the transcript does not answer it, it is an **OWNER DECISION**, since the sweep is read-only and a KV namespace's contents are not a `SELECT`.* |
| **T17-2** 🔴🔴 | **THE 17%-vs-90% TENSION** — the owner calls fact 96's measured ~17% *"definitely TERRIBLE — we need a NINETIES"*, on the same day fact 107 DROPS the mechanism that answers it. | 🔴 **OWNER DECISION** — *the two are almost certainly different quantities* *(branch-selection probability vs assertiveness of the final number)*, **and nothing in the corpus says so**, so the reply reads as a rejection of the measurement. *Full entry: `NBA_SYSTEM_DESIGN.md` §0z-4.* |
| **T17-4** 🔴 | **THE OWNER'S MLB CROSS-REFERENCE INSTRUCTION COULD NOT BE FOLLOWED** *(answered at pass 1, §T17.2)* — he directed the confidence design to *"take a look at the current MLB system and see how the confidence works, **just a reference, because the system is not perfect**"*. 🔴 **The attempt failed on infrastructure**: *"**the MLB D1 bindings are NO LONGER PRESENT on this worker — all TWELVE report FALSE** — so I can't read that system's confidence directly; I'd need the reference from elsewhere."* | ⚠ **An owner instruction that went unexecuted for a reason outside the work, and the corpus records neither the instruction nor the failure.** 🔑 **The confidence design proceeded from RESEARCH instead** *(the nine ML data-quality dimensions, and later the aleatoric/epistemic frame)* — **which is what produced the eleven-factor design, so the substitute was productive.** 🔴 **NOT RECORDED whether the MLB reference was ever obtained, or whether those twelve bindings are meant to still exist.** *A binding census is outside this sweep's `SELECT`-only mandate.* |
| ✅ **T17-5** *(half answered at pass 2, §T17.3)* | 🔑🔑 **CAVEAT 2 IS ANSWERED — v3 *IS* IN PRODUCTION.** `[LIVE-AUDIT]` **`nba_score.confidence_model` exists with 10 rows, `built_at` 2026-09-19T01:25:34Z**, and **the phase-wise confidence offsets in 19,215,200 live rows reproduce `f_phase`'s 9.0625 deduction to four decimal places** *(0.0181 / 0.0109 / 0.0072 against predicted 0.018125 / 0.010875 / 0.00725, at both the maxima and the minima)*. ✅ **So the replication pass ran after the transcript ended, and `final_hp.confidence` holds v3 — NOT the conformal values.** *The live mean, 0.9240, sits inside COMPASS fact 101's predicted 0.92–0.95 and an order of magnitude above the conformal build's reported 0.5566.* 🔴 **CAVEAT 1 STANDS: the DEDUCTIONS were still fitted on 6 of 30 props** *(points, rebounds, assists, blocks, steals, turnovers)*, **and they are now applied to all 30** — *combos, period props, `fantasy_score` and `double_double` were never sampled, and open item **O6b** records that seven of the ten factors measured zero separation on the six that were.* | **Original entry below, kept as the record.** |
| ~~T17-5 (original)~~ 🔴🔴 | **CONFIDENCE IS MEASURED ON 6 OF 30 PROPS AND IS NOT WRITTEN ANYWHERE** *(its author's own caveat, §T17.2)* — *"`build_confidence_v3.py` is a **MEASUREMENT SCRIPT**. The confidence column in `final_hp` still holds **the old conformal values**, not this logic. **Nothing downstream would read what we just built.**"* ⚠ **And the 2.23M-leg measurement covers only points, rebounds, assists, blocks, steals and turnovers — *"the combos, period props, fantasy and double double haven't been sampled at all."*** | 🔑 **`[LIVE-AUDIT]` cannot settle it either way**: the live `confidence` column spans **0.8540–0.9841, mean 0.9240**, and **COMPASS fact 101 predicts 0.92–0.95 for v3** — *so the live values are consistent with v3 having landed after this transcript, and equally consistent with conformal values in the same range.* 🔴 **T18 is where the answer is.** |
| **T17-3** ⚠ | **"FRESHNESS GATES — PROBABLY THE SAME"** | ⚠ **A HEDGE, recorded as a hedge.** *Leg correlation is deferred by a clear decision; freshness gates get "probably". **NOT RECORDED** whether that ever firmed up — and the corpus carries freshness gates as open engine-side work in several places* *(53 of the thirty, 38 of the twelve)*. |

---

## 🔴🔴 **T16 PASS 3 — THE MECHANISM FAILURE CENSUS, AND IT IS *NOT* EMPTY: A THIRD FAILURE CATEGORY** *(§T16.4, the closure pass; the largest mechanism stratum in the corpus — `tool_use` 471 + `tool_result` 388 = 859 of 1,064 segments, 80.7%)*

*Pinned 2026-09-22: **12 raw `exit code [1-9]` occurrences → FIVE distinct causes**; `deadlock` 25 ·
`psycopg.errors` 9 · `404` 17 · `cancelled` 16.*

| # | Failure in the mechanism strata | Recorded in the prose? |
|---|---|---|
| 1 | **`urllib.error.HTTPError: HTTP Error 404: Not Found`** | ✅ **YES** — the overloaded workflow input *("I passed `points` in the `seasons` input, which that step used as a season name")* |
| 2 | **`KeyError: 'Column not found: per36'`** | ✅ **YES** — *"`g2` was bound before `per36` existed, so the groupby can't see the new column"* |
| 3 | **`ValueError: Mismatching dimensions along axis 0: {881, 882}`** | ✅ **YES** — *"my ridge-penalty construction was **off by one row**. Simplifying it"* |
| 4 | **`psycopg.errors.DeadlockDetected` ×2** | ✅ **YES**, both diagnosed in full *(see the operational-defects entry below)* |
| **5** | 🔴🔴 **`IndentationError: unexpected indent` at `nba/build_redistribution_factors.py` line 101**, `exit code 1`, **2026-09-13T17:47:50Z** | 🔴 **NO — `"indent"` appears ZERO times in the 156-segment prose stratum** |

### 🔑🔑 **A THIRD CATEGORY: *ATTRIBUTED-BUT-UNDIAGNOSED* — the symptom is recorded and the cause is not**

⚠ **This is not a silent failure, and that is what makes it new.** *The prose records the SYMPTOM of
exactly that builder failing to apply:*

> **SEG 280**: ***"the values are unchanged and `built_at` is from yesterday — so either THE RUN
> FAILED or THE UPDATE DIDN'T APPLY. Checking:"***
> **SEG 293**: *"the rebuild applied — 2025-26 usage multiplier moved from 1.3696 → 1.5728…"*

🔑 **So the account runs: detection → (gap) → resolution.** **The `IndentationError` — a patch that
produced syntactically invalid Python in the A2 factor builder — is what made the values unchanged,
and it is never named.** ⚠⚠ **STATED PRECISELY**: *the sweep verifies the error, its file, its line,
its timestamp and its exit code, and verifies that the prose never mentions indentation while
recording a not-applied rebuild of **that same builder**. **Whether the `IndentationError` IS that run
is NOT RECORDED** — the sweep states the coincidence of file and symptom, not the identity.*

🔑🔑 **AND IT REFINES §T14.3b's BOUND.** *That bound says **the failure census cannot see a SILENT
failure**. T16 adds a case between "recorded" and "silent":* ***a failure whose SYMPTOM the prose
records and whose CAUSE it does not.*** **Those ARE visible to the census — precisely because the
prose's own account has a gap the mechanism strata fill.** ⚠ **Three transcripts, three census
results: T14 found silent failures; T15's came back empty; T16's found one attributed-but-undiagnosed.**

🔒 **ONE KILL, and rule 22's positive control is what caught it**: **`NameError` returned 4 hits — all
four are inside the assistant's own GREP PATTERNS** *(`"grep": "Traceback|Error|NameError|KeyError|line [0-9]+, in"`)*,
**not actual errors.** ⚠ **A search string matching itself in the log of the search.** *Candidate
killed before publication.*

### 🔴 **THE WHOLE-SEQUENCE NUMBERING CHECK, RE-RUN — AND A SIXTH CASUALTY THAT IS *NOT* A NUMBERING HOLE**

✅ **Re-run 2026-09-22 over the entire COMPASS, 1 → 107, not block-scoped: `MISSING = [69]` ONLY**
*(duplicates 1–5 are the separate list at the file head)*. **So fact 69 remains the only numbering
casualty, and pass 3's specific probe — "did a sixth go unrepaired?" — is answered NO by numbering.**

⚠⚠ **BUT NUMBERING CANNOT SEE AN OVERWRITE THAT PRESERVES THE NUMBER, AND THE GIT AUDIT FOUND ONE.**
**Commit `cd8d06a2` (2026-09-13 10:13 PDT, +5 −7) REPLACED fact 85 entirely.** The old fact 85 was
***"THE SIX REJECTIONS ARE PROVISIONAL, NOT SETTLED"*** and carried a **five-item audit of which
feature each rejection actually used** — including the two sharpest lines: ***"A5 is the one rejection
that stands on MECHANISM rather than measurement"*** and ***"Second flaw across ALL of them: every
test was a MAIN EFFECT ONLY."*** **The new fact 85 is *"THE M1/B4 REJECTIONS WERE WRONG"* with the
defender-ratings result.**

✅ **THE OVERWRITE IS LEGITIMATE — a provisional claim superseded by a settled one once the re-test
landed.** 🔑🔑 **AND IT STILL DESTROYED THE AUDIT, because the settled claim answers the question
while the old one recorded HOW IT WAS ASKED.** ⚠ **Measured on the baseline tree (pre-pass-1):
`"points allowed per possession"` **2 of thirty, 0 of twelve** · `"main effect only"` 3 / 1 ·
**`"stands on mechanism"` 0 of thirty AND 0 of twelve** · `"never fitted"` 1 / 0.**

✅✅ **THE SWEEP HAD ALREADY RECOVERED IT — INDEPENDENTLY, AND WITHOUT KNOWING IT WAS LOST.** *T16 pass
1 wrote the full six-row rejection audit into `NBA_FINAL_SCORING_CALIBRATION.md` §0a-T16 §2 **from the
transcript** (SEG 183), hours before this pass discovered the COMPASS had overwritten it.* 🔑🔑 **That
is the sweep's value stated concretely: not only coverage, but REDUNDANCY — reading the transcript
recovered an audit the live operating document had replaced, and neither the operator nor the sweep
knew at the time.**

🔑 **THE RULE THIS ADDS TO §T15.3a's**: ***a CORRECT supersession can still destroy content. Checking
that the numbering survived proves only that nothing was UNNUMBERED — it says nothing about what the
new text stopped saying.***

---

## 🔴🔴🔴 **T16 PASS 2 — THREE `[LIVE-AUDIT]` OWNER DECISIONS, ALL SEASON-CRITICAL** *(§T16.3, `SELECT` 2026-09-22; the opener is 2026-10-20)*

| # | Finding | Why it needs the owner |
|---|---|---|
| **T16-7** 🔴🔴🔴 | **`nba_score.final_hp` — the table COMPASS fact 66 says the engine READS — covers ONE SEASON PLUS A SINGLE DAY.** **2024-25: 19,075,070 rows / 162 dates.** 🔴 **2025-26: 140,130 rows / ONE date, `2026-01-15`** *(one of the three as-of days open item **O5** already tracks)*. **Total 19,215,200 — 49.7% of fact 99's certified *"both seasons, ~38.7M legs"*.** *Both carry `built_at` 2026-09-19; the 2025-26 rows are the LATER build.* | **Is 2025-26 mid-rebuild, or did it lose its history?** ⚠ **NOT RECORDED** *(rule 6 — no swept transcript covers a change after 2026-09-13; a concurrent session is building in this database and `prop_universe` is mid-rebuild)*. **The sweep cannot tell "in flight" from "lost", and the difference decides whether anything must happen before the opener.** |
| **T16-8** 🔴🔴 | **`final_hp.score` returns values down to −52.488, and 6,924,101 of 19,215,200 rows — 36.0% — are NEGATIVE**, across 20 of 30 props and both sides. **COMPASS fact 103 states the contract as *"SCORE IS 0–100"*.** *Negatives are confined to `final_hp` below ~0.6 (deciles 1–6); deciles 7–10 contain zero. Decile 1 spans −52.49 to +46.00 — a ~98-point swing at essentially constant probability.* ⚠ *They cannot come from the confidence pull-down: live confidence runs **0.8540–0.9841**, so virtually every leg sits above fact 103's **0.85 neutral pivot** and the "pulled down up to 35%" branch is nearly unexercised.* | **Either the contract's wording is wrong or the formula is.** 🔑 **A slip engine that RANKS on `score` behaves very differently under the two readings** — and `edge` already exists as the separate "distance above break-even" column, so a below-break-even penalty inside `score` would duplicate it. *Full detail in `NBA_FINAL_SCORING_CALIBRATION.md` §0a-T16-C §4.* |
| **T16-9** 🔴 | **`board_outcomes_nm_idx` — 303 MB, `idx_scan` = 0** across the whole window these statistics cover *(`pg_stat_database.stats_reset` is NULL; a restart-driven counter reset cannot be ruled out)*. ⚠ **Its three siblings, built in the same batch on the same normalised-name join, show 23.4M / 1.08M / 595k scans over that same window**, so the zero is not a short-window artifact. | **Drop it, or find the query it was built for.** 🔑 **COMPASS fact 104 supplies the likely answer**: *"a FUNCTION ON A JOIN COLUMN means no index can ever be used — which is why all four indexes built that day were irrelevant to it."* ⚠ **303 MB against a storage budget §0v of `NBA_DATABASE.md` records as already consumed several times over, plus a write cost on every insert.** |

⚠⚠ **AND A PATTERN ACROSS T16-7 AND `NBA_DATABASE.md` §0w**: ***a certification records that a table
was complete at a MOMENT. Nine days later one certified figure had drifted by 795 rows and another had
fallen by half.*** 🔑 **The sweep's standing practice — re-take, never quote — is what surfaced both;
neither would have been visible from the documents alone.**

---

## 🔴🔴🔴 **T16 CONFIRMS §T15.3a FROM THE INSIDE — THE OPERATOR FOUND THIS EXACT FAILURE MODE, NAMED THE RULE, REPAIRED FIVE OTHER CASUALTIES, AND STILL MISSED FACT 69** *(T16 pass 1, §T16.2, from the 2026-09-13 transcript)*

⚠⚠ **Read this immediately before the fact-69 entry below.** *§T15.3a inferred the mechanism from a
git diff. **T16's prose states it outright, one day later, in the operator's own words** — and the
reason fact 69 survived every repair is the sharper lesson.*

> 🔑🔑🔑 ***"I OVERWROTE A CANONICAL FACT while inserting new ones, and only caught it because I
> CHECKED THE NUMBERING AFTERWARD. The lesson applies to the documentation itself: **PATCH-BY-ANCHOR
> ON A NUMBERED LIST WILL SILENTLY CONSUME THE ANCHOR LINE**, so the sequence needs verifying after
> every insert."***

### 🔴 FIVE SEPARATE REPAIR EPISODES IN ONE SESSION — **the damage was serial, not a one-off**

| # | What was found | What it cost |
|---|---|---|
| 1 | *"My insert split **fact 81** again and left the facts out of order — 80, 82, 83, **orphaned 81 body**, then 79"* | ordering + an orphan |
| 2 | 🔴🔴 *"My earlier patch **DELETED FACT 77 (the sanity gate)** when I replaced it"* → *"**confirmed — fact 77 is GONE ENTIRELY**. Restoring it"* | **a canonical fact destroyed and restored** |
| 3 | *"Line 148 is an **orphaned fragment from the old fact 85** — my patch replaced the heading but left the body"* | an orphan |
| 4 | *"**Duplicate 86s**, an **orphaned fact-90 body** on line 157, an **orphaned fact-87 body** on line 158, and a **missing 90 heading**"* | four defects at once |
| 5 | *"Facts 87 through 94 in order, orphan removed"* | a fifth pass |

🔴🔴🔴 **AND FACT 69 WAS NEVER AMONG THEM — HERE IS WHY, AND IT IS THE PART THAT GENERALISES.** **Every
one of those checks was scoped to the BLOCK BEING EDITED** — *"facts **74 through 83**"*, *"facts
**84–92**"*, *"facts **87 through 94**"*. ⚠⚠ ***A NUMBERING CHECK SCOPED TO THE BLOCK YOU JUST EDITED
CANNOT SEE A HOLE MADE IN AN EARLIER BLOCK.*** 🔑 **Fact 69 was deleted on 2026-09-12 and the checks
began on 2026-09-13 at fact 74 — the hole was already behind the window before anyone started
looking.** ✅ **The remedy is one line and it is the sweep's own recount**: *verify the WHOLE sequence,
1 → n, not the edited block* — which is exactly how §T15.3a found it (**111 numbered lines = 107
distinct − 1 missing + 5 duplicates**).

🔑 **So the corroboration is complete and independent**: the sweep inferred the mechanism from a diff;
the operator states it from experience; **and the one casualty neither caught is the one that sits
outside a block-scoped check.** ⚠ **Fact 77 was found and restored. Fact 69 was not, and is still
missing today.**

---

## 🔴🔴 **T16 OPERATIONAL DEFECTS — TWO SELF-INFLICTED POSTGRES DEADLOCKS, AND A SUPERVISION RULE WORTH MORE THAN EITHER FIX** *(T16 pass 1, §T16.2)*

*Recorded because the rebuild they interrupted is the **first non-negotiable factor** going into
production, and because the supervision failure is general.*

| # | Failure | Cause, in the operator's words |
|---|---|---|
| **1** | **`psycopg.errors.DeadlockDetected` on `DELETE FROM nba_score.baseline_history`** — **four of six rebuild jobs died at ~00:00** | *"Each loader does **delete-then-insert inside a transaction**; with four jobs writing to the same table at once, **two took row locks in opposite order** and Postgres killed them. **Running them in parallel CAUSED this.**"* |
| **2** | **The FIX caused a second deadlock, and this pair died within SECONDS** | *"I put the advisory lock **AFTER the `CREATE TABLE` / `CREATE INDEX IF NOT EXISTS` statements — and those already take TABLE LOCKS**. So one process held table locks waiting for the advisory lock while the other held the advisory lock waiting for the table locks. **I INVERTED THE LOCK ORDER and created a new deadlock.**"* |

✅ **THE CORRECT FIX**: **the advisory lock must be the FIRST statement in the transaction, before any
DDL**, so every loader acquires the same lock in the same order *(commit `d1b6979`)*. 🔑 **The
expensive BUILD stays fully parallel; only the LOADER serialises, for a few seconds.**

### 🔴🔴 THE SUPERVISION RULE — **the failure that cost an hour was not the deadlock**

> ***"Straight answer on why it was slow: **IT WASN'T SLOW, IT WAS DEAD.** Four of six jobs failed at
> ~00:00 and I gave you a time estimate without going back to verify they were still running… I
> reported progress by querying **ROW COUNTS — a number that looks the same whether jobs are RUNNING
> or DEAD**. … **Checking `github_list_workflow_runs` takes ONE CALL and I skipped it.** That's not a
> tooling limit."***

🔑🔑 **THE STANDING RULE THAT CAME OUT OF IT: VERIFY RUN STATUS *AND* ROW COUNT TOGETHER — never row
count alone.** ⚠ **And the completion rule alongside it**: *"I'll report complete only when **all 60
carry a post-22:00 timestamp**, **not when the jobs report green**."* 🔑 *Two different distrusts —
of a stalled counter and of a green check — and the session needed both.*

### ⚠ THREE MORE OPERATIONAL FINDINGS FROM THE SAME STRETCH, RECORDED WITHOUT INTERPRETATION

| | |
|---|---|
| **PARALLELISM WAS BEING WASTED** | *"The workflow **already loops semicolon-separated pairs** with a 350-minute timeout. **I've been UNDER-USING it by passing one pair at a time.**"* — and *"**the repo is PUBLIC so Actions gives 20 concurrent jobs** — I'd been serialising unnecessarily."* ⚠ *Per-season **concurrency groups** then allowed both seasons to rebuild at once.* 🔑 **The same public-repo fact that is a credential exposure risk (O8) is also the reason 20 jobs can run at once.** |
| **A WORKFLOW WITH OVERLOADED INPUTS 404'd** | *"The absence-panel step ran first and **404'd — I passed `points` in the `seasons` input**, which that step used as a season name. **The workflow has accumulated too many toggles SHARING INPUTS**; that's my doing."* |
| **A GROUPING ERROR MASQUERADED AS A RUNNING JOB** | *"My earlier query returned nothing **because of a grouping error on my side, not because the job was still running**"* — **the inverse of the row-count failure above: a query bug read as job state, twice in one session, in opposite directions.** |
| **THE STALE-GROUPBY BUG, THIRD INSTANCE** | *"Same bug class as earlier: **`g2` was bound before `per36` existed, so the groupby can't see the new column**"* — after `dreb36` in the 09-12 session. ⚠ **A pandas groupby captured before a column is added is a recurring defect in this codebase, and it fails LOUDLY (`KeyError`), which is why it costs minutes rather than conclusions.** |

---

## 🔴 **T16 OPEN ITEMS — what the 2026-09-13 session leaves named and scoped**

| # | Item | State |
|---|---|---|
| **T16-1** 🔴🔴 | **THE VERIFICATION HARNESS THE SESSION CONCLUDED IT SHOULD HAVE BUILT FIRST** | *"The real question isn't 'which factor wins.' It's: **on any day of the past two seasons, how sharp is the final HP, at every granularity?** That's a verification harness, and **it's what I should have built BEFORE any factor work.**"* Specified as **one report over any date range, measuring final HP against outcomes, broken out by `prop × band × direction × rung × role tier × phase`, flagging every cell that misses tolerance.** ⚠ **Whether it was built is NOT RECORDED in this transcript.** 🔑 **It is the owner's acceptance criterion turned into an instrument** *(`NBA_SYSTEM_DESIGN.md` §0z §1)*. |
| **T16-2** 🔴🔴 | **18 OF 30 PROPS HAVE NO TIER ROWS AND CANNOT USE THE CALIBRATION PATH** | `board_tiers` covers **only 12 markets** — PrizePicks offers goblin/demon tiers on those alone. **`fga`, `ftm`, `dreb`, `fantasy_score`, `double_double` and the seven period props have no tier rows at all.** 🔑 **They need a SECOND path, keyed on the standard board line** *(cells `prop × phase × band × direction`, no tier dimension)*. ⚠ *And `steals`, `blocks`, `turnovers`, `stocks` have tiers (3.9k–8.1k rows) but **fell under the 1,500-leg test minimum after the joins — thin, not broken.*** |
| **T16-3** 🔴 | **THE FITTED USAGE ALLOCATION WAS REBUILT FOR 2025-26 ONLY** | *"2024-25 still holds the old values, so it needs the same rebuild to keep the seasons comparable."* ⚠ **An inter-season inconsistency on an input that was measured NEGATIVELY CORRELATED with reality in its old form** *(`NBA_FINAL_SCORING_CALIBRATION.md` §0a-T16 §3)*. **NOT RECORDED whether it was done.** |
| **T16-4** ⚠ | **`team_game_no` COUNTS A PLAYER'S OWN APPEARANCES, NOT TEAM GAMES** | *"A player who missed time is classified as 'earlier' than his team actually is. **That's arguably the right signal for his prediction — but it's not what the label says**, and I'd want it defined deliberately rather than by accident."* 🔑 **Flagged by its own author as a definition that happened rather than was chosen.** |
| **T16-5** 🔴 | **TWO OF THREE NON-NEGOTIABLES REMAIN** | ✅ **Blowout: COMPLETE** *(`NBA_RECIPE.md` STEP 0-T16)*. 🔴 **Scenario precompute for the last-minute injury report: *"the architecture is SPECIFIED — per game, joint availability of both teams, ≤64 branches, precompute in phase 2, select at 2:30 — BUT NOT BUILT."*** ⚠⚠ **And COMPASS fact 107 (2026-09-19) records the scenario precompute as DROPPED by owner decision — so this item may be closed by a later reversal rather than by a build** *(both dates on file; see `NBA_SYSTEM_DESIGN.md` §0z §3)*. 🔑 **Team matchup: STARTED, and the first measurement is decisive** *(below)*. |
| **T16-6** 🔑 | **TEAM MATCHUP — the market total beats the derived profile nearly 2:1, and the build is NOT yet done** | **Implied team score vs actual team points: derived season-to-date mean **r = 0.2364**; market-implied (`total/2 − spread/2`) **r = 0.4637**, MAE 9.08.** ✅ **And the player-level effect is real, monotone and directional — 41,497 player-games, by the OPPONENT's implied total**: strong defence (0–108) 5,775 legs → **1.0140**; 108–113 11,142 → **1.0325**; weak defence (113–117) 10,681 → **1.0358** — **a 2.2-point production swing.** ⚠ **The OWN-team bucket shows a U-shape (1.0607 low · 1.0286 middle · 1.0543 high) — *"the blowout effect bleeding in: extreme implied totals mean lopsided games"*** — **so the own-team and opponent channels are not symmetric and must not be modelled as one.** 🔑 **The stated next build: market-implied team and opponent totals replace the derived profile inputs, exactly as the market spread replaced the derived spread.** |

---

## 🔴🔴🔴 **`[LIVE-AUDIT]` COMPASS FACT 69 WAS SILENTLY DESTROYED BY A `github_patch_file` CALL AND IS STILL MISSING TODAY** *(T15 pass 2, §T15.3a, 2026-09-22)*

⚠⚠ **This is an OPEN defect in the live operating document, not a historical one.** *The COMPASS is the
file every session is told to read first. **It has no fact 69, and nothing in it says so.***

### ✅ VERIFIED FOUR WAYS — the recount, the git history, the diff, and the surviving content

| | Evidence | Pinned |
|---|---|---|
| **1** | **The numbering jumps 68 → 70.** `grep -nE "(^|[^0-9])69\."` over `nba/NBA_COMPASS.md` returns **ZERO hits** — the number does not appear in any form. | 2026-09-22 09:28 UTC |
| **2** | **The recount that found it**: `grep -cE "^[0-9]+\. "` = **111 numbered lines**, highest fact **107**. **111 = 107 distinct − 1 missing (69) + 5 duplicates (1–5, a separate list at the head of the file).** *The arithmetic closes, which is what makes the gap a single missing fact rather than a formatting artifact.* | 2026-09-22 09:28 UTC |
| **3** | **Git history**: fact 69 is PRESENT in `af540a9` and `07a3039` (**2026-09-11 22:15 PDT = 2026-09-12 05:15 UTC**) and **ABSENT in the very next COMPASS commit, `8e910da` (2026-09-12 16:52 PDT)**. 🔑 **T15's own prose names that exact moment**: *"compass was last updated at **05:15 utc today — facts 66-69**."* | `git log -- nba/NBA_COMPASS.md` |
| **4** | **The mechanism, read off the diff**: `8e910da` is **8 insertions, 1 deletion** — a `github_patch_file` find-and-replace whose **`old_str` was fact 69's line** and whose **`new_str` was facts 70–77, WITHOUT carrying fact 69's text forward.** ✅ **`facts 66/67/68 before=1 after=1; fact 69 before=1 after=0; fact 70 before=0 after=1.`** | `git show 8e910da -- nba/NBA_COMPASS.md` |

🔑🔑 **THE SAME FAILURE MODE STRUCK TWICE IN THE SAME SESSION, AND ONLY ONE WAS CAUGHT.** *T15's prose
records the sibling:* ***"my insert split fact 79 — its heading is gone and the body now dangles after
81. repairing."*** ✅ **That one was repaired in-session.** 🔴 **Fact 69's loss was never noticed —
because the corrupted fact 79 was VISIBLE as a dangling body, while fact 69's line was cleanly
replaced and left no trace to see.** ⚠⚠ **A destroyed record that leaves the document well-formed is
invisible to the author and invisible to every reader after.**

### ✅ WHAT FACT 69 CARRIED — and how much of it survives elsewhere *(rule 7: every distinctive term probed, `.{0,80}` both sides, both trees, 2026-09-22)*

> *Fact 69, verbatim from `af540a9`:* **"REFERENCE TABLES (2026-09-12): `nba_market.game_lines_snapshots`
> (h2h/spread/total at morning 08:00 PT + window 14:45 PT / first tip − 2h, 10 books, both seasons —
> ParlayAPI holds closing only); `nba_market.event_game_map` (Odds API event → NBA game id, 96%; built
> from game-log MATCHUP; `nba_teams_current.json` is EMPTY → static 30-team map); two-way status
> derived from injury-report reason "G League - Two-Way" (config `two_way_designation_source`). Infra:
> repo is PUBLIC (Actions free, 20 concurrent jobs), Postgres now 1 vCPU / 2 GB / 47 conn, MLB
> `backtest` schema dropped (7 GB). Live board archiving is NOT done."**

| Term | thirty | twelve | |
|---|---|---|---|
| `game_lines_snapshots` | 57 | 39 | ✅ recovered independently |
| `event_game_map` | 46 | 30 | ✅ recovered |
| `14:45` window snapshot | 16 | 11 | ✅ recovered |
| `nba_teams_current` | 24 | 19 | ✅ recovered |
| MLB `backtest` schema / 7 GB | 13 | 9 | ✅ recovered |
| "10 books" | 2 | 1 | ✅ recovered |
| `47 conn` | 1 | **0** | ⚠ thirty only |
| **`two_way_designation_source`** | **0** | **0** | 🔴🔴 **LOST EVERYWHERE** |

✅ **So the sweep re-derived almost all of fact 69's content from the transcripts and live audits —
which is the strongest available argument that this kind of loss is survivable.** 🔴🔴 **One item is
not: `two_way_designation_source` appears in ZERO of the thirty, ZERO of the twelve, and has NO code
reference anywhere in the repo** *(`grep -rn` over the whole tree, 2026-09-22: zero hits)*. **COMPASS
fact 69 was the only place it was ever written down.**

### 🔴🔴 AND THE KEY IS LIVE, LOAD-BEARING, AND NOW UNDOCUMENTED

`[LIVE-AUDIT]` **`SELECT` against `nba_config.classification_config`, 2026-09-22** *(positive control:
`board_sources_decision` returns 1 on the same query — so the probe is sound; **66 config keys total**)*:

| | |
|---|---|
| `config_key` | **`two_way_designation_source`** — **1 row, live** |
| `updated_at` | **2026-09-12T02:38:24Z** *(decided the same day fact 69 was destroyed)* |
| `notes` | *"Two-way contract status derived from the injury reports rather than mined."* |
| `rule` | **A8 `rookie_two_way_limits`**: `two_way(player, date) = EXISTS report row with reason ILIKE %two%way% and snapshot_ts <= cutoff(date) in a trailing window (e.g. 30 days)`; **rookie = `FROM_YEAR == season start year` from `nba_all_players.json`** |
| `stage` | **`phase1_baseline`** *(known before the window)* |
| `evidence` | **Dec 2025 shard alone: 23,163 rows, 76 distinct players across 29 teams** |

🔑🔑 **WHY IT MATTERS RIGHT NOW**: **N1 ships with `two-way 0.271` — the LOWEST questionable-resolution
rate of any reason class**, roughly half the rotation average *(§0a-T15 §4 in
`NBA_FINAL_SCORING_CALIBRATION.md`)*. **That number is produced by this derivation, and the
derivation's only written record was deleted.**

### ⚠ A SECOND-ORDER DEFECT THE LIVE CONFIG ITSELF WARNS ABOUT — **the documented literal does not match the parsed one**

*The live config's `source` field says, in its own words:* **"the league lists two-way players with
reason text `"G League - Two-Way"` — PARSER RENDERS IT `"G League - Two- Way"`"** *(a space inside
"Two- Way")*, *plus variants `"… Two- Way Injury/Illness - …"` and `"… Two- Way Return to Competition …"`.*

⚠ **Both written records use the UNSPACED form**: destroyed COMPASS fact 69 (*"G League - Two-Way"*)
and **`nba/scrape_nba_injury_report.py:9`** (*"G League - Two-Way"*). ✅ **The derivation itself is
SAFE — the config matches with `ILIKE %two%way%`, a wildcard that catches both forms.** 🔴 **But a
reader copying the documented literal into a new query matches NOTHING**, and there is now no
document that carries the warning. *Recorded as a trap, not as a live failure — nothing is currently
broken by it.*

### ⚠ THE PROBE THAT ALMOST BECAME A FALSE POSITIVE — **rule 22's positive control doing its job**

*`nba_score.availability_delta` returned **0 two-way rows** on `reason ILIKE '%two%way%'`. **That is
not an absence.*** The positive control — `GROUP BY reason` — shows the column holds only
**`reallocated` (3,446)** and **`now_out` (828)**: **it is a DELTA TYPE, not an injury-report reason.**
🔒 **Candidate killed before publication.** ⚠ **But one real `[LIVE-AUDIT]` fact fell out of it**:
**`nba_score.availability_delta` holds 4,274 rows for EXACTLY ONE date, `2025-11-29`** *(`min` = `max`
= 2025-11-29)*. **The twelve carry the row count `4,274` in seventeen places and NONE of them carry
the one-date scope** — *so a reader sees a populated table where there is a single-day artifact, on
the same date O5 records as the per-prop-depth baseline day.*

### 🔴 THE REMEDY — **OWNER DECISION**, because every option is a write

| | Option |
|---|---|
| **(a)** | **Restore fact 69** to `nba/NBA_COMPASS.md` from `af540a9`, at its own number, updating *"Live board archiving is NOT done"* — **which fact 75 now supersedes** *(the archiver exists; see `NBA_SYSTEM_ARCHITECTURE.md` §0f-4)*. |
| **(b)** | **Record `two_way_designation_source` in the twelve only**, and leave the COMPASS numbering gap as a scar with a one-line note. *This sweep has done the second half of (b) here; the COMPASS itself is not written to.* |
| **(c)** | **Audit the COMPASS for OTHER silent overwrites the same way** — *this sweep found fact 69 by recounting the numbering; the same recount is cheap and has never been run before.* ✅ **Already run once here: 1–107 with only 69 missing, so fact 69 is the ONLY numbering casualty. Nothing rules out an overwrite that preserved the numbering.** |

⚠ **This sweep does not write to `nba/NBA_COMPASS.md`** — it is the live operating document and the
concurrent build chat writes to it. **The finding is recorded here with the commit SHAs so the repair
is a two-minute job for whoever takes it.** 🔑 **And the method lesson is general**: ***a
find-and-replace whose `old_str` is a neighbouring record's line destroys that record and leaves the
file well-formed. The sweep's own rule — "use a SHORT SINGLE-LINE ANCHOR, grepped for first" — is
what prevents it, and this is the first evidence in the corpus of what it prevents.***

---

## 🔴 **T15 PASS 1 — OPEN ITEMS THE TRANSCRIPT LEAVES NAMED AND SCOPED** *(§T15.2, written 2026-09-22 from the 2026-09-12/13 transcript; **transcript-sourced, NOT re-taken live** — tagged so a reader does not mistake them for `[LIVE-AUDIT]` state)*

| # | Item | State as T15 leaves it |
|---|---|---|
| **T15-1** 🔴 | **OREB per-cell dispersion** — *"the negative-binomial dispersion for oreb is fitted **globally**, and for a stat where a player's outcome is 0, 0, 0, 4, a single global shape can't serve both the bench and the crashers"* | **The one thing between oreb and certification.** The MEAN defect is fixed and measured *(worst-band bias 0.241 → 0.045, 81%)*; the residual is **alternating-sign noise in thin bands**. ⚠ *"At a 0.1 pp cost it isn't urgent, and it's **scoped and documented rather than forgotten**."* |
| **T15-2** 🔴🔴 | **`fantasy_score` carries a −0.3 pp penalty and is the HIGHEST-VOLUME prop on the board** *(994,879 rows)* | **It had NO reliability verdict at all until this session**, and it carries **the lowest lift of any prop, 5.2%**, against a 2.92 pp worst band. ⚠ **Commercially the most exposed number in the table** — *"a weighted sum of six noisy counts, so the errors compound while the predictable role signal gets diluted."* |
| **T15-3** 🔴 | **`double_double` — worst calibration in the system, 7.32 pp**, penalised −0.4 pp on **47,912 rows** | *"far thinner than anything else — a yes/no market graded on a 0.5 line, **structurally different from every other prop**."* ⚠ *No fix is proposed in T15; the penalty is the whole treatment.* |
| **T15-4** ⚠ | **`dunks` remains EXCLUDED pending play-by-play** | Baseline coverage as T15 leaves it: **29 of PrizePicks' ~31 stat types** *(28 certified + oreb penalised)*, **only `dunks` out**. ⚠ **NOT re-taken live** — the live count may differ. |
| **T15-5** ⚠ | **Two of five board sources still do not archive** | Underdog **5,281**, Fliff **1,394**, Sleeper **1,276** land; **PrizePicks and Betr do not appear in the archiver's output** in this transcript. *See `NBA_SYSTEM_ARCHITECTURE.md` §0f-4; §0f-1 already records the Betr pull as not running and §0f-3 the primary PrizePicks board as having no output file.* |
| **T15-6** ⚠ | **The live archiver's `event_id` is SYNTHESISED** — *"`event_id` is not null and live boards have no odds-api event id"* | A **joinability constraint downstream**: archived live rows cannot join to Odds-API events on that key. *Recorded, not diagnosed — T15 does not say what the synthesis rule is.* |
| **T15-7** 🔑 | **`k_stab` for oreb was 60 — the heaviest prior of any prop — against a swept optimum of ≈4** | ⚠ **The sweep was MONOTONE in k across 3/5/8/12/20 with MAE best at the same setting**, so the old value was not a local choice. 🔑 **OPEN QUESTION T15 does not ask: are the OTHER props' `k_stab` values audited the same way?** *Only oreb's was swept.* |

🔑🔑 **AND ONE PROCESS ITEM WORTH MORE THAN THE FIXES** *(the transcript's own judgment)*: the
**reliability scorer** measures every prop on one ruler — **ECE, worst band, Brier, lift over a
base-rate model, both seasons** — *"so penalties are **DERIVED rather than declared**, and any future
prop lands on the same scale automatically."* ✅ **It caught two props that would have shipped as
certified, and it caught the assistant's own over-correction on oreb within minutes.** ⚠ **Paired
with the CALIBRATION CHECKER**, which closed a different hole: *"until now, a prop's verdict existed
only in an ephemeral run output"* — the checker re-verifies any prop **from stored data**, without
depending on a harness log that scrolls away. *Validated against `points` — worst band 0.8 pp on
more, 0.9 pp on less, reproducing the certification standard independently.*

> ## 🔴🔴 READ FIRST — **EVERY DEADLINE IN THIS DOCUMENT KEYED TO `2026-10-03` IS 17 DAYS EARLY**
> *Standing correction, added 2026-09-21 (§T10.18b). It applies to the whole document and is not
> repeated at each site.*
>
> **The regular season opens 2026-10-20.** `[LIVE-AUDIT]`, verified in `nba_calendar.games`: prefix
> **001 (preseason) 66 games, 2026-10-03 → 2026-10-16**; prefix **002 (regular) 1,200 games,
> 2026-10-20 → 2027-04-11.** **`2026-10-03` is opening night of the PRESEASON.**
>
> 🔴 **This document still asserts `2026-10-03` in its own prose in FIFTEEN places** — including
> *"the season opens 2026-10-03, twelve days from this"* and the **SEASON-START CRITICAL** section
> heading (since corrected). **Read every one of them as 2026-10-20**, and **do not read an item's
> urgency from its stated date.** *Where a date is inside a verbatim quote from a transcript or a
> file header, it is left as written — the quote is accurate; the belief it records was wrong.*
>
> ⚠ **Why it was not rewritten line by line**: the correction was published in this sweep's headline
> findings and **not propagated into the prose of the documents that carry the deadlines** — the
> sweep's own propagation defect, found at pass 18 and recorded in §T10.18b rather than silently
> patched away. **57 of 78 `2026-10-03` mentions across the twelve carry no correction near them;
> 36 are assertive prose rather than quotation.**

> ## 🔴🔴 READ SECOND — **"ALL 190 `.py`/`.js` FILES IN `nba/`" IS A POPULATION THAT CANNOT BE REPRODUCED**
> *Standing correction, added 2026-09-21 (§T11.57b, T11 pass 56). It applies wherever the figure
> appears and is not repeated at each site.*
>
> **The phrase *"a grep of all 190 `.py`/`.js` files in `nba/` (plus the MCP admin bridge)"* is the
> single most widely reused population figure in this corpus: it appears in TEN of the twelve** —
> `NBA_BASELINE_CALIBRATION.md` · `NBA_DATABASE.md` · `NBA_FINAL_SCORING_CALIBRATION.md` ·
> `NBA_GLOSSARY.md` · `NBA_GOBLIN_DEMON.md` · `NBA_MASTER_SUMMARY.md` · `NBA_OPEN_ITEMS.md` ·
> `NBA_RECIPE.md` · `NBA_SYSTEM_ARCHITECTURE.md` · `NBA_WORKERS.md` — **and at least eight VERIFIED
> findings rest on it**: the unread config tables · `teams.arena_id` written by no code ·
> `credential_value_encrypted` having no encrypt/decrypt step · `classification_config` ·
> `system_settings` · `ladder_calibration` · the `NOT IN` bug class absent · the 24
> `DELETE`/`TRUNCATE` statements.
>
> 🔴 **`nba/` holds 157 such files** *(`[LIVE-AUDIT]` 2026-09-21: **136 `.py` + 21 `.js`**, recursive,
> and `nba/data/` contains no code, so including or excluding it changes nothing)*. **Not 190.**
> 🔴 **And the scope the documents state — *"including `backtest/` and `workflows/`"* — names a
> directory that does not exist under `nba/`**: its subdirectories are `sql`, `backtest`,
> `transcripts`, `baseline`, `data`, `tools`, `__pycache__`. **The workflows live in
> `.github/workflows/` — 40 `.yml` today — OUTSIDE `nba/`.**
>
> ⚠ **What this does NOT say.** **157 + 33 = 190**, so the figure is arithmetically consistent with
> *`nba/` code plus the workflow files at a time when there were 33 of them* — **but that is a
> reconstruction, not a verification. HOW the 190 was counted is NOT RECORDED** (rule 6), and no
> document states it.
>
> ✅ **The findings themselves survive, and one was re-tested rather than assumed.** **Pass 56
> re-ran the largest of them — the unread config tables — by the ARTIFACT (rule 29), on the
> SCHEMA-QUALIFIED name, across every non-markdown file in the WHOLE repository (314 `.py`/`.js`:
> `nba/` 157 + repo root 151 + 6 elsewhere), control `nba_market.board_snapshots` firing in 21.**
> ***Result: of the ELEVEN in-scope `nba_config` tables — 14 base tables less the 3 `pp_*` the
> concurrent session owns — TEN have ZERO references, and only `nba_config.external_credentials`
> has any (3: `alphadog-v2-admin-sql.js`, `nba/backfill_board_snapshots.py`,
> `nba/backfill_game_line_snapshots.py`).*** **Which is exactly what `NBA_GLOSSARY.md` already
> says** — *so the verdict is confirmed over a population nearly twice the size of the one it
> claimed, and only the population figure is wrong.*
>
> 📌 **Two membership notes, both inside the twelve.** **`NBA_GLOSSARY.md` NAMES seven unread config
> tables; the paragraph below asserts EIGHT; the measured set is TEN** *(the seven, plus
> `variation_bands`, `worker_definitions` and `calibration_log`)*. **The prose of both is right and
> neither enumeration is** — §0z's class exactly: *the class is stated, the membership is not.*
> ⚠ **And the name test is not the artifact test**: **`system_settings` matches ELEVEN non-markdown
> files by BARE name and ZERO when schema-qualified — all eleven are MLB-side**, the
> same-name-different-sport trap of §T11.55c, second instance. **This is why rule 29 says
> schema-qualified.**
>
> ⚠⚠ **STATED AT ITS REAL STRENGTH**: all of the above measures the **REPOSITORY**, not what runs.
> A deployed worker whose source is not in this repo, or a query using an unqualified name under a
> `search_path`, would not appear. ***"Read by no code" is stronger than this evidence supports;
> "no schema-qualified reference in the repository on 2026-09-21" is what was measured.*** **A
> dated STATE, not a verdict** *(O9)*.
>
> ### 🔴 SECOND INSTANCE — **"ACROSS ALL 85 TABLES" MATCHES NEITHER POPULATION** *(§T11.58b, pass 57)*
> **The type-discipline finding in this document and in `NBA_MASTER_SUMMARY.md` is stated *"across
> all 85 tables."*** `[LIVE-AUDIT]` **2026-09-21: `nba*` holds 104 base tables, and 54 of them carry
> any of the five ID columns the sentence enumerates. 85 is neither**, and the sentence gives no
> date and no derivation. *(104 − 85 = 19 is consistent with tables added since the measurement,
> including the concurrent session's `pp_*` — **a reconstruction, not a verification**.)*
>
> ✅ **AND THE FINDING ITSELF RE-VERIFIES PERFECTLY, ON A LARGER SET** — *every column, no
> exceptions*:
>
> | column | stated | re-taken 2026-09-21 | type |
> |---|---|---|---|
> | `player_id` | 28 | **34** | ✅ all `text` |
> | `team_id` | 20 | **21** | ✅ all `text` |
> | `game_id` | 20 | **21** | ✅ all `text` |
> | `nba_player_id` | 10 | **11** | ✅ all `bigint` |
> | `nba_team_id` | 6 | **6** | ✅ all `bigint` |
>
> 🔑 ***So in BOTH of rule 30's instances the population is wrong and the finding is right*** — **the
> sweep's counts of the SYSTEM are sound; its counts of its own SEARCH SPACE are not.**
>
> ✅ **Counter-examples, re-taken and EXACT** *(so this is an audit, not a complaint)*: **the 24
> `DELETE`/`TRUNCATE` statements** — *23 `DELETE FROM` + 1 `TRUNCATE`; the six lowercase matches are
> comment prose, opened and dismissed* — **`nba_ref.players` 582** · **`nba_team_id` 6** · **and the
> thirty / thirty-two document pair, which is two correct counts of two different populations
> (32 `.md`, less the run log and the out-of-scope PP document)**.

## 🔴🔴 **OWNER DECISION O11** — **T13 IS THE LARGEST CREDENTIAL EXPOSURE IN THE CORPUS**
*Recorded 2026-09-22 (T13 pass 0, §T13.1c). **Transcript `2026-09-13-01-03-48`, 1,323 segments, 65
owner turns.** **NO VALUE IS REPRODUCED HERE** — location and the safe surrounding facts only, per
the standing rule. This is the FOURTH credential exposure the sweep has recorded (O8 was the third).*

> ## 🔑🔑 **MATERIAL ADDITION — 2026-09-22 (T13 pass 3, §T13.4e). THE PASSWORD WAS REFUSED, AND THE REFUSAL IS ON THE RECORD.**
> **The table below records the EXPOSURE. It does not record that the credential was declined, which
> changes the shape of the decision the owner has to make.** *Read in the assistant prose adjacent
> to the same owner turns:*
> > *"**Please don't send me the SMS code, and I won't use the password** — the login should happen
> > in your browser, not through me. Two reasons: **the code is meant to prove it's you on your
> > device**, and **the password is now sitting in a chat log, so I'd recommend changing it after
> > this**."*
> > *"**The refresh token from step 2 is the only thing the scraper keeps**, stored in the
> > credentials table like the API keys, **never in memory or docs**."*
> > *"it genuinely wouldn't work well from my side, apart from the principle. **Betr's login is a
> > browser flow (Keycloak with a PKCE redirect and the SMS challenge)**… **scripting that flow from
> > a Cloudflare Worker is exactly the kind of login attempt their fraud checks flag — the thing
> > we're trying to avoid on your account.**"* · *"**I'm not storing the password anywhere.**"*
>
> ✅ **So segment 238's credential was offered, explicitly REFUSED, rotation was recommended, and the
> build proceeded on a scoped token instead.** 🔑 **That is the correct handling and it belongs in
> the record beside the exposure.**
>
> ### 🔴 BUT THE DISCIPLINE WAS NOT APPLIED UNIFORMLY — **and the asymmetry is the finding**
> **The same transcript, a few hundred segments later, PASTES THE FULL POSTGRES CONNECTION STRING —
> user, host, port, database and PASSWORD — back into the chat, twice**, as copy-paste instructions
> for creating a GitHub secret. ***No value is reproduced here*** *(standing rule)*.
> ⚠ **The mitigation was offered there too** — *"also please **rotate that password afterwards**
> (DigitalOcean → cluster → users → reset), **since it's now in this chat**"* — **but the credential
> was reproduced rather than refused**, ***which is the opposite of what was done for the account
> password ten minutes of transcript earlier.***
> 🔑 ***The rule applied was "don't handle the credential" for a third-party login and "relay the
> credential" for our own database.*** ⚠ **Whether either password was ever rotated is NOT
> RECORDED** — **and O11's decision is therefore narrower and sharper than the table suggests: it is
> about ROTATION, not about handling.**
> 📌 **One further fact recorded at the time and worth keeping**: the bridge **can write files and
> trigger workflows but CANNOT create GitHub secrets** — *"the secrets API needs encrypted uploads
> it doesn't support"* — ***which is exactly why the string had to travel through the chat at all,
> and is a capability boundary in 0 of the twelve.***

| owner segment | what it contains | why it matters |
|---|---|---|
| **238** | **a live account email and password**, pasted in the clear, with an SMS-code offer | ⚠ *and segment 240: **"you can use and discard, i trust you, and i'll change it afterwards"*** — ***whether it was changed afterwards is NOT RECORDED*** |
| **243 · 244 · 245 · 246** | **four full `curl` captures**: a **Keycloak `openid-connect/token`** exchange, an **Ably realtime `requestToken`**, a **`ws-token-request` carrying a bearer JWT**, and the **`api.fantasy.betr.app/graphql`** call | *the bearer JWT is a live session token; the GraphQL capture is the one §0f records as the Betr puller's basis* |
| **437** | **a new Odds API key**, pasted in the clear, with *"update only for the nba for now"* | *supersedes the key recorded at O8; **both are now in the transcript archive*** |
| 🔴🔴 **500** | ***the full DigitalOcean Postgres connection block*** — **host, port, database, pool, username, password and `sslmode=verify-full`** | ***this is the production database's primary credential, in a plain-text transcript that lives in the repository*** |

⚠⚠ **THE DECISION THE OWNER HAS TO MAKE**, and the sweep does not make it: **(a) rotate** the
Postgres password, the Betr account password and the Odds API key, then **(b) decide what happens to
the transcript archive itself** — *`/home/claude/nbadoc/transcripts/` holds twenty files and at least
four of them carry live secrets; the sweep reads them and never reproduces a value, but nothing stops
anything else from reading them.* **(c)** *If rotation already happened, the record should say so —
**it currently does not**.*
⚠ **Nothing was changed** *(rule 1)*. **A dated STATE** *(O9)*.

## 🔴🔴 THE GOVERNING PARITY DOCUMENT CONTRADICTS ITSELF ON ITS OWN HEADLINE EXAMPLE
*Recorded 2026-09-22 (T14 pass 2, §T14.3b). **`NBA_DAILY_PARITY_AND_BACKFILL.md`, read in full for
the first time by this sweep** *(253 lines, 16,857 bytes)*. **Documented, not fixed** *(rule 1)* —
***and this is a document, not the system, so the standing "document, don't fix" rule applies to it
exactly as it does to code.***

**`D1 referee crew` is the example the document uses to teach its own central distinction, and the
document holds BOTH the superseded position and its correction, in four places:**

| § | what it says about D1 | position |
|---|---|---|
| **§3** *(the two classes)* | *"**live-only** — the value was **never archived**… officials from the box score are post-hoc truth — usable as the **TARGET** of a prediction, **never as an input to a past day**"* | 🔴 **SUPERSEDED** |
| **§4** *(the FACTOR INVENTORY)* | **`D1 | b | ❌`** — *"assignments are game-day and **not archived**… **historical use is target-only**"* | 🔴 **SUPERSEDED** |
| **§6.2** *(open work)* | *"**(Correction: assignments ARE knowable before the window — see §7 — so the box-score crew is a FAITHFUL HISTORICAL RECONSTRUCTION.)**"* | ✅ **CURRENT** |
| **§7** *(stage assignment)* | **`D1 referee crew | ~6–7 AM | BASELINE | none`** | ✅ **CURRENT** |

⚠⚠ **THE HAZARD IS SPECIFIC, NOT COSMETIC.** ***§4 is the FACTOR INVENTORY — the table a reader
consults to ask "can this factor be backfilled?" — and it answers ❌ for a factor §7 places in the
baseline stage.*** 🔑 **A reader who stops at §4, which is the natural place to stop, gets the
superseded answer and excludes a usable factor from training.**
📌 **§3's CLASSIFICATION is affected too, not just the row**: the document's whole (a)/(b) taxonomy is
*"observed-and-archived versus live-only"*, ***and the correction replaces the test itself*** —
**`NBA_SYSTEM_DESIGN.md` §0a.4: *the test is "WAS IT KNOWABLE AT THE CUTOFF," not "was it
ARCHIVED."*** ⚠ **So §3 does not merely mis-file D1; it states a test the same document later
abandons.**
✅ **What is NOT in doubt**: **§7 and §6 are dated later and are consistent with each other and with
`NBA_COMPASS.md`**, so **the CURRENT position is that referee assignments post ~6–7 AM PT and are a
baseline-stage factor.**
🔑 **RECORDED AS A CLASS, because this sweep has now seen it twice**: ***a document that carries a
correction in one section and the corrected text in another is more dangerous than one that is simply
wrong***, **because each section reads as authoritative on its own.** *(The other instance:
`enrichment_backfill_status_2026_09_10` still carrying the `days_done` item its own author retracted
— see that item above.)*

---

## 🔑🔑🔑 T14's CLOSING AUDIT — **the system's own complete status, answered to the owner's "is everything covered now?"**
*Recorded 2026-09-22 (T14 pass 1, §T14.2e). **Transcript `2026-09-13-20-53-23`, the final owner turn
and its answer** — ***rule 27: a transcript's state on a subject is its LAST word.*** ⚠ **This is the
most complete status statement in the corpus and it is reproduced because it was produced by the
system about itself, not inferred.** **Documented, not acted on** *(rule 1)*.*

⚠⚠ **THE AUDIT'S OWN HEADLINE, and it is a correction**: ***"Two things surfaced that I'd told you
were handled and weren't — those first."***
1. 🔴🔴 **LIVE BOARD ARCHIVING IS NOT SOLVED** — *"I said earlier that our scrapers **'archive every
   pull from opening day.' They don't in a usable way**: each run **overwrites
   `boards/<app>_current.json`**. Git history keeps old versions, but **that's not a queryable
   archive and it bloats the repo**. For the parity requirement from opening day, **the window and
   close snapshots must land in `board_snapshots` in Postgres**."* ***Open — build item.***
   ⚠ **This sweep recorded the withdrawn claim as a safeguard in `NBA_SYSTEM_ARCHITECTURE.md` §0f-2
   and has corrected it there.**
2. 🔴 **The session's own work was undocumented until the end** — *"compass and the log are current
   through 09-11; everything from today needs the same pass."*

### ✅ CLOSED — **every mining and backfill item raised across the session**
**two-season boards (27M) · outcomes (6.9M) · PrizePicks tiers · market adjuster at the DFS rungs ·
game lines at BOTH snapshots · baseline history for 29–30 stat types on both seasons · combos ·
periods · injury reports · starters · officials · matchups · coach changes · two-way status ·
event→game map (96%) · name resolution · fantasy formulas · database sizing · index shrink · the MLB
backtest drop · registry re-tag · loader gates and `baseline_ladder_runs`.**
> ***"Nothing in that list has a gap I know of."***
📌 **Also closed from earlier sessions and named explicitly**: the Odds API upgrade, the 2023-24
starters rerun, the Underdog ladder, the Fliff scraper, the Betr puller, the coach-change dates, the
2026-03-15 injury replay, the grader, and the demon/goblin verdict.

### 🔴 STILL OPEN — **all CONSTRUCTION, and it is the enrichment phase itself**
**the day-by-day factor tables (one per derive family) · the A5 projected-lineup proxy · M1 wiring ·
the D1 referee LIVE capture · the live board archiver to Postgres · the scenario precompute · the
freshness gates.**
🔑 ***"That's construction rather than mining; nothing else stands in front of it."***

> ## ✅✅ **THE "OPEN — BUILD" LIST AUDITED AGAINST THE CODE AND THE DATABASE — 2026-09-22 (T14 pass 2, §T14.3d)**
> ⚠ **Rule 31: a design is what the code does.** **Repo listing pinned 2026-09-22T09:05:50Z; live
> figures 09:06:02Z.** ***Every one of the seven has a builder. Three have landed, three have not,
> and one landed in the wrong SHAPE.***
>
> | item | builder | landed? |
> |---|---|---|
> | **A5 projected-lineup proxy** | **`nba/fit_a5_projected_lineups.py`** | ✅ **built, tested, REJECTED** — *consistent with the record* |
> | **D1 referee live capture** | **`nba/scrape_referee_assignments.py`** + **`.github/workflows/nba-referees.yml`** | 🔴🔴 **`nba_ref.referee_assignments` = 0 ROWS** |
> | **scenario precompute** | **`nba/build_scenario_calibration.py`** | ✅ **`nba_score.scenario_realised` 1,942 rows · `nba_score.scenario_calibration` 29 rows** |
> | **freshness gates** | **`nba/gate_remaining_factors.py`** *(a gate; whether it is THE freshness gate is NOT ESTABLISHED)* | ⚠ **unverified** |
> | **live board archiver** | **`nba/archive_live_boards.py`** + **`.github/workflows/nba-board-archive.yml`** | 🔴 **ran — but see below** |
> | day-by-day factor tables · M1 wiring | — | ⏳ **not audited this pass** |
>
> ### 🔴🔴 **THE REFEREE CAPTURE IS THE "BUILDER EXISTS, TABLE DOESN'T" SHAPE AGAIN — third instance**
> **The scraper exists, the workflow exists, and `nba_ref.referee_assignments` holds ZERO rows** —
> ***twelve days after T14 listed the capture as open, and unchanged from §T10.26's earlier
> measurement.*** 🔑 **This is the same shape as `book_curves` / `book_calibration` / `market_fair`
> (§T13.5c) and the season-tables writers (T11's standing headline).** ⚠⚠ **And it matters more than
> the others**: **D1 is class (b) — *the value only exists going forward*** — so ***every day the
> capture does not run is a day of referee data that can never be recovered.***
>
> ### 🔴🔴 **THE LIVE BOARD ARCHIVER HAS RUN — AND IT WRITES THE WRONG SHAPE**
> **T14's requirement was explicit**: *"**the WINDOW and CLOSE snapshots must land in
> `board_snapshots`, THE SAME SHAPE AS THE HISTORICAL PULL**."*
> **What is actually there, for `game_date` beyond the historical backfill's 2026-04-12 end**:
> | bookmaker | rows | dates | date | `snapshot_label` |
> |---|---|---|---|---|
> | underdog | 5,281 | 1 | 2026-09-12 | 🔴 **`routine`** |
> | fliff | 1,394 | 1 | 2026-09-13 | 🔴 **`routine`** |
> | sleeper | 1,276 | 1 | 2026-09-12 | 🔴 **`routine`** |
> | 🔴 **prizepicks** | — | — | — | ***no rows at all*** |
> | 🔴 **betr** | — | — | — | ***no rows at all*** |
>
> 🔑🔑 **THREE DEFECTS, and the third is the one that defeats the purpose**: **① the PRIMARY board is
> absent** *(consistent with `NBA_SYSTEM_ARCHITECTURE.md` §0f-1: `boards/` holds no PrizePicks
> file)*; **② Betr is absent** *(consistent with its pull not having written since 2026-09-10)*;
> **③ the label is `routine`, not `window` / `close`** — ***so the live rows do NOT match the
> historical pull's shape and cannot be joined to the two seasons as like-for-like***, **which is
> the entire point of the parity requirement.**
> ✅ **So T14's item is CONFIRMED and SHARPENED**: **it is not "the archiver does not exist" — it is
> *the archiver exists, has fired on two days in ten, covers three of five apps, and writes a third
> label*.** ⚠ **Documented, not acted on** *(rule 1)*.

### 📌 OPEN — SMALL
**`oreb` retune · periods missing ~11 dates (the quarter files) · `dunks` (needs play-by-play — the
owner's call) · three coach dates at low confidence · `nba_teams_current.json` is EMPTY · the Sleeper
boost-promo field · ParlayAPI usage logging · the fantasy-score check against one live graded leg in
week one.**
⚠ **`nba_teams_current.json` holding zero records is worth its own line**: it silently broke the
event→game map *(every game failed to resolve, and because each game appears in two teams' logs,
**exactly half resolved — which made a CODE bug look like a DATA problem**)*. **It was worked around
by hardcoding the 30 franchises; the empty file itself remains.**

### ⏳ OPEN — **OWNER-SIDE**
**the Sleeper alt-lines capture · the Chalkboard proxy capture · the PrizePicks calibration slips ·
the Betr token expires ~2026-10-10 · a schedule for the twice-daily Betr pull.**
🔑 **The last two are the live cause of `NBA_SYSTEM_ARCHITECTURE.md` §0f-1's finding that the Betr
pull has not written since 2026-09-10.**

### ⚠⚠ ACCEPTED LIMITS — **stated as limits, not as gaps**
**no 2023-24 injury reports · nine unrecoverable board snapshots · no historical Sleeper / Fliff /
Betr boards · Underdog's history is SINGLE-RUNG.**
🔑 ***A list of things that will never be fixed is as valuable as a list of things that will*** —
**and three of the four are absences this sweep independently re-derived, at some cost.**

---

## 🔑🔑 T15's OWNER DIRECTIVES — **an explicit "save this" rule, and an ANTI-REJECTION order that bears on every verdict in the transcript**
*Recorded 2026-09-22 (T15 pass 0, §T15.1). **Transcript `2026-09-18-17-12-53`, all 21 owner turns
read** *(3,642 chars, mean 173 — the TERSEST owner stratum swept; T13's mean was 526)*. Probed
against baseline `6132e96a` and the working tree, pinned 2026-09-22T09:14:47Z; every hit opened.
**Documented, not acted on** *(rule 1)*.*

### 🔑🔑 **THE SAMPLE-FIRST RULE — the owner asked explicitly for it to be kept** *(0 of the TWELVE and 0 of the THIRTY)*
> ***"Great — from now on ALWAYS DO A SAMPLE TESTING BEFORE REPLICATE THE FULL DATA! SAVE IT IN YOUR
> MEMORY: anything that will replicate the full data needs a sample testing and success first."***

⚠ **The two `sample test` hits in the twelve are *"out-of-sample test"*, a different thing entirely**
*(opened and dismissed — rule 26)*. 🔑 ***This is a standing operational rule the owner asked to be
persisted, and it is the only directive in this corpus phrased that way.*** ✅ **And the system has
followed it since** — *the smoke-test-before-full-run pattern appears repeatedly after this point:
"one prop pair on one season, so a shape mismatch fails in ten minutes rather than three hours."*

### 🔴🔴 **THE ANTI-REJECTION ORDER — and it lands in the FACTOR-REJECTION transcript**
> ***"NO — DO NOT JUST REJECT. FIX IT: granulated, break in tier, figure it out, research, debug,
> test, simulate. WE CAN'T JUST BE DROPPING IMPORTANT PIECES."***

🔑🔑 **`NBA_GLOSSARY.md` credits T15 with *"A5 — REJECTED/CLOSED"*, and COMPASS fact 85 records
*"THE M1/B4 REJECTIONS WERE WRONG — corrected 2026-09-13."*** ***So this transcript both produces
rejections and contains the owner refusing them***, ⚠ **and the corpus already records that at least
two were reversed.** *(`do not just reject` / `dropping important pieces`: **0 of the twelve and 0 of
the thirty**.)*
📌 **With the reasoning attached**: *"**what will do B4's job?** If nothing, we have to fix or find
the proper alternative — **unless A2 does it all**"*, and *"but that can be changed with the last
updated lineups and injury report — **that must be taken care of properly**."*
🔑 **And the fallback the owner will accept**: *"make the better decision — **drop it OR PENALISE it
accordingly**"* · *"find the proper penalty level, **fair to it**."* ⚠⚠ ***So "reject" was never the
only option on the table; a graded penalty was.*** **Whether any factor was penalised rather than
dropped is NOT RECORDED** *(pass 1's job)*.

### 🔑 **THE STRUCTURAL-FIX AND COMPLETENESS DIRECTIVES** *(both 0 of the twelve and 0 of the thirty)*
> *"always do the **CORRECT STRUCTURAL FIXES — NO SHORTCUTS, NO PATCHES** — real fixes that produce
> real proper data and results."*
> *"every single step needs to be as close to perfection as possible. **ONLY THEN WE MOVE ON. NOTHING
> IS LEFT OPEN OR HALF BAKED BEHIND.**"* — **stated THREE times across the transcript** *("nothing
> left broken or open behind"; "nothing left behind, all gaps and issues need solution")*.

⚠ **Read against `NBA_DAILY_PARITY_AND_BACKFILL.md`'s *"no factor is done until its day-by-day
backfill exists"*, these are the same standard applied to CONDUCT rather than to data.**

### 🔑 **THE FACTOR TAXONOMY THE OWNER ASKED FOR — a design spec, and `propline tier` is 0 of the THIRTY**
> *"Do you have the logic already? **factors, sub-factors, FACTOR TIERS, PLAYER TIERS per
> factor/sub-factor, PROPLINE TIERS, VARIATIONS AND DIRECTIONS TIERS** — all that, and if it applies.
> **For injury and lineups, THE TEAM AND ADVERSARY EFFECT that a missing player or returning player
> have.** Each factor needs to be deeply studied and understood… then training, sharpening and
> calibration, **then replication to all the back data. The final HP created needs to be EXTREMELY
> ACCURATE TO THE REAL HIT RATE, LEG LEVEL, as the baseline.**"*

📌 *`sub-factor` is in 2 of the twelve and `player tier` in 4; **`propline tier` and
`variations and directions tiers` are in NONE***. 🔑🔑 ***"The team and adversary effect" is the
Wembanyama argument***, **stated here five days BEFORE T14 records it** *(`NBA_SYSTEM_DESIGN.md`
§0a.4)* — **so the combinatorial objection is the owner's standing position, not a one-off remark.**
📌 **And the granularity instruction that follows it**: *"maybe you need to **open more tiers, make
it more granular** — but everything needs to be as close to perfection as possible."*

### 📌 **AND A STANDING INSTRUCTION WORTH READING AGAINST §T13.2h**
**The owner directs Gemini's use FOUR times** *("use Gemini for insight when needed"; "research
online, deep, multiple passes and reliable and strong sources")*. ⚠ **`NBA_MULTIPLIERS.md` §0.9g
records that Gemini's NUMBERS failed a controlled reproducibility test and were discarded, while its
MECHANISM descriptions were kept.** 🔑 ***Both are current: the directive is to use it, and the
recorded finding is which of its outputs are admissible.*** **Neither supersedes the other.**

---

## 🔑🔑 T14's OWNER DIRECTIVES — **two items CANCELLED, three constraints, and a rule the corpus did not have**
*Recorded 2026-09-22 (T14 pass 0, §T14.1). **Transcript `2026-09-13-20-53-23`, all 33 owner turns
read.** Probed against baseline `5fbb9c1e` and the working tree, pinned 2026-09-22T08:46:49Z; every
hit opened *(rule 26)*. **Documented, not acted on** *(rule 1)*.*

### ✅✅ TWO QUEUED ITEMS ARE CANCELLED BY DIRECTIVE — **remove them from the work list**
**T13's closing queue still carries *"coach-change dates, all-star/all-NBA lists, national-TV flag,
referee assignments scraper"* as work.** **Two of the four are settled here:**
> 🔴 ***"The ALL-STARS I rather it to be BLOCKED — they change, IT IS VERY VOLATILE, so DON'T MINE
> IT, DON'T GIVE LEGS TO IT."***
> 📌 *"**National TV flag** — I don't even know what that is, how they differ from a regular game.
> **If it's just a regular game, TREAT IT LIKE ONE.**"*

✅ **`all-star` is in six of the twelve and `national tv` in one — but only as the `game_id` prefix
`003` and as a desk-work item, never as this directive** *(every hit opened)*.
🔑 ***And the all-star reason GENERALISES beyond all-stars: a volatile, changing attribute should
not become a leg.*** ⚠ **Only `coach-change dates` and the `referee assignments scraper` remain from
that queue** — **and the referee one is re-scoped by the backfill directive below.**

### 🔑🔑 THE COST CEILINGS — **hard constraints on every parallelism decision, and 0 of THIRTY**
> *"**For Cloudflare, I'm paying the FIVE DOLLAR plan, and I don't want to go over any of the
> limits**, because I don't want to pay extra money for that. **Same thing with GitHub. I'm paying
> the FOUR DOLLAR plan. I don't want to go over any limit.** And also the database. **My server has
> only one gig of RAM.** So that's another thing to have in consideration — ***think about
> processing multiple things at the same time.***"*

⚠ **The binding alert is CPU, not disk**: *"**the alerts I've been getting are CPU more than
anything**."* **The storage/spec arc, the `nyc3` / PostgreSQL 18 cluster identity and the *"THE
THIRTY GIGS IS THE MAX"* ceiling are in `NBA_DATABASE.md` §0v** — 🔴 **including the live
contradiction that the database measured 43 GB on 2026-09-22.**

### 🔴 THE FULL-BACKFILL DIRECTIVE — **the parity rule extended to EVERY factor, with a worked example**
> *"**Every factor that's gonna run when the system is live, we need to have it BACKFILLED, OR
> DERIVED, OR SIMULATED**… ***every single factor needs to have a DAY-BY-DAY REAL DATA***… so we can
> make a proper final hit probability for each leg and compare with the board."*
> *"For the **referee assignment** — **SIMULATE what was the assignment**, or if you already have the
> referee that was on that game that day, you already have it."*
> *"**And the baseline must be doing exactly the same, having a day-by-day PROPORTIONAL TO THE
> REALITY.**"*

🔑 ***This re-scopes the referee item from "build a scraper" to "ensure every live factor has
day-by-day history, by mining, derivation or simulation"*** — **a larger and more specific
requirement than the queue records.**
📌 **And the documentation directive attached to it**: *"**document this, and document everything
else that is open since the last documentation** — compass, all documents, and **create new
documents if needed**. **Look at the date of the last update and look at the chat history and
transcripts since then**, to be sure to have everything."*

### 🔑🔑 THE BASELINE ANCHORING RULE — **0 of the TWELVE and 0 of the THIRTY**
> ***"The baseline should be ANCHORED ON THE PREVIOUS GAME, so we do not have a huge coverage
> variation — what the player had in the past game should be very close to what it will be on the
> board for next game. NOT THE OUTCOME, but WHAT THE BOARD OFFERED."***

⚠⚠ ***A coverage rule that draws exactly the leakage boundary `NBA_SYSTEM_DESIGN.md` §0a.3 records
from a different direction*** — **the previous game's BOARD is admissible; the previous game's
OUTCOME is the thing that must not leak.** **Two independent statements of the same line.**
📌 **With two companions**: *"the baseline creates a **FULL MATRIX** that may not even have a leg
available for the full variations — **that is BY DESIGN, not duplication**"* *(an owner correction
of an assistant's own finding)*, and *"**check if the baseline covers all the variations that show
on the board LADDERS**, to see if it needs to be EXPANDED or if it is doing its job."*

### ⚠ AND ONE CONDUCT DIRECTIVE, recorded because it is about how work is REPORTED
**Three consecutive turns**: *"**this was done before. You already told me TWICE that this has been
done before.**"* → *"**That's a lot of explanation. I need an ASSERTIVE ANSWER.**"* → *"but, yes,
**get the shit done**."*
🔑 **Two instructions sit inside it**: ***answer assertively rather than at length***, and ***do not
re-do work already reported as done*** — ⚠ **the same failure this sweep's own closure judgment
exists to catch, arriving from the owner's side.**

---

## 🔴 T13's OWNER DIRECTIVES THAT THE TWELVE DID NOT CARRY
*Recorded 2026-09-22 (T13 pass 0, §T13.1d). Probed against the baseline `4429380d`, pinned
2026-09-22T07:40Z; controls `PrizePicks` 63 of thirty and `goblin` 46 both fire; every hit opened.*

1. 🔴🔴 **THE LATENCY REQUIREMENT — 0 of THIRTY.** *Segment 571, whole*: **"will the
   enrichment/scoring engine pipeline (board + daily context + market + scoring engine) be **faster
   than MLB**? because **MLB is running around 30 min, leaving me only 15 minutes to place slips**"**
   — ***a hard performance budget on the whole NBA pipeline, stated by the owner and recorded
   nowhere.*** ⚠ *And segment 609 sets how it will be measured: "let's have everything finished, then
   we calculate how long… **the mining itself is fast; what takes long is the SCORING ENGINE**."*
2. 🔴 **THE PARLAYAPI DOWNGRADE'S TERMS — 0 of THIRTY** *(the downgrade itself is in 2 of the twelve)*.
   *Segments 286 and 289*: **"if scraping prop-lines books is easy, I can downgrade my ParlayAPI
   account, pay less"** → **"starter downgrade **$5/mo, 20,000 credits/mo, no rate limit, 168h
   historical data**, manage via Stripe portal"**, *conditional on **"we are directly scraping all
   apps now — PP, Sleeper, UD and Fliff"*** — ⚠ **and on MLB and hockey still needing it.**
3. 🔴 **THE MARKET-CONSENSUS WEIGHTING REQUIREMENT — 0 of THIRTY** *("consensus" itself is in 4 of the
   twelve)*. *Segment 1274*: **"the consensus is for market… **be sure that you WEIGHT properly.
   There are markets that are MORE RELIABLE THAN OTHERS, and research the proper way to do that**"**
   — ***an unweighted consensus is explicitly not what was asked for.***
4. 🔴 **THE MLB-MULTIPLIER WARNING — 0 of THIRTY.** *Segment 848*: **"even our internal **MLB
   multipliers are not sharp enough**. That's why I said it's better even not to look at it — but
   once you already looked, **be careful what you follow**. Use proper NBA information."**
   🔑 ***This is a standing caution against exactly the cross-sport reuse the corpus does elsewhere.***
5. 🔴 **TIER CONTEXT IS ALREADY ON THE SNAPSHOTS — 0 of THIRTY.** *Segment 1176*: **"the tier context
   should be **already on the board snapshots** — what's goblin, what's demon, and which tier. So
   that should **not need to be redone, just MAPPED**."**
6. 🔴 **UNDERDOG AND SLEEPER NEED THE TIERING TOO — 0 of THIRTY.** *Segment 1208*: **"Underdog and
   Sleeper also need the tiering system… close all the gaps… finish it first, and then we do the
   scoring engine."**
7. 📌 **THE PICK WINDOW'S LOWER BOUND** — *segment 567*: **"we said **2 hours before the first game
   start. 1:45pm** I believe was what we agreed. Maybe **1:30pm, or even 1pm — but NOT 9am**. Only
   for weekends that the games start early."** *(`1:45` is in 2 of the twelve; **`1:30 pm` is 1 of
   thirty and 0 of the twelve**.)* ⚠ *And segment 614 reopens it: "we're doing 2:45 for every day —
   for the early days 2:45 is not going to cut it. **For weekends and special days, are you doing an
   EARLY snapshot?**"* — ***the answer is NOT RECORDED at pass 0's offset*** *(rule 27: the last word
   is pass 1's job)*.

## 🔴🔴 **OWNER DECISION O10** · `[LIVE-AUDIT]` — **THE BACKFILL STATUS KEY ASSERTS THREE COMPLETE SEASONS; THE TABLES HOLD ONE**
> ### ⏳ OPEN — raised for the owner 2026-09-22, **documented and NOT acted on** *(rule 1; no live data, status key or pipeline was changed)*
> **RE-TAKEN 2026-09-22 AND UNCHANGED**, both sides pinned:
> | side | pinned (UTC) | query | result |
> |---|---|---|---|
> | **tables** | **2026-09-22T07:00:58Z** | `count(*)` and `string_agg(DISTINCT substring(game_id,4,2))` on each table | **`player_game_starter_status` 32,179 rows, season code `25` ONLY · `game_officials` 3,681 rows, `25` ONLY** |
> | **status key** | **2026-09-22T07:01:05Z** | `config_json->'starters'`, `->'officials'` on `enrichment_backfill_status_2026_09_10` | **`1230/1230` for ALL THREE seasons**, `verified_at` 2026-09-10T22:00Z |
>
> ## ✅✅ **THE DIAGNOSIS IS NOW VERIFIED FROM THE SOURCE, NOT INFERRED — 2026-09-22 (T13 pass 2, §T13.3f)**
> **§T12.2 concluded, by INFERENCE, that the verification *"is true only of the REPOSITORY."*
> T13 is where that sweep was run, and it says so in its own words as it starts:**
> > *"Running the coverage sweep. First, what's actually in the **data directory**."*
> > *"Everything's present. ***Running the sweep ACROSS THE META FILES***."*
>
> 🔑🔑 ***The coverage sweep read `nba/data/*` meta files. It never queried Postgres.*** **So the
> `1230/1230` for all three seasons is a count of what was SCRAPED AND COMMITTED, and the status key
> records it as verification.** ✅ **O10's diagnosis moves from INFERRED to VERIFIED** *(rule 31: the
> claim is tested against what was actually done, not against what the record says)*.
>
> ✅ **AND THE SWEEP'S OWN OUTPUT CONFIRMS THE SHAPE**, with a figure the twelve did not carry:
> **the 2023-24 starters rerun *"worked — now 1230/1230 with zero errors, 32,385 rows, up from
> 32,328"*** — 🔴 ***a REPOSITORY count of 32,385 for 2023-24, while `player_game_starter_status`
> holds 32,179 rows for 2025-26 ONLY.*** **Two similar five-figure numbers describing different
> seasons on different sides of the gap** — ⚠ **precisely the collision that makes this key read as
> complete.** **Recorded so a future reader does not match them.**
> 📌 **The same sweep is also the source of the two items below it** *(the `days_done` counter,
> retracted by its own author, and the 2023-24 injury-report limit)* — **so all three came from one
> repository-side pass, and only one of the three is a database statement.**
>
> 🔑 **The decision the owner has to make is not whether the gap is real — it is what the status key
> should say.** ***The key is not wrong about the SCRAPE; it is silent about the LOAD***, and every
> reader so far has taken it for a database statement. **Three shapes, for the owner to choose
> between**: *(a)* **run the two loaders for 2023-24 and 2024-25** — the workers are proven
> multi-season-capable and default to the current season, so this is an input, not a code change
> *(§T11.31b, §T11.52b)*; *(b)* **re-label the key** so each figure says `scraped` or `loaded`; *(c)*
> **leave both and record the gap**, which is what this sweep has done. ⚠ **Nothing here is
> reversible by the sweep: it reads and records only.**

### The finding, as first recorded 2026-09-21
*Recorded 2026-09-21 (T12 pass 3, §T12.4b). **`SELECT` only.** The key is
`nba_config.classification_config` → `enrichment_backfill_status_2026_09_10`, **`verified_at`
2026-09-10T22:00Z**, row `updated_at` 2026-09-10 21:51Z. **A dated STATE, not a verdict** (O9).*

**What the key says**, verbatim from the live JSON:

| | 2023-24 | 2024-25 | 2025-26 |
|---|---|---|---|
| **starters** | `1230/1230 rows 32385 errors 0` ***(2 timed-out games repaired)*** | `1230/1230 rows 32515` | `1230/1230 rows 32179` |
| **officials** | `1230/1230 rows 3690` | `1230/1230 rows 3691` | `1230/1230 rows 3681` |

🔴🔴 **And the database holds ONLY 2025-26 in both tables** *(re-verified by `game_id` season code at
T11 pass 58 and unchanged)*: **`player_game_starter_status` 32,179 rows · `game_officials` 3,681
rows.**
🔑 ***`32,179` is EXACTLY the key's 2025-26 figure, and `3,681` is exactly its 2025-26 figure*** —
**so the table contains precisely one of the three seasons the status record calls complete.**
***This is the strongest evidence yet for the first standing gap: the system's own verified status
record describes the REPOSITORY, and nothing reads the repository.*** *(§T11.31b · §T12.2d.)*
✅ **And it CLOSES a T12 queue item**: the two timed-out 2023-24 games — **`0022300079`,
`0022300721`** — are recorded here as ***repaired***, with the scrape at 1230/1230 and errors 0.

### 🔴 FOUR OPEN ITEMS INSIDE THAT KEY — **and all four are in ZERO of the thirty**
*(Probed against the baseline with controls `us_dfs` 8 of thirty and `420 credits` 4; every hit
opened — the two `arbitrage` hits are `NBA_MULTIPLIERS.md`'s **Single-Tier Non-Arbitrage Principle**,
a payout-table validity check and a different subject, **dismissed**.)*

1. 🔴🔴 ***"market join must be properly keyed before the engine consumes it — a coarse join produced
   a FALSE 2.9%-vs-56% ARBITRAGE SIGNAL."*** **A join defect that manufactured an apparent
   53-point edge.** *`coarse join` · `market join` · `properly keyed` — **0 of thirty each.***
   > ## 🔑🔑 **ORIGIN AND DIAGNOSIS FOUND — 2026-09-22 (T13 pass 1, §T13.2)**
   > *Transcript `2026-09-13-01-03-48`, the prose stratum. ⚠⚠ **This item was recorded as having no
   > origin in the corpus. It has one — in a DIFFERENT TRANSCRIPT from the one that raised it.***
   >
   > **THE SIGNAL, as first produced**: *"for **130 Over rungs**, the sportsbook consensus implies
   > **2.9%** while Underdog prices the same player, same stat, same line, same timestamp at
   > **−130 (56.4%)**. **If real, that's a free-money arbitrage of absurd size — which almost always
   > means a data problem, not an edge.**"*
   > 🔑 ***It was never believed.*** **It was flagged as untrustworthy IN THE SAME BREATH it was
   > produced** — *"something I don't trust, and it's worth showing you why rather than reporting it
   > as a finding."* ⚠ **The open item's wording — *"a coarse join PRODUCED a false signal"* — reads
   > as a defect that got through. It did not get through; it was caught immediately.**
   >
   > **THE VERIFICATION, quoted**: *"for **Aaron Gordon Over 24.5** at that exact timestamp, the
   > books agree closely with each other (**+1300 Bovada, +1700 DraftKings, +1300 FanDuel ≈ 6–7%**),
   > and **Underdog has NO ROW at that rung at all**. So the books are internally consistent, and
   > **the anomaly is in how my aggregate query paired Underdog rows to book rows — not in the
   > underlying data.**"*
   >
   > **THE REQUIRED FIX, stated verbatim and STILL OPEN**: *"the per-tier hold analysis needs a
   > **properly keyed join — matching on the EXACT RUNG WITHIN A LADDER, and EXCLUDING SENTINEL
   > PRICES** — before any number from it goes anywhere near the model."*
   > 🔑 ***"Excluding sentinel prices" is a second requirement the item does not carry at all***, and
   > it is not optional: `NBA_GOBLIN_DEMON.md` §0h shows the PrizePicks alternate population carries
   > **exactly two prices, `+100` and `−137`, on every rung** — **so any hold computed across a
   > PrizePicks–book join is computed against two constants.**
   >
   > ### ✅ **THE SENTINEL IS NOW IDENTIFIED AND COUNTED — 2026-09-22 (T13 pass 2, §T13.3b)**
   > *The item asks for sentinel prices to be excluded and never says what one is.* **Live price
   > census of `nba_market.board_snapshots`, pinned 2026-09-22T08:01Z**:
   > ***the sentinel is `price ≤ −10000`, minimum `−100000`*** — **180 rows, ALL on Underdog**
   > *(standard Over 83 · standard Under 83 · alternate Over 7 · alternate Under 7)*, **and ZERO on
   > PrizePicks.** 🔑 **So the exclusion predicate is concrete, the population it removes is 180 rows,
   > and it costs nothing.** ⚠ **Whether other books carry their own sentinels is NOT RECORDED** —
   > *the census covered PrizePicks and Underdog only.*
    >
    > ### ✅ **HALF OF THE FIX IS ALREADY IMPLEMENTED — 2026-09-22 (T13 pass 4, §T13.5d)**
    > **`nba/build_rung_market.py`, which builds the market-probability table this item's "properly
    > keyed join" would consume, states its own exclusion**:
    > > *"De-vig is **per book across the two sides of the SAME line**, then averaged across books.
    > > ***Flat DFS placeholder prices (−137 / +100) are EXCLUDED: they are NOMINAL PRICING, NOT
    > > ODDS.***"*
    >
    > ✅ **So the DFS flat prices are already out**, **and its `BOOKS` list is the eight sportsbooks
    > explicitly** *(`draftkings, fanduel, betmgm, williamhill_us, betrivers, bovada, betonlineag,
    > fanatics`)* — ***the DFS apps are excluded from the market side by construction***, which
    > removes the PrizePicks-vs-book pairing that produced the original artifact.
    > 🔴 **WHAT IS STILL NOT EXCLUDED IS THE SENTINEL** — **`price ≤ −10000`, min `−100000`, the 180
    > Underdog rows above.** ***Two different exclusions; only the first is implemented***, and the
    > sentinel rows sit on the APP side rather than the BOOK side, so the book-scoped `BOOKS` filter
    > does not reach them.
    > ✅ **THE TABLE ITSELF, re-taken live 2026-09-22T08:35:32Z**: **`nba_market.rung_market` —
    > 1,057,765 rows · 378 dates · `avg(books) = 2.11` (min 1, max 8) · `built_at` last
    > 2026-09-11T03:39:32Z**, columns `game_date, snapshot_label, player, market, line, p_over_book,
    > p_over_sd, books, built_at, nm`.
    > 🔑 ***The key INCLUDES `market`*** — **which is precisely the column whose omission produced
    > both the false arbitrage signal and the collapsed tier table** *(`NBA_GOBLIN_DEMON.md` §5.4)*.
    > ⚠ **So the properly-keyed join this item demands EXISTS as a table.** **Whether anything
    > consumes it, and whether the sentinel rows were excluded when it was built, are NOT
    > RECORDED.** **Documented, not acted on** *(rule 1)*.
   >
   > ### 🔴🔴 **AND THE SAME ARTIFACT CLASS STRUCK A THIRD TIME IN THIS TRANSCRIPT, WITH A NAMED SIGNATURE**
   > **The per-tier hit-rate table was wrong on its first run, for the same reason**:
   > > *"Those numbers are wrong, and I can see why: **I dropped the market from the join, so a
   > > player's POINTS line of 8.5 was matching his REBOUNDS line of 8.5.** That's the same artifact
   > > class I flagged earlier — and **it's exactly why the goblin tiers all collapsed to ~50%**."*
   >
   > 🔑🔑 ***THE DETECTION RULE THIS GIVES THE ITEM, which it does not currently have***: **a
   > market-blind join REGRESSES EVERY GROUP TO THE POOL MEAN.** **A tier table that reads flat near
   > 50% is not evidence of flat pricing — it is the expected output of a join missing
   > `market_key`.** ✅ **And the corrected join's signature is the opposite**: *"monotonic in both
   > directions, **which is the signature of a correct join**."* ⚠ **The transcript counts itself at
   > *"I've now hit that artifact twice"* — it is three** *(the arbitrage signal, the duplicated
   > ladder rungs, and the tier collapse)*, **which is itself why the validation gate is required
   > rather than a habit.**
   >
   > 📌 **AN OBSERVATION IN THE EVIDENCE THAT THE TRANSCRIPT DOES NOT NAME** *(recorded at its own
   > evidence strength — rule 19)*: the verification result set returned **five rows**, and they are
   > **`Aaron Gordon` AND `Eric Gordon`** — *same `market_key` (`player_points_alternate`), same
   > `side`, same `line` 24.5, same `snapshot_ts`, prices +1300/+1700/+1300 against +2144/+2000.*
   > ⚠⚠ **The transcript attributes the artifact only to "how my aggregate query paired rows" and
   > NEVER names a mechanism. A surname collision is consistent with the rows shown and is NOT
   > stated by the source** — **so it is a HYPOTHESIS, and the proper keying above must be tested
   > against it rather than assumed to cover it.**
   >
   > ⚠ **THE GENERALISATION, which is why this item outranks its size** *(quoted)*: *"it's the same
   > class of error that would **silently produce a beautiful, wrong backtest**: a market-data join
   > that **looks right, aggregates cleanly, and quietly pairs mismatched rungs.**"*
   > **It is therefore a REQUIRED VALIDATION STEP before the scoring engine consumes market data at
   > all** — **not a defect to repair once.**
   > ⚠ **Stated at evidence strength and NOT acted on** *(rule 1)*: no join, query or pipeline was
   > changed.
2. 🔴 ***"injury index files report `days_done: 0` while rows are correct — the counter was never
   written during the shard migration; repair before any job reads it to decide re-fetches."***
   **A stale counter that a re-fetch decision would read as "nothing done."**
   > 🔴🔴 **CONTRADICTED BY THE ARTIFACT — 2026-09-22 (T12 pass 10, §T12.11c).** *Read the files, per
   > rules 29 and 31.* **`nba/data/nba_injury_report_2025_26_index.json`, pinned 2026-09-22T07:44Z**:
   > ***`days_done` is a LIST of 176 date strings*** *(`2025-10-20` … `2026-04-13`)*, **`rows`
   > 919,949**, **`shards` a list of 7 months**, `updated_at` **2026-09-10T03:02:32Z**. **The 2024-25
   > file is the same shape: 174 dates, 418,071 rows, 7 shards.**
   > 🔑 ***So "the counter was never written" is not what the files show — the days ARE written, as a
   > LIST, and its length is exactly the 176 / 174 the status key itself quotes.*** **This is a
   > READER problem, not a WRITER problem**: anything that reads `days_done` as an integer gets
   > nothing, while anything that takes its LENGTH gets the right answer — ***and T12 segment 614
   > shows a probe doing exactly that, printing `{'days done': 176, …}` on 2026-09-10.***
   > ## ✅✅ **CLOSED BY THE CORPUS — 2026-09-22 (T13 pass 2, §T13.3e). THE ITEM'S OWN AUTHOR RETRACTED IT, IN WRITING, IN T13.**
   > ⚠⚠ **Everything above is correct and none of it was necessary.** **The transcript that WROTE
   > this item also scratches it, a few hundred segments later:**
   > > *"**Let me verify before 'fixing' something that may not be broken** — the index writer looks
   > > correct."*
   > > *"***That was MY ERROR, not a bug***: the index key is **`days_done`**, and **my sweep looked
   > > for `days` / `covered_days` / `dates`**. The files are correct and complete — **174 days for
   > > 2024-25 (Oct 22 → Apr 13) and 176 for 2025-26 (Oct 20 → Apr 13)**, with all 7 monthly shards
   > > each. ***Nothing to fix; scratch that item.***"*
   > > *(and in the block summary)* *"**injury index: VERIFIED CORRECT** — the *'days_done: 0'* was
   > > **my sweep reading the wrong key**, not a data problem."*
   >
   > 🔑🔑 **SO THE ANSWER TO *"WHICH READER REPORTS 0"* WAS ON FILE ALL ALONG: the COVERAGE SWEEP
   > that produced this very status key, querying the wrong key name.** **§T12.11c re-derived from
   > the artifact what the corpus already stated** — *the right answer, by the harder route.*
   > ⚠⚠ **AND THE STATUS KEY IS STALE**: `enrichment_backfill_status_2026_09_10` still carries
   > *"the counter was never written during the shard migration; repair before any job reads it"* —
   > ***an item its own author retracted in the same working session.*** **The key was never
   > updated.** 🔴 **Nothing was changed here** *(rule 1)*; **recorded as a DOCUMENTATION-INTEGRITY
   > finding: a verified-status record can outlive its own retraction.**
   > 🔑 **THIS IS RULE 33's THIRD AND SHARPEST INSTANCE** *(the nine `EVENT_NOT_FOUND` snapshots and
   > the false-arbitrage signal are the first two)*: **§T12.11's sibling re-test cleared this item by
   > grepping T12 and finding no later mention. Its resolution is in T13, and it is explicit.**
   > ⚠ **Stated at evidence strength and NOT acted on** *(rule 1)*: no file, key or pipeline was
   > changed. **A dated STATE** *(O9)*.
3. 🔴 ***"2023-24 has NO injury reports — the league archive does not reach back reliably → day-of-report
   factors can only be fitted on TWO seasons, not three (matters for harness training)."***
   ⚠ **This is a scope limit on every day-of-report factor and it is not a bug.**
4. **"9 board snapshots unrecoverable (`EVENT_NOT_FOUND` at that timestamp — the board was not posted
   yet); 0.18% of 5,124."**
   > ## 🔑🔑 **THE NINE ARE THE RESIDUE OF FORTY-FIVE — the whole arc recovered 2026-09-22 (T13 pass 1, §T13.2)**
   > *Transcript `2026-09-13-01-03-48`, read in order. **Live figures re-taken and pinned
   > 2026-09-22T07:45:45Z.*** ⚠⚠ **The item reads as an isolated 0.18% blip. It is the tail of a
   > diagnosed, repaired failure whose CAUSE was a rule the owner specified and the build did not
   > implement.**
   >
   > ### The error count over the run — it ROSE, then was repaired to near-zero
   > | Stage | Errors | Rate |
   > |---|---|---|
   > | first tranche | **6 of 678** | 0.9% |
   > | mid-run | **28 of 1,567** | 1.8% |
   > | 2024-25 complete *(2,424 snapshots, 10.3M rows, 1,018,080 credits)* | **42** | 1.7% |
   > | **at completion** | **45** | — |
   > | **after repair** | **9 of 5,124** | **0.18%** |
   >
   > ### 🔴🔴 THE CAUSE, diagnosed in the same transcript — **and it is an UNIMPLEMENTED OWNER RULE**
   > > *"the **`window` snapshot lands AFTER TIP** — it would capture in-game lines or nothing.
   > > That's likely behind several of the `EVENT_NOT_FOUND` errors. ***Your original rule said
   > > 'proportional on early slates,' and I DID NOT IMPLEMENT THAT.***"*
   >
   > ### 🔑🔑 **COMPLETED 2026-09-22 (T13 pass 3, §T13.4b) — THE OWNER CAUGHT IT, THE COUNT WAS 38, AND ONLY THE WINDOW WAS AFFECTED**
   > **The earlier entry recorded the CAUSE as an owner rule the build did not implement. It missed
   > that the DETECTION was also the owner's, and it missed the measurement.**
   > **The builder's first answer offers three candidate flaws and asks which**, and the owner's push
   > produced the measurement two segments later: *"**Good catch — let me measure it rather than
   > assume.** Checking how many window snapshots were taken after their game had already started."*
   > > ✅ *"**38 window snapshots landed at or after tip — exactly the early-slate problem you
   > > predicted.**"*
   > > ✅ *"Confirmed and quantified: **27 DATES, 38 EVENTS — all weekend/holiday early slates (tips
   > > 12:10–14:40 PT)**, where the 2:45 snapshot landed after tip. ***The CLOSE snapshots are all
   > > clean — 0 after tip — so only the WINDOW needs repair.***"*
   >
   > 🔑 ***So the arc is 38 → 57, not a single number***: **38 measured mid-run on 2024-25 alone; 57
   > cleared after both seasons were in.** **Both are correct at their own moment, and the entry
   > above quotes only the second.**
   > ✅ **AND THE CLOSE SNAPSHOT WAS NEVER AT RISK** — *a fact the repair description does not carry,
   > and it halves the blast radius of the whole incident.*
   >
   > **THE RULE'S RATIONALE, which the earlier entry recorded without**: *"a 12:40 PT Saturday slate
   > gets a 10:40 PT window — **early enough to be pre-tip, late enough to be after the league's
   > game-day report for those games**, and **it mirrors what you'd actually do: one snapshot for the
   > slate, two hours before the first ball goes up**."* 🔑 **`tip` means THE FIRST GAME OF THE DATE,
   > computed from the actual commence time the events call already returns** — *"so **it
   > self-adjusts for weekends, holidays, London games, and DST without any hardcoded time**."*
   > **THE REPAIR COST: only the 38 re-pull — ~16k credits.**
   >
   > 🔴 **AND A DEPLOYMENT FACT IN 0 OF THIRTY, recorded because it explains why the fix did not
   > apply immediately**: *"note the currently-running job **uses the code as it was AT DISPATCH**,
   > so it keeps 2:45 for the rest of this season."* ***A GitHub Actions run pins its code at
   > dispatch time***, **so a mid-run fix reaches the next run, never the running one** — which is
   > why the repair had to be a separate sweep afterwards.
   >
   > **All 45 were the same error**: *"**all 45 errors are the same `EVENT_NOT_FOUND`, CONCENTRATED
   > IN WINDOW SNAPSHOTS** — consistent with the early-slate problem, since **a request timestamped
   > after the event expired returns exactly that.**"*
   > 🔑 ***So `EVENT_NOT_FOUND` was never primarily "the board wasn't posted yet" — that is the
   > residue's cause, not the population's.*** **The population's cause was asking TOO LATE, not too
   > early**, and the item's parenthetical describes only the nine that survived the fix.
   >
   > ### ✅ THE REPAIR, and the rule it installed
   > - **29,785 bad rows removed**; **57 post-tip window logs** and **45 error logs** cleared;
   >   the log left holding **4,834 clean entries and zero errors**.
   > - **THE NEW WINDOW RULE** *(in 0 of the thirty, and it is a live scheduling invariant)*:
   >   ***`window` fires at 2:45 PM PT normally, or at FIRST TIP MINUS 2 HOURS when the slate starts
   >   before 3:45 PM PT.***
   > - **Repair result: 5,115 snapshots across 2,560 events** — *up from 4,834 / 2,468*, **and it
   >   picked up events the first pass had skipped entirely.**
   > - **`Zero post-tip windows remain` — the early-slate rule fixed all 57.**
   >
   > ### ✅ RE-TAKEN LIVE 2026-09-22 — the repair HELD, and the event count moved again
   > | | T13's final report | **LIVE 2026-09-22T07:45:45Z** |
   > |---|---|---|
   > | `board_backfill_log` rows | 5,124 | ✅ **5,124** |
   > | `status='ok'` | 5,115 | ✅ **5,115** |
   > | `status='error'` | 9 | ✅ **9** |
   > | distinct `event_id` | **2,560** | 📌 **2,562** |
   >
   > 📌 **Two events have been added since T13's last report** — *consistent with `NBA_GOBLIN_DEMON.md`
   > §0h, where the same fixed historical range grew by 7,913 board rows.* **A dated STATE** *(O9)*,
   > **not a defect.**
   >
   > ### ⚠⚠ AND THE BACKFILL'S OWN COMPLETION TOTALS — **in 0 of the twelve**
   > **`2,468 events · 4,891 snapshots · 25.7M rows · 2,054,220 credits`** — *"within 1% of the
   > 2.07M projection, leaving **~2.95M for MLB and hockey**"*, **through April 12, 2026**, both
   > snapshots per game *(2:45 PM PT window, tip−30 close)*, **9–10 books per game.**
   > 🔴🔴 **A NUMERIC COLLISION THAT WILL MISLEAD A FUTURE READER, recorded so it does not**:
   > ***this `2,468` is the BOARD backfill's event total and is NOT the `2,468` already in this
   > corpus.*** **`nba_market.game_lines_snapshots` holds 2,468 distinct `event_id`** *(§T11.14a,
   > re-verified live 2026-09-22T07:45:45Z)* — **a different table, a different population, the same
   > number**, and **the board figure has since moved to 2,562 while the game-lines figure has not.**
   > ⚠ **Do not treat either as corroborating the other.**
   >
   > ⚠ **Stated at evidence strength and NOT acted on** *(rule 1)*: nothing was re-run or repaired.
   > **The nine remain genuinely unrecoverable** — *"data that doesn't exist rather than data we
   > missed."*

### ✅ WHAT THE SAME KEY GETS EXACTLY RIGHT — **verified live, and the partition closes**
| claim | re-derived 2026-09-21 |
|---|---|
| **`board_backfill_log`: 5,115 snapshots, 9 errors, "0.18% of 5,124"** | ✅ **`status = 'ok'` 5,115 + `status = 'error'` 9 = 5,124 EXACTLY**, and 9 / 5,124 = **0.18%** |
| **boards 27.06M rows, board table 6,602 MB** | ✅ **`reltuples` ≈ 27,059,920, `pg_total_relation_size` 6,604 MB** |
| **`game_lines_closing` all 3 seasons** | ✅ **12,165 rows exactly, 333 distinct game dates** |

⚠⚠ **METHOD NOTE, and it is rule 30 biting in the other direction**: ***`reltuples` is an ESTIMATE,
not a count.*** **`game_lines_closing` estimates 11,768 and counts 12,165 — 3.3% low** — *so the
27.06M above is an estimate and is stated as one; an exact `count(*)` over that table times out at
180 s, which is itself the reason the estimate is the only available figure.*

📌 **Also recorded live, and in 0 of the twelve**: **`credits_used_total` 2,148,300** *(against the
~2.07M estimate)* · **`db_after_index_shrink`: 19 GB (was 23 GB), board table 6,602 MB (was 12 GB),
indexes 1,001 MB (was 5,764 MB), 0 duplicates proven by a unique-index build over 27.06M rows** ·
**`player_game_logs` 26,401 / 26,306 / 26,651** · **`matchups_pergame_pairings` 230,877 / 232,830 /
241,590** · **`weekly_asof`: pt_defend + hustle + clutch, 25 snapshots each, all three seasons.**

## 🔑 OWNER ACTION — **one browser capture is all that stands between Fliff and our own scraper**
> 🔴 **SUPERSEDED BY THE LIVE STATE — recorded 2026-09-21, §T12.4c, and kept below with both dates
> per the chronology rule.** **The section below is T12's state and T12's state is correct for T12**:
> *rule 27 confirms the transcript's LAST word on Fliff is segment 638 — **"fliff = parlayapi"***.
> 🔑 **But `board_sources_decision`, live, says**: ***"fliff: OUR OWN scraper
> (`nba/scrape_fliff_board.py`, NO LOGIN; verified 2026-09-10: 236 markets / 2,434 legs on 5 MLB
> games with full ladders); ParlayAPI fallback. Owner plays Fliff from California."***
> ✅ **And the completion is provably AFTER T12**: ***"236 markets" and "2,434" occur ZERO times in
> the 640 segments of T12*** — **so the owner capture the section below asks for was made, and the
> scraper finished, in a transcript this sweep has not yet reached.** ⚠ **The gap is therefore
> CLOSED in the system and OPEN in the record; the section below stands as the history of how.**
> 📌 **The live key also carries TWO MORE boards the T12 transcript never mentions** — **`betr`**
> *(our own puller, bridge job `betr_board_pull`, owner session token, twice daily; "no aggregator
> carries Betr")* **and `chalkboard`** *(research only)* — ⚠ ***and both are already well documented:
> `betr` is in 10 of the twelve and `chalkboard` in 1, so neither is a discovery*** *(rule 28; "betr"
> in T12 is seven false matches on **`betrivers`**, opened and dismissed)*.
*Recorded 2026-09-21 (T12 pass 2, §T12.3c). **Transcript `2026-09-11-21-01-23`, segment 636.**
Probed against the baseline: every fact below is **0 of the twelve**; the carriers are
`NBA_PROJECT_LOG.md`, `NBA_COMPASS.md` and `scrape_fliff_board.py`.*

**Fliff's web app WAS reverse-engineered, and the work stopped one step short.** **What is known**:
**`POST app.getfliff.com/api/v1/sports_book_public/`** with a **`sports_book` request envelope** ·
**version `5.0.34` / cap `285`** · a **location token** · **feed-sync codes `3055` / `3056` /
`3062`** · **data hosts `m-c*.app.getfliff.com` and pubnub** · ***"reachable without login but
UNFINISHED."***

🔴 ***THE DECISION RESTS ON ONE OWNER ACTION, stated verbatim***: **"parlayapi stays the fliff source
UNLESS the owner captures one `sports_book_public` curl."**
🔑 **And the precedent says it works**: ***the identical ask — a single "copy as curl" from the
owner's browser — is what unblocked UNDERDOG*** after two blind probe rounds tripped Cloudflare
*(`NBA_SYSTEM_ARCHITECTURE.md` §0f)*. **Underdog is now our own scraper at 854 lines; Fliff is still
ParlayAPI.**
⚠ **Why it matters beyond one board**: **ParlayAPI is the source for Fliff alone now**, and the same
diff that chose the other three found ParlayAPI **drops ~25% of PrizePicks' ladder rungs, lags ~55
minutes, and misses Underdog's team markets and inning pills** — ***so the one board still served by
ParlayAPI is served by the source every other comparison rejected.*** **Stated at evidence strength:
no same-moment diff of FLIFF against its own API has been run, because the scraper is unfinished —
whether ParlayAPI's Fliff feed has the same defects is NOT RECORDED.**
📌 **A dated STATE, not a verdict** *(O9)*: **T13–T20 are unswept, and this is exactly the kind of
item a later transcript closes.**

## 🔴🔴 THE 05:30Z OVERNIGHT VERIFICATION — **and it CONFIRMS the scrape-vs-load gap rather than closing it**
*Recorded 2026-09-21 (T12 pass 1, §T12.2b). **Transcript `2026-09-11-21-01-23`, tail segment 617** —
a patch into `NBA_PROJECT_LOG.md`, quoted whole.*

> *"**overnight jobs — verified 05:30Z**: injury report **2025-26 = 176/176 days, 919,949 rows, 7
> shards**; **2024-25 = 174 days, 418,071 rows, 7 shards** (fewer intra-day re-publishes that season
> — spot-check per month); **starters 2023-24 = 32,328 rows, 1,228/1,230** — *timeouts on
> `0022300079`, `0022300721` — rerun*; **officials 2023-24 = 3,690 rows, 1,230/1,230**. **Every
> enrichment factor now has its two-season backfill** (except the boards, waiting on the Odds API
> upgrade). Status snapshot in config `enrichment_backfill_status_2026_09_10`."*

✅ **This answers three items queued for T12 at T11's close**: **the `enrichment_backfill_status_2026_09_10`
key at 05:30Z**, **the two 2023-24 starter-status game timeouts — now named: `0022300079` and
`0022300721`** *(also on file in `TRIGGER_NBA_PERGAME_BACKFILL.txt`)*, **and the completion state of
the overnight queue.**

🔴🔴 **AND READ AGAINST THE DATABASE IT SHARPENS T11's FIRST STANDING GAP RATHER THAN CLOSING IT.**
***The transcript records the 2023-24 SCRAPE as complete — starters 32,328 rows, officials 3,690 rows
— and the database holds NONE of it***: `[LIVE-AUDIT]` **2026-09-21, by `game_id` season code,
`nba_stats.player_game_starter_status` and `nba_stats.game_officials` each hold season `25` ONLY**
*(1,230 games / 32,179 rows and 1,227 / 3,681 respectively)*. 🔑 ***So "every enrichment factor now
has its two-season backfill" is TRUE OF THE REPOSITORY and not of Postgres*** — **exactly the
distinction §T11.31b draws, now with the scrape's own row counts on the other side of it.** ⚠ **The
fix did NOT appear in T12; a dated STATE, not a verdict** *(O9)* — **T13–T20 are unswept.**
⚠ *Do not conflate the near-identical magnitudes: officials **3,690** is the 2023-24 SCRAPE, officials
**3,681** is the loaded 2025-26 table. Different seasons.*

### 📌 The third injury-report bug — **the one that produced a JOB-LESS RUN**
*Tail segment 568. T11 recorded two of the three; this is the first.*
**The injury-report backfill hit three real bugs in sequence:** **(a)** 🔴 ***a YAML step name with
unquoted colons produced a JOB-LESS RUN*** — **1 of thirty (`NBA_PROJECT_LOG.md`), 0 of the twelve**
· **(b)** `pdfplumber` on the runner drops intra-cell spaces → space-insensitive team regex,
camel-case splitter, tolerant headers *(**3 of the twelve** — recorded at T11 §T11.2)* · **(c)**
before ~2025-12-22 the archive uses an hourly filename with no minutes and the true publish time is
in the PDF header → probe both patterns, snapshot timestamp from the header, **md5 dedupe of
re-published identical documents** *(recorded at T11)*.
🔑 ***So the bug family is documented in the twelve for two of three, and the third — a workflow that
silently produced no job at all — is in none.*** **Also from the same segment, not in the twelve**:
the single-season injury file **hit 98 MB → monthly shards + index**, and the workflow **self-loops
in 30-day chunks with commits**.

## 🔴 THE MEASUREMENT THAT CHOSE EVERY LIVE BOARD SOURCE — **in none of the twelve until now**
*Recorded 2026-09-21 (T12 pass 0, §T12.1d/e). **Transcript `2026-09-11-21-01-23`, segments 49, 90,
91, 98.** The decision is on file; the evidence behind it was not.*

**The owner asked for it, segment 49, verbatim**: *"on parlay api we need to get all 4 so, **sleeper,
fliff, underdog** and as for prizepicks, i want you to **probe one day of prizepicks on parlay api,
compare to the prizepicks scraper**, of course mlb, just to compare the dataset. i want to know if
they are **exactly the same, complete the same way, all legs, all ladder variations, all
goblin/demon/regular information**, to decide which way to go with pp for nba."*

**It was run — same MLB slate, four minutes apart** *(our scraper 03:15:03Z, ParlayAPI 03:18:46Z)*:

| | our scraper (raw PrizePicks API) | ParlayAPI |
|---|---|---|
| **pre-game legs** | **1,729** | **1,353** |
| **demon / goblin / standard** | **1,379 / 277 / 73** | **1,092 / 199 / 62** |
| **distinct players** | **93** | **104** |
| **exact leg matches** *(player + stat + line + type)* | **1,012** | |
| **only in ours** | **717** — *287 the same player/stat/type at a **different rung**, 430 absent entirely* | |
| **only in ParlayAPI** | | **341** |

🔑 **THE THREE MECHANISMS — these are what make the numbers decision-relevant, and none was on file:**
1. 🔴 **ParlayAPI DROPS LADDER RUNGS — roughly a quarter of the board, and *"it's the rungs closest to
   the standard line, which are exactly the ones a slip engine uses."*** *Examples from the diff:
   Nick Martinez strikeouts — ours carries demons at **4.5 and 5.5**, ParlayAPI only **6.5**;
   total-bases demons at **3.5 and 4.5** for a dozen hitters, ParlayAPI only **5.5 or 7.5**.*
2. 🔴 **ParlayAPI LAGS**: its PrizePicks rows carried **`age_seconds ≈ 3,300` — about 55 minutes
   stale** — while our scraper reads the API directly.
3. ✅ **The 341 ParlayAPI-only legs are LIVE IN-GAME micro-markets** *(1st/2nd/3rd-inning pitches
   seen, balls counted)* **from a game already in progress**, and **our scraper deliberately excludes
   live props via `single_stat=true`** — ***so that column is a SCOPE difference, not a coverage
   deficit, and reading it as a deficit would invert the finding.***

✅ **Same stat taxonomy on both sides** — *no stat we track was missing from either* — and **both
carry the same `standard`/`goblin`/`demon` labels**; ⚠ **player-name normalisation (accents, "Jr.")
is the join hazard.**

**THE DECISION, segment 91**: ***"prizepicks comes from our own scraper (raw api: complete ladders,
all three odds types, board time), fresh — the same producer we run for mlb, pointed at
`league_id=7`. **parlayapi stays as the source for underdog, sleeper and fliff and as a prizepicks
FALLBACK ONLY**."*** **Recorded to config key `board_sources_decision`** *(segment 98)*, *"and the
comparison job stays in the bridge so the same test can be rerun."*

### 🔴 What the documents carried before this entry
*Probed against the baseline `c5798146` with positive controls (`board_backfill_odds_api` 3,
`league_id=7` 11) and every hit opened — rules 20, 22, 26, 28.*

| | carriers |
|---|---|
| ✅ the diff's **headline** | **`NBA_PROJECT_LOG.md`, ONE line** — *"1,729 legs vs ParlayAPI 1,353 — ParlayAPI drops ~25% of ladder rungs nearest the standard line and lags ~55 min → ours"* — **1 of thirty, 0 of the TWELVE** |
| ✅ the **decision** | **`board_sources_decision` in 4 of thirty**, this document included — ⚠ **but quoted only for its `historical_boards` sub-key**, not for the live-board decision |
| 🔴 **in NO document** *(0 of thirty)* | **1,012 / 717 / 341** · **1,379 / 277 / 73** · **`age_seconds ≈ 3,300`** · **the live-micro-market explanation** · ***"fallback only"*** |

⚠ *The 717 and 341 hits elsewhere in the corpus are `backtest/reports/` classification figures —
**opened and dismissed, different subjects.***

⚠⚠ **CARRIED FORWARD, NOT CONCLUDED** *(rule 27 — this is segment 91 of 640)*: segment 91 also
commits to ***"the same same-moment diff for **underdog and sleeper** against their own public apis
before opening day, so every board's source is chosen on evidence, not assumption."*** **Whether it
was run is NOT RECORDED as of this pass, and the LAST word in T12 must be read before any verdict.**

## 📌 THE UNDERDOG SCRAPER'S PROXY DEPENDENCY — **implemented, and in none of the twelve**
*Recorded 2026-09-21 (T12 pass 0, §T12.1f). Owner, segment 135, whole: **"for underdog, would a
proxy help? the mlb pp has a proxy information that can be used."***

**It is in the code**: **`scrape_underdog_board.py` documents `PROXY_URL` as an environment fallback**
*(alongside `UNDERDOG_PXID`, `UNDERDOG_STATE_CONFIG`, `UNDERDOG_CLIENT_VERSION`)*, and **two
dedicated probes exist** — **`probe_underdog2.py`** *("through the residential proxy, vary HTTP
version / client headers / endpoints to find a working combo")* and **`probe_underdog4.py`**
*("proxy-only, spaced requests, ranked variants to reach the PRE-GAME board")*.
🔴 ***The dependency is in ZERO of the twelve*** — **so a reader of the mandated documents would not
know the Underdog board may require a residential proxy to reach at all.** ⚠ *(A prose hit in
`backtest/classification_ladder_v12.py` — "invisible to a proxy this noisy" — is an unrelated sense
of the word; opened and dismissed.)* **A dated STATE, not a verdict** *(O9)*: **T13–T20 are unswept.**

## 🔴 THE FACTOR-RELEVANCE GATE KNOWS 4 OF 36 ENRICHMENT FACTORS — AND TWO FACTORS CANNOT BE BACKFILLED AT ALL
*Recorded 2026-09-21 (T10 pass 6, §T10.6a / §T10.6c). `[LIVE-AUDIT]`.*

**`nba_config.factor_relevance` is described as a gate that runs before tier logic — factor × prop →
full/partial/none.** `NBA_DATABASE.md` already records two things about it: **`none` is specified and
never written**, so *"as a filter the table currently excludes nothing"*, and *"0 of 460 `factor_key`
values are orphaned against `factor_registry`"*.

🔴 **That orphan check is the relevance → registry direction. The other direction, live:**

| Layer | Registry rows | Has a relevance row | **No relevance row** |
|---|---|---|---|
| baseline | 31 | **25** | **6** |
| **enrichment** | **36** | **4** | **32** |
| **Total** | **67** | **29** | **38** |

✅ **25 + 4 = 29 · 6 + 32 = 38 · 29 + 38 = 67.** **The matrix was seeded against the 29-factor
registry in T8 and never extended when the registry grew to 67** — so it knows **4 of the 36
enrichment factors**, which is the layer this transcript exists to build.

⚠ **Read the two findings together: a filter that filters nothing, over a set it half knows.**

### 🔴 THE PARITY DOCUMENT'S LIVE-ONLY EXAMPLE IS SUPERSEDED AND WAS NEVER UPDATED — *§T10.9a*

`NBA_DAILY_PARITY_AND_BACKFILL.md` §3 defines the category the registry implements:

> *"**(b) Live-only** — the value was never archived and only exists going forward (e.g. **game-day
> referee assignments**, which are posted hours before tip and not retained)… either **exclude the
> factor from historical training**, or use a clearly labelled proxy… **Mixing (b) into training as if
> it were (a) is exactly the leak this document exists to prevent.**"*

🔴 **But `referee_assignment` and `referee_crew` are `phase1_baseline` in `factor_registry`, not
live-only — and the reclassification is recorded**, in `NBA_PROJECT_LOG.md` line 739: *"Referee
assignments post in the morning → **baseline stage** (correcting my earlier 'target-only' framing: the
box-score crew is a faithful reconstruction of what was knowable)."*

⚠ **The parity document still carries the superseded example and mentions neither `compute_stage`, nor
"baseline stage", nor the correction.** ***The document written to prevent the leak is the one holding
the stale example.*** 📌 **Not edited by this sweep** — it is not one of the twelve, and the standing
treatment for a non-mandated document (§T2.18a) is to record against it rather than rewrite it.

🔑 **OWNER DECISION** — update §3's example to one that is actually live-only *(the registry offers
two: `lineups_confirmed`, `overtime_pace_live`)*, or record the referee reclassification in the parity
document itself. **A documentation edit outside the twelve; this sweep does not make it.**

### 📌 AND TWO FACTORS ARE LIVE-ONLY — *§T10.6c, narrowed §T10.9a, **corrected §T10.12a***
*(⚠ **This item was first written as an unmet backfill obligation. It is not one.** The **category**
is documented — `NBA_DAILY_PARITY_AND_BACKFILL.md` §3 above — and the two factors' **subjects** are
documented in up to **seven** documents, **four of them mandated** *(only the snake_case keys return
zero, which was a probe on the wording rather than the substance)*. 🔑 **And the registry's own notes
settle the obligation question**: `lineups_confirmed` is *"DELTA vs P(start) **[superseded by
`lineup_change` in pass 1 2026-09-09]**"* and `overtime_pace_live` is *"**Mostly absorbed by
`market_spread_delta` / `market_total_delta`**; kept for 2H/4Q OT-inclusive lines"* — **all three
replacements are in the registry and mined.** ***The live-only stage is the residue of two folded-in
factors.*** ✅ **What remains worth recording: that reasoning lives in `research_notes` and in none of
the twelve**, so a reader of the mandated documents finds the subjects and not the supersession.)*

`factor_registry.compute_stage` partitions the enrichment layer **15 phase-1 · 17 phase-2 · 2
live-only · 2 not-mined** *(recorded in `NBA_PROJECT_LOG.md` 739; **confirmed live to the row**, and
**15 + 17 + 2 + 2 = 36**, + 31 baseline = **67**; the column is NULL on every baseline row)*.

📌 **Two factors carry `live_only_excluded_from_history` — `lineups_confirmed` and
`overtime_pace_live`.** *(⚠ **Corrected 2026-09-21, §T10.12a.** This first read *"appear in NO document
at all"* and framed them as an unmet obligation against the owner's *"a fallback… for all the factors,
every single factor."* **Both halves were wrong**: only the snake_case keys return zero — the subjects
appear in up to **seven** documents, **four mandated** — and **the registry annotates one *"superseded
by `lineup_change`"* and the other *"mostly absorbed by `market_spread_delta` / `market_total_delta`"*,
with all three replacements mined.*** **The live-only stage is the residue of two folded-in factors.**)*
✅ **What remains**: that supersession reasoning lives in `research_notes` and **in none of the
twelve**, and 📌 **`compute_stage` itself appears in none of the twelve.**

🔑 **AND THE GAP HAS A TIMESTAMP — added 2026-09-21, §T10.8a.** All UTC: **`factor_relevance` was last
written 2026-09-09 01:52:03**; the registry arrived in **two batches — 28 rows at 01:xx and 39 rows at
21:xx** (max 21:40:33). **The split is exact: all 28 batch-1 factors have a relevance row; of the 39
batch-2 factors exactly one does — `market_spread_delta` — and 38 do not.** *(28 + 1 = 29 mapped;
29 + 38 = 67.)* ⚠ **So this is not a design choice — it is a maintenance boundary twenty hours wide.**
📌 *It also reconciles the record's "seeded at 29": `market_spread_delta` is what a row **seeded at
01:xx and later edited** looks like. Stated as the supported reading, not as proof — `updated_at`
cannot distinguish "inserted later" from "updated later."*

🔑 **OWNER DECISION** — **(a)** should `factor_relevance` be extended to the 38 unmapped factors, or is
a missing row meant to read as "not relevant"? *Today the two are indistinguishable.* **(b)** do
`lineups_confirmed` and `overtime_pace_live` need a derived fallback for history, or are they accepted
as live-only? **Both are writes or design decisions this sweep does not make.**

---

## ❌❌ ~~THE SCHEDULED TASK IS DELIBERATELY NOT DEPLOYED, AND NO DOCUMENT SAYS SO — OWNER DECISION O7~~ — **RETRACTED IN FULL, 2026-09-21 (T10 pass 18, §T10.18a)**

> 🔴 **RETRACTED ONE PASS AFTER IT WAS WRITTEN. O7 IS NOT AN OPEN ITEM AND WAS NEVER ONE.**
>
> **The decision is recorded in four documents, and one of them names the artefact:**
> - **`NBA_OPEN_ITEMS.md` — this very document**, below: *"**P2: NO CRON YET — deliberately.** The
>   NBA season opens in October; until real games exist there is nothing for this to mine… **The cron
>   goes in when the season starts** (target: daily 09:00 UTC…)"*, with **P3's target string too**,
>   and the explicit verdict ***"So this is not a gap — it is a dated action item… adding them is the
>   owner's step, not a design question."***
> - **`NBA_PROJECT_LOG.md` line 478** — *"`nba-baseline.yml` (**manual trigger only — cron OFF per
>   owner**)"*. ***That names the step O7 claimed was NOT RECORDED.***
> - **`NBA_COMPASS.md` line 56** — *"**Cron for the ladder build is OFF by owner decision until near
>   the season.**"*
> - **`NBA_DEEP_DOCUMENTATION_CHECKPOINT_2026-09-09.md` line 20** — *"cron intentionally OFF"*.
>
> **Nothing of substance survives.** The T10 turn adds only that the owner expected to trigger it via
> **Claude Coworker** — which is already the documented operating model in **4 of the twelve** — and
> that *"everything needed to be done up to that point"* was to be finished.
>
> 🔑 **How it failed, exactly**: O7's six "differently-worded" probes were `not deploy` ·
> `deployment deferred` · `scheduled task` near `season` · `closer to the season` ·
> `deploy … later|opener` · `everything needed … up to that point`. ***Every one of them is T10's
> vocabulary. Not one was the DOCUMENTS' vocabulary — `cron`, `OFF`, `intentionally`, `manual trigger
> only`.*** **That is §T10.12b's cause verbatim: probing the identifier this sweep happened to be
> holding rather than the thing it names** — the **fifth** absence failure on this transcript, and it
> occurred in the pass that wrote **rule 19** about handling owner turns carefully.
>
> ⚠ **The one thing worth keeping from the episode is in the entry below, and it is not this**: that
> P2/P3 cron entry dates itself to **2026-10-03**, which this sweep has since corrected to
> **2026-10-20** — see §T10.18b.

*~~Found 2026-09-21, T10 pass 17 (§T10.17b).~~ Superseded by §T10.18a. Kept, not deleted, because
the failure mode is the record's most valuable part.*

**The owner's instruction, T10 turn 73, verbatim:**

> *"**Let's not deploy the scheduled task just for now, because I'll very likely do it via Claude
> coworker, but just closer to the season beginning, so do everything needed to be done up to that
> point and just the scheduled task we do later.** One important single, is understand the behavior on
> the first days of the season, how it behaves, how it holds and understand if there is a reliable and
> safe pattern on season beginnings to work with"*

🔴 **The second half — the season-beginning research directive — is recorded in
`NBA_MASTER_SUMMARY.md` and drove §T10.1a's season-opening bias finding. The first half is recorded
nowhere in any of the thirty documents.**

**What is therefore undocumented:**

1. **A production step is deliberately un-deployed.** Not blocked, not forgotten, not failed —
   **deferred by decision.**
2. **The deferral has a deadline**: *"closer to the season beginning"*, against an opener of
   **2026-10-20**.
3. **The owner named the mechanism**: *"very likely do it via Claude coworker"* — **not a Cloudflare
   cron trigger**, which is what a reader of `NBA_WORKERS.md`'s four-place registration pattern would
   assume.
4. **Everything else was to be finished**: *"do everything needed to be done up to that point"* —
   **so the absence of the scheduled task is not evidence that anything upstream is incomplete.**

**Absence verified** with six differently-worded probes across all thirty documents and against the
pre-sweep tree (`d29401bd`): `not deploy` / `deployment deferred` · `scheduled task` near `season` ·
`closer to the season` · `deploy … later | at season start | opener` · `Coworker … deploy|schedule` ·
`everything needed … up to that point`. **Every relevant hit is about something else** (worker
registration in `NBA_WORKERS.md`; the `run_job` target-enum lag in `NBA_COMPASS.md`).

⚠ **Why this matters beyond the omission**: these documents describe the three pipelines (P1 weekly
static, P2 overnight heavy, P3 afternoon live) **with their schedules**, and a reader finding no
scheduled task in the deployed state has no way to tell **"not built"** from **"built and held
back."** *Which of the two it is changes what must happen before 2026-10-20 completely.*

📌 **OWNER DECISION O7 — two questions:**
- **Which step is it?** The turn says *"the scheduled task"*, singular and definite, and **the
  transcript does not name it.** *Stated narrowly: this sweep can record that one exists and is
  deferred; it cannot say which without material from a later transcript.* **NOT RECORDED.**
- **Is it still deferred?** T10 is **2026-09-10**; the sweep has reached neither T11 nor T20, and a
  later session may have deployed it. **Chronology governs — not checked live, not assumed.**

*Not fixed, and deliberately not probed against the live system: "document, don't fix", and a
deployment question is precisely the class this sweep is read-only about.*

---

> ## ⚠⚠ STANDING BANNER FOR THE FOUR GAPS BELOW — *owner instruction, 2026-09-21*
> ***"Fixes can show up later on the other transcripts, so we don't treat anything now."***
>
> **Every `[LIVE-AUDIT]` gap in this group is a STATE, not a verdict.** *This sweep has read T1–T11
> of twenty; **T12–T20 are unswept, and a fix would be recorded there***. **So read each of these as
> *"this is what the database holds as of 2026-09-21"*, never as *"this is broken"* or *"this is
> still open."*** **None is to be chased, fixed or escalated** — **the sweep finds the resolution
> chronologically or not at all.** **The four**: ***the officials/starters loads*** *(§T11.31b)* ·
> ***the missing season-tables writer family*** *(§T11.37a)* · ***`nba_daily.injury_report_snapshots`***
> *(§T11.36a)* · ***`triple_double`'s zero rows*** *(§T11.28b)*.

## 🔴🔴 THE TWO-HOP ARCHITECTURE'S SECOND HOP WAS NEVER BUILT FOR A WHOLE FAMILY
*Found 2026-09-21, T11 pass 36 (§T11.37a). **`[LIVE-AUDIT]`, 0 of thirty, positive-controlled.
This generalises §T11.36a from one table to a family, and it is the REASON the matrix's marks
describe files.***

**The architecture is documented in SEVEN of the twelve** — *"each scraper writes its output as JSON
to `nba/data/*.json`, committed by the workflow; **the corresponding Postgres-writer Worker then reads
that committed JSON** and upserts it"* — and `NBA_WORKERS.md` §1 states it as the pattern:
***"CLOUDFLARE WORKERS — Postgres writers. Pattern: read the GitHub-committed JSON → upsert into
Postgres."***

🔴🔴 **`nba_config.worker_definitions` holds 21 writers, all `enabled = 1`, and NONE of them covers:**

| scraper *(named in the twelve)* | its output in `nba/data/` | writer | Postgres table |
|---|---|---|---|
| `scrape_nba_season_tables.py` — *"weekly as-of tables: pt_defend, hustle, clutch, coaches"* | `nba_pt_defend_*` · `nba_hustle_*` · `nba_clutch_*` (**plain AND `_asof_` weekly**) · `nba_preseason_logs_*` · `nba_coaches_*` — **3 seasons each** | 🔴 **none** | 🔴 **none** |
| `scrape_nba_matchups_pergame.py` — *"matchup shards, feeds M1"* | `nba_matchups_pergame_*` — **3 seasons × 7 monthly shards** | 🔴 **none** | 🔴 **none** |
| `scrape_nba_periods.py` — *"quarter/half splits"* | `nba_player_game_log_q1…q4_*` — **12 files** | 🔴 **none** | 🔴 **none** |
| `scrape_nba_injury_report.py` | 14 monthly shards, **1,338,020 timestamps** | 🔴 **none** | 🔴 **none** *(§T11.36a)* |

### 🔴 NARROWED 2026-09-21 by §T11.56b — *tested by OUTPUT PATH, one of the four is PARTIALLY covered*
*The table above was built by NAME. **Pass 55 re-tested it by the thing that actually matters — the
JSON filename each scraper writes and each worker reads** (§T11.20a's shape: a four-item claim
resting on one lookup style).*

**The four scrapers write EIGHT output families. Seven are referenced by ZERO of the 21 workers.**
🔴 ***The eighth is not***: **`scrape_nba_matchups_pergame.py` also writes
`nba_team_game_log_{slug}.json`, and `alphadog-v2-nba-static-backfill.js` READS it** —
```js
const r = await fetchFromGithubRaw(env, `nba/data/nba_team_game_log_${slug}.json`, …);   // line 249
const r = await fetchFromGithubRaw(env, `nba/data/nba_team_game_log_advanced_${slug}.json`, …); // 259
```
⚠ ***Its `nba_matchups_pergame_{slug}_index.json` output is still read by nothing.*** **So that
scraper SPLITS across the line rather than sitting outside it.**

🔑🔑 **AND THE DATABASE MAKES THE SPLIT EXACT** *(`[LIVE-AUDIT]` 2026-09-21, `SELECT` only)*:
**`nba_team.team_game_log` holds 7,380 rows across 3,690 games — complete for three seasons** *(the
loaded half)* — while ***no table whose name contains `matchup`, `period`, `injury`, `coach`,
`clutch` or `hustle` exists in ANY `nba*` schema*** *(the unloaded half; `information_schema`, zero
rows returned)*.

✅ ***So the finding is stronger in its corrected form than in its original one***: **a scraper output
either has a registered loader AND a populated table, or it has NEITHER** — **the two-hop
architecture's second hop is missing for seven of eight output families, and the one exception proves
the pattern rather than breaking it.** ⚠ **Stated as a dated STATE, not a verdict** *(O9)*: **this is
what the repository and the database hold on 2026-09-21; T12–T20 are unswept.**

**The 21 that DO exist**: 15 `01 Static` *(arenas · darko · lineups · officials · onoff · player-bio ·
players · player-tracking · playtypes · schedule · shotquality · teams · team-stats · tracking-detail ·
weekly-differential)* · 4 `02 Historical` *(backfill · game-officials · measure-types ·
starter-status)* · 1 `03 Delta` · 1 `nba_baseline`.

⚠⚠ **SO THE MATRIX'S MARKS DESCRIBE FILES.** ***`m3` hustle, `m4` clutch and `b4`'s pt_defend are
marked ⏳ "weekly as-of snapshots ✓ 25 per season"; `a8` preseason and `k1` coaches are marked ✓ across
all three seasons. All of that is true OF THE REPO. None of it is in Postgres, and nothing reading
Postgres can see any of it.***

### ✅ And the counterpart bounds §T11.31b — the gap is NOT systemic
**Where a writer exists, the loads are complete, with exactly two exceptions.** *Live, by `game_id`
prefix:*

| table | 2023-24 | 2024-25 | 2025-26 |
|---|---|---|---|
| `player_game_log` · `_advanced` · `_scoring` · `_usage` | **26,401** | **26,306** | **26,651** *(all four tables identical per season; **79,358 total**, matching the documented figure)* |
| `team_game_log_advanced` · `_four_factors` · `_scoring` | **2,460** | **2,460** | **2,460** *(= 1,230 × 2)* |
| 🔴 `game_officials` | — | — | **3,681** |
| 🔴 `player_game_starter_status` | — | — | **32,179** |

✅ **COMPLETED 2026-09-21 by §T11.45c — the bound is now EXHAUSTIVE over the whole class.**
***`information_schema` gives exactly TEN game-keyed tables in `nba_stats` + `nba_team`; the table
above listed NINE.*** **The omitted one is `nba_team.team_game_log`** *(it carries a `season` column
and so fell outside the prefix census)* — **checked: 2,460 rows per season × 3 = 7,380, 3,690 distinct
games, COMPLETE.**

🔑 ***So: of the TEN game-keyed tables, EIGHT hold all three seasons and exactly TWO hold one*** —
`game_officials` and `player_game_starter_status`. **The answer to *"is the repo systematically ahead
of the database?"* is NO, and it is now proven over the class rather than inferred from part of it:
where a writer exists the load is complete except in two cases, and where no writer exists there is no
table at all.** ⚠ *The original wording drew "not systemic" from a class it had not enumerated —
**rule 25's shape extended from samples to CLASSES: a BOUND states the class it was drawn over.***

---

## 🔴🔴 THE INJURY ARCHIVE HAS NO POSTGRES TABLE — its documented destination was never created
*Found 2026-09-21, T11 pass 35 (§T11.36a). **`[LIVE-AUDIT]`. The scrape-vs-load class at its largest
scale: not "the load was never run" but "the destination does not exist."***

**Two facts, each already on file, and the join between them is in 0 of thirty:**

| | |
|---|---|
| `NBA_DATABASE.md` *(one of the twelve)* | *"**SIX OF THE FOURTEEN SCHEMAS HOLD ZERO TABLES** — VERIFIED: `nba_archive`, `nba_backtest`, `nba_classification`, `nba_context`, **`nba_daily`**, `nba_scoring` — all empty."* |
| `NBA_ENRICHMENT_MINING_AND_FALLBACKS.md` *(outside the twelve)* | **Build item #1**: *"`scrape_nba_injury_report.py` (daily + backfill modes, pdfplumber) **+ loader → `nba_daily.injury_report_snapshots`** — unlocks **A1, N1, N2, A4 truth, A6, B4**; day-before report into the baseline builder."* |

🔴🔴 **`nba_daily.injury_report_snapshots` does not exist. `nba_daily` holds zero tables**
*(re-verified live)*. ***So the injury archive — `[LIVE-AUDIT]` 1,338,020 snapshot timestamps across
14 monthly shards, 919,949 for 2025-26 and 418,071 for 2024-25 (§T11.3c), the largest data asset T11
produced — lives only as JSON in the repo, and the factor group it unlocks is the matrix's largest ⏳
group.***

⚠ **Neither document is wrong; nobody has joined them.** *The twelve say the schema is empty; a
document outside them says a loader should fill it; **no document says the archive therefore has
nowhere to land.*** **WHY the table was never created is NOT RECORDED** (rule 6) — *built-and-pending,
deferred, or superseded by reading the JSON directly are all consistent with what is observable.*

📌 **And the control plane cannot answer it**: `nba_control.job_runs` and `worker_run_log` are
**both 0 rows** — *already recorded in **five** of the twelve, verified three ways at T1 pass 68,
with the string `nba_control` appearing in **no non-markdown file in the repo** while 21 workers are
registered and enabled*. ***There is no run history for any worker, so "was the loader ever run" is
unanswerable from inside the database for every finding of this class.***

---

## 🔴🔴 THE SCRAPE IS THREE SEASONS AND THE LOAD IS ONE — `game_officials` and `player_game_starter_status`
*Found 2026-09-21, T11 pass 30 (§T11.31b). **`[LIVE-AUDIT]`, and the second instance of a shape this
sweep has already recorded once.***

**T11 segment 613 — a live index check inside the transcript — reports both 2024-25 runs COMPLETE:**
> *`nba_starter_status_2024_25 meta`: **`games_input 1230, games_succeeded 1230, row_count 32515`***
> *`nba_game_officials_2024_25 meta`: **`games_input 1230, games_succeeded 1230, row_count 3691`***

**And `nba/data/` holds all three seasons of both, committed:** `nba_game_officials_2023_24.json`
(585,960 B) · `_2024_25.json` (586,196 B) · `_2025_26.json` (584,907 B); `nba_starter_status_2023_24`
/ `_2024_25` / `_2025_26.json` (4.86 / 4.88 / 4.82 MB).

🔴🔴 **Postgres holds ONE season of each** *(live, joined to `nba_calendar.games.season` — the
system's own authority, not the id prefix)*:

| table | seasons in `nba/data/` | seasons in Postgres | games | rows |
|---|---|---|---|---|
| `nba_stats.game_officials` | **3** | 🔴 **1 — 2025-26 only** | **1,227** ✅ *(see below — NOT a gap)* | **3,681** |
| `nba_stats.player_game_starter_status` | **3** | 🔴 **1 — 2025-26 only** | 1,230 | **32,179** *(12,300 starters, **10.000/game**)* |

❌ **CORRECTED 2026-09-21 by §T11.32a, one pass later — the "1,227 of 1,230, three short" above
implied a gap and there is none.** `nba_game_officials_2025_26_meta.json` records
**`games_covered: 1227`, `row_count: 3681`** — ***which Postgres matches TO THE ROW*** — plus
`known_empty_games: [0022500259, 0022500260, 0022500261]`, a `patch_applied` block showing all three
retried with **`games_recovered: 0`** and `zero_officials_parsed_v3`, and the note
*"`bug_fixed`: main loop checked `'rows is not None'` instead of truthiness."* **All of it is already
in FIVE of the twelve** — §T6.19a resolves the three to **2025-11-19 (WAS @ MIN, DEN @ NOP,
SAC @ OKC), all Final, 9 games that night and 6 with officials**, and states *"this is not scraper
attrition — they still failed after the bug was fixed."* ***Rule 14: a discrepancy you are about to
record may already be on file.***

✅ **AND THE CORRECTION STRENGTHENS WHAT REMAINS.** ***Because 2025-26's load matches its JSON exactly,
the loader demonstrably WORKS*** — so the finding is not *"loads are unreliable"* but the sharper
***the loader has simply never been run for 2024-25 or 2023-24***, whose rows sit in the repo.
📌 **And `scrape_nba_game_officials.py` writes JSON only** — no `INSERT`, no `psycopg`, no
`DATABASE_URL` — **so scrape and load are two workers by design**, which is why a complete scrape says
nothing about the table.

❌ **LINEAGE CORRECTED 2026-09-21 by §T11.34a.** ~~*"§T11.1b's shape in a second worker"*~~ — **the
exact precedent is §T3.8a, which is in THREE of the twelve**: ***"82 play-type rows scraped but never
loaded — 3,364 vs 3,282"***, with the diagnosis that matters here — ***"it escaped notice because the
scrape count and the load count were reported separately."*** **That is precisely how this escaped
notice too.** *§T11.1b is a different failure: a parser bug where the rows were never produced.*
***So this is the THIRD and by far the largest instance of a class the sweep had already named — two
entire seasons against 82 rows — and naming it correctly is what makes it a pattern rather than an
anecdote.***

✅ **AND THE ADVERSARIAL CHECK RULED OUT THE OBVIOUS INNOCENT EXPLANATION.** `NBA_MASTER_SUMMARY.md`
records that ***"thirty-seven of forty NBA data tables can hold exactly one season at a time"*** — so
the natural counter-hypothesis is that these two are single-season by construction and the absence is
by design. **It fails on the primary key**: `nba_stats.game_officials` is **`(game_id, official_id)`**
and `player_game_starter_status` is **`(player_id, game_id)`**, and **`game_id` encodes the season**
(`0022400…` vs `0022500…`), **so both tables can hold all three seasons at once.** 🔑 **Internal
control**: **`nba_stats.player_game_log` has the same key shape — `(player_id, game_id)` — and holds
79,358 player-games across THREE seasons.** ***The shape permits multi-season, one sibling uses it,
these two do not.***

📌 **And the corpus already says so, outside the twelve**: `NBA_ENRICHMENT_FACTOR_LOCK.md` —
*"our `nba_stats.game_officials` (**2025-26 built**) + **backfill 2023-24/2024-25 via
`boxscoresummaryv3`**"* — **1 of thirty, 0 of the twelve.** *§T11.2d's pattern again.*

🔑 ***The shape, stated correctly***: **a scrape that reports complete success while the database
receives none of it** — *and the scrape count and the load count are reported separately, which is
what lets it pass unnoticed.* *There it was a parser bug
(`pdfplumber` on the runner) and the rows were never produced; here the rows EXIST, in the repo, and
did not reach the table.* ⚠ **WHY is NOT RECORDED** (rule 6) — load never run, run and rolled back, or
loaded and later replaced are all consistent with what is observable.

⚠ **AND IT RE-DATES THE MATRIX.** The factor × season matrix marks **`a5`** ✓/⏳/🔧 and **`d1`**
✓/⏳/🔧 — ***those marks describe the SCRAPE.*** **By the database, both are one season.** *Anything
that reads these tables for 2024-25 or 2023-24 gets nothing, silently.*

📌 **And §T11.12's `12,300 = 10 × 1,230` is re-verified EXACT** — `is_starter = 1`, 10.000 per game —
⚠ **with a population the entry did not state: 2025-26 alone** *(rule 23)*.

---

## 📌 T11's CLOSING SUMMARY — **segment 711, and it names the four open items**
*T11 pass 30 (§T11.31a). **Three segments from the end of 712** — the transcript's own final word,
against §T11.24a's matrix at segment 112.*

> *"**overnight queue — set so it finishes without me**: injury report 2025-26 final chunk **running**;
> **injury report 2024-25 queued right behind it**, and the workflow now **loops on its own 30-day
> chunks, committing after each** until the season is complete — no manual re-triggers overnight;
> **starters + officials 2023-24 running**. ***ALREADY DONE: game lines (both seasons), matchups
> (three seasons), starters/officials 2024-25 and 2025-26, coaches, weekly as-of tables, player index,
> preseason logs, absence prior.*** ***By morning the only open data item outside the boards is my own
> desk work — coach-change dates, all-star lists, referee-assignments scraper, the game-id join —
> which doesn't block the DFS work.***"*

🔑 ***The four open items ARE the answer to "what is left after T11"***, and **§T11.24b found three of
them independently as *"in none of the twelve"*** — the **all-star / all-NBA lists**, the **daily
referee-assignments scraper**, and **`k1`'s coach-change source**. ***The fourth — the NBA game-id
join for `game_lines_closing` / `board_snapshots` — the sweep had only as a T12 queue note. It is
T11's, at segment 711.***

⚠ **Read against the live tables above, *"starters/officials 2024-25 … already done"* is true of the
SCRAPE and not of the database** — which is why §T11.31b matters rather than being bookkeeping.

⚠ **And two segments give two numbers for one setting**: **segment 709 and the live config
`board_backfill_odds_api` say `window 14:45 PT (DST-aware)` and `close = commence_time − 30 min`**;
**segment 711 says the test *"landed exactly right: the window at 2:40 PM PT, the close at 35 minutes
before tip."*** **Whether that is snapshot granularity (the nearest available capture to the target)
or a different setting is NOT RECORDED** (rule 6).

---

## 🔴🔴 T11's MARKET-PROBING RESULT — **the transcript's own answer to its blocked-items list, and it is in ZERO of the twelve**
*Found 2026-09-21, T11 pass 28 (§T11.29). **Segment 355 of 712** — verbatim where quoted, and
**every figure confirmed live** in `nba_config.classification_config` key
`market_probe_results_2026_09_10`.*

*(The `c1`/`c2` owner decision recorded in the section above — "decide on BigDataBall" — is the
segment-113 state; §T11.29a is the segment-355 state and supersedes it inside T11.)*

⚠⚠ **READ THIS BEFORE THE MATRIX BELOW.** **The matrix and the blocked-items list are segments 112–113
— 12% of the way into T11. This is segment 355, and segment 536 is later still. A transcript's state
on a subject is its LAST word, not its first** *(rule 27)*.

### The probe, and what it settles
> *"**2026-09-10 v40 market probing done** (config key `market_probe_results_2026_09_10`):
> **ParlayAPI v3.2.0 Pro**: live props endpoint `/v1/sports/basketball_nba/props`, 3 credits, **all
> DFS books incl PP/UD/Sleeper = the live board source**; historical coverage endpoint shows **game
> lines for 3 seasons** (DK / Caesars / MGM / FD / Fanatics, Oct 2023 – Jun 2026) — ***`b1`/`b2`/`c3`
> backfill SOLVED***; **but** the props/board archive `/historical/…/closing-odds` **starts
> ~2026-05-10**: Underdog + sportsbooks present, ***PrizePicks and Sleeper absent even June 2026
> (Finals)***, **regular seasons 2025-26 and 2024-25 EMPTY for every book** — ***ParlayAPI EXHAUSTED
> for historical boards***. **Odds API key = free plan (historical unavailable)**; docs: **props
> history since 2023-05 at 5-minute snapshots, 10 credits per region per market per event**, us_dfs
> books in history only from their add date (**not in the docs**) — ***a small paid month is the cheap
> test; ~123k credits per season for one snapshot per game***. Alternatives researched: **OpticOdds**
> (enterprise), **OddsJam** (B2B), **SportsGameOdds**, **OddsPapi**, **BigDataBall**. Gemini + sharp
> practice: ***DERIVED BOARD is legitimate*** — **PP line = sportsbook consensus median; Goblin/Demon
> structured offsets** — but **needs historical sportsbook props (Odds API paid)**. ***DECISION
> PENDING (owner): pay for an Odds API month to test us_dfs history / pull sportsbook props for a
> derived board, or accept live-only board archiving from opening day.***"*

### ⚠ WHAT THE QUOTATION LEFT OUT — *rule 19, added by §T11.52d*
**Segment 355 is a memory-file write with TWO halves and the quotation above is the second.**
***Its first half is a to-do list***: *"next: **verify injury shards Oct–Dec present, header
timestamps**; **chunk 2 to season end**; **2024-25 injury**; **per-game 2024-25 result**; **replay
2026-03-15 with the report**; **then the market probing phase (ParlayAPI first)**."* 🔑 **It dates
the probe within the session** — ***market probing was scheduled AFTER the injury and per-game work,
and "ParlayAPI first" is the ordering the whole investigation follows.***

**And segment 501's TAIL was left out**: *"**bridge probe: summarize-fields patch committed but not
observed live yet (verify)**; **probe workflow `nba-probe.yml` + `nba/probe_board_archives.py` exist
— no commit runs**."* ⚠ ***An unverified bridge patch and a probe workflow that has never run***, both
`[LIVE-AUDIT]`-checkable and neither previously recorded by this sweep.

*(§T10.17c's failure exactly — an owner turn quoted for its second half only — which is why rule 19
exists. Two more instances, both mine.)*

### ⚠⚠ TWO MORE, FROM PASS 0's OWN ENTRIES — *rule 19, added by §T11.53c*
*Found by the pass-52 quotation-boundary audit, which enumerated the population for the first time:
**19 entries, 74 entry–segment pairs, 37 distinct segments.***

**1 · SEGMENT 668 — §T11.1c quoted its LAST clause and dropped the owner's PLACEMENT CADENCE.**
The entry quotes *"always when i give you a time or ask a time, i refer to pacific time, i am in san
diego california, so do not forget it"* and records it as the standing timezone instruction — which
it is. ***What comes before it in the same turn is a decision:*** *"**prizepicks and sleeper i think
3 a day is too much**, more than anything **i'll only place the picks in one window, probably 2 hours
before the first game daily**. **which time it usually start? if i have one time to place it all,
what would be the best time**"* — and it opens with *"so it is confirmed that we have all needed for
2 full seasons?"*, **which segment 670 corrects** *("what's confirmed for two full seasons is
PrizePicks + Underdog. Sleeper is not in The Odds API")*.
🔑 **Why it matters, and this is the substance, not the wording:** ***"two snapshots per game (window
+ tip−30)" is recorded in FIVE documents*** — `NBA_COMPASS.md` (fact 47), `NBA_PROJECT_LOG.md`,
`NBA_DAILY_PARITY_AND_BACKFILL.md`, `NBA_ENRICHMENT_MINING_AND_FALLBACKS.md`,
`NBA_MASTER_SUMMARY.md` — **as a settled owner decision**, and ***the number THREE and the owner's
rejection of it appear in NONE of them*** *(probed across all thirty; the three "three snapshots"
hits are the weekly differential worker's three snapshot TABLES — opened, different subject)*.
⚠ **Stated at evidence strength**: the owner's sentence is about **when HE places picks** — *one
window, ~2 hours before the first game* — and the two-snapshot design is about **when the system
CAPTURES**. **That the rejection of three caused the choice of two is NOT RECORDED.** *(The ~2-hour
rule itself IS on file — `NBA_OPEN_ITEMS.md` §4b, "first tip minus 2 hours", and the window's
correction to 1:15 PM PT — so what was missing is the owner's own statement of it, not the rule.)*

**2 · SEGMENT 197 — §T11.1e's directive table dropped the SCOPE LIMIT.**
The table records the ParlayAPI-first ordering, the OTZ last-resort clause, Gemini, the two seasons,
the Sleeper/Underdog/PrizePicks boards, and the gate *"once you're done with the backfill for every
single factor"* — **all correct.** ***It omits the sentence between them***: *"and that should get
board snapshots, daily board snapshots for nba. **not to get market data just yet**."*
🔑 ***The owner scoped the phase to BOARDS and explicitly deferred market data*** — **0 of thirty in
any vocabulary** *(control: "daily board snapshots" fires; the two hits on the deferral's substance
are `NBA_SYSTEM_DRAFT.md` and the 09-04 checkpoint treating ParlayAPI as the locked market/board
source — opened, a different subject)*.

📌 **The shape, across all four instances**: ***a segment of 400–2,000 characters quoted for the one
clause the entry is about, with the other clauses dropped — and in three of the four the dropped
clause is the PROVENANCE of something the documents carry as a bare parameter.***

### 🔴 What this corrects in this sweep's own record

| the sweep said | T11 actually says |
|---|---|
| §T11.23b / §T11.24a / §T11.27b — **`c1`/`c2` is blocked on *"decide on BigDataBall"*** | ❌ **That is segment 113.** By **segment 355** the decision is ***"pay for an Odds API month (~123k credits/season) or accept live-only"***, and **BigDataBall is one of FIVE researched alternatives**, not the option |
| §T11.24a — ***"`b1`/`b2`/`c3` … resolved inside T11 when the owner renewed the key"*** | ✅ **Right, and the RESULT was never found**: **segment 536** rewrites the matrix row to **✓ — `nba_market.game_lines_closing`, ParlayAPI closing-odds archive, 5–7 books, 2,410 games, 12,165 rows, openers not archived before May 2026** |
| §T11.27f — *"the supersession is T12's; **queued, not taken**"* | ❌ **RETRACTED.** The probe searched for T12's *status-line* strings and found none. **The supersession itself is at T11 segments 355 and 536.** *Vocabulary-correct, pattern-wrong — the third time in this run* |
| §T11.23c — ***"no free archive exists for anyone"*** | ✅ **Upheld and now MECHANISED**: the archive **starts ~2026-05-10**, **PP and Sleeper are absent even in June 2026**, and **both regular seasons are empty for every book.** *The claim was published without the measurement behind it* |
| §T11.3a — **ParlayAPI validated live** | ⚠ **Half the finding.** It is the **live board source** ***and*** ***EXHAUSTED for historical boards*** — the operationally decisive half, recorded nowhere by this sweep |

### 📌 Novelty, positive-controlled against `5dfb72ab`
**0 of thirty**: ***~123k credits/season*** · ***props history since 2023-05 at 5-min snapshots, 10
credits per region/market/event*** · ***the DERIVED BOARD as a legitimate substitute (PP line =
sportsbook consensus median, Goblin/Demon structured offsets)***. **0 of the twelve** *(carried only
by `NBA_COMPASS.md` and `NBA_PROJECT_LOG.md`)*: the **~2026-05-10** archive start · **PP/Sleeper
absent** · the **config key** · **2,410 games / 12,165 rows**. ⚠ ***"EXHAUSTED" returns 0 of thirty as
a word, but the FACT is in 2 of thirty in another vocabulary*** — *"archive starts ~2026-05-10 and
never holds PrizePicks/Sleeper"* — **so it is reported as 2 of thirty, 0 of the twelve** *(rule 20)*.
⚠ **OpticOdds / OddsJam / SportsGameOdds appear in 5 of the twelve and in EVERY case as research
sources for projection methodology, never as board-history vendors** — false hits, opened and
dismissed.

### 🔴🔴 SEGMENT 501 — **the exhaustive verdict, and it is the owner being answered with evidence**
*T11 pass 29 (§T11.30a). **`v41 exhaustive alternatives done`** — the transcript's LAST word on board
history, at **70% of the file**, against §T11.23c's quotation at **15.7%**.*

> *"**owner pushed back that ParlayAPI has Sleeper/Underdog**: **live verified** — bookmaker key
> `sleeper` returns **331 MLB props** (`is_dfs`, `flat_payout=true`); **PP/UD/Sleeper all live in
> `/props`**. ***History verified ABSENT***: the API itself returns **`BOOKMAKER_NOT_IN_ARCHIVE`** —
> *"no closing-line history exists for sleeper, prizepicks"*; **`/v1/bookmakers/sleeper/freshness`
> shows writes only to `prop_snapshots` (short-retention tick store behind `/line-movement`, <1h
> tracked), historical rows total = 0**; **Underdog archived from ~2026-05-10 only.** **Free routes
> DEAD**: Wayback CDX — **PP projections API 24 captures in 3 years; UD and Sleeper 0**; the **52k PP
> board captures are share-entry SPA shells with no lines**; **no GitHub or Kaggle archives.** **Odds
> API**: free plan historical locked; ***us_dfs region = PrizePicks (+ goblin/demon alternate) +
> Underdog + Pick6 + Dabble — NO SLEEPER***; ⚠ *(**segment 501's list.** Elsewhere in T11 the same
> region is given as **"Pick6, Boom, ParlayPlay, Dabble"** beside PrizePicks and Underdog — **SIX
> books, not four**. Both are in the transcript and the sweep quoted the shorter; §T11.35d, rule 19.
> **The "no Sleeper" conclusion is unaffected** — Sleeper is in neither list.)* plans **$30 / 20k ·
> $59 / 100k · $119 / 5M · $249 /
> 15M**; ~200 credits per game-snapshot. ***NOTHING ANYWHERE HOLDS THE 2024-25 OR 2025-26 SLEEPER
> BOARDS.*** **Cheapest reliable: Odds API $119 for one month, conditional on the unpublished us_dfs
> start date — ask support first, or a $30 test.** Fallback per Gemini: ask ParlayAPI support for a
> raw `prop_snapshots` export (May 2026+ at best)."*

🔑🔑 **THIS IS THE CAUSE OF `[LIVE-AUDIT]` §T11.8b — the finding this sweep revised THREE times.**
*"Sleeper has zero NBA rows"* was measured from the database and explained as an observation about the
data. ***T11 explains it: no archive of Sleeper boards exists anywhere, free or paid, and the one paid
route that fixes PrizePicks and Underdog does not carry Sleeper at all.*** **The derived-Sleeper
fallback (§T11.6b) is therefore not a convenience — it is the only option that exists**, and this
segment is the proof of necessity the sweep recorded the remedy without.

✅ **§T11.23c's *"no free archive exists for anyone"* is not merely upheld — it is EXHAUSTIVELY
PROVEN**, route by route, with **the API's own error code** and **`historical rows total = 0`**.
*Published from segment 112 as an assertion; the evidence was at segment 501.*

### 🔴🔴 SEGMENT 709 — **the board puller is BUILT AND TESTED before T11 ends**
*T11 pass 29 (§T11.30b). **99.6% of the file** — three segments from the end.*

> *"**wants the 2-season boards to train/test the derived Sleeper fallback.** — **2026-09-10 v46 board
> puller built + tested**: bridge job **`odds_api_board_backfill`**, config key
> **`board_backfill_odds_api`** → Postgres **`nba_market.board_snapshots` + `board_backfill_log`
> (resumable)**; defaults **snapshots = window 14:45 PT (DST-aware) + close (tip − 30)**, regions
> **`us_dfs,us`** — DFS **and all US sportsbooks in ONE call: cost is per REGION, not per book** —
> **21 markets incl 8 alternate**, key `odds_api_key_nba`. ***Test ORL-BKN 2024-10-25: 8,626 rows, 9
> books (PrizePicks 16 markets, Underdog 11, FD/DK 19).*** **Cost 420 credits/snapshot — two seasons
> ~2.07M (DFS-only 1.03M); fits the $119 / 5M plan leaving ~2.9M for the owner's MLB/hockey.** Run
> after upgrade in ~7-date chunks per call. **Queue for overnight: injury 2025-26 tail running, then
> injury 2024-25 queued (the workflow now self-loops 30-day chunks with commits); starters/officials
> 2023-24 running.**"*

⚠ ***So "DECISION PENDING" is segment 355's state, not T11's.*** **By segment 709 the puller is
written, run against a real game, priced, and waiting on nothing but the owner's plan upgrade.**
*(This corrects §T11.29b, written one pass earlier — the same failure rule 27 was created to stop,
caught by rule 27 on its first application.)*

🔑 **And the board puller got the timezone RIGHT**: **`window 14:45 PT (DST-aware)`** — an explicit
in-transcript counter-example to the fixed-offset defects this sweep keeps recording *(the injury
archive's hardcoded `-05:00`, §T11.3d; `nba-referees.yml`'s `UTC-7` comment)*. ***The same session
that shipped a DST-aware window shipped a fixed-offset one, so this is not a knowledge gap — it is
inconsistency between components.***

📌 **And the matrix's ⏳ rows are in motion at T11's close**: injury 2025-26 tail → injury 2024-25
queued, the workflow **self-looping 30-day chunks with commits**; starters/officials **2023-24
running**.

### ✅ And the decision did resolve — the configs carry it
`board_sources_decision`: ***`historical_boards`: The Odds API (PrizePicks + Underdog, 2 seasons)***.
`board_backfill_odds_api`: **$119 / 5M plan**, **420 credits per snapshot** (10 × 21 markets × 2
regions), **2,460 games × 2 snapshots ≈ 2.07M credits**, resumable via `nba_market.board_backfill_log`.
⚠ **This is the live state, not T11's** *(rule 6)* — **T11 ends with the decision PENDING**, and which
transcript closes it is for a later pass.

---

## 📋 THE FACTOR × SEASON BACKFILL MATRIX — **the instrument that answers "which factors are done"**
*Transcribed in full 2026-09-21 from T11 segment 112 (§T11.24). **§T11.2d established that the twelve
carry the owner's requirement — "every enrichment factor needs a two-season backfill" — and NOT the
instrument that tracks it. This is the instrument.*** **State as of T11, 2026-09-10 — not current;
eight transcripts after it are unswept.*

**Legend**: **✓** have · **⏳** running · **🔧** built, run pending · **⛔** blocked (owner action) ·
**–** derived, no external data needed

| factor | 2025-26 | 2024-25 | 2023-24 | source / build note |
|---|---|---|---|---|
| **a1** injury status, **n1** P(plays\|Q), **n2** injury class, **a6** late scratch, **a9** suspension | **⏳ chunk 1** | **🔧** | **🔧** | *archive coverage to verify*; `scrape_nba_injury_report.py` backfill mode; **parser fixed for runner extraction** |
| **a2** teammate-out redistribution | ✓ | ✓ | ✓ | box-score absences + logs; derived + PDFs for as-known — **measurable now** |
| **a3** return ramp | ✓ | ✓ | ✓ | logs; **in baseline v30** |
| **a4** rest probability | ✓ logs | ✓ | ✓ | logs + PDF reason class; **⏳ + national-TV flag — verify schedule field**; **all-star / all-NBA lists static, to add**; absence prior measured |
| **a5** lineup change | ✓ starters | **⏳** | **🔧** | `scrape_nba_starter_status.py`, season slug, `nba-pergame-backfill.yml` |
| **a7** trade window | ✓ | ✓ | ✓ | logs, team change |
| **a8** rookie / two-way | ✓ preseason + PDF two-way reason | ✓ preseason | ✓ preseason | season tables, preseason logs |
| 🔴 **b1/b2** market spread & total, **c3** game-line movement — ✅ **UPGRADED TO ✓ AT SEGMENT 536 OF THE SAME TRANSCRIPT** *(§T11.29a: `game_lines_closing`, 5–7 books, 2,410 games, 12,165 rows)* | **⛔** | **⛔** | **⛔** | *"parlayapi key invalid (key v3.2.0); odds api key **deactivated** → **owner renews parlayapi free key** per its signup — then historical game lines"*; **free fallback for history: Kaggle *"NBA betting data Oct 2007–Jun 2026"* (owner account) or a TeamRankings odds-history scrape**; ***the derived spread is the trained fallback in place*** |
| **b3** leverage / tanking | ✓ | ✓ | ✓ | standings from logs |
| **b4/m1** opponent absences / primary defender | **⏳** per-game matchups sharded + weekly PT defend | **🔧** | **🔧** | `scrape_nba_matchups_pergame.py`; season-tables as-of weekly |
| **b5** OT probability | ✓ | ✓ | ✓ | derived |
| 🔴 **c1/c2** book vs pick'em gap, prop-line movement | **⛔** | **⛔** | **⛔** | ***historical prop lines are PAID (BigDataBall) — owner decision***; live-only otherwise, calibrated in-season — ✅ **SUPERSEDED IN T13**: The Odds API supplied two seasons; **BigDataBall never purchased, never needed** *(§T11.27b; sportsbook side only — see below)* |
| 🔴 **c4, s1–s4** pick'em structure | **⛔** | **⛔** | **⛔** | ***"no archive exists … boards are not archived anywhere free; live from season start; the board scraper will archive every board from day one so the next backfill exists"*** |
| **d1** referee crew | ✓ officials | **⏳** | **🔧** | `scrape_nba_game_officials.py`, season slug, `nba-pergame-backfill.yml`; **daily assignments scraper to build** |
| **d2** schedule / travel / day game / altitude | ✓ | ✓ | ✓ | logs dates, home + arenas |
| **k1** coach rotation profile | ✓ logs | ✓ | ✓ | logs + **coach-by-team-by-date table, source: Wikipedia season pages' *"coaching changes"* tables with dates — to compile as a static file** |
| **m2** scheme proxy | ✓ current | prior-season table | parity-safe | ⚠ ***"prior-season synergy play types have NO DATE FILTER → use the previous season's table for a given season" — a documented limitation*** |
| **m3** hustle, **m4** clutch | **⏳** weekly as-of | **⏳** | **⏳** | season-tables as-of weekly |
| **e1–e4** confidence | **–** | **–** | **–** | **run metadata** — *no backfill applies* |

🔑 **What the matrix settles**: ***three factor groups are blocked and all three are market/board
history*** — **b1/b2/c3** (resolved inside T11 when the owner renewed the key, §T11.23b), **c1/c2**
(paid, **owner decision** — ✅ **superseded in T13, BigDataBall never needed**, §T11.27b), **c4/s1–s4**
(**no free archive exists for anyone** — ⚠ **still open**: The Odds API carries PrizePicks as a
*bookmaker* but **not the DFS-only markets**, so it does not reach this row). **Everything else is
have, running, or built-and-pending.** ***Two of the three ⛔ groups are now closed and the third is
not — and they close for different reasons.*** *As segment 113 puts it: **"everything else is built or
running."***

📌 **Four items in this matrix are in NONE of the twelve** *(probed with positive controls against
`5dfb72ab`)*: **`m2`'s no-date-filter limitation** (1 of thirty) · **the national-TV flag** (3) ·
**the all-star / all-NBA static lists** (5) · **`k1`'s Wikipedia source** (2). ***All four sit in
`NBA_ENRICHMENT_MINING_AND_FALLBACKS.md` and its neighbours — which is exactly §T11.2d's finding, and
this table is the fix.***

---

## 🔴 NO PICK'EM BOARD IS ARCHIVED ANYWHERE FREE — the general form of the Sleeper gap
*Found 2026-09-21, T11 pass 22 (§T11.23c), from the transcript's own factor × season matrix.
**Novelty: 0 of thirty, probe positive-controlled.***

**The matrix marks `c4` and `s1–s4` — pick'em structure — ⛔ ⛔ ⛔ across all three seasons:**

> *"**no archive exists** … **boards are not archived anywhere free**; live from season start; **the
> board scraper will archive every board from day one so the next backfill exists**."*

🔑 ***This is the GENERAL form of the Sleeper finding.*** The documents record *"Sleeper has no
history anywhere"* as an **app-specific** fact. **The transcript says the pick'em BOARD STRUCTURE has
no free archive for ANY app** — *which is why the PrizePicks and Underdog history came from
ParlayAPI's **prop lines** rather than from board archives, and why the live scraper archiving "from
day one" is the plan rather than a backfill.*

📌 **So the two-seasons-of-board-history question is settled in principle**: **for prop LINES there is
history; for pick'em STRUCTURE (tiers, goblins/demons, multipliers) there is none, and the first
season of it starts when the scrapers run.**

---

## 🔴 THREE BLOCKED ITEMS THE TRANSCRIPT ADDRESSES TO THE OWNER
*Found 2026-09-21, T11 pass 22 (§T11.23b). **Verbatim from segment 113.***

> *"**blocked items need the owner**: **1** renew the parlayapi key (free) — unlocks b1/b2/c3 live
> and, with its historical endpoint, the backfill; **2** decide on **bigdataball** for c1/c2 history;
> **3** optionally a **kaggle** account for the free game-line history. **everything else is built or
> running.**"*

✅ **Item 1 was resolved inside the same transcript** — segment 112 records *"parlayapi key invalid
(key v3.2.0); odds api key deactivated → owner renews"*, the owner supplies keys at segment 197, and
segment 221 validates both (§T11.3a). ***The chronology runs blocked → owner acts → validated.***

❌ ***CORRECTED 2026-09-21 by §T11.27b — pass 22 said the status of items 2 and 3 after T11 was
"NOT RECORDED". IT IS RECORDED, and in the twelve. The original text is kept below the correction.***

### ✅ ITEM 2 — **BigDataBall: SUPERSEDED, not open**
**`NBA_MASTER_SUMMARY.md` §T7.14a** — on file in the baseline `5dfb72ab`, **written by this sweep's
own T7 pass, before T11's passes began** — records the supersession with its transcript named:

> *"**This verdict was overtaken in T13**, which obtained **two full seasons of historical board data
> from The Odds API** (→ `nba_market.board_snapshots`, 6.6 GB) — a source not considered here.
> **BigDataBall was never purchased and never needed.**"*

**And `NBA_SYSTEM_ARCHITECTURE.md` carries the same fact from the source's side**: *"The Odds API …
12 books, $30 plan. **Carries PrizePicks as a bookmaker but NOT the DFS-only markets** (fantasy_score,
period props). **This superseded the T9 verdict that no retroactive prop archive existed — BigDataBall
was never needed.**"*

| | |
|---|---|
| **T11, 2026-09-10** *(segment 113)* | *"decide on **bigdataball** for c1/c2 history"* — **⛔ an open owner decision** |
| **T13** *(recorded in `NBA_MASTER_SUMMARY.md` §T7.14a and `NBA_SYSTEM_ARCHITECTURE.md`)* | **The Odds API supplied two full seasons → `board_snapshots`, 6.6 GB. BigDataBall never purchased, never needed.** |

🔑 **The supersession is PARTIAL, and `NBA_SYSTEM_ARCHITECTURE.md` says exactly where it stops**: The
Odds API carries **PrizePicks as a bookmaker** but **not the DFS-only markets** (`fantasy_score`,
period props). ***So it closes `c1`/`c2`'s sportsbook side and does NOT close `c4`/`s1–s4` — whose ⛔
is "no archive exists … boards are not archived anywhere free". The two blocked groups are resolved by
different facts, and only one of them is resolved.***

### ⚠ ITEM 3 — **Kaggle: the need it existed for is met; the account itself is NOT RECORDED**
Item 3 was *"optionally a **kaggle** account for the **free game-line history**"*. **That history is
present**: `nba_market.game_lines_closing` covers **2,410 games / 12,165 rows, 5–7 books** (§T11.12).
**So the game-line gap Kaggle was a fallback for is closed** — ⚠ **but no document says the Kaggle
account was or was not opened, and this is an inference from the data being present, not a statement
anyone made.** **`TeamRankings` remains in 0 of thirty.**

<details><summary><b>The original pass-22 text, retained</b></summary>

> 📌 **Items 2 and 3 are OWNER DECISIONS and their status after T11 is NOT RECORDED** *(eight
> transcripts unswept)*:
> - **BigDataBall for `c1`/`c2` history** — *"historical prop lines are **paid** (bigdataball) — owner
>   decision; live-only otherwise, calibrated in-season."* **BigDataBall is documented in 7 of thirty,
>   2 of the twelve.**
> - **A Kaggle account** for the free game-line history — *"**kaggle 'NBA betting data Oct 2007–Jun
>   2026'** (owner account)"*, with **`TeamRankings` odds-history scrape** named as the other free
>   fallback. ⚠ **TeamRankings is in 0 of thirty; the Kaggle set in 1 of thirty and 0 of the twelve.**

🔴 **Why it was wrong, and it is the lesson**: the count — *"7 of thirty, 2 of the twelve"* — **was
correct**. **The carriers were never opened**, and one of the two inside the twelve is **this sweep's
own ledger saying the decision was overtaken.** ***A count of carriers is not a reading of them.***
**RULE 26.**

</details>

📌 **And one build note the twelve do not carry**: **`k1` coach rotation's source is Wikipedia season
pages' *"coaching changes"* tables, *"to compile as a static file"*** — **2 of thirty, 0 of the
twelve.**

---

## 🔴🔴 NEUTRAL-SITE GAMES ARE IN NO DOCUMENT — and HCA is applied to them
*Found 2026-09-21, T11 pass 14 (§T11.15). `[LIVE-AUDIT]`. **Season-relevant: the 2025-26 calendar
labels four of them.***

**`nba_calendar.games` carries `game_label` and `arena_city`, and labels these explicitly:**

| date | calendar | `game_label` | `arena_city` |
|---|---|---|---|
| **2025-11-01** | DAL @ DET | **NBA Mexico City Game** | **Mexico City** |
| **2025-12-13** | SAS @ OKC | **Emirates NBA Cup** | **Las Vegas** |
| **2026-01-15** | MEM @ ORL | **NBA Berlin Game** | **Berlin** |
| **2026-01-18** | ORL @ MEM | **NBA London Game** | **London** |

🔑 **These are the games behind the home/away join failure** (§T11.14a): at a neutral venue "home" is
an administrative label, and `nba_market.schedule_norm` took the opposite convention to both the
calendar and the market feed. ***The calendar and `game_lines_snapshots` agree; `schedule_norm` is the
one reversed.***

🔴 **And nothing in the documentation knows neutral sites exist.** Probed with positive controls
across all thirty documents:

| probe | hits |
|---|---|
| **`neutral site` / `neutral venue`** | **0 of thirty** |
| **`arena_city`** — the column that identifies them | **0 of thirty** |
| **`is_home`** — a live factor in `baseline_ladder_runs.factor_fits` (β ≈ 0.0246) | **0 of thirty** |
| `HCA` / home-court advantage | 7 of thirty, **3 of the twelve** |
| `NBA Cup` / `Emirates` | 3 of thirty, **3 of the twelve** |

⚠⚠ **The exposure**: **HCA is applied per game from a home/away designation.** For a game in Mexico
City, Berlin, London or Las Vegas **the designated home team is not at home**, so an HCA term is
applied to a game where the effect it models is absent — **and for the games where the two sources
disagree, potentially to the wrong side.**

> ✅ **QUESTION 2 ANSWERED 2026-09-21 by §T11.16a, in the code**: `classification_ladder_v12.py`
> line 164 sets **`is_home` from the box-score `MATCHUP` string** (`"ATL vs. MIL"` vs `"ATL @ MIL"`) —
> ***the league's own field.*** **The scoring path never reads `nba_market.schedule_norm` and is NOT
> exposed to its reversed orientation.** *So the reversal is a join/documentation problem, not a
> scoring one.*
>
> 🔴🔑 **BUT §T11.16b FOUND THE COMPOSITION THAT MAKES THIS WORSE, AND IT IS EXACT.**
> **`HCA` is a single scalar** fitted over the TRAIN seasons and added to **every** game's
> `derived_spread` — **no neutral-site condition anywhere.** **The market spread overrides it per
> game**, loaded from a file *"exported from `nba_market.game_lines_snapshots`"*, and *"falls back to
> the derived spread per game when no line exists — never silently, the coverage is printed."*
> ***The six games with no `event_game_map` row have no market spread, so they fall through to
> `derived_spread` and its full HCA — and those six ARE the neutral-site games.***
> **The one place HCA still governs the spread is the one place it is most wrong.**
>
> ✅ **PROVEN BY MEASUREMENT, not inference (§T11.17a)**: the market-spread exports
> `nba/data/nba_market_spreads_{2024_25,2025_26}.json` hold **2,454 distinct `game_id`s — identical to
> `event_game_map`'s mapped-game count, so the export IS gated by the mapping — and NONE of the six
> (`0022401229`, `0022401230`, `0022500147`, `0022501230`, `0022500578`, `0022500602`) appears in
> either file.** 🔑 **And the split closes exactly: 1,228 + 1,226 = 2,454, so each season is short by
> 2 and 4 — and 2 + 4 = 6, precisely where the six fall.**
>
> ✅ **What limits it**: six games across two seasons; the fallback is **printed, not silent**; and
> `spread_used` feeds **`p_blowout` and `home_favored`** — a blowout probability and a favourite flag,
> **not a projection directly**. 📌 **The magnitude has NOT been measured** — this sweep reads, it
> does not run.

📌 **OWNER DECISION — the two questions that remain:**
1. **Should HCA be zeroed (or reduced) for games where `arena_city` is not the home team's city?**
   *`arena_city` and `game_label` are in the calendar and in no document and no code path found.*
2. **Should `schedule_norm`'s orientation be corrected to match `nba_calendar.games`?** *It would fix
   the six-game join gap at §T11.12b and, through it, give those six a market spread — which is the
   cheapest way to remove the HCA exposure above.*

📌 **Scale, stated plainly**: **four labelled neutral-site games in 2025-26** — *a handful, not a
season-wide defect* — **but they include the NBA Cup games, which are among the most-watched on the
schedule.**

---

## 🔴 THE "100% MARKET-SPREAD COVERAGE" IN TWO MANDATED DOCUMENTS IS 99.76%
*Found 2026-09-21, T11 pass 11 (§T11.12b). `[LIVE-AUDIT]`.*

**Four documents — `NBA_DATABASE.md` and `NBA_FINAL_SCORING_CALIBRATION.md` among them — record the
real-market-spread upgrade as *"307,604 rows, 2,454 games, **100% coverage**."* The 307,604 is exact
(`nba_market.game_lines_snapshots`). The 100% is not.**

| measure | value |
|---|---|
| `nba_market.schedule_norm` — games 2024-10-22 → 2026-04-12 | **2,460** *(= 1,230 × 2)* |
| `nba_market.event_game_map` — distinct games mapped | **2,454** → **99.76%** |
| **Unmapped** | **6** |
| `game_lines_snapshots` — distinct `event_id` | **2,468** *(**eight MORE** than the schedule holds)* |
| **`game_lines_closing` — distinct `canonical_event_id`** | **2,410** → **97.97%** |

🔴 ***The "100%" is 100% of the games that were MAPPED — a denominator taken from the numerator's own
table.*** **§T10.6a's shape**: *the check runs in the one direction that cannot see the gap.*

🔑🔑 **THE SIX UNMAPPED GAMES ARE NOT MISSING — HOME AND AWAY ARE SWAPPED** *(proven by query
2026-09-21, §T11.14a; the "cause NOT RECORDED" first written here is superseded)*:

| `schedule_norm` *(away@home)* | `game_lines_snapshots` *(away @ home)* |
|---|---|
| 2024-12-14 **MIL@ATL** | 2024-12-14 **ATL @ MIL** |
| 2024-12-14 **OKC@HOU** | 2024-12-14 **HOU @ OKC** |
| 2025-11-01 **DET@DAL** | 2025-11-01 **DAL @ DET** |
| 2025-12-13 **OKC@SAS** | 2025-12-13 **SAS @ OKC** |
| 2026-01-15 **ORL@MEM** | 2026-01-15 **MEM @ ORL** |
| 2026-01-18 **MEM@ORL** | 2026-01-18 **ORL @ MEM** |

**Of the 14 events that map to no game: 6 match a schedule game with the orientation REVERSED, 0
match exactly, and 8 have no schedule row in either orientation.** ✅ **Both partitions close:
`game_lines_snapshots` 2,468 = 2,454 + 6 + 8 · `schedule_norm` 2,460 = 2,454 + 6.**

⚠ **The mechanism is demonstrated; WHY the sources disagree is still NOT RECORDED** *(rule 6 — no
transcript swept so far supplies it)*. **Two of the six share the date 2024-12-14 and two more are a
home-and-home pair two days apart — patterns worth noting and not worth guessing from.**

📌 **And the eight events with NO schedule row** — 2024-12-17 MIL@OKC · 2025-01-09 CHA@LAL ·
2025-01-22 MIL@NOP · 2025-12-16 SAS@NYK · 2026-01-08 MIA@CHI · 2026-01-24 GSW@MIN · 2026-01-25
DAL@MIL · 2026-01-25 DEN@MEM — **carry 48–128 line rows each: real market data for games the schedule
does not contain. NOT RECORDED what they are.**

🔑 **Practical consequence, and it changes the remedy**: ***these six games' market lines are already
in the database.*** **The fix is a join that normalises orientation, not a re-scrape.**

✅ **Corrected in both mandated documents.** ⚠ **The blowout-model measurements built on those 2,454
games are unaffected in kind** — *the sample is 99.76% of the two seasons rather than all of them* —
**but the closing-lines table's 50-game shortfall has not been traced to any consumer, and whether it
matters is NOT RECORDED.**

📌 **OWNER DECISION (minor)**: **are the six unmapped games recoverable, and is `game_lines_closing`'s
2,410 a known limit or a gap?**

---

## 🔴🔴 `nba_market.board_snapshots` IS NOT NBA-ONLY — the live board crons write every sport into it
*Found 2026-09-21, T11 pass 7 (§T11.8a). `[LIVE-AUDIT]`, read off the table. **Novelty 0 of thirty,
probe positive-controlled.***

**`market_key` holds ~90 distinct values and the majority are BASEBALL**: `player_batter_hits` ·
`player_pitcher_strikeouts` · `player_1st_inn._batters_faced` · `player_1st_inn._pitch_count` ·
`player_home_runs` · `player_rbis` · `player_stolen_bases` · `player_earned_runs_allowed` ·
`player_total_bases` · `player_singles` · `player_doubles` · `player_hits_+_runs_+_rbis` ·
`player_team_total_runs` · `player_outs` — beside the NBA set (`player_points`, `player_rebounds`,
`player_assists`, `player_threes`, `player_blocks`, `player_steals`, `player_turnovers`,
`player_double_double`, `player_blocks_steals`, `player_points_rebounds_assists`,
`player_fantasy_points` and their `_alternate` forms).

🔴 **Where they come from**: the **`routine`** snapshot label is the **live 2-hour board crons** —
`sleeper-board.yml`, `underdog-board.yml`, `fliff-board.yml` — **and they ran in mid-September, which
is not NBA season.**

| bookmaker | `routine` rows | **NBA-shaped `market_key`s** |
|---|---|---|
| `underdog` | 5,281 | **189 — 3.6%** |
| `fliff` | 1,394 | **0** |
| `sleeper` | 1,276 | **0** |

⚠⚠ **The consumer hazard, and it caught this sweep four times**: ***a row in `nba_market.board_snapshots`
is not necessarily an NBA row.*** **Any count, date range or `market_key` listing taken on
`bookmaker`/`game_date` alone silently includes other sports.** *The historical `window`/`close` rows
for PrizePicks and Underdog are the NBA backfill and are not affected; the contamination is in the
live `routine` capture.*

📌 **OWNER DECISION**: **should the live board scrapers filter to NBA before writing, or should the
table carry an explicit `sport`/`league` column?** *Neither is chosen here — "document, don't fix" —
and **NOT RECORDED** is whether the cross-sport capture is deliberate (one table for all sports, the
`nba_` prefix being historical) or accidental.*

---

## 🔴🔴 ~~SLEEPER HAS ONE DAY OF BOARD HISTORY~~ — **SLEEPER HAS ZERO NBA BOARD ROWS** — one of the three apps the owner named
*Found 2026-09-21, T11 pass 3 (§T11.4a). `[LIVE-AUDIT]` on `nba_market.board_snapshots` —
**27,067,871 rows, 2024-10-22 → 2026-09-13**.*

| app | labels | rows | range | **distinct days** |
|---|---|---|---|---|
| **`prizepicks`** | `close` · `window` | **2,199,354** | 2024-10-22 → 2026-04-12 | **378** |
| **`underdog`** | `close` · `routine` · `window` | **939,719** | 2024-10-22 → 2026-09-12 | **380** |
| ⚠ **`betr_us_dfs`** | `close` · `window` | **780,765** | **2025-11-23** → 2026-04-12 | **131** |
| ⚠ **`pick6`** | `close` · `window` | **534,188** | **2025-05-26** → 2026-04-12 | **176** |
| `fliff` | `routine` | 1,394 | 2026-09-13 | **1** — 🔴 **0 of them NBA markets** |
| 🔴 **`sleeper`** | `routine` | **1,276** | **2026-09-12** | **1** — 🔴🔴 **0 of them NBA markets** |

> 🔴🔴 **CORRECTED 2026-09-21 by §T11.8b — the "one day" above is an artifact of counting rows
> without checking their sport.** **The `routine` rows are the live 2-hour board crons capturing
> mid-September boards, and mid-September is not NBA season**: of Sleeper's 1,276 rows **ZERO carry an
> NBA `market_key`** (530 are provably baseball), and of Fliff's 1,394 likewise **zero**; Underdog's
> `routine` day is **189 NBA rows of 5,281 — 3.6%.**
> ✅ ***So Sleeper has no NBA board rows at all***, which matches `NBA_ENRICHMENT_MINING_AND_FALLBACKS.md`'s
> *"Sleeper has no history anywhere"* **exactly**. **The PrizePicks and Underdog `window`/`close`
> figures are the real NBA backfill and are unaffected.**

🔴 **The owner asked for two seasons of board snapshots for *"sleeper, underdog, and prizepicks"*
(T11 seg 197). Two of the three have them. Sleeper has a single day and a single label.**
*`scrape_sleeper_board.py` exists and is documented — **what is missing is history, not a scraper**.*

🔴 **Two more are partial**: **Betr starts 2025-11-23** and **Pick6 starts 2025-05-26** — **131 and
176 days against PrizePicks' 378. Neither covers the first season.**

⚠⚠ **Why it matters**: the derived-fallback plan the owner set out rests on *"two seasons of data to
train and test our derived fallback"* (T11 seg 676). **For Sleeper there is no training data at all,
and for Betr and Pick6 there is one partial season.**

> ❌ **"NOT RECORDED" RETRACTED 2026-09-21 by §T11.6b — the cause AND the remedy are both on file,
> and the entry below was written without grepping for them.**
>
> - **`NBA_ENRICHMENT_MINING_AND_FALLBACKS.md`** states it outright: ***"Sleeper has no history
>   anywhere → **derived-Sleeper fallback trained on PP/UD snapshots**; live boards from opening day
>   via OUR scrapers."***
> - **`NBA_COMPASS.md`**: *"PrizePicks… and Underdog… boards for both seasons, **no Sleeper**; cost
>   is per REGION per market (`us_dfs,us` = **420 credits/snapshot**)."*
> - **`NBA_PROJECT_LOG.md`**: *"PrizePicks restricted, **UD/Sleeper absent**, history only since
>   Jan 2026; Wayback/GitHub/Kaggle dead ends."*
>
> ✅ **So this is NOT an unmet obligation.** *"Sleeper has no history anywhere"* is a **sourcing fact
> about the world**, not a gap in the backfill, and **the plan for it exists**: a derived-Sleeper
> fallback trained on the PrizePicks and Underdog snapshots, with live boards captured by the
> project's own scrapers from opening day.
>
> 🔴 **What genuinely survives, and it is the §T7.47 shape**: ***all three of those documents are
> OUTSIDE the mandated twelve.*** **A reader of the twelve can see Sleeper's scraper documented and
> cannot learn that Sleeper has no history, that a derived fallback is the plan, or that PrizePicks
> and Underdog are its training set.** **That, and the live figures above, are what this entry is
> for.**

📌 **What is still genuinely open** — and it is narrower than first written: **Betr (`betr_us_dfs`,
from 2025-11-23) and Pick6 (from 2025-05-26) each cover ONE PARTIAL SEASON**, against the owner's
*"two seasons of data to train and test our derived fallback."* **Neither partial range is documented
anywhere** (0 of thirty), **and whether a derived fallback for those two is planned, as it is for
Sleeper, is NOT RECORDED** *(probed in the documents' vocabulary, not only the transcript's)*.

---

## 🔴🔴 EVERY INJURY SNAPSHOT TIMESTAMP CARRIES A HARDCODED `-05:00`
*Found 2026-09-21, T11 pass 3 (§T11.4c). `[LIVE-AUDIT]`, measured across **all 14 month-shards, both
seasons**.*

**`-05:00` appears on every row of every month, 2024-10 through 2026-04. No other offset exists
anywhere in the data.** 🔑 **CENSUS, not a sample (upgraded 2026-09-21, §T11.10c): 1,338,020
timestamps across all 14 shards, `-05:00` on 1,338,020 of them — and 919,949 + 418,071 = 1,338,020
verifies the scan against the index row counts.** The scraper builds it literally:

```python
found.append((f"{d.isoformat()}T{h:02d}:{(m or 0):02d}:00-05:00", url, content))
```

🔴 **The NBA publishes the injury report in EASTERN time, and Eastern is not a fixed offset** — **EDT
(−04:00)** from the second Sunday in March to the first Sunday in November, **EST (−05:00)** the rest
of the year. **The season runs late October → mid-April:**

| period | true ET | stored | effect |
|---|---|---|---|
| **late Oct → early Nov** | **−04:00** | −05:00 | 🔴 **stored instant is ONE HOUR LATE** |
| early Nov → mid-Mar | −05:00 | −05:00 | ✅ correct |
| **mid-Mar → mid-Apr** | **−04:00** | −05:00 | 🔴 **ONE HOUR LATE** |

⚠⚠ **`NBA_SYSTEM_ARCHITECTURE.md` already carries both the warning and the standard.** Its
DST-exposure table lists *"**the injury-report archive** — 'the season crosses DST' — already recorded
as a caveat on the hourly backfill — **⚠ noted**"*, and in the same table praises `nba_asof.py` for
storing `"16:00"` as a **local wall-clock time**: *"**exactly the prescribed pattern, not a fixed
offset**."* ***The injury scraper does the exact thing that sentence names as wrong. The caveat was
noted; the data was never checked.***

📌 **The arithmetic, and no further** (rule 6): a report truly published at **14:30 EDT = 18:30 UTC**
is stored as **14:30−05:00 = 19:30 UTC**, so a cutoff of the form `snapshot_ts <= cutoff`
**excludes snapshots that were genuinely before it** — losing the most recent hour of pre-cutoff
information in the October and April windows. ⚠ **Whether any live consumer filters that way is NOT
RECORDED**; this pass did not trace it.

🔑 **And the magnitude is set by a second finding**: **the league republishes the report 10–27 times a
day** (§T11.3d) — **an hour is several snapshots, not a rounding error.**

📌 **Season-relevant**: the regular season opens **2026-10-20**, which is **inside the EDT window** —
*the defect bites from opening night.*

---

## ⚠ NO NBA PARSER IS RECORDED AS VALIDATED AGAINST THE RUNNER'S OWN EXTRACTION
*Added 2026-09-21 from T11 (§T11.2c). **Past bug with its fix, plus an unchecked class.***

✅ **The past bug, fixed**: the injury-report backfill **scanned 176 days, found every PDF and wrote
zero rows**, because **`pdfplumber` on the GitHub Actions runner drops intra-cell spaces** while the
author's own self-test had used a **different extractor**. Fixed with a space-insensitive team regex,
canonical names, a tolerant header regex and `split_camel()`; **verified on both text shapes — 10 rows
collapsed, 24 spaced** — and a **`probe` mode** was added to the scraper. *Full entry:
`NBA_WORKERS.md` §0.24.*

⚠ **The class it belongs to, and this is what is open**: *"validate parsers on the runner's own
extraction"* appears **in none of the thirty documents** *(probed as the source's words and as the
documents would phrase it)*. **Every NBA parser that reads an external document — injury PDFs,
Wikipedia, any HTML or PDF surface — runs on a runner whose library versions differ from a local
check**, and **NOT RECORDED** is whether any of them was ever validated against the runner's own
extraction. *This pass did not audit them; it records that the question exists and that exactly one
parser is known to have failed it.*

📌 **The tell to watch for, since it is silent**: **a run that finds its inputs and writes zero rows.**
*That shape is already all over this document; the injury backfill is the case where the cause was
pinned.*

---

## 🔴🔴 TWO MORE LIVE API KEYS SIT IN A TRANSCRIPT — **OWNER DECISION O8**
*Found 2026-09-21, T11 pass 0 (§T11.1b). **The key values are deliberately not reproduced here or in
any other document.***

**Where**: owner turns at segments **197** and **641** of
`nba/transcripts/2026-09-10-04-53-47-nba-enrichment-backfill-dfs-boards-2026-09-10.txt`. One is an
earlier **The Odds API** key; the other is the key for the **$30 subscription** the owner bought in
that session.

🔴 **This is the third credential exposure this sweep has found:**
1. **O1** — the live **balldontlie.io** key, committed in `NBA_MASTER_SUMMARY.md` and in the
   transcripts. *Already handed to the owner.*
2. **`nba_config.external_credentials.credential_value_encrypted` is a misnomer** — `NBA_DATABASE.md`
   records it **VERIFIED two ways**: *nothing encrypts and nothing decrypts*; the two readers use the
   value as-is.
3. **These two Odds API keys, in transcript text.**

⚠ **The remedy is the same one O1 carries and it is the owner's: ROTATION.** *Redacting a line does
not remove a value from git history, and this sweep does not rewrite history.*

📌 **What is safe to record about the subscription, and is recorded**: it is **$30**, it is **for NBA
only**, the **older free key stays alive and separate with its own ~500-credit budget**, and the new
key **does not replace it** — the owner said so explicitly. *Two snapshots a day was the plan those
credits were sized for (§T11.1d).*

---

## ⚠ TWO TABLES THESE DOCUMENTS DESCRIBE ARE NOT IN THE DATABASE
*Found 2026-09-21, T10 pass 22 (§T10.22b). `[LIVE-AUDIT]` against `information_schema.tables`, all
`nba%` schemas (**97 objects**). Severity **low–medium**; the question is whether anything was lost.*

**Of 101 schema-qualified object references across the twelve, 90 resolve, 7 are correctly documented
as gone or as traps, and 4 assert a live object that is not there.** *Two of the four were plain
naming errors and are corrected in place (`nba_stats.lineup_synergy` → **`nba_team.lineup_profile`**,
8,000 rows either way; `nba_stats.player_career_totals` → **`nba_stats.player_career_season_totals`**,
3,644 rows). **The other two need the owner:***

| Documented | Status | What the owner may want to decide |
|---|---|---|
| **`nba_market.board_tiers_ud`** — a **section heading** in `NBA_DATABASE.md`, described as *"the **Underdog** version — already implements the four-way rule… uses the FAIR rung, implied probability closest to 50%"* | **Not in the database.** Live: **`nba_market.board_tiers`** and **`nba_market.board_tiers_v2`**, **both 2,199,354 rows.** | **Is `board_tiers_v2` the table this section describes, or was `board_tiers_ud` a separate object that was dropped or never built?** ⚠ **NOT RECORDED** — rule 6; nothing swept so far supplies the mapping, and the section is **kept as written with only the name in doubt.** |
| **`nba_score.real_slip_leg_observations`** — *"139 legs, `decomposition_method='equal_scale_v1'`"*, in **`NBA_DATABASE.md` AND `NBA_MULTIPLIERS.md`** *(the second site found at §T10.24b, one pass after the first was flagged)* | **Not in Postgres — and not on the DROPPED-2026-09-19 list two lines below it.** 🔑 **But `NBA_DATABASE.md`'s MLB inventory lists `score.real_slip_leg_observations` as an MLB **D1** object** — *"All 12 MLB D1 bindings report FALSE"* — **so the likeliest reading is that the 139 legs are MLB's and the `nba_score.` prefix is the error.** | **Is the NBA-prefixed table a mis-prefixed MLB D1 object, dropped after 2026-09-19, or never created?** ⚠ **NOT RECORDED — and not probed: confirming it means querying MLB's D1, and MLB is out of scope.** *The finding that rests on it — "there is **no NBA slip history**" — is unaffected in direction: the table is not there at all, which is a stronger version of the same statement.* |

📌 **Neither is fixed and neither is renamed on a guess.** *"Document, don't fix" governs the system;
these two are questions about the system, not defects in the prose.*

---

## ⚠ `factor_gate_results` IS IN `nba_score`, AND MOST OF ITS MENTIONS IN THESE DOCUMENTS OMIT THE SCHEMA
*Found 2026-09-21, T10 pass 16 (§T10.16e). Severity **low**; fix trivial; it costs a reader their
first query.*

**Live**: `nba_score.factor_gate_results` — **104 rows**, verified. ✅

🔴 **But it is named beside `nba_config.factor_registry` (67) and `nba_config.factor_relevance` (460)
in almost every passage that discusses the relevance gate — and 15 of its 24 mentions across the
twelve carry no schema**, in `NBA_DATABASE.md`, `NBA_FINAL_SCORING_CALIBRATION.md`,
`NBA_GLOSSARY.md`, `NBA_MASTER_SUMMARY.md`, `NBA_OPEN_ITEMS.md` and `NBA_WORKERS.md`.

**The natural inference from the surrounding text is `nba_config`, and it is wrong.** *Recorded
because this sweep made exactly that inference: the pass-16 verification query named
`nba_config.factor_gate_results` and errored with `relation … does not exist`.*

📌 **OWNER DECISION (minor)**: qualify the 15 bare mentions, **or** state once in `NBA_GLOSSARY.md`
that the factor tables span two schemas — `nba_config` for the registry and the relevance matrix,
`nba_score` for the gate results — and leave the short form alone. *Not fixed: "document, don't fix"
governs the system, and this is a documentation defect the owner may prefer to settle one way for all
cross-schema names rather than piecemeal.*

---

## 🔴 THE 2025-26 MATCHUPS SHARDS ARE ONE GAME SHORT AND ONE COLUMN SHORT
> 📌 **Precision note, 2026-09-21 (§T10.27b):** `covered` and `empty` in the shard index are **lists
> of game ids**, not scalar counts — the figures below are their lengths. **So 2025-26 lists 1,229
> ids as covered and none as empty against a 1,230-game season: the missing game is absent from
> BOTH lists, not mis-counted in a field.** *Re-verified 2026-09-21; every figure unchanged.*
*Recorded 2026-09-21 (T10 pass 4, §T10.4b). `[LIVE-AUDIT]` — verified from the shard files and their
index metadata on disk. **Not a transcript finding.***

`nba/data/nba_matchups_pergame_<slug>_<yyyy-mm>.json` — **columnar monthly shards, 7 per season**,
with an index carrying coverage. **The scheme works**: ~29 MB per season against the *"~170 MB as row
dicts"* it replaced — **a ~6× reduction** — and **no shard above 5.7 MB** against GitHub's 100 MB limit.

| Season | Covered | `empty` | Rows | Columns |
|---|---|---|---|---|
| 2023-24 | **1,228** | **2** | 230,877 | 29 ✅ *(1,228 + 2 = 1,230)* |
| 2024-25 | **1,230** | 0 | 232,830 | 29 ✅ |
| **2025-26** | **1,229** | **0** | 241,590 | **28** |

🔴 **(1) The index does not account for the missing game.** *(Narrowed 2026-09-21 by §T10.5b: **the
1,229/1,230 shortfall itself is already recorded** — `NBA_ENRICHMENT_MINING_AND_FALLBACKS.md` line 195
states it in the coverage table beside the other two seasons, with matching row counts. **The defect
is the bookkeeping, not the shortfall.**)* The index records **`covered: 1,229`** and **`empty: 0`**,
**so a consumer reading the index alone sees a complete season** — where 2023-24's index partitions
correctly at **1,228 + 2 = 1,230**. The twelve record **1,230** for 2025-26, including
`NBA_DATABASE.md`'s identity *"**12,300 = 10 starters × 1,230 games** — an identity that only holds if
every game parsed correctly."*

🔴 **(2) `matchupMinutesSort` is missing from the current season only.** It is present in 2023-24 and
2024-25, **absent from 2025-26**, and **`scrape_nba_matchups_pergame.py:33` lists it in `KEEP`.**
✅ **Benign on today's code path** — `nba_asof.py`'s `_minutes()` mentions it only in a docstring and
parses `matchupMinutes`, which is what `aggregate_matchups_asof` sums. 📌 **Why it is absent is NOT
RECORDED.** ⚠ **But it is a silent schema difference across seasons of one dataset, in the season the
system is about to run on.**

🔑 **OWNER DECISION** — whether to re-scrape the 2025-26 pairings *(which would settle both at once)*,
and whether the index should assert `covered + empty = schedule games` so a shortfall fails loudly
instead of reading as complete. **A re-scrape and a code change; this sweep does neither.**

---

## 🔴🔴 THE SEASON ROLLS IN ONE LAYER AND IS FROZEN IN THE OTHER — the other half of the Oct-1 boundary
*Recorded 2026-09-21 (T9 pass 14, §T9.29a). `[LIVE-AUDIT]` — verified by enumerating `os.environ.get`
across `nba/**/*.py` and the `env:` blocks of `.github/workflows/*.yml`. **Not a transcript finding.***

**Read this beside the Oct-1 item.** That one is the **scraper** layer rolling to `2026-27` on
**2026-10-01**, nineteen days before the opener. **This is the analysis and backtest layer not rolling
at all.**

| | |
|---|---|
| Distinct env vars under `nba/**/*.py` | **194 = 191 + 3** *(174 → 193 → 194; §T9.30b then §T9.31a)* — **191** in the files' own code, **3 (`BT_REPLAY`, `BT_INJURY`, `BT_CUTOFF`) only inside the patcher's embedded replacement source** |
| **With a hardcoded season-string default** (`"2025-26"`, `"2024-25"`, `"2025_26"`, or a season date bound) | **47** |
| Set by at least one workflow — **to a literal, or to an input with a literal fallback** | **45** |
| **Never set by anything; the frozen default is what runs** | **2** — `RUNG_FROM` (`2024-10`), `RUNG_TO` (`2026-04`) in `nba/build_rung_market.py` |
| NBA Python files importing `nba_season` / `active_stats_season` | **20 of 135** |

```yaml
UA_TEST_SEASON: "2025-26"        RT_TRAIN_SEASON: "2024-25"       N1_TEST: "2025-26"
ALLOC_SEASONS: ${{ github.event.inputs.seasons || '2025-26' }}
LOAD_ASOF:     ${{ github.event.inputs.asof    || '2026-03-15' }}
```

**The one computed setter is `SEASON_SLUG` / `INJURY_SEASON_SLUG`** (`steps.cfg.outputs.slug`) — **and
its own fallback is the literal `2024_25`**, not `nba_season.py`. 📌 Three workflows set
`BT_TEST: ${{ github.event.inputs.season }}` with **no fallback**, so a dispatch without the input
leaves it empty and the Python default `"2025-26"` applies — *a default behind a default.*

✅ **This does NOT contradict the documented claim.** `NBA_DEEP_DOCUMENTATION_CHECKPOINT_2026-09-09.md`
says *"`nba/nba_season.py` — the one source of truth for season strings, replacing a universal
hardcoded `Season=2025-26` **across 13 scrapers**"* — **the scope is in the sentence, and it is true
of the scrapers.** This is an addition to it.

🔑 **OWNER DECISION — folded into the Oct-1 decision, because the date is the same.** From 2026-10-01
the scraper layer says `2026-27` and the analysis layer says `2025-26`, **and nothing reconciles
them**. *Whether the analysis layer should follow `nba_season.py`, stay pinned deliberately, or be
made to fail loudly on a mismatch is a design choice this sweep does not make.*

---

## 🔴🔴 THE BASELINE LADDER IN POSTGRES HOLDS TWO DEPTH REGIMES UNDER ONE `recipe_version`
*Recorded 2026-09-21 (T9 pass 12, §T9.27b). `[LIVE-AUDIT]` — verified by SQL and by reading the
workflows; **not a transcript finding**.*

> 🔑 **WHICH DAY IS IN WHICH REGIME — resolved 2026-09-21 (T10 pass 25, §T10.25b).**
> **`nba_score.baseline_ladder_runs` records `loaded_at` per as-of day**, and `LADDER_DEPTH` landed
> **2026-09-19 23:58:44 UTC**:
>
> | as-of day | `loaded_at` (UTC) | props | vs `LADDER_DEPTH` | regime |
> |---|---|---|---|---|
> | **2026-03-15** | **2026-09-11 20:23:10** | **18** | before | **flat `BT_LADDER_STEPS`** |
> | **2026-01-15** | **2026-09-19 22:35:04** | **22** | before, by **1h 23m** | **flat `BT_LADDER_STEPS`** |
> | **2025-11-29** | **2026-09-20 03:23:26** | **22** | **after, by 3h 25m** | **per-prop `LADDER_DEPTH`** |
>
> 🔑🔑 **AND THE ATTRIBUTION IS NOW PROVEN IN THE ROWS, NOT INFERRED FROM TIMESTAMPS (T10 pass 26,
> §T10.26b).** `SELECT asof, prop, max(abs(ladder_offset)) FROM nba_score.baseline_ladder GROUP BY 1,2`:
>
> | prop | `LADDER_DEPTH` | **2025-11-29** | **2026-01-15** | **2026-03-15** |
> |---|---|---|---|---|
> | `points` | **14** | **14** ✅ | 10 | 10 |
> | `rebounds` | **6** | **6** ✅ | 10 | 10 |
> | `assists` | 5 | **6** ⚠ | 10 | 10 |
> | `threes_made` | 4 | **6** ⚠ | 10 | 10 |
> | `oreb` | **3** | **3** ✅ | 10 | *(absent)* |
> | `steals` | **2** | **2** ✅ | 10 | 10 |
> | `blocks` | **2** | **2** ✅ | 10 | 10 |
>
> ***2025-11-29 carries seven different depths; the other two carry a flat 10 on every prop.*** **The
> two-regime finding is visible in the data, and the timestamp attribution is confirmed by the rows
> it predicted.** ⚠ **The `assists` 6-against-5 and `threes_made` 6-against-4 discrepancies already
> on file are now LOCATED — they are on the per-prop day and only there.** *Why: still NOT RECORDED.*
>
> ✅ **Exactly the "after two of three loads" already on file, now with the days named.** *The
> `source_file` column also names each day's JSON (`nba_baseline_ladder_<asof>.json` plus
> `nba_baseline_ladder_latest.json`), and the 2026-03-15 load is consistent with
> `TRIGGER_NBA_BASELINE.txt`'s last commit of 2026-09-11 17:18 UTC.*
> ⚠ **What is still NOT RECORDED is what BUILT the two later JSON files** — the table records the
> **load**, not the build. *That half of the old note stands; the other half is closed.*

**`ladder_depth(prop)` takes an env override before the measured table**, and the override is set on
the path that built the rows now in Postgres:

```python
env = os.environ.get("BT_LADDER_STEPS")
if env: return int(env)          # flat, every prop
return LADDER_DEPTH.get(prop, 10)   # the measured per-prop table
```

🔑 **And the cost of the flat 10 is already graded per prop, in `NBA_GOBLIN_DEMON.md` lines 496–504**
*(located 2026-09-21, §T9.41a)* — a table of **Prop · Anchor · p95 distance · "Our ±10" · Fixed to**
whose middle column reads **short · short · short · short · wasteful · wasteful · very wasteful · very
wasteful**, and whose "Fixed to" column **equals `LADDER_DEPTH` on all eight props it covers**
(p95 + 1 for the five short/wasteful ones, p95 exactly for the three deep composites).
**So the override is not merely undocumented-in-effect — the document that proposed replacing it
already measured what it costs.** *The provenance of the other 12 `LADDER_DEPTH` keys is unrecorded.*

`nba-baseline.yml` reads `ladder_steps:` from `nba/TRIGGER_NBA_BASELINE.txt`, which currently reads
**`ladder_steps: 10`**. `nba-p2-overnight-heavy.yml` deliberately leaves it unset, with the reason in
the file: *"Points needs 14 rungs, steals needs 2; one number cannot be right for both."*

| as-of | max rung | regime |
|---|---|---|
| **2025-11-29** | `points` **14** · `steals` **2** · `blocks` **2** · `oreb` **3** | **per-prop** — **13 of the 20 `LADDER_DEPTH` keys match exactly** *(corrected from "ten" 2026-09-21, §T9.30a)*; the other 7 are the five composites, `assists` and `threes_made`. **13 + 7 = 20, plus `stocks`/`double_double` = 22** ✅ |
| **2026-01-15** | **10 on every prop** | flat |
| **2026-03-15** | **10 on every prop** | flat |

🔑 **AND THE CAUSE IS CHRONOLOGICAL — added 2026-09-21, §T9.43a.** `LADDER_DEPTH` and
`ladder_depth()` landed in one commit, `3cda5a12`, **2026-09-19 23:58:44 UTC**. **The 2026-03-15 day
was loaded 8 days earlier and the 2026-01-15 day 1h 24m earlier — before the per-prop table existed at
all — and the 2025-11-29 day 3h 25m after it.** *So the split is not someone setting the override on
some days and not others; it is a table that had not been written yet.* ⚠ **This raises the stakes
rather than lowering them: only ONE of the three as-of days was built with the per-prop table, the
override is still live, and `TRIGGER_NBA_BASELINE.txt` still reads `ladder_steps: 10` — so the next
`nba-baseline.yml` run flattens it again.** 📌 *That trigger file's last commit is 2026-09-11 17:18
UTC, so `nba-baseline.yml` built the 2026-03-15 day and nothing after it; what built the other two is
NOT RECORDED.* *(🔑 **narrowed 2026-09-21, §T10.25b — the LOAD is recorded even though the BUILD is
not**: `nba_score.baseline_ladder_runs.loaded_at` reads **2026-09-11 20:23:10 · 2026-09-19 22:35:04 ·
2026-09-20 03:23:26 UTC**, each with its own `source_file`, which places **2026-03-15 and 2026-01-15
before `LADDER_DEPTH` (2026-09-19 23:58:44) and 2025-11-29 after it.**)*

🔴 **All three carry the identical `recipe_version` string and there is no column recording depth**,
so nothing in the table tells a consumer which regime a row came from. **A join across as-of days
mixes two products under one label.**

**Already on file, and this does not supersede it**: the override is recorded as *"a legitimate
escape hatch, but nothing marks it as one that should not be left set"*. **What is new is that it IS
set, and that the consequence is now visible in the data.**

### 🔴🔴 AND THE EXTRA RUNGS CARRY FULL CONFIDENCE CREDIT — *added 2026-09-21, §T9.33b*

**30,989 ladder rows sit beyond their prop's measured `LADDER_DEPTH`**, and **92.3% of them (28,596)
are at `p_more` ≤ 0.01 or ≥ 0.99** *(figures corrected 2026-09-21 by §T9.34a: they first read 28,563
and 92.2%, computed with a **strict** `< / >` predicate while the prose said `≤ / ≥`)*. *(Within the
measured depth: 168,357 rows, 18,166 extreme — 10.8%.
**168,357 + 30,989 = 199,346**, + `stocks` 6,350 + `double_double` 541 = **206,237** ✅.)*

🔴 **All 30,989 report `used_emp = true`** — and downstream that flag is a multiplier, not a
diagnostic:

```python
build_confidence_v3.py:62   f_prov = d["used_emp"].fillna(False).astype(float) * 0.7 + 0.3
build_final_hp.py:344 · score_board_legs.py:234   np.where(used_emp, 1.0, 0.30)
```

**A rung beyond the measured useful depth therefore carries provenance 1.0 rather than 0.30 — a 3.3×
confidence factor — and nothing that scores a leg reads `LADDER_DEPTH` at all.**

> ⚠ **QUALIFIED 2026-09-21 (§T9.38b).** The literal claim holds — **no downstream code reads
> `LADDER_DEPTH`** — but the confidence model is **not depth-blind**:
> `f_depth = np.clip(1.0 - |ladder_offset| / 14.0, 0.25, 1.0)` at weight **0.14**
> (`build_confidence_v3.py:61`), giving 0.857 at offset 2, 0.286 at 10, floored at 0.25 from 10.5 out.
> 🔴 **The defect is the SCALE: `14.0` is exactly `LADDER_DEPTH["points"]`, applied to all twenty
> props** — `steals` at offset 10 (five times its measured depth of 2) is penalised identically to
> `points` at offset 10 (inside its measured depth of 14). **The same per-prop-versus-flat failure as
> O5, one layer up.**

⚠ **The builder's own comment claims the opposite**: *"deeper rungs with too few samples fall through
the existing hierarchy to the parametric, which is the designed behaviour."* **Live, of 206,237 rows,
559 have `used_emp = false` — and 541 of those are `double_double`** (a binary prop with no ladder).
**The genuine fall-throughs are 18 rows of `threes_made`, 0.009% of the table.**
✅ **ANSWERED 2026-09-21 by §T9.42b — and it sharpens this item rather than softening it.**
`classification_ladder_v12.py` 612–632: **`used[i]` is set the moment ANY of three cell granularities
returns a value** — `levels = (emp3.get((v, off)), emp2.get((v, r, off)), emp.get((t, r, off)))` —
**and the sample count `n` never gates it.** `n` enters **only as a shrinkage weight**:
`n/(n + K_CELL)` in shift mode, `(n·c + K·base)/(n + K)` in replacement. **A cell with `n = 1` sets
`used_emp = True` and moves the probability almost not at all.**

**So the builder's comment is true in EFFECT and the flag does not record it.** *"Deeper rungs with
too few samples fall through the existing hierarchy to the parametric"* — **the shrinkage does exactly
that**; `used_emp` reports only that **a cell existed**. 🔴 **Which is why this item stands: the deep
rungs are correctly shrunk toward the parametric, and `f_prov` still grants them the full 1.0
provenance credit, because the flag it reads cannot tell a rung backed by 400 observations from one
backed by 1.**

### 🔴🔴 `f_phase` IS COMPUTED, JUSTIFIED AND NOT IN THE CONFIDENCE SUM — *added 2026-09-21, §T9.38a*

`build_confidence_v3.py`'s `FACTOR_COLS` declares **ten** factors. **`f_phase` carries a six-line
justification with measured figures** — *"SEASON PHASE as a confidence factor, not just a reporting
slice… the gap decaying **+1.46 / +1.30 / +0.88 / +0.13 pp** across those four… **a confidence
question, not a probability one**"* — a rank map (`1_oct_nov` 0.80 · `2_dec_asb` 1.00 · `3_post_asb`
0.88 · `4_push` 0.92), and a place in the `attach` block.

**The `raw` sum has nine terms and `f_phase` is not one of them.** ✅ **The nine weights total exactly
1.00**, so this is structural, not a dropped term — **adding `f_phase` would require renormalising
every other weight.** *The factor is exported for inspection and changes no confidence value.*

⚠ **It matters most where the justification says it does**: `1_oct_nov` carries the **lowest**
reliability rank (0.80), and **the season opens 2026-10-20** — so the regime the factor was written to
discount is the one the system is about to enter.

🔑 **OWNER DECISION** — whether `f_phase` should enter the sum (and the other weights renormalise), or
whether it is deliberately inspection-only and should be labelled as such. **A code change this sweep
does not make.**

### 🔑 THE FIX ALREADY EXISTS ONE TABLE OVER — *§T9.33c*

`nba/load_baseline_history.py` creates **`nba_score.baseline_history`** with a
**`ladder_steps int`** column and writes `meta.get("ladder_steps")` into it.
**`nba_score.baseline_ladder` has `recipe_version` and no depth column.** *A 0.5% sample of
`baseline_history` (97,603 rows) returns `ladder_steps = 10` uniformly.*

🔑 **OWNER DECISION** — narrowed by §T9.33c from "design something" to a concrete choice:
**(a)** carry **`ladder_steps`** into `baseline_ladder` exactly as `baseline_history` already does, so
the regimes are distinguishable; **(b)** decide whether the three existing as-of days should be
rebuilt to one regime before they are used as a baseline; and **(c)** decide whether anything that
scores a leg should read `LADDER_DEPTH` before granting full provenance credit *(⚠ and, per §T9.38b,
whether **`f_depth`'s hardcoded `14.0` should become the prop's own `LADDER_DEPTH`** — today it is
`points`' depth applied to all twenty)* — **today nothing
does.** *Not actioned — this sweep documents only.*

📌 **NOT RECORDED**: `assists` reaches rung **6** against a table value of **5**, and `threes_made`
**6** against **4**, on the 2025-11-29 day. **6 is the module constant at line 66.** The mechanism is
not recorded and is not asserted.

---

## 🔴 THE FOUR "CLOSE" PROPS WERE NEVER CERTIFIED — and the reason given was explicitly unproven
*Recorded 2026-09-21 (T9 pass 1, §T9.16a), from T9's own phase-status answer. The distinctive terms
(`certified 6`, `variance-bound`, `star bimodality`, `40-47%`) return **zero hits** across the thirty.*

At T9 the single-stat props split **6 certified / 4 close**:

| | Props | State |
|---|---|---|
| **Certified 6** | points · rebounds · assists · 3PM · fga · ftm | *"ladders ≤1.5 pp on all 13 rungs, **zero band×direction×rung cells over 2.5 pp**, confidence bands hitting their rate on both seasons"* |
| **Close 4** | **blocks · steals · turnovers · fouls** | *"ladders fine, **2–5 confidence bands per season off by 2.6–4.4 pp**. These are the noisiest per-game stats in the sport."* |

**The reason evolved within T9 itself** *(corrected 2026-09-21, T9 pass 2)*:
- **Early**: *"my honest read is that they're at the **noise floor**, but **I haven't proven that with
  a variance-bound argument**."*
- **Settled, §T9.14e**: *"I'd now call their remaining residual **the noise floor of 0–2 count
  stats** rather than a missing factor"* — **reached after the opponent factors were measured and
  found real but insufficient.** A principled stop, not a shrug.

⚠ **What remains open**: the four props were **never certified**, and **no variance-bound proof
exists** — the conclusion rests on measurement plus judgment. *Whether they were later certified,
left uncertified, or shipped as-is is **NOT RECORDED**.* **Flagged for the transcripts after T9.**

🔑 **And the sourcing the owner asked for is missing from the documents.** The directive was
*"research online, **multiple sources**"*; the research came back and says the same thing —
*"projections are **inherently more volatile** when you're trying to hit **minuscule targets** — the
kind you see in stats like **turnovers or blocks**… unless you're Victor Wembanyama…"* — but
**none of it is recorded** (`minuscule`, `inherently more volatile`: zero hits across the thirty).
*"We stopped at the noise floor" is a weaker sentence than "we stopped at the noise floor, and
independent analysis of low-count NBA props says the same" — and the owner asked for the second one.*

*Also from the same answer, for the record — the six-item "what's missing" list and its order of
attack: 4Q/2H mixture → remaining period stats + halves → period holdout → close-prop noise-floor
proof → production worker. **Item 6 is notable**: at T9, "**nothing writes the baseline ladder to
Postgres yet; everything lives in the backtest harnesses**."*

## ⚠ THE `variation_bands` TABLE COVERS 6 OF 28 PROPS — **but the LIVE dimension is code, and covers 15**
*`[LIVE-AUDIT]` **VERIFIED** 2026-09-21 (T8 pass 7, **corrected T9 pass 6**). Detail:
`NBA_MASTER_SUMMARY.md` §T8.28, §T9.21a.*

> 🔴🔴 **CORRECTION FIRST, because it changes what this item means.** The variation bands the system
> actually uses are **`VBANDS_ALL`**, a Python dict at `nba/backtest/classification_ladder_v12.py`
> **line 114**, read at line 519 — **15 props**: `assists · blocks · dreb · fg3a · fga · fgm · fta ·
> ftm · oreb · personal_fouls · points · rebounds · steals · threes_made · turnovers`.
> **`nba_config.variation_bands` has 6 rows and zero code references.**
>
> **So the variation dimension is not under-built — it is hardcoded**, the third instance of the
> §2-banner pattern and the third in that same file (`ROLE_TIERS` line 129; the decay `PROPS` dict).
> *§T8.14b's "empirical vindication of the variation dimension" rests on 15 props, not 6.*
>
> ⚠ **The documented expansion checklist is why the tables lag**: `NBA_COMPASS.md` line 130 —
> a new prop requires extending *"**PROPS config, `VBANDS_ALL`, and the factor-feature map**"* —
> **three code structures. Neither `variation_bands` nor `prop_taxonomy` is on the list**, which is
> exactly why the four stat-menu props reach the ladder and neither table.
>
> **What remains open**: which of the two is meant to be authoritative. *Not recorded.*

**The table's own coverage, for the record:**

| `prop_taxonomy.build_tier` | Props | With a variation band | With a profile cell |
|---|---|---|---|
| **A** — core, all three apps | **13** | **6** | 7 |
| **B** — derivable, app-specific | **15** | **0** | 2 |

**The 6 banded props**: `points` (role-banded — `FRINGE·ROLE·STARTER·STAR·SUPERSTAR`, the only prop
using that family) and `assists`, `rebounds`, `threes_made`, `pra`, `fantasy_score` (line magnitude —
`LOW·MID·HIGH·ELITE`).

**The 22 unbanded, by the tier column rather than by kind** *(corrected 2026-09-21, T8 pass 9)*:

- **Tier A — 7**: `blocks` · `steals` · `stocks` · `turnovers` (the defensive and negative props, all
  core on all three apps) and the composites `pts_ast` · `pts_reb` · `reb_ast`
- **Tier B — 15**: the nine period layers (`points_1q/1h/2h/4q`, `assists_1q`, `rebounds_1q`,
  `threes_made_1q`, `pra_1q`, `fantasy_score_1q`), the milestones `double_double` · `triple_double`,
  the attempt props `fga` · `fg3a` · `ftm`, and `personal_fouls`

**7 + 15 = 22, and 6 + 22 = 28.**

⚠ **Why this is an open item and not a backlog note**: **variation is one of the owner's five tiering
dimensions**, and §T8.14b records the band-level residual as *"the empirical vindication of the
variation dimension"* — *"per-band cells fixed what per-prop k couldn't."* **That evidence comes from
6 props of 28.** *Whether the other 22 are meant to inherit a default band, to be banded later, or to
run unbanded is **NOT RECORDED**.* ✅ Referential integrity itself is clean — **0 orphans** in every
direction tested.

## 🔴 THE PRODUCTION LADDER WRITES FOUR PROPS THE CANONICAL TAXONOMY DOES NOT DEFINE
*`[LIVE-AUDIT]` **VERIFIED** 2026-09-21 (T9 pass 4). Detail: `NBA_MASTER_SUMMARY.md` §T9.19c.*

`nba_score.baseline_ladder` (**206,237 rows**, 3 as-of days) carries 22 distinct `prop` values.
**Joined to `nba_ref.prop_taxonomy.canonical_prop_key`, four do not resolve:**

| Prop | Ladder rows |
|---|---|
| `dreb` | 4,315 |
| `fgm` | 4,773 |
| `fta` | 3,935 |
| `oreb` | 3,185 |
| **Total on unresolvable props** | **16,208** |

**These are exactly the props the 2026-09-12 stat-menu expansion added** (`NBA_COMPASS.md` line 130:
*"added fgm/fta/dreb to the singles recipe — certified both seasons"*) — **added to the recipe and
not to the taxonomy.**

⚠ **This is the concrete consequence of the entry below.** Nothing in `nba/` speaks
`canonical_prop_key`, so **no join exists that would have caught it**: a production table keyed on
`prop`, four of whose values have no canonical definition, and nothing to notice. *Whether the
taxonomy is meant to grow with the recipe is **NOT RECORDED**.*

*(Also recorded: the ladder is populated but **not yet a daily artifact** — three hand-picked as-of
days in 2025-26, loaded out of chronological order over ten days. T9's item 6, *"nothing writes the
baseline ladder to Postgres yet"*, is **closed**; the cadence is not.)*

## 🔴 NO NBA CODE SPEAKS `canonical_prop_key` — the taxonomy's vocabulary is unused on the NBA side
*`[LIVE-AUDIT]` **VERIFIED** 2026-09-21 (T8 passes 4 and 6). Detail: `NBA_MASTER_SUMMARY.md`
§T8.25b, §T8.27b.*

| | |
|---|---|
| `nba_ref.prop_taxonomy` | **28 rows, fully populated** — every descriptive column set on all 28, all `active = 1` |
| Code reading `nba_ref.prop_taxonomy` | **ZERO.** The six files matching `prop_taxonomy` are **MLB's** (`config_prop_taxonomy`, `static_prop_taxonomy`), with **no `nba_*` schema reference in any of them** |
| **`canonical_prop_key` in the codebase** | **1,218 references — and ZERO under `nba/`.** All of them are the MLB fleet: `score-prep`, the certifiers, the parlay boards, the market-line-shape classifier, the score audit |
| NBA board scrapers | `scrape_underdog_board.py` · `scrape_sleeper_board.py` · `scrape_fliff_board.py` — **no `taxonomy`, no `canonical_prop`**; they emit raw board JSON (`legs[]`, `appearances`, `players`) |

**So this is not simply "a table nothing reads."** The NBA side **defines** the canonical prop
vocabulary and **never speaks it**, while MLB uses the same key 1,218 times.

⚠ **What is supposed to translate a scraped board leg into a canonical prop key on the NBA side — and
whether that step exists yet — is NOT RECORDED.** It belongs to the board/grader transcripts this
sweep has not reached. **Flagged so those transcripts are read with this question in hand.**

### 🔑 And an earlier architectural judgment says where it was supposed to live (T8 pass 8)

`NBA_DEEP_DOCUMENTATION_CHECKPOINT_2026-09-04.md` line 99 recorded the table, then empty, as
**"correctly empty"** — with a reason:

> *"canonical prop-key definitions (points/rebounds/PRA/etc.) **belong to the Board/Scoring layer,
> explicitly out of scope**"*

**Five days later T8 seeded it into the config layer, 28 rows.** So: **the table now lives where the
earlier judgment said it should not, and the layer that was supposed to own it still does not speak
its key.** *These are one question, not two.* ⚠ *Per rule 6 no cause is offered — whether the
seeding superseded that judgment or simply preceded its consumer is **NOT RECORDED**.*

## 🔑 THE OWNER'S ACCURACY STANDARD IS SCOPED — *"within the baseline ladder"*
*Recorded 2026-09-21 (T8 pass 3, §T8.24b). The qualifier returns **zero hits** across all thirty
documents.*

The rigour directive is carried in the documents in two halves, 270 lines apart — §T8.6 has
*"any time you see it needs deeper testing and calibration, do not move before fixing it"*, and the
standard clause appears separately as *"a perfect formula, very sharp"*. **Neither carries the
owner's closing words:**

> *"…the final work should be a perfect formula, very sharp, where the real outcomes fit perfectly
> most of the times, with a very high level of accuracy, **WITHIN THE BASELINE LADDER**."*

⚠ **The qualifier scopes the standard.** The bar is outcomes fitting **within the ±6-rung anchored
baseline ladder** — **not** across the enrichment or scoring layers, which did not exist when it was
stated. **Recorded so a later reader does not apply the "perfect formula" bar to layers the owner
did not scope it to** — and so that, when those layers are assessed, it is clear the owner has not
yet set a standard for them.

## 🔴🔴 THE Oct-1 ROLLOVER, **RE-RATED**: nineteen days and six scheduled runs, not two days and none
*`[LIVE-AUDIT]` **VERIFIED** 2026-09-21 by reading and executing `nba/nba_season.py` (T7 passes
22–25). Detail: `NBA_MASTER_SUMMARY.md` §T7.51a, §T7.53a, §T7.54. **Document, don't fix — nothing was
changed.***

> ⚠ **This is a RE-RATING of an existing item, not a new finding, and the distinction matters.**
> **Item ② below in this same file** — *"`active_stats_season()` returns a data-less season on
> Oct 1–2"* — already recorded the `month >= 10` branch and the empty-write failure shape, and rated
> it **"low impact (P1 runs Mondays; 2026-10-01 is a Thursday)"**, measured against *"opening night
> is 2026-10-03."*
>
> **That date is the PRESEASON opener.** Against the real regular-season opener, **2026-10-20**:
> - the window is **nineteen days, not two**;
> - it contains **three Mondays — Oct 5, 12, 19** — so the Monday argument that produced "low impact"
>   now produces **six scheduled runs** (two weekly workflows × three Mondays);
> - and the write is not merely "empty aggregates" but an **upsert over last season's real row**
>   (below).
>
> **The owner's 2026-10-20 correction is what re-scored this item.** Item ② should be read as
> superseded by this entry.
>
> ### 🔴🔴 And the boundary WAS tested — with the wrong date (T7 pass 29, from the transcript itself)
> T7's own verification output for `nba_season.py`:
> ```
> 2026-09-08   '2025-26', '2024-25', '2023-24'   dupes: false
> 2026-10-03   '2026-27', '2025-26', '2024-25'   dupes: false
> 2027-02-01   '2026-27', '2025-26', '2024-25'   dupes: false
> 2027-08-01   '2026-27', '2025-26', '2024-25'   dupes: false
> ```
> **Four sample dates, one of them 2026-10-03 — the date everyone believed was opening night. On
> that date `2026-27` is the right answer, so the test passed.** **Oct 1 and Oct 2 were never
> sampled, nor any date between Oct 3 and Oct 20.**
>
> **So the boundary is not an oversight: it was verified by a test whose sample points came from a
> wrong opening date.** One wrong date → a wrong test → a passing result → a *"low impact"* rating →
> **O4**. *This is what the 2026-10-20 correction was worth.*

```python
if today.month in (7, 8, 9):   start_year = today.year - 1
else:                          start_year = today.year if today.month >= 10 else today.year - 1
```

**A bare month boundary. On 2026-10-01 it returns `2026-27`.**

| | |
|---|---|
| First regular-season game (prefix `002`) | **2026-10-20** |
| First preseason game (prefix `001`) | 2026-10-03 |
| **`active_stats_season()` switches** | **2026-10-01** |
| **Exposure window** | **Oct 1 → Oct 19 — nineteen days**, opening **ten days from 2026-09-21** |

⚠ **The module's own docstring states the opposite intent and names the exact damage**: *"rolling
over to the new season **only once it starts in October**"* and *"…they'd get empty or zero-valued
rows — and **for tables keyed by player_id alone, that could overwrite last season's real stats with
zeros**."* **That is the state the Oct-1 boundary creates for nineteen days.**

**The exposed set is FIFTEEN scrapers** *(corrected 2026-09-21, T7 pass 27 — the earlier figure of 13
counted files rather than call sites, included a diagnostic, and misclassified one scraper)*:

- **12 direct callers of `active_stats_season()`**: `scrape_nba_daily_delta` · `scrape_nba_lineups` ·
  `scrape_nba_matchups_pergame` · `scrape_nba_onoff` · `scrape_nba_per_game_delta` ·
  `scrape_nba_player_bio` · `scrape_nba_player_tracking` · `scrape_nba_playtypes` ·
  `scrape_nba_shotquality` · `scrape_nba_splits` · `scrape_nba_team_stats` ·
  `scrape_nba_tracking_detail`
- **+3 exposed transitively through `stats_seasons()`**, which is anchored on `active_stats_season()`
  by its own code and docstring: `scrape_nba_backfill_measure_types` · `scrape_nba_periods` ·
  `scrape_nba_season_tables`

*(3 scrapers are **not** exposed — `scrape_nba_schedule`, `scrape_nba_stats_players`,
`scrape_nba_stats_teams` — all on `current_season()`, correct for roster/schedule. 12 + 3 + 3 = the
documented 18 that use the helper.)*

**This is the season-rollover trap the module was written to eliminate, re-entering through the
module itself.** *Whether the Oct-1 boundary was deliberate is **NOT RECORDED**.* ⚠ And
`NBA_COMPASS.md` line 9 documents the switch as **"Oct 3"** — **the document and the code disagree,
and neither matches the 20th.**

### 🔴🔴 The dates, verified by execution (T7 pass 23)

The module was imported and called with fixed dates — **read-only, nothing written or triggered**:
**2026-09-30 → `2025-26`; 2026-10-01 → `2026-27`.** And `stats_seasons(3)` flips the same day from
`['2025-26','2024-25','2023-24']` to **`['2026-27','2025-26','2024-25']`** — **dropping the oldest
real season and adding an empty one**, which is the same bug family its own docstring records having
already fixed once.

**Six scheduled runs fall inside the window.** Only four NBA workflows are scheduled at all;
**two of them run the affected scrapers weekly on Mondays** — `nba-scrape.yml` (`0 9 * * 1`) and
`nba-p1-weekly-static.yml` (`0 19 * * 1`). **Mondays between Oct 1 and the Oct 20 opener:
`2026-10-05`, `2026-10-12`, `2026-10-19`.**

> **2 workflows × 3 Mondays = 6 scheduled runs against an empty `2026-27`, before a single
> regular-season game is played.**

### 🔴🔴🔴 And it COMPOSES with two other documented defects (T7 pass 24)

Three facts, each recorded separately in these documents, **never recorded together**:

1. **The scrapers' season moves on 2026-10-01** (above, verified by execution).
2. **Four workers hardcode `'2025-26'` with no meta fallback** — named from the authority:
   `alphadog-v2-nba-static-onoff.js` · `-player-bio.js` · `-player-tracking.js` · `-team-stats.js`.
   *(Three others carry a hardcoded season **but do** read the meta: `backfill`, `game-officials`,
   `starter-status`.)*
3. **`[LIVE-AUDIT]` — their target tables have NO season in the primary key**:
   `player_tracking_profile` (`player_id`) · `player_onoff_profile` (`player_id`) · `nba_ref.players`
   (`player_id`) · `nba_team.season_profile` (`team_id`). **37 tables across
   `nba_stats`/`nba_team`/`nba_ref` have a season-less primary key.**

**And the writer overwrites** — `alphadog-v2-nba-static-player-tracking.js` lines 58–64:
`ON CONFLICT (player_id) DO UPDATE SET season=excluded.season, avg_speed=excluded.avg_speed, …`

> **From 2026-10-01 a weekly run fetches a season with no games and upserts whatever comes back over
> last season's real row — under the label `'2025-26'`, because the worker hardcodes it.** Not a
> wrong label and not empty data: **both at once, in a table that cannot hold two seasons.**

*What each scraper does on an empty response — writes zeros, writes nothing, or raises — is **NOT
RECORDED**, and is exactly the **no-error-raised failure class** documented four times elsewhere in
these files.*

🔴 **OWNER DECISION — O4.** This is the only finding in the sweep whose window opens before the
sweep can reach the transcripts that would explain it. **Nothing has been changed.**

## ⚠ THE 2026-27 SCHEDULE IN `nba_calendar.games` IS **TWO GAMES SHORT PER TEAM, ON ALL THIRTY**
*`[LIVE-AUDIT]` **VERIFIED** 2026-09-21 by live SQL (T7 pass 11). Detail: `NBA_MASTER_SUMMARY.md`
§T7.40a. ⚠ **The 1,200-vs-1,230 shortfall itself was already recorded** at §T2.18 (T2 pass 18); what
this entry adds is that it is **uniform — every team at exactly 80, none at 81 or 82** — which rules
out the reading that a handful of teams are missing games.*

| Season | Prefix `002` games | Games per team | Teams at that count |
|---|---|---|---|
| **2025-26** | **1,230** | **exactly 82** | 30 |
| **2026-27** | **1,200** | **exactly 80** | 30 |

**Perfectly uniform — no team has 81 or 82.** 30 × 80 ÷ 2 = 1,200; the shortfall is **30 games**.
**2026-27 also has no prefix `003`, `004`, `005` or `006` rows at all**, where 2025-26 carries
7 · 85 · 6 · 1.

⚠ **The cause is NOT RECORDED and is not inferred here.** What is recorded is the shape.

**Why it is open rather than trivia**: **any check keyed to 82 games per team, or 1,230 per season,
reports a shortfall on every team for 2026-27** — the season the entire static and enrichment layer
was built for, opening **2026-10-20**. *Whether any worker performs such a check is **NOT
RECORDED**; the coverage detector in `alphadog-v2-nba-daily-delta` reports missing starters and
officials, not game counts.* **Resolve when the sweep reaches the schedule scraper's transcript** —
whether the source served 1,200, or the loader dropped 30, is a question for it.

---

## 🔴🔴 REGULAR SEASON OPENS **2026-10-20**, NOT 2026-10-03 — every urgency label in these documents is 17 days early
*`[LIVE-AUDIT]` **VERIFIED** 2026-09-21 by live SQL against `nba_calendar.games`, and independently by
the owner. **This correction carries everywhere.***

```
season 2026-27 | prefix 001 (preseason)       66 games   2026-10-03 → 2026-10-16
               | prefix 002 (regular season) 1200 games  2026-10-20 → 2027-04-11
```

**`2026-10-03` is the PRESEASON opener.** The whole documentation set has been treating it as the
date the system must be ready for. It is not. From today (2026-09-21): **preseason in 12 days,
regular season in 29.**

⚠ **Read every existing "before 2026-10-03" in these documents as "before the preseason opener."**
The phrase appears **40 times across 15 files**, and **many of those occurrences sit inside verbatim
transcript quotes, which are NOT rewritten** — altering a quote to match a later correction would
falsify the record this set exists to keep. **This entry is the authority; the individual references
are historical.**

**It cuts both ways, and the second direction matters more.** The deadline is 17 days *later* than
assumed, which is slack — but anything that was scoped to "work by opening day" and silently meant
the preseason may now be **measured against the wrong slate**. Preseason games carry prefix `001`,
have no bearing on player props, and are exactly the kind of rows a naive `WHERE season = '2026-27'`
sweeps in. **Whether any loader, backfill or scoring path filters on prefix is NOT RECORDED** — it is
a question for the transcripts that built them.

---

## 🔴🔴 `raw_json` IS A DOUBLE-ENCODED STRING ACROSS THE NBA JSONB SURFACE — the provenance safety net is unqueryable
*Found 2026-09-21, T2 re-read pass 11. **`[LIVE-AUDIT]`** — scope **corrected and widened by the owner's
independent verification**, same day. Detail: `NBA_MASTER_SUMMARY.md` §T2.11 (sweep series).*

`jsonb_typeof(col)` returns **`string`**, not `object`, on **17,902 rows across 14 NBA tables** —
**every NBA JSONB column except three.**

*(My own pass measured **1,306 rows / 6 tables** by checking only the static layer. **That figure was
an undercount by a factor of 13**, and the correction is the owner's, not mine. Recorded here rather
than silently replaced: the finding was real, the scoping was too narrow, and the lesson is that
"which tables have this column" is a question to ask the catalog, not the tables I happened to be
reading.)*

**Largest affected:** `player_tracking_detail.metrics` **4,652** · `player_career_season_totals`
**3,644** · `player_playtype_profile` **3,282** · `nba_calendar.games` **2,666**.

✅ **Scoring is clean.** Both JSONB columns in `nba_score.baseline_ladder_runs` are stored as
**objects**, as is `nba_config.classification_config`. **The three unaffected columns are the ones
the scoring path depends on** — which is why this is not an opening-day blocker.

⚠ **One affected column is DATA, not provenance**: `nba_stats.player_tracking_detail.metrics`. Every
other affected column is a `raw_json`-style archive whose loss is a recoverability problem; this one
holds the payload itself. **Its only reader today is its own writer**, so **nothing NBA is broken
yet — latent, not live.**

**The mechanism**, identical in every writer:
```js
raw_json = ${JSON.stringify(arena).slice(0, 2000)}   // a JS *string* bound into a JSONB column
```
Postgres accepts a JSON string as valid JSONB and stores it as a scalar, so the column holds
`"{\"team_id\":1610612742,\"arena_name\":\"American Airlines Center\",…}"` rather than an object.

**Why 🔴🔴 rather than ⚠: it fails silently, and this column is the layer's stated fallback.**
`NBA_DATABASE.md` describes `raw_json` as the full source payload — the honest-provenance net that
makes any dropped or unmapped source field recoverable without a re-scrape. **It is not recoverable.**

| Query | Returns | Should return |
|---|---|---|
| `raw_json ? 'owner'` | **false** on all 30 arenas | true |
| `raw_json->>'arena_capacity'` | **NULL** | `"19200"` |
| `raw_json @> '{"city":"Dallas"}'` | **no rows** | 1 row |

**Nothing throws.** A future backfill, audit or enrichment reaching for `raw_json` concludes the
source data was never captured, when it is present and merely unreachable.

⚠ **This is a SECOND, independent defect on the same column**, distinct from the one already recorded
for the play-type table (*"the worker stores `JSON.stringify(r).slice(0,1000)` where `r` is the
already-reduced record, not the source row"*). **That one is about what was put in. This one is about
how it was encoded.** A table can have either, or both — `nba_ref.arenas` has both.

### 🔴🔴 IT WAS ON SCREEN ON 2026-09-04 AND WAS STEPPED OVER
*Added 2026-09-21, T7 re-sweep pass 5. The first recorded sighting of this defect.*

T7 ran `jsonb_object_keys(metrics::jsonb)` on `nba_stats.player_tracking_detail` and got:
```
{ "ok": false, "error": "cannot call jsonb_object_keys on a scalar" }
```
**That is the error a double-encoded column produces** — the identical error this sweep hit on
`nba_ref.arenas` while establishing the finding. The response was a workaround,
`left(metrics::text, 600)`, **whose output displayed the defect plainly**:
```
"sample": "\"{\\\"gp\\\":24,\\\"w\\\":12,\\\"min\\\":9.4,\\\"passes_made\\\":7.7, …}\""
```
— a JSON **string** containing escaped JSON.

**The diagnosis was one question away and the question was not asked.** The cast made the data
readable; nobody asked why the cast was needed. **Nothing recorded it for seventeen days.**

⚠ **So the bug predates 2026-09-04** — T7 only brushed against it; the writers date from the
static-layer build (T2–T3). **When it was introduced is still NOT RECORDED.**

⚠ **This is the failure shape the sweep keeps meeting**: an error appeared, a workaround succeeded,
and the success was quiet enough to step over — the same pattern as the truthiness bug (`[] is not
None`) and the 799-row trap. **The system said something was wrong, in a form that was easy to route
around.**

---

✅ **FULLY RECOVERABLE — verified, not assumed.** Every affected row parses after
`(col #>> '{}')::jsonb`, and **none are truncated**: the longest affected value is **601 characters**,
comfortably under every `.slice()` limit in the writers (1000/2000/5000). **Truncation is a latent
risk of the pattern, not current damage.** So the repair is a pure re-encode with no data loss and no
re-scrape.

**Not fixed, per the standing instruction.** The shape of the fix, for afterwards: correct the
**writers** — bind the object and let the driver serialize it — then re-encode existing rows in place
with `col = (col #>> '{}')::jsonb`. **Both are writes, so neither is done here.**

### ⚠ IT REACHES MLB, MIXED — and that is where the pattern becomes a finding
*Owner-verified. **MLB is outside this sweep's scope and has been flagged to the owner directly**;
recorded here only because of what it says about the NBA layer.*

| MLB table | Affected rows |
|---|---|
| `stats_pitcher.game_logs` | **11,792 of 19,528** |
| `team.bullpen_history` | **9,508 of 25,069** |

**The bad rows stop on 2026-07-24**, consistent with an MLB writer fix that day — **unverified**.
**Old rows were never repaired**, and the readers disagree about it: one MLB reader unwraps
(`phase3a` line 8325), others do not. **Only these two MLB tables were checked; the rest of MLB's
JSONB is unchecked.**

**🔴 The pattern worth recording, and the reason this entry is not merely a bug report:**
**the NBA static layer — built 2026-08-31 → 09-03 — reintroduced a bug MLB had apparently fixed a
month earlier, on 2026-07-24.** The NBA build copied MLB's *patterns* (the PrizePicks GitHub-read
shape, the `BASE_HITTER_GAME_LOGS_WORKER` dispatch style, the `[skip ci]` convention, `curl_cffi`)
**but copied them from MLB code as it stood before the fix, or from a sibling that never got it.**
`NBA_LESSONS_LEARNED_FROM_MLB.md` exists precisely to carry MLB's hard-won lessons forward; **this
one did not travel**, and nothing in the NBA documents records the MLB fix at all. **That is a gap in
the lessons-transfer mechanism, not in one worker.**

---

## 🔴🔴 TWO OF THE THREE BACKFILLED SEASONS HAVE **ZERO** CALENDAR COVERAGE — no rest, no back-to-backs, no home/away for 2023-24 or 2024-25
*Found 2026-09-21, T4 re-sweep pass 7 (referential-integrity angle). **`[LIVE-AUDIT]` VERIFIED**.
Detail: `NBA_MASTER_SUMMARY.md` §T4.27a.*

`nba_stats.player_game_log` LEFT JOIN `nba_calendar.games` on `game_id`:

| Season | Log rows | With calendar row | **Without** |
|---|---|---|---|
| **2023-24** | 26,401 | **0** | **26,401** |
| **2024-25** | 26,306 | **0** | **26,306** |
| 2025-26 | 26,651 | 26,651 | 0 |

**Zero, not "few".** Teams split identically: 7,380 rows, 4,920 unmatched, and 7,380 − 4,920 = 2,460
— exactly the 2025-26 count.

**The cause is plain**: `nba_calendar.games` holds **2025-26 and 2026-27 only**. **The schedule was
never backfilled for the two historical seasons the game-log backfill deliberately added.**

**Why it matters.** The calendar is the only source of `game_date`, `game_datetime_utc`, home/away
team ids, arena and `game_label`. **Every schedule-derived feature the documents rank as high-value —
days of rest, back-to-backs, schedule density, home/away, travel, arena/altitude — is computable for
2025-26 and for nothing else.** A join written against the game-log spine yields those features for
one season in three; **an inner join silently drops 52,707 of 79,358 rows (66%)**, a left join
NULL-fills them.

**And it undercuts the reason the backfill was scoped to three seasons at all.** That scope was a
deliberate, reasoned choice — *"1-2 seasons is insufficient … no way to build an aging curve or tell
a hot streak from a new baseline."* **Two thirds of the data obtained for that reason cannot
currently carry a rest or schedule feature.**

⚠ **Not attributed to T4.** T4 backfilled game logs; the calendar belongs to `nba-static-schedule`.
**Whether that worker can fetch prior seasons, whether anyone noticed, and whether a later transcript
fixed it are NOT RECORDED** — questions for the transcripts that own the schedule and the baseline
pipeline. **Recorded here as live state, flagged forward.**

**Related and already open**: the 2026-27 slate is 30 games short and has no playoff/All-Star/Cup
rows. **The calendar has coverage problems at both ends of its range.**

---

## ⚠ 7,887 GAME-LOG ROWS (≈10%) HAVE NO PLAYER-DICTIONARY ROW — and the gap is biased
*Found 2026-09-21, T4 re-sweep pass 7. **`[LIVE-AUDIT]` VERIFIED**: 7,887 of 79,358 unmatched.*

`nba_ref.players` is built with **`isOnlyCurrentSeason=1`** — it is the *current* 582-man roster. The
game logs span three seasons, **so every player who left the league since 2023-24 has game logs and
no dictionary row.**

**The data is not corrupt; the join is the hazard.**
`player_game_log INNER JOIN nba_ref.players` **silently drops rows**, and the drop is
**systematically biased** — it removes precisely the departed players. **This is the same
survivorship selection already flagged for `playercareerstats`, arriving by a different route**, and
nothing in the documents currently warns a query author about it.

**⚠ Measured by season, 2026-09-21 (T5 pass 5) — it is not a flat 10%:**

| Season | Rows | Orphans | **%** |
|---|---|---|---|
| 2023-24 | 26,401 | 5,299 | **20.07%** |
| 2024-25 | 26,306 | 2,588 | **9.84%** |
| **2025-26** | 26,651 | **0** | **0.00%** |

**A monotone gradient to exactly zero**, which proves the mechanism rather than inferring it:
`nba_ref.players` *is* the current roster, so the orphan rate is the league's attrition curve.
**An inner join therefore costs one row in five on the oldest season and nothing on the newest** —
the sample is lost **unevenly, hardest where the aging-curve signal lives**, which is the very reason
three seasons were backfilled.

*Related, and NOT a defect: `player_game_starter_status` has 58 orphan rows for 2025-26 where the
game log has none. **All 58 carry a DNP comment, none is a starter, 9 distinct players** — box scores
list players who dressed, game logs list players who played. The 58 are the difference between those
populations.*

---

## 🔴 `player_career_season_totals` STORES ITS OWN SUBTOTALS — 282 player-seasons are in the table twice
*Found 2026-09-21, T4 re-sweep pass 4. **`[LIVE-AUDIT]` VERIFIED** across the whole table.
Detail: `NBA_MASTER_SUMMARY.md` §T4.24a.*

`TEAM_ID = 0` is not a team — it is **the season total for a traded player**, stored **alongside**
the per-team rows it sums.

| | |
|---|---|
| rows | **3,644** |
| distinct player-seasons | **3,064** |
| player-seasons with >1 row | **282** |
| of those, carrying a `team_id = 'nba_0'` row | **282 — all** |
| where that row's `GP` = sum of the per-team rows | **282 — all** |
| mismatches | **0** |

**The documents record the good half** — that `TEAM_ID=0` rows are *"the confirmed-correct combined
total for traded players, empirically verified"*. ✅ True. **The half not recorded is the
consequence**: because the subtotal sits next to its parts, **any aggregate over this table counts
those 282 player-seasons twice.**

```sql
SELECT player_id, sum(pts) FROM nba_stats.player_career_season_totals GROUP BY 1;  -- ⚠ double-counts
SELECT player_id, sum(pts) FROM nba_stats.player_career_season_totals
  WHERE team_id <> 'nba_0' GROUP BY 1;                                             -- parts only
```
**Neither form is wrong; the table cannot be aggregated without choosing.** And nothing in the schema
announces the choice — **no `is_total` flag, no row-type column.** The discriminator is the magic
value `'nba_0'`, which a reader has to already know about.

⚠ **This is NOT the double-counting recorded at §T4.11.** That one concerns blowout-minutes in
`nba_score.blowout_model` and concludes the design avoids it. **Different table, different hazard,
still open.** Two things share the name in this documentation set and only one is addressed.

**Impact**: the baseline pipeline that would consume this table is, as of T4, a **design document**,
not code. **Whether any live reader aggregates without the filter is NOT RECORDED** — flagged for
the transcript that builds it. **Not opening-day blocking on current evidence.**

**Remedy shape, for after the sweep** (not applied — it is a write): an `is_season_total BOOLEAN`
column, or a view exposing parts-only, so the choice is explicit instead of folkloric.

---

## ⚠ THE OWNER'S ANTI-CAPPING DIRECTIVE — recorded after all; kept here for his verbatim wording
> 🔴🔴 **THIS ENTRY'S HEADLINE IS RETIRED, 2026-09-21 (T7 pass 17).** It read *"it is in no document,
> and the system caps globally."* **Both halves were wrong.** The directive **is** recorded — in
> `NBA_BASELINE_CALIBRATION.md` line 676 (*"**CAPS ARE A LAST RESORT** … tier-specific if ever used —
> the preference is logic that lands on the right number on its own"*) and in `NBA_GLOSSARY.md`
> line 375, **tagged to T7** — and **there is no global cap**; the 35 live caps are keyed per factor,
> prop, tier/role or band. **What survives is the owner's verbatim phrasing, and the open question
> below about validation.** Detail: `NBA_MASTER_SUMMARY.md` §T7.46a.
*Found 2026-09-21, T7 re-sweep pass 1 (owner stratum). Detail: `NBA_MASTER_SUMMARY.md` §T7.30a.*

The owner, in T7 (2026-09-09):
> *"I don't like cap… capping. **I'd rather have proper logic that drives the final number to the
> correct threshold.** But if caps need to be used, **they also need to be specific to the specific
> tiers**."*

**Two instructions — both recorded elsewhere in the twelve (see the retirement notice above); quoted
here in the owner's own words:**
1. **A cap is a fallback, not a first resort** — prefer logic that lands the number correctly.
2. **Any cap that exists must be tier-specific**, not global.

⚠⚠ **CORRECTED 2026-09-21 (T7 pass 9, cross-document consistency).** This entry previously read
*"the system caps, and the cap is global — `NBA_BASELINE_CALIBRATION.md` records a live clamp, 'the
prior is capped at contributing no more than 25% of the final estimate', one threshold, all tiers."*
**That was wrong on all three counts.** The 25% is **MLB's** safety valve, quoted in the NBA
documents as a **recommendation**; the same section states *"**NO SUCH VALVE IS RECORDED IN NBA'S
SHRINKAGE**"*; and it is a **floor protecting individual signal from a population prior**, not a
ceiling on a factor's effect. Detail: `NBA_MASTER_SUMMARY.md` §T7.38a.

✅ **What the system actually caps — `[LIVE-AUDIT]` 2026-09-21**, `nba_config.factor_profile_cells`:

| | |
|---|---|
| Cells (all with a non-null `cap`) | **35** across **15 factors** |
| Cap values | **10 distinct, 0.05 → 0.40** |
| Key | factor × canonical prop × `tier_label` × `role_tier_key` × direction |
| Tier- or role-keyed | **22 of 35** |
| Without either key | **13 of 35** — **these are the CONTINUOUS FORMULA cells**, see below |

**⚠ REFINED TWICE the same day (T7 passes 10 and 15).** This entry first called those 13
*"undifferentiated caps, a gap against the directive"*, then *"not tier-keyed because tiers are
meaningless for them."* **The correct reading is the third: they are keyed — on `variation_band`.**

*(🔴 **the live columns are `factor_key · canonical_prop_key · tier_label · role_tier_key · direction
· variation_band`** — `rate_tier` is not a column in any `nba%` table; §T10.23b.)*
The design key is **six-dimensional** — *factor × prop × rate_tier × role_tier × direction ×
variation_band* (`NBA_CLASSIFICATION_BASELINE_DESIGN.md` line 247). Live, which key columns are
populated **is** the population marker: **22 bucketed cells** carry `tier_label` (+ `role_tier_key`)
with `variation_band` NULL; **13 continuous cells** carry **`variation_band = 'continuous'`** with
tier and role NULL, and hold a `formula_expression` instead of a flat value — e.g.
`pace__points__continuous__all__both` = `coef_a * ln(proj_pace/league_avg)`.

**So nothing in the table is undifferentiated. Every cap is specific to the dimension appropriate to
its form.**

**So against the directive:**
- **Instruction 2 (*tier-specific, not global*) — SATISFIED, and not merely "wherever the concept
  applies": after pass 15, every one of the 35 cells is keyed.** There is
  no global cap, and no bucketed cell lacks a tier or role key.
- 🔴 **Instruction 1 (*a cap is a fallback, not a first resort*) — cannot be judged, and the reason
  is bigger than the question.** `automation_status` is `semi_automatic`;
  `last_validated_at` / `last_empirical_validation_json` are **null on every sampled row**, so **no
  empirical validation backs any of the 35 values** — **VERIFIED over the full population 2026-09-21
  (T7 pass 20): `last_validated_at` set on 0 of 35, `last_empirical_validation_json` on 0 of 35, and
  `real_sample_size_observed` = 0 on every row against a threshold of 75, so the design's own
  "cells under sample are fully shrunk to prior" gate is unmet by every cell**; and **no code reads
  `factor_profile_cells` or
  `factor_relevance` at all** — already recorded in the `NBA_DATABASE.md` §2 banner (T1 pass 36,
  **eight** config tables), and **re-verified 2026-09-21 at a wider scope**: a grep of the whole
  repository, unrestricted by directory or extension, still finds zero code references. **That is
  the open item now** — not the phantom global clamp, and not tier-specificity.
- ⚠ **And one structural question for the scoring transcripts**: **22 of the 23 directional cells are
  `more`.** The lone `less` cell is `blowout__points__LOST_GT50__all__less`. Whether the scorer
  mirrors MORE-side values onto LESS legs, or LESS legs get no adjustment from the other 21,
  is **NOT RECORDED**. Detail: `NBA_MASTER_SUMMARY.md` §T7.39.

**NOT RECORDED**: whether any of these values was set before this instruction, in ignorance of it, or
as a considered exception. All 35 rows carry `created_at` in the **01:53–02:03 window of
2026-09-09**, which precedes T7's own 03:51 timestamp; the transcripts covering that window (T5, T6)
are closed and recorded **no cap-setting turn**. **Deliberately left open** — read the later
calibration transcripts against the instruction rather than inferring from timestamps.

🔴 **TWO BROKEN JOINS IN THE SAME CONFIG LAYER, found 2026-09-21 (T7 pass 16), both missed by the
pass-12 referential-integrity sweep because it had not enumerated the design's six-dimensional key:**

1. ⚠ ~~**`factor_profile_cells.variation_band = 'continuous'` resolves to nothing.**~~ **DOWNGRADED
   2026-09-21 (T7 pass 21) — this is by design, not a break.** `'continuous'` is the documented
   factor **form** (`NBA_CLASSIFICATION_BASELINE_DESIGN.md` line 242: *"form (band / continuous /
   gate)"*), and continuous factors are not banded, so `variation_bands` correctly holds no row for
   it. **34 of 35 cells are keyed exactly as their factor's declared form requires.** 🔑 **The one
   real anomaly this surfaced**: `shotdiet__rebounds__3PA_HEAVY__all__more` — factor `opp_shot_diet`
   declared `form='continuous'` yet **tier-keyed with a flat penalty −0.06 and no formula**, the only
   cell in the table keyed against its factor's form. *Deliberate or not is **NOT RECORDED**.*
2. **`calibration_log` joins `factor_profile_cells` at 0% — 8 of 8 orphaned.** Two incompatible id
   conventions (`blowout_risk::points::P_BLOWOUT_GT50` vs
   `blowout__points__WON_GT50__FRINGE__more`) — **the same failure class as the officials join**.
   **6 of the 8 rows are not factor cells at all** but decision records. And **`old_value` /
   `proposed_value` are NULL on every row while `status = 'applied'`** — *"the audit trail for the
   semi-automatic → automatic loop"* records that something changed and **nothing about what**.

*Both are 🔴 as design gaps and **latent** in effect, since per the `NBA_DATABASE.md` §2 banner
nothing reads these tables. **Whether anything writes to `calibration_log` today is NOT RECORDED.***

⚠ **AND ONE MORE CONFIG GAP, same family, found 2026-09-21 (T7 pass 13)**:
`NBA_BASELINE_METHODOLOGY.md` line 48 specifies *"a second, faster EWMA (e.g. `alpha` ≈0.5, ~3-game
lookback) alongside the primary one."* **`nba_config.stat_decay_config` has 13 rows and none of them
is that.** The same document's rule is that these values *"live in `nba_config.stat_decay_config` …
**never hardcoded**, and the pipeline must read them from there" — **for the fast alpha there is
nothing to read.** *(Severity ⚠ only because **nothing reads the table at all** — see the
`NBA_DATABASE.md` §2 banner.)* ✅ **The primary alphas DO agree exactly**: design 3PT% 0.03 /
rebounding 0.08 / usage-assist 0.15 / minutes 0.20 ↔ live `fg3_pct` 0.03, `reb_rate` 0.08,
`usg_pct` & `ast_rate` 0.15, `minutes` 0.20.

**Related, same turn set — ⚠ also RECORDED elsewhere, contrary to what this entry first said
(retired 2026-09-21, T7 pass 17):**
- **Ladder width** — **the requirement is documented in measured form**: `NBA_GLOSSARY.md` line 370
  and `NBA_GOBLIN_DEMON.md` line 167 give *"Goblin ≈ 25th–35th percentile … useful range ≈
  15th–85th"* with the live **`LADDER_DEPTH` p95 = 13 rungs for points**, agreeing *"to within one
  rung"*; `NBA_FINAL_SCORING_CALIBRATION.md` line 2123 repeats the measurement. **The owner's own
  numbers and rationale are what this entry adds**: *"five or six variations over the anchor and
  five, six under"* — roughly **11–13
  rungs**, because *"we never know where the apps are gonna throw the prop line"* and the
  goblin/demon extremes are *"where we can find good [value]"*. Explicitly **not** *"a global matrix
  with a ton of data that's not needed."* **The documents describe rungs at length but never record
  this width requirement or its rationale.**
- **Per-prop factor study**: *"do this study **prop line by prop line** — which specific factor is
  important for each specific prop line?"* **Factor importance is to be established per prop type,
  not globally.** ⚠ **Qualified 2026-09-21 (T7 pass 6): the STUDY this asked for was done and IS
  documented** (`NBA_MASTER_SUMMARY.md` records the prop-by-prop study and its scoping). **Only the
  owner's instruction is unrecorded** — worth keeping for provenance, but the analysis is not
  missing.

---

## 🔴🔴 THE OFFICIALS DICTIONARY AND THE GAME ASSIGNMENTS CANNOT BE JOINED — 3,681 of 3,681 rows fail
*Found 2026-09-21, T6 re-sweep pass 5 (referential-integrity angle). **`[LIVE-AUDIT]` VERIFIED**.
Detail: `NBA_MASTER_SUMMARY.md` §T6.21a.*

`nba_stats.game_officials` LEFT JOIN `nba_ref.officials` on `official_id`: **3,681 unmatched of
3,681. Every row.** The keys are in two incompatible formats:

| Table | `official_id` |
|---|---|
| `nba_ref.officials` | **`nba_official_ray_acosta`** — derived from the name |
| `nba_stats.game_officials` | **`nba_1629178`** — numeric, from stats.nba.com |

**And `nba_stats.game_officials` also carries `nba_official_id = 1629178`** — the real numeric id.
**The assignments hold exactly the identifier the dictionary lacks.**

⚠ **This is the T2 `known_limitation` arriving as a total failure.** The officials worker has
declared since T2: *"no stats.nba.com official_id crosswalk yet — official_id is name-derived until
box-score data provides one."* **Box-score data provided one. The crosswalk was never built.** The
two tables have coexisted since 2026-09-04 at a **100% join-failure rate**.

**What it costs**: referee-crew tendencies — rated high-impact by the research passes and deferred to
Phase 3b *specifically so this table could exist* — **cannot be computed by joining these two
tables.** Any query must route through `full_name`, the fragile path the limitation warned about.

✅ **The assignment data itself is sound**: 0 orphans against `nba_calendar.games`, and every one of
the 1,227 games has exactly three officials. **The defect is the seam, not the data** — the same
shape as the calendar gap on the backfilled seasons.

**Remedy shape** (not applied — it is a write): backfill `nba_ref.officials.nba_official_id` from
`nba_stats.game_officials`, matching on normalised `full_name` once, then join on the numeric id
thereafter. **The 80-vs-83 name discrepancy below is the symptom of this; fixing this resolves it.**

---

## ⚠⚠ `game_officials.assignment` IS NULL ON ALL 3,681 ROWS — the crew role was never captured
*Found 2026-09-21, T6 re-sweep pass 6. **`[LIVE-AUDIT]` VERIFIED**. Detail: §T6.22a.*

`full_name` 3,681/3,681 ✅ · `jersey_num` 3,681/3,681 ✅ · **`assignment` 0/3,681** ❌

**The column is plumbed end to end and arrives empty.** The scraper asks for it
(`"assignment": o.get("assignment") or None`), the worker carries it through its INSERT, and
`NBA_DATABASE.md` lists it as a real column. **`boxscoresummaryv3` does not populate it**, and
`or None` turns the absent key into a silent NULL.

⚠ **`assignment` is the crew role** — crew chief, referee, umpire. Without it **the three officials
of a game are an unordered set**, so any analysis that treats the crew chief differently is
impossible — on top of the 100% join failure above. *Whether `boxscoresummaryv3` exposes the role
under a different field name is **NOT RECORDED**: T6 never checked, because nothing surfaced the
emptiness.*

**Third dead column in the sweep, and each has a different mechanism:**
| Column | Mechanism |
|---|---|
| `nba_ref.teams.arena_id` | exists, **written by no code** |
| `arenas.owner` / `year_founded` | **scraped every run, written nowhere** |
| **`game_officials.assignment`** | **written faithfully, with a value the source never sends** |

**The common thread is that none of the three fails loudly** — a NULL column looks identical whether
it is unwired, unwritten, or unsupplied.

---

## 🔴 `lineup_profile` IS EXACTLY 2,000 ROWS PER GROUP SIZE — the API cap, hit four times
*Found 2026-09-21, T6 re-sweep pass 5. **`[LIVE-AUDIT]` VERIFIED**. Detail: §T6.21b.*

**8,000 rows; group sizes 2, 3, 4, 5; precisely 2,000 in each.** Four identical round numbers are a
ceiling, not a coincidence — and this document already records the endpoint's behaviour from a later
transcript: *"`leaguedashlineups` → **API capped at 2,000 rows**."*

**Here is that cap truncating the lineups backfill at the moment it was built.** Four calls, each
returning the maximum the endpoint serves.

⚠ **Nothing reported a problem.** 2,000 is a large, healthy-looking number and all four runs
"succeeded" — **the aggregate-guard blind spot again**: a count floor passes, completeness has
nothing to compare against, and only the suspiciously round repetition reveals it.

**NOT RECORDED**: how many lineups actually exist per group size, so the captured fraction is
unknown. A 5-man lineup count across a 30-team season is far larger than 2,000, **so the truncation
is likely severe — but that is an inference, and the measurement belongs to the transcript that owns
the lineups worker.** Flagged forward.

---

## ⚠ THREE GAMES HAVE NO OFFICIALS, AND THEY ARE ALL ONE NIGHT — 2025-11-19
*Found 2026-09-21, T6 re-sweep pass 3. **`[LIVE-AUDIT]` VERIFIED**. Detail:
`NBA_MASTER_SUMMARY.md` §T6.19a.*

`nba_stats.game_officials` covers **1,227 of 1,230** games. The three absent ones are consecutive
ids — and they share a date:

| `game_id` | Date | Matchup | Status |
|---|---|---|---|
| `0022500259` | **2025-11-19** | WAS @ MIN | Final |
| `0022500260` | **2025-11-19** | DEN @ NOP | Final |
| `0022500261` | **2025-11-19** | SAC @ OKC | Final |

**All three were played and completed**, and the night was only partly affected: **9 games were
scheduled on 2025-11-19, 6 have officials, 3 do not.**

**This is not scraper attrition.** The truthiness bug (above) hid these games but did not cause them
— **they still failed after it was fixed, and after a dedicated retry with raw-response capture.**
A date-localized, partial-slate hole points **upstream**, at what `boxscoresummaryv3` serves for that
night.

**Cause NOT RECORDED.** Nothing in T6 establishes it, and the raw-capture run was the last attempt.
**Recorded with its exact shape so a retry has somewhere to start**: three named ids, one date, six
sibling games from the same slate that worked.

**Impact is small and bounded** — 3 of 1,230 games (0.24%) lack referee assignments, in a table
whose purpose (referee-crew tendencies) is aggregate. **Not opening-day blocking.**

✅ **AND THE SYSTEM ALREADY DETECTS THIS — the gap was never invisible to the code, only to the
documentation.** *(Found 2026-09-21, T7 pass 2.)* `alphadog-v2-nba-daily-delta.js` **lines 196–216**
carries a coverage check, added 2026-09-04 and **recorded in no document until now**:
> *"identifies logged games that still lack starter-status or officials data, so a follow-up per-game
> backfill run knows exactly which `game_id`s to [fetch]"*

Two `LEFT JOIN`s against `player_game_starter_status` and `game_officials`, reported as
`games_missing_starter_status_sample` and its officials counterpart. **Run today it returns exactly
what this sweep derived by hand: 3 games missing officials, 0 missing starter status.**
**It has been shipping on a daily-cadence worker since 2026-09-04.**

---

## ⚠ THE OFFICIALS DICTIONARY HAS 80 NAMES; THE GAMES NAME 83
*Found 2026-09-21, T6 re-sweep pass 1. **`[LIVE-AUDIT]` VERIFIED**. Detail: `NBA_MASTER_SUMMARY.md`
§T6.17a.*

`nba_ref.officials` holds **80** rows — the Wikipedia staff roster, a count already flagged as one
short of the page's own *"74 staff + 7 non-staff"*. `nba_stats.game_officials` names **83 distinct
officials** across the 2025-26 season.

**The two sources disagree by three, in the direction that matters**: the games contain officials the
dictionary does not list.

⚠ **They are not directly comparable, which is the underlying problem.** The officials dictionary is
**name-keyed with no stats.nba.com crosswalk** — a `known_limitation` declared since T2 — so a
crew member missing from the roster page, a mid-season hire, or a G-League call-up cannot be
distinguished from a name-normalisation miss. **Cause NOT RECORDED.**

✅ **The game-level data itself is sound**: 3,681 rows across 1,227 games, and **every single game has
exactly three officials** (0 exceptions), which is the correct crew size. **3,681 = 1,227 × 3.**
The three absent games are a clean absence, not a partial parse.

**Flagged for whichever transcript reconciles the dictionary against the assignments** — the
crosswalk this needs is the same one the T2 `known_limitation` asks for.

---

## ⚠⚠ COMMITTED DEBUG ARTIFACTS ARE A PATTERN OF THREE, NOT A ONE-OFF — two are undocumented
*Found 2026-09-21, T4 re-sweep pass 3. **`[LIVE-AUDIT]` VERIFIED** by listing `nba/data/`.
Detail: `NBA_MASTER_SUMMARY.md` §T4.23a.*

| File | Size | Status |
|---|---|---|
| `nba_darko_debug_html_snippet.txt` | 432,513 B | ✅ documented in detail; owner action already raised |
| `nba_shotzones_debug_raw.json` | 50,000 B | ❌ **undocumented** |
| `nba_officials_debug_raw.json` | 2,426 B | ❌ **undocumented** |
| `nba_officials_diagnostic.json` | 7,736 B | ❌ **undocumented** *(added 2026-09-21)* |
| `nba_starter_status_diagnostic.json` | 1,473 B | ❌ **undocumented** *(added 2026-09-21)* |
| **total** | **494,148 B** | |

*⚠ **Count corrected 2026-09-21 from three to five.** The first pass grepped `nba/data/` for
`*debug*`; two of the five are named `*diagnostic*`. **One habit, two words.** See the standing rule
in `NBA_MASTER_SUMMARY.md`: a count comes from an authority, never from the pattern that found it.*

*And the habit has a legitimate cause worth stating beside it: **GitHub workflow logs expire** — the
bridge returns `404 "link may have expired, or run is too old"` — so a failure not diagnosed while
its log is live may never be diagnosable. **Committing the evidence is a rational response to that.**
The open item is that it is undocumented and unbounded, not that it is wrong.*

**The documents treat the DARKO dump as a one-off. It is the third instance of a habit**: when a
scrape fails, write the raw body beside the data and let the workflow's `git add` commit it. **The
habit itself is nowhere recorded**, and it is the habit — not any one file — that will keep producing
these.

- **`nba_shotzones_debug_raw.json`** is T4's own, from the zone-parsing failure, truncated at
  exactly **50,000 characters** by the scraper's error path.
- **`nba_officials_debug_raw.json`** is different and worth a look: keyed by game id, its first entry
  is `{"0022500259": {"raw_officials_field": [], "summary_keys": [...]}}` — **a capture of the
  endpoint returning no officials for a game.** Whose transcript produced it, and whether that
  emptiness was ever resolved, is **NOT RECORDED**; `nba_ref.referee_assignments` belongs to a
  session this sweep has not reached. **Flagged for it.**
- A fourth, `nba_player_game_log_2025_26_debug_raw.json`, is named in the backfill workflow's
  `git add` list but **is not present in `nba/data/`**. **NOT RECORDED** whether it was never
  produced or was removed.

**Not fixed, per the standing instruction.** The shape of the remedy is a `.gitignore` entry or an
error path that writes to the runner's scratch rather than the repo — **both are changes to the
system, so neither is made here.**

---

## ⚠ `[LIVE-AUDIT]` 25 NBA TABLES HAVE NO PRIMARY KEY — inventory only, analysis deferred
*Recorded 2026-09-21, T4 re-sweep pass 3. Detail: `NBA_MASTER_SUMMARY.md` §T4.23d.*

`information_schema` reports **25 base tables under `nba*` schemas with zero `PRIMARY KEY`
constraints**:
- **`nba_market` (8)**: `board_outcomes`, `board_snapshots`, `board_tiers`, `board_tiers_v2`,
  `event_game_map`, `game_lines_snapshots`, `rung_market`, `schedule_norm`
- **`nba_score` (15)**: `absence_panel_teams`, `availability_delta`, `baseline_history`,
  `blowout_model`, `board_scored`, `confidence_verification`, `conformal_confidence`,
  `factor_gate_results`, `final_hp`, `ladder_calibration_asof`, `redistribution_factors`,
  `scenario_calibration`, `scenario_realised`, `tier_band_calibration`, `tier_selection_value`
- **`nba_ref` (2)**: `defender_ratings`, `referee_assignments`

⚠ **This is an inventory, not a finding.** An append-only log or a snapshot table is *correct*
without a primary key; a dimension table is not. **Nearly all of these belong to the scoring and
market layers — transcripts this sweep has not reached — so none is assessed here.** Recorded so the
question is asked in each transcript's own place rather than forgotten.

*(Related and already documented: `nba_stats.player_splits` **does** have a key,
`(player_id, split_type, group_value)` — **but `season` is not in it**, and the table was built
alongside a 3-season backfill, so it cannot hold three seasons of the same split for one player.)*

---

## ⚠⚠ A SCRAPER'S "N PLAYERS SUCCEEDED" IS ATTEMPTS MINUS ERRORS — one player silently has no career totals
*Found 2026-09-21, T4 re-sweep pass 2. Resolves the gap left open at T2 pass 18. **`[LIVE-AUDIT]`
VERIFIED**. Detail: `NBA_MASTER_SUMMARY.md` §T4.22a.*

**`nba_stats.player_career_season_totals` covers 581 of the 582 players in the dictionary.** The
missing one, **VERIFIED** by outer join: **`nba_1628467` — Maxi Kleber**, active, on `nba_1610612747`.

**Nothing was lost at the write.** The transcript reports 3,644 rows; the table holds exactly 3,644.
The scrape itself produced 3,644 rows across 581 players and *reported* 582.

**The mechanism**, `nba/scrape_nba_career_totals.py` **line 115**:
```python
print(f"... {len(all_rows)} season-rows across {len(players) - len(errors)} players")
```
**Attempted minus errored.** A player whose request returns HTTP 200 with an empty rowset raises
nothing, appends nothing to `errors`, contributes nothing to `all_rows` — **and counts as a success.**

⚠ **This is the `NBA_WORKERS.md` §0.37 guard problem in a fifth scraper, and it exposes the shape
that is missing everywhere.** All four guard shapes in this codebase — count floor, completeness,
null-value, per-dataset minimum — operate on the **aggregate**. **None asks the per-item question:
did every input produce at least one output row?** That check costs one comparison and would have
caught this at build time.

⚠ **Why Kleber returned no rows is NOT RECORDED** — the transcript never noticed, so never
investigated. **Recorded as state, cause OPEN.**

**Impact, stated honestly**: one player missing career-season aggregates. Career totals feed
long-range context, not the per-game baseline, so this is **not opening-day blocking** — but the
*counting bug behind it* is fleet-shaped, and the same phrasing appears in other scrapers.

---

## 🔴🔴 `ok` IS THE CERTIFICATION VERDICT, NOT A REQUEST-SUCCESS FLAG — and the teams fallback cannot fail certification
*Found 2026-09-21, T2 pass 16 (mid-band angle). **`[LIVE-AUDIT]` VERIFIED** by grep of the worker
sources. Detail: `NBA_MASTER_SUMMARY.md` §T2.16 (sweep series).*

**18 NBA workers return `ok: certified`:**
```js
return { ok: certified, status: certified ? "completed" : "completed_with_warning", ... }
```
`static-teams` · `-players` · `-arenas` · `-officials` · `-player-bio` · `-player-tracking` ·
`-team-stats` · `-onoff` · `-darko` · `-schedule` · `-playtypes` · `-tracking-detail` ·
`-shotquality` · `-lineups` · `-game-officials` · `-starter-status` · `-backfill` · `daily-delta`.

**`ok` therefore does NOT mean "the request succeeded."** It means "this run passed its own
certification threshold." A run that fetched, parsed and wrote flawlessly but missed its threshold
returns **`ok: false`** — and **there is no separate field meaning "the call worked."** Any monitor
or caller applying the ordinary JSON convention reads this backwards.

⚠ **And `status` is no better — there are EIGHTEEN distinct values, in two generations.**
*Enumerated from an authority 2026-09-21 (T5 pass 7), correcting an earlier partial count of three.*

| Value | Workers |
|---|---|
| `completed` | 17 |
| `failed_no_data` · `completed_with_warning` | 7 each |
| `completed_with_errors` | 6 |
| `failed` | 4 |
| `completed_with_certification_warning` | 3 |
| **12 bespoke per-worker strings** | 1 each |

**The four original static workers — teams, players, arenas, officials — each carry four bespoke
strings with the entity name baked in** (`completed_nba_static_arena_dictionary_seed`,
`failed_nba_static_player_dictionary_no_fallback_available`, …). **Everything built later uses the
shared generic set.**

🔴 **Taken together with `ok: certified`, there is no fleet-wide programmatic success signal.**
`ok` means *certified*, not *succeeded*; `status` has 18 values, **12 unique to one worker**, and the
two generations **do not even share a success token** (`completed` vs
`completed_nba_static_arena_dictionary_seed`). **Any monitor must special-case the four oldest
workers or match on prefixes.**

**Not urgent before opening day** — nothing consumes these strings today, which is precisely why the
divergence went unnoticed. **Recorded because a health-check or alerting layer meets this first.**

### 🔴🔴 The consequence — certification is structurally blind to the fallback

`[LIVE-AUDIT]` **VERIFIED**, `alphadog-v2-nba-static-teams.js` **line 349**:
```js
const certified = finalCounts.active_nba_teams === 30
               && finalCounts.nba_ref_team_aliases_active_rows >= 100;
```
**The hardcoded fallback is a 30-team list**, so when it serves, `active_nba_teams` is exactly 30 and
the aliases clear 100. **The certification predicate is satisfied BY the fallback, every time, by
construction.**

**This is why the identical-certification-string finding below is not cosmetic.** The check cannot
detect the fallback, because the fallback was hand-built to produce precisely the shape the check
tests for. **A certified teams run is not evidence of live data. It is evidence of thirty rows.**

**Both checks share the same magic number, and they fail together**: the fallback *trigger* is
`teams.length !== 30`; the *certification* is `active_nba_teams === 30`. **A real 32-team response
trips the trigger into the fallback, and the fallback then certifies.** The two agree with each other
and disagree with reality.

**Remedy shape, for after the sweep** (not applied — it is a write): make the certification predicate
test *provenance* as well as shape — `source_key NOT LIKE 'STATIC_SEED_FALLBACK%'` — so that serving
the fallback cannot certify, and make `ok` mean "the call worked" with certification in its own field.

⚠ **Scope**: the 18 workers were confirmed to use `ok: certified`. **Whether each one's `certified`
predicate is likewise satisfiable by its own fallback or degraded path was NOT checked** — a
per-worker question, and several belong to transcripts this sweep has not reached. **Only the teams
worker is asserted here.**

---

## ⚠⚠ THE FALLBACK HAS A SECOND TRIGGER, AND IT FIRES ON A **SUCCESSFUL** FETCH
*Found 2026-09-21, T2 re-read pass 12. Extends the existing caveat
`STATIC_SEED_FALLBACK_AFTER_FETCH_ERROR is the marker to watch`, which named only one of the two.*

**`[LIVE-AUDIT]` VERIFIED** — `alphadog-v2-nba-static-teams.js` **lines 339–340**:
```js
if (teams.length !== 30) {
  sourceKey = fetchError ? "STATIC_SEED_FALLBACK_AFTER_FETCH_ERROR"
                         : "STATIC_SEED_FALLBACK_AFTER_COUNT_MISMATCH";
  teams = FALLBACK_TEAMS;
}
```
**`STATIC_SEED_FALLBACK_AFTER_COUNT_MISMATCH` appears in no document.** The branch fires when the
fetch **succeeded** and returned a count other than 30 — a live, correct response **discarded** for
the hardcoded list, still reporting `ok: true`.

**The test is an equality, not a floor**, so **32 teams fails it exactly as 29 does.** The worker's own
source comment treats expansion as harmless — *"a 32-team Seattle/Las Vegas expansion is only in
early-vote stages for the 2028-29 season … does not affect this list"* — while expansion is precisely
the input that trips this branch on good data. **A fourth instance of the season-rollover trap family,
in a new shape: a hardcoded cardinality rather than a season literal.**

**Not urgent for 2026-10-03** (the league is 30 teams). Recorded because the failure is silent and the
remedy is small: a floor instead of an equality, and a certification string that differs.

### ⚠ And a fallback run is indistinguishable from a live run in the response body
Both return `ok: true` and the certification string *"NBA static team dictionary seeded — 30 active
teams + aliases written"* — **character-for-character identical**. Only `source_key` and
`fetch_method` differ. The existing caveat tells a reader to check the key; **this records that
checking it is mandatory rather than prudent, because nothing else in the payload carries the
signal.**

**And the field that used to say so was deleted.** The response once carried a `fetch_note` reading
*"… first real /run after deploy will show whether the live path or the certified static fallback
actually served this run — **check `source_key` in the response**."* A patch in T2 replaced that block
with `final_counts: finalCounts,` alone. *(Supersession: present T2 2026-08-31 → removed T2
2026-09-01, the live path having been proven by then.)*

**Related measurement**: `external_calls_performed` counts **successes, not attempts** — it reports
`0` on a run whose own `source_fetch_error` records a direct stats.nba.com call returning HTTP 520.
It cannot be used to detect a worker hammering a blocked endpoint.

---

## 🔴🔴 LIVE CREDENTIAL IS IN THESE DOCUMENTS, NOT JUST IN THE TRANSCRIPTS — owner action required
*Found 2026-09-20 by the T1 judgment pass (pass 88). **VERIFIED** by grep of all 30 `nba/*.md` files.*

**`NBA_MASTER_SUMMARY.md` line 1034 contains the balldontlie.io API key in full, verbatim**, in a
table cell reading `` `dcb12926-…-d7bdd3f13d6d` (balldontlie key) | T1.5 ``.

**How it got there**: pass 19 ran a sweep for every hex string, ID and UUID in T1 and tabulated what
it found against where each was already documented. **It quoted the key instead of referring to it.**
The table's own purpose — "these values are all already documented, nothing new here" — is what made
the quoting feel harmless. It was not.

**Why this is worse than the transcript exposure the BLOCKER below describes.** That BLOCKER warns
the owner that the 20 transcript `.txt` files carry this key 21 times and must be redacted **by
value** before they are committed. **It points outward at files that are not in the repo yet. This
one is already in the repo, committed and pushed, since pass 19** — and pass 81 added a GitHub Pages
warning to that same BLOCKER, which applies here with full force.

**Redacting line 1034 is not the fix, and that is the important part.** The value has been in the
commit history of `Rodantmat/Alphadog` since pass 19. Removing it from the current file removes it
from `HEAD` and from nothing else. **The only real remedy is to rotate the key at balldontlie.io**,
after which the exposed string is worthless and the line can be cleaned up at leisure.

**Owner action, in order:**
1. **Rotate the balldontlie.io API key.** Treat the current value as burned.
2. Update `nba_config.external_credentials` with the new value — **and note that the column is named
   `credential_value_encrypted` while the value stored in it is plaintext**, which is how a key
   ends up quotable in the first place. *(The column-name-vs-contents mismatch is already recorded
   at `NBA_DATABASE.md`; this is the first time it has had a consequence.)*
3. Only then redact line 1034 and the transcript occurrences.

**Not fixed by this session, per the owner's standing instruction** that issues are documented now
and fixed after the sweep finishes. **That instruction is the right call here anyway**, because
step 1 is the fix and it is not a documentation edit.

---

## ⚠ `nba/tools/sweep_coverage.py` IS COMMITTED BUT NOT REPRODUCIBLE — read before trusting any coverage number in these documents
*Recorded 2026-09-20.*

The coverage matcher that produces the "% uncovered" figures quoted throughout these documents
**is in the repo; the corpus it measures is not.** From a clean checkout every subcommand
(`index`, `score`, `tails`, `backtest`) **fails**, because `nba/transcripts/` holds no `.txt`
files — see the BLOCKER immediately below. `--transcripts` must be pointed at a local copy that
exists only outside git.

**As of 2026-09-20 only the session that wrote the tool can run it.** Every measured number it
produced — the 0.40 threshold, the 100%-recall backtest, each transcript's uncovered percentage —
is therefore **reported, not independently checkable.** Committing the 20 transcripts (redacted,
per the credential findings in the BLOCKER) is the single change that makes all of it reproducible.
Nobody picking this up later should read those figures as verified-by-rerun until that happens.

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

> ## ⚠⚠ **DO NOT COMMIT THEM UNREDACTED — THEY CONTAIN LIVE CREDENTIALS**
> *Added 2026-09-20 (T1 pass 67). **This qualifies the instruction directly above it**, which was
> written at pass 40 before the transcripts had been audited for secrets.*
>
> **VERIFIED by scanning all 20 raw exports**: **17 `INSERT INTO nba_config.external_credentials`
> statements appear across 5 transcripts**, each carrying a credential **value** in plaintext, plus
> **two JWT-shaped strings** in two further transcripts.
>
> | Transcript | `external_credentials` INSERTs | JWT-shaped strings |
> |---|---|---|
> | **T1** `…phase1-static` | 1 | 0 |
> | **T11** `…enrichment-backfill-dfs-boards` | **10** | 0 |
> | **T12** `…board-scrapers-fliff-docs` | 0 | **1** |
> | **T13** `…boards-grader-market` | 2 | **1** |
> | **T19** `…documentation-pass` | 4 | 0 |
>
> **And at least one of those values is still live.** **VERIFIED**: `nba_config.external_credentials`
> holds `balldontlie_api_key` with `updated_at` **2026-08-31T20:26:46.404Z** — inside T1's session
> window — and **T1's SQL call 24 is the `INSERT` that wrote it.** The value in the live table is a
> **36-character plaintext UUID**, the same shape T1's statement supplies.
>
> **So committing the transcripts as they stand would publish working API keys into the repository**,
> where `git` history would keep them even after a later deletion.
>
> ## ⚠⚠ **REDACTION GUIDANCE CORRECTED 2026-09-20 (T1 pass 77) — the advice below was too narrow**
> **The first version of this item said to strip every `INSERT INTO nba_config.external_credentials`
> value. That would have missed most of the exposure.** **VERIFIED by searching the raw exports for
> the stored credential value itself**: the `balldontlie_api_key` value appears **3 times in T1 and
> 18 times in T19** — **21 occurrences across two transcripts** — and **most are not inside an
> `INSERT` statement at all.**
> **In T1 it appears in the assistant's own handoff message to the owner, in ordinary prose**, in the
> same paragraph that asserts the key is *"already stored"* in `nba_config.external_credentials` —
> and the same session's memory write records the owner's rule that the key lives in the database
> *"not in chat memory."* **The value was pasted into the chat body regardless.**
> **So redaction must be driven by the VALUES, not by statement shape**: read each value from
> `nba_config.external_credentials`, then search every transcript for that exact string and replace
> it. **Statement-shaped redaction is not sufficient and would leave working keys in the repo.**

> **Two safe options**, either of which clears the blocker:
> 1. **Redact before committing** — **search every transcript for each credential VALUE** taken from
>    `nba_config.external_credentials` (not for `INSERT` statements), replace each occurrence, and
>    also strip any JWT-shaped string. **At minimum T1, T11, T12, T13 and T19 are affected.**
> 2. **Rotate the affected credentials first**, then commit — which is worth doing regardless, since
>    the values have already travelled through chat exports.
>
> ### ⚠⚠ **AND CHECK GITHUB PAGES FIRST** *(added 2026-09-20, T1 pass 81)*
> **VERIFIED LIVE**: **`pages build and deployment` runs on every push to `main`** — twelve of
> twelve recent runs are Pages builds on this documentation effort's own commits, two of them
> **`success`**. **There is no `gh-pages` branch, no `docs/`, no `_config.yml` and no `index.html`**,
> so the build takes **the repository root**, which is where the markdown lives.
> ⚠ **`[skip ci]` does not stop it** — it suppressed the MLB deploy workflow on every commit and
> **did not suppress a single Pages build.**
> **Whether the resulting site is public cannot be read from here**, and **no claim is made that
> anything is currently exposed.** **But if Pages is public and the transcripts are committed, the
> credential values would be published as web pages, not merely stored in `git`.**
> **So: confirm the Pages setting — enabled? source? public? — BEFORE committing the transcripts.**
> If it is public, **rotation is the only reliable remedy for anything already committed.**
>
> **Not done here**, per the standing instruction: this session does not write to the database, does
> not rotate keys, and does not commit the transcripts. **Flagged for the owner.**

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

## 🔴🔴 SEASON-CRITICAL · `[LIVE-AUDIT]` · THE ENTIRE NBA STATIC LAYER IS FROZEN AT ITS BUILD DATE *(added 2026-09-21)*
***VERIFIED by live SQL, 2026-09-21.** Live-system state — does not affect any transcript's clean
count. **This generalises the schedule finding below: it is not one table, it is all nine.***

| Table | Rows | Last written | Days stale |
|---|---|---|---|
| `nba_ref.teams` | 30 | 2026-08-31 23:39 | **21** |
| `nba_ref.arenas` | 30 | 2026-09-01 00:36 | 20 |
| `nba_ref.officials` | 80 | 2026-09-01 00:53 | 20 |
| `nba_stats.player_onoff_profile` | 582 | 2026-09-01 03:34 | 20 |
| `nba_stats.player_impact_rating` | 530 | 2026-09-02 07:58 | 19 |
| `nba_calendar.games` | 2,666 | 2026-09-02 20:25 | 19 |
| `nba_stats.player_playtype_profile` | 3,282 | 2026-09-02 22:42 | 19 |
| `nba_stats.player_tracking_detail` | 4,652 | 2026-09-02 23:01 | 19 |
| `nba_ref.players` | 582 | 2026-09-03 18:14 | 18 |

**Every table was last written inside the 2026-08-31 → 2026-09-03 build window. Not one has been
written since.** *The latest, `nba_ref.players`, is 2026-09-03 — which is T3's manual differential
testing, not a scheduled run. **The only thing that has touched an NBA table since the build is a
human testing it.***

### ⚠ THE CAUSE IS DEPARTMENTALLY OPEN — do not infer it here
**This entry records WHAT the system is now. It does not explain WHY, because the explanation lives
in transcripts this sweep has not yet reached.**

The loaders, the pipelines that orchestrate them, and whatever scheduling exists for either were
built in later sessions. **Settling the cause at T2/T3 would mean writing a conclusion drawn from
sixteen transcripts of material the record has not yet covered** — the same error the chronological
rule exists to prevent. *Expected to be settled when the sweep reaches the transcripts that built
the loaders and the pipelines; the resolution belongs there, with a pointer back to this entry.*

**One thing CAN be linked now, because it runs the right direction** — an earlier transcript
explaining a later observation. T3 wrote, and then deleted, this warning about the differential
worker (see FROM T3 PASS 8 and the T3 judgment pass):

> *"not yet wired to any schedule — `nba-scrape.yml`'s existing weekly cron only runs the python
> scrapers; this cloudflare worker still needs to be triggered manually via `run_job`."*

**That was written about one worker on 2026-09-02. Whether it generalises to all of them is exactly
the open question above.** *Recorded as a lead, not a conclusion.*

### Stated at the right strength
**For five of these tables the inference is firm.** `player_impact_rating`, `player_playtype_profile`,
`player_tracking_detail`, `player_onoff_profile` and `nba_calendar.games` **upsert every row
unconditionally with `updated_at = now()`** — so an unchanged timestamp means **the worker did not
run**, not that the data was unchanged.

**For `nba_ref.teams` the inference is weaker**: that worker has `teamHasRealChange()` and skips
rows that have not changed, so a run over an unchanged 30-team list would legitimately leave
`updated_at` alone. **The same applies to `players` — `playerHasRealChange()` with a
`players_unchanged_skipped` counter, confirmed in T2's source** — and to `officials`.
*The caveat now has a named mechanism behind it rather than an assumption.*

**Either way the five unconditional writers settle it: the load step has not run since the build.**

### Why this matters now
Season opens **2026-10-03, twelve days out**. On opening night the system would score against a
**roster, schedule, impact-rating, play-type and tracking snapshot taken five weeks earlier** —
before any preseason transaction, and with `nba_calendar.games` still 30 regular-season games short
(below). **Nothing in the pipeline reports staleness**: every worker's certification is a row-count
threshold (`NBA_WORKERS.md` §0.31), and a stale table has exactly the right row count.

**Owner action**: flagged, not fixed, and **not yet grouped with the other staleness observations**
(the schedule table, the 1,200-game slate, the DARKO table). *Grouping them under a shared cause
would be the same premature explanation this entry refuses — they are recorded as four observations
until the transcripts justify treating them as one.*

---

## 🔴 SEASON-CRITICAL · `[LIVE-AUDIT]` · THE SCHEDULE HAS NOT BEEN REFRESHED SINCE THE DAY IT WAS BUILT *(added 2026-09-21, T3 pass 12)*
***VERIFIED by live SQL, 2026-09-21.** Live-system state, not T3 material — **does not affect T3's
clean count.** T3 built and verified this correctly on 2026-09-02; everything below is about what has
happened since.*

```
season    games   oldest_write              newest_write              distinct write days
2025-26   1400    2026-09-02T20:24:11.403Z  2026-09-02T20:24:55.401Z  1
2026-27   1266    2026-09-02T20:24:55.428Z  2026-09-02T20:25:35.429Z  1
```

**`nba_calendar.games` has been written exactly once, on 2026-09-02, and not touched in the 19 days
since.** `nba-scrape.yml`'s weekly Monday 09:00 UTC cron should have fired at least twice in that
window. **The scraper may well have run; the Cloudflare worker that loads its output is triggered
manually via `run_job` and evidently has not been.**

**Why this matters now**: the schedule is the join everything else hangs off — rest days,
back-to-backs, home/away, matchups — and **the season opens 2026-10-03, twelve days from this
entry.**

### And the 2026-27 slate is 30 regular-season games short
| Season | `001` pre | `002` **regular** | `003` ASG | `004` post | `005` play-in | `006` Cup final |
|---|---|---|---|---|---|---|
| 2025-26 | 71 | **1,230** ✅ | 7 | 85 | 6 | 1 |
| **2026-27** | 66 | **1,200** ⚠ | — | — | — | — |

**A full regular season is 1,230 games. The stored 2026-27 slate has 1,200 — exactly 30 short, which
is exactly one per team.**

### The prefix distribution is evidence for explanation 1, and against a load failure
*Added 2026-09-21 after the owner's independent verification.*

**2026-27 carries only prefixes `001` and `002`. 2025-26 carries all six.** No playoff rows, no
All-Star, no play-in, no Cup knockout — none of which exist as fixtures until their brackets resolve.

**An incomplete slate at release produces exactly that shape. A load failure does not** — a partial
write would drop rows across whatever prefixes the source returned, not eliminate four categories
cleanly while leaving the two that are published in August fully intact. *Evidence, not proof: the
`nba_api` #407 alternative stays open, since a source-side shortfall in the regular-season feed would
also leave `001`/`002` as the only prefixes present.*

**Two candidate explanations, and this entry does not choose between them:**
1. **NBA Cup contingency (leading candidate, NOT verified).** Each team's Cup-dependent filler game
   is not scheduled at release, so a schedule pulled in early September is legitimately short by one
   per team. *The completed 2025-26 season reaching exactly 1,230 with a separate `006` Cup Final
   supports this shape.*
2. **A known upstream defect.** T3's own research surfaced `nba_api` issue #407 — *"scheduleLeagueV2
   endpoint doesn't get me all the games for previous seasons … typically 1230 regular season games
   … but fetch only gets me 1148"* — opened 2023-11-19, labelled `bug`/`triage`, **no assignee, no
   response.** If that defect applies here it would under-report silently.

**Either way the consequence is the same and it is not covered by any existing gate**: the schedule
scraper's completeness check applies **only to `seasons[0]`, the completed season** (see FROM T3
PASS 6), and the worker certifies on `written >= 1000` (§0.31) — **1,200 passes both.** *Nothing in
the pipeline would report a 2026-27 slate that stays 30 games short into opening night.*

**Owner action**: re-trigger `nba-static-schedule` and re-check the `002` count for 2026-27 before
2026-10-03. If it is still 1,200 after the Cup bracket would have resolved, explanation 2 is the
live one.

---

## ⚠ THE DIFFERENTIAL WORKER'S "NOT SCHEDULED" WARNING WAS WRITTEN, AND THEN DELETED IN THE SAME SESSION *(added 2026-09-21, T3 judgment pass)*
*Recorded as of 2026-09-02. **This entry exists because the judgment pass caught it missing from
pass 10, which had read the evidence and not written it up.***

The documents already record that the weekly differential worker was **built but never scheduled**
(`NBA_MASTER_SUMMARY.md` line 3090). **What they do not record is that T3 knew, said so, and asked.**

**T3 flagged it to the owner directly:**

> *"One honest gap left: **this worker isn't wired to any automatic schedule yet** — it needs a
> manual `run_job` trigger after each weekly scrape, or wiring into the existing cron. **I flagged
> this rather than assuming it's automatic. Want me to wire that up now, or is this a good place to
> pause?**"*

**T3 also wrote the caveat into `nba/NBA_PROJECT_LOG.md`:**

> *"not yet wired to any schedule — `nba-scrape.yml`'s existing weekly cron only runs the python
> scrapers; this cloudflare worker still needs to be triggered manually via `run_job` after each
> weekly scrape, or a future session should wire it into the same cron cycle. **flagged as an open
> item rather than silently assumed automatic.**"*

### And then removed it
A later `github_patch_file` in the same session took **exactly that paragraph** as its `old_str` and
replaced it with:

> *"next, per the third research pass's own priority order: play-type data (synergyplaytypes) is the
> next highest-value single addition…"*

**The warning was overwritten by a what's-next paragraph.** Not edited, not moved — replaced.

**Why this matters more than the omission itself**: the record as it stood reads as though nobody
noticed. **Someone did, wrote it down twice, asked whether to fix it, and the note was then removed
while the question went unanswered.** *The difference matters for how much to trust the rest of the
log: an entry's absence is not evidence that the issue was never seen.*

**This is also the mechanism behind the `[LIVE-AUDIT]` staleness found in passes 12 and 13** —
`nba_calendar.games` and `nba_stats.player_impact_rating` both frozen at their 2026-09-02 build
date. *The workers load committed JSON and are triggered by hand; the scrapers have a cron and the
workers do not.*

---

## ⚠ THE SHOT-QUALITY-DELTA METHODOLOGY IS NAMED 25 TIMES AND SPECIFIED NOWHERE IN THE TWELVE *(added 2026-09-21, T3 judgment pass)*
*Direction-1 defect: mentioned but incomplete.*

"Shot quality delta" appears **25 times** across the documents, including `NBA_MASTER_SUMMARY.md`
(8), `NBA_RECIPE.md` and `NBA_FINAL_SCORING_CALIBRATION.md`. **The buildable steps exist only in
`NBA_ENRICHMENT_FACTORS_RESEARCH.md`, which is not one of the twelve:**

1. **Weekly, alongside the per-player breakdown, pull `leagueDashPlayerPtShot` league-wide** to get
   the **league-average eFG% at each of the four defender-distance buckets**
   (`0–2ft very tight · 2–4ft tight · 4–6ft open · 6+ft wide open`).
2. **For each player, weight those league averages by that player's own shot distribution** across
   the four buckets — giving an **expected eFG%** for the shots he actually takes.
3. **Delta = actual eFG% − expected eFG%.** A large positive delta means unsustainable shot-making
   *(a sell / under signal)*; a negative delta on good shots is a *buy / over*.

**Without step 1 the metric cannot be computed at all** — the per-player pull alone has no baseline
to difference against, and the league-wide call is a separate request that nothing currently makes.
*Recorded here so the concept and its recipe live in the same place.*

---

## 🔴 THE DARKO SCRAPER FETCHES A DAILY PROJECTED-MINUTES SERIES AND THROWS IT AWAY *(added 2026-09-21, T3 pass 13)*
***VERIFIED** by reading the committed hydration payload and by live SQL, 2026-09-21.*

The SvelteKit payload carries **24 fields per player**. The scraper keeps **9**.

```
payload:  nba_id · player_name · team_name · tm_id · position · season · career_game_num ·
          dpm · o_dpm · d_dpm · box_dpm · on_off_dpm ·
          x_minutes · x_pace · x_pts_100 · x_ast_100 · x_fg_pct · x_fg3_pct · x_ft_pct ·
          sal_market_fixed · actual_salary · surplus_value · _rank
kept:     nba_id · tm_id · position · dpm · o_dpm · d_dpm · box_dpm · on_off_dpm · _rank
```

**`x_minutes` is DARKO's own daily projected minutes.**

**The system is separately building factor A2 to predict minutes** — the absence/redistribution
machinery, the panel work, five retracted attempts — **while discarding a published, daily-updated
minutes projection from the very metric it rated the best predictive catch-all available.** *DARKO's
own accuracy writeup is explicit that minutes is the one stat where it loses to DFS sites, so this
is not a drop-in replacement; it is a free second opinion on the hardest quantity in the system,
currently unfetched.*

**Also discarded, and directly prop-shaped:**

| Field | Why it matters |
|---|---|
| `x_pts_100` · `x_ast_100` | projected production per 100 possessions — the prop categories themselves |
| `x_fg_pct` · `x_fg3_pct` · `x_ft_pct` | projected shooting rates; **`x_ft_pct` bears on the certified FTM prop** |
| `x_pace` | projected pace, a tier-1 factor per the Gemini list |
| **`career_game_num`** | **how many career games the estimate rests on — the exact confidence signal for DARKO's documented rookie problem** *("rookies are all initialized to essentially the same starting point … DARKO doesn't know anything about a rookie who has yet to play")* |

**Unrecoverable without a re-scrape.** The worker stores `JSON.stringify(p).slice(0,1500)` of the
**already-reduced** record:

```
rows 530 | raw_json containing x_minutes → 0 | career_game_num → 0 | x_pts_100 → 0
max raw_json length 187 chars | last write 2026-09-02T07:58Z
```

**This is the same defect as the play-type scraper's** (below) **and the opposite of the design the
same session chose for tracking detail** — *"stores every real column returned … so nothing gets
silently dropped."* **Three scrapers, one session: one keeps everything, two hand-pick, and both
hand-picking ones discarded fields that map onto certified props.**

### `[LIVE-AUDIT]` — and this table has not been refreshed either
`last_write 2026-09-02T07:58Z` — **19 days stale**, the same pattern as `nba_calendar.games`.

### Unverified, and worth one check before the season
The leaderboard page displays **"minimum 20 games played"** adjacent to the rankings. **Whether that
filter constrains the 530-row payload or only the top-by-position widget is NOT established here.**
If it constrains the payload, then in October — with no player at 20 games — **the scrape returns
few or no rows, and the scraper's own `< 400` gate would fire correctly but weekly.** *One fetch in
late October settles it.*

*(Also noted: DARKO's Shiny app was retired in June 2026 and the site moved to www.darko.app — three
months before this scrape. The generic `player_impact_rating` abstraction chosen on bus-factor
grounds was already justified by a real migration.)*

---

## ⚠ THE PLAY-TYPE SCRAPER DROPS FIVE COLUMNS THE ENDPOINT RETURNS — including turnover and foul rates *(added 2026-09-21, T3 pass 11)*
***VERIFIED by live SQL, 2026-09-21.** Recorded as of 2026-09-02.*

`synergyPlayTypes` returns, per play type, a column set that T3's own research captured in full:

> `SEASON_ID · TEAM_ID · … · PLAY_TYPE · TYPE_GROUPING · PERCENTILE · GP · POSS_PCT · PPP ·
> FG_PCT · **FT_POSS_PCT** · **TOV_POSS_PCT** · **SF_POSS_PCT** · **PLUSONE_POSS_PCT** ·
> **SCORE_POSS_PCT** · EFG_PCT · …`

**`row_to_record()` hand-picks ten fields and discards the five in bold.**

| | |
|---|---|
| Kept | `play_type · type_grouping · gp · poss_pct · ppp · fg_pct · efg_pct · poss · pts · percentile` |
| **Dropped** | **`ft_poss_pct` · `tov_poss_pct` · `sf_poss_pct` · `plusone_poss_pct` · `score_poss_pct` · `fgm` · `fga` · `fgmx`** |

⚠ **Corrected 2026-09-21 (pass 13): EIGHT columns, not five.** The full `synergyPlayType` column set
also carries **`FGM`, `FGA`, `FGMX`** (field goals made, attempted, missed) per play type. *`FGA` by
play type is shot volume by role — the denominator behind every shooting prop — and `FGMX` feeds
offensive-rebound opportunity directly. This entry originally listed only the five `_PCT` fields.*

*Also noted: `nba_api`'s registry records the synergy endpoint's **last validated date as
2020-08-15** — the upstream schema has not been re-checked in five years, which is context for how
confidently any column list should be treated.*

**And they are not recoverable from `raw_json`.** The worker stores `JSON.stringify(r).slice(0,1000)`
where `r` is the **already-reduced record**, not the source row:

```
rows 3,282 | raw_json containing 'tov' → 0 | raw_json containing 'score_poss' → 0
raw_json length: min 185, max 213 chars
```

**The data is discarded at scrape time and nothing downstream can get it back without a re-scrape.**

### Why these five matter for a prop system
- **`tov_poss_pct`** — turnover rate *per play type*. A high-usage pick-and-roll ball-handler who
  turns it over on 18% of those possessions is a different assists/points proposition from one at
  9%, and season-long TOV% cannot separate them by role.
- **`sf_poss_pct`** and **`ft_poss_pct`** — shooting-foul and free-throw rates per play type, which
  is the direct mechanism behind FTA and FTM props — **both of which are certified props in the
  reliability audit.**
- **`score_poss_pct`** — the share of possessions that produced any score, a cleaner scoring-rate
  signal than PPP alone, which is diluted by possession volume.

### The contrast worth holding
**The same session built the tracking-detail scraper specifically to avoid this**, and said so:
*"rather than hand-picking fields and risking silently dropping something valuable, this stores every
real column returned as a generic JSONB metrics blob."* **Two scrapers, one session, opposite
choices — and the one that hand-picked is the one whose endpoint had the richest column set.**
*Recorded, not fixed.*

---

## ⚠ THE DIFFERENTIAL WORKER'S SNAPSHOT REFRESH IS DELETE-THEN-INSERT, AND OFFICIALS ARE KEYED BY NAME *(added 2026-09-21, T3 pass 10)*
*Recorded as of 2026-09-02.*

### Every run empties the snapshot table before repopulating it
```js
await sql`DELETE FROM nba_stats.player_roster_snapshot`;
for (const p of newPlayers) { await sql`INSERT INTO nba_stats.player_roster_snapshot …`; }
```
**Not an upsert — a full wipe followed by 582 individual inserts, outside a transaction.** The same
pattern refreshes the team and official snapshots.

**A run that dies between the delete and the last insert leaves the snapshot short or empty**, and
an empty snapshot reads as `is_first_run = true` on the next run — **which suppresses every event**,
because new/departed/team-change detection is all gated on `!isFirstRun`. **So a partial failure
does not produce a wrong diff; it produces a silent baseline reset, and a week's worth of roster
changes is never reported.**

*T3 suspected exactly this shape during its debugging — "something's causing the delete-and-reinsert
cycle to wipe the table without properly repopulating it" — and that particular instance turned out
to be its own test edits. **The pattern that would cause it for real is still what the worker does.***
Recorded, not fixed.

### The one write outside its own tables, with T3's own reasoning
```js
// apply the real, missing consequence the regular upsert worker never does: mark departed
// players inactive in the live table. the regular worker only ever upserts players present in
// its scrape - it never flips a player off when they disappear from the active list.
for (const e of events.filter(e => e.event_type === "departed"))
  await sql`UPDATE nba_ref.players SET active = 0, updated_at = now() WHERE player_id = ${e.player_id}`;
```
**This is the `scope_lock`'s "active flag only" exception in code** (see `NBA_WORKERS.md` §0.34) —
and it only fires for `departed` events, which are themselves suppressed on a first run.

### ⚠ Officials are keyed by a NORMALIZED NAME, because the source has no ID
`normalizeOfficialId(o.full_name)` builds the key. **The Wikipedia roster carries jersey numbers and
names, no stable identifier** — so the differential's notion of "the same official" is their name.

⚠ **CORRECTED 2026-09-21 (T2 depth re-read): this was framed as an undeclared risk. It was
declared — three times, by T2, a session earlier.** ***VERIFIED** on live `main`,
`nba/alphadog-v2-nba-static-officials.js` line 150:*

```js
known_limitation: "No stats.nba.com official ID crosswalk yet - official_id is name-derived
                   until box-score officials data provides a real cross-reference",
```

**It is a field in the worker's own `/run` response**, alongside the same note in the scraper's
`meta.json` (*"jersey number + name only, no stats.nba.com official id in this source"*) and in the
source comment, which also states the plan: *"expected to come later from box-score 'officials' data
in the delta/game-log layer, which resolves by name."*

**The consequence recorded above still stands and is still unrecorded anywhere** — a listed name
changing produces a spurious `departed_official` + `new_official` pair, indistinguishable from a
real change. **What was wrong was the implication that nobody had noticed the ID gap.** *This is
Rule 5 read backwards: I treated the absence of documentation in the twelve as absence of awareness,
when the awareness was sitting in the worker's response payload.*

**Consequence**: an official whose listed name changes — a marriage, a spelling correction, a middle
initial added or dropped, a diacritic normalised differently — **produces a spurious
`departed_official` plus `new_official` pair, and nothing distinguishes that from a real roster
change.** *With 80 officials refreshed weekly against a community-edited source, this is a
when-not-if.*

### Three entities, three different event vocabularies
| Entity | Event types |
|---|---|
| players | `new_player` · `team_change` · `reactivated` · `departed` — **4** |
| teams | `new_team` · `field_change` *(with `field_name`/`old_value`/`new_value`)* · `team_removed` — **3** |
| officials | `new_official` · `departed_official` — **2** |

**Only the team log records WHICH field changed.** A player who changes team produces
`team_change` with old/new team IDs, but a player whose name or roster status changes produces
nothing — there is no `field_change` at player level. *So the differential layer detects roster
membership and team moves, and is blind to attribute drift on players and officials.*

---

## 🔴 SEASON-CRITICAL · THE DARKO SCRAPER'S FAILURE EVIDENCE IS THE WRONG 20 KB OF THE PAGE *(added 2026-09-21)*
***VERIFIED** on live `main`: `nba/scrape_nba_darko.py` lines 86 and 90. **Owner action — do not fix
here.***

```python
if len(players) < 400:
    error = f"suspiciously_low_count: only {len(players)} players parsed, expected ~530"
    OUTPUT_DEBUG_PATH.write_text(html[:20000], encoding="utf-8")   # line 86
...
except Exception as exc:
    if html:
        OUTPUT_DEBUG_PATH.write_text(html[:20000], encoding="utf-8")  # line 90
```

**The data this scraper extracts lives in a SvelteKit hydration `<script>` near the END of the
body.** The debug artifact captures the **FIRST** 20,000 characters.

**The gap is an order of magnitude, measured.** T3 located the payload in the page it captured:
***"first nba_id at 203036"*** — byte offset **203,036**, against a **20,000**-character cap.

### ⚠ Sharpened 2026-09-21 — the artifact in the repo right now is the GOOD one, and that is the risk
*An earlier draft of this entry implied the committed artifact is already useless. **It is not**, and
the real shape is worse.* ***VERIFIED on live `main`:*** `nba/data/nba_darko_debug_html_snippet.txt`
is **432,513 bytes across 87 lines**, and line 77 contains
`kit.start(app, element, { node_ids: [0,2], data: [null,{type:"data",data:{players:[{nba_id:2…`
— **the payload is in it.**

**That file is a leftover from the version of the scraper that dumped the whole page.** The scraper
that will overwrite it on the next failure writes 20,000 characters.

**So the first failure of the season does not merely produce a useless artifact — it destroys a
usable one and replaces it with the document `<head>.`** *(T3's own earlier commit of this same file
was exactly that: 20,026 bytes of favicon links, Google Fonts preconnects and stylesheet tags.)*

**It was fixed once and lost.** T3's v2 scraper carried the instruction explicitly —
*"always dump the full html (not truncated) … so the next attempt has full ground truth instead of
another guess"* — and the rewrite that introduced the working hydration extraction dropped it.

**Why season-critical**: DARKO is the player-impact input, refreshed weekly. **The first failure that
matters will be during the season, and the artifact left behind will be useless.** The fix is
deleting `[:20000]` in two places.

---

## ⚠ THE WORKER REGISTRY MISLABELS PLAY-TYPE COVERAGE — a check that returns a wrong answer *(added 2026-09-21)*
***VERIFIED by live SQL, 2026-09-21.** Recorded as its own item because it makes an audit lie.*

`nba_config.worker_definitions.notes` for `alphadog-v2-nba-static-playtypes`:

> *"Source: stats.nba.com synergyplaytypes. **Player + team level, offensive and defensive
> groupings**, 11 real play types …"*

The data:

| Level | `type_grouping` | Rows |
|---|---|---|
| player | **Offensive** | **3,282** |
| player | *Defensive* | **0 — the grouping does not exist** |
| team | Offensive | 300 |
| team | Defensive | 330 |

**The registry is the natural place to check what a worker produces without querying its tables, and
for this worker it gives the wrong answer.** A future session planning a defense-vs-role factor would
read the notes, believe player-level defensive play-type data is in hand, and design against data
that was never collected. *The underlying scrape-shape decision is documented separately below; this
entry is about the check, not the data.* **Not corrected — the notes column is live database state
and editing it is a write.**

---

## ⚠ FROM T3 PASS 8 — PLAY-TYPE DATA IS OFFENSIVE-ONLY FOR PLAYERS, BY CONSTRUCTION *(added 2026-09-21)*
*Recorded as of 2026-09-03.*

The play-types scraper's grouping loop:

```python
groupings = ["offensive"] if player_or_team == "p" else ["offensive", "defensive"]
```

**Teams get both offensive and defensive play-type profiles. Players get offensive only.**

So `nba_stats.player_playtype_profile` contains, for every player, how *he* scores — isolation,
pick-and-roll ball-handler, post-up, spot-up — and **nothing about what he concedes.** The defensive
half exists at team level in `nba_team.playtype_profile` and nowhere at player level.

**This is a deliberate scrape-shape decision, not a source limitation** — `synergyPlayTypes` accepts
`TypeGrouping=defensive` with `PlayerOrTeam=P`, and the scraper simply does not ask for it. *The
scraper's own docstring frames the team-level defensive grouping as "a sharper version of defense vs
position", so team-level defence was the intent and player-level defence was never in scope.*

### ⚠ CONFIRMED IN THE LIVE DATA — and the worker registry says otherwise
***VERIFIED 2026-09-21 by SQL:***

| Level | `type_grouping` | Rows |
|---|---|---|
| player | **Offensive** | **3,282** |
| team | Offensive | 300 |
| team | **Defensive** | **330** |

**There is no `Defensive` row at player level at all.** Meanwhile
`nba_config.worker_definitions.notes` for `alphadog-v2-nba-static-playtypes` reads:

> *"Player + team level, **offensive and defensive groupings**, 11 real play types …"*

**The registry claims coverage the data does not have.** A reader — or a future session — checking
what exists by reading the worker registry rather than querying the tables will conclude that
player-level defensive play-type data is available. **It is not, and never was.** *Recorded, not
corrected: the notes column is live database state and editing it is a write.*

**What it forecloses, stated plainly**: the "defense-vs-role" idea T3 itself surfaced in the same
session — *"team X allows the most efficiency to opposing pick-and-roll roll men"* — works at team
level with this data. **The player-level version, matching a specific prop against the specific
defender's play-type vulnerability, cannot be built from what is collected.** *That is the sharper
form of the defense-vs-position concept, and the data needed for it is one loop change away and not
being gathered.* Recorded, not fixed.

### The cheap-path detection, which is why 44 calls are usually 2
The scraper first requests with `PlayType` left blank. **If the response carries more than one
distinct `play_type`, the endpoint answered everything in one call** and the method is recorded as
`single_call_all_playtypes`. Only when that probe comes back single-typed does it fall back to
`looped_per_playtype` — 11 types × the groupings above, paced at `time.sleep(0.5)`.

**The fallback is not a failure path, it is a detected-capability path**, and the scraper records
which one it used in its meta. *T3's observed run took the fallback, which is why the play-type
scrape is the slow one.*

### How the differential worker was actually tested
`UPDATE nba_stats.player_roster_snapshot SET team_id = 'nba_1610612738' WHERE player_id = 'nba_2544'`
— **LeBron James (2544) manually reassigned to Boston (1610612738) in the snapshot table**, then the
worker triggered to see whether it detected the change. A departed-official test was done the same
way, by renaming one official's ID so it would not match the fresh scrape.

*Recorded because this is the method that produced the retracted race condition (FROM T3 PASS 1):
writing directly into the snapshot table to simulate a change is effective, and it is also why two
runs disagreed — the test artifact was still in place. **The final clean baseline run was taken only
after the artifacts were removed.***

---

## FROM T3 PASS 6 — THE SCHEDULE SCRAPER TREATS ITS TWO SEASONS ASYMMETRICALLY, ON PURPOSE *(added 2026-09-21)*
*Recorded as of 2026-09-03.*

The schedule scraper began as one hardcoded URL (`scheduleLeagueV2?LeagueID=00&Season=2025-26`) and
was **rewritten within the same session to loop a `seasons` list**, fetching each explicitly. The
loop's error handling is deliberately **not symmetric**, and the asymmetry is the finding:

```python
if season == seasons[0] and len(real_games) < 1000:
    # only the completed season is expected to have ~1230+ games — dump for inspection
    # if that one looks broken. The upcoming season may legitimately be small/empty if
    # the schedule hasn't been released yet — not treated as an error.
    per_season_meta[season]["error"] = f"suspiciously low: {len(real_games)} games, expected ~1230+"
    output_debug_path.write_text(json.dumps(body)[:100000])
```

**Only the completed season is allowed to fail the scrape.** An empty upcoming season is a normal
state — the NBA publishes next season's schedule in August, so between February and August that slot
is legitimately thin. **Treating it as an error would have made the scraper fail for half the year.**

**Two things worth carrying:**
- **`real_games` is filtered from `raw_count`** — a game counts only if it has `game_id`,
  `home_team_id` **and** `away_team_id`, and the meta records both numbers per season. *So a scrape
  that returns rows of the right shape but missing team IDs is visible as a raw/real gap rather than
  a silent pass.*
- **The completed season's threshold is anchored to a real invariant** — `~1230+` is the actual
  regular-season game count. **This is the one place in T3's scrapers where a magic number is tied
  to a fact about the world** rather than chosen for margin (contrast the four certification
  thresholds in `NBA_WORKERS.md` §0.31). *It is in the scraper, not the worker — the worker that
  loads this data still certifies on `written >= 1000`.*

### The play-types scraper checks both levels before exiting
`sys.exit(1)` if **either** the player-level or team-level meta carries an error — *"both are
checked, neither silently skipped."* **A partial success at one level does not mask a failure at the
other**, which is the failure mode a single combined row count would hide.

### The DARKO source rationale, in the scraper's own docstring
Recorded because it states why this third-party dependency was considered acceptable:
- *"rated by NBA analytics experts as the best predictive catch-all metric (**beats even paid
  EPM/LeBron on RMSE**)"*
- *"uses the **exact same NBA person IDs** already in our system (`/player/203999` = Jokić's real
  stats.nba.com person id) — **a clean join, no name-matching**"* — which, given the Jokić diacritic
  and `Last, First` problems documented elsewhere in this sweep, is the substantive argument
- *"unlike stats.nba.com, this site is **not confirmed Cloudflare-blocked** from anywhere — but this
  scraper still runs on a GitHub Actions runner **for consistency with the rest of the pipeline and
  because its exact anti-bot posture (if any) is unknown until tested for real**"*

*The last point is a deliberate choice to stay on the slower path rather than assume a site is
friendly — the same reasoning that would have saved time on stats.nba.com had it been available.*

---

## FROM T3 PASS 4 — THE DIFFERENTIAL WORKER DOCUMENTS ITS OWN SEMANTICS IN ITS RESPONSE *(added 2026-09-21)*
*Recorded as of 2026-09-03.*

### `is_first_run` — the field that prevents a baseline being read as a change
The differential worker returns, per entity, `is_first_run`, `event_counts` (via `countByType`), and
the events themselves — **plus a prose note in the response body**:

> *"`is_first_run=true` means the snapshot table was empty (first-ever run) — everything reports as
> a baseline, **not a real change**. Real differential detection starts from the **second run** of
> this worker onward."*

**This is the safeguard against exactly the confusion that cost T3 several debugging cycles** (see
FROM T3 PASS 1, the retracted race condition): a first run that reports 582 players looks identical
to a run that detected 582 changes unless something says otherwise. **Putting the caveat in the
response rather than in documentation means it travels with the data** — a later session reading a
stored run record sees it without needing to find this file.

*Neither `is_first_run` nor `countByType` appears anywhere in the thirty documents.*

### The `undefined` binding bug, in its concrete form
FROM T3 PASS 1 records that `postgres.js` rejects `undefined` bindings. **This is the line that hit
it**, in the differential worker's team-change comparison:

```js
["full_name", t.name, old.full_name]                                  // before — t.name is undefined
["full_name", `${t.city || ""} ${t.nickname || ""}`.trim(), old.full_name]   // after
```

**The committed teams JSON has no `name` field at all** — it carries `city` and `nickname`
separately, and the full name is composed at write time. *So the bug was not a null value; it was a
field that never existed, reading as `undefined` and being passed straight into a query. The `?? null`
guard would have converted a silent wrong-value into a silent null; naming the right fields is what
actually fixed it.*

### The 11 play types, enumerated
`transition · isolation · prballhandler · prrollman · postup · spotup · handoff · cut · offscreen ·
offrebound · misc` — the fallback loop runs **11 play types × 2 groupings × 2 levels = 44 calls**
when the single-call path fails. *The list is recorded in three places outside the twelve and in
`NBA_MASTER_SUMMARY.md`; the 44-call arithmetic is not.*

---

## FROM T3 PASS 3 — THE SEASON PARAMETER WAS HARDCODED TO A CONCLUDED SEASON *(added 2026-09-21)*

### As it stood in T3, 2026-09-03
`nba/scrape_nba_playtypes.py` built its request with the season written into the URL:

```python
f"&SeasonType=Regular+Season&SeasonYear=2025-26&TypeGrouping={type_grouping}"
```

**`2025-26` is the season T3 had just established was already over.** Pass 1 records T3 noticing
this for the schedule endpoint — *"I should actually be scraping season=2026-27 rather than the
concluded 2025-26 season"* — alongside the untested assumption that *"the other endpoints … are
likely season-agnostic."* **`synergyPlayTypes` is not season-agnostic: it takes `SeasonYear`
explicitly, and T3 passed it the concluded season.** So the play-type profiles loaded that day
describe 2025-26, not the season the system was being built for.

*This is what the dated assumption in FROM T3 PASS 1 cost, in one concrete scraper. Recorded as it
stood; no later knowledge applied.*

### `[LIVE-AUDIT]` — the live file no longer matches, and the change is not yet attributed
***VERIFIED 2026-09-21** by direct read of `main`:*

```python
from nba_season import active_stats_season
SEASON = active_stats_season()
...  f"&SeasonType=Regular+Season&SeasonYear={SEASON}&TypeGrouping={type_grouping}"
```

**The hardcoded literal is gone, replaced by a computed season from an `nba_season` module.**
**Which transcript made that change, and when, is NOT established here** — this sweep has not yet
reached it. **When a later transcript introduces `active_stats_season()`, record the supersession
there with both dates and a pointer back to this entry.** *Tagged `[LIVE-AUDIT]`: live-system state,
not T3 material, and it does not affect T3's clean count.*

**Worth checking when that transcript is reached**: whether the other season-scoped scrapers were
migrated at the same time or one at a time, and whether any data loaded under the hardcoded season
was ever re-scraped rather than left in place.

---

## FROM T3 PASS 2 — THE DARKO EXTRACTION IN FULL, AND A SELF-DIAGNOSING SCRAPER PATTERN *(added 2026-09-21)*
*Recorded as of 2026-09-03.*

### The DARKO extraction needs TWO JSON repairs, not one
Pass 1 recorded that the hydration payload has **unquoted keys**. **That is only the first repair.**
The committed scraper does both:

```python
m = re.search(r'players:\[(.*?)\],seasons:', html, re.S)      # boundary
json_text = re.sub(r'(?<=[{,\[]\s)([A-Za-z_][A-Za-z0-9_]*)\s*:', r'"\1":', arr_text)   # 1. quote keys
json_text = re.sub(r':(-?)\.(\d)', r':\g<1>0.\2', json_text)  # 2. bare leading decimals
```

**JS allows `:.534` and `:-.844`; JSON does not.** A DPM value between −1 and 1 is written without a
leading zero in the page source, so **the second substitution is required for exactly the players
whose impact is smallest** — and its absence fails the whole parse, not one row. *Anyone rebuilding
this from the "unquoted keys" note alone will hit it.*

### The self-diagnosing scraper pattern — a completeness gate plus committed debug HTML
The DARKO scraper does not assume its extraction worked. It carries:

- **an expected-total check with a 10% tolerance** —
  `if total_expected and len(all_players) < total_expected * 0.9:` sets
  `error = "pagination incomplete: got N of expected ~M — real pagination url scheme not found by
  the candidates tried, needs manual inspection"`
- **a committed debug artifact** — `output_debug_path.write_text(html1[:20000])`, so the next
  iteration inspects the page's real structure from the repo instead of re-fetching blind.
  ⚠ **Corrected pass 4, then CORRECTED AGAIN pass 7 — and the second correction is the one that
  holds, because it was settled against the live file rather than against stratum order.**

  **Pass 4 claimed T3 removed the cap.** It did, once: a mid-session patch replaced
  `html1[:20000]` with the full page — *"full, untruncated html this time … so the next attempt has
  complete ground truth instead of a partial guess."* **But that patch belonged to the v1
  pagination-guessing scraper, which was then thrown away** and rewritten around the hydration
  extraction. ***VERIFIED 2026-09-21** on live `main`: `nba/scrape_nba_darko.py` lines 86 and 90
  both write `html[:20000]`.* **The cap is in the shipped scraper.**

  ⚠ **And that is a live defect, not a historical note.** The hydration payload this scraper depends
  on sits **in an inline `<script>` near the end of the body** — T3 established that itself. The
  debug artifact captures the **first** 20,000 characters. **So if this scrape ever fails, the
  evidence written to the repo is the part of the page that does not contain the data**, and it will
  look like a captured artifact rather than a miss. *The v1 patch had fixed exactly this; the
  rewrite lost the fix. Not repaired here, per the sweep's read-only rule.*
- an explicitly **permissive** first-run parse, documented in its own docstring as *"intentionally
  permissive … if it produces obviously wrong results (e.g. zero rows, or fewer than expected),
  that's **surfaced honestly in the meta file rather than silently accepted**"*

**This is the same family as T2's `_debug_headers` move** (see FROM T2 PASS 3): when a scrape's
correctness cannot be pre-validated, commit the evidence needed to diagnose it rather than the
conclusion. **It is also what caught the 50-of-530 failure honestly instead of shipping a parser
that looked like it worked on sparse data** — the same trap that later cost three stacked bugs
elsewhere in this project.

*The pagination schemes tried empirically, all unsuccessful, recorded so they are not retried:*
`?page=2` · `?p=2` · `?offset=50` · `?pagesize=1000` · `?limit=1000` · `?per_page=1000` ·
`<base>/__data.json`.

### Schedule parsing uses a fallback-key helper for casing variants
`get_any(g, "gameId", "gameID")`, `gameDateEst` **or** `gameDate`, `teamTricode` **or**
`teamAbbreviation`. **The same NBA payload spells the same field differently in different places**,
and the parser was written defensively rather than to one observed spelling. *Related to the
`result_set_rows`-by-name lesson in FROM T2 PASS 2: positional and single-spelling reads are the
recurring silent-failure class in this codebase.*

---

## FROM T3 PASS 1 — THE 1 MB ASYMMETRY, A RETRACTED RACE CONDITION, AND TWO DATED ASSUMPTIONS *(added 2026-09-21)*
*T3 = the 2026-09-03 phase-3a final-complete session. **Recorded as it stood on 2026-09-03**; later
transcripts may supersede these and will be linked here when they do.*

### ⚠ The bridge tools can read files the workers cannot — a 1 MB asymmetry
The ~1 MB GitHub contents-API limit is already well documented (49 mentions). **What is not recorded
is that it does not apply equally to both readers**, and the gap is invisible until it bites:

| Reader | Mechanism | Behaviour on `nba/data/nba_schedule_current.json` |
|---|---|---|
| **The bridge tools** (`github_get_file`, `github_grep_file`) | not the plain contents API — T3's reading was the **git blobs endpoint** *(T3's inference, not confirmed here)* | **reads it fine** — ***VERIFIED** 2026-09-21: 1,225,505 bytes, 40,009 lines, returned normally* |
| **A worker's `fetch()`** | the standard contents API | **fails** — the API returns **empty content rather than an error**, so the worker throws `unexpected end of JSON input` |

**The trap is that the failure is silent on the API's side and misleading on the worker's.** A
developer checking the file with the bridge sees healthy data and concludes the worker has a parsing
bug. *The schedule file is over the limit today, so any worker reading it via the contents API is
affected now, not hypothetically.*

### The differential worker's ordering problem — and why it owns snapshot tables
*Design recorded as of 2026-09-03.* The existing static workers upsert in place. T3's reasoning:

> *"If the differential worker runs after the regular static-teams/static-players workers already
> upsert their data, the **'before' state is gone** since it's been overwritten with 'after' values,
> **making any diff meaningless**."*

**So `alphadog-v2-nba-weekly-differential` maintains its own snapshot tables** rather than diffing
against the live reference tables — independent of run order by construction, instead of depending
on being scheduled first. *That design choice is the reason the worker is order-independent, and it
is worth knowing before anyone "simplifies" it to read `nba_ref.*` directly.*

**The gap it was built to close**: `teamHasRealChange` / `playerHasRealChange` do per-field checks on
rows that are present, so **a player who disappears from the scrape is never marked inactive** — the
departure case had no handler at all.

⚠ **CORRECTED 2026-09-21 (pass 5): there are FOUR event types, not three.** This entry originally
listed *new player · departed player · team changed*. The committed worker also emits
**`reactivated`** — a player present in the old snapshot with `active = 0` who returns with
`roster_status === 1`:

| Event | Condition |
|---|---|
| `new_player` | not in the old snapshot at all *(suppressed when `is_first_run`)* |
| `team_change` | active, both team IDs present, and they differ |
| **`reactivated`** | active now, `old.active === 0` — **a return from inactive, not a new signing** |
| `departed` | `old.active === 1` and the player is absent from the new active set |

**`reactivated` matters because without it a returning player would surface as `new_player`**, which
would read as a league entry rather than a status change — the two need different handling
downstream. *It appears once in `NBA_PROJECT_LOG.md` and in none of the twelve.* **Active is defined
as `roster_status === 1`**, which is recorded nowhere.

**Departure detection walks the OLD snapshot**, not the new data — `old.active === 1 &&
!newActiveIds.has(old.player_id)` — which is the only way to see something that is no longer there.

### ⚠ A race condition was hypothesised and then RETRACTED — within the same session
**Recorded because the retraction is the finding, and because the hypothesis is the kind that gets
quoted later as if it were a result.**

T3 saw a team-change event fire for LeBron citing an old `team_id` that a prior run had already
refreshed, plus a snapshot table reporting `is_first_run = true` when it held 30 rows. The reasoning
escalated to:

> *"The only explanation is a **genuine race condition** — `run_job` invocations aren't fully
> sequential, or there's caching or a stale read across separate Cloudflare Worker calls **sharing a
> connection pool**."*

**It was not.** T3 then established the real cause:

> *"The team change event fired again because **I'd manually re-broken LeBron's snapshot with another
> update** before this third trigger run, so the discrepancy reappeared as expected **rather than
> indicating a persistence bug**."*

⚠ **CORRECTED 2026-09-21 (pass 10) — this entry stopped one stage too early, and its closing claim
was wrong.** It asserted *"there is no evidence in T3 of … connection-pool staleness."* **There is.**
The resolution lives in the command stratum, which this entry was written before reading — the exact
failure Rule 2 now exists to prevent.

**The arc has THREE stages, not two:**

| Stage | T3's position |
|---|---|
| 1. Hypothesis | *"a genuine race condition — `run_job` invocations aren't fully sequential, or … a stale read across separate Cloudflare Worker calls sharing a connection pool"* |
| 2. Retraction | the specific event was the manually re-broken snapshot — **operator error for that instance** |
| 3. **Final** | *"triggering this worker multiple times within seconds of each other can show a stale/duplicate detection due to **Cloudflare Hyperdrive's brief query-result caching layer** — a test artifact of rapid-fire manual triggering, not a logic bug … **At the real weekly cadence this runs on, there's no meaningful gap for stale caching to matter.**"* |

**So the original instinct was partly right and I over-corrected it.** The mechanism is real and
named — **Hyperdrive caches query results briefly** — it is simply bounded, and harmless at the
cadence this worker is meant to run at. *Stage 2 explains the specific event; stage 3 explains why
two runs seconds apart can disagree at all.*

**What this means operationally**: a worker triggered twice in quick succession may read pre-write
state. **That is a property of the Hyperdrive layer every NBA worker sits behind**, not of this
worker — and the only reason it is documented here is that manual back-to-back triggering during
testing is exactly how anyone would first meet it.

### Two dated assumptions, neither verified in T3
1. **"The other endpoints — teams, players, bio, tracking — are likely season-agnostic."** Stated
   with *"likely"* when T3 realised the **2025-26 season had already concluded** and that
   `season=2026-27` was the one to scrape. **The schedule endpoint plainly is season-scoped; the
   claim that the others are not was never tested.** If it is wrong, several static tables carry a
   concluded season's values.
2. **A static CDN JSON alternative to `scheduleLeagueV2`** *"that might avoid special headers
   entirely and be less likely to get blocked"* — noted, never evaluated. Appears only in
   `NBA_ENRICHMENT_FACTORS_RESEARCH.md`.

### `postgres.js` rejects `undefined` parameter bindings
The teams diff failed with an undefined-value error while players and officials succeeded: some team
fields (`name`, `conference`, `division`) are `undefined` in the source JSON, **and the driver
rejects `undefined` bindings outright rather than coercing to `NULL`.** *Any field read straight from
scraped JSON into a query needs `?? null`. The three entities behaved differently purely because of
which fields their sources happened to populate.*

### DARKO: the "JS-heavy, unscrapable" assumption was superseded inside T3
T2 recorded `darko.app` as a JS-heavy React/Vue app that a plain `curl_cffi` fetch would not capture
(see FROM T2 PASS 1). **T3 found otherwise**: it is **SvelteKit, server-side rendered**, with real
values visible in the HTML. The final extraction path is neither HTML-table parsing nor a CSV link —
the page's **"Download CSV" control is a `<button>`, not an anchor**, so there is no URL to fetch.
**All 530 players sit in SvelteKit's hydration payload in an inline `<script>` near the end of the
body**, as a JS object literal with **unquoted keys**, requiring regex key-quoting before it will
parse as JSON. *Supersedes T2's assessment, same source, 2026-09-03.*

---

## ⚠ FROM T2 PASS 3 — `nba_arenas_current.json` CARRIES TWO TEAM FIELDS UNDER ARENA NAMES *(added 2026-09-21)*
***VERIFIED** by direct read of `nba/data/nba_arenas_current.json` on live `main`, 2026-09-21.*

```json
{ "team_id": 1610612738, "arena_name": "TD Garden", "arena_capacity": "18624",
  "city": "Boston", "owner": "Bill Chisholm", "year_founded": 1946 }
```

**`year_founded` is the FRANCHISE's founding year, not the arena's opening year.** The file is named
for arenas and the field sits between `arena_capacity` and nothing else, so it reads as a building
date. It is not:

| Team | `year_founded` in the file | Franchise founded | Arena actually opened |
|---|---|---|---|
| Boston | **1946** | 1946 ✓ | TD Garden, **1995** |
| Atlanta | **1949** | 1949 ✓ | State Farm Arena, **1999** |
| Dallas | **1980** | 1980 ✓ | American Airlines Center, **2001** |

**Off by decades, every row, in the direction a reader would not suspect.** `owner` is the same
shape of error — **Bill Chisholm owns the Celtics, not TD Garden.** Both fields come from
`teamDetails`, which is a *team* endpoint; the arena scraper kept them alongside the two genuinely
arena-scoped fields it wanted.

**Nothing downstream reads them today**, which is why this has gone unnoticed — but an altitude,
venue-age or building-effect factor is exactly the kind of enrichment the roadmap contemplates, and
it would reach for `year_founded` first. **Renaming them `franchise_founded` and `team_owner` is the
fix; not applied, per the sweep's read-only rule.**

### ⚠ EXTENDED AND PARTLY CORRECTED 2026-09-21 — the two bad fields are never loaded, and `altitude_ft` is empty
***VERIFIED by live SQL** against `nba_ref.arenas`, after the owner independently confirmed the JSON
values. This both strengthens the finding and corrects part of what the original entry said.*

`nba_ref.arenas` has 13 columns: `arena_id · arena_name · team_id · city · state · capacity ·
altitude_ft · timezone · source_key · raw_json · data_quality · created_at · updated_at`.

**`year_founded` and `owner` are not among them — and they are not in `raw_json` either.**

```
rows 30 | capacity filled 19 | altitude_ft filled 0 | raw_json present 30
raw_json ? 'year_founded' → 0 rows      raw_json ? 'owner' → 0 rows
```

**So the mislabeled fields are dropped at the write boundary, not merely unread.** They exist only
in the committed JSON. **That is precisely why nothing has surfaced them, and precisely why a
venue-age factor would reach for the JSON and find them** — the table looks like it has no venue-age
data, so the file is where anyone would look next.

**And the risk is not hypothetical, because the table is already shaped for venue factors:**
`capacity`, `altitude_ft` and `timezone` are all venue-scoped columns. **`altitude_ft` is 0 of 30
populated** — the column exists and was never filled. *Altitude is Gemini's own tier-4 factor from
T2 (see FROM T2 PASS 2). The slot was cut and left empty.*

**Correction to this entry's original claim about capacity typing.** The JSON does carry
`arena_capacity` as a quoted string (`"18624"`) beside a bare-integer `year_founded` (`1946`) — that
part stands, and it is a real inconsistency in the file. **But `nba_ref.arenas.capacity` is
`integer`**, so the writer casts on the way in and the lexical-sort hazard **does not reach the
database**. The original entry implied it did. **What remains true at the table**: capacity is
populated for **19 of 30** teams, so any capacity-derived factor still has a `NULL` case covering a
third of the league.

### ⚠ WHY two team fields ended up in an arenas file — the full sequence, established 2026-09-21
*The T2 depth re-read settled this by reading the patches and the live scraper, not by inference.*

1. The scraper called **`teamInfoCommon`** and extracted `col("ARENA")`, `col("ARENACAPACITY")`,
   `col("team_city")` → **arena fields null for all 30 teams.**
2. **`_debug_headers` was added** and revealed the endpoint's real column list — which contains
   `CITY`, `OWNER`, `YEARFOUNDED` **and no arena column at all.**
3. The extraction was patched to use the revealed names: `col("city")`, **and `owner` and
   `year_founded` were added because the debug output showed they existed.** *Still no arena.*
4. **The endpoint was then replaced wholesale with `teamDetails`**, which does carry `ARENA` and
   `ARENACAPACITY` — ***VERIFIED** on live `main`, `scrape_nba_stats_arenas.py` line 38:
   `https://stats.nba.com/stats/teamdetails?TeamID={team_id}`, extracting `ARENA`, `ARENACAPACITY`,
   `CITY`, `OWNER`, `YEARFOUNDED`.*

**So `owner` and `year_founded` were discovered on one endpoint and carried across to another when
the endpoint changed.** **That is the causal origin of the mislabeling recorded above** — not
carelessness, but two team-scoped fields surviving a migration that changed what the file was
about. *The `_debug_headers` move that found them is the same one that later proved the endpoint
could not supply arenas at all.*

### ⚠ A hardcoded season in a WORKER, not just a scraper
`alphadog-v2-nba-static-onoff.js` writes `season` as a **string literal `'2025-26'` in its INSERT**,
so every row carries that season regardless of what was scraped. ***VERIFIED***:

```
nba_stats.player_onoff_profile — season '2025-26', 582 rows, last write 2026-09-01T03:34Z
```

**Every previously-recorded hardcoded season in this sweep was in a scraper's URL** (play types,
tracking detail, `teamInfoCommon`, schedule). **This one is in the write path.**

### ✅ BUT NOT EVERY SEASON LITERAL IS THE TRAP — classify by CADENCE, not by the string
*Added 2026-09-21, T5 re-sweep pass 4, to stop this fix being over-applied.*

`alphadog-v2-nba-static-backfill.js` **line 233** holds three season literals:
```js
const seasonSlugs = { "2023-24": "2023_24", "2024-25": "2024_25", "2025-26": "2025_26" };
for (const [season, slug] of Object.entries(mode === "weekly" ? {} : seasonSlugs)) { … }   // line 242
```
**These are correct and must not be "fixed."** It is a **one-time backfill over completed, frozen
seasons**, and line 242 guarantees the literals never reach a recurring run — **in `weekly` mode the
loop iterates an empty object.**

⚠ **The hazard is the rollover fix itself.** Whoever performs it will grep for `2025-26`, land on
line 233, and "correct" a worker that is already right — turning a frozen historical job into one
that chases the current season and re-mines **79,358 rows it already has**.

**The rule**: *a season literal is a trap in a **recurring** write path and is **correct** in a
one-time historical job over completed seasons.* **Check the worker's cadence before changing it.**

### ⚠ NAME IT AS THE TRAP IT IS
**The scrapers are the natural and correct first place to look when fixing a season rollover** —
that is where the season appears in a URL, that is what a search for `2025-26` turns up first, and
fixing them there feels complete. **It is not.**

**A scraper corrected to fetch 2026-27 hands correct data to this worker, which then writes it into
`nba_stats.player_onoff_profile` labelled `'2025-26'`** — silently, with no error, no certification
failure, and a row count that looks exactly right. **The wrong-season rows would then be
indistinguishable from the 2025-26 backfill already sitting beside them**, since the season column
is the only thing separating the two.

**The check that catches it**: after any season-rollover fix, `SELECT DISTINCT season FROM` each
`nba_stats` table, not just the scrapers' URLs. *`[LIVE-AUDIT]`: this table currently holds 582 rows,
all `'2025-26'`, last written 2026-09-01.*

### ⚠ AND IT IS NOT ONE WORKER — at least two
`alphadog-v2-nba-static-player-bio.js` does the same thing, writing
`nba_stats.player_season_profile` with `'2025-26'` as a **string literal in its INSERT**, alongside
its `nba_ref.players` bio update.

| Worker | Table | Season written |
|---|---|---|
| `nba-static-onoff` | `nba_stats.player_onoff_profile` | literal `'2025-26'` |
| `nba-static-player-bio` | `nba_stats.player_season_profile` | literal `'2025-26'` |
| **`nba-static-team-stats`** | **`nba_team.season_profile`** | **literal `'2025-26'`** |
| 🔴 **`nba-static-player-tracking`** | **`nba_stats.player_tracking_profile`** | **literal `'2025-26'`, line 59** |

🔴 **CORRECTED 2026-09-21 (T7 pass 3): this is FOUR workers, not three.**
`[LIVE-AUDIT]` — every `alphadog-v2-nba-*.js` carrying `'2025-26'` in an INSERT:
`static-onoff` (line 77) · `static-player-bio` (73) · **`static-player-tracking` (59)** ·
`static-team-stats` (59). **`player-tracking` was absent from this list and from
`NBA_MASTER_SUMMARY.md` §T2.8**, which states *"three workers, three tables, two schemas."*

⚠ **This is the trap catching the warning about the trap.** These entries exist to say the rollover
fix feels complete after the scrapers and is not — **and then undercounted the write paths by one.**
A reader working the documented list would fix three of four and leave
`nba_stats.player_tracking_profile` stamping `'2025-26'` onto 2026-27 rows.

✅ **The scraper side is much healthier than these entries imply**: **18 scrapers now resolve the
season via the `nba_season` helper.** Of the ten still containing a literal, several are one-time
backfills over frozen seasons where the literal is **correct** — apply the cadence rule below before
changing any of them.

### 📌 The helper, its origin, and its escape hatch *(added 2026-09-21, T7 pass 4)*
`nba/nba_season.py` was written in T7. **Its docstring is the best statement of this trap anywhere in
the codebase:**
> *"every weekly static scraper hardcoded `Season=2025-26` … **confirmed on 6 scrapers directly**
> (splits, lineups, player-bio, tracking-detail, playtypes, shotquality) — and **the pattern is
> universal across the whole stats.nba.com scraper set, all written from the same template**. …the
> entire weekly layer would have silently kept pulling the frozen 2025-26 season's data **while
> reporting success on every run — the most dangerous kind of failure, because nothing errors**."*

- **The origin is the template**, so the defect was *copied*, not repeated — the same mechanism as
  the ten copied static writers.
- **`scrape_nba_daily_delta.py` was the only scraper that already auto-detected the season**; the
  helper is that logic lifted out.
- ⚠ **There is an `NBA_SEASON` environment-variable override** for deliberate one-off historical
  runs. **This is the escape hatch the cadence rule needs**: a past season can be re-scraped without
  editing any code, so a one-time backfill never needs its literal "fixed".
- ⚠ **The docstring's deadline is now wrong**: it says the danger lands *"on 2026-10-03 when the
  2026-27 season starts."* **The regular season opens 2026-10-20** — and since `current_season()`
  rolls over in **July**, the helper has been returning `2026-27` since then regardless.

**Three workers, three tables, spanning two schemas** (`nba_stats` and `nba_team`) — **so the
rollover fix has at least four locations**: the scrapers' URLs plus each of these INSERTs. **And no
single search term finds them all**, since one set writes the season into a query string and the
other into a SQL value. *Whether further workers do the same is not established; these three were
read in depth.*

**The three carry the system's pace, ratings, usage and on/off inputs** — `player_season_profile`
holds USG%/TS%/net rating, `nba_team.season_profile` holds pace and off/def rating,
`player_onoff_profile` holds the on/off splits. *Those are the tier-1 and tier-2 factors from the
Gemini list, all landing under a season label the worker chose rather than the data did.*

### A THIRD form of the same debugging move — headers into the error message
The player-tracking scraper does not wait for a zero-row failure. It checks whether its **key field
is null across every row**, and if so puts the source's real header list into the error:

```python
if not any(p.get("avg_speed") is not None for p in players):
    error = f"suspicious_all_null_avg_speed: real headers were {headers}"
```

**This catches the exact failure that cost two cycles elsewhere in this project** — a well-formed
response with a silently empty field, which is what `leagueStandingsV3`'s missing `TeamAbbreviation`
and `teamInfoCommon`'s missing `ARENA` both were. **A row count cannot see it; a null-check on the
field you actually came for can.**

**Three forms of one technique now recorded, all from the same two sessions:**

| Form | Where the evidence lands | Scraper |
|---|---|---|
| `_debug_headers` array in the output file | committed JSON | arenas |
| full raw page dumped on low confidence | committed debug artifact | DARKO, schedule |
| **real header list inside the error string** | **the meta file's `error` field** | **player tracking** |

*The third is the cheapest and the only one that costs nothing when the scrape succeeds.*

### The `_debug_headers` technique, worth keeping as a practice
The arenas scrape's first output committed **`arena_name: null` for all 30 teams plus a
`_debug_headers` array listing the columns `teamInfoCommon` actually returned** — `team_id`,
`season_year`, `team_city`, … `min_year`, `max_year`, and **no `arena` or `arena_capacity` at all.**

**That is what turned "the field is empty" into "the field does not exist", in committed data rather
than in a log that expires.** The same trick would have shortened the `leagueStandingsV3`
`TeamAbbreviation` diagnosis in T1. *Recorded as a method: when a scrape returns nulls, emit the
source's real header list into the output file before theorising.*

### The Wikipedia officials page marks active referees in bold — the parser cannot see that
The source page states: *"Referee data is available for the 1988-89 through 2026-27 seasons.
**Active referees are listed in bold**."* **T2's parser reads wikitext cell text and discards
formatting**, so boldness — the page's own active/inactive signal — is not available to it. The
parse targets the "Staff officials" table, which is the current roster, so the 80 rows are believed
current; **but the safeguard is table selection, not the page's actual active marker.** If that
table ever includes a retired official, nothing in the pipeline would notice.

---

## FROM T2 PASS 2 — THE FACTOR TIER LIST, AND TWO PARSER LESSONS *(added 2026-09-21)*

### Gemini's tier 1–4 factor list — recorded WITH its epistemic flag, which is the point
T2 asked Gemini for a prioritized list of prop-model factors and got one. **It is in
`NBA_ENRICHMENT_FACTORS_RESEARCH.md` but in none of the twelve**, and it is worth having here
because later calibration work tested these very claims:

| Tier | Factors |
|---|---|
| **1 — highest signal** | projected minutes · recent usage rate/role · team pace |
| **2 — strong, reliable** | defensive matchup / DvP · recent-form trailing averages |
| **3 — context-dependent, decisive in the right spot** | blowout risk from the spread · referee crew · rest/schedule fatigue |
| **4 — weak/noisy, test before trusting** | home/away splits · long-term season averages in isolation · altitude |

**T2 flagged its own source honestly, and that flag is the durable part:**

> *"This tiering is Gemini's synthesis of general industry consensus, **not a result from this
> system's own backtests**. It should not be treated as locked until independently checked against
> real data once the classification/scoring layer exists — this document records it as a **starting
> hypothesis for prioritization, nothing more**."*

**Carried forward as a hypothesis, dated 2026-09-03, not as a finding.** Gemini's own caveat on
home/away splits is recorded with it: *"test this feature's lift in your model; you may find it's
not worth the complexity."*

### The officials parser was written twice in one session
The first version split wikitable blocks and then rows on `|-`, assembling cells line by line. It
was replaced by a single `re.finditer` over number/name pairs with a `len(name.split()) > 4` reject
and a `normalize_id()` dedup. **Both are in T2; only the outcome (80 officials) is documented.**

**Why it matters beyond trivia**: the rewrite is the reason the count is **80** rather than the
**81** rows the Wikipedia page shows — the dedup key and the name regex drop one. *That is a
defensible parse, but it means "80 officials" is a parser artifact as much as a fact about the NBA,
and anyone reconciling against the page will find the discrepancy and wonder.*

### `result_set_rows(body, name)` — selecting a result set by NAME, not index
T1's scrapers take `resultSets[0]` positionally. **T2 introduced a helper that matches
`rs["name"]` instead**, which is the robust form: stats.nba.com endpoints return multiple result
sets and their order is not contractual. **Recorded because the two styles coexist in the codebase**
— a positional read that happens to work today is a silent failure waiting for the day the API
reorders, and it is the same class of defect as the `TeamAbbreviation` and `teamInfoCommon` column
disappearances already seen twice in T1 and T2.

### Name splitting, and the `Last, First` format
`commonAllPlayers` returns both `full_name` and `last_comma_first`. T2's `splitName()` prefers the
comma form when present and falls back to splitting on whitespace with everything-but-the-final-token
as the first name. **Recorded because the same `"Last, First"` convention appears elsewhere in
NBA-sourced data and the fallback is lossy for multi-word surnames.**

---

## FROM T2 PASS 1 — THE SCRAPER'S DEPENDENCY BUG, AND THE IMPACT-METRIC SOURCE SURVEY *(added 2026-09-21)*
*First pass on T2 under chronological order. T2 is the 2026-09-03 phase-3a enrichment session.*

### The `curl_cffi` / `requests` install, and why BOTH are there
Pass 88 recorded that `nba-scrape.yml`'s `Install tools` step runs
`pip install --upgrade pip curl_cffi requests` and noted only that it installs both. **T2 is where
the second one comes from, and it was a real failure**: the install step had been narrowed to
`curl_cffi` alone, and the officials scraper broke with a `ModuleNotFoundError`. T2's diagnosis:

> *"curl_cffi's requests-compatible module is a submodule accessed differently, not the actual
> `requests` package my officials script imports directly."*

**`from curl_cffi import requests` and `import requests` are different packages.** The nba.com
scrapers use the first (Chrome TLS impersonation); the Wikipedia officials scraper uses the second,
because Wikipedia does not tarpit and needs no impersonation. **Both must be installed.** *Anyone
"cleaning up" that line to the single package it appears to need will break the officials scrape,
and only the officials scrape — which now runs with `continue-on-error: true`, so it would fail
quietly.*

### Arenas: `teamInfoCommon` was tried first and rejected — recorded because only the outcome was
The twelve record `teamDetails` as the arena source (16 mentions). **They do not record that
`teamInfoCommon` was the first choice and failed.** T2 called all 30 teams against it successfully —
HTTP 200, `team_city` populated — but **`arena` and `arena_capacity` came back `null` for every
team**, because the endpoint's live schema no longer carries those column names.

**This is the same failure shape as `leagueStandingsV3`'s missing `TeamAbbreviation`** — the live
stats.nba.com response differing from the documentation the code was written against, returning a
well-formed row with a silently empty field rather than an error. **Two independent instances in the
first two transcripts.** *Recorded as a supersession: arenas were to come from `teamInfoCommon`
(T2, 2026-09-03), changed to `teamDetails` in the same session when the fields proved null.*

### The free impact-metric survey, and what was ruled out and why
The twelve record DARKO as the chosen source. **The alternatives it beat are recorded only outside
them**, and the reasons are the durable part:

| Source | Verdict | Reason |
|---|---|---|
| **DARKO** | **chosen** | public leaderboard, no paywall language, strong practitioner reputation |
| EPM (dunks & threes) | rejected | **premium subscription gate** — the free page shows partial data only, and scraping the paid portion would breach their ToS |
| RAPTOR (FiveThirtyEight) | rejected | open-sourced, but **FiveThirtyEight shut down** — no ongoing updates |
| nbarapm.com | **not evaluated** | a free aggregator carrying RAPM/ORAPM/DRAPM plus DARKO/LeBron/RAPTOR summaries; T2 flagged it as promising and **never verified it**. Appears in none of the thirty documents. |

**The ToS reasoning is worth keeping** — the decision not to scrape EPM was made on legitimacy
grounds, not capability grounds, and that is the kind of constraint a later session will otherwise
re-litigate.

**And the defensive architecture T2 specified for DARKO, because `darko.app` is a JS-heavy
client-rendered app**: an abstraction layer rather than a hard-coded dependency, plus deliberately
low-frequency scraping. *A plain `curl_cffi` fetch will not capture client-rendered data.*

---

## FROM T1 PASS 88 — THE WEEKLY CADENCE WAS LOCKED FOR A WORKFLOW THAT NO LONGER EXISTS *(added 2026-09-20)*
*VERIFIED by direct read of `.github/workflows/nba-scrape.yml` on live `main`, 2026-09-20.*

`nba-scrape.yml` still opens with the justification T1 wrote on 2026-08-31:

> *Weekly differential check, per the person's own instruction (2026-08-31): teams/static
> data changes rarely, so a weekly re-check is enough once backfill is done. Runs Monday
> 09:00 UTC …*
> `- cron: '0 9 * * 1'`

**That was true of the workflow it was written for.** On 2026-08-31 this file scraped **one thing** —
`nba_teams_current.json`, a 30-row list that changes at most once a decade. Weekly was generous.

**The workflow today runs SIXTEEN scrapers across twenty steps** and commits **40+ files**:
teams, players, arenas, officials, player bio, player tracking, team stats, on/off splits, DARKO,
schedule, play types, tracking detail, shot quality, shot zones, lineup synergy, career totals,
player+team splits. **`nba_team_stats_current.json` (pace/ratings), `nba_onoff_current.json`,
`nba_player_tracking_current.json`, `nba_darko_current.json` and `nba_schedule_current.json` all
change with every game played.**

**Nobody revisited the cadence when the scope grew.** The comment still says "changes rarely"; the
cron still fires once a week. **The season opens 2026-10-03.** From that date a Monday-only refresh
means in-season pace, ratings, on/off and player-impact inputs are **up to six days stale** whenever
the baseline engine reads them — and the stale window is invisible, because each file's `_meta.json`
records a real `fetched_at` that simply sits a week behind.

**MLB already learned this lesson and NBA did not inherit it.** `scrape.yml` carries a
`- cron: '0 */2 * * *'` backstop with this comment: *"prevention fix 2026-08-06: added after a real
incident where the board went stale for an extended period because this workflow only ran via
dispatch from the orchestration layer, with no independent backstop."* **MLB's scraper also has a
`repository_dispatch: types: [alphadog_prizepicks_board]` entry point. `nba-scrape.yml` has
neither** — its only triggers are the weekly cron, a bare `workflow_dispatch: {}`, and a push to
`nba/TRIGGER_NBA_SCRAPE.txt`.

**Not fixed** — recorded per the sweep's read-only rule. **The decision the owner needs to make
before 2026-10-03**: which of the sixteen families are genuinely weekly (teams, arenas, officials,
career totals) and which need a daily or in-season cadence of their own. **Splitting the workflow
is the obvious shape** — the current single job also means one slow scraper delays all sixteen.

*Related: the first scrape step (`Scrape NBA teams`) is the only one of the sixteen without
`continue-on-error: true` — already recorded at `NBA_MASTER_SUMMARY.md` line 1550. The officials
scraper is the only step that passes no `PROXY_URL`, because its source is Wikipedia, not nba.com.*

---

## FROM T1 PASS 87 — THE 18 MLB PATCHES, READ AS DIFFS *(added 2026-09-20)*
*Angle: pass 73 counted T1's writes by path. **This reads the `old_str`/`new_str` of every patch that
touched an MLB file** — 18 calls across `generate_wrangler_configs.py`,
`github_mobile_deploy_workers.py` and `alphadog-v2-admin-sql.js` — and checks each against the live
file. **VERIFIED by `github_grep_file` on the deployed bridge, 2026-09-20.***

### ⚠⚠ ONE NBA CHANGE EDITED THE **SHARED DISPATCH PATH**, AND ITS SAFETY RESTS ON AN UNSTATED INVARIANT
**Sixteen of the eighteen patches are guarded branches or appends** —
`if worker_name.startswith("alphadog-v2-nba-")`, `if worker in NBA_WORKER_SET`,
`else if (bindingName === "NBA_STATIC_TEAMS_WORKER")`. **MLB's existing behaviour is reached by the
same code it always was.**

**Two patches changed code every target runs through.** The significant one is in the bridge's
dispatch:
```js
// before (T1's old_str)                    // after (T1's new_str)
const resp = await binding.fetch(path, {    const method = body === null ? "GET" : "POST";
  method: "POST",                           const fetchOpts = method === "GET"
  headers: {...},                             ? { method: "GET" }
  body: JSON.stringify(body)                  : { method: "POST", headers: {...}, body: JSON.stringify(body) };
});                                         const resp = await binding.fetch(path, fetchOpts);
```
**This line runs for every `run_job` target, MLB included.** It exists for **one NBA job mode** —
`probe-sources`, the read-only GET diagnostic that produced the 403/520/526 evidence (pass 80).

**✅ The isolation holds, and it is VERIFIED rather than assumed.** **Live grep of the deployed
`alphadog-v2-admin-sql.js`, 2026-09-20**: **`body = null` appears exactly once, at line 683**, inside
the NBA branch, gated on `job === "probe-sources"`. **All eleven MLB branches assign an object**
(`body = { ... }`), so **no MLB target can reach the GET path.**

**⚠ But the guarantee is an invariant nobody wrote down**: *no MLB branch may ever set
`body = null`.* **The day one does — for any reason — that target silently becomes a GET with no
body.** **The isolation claim *"provably zero-impact on MLB"* is true of the other sixteen patches by
construction; for this one it is true by a property of the surrounding code that is not asserted
anywhere.** **Recorded as a maintenance constraint on an MLB file, which is exactly the kind of
inheritance the additive rule was meant to avoid.**

**The second shared-path change is benign and worth naming for completeness**: in
`github_mobile_deploy_workers.py`, `Path(f"{worker}.js")` became `Path(js_path)` where
`js_path = worker_js_path(worker)`. **That helper returns the original path for every non-NBA
worker**, so MLB resolution is unchanged — **but again the safety lives in the helper, not in the
call site.**

### ✅ THE BRANCH GREW FROM ONE BINDING TO TWENTY-ONE, EXACTLY AS T1 PREDICTED
T1's comment on the branch it created:
> *"**each NBA worker added here needs its own binding + branch, same as this one.**"*

**VERIFIED live**: line 679 is now a single `else if` testing **twenty-one binding names** in one
`||` chain — `NBA_STATIC_TEAMS_WORKER` through `NBA_BASELINE_LADDER_WORKER`.
**The prediction was right and the shape it produced is a 21-term boolean on one line.**
**This is the mechanism behind pass 46's count of 21 NBA dispatch bindings and pass 69's 21/21/21**,
and **it is the cost of the direct-call design**: no registry lookup, so every worker is a literal.

### The `main_file` bug, introduced and fixed four patches apart — the exact diff
**Patch 2** wrote:
```python
if worker_name.startswith("alphadog-v2-nba-"):
    return f"./nba/{worker_name}.js" if Path(f"nba/{worker_name}.js").exists() else "./worker.js"
```
**Patch 8 replaced it** with the version that returns `./{worker_name}.js` and carries the
explanation now in the live file (*"wrangler resolves `main` relative to the config file's own
directory … it must NOT be re-prefixed with `nba/` here"*).
**Between those two patches sits deploy run 33429867514 and its one error line** —
*"The entry-point file at `nba/alphadog-v2-nba-static-teams.js` was not found"* (pass 79).
**The documents record the bug and the fix; the introducing diff was never shown.** **Recorded
because the wrong version looks correct in isolation** — it is the *config's own location* that makes
it wrong, and that is not visible from the function.

### What the eighteen patches actually did, grouped
| File | Patches | What they add |
|---|---|---|
| `generate_wrangler_configs.py` | **7** | the NBA manifest merge · `main_file` NBA branch (×2, the second correcting the first) · the NBA `cfg` block (Hyperdrive, `nodejs_compat`, six vars) · the `nba/wrangler.*.jsonc` write loop · two service-binding list additions |
| `alphadog-v2-admin-sql.js` | **8** | the `NBA_STATIC_TEAMS_WORKER` binding in `bindingMap` · the dispatch branch · `probe-sources` GET handling · the shared GET/POST change · the `target` enum entry · the tool description · **the whole `github_trigger_workflow` tool registration and handler** |
| `github_mobile_deploy_workers.py` | **3** | the NBA manifest merge · `config_for_worker` NBA branch · the `worker_js_path` call-site change |

⚠ **The `github_trigger_workflow` registration is the largest single MLB-file addition in T1** — a
complete new MCP tool, description and handler, added to the bridge. **It is the capability pass 65
traced: built in-session, uncallable in-session, available from the next one.**

---

## FROM T1 PASS 86 — THE SCRAPER T1 WROTE, AND A CORRECTION TO PASS 79 *(added 2026-09-20)*
*Angle: the last unread `put_file` body — **`nba/scrape_nba_stats_teams.py`, 3,953 bytes as written**
— read as source, with its failure path traced through the real CI step conclusions.
**VERIFIED from the export's own step lists and from the live workflow.***

### ⚠⚠ A CORRECTION TO PASS 79: **every failed run had exactly ONE failed step**
**Pass 79 wrote that the deploy failure produced *"four red steps"* and that each scrape failure
showed *"three failed steps each"*. That is wrong, and it is my error.**

**VERIFIED from the step conclusions in the export:**
| Run | success | **failure** | skipped | The one step that failed |
|---|---|---|---|---|
| 33429867514 (deploy) | 13 | **1** | 3 | `Deploy selected Workers` |
| 33431309511 (deploy) | 17 | 0 | 0 | — |
| 33444713366 (scrape) | 6 | **1** | 2 | `Scrape NBA teams from stats.nba.com` |
| 33444861845 (scrape) | 6 | **1** | 2 | `Scrape NBA teams from stats.nba.com` |
| 33445264412 (scrape) | 6 | **1** | 2 | `Scrape NBA teams from stats.nba.com` |

**The steps I called failed were `skipped`.** My filter treated *"conclusion is not success"* as
failure, and **GitHub reports a step that never ran as `skipped`, not `failure`.**
**The corrected reading is better, not worse**: **one real failure, one red step, and the steps after
it did not run.** `Commit NBA data JSON to main` and `Post Set up Python` were **skipped**, and
`Post Checkout main` and `Complete job` still succeeded.
**Fourth instance of the pass-53 rule** — and the first where the false value came from **my own
comparison** rather than a grep. **Rule extended: when classifying a status field, enumerate its
values; never define one status as "not the good one."**

### ⚠⚠ AND THE CORRECTION EXPOSES A REAL ONE: **T1's stated intent was defeated by the step order**
T1 wrote this comment into the scraper, at the `sys.exit(1)`:
> *"Non-zero exit so the workflow run is visibly marked failed, **but the meta file (with the real
> error recorded) still gets committed** — matches the honest-failure-recording discipline
> established for this whole project rather than silently leaving stale data."*

**The meta file did not get committed.** **VERIFIED**: on all three failed scrape runs the
`Commit NBA data JSON to main` step is **`skipped`**, because the scrape step failed and T1's
workflow gave the commit step no condition. **The error was written to
`nba_teams_current_meta.json` inside the runner and discarded with the runner.**

**So the honest-failure discipline was stated, implemented in the script, and cancelled by the
workflow's default step behaviour.** **Nothing recorded this** — the intent is in the code, the
outcome is in the step list, and no document holds either.

**✅ And it is mostly fixed today, by accident rather than by design.** **VERIFIED on the live
workflow**: **15 of the 16 scrape steps now carry `continue-on-error: true`**, which marks them
successful for the purposes of what follows, **so the commit step now runs and their meta files do
get committed.** ⚠ **The teams scraper is still the exception** — it is the first step and the
only one *without* `continue-on-error`, **so a teams failure still skips the commit and still
discards its own error record.** **The one scraper whose failure T1 was writing that comment about is
the one still affected.**

### ⚠ The failure path also blanks the data file — contained, but worth knowing
```python
except Exception as exc:
    teams, http_status, error = [], None, str(exc)
OUTPUT_PATH.write_text(json.dumps({"teams": teams}, indent=2), encoding="utf-8")
```
**On any failure the script writes `{"teams": []}` over `nba_teams_current.json` before exiting.**
**✅ Contained in practice**, for the same reason the meta file never lands: **the commit step is
skipped, so the blanked file dies with the runner and the repo keeps the last good copy.**
**Stated at its real strength: this has never caused data loss and cannot while the commit step is
skipped.** **It is recorded because the containment is incidental** — it depends on the step being
skipped, and **15 of the 16 scrape steps are now `continue-on-error: true`, which is exactly the
condition that stops steps being skipped.** **Whether the other 15 scrapers blank their own outputs
on failure is NOT RECORDED**, and this pass did not check them.

### ✅ The scraper's headers are the canonical set — unlike the worker's
| | `Referer` / `origin` | User agent |
|---|---|---|
| **`scrape_nba_stats_teams.py`** (T1) | **`https://stats.nba.com/`** — correct | **a real Chrome 128 string** |
| `alphadog-v2-nba-static-teams.js` (T1) | `https://www.nba.com` — **wrong**, T1 later said so | `Mozilla/5.0 (compatible; AlphaDog-NBA-StaticTeams/0.1)` — **self-identifying** |

**T1 got the headers right in the Python and wrong in the JavaScript, in the same session.** The
Python also carries `Host`, `Accept`, `Accept-Language`, `Accept-Encoding: gzip, deflate, br`,
`Connection: keep-alive`, `x-nba-stats-origin: stats`, `x-nba-stats-token: true` — **the full
`nba_api` set recovered at pass 82.** Recorded because **pass 84 noted only the worker's error**, and
the contrast is the point: **the correct header set existed in the repo the whole time.**

✅ **And `timeout=30` in this original matches the first CI failure exactly** —
`Read timed out. (read timeout=30)` at run 33444713366 (pass 79). **The transcript, the source and
the CI log agree.**

---

## FROM T1 PASS 85 — THE TRIGGER FILE IS AN AUDIT LOG, AND IT RECORDS THE HYPOTHESIS LADDER *(added 2026-09-20)*
*Angle: the **five `TRIGGER_NBA_SCRAPE.txt` bodies** T1 wrote — the only file it rewrote more than
twice. Treated everywhere as a bare marker; **it is not.** **VERIFIED against the live repo.***

### ⚠⚠ THE TRIGGER FILE HAS A DEFINED SHAPE, AND IT IS DOCUMENTED NOWHERE
Every version T1 wrote carries **four parts**: a purpose line, an explanation of the mechanism, and
**two structured fields** —
```
last_triggered_utc: 2026-08-31T22:16:00Z
trigger_reason: retry through PROXY_URL …
```
**`trigger_reason` and `last_triggered_utc` appear in no document.** **VERIFIED live: the convention
held — 13 of the 14 `nba/TRIGGER_NBA_*.txt` files carry both fields today**, months of work later.
**The exception is `TRIGGER_NBA_PROBE.txt`**, which is 39 bytes and holds only
`script: scrape_prizepicks_nba_board.py` — **a different convention entirely: it passes an
argument rather than logging a reason.** That makes **two trigger-file conventions in one folder**,
and neither is written down.

### ⚠⚠ THE FIVE `trigger_reason` LINES ARE THE TARPIT INVESTIGATION, WRITTEN AS IT HAPPENED
Pass 79 reconstructed the escalation ladder from CI logs and noted the measurements were recorded in
no document. **They were recorded — in this file, one line per attempt, with timestamps, and they
are still in the repo's `git` history.** In order:

| UTC | `trigger_reason`, verbatim |
|---|---|
| **22:05** | *"first real trigger — verifying stats.nba.com is reachable from a GitHub Actions runner"* |
| **22:10** | *"retry with 60s timeout + 3 attempts, after first run got a **real read-timeout (not a hard block)** from stats.nba.com on a GitHub Actions runner"* |
| **22:16** | *"retry through PROXY_URL (**same secret MLB's PrizePicks scraper uses**), after two direct attempts both got a consistent 3/3 read-timeout from stats.nba.com on a plain GitHub Actions runner IP (**tarpit-style soft block, not a transient blip**)"* |
| **22:20** | *"retry with **curl_cffi (Chrome TLS impersonation)** after plain requests hung/timed out consistently even through a proxy, **ruling out IP-based blocking and pointing at TLS fingerprinting instead**"* |
| **22:24** | *"re-run after fixing empty abbreviation field (**leaguestandingsv3 has no TeamAbbreviation column** — now derived from a verified team-ID map)"* |

**Read together these are a complete diagnostic record**: hypothesis, evidence, next hypothesis —
**five attempts in nineteen minutes**, each naming what the previous result ruled out.
**The 22:20 line is the moment the diagnosis lands**, and it states the inference explicitly:
*"ruling out IP-based blocking and pointing at TLS fingerprinting instead."*

**Why this matters beyond the history**: **the documents record the conclusion, pass 79 recovered the
measurements, and this file holds the reasoning that connects them** — all three existed
independently and none pointed at the others. **The trigger file is a first-class audit artefact and
was being read as a no-op marker.**

### ⚠ `PROXY_URL` IS AN MLB-PROVISIONED SECRET THAT NBA WORKFLOWS USE
T1's own words: *"PROXY_URL (**same secret MLB's PrizePicks scraper uses**)"*.
**VERIFIED live**: `PROXY_URL` is referenced by **MLB's `.github/workflows/scrape.yml` (line 67)**,
by MLB's `underdog-board.yml`, **and by seven NBA workflows** — `nba-pergame-backfill`,
`nba-injury-report`, `nba-season-tables`, `nba-daily-delta`, **`nba-p2-overnight-heavy`**,
**`nba-p3-afternoon-light`** and `nba-probe`.

**So a shared repository secret crosses the MLB/NBA boundary, and both of the daily pipelines depend
on it.** **`PROXY_URL` itself is documented** (three documents name it); **what is not recorded is
that it is shared with MLB, that NBA inherited it rather than provisioning its own, and that seven
NBA workflows now depend on a secret MLB owns.**
**Stated at its real strength**: **this is not an isolation breach** — the isolation rule is about
data, schemas, workers and control plane, and repository secrets are repository-wide by nature.
**It is a dependency nobody recorded**: if that secret is rotated or removed for MLB reasons, **seven
NBA workflows including P2 and P3 change behaviour**, and nothing in the twelve would explain why.

### Confirmed against the transcript, already recorded
- **`leaguestandingsv3` has no `TeamAbbreviation` column** — the 22:24 line is the contemporaneous
  record of that discovery; **already documented** at `NBA_DATABASE.md` line 129 and in
  `scrape_nba_stats_teams.py`'s own comment (pass 65).
- **The trigger-file mechanism** (a push path filter, usable with plain commit tools, no dispatch
  capability needed) — **already documented**; the file's own text states it, and pass 65 recorded
  the causal chain that produced it.

---

## FROM T1 PASS 84 — THE FIRST NBA WORKER, READ AS SOURCE *(added 2026-09-20)*
*Angle: T1's largest `put_file` body — **`alphadog-v2-nba-static-teams.js`, 18,025 bytes as written**
— read line by line, with every claim it makes checked against the live database.
**VERIFIED by live SQL.***

### ⚠⚠ A VERIFIED DEFECT THAT ORIGINATES IN T1'S SOURCE: **`"los angeles"` resolves to TWO teams**
T1's `STATIC_FALLBACK_TEAMS` gives **LAC `city: "Los Angeles"`** and **LAL `city: "Los Angeles"`**.
`buildAliases` writes a `city` alias per team and normalizes it.
**VERIFIED live**: `nba_ref.team_aliases` holds **`alias_normalized = 'los angeles'` on two rows, for
two different `team_id` values** — `nba_1610612746` (Clippers) and `nba_1610612747` (Lakers).
**Any lookup that resolves a team by normalized city returns both.**

**Two further duplicates, same team rather than different teams**: `'golden state'` and `'utah'` each
appear twice — once as `city` (`CANONICAL`) and once as `manual_alias` (`CONTROLLED_ALIAS`).
**The de-duplication in `buildAliases` is per-call**, so it cannot see a row a later worker added.

**✅ Stated at its real strength — this is latent, not live.** **VERIFIED**: `nba_ref.team_aliases`
is **written by exactly one worker and read by no code at all**; `alias_normalized` appears only in
the writer's own INSERT. **Nothing resolves a team through this table today.** **The finding is that
the matching table was built for matching, nothing matches through it yet, and three collisions are
already waiting for whatever does.**

### ⚠⚠ AND ONE ALIAS CANNOT EVER MATCH: the historical SuperSonics entry
T1 deliberately seeded **historical franchise names** so old data would resolve:
```js
BKN: ["Nets", "Brooklyn Nets", "New Jersey Nets"],
OKC: ["Thunder", "Oklahoma City", "Seattle SuperSonics (historical, pre-2008)"],
```
**VERIFIED live**: that row exists, with
**`alias_normalized = 'seattle supersonics historical pre 2008'`.**
**The parenthetical survived normalization** — punctuation is stripped, the words are kept — **so a
lookup for "Seattle SuperSonics" will never match it.** **The alias exists and cannot do its job.**
**The intent is right and the execution is not**: a provenance note was written into the value
instead of alongside it. **Recorded, not fixed.**

### ⚠ **19 of T1's 26 manual aliases were silently dropped** — and that is correct behaviour
`EXTRA_ALIASES` defines aliases for **11 teams, 26 values in total.** **VERIFIED live: only
7 `manual_alias` rows exist.**
**Why**: `buildAliases` keeps a `seen` set of normalized values and skips any repeat, so
`"Lakers"` (already the `nickname`), `"Los Angeles Lakers"` (already the `full_name`), `"Nets"`,
`"Knicks"`, `"Suns"`, `"Spurs"`, `"Jazz"`, `"Clippers"`, `"Pelicans"`, `"76ers"` and the rest are
dropped as duplicates of canonical aliases.
**The seven that survive are the ones that add something**: `Golden State`, `GS Warriors`,
`Los Angeles Clippers`, `New Jersey Nets`, `Sixers`, `Seattle SuperSonics (historical, pre-2008)`,
`Utah`.
**✅ The de-duplication is right.** **What was never recorded is that the `EXTRA_ALIASES` list is
~73% redundant**, so anyone reading it over-estimates the alias coverage it provides.

### The alias taxonomy and its confidence vocabulary — defined in T1, documented nowhere
`NBA_DATABASE.md` lists `team_aliases`' columns. **It does not list the values those columns take.**
**From T1's source, and VERIFIED against the live table:**

| `alias_type` | `confidence` | Live rows |
|---|---|---|
| `city` | `CANONICAL` | **35** |
| `nickname` | `CANONICAL` | 30 |
| `full_name` | `CANONICAL` | 30 |
| `abbreviation` | `CANONICAL` | 30 |
| `nba_team_id` | `CANONICAL` | 30 |
| `manual_alias` | **`CONTROLLED_ALIAS`** | **7** |

**The rule T1 wrote**: `confidence: type === "manual_alias" ? "CONTROLLED_ALIAS" : "CANONICAL"` —
**derived-from-source aliases are CANONICAL; hand-curated ones are CONTROLLED_ALIAS.** That is a
real semantic distinction a consumer would need, and **it is in no document.**
⚠ **`[LIVE-AUDIT]` — `city` has 35 rows, not 30**: five teams carry a second city alias added
later — **Golden State (San Francisco + Golden State), LAC (Los Angeles + LA), Minnesota
(Minnesota + Minneapolis), Indiana (Indiana + Indianapolis), Utah (Utah + Salt Lake City).**

### `teamHasRealChange` — the eight fields that count as a change, and the one that does not
T1's change detector compares exactly: `nba_team_id`, `abbreviation`, `full_name`, `nickname`,
`location_name`, `conference`, `division`, and `active != 1`.
**This is the mechanism behind the *"0 written, 30 unchanged"* result pass 80 measured.**
⚠ **`arena_id` is not in the list** — consistent with pass 65's finding that the column is NULL on
all 30 rows and written by no code. **The change detector was written not to look at it**, which is
one more reason it was never noticed.

### Two source details recorded nowhere
- **The worker's user agent is self-identifying, not a browser string**:
  `"user-agent": "Mozilla/5.0 (compatible; AlphaDog-NBA-StaticTeams/0.1)"`. **It announces the
  scraper.** Given pass 79's evidence that the block is TLS-level rather than header-level, **this
  probably was not the cause** — but it is the kind of detail a future debugging session would want,
  and **`AlphaDog-NBA-StaticTeams` appears in no document.**
- **T1's original headers pointed at the wrong host**: `referer` and `origin` were
  **`https://www.nba.com`**, not `https://stats.nba.com/`. **T1 itself identified this later**
  (thinking block 28: *"my worker used the wrong Referer (www.nba.com instead of stats.nba.com)"*),
  and the canonical `nba_api` set recovered at pass 82 confirms `stats.nba.com`. **The correction is
  recorded; the original error is not**, and it is what a reader diffing the two versions would trip
  over.

### Already recorded, confirmed not new *(checked)*
- **The Seattle/Las Vegas 32-team expansion at early-vote stage for 2028-29** — written into T1's
  source comment and **already in `NBA_MASTER_SUMMARY.md`**. ✅ **This is the real NBA signal T1
  extracted from the same search that returned the WNBA noise recorded at pass 82** — the search was
  contaminated, and the useful fact was still pulled out of it correctly.
- **`team_id` formatted as `nba_${team.id}`** — the prefixed convention, already documented as one
  half of the two-convention split (pass 33).
- **`x-nba-stats-origin` / `x-nba-stats-token`** — already in two documents.

---

## FROM T1 PASS 83 — THE FILES T1 WROTE IN FULL, READ AS SOURCE *(added 2026-09-20)*
*Angle: T1 issued **7 `github_put_file` calls** that carry a complete file body. Pass 45 verified
those artefacts still **exist**; **this pass reads what T1 actually wrote** and compares it to the
file today. **First pass under the owner's scope rule of 2026-09-20** — transcript material and
verification reset the clean count; live-system state is tagged `[LIVE-AUDIT]` and does not.*

### ⚠⚠ A CORRECTION TO PASS 75: **there are THREE scheduled NBA workflows, not two**
**Pass 75 reported that only `nba-p1-weekly-static.yml` and `nba-referees.yml` carry a `schedule:`
block. That is wrong.** **`nba-scrape.yml` carries `cron: '0 9 * * 1'`** — **written by T1, in the
file T1 created, and unchanged today.**

**How the error happened, recorded against myself**: the pass-75 scan used
`grep -A2 "schedule:"`, and in `nba-scrape.yml` **three comment lines sit between `schedule:` and
`- cron:`**, pushing the cron out of the two-line window. **A grep window is a formatted-string
assumption, and this is the third instance of the pass-53 rule in this effort** — after the
em-dash/`—` escape (pass 64) and the `3-5x`/`3–5×` variant. **The rule is extended again:
when scanning YAML for a key's value, match the key and the value independently, never by proximity.**

**Corrected count**:
| Workflow | cron | Meaning |
|---|---|---|
| `nba-p1-weekly-static.yml` | `'0 19 * * 1'` | Mondays 19:00 UTC — 12:00 PST / 11:00 PDT |
| **`nba-scrape.yml`** | **`'0 9 * * 1'`** | **Mondays 09:00 UTC — 01:00 PST / 02:00 PDT** |
| `nba-referees.yml` | `'30 15 * * *'` | daily 15:30 UTC — 07:30 PST / 08:30 PDT |

**Everything else, including P2 and P3, remains dispatch-or-trigger-file only** — that part of
pass 75 stands.

### T1 wrote the cron, and wrote the owner's reason into the comment beside it
**The transcript's own file body carries the instruction that set the cadence:**
> *"Weekly differential check, **per the person's own instruction (2026-08-31): teams/static data
> changes rarely, so a weekly re-check is enough once backfill is done.** Runs Monday 09:00 UTC
> (**matches the general weekly-differential convention already used for MLB**)."*

**The cadence rule is documented** (`NBA_MASTER_SUMMARY.md`, `NBA_SYSTEM_DESIGN.md` both carry
`0 9 * * 1`). **What was not recorded is that the weekly cadence is an owner instruction dated
2026-08-31, and that the hour was chosen to match an existing MLB convention** — both stated in the
comment T1 wrote.

⚠ **And a scheduling observation worth flagging**: **P2's planned cron is also `09:00 UTC`**
(pass 75, from P2's own header). **If P2 is given `0 9 * * *`, it will collide with `nba-scrape.yml`
every Monday at the same minute.** **Whether that matters is NOT RECORDED** — they are different
workflows with different concurrency groups, so GitHub will run both — **but they would both be
hitting stats.nba.com at once**, and the tarpit evidence (pass 79) says that source punishes
concurrency-blind clients. **Flagged for the owner to consider when the cron goes in.**

### ⚠ T1 ORIGINATED THE `[skip ci]` CONVENTION — and pass 81 shows what it does not cover
**T1's commit step, verbatim:**
```bash
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add nba/data/nba_teams_current.json nba/data/nba_teams_current_meta.json
if git diff --cached --quiet; then echo "No NBA teams JSON changes to commit."; exit 0; fi
git commit -m "Update NBA teams JSON **[skip ci]**"
git push origin HEAD:main
```
**`[skip ci]` in this repository starts here** — in the workflow T1 wrote, so that a data commit
would not retrigger the deploy pipeline. **The convention is documented; its origin is not**, and
**neither is the committer identity, the `HEAD:main` push, the empty-diff early exit, nor the
concurrency group `alphadog-nba-scraper` with `cancel-in-progress: false`.**

⚠⚠ **And pass 81 completes the picture**: **`[skip ci]` does not suppress GitHub Pages.** So
**every automated data commit this scraper makes also fires a Pages build** — not just the
documentation commits. **The scraper runs weekly and commits whenever the data changed**, so this is
a recurring, permanent effect, not an artefact of this documentation effort.

✅ **The empty-diff guard is worth naming as good practice**: `if git diff --cached --quiet; then
exit 0` — **the scraper commits only when the data actually changed**, which is why
`nba_teams_current.json` has not churned. It is the file-level twin of the
*"only update rows that actually changed"* behaviour pass 80 measured in the worker.

### `[LIVE-AUDIT]` — what those files look like today *(recorded; does NOT affect the clean count)*
| File | As T1 wrote it | Today | Commits |
|---|---|---|---|
| `nba/NBA_PROJECT_LOG.md` | 5,885 B | **130,406 B** — **×22** | **47** |
| `.github/workflows/nba-scrape.yml` | 1,542 B | **7,307 B** — **×4.7** | **31** |
| `nba/worker_manifest_nba.json` | 58 B (1 worker) | 868 B (**21 workers**) | 19 |
| `nba/alphadog-v2-nba-static-teams.js` | 18,025 B | 23,843 B | 9 |
| `nba/scrape_nba_stats_teams.py` | 3,953 B | 6,826 B | 10 |
| **`nba/NBA_SYSTEM_DRAFT.md`** | 12,175 B | 15,692 B | **4 — last touched 2026-09-02** |

**`[LIVE-AUDIT]` — `nba-scrape.yml` now runs SIXTEEN scrapers in a job still named
`scrape-nba-teams`.** Teams, players, arenas, officials, player bio, player tracking, team stats,
on/off splits, DARKO, schedule, play types, tracking detail, shot quality and lineup synergy all run
in that one job. **The job name no longer describes the job** — the same class of drift as
`nba-diagnostic.yml` being named *"NBA Starter Status Diagnostic"* (pass 70).
**15 of its steps carry `continue-on-error: true`; the first (teams) does not** — **already
documented and already reasoned about** at `NBA_MASTER_SUMMARY.md` §T2.10a and the OPEN_ITEMS caveat
(*"the rule is never let an INVISIBLE failure pass, not never tolerate failure"*). **Not new.**

**`[LIVE-AUDIT]` — `NBA_SYSTEM_DRAFT.md` has been frozen since 2026-09-02**, four commits, three of
them on its creation day. **In the eighteen days since, 21 workers, 32 workflows and the entire
scoring engine were built.** ⚠ **Six of the twelve mandated documents cite it** (pass 74), so **the
twelve point at a design document that stopped tracking the system on day three.** This is blueprint
§5b's own warning — *"static manifest/mapping files can silently describe an earlier
architecture"* — **turned on an NBA document.** Recorded; **not fixed, and not counted against the
clean run.**

---

## FROM T1 PASS 82 — THE WEB-RESEARCH RESULTS, NOT THE QUERIES *(added 2026-09-20)*
*Angle: pass 38 inventoried **what T1 searched for**. This reads **what came back** — all seven
`web_search` / `web_fetch` results with content. **Quoted from the export.***

### ⚠⚠ THE 30-TEAM CHECK RESTED ON A SEARCH THAT RETURNED **WNBA** RESULTS — and the three teams are now named
T1's query was *"NBA team relocation rename expansion team 2026 2027 season"*. **What came back:**
> *"The **Toronto Tempo** were added to the Eastern Conference in 2026. The **Connecticut Sun**
> relocated to Houston and moved to the Western Conference in 2027. The **Cleveland Rockers** were
> added to the Eastern Conference in 2028."*

**All three are WNBA franchises.** Toronto Tempo is a WNBA expansion team; the Connecticut Sun is a
WNBA team; the Cleveland Rockers was a WNBA franchise. **The result reads exactly like NBA
conference realignment and is not.**

**✅ T1 caught it.** Thinking block 16: *"That mix of **fan-wiki speculation and unrelated WNBA
news** confirms nothing's actually changed — the NBA remains at 30 teams with no relocations for
2026-27, **though I still shouldn't fully trust unofficial sources for expansion details**."*
**Pass 38 already recorded that caveat.** **What is new is naming the contamination**, because:
- **"Toronto Tempo" appears in no document**, so nobody re-running this check knows what to expect;
- **the hardcoded 30-team fallback list — which served the first successful run — rests on this
  search**, dated **2026-08-31**, and is **NOT RECORDED as re-checked since**;
- **an NBA/WNBA collision is the specific, repeatable failure mode for league-structure queries**,
  and it will recur for anyone searching roster, conference or expansion questions.

**The reusable rule**: **for league-structure questions, an NBA query returns WNBA answers that are
structurally identical in shape.** Verify against an official NBA source, or discard.

### ⚠ A CLOSED LOOP IN THE TOOLING: **you cannot fetch a worker you just deployed**
T1 tried to verify its new worker directly:
`web_fetch("https://alphadog-v2-nba-static-teams.rodolfoaamattos.workers.dev/health")` →
> `{"error_type": "**PERMISSIONS_ERROR**", "error_message": "This URL was **not in any prior search or
> fetch result**. **web_search for it first, then fetch the result link.**"}`

**So `web_fetch` will only follow a URL that a prior search surfaced.** T1 then searched for the
worker's hostname — and the search returned **`nba_api` documentation**, because **a freshly
deployed private Workers subdomain is not indexed by anyone.**

**That is a closed loop**: *fetch requires a search result → search cannot find a brand-new private
endpoint → the endpoint cannot be fetched.* **Neither `PERMISSIONS_ERROR` nor the rule appears in
any document.**
**This is why verification went through Postgres instead** — T1 checked `nba_ref.teams` row counts
rather than the worker's own `/health` (thinking block 23). **The documents record that fallback as a
good practice** (*"query the database directly, not just the worker's own report"*), **and it is a
good practice** — **but it was also the only option available.** Recorded so the discipline is not
mistaken for a free choice, the same way pass 39 corrected the provenance of the §0a method.

### Already recorded, confirmed not new *(checked)*
- **The canonical `nba_api` header set** — `Host: stats.nba.com`, `Referer: https://stats.nba.com/`,
  `Accept-Encoding: gzip, deflate, br`, `Connection: keep-alive`, `x-nba-stats-origin: stats` —
  **already in `NBA_MASTER_SUMMARY.md` and `NBA_OPEN_ITEMS.md`**.
- **The `data.nba.net` endpoint catalogue** — `/data/10s/prod/v1/{date}/scoreboard.json`,
  `{year}/teams.json`, `{year}/players.json`, coaches — **`data/10s/prod` is already in
  `NBA_MASTER_SUMMARY.md`.**
- **BallDontLie's free tier and paid tier** — already recorded, including the
  **⚠ UNVERIFIED SPEND item for the GOAT tier at $39.99/month.**

---

## FROM T1 PASS 81 — THE 31 WORKFLOW-RUN LISTINGS, AND THE WORKFLOW NOBODY WROTE *(added 2026-09-20)*
*Angle: the 31 `github_list_workflow_runs` **results** — not the runs T1 was waiting for (pass 40)
but **everything else that appeared in the same lists.** **VERIFIED by re-running the call live
2026-09-20.***

### ⚠⚠ **GITHUB PAGES IS ENABLED ON THIS REPOSITORY, AND NO DOCUMENT MENTIONS IT**
**In T1's 31 listings, the most frequent workflow by far is one that exists in no file:**
| Workflow name seen in T1's listings | Appearances |
|---|---|
| **`pages build and deployment`** | **44** |
| `AlphaDog v2 Mobile Auto Deploy` | 35 |
| `NBA Static Data Scraper` | 9 |

**`pages build and deployment` is GitHub's auto-generated Pages workflow.** It has **no file in
`.github/workflows/`** — which is why it appears in no inventory, including pass 70's sweep of all
32 `nba-*.yml` and the MLB workflow count.

**VERIFIED LIVE, 2026-09-20**: a fresh `github_list_workflow_runs(per_page=12)` returns **twelve runs,
all `pages build and deployment`, all on `main`** — **and every one is on a commit SHA written by
this documentation pass.** Two completed **`success`**; the rest **`cancelled`**, each superseded by
the next push.

### ⚠⚠ **`[skip ci]` DOES NOT STOP IT** — and that matters for how this work has been committed
**Every commit in this documentation effort carries `[skip ci]`.** **VERIFIED**: the MLB deploy
workflow (`AlphaDog v2 Mobile Auto Deploy`) **did not fire for any of them** — `[skip ci]` works
there — **but the Pages build fired for every single one.** **GitHub's Pages build does not honour
`[skip ci]`.**
**So the commit convention this effort was instructed to use suppresses the deploy pipeline and does
not suppress Pages.** Recorded plainly: **the instruction was correct and did what it was meant to
do** (no worker was redeployed by a documentation commit); **the Pages builds are an additional
effect nobody asked for and nobody recorded.**

### What Pages would be publishing — stated carefully, because the setting cannot be read from here
**VERIFIED on the clone**: there is **no `gh-pages` branch**, **no `docs/` directory**, **no
`_config.yml`**, **no `.nojekyll`**, **no `CNAME`** and **no `index.html` anywhere in the repo.**
**With a Pages source of `main` at the repository root and no Jekyll config, the default build
processes the repo root** — which means **the markdown files, including these twelve documents, are
what the site is built from.**

⚠⚠ **AND THIS COMPOUNDS THE CREDENTIAL BLOCKER AT THE TOP OF THIS DOCUMENT.** If the twenty
transcripts are committed to `nba/transcripts/` while Pages is building from `main`, **the
credential values inside them would be inside the published site as well as inside `git` history.**

**What this pass does NOT claim, and cannot**: **whether the published site is public.** GitHub Pages
can be private on some plans, and **the repository's Pages visibility setting is not readable through
any tool available here.** **No claim is made that anything is currently exposed on the open web.**
**The finding is that a publishing pipeline is running on every push, was documented nowhere, and
must be checked before the transcripts are committed.**

**→ Owner action, added to the blocker**: **confirm the repository's GitHub Pages setting — whether
it is enabled, what source it builds from, and whether the site is public — before committing the
transcripts.** If it is public, **redaction alone is not enough for anything already committed**, and
the credential rotation recorded at pass 77 becomes the only reliable remedy.

### The listings also show how T1 polled
**Every one of the 31 calls used a small `per_page`**: **14 calls at `per_page: 2`**, 9 at `3`,
3 at `1`, 2 at `6`, 2 at `4`, 1 at `10`. **T1 was checking "did my run appear yet", not surveying
history** — which is the same behaviour the 25 polling sleeps record (pass 66), seen from the other
side. **Recorded as corroboration**, not as a new finding.

---

## FROM T1 PASS 80 — THE FOUR `run_job` RESULTS AND `check_bindings`, RE-RUN LIVE *(added 2026-09-20)*
*Angle: the live-system **responses** T1 received — one `check_bindings`, three `run_job` calls
against the NBA worker, one against MLB's control room — **with `check_bindings` re-run today for
comparison**. **VERIFIED live 2026-09-20.***

### ✅ THE ENVIRONMENT SURFACE IS UNCHANGED SINCE T1 — and the D1 zeros still hold
**`check_bindings` re-run today returns the same shape T1 saw**: **all 12 D1 bindings `false`**
(`CONTROL_DB`, `CONFIG_DB`, `REF_DB`, `STATS_HITTER_DB`, `STATS_PITCHER_DB`, `TEAM_DB`, `DAILY_DB`,
`MARKET_DB`, `CONTEXT_DB`, `SCORE_DB`, `ARCHIVE_DB`, `SCORING_DB`), **20 vars present**,
**11 secrets present**, `control_room_service_binding_present: true`.
**The twelve D1 names still exist as binding slots and every one is unbound** — consistent with the
2026-08-12 decommission and with pass 40's finding that six MLB workers still carry D1 bindings in
config. **Recorded as a clean re-verification**, not a new finding.

### ⚠⚠ THE MECHANISM BEHIND §0.3 — **NBA workers are given six vars, and none of them is an operating constant**
`NBA_WORKERS.md` §0.3 records that **every NBA worker's operating constants are hardcoded** and that
the founding rule is not holding. **This pass found why the hole exists, in the generator's source.**

**MLB's shared `VARS` carries the operational caps** — **VERIFIED live via `check_bindings`**:
`MAX_TICK_MS`, `MAX_API_CALLS_PER_TICK`, `MAX_ROWS_PER_TICK`, `LOCK_STALE_MINUTES`,
`WORKER_SAFE_MODE`, `DEBUG_MODE`, `MANUAL_SQL_ENABLED`, `CONFIG_PHASE`, `DEFAULT_DAY_SCOPE`,
`DEFAULT_SLATE_MODE`, and four API base URLs — **20 in total.**

**`generate_wrangler_configs.py` gives an NBA worker exactly six**, in a block that says so outright:
> *"NBA expansion (additive only): every NBA worker gets … **its own vars, never the shared MLB VARS
> dict mutated in place**."*
```python
cfg["vars"] = {
    "SYSTEM_ENV":  VARS.get("SYSTEM_ENV", "production"),
    "SYSTEM_TIMEZONE": VARS.get("SYSTEM_TIMEZONE", "America/Los_Angeles"),
    "ACTIVE_SPORT": "basketball_nba",
    "NBA_STATS_API_BASE_URL": "https://stats.nba.com/stats",
    "WORKER_SAFE_MODE": VARS.get("WORKER_SAFE_MODE", "false"),
    "DEBUG_MODE":  VARS.get("DEBUG_MODE", "false"),
}
```
**✅ The isolation is real and deliberate** — this is exactly the additive design pass 65 traced, and
it is why no MLB var leaks into an NBA worker.
**⚠ But it also means an NBA worker has nowhere to read a timeout, a retry count, a chunk size or a
row cap from.** **`nba_config.system_settings` exists and is read by no code** (pass 33), and **the
vars block carries no operational constant at all.** **So the constants had nowhere to live except
the source**, which is precisely what §0.3 catalogues. **The rule did not fail through neglect; the
plumbing for it was never built on either side.** Recorded as the mechanism, not a new violation.

### ⚠ A small inconsistency: `ACTIVE_SPORT` uses two different naming conventions
**VERIFIED**: `vars.production.json` (MLB) sets **`"ACTIVE_SPORT": "MLB"`**; the generator sets
**`"ACTIVE_SPORT": "basketball_nba"`** for NBA workers. **A league abbreviation on one side and a
ParlayAPI-style sport key on the other, in the same variable name.** Harmless while nothing compares
them across sports; **recorded because any future code that does compare them will be wrong.**

### What the three NBA `run_job` results actually reported
| Call | Result |
|---|---|
| `run` (first) | `teams_written: 30`, `aliases_written: 157`, `teams_unchanged_skipped: 0`, **`elapsed_ms: 78,616`**, `external_calls_performed: 0`, `source_key: STATIC_SEED_FALLBACK_AFTER_FETCH_ERROR`, `source_fetch_error: "nba_stats_api_http_520"` |
| `run` (second) | **`teams_written: 0`, `teams_unchanged_skipped: 30`**, `aliases_written: 157`, **`elapsed_ms: 73,240`** |
| `probe-sources` | `stats.nba.com/stats/leaguestandingsv3` → **HTTP 520**, body = Cloudflare's own *"Error 520: Web server is returning an unknown error … the origin web server sent a response that Cloudflare could not parse"* |

**✅ The idempotency is demonstrated, not asserted**: the second run wrote **zero** team rows and
skipped **30 unchanged** — the *"only updates rows that actually changed"* behaviour recorded in
`NBA_DATABASE.md`, shown working on the very first repeat.

⚠ **And a measurement worth flagging: a 30-row upsert took 78.6 seconds, then 73.2 seconds.**
That is **the write path, not the fetch** — `external_calls_performed: 0` on both. **Why a 30-row
idempotent upsert through Hyperdrive costs over a minute is NOT RECORDED**, and this pass does not
explain it. It is consistent with pass 66's measurement that **`run_job` averaged 49.5 s over four
calls**, and it is the kind of number that matters when 21 workers run in sequence.

### The one MLB call, and what it returned
`run_job {"job": "trigger", "target": "CONTROL_ROOM"}` → **HTTP 400**,
`"error": "unknown_or_not_enabled_v2_control_room_job"`, from
`alphadog-v2-control-room-v1.6.215-baseline-v5-classification-rescue-target-batch`.
**The call was rejected by MLB's own worker** — **nothing was triggered** — which is one more
independent data point for the isolation record, and it captures the control room's exact deployed
version string at 2026-08-31.

---

## FROM T1 PASS 79 — THE CI LOGS THEMSELVES: THE PRIMARY EVIDENCE BEHIND THE TARPIT DIAGNOSIS *(added 2026-09-20)*
*Angle: the six `github_get_workflow_run_log` calls, read for their **`log_text`** rather than their
run IDs (pass 40) or their timing (pass 66). **This is the raw CI output T1 actually saw.**
**MEASURED and quoted from the export.***

### ⚠⚠ THE ESCALATION LADDER, EXACT — and the documents record the conclusion without it
`NBA_RECIPE.md` and `NBA_SYSTEM_ARCHITECTURE.md` record the tarpit conclusion. **The evidence that
produced it is three runs with three different settings, and every one failed the same way:**

| Run | Setting | Result |
|---|---|---|
| **33444713366** | `read timeout=30`, single attempt | `NBA teams scrape FAILED: HTTPSConnectionPool(host='stats.nba.com', port=443): **Read timed out. (read timeout=30)**` |
| **33444861845** | `read timeout=60`, **3 attempts** | `Attempt 1/3 failed`, `Attempt 2/3 failed`, `Attempt 3/3 failed` — **all `Read timed out. (read timeout=60)`** |
| **33445264412** | **proxy enabled**, `read timeout=30`, 3 attempts | `Attempt 1/3 failed **(proxy=yes)**`, 2/3, 3/3 — **all `Read timed out.`** |

**Doubling the timeout changed nothing. Adding a proxy changed nothing. Three attempts changed
nothing.** **Not once was there a 403, a connection refusal, a TLS error or an HTTP status** —
**every single failure is a READ TIMEOUT**, i.e. the connection was accepted and then held open with
no response. **That is the entire evidentiary basis for the tarpit diagnosis**, and it is why the
answer was TLS fingerprint impersonation (`curl_cffi`) rather than headers, IP or retries.

⚠ **None of these strings appears in any document**: `Read timed out`, `read timeout`,
`Attempt 1/3`, `proxy=yes`. **`timeout=30` and `timeout=60` appear, but as worker configuration
values, not as this ladder.** **The conclusion was carried forward; the measurements were not.**
**They are recorded here because they are the reusable part**: *a read timeout that survives a longer
timeout and a different egress is a tarpit, not a block.*

### The deploy failure's exact fingerprint
Run **33429867514**, the first deploy failure, returns one error line:
> `✘ [ERROR] **The entry-point file at "nba/alphadog-v2-nba-static-teams.js" was not found.**`

**This is the `nba/nba/` path-doubling bug** — wrangler resolves `main` relative to the config file's
own directory, so a config already inside `nba/` must not re-prefix the path. **The bug is documented
in four places; the exact wrangler error string is not**, and it is the string anyone would search
for when it recurs. **Recorded verbatim for that reason.**

⚠⚠ **CORRECTED 2026-09-20 (pass 86): ONE step failed, not four.** *The run had 17 steps — **13 success, 1 failure, 3 skipped**. The only `failure` is `Deploy selected Workers`; the others were **`skipped`** because the step before them failed. My filter treated "not success" as failure. **Fourth instance of the pass-53 rule** — see FROM T1 PASS 86. The original text follows.* ⚠ **The failed job had SEVENTEEN steps and FOUR failed**: `Deploy selected Workers`,
`Record last successful deploy marker`, **`Post Setup Python`** and **`Post Setup Node`**. **The last
two are post-job cleanup steps that failed as a consequence** — **so one real failure produced four
red steps.** Worth knowing before reading a failed deploy as four separate problems.

**The scrape failures have the same shape**: every one shows **three** failed steps —
`Scrape NBA teams from stats.nba.com`, **`Commit NBA data JSON to main`** and `Post Set up Python`.
**The commit step fails because the scrape produced nothing to commit.** ✅ **And each run ends with
`##[error]Process completed with exit code 1`** — **the job failed loudly, with no
`|| echo failed` swallowing it**, which is the discipline the P2 header states as a rule.

### The tool's real behaviour, measured — a correction to how pass 40 framed it
Pass 40 recorded that `github_get_workflow_run_log` returned **404** for an in-flight run and
concluded logs are *"not retrievable in flight and expire afterwards."* **That is correct as far as
it goes.** **What the five successful calls show is that the tool does return log text, with a
server-side grep** — and the numbers are worth having:

| Run | `total_log_lines` | `returned_lines` | `tail_lines` asked |
|---|---|---|---|
| 33429867514 (deploy) | **9,551** | **40** | 150 |
| 33431309511 (deploy) | **9,627** | **40** | 60 |
| 33444713366 (scrape) | 184 | 8 | 80 |
| 33444861845 (scrape) | 187 | 32 | 80 |
| 33445264412 (scrape) | 188 | **40** | 40 |

**A deploy log is ~50× larger than a scrape log** (9,551 vs 184 lines). ⚠ **And `returned_lines`
never exceeded 40, even when `tail_lines` asked for 150** — **an effective 40-line cap on what comes
back**, which is **NOT RECORDED** anywhere. **Anyone diagnosing a large deploy failure gets at most
40 matching lines out of ~9,500 and must choose the grep pattern accordingly.**

---

## FROM T1 PASS 78 — T1'S READING LIST, COUNTED AGAINST THE REPO IT WAS READING *(added 2026-09-20)*
*Angle: pass 73 counted what T1 **wrote**. This counts what it **read** — every `github_get_file`,
`github_grep_file` and `github_list_dir` call, with the denominator measured on the live clone.
**MEASURED from the export and VERIFIED against the repo.***

### The whole reading surface: **32 calls, 20 distinct paths, 4 directory listings**
| What was read | Calls |
|---|---|
| `alphadog-v2-admin-sql.js` | **7** — 1 full read + **6 greps** |
| `nba/NBA_PROJECT_LOG.md` | 3 (re-read before each append) |
| `nba/alphadog-v2-nba-static-teams.js` | 3 |
| `nba/data/nba_teams_current.json` | 2 |
| **The three handoff documents** — blueprint, lessons, domain mapping | **1 each, full** |
| `alphadog-v2-static-teams.js` (the MLB worker template) | 1 |
| `generate_wrangler_configs.py`, `github_mobile_deploy_workers.py`, `github_write_worker_secrets_file.py` | 1 each |
| `.github/workflows/scrape.yml`, `alphadog-v2-github-auto-deploy.yml`, `.github/workflows/nba-scrape.yml` | 1 each |
| `alphadog-v2-parlay-sleeper-board.js`, `alphadog-v2-prizepicks-github-board.js` | **grep only — never read in full** |
| `github_list_dir` on **`/`, `nba`, `.github`, `.github/workflows`** | 4 |

**The three handoff documents were each read exactly once, in full** — matching the founding
instruction *"read all three in full before doing anything else."* ✅

### ⚠⚠ THE MEASURED SEARCH SPACE: **NINE MLB FILES, OUT OF 372 AT THE REPO ROOT ALONE**
**VERIFIED on the live clone**: the repo root holds **140 `.js` MLB workers, 11 `.py` scripts and
41 `.md` documents — 372 files in total** — plus **6 MLB workflows** and the `gbdt_training/`
directory's 28 files.

**T1 opened nine MLB files**: `alphadog-v2-static-teams.js`, `alphadog-v2-admin-sql.js`,
`alphadog-v2-parlay-sleeper-board.js`, `alphadog-v2-prizepicks-github-board.js`,
`generate_wrangler_configs.py`, `github_mobile_deploy_workers.py`,
`github_write_worker_secrets_file.py`, `.github/workflows/scrape.yml`,
`alphadog-v2-github-auto-deploy.yml`. **Two of the four workers were only grepped, never read.**

**This is the measurement that pass 40's finding was missing.** Pass 40 established that T1's central
discovery — *"scrape on a GitHub runner because Cloudflare cannot reach the host"* — was **prior
art already written into `gbdt_training/d1_client.py`**, and cost four failed runs and 25 polling
sleeps to rediscover. **Now the reason is measurable rather than inferred: `gbdt_training/` was never
opened, and neither were 363 of the 372 root files.** **The search space for *"has MLB already solved
this"* was nine files.**

**Stated at its real strength**: **reading nine files was not unreasonable** — they were the right
nine for the task, chosen by the investigation method at `NBA_WORKERS.md` §0a (registry first,
targeted grep second, full read only when necessary), and **that method is correct and is why the
work was fast.** **The finding is that the method optimises for "answer this question" and has no step
for "has this already been solved here"**, and **pass 40 measured what that costs.** The two findings
complete each other.

### The eight grep patterns are a compact record of what T1 needed to know
| Target | Pattern |
|---|---|
| `alphadog-v2-parlay-sleeper-board.js` | `sport\|basketball\|baseball_mlb` |
| `alphadog-v2-admin-sql.js` | `target\|BASE_HITTER_GAME_LOGS_WORKER\|run_job` |
| `alphadog-v2-admin-sql.js` | `bindingName ===` |
| `alphadog-v2-admin-sql.js` | `NBA_STATIC_TEAMS_WORKER.*\{\|binding\.fetch` |
| `alphadog-v2-prizepicks-github-board.js` | `raw.githubusercontent\|api.github.com\|GITHUB_TOKEN` |
| `alphadog-v2-admin-sql.js` | `function toolGithub\|GITHUB_TOKEN\|api.github.com` |
| `alphadog-v2-admin-sql.js` | `this\.server\.tool\(\|"github_grep_file"\|"github_list_dir"` |
| `alphadog-v2-admin-sql.js` | `github_trigger_workflow` |

**Six of the eight target the MCP bridge**, which is the file T1 had to understand to extend its own
tooling — **the bridge was the single most-read file of the session.** ⚠ And the
`prizepicks-github-board` grep (`raw.githubusercontent|api.github.com|GITHUB_TOKEN`) is **the exact
moment the GitHub-committed-JSON pattern was identified**, three patterns wide.

⚠ **Note the pattern T1 used to read the board worker's fetch surface** — it searched for **both**
`raw.githubusercontent` and `api.github.com`. **The MLB board worker it was copying uses one of
them; the NBA workers built in that era use the Contents API** (pass 71 — 10 of 21 still do).
**Which of the two the MLB template actually used, and whether the choice was read or assumed, is
NOT RECORDED** — the grep result is in the transcript but the reasoning is not.

---

## FROM T1 PASS 77 — THE FOURTEEN ASSISTANT MESSAGES, READ AS THE OWNER-FACING RECORD *(added 2026-09-20)*
*Angle: **only the text the owner actually saw** — T1's 14 assistant message turns (43,216 characters),
stripped of thinking, tool calls and tool results, with each factual claim tested against the live
system and the documents. **VERIFIED by live SQL and by searching the raw exports.***

### ⚠⚠ THE CREDENTIAL EXPOSURE IS WIDER THAN PASS 67 FOUND, AND MY REDACTION ADVICE WAS WRONG
**Pass 67 found 17 `INSERT INTO nba_config.external_credentials` statements across five transcripts
and advised stripping those statement values. That advice was too narrow.**

**VERIFIED by searching the raw exports for the stored value itself**: the `balldontlie_api_key`
value occurs **3 times in T1** and **18 times in T19** (`…documentation-pass`) — **21 occurrences,
and most are not in an `INSERT` statement.**

**The T1 occurrence that matters most is in the assistant's own handoff message**, in plain prose,
written for the owner to paste into a new chat. **The same paragraph asserts the key is "already
stored" in `nba_config.external_credentials`**, and the same session's memory write records the
owner's rule that the key belongs in the database *"not in chat memory."* **The value was written
into the chat body anyway.** **The stated rule and the actual handling diverge inside one session.**

⚠ **T19 is this documentation effort's own earlier session**, and it reproduces the value
**eighteen times** — which is how a credential spreads: **each session that documents the previous
one copies the value forward.**

**The corrected procedure, now recorded in the blocker at the top of this document**: **redact by
VALUE, not by statement shape.** Read each value from `nba_config.external_credentials`, search every
transcript for that exact string, replace it. **Rotation remains the stronger option**, and is now
more clearly warranted: **a value that has been copied forward through at least two sessions should
be assumed compromised regardless of what happens to the files.**

### The provenance of the claim pass 68 had to correct
T1's handoff message states, in the list of what was built:
> *"**`nba_control`: `worker_run_log`, `job_runs` — own run history.**"*

**That is where the claim entered the record** — written the day the tables were created, **before
anything had written a row to them**, and it propagated into `NBA_SYSTEM_ARCHITECTURE.md` §1 and
`NBA_WORKERS.md` §1, where pass 68 corrected it. **The sentence was never false about the schema;
it was a statement of intent that later reads as a statement of function.** Recorded because it is a
clean, traceable example of how the *"table exists, writer never born"* pattern (pass 68) also
becomes a documentation error: **the handoff describes the structure, and every later reader infers
the behaviour.**

### Claims in the handoff that hold up, checked
| Claim in T1's handoff | Status today |
|---|---|
| *"14 new schemas, zero overlap with MLB"* | ✅ consistent — the 14 are listed by name; **6 of them hold zero tables** (pass 47) |
| *"`nba_ref.teams` has exactly 30 active rows"* | ✅ **VERIFIED: 30** |
| *"`nba_ref.team_aliases` has 157 rows"* | ✅ **162 today** — both figures already documented; growth, not drift |
| *"`github_trigger_workflow` … deployed successfully, but this chat's tool list was fixed at conversation start"* | ✅ already recorded, and **`NBA_SYSTEM_ARCHITECTURE.md` already notes it became available in later sessions** — **it is in this session's tool list** |
| *"patched `generate_wrangler_configs.py` and `github_mobile_deploy_workers.py`… provably zero-impact on MLB"* | ✅ consistent with pass 73's count (18 MLB writes) and with the isolation checks |

⚠ **One small confirmation of pass 46**: `NBA_AVAILABLE_TOOLS.md` **still does not list
`github_trigger_workflow`**, though the tool has existed and been callable since shortly after T1.
**Consistent with that document's already-recorded staleness**; noted, not a new finding.

---

## FROM T1 PASS 76 — THE `nba_score` OUTPUT LAYER, MEASURED *(added 2026-09-20)*
*Angle: all 18 `nba_score` tables counted exactly and checked against what the documents claim.
**VERIFIED by live SQL (exact `count(*)`, not estimates) and by code grep.***

### ⚠⚠ **`nba_score.ladder_calibration_asof` IS EMPTY — and a document records it as populated**
**VERIFIED, exact count: 0 rows.**
**`NBA_COMPASS.md` fact 100 records the opposite, with figures**: *"2024-25 has **zero** inherited
cells (nothing to inherit), **2025-26 carries 2,762**; shift magnitudes stable across seasons
(0.139 vs 0.144)…"* — a verification that could only have been run against a populated table.
**Both sides recorded; the contradiction is real and is left unresolved here.**

**What the code does with an empty table** — **VERIFIED by reading all three readers:**
| File | Behaviour on empty |
|---|---|
| `build_final_hp.py` | loads under `if not ca.empty:`; **`shift_for()` returns `0.0` when no cell exists** — so **every leg gets a zero log-odds shift and the as-of calibration is silently a no-op.** It does print `as-of calibration cells: 0 keys, 0 dated rows`, so it is visible in a log; **nothing fails.** |
| `score_board_legs.py` | reads the same table |
| `certify_pipeline.py` | **has the correct gate**: `check("as-of calibration available", "SELECT count(*) FROM nba_score.ladder_calibration_asof", … int(v) > 0, "cells exist")` |

### ✅ The detector exists and is right — ⚠ but it is in the pipeline that has no cron
**The `certify_pipeline.py` gate would fail on today's state.** It sits in the **`p2` branch**, and
**P2 carries no `schedule:` block** (pass 75) — deliberately, until the season opens. **So the check
that catches exactly this cannot fire until someone adds the cron or dispatches P2 by hand.**

**And the writer deletes before it builds**: `build_asof_calibration.py` line 118 is an
**unconditional `DELETE FROM nba_score.ladder_calibration_asof`**, followed by the refit insert.
**It is invoked by only two workflows** — `nba-p2-overnight-heavy.yml` and `nba-absence-panel.yml`
— **both manual-only.**

**The timeline points at a specific run.** `nba_score.baseline_ladder_runs` shows the most recent
ladder load at **`loaded_at` 2026-09-20T03:23:26** (a **replay** of `asof 2025-11-29`), and
`ladder_calibration_asof` was last autoanalyzed at **2026-09-20T03:24:07 — 41 seconds later.**
**Something in that replay touched the table and left it empty.** **Whether the delete ran without a
successful insert, or the refit legitimately produced no cells for that as-of date, is NOT RECORDED
and this pass cannot distinguish them** — `nba_control` holds no run history to consult (pass 68).

### Stated at its real strength
**No claim is made that production scoring is currently wrong.** **The season has not started**;
`final_hp` holds 2024-25 plus the single date 2026-01-15, and the recent activity is replays.
**The finding is a pre-season state with a dated consequence**: **if the table is still empty when
P2 first runs for real on or after 2026-10-03, the engine will score with a zero as-of shift and
report success** — unless the certification gate runs, which requires the cron the same pass-75
item is already waiting on. **Two recorded items converge on one date.**

### ✅ A QUALIFICATION OF PASS 68 — NBA does have some run logging, just not centrally
Pass 68 found `nba_control.job_runs` and `nba_control.worker_run_log` **empty and referenced by no
code**, and concluded **"NBA has no run history at all."** **That conclusion is too broad and is
qualified here.** **VERIFIED**: `nba_score.baseline_ladder_runs` holds **3 real rows** — as-of dates
**2025-11-29, 2026-01-15, 2026-03-15**, loaded **2026-09-20, 2026-09-19, 2026-09-11** — each
carrying `slate_games`, `players`, `rows`, the prop list, `factor_fits`, `role_minutes_multiplier`
and `source_file`. **That is rich per-run provenance.**
**The accurate statement**: **NBA has per-component run logs in `nba_score.*_runs` tables and no
central control-plane run history.** Pass 68's evidence about `nba_control` stands unchanged; **its
summary sentence does not.** Corrected in `NBA_MASTER_SUMMARY.md` §T1.98 and in the pass-68 section
above.

### ⚠ An observation left as an open question: the three ladder runs do not cover the same props
**VERIFIED**: `asof 2025-11-29` and `asof 2026-01-15` each record **22 props**; **`asof 2026-03-15`
records 18** — missing **`dreb`, `fgm`, `fta`, `oreb`**. **Whether that reflects a genuinely
different slate or a coverage loss is NOT RECORDED**, and this pass does not claim either.

### A method note worth keeping: `n_live_tup` is an estimate, and it drifted 0.55%
`pg_stat_user_tables.n_live_tup` reported **19,320,938** rows for `final_hp`; the exact
`count(*)` is **19,215,200** — **105,738 rows apart.** **Pass 33's measurement is re-confirmed
unchanged**; a reader using the planner statistic would have reported drift that does not exist.
**Use exact counts for any verified claim.**

---

## FROM T1 PASS 75 — THE SCHEDULE SURFACE, AND A CORRECTION TO PASS 70'S OWN METHOD *(added 2026-09-20)*
*Angle: **which NBA workflows actually carry a `cron`**, checked against what the documents say, and
the pass-70 coverage count **re-run scoped to the twelve rather than to every `.md` in `nba/`.**
**VERIFIED on the live clone.***

### ⚠ CORRECTED 2026-09-20 (pass 83): **THREE**, not two — `nba-scrape.yml` also carries a cron
*The scan below used `grep -A2 "schedule:"`; in `nba-scrape.yml` three comment lines sit between `schedule:` and `- cron: '0 9 * * 1'`, so the cron fell outside the window. **A third instance of the pass-53 rule.** The corrected table is in FROM T1 PASS 83. **The rest of this section stands:** P2 and P3 genuinely have no cron.*

### Only TWO of the 32 NBA workflows carry a `schedule:` block *(— see the correction above)*
| Workflow | cron | Comment's own reading |
|---|---|---|
| `nba-p1-weekly-static.yml` | `'0 19 * * 1'` | *"Mondays 19:00 UTC = 12:00 PT (11:00 PT during PDT)"* |
| **`nba-referees.yml`** | `'30 15 * * *'` | *"08:30 UTC-7 = ~08:30 PT, after the morning posting"* |

**Everything else — including P2 and P3 — is `workflow_dispatch` or trigger-file only.**

**That absence is deliberate and is already documented** (`NBA_SYSTEM_DESIGN.md`, and the `09:00 UTC`
target appears in four documents). The workflows say so themselves, and the reasoning is worth having
in one place:
> **P2**: *"**NO CRON YET — deliberately.** The NBA season opens in October; until real games exist
> there is nothing for this to mine, and **a scheduled job failing nightly against an empty schedule
> trains everyone to ignore red builds**. The cron goes in when the season starts (target: daily
> **09:00 UTC = 01:00 PT**, after the last West-Coast game finalises, eight hours before P3's cutoff)."*
> **P3**: *"NO CRON YET … Cron goes in at season start: **`'15 21 * * *'` = 21:15 UTC = 1:15 PM PST
> (and 2:15 PM PDT, which still clears the earliest 4 PM PT tip by 105 minutes)."*

✅ **So this is not a gap — it is a dated action item**, and **the season opens 2026-10-03**. Both
target cron strings are already written down in the workflow headers; **adding them is the owner's
step, not a design question.**

### ⚠ `nba-referees.yml`'s cron comment assumes UTC-7 all year
`'30 15 * * *'` is **15:30 UTC**. The comment reads it as *"08:30 UTC-7 = ~08:30 PT"* — correct
**during PDT**. **During PST (UTC-8) it fires at 07:30 PT.** **The NBA season is mostly PST**
(2026-11-01 to 2026-03-07), so **for most of the season this job runs an hour earlier than its own
comment says.**
**Stated at its real strength**: **no claim is made that 07:30 PT is too early.** The comment says
the intent is *"after the morning posting"*, and **when referee assignments post is NOT RECORDED
anywhere this pass could check.** **The finding is that the comment's arithmetic is wrong for most of
the season**, which matters because the comment is the only statement of intent.
⚠ It is also **the exact mistake the documents already warn about** — *"never hardcode a fixed UTC
offset; resolve by named timezone"* (`NBA_OPEN_ITEMS.md`, the DST scheduling gotcha). **P1's comment
handles DST correctly, P3's handles it correctly, and this one does not.**

### ⚠⚠ A CORRECTION TO PASS 70'S METHOD — and a trap any future drift check will hit
**Pass 70 reported "7 of 32 workflows named in no document."** That count was taken against
**every `.md` file in `nba/`**, not against **the twelve mandated documents**. Re-run correctly:

| Scope | Named | Not named |
|---|---|---|
| Every `.md` in `nba/` *(pass 70's scope)* | 25 | **7** |
| **The twelve mandated documents** *(the scope that matters)* | **23** | **9** |

**The nine missing from the twelve are a DIFFERENT set**: `nba-backfill`, `nba-backtest`,
`nba-board-archive`, `nba-grader`, `nba-injury-report`, `nba-market-spreads`, `nba-measure-types`,
`nba-pergame-backfill`, **`nba-referees`**. **Every one of them is named in `NBA_COMPASS.md`,
`NBA_PROJECT_LOG.md` or a checkpoint document — all outside the mandated set.**
⚠ **`nba-referees.yml` is on that list, and it is one of only two scheduled NBA workflows.**

**And the trap, which is the more important half:** **pass 70's seven now appear in the twelve —
because pass 70 wrote their names into `NBA_OPEN_ITEMS.md`.** Re-running that check today returns a
clean result **for the wrong reason: the record now contains the names the check looks for.**
**Any future coverage check must exclude this document's own inventory sections**, or measure against
text that predates the finding. **Recorded as a standing method rule.** It is a documentation-layer
instance of the same shape as the pass-53 rule: **an instrument that matches its own output measures
nothing.**

---

## FROM T1 PASS 74 — THE DELIVERABLE AUDITED AGAINST ITSELF: POINTER AND NUMBERING INTEGRITY *(added 2026-09-20)*
*Angle: **the twelve documents as the universe.** Since pass 37 these documents are written as
pointers — an assertion plus a path to the source — so **a pointer that does not resolve is a
defect in the deliverable itself.** Every `NBA_*.md` reference and every `§` section pointer in all
twelve was extracted and resolved against the actual headings. **VERIFIED mechanically.***

### ✅ THE FILE-LEVEL POINTERS ARE CLEAN: 27 of 27 resolve
**Every `NBA_*.md` filename cited anywhere in the twelve exists in `nba/`. Zero broken file
references.** Recorded as a clean result, and as the baseline for a future check.

⚠ **But the twelve are not self-contained.** They cite **27 distinct documents, of which 15 are
outside the mandated set** — and the dependency is heavy, not incidental:

| Most-cited external target | Cited from |
|---|---|
| `NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` | **all 12** |
| `NBA_ARCHITECTURE_BLUEPRINT.md` | **9 of 12** |
| `NBA_LESSONS_LEARNED_FROM_MLB.md` | 7 of 12 |
| `NBA_SYSTEM_DRAFT.md` | 6 of 12 |
| `NBA_AVAILABLE_TOOLS.md`, `NBA_ENRICHMENT_FACTOR_LOCK.md`, `NBA_PROJECT_LOG.md` | 4 each |
| 8 more | 1–3 each |

**Four of the fifteen are the handoff documents**, which the owner's format instruction explicitly
blesses as citation targets. **The other eleven are NBA-generated documents** — `NBA_COMPASS.md`,
`NBA_ENRICHMENT_ENGINE_DESIGN.md`, `NBA_BASELINE_METHODOLOGY.md`, `NBA_AVAILABLE_TOOLS.md`,
`NBA_PROJECT_LOG.md` and others. **All exist and all are in the repo, so nothing is broken** — but
**anyone treating the twelve as the complete record is reading a set that depends on fifteen others.**

### The section-level pointers: **204 checked, 201 resolve, 3 do not**
**A 1.5% failure rate**, and all three are now corrected in place:

| Pointer | Problem | Corrected to |
|---|---|---|
| `NBA_RECIPE.md` §1.2 | **no such section** — RECIPE uses `STEP n`, not `§n` | `NBA_RECIPE.md` **STEP 0, rule 2** |
| `NBA_WORKERS.md` §8 | **no such section** — WORKERS' top level ends at §7 | `NBA_WORKERS.md` **§0e** (the scope-parameter audit) |
| `NBA_FINAL_SCORING_CALIBRATION.md` §15 | **§15 has no parent heading** — only `§15.0c` exists | **§15.0c** |

⚠ **The first one was written by this documentation effort itself, at pass 65.** Recorded against
myself: **a pointer format was assumed (`§n`) for a document that does not use it (`STEP n`).**
**The standing consequence: when citing `NBA_RECIPE.md`, cite `STEP n`.**

### ⚠ THE NUMBERING AUDIT — four of the twelve have broken top-level sequences
**VERIFIED by extracting every `## n.` heading and checking at all heading levels before calling
anything missing** (per the pass-53 rule):

| Document | Defect |
|---|---|
| `NBA_SYSTEM_ARCHITECTURE.md` | **§5 is absent** — §1–§4 and §6–§9 exist; the only `5.` headings are two unrelated `###` subsections |
| `NBA_DATABASE.md` | **§7 and §8 are absent** — no heading at any level begins with 7 or 8; the sequence runs …§6, §9…§11 |
| `NBA_FINAL_SCORING_CALIBRATION.md` | **§14 appears TWICE** — *"THE STATISTICAL STANDARD, CONSOLIDATED"* and *"THE RESEARCH STANDARD — all 27 lessons"*; **§12 and §15 are absent** as parents (max is §20) |
| `NBA_GOBLIN_DEMON.md` | **§4 appears TWICE** (*"WHY v1 IS NOW WRONG"* / *"THE LADDER CONFIG"*) and **§6 appears TWICE** (*"INGESTION"* / *"THE RESEARCH STANDARD APPLIED TO THIS LAYER"*) |

**Why this is a real defect and not cosmetics**: **a duplicated § number makes a pointer ambiguous**
— *"see `NBA_GOBLIN_DEMON.md` §4"* names two different sections — **and a missing number makes a
reader think a section was lost.** Both directly undermine the pointer format the documents now use.
**Four such pointers already exist in the twelve** (`GOBLIN_DEMON.md §4` and `§6`, cited by other
documents), and each currently resolves to two candidates.

**Not renumbered.** Renumbering would break every existing pointer to the affected documents and is
exactly the kind of change the standing instruction excludes. **Recorded for the owner to decide**:
renumber once, deliberately, with every inbound pointer updated in the same change — or leave the
sequences alone and disambiguate the four duplicate citations by section title instead of number.

---

## FROM T1 PASS 73 — T1'S WRITE SET, COUNTED *(added 2026-09-20)*
*Angle: pass 45 checked that T1's artefacts exist and pass 66 counted its tool calls by wall time.
**This pass reads every `github_patch_file` / `github_put_file` / `github_str_replace` call in T1 as
a changeset** — which paths, how many times, and which calls failed. **MEASURED from the export.***

### The write set: 61 calls across 11 paths
| Path | Writes |
|---|---|
| `nba/NBA_PROJECT_LOG.md` | **12** |
| `nba/alphadog-v2-nba-static-teams.js` | 8 |
| **`alphadog-v2-admin-sql.js`** *(MLB)* | **8** |
| `nba/scrape_nba_stats_teams.py` | 8 |
| **`generate_wrangler_configs.py`** *(MLB)* | **7** |
| `nba/TRIGGER_NBA_SCRAPE.txt` | 5 |
| `.github/workflows/nba-scrape.yml` | 4 |
| `nba/NBA_SYSTEM_DRAFT.md` | 3 |
| **`github_mobile_deploy_workers.py`** *(MLB)* | **3** |
| `nba/NBA_ARCHITECTURE_BLUEPRINT.md` | 1 |
| `nba/worker_manifest_nba.json` | 1 |
| *(one call issued with no `path` — see below)* | 1 |

### ⚠ THE ISOLATION BOUNDARY, MEASURED: **18 of 61 writes — 30% — went to MLB root files**
**Three MLB-owned files were edited**: `alphadog-v2-admin-sql.js` (**8**),
`generate_wrangler_configs.py` (**7**), `github_mobile_deploy_workers.py` (**3**).
**All three are already named in the documents**, and pass 65 recorded **why** the rule was relaxed
(the additive judgement call, from T1's thinking blocks). **What was never recorded is the scale:
nearly a third of T1's repo activity was inside MLB's files**, under a rule stated as
*"No MLB edits, ever."*

**Stated at its real strength**: **the edits were additive and the isolation held** —
`config.worker_definitions` still shows **116 rows, 0 NBA** (`NBA_SYSTEM_ARCHITECTURE.md` §1), and
every later verification agrees. **This is not a finding that the rule was broken in effect.** It is
a finding that **the gap between the rule as written and the work as done was large and unquantified**,
which matters for anyone reading *"everything is additive"* as *"nothing outside `nba/` was touched."*
**Those are different claims, and only the first is true.**

### ⚠ `nba/TRIGGER_NBA_SCRAPE.txt` was written FIVE times — each write is a workflow firing
The trigger file is a marker whose only purpose is to be committed so the push event fires
`nba-scrape.yml` (pass 65 records the full causal chain). **Five writes = five manual scrape runs in
one session**, which is the human-visible cost of having no dispatch tool, alongside the 25 polling
sleeps (pass 66).

### The failure taxonomy: **6 of 61 writes failed — a ~10% failure rate**
| Failures | Error |
|---|---|
| **2** | `old_str matches 2 times, must be unique` |
| **2** | `old_str not found in file. No changes made` |
| **1** | **HTTP 409 conflict** |
| **1** | `MCP error -32602: Input validation error … expected string, received undefined at path` |

**The last one is worth naming precisely**: a `github_patch_file` call was issued **with `old_str` and
`new_str` but no `path`** — its content targets `alphadog-v2-admin-sql.js`
(`toolGithubTriggerWorkflow_PLACEHOLDER`). **It was rejected by input validation and changed
nothing**, so the MLB write count stands at 18, not 19. Recorded because a reader counting edits from
the tool calls alone would get 19.

### ⚠ Why this taxonomy is worth keeping: the same four failures recur across sessions
**This documentation effort hit all four of them again**, weeks later, on different files: an
anchor matching zero times, an anchor matching more than once, a **409 conflict on
`NBA_OPEN_ITEMS.md`** that succeeded on an identical retry, and a malformed call.
**Four failure modes, two sessions, no overlap in the files involved — they are systemic to the
patch-by-anchor workflow, not incidental to either session.** The practical consequences, both
learned twice:
1. **Re-read the file immediately before patching** — an anchor that matched an hour ago may now
   match zero or two times.
2. **A 409 is not a rejection of the content** — it is a concurrent-write conflict, and the identical
   call usually succeeds on retry.

---

## FROM T1 PASS 72 — THE PYTHON LAYER, DIFFED AGAINST WHAT INVOKES IT *(added 2026-09-20)*
*Angle: pass 69 diffed the worker universe and pass 70 the operator surface. **This one diffs the
116 Python files in `nba/` against the 32 workflows that could run them and against every other
script that could import them.** **VERIFIED by grep of the live clone.***

### The counts
| | |
|---|---|
| Python files in `nba/` | **116** |
| Invoked by at least one workflow | **101** |
| Not invoked by any workflow | **15** |
| — of those, shared libraries (correctly not invoked directly) | **2** |
| — of those, referenced by nothing at all | **13** |

**The two libraries are fine and should not be read as orphans**: `nba_names.py` is imported by
**27** scripts and `nba_season.py` by **19**; both are named in **7 documents each.**

### ⚠ The thirteen unreferenced scripts — never invoked, never imported, and 11 named in no document
| Script | Lines | Documents naming it |
|---|---|---|
| `build_absence_panel.py` | 259 | **0** |
| `build_absence_panel_v2.py` | 232 | **0** |
| `build_absence_panel_v3.py` | 212 | **0** |
| `patch_missing_officials.py` | — | **0** |
| `probe_board_archives.py` | — | 1 |
| `probe_dfs_apis.py` | — | 1 |
| `probe_board_archives2.py`, `probe_pp_client_bundles.py`, `probe_pp_entry_surface.py`, `probe_pp_multipliers.py`, `probe_underdog2.py`, `probe_underdog3.py`, `probe_underdog4.py` | — | **0** |

**The ten `probe_*.py` are one-off investigation scripts** — PrizePicks bundles and entry surface,
Underdog, DFS APIs, board archives. **Being throwaway is expected; being committed and unlabelled is
the gap**, because nothing distinguishes them from live code to anyone reading the directory.
**Recorded, not removed** — the standing instruction forbids changes.

### ⚠⚠ THE THREE `build_absence_panel*.py` ARE SUPERSEDED DEAD CODE — and their successor carries the root cause the twelve documents state only as an outcome
**VERIFIED**: `.github/workflows/nba-absence-panel.yml` runs **`build_redistribution_panel.py`**, not
any of the three. That file's own docstring names itself **"REDISTRIBUTION PANEL v4"**, so the
lineage is **v1 → v2 → v3 → v4**, with the last one renamed. **Commit dates**: v1 and v2
2026-09-11, v3 and v4 2026-09-12 — **four generations in two days.**

`NBA_FINAL_SCORING_CALIBRATION.md` records the **outcome** accurately: *"A2 — teammate
redistribution: **five panels failed, then RETRACTED** — the certified anchor wins every slice, and
worst where the mechanism predicted it should win."* **What it does not record is WHY**, and the v4
docstring states it plainly:

> *"Every earlier version tried to attribute vacated minutes to a **SPECIFIC absent player**, and
> every version then had to isolate a 'clean' sub-case to make that attribution meaningful:
> **v1** minutes floor on receivers → **dropped the absorbers**;
> **v2** `pair_games >= 5` → **dropped the absorbers**;
> **v2b** `leaguedashlineups` → **API capped at 2,000 rows**, dropped the absorbers;
> **v3** `single_absence` only → **kept 218 of ~1,150 team-games**, biased remainder.
> **The isolation WAS the bug, five times.** Most NBA games have several players out; their vacated
> minutes pool together and **cannot be attributed to one absence from box scores**."*

**Conservation-gate values across the failures: `0.10 / -0.05 / -0.37 / 0.25-0.49`.**

**v4's structural answer** — also recorded nowhere in the twelve:
> *"one row per (team-game, remaining player), **absences as FEATURES**; pool =
> `team_vacated_min` / `team_vacated_poss` summed over **ALL** players ruled out pre-game.
> **Conservation holds BY CONSTRUCTION at fit time**: the allocation is fitted as **shares of the
> team pool (sum of predicted shares = 1)**, rather than as independent per-player multipliers.
> Uses **EVERY game with at least one pre-game absence — thousands of team-games, not 218.**"*

**Why this is worth carrying even though A2 was retracted**: *"the isolation WAS the bug"* is a
**method lesson, not an A2 lesson.** Its shape — *filtering to the clean sub-case removes exactly
the rows carrying the effect* — applies to any factor fitted on a filtered panel, and **the twelve
documents currently record only that A2 failed, not the trap that made it fail five times.**
**Recorded here and summarised in `NBA_FINAL_SCORING_CALIBRATION.md`.**

### Stated at the right strength: this is not waste in production
`nba-absence-panel.yml` is **`workflow_dispatch` only — not scheduled** (VERIFIED), so **nothing is
burning runner time building a panel for a retracted factor.** It is a manual research tool whose
subject was subsequently closed, and it is named in four documents. **The gap is the lineage and the
reason, not the workflow.**
⚠ One term still appears in **none of the twelve**: **`A2b`, the "dependent branch"**, named in the
workflow header and in `NBA_ENRICHMENT_ENGINE_DESIGN.md`/`NBA_ENRICHMENT_FACTOR_LOCK.md` — both
**outside the mandated set.** What A2b is, and whether it was retracted with A2, is **NOT RECORDED**
in the twelve.

---

## FROM T1 PASS 71 — THE FETCH SURFACE, WORKER BY WORKER *(added 2026-09-20)*
*Angle: the 1 MB Contents-API bug is thoroughly documented. **This pass asks whether the fix was
actually applied to every worker**, by reading the fetch call in all 21 worker files and measuring
the file each one names. **VERIFIED by grep of all 21 workers and by `stat` on the live clone.***

### ⚠⚠ THE FIX WAS NEVER RETROFITTED — **10 of the 21 workers still use the Contents API**
`NBA_SYSTEM_ARCHITECTURE.md` stated: *"**Every writer Worker** fetches committed JSON from
`raw.githubusercontent.com` — chosen deliberately, because the GitHub Contents API silently returns
EMPTY above 1 MB."* **That is not what the code does.**

| Fetch surface | Workers | Which |
|---|---|---|
| **`api.github.com/…/contents/`** | **10** | `static-teams`, `static-players`, `static-arenas`, `static-officials`, `static-player-bio`, `static-player-tracking`, `static-team-stats`, `static-onoff`, `static-darko`, `weekly-differential` |
| **`raw.githubusercontent.com`** | **11** | `baseline-ladder`, `daily-delta`, `static-backfill`, `static-game-officials`, `static-lineups`, `static-measure-types`, `static-playtypes`, `static-schedule`, `static-shotquality`, `static-starter-status`, `static-tracking-detail` |

**The split is chronological, and that is the explanation.** All ten Contents-API workers were
registered **2026-08-31 → 2026-09-02** — before the 1 MB bug was found. **The bug was discovered in
T3, on the schedule file** (`NBA_RECIPE.md` step 8: *"the **1 MB Contents API silent-empty bug**
→ `raw.githubusercontent.com`"*). **Every worker built after that uses raw. Not one built before it
was changed.**

**So `NBA_WORKERS.md` §4b is accurate** — it scopes its claim to *"workers built T3–T9"*, and every
one of those does use raw. **`NBA_SYSTEM_ARCHITECTURE.md`'s "every writer Worker" was the overreach**,
and is corrected in place.

### How much headroom the ten actually have — measured, and the honest answer is "comfortable"
**VERIFIED by `stat` on every file the ten name:**

| File | Size | % of the 1 MB limit |
|---|---|---|
| `nba_player_bio_current.json` | **0.27 MB** | **27%** |
| `nba_players_current.json` | 0.20 MB | 20% |
| `nba_onoff_current.json` | 0.18 MB | 18% |
| `nba_darko_current.json` | 0.12 MB | 12% |
| `nba_player_tracking_current.json` | 0.11 MB | 11% |
| `nba_arenas_current.json`, `nba_officials_current.json`, `nba_teams_current.json`, `nba_team_stats_current.json` | 0.01 MB each | 1% |
| all nine `*_meta.json` | <0.01 MB | — |

**Stated at its real strength: this is latent, not imminent.** The largest file is at **27% of the
limit** and these are roster-scale files that grow slowly — `nba_onoff_current.json` was **208,560
characters when T2 fetched it** and is **0.18 MB today**, i.e. roughly flat over three weeks.
**No claim is made that any of the ten is close to breaking.**

**What is worth recording is the failure mode, not the margin.** The Contents API **does not error
above 1 MB — it returns success with the content omitted.** A worker crossing that line would
**report a clean run and write nothing**, and — per pass 68 — **`nba_control` records nothing at
all**, so the only trace would be a table that stopped changing. **Two silent failures composing is
the reason this is written down** even though the margin is wide.

**The three files to watch**, because they scale with roster size and the season opens 2026-10-03:
`nba_player_bio_current.json`, `nba_players_current.json`, `nba_player_tracking_current.json`.

### The other end of the same scale: `nba/data/` is 1.2 GB across 223 files
**VERIFIED**: **223 files** (221 `.json`, 2 `.txt`), **1.2 GB**; the working tree is **1.3 GB** and
`.git` is **269 MB**. **Six files exceed GitHub's 50 MB warning threshold**, the largest being
**`nba_injury_report_2025_26_2026-03.json` at 78.7 MB — 79% of GitHub's 100 MB hard limit.**

| File | Size |
|---|---|
| `nba_injury_report_2025_26_2026-03.json` | **78.7 MB** |
| `nba_injury_report_2025_26_2026-01.json` | 76.0 MB |
| `nba_delta_player_game_log_advanced.json` | 57.6 MB |
| `nba_matchups_2025_26.json` | 57.0 MB |
| `nba_matchups_2024_25.json` | 54.6 MB |
| `nba_matchups_2023_24.json` | 53.1 MB |

**The 100 MB limit is already a recorded design input** — `NBA_LESSONS_LEARNED_FROM_MLB.md` §4:
*"Two backfills (injury season file, per-game matchups) **silently failed at the commit step after
the scrapes succeeded**. Shard by month with an index from the start."* **The sharding worked** —
these are per-month, per-season files, which is why none exceeds 100 MB.
⚠ **What is NOT RECORDED is that the largest shard is already at 79% of the limit**, and that
**injury-report shards are per-month within a live season**, so the 2026-27 equivalents grow from
October. **No size guard on the commit step was found in this pass** — whether one exists is
**NOT RECORDED**; the lesson prescribes one (*"size-guard every commit"*) and this pass did not
verify that the prescription was implemented.

**Both files read by the two largest raw-fetching workers are fine on that surface**:
`raw.githubusercontent.com` has no 1 MB limit, and `daily-delta` reads the 57.6 MB and 45 MB delta
logs through it — **the correct choice, made for the correct reason.**

---

## FROM T1 PASS 70 — THE OPERATOR SURFACE: EVERY WORKFLOW AND EVERY TRIGGER FILE, INVENTORIED *(added 2026-09-20)*
*Angle: **whole-universe diff applied to the things a human fires by hand** — all 32 `nba-*.yml`
workflows and all 14 `nba/TRIGGER_NBA_*.txt` files, each checked against all twelve documents.
**VERIFIED by listing the live clone and grepping every document for each name, by stem as well as by
filename** (per the pass-53 method rule).*

### ⚠⚠ **7 of 32 NBA workflows are named in NO document. 7 of 14 trigger files are named in NO document.**
**This is the operator's surface, and half of it is undocumented.** It matters now because **the
season opens 2026-10-03**: a tool nobody knows exists is a tool nobody uses when something breaks.

**The seven undocumented workflows** — **all seven are `workflow_dispatch` / trigger-file only. None
is scheduled**, which is why they escaped the pipeline documentation: they are **operator tools, not
pipeline steps.**

| Workflow | `name:` | What it does |
|---|---|---|
| `nba-board-backfill.yml` | NBA Board Backfill (Odds API history) | Odds-API history pull; inputs `start` (default **2024-10-22**), `end` (**2026-04-12**), `max_events`, `regions` (**`us_dfs,us`**) |
| `nba-board-maintenance.yml` | NBA Maintenance - Shrink Board Index | **six task modes** — see below |
| `nba-diagnostic.yml` | **NBA Starter Status Diagnostic** | ⚠ **the filename does not match the job**; fires on `nba/TRIGGER_NBA_DIAGNOSTIC.txt` |
| `nba-game-lines.yml` | NBA Game Line Snapshots (morning + window) | game-line snapshots, **180-minute timeout**, date-range inputs |
| `nba-game-officials.yml` | NBA Game Officials Backfill | fires on `nba/TRIGGER_NBA_GAME_OFFICIALS.txt` |
| `nba-pairs.yml` | NBA Teammate Pairs (shared-court, as-of weekly) | shared-court pair snapshots; ⚠ **has a destructive input** — see below |
| `nba-starter-status.yml` | NBA Starter Status Backfill | fires on `nba/TRIGGER_NBA_STARTER_STATUS.txt` |

**The seven undocumented trigger files**: `TRIGGER_NBA_DIAGNOSTIC`, `TRIGGER_NBA_GAME_OFFICIALS`,
`TRIGGER_NBA_INJURY_REPORT`, `TRIGGER_NBA_MEASURE_TYPES`, `TRIGGER_NBA_PERGAME_BACKFILL`,
`TRIGGER_NBA_SEASON_TABLES`, `TRIGGER_NBA_STARTER_STATUS`.
**Why this is worse than an ordinary documentation gap**: **the trigger file is the only mechanism
the assistant has for firing a workflow** — `github_trigger_workflow` was absent from the session's
tool list, which is the whole reason the trigger-file architecture exists (pass 65). **An
undocumented trigger file is a capability that cannot be used, because nobody knows its name.**

### ⚠ `nba-board-maintenance.yml` carries SIX undocumented task modes behind one input
`task: "shrink | derived | map | curves | rungs | coverage"` (default `derived`), with further inputs
`date` (default `2026-03-15`), `season` (`2025-26`) and `props` (blank = *"every prop in
`baseline_history`"*).
**Three of the six names point straight at machinery this documentation covers in detail elsewhere**
— **`coverage`** (the coverage-gap diagnostic), **`curves`** and **`rungs`** (ladder/calibration
structures) — **and none of the six is described anywhere.** What each mode actually does is
**NOT RECORDED**; this pass records only that they exist and what they are called.

### ⚠⚠ A DESTRUCTIVE PATH THE COMPLETE-AUDIT SECTION DOES NOT COVER
`NBA_WORKERS.md` §6b is *"EVERY DESTRUCTIVE STATEMENT IN THE CODEBASE — the complete audit."*
**It audits SQL. This one is a shell command in a workflow, and it deletes committed files:**
```yaml
if [ "${PAIRS_REBUILD}" = "1" ]; then
  for s in $(echo "$PAIRS_SEASONS" | tr ',' ' '); do
    slug=$(echo "$s" | tr '-' '_')
    rm -f nba/data/nba_pairs_${slug}_*.json
```
Input description: *"1 = **delete existing snapshots for these seasons first** (use after a capped
run)"*; **default `0`**, and the workflow is manual-only, so **it cannot fire by accident.** The
inline comment records why it exists: *"the first run used a league-wide call that caps at 2,000
rows; those files must be removed before rebuilding, since the scraper skips snapshots that already
exist."*
**Recorded, not fixed.** ⚠ **The wider point is about the audit's scope**: *"every destructive
statement in the codebase"* means **every destructive SQL statement**. **Shell `rm` inside the 32
workflow files was never in scope**, and this pass checked only one workflow closely. **Whether other
workflows carry destructive shell steps is NOT RECORDED** — flagged as an open question, not
answered.

### The counts, for a future drift check
| Universe | Total | Named in ≥1 document | Named in none |
|---|---|---|---|
| `.github/workflows/nba-*.yml` | **32** | 25 | **7** |
| `nba/TRIGGER_NBA_*.txt` | **14** | 7 | **7** |

---

## FROM T1 PASS 69 — THE WORKER UNIVERSE, DIFFED THREE WAYS *(added 2026-09-20)*
*Angle: **whole-universe diff** (blueprint §9 technique 1) applied to the worker fleet — the live
registry, the deploy manifest and the files on disk, compared as sets rather than read in sequence.
**VERIFIED by live SQL and by listing the live clone.***

### ✅ THE ONE NBA UNIVERSE THAT HAS NOT DRIFTED — all three agree exactly, 21/21/21
| Universe | Count |
|---|---|
| `nba_config.worker_definitions` (live registry) | **21**, every row `enabled = 1` |
| `nba/worker_manifest_nba.json` (what the deploy generator reads) | **21** |
| `nba/alphadog-v2-nba-*.js` (files on disk) | **21** |

**Set difference in every direction is empty**, and the manifest contains **no duplicates**.
**There is no registered worker without a file, no file without a registration, and nothing the
deploy pipeline would skip or fail on.**

**This is recorded deliberately as a clean result.** Nearly every whole-universe diff in this
documentation has found drift — 17 tables missing from `NBA_DATABASE.md` (pass 47), 7 of 10
`stat_decay_config` rows disagreeing with the live recipe (pass 33), 14 planned props against 28 live
(pass 62). **This one does not, and that is evidence too.** It is also the baseline a future check
can diff against: **21/21/21 is the number that should still hold.**

### ⚠ AN ASYMMETRY: 121 MLB wrangler configs are committed; **0 NBA ones are**
**VERIFIED on the live clone**: **121 `wrangler.*.jsonc` files at the repo root** (MLB), and
**none in `nba/`** — while `generate_wrangler_configs.py` writes NBA's to
`nba/wrangler.<worker>.jsonc` (line 784) and `.gitignore` excludes only `.wrangler/`, so nothing
prevents committing them.

**The consequence is narrow but real: an NBA worker's effective bindings cannot be read from the
repository.** For any of the 121 MLB workers you can open the committed config and see its
Hyperdrive binding, vars, service bindings and limits. **For an NBA worker you must run the generator
to find out.** Whether this is deliberate is **NOT RECORDED**. **Not a bug**; an inspectability gap,
and it interacts badly with the next item.

### ⚠⚠ THE HAND-EDIT RULE HAS A SHARPER CONSEQUENCE THAN THE DOCUMENTS STATE
*"Never hand-edit a wrangler config expecting it to survive"* is already recorded in four places
(blueprint §, `NBA_SYSTEM_ARCHITECTURE.md` §4, `NBA_WORKERS.md`). **What is NOT recorded is the
root-caused incident behind it, which the generator carries in its own source:**
> *"Root-caused live: earlier manual edits to the `wrangler.*.jsonc` files directly were **silently
> erased by this exact script on the very next deploy, which is why production kept serving the old
> D1 code despite the repo's `.js` files already being correctly rewritten**."*

**The failure mode is not "your edit vanishes."** It is: **production silently serves stale code
while the repository looks correct** — a divergence that survives code review, because the reviewed
artefact and the deployed artefact are different things. **That is the version worth carrying into
NBA**, and it is materially sharper than the rule as previously written.
⚠ **It also lands harder on NBA than on MLB**, precisely because of the asymmetry above: with **no
NBA config committed, there is no file in the repo to compare against**, so the same divergence would
leave even less trace.

### Context, not an action item: a second generator special case worth knowing
`alphadog-v2-certification-center` is given `cfg["limits"] = {"cpu_ms": 300000}` with the reasoning
recorded inline — a worker that builds a very large HTML response by string concatenation can exceed
the CPU budget and be **"silently killed mid-response with no error surfaced to the client"**,
producing a page that appears to load and never finishes. **MLB-only today.** Recorded because
**"silently killed mid-response, no error surfaced" is a Worker failure mode NBA has no guard
against**, and nothing in the NBA documents names it.

---

## FROM T1 PASS 68 — THE LIVENESS OF EVERYTHING T1 CREATED *(added 2026-09-20)*
*Angle: pass 45 verified that T1's artefacts **exist**. This pass asks whether they **run** — the
worker registry's enabled flags, the run-history tables, and the code that should write them.
**VERIFIED by live SQL and by repo-wide grep.***

### ⚠⚠ NBA HAS NO CENTRAL RUN HISTORY — and two documents said it did
*⚠ **Heading corrected 2026-09-20 (T1 pass 76)**: this read *"NO RUN HISTORY AT ALL"*, which is too broad. **`nba_score.baseline_ladder_runs` holds 3 real rows with rich per-run provenance** (VERIFIED). **Accurate: per-component run logs exist in `nba_score.*_runs`; the central control plane is empty.** Everything below about `nba_control` stands unchanged. See `NBA_OPEN_ITEMS.md` → FROM T1 PASS 76.*
**VERIFIED three ways, and the three agree:**

| Check | Result |
|---|---|
| `nba_control.job_runs` | **0 rows** |
| `nba_control.worker_run_log` | **0 rows** |
| Files under `nba/` referencing either table | **0** |
| Non-markdown files anywhere in the repo containing `nba_control` | **0** |
| Files that DO use `worker_run_log` / `job_runs` | **all MLB, all at the repo root** — `alphadog-v2-orchestrator.js`, `alphadog-v2-control-room.js`, `alphadog-v2-score-audit.js`, `verify_schema_all.py`, `schema_control_db.sql`, … |
| NBA workers registered in `nba_config.worker_definitions` | **21, every one `enabled = 1`** |
| Their output tables | **populated** — e.g. `nba_ref.teams` 30 rows, `nba_ref.arenas` 30 rows |

**So the workers run and write their data, and nothing records that they ran.**
**NBA inherited MLB's two run-bookkeeping tables and never inherited the code that fills them.**

**Two documented claims are corrected by this**:
1. `NBA_WORKERS.md` §1 read *"Pattern: read the GitHub-committed JSON → upsert into Postgres →
   **log to `nba_control`**."* **The last clause is false.** Corrected in place.
2. `NBA_SYSTEM_ARCHITECTURE.md` §1 read *"NBA's own control plane exists — VERIFIED present."*
   **True of the tables, misleading about the plane.** Qualified in place: **present, not
   functioning**; only `nba_config.worker_definitions` carries real content.

### Why this matters now rather than later
**The season opens 2026-10-03** and three scheduled pipelines are meant to run unattended
(P1 Mondays 12:00 PT, P2 01:00 PT, P3 1:15 PM PT). **With both run tables empty and unwired, a
pipeline that silently stops produces no row anywhere that says so** — the only evidence would be
stale data in the output tables, noticed by whoever happens to look.
⚠ **This is the operational half of the gap blueprint §5 names**: *the system could not
distinguish "genuinely zero" from "something is broken."* **NBA's version is narrower and worse —
it cannot distinguish "ran" from "never ran."**

**Stated at its real strength**: this is **not** a claim that the pipelines are failing. Every output
table checked in earlier passes holds data, and `nba_score.final_hp` has a known, separately recorded
problem of its own (pass 33). **The claim is only that no run-history record exists**, which is
exactly what makes the first kind of claim hard to make.

### ⚠ And it is the third instance of a pattern now worth naming
Three structures created for a stated purpose, live in the database, **read or written by nothing**:
| Structure | Created | Status |
|---|---|---|
| The eight `nba_config` tunable tables (`classification_config`, `factor_registry`, `stat_decay_config`, …) | various | **read by no code** (pass 33) |
| `nba_ref.teams.arena_id` | T1, statement 14 | **NULL 30/30, written by no code** (pass 65) |
| `nba_control.job_runs`, `nba_control.worker_run_log` | T1, statements 13/18 lineage | **0 rows, referenced by no code** (this pass) |

**The common shape**: a schema written to match MLB's, ahead of the code that would use it, with no
later pass to check whether the code arrived. **Blueprint §6 warns about the registry-vs-reality
gap in the direction of "the entry exists but the worker is dead."** **This is the same gap in the
other direction — the table exists and the writer was never born.** Recorded as a named pattern so
later transcripts can be swept for more of it.

### The 21 registered workers, for the record
All 21 are `enabled = 1`. Registration dates run **2026-08-31** (`nba-static-teams`, the first, at
19:13:42Z — inside T1) through **2026-09-09** (`nba-baseline-ladder`). Groups: **15 in "01 Static"**,
**4 in "02 Historical"**, **1 in "03 Delta"**, **1 in "nba_baseline"**. The full list with dates is
in `NBA_WORKERS.md`; it is summarised here only because the **enabled flag is the one field that
looked like liveness and is not** — every row has it, and no row has ever produced a run record.

---

## FROM T1 PASS 67 — THE 24 SQL STATEMENTS, RE-RUN AS READS AGAINST THE LIVE DATABASE *(added 2026-09-20)*
*Angle: **every `run_sql_postgres` call in T1 extracted verbatim** — 12 reads, 4 writes, the rest
verification — and each one's target checked against the database as it stands today. **VERIFIED by
live SQL and by grep of all 190 code files.***

### ⚠⚠ SECURITY · **the transcripts carry live credentials, and an open item was asking for them to be committed**
Full entry and the per-transcript table: **the blockquote at the top of this document.** In short:
**17 `INSERT INTO nba_config.external_credentials` statements across 5 transcripts**, at least one of
which wrote a value **still live in the table today** (VERIFIED by `updated_at` falling inside T1's
session window). **The pass-40 blocker item has been qualified accordingly** — redact or rotate
before committing.

### ⚠⚠ **`credential_value_encrypted` IS A MISNOMER — nothing encrypts, and nothing decrypts**
**VERIFIED two ways.**

**From the code**: the column is read in exactly two places, and both use the value as-is:
```python
cur.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = %s", (key_name,))
key = str(row[0]).strip()          # backfill_board_snapshots.py
key = cur.fetchone()[0].strip()    # backfill_game_line_snapshots.py
```
**`.strip()` is the entire transformation.** **Grep of all 190 files finds no encrypt or decrypt step
anywhere** — the only matches for `encrypt` are the column name itself.

**From the data**: the table holds **6 credentials**, and **two of the six are bare 36-character
UUIDs** matching the canonical UUID pattern exactly — `balldontlie_api_key` and `oddspapi_api_key`.
The remaining four are 32-character strings (×3) and one 1,513-character token; **their encoding is
NOT RECORDED and this pass does not claim they are plaintext** — but nothing in the code would
decrypt them if they were encrypted, so they cannot be.

| `credential_key` | length | bare UUID? | `updated_at` |
|---|---|---|---|
| `balldontlie_api_key` | 36 | **yes** | 2026-08-31 |
| `betr_access_token` | 1,513 | no | 2026-09-10 |
| `odds_api_key` | 32 | no | 2026-09-10 |
| `odds_api_key_nba` | 32 | no | 2026-09-10 |
| `oddspapi_api_key` | 36 | **yes** | 2026-09-10 |
| `parlay_api_key` | 32 | no | 2026-09-10 |

**Why this is recorded rather than fixed**: the standing instruction forbids writes. **The name
promises a protection the system does not implement**, which is exactly the class of drift blueprint
§6 warns about (*"registry entry ≠ real functionality"*) — here applied to a column name.
⚠ **The design intent, if any, is NOT RECORDED**: nothing says whether encryption was planned and
dropped, or whether the suffix was always aspirational.

### The DDL T1 actually ran, and what became of it
T1's four write statements are the origin of the NBA namespace. **All four survive, and one has since
been contradicted by the documentation:**

| # | Statement | Status today (VERIFIED) |
|---|---|---|
| 13 | `CREATE SCHEMA IF NOT EXISTS nba_ref, nba_calendar, nba_team, nba_stats, nba_daily, nba_context, nba_market, …` | the NBA schema family exists; **6 of 14 schemas hold zero tables** (pass 47) |
| 14 | `CREATE TABLE nba_ref.teams (… arena_id TEXT …)` | exists, 30 rows — **but `arena_id` is NULL on all 30 and written by no code** (pass 65) |
| 18 | `CREATE TABLE nba_config.worker_definitions`, `nba_config.system_settings` | both exist; **`system_settings` is read by no code** (pass 33) |
| 19 | `INSERT INTO nba_config.worker_definitions ('alphadog-v2-nba-static-teams', …)` | the first NBA worker registration |
| 24 | `CREATE TABLE nba_config.external_credentials` + the first `INSERT` | exists, 6 rows — **see the misnomer above** |

**The read statements are a clean record of the Phase-1 recon** — schema list, NBA-name search,
sport/league discriminator search, `ref.teams` shape, `control`/`config` inventories, the 116-row
worker registry, and `ref.umpire_tendency` as the referee analogue. **All of this is already
documented**; it is listed here so the DDL table above has its context and so no future pass re-reads
the same 24 statements looking for something new.

### ⚠ A small NOT RECORDED detail: statement 23 is an exact duplicate of statement 22
Both run `SELECT column_name, data_type … WHERE table_schema='config' AND table_name='external_credentials'`.
**Harmless**, recorded only because a duplicated read is the kind of thing a future reader would
otherwise try to explain.

---

## FROM T1 PASS 66 — THE TIMELINE: WHERE T1'S FIFTEEN HOURS ACTUALLY WENT *(added 2026-09-20)*
*Angle: **the `start_timestamp` / `stop_timestamp` on all 552 timestamped blocks**, reconstructed
into a timeline and a per-tool cost table. No prior pass had used the clock. **These are measured
numbers and stay as full content.***

### The session is 15h 07m 46s wall clock — and 85% of it is the owner being away
**MEASURED**: T1 runs **2026-08-31 07:16:12Z → 22:23:58Z = 15h 07m 46s**.

| Segment | Duration | What it is |
|---|---|---|
| 07:16:12 → 07:19:15 | **3m 03s** | **the ENTIRE Phase-1 recon** — bindings, workflow runs, the Postgres schema sweep, the worker registry, and the findings banner |
| 07:19:15 → 18:59:48 | **11h 40m 22s** | owner absent |
| 18:59:48 → 20:39:12 | 1h 39m | the build — workers, scrapers, deploy-script edits, the Cloudflare diagnosis |
| 20:39:12 → 21:51:54 | **1h 12m 31s** | **the MCP connector reconnect that did not work** |
| 21:51:54 → 22:23:58 | 32m | the trigger-file workaround and the first successful scrape |

**Two human-absence gaps total 12h 52m 53s — 85% of the span.** **Actual session activity is
about 2h 14m 53s.** ⚠ **Every "T1 took fifteen hours" reading of this transcript is wrong**; nothing
in the documents said that, but nothing prevented it either.

### ⚠⚠ The 1h 12m gap is the MEASURED cost of the frozen tool schema
That gap sits exactly between the handoff message (*"compile a self-contained handoff message … the
user can carry into a new chat"*, thinking block 42) and the return (block 45: *"the user reconnected
as I suggested, sent my message to the new chat"*). **The reconnect did not deliver the new tool**
(pass 65, finding 5). **So the per-conversation tool-schema freeze cost 1h 12m 31s of a 2h 15m
working session — 54% of the active time — and produced nothing.** The trigger-file architecture is
what was built instead, in the 32 minutes that followed.

### ⚠ A CORRECTION TO A NUMBER THIS DOCUMENTATION ITSELF RECORDED
**Pass 38 recorded "thirteen polling sleeps" in six places across four documents. The measured count
is TWENTY-FIVE.** The earlier figure counted the **distinct sleep durations** (`30, 40, 45, 50, 55,
60, 70, 90, 150, 240, 280, 290` — twelve values plus one) rather than the calls. **Corrected at all
six sites 2026-09-20.**

**The full measurement** — **MEASURED from `tool_use` → `tool_result` timestamps**:
- **31 `bash_tool` calls**, not 62 *(the earlier "62" counted `tool_use` and `tool_result` blocks
  separately — 31 pairs)*.
- **25 of the 31 are `sleep N; echo done`**, totalling **2,416 s = 40m 16s**.
- Total `bash_tool` wall time is **2,423 s** — so **all but ~7 seconds of the session's entire local
  shell time was spent sleeping.**
- The six non-sleep calls are: **`node --check` · `python3 -m py_compile` · two `cat`s · and two
  `echo`s used as a scratchpad** (`echo checking`; `echo "need to check if there's a way to trigger
  workflow_dispatch via the Alphadog Bridge tools"`). **The `echo`s are a shell invoked to hold a
  thought** — recorded because it shows how narrow the local surface was.

### The per-tool cost table — total tool wait 3,736 s (1h 02m), ~46% of active time
| Tool | Calls | Total s | Mean s |
|---|---|---|---|
| `bash_tool` | 31 | **2,423** | 78.1 |
| `run_sql_postgres` | 24 | 349 | 14.5 |
| `github_patch_file` | **49** | 347 | 7.1 |
| `run_job` | 4 | 198 | **49.5** |
| `github_put_file` | 11 | 184 | 16.7 |
| `create_file` | 2 | 71 | 35.6 |
| `github_list_workflow_runs` | **31** | 54 | 1.8 |
| `github_get_file` | 20 | 31 | 1.6 |
| `github_grep_file` | 8 | 18 | 2.3 |
| `github_get_workflow_run_log` | 6 | 12 | 2.0 |
| `web_search` | 6 | 6 | 1.0 |
| everything else | 11 | 43 | — |

**Three things this table establishes:**
1. **The polling pattern is 25 sleeps paired with 31 `github_list_workflow_runs` calls** — 56 tool
   calls whose entire purpose was waiting. **Blueprint §4o exists to prevent exactly this**, and the
   structural cause (no dispatch tool, so no completion signal) is at `NBA_SYSTEM_DESIGN.md` §0.8.
2. **T1 made 60 repo writes** — 49 `github_patch_file` + 11 `github_put_file`. The pass-45 inventory
   of artefacts is the *what*; this is the *how many*.
3. **`run_job` is the slowest non-sleep tool at 49.5 s mean** over 4 calls — worth knowing before
   anyone plans a loop around it. **Not a recommendation to use it; the standing instruction forbids
   it during this documentation effort.**

---

## FROM T1 PASS 65 — THE 52 `thinking` BLOCKS: REASONING THE TRANSCRIPT RECORDS BUT THE SESSION NEVER SAID *(added 2026-09-20)*
*Angle: T1's **52 `thinking` blocks (33,739 characters)**, extracted by parsing the raw export as
JSON. **No prior pass had read them** — every previous angle read what the session said, ran, wrote
or persisted. These are the decisions' stated reasons, recorded at the moment each was made and
**never repeated in any visible message.** 45 of the 52 carry `summaries`; 7 are marked
`thinking_hidden`.*

### ⚠⚠ A DOCUMENTED CLAIM IS WRONG · **`nba_ref.teams.arena_id` is NULL on all 30 rows and written by no code**
`NBA_DATABASE.md` described the column as **`arena_id | TEXT | → nba_ref.arenas`** — i.e. a working
link. **VERIFIED live 2026-09-20: 30 of 30 rows are NULL**, and **grep of all 190 code files finds
zero writes to it.** Corrected in place.

**The relationship is real but runs the other way.** **VERIFIED**: `nba_ref.arenas` holds **30 rows,
`team_id` populated on all 30, 30 distinct teams** — written by `alphadog-v2-nba-static-arenas.js`
(`INSERT INTO nba_ref.arenas (arena_id, arena_name, team_id, …)`). **So no data is missing; the
column is vestigial.** The risk is narrow and specific: **anything joining `teams.arena_id →
arenas.arena_id` returns 30 NULLs and looks like a scrape failure.** Join on `arenas.team_id`
instead.

**And the transcript records exactly why it is empty.** Thinking block 16:
> *"I'll **defer arena assignment to a dedicated verification pass later** and focus now on writing
> the static teams worker … **leaving arena_id null to be filled in afterward**."*

**That verification pass never ran** — and it also stopped being necessary once the arenas worker
built the reverse link. **So this is a stale intention, not an outstanding task.** Recorded as a trap
column, not as work to do. ⚠ **Not fixed, per the standing instruction.**

### ⚠ NOT RECORDED · several Phase-1 and Phase-2 decisions were bounded by a REASONING-EFFORT BUDGET, stated only in thinking
Five separate blocks cut work short for budget rather than evidence:

| Block | Stated |
|---|---|
| 5 | *"**Given effort constraints, I don't want to keep fetching every live detail indefinitely** — I've gathered enough to move forward."* |
| 10 | *"**Given the low reasoning effort, I'll keep the draft efficient rather than exhaustively detailing every taxonomy point** — that's better left to later."* |
| 13 | *"**Given the low effort budget against this task's real scope, I need to be pragmatic**."* |
| 16 | *"**Given the constraints, I'll defer arena assignment to a dedicated verification pass later.**"* |
| 28 | *"**Given the effort constraints, I'll pragmatically switch strategy**: use balldontlie…"* |

**Why this matters, stated at its real strength**: none of these was a wrong call, and the work that
followed was sound. But **the documents present these outcomes as design decisions, and at least two
of them were scope reductions with the reason recorded nowhere a reader could find it.**
⚠ **Block 10 is the direct, documented cause of a gap found independently 33 passes later**: pass 62
established that **the prop taxonomy went from 14 planned to 28 live with no decision recorded**.
Block 10 is the decision — *"rather than exhaustively detailing every taxonomy point, that's better
left to later"* — and **"later" is the undocumented doubling.** The two findings close on each other.

### ⚠ NOT RECORDED · the "additive only" doctrine was a JUDGEMENT CALL made against a stated constraint, not a given
Every document states the rule as absolute — *"No MLB edits, ever. Everything additive"*
(`NBA_RECIPE.md` STEP 0, rule 2 — *pointer corrected 2026-09-20, pass 74; it previously read §1.2, a section that does not exist*). **The transcript shows it being decided, under pressure, in thinking:**

| Block | Stated |
|---|---|
| 17 | *"There's a real gap though: this worker file won't actually deploy … until it's added to `generate_wrangler_configs.py` … and **since I can't touch `generate_wrangler_configs.py` under the "no edits to MLB system" constraint, I need to think through how to handle that.**"* |
| 18 | *"**Given the user's tolerance for minor changes as long as MLB isn't disrupted, I'll modify the script additively** — checking the `nba/` path and pulling NBA workers from a separate manifest file rather than mixing them into the main one."* |
| 24 | *"I'll move forward with this **since it's an additive, infrastructure-only change that doesn't touch MLB behavior**."* |

**"Additive" is the resolution of a conflict, not the starting premise**: the literal constraint was
*no edits*, the shared deploy scripts made that impossible, and **the separate-manifest design exists
specifically to keep the edit additive.** That is why `worker_manifest_nba.json` is a separate file
rather than new rows in `worker_manifest.json` — a design whose *reason* was never written down.
**Recorded as provenance. The constraint held in the end** — `config.worker_definitions` still shows
**116 rows, 0 NBA** (`NBA_SYSTEM_ARCHITECTURE.md` §1).

### ⚠ NOT RECORDED · why `nba_control` has no `job_queue`
**VERIFIED live: `nba_control` holds exactly two tables — `job_runs` and `worker_run_log`.** The
documents record *"NBA has no orchestrator by design"*; **they do not record the inference that
followed from it.** Thinking block 15:
> *"Since NBA has no orchestrator dispatching jobs, I'm reconsidering whether we even need a
> `job_queue` table there — **the MLB version exists specifically to support orchestrator dispatch.**
> What NBA likely needs instead is just `job_runs` or a `worker_run_log` for tracking history, since
> jobs are triggered manually by hitting each worker's `/run` endpoint directly."*

**The live schema matches that reasoning exactly.** Recorded so the absence reads as a decision
rather than an omission.

### ⚠ NOT RECORDED · the MCP tool schema is FROZEN for the life of a conversation — and a new chat did not clear it
`NBA_MASTER_SUMMARY.md` §T1.17 records that `github_trigger_workflow` was absent. **The transcript
records the mechanism and a failed workaround:**
> *(block 41)* *"**my tool schema was fixed at the start of this conversation, before I added that new
> tool to the MCP server code.** This means I can extend the server, but **I can't actually invoke the
> newly added tool within this same session until the connection refreshes.**"*
> *(block 43)* *"It's strange that **the tool isn't showing up even in a new chat session** … maybe the
> Durable Object instance didn't restart, or **there's some session caching issue** … it's possible
> **the connector itself caches tool schemas per-user and doesn't refresh instantly across new
> conversations**."*
> *(block 46)* *"since function calling requires an exact schema definition, and `github_trigger_workflow`
> isn't in my available tools list, **I literally [cannot]**…"*

**This is the full causal chain behind the trigger-file architecture**: schema frozen per
conversation → a new chat did not pick it up either (cause **NOT RECORDED**, two hypotheses offered
and neither confirmed) → repository_dispatch needs an API call with no tool → **push is the only
event the assistant can raise**, so a dedicated marker file becomes the trigger button (block 47).
**The `nba/TRIGGER_NBA_*.txt` files are the last step of that chain**, and the documents record the
step without the chain.

### ⚠ A SUPERSEDED HYPOTHESIS, worth keeping because it shows the diagnostic ladder
Block 50, after the GitHub Actions runs also hung:
> *"stats.nba.com hangs regardless of origin — Cloudflare Worker got instant rejection, GitHub Actions
> direct timed out, and GitHub Actions via proxy also timed out — **suggesting this isn't a
> network/IP block but something wrong with the request itself**."*

**That hypothesis was wrong and was corrected within two blocks** — block 49 had already named the
real pattern (*"deliberate tarpitting … letting connections dangle indefinitely instead of returning
a 403"*) and `curl_cffi` TLS impersonation resolved it. **Recorded because the documents keep only the
answer**, and the ladder — *instant 403/520 from Cloudflare* vs *60-second hang from a clean origin* —
**is the diagnostic that distinguishes an IP block from a TLS-fingerprint tarpit**, which is reusable.

### Already recorded, confirmed not new *(checked, no change)*
- **`abbreviation` came back empty from `leaguestandingsv3`** and is derived from a hardcoded
  `TEAM_ID_TO_ABBREVIATION` map — **already at `NBA_DATABASE.md` line 129**, and the map carries its
  own justification in `scrape_nba_stats_teams.py` lines 51–55.
- **The whole nba.com family blocks Workers** — `NBA_RECIPE.md` STEP 3.6.
- **Officials must be mined cumulatively from box scores, not a roster endpoint** (block 13) —
  already in `NBA_DATABASE.md`.

---

## FROM T1 PASS 64 — THE TRANSCRIPT CORPUS IS NOT COMPLETE, AND THE GAP IS MEASURED *(added 2026-09-20)*
*Angle: **the transcripts as an artefact rather than as a text** — every export parsed as JSON and
audited for truncation. **VERIFIED** by parsing all 20 raw exports and by checking the affected paths
against the live clone and its `git log`. **This is full content, not a pointer: it is a measured
number and it changes how the remaining sweeps must be read.***

### ⚠⚠ FOURTEEN TRUNCATION MARKERS EXIST IN THE EXPORTS — all in **T1–T6**, none in T7–T20
**VERIFIED.** Every marker has the identical form `…[truncated — N chars total]` and every one cuts at
**exactly 65,503–65,504 characters** — a uniform **64 KiB (65,536) display cap**, not a variable one.
**All 14 sit in a `display_content.json_block` field**, i.e. the *display* copy of a tool result.

| Transcript | Markers |
|---|---|
| **T1** `…phase1-static` | 1 |
| **T2** `…phase3a-enrichment-complete` | 1 |
| **T3** `…phase3a-final-complete` | **4** |
| **T4** `…phase3b-backfill-complete` | 2 |
| **T5** `…phase3c-starter-status-complete` | 3 |
| **T6** `…phase3d-delta-complete` | 3 |
| **T7–T20** | **0** |

### ✅ **8 of the 14 lose nothing** — the full text survives in the sibling `content` field
**VERIFIED**: in eight cases `len(content)` equals the stated total exactly (96,015 · 106,826 ·
136,306 · 177,815 ×3 · 178,281 ×2). **Only the display copy was cut; the machine-readable copy is
whole.** **T1's single marker is one of these** — `github_get_file` on a 96,015-char result, present
in full. **T1's sweep is therefore NOT compromised by truncation**, and no prior T1 pass needs
revisiting on this account.

### ⚠⚠ **6 of the 14 are genuine losses** — `content` is a 212-character stub
In six cases `content` holds only:
> *"Tool result too large for context, stored at
> `/mnt/user-data/tool_results/Alphadog_Bridge_github_get_file_<tool_use_id>.json`. Use grep to search
> for specific content or head/tail to read portions."*

**That spill path does not exist today** (VERIFIED — `/mnt/user-data/tool_results` is absent in this
session). **5,564,467 characters are absent from the exports**, distributed as:

| Transcript | Fetched path | Stated size | Present |
|---|---|---|---|
| **T2** | `nba/data/nba_onoff_current.json` | 208,560 | 65,503 |
| **T3** | `nba/data/nba_darko_debug_html_snippet.txt` | 441,774 | 65,503 |
| **T3** | `nba/data/nba_schedule_current.json` | 726,393 | 65,503 |
| **T3** | `nba/data/nba_schedule_current.json` *(second fetch)* | 1,387,886 | 65,503 |
| **T3** | `nba/data/nba_playtypes_player_current.json` | 1,059,358 | 65,503 |
| **T4** | `nba/data/nba_player_career_totals.json` | 2,133,514 | 65,503 |

### ✅ **AND ALL SIX ARE RECOVERABLE** — state this at the right strength
**Every one of the six is a `github_get_file` call on a committed repo path, and all five distinct
paths exist in the live clone today** (VERIFIED: 189,215 · 432,513 · 1,225,505 · 927,975 · 1,611,511
bytes). **Every one also has `git` history spanning the transcript dates** (VERIFIED: first commits
2026-09-01 … 2026-09-03, later commits through 2026-09-14), so **the version the session actually saw
is retrievable with `git show <commit>:<path>`** rather than from the transcript.

**So the correct statement is: nothing unique was lost.** What the exports lost was a *copy* of files
the repository still holds. **No transcript content — no owner instruction, no assistant reasoning, no
SQL, no decision — falls inside any of the 14 markers.** Every marker is a data-file body.

### The standing rule this creates for T2–T6
**When a T2–T6 pass reaches a truncated block, do not record the gap as unknowable.** The procedure is:
1. read the `tool_use` block that precedes it to get the fetched `path`;
2. `git log --follow -- <path>` to find the commit nearest the transcript's date;
3. `git show <commit>:<path>` for the text the session saw.

**Recorded as a method rule, not an action item.** ⚠ **It does mean a T2–T6 sweep that reads only the
plaintext rendering will silently skip up to 2.1 MB in a single block** — which is exactly the kind of
false-negative the pass-53 method rule warns about.

### ⚠ A collateral method failure, recorded against myself
The first grep for these markers used a literal em-dash and returned **zero matches in every raw
file** — the exports store it escaped as `—`. **I briefly held a confident negative that the raw
transcripts were clean and the markers were an artefact of my own conversion.** They are not.
**This is the third instance of the pass-53 rule** (*never establish a negative from a
formatted-string grep*) **and the first where the formatting difference was an escape sequence rather
than a character variant.** The rule is extended accordingly: **grep the raw export for the escaped
form as well as the rendered form, or parse it as JSON.**

---

## FROM T1 PASS 63 — BLUEPRINT §5–§7e BY CONCEPT — **one clause** *(added 2026-09-20)*
*Angle: the last unswept clause-level region of the blueprint — §5, §5a, §5b, §6, §6a, §6b, §7,
§7a–§7e. **Near-clean: one clause of ten checked is undocumented.***

### ⚠ NOT RECORDED · a first deploy failure may be a known transient, not a real break
> *"**Don't assume a first deploy attempt's failure is permanent** — a **known, recurring transient
> first-attempt failure pattern** existed in MLB's own pipeline; **retry once via a trivial no-op
> commit** before concluding something is genuinely broken."*

**Directly relevant to this repo**: the deploy pipeline **auto-deploys on push**, so *"retry once via
a trivial no-op commit"* is a one-line action available to any session.
⚠ **T1's own run-ID audit trail shows the shape** — `deploy` **33429867514 → failure**, then
**33431309511 → success** (*PASS 40*). **Whether that first failure was the known transient or the
real path bug T1 diagnosed cannot be distinguished from the record**, because **the log for the
failed run had already expired when it was requested** (404, *"link may have expired, or run is too
old"*). **Flagged, not resolved** — and it is a small worked example of why that log-expiry
constraint matters.
**The rule itself is NOT RECORDED anywhere**, so a future session meeting a first-attempt deploy
failure has nothing telling it to retry before investigating.

### ✅ The other nine clauses are covered
**§5 / §5a / §5b** — MLB's manual, Cowork-session-driven operating model and *"the deeper root
cause, once traced further"* (`NBA_SYSTEM_DESIGN.md` §0.9) · **§6 / §6a / §6b** — *"never assume one
file = one job"*, the **dead-stub file name**, the **exact-pairing safety check**, and the
investigation method (*query the structured job/worker registry tables first*, then *targeted code
search*) (`NBA_WORKERS.md` §0a, §0d) · **§7 / §7a–§7e** — the **hardcoded whitelist tuple**,
**bulk inserts over individual-row inserts, always**, *"the real fix was one connection option"*, and
the **DST scheduling gotcha** — *never hardcode a fixed UTC offset; resolve by named timezone* —
all in `NBA_SYSTEM_ARCHITECTURE.md` §2c and §8a.

---

## FROM T1 PASS 62 — THE PROP TAXONOMY DOUBLED, AND THE GROWTH WAS UNPLANNED *(added 2026-09-20)*
*Angle: System Draft **§1–§4** clause by clause (pass 32 covered §4b and §5 only), then **the day-one
prop taxonomy diffed against the live `nba_ref.prop_taxonomy`.** VERIFIED by live SQL 2026-09-20.*

### The plan vs what exists
**The System Draft's day-one taxonomy names 14 props** — *"first-class NBA prop families from day
one (no bolt-on treatment)"*: single-stat (points, rebounds, assists, threes made, steals, blocks,
turnovers), combo (PRA, pts+reb, pts+ast, reb+ast), binary (double-double, triple-double), and
fantasy points.

**The live taxonomy is 28 props across 10 families.** ✅ **Every planned prop exists.** The other
fourteen were never named in the plan:

| Family | Live keys | Planned? |
|---|---|---|
| `scoring` (6) | `points`, **`points_1q`, `points_1h`, `points_2h`, `points_4q`**, **`ftm`** | points only |
| `combo` (6) | `pra`, `pts_reb`, `pts_ast`, `reb_ast`, **`pra_1q`**, **`stocks`** | four of six |
| `shooting` (2) | `threes_made`, **`threes_made_1q`** | one of two |
| `rebounding` (2) · `playmaking` (2) | `rebounds`/`assists` + **`_1q`** variants | one of two each |
| `composite` (2) | `fantasy_score`, **`fantasy_score_1q`** | one of two |
| **`volume` (2)** | **`fga`, `fg3a`** — attempts, not makes | **not planned at all** |
| `defense` (3) | `blocks`, `steals`, **`personal_fouls`** | two of three |
| `milestone` (2) | `double_double`, `triple_double` | ✅ both |
| `ball_handling` (1) | `turnovers` | ✅ |

### ⚠ Period props are now a third of the taxonomy and were never in the plan
**Nine of the 28 are period variants** — `points_1q/1h/2h/4q`, `assists_1q`, `rebounds_1q`,
`threes_made_1q`, `pra_1q`, `fantasy_score_1q`. **The day-one taxonomy has no period dimension at
all.**

**Why it matters rather than being trivia:**
- **Period props carry their own OT rule** — `nba_ref.prop_taxonomy.ot_rule` exists as a column, and
  the record already notes **OT handling differs by app**. **A full-game prop and a 1Q prop are
  different populations with different settlement rules**, which is exactly the *"prop-definition
  mismatches across platforms"* trap of **lesson #14**.
- **They are a third of the board surface** and were added without the *"first-class from day one,
  not an afterthought"* framing the plan applied to combos (*PASS 49*) — **the one place the plan
  explicitly warned against bolt-on treatment.**
- **`volume` props (`fga`, `fg3a`) are attempts rather than makes** — a different distributional
  shape, and the recipe treats them as `family: "auto"`/`"negbin"` accordingly.

**NOT RECORDED as a decision anywhere**: no entry says period props were considered and added, or
why the day-one list omitted them. **The taxonomy doubled and the record does not say when or why.**

### ✅ System Draft §1, §2 and §4 are fully covered
**§1** the naming convention and its *"CORRECTED 2026-08-31 — no exception, full separation"* ·
**§2** reused-as-is vs must-be-built-fresh · **§4** *"no orchestrator, confirmed as the explicit
design"* · **§3's** no-pitcher-side simplification and the resulting **absence of a
`stats_hitter`/`stats_pitcher` split** · and §3's **per-prop tier-count/tier-spacing verification
requirement**, already recorded as open at *PASS 49*.

---

## FROM T1 PASS 61 — THE FACTOR MAPPING WAS TRANSCRIBED 4 ROWS OF 10 *(added 2026-09-20)*
*Angle: Domain Mapping **§2's main table**, row by row — pass 52 covered only its
"NBA-specific factors" subsection. **`NBA_FINAL_SCORING_CALIBRATION.md` §7h carries 4 of the
source's 10 rows.** All six missing rows are now added there, with outcomes.*

### The completeness gap
§7h is the mandated home of the MLB→NBA factor mapping. **It transcribes weather, park factors,
roof/dome and batting order — and stops.** Missing: **bullpen fatigue, handedness matchup, recent
form, lineup protection, opposing starter quality, quality of contact.**
**Each has a live NBA counterpart** — the six rows and their outcomes are now in §7h.

### ⚠ The scorecard, which is the part that matters
**The handoff's most confident NBA forecasts are the ones that did not hold:**
- *"Teammate/rotation fatigue… **likely a MORE important factor for NBA** than bullpen factors are
  for MLB"* → **absorbed into the baseline** via the calendar, never built as an enrichment factor.
- *"'Usage rate change with a teammate out' — **a real, well-documented NBA effect**"* → became
  **A2 teammate redistribution**, and **A2 was FULLY RETRACTED after five failed panels.**
  **It is the one prediction that was actively tested and overturned.**
- By contrast its plainest call — **recent form, *"directly applicable, port directly"*** — became
  **the EWMA core of the baseline**, the most load-bearing decision in the recipe.

**This is the third recorded case of a confident forward-looking handoff claim not surviving
contact**, after **ParlayAPI** (*PASS 49*, *"the single biggest head start"*, superseded) and **the
four NBA-specific factors** (*PASS 52*, the #1 pick measured at 79% coin flips).
**The filter that emerges, stated once and applying to the ~40% of `ALPHADOG_DOS_AND_DONTS.md` and
`ALPHADOG_SYSTEM_MAP.md` still unread (*PASS 37*): the handoff's accounts of MLB's MEASURED
EXPERIENCE held; its FORECASTS about NBA did not.** Weight them differently.

---

## FROM T1 PASS 60 — LESSONS PARTS B, E, F BY CONCEPT — **two items from Part F** *(added 2026-09-20)*
*Angle: the lessons document's remaining Parts, read by concept. **Part B and Part E are fully
covered. Part F's last two lessons are not.***

### ⚠ "OPPONENT" CAN MEAN DIFFERENT THINGS ON DIFFERENT SIDES OF A PROP — and NBA reuses one lookup
> *"**A fifth, concrete design lesson**: a shared **'opponent' or 'matchup' concept in a factor's
> logic can mean genuinely different things depending on WHICH SIDE of a given prop it's being
> applied to**, and **reusing the same lookup blindly can encode a real conceptual error.** MLB found
> a real case where an **'opposing defense' factor was correctly wired for hitter props** (the
> batter's opponent is the fielding team behind the pitcher he's facing) **but silently wrong** [for
> the other side]."*

**NBA's opponent-shaped factors**: the baseline's **opponent-defence** term, **B4 opponent
availability / rim protection**, **M1 defender level**, and `nba_team.defense_vs_position`.
**All four resolve "opponent" from the calendar, once per game, and are then applied to both
directions of every prop.**

**✅ The mitigating fact, stated honestly**: **NBA has no opposing-role prop family.** Domain Mapping
§1 is explicit — *"no direct 1:1 equivalent… all NBA props are 'batter-style' (offense-side player
stats)"*. **MLB's bug required two prop families with opposite opponent semantics; NBA has one.**
So the *specific* failure cannot reproduce.

**⚠ What is NOT established** is the narrower version of the same question, which nothing in the
record addresses: **does the opponent lookup carry the same meaning for a `Less` as for a `More`?**
A `More` on points wants a weak defence; a `Less` wants a strong one — **that much is just sign.**
The lesson's point is subtler: **whether the same stored value is the right INPUT for both sides**,
or whether one side needs a different quantity entirely. **NOT RECORDED as checked.** ⚠ It compounds
with *PASS 29*'s §7f finding — **`side` is the dimension MLB's calibration fit collapsed**, and it is
the same dimension here.

### ⚠ THE PARALLEL-INVESTIGATION TECHNIQUE — used by NBA, never written down as a standard
> *"**Finally, a real, practical technique worth adopting directly**: the discovery of the
> baseline-leakage bug came from **an independent, parallel investigation thread cross-checking a
> specific open question against this one's own findings — NOT from either thread working in
> isolation.** **When a finding is foundational enough that being wrong about it would invalidate a
> large amount of downstream work** (a baseline reference value, a core formula, a key statistical
> [result])…"* — **run an independent parallel check rather than a deeper single-threaded one.**

**⚠ This is the owner's operating model arriving from the research side.** The founding
specification's *"one new chat per big data domain… so we don't overload any specific work"*
(*PASS 36*) is organisational; **this lesson says the same structure is an error-detection
mechanism**, and names the class of finding that warrants it.

**And NBA has already benefited from it without recording why**: T1 itself contains the
**parallel-chat episode** — a second session independently checking the `github_trigger_workflow`
problem and reaching a different, correct conclusion (§T1.17). **The technique worked; it was never
recorded as a technique.**
**NOT RECORDED as a standing practice.** The findings it would apply to are named in this file:
the **certified baseline** result, the **`p × m` gate**, the **anchor** that ten factors were
measured against, and the **config-vs-code divergence** — **each is foundational enough that being
wrong invalidates large amounts of downstream work.**

### ✅ Parts B and E are fully covered
**Part B** — PrizePicks step-function tiered pricing and the ~1.4× per-tier growth · Underdog and
Sleeper pricing per-leg dynamically · PrizePicks discounting same-game correlation · no DFS platform
publishing per-leg multipliers via API — **all in `NBA_MULTIPLIERS.md` §0.2d–§0.2g.**
**Part E** — the consecutive-clean-pass standard — **`NBA_FINAL_SCORING_CALIBRATION.md` §16**, and it
is the standard this entire documentation effort runs on.

---

## FROM T1 PASS 59 — BLUEPRINT §4a–§4i BY CONCEPT — ✅ **CLEAN** *(added 2026-09-20)*
*Angle: the enrichment and calibration half of §4, the sample pass 58 did not cover. **Every
subsection has an entry, and each of the nine is cited by section number in at least one document.
Nothing new.***

**Concepts checked and present**: **overdispersion correction** for count props and **sample-support
clamping (Wilson score interval)** (§4b → `NBA_BASELINE_CALIBRATION.md`) · **push/tie/DNP as a real
third state** and **isolation-by-design as a safety property** (§4c → `NBA_OPEN_ITEMS.md`,
`NBA_FINAL_SCORING_CALIBRATION.md` §7n) · **macro-environment multicollinearity** and **a
cumulative/season-total stat used as if it were a per-game rate** (§4a → §7k) · **the two-layer
architecture never collapsed into one** and **combining factors additively in log-rate space**
(§4d → §0c, §0d) · **decide the factor architecture once** (§4e → §0e) · **two standing search
disciplines** (§4f → §7q) · **the preset-dictionary principle** and **tri-state data-quality
tagging** (§4g → §0f, §4b) · **"a function is called but was never actually defined" as a systemic
risk category** (§4h → `NBA_OPEN_ITEMS.md`, `NBA_WORKERS.md`) · **exhaustively check the sport's own
official API first** (§4i → four documents, and corroborated from the owner's own words at
*PASS 36*).

**PASS 59 IS CLEAN — 2 of 3.**

---

## FROM T1 PASS 58 — BLUEPRINT §4j–§4n BY CONCEPT — ✅ **CLEAN** *(added 2026-09-20)*
*Angle: the sound method applied to the blueprint's operational and data-mining subsections. **Every
lesson in §4j, §4k, §4m and §4n has an entry. Nothing new.***

**§4j, both patterns present**: *"two files meant to be exact copies can silently drift out of
sync"* (`NBA_OPEN_ITEMS.md`, `NBA_MASTER_SUMMARY.md` — and cited again at *PASS 42* as the class the
ledger drift belonged to) · the **global lock / "busy" response** pattern, with the *"one to two
minutes"* wait before concluding a job is stuck.

**§4k, all eight base-layer lessons present** *(all in `NBA_SYSTEM_ARCHITECTURE.md` §4c, several
cross-referenced elsewhere)*: adopt existing correct data rather than blindly re-fetching ·
never validate against an old/reference database as ground truth · **verify every column that should
refresh is in the `ON CONFLICT DO UPDATE` list** · **bounded rolling re-verification window** rather
than a frozen cutoff · **a shared helper's own hidden internal cap** overriding the caller's setting ·
rebuild a proven pattern rather than port a problematic legacy one · **check whether the need can be
derived purely via SQL** from data already collected (MLB's bullpen-appearances case) · **classify
each source's real shape** — per-game vs season-to-date aggregate — before designing its mining.

**§4m** is the source of `NBA_SYSTEM_ARCHITECTURE.md` §2c in full. **§4n** is cited by section in
three places — the quantified numeric-precision bug, the already-migrated-system caveat, and the
legacy-guard problem applied to an inherited tuning constant.

**PASS 58 IS CLEAN — 1 of 3.**

---

## FROM T1 PASS 57 — TWO BACKTEST TRAPS FROM PART D, BOTH LIVE IN NBA *(added 2026-09-20)*
*Angle: Part D's two remaining trailing subsections, read by concept. **Neither appears in the twelve
documents, and each has a live NBA instance.***

### ⚠⚠ NO FIX-DATE LIST EXISTS — and NBA has already changed its tier-derivation logic
> *"MLB's tier/lane classification logic was **itself wrong for real, identifiable stretches of
> time**, fixed on specific dates… Any backtest spanning a date range that crosses one of these fix
> dates needs to **either exclude the pre-fix period** for the analysis the fix affects, **or
> explicitly flag that the pre-fix data may be systematically wrong.** **For NBA: the moment any
> classification, tagging, or tier-derivation logic is fixed, WRITE DOWN THE EXACT DATE, AND MAINTAIN
> THAT LIST AS A FIRST-CLASS ARTIFACT** — any future backtest crossing one of these dates needs to
> account for it, **not silently pool pre- and post-fix data together.**"*

**NBA has already done exactly the thing that requires the list, and the list does not exist.**
`NBA_GOBLIN_DEMON.md` §8 records **`nba_market.board_tiers` v1 as SUPERSEDED** — v1 derived `kind`
from the Odds API **price** (`price=100` → demon, `price=-137` → goblin) and **every v1 row is
Over-only** — replaced by `board_tiers_v2`'s four-way taxonomy. **That is a tier-derivation logic
fix**, and **v1 still holds 2.2M legs in the database.**

**Other undated classification changes in the record**: the ladder recipe's **v1 → v12 → v18**
progression · `apply_ladder_calibration` · the `minutes_mixture` config/code divergence · the
`board_tiers` → `board_tiers_v2` cutover itself.
**None has a recorded effective date.** **Any backtest crossing one of them silently pools pre- and
post-fix data** — the precise failure the lesson names.
**SEASON-START RELEVANT**: the list is cheapest to build now, while the changes are still in living
memory, and it is a prerequisite for trusting any cross-season backtest.

### ⚠ QUERY-TIME RECONSTRUCTION — NBA does it, and no analysis accounts for it
> *"MLB's live deployed system **reconstructs certain classification values (e.g. tier) on the fly at
> query time via a fallback formula**, specifically because the raw stored column is known to be
> sparsely populated (**in one real case, only ~10% populated**) — but the live system's real,
> effective sample is much larger than the raw column suggests. **Before concluding a category is
> thin or unreliable based on a raw stored column, check whether the live system applies query-time
> reconstruction logic that the historical/backtest analysis needs to replicate** — measuring against
> the raw, unreconstructed column can produce **a dramatically smaller and differently-biased
> sample**."*

**NBA's analogue is `score_board_legs.py`**: off-ladder rungs are **interpolated in log-odds and
flagged** with a **−4 confidence** penalty, and the result is stored in
`nba_score.board_scored.interpolated`.

**Measured, VERIFIED 2026-09-20**: **110,955 scored legs, 6,317 interpolated — 5.7%.**
⚠⚠ **THE POPULATION IS DATED; THE RATE IS THE FINDING** *(propagated here 2026-09-22, T18 pass 7 —
`NBA_DATABASE.md` carried this correction and this file did not)*: **`board_scored` was 110,955 rows
on 2026-09-20, 5,524,359 on 2026-09-21 and 12,818,715 on 2026-09-22.** ✅ **The 110,955 state is
still physically verifiable — `nba_score.board_scored_snapshot_20260920` holds exactly 110,955
rows.** 🔑 **And the rate replicates on an independent population**: the transcript's own scorer run
reports **3,243 interpolated of 58,395 = 5.55%** *(`NBA_DATABASE.md` §0z-T18)*, against **5.7%**
here. *Two populations, two runs, the same rate — which is what makes the 5.7% a property of the
ladder's depth rather than of one day's board.*

**So the direction is the opposite of MLB's case and the trap is the mirror image.** MLB's raw column
was sparse and reconstruction *enlarged* the effective sample; **NBA's reconstruction *adds* 5.7% of
legs that have no exact ladder rung behind them.** **An analysis that filters `interpolated = false`
measures a different, smaller, and differently-biased population than production scores** — and one
that ignores the flag treats 6,317 interpolated legs as if they were measured.
**Which past NBA analyses did either is NOT ESTABLISHED** — the entries do not record whether they
filtered on it.

---

## FROM T1 PASS 56 — ⚠⚠ THE VOLUME-VS-DEPTH TEST, NEVER RUN — AND THE DATA IS ALREADY THERE *(added 2026-09-20)*
*Angle: the sound method from *PASS 55* — read a source subsection, decide what it asserts, search
for the **concept**. Source: T1, `NBA_LESSONS_LEARNED_FROM_MLB.md` Part D, the subsection
**"a concrete, well-documented real NBA-transferable structural pattern worth testing for
directly."* **The pattern appears in none of the twelve documents. Volumes below are VERIFIED by
live SQL 2026-09-20.***

### The pattern
> *"A prop's real hit rate **climbs meaningfully and repeatably as tier/ladder-depth increases**…
> and **the genuinely usable sweet spot was NOT the theoretical deepest tier** (almost always a thin,
> one-off, unreliable sample) **but THE DEEPEST TIER THAT STILL CARRIES REAL VOLUME** (MLB's rule of
> thumb: **n ≥ 10–20 real observations**)… **test for this same volume-vs-depth tradeoff directly
> rather than assuming either extreme.**"*

**NBA has measured the hit-rate half and never the volume half.** `NBA_GOBLIN_DEMON.md` §5 records
goblins at **74.1 / 68.7 / 61.9%** (T−3/−2/−1) and demons at **32.9 / 21.3 / 14.8%** (T+1/+2/+3) —
**with no volume dimension anywhere.**

### The volume half, measured — `nba_market.board_tiers_v2`, ~2.19M legs
| tier | legs | distinct player-props | | tier | legs | distinct player-props |
|---|---|---|---|---|---|---|
| −7 | 1 | 1 | | **0** | **788,680** | 5,447 |
| −6 | 21 | 14 | | +1 | **109,544** | 3,544 |
| −5 | 207 | 87 | | +2 | **351,329** | 3,811 |
| −4 | 1,600 | 547 | | +3 | **244,731** | 3,501 |
| **−3** | **62,542** | 2,052 | | **+4** | **117,010** | **2,758** |
| −2 | **165,711** | 3,103 | | +5 | 3,794 | 902 |
| −1 | **353,579** | 3,819 | | +6 / +7 / +8 | 515 / 85 / 5 | 236 / 56 / 5 |

### ⚠⚠ The actionable result: the demon ladder has a fourth tier nobody priced
- **Goblin side — deepest tier with real volume is T−3** (62,542 legs). **T−4 collapses to 1,600, a
  39× fall.** **§5's goblin economics already stop at T−3**, so the documented range matches the
  volume-supported range — **but that was never the stated reason, and now it is.**
- **⚠ Demon side — deepest tier with real volume is T+4, and §5's economics stop at T+3.**
  **T+4 carries 117,010 legs across 2,758 distinct player-props.** **T+5 is where the collapse
  happens** (3,794 — a 31× fall). **T+4 is exactly what the lesson points at — not the theoretical
  deepest tier, but the deepest one with real volume — and it is priced nowhere in this system.**
  **NOT RECORDED as tested.**
- **⚠ The ladder is asymmetric in a way nothing records.** The goblin side decays monotonically;
  **the demon side does not — T+1 (109,544) carries LESS volume than T+2 (351,329) and T+3
  (244,731).** **Why T+1 is under-offered relative to its neighbours is NOT ESTABLISHED**, and it
  matters because **§5 records T+1 as "the only demon tier ever worth solving."**

**What this does not claim**: nothing here measures a hit rate. Volumes come from `board_tiers_v2`,
rates from `board_outcomes`. **Pairing them is the test the lesson asks for, and it has not been
run.** ⚠ **It also has to be run per prop**, per the instruction recorded at *PASS 49* and §5.0's own
rule — **so the correct version of this test is per (prop × tier), not the pooled table above.**

---

## FROM T1 PASS 55 — ⚠ **VOID: the sampling instrument failed** *(added 2026-09-20)*
*Angle attempted: a third random sample of bold claims, matched by contiguous phrase with normalised
punctuation. **It returned 26 misses out of 26 — including claims this sweep had already quoted from
the twelve documents by hand.** The instrument, not the corpus, is what produced that result.*

### Why phrase-matching cannot establish coverage for this corpus
**The twelve documents quote the handoff with heavy inline bolding**, e.g. the blueprint's
*"file names, job_key names, and 'is this worker active' assumptions are frequently wrong"* appears in
`NBA_WORKERS.md` §0d as *"**file names, job_key names, and 'is this worker active' assumptions are
FREQUENTLY WRONG**"* — **re-cased, with `**` markers inserted mid-phrase.** Any contiguous-substring
match breaks on the first inserted marker or case change. **Known-present claims returned MISS**:
*"two files meant to be exact copies… drift out of sync"* (quoted at `NBA_SYSTEM_ARCHITECTURE.md`),
*"this four-stage order is load-bearing"* (verified at *PASS 51*), *"never write new data to D1"*
(recorded at *PASS 51*).

### The pass is VOID, not clean and not new
**A clean pass means the transcript yielded nothing new. This pass yielded nothing measurable** — it
did not read the transcript so much as fail to search it. **Counting it as clean would inflate the
streak on a broken instrument**, which is precisely the failure the DRIFT NOTICE and the superseded
3/3 at §T1.58 both record. **It is recorded, dated, and excluded from the count in both directions.**

### Standing method rule, from passes 53 and 55 together
1. **Never establish a negative from a formatted-string grep.** *PASS 53* found two false negatives
   from punctuation alone (`3-5x` vs `3–5×`, `700KB` vs `700 KB`).
2. **Never establish coverage from phrase matching at all.** The corpus re-cases and re-bolds
   everything it quotes.
3. **What does work, and is what every finding in passes 29–54 actually rests on**: read a section of
   the source, decide what it *asserts*, then search the documents for **the concept** — a table
   name, a column, a job mode, a rule's subject — and **read the hit to confirm it is the same
   claim.** Slower, and it does not produce false negatives at scale.

---

## FROM T1 PASS 54 — IDENTIFIER SAMPLE — **one item: `nba_game_id` was specified and never created** *(added 2026-09-20)*
*Angle: sample the **identifiers** — every backticked name in the handoff documents (148 distinct),
30 drawn at random, each checked with the normalised matching that pass 53's method caveat requires.
**28 of 30 are documented. One miss is Part H material that postdates T1 (`product_experience_id`,
already an open gap at PASS 30). One is a genuine T1 finding.***

### ⚠ `nba_game_id` DOES NOT EXIST — the two-column ID pattern has a hole
**VERIFIED by live SQL 2026-09-20:**
| Column | Columns in the live schema |
|---|---|
| `nba_player_id` | **11** |
| `nba_team_id` | **6** |
| `game_id` | **20** |
| **`nba_game_id`** | **0** |

**The handoff names `nba_game_id` as the canonical game identifier.** Every other entity follows a
**two-column pattern** — a canonical prefixed TEXT id plus the raw stats.nba.com BIGINT
(`team_id` + `nba_team_id`, `player_id` + `nba_player_id`). **Games have only one column, and it is
not prefixed**: `nba_calendar.games.game_id` is **0 of 2,666 prefixed** (*PASS 50*).

**So the pattern the blueprint asked to be applied *everywhere* has exactly one hole, and it is the
join key that ties every per-game table together** — `player_game_log`, `team_game_log`,
`board_scored`, `final_hp`, `baseline_history`, `game_officials` and fourteen more all key on
`game_id`.

**⚠ What follows, and what does not:**
- **✅ Nothing is broken.** All 20 `game_id` columns are TEXT and hold the same unprefixed format, so
  **game joins work everywhere** — including across the `nba_score` ↔ `nba_stats` boundary where
  `player_id` fails (*PASS 50*).
- **⚠ But it means the `player_id` split is not a one-off slip.** Two of the three entity ids depart
  from the stated convention in some way: **`player_id` has two conflicting value formats across
  layers, and `game_id` has no prefixed form at all.** **Only `team_id` was implemented exactly as
  specified.**
- **NOT RECORDED as a decision** — no entry says `nba_game_id` was considered and dropped. It reads
  as an omission rather than a choice, but **that is inference, not evidence, and is flagged as
  such.**

### ✅ Present and correct — the rest of the sample
`nba_certifier` · `control.control_job_queue` · `config.worker_schedules` ·
`config.external_credentials` · `DUMMY_ONLY_NOT_REAL_DATA` · `stolen_base_family` ·
`ref.umpire_tendency` · `postgres.js` · `is_live` / `is_final` · `mlb_team_id` ·
`market.*_board_current/stage` · `alphadog-v2-admin-sql.js` ·
`alphadog-v2-nba-prizepicks-github-board.js` · `player_points` · `github_grep_file` · `wrangler`.

---

## FROM T1 PASS 53 — NUMERIC-CLAIM SAMPLE — **CLEAN**, plus a method caveat worth keeping *(added 2026-09-20)*
*Angle: sample the **measurements** rather than the assertions — every sentence in the handoff
documents carrying a figure with a unit (`%`, `pp`, `×`, rows, legs, KB…), then grep each against the
twelve documents. **All twelve sampled claims are documented. No new material.***

**Checked and present**: `+39.76 pp` within-cell discrimination → `+5.32 pp` once leakage was
corrected · the `3PM 'more' 60–65 at −4.6 pp` band error inside a ladder within ±1 pp · pooled-leg
significance **inflated 3–5×** by same-day correlation · **~100,000 training rows** against a joint
cross-product of tens of thousands of cells · **one 700 KB+ file serving ~24 logical functions across
multiple `job_key` aliases** · the `~5.3 KB` dead-stub signature with `enabled=1` · the
fan-out/exact-multiple tell · the sample-size posture table · MLB's retired orchestrator and its
4×/day cadence *(⚠ contradicted by the live code — see PASS 44)*.

### ⚠ METHOD CAVEAT — two of my own "not found" results were FALSE NEGATIVES
Two claims first appeared missing and were **both present under different formatting**:
- **`3-5x`** → the documents write **`3–5×`** (en-dash, multiplication sign), at
  `NBA_FINAL_SCORING_CALIBRATION.md` §13.
- **`700KB`** → the documents write **`700 KB`** (with a space), at `NBA_WORKERS.md`.

**Recorded because it is the blueprint's own warning, committed by this sweep**: *"a confident
negative is the easiest mistake to make."* **A literal-string grep is a weak instrument for a
negative claim**, and every *"NOT RECORDED"* in these documents rests on one.
**Standing correction to method, applied from here**: before recording a negative, **re-check with a
normalised pattern** — collapse `-`/`–`/`—`, `x`/`×`, and optional spaces inside figures — and
**prefer grepping a distinctive word from the claim over a formatted number.**
⚠ **Entries already written as "NOT RECORDED" on a numeric string alone should be re-tested under
this rule.** The ones resting on multi-word phrases or on live SQL are unaffected.

**PASS 53 IS CLEAN — 1 of 3.**

---

## FROM T1 PASS 52 — RANDOM-SAMPLE COVERAGE TEST OF THE BOLD CLAIMS *(added 2026-09-20)*
*Angle: instead of reading sequentially, **sample**. Extract all **175 bold claims** across the four
handoff documents, draw 28 at random, and grep each against the twelve documents. **Five returned
nothing; three of those are Part G/H material that postdates T1** (already an open gap, *PASS 30*).
**The other three are genuine T1 misses, and two of them bite directly on findings already in this
file.***

### ⚠⚠ THE BLUEPRINT TOLD NBA TO CHECK FOR EXISTING PATTERNS — and T1 did not
> *"**The correct pattern already existed elsewhere in the same codebase** — a downstream
> daily-context worker had already solved an analogous problem correctly… **The first, generalizable
> lesson: BEFORE BUILDING A NEW PATTERN, CHECK WHETHER AN EQUIVALENT, ALREADY-CORRECT PATTERN EXISTS
> ELSEWHERE IN THE SAME CODEBASE for a similar situation — it often does, and COPYING A PROVEN
> PATTERN BEATS INVENTING A NEW ONE.**"*

**This upgrades *FROM T1 PASS 40*.** That entry recorded the GitHub-Actions-for-network-access fix as
**prior art already in the repo** (`gbdt_training/d1_client.py`) and called the gap *"a search space
that was never defined."* **It was defined — right here, in the blueprint T1 had read in full.**
**So it is not an unthought-of gap; it is a documented instruction that was not followed**, the same
shape as blueprint §4o (*PASS 38*), the per-worker rule (*PASS 36*) and §2's ID check (*PASS 50*).
**Cost, measured**: four failed runs and **25 polling sleeps totalling 40.3 minutes** *(corrected 2026-09-20, pass 66 — see FROM T1 PASS 66)*.
⚠ **And the instruction is undocumented in all twelve documents** — so nothing would have prompted
the check on the next worker either.

### ⚠⚠ THE STANDING CHECK THAT LANDS ON THE CONFIG DRIFT
> *"**A fourth, now twice-confirmed lesson worth stating as a standing, mandatory check**: **verify
> that a backtest or analysis is actually evaluating the CURRENT LIVE coefficient or configuration
> value, not a value that has since been changed or corrected in the live system.** The same MLB
> investigation found this exact mistake **twice in one session** — once when a historical bug had
> already been fixed in the live enrichment code before the investigation started (**making a 'large
> finding' actually a description of already-resolved history**), and again when **a backtest's
> assumed factor coefficient** turned out to be stale."*

**This is the standing check for exactly the condition *FROM T1 PASS 36* measured.** NBA's config
tables are **read by nothing**, and `stat_decay_config` disagrees with the live recipe on **7 of 10
stats, 3 on the decay rate itself**. **Therefore any NBA backtest or analysis that quotes a config
value is quoting a number the engine does not use** — the precise mistake this lesson names, with the
precise consequence it names (*a finding that describes something other than the live system*).
**The lesson is undocumented; the condition is live; the two had never been connected.**
**Which NBA analyses quoted config rather than code is NOT ESTABLISHED** — the entries do not record
their source.

### ⚠ THE HANDOFF NAMED FOUR NBA-SPECIFIC FACTORS AND RANKED THEM — no document scores the prediction
Domain Mapping §2, *"where NBA research should go beyond simple porting"*:
| Predicted factor | The handoff's rationale | What happened |
|---|---|---|
| **Injury / questionable-designation status and minutes restrictions** | *"**likely the SINGLE HIGHEST-VALUE NBA-specific signal to build well from the start**"* | built as **N1** — and measured: **79% of Questionables are coin flips at the cutoff** because the Active List locks 60 min before tip |
| **Blowout risk / garbage time** | *"a real, basketball-specific risk to 'under' and total-based props"* | ✅ **one of the two non-negotiable factors that landed** — upgraded to the real market spread, **307,604 rows** |
| **Pace** | *"a much bigger, more well-established driver of counting-stat props than any single MLB environmental factor"* | **absorbed into the baseline**, not an enrichment factor — *"opponent defence, pace matchup and blowout risk all belong in the baseline"* |
| **Back-to-back / rest days** | *"much more visible, heavily-studied rest effect than MLB's… worth real investment"* | **absorbed into the baseline** via the calendar |

**Each factor is documented individually; the prediction-vs-outcome scorecard is not.**
**Why it is worth having**: the handoff's **#1 ranked pick turned out to be ~79% noise at the
decision point**, and **two of the four were answered by putting them in the baseline rather than the
enrichment layer** — which is the *"decide the factor architecture once"* choice recorded at
`NBA_FINAL_SCORING_CALIBRATION.md` §0e. **Together with *PASS 49*'s ParlayAPI finding, this is the
second case of a confident forward-looking handoff claim not surviving contact** — and the same
filter applies to the unread ~40%: **weight measured experience over forward-looking assessment.**

---

## FROM T1 PASS 51 — BLUEPRINT §1 AND §3, CLAUSE BY CLAUSE — **one minor item** *(added 2026-09-20)*
*Angle: the clause-level treatment continued onto blueprint §1 (infrastructure stack) and §3
(the four-layer pipeline). **Near-clean** — every substantive clause already has an entry.*

### ⚠ MINOR · one blueprint rule is obsolete and nothing says so
§1: *"**Legacy/reference layer**: D1 databases exist as **read-only reference only — never write new
data to D1.** If porting a table, **migrate it to Postgres first**."*

**D1 was fully decommissioned system-wide on 2026-08-12** (§T1.17). **The rule cannot be followed or
broken — there is nothing to read.** It is recorded here only so a future reader who finds the rule
in the blueprint knows it is dead, not merely unenforced. **NBA never touched D1 at any point**, so
nothing turns on it.
⚠ **It is the third document found asserting D1 as live**, after `schema_manifest.json` (*PASS 43*)
and `nba/NBA_AVAILABLE_TOOLS.md` (*PASS 46*) — **and the blueprint is the one the other eleven
documents quote as authoritative.**

### ✅ Everything else in §1 and §3 is already recorded
**§1** — the Hyperdrive connection options **`max: 3`, `fetch_types: false`, `prepare: false`** and
why each matters · the deploy pipeline and *"**never hand-edit a wrangler config expecting it to
survive, it will be silently overwritten**"* · the MCP bridge's *"build this first"* ranking · the
Gemini proxy · ParlayAPI's key in `external_credentials`.
**§3** — the four-layer order, the **Board-before-Daily-Context ordering bug** with its
`VALID_ZERO`/`NOT_APPLICABLE` symptom, `context_probe_*`, `archive.market_prop_context_history`, the
matrix builder, and the **PRIMARY/REVIEW** final-board split. All in `NBA_SYSTEM_DESIGN.md` §0.7 and
`NBA_SYSTEM_ARCHITECTURE.md` §2c.

---

## FROM T1 PASS 50 — ⚠⚠ TWO ID CONVENTIONS: THE SCORING LAYER DOES NOT JOIN TO THE REFERENCE LAYER *(added 2026-09-20)*
*Angle: blueprint **§2** (read clause by clause, as pass 49 did for Domain Mapping) contains a
standing instruction that **is NOT RECORDED as ever having been carried out**. This pass carries it
out. All figures **VERIFIED by live SQL 2026-09-20**.*

### The instruction, verbatim
> *"**Use ONE canonical ID format from day one** (MLB had a real, multi-table bug from **mixing bare
> numeric team IDs with a prefixed format like `mlb_133`** — **GREP FOR FORMAT INCONSISTENCY
> PROACTIVELY, don't wait for it to surface as a downstream symptom**). For NBA, decide the ID
> convention (e.g. **`nba_<team_id>`**) before writing the first table and **apply it everywhere**."*

### ✅ What passes — the type discipline is perfect across all 85 tables
**VERIFIED**: every `team_id` (20 columns) and `player_id` (28 columns) and `game_id` (20 columns) is
**TEXT**; every `nba_team_id` (6) and `nba_player_id` (10) is **BIGINT**. **Zero type inconsistency.**
The two-column pattern — a canonical TEXT id plus the raw stats.nba.com BIGINT — is deliberate and
applied without exception. **`nba_ref.teams.team_id` is `nba_1610612737`** — **the blueprint's
suggested `nba_<team_id>` convention, exactly.**

### ⚠⚠ What fails — the VALUES split into two conventions along a layer boundary
| Layer | `player_id` value format | Rows | Prefixed |
|---|---|---|---|
| **`nba_ref.*`** — reference | **`nba_<id>`** | `players` **582** | **582** |
| **`nba_stats.*`** — stats | **`nba_<id>`** | `player_game_log` **79,358** | **79,358** |
| **`nba_score.*`** — scoring | **bare numeric** | `baseline_history` **19,343,348** · `final_hp` **19,215,200** · `baseline_ladder` **206,237** · `board_scored` **110,955** · `availability_delta` **4,274** | **0 · 0 · 0 · 0 · 0** |

**Measured directly on the live database:**
```
nba_score.board_scored rows                                  110,955
  joining nba_ref.players ON player_id = player_id                 0
  joining nba_ref.players ON 'nba_'||player_id = player_id   110,955   (100%)
```

**A direct `JOIN nba_ref.players USING (player_id)` from any `nba_score` table returns ZERO rows** —
silently. An inner join drops every row; a left join NULL-fills every row. **The data is complete and
correct on both sides; only the key format differs.**

### Severity: latent, not actively broken — but it is exactly MLB's documented bug
**✅ Nothing is currently wrong.** The scoring path joins **score → score** (`score_board_legs.py`
merges `board` against `nba_score.baseline_ladder` on `player_id`), and **both sides are bare
numeric**, so it works. **Each layer is internally consistent.**

**⚠ What it costs, and why it belongs on this list:**
1. **Any join from the scoring layer to the reference layer fails silently** — a player's name, team,
   position, or alias cannot be attached to a scored leg by `player_id` without a string transform
   that **exists nowhere in the schema and is documented nowhere.**
2. **It is the blueprint's named bug class, reproduced.** MLB's version — *"mixing bare numeric team
   IDs with a prefixed format like `mlb_133`"* — is described as *"a real, multi-table bug."*
   **NBA has the same split, just cleanly divided by layer rather than scattered.**
3. **The proactive check the blueprint demanded was never run.** It is **one query**, and the
   instruction was *"don't wait for it to surface as a downstream symptom."*
4. **SEASON-START RELEVANT**: `board_scored` is **P3's live daily output**. The first thing anyone
   builds on top of it — a UI feed, a slip builder, a report joining legs to player names — **hits
   this boundary.**

**⚠ Which convention is correct is NOT ESTABLISHED and is flagged for human decision, not resolved
here.** The reference/stats layers follow the blueprint's stated convention; **the scoring layer
holds 38.7M+ rows in the other one.** Recorded with both sides so the decision can be made from this
file alone.

---

## FROM T1 PASS 49 — DOMAIN MAPPING §1 AND §3, CLAUSE BY CLAUSE *(added 2026-09-20)*
*Angle: pass 31 swept the Domain Mapping document **by section**, and marked §1 and §3 "documented"
without reading their clauses. **This pass reads both tables row by row.** Source:
`nba/NBA_DOMAIN_MAPPING_AND_STARTUP_PLAN.md` §1 and §3 — **in the repo as clean markdown**, cheaper
than the escaped copy in T1.*

### ⚠ THE PACKAGE'S SINGLE STRONGEST STATED ADVANTAGE IS THE ONE THING NBA REPLACED
§3 describes ParlayAPI as:
> *"Same service, same account, `basketball_nba` sport key. **No new vendor onboarding needed — this
> is the SINGLE BIGGEST HEAD START NBA HAS over where MLB started.**"*

**It was superseded by NBA's own scrapers**, which capture **~25% more ladder rungs**
(`NBA_SYSTEM_ARCHITECTURE.md`). **And it was never independently verified** — the ParlayAPI coverage
gap was flagged in T1, carried forward, and **closed by replacement rather than by test** (recorded
at *PASS 32*).

**Recorded because of what it implies about the rest of the package, not as a criticism of it**: the
handoff's most emphatic claim was **an inherited assumption about a vendor**, and it did not hold.
**Its claims that did hold — the deploy gotchas, the statistical standard, the bug families — are the
ones grounded in MLB's own measured experience.** ⚠ **A useful filter for the ~40% of
`ALPHADOG_DOS_AND_DONTS.md` and `ALPHADOG_SYSTEM_MAP.md` still unread** (*PASS 37*): **weight
measured experience over forward-looking assessments.**

### ⚠ NOT RECORDED · combo props were to be first-class **from day one**, and why
§1, on the MLB→NBA prop mapping:
> *"NBA has real combo props (**PRA** etc.) already confirmed to exist on ParlayAPI's market-key list
> — **treat these as a FIRST-CLASS PROP FAMILY FROM DAY ONE, NOT AN AFTERTHOUGHT**, since MLB's own
> combo prop (`hits_runs_rbis`) caused **real analysis headaches from being treated as a bolt-on**."*

**`NBA_DATABASE.md` records the `hits_runs_rbis` bolt-on cost. The design instruction it produced is
recorded nowhere** — and it belongs with the combo design in `NBA_BASELINE_CALIBRATION.md` §7, which
documents *how* combos are built (simulated from calibrated marginals with per-player covariance) but
not *that building them properly from the start was an explicit, cost-justified instruction.*
**✅ It appears to have been followed** — the combo layer is architectural, not bolted on — **but no
entry connects the instruction to the outcome.**

### ⚠ OPEN VERIFICATION · per-prop tier spacing was to be checked and is NOT RECORDED as checked
§1, on goblin/demon:
> *"Confirm these exist identically for NBA on each platform… very likely yes, since it's a
> platform-level mechanic, not sport-specific, **but verify TIER-COUNT and TIER-SPACING CONVENTIONS
> PER PROP before assuming they match MLB's exactly.**"*

**`NBA_GOBLIN_DEMON.md` §10 records that the prediction was right** — the taxonomy does exist for
NBA. **It does not record the per-prop verification the same sentence asks for.** §7's measured
result — *"books ladder to **~85–90% of the anchor**"*, from **60k+ board legs** — **is an aggregate
across props**, and §5.0's own standing rule is *"read these per cell, not as aggregates."*
**So the instruction and the layer's own rule agree, and the measurement is still pooled.**
**NOT RECORDED as done per prop.** ⚠ Compounds with lesson **#27** (*PASS 30*): **tier spacing per
prop and partial-credit structure per platform are both unverified**, and both are first-order
inputs to Flex EV.

### ✅ Verified present, no change needed
§3's *"verify rate limits and terms of service before building a scraper-dependent pipeline"*
(BallDontLie's terms are recorded) · the **no pitcher-analogue** simplification (*"all NBA props are
offense-side player stats"*) · the Baseball-Savant-to-tracking deprioritisation · the
*"verify each platform's own fantasy-score formula explicitly, per lesson #14"* instruction.

---

## FROM T1 PASS 48 — FULL SEQUENTIAL NARRATIVE READ, ALL 85 BLOCKS *(added 2026-09-20)*
*Angle: extract **every assistant narrative block in T1 in order** — 85 of them, excluding the pasted
documents and tool payloads swept in passes 29–47 — and check each against the twelve documents.
**This is the method passes 26–28 used**, re-run now that the embedded documents have actually been
swept.*

### 📊 THE FULL SCALE, COUNTED CORPUS-WIDE 2026-09-21 (T6 pass 4) — 17 instances, not one
*The correction below is right about the fact and understates the cost by an order of magnitude.*

| Wrong name | Instances |
|---|---|
| `Alphadog Bridge:github_str_replace` | **10** |
| `Alphadog Bridge:str_replace` | 2 |
| `Alphadog Bridge:github_patch_str_replace` · `:memory_append` · `:memory_write` · `:memory_read` | 1 each |
| `mcp_alphadog_bridge_mcp_alphadog_bridge_run_sql` | 1 |
| **17 instances · 7 distinct wrong names · across 7 of 20 transcripts** | |

Spread: T1 (1) · T2 (2) · T4 (5) · T5 (2) · T6 (4) · T7 (2) · one 2026-09-20 session (1).
**Not a quirk of one chat — a recurring cost across the project's whole history.**

**Two different mistakes share the one error message:**
1. **Server label prefixed onto a real tool name** — 14 of 17 (`Alphadog Bridge:memory_read`).
2. **A tool invented that never existed** — 3 of 17. **`github_str_replace` alone is 10 of the 17**,
   so **a mandated document naming a non-existent tool cost real attempts in at least four separate
   sessions.**

### ⚠ CORRECTION · **`github_str_replace` does not exist, and a mandated document listed it**
`NBA_SYSTEM_ARCHITECTURE.md` listed `github_str_replace` among the bridge's GitHub tools.
**T1 attempted the call and the bridge rejected it:**
> *"**Tool 'Alphadog Bridge:github_str_replace' not found. Did you mean: `str_replace`? Use the exact
> name shown here.**"*

**`str_replace` is the SANDBOX file tool** — it edits a local file in the container and **cannot
touch the repo.** A different tool with a confusingly similar name. **Confirmed twice**: by that
error in T1, and by the live bridge's own tool list, which has no such entry.
**The repo write tools are `github_put_file` and `github_patch_file` only.** Corrected in place.

### ⚠ NOT RECORDED · a repeatable `github_patch_file` validation error
T1 hit this **twice**:
> *"**MCP error -32602: Input validation error: Invalid arguments for tool `github_patch_file`:
> Invalid input: expected string, received undefined at path**"*

**An omitted required argument fails at the MCP validation layer, not in the patch itself** — so the
file is untouched and nothing is half-written. **Worth knowing**: the error names the *argument
type*, not the argument, so the fix is to re-check that `path`, `old_str`, `new_str` and `message`
are all present. Recorded because **`github_patch_file` is the primary write tool for this entire
documentation effort.**

### ✅ The remaining 83 blocks map to existing entries
The narrative arc — recon → separate-universe correction → schema creation → first worker → deploy
script patches → the Cloudflare block → debug route → canonical headers → 520 → probe mode → every
nba.com domain blocked → PrizePicks scraper pattern found → GitHub Actions scraper → trigger-tool
limitation → trigger-file invention → 30s timeout → retries → proxy (rules out IP blocking) → TLS
fingerprinting → `curl_cffi` → empty `abbreviation` → static map → wire the Worker to the committed
file — **is fully documented across `NBA_RECIPE.md` STEP 3–6, `NBA_SYSTEM_ARCHITECTURE.md` §6–§7 and
`NBA_MASTER_SUMMARY.md` §T1.5–T1.9.** Spot-checked details all present: **403/520/526**, the tarpit
diagnosis, the proxy test, the fixed-tool-list constraint, the `ID→abbreviation` map.

### ⚠ A METHODOLOGICAL NOTE ON WHAT "CLEAN" MEANS — recorded so the count stays honest
**Passes 44–47 found their material by verifying against the live code and database, not by reading
T1.** That work is valuable and is required by rule 5.1 — **but it is not what the three-clean-pass
rule measures.** The rule asks whether **the transcript** still yields new material.

**Kept separate from here on**: a pass counts toward the clean streak **only if its angle is a read
of the transcript.** A live-verification pass that finds a documentation gap **unrelated to anything
T1 says** — such as the 17 missing table entries at *PASS 47* — **is recorded, dated, and does not
reset the streak**, because the gap it found is not T1's content. **Pass 48 is a transcript read and
it found two items, so the streak stays at 0.**

---

## FROM T1 PASS 47 — WHOLE-UNIVERSE DIFF OF THE LIVE SCHEMA AGAINST `NBA_DATABASE.md` *(added 2026-09-20)*
*Angle: blueprint §9 technique 1 — *"diff the live config against the real logic for **every entry**
at once"* — applied to **the database** rather than to config. T1's DDL block (lines 11000–14000)
created the skeleton; **this pass lists every live NBA table and diffs it against the document whose
mandate is "a comprehensive complete list of all tables and columns."* All VERIFIED by live SQL
2026-09-20.*

### ⚠⚠ **17 of the 85 live NBA tables are absent from `NBA_DATABASE.md`** — 20% of the schema
**85 base tables exist across 14 `nba_*` schemas.** These seventeen appear nowhere in the catalogue:

| Schema | Missing tables |
|---|---|
| `nba_calendar` | **`games`** — ⚠ *quoted elsewhere in the documents as **2,666 games** and used as the dynamic-trigger input, yet it has **no entry** in the table catalogue* |
| `nba_config` | **`variation_bands`** (documented as **25 rows** in other repo files, **not** in this one) |
| `nba_market` | `board_backfill_log` · **`board_tiers_v2`** *(documented in `NBA_GOBLIN_DEMON.md`, absent here)* · `game_lines_snapshot_log` · `schedule_norm` |
| `nba_score` | `absence_panel_teams` · `redistribution_factors` · `scenario_calibration` · `tier_band_calibration` · `tier_selection_value` |
| `nba_stats` | `player_game_log_advanced` · `player_onoff_profile` · `player_playtype_profile` · `player_tracking_detail` |
| `nba_team` | `playtype_profile` · `team_game_log_advanced` |

**Several are not obscure**: `nba_calendar.games` is the calendar the whole pipeline schedules
against; `board_tiers_v2` is the corrected goblin/demon taxonomy; `scenario_calibration` and
`tier_band_calibration` are calibration outputs. **They are documented in *other* files — the
catalogue is what lacks them**, which is the failure mode the twelve-document split exists to
prevent.

### ⚠ **6 of the 14 NBA schemas hold ZERO tables** — created in T1, never populated
**VERIFIED by live count:**

| Schema | Tables |
|---|---|
| **`nba_archive`, `nba_backtest`, `nba_classification`, `nba_context`, `nba_daily`, `nba_scoring`** | **0** |
| `nba_calendar` | 1 |
| `nba_control` | 2 |
| `nba_team` | 9 |
| `nba_config` · `nba_market` | 11 each |
| `nba_ref` | 14 |
| `nba_score` | 18 |
| `nba_stats` | 19 |

**All fourteen were created in one `CREATE SCHEMA IF NOT EXISTS` statement in T1** — mirroring MLB's
schema list — **and six were never used.** This is exactly the *"tables planned and never created"*
the owner's mandate for this documentation asks to be recorded, **and it had not been.**

**What it tells you**: the schema skeleton was **mirrored from MLB's shape, not derived from NBA's
needs.** Several of the six have live equivalents **under a different name** — backtest work lives in
`nba_score.*` and in the repo's `backtest/` directory, not in `nba_backtest`; classification output
lives in `nba_score.baseline_*`, not in `nba_classification`. **So the empty schemas are not missing
functionality; they are a naming layer that was never adopted.**
⚠ **The risk is a future reader assuming otherwise** — searching `nba_classification` for the
classifier's output and finding nothing. **Flagged; not fixed** (dropping them is a write).

---

## FROM T1 PASS 46 — `run_job` HAS 14 MODES AND THE TOOL DOC IS STALE *(added 2026-09-20)*
*Angle: T1's four `run_job` calls, read as an API surface rather than as events, then **the live
bridge `alphadog-v2-admin-sql.js` grepped to enumerate the whole surface**. All VERIFIED 2026-09-20.*

### T1's four dispatch calls — the observed grammar
| Call | Meaning |
|---|---|
| `{"job":"run","target":"NBA_STATIC_TEAMS_WORKER"}` ×2 | direct worker call |
| `{"job":"probe-sources","target":"NBA_STATIC_TEAMS_WORKER"}` | **a second per-worker mode** |
| `{"job":"trigger","target":"CONTROL_ROOM"}` | the queue path |

**`run_job` takes a `job` mode as well as a `target`. The twelve documents recorded only `target`.**

### ⚠ THE SURFACE IS 14 MODES — 13 of them appear in none of the twelve documents
Full table in `NBA_SYSTEM_ARCHITECTURE.md` §3b. **Three write into NBA tables**:
**`odds_api_board_backfill`** → `nba_market.board_snapshots` (*"credits_per_snapshot: 10 × markets ×
regions"*) · **`parlay_game_lines_backfill`** → `nba_market.game_lines_closing` (*"one closing-odds
call per date (10 credits)… chunk by month per call (the worker's wall-time budget); the caller loops
months"*) · **`betr_board_pull`** (`leagues` defaults to `["MLB","NBA"]`; token is the owner's
**Keycloak** access token sent **raw**, from `external_credentials.betr_access_token`).

### ⚠⚠ `worker_invocation_logs` — the diagnostic nothing in the record has ever used
> *"Cloudflare's GraphQL Analytics API (**`workersInvocationsAdaptive`** dataset) records the actual
> outcome of **every** Worker invocation — including **`exceededCpu`, `canceled`, `exception`,
> `scriptNotFound`** — which lets us confirm or rule out **a platform-level kill**."*

**This is the missing half of every "reported green, produced nothing" investigation in this file.**
It separates **a worker that failed** from **a worker never invoked** from **a worker Cloudflare
killed** — and **it has never been run against an NBA worker in the record.**
**Directly applicable to two open items**: the **weekly differential worker, built but never
scheduled** (its three log tables empty — *was it never invoked, or invoked and killed?*), and the
**`FE_DATE` destructive run** (*what actually invoked `build_final_hp.py` with `FE_WRITE=1`?*).
**SEASON-START RELEVANT** — it is the only tool that can answer "did the platform kill it."

### ⚠ `nba/NBA_AVAILABLE_TOOLS.md` IS STALE ON TWO COUNTS
1. **Its `run_job` target enum lists 12 MLB targets and ZERO NBA** — yet **the live bridge routes 21
   NBA bindings** (`NBA_STATIC_TEAMS_WORKER` … `NBA_BASELINE_LADDER_WORKER`), and
   `NBA_STATIC_TEAMS_WORKER` was wired and successfully invoked **later in T1 itself**. The document
   records the *pre-wiring* state as if current.
2. **It documents `run_sql` against twelve D1 databases** — `CONTROL_DB`, `CONFIG_DB`, `REF_DB`, … —
   **decommissioned system-wide 2026-08-12.** The file even notes all twelve bindings report
   `false`, then describes the tool as usable *"if you confirm it reaches real data."*

**This is the THIRD stale-manifest instance found in this sweep**, after `schema_manifest.json`
(*PASS 43*) and `NBA_PROJECT_LOG.md`'s missing founding entry (*PASS 42*) — **and the second that
describes the dead D1 backend as live.** Blueprint §5b, again, in the NBA folder this time.

### ⚠ `probe-sources` is a per-worker mode the mode-dispatch table does not list
The live bridge routes `job: "probe-sources"` to **`https://internal/probe-sources`** for **all 21
NBA bindings**, with the default path otherwise. **`NBA_WORKERS.md`'s mode-dispatch table does not
carry it.** The code's own note on the NBA branch:
> *"NBA expansion (additive only). Same direct-call pattern as `BASE_HITTER_GAME_LOGS_WORKER` —
> **bypasses `control_job_queue` + orchestrator entirely (NBA has no orchestrator by design)**."*

**That sentence is the owner's no-orchestrator rule implemented in the dispatch layer** — a fourth
independent record of it, after the owner's message, the blueprint, and `ORCHESTRATOR_CRONS = []`.

---

## FROM T1 PASS 45 — THE ARTEFACTS T1 WROTE, AND WHERE T1 ACTUALLY STOPS *(added 2026-09-20)*
*Angle: the **write** calls in T1's tail (lines ~40000–43895) — `github_put_file`,
`github_patch_file` — read as a list of artefacts, then **each verified against the live repo**.*

### ⚠ THE PROVENANCE LAYER NOBODY DOCUMENTED — `*_meta.json` sidecars
**VERIFIED on the live repo**: `nba/data/` holds **223 files**, of which **41 are `*_meta.json`
sidecars**. Their shape, from `nba/data/nba_teams_current_meta.json`:
```json
{ "fetched_at": "2026-09-14T15:49:33Z",
  "source_url": "https://stats.nba.com/stats/leaguestandingsv3?LeagueID=00&Season=2026-27&SeasonType=Regular%20Season",
  "http_status": 200, "team_count": 30, "error": null }
```
**This is the provenance layer of the entire data pipeline and it appears in none of the twelve
documents.** It carries exactly what a verifier needs — **when, from where, what status, how many
rows, and whether it errored** — and it is what makes the standing discipline *"read the committed
file, not the scraper's own claim"* (`NBA_RECIPE.md` STEP 6) actually checkable.

**⚠ And its coverage is partial: 41 sidecars for 223 files — roughly one in five.** **NOT RECORDED
as a decision.** Whether the other ~180 files are outputs that need no provenance (derived artefacts,
shards of a sharded backfill) or scrape outputs that simply never got one is **not established.**
**The season-start consequence**: for a file without a sidecar there is **no committed record of when
it was fetched or whether the fetch succeeded** — the freshness question has to be answered from
workflow logs, which **expire** (*FROM T1 PASS 40*).

**Also recorded from that sample, as a current-state fact**: the live teams file was fetched
**2026-09-14** for **`Season=2026-27`**, `http_status: 200`, `team_count: 30`.

### ⚠ T1 DOES NOT END WITH A WORKING LOOP — it ends mid-verification
**T1's final assistant message, verbatim, is the last thing in the transcript:**
> *"**In progress right now:** the updated worker just finished deploying. **I still need to actually
> trigger it via `run_job` and re-verify against Postgres** that it…"*

**The transcript stops there.** **Everything the documents record about T1's end-to-end loop being
closed and verified happened in T2** — `NBA_RECIPE.md` STEP 6 is already titled *"Close the loop, and
verify it properly **(T1 → T2)**"*, which is correct; **what was not recorded is that T1's own last
state is an unverified deploy.**

**Why this matters beyond bookkeeping**: T1's closing summary asserts the hard problem is solved —
*"Switched to `curl_cffi` (Chrome TLS impersonation) — **worked immediately**. Real `stats.nba.com`
data, HTTP 200, all 30 teams, verified against the committed file"* — **and that claim is about the
GitHub Actions scrape, not about the worker writing to Postgres.** The two are separate steps and
**only the first is verified inside T1.** **This is precisely the distinction blueprint §8 insists
on**: *"before declaring any bug fixed, verify against real data."* **T1 draws the line correctly and
in the right place; the documents had collapsed the two steps into one.**

### The artefacts T1 created, each verified present in the live repo
`nba/scrape_nba_stats_teams.py` · `.github/workflows/nba-scrape.yml` ·
**`nba/TRIGGER_NBA_SCRAPE.txt`** (the first trigger file — the pattern later replicated as
`TRIGGER_NBA_BACKFILL.txt`, `TRIGGER_NBA_BASELINE.txt` and eleven more) ·
`nba/data/nba_teams_current.json` · **`nba/data/nba_teams_current_meta.json`** ·
`nba/alphadog-v2-nba-static-teams.js` · `nba/worker_manifest_nba.json`.

---

## FROM T1 PASS 44 — THE DEPLOY GENERATOR'S OWN SOURCE, READ AND VERIFIED LIVE *(added 2026-09-20)*
*Angle: `generate_wrangler_configs.py` is pasted into T1 (lines ~16400–18400). **Read it as source
code and check every constant against the live file.** All figures below are **VERIFIED by grep of
the live `generate_wrangler_configs.py` 2026-09-20**, so they are stated in full.*

### ⚠⚠ CONTRADICTION · the MLB run cadence in the documents disagrees with the live code
| Source | MLB master-run schedule |
|---|---|
| **The blueprint**, quoted at `NBA_SYSTEM_DESIGN.md` §0.9 | *"currently **4× daily: 1am, 9am, 1pm, 5pm Pacific** for MLB"* |
| **`generate_wrangler_configs.py` line 30, live** | `MASTER_RUN_BASE_TIMES = ["16","20","0","5","9"]` — **`# 9am/1pm/5pm/10pm/2am PT`** — **FIVE windows** |

**Not a rounding difference**: the code has **five** runs, the blueprint **four**, and the overnight
slot differs (**2am** in code, **1am** in the blueprint). The code carries its own reason:
> `# closes the ~11-hour overnight gap the previous 3-time schedule left even when Cowork ran normally.`

**So the blueprint's figure appears to predate a documented schedule change.** **Flagged, not
resolved** — but note the standing precedence rule: **execution history and live code outrank config;
config outranks static manifests and documents.** **By that rule the live generator is right and the
blueprint is stale.**
⚠ **This propagates into an NBA-facing comparison.** `NBA_SYSTEM_DESIGN.md` §0.9 builds a table —
*"MLB's four daily windows … worth comparing to NBA's three"* — **on the blueprint's number.** With
five MLB windows the comparison changes: **MLB's 10pm PT slot has no NBA counterpart at all**, and
NBA's P2 at 01:00 PT sits between MLB's 10pm and 2am rather than matching a 1am run.

### ✅ VERIFIED · the orchestrator is retired, from the code rather than from the handoff
`generate_wrangler_configs.py` line 25:
> `ORCHESTRATOR_CRONS = []  # Retired: board/daily-context/market/scoring (via master-runner),`
> `# weekly-differential-runner, and daily-delta-runner now own all real scheduling. The`
> `# orchestrator itself is fully retired - kept deployed only for any manual/direct-call debugging`
> `# via its own service binding, never self-triggered again.`

**The documents record this from the blueprint; this is the primary source.** Two details the
blueprint's version does not carry: **the orchestrator is still deployed** (for manual/direct-call
debugging via its service binding), and **three named runners own all real scheduling.**

### ⚠ NOT RECORDED · the four wiring steps have DIFFERENT deploy blast radii
`NBA_WORKERS.md` §0 requires every worker to be registered in four places. **The generator's own
comments show those edits are not equivalent:**
> `# generate_wrangler_configs.py is intentionally NOT in GLOBAL_REDEPLOY_FILES. It gets edited`
> `# routinely just to register a single new worker … and that should only redeploy the worker(s)`
> `# actually affected - not force a full-fleet redeploy of 140+ workers every time.`
> `# worker_manifest.json changes … already correctly trigger a targeted deploy of that new worker`
> `# plus the orchestrator via TARGETED_EXTRA_FILES below.`

| Edit | Blast radius |
|---|---|
| a file in **`GLOBAL_REDEPLOY_FILES`** | **full-fleet redeploy — 140+ workers** |
| **`generate_wrangler_configs.py`** | deliberately excluded → only the affected worker(s) |
| **`worker_manifest.json`** (via `TARGETED_EXTRA_FILES`) | targeted: the new worker **+ the orchestrator** |

**140+ workers is the fleet size** — a figure recorded nowhere in the twelve documents.
**Why it matters for NBA**: the four-step pattern is performed for **every** new NBA worker, and
**the cost of each step is different.** An edit that lands in `GLOBAL_REDEPLOY_FILES` by accident
redeploys the entire MLB fleet — **the loudest possible violation of *"must not edit anything from
the mlb system."***

### ⚠ NOT RECORDED · an NBA-specific path special-case in the generator, with a named failure
Live, lines 45–51:
> `if worker_name.startswith("alphadog-v2-nba-"):`
> `    # The generated config for an NBA worker is written to nba/wrangler.<worker>.jsonc`
> `    # "main" relative to that same nba/ directory - it must NOT be re-prefixed with "nba/"`
> `    # here or wrangler looks for nba/nba/<worker>.js and fails ("entry-point file ... not found")`

**A real, named deploy failure mode with its exact error string**, and the `startswith` guard that
prevents it — **the same guard recorded elsewhere as the MLB-isolation mechanism, here doing a second
job.** Not previously documented as a path-resolution rule.

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
T1 reached them through **four failed runs and 25 polling sleeps — 40.3 measured minutes**.
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
**two syntax checks, two `cat`s, and TWENTY-FIVE polling sleeps** *(corrected 2026-09-20, pass 66)* — `sleep 30, 40, 45, 50, 55, 60, 70,
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
each whether its scope matches its caller's. Full inventory in `NBA_WORKERS.md` §0e — *pointer corrected 2026-09-20, pass 74; it previously read §8, which does not exist* — delete semantics
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
generations of rows coexisting** *(`run_at` is `timestamptz` — all three values **UTC**; re-verified
live 2026-09-21 at §T9.46a: **34 · 5 · 21 rows**, still coexisting)*: `verify_confidence`'s own at
**2026-09-17 18:16**, mondrian's at
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

## ⚠ SEASON-START CRITICAL — items that bite on or before **2026-10-20**
> 🔴 **Heading corrected 2026-09-21 (§T10.18b) — it read *"on or before 2026-10-03"*.** The regular
> season opens **2026-10-20**; 10-03 is **preseason** (prefix 001, 66 games, 10-03→10-16), verified
> live in `nba_calendar.games`. **Every deadline in this section keyed to 10-03 is 17 days early.**

### ⓪ GOOD NEWS FIRST — **the season-opening coverage problem is already SOLVED**
`classification_ladder_v12.py` carries **cross-season carryover** (*"season-opening study
2026-09-09"*). Without it, *"**the opening month has ZERO projections and November only 62%
coverage**"* — because within-season rates need 3 games and the minutes role needs 5.
**With it: October 85%, November 90%.** Minutes role and rate EWMA are carried at the player level, and
carried evidence counts as `CARRY_N` games at the boundary.
**Controlled by `BT_CARRY`, default `"1"`.** ⚠ **If a replay ever sets `BT_CARRY=0` and it is left
off, opening month produces nothing.** Worth an explicit assertion in the P2 certifier.

### ① THE DIFFERENTIAL WORKER HAS NOT RUN SINCE 2026-09-02
*(⚠ date corrected 2026-09-21 by §T9.35a — this heading read **2026-09-03**. The authority is the
snapshot timestamp, and all three snapshots read **`2026-09-02 19:47` UTC**. The 09-03 date belongs to
a different table, `nba_ref.players` at `2026-09-03 18:14` — the last day of the build window.)*
**Re-verified live 2026-09-21**: all three `*_differential_log` tables are **still 0 rows**;
`player_roster_snapshot` holds **582 rows, `team_roster_snapshot` 30, `official_roster_snapshot` 80,
all frozen at `2026-09-02 19:47` UTC.** *(This previously read "frozen 17 days ago" — **an elapsed-day
figure ages every day it is not rewritten**; the date is stated instead.)*
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
~~**Low impact** (P1 runs Mondays; 2026-10-01 is a Thursday)~~ 🔴🔴 **SUPERSEDED 2026-09-21 (T7 passes
22–25) — see the re-rated entry at the top of this file.** This item measured the window against
*"opening night is 2026-10-03"*, **which is the PRESEASON opener**. Against the real regular-season
opener of **2026-10-20** the window is **nineteen days, not two**, it contains **three Mondays
(Oct 5, 12, 19)**, and **six scheduled runs** land inside it — so the very argument used here for
"low impact" now argues the opposite. The write is also worse than *"pulls empty aggregates and
writes them"*: the target tables have **no season in the primary key** and the writers **upsert**,
so the empty aggregates **replace** last season's real rows, under a **hardcoded `'2025-26'`** label.
**but the fix is trivial**: the real opening
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
| **CONFIGURED, NOT YET RUN** | **`turnovers` · `fga` · `fg3a` · `ftm` · `personal_fouls`** — ⚠ *`fga` restored 2026-09-21 by §T9.35b: this row dropped it. The authority is the module docstring, **line 11**: "turnovers/fga/fg3a/ftm/personal_fouls: configured, NOT yet run." **TWO of these five are called certified elsewhere** *(extended §T9.36a)*: **`fga`** — line 11 here versus its own inline `# CERTIFIED both seasons (0.9 / 1.3, 0 band misses)` at line **103** *(corrected from 102, §T9.42c)*, **a contradiction inside the file** — ✅ **and `git blame` settles which is older (§T9.42a, UTC per §T9.44a): line 11 is `e0e49be1`, **2026-09-09 04:57:30 UTC**; line 103 is `98dcccb1`, **05:55:07 UTC — 58 minutes later**; the T9 session (`2026-09-09-22-10-00`) is later than both. The header is the stale statement.** — and **`ftm`**, which has **no inline certification marker** but is named in the **owner's T9 certified six** (`points, rebounds, assists, 3PM, FGA, FTM`), **a contradiction between the file and the record**. **Which governs is NOT RECORDED; line 11 carries no date.*** |
| **NOT YET CERTIFIED** | **`fgm` · `fta` · `oreb` · `dreb`** — ⚠ *`oreb` and `dreb` added 2026-09-21 by §T9.35c: the `# ADDED 2026-09-12 … NOT yet certified` comment governs **the last four entries of `PROPS`** (lines 109–112), not two. **And `oreb` and `dreb` are two of the four props §T9.19c found missing from `prop_taxonomy`, both shipping ladder rows** (`oreb` 3,185, `dreb` 4,315).* — *"ADDED 2026-09-12 (owner: the live PrizePicks menu carries these). **Configs are the closest certified analogue; NOT yet certified** — the first history run prints the band tables."* |

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
| **`fgm`, `fta`, `oreb`, `dreb`** *(§T9.35c — the group is four)* | NOT YET CERTIFIED | ✅ all four are box-score columns |
| **`turnovers`, `fga`, `fg3a`, `ftm`, `personal_fouls`** *(§T9.35b — `fga` restored)* | CONFIGURED, NOT RUN | ✅ box-score columns |
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

**NBA's uncertified props sit on the main path.** **`fgm`, `fta`, `oreb` and `dreb`** carry *"configs
are the **closest certified analogue** — NOT yet certified"* — i.e. **a certified prop's thresholds
assigned by analogy**, marked only by a code comment. *(⚠ `oreb`/`dreb` added 2026-09-21, §T9.35c —
the comment governs the last four `PROPS` entries, and those two are also missing from
`prop_taxonomy`.)*

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
**`nba_stats.player_career_season_totals` is cumulative; `player_game_log` is per-game.** *(🔴 the
table name here read `nba_stats.player_career_totals`, which does not exist — corrected 2026-09-21,
§T10.22b. It is the same table this item is about, so the wrong name made the item unqueryable.)*

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
player_roster_snapshot   582 rows   ← frozen since 2026-09-02 19:47 UTC  (corrected §T9.35a)
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
3. Its snapshot baseline is from **2026-09-02 19:47 UTC** *(corrected from 2026-09-03, §T9.35a)* and is now stale by the whole off-season.

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

### 🔴 THIS TRAP HAS A SECOND, UNCAUGHT INSTANCE — the failure class, not the endpoint, is the problem
*Connection drawn 2026-09-21, T5 re-sweep pass 1. Detail: `NBA_MASTER_SUMMARY.md` §T5.16a.*

The v2 trap below was caught because the loss was **97%** and obvious against an expected magnitude.
**T4's career-totals scraper has the identical defect and was never noticed** — because its loss was
**one player in 582**.

| | T5, starter status | T4, career totals |
|---|---|---|
| Endpoint behaviour | HTTP 200, zero rows | HTTP 200, zero rows |
| Error raised | none | none |
| Reported as | 1,228/1,230 games "succeeded" | "582 players succeeded" (`len(players) - len(errors)`) |
| Actually obtained | **799 rows / 31 games** | **3,644 rows / 581 players** |
| **Noticed** | **yes** | **no — 18 days, until this sweep** |

**The lesson generalises past both endpoints**: *a source that can return a well-formed empty result
makes "no error" meaningless as a success signal.* **All four guard shapes in this codebase test the
aggregate** (count floor, completeness, null-value, per-dataset minimum) — **none asks the per-item
question: did every input produce at least one output row?** That check costs one comparison and
catches both instances.

### 🔴 A FOURTH INSTANCE, AND THE ONLY ONE WHOSE ROOT CAUSE IS OUR OWN CODE
*Added 2026-09-21, T6 re-sweep pass 2. **`[LIVE-AUDIT]` VERIFIED** at
`nba/scrape_nba_game_officials.py` lines 98–107, comment intact.*

```python
# a game with genuinely zero officials returns ([], "some_error_string") from fetch_game -
# checking "rows is not None" treats an empty list as success (since [] is not None),
# silently swallowing the error and dropping the game from output with zero record of it.
if rows:                      # fixed: truthiness
    all_rows.extend(rows)
else:
    errors.append({"game_id": game_id, "error": error or "empty_rows"})
```

**`[] is not None` is `True`.** The original sentinel check accepted an empty list as success **and
discarded the error string that came with it** — three games disappeared from a 1,230-game run with
nothing recording their absence.

**The other three instances are endpoint behaviour; this one is ours** — and it is the most portable
form of the lesson: **a sentinel check (`is not None`) applied to a collection that can legitimately
be empty is this same defect in miniature. Test the collection, not the sentinel.**

✅ Fixed in the scraper *and* recovered by a targeted 3-game patch rather than a 1,230-call re-run.
*(Recovery was partial — 1,227/1,230 loaded. The bug hid the three games; it did not cause them.)*

⚠ **T5 diagnosed this and wrote it up as the worst failure mode in the project; the earlier scraper
was never revisited**, because nothing connected the class to its other instances.

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

---

# §T18.2 — ⚠⚠ THE KILL LOG: T18 ARRIVED PRE-SWEPT
*(T18 pass 1, prose stratum second half, `pb.txt` lines 121–381 read in order and in full · written
2026-09-22, tree pinned at `c5525b20`)*

## THE FINDING OF THIS PASS IS THAT ITS CANDIDATES WERE ALREADY ON FILE

**T18's transcript is `2026-09-20-06-12-04-nba-pipelines-confidence-board-tiers-2026-09-19.txt`.**
**The section immediately above this one is `## FROM THE LIVE SESSION 2026-09-19/20 (not yet a
transcript file)`, `*added 2026-09-20*`, and it carries 22 `###` entries** *(counted from the file at
line 12042 to EOF, `awk` over `NBA_OPEN_ITEMS.md` at 2026-09-22T11:01:32Z — **22**)*.

🔑🔑 ***THEY ARE THE SAME SESSION.*** **The sweep audited T18 from the live system and from COMPASS on
the day T18 ended — before its transcript existed — and wrote 22 of its headline findings then.**

### THE KILLS — *rules 26/28, logged rather than re-written*

**Every candidate below was carried out of the prose stratum, checked against the twelve, and KILLED
as a restatement of the sweep's own earlier work. None is re-written.**

| # | Candidate from T18's prose | Already on file at |
|---|---|---|
| 1 | **The 2:30 PM PT cutoff was drift** — observed injury-PDF snapshot timestamps in *Eastern*, promoted to a deadline, delabelled, propagated into COMPASS facts 41/68/73/74/96 | `NBA_OPEN_ITEMS` §*BUG-FIXED · the 2:30 PM PT cutoff was drift* · `NBA_SYSTEM_DESIGN` §967, §1617 · `NBA_MASTER_SUMMARY` 15745–15752 |
| 2 | `PHASE1_CUTOFF_LOCAL = "16:00"` = 1:00 PM PT; `PHASE2_CUTOFF_LOCAL = "17:45"` is the **league bulletin**, not a filing deadline | same three |
| 3 | **`float(x or 0)` returns NaN — NaN is truthy** — 6,748 NaN overrides bound for the scorer | `NBA_OPEN_ITEMS` §*BUG-FIXED · `float(x or 0)`…* |
| 4 | **`market_key` → prop mapping would have dropped 44% of the board** | `NBA_OPEN_ITEMS` §*BUG-FIXED · market_key → prop mapping…* |
| 5 | **A caught exception left a poisoned transaction** — traceback pointed 60 lines away | `NBA_OPEN_ITEMS` §*BUG-FIXED · a caught exception…* |
| 6 | **The loader reads over HTTP** (`raw.githubusercontent`), so uncommitted files are invisible | `NBA_OPEN_ITEMS` §*BUG-FIXED · loader reads over HTTP…* |
| 7 | **The per-pair build needs a merge step** | `NBA_OPEN_ITEMS` §*BUG-FIXED · the per-pair build needs a merge step* |
| 8 | **Five wrong env var names** (`IR_MODE`→`INJURY_MODE`, `SPORT`→`SLEEPER_SPORTS`, `SLEEPER_OUT_DIR`, `UNDERDOG_SPORTS` nonexistent, `PP_LEAGUE_ID` nonexistent) | `NBA_OPEN_ITEMS` §*BUG-FIXED · five wrong env var names…* |
| 9 | **PrizePicks is NOT wired for NBA** — `main.py` hardcoded to MLB, `league_id=2` a literal in all four URLs, output fixed to the MLB file | `NBA_OPEN_ITEMS` §*BUG-OPEN · PrizePicks is NOT wired for NBA…* |
| 10 | **`board_tiers` is two-way; the board is now four-way** — *below the anchor more=goblin/less=demon; above it more=demon/less=goblin* | `NBA_OPEN_ITEMS` §*PARTIAL · `board_tiers` is a TWO-way taxonomy…* · `NBA_GOBLIN_DEMON` §830 |
| 11 | **The tier sign convention breaks** — v1 signed by *kind*, v2 must sign by *position* | `NBA_OPEN_ITEMS` §*CAVEAT · tier sign convention breaks…* |
| 12 | **The invisible/switch-point anchor** — *"10.5 goblin, 11.5 goblin, 12.5 demon → 12 is the anchor"*, **419,205 legs**, validated on **42,600 ladders** | `NBA_GOBLIN_DEMON` §371, §705–711, §795 · `NBA_GLOSSARY` §320 — **and the file goes FURTHER than the transcript**, holding the v1-vs-v2 residue `419,205 − 375,835 = 43,370` |
| 13 | **Zero Under rows on alternates through 2025-08; `less` enabled 2026-08** | `NBA_GOBLIN_DEMON` §830 · `NBA_MASTER_SUMMARY` §16325 · `NBA_OPEN_ITEMS` §12058 |
| 14 | **PrizePicks per-leg multipliers are on no public surface** | `NBA_OPEN_ITEMS` §*DEFERRED · PrizePicks per-leg multipliers…* — and **this sweep's own §0.7-T18** *(`NBA_MULTIPLIERS`, written in this same pass)* |
| 15 | **Ladder depth: too shallow for the books, too deep for low-count props** | `NBA_OPEN_ITEMS` §*PARTIAL · ladder depth is too shallow…* |
| 16 | **`fantasy_score` has never appeared in the NBA board archive** — the one date carrying `player_fantasy_points` also carries `player_first_inning_runs`, so it is MLB data | `NBA_OPEN_ITEMS` §*CAVEAT · `fantasy_score` has never appeared…* |
| 17 | **P3's reallocation path verified on ONE date only** — Klay Thompson, 2025-11-29, **828 legs → overs 0.0122 / unders 0.9834**, 3,446 teammate overrides | `NBA_OPEN_ITEMS` §*PARTIAL · P3's reallocation path…* — figures present in the twelve *(novelty probe 2026-09-22: `0.9834` × 3, `3,446` × 4, `58,395` × 2)* |
| 18 | **The injury backfill is HOURLY, not 15-minute** | `NBA_OPEN_ITEMS` §*CAVEAT · the injury backfill is HOURLY…* |
| 19 | **`archive_label` defaults to `routine`** — the decision snapshot would be indistinguishable from a cron pull | on file *(5 case-insensitive hits across the twelve)* |
| 20 | **Data-freshness gate dropped; scenario precompute dropped** | `NBA_OPEN_ITEMS` §*DROPPED · data-freshness gate* · §*DROPPED · scenario precompute…* |
| 21 | **79% of questionables unresolved at the cutoff, by design** | `NBA_SYSTEM_DESIGN` §309 *(COMPASS fact 96)* |
| 22 | **`final_hp` denormalised · `VACUUM FULL` cannot run on it · a 0-scan index may be load-bearing** | three `### CAVEAT` entries, same section |

**⇒ 22 candidates carried, 22 killed.** *The only material that survived is in
`NBA_SYSTEM_ARCHITECTURE.md` §0f-5-T18 — six causal findings — and the four items below.*

---

## ⚠⚠ RULE 38 — *born here*

> **A transcript the sweep already audited LIVE arrives pre-killed. Its text is then worth reading for
> exactly one thing: the CAUSAL layer rule 6 forbids a live audit to carry — how each fact was found,
> what it cost, and what was tried and rejected. Sweep it for WHY, never for WHAT.**

**Rule 6** *(born T7)* says **a live-audit finding records what the system IS and never explains WHY
unless a swept transcript supplies the cause.** 🔑 **Rule 38 is rule 6 read from the other end**: the
live audit takes the WHAT and *leaves the WHY behind by construction*, so the transcript of an
already-audited session holds **nothing but** the WHY. *Reading it for facts is guaranteed to produce
restatements — which is exactly what this pass produced, 22 times.*

⚠ **The cost this rule would have saved is measurable and is recorded honestly: this pass read 254
prose segments / 153,534 chars to write six sections and four open items.** *Had rule 38 been applied
at pass 0, the same yield would have come from reading for causal turns only.*

⚠⚠ **AND THE RULE HAS A LIMIT, STATED SO IT IS NOT OVER-APPLIED**: **it licenses a narrower READING,
never a shorter one.** *Rule 25 still governs — the stratum is read IN ORDER AND IN FULL. Rule 38
changes what a candidate has to clear to be written, not how much text is read.*

---

## THE RESIDUE — *four items the live audit could not have carried*

### T18-4 · **OPEN** · the "load fit, don't refit" path is SPECIFIED, NOT SHIPPED
P3's correct design requires P2 to persist the fitted model *(tier tables, betas, dispersion)* and P3
to **load** it rather than rebuild it. **The mechanism exists** — `BT_SAVE_COMPONENTS` already pickles
for combos — **but the builder has no load path.** The author declined to build it in-session:
*"this is a real refactor of the builder… i don't want to attempt it and leave it half-tested at this
point; it needs its own pass with proper verification against the known 2026-01-15 values."*
**Severity: HIGH.** *Without it P3 either refits (~64 min, past the window) or scores against a
ladder it did not fit.* ⚠ **NOT RECORDED: whether any later session built it.**

### T18-5 · **CLOSED-BY-DISCOVERY** · the `BS_SOURCE` switch was never needed
`archive_live_boards.py` normalises **every** scraper into `board_snapshots` in one shape, so live and
archive are one table. **The switch built into the scorer is dead code.** *(Zero occurrences of
`bs_source` across the twelve before this entry — so this is the first record of it.)*
**Severity: LOW** *(dead code, not a defect)*. 🔑 **Recorded because of its cause, not its effect:
this is the parity rule ELIMINATING work — the live and historical paths are the same path by
construction.**

### T18-6 · **OPEN** · the gap audit's 2025-26 denominator is NOT RECORDED
The threshold was recalibrated from *"any truncated team-game"* to *"rate > 0.5%"*, measured against
**2024-25 = 2 of ~2,460 team-games (0.08%)**. **The 2025-26 count is given as 7; its denominator is
not.** ⇒ **the 2025-26 rate is unstated in the transcript and is NOT computed here.** *If 2025-26 is a
comparable ~2,460, 7 is 0.28% and passes; a materially shorter season could push it past 0.5% and
halt the pipeline.* **Severity: MEDIUM — one SELECT settles it, and the sweep does not run it** *(the
threshold is a live config value; documenting, not fixing)*.

### T18-7 · **OPEN** · off-ladder rungs are interpolated and taxed — the policy is recorded, its calibration is not
When an app offers a rung outside the built range, the scorer **interpolates in log-odds from the two
nearest fitted rungs, flags it, and deducts 4 confidence points.** *"an interpolated rung genuinely is
less supported than a fitted one, and the number should say so rather than pretend."*
⚠ **NOT RECORDED: where 4 comes from.** *No fit, no measurement, no comparison of interpolated-rung
outcomes against fitted ones appears in the transcript.* **It is a chosen constant.**
**Severity: MEDIUM.** 🔑 **And the author states the deeper objection himself, so it is quoted rather
than inferred**: the owner's ***"interpolation is a patch, not a fix — if apps offer rungs we don't
build, the ladder is too shallow or the anchor is misplaced"***, which is what produced the
per-prop depth work in the first place. ⇒ **the deduction and the depth fix address the same defect
from opposite ends, and BOTH are live.**

---

## ⚠ ONE FIGURE FROM THE TRANSCRIPT THAT IS NOT ON FILE — *and why it is not written as a finding*

**The books' ladder depth is PROPORTIONAL to the anchor, not a fixed step count.**

| prop | avg anchor | p95 dist | p95 ÷ anchor |
|---|---|---|---|
| points | 15.9 | 13.0 | **0.82** |
| rebounds | 5.7 | 5.0 | **0.88** |
| assists | 4.3 | 4.0 | **0.93** |
| steals | 1.1 | 1.0 | **0.87** |
| blocks | 0.8 | 1.0 | *1.30* |

***"books ladder out to roughly ±85–90% of the anchor, consistently across props. that's the real rule
— not a fixed number of steps."***

⚠⚠ **This is NOT written as a new finding, because `NBA_OPEN_ITEMS` already carries §*PARTIAL · ladder
depth is too shallow for the books, too deep for low-count props* — the same conclusion.** *The table
is recorded here only as the MEASUREMENT BEHIND that entry, which is the causal layer rule 38 says the
live audit cannot carry.* **Kill 15 stands.**

⚠ **And the transcript corrects itself on it mid-stream, which is why the raw table is unsafe to
quote without the correction**: an earlier reading assumed **0.5** step sizes for rebounds/assists/
steals/blocks; ***"correction to my earlier reading: all these props use step: 1.0, not 0.5."*** **The
`±10 steps` verdicts in the first version of the table — "rebounds just right", "assists wasteful" —
were computed on the wrong step size and were restated.** *(Final verdicts: points short by 3;
rebounds/assists wasteful; steals/blocks very wasteful.)* 🔑 **Rule 13 applied to a transcript's own
arithmetic: the later turn in the same transcript supersedes the earlier one, and the supersession is
recorded with both.**

⚠ **Independent confirmation is on file and is the reason the conclusion is safe despite the
correction**: the board scorer's **interpolation counts** — **points 1,294 and PRA 966 off-ladder,
steals/blocks/stocks/turnovers ZERO** — reproduce the depth verdict from a completely different
measurement. *Two independent instruments, one conclusion.*

---

# §T18.3 — THE FOUR RESIDUE ITEMS, SETTLED FROM EXECUTED EVIDENCE
*(T18 pass 2, mechanism strata · written 2026-09-22 · **this is the pass's pre-registered clause
(iii)**: "at least TWO of the four resolve to NOT RECORDED rather than to a found value")*

## T18-4 · **UPGRADED: OPEN → NEVER ATTEMPTED** · the "load fit, don't refit" path
**Pass 1 recorded it as "specified, not shipped."** **The mechanism strata sharpen that.** ✅ **Every
occurrence of `BT_SAVE_COMPONENTS` in all 860 mechanism segments belongs to the PRE-EXISTING combos
mechanism**, `.github/workflows/nba-combos-history.yml`, whose own header reads: *"components first —
the singles harness with `BT_SAVE_COMPONENTS=1` pickles the full test season, then the combos recipe
in all-dates mode, then load. Fails loudly."* 🔴 **There is no `BT_LOAD_FIT`, no fit-load call site,
and no patch toward one, anywhere in the session.** ⇒ **The refactor was not merely left unfinished —
it was never begun.** **Severity: HIGH, unchanged.** *Without it P3 either refits (~64 min, past its
window) or scores against a ladder it did not fit.*

## T19-4 · **NEW · CAVEAT** · `psycopg` rejects multi-command SQL the moment a query is parameterised
**`cannot insert multiple commands into a prepared statement`** — raised by `psycopg` when a single
`execute()` carries both several statements AND bind parameters. **It killed the first
`build_board_tiers_v2.py` run** *(`nba-engine-test.yml`, run `35487587311`, step "board tiers v2
(four-way taxonomy)", conclusion `failure`)*, **where `CREATE TABLE … ; TRUNCATE … ; INSERT … %(apps)s`
was one blob.**
✅ **The shipped fix, and the reason the script looks the way it does**: **the DDL, the `TRUNCATE` and
the parameterised `INSERT` are THREE SEPARATE `execute()` calls.**
🔑 **Recorded as a CAVEAT rather than a bug** — the behaviour is `psycopg`'s, not the system's — **and
because the same shape recurs in every builder that creates-then-fills a table.**
**Severity: LOW** *(fixed, and it fails loudly)*. *(T19 pass 2, `NBA_MASTER_SUMMARY.md` §T19.3.)*

## T19-3 · 🔴🔴 **NEW · METHOD, HIGH** · T15–T18 were closed on a standard this sweep had already superseded
**`NBA_MASTER_SUMMARY.md` records the sweep's own method** *(lines ~5430–5438, "THE METHOD, now proven
and fixed for T2–T16")*: **targeted sweeps build the skeleton, then *"full sequential reads — and
these are the ONLY ones that can count as clean"*, and *"the clean count only starts once sweeps are
exhausted"*.** **Its evidence is T1's own 28-pass history: 23 targeted sweeps produced 21 findings;
pass 24, a full sequential read, immediately found SIX more; pass 25 two more.**
🔴 **T18's CLEAN 3/3 was awarded to passes 6 (live numeric), 7 (cross-document) and 8 (wiring) — all
three targeted instruments, none of which re-read the transcript.** **T18 has never had a clean full
sequential pass.** **T15, T16 and T17 closed at 4 passes each and are in the same position.**
⚠⚠ **The OWNER's rule is NOT broken** — his charter specifies *"3 consecutive passes without having
new points not documented"* and says nothing about how a pass must read. **What was broken is the
SWEEP'S OWN recorded conclusion**, adopted on direct evidence that targeted passes miss what
sequential reading catches.
✅ **DONE**: T18's closure is **re-stated with its standard named** — closed under the VERIFICATION
standard, not closed under the SEQUENTIAL standard — **and both counts are in the run log**. **T19 and
T20 close on full sequential reads.**
⚠ **NOT DONE, deliberately: T15–T17 are NOT silently re-opened.** *Re-opening three closed transcripts
is a real cost, the owner's rule is satisfied either way, and this is his call.*
🔑 **Same root cause as T19-1**: ***the sweep does not re-read its own documents, so its best
conclusions sit unused in the file it writes into most.***
*(Full table and evidence: `NBA_MASTER_SUMMARY.md` §T19.2.)*

## T19-2 · **NEW · LOW** · the glossary index carries document + transcript, not line/message
**The charter asks the glossary to say where a term is found *"on which transcript and which
line/message/date and time."*** **§Z gives the DOCUMENT and the TRANSCRIPT(s); it does not give
per-message line numbers**, because the sweep's documents record findings by section and transcript
and **the transcript line offsets were never captured**. ⚠ **Named rather than invented: fabricating
line numbers would be worse than omitting them.**
**Severity: LOW** — a reader can find any term from document + transcript. **The fix, if wanted, is to
re-extract each transcript with segment indices and add a fourth column** *(the sweep already computes
segment indices in every pass, so the data exists in the harness even though it is not in the
documents)*.

## T19-1 · 🔴🔴 **RESOLVED 2026-09-22 (same pass)** · `NBA_GLOSSARY.md` has not been updated through seven transcripts
**The owner's founding charter (T19 SEG 60, repeated verbatim at SEG 378) names the glossary as one
of EIGHT mandated documents and gives it the most specific completeness requirement of any of
them**: *"a map for all important aspects, keywords, terms and tell exactly how and where to find
them, **on which transcript and which line/message/date and time**… **any material term that shows
more than once must be in the glossary**."*

**MEASURED 2026-09-22:**
- **43,356 B — the smallest of the twelve** *(`NBA_MASTER_SUMMARY` 1,990,323 · `NBA_OPEN_ITEMS` 875,355)*
- **its own Update log has ONE row: `2026-09-20 | Created.`**
- **its transcript index stops at T16 + "LIVE" — T17 and T18 are absent**
- **44 commits**, against `NBA_OPEN_ITEMS`' **410** and `NBA_MASTER_SUMMARY`'s **889** — **20 : 1**
- **last content commit 2026-09-21**, on T11-era `LADDER_DEPTH`/FGA/FTM material
- **eight of ten central T17/T18 terms absent**: `board_tiers_v2`, `confidence_model`,
  `certify_pipeline`, `CONF_NEUTRAL`, `measure_report_cutoff`, `f_phase`, `PHASE1_CUTOFF_LOCAL` all
  return **0**

⇒ **No glossary content commit exists for the sweep of T12 through T18 — seven transcripts, every one
CLOSED on "three consecutive clean passes."**
🔑 **Why nine closure passes on T18 alone missed it**: ***every pass measured FINDINGS against a
TRANSCRIPT; no pass measured the DELIVERABLE against its CHARTER.***
**Severity: HIGH** — it is a named, mandated document with an explicit completeness rule, and it is
the document a future reader would reach for first to navigate the other eleven.
✅✅ **RESOLVED 2026-09-22, SAME PASS.** **`NBA_GLOSSARY.md` 43,356 B → 84,493 B**; **§Z — THE
COMPLETE TERM INDEX added, 824 terms** with the documents that carry each and the transcripts they
appear in; **transcript index continued through T20**; **dated update-log entry added**.
**Re-measured after the backfill: of the 1,016 terms meeting the charter's "appears in two or more"
test, 0 remain absent — coverage 18.9% → 100.0%.**
🔑 **And the resolution identified what kind of failure it was**: **every one of the 824 appears in
≥2 of the twelve**, so ***the gap was an INDEX failure, not a COVERAGE failure — the sweep had the
content and had no map to it***, which is precisely the distinction the charter draws by asking for a
glossary as a separate document. ⚠ *One charter field remains unmet and is named rather than
invented: per-message line numbers (open item T19-2).*
*(Full evidence and the charter quoted in full: `NBA_MASTER_SUMMARY.md` §T19.1 and §T19.2.)*

## T18-17 · **NEW · OWNER DECISION** · the score formula's penalising half has never fired
**`[LIVE-AUDIT]` 2026-09-22: of 19,215,200 legs in `nba_score.final_hp`, ZERO have
`confidence <= 0.85`.** **The live minimum confidence is 0.8540** *(2024-25 0.8540 · 2025-26 0.8722)*,
**three thousandths above the shipped `CONF_NEUTRAL = 0.85`.** ⇒ **the `drop` term —
`clip(−cdev,0,1)×0.35`, "up to 35% off when the data is thin" — has never been non-zero on a
production row. Every live leg is LIFTED.**
✅ **Consistent with the design, not a contradiction of it**: COMPASS fact 101 says the deduction
model's *"floor (~55) needs everything to stack against it at once"*, so a confidence floor far above
0.85 is the designed consequence.
⚠ **OWNER DECISION, two coherent options and the sweep chooses neither**: *(a)* **raise
`CONF_NEUTRAL` into the realised distribution** (its median or 25th percentile) so both halves
engage and the score separates well-supported from thin legs more sharply; *(b)* **keep 0.85 and
accept the score as a one-sided enhancer** — which is literally what the owner asked for, *"the score
must ENHANCE the hit probability — no kill good legs"*. **(b) may well be right.** **What is recorded
is that the code implements a two-sided rule and the data only ever exercises one side.**
⚠ **Rule 6: whether 0.85 was chosen before or after the deduction floor was known is NOT RECORDED.**
*(Full arithmetic: `NBA_FINAL_SCORING_CALIBRATION.md` §0a-T18-D.)*

## T18-6 · **CONFIRMED, AND THE REASON IS WORSE THAN "UNRECORDED"** · the gap audit's 2025-26 denominator
**See `NBA_WORKERS.md` §0.002-T18 for the full evidence.** In short: the threshold comment claims
calibration on *"2024-25 had 2 of ~2,460 (0.08%) and 2025-26 had 7."* 🔴 **Only the 2024-25 half was
produced by an executed run** *(20:09:34 — `gaps found: 2 truncated team-games`, naming `0022401178`
TOR)*. **The season-wide 2025-26 run, five minutes earlier at 20:04:19, returned *"No COMPLETED games
in the schedule for 2025-26 … Nothing to audit — this is expected in the off-season. Not a failure."*
and exited 0.** ⇒ **The "7" came from a different, date-scoped invocation (the P2 replay on
2026-01-15), and no denominator for it exists anywhere in the transcript.** **Severity: MEDIUM →
HIGH**, because the same evidence shows the audit **cannot see a past season at all** — a green run
on an empty expected-set, worded as reassurance. *Documented, not fixed.*

### ✅✅ **RESOLVED 2026-09-22 (T18 pass 6) — THE DENOMINATOR IS 2,460, AND THE CALIBRATION WAS SOUND**
**`[LIVE-AUDIT]`, read-only `SELECT` on `nba_market.schedule_norm`: 2,460 rows total, exactly 1,230
per season** *(2024-25 2024-10-22→2025-04-13 · 2025-26 2025-10-21→2026-04-12)*. **1,230 games × 2
teams = 2,460 TEAM-GAMES per season**, which is the audit's own denominator
*(`total_team_games = sum(len(v) for v in game_players.values())`)*.

| season | truncated | denominator | rate | vs the 0.5% threshold |
|---|---|---|---|---|
| 2024-25 | **2** | **2,460** | **0.0813%** | ✅ passes — **and the source comment says "0.08%", EXACT** |
| 2025-26 | **7** | **2,460** | **0.2846%** | ✅ **passes — it would NOT have halted the pipeline** |

🔑 **So the recalibration was arithmetically sound all along**, and the open item was about a missing
*statement*, not a missing *basis*. ⚠ **The caveat that keeps this honest: 2,460 is the count of
SCHEDULED team-games, and the audit counts team-games PRESENT IN THE DELTA — the two coincide only
for a complete season.** *For a mid-season run the denominator is smaller and the same 7 would score
a higher rate, so the threshold is most permissive exactly when the season is complete.*
⚠ **The rest of T18-6 STANDS UNCHANGED**: the season-wide 2025-26 audit still returned *"nothing to
audit… not a failure"*, and that is T18-12's problem, not this one.

## T18-7 · **CONFIRMED EXACTLY — the `4` is a literal with nothing behind it**
✅ **The line itself, read from the executed patch**:
`lost = lost + np.where(d["interpolated"].values, 4.0, 0.0)`, then
`d["confidence"] = np.clip(base - lost, floor, 99.5) / 100.0`.
**The entire justification is the comment beside it**: *"an interpolated rung is genuinely less
supported than a fitted one — say so."* 🔴 **No fit, no measurement, no comparison of interpolated-rung
outcomes against fitted ones appears in any of the 860 mechanism segments.** ⇒ **`4.0` is a chosen
constant**, exactly as pass 1 stated, **now verified against the code that ships it rather than the
prose that describes it.** **Severity: MEDIUM, unchanged.**

## T18-8 · **NEW · the P2 end-to-end run resolves to NOT RECORDED**
**Pass 1 left P2's final steps (merge → commit → load → certify) unresolved — the prose says the run
"aged off the recent list" TWICE.** ✅ **The mechanism strata confirm the run reached the load step and
FAILED there**: at **2026-09-19 21:19:55** the log carries three consecutive 404s —
`nba_baseline_ladder_2026-01-15.json: HTTP Error 404: Not Found`,
`…_combos.json: 404`, `…_periods.json: 404` — the loader fetching over `raw.githubusercontent` for
files that were never committed. 🔴🔴 **But that is the run BEFORE the commit fix.** **NO
`tool_result` in this transcript shows a P2 run completing merge → commit → load → certify.** ⇒ **The
answer is NOT RECORDED, and pass 1's open item stands unchanged.** ⚠⚠ **And the comparison the author
himself called "the real test" — *"2026-01-15 should reproduce 140,130 legs at mean confidence
0.930"* — WAS NEVER MADE IN THIS TRANSCRIPT.** *The nearest executed figure is a single-prop line at
20:18:01 — `turnovers 4,006 legs, mean final−baseline 0.00004, mean conf 0.930` — which matches the
0.930 but is one prop, not the 140,130-leg slate.* **Severity: HIGH — the session's own stated
acceptance test for P2 was never run.**

---

## T18-9 · ⚠⚠⚠ **CORRECTED 2026-09-22 (T19 pass 1) — THIS ENTRY WAS FRAMED BACKWARDS, AND AN EXISTING ENTRY ALREADY SAID SO**
🔴 **As first written, T18-9 called the early-tip clause an OPPORTUNITY — *"1:15 PM PT is correct but
conservative; every report is in by 10 a.m. local, so P3 could run earlier."*** ***That is the wrong
way round, and this file already carried the right one.***
✅ **The existing entry — `NBA_OPEN_ITEMS.md` §*P3's trigger is wrong on early-tip days* — states it
correctly and is older**: the original design was explicit that the master run *"isn't a fixed clock
time — NBA start times shift day to day — so it needs to be computed dynamically from
`nba_calendar.games`: **today's earliest real tip-off minus 2 hours**."* **P3 uses a fixed 1:15 PM PT.
The NBA regularly schedules noon and 1 PM Eastern starts** *(Christmas, MLK Day, weekend national-TV
windows)*, **and a 12:00 PM ET tip is 9:00 AM PT — so on those days P3 would score a slate whose
games had ALREADY TIPPED.** **The fix is `min(1:15 PM PT, earliest_tip − 2h)`, and the schedule data
is already loaded.**
⇒ ***The early-tip clause is not an opportunity to run EARLIER by choice. It is the same fact that
makes the fixed trigger WRONG — and the failure direction is scoring after tip-off, not leaving value
on the table.***
🔑 **What T18-9's evidence DOES add to the existing entry, and all it adds**: the NBA's own filing
rule explains WHY early tips are a distinct regime — ***teams file 8–10 a.m. local for tip-offs at 5
p.m. or earlier***, rather than 11 a.m.–1 p.m. *(quoted from the web source T18 retrieved at SEG
483/484; authority named per rule 11)*. **So on an early-tip slate the reports ARE in early — which is
what makes `earliest_tip − 2h` feasible rather than merely necessary.**
⚠⚠ **HOW THIS SWEEP GOT IT WRONG, recorded because the lesson is rule 7's**: the pass probed
`8 and 10 a.m.` and `5 p.m. or earlier` — both returned **0** — and concluded the material was novel.
**It never probed `earliest tip`, which returns SIX hits and would have surfaced the entry that
already had the conclusion.** ***A novelty probe on the words of the EVIDENCE is not a novelty probe
on the words of the CLAIM.*** *(Rule 7: before asserting something is unrecorded, grep its
distinctive term — and the distinctive term is the CLAIM's, not the source's.)*
**Severity: HIGH** *(inherited from the existing entry — scoring a tipped slate is a correctness
failure, not a missed optimisation)*. **The OWNER DECISION framing is WITHDRAWN: there is nothing to
decide, only a fix to apply after the sweep ends.**

### *(original text of T18-9, kept per the §0w precedent)* · the early-tip clause makes 1:15 PM PT conservative on some slates
**The NBA rule, as quoted by the web source T18 retrieved** *(mechanism stratum SEG 483/484 — one of
only two `web_search` calls in the whole transcript)*: teams file the game-day report **11 a.m.–1 p.m.
local**, **but 8–10 a.m. local for tip-offs at 5 p.m. or earlier**, and **by 1 p.m. local for the
second game of a back-to-back**.
⇒ **On a slate with no back-to-back second night and no tip later than 5 p.m. local, every report is
in by 10 a.m. local — 10:00 AM PT at the latest — three hours before the current cutoff.**
**Severity: LOW as a defect (1:15 PM PT is never WRONG, only early-conservative); MEDIUM as an
opportunity**, since an earlier run means an earlier board read and more time before lines move.
⚠ **OWNER DECISION**: whether P3 should branch on slate shape — *"if no B2B second night and max tip
≤ 5 p.m. local, run at 10:15 AM PT"* — or keep one fixed 1:15 PM PT window for the operational
simplicity the owner explicitly chose *("one run, everything present, no second window")*.
**The sweep does not decide this and changes nothing.** *(Full evidence and the two bulletin/PDF
traces: `NBA_SYSTEM_DESIGN.md` §0z-8-T18.)*

## T18-16 · **NEW · LOW** · seven `§`-references in the twelve resolve nowhere, and the heading convention hides the rest
**Reference audit, 2026-09-22 (T18 pass 4): 644 `§`-references to transcript sections across the
twelve — 621 (96.4%) resolve to a heading inside the twelve, 16 resolve only in
`NBA_SWEEP_RUN_LOG.md`, and 7 resolve NOWHERE**: `§T15.2c` · `§T15.2d` · `§T15.2e` · `§T15.2f` ·
`§T17.4` · `§T5` · `§T7.32-era`.
🔴 **`§T15.2c–f` is the real cluster because it is used REFERENTIALLY, not only as a dateline** —
*"§T15.2f's selection filter, caught by a sanity check rather than by inspection"*
(`NBA_BASELINE_CALIBRATION` 250) and *"after the test itself was found broken — §T15.2f"*
(`NBA_FINAL_SCORING_CALIBRATION` 1079). **A reader who follows either finds nothing.**
⚠ **Severity LOW, and stated as such: the CONTENT is present** — the OREB rebuild is §0y, the Fliff
fix is §0f-4 — **only the pointer fails.** **The fix is to give the sub-findings headings, or to
rewrite the four pointers to name the sections that hold them.**
⚠ **And a convention split makes the whole set harder to navigate than it looks: of 1,498
transcript-section headings in the twelve, only 138 (9%) carry the `§` sigil** *(they are written
`## 0.7-T18.`)*, **while essentially every cross-reference writes `§0.7-T18`.** ⇒ **a reader who
searches the literal string a document handed them finds the REFERENCE and never the SECTION.**
🔑 **Recorded because the audit's own first run was a FALSE POSITIVE on exactly this** — it reported
`§0.7-T18`, `§0.8-T18` and `§0a-T18` as dangling when all three exist. ***A reference audit must
match on the id, never on the sigil.*** *(Full table: `NBA_MASTER_SUMMARY.md` §T18.5.)*

## T18-15 · **NEW · METHOD** · were T2's and T3's `thinking` strata read at T1's depth?
**The sweep's standing characterisation — "the `thinking` stratum is labels" (§T11.43a, confirmed
§T12.1c and again at T18 pass 3) — is TRUE for 17 of 20 transcripts and FALSE for the first three.**
**T1 / T2 / T3 carry 33,578 / 15,852 / 17,127 chars of first-person extended reasoning** *(max 1,774
/ 1,434 / 1,741; 47 / 37 / 26 segments over 200 chars)*, against a hard cap near 240 chars everywhere
after `2026-09-03-22-38-55`. **Together they are 66,557 chars — more than half the corpus's entire
`thinking` volume.**
✅ **T1's was read**: the run log records it measured at `52 / 33,578 / 1,774`, mean 645.7, and **T1
pass 65 recovered a rationale *"from T1's thinking blocks"***.
✅ **MEASURED RATHER THAN LEFT OPEN** *(2026-09-22T11:31:19Z; the ledger rows were checked first and
do not settle it — T1's names 89 passes, T2's 19, T3's 14, and T3's says "all 466 TAIL segments read",
which is a different stratum; T4's is the first to say "all FOUR strata read", and T4 is the first
transcript past the break)*. **So the sweep's own coverage instrument was run on the long (>200 char)
`thinking` blocks of each, against the twelve — WITH A CONTROL, because an uncovered rate has no
meaning without one** *(rule 22)*:

| transcript | `thinking` uncovered | **prose** uncovered | `tool_result` uncovered |
|---|---|---|---|
| T1 `03-22-04` | **77%** (36 of 47) | **50%** (n=38) | 92% (n=200) |
| T2 `04-41-28` | **73%** (27 of 37) | **54%** (n=39) | 98% (n=303) |
| T3 `22-24-13` | **69%** (18 of 26) | **40%** (n=35) | 98% (n=247) |

🔑 **The ordering is `prose < thinking < tool_result` on ALL THREE, with no exception** — **thinking
is 19–29 points less represented in the twelve than the PROSE OF THE SAME TRANSCRIPTS, and 15–29
points more represented than raw tool output.**
⚠⚠ **STATED AT EVIDENCE STRENGTH, AND THIS IS THE WHOLE CAVEAT**: **the instrument measures LEXICAL
overlap, so it cannot distinguish "not absorbed" from "absorbed in different words."** **A high
uncovered rate is NORMAL and expected for `tool_result` — raw output is not meant to be copied into
documents.** ⇒ ***The measurement does NOT show that anything was missed. What it shows is an
ORDERING, and the ordering is consistent.***
⇒ **NARROWED TO A BOUNDED, CHEAP ACTION**: **81 long `thinking` segments across T1–T3 sit below the
0.40 coverage threshold** *(36 + 27 + 18)*. **That is a readable quantity — one focused pass, not a
re-sweep.** **Severity: METHOD, MEDIUM** *(downgraded from "potentially HIGH" now that it is
measured and bounded)*. *(Census and break-point evidence: `NBA_MASTER_SUMMARY.md` §T18.4.)*

## T18-14 · **NEW · HIGH** · the certifier has no magnitude check on P3 and certifies on a single row
**`certify_pipeline.py` (live source, 2026-09-22): of its twelve checks, only THREE are plausibility
gates — P1's `> 10000` defender ratings and `> 400` players, and P2's `count(DISTINCT prop) >= 25`.**
🔴 **All five P3 checks are `count(*) > 0` or `count(bad) == 0`, and the two `== 0` checks are
VACUOUS on a small population.** ⇒ **A P3 run that scores ONE leg prints "5/5 checks passed. Pipeline
certified."** ⚠ **P2 is barely better: its one gate is on DISTINCT PROPS, so 25 props × one row each
certifies.**
🔑 **The author wrote the correct assertion into the board scorer in the same session** — *"it asserts
legs actually landed, because a green run with an empty table is the failure that hides best"* — **and
not into the certifier, whose whole purpose is that assertion.**
⚠ **Precisely stated: `> 0` DOES catch a truly empty table. What it cannot catch is a PARTIAL slate —
which is what the remembered 44% combos gap actually was.** *The component is built against the
remembered symptom rather than the remembered cause.*
**Severity: HIGH** — these three pipelines are designed to run unattended daily, and the certifier is
the only thing standing between a partial run and a silently wrong board. **The fix is one line per
check, and the system already contains the right shape** (P1's thresholds; the gap audit's rate).
**Severity is on the DESIGN, not on any observed failure — no partial-slate run is recorded.**
*(Full check-by-check table: `NBA_WORKERS.md` §0.004-T18.)*

## T18-13 · **NEW · LOW** · the board scorer's aggregate confidence sits below every per-prop confidence
**In the 58,395-leg run: whole-board `avg_conf` **0.9416**, while all twelve per-prop confidences run
**0.9552 → 0.9677**.** *A mean cannot fall outside the range of its parts over the same population.*
⚠ **NOT RECORDED: whether the aggregate row and the per-prop rows cover the same legs.** **The
interpolation tax does not account for it** — 3,243 of 58,395 is **5.55%**, and 4 points on 5.55% of
legs is ~0.0022 against the ~0.014 observed. **Severity: LOW** *(a reporting question, not a scoring
one — the per-leg values are the ones that ship)*, **and one `GROUP BY` settles it.** *The sweep does
not run it: these are 2026-09-19 transcript figures and the table has been rewritten since.*
*(Table: `NBA_DATABASE.md` §0z-T18.)*

## T18-12 · **NEW · MEDIUM** · the gap-audit fallback was never re-verified on the season that exposed the gap
**`check_delta_gaps.py` originally had no fallback**: when `nba_schedule_current.json` held no
completed games for the requested season, it printed *"nothing to audit — this is expected in the
off-season. not a failure."* and exited 0. **A 2025-26 run did exactly that at 20:04:19.** 🔑 **The
author diagnosed and patched it within five minutes** — a team-game-log fallback, on the correct
reasoning that *"the TEAM game log is a SEPARATE pull from the player game log, so using it as the
expected set is a genuine cross-check, not a circular one."* **The fix is present in live source**
*(lines 77–80, verified 2026-09-22)*.
🔴 **He then re-ran it on 2024-25, where it worked — and never re-ran it on 2025-26.** ⇒ **The one
season that exposed the blind spot is the one season the fix has not been demonstrated on**, and it
holds **19,611,626** scored legs. **Severity: MEDIUM** — one dispatch settles it.
🔑 **The general shape, worth keeping**: ***a fix written in response to a failing run is verified by
re-running the case that FAILED, not by running a different case that was already passing.***
*(Full evidence and the sweep's own retraction on this point: `NBA_WORKERS.md`
§0.002-T18-CORRECTION.)*

## T18-11 · **NEW · HIGH** · the cutoff was decided on policy; the measurement built to check it never returned
**`nba/measure_report_cutoff.py` exists and states its own standard**: *"policy says the last market
to file is pacific, at 1 pm pt. **but policy is not evidence — measure it**… if not, 2:30 stays — for
a reason this time, not by inheritance."* **It measures, from the system's own two seasons of
archived snapshots, the share of game-days fully covered by 10:00 / 11:00 / 12:00 / 13:00 / 13:15 /
14:00 / 14:30 / 15:00 PT, the 13:15→14:30 status churn, and the same split by tip time.**
🔴 **Neither dispatch returned a result in T18**: run `35464255049` failed with
`ModuleNotFoundError: No module named 'pandas'` *(the probe workflow installs only `curl_cffi`)*, and
run `35464467204`, moved into `nba-engine-test.yml`, was last seen **pending** — **no `tool_result` in
any of the 860 mechanism segments carries its output.**
⇒ **The 1:15 PM PT cutoff rests on the league's published rule (authoritative, and quoted from four
independent results in T18) and NOT on this measurement.** ⚠ **It is not unfounded — it is
unverified against the system's own data, by the author's own standard.**
**Severity: HIGH — one dispatch settles it, the script is written, and the answer could move the
cutoff up to three hours earlier** *(see T18-9)*. ⚠ **NOT RECORDED: whether it was ever re-run after
this session.** *(Full evidence: `NBA_SYSTEM_DESIGN.md` §0z-8-T18-RETRACTION.)*

## T18-10 · **NEW** · the league publishes THREE bulletins; the sweep had recorded one
**1:30 p.m. / 5:30 p.m. / 8:30 p.m. ET = 10:30 AM / 2:30 PM / 5:30 PM PT** *(same source as T18-9)*.
**`nba_asof.py` encodes the first two as `ENRICH_CUTOFFS_LOCAL = ["13:30", "17:30"]`** *(verified in
live source 2026-09-22)*, and `PHASE2_CUTOFF_LOCAL`'s comment names the 5:30 p.m. ET one. 🔑 **The
8:30 p.m. ET bulletin appears in no sweep document and in no source constant read so far.**
**Severity: LOW** — a bulletin is a republication, not a filing deadline, so it does not move the
cutoff. **Recorded because it is the missing third member of a set the sweep was treating as a
singleton**, and because **`17:30 ET = 2:30 PM PT`** is the likeliest true origin of the drifted
figure. ⚠ **NOT RECORDED: whether the 8:30 p.m. ET bulletin is ever ingested.**

---

## ✅ PRE-REGISTERED CLAUSE (iii) — SCORED HERE, BEFORE THE NEXT PASS
**Predicted: "at least TWO of the four residue items resolve to NOT RECORDED rather than to a found
value."** **Outcome: ONE resolves to NOT RECORDED (T18-8, the P2 end-to-end outcome and its acceptance
test).** **The other three resolved to FOUND VALUES that sharpened them** — T18-4 upgraded from
*unshipped* to *never begun*; T18-6 confirmed with the audit's own log lines; T18-7 confirmed against
the shipping literal. ❌ **MISS.** 🔑 **And the miss is informative in the same direction rule 38
points**: *the mechanism strata answered three of four questions the prose had left open, which is
exactly what a stratum of executed evidence is FOR.* **The prediction under-rated it.**

---

# §T19.5 — KILL LOG, T19 PASS 3 *(rules 26/28)*
*(2026-09-22 — the sequential read of blocks 2–6, SEG 154 → SEG 919)*

**RULE 38 GOVERNS THIS TRANSCRIPT AT MAXIMUM STRENGTH**: *T19 is the sweep writing the twelve, so
every `github_patch_file` / `github_put_file` payload in it **IS** the text of a mandated document.*
**Blocks 2–6 hold roughly 280 such payloads. All are restatements by construction and none was
carried as a finding.** *They are killed as a class, and the class is named rather than enumerated —
the enumeration would be a table of the twelve documents' own contents.*

**THE ONE KILL WORTH LOGGING INDIVIDUALLY, BECAUSE IT IS LATE:**

### 🔴 KILL-LATE-1 — *the `2:30 PM PT` "league bulletin" trace was already on file when this sweep published it as a proposal*
| | |
|---|---|
| **Where it was already written** | `NBA_SYSTEM_DESIGN.md`, **at the document's creation, T19 SEG 234** — *"the 2:30 pm pt figure was drift … `phase2_cutoff_local = "17:45"` after the 5:30 pm et day-of report - **a league bulletin, not a filing deadline**"* |
| **Where the sweep published it as new** | `NBA_SYSTEM_DESIGN.md` **§0z-8-T18**, T18 pass 2, headed *"the trace this sweep recorded is probably the wrong one"* |
| **What already happened to it** | **Fully retracted the same day** in **§0z-8-T18-RETRACTION** under **rule 39**, after `bash_tool` SEG 545/546 measured the injury archive directly. *The retraction stands and is correct.* |
| **What this kill adds** | **The claim should never have reached publication at all** — *not because it was wrong about the mechanism, but because it restated the working tree.* **A duplicate probe against the WORKING tree (rule 28) on the string `league bulletin` would have returned a hit in the very file being edited.** |
| **Why the probe missed** | 🔑 ***The novelty probe was run on the words of the EVIDENCE — `ENRICH_CUTOFFS_LOCAL`, `17:30`, `2:30 pm` — and not on the words of the CLAIM — `league bulletin`.*** |
| **Severity** | **MEDIUM.** *No document currently asserts the duplicated claim; the retraction removed it. The severity is methodological.* |

⚠⚠ **n = 2, IN THE SAME SESSION, FROM TWO DIFFERENT PASSES.** **The identical cause is already on
file for the T18-9 mis-framing** *(probed `8 and 10 a.m.` = 0 and never `earliest tip` = 6)*.
🔑 ***So this is no longer an incident. It is a repeatable failure of how the sweep probes: the
probe is built from the terms that CONVINCED the sweep, which are by construction the terms the
existing documents would not use.*** **The remedy is one clause and it is cheap: *probe the sentence
you are about to write, not the evidence that made you want to write it.***

---

# §T19.6 — 🔴🔴🔴 THE CLOSURE RECORD FOR T1–T6 CERTIFIES LESS THAN IT STATES
*(T19 pass 3, 2026-09-22 — **VERIFIED from the commands themselves**, which T19 preserves verbatim)*

## THE FINDING

**The eighteen passes that produced the `3/3 clean` closures of T1, T2, T3, T4, T5 and T6 read each
content block through a `grep -oe "…{0,N}"` window of 110–260 characters, and displayed at most
1,026 of 2,097 available block-slots — 48.9%.** ***One of the eighteen displayed every block, and it
still capped each block at 200 characters.*** **The sections those passes wrote describe them as
*"complete read at maximum context"*, *"a full sequential read of every one of t1's 87 …content
blocks"*, and *"complete read of every block from 2 → 739"*.**

**The full table, with the segment of every command, is in `NBA_MASTER_SUMMARY.md` §T19.4 §2.** *The
worst case is T6's closing pass — at most **24 of 125 blocks, 19.2%**, from the middle region only.*
*Two of T2's three closing passes are named regional on their own face (`blocks 610-739`,
`blocks 143-460`) and were still counted `clean 1/3` and `clean 2/3`.*

## 🔑 AND THE STANDARD WAS ALREADY WRITTEN — TWO PASSES EARLIER, IN THE SAME TRANSCRIPT

**T1 pass 24 (SEG 332/333/344)**: *"**only a full sequential re-read can close a transcript** … a
line that matches no pattern survives any number of them, **and a grep window can silently truncate a
value**."* **T1 pass 25 (SEG 374)**: *"**a pass counts as clean only if all six segments are clean.**"*
🔴 ***The three passes that then closed T1 were grep windows of 130/150, 110 and 200 characters.***

## ⚠⚠ WHAT IS AND IS NOT CLAIMED — *language at evidence strength*

- ✅ **VERIFIED**: the commands, their caps, their line limits, and the completeness language of the
  sections written from them. *All quoted from T19's own `bash_tool` and `github_patch_file` strata.*
- ⚠ **UPPER BOUND, not a measurement**: the `shown` column is derived from each command's
  `sed`/`head`/`tail` limits. **The true coverage can only be lower.**
- ⚠ **INHERITED, not re-derived**: the per-transcript block counts (87 · 136 · 117 · 119 · 115 · 125)
  are **T19's own ledger figures**. *This pass did not re-partition T1–T6.*
- ❌ **NOT CLAIMED**: that T1–T6 are wrongly documented, or that their findings are unreliable.
  ***Whether material was missed is a different question and requires re-reading those six
  transcripts, which this pass did not do.***
- ✅ **CLAIMED**: **the `3/3` marks on T1–T6 certify a weaker thing than the words attached to them.**

## 📌 CORROBORATION FROM THE RECORD — *two closed transcripts later overturned*

1. **T1.21's alias story** — *"the five-row difference is the progression from fallback to live
   source"* — **overturned by T2 pass 4** *(SEG 443/446)*: `aliases_written` is an upsert count, 162
   is the table total. **T1 was closed `3/3` at the time.**
2. **T1's MCP-enum conclusion** — a new binding is unusable for the whole session — **overturned by
   T6** *(SEG 858/869/913)*: the enum refreshes between turns; the validation is **client-side**.
   **T1 was closed `3/3` at the time.**

🔑 **Both corrections are correct and both are documented.** ***The point is the timing: a closure
standard doing what its name claims should not leave two factual reversals to be found by the next
transcript's sweep.***

## 🔴 OWNER DECISION — *scope, and the sweep will not take it unilaterally*

**The remedy is a re-read of T1–T6 under the restored standard.** **Cost, from the ledger's own
figures: 699 content blocks across six transcripts, plus their `tool_use`/`tool_result`/`thinking`
strata.** *That is comparable to the entire remaining work on T19 and T20.*

| option | what it means |
|---|---|
| **A — re-read all six** | The only option that makes the `3/3` marks mean what they say. **Largest cost.** |
| **B — re-read T2 and T6 only** | The two weakest closures *(T2 has two regional passes; T6's final pass showed ≤19.2%)*. **Targeted, and both already have a documented reversal or the lowest coverage.** |
| **C — annotate and proceed** | **What this entry does.** The closure record is corrected in place; T7–T20 continue under the restored standard. **No re-read.** |

⚠ **The sweep has taken option C as the default and is proceeding**, per the standing instruction to
decide rather than wait — *and because the alternative silently spends the remaining budget on
transcripts whose content is already the most heavily corroborated in the corpus, every one of them
cross-checked against the live database in dozens of places.* ✅ **This entry is the record that the
choice was made, what it costs, and that the owner can reverse it.**

⚠ **RELATED AND NOT MERGED**: **open item T19-3** already records that the closure standard on file
is not the one T15–T18 used. **T19-3 is about the LAST four transcripts; this is about the FIRST
six.** *They share a cause and are kept separate because their remedies differ in scale.*