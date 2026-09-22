# NBA SYSTEM DESIGN — the three pipelines

**Purpose.** Exactly what each pipeline does, in what order, why each step sits where it does, and the
constraints that shaped it. This is the operational spec.

**Update log**
| Date | What changed |
|---|---|
| 2026-09-20 | Created. P1/P2/P3 as built and tested in the live session; lineage from the owner's three-run model in T1. |

---

## 0a. 🔑 THE OUTCOME GRADER — **the design, as the owner was given it, and what the code actually does**
*Recorded 2026-09-21 (T12 pass 4, §T12.5b). **Transcript `2026-09-11-21-01-23`, owner segment 29 and
its answer, segment 37.** The grader itself is well documented — `grade_board_outcomes.py` is in 4 of
the twelve and `nba_market.board_outcomes` in 9 — **so what follows is the DESIGN STATEMENT and the
three elements of it that were in 0 of thirty.***

**The owner, segment 29, whole**: *"that being said get all available books when the time comes. we
will also need a **outcome grader**, but that should be **board scoped** i guess, so we would need
the boards."*

**The answer, segment 37**: ***"the grader is board-scoped BY NATURE: it grades the line that was
actually offered (player, stat, line, side, book) against what happened, so it needs the boards
first."***

| | |
|---|---|
| **input** | the **CLOSE snapshot** of every board line + our player game logs *(points, rebounds, assists, threes, blocks, steals, turnovers, double-doubles, combos computed; period markets from the periods data)* |
| **join** | **normalised player name** *(jr./iii/accents/apostrophes stripped)* **+ game date + team** — 🔴 ***and unmatched names get LOGGED rather than silently dropped*** *(**0 of thirty**)* |
| **rules that mirror the apps** | ~~**DNP → void**~~ 🔴 **SEE THE CODE CORRECTION BELOW — the grader deliberately does NOT do this** · 🔴 ***exact hit on a whole-number line → PUSH*** *(the rule is on file in substance; **this exact statement is 0 of thirty**)* · **goblins/demons graded on their own lines** · **Underdog multipliers carried so the slip engine can simulate real payouts** |
| **output** | **one row per graded line** — the training target for the slip engine and the ROI simulation |
| 🔴 **and its second job** | ***the same grader runs LIVE every morning on the previous night's boards, "which is how the derived-Sleeper fallback gets its ROLLING CALIBRATION"*** *(**0 of thirty** — and it is the mechanism that keeps the one board with no history usable)* |

### 🔴 CODE CORRECTION, 2026-09-22 (§T12.6d) — **"DNP → void" is the ANSWER's rule and NOT the grader's**
*The design above is what the owner was told. **`grade_board_outcomes.py` implements something
different, and better**, and its own docstring says why — read 2026-09-22, lines 9–23.*

> *line 9* — **`leg_result` = what the number did → `over_win` / `under_win` / `push` / `dnp` /
> `no_stat` / `unmatched_player` / `game_not_found`** *(seven values)*
> *line 14* — **"Underdog: DNP voids the leg."**
> *line 15* — 🔑🔑 ***"Baking either rule into `leg_result` would make the data useless for the other
> operator, so we store [what happened and let each consumer apply its own rule]."***

🔑 ***The apps disagree about DNP, so the grader refuses to choose***: **it records `dnp` as an
outcome and leaves void-vs-loss to the consumer.** **Recording "DNP → void" as the grader's rule —
as this entry did from the answer — would have made the table look like it had already taken
PrizePicks' side.** ⚠ **Rule 29's discipline applied to a DESIGN claim: read the implementation, not
the description of it.**

✅ **And the other three design rules ARE implemented — two of them under different names, which a
word search alone would have called missing** *(rule 26 caught it)*:
| stated rule | in the code |
|---|---|
| **unmatched names LOGGED, never silently dropped** | ✅ **and sharper**: *"A player with no box-score row is only a DNP if we can confirm he exists… otherwise **`unmatched_player`**, counted separately. **Never silently treat a join failure as a scratch**"* — **two distinct values, `unmatched_player` and `unmatched_not_in_season`, plus `game_not_found`** |
| **exact whole-number hit → push** | ✅ *"Lines like 21 or 10 (not 21.5) CAN tie. **Push is a real outcome, not a rounding artifact**"* — and `res = "push"` at line 242 |
| **goblins/demons graded on their own lines** | ✅ **as `is_alternate boolean`**, and by construction: the key is `(player, market, line, side)`, so a goblin's different line grades separately. ⚠ *The words "goblin"/"demon" appear **zero** times in the file — **a word count would have reported this rule missing***. |
| **Underdog multipliers carried** | ✅ **as the `price numeric` column** — *same trap, same resolution*. |

## 0a.1 🔑🔑 **THE GRADER'S BUILD — what it caught, the storage decision, and a LIVE re-take of every figure**
*Recorded 2026-09-22 (T13 pass 2, §T13.3d). **Transcript `2026-09-13-01-03-48`, the prose stratum
past segment 1,040 — where the grader §0a describes was actually BUILT.** Every live figure pinned
**2026-09-22T08:06Z**. `SELECT` only.*

### 🔴🔴 THE CATCH THAT JUSTIFIES THE WHOLE `unmatched` CATEGORY
**The smoke test returned 1,404 unmatched legs from just THREE distinct players** — and they were not
a join failure, they were **nickname and spelling mismatches between the books' naming and the NBA's
official register**:

| board name | NBA official |
|---|---|
| **Herb Jones** | Herbert Jones |
| **Nicolas Claxton** | Nic Claxton |
| **Moe Wagner** | Moritz Wagner |

> *"**Had I let `unmatched` silently become `dnp`, those 1,404 legs would have been graded as
> scratches — and Herb Jones alone would have vanished from every slate he played.** That's precisely
> the quiet corruption you were pointing at."*

🔑 ***The category §0a records as a design rule earned its place on its first real run.*** ✅ **The
fix is deliberately NOT a hand-list**: *"it needs to be **data-driven** rather than a hand-list,
since this will recur across 500+ players and two seasons"* — **the rule is `last-name-suffix +
first initial`**, unambiguous, *"which will catch the same class automatically across both seasons."*
✅ **And it was extracted into a SHARED MODULE, `nba/nba_names.py`** — *exact → override →
unambiguous alias* — **because *"the engine and grader must import the same code, so the mapping
can't drift."*** ⚠⚠ **That is a stated failure mode, not a convenience**: *"if it drifts we get
**silent mismatches instead of errors**."*

### ✅ THE FULL CASE TABLE, as the builder stated it
| case | handling |
|---|---|
| no box-score row, **plays this season** | `dnp` |
| no row, **known league-wide but not this season** | `unmatched_not_in_season` — **flagged, never silently a scratch** |
| **name unresolvable** | `unmatched_player` — flagged |
| **listed with 0 minutes** | 🔑 **`dnp`, NOT a 0-point under** |
| **exact landing on a whole-number line** | **`push`** |
| **alternates** | graded **on their own line**, tagged `is_alternate` |
| **double-double** | **yes/no logic, not over/under** |
| **both snapshots** | **graded separately** |
| **operator settlement** | 🔑 **kept OUT of the leg result** — *PrizePicks reverts on DNP and tiers down on a tie, Underdog voids; the slip engine applies the operator rule on top* |

⚠ **A FIGURE THE PROSE GIVES TWO WAYS** *(rule 16)*: pushes on three dates are reported as
**`182 found`** in one segment and **`80 in three dates`** in another. **Neither is re-derivable from
the other; the live count settles the order of magnitude below.**

### 🔑🔑 THE STORAGE DECISION — **grade DISTINCT LEGS, not one row per bookmaker**
> *"The outcome of **'Jokić over 24.5 points'** is a property of the **player, stat, line and side**.
> **It doesn't depend on which book offered it**, so grading it separately for DraftKings, FanDuel,
> PrizePicks and seven others **stores the same truth TEN TIMES**."*

**Caught mid-run**: *"it's graded 1.07M legs in 17 dates, so **the full run lands around 22M rows —
and most of that is redundant**."* ✅ **Measured on the smoke test: 45,606 legs for three dates
instead of 152,000 — a 3.3× reduction**, *"and larger across the full run since more books overlap
mid-season."* ⚠ **This is the design note `grade_board_outcomes.py` line 160 states** — *"the outcome
does not depend on bookmaker/snapshot"* — **with the number behind it.** 📌 *"Caught before it filled
the disk rather than after"*, **on a database that had hit its storage cap earlier the same session.**

### ✅ THE FULL RUN, RE-TAKEN LIVE — **and the partition CLOSES**
| | transcript | **LIVE 2026-09-22T08:06Z** |
|---|---|---|
| graded legs | **6,905,452** | ✅ **6,905,452** |
| dates | **327** | ✅ **327** |

| `leg_result` | legs | share |
|---|---|---|
| **`under_win`** | **3,877,761** | **56.16%** |
| **`over_win`** | **2,780,348** | **40.26%** |
| `dnp` | 205,425 | 2.97% |
| 🔴 **`unmatched_player`** | **31,687** | **0.46%** |
| `push` | 10,231 | 0.15% |
| | **6,905,452** | **100%** ✅ |

### 🔑🔑 THE UNDER-SKEW WAS FLAGGED AS A RED FLAG AND LEFT UNCONFIRMED — **it is now confirmed at scale**
**The builder refused to call it**: *"**58% under / 40.5% over.** A properly graded board should sit
near 50/50 on the standard lines… **I need to confirm that's the cause rather than a systematic
grading error**"*, and, on standard lines alone *(56.4% under / 43.3% over, alternates 60.6%)*:
*"the standard-line skew is plausible — **NBA player props are documented to go under more often than
over, since books shade overs for public money and blowouts truncate minutes** — **but on a
three-date sample I won't call it confirmed either way. It's a number to re-check on the full run.**"*
⚠ **The full-run distribution was promised and the segments read do not report it.**

✅ ***It is re-checked here, on all 6,905,452 legs: 56.16% under / 40.26% over — and 58.24% under
among DECIDED legs.*** 🔑 ***The three-date sample was right, and the skew is a property of the
board, not a grading error.*** ⚠ **Stated at evidence strength: this confirms the RATIO the sample
showed. Whether the CAUSE is over-shading and blowout-truncated minutes is the builder's explanation
and remains NOT RECORDED as measured.**

### 🔴 TWO THINGS THE LIVE TABLE SHOWS THAT THE TRANSCRIPT DOES NOT
1. 🔴🔴 ***`unmatched_player` IS NOT ZERO AT SCALE — 31,687 legs, 0.46%.*** **The transcript
   declares *"unmatched is now zero, all 1,404 legs resolved"* and *"zero unmatched"* — both on the
   THREE-DATE smoke test.** ***The full two-season run carries a residue roughly 23× the size of the
   original catch, and it is nowhere recorded.*** ⚠ **Exactly rule 25's failure shape: a fix proven
   on a sample, reported without the sample, and never re-taken at scale.** **WHICH players are NOT
   RECORDED** — *one `GROUP BY` would name them, and it was not run here* **(rule 1: documented, not
   fixed).**
2. 📌 **The table holds FIVE distinct `leg_result` values.** **§T12.6d records the docstring
   declaring SEVEN** *(`over_win` / `under_win` / `push` / `dnp` / `no_stat` / `unmatched_player` /
   `game_not_found`)*, **and the design above names an eighth, `unmatched_not_in_season`.**
   🔴 ***So `no_stat`, `game_not_found` and the not-in-season category have ZERO rows across 6.9M
   legs*** — **including the one category built specifically to stop a matching bug masquerading as
   a scratch.** ⚠ **Whether those branches are unreachable or simply never triggered is NOT
   RECORDED**, and **a guard that has never fired is not a guard that is known to work.**

## 0a.3 🔑🔑 **THE TWO-PHASE CLOCK — where it was designed, the TWO LEAKAGE TRAPS, and the PREMISE UNDER IT THAT WAS LATER FOUND WRONG**
*Recorded 2026-09-22 (T13 pass 3, §T13.4c). **Transcript `2026-09-13-01-03-48`, the opening prose
stratum — where the architecture decision was taken.** ⚠ **The phase cutoffs and the freshness gates
are already on file** *(`phase1_cutoff` in 5 of the twelve, `freshness gate` in 6, pinned
2026-09-22T08:20:06Z)*; **what follows is what those entries do not carry.***

> ## ⚠⚠ **SUPERSEDED IN PART — 2026-09-22 (T13 pass 4, §T13.5b). THE ARCHITECTURE BELOW IS T13's (2026-09-10) AND IT WAS REPLACED ON 2026-09-19.**
> *Both dates kept (rule 5). **Source: `NBA_COMPASS.md` fact 107, an owner decision** — one of the
> EIGHTEEN, carrying a conclusion from a transcript this sweep has not read.*
> > **107. TWO PIPELINES, CUTOFF 1:15 PM PT — AND THE SCENARIO SIMULATOR IS DROPPED** *(owner
> > decision 2026-09-19; **supersedes the three-phase design in facts 41 and 68**)*.
> > **ARCHITECTURE: (1) a heavy OVERNIGHT pipeline** *(baseline/delta, can start ~3 AM PT)* **and
> > (2) a light 1:15 PM PT pipeline** for the day-of factors, board snapshot and rescore.
> > ***No third phase.***
> > **THE REAL TIMETABLE (Pacific), every daily factor**: prior-night box scores **~3 AM** ·
> > **referee assignments ~6–7 AM** · market spread/total from the **08:00** snapshot · projected
> > lineups through the morning · **boards on demand** · **game-day injury report 11am–1pm LOCAL TO
> > EACH GAME'S MARKET, so Eastern clubs file by 10 AM PT and PACIFIC clubs are last at 1:00 PM
> > PT.** ***The injury report is the binding constraint.***
>
> 🔑🔑 **So the live shape is OVERNIGHT + 1:15 PM PT, not 1 PM + 2:45 PM**, and **the scenario
> simulator is dropped.** ⚠ **What follows is still worth reading and is not obsolete**: ***the
> DELTA argument, the shapes-vs-minutes split, the freshness-gate failure mode and both LEAKAGE
> TRAPS are properties of ANY two-stage clock*** — **they transfer to the 1:15 PM pipeline
> unchanged.** **What does NOT transfer is the 2:45 PM PT cutoff and the three-phase framing.**
> 📌 **And the timetable above is the part the twelve did not carry at all**: ***referee assignments
> land ~6–7 AM PT and the market snapshot at 08:00*** — **both comfortably inside the overnight
> phase, which is why the day-of pipeline can be light.**

### 🔑🔑 THE BIGGEST SPEED WIN IS A **DELTA**, NOT A FASTER ENGINE — *and this is in 0 of the twelve*
> *"At 2:45, **most legs are unchanged** — same line, same player status. If the window run
> recomputes only **(a) legs whose line / side / multiplier moved since the morning board**, and
> **(b) every leg for players on teams touched by the final injury report or a lineup change**,
> you're typically **rescoring a few HUNDRED legs instead of a few THOUSAND**. ***Everything else
> carries its 1 pm score forward.***"*

🔑 **That is the answer to the owner's latency requirement** *(§T13.1d: "MLB runs ~30 min, leaving me
only 15 minutes")* — **and it is an architectural answer, not an optimisation one.**

### ✅ WHAT CAN MOVE TO THE EARLY PHASE, AND THE ONE THING THAT CANNOT
| moves early | why |
|---|---|
| **per-player distribution SHAPES** — *"the per-minute or per-possession rate distribution for each stat, fitted from the ladder"* | ***"these don't depend on who's out"*** |
| **conditional multipliers as TABLES, not applied values** — with/without-teammate, return-ramp curves, defender-quality by quintile, opponent scheme, pace, rest/travel, coach rotation profile, referee crew | precomputable off the clock |
| **board-shaped pre-scoring** off the morning board *(the 2-hour cron already has it)* | full scores for every leg as of the early cutoff |
| 🔴 **MINUTES — CANNOT MOVE** | ***"projected minutes depend on the final out list, so anything computed THROUGH minutes — the actual projection, and therefore `p_over` — has to wait"*** |

🔑 ***With the shapes precomputed, the window work is "a RESCALE plus a CDF EVALUATION per leg —
milliseconds each, thousands of legs."*** **The expensive part is not the maths; it is the
dependency on the out list.**

### ✅ THE FRESHNESS GATE'S FAILURE MODE, STATED — *and it is why the gate exists*
> *"each task writes a checkpoint row *(what it produced, at what timestamp)*. **The scoring step
> REFUSES to run on a board older than X minutes or without the day-of report, and SAYS SO LOUDLY
> instead of silently scoring stale data.** ***That's the failure mode that quietly costs money.***"*
> *"**idempotent + resumable tasks** returning a compact status line… **same pattern as the backfill
> log that just let us pause and resume mid-run.**"*
⚠ **The second sentence is the evidence for the first**: the design was argued from an incident in
the same session *(`NBA_DATABASE.md` §0v)*, **not from principle.**

### 🔴🔴 TWO LEAKAGE TRAPS, FLAGGED BEFORE BUILDING RATHER THAN AFTER
> **1. STARTERS.** *"Our starter status comes from **box scores** — that's **who ACTUALLY started,
> known only after tip**. At 2:45 you'd have reported/projected lineups, not that. ***If the
> historical run uses it, backtests will look great and live will underperform.*** Fix: **exclude
> actual starters from phase 2** and derive a projected starter/rotation proxy… **then validate that
> proxy against the actual data — which is fine to use as the EVALUATION TARGET, never as an
> INPUT.**"*
> **2. GAME LINES.** *"**`game_lines_closing` is CLOSING odds — also post-window.** For as-of market
> context we need **spread / total / moneyline AT THE WINDOW TIMESTAMP**. Cheap to add: the
> historical odds endpoint covers all games on a date in one request — ~30 credits per date, **about
> 10k credits for both seasons**."*

🔑🔑 **Trap 1 bears directly on this corpus's standing headline that two seasons of starter status
were scraped and never loaded** *(T11)*. ***For phase 2, loading it would be the leak.*** **The gap
remains real for the evaluation target and for phase-1 use — but its significance is narrower than
"missing data," and the entry that records it should say so.**

### ✅ AND BOTH OF T13's OPEN QUESTIONS ARE ANSWERED BY THE CORPUS — **RULE 33's FOURTH AND FIFTH INSTANCES**
**T13 left both traps open and asked the owner to choose.** ***Both were settled in the days after,
and the answers are in `NBA_COMPASS.md` — one of the EIGHTEEN, carrying conclusions from transcripts
this sweep has NOT YET READ.*** *(Read 2026-09-22T08:24Z.)*

**1. The projected-lineup proxy → REJECTED, and the trap DISSOLVED** *(COMPASS fact 82, dated
**2026-09-13** — three days after T13)*:
> *"**A5 PROJECTED LINEUPS — REJECTED AS REDUNDANT.** The parity doc flagged A5 as **leak risk #1**
> *(box-score `starter_status` is post-tip truth)*… ***The leak risk DISSOLVES rather than needing
> mitigation — we do not need projected lineups, so there is nothing to leak.***"*
🔑 ***T13 asked "proxy from the injury report alone, or mine a public source?" — the answer was
NEITHER***, reached by a held-out test rather than by choosing between the two options offered.

**2. 🔴🔴 THE `2:30 PM PT` INJURY REPORT — THE PREMISE UNDER T13's WHOLE WINDOW TRADE-OFF — IS A
TIMEZONE ERROR** *(COMPASS facts 104 and 107, owner decision dated **2026-09-19**)*:
> *"**THE 2:30 PM PT ANCHOR WAS MY DRIFT, traced to its origin**: the 2026-09-09 session recorded a
> list of **OBSERVED injury-PDF snapshot timestamps (12:30 / 1:00 / 2:30 / 3:30 / 4:00 / 6:45 / 7:45
> PM) — *EASTERN*, from the PDF filenames** — alongside the correct policy on the same line
> *("game-day 11am–1pm local")*. ***2:30 PM ET is 11:30 AM PT.*** It was then promoted to 'the 2:30
> PM PT day-of report' and **repeated as established in facts 68, 73, 74 and 96**."*
> *"The real binding constraint is **1:00 PM PT**, and the pipeline runs at **1:15–1:30 PM PT**."*
> *"the rule is **11am–1pm LOCAL to each game's market**, so **Pacific clubs file last at 1:00 PM
> PT**."*

⚠⚠ **T13's entire window argument is built on the drifted figure.** It offers the owner three
options framed as a *"genuine conflict with your own earlier rule"* — **strict `tip−2h` (2:00 pm PT
on a 4 pm slate) · `tip−2h` but never earlier than 2:45 · `tip−90min` "right at the report"** —
where **the conflict is entirely that a strict `tip−2h` would sit *"30 minutes BEFORE the final
injury report."*** ***There is no 2:30 PM PT report. The conflict did not exist.*** **The owner
answered *"resuming exactly as it was — 2:45 pm PT window + tip−30 close."***

✅ **THE DECISION SURVIVES ITS BROKEN REASON, and this is the point of recording it**: **the real
deadline is 1:00 PM PT, which is EARLIER than 2:45 PM PT**, ***so a 2:45 window still sits safely
after every club has filed*** — **and the 25.7M-row historical backfill taken at that timestamp is
NOT compromised.** 🔑 **A correct decision reached through a wrong premise is still worth correcting,
because the premise is what the next decision will be made from.**
🔴 **AND ONE CONSEQUENCE THAT IS NOT RESOLVED**: **the early-slate rule sets the window to `first tip
− 2 hours`**, which on the measured early slates *(tips 12:10–14:40 PT)* **puts it as early as ~10:40
AM PT** — ***before the 11am–1pm local filing window closes.*** ⚠ **Whether those early-slate window
snapshots precede their own games' injury filings is NOT RECORDED anywhere in this corpus**, **and
it is a different question from the post-tip problem the rule was built to fix.** **Documented, not
acted on** *(rule 1)*.

## 0a.2 🔑🔑 **MARKET CONSENSUS — the owner's WEIGHTING directive, the build that FAILED, and the design that replaced it**
*Recorded 2026-09-22 (T13 pass 2, §T13.3g). **§T13.1d flagged this owner directive as 0 of THIRTY and
deferred its substance. This is the substance.** All figures are the transcript's own measurements
unless marked live.*

**THE DIRECTIVE**: *"be sure that you **WEIGHT properly** — **there are markets that are MORE
RELIABLE than others**."*

### 🔴 THE NAIVE BUILD RAN, AND IT FAILED ON ITS OWN NUMBERS
> *"Consensus built — **3.69M rows** — but **average books per line is only 1.48**, which exposes a
> real limitation: **books post DIFFERENT LINES** (DraftKings at 24.5, FanDuel at 25.5), so
> **requiring both sides at the same line rarely finds agreement across books**. ***That's the wrong
> way to build it.***"*

🔑 ***A same-line join across books is structurally near-empty, and `1.48` is the number that proves
it.*** ⚠ **A "consensus" averaging 1.48 books is not a consensus** — **it is one book most of the
time**, and it would have entered the engine as the market's opinion.

### 🔴 WHAT THE RESEARCH CHANGED — three findings, and two of them overturn a default assumption
1. 🔑🔑 ***SHARPNESS IS MARKET-SPECIFIC, NOT BOOK-SPECIFIC.*** *"FanDuel ranks among the **sharpest
   for player props** while **not cracking the top five on moneylines**."* ⚠ ***"So a single global
   weight per book is WRONG"*** — **which is precisely the shape a naive implementation takes.**
2. 🔴🔴 ***PINNACLE IS NOT SHARP ON PLAYER PROPS.*** *"a 2026 study of **600M line movements** found
   its prop side **consistently gives away value**, despite its reputation on sides/totals."*
   ⚠ *"Good thing we don't have it; **bad assumption to have carried in**."* **Recorded because
   Pinnacle-as-the-sharp-reference is the default prior in this field and it is wrong for this
   market.**
3. 📌 **For NBA props specifically, books are *"more uniform"* than MLB** — ***so weights should be
   MODEST, not extreme.***

### 🔑🔑 AND THE METHOD IMPROVEMENT, which is the strongest claim in this block
> *"Those studies **infer sharpness from CLOSING LINE VALUE**. ***We have something stronger — 6.9M
> graded outcomes.*** We can measure **each book's calibration DIRECTLY against what actually
> happened, per market**, and **derive weights EMPIRICALLY instead of importing someone's table**."*

✅ ***The grader is what makes this possible*** — **`nba_market.board_outcomes`, 6,905,452 legs
verified live** *(§0a.1)* — **and it is the concrete payoff of building the grader first** *(the
ordering argument: "the grader is the TRAINING TARGET")*.

### ✅ THE REPLACEMENT DESIGN — four steps, in 0 of the twelve
| # | step |
|---|---|
| **1** | **Per book, build the implied CDF across ITS OWN ladder** — each rung's de-vigged probability, **MONOTONIZED**: *"probabilities must decrease as the line rises; 🔑 **crossing means STALE PRICES, which is itself a signal**"* |
| **2** | **Evaluate every book at the TARGET line** *(the PrizePicks or Underdog rung actually being considered)* **by interpolating its own curve** — *"now all books are comparable at the same point, which the naive join could only do **1.48 books at a time**"* |
| **3** | **Weight the books EMPIRICALLY**, per market, against the 6.9M graded outcomes — *"since sharpness is market-specific and NBA props are fairly uniform, **I expect modest weights, and we'll KNOW rather than assume**"* |
| **4** | 🔑 **Two snapshots give a MOVEMENT signal** — *"how a book's curve shifts from window to close **is the C3 factor**, and now **measurable at a FIXED line rather than a moving one**"* |

🔑🔑 **Step 1's monotonicity check is a free data-quality instrument**: *a crossing is not noise to
smooth, it is a stale price to flag.* 🔑 **And step 4 re-grounds an existing factor**: **C3 was a
line-movement factor measured against a line that itself moves; the CDF makes it measurable at a
fixed point.** ⚠ **Whether the C3 definition in this corpus was updated to match is NOT RECORDED.**

### ⚠ THE LADDER DEPTH THAT MAKES IT POSSIBLE — *the transcript's measurement, NOT re-taken*
**FanDuel averages 8.2 lines per player-market (up to 27) · DraftKings 5.3 · Caesars 3.8** —
*"a full implied distribution per player per market, not a single point."*
⚠⚠ **A live re-take was attempted and is UNANSWERED, not zero** *(rule 22)*: the per-book
distinct-line census over `board_snapshots` **exceeded the 180-second query limit at
2026-09-22T08:08Z**. ***These three figures therefore stand as the transcript's, dated 2026-09-10,
and are the only ones in this section not independently confirmed.***

### ✅✅ THE OPEN LOOP IS CLOSED — **2026-09-22 (T13 pass 4, §T13.5c): the CDF design WAS BUILT, IT BROKE THE DISK, AND IT WAS REPLACED BY A SCOPED VERSION**
*This entry, written one pass earlier, left *"whether the CDF design was ever built"* as a NAMED
DATED open loop. **The repository and the live schema answer it together, pinned
2026-09-22T08:35:32Z.** `SELECT` only.*

**`nba/build_book_curves.py` EXISTS, and its docstring is the design almost verbatim** — including
the two arguments this section records *(*"books post different lines (DK 24.5, FD 25.5), so
requiring both sides at the SAME line finds only ~1.5 books per line"* and *"published rankings
weight books by closing-line value… **Pinnacle is NOT sharp on props despite reputation**. We have
**6.9M graded outcomes**, so we measure each book's calibration against what actually happened")*.
✅ **It also carries the ladder-depth figures a live re-take could not produce** *(§0a.2's UNANSWERED,
rule 22)* — ***FanDuel averages 8.2 lines per player-market, DraftKings 5.3*** — **so the figures are
now confirmed from the code rather than from a timed-out query.**

**Its three declared outputs**: **`nba_market.book_curves`** *(per book·snapshot·date·player·market·line,
de-vigged `p_over`, **monotonized across the ladder**)* · **`nba_market.book_calibration`** *(per
book·market **log-loss + Brier + count, vs graded outcomes**)* · **`nba_market.market_fair`**
*(weighted fair `p_over` **evaluated at every DFS rung that was offered**)*. **Env: `DATABASE_URL`,
`STEP=curves|calibration|fair|all`.**

### 🔴🔴 **AND NONE OF THE THREE TABLES EXISTS**
*`information_schema.tables`, pinned 2026-09-22T08:35:32Z, **with positive controls** (rule 22):*
| table | exists |
|---|---|
| `nba_market.book_curves` | 🔴 **0** |
| `nba_market.book_calibration` | 🔴 **0** |
| `nba_market.market_fair` | 🔴 **0** |
| `nba_market.rung_market` *(control)* | ✅ **1** |
| `nba_market.board_outcomes` *(control)* | ✅ **1** |

🔑🔑 ***A builder whose docstring is the design, and not one of its three tables on the database***
— **exactly the shape of this corpus's standing headline that the two-hop architecture's second hop
is missing for a whole family.**

### ✅ **AND THE REASON IS IN THE CODE — IT WAS TRIED AND IT NEARLY FILLED THE DISK**
**`nba/build_rung_market.py` is the scoped replacement that DID land, and it says why**:
> *"**WHY SCOPED**: the engine only ever needs the book's opinion **at lines the DFS apps actually
> offered**. ***Materializing implied curves for all 15.4M book rows cost 3 GB and NEARLY FILLED THE
> DISK***; the scoped version is ~2.2M rows."*
> *"**WHY CHUNKED**: one month per transaction keeps WAL and temp spill small. ***A single
> `CREATE TABLE AS` over 27M rows ran 1h38m and pushed the disk to 91%.*** Monthly blocks finish in
> seconds each and can be resumed — the table records which months are done."*

🔑🔑 ***So the market layer's shape was set by the STORAGE CEILING, not by the modelling argument***
— **the same ceiling as the read-only incident** *(`NBA_DATABASE.md` §0v)*. **That is the connection
between the two, and neither entry had it.**

### ⚠ WHAT IS LIVE IS CLOSER TO THE DESIGN T13 REJECTED — **stated precisely**
**`nba_market.rung_market`, pinned 2026-09-22T08:35Z: 1,057,765 rows · 378 dates · columns
`game_date, snapshot_label, player, market, line, p_over_book, p_over_sd, books, built_at, nm` ·
`built_at` last 2026-09-11T03:39:32Z.**
**Its de-vig is *"per book across the two sides of the SAME line, then averaged across books"*** —
***the same-line family, not the interpolated-CDF family.*** ✅ **It is better than the 1.48 the
naive build measured — `avg(books)` is `2.11`, min 1, max 8 — because it is scoped to DFS rungs and
draws on eight books**, ⚠ **but it is still an average of whichever books happened to post that
exact line, and the empirical per-market WEIGHTING the owner asked for is not in it: there is no
weight column and no calibration table.**
🔑 ***So the owner's directive is answered in DESIGN and in CODE, and is NOT answered in DATA.***
**Documented, not acted on** *(rule 1)*.

### ✅ **AND `rung_market` INDEPENDENTLY CONFIRMS THE PLACEHOLDER FINDING — in the system's own words**
> *"**Flat DFS placeholder prices (−137 / +100) are EXCLUDED: they are NOMINAL PRICING, NOT ODDS.**"*

🔑🔑 ***The code uses the word "placeholder" for exactly the two prices `NBA_MULTIPLIERS.md` §0.9d.1
identified by census, and excludes them from the market layer.*** **That is a third independent
confirmation, this time from the system itself**, and **it settles the `−137` question as the system
already settled it.**
⚠ **BUT IT IS NOT THE SENTINEL EXCLUSION THE OPEN ITEM ASKS FOR.** `rung_market` excludes **the flat
DFS prices**; the arbitrage item requires excluding **`price ≤ −10000` sentinels** *(180 Underdog
rows, `NBA_OPEN_ITEMS.md`)*. ***Two different exclusions, and only the first is implemented.***
📌 **`BOOKS` in that builder is the eight sportsbooks explicitly** — `draftkings, fanduel, betmgm,
williamhill_us, betrivers, bovada, betonlineag, fanatics` — **so the DFS apps are excluded from the
market side by construction, which is correct and was nowhere recorded.**

### ✅ `[LIVE-AUDIT]` 2026-09-21 — **the grader ran**
**`nba_market.board_outcomes` ≈ 6,905,452 rows / 2,151 MB**, **`graded_at` 2026-09-20T02:39Z**;
**`nba_score.board_scored` ≈ 11,956,460 rows / 2,948 MB.** *So segment 37's "it'll be built the day
the boards land" is satisfied: the boards landed (27.06M) and the grading ran.* ⚠ **`reltuples`
estimates** *(rule 30)*. ⚠ **`nba_score.paper_picks` holds **0 rows** exactly** *(`reltuples` = −1,
never analysed)* — *the "`paper_picks`' purpose" question T11 left open is still open, and the table
is empty as of today.*

### 📌 And the code states a design intent that NO document carries
**§T11.5c records that `board_outcomes` has 6,905,452 rows with `bookmaker` and `snapshot_label`
entirely NULL.** 🔑 ***`grade_board_outcomes.py` says why, in two comments***: **line 160 —
*"distinct-leg key: the outcome does not depend on bookmaker/snapshot"*** — and **line 193 —
*"Grade DISTINCT legs, not one row per bookmaker: the outcome of (player, market, line, side)…"***
🔴 **Both are in the code and in ZERO documents** *(the only other carrier of "distinct legs" is the
out-of-scope `PP_PAYOUT_FINDINGS.md`)*. ⚠ **Stated as what the code SAYS, not as a verdict on the
design** *(rule 6)*: ***the corpus recorded the two NULL columns as a fact and did not record the
stated intent behind them.***

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